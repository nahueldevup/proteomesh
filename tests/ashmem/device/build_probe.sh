#!/usr/bin/env bash
# Builds the on-device ashmem probe APK (tests/ashmem/device/ashmem_probe.apk).
# Reuses the .probe toolchain when present; otherwise downloads it locally.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../../.." && pwd)"
TOOLS="$ROOT/.probe"
cd "$DIR"

# 1. Toolchain (idempotente; prefiere .probe/)
if [ ! -f "$TOOLS/android.jar" ]; then
    TOOLS="$DIR/tools"
    mkdir -p "$TOOLS"
fi
if [ ! -f "$TOOLS/android.jar" ]; then
    curl -s -L -o "$TOOLS/android.jar" "https://github.com/Sable/android-platforms/raw/master/android-30/android.jar"
fi
if [ ! -x "$TOOLS/aapt2" ]; then
    curl -s -L -o "$TOOLS/aapt2.jar" "https://dl.google.com/android/maven2/com/android/tools/build/aapt2/8.13.2-14304508/aapt2-8.13.2-14304508-linux.jar"
    (cd "$TOOLS" && jar xf aapt2.jar aapt2 || unzip -o aapt2.jar aapt2)
    chmod +x "$TOOLS/aapt2"
fi
if [ ! -f "$TOOLS/r8.jar" ]; then
    curl -s -L -o "$TOOLS/r8.jar" "https://maven.google.com/com/android/tools/r8/8.2.42/r8-8.2.42.jar"
fi

# 2. Compile
rm -rf classes dex base.apk unsigned.apk ashmem_probe.apk
mkdir -p classes dex
javac --release 8 -cp "$TOOLS/android.jar" -d classes \
    src/com/proteomesh/ashmemprobe/AshmemProbe.java

# 3. Dex
java -cp "$TOOLS/r8.jar" com.android.tools.r8.D8 --release --min-api 26 \
    --output dex --lib "$TOOLS/android.jar" --classpath classes \
    classes/com/proteomesh/ashmemprobe/*.class

# 4. Link base APK (manifest only)
"$TOOLS/aapt2" link -o base.apk -I "$TOOLS/android.jar" --manifest AndroidManifest.xml

# 5. Empaquetar dex + alinear resources.arsc a 4 bytes
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

# 6. Sign
KEYSTORE="$ROOT/src/lsposed_module/debug.keystore"
jarsigner -sigalg SHA256withRSA -digestalg SHA-256 \
    -keystore "$KEYSTORE" -storepass android -keypass android \
    -signedjar ashmem_probe.apk unsigned.apk androiddebugkey >/dev/null

echo "[+] Built: $DIR/ashmem_probe.apk"
