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

import os
import threading
import time
from typing import Callable, Dict, Optional, Tuple

# TTL por defecto para tarjetas en reposo (dashboard/DeviceCard): 30-60 s configurable.
DEFAULT_IDLE_TTL = float(os.getenv("SCREENSHOT_IDLE_TTL", "30.0"))
# TTL para el camino interactivo (FocusView / InteractiveScreen): ~0.5s - 1.0s
INTERACTIVE_TTL = float(os.getenv("SCREENSHOT_INTERACTIVE_TTL", "0.5"))

DEFAULT_TTL = DEFAULT_IDLE_TTL
MAX_ENTRIES = 128

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
            return cached

    lock = _get_lock(key)
    with lock:
        # Re-verificar dentro del candado: otro hilo pudo capturar mientras esperábamos.
        if not fresh:
            cached = _get(key)
            if cached is not None:
                return cached
        data = fn()
        _set(key, data, ttl)
        return data
