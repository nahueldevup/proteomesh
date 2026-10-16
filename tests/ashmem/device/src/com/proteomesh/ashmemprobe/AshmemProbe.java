package com.proteomesh.ashmemprobe;

// Sonda on-device: corre como proceso de aplicación (hijo de zygote, con
// libpixel_hw.so vía LD_PRELOAD) y valida la semántica ashmem que consumen
// Chromium/Meta. Resultados en logcat con tag "AshmemProbe".
//
// Nota: se compila contra un stub android-30 incompleto; Os.ioctlInt se
// invoca por reflexión (es API pública, la reflexión siempre está permitida).

import android.app.Activity;
import android.os.Bundle;
import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;
import android.system.StructStat;
import android.util.Log;

import java.io.FileDescriptor;
import java.lang.reflect.Method;

public class AshmemProbe extends Activity {
    private static final String TAG = "AshmemProbe";

    private static final int F_ADD_SEALS = 1033;
    private static final int F_GET_SEALS = 1034;
    private static final int ASHMEM_GET_SIZE = 0x7704;
    private static final int ASHMEM_GET_PROT_MASK = 0x7706;

    private static void log(String s) {
        Log.i(TAG, s);
    }

    private static int ioctlInt(FileDescriptor fd, int cmd) throws Exception {
        Method m = Os.class.getMethod("ioctlInt", FileDescriptor.class, int.class);
        return (Integer) m.invoke(null, fd, cmd);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Thread t = new Thread(this::runProbe);
        t.start();
    }

    private void runProbe() {
        FileDescriptor fd;
        try {
            fd = Os.open("/dev/ashmem", OsConstants.O_RDWR, 0);
            log("open(/dev/ashmem) OK");
        } catch (ErrnoException e) {
            log("open(/dev/ashmem) FAIL errno=" + e.errno + " " + e.getMessage());
            return;
        }

        try {
            int r = Os.fcntlInt(fd, F_ADD_SEALS, 6); // GROW|SHRINK
            log("F_ADD_SEALS(GROW|SHRINK) ret=" + r);
        } catch (ErrnoException e) {
            log("F_ADD_SEALS FAIL errno=" + e.errno);
        }

        try {
            int seals = Os.fcntlInt(fd, F_GET_SEALS, 0);
            log("F_GET_SEALS=0x" + Integer.toHexString(seals)
                    + " (contrato IsMemfdFd=0x6)");
        } catch (ErrnoException e) {
            log("F_GET_SEALS FAIL errno=" + e.errno);
        }

        try {
            Os.ftruncate(fd, 8192);
            log("ftruncate(8192) OK");
        } catch (ErrnoException e) {
            log("ftruncate FAIL errno=" + e.errno);
        }

        try {
            log("ASHMEM_GET_SIZE=" + ioctlInt(fd, ASHMEM_GET_SIZE));
        } catch (Throwable e) {
            Throwable c = e.getCause() != null ? e.getCause() : e;
            log("ASHMEM_GET_SIZE FAIL " + c);
        }

        try {
            log("ASHMEM_GET_PROT_MASK=0x"
                    + Integer.toHexString(ioctlInt(fd, ASHMEM_GET_PROT_MASK)));
        } catch (Throwable e) {
            Throwable c = e.getCause() != null ? e.getCause() : e;
            log("ASHMEM_GET_PROT_MASK FAIL " + c);
        }

        try {
            FileDescriptor dup = Os.dup(fd);
            int dseals = Os.fcntlInt(dup, F_GET_SEALS, 0);
            log("dup: F_GET_SEALS=0x" + Integer.toHexString(dseals));
            Os.close(dup);
        } catch (ErrnoException e) {
            log("dup FAIL errno=" + e.errno);
        }

        try {
            Os.access("/dev/ashmem", OsConstants.F_OK);
            log("access(F_OK) OK");
        } catch (ErrnoException e) {
            log("access(F_OK) FAIL errno=" + e.errno);
        }
        try {
            Os.access("/dev/ashmem", OsConstants.X_OK);
            log("access(X_OK) DEVOLVIO OK (inesperado)");
        } catch (ErrnoException e) {
            log("access(X_OK) errno=" + e.errno + " (esperado 13 EACCES)");
        }

        try {
            StructStat st = Os.stat("/dev/ashmem");
            boolean chardev = (st.st_mode & OsConstants.S_IFMT) == OsConstants.S_IFCHR;
            log("stat: chardev=" + chardev);
        } catch (ErrnoException e) {
            log("stat FAIL errno=" + e.errno);
        }

        log("PROBE-DONE");
    }
}
