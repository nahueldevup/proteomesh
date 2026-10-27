"""
Libro Mayor de IPs Públicas (IP Ledger)
=======================================
Registro histórico de IPs públicas utilizadas por cada CloudPhone a través de
los módems USB físicos para prevenir vinculaciones cruzadas entre instancias.

Reglas:
- TTL por defecto: 7 días (configurable: 24h, 7d, 30d, permanent).
- Excepción de reuso: una IP puede reutilizarse sin rotar Modo Avión si y solo si
  pertenece a la MISMA instancia dentro de la ventana de retención.
- Si la IP fue utilizada por OTRA instancia dentro de su TTL, se exige rotación.
"""
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from server.config import INSTANCES_DIR

DEFAULT_TTL_SETTING = "7d"
TTL_DELTAS = {
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
    "permanent": timedelta(days=36500),  # ~100 años
}


class IpLedger:
    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or (INSTANCES_DIR / "ip_ledger.db")
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

    def _init_db(self) -> None:
        with self._get_connection() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS usb_ip_ledger (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ip TEXT NOT NULL,
                    instance_name TEXT NOT NULL,
                    usb_id TEXT NOT NULL,
                    carrier TEXT,
                    first_seen_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_usb_ip ON usb_ip_ledger(ip);
                CREATE INDEX IF NOT EXISTS idx_usb_inst ON usb_ip_ledger(instance_name);
                CREATE INDEX IF NOT EXISTS idx_usb_exp ON usb_ip_ledger(expires_at);

                CREATE TABLE IF NOT EXISTS ledger_config (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                """
            )
            # Asegurar TTL por defecto si no existe
            cur = conn.execute("SELECT value FROM ledger_config WHERE key = 'ttl'")
            if not cur.fetchone():
                conn.execute("INSERT INTO ledger_config (key, value) VALUES ('ttl', ?)", (DEFAULT_TTL_SETTING,))
        try:
            os.chmod(self.db_path, 0o600)
        except OSError:
            pass

    def get_ttl_setting(self) -> str:
        """Obtiene la configuración actual de retención ('24h', '7d', '30d', 'permanent')."""
        with self._get_connection() as conn:
            cur = conn.execute("SELECT value FROM ledger_config WHERE key = 'ttl'")
            row = cur.fetchone()
            return row["value"] if row else DEFAULT_TTL_SETTING

    def set_ttl_setting(self, setting: str) -> str:
        """Establece la retención TTL ('24h', '7d', '30d', 'permanent')."""
        setting = setting.lower().strip()
        if setting not in TTL_DELTAS:
            raise ValueError(f"TTL inválido: {setting}. Opciones: {list(TTL_DELTAS.keys())}")
        with self._get_connection() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO ledger_config (key, value) VALUES ('ttl', ?)",
                (setting,),
            )
        return setting

    def _calc_expires_at(self, from_dt: datetime) -> str:
        setting = self.get_ttl_setting()
        delta = TTL_DELTAS.get(setting, TTL_DELTAS["7d"])
        exp = from_dt + delta
        return exp.isoformat()

    def check_ip_safety(self, ip: str, target_instance: str) -> Tuple[bool, str, Optional[str]]:
        """
        Verifica si la IP pública es segura para ser asignada a `target_instance`.

        Retorna:
          (is_safe, reason, conflicting_instance)
          - (True, "safe_new", None): la IP nunca se ha visto en entradas activas.
          - (True, "safe_same_instance", None): la IP solo ha sido usada por la misma instancia dentro del TTL.
          - (False, "conflict_other_instance", "phone-80"): colisión; otra instancia la usó dentro de su TTL.
        """
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            # Buscar registros de esta IP que aún no hayan expirado
            cur = conn.execute(
                """
                SELECT DISTINCT instance_name
                FROM usb_ip_ledger
                WHERE ip = ? AND expires_at > ?
                """,
                (ip, now_iso),
            )
            owners = [row["instance_name"] for row in cur.fetchall()]

            if not owners:
                return True, "safe_new", None

            # Si todos los registros activos pertenecen a target_instance, es segura (excepción de reuso)
            other_owners = [o for o in owners if o != target_instance]
            if not other_owners:
                return True, "safe_same_instance", None

            # Colisión con otra instancia
            return False, "conflict_other_instance", other_owners[0]

    def record_ip(
        self,
        ip: str,
        instance_name: str,
        usb_id: str,
        carrier: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Registra o actualiza el uso de una IP pública por una instancia.
        """
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        expires_at_iso = self._calc_expires_at(now)

        with self._get_connection() as conn:
            # Comprobar si ya existe un registro de esta IP para esta instancia
            cur = conn.execute(
                """
                SELECT id FROM usb_ip_ledger
                WHERE ip = ? AND instance_name = ?
                """,
                (ip, instance_name),
            )
            row = cur.fetchone()
            if row:
                conn.execute(
                    """
                    UPDATE usb_ip_ledger
                    SET last_seen_at = ?, expires_at = ?, usb_id = ?, carrier = COALESCE(?, carrier)
                    WHERE id = ?
                    """,
                    (now_iso, expires_at_iso, usb_id, carrier, row["id"]),
                )
                record_id = row["id"]
            else:
                cur = conn.execute(
                    """
                    INSERT INTO usb_ip_ledger (
                        ip, instance_name, usb_id, carrier, first_seen_at, last_seen_at, expires_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (ip, instance_name, usb_id, carrier, now_iso, now_iso, expires_at_iso),
                )
                record_id = cur.lastrowid

        return {
            "id": record_id,
            "ip": ip,
            "instance_name": instance_name,
            "usb_id": usb_id,
            "carrier": carrier,
            "last_seen_at": now_iso,
            "expires_at": expires_at_iso,
        }

    def list_entries(self, limit: int = 150, active_only: bool = False) -> List[Dict[str, Any]]:
        """Lista el historial de IPs registradas."""
        now_iso = datetime.now(timezone.utc).isoformat()
        query = "SELECT * FROM usb_ip_ledger"
        params: List[Any] = []
        if active_only:
            query += " WHERE expires_at > ?"
            params.append(now_iso)
        query += " ORDER BY last_seen_at DESC LIMIT ?"
        params.append(limit)

        with self._get_connection() as conn:
            cur = conn.execute(query, params)
            rows = cur.fetchall()
            return [
                {
                    "id": r["id"],
                    "ip": r["ip"],
                    "instance_name": r["instance_name"],
                    "usb_id": r["usb_id"],
                    "carrier": r["carrier"],
                    "first_seen_at": r["first_seen_at"],
                    "last_seen_at": r["last_seen_at"],
                    "expires_at": r["expires_at"],
                    "is_active": r["expires_at"] > now_iso,
                }
                for r in rows
            ]

    def purge_expired(self) -> int:
        """Elimina entradas cuya fecha de expiración haya pasado."""
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            cur = conn.execute(
                "DELETE FROM usb_ip_ledger WHERE expires_at <= ?",
                (now_iso,),
            )
            return cur.rowcount


ip_ledger = IpLedger()
