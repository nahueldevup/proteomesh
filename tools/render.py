#!/usr/bin/env python3
"""
ProteoMesh Pure Profile Renderer (ADR-001 Fase 2)
Renderizador puro y determinista de bundles de hardware.

Principios:
- P2: perfil + carrier + seed -> bundle, determinista (mismo seed => diff vacío).
- Pureza: sin Docker, sin red, sin dependencias externas.
- Coherencia: lint estricto contra schema (GPU<->vendor, TAC, display, release<->SDK).
"""

import os
import re
import sys
import json
import time
import random
import hashlib
import argparse
from pathlib import Path
from typing import Optional, Tuple, List, Dict, Any

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "tools"))

from instance_manager import (
    calc_luhn,
    rand_hex,
    rand_digits,
    generate_identity,
    validate_profile,
    find_template,
    find_carrier,
    TEMPLATES_DIR,
    CARRIERS_DIR,
    BUNDLE_FORMAT_VERSION,
    RUNTIME_VERSION,
    MAC_RE,
    parse_location,
)

OUI_RE = re.compile(r"^[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}$")


def lint_template(doc: Dict[str, Any], source_label: str = "plantilla") -> List[str]:
    """Valida la coherencia holística del hardware declarado en la plantilla (Linter).

    Retorna una lista de errores encontrados (lista vacía si es válida).
    """
    errors: List[str] = []

    # 1. Secciones obligatorias
    for section in ("template", "device", "cpu", "gpu", "display", "identity_template"):
        if section not in doc or not isinstance(doc[section], dict):
            errors.append(f"Falta la sección obligatoria '{section}' o no es un objeto.")

    if errors:
        return errors  # No se puede continuar validando campos internos

    dev = doc["device"]
    disp = doc["display"]
    cpu = doc["cpu"]
    gpu = doc["gpu"]
    id_tmpl = doc["identity_template"]

    # 2. Campos requeridos de device
    for field in ("brand", "model", "manufacturer", "fingerprint", "board",
                  "hardware", "platform", "build_id", "security_patch", "release", "sdk"):
        val = str(dev.get(field) or "").strip()
        if not val:
            errors.append(f"Campo 'device.{field}' faltante o vacío.")

    # 3. Coherencia Android Release <-> SDK
    rel = str(dev.get("release") or "").strip()
    sdk = str(dev.get("sdk") or "").strip()
    sdk_map = {
        "11": ("30",),
        "12": ("31", "32"),
        "13": ("33",),
        "14": ("34",),
    }
    if rel in sdk_map and sdk not in sdk_map[rel]:
        errors.append(
            f"Incoherencia Release/SDK: Android {rel} debe tener SDK {sdk_map[rel]}, pero tiene SDK '{sdk}'."
        )

    # 4. Display
    for key in ("width", "height", "dpi", "fps"):
        val = disp.get(key)
        if not isinstance(val, int) or val <= 0:
            errors.append(f"'display.{key}' debe ser un entero positivo (valor: {val!r}).")

    # 5. CPU & Clusters
    clusters = cpu.get("clusters")
    if not isinstance(clusters, list) or len(clusters) == 0:
        errors.append("'cpu.clusters' debe ser una lista con al menos un cluster de núcleos.")
    else:
        for idx, cl in enumerate(clusters):
            if not isinstance(cl, dict):
                errors.append(f"Cluster #{idx} en 'cpu.clusters' no es un objeto.")
                continue
            count = cl.get("count")
            if not isinstance(count, int) or count <= 0:
                errors.append(f"Cluster #{idx} 'count' debe ser un entero positivo.")
            min_f = cl.get("min_freq")
            max_f = cl.get("max_freq")
            if isinstance(min_f, int) and isinstance(max_f, int) and min_f > max_f:
                errors.append(f"Cluster #{idx} min_freq ({min_f}) es mayor que max_freq ({max_f}).")

    # 6. GPU Coherencia
    gpu_vend = str(gpu.get("vendor") or "").strip()
    gpu_rend = str(gpu.get("renderer") or "").strip()
    if not gpu_vend:
        errors.append("Campo 'gpu.vendor' faltante o vacío.")
    if not gpu_rend:
        errors.append("Campo 'gpu.renderer' faltante o vacío.")

    vend_lower = gpu_vend.lower()
    rend_lower = gpu_rend.lower()

    if "arm" in vend_lower:
        if not rend_lower.startswith("mali"):
            errors.append(f"Incoherencia GPU: fabricante ARM exige GPU Mali, pero tiene '{gpu_rend}'.")
    elif "qualcomm" in vend_lower:
        if not rend_lower.startswith("adreno"):
            errors.append(f"Incoherencia GPU: fabricante Qualcomm exige GPU Adreno, pero tiene '{gpu_rend}'.")
    elif "imagination" in vend_lower:
        if "img" not in rend_lower and "powervr" not in rend_lower:
            errors.append(f"Incoherencia GPU: Imagination Technologies exige PowerVR/IMG, pero tiene '{gpu_rend}'.")

    # 7. Identity template
    tac = str(id_tmpl.get("tac") or "").strip()
    if not tac.isdigit() or len(tac) != 8:
        errors.append(f"'identity_template.tac' debe ser un número de exactamente 8 dígitos (valor: {tac!r}).")

    serial_pfx = str(id_tmpl.get("serial_prefix") or "").strip()
    if not serial_pfx:
        errors.append("'identity_template.serial_prefix' faltante o vacío.")

    w_oui = str(id_tmpl.get("wifi_mac_oui") or "").strip()
    if not OUI_RE.fullmatch(w_oui):
        errors.append(f"'identity_template.wifi_mac_oui' inválido ({w_oui!r}; esperado XX:XX:XX).")

    b_oui = str(id_tmpl.get("bt_mac_oui") or "").strip()
    if not OUI_RE.fullmatch(b_oui):
        errors.append(f"'identity_template.bt_mac_oui' inválido ({b_oui!r}; esperado XX:XX:XX).")

    return errors


def render_bundle(
    template_path: Path,
    carrier_path: Optional[Path] = None,
    seed: Optional[int] = None,
    instance_name: str = "default",
    out_dir: Optional[Path] = None,
    location: Optional[Any] = None,
) -> Dict[str, Any]:
    """Renderiza determinísticamente un bundle de hardware según ADR-001 (Fase 2).

    - Pureza: función sin efectos secundarios salvo si se especifica out_dir.
    - Determinismo: si se especifica seed, la salida es idéntica bit-a-bit en cada ejecución.
    """
    if not template_path.exists():
        raise FileNotFoundError(f"No existe el archivo de plantilla: {template_path}")

    with open(template_path, "r", encoding="utf-8") as f:
        t_data = json.load(f)

    # 1. Lint de coherencia
    errors = lint_template(t_data, str(template_path))
    if errors:
        msg = f"Errores de coherencia en '{template_path}':\n" + "\n".join(f"  • {e}" for e in errors)
        raise ValueError(msg)

    # 2. Operadora
    c_data: Optional[Dict[str, Any]] = None
    if carrier_path:
        if not carrier_path.exists():
            raise FileNotFoundError(f"No existe el archivo de operadora: {carrier_path}")
        with open(carrier_path, "r", encoding="utf-8") as f:
            c_data = json.load(f)

    # 3. Generador determinista
    rng = random.Random(seed) if seed is not None else None
    identity = generate_identity(t_data, c_data, rng=rng)

    # 4. Derivar profile congelado
    profile = json.loads(json.dumps(t_data))
    try:
        tmpl_rel = str(template_path.resolve().relative_to(REPO_ROOT.resolve()))
    except ValueError:
        tmpl_rel = str(template_path)

    profile["instance"] = {
        "name": instance_name,
        "template_source": tmpl_rel,
        "seed": seed,
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

    loc_obj = None
    if location is not None:
        if isinstance(location, str):
            c_tz = (c_data or {}).get("timezone")
            loc_obj = parse_location(location, default_tz=c_tz)
        else:
            loc_obj = dict(location)
        profile["location"] = loc_obj

    profile["generated_identity"] = identity

    # Validar profile derivado según contrato F1
    validate_profile(profile, source_label=f"bundle:{instance_name}")

    # 5. Serializar y calcular hash determinista
    profile_json_bytes = json.dumps(profile, indent=2, sort_keys=True).encode("utf-8")
    p_hash = hashlib.sha256(profile_json_bytes).hexdigest()

    # Si hay seed, la fecha se fija en epoch para determinismo estricto bit-a-bit
    created_at = "1970-01-01T00:00:00Z" if seed is not None else time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    manifest = {
        "bundle_format": BUNDLE_FORMAT_VERSION,
        "runtime_min": RUNTIME_VERSION,
        "instance_name": instance_name,
        "template": tmpl_rel,
        "carrier": (c_data or {}).get("id", "default"),
        "seed": seed,
        "created_at": created_at,
        "profile_sha256": p_hash
    }

    disp = profile.get("display", {})
    meta = {
        "instance_name": instance_name,
        "template": tmpl_rel,
        "carrier": (c_data or {}).get("id", "default"),
        "display": {
            "width": disp.get("width", 1080),
            "height": disp.get("height", 2340),
            "dpi": disp.get("dpi", 440),
            "fps": disp.get("fps", 60)
        },
        "identity": identity,
        "seed": seed
    }
    if loc_obj:
        meta["location"] = loc_obj

    # 6. Escribir a disco si se especificó out_dir
    if out_dir:
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "profile.json").write_bytes(profile_json_bytes)
        with open(out_dir / "manifest.json", "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2, sort_keys=True)
        with open(out_dir / "meta.json", "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2, sort_keys=True)

    return {
        "profile": profile,
        "manifest": manifest,
        "meta": meta,
        "sha256": p_hash
    }


def main():
    parser = argparse.ArgumentParser(
        description="ProteoMesh Pure Profile Renderer (ADR-001 Fase 2)"
    )
    parser.add_argument("--template", "-t", required=True, help="Nombre o ruta de la plantilla (ej: samsung/a54x)")
    parser.add_argument("--carrier", "-c", required=False, help="Nombre o código de la operadora (ej: ar_personal)")
    parser.add_argument("--location", "-l", required=False, help="Ubicación GPS: preset (ej: cordoba, miami) o 'lat,lon[,alt]'")
    parser.add_argument("--seed", "-s", type=int, required=False, help="Semilla numérica para generación determinista")
    parser.add_argument("--name", "-n", default="default", help="Nombre de la instancia (default: default)")
    parser.add_argument("--out", "-o", type=Path, required=False, help="Directorio de salida para el bundle congelado")
    parser.add_argument("--verify", action="store_true", help="Solo verifica y ejecuta el linter sobre la plantilla")

    args = parser.parse_args()

    t_path = find_template(args.template)
    if args.verify:
        with open(t_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        errors = lint_template(data, str(t_path))
        if errors:
            print(f"[!] Errores de coherencia en {t_path}:")
            for e in errors:
                print(f"  • {e}")
            sys.exit(1)
        print(f"[✓] Plantilla '{t_path.name}' es válida y coherente.")
        return

    c_path = find_carrier(args.carrier) if args.carrier else None

    try:
        result = render_bundle(
            template_path=t_path,
            carrier_path=c_path,
            seed=args.seed,
            instance_name=args.name,
            out_dir=args.out,
            location=args.location,
        )
    except Exception as exc:
        print(f"[!] Error al renderizar bundle: {exc}", file=sys.stderr)
        sys.exit(1)

    print(f"[✓] Bundle renderizado exitosamente:")
    print(f"  • Modelo      : {result['profile'].get('template', {}).get('name')}")
    print(f"  • SHA-256     : {result['sha256']}")
    print(f"  • IMEI        : {result['profile']['generated_identity']['imei']}")
    print(f"  • Serial      : {result['profile']['generated_identity']['serial']}")
    print(f"  • Wi-Fi MAC   : {result['profile']['generated_identity']['wifi_mac']}")
    if args.seed is not None:
        print(f"  • Seed        : {args.seed} (Determinista)")
    if args.out:
        print(f"  • Directorio  : {args.out}")


if __name__ == "__main__":
    main()
