#!/usr/bin/env bash
# ==============================================================================
# ProteoMesh - Backup Automatizado y Cifrado de Bundles e Identidades Congeladas
# ==============================================================================
# Empaqueta y cifra perfiles de hardware (profile.json, manifest.json, meta.json)
# de bundles/ e instances/ para almacenamiento seguro, migración y rotación.
# ==============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLES_DIR="${REPO_DIR}/bundles"
INSTANCES_DIR="${REPO_DIR}/instances"
DEFAULT_BACKUP_DIR="${REPO_DIR}/backups/bundles"

# Parámetros por defecto
DEST_DIR="${PROTEOMESH_BACKUP_DEST:-${DEFAULT_BACKUP_DIR}}"
KEEP_COUNT=5
ENCRYPT=1
INCLUDE_DB=1
PASSPHRASE="${PROTEOMESH_BACKUP_PASSPHRASE:-}"
PASS_FILE=""
SPECIFIC_SOURCE=""
ACTION="backup"
TARGET_ARCHIVE=""
RESTORE_DEST=""
QUIET=0

PBKDF2_ITER=100000
CIPHER="aes-256-cbc"

# ── Manejo Limpio de Temporales ───────────────────────────────────────────────
TMP_CLEANUP_DIRS=()
cleanup() {
    for d in "${TMP_CLEANUP_DIRS[@]:-}"; do
        if [ -n "${d}" ] && [ -d "${d}" ]; then
            rm -rf "${d}"
        fi
    done
}
trap cleanup EXIT

# ── Funciones de Utilidad ──────────────────────────────────────────────────────
log_info() {
    if [ "${QUIET}" -eq 0 ]; then
        echo -e "\033[1;34m[*]\033[0m $*"
    fi
}

log_success() {
    if [ "${QUIET}" -eq 0 ]; then
        echo -e "\033[1;32m[+]\033[0m $*"
    fi
}

log_warn() {
    echo -e "\033[1;33m[!]\033[0m $*" >&2
}

log_err() {
    echo -e "\033[1;31m[-]\033[0m $*" >&2
}

usage() {
    cat <<EOF
Uso: $0 [OPCIONES]

Empaquetado, cifrado y rotación de identidades y bundles congelados de ProteoMesh.

Acciones:
  (por defecto)                   Ejecutar backup automático
  --verify <archivo>              Verificar integridad y descifrado de un backup
  --restore <archivo>             Descifrar y restaurar backup en --restore-dest
  --list                          Listar backups existentes en destino

Opciones de Backup:
  --dest <dir>                    Directorio de destino (def: backups/bundles)
  --keep <N>                      Cantidad de backups a retener en rotación (def: 5, 0 desactiva)
  --no-encrypt                    Generar tar.gz sin cifrar (def: cifrado con OpenSSL AES-256)
  --no-db                         Omitir copia atómica de SQLite proteomesh.db
  --source <dir>                  Respaldar sólo un bundle o directorio específico
  --pass <frase>                  Frase de paso para cifrado/descifrado
  --pass-file <archivo>           Archivo con frase de paso
  --restore-dest <dir>            Directorio de destino para --restore (requerido con --restore)
  -q, --quiet                     Modo silencioso (solo errores, apto para cron)
  -h, --help                      Mostrar esta ayuda

Variables de Entorno:
  PROTEOMESH_BACKUP_PASSPHRASE    Frase de paso por defecto para cifrado/descifrado
  PROTEOMESH_BACKUP_DEST          Ruta de destino de backups por defecto
EOF
    exit 0
}

# ── Parseo de Argumentos ──────────────────────────────────────────────────────
while [ $# -gt 0 ]; do
    case "$1" in
        --dest)
            DEST_DIR="$2"
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
        --source)
            SPECIFIC_SOURCE="$2"
            shift 2
            ;;
        --pass)
            PASSPHRASE="$2"
            shift 2
            ;;
        --pass-file)
            PASS_FILE="$2"
            shift 2
            ;;
        --verify)
            ACTION="verify"
            TARGET_ARCHIVE="$2"
            shift 2
            ;;
        --restore)
            ACTION="restore"
            TARGET_ARCHIVE="$2"
            shift 2
            ;;
        --restore-dest)
            RESTORE_DEST="$2"
            shift 2
            ;;
        --list)
            ACTION="list"
            shift 1
            ;;
        -q|--quiet)
            QUIET=1
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

# ── Obtención Segura de Frase de Paso ─────────────────────────────────────────
get_pass_arg() {
    if [ -n "${PASS_FILE}" ]; then
        if [ ! -f "${PASS_FILE}" ]; then
            log_err "Archivo de frase de paso no encontrado: ${PASS_FILE}"
            exit 1
        fi
        echo "file:${PASS_FILE}"
    elif [ -n "${PASSPHRASE}" ]; then
        echo "pass:${PASSPHRASE}"
    else
        # Si no hay frase y se requiere cifrado, intentar prompt si tty, o fallar
        if [ -t 0 ]; then
            read -s -r -p "Ingrese frase de paso de cifrado ProteoMesh: " PASSPHRASE
            echo "" >&2
            if [ -z "${PASSPHRASE}" ]; then
                log_err "Frase de paso no puede ser vacía"
                exit 1
            fi
            echo "pass:${PASSPHRASE}"
        else
            log_err "Cifrado habilitado pero no se proveyó frase de paso (--pass, --pass-file o PROTEOMESH_BACKUP_PASSPHRASE)"
            exit 1
        fi
    fi
}

# ── Acción: LISTAR ────────────────────────────────────────────────────────────
action_list() {
    log_info "Listando backups en: ${DEST_DIR}"
    if [ ! -d "${DEST_DIR}" ]; then
        log_info "El directorio de destino no existe aún."
        exit 0
    fi

    local count=0
    printf "%-40s %-12s %-20s %-10s\n" "ARCHIVO" "TAMAÑO" "FECHA MODIFICACIÓN" "TIPO"
    printf "%s\n" "--------------------------------------------------------------------------------"

    # Leer archivos ordenados por fecha
    while IFS= read -r f; do
        [ -z "$f" ] && continue
        count=$((count + 1))
        local fname
        fname="$(basename "$f")"
        local size
        size="$(du -h "$f" | cut -f1)"
        local mtime
        mtime="$(date -r "$f" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || stat -c "%y" "$f" 2>/dev/null | cut -d'.' -f1)"
        local btype="Plano"
        if [[ "$fname" == *.enc ]]; then
            btype="AES-256"
        fi
        printf "%-40s %-12s %-20s %-10s\n" "$fname" "$size" "$mtime" "$btype"
    done < <(find "${DEST_DIR}" -maxdepth 1 -type f \( -name "proteomesh-bundles-*.tar.gz" -o -name "proteomesh-bundles-*.tar.gz.enc" \) 2>/dev/null | sort -r)

    if [ "$count" -eq 0 ]; then
        log_info "No se encontraron backups de bundles en ${DEST_DIR}."
    else
        log_success "Total de backups encontrados: ${count}"
    fi
    exit 0
}

# ── Acción: VERIFICAR ─────────────────────────────────────────────────────────
action_verify() {
    local target="$1"
    if [ ! -f "${target}" ]; then
        log_err "El archivo de backup no existe: ${target}"
        exit 1
    fi

    log_info "Verificando archivo: ${target}"
    local is_enc=0
    if [[ "${target}" == *.enc ]]; then
        is_enc=1
    fi

    local tmp_dir
    tmp_dir="$(mktemp -d "/tmp/pm-verify-XXXXXX")"
    TMP_CLEANUP_DIRS+=("${tmp_dir}")

    local tar_file="${target}"
    if [ "${is_enc}" -eq 1 ]; then
        local pass_arg
        pass_arg="$(get_pass_arg)"
        log_info "Descifrando en memoria/temporal con ${CIPHER}..."
        tar_file="${tmp_dir}/decrypted.tar.gz"
        if ! openssl enc -d -${CIPHER} -pbkdf2 -iter ${PBKDF2_ITER} -in "${target}" -out "${tar_file}" -pass "${pass_arg}" 2>/dev/null; then
            log_err "Fallo de descifrado: frase de paso incorrecta o archivo dañado."
            exit 1
        fi
    fi

    log_info "Comprobando integridad del archivo tar.gz..."
    if ! tar -tzf "${tar_file}" >/dev/null 2>&1; then
        log_err "El archivo no es un tar.gz válido o está corrupto."
        exit 1
    fi

    local file_count
    file_count="$(tar -tzf "${tar_file}" | wc -l)"
    log_success "Verificación exitosa: archivo íntegro (${file_count} entradas archivadas)."
    exit 0
}

# ── Acción: RESTAURAR ─────────────────────────────────────────────────────────
action_restore() {
    local target="$1"
    local dest="$2"

    if [ ! -f "${target}" ]; then
        log_err "El archivo de backup no existe: ${target}"
        exit 1
    fi
    if [ -z "${dest}" ]; then
        log_err "Se requiere --restore-dest <dir> para restaurar un backup."
        exit 1
    fi

    mkdir -p "${dest}"
    chmod 700 "${dest}"

    log_info "Restaurando backup '${target}' en '${dest}'..."
    local is_enc=0
    if [[ "${target}" == *.enc ]]; then
        is_enc=1
    fi

    local tmp_dir
    tmp_dir="$(mktemp -d "/tmp/pm-restore-XXXXXX")"
    TMP_CLEANUP_DIRS+=("${tmp_dir}")

    local tar_file="${target}"
    if [ "${is_enc}" -eq 1 ]; then
        local pass_arg
        pass_arg="$(get_pass_arg)"
        log_info "Descifrando archivo con ${CIPHER}..."
        tar_file="${tmp_dir}/decrypted.tar.gz"
        if ! openssl enc -d -${CIPHER} -pbkdf2 -iter ${PBKDF2_ITER} -in "${target}" -out "${tar_file}" -pass "${pass_arg}" 2>/dev/null; then
            log_err "Fallo de descifrado: frase de paso incorrecta o archivo dañado."
            exit 1
        fi
    fi

    log_info "Extrayendo contenidos..."
    tar -xzf "${tar_file}" -C "${dest}"

    # Si se extrajo proteomesh.db en dest y existe instances/, sincronizar la ruta estándar
    if [ -f "${dest}/proteomesh.db" ] && [ -d "${dest}/instances" ]; then
        cp -p "${dest}/proteomesh.db" "${dest}/instances/proteomesh.db" 2>/dev/null || true
    fi

    log_success "Restauración completada con éxito en: ${dest}"
    exit 0
}

# ── Acción: BACKUP ────────────────────────────────────────────────────────────
action_backup() {
    mkdir -p "${DEST_DIR}"
    chmod 700 "${DEST_DIR}"

    local timestamp
    timestamp="$(date -u "+%Y%m%d_%H%M%SZ")"
    local base_name="proteomesh-bundles-${timestamp}"
    local stage_dir
    stage_dir="$(mktemp -d "/tmp/pm-backup-stage-XXXXXX")"
    TMP_CLEANUP_DIRS+=("${stage_dir}")

    chmod 700 "${stage_dir}"
    log_info "Iniciando empaquetado de identidades y bundles congelados..."

    local items_copied=0

    # 1. Copiar bundles pre-renderizados si existen
    if [ -n "${SPECIFIC_SOURCE}" ]; then
        if [ ! -d "${SPECIFIC_SOURCE}" ]; then
            log_err "Directorio fuente no existe: ${SPECIFIC_SOURCE}"
            exit 1
        fi
        log_info "Recolectando fuente específica: ${SPECIFIC_SOURCE}"
        mkdir -p "${stage_dir}/source"
        for f in profile.json manifest.json meta.json; do
            if [ -f "${SPECIFIC_SOURCE}/${f}" ]; then
                cp -p "${SPECIFIC_SOURCE}/${f}" "${stage_dir}/source/"
                items_copied=$((items_copied + 1))
            fi
        done
    else
        # Modo normal: buscar en bundles/
        if [ -d "${BUNDLES_DIR}" ]; then
            for bdir in "${BUNDLES_DIR}"/*; do
                if [ -d "${bdir}" ]; then
                    local bname
                    bname="$(basename "${bdir}")"
                    local has_identity=0
                    for f in profile.json manifest.json meta.json; do
                        if [ -f "${bdir}/${f}" ]; then
                            mkdir -p "${stage_dir}/bundles/${bname}"
                            cp -p "${bdir}/${f}" "${stage_dir}/bundles/${bname}/"
                            items_copied=$((items_copied + 1))
                            has_identity=1
                        fi
                    done
                fi
            done
        fi

        # Buscar identidades activas en instances/ (excluyendo particiones /data pesadas)
        if [ -d "${INSTANCES_DIR}" ]; then
            for idir in "${INSTANCES_DIR}"/*; do
                if [ -d "${idir}" ]; then
                    local iname
                    iname="$(basename "${idir}")"
                    for f in profile.json manifest.json meta.json; do
                        if [ -f "${idir}/${f}" ]; then
                            mkdir -p "${stage_dir}/instances/${iname}"
                            cp -p "${idir}/${f}" "${stage_dir}/instances/${iname}/"
                            items_copied=$((items_copied + 1))
                        fi
                    done
                fi
            done
        fi

        # Incluir copia atómica de SQLite proteomesh.db si se solicitó
        if [ "${INCLUDE_DB}" -eq 1 ] && [ -f "${INSTANCES_DIR}/proteomesh.db" ]; then
            log_info "Realizando snapshot atómico de SQLite proteomesh.db..."
            if command -v sqlite3 >/dev/null 2>&1; then
                sqlite3 "${INSTANCES_DIR}/proteomesh.db" ".backup '${stage_dir}/proteomesh.db'"
                items_copied=$((items_copied + 1))
            else
                cp -p "${INSTANCES_DIR}/proteomesh.db" "${stage_dir}/proteomesh.db"
                items_copied=$((items_copied + 1))
            fi
        fi
    fi

    if [ "${items_copied}" -eq 0 ]; then
        log_warn "No se encontraron perfiles o bundles para respaldar en el host."
    else
        log_info "Total de archivos de identidad y configuración archivados: ${items_copied}"
    fi

    # Generar manifest formal del backup
    local manifest_file="${stage_dir}/backup_manifest.json"
    cat <<EOF > "${manifest_file}"
{
  "backup_format": 1,
  "created_at": "${timestamp}",
  "host": "$(hostname 2>/dev/null || echo 'unknown')",
  "items_count": ${items_copied},
  "encrypted": ${ENCRYPT},
  "cipher": "${CIPHER}"
}
EOF

    # Empaquetar tar.gz en directorio temporal separado
    local tar_dir
    tar_dir="$(mktemp -d "/tmp/pm-backup-tar-XXXXXX")"
    TMP_CLEANUP_DIRS+=("${tar_dir}")
    local temp_tar="${tar_dir}/${base_name}.tar.gz"
    tar -czf "${temp_tar}" -C "${stage_dir}" .

    local final_file
    if [ "${ENCRYPT}" -eq 1 ]; then
        final_file="${DEST_DIR}/${base_name}.tar.gz.enc"
        local pass_arg
        pass_arg="$(get_pass_arg)"
        log_info "Cifrando paquete con OpenSSL ${CIPHER} (PBKDF2 iter=${PBKDF2_ITER})..."
        openssl enc -${CIPHER} -pbkdf2 -iter ${PBKDF2_ITER} -salt -in "${temp_tar}" -out "${final_file}" -pass "${pass_arg}"
    else
        final_file="${DEST_DIR}/${base_name}.tar.gz"
        cp -p "${temp_tar}" "${final_file}"
    fi

    # Asegurar permisos estrictos en el archivo generado
    chmod 600 "${final_file}"
    local final_size
    final_size="$(du -h "${final_file}" | cut -f1)"
    log_success "Backup generado exitosamente:"
    log_success " -> Archivo: ${final_file} (${final_size})"

    # Rotación automática
    if [ "${KEEP_COUNT}" -gt 0 ]; then
        rotate_backups
    fi
}

# ── Rotación de Backups ───────────────────────────────────────────────────────
rotate_backups() {
    log_info "Comprobando política de retención (conservar últimos ${KEEP_COUNT} backups)..."
    local files=()
    while IFS= read -r f; do
        [ -n "$f" ] && files+=("$f")
    done < <(find "${DEST_DIR}" -maxdepth 1 -type f \( -name "proteomesh-bundles-*.tar.gz" -o -name "proteomesh-bundles-*.tar.gz.enc" \) 2>/dev/null | sort -r)

    local total="${#files[@]}"
    if [ "${total}" -gt "${KEEP_COUNT}" ]; then
        local to_delete=$((total - KEEP_COUNT))
        log_info "Rotando: ${to_delete} backups antiguos serán depurados."
        for (( i=KEEP_COUNT; i<total; i++ )); do
            local old_file="${files[$i]}"
            log_info "Eliminando backup antiguo: $(basename "${old_file}")"
            rm -f "${old_file}"
        done
        log_success "Rotación completada. Se conservan ${KEEP_COUNT} backups."
    else
        log_info "No se requiere rotación (${total}/${KEEP_COUNT} backups en disco)."
    fi
}

# ── Ejecución de la Acción Seleccionada ───────────────────────────────────────
case "${ACTION}" in
    list)
        action_list
        ;;
    verify)
        action_verify "${TARGET_ARCHIVE}"
        ;;
    restore)
        action_restore "${TARGET_ARCHIVE}" "${RESTORE_DEST}"
        ;;
    backup)
        action_backup
        ;;
esac
