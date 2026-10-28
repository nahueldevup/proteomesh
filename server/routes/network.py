"""
Endpoints REST para el Centro de Red USB, Cuarentena e Historial de IPs (NET-USB-001)
=====================================================================================
"""
import asyncio
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from server.services.usb_network_service import usb_network_service
from server.services.network.ip_ledger import ip_ledger

router = APIRouter(prefix="", tags=["Network USB"])


class ClaimUsbRequest(BaseModel):
    preferred_serial: Optional[str] = Field(default=None, description="Serial ADB del módem preferido")
    steal_from: Optional[str] = Field(default=None, description="Instancia previa a desasignar forzosamente")


class TestRotationRequest(BaseModel):
    serial: str = Field(..., description="Serial ADB físico del teléfono a testear")


class BatchQuarantineRequest(BaseModel):
    instances: List[str] = Field(..., description="Lista de nombres de instancias a poner en cuarentena")


class SetTtlRequest(BaseModel):
    ttl: str = Field(..., description="Configuración TTL: 24h, 7d, 30d, permanent")


class DeclineOfferRequest(BaseModel):
    requeue: bool = Field(default=True, description="Si es True, cede el turno y va al final de la cola; si es False, cancela y sale")


@router.get("/network/status", summary="Resumen global de red USB, cola FIFO y dispositivos")
async def get_network_overview():
    devices = await usb_network_service.discover_usb_devices()
    ttl = ip_ledger.get_ttl_setting()
    total = len(devices)
    free = sum(1 for d in devices if d.status == "idle")
    assigned = sum(1 for d in devices if d.status == "assigned")
    waiting = len(usb_network_service.waiting_queue)

    return {
        "summary": {
            "total_usb": total,
            "free_usb": free,
            "assigned_usb": assigned,
            "waiting_count": waiting,
            "ttl": ttl,
        },
        "pending_offer": usb_network_service.get_pending_offer(),
        "waiting_queue": list(usb_network_service.waiting_queue),
        "devices": [
            {
                "serial": d.serial,
                "iface": d.iface,
                "model": d.model,
                "carrier": d.carrier,
                "network_type": d.network_type,
                "battery": d.battery,
                "mobile_data": d.mobile_data,
                "airplane_mode": d.airplane_mode,
                "gateway": d.gateway,
                "subnet": d.subnet,
                "assigned_instance": d.assigned_instance,
                "status": d.status,
            }
            for d in devices
        ],
    }


@router.get("/network/usb", summary="Lista de celulares físicos USB detectados")
async def list_usb_devices():
    devices = await usb_network_service.discover_usb_devices()
    return {
        "devices": [
            {
                "serial": d.serial,
                "iface": d.iface,
                "model": d.model,
                "carrier": d.carrier,
                "network_type": d.network_type,
                "battery": d.battery,
                "mobile_data": d.mobile_data,
                "airplane_mode": d.airplane_mode,
                "gateway": d.gateway,
                "subnet": d.subnet,
                "assigned_instance": d.assigned_instance,
                "status": d.status,
            }
            for d in devices
        ]
    }


@router.post("/network/usb/test-rotation", summary="Probar rotación de Modo Avión en un celular físico")
async def test_rotation(req: TestRotationRequest):
    try:
        res = await usb_network_service.test_rotation(req.serial)
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/instances/{name}/network/state", summary="Estado de red de una instancia específica")
async def get_instance_network_state(name: str):
    return await usb_network_service.get_instance_network_state(name)


@router.post("/instances/{name}/network/claim-usb", summary="Reclamar salida por módem USB")
async def claim_usb(name: str, req: Optional[ClaimUsbRequest] = None):
    preferred = req.preferred_serial if req else None
    steal = req.steal_from if req else None
    try:
        res = await usb_network_service.claim_usb(
            instance_name=name,
            preferred_serial=preferred,
            steal_from=steal,
        )
        return res
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/instances/{name}/network/decline-offer", summary="Declinar oferta de módem USB o ceder turno")
async def decline_offer(name: str, req: Optional[DeclineOfferRequest] = None):
    requeue = req.requeue if req is not None else True
    try:
        return await usb_network_service.decline_offer(name, requeue=requeue)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/instances/{name}/network/quarantine", summary="Poner en cuarentena en caliente y liberar módem")
async def quarantine_instance(name: str):
    try:
        res = await usb_network_service.release_network(name)
        try:
            from server.services.proxy_service import proxy_service
            await proxy_service.quarantine(name)
            proxy_service._set_network_state(name, "quarantined")
        except Exception:
            pass
        return {
            **res,
            "quarantined": True,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/instances/{name}/network/rotate-ip", summary="Forzar rotación de IP por Modo Avión")
async def rotate_ip(name: str):
    try:
        return await usb_network_service.force_rotate_ip(name)
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/network/batch-quarantine", summary="Poner en cuarentena un lote de instancias")
async def batch_quarantine(req: BatchQuarantineRequest):
    results = []
    for inst in req.instances:
        try:
            r = await usb_network_service.release_network(inst)
            results.append({"instance": inst, "status": "ok", "state": r.get("state")})
        except Exception as e:
            results.append({"instance": inst, "status": "error", "error": str(e)})
    return {"results": results}


@router.get("/network/ip-ledger", summary="Historial de IPs públicas registradas")
async def get_ip_ledger(
    limit: int = Query(150, ge=1, le=1000),
    active_only: bool = Query(False),
):
    entries = ip_ledger.list_entries(limit=limit, active_only=active_only)
    ttl = ip_ledger.get_ttl_setting()
    return {
        "ttl": ttl,
        "total_entries": len(entries),
        "entries": entries,
    }


@router.put("/network/ip-ledger/ttl", summary="Actualizar ventana de retención TTL")
async def set_ip_ledger_ttl(req: SetTtlRequest):
    try:
        ttl = ip_ledger.set_ttl_setting(req.ttl)
        return {"status": "ok", "ttl": ttl}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/network/ip-ledger/purge", summary="Purgar entradas expiradas del historial")
async def purge_expired_ledger():
    count = ip_ledger.purge_expired()
    return {"status": "ok", "purged": count}
