-- 001_initial_locations.sql
-- Tablas para el catálogo unificado de grupos, ubicaciones y configuración global

CREATE TABLE IF NOT EXISTS location_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#10b981',
    description TEXT DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    group_id TEXT REFERENCES location_groups(id) ON DELETE SET NULL,
    city TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    altitude REAL NOT NULL DEFAULT 25.0,
    accuracy REAL NOT NULL DEFAULT 4.2,
    timezone TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    is_pinned INTEGER NOT NULL DEFAULT 0,
    radius_km REAL NOT NULL DEFAULT 1.0,
    show_radius INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_locations_group_id ON locations(group_id);
CREATE INDEX IF NOT EXISTS idx_locations_is_pinned ON locations(is_pinned);

CREATE TABLE IF NOT EXISTS location_config (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL
);
