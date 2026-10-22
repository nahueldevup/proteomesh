#!/usr/bin/env python3
"""
deps_fetch.py — Descarga y verifica las dependencias externas fijadas en modules.lock.

Uso:
  python3 tools/deps_fetch.py list
  python3 tools/deps_fetch.py fetch [id ...]
  python3 tools/deps_fetch.py path <id>
  python3 tools/deps_fetch.py verify
"""

import argparse
import hashlib
import json
import sys
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent.parent
LOCK_FILE = BASE_DIR / "modules.lock"
CACHE_DIR = BASE_DIR / ".cache" / "deps"


def load_lock() -> dict:
    if not LOCK_FILE.exists():
        raise SystemExit(f"[!] No existe {LOCK_FILE}")
    with open(LOCK_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def cache_path(dep_id: str, dep: dict) -> Path:
    filename = Path(urlparse(dep["url"]).path).name or dep_id
    return CACHE_DIR / filename


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(dest.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": "proteomesh-deps-fetch/1"})
    print(f"[*] Descargando {url}")
    with urllib.request.urlopen(req, timeout=120) as resp, open(part, "wb") as out:
        while True:
            chunk = resp.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
    part.replace(dest)


def ensure_dep(dep_id: str, dep: dict, force: bool = False) -> Path:
    dest = cache_path(dep_id, dep)
    expected = dep["sha256"]
    if dest.exists() and not force:
        actual = sha256_file(dest)
        if actual == expected:
            return dest
        print(f"[!] Hash inválido para {dep_id} en caché; se vuelve a descargar.")
    download(dep["url"], dest)
    actual = sha256_file(dest)
    if actual != expected:
        dest.unlink(missing_ok=True)
        raise SystemExit(f"[!] {dep_id}: sha256 esperado {expected}, obtenido {actual}")
    return dest


def cmd_list(lock: dict, _args) -> None:
    print("Dependencias fijadas:")
    for dep_id, dep in lock.get("dependencies", {}).items():
        print(f"  {dep_id:<10} {dep.get('version','?'):<8} {dep.get('license','?'):<10} {dep['url']}")
    manual = lock.get("manual", {})
    if manual:
        print("Dependencias manuales:")
        for dep_id, dep in manual.items():
            print(f"  {dep_id:<10} {dep.get('version','?'):<8} {dep.get('status','?')}")


def cmd_fetch(lock: dict, args) -> None:
    dependencies = lock.get("dependencies", {})
    ids = args.ids or list(dependencies)
    for dep_id in ids:
        if dep_id not in dependencies:
            raise SystemExit(f"[!] Dependencia desconocida: {dep_id}")
        path = ensure_dep(dep_id, dependencies[dep_id], force=args.force)
        print(f"[✓] {dep_id}: {path} ({sha256_file(path)})")


def cmd_path(lock: dict, args) -> None:
    dependencies = lock.get("dependencies", {})
    if args.id not in dependencies:
        raise SystemExit(f"[!] Dependencia desconocida: {args.id}")
    path = ensure_dep(args.id, dependencies[args.id])
    print(path)


def cmd_verify(lock: dict, _args) -> None:
    failed = False
    for dep_id, dep in lock.get("dependencies", {}).items():
        path = cache_path(dep_id, dep)
        if not path.exists():
            print(f"[!] {dep_id}: no está en caché ({path})")
            failed = True
            continue
        actual = sha256_file(path)
        if actual != dep["sha256"]:
            print(f"[!] {dep_id}: hash no coincide")
            failed = True
        else:
            print(f"[✓] {dep_id}: {path}")
    for name, artifact in lock.get("local_artifacts", {}).items():
        path = BASE_DIR / artifact["path"]
        if not path.exists():
            print(f"[!] {name}: falta {artifact['path']}")
            failed = True
            continue
        actual = sha256_file(path)
        if actual != artifact["sha256"]:
            print(f"[!] {name}: hash no coincide en {artifact['path']}")
            failed = True
        else:
            print(f"[✓] {name}: {artifact['path']}")
    if failed:
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Descarga y verifica dependencias de ProteoMesh")
    sub = parser.add_subparsers(dest="command", required=True)

    p_list = sub.add_parser("list", help="Lista las dependencias fijadas")
    p_list.set_defaults(func=cmd_list)

    p_fetch = sub.add_parser("fetch", help="Descarga y verifica dependencias")
    p_fetch.add_argument("ids", nargs="*", help="IDs a descargar (default: todas)")
    p_fetch.add_argument("--force", action="store_true", help="Ignora la caché y descarga de nuevo")
    p_fetch.set_defaults(func=cmd_fetch)

    p_path = sub.add_parser("path", help="Imprime la ruta local de una dependencia")
    p_path.add_argument("id", help="ID de la dependencia")
    p_path.set_defaults(func=cmd_path)

    p_verify = sub.add_parser("verify", help="Verifica caché y artefactos locales")
    p_verify.set_defaults(func=cmd_verify)

    args = parser.parse_args()
    lock = load_lock()
    args.func(lock, args)


if __name__ == "__main__":
    main()
