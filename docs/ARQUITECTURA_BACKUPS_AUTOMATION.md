# Arquitectura de Respaldo y Automatización de Identidades — ProteoMesh

## 1. Visión General y Motivación

En una granja de virtualización móvil como ProteoMesh, las identidades de hardware de cada contenedor (IMEI, MEID, número de serie, MAC de Wi-Fi/Bluetooth, DRM Device ID, Android ID) y la base de datos de estado (`proteomesh.db`) representan los activos operativos más críticos:
- **Determinismo y persistencia:** La identidad asignada a cada contenedor debe ser recuperable ante caídas de hardware, migraciones de servidor o desastres en disco.
- **Seguridad y confidencialidad:** Las identidades y credenciales de red no deben almacenarse en texto plano sin protección en entornos de producción.
- **Automatización de impacto cero:** El resguardo debe ejecutarse de forma desatendida, periódica (diaria/semanal) y con cero consumo de recursos en reposo, garantizando al mismo tiempo la no saturación del almacenamiento mediante políticas de retención y rotación activa.

---

## 2. Componentes del Subsistema de Backups

El subsistema se divide en 4 capas desacopladas:

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Web (React)                     │
│  - Tab de Respaldos e Identidades (BackupsManager.tsx)      │
│  - Banner de Automatización en vivo (Systemd User Timer)    │
│  - Modales: Programación, Creación, Verificación y Restore  │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP REST
┌──────────────────────────────▼──────────────────────────────┐
│                    Backend API (FastAPI)                    │
│  - server/routes/backups.py                                 │
│  - Validaciones de seguridad Path Traversal (Regex estricto)│
│  - Endpoints de CRUD, streaming de descarga y scheduling    │
└──────────────────────────────┬──────────────────────────────┘
                               │ CLI Execution
┌──────────────────────────────▼──────────────────────────────┐
│                  Scripts Core de Automatización             │
│  - tools/backup_bundles.sh: Empaquetado, snapshot, cifrado  │
│  - tools/setup_backup_schedule.sh: Orquestador systemd/cron │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                  Host OS & Storage Layer                    │
│  - systemd --user (proteomesh-backup.timer & .service)      │
│  - SQLite online backup API (.backup / VACUUM INTO)         │
│  - OpenSSL AES-256-CBC con PBKDF2                           │
│  - Almacenamiento rotativo en backups/bundles/              │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Empaquetado y Cifrado Criptográfico (`tools/backup_bundles.sh`)

### 3.1. Snapshot Atómico de SQLite
Para prevenir corrupción o estados inconsistentes de base de datos mientras el backend FastAPI o instancias en ejecución están escribiendo en modo WAL (`proteomesh.db-wal`), el script utiliza la utilidad oficial `sqlite3 <db> ".backup <dest>"`:
- Realiza una copia de seguridad segura a nivel de páginas SQLite sin bloquear lecturas ni escrituras concurrentes.
- Si `sqlite3` no estuviera disponible, efectúa una sincronización forzada de los tres archivos de base de datos (`.db`, `.db-wal` y `.db-shm`).

### 3.2. Cifrado Simétrico AES-256-CBC con PBKDF2
Cuando el cifrado está habilitado (comportamiento predeterminado):
```bash
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 -pass "pass:<PASSPHRASE>" -in <TAR_GZ> -out <TAR_GZ_ENC>
```
- **Derivación de clave:** PBKDF2 con 100.000 iteraciones y sal criptográfica de 16 bytes generada al vuelo.
- **Integridad:** Las pruebas de verificación y descifrado autentican que la clave provista sea correcta y que el archivo no haya sufrido truncamiento.
- **Permisos de archivo:** El archivo resultante se asegura con permisos `600` (solo lectura/escritura por el usuario propietario).

### 3.3. Política de Retención y Rotación Automática
El parámetro `--keep <N>` (por defecto 5) evalúa los archivos de respaldo existentes ordenados por fecha de creación:
- Solo retiene los `$KEEP_COUNT` más recientes.
- Elimina silenciosa y limpiamente los archivos obsoletos que superen el cupo para evitar el agotamiento de espacio en disco del host.

---

## 4. Temporizador Nativo del Sistema Operativo (`tools/setup_backup_schedule.sh`)

Para evitar daemonizar procesos pesados en Node.js, Python o Docker en espera continua, ProteoMesh utiliza los **temporizadores de usuario de systemd** (`systemd --user`):

### 4.1. Ventajas sobre daemons convencionales
1. **Consumo de recursos cero:** Mientras el temporizador espera, el consumo de CPU es del 0% y el de memoria RAM es de 0 MB (el kernel de Linux maneja el temporizador en su tabla de eventos de temporización estándar).
2. **Ciclo de vida efímero:** Al llegar la hora exacta (`OnCalendar`), systemd instancia el servicio `proteomesh-backup.service`, ejecuta el script durante ~2 segundos, realiza el snapshot y se apaga inmediatamente.
3. **Persistencia entre reinicios:** La regla `Persistent=true` asegura que si el equipo estuvo apagado a la hora programada, el respaldo se ejecute automáticamente ni bien el sistema arranque.
4. **Almacenamiento seguro de llaves:** La clave de cifrado desatendido se resguarda en `~/.config/proteomesh/backup.key` con permisos de acceso restringidos (`chmod 600`).
5. **Fallback transparente a Cron:** Si el entorno no soporta systemd de usuario (por ejemplo, contenedores Docker sin systemd init), el script detecta automáticamente la ausencia de `systemctl` y configura una entrada equivalente en `crontab`.

### 4.2. Unidades Systemd Generadas
- **Timer (`~/.config/systemd/user/proteomesh-backup.timer`):**
  ```ini
  [Unit]
  Description=Trigger ProteoMesh Automated Bundles & Hardware Backup
  
  [Timer]
  OnCalendar=*-*-* 03:00:00
  Persistent=true
  
  [Install]
  WantedBy=timers.target
  ```
- **Service (`~/.config/systemd/user/proteomesh-backup.service`):**
  ```ini
  [Unit]
  Description=ProteoMesh Automated Backup of Bundles & Hardware Identities
  
  [Service]
  Type=oneshot
  WorkingDirectory=/path/to/redroid-integrity-lab
  ExecStart=/path/to/redroid-integrity-lab/tools/backup_bundles.sh --keep 5 ...
  ```

---

## 5. Endpoints de la API REST (`server/routes/backups.py`)

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/api/v1/backups` | Lista los respaldos existentes con metadatos (tamaño, fecha, cifrado, hash). |
| `POST` | `/api/v1/backups` | Genera un respaldo manual inmediato bajo demanda. |
| `GET` | `/api/v1/backups/{filename}/download` | Descarga el archivo `tar.gz` o `tar.gz.enc` directamente al cliente. |
| `DELETE` | `/api/v1/backups/{filename}` | Elimina de forma segura un respaldo de disco. |
| `POST` | `/api/v1/backups/verify` | Valida la integridad del archivo y descifra en memoria para comprobar la contraseña. |
| `POST` | `/api/v1/backups/restore` | Restaura identidades y base de datos con validaciones de sobreescritura. |
| `GET` | `/api/v1/backups/schedule` | Devuelve el estado actual de la automatización (`active`, `next_run`, `last_run`, etc.). |
| `POST` | `/api/v1/backups/schedule` | Activa, reconfigura o deshabilita el timer en systemd. |
| `POST` | `/api/v1/backups/schedule/trigger` | Fuerza la ejecución inmediata del servicio systemd para verificación técnica. |

### 5.1. Seguridad contra Path Traversal
Todos los endpoints que reciben `filename` lo validan contra una expresión regular estricta:
`^proteomesh-bundles-[a-zA-Z0-9_.-]+\.tar\.gz(\.enc)?$`
Cualquier intento de inyectar rutas relativas (`../`), caracteres especiales o ejecutables extraños es rechazado de inmediato con `HTTP 400 Bad Request`.

---

## 6. Verificación y Suite de Tests

El subsistema cuenta con cobertura automatizada en `pytest`:
1. `tests/host/test_backup_bundles.py`:
   - Ayuda y opciones del CLI.
   - Creación de backup sin cifrar.
   - Creación de backup cifrado y verificación con clave correcta e incorrecta.
   - Integridad y restauración cruzada.
   - Política de rotación de copias obsoletas.
2. `tests/host/test_backup_schedule.py`:
   - Configuración de temporizadores diarios y semanales.
   - Validación de sintaxis de horas.
   - Consultas de estado en formato estándar y JSON.
3. `tests/host/test_api_backups.py`:
   - Flujo integral de endpoints API: listado, creación, verificación, descarga y eliminación.
   - Bloqueo contra Path Traversal.
   - Configuración, consulta y disparo de timer a través de la API.
