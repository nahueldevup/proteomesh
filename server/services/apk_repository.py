"""
Repositorio global de APKs (WEB-017)
====================================
Almacena APKs firmados en un directorio plano nombrado por sha256, con índice
SQLite en instances/apks.db. Soporta subida en streaming, detección de
duplicados, extracción de metadatos con aapt2 e instalación en instancias
activas con concurrencia limitada.
"""
import asyncio
import contextlib
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
from typing import Any, Dict, Generator, List, Optional, Tuple, Union

from server.config import (
    APK_REPO_DIR,
    APKS_DB_PATH,
    APK_MAX_SIZE_BYTES,
    INSTANCES_DIR,
    resolve_aapt2_path,
)
from server.services.bundle_parser import (
    BundleMetadata,
    BundleParserError,
    InvalidBundleError,
    ZipBombError,
    ZipSlipSecurityError,
    inspect_split_abi,
    parse_and_extract_bundle,
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

    @contextlib.contextmanager
    def _get_connection(self) -> Generator[sqlite3.Connection, None, None]:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

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
            # Migración idempotente para soporte de bundles
            cur = conn.execute("PRAGMA table_info(apks);")
            columns = {row["name"] for row in cur.fetchall()}
            if "entry_type" not in columns:
                conn.execute("ALTER TABLE apks ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'monolithic';")
            if "bundle_format" not in columns:
                conn.execute("ALTER TABLE apks ADD COLUMN bundle_format TEXT DEFAULT NULL;")
            if "splits_info" not in columns:
                conn.execute("ALTER TABLE apks ADD COLUMN splits_info TEXT DEFAULT NULL;")

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
        splits_info_raw = row["splits_info"] if "splits_info" in row.keys() else None
        splits_info = None
        has_obb = False
        if splits_info_raw:
            try:
                splits_info = json.loads(splits_info_raw)
                has_obb = splits_info.get("has_obb", False)
            except Exception:
                splits_info = None

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
            "entry_type": row["entry_type"] if "entry_type" in row.keys() else "monolithic",
            "bundle_format": row["bundle_format"] if "bundle_format" in row.keys() else None,
            "splits_info": splits_info,
            "has_obb": has_obb,
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

    def get_apk_files(self, sha256: str) -> List[Path]:
        """
        Retorna la lista de archivos APK correspondientes al registro.
        Para un bundle: retorna todos los .apk del directorio apk_repo/<sha256>/ con base.apk primero.
        Para un monolítico: retorna [apk_repo/<sha256>.apk].
        """
        bundle_dir = self.repo_dir / sha256
        if bundle_dir.is_dir():
            apks = list(bundle_dir.glob("*.apk"))
            def _sort_base(p: Path) -> int:
                name = p.name.lower()
                if name == "base.apk":
                    return 0
                if "base" in name and not name.startswith("split_"):
                    return 1
                return 2
            return sorted(apks, key=_sort_base)

        single_apk = self.repo_dir / f"{sha256}.apk"
        if single_apk.exists():
            return [single_apk]

        return []

    def resolve_install_splits(self, sha256: str) -> List[Path]:
        """
        Resuelve la lista de archivos APK listos para instalar, aplicando filtrado de ABI:
        - Si es monolítico: retorna [apk_repo/<sha256>.apk].
        - Si es bundle:
          * Siempre incluye base.apk en primer lugar.
          * Siempre incluye splits independientes de arquitectura (recursos, densidades, idiomas).
          * Splits nativos: selecciona una única arquitectura según prioridad:
            1. x86_64
            2. arm64-v8a
            3. x86
            4. armeabi-v7a
            5. armeabi
          * Regla estricta: NUNCA enviar más de una arquitectura binaria en la misma transacción.
        """
        bundle_dir = self.repo_dir / sha256
        if not bundle_dir.is_dir():
            single_apk = self.repo_dir / f"{sha256}.apk"
            return [single_apk] if single_apk.exists() else []

        all_apks = list(bundle_dir.glob("*.apk"))
        if not all_apks:
            return []

        # Identificar base.apk
        base_file: Optional[Path] = None
        other_splits: List[Path] = []
        for p in all_apks:
            name = p.name.lower()
            if name == "base.apk" or (name.startswith("base") and not name.startswith("split_")):
                if base_file is None:
                    base_file = p
                    continue
            other_splits.append(p)

        if base_file is None and all_apks:
            base_file = all_apks[0]
            other_splits = all_apks[1:]

        # Clasificar splits por ABI
        ABI_PRIORITY = ["x86_64", "arm64-v8a", "x86", "armeabi-v7a", "armeabi"]
        non_native_splits: List[Path] = []
        native_splits_by_abi: Dict[str, List[Path]] = {abi: [] for abi in ABI_PRIORITY}

        for split in other_splits:
            abi = inspect_split_abi(split)
            if abi and abi in native_splits_by_abi:
                native_splits_by_abi[abi].append(split)
            else:
                non_native_splits.append(split)

        # Seleccionar la ABI de mayor prioridad que tenga splits disponibles
        selected_native_splits: List[Path] = []
        for abi in ABI_PRIORITY:
            if native_splits_by_abi[abi]:
                selected_native_splits = native_splits_by_abi[abi]
                break

        # Lista final: base primero, luego configs no nativos, luego splits nativos seleccionados
        final_list = [base_file] + non_native_splits + selected_native_splits
        return final_list

    def get_apk_path(self, sha256: str) -> Path:
        """
        Wrapper de compatibilidad hacia atrás que devuelve un Path principal.
        Para un bundle devuelve el base.apk (o el directorio); para un monolítico, el .apk.
        """
        bundle_dir = self.repo_dir / sha256
        if bundle_dir.is_dir():
            files = self.get_apk_files(sha256)
            if files:
                return files[0]
            return bundle_dir
        return self.repo_dir / f"{sha256}.apk"

    def get_default_apk_ids(self) -> List[int]:
        with self._get_connection() as conn:
            cur = conn.execute("SELECT id FROM apks WHERE is_default = 1 ORDER BY id")
            return [r["id"] for r in cur.fetchall()]

    def upload_apk(self, filename: str, file_stream) -> Dict[str, Any]:
        """
        Recibe un file-like iterable de chunks, valida y guarda el APK o Bundle.

        Soporta archivos monolíticos (.apk) y bundles (.apkm, .xapk, .apks, .zip).
        """
        try:
            resolve_aapt2_path()
        except FileNotFoundError as exc:
            raise Aapt2NotFoundError(str(exc)) from exc

        # Limpiar nombre: solo basename, sin path traversal ni bytes de control
        original_name = Path(filename).name
        if not original_name or "\x00" in original_name:
            raise InvalidApkError("Nombre de archivo inválido")

        allowed_extensions = (".apk", ".apkm", ".xapk", ".apks", ".zip")
        suffix = Path(original_name).suffix.lower()
        if suffix not in allowed_extensions:
            raise InvalidApkError(
                f"Formato de archivo no soportado: {suffix}. Formatos permitidos: {', '.join(allowed_extensions)}"
            )

        is_bundle = suffix in (".apkm", ".xapk", ".apks", ".zip")

        tmp_fd, tmp_path_str = tempfile.mkstemp(suffix=suffix, dir=self.tmp_dir)
        tmp_path = Path(tmp_path_str)
        sha256 = hashlib.sha256()
        size = 0
        bundle_extract_tmp: Optional[Path] = None

        try:
            with os.fdopen(tmp_fd, "wb") as tmp_file:
                for chunk in file_stream:
                    if not chunk:
                        continue
                    size += len(chunk)
                    if size > self.max_size:
                        raise ApkTooLargeError(
                            f"El archivo excede el límite de {self.max_size / (1024 * 1024):.0f} MB"
                        )
                    tmp_file.write(chunk)
                    sha256.update(chunk)

            digest = sha256.hexdigest()

            # Firma ZIP: tanto APKs como Bundles empiezan con "PK"
            with open(tmp_path, "rb") as f:
                header = f.read(2)
            if header != b"PK":
                raise InvalidApkError("El archivo no tiene firma ZIP válida")

            now = datetime.now(timezone.utc).isoformat()

            if is_bundle:
                bundle_extract_tmp = self.tmp_dir / f"{digest}_extract"
                try:
                    meta: BundleMetadata = parse_and_extract_bundle(tmp_path, bundle_extract_tmp)
                except ZipSlipSecurityError as e:
                    raise InvalidApkError(f"Seguridad: {e}") from e
                except ZipBombError as e:
                    raise ApkTooLargeError(str(e)) from e
                except InvalidBundleError as e:
                    raise InvalidApkError(str(e)) from e
                except BundleParserError as e:
                    raise InvalidApkError(str(e)) from e

                final_dir = self.repo_dir / digest
                if final_dir.exists():
                    shutil.rmtree(final_dir)
                shutil.move(str(bundle_extract_tmp), str(final_dir))
                bundle_extract_tmp = None

                splits_info_json = json.dumps(meta.to_dict())

                with self._get_connection() as conn:
                    try:
                        cur = conn.execute(
                            """
                            INSERT INTO apks
                            (sha256, original_name, package, version_name, version_code, size, is_default, created_at, entry_type, bundle_format, splits_info)
                            VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'bundle', ?, ?)
                            """,
                            (
                                digest,
                                original_name,
                                meta.package,
                                meta.version_name,
                                meta.version_code,
                                size,
                                now,
                                meta.bundle_format,
                                splits_info_json,
                            ),
                        )
                        apk_id = cur.lastrowid
                    except sqlite3.IntegrityError as exc:
                        if final_dir.exists():
                            shutil.rmtree(final_dir, ignore_errors=True)
                        raise DuplicateApkError("El bundle ya existe en el repositorio") from exc

                return {
                    "id": apk_id,
                    "sha256": digest,
                    "original_name": original_name,
                    "package": meta.package,
                    "version_name": meta.version_name,
                    "version_code": meta.version_code,
                    "size": size,
                    "is_default": False,
                    "created_at": now,
                    "entry_type": "bundle",
                    "bundle_format": meta.bundle_format,
                    "splits_info": meta.to_dict(),
                    "has_obb": meta.has_obb,
                    "warning": meta.warning,
                }
            else:
                final_path = self.repo_dir / f"{digest}.apk"
                package, version_name, version_code = self._extract_badging(tmp_path)

                # Renombrado atómico dentro del mismo sistema de archivos antes del INSERT
                if final_path.exists():
                    os.remove(tmp_path)
                else:
                    os.rename(tmp_path, final_path)

                with self._get_connection() as conn:
                    try:
                        cur = conn.execute(
                            """
                            INSERT INTO apks
                            (sha256, original_name, package, version_name, version_code, size, is_default, created_at, entry_type, bundle_format, splits_info)
                            VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'monolithic', NULL, NULL)
                            """,
                            (digest, original_name, package, version_name, version_code, size, now),
                        )
                        apk_id = cur.lastrowid
                    except sqlite3.IntegrityError as exc:
                        raise DuplicateApkError("El APK ya existe en el repositorio") from exc

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
                    "entry_type": "monolithic",
                    "bundle_format": None,
                    "splits_info": None,
                    "has_obb": False,
                }
        finally:
            if tmp_path.exists():
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
            if bundle_extract_tmp and bundle_extract_tmp.exists():
                try:
                    shutil.rmtree(bundle_extract_tmp, ignore_errors=True)
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

        apk_file = self.repo_dir / f"{sha256}.apk"
        bundle_dir = self.repo_dir / sha256
        try:
            if apk_file.exists():
                os.remove(apk_file)
            if bundle_dir.exists() and bundle_dir.is_dir():
                shutil.rmtree(bundle_dir, ignore_errors=True)
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
        apk_target: Union[Path, List[Path], str],
        instance_names: List[str],
        adb_serial_func,
    ) -> List[Dict[str, Any]]:
        """
        Instala un APK o Bundle en múltiples instancias con concurrencia máxima 2.

        `apk_target` puede ser:
        - Una lista de Paths a instalar (obtenida con resolve_install_splits)
        - Un Path a un APK monolítico o directorio de bundle
        - Una cadena sha256
        """
        if isinstance(apk_target, str):
            files = self.resolve_install_splits(apk_target)
        elif isinstance(apk_target, Path):
            if apk_target.is_dir():
                files = self.resolve_install_splits(apk_target.name)
            else:
                files = [apk_target]
        else:
            files = list(apk_target)

        if not files or not all(f.exists() for f in files):
            raise ApkRepositoryError("APK o splits no encontrados en disco")

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

                ok, error_msg = await install_apk_files(serial, files)
                if ok:
                    return {"instance": name, "ok": True, "status": "ok", "error": None}
                return {
                    "instance": name,
                    "ok": False,
                    "status": "failed",
                    "error": error_msg,
                }

        return await asyncio.gather(*[install_one(n) for n in instance_names])


async def install_apk_files(
    serial: str,
    files: List[Path],
    timeout: Optional[float] = None,
) -> Tuple[bool, str]:
    """
    Instala uno o múltiples APKs en una instancia mediante ADB.

    - Si len(files) == 1: adb -s <serial> install -r <file>
    - Si len(files) > 1: adb -s <serial> install-multiple -r <file1> <file2> ...
    - Escala el timeout según el tamaño total de los archivos (mín. 60s, +15s por cada 50 MB adicionales).

    Retorna (ok: bool, message: str).
    """
    if not files:
        return False, "No se especificaron archivos APK para instalar"

    for f in files:
        if not f.exists():
            return False, f"Archivo no encontrado en disco: {f.name}"

    # Calcular timeout adaptativo (mín 60s, +15s por cada 50 MB adicionales al primero)
    total_bytes = sum(f.stat().st_size for f in files)
    extra_chunks = max(0, total_bytes - (50 * 1024 * 1024)) // (50 * 1024 * 1024)
    computed_timeout = 60.0 + (extra_chunks * 15.0)
    effective_timeout = timeout if timeout is not None else computed_timeout

    cmd = ["adb", "-s", serial]
    if len(files) == 1:
        cmd.extend(["install", "-r", str(files[0])])
    else:
        cmd.extend(["install-multiple", "-r"] + [str(f) for f in files])

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=effective_timeout)
        out = stdout.decode().strip()
        err = stderr.decode().strip()

        if proc.returncode == 0 and "Success" in out:
            return True, "Success"

        error_summary = err or out or f"Código de salida: {proc.returncode}"
        if len(error_summary) > 500:
            error_summary = error_summary[:500] + "..."
        return False, error_summary

    except asyncio.TimeoutError:
        try:
            proc.kill()
        except Exception:
            pass
        return False, f"Timeout ({effective_timeout:.0f}s) durante la instalación de APK"
    except Exception as exc:
        return False, str(exc)


apk_repository = ApkRepository()
