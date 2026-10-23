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
RESOURCE_MEM_RE = re.compile(r"^\d+[bkmgBKMG]$")
RESOURCE_CPUS_RE = re.compile(r"^(\d+(\.\d+)?|\d+-\d+(,\d+-\d+)*)$")
BUNDLE_FORMAT_VERSION = 1
RUNTIME_VERSION = "1.0"


def validate_limits(
    memory: Optional[str] = None,
    cpus: Optional[str] = None,
    pids_limit: Optional[int] = None
) -> dict:
    """Valida y normaliza los límites de recursos de Docker (ADR-001 Fase 3)."""
    limits = {}
    if memory:
        mem = str(memory).strip()
        if not RESOURCE_MEM_RE.fullmatch(mem):
            raise SystemExit(
                f"[!] Error: Formato de --memory inválido: {memory!r} "
                "(ejemplos válidos: 4g, 2048m, 512m)."
            )
        limits["memory"] = mem.lower()

    if cpus:
        c = str(cpus).strip()
        if not RESOURCE_CPUS_RE.fullmatch(c):
            raise SystemExit(
                f"[!] Error: Formato de --cpus inválido: {cpus!r} "
                "(ejemplos válidos: 2.0, 1, 0-3)."
            )
        limits["cpus"] = c

    if pids_limit is not None:
        try:
            pl = int(pids_limit)
            if pl < 100:
                raise ValueError()
            limits["pids_limit"] = pl
        except (ValueError, TypeError):
            raise SystemExit(
                f"[!] Error: --pids-limit debe ser un entero >= 100 (recibido: {pids_limit!r})."
            )

    return limits

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
    # Android Auto (2 procesos background que consumen ~210MB)
    "com.google.android.projection.gearhead",
    # Trazas de sistema Perfetto/Systrace (~102MB)
    "com.android.traceur",
    # Asistente de configuración y partners (ya completados en data-clean, ~219MB)
    "com.google.android.setupwizard",
    "com.google.android.partnersetup",
    # Extensiones de cámara OEM (la cámara se virtualiza por LSPosed, ~98MB)
    "com.android.cameraextensions",
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

# ── Catálogo de Presets Geográficos Oficiales ─────────────────────────────────
LOCATION_PRESETS: Dict[str, Dict[str, Any]] = {
    # Argentina
    "ba": {
        "city": "Buenos Aires, Argentina (Obelisco)",
        "latitude": -34.603722,
        "longitude": -58.381592,
        "altitude": 25.0,
        "accuracy": 4.2,
        "timezone": "America/Argentina/Buenos_Aires"
    },
    "buenos-aires": {
        "city": "Buenos Aires, Argentina (Obelisco)",
        "latitude": -34.603722,
        "longitude": -58.381592,
        "altitude": 25.0,
        "accuracy": 4.2,
        "timezone": "America/Argentina/Buenos_Aires"
    },
    "cordoba": {
        "city": "Córdoba, Argentina",
        "latitude": -31.420083,
        "longitude": -64.188776,
        "altitude": 390.0,
        "accuracy": 4.5,
        "timezone": "America/Argentina/Cordoba"
    },
    "rosario": {
        "city": "Rosario, Argentina",
        "latitude": -32.958700,
        "longitude": -60.693000,
        "altitude": 31.0,
        "accuracy": 4.0,
        "timezone": "America/Argentina/Buenos_Aires"
    },
    "mendoza": {
        "city": "Mendoza, Argentina",
        "latitude": -32.889458,
        "longitude": -68.845839,
        "altitude": 746.0,
        "accuracy": 4.8,
        "timezone": "America/Argentina/Mendoza"
    },
    "bariloche": {
        "city": "San Carlos de Bariloche, Argentina",
        "latitude": -41.133472,
        "longitude": -71.310278,
        "altitude": 840.0,
        "accuracy": 5.0,
        "timezone": "America/Argentina/Salta"
    },
    # LATAM
    "sao-paulo": {
        "city": "São Paulo, Brasil",
        "latitude": -23.550520,
        "longitude": -46.633309,
        "altitude": 760.0,
        "accuracy": 4.3,
        "timezone": "America/Sao_Paulo"
    },
    "santiago": {
        "city": "Santiago, Chile",
        "latitude": -33.448890,
        "longitude": -70.669265,
        "altitude": 570.0,
        "accuracy": 4.2,
        "timezone": "America/Santiago"
    },
    "bogota": {
        "city": "Bogotá, Colombia",
        "latitude": 4.710989,
        "longitude": -74.072092,
        "altitude": 2640.0,
        "accuracy": 4.5,
        "timezone": "America/Bogota"
    },
    "lima": {
        "city": "Lima, Perú",
        "latitude": -12.046374,
        "longitude": -77.042793,
        "altitude": 154.0,
        "accuracy": 4.0,
        "timezone": "America/Lima"
    },
    "cdmx": {
        "city": "Ciudad de México, México",
        "latitude": 19.432608,
        "longitude": -99.133209,
        "altitude": 2240.0,
        "accuracy": 4.6,
        "timezone": "America/Mexico_City"
    },
    "mexico": {
        "city": "Ciudad de México, México",
        "latitude": 19.432608,
        "longitude": -99.133209,
        "altitude": 2240.0,
        "accuracy": 4.6,
        "timezone": "America/Mexico_City"
    },
    # USA / Global
    "miami": {
        "city": "Miami, Florida, EE.UU.",
        "latitude": 25.761680,
        "longitude": -80.191790,
        "altitude": 2.0,
        "accuracy": 3.8,
        "timezone": "America/New_York"
    },
    "ny": {
        "city": "Nueva York, EE.UU.",
        "latitude": 40.712776,
        "longitude": -74.005974,
        "altitude": 10.0,
        "accuracy": 4.1,
        "timezone": "America/New_York"
    },
    "new-york": {
        "city": "Nueva York, EE.UU.",
        "latitude": 40.712776,
        "longitude": -74.005974,
        "altitude": 10.0,
        "accuracy": 4.1,
        "timezone": "America/New_York"
    },
    "los-angeles": {
        "city": "Los Ángeles, California, EE.UU.",
        "latitude": 34.052235,
        "longitude": -118.243683,
        "altitude": 89.0,
        "accuracy": 4.0,
        "timezone": "America/Los_Angeles"
    },
    "madrid": {
        "city": "Madrid, España",
        "latitude": 40.416775,
        "longitude": -3.703790,
        "altitude": 657.0,
        "accuracy": 4.0,
        "timezone": "Europe/Madrid"
    },
    "barcelona": {
        "city": "Barcelona, España",
        "latitude": 41.385064,
        "longitude": 2.173403,
        "altitude": 12.0,
        "accuracy": 3.9,
        "timezone": "Europe/Madrid"
    },
    "london": {
        "city": "Londres, Reino Unido",
        "latitude": 51.507351,
        "longitude": -0.127758,
        "altitude": 35.0,
        "accuracy": 4.2,
        "timezone": "Europe/London"
    },
    "tokyo": {
        "city": "Tokio, Japón",
        "latitude": 35.676192,
        "longitude": 139.650311,
        "altitude": 40.0,
        "accuracy": 3.7,
        "timezone": "Asia/Tokyo"
    }
}


def parse_location(val: str, default_tz: Optional[str] = None) -> Dict[str, Any]:
    """Parsea una ciudad/preset o coordenadas 'lat,lon[,alt]' retornando un dict de ubicación normalizado."""
    s = val.strip().lower()
    if s in LOCATION_PRESETS:
        return dict(LOCATION_PRESETS[s])

    if "," in val:
        parts = val.split(",")
        try:
            lat = float(parts[0].strip())
            lon = float(parts[1].strip())
            alt = float(parts[2].strip()) if len(parts) >= 3 else 25.0
        except ValueError:
            raise SystemExit(f"[!] Error: Formato de coordenadas inválido en --location: '{val}' (esperado: lat,lon[,alt])")

        if not (-90.0 <= lat <= 90.0):
            raise SystemExit(f"[!] Error: Latitud inválida: {lat} (debe estar entre -90.0 y 90.0)")
        if not (-180.0 <= lon <= 180.0):
            raise SystemExit(f"[!] Error: Longitud inválida: {lon} (debe estar entre -180.0 y 180.0)")

        return {
            "city": f"Coordenadas ({lat:.4f}, {lon:.4f})",
            "latitude": lat,
            "longitude": lon,
            "altitude": alt,
            "accuracy": 4.2,
            "timezone": default_tz or "America/Argentina/Buenos_Aires"
        }

    raise SystemExit(
        f"[!] Error: Preset de ubicación desconocido: '{val}'. "
        f"Usa 'list-locations' para ver presets disponibles o pasa 'lat,lon' (ej: -31.42,-64.18)."
    )


def apply_location_to_instance(inst_name: str, adb_s: str, loc: Dict[str, Any]) -> bool:
    """Aplica coordenadas GPS y timezone al vuelo a la instancia (FakeGps.java las consume en caliente)."""
    lat = str(loc.get("latitude", -34.603722))
    lon = str(loc.get("longitude", -58.381592))
    alt = str(loc.get("altitude", 25.0))
    acc = str(loc.get("accuracy", 4.2))
    city = str(loc.get("city", "Coordenadas"))
    tz = loc.get("timezone")

    props = [
        ("persist.sys.location.lat", lat),
        ("persist.sys.location.lon", lon),
        ("persist.sys.location.alt", alt),
        ("persist.sys.location.acc", acc),
        ("persist.sys.location.city", city),
    ]
    if tz:
        props.extend([
            ("persist.sys.timezone", tz),
            ("timezone", tz),
        ])

    for k, v in props:
        subprocess.run(["docker", "exec", inst_name, "setprop", k, v],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    if tz:
        subprocess.run(["docker", "exec", inst_name, "service", "call", "alarm", "3", "s16", tz],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return True


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


def rand_hex(length: int, upper: bool = False, rng: Optional[random.Random] = None) -> str:
    """Genera una cadena hexadecimal aleatoria de longitud fija."""
    chars = "0123456789ABCDEF" if upper else "0123456789abcdef"
    chooser = rng.choice if rng else random.choice
    return "".join(chooser(chars) for _ in range(length))


def rand_digits(length: int, rng: Optional[random.Random] = None) -> str:
    """Genera una cadena de dígitos numéricos aleatorios."""
    chooser = rng.choice if rng else random.choice
    return "".join(chooser(string.digits) for _ in range(length))


def generate_identity(template_data: dict, carrier_data: Optional[dict] = None, rng: Optional[random.Random] = None) -> dict:
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
    snr = rand_digits(6, rng=rng)
    base_imei = tac + snr
    cd = calc_luhn(base_imei)
    imei = f"{base_imei}{cd}"

    # 2. MEID
    meid = f"A00000{rand_hex(8, upper=True, rng=rng)}"

    # 3. Serial
    serial_pfx = tmpl_id.get("serial_prefix", "R58R")
    serial = f"{serial_pfx}{rand_hex(6, upper=True, rng=rng)}"

    # 4. Android ID
    android_id = rand_hex(16, upper=False, rng=rng)

    # 5. MACs
    wifi_oui = tmpl_id.get("wifi_mac_oui", "b0:79:94").lower()
    bt_oui = tmpl_id.get("bt_mac_oui", "b0:79:94").lower()
    wifi_mac = f"{wifi_oui}:{rand_hex(2, rng=rng)}:{rand_hex(2, rng=rng)}:{rand_hex(2, rng=rng)}"
    bt_mac = f"{bt_oui}:{rand_hex(2, rng=rng)}:{rand_hex(2, rng=rng)}:{rand_hex(2, rng=rng)}"

    # 6. Telefonía
    c_data = carrier_data or template_data.get("telephony", {})
    imsi_pfx = c_data.get("imsi_prefix", "722310")
    iccid_pfx = c_data.get("iccid_prefix", "895431")
    phone_pfx = c_data.get("phone_prefix", "+54911")

    imsi = f"{imsi_pfx}{rand_digits(15 - len(imsi_pfx), rng=rng)}"
    iccid = f"{iccid_pfx}{rand_digits(19 - len(iccid_pfx), rng=rng)}"
    phone = f"{phone_pfx}{rand_digits(8, rng=rng)}"

    # 7. Wi-Fi SSID / BSSID (estables por instancia; profile-loader los respeta)
    net = template_data.get("network", {})
    ssid_pfx = net.get("ssid_prefix", "Home")
    bssid_oui = net.get("bssid_oui", "F4:EC:38").lower()
    wifi_ssid = f"{ssid_pfx}-{rand_hex(4, upper=True, rng=rng)}"
    wifi_bssid = f"{bssid_oui}:{rand_hex(2, rng=rng)}:{rand_hex(2, rng=rng)}:{rand_hex(2, rng=rng)}"

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

def create_bundle_manifest(
    inst_dir: Path,
    template_source: str,
    instance_name: str,
    seed: Optional[int] = None
) -> dict:
    """Genera manifest.json formalizando el bundle según ADR-001 §3.3."""
    profile_path = inst_dir / "profile.json"
    p_bytes = profile_path.read_bytes() if profile_path.exists() else b""
    p_hash = hashlib.sha256(p_bytes).hexdigest() if p_bytes else ""
    created_at = "1970-01-01T00:00:00Z" if seed is not None else time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    manifest = {
        "bundle_format": BUNDLE_FORMAT_VERSION,
        "runtime_min": RUNTIME_VERSION,
        "instance_name": instance_name,
        "template": template_source,
        "seed": seed,
        "created_at": created_at,
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
    limits = validate_limits(
        getattr(args, "memory", None),
        getattr(args, "cpus", None),
        getattr(args, "pids_limit", None)
    )

    from_bundle_path = getattr(args, "from_bundle", None)
    if from_bundle_path:
        bundle_dir = Path(from_bundle_path)
        if not bundle_dir.exists():
            raise SystemExit(f"[!] Error: El directorio bundle '{bundle_dir}' no existe.")
        src_profile = bundle_dir / "profile.json"
        if not src_profile.exists():
            raise SystemExit(f"[!] Error: El bundle '{bundle_dir}' no contiene profile.json.")
        try:
            with open(src_profile, "r", encoding="utf-8") as f:
                profile = json.load(f)
        except Exception as e:
            raise SystemExit(f"[!] Error al leer profile.json del bundle: {e}")

        validate_profile(profile, source_label=f"bundle:{bundle_dir}")

        src_manifest = bundle_dir / "manifest.json"
        manifest_data = {}
        if src_manifest.exists():
            try:
                with open(src_manifest, "r", encoding="utf-8") as f:
                    manifest_data = json.load(f)
            except Exception as e:
                raise SystemExit(f"[!] Error al leer manifest.json del bundle: {e}")
            fmt = manifest_data.get("bundle_format", 0)
            if fmt != BUNDLE_FORMAT_VERSION:
                raise SystemExit(f"[!] Error: bundle_format={fmt} no soportado (esperado: {BUNDLE_FORMAT_VERSION}).")

        src_meta = bundle_dir / "meta.json"
        meta_data = {}
        if src_meta.exists():
            try:
                with open(src_meta, "r", encoding="utf-8") as f:
                    meta_data = json.load(f)
            except Exception:
                pass

        identity = profile.get("generated_identity") or profile.get("identity")
        t_src = profile.get("instance", {}).get("template_source") or manifest_data.get("template", "bundle")
        carrier_id = manifest_data.get("carrier") or meta_data.get("carrier", "default")
        seed = manifest_data.get("seed", getattr(args, "seed", None))
        if "instance" not in profile:
            profile["instance"] = {}
        profile["instance"]["name"] = inst_name
        profile["instance"]["adb_port"] = args.port
    else:
        if not getattr(args, "template", None):
            raise SystemExit("[!] Error: Se requiere especificar --template o --from-bundle.")
        t_path = find_template(args.template)
        with open(t_path, "r", encoding="utf-8") as f:
            t_data = json.load(f)

        c_data = None
        if getattr(args, "carrier", None):
            c_path = find_carrier(args.carrier)
            with open(c_path, "r", encoding="utf-8") as f:
                c_data = json.load(f)

        seed = getattr(args, "seed", None)
        rng = random.Random(seed) if seed is not None else None
        identity = generate_identity(t_data, c_data, rng=rng)
        t_src = str(t_path.relative_to(BASE_DIR))
        carrier_id = (c_data or {}).get("id", "default")

        # Crear perfil congelado combinando plantilla + operadora + identidad generada
        profile = json.loads(json.dumps(t_data))
        profile["instance"] = {
            "name": inst_name,
            "adb_port": args.port,
            "template_source": t_src
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

        profile["generated_identity"] = identity

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

    # Configurar geoubicación inicial (en frío)
    loc_arg = getattr(args, "location", None)
    carrier_tz = (c_data or {}).get("timezone") if 'c_data' in locals() and c_data else profile.get("telephony", {}).get("timezone", "America/Argentina/Buenos_Aires")
    if loc_arg:
        location = parse_location(loc_arg, default_tz=carrier_tz)
    else:
        location = dict(LOCATION_PRESETS["ba"])
        location["timezone"] = carrier_tz
    profile["location"] = location

    # Guardar en instances/<name>/profile.json
    profile_out = inst_dir / "profile.json"
    with open(profile_out, "w", encoding="utf-8") as f:
        json.dump(profile, f, indent=2)

    # Validar que el perfil generado cumpla el contrato de Fase 1
    validate_profile(profile, source_label=f"profile.json de '{inst_name}'")

    # Generar manifest.json del bundle formalizando ADR-001 §3.3
    create_bundle_manifest(inst_dir, t_src, inst_name, seed=seed)

    # Guardar metadata de instancia
    disp = profile.get("display", {})
    w = disp.get("width", 1080)
    h = disp.get("height", 2340)
    dpi = disp.get("dpi", 440)
    fps = disp.get("fps", 90)

    meta = {
        "instance_name": inst_name,
        "template": t_src,
        "carrier": carrier_id,
        "adb_port": args.port,
        "seed": seed,
        "limits": limits,
        "location": location,
        "display": {
            "width": w,
            "height": h,
            "dpi": dpi,
            "fps": fps
        },
        "identity": identity
    }
    with open(inst_dir / "meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    try:
        inst_dir_disp = inst_dir.relative_to(BASE_DIR)
        profile_out_disp = profile_out.relative_to(BASE_DIR)
    except ValueError:
        inst_dir_disp = inst_dir
        profile_out_disp = profile_out

    print(f"\n[✓] Instancia '{inst_name}' creada exitosamente en: {inst_dir_disp}")
    print(f"  • Modelo      : {profile.get('template', {}).get('name')}")
    print(f"  • Ubicación   : {location['city']} ({location['latitude']:.4f}, {location['longitude']:.4f})")
    print(f"  • Pantalla    : {w}x{h} @ {dpi}dpi ({fps}Hz)")
    print(f"  • Puerto ADB  : {args.port}")
    print(f"  • IMEI        : {identity['imei']}")
    print(f"  • Serial      : {identity['serial']}")
    print(f"  • Wi-Fi MAC   : {identity['wifi_mac']}")
    print(f"  • Wi-Fi SSID  : {identity['wifi_ssid']} ({identity['wifi_bssid']})")
    print(f"  • Perfil JSON : {profile_out_disp}")
    print(f"  • Directorio  : {inst_dir_disp}/data/")
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

    # Límites de recursos (de meta.json o flags CLI)
    limits = dict(meta.get("limits") or {})
    cli_limits = validate_limits(
        getattr(args, "memory", None),
        getattr(args, "cpus", None),
        getattr(args, "pids_limit", None)
    )
    limits.update(cli_limits)

    print(f"[*] Iniciando contenedor '{inst_name}' en puerto {port}...")
    run_cmd = [
        "docker", "run", "-d",
        "--name", inst_name,
        "--privileged",
        "--sysctl", "net.ipv6.conf.all.disable_ipv6=1",
        "--sysctl", "net.ipv6.conf.default.disable_ipv6=1",
    ]

    if limits.get("memory"):
        run_cmd.extend(["--memory", limits["memory"]])
    if limits.get("cpus"):
        cpus_val = str(limits["cpus"])
        if "-" in cpus_val or "," in cpus_val:
            run_cmd.extend(["--cpuset-cpus", cpus_val])
        else:
            run_cmd.extend(["--cpus", cpus_val])
    if limits.get("pids_limit"):
        run_cmd.extend(["--pids-limit", str(limits["pids_limit"])])

    run_cmd.extend([
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
    ])

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

    # Inyectar geoubicación configurada en el perfil
    loc = meta.get("location") or (pdata.get("location") if 'pdata' in locals() and pdata else None)
    if loc:
        apply_location_to_instance(inst_name, adb_s, loc)
        print(f"[✓] Ubicación GPS configurada: {loc.get('city')} ({loc.get('latitude')}, {loc.get('longitude')})")

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

    if getattr(args, "verify_health", False):
        cmd_verify_health(args)


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
            loc_city = meta.get("location", {}).get("city", "Buenos Aires")
            docker_stat = running_map.get(inst.name, "Detenido (Offline)")
            print(f"  • {inst.name:<18} | Puerto: {port:<5} | Estado: {docker_stat:<18} | Ciudad: {loc_city:<22} | IMEI: {imei} | SIM: {carrier}")
        except Exception as e:
            print(f"  • {inst.name} (Error al leer meta: {e})")
    print("====================================================================================================")


def cmd_set_location(args):
    """Establece o actualiza la ubicación GPS de una instancia en caliente o en frío."""
    inst_name = validate_instance_name(args.name)
    inst_dir = INSTANCES_DIR / inst_name
    if not inst_dir.exists() or not (inst_dir / "meta.json").exists():
        raise SystemExit(f"[!] Error: La instancia '{inst_name}' no existe en {INSTANCES_DIR}")

    with open(inst_dir / "meta.json", "r", encoding="utf-8") as f:
        meta = json.load(f)

    carrier_tz = None
    profile_path = inst_dir / "profile.json"
    profile_data = {}
    if profile_path.exists():
        try:
            with open(profile_path, "r", encoding="utf-8") as f:
                profile_data = json.load(f)
            carrier_tz = profile_data.get("telephony", {}).get("timezone")
        except Exception:
            pass

    # Determinar si se pasó lat/lon explícito o preset/coordenadas por argumento
    if args.lat is not None and args.lon is not None:
        loc = {
            "city": args.city or f"Coordenadas ({args.lat:.4f}, {args.lon:.4f})",
            "latitude": float(args.lat),
            "longitude": float(args.lon),
            "altitude": float(args.alt if args.alt is not None else 25.0),
            "accuracy": 4.2,
            "timezone": args.timezone or carrier_tz or "America/Argentina/Buenos_Aires"
        }
    elif getattr(args, "location", None):
        loc = parse_location(args.location, default_tz=carrier_tz)
        if getattr(args, "city", None):
            loc["city"] = args.city
        if getattr(args, "timezone", None):
            loc["timezone"] = args.timezone
        if getattr(args, "alt", None) is not None:
            loc["altitude"] = float(args.alt)
    else:
        raise SystemExit("[!] Error: Debes especificar una ciudad/preset (ej: miami, cordoba), coordenadas 'lat,lon' o flags --lat y --lon.")

    # Validar rangos geográficos
    if not (-90.0 <= loc["latitude"] <= 90.0):
        raise SystemExit(f"[!] Error: Latitud inválida: {loc['latitude']} (debe estar entre -90.0 y 90.0)")
    if not (-180.0 <= loc["longitude"] <= 180.0):
        raise SystemExit(f"[!] Error: Longitud inválida: {loc['longitude']} (debe estar entre -180.0 y 180.0)")

    # Actualizar meta.json y profile.json
    meta["location"] = loc
    with open(inst_dir / "meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    if profile_data:
        profile_data["location"] = loc
        with open(profile_path, "w", encoding="utf-8") as f:
            json.dump(profile_data, f, indent=2)

    # Verificar si el contenedor está corriendo
    port = meta.get("adb_port", 5580)
    adb_s = f"127.0.0.1:{port}"
    check_cid = subprocess.run(
        ["docker", "ps", "-q", "-f", f"name=^{inst_name}$"],
        capture_output=True, text=True
    ).stdout.strip()

    applied_live = False
    if check_cid:
        apply_location_to_instance(inst_name, adb_s, loc)
        applied_live = True

    if getattr(args, "json", False):
        print(json.dumps({
            "status": "ok",
            "instance": inst_name,
            "applied_live": applied_live,
            "location": loc
        }, indent=2))
    else:
        status_msg = "aplicada en caliente al contenedor en ejecución" if applied_live else "guardada para el próximo arranque"
        print(f"[✓] Ubicación actualizada ({status_msg}):")
        print(f"  • Ciudad    : {loc['city']}")
        print(f"  • Latitud   : {loc['latitude']}")
        print(f"  • Longitud  : {loc['longitude']}")
        print(f"  • Altitud   : {loc['altitude']}m")
        print(f"  • Timezone  : {loc['timezone']}")


def cmd_get_location(args):
    """Obtiene la ubicación GPS configurada o actual de una instancia."""
    inst_name = validate_instance_name(args.name)
    inst_dir = INSTANCES_DIR / inst_name
    if not inst_dir.exists() or not (inst_dir / "meta.json").exists():
        raise SystemExit(f"[!] Error: La instancia '{inst_name}' no existe en {INSTANCES_DIR}")

    with open(inst_dir / "meta.json", "r", encoding="utf-8") as f:
        meta = json.load(f)

    loc = meta.get("location")
    is_live = False
    check_cid = subprocess.run(
        ["docker", "ps", "-q", "-f", f"name=^{inst_name}$"],
        capture_output=True, text=True
    ).stdout.strip()
    if check_cid:
        live_lat = subprocess.run(["docker", "exec", inst_name, "getprop", "persist.sys.location.lat"], capture_output=True, text=True).stdout.strip()
        live_lon = subprocess.run(["docker", "exec", inst_name, "getprop", "persist.sys.location.lon"], capture_output=True, text=True).stdout.strip()
        live_city = subprocess.run(["docker", "exec", inst_name, "getprop", "persist.sys.location.city"], capture_output=True, text=True).stdout.strip()
        live_tz = subprocess.run(["docker", "exec", inst_name, "getprop", "persist.sys.timezone"], capture_output=True, text=True).stdout.strip()
        if live_lat and live_lon:
            is_live = True
            live_alt = subprocess.run(["docker", "exec", inst_name, "getprop", "persist.sys.location.alt"], capture_output=True, text=True).stdout.strip() or "25.0"
            loc = {
                "city": live_city or (loc.get("city") if loc else "Coordenadas"),
                "latitude": float(live_lat),
                "longitude": float(live_lon),
                "altitude": float(live_alt),
                "accuracy": 4.2,
                "timezone": live_tz or (loc.get("timezone") if loc else "America/Argentina/Buenos_Aires")
            }

    if not loc:
        loc = dict(LOCATION_PRESETS["ba"])

    if getattr(args, "json", False):
        print(json.dumps({
            "status": "ok",
            "instance": inst_name,
            "running": bool(check_cid),
            "is_live_query": is_live,
            "location": loc
        }, indent=2))
    else:
        print(f"=== Ubicación de '{inst_name}' ({'En Vivo' if is_live else 'En Disco'}) ===")
        print(f"  • Ciudad    : {loc.get('city')}")
        print(f"  • Latitud   : {loc.get('latitude')}")
        print(f"  • Longitud  : {loc.get('longitude')}")
        print(f"  • Altitud   : {loc.get('altitude')}m")
        print(f"  • Timezone  : {loc.get('timezone')}")


def cmd_list_locations(args):
    """Lista todos los presets de ubicación disponibles."""
    if getattr(args, "json", False):
        print(json.dumps(LOCATION_PRESETS, indent=2))
    else:
        print("====================================================================================================")
        print("                              PRESETS DE UBICACIÓN GEOGRÁFICA (GPS)")
        print("====================================================================================================")
        for key, info in sorted(LOCATION_PRESETS.items()):
            print(f"  • {key:<14} -> {info['city']} ({info['latitude']:.4f}, {info['longitude']:.4f}) [{info['timezone']}]")
        print("====================================================================================================")


def verify_instance_health(inst_name: str) -> tuple[bool, list[str]]:
    """Protocolo de verificación post-arranque de ProteoMesh (ADR-001 Fase 3)."""
    reports = []
    all_ok = True

    inst_dir = INSTANCES_DIR / inst_name
    meta_path = inst_dir / "meta.json"
    if not meta_path.exists():
        return False, [f"[!] Instancia '{inst_name}' no existe en {INSTANCES_DIR}"]

    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)
    port = meta.get("adb_port", 5580)
    adb_s = f"127.0.0.1:{port}"

    # 1. Estado del contenedor Docker
    run_state = _run(["docker", "inspect", "-f", "{{.State.Running}}", inst_name],
                     timeout=10, capture_output=True, text=True)
    if run_state.stdout.strip() == "true":
        reports.append("[✓] Contenedor Docker: en ejecución")
    else:
        reports.append("[!] Contenedor Docker: detenido o ausente")
        return False, reports

    # 2. Red host -> contenedor
    net_ok, net_msg = container_network_ok(inst_name)
    if net_ok:
        reports.append(f"[✓] Red host→contenedor: OK ({net_msg})")
    else:
        reports.append(f"[!] Red host→contenedor: FALLA ({net_msg})")
        all_ok = False

    # 3. Conexión ADB y sys.boot_completed
    _run(["adb", "connect", adb_s], timeout=10, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    boot_res = _run(["adb", "-s", adb_s, "shell", "getprop", "sys.boot_completed"],
                    timeout=15, capture_output=True, text=True)
    if boot_res.stdout.strip() == "1":
        reports.append("[✓] Estado de boot: completado (sys.boot_completed=1)")
    else:
        reports.append(f"[!] Estado de boot: incompleto ({boot_res.stdout.strip()!r})")
        all_ok = False

    # 4. Marcador de arranque ProteoMesh
    marker = _run(["docker", "exec", inst_name, "ls", "/data/local/tmp/.proteomesh_boot_done"],
                  timeout=10, capture_output=True, text=True)
    if ".proteomesh_boot_done" in marker.stdout:
        reports.append("[✓] Inicialización ProteoMesh: completada (.proteomesh_boot_done)")
    else:
        reports.append("[!] Inicialización ProteoMesh: marcador .proteomesh_boot_done ausente")
        all_ok = False

    # 5. Overrides de pantalla
    disp = meta.get("display", {})
    w, h, dpi = disp.get("width", 1080), disp.get("height", 2340), disp.get("dpi", 440)
    size_out = _run(["adb", "-s", adb_s, "shell", "wm", "size"], timeout=10, capture_output=True, text=True).stdout or ""
    dens_out = _run(["adb", "-s", adb_s, "shell", "wm", "density"], timeout=10, capture_output=True, text=True).stdout or ""
    if f"Override size: {w}x{h}" in size_out and f"Override density: {dpi}" in dens_out:
        reports.append(f"[✓] Overrides de pantalla: confirmados ({w}x{h} @ {dpi}dpi)")
    else:
        reports.append(f"[!] Overrides de pantalla: discrepancia (size: {size_out.strip()!r}, density: {dens_out.strip()!r})")
        all_ok = False

    # 6. Identidad de modelo inyectada
    model_out = (_run(["adb", "-s", adb_s, "shell", "getprop", "ro.product.model"], timeout=10, capture_output=True, text=True).stdout or "").strip()
    brand_out = (_run(["adb", "-s", adb_s, "shell", "getprop", "ro.product.brand"], timeout=10, capture_output=True, text=True).stdout or "").strip()
    if model_out and brand_out:
        reports.append(f"[✓] Perfil de hardware: {brand_out} {model_out}")
    else:
        reports.append("[!] Perfil de hardware: props de modelo vacías")
        all_ok = False

    # 7. DenyList de Magisk
    dl_out = _run(["adb", "-s", adb_s, "shell", "su -c '/sbin/magisk --denylist ls'"], timeout=15, capture_output=True, text=True).stdout or ""
    if "net.pixelscan.check" in dl_out or "at.persie0.root_detection_app" in dl_out or "com.google.android.verifier" in dl_out:
        reports.append(f"[✓] Magisk DenyList: activa ({len(dl_out.strip().splitlines())} paquetes protegidos)")
    elif dl_out.strip():
        reports.append(f"[✓] Magisk DenyList: activa ({len(dl_out.strip().splitlines())} paquetes)")
    else:
        reports.append("[!] Magisk DenyList: vacía o inaccesible")

    return all_ok, reports


def cmd_verify_health(args):
    """Comando CLI para ejecutar el protocolo de verificación post-arranque."""
    inst_name = validate_instance_name(args.name)
    print(f"[*] Ejecutando protocolo de verificación de salud para '{inst_name}'...")
    ok, lines = verify_instance_health(inst_name)
    for line in lines:
        print(f"  {line}")
    if ok:
        print(f"\n[✓] Health-check de '{inst_name}' COMPLETADO EXITOSAMENTE.")
    else:
        print(f"\n[!] Health-check de '{inst_name}' PRESENTÓ ADVERTENCIAS O FALLOS.", file=sys.stderr)
        raise SystemExit(1)


def cmd_render(args):
    """Comando CLI para renderizar un bundle determinista según ADR-001 (Fase 2)."""
    from render import render_bundle, lint_template
    t_path = find_template(args.template)
    if getattr(args, "verify", False):
        with open(t_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        errors = lint_template(data, str(t_path))
        if errors:
            print(f"[!] Errores de coherencia en {t_path}:")
            for e in errors:
                print(f"  • {e}")
            raise SystemExit(1)
        print(f"[✓] Plantilla '{t_path.name}' es válida y coherente.")
        return

    c_path = find_carrier(args.carrier) if getattr(args, "carrier", None) else None
    res = render_bundle(
        template_path=t_path,
        carrier_path=c_path,
        seed=getattr(args, "seed", None),
        instance_name=getattr(args, "name", "default"),
        out_dir=getattr(args, "out", None),
        location=getattr(args, "location", None)
    )
    print(f"[✓] Bundle renderizado exitosamente:")
    print(f"  • Modelo      : {res['profile'].get('template', {}).get('name')}")
    if res['profile'].get('location'):
        loc_r = res['profile']['location']
        print(f"  • Ubicación   : {loc_r.get('city')} ({loc_r.get('latitude'):.4f}, {loc_r.get('longitude'):.4f}) [{loc_r.get('timezone')}]")
    print(f"  • SHA-256     : {res['sha256']}")
    print(f"  • IMEI        : {res['profile']['generated_identity']['imei']}")
    print(f"  • Serial      : {res['profile']['generated_identity']['serial']}")
    print(f"  • Wi-Fi MAC   : {res['profile']['generated_identity']['wifi_mac']}")
    if getattr(args, "seed", None) is not None:
        print(f"  • Seed        : {args.seed} (Determinista)")
    if getattr(args, "out", None):
        print(f"  • Directorio  : {args.out}")


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
    sub.add_argument("--template", "-t", required=False, help="Nombre o ruta de la plantilla (ej: a54x o samsung/a54x)")
    sub.add_argument("--from-bundle", "-b", required=False, help="Ruta al bundle pre-renderizado (ADR-001 Fase 3)")
    sub.add_argument("--carrier", "-c", required=False, default="ar_personal", help="Operadora (default: ar_personal)")
    sub.add_argument("--location", "-l", required=False, help="Ubicación GPS: preset (ej: cordoba, miami) o 'lat,lon[,alt]'")
    sub.add_argument("--port", "-p", type=int, default=5580, help="Puerto ADB para mapear al host (default: 5580)")
    sub.add_argument("--seed", "-s", type=int, required=False, help="Semilla numérica para generación determinista")
    sub.add_argument("--memory", "-m", required=False, help="Límite de memoria RAM para el contenedor (ej: 4g, 3072m)")
    sub.add_argument("--cpus", required=False, help="Límite de CPU para el contenedor (ej: 0-3 para pinning, o 2.0)")
    sub.add_argument("--pids-limit", type=int, required=False, help="Límite de PIDs (ej: 4096 o sin límite; evitar <3000 para no agotar hilos en Android 13)")
    sub.add_argument("--start", "-s_auto", action="store_true", dest="start", help="Inicia el contenedor inmediatamente")
    sub.set_defaults(func=cmd_create_instance)

    # render (Fase 2 ADR-001)
    sub = subparsers.add_parser("render", help="Renderiza un bundle determinista (ADR-001 Fase 2)")
    sub.add_argument("--template", "-t", required=True, help="Nombre o ruta de la plantilla (ej: a54x o samsung/a54x)")
    sub.add_argument("--carrier", "-c", required=False, help="Nombre o código de la operadora (ej: ar_personal)")
    sub.add_argument("--location", "-l", required=False, help="Ubicación GPS: preset (ej: cordoba, miami) o 'lat,lon[,alt]'")
    sub.add_argument("--seed", "-s", type=int, required=False, help="Semilla numérica para generación determinista")
    sub.add_argument("--name", "-n", default="default", help="Nombre de la instancia (default: default)")
    sub.add_argument("--out", "-o", type=Path, required=False, help="Directorio de salida para el bundle congelado")
    sub.add_argument("--verify", action="store_true", help="Solo verifica y ejecuta el linter sobre la plantilla")
    sub.set_defaults(func=cmd_render)

    # start
    sub = subparsers.add_parser("start", help="Inicia una instancia existente con sus parámetros de hardware")
    sub.add_argument("name", help="Nombre de la instancia (ej: mi-a54-01)")
    sub.add_argument("--memory", "-m", required=False, help="Override temporal de memoria RAM (ej: 4g)")
    sub.add_argument("--cpus", required=False, help="Override temporal de CPU (ej: 2.0, 0-3)")
    sub.add_argument("--pids-limit", type=int, required=False, help="Override temporal de PIDs")
    sub.add_argument("--verify-health", action="store_true", help="Ejecuta protocolo de salud post-arranque")
    sub.set_defaults(func=cmd_start_instance)

    # verify-health (Fase 3 ADR-001)
    sub = subparsers.add_parser("verify-health", help="Verifica el estado y salud post-arranque de la instancia")
    sub.add_argument("name", help="Nombre de la instancia (ej: f05-main)")
    sub.set_defaults(func=cmd_verify_health)

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

    # set-location (Geolocalización en caliente o frío)
    sub = subparsers.add_parser("set-location", help="Establece la ubicación GPS (en caliente o en frío)")
    sub.add_argument("name", help="Nombre de la instancia (ej: f05-main)")
    sub.add_argument("location", nargs="?", default=None, help="Preset (ej: miami, cordoba) o coordenadas 'lat,lon'")
    sub.add_argument("--lat", type=float, required=False, help="Latitud decimal (-90.0 a 90.0)")
    sub.add_argument("--lon", type=float, required=False, help="Longitud decimal (-180.0 a 180.0)")
    sub.add_argument("--alt", type=float, required=False, help="Altitud en metros")
    sub.add_argument("--city", required=False, help="Nombre descriptivo de la ciudad")
    sub.add_argument("--timezone", required=False, help="Huso horario IANA (ej: America/Argentina/Cordoba)")
    sub.add_argument("--json", action="store_true", help="Salida estructurada en JSON para IA y APIs")
    sub.set_defaults(func=cmd_set_location)

    # get-location
    sub = subparsers.add_parser("get-location", help="Consulta la ubicación GPS actual o configurada")
    sub.add_argument("name", help="Nombre de la instancia (ej: f05-main)")
    sub.add_argument("--json", action="store_true", help="Salida estructurada en JSON para IA y APIs")
    sub.set_defaults(func=cmd_get_location)

    # list-locations
    sub = subparsers.add_parser("list-locations", help="Lista el catálogo de presets de ubicación geográfica")
    sub.add_argument("--json", action="store_true", help="Salida estructurada en JSON para IA y APIs")
    sub.set_defaults(func=cmd_list_locations)

    args = parser.parse_args()
    if not hasattr(args, "func"):
        parser.print_help()
        sys.exit(1)

    args.func(args)


if __name__ == "__main__":
    main()
