"""
Gestión de Cortafuegos y Reglas de Red a nivel Host (CachyOS)
============================================================
Aplica aislamiento (quarantine) y enrutamiento USB transparente en el kernel
del host usando la cadena DOCKER-USER de iptables y tablas de enrutamiento Linux.

Invariantes de seguridad:
1. El aislamiento de cuarentena JAMÁS bloquea el tráfico hacia/desde 172.17.0.0/16
   (ADB local, ws-scrcpy y comunicación host-contenedor siguen 100% operativos).
2. Cuando está conectado a USB, el contenedor SOLO puede enviar paquetes hacia la
   interfaz USB asignada. Cualquier intento de fuga hacia ethernet/wifi doméstica
   es descartado inmediatamente (DROP).
3. Todo ocurre en el host: el contenedor solo conserva eth0 sin túneles ni proxies.
"""
import asyncio
import logging
import re
import subprocess
from typing import Optional, Tuple, Set

logger = logging.getLogger("proteomesh.host_firewall")

SAFE_NAME = re.compile(r"^[a-zA-Z0-9_\-\.]+$")
SAFE_IP = re.compile(r"^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$")
SAFE_IFACE = re.compile(r"^[a-zA-Z0-9_\-]+$")
SAFE_SUBNET = re.compile(r"^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/[0-9]{1,2}$")


def _validate_net_params(
    instance_name: Optional[str] = None,
    container_ip: Optional[str] = None,
    usb_iface: Optional[str] = None,
    gateway: Optional[str] = None,
    subnet: Optional[str] = None,
) -> None:
    if instance_name and not SAFE_NAME.match(instance_name):
        raise ValueError(f"instance_name con caracteres inválidos: {instance_name}")
    if container_ip and not SAFE_IP.match(container_ip):
        raise ValueError(f"container_ip inválido: {container_ip}")
    if usb_iface and not SAFE_IFACE.match(usb_iface):
        raise ValueError(f"usb_iface con caracteres inválidos: {usb_iface}")
    if gateway and not SAFE_IP.match(gateway):
        raise ValueError(f"gateway inválido: {gateway}")
    if subnet and not SAFE_SUBNET.match(subnet):
        raise ValueError(f"subnet con formato inválido: {subnet}")


class HostFirewall:
    def __init__(self, netctl_image: str = "proteomesh-netctl:latest"):
        self.netctl_image = netctl_image

    def _calc_table_id(self, container_ip: str) -> int:
        """Calcula el ID de tabla de enrutamiento del host (200 + último octeto)."""
        try:
            return 200 + int(container_ip.split(".")[-1])
        except Exception:
            return 200

    def _run_sync(self, cmd_script: str, timeout: int = 15) -> Tuple[int, str, str]:
        """Ejecuta un script de red en el host mediante el contenedor privilegiado netctl."""
        try:
            proc = subprocess.run(
                ["docker", "run", "--rm", "--privileged", "--net=host", self.netctl_image, cmd_script],
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            return proc.returncode, proc.stdout, proc.stderr
        except Exception as e:
            logger.error(f"Fallo al ejecutar script en host: {e}")
            return -1, "", str(e)

    async def _run_async(self, cmd_script: str, timeout: int = 15) -> Tuple[int, str, str]:
        """Versión asíncrona de _run_sync."""
        try:
            proc = await asyncio.create_subprocess_exec(
                "docker", "run", "--rm", "--privileged", "--net=host", self.netctl_image, cmd_script,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            return (
                proc.returncode if proc.returncode is not None else -1,
                out.decode(errors="replace"),
                err.decode(errors="replace"),
            )
        except Exception as e:
            logger.error(f"Fallo asíncrono en host_firewall: {e}")
            return -1, "", str(e)

    def apply_quarantine_sync(self, instance_name: str, container_ip: str) -> bool:
        """
        Aplica cuarentena en T=0 o en caliente:
        Bloquea toda salida a Internet conservando ADB y comunicación con el host (172.17.0.1/32).
        """
        if not container_ip:
            logger.warning(f"apply_quarantine_sync: {instance_name} sin IP")
            return False
        _validate_net_params(instance_name=instance_name, container_ip=container_ip)

        table_id = self._calc_table_id(container_ip)
        chain = f"PM_NET_{instance_name}"
        script = f"""
set -e
# 1. Asegurar cadena PM_NET_<instancia>
iptables -N {chain} 2>/dev/null || true
iptables -F {chain}
iptables -A {chain} -d 172.17.0.1/32 -j RETURN
iptables -A {chain} -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
iptables -A {chain} -j DROP

# 2. Enlazar a DOCKER-USER
iptables -C DOCKER-USER -s {container_ip} -j {chain} 2>/dev/null || iptables -I DOCKER-USER 1 -s {container_ip} -j {chain}

# 3. Limpiar enrutamiento del host hacia USB si existía
ip rule del from {container_ip} lookup {table_id} prio 1000 2>/dev/null || true
ip route flush table {table_id} 2>/dev/null || true

# 4. Eliminar conexiones activas residuales
conntrack -D -s {container_ip} 2>/dev/null || true
"""
        code, out, err = self._run_sync(script)
        if code != 0:
            logger.error(f"Error aplicando cuarentena a {instance_name} ({container_ip}): {err}")
            return False
        logger.info(f"[HostFirewall] Cuarentena aplicada a {instance_name} ({container_ip})")
        return True

    async def apply_quarantine(self, instance_name: str, container_ip: str) -> bool:
        """Versión asíncrona de apply_quarantine_sync."""
        if not container_ip:
            return False
        _validate_net_params(instance_name=instance_name, container_ip=container_ip)
        table_id = self._calc_table_id(container_ip)
        chain = f"PM_NET_{instance_name}"
        script = f"""
set -e
iptables -N {chain} 2>/dev/null || true
iptables -F {chain}
iptables -A {chain} -d 172.17.0.1/32 -j RETURN
iptables -A {chain} -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
iptables -A {chain} -j DROP
iptables -C DOCKER-USER -s {container_ip} -j {chain} 2>/dev/null || iptables -I DOCKER-USER 1 -s {container_ip} -j {chain}
ip rule del from {container_ip} lookup {table_id} prio 1000 2>/dev/null || true
ip route flush table {table_id} 2>/dev/null || true
conntrack -D -s {container_ip} 2>/dev/null || true
"""
        code, out, err = await self._run_async(script)
        if code != 0:
            logger.error(f"Error asíncrono cuarentena {instance_name}: {err}")
            return False
        return True

    async def apply_usb_routing(
        self,
        instance_name: str,
        container_ip: str,
        usb_iface: str,
        gateway: str,
        subnet: str,
    ) -> bool:
        """
        Enruta el contenedor exclusivamente por la interfaz USB asignada
        y ajusta el firewall para permitir salida SOLO por esa interfaz.
        """
        if not container_ip or not usb_iface or not gateway:
            return False
        _validate_net_params(
            instance_name=instance_name,
            container_ip=container_ip,
            usb_iface=usb_iface,
            gateway=gateway,
            subnet=subnet if subnet else None,
        )

        table_id = self._calc_table_id(container_ip)
        chain = f"PM_NET_{instance_name}"
        script = f"""
set -e
# 1. Reglas de cortafuegos en el host: SOLO pasar a LAN o por la interfaz USB
iptables -N {chain} 2>/dev/null || true
iptables -F {chain}
iptables -A {chain} -d 172.17.0.1/32 -j RETURN
iptables -A {chain} -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
iptables -A {chain} -o {usb_iface} -j RETURN
iptables -A {chain} -j DROP

# Enlazar a DOCKER-USER si no está enlazada
iptables -C DOCKER-USER -s {container_ip} -j {chain} 2>/dev/null || iptables -I DOCKER-USER 1 -s {container_ip} -j {chain}

# 2. Regla de enrutamiento por origen en el host
ip rule del from {container_ip} lookup {table_id} prio 1000 2>/dev/null || true
ip rule add from {container_ip} lookup {table_id} prio 1000
ip route replace default via {gateway} dev {usb_iface} table {table_id}
if [ -n "{subnet}" ]; then
  ip route replace {subnet} dev {usb_iface} table {table_id}
fi
ip route replace 172.17.0.0/16 dev docker0 table {table_id}

# 3. Limpiar conntrack previo para refrescar sockets
conntrack -D -s {container_ip} 2>/dev/null || true
"""
        code, out, err = await self._run_async(script)
        if code != 0:
            logger.error(f"Error aplicando enrutamiento USB host a {instance_name}: {err}")
            return False

        # Configurar enrutamiento básico dentro del contenedor hacia su gateway docker (172.17.0.1)
        # y levantar cualquier cuarentena residual interna (PM_QUARANTINE) para permitir tráfico directo por eth0
        ct_script = (
            "IPT=/system/bin/iptables; [ -x \"$IPT\" ] || IPT=iptables; "
            "$IPT -D OUTPUT -j PM_QUARANTINE 2>/dev/null || true; "
            "$IPT -F PM_QUARANTINE 2>/dev/null || true; "
            "$IPT -X PM_QUARANTINE 2>/dev/null || true; "
            "IP=/data/local/tmp/ip_bin/ip; [ -x \"$IP\" ] || IP=ip; "
            "$IP route replace default via 172.17.0.1 dev eth0 table 101 2>/dev/null || true; "
            "$IP route replace 172.17.0.0/16 dev eth0 table 101 2>/dev/null || true; "
            "$IP route replace 127.0.0.0/8 dev lo table 101 2>/dev/null || true; "
            "$IP rule del table 101 2>/dev/null || true; "
            "$IP rule add from all table 101 prio 7000 2>/dev/null || true; "
            "setprop net.dns1 8.8.8.8 2>/dev/null || true; "
            "setprop net.dns2 1.1.1.1 2>/dev/null || true"
        )
        try:
            p = await asyncio.create_subprocess_exec(
                "docker", "exec", instance_name, "/system/bin/sh", "-c", ct_script,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await asyncio.wait_for(p.wait(), timeout=10)
        except Exception as e:
            logger.warning(f"No se pudo inyectar regla interna en {instance_name} (quizás aún no inició ip_bin): {e}")

        logger.info(f"[HostFirewall] Enrutamiento USB activo: {instance_name} -> {usb_iface} (gw {gateway})")
        return True

    def cleanup_instance_sync(self, instance_name: str, container_ip: Optional[str] = None) -> None:
        """Limpia reglas de firewall y tablas de enrutamiento al detener o eliminar la instancia."""
        _validate_net_params(instance_name=instance_name, container_ip=container_ip)
        chain = f"PM_NET_{instance_name}"
        del_rule = f"iptables -D DOCKER-USER -s {container_ip} -j {chain} 2>/dev/null || true" if container_ip else ""
        del_table = ""
        del_conntrack = ""
        if container_ip:
            table_id = self._calc_table_id(container_ip)
            del_table = f"ip rule del from {container_ip} lookup {table_id} prio 1000 2>/dev/null || true; ip route flush table {table_id} 2>/dev/null || true;"
            del_conntrack = f"conntrack -D -s {container_ip} 2>/dev/null || true;"

        script = f"""
{del_rule}
iptables -F {chain} 2>/dev/null || true
iptables -X {chain} 2>/dev/null || true
{del_table}
{del_conntrack}
"""
        self._run_sync(script)

    async def cleanup_instance(self, instance_name: str, container_ip: Optional[str] = None) -> None:
        """Versión asíncrona de cleanup_instance_sync."""
        _validate_net_params(instance_name=instance_name, container_ip=container_ip)
        chain = f"PM_NET_{instance_name}"
        del_rule = f"iptables -D DOCKER-USER -s {container_ip} -j {chain} 2>/dev/null || true" if container_ip else ""
        del_table = ""
        del_conntrack = ""
        if container_ip:
            table_id = self._calc_table_id(container_ip)
            del_table = f"ip rule del from {container_ip} lookup {table_id} prio 1000 2>/dev/null || true; ip route flush table {table_id} 2>/dev/null || true;"
            del_conntrack = f"conntrack -D -s {container_ip} 2>/dev/null || true;"

        script = f"""
{del_rule}
iptables -F {chain} 2>/dev/null || true
iptables -X {chain} 2>/dev/null || true
{del_table}
{del_conntrack}
"""
        await self._run_async(script)

    def reconcile(self, running_instances: Set[str]) -> None:
        """
        Limpia cadenas PM_NET_* y enlaces DOCKER-USER huérfanos de instancias que ya no están corriendo (FRAG-01).
        """
        code, out, _ = self._run_sync("iptables -S DOCKER-USER 2>/dev/null || true")
        if code != 0 or not out:
            return
        for line in out.splitlines():
            line = line.strip()
            if "-j PM_NET_" in line:
                match = re.search(r"-j PM_NET_([a-zA-Z0-9_\-\.]+)", line)
                if match:
                    inst = match.group(1)
                    if inst not in running_instances:
                        ip_match = re.search(r"-s ([0-9\.]+)(?:/32)?", line)
                        ip = ip_match.group(1) if ip_match else None
                        logger.info(f"[HostFirewall] Purgando regla huérfana en arranque para {inst} (IP {ip})")
                        self.cleanup_instance_sync(inst, ip)


host_firewall = HostFirewall()
