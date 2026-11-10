# Arquitectura de Persistencia Unificada SQLite — ProteoMesh

## 1. Visión General y Motivación

Históricamente, ProteoMesh mantenía su estado distribuido en un mosaico heterogéneo:
- Archivos JSON globales (`custom_locations.json`).
- Archivos JSON por instancia (`instances/<name>/meta.json`, `profile.json`, `usb_tether.json`).
- Cuatro bases de datos SQLite desconectadas (`instances/apks.db`, `instances/ip_ledger.db`, `instances/leases.db`, `instances/routes.db`).
- Bloqueos de archivo dispersos con `fcntl.flock` (`meta.lock`, `custom_locations.lock`) que dejaban archivos huérfanos y no garantizaban atomicidad en escrituras concurrentes.

La nueva arquitectura consolida **toda la persistencia relacional y de estado en una única base de datos transaccional:**
`instances/proteomesh.db`

---

## 2. Configuración y Concurrencia de la Base de Datos

Cada conexión en ProteoMesh se inicializa con los siguientes parámetros de motor (`server/db/connection.py`):
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

### Ventajas Técnicas:
1. **Modo WAL (Write-Ahead Logging):** Lectores y escritores no se bloquean mutuamente. Lecturas concurrentes ilimitadas desde hilos FastAPI y workers asíncronos.
2. **Busy Timeout (5000ms):** Cualquier intento de escritura que encuentre contención espera hasta 5 segundos antes de fallar, eliminando las excepciones `sqlite3.OperationalError: database is locked`.
3. **Transacciones `BEGIN IMMEDIATE`:** Para operaciones de mutación, el bloqueo de escritura se toma al inicio de la transacción, previniendo carreras de tipo TOCTOU (Time-of-check to time-of-use) y eliminando completamente la necesidad de archivos `.lock` en el sistema de archivos.

---

## 3. Sistema de Migraciones Versionadas (`server/db/migrate.py`)

Las migraciones DDL se gestionan en SQL puro versionado bajo el directorio `server/db/migrations/`:
- `_schema_version`: Tabla interna que registra las versiones aplicadas con timestamp UTC.
- Migraciones actuales:
  - `001_initial_locations.sql`: Tablas `location_groups`, `locations` y `location_config` con soporte para `radius_km` y `show_radius`.
  - `002_instances_schema.sql`: Tablas `instances` e `instance_profiles` con claves foráneas, columnas tipadas para atributos de consulta rápida e índices.
  - `003_usb_assignments_schema.sql`: Tabla `usb_assignments` para el control de enganche módem USB -> contenedor con borrado en cascada `ON DELETE CASCADE`.
  - `004_consolidate_stores.sql`: Consolidación de `apks`, `usb_ip_ledger`, `ledger_config`, `proxy_leases` y `routes`.

---

## 4. Principio de Proyección Dual Atómica (Disk Projection)

Aunque SQLite es la **fuente primaria de verdad** transaccional en tiempo de ejecución, los contenedores Docker y scripts de host externos (`instance_manager.py`, `usb_tether.sh`, montajes de volumen `/sdcard`) requieren que los archivos JSON sigan existiendo en disco.

Para resolver esto sin reintroducir condiciones de carrera:
1. Toda mutación se ejecuta dentro de una transacción SQLite inmediata (`instance_store.mutate_meta`, `instance_store.save_instance`, `usb_store.save`).
2. Al confirmarse el commit en la base de datos, el estado se proyecta a disco escribiendo en un archivo temporal (`.tmp`) con `os.fsync` y realizando un `os.replace` atómico a nivel de inodo POSIX:
   - `instances/<name>/meta.json`
   - `instances/<name>/profile.json`
   - `instances/<name>/usb_tether.json`
3. Si un comando manual de shell o fixture de prueba crea carpetas directamente en `instances/`, el método de auto-descubrimiento bidireccional (`sync_from_disk()`) las importa e indexa automáticamente en SQLite al vuelo, purgando a su vez cualquier registro cuya carpeta haya sido eliminada de disco.

---

## 5. Tabla de Correspondencia de Servicios

| Dominio / Entidad | Ubicación Anterior | Almacén Actual (SQLite) | Repositorio / Servicio |
| :--- | :--- | :--- | :--- |
| **Geolocalización** | `custom_locations.json` | `locations`, `location_groups`, `location_config` | `server/services/custom_location_service.py` |
| **Metadatos Instancia** | `instances/<id>/meta.json` + `meta.lock` | `instances` | `server/db/instance_store.py` |
| **Perfiles Hardware/OS** | `instances/<id>/profile.json` | `instance_profiles` | `server/db/instance_store.py` |
| **Módems USB Tethering** | `instances/<id>/usb_tether.json` | `usb_assignments` | `server/db/usb_store.py` |
| **Catálogo APK / AAB** | `instances/apks.db` | `apks` en `proteomesh.db` | `server/services/apk_repository.py` |
| **Historial IPs USB** | `instances/ip_ledger.db` | `usb_ip_ledger`, `ledger_config` en `proteomesh.db` | `server/services/network/ip_ledger.py` |
| **Leases Anti-Colisión** | `instances/leases.db` | `proxy_leases` en `proteomesh.db` | `server/services/network/lease_registry.py` |
| **Rutas SOCKS5** | `instances/routes.db` | `routes` en `proteomesh.db` | `server/services/network/route_store.py` |
