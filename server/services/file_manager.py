"""
Gestor de archivos de instancia (WEB-017)
=========================================
Operaciones seguras sobre rutas dentro de las raíces permitidas del teléfono.

Validación:
  1. Léxica con posixpath.normpath, ruta absoluta, sin NUL, y coincidencia por
     componentes contra cada raíz permitida.
  2. Real: se ejecuta `realpath` dentro del teléfono y se comprueba que el
     destino resuelto esté dentro del realpath de alguna raíz permitida.

Escapado:
  - Todos los argumentos se pasan como lista a subprocess (sin shell=True).
  - `shlex.quote` se aplica a rutas/nombres que viajan por `adb shell`.
  - `adb push` y `adb pull` reciben rutas sin quote.
  - Se usa `--` antes de rutas que puedan empezar con `-`.

Listado:
  - Se usa `find -print0` para obtener nombres NUL-separados, luego `stat`
    para metadatos. Esto evita parsear columnas de `ls` cuando los nombres
    contienen espacios o saltos de línea. Costo: N+1 llamadas adb.
"""
import os
import posixpath
import shlex
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from server.config import ALLOWED_FILE_ROOTS
from server.services.manager_bridge import _adb_serial


class FileManagerError(Exception):
    """Errores del gestor de archivos."""


class PathValidationError(FileManagerError):
    """Ruta fuera de la whitelist o inválida."""


@dataclass
class FileEntry:
    name: str  # nombre base
    path: str  # ruta completa en el teléfono
    type: str  # "file" | "directory"
    size: int
    mtime: int  # unix timestamp


def _adb_serial_or_raise(instance_name: str) -> str:
    serial = _adb_serial(instance_name)
    if not serial:
        raise FileManagerError(f"No se pudo obtener serial ADB para {instance_name}")
    return serial


def _adb_shell_output(serial: str, *args: str, check: bool = True, text: bool = True) -> str:
    """Ejecuta `adb -s serial shell <args>` y devuelve stdout."""
    cmd = ["adb", "-s", serial, "shell", *args]
    res = subprocess.run(cmd, capture_output=True, text=text, timeout=60)
    if check and res.returncode != 0:
        err = res.stderr.strip() if res.stderr else res.stdout.strip()
        raise FileManagerError(f"adb shell falló: {err}")
    return res.stdout if text else res.stdout.decode("utf-8", errors="replace")


def _adb_shell(serial: str, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    cmd = ["adb", "-s", serial, "shell", *args]
    return subprocess.run(cmd, capture_output=True, text=True, check=check, timeout=60)


def _components(path: str) -> List[str]:
    return path.split("/")


def validate_phone_path(instance_name: str, path: str) -> str:
    """
    Valida una ruta del teléfono contra ALLOWED_FILE_ROOTS.

    Devuelve la ruta normalizada si es válida.
    """
    if not path or "\x00" in path:
        raise PathValidationError("Ruta vacía o contiene bytes NUL")

    norm = posixpath.normpath(path)
    if not posixpath.isabs(norm):
        raise PathValidationError("La ruta debe ser absoluta")

    norm_components = _components(norm)

    # Validación léxica por componentes
    matched_root: Optional[str] = None
    for root in ALLOWED_FILE_ROOTS:
        root_norm = posixpath.normpath(root)
        root_components = _components(root_norm)
        if (
            len(norm_components) >= len(root_components)
            and norm_components[: len(root_components)] == root_components
        ):
            matched_root = root_norm
            break

    if not matched_root:
        raise PathValidationError("Ruta fuera de las raíces permitidas")

    # Validación real con realpath dentro del teléfono
    serial = _adb_serial_or_raise(instance_name)
    try:
        target_real = _adb_shell_output(serial, "realpath", "--", norm).strip()
    except FileManagerError as e:
        raise PathValidationError(f"No se pudo resolver la ruta real: {e}") from e

    for root in ALLOWED_FILE_ROOTS:
        root_norm = posixpath.normpath(root)
        try:
            root_real = _adb_shell_output(serial, "realpath", "--", root_norm).strip()
        except FileManagerError:
            continue
        if target_real == root_real or target_real.startswith(root_real + "/"):
            return norm

    raise PathValidationError("La ruta real no está dentro de las raíces permitidas")


def _stat_entry(serial: str, path: str) -> Tuple[str, int, int]:
    """Devuelve (tipo, tamaño, mtime) para una ruta dada."""
    # El formato va entre comillas para proteger el '|' del shell del teléfono.
    out = _adb_shell_output(serial, "stat", "-c", "'%F|%s|%Y'", "--", path).strip()
    type_, size, mtime = out.split("|")
    return type_, int(size), int(mtime)


def list_files(instance_name: str, path: str) -> List[FileEntry]:
    """Lista archivos y directorios dentro de una ruta permitida."""
    norm = validate_phone_path(instance_name, path)
    serial = _adb_serial_or_raise(instance_name)

    # Verificar que el destino es un directorio
    try:
        dir_type, _, _ = _stat_entry(serial, norm)
    except FileManagerError as e:
        raise FileManagerError(f"No se pudo acceder al directorio: {e}") from e
    if dir_type != "directory":
        raise FileManagerError("La ruta no es un directorio")

    # Obtener entradas NUL-separadas
    out = _adb_shell_output(serial, "find", norm, "-maxdepth", "1", "-mindepth", "1", "-print0")
    names = [n for n in out.split("\0") if n]

    entries: List[FileEntry] = []
    for full_path in names:
        try:
            type_, size, mtime = _stat_entry(serial, full_path)
        except FileManagerError:
            continue
        if type_ not in ("regular file", "directory"):
            continue
        entries.append(
            FileEntry(
                name=posixpath.basename(full_path),
                path=full_path,
                type="file" if type_ == "regular file" else "directory",
                size=size,
                mtime=mtime,
            )
        )
    return entries


def _unique_target_name(serial: str, target_dir: str, filename: str) -> str:
    """Genera un nombre destino que no exista, añadiendo sufijo numérico si hace falta."""
    base = Path(filename)
    candidate = posixpath.join(target_dir, base.name)
    if not _path_exists(serial, candidate):
        return candidate

    stem = base.stem
    suffix = base.suffix
    counter = 1
    while True:
        candidate = posixpath.join(target_dir, f"{stem}_{counter}{suffix}")
        if not _path_exists(serial, candidate):
            return candidate
        counter += 1


def _path_exists(serial: str, path: str) -> bool:
    res = _adb_shell(serial, "test", "-e", path, check=False)
    return res.returncode == 0


def _sanitize_filename(name: str) -> str:
    """Rechaza nombres con path traversal, NUL o caracteres de control."""
    if not name or "\x00" in name:
        raise FileManagerError("Nombre de archivo inválido")
    base = Path(name).name
    if not base or base != name or any(ord(c) < 32 for c in base):
        raise FileManagerError("Nombre de archivo inválido")
    return base


def upload_file(instance_name: str, dest_dir: str, filename: str, content: bytes) -> FileEntry:
    """Sube un archivo a un directorio permitido del teléfono."""
    norm_dir = validate_phone_path(instance_name, dest_dir)
    serial = _adb_serial_or_raise(instance_name)
    safe_name = _sanitize_filename(filename)

    # Validar que dest_dir es directorio
    dir_type, _, _ = _stat_entry(serial, norm_dir)
    if dir_type != "directory":
        raise FileManagerError("El destino no es un directorio")

    target_path = _unique_target_name(serial, norm_dir, safe_name)

    local_tmp = tempfile.NamedTemporaryFile(delete=False)
    try:
        local_tmp.write(content)
        local_tmp.close()
        res = subprocess.run(
            ["adb", "-s", serial, "push", local_tmp.name, target_path],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        if res.returncode != 0:
            raise FileManagerError(f"adb push falló: {res.stderr.strip()}")
    finally:
        try:
            os.remove(local_tmp.name)
        except OSError:
            pass

    type_, size, mtime = _stat_entry(serial, target_path)
    _trigger_media_scan(serial, target_path)
    return FileEntry(
        name=posixpath.basename(target_path),
        path=target_path,
        type="file" if type_ == "regular file" else "directory",
        size=size,
        mtime=mtime,
    )


def download_file(instance_name: str, path: str) -> bytes:
    """Descarga un archivo mediante streaming `adb exec-out cat`."""
    norm = validate_phone_path(instance_name, path)
    serial = _adb_serial_or_raise(instance_name)

    type_, _, _ = _stat_entry(serial, norm)
    if type_ != "regular file":
        raise FileManagerError("La ruta no es un archivo regular")

    res = subprocess.run(
        ["adb", "-s", serial, "exec-out", "cat", "--", norm],
        capture_output=True,
        timeout=120,
        check=False,
    )
    if res.returncode != 0:
        err = res.stderr.decode("utf-8", errors="replace").strip()
        raise FileManagerError(f"adb exec-out cat falló: {err}")
    return res.stdout


def _is_root_path(path: str) -> bool:
    norm = posixpath.normpath(path)
    return any(norm == posixpath.normpath(root) for root in ALLOWED_FILE_ROOTS)


def delete_file(instance_name: str, path: str) -> Dict[str, str]:
    """Elimina un archivo regular dentro de una ruta permitida."""
    norm = validate_phone_path(instance_name, path)
    if _is_root_path(norm):
        raise FileManagerError("No se permite eliminar una raíz")
    serial = _adb_serial_or_raise(instance_name)

    type_, _, _ = _stat_entry(serial, norm)
    if type_ != "regular file":
        raise FileManagerError("Solo se permite eliminar archivos regulares")

    res = _adb_shell(serial, "rm", "--", norm, check=False)
    if res.returncode != 0:
        raise FileManagerError(f"No se pudo eliminar: {res.stderr.strip()}")
    return {"status": "ok", "path": norm}


def send_file(
    source_instance: str,
    source_path: str,
    target_instance: str,
    target_dir: str,
) -> FileEntry:
    """Transfiere un archivo entre dos instancias usando un temporal local."""
    norm_source = validate_phone_path(source_instance, source_path)
    norm_target_dir = validate_phone_path(target_instance, target_dir)

    source_serial = _adb_serial_or_raise(source_instance)
    target_serial = _adb_serial_or_raise(target_instance)

    source_type, _, _ = _stat_entry(source_serial, norm_source)
    if source_type != "regular file":
        raise FileManagerError("Solo se permite enviar archivos regulares")

    target_dir_type, _, _ = _stat_entry(target_serial, norm_target_dir)
    if target_dir_type != "directory":
        raise FileManagerError("El destino no es un directorio")

    source_name = posixpath.basename(norm_source)
    target_path = _unique_target_name(target_serial, norm_target_dir, source_name)

    local_tmp = tempfile.NamedTemporaryFile(delete=False)
    try:
        local_tmp.close()
        pull_res = subprocess.run(
            ["adb", "-s", source_serial, "pull", norm_source, local_tmp.name],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        if pull_res.returncode != 0:
            raise FileManagerError(f"adb pull falló: {pull_res.stderr.strip()}")

        push_res = subprocess.run(
            ["adb", "-s", target_serial, "push", local_tmp.name, target_path],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        if push_res.returncode != 0:
            raise FileManagerError(f"adb push falló: {push_res.stderr.strip()}")
    finally:
        try:
            os.remove(local_tmp.name)
        except OSError:
            pass

    type_, size, mtime = _stat_entry(target_serial, target_path)
    _trigger_media_scan(target_serial, target_path)
    return FileEntry(
        name=posixpath.basename(target_path),
        path=target_path,
        type="file" if type_ == "regular file" else "directory",
        size=size,
        mtime=mtime,
    )


def _trigger_media_scan(serial: str, path: str) -> None:
    """Envía el broadcast obsoleto MEDIA_SCANNER_SCAN_FILE."""
    quoted = shlex.quote(path)
    _adb_shell(
        serial,
        "am",
        "broadcast",
        "-a",
        "android.intent.action.MEDIA_SCANNER_SCAN_FILE",
        "-d",
        f"file://{quoted}",
        check=False,
    )


def allowed_roots(instance_name: str) -> List[Dict[str, Any]]:
    """Devuelve las raíces permitidas resueltas a realpath en el teléfono."""
    serial = _adb_serial_or_raise(instance_name)
    roots: List[Dict[str, Any]] = []
    for root in ALLOWED_FILE_ROOTS:
        try:
            real = _adb_shell_output(serial, "realpath", "--", root).strip()
        except FileManagerError:
            real = root
        roots.append({"path": root, "realpath": real})
    return roots
