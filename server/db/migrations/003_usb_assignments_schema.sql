-- 003_usb_assignments_schema.sql
-- Tabla unificada para asignaciones de módem USB a instancias CloudPhone

CREATE TABLE IF NOT EXISTS usb_assignments (
    instance_name TEXT PRIMARY KEY REFERENCES instances(name) ON DELETE CASCADE,
    iface TEXT NOT NULL,
    serial TEXT NOT NULL,
    model TEXT,
    carrier TEXT,
    gateway TEXT,
    subnet TEXT,
    container_ip TEXT,
    public_ip TEXT,
    attached_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usb_assignments_iface ON usb_assignments(iface);
CREATE INDEX IF NOT EXISTS idx_usb_assignments_serial ON usb_assignments(serial);
