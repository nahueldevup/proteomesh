"""
Servicio de Red Dinámica por Anclaje USB, Cuarentena y Rotación (NET-USB-001)
============================================================================
Administra el pool de celulares físicos conectados por USB a CachyOS,
la máquina de estados de red por instancia (QUARANTINE, WAITING_USB, RELEASING,
ROTATING_IP, CONNECTED_USB), la cola FIFO y la rotación vía Modo Avión (ADB).
"""
import asyncio
import json
import logging
import os
import re
import subprocess
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from server.config import (
    INSTANCES_DIR,
    REPO_ROOT,
    TOOLS_DIR,
)
from server.services.network.host_firewall import host_firewall
from server.services.network.ip_ledger import ip_ledger

logger = logging.getLogger("proteomesh.usb_network")

USB_ROTATE_MAX_ATTEMPTS = int(os.environ.get("USB_ROTATE_MAX_ATTEMPTS", "5"))
USB_MOBILE_FORCE_DATA = os.environ.get("USB_MOBILE_FORCE_DATA", "true").lower() in ("true", "1", "yes")

# Drivers típicos de anclaje USB / módems móviles
USB_NET_DRIVERS = {"rndis_host", "cdc_ncm", "cdc_ether", "ipheth", "cdc_mbim", "qmi_wwan", "r8152", "ax88179_178a"}


@dataclass
class UsbDevice:
    serial: str
    iface: str
    model: str
    carrier: str
    network_type: str
    battery: str
    mobile_data: bool
    airplane_mode: bool
    current_ip: Optional[str]
    gateway: Optional[str]
    subnet: Optional[str]
    assigned_instance: Optional[str]
    status: str  # "idle" | "assigned" | "rotating" | "error"
    error: Optional[str] = None


class UsbNetworkService:
    def __init__(self):
        # Cola FIFO de nombres de instancias esperando módem USB
        self.waiting_queue: List[str] = []
        # Bloqueo para evitar carreras en rotaciones simultáneas del mismo dispositivo
        self._lock = asyncio.Lock()
        # Estado dinámico en memoria de cada instancia ("QUARANTINE", "WAITING_USB", etc.)
        self._instance_states: Dict[str, Dict[str, Any]] = {}
        # Oferta temporal con ventana de gracia (5s)
        self._pending_offer: Optional[Dict[str, Any]] = None
        self._offer_task: Optional[asyncio.Task] = None

    def get_pending_offer(self) -> Optional[Dict[str, Any]]:
        """Devuelve los datos de la oferta temporal activa o None si no hay."""
        if not self._pending_offer:
            return None
        expires_at = self._pending_offer.get("expires_at", 0)
        now = time.time()
        remaining = max(0, int(round(expires_at - now)))
        return {
            "instance": self._pending_offer["instance"],
            "expires_in_seconds": remaining,
            "device_serial": self._pending_offer.get("device_serial") or "",
            "expires_at": expires_at,
        }

    def _cancel_offer_unlocked(self) -> None:
        """Cancela la tarea del temporizador y limpia la oferta activa (debe llamarse bajo lock o en setup)."""
        if self._offer_task and not self._offer_task.done():
            self._offer_task.cancel()
        self._offer_task = None
        self._pending_offer = None

    def _start_offer_unlocked(self, instance_name: str, device_serial: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Inicia una ventana de gracia de 5s para la instancia candidata."""
        self._cancel_offer_unlocked()
        expires_at = time.time() + 5.0
        self._pending_offer = {
            "instance": instance_name,
            "expires_at": expires_at,
            "device_serial": device_serial or "",
            "created_at": time.time(),
        }
        self._instance_states[instance_name] = {"state": "OFFERED"}
        logger.info(f"Iniciando ventana de gracia de 5s para '{instance_name}' (módem: {device_serial})")
        self._offer_task = asyncio.create_task(self._offer_timer_task(instance_name, device_serial))
        return self.get_pending_offer()

    async def _offer_timer_task(self, instance_name: str, device_serial: Optional[str] = None):
        """Temporizador de gracia: si transcurren 5s sin acción, auto-confirma claim_usb."""
        try:
            await asyncio.sleep(5.0)
        except asyncio.CancelledError:
            return

        async with self._lock:
            if not self._pending_offer or self._pending_offer.get("instance") != instance_name:
                return

            self._pending_offer = None
            self._offer_task = None

            logger.info(f"Auto-confirmando conexión de módem USB para '{instance_name}' tras 5s de gracia...")
            try:
                await self._claim_usb_unlocked(instance_name, preferred_serial=device_serial)
            except Exception as e:
                logger.error(f"Fallo en auto-confirmación para '{instance_name}': {e}")
                self._instance_states[instance_name] = {
                    "state": "WAITING_USB",
                    "error": f"Fallo al auto-conectar: {str(e)}",
                }

    def _container_ip(self, instance_name: str) -> Optional[str]:
        try:
            res = subprocess.run(
                ["docker", "inspect", "-f", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", instance_name],
                capture_output=True,
                text=True,
                timeout=5,
            )
            ip = res.stdout.strip()
            return ip if ip else None
        except Exception:
            return None

    def _container_running(self, instance_name: str) -> bool:
        try:
            res = subprocess.run(
                ["docker", "inspect", "-f", "{{.State.Running}}", instance_name],
                capture_output=True,
                text=True,
                timeout=5,
            )
            return res.stdout.strip().lower() == "true"
        except Exception:
            return False

    def _get_active_assignment(self, instance_name: str) -> Optional[Dict[str, Any]]:
        state_file = INSTANCES_DIR / instance_name / "usb_tether.json"
        if not state_file.exists():
            return None
        try:
            return json.loads(state_file.read_text(encoding="utf-8"))
        except Exception:
            return None

    def _save_assignment(self, instance_name: str, data: Dict[str, Any]) -> None:
        inst_dir = INSTANCES_DIR / instance_name
        inst_dir.mkdir(parents=True, exist_ok=True)
        state_file = inst_dir / "usb_tether.json"
        state_file.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def _remove_assignment(self, instance_name: str) -> None:
        state_file = INSTANCES_DIR / instance_name / "usb_tether.json"
        if state_file.exists():
            try:
                state_file.unlink()
            except OSError:
                pass

    def _sync_meta_state(self, instance_name: str, state: str, exit_ip: Optional[str] = None) -> None:
        meta_file = INSTANCES_DIR / instance_name / "meta.json"
        if not meta_file.exists():
            return
        try:
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
            meta["network"] = {
                "state": state,
                "error": None,
                "exit_ip": exit_ip,
                "latency_ms": None,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            meta_file.write_text(json.dumps(meta, indent=2), encoding="utf-8")
        except Exception:
            pass

    async def _run_adb_cmd(self, serial: str, cmd_str: str, timeout: int = 10) -> str:
        proc = await asyncio.create_subprocess_exec(
            "adb", "-s", serial, "shell", cmd_str,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            out, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            return out.decode(errors="replace").strip()
        except asyncio.TimeoutError:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            return ""

    def _query_public_ip_on_iface_sync(self, iface: str, timeout: int = 6) -> Optional[str]:
        """Consulta la IP pública saliendo exclusivamente por la interfaz especificada."""
        cmd = f"curl --interface {iface} -s --max-time {timeout} https://api.ipify.org || curl --interface {iface} -s --max-time {timeout} https://ifconfig.me/ip"
        code, out, _ = host_firewall._run_sync(cmd, timeout=timeout + 2)
        ip = out.strip()
        if re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", ip):
            return ip
        return None

    async def _query_public_ip_on_iface(self, iface: str, timeout: int = 6) -> Optional[str]:
        cmd = f"curl --interface {iface} -s --max-time {timeout} https://api.ipify.org || curl --interface {iface} -s --max-time {timeout} https://ifconfig.me/ip"
        code, out, _ = await host_firewall._run_async(cmd, timeout=timeout + 2)
        ip = out.strip()
        if re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", ip):
            return ip
        return None

    def _get_iface_route_info(self, iface: str) -> Tuple[Optional[str], Optional[str]]:
        """Obtiene gateway y subred para una interfaz de red del host."""
        gateway = None
        subnet = None
        try:
            r = subprocess.run(["ip", "route", "show", "dev", iface], capture_output=True, text=True, timeout=5)
            for line in r.stdout.splitlines():
                parts = line.strip().split()
                if "via" in parts:
                    idx = parts.index("via")
                    if idx + 1 < len(parts):
                        gateway = parts[idx + 1]
                elif parts and "/" in parts[0] and "proto" in line:
                    subnet = parts[0]
                elif parts and "/" in parts[0] and "scope link" in line:
                    subnet = parts[0]
        except Exception:
            pass
        return gateway, subnet

    async def discover_usb_devices(self) -> List[UsbDevice]:
        """
        Escanea y correlaciona dispositivos ADB físicos con interfaces de red USB del host.
        """
        # 1. Obtener lista de dispositivos físicos ADB
        adb_devices: Dict[str, Dict[str, str]] = {}
        try:
            proc = await asyncio.create_subprocess_exec(
                "adb", "devices", "-l",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            out, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
            for line in out.decode(errors="replace").splitlines():
                line = line.strip()
                if not line or line.startswith("List of devices"):
                    continue
                parts = line.split()
                if len(parts) >= 2 and parts[1] == "device":
                    serial = parts[0]
                    # Descartar instancias ReDroid / emuladores virtuales
                    if serial.startswith("127.0.0.1:") or serial.startswith("emulator-"):
                        continue
                    info: Dict[str, str] = {"serial": serial}
                    for p in parts[2:]:
                        if ":" in p:
                            k, v = p.split(":", 1)
                            info[k] = v
                    adb_devices[serial] = info
        except Exception as e:
            logger.warning(f"Error listando adb devices: {e}")

        # 2. Escanear interfaces de red en /sys/class/net
        net_path = Path("/sys/class/net")
        iface_candidates: List[Dict[str, Any]] = []
        if net_path.exists():
            for p in net_path.iterdir():
                iface = p.name
                if iface in ("lo", "docker0") or iface.startswith("veth"):
                    continue

                # Determinar si es interfaz USB
                driver_link = p / "device" / "driver"
                driver = ""
                if driver_link.exists():
                    try:
                        driver = os.path.realpath(str(driver_link)).split(os.sep)[-1]
                    except Exception:
                        driver = ""

                resolved_path = ""
                try:
                    resolved_path = os.path.realpath(str(p))
                except Exception:
                    pass

                is_usb = (
                    driver in USB_NET_DRIVERS
                    or "/usb" in resolved_path
                    or iface.startswith("usb")
                    or (iface.startswith("enp") and "u" in iface)
                )

                if is_usb:
                    # Intentar leer serial del dispositivo USB en sysfs
                    serial_candidate = ""
                    for s_candidate in [
                        p / "device" / "serial",
                        p / "device" / ".." / "serial",
                        p / "device" / ".." / ".." / "serial",
                    ]:
                        if s_candidate.exists():
                            try:
                                serial_candidate = s_candidate.read_text(encoding="utf-8").strip()
                                if serial_candidate:
                                    break
                            except Exception:
                                pass

                    gw, sub = self._get_iface_route_info(iface)
                    iface_candidates.append({
                        "iface": iface,
                        "driver": driver,
                        "sys_serial": serial_candidate,
                        "gateway": gw,
                        "subnet": sub,
                        "path": resolved_path,
                    })

        # 3. Mapear asignaciones activas desde disco
        assignments: Dict[str, str] = {}  # iface -> instance_name
        for inst_entry in INSTANCES_DIR.glob("*/usb_tether.json"):
            try:
                dt = json.loads(inst_entry.read_text(encoding="utf-8"))
                assigned_iface = dt.get("iface")
                inst_name = inst_entry.parent.name
                if assigned_iface and self._container_running(inst_name):
                    assignments[assigned_iface] = inst_name
                    if inst_name in self.waiting_queue:
                        self.waiting_queue.remove(inst_name)
                else:
                    # Si el contenedor ya no corre, limpiar estado huérfano
                    if not self._container_running(inst_name):
                        inst_entry.unlink(missing_ok=True)
            except Exception:
                pass

        # 4. Construir lista unificada de UsbDevice
        devices: List[UsbDevice] = []

        # Correlacionar cada interfaz encontrada con su serial ADB
        for cand in iface_candidates:
            iface = cand["iface"]
            sys_serial = cand["sys_serial"]
            matched_serial = None

            if sys_serial and sys_serial in adb_devices:
                matched_serial = sys_serial
            else:
                # Búsqueda por bus USB
                for s, info in adb_devices.items():
                    usb_bus = info.get("usb")
                    if usb_bus and f"/{usb_bus}/" in cand["path"]:
                        matched_serial = s
                        break
                # Si solo hay 1 dispositivo ADB físico y 1 interfaz USB, asociar
                if not matched_serial and len(adb_devices) == 1:
                    matched_serial = list(adb_devices.keys())[0]

            serial = matched_serial or sys_serial or iface
            model = "Desconocido"
            carrier = "Móvil"
            network_type = "LTE"
            battery = "100%"
            mobile_data = True
            airplane_mode = False

            if matched_serial:
                # Consultar propiedades en vivo vía ADB
                try:
                    m_val = await self._run_adb_cmd(matched_serial, "getprop ro.product.model")
                    if m_val:
                        model = m_val
                    c_val = await self._run_adb_cmd(matched_serial, "getprop gsm.operator.alpha")
                    if c_val:
                        carrier = c_val
                    n_val = await self._run_adb_cmd(matched_serial, "getprop gsm.network.type")
                    if n_val:
                        network_type = n_val
                    b_val = await self._run_adb_cmd(matched_serial, "dumpsys battery | grep level")
                    if b_val and "level:" in b_val:
                        battery = b_val.split("level:")[1].strip() + "%"
                    md_val = await self._run_adb_cmd(matched_serial, "settings get global mobile_data")
                    mobile_data = md_val == "1"
                    ap_val = await self._run_adb_cmd(matched_serial, "cmd connectivity airplane-mode")
                    airplane_mode = ap_val.strip().lower() == "enabled"
                except Exception as e:
                    logger.debug(f"Error consultando ADB para {matched_serial}: {e}")

            assigned = assignments.get(iface)
            status = "assigned" if assigned else "idle"

            devices.append(UsbDevice(
                serial=serial,
                iface=iface,
                model=model,
                carrier=carrier,
                network_type=network_type,
                battery=battery,
                mobile_data=mobile_data,
                airplane_mode=airplane_mode,
                current_ip=None,  # Se evalúa bajo demanda para no saturar curl
                gateway=cand["gateway"],
                subnet=cand["subnet"],
                assigned_instance=assigned,
                status=status,
            ))

        return devices

    async def get_instance_network_state(self, instance_name: str) -> Dict[str, Any]:
        """Devuelve el estado de red actual de una instancia."""
        running = self._container_running(instance_name)
        active_assign = self._get_active_assignment(instance_name)

        # Estado en memoria o derivado
        mem_state = self._instance_states.get(instance_name, {})
        current_state = mem_state.get("state")

        if not running:
            return {
                "instance": instance_name,
                "running": False,
                "state": "OFFLINE",
                "assigned_usb": None,
                "public_ip": None,
                "queue_position": None,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }

        if self._pending_offer and self._pending_offer.get("instance") == instance_name:
            offer_info = self.get_pending_offer()
            return {
                "instance": instance_name,
                "running": True,
                "state": "OFFERED",
                "pending_offer": offer_info,
                "assigned_usb": None,
                "public_ip": None,
                "queue_position": 1,
                "message": f"Módem disponible. Conectando en {offer_info['expires_in_seconds']}s...",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }

        if instance_name in self.waiting_queue:
            q_pos = self.waiting_queue.index(instance_name) + 1
            return {
                "instance": instance_name,
                "running": True,
                "state": "WAITING_USB",
                "assigned_usb": None,
                "public_ip": None,
                "queue_position": q_pos,
                "message": f"En cola de espera de módem USB (Posición #{q_pos})",
                "error": mem_state.get("error"),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }

        if active_assign and running:
            return {
                "instance": instance_name,
                "running": True,
                "state": current_state or "CONNECTED_USB",
                "assigned_usb": active_assign,
                "public_ip": active_assign.get("public_ip"),
                "queue_position": None,
                "updated_at": active_assign.get("attached_at"),
            }

        return {
            "instance": instance_name,
            "running": True,
            "state": current_state or "QUARANTINE",
            "assigned_usb": None,
            "public_ip": None,
            "queue_position": None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

    async def claim_usb(
        self,
        instance_name: str,
        preferred_serial: Optional[str] = None,
        steal_from: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Reclama una conexión USB para la instancia.
        Si la instancia tenía una oferta temporal activa, la cancela de inmediato y consolida la conexión.
        """
        async with self._lock:
            if self._pending_offer and self._pending_offer.get("instance") == instance_name:
                self._cancel_offer_unlocked()
            return await self._claim_usb_unlocked(
                instance_name=instance_name,
                preferred_serial=preferred_serial,
                steal_from=steal_from,
            )

    async def _claim_usb_unlocked(
        self,
        instance_name: str,
        preferred_serial: Optional[str] = None,
        steal_from: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Lógica interna de reclamo de módem USB bajo lock."""
        if not self._container_running(instance_name):
            raise RuntimeError(f"El contenedor '{instance_name}' no está corriendo.")

        cip = self._container_ip(instance_name)
        if not cip:
            raise RuntimeError(f"No se pudo determinar la IP interna de '{instance_name}'.")

        # Si se solicitó liberar explícitamente a otra instancia
        if steal_from and steal_from != instance_name:
            logger.info(f"Reasignando módem forzosamente desde {steal_from} hacia {instance_name}")
            await self.release_network_unlocked(steal_from, pop_queue=False)

        # Descubrir dispositivos
        devices = await self.discover_usb_devices()
        if not devices:
            self._instance_states[instance_name] = {"state": "WAITING_USB"}
            if instance_name not in self.waiting_queue:
                self.waiting_queue.append(instance_name)
            q_pos = self.waiting_queue.index(instance_name) + 1
            return {
                "status": "waiting",
                "instance": instance_name,
                "state": "WAITING_USB",
                "queue_position": q_pos,
                "message": "No se detectaron celulares USB conectados. Enchufá un teléfono o activá el anclaje USB.",
            }

        # Buscar un dispositivo disponible
        target_device: Optional[UsbDevice] = None
        if preferred_serial:
            for d in devices:
                if d.serial == preferred_serial and (d.status == "idle" or d.assigned_instance == instance_name):
                    target_device = d
                    break

        if not target_device:
            for d in devices:
                if d.status == "idle" or d.assigned_instance == instance_name:
                    target_device = d
                    break

        # Si todos los dispositivos están ocupados
        if not target_device:
            self._instance_states[instance_name] = {"state": "WAITING_USB"}
            if instance_name not in self.waiting_queue:
                self.waiting_queue.append(instance_name)
            q_pos = self.waiting_queue.index(instance_name) + 1

            # Información de ocupación para el mensaje de la UI
            occupants = {d.iface: d.assigned_instance for d in devices if d.assigned_instance}
            return {
                "status": "waiting",
                "instance": instance_name,
                "state": "WAITING_USB",
                "queue_position": q_pos,
                "occupants": occupants,
                "message": f"Todos los módems USB están ocupados. Puesto en cola #{q_pos}.",
            }

        iface = target_device.iface
        serial = target_device.serial
        gw = target_device.gateway
        sub = target_device.subnet or f"{gw.rsplit('.', 1)[0]}.0/24" if gw else ""

        if not gw:
            gw, sub = self._get_iface_route_info(iface)

        if not gw:
            raise RuntimeError(f"La interfaz {iface} no tiene gateway asignado por DHCP. Verificá el anclaje USB.")

        # Habilitar datos móviles por ADB si están desactivados
        if USB_MOBILE_FORCE_DATA and not target_device.mobile_data:
            logger.info(f"Activando datos móviles en {serial}...")
            await self._run_adb_cmd(serial, "svc data enable")
            await self._run_adb_cmd(serial, "svc wifi disable")
            await asyncio.sleep(2)

        # Verificar la IP pública y rotar con Modo Avión si colisiona con otra instancia
        self._instance_states[instance_name] = {"state": "ROTATING_IP"}
        approved_ip = None

        for attempt in range(1, USB_ROTATE_MAX_ATTEMPTS + 1):
            cur_ip = await self._query_public_ip_on_iface(iface)
            if not cur_ip:
                logger.warning(f"Intento {attempt}: {iface} sin respuesta IP pública. Esperando 2s...")
                await asyncio.sleep(2)
                continue

            is_safe, reason, conflicting_instance = ip_ledger.check_ip_safety(cur_ip, instance_name)
            if is_safe:
                logger.info(f"[IP-Ledger] IP {cur_ip} aprobada para {instance_name} (Razón: {reason})")
                approved_ip = cur_ip
                break

            logger.warning(
                f"[IP-Ledger] Colisión detectada: IP {cur_ip} pertenece a '{conflicting_instance}'. "
                f"Rotando Modo Avión (Intento {attempt}/{USB_ROTATE_MAX_ATTEMPTS})..."
            )

            # Rotar vía Modo Avión
            await self._run_adb_cmd(serial, "cmd connectivity airplane-mode enable")
            await asyncio.sleep(4)
            await self._run_adb_cmd(serial, "cmd connectivity airplane-mode disable")
            # Esperar a que la interfaz renegocie DHCP
            await asyncio.sleep(5)

        if not approved_ip:
            # Tras los intentos máximos sigue habiendo colisión o sin respuesta
            await host_firewall.apply_quarantine(instance_name, cip)
            self._instance_states[instance_name] = {
                "state": "WAITING_USB",
                "error": f"No se pudo obtener IP limpia tras {USB_ROTATE_MAX_ATTEMPTS} intentos.",
            }
            raise RuntimeError(
                f"No se pudo obtener una IP limpia tras {USB_ROTATE_MAX_ATTEMPTS} intentos de Modo Avión. "
                f"Instancia retenida en cuarentena por seguridad."
            )

        # IP aprobada: Registrar en el Historial (IP Ledger)
        ip_ledger.record_ip(
            ip=approved_ip,
            instance_name=instance_name,
            usb_id=serial,
            carrier=target_device.carrier,
        )

        # Aplicar enrutamiento host y abrir firewall hacia esta interfaz USB
        routed = await host_firewall.apply_usb_routing(
            instance_name=instance_name,
            container_ip=cip,
            usb_iface=iface,
            gateway=gw,
            subnet=sub,
        )
        if not routed:
            await host_firewall.apply_quarantine(instance_name, cip)
            self._instance_states[instance_name] = {
                "state": "WAITING_USB",
                "error": "Fallo al aplicar enrutamiento en el host.",
            }
            raise RuntimeError(f"Fallo al aplicar enrutamiento en el host para {instance_name}.")

        try:
            from server.services.proxy_service import proxy_service
            await proxy_service.unquarantine(instance_name)
        except Exception as e:
            logger.warning(f"No se pudo desaplicar cuarentena interna en {instance_name}: {e}")

        # Guardar estado persistente de la asignación
        assign_data = {
            "instance": instance_name,
            "iface": iface,
            "serial": serial,
            "model": target_device.model,
            "carrier": target_device.carrier,
            "gateway": gw,
            "subnet": sub,
            "container_ip": cip,
            "public_ip": approved_ip,
            "attached_at": datetime.now(timezone.utc).isoformat(),
        }
        self._save_assignment(instance_name, assign_data)
        self._sync_meta_state(instance_name, "routed", approved_ip)
        self._instance_states[instance_name] = {"state": "CONNECTED_USB"}

        # Asignación exitosa: retirar definitivamente de la cola de espera
        if instance_name in self.waiting_queue:
            self.waiting_queue.remove(instance_name)

        # Si había una oferta activa para esta instancia, limpiarla
        if self._pending_offer and self._pending_offer.get("instance") == instance_name:
            self._cancel_offer_unlocked()

        return {
            "status": "ok",
            "instance": instance_name,
            "state": "CONNECTED_USB",
            "public_ip": approved_ip,
            "assignment": assign_data,
        }

    async def release_network_unlocked(self, instance_name: str, pop_queue: bool = True) -> Dict[str, Any]:
        """Lógica interna de liberación sin adquirir el lock para llamadas compuestas."""
        self._instance_states[instance_name] = {"state": "RELEASING"}
        cip = self._container_ip(instance_name)

        # 1. Cuarentena inmediata en el host (corta salida, limpia conntrack, preserva contenedor)
        if cip:
            await host_firewall.apply_quarantine(instance_name, cip)

        try:
            from server.services.proxy_service import proxy_service
            await proxy_service.quarantine(instance_name)
        except Exception as e:
            logger.warning(f"No se pudo aplicar cuarentena interna en {instance_name}: {e}")

        # 2. Eliminar registro de asignación
        assign = self._get_active_assignment(instance_name)
        freed_serial = assign.get("serial") if assign else None

        self._remove_assignment(instance_name)
        self._instance_states[instance_name] = {"state": "QUARANTINE"}

        # Si la instancia estaba en la cola de espera, removerla
        if instance_name in self.waiting_queue:
            self.waiting_queue.remove(instance_name)

        # Si la oferta activa pertenecía a esta instancia, cancelarla
        if self._pending_offer and self._pending_offer.get("instance") == instance_name:
            self._cancel_offer_unlocked()

        # Sincronizar estado en meta.json
        self._sync_meta_state(instance_name, "quarantined")

        # 3. Transición con Oferta Temporal (Grace Period 5s)
        offered_next = None
        if pop_queue and self.waiting_queue:
            offered_next = self.waiting_queue[0]
            logger.info(f"Cola FIFO: ofreciendo módem liberado ({freed_serial}) a '{offered_next}' con 5s de gracia")
            self._start_offer_unlocked(offered_next, device_serial=freed_serial)

        return {
            "status": "ok",
            "instance": instance_name,
            "state": "QUARANTINE",
            "offered_next": offered_next,
            "popped_next": offered_next,
            "pending_offer": self.get_pending_offer(),
            "message": f"Instancia {instance_name} en cuarentena segura. Módem liberado.",
        }

    async def decline_offer(self, instance_name: str, requeue: bool = True) -> Dict[str, Any]:
        """
        Declina una oferta de módem USB o cede el turno en la cola FIFO.
        Si requeue=True, mueve la instancia al final de la cola; si False, la retira.
        Promueve inmediatamente a la siguiente instancia en la cola, reiniciando los 5s.
        """
        async with self._lock:
            is_current_offer = (
                self._pending_offer is not None
                and self._pending_offer.get("instance") == instance_name
            )
            freed_serial = (
                self._pending_offer.get("device_serial")
                if self._pending_offer
                else None
            )

            if is_current_offer:
                self._cancel_offer_unlocked()

            if instance_name in self.waiting_queue:
                self.waiting_queue.remove(instance_name)
                if requeue:
                    self.waiting_queue.append(instance_name)
                    self._instance_states[instance_name] = {"state": "WAITING_USB"}
                    logger.info(f"Instancia '{instance_name}' cedió su turno y fue movida al final de la cola FIFO")
                else:
                    self._instance_states[instance_name] = {"state": "QUARANTINE"}
                    logger.info(f"Instancia '{instance_name}' canceló su turno y fue retirada de la cola FIFO")
            else:
                self._instance_states[instance_name] = {"state": "QUARANTINE"}

            # Promover inmediatamente a la siguiente instancia en la cola si existe
            next_offered = None
            if self.waiting_queue:
                candidate = self.waiting_queue[0]
                if candidate != instance_name:
                    next_offered = candidate
                    logger.info(f"Promoviendo a '{next_offered}' con gracia de 5s tras declinación de '{instance_name}'")
                    self._start_offer_unlocked(next_offered, freed_serial)

            return {
                "status": "ok",
                "instance": instance_name,
                "requeued": requeue,
                "next_offered": next_offered,
                "pending_offer": self.get_pending_offer(),
                "waiting_queue": list(self.waiting_queue),
            }

    async def release_network(self, instance_name: str) -> Dict[str, Any]:
        """Pone en cuarentena en caliente y libera el módem USB para el siguiente en espera."""
        async with self._lock:
            return await self.release_network_unlocked(instance_name)

    async def force_rotate_ip(self, instance_name: str) -> Dict[str, Any]:
        """
        Fuerza la rotación de IP vía Modo Avión (ADB) sobre el módem asignado a la instancia.
        """
        async with self._lock:
            assign = self._get_active_assignment(instance_name)
            if not assign:
                raise RuntimeError(f"La instancia '{instance_name}' no tiene un módem USB asignado.")

            serial = assign.get("serial")
            iface = assign.get("iface")
            cip = assign.get("container_ip") or self._container_ip(instance_name)
            old_ip = assign.get("public_ip")

            self._instance_states[instance_name] = {"state": "ROTATING_IP"}

            # Ejecutar ciclo de Modo Avión
            logger.info(f"Forzando Modo Avión en {serial} para {instance_name}...")
            await self._run_adb_cmd(serial, "cmd connectivity airplane-mode enable")
            await asyncio.sleep(4)
            await self._run_adb_cmd(serial, "cmd connectivity airplane-mode disable")
            await asyncio.sleep(5)

            new_ip = None
            for _ in range(5):
                cur_ip = await self._query_public_ip_on_iface(iface)
                if cur_ip:
                    new_ip = cur_ip
                    break
                await asyncio.sleep(2)

            if not new_ip:
                self._instance_states[instance_name] = {"state": "CONNECTED_USB"}
                raise RuntimeError("No se obtuvo respuesta de red tras rotar Modo Avión.")

            # Registrar en el libro mayor
            ip_ledger.record_ip(
                ip=new_ip,
                instance_name=instance_name,
                usb_id=serial,
                carrier=assign.get("carrier"),
            )

            # Actualizar estado de asignación
            assign["public_ip"] = new_ip
            assign["attached_at"] = datetime.now(timezone.utc).isoformat()
            self._save_assignment(instance_name, assign)
            self._sync_meta_state(instance_name, "routed", new_ip)
            self._instance_states[instance_name] = {"state": "CONNECTED_USB"}

            return {
                "status": "ok",
                "instance": instance_name,
                "state": "CONNECTED_USB",
                "old_ip": old_ip,
                "new_ip": new_ip,
                "serial": serial,
            }

    async def test_rotation(self, serial: str) -> Dict[str, Any]:
        """Ejecuta un ciclo de prueba de rotación Modo Avión sobre un teléfono físico."""
        t0 = time.time()
        # Estado inicial
        init_ap = await self._run_adb_cmd(serial, "cmd connectivity airplane-mode")
        await self._run_adb_cmd(serial, "cmd connectivity airplane-mode enable")
        await asyncio.sleep(4)
        await self._run_adb_cmd(serial, "cmd connectivity airplane-mode disable")
        await asyncio.sleep(4)
        final_ap = await self._run_adb_cmd(serial, "cmd connectivity airplane-mode")
        elapsed = round(time.time() - t0, 2)

        return {
            "status": "ok",
            "serial": serial,
            "airplane_initial": init_ap,
            "airplane_final": final_ap,
            "elapsed_seconds": elapsed,
        }


usb_network_service = UsbNetworkService()
