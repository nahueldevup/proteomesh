-- 005_app_settings.sql
-- Tabla unificada de preferencias del usuario y configuración persistente del sistema

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
