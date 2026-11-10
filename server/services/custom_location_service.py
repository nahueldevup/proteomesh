"""
Servicio de persistencia y gestión de ubicaciones custom y grupos de geolocalización.
Utiliza base de datos SQLite unificada con WAL mode y transacciones seguras.
"""
import json
import logging
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from server.config import TOOLS_DIR
from server.db.connection import get_connection, transaction
from server.db.migrate import DEFAULT_SYSTEM_LOCATION, init_db

logger = logging.getLogger("proteomesh.locations")


def _row_to_location(row) -> Dict[str, Any]:
    """Convierte una fila de SQLite a un diccionario de ubicación con tipos nativos."""
    if not row:
        return {}
    keys = row.keys()
    return {
        "id": row["id"],
        "name": row["name"],
        "group_id": row["group_id"],
        "city": row["city"],
        "latitude": float(row["latitude"]),
        "longitude": float(row["longitude"]),
        "altitude": float(row["altitude"]),
        "accuracy": float(row["accuracy"]),
        "timezone": row["timezone"],
        "is_pinned": bool(row["is_pinned"]),
        "radius_km": float(row["radius_km"]) if "radius_km" in keys and row["radius_km"] is not None else 1.0,
        "show_radius": bool(row["show_radius"]) if "show_radius" in keys and row["show_radius"] is not None else True,
        "created_at": row["created_at"],
    }


def _row_to_group(row) -> Dict[str, Any]:
    """Convierte una fila de SQLite a un diccionario de grupo de geolocalización."""
    if not row:
        return {}
    return {
        "id": row["id"],
        "name": row["name"],
        "color": row["color"],
        "description": row["description"] or "",
        "created_at": row["created_at"],
    }


class CustomLocationService:
    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path
        # Asegurar migraciones y bootstrap de datos legacy
        try:
            init_db(self.db_path)
        except Exception as e:
            logger.warning(f"Advertencia inicializando base de datos para CustomLocationService: {e}")

    def _get_presets_dict(self) -> Dict[str, Dict[str, Any]]:
        """Obtiene el mapa de presets oficiales de instance_manager."""
        try:
            if str(TOOLS_DIR) not in sys.path:
                sys.path.insert(0, str(TOOLS_DIR))
            from instance_manager import LOCATION_PRESETS
            return dict(LOCATION_PRESETS)
        except Exception:
            return {
                "ba": dict(DEFAULT_SYSTEM_LOCATION)
            }

    # ── Catálogo Completo ───────────────────────────────────────────────────

    def get_catalog(self) -> Dict[str, Any]:
        """Retorna el catálogo completo (grupos, ubicaciones, presets fijados y predeterminada)."""
        with get_connection(self.db_path, read_only=False) as conn:
            # 1. Grupos
            cur = conn.execute("SELECT * FROM location_groups ORDER BY name ASC")
            groups = [_row_to_group(r) for r in cur.fetchall()]

            # 2. Ubicaciones
            cur = conn.execute("SELECT * FROM locations ORDER BY created_at DESC")
            locations = [_row_to_location(r) for r in cur.fetchall()]

            # 3. Presets fijados
            cur = conn.execute("SELECT value_json FROM location_config WHERE key = 'pinned_presets'")
            row_presets = cur.fetchone()
            pinned_presets = json.loads(row_presets[0]) if row_presets else ["ba", "sao-paulo", "miami", "new-york"]

            # 4. Ubicación predeterminada
            cur = conn.execute("SELECT value_json FROM location_config WHERE key = 'default_location'")
            row_def = cur.fetchone()
            def_loc = json.loads(row_def[0]) if row_def else dict(DEFAULT_SYSTEM_LOCATION)

            # Sincronizar default_location con los datos vivos de la ubicación custom si corresponde
            if def_loc and (def_loc.get("target_type") == "custom" or str(def_loc.get("id", "")).startswith("loc_")):
                loc_id = def_loc.get("id")
                matching = next((l for l in locations if l["id"] == loc_id), None)
                if matching:
                    def_loc = {
                        "id": matching["id"],
                        "target_type": "custom",
                        "name": matching["name"],
                        "city": matching["city"],
                        "latitude": matching["latitude"],
                        "longitude": matching["longitude"],
                        "altitude": matching["altitude"],
                        "accuracy": matching["accuracy"],
                        "timezone": matching["timezone"],
                    }

            return {
                "groups": groups,
                "locations": locations,
                "pinned_presets": pinned_presets,
                "default_location": def_loc,
            }

    def get_default_location(self) -> Dict[str, Any]:
        """Retorna la ubicación general por defecto del sistema."""
        with get_connection(self.db_path, read_only=False) as conn:
            cur = conn.execute("SELECT value_json FROM location_config WHERE key = 'default_location'")
            row = cur.fetchone()
            def_loc = json.loads(row[0]) if row else dict(DEFAULT_SYSTEM_LOCATION)

            if def_loc.get("target_type") == "custom" or str(def_loc.get("id", "")).startswith("loc_"):
                loc_id = def_loc.get("id")
                cur = conn.execute("SELECT * FROM locations WHERE id = ?", (loc_id,))
                loc_row = cur.fetchone()
                if loc_row:
                    loc = _row_to_location(loc_row)
                    return {
                        "id": loc["id"],
                        "target_type": "custom",
                        "name": loc["name"],
                        "city": loc["city"],
                        "latitude": loc["latitude"],
                        "longitude": loc["longitude"],
                        "altitude": loc["altitude"],
                        "accuracy": loc["accuracy"],
                        "timezone": loc["timezone"],
                    }

            return {
                "id": def_loc.get("id", "ba"),
                "target_type": def_loc.get("target_type", "preset"),
                "name": def_loc.get("name", "Buenos Aires"),
                "city": def_loc.get("city", "Buenos Aires, Argentina (Obelisco)"),
                "latitude": float(def_loc.get("latitude", -34.603722)),
                "longitude": float(def_loc.get("longitude", -58.381592)),
                "altitude": float(def_loc.get("altitude", 25.0)),
                "accuracy": float(def_loc.get("accuracy", 4.2)),
                "timezone": def_loc.get("timezone", "America/Argentina/Buenos_Aires"),
            }

    def set_default_location(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Establece la ubicación general por defecto del sistema (custom, preset o manual)."""
        target_type = data.get("target_type")
        target_id = data.get("target_id") or data.get("id")

        with transaction(db_path=self.db_path) as conn:
            new_def: Dict[str, Any] = {}

            # 1. Custom location
            if target_type == "custom" or (target_id and str(target_id).startswith("loc_")):
                cur = conn.execute("SELECT * FROM locations WHERE id = ?", (target_id,))
                loc_row = cur.fetchone()
                if not loc_row:
                    raise FileNotFoundError(
                        f"Ubicación custom '{target_id}' no encontrada para establecer como predeterminada"
                    )
                loc = _row_to_location(loc_row)
                new_def = {
                    "id": loc["id"],
                    "target_type": "custom",
                    "name": loc["name"],
                    "city": loc["city"],
                    "latitude": loc["latitude"],
                    "longitude": loc["longitude"],
                    "altitude": loc["altitude"],
                    "accuracy": loc["accuracy"],
                    "timezone": loc["timezone"],
                }

            # 2. Preset oficial
            elif target_type == "preset" or (target_id and not ("latitude" in data and "longitude" in data)):
                clean_id = (target_id or "ba").strip().lower()
                presets = self._get_presets_dict()
                preset_info = presets.get(clean_id)
                if not preset_info:
                    raise FileNotFoundError(f"Preset '{clean_id}' no encontrado para establecer como predeterminado")

                new_def = {
                    "id": clean_id,
                    "target_type": "preset",
                    "name": preset_info.get("city", "").split(",")[0].strip() or clean_id.capitalize(),
                    "city": preset_info.get("city", clean_id),
                    "latitude": float(preset_info["latitude"]),
                    "longitude": float(preset_info["longitude"]),
                    "altitude": float(preset_info.get("altitude", 25.0)),
                    "accuracy": float(preset_info.get("accuracy", 4.2)),
                    "timezone": preset_info.get("timezone", "America/Argentina/Buenos_Aires"),
                }

            # 3. Coordenadas directas
            else:
                if "latitude" not in data or "longitude" not in data:
                    raise ValueError("Se requiere target_id (custom/preset) o coordenadas latitude y longitude")

                lat = float(data["latitude"])
                lon = float(data["longitude"])
                if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lon <= 180.0):
                    raise ValueError("Coordenadas fuera de rango válido (-90..90, -180..180)")

                name = data.get("name") or data.get("city") or f"Ubicación ({lat:.4f}, {lon:.4f})"
                city = data.get("city") or name

                new_def = {
                    "id": target_id or "custom_default",
                    "target_type": target_type or "custom",
                    "name": name,
                    "city": city,
                    "latitude": round(lat, 6),
                    "longitude": round(lon, 6),
                    "altitude": float(data.get("altitude", 25.0)),
                    "accuracy": float(data.get("accuracy", 4.2)),
                    "timezone": data.get("timezone", "America/Argentina/Buenos_Aires") or "America/Argentina/Buenos_Aires",
                }

            conn.execute(
                "INSERT OR REPLACE INTO location_config (key, value_json) VALUES ('default_location', ?)",
                (json.dumps(new_def),),
            )
            return new_def

    # ── Consultas Rápidas ───────────────────────────────────────────────────

    def list_locations(self) -> List[Dict[str, Any]]:
        with get_connection(self.db_path, read_only=False) as conn:
            cur = conn.execute("SELECT * FROM locations ORDER BY created_at DESC")
            return [_row_to_location(r) for r in cur.fetchall()]

    def list_groups(self) -> List[Dict[str, Any]]:
        with get_connection(self.db_path, read_only=False) as conn:
            cur = conn.execute("SELECT * FROM location_groups ORDER BY name ASC")
            return [_row_to_group(r) for r in cur.fetchall()]

    def get_location(self, loc_id: str) -> Optional[Dict[str, Any]]:
        with get_connection(self.db_path, read_only=False) as conn:
            cur = conn.execute("SELECT * FROM locations WHERE id = ?", (loc_id,))
            row = cur.fetchone()
            return _row_to_location(row) if row else None

    def find_location(self, query: str) -> Optional[Dict[str, Any]]:
        """Busca una ubicación por ID o por coincidencia insensible de nombre."""
        q = query.strip().lower()
        with get_connection(self.db_path, read_only=False) as conn:
            cur = conn.execute(
                "SELECT * FROM locations WHERE LOWER(id) = ? OR LOWER(name) = ? LIMIT 1",
                (q, q),
            )
            row = cur.fetchone()
            return _row_to_location(row) if row else None

    # ── CRUD Ubicaciones ────────────────────────────────────────────────────

    def create_location(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Crea una nueva ubicación personalizada en la base de datos."""
        with transaction(db_path=self.db_path) as conn:
            loc_id = data.get("id")
            if not loc_id:
                clean_name = re.sub(r'[^a-zA-Z0-9_]', '_', data.get("name", "loc").lower())[:16].strip('_')
                uid = uuid.uuid4().hex[:6]
                loc_id = f"loc_{clean_name}_{uid}" if clean_name else f"loc_{uid}"

            # Validar unicidad del id
            cur = conn.execute("SELECT 1 FROM locations WHERE id = ?", (loc_id,))
            while cur.fetchone():
                loc_id = f"loc_{uuid.uuid4().hex[:8]}"
                cur = conn.execute("SELECT 1 FROM locations WHERE id = ?", (loc_id,))

            group_id = data.get("group_id")
            if group_id:
                cur = conn.execute("SELECT 1 FROM location_groups WHERE id = ?", (group_id,))
                if not cur.fetchone():
                    group_id = None

            lat = round(float(data["latitude"]), 6)
            lon = round(float(data["longitude"]), 6)
            name = data.get("name", "").strip() or f"Ubicación {loc_id}"
            city = data.get("city", "").strip() or f"Coordenadas ({lat:.4f}, {lon:.4f})"
            now = datetime.now(timezone.utc).isoformat()
            altitude = float(data.get("altitude", 25.0))
            accuracy = float(data.get("accuracy", 4.2))
            timezone_str = data.get("timezone", "America/Argentina/Buenos_Aires") or "America/Argentina/Buenos_Aires"
            is_pinned = 1 if data.get("is_pinned") else 0
            radius_km = round(float(data.get("radius_km", 1.0)), 2) if data.get("radius_km") is not None else 1.0
            show_radius = 1 if (data.get("show_radius", True) if data.get("show_radius") is not None else True) else 0

            conn.execute(
                """
                INSERT INTO locations (
                    id, name, group_id, city, latitude, longitude,
                    altitude, accuracy, timezone, is_pinned, radius_km, show_radius, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    loc_id,
                    name,
                    group_id,
                    city,
                    lat,
                    lon,
                    altitude,
                    accuracy,
                    timezone_str,
                    is_pinned,
                    radius_km,
                    show_radius,
                    now,
                ),
            )

            return {
                "id": loc_id,
                "name": name,
                "group_id": group_id,
                "city": city,
                "latitude": lat,
                "longitude": lon,
                "altitude": altitude,
                "accuracy": accuracy,
                "timezone": timezone_str,
                "is_pinned": bool(is_pinned),
                "radius_km": radius_km,
                "show_radius": bool(show_radius),
                "created_at": now,
            }

    def update_location(self, loc_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Actualiza atributos de una ubicación existente."""
        with transaction(db_path=self.db_path) as conn:
            cur = conn.execute("SELECT * FROM locations WHERE id = ?", (loc_id,))
            row = cur.fetchone()
            if not row:
                raise FileNotFoundError(f"Ubicación custom '{loc_id}' no encontrada")

            current = dict(row)

            if "name" in data and data["name"] is not None:
                current["name"] = data["name"].strip()
            if "city" in data and data["city"] is not None:
                current["city"] = data["city"].strip()
            if "latitude" in data and data["latitude"] is not None:
                current["latitude"] = round(float(data["latitude"]), 6)
            if "longitude" in data and data["longitude"] is not None:
                current["longitude"] = round(float(data["longitude"]), 6)
            if "altitude" in data and data["altitude"] is not None:
                current["altitude"] = float(data["altitude"])
            if "accuracy" in data and data["accuracy"] is not None:
                current["accuracy"] = float(data["accuracy"])
            if "timezone" in data and data["timezone"] is not None:
                current["timezone"] = data["timezone"]
            if "group_id" in data:
                gid = data["group_id"]
                if gid:
                    cur = conn.execute("SELECT 1 FROM location_groups WHERE id = ?", (gid,))
                    current["group_id"] = gid if cur.fetchone() else None
                else:
                    current["group_id"] = None
            if "is_pinned" in data and data["is_pinned"] is not None:
                current["is_pinned"] = 1 if data["is_pinned"] else 0
            if "radius_km" in data and data["radius_km"] is not None:
                current["radius_km"] = round(float(data["radius_km"]), 2)
            if "show_radius" in data and data["show_radius"] is not None:
                current["show_radius"] = 1 if data["show_radius"] else 0

            conn.execute(
                """
                UPDATE locations SET
                    name = ?, group_id = ?, city = ?, latitude = ?, longitude = ?,
                    altitude = ?, accuracy = ?, timezone = ?, is_pinned = ?,
                    radius_km = ?, show_radius = ?
                WHERE id = ?
                """,
                (
                    current["name"],
                    current["group_id"],
                    current["city"],
                    current["latitude"],
                    current["longitude"],
                    current["altitude"],
                    current["accuracy"],
                    current["timezone"],
                    current["is_pinned"],
                    current["radius_km"],
                    current["show_radius"],
                    loc_id,
                ),
            )

            # Si era la default_location, sincronizar
            cur = conn.execute("SELECT value_json FROM location_config WHERE key = 'default_location'")
            row_def = cur.fetchone()
            if row_def:
                def_data = json.loads(row_def[0])
                if def_data.get("id") == loc_id:
                    def_data.update({
                        "name": current["name"],
                        "city": current["city"],
                        "latitude": current["latitude"],
                        "longitude": current["longitude"],
                        "altitude": current["altitude"],
                        "accuracy": current["accuracy"],
                        "timezone": current["timezone"],
                    })
                    conn.execute(
                        "UPDATE location_config SET value_json = ? WHERE key = 'default_location'",
                        (json.dumps(def_data),),
                    )

            cur = conn.execute("SELECT * FROM locations WHERE id = ?", (loc_id,))
            return _row_to_location(cur.fetchone())

    def delete_location(self, loc_id: str) -> bool:
        """Elimina permanentemente una ubicación."""
        with transaction(db_path=self.db_path) as conn:
            cur = conn.execute("DELETE FROM locations WHERE id = ?", (loc_id,))
            deleted = cur.rowcount > 0

            # Si era la default_location, restablecer a la oficial "ba"
            cur = conn.execute("SELECT value_json FROM location_config WHERE key = 'default_location'")
            row_def = cur.fetchone()
            if row_def:
                def_data = json.loads(row_def[0])
                if def_data.get("id") == loc_id:
                    conn.execute(
                        "UPDATE location_config SET value_json = ? WHERE key = 'default_location'",
                        (json.dumps(DEFAULT_SYSTEM_LOCATION),),
                    )

            return deleted

    # ── CRUD Grupos ─────────────────────────────────────────────────────────

    def create_group(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Crea un nuevo grupo de geolocalizaciones."""
        with transaction(db_path=self.db_path) as conn:
            grp_id = data.get("id")
            if not grp_id:
                clean_name = re.sub(r'[^a-zA-Z0-9_]', '_', data.get("name", "grp").lower())[:16].strip('_')
                uid = uuid.uuid4().hex[:6]
                grp_id = f"grp_{clean_name}_{uid}" if clean_name else f"grp_{uid}"

            cur = conn.execute("SELECT 1 FROM location_groups WHERE id = ?", (grp_id,))
            while cur.fetchone():
                grp_id = f"grp_{uuid.uuid4().hex[:8]}"
                cur = conn.execute("SELECT 1 FROM location_groups WHERE id = ?", (grp_id,))

            name = data.get("name", "").strip() or f"Grupo {grp_id}"
            color = data.get("color", "#10b981") or "#10b981"
            description = data.get("description", "").strip()
            now = datetime.now(timezone.utc).isoformat()

            conn.execute(
                """
                INSERT INTO location_groups (id, name, color, description, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (grp_id, name, color, description, now),
            )

            return {
                "id": grp_id,
                "name": name,
                "color": color,
                "description": description,
                "created_at": now,
            }

    def update_group(self, grp_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Actualiza un grupo existente."""
        with transaction(db_path=self.db_path) as conn:
            cur = conn.execute("SELECT * FROM location_groups WHERE id = ?", (grp_id,))
            row = cur.fetchone()
            if not row:
                raise FileNotFoundError(f"Grupo '{grp_id}' no encontrado")

            current = dict(row)
            if "name" in data and data["name"] is not None:
                current["name"] = data["name"].strip()
            if "color" in data and data["color"] is not None:
                current["color"] = data["color"].strip()
            if "description" in data and data["description"] is not None:
                current["description"] = data["description"].strip()

            conn.execute(
                """
                UPDATE location_groups SET name = ?, color = ?, description = ?
                WHERE id = ?
                """,
                (current["name"], current["color"], current["description"], grp_id),
            )

            cur = conn.execute("SELECT * FROM location_groups WHERE id = ?", (grp_id,))
            return _row_to_group(cur.fetchone())

    def delete_group(self, grp_id: str) -> bool:
        """Elimina un grupo. Las ubicaciones asociadas pasan a tener group_id = NULL."""
        with transaction(db_path=self.db_path) as conn:
            # ON DELETE SET NULL configurado en la FK se encarga automáticamente
            cur = conn.execute("DELETE FROM location_groups WHERE id = ?", (grp_id,))
            return cur.rowcount > 0

    # ── Fijados y Accesos Rápidos ───────────────────────────────────────────

    def toggle_custom_pin(self, loc_id: str, pinned: Optional[bool] = None) -> Dict[str, Any]:
        """Alterna o fija explícitamente el pin de una ubicación personalizada."""
        with transaction(db_path=self.db_path) as conn:
            cur = conn.execute("SELECT is_pinned FROM locations WHERE id = ?", (loc_id,))
            row = cur.fetchone()
            if not row:
                raise FileNotFoundError(f"Ubicación custom '{loc_id}' no encontrada")

            current_pin = bool(row[0])
            new_pin = (not current_pin) if pinned is None else bool(pinned)

            conn.execute(
                "UPDATE locations SET is_pinned = ? WHERE id = ?",
                (1 if new_pin else 0, loc_id),
            )

            cur = conn.execute("SELECT * FROM locations WHERE id = ?", (loc_id,))
            return _row_to_location(cur.fetchone())

    def toggle_preset_pin(self, preset_key: str, pinned: Optional[bool] = None) -> List[str]:
        """Alterna o fija explícitamente el pin de un preset oficial."""
        clean_key = preset_key.strip().lower()
        with transaction(db_path=self.db_path) as conn:
            cur = conn.execute("SELECT value_json FROM location_config WHERE key = 'pinned_presets'")
            row = cur.fetchone()
            current_pins: List[str] = json.loads(row[0]) if row else ["ba", "sao-paulo", "miami", "new-york"]

            should_pin = (clean_key not in current_pins) if pinned is None else bool(pinned)
            if should_pin and clean_key not in current_pins:
                current_pins.append(clean_key)
            elif not should_pin and clean_key in current_pins:
                current_pins = [k for k in current_pins if k != clean_key]

            conn.execute(
                "INSERT OR REPLACE INTO location_config (key, value_json) VALUES ('pinned_presets', ?)",
                (json.dumps(current_pins),),
            )
            return current_pins

    def set_pinned_presets(self, presets: List[str]) -> List[str]:
        """Sobrescribe la lista de presets oficiales fijados."""
        clean_presets = [p.strip().lower() for p in presets if p.strip()]
        with transaction(db_path=self.db_path) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO location_config (key, value_json) VALUES ('pinned_presets', ?)",
                (json.dumps(clean_presets),),
            )
            return clean_presets


# Instancia singleton para el servidor
custom_location_service = CustomLocationService()
