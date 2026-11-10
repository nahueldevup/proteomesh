"""
Servicio unificado de gestión de Proxies y Transportes de Red (ProxyService).
Implementa la fachada para SOCKS5 Transparente a nivel Kernel (PROXY-002),
el registro atómico de leases (IpLeaseRegistry) y extensibilidad para USB-Mobile.
"""
import time
import json
import os
import fcntl
import asyncio
import logging
import subprocess
from urllib.parse import urlparse
from typing import Optional, Dict, Any, Tuple, Callable
import httpx

logger = logging.getLogger("proteomesh.proxy_service")

from server.config import INSTANCES_DIR, TOOLS_DIR
from server.models.schemas import (
    ProxyConfig,
    ProxyTestRequest,
    ProxyTestResponse,
    LocationUpdate,
)
from server.services.manager_bridge import set_instance_location_sync
from server.services.network.lease_registry import lease_registry, IpConflictError
from server.services.network.transport import (
    Socks5Transport,
    Transport,
    _exec_in_container,
)


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
    target_url = req.proxy_url or req.raw or req.raw_proxy
    if target_url:
        return parse_proxy_string(target_url, default_type=req.type or "socks5")

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


class ProxyService:
    """Fachada unificada para transportes de salida, cuarentena y estado de red."""

    def __init__(self):
        self.transports: Dict[str, Transport] = {
            "socks5": Socks5Transport(),
        }

    # ── Utilidades internas ────────────────────────────────────────────────
    def _get_instance_paths(self, instance_name: str) -> Tuple[Path, Path]:
        inst_dir = INSTANCES_DIR / instance_name
        meta_path = inst_dir / "meta.json"
        if not inst_dir.exists() or not meta_path.exists():
            raise FileNotFoundError(f"Instancia '{instance_name}' no existe en {INSTANCES_DIR}")
        return inst_dir, meta_path

    @staticmethod
    def _container_running(instance_name: str) -> bool:
        out = subprocess.run(
            ["docker", "ps", "-q", "-f", f"name=^{instance_name}$"],
            capture_output=True, text=True
        ).stdout.strip()
        return bool(out)

    def _load_meta(self, meta_path: Path) -> Dict[str, Any]:
        with open(meta_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _save_meta(self, meta_path: Path, meta: Dict[str, Any]) -> None:
        tmp_path = meta_path.with_suffix(".tmp")
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)
        os.replace(tmp_path, meta_path)

    def _mutate_meta(self, meta_path: Path, mutator_fn: Callable[[Dict[str, Any]], None]) -> Dict[str, Any]:
        """Modifica meta en SQLite y sincroniza disco bajo transacción ACID (Fase 3)."""
        instance_name = meta_path.parent.name
        from server.db.instance_store import instance_store
        return instance_store.mutate_meta(instance_name, mutator_fn)

    def _set_network_state(
        self,
        instance_name: str,
        state: str,
        error: Optional[str] = None,
        exit_ip: Optional[str] = None,
        latency_ms: Optional[float] = None,
    ) -> None:
        """Persiste el estado de red para que sobreviva reinicios y lo muestre la UI."""
        _, meta_path = self._get_instance_paths(instance_name)
        def _update(meta: Dict[str, Any]) -> None:
            meta["network"] = {
                "state": state,
                "error": error,
                "exit_ip": exit_ip,
                "latency_ms": latency_ms,
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            }
        self._mutate_meta(meta_path, _update)

    async def quarantine(self, instance_name: str) -> bool:
        """Aísla la instancia (sin Internet, con ADB/scrcpy). Falla si no puede aislarla."""
        if not self._container_running(instance_name):
            return False
        return await self.transports["socks5"].quarantine(instance_name, instance_name)

    async def unquarantine(self, instance_name: str) -> bool:
        if not self._container_running(instance_name):
            return False
        return await self.transports["socks5"].unquarantine(instance_name, instance_name)

    def _detach_usb_if_attached(self, instance_name: str) -> None:
        """Si la instancia estaba enganchada a un módem USB, lo desmonta antes de una ruta SOCKS."""
        if not self._is_usb_attached(instance_name):
            return
        try:
            subprocess.run(
                ["bash", str(TOOLS_DIR / "network" / "usb_tether.sh"), "detach", instance_name],
                capture_output=True, timeout=90,
            )
        except Exception:
            pass

    # ── Configuración de rutas ─────────────────────────────────────────────
    async def configure_socks5(
        self,
        instance_name: str,
        raw_uri: str,
        auto_sync_location: bool = True
    ) -> Dict[str, Any]:
        """
        Configura una ruta SOCKS5:
          1. Si la instancia corre, la pone en cuarentena ANTES de sondear (sin ventana de fuga).
          2. Sondea la IP de salida en el host y reserva el lease atómico.
          3. Sincroniza GPS/timezone y persiste en meta.json/profile.json.
          4. Aplica tun2socks; si falla, deja la instancia en cuarentena (no la apaga).
        """
        proxy_config = parse_proxy_string(raw_uri, default_type="socks5")
        inst_dir, meta_path = self._get_instance_paths(instance_name)

        # Si estaba enganchada por USB, desmontar para no pisar el ruteo
        self._detach_usb_if_attached(instance_name)

        transport = self.transports["socks5"]
        config_dict = proxy_config.model_dump()

        running = self._container_running(instance_name)
        was_quarantined = False
        if running:
            was_quarantined = await transport.is_quarantined(instance_name)
            await transport.quarantine(instance_name, instance_name)

        try:
            # Reserva atómica (lanza IpConflictError si otra instancia activa posee la IP)
            exit_ip, probe_meta = await transport.reserve_exit(instance_name, config_dict)
            config_dict["exit_ip"] = exit_ip
            latency_ms = probe_meta.get("latency_ms")
        except Exception as exc:
            # Restaurar el estado previo si la instancia no estaba ya aislada
            if running and not was_quarantined:
                try:
                    await transport.unquarantine(instance_name, instance_name)
                except Exception as unq_err:
                    logger.warning(f"No se pudo desaislar {instance_name} tras fallo de reserva: {unq_err}")
            self._set_network_state(instance_name, "quarantined", error=str(exc))
            raise

        # Sincronización geográfica opcional
        location_synced = None
        if auto_sync_location and probe_meta.get("latitude") and probe_meta.get("longitude"):
            loc_update = LocationUpdate(
                latitude=probe_meta["latitude"],
                longitude=probe_meta["longitude"],
                city=f"{probe_meta.get('city')}, {probe_meta.get('country')}" if probe_meta.get("city") else probe_meta.get("country"),
                timezone=probe_meta.get("timezone")
            )
            try:
                loc_resp = set_instance_location_sync(instance_name, loc_update)
                location_synced = loc_resp.location.model_dump()
            except Exception:
                pass

        # Persistir ANTES de aplicar: un reinicio reproduce el túnel
        def _apply_proxy_meta(m: Dict[str, Any]) -> None:
            m["proxy"] = config_dict
            m["network"] = {
                "state": "pending",
                "error": None,
                "exit_ip": exit_ip,
                "latency_ms": latency_ms,
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            }
        self._mutate_meta(meta_path, _apply_proxy_meta)

        profile_path = inst_dir / "profile.json"
        if profile_path.exists():
            try:
                with open(profile_path, "r", encoding="utf-8") as f:
                    pdata = json.load(f)
                pdata["proxy"] = config_dict
                with open(profile_path, "w", encoding="utf-8") as f:
                    json.dump(pdata, f, indent=2)
            except Exception:
                pass

        container_applied = False
        if running:
            try:
                await transport.apply(instance_name, instance_name, config_dict)
                egress_ok, seen_ip, detail = await transport.validate_egress(instance_name, exit_ip)
                if not egress_ok:
                    raise RuntimeError(f"egress no validado: {detail}")
                await transport.unquarantine(instance_name, instance_name)
                container_applied = True
                self._set_network_state(instance_name, "routed", exit_ip=exit_ip, latency_ms=latency_ms)
            except Exception as exc:
                # No se apaga: se desmonta el túnel fallido y queda en cuarentena
                try:
                    await transport._stop_tunnel_runtime(instance_name)
                    await transport.quarantine(instance_name, instance_name)
                except Exception as q_exc:
                    logger.error(f"Fallo crítico al aplicar cuarentena de rescate en {instance_name}: {q_exc}")
                lease_registry.release(instance_name)
                self._set_network_state(instance_name, "quarantined", error=str(exc), exit_ip=exit_ip)
                raise RuntimeError(f"Ruta no aplicada; instancia en cuarentena: {exc}") from exc

        return {
            "status": "ok",
            "instance": instance_name,
            "transport": "socks5",
            "exit_ip": exit_ip,
            "latency_ms": latency_ms,
            "proxy": config_dict,
            "container_applied": container_applied,
            "quarantined": running and not container_applied,
            "location_synced": location_synced
        }

    async def disconnect_proxy(self, instance_name: str, allow_direct: bool = False) -> Dict[str, Any]:
        """Quita la ruta, libera el lease y deja la instancia en cuarentena (o directa si se pide)."""
        inst_dir, meta_path = self._get_instance_paths(instance_name)
        self._mutate_meta(meta_path, lambda m: m.pop("proxy", None))

        profile_path = inst_dir / "profile.json"
        if profile_path.exists():
            try:
                with open(profile_path, "r", encoding="utf-8") as f:
                    pdata = json.load(f)
                pdata.pop("proxy", None)
                with open(profile_path, "w", encoding="utf-8") as f:
                    json.dump(pdata, f, indent=2)
            except Exception:
                pass

        transport = self.transports["socks5"]
        if self._container_running(instance_name):
            await transport.teardown(instance_name, instance_name)
            subprocess.run(
                ["docker", "exec", instance_name, "settings", "put", "global", "http_proxy", ":0"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
            if allow_direct:
                await transport.unquarantine(instance_name, instance_name)
                self._set_network_state(instance_name, "direct")
            else:
                await transport.quarantine(instance_name, instance_name)
                self._set_network_state(instance_name, "quarantined")

        lease_registry.release(instance_name)
        return {
            "status": "ok",
            "instance": instance_name,
            "quarantined": not allow_direct,
            "message": "Ruta removida; instancia en cuarentena." if not allow_direct else "Ruta removida; salida directa habilitada."
        }

    async def allow_direct(self, instance_name: str) -> Dict[str, Any]:
        """Permite salida directa a Internet (solo si no hay ruta configurada)."""
        _, meta_path = self._get_instance_paths(instance_name)
        meta = self._load_meta(meta_path)
        if meta.get("proxy"):
            raise ValueError("La instancia tiene una ruta configurada; quitala antes de habilitar salida directa.")

        if self._container_running(instance_name):
            await self.unquarantine(instance_name)
        self._set_network_state(instance_name, "direct")
        return {"status": "ok", "instance": instance_name, "state": "direct"}

    def _is_usb_attached(self, instance_name: str) -> bool:
        from server.db.usb_store import usb_store
        return usb_store.get(instance_name) is not None

    async def get_proxy_status(self, instance_name: str) -> Dict[str, Any]:
        """Estado consolidado: ruta, lease, túnel, cuarentena y última IP/latencia."""
        _, meta_path = self._get_instance_paths(instance_name)
        meta = self._load_meta(meta_path)

        proxy_data = meta.get("proxy")
        network = meta.get("network") or {}
        active_lease = lease_registry.get_active_lease(instance_name)

        running = self._container_running(instance_name)
        tunnel_alive = False
        quarantined = False
        if running:
            transport = self.transports["socks5"]
            rc, out, _ = await _exec_in_container(instance_name, "ip link show tun0 2>/dev/null")
            tunnel_alive = rc == 0 and "tun0" in out
            quarantined = await transport.is_quarantined(instance_name)

        exit_ip = None
        latency_ms = network.get("latency_ms")
        if proxy_data and proxy_data.get("exit_ip"):
            exit_ip = proxy_data["exit_ip"]
        if active_lease:
            exit_ip = exit_ip or active_lease.get("exit_ip")
            latency_ms = latency_ms or (active_lease.get("metadata") or {}).get("latency_ms")

        state = network.get("state")
        if not state:
            if running and tunnel_alive:
                state = "routed"
            elif running and quarantined:
                state = "quarantined"
            else:
                state = "direct" if proxy_data is None else "pending"

        return {
            "instance": instance_name,
            "running": running,
            "has_proxy": proxy_data is not None,
            "proxy": proxy_data,
            "lease": active_lease,
            "tunnel_active": tunnel_alive,
            "quarantined": quarantined,
            "usb_attached": self._is_usb_attached(instance_name),
            "state": state,
            "exit_ip": exit_ip,
            "latency_ms": latency_ms,
            "last_error": network.get("error"),
            "updated_at": network.get("updated_at"),
        }

    async def apply_from_meta(self, instance_name: str) -> bool:
        """
        Aplica la ruta persistida al arrancar. Si no hay ruta, no-op (salida directa).
        Con ruta: cuarentena primero; si el túnel no se valida, la instancia queda
        EN CUARENTENA y sigue encendida (no se destruye).
        """
        try:
            _, meta_path = self._get_instance_paths(instance_name)
            meta = self._load_meta(meta_path)
        except FileNotFoundError:
            return True

        proxy_cfg = meta.get("proxy")
        if not proxy_cfg:
            return True

        # Una ruta SOCKS no convive con el enganche USB
        self._detach_usb_if_attached(instance_name)

        transport = self.transports["socks5"]
        await transport.quarantine(instance_name, instance_name)

        ptype = str(proxy_cfg.get("type", "socks5")).lower()
        if ptype not in ("socks5", "socks5h"):
            auth = f"{proxy_cfg.get('username')}:{proxy_cfg.get('password')}@" if proxy_cfg.get("username") else ""
            proxy_addr = f"{auth}{proxy_cfg.get('host')}:{proxy_cfg.get('port')}"
            subprocess.run(
                ["docker", "exec", instance_name, "settings", "put", "global", "http_proxy", proxy_addr],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
            self._set_network_state(instance_name, "routed-http")
            return True

        try:
            exit_ip, probe_meta = await transport.reserve_exit(instance_name, proxy_cfg)
            await transport.apply(instance_name, instance_name, proxy_cfg)
            egress_ok, seen_ip, detail = await transport.validate_egress(instance_name, exit_ip)
            if not egress_ok:
                raise RuntimeError(f"egress no validado: {detail}")
            await transport.unquarantine(instance_name, instance_name)
            self._set_network_state(
                instance_name, "routed",
                exit_ip=exit_ip, latency_ms=probe_meta.get("latency_ms")
            )
            return True
        except Exception as exc:
            try:
                await transport._stop_tunnel_runtime(instance_name)
                await transport.quarantine(instance_name, instance_name)
            except Exception as q_exc:
                logger.error(f"Fallo al aislar {instance_name} tras error en apply_from_meta: {q_exc}")
            lease_registry.release(instance_name)
            self._set_network_state(instance_name, "quarantined", error=str(exc))
            raise


# Instancia singleton del servicio de proxies
proxy_service = ProxyService()


async def set_instance_proxy(
    instance_name: str,
    proxy_config: Optional[ProxyConfig],
    auto_sync_location: bool = True
) -> Dict[str, Any]:
    """Función de compatibilidad que delega a ProxyService."""
    if proxy_config is None:
        return await proxy_service.disconnect_proxy(instance_name)

    if proxy_config.type in ("socks5", "socks5h"):
        raw_url = proxy_config.url
        return await proxy_service.configure_socks5(
            instance_name=instance_name,
            raw_uri=raw_url,
            auto_sync_location=auto_sync_location
        )
    else:
        # Modo HTTP tradicional
        inst_dir = INSTANCES_DIR / instance_name
        meta_path = inst_dir / "meta.json"
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)

        meta["proxy"] = proxy_config.model_dump()
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

        check_cid = subprocess.run(
            ["docker", "ps", "-q", "-f", f"name=^{instance_name}$"],
            capture_output=True, text=True
        ).stdout.strip()
        if check_cid:
            auth = f"{proxy_config.username}:{proxy_config.password}@" if proxy_config.username else ""
            proxy_addr = f"{auth}{proxy_config.host}:{proxy_config.port}"
            subprocess.run(
                ["docker", "exec", instance_name, "settings", "put", "global", "http_proxy", proxy_addr],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )

        return {
            "status": "ok",
            "instance": instance_name,
            "proxy": proxy_config.model_dump(),
            "location_synced": None
        }
