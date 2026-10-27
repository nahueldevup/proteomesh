#!/usr/bin/env bash
# Engancha una instancia ReDroid a un teléfono físico por USB tethering (RNDIS).
#
# No crea VPN ni interfaz tun: usa policy routing en el host y en el contenedor.
#   Teléfono --USB--> host (enpXsY) --policy route--> contenedor (eth0)
#
# Uso:
#   bash tools/network/usb_tether.sh status f05-main
#   bash tools/network/usb_tether.sh attach f05-main [iface]
#   bash tools/network/usb_tether.sh detach f05-main
#
# Requisitos: teléfono con depuración USB y "USB tethering" activo; Docker.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ACTION="${1:-status}"
INSTANCE="${2:-}"
IFACE_ARG="${3:-}"
STATE_FILE="$REPO_ROOT/instances/$INSTANCE/usb_tether.json"
TABLE_HOST=200
TABLE_CT=101
RULE_HOST_PRIO=1000
RULE_CT_PRIO=7000
DNS_CHAIN=PM_USB_DNS

die() { echo "[!] $*" >&2; exit 1; }
[ -n "$INSTANCE" ] || die "Falta el nombre de la instancia."

host_table_for_ip() { echo $((200 + ${1##*.})); }

container_ip() {
  docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$INSTANCE" 2>/dev/null
}

container_running() {
  [ -n "$(docker ps -q -f "name=^${INSTANCE}$")" ]
}

host_net() {
  # Ejecuta comandos de red en el netns del host usando proteomesh-netctl (o alpine de fallback).
  if docker image inspect proteomesh-netctl:latest >/dev/null 2>&1; then
    docker run --rm --privileged --net=host proteomesh-netctl:latest "$1"
  else
    docker run --rm --privileged --net=host alpine sh -c "
      apk add --no-cache iproute2 >/dev/null 2>&1 || true
      $1
    "
  fi
}

container_net() {
  docker exec "$INSTANCE" /system/bin/sh -c "$1"
}

ensure_nat_modules() {
  docker run --rm --privileged -v /lib/modules:/lib/modules:ro alpine sh -c \
    'modprobe ip_tables 2>/dev/null; modprobe iptable_filter 2>/dev/null; modprobe iptable_nat 2>/dev/null; modprobe nf_nat 2>/dev/null' \
    >/dev/null 2>&1 || true
}

detect_iface() {
  if [ -n "$IFACE_ARG" ]; then echo "$IFACE_ARG"; return; fi
  # Primera default = enlace primario; segunda (menor métrica) = tethering USB.
  ip route show default | awk '
    { m=0; for(i=1;i<=NF;i++) if($i=="metric") m=$(i+1); print m, $0 }
  ' | sort -n | awk 'NR==2 {print}' | sed -E 's/.* dev ([^ ]+).*/\1/'
}

route_field() {
  # $1 = iface, $2 = via|subnet
  case "$2" in
    via)
      ip route show default dev "$1" | awk '{for(i=1;i<=NF;i++) if($i=="via") {print $(i+1); exit}}'
      ;;
    subnet)
      ip route show dev "$1" scope link | awk '$1 ~ /\// {print $1; exit}'
      ;;
  esac
}

write_state() {
  mkdir -p "$(dirname "$STATE_FILE")"
  cat > "$STATE_FILE" <<EOF
{"instance":"$INSTANCE","iface":"$IFACE","gateway":"$GATEWAY","subnet":"$SUBNET","container_ip":"$CIP","table":$TABLE_HOST,"attached_at":"$(date -Iseconds)"}
EOF
}

read_state() {
  [ -f "$STATE_FILE" ] || return 1
  IFACE=$(python3 -c "import json;print(json.load(open('$STATE_FILE'))['iface'])")
  GATEWAY=$(python3 -c "import json;print(json.load(open('$STATE_FILE'))['gateway'])")
  SUBNET=$(python3 -c "import json;print(json.load(open('$STATE_FILE'))['subnet'])")
  CIP=$(python3 -c "import json;print(json.load(open('$STATE_FILE'))['container_ip'])")
  TABLE_HOST=$(python3 -c "import json;print(json.load(open('$STATE_FILE')).get('table', 200 + int('$CIP'.split('.')[-1])))")
}

attach() {
  container_running || die "El contenedor '$INSTANCE' no está corriendo."
  CIP="$(container_ip)"
  [ -n "$CIP" ] || die "No pude obtener la IP del contenedor."
  TABLE_HOST="$(host_table_for_ip "$CIP")"
  # No permitir USB si hay una ruta SOCKS activa: se pisarían.
  if python3 -c "import json,sys; sys.exit(0 if json.load(open('$REPO_ROOT/instances/$INSTANCE/meta.json')).get('proxy') else 1)" 2>/dev/null; then
    die "La instancia tiene una ruta SOCKS configurada. Liberala antes de enganchar USB."
  fi

  IFACE="$(detect_iface)"
  [ -n "$IFACE" ] || die "No detecté la interfaz USB. Pasala como tercer argumento (ej: enp48s0f3u2)."
  GATEWAY="$(route_field "$IFACE" via)"
  SUBNET="$(route_field "$IFACE" subnet)"
  [ -n "$GATEWAY" ] && [ -n "$SUBNET" ] || die "No pude leer gateway/subred de $IFACE."
  [ "$GATEWAY" = "172.17.0.1" ] && die "$IFACE parece la red Docker, no el USB."

  # Un mismo módem no puede alimentar dos instancias (regla de IP única)
  for f in "$REPO_ROOT"/instances/*/usb_tether.json; do
    [ -f "$f" ] || continue
    other="$(basename "$(dirname "$f")")"
    [ "$other" = "$INSTANCE" ] && continue
    other_iface="$(python3 -c "import json;print(json.load(open('$f'))['iface'])" 2>/dev/null || true)"
    [ "$other_iface" = "$IFACE" ] && die "El módem $IFACE ya está enganchado a '$other'."
  done

  echo "[*] USB $IFACE ($SUBNET, gateway $GATEWAY) -> $INSTANCE ($CIP)"

  # Host: el tráfico del contenedor sale por el USB.
  host_net "
    ip rule del from $CIP lookup $TABLE_HOST prio $RULE_HOST_PRIO 2>/dev/null || true
    ip rule add from $CIP lookup $TABLE_HOST prio $RULE_HOST_PRIO
    ip route replace default via $GATEWAY dev $IFACE table $TABLE_HOST
    ip route replace $SUBNET dev $IFACE table $TABLE_HOST
    ip route replace 172.17.0.0/16 dev docker0 table $TABLE_HOST
  " || die "No pude aplicar el ruteo en el host."

  # Contenedor: default por el host + DNS por el gateway del teléfono.
  ensure_nat_modules
  container_net "
    IP=/data/local/tmp/ip_bin/ip
    \$IP route replace default via 172.17.0.1 dev eth0 table $TABLE_CT
    \$IP route replace 172.17.0.0/16 dev eth0 table $TABLE_CT
    \$IP route replace 127.0.0.0/8 dev lo table $TABLE_CT
    \$IP rule del table $TABLE_CT 2>/dev/null || true
    \$IP rule add from all table $TABLE_CT prio $RULE_CT_PRIO
    IPT=/system/bin/iptables
    \$IPT -t nat -D OUTPUT -j $DNS_CHAIN 2>/dev/null || true
    \$IPT -t nat -F $DNS_CHAIN 2>/dev/null || true
    \$IPT -t nat -X $DNS_CHAIN 2>/dev/null || true
    \$IPT -t nat -N $DNS_CHAIN
    \$IPT -t nat -A $DNS_CHAIN -p udp --dport 53 -j DNAT --to-destination ${GATEWAY}:53
    \$IPT -t nat -A $DNS_CHAIN -p tcp --dport 53 -j DNAT --to-destination ${GATEWAY}:53
    \$IPT -t nat -I OUTPUT 1 -j $DNS_CHAIN
  " || die "No pude aplicar el ruteo en el contenedor."

  write_state
  echo "[✓] USB enganchado."
  echo "    Ruta: $INSTANCE -> $IFACE -> $GATEWAY"
  echo "    DNS:  53 -> $GATEWAY:53"
  echo "    Para quitarlo: bash tools/network/usb_tether.sh detach $INSTANCE"
}

detach() {
  if read_state 2>/dev/null; then
    :
  else
    # Sin estado: intentar limpiar por IP actual.
    CIP="$(container_ip)"; IFACE=""; GATEWAY=""; SUBNET=""; TABLE_HOST="$(host_table_for_ip "$CIP")"
  fi

  if [ -n "${CIP:-}" ]; then
    host_net "
      ip rule del from $CIP lookup $TABLE_HOST prio $RULE_HOST_PRIO 2>/dev/null || true
      ip route flush table $TABLE_HOST 2>/dev/null || true
    " >/dev/null 2>&1 || true

    if container_running; then
      container_net "
        IPT=/system/bin/iptables
        \$IPT -t nat -D OUTPUT -j $DNS_CHAIN 2>/dev/null || true
        \$IPT -t nat -F $DNS_CHAIN 2>/dev/null || true
        \$IPT -t nat -X $DNS_CHAIN 2>/dev/null || true
        /data/local/tmp/ip_bin/ip rule del table $TABLE_CT 2>/dev/null || true
        /data/local/tmp/ip_bin/ip route flush table $TABLE_CT 2>/dev/null || true
      " >/dev/null 2>&1 || true
    fi
  fi

  rm -f "$STATE_FILE"
  echo "[✓] USB desenganchado de $INSTANCE."
}

status() {
  echo "Instancia: $INSTANCE"
  echo "Contenedor: $(container_running && echo corriendo || echo detenido)"
  echo "IP contenedor: $(container_ip)"
  if read_state 2>/dev/null; then
    echo "USB: ENGANCHADO"
    echo "  iface:   $IFACE"
    echo "  gateway: $GATEWAY"
    echo "  subnet:  $SUBNET"
  else
    echo "USB: no enganchado por este script"
  fi
  echo "--- ruteo contenedor ---"
  container_running && container_net "/data/local/tmp/ip_bin/ip rule show | grep -E '7000|9000' || true; /data/local/tmp/ip_bin/ip route show table $TABLE_CT 2>/dev/null || true"
  echo "--- regla host ---"
  host_net "ip rule show | grep 'lookup $TABLE_HOST' || true; ip route show table $TABLE_HOST 2>/dev/null || true"
}

case "$ACTION" in
  attach) attach ;;
  detach) detach ;;
  status) status ;;
  *) die "Uso: $0 {attach|detach|status} <instancia> [iface]" ;;
esac
