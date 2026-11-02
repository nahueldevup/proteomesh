"""
Repositorio global de APKs (WEB-017)
====================================
Almacena APKs firmados en un directorio plano nombrado por sha256, con índice
SQLite en instances/apks.db. Soporta subida en streaming, detección de
duplicados, extracción de metadatos con aapt2 e instalación en instancias
activas con concurrencia limitada.
"""
import asyncio
import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from server.config import (
    APK_REPO_DIR,
    APKS_DB_PATH,
    APK_MAX_SIZE_BYTES,
    INSTANCES_DIR,
    resolve_aapt2_path,
)


class ApkRepositoryError(Exception):
    """Errores del repositorio de APKs."""


class ApkTooLargeError(ApkRepositoryError):
    """El APK excede el tamaño permitido."""


class DuplicateApkError(ApkRepositoryError):
    """Ya existe un APK con el mismo sha256."""


class InvalidApkError(ApkRepositoryError):
    """El archivo no es un APK válido."""


class Aapt2NotFoundError(ApkRepositoryError):
    """aapt2 no está disponible."""


class ApkRepository:
    def __init__(
        self,
        repo_dir: Optional[Path] = None,
        db_path: Optional[Path] = None,
        max_size: int = APK_MAX_SIZE_BYTES,
    ):
        self.repo_dir = repo_dir or APK_REPO_DIR
        self.db_path = db_path or APKS_DB_PATH
        self.max_size = max_size
        self.tmp_dir = self.repo_dir / ".tmp"
        self.tmp_dir.mkdir(parents=True, exist_ok=True)
        self.repo_dir.mkdir(parents=True, exist_ok=True)
        self._init_db()
        try:
            os.chmod(self.db_path, 0o600)
        except OSError:
            pass

    def _get_connection(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

    def _init_db(self) -> None:
        with self._get_connection() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS apks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sha256 TEXT NOT NULL UNIQUE,
                    original_name TEXT NOT NULL,
                    package TEXT,
                    version_name TEXT,
                    version_code INTEGER,
                    size INTEGER NOT NULL,
                    is_default INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_apks_sha256 ON apks(sha256);
                CREATE INDEX IF NOT EXISTS idx_apks_default ON apks(is_default);
                """
            )

    @staticmethod
    def _extract_badging(tmp_path: Path) -> Tuple[str, str, int]:
        """Ejecuta aapt2 dump badging y devuelve (package, versionName, versionCode)."""
        aapt2_path = resolve_aapt2_path()
        res = subprocess.run(
            [str(aapt2_path), "dump", "badging", str(tmp_path)],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if res.returncode != 0:
            raise InvalidApkError(f"aapt2 no pudo leer el APK: {res.stderr.strip()}")

        package_match = re.search(
            r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'",
            res.stdout,
        )
        if not package_match:
            raise InvalidApkError("No se pudo extraer el package del APK")

        return package_match.group(1), package_match.group(3), int(package_match.group(2))

    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "sha256": row["sha256"],
            "original_name": row["original_name"],
            "package": row["package"],
            "version_name": row["version_name"],
            "version_code": row["version_code"],
            "size": row["size"],
            "is_default": bool(row["is_default"]),
            "created_at": row["created_at"],
        }

    def list_apks(self) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cur = conn.execute("SELECT * FROM apks ORDER BY created_at DESC")
            return [self._row_to_dict(r) for r in cur.fetchall()]

    def get_apk(self, apk_id: int) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cur = conn.execute("SELECT * FROM apks WHERE id = ?", (apk_id,))
            row = cur.fetchone()
            return self._row_to_dict(row) if row else None

    def get_apk_path(self, sha256: str) -> Path:
        return self.repo_dir / f"{sha256}.apk"

    def get_default_apk_ids(self) -> List[int]:
        with self._get_connection() as conn:
            cur = conn.execute("SELECT id FROM apks WHERE is_default = 1 ORDER BY id")
            return [r["id"] for r in cur.fetchall()]

    def upload_apk(self, filename: str, file_stream) -> Dict[str, Any]:
        """
        Recibe un file-like iterable de chunks, valida y guarda el APK.

        Raises:
            ApkTooLargeError: si se excede APK_MAX_SIZE_BYTES.
            DuplicateApkError: si el sha256 ya existe.
            InvalidApkError: si no es un APK válido.
            Aapt2NotFoundError: si no se encuentra aapt2.
        """
        try:
            resolve_aapt2_path()
        except FileNotFoundError as exc:
            raise Aapt2NotFoundError(str(exc)) from exc

        # Limpiar nombre: solo basename, sin path traversal ni bytes de control
        original_name = Path(filename).name
        if not original_name or "\x00" in original_name:
            raise InvalidApkError("Nombre de archivo inválido")
        if original_name.lower().endswith((".apks", ".xapk")):
            raise InvalidApkError("No se soportan bundles .apks ni .xapk en este ticket")

        suffix = Path(original_name).suffix or ".apk"
        tmp_fd, tmp_path_str = tempfile.mkstemp(suffix=suffix, dir=self.tmp_dir)
        tmp_path = Path(tmp_path_str)
        sha256 = hashlib.sha256()
        size = 0

        try:
            with os.fdopen(tmp_fd, "wb") as tmp_file:
                for chunk in file_stream:
                    if not chunk:
                        continue
                    size += len(chunk)
                    if size > self.max_size:
                        raise ApkTooLargeError(
                            f"El APK excede el límite de {self.max_size / (1024 * 1024):.0f} MB"
                        )
                    tmp_file.write(chunk)
                    sha256.update(chunk)

            digest = sha256.hexdigest()
            final_path = self.get_apk_path(digest)

            # Firma ZIP: los APKs válidos empiezan con "PK"
            with open(tmp_path, "rb") as f:
                header = f.read(2)
            if header != b"PK":
                raise InvalidApkError("El archivo no tiene firma ZIP de APK")

            package, version_name, version_code = self._extract_badging(tmp_path)
            now = datetime.now(timezone.utc).isoformat()

            with self._get_connection() as conn:
                try:
                    cur = conn.execute(
                        """
                        INSERT INTO apks
                        (sha256, original_name, package, version_name, version_code, size, is_default, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, 0, ?)
                        """,
                        (digest, original_name, package, version_name, version_code, size, now),
                    )
                    apk_id = cur.lastrowid
                except sqlite3.IntegrityError as exc:
                    raise DuplicateApkError("El APK ya existe en el repositorio") from exc

            # Renombrado atómico dentro del mismo sistema de archivos
            if final_path.exists():
                # Otro proceso pudo haberlo creado entre el INSERT y el rename;
                # el UNIQUE nos protege, pero nos aseguramos de no dejar duplicados.
                os.remove(tmp_path)
            else:
                os.rename(tmp_path, final_path)

            return {
                "id": apk_id,
                "sha256": digest,
                "original_name": original_name,
                "package": package,
                "version_name": version_name,
                "version_code": version_code,
                "size": size,
                "is_default": False,
                "created_at": now,
            }
        finally:
            if tmp_path.exists():
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass

    def delete_apk(self, apk_id: int) -> bool:
        with self._get_connection() as conn:
            cur = conn.execute("SELECT sha256 FROM apks WHERE id = ?", (apk_id,))
            row = cur.fetchone()
            if not row:
                return False
            sha256 = row["sha256"]
            conn.execute("DELETE FROM apks WHERE id = ?", (apk_id,))

        apk_path = self.get_apk_path(sha256)
        try:
            if apk_path.exists():
                os.remove(apk_path)
        except OSError:
            pass
        return True

    def set_default_apks(self, apk_ids: List[int]) -> int:
        """Desmarca todos, luego marca los IDs solicitados. Devuelve cuántos marcó."""
        with self._get_connection() as conn:
            conn.execute("UPDATE apks SET is_default = 0")
            if apk_ids:
                placeholders = ",".join("?" * len(apk_ids))
                cur = conn.execute(
                    f"UPDATE apks SET is_default = 1 WHERE id IN ({placeholders})",
                    tuple(apk_ids),
                )
                return cur.rowcount
            return 0

    async def install_to_instances(
        self,
        apk_path: Path,
        instance_names: List[str],
        adb_serial_func,
    ) -> List[Dict[str, Any]]:
        """
        Instala un APK en múltiples instancias con concurrencia máxima 2.

        `adb_serial_func(name)` debe devolver el serial ADB o None.
        Las instancias detenidas se reportan como 'skipped'.
        """
        if not apk_path.exists():
            raise ApkRepositoryError("APK no encontrado en disco")

        semaphore = asyncio.Semaphore(2)

        async def install_one(name: str) -> Dict[str, Any]:
            async with semaphore:
                serial = adb_serial_func(name)
                if not serial:
                    return {
                        "instance": name,
                        "ok": False,
                        "status": "failed",
                        "error": "No se pudo obtener serial ADB",
                    }

                # Verificar que la instancia está corriendo vía adb devices
                dev_res = await asyncio.create_subprocess_exec(
                    "adb", "-s", serial, "shell", "getprop", "sys.boot_completed",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await dev_res.communicate()
                boot_completed = stdout.decode().strip()
                if dev_res.returncode != 0 or boot_completed != "1":
                    return {
                        "instance": name,
                        "ok": True,
                        "status": "skipped",
                        "error": "Instancia detenida o no lista",
                    }

                proc = await asyncio.create_subprocess_exec(
                    "adb", "-s", serial, "install", "-r", str(apk_path),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await proc.communicate()
                out = stdout.decode().strip()
                err = stderr.decode().strip()

                if proc.returncode == 0 and "Success" in out:
                    return {"instance": name, "ok": True, "status": "ok", "error": None}

                # Resumir stderr para no saturar la respuesta
                error_summary = err or out
                if len(error_summary) > 500:
                    error_summary = error_summary[:500] + "..."
                return {
                    "instance": name,
                    "ok": False,
                    "status": "failed",
                    "error": error_summary,
                }

        return await asyncio.gather(*[install_one(n) for n in instance_names])


apk_repository = ApkRepository()
