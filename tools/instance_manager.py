#!/usr/bin/env python3
"""
ProteoMesh Instance Manager (GeeLark / GenFarmer style)
Gestor de instancias y perfiles de hardware para ReDroid / ProteoMesh.

Funcionalidades:
- list-templates : Lista todas las plantillas de hardware disponibles organizadas por marca.
- list-carriers  : Lista las operadoras telefónicas disponibles.
- randomize      : Genera y previsualiza un conjunto único de identificadores (IMEI, MAC, Serial, etc.) para una plantilla.
- create         : Crea una nueva instancia con su carpeta, volumen /data y profile.json congelado.
- start/stop     : Arranca o detiene una instancia existente.
- sync-scope     : Sincroniza apps post-boot al scope LSPosed y a la DenyList.
- list-instances : Lista las instancias creadas en el sistema.
"""

import os
import re
import sys
import json
import time
import hashlib
import subprocess
import random
import string
import shlex
import argparse
from typing import Optional
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = BASE_DIR / "templates"
CARRIERS_DIR = BASE_DIR / "carriers"
INSTANCES_DIR = BASE_DIR / "instances"
CLEAN_DATA_DIR = BASE_DIR / "data-clean"
INSTANCE_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,62}$")
MAC_RE = re.compile(r"^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$")
BUNDLE_FORMAT_VERSION = 1
RUNTIME_VERSION = "1.0"

# ── Optimización de renderizado ──────────────────────────────────────────────
# SurfaceFlinger renderiza a resolución/fps reducidos para ahorrar CPU/RAM.
# Las apps ven la resolución real del perfil gracias a wm size/density post-boot.
RENDER_WIDTH = 720
RENDER_HEIGHT = 1280
RENDER_DPI = 270
RENDER_FPS = 30

# Paquetes del sistema inútiles en un CloudPhone sin hardware real.
# Se desactivan con pm disable (siguen reportados en packages.xml pero no
# consumen RAM ni CPU — Android los reconoce como presentes pero detenidos).
DISABLE_PACKAGES = [
    # Bluetooth / NFC (no hay adaptador físico)
    "com.android.bluetooth",
    "com.android.bluetoothmidiservice",
    "com.android.nfc",
    # Galería local (no hay archivos personales); la CÁMARA permanece activa:
    # el módulo LSPosed virtualiza CameraManager con un stream de identidad.
    "com.android.gallery3d",
    # Multimedia local (no se reproduce música/audio local)
    "com.android.music",
    "com.android.musicfx",
    # Impresión (no hay impresoras conectadas)
    "com.android.printservice.recommendation",
    "com.android.printspooler",
    # Calendario y contactos (operación headless, no hay agenda personal)
    "com.android.calendar",
    "com.android.providers.calendar",
    "com.google.android.syncadapters.calendar",
    # Diagnóstico / Google que no aportan a operación de granja
    "com.google.android.feedback",
    "com.google.ar.core",
    "com.google.android.apps.restore",
    "com.google.android.contactkeys",
    # Red sobrante (no hay hotspot, VPN nativa, ni tethering)
    "com.android.hotspot2.osulogin",
    "com.android.vpndialogs",
]

# Propiedades de agresividad de procesos background de Android.
# Reduce el footprint de RAM matando procesos inactivos rápidamente.
BG_PROCESS_SETTINGS = {
    "settings put global settings_bg_apps_limit": "4",
    "settings put global activity_manager_constants": "max_cached_processes=4,background_settle_time=5000",
}


def calc_luhn(digits: str) -> int:
    """Calcula el dígito verificador de Luhn para una cadena de dígitos numéricos."""
    total = 0
    for i, char in enumerate(digits):
        d = int(char)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d = (d // 10) + (d % 10)
        total += d
    return (10 - (total % 10)) % 10


def rand_hex(length: int, upper: bool = False) -> str:
    """Genera una cadena hexadecimal aleatoria de longitud fija."""
    chars = "0123456789ABCDEF" if upper else "0123456789abcdef"
    return "".join(random.choice(chars) for _ in range(length))


def rand_digits(length: int) -> str:
    """Genera una cadena de dígitos numéricos aleatorios."""
    return "".join(random.choice(string.digits) for _ in range(length))


def generate_identity(template_data: dict, carrier_data: Optional[dict] = None) -> dict:
    """
    Genera identificadores únicos pero consistentes con la marca y modelo:
    - IMEI: TAC oficial (8 dígitos) + 6 dígitos aleatorios + dígito de control Luhn.
    - Wi-Fi MAC: OUI oficial del fabricante (3 octetos) + 3 octetos aleatorios.
    - Bluetooth MAC: OUI oficial del fabricante (3 octetos) + 3 octetos aleatorios.
    - Serial: Prefijo de modelo del fabricante + sufijo hexadecimal aleatorio.
    - Android ID: 16 caracteres hexadecimales aleatorios en minúscula.
    - Telefonía (IMSI, ICCID, Teléfono): Prefijo de la operadora seleccionada + dígitos aleatorios.
    """
    tmpl_id = template_data.get("identity_template", {})

    # 1. IMEI
    tac = str(tmpl_id.get("tac", "35824011"))[:8]
    snr = rand_digits(6)
    base_imei = tac + snr
    cd = calc_luhn(base_imei)
    imei = f"{base_imei}{cd}"

    # 2. MEID
    meid = f"A00000{rand_hex(8, upper=True)}"

    # 3. Serial
    serial_pfx = tmpl_id.get("serial_prefix", "R58R")
    serial = f"{serial_pfx}{rand_hex(6, upper=True)}"

    # 4. Android ID
    android_id = rand_hex(16, upper=False)

    # 5. MACs
    wifi_oui = tmpl_id.get("wifi_mac_oui", "b0:79:94").lower()
    bt_oui = tmpl_id.get("bt_mac_oui", "b0:79:94").lower()
    wifi_mac = f"{wifi_oui}:{rand_hex(2)}:{rand_hex(2)}:{rand_hex(2)}"
    bt_mac = f"{bt_oui}:{rand_hex(2)}:{rand_hex(2)}:{rand_hex(2)}"

    # 6. Telefonía
    c_data = carrier_data or template_data.get("telephony", {})
    imsi_pfx = c_data.get("imsi_prefix", "722310")
    iccid_pfx = c_data.get("iccid_prefix", "895431")
    phone_pfx = c_data.get("phone_prefix", "+54911")

    imsi = f"{imsi_pfx}{rand_digits(15 - len(imsi_pfx))}"
    iccid = f"{iccid_pfx}{rand_digits(19 - len(iccid_pfx))}"
    phone = f"{phone_pfx}{rand_digits(8)}"

    # 7. Wi-Fi SSID / BSSID (estables por instancia; profile-loader los respeta)
    net = template_data.get("network", {})
    ssid_pfx = net.get("ssid_prefix", "Home")
    bssid_oui = net.get("bssid_oui", "F4:EC:38").lower()
    wifi_ssid = f"{ssid_pfx}-{rand_hex(4, upper=True)}"
    wifi_bssid = f"{bssid_oui}:{rand_hex(2)}:{rand_hex(2)}:{rand_hex(2)}"

    return {
        "imei": imei,
        "meid": meid,
        "serial": serial,
        "android_id": android_id,
        "wifi_mac": wifi_mac,
        "wifi_ssid": wifi_ssid,
        "wifi_bssid": wifi_bssid,
        "bt_mac": bt_mac,
        "imsi": imsi,
        "iccid": iccid,
        "phone_number": phone
    }


def find_template(name: str) -> Path:
    """Busca un archivo de plantilla por nombre o ruta relativa."""
    target = name if name.endswith(".json") else f"{name}.json"
    p = TEMPLATES_DIR / target
    if p.exists():
        return p

    matches = list(TEMPLATES_DIR.rglob(target))
    if matches:
        return matches[0]

    raise FileNotFoundError(f"No se encontró la plantilla de hardware: '{name}' en {TEMPLATES_DIR}")


def find_carrier(name: str) -> Path:
    """Busca un archivo de operadora por nombre o código."""
    target = name if name.endswith(".json") else f"{name}.json"
    p = CARRIERS_DIR / target
    if p.exists():
        return p

    matches = list(CARRIERS_DIR.glob(f"*{name}*.json"))
    if matches:
        return matches[0]

    raise FileNotFoundError(f"No se encontró la operadora: '{name}' en {CARRIERS_DIR}")


def cmd_list_templates(args):
    """Lista las plantillas disponibles organizadas por marca."""
    print("================================================================================")
    print("                    CATÁLOGO DE PLANTILLAS DE HARDWARE")
    print("================================================================================")
    for brand_dir in sorted(TEMPLATES_DIR.iterdir()):
        if brand_dir.is_dir():
            templates = list(brand_dir.glob("*.json"))
            if not templates:
                continue
            print(f"\n📱 {brand_dir.name.upper()} ({len(templates)} modelos):")
            for t_file in sorted(templates):
                try:
                    with open(t_file, "r") as f:
                        data = json.load(f)
                    m_name = data.get("template", {}).get("name", t_file.stem)
                    soc = data.get("cpu", {}).get("chipname", "Desconocido")
                    gpu = data.get("gpu", {}).get("renderer", "Desconocida")
                    disp = data.get("display", {})
                    res = f"{disp.get('width', '?')}x{disp.get('height', '?')} @ {disp.get('fps', '?')}Hz"
                    rel_path = f"{brand_dir.name}/{t_file.name}"
                    print(f"  • {rel_path:<28} | {m_name:<25} | {soc:<22} | {res}")
                except Exception as e:
                    print(f"  • {t_file.stem} (Error: {e})")
    print("\n================================================================================")


def cmd_list_carriers(args):
    """Lista las operadoras telefónicas disponibles."""
    print("================================================================================")
    print("                    CATÁLOGO DE OPERADORAS TELEFÓNICAS")
    print("================================================================================")
    for c_file in sorted(CARRIERS_DIR.glob("*.json")):
        with open(c_file, "r") as f:
            data = json.load(f)
        c_id = data.get("id", c_file.stem)
        name = data.get("carrier_name", "Desconocido")
        numeric = data.get("operator_numeric", "")
        iso = data.get("country_iso", "").upper()
        print(f"  • {c_id:<18} | {name:<18} | MCC/MNC: {numeric:<8} | País: {iso}")
    print("================================================================================")


def cmd_randomize(args):
    """Genera y muestra una previsualización de identificadores válidos para un modelo."""
    t_path = find_template(args.template)
    with open(t_path, "r") as f:
        t_data = json.load(f)

    c_data = None
    if args.carrier:
        c_path = find_carrier(args.carrier)
        with open(c_path, "r") as f:
            c_data = json.load(f)

    identity = generate_identity(t_data, c_data)
    m_name = t_data.get("template", {}).get("name", t_path.stem)
    carrier_name = (c_data or t_data.get("telephony", {})).get("carrier_name", "Por defecto")

    print(f"\n[🎲] Identificadores Únicos Generados para: {m_name}")
    print(f"     Operadora asignada: {carrier_name}")
    print("--------------------------------------------------------------------------------")
    print(f"  IMEI            : {identity['imei']} (TAC: {identity['imei'][:8]}, Luhn Check ✓)")
    print(f"  MEID            : {identity['meid']}")
    print(f"  Serial Number   : {identity['serial']}")
    print(f"  Android ID      : {identity['android_id']}")
    print(f"  Wi-Fi MAC       : {identity['wifi_mac']}")
    print(f"  Wi-Fi SSID      : {identity['wifi_ssid']} ({identity['wifi_bssid']})")
    print(f"  Bluetooth MAC   : {identity['bt_mac']}")
    print(f"  SIM IMSI        : {identity['imsi']}")
    print(f"  SIM ICCID       : {identity['iccid']}")
    print(f"  Línea Telefónica: {identity['phone_number']}")
    print("--------------------------------------------------------------------------------\n")


def validate_instance_name(name: str) -> str:
    """Rechaza nombres que puedan escapar de instances/ o inyectar shell."""
    if not INSTANCE_NAME_RE.fullmatch(name or ""):
        raise SystemExit(
            f"[!] Nombre de instancia inválido: {name!r}. "
            "Usar solo minúsculas, números, guiones y guiones bajos (máx. 63)."
        )
    return name

def validate_profile(doc: dict, source_label: str = "perfil") -> dict:
    """Valida el contrato de perfil de hardware según ADR-001 (F1).

    Exige identidad generada con IMEI válido por Luhn y rechaza templates crudos.
    """
    if not isinstance(doc, dict):
        raise SystemExit(f"[!] Error en {source_label}: el contenido debe ser un objeto JSON.")

    dev = doc.get("device")
    if not isinstance(dev, dict):
        raise SystemExit(f"[!] Error en {source_label}: falta la sección obligatoria 'device'.")
    for key in ("brand", "model", "manufacturer", "fingerprint"):
        if not dev.get(key):
            raise SystemExit(f"[!] Error en {source_label}: campo 'device.{key}' faltante o vacío.")

    disp = doc.get("display")
    if not isinstance(disp, dict):
        raise SystemExit(f"[!] Error en {source_label}: falta la sección obligatoria 'display'.")
    for key in ("width", "height", "dpi"):
        val = disp.get(key)
        if not isinstance(val, int) or val <= 0:
            raise SystemExit(f"[!] Error en {source_label}: 'display.{key}' debe ser un entero positivo.")

    identity = doc.get("generated_identity")
    if not isinstance(identity, dict):
        identity = doc.get("identity")
    if not isinstance(identity, dict):
        raise SystemExit(
            f"[!] Error en {source_label}: falta 'generated_identity'. "
            "Las plantillas crudas no son ejecutables directamente; "
            "usa 'instance_manager.py create' para generar una identidad válida."
        )

    imei = str(identity.get("imei") or "").strip()
    if not imei.isdigit() or not (14 <= len(imei) <= 16):
        raise SystemExit(f"[!] Error en {source_label}: 'generated_identity.imei' inválido ({imei!r}).")
    if len(imei) == 15 and calc_luhn(imei[:14]) != int(imei[14]):
        raise SystemExit(f"[!] Error en {source_label}: el IMEI {imei} no pasa el control de Luhn.")

    serial = str(identity.get("serial") or "").strip()
    if not serial:
        raise SystemExit(f"[!] Error en {source_label}: 'generated_identity.serial' faltante o vacío.")

    wmac = str(identity.get("wifi_mac") or "").strip()
    if not MAC_RE.fullmatch(wmac):
        raise SystemExit(f"[!] Error en {source_label}: 'generated_identity.wifi_mac' inválida ({wmac!r}).")

    return doc

def create_bundle_manifest(inst_dir: Path, template_source: str, instance_name: str) -> dict:
    """Genera manifest.json formalizando el bundle según ADR-001 §3.3."""
    profile_path = inst_dir / "profile.json"
    p_bytes = profile_path.read_bytes() if profile_path.exists() else b""
    p_hash = hashlib.sha256(p_bytes).hexdigest() if p_bytes else ""

    manifest = {
        "bundle_format": BUNDLE_FORMAT_VERSION,
        "runtime_min": RUNTIME_VERSION,
        "instance_name": instance_name,
        "template": template_source,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "profile_sha256": p_hash
    }
    with open(inst_dir / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)
    return manifest

def validate_bundle(inst_dir: Path) -> tuple[dict, dict]:
    """Valida la integridad del bundle de la instancia (profile.json + manifest.json).

    Falla con error explícito antes de arrancar Docker si falta el perfil o es inválido.
    """
    profile_path = inst_dir / "profile.json"
    if not profile_path.exists():
        raise SystemExit(f"[!] Error: La instancia '{inst_dir.name}' no tiene profile.json.")
    try:
        with open(profile_path, "r") as f:
            profile_data = json.load(f)
    except Exception as e:
        raise SystemExit(f"[!] Error: 'profile.json' en '{inst_dir.name}' está malformado: {e}")

    validated_profile = validate_profile(profile_data, source_label=f"profile.json de '{inst_dir.name}'")

    manifest_path = inst_dir / "manifest.json"
    if not manifest_path.exists():
        tmpl_src = validated_profile.get("instance", {}).get("template_source", "unknown")
        manifest = create_bundle_manifest(inst_dir, tmpl_src, inst_dir.name)
    else:
        try:
            with open(manifest_path, "r") as f:
                manifest = json.load(f)
        except Exception as e:
            raise SystemExit(f"[!] Error: 'manifest.json' en '{inst_dir.name}' está malformado: {e}")
        fmt = manifest.get("bundle_format", 0)
        if fmt != BUNDLE_FORMAT_VERSION:
            raise SystemExit(
                f"[!] Error: 'manifest.json' de '{inst_dir.name}' tiene bundle_format={fmt} "
                f"(soportado: {BUNDLE_FORMAT_VERSION})."
            )

    return validated_profile, manifest


def cmd_create_instance(args):
    """Crea una nueva instancia en instances/<nombre>/ con su profile.json congelado."""
    inst_name = validate_instance_name(args.name)
    t_path = find_template(args.template)
    with open(t_path, "r") as f:
        t_data = json.load(f)

    c_data = None
    if args.carrier:
        c_path = find_carrier(args.carrier)
        with open(c_path, "r") as f:
            c_data = json.load(f)

    identity = generate_identity(t_data, c_data)
    inst_dir = INSTANCES_DIR / inst_name
    inst_dir.mkdir(parents=True, exist_ok=True)
    inst_data_dir = inst_dir / "data"
    inst_data_dir.mkdir(exist_ok=True)

    # Clonar base de datos /data desde data-clean si existe y data está vacía
    if CLEAN_DATA_DIR.exists() and not (inst_data_dir / "adb").exists():
        print(f"[*] Inicializando sistema de archivos /data desde plantilla base (data-clean)...")
        safe_name = shlex.quote(inst_name)
        sanitize_sh = (
            f"cp -a /lab/data-clean/* /lab/instances/{safe_name}/data/ 2>/dev/null || true && "
            f"rm -f /lab/instances/{safe_name}/data/property/persistent_properties && "
            f"rm -rf /lab/instances/{safe_name}/data/system/dropbox/* && "
            f"rm -f /lab/instances/{safe_name}/data/system/users/0/settings_ssaid.xml* && "
            f"rm -f /lab/instances/{safe_name}/data/misc/wifi/*.conf* /lab/instances/{safe_name}/data/misc/wifi/*.xml* && "
            f"rm -rf /lab/instances/{safe_name}/data/misc/bluedroid/*"
        )
        clone_cmd = [
            "docker", "run", "--rm",
            "-v", f"{BASE_DIR}:/lab",
            "alpine", "sh", "-c",
            sanitize_sh
        ]
        res = subprocess.run(clone_cmd, capture_output=True)
        if res.returncode == 0:
            print("[✓] Entorno /data base (Magisk, LSPosed, llaves ADB) clonado y sanitizado sin rastros previos.")
        else:
            print(f"[!] Aviso al clonar data: {res.stderr.decode().strip()}")

    # Crear perfil congelado combinando plantilla + operadora + identidad generada
    profile = json.loads(json.dumps(t_data))  # Copia profunda
    profile["instance"] = {
        "name": inst_name,
        "adb_port": args.port,
        "template_source": str(t_path.relative_to(BASE_DIR))
    }

    if c_data:
        profile["telephony"] = {
            "carrier_name": c_data.get("carrier_name", profile.get("telephony", {}).get("carrier_name")),
            "operator_numeric": c_data.get("operator_numeric", profile.get("telephony", {}).get("operator_numeric")),
            "country_iso": c_data.get("country_iso", profile.get("telephony", {}).get("country_iso")),
            "phone_type": c_data.get("phone_type", "1"),
            "network_type": c_data.get("network_type", "13"),
            "timezone": c_data.get("timezone", "America/Argentina/Buenos_Aires")
        }

    # Inyectar identidad generada
    profile["generated_identity"] = identity

    # Guardar en instances/<name>/profile.json
    profile_out = inst_dir / "profile.json"
    with open(profile_out, "w") as f:
        json.dump(profile, f, indent=2)

    # Validar que el perfil generado cumpla el contrato de Fase 1
    validate_profile(profile, source_label=f"profile.json de '{inst_name}'")

    # Generar manifest.json del bundle formalizando ADR-001 §3.3
    create_bundle_manifest(inst_dir, str(t_path.relative_to(BASE_DIR)), inst_name)

    # Guardar metadata de instancia
    disp = profile.get("display", {})
    w = disp.get("width", 1080)
    h = disp.get("height", 2340)
    dpi = disp.get("dpi", 440)
    fps = disp.get("fps", 90)

    meta = {
        "instance_name": inst_name,
        "template": str(t_path.relative_to(BASE_DIR)),
        "carrier": (c_data or {}).get("id", "default"),
        "adb_port": args.port,
        "display": {
            "width": w,
            "height": h,
            "dpi": dpi,
            "fps": fps
        },
        "identity": identity
    }
    with open(inst_dir / "meta.json", "w") as f:
        json.dump(meta, f, indent=2)

    print(f"\n[✓] Instancia '{inst_name}' creada exitosamente en: {inst_dir.relative_to(BASE_DIR)}")
    print(f"  • Modelo      : {profile.get('template', {}).get('name')}")
    print(f"  • Pantalla    : {w}x{h} @ {dpi}dpi ({fps}Hz)")
    print(f"  • Puerto ADB  : {args.port}")
    print(f"  • IMEI        : {identity['imei']}")
    print(f"  • Serial      : {identity['serial']}")
    print(f"  • Wi-Fi MAC   : {identity['wifi_mac']}")
    print(f"  • Wi-Fi SSID  : {identity['wifi_ssid']} ({identity['wifi_bssid']})")
    print(f"  • Perfil JSON : {profile_out.relative_to(BASE_DIR)}")
    print(f"  • Directorio  : {inst_dir.relative_to(BASE_DIR)}/data/")
    print(f"\nPara levantar el contenedor con el gestor:")
    print(f"  python3 tools/instance_manager.py start {inst_name}")
    print(f"\nO con Docker directamente (renderizado optimizado 720x1280@30fps):")
    print(f"  docker run -d --name {inst_name} --privileged \\")
    print(f"    --sysctl net.ipv6.conf.all.disable_ipv6=1 \\")
    print(f"    --sysctl net.ipv6.conf.default.disable_ipv6=1 \\")
    print(f"    -v {inst_dir.resolve()}/data:/data \\")
    print(f"    -v {profile_out.resolve()}:/system/etc/proteomesh_profile.json:ro \\")
    print(f"    -p {args.port}:5555 \\")
    print(f"    proteomesh:latest \\")
    print(f"    androidboot.redroid_gpu_mode=guest \\")
    print(f"    androidboot.use_redroid_c2=1 \\")
    print(f"    androidboot.redroid_width={RENDER_WIDTH} \\")
    print(f"    androidboot.redroid_height={RENDER_HEIGHT} \\")
    print(f"    androidboot.redroid_dpi={RENDER_DPI} \\")
    print(f"    androidboot.redroid_fps={RENDER_FPS}")
    print(f"  # Post-boot: adb shell wm size {w}x{h} && adb shell wm density {dpi}\n")

    if getattr(args, "start", False):
        cmd_start_instance(args)


ADB_CONNECT_TIMEOUT = 90


def _run(cmd, timeout=20, **kwargs):
    """subprocess.run con timeout: evita bloqueos si adb/docker dejan de responder."""
    try:
        return subprocess.run(cmd, timeout=timeout, **kwargs)
    except subprocess.TimeoutExpired:
        print(f"[!] Timeout ({timeout}s): {' '.join(map(str, cmd[:4]))}...")
        return subprocess.CompletedProcess(cmd, 124, stdout="", stderr="timeout")


def container_ip(inst_name):
    """IP del contenedor en la red Docker (vacía si no está corriendo)."""
    r = _run(["docker", "inspect", "-f",
              "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", inst_name],
             timeout=10, capture_output=True, text=True)
    return r.stdout.strip()


def container_network_ok(inst_name):
    """Chequeo host→contenedor: detecta la muerte de red (ARP/datapath) que deja adb offline."""
    ip = container_ip(inst_name)
    if not ip:
        return False, "sin IP (contenedor detenido)"
    r = _run(["ping", "-c", "1", "-W", "2", ip], timeout=5,
             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if r.returncode != 0:
        return False, f"{ip} sin respuesta (ARP/datapath roto)"
    return True, ip


def wait_for_boot(inst_name: str, attempts: int = 150) -> bool:
    """Espera boot_completed=1 y el marcador de apply-props.sh vía docker exec.

    No depende de ADB/red: si el datapath del contenedor muere, adb queda
    offline pero el estado de arranque sigue siendo legible por docker exec.
    """
    for _ in range(attempts):
        run_state = _run(["docker", "inspect", "-f", "{{.State.Running}}", inst_name],
                         timeout=10, capture_output=True, text=True)
        if run_state.stdout.strip() != "true":
            return False
        r = _run(["docker", "exec", inst_name, "getprop", "sys.boot_completed"],
                 timeout=10, capture_output=True, text=True)
        if r.stdout.strip() == "1":
            m = _run(["docker", "exec", inst_name, "ls", "/data/local/tmp/.proteomesh_boot_done"],
                     timeout=10, capture_output=True, text=True)
            if ".proteomesh_boot_done" in m.stdout:
                return True
        time.sleep(2)
    return False


def apply_runtime_defaults(adb_s, meta):
    """Reaplica overrides de pantalla y límites que se pierden al reiniciar."""
    disp = meta.get("display", {})
    w = disp.get("width", 1080)
    h = disp.get("height", 2340)
    dpi = disp.get("dpi", 440)
    display_ok = False
    for _ in range(5):
        _run(["adb", "-s", adb_s, "shell", "wm", "size", f"{w}x{h}"],
             timeout=20, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        _run(["adb", "-s", adb_s, "shell", "wm", "density", str(dpi)],
             timeout=20, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        size_check = _run(["adb", "-s", adb_s, "shell", "wm", "size"],
                          timeout=20, capture_output=True, text=True)
        density_check = _run(["adb", "-s", adb_s, "shell", "wm", "density"],
                             timeout=20, capture_output=True, text=True)
        if (f"Override size: {w}x{h}" in (size_check.stdout or "")
                and f"Override density: {dpi}" in (density_check.stdout or "")):
            display_ok = True
            break
        time.sleep(2)
    if not display_ok:
        print("[!] No se pudo confirmar el override de pantalla; revisar 'wm size' y 'wm density'.")
    disabled_count = 0
    for pkg in DISABLE_PACKAGES:
        res = _run(["adb", "-s", adb_s, "shell", "pm", "disable-user", "--user", "0", pkg],
                   timeout=20, capture_output=True, text=True)
        if "disabled" in res.stdout.lower() or "new state" in res.stdout.lower():
            disabled_count += 1
    for setting_cmd, value in BG_PROCESS_SETTINGS.items():
        _run(["adb", "-s", adb_s, "shell"] + setting_cmd.split() + [value],
             timeout=20, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return w, h, dpi, disabled_count, display_ok


def cmd_start_instance(args):
    """Inicia el contenedor Docker para la instancia especificada con todos los parámetros de hardware."""
    inst_name = validate_instance_name(args.name)
    inst_dir = INSTANCES_DIR / inst_name
    if not inst_dir.exists() or not (inst_dir / "meta.json").exists():
        raise SystemExit(f"[!] Error: La instancia '{inst_name}' no existe en {INSTANCES_DIR}")

    # Validar integridad del bundle (profile.json + manifest.json) ANTES de invocar Docker (Fail-Fast ADR-001)
    profile_data, manifest = validate_bundle(inst_dir)

    with open(inst_dir / "meta.json", "r") as f:
        meta = json.load(f)

    disp = meta.get("display", {})
    w = disp.get("width", 1080)
    h = disp.get("height", 2340)
    dpi = disp.get("dpi", 440)
    fps = disp.get("fps", 90)
    port = meta.get("adb_port", 5580)
    profile_out = inst_dir / "profile.json"

    # Resolución de renderizado real (SurfaceFlinger) vs lógica (apps).
    # Docker arranca con la reducida; post-boot se sobrescribe con wm size/density.
    rw, rh, rdpi, rfps = RENDER_WIDTH, RENDER_HEIGHT, RENDER_DPI, RENDER_FPS

    # Detener contenedor previo si ya existía
    subprocess.run(["docker", "rm", "-f", inst_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    print(f"[*] Iniciando contenedor '{inst_name}' en puerto {port}...")
    run_cmd = [
        "docker", "run", "-d",
        "--name", inst_name,
        "--privileged",
        "--sysctl", "net.ipv6.conf.all.disable_ipv6=1",
        "--sysctl", "net.ipv6.conf.default.disable_ipv6=1",
        "-v", f"{inst_dir.resolve()}/data:/data",
        "-v", f"{profile_out.resolve()}:/system/etc/proteomesh_profile.json:ro",
        "-v", f"{inst_dir.resolve()}:/proteomesh/bundle:ro",
        "-p", f"{port}:5555",
        "proteomesh:latest",
        "androidboot.redroid_gpu_mode=guest",
        "androidboot.use_redroid_c2=1",
        f"androidboot.redroid_width={rw}",
        f"androidboot.redroid_height={rh}",
        f"androidboot.redroid_dpi={rdpi}",
        f"androidboot.redroid_fps={rfps}"
    ]

    res = subprocess.run(run_cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"[!] Error al iniciar Docker: {res.stderr.strip()}")
        return

    cid = res.stdout.strip()[:12]
    print(f"[✓] Contenedor {cid} iniciado correctamente.")
    adb_s = f"127.0.0.1:{port}"

    def connect_adb():
        """Conecta ADB con reintentos hasta que el transporte figure como 'device'."""
        subprocess.run(["adb", "disconnect", adb_s], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        end = time.time() + ADB_CONNECT_TIMEOUT
        while time.time() < end:
            _run(["adb", "connect", adb_s], timeout=10, capture_output=True, text=True)
            d = _run(["adb", "devices"], timeout=10, capture_output=True, text=True)
            if any(parts[:2] == [adb_s, "device"] for parts in
                   (line.split() for line in d.stdout.splitlines())):
                return True
            time.sleep(3)
        return False

    print("[*] Conectando ADB...")
    if not connect_adb():
        net_ok, net_msg = container_network_ok(inst_name)
        print(f"[!] ADB no conectó en {ADB_CONNECT_TIMEOUT}s (serial {adb_s}).")
        print(f"[!] Red host→contenedor: {'OK' if net_ok else 'FALLA'} — {net_msg}")
        print(f"[!] Contenedor dejado en marcha para diagnóstico: docker logs {inst_name}")
        return
    print(f"[✓] ADB conectado: {adb_s}")

    # Limpiar marcadores del arranque anterior: sys.boot_completed se pone a 1
    # antes de que apply-props.sh empiece, y las banderas viejas causarían
    # falsos positivos en wait_for_boot()/detección del módulo actualizado.
    _run(["adb", "-s", adb_s, "shell", "rm", "-f",
          "/data/local/tmp/.proteomesh_boot_done",
          "/data/local/tmp/.proteomesh_module_updated",
          "/data/local/tmp/.proteomesh_scope_updated"],
         timeout=15, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # Configurar zona horaria del operador
    tz = "America/Argentina/Buenos_Aires"
    brand = ""
    if profile_out.exists():
        try:
            with open(profile_out, "r") as pf:
                pdata = json.load(pf)
            tz = pdata.get("telephony", {}).get("timezone", tz)
            brand = pdata.get("device", {}).get("brand", "").lower()
        except Exception:
            pass
    subprocess.run(["docker", "exec", inst_name, "setprop", "persist.sys.timezone", tz], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(["docker", "exec", inst_name, "service", "call", "alarm", "3", "s16", tz], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"[✓] Zona horaria sincronizada: {tz}")

    # Normalizar permisos de sysfs de CPU para que apps sin privilegios lean topología completa
    subprocess.run([
        "docker", "exec", inst_name, "sh", "-c",
        "chmod -R 755 /data/local/tmp/fake_sys_cpu 2>/dev/null || true; "
        "find /data/local/tmp/fake_sys_cpu -type f -exec chmod 644 {} + 2>/dev/null || true; "
        "chmod -R 755 /sys/devices/system/cpu 2>/dev/null || true; "
        "find /sys/devices/system/cpu -type f -exec chmod 644 {} + 2>/dev/null || true"
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # Instalar Brand Store oficial (stub nativo) si aplica al fabricante.
    # Cada stub declara una MainActivity lanzable: sin componentes, LSPosed
    # marca el paquete "obsolete" (fetchProcesses vacío) y borra su fila de
    # scope en cada arranque del daemon.
    store_map = {
        "samsung": ("com.sec.android.app.samsungapps", BASE_DIR / "stubs" / "samsung_galaxy_store.apk", "457001001"),
        "xiaomi": ("com.xiaomi.mipicks", BASE_DIR / "stubs" / "xiaomi_getapps.apk", "221001001"),
        "redmi": ("com.xiaomi.mipicks", BASE_DIR / "stubs" / "xiaomi_getapps.apk", "221001001"),
        "poco": ("com.xiaomi.mipicks", BASE_DIR / "stubs" / "xiaomi_getapps.apk", "221001001"),
        "huawei": ("com.huawei.appmarket", BASE_DIR / "stubs" / "huawei_appgallery.apk", "130100001")
    }

    target_store = None
    for k, v in store_map.items():
        if k in brand:
            target_store = v
            break

    if target_store and target_store[1].exists():
        pkg_name, apk_path, expected_vc = target_store
        need_install = False
        reason = ""
        check_res = _run(["adb", "-s", adb_s, "shell", "pm", "path", pkg_name],
                         timeout=20, capture_output=True, text=True)
        if "package:" not in check_res.stdout:
            need_install = True
            reason = "no instalada"
        else:
            vc_res = _run(["adb", "-s", adb_s, "shell", "dumpsys", "package", pkg_name],
                          timeout=20, capture_output=True, text=True)
            m = re.search(r"versionCode=(\d+)", vc_res.stdout)
            if not m or m.group(1) != expected_vc:
                need_install = True
                reason = f"versión obsoleta ({m.group(1) if m else '?'} != {expected_vc})"
        if need_install:
            print(f"[*] Instalando tienda oficial del fabricante ({apk_path.name}; {reason})...")
            installed = False
            last_out = ""
            for attempt in range(2):
                inst_res = _run(["adb", "-s", adb_s, "install", "-r", str(apk_path)],
                                timeout=180, capture_output=True, text=True)
                last_out = (inst_res.stdout or "") + (inst_res.stderr or "")
                if inst_res.returncode == 0 and "Success" in last_out:
                    installed = True
                    break
                if "signatures do not match" in last_out or "UPDATE_INCOMPATIBLE" in last_out:
                    break
                if attempt == 0:
                    time.sleep(15)
            if not installed and ("signatures do not match" in last_out or "UPDATE_INCOMPATIBLE" in last_out):
                print(f"[*] Firma distinta (stub actualizado): reinstalando limpio {pkg_name}...")
                _run(["adb", "-s", adb_s, "uninstall", pkg_name],
                     timeout=120, capture_output=True, text=True)
                inst_res = _run(["adb", "-s", adb_s, "install", str(apk_path)],
                                timeout=180, capture_output=True, text=True)
                out = (inst_res.stdout or "") + (inst_res.stderr or "")
                installed = inst_res.returncode == 0 and "Success" in out
            if installed:
                print(f"[✓] Tienda del fabricante ({pkg_name}) instalada (v{expected_vc}).")
            else:
                print(f"[!] No se pudo instalar la tienda {pkg_name}; se continúa.")
        else:
            print(f"[✓] Tienda del fabricante verificada ({pkg_name}, v{expected_vc}).")

    # ── Optimización post-boot ───────────────────────────────────────────────

    def post_boot():
        # 1-3. Overrides de pantalla, paquetes y límites de background.
        #    Se verifica el override real: si WindowManager todavía no está
        #    listo, se reintenta para no reportar un falso éxito.
        _, _, _, disabled_count, display_ok = apply_runtime_defaults(adb_s, meta)
        if display_ok:
            print(f"[✓] Display lógico: {w}x{h} @ {dpi}dpi (renderizado real: {rw}x{rh}@{rfps}fps)")
        print(f"[✓] Paquetes desactivados: {disabled_count}/{len(DISABLE_PACKAGES)} (bluetooth, impresión, galería, etc.)")
        print("[✓] Límites de procesos background configurados (max_cached=4)")

    if not wait_for_boot(inst_name):
        net_ok, net_msg = container_network_ok(inst_name)
        print("[!] ERROR: timeout esperando fin de arranque (sys.boot_completed=1 y marcador apply-props).")
        print(f"[!] Red host→contenedor: {'OK' if net_ok else 'FALLA'} — {net_msg}")
        print(f"[!] Contenedor dejado en marcha para diagnóstico: docker logs {inst_name}")
        return
    post_boot()

    # 4. Módulo LSPosed o scope actualizados durante este arranque: lspd no
    #    recarga APKs ni scope en caliente (reiniciarlo tarde forzaría un
    #    reinicio parcial). Se reinicia el contenedor (máx. 2 veces, por si el
    #    sync de scope captura apps nuevas en dos oleadas, p.ej. la tienda del
    #    fabricante instalada durante el primer arranque); lspd precarga todo
    #    en el arranque siguiente desde la DB ya actualizada por
    #    apply-props.sh/manage-spoof.
    for _ in range(2):
        m = _run(["adb", "-s", adb_s, "shell", "ls",
                  "/data/local/tmp/.proteomesh_module_updated",
                  "/data/local/tmp/.proteomesh_scope_updated"],
                 timeout=20, capture_output=True, text=True)
        if (".proteomesh_module_updated" not in m.stdout
                and ".proteomesh_scope_updated" not in m.stdout):
            break
        print("[*] Módulo/scope LSPosed actualizados en este arranque: reiniciando para cargarlos...")
        _run(["adb", "-s", adb_s, "shell", "rm", "-f",
              "/data/local/tmp/.proteomesh_module_updated",
              "/data/local/tmp/.proteomesh_scope_updated"],
             timeout=15, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        _run(["docker", "restart", inst_name], timeout=30,
             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if not connect_adb():
            net_ok, net_msg = container_network_ok(inst_name)
            print(f"[!] ADB no reconectó tras el reinicio del módulo/scope (serial {adb_s}).")
            print(f"[!] Red host→contenedor: {'OK' if net_ok else 'FALLA'} — {net_msg}")
            print(f"[!] Contenedor dejado en marcha para diagnóstico: docker logs {inst_name}")
            return
        _run(["adb", "-s", adb_s, "shell", "rm", "-f",
              "/data/local/tmp/.proteomesh_boot_done",
              "/data/local/tmp/.proteomesh_module_updated",
              "/data/local/tmp/.proteomesh_scope_updated"],
             timeout=15, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if not wait_for_boot(inst_name):
            net_ok, net_msg = container_network_ok(inst_name)
            print("[!] ERROR: timeout esperando el segundo arranque.")
            print(f"[!] Red host→contenedor: {'OK' if net_ok else 'FALLA'} — {net_msg}")
            print(f"[!] Contenedor dejado en marcha para diagnóstico: docker logs {inst_name}")
            return
        post_boot()
        print("[✓] Módulo/scope LSPosed recargados desde el arranque.")

    # Verificación final: un reinicio tardío de WindowManager puede descartar
    # el override aplicado en post_boot. Reaplicarlo antes de devolver el control.
    _, _, _, _, display_ok = apply_runtime_defaults(adb_s, meta)
    if display_ok:
        print("[✓] Overrides finales de pantalla verificados.")

    net_ok, net_msg = container_network_ok(inst_name)
    if net_ok:
        print(f"[✓] Red host→contenedor OK ({net_msg})")
    else:
        print(f"[!] Red host→contenedor: FALLA — {net_msg} (adb puede caer a offline en minutos)")

    print(f"\nPara ver la pantalla ejecuta:")
    print(f"  scrcpy -s 127.0.0.1:{port}\n")


def cmd_stop_instance(args):
    """Detiene y elimina el contenedor Docker de la instancia."""
    inst_name = validate_instance_name(args.name)
    print(f"[*] Deteniendo contenedor '{inst_name}'...")
    subprocess.run(["docker", "rm", "-f", inst_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"[✓] Instancia '{inst_name}' detenida (los datos de /data se conservan en disco).")


def cmd_sync_scope(args):
    """Agrega apps post-boot al scope LSPosed/DenyList y reinicia si hace falta."""
    inst_name = validate_instance_name(args.name)
    inst_dir = INSTANCES_DIR / inst_name
    meta_path = inst_dir / "meta.json"
    if not meta_path.exists():
        print(f"[!] Error: La instancia '{inst_name}' no existe en {INSTANCES_DIR}")
        raise SystemExit(1)
    with open(meta_path, "r") as f:
        meta = json.load(f)
    port = meta.get("adb_port", 5580)
    adb_s = f"127.0.0.1:{port}"

    running = _run(["docker", "inspect", "-f", "{{.State.Running}}", inst_name],
                   timeout=10, capture_output=True, text=True)
    if running.stdout.strip() != "true":
        print(f"[!] La instancia '{inst_name}' no está corriendo. Usá: start {inst_name}")
        raise SystemExit(1)

    _run(["adb", "connect", adb_s], timeout=10, capture_output=True, text=True)
    res = _run(["adb", "-s", adb_s, "shell", "manage-spoof", "sync"],
               timeout=120, capture_output=True, text=True)
    out = ((res.stdout or "") + (res.stderr or "")).strip()
    if out:
        print(out)
    if res.returncode != 0:
        print("[!] No se pudo sincronizar el scope; revisar que ADB esté online.")
        raise SystemExit(1)

    flag = _run(["adb", "-s", adb_s, "shell", "ls",
                 "/data/local/tmp/.proteomesh_scope_updated"],
                timeout=15, capture_output=True, text=True)
    if ".proteomesh_scope_updated" not in flag.stdout:
        print("[✓] Scope ya estaba al día; no hace falta reiniciar.")
    else:
        print("[*] Scope nuevo detectado: reiniciando para que lspd lo cargue...")
        _run(["docker", "exec", inst_name, "rm", "-f",
              "/data/local/tmp/.proteomesh_boot_done"], timeout=15,
             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        _run(["docker", "restart", inst_name], timeout=30)
        if not wait_for_boot(inst_name):
            print("[!] Timeout esperando el reinicio; revisar: docker logs " + inst_name)
            raise SystemExit(1)
        _run(["adb", "connect", adb_s], timeout=10, capture_output=True, text=True)
        w, h, dpi, disabled_count, display_ok = apply_runtime_defaults(adb_s, meta)
        print(f"[✓] Reinicio completado; apply-props.sh volvió a sincronizar el scope.")
        if display_ok:
            print(f"[✓] Overrides restaurados: {w}x{h} @ {dpi}dpi; paquetes desactivados: {disabled_count}")

    if args.package:
        in_scope = False
        in_denylist = False
        for _ in range(15):
            check = _run(["adb", "-s", adb_s, "shell", "manage-spoof", "list"],
                         timeout=30, capture_output=True, text=True)
            if args.package in (check.stdout or ""):
                in_scope = True
                denied = _run(["adb", "-s", adb_s, "shell",
                               "su -c '/sbin/magisk --denylist ls'"],
                              timeout=30, capture_output=True, text=True)
                if args.package in ((denied.stdout or "") + (denied.stderr or "")):
                    in_denylist = True
                    break
            time.sleep(2)
        if not in_scope:
            print(f"[!] El paquete {args.package} no figura en el scope.")
            raise SystemExit(1)
        if not in_denylist:
            print(f"[!] El paquete {args.package} no figura en la DenyList.")
            raise SystemExit(1)
        print(f"[✓] {args.package} verificado en scope LSPosed y DenyList.")


def cmd_list_instances(args):
    """Lista las instancias existentes en instances/ y su estado en Docker."""
    instances = [d for d in INSTANCES_DIR.iterdir() if d.is_dir() and (d / "meta.json").exists()]
    if not instances:
        print("\nNo hay instancias creadas en instances/.")
        print("Usa: python3 tools/instance_manager.py create --name <nombre> --template <modelo>\n")
        return

    ps_res = subprocess.run(["docker", "ps", "--format", "{{.Names}}\t{{.Status}}"], capture_output=True, text=True)
    running_map = {}
    for line in ps_res.stdout.splitlines():
        if "\t" in line:
            name, stat = line.split("\t", 1)
            running_map[name] = stat

    print("====================================================================================================")
    print("                              INSTANCIAS CONFIGURADAS (INSTANCES)")
    print("====================================================================================================")
    for inst in sorted(instances):
        try:
            with open(inst / "meta.json", "r") as f:
                meta = json.load(f)
            t_src = meta.get("template", "Desconocida")
            port = meta.get("adb_port", "5555")
            imei = meta.get("identity", {}).get("imei", "N/A")
            carrier = meta.get("carrier", "default")
            docker_stat = running_map.get(inst.name, "Detenido (Offline)")
            print(f"  • {inst.name:<18} | Puerto: {port:<5} | Estado: {docker_stat:<18} | IMEI: {imei} | SIM: {carrier}")
        except Exception as e:
            print(f"  • {inst.name} (Error al leer meta: {e})")
    print("====================================================================================================")


def main():
    parser = argparse.ArgumentParser(
        description="ProteoMesh Instance Manager (Motor de Instancias CloudPhone estilo GeeLark)"
    )
    subparsers = parser.add_subparsers(dest="command", help="Comandos disponibles")

    # list-templates
    sub = subparsers.add_parser("list-templates", help="Lista las plantillas de hardware disponibles")
    sub.set_defaults(func=cmd_list_templates)

    # list-carriers
    sub = subparsers.add_parser("list-carriers", help="Lista las operadoras telefónicas disponibles")
    sub.set_defaults(func=cmd_list_carriers)

    # randomize
    sub = subparsers.add_parser("randomize", help="Genera y previsualiza identificadores únicos para un modelo")
    sub.add_argument("--template", "-t", required=True, help="Nombre o ruta de la plantilla (ej: a54x o samsung/a54x)")
    sub.add_argument("--carrier", "-c", required=False, help="Nombre o código de la operadora (ej: ar_claro)")
    sub.set_defaults(func=cmd_randomize)

    # create
    sub = subparsers.add_parser("create", help="Crea una nueva instancia")
    sub.add_argument("--name", "-n", required=True, help="Nombre único de la instancia (ej: inst-a54-01)")
    sub.add_argument("--template", "-t", required=True, help="Nombre o ruta de la plantilla (ej: a54x o samsung/a54x)")
    sub.add_argument("--carrier", "-c", required=False, default="ar_personal", help="Operadora (default: ar_personal)")
    sub.add_argument("--port", "-p", type=int, default=5580, help="Puerto ADB para mapear al host (default: 5580)")
    sub.add_argument("--start", "-s", action="store_true", help="Inicia el contenedor inmediatamente")
    sub.set_defaults(func=cmd_create_instance)

    # start
    sub = subparsers.add_parser("start", help="Inicia una instancia existente con sus parámetros de hardware")
    sub.add_argument("name", help="Nombre de la instancia (ej: mi-a54-01)")
    sub.set_defaults(func=cmd_start_instance)

    # stop
    sub = subparsers.add_parser("stop", help="Detiene una instancia existente")
    sub.add_argument("name", help="Nombre de la instancia (ej: mi-a54-01)")
    sub.set_defaults(func=cmd_stop_instance)

    # sync-scope
    sub = subparsers.add_parser("sync-scope", help="Sincroniza apps post-boot al scope LSPosed/DenyList")
    sub.add_argument("name", help="Nombre de la instancia")
    sub.add_argument("--package", "-P", required=False, help="Paquete a verificar tras sincronizar")
    sub.set_defaults(func=cmd_sync_scope)

    # list-instances
    sub = subparsers.add_parser("list-instances", help="Lista las instancias existentes")
    sub.set_defaults(func=cmd_list_instances)

    args = parser.parse_args()
    if not hasattr(args, "func"):
        parser.print_help()
        sys.exit(1)

    args.func(args)


if __name__ == "__main__":
    main()
