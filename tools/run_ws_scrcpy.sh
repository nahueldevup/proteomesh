#!/usr/bin/env bash
# Lanza ws-scrcpy (visor nativo scrcpy de baja latencia) para los CloudPhones.
# Uso: bash tools/run_ws_scrcpy.sh [puerto]
set -euo pipefail

PORT="${1:-${WS_SCRCPY_PORT:-8001}}"
WS_DIR="${WS_SCRCPY_DIR:-$HOME/.cache/proteomesh/ws-scrcpy}"
CONFIG="${WS_SCRCPY_CONFIG:-$(dirname "$WS_DIR")/ws-scrcpy.yaml}"
REPO_URL="https://github.com/NetrisTV/ws-scrcpy.git"

command -v node >/dev/null 2>&1 || { echo "[!] Node.js no está instalado"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "[!] npm no está instalado"; exit 1; }
command -v adb >/dev/null 2>&1 || { echo "[!] adb no está instalado"; exit 1; }

if [ ! -d "$WS_DIR/.git" ]; then
  echo "[*] Clonando ws-scrcpy en $WS_DIR"
  mkdir -p "$(dirname "$WS_DIR")"
  git clone --depth 1 "$REPO_URL" "$WS_DIR"
fi

cd "$WS_DIR"
if [ ! -d node_modules ]; then
  echo "[*] Instalando dependencias..."
  npm install
fi
if [ ! -f node_modules/node-pty/build/Release/pty.node ]; then
  echo "[*] Compilando node-pty..."
  npm rebuild node-pty || true
  [ -f node_modules/node-pty/build/Release/pty.node ] || npx node-gyp rebuild -C node_modules/node-pty
fi
if [ ! -f dist/index.js ]; then
  echo "[*] Compilando frontend..."
  npm run dist
fi

# Asegurar parche CSS limpio (sin botones redundantes, object-fit cover, touch directo)
if [ -f "$WS_DIR/dist/public/main.css" ]; then
  if ! grep -q "ProteoMesh Clean Frameless Overlay" "$WS_DIR/dist/public/main.css"; then
    cat >> "$WS_DIR/dist/public/main.css" << 'CSSEOF'

/* ProteoMesh Clean Frameless Overlay */
.control-buttons-list,
.control-wrapper {
  display: none !important;
}

body.stream,
.device-view,
.video,
canvas.video-layer {
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  background: #000000 !important;
  object-fit: cover !important;
  touch-action: none !important;
  user-select: none !important;
}

canvas.touch-layer {
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  object-fit: cover !important;
  touch-action: none !important;
  user-select: none !important;
  z-index: 1 !important;
}
CSSEOF
  fi
fi

cat > "$CONFIG" <<EOF
server:
  - secure: false
    port: ${PORT}
EOF

# El adb server del host debe conocer las instancias (instance_manager start ya hace adb connect).
adb start-server >/dev/null 2>&1 || true

echo "[*] ws-scrcpy disponible en http://localhost:${PORT}"
echo "[*] Visor nativo: la web lo detecta automáticamente vía /stream-info."
WS_SCRCPY_CONFIG="$CONFIG" node "$WS_DIR/dist/index.js"
