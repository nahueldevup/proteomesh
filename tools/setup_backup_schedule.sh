#!/usr/bin/env bash
# ==============================================================================
# ProteoMesh - Programador de Backups Automatizados (Systemd Timer / Cron)
# ==============================================================================
# Configura y gestiona la ejecución desatendida y periódica de
# tools/backup_bundles.sh mediante unidades de usuario systemd o cron.
# ==============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_SCRIPT="${REPO_DIR}/tools/backup_bundles.sh"
CONFIG_DIR="${HOME}/.config/proteomesh"
SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"
PASS_KEY_FILE="${CONFIG_DIR}/backup.key"

SERVICE_NAME="proteomesh-backup.service"
TIMER_NAME="proteomesh-backup.timer"
SERVICE_PATH="${SYSTEMD_USER_DIR}/${SERVICE_NAME}"
TIMER_PATH="${SYSTEMD_USER_DIR}/${TIMER_NAME}"

# Colores de salida
COLOR_CYAN="\033[1;36m"
COLOR_GREEN="\033[1;32m"
COLOR_YELLOW="\033[1;33m"
COLOR_RED="\033[1;31m"
COLOR_RESET="\033[0m"

log_info() {
    echo -e "${COLOR_CYAN}[*]${COLOR_RESET} $*"
}

log_success() {
    echo -e "${COLOR_GREEN}[✓]${COLOR_RESET} $*"
}

log_warn() {
    echo -e "${COLOR_YELLOW}[!]${COLOR_RESET} $*"
}

log_err() {
    echo -e "${COLOR_RED}[✗]${COLOR_RESET} $*" >&2
}

usage() {
    cat <<EOF
Uso: $(basename "$0") [ACCION] [OPCIONES]

Acciones Principales:
  --enable                Configura y activa la tarea programada
  --disable               Detiene y deshabilita la tarea programada
  --status                Muestra el estado actual del timer, próxima ejecución y logs
  --trigger-now           Ejecuta de inmediato el respaldo programado para probarlo

Opciones de Programación:
  --daily                 Ejecuta todos los días (predeterminado)
  --weekly                Ejecuta semanalmente (cada lunes)
  --time "HH:MM"          Hora de ejecución en formato 24h (predeterminado: 03:00)
  --calendar "SPEC"       Expresión OnCalendar de systemd personalizada

Opciones de Respaldo:
  --keep <N>              Número de copias a retener en rotación (predeterminado: 5)
  --no-encrypt            Genera copias sin cifrar (.tar.gz)
  --no-db                 Excluye el snapshot atómico de proteomesh.db
  --pass-file <ruta>      Ruta a un archivo existente con la contraseña de cifrado
  --save-pass "<pass>"    Guarda la contraseña de forma segura en ~/.config/proteomesh/backup.key
  --cron                  Usa crontab en lugar de systemd user timer (si está disponible)

Ejemplos:
  $(basename "$0") --status
  $(basename "$0") --enable --daily --time "03:30" --keep 7
  $(basename "$0") --enable --daily --save-pass "MiClaveSuperSegura" --keep 5
  $(basename "$0") --enable --weekly --no-encrypt
  $(basename "$0") --trigger-now
  $(basename "$0") --disable
EOF
    exit 0
}

# Parámetros de configuración
ACTION=""
FREQUENCY="daily"
SCHEDULE_TIME="03:00"
CUSTOM_CALENDAR=""
KEEP_COUNT=5
ENCRYPT=1
INCLUDE_DB=1
PASS_FILE=""
NEW_PASSPHRASE=""
USE_CRON=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --enable)
            ACTION="enable"
            shift 1
            ;;
        --disable)
            ACTION="disable"
            shift 1
            ;;
        --status)
            ACTION="status"
            shift 1
            ;;
        --trigger-now|--test)
            ACTION="trigger"
            shift 1
            ;;
        --daily)
            FREQUENCY="daily"
            shift 1
            ;;
        --weekly)
            FREQUENCY="weekly"
            shift 1
            ;;
        --time)
            SCHEDULE_TIME="$2"
            shift 2
            ;;
        --calendar)
            CUSTOM_CALENDAR="$2"
            shift 2
            ;;
        --keep)
            KEEP_COUNT="$2"
            shift 2
            ;;
        --no-encrypt)
            ENCRYPT=0
            shift 1
            ;;
        --no-db)
            INCLUDE_DB=0
            shift 1
            ;;
        --pass-file)
            PASS_FILE="$2"
            shift 2
            ;;
        --save-pass)
            NEW_PASSPHRASE="$2"
            shift 2
            ;;
        --cron)
            USE_CRON=1
            shift 1
            ;;
        -h|--help)
            usage
            ;;
        *)
            log_err "Opción no reconocida: $1"
            usage
            ;;
    esac
done

if [ -z "${ACTION}" ]; then
    ACTION="status"
fi

# Validar formato de hora HH:MM si no es personalizada
if [ -z "${CUSTOM_CALENDAR}" ]; then
    if ! [[ "${SCHEDULE_TIME}" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]]; then
        log_err "Hora inválida '${SCHEDULE_TIME}'. Debe tener formato 24h HH:MM (ej. 03:00, 22:30)."
        exit 1
    fi
fi

# Determinar expresión OnCalendar para systemd
get_calendar_spec() {
    if [ -n "${CUSTOM_CALENDAR}" ]; then
        echo "${CUSTOM_CALENDAR}"
        return
    fi

    local hour="${SCHEDULE_TIME%%:*}"
    local minute="${SCHEDULE_TIME##*:}"

    if [ "${FREQUENCY}" = "weekly" ]; then
        echo "Mon *-*-* ${hour}:${minute}:00"
    else
        echo "*-*-* ${hour}:${minute}:00"
    fi
}

# ── Acción: STATUS ────────────────────────────────────────────────────────────
action_status() {
    echo "================================================================================"
    echo "       ⏰ ESTADO DE PROGRAMACIÓN DE RESPALDOS DE PROTEOMESH"
    echo "================================================================================"

    local systemd_active=0
    if command -v systemctl >/dev/null 2>&1; then
        if systemctl --user is-active --quiet "${TIMER_NAME}" 2>/dev/null; then
            systemd_active=1
        fi
    fi

    if [ "${systemd_active}" -eq 1 ]; then
        log_success "Systemd User Timer: ACTIVO Y EN EJECUCIÓN (${TIMER_NAME})"
        echo ""
        systemctl --user list-timers "${TIMER_NAME}" --no-pager 2>/dev/null || true
        echo ""
        log_info "Configuración de la unidad:"
        echo "  • Archivo Timer   : ${TIMER_PATH}"
        echo "  • Archivo Service : ${SERVICE_PATH}"
        if [ -f "${TIMER_PATH}" ]; then
            local cal
            cal="$(grep -E "^OnCalendar=" "${TIMER_PATH}" | cut -d'=' -f2- || echo 'N/A')"
            echo "  • Regla OnCalendar: ${cal}"
        fi
        echo ""
        log_info "Últimos registros de ejecución (journalctl):"
        journalctl --user -u "${SERVICE_NAME}" -n 5 --no-pager 2>/dev/null || echo "  (Sin registros previos)"
    else
        log_warn "Systemd User Timer: INACTIVO / NO CONFIGURADO"
        if [ -f "${TIMER_PATH}" ]; then
            echo "  (La unidad existe en ${TIMER_PATH} pero no está activa)."
        fi
    fi

    # Comprobar crontab si existe
    if command -v crontab >/dev/null 2>&1; then
        local cron_entry
        cron_entry="$(crontab -l 2>/dev/null | grep "proteomesh.*backup_bundles.sh" || true)"
        if [ -n "${cron_entry}" ]; then
            echo ""
            log_success "Crontab: Entrada detectada"
            echo "  ${cron_entry}"
        fi
    fi

    echo "================================================================================"
}

# ── Acción: DISABLE ───────────────────────────────────────────────────────────
action_disable() {
    log_info "Desactivando automatización de respaldos de ProteoMesh..."

    if command -v systemctl >/dev/null 2>&1; then
        if systemctl --user is-enabled --quiet "${TIMER_NAME}" 2>/dev/null || systemctl --user is-active --quiet "${TIMER_NAME}" 2>/dev/null; then
            systemctl --user stop "${TIMER_NAME}" 2>/dev/null || true
            systemctl --user disable "${TIMER_NAME}" 2>/dev/null || true
            log_success "Timer systemd '${TIMER_NAME}' detenido y deshabilitado."
        fi
    fi

    if [ -f "${TIMER_PATH}" ]; then
        rm -f "${TIMER_PATH}"
    fi
    if [ -f "${SERVICE_PATH}" ]; then
        rm -f "${SERVICE_PATH}"
    fi

    if command -v systemctl >/dev/null 2>&1; then
        systemctl --user daemon-reload 2>/dev/null || true
    fi

    # Eliminar de cron si existe
    if command -v crontab >/dev/null 2>&1; then
        local current_cron
        current_cron="$(crontab -l 2>/dev/null || true)"
        if echo "${current_cron}" | grep -q "backup_bundles.sh"; then
            echo "${current_cron}" | grep -v "backup_bundles.sh" | crontab - 2>/dev/null || true
            log_success "Línea de respaldo eliminada de crontab."
        fi
    fi

    log_success "Automatización de respaldos deshabilitada exitosamente."
}

# ── Acción: TRIGGER (Test inmediato) ──────────────────────────────────────────
action_trigger() {
    log_info "Ejecutando respaldo inmediato para prueba..."
    if command -v systemctl >/dev/null 2>&1 && [ -f "${SERVICE_PATH}" ]; then
        log_info "Iniciando servicio de usuario '${SERVICE_NAME}'..."
        systemctl --user start "${SERVICE_NAME}"
        log_success "Servicio ejecutado con éxito. Registro de ejecución:"
        echo ""
        journalctl --user -u "${SERVICE_NAME}" -n 12 --no-pager
    else
        log_info "Ejecutando script directamente..."
        "${BACKUP_SCRIPT}" --keep "${KEEP_COUNT}"
    fi
}

# ── Acción: ENABLE ────────────────────────────────────────────────────────────
action_enable() {
    # Validar que backup_bundles.sh existe y es ejecutable
    if [ ! -x "${BACKUP_SCRIPT}" ]; then
        chmod +x "${BACKUP_SCRIPT}"
    fi

    # Si se pasó --save-pass, guardar en archivo seguro
    if [ -n "${NEW_PASSPHRASE}" ]; then
        mkdir -p "${CONFIG_DIR}"
        chmod 700 "${CONFIG_DIR}"
        printf "%s" "${NEW_PASSPHRASE}" > "${PASS_KEY_FILE}"
        chmod 600 "${PASS_KEY_FILE}"
        PASS_FILE="${PASS_KEY_FILE}"
        log_success "Frase de paso guardada con permisos 600 en: ${PASS_KEY_FILE}"
    fi

    # Si se requiere cifrado pero no hay pass_file, verificar si ya existe la llave guardada
    if [ "${ENCRYPT}" -eq 1 ] && [ -z "${PASS_FILE}" ]; then
        if [ -f "${PASS_KEY_FILE}" ]; then
            PASS_FILE="${PASS_KEY_FILE}"
            log_info "Usando llave de cifrado existente: ${PASS_KEY_FILE}"
        else
            log_warn "Cifrado activado pero no se indicó --pass-file ni --save-pass."
            log_warn "Para automatización desatendida, podés guardar una frase con: --save-pass 'tu_clave'"
            log_warn "O generar respaldos planos usando: --no-encrypt"
            echo -n "¿Deseas ingresar una frase de paso para guardarla ahora? (s/N): "
            read -r resp || resp="n"
            if [[ "${resp}" =~ ^[sSyY]$ ]]; then
                echo -n "Introduce la frase de paso segura: "
                read -rs input_pass
                echo ""
                mkdir -p "${CONFIG_DIR}"
                chmod 700 "${CONFIG_DIR}"
                printf "%s" "${input_pass}" > "${PASS_KEY_FILE}"
                chmod 600 "${PASS_KEY_FILE}"
                PASS_FILE="${PASS_KEY_FILE}"
                log_success "Llave almacenada de forma segura en: ${PASS_KEY_FILE}"
            else
                log_info "Continuando con respaldos sin cifrar (.tar.gz plano)..."
                ENCRYPT=0
            fi
        fi
    fi

    # Construir argumentos para el script de respaldo
    local script_args=()
    script_args+=("--keep" "${KEEP_COUNT}")
    if [ "${ENCRYPT}" -eq 0 ]; then
        script_args+=("--no-encrypt")
    elif [ -n "${PASS_FILE}" ]; then
        script_args+=("--pass-file" "${PASS_FILE}")
    fi

    if [ "${INCLUDE_DB}" -eq 0 ]; then
        script_args+=("--no-db")
    fi

    local exec_cmd="${BACKUP_SCRIPT} ${script_args[*]}"

    # Si se solicitó cron o si no existe systemctl
    if [ "${USE_CRON}" -eq 1 ] || ! command -v systemctl >/dev/null 2>&1; then
        if ! command -v crontab >/dev/null 2>&1; then
            log_err "Ni systemctl ni crontab están disponibles en este sistema."
            exit 1
        fi

        local cron_hour="${SCHEDULE_TIME%%:*}"
        local cron_min="${SCHEDULE_TIME##*:}"
        local cron_expr="${cron_min} ${cron_hour} * * *"
        if [ "${FREQUENCY}" = "weekly" ]; then
            cron_expr="${cron_min} ${cron_hour} * * 1"
        fi

        local cron_line="${cron_expr} ${exec_cmd} >/dev/null 2>&1 # proteomesh-backup"
        local existing
        existing="$(crontab -l 2>/dev/null | grep -v "proteomesh-backup" || true)"
        printf "%s\n%s\n" "${existing}" "${cron_line}" | crontab -
        log_success "Tarea agregada a crontab: ${cron_line}"
        exit 0
    fi

    # ── Configuración con SYSTEMD USER UNITS ──────────────────────────────────
    mkdir -p "${SYSTEMD_USER_DIR}"

    local calendar_spec
    calendar_spec="$(get_calendar_spec)"

    log_info "Creando unidad de servicio: ${SERVICE_PATH}..."
    cat <<EOF > "${SERVICE_PATH}"
[Unit]
Description=ProteoMesh Automated Backup of Bundles & Hardware Identities
Documentation=https://github.com/proteomesh/redroid-integrity-lab
After=local-fs.target

[Service]
Type=oneshot
WorkingDirectory=${REPO_DIR}
ExecStart=${exec_cmd}
StandardOutput=journal
StandardError=journal
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=6
EOF

    log_info "Creando unidad de temporizador: ${TIMER_PATH}..."
    cat <<EOF > "${TIMER_PATH}"
[Unit]
Description=ProteoMesh Automated Backup Timer (${FREQUENCY})
Documentation=https://github.com/proteomesh/redroid-integrity-lab

[Timer]
OnCalendar=${calendar_spec}
Persistent=true
RandomizedDelaySec=120

[Install]
WantedBy=timers.target
EOF

    log_info "Recargando demonio de usuario de systemd..."
    systemctl --user daemon-reload

    log_info "Habilitando y arrancando temporizador '${TIMER_NAME}'..."
    systemctl --user enable --now "${TIMER_NAME}"

    log_success "¡Programación activada exitosamente!"
    echo ""
    systemctl --user list-timers "${TIMER_NAME}" --no-pager
    echo ""
    log_info "Para comprobar el estado en cualquier momento: $(basename "$0") --status"
    log_info "Para probar la ejecución ahora mismo         : $(basename "$0") --trigger-now"
    log_info "Para desactivarlo                           : $(basename "$0") --disable"
}

# Despachar acción
case "${ACTION}" in
    enable)
        action_enable
        ;;
    disable)
        action_disable
        ;;
    status)
        action_status
        ;;
    trigger)
        action_trigger
        ;;
esac
