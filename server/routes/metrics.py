"""
Router de Telemetría y Métricas en Tiempo Real (HI-4).
Expone métricas nativas del host y cgroups v2 de instancias ReDroid/ProteoMesh.
"""
from __future__ import annotations

import logging
import re
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter

from server.services import screenshot_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/metrics", tags=["Telemetría y Métricas"])

# Caché en memoria para cálculo de delta de CPU por contenedor
# cid -> (timestamp_monotonic, usage_usec)
_cpu_prev_samples: Dict[str, tuple[float, int]] = {}


def _find_cgroup_dir(cid: str) -> Optional[Path]:
    """Localiza el directorio cgroup v2 del contenedor."""
    candidates = [
        Path(f"/sys/fs/cgroup/system.slice/docker-{cid}.scope"),
        Path(f"/sys/fs/cgroup/docker/{cid}"),
        Path(f"/sys/fs/cgroup/docker-{cid}.scope"),
    ]
    for c in candidates:
        if c.exists() and c.is_dir():
            return c
    return None


def _read_cgroup_file(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8").strip()
    except Exception:
        return ""


def get_container_cgroup_metrics(cid: str) -> Dict[str, Any]:
    """Lee métricas directas de cgroup v2 (memoria, swap, cpu, pids)."""
    cg_dir = _find_cgroup_dir(cid)
    if not cg_dir:
        return {
            "pids": None,
            "cpu": {"cpu_percent": 0.0, "usage_seconds": 0.0, "throttled_seconds": 0.0, "nr_throttled": 0},
            "memory": {"anon_bytes": 0, "anon_mb": 0.0, "file_bytes": 0, "file_mb": 0.0, "swap_bytes": 0, "swap_mb": 0.0},
        }

    # PIDs
    pids_str = _read_cgroup_file(cg_dir / "pids.current")
    pids = int(pids_str) if pids_str.isdigit() else None

    # Memoria y Swap
    anon_bytes = 0
    file_bytes = 0
    mem_stat_txt = _read_cgroup_file(cg_dir / "memory.stat")
    if mem_stat_txt:
        for line in mem_stat_txt.splitlines():
            parts = line.split()
            if len(parts) == 2:
                if parts[0] == "anon":
                    try:
                        anon_bytes = int(parts[1])
                    except ValueError:
                        pass
                elif parts[0] == "file":
                    try:
                        file_bytes = int(parts[1])
                    except ValueError:
                        pass

    swap_bytes = 0
    swap_str = _read_cgroup_file(cg_dir / "memory.swap.current")
    if swap_str.isdigit():
        swap_bytes = int(swap_str)

    # CPU
    cpu_stat_txt = _read_cgroup_file(cg_dir / "cpu.stat")
    usage_usec = 0
    nr_throttled = 0
    throttled_usec = 0
    if cpu_stat_txt:
        for line in cpu_stat_txt.splitlines():
            parts = line.split()
            if len(parts) == 2:
                k, v = parts[0], parts[1]
                try:
                    if k == "usage_usec":
                        usage_usec = int(v)
                    elif k == "nr_throttled":
                        nr_throttled = int(v)
                    elif k == "throttled_usec":
                        throttled_usec = int(v)
                except ValueError:
                    pass

    now = time.monotonic()
    cpu_percent = 0.0
    if cid in _cpu_prev_samples:
        prev_t, prev_usage = _cpu_prev_samples[cid]
        delta_t = now - prev_t
        delta_usage = usage_usec - prev_usage
        if delta_t > 0 and delta_usage >= 0:
            cpu_percent = round((delta_usage / (delta_t * 1_000_000.0)) * 100.0, 1)

    _cpu_prev_samples[cid] = (now, usage_usec)

    return {
        "pids": pids,
        "cpu": {
            "cpu_percent": cpu_percent,
            "usage_seconds": round(usage_usec / 1_000_000.0, 2),
            "throttled_seconds": round(throttled_usec / 1_000_000.0, 2),
            "nr_throttled": nr_throttled,
        },
        "memory": {
            "anon_bytes": anon_bytes,
            "anon_mb": round(anon_bytes / (1024 * 1024), 2),
            "file_bytes": file_bytes,
            "file_mb": round(file_bytes / (1024 * 1024), 2),
            "swap_bytes": swap_bytes,
            "swap_mb": round(swap_bytes / (1024 * 1024), 2),
        },
    }


def get_host_zram_metrics() -> Dict[str, Any]:
    """Extrae métricas del dispositivo swap ZRAM del kernel."""
    total_kb = 0
    used_kb = 0
    swaps_path = Path("/proc/swaps")
    if swaps_path.exists():
        try:
            lines = swaps_path.read_text(encoding="utf-8").splitlines()
            for line in lines[1:]:
                parts = line.split()
                if len(parts) >= 4 and "zram" in parts[0]:
                    total_kb += int(parts[2])
                    used_kb += int(parts[3])
        except Exception:
            pass

    free_kb = max(0, total_kb - used_kb)
    compression_ratio = 1.0

    # Leer mm_stat si está disponible para ratio de compresión exacto
    mm_stat_path = Path("/sys/block/zram0/mm_stat")
    if mm_stat_path.exists():
        try:
            vals = [int(x) for x in mm_stat_path.read_text(encoding="utf-8").split()]
            if len(vals) >= 2 and vals[1] > 0:
                compression_ratio = round(vals[0] / vals[1], 2)
        except Exception:
            pass

    return {
        "total_mb": round(total_kb / 1024, 2),
        "used_mb": round(used_kb / 1024, 2),
        "free_mb": round(free_kb / 1024, 2),
        "compression_ratio": compression_ratio,
    }


@router.get("", summary="Métricas de rendimiento del host e instancias")
def get_metrics() -> Dict[str, Any]:
    """
    Retorna métricas unificadas de observabilidad (HI-4):
    - **Instancias**: CPU%, anon memory, swap, PIDs, cgroups v2.
    - **Host**: Consumo de ZRAM y compresión.
    - **Screenshot Cache**: Latencias p50/p95, hit ratio y entradas activas.
    """
    # 1. Obtener contenedores en ejecución
    instances: List[Dict[str, Any]] = []
    try:
        res = subprocess.run(
            ["docker", "ps", "--no-trunc", "--format", "{{.ID}}\t{{.Names}}\t{{.Status}}"],
            capture_output=True, text=True, timeout=5
        )
        if res.returncode == 0 and res.stdout:
            for line in res.stdout.splitlines():
                parts = line.strip().split("\t")
                if len(parts) >= 2:
                    cid = parts[0]
                    name = parts[1]
                    status = parts[2] if len(parts) > 2 else ""
                    # Filtra solo contenedores de ProteoMesh/ReDroid si tienen nombre válido
                    cg_metrics = get_container_cgroup_metrics(cid)
                    instances.append({
                        "name": name,
                        "container_id": cid,
                        "status": status,
                        "pids": cg_metrics["pids"],
                        "cpu": cg_metrics["cpu"],
                        "memory": cg_metrics["memory"],
                    })
    except Exception as e:
        logger.error(f"[Metrics] Error consultando contenedores: {e}")

    # 2. Métricas del host
    zram = get_host_zram_metrics()
    cache_stats = screenshot_cache.get_cache_stats()

    return {
        "timestamp": time.time(),
        "instances": instances,
        "host": {
            "zram": zram,
            "screenshot_cache": cache_stats,
        },
    }
