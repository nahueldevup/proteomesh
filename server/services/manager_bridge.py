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
    ProxyConfig,
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
            proxy_data = meta.get("proxy")
            proxy_obj = ProxyConfig(**proxy_data) if proxy_data else None

            res.append(InstanceResponse(
                instance_name=inst.name,
                template=meta.get("template"),
                carrier=meta.get("carrier"),
                adb_port=meta.get("adb_port", 5555),
                running=is_running,
                docker_status=stat,
                location=location_obj,
                proxy=proxy_obj,
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
    proxy_data = meta.get("proxy")
    proxy_obj = ProxyConfig(**proxy_data) if proxy_data else None

    return InstanceResponse(
        instance_name=name,
        template=meta.get("template"),
        carrier=meta.get("carrier"),
        adb_port=meta.get("adb_port", 5555),
        running=stat.startswith("Up"),
        docker_status=stat,
        location=location_obj,
        proxy=proxy_obj,
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

    # Preservar ciudad y timezone personalizados en meta.json
    if req.custom_location and (req.custom_location.city or req.custom_location.timezone):
        inst_dir = INSTANCES_DIR / req.name
        meta_path = inst_dir / "meta.json"
        if meta_path.exists():
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                if "location" in meta:
                    if req.custom_location.city:
                        meta["location"]["city"] = req.custom_location.city
                    if req.custom_location.timezone:
                        meta["location"]["timezone"] = req.custom_location.timezone
                with open(meta_path, "w", encoding="utf-8") as f:
                    json.dump(meta, f, indent=2)
            except Exception:
                pass

    # Asignar proxy residencial si fue provisto
    if req.raw_proxy or req.proxy:
        try:
            from server.services.proxy_service import parse_proxy_string, set_instance_proxy
            p_cfg = parse_proxy_string(req.raw_proxy) if req.raw_proxy else req.proxy
            if p_cfg:
                await set_instance_proxy(req.name, p_cfg, auto_sync_location=False)
        except Exception:
            pass

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


# ── Funciones de Control Interactivo y Pantalla ──────────────────────────────
def launch_native_scrcpy(name: str) -> Dict[str, Any]:
    """Lanza la ventana nativa de scrcpy conectada al contenedor en el escritorio del host."""
    import os
    inst_name = validate_instance_name(name)
    inst_dir = INSTANCES_DIR / inst_name
    meta_path = inst_dir / "meta.json"
    if not meta_path.exists():
        raise FileNotFoundError(f"Instancia '{inst_name}' no existe")

    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    port = meta.get("adb_port", 5580)

    # Verificar que el contenedor esté corriendo
    cid = subprocess.run(
        ["docker", "ps", "-q", "-f", f"name=^{inst_name}$"],
        capture_output=True, text=True
    ).stdout.strip()
    if not cid:
        raise RuntimeError(f"El CloudPhone '{inst_name}' está detenido. Inícialo primero para abrir scrcpy.")

    # Asegurar entorno gráfico DISPLAY / WAYLAND
    env = os.environ.copy()
    if "DISPLAY" not in env:
        env["DISPLAY"] = ":0"

    cmd = [
        "scrcpy",
        "-s", f"127.0.0.1:{port}",
        f"--window-title=ProteoMesh CloudPhone [{inst_name}]",
        "--max-fps=30",
        "--video-bit-rate=4M",
    ]

    try:
        proc = subprocess.Popen(
            cmd,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True
        )
        return {
            "status": "launched",
            "instance": inst_name,
            "adb_port": port,
            "pid": proc.pid,
            "message": f"Ventana nativa scrcpy abierta en 127.0.0.1:{port}"
        }
    except FileNotFoundError:
        raise RuntimeError("scrcpy no está instalado en el host del servidor.")
    except Exception as e:
        raise RuntimeError(f"Error al lanzar scrcpy: {e}")


def get_instance_screenshot(name: str, format: str = "jpeg", max_width: int = 540) -> bytes:
    """Captura el frame actual de la pantalla de una instancia en ejecución."""
    inst_name = validate_instance_name(name)
    cid = subprocess.run(
        ["docker", "ps", "-q", "-f", f"name=^{inst_name}$"],
        capture_output=True, text=True
    ).stdout.strip()
    if not cid:
        raise RuntimeError(f"Instancia '{inst_name}' no está en ejecución.")

    res = subprocess.run(["docker", "exec", inst_name, "screencap", "-p"], capture_output=True)
    if res.returncode != 0 or not res.stdout:
        raise RuntimeError(f"Error al capturar pantalla de '{inst_name}': {res.stderr.decode().strip()}")

    raw_png = res.stdout
    if format.lower() in ("jpeg", "jpg"):
        try:
            import io
            from PIL import Image
            im = Image.open(io.BytesIO(raw_png)).convert("RGB")
            if max_width and im.width > max_width:
                aspect = im.height / im.width
                new_h = int(max_width * aspect)
                im = im.resize((max_width, new_h), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, format="JPEG", quality=75, optimize=True)
            return buf.getvalue()
        except Exception:
            return raw_png
    return raw_png


def send_instance_tap(name: str, x: int, y: int) -> Dict[str, Any]:
    """Envía un toque en pantalla (tap) a las coordenadas especificadas."""
    inst_name = validate_instance_name(name)
    res = subprocess.run(["docker", "exec", inst_name, "input", "tap", str(x), str(y)], capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"Error al enviar tap a '{inst_name}': {res.stderr.strip()}")
    return {"status": "ok", "action": "tap", "x": x, "y": y}


def send_instance_swipe(name: str, x1: int, y1: int, x2: int, y2: int, duration_ms: int = 300) -> Dict[str, Any]:
    """Envía un gesto de deslizamiento (swipe) entre dos puntos."""
    inst_name = validate_instance_name(name)
    res = subprocess.run(
        ["docker", "exec", inst_name, "input", "swipe", str(x1), str(y1), str(x2), str(y2), str(duration_ms)],
        capture_output=True, text=True
    )
    if res.returncode != 0:
        raise RuntimeError(f"Error al enviar swipe a '{inst_name}': {res.stderr.strip()}")
    return {"status": "ok", "action": "swipe", "from": [x1, y1], "to": [x2, y2], "duration_ms": duration_ms}


KEY_MAP = {
    "back": "4",
    "home": "3",
    "recents": "187",
    "app_switch": "187",
    "power": "26",
    "volup": "24",
    "volume_up": "24",
    "voldown": "25",
    "volume_down": "25",
    "menu": "82",
    "enter": "66",
    "tab": "61",
    "delete": "67",
}

def send_instance_key(name: str, key: str) -> Dict[str, Any]:
    """Envía una pulsación de tecla física o virtual a Android."""
    inst_name = validate_instance_name(name)
    keycode = KEY_MAP.get(key.lower().strip(), key.strip())
    res = subprocess.run(["docker", "exec", inst_name, "input", "keyevent", keycode], capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"Error al enviar keyevent '{key}' a '{inst_name}': {res.stderr.strip()}")
    return {"status": "ok", "action": "key", "key": key, "keycode": keycode}


def send_instance_text(name: str, text: str) -> Dict[str, Any]:
    """Escribe texto en el foco actual de Android."""
    import shlex
    inst_name = validate_instance_name(name)
    # input text reemplaza espacios por %s
    escaped = text.replace(" ", "%s").replace("&", "\\&").replace("'", "\\'")
    res = subprocess.run(["docker", "exec", inst_name, "input", "text", escaped], capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"Error al enviar texto a '{inst_name}': {res.stderr.strip()}")
    return {"status": "ok", "action": "text", "length": len(text)}


def launch_instance_url(name: str, url: str) -> Dict[str, Any]:
    """Abre una URL en el navegador web por defecto del CloudPhone."""
    inst_name = validate_instance_name(name)
    clean_url = url.strip()
    if not clean_url.startswith(("http://", "https://")):
        clean_url = f"https://{clean_url}"
    res = subprocess.run(
        ["docker", "exec", inst_name, "am", "start", "-a", "android.intent.action.VIEW", "-d", clean_url],
        capture_output=True, text=True
    )
    if res.returncode != 0:
        raise RuntimeError(f"Error al abrir URL en '{inst_name}': {res.stderr.strip()}")
    return {"status": "ok", "action": "launch_url", "url": clean_url}
