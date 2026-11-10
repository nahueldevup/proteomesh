"""
Catálogo de rutas de salida (SOCKS5 y futuras USB-Mobile).
Persistencia SQLite en instances/routes.db. Las contraseñas nunca se
devuelven por API: solo se exponen enmascaradas.
"""
import json
import os
import sqlite3
from pathlib import Path
from typing import Optional, Dict, Any, List

from server.config import INSTANCES_DIR, PROTEOMESH_DB_PATH


def _connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path), timeout=10.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA busy_timeout = 5000;")
    return conn


class RouteStore:
    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = Path(db_path) if db_path else PROTEOMESH_DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
        try:
            os.chmod(self.db_path, 0o600)
        except OSError:
            pass

    def _init_db(self) -> None:
        with _connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS routes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    label TEXT NOT NULL UNIQUE,
                    type TEXT NOT NULL DEFAULT 'socks5',
                    host TEXT,
                    port INTEGER,
                    username TEXT,
                    password TEXT,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

    def list_routes(self) -> List[Dict[str, Any]]:
        with _connect(self.db_path) as conn:
            rows = conn.execute(
                "SELECT id, label, type, host, port, username, enabled, created_at FROM routes ORDER BY id;"
            ).fetchall()
        return [dict(r) for r in rows]

    def get(self, route_id: int) -> Optional[Dict[str, Any]]:
        with _connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT id, label, type, host, port, username, password, enabled, created_at "
                "FROM routes WHERE id = ?;",
                (route_id,),
            ).fetchone()
        return dict(row) if row else None

    def get_by_label(self, label: str) -> Optional[Dict[str, Any]]:
        with _connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT id, label, type, host, port, username, password, enabled, created_at "
                "FROM routes WHERE label = ?;",
                (label,),
            ).fetchone()
        return dict(row) if row else None

    def create(
        self,
        label: str,
        host: str,
        port: int,
        username: Optional[str] = None,
        password: Optional[str] = None,
        route_type: str = "socks5",
    ) -> Dict[str, Any]:
        with _connect(self.db_path) as conn:
            cur = conn.execute(
                "INSERT INTO routes (label, type, host, port, username, password) VALUES (?, ?, ?, ?, ?, ?);",
                (label.strip(), route_type, host.strip(), int(port), username, password),
            )
            route_id = cur.lastrowid
            conn.commit()
        return self.masked(route_id)

    def delete(self, route_id: int) -> bool:
        with _connect(self.db_path) as conn:
            cur = conn.execute("DELETE FROM routes WHERE id = ?;", (route_id,))
            conn.commit()
            return cur.rowcount > 0

    def set_enabled(self, route_id: int, enabled: bool) -> bool:
        with _connect(self.db_path) as conn:
            cur = conn.execute("UPDATE routes SET enabled = ? WHERE id = ?;", (1 if enabled else 0, route_id))
            conn.commit()
            return cur.rowcount > 0

    def masked(self, route_id: int) -> Optional[Dict[str, Any]]:
        route = self.get(route_id)
        if not route:
            return None
        return {
            "id": route["id"],
            "label": route["label"],
            "type": route["type"],
            "host": route["host"],
            "port": route["port"],
            "username": route["username"],
            "auth": bool(route.get("password")),
            "enabled": bool(route["enabled"]),
            "created_at": route.get("created_at"),
        }

    def to_uri(self, route: Dict[str, Any]) -> str:
        """Reconstruye la URI SOCKS5 con credenciales para uso interno."""
        route_type = (route.get("type") or "socks5").lower()
        if route_type == "usb_mobile":
            raise ValueError("Las rutas USB-Mobile no usan URI SOCKS5.")
        auth = ""
        if route.get("username") and route.get("password"):
            auth = f"{route['username']}:{route['password']}@"
        return f"socks5://{auth}{route['host']}:{route['port']}"


route_store = RouteStore()
