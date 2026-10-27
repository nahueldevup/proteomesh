#!/usr/bin/env bash
# Túnel SSH SOCKS5 supervisado (dynamic forwarding -D) para el transporte socks5 de ProteoMesh.
#
# Además del proxy SOCKS5 (TCP), publica un puente DNS que convierte las consultas
# UDP de Android en DNS-over-TCP a través del mismo servidor SSH. Sin esto, `ssh -D`
# no puede resolver dominios (SOCKS5 de OpenSSH no soporta UDP ASSOCIATE).
#
# Un supervisor vigila SOCKS, SSH y el puente DNS, y relanza lo que caiga.
# Credenciales desde $SSH_PASS_FILE (600) o $SSH_PASS; nunca se escriben en el repo.
#
# Uso:
#   bash tools/network/start_ssh_tunnel.sh start
#   bash tools/network/start_ssh_tunnel.sh stop
#   bash tools/network/start_ssh_tunnel.sh status

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSH_USER="${SSH_USER:-nahuel-vpnjantit.com}"
SSH_HOST="${SSH_HOST:-ar2.vpnjantit.com}"
SSH_PORT="${SSH_PORT:-22}"
LOCAL_PORT="${LOCAL_PORT:-1088}"
PASS_FILE="${SSH_PASS_FILE:-$HOME/.config/proteomesh/ssh_tunnel.pass}"

# DNS: 127.0.0.1:DNS_FWD_PORT (SSH -L hacia 8.8.8.8:53) y puente UDP/TCP en DNS_BRIDGE_PORT
DNS_FWD_PORT="${DNS_FWD_PORT:-$((LOCAL_PORT + 5000))}"
DNS_BRIDGE_PORT="${DNS_BRIDGE_PORT:-$((LOCAL_PORT + 6000))}"

STATE_DIR="${XDG_RUNTIME_DIR:-/tmp}/proteomesh-tunnel-${LOCAL_PORT}"
SUP_PID_FILE="$STATE_DIR/supervisor.pid"
SSH_PID_FILE="$STATE_DIR/ssh.pid"
BRIDGE_PID_FILE="$STATE_DIR/bridge.pid"
LOG_FILE="$STATE_DIR/tunnel.log"
ASKPASS="$STATE_DIR/askpass.sh"
KNOWN_HOSTS="$STATE_DIR/known_hosts"
REGISTRY_DIR="$HOME/.config/proteomesh/dns_bridges"
REGISTRY_FILE="$REGISTRY_DIR/$LOCAL_PORT"

log() { echo "[$(date '+%H:%M:%S')] $*" >> "$LOG_FILE"; }

port_listening() {
  (exec 3<>"/dev/tcp/127.0.0.1/${LOCAL_PORT}") 2>/dev/null
}

pid_alive() {
  [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null
}

read_pid() {
  [ -f "$1" ] && cat "$1" 2>/dev/null || true
}

load_password() {
  if [ -n "${SSH_PASS:-}" ]; then
    PM_SSH_PASS="$SSH_PASS"
  elif [ -f "$PASS_FILE" ]; then
    PM_SSH_PASS="$(cat "$PASS_FILE")"
  else
    echo "[!] Falta la contraseña: crear $PASS_FILE (chmod 600) o exportar SSH_PASS." >&2
    return 1
  fi
  export PM_SSH_PASS
}

prepare_state() {
  mkdir -p "$STATE_DIR" "$REGISTRY_DIR"
  chmod 700 "$STATE_DIR"
  cat > "$ASKPASS" <<'EOF'
#!/bin/sh
printf '%s' "$PM_SSH_PASS"
EOF
  chmod 700 "$ASKPASS"
}

kill_pidfile() {
  local file="$1" pid
  pid="$(read_pid "$file")"
  if pid_alive "$pid"; then
    kill "$pid" 2>/dev/null || true
    sleep 0.5
    pid_alive "$pid" && kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$file"
}

kill_ssh() { kill_pidfile "$SSH_PID_FILE"; }

start_bridge() {
  kill_pidfile "$BRIDGE_PID_FILE"
  python3 "$SCRIPT_DIR/dns_bridge.py" \
    --listen-host 172.17.0.1 --listen-port "$DNS_BRIDGE_PORT" \
    --upstream-host 127.0.0.1 --upstream-port "$DNS_FWD_PORT" \
    >> "$LOG_FILE" 2>&1 &
  echo $! > "$BRIDGE_PID_FILE"
  printf '%s' "$DNS_BRIDGE_PORT" > "$REGISTRY_FILE"
  log "puente DNS activo en 172.17.0.1:${DNS_BRIDGE_PORT} -> 127.0.0.1:${DNS_FWD_PORT}"
}

kill_bridge() {
  kill_pidfile "$BRIDGE_PID_FILE"
  rm -f "$REGISTRY_FILE"
}

start_ssh() {
  PM_SSH_PASS="$PM_SSH_PASS" SSH_ASKPASS="$ASKPASS" SSH_ASKPASS_REQUIRE=force DISPLAY=dummy \
    ssh -N -D "172.17.0.1:${LOCAL_PORT}" \
      -L "127.0.0.1:${DNS_FWD_PORT}:8.8.8.8:53" \
      -o ExitOnForwardFailure=yes \
      -o StrictHostKeyChecking=accept-new \
      -o UserKnownHostsFile="$KNOWN_HOSTS" \
      -o ServerAliveInterval=15 \
      -o ServerAliveCountMax=3 \
      -o ConnectTimeout=15 \
      -p "$SSH_PORT" "${SSH_USER}@${SSH_HOST}" >> "$LOG_FILE" 2>&1 &
  echo $! > "$SSH_PID_FILE"
}

supervise() {
  # Corre en segundo plano. Solo sale por SIGTERM (stop).
  trap 'kill_ssh; kill_bridge; rm -f "$SUP_PID_FILE"; exit 0' TERM INT
  load_password || exit 1
  local backoff=2
  log "supervisor iniciado (socks ${LOCAL_PORT}, dns ${DNS_BRIDGE_PORT} -> ${SSH_USER}@${SSH_HOST}:${SSH_PORT})"
  start_bridge
  while true; do
    local ssh_pid bridge_pid
    ssh_pid="$(read_pid "$SSH_PID_FILE")"
    bridge_pid="$(read_pid "$BRIDGE_PID_FILE")"

    if ! pid_alive "$bridge_pid"; then
      log "puente DNS caído: reiniciando"
      start_bridge
    fi

    if ! pid_alive "$ssh_pid" || ! port_listening; then
      kill_ssh
      log "túnel caído o no escucha: reconectando"
      start_ssh
      sleep 5
      if port_listening; then
        log "túnel ACTIVO (PID $(read_pid "$SSH_PID_FILE"))"
        backoff=2
      else
        log "falló la conexión; reintento en ${backoff}s"
        sleep "$backoff"
        backoff=$(( backoff * 2 > 60 ? 60 : backoff * 2 ))
        continue
      fi
    fi
    sleep 5
  done
}

cmd_start() {
  if [ -f "$SUP_PID_FILE" ] && pid_alive "$(read_pid "$SUP_PID_FILE")"; then
    echo "[✓] El supervisor ya está corriendo (PID $(read_pid "$SUP_PID_FILE")). Estado:"
    cmd_status
    return 0
  fi
  load_password || exit 1
  prepare_state
  # Limpiar túneles/puentes huérfanos de ESTE puerto
  pkill -f "ssh -N -D 0.0.0.0:${LOCAL_PORT}" 2>/dev/null || true
  pkill -f "dns_bridge.py .*--listen-port ${DNS_BRIDGE_PORT}" 2>/dev/null || true
  sleep 0.5
  setsid bash "$0" _supervise >/dev/null 2>&1 < /dev/null &
  echo $! > "$SUP_PID_FILE"
  echo "[*] Supervisor lanzado. Esperando conexión..."
  for _ in $(seq 1 20); do
    sleep 1
    if port_listening; then
      echo "[✓] Túnel SOCKS5 ACTIVO en 0.0.0.0:${LOCAL_PORT}."
      echo "[✓] DNS-over-TCP ACTIVO en 0.0.0.0:${DNS_BRIDGE_PORT} (egress por el túnel)."
      echo "[✓] Usar en ProteoMesh: socks5://172.17.0.1:${LOCAL_PORT}"
      echo "[i] Log: $LOG_FILE"
      return 0
    fi
  done
  echo "[!] El túnel no respondió en 20s. Revisar: $LOG_FILE"
  return 1
}

cmd_stop() {
  local sup
  sup="$(read_pid "$SUP_PID_FILE")"
  if pid_alive "$sup"; then
    kill "$sup" 2>/dev/null || true
    sleep 1
  fi
  kill_ssh
  kill_bridge
  pkill -f "ssh -N -D 0.0.0.0:${LOCAL_PORT}" 2>/dev/null || true
  pkill -f "dns_bridge.py .*--listen-port ${DNS_BRIDGE_PORT}" 2>/dev/null || true
  rm -f "$SUP_PID_FILE" "$ASKPASS"
  echo "[✓] Túnel, puente DNS y supervisor detenidos."
}

cmd_status() {
  local sup ssh bridge
  sup="$(read_pid "$SUP_PID_FILE")"
  ssh="$(read_pid "$SSH_PID_FILE")"
  bridge="$(read_pid "$BRIDGE_PID_FILE")"
  if pid_alive "$sup"; then echo "supervisor: activo (PID $sup)"; else echo "supervisor: detenido"; fi
  if pid_alive "$ssh"; then echo "ssh:        activo (PID $ssh)"; else echo "ssh:        inactivo"; fi
  if pid_alive "$bridge"; then echo "dns bridge: activo (PID $bridge, udp/tcp ${DNS_BRIDGE_PORT})"; else echo "dns bridge: inactivo"; fi
  if port_listening; then echo "puerto ${LOCAL_PORT}: escuchando"; else echo "puerto ${LOCAL_PORT}: cerrado"; fi
  echo "log: $LOG_FILE"
}

case "${1:-status}" in
  start)      cmd_start ;;
  stop)       cmd_stop ;;
  status)     cmd_status ;;
  _supervise) supervise ;;
  *) echo "Uso: $0 {start|stop|status}"; exit 1 ;;
esac
