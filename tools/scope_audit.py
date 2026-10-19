#!/usr/bin/env python3
"""Auditoría del scope LSPosed de una instancia (Bloque B6).

lspd cachea el scope al arrancar: una app instalada fuera del scope ve el
fingerprint/ABIs reales de redroid (fuga de Build/props). Este script compara
la tabla `scope` de la DB (mid del módulo) contra lo esperado:

  esperado = apps de usuario instaladas (pm list packages -3)
             + paquetes de sistema curados (Google stack + settings)
             - exclusiones (org.lsposed.manager)

Modos:
  (sin flags)   solo audita y reporta faltantes/rancias
  --apply       ejecuta `manage-spoof sync` en el contenedor (agrega faltantes)
  --prune       quita del scope las entradas cuya app ya no está instalada

Notas:
  - Requiere adb conectado al puerto de la instancia y root (su) en ella.
  - El sync dentro del contenedor funciona por adb (el sqlite3 del contenedor
    aborta con SIGABRT solo bajo `docker exec`).
  - Los cambios de scope NO se aplican en caliente: lspd los toma en el
    próximo arranque. Si --apply agregó apps, reiniciar el contenedor.
  - Chequeo de componentes: LSPosed elimina del scope a todo paquete sin
    componentes (fetchProcesses() vacío → "obsolete package" en cacheScopes()).
    Los stubs de tienda deben declarar al menos una activity (ver
    tools/build_stubs.sh). Se puede omitir con --no-components.
"""
import argparse
import subprocess
import sys

SYS_TARGETS = {
    "com.android.settings",
    "com.android.vending",
    "com.google.android.gms",
    "com.google.android.googlequicksearchbox",
}
EXCLUDE = {"org.lsposed.manager"}
COMPONENT_TABLES = (
    "Activity Resolver Table",
    "Service Resolver Table",
    "Receiver Resolver Table",
    "Provider Resolver Table",
)


def _run(cmd, timeout=30):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(cmd, 124, "", f"timeout {timeout}s")


def adb(serial, *args, timeout=30):
    return _run(["adb", "-s", serial, *args], timeout=timeout)


def get_scope(serial):
    res = adb(serial, "shell", "su -c manage-spoof list")
    if res.returncode != 0 or "Scope" not in res.stdout:
        print(f"[!] No se pudo leer el scope (rc={res.returncode}): "
              f"{res.stderr.strip() or res.stdout.strip()}")
        sys.exit(2)
    pkgs = []
    for line in res.stdout.splitlines():
        line = line.strip()
        if not line or line.startswith("==="):
            continue
        pkgs.append(line)
    return pkgs


def get_packages(serial, only_user=False):
    cmd = "pm list packages -3" if only_user else "pm list packages"
    res = adb(serial, "shell", cmd, timeout=60)
    return sorted({
        line.strip().removeprefix("package:")
        for line in res.stdout.splitlines()
        if line.startswith("package:")
    })


def find_container(serial):
    port = serial.rsplit(":", 1)[-1]
    res = _run(["docker", "ps", "--format", "{{.Names}} {{.Ports}}"])
    for line in res.stdout.splitlines():
        if f":{port}->" in line:
            return line.split()[0]
    return None


def component_less(serial, pkg):
    res = adb(serial, "shell", f"dumpsys package {pkg}", timeout=30)
    return not any(t in res.stdout for t in COMPONENT_TABLES)


def main():
    ap = argparse.ArgumentParser(description="Auditoría de scope LSPosed (B6)")
    ap.add_argument("--serial", default="127.0.0.1:5586",
                    help="serial adb de la instancia (default 127.0.0.1:5586)")
    ap.add_argument("--apply", action="store_true",
                    help="agrega las apps faltantes (manage-spoof sync)")
    ap.add_argument("--prune", action="store_true",
                    help="elimina del scope las apps ya desinstaladas")
    ap.add_argument("--no-components", action="store_true",
                    help="omite el chequeo de paquetes sin componentes")
    args = ap.parse_args()

    scope = get_scope(args.serial)
    scope_set = set(scope)
    if not scope_set:
        print("[!] Scope vacío o DB ilegible.")
        sys.exit(2)
    user_apps = get_packages(args.serial, only_user=True)
    all_apps = set(get_packages(args.serial))

    expected = (set(user_apps) | SYS_TARGETS) - EXCLUDE
    missing = sorted(expected - scope_set)
    stale = sorted(scope_set - all_apps)

    print(f"[*] Instancia {args.serial} — scope: {len(scope_set)} apps, "
          f"usuario instaladas: {len(user_apps)}")
    if missing:
        print(f"[!] FUERA DE SCOPE ({len(missing)}) — ven Build/ABIs reales:")
        for pkg in missing:
            print(f"    - {pkg}")
    else:
        print("[✓] Sin apps fuera de scope.")
    if stale:
        print(f"[i] Entradas rancias en scope ({len(stale)}): "
              + ", ".join(stale))
    else:
        print("[✓] Sin entradas rancias.")

    if not args.no_components:
        prunable = [p for p in sorted(scope_set - set(stale))
                    if component_less(args.serial, p)]
        if prunable:
            print(f"[!] Paquetes sin componentes ({len(prunable)}) — lspd los "
                  f"poda del scope en cada arranque del daemon:")
            for pkg in prunable:
                print(f"    - {pkg}")
        else:
            print("[✓] Todos los paquetes del scope declaran componentes "
                  "(estables ante la poda de lspd).")

    if args.apply and missing:
        print("[*] Ejecutando manage-spoof sync en el contenedor...")
        res = adb(args.serial, "shell", "su -c manage-spoof sync", timeout=120)
        out = (res.stdout or "").strip()
        if out:
            print(out)
        if res.returncode != 0:
            print(f"[!] sync falló (rc={res.returncode}): {res.stderr.strip()}")
            sys.exit(1)
        new_scope = set(get_scope(args.serial))
        still = sorted(expected - new_scope)
        if still:
            print(f"[!] Aún fuera de scope tras sync: {', '.join(still)}")
            sys.exit(1)
        print("[✓] Faltantes agregadas a la DB.")

    if args.prune and stale:
        for pkg in stale:
            adb(args.serial, "shell", f"su -c \"manage-spoof remove {pkg}\"",
                timeout=30)
            print(f"[i] Removida del scope: {pkg}")

    if (args.apply and missing) or (args.prune and stale):
        marker = adb(args.serial, "shell", "ls",
                     "/data/local/tmp/.proteomesh_scope_updated")
        if ".proteomesh_scope_updated" in marker.stdout:
            name = find_container(args.serial)
            hint = f"docker restart {name}" if name else "reiniciar el contenedor"
            print(f"[!] lspd no recarga el scope en caliente: ejecuta `{hint}` "
                  f"(o un `instance_manager start`, que ya reinicia solo).")
        else:
            print("[i] Sin reinicio pendiente.")


if __name__ == "__main__":
    main()
