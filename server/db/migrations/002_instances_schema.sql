-- 002_instances_schema.sql
-- Tablas unificadas para el estado persistente de instancias y perfiles de hardware

CREATE TABLE IF NOT EXISTS instances (
    name TEXT PRIMARY KEY,
    template TEXT,
    carrier TEXT,
    adb_port INTEGER NOT NULL,
    docker_status TEXT DEFAULT 'Detenido (Offline)',
    city TEXT,
    latitude REAL,
    longitude REAL,
    altitude REAL DEFAULT 25.0,
    accuracy REAL DEFAULT 4.2,
    timezone TEXT DEFAULT 'America/Argentina/Buenos_Aires',
    custom_location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
    custom_name TEXT,
    group_name TEXT,
    proxy_json TEXT,
    network_state_json TEXT,
    display_json TEXT,
    identity_json TEXT,
    limits_json TEXT,
    default_apks_provisioned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_instances_custom_location_id ON instances(custom_location_id);
CREATE INDEX IF NOT EXISTS idx_instances_adb_port ON instances(adb_port);

CREATE TABLE IF NOT EXISTS instance_profiles (
    instance_name TEXT PRIMARY KEY REFERENCES instances(name) ON DELETE CASCADE,
    profile_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
