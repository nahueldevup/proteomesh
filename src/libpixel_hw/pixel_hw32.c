#define _GNU_SOURCE
#include <stddef.h>
typedef int ssize_t;

static long raw_open(const char *path, int flags) {
    register long eax asm("eax") = 5; // SYS_open
    register long ebx asm("ebx") = (long)path;
    register long ecx asm("ecx") = (long)flags;
    register long edx asm("edx") = 0;
    __asm__ volatile (
        "int $0x80"
        : "+r" (eax)
        : "r" (ebx), "r" (ecx), "r" (edx)
        : "memory"
    );
    return eax;
}

static long raw_read(int fd, void *buf, unsigned long count) {
    register long eax asm("eax") = 3; // SYS_read
    register long ebx asm("ebx") = (long)fd;
    register long ecx asm("ecx") = (long)buf;
    register long edx asm("edx") = (long)count;
    __asm__ volatile (
        "int $0x80"
        : "+r" (eax)
        : "r" (ebx), "r" (ecx), "r" (edx)
        : "memory"
    );
    return eax;
}

static long raw_close(int fd) {
    register long eax asm("eax") = 6; // SYS_close
    register long ebx asm("ebx") = (long)fd;
    __asm__ volatile (
        "int $0x80"
        : "+r" (eax)
        : "r" (ebx)
        : "memory"
    );
    return eax;
}

static long raw_memfd_create(const char *name, unsigned int flags) {
    register long eax asm("eax") = 356; // SYS_memfd_create (i386)
    register long ebx asm("ebx") = (long)name;
    register long ecx asm("ecx") = (long)flags;
    __asm__ volatile (
        "int $0x80"
        : "+r" (eax)
        : "r" (ebx), "r" (ecx)
        : "memory"
    );
    return eax;
}

// readlinkat/ mmap / munmap por syscall raw: la clasificacion de fds ajenos
// recibidos por binder/SCM_RIGHTS ocurre en dominios (isolated_app) donde
// readlink(2) puede estar bloqueado por seccomp y libc no es de fiar.
static long raw_readlinkat(int dirfd, const char *path, char *buf, unsigned long size) {
    register long eax asm("eax") = 305; // SYS_readlinkat (i386)
    register long ebx asm("ebx") = (long)dirfd;
    register long ecx asm("ecx") = (long)path;
    register long edx asm("edx") = (long)buf;
    register long esi asm("esi") = (long)size;
    __asm__ volatile (
        "int $0x80"
        : "+r" (eax)
        : "r" (ebx), "r" (ecx), "r" (edx), "r" (esi)
        : "memory"
    );
    return eax;
}

static long raw_mmap(int fd, int prot) {
    register long eax asm("eax") = 192; // SYS_mmap2 (i386)
    register long ebx asm("ebx") = 0;
    register long ecx asm("ecx") = 4096;
    register long edx asm("edx") = (long)prot;
    register long esi asm("esi") = 1; // MAP_SHARED
    register long edi asm("edi") = (long)fd;
    register long ebp asm("ebp") = 0;
    __asm__ volatile (
        "int $0x80"
        : "+r" (eax)
        : "r" (ebx), "r" (ecx), "r" (edx), "r" (esi), "r" (edi), "r" (ebp)
        : "memory"
    );
    return eax;
}

static long raw_munmap(void *addr, unsigned long len) {
    register long eax asm("eax") = 91; // SYS_munmap (i386)
    register long ebx asm("ebx") = (long)addr;
    register long ecx asm("ecx") = (long)len;
    __asm__ volatile (
        "int $0x80"
        : "+r" (eax)
        : "r" (ebx), "r" (ecx)
        : "memory"
    );
    return eax;
}

static long raw_ftruncate(int fd, unsigned long long length) {
    register long eax asm("eax") = 194; // SYS_ftruncate64 (i386)
    register long ebx asm("ebx") = (long)fd;
    register long ecx asm("ecx") = (long)(unsigned int)(length & 0xffffffffULL);
    register long edx asm("edx") = (long)(unsigned int)(length >> 32);
    __asm__ volatile (
        "int $0x80"
        : "+r" (eax)
        : "r" (ebx), "r" (ecx), "r" (edx)
        : "memory"
    );
    return eax;
}

static long raw_lseek(int fd, long offset, int whence) {
    register long eax asm("eax") = 19; // SYS_lseek (i386)
    register long ebx asm("ebx") = (long)fd;
    register long ecx asm("ecx") = offset;
    register long edx asm("edx") = (long)whence;
    __asm__ volatile (
        "int $0x80"
        : "+r" (eax)
        : "r" (ebx), "r" (ecx), "r" (edx)
        : "memory"
    );
    return eax;
}

static long raw_write(int fd, const void *buf, unsigned long count) {
    register long eax asm("eax") = 4; // SYS_write
    register long ebx asm("ebx") = (long)fd;
    register long ecx asm("ecx") = (long)buf;
    register long edx asm("edx") = (long)count;
    __asm__ volatile (
        "int $0x80"
        : "+r" (eax)
        : "r" (ebx), "r" (ecx), "r" (edx)
        : "memory"
    );
    return eax;
}

static long raw_getpid(void) {
    register long eax asm("eax") = 20; // SYS_getpid
    __asm__ volatile (
        "int $0x80"
        : "+r" (eax)
        :
        : "memory"
    );
    return eax;
}

static long raw_fcntl(int fd, int cmd, long arg) {
    register long eax asm("eax") = 55; // SYS_fcntl
    register long ebx asm("ebx") = (long)fd;
    register long ecx asm("ecx") = (long)cmd;
    register long edx asm("edx") = arg;
    __asm__ volatile (
        "int $0x80"
        : "+r" (eax)
        : "r" (ebx), "r" (ecx), "r" (edx)
        : "memory"
    );
    return eax;
}

// --- Módulo A/B: seguimiento de descriptores en memoria ---
#define FD_TABLE_SIZE 65536
static unsigned char s_ashmem_fds[FD_TABLE_SIZE];
static unsigned char s_tcp_fds[FD_TABLE_SIZE];
static unsigned char s_dev_fds[FD_TABLE_SIZE];
static unsigned char s_route_fds[FD_TABLE_SIZE];
static unsigned char s_arp_fds[FD_TABLE_SIZE];

static unsigned char s_fake_ipv4[4];
static unsigned char s_router_mac[6];
static int s_fake_net_ok = 0;

#define FAKE_NET_A 192
#define FAKE_NET_B 168
#define FAKE_NET_C 1

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

static void load_fake_mac(void);

static int hex_val(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

static char hex_chr(int v) {
    return (char)(v < 10 ? '0' + v : 'a' + (v - 10));
}

// /proc/net/tcp: remapea direcciones locales/remotas de la subred Docker
// 172.17.0.0/16 (hex little-endian YY0011AC) a la LAN ficticia 192.168.1.0/24.
// El gateway (.1) va a 192.168.1.1; el resto a la IP derivada de la MAC del
// perfil (asi la IP propia coincide con getifaddrs y DhcpInfo). Solo toca los
// 8 hex previos a cada ':' (nunca puertos).
static ssize_t remap_tcp_addrs(char *s, ssize_t len) {
    load_fake_mac();
    for (ssize_t k = 8; k < len; k++) {
        if (s[k] != ':') continue;
        int ok = 1;
        for (ssize_t j = k - 8; j < k; j++) {
            if (hex_val(s[j]) < 0) { ok = 0; break; }
        }
        if (!ok) continue;
        if (s[k-4] == '1' && s[k-3] == '1' &&
            (s[k-2] == 'A' || s[k-2] == 'a') &&
            (s[k-1] == 'C' || s[k-1] == 'c')) {
            int y = (hex_val(s[k-8]) << 4) | hex_val(s[k-7]);
            int host = (y == 1 || !s_fake_net_ok) ? y : s_fake_ipv4[3];
            s[k-8]=hex_chr(host >> 4); s[k-7]=hex_chr(host & 0xF);
            s[k-6]='0'; s[k-5]='1'; s[k-4]='A'; s[k-3]='8'; s[k-2]='C'; s[k-1]='0';
        }
    }
    return len;
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
            ssize_t ostart = out;
            if (out != start) {
                for (ssize_t k = start; k < end; k++) buf[out++] = buf[k];
            } else {
                out = end;
            }
            remap_tcp_addrs(buf + ostart, out - ostart);
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

// /proc/net/route y /proc/net/arp: el kernel del contenedor usa eth0 y la
// subred Docker 172.17.0.0/16. Las apps ven wlan0 en una LAN privada ficticia
// 192.168.1.0/24 (IP derivada de la MAC del perfil, coherente con DhcpInfo).
static void replace_fixed(char *buf, ssize_t n, const char *from, const char *to) {
    for (ssize_t i = 0; i + 8 <= n; i++) {
        int match = 1;
        for (int k = 0; k < 8; k++) {
            if (buf[i + k] != from[k]) { match = 0; break; }
        }
        if (match) {
            for (int k = 0; k < 8; k++) buf[i + k] = to[k];
            i += 7;
        }
    }
}

static ssize_t filter_route_buffer(char *buf, ssize_t n, size_t cap) {
    ssize_t i = 0;
    while (i + 4 <= n) {
        int line_start = (i == 0) || (buf[i - 1] == '\n');
        if (line_start && buf[i] == 'e' && buf[i+1] == 't' &&
            buf[i+2] == 'h' && buf[i+3] == '0') {
            char sep = (i + 4 < n) ? buf[i + 4] : '\0';
            if ((sep == '\t' || sep == ' ' || sep == '\0') &&
                (size_t)(n + 1) <= cap) {
                for (ssize_t j = n; j > i + 4; j--) buf[j] = buf[j - 1];
                buf[i] = 'w'; buf[i+1] = 'l'; buf[i+2] = 'a';
                buf[i+3] = 'n'; buf[i+4] = '0';
                n++;
                i += 5;
                continue;
            }
        }
        i++;
    }
    replace_fixed(buf, n, "000011AC", "0001A8C0");
    replace_fixed(buf, n, "010011AC", "0101A8C0");
    replace_fixed(buf, n, "0000FFFF", "00FFFFFF");
    return n;
}

static ssize_t filter_arp_buffer(char *buf, ssize_t n, size_t cap) {
    load_fake_mac();
    for (ssize_t i = 0; i + 5 <= n; i++) {
        if (buf[i] == ' ' && buf[i+1] == 'e' && buf[i+2] == 't' &&
            buf[i+3] == 'h' && buf[i+4] == '0' &&
            (i + 5 == n || buf[i+5] == '\n' || buf[i+5] == '\r')) {
            buf[i] = 'w'; buf[i+1] = 'l'; buf[i+2] = 'a'; buf[i+3] = 'n'; buf[i+4] = '0';
            i += 4;
        }
    }
    ssize_t ls = 0;
    while (ls < n) {
        ssize_t le = ls;
        while (le < n && buf[le] != '\n') le++;
        int is_fake = 0;
        int oct = -1;
        if (le - ls >= 10 &&
            buf[ls] == '1' && buf[ls+1] == '7' && buf[ls+2] == '2' && buf[ls+3] == '.' &&
            buf[ls+4] == '1' && buf[ls+5] == '7' && buf[ls+6] == '.' &&
            buf[ls+7] == '0' && buf[ls+8] == '.') {
            ssize_t ds = ls + 9, d = 0;
            while (ds + d < le && d < 3 && buf[ds+d] >= '0' && buf[ds+d] <= '9') d++;
            if (d >= 1 && (size_t)(n + 1) <= cap) {
                oct = 0;
                for (ssize_t k = 0; k < d; k++) oct = oct * 10 + (buf[ds+k] - '0');
                for (ssize_t j = n; j > ds; j--) buf[j] = buf[j - 1];
                buf[ls]='1'; buf[ls+1]='9'; buf[ls+2]='2'; buf[ls+3]='.';
                buf[ls+4]='1'; buf[ls+5]='6'; buf[ls+6]='8'; buf[ls+7]='.';
                buf[ls+8]='1'; buf[ls+9]='.';
                n++;
                le++;
                is_fake = 1;
            }
        } else if (le - ls >= 10 &&
                   buf[ls] == '1' && buf[ls+1] == '9' && buf[ls+2] == '2' && buf[ls+3] == '.' &&
                   buf[ls+4] == '1' && buf[ls+5] == '6' && buf[ls+6] == '8' && buf[ls+7] == '.' &&
                   buf[ls+8] == '1' && buf[ls+9] == '.') {
            ssize_t ds = ls + 9, d = 0;
            while (ds + d < le && d < 3 && buf[ds+d] >= '0' && buf[ds+d] <= '9') d++;
            if (d >= 1) {
                oct = 0;
                for (ssize_t k = 0; k < d; k++) oct = oct * 10 + (buf[ds+k] - '0');
                is_fake = 1;
            }
        }
        if (is_fake && oct == 1 && s_fake_net_ok) {
            for (ssize_t p = ls; p + 17 <= le; p++) {
                int mac_ok = 1;
                for (int k = 0; k < 17; k++) {
                    if (k % 3 == 2) {
                        if (buf[p + k] != ':') { mac_ok = 0; break; }
                    } else if (hex_val(buf[p + k]) < 0) { mac_ok = 0; break; }
                }
                if (mac_ok) {
                    buf[p]='5'; buf[p+1]='0'; buf[p+2]=':';
                    buf[p+3]='c'; buf[p+4]='7'; buf[p+5]=':';
                    buf[p+6]='b'; buf[p+7]='f'; buf[p+8]=':';
                    buf[p+9]=hex_chr(s_router_mac[3] >> 4); buf[p+10]=hex_chr(s_router_mac[3] & 0xF); buf[p+11]=':';
                    buf[p+12]=hex_chr(s_router_mac[4] >> 4); buf[p+13]=hex_chr(s_router_mac[4] & 0xF); buf[p+14]=':';
                    buf[p+15]=hex_chr(s_router_mac[5] >> 4); buf[p+16]=hex_chr(s_router_mac[5] & 0xF);
                    break;
                }
            }
        }
        if (le >= n) break;
        ls = le + 1;
    }
    return n;
}

extern void *dlopen(const char *filename, int flag);
extern void *dlsym(void *handle, const char *symbol);
extern int dladdr(const void *addr, void *info);
extern char **environ;

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
    if (fn) {
        Dl_info self_info;
        Dl_info fn_info;
        if (dladdr((const void *)&dlsym_next, &self_info) && self_info.dli_fbase &&
            dladdr(fn, &fn_info) && fn_info.dli_fbase == self_info.dli_fbase) {
            fn = (void *)0;
        }
    }
    if (!fn) fn = dlsym(get_libc_handle(), symbol);
    return fn;
}

static void fixup_ld_preload_lazy(void) {
    static int done = 0;
    if (done) return;
    if (!environ) return;
    const char *key = "LD_PRELOAD=";
    for (char **e = environ; *e; e++) {
        int k = 0;
        while (key[k] && (*e)[k] == key[k]) k++;
        if (!key[k]) {
            if (str_contains(*e + k, "libpixel_hw.so")) {
                *e = (char *)"LD_PRELOAD=/system/lib64/libpixel_hw.so";
            }
            done = 1;
            return;
        }
    }
    done = 1;
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
static char s_uname_machine[65] = "aarch64";
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
    fd = raw_open("/data/local/tmp/fake_proc/uname_machine", 0);
    if (fd >= 0) {
        ssize_t n = raw_read((int)fd, s_uname_machine, sizeof(s_uname_machine) - 1);
        if (n > 0) {
            while (n > 0 && (s_uname_machine[n-1] == '\n' || s_uname_machine[n-1] == '\r')) n--;
            s_uname_machine[n] = '\0';
        }
        raw_close((int)fd);
    }
}

int uname(struct utsname *buf) {
    long ret;
    __asm__ volatile (
        "mov $122, %%eax\n"
        "mov %1, %%ebx\n"
        "int $0x80\n"
        "mov %%eax, %0\n"
        : "=r" (ret)
        : "r" (buf)
        : "eax", "ebx", "memory"
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
        for (i = 0; i < sizeof(buf->machine) - 1 && s_uname_machine[i]; i++) {
            buf->machine[i] = s_uname_machine[i];
        }
        buf->machine[i] = '\0';
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
    if (cached == 0) cached = 7854200ULL * 1024ULL; // fallback generico 8 GB
    return cached;
}

struct sysinfo32 {
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

int sysinfo(struct sysinfo32 *info) {
    long ret;
    __asm__ volatile (
        "mov $116, %%eax\n"
        "mov %1, %%ebx\n"
        "int $0x80\n"
        "mov %%eax, %0\n"
        : "=r" (ret)
        : "r" (info)
        : "eax", "ebx", "memory"
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
struct generic_vfs32 {
    unsigned int pad0;       // 0x00
    unsigned int frsize;     // 0x04
    unsigned int blocks;     // 0x08
    unsigned int bfree;      // 0x0C
    unsigned int bavail;     // 0x10
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

static void scale_blocks32(const char *path, void *buf) {
    if (!path || !buf) return;
    struct generic_vfs32 *v = (struct generic_vfs32 *)buf;
    if (v->blocks == 0) return;

    unsigned int fr = v->frsize;
    if (fr == 0) {
        fr = *((unsigned int *)((char *)buf + 0x24));
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
        unsigned int fake_blocks = (unsigned int)(fake_bytes / fr);
        double free_ratio = (double)v->bfree / (double)v->blocks;
        if (free_ratio > 1.0) free_ratio = 0.85;
        v->blocks = fake_blocks;
        v->bfree = (unsigned int)(fake_blocks * free_ratio);
        v->bavail = v->bfree;
    } else if (is_system) {
        unsigned long long fake_bytes = 12884901888ULL; // 12 GiB
        unsigned int fake_blocks = (unsigned int)(fake_bytes / fr);
        v->blocks = fake_blocks;
        v->bfree = (unsigned int)(fake_blocks * 0.05);
        v->bavail = v->bfree;
    }
}

int statvfs(const char *path, void *buf) {
    static int (*real_fn)(const char *, void *) = (void *)0;
    if (!real_fn) real_fn = dlsym_next("statvfs");
    int ret = real_fn ? real_fn(path, buf) : -1;
    if (ret == 0) scale_blocks32(path, buf);
    return ret;
}

int statvfs64(const char *path, void *buf) {
    static int (*real_fn)(const char *, void *) = (void *)0;
    if (!real_fn) real_fn = dlsym_next("statvfs64");
    if (!real_fn) real_fn = dlsym_next("statvfs");
    int ret = real_fn ? real_fn(path, buf) : -1;
    if (ret == 0) scale_blocks32(path, buf);
    return ret;
}

int statfs(const char *path, void *buf) {
    static int (*real_fn)(const char *, void *) = (void *)0;
    if (!real_fn) real_fn = dlsym_next("statfs");
    int ret = real_fn ? real_fn(path, buf) : -1;
    if (ret == 0) scale_blocks32(path, buf);
    return ret;
}

int statfs64(const char *path, void *buf) {
    static int (*real_fn)(const char *, void *) = (void *)0;
    if (!real_fn) real_fn = dlsym_next("statfs64");
    if (!real_fn) real_fn = dlsym_next("statfs");
    int ret = real_fn ? real_fn(path, buf) : -1;
    if (ret == 0) scale_blocks32(path, buf);
    return ret;
}

// 5. Intercepción de red nativa (getifaddrs)
struct ifaddrs_stub32 {
    struct ifaddrs_stub32 *ifa_next;
    char                  *ifa_name;
    unsigned int           ifa_flags;
    void                  *ifa_addr;
    void                  *ifa_netmask;
    void                  *ifa_ifu;
    void                  *ifa_data;
};

static const char s_fake_ifname[] = "wlan0";
static unsigned char s_fake_mac[6];
static int s_fake_mac_ok = 0;
static int s_fake_mac_loaded = 0;

static void load_fake_mac(void) {
    if (s_fake_mac_loaded) return;
    s_fake_mac_loaded = 1;
    long fd = raw_open("/data/local/tmp/fake_proc/mac_wlan0", 0);
    if (fd < 0) return;
    char b[64];
    ssize_t n = raw_read((int)fd, b, sizeof(b) - 1);
    raw_close((int)fd);
    if (n <= 0) return;
    b[n] = '\0';
    int vals[6];
    int vi = 0, hi = -1;
    for (ssize_t i = 0; i < n && vi < 6; i++) {
        char c = b[i];
        int d = -1;
        if (c >= '0' && c <= '9') d = c - '0';
        else if (c >= 'a' && c <= 'f') d = c - 'a' + 10;
        else if (c >= 'A' && c <= 'F') d = c - 'A' + 10;
        if (d >= 0) {
            if (hi < 0) hi = d;
            else { vals[vi++] = (hi << 4) | d; hi = -1; }
        } else {
            hi = -1;
        }
    }
    if (vi == 6) {
        for (int i = 0; i < 6; i++) s_fake_mac[i] = (unsigned char)vals[i];
        s_fake_mac_ok = 1;
        int sum = 0;
        for (int i = 0; i < 6; i++) sum += s_fake_mac[i];
        s_fake_ipv4[0] = FAKE_NET_A;
        s_fake_ipv4[1] = FAKE_NET_B;
        s_fake_ipv4[2] = FAKE_NET_C;
        s_fake_ipv4[3] = (unsigned char)(2 + (sum % 200));
        s_router_mac[0] = 0x50; s_router_mac[1] = 0xC7; s_router_mac[2] = 0xBF;
        s_router_mac[3] = s_fake_mac[1];
        s_router_mac[4] = s_fake_mac[3];
        s_router_mac[5] = s_fake_mac[5];
        s_fake_net_ok = 1;
    }
}

int getifaddrs(struct ifaddrs_stub32 **ifap) {
    static int (*real_fn)(struct ifaddrs_stub32 **) = (void *)0;
    if (!real_fn) real_fn = dlsym_next("getifaddrs");
    int res = real_fn ? real_fn(ifap) : -1;
    if (res == 0 && ifap && *ifap) {
        if (my_getuid() >= 10000) {
            load_fake_mac();
            struct ifaddrs_stub32 *cur = *ifap;
            while (cur) {
                if (cur->ifa_name &&
                    cur->ifa_name[0] == 'e' &&
                    cur->ifa_name[1] == 't' &&
                    cur->ifa_name[2] == 'h' &&
                    cur->ifa_name[3] == '0' &&
                    cur->ifa_name[4] == '\0') {
                    cur->ifa_name = (char *)s_fake_ifname;
                    if (s_fake_mac_ok && cur->ifa_addr && ((unsigned char *)cur->ifa_addr)[0] == 17) {
                        unsigned char *sa = (unsigned char *)cur->ifa_addr;
                        sa[11] = 6;
                        for (int i = 0; i < 6; i++) sa[12 + i] = s_fake_mac[i];
                    }
                    if (s_fake_net_ok && cur->ifa_addr && ((unsigned char *)cur->ifa_addr)[0] == 2) {
                        unsigned char *sa = (unsigned char *)cur->ifa_addr;
                        sa[4] = FAKE_NET_A; sa[5] = FAKE_NET_B; sa[6] = FAKE_NET_C; sa[7] = s_fake_ipv4[3];
                        if (cur->ifa_netmask && ((unsigned char *)cur->ifa_netmask)[0] == 2) {
                            unsigned char *nm = (unsigned char *)cur->ifa_netmask;
                            nm[4] = 255; nm[5] = 255; nm[6] = 255; nm[7] = 0;
                        }
                        if ((cur->ifa_flags & 0x2) && cur->ifa_ifu && ((unsigned char *)cur->ifa_ifu)[0] == 2) {
                            unsigned char *br = (unsigned char *)cur->ifa_ifu;
                            br[4] = FAKE_NET_A; br[5] = FAKE_NET_B; br[6] = FAKE_NET_C; br[7] = 255;
                        }
                    }
                }
                cur = cur->ifa_next;
            }
        }
    }
    return res;
}

// 5c. if_nametoindex: el kernel no tiene wlan0; para apps se responde con el
// índice de eth0 (si no, libcore.NetworkInterface.getAll() descarta la entrada
// renombrada por el hook de getifaddrs y la wlan desaparece del listado Java).
unsigned int if_nametoindex(const char *ifname) {
    static unsigned int (*real_fn)(const char *) = (void *)0;
    if (!real_fn) real_fn = (unsigned int (*)(const char *))dlsym_next("if_nametoindex");
    if (!real_fn) return 0;
    if (ifname && my_getuid() >= 10000 &&
        ifname[0] == 'w' && ifname[1] == 'l' && ifname[2] == 'a' &&
        ifname[3] == 'n' && ifname[4] == '0' && ifname[5] == '\0') {
        unsigned int idx = real_fn("eth0");
        if (idx != 0) return idx;
    }
    return real_fn(ifname);
}

// 5d. if_indextoname: al formatear direcciones IPv6 link-local (getnameinfo /
// Inet6Address) el kernel resuelve el scope como "eth0"; en apps se traduce a
// "wlan0" para no filtrar el nombre real de la interfaz del contenedor.
char *if_indextoname(unsigned int ifindex, char *ifname) {
    static char *(*real_fn)(unsigned int, char *) = (void *)0;
    if (!real_fn) real_fn = (char *(*)(unsigned int, char *))dlsym_next("if_indextoname");
    if (!real_fn) return (char *)0;
    char *res = real_fn(ifindex, ifname);
    if (res && ifname && my_getuid() >= 10000 &&
        ifname[0] == 'e' && ifname[1] == 't' && ifname[2] == 'h' &&
        ifname[3] == '0' && ifname[4] == '\0') {
        ifname[0] = 'w'; ifname[1] = 'l'; ifname[2] = 'a';
        ifname[3] = 'n'; ifname[4] = '0'; ifname[5] = '\0';
    }
    return res;
}

// 6. SELinux API Spoofing
int is_selinux_enabled(void) { return 1; }
int security_getenforce(void) { return 1; }

// 7. Sanitización de entorno (LD_PRELOAD)
char *getenv(const char *name) {
    fixup_ld_preload_lazy();
    if (name && name[0] == 'L' && name[1] == 'D' && name[2] == '_' &&
        name[3] == 'P' && name[4] == 'R' && name[5] == 'E' &&
        name[6] == 'L' && name[7] == 'O' && name[8] == 'A' && name[9] == 'D' && name[10] == '\0') {
        return (char *)0;
    }
    static char *(*real_fn)(const char *) = (void *)0;
    if (!real_fn) real_fn = dlsym_next("getenv");
    return real_fn ? real_fn(name) : (char *)0;
}

extern int unsetenv(const char *name);

__attribute__((constructor)) static void hide_ld_preload_from_apps(void) {
    if (environ) {
        for (char **e = environ; *e; e++) {
            char *s = *e;
            if (s[0] == 'L' && s[1] == 'D' && s[2] == '_' && s[3] == 'P' &&
                s[4] == 'R' && s[5] == 'E' && s[6] == 'L' && s[7] == 'O' &&
                s[8] == 'A' && s[9] == 'D' && s[10] == '=') {
                static const char mask[] = "PIXEL_HW__=";
                for (int i = 0; i < 11; i++) s[i] = mask[i];
                s[11] = '\0';
                break;
            }
        }
    }
    unsetenv("LD_PRELOAD");
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

// Atributos de /sys/class/net/wlan0: los expuestos por eth0 (el netdev real
// del contenedor) se sirven desde el kernel, de modo que valores y contadores
// (statistics/*) quedan dinamicos y coherentes con el renombrado de
// /proc/net/dev. uevent se sintetiza aparte porque INTERFACE debe decir wlan0.
static const char *const s_wlan_attr_map[][2] = {
    {"addr_assign_type", "/sys/devices/virtual/net/eth0/addr_assign_type"},
    {"addr_len", "/sys/devices/virtual/net/eth0/addr_len"},
    {"broadcast", "/sys/devices/virtual/net/eth0/broadcast"},
    {"carrier", "/sys/devices/virtual/net/eth0/carrier"},
    {"dev_id", "/sys/devices/virtual/net/eth0/dev_id"},
    {"duplex", "/sys/devices/virtual/net/eth0/duplex"},
    {"flags", "/sys/devices/virtual/net/eth0/flags"},
    {"ifindex", "/sys/devices/virtual/net/eth0/ifindex"},
    {"iflink", "/sys/devices/virtual/net/eth0/iflink"},
    {"mtu", "/sys/devices/virtual/net/eth0/mtu"},
    {"name_assign_type", "/sys/devices/virtual/net/eth0/name_assign_type"},
    {"operstate", "/sys/devices/virtual/net/eth0/operstate"},
    {"speed", "/sys/devices/virtual/net/eth0/speed"},
    {"tx_queue_len", "/sys/devices/virtual/net/eth0/tx_queue_len"},
    {"type", "/sys/devices/virtual/net/eth0/type"},
    {"statistics", "/sys/devices/virtual/net/eth0/statistics"},
    {"statistics/collisions", "/sys/devices/virtual/net/eth0/statistics/collisions"},
    {"statistics/multicast", "/sys/devices/virtual/net/eth0/statistics/multicast"},
    {"statistics/rx_bytes", "/sys/devices/virtual/net/eth0/statistics/rx_bytes"},
    {"statistics/rx_compressed", "/sys/devices/virtual/net/eth0/statistics/rx_compressed"},
    {"statistics/rx_crc_errors", "/sys/devices/virtual/net/eth0/statistics/rx_crc_errors"},
    {"statistics/rx_dropped", "/sys/devices/virtual/net/eth0/statistics/rx_dropped"},
    {"statistics/rx_errors", "/sys/devices/virtual/net/eth0/statistics/rx_errors"},
    {"statistics/rx_fifo_errors", "/sys/devices/virtual/net/eth0/statistics/rx_fifo_errors"},
    {"statistics/rx_frame_errors", "/sys/devices/virtual/net/eth0/statistics/rx_frame_errors"},
    {"statistics/rx_length_errors", "/sys/devices/virtual/net/eth0/statistics/rx_length_errors"},
    {"statistics/rx_missed_errors", "/sys/devices/virtual/net/eth0/statistics/rx_missed_errors"},
    {"statistics/rx_nohandler", "/sys/devices/virtual/net/eth0/statistics/rx_nohandler"},
    {"statistics/rx_over_errors", "/sys/devices/virtual/net/eth0/statistics/rx_over_errors"},
    {"statistics/rx_packets", "/sys/devices/virtual/net/eth0/statistics/rx_packets"},
    {"statistics/tx_aborted_errors", "/sys/devices/virtual/net/eth0/statistics/tx_aborted_errors"},
    {"statistics/tx_bytes", "/sys/devices/virtual/net/eth0/statistics/tx_bytes"},
    {"statistics/tx_carrier_errors", "/sys/devices/virtual/net/eth0/statistics/tx_carrier_errors"},
    {"statistics/tx_compressed", "/sys/devices/virtual/net/eth0/statistics/tx_compressed"},
    {"statistics/tx_dropped", "/sys/devices/virtual/net/eth0/statistics/tx_dropped"},
    {"statistics/tx_errors", "/sys/devices/virtual/net/eth0/statistics/tx_errors"},
    {"statistics/tx_fifo_errors", "/sys/devices/virtual/net/eth0/statistics/tx_fifo_errors"},
    {"statistics/tx_heartbeat_errors", "/sys/devices/virtual/net/eth0/statistics/tx_heartbeat_errors"},
    {"statistics/tx_packets", "/sys/devices/virtual/net/eth0/statistics/tx_packets"},
    {"statistics/tx_window_errors", "/sys/devices/virtual/net/eth0/statistics/tx_window_errors"},
};

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
        // /sys/class/net: se expone un arbol ficticio (lo + wlan0) para ocultar
        // eth0 (interfaz real del contenedor); la MAC de wlan0 se sirve desde el
        // fake_proc del perfil y el resto de sysfs queda intacto.
        if (str_eq(path, "/sys/class/net") || str_eq(path, "/sys/class/net/")) {
            return "/system/etc/proteomesh/sys_class_net";
        }
        if (str_starts_with(path, "/sys/class/net/eth0")) {
            return "/system/etc/proteomesh/sys_class_net/__hidden_eth0";
        }
        if (str_eq(path, "/sys/class/net/wlan0") || str_eq(path, "/sys/class/net/wlan0/")) {
            return "/system/etc/proteomesh/sys_class_net/wlan0";
        }
        if (str_eq(path, "/sys/class/net/wlan0/address")) {
            return "/data/local/tmp/fake_proc/mac_wlan0";
        }
        if (str_starts_with(path, "/sys/class/net/wlan0/")) {
            const char *leaf = path + 21;
            if (str_eq(leaf, "uevent")) {
                return "/system/etc/proteomesh/sys_class_net/wlan0/uevent";
            }
            for (unsigned int i = 0; i < sizeof(s_wlan_attr_map) / sizeof(s_wlan_attr_map[0]); i++) {
                if (str_eq(leaf, s_wlan_attr_map[i][0])) return s_wlan_attr_map[i][1];
            }
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

// Fix B5c: la familia abilist se fakea solo a apps (uid>=10000). Servirla al
// zygote (B5b) hacia que Build cachee SUPPORTED_ABIS=ARM y PackageManager
// (hijo del zygote) rechazara escanear APKs con libs x86 (error -113:
// NetworkStack, ExtServices, Play, GMS) -> system_server fatal en loop y la
// red del contenedor nunca se configuraba (netd sin reglas/addr).
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
    if (str_eq(name, "ro.dalvik.vm.native.bridge")) return "0";
    if (str_eq(name, "ro.enable.native.bridge.exec")) return "";
    if (str_eq(name, "ro.dalvik.vm.isa.arm64")) return "arm64";
    if (str_eq(name, "ro.dalvik.vm.isa.arm")) return "arm";
    if (str_eq(name, "ro.dalvik.vm.isa.x86")) return "";
    if (str_eq(name, "ro.dalvik.vm.isa.x86_64")) return "";
    if (str_eq(name, "dalvik.vm.isa.x86")) return "";
    if (str_eq(name, "dalvik.vm.isa.x86_64")) return "";
    if (str_eq(name, "dalvik.vm.isa.x86.variant")) return "";
    if (str_eq(name, "dalvik.vm.isa.x86_64.variant")) return "";
    if (str_eq(name, "dalvik.vm.isa.x86.features")) return "";
    if (str_eq(name, "dalvik.vm.isa.x86_64.features")) return "";
    if (str_eq(name, "ro.build.type")) return "user";
    if (str_eq(name, "ro.build.tags")) return "release-keys";
    if (str_eq(name, "ro.boot.flash.locked")) return "1";
    if (str_eq(name, "ro.boot.verifiedbootstate")) return "green";
    if (str_eq(name, "ro.boot.veritymode")) return "enforcing";
    return (void *)0;
}

int __system_property_get(const char *name, char *value) {
    fixup_ld_preload_lazy();
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
    if (!real_fn) real_fn = dlsym_next("__system_property_get");
    return real_fn ? real_fn(name, value) : 0;
}

// 9b. API moderna de propiedades: el framework, `getprop` y android::base no
// pasan por __system_property_get sino por find/read_callback/foreach; se
// aplica la misma lista fake para que las apps no dependan del scope LSPosed.
static int fake_prop_is_absent(const char *name) {
    if (!name || my_getuid() < 10000) return 0;
    if (name[0] != 'r' && name[0] != 'd') return 0;
    return str_eq(name, "ro.enable.native.bridge.exec") ||
           str_eq(name, "ro.dalvik.vm.isa.x86") ||
           str_eq(name, "ro.dalvik.vm.isa.x86_64") ||
           str_eq(name, "dalvik.vm.isa.x86") ||
           str_eq(name, "dalvik.vm.isa.x86_64") ||
           str_eq(name, "dalvik.vm.isa.x86.variant") ||
           str_eq(name, "dalvik.vm.isa.x86_64.variant") ||
           str_eq(name, "dalvik.vm.isa.x86.features") ||
           str_eq(name, "dalvik.vm.isa.x86_64.features");
}

const void *__system_property_find(const char *name) {
    fixup_ld_preload_lazy();
    static const void *(*real_fn)(const char *) = (void *)0;
    if (!real_fn) real_fn = (const void *(*)(const char *))dlsym_next("__system_property_find");
    if (!real_fn) return (const void *)0;
    if (fake_prop_is_absent(name)) return (const void *)0;
    return real_fn(name);
}

struct prop_cb_ctx {
    void (*callback)(void *, const char *, const char *, unsigned int);
    void *cookie;
};

static void prop_cb_wrap(void *cookie, const char *name, const char *value, unsigned int serial) {
    struct prop_cb_ctx *ctx = (struct prop_cb_ctx *)cookie;
    const char *fake = get_fake_prop(name);
    ctx->callback(ctx->cookie, name, fake ? fake : value, serial);
}

void __system_property_read_callback(const void *pi,
                                     void (*callback)(void *, const char *, const char *, unsigned int),
                                     void *cookie) {
    fixup_ld_preload_lazy();
    static void (*real_fn)(const void *, void (*)(void *, const char *, const char *, unsigned int), void *) = (void *)0;
    if (!real_fn) real_fn = (void *)dlsym_next("__system_property_read_callback");
    if (!real_fn) return;
    if (callback) {
        struct prop_cb_ctx ctx;
        ctx.callback = callback;
        ctx.cookie = cookie;
        real_fn(pi, prop_cb_wrap, &ctx);
        return;
    }
    real_fn(pi, callback, cookie);
}

int __system_property_read(const void *pi, char *name, char *value) {
    static int (*real_fn)(const void *, char *, char *) = (void *)0;
    if (!real_fn) real_fn = dlsym_next("__system_property_read");
    if (!real_fn) return 0;
    char tmpname[96];
    int len = real_fn(pi, tmpname, value);
    if (name) {
        int i = 0;
        while (tmpname[i] && i < 91) { name[i] = tmpname[i]; i++; }
        name[i] = '\0';
    }
    {
        const char *fake = get_fake_prop(tmpname);
        if (fake && value) {
            int i = 0;
            while (fake[i] && i < 91) { value[i] = fake[i]; i++; }
            value[i] = '\0';
            return i;
        }
    }
    return len;
}

struct foreach_ctx {
    void (*propfn)(const void *, void *);
    void *cookie;
};

static void foreach_wrap(const void *pi, void *cookie) {
    struct foreach_ctx *ctx = (struct foreach_ctx *)cookie;
    char name[96];
    char value[96];
    __system_property_read(pi, name, value);
    if (fake_prop_is_absent(name)) return;
    ctx->propfn(pi, ctx->cookie);
}

void __system_property_foreach(void (*propfn)(const void *, void *), void *cookie) {
    static void (*real_fn)(void (*)(const void *, void *), void *) = (void *)0;
    if (!real_fn) real_fn = (void *)dlsym_next("__system_property_foreach");
    if (!real_fn) return;
    if (propfn && my_getuid() >= 10000) {
        struct foreach_ctx ctx;
        ctx.propfn = propfn;
        ctx.cookie = cookie;
        real_fn(foreach_wrap, &ctx);
        return;
    }
    real_fn(propfn, cookie);
}

// 10. Wrappers de Archivos (stat, access, open, fopen)
#define ENOENT_VAL 2
#define EACCES_VAL 13
#define EINVAL_VAL 22

static void set_errno_val(int val) {
    static int *(*real_errno)(void) = (void *)0;
    if (!real_errno) {
        real_errno = (int *(*)(void))dlsym_next("__errno");
        if (!real_errno) real_errno = (int *(*)(void))dlsym_next("__errno_location");
        if (!real_errno) real_errno = (int *(*)(void))dlsym_next("__errno");
        if (!real_errno) real_errno = (int *(*)(void))dlsym_next("__errno_location");
    }
    if (real_errno) {
        int *err = real_errno();
        if (err) *err = val;
    }
}

static void set_enoent(void) { set_errno_val(ENOENT_VAL); }

static long syscall_ret(long rax) {
    if (rax < 0 && rax >= -4095) {
        set_errno_val((int)-rax);
        return -1;
    }
    return rax;
}

// 10.0 Ashmem v2: identidad por file-description (readlink /proc/self/fd/N),
// fcntl 1033/1034, tabla completa de ioctls y política por perfil.
static void build_fake_proc_path(char *dst, unsigned long dstsz, const char *name) {
    const char *base = "/data/local/tmp/fake_proc";
    char *(*real_getenv)(const char *) = (char *(*)(const char *))dlsym_next("getenv");
    if (real_getenv) {
        const char *env = real_getenv("PIXEL_HW_FAKE_PROC");
        if (env && env[0]) base = env;
    }
    unsigned long i = 0;
    while (base[i] && i < dstsz - 2) { dst[i] = base[i]; i++; }
    if (i == 0 || dst[i - 1] != '/') dst[i++] = '/';
    unsigned long j = 0;
    while (name[j] && i < dstsz - 1) { dst[i++] = name[j++]; }
    dst[i] = '\0';
}

// Política device.ashmem: fake_proc/ashmem_present == "0" => /dev/ashmem ausente
static int ashmem_policy_present(void) {
    char path[160];
    build_fake_proc_path(path, sizeof(path), "ashmem_present");
    long fd = raw_open(path, 0);
    if (fd < 0) return 1;
    char b[8];
    long n = raw_read((int)fd, b, sizeof(b) - 1);
    raw_close((int)fd);
    if (n > 0) {
        b[n] = '\0';
        if (b[0] == '0') return 0;
    }
    return 1;
}

#define ASHMEM_FD_MAX 128
struct ashmem_state {
    int fd;
    int prot;
    int seals;
    char name[32];
};
static struct ashmem_state s_ashmem_state[ASHMEM_FD_MAX];
static int s_ashmem_state_init = 0;

static void ashmem_state_table_init(void) {
    if (s_ashmem_state_init) return;
    s_ashmem_state_init = 1;
    for (int i = 0; i < ASHMEM_FD_MAX; i++) {
        s_ashmem_state[i].fd = -1;
        s_ashmem_state[i].prot = 3;
        s_ashmem_state[i].seals = 0;
        s_ashmem_state[i].name[0] = '\0';
    }
}

static struct ashmem_state *ashmem_state_get(int fd) {
    ashmem_state_table_init();
    if (fd < 0) return (void *)0;
    for (int i = 0; i < ASHMEM_FD_MAX; i++) {
        if (s_ashmem_state[i].fd == fd) return &s_ashmem_state[i];
    }
    return (void *)0;
}

static struct ashmem_state *ashmem_state_new(int fd) {
    ashmem_state_table_init();
    struct ashmem_state *st = ashmem_state_get(fd);
    if (st) {
        st->prot = 3;
        st->seals = 0;
        st->name[0] = '\0';
        return st;
    }
    for (int i = 0; i < ASHMEM_FD_MAX; i++) {
        if (s_ashmem_state[i].fd < 0) {
            st = &s_ashmem_state[i];
            st->fd = fd;
            st->prot = 3;
            st->seals = 0;
            st->name[0] = '\0';
            return st;
        }
    }
    return (void *)0;
}

static void ashmem_state_free(int fd) {
    struct ashmem_state *st = ashmem_state_get(fd);
    if (st) st->fd = -1;
}

// Clasificación por file-description: sobrevive dup, fork y paso de fds por
// Binder/SCM_RIGHTS (a diferencia del bitmap, que solo cubre el fd original).
static int fd_is_ashmem(int fd) {
    if (!fd_in_range(fd)) return 0;
    if (s_ashmem_fds[fd]) return 1;
    char linkpath[32];
    const char *prefix = "/proc/self/fd/";
    int k = 0;
    while (prefix[k]) { linkpath[k] = prefix[k]; k++; }
    if (fd == 0) {
        linkpath[k++] = '0';
    } else {
        char num[12];
        int t = 0;
        int v = fd;
        while (v > 0) { num[t++] = (char)('0' + v % 10); v /= 10; }
        while (t > 0) linkpath[k++] = num[--t];
    }
    linkpath[k] = '\0';
    char target[64];
    long n = raw_readlinkat(-100, linkpath, target, sizeof(target) - 1);
    if (n > 0) {
        target[n] = '\0';
        if (str_starts_with(target, "/memfd:ashmem") ||
            str_starts_with(target, "/memfd:shared_memory/")) {
            fd_mark(s_ashmem_fds, fd);
            return 1;
        }
    }
    return 0;
}

static int ashmem_open(void) {
    if (!ashmem_policy_present()) {
        set_enoent();
        return -1;
    }
    long mfd = raw_memfd_create("ashmem", 0x0001); // MFD_CLOEXEC
    if (mfd < 0) return (int)syscall_ret(mfd);
    fd_mark(s_ashmem_fds, (int)mfd);
    ashmem_state_new((int)mfd);
    return (int)mfd;
}

static int path_is_ashmem(const char *path) {
    return path && str_eq(path, "/dev/ashmem");
}

// Coherencia stat/readlink: /dev/ashmem se resuelve sobre /dev/null (char 0666),
// o ENOENT si la política del perfil lo declara ausente.
static int ashmem_fake_path(const char **path) {
    if (!path_is_ashmem(*path)) return 0;
    if (!ashmem_policy_present()) {
        set_enoent();
        return -1;
    }
    *path = "/dev/null";
    return 1;
}

int stat(const char *path, void *buf) {
    fixup_ld_preload_lazy();
    if (ashmem_fake_path(&path) < 0) return -1;
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    path = redirect_path(path);
    static int (*real_fn)(const char *, void *) = (void *)0;
    if (!real_fn) real_fn = dlsym_next("stat");
    return real_fn ? real_fn(path, buf) : -1;
}

int stat64(const char *path, void *buf) {
    if (ashmem_fake_path(&path) < 0) return -1;
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    path = redirect_path(path);
    static int (*real_fn)(const char *, void *) = (void *)0;
    if (!real_fn) real_fn = dlsym_next("stat64");
    if (!real_fn) real_fn = dlsym_next("stat");
    return real_fn ? real_fn(path, buf) : -1;
}

int lstat(const char *path, void *buf) {
    if (ashmem_fake_path(&path) < 0) return -1;
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    path = redirect_path(path);
    static int (*real_fn)(const char *, void *) = (void *)0;
    if (!real_fn) real_fn = dlsym_next("lstat");
    return real_fn ? real_fn(path, buf) : -1;
}

int lstat64(const char *path, void *buf) {
    if (ashmem_fake_path(&path) < 0) return -1;
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    path = redirect_path(path);
    static int (*real_fn)(const char *, void *) = (void *)0;
    if (!real_fn) real_fn = dlsym_next("lstat64");
    if (!real_fn) real_fn = dlsym_next("lstat");
    return real_fn ? real_fn(path, buf) : -1;
}

int access(const char *path, int mode) {
    fixup_ld_preload_lazy();
    if (path_is_ashmem(path)) {
        if (!ashmem_policy_present()) {
            set_enoent();
            return -1;
        }
        if (mode & 1) { // X_OK: /dev/ashmem real es 0666 (sin execute)
            set_errno_val(EACCES_VAL);
            return -1;
        }
        return 0;
    }
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    path = redirect_path(path);
    static int (*real_fn)(const char *, int) = (void *)0;
    if (!real_fn) real_fn = dlsym_next("access");
    return real_fn ? real_fn(path, mode) : -1;
}

int faccessat(int dirfd, const char *path, int mode, int flags) {
    if (path_is_ashmem(path)) {
        if (!ashmem_policy_present()) {
            set_enoent();
            return -1;
        }
        if (mode & 1) { // X_OK
            set_errno_val(EACCES_VAL);
            return -1;
        }
        return 0;
    }
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    path = redirect_path(path);
    static int (*real_fn)(int, const char *, int, int) = (void *)0;
    if (!real_fn) real_fn = dlsym_next("faccessat");
    return real_fn ? real_fn(dirfd, path, mode, flags) : -1;
}

// /proc/self/{maps,smaps,numa_maps,smaps_rollup}: se sirve un snapshot saneado
// (memfd) a las apps para ocultar el native bridge (libndk_translation), el
// propio shim (libpixel_hw) y las rutas de arquitectura x86/x86_64
// (reescritas a arm/arm64). En smaps se descarta el bloque completo de cada
// mapping prohibido (header + atributos) para no dejar bloques huerfanos; en
// maps/numa_maps se descarta la linea. El resto del contenido se preserva.
#define PROC_BUF_SIZE (8 << 20)
static char s_proc_buf[PROC_BUF_SIZE];

static int maps_tok_at(const char *buf, ssize_t i, ssize_t end, const char *tok) {
    ssize_t k = 0;
    while (tok[k]) {
        if (i + k >= end || buf[i + k] != tok[k]) return 0;
        k++;
    }
    return 1;
}

static int maps_line_has(const char *buf, ssize_t ls, ssize_t le, const char *tok) {
    ssize_t tl = 0;
    while (tok[tl]) tl++;
    for (ssize_t i = ls; i + tl <= le; i++) {
        if (maps_tok_at(buf, i, le, tok)) return 1;
    }
    return 0;
}

static ssize_t sanitize_maps(char *buf, ssize_t n) {
    ssize_t out = 0, ls = 0;
    while (ls < n) {
        ssize_t le = ls;
        while (le < n && buf[le] != '\n') le++;
        if (!maps_line_has(buf, ls, le, "ndk_translation") &&
            !maps_line_has(buf, ls, le, "pixel_hw")) {
            for (ssize_t i = ls; i < le; ) {
                if (maps_tok_at(buf, i, le, "x86_64")) {
                    buf[out++] = 'a'; buf[out++] = 'r'; buf[out++] = 'm';
                    buf[out++] = '6'; buf[out++] = '4';
                    i += 6;
                } else if (maps_tok_at(buf, i, le, "x86")) {
                    buf[out++] = 'a'; buf[out++] = 'r'; buf[out++] = 'm';
                    i += 3;
                } else {
                    buf[out++] = buf[i++];
                }
            }
            if (le < n) buf[out++] = '\n';
        }
        ls = (le < n) ? le + 1 : le;
    }
    return out;
}

// Un header de smaps empieza con "hex-hex " (rango de direcciones).
static int line_is_mapping(const char *buf, ssize_t ls, ssize_t le) {
    ssize_t i = ls;
    int d = 0;
    while (i < le && ((buf[i] >= '0' && buf[i] <= '9') ||
                      (buf[i] >= 'a' && buf[i] <= 'f'))) { i++; d++; }
    if (d == 0 || i >= le || buf[i] != '-') return 0;
    i++; d = 0;
    while (i < le && ((buf[i] >= '0' && buf[i] <= '9') ||
                      (buf[i] >= 'a' && buf[i] <= 'f'))) { i++; d++; }
    return d > 0 && i < le && buf[i] == ' ';
}

static ssize_t sanitize_smaps(char *buf, ssize_t n) {
    ssize_t out = 0, ls = 0;
    int drop = 0;
    while (ls < n) {
        ssize_t le = ls;
        while (le < n && buf[le] != '\n') le++;
        int header = line_is_mapping(buf, ls, le);
        if (header) {
            drop = maps_line_has(buf, ls, le, "ndk_translation") ||
                   maps_line_has(buf, ls, le, "pixel_hw");
        }
        int attr_banned = !header &&
            (maps_line_has(buf, ls, le, "ndk_translation") ||
             maps_line_has(buf, ls, le, "pixel_hw"));
        if (!drop && !attr_banned) {
            for (ssize_t i = ls; i < le; ) {
                if (maps_tok_at(buf, i, le, "x86_64")) {
                    buf[out++] = 'a'; buf[out++] = 'r'; buf[out++] = 'm';
                    buf[out++] = '6'; buf[out++] = '4';
                    i += 6;
                } else if (maps_tok_at(buf, i, le, "x86")) {
                    buf[out++] = 'a'; buf[out++] = 'r'; buf[out++] = 'm';
                    i += 3;
                } else {
                    buf[out++] = buf[i++];
                }
            }
            if (le < n) buf[out++] = '\n';
        }
        ls = (le < n) ? le + 1 : le;
    }
    return out;
}

static int is_proc_leaf(const char *p, const char *leaf) {
    while (*leaf) {
        if (*p != *leaf) return 0;
        p++; leaf++;
    }
    return *p == '\0';
}

static int is_self_proc_path(const char *path, const char *leaf) {
    if (!path) return 0;
    if (str_starts_with(path, "/proc/self/")) return is_proc_leaf(path + 11, leaf);
    if (!str_starts_with(path, "/proc/")) return 0;
    long pid = raw_getpid();
    if (pid <= 0) return 0;
    char num[16];
    char rev[16];
    int ri = 0, ni = 0;
    while (pid > 0 && ri < 15) { rev[ri++] = (char)('0' + (pid % 10)); pid /= 10; }
    while (ri > 0) num[ni++] = rev[--ri];
    num[ni] = '\0';
    const char *p = path + 6;
    int k = 0;
    while (k < ni && p[k] == num[k]) k++;
    if (k != ni || p[k] != '/') return 0;
    return is_proc_leaf(p + k + 1, leaf);
}

static ssize_t sanitize_environ(char *buf, ssize_t n) {
    ssize_t out = 0;
    ssize_t start = 0;
    while (start < n) {
        ssize_t end = start;
        while (end < n && buf[end] != '\0') end++;
        int drop = str_starts_with(buf + start, "LD_PRELOAD=") ||
                   str_starts_with(buf + start, "PIXEL_HW__=");
        if (!drop) {
            for (ssize_t i = start; i < end; i++) buf[out++] = buf[i];
            buf[out++] = '\0';
        }
        start = (end < n) ? end + 1 : end;
    }
    if (out == 0) buf[out++] = '\0';
    return out;
}

static int proc_snapshot(const char *path, int fd) {
    if (fd < 0 || my_getuid() < 10000) return fd;
    int environ = is_self_proc_path(path, "environ");
    int smaps = is_self_proc_path(path, "smaps");
    int numa = 0;
    int rollup = 0;
    if (!environ && !smaps && !is_self_proc_path(path, "maps")) {
        numa = is_self_proc_path(path, "numa_maps");
        rollup = is_self_proc_path(path, "smaps_rollup");
        if (!numa && !rollup) return fd;
    }
    ssize_t n = 0;
    while (n < PROC_BUF_SIZE - 1) {
        long r = raw_read(fd, s_proc_buf + n, (unsigned long)(PROC_BUF_SIZE - 1 - n));
        if (r <= 0) break;
        n += r;
    }
    if (n <= 0 || n >= PROC_BUF_SIZE - 1) {
        raw_lseek(fd, 0, 0);
        return fd;
    }
    ssize_t m = environ ? sanitize_environ(s_proc_buf, n) : smaps ? sanitize_smaps(s_proc_buf, n) : rollup ? n : sanitize_maps(s_proc_buf, n);
    int cloexec = 0;
    long fl = raw_fcntl(fd, 1 /*F_GETFD*/, 0);
    if (fl >= 0 && (fl & 1)) cloexec = 1;
    long mfd = raw_memfd_create(environ ? "environ" : smaps ? "smaps" : numa ? "numa_maps" : rollup ? "smaps_rollup" : "maps", 0x0001); // MFD_CLOEXEC
    if (mfd < 0) {
        raw_lseek(fd, 0, 0);
        return fd;
    }
    if (!cloexec) raw_fcntl((int)mfd, 2 /*F_SETFD*/, 0);
    ssize_t w = 0;
    while (w < m) {
        long r = raw_write((int)mfd, s_proc_buf + w, (unsigned long)(m - w));
        if (r <= 0) break;
        w += r;
    }
    if (w != m) {
        raw_close((int)mfd);
        raw_lseek(fd, 0, 0);
        return fd;
    }
    raw_lseek((int)mfd, 0, 0);
    raw_close(fd);
    return (int)mfd;
}

static void mark_net_fd(const char *path, int fd) {
    if (my_getuid() < 10000 || !path || fd < 0) return;
    if (str_contains(path, "/net/tcp")) fd_mark(s_tcp_fds, fd);
    else if (str_contains(path, "/net/dev")) fd_mark(s_dev_fds, fd);
    else if (str_contains(path, "/net/route")) fd_mark(s_route_fds, fd);
    else if (str_contains(path, "/net/arp")) fd_mark(s_arp_fds, fd);
}

int open(const char *path, int flags, ...) {
    fixup_ld_preload_lazy();
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    if (path && str_eq(path, "/dev/ashmem")) {
        return ashmem_open();
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
    fd = proc_snapshot(path, fd);
    mark_net_fd(path, fd);
    return fd;
}

int open64(const char *path, int flags, ...) {
    fixup_ld_preload_lazy();
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    if (path && str_eq(path, "/dev/ashmem")) {
        return ashmem_open();
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
    fd = proc_snapshot(path, fd);
    mark_net_fd(path, fd);
    return fd;
}

int openat(int dirfd, const char *path, int flags, ...) {
    fixup_ld_preload_lazy();
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    if (path && str_eq(path, "/dev/ashmem")) {
        return ashmem_open();
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
    fd = proc_snapshot(path, fd);
    mark_net_fd(path, fd);
    return fd;
}

int openat64(int dirfd, const char *path, int flags, ...) {
    fixup_ld_preload_lazy();
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    if (path && str_eq(path, "/dev/ashmem")) {
        return ashmem_open();
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
    fd = proc_snapshot(path, fd);
    mark_net_fd(path, fd);
    return fd;
}

// Variantes FORTIFY de Bionic/glibc (rutas __open_2/__openat_2 de libc)
int __open_2(const char *path, int flags) { return open(path, flags); }
int __open64_2(const char *path, int flags) { return open64(path, flags); }
int __openat_2(int dirfd, const char *path, int flags) { return openat(dirfd, path, flags); }
int __openat64_2(int dirfd, const char *path, int flags) { return openat64(dirfd, path, flags); }

// Listado de /sys/class/net: se redirige al arbol ficticio (lo + wlan0) para
// que eth0 no aparezca en opendir/readdir de las apps.
void *opendir(const char *path) {
    if (my_getuid() >= 10000) path = redirect_path(path);
    static void *(*real_fn)(const char *) = (void *)0;
    if (!real_fn) real_fn = dlsym_next("opendir");
    return real_fn ? real_fn(path) : (void *)0;
}

int close(int fd) {
    if (fd_in_range(fd) && s_ashmem_fds[fd]) {
        s_ashmem_fds[fd] = 0;
        ashmem_state_free(fd);
    }
    fd_clear(s_tcp_fds, fd);
    fd_clear(s_dev_fds, fd);
    fd_clear(s_route_fds, fd);
    fd_clear(s_arp_fds, fd);
    static int (*real_fn)(int) = (void *)0;
    if (!real_fn) real_fn = (int (*)(int))dlsym_next("close");
    return real_fn ? real_fn(fd) : -1;
}

// Comandos de fcntl que llevan argumento (Linux genérico x86/x86_64)
static int fcntl_cmd_has_arg(int cmd) {
    return cmd == 0 || cmd == 2 || cmd == 4 || cmd == 5 || cmd == 6 || cmd == 7 ||
           cmd == 8 || cmd == 10 || cmd == 15 || cmd == 16 ||
           cmd == 1024 || cmd == 1026 || cmd == 1030 || cmd == 1031 || cmd == 1033;
}

// Sonda de respaldo cuando fcntl(F_GET_SEALS) esta bloqueado: mapping PROT_READ
// primero descarta fds no mapeables (pipes/sockets devuelven EACCES/ENODEV
// segun kernel); mapping PROT_READ|PROT_WRITE fallido con EPERM/EACCES indica
// sello FUTURE_WRITE/WRITE (region solo-lectura). Devuelve sellos, o -1 si el
// fd no es una region de memoria.
static int seals_probe(int fd) {
    long a = raw_mmap(fd, 1);
    if (a < 0) return -1;
    raw_munmap((void *)a, 4096);
    long b = raw_mmap(fd, 3);
    if (b >= 0) {
        raw_munmap((void *)b, 4096);
        return 0;
    }
    if (b == -1 || b == -13) return 0x0010;
    return 0;
}

// Sellos de ashmem: para memfds sellables (los "shared_memory/<guid>" del
// libcutils parcheado) el sello se aplica REAL al kernel, imprescindible para
// la semántica cross-proceso (renderizadores WebView/Chrome leen el fd por
// SCM_RIGHTS). F_GET_SEALS reporta sellos reales más GROW|SHRINK sintéticos
// porque IsMemfdFd() de Chromium 155 los exige. Los memfd propios de
// /dev/ashmem no son sellables: ahí se mantiene el estado sintético por fd.
static int ashmem_fcntl(int fd, int cmd, unsigned long arg) {
    if (cmd == 1033) { // F_ADD_SEALS: aplicar al kernel si es posible + acumular
        struct ashmem_state *st = ashmem_state_new(fd);
        if (st) st->seals |= (int)arg;
        static int (*real_fn)(int, int, ...) = (void *)0;
        if (!real_fn) real_fn = (int (*)(int, int, ...))dlsym_next("fcntl");
        if (real_fn) real_fn(fd, 1033, arg);
        return 0;
    }
    if (cmd == 1034) { // F_GET_SEALS: sellos reales | GROW|SHRINK
        int seals = -1;
        static int (*real_fn)(int, int, ...) = (void *)0;
        if (!real_fn) real_fn = (int (*)(int, int, ...))dlsym_next("fcntl");
        if (real_fn) seals = real_fn(fd, 1034);
        if (seals < 0) {
            struct ashmem_state *st = ashmem_state_get(fd);
            seals = st ? st->seals : 0;
            if (seals == 0) {
                int p = seals_probe(fd);
                if (p > 0) seals = p;
            }
        }
        return 0x0006 | seals;
    }
    return -2; // no es un comando ashmem
}

int fcntl(int fd, int cmd, ...) {
    static int (*real_fn)(int, int, ...) = (void *)0;
    if (!real_fn) real_fn = (int (*)(int, int, ...))dlsym_next("fcntl");
    if (cmd == 1034 && fd_is_ashmem(fd)) {
        __builtin_va_list args;
        __builtin_va_start(args, cmd);
        unsigned long arg = __builtin_va_arg(args, unsigned long);
        __builtin_va_end(args);
        return ashmem_fcntl(fd, cmd, arg);
    }
    if (!real_fn) return -1;
    if (cmd == 1034) {
        // F_GET_SEALS exitoso implica memfd: un fd recien recibido por
        // binder/SCM_RIGHTS (renderizador) puede no clasificarse aqui porque
        // readlink esta bloqueado en isolated_app; GROW|SHRINK se sintetizan
        // igualmente porque IsMemfdFd() de Chromium 155 los exige.
        int real = real_fn(fd, 1034);
        if (real >= 0) return 0x0006 | real;
        if (real == -1) {
            int p = seals_probe(fd);
            if (p >= 0) return 0x0006 | p;
        }
        return real;
    }
    if (cmd == 1033 && fd_is_ashmem(fd)) {
        __builtin_va_list args;
        __builtin_va_start(args, cmd);
        unsigned long arg = __builtin_va_arg(args, unsigned long);
        __builtin_va_end(args);
        return ashmem_fcntl(fd, cmd, arg);
    }
    if (fcntl_cmd_has_arg(cmd)) {
        __builtin_va_list args;
        __builtin_va_start(args, cmd);
        unsigned long arg = __builtin_va_arg(args, unsigned long);
        __builtin_va_end(args);
        return real_fn(fd, cmd, arg);
    }
    return real_fn(fd, cmd);
}

int fcntl64(int fd, int cmd, ...) {
    static int (*real_fn)(int, int, ...) = (void *)0;
    if (!real_fn) real_fn = (int (*)(int, int, ...))dlsym_next("fcntl64");
    if (!real_fn) real_fn = (int (*)(int, int, ...))dlsym_next("fcntl");
    if (cmd == 1034 && fd_is_ashmem(fd)) {
        __builtin_va_list args;
        __builtin_va_start(args, cmd);
        unsigned long arg = __builtin_va_arg(args, unsigned long);
        __builtin_va_end(args);
        return ashmem_fcntl(fd, cmd, arg);
    }
    if (!real_fn) return -1;
    if (cmd == 1034) {
        int real = real_fn(fd, 1034);
        if (real >= 0) return 0x0006 | real;
        if (real == -1) {
            int p = seals_probe(fd);
            if (p >= 0) return 0x0006 | p;
        }
        return real;
    }
    if (cmd == 1033 && fd_is_ashmem(fd)) {
        __builtin_va_list args;
        __builtin_va_start(args, cmd);
        unsigned long arg = __builtin_va_arg(args, unsigned long);
        __builtin_va_end(args);
        return ashmem_fcntl(fd, cmd, arg);
    }
    if (fcntl_cmd_has_arg(cmd)) {
        __builtin_va_list args;
        __builtin_va_start(args, cmd);
        unsigned long arg = __builtin_va_arg(args, unsigned long);
        __builtin_va_end(args);
        return real_fn(fd, cmd, arg);
    }
    return real_fn(fd, cmd);
}

int dup2(int oldfd, int newfd) {
    if (fd_in_range(newfd)) {
        fd_clear(s_ashmem_fds, newfd);
        fd_clear(s_tcp_fds, newfd);
        fd_clear(s_dev_fds, newfd);
        fd_clear(s_route_fds, newfd);
        fd_clear(s_arp_fds, newfd);
        ashmem_state_free(newfd);
    }
    static int (*real_fn)(int, int) = (void *)0;
    if (!real_fn) real_fn = (int (*)(int, int))dlsym_next("dup2");
    return real_fn ? real_fn(oldfd, newfd) : -1;
}

int dup3(int oldfd, int newfd, int flags) {
    if (fd_in_range(newfd)) {
        fd_clear(s_ashmem_fds, newfd);
        fd_clear(s_tcp_fds, newfd);
        fd_clear(s_dev_fds, newfd);
        fd_clear(s_route_fds, newfd);
        fd_clear(s_arp_fds, newfd);
        ashmem_state_free(newfd);
    }
    static int (*real_fn)(int, int, int) = (void *)0;
    if (!real_fn) real_fn = (int (*)(int, int, int))dlsym_next("dup3");
    return real_fn ? real_fn(oldfd, newfd, flags) : -1;
}

#define ASHMEM_IS_OPCODE(r) ((r) >= 0x7701 && (r) <= 0x770a)

static int ioctl_cmd_has_arg(unsigned long request) {
    return request == 0x7701 || request == 0x7702 || request == 0x7703 ||
           request == 0x7705 || request == 0x7707 || request == 0x7708;
}

int ioctl(int fd, unsigned long request, ...) {
    // Solo se clasifica el fd para opcodes ashmem: evita un readlink por
    // cada ioctl de Binder/socket/etc. en el camino caliente.
    if (ASHMEM_IS_OPCODE(request) && fd_is_ashmem(fd)) {
        unsigned long arg = 0;
        if (ioctl_cmd_has_arg(request)) {
            __builtin_va_list args;
            __builtin_va_start(args, request);
            arg = __builtin_va_arg(args, unsigned long);
            __builtin_va_end(args);
        }
        switch (request) {
            case 0x7701: { // ASHMEM_SET_NAME
                struct ashmem_state *st = ashmem_state_new(fd);
                const char *src = (const char *)arg;
                if (st && src) {
                    int i = 0;
                    while (src[i] && i < (int)sizeof(st->name) - 1) { st->name[i] = src[i]; i++; }
                    st->name[i] = '\0';
                }
                return 0;
            }
            case 0x7702: { // ASHMEM_GET_NAME
                struct ashmem_state *st = ashmem_state_get(fd);
                char *dst = (char *)arg;
                const char *nm = (st && st->name[0]) ? st->name : "ashmem";
                if (dst) {
                    int i = 0;
                    while (nm[i]) { dst[i] = nm[i]; i++; }
                    dst[i] = '\0';
                }
                return 0;
            }
            case 0x7703: // ASHMEM_SET_SIZE
                return (int)syscall_ret(raw_ftruncate(fd, (unsigned long long)(unsigned long)arg));
            case 0x7704: { // ASHMEM_GET_SIZE (vía lseek END, sin tocar el offset)
                long cur = raw_lseek(fd, 0, 1 /*SEEK_CUR*/);
                long size = raw_lseek(fd, 0, 2 /*SEEK_END*/);
                if (cur >= 0) raw_lseek(fd, cur, 0 /*SEEK_SET*/);
                if (size < 0) return (int)syscall_ret(size);
                return (int)size;
            }
            case 0x7705: { // ASHMEM_SET_PROT_MASK
                struct ashmem_state *st = ashmem_state_new(fd);
                if (st) st->prot = (int)arg;
                return 0;
            }
            case 0x7706: { // ASHMEM_GET_PROT_MASK
                struct ashmem_state *st = ashmem_state_get(fd);
                return st ? st->prot : 3; // PROT_READ | PROT_WRITE
            }
            case 0x7707: // ASHMEM_PIN
            case 0x7708: // ASHMEM_UNPIN
            case 0x7709: // ASHMEM_GET_PIN_STATUS
                return 0;
            case 0x770a: // ASHMEM_PURGE_ALL_CACHES
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
    // ioctls de red por nombre en apps: el kernel no tiene wlan0, así que se
    // consulta eth0 con el mismo ifreq, se restaura el nombre y, para
    // SIOCGIFHWADDR, se inyecta la MAC del perfil (wlan0 coherente).
    if (arg && request >= 0x8913 && request <= 0x8949 && my_getuid() >= 10000) {
        char *ifr = (char *)arg;
        if (ifr[0] == 'w' && ifr[1] == 'l' && ifr[2] == 'a' &&
            ifr[3] == 'n' && ifr[4] == '0' && ifr[5] == '\0') {
            ifr[0] = 'e'; ifr[1] = 't'; ifr[2] = 'h';
            ifr[3] = '0'; ifr[4] = '\0';
            int ret = real_fn(fd, request, arg);
            if (request == 0x8927 && ret == 0) {
                load_fake_mac();
                if (s_fake_mac_ok) {
                    unsigned char *sa = (unsigned char *)arg + 18;
                    for (int i = 0; i < 6; i++) sa[i] = s_fake_mac[i];
                }
            }
            ifr[0] = 'w'; ifr[1] = 'l'; ifr[2] = 'a';
            ifr[3] = 'n'; ifr[4] = '0'; ifr[5] = '\0';
            return ret;
        }
    }
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
        } else if (fd_test(s_route_fds, fd)) {
            ret = filter_route_buffer((char *)buf, ret, count);
        } else if (fd_test(s_arp_fds, fd)) {
            ret = filter_arp_buffer((char *)buf, ret, count);
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
        } else if (fd_test(s_route_fds, fd)) {
            ret = filter_route_buffer((char *)buf, ret, count);
        } else if (fd_test(s_arp_fds, fd)) {
            ret = filter_arp_buffer((char *)buf, ret, count);
        }
    }
    return ret;
}

void *fopen(const char *path, const char *mode) {
    if (ashmem_fake_path(&path) < 0) return (void *)0;
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return (void *)0;
    }
    path = redirect_path(path);
    static void *(*real_fn)(const char *, const char *) = (void *)0;
    if (!real_fn) real_fn = dlsym_next("fopen");
    return real_fn ? real_fn(path, mode) : (void *)0;
}

void *fopen64(const char *path, const char *mode) {
    if (ashmem_fake_path(&path) < 0) return (void *)0;
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return (void *)0;
    }
    path = redirect_path(path);
    static void *(*real_fn)(const char *, const char *) = (void *)0;
    if (!real_fn) real_fn = dlsym_next("fopen64");
    if (!real_fn) real_fn = dlsym_next("fopen");
    return real_fn ? real_fn(path, mode) : (void *)0;
}

int fstatat(int dirfd, const char *path, void *buf, int flags) {
    if (ashmem_fake_path(&path) < 0) return -1;
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    path = redirect_path(path);
    static int (*real_fn)(int, const char *, void *, int) = (void *)0;
    if (!real_fn) real_fn = dlsym_next("fstatat");
    return real_fn ? real_fn(dirfd, path, buf, flags) : -1;
}

int fstatat64(int dirfd, const char *path, void *buf, int flags) {
    if (ashmem_fake_path(&path) < 0) return -1;
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    path = redirect_path(path);
    static int (*real_fn)(int, const char *, void *, int) = (void *)0;
    if (!real_fn) real_fn = dlsym_next("fstatat64");
    if (!real_fn) real_fn = dlsym_next("fstatat");
    return real_fn ? real_fn(dirfd, path, buf, flags) : -1;
}

int statx(int dirfd, const char *path, int flags, unsigned int mask, void *buf) {
    if (ashmem_fake_path(&path) < 0) return -1;
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    path = redirect_path(path);
    static int (*real_fn)(int, const char *, int, unsigned int, void *) = (void *)0;
    if (!real_fn) real_fn = dlsym_next("statx");
    return real_fn ? real_fn(dirfd, path, flags, mask, buf) : -1;
}

static int fake_sys_net_readlink(const char *path, char *buf, size_t bufsiz) {
    if (my_getuid() < 10000 || !path) return -2;
    if (str_starts_with(path, "/sys/class/net/eth0")) {
        set_enoent();
        return -1;
    }
    if (str_eq(path, "/sys/class/net/wlan0")) {
        static const char tgt[] = "../../devices/virtual/net/wlan0";
        size_t i = 0;
        while (tgt[i] && i < bufsiz) { buf[i] = tgt[i]; i++; }
        return (int)i;
    }
    // Los atributos de wlan0 (incluido address) son ficheros regulares en
    // sysfs: readlink debe devolver EINVAL, no ENOENT.
    if (str_starts_with(path, "/sys/class/net/wlan0/")) {
        set_errno_val(EINVAL_VAL);
        return -1;
    }
    return -2;
}

// Al abrir un atributo de wlan0 el fd apunta al fichero real de eth0 (o al
// arbol ficticio): /proc/self/fd/N no debe delatar esa ruta interna.
static ssize_t rewrite_fd_target(const char *path, char *buf, ssize_t n, size_t bufsiz) {
    if (n <= 0 || !path || !buf || my_getuid() < 10000) return n;
    if (!str_contains(path, "/fd/")) return n;
    static const char *const from[] = {
        "/sys/devices/virtual/net/eth0",
        "/sys/class/net/eth0",
        "/system/etc/proteomesh/sys_class_net/wlan0",
        "/data/local/tmp/fake_proc/mac_wlan0",
    };
    static const char *const to[] = {
        "/sys/class/net/wlan0",
        "/sys/class/net/wlan0",
        "/sys/class/net/wlan0",
        "/sys/class/net/wlan0/address",
    };
    for (unsigned int k = 0; k < sizeof(from) / sizeof(from[0]); k++) {
        int fl = 0, tl = 0;
        while (from[k][fl]) fl++;
        while (to[k][tl]) tl++;
        if (n < fl) continue;
        int ok = 1;
        for (int i = 0; i < fl; i++) {
            if (buf[i] != from[k][i]) { ok = 0; break; }
        }
        if (!ok) continue;
        ssize_t nn = n - fl + tl;
        if ((size_t)nn > bufsiz) return n;
        if (tl > fl) {
            for (ssize_t i = n - 1; i >= fl; i--) buf[i + (tl - fl)] = buf[i];
        } else if (tl < fl) {
            for (ssize_t i = fl; i < n; i++) buf[i - (fl - tl)] = buf[i];
        }
        for (int i = 0; i < tl; i++) buf[i] = to[k][i];
        return nn;
    }
    return n;
}

ssize_t readlink(const char *path, char *buf, size_t bufsiz) {
    if (ashmem_fake_path(&path) < 0) return -1;
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    int fr = fake_sys_net_readlink(path, buf, bufsiz);
    if (fr != -2) return fr;
    static ssize_t (*real_fn)(const char *, char *, size_t) = (void *)0;
    if (!real_fn) real_fn = dlsym_next("readlink");
    ssize_t r = real_fn ? real_fn(path, buf, bufsiz) : -1;
    return rewrite_fd_target(path, buf, r, bufsiz);
}

ssize_t readlinkat(int dirfd, const char *path, char *buf, size_t bufsiz) {
    if (ashmem_fake_path(&path) < 0) return -1;
    if (my_getuid() >= 10000 && is_root_artifact(path)) {
        set_enoent();
        return -1;
    }
    int fr = fake_sys_net_readlink(path, buf, bufsiz);
    if (fr != -2) return fr;
    static ssize_t (*real_fn)(int, const char *, char *, size_t) = (void *)0;
    if (!real_fn) real_fn = dlsym_next("readlinkat");
    ssize_t r = real_fn ? real_fn(dirfd, path, buf, bufsiz) : -1;
    return rewrite_fd_target(path, buf, r, bufsiz);
}

#ifdef __LP64__
#define PIXEL_HW_PRELOAD "LD_PRELOAD=/system/lib64/libpixel_hw.so"
#else
#define PIXEL_HW_PRELOAD "LD_PRELOAD=/system/lib/libpixel_hw.so"
#endif

static int envp_with_preload(char *const envp[], char **out, int cap) {
    char *const *base = envp ? envp : environ;
    if (!base) return 0;
    int n = 0;
    while (base[n]) n++;
    if (n + 2 > cap) return 0;
    int j = 0;
    int found = 0;
    for (int i = 0; i < n; i++) {
        out[j++] = base[i];
        if (str_starts_with(base[i], "LD_PRELOAD=")) found = 1;
    }
    if (!found) out[j++] = (char *)PIXEL_HW_PRELOAD;
    out[j] = (char *)0;
    return 1;
}

int execve(const char *pathname, char *const argv[], char *const envp[]) {
    char *exec_envp_buf[512];
    char *const *exec_envp = envp;
    if (my_getuid() >= 10000) {
        if (envp_with_preload(envp, exec_envp_buf, 512)) exec_envp = exec_envp_buf;
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
    if (!real_fn) real_fn = dlsym_next("execve");
    return real_fn ? real_fn(pathname, argv, (char *const *)exec_envp) : -1;
}
