-- 004_consolidate_stores.sql
-- Consolidación de apks, ip_ledger, leases y routes en proteomesh.db

-- 1. Repositorio de APKs y bundles AAB
CREATE TABLE IF NOT EXISTS apks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sha256 TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    package TEXT,
    version_name TEXT,
    version_code INTEGER,
    size INTEGER NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    entry_type TEXT NOT NULL DEFAULT 'monolithic',
    bundle_format TEXT DEFAULT NULL,
    splits_info TEXT DEFAULT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_apks_sha256 ON apks(sha256);
CREATE INDEX IF NOT EXISTS idx_apks_default ON apks(is_default);

-- 2. Historial de IPs y configuración de cuotas de red USB
CREATE TABLE IF NOT EXISTS usb_ip_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    instance_name TEXT NOT NULL,
    usb_id TEXT NOT NULL,
    carrier TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usb_ip ON usb_ip_ledger(ip);
CREATE INDEX IF NOT EXISTS idx_usb_inst ON usb_ip_ledger(instance_name);
CREATE INDEX IF NOT EXISTS idx_usb_exp ON usb_ip_ledger(expires_at);

CREATE TABLE IF NOT EXISTS ledger_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- 3. Registro de leases de salida para proxies y túneles
CREATE TABLE IF NOT EXISTS proxy_leases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id TEXT NOT NULL,
    exit_ip TEXT NOT NULL,
    transport TEXT NOT NULL,
    metadata TEXT,
    acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    released_at TIMESTAMP NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_exit_ip
    ON proxy_leases(exit_ip) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_instance_active
    ON proxy_leases(instance_id) WHERE released_at IS NULL;

-- 4. Catálogo persistente de rutas proxy SOCKS5
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
