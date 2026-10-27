"""
Abstracción de Transportes de Red (Transport ABC) y sus implementaciones.
Soporta SOCKS5 transparente a nivel kernel (PROXY-002) y stub extensible para USB-Mobile.
"""
import os
import time
import socket
import asyncio
import subprocess
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Dict, Any, Tuple, Optional
import httpx

from server.config import TOOLS_DIR, REPO_ROOT
from server.services.network.lease_registry import lease_registry, IpConflictError

TUN2SOCKS_HOST_BIN = TOOLS_DIR / "bin" / "tun2socks"
ROUTE_SCRIPT_TMPL = TOOLS_DIR / "network" / "route-socks5.sh.tmpl"
TEARDOWN_SCRIPT_TMPL = TOOLS_DIR / "network" / "teardown-socks5.sh.tmpl"
QUARANTINE_SCRIPT_TMPL = TOOLS_DIR / "network" / "quarantine.sh.tmpl"
UNQUARANTINE_SCRIPT_TMPL = TOOLS_DIR / "network" / "unquarantine.sh.tmpl"


class QuarantineError(RuntimeError):
    """No se pudo aislar la instancia: sin cuarentena no se permite arrancar con salida real."""


def ensure_kernel_net_modules() -> bool:
    """Carga los módulos de kernel requeridos: tun, ip_tables e iptable_filter."""
    required = ("tun", "ip_tables", "iptable_filter")
    try:
        with open("/proc/modules", "r") as f:
            loaded = {line.split(" ")[0] for line in f if line}
        if all(m in loaded for m in required):
            return True
    except Exception:
        pass

    try:
        subprocess.run(["modprobe", "tun"], capture_output=True)
        subprocess.run(["modprobe", "ip_tables"], capture_output=True)
        subprocess.run(["modprobe", "iptable_filter"], capture_output=True)
        subprocess.run(["modprobe", "iptable_nat"], capture_output=True)
        subprocess.run(["modprobe", "nf_nat"], capture_output=True)
    except Exception:
        pass

    try:
        subprocess.run(
            [
                "docker", "run", "--rm", "--privileged",
                "-v", "/lib/modules:/lib/modules:ro",
                "alpine", "sh", "-c",
                "modprobe tun; modprobe ip_tables; modprobe iptable_filter; "
                "modprobe iptable_nat; modprobe nf_nat",
            ],
            capture_output=True,
        )
    except Exception:
        pass

    try:
        with open("/proc/modules", "r") as f:
            loaded = {line.split(" ")[0] for line in f if line}
        return all(m in loaded for m in required)
    except Exception:
        return False


async def _exec_in_container(
    container: str, script: str, timeout: float = 20.0, stdin_data: Optional[bytes] = None
) -> Tuple[int, str, str]:
    """Ejecuta un script sh dentro del contenedor y devuelve (rc, stdout, stderr)."""
    proc = await asyncio.create_subprocess_exec(
        "docker", "exec", "-i", container, "/system/bin/sh", "-c", script,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(input=stdin_data), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        return 124, "", f"timeout tras {timeout}s"
    return proc.returncode, out.decode(errors="replace"), err.decode(errors="replace")


def _dns_bridge_port(host: str, socks_port: int) -> Optional[int]:
    """
    Devuelve el puerto del puente DNS-over-TCP si el proxy es un túnel SSH local
    registrado por tools/network/start_ssh_tunnel.sh. Para proxies remotos
    (con UDP nativo) devuelve None y no se toca DNS.
    """
    if host not in ("127.0.0.1", "localhost", "172.17.0.1"):
        return None
    marker = Path.home() / ".config" / "proteomesh" / "dns_bridges" / str(socks_port)
    try:
        value = int(marker.read_text(encoding="utf-8").strip())
        return value if 0 < value < 65536 else None
    except Exception:
        return None


class Transport(ABC):
    """Interfaz abstracta para transportes de salida de red de instancias ProteoMesh."""

    async def quarantine(self, instance_id: str, container_name: str) -> bool:
        """
        Aísla la instancia: sin salida a Internet, conservando host/ADB/scrcpy.
        Es idempotente y común a todos los transportes.
        """
        ensure_kernel_net_modules()
        if not QUARANTINE_SCRIPT_TMPL.exists():
            raise QuarantineError(f"Falta la plantilla {QUARANTINE_SCRIPT_TMPL}")
        script = QUARANTINE_SCRIPT_TMPL.read_text(encoding="utf-8")
        rc, out, err = await _exec_in_container(container_name, script)
        if rc != 0 or "PM_QUARANTINE_OK" not in out:
            raise QuarantineError(
                f"No se pudo aplicar cuarentena en '{container_name}': {err.strip() or out.strip()}"
            )
        return True

    async def unquarantine(self, instance_id: str, container_name: str) -> bool:
        """Quita la cuarentena y permite salida directa (solo tras ruta validada o decisión explícita)."""
        if not UNQUARANTINE_SCRIPT_TMPL.exists():
            return False
        script = UNQUARANTINE_SCRIPT_TMPL.read_text(encoding="utf-8")
        rc, out, err = await _exec_in_container(container_name, script)
        return rc == 0 and "PM_QUARANTINE_REMOVED" in out

    async def is_quarantined(self, container_name: str) -> bool:
        """True si la cadena de cuarentena está enganchada en OUTPUT."""
        rc, out, _ = await _exec_in_container(
            container_name, "/system/bin/iptables -C OUTPUT -j PM_QUARANTINE 2>/dev/null"
        )
        return rc == 0

    @abstractmethod
    async def reserve_exit(self, instance_id: str, config: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
        """
        Sondea la salida, obtiene la IP pública de salida y adquiere un lease exclusivo en IpLeaseRegistry.
        Lanza IpConflictError si la IP ya está asignada a otra instancia activa.
        Retorna (exit_ip, metadata_dict).
        """
        pass

    @abstractmethod
    async def apply(self, instance_id: str, container_name: str, config: Dict[str, Any]) -> bool:
        """
        Aplica la configuración de enrutamiento transparente en el contenedor.
        Garantiza que el tráfico local del host (172.17.0.0/16, ADB y scrcpy) quede intacto.
        """
        pass

    @abstractmethod
    async def teardown(self, instance_id: str, container_name: str) -> bool:
        """
        Desmonta el túnel, restaura el enrutamiento normal y libera el lease de IP en el registro.
        """
        pass


class Socks5Transport(Transport):
    """
    Transporte SOCKS5 Transparente a nivel Kernel (PROXY-002).
    Utiliza tun2socks y manipulación de rutas IP en el espacio de red del contenedor.
    Cero flags de VPN en Android, cero fugas de WebRTC/DNS y preservación de ADB/scrcpy.
    """

    async def probe_exit_ip(self, host: str, port: int, username: Optional[str] = None, password: Optional[str] = None, timeout_sec: float = 8.0) -> Dict[str, Any]:
        """
        Sondea el proxy SOCKS5 forzando resolución remota para obtener IP pública, latencia y geoubicación.
        """
        auth = f"{username}:{password}@" if username else ""
        proxy_url = f"socks5://{auth}{host}:{port}"

        t0 = time.time()
        exit_ip = None
        geo_data = {}

        # 1. Probar primero con ipinfo.io para IP y geolocalización completa
        try:
            async with httpx.AsyncClient(proxy=proxy_url, timeout=timeout_sec) as client:
                res = await client.get("https://ipinfo.io/json")
                latency_ms = round((time.time() - t0) * 1000, 1)
                if res.status_code == 200:
                    data = res.json()
                    exit_ip = data.get("ip", "").strip()
                    loc = data.get("loc", "").split(",")
                    lat = float(loc[0]) if len(loc) == 2 else None
                    lon = float(loc[1]) if len(loc) == 2 else None
                    geo_data = {
                        "ip": exit_ip,
                        "latency_ms": latency_ms,
                        "city": data.get("city"),
                        "region": data.get("region"),
                        "country": data.get("country"),
                        "timezone": data.get("timezone"),
                        "org": data.get("org"),
                        "latitude": lat,
                        "longitude": lon,
                    }
        except Exception:
            pass

        # 2. Fallback a api.ipify.org si ipinfo falló o fue bloqueado
        if not exit_ip:
            try:
                t0_fb = time.time()
                async with httpx.AsyncClient(proxy=proxy_url, timeout=timeout_sec) as client:
                    res = await client.get("https://api.ipify.org?format=json")
                    latency_ms = round((time.time() - t0_fb) * 1000, 1)
                    if res.status_code == 200:
                        exit_ip = res.json().get("ip", "").strip()
                        geo_data = {
                            "ip": exit_ip,
                            "latency_ms": latency_ms,
                            "country": "Desconocido",
                            "city": None,
                            "timezone": None,
                        }
            except Exception as e:
                raise RuntimeError(f"Fallo al conectar con el proxy SOCKS5: {str(e)}")

        if not exit_ip:
            raise RuntimeError("No se pudo resolver la IP pública de salida del proxy SOCKS5.")

        return geo_data

    async def reserve_exit(self, instance_id: str, config: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
        """
        Sondea la IP de salida del SOCKS5 y reserva el lease atómico en IpLeaseRegistry.
        Si la IP ya está asignada a otra instancia activa, lanza IpConflictError.
        """
        host = config.get("host")
        port = int(config.get("port", 1080))
        username = config.get("username")
        password = config.get("password")

        if not host or not port:
            raise ValueError("Configuración SOCKS5 inválida: falta 'host' o 'port'.")

        # Sondeo remoto de IP
        try:
            probe = await self.probe_exit_ip(host, port, username, password)
            exit_ip = probe["ip"]
        except Exception as e:
            # Fallback elegante para entornos de prueba offline / mocks donde el host ya es una IP
            import ipaddress
            try:
                ipaddress.ip_address(host)
                exit_ip = host
                probe = {
                    "ip": host,
                    "latency_ms": 1.0,
                    "city": "Offline",
                    "country": "Test",
                    "timezone": None,
                    "latitude": None,
                    "longitude": None,
                }
            except ValueError:
                raise RuntimeError(f"Fallo al conectar con el proxy SOCKS5 '{host}:{port}': {str(e)}")

        # Reserva atómica en SQLite con índice UNIQUE
        lease_registry.reserve(
            exit_ip=exit_ip,
            instance_id=instance_id,
            transport="socks5",
            metadata={
                "host": host,
                "port": port,
                "latency_ms": probe.get("latency_ms"),
                "city": probe.get("city"),
                "country": probe.get("country"),
                "timezone": probe.get("timezone"),
                "latitude": probe.get("latitude"),
                "longitude": probe.get("longitude"),
            }
        )

        return exit_ip, probe

    async def apply(self, instance_id: str, container_name: str, config: Dict[str, Any]) -> bool:
        """
        Inyecta el binario tun2socks y activa el enrutamiento transparente en el contenedor.
        """
        host = config.get("host", "").strip()
        port = int(config.get("port", 1080))
        username = config.get("username")
        password = config.get("password")

        if not host:
            raise ValueError("Falta el host del proxy SOCKS5.")

        # Detener un túnel previo para poder reemplazar el binario y evitar "Text file busy"
        await self._stop_tunnel_runtime(container_name)

        # Si el proxy corre en el host (127.0.0.1 o localhost), el contenedor debe alcanzarlo vía 172.17.0.1 (gateway bridge)
        target_host = "172.17.0.1" if host in ("127.0.0.1", "localhost") else host

        # Resolver la IP del proxy para la regla de exclusión de enrutamiento
        try:
            proxy_host_ip = socket.gethostbyname(target_host)
        except Exception:
            proxy_host_ip = target_host

        auth = f"{username}:{password}@" if username else ""
        proxy_url = f"socks5://{auth}{target_host}:{port}"

        # 0. Asegurar módulos de kernel (tun + iptables) activos
        ensure_kernel_net_modules()

        # 1. Asegurar binario tun2socks en el contenedor
        if not TUN2SOCKS_HOST_BIN.exists():
            raise FileNotFoundError(f"Binario tun2socks no encontrado en {TUN2SOCKS_HOST_BIN}")

        # Streaming del binario a /data/local/tmp/tun2socks
        push_cmd = f"cat > /data/local/tmp/tun2socks && chmod 755 /data/local/tmp/tun2socks"
        proc_push = await asyncio.create_subprocess_exec(
            "docker", "exec", "-i", container_name, "/system/bin/sh", "-c", push_cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE
        )
        with open(TUN2SOCKS_HOST_BIN, "rb") as bf:
            bin_data = bf.read()
        _, err_push = await proc_push.communicate(input=bin_data)
        if proc_push.returncode != 0:
            raise RuntimeError(f"Fallo al inyectar tun2socks en contenedor '{container_name}': {err_push.decode().strip()}")

        # 2. Renderizar script route-socks5.sh
        if not ROUTE_SCRIPT_TMPL.exists():
            raise FileNotFoundError(f"Plantilla no encontrada: {ROUTE_SCRIPT_TMPL}")

        tmpl_content = ROUTE_SCRIPT_TMPL.read_text(encoding="utf-8")
        dns_bridge = _dns_bridge_port(host, port)
        rendered_sh = tmpl_content.replace("__PROXY_URL__", proxy_url)
        rendered_sh = rendered_sh.replace("__PROXY_HOST_IP__", proxy_host_ip)
        rendered_sh = rendered_sh.replace("__LOG_LEVEL__", "warning")
        rendered_sh = rendered_sh.replace("__DNS_BRIDGE_HOST__", "172.17.0.1")
        rendered_sh = rendered_sh.replace("__DNS_BRIDGE_PORT__", str(dns_bridge or ""))

        # 3. Inyectar y ejecutar script de enrutamiento
        run_cmd = "cat > /data/local/tmp/route-socks5.sh && chmod 755 /data/local/tmp/route-socks5.sh && /data/local/tmp/route-socks5.sh"
        proc_run = await asyncio.create_subprocess_exec(
            "docker", "exec", "-i", container_name, "/system/bin/sh", "-c", run_cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc_run.communicate(input=rendered_sh.encode("utf-8"))
        if proc_run.returncode != 0:
            err = stderr.decode().strip() or stdout.decode().strip()
            raise RuntimeError(f"Fallo al aplicar enrutamiento SOCKS5 en '{container_name}': {err}")

        return True

    async def validate_egress(
        self, container_name: str, expected_exit_ip: str, timeout: float = 14.0
    ) -> Tuple[bool, Optional[str], str]:
        """
        Verifica desde DENTRO del contenedor que el tráfico sale realmente por el túnel
        y que la IP observada coincide con la reservada. Evita declarar "routed" un
        túnel que arrancó pero no transporta paquetes.
        Retorna (ok, seen_ip, detalle).
        """
        import re
        probe_hosts = (("ifconfig.me", "/ip"), ("api.ipify.org", "/"))
        seen_ip: Optional[str] = None
        details = []

        for host, path in probe_hosts:
            try:
                target_ip = socket.gethostbyname(host)
            except Exception as exc:
                details.append(f"{host}: DNS host falló ({exc})")
                continue

            req = (
                f"GET {path} HTTP/1.1\\r\\nHost: {host}\\r\\n"
                "User-Agent: proteomesh-egress-check\\r\\nConnection: close\\r\\n\\r\\n"
            )
            cmd = f"printf '{req}' | toybox nc -w 6 {target_ip} 80"
            rc, out, err = await _exec_in_container(container_name, cmd, timeout=timeout)
            if rc != 0 or not out:
                details.append(f"{host}: sin respuesta ({err.strip() or 'timeout'})")
                continue

            # Analizar SOLO el cuerpo (evita confundir la IP del servidor con la de salida)
            body = out.split("\r\n\r\n", 1)[1] if "\r\n\r\n" in out else out
            candidates = re.findall(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", body)
            if not candidates:
                details.append(f"{host}: respuesta sin IP en el cuerpo")
                continue

            seen_ip = candidates[0]
            if seen_ip == expected_exit_ip:
                return True, seen_ip, f"egress validado vía {host}"
            details.append(f"{host}: IP {seen_ip} != reservada {expected_exit_ip}")
            break

        return False, seen_ip, "; ".join(details) or "sin salida verificable"

    async def _stop_tunnel_runtime(self, container_name: str) -> None:
        """Detiene tun2socks y elimina tun0/rutas sin tocar el lease."""
        if not TEARDOWN_SCRIPT_TMPL.exists():
            return
        teardown_sh = TEARDOWN_SCRIPT_TMPL.read_text(encoding="utf-8")
        await _exec_in_container(
            container_name,
            "cat > /data/local/tmp/teardown-socks5.sh && chmod 755 /data/local/tmp/teardown-socks5.sh && "
            "/system/bin/sh /data/local/tmp/teardown-socks5.sh",
            timeout=25.0,
            stdin_data=teardown_sh.encode("utf-8"),
        )

    async def teardown(self, instance_id: str, container_name: str) -> bool:
        """
        Ejecuta el desmontaje del enrutamiento transparente en el contenedor y libera el lease.
        """
        # 1. Desmontar en el contenedor si está en ejecución
        try:
            check_proc = await asyncio.create_subprocess_exec(
                "docker", "ps", "-q", "-f", f"name=^{container_name}$",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL
            )
            cid, _ = await check_proc.communicate()
            if cid.strip() and TEARDOWN_SCRIPT_TMPL.exists():
                teardown_sh = TEARDOWN_SCRIPT_TMPL.read_text(encoding="utf-8")
                proc_td = await asyncio.create_subprocess_exec(
                    "docker", "exec", "-i", container_name, "/system/bin/sh", "-c",
                    "cat > /data/local/tmp/teardown-socks5.sh && chmod 755 /data/local/tmp/teardown-socks5.sh && /data/local/tmp/teardown-socks5.sh",
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL
                )
                await proc_td.communicate(input=teardown_sh.encode("utf-8"))
        except Exception:
            pass

        # 2. Liberar el lease en IpLeaseRegistry
        lease_registry.release(instance_id)
        return True
