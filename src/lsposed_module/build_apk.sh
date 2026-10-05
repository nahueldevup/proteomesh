#!/usr/bin/env bash
# ==============================================================================
# ProteoMesh — Compilation script for FakeWifiPixel (LSPosed Xposed Module)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="/tmp/proteomesh_fakewifi_build"
TARGET_APK="${SCRIPT_DIR}/../../modules/FakeWifiPixel.apk"

echo "[*] Setting up workspace in ${WORK_DIR}..."
rm -rf "${WORK_DIR}"
mkdir -p "${WORK_DIR}/classes" "${WORK_DIR}/dex" "${WORK_DIR}/stubs/de/robv/android/xposed/callbacks"

# 1. Download Android SDK jar & R8 if needed
ANDROID_JAR="${WORK_DIR}/android.jar"
R8_JAR="${WORK_DIR}/r8.jar"

if [ ! -f "${ANDROID_JAR}" ]; then
    echo "[*] Downloading android-30 platform SDK jar..."
    curl -s -L -o "${ANDROID_JAR}" "https://github.com/Sable/android-platforms/raw/master/android-30/android.jar"
fi

if [ ! -f "${R8_JAR}" ]; then
    echo "[*] Downloading Google R8 compiler..."
    curl -s -L -o "${R8_JAR}" "https://maven.google.com/com/android/tools/r8/8.2.42/r8-8.2.42.jar"
fi

# 2. Setup Xposed Stubs
cat << 'EOF' > "${WORK_DIR}/stubs/de/robv/android/xposed/callbacks/XC_LoadPackage.java"
package de.robv.android.xposed.callbacks;
public class XC_LoadPackage {
    public static class LoadPackageParam {
        public String packageName;
        public ClassLoader classLoader;
    }
}
EOF

cat << 'EOF' > "${WORK_DIR}/stubs/de/robv/android/xposed/IXposedHookLoadPackage.java"
package de.robv.android.xposed;
import de.robv.android.xposed.callbacks.XC_LoadPackage;
public interface IXposedHookLoadPackage {
    void handleLoadPackage(XC_LoadPackage.LoadPackageParam lpparam) throws Throwable;
}
EOF

cat << 'EOF' > "${WORK_DIR}/stubs/de/robv/android/xposed/XC_MethodHook.java"
package de.robv.android.xposed;
public abstract class XC_MethodHook {
    public static class Unhook {}
    public static class MethodHookParam {
        public Object[] args;
        public Object thisObject;
        private Object result;
        public void setResult(Object result) { this.result = result; }
        public Object getResult() { return result; }
    }
    protected void beforeHookedMethod(MethodHookParam param) throws Throwable {}
    protected void afterHookedMethod(MethodHookParam param) throws Throwable {}
}
EOF

cat << 'EOF' > "${WORK_DIR}/stubs/de/robv/android/xposed/XposedBridge.java"
package de.robv.android.xposed;
public class XposedBridge {
    public static void log(String text) {}
    public static void log(Throwable t) {}
    public static java.util.Set<XC_MethodHook.Unhook> hookAllConstructors(Class<?> hookClass, XC_MethodHook callback) { return null; }
}
EOF

cat << 'EOF' > "${WORK_DIR}/stubs/de/robv/android/xposed/XposedHelpers.java"
package de.robv.android.xposed;
public class XposedHelpers {
    public static Class<?> findClass(String className, ClassLoader classLoader) { return null; }
    public static void setStaticObjectField(Class<?> clazz, String fieldName, Object value) {}
    public static XC_MethodHook.Unhook findAndHookMethod(Class<?> clazz, String methodName, Object... args) { return null; }
    public static XC_MethodHook.Unhook findAndHookMethod(String className, ClassLoader classLoader, String methodName, Object... args) { return null; }
    public static Object newInstance(Class<?> clazz, Object... args) { return null; }
    public static void setIntField(Object obj, String fieldName, int value) {}
    public static void setLongField(Object obj, String fieldName, long value) {}
    public static void setFloatField(Object obj, String fieldName, float value) {}
    public static void setBooleanField(Object obj, String fieldName, boolean value) {}
    public static void setObjectField(Object obj, String fieldName, Object value) {}
    public static void setAdditionalInstanceField(Object obj, String key, Object value) {}
    public static Object getAdditionalInstanceField(Object obj, String key) { return null; }
}
EOF

# 3. Compile Java sources
echo "[*] Compiling Java sources with javac..."
javac --release 8 -cp "${ANDROID_JAR}" -d "${WORK_DIR}/classes" \
    "${WORK_DIR}/stubs/de/robv/android/xposed/"*.java \
    "${WORK_DIR}/stubs/de/robv/android/xposed/callbacks/"*.java \
    "${SCRIPT_DIR}/com/fakewifi/pixel/"*.java

# 4. Convert classes to DEX using R8 D8
echo "[*] Converting classes to Dalvik Executable (classes.dex) with D8..."
java -cp "${R8_JAR}" com.android.tools.r8.D8 \
    --release \
    --min-api 26 \
    --output "${WORK_DIR}/dex" \
    --lib "${ANDROID_JAR}" \
    --classpath "${WORK_DIR}/classes" \
    "${WORK_DIR}/classes/com/fakewifi/pixel/"*.class

# 5. Pack and sign APK
echo "[*] Packing classes.dex into APK..."
python3 - << EOF
import zipfile

src_apk = "${TARGET_APK}"
dst_apk = "${WORK_DIR}/unsigned.apk"
new_dex = "${WORK_DIR}/dex/classes.dex"

with open(new_dex, 'rb') as f:
    dex_bytes = f.read()

with zipfile.ZipFile(src_apk, 'r') as zin, zipfile.ZipFile(dst_apk, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        if item.filename.startswith('META-INF/'):
            continue
        if item.filename == 'classes.dex':
            zout.writestr('classes.dex', dex_bytes)
        else:
            zout.writestr(item, zin.read(item.filename))
EOF

echo "[*] Signing APK..."
KEYSTORE="${SCRIPT_DIR}/debug.keystore"
if [ ! -f "${KEYSTORE}" ]; then
    keytool -genkey -v -keystore "${KEYSTORE}" \
        -storepass android -alias androiddebugkey -keypass android \
        -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=ProteoMesh,O=SecurityLab,C=AR"
fi

jarsigner -sigalg SHA256withRSA -digestalg SHA-256 \
    -keystore "${KEYSTORE}" \
    -storepass android -keypass android \
    -signedjar "${TARGET_APK}" \
    "${WORK_DIR}/unsigned.apk" androiddebugkey

rm -rf "${WORK_DIR}"
echo "[+] Successfully built and signed: ${TARGET_APK}"
