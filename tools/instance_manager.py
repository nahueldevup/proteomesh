#!/usr/bin/env python3
"""
ProteoMesh Instance Manager (GeeLark / GenFarmer style)
Gestor de instancias y perfiles de hardware para ReDroid / ProteoMesh.

Funcionalidades:
- list-templates : Lista todas las plantillas de hardware disponibles organizadas por marca.
- list-carriers  : Lista las operadoras telefónicas disponibles.
- randomize      : Genera y previsualiza un conjunto único de identificadores (IMEI, MAC, Serial, etc.) para una plantilla.
- create         : Crea una nueva instancia con su carpeta, volumen /data y profile.json congelado.
- list-instances : Lista las instancias creadas en el sistema.
"""

import os
import sys
import json
import random
import string
import argparse
from typing import Optional
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = BASE_DIR / "templates"
CARRIERS_DIR = BASE_DIR / "carriers"
INSTANCES_DIR = BASE_DIR / "instances"


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

    return {
        "imei": imei,
        "meid": meid,
        "serial": serial,
        "android_id": android_id,
        "wifi_mac": wifi_mac,
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
    print(f"  Bluetooth MAC   : {identity['bt_mac']}")
    print(f"  SIM IMSI        : {identity['imsi']}")
    print(f"  SIM ICCID       : {identity['iccid']}")
    print(f"  Línea Telefónica: {identity['phone_number']}")
    print("--------------------------------------------------------------------------------\n")


def cmd_create_instance(args):
    """Crea una nueva instancia en instances/<nombre>/ con su profile.json congelado."""
    t_path = find_template(args.template)
    with open(t_path, "r") as f:
        t_data = json.load(f)

    c_data = None
    if args.carrier:
        c_path = find_carrier(args.carrier)
        with open(c_path, "r") as f:
            c_data = json.load(f)

    identity = generate_identity(t_data, c_data)
    inst_name = args.name
    inst_dir = INSTANCES_DIR / inst_name
    inst_dir.mkdir(parents=True, exist_ok=True)
    (inst_dir / "data").mkdir(exist_ok=True)

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
            "network_type": c_data.get("network_type", "13")
        }

    # Inyectar identidad generada
    profile["generated_identity"] = identity

    # Guardar en instances/<name>/profile.json
    profile_out = inst_dir / "profile.json"
    with open(profile_out, "w") as f:
        json.dump(profile, f, indent=2)

    # Generar metadata de instancia
    meta = {
        "instance_name": inst_name,
        "template": str(t_path.relative_to(BASE_DIR)),
        "carrier": (c_data or {}).get("id", "default"),
        "adb_port": args.port,
        "identity": identity
    }
    with open(inst_dir / "meta.json", "w") as f:
        json.dump(meta, f, indent=2)

    print(f"\n[✓] Instancia '{inst_name}' creada exitosamente en: {inst_dir}")
    print(f"  • Modelo      : {profile.get('template', {}).get('name')}")
    print(f"  • Puerto ADB  : {args.port}")
    print(f"  • IMEI        : {identity['imei']}")
    print(f"  • Serial      : {identity['serial']}")
    print(f"  • Wi-Fi MAC   : {identity['wifi_mac']}")
    print(f"  • Perfil JSON : {profile_out.relative_to(BASE_DIR)}")
    print(f"  • Directorio  : {inst_dir.relative_to(BASE_DIR)}/data/")
    print(f"\nPara levantar el contenedor en Docker:")
    print(f"  docker run -d --name {inst_name} --privileged \\")
    print(f"    -v {inst_dir.resolve()}/data:/data \\")
    print(f"    -v {profile_out.resolve()}:/system/etc/proteomesh_profile.json:ro \\")
    print(f"    -p {args.port}:5555 proteomesh:latest\n")


def cmd_list_instances(args):
    """Lista las instancias existentes en instances/."""
    instances = [d for d in INSTANCES_DIR.iterdir() if d.is_dir() and (d / "meta.json").exists()]
    if not instances:
        print("\nNo hay instancias creadas en instances/.")
        print("Usa: python3 tools/instance_manager.py create --name <nombre> --template <modelo>\n")
        return

    print("================================================================================")
    print("                    INSTANCIAS CONFIGURADAS (INSTANCES)")
    print("================================================================================")
    for inst in sorted(instances):
        try:
            with open(inst / "meta.json", "r") as f:
                meta = json.load(f)
            t_src = meta.get("template", "Desconocida")
            port = meta.get("adb_port", "5555")
            imei = meta.get("identity", {}).get("imei", "N/A")
            serial = meta.get("identity", {}).get("serial", "N/A")
            carrier = meta.get("carrier", "default")
            print(f"  • {inst.name:<18} | Puerto: {port:<5} | Template: {t_src:<22} | IMEI: {imei} | SIM: {carrier}")
        except Exception as e:
            print(f"  • {inst.name} (Error al leer meta: {e})")
    print("================================================================================")


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
    sub.set_defaults(func=cmd_create_instance)

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
