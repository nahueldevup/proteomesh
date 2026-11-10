"""
Almacén unificado en SQLite para asignaciones USB tethering de ProteoMesh.
Maneja el ciclo de vida de enganche de módems físicos a contenedores
y proyecta usb_tether.json en disco para compatibilidad con scripts shell.
"""
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from server.config import INSTANCES_DIR
from server.db.connection import get_connection, transaction

logger = logging.getLogger("proteomesh.db.usb_store")


def _row_to_assignment(row) -> Dict[str, Any]:
    """Convierte una fila de SQLite al formato de asignación compatible con usb_tether.json."""
    if not row:
        return {}
    return {
        "instance": row["instance_name"],
        "iface": row["iface"],
        "serial": row["serial"],
        "model": row["model"],
        "carrier": row["carrier"],
        "gateway": row["gateway"],
        "subnet": row["subnet"],
        "container_ip": row["container_ip"],
        "public_ip": row["public_ip"],
        "attached_at": row["attached_at"],
    }


class UsbStore:
    def __init__(self, db_path: Optional[Path] = None, instances_dir: Optional[Path] = None):
        self.db_path = db_path
        self.instances_dir = Path(instances_dir or INSTANCES_DIR)

    def _sync_disk_file_atomic(self, file_path: Path, data: Dict[str, Any]) -> None:
        """Escribe un archivo JSON atómico con .tmp + os.replace."""
        file_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = file_path.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, file_path)

    def get(self, instance_name: str) -> Optional[Dict[str, Any]]:
        """Obtiene la asignación USB de una instancia desde SQLite o disco."""
        with get_connection(self.db_path, read_only=False) as conn:
            cur = conn.execute("SELECT * FROM usb_assignments WHERE instance_name = ?", (instance_name,))
            row = cur.fetchone()
            if row:
                return _row_to_assignment(row)

        # Fallback a disco si existía previamente
        disk_path = self.instances_dir / instance_name / "usb_tether.json"
        if disk_path.exists():
            try:
                data = json.loads(disk_path.read_text(encoding="utf-8"))
                self.save(instance_name, data, sync_to_disk=False)
                return self.get(instance_name)
            except Exception:
                pass

        return None

    def list_all(self) -> List[Dict[str, Any]]:
        """Lista todas las asignaciones USB registradas."""
        self.sync_from_disk()
        with get_connection(self.db_path, read_only=False) as conn:
            cur = conn.execute("SELECT * FROM usb_assignments ORDER BY instance_name ASC")
            return [_row_to_assignment(r) for r in cur.fetchall()]

    def get_by_iface(self, iface: str) -> Optional[Dict[str, Any]]:
        """Busca qué instancia tiene asignada una interfaz USB determinada."""
        with get_connection(self.db_path, read_only=False) as conn:
            cur = conn.execute("SELECT * FROM usb_assignments WHERE iface = ? LIMIT 1", (iface,))
            row = cur.fetchone()
            return _row_to_assignment(row) if row else None

    def save(
        self,
        instance_name: str,
        data: Dict[str, Any],
        sync_to_disk: bool = True,
    ) -> None:
        """
        Inserta o actualiza una asignación USB en SQLite y proyecta usb_tether.json.
        """
        now = datetime.now(timezone.utc).isoformat()
        iface = data.get("iface", "")
        serial = data.get("serial", "")
        model = data.get("model")
        carrier = data.get("carrier")
        gateway = data.get("gateway")
        subnet = data.get("subnet")
        container_ip = data.get("container_ip")
        public_ip = data.get("public_ip")
        attached_at = data.get("attached_at") or now

        with transaction(db_path=self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO usb_assignments (
                    instance_name, iface, serial, model, carrier,
                    gateway, subnet, container_ip, public_ip, attached_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(instance_name) DO UPDATE SET
                    iface = excluded.iface,
                    serial = excluded.serial,
                    model = excluded.model,
                    carrier = excluded.carrier,
                    gateway = excluded.gateway,
                    subnet = excluded.subnet,
                    container_ip = excluded.container_ip,
                    public_ip = excluded.public_ip,
                    attached_at = excluded.attached_at,
                    updated_at = excluded.updated_at
                """,
                (
                    instance_name,
                    iface,
                    serial,
                    model,
                    carrier,
                    gateway,
                    subnet,
                    container_ip,
                    public_ip,
                    attached_at,
                    now,
                ),
            )

        if sync_to_disk:
            state_file = self.instances_dir / instance_name / "usb_tether.json"
            self._sync_disk_file_atomic(state_file, data)

    def remove(self, instance_name: str, sync_to_disk: bool = True) -> bool:
        """
        Elimina la asignación USB de SQLite y remueve usb_tether.json en disco.
        """
        with transaction(db_path=self.db_path) as conn:
            cur = conn.execute("DELETE FROM usb_assignments WHERE instance_name = ?", (instance_name,))
            deleted = cur.rowcount > 0

        if sync_to_disk:
            state_file = self.instances_dir / instance_name / "usb_tether.json"
            if state_file.exists():
                try:
                    state_file.unlink()
                except OSError:
                    pass

        return deleted

    def sync_from_disk(self) -> int:
        """
        Sincroniza bidireccionalmente usb_tether.json de disco con la base SQLite.
        """
        if not self.instances_dir.exists():
            return 0

        synced = 0
        disk_files = {
            f.parent.name: f
            for f in self.instances_dir.glob("*/usb_tether.json")
        }

        with transaction(db_path=self.db_path) as conn:
            cur = conn.execute("SELECT instance_name FROM usb_assignments")
            registered = {r[0] for r in cur.fetchall()}

            # 1. Purgar huérfanos que ya no están en disco
            for name in registered:
                if name not in disk_files:
                    conn.execute("DELETE FROM usb_assignments WHERE instance_name = ?", (name,))

        # 2. Registrar los que están en disco
        for name, file_path in disk_files.items():
            if name not in registered:
                try:
                    data = json.loads(file_path.read_text(encoding="utf-8"))
                    self.save(name, data, sync_to_disk=False)
                    synced += 1
                except Exception as e:
                    logger.warning(f"Error sincronizando usb_tether para '{name}': {e}")

        return synced


# Instancia singleton predeterminada
usb_store = UsbStore()
