"""
Cuarentena de contenedores Android (NET-USB-001 / ISOLATION-001).

Aísla o libera la instancia a nivel de red dentro del contenedor
ejecutando los scripts iptables quarantine.sh.tmpl / unquarantine.sh.tmpl.
Esta lógica es independiente de cualquier transporte de salida (SOCKS5, USB, etc.).
"""
import asyncio
import subprocess
from pathlib import Path
from typing import Optional, Tuple

from server.config import TOOLS_DIR

QUARANTINE_SCRIPT_TMPL = TOOLS_DIR / "network" / "quarantine.sh.tmpl"
UNQUARANTINE_SCRIPT_TMPL = TOOLS_DIR / "network" / "unquarantine.sh.tmpl"


class ContainerQuarantineError(RuntimeError):
    """No se pudo aislar el contenedor: la cuarentena es obligatoria antes de cualquier salida real."""


def _ensure_kernel_net_modules() -> bool:
    """Asegura que los módulos de kernel tun, ip_tables e iptable_filter estén cargados."""
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


def _container_is_running(container_name: str) -> bool:
    """Devuelve True si el contenedor está activo en Docker."""
    try:
        result = subprocess.run(
            ["docker", "ps", "-q", "-f", f"name=^{container_name}$"],
            capture_output=True, text=True, timeout=5,
        )
        return bool(result.stdout.strip())
    except Exception:
        return False


async def quarantine_container(instance_name: str) -> bool:
    """
    Aísla la instancia a nivel de red dentro del contenedor usando iptables.
    Bloquea toda salida a Internet preservando el host Docker, ADB y scrcpy.
    Es idempotente: si ya está en cuarentena, la re-aplica sin error.
    Devuelve True si la cuarentena se aplicó; False si el contenedor no está en ejecución.
    Lanza ContainerQuarantineError si el contenedor está activo pero falla la aplicación.
    """
    if not _container_is_running(instance_name):
        return False

    _ensure_kernel_net_modules()

    if not QUARANTINE_SCRIPT_TMPL.exists():
        raise ContainerQuarantineError(f"Falta la plantilla {QUARANTINE_SCRIPT_TMPL}")

    script = QUARANTINE_SCRIPT_TMPL.read_text(encoding="utf-8")
    rc, out, err = await _exec_in_container(instance_name, script)
    if rc != 0 or "PM_QUARANTINE_OK" not in out:
        raise ContainerQuarantineError(
            f"No se pudo aplicar cuarentena en '{instance_name}': {err.strip() or out.strip()}"
        )
    return True


async def unquarantine_container(instance_name: str) -> bool:
    """
    Quita la cuarentena del contenedor, permitiendo tráfico de salida.
    Solo debe llamarse tras validar que la ruta de salida (USB, etc.) está activa.
    Devuelve True si se removió correctamente; False si el contenedor no está activo
    o la plantilla no existe.
    """
    if not _container_is_running(instance_name):
        return False

    if not UNQUARANTINE_SCRIPT_TMPL.exists():
        return False

    script = UNQUARANTINE_SCRIPT_TMPL.read_text(encoding="utf-8")
    rc, out, err = await _exec_in_container(instance_name, script)
    return rc == 0 and "PM_QUARANTINE_REMOVED" in out


async def is_quarantined(instance_name: str) -> bool:
    """
    Devuelve True si la cadena iptables PM_QUARANTINE está activa en OUTPUT del contenedor.
    """
    rc, _out, _err = await _exec_in_container(
        instance_name, "/system/bin/iptables -C OUTPUT -j PM_QUARANTINE 2>/dev/null"
    )
    return rc == 0
