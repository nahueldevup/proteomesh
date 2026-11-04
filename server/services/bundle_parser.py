"""
Motor de inspección, seguridad y análisis de Bundles / Split APKs (WEB-017 / Bundles)
=====================================================================================
Soporta formatos .apkm, .xapk, .apks y .zip de múltiples APKs.
Aplica mitigaciones estrictas de:
- Zip-Slip (validación de path traversal y escape de directorio)
- Symlinks maliciosos
- Zip-Bomb (límite de descompresión sobre bytes reales leídos en streaming)
- Extracción de .apk ignorando .obb (con registro de advertencia)
- Procesamiento exclusivo de splits/ en bundles bundletool (.apks)
- Detección rápida de ABI vía zipfile interno (lib/<abi>/) sin sobrecoste de aapt2
- Identificación de base.apk mediante aapt2 dump badging
"""
import os
import re
import shutil
import subprocess
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from server.config import (
    APK_MAX_UNCOMPRESSED_BYTES,
    resolve_aapt2_path,
)

KNOWN_ABIS = ("x86_64", "arm64-v8a", "x86", "armeabi-v7a", "armeabi")
SUPPORTED_BUNDLE_EXTENSIONS = (".apkm", ".xapk", ".apks", ".zip")


class BundleParserError(Exception):
    """Excepción base para errores durante el parsing de bundles."""


class ZipSlipSecurityError(BundleParserError):
    """Detectado intento de path traversal o symlink malicioso (Zip-Slip)."""


class ZipBombError(BundleParserError):
    """El tamaño real descomprimido del bundle excede la cuota permitida."""


class InvalidBundleError(BundleParserError):
    """El bundle está corrupto o su estructura de splits no es válida."""


@dataclass
class BadgingResult:
    package: str
    version_name: str
    version_code: int
    split: Optional[str] = None
    is_base: bool = False
    raw_output: str = ""


@dataclass
class SplitMetadata:
    filename: str
    split_id: str
    abi: Optional[str]
    size: int
    path: Path


@dataclass
class BundleMetadata:
    package: str
    version_name: str
    version_code: int
    base_apk: str
    base_apk_path: Path
    splits: List[SplitMetadata] = field(default_factory=list)
    has_obb: bool = False
    warning: Optional[str] = None
    total_uncompressed_size: int = 0
    bundle_format: str = "zip"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "base_file": self.base_apk,
            "total_splits": len(self.splits),
            "splits": [
                {
                    "file": s.filename,
                    "split_id": s.split_id,
                    "abi": s.abi,
                    "size": s.size,
                }
                for s in self.splits
            ],
            "has_obb": self.has_obb,
            "warning": self.warning,
            "total_uncompressed_size": self.total_uncompressed_size,
        }


def dump_badging(apk_path: Path) -> BadgingResult:
    """
    Ejecuta aapt2 dump badging sobre un archivo APK y analiza si es base o split.
    """
    aapt2_path = resolve_aapt2_path()
    res = subprocess.run(
        [str(aapt2_path), "dump", "badging", str(apk_path)],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if res.returncode != 0:
        raise InvalidBundleError(f"aapt2 no pudo leer {apk_path.name}: {res.stderr.strip()}")

    pkg_match = re.search(r"package:\s+name='([^']+)'", res.stdout)
    if not pkg_match:
        raise InvalidBundleError(f"No se pudo extraer el package de {apk_path.name}")
    package = pkg_match.group(1)

    vc_match = re.search(r"versionCode='(\d+)'", res.stdout)
    version_code = int(vc_match.group(1)) if vc_match else 0

    vn_match = re.search(r"versionName='([^']*)'", res.stdout)
    version_name = vn_match.group(1) if vn_match else ""

    split_match = re.search(r"split='([^']+)'", res.stdout)
    split = split_match.group(1) if split_match else None

    # El base.apk NO contiene split='...' y posee application: label=...
    has_app_label = bool(re.search(r"application:\s+label=", res.stdout))
    is_base = (split is None) and has_app_label

    return BadgingResult(
        package=package,
        version_name=version_name,
        version_code=version_code,
        split=split,
        is_base=is_base,
        raw_output=res.stdout,
    )


def inspect_split_abi(split_path: Path) -> Optional[str]:
    """
    Inspecciona las rutas internas lib/<abi>/ de un split usando zipfile sin llamar a aapt2.
    """
    try:
        with zipfile.ZipFile(split_path, "r") as zf:
            for name in zf.namelist():
                if name.startswith("lib/"):
                    parts = name.split("/")
                    if len(parts) >= 2 and parts[1] in KNOWN_ABIS:
                        return parts[1]
    except zipfile.BadZipFile:
        pass
    return None


def derive_split_id(split_path: Path) -> str:
    """Deriva el split_id a partir del nombre del archivo si no se dispone del manifest."""
    stem = split_path.stem
    if stem.startswith("split_"):
        return stem[6:]
    if stem.startswith("base-"):
        return f"config.{stem[5:]}"
    return stem


def validate_split_consistency(split_path: Path, expected_package: str) -> None:
    """Valida que un split pertenezca al mismo package que el base.apk."""
    try:
        with zipfile.ZipFile(split_path, "r") as zf:
            if "AndroidManifest.xml" in zf.namelist():
                manifest_bytes = zf.read("AndroidManifest.xml")
                ascii_pkg = expected_package.encode("ascii", errors="ignore")
                utf16_pkg = expected_package.encode("utf-16le")
                if ascii_pkg not in manifest_bytes and utf16_pkg not in manifest_bytes:
                    raise InvalidBundleError(
                        f"El split {split_path.name} pertenece a un paquete distinto al base ({expected_package})"
                    )
    except zipfile.BadZipFile:
        raise InvalidBundleError(f"Split corrupto: {split_path.name}")


def parse_and_extract_bundle(
    zip_path: Path,
    extract_dir: Path,
    max_uncompressed_bytes: Optional[int] = None,
) -> BundleMetadata:
    """
    Descomprime de forma segura y analiza un bundle (.apkm, .xapk, .apks, .zip).

    Retorna un BundleMetadata con los datos de base.apk y sus splits clasificados.
    """
    ext = zip_path.suffix.lower()
    if ext not in SUPPORTED_BUNDLE_EXTENSIONS:
        raise InvalidBundleError(
            f"Extensión no soportada para bundle: {ext}. Formatos permitidos: {', '.join(SUPPORTED_BUNDLE_EXTENSIONS)}"
        )
    bundle_format = ext.lstrip(".")

    extract_dir = extract_dir.resolve()
    extract_dir.mkdir(parents=True, exist_ok=True)

    max_bytes = max_uncompressed_bytes if max_uncompressed_bytes is not None else APK_MAX_UNCOMPRESSED_BYTES

    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            # 1. Validaciones previas de seguridad en todos los miembros
            has_obb = False
            for member in zf.infolist():
                # Mitigación Symlink
                is_symlink = (member.external_attr >> 16) & 0o170000 == 0o120000
                if is_symlink:
                    raise ZipSlipSecurityError(f"Symlinks no permitidos en el bundle: {member.filename}")

                # Mitigación Zip-Slip
                if member.filename.startswith(("/", "\\")) or ".." in Path(member.filename).parts:
                    raise ZipSlipSecurityError(f"Ruta maliciosa detectada en bundle (Zip-Slip): {member.filename}")

                # Verificar OBB
                if member.filename.lower().endswith(".obb"):
                    has_obb = True

            # 2. Filtrado de miembros: si hay splits/, procesar solo los APKs bajo splits/
            splits_entries = [
                m for m in zf.infolist()
                if m.filename.lower().endswith(".apk") and (
                    m.filename.lower().startswith("splits/") or "/splits/" in m.filename.lower()
                ) and not m.is_dir()
            ]
            if splits_entries:
                apk_members = splits_entries
            else:
                apk_members = [
                    m for m in zf.infolist()
                    if m.filename.lower().endswith(".apk") and not m.is_dir()
                ]

            if not apk_members:
                raise InvalidBundleError("El bundle no contiene archivos .apk válidos")

            # 3. Extracción en streaming con control de Zip-Bomb en bytes reales
            total_uncompressed = 0
            extracted_apks: List[Path] = []

            for member in apk_members:
                safe_name = Path(member.filename).name
                dest_file = (extract_dir / safe_name).resolve()

                # Comprobación de que la ruta de destino no escape
                if not dest_file.is_relative_to(extract_dir):
                    raise ZipSlipSecurityError(f"Ruta maliciosa detectada en bundle (Zip-Slip): {member.filename}")

                # Si hubiera colisión de nombres (ej. dos carpetas con mismo nombre), disambiguar
                if dest_file.exists():
                    dest_file = (extract_dir / f"{dest_file.stem}_{len(extracted_apks)}{dest_file.suffix}").resolve()

                with zf.open(member) as src, open(dest_file, "wb") as dst:
                    while True:
                        chunk = src.read(65536)
                        if not chunk:
                            break
                        total_uncompressed += len(chunk)
                        if total_uncompressed > max_bytes:
                            raise ZipBombError(
                                f"El bundle descomprimido excede el límite permitido de {max_bytes / (1024 * 1024):.0f} MB"
                            )
                        dst.write(chunk)

                extracted_apks.append(dest_file)

    except (zipfile.BadZipFile, OSError) as exc:
        shutil.rmtree(extract_dir, ignore_errors=True)
        if isinstance(exc, (ZipSlipSecurityError, ZipBombError, InvalidBundleError)):
            raise
        raise InvalidBundleError(f"Error al abrir o leer el archivo zip: {exc}") from exc
    except Exception:
        shutil.rmtree(extract_dir, ignore_errors=True)
        raise

    # 4. Identificar el base.apk entre los extraídos
    # Priorizar candidatos con "base" en el nombre para optimizar aapt2
    def _base_sort_key(p: Path) -> int:
        name = p.name.lower()
        if name == "base.apk":
            return 0
        if "base" in name and not name.startswith("split_"):
            return 1
        return 2

    sorted_candidates = sorted(extracted_apks, key=_base_sort_key)

    base_candidate: Optional[BadgingResult] = None
    base_path: Optional[Path] = None

    try:
        for candidate in sorted_candidates:
            badging = dump_badging(candidate)
            if badging.is_base:
                base_candidate = badging
                base_path = candidate
                break

        if not base_candidate or not base_path:
            raise InvalidBundleError("El bundle no contiene un base.apk identificable")

        # 5. Clasificar los demás splits con inspección rápida zipfile
        splits: List[SplitMetadata] = []
        for apk_path in extracted_apks:
            if apk_path == base_path:
                continue

            # Validar consistencia de paquete
            validate_split_consistency(apk_path, base_candidate.package)

            # Detectar ABI vía zipfile sin aapt2
            abi = inspect_split_abi(apk_path)
            split_id = derive_split_id(apk_path)

            splits.append(
                SplitMetadata(
                    filename=apk_path.name,
                    split_id=split_id,
                    abi=abi,
                    size=apk_path.stat().st_size,
                    path=apk_path,
                )
            )

        warning = "Archivos OBB adicionales ignorados" if has_obb else None

        return BundleMetadata(
            package=base_candidate.package,
            version_name=base_candidate.version_name,
            version_code=base_candidate.version_code,
            base_apk=base_path.name,
            base_apk_path=base_path,
            splits=splits,
            has_obb=has_obb,
            warning=warning,
            total_uncompressed_size=total_uncompressed,
            bundle_format=bundle_format,
        )

    except Exception:
        shutil.rmtree(extract_dir, ignore_errors=True)
        raise
