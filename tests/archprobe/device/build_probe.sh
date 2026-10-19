#!/usr/bin/env bash
# Builds the on-device architecture probe APK (tests/archprobe/device/arch_probe.apk).
# Reuses the .probe toolchain when present.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../../.." && pwd)"
TOOLS="$ROOT/.probe"
cd "$DIR"

if [ ! -f "$TOOLS/android.jar" ]; then
    echo "[!] Falta $TOOLS/android.jar (toolchain .probe)"; exit 1
fi

rm -rf classes dex base.apk unsigned.apk arch_probe.apk
mkdir -p classes dex
javac --release 8 -cp "$TOOLS/android.jar" -d classes \
    src/com/proteomesh/archprobe/ArchProbe.java

java -cp "$TOOLS/r8.jar" com.android.tools.r8.D8 --release --min-api 26 \
    --output dex --lib "$TOOLS/android.jar" --classpath classes \
    classes/com/proteomesh/archprobe/*.class

"$TOOLS/aapt2" link -o base.apk -I "$TOOLS/android.jar" --manifest AndroidManifest.xml

python3 - << 'EOF'
import struct, zipfile

src = zipfile.ZipFile('base.apk')
with open('unsigned.apk', 'wb') as f:
    z = zipfile.ZipFile(f, 'w')
    for item in src.infolist():
        data = src.read(item.filename)
        zi = zipfile.ZipInfo(item.filename, item.date_time)
        zi.compress_type = item.compress_type
        if item.filename == 'resources.arsc':
            name_len = len(item.filename.encode())
            base = f.tell() + 30 + name_len
            pad = (4 - (base % 4)) % 4
            if pad:
                pad += 4
                zi.extra = struct.pack('<HH', 0, pad - 4) + b'\x00' * (pad - 4)
        z.writestr(zi, data)
    zi = zipfile.ZipInfo('classes.dex')
    zi.compress_type = zipfile.ZIP_DEFLATED
    z.writestr(zi, open('dex/classes.dex', 'rb').read())
    z.close()
EOF

KEYSTORE="$ROOT/src/lsposed_module/debug.keystore"
jarsigner -sigalg SHA256withRSA -digestalg SHA-256 \
    -keystore "$KEYSTORE" -storepass android -keypass android \
    -signedjar arch_probe.apk unsigned.apk androiddebugkey >/dev/null

echo "[+] Built: $DIR/arch_probe.apk"
