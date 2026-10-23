"""
Servicio de parsing, prueba y gestión de Proxies Residenciales
"""
import time
import json
import asyncio
import subprocess
from urllib.parse import urlparse
from typing import Optional, Dict, Any, Tuple
import httpx

from server.config import INSTANCES_DIR
from server.models.schemas import (
    ProxyConfig,
    ProxyTestRequest,
    ProxyTestResponse,
    LocationUpdate,
)
from server.services.manager_bridge import set_instance_location_sync


def parse_proxy_string(s: str, default_type: str = "socks5") -> ProxyConfig:
    """Parsea una cadena de proxy en formato URL (socks5://...) o delimitado por dos puntos (ip:port:user:pass)."""
    s = s.strip()
    if not s:
        raise ValueError("Cadena de proxy vacía.")

    # 1. Formato URL estándar (ej: socks5://user:pass@1.2.3.4:1080 o http://1.2.3.4:8080)
    if "://" in s:
        u = urlparse(s)
        ptype = u.scheme.lower()
        if ptype not in ("socks5", "socks5h", "http", "https"):
            raise ValueError(f"Protocolo de proxy no soportado: '{u.scheme}' (usar 'socks5' o 'http')")
        clean_type = "socks5" if "socks5" in ptype else "http"
        if not u.hostname or not u.port:
            raise ValueError(f"Falta host o puerto en URL de proxy: '{s}'")
        return ProxyConfig(
            type=clean_type,
            host=u.hostname,
            port=u.port,
            username=u.username or None,
            password=u.password or None
        )

    # 2. Formato delimitado por dos puntos (común en proveedores de proxies residenciales)
    parts = s.split(":")
    if len(parts) == 4:
        # host:port:user:pass
        host, port_s, user, pwd = parts
        try:
            port = int(port_s)
        except ValueError:
            raise ValueError(f"Puerto inválido: '{port_s}'")
        return ProxyConfig(
            type=default_type,
            host=host.strip(),
            port=port,
            username=user.strip(),
            password=pwd.strip()
        )
    elif len(parts) == 2:
        # host:port
        host, port_s = parts
        try:
            port = int(port_s)
        except ValueError:
            raise ValueError(f"Puerto inválido: '{port_s}'")
        return ProxyConfig(
            type=default_type,
            host=host.strip(),
            port=port,
            username=None,
            password=None
        )

    raise ValueError(f"Formato de proxy no reconocido: '{s}'. Usar 'socks5://user:pass@host:port' o 'host:port:user:pass'.")


def resolve_proxy_config(req: ProxyTestRequest) -> ProxyConfig:
    """Resuelve un ProxyConfig a partir de una solicitud flexible (URL raw o campos estructurados)."""
    if req.proxy_url:
        return parse_proxy_string(req.proxy_url, default_type=req.type or "socks5")

    if not req.host or not req.port:
        raise ValueError("Debes proporcionar 'proxy_url' o 'host' y 'port'.")

    return ProxyConfig(
        type=req.type or "socks5",
        host=req.host.strip(),
        port=req.port,
        username=req.username.strip() if req.username else None,
        password=req.password.strip() if req.password else None
    )


async def test_proxy_connection(proxy: ProxyConfig, timeout_sec: float = 10.0) -> ProxyTestResponse:
    """Prueba la conexión real a través del proxy, mide la latencia y resuelve la IP y país de salida."""
    proxy_url = proxy.url
    t0 = time.perf_counter()

    # Intentar resolver IP y geolocalización a través del proxy
    geo_endpoints = [
        "http://ip-api.com/json/?fields=status,message,country,countryCode,city,timezone,lat,lon,query",
        "https://api.ipify.org?format=json",
    ]

    try:
        async with httpx.AsyncClient(proxy=proxy_url, timeout=timeout_sec, follow_redirects=True) as client:
            res = await client.get(geo_endpoints[0])
            latency_ms = round((time.perf_counter() - t0) * 1000.0, 1)

            if res.status_code == 200:
                data = res.json()
                if data.get("status") == "success" or "query" in data:
                    return ProxyTestResponse(
                        ok=True,
                        ip=data.get("query"),
                        country=data.get("country"),
                        country_code=data.get("countryCode"),
                        city=data.get("city"),
                        timezone=data.get("timezone"),
                        latitude=data.get("lat"),
                        longitude=data.get("lon"),
                        latency_ms=latency_ms,
                        proxy=proxy
                    )

            # Fallback a endpoint secundario
            res2 = await client.get(geo_endpoints[1])
            latency_ms = round((time.perf_counter() - t0) * 1000.0, 1)
            if res2.status_code == 200:
                data2 = res2.json()
                return ProxyTestResponse(
                    ok=True,
                    ip=data2.get("ip"),
                    latency_ms=latency_ms,
                    proxy=proxy
                )

        return ProxyTestResponse(
            ok=False,
            latency_ms=round((time.perf_counter() - t0) * 1000.0, 1),
            error=f"Respuesta inesperada del servidor de verificación (HTTP {res.status_code})",
            proxy=proxy
        )

    except httpx.ProxyError as e:
        return ProxyTestResponse(
            ok=False,
            error=f"Error de proxy: No se pudo conectar al host {proxy.host}:{proxy.port} ({e})",
            proxy=proxy
        )
    except httpx.ConnectTimeout:
        return ProxyTestResponse(
            ok=False,
            error=f"Tiempo de espera agotado ({timeout_sec}s): El proxy no respondió",
            proxy=proxy
        )
    except Exception as e:
        return ProxyTestResponse(
            ok=False,
            error=f"Fallo al conectar a través del proxy: {str(e)}",
            proxy=proxy
        )


async def set_instance_proxy(
    instance_name: str,
    proxy_config: Optional[ProxyConfig],
    auto_sync_location: bool = True
) -> Dict[str, Any]:
    """Asigna o remueve el proxy de una instancia, persistiendo en disco y opcionalmente sincronizando GPS."""
    inst_dir = INSTANCES_DIR / instance_name
    meta_path = inst_dir / "meta.json"
    if not inst_dir.exists() or not meta_path.exists():
        raise FileNotFoundError(f"Instancia '{instance_name}' no existe")

    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    profile_path = inst_dir / "profile.json"
    profile_data = {}
    if profile_path.exists():
        try:
            with open(profile_path, "r", encoding="utf-8") as f:
                profile_data = json.load(f)
        except Exception:
            pass

    location_synced = None

    if proxy_config is None:
        meta.pop("proxy", None)
        profile_data.pop("proxy", None)
        # Remover proxy en caliente si el contenedor corre
        check_cid = subprocess.run(
            ["docker", "ps", "-q", "-f", f"name=^{instance_name}$"],
            capture_output=True, text=True
        ).stdout.strip()
        if check_cid:
            subprocess.run(["docker", "exec", instance_name, "settings", "put", "global", "http_proxy", ":0"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        meta["proxy"] = proxy_config.model_dump()
        profile_data["proxy"] = proxy_config.model_dump()

        # Si se solicita auto_sync_location, probar el proxy para obtener su ciudad/timezone y sincronizar GPS
        if auto_sync_location:
            test_res = await test_proxy_connection(proxy_config, timeout_sec=8.0)
            if test_res.ok and test_res.latitude and test_res.longitude:
                loc_update = LocationUpdate(
                    latitude=test_res.latitude,
                    longitude=test_res.longitude,
                    city=f"{test_res.city}, {test_res.country}" if test_res.city else test_res.country,
                    timezone=test_res.timezone
                )
                loc_resp = set_instance_location_sync(instance_name, loc_update)
                location_synced = loc_resp.location.model_dump()

        # Inyectar proxy si es HTTP
        if proxy_config.type == "http":
            check_cid = subprocess.run(
                ["docker", "ps", "-q", "-f", f"name=^{instance_name}$"],
                capture_output=True, text=True
            ).stdout.strip()
            if check_cid:
                auth = f"{proxy_config.username}:{proxy_config.password}@" if proxy_config.username else ""
                proxy_addr = f"{auth}{proxy_config.host}:{proxy_config.port}"
                subprocess.run(["docker", "exec", instance_name, "settings", "put", "global", "http_proxy", proxy_addr],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # Persistir en disco
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    if profile_data:
        with open(profile_path, "w", encoding="utf-8") as f:
            json.dump(profile_data, f, indent=2)

    return {
        "status": "ok",
        "instance": instance_name,
        "proxy": proxy_config.model_dump() if proxy_config else None,
        "location_synced": location_synced
    }
