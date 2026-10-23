"""
Puente de servicios Python nativos hacia el motor ProteoMesh
"""
import sys
import json
import asyncio
import subprocess
from pathlib import Path
from typing import Dict, List, Any, Optional

from server.config import (
    REPO_ROOT,
    TOOLS_DIR,
    TEMPLATES_DIR,
    CARRIERS_DIR,
    INSTANCES_DIR,
)

if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from instance_manager import (
    LOCATION_PRESETS,
    parse_location,
    apply_location_to_instance,
    find_template,
    find_carrier,
    validate_instance_name,
    validate_limits,
    generate_identity,
    validate_profile,
    create_bundle_manifest,
    verify_instance_health,
)
from server.models.schemas import (
    LocationSchema,
    LocationUpdate,
    LocationResponse,
    CarrierSchema,
    TemplateItem,
    InstanceCreateRequest,
    InstanceResponse,
    HealthReport,
)


def get_templates_catalog() -> Dict[str, List[TemplateItem]]:
    """Obtiene el catálogo de plantillas organizado por fabricante."""
    catalog: Dict[str, List[TemplateItem]] = {}
    for brand_dir in sorted(TEMPLATES_DIR.iterdir()):
        if brand_dir.is_dir():
            templates = list(brand_dir.glob("*.json"))
            if not templates:
                continue
            catalog[brand_dir.name] = []
            for t_file in sorted(templates):
                try:
                    with open(t_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    catalog[brand_dir.name].append(TemplateItem(
                        id=f"{brand_dir.name}/{t_file.stem}",
                        name=data.get("template", {}).get("name", t_file.stem),
                        market_name=data.get("template", {}).get("market_name"),
                        platform=data.get("template", {}).get("platform"),
                        soc_model=data.get("cpu", {}).get("chipname", data.get("cpu", {}).get("model")),
                        gpu_renderer=data.get("gpu", {}).get("renderer"),
                        screen=f"{data.get('display', {}).get('width')}x{data.get('display', {}).get('height')} @ {data.get('display', {}).get('fps', 60)}Hz"
                    ))
                except Exception:
                    pass
    return catalog


def get_template_detail(brand: str, model: str) -> Dict[str, Any]:
    """Obtiene el JSON completo de una plantilla de hardware específica."""
    p = TEMPLATES_DIR / brand / (model if model.endswith(".json") else f"{model}.json")
    if not p.exists():
        raise FileNotFoundError(f"Plantilla no encontrada: '{brand}/{model}'")
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def get_carriers_catalog() -> List[CarrierSchema]:
    """Obtiene la lista de todas las operadoras telefónicas registradas."""
    res: List[CarrierSchema] = []
    for c_file in sorted(CARRIERS_DIR.glob("*.json")):
        try:
            with open(c_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            res.append(CarrierSchema(**data))
        except Exception:
            pass
    return res


def save_custom_carrier(carrier: CarrierSchema) -> CarrierSchema:
    """Guarda una nueva operadora en el catálogo de carriers/."""
    c_path = CARRIERS_DIR / f"{carrier.id}.json"
    with open(c_path, "w", encoding="utf-8") as f:
        json.dump(carrier.dict(), f, indent=2)
    return carrier


def get_all_locations() -> Dict[str, LocationSchema]:
    """Retorna el catálogo completo de presets geográficos."""
    return {k: LocationSchema(**v) for k, v in LOCATION_PRESETS.items()}


def get_running_containers_map() -> Dict[str, str]:
    """Consulta el estado real de los contenedores en Docker."""
    ps_res = subprocess.run(
        ["docker", "ps", "-a", "--format", "{{.Names}}\t{{.Status}}"],
        capture_output=True, text=True
    )
    running_map = {}
    for line in ps_res.stdout.splitlines():
        if "\t" in line:
            name, stat = line.split("\t", 1)
            running_map[name] = stat
    return running_map


def get_instances_list() -> List[InstanceResponse]:
    """Lista todas las instancias configuradas con su estado actual."""
    instances = [d for d in INSTANCES_DIR.iterdir() if d.is_dir() and (d / "meta.json").exists()]
    running_map = get_running_containers_map()
    res: List[InstanceResponse] = []
    for inst in sorted(instances):
        try:
            with open(inst / "meta.json", "r", encoding="utf-8") as f:
                meta = json.load(f)
            stat = running_map.get(inst.name, "Detenido (Offline)")
            is_running = stat.startswith("Up")
            loc_data = meta.get("location")
            location_obj = LocationSchema(**loc_data) if loc_data else None

            res.append(InstanceResponse(
                instance_name=inst.name,
                template=meta.get("template"),
                carrier=meta.get("carrier"),
                adb_port=meta.get("adb_port", 5555),
                running=is_running,
                docker_status=stat,
                location=location_obj,
                limits=meta.get("limits"),
                identity=meta.get("identity")
            ))
        except Exception:
            pass
    return res


def get_single_instance(name: str) -> InstanceResponse:
    """Obtiene el estado y metadatos de una única instancia."""
    inst_dir = INSTANCES_DIR / name
    meta_path = inst_dir / "meta.json"
    if not inst_dir.exists() or not meta_path.exists():
        raise FileNotFoundError(f"Instancia '{name}' no existe")

    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    running_map = get_running_containers_map()
    stat = running_map.get(name, "Detenido (Offline)")
    loc_data = meta.get("location")
    location_obj = LocationSchema(**loc_data) if loc_data else None

    return InstanceResponse(
        instance_name=name,
        template=meta.get("template"),
        carrier=meta.get("carrier"),
        adb_port=meta.get("adb_port", 5555),
        running=stat.startswith("Up"),
        docker_status=stat,
        location=location_obj,
        limits=meta.get("limits"),
        identity=meta.get("identity")
    )


async def create_instance_async(req: InstanceCreateRequest) -> InstanceResponse:
    """Invoca la creación de una instancia de manera asíncrona."""
    cmd = [
        sys.executable,
        str(TOOLS_DIR / "instance_manager.py"),
        "create",
        "--name", req.name,
        "--port", str(req.port)
    ]
    if req.from_bundle:
        cmd.extend(["--from-bundle", req.from_bundle])
    else:
        if req.template:
            cmd.extend(["--template", req.template])
        if req.carrier:
            cmd.extend(["--carrier", req.carrier])

    if req.custom_location:
        loc_str = f"{req.custom_location.latitude},{req.custom_location.longitude},{req.custom_location.altitude}"
        cmd.extend(["--location", loc_str])
    elif req.location:
        cmd.extend(["--location", req.location])

    if req.seed is not None:
        cmd.extend(["--seed", str(req.seed)])

    if req.limits:
        if req.limits.memory:
            cmd.extend(["--memory", req.limits.memory])
        if req.limits.cpus:
            cmd.extend(["--cpus", req.limits.cpus])
        if req.limits.pids_limit:
            cmd.extend(["--pids-limit", str(req.limits.pids_limit)])

    if req.start:
        cmd.append("--start")

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        err_msg = stderr.decode().strip() or stdout.decode().strip()
        raise RuntimeError(f"Error al crear instancia: {err_msg}")

    return get_single_instance(req.name)


async def start_instance_async(name: str) -> Dict[str, Any]:
    """Inicia un contenedor existente de manera asíncrona."""
    cmd = [
        sys.executable,
        str(TOOLS_DIR / "instance_manager.py"),
        "start",
        name,
        "--verify-health"
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    out = stdout.decode().strip()
    if proc.returncode != 0:
        err = stderr.decode().strip()
        raise RuntimeError(f"Error al iniciar instancia '{name}': {err or out}")
    return {"status": "ok", "instance": name, "message": "Instancia iniciada correctamente"}


async def stop_instance_async(name: str) -> Dict[str, Any]:
    """Detiene un contenedor en ejecución de manera asíncrona."""
    cmd = [
        sys.executable,
        str(TOOLS_DIR / "instance_manager.py"),
        "stop",
        name
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        err = stderr.decode().strip()
        raise RuntimeError(f"Error al detener instancia '{name}': {err}")
    return {"status": "ok", "instance": name, "message": "Instancia detenida"}


def set_instance_location_sync(name: str, update: LocationUpdate) -> LocationResponse:
    """Actualiza la geolocalización en caliente o frío y persiste en disco."""
    inst_name = validate_instance_name(name)
    inst_dir = INSTANCES_DIR / inst_name
    if not inst_dir.exists() or not (inst_dir / "meta.json").exists():
        raise FileNotFoundError(f"Instancia '{inst_name}' no existe")

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

    if update.latitude is not None and update.longitude is not None:
        loc = {
            "city": update.city or f"Coordenadas ({update.latitude:.4f}, {update.longitude:.4f})",
            "latitude": float(update.latitude),
            "longitude": float(update.longitude),
            "altitude": float(update.altitude if update.altitude is not None else 25.0),
            "accuracy": 4.2,
            "timezone": update.timezone or carrier_tz or "America/Argentina/Buenos_Aires"
        }
    elif update.location:
        loc = parse_location(update.location, default_tz=carrier_tz)
        if update.city:
            loc["city"] = update.city
        if update.timezone:
            loc["timezone"] = update.timezone
        if update.altitude is not None:
            loc["altitude"] = float(update.altitude)
    else:
        raise ValueError("Debes especificar 'location' (preset o 'lat,lon') o 'latitude' y 'longitude'.")

    # Persistir en meta.json y profile.json
    meta["location"] = loc
    with open(inst_dir / "meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    if profile_data:
        profile_data["location"] = loc
        with open(profile_path, "w", encoding="utf-8") as f:
            json.dump(profile_data, f, indent=2)

    # Inyectar si el contenedor está en ejecución
    check_cid = subprocess.run(
        ["docker", "ps", "-q", "-f", f"name=^{inst_name}$"],
        capture_output=True, text=True
    ).stdout.strip()

    applied_live = False
    if check_cid:
        port = meta.get("adb_port", 5580)
        adb_s = f"127.0.0.1:{port}"
        apply_location_to_instance(inst_name, adb_s, loc)
        applied_live = True

    return LocationResponse(
        status="ok",
        instance=inst_name,
        applied_live=applied_live,
        running=bool(check_cid),
        location=LocationSchema(**loc)
    )


def get_instance_location_sync(name: str) -> LocationResponse:
    """Obtiene la ubicación de una instancia (en vivo o en disco)."""
    inst_name = validate_instance_name(name)
    inst_dir = INSTANCES_DIR / inst_name
    if not inst_dir.exists() or not (inst_dir / "meta.json").exists():
        raise FileNotFoundError(f"Instancia '{inst_name}' no existe")

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

    return LocationResponse(
        status="ok",
        instance=inst_name,
        running=bool(check_cid),
        is_live_query=is_live,
        location=LocationSchema(**loc)
    )


def check_health_sync(name: str) -> HealthReport:
    """Ejecuta el protocolo de salud post-arranque sobre una instancia."""
    ok, reports = verify_instance_health(name)
    return HealthReport(instance_name=name, ok=ok, reports=reports)
