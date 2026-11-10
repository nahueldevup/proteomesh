"""
Almacén unificado en SQLite para instancias y perfiles de ProteoMesh.
Garantiza transaccionalidad ACID en el backend y proyecta atómicamente
los archivos meta.json y profile.json a disco para Docker y herramientas CLI.
"""
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from server.config import INSTANCES_DIR
from server.db.connection import get_connection, transaction

logger = logging.getLogger("proteomesh.db.instance_store")


def _row_to_meta(row) -> Dict[str, Any]:
    """Reconstruye el diccionario idéntico a meta.json a partir de una fila SQLite."""
    if not row:
        return {}
    keys = row.keys()

    meta: Dict[str, Any] = {
        "instance_name": row["name"],
        "template": row["template"],
        "carrier": row["carrier"],
        "adb_port": int(row["adb_port"]),
        "default_apks_provisioned": bool(row["default_apks_provisioned"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }

    # Deserializar ubicación
    if row["latitude"] is not None and row["longitude"] is not None:
        meta["location"] = {
            "city": row["city"] or "Ubicación configurada",
            "latitude": float(row["latitude"]),
            "longitude": float(row["longitude"]),
            "altitude": float(row["altitude"] if row["altitude"] is not None else 25.0),
            "accuracy": float(row["accuracy"] if row["accuracy"] is not None else 4.2),
            "timezone": row["timezone"] or "America/Argentina/Buenos_Aires",
        }
        if row["custom_location_id"]:
            meta["location"]["custom_location_id"] = row["custom_location_id"]
        if row["custom_name"]:
            meta["location"]["custom_name"] = row["custom_name"]
        if row["group_name"]:
            meta["location"]["group_name"] = row["group_name"]
    else:
        meta["location"] = None

    # Deserializar componentes JSON opcionales
    for col, field in [
        ("proxy_json", "proxy"),
        ("network_state_json", "network"),
        ("display_json", "display"),
        ("identity_json", "identity"),
        ("limits_json", "limits"),
    ]:
        if col in keys and row[col]:
            try:
                meta[field] = json.loads(row[col])
            except Exception:
                meta[field] = None
        else:
            meta[field] = None

    return meta


class InstanceStore:
    def __init__(self, db_path: Optional[Path] = None, instances_dir: Optional[Path] = None):
        self.db_path = db_path
        self.instances_dir = Path(instances_dir or INSTANCES_DIR)

    def _sync_disk_file_atomic(self, file_path: Path, data: Dict[str, Any]) -> None:
        """Escribe un archivo JSON en disco de forma atómica usando un archivo temporal y os.replace."""
        file_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = file_path.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, file_path)

    def get(self, name: str) -> Optional[Dict[str, Any]]:
        """Obtiene la configuración de una instancia (revisando SQLite y migrando desde disco si es necesario)."""
        with get_connection(self.db_path, read_only=False) as conn:
            cur = conn.execute("SELECT * FROM instances WHERE name = ?", (name,))
            row = cur.fetchone()
            if row:
                return _row_to_meta(row)

        # Si no está en SQLite, verificar si existe en disco e importarla
        meta_disk_path = self.instances_dir / name / "meta.json"
        if meta_disk_path.exists():
            try:
                with open(meta_disk_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                profile = None
                prof_disk_path = self.instances_dir / name / "profile.json"
                if prof_disk_path.exists():
                    with open(prof_disk_path, "r", encoding="utf-8") as pf:
                        profile = json.load(pf)
                self.save_instance(name, meta, profile)
                return self.get(name)
            except Exception as e:
                logger.warning(f"Error importando instancia '{name}' desde disco: {e}")

        return None

    def get_profile(self, name: str) -> Optional[Dict[str, Any]]:
        """Obtiene el profile.json de la instancia desde SQLite o disco."""
        with get_connection(self.db_path, read_only=False) as conn:
            cur = conn.execute("SELECT profile_json FROM instance_profiles WHERE instance_name = ?", (name,))
            row = cur.fetchone()
            if row and row[0]:
                try:
                    return json.loads(row[0])
                except Exception:
                    pass

        prof_disk_path = self.instances_dir / name / "profile.json"
        if prof_disk_path.exists():
            try:
                with open(prof_disk_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return None

    def list_all(self) -> List[Dict[str, Any]]:
        """Lista todas las instancias conocidas, auto-descubriendo las que estén en disco."""
        self.sync_from_disk()
        with get_connection(self.db_path, read_only=False) as conn:
            cur = conn.execute("SELECT * FROM instances ORDER BY name ASC")
            return [_row_to_meta(r) for r in cur.fetchall()]

    def save_instance(
        self,
        name: str,
        meta: Dict[str, Any],
        profile: Optional[Dict[str, Any]] = None,
        sync_to_disk: bool = True,
    ) -> None:
        """
        Inserta o actualiza una instancia y su perfil en SQLite dentro de una sola transacción.
        Si sync_to_disk es True, proyecta los cambios a meta.json y profile.json en disco.
        """
        now = datetime.now(timezone.utc).isoformat()
        loc = meta.get("location") or {}

        lat = float(loc["latitude"]) if "latitude" in loc and loc["latitude"] is not None else None
        lon = float(loc["longitude"]) if "longitude" in loc and loc["longitude"] is not None else None
        city = loc.get("city")
        altitude = float(loc.get("altitude", 25.0)) if lat is not None else 25.0
        accuracy = float(loc.get("accuracy", 4.2)) if lat is not None else 4.2
        tz = loc.get("timezone", "America/Argentina/Buenos_Aires")
        custom_loc_id = loc.get("custom_location_id")
        custom_name = loc.get("custom_name")
        group_name = loc.get("group_name")

        proxy_json = json.dumps(meta["proxy"]) if meta.get("proxy") else None
        network_json = json.dumps(meta["network"]) if meta.get("network") else None
        display_json = json.dumps(meta["display"]) if meta.get("display") else None
        identity_json = json.dumps(meta["identity"]) if meta.get("identity") else None
        limits_json = json.dumps(meta["limits"]) if meta.get("limits") else None
        provisioned = 1 if meta.get("default_apks_provisioned") else 0
        adb_port = int(meta.get("adb_port", 5555))
        template = meta.get("template")
        carrier = meta.get("carrier")
        created_at = meta.get("created_at") or now

        with transaction(db_path=self.db_path) as conn:
            if custom_loc_id:
                cur_loc = conn.execute("SELECT 1 FROM locations WHERE id = ?", (custom_loc_id,))
                if not cur_loc.fetchone():
                    custom_loc_id = None

            conn.execute(
                """
                INSERT INTO instances (
                    name, template, carrier, adb_port,
                    city, latitude, longitude, altitude, accuracy, timezone,
                    custom_location_id, custom_name, group_name,
                    proxy_json, network_state_json, display_json, identity_json, limits_json,
                    default_apks_provisioned, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(name) DO UPDATE SET
                    template = excluded.template,
                    carrier = excluded.carrier,
                    adb_port = excluded.adb_port,
                    city = excluded.city,
                    latitude = excluded.latitude,
                    longitude = excluded.longitude,
                    altitude = excluded.altitude,
                    accuracy = excluded.accuracy,
                    timezone = excluded.timezone,
                    custom_location_id = excluded.custom_location_id,
                    custom_name = excluded.custom_name,
                    group_name = excluded.group_name,
                    proxy_json = excluded.proxy_json,
                    network_state_json = excluded.network_state_json,
                    display_json = excluded.display_json,
                    identity_json = excluded.identity_json,
                    limits_json = excluded.limits_json,
                    default_apks_provisioned = excluded.default_apks_provisioned,
                    updated_at = excluded.updated_at
                """,
                (
                    name,
                    template,
                    carrier,
                    adb_port,
                    city,
                    lat,
                    lon,
                    altitude,
                    accuracy,
                    tz,
                    custom_loc_id,
                    custom_name,
                    group_name,
                    proxy_json,
                    network_json,
                    display_json,
                    identity_json,
                    limits_json,
                    provisioned,
                    created_at,
                    now,
                ),
            )

            if profile:
                conn.execute(
                    """
                    INSERT INTO instance_profiles (instance_name, profile_json, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(instance_name) DO UPDATE SET
                        profile_json = excluded.profile_json,
                        updated_at = excluded.updated_at
                    """,
                    (name, json.dumps(profile), now),
                )

        # Proyección atómica en disco
        if sync_to_disk:
            inst_dir = self.instances_dir / name
            self._sync_disk_file_atomic(inst_dir / "meta.json", meta)
            if profile:
                self._sync_disk_file_atomic(inst_dir / "profile.json", profile)

    def mutate_meta(
        self,
        name: str,
        mutator_fn: Callable[[Dict[str, Any]], None],
        sync_to_disk: bool = True,
    ) -> Dict[str, Any]:
        """
        Modifica meta bajo transacción SQLite BEGIN IMMEDIATE exclusiva.
        Garantiza prevención de carreras TOCTOU sin necesidad de archivos .lock.
        """
        # Asegurar que esté sincronizada si fue creada en disco recientemente
        if not self.get(name):
            raise FileNotFoundError(f"Instancia '{name}' no encontrada")

        with transaction(db_path=self.db_path) as conn:
            cur = conn.execute("SELECT * FROM instances WHERE name = ?", (name,))
            row = cur.fetchone()
            if not row:
                raise FileNotFoundError(f"Instancia '{name}' no encontrada en SQLite")

            meta = _row_to_meta(row)
            mutator_fn(meta)

            now = datetime.now(timezone.utc).isoformat()
            loc = meta.get("location") or {}
            lat = float(loc["latitude"]) if "latitude" in loc and loc["latitude"] is not None else None
            lon = float(loc["longitude"]) if "longitude" in loc and loc["longitude"] is not None else None
            city = loc.get("city")
            altitude = float(loc.get("altitude", 25.0)) if lat is not None else 25.0
            accuracy = float(loc.get("accuracy", 4.2)) if lat is not None else 4.2
            tz = loc.get("timezone", "America/Argentina/Buenos_Aires")
            custom_loc_id = loc.get("custom_location_id")
            custom_name = loc.get("custom_name")
            group_name = loc.get("group_name")

            proxy_json = json.dumps(meta["proxy"]) if meta.get("proxy") else None
            network_json = json.dumps(meta["network"]) if meta.get("network") else None
            display_json = json.dumps(meta["display"]) if meta.get("display") else None
            identity_json = json.dumps(meta["identity"]) if meta.get("identity") else None
            limits_json = json.dumps(meta["limits"]) if meta.get("limits") else None
            provisioned = 1 if meta.get("default_apks_provisioned") else 0

            if custom_loc_id:
                cur_loc = conn.execute("SELECT 1 FROM locations WHERE id = ?", (custom_loc_id,))
                if not cur_loc.fetchone():
                    custom_loc_id = None

            conn.execute(
                """
                UPDATE instances SET
                    city = ?, latitude = ?, longitude = ?, altitude = ?, accuracy = ?, timezone = ?,
                    custom_location_id = ?, custom_name = ?, group_name = ?,
                    proxy_json = ?, network_state_json = ?, display_json = ?, identity_json = ?, limits_json = ?,
                    default_apks_provisioned = ?, updated_at = ?
                WHERE name = ?
                """,
                (
                    city,
                    lat,
                    lon,
                    altitude,
                    accuracy,
                    tz,
                    custom_loc_id,
                    custom_name,
                    group_name,
                    proxy_json,
                    network_json,
                    display_json,
                    identity_json,
                    limits_json,
                    provisioned,
                    now,
                    name,
                ),
            )

        if sync_to_disk:
            inst_dir = self.instances_dir / name
            self._sync_disk_file_atomic(inst_dir / "meta.json", meta)

        return meta

    def set_instance_location(
        self,
        name: str,
        loc: Dict[str, Any],
        profile_data: Optional[Dict[str, Any]] = None,
        sync_to_disk: bool = True,
    ) -> Dict[str, Any]:
        """Actualiza la geolocalización de una instancia en SQLite y sincroniza disco."""
        def _update(meta: Dict[str, Any]) -> None:
            meta["location"] = loc

        updated_meta = self.mutate_meta(name, _update, sync_to_disk=sync_to_disk)

        if profile_data is not None:
            now = datetime.now(timezone.utc).isoformat()
            profile_data["location"] = loc
            with transaction(db_path=self.db_path) as conn:
                conn.execute(
                    """
                    INSERT INTO instance_profiles (instance_name, profile_json, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(instance_name) DO UPDATE SET
                        profile_json = excluded.profile_json,
                        updated_at = excluded.updated_at
                    """,
                    (name, json.dumps(profile_data), now),
                )
            if sync_to_disk:
                prof_path = self.instances_dir / name / "profile.json"
                self._sync_disk_file_atomic(prof_path, profile_data)

        return updated_meta

    def is_apks_provisioned(self, name: str) -> bool:
        """Verifica de forma atómica si la instancia ya fue aprovisionada con sus APKs iniciales."""
        with get_connection(self.db_path, read_only=False) as conn:
            cur = conn.execute("SELECT default_apks_provisioned FROM instances WHERE name = ?", (name,))
            row = cur.fetchone()
            if row is not None:
                return bool(row[0])

        inst = self.get(name)
        return bool(inst.get("default_apks_provisioned", False)) if inst else False

    def set_apks_provisioned(self, name: str) -> None:
        """Marca en SQLite y meta.json que la instancia ya fue aprovisionada."""
        def _set_flag(meta: Dict[str, Any]) -> None:
            meta["default_apks_provisioned"] = True

        try:
            self.mutate_meta(name, _set_flag)
        except Exception as e:
            logger.warning(f"Error marcando default_apks_provisioned para {name}: {e}")

    def delete(self, name: str, delete_disk: bool = False) -> bool:
        """Elimina una instancia de SQLite (cascada sobre instance_profiles)."""
        with transaction(db_path=self.db_path) as conn:
            cur = conn.execute("DELETE FROM instances WHERE name = ?", (name,))
            deleted = cur.rowcount > 0

        if delete_disk:
            inst_dir = self.instances_dir / name
            if inst_dir.exists():
                import shutil
                shutil.rmtree(inst_dir, ignore_errors=True)

        return deleted

    def sync_from_disk(self) -> int:
        """
        Sincroniza bidireccionalmente el directorio instances/ y SQLite:
        - Purga de SQLite cualquier instancia cuya carpeta meta.json ya no exista en disco.
        - Importa a SQLite cualquier instancia en disco que no esté registrada aún.
        """
        if not self.instances_dir.exists():
            return 0

        synced = 0
        disk_dirs = {
            d.name: d
            for d in self.instances_dir.iterdir()
            if d.is_dir() and (d / "meta.json").exists()
        }

        with transaction(db_path=self.db_path) as conn:
            cur = conn.execute("SELECT name FROM instances")
            registered = {r[0] for r in cur.fetchall()}

            # 1. Purgar de SQLite las instancias eliminadas del sistema de archivos
            for name in registered:
                if name not in disk_dirs:
                    conn.execute("DELETE FROM instances WHERE name = ?", (name,))

        # 2. Registrar en SQLite las instancias que están en disco pero no en la BD
        for name, inst_dir in disk_dirs.items():
            if name not in registered:
                try:
                    with open(inst_dir / "meta.json", "r", encoding="utf-8") as f:
                        meta = json.load(f)
                    prof_path = inst_dir / "profile.json"
                    profile = None
                    if prof_path.exists():
                        with open(prof_path, "r", encoding="utf-8") as pf:
                            profile = json.load(pf)
                    self.save_instance(name, meta, profile, sync_to_disk=False)
                    synced += 1
                except Exception as e:
                    logger.warning(f"Error sincronizando '{name}' a SQLite: {e}")

        return synced


# Instancia singleton predeterminada
instance_store = InstanceStore()
