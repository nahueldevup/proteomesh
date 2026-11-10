"""
Servicio de persistencia y gestión de ubicaciones custom y grupos de geolocalización.
Utiliza concurrencia segura con fcntl.flock y escrituras atómicas en disco.
"""
import fcntl
import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Any

from server.config import CUSTOM_LOCATIONS_FILE, TOOLS_DIR

DEFAULT_SYSTEM_LOCATION: Dict[str, Any] = {
    "id": "ba",
    "target_type": "preset",
    "name": "Buenos Aires",
    "city": "Buenos Aires, Argentina (Obelisco)",
    "latitude": -34.603722,
    "longitude": -58.381592,
    "altitude": 25.0,
    "accuracy": 4.2,
    "timezone": "America/Argentina/Buenos_Aires"
}


class CustomLocationService:
    def __init__(self, file_path: Optional[Path] = None):
        self.file_path = Path(file_path or CUSTOM_LOCATIONS_FILE)
        self.lock_path = self.file_path.with_suffix(".lock")

    def _get_lock(self):
        """Retorna un descriptor de archivo para el lock exclusivo."""
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        return open(self.lock_path, "w")

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

    def _default_data(self) -> Dict[str, Any]:
        """Estructura base por defecto."""
        now = datetime.now(timezone.utc).isoformat()
        return {
            "groups": [
                {
                    "id": "grp_general",
                    "name": "General",
                    "color": "#10b981",
                    "description": "Ubicaciones generales y puntos clave",
                    "created_at": now
                }
            ],
            "locations": [
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
                    "created_at": now
                }
            ],
            "pinned_presets": ["ba", "sao-paulo", "miami", "new-york"],
            "default_location": dict(DEFAULT_SYSTEM_LOCATION)
        }

    def _read_data_unlocked(self) -> Dict[str, Any]:
        if not self.file_path.exists():
            data = self._default_data()
            self._write_data_unlocked(data)
            return data
        try:
            with open(self.file_path, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if not content:
                    return self._default_data()
                data = json.loads(content)
                if not isinstance(data, dict):
                    return self._default_data()
                data.setdefault("groups", [])
                data.setdefault("locations", [])
                data.setdefault("pinned_presets", ["ba", "sao-paulo", "miami", "new-york"])
                if "default_location" not in data or not isinstance(data.get("default_location"), dict):
                    data["default_location"] = dict(DEFAULT_SYSTEM_LOCATION)
                for loc in data["locations"]:
                    loc.setdefault("is_pinned", False)
                return data
        except Exception:
            return self._default_data()

    def _write_data_unlocked(self, data: Dict[str, Any]) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_file = self.file_path.with_suffix(".tmp")
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_file, self.file_path)

    # ── Métodos Públicos: Catálogo ──────────────────────────────────────────

    def get_catalog(self) -> Dict[str, Any]:
        with self._get_lock() as lock_f:
            fcntl.flock(lock_f, fcntl.LOCK_SH)
            try:
                data = self._read_data_unlocked()
                # Sincronizar default_location con la ubicación custom si corresponde
                def_loc = data.get("default_location")
                if def_loc and (def_loc.get("target_type") == "custom" or str(def_loc.get("id", "")).startswith("loc_")):
                    for loc in data.get("locations", []):
                        if loc.get("id") == def_loc.get("id"):
                            data["default_location"] = {
                                "id": loc["id"],
                                "target_type": "custom",
                                "name": loc["name"],
                                "city": loc["city"],
                                "latitude": loc["latitude"],
                                "longitude": loc["longitude"],
                                "altitude": loc.get("altitude", 25.0),
                                "accuracy": loc.get("accuracy", 4.2),
                                "timezone": loc.get("timezone", "America/Argentina/Buenos_Aires"),
                            }
                            break
                elif not def_loc:
                    data["default_location"] = dict(DEFAULT_SYSTEM_LOCATION)
                return data
            finally:
                fcntl.flock(lock_f, fcntl.LOCK_UN)

    def get_default_location(self) -> Dict[str, Any]:
        """Retorna la ubicación general por defecto del sistema."""
        with self._get_lock() as lock_f:
            fcntl.flock(lock_f, fcntl.LOCK_SH)
            try:
                catalog = self._read_data_unlocked()
                def_loc = catalog.get("default_location")
                if not def_loc or not isinstance(def_loc, dict):
                    return dict(DEFAULT_SYSTEM_LOCATION)

                if def_loc.get("target_type") == "custom" or str(def_loc.get("id", "")).startswith("loc_"):
                    loc_id = def_loc.get("id")
                    for loc in catalog.get("locations", []):
                        if loc.get("id") == loc_id:
                            return {
                                "id": loc["id"],
                                "target_type": "custom",
                                "name": loc["name"],
                                "city": loc["city"],
                                "latitude": loc["latitude"],
                                "longitude": loc["longitude"],
                                "altitude": loc.get("altitude", 25.0),
                                "accuracy": loc.get("accuracy", 4.2),
                                "timezone": loc.get("timezone", "America/Argentina/Buenos_Aires"),
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
            finally:
                fcntl.flock(lock_f, fcntl.LOCK_UN)

    def set_default_location(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Establece la ubicación general por defecto del sistema (custom, preset o manual)."""
        with self._get_lock() as lock_f:
            fcntl.flock(lock_f, fcntl.LOCK_EX)
            try:
                catalog = self._read_data_unlocked()
                target_type = data.get("target_type")
                target_id = data.get("target_id") or data.get("id")

                new_def: Dict[str, Any] = {}

                # 1. Custom location
                if target_type == "custom" or (target_id and str(target_id).startswith("loc_")):
                    loc = None
                    for item in catalog.get("locations", []):
                        if item.get("id") == target_id:
                            loc = item
                            break
                    if not loc:
                        raise FileNotFoundError(f"Ubicación custom '{target_id}' no encontrada para establecer como predeterminada")

                    new_def = {
                        "id": loc["id"],
                        "target_type": "custom",
                        "name": loc["name"],
                        "city": loc["city"],
                        "latitude": loc["latitude"],
                        "longitude": loc["longitude"],
                        "altitude": loc.get("altitude", 25.0),
                        "accuracy": loc.get("accuracy", 4.2),
                        "timezone": loc.get("timezone", "America/Argentina/Buenos_Aires"),
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

                catalog["default_location"] = new_def
                self._write_data_unlocked(catalog)
                return new_def
            finally:
                fcntl.flock(lock_f, fcntl.LOCK_UN)

    def list_locations(self) -> List[Dict[str, Any]]:
        return self.get_catalog().get("locations", [])

    def list_groups(self) -> List[Dict[str, Any]]:
        return self.get_catalog().get("groups", [])

    # ── Métodos Públicos: Ubicaciones Custom ─────────────────────────────────

    def get_location(self, loc_id: str) -> Optional[Dict[str, Any]]:
        locations = self.list_locations()
        for loc in locations:
            if loc.get("id") == loc_id:
                return loc
        return None

    def find_location(self, query: str) -> Optional[Dict[str, Any]]:
        """Busca una ubicación por ID o por coincidencia exacta/insensible de nombre."""
        q = query.strip().lower()
        locations = self.list_locations()
        for loc in locations:
            if loc.get("id") == query or loc.get("id", "").lower() == q:
                return loc
            if loc.get("name", "").strip().lower() == q:
                return loc
        return None

    def create_location(self, data: Dict[str, Any]) -> Dict[str, Any]:
        with self._get_lock() as lock_f:
            fcntl.flock(lock_f, fcntl.LOCK_EX)
            try:
                catalog = self._read_data_unlocked()
                loc_id = data.get("id")
                if not loc_id:
                    clean_name = re.sub(r'[^a-zA-Z0-9_]', '_', data.get("name", "loc").lower())[:16].strip('_')
                    uid = uuid.uuid4().hex[:6]
                    loc_id = f"loc_{clean_name}_{uid}" if clean_name else f"loc_{uid}"

                # Asegurar que el id sea único
                existing_ids = {l.get("id") for l in catalog["locations"]}
                while loc_id in existing_ids:
                    loc_id = f"loc_{uuid.uuid4().hex[:8]}"

                group_id = data.get("group_id")
                if group_id:
                    # Validar que el grupo exista
                    valid_group = any(g.get("id") == group_id for g in catalog["groups"])
                    if not valid_group:
                        group_id = None

                name = data.get("name", "").strip() or f"Ubicación {loc_id}"
                city = data.get("city", "").strip() or f"Coordenadas ({float(data['latitude']):.4f}, {float(data['longitude']):.4f})"
                now = datetime.now(timezone.utc).isoformat()

                new_loc = {
                    "id": loc_id,
                    "name": name,
                    "group_id": group_id,
                    "city": city,
                    "latitude": round(float(data["latitude"]), 6),
                    "longitude": round(float(data["longitude"]), 6),
                    "altitude": float(data.get("altitude", 25.0)),
                    "accuracy": float(data.get("accuracy", 4.2)),
                    "timezone": data.get("timezone", "America/Argentina/Buenos_Aires") or "America/Argentina/Buenos_Aires",
                    "is_pinned": bool(data.get("is_pinned", False)),
                    "radius_km": round(float(data.get("radius_km", 1.0)), 2) if data.get("radius_km") is not None else 1.0,
                    "show_radius": bool(data.get("show_radius", True)) if data.get("show_radius") is not None else True,
                    "created_at": now
                }

                catalog["locations"].append(new_loc)
                self._write_data_unlocked(catalog)
                return new_loc
            finally:
                fcntl.flock(lock_f, fcntl.LOCK_UN)

    def update_location(self, loc_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        with self._get_lock() as lock_f:
            fcntl.flock(lock_f, fcntl.LOCK_EX)
            try:
                catalog = self._read_data_unlocked()
                loc = None
                for item in catalog["locations"]:
                    if item.get("id") == loc_id:
                        loc = item
                        break

                if not loc:
                    raise FileNotFoundError(f"Ubicación custom '{loc_id}' no encontrada")

                if "name" in data and data["name"] is not None:
                    loc["name"] = data["name"].strip()
                if "city" in data and data["city"] is not None:
                    loc["city"] = data["city"].strip()
                if "latitude" in data and data["latitude"] is not None:
                    loc["latitude"] = round(float(data["latitude"]), 6)
                if "longitude" in data and data["longitude"] is not None:
                    loc["longitude"] = round(float(data["longitude"]), 6)
                if "altitude" in data and data["altitude"] is not None:
                    loc["altitude"] = float(data["altitude"])
                if "accuracy" in data and data["accuracy"] is not None:
                    loc["accuracy"] = float(data["accuracy"])
                if "timezone" in data and data["timezone"] is not None:
                    loc["timezone"] = data["timezone"]
                if "group_id" in data:
                    gid = data["group_id"]
                    if gid:
                        valid_group = any(g.get("id") == gid for g in catalog["groups"])
                        loc["group_id"] = gid if valid_group else None
                    else:
                        loc["group_id"] = None
                if "is_pinned" in data and data["is_pinned"] is not None:
                    loc["is_pinned"] = bool(data["is_pinned"])
                if "radius_km" in data and data["radius_km"] is not None:
                    loc["radius_km"] = round(float(data["radius_km"]), 2)
                if "show_radius" in data and data["show_radius"] is not None:
                    loc["show_radius"] = bool(data["show_radius"])

                self._write_data_unlocked(catalog)
                return loc
            finally:
                fcntl.flock(lock_f, fcntl.LOCK_UN)

    def toggle_custom_pin(self, loc_id: str, pinned: Optional[bool] = None) -> Dict[str, Any]:
        with self._get_lock() as lock_f:
            fcntl.flock(lock_f, fcntl.LOCK_EX)
            try:
                catalog = self._read_data_unlocked()
                loc = None
                for item in catalog["locations"]:
                    if item.get("id") == loc_id:
                        loc = item
                        break
                if not loc:
                    raise FileNotFoundError(f"Ubicación custom '{loc_id}' no encontrada")

                loc["is_pinned"] = not loc.get("is_pinned", False) if pinned is None else bool(pinned)
                self._write_data_unlocked(catalog)
                return loc
            finally:
                fcntl.flock(lock_f, fcntl.LOCK_UN)

    def toggle_preset_pin(self, preset_key: str, pinned: Optional[bool] = None) -> List[str]:
        with self._get_lock() as lock_f:
            fcntl.flock(lock_f, fcntl.LOCK_EX)
            try:
                catalog = self._read_data_unlocked()
                current_pins = catalog.get("pinned_presets", ["ba", "sao-paulo", "miami", "new-york"])
                clean_key = preset_key.strip().lower()

                should_pin = (clean_key not in current_pins) if pinned is None else bool(pinned)
                if should_pin and clean_key not in current_pins:
                    current_pins.append(clean_key)
                elif not should_pin and clean_key in current_pins:
                    current_pins = [k for k in current_pins if k != clean_key]

                catalog["pinned_presets"] = current_pins
                self._write_data_unlocked(catalog)
                return current_pins
            finally:
                fcntl.flock(lock_f, fcntl.LOCK_UN)

    def set_pinned_presets(self, presets: List[str]) -> List[str]:
        with self._get_lock() as lock_f:
            fcntl.flock(lock_f, fcntl.LOCK_EX)
            try:
                catalog = self._read_data_unlocked()
                catalog["pinned_presets"] = [p.strip().lower() for p in presets if p.strip()]
                self._write_data_unlocked(catalog)
                return catalog["pinned_presets"]
            finally:
                fcntl.flock(lock_f, fcntl.LOCK_UN)

    def delete_location(self, loc_id: str) -> bool:
        with self._get_lock() as lock_f:
            fcntl.flock(lock_f, fcntl.LOCK_EX)
            try:
                catalog = self._read_data_unlocked()
                initial_count = len(catalog["locations"])
                catalog["locations"] = [l for l in catalog["locations"] if l.get("id") != loc_id]
                if len(catalog["locations"]) == initial_count:
                    return False
                self._write_data_unlocked(catalog)
                return True
            finally:
                fcntl.flock(lock_f, fcntl.LOCK_UN)

    # ── Métodos Públicos: Grupos de Geolocalización ─────────────────────────

    def create_group(self, data: Dict[str, Any]) -> Dict[str, Any]:
        with self._get_lock() as lock_f:
            fcntl.flock(lock_f, fcntl.LOCK_EX)
            try:
                catalog = self._read_data_unlocked()
                grp_id = data.get("id")
                if not grp_id:
                    clean_name = re.sub(r'[^a-zA-Z0-9_]', '_', data.get("name", "grp").lower())[:16].strip('_')
                    uid = uuid.uuid4().hex[:6]
                    grp_id = f"grp_{clean_name}_{uid}" if clean_name else f"grp_{uid}"

                existing_ids = {g.get("id") for g in catalog["groups"]}
                while grp_id in existing_ids:
                    grp_id = f"grp_{uuid.uuid4().hex[:8]}"

                name = data.get("name", "").strip() or f"Grupo {grp_id}"
                color = data.get("color", "#10b981") or "#10b981"
                description = data.get("description", "").strip()
                now = datetime.now(timezone.utc).isoformat()

                new_grp = {
                    "id": grp_id,
                    "name": name,
                    "color": color,
                    "description": description,
                    "created_at": now
                }
                catalog["groups"].append(new_grp)
                self._write_data_unlocked(catalog)
                return new_grp
            finally:
                fcntl.flock(lock_f, fcntl.LOCK_UN)

    def update_group(self, grp_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        with self._get_lock() as lock_f:
            fcntl.flock(lock_f, fcntl.LOCK_EX)
            try:
                catalog = self._read_data_unlocked()
                grp = None
                for item in catalog["groups"]:
                    if item.get("id") == grp_id:
                        grp = item
                        break

                if not grp:
                    raise FileNotFoundError(f"Grupo '{grp_id}' no encontrado")

                if "name" in data and data["name"] is not None:
                    grp["name"] = data["name"].strip()
                if "color" in data and data["color"] is not None:
                    grp["color"] = data["color"].strip()
                if "description" in data and data["description"] is not None:
                    grp["description"] = data["description"].strip()

                self._write_data_unlocked(catalog)
                return grp
            finally:
                fcntl.flock(lock_f, fcntl.LOCK_UN)

    def delete_group(self, grp_id: str) -> bool:
        """Elimina un grupo. Las ubicaciones asociadas pasan a tener group_id = None."""
        with self._get_lock() as lock_f:
            fcntl.flock(lock_f, fcntl.LOCK_EX)
            try:
                catalog = self._read_data_unlocked()
                initial_count = len(catalog["groups"])
                catalog["groups"] = [g for g in catalog["groups"] if g.get("id") != grp_id]
                if len(catalog["groups"]) == initial_count:
                    return False

                # Desasociar ubicaciones de este grupo
                for loc in catalog["locations"]:
                    if loc.get("group_id") == grp_id:
                        loc["group_id"] = None

                self._write_data_unlocked(catalog)
                return True
            finally:
                fcntl.flock(lock_f, fcntl.LOCK_UN)


# Instancia singleton para el servidor
custom_location_service = CustomLocationService()
