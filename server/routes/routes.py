"""
API de Rutas de salida: catálogo SOCKS5, asignación a instancias,
estado de red con cuarentena y detección de módems USB físicos (Fase 2).
"""
import re
import subprocess
import asyncio
from typing import Dict, Any, Optional, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from server.services.network.route_store import route_store
from server.services.network.lease_registry import IpConflictError, lease_registry
from server.services.network.transport import QuarantineError
from server.services.proxy_service import (
    proxy_service,
    parse_proxy_string,
    test_proxy_connection,
)
from server.services.manager_bridge import get_single_instance
from server.config import INSTANCES_DIR, TOOLS_DIR

router = APIRouter(prefix="", tags=["Rutas y Salidas de Red"])


class RouteCreate(BaseModel):
    label: str = Field(..., description="Nombre visible de la ruta (ej: 'Argentina - Personal')")
    uri: Optional[str] = Field(default=None, description="socks5://user:pass@host:port")
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    type: str = Field(default="socks5", description="socks5 | usb_mobile")


class AssignRequest(BaseModel):
    instance: str
    auto_sync_location: bool = True


class ReleaseRequest(BaseModel):
    instance: str
    allow_direct: bool = False


class InstanceNetworkRequest(BaseModel):
    instance: Optional[str] = None


def _route_owner(route: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Busca un lease activo que corresponda al host/puerto de la ruta."""
    host, port = route.get("host"), route.get("port")
    for lease in lease_registry.list_active_leases():
        meta = lease.get("metadata") or {}
        if meta.get("host") == host and int(meta.get("port") or 0) == int(port or 0):
            return lease
    return None


def _route_payload() -> List[Dict[str, Any]]:
    """Catálogo enriquecido con lease/IP de salida y estado por ruta."""
    result = []
    for route in route_store.list_routes():
        masked = route_store.masked(route["id"])
        lease = _route_owner(route)
        masked["assigned_instance"] = lease["instance_id"] if lease else None
        masked["exit_ip"] = lease["exit_ip"] if lease else None
        masked["latency_ms"] = (lease.get("metadata") or {}).get("latency_ms") if lease else None
        masked["status"] = "active" if lease else ("disabled" if not route["enabled"] else "idle")
        result.append(masked)
    return result


def _detect_usb_devices() -> List[Dict[str, Any]]:
    """
    Teléfonos físicos por USB (excluye emuladores y las instancias ReDroid de 127.0.0.1).
    USB-Mobile completo llega en Fase 2; acá se reporta presencia y estado de tethering.
    """
    devices: List[Dict[str, Any]] = []
    try:
        out = subprocess.run(
            ["adb", "devices", "-l"], capture_output=True, text=True, timeout=5
        ).stdout
    except Exception:
        return devices

    for line in out.splitlines()[1:]:
        line = line.strip()
        if not line or "\t" not in line:
            continue
        serial, rest = line.split("\t", 1)
        parts = rest.split()
        state = parts[0] if parts else "unknown"
        if serial.startswith("127.0.0.1:") or serial.startswith("emulator-"):
            continue
        if "usb:" not in rest and ":" in serial:
            continue

        props = {"model": None, "tether_enabled": None, "usb_state": None}
        if state == "device":
            try:
                props["model"] = subprocess.run(
                    ["adb", "-s", serial, "shell", "getprop", "ro.product.model"],
                    capture_output=True, text=True, timeout=4
                ).stdout.strip()
                props["tether_enabled"] = subprocess.run(
                    ["adb", "-s", serial, "shell", "settings", "get", "global", "tether_enabled"],
                    capture_output=True, text=True, timeout=4
                ).stdout.strip()
                props["usb_state"] = subprocess.run(
                    ["adb", "-s", serial, "shell", "getprop", "sys.usb.state"],
                    capture_output=True, text=True, timeout=4
                ).stdout.strip()
            except Exception:
                pass

        devices.append({
            "serial": serial,
            "state": state,
            "model": props["model"],
            "tether_enabled": props["tether_enabled"] in ("1", "true"),
            "usb_state": props["usb_state"],
            "supported": False,
            "phase": 2,
        })
    return devices


@router.get("/routes", summary="Catálogo de rutas y estado del enrutamiento")
def list_routes():
    leases = lease_registry.list_active_leases()
    return {
        "routes": _route_payload(),
        "usb_devices": _detect_usb_devices(),
        "leases": leases,
        "summary": {
            "routes": len(route_store.list_routes()),
            "active": len(leases),
            "quarantined": sum(
                1 for n in _instance_names() if _read_state(n) == "quarantined"
            ),
        },
    }


@router.post("/routes", summary="Crear una ruta SOCKS5")
def create_route(req: RouteCreate):
    try:
        if req.uri:
            cfg = parse_proxy_string(req.uri, default_type="socks5")
            host, port = cfg.host, cfg.port
            username, password = cfg.username, cfg.password
            route_type = cfg.type
        else:
            if not req.host or not req.port:
                raise ValueError("Debes enviar 'uri' o 'host' y 'port'.")
            host, port = req.host, int(req.port)
            username, password = req.username, req.password
            route_type = req.type

        if route_type != "socks5":
            raise ValueError("Por ahora solo se pueden crear rutas SOCKS5 (USB-Mobile: Fase 2).")
        if route_store.get_by_label(req.label):
            raise HTTPException(status_code=409, detail="Ya existe una ruta con ese nombre.")

        created = route_store.create(req.label, host, port, username, password, route_type)
        return {"status": "ok", "route": created}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/routes/{route_id}", summary="Detalle de una ruta")
def get_route(route_id: int):
    masked = route_store.masked(route_id)
    if not masked:
        raise HTTPException(status_code=404, detail="Ruta no encontrada.")
    lease = _route_owner(route_store.get(route_id) or {})
    masked["assigned_instance"] = lease["instance_id"] if lease else None
    masked["exit_ip"] = lease["exit_ip"] if lease else None
    masked["status"] = "active" if lease else "idle"
    return masked


@router.delete("/routes/{route_id}", summary="Eliminar una ruta del catálogo")
def delete_route(route_id: int):
    if not route_store.delete(route_id):
        raise HTTPException(status_code=404, detail="Ruta no encontrada.")
    return {"status": "ok", "deleted": route_id}


@router.post("/routes/{route_id}/test", summary="Probar una ruta sin asignarla")
async def test_route(route_id: int):
    route = route_store.get(route_id)
    if not route:
        raise HTTPException(status_code=404, detail="Ruta no encontrada.")
    try:
        cfg = parse_proxy_string(route_store.to_uri(route), default_type="socks5")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    result = await test_proxy_connection(cfg, timeout_sec=10.0)
    return result


@router.post("/routes/{route_id}/assign", summary="Asignar una ruta a una instancia")
async def assign_route(route_id: int, req: AssignRequest):
    route = route_store.get(route_id)
    if not route:
        raise HTTPException(status_code=404, detail="Ruta no encontrada.")
    if not route.get("enabled"):
        raise HTTPException(status_code=409, detail="La ruta está deshabilitada.")
    try:
        result = await proxy_service.configure_socks5(
            req.instance, route_store.to_uri(route), auto_sync_location=req.auto_sync_location
        )
        result["route_id"] = route_id
        return result
    except IpConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except QuarantineError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ruta no aplicada: {e}")


@router.post("/routes/{route_id}/release", summary="Quitar la ruta de una instancia")
async def release_route(route_id: int, req: ReleaseRequest):
    try:
        return await proxy_service.disconnect_proxy(req.instance, allow_direct=req.allow_direct)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except QuarantineError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/instances/{name}/network", summary="Estado de red, ruta y cuarentena")
async def instance_network(name: str):
    try:
        return await proxy_service.get_proxy_status(name)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/instances/{name}/network/allow-direct", summary="Permitir salida directa (sin ruta)")
async def allow_direct(name: str):
    try:
        await proxy_service.allow_direct(name)
        return await proxy_service.get_proxy_status(name)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


class UsbAttachRequest(BaseModel):
    iface: Optional[str] = Field(default=None, description="Interfaz USB del host (autodetectada si se omite)")


async def _run_usb_action(action: str, name: str, iface: Optional[str] = None) -> Dict[str, Any]:
    cmd = ["bash", str(TOOLS_DIR / "network" / "usb_tether.sh"), action, name]
    if iface:
        cmd.append(iface)
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=30)
    except asyncio.TimeoutError:
        try:
            proc.kill()
        except Exception:
            pass
        raise HTTPException(status_code=504, detail=f"Timeout (30s) ejecutando acción USB '{action}'")

    text = (out or err).decode(errors="replace").strip()
    if proc.returncode != 0:
        raise HTTPException(status_code=400, detail=text or f"Fallo al {action} USB")
    return {"status": "ok", "action": action, "instance": name, "output": text}


@router.get("/instances/{name}/usb", summary="Estado del enganche USB-Mobile")
def usb_instance_status(name: str):
    state_file = INSTANCES_DIR / name / "usb_tether.json"
    if not (INSTANCES_DIR / name / "meta.json").exists():
        raise HTTPException(status_code=404, detail="Instancia no encontrada.")
    state = None
    if state_file.exists():
        try:
            import json
            state = json.loads(state_file.read_text(encoding="utf-8"))
        except Exception:
            state = None
    return {"instance": name, "attached": state is not None, "state": state}


@router.post("/instances/{name}/usb/attach", summary="Enganchar un módem USB a la instancia")
async def usb_attach(name: str, req: Optional[UsbAttachRequest] = None):
    try:
        from server.services.usb_network_service import usb_network_service
        res = await usb_network_service.claim_usb(name)
        return {"status": "ok", "action": "attach", "instance": name, "output": f"USB enganchado a {name}", "details": res}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/instances/{name}/usb/detach", summary="Desenganchar el módem USB")
async def usb_detach(name: str):
    try:
        from server.services.usb_network_service import usb_network_service
        res = await usb_network_service.release_network(name)
        return {"status": "ok", "action": "detach", "instance": name, "output": res.get("message", "USB desenganchado"), "details": res}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


def _instance_names() -> List[str]:
    from server.db.instance_store import instance_store
    return [m["instance_name"] for m in instance_store.list_all()]


def _read_state(instance_name: str) -> Optional[str]:
    try:
        from server.db.instance_store import instance_store
        meta = instance_store.get(instance_name)
        if meta and meta.get("network"):
            return meta["network"].get("state")
    except Exception:
        pass
    return None
