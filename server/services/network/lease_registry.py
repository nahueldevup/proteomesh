"""
Registro de Leases de IPs de Salida (IpLeaseRegistry).
Garantiza que NUNCA dos instancias activas compartan la misma IP pública de salida.
Implementado sobre SQLite en modo WAL con bloqueos atómicos (BEGIN IMMEDIATE).
"""
import json
import os
import sqlite3
import threading
from pathlib import Path
from typing import Optional, Dict, Any, List, Set

from server.config import INSTANCES_DIR


class IpConflictError(Exception):
    """Excepción lanzada cuando una IP pública ya está tomada por otra instancia activa."""
    def __init__(self, exit_ip: str, owner: str):
        self.exit_ip = exit_ip
        self.owner = owner
        super().__init__(
            f"Conflicto de IP: La IP pública de salida '{exit_ip}' ya está asignada a la instancia activa '{owner}'."
        )


class IpLeaseRegistry:
    """
    Registro atómico de leases de IPs de salida para transportes de red (SOCKS5 y USB-Mobile).
    """

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = Path(db_path) if db_path else (INSTANCES_DIR / "leases.db")
        self._local = threading.local()
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        """Crea o reutiliza una conexión SQLite por hilo configurada con WAL y timeout."""
        conn = sqlite3.connect(
            str(self.db_path),
            timeout=10.0,
            check_same_thread=False
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        conn.execute("PRAGMA busy_timeout = 5000;")
        return conn

    def _init_db(self) -> None:
        """Inicializa las tablas e índices si no existen."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS proxy_leases (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    instance_id TEXT NOT NULL,
                    exit_ip TEXT NOT NULL,
                    transport TEXT NOT NULL,
                    metadata TEXT,
                    acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    released_at TIMESTAMP NULL
                );
            """)
            conn.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_active_exit_ip
                ON proxy_leases(exit_ip) WHERE released_at IS NULL;
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_instance_active
                ON proxy_leases(instance_id) WHERE released_at IS NULL;
            """)
        try:
            os.chmod(self.db_path, 0o600)
        except OSError:
            pass

    def reserve(
        self,
        exit_ip: str,
        instance_id: str,
        transport: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> int:
        """
        Reserva atómicamente una IP de salida para una instancia.
        Si la misma instancia ya tenía esa IP activa, renueva el lease.
        Si otra instancia activa ya posee esa IP, lanza IpConflictError.
        """
        clean_ip = exit_ip.strip()
        clean_inst = instance_id.strip()
        meta_json = json.dumps(metadata or {}, ensure_ascii=False)

        conn = self._connect()
        try:
            # BEGIN IMMEDIATE adquiere el cerrojo de escritura en SQLite inmediatamente
            conn.execute("BEGIN IMMEDIATE;")

            # 1. Verificar si la instancia ya posee actualmente ESTA MISMA IP activa
            cur = conn.execute(
                "SELECT id FROM proxy_leases WHERE exit_ip = ? AND instance_id = ? AND released_at IS NULL;",
                (clean_ip, clean_inst)
            )
            existing = cur.fetchone()
            if existing:
                conn.execute(
                    "UPDATE proxy_leases SET metadata = ?, acquired_at = CURRENT_TIMESTAMP WHERE id = ?;",
                    (meta_json, existing["id"])
                )
                conn.execute("COMMIT;")
                return existing["id"]

            # 2. Liberar cualquier IP previa que tuviera esta misma instancia
            conn.execute(
                "UPDATE proxy_leases SET released_at = CURRENT_TIMESTAMP WHERE instance_id = ? AND released_at IS NULL;",
                (clean_inst,)
            )

            # 3. Intentar insertar el nuevo lease
            try:
                cur = conn.execute(
                    """
                    INSERT INTO proxy_leases (instance_id, exit_ip, transport, metadata, released_at)
                    VALUES (?, ?, ?, ?, NULL);
                    """,
                    (clean_inst, clean_ip, transport, meta_json)
                )
                lease_id = cur.lastrowid
                conn.execute("COMMIT;")
                return lease_id
            except sqlite3.IntegrityError:
                # Violación del índice UNIQUE idx_active_exit_ip
                conn.execute("ROLLBACK;")
                owner = self.owner_of(clean_ip) or "otra_instancia"
                raise IpConflictError(clean_ip, owner)

        except Exception:
            try:
                conn.execute("ROLLBACK;")
            except Exception:
                pass
            raise

    def reconcile(self, running_instances: Set[str]) -> int:
        """
        Libera leases huérfanos de instancias que ya no están corriendo en Docker (FRAG-01).
        Retorna la cantidad de leases liberados.
        """
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE;")
            cur = conn.execute("SELECT DISTINCT instance_id FROM proxy_leases WHERE released_at IS NULL;")
            active_ids = [row["instance_id"] for row in cur.fetchall()]
            released = 0
            for inst in active_ids:
                if inst not in running_instances:
                    cur_up = conn.execute(
                        "UPDATE proxy_leases SET released_at = CURRENT_TIMESTAMP WHERE instance_id = ? AND released_at IS NULL;",
                        (inst,)
                    )
                    released += cur_up.rowcount
            conn.execute("COMMIT;")
            return released

    def release(self, instance_id: str) -> bool:
        """
        Libera cualquier lease activo asociado a la instancia especificada.
        Retorna True si liberó al menos un lease, False si no tenía ninguno activo.
        """
        clean_inst = instance_id.strip()
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE;")
            cur = conn.execute(
                "UPDATE proxy_leases SET released_at = CURRENT_TIMESTAMP WHERE instance_id = ? AND released_at IS NULL;",
                (clean_inst,)
            )
            affected = cur.rowcount
            conn.execute("COMMIT;")
            return affected > 0

    def release_ip(self, exit_ip: str) -> bool:
        """Libera cualquier lease activo para una IP específica."""
        clean_ip = exit_ip.strip()
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE;")
            cur = conn.execute(
                "UPDATE proxy_leases SET released_at = CURRENT_TIMESTAMP WHERE exit_ip = ? AND released_at IS NULL;",
                (clean_ip,)
            )
            affected = cur.rowcount
            conn.execute("COMMIT;")
            return affected > 0

    def owner_of(self, exit_ip: str) -> Optional[str]:
        """Retorna el instance_id que posee activamente la exit_ip, o None si está libre."""
        clean_ip = exit_ip.strip()
        with self._connect() as conn:
            cur = conn.execute(
                "SELECT instance_id FROM proxy_leases WHERE exit_ip = ? AND released_at IS NULL LIMIT 1;",
                (clean_ip,)
            )
            row = cur.fetchone()
            return row["instance_id"] if row else None

    def get_active_lease(self, instance_id: str) -> Optional[Dict[str, Any]]:
        """Retorna el lease activo de una instancia o None."""
        clean_inst = instance_id.strip()
        with self._connect() as conn:
            cur = conn.execute(
                """
                SELECT id, instance_id, exit_ip, transport, metadata, acquired_at
                FROM proxy_leases
                WHERE instance_id = ? AND released_at IS NULL
                ORDER BY id DESC LIMIT 1;
                """,
                (clean_inst,)
            )
            row = cur.fetchone()
            if not row:
                return None
            meta_parsed = {}
            if row["metadata"]:
                try:
                    meta_parsed = json.loads(row["metadata"])
                except Exception:
                    pass
            return {
                "id": row["id"],
                "instance_id": row["instance_id"],
                "exit_ip": row["exit_ip"],
                "transport": row["transport"],
                "metadata": meta_parsed,
                "acquired_at": row["acquired_at"],
            }

    def list_active_leases(self) -> List[Dict[str, Any]]:
        """Retorna la lista de todos los leases actualmente activos."""
        with self._connect() as conn:
            cur = conn.execute(
                """
                SELECT id, instance_id, exit_ip, transport, metadata, acquired_at
                FROM proxy_leases
                WHERE released_at IS NULL
                ORDER BY acquired_at DESC;
                """
            )
            leases = []
            for row in cur.fetchall():
                meta_parsed = {}
                if row["metadata"]:
                    try:
                        meta_parsed = json.loads(row["metadata"])
                    except Exception:
                        pass
                leases.append({
                    "id": row["id"],
                    "instance_id": row["instance_id"],
                    "exit_ip": row["exit_ip"],
                    "transport": row["transport"],
                    "metadata": meta_parsed,
                    "acquired_at": row["acquired_at"],
                })
            return leases

    def clear_all(self) -> int:
        """Libera todos los leases activos."""
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE;")
            cur = conn.execute(
                "UPDATE proxy_leases SET released_at = CURRENT_TIMESTAMP WHERE released_at IS NULL;"
            )
            count = cur.rowcount
            conn.execute("COMMIT;")
            return count


# Instancia singleton del registro de leases para uso general
lease_registry = IpLeaseRegistry()
