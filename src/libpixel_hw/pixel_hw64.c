#define _GNU_SOURCE
#include <stddef.h>
typedef long ssize_t;

static long raw_open(const char *path, int flags) {
    register long rax asm("rax") = 2; // SYS_open
    register long rdi asm("rdi") = (long)path;
    register long rsi asm("rsi") = (long)flags;
    register long rdx asm("rdx") = 0;
    __asm__ volatile (
        "syscall"
        : "+r" (rax)
        : "r" (rdi), "r" (rsi), "r" (rdx)
        : "rcx", "r11", "memory"
    );
    return rax;
}

static long raw_read(int fd, void *buf, unsigned long count) {
    register long rax asm("rax") = 0; // SYS_read
    register long rdi asm("rdi") = (long)fd;
    register long rsi asm("rsi") = (long)buf;
    register long rdx asm("rdx") = (long)count;
    __asm__ volatile (
        "syscall"
        : "+r" (rax)
        : "r" (rdi), "r" (rsi), "r" (rdx)
        : "rcx", "r11", "memory"
    );
    return rax;
}

static long raw_close(int fd) {
    register long rax asm("rax") = 3; // SYS_close
    register long rdi asm("rdi") = (long)fd;
    __asm__ volatile (
        "syscall"
        : "+r" (rax)
        : "r" (rdi)
        : "rcx", "r11", "memory"
    );
    return rax;
}

static long raw_memfd_create(const char *name, unsigned int flags) {
    register long rax asm("rax") = 319; // SYS_memfd_create (x86_64)
    register long rdi asm("rdi") = (long)name;
    register long rsi asm("rsi") = (long)flags;
    __asm__ volatile (
        "syscall"
        : "+r" (rax)
        : "r" (rdi), "r" (rsi)
        : "rcx", "r11", "memory"
    );
    return rax;
}

static long raw_ftruncate(int fd, unsigned long length) {
    register long rax asm("rax") = 77; // SYS_ftruncate (x86_64)
    register long rdi asm("rdi") = (long)fd;
    register long rsi asm("rsi") = (long)length;
    __asm__ volatile (
        "syscall"
        : "+r" (rax)
        : "r" (rdi), "r" (rsi)
        : "rcx", "r11", "memory"
    );
    return rax;
}

// --- Módulo A/B: seguimiento de descriptores en memoria ---
#define FD_TABLE_SIZE 65536
static unsigned char s_ashmem_fds[FD_TABLE_SIZE];
static unsigned char s_tcp_fds[FD_TABLE_SIZE];
static unsigned char s_dev_fds[FD_TABLE_SIZE];

static int fd_in_range(int fd) {
    return fd >= 0 && fd < FD_TABLE_SIZE;
}
static void fd_mark(unsigned char *tbl, int fd) {
    if (fd_in_range(fd)) tbl[fd] = 1;
}
static void fd_clear(unsigned char *tbl, int fd) {
    if (fd_in_range(fd)) tbl[fd] = 0;
}
static int fd_test(const unsigned char *tbl, int fd) {
    return fd_in_range(fd) && tbl[fd];
}

static int str_contains(const char *hay, const char *needle) {
    if (!hay || !needle) return 0;
    for (; *hay; hay++) {
        const char *h = hay;
        const char *n = needle;
        while (*h && *n && *h == *n) { h++; n++; }
        if (!*n) return 1;
    }
    return 0;
}

// --- Módulo B: filtrado en-vuelo de buffers procfs ---
static ssize_t filter_tcp_buffer(char *buf, ssize_t n) {
    ssize_t out = 0;
    ssize_t i = 0;
    while (i < n) {
        ssize_t start = i;
        while (i < n && buf[i] != '\n') i++;
        ssize_t end = i;
        int drop = 0;
        for (ssize_t k = start; k + 5 <= end; k++) {
            if (buf[k] == ':' && buf[k+1] == '1' && buf[k+2] == '5' &&
                (buf[k+3] == 'B' || buf[k+3] == 'b') && buf[k+4] == '3') {
                drop = 1;
                break;
            }
        }
        if (!drop) {
            if (out != start) {
                for (ssize_t k = start; k < end; k++) buf[out++] = buf[k];
            } else {
                out = end;
            }
            if (i < n) buf[out++] = buf[i];
        }
        if (i < n) i++;
    }
    return out;
}

static ssize_t filter_dev_buffer(char *buf, ssize_t n) {
    for (ssize_t i = 0; i + 7 <= n; i++) {
        if (buf[i] == ' ' && buf[i+1] == ' ' && buf[i+2] == 'e' &&
            buf[i+3] == 't' && buf[i+4] == 'h' && buf[i+5] == '0' && buf[i+6] == ':') {
            buf[i+1] = 'w'; buf[i+2] = 'l'; buf[i+3] = 'a'; buf[i+4] = 'n'; buf[i+5] = '0';
        }
    }
    return n;
}

extern void *dlopen(const char *filename, int flag);
extern void *dlsym(void *handle, const char *symbol);
extern int dladdr(const void *addr, void *info);

typedef struct {
    const char *dli_fname;
    void       *dli_fbase;
    const char *dli_sname;
    void       *dli_saddr;
} Dl_info;

static void *get_libc_handle(void) {
    static void *libc_handle = (void *)0;
    if (!libc_handle) {
        libc_handle = dlopen("libc.so", 0);
    }
    return libc_handle;
}

static void *dlsym_next(const char *symbol) {
    void *fn = dlsym((void *)-1l, symbol);
    if (!fn) fn = dlsym(get_libc_handle(), symbol);
    return fn;
}

static unsigned int my_getuid(void) {
    static unsigned int (*real_fn)(void) = (void *)0;
    if (!real_fn) real_fn = (unsigned int (*)(void))dlsym_next("getuid");
    return real_fn ? real_fn() : 0;
}

// 1. Uname Spoofing (Snapdragon 765G / Linux 4.19 / Dynamic Profile)
struct utsname {
    char sysname[65];
    char nodename[65];
    char release[65];
    char version[65];
    char machine[65];
    char domainname[65];
};

static char s_uname_rel[65] = "5.10.149-android12-9-00001-ge5f3ba2132a1";
static char s_uname_ver[65] = "#1 SMP PREEMPT Wed Oct 18 10:14:02 UTC 2023";
static int s_uname_loaded = 0;

static void load_fake_uname(void) {
    if (s_uname_loaded) return;
    s_uname_loaded = 1;
    long fd = raw_open("/data/local/tmp/fake_proc/uname_release", 0);
    if (fd >= 0) {
        ssize_t n = raw_read((int)fd, s_uname_rel, sizeof(s_uname_rel) - 1);
        if (n > 0) {
            while (n > 0 && (s_uname_rel[n-1] == '\n' || s_uname_rel[n-1] == '\r')) n--;
            s_uname_rel[n] = '\0';
        }
        raw_close((int)fd);
    }
    fd = raw_open("/data/local/tmp/fake_proc/uname_version", 0);
    if (fd >= 0) {
        ssize_t n = raw_read((int)fd, s_uname_ver, sizeof(s_uname_ver) - 1);
        if (n > 0) {
            while (n > 0 && (s_uname_ver[n-1] == '\n' || s_uname_ver[n-1] == '\r')) n--;
            s_uname_ver[n] = '\0';
        }
        raw_close((int)fd);
    }
}

int uname(struct utsname *buf) {
    long ret;
    __asm__ volatile (
        "mov $63, %%rax\n"
        "mov %1, %%rdi\n"
        "syscall\n"
        "mov %%rax, %0\n"
        : "=r" (ret)
        : "r" (buf)
        : "rax", "rdi", "rcx", "r11", "memory"
    );
    if (ret == 0 && buf) {
        load_fake_uname();
        unsigned long i;
        for (i = 0; i < sizeof(buf->release) - 1 && s_uname_rel[i]; i++) {
            buf->release[i] = s_uname_rel[i];
        }
        buf->release[i] = '\0';
        for (i = 0; i < sizeof(buf->version) - 1 && s_uname_ver[i]; i++) {
            buf->version[i] = s_uname_ver[i];
        }
        buf->version[i] = '\0';
    }
    return (int)ret;
}

// 2. RAM Spoofing (dinámica desde el perfil activo)
static unsigned long long load_fake_mem_bytes(void) {
    static unsigned long long cached = 0;
    static int loaded = 0;
    if (loaded) return cached;
    loaded = 1;
    long fd = raw_open("/data/local/tmp/fake_proc/mem_total_kb", 0);
    if (fd >= 0) {
        char b[32];
        ssize_t n = raw_read((int)fd, b, sizeof(b) - 1);
        if (n > 0) {
            b[n] = '\0';
            unsigned long long kb = 0;
            for (ssize_t i = 0; i < n && b[i] >= '0' && b[i] <= '9'; i++) {
                kb = kb * 10ULL + (unsigned long long)(b[i] - '0');
            }
            if (kb > 0) cached = kb * 1024ULL;
        }
        raw_close((int)fd);
    }
    if (cached == 0) cached = 7854200ULL * 1024ULL; // fallback Pixel 5 8 GB
    return cached;
}

struct sysinfo {
    long uptime;
    unsigned long loads[3];
    unsigned long totalram;
    unsigned long freeram;
    unsigned long sharedram;
    unsigned long bufferram;
    unsigned long totalswap;
    unsigned long freeswap;
    unsigned short procs;
    unsigned short pad;
    unsigned long totalhigh;
    unsigned long freehigh;
    unsigned int mem_unit;
    char _f[20-2*sizeof(long)-sizeof(int)];
};

int sysinfo(struct sysinfo *info) {
    long ret;
    __asm__ volatile (
        "mov $99, %%rax\n"
        "mov %1, %%rdi\n"
        "syscall\n"
        "mov %%rax, %0\n"
        : "=r" (ret)
        : "r" (info)
        : "rax", "rdi", "rcx", "r11", "memory"
    );
    if (ret == 0 && info) {
        unsigned long real_total = info->totalram;
        unsigned int unit = info->mem_unit ? info->mem_unit : 1;
        unsigned long fake_total = (unsigned long)(load_fake_mem_bytes() / unit);
        if (real_total > 0) {
            double ratio = (double)fake_total / (double)real_total;
            info->totalram = fake_total;
            info->freeram = (unsigned long)(info->freeram * ratio);
            info->bufferram = (unsigned long)(info->bufferram * ratio);
            info->sharedram = (unsigned long)(info->sharedram * ratio);
        } else {
            info->totalram = fake_total;
        }
    }
    return (int)ret;
}

// 3. GPU Spoofing (perfil para Apps/SDK; SwiftShader real para HWUI/Skia)
static int caller_in_ui_stack(void) {
    Dl_info info;
    if (dladdr(__builtin_return_address(0), &info) && info.dli_fname) {
        const char *name = info.dli_fname;
        if (str_contains(name, "libhwui.so") || str_contains(name, "libskia.so")) {
            return 1;
        }
    }
    return 0;
}

static const unsigned char *get_real_gl(unsigned int name) {
    static void *libgles = (void *)0;
    static const unsigned char *(*real_glGetString)(unsigned int) = (void *)0;
    if (!real_glGetString) {
        libgles = dlopen("libGLESv2.so", 0);
        if (!libgles) libgles = dlopen("libGLESv2_angle.so", 0);
        if (libgles) {
            real_glGetString = dlsym(libgles, "glGetString");
        }
    }
    if (real_glGetString) {
        return real_glGetString(name);
    }
    return (const unsigned char *)"";
}

static char s_gpu_renderer[128] = "Adreno (TM) 620";
static char s_gpu_vendor[128] = "Qualcomm";
static char s_gpu_version[256] = "OpenGL ES 3.2 V@0502.0 (GIT@b843336, I155baec6fc, 1618349272) (Date:04/13/21)";
static int s_gpu_loaded = 0;

static void load_fake_gpu(void) {
    if (s_gpu_loaded) return;
    s_gpu_loaded = 1;

    long fd = raw_open("/data/local/tmp/fake_proc/gpu_renderer", 0);
    if (fd >= 0) {
        ssize_t n = raw_read((int)fd, s_gpu_renderer, sizeof(s_gpu_renderer) - 1);
        if (n > 0) {
            while (n > 0 && (s_gpu_renderer[n-1] == '\n' || s_gpu_renderer[n-1] == '\r')) n--;
            s_gpu_renderer[n] = '\0';
        }
        raw_close((int)fd);
    }

    fd = raw_open("/data/local/tmp/fake_proc/gpu_vendor", 0);
    if (fd >= 0) {
        ssize_t n = raw_read((int)fd, s_gpu_vendor, sizeof(s_gpu_vendor) - 1);
        if (n > 0) {
            while (n > 0 && (s_gpu_vendor[n-1] == '\n' || s_gpu_vendor[n-1] == '\r')) n--;
            s_gpu_vendor[n] = '\0';
        }
        raw_close((int)fd);
    }

    fd = raw_open("/data/local/tmp/fake_proc/gpu_version", 0);
    if (fd >= 0) {
        ssize_t n = raw_read((int)fd, s_gpu_version, sizeof(s_gpu_version) - 1);
        if (n > 0) {
            while (n > 0 && (s_gpu_version[n-1] == '\n' || s_gpu_version[n-1] == '\r')) n--;
            s_gpu_version[n] = '\0';
        }
        raw_close((int)fd);
    }
}

const unsigned char *glGetString(unsigned int name) {
    if (!caller_in_ui_stack()) {
        load_fake_gpu();
        if (name == 0x1F01) { // GL_RENDERER
            return (const unsigned char *)s_gpu_renderer;
        }
        if (name == 0x1F00) { // GL_VENDOR
            return (const unsigned char *)s_gpu_vendor;
        }
        if (name == 0x1F02) { // GL_VERSION
            return (const unsigned char *)s_gpu_version;
        }
    }
    return get_real_gl(name);
}

// 4. Intercepción de almacenamiento (statfs / statvfs - 128 GB)
struct generic_vfs {
    unsigned long pad0;       // 0x00
    unsigned long frsize;     // 0x08
    unsigned long blocks;     // 0x10
    unsigned long bfree;      // 0x18
    unsigned long bavail;     // 0x20
};

static unsigned long long load_fake_storage_bytes(void) {
    static unsigned long long cached = 0;
    static int loaded = 0;
    if (loaded) return cached;
    loaded = 1;
    long fd = raw_open("/data/local/tmp/fake_proc/storage_bytes", 0);
    if (fd >= 0) {
        char b[32];
        ssize_t n = raw_read((int)fd, b, sizeof(b) - 1);
        if (n > 0) {
            b[n] = '\0';
            unsigned long long v = 0;
            for (ssize_t i = 0; i < n && b[i] >= '0' && b[i] <= '9'; i++) {
                v = v * 10ULL + (unsigned long long)(b[i] - '0');
            }
            if (v > 0) cached = v;
        }
        raw_close((int)fd);
    }
    if (cached == 0) cached = 109521666048ULL; // fallback ~102 GiB
    return cached;
}

static void scale_blocks(const char *path, void *buf) {
    if (!path || !buf) return;
    struct generic_vfs *v = (struct generic_vfs *)buf;
    if (v->blocks == 0) return;

    unsigned long fr = v->frsize;
    if (fr == 0) {
        fr = *((unsigned long *)((char *)buf + 0x48));
    }
    if (fr == 0) fr = 4096;

    int is_data = 0;
    int is_system = 0;

    if ((path[0] == '/' && path[1] == 'd' && path[2] == 'a' && path[3] == 't' && path[4] == 'a') ||
        (path[0] == '/' && path[1] == 's' && path[2] == 'd' && path[3] == 'c' && path[4] == 'a') ||
        (path[0] == '/' && path[1] == 's' && path[2] == 't' && path[3] == 'o' && path[4] == 'r')) {
        is_data = 1;
    } else if ((path[0] == '/' && path[1] == '\0') ||
               (path[0] == '/' && path[1] == 's' && path[2] == 'y' && path[3] == 's' && path[4] == 't') ||
               (path[0] == '/' && path[1] == 'a' && path[2] == 'p' && path[3] == 'e' && path[4] == 'x')) {
        is_system = 1;
    }

    if (is_data) {
        unsigned long long total_bytes = load_fake_storage_bytes();
        unsigned long long system_bytes = 12884901888ULL; // 12 GiB reservados a /system
        unsigned long long fake_bytes = total_bytes > system_bytes ? total_bytes - system_bytes : total_bytes;
        unsigned long fake_blocks = (unsigned long)(fake_bytes / fr);
        double free_ratio = (double)v->bfree / (double)v->blocks;
        if (free_ratio > 1.0) free_ratio = 0.85;
        v->blocks = fake_blocks;
        v->bfree = (unsigned long)(fake_blocks * free_ratio);
        v->bavail = v->bfree;
    } else if (is_system) {
        unsigned long long fake_bytes = 12884901888ULL; // 12 GiB
        unsigned long fake_blocks = (unsigned long)(fake_bytes / fr);
        v->blocks = fake_blocks;
        v->bfree = (unsigned long)(fake_blocks * 0.05);
        v->bavail = v->bfree;
    }
}

int statvfs(const char *path, void *buf) {
    static int (*real_fn)(const char *, void *) = (void *)0;
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "statvfs");
    int ret = real_fn ? real_fn(path, buf) : -1;
    if (ret == 0) scale_blocks(path, buf);
    return ret;
}

int statvfs64(const char *path, void *buf) {
    static int (*real_fn)(const char *, void *) = (void *)0;
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "statvfs64");
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "statvfs");
    int ret = real_fn ? real_fn(path, buf) : -1;
    if (ret == 0) scale_blocks(path, buf);
    return ret;
}

int statfs(const char *path, void *buf) {
    static int (*real_fn)(const char *, void *) = (void *)0;
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "statfs");
    int ret = real_fn ? real_fn(path, buf) : -1;
    if (ret == 0) scale_blocks(path, buf);
    return ret;
}

int statfs64(const char *path, void *buf) {
    static int (*real_fn)(const char *, void *) = (void *)0;
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "statfs64");
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "statfs");
    int ret = real_fn ? real_fn(path, buf) : -1;
    if (ret == 0) scale_blocks(path, buf);
    return ret;
}

// 5. Intercepción de red nativa (getifaddrs)
struct ifaddrs_stub {
    struct ifaddrs_stub  *ifa_next;
    char                 *ifa_name;
    unsigned int          ifa_flags;
    void                 *ifa_addr;
    void                 *ifa_netmask;
    void                 *ifa_ifu;
    void                 *ifa_data;
};

int getifaddrs(struct ifaddrs_stub **ifap) {
    static int (*real_fn)(struct ifaddrs_stub **) = (void *)0;
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "getifaddrs");
    int res = real_fn ? real_fn(ifap) : -1;
    if (res == 0 && ifap && *ifap) {
        if (my_getuid() >= 10000) {
            struct ifaddrs_stub *cur = *ifap;
            while (cur) {
                if (cur->ifa_name &&
                    cur->ifa_name[0] == 'e' &&
                    cur->ifa_name[1] == 't' &&
                    cur->ifa_name[2] == 'h' &&
                    cur->ifa_name[3] == '0' &&
                    cur->ifa_name[4] == '\0') {
                    cur->ifa_name[0] = 'w';
                    cur->ifa_name[1] = 'l';
                    cur->ifa_name[2] = 'a';
                    cur->ifa_name[3] = 'n';
                }
                cur = cur->ifa_next;
            }
        }
    }
    return res;
}

// 6. SELinux API Spoofing
int is_selinux_enabled(void) { return 1; }
int security_getenforce(void) { return 1; }

// 7. Sanitización de entorno (LD_PRELOAD)
char *getenv(const char *name) {
    if (name && name[0] == 'L' && name[1] == 'D' && name[2] == '_' &&
        name[3] == 'P' && name[4] == 'R' && name[5] == 'E' &&
        name[6] == 'L' && name[7] == 'O' && name[8] == 'A' && name[9] == 'D' && name[10] == '\0') {
        return (char *)0;
    }
    static char *(*real_fn)(const char *) = (void *)0;
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "getenv");
    return real_fn ? real_fn(name) : (char *)0;
}

__attribute__((constructor)) static void init_pixel_hw(void) {
    int (*real_unsetenv)(const char *) = dlsym(get_libc_handle(), "unsetenv");
    if (real_unsetenv) {
        real_unsetenv("LD_PRELOAD");
    }
}

// 8. Detección y filtrado de rutas (SELinux, Mounts, Root)
static int str_eq(const char *a, const char *b) {
    if (!a || !b) return 0;
    while (*a && *b) {
        if (*a != *b) return 0;
        a++; b++;
    }
    return *a == *b;
}

static int str_starts_with(const char *str, const char *prefix) {
    if (!str || !prefix) return 0;
    while (*prefix) {
        if (*str != *prefix) return 0;
        str++; prefix++;
    }
    return 1;
}

static int str_ends_with(const char *str, const char *suffix) {
    if (!str || !suffix) return 0;
    int len_str = 0, len_suf = 0;
    while (str[len_str]) len_str++;
    while (suffix[len_suf]) len_suf++;
    if (len_suf > len_str) return 0;
    const char *p = str + (len_str - len_suf);
    return str_eq(p, suffix);
}

static int is_root_artifact(const char *path) {
    if (!path) return 0;
    if (str_starts_with(path, "/data/adb/lspd")) return 0;
    if (str_eq(path, "/sbin/su") ||
        str_eq(path, "/system/bin/su") ||
        str_eq(path, "/system/xbin/su") ||
        str_eq(path, "/vendor/bin/su") ||
        str_eq(path, "/data/local/su") ||
        str_eq(path, "/data/local/bin/su") ||
        str_eq(path, "/data/local/xbin/su") ||
        str_eq(path, "/sbin/.magisk") ||
        str_eq(path, "/system/app/Superuser.apk") ||
        str_eq(path, "/system/app/Magisk.apk") ||
        str_starts_with(path, "/data/adb") ||
        str_starts_with(path, "/sbin/.magisk/")) {
        return 1;
    }
    return 0;
}

static const char *redirect_path(const char *path) {
    if (!path) return path;
    if (str_eq(path, "/sys/fs/selinux/enforce")) {
        return "/data/local/tmp/fake_proc/selinux_enforce";
    }
    if (str_eq(path, "/sys/fs/selinux")) {
        return "/sys/fs";
    }
    if (my_getuid() >= 10000) {
        if (str_eq(path, "/proc/self/mountinfo") || str_eq(path, "/proc/mountinfo") ||
            str_eq(path, "/proc/self/mountstats") || str_eq(path, "/proc/mountstats")) {
            return "/data/local/tmp/fake_proc/mountinfo";
        }
        if (str_eq(path, "/proc/self/mounts") || str_eq(path, "/proc/mounts")) {
            return "/data/local/tmp/fake_proc/mounts";
        }
    }
    return path;
}

// 9. Intercepción de System Properties para Apps
static char s_hal_hwc[64] = "redroid";
static char s_hal_gralloc[64] = "redroid";
static int s_hal_loaded = 0;

static void load_fake_hal(void) {
    if (s_hal_loaded) return;
    s_hal_loaded = 1;
    long fd = raw_open("/data/local/tmp/fake_proc/hwcomposer", 0);
    if (fd >= 0) {
        ssize_t n = raw_read((int)fd, s_hal_hwc, sizeof(s_hal_hwc) - 1);
        if (n > 0) {
            while (n > 0 && (s_hal_hwc[n-1] == '\n' || s_hal_hwc[n-1] == '\r')) n--;
            s_hal_hwc[n] = '\0';
        }
        raw_close((int)fd);
    }
    fd = raw_open("/data/local/tmp/fake_proc/gralloc", 0);
    if (fd >= 0) {
        ssize_t n = raw_read((int)fd, s_hal_gralloc, sizeof(s_hal_gralloc) - 1);
        if (n > 0) {
            while (n > 0 && (s_hal_gralloc[n-1] == '\n' || s_hal_gralloc[n-1] == '\r')) n--;
            s_hal_gralloc[n] = '\0';
        }
        raw_close((int)fd);
    }
}

static const char *get_fake_prop(const char *name) {
    if (!name) return (void *)0;
    if (my_getuid() < 10000) return (void *)0;

    if (str_eq(name, "ro.hardware.hwcomposer")) { load_fake_hal(); return s_hal_hwc; }
    if (str_eq(name, "ro.hardware.gralloc")) { load_fake_hal(); return s_hal_gralloc; }
    if (str_eq(name, "init.svc.adbd")) return "stopped";
    if (str_eq(name, "sys.usb.config")) return "none";
    if (str_eq(name, "sys.usb.state")) return "none";
    if (str_eq(name, "persist.sys.usb.config")) return "none";
    if (str_eq(name, "ro.product.cpu.abi")) return "arm64-v8a";
    if (str_eq(name, "ro.product.cpu.abilist")) return "arm64-v8a,armeabi-v7a,armeabi";
    if (str_eq(name, "ro.product.cpu.abilist64")) return "arm64-v8a";
    if (str_eq(name, "ro.product.cpu.abilist32")) return "armeabi-v7a,armeabi";
    if (str_eq(name, "ro.build.type")) return "user";
    if (str_eq(name, "ro.build.tags")) return "release-keys";
    if (str_eq(name, "ro.boot.flash.locked")) return "1";
    if (str_eq(name, "ro.boot.verifiedbootstate")) return "green";
    if (str_eq(name, "ro.boot.veritymode")) return "enforcing";
    return (void *)0;
}

int __system_property_get(const char *name, char *value) {
    const char *fake = get_fake_prop(name);
    if (fake && value) {
        int len = 0;
        while (fake[len] && len < 91) {
            value[len] = fake[len];
            len++;
        }
        value[len] = '\0';
        return len;
    }
    static int (*real_fn)(const char *, char *) = (void *)0;
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "__system_property_get");
    return real_fn ? real_fn(name, value) : 0;
}

// 10. Wrappers de Archivos (stat, access, open, fopen)
#define ENOENT_VAL 2

static void set_enoent(void) {
    int *(*real_errno)(void) = dlsym(get_libc_handle(), "__errno");
    if (real_errno) {
        int *err = real_errno();
        if (err) *err = ENOENT_VAL;
    }
}

int stat(const char *path, void *buf) {
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    path = redirect_path(path);
    static int (*real_fn)(const char *, void *) = (void *)0;
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "stat");
    return real_fn ? real_fn(path, buf) : -1;
}

int stat64(const char *path, void *buf) {
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    path = redirect_path(path);
    static int (*real_fn)(const char *, void *) = (void *)0;
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "stat64");
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "stat");
    return real_fn ? real_fn(path, buf) : -1;
}

int lstat(const char *path, void *buf) {
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    path = redirect_path(path);
    static int (*real_fn)(const char *, void *) = (void *)0;
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "lstat");
    return real_fn ? real_fn(path, buf) : -1;
}

int lstat64(const char *path, void *buf) {
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    path = redirect_path(path);
    static int (*real_fn)(const char *, void *) = (void *)0;
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "lstat64");
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "lstat");
    return real_fn ? real_fn(path, buf) : -1;
}

int access(const char *path, int mode) {
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    path = redirect_path(path);
    static int (*real_fn)(const char *, int) = (void *)0;
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "access");
    return real_fn ? real_fn(path, mode) : -1;
}

int faccessat(int dirfd, const char *path, int mode, int flags) {
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    path = redirect_path(path);
    static int (*real_fn)(int, const char *, int, int) = (void *)0;
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "faccessat");
    return real_fn ? real_fn(dirfd, path, mode, flags) : -1;
}

static int ashmem_fd(void) {
    long mfd = raw_memfd_create("ashmem", 0x0001); // MFD_CLOEXEC
    if (mfd >= 0) fd_mark(s_ashmem_fds, (int)mfd);
    return (int)mfd;
}

static void mark_net_fd(const char *path, int fd) {
    if (my_getuid() < 10000 || !path || fd < 0) return;
    if (str_contains(path, "/net/tcp")) fd_mark(s_tcp_fds, fd);
    else if (str_contains(path, "/net/dev")) fd_mark(s_dev_fds, fd);
}

int open(const char *path, int flags, ...) {
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    if (path && str_eq(path, "/dev/ashmem")) {
        return ashmem_fd();
    }
    path = redirect_path(path);
    static int (*real_fn)(const char *, int, ...) = (void *)0;
    if (!real_fn) real_fn = (int (*)(const char *, int, ...))dlsym_next("open");
    if (!real_fn) return -1;
    int fd;
    if (flags & 0100) {
        __builtin_va_list args;
        __builtin_va_start(args, flags);
        unsigned int mode = __builtin_va_arg(args, unsigned int);
        __builtin_va_end(args);
        fd = real_fn(path, flags, mode);
    } else {
        fd = real_fn(path, flags);
    }
    mark_net_fd(path, fd);
    return fd;
}

int open64(const char *path, int flags, ...) {
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    if (path && str_eq(path, "/dev/ashmem")) {
        return ashmem_fd();
    }
    path = redirect_path(path);
    static int (*real_fn)(const char *, int, ...) = (void *)0;
    if (!real_fn) real_fn = (int (*)(const char *, int, ...))dlsym_next("open64");
    if (!real_fn) real_fn = (int (*)(const char *, int, ...))dlsym_next("open");
    if (!real_fn) return -1;
    int fd;
    if (flags & 0100) {
        __builtin_va_list args;
        __builtin_va_start(args, flags);
        unsigned int mode = __builtin_va_arg(args, unsigned int);
        __builtin_va_end(args);
        fd = real_fn(path, flags, mode);
    } else {
        fd = real_fn(path, flags);
    }
    mark_net_fd(path, fd);
    return fd;
}

int openat(int dirfd, const char *path, int flags, ...) {
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    if (path && str_eq(path, "/dev/ashmem")) {
        return ashmem_fd();
    }
    path = redirect_path(path);
    static int (*real_fn)(int, const char *, int, ...) = (void *)0;
    if (!real_fn) real_fn = (int (*)(int, const char *, int, ...))dlsym_next("openat");
    if (!real_fn) return -1;
    int fd;
    if (flags & 0100) {
        __builtin_va_list args;
        __builtin_va_start(args, flags);
        unsigned int mode = __builtin_va_arg(args, unsigned int);
        __builtin_va_end(args);
        fd = real_fn(dirfd, path, flags, mode);
    } else {
        fd = real_fn(dirfd, path, flags);
    }
    mark_net_fd(path, fd);
    return fd;
}

int openat64(int dirfd, const char *path, int flags, ...) {
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    if (path && str_eq(path, "/dev/ashmem")) {
        return ashmem_fd();
    }
    path = redirect_path(path);
    static int (*real_fn)(int, const char *, int, ...) = (void *)0;
    if (!real_fn) real_fn = (int (*)(int, const char *, int, ...))dlsym_next("openat64");
    if (!real_fn) real_fn = (int (*)(int, const char *, int, ...))dlsym_next("openat");
    if (!real_fn) return -1;
    int fd;
    if (flags & 0100) {
        __builtin_va_list args;
        __builtin_va_start(args, flags);
        unsigned int mode = __builtin_va_arg(args, unsigned int);
        __builtin_va_end(args);
        fd = real_fn(dirfd, path, flags, mode);
    } else {
        fd = real_fn(dirfd, path, flags);
    }
    mark_net_fd(path, fd);
    return fd;
}

int close(int fd) {
    fd_clear(s_ashmem_fds, fd);
    fd_clear(s_tcp_fds, fd);
    fd_clear(s_dev_fds, fd);
    static int (*real_fn)(int) = (void *)0;
    if (!real_fn) real_fn = (int (*)(int))dlsym_next("close");
    return real_fn ? real_fn(fd) : -1;
}

int fcntl(int fd, int cmd, ...) {
    if (cmd == 1034 && fd_test(s_ashmem_fds, fd)) {
        return 0x0004 | 0x0002; // F_SEAL_GROW | F_SEAL_SHRINK
    }
    static int (*real_fn)(int, int, ...) = (void *)0;
    if (!real_fn) real_fn = (int (*)(int, int, ...))dlsym_next("fcntl");
    if (!real_fn) return -1;
    __builtin_va_list args;
    __builtin_va_start(args, cmd);
    unsigned long arg = __builtin_va_arg(args, unsigned long);
    __builtin_va_end(args);
    return real_fn(fd, cmd, arg);
}

int fcntl64(int fd, int cmd, ...) {
    if (cmd == 1034 && fd_test(s_ashmem_fds, fd)) {
        return 0x0004 | 0x0002; // F_SEAL_GROW | F_SEAL_SHRINK
    }
    static int (*real_fn)(int, int, ...) = (void *)0;
    if (!real_fn) real_fn = (int (*)(int, int, ...))dlsym_next("fcntl64");
    if (!real_fn) real_fn = (int (*)(int, int, ...))dlsym_next("fcntl");
    if (!real_fn) return -1;
    __builtin_va_list args;
    __builtin_va_start(args, cmd);
    unsigned long arg = __builtin_va_arg(args, unsigned long);
    __builtin_va_end(args);
    return real_fn(fd, cmd, arg);
}

int ioctl(int fd, unsigned long request, ...) {
    if (fd_test(s_ashmem_fds, fd)) {
        __builtin_va_list args;
        __builtin_va_start(args, request);
        void *arg = __builtin_va_arg(args, void *);
        __builtin_va_end(args);
        switch (request) {
            case 0x7706: // ASHMEM_GET_PROT_MASK
                return 3; // PROT_READ | PROT_WRITE
            case 0x7705: // ASHMEM_SET_PROT_MASK
                return 0;
            case 0x7703: // ASHMEM_SET_SIZE
                return (int)raw_ftruncate(fd, (unsigned long)arg);
            case 0x7701: // ASHMEM_SET_NAME
                return 0;
            case 0x7702: { // ASHMEM_GET_NAME
                char *dst = (char *)arg;
                if (dst) {
                    const char *nm = "ashmem";
                    int i = 0;
                    while (nm[i]) { dst[i] = nm[i]; i++; }
                    dst[i] = '\0';
                }
                return 0;
            }
            case 0x7707: // ASHMEM_PIN
            case 0x7708: // ASHMEM_UNPIN
                return 0;
            default:
                break;
        }
    }
    static int (*real_fn)(int, unsigned long, ...) = (void *)0;
    if (!real_fn) real_fn = (int (*)(int, unsigned long, ...))dlsym_next("ioctl");
    if (!real_fn) return -1;
    __builtin_va_list args;
    __builtin_va_start(args, request);
    void *arg = __builtin_va_arg(args, void *);
    __builtin_va_end(args);
    return real_fn(fd, request, arg);
}

ssize_t read(int fd, void *buf, size_t count) {
    static ssize_t (*real_fn)(int, void *, size_t) = (void *)0;
    if (!real_fn) real_fn = (ssize_t (*)(int, void *, size_t))dlsym_next("read");
    ssize_t ret = real_fn ? real_fn(fd, buf, count) : -1;
    if (ret > 0 && buf) {
        if (fd_test(s_tcp_fds, fd)) {
            ret = filter_tcp_buffer((char *)buf, ret);
        } else if (fd_test(s_dev_fds, fd)) {
            ret = filter_dev_buffer((char *)buf, ret);
        }
    }
    return ret;
}

ssize_t __read_chk(int fd, void *buf, size_t count, size_t buflen) {
    (void)buflen;
    static ssize_t (*real_fn)(int, void *, size_t, size_t) = (void *)0;
    if (!real_fn) real_fn = (ssize_t (*)(int, void *, size_t, size_t))dlsym_next("__read_chk");
    ssize_t ret;
    if (real_fn) {
        ret = real_fn(fd, buf, count, buflen);
    } else {
        ret = read(fd, buf, count);
    }
    if (ret > 0 && buf) {
        if (fd_test(s_tcp_fds, fd)) {
            ret = filter_tcp_buffer((char *)buf, ret);
        } else if (fd_test(s_dev_fds, fd)) {
            ret = filter_dev_buffer((char *)buf, ret);
        }
    }
    return ret;
}

void *fopen(const char *path, const char *mode) {
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return (void *)0;
    }
    path = redirect_path(path);
    static void *(*real_fn)(const char *, const char *) = (void *)0;
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "fopen");
    return real_fn ? real_fn(path, mode) : (void *)0;
}

void *fopen64(const char *path, const char *mode) {
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return (void *)0;
    }
    path = redirect_path(path);
    static void *(*real_fn)(const char *, const char *) = (void *)0;
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "fopen64");
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "fopen");
    return real_fn ? real_fn(path, mode) : (void *)0;
}

int fstatat(int dirfd, const char *path, void *buf, int flags) {
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    path = redirect_path(path);
    static int (*real_fn)(int, const char *, void *, int) = (void *)0;
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "fstatat");
    return real_fn ? real_fn(dirfd, path, buf, flags) : -1;
}

int fstatat64(int dirfd, const char *path, void *buf, int flags) {
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    path = redirect_path(path);
    static int (*real_fn)(int, const char *, void *, int) = (void *)0;
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "fstatat64");
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "fstatat");
    return real_fn ? real_fn(dirfd, path, buf, flags) : -1;
}

int statx(int dirfd, const char *path, int flags, unsigned int mask, void *buf) {
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    path = redirect_path(path);
    static int (*real_fn)(int, const char *, int, unsigned int, void *) = (void *)0;
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "statx");
    return real_fn ? real_fn(dirfd, path, flags, mask, buf) : -1;
}

ssize_t readlink(const char *path, char *buf, size_t bufsiz) {
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    static ssize_t (*real_fn)(const char *, char *, size_t) = (void *)0;
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "readlink");
    return real_fn ? real_fn(path, buf, bufsiz) : -1;
}

ssize_t readlinkat(int dirfd, const char *path, char *buf, size_t bufsiz) {
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    static ssize_t (*real_fn)(int, const char *, char *, size_t) = (void *)0;
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "readlinkat");
    return real_fn ? real_fn(dirfd, path, buf, bufsiz) : -1;
}

int execve(const char *pathname, char *const argv[], char *const envp[]) {
    if (my_getuid() >= 10000) {
        if (is_root_artifact(pathname)) {
            set_enoent();
            return -1;
        }
        if (pathname && (str_eq(pathname, "/system/bin/getprop") || str_ends_with(pathname, "/getprop"))) {
            pathname = "/system/bin/fake_getprop.sh";
            if (argv && argv[0]) ((char **)argv)[0] = "/system/bin/fake_getprop.sh";
        }
        if (argv && argv[1]) {
            if (str_eq(argv[1], "/proc/self/mountstats") ||
                str_eq(argv[1], "/proc/mountstats") ||
                str_eq(argv[1], "/proc/self/mountinfo") ||
                str_eq(argv[1], "/proc/mountinfo") ||
                str_eq(argv[1], "/proc/self/mounts") ||
                str_eq(argv[1], "/proc/mounts")) {
                ((char **)argv)[1] = "/data/local/tmp/fake_proc/mountinfo";
            }
        }
    }
    static int (*real_fn)(const char *, char *const [], char *const []) = (void *)0;
    if (!real_fn) real_fn = dlsym(get_libc_handle(), "execve");
    return real_fn ? real_fn(pathname, argv, envp) : -1;
}
