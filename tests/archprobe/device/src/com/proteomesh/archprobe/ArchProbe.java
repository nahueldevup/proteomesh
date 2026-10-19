package com.proteomesh.archprobe;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.widget.ScrollView;
import android.widget.TextView;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.lang.reflect.Method;
import java.util.Locale;

public class ArchProbe extends Activity {

    static final String TAG = "PROTOMESH_PROBE";
    final StringBuilder out = new StringBuilder();

    void section(String name) {
        out.append("\n===== ").append(name).append(" =====\n");
    }

    void line(String key, String value) {
        out.append(key).append(": ").append(value == null ? "(null)" : value).append('\n');
    }

    String readText(String path, int maxBytes) {
        try {
            FileInputStream in = new FileInputStream(path);
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0 && bos.size() < maxBytes) {
                bos.write(buf, 0, n);
            }
            in.close();
            byte[] all = bos.toByteArray();
            if (all.length == 0) return "(vacio)";
            return new String(all, 0, Math.min(all.length, maxBytes), "UTF-8");
        } catch (Throwable t) {
            return "(error: " + t.getClass().getSimpleName() + ": " + t.getMessage() + ")";
        }
    }

    String firstLine(String path) {
        return readText(path, 512).split("\n", 2)[0].trim();
    }

    String readLines(String path, int maxLines) {
        StringBuilder sb = new StringBuilder();
        try {
            BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(path), "UTF-8"));
            String l;
            int c = 0;
            while ((l = r.readLine()) != null && c < maxLines) {
                sb.append(l).append('\n');
                c++;
            }
            r.close();
        } catch (Throwable t) {
            sb.append("(error: ").append(t.getClass().getSimpleName()).append(")");
        }
        return sb.toString().trim();
    }

    String exec(String... cmd) {
        try {
            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.redirectErrorStream(true);
            Process p = pb.start();
            BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), "UTF-8"));
            StringBuilder sb = new StringBuilder();
            String l;
            while ((l = r.readLine()) != null) sb.append(l).append('\n');
            p.waitFor();
            r.close();
            return sb.toString().trim();
        } catch (Throwable t) {
            return "(error: " + t.getClass().getSimpleName() + ": " + t.getMessage() + ")";
        }
    }

    String sysProp(String key) {
        try {
            Class<?> sp = Class.forName("android.os.SystemProperties");
            Method get = sp.getDeclaredMethod("get", String.class);
            get.setAccessible(true);
            Object v = get.invoke(null, key);
            return v == null ? "(null)" : v.toString();
        } catch (Throwable t) {
            return "(reflexion fallida: " + t.getClass().getSimpleName() + ": " + t.getMessage() + ")";
        }
    }

    String bytesToMac(byte[] mac) {
        StringBuilder sb = new StringBuilder();
        for (byte b : mac) {
            if (sb.length() > 0) sb.append(':');
            sb.append(String.format(Locale.US, "%02x", b & 0xff));
        }
        return sb.toString();
    }

    String fileExists(String path) {
        try {
            File f = new File(path);
            return f.exists() ? "EXISTE" : "no";
        } catch (Throwable t) {
            return "(error: " + t.getClass().getSimpleName() + ")";
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        TextView tv = new TextView(this);
        tv.setTextSize(11f);
        tv.setText("corriendo...");
        ScrollView sv = new ScrollView(this);
        sv.addView(tv);
        setContentView(sv);

        new Thread(() -> {
            try {
                runProbe();
            } catch (Throwable t) {
                StringWriter sw = new StringWriter();
                t.printStackTrace(new PrintWriter(sw));
                out.append("\n[FATAL] ").append(sw);
            }
            String report = out.toString();
            try {
                File f = new File(getFilesDir(), "archprobe.txt");
                PrintWriter pw = new PrintWriter(f, "UTF-8");
                pw.print(report);
                pw.close();
            } catch (Throwable ignored) {}
            File dir = getExternalFilesDir(null);
            try {
                if (dir != null) {
                    File f = new File(dir, "archprobe.txt");
                    PrintWriter pw = new PrintWriter(f, "UTF-8");
                    pw.print(report);
                    pw.close();
                }
            } catch (Throwable ignored) {}
            String[] lines = report.split("\n");
            for (String l : lines) Log.i(TAG, l);
            final String r = report;
            runOnUiThread(() -> tv.setText(r));
        }).start();
    }

    void runProbe() {
        out.append("PROTOMESH ARCH PROBE v1\n");
        out.append("pkg=").append(getPackageName()).append(" uid=").append(android.os.Process.myUid());
        out.append(" targetSdk=").append(getApplicationInfo().targetSdkVersion).append('\n');

        // 1. Java-level identity
        section("JAVA / System.getProperty");
        line("os.arch", System.getProperty("os.arch"));
        line("os.version", System.getProperty("os.version"));
        line("os.name", System.getProperty("os.name"));
        line("java.vm.name", System.getProperty("java.vm.name"));
        line("java.vendor", System.getProperty("java.vendor"));

        section("JAVA / Build");
        line("Build.MODEL", Build.MODEL);
        line("Build.MANUFACTURER", Build.MANUFACTURER);
        line("Build.BRAND", Build.BRAND);
        line("Build.DEVICE", Build.DEVICE);
        line("Build.PRODUCT", Build.PRODUCT);
        line("Build.BOARD", Build.BOARD);
        line("Build.HARDWARE", Build.HARDWARE);
        line("Build.FINGERPRINT", Build.FINGERPRINT);
        line("Build.TYPE", Build.TYPE);
        line("Build.TAGS", Build.TAGS);
        line("Build.SUPPORTED_ABIS", String.join(",", Build.SUPPORTED_ABIS));
        line("Build.SUPPORTED_64_BIT_ABIS", String.join(",", Build.SUPPORTED_64_BIT_ABIS));
        line("Build.CPU_ABI", Build.CPU_ABI);
        line("Build.CPU_ABI2", Build.CPU_ABI2);
        line("Build.VERSION.RELEASE", Build.VERSION.RELEASE);
        line("Build.VERSION.SECURITY_PATCH", Build.VERSION.SECURITY_PATCH);

        // 2. UTS via libc (hooked path)
        section("LIBC / Os.uname() (mismo proceso)");
        try {
            android.system.StructUtsname u = android.system.Os.uname();
            line("sysname", u.sysname);
            line("nodename", u.nodename);
            line("release", u.release);
            line("version", u.version);
            line("machine  <-- clave", u.machine);
        } catch (Throwable t) {
            line("Os.uname", "(error: " + t + ")");
        }

        // 3. Subprocess view
        section("SUBPROCESO / exec uname -a");
        line("uname -a", exec("/system/bin/uname", "-a"));
        line("getprop vm.native.bridge", exec("/system/bin/getprop", "ro.dalvik.vm.native.bridge"));
        line("getprop cpu.abi", exec("/system/bin/getprop", "ro.product.cpu.abi"));
        line("getprop build.type", exec("/system/bin/getprop", "ro.build.type"));

        // 4. Props del propio proceso (reflexion -> __system_property_get nativo)
        section("PROPS via SystemProperties.get (proceso propio)");
        String[] keys = {
            "ro.product.cpu.abi", "ro.product.cpu.abilist", "ro.product.cpu.abilist64",
            "ro.dalvik.vm.native.bridge", "ro.enable.native.bridge.exec",
            "ro.dalvik.vm.isa.arm64", "ro.dalvik.vm.isa.arm",
            "ro.build.type", "ro.build.tags", "ro.debuggable", "ro.secure",
            "ro.boot.verifiedbootstate", "ro.boot.flash.locked", "ro.boot.veritymode",
            "ro.product.model", "ro.build.fingerprint", "ro.soc.model",
            "ro.build.date", "ro.build.version.security_patch",
            "ro.hardware", "ro.board.platform", "ro.boot.hardware"
        };
        for (String k : keys) line(k, sysProp(k));

        // 5. /proc
        section("/proc");
        line("/proc/version", firstLine("/proc/version"));
        String cpuinfo = readText("/proc/cpuinfo", 8192);
        int nProc = 0;
        for (String l : cpuinfo.split("\n")) if (l.startsWith("processor")) nProc++;
        line("cpuinfo: procesadores", String.valueOf(nProc));
        for (String l : cpuinfo.split("\n")) {
            String t = l.trim();
            if (t.startsWith("model name") || t.startsWith("Hardware") || t.startsWith("CPU implementer")
                    || t.startsWith("CPU architecture") || t.startsWith("CPU variant") || t.startsWith("model")) {
                line("cpuinfo", t);
                break;
            }
        }
        boolean hasFlags = cpuinfo.contains("flags");
        line("cpuinfo: tiene 'flags' (x86)", String.valueOf(hasFlags));
        line("cpuinfo: 'lm' (x86_64)", String.valueOf(cpuinfo.contains(" lm ") || cpuinfo.contains(" lm\n")));
        line("cpuinfo: 'avx/sse' (x86)", String.valueOf(cpuinfo.contains(" avx") || cpuinfo.contains(" sse")));
        line("cpuinfo: 'asimd/fp' (arm64)", String.valueOf(cpuinfo.contains("asimd") || cpuinfo.contains(" fp ")));
        String status = readLines("/proc/self/status", 80);
        for (String l : status.split("\n")) {
            String t = l.trim();
            if (t.startsWith("Seccomp") || t.startsWith("TracerPid")) line("status", t);
        }

        section("/proc/self/maps scan");
        String maps = readText("/proc/self/maps", 512 * 1024);
        String[][] needles = {
            {"libndk_translation", "libndk_translation"},
            {"houdini", "houdini"},
            {"native_bridge", "native_bridge"},
            {"libpixel_hw", "libpixel_hw"},
            {"lsposed/magisk", "magisk"},
            {"zygisk", "zygisk"},
            {"riru", "riru"},
            {"x86_64 en rutas", "x86_64"},
            {"arm64 en rutas", "arm64"},
            {"linker64", "linker64"},
            {"linker (32)", "/linker"},
        };
        for (String[] n : needles) {
            line("maps contiene '" + n[0] + "'", String.valueOf(maps.toLowerCase().contains(n[1].toLowerCase())));
        }
        line("maps: primeras 3 lineas", maps.split("\n", 2)[0] + "\n" + (maps.contains("\n") ? maps.split("\n")[1] : ""));

        section("/proc/self/auxv");
        String auxv = readText("/proc/self/auxv", 64);
        StringBuilder hex = new StringBuilder();
        for (int i = 0; i < Math.min(auxv.length(), 32); i++) {
            hex.append(String.format(Locale.US, "%02x", (int) auxv.charAt(i) & 0xff));
        }
        line("auxv (hex, primeros 32B)", hex.toString());

        // 6. sysfs
        section("NetworkInterface (Java, ruta netlink)");
        try {
            java.util.Enumeration<java.net.NetworkInterface> ifs = java.net.NetworkInterface.getNetworkInterfaces();
            while (ifs.hasMoreElements()) {
                java.net.NetworkInterface ni = ifs.nextElement();
                StringBuilder sb = new StringBuilder();
                try {
                    if (ni.isUp()) sb.append("up");
                } catch (Throwable t) {
                    sb.append("up=(error:").append(t.getClass().getSimpleName()).append(")");
                }
                try {
                    byte[] mac = ni.getHardwareAddress();
                    sb.append(" mac=").append(mac == null ? "null" : bytesToMac(mac));
                } catch (Throwable t) {
                    sb.append(" mac=(error: ").append(t.getClass().getSimpleName()).append(")");
                }
                try {
                    java.util.Enumeration<java.net.InetAddress> addrs = ni.getInetAddresses();
                    while (addrs.hasMoreElements()) sb.append(" ").append(addrs.nextElement().getHostAddress());
                } catch (Throwable t) {
                    sb.append(" addrs=(error: ").append(t.getClass().getSimpleName()).append(")");
                }
                line("if: " + ni.getName(), sb.toString());
            }
        } catch (Throwable t) {
            StringBuilder st = new StringBuilder(t.toString());
            StackTraceElement[] frames = t.getStackTrace();
            for (int i = 0; i < Math.min(frames.length, 4); i++) st.append(" | ").append(frames[i]);
            line("NetworkInterface", "(error: " + st + ")");
        }
        section("libcore.io.Libcore.os.getifaddrs (reflexion)");
        try {
            Class<?> libcore = Class.forName("libcore.io.Libcore");
            Object os = libcore.getField("os").get(null);
            Method m = os.getClass().getMethod("getifaddrs");
            Object[] arr = (Object[]) m.invoke(os);
            line("getifaddrs count", String.valueOf(arr == null ? -1 : arr.length));
            if (arr != null) {
                for (Object o : arr) {
                    Object name = o.getClass().getField("ifa_name").get(o);
                    line("ifa", String.valueOf(name));
                }
            }
        } catch (Throwable t) {
            line("Libcore.os.getifaddrs", "(no expuesto en AndroidOs; ruta interna)");
        }
        line("/proc/net/route (default gw)", readText("/proc/net/route", 4096).trim());
        line("/proc/net/wireless", readText("/proc/net/wireless", 512).trim());

        section("/sys");
        line("/sys/class/net/", exec("/system/bin/ls", "/sys/class/net"));
        line("/sys/class/net/wlan0/address", readText("/sys/class/net/wlan0/address", 64).trim());
        line("/sys/devices/system/cpu/online", readText("/sys/devices/system/cpu/online", 64).trim());
        line("cpufreq cpu0 max", readText("/sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_max_freq", 64).trim());
        line("DMI board_vendor", readText("/sys/devices/virtual/dmi/id/board_vendor", 128).trim());
        line("DMI product_name", readText("/sys/devices/virtual/dmi/id/product_name", 128).trim());
        line("DMI sys_vendor", readText("/sys/devices/virtual/dmi/id/sys_vendor", 128).trim());

        // 7. Archivos testigo
        section("Archivos testigo (no deberian existir en ARM real)");
        String[] paths = {
            "/system/lib64/libndk_translation.so",
            "/system/lib64/libndk_translation_proxy.so",
            "/system/lib/libndk_translation.so",
            "/system/lib64/libhoudini.so",
            "/system/lib/libhoudini.so",
            "/system/bin/houdini",
            "/system/bin/ndk_translation",
            "/proc/sys/kernel/osrelease",
        };
        for (String p : paths) line(p, fileExists(p));

        section("FIN");
    }
}
