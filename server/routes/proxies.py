"""
Rutas para verificación, prueba y gestión de Proxies Residenciales
"""
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException

from server.models.schemas import (
    ProxyTestRequest,
    ProxyTestResponse,
    ProxyConfig,
    InstanceProxyUpdate,
)
from server.services.proxy_service import (
    resolve_proxy_config,
    test_proxy_connection,
    set_instance_proxy,
    parse_proxy_string,
)
from server.services.manager_bridge import get_single_instance

router = APIRouter(prefix="", tags=["Proxies Residenciales"])


@router.post("/proxies/test", response_model=ProxyTestResponse, summary="Probar conexión de proxy y geolocalizar IP")
async def test_proxy(req: ProxyTestRequest):
    """
    Prueba un proxy residencial (SOCKS5 o HTTP), mide latencia en milisegundos y resuelve la IP pública y país de salida.
    Acepta formato URL (`socks5://user:pass@host:port`) o delimitado (`host:port:user:pass`).
    """
    try:
        proxy_config = resolve_proxy_config(req)
    except ValueError as e:
        return ProxyTestResponse(ok=False, error=str(e))

    return await test_proxy_connection(proxy_config, timeout_sec=10.0)


@router.get("/instances/{name}/proxy", response_model=Dict[str, Any], summary="Obtener proxy configurado en una instancia")
def get_instance_proxy(name: str):
    """Retorna la configuración de proxy asignada a la instancia (o null si conecta directo)."""
    try:
        inst = get_single_instance(name)
        return {
            "instance": name,
            "has_proxy": inst.proxy is not None,
            "proxy": inst.proxy.model_dump() if inst.proxy else None
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/instances/{name}/proxy", response_model=Dict[str, Any], summary="Asignar o actualizar proxy de una instancia")
async def update_instance_proxy(name: str, req: InstanceProxyUpdate):
    """
    Asigna un proxy a la instancia. Si auto_sync_location=True, automáticamente
    prueba el proxy y sincroniza el GPS y timezone del CloudPhone para coincidir con la IP del proxy.
    """
    try:
        proxy_config: Optional[ProxyConfig] = None
        if req.raw_proxy:
            proxy_config = parse_proxy_string(req.raw_proxy)
        elif req.proxy:
            proxy_config = req.proxy

        return await set_instance_proxy(name, proxy_config, auto_sync_location=req.auto_sync_location)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/instances/{name}/proxy", response_model=Dict[str, Any], summary="Remover proxy de una instancia")
async def remove_instance_proxy(name: str):
    """Elimina la configuración de proxy de la instancia (vuelve a conexión directa)."""
    try:
        return await set_instance_proxy(name, proxy_config=None, auto_sync_location=False)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
