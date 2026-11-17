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
  - `005_app_settings.sql`: Tabla `app_settings` para persistencia de preferencias de la aplicación y el usuario (ver §6).

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
| **Preferencias de App/Usuario** | *(inexistente — se perdían al recargar)* | `app_settings` en `proteomesh.db` | `server/db/settings_store.py` |

---

## 6. Subsistema de Preferencias Persistentes (`app_settings`)

### 6.1. Motivación

Antes de esta migración (005), las preferencias de la interfaz web (como el **Modo Denso**, límites de RAM/CPU y la opción de inicio inmediato del modal de creación de CloudPhones, y los parámetros del temporizador de backups) se perdían completamente al recargar el navegador o reiniciar el backend. No había ninguna capa de persistencia para ellas.

### 6.2. Esquema de la Tabla

```sql
-- server/db/migrations/005_app_settings.sql
CREATE TABLE IF NOT EXISTS app_settings (
    key        TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

- **`key`**: Identificador único de la preferencia (ej. `"create_device"`).
- **`value_json`**: Valor serializado como JSON. Permite guardar objetos, arrays, strings o primitivos sin requerir columnas adicionales.
- **`updated_at`**: Timestamp ISO 8601 en UTC de la última escritura, útil para auditoría y debugging.

### 6.3. Capa de Acceso (`server/db/settings_store.py`)

El módulo expone una clase `SettingsStore` con un singleton global `settings_store`:

| Método | Descripción |
|---|---|
| `get(key, default=None)` | Lee y deserializa el valor JSON de una clave. Retorna `default` si no existe. Usa conexión de solo lectura. |
| `set(key, value)` | Serializa el valor a JSON y realiza un UPSERT atómico (`ON CONFLICT(key) DO UPDATE`). |
| `get_all()` | Retorna todas las claves como un diccionario Python. |
| `delete(key)` | Elimina una clave. Retorna `True` si existía. |

Patrón consistente con `instance_store` y `usb_store` del proyecto.

### 6.4. Endpoints REST (`server/routes/settings.py`)

Router montado bajo el prefijo `/api/v1/settings`:

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/v1/settings` | Retorna todas las configuraciones como `dict`. |
| `GET` | `/api/v1/settings/create-device` | Retorna preferencias del modal de creación de CloudPhone. |
| `PUT` | `/api/v1/settings/create-device` | Guarda preferencias del modal. Validación estricta de dominio. |
| `GET` | `/api/v1/settings/{key}` | Retorna el valor de cualquier clave genérica. `404` si no existe. |
| `PUT` | `/api/v1/settings/{key}` | Inserta o actualiza cualquier clave genérica. |

#### Modelo `CreateDevicePreferences` con validación de dominio

```python
class CreateDevicePreferences(BaseModel):
    is_dense: bool = Field(False)
    memory_limit: str = Field("2.5g")   # Validado: formato Docker (ej. 512m, 2.5g, 4G)
    cpu_limit: str = Field("auto")      # Validado: {"auto","1","2","3","4","6","8"}
    start_immediately: bool = Field(True)
```

Los campos `memory_limit` y `cpu_limit` son validados con `@field_validator` antes de persistir. Un valor inválido (ej. `memory_limit="banana"`) retorna `HTTP 422 Unprocessable Entity` y **nunca llega a la base de datos ni a Docker**.

### 6.5. Estrategia de Persistencia Dual en el Frontend

`CreateDeviceModal.tsx` usa una estrategia de doble capa para máxima resiliencia:

1. **`localStorage` (caché local, instantáneo):** Al abrir el modal, las preferencias del ciclo anterior se aplican de inmediato desde `localStorage` sin esperar respuesta de red. Clave: `pm-create-device-preferences`.
2. **Backend SQLite (fuente canónica):** Inmediatamente después, se hace `GET /api/v1/settings/create-device`. Si el servidor responde y el usuario **no ha tocado nada** en el modal desde que se abrió, sus preferencias sobreescriben el estado local. `localStorage` se actualiza con el valor del servidor.
3. **Guard anti-race-condition:** La ref `userInteractedWithPrefsRef` se marca en `true` en cualquier handler de preferencias (`handleSetDense`, `handleSetMemoryLimit`, etc.). Si la respuesta del servidor llega después de que el usuario ya interactuó, se descarta silenciosamente. El usuario siempre gana.
4. **Persistencia en cada cambio:** Cada modificación dispara `PUT /api/v1/settings/create-device` en modo fire-and-forget, con `console.warn` en caso de fallo (visible en DevTools, sin interrumpir al usuario).

```
Abrir modal
  ↓
localStorage → aplica prefs inmediato (0ms)
  ↓ async
GET /api/v1/settings/create-device
  → si usuario no tocó nada → sobreescribe estado + actualiza localStorage
  → si usuario ya tocó algo  → descarte silencioso

Cambiar Modo Denso / RAM / CPU / Inicio
  ↓
localStorage.setItem (síncrono)
PUT /api/v1/settings/create-device (async, fire-and-forget con console.warn en error)
```

### 6.6. Persistencia del Temporizador de Backups

`BackupsManager.tsx` implementa el mismo patrón para el modal de programación de respaldos:

- **Clave localStorage:** `pm-backup-schedule-cache`
- Al montar el componente, aplica el caché local inmediatamente para evitar valores por defecto.
- Al recibir los datos reales del backend (hook `useBackupSchedule`), sobreescribe el estado y actualiza el caché.
- Al guardar una nueva configuración (`PUT /api/v1/backups/schedule`), actualiza el caché local simultáneamente.

### 6.7. Correcciones en `tools/setup_backup_schedule.sh`

Se aplicaron dos correcciones críticas al script de automatización:

#### Corrección 1: `Persistent=false` (eliminación de backups al arrancar)

**Antes:**
```ini
[Timer]
OnCalendar=*-*-1 04:15:00
Persistent=true
```

**Después:**
```ini
[Timer]
OnCalendar=*-*-1 04:15:00
Persistent=false
```

Con `Persistent=true`, systemd detectaba que "se perdió" un evento durante el tiempo que la máquina estuvo apagada y ejecutaba el backup inmediatamente al arrancar. Con `Persistent=false`, el timer solo se dispara a la hora exacta programada.

#### Corrección 2: Preservación de parámetros al deshabilitar

**Antes:** `--disable` eliminaba físicamente las unidades `.service` y `.timer` sin guardar los parámetros.

**Después:** `--disable` llama a `save_schedule_config "false" "${FREQUENCY}" "${SCHEDULE_TIME}" ...`, preservando todos los parámetros en `instances/backup_schedule.json` y `~/.config/proteomesh/backup_schedule.json` con `"enabled": false`. Al re-habilitar o consultar el estado, la UI recuerda la frecuencia, hora y retención configuradas previamente.

#### Corrección 3: Preservación de parámetros en `--disable` desde la API

**Antes:** `PUT /api/v1/backups/schedule` con `enabled: false` llamaba a `--disable` sin pasar los parámetros actuales, borrando la memoria.

**Después:** El endpoint pasa `--weekly`/`--daily`, `--time`, `--keep` y `--no-encrypt` al script incluso cuando `enabled=false`, para que `save_schedule_config` reciba los valores correctos.

### 6.8. Tests de Cobertura

**`tests/host/test_api_settings.py`** — 8 tests:

| Test | Qué verifica |
|---|---|
| `test_get_and_set_generic_setting` | CRUD de clave genérica vía endpoints `/{key}` |
| `test_create_device_preferences_persistence` | Ciclo PUT → GET verifica persistencia real en DB |
| `test_get_all_settings` | `GET /settings` retorna dict con `create_device` |
| `test_create_device_invalid_memory_limit` | `"banana"`, `"2048"`, etc. → `422` |
| `test_create_device_invalid_cpu_limit` | `"999"`, `"two"`, etc. → `422` |
| `test_create_device_valid_memory_formats` | `"512m"`, `"2.5g"`, `"8G"` → `200` |
| `test_get_nonexistent_setting_returns_404` | Clave inexistente → `404` con mensaje |
| `test_get_all_settings_when_table_empty` | `GET /settings` → `dict` aunque esté vacía |

**`tests/host/test_db_persistence.py`** — actualizado para verificar que la versión 5 de migración se aplica correctamente (`assertIn(5, first_run)` y `assertEqual(versions, [1, 2, 3, 4, 5])`).
