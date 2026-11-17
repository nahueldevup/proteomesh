"""
Módulo de acceso y persistencia para app_settings en SQLite.
Permite almacenar y recuperar preferencias de usuario y configuración del sistema.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from server.db.connection import get_connection, transaction

logger = logging.getLogger("proteomesh.settings_store")


class SettingsStore:
    """Acceso a configuración persistente en la tabla app_settings."""

    def get(self, key: str, default: Any = None) -> Any:
        """Obtiene una configuración deserializada desde JSON."""
        try:
            with get_connection(read_only=True) as conn:
                cur = conn.execute(
                    "SELECT value_json FROM app_settings WHERE key = ?",
                    (key,),
                )
                row = cur.fetchone()
                if row:
                    return json.loads(row["value_json"])
        except Exception as e:
            logger.warning("Error leyendo setting '%s': %s", key, e)
        return default

    def set(self, key: str, value: Any) -> None:
        """Guarda o actualiza una configuración serializada a JSON."""
        value_json = json.dumps(value, ensure_ascii=False)
        now_iso = datetime.now(timezone.utc).isoformat()
        with transaction() as conn:
            conn.execute(
                """
                INSERT INTO app_settings (key, value_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value_json = excluded.value_json,
                    updated_at = excluded.updated_at
                """,
                (key, value_json, now_iso),
            )

    def get_all(self) -> Dict[str, Any]:
        """Retorna todas las configuraciones guardadas como diccionario."""
        result: Dict[str, Any] = {}
        try:
            with get_connection(read_only=True) as conn:
                cur = conn.execute("SELECT key, value_json FROM app_settings")
                for row in cur.fetchall():
                    try:
                        result[row["key"]] = json.loads(row["value_json"])
                    except Exception:
                        result[row["key"]] = row["value_json"]
        except Exception as e:
            logger.warning("Error leyendo all settings: %s", e)
        return result

    def delete(self, key: str) -> bool:
        """Elimina una configuración por clave."""
        with transaction() as conn:
            cur = conn.execute("DELETE FROM app_settings WHERE key = ?", (key,))
            return cur.rowcount > 0


settings_store = SettingsStore()
