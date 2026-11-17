"""
Caché con TTL y single-flight para capturas de pantalla de instancias.

El endpoint `/instances/{name}/screen` es caro (~283 ms por request: `docker
ps` + `docker exec screencap` + re-encode PIL). Este módulo evita repetir
capturas cuando varias peticiones del mismo teléfono llegan en un lapso corto.

La clave ignora el parámetro `t` que el frontend añade para cache-busting del
navegador: dos peticiones con distinto `t` para la misma instancia + formato +
max_width comparten la misma entrada.
"""
from __future__ import annotations

import math
import os
import random
import threading
import time
from typing import Any, Callable, Dict, Optional, Tuple

# TTL por defecto para tarjetas en reposo (dashboard/DeviceCard): 30-60 s configurable.
DEFAULT_IDLE_TTL = float(os.getenv("SCREENSHOT_IDLE_TTL", "30.0"))
# TTL para el camino interactivo (FocusView / InteractiveScreen): ~0.5s - 1.0s
INTERACTIVE_TTL = float(os.getenv("SCREENSHOT_INTERACTIVE_TTL", "0.5"))

MIN_TTL = 0.1
MAX_TTL = 300.0

DEFAULT_TTL = DEFAULT_IDLE_TTL
MAX_ENTRIES = 128


def sanitize_ttl(ttl: Any) -> float:
    """Normaliza y acota el TTL a un rango seguro [MIN_TTL, MAX_TTL].

    Valores None, no numéricos, NaN, <= 0 o fuera de rango retornan DEFAULT_IDLE_TTL.
    """
    if ttl is None:
        return DEFAULT_IDLE_TTL
    try:
        val = float(ttl)
        if math.isnan(val) or math.isinf(val):
            return DEFAULT_IDLE_TTL
        if val < MIN_TTL or val > MAX_TTL:
            return DEFAULT_IDLE_TTL
        return val
    except (ValueError, TypeError):
        return DEFAULT_IDLE_TTL


def apply_ttl_jitter(ttl: float, jitter_pct: float = 0.20) -> float:
    """Aplica jitter aleatorio de ±jitter_pct (por defecto ±20%) sobre el TTL de reposo.

    Evita que múltiples tarjetas en reposo sincronicen sus vencimientos de caché.
    No aplica jitter a TTLs cortos del camino interactivo (< 5.0 s).
    """
    if ttl < 5.0:
        return ttl
    factor = random.uniform(1.0 - jitter_pct, 1.0 + jitter_pct)
    return max(MIN_TTL, round(ttl * factor, 2))

# entry -> (expires_at_monotonic, bytes)
_cache: Dict[str, Tuple[float, bytes]] = {}
_cache_guard = threading.Lock()

# candados por clave para single-flight
_locks: Dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _key(name: str, fmt: str, max_width: int, ttl: float = 30.0) -> str:
    # Aísla el canal interactivo si el TTL solicitado es corto (<= 2s)
    if ttl <= 2.0:
        return f"{name}:{fmt}:{max_width}:interactive"
    return f"{name}:{fmt}:{max_width}"


def _get_lock(key: str) -> threading.Lock:
    with _locks_guard:
        lock = _locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _locks[key] = lock
        return lock


def _get(key: str) -> Optional[bytes]:
    with _cache_guard:
        entry = _cache.get(key)
        if entry is None:
            return None
        expires, data = entry
        if expires <= time.monotonic():
            _cache.pop(key, None)
            return None
        return data


def _set(key: str, data: bytes, ttl: float) -> None:
    with _cache_guard:
        if len(_cache) >= MAX_ENTRIES and key not in _cache:
            _evict_some_locked()
        _cache[key] = (time.monotonic() + ttl, data)


def _evict_some_locked() -> None:
    now = time.monotonic()
    for key in [k for k, (e, _) in _cache.items() if e <= now]:
        _cache.pop(key, None)
    if len(_cache) >= MAX_ENTRIES:
        oldest = sorted(_cache.items(), key=lambda kv: kv[1][0])
        for key, _ in oldest[: len(_cache) - MAX_ENTRIES + 1]:
            _cache.pop(key, None)


# ── Telemetría de Captura y Caché (HI-4) ────────────────────────────────────
_cache_hits: int = 0
_cache_misses: int = 0
_latencies: list[float] = []  # Últimas latencias de captura en segundos
_metrics_guard = threading.Lock()


def record_latency(duration_s: float) -> None:
    """Registra una muestra de latencia de captura para telemetría (HI-4)."""
    with _metrics_guard:
        _latencies.append(duration_s)
        if len(_latencies) > 200:
            del _latencies[:100]


def _record_hit() -> None:
    global _cache_hits
    with _metrics_guard:
        _cache_hits += 1


def _record_miss() -> None:
    global _cache_misses
    with _metrics_guard:
        _cache_misses += 1


def get_cache_stats() -> dict:
    """Retorna métricas de hit/miss, latencias p50/p95 y entradas activas (HI-4)."""
    with _metrics_guard:
        hits = _cache_hits
        misses = _cache_misses
        lats = sorted(_latencies)
    with _cache_guard:
        active_entries = len(_cache)

    p50_ms = 0.0
    p95_ms = 0.0
    if lats:
        idx_50 = int(len(lats) * 0.50)
        idx_95 = min(int(len(lats) * 0.95), len(lats) - 1)
        p50_ms = round(lats[idx_50] * 1000.0, 2)
        p95_ms = round(lats[idx_95] * 1000.0, 2)

    total_reqs = hits + misses
    hit_ratio = round((hits / total_reqs) * 100.0, 1) if total_reqs > 0 else 0.0

    return {
        "hits": hits,
        "misses": misses,
        "total_requests": total_reqs,
        "hit_ratio_percent": hit_ratio,
        "active_entries": active_entries,
        "latency_p50_ms": p50_ms,
        "latency_p95_ms": p95_ms,
    }


def invalidate_instance(name: str) -> None:
    """Elimina todas las entradas de una instancia (stop/restart/delete)."""
    prefix = f"{name}:"
    with _cache_guard:
        for key in [k for k in _cache if k.startswith(prefix)]:
            _cache.pop(key, None)
    with _locks_guard:
        for key in [k for k in _locks if k.startswith(prefix)]:
            _locks.pop(key, None)


def clear() -> None:
    """Vacía la caché por completo (útil en tests)."""
    with _cache_guard:
        _cache.clear()
    with _locks_guard:
        _locks.clear()


def capture(
    name: str,
    fmt: str,
    max_width: int,
    fresh: bool,
    ttl: float,
    fn: Callable[[], bytes],
) -> bytes:
    """
    Devuelve una captura cacheada o ejecuta `fn` bajo single-flight.

    - `fresh=True` salta la caché (refresco inmediato al soltar el foco).
    - Si `fn` lanza una excepción, no se cachea el error y se propaga,
      liberando el candado para que el siguiente llamador reintente.
    """
    key = _key(name, fmt, max_width, ttl=ttl)
    if not fresh:
        cached = _get(key)
        if cached is not None:
            _record_hit()
            return cached

    lock = _get_lock(key)
    with lock:
        # Re-verificar dentro del candado: otro hilo pudo capturar mientras esperábamos.
        if not fresh:
            cached = _get(key)
            if cached is not None:
                _record_hit()
                return cached
        _record_miss()
        t_start = time.monotonic()
        data = fn()
        duration = time.monotonic() - t_start
        record_latency(duration)
        actual_ttl = apply_ttl_jitter(ttl)
        _set(key, data, actual_ttl)
        return data
