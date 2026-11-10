"""
Sistema de migraciones y bootstraping de datos iniciales en SQLite para ProteoMesh.
"""
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from server.config import CUSTOM_LOCATIONS_FILE
from server.db.connection import get_connection, transaction

logger = logging.getLogger("proteomesh.db")

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"

DEFAULT_SYSTEM_LOCATION = {
    "id": "ba",
    "target_type": "preset",
    "name": "Buenos Aires",
    "city": "Buenos Aires, Argentina (Obelisco)",
    "latitude": -34.603722,
    "longitude": -58.381592,
    "altitude": 25.0,
    "accuracy": 4.2,
    "timezone": "America/Argentina/Buenos_Aires",
}


def ensure_version_table(conn) -> None:
    """Asegura la existencia de la tabla interna de seguimiento de migraciones."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS _schema_version (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL,
            description TEXT NOT NULL
        )
        """
    )


def get_applied_versions(conn) -> set:
    """Devuelve el conjunto de versiones de migración ya aplicadas."""
    ensure_version_table(conn)
    cur = conn.execute("SELECT version FROM _schema_version")
    return {row[0] for row in cur.fetchall()}


def run_migrations(db_path: Optional[Path] = None) -> List[int]:
    """
    Ejecuta todas las migraciones SQL pendientes en orden numérico estricto.
    Retorna la lista de versiones recién aplicadas.
    """
    applied_now: List[int] = []
    if not MIGRATIONS_DIR.exists():
        logger.warning(f"Directorio de migraciones no encontrado: {MIGRATIONS_DIR}")
        return applied_now

    sql_files = sorted(MIGRATIONS_DIR.glob("*.sql"))

    with transaction(db_path=db_path) as conn:
        applied_versions = get_applied_versions(conn)

        for file_path in sql_files:
            match = re.match(r"^(\d+)_(.+)\.sql$", file_path.name)
            if not match:
                continue

            version = int(match.group(1))
            description = match.group(2).replace("_", " ")

            if version in applied_versions:
                continue

            logger.info(f"[DB Migration] Aplicando migración {version:03d}: {description}...")
            sql_content = file_path.read_text(encoding="utf-8")
            conn.executescript(sql_content)

            now_iso = datetime.now(timezone.utc).isoformat()
            conn.execute(
                "INSERT INTO _schema_version (version, applied_at, description) VALUES (?, ?, ?)",
                (version, now_iso, description),
            )
            applied_now.append(version)

    return applied_now


def migrate_legacy_json_locations(
    db_path: Optional[Path] = None,
    json_path: Optional[Path] = None,
) -> bool:
    """
    Migra datos desde custom_locations.json a SQLite si las tablas están vacías.
    Si no existe custom_locations.json, inserta la estructura inicial por defecto.
    """
    target_json = Path(json_path or CUSTOM_LOCATIONS_FILE)

    with transaction(db_path=db_path) as conn:
        # Verificar si ya existen grupos o ubicaciones
        cur = conn.execute("SELECT COUNT(*) FROM locations")
        loc_count = cur.fetchone()[0]
        cur = conn.execute("SELECT COUNT(*) FROM location_groups")
        grp_count = cur.fetchone()[0]

        if loc_count > 0 or grp_count > 0:
            return False  # Ya tiene datos, no sobreescribir

        now_iso = datetime.now(timezone.utc).isoformat()

        # Caso 1: Existe archivo JSON previo
        if target_json.exists():
            try:
                content = target_json.read_text(encoding="utf-8").strip()
                data = json.loads(content) if content else {}
            except Exception as e:
                logger.warning(f"Error leyendo {target_json} para migración: {e}. Usando defaults.")
                data = {}
        else:
            data = {}

        groups = data.get("groups") or [
            {
                "id": "grp_general",
                "name": "General",
                "color": "#10b981",
                "description": "Ubicaciones generales y puntos clave",
                "created_at": now_iso,
            }
        ]

        locations = data.get("locations") or [
            {
                "id": "loc_palermo",
                "name": "Sede Palermo",
                "group_id": "grp_general",
                "city": "Palermo, Buenos Aires",
                "latitude": -34.5889,
                "longitude": -58.4305,
                "altitude": 25.0,
                "accuracy": 4.2,
                "timezone": "America/Argentina/Buenos_Aires",
                "is_pinned": True,
                "radius_km": 1.0,
                "show_radius": True,
                "created_at": now_iso,
            }
        ]

        pinned_presets = data.get("pinned_presets") or ["ba", "sao-paulo", "miami", "new-york"]
        default_location = data.get("default_location") or dict(DEFAULT_SYSTEM_LOCATION)

        # 1. Insertar grupos
        for g in groups:
            conn.execute(
                """
                INSERT OR IGNORE INTO location_groups (id, name, color, description, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    g["id"],
                    g.get("name", "Grupo").strip(),
                    g.get("color", "#10b981"),
                    g.get("description", ""),
                    g.get("created_at", now_iso),
                ),
            )

        # 2. Insertar ubicaciones
        for loc in locations:
            conn.execute(
                """
                INSERT OR IGNORE INTO locations (
                    id, name, group_id, city, latitude, longitude,
                    altitude, accuracy, timezone, is_pinned, radius_km, show_radius, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    loc["id"],
                    loc["name"],
                    loc.get("group_id"),
                    loc.get("city", ""),
                    float(loc["latitude"]),
                    float(loc["longitude"]),
                    float(loc.get("altitude", 25.0)),
                    float(loc.get("accuracy", 4.2)),
                    loc.get("timezone", "America/Argentina/Buenos_Aires"),
                    1 if loc.get("is_pinned") else 0,
                    float(loc.get("radius_km", 1.0)),
                    1 if loc.get("show_radius", True) else 0,
                    loc.get("created_at", now_iso),
                ),
            )

        # 3. Insertar configuración global
        conn.execute(
            "INSERT OR REPLACE INTO location_config (key, value_json) VALUES (?, ?)",
            ("pinned_presets", json.dumps(pinned_presets)),
        )
        conn.execute(
            "INSERT OR REPLACE INTO location_config (key, value_json) VALUES (?, ?)",
            ("default_location", json.dumps(default_location)),
        )

        logger.info(
            f"[DB Bootstrap] Migradas {len(locations)} ubicaciones y {len(groups)} grupos a SQLite."
        )
        return True


def init_db(db_path: Optional[Path] = None) -> None:
    """Inicializa completamente la base de datos: migraciones + bootstrap."""
    run_migrations(db_path)
    migrate_legacy_json_locations(db_path)
    try:
        from server.db.instance_store import InstanceStore
        store = InstanceStore(db_path=db_path)
        store.sync_from_disk()
    except Exception as e:
        logger.warning(f"Error sincronizando instancias de disco a SQLite: {e}")
