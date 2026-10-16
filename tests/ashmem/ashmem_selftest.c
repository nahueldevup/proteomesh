// ProteoMesh — selftest host-side del shim ashmem (libpixel_hw.so)
//
// Se compila NORMAL (con libc) y se ejecuta con LD_PRELOAD apuntando al shim
// compilado por src/libpixel_hw/build.sh. Valida la semántica que consumen
// Chromium/Meta (F_ADD_SEALS/F_GET_SEALS, ioctls ashmem completos, identidad
// por file-description tras dup/SCM_RIGHTS) sin necesidad de Android.
//
// Uso: tests/ashmem/run_host_test.sh

#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <unistd.h>

#ifndef F_ADD_SEALS
#define F_ADD_SEALS 1033
#endif
#ifndef F_GET_SEALS
#define F_GET_SEALS 1034
#endif
#ifndef F_SEAL_SHRINK
#define F_SEAL_SHRINK 0x0002
#endif
#ifndef F_SEAL_GROW
#define F_SEAL_GROW 0x0004
#endif

#define ASHMEM_SET_NAME 0x7701
#define ASHMEM_GET_NAME 0x7702
#define ASHMEM_SET_SIZE 0x7703
#define ASHMEM_GET_SIZE 0x7704
#define ASHMEM_SET_PROT_MASK 0x7705
#define ASHMEM_GET_PROT_MASK 0x7706
#define ASHMEM_PIN 0x7707
#define ASHMEM_UNPIN 0x7708
#define ASHMEM_GET_PIN_STATUS 0x7709
#define ASHMEM_PURGE_ALL_CACHES 0x770a

static int g_fails = 0;

static void check(int cond, const char *msg) {
    if (cond) {
        printf("  ok   %s\n", msg);
    } else {
        printf("  FAIL %s (errno=%d: %s)\n", msg, errno, strerror(errno));
        g_fails++;
    }
}

static int test_basic(void) {
    int fd = open("/dev/ashmem", O_RDWR);
    check(fd >= 0, "open(/dev/ashmem) devuelve fd");
    if (fd < 0) return -1;

    char proc[64];
    char link[128];
    memset(link, 0, sizeof(link));
    snprintf(proc, sizeof(proc), "/proc/self/fd/%d", fd);
    ssize_t n = readlink(proc, link, sizeof(link) - 1);
    check(n > 0 && strstr(link, "memfd:ashmem") != NULL,
          "el fd es un memfd llamado ashmem");

    check(fcntl(fd, F_ADD_SEALS, F_SEAL_GROW | F_SEAL_SHRINK) == 0,
          "F_ADD_SEALS sintético (éxito)");
    int seals = fcntl(fd, F_GET_SEALS);
    check((seals & (F_SEAL_GROW | F_SEAL_SHRINK)) == (F_SEAL_GROW | F_SEAL_SHRINK),
          "F_GET_SEALS reporta GROW|SHRINK (IsMemfdFd)");

    check(ioctl(fd, ASHMEM_SET_SIZE, 8192UL) == 0, "ASHMEM_SET_SIZE");
    check(ioctl(fd, ASHMEM_GET_SIZE) == 8192, "ASHMEM_GET_SIZE");

    char name[64];
    memset(name, 0, sizeof(name));
    check(ioctl(fd, ASHMEM_SET_NAME, (void *)"selftest") == 0, "ASHMEM_SET_NAME");
    check(ioctl(fd, ASHMEM_GET_NAME, name) == 0 && strcmp(name, "selftest") == 0,
          "ASHMEM_GET_NAME refleja el nombre puesto");

    check(ioctl(fd, ASHMEM_GET_PROT_MASK) == 3, "ASHMEM_GET_PROT_MASK default RW");
    check(ioctl(fd, ASHMEM_SET_PROT_MASK, 1UL) == 0, "ASHMEM_SET_PROT_MASK");
    check(ioctl(fd, ASHMEM_GET_PROT_MASK) == 1, "ASHMEM_GET_PROT_MASK eco");
    ioctl(fd, ASHMEM_SET_PROT_MASK, 3UL);

    check(ioctl(fd, ASHMEM_PIN, (void *)0) == 0, "ASHMEM_PIN");
    check(ioctl(fd, ASHMEM_UNPIN, (void *)0) == 0, "ASHMEM_UNPIN");
    check(ioctl(fd, ASHMEM_GET_PIN_STATUS) == 0, "ASHMEM_GET_PIN_STATUS");
    check(ioctl(fd, ASHMEM_PURGE_ALL_CACHES) == 0, "ASHMEM_PURGE_ALL_CACHES");

    // El memfd se crea con MFD_CLOEXEC => FD_CLOEXEC ya viene puesto (igual
    // que el ashmem real de Android con memfd). Lo que importa es que el
    // comando sin argumento no se rompa.
    check(fcntl(fd, F_GETFD) == FD_CLOEXEC, "fcntl F_GETFD (comando sin argumento)");
    check(fcntl(fd, F_SETFD, FD_CLOEXEC) == 0, "fcntl F_SETFD con argumento");
    check((fcntl(fd, F_GETFD) & FD_CLOEXEC) != 0, "F_GETFD refleja FD_CLOEXEC");

    return fd;
}

static void test_dup(int fd) {
    int d = dup(fd);
    check(d >= 0, "dup() del fd ashmem");
    if (d >= 0) {
        int seals = fcntl(d, F_GET_SEALS);
        check((seals & (F_SEAL_GROW | F_SEAL_SHRINK)) == (F_SEAL_GROW | F_SEAL_SHRINK),
              "clasificación readlink sobre fd duplicado");
        check(ioctl(d, ASHMEM_GET_SIZE) == 8192, "GET_SIZE sobre fd duplicado");
        close(d);
    }

    int d2 = fcntl(fd, F_DUPFD, 700);
    check(d2 >= 700, "fcntl F_DUPFD");
    if (d2 >= 700) {
        check((fcntl(d2, F_GET_SEALS) & (F_SEAL_GROW | F_SEAL_SHRINK)) == (F_SEAL_GROW | F_SEAL_SHRINK),
              "F_GET_SEALS sobre fd de F_DUPFD");
        close(d2);
    }
}

// dup2 sobre un fd ashmem debe limpiar la marca (sin falsos positivos)
static void test_dup2_stale(void) {
    int b = open("/dev/ashmem", O_RDWR);
    check(b >= 0, "segundo open ashmem");
    if (b < 0) return;
    check((fcntl(b, F_GET_SEALS) & F_SEAL_GROW) != 0, "segundo fd clasificado");

    int p[2];
    if (pipe(p) != 0) {
        check(0, "pipe");
        close(b);
        return;
    }
    int r = dup2(p[0], b);
    check(r == b, "dup2(pipe, fd_ashmem) reemplaza el fd");
    errno = 0;
    int seals = fcntl(b, F_GET_SEALS);
    check(seals == -1 && errno == EINVAL,
          "sin falso positivo tras dup2 (marca limpiada; EINVAL real)");
    close(p[0]);
    close(p[1]);
    close(b);
}

// El fd pasa por el kernel (SCM_RIGHTS): la marca en memoria no viaja,
// la clasificación debe recuperarlo por readlink.
static void test_scm(int fd) {
    int sv[2];
    if (socketpair(AF_UNIX, SOCK_STREAM, 0, sv) != 0) {
        check(0, "socketpair");
        return;
    }
    pid_t pid = fork();
    if (pid == 0) {
        close(sv[0]);
        char c = 0;
        struct iovec iov = { .iov_base = &c, .iov_len = 1 };
        char ctrl[CMSG_SPACE(sizeof(int))];
        struct msghdr msg;
        memset(&msg, 0, sizeof(msg));
        msg.msg_iov = &iov;
        msg.msg_iovlen = 1;
        msg.msg_control = ctrl;
        msg.msg_controllen = sizeof(ctrl);
        if (recvmsg(sv[1], &msg, 0) <= 0) _exit(11);
        struct cmsghdr *cm = CMSG_FIRSTHDR(&msg);
        if (!cm || cm->cmsg_level != SOL_SOCKET || cm->cmsg_type != SCM_RIGHTS) _exit(12);
        int recv_fd = -1;
        memcpy(&recv_fd, CMSG_DATA(cm), sizeof(int));
        int s = fcntl(recv_fd, F_GET_SEALS);
        if ((s & (F_SEAL_GROW | F_SEAL_SHRINK)) != (F_SEAL_GROW | F_SEAL_SHRINK)) _exit(13);
        if (ioctl(recv_fd, ASHMEM_GET_SIZE) != 8192) _exit(14);
        _exit(0);
    }
    close(sv[1]);
    char c = 'x';
    struct iovec iov = { .iov_base = &c, .iov_len = 1 };
    char ctrl[CMSG_SPACE(sizeof(int))];
    memset(ctrl, 0, sizeof(ctrl));
    struct msghdr msg;
    memset(&msg, 0, sizeof(msg));
    msg.msg_iov = &iov;
    msg.msg_iovlen = 1;
    msg.msg_control = ctrl;
    msg.msg_controllen = sizeof(ctrl);
    struct cmsghdr *cm = CMSG_FIRSTHDR(&msg);
    cm->cmsg_level = SOL_SOCKET;
    cm->cmsg_type = SCM_RIGHTS;
    cm->cmsg_len = CMSG_LEN(sizeof(int));
    memcpy(CMSG_DATA(cm), &fd, sizeof(int));
    int sent = (int)sendmsg(sv[0], &msg, 0);
    check(sent > 0, "sendmsg con SCM_RIGHTS");
    int st = 0;
    waitpid(pid, &st, 0);
    if (WIFEXITED(st) && WEXITSTATUS(st) == 0) {
        check(1, "hijo: sellos y GET_SIZE sobre fd recibido por SCM_RIGHTS");
    } else {
        printf("  FAIL hijo salió con estado %d (11=recv 12=cmsg 13=seals 14=size)\n",
               WIFEXITED(st) ? WEXITSTATUS(st) : -1);
        g_fails++;
    }
    close(sv[0]);
}

// Política device.ashmem: fake_proc/ashmem_present == "0" => ausente
static void test_policy(void) {
    char tmpl[] = "/tmp/opencode/ashmem_policy_XXXXXX";
    char *dir = mkdtemp(tmpl);
    if (!dir) {
        check(0, "mkdtemp");
        return;
    }
    char file[256];
    snprintf(file, sizeof(file), "%s/ashmem_present", dir);
    setenv("PIXEL_HW_FAKE_PROC", dir, 1);

    FILE *f = fopen(file, "w");
    if (f) { fputs("0\n", f); fclose(f); }

    errno = 0;
    int fd = open("/dev/ashmem", O_RDWR);
    check(fd == -1 && errno == ENOENT, "política off: open da ENOENT");
    if (fd >= 0) close(fd);
    errno = 0;
    check(access("/dev/ashmem", F_OK) == -1 && errno == ENOENT, "política off: access da ENOENT");
    errno = 0;
    struct stat stbuf;
    check(stat("/dev/ashmem", &stbuf) == -1 && errno == ENOENT, "política off: stat da ENOENT");

    f = fopen(file, "w");
    if (f) { fputs("1\n", f); fclose(f); }

    fd = open("/dev/ashmem", O_RDWR);
    check(fd >= 0, "política on: open OK");
    if (fd >= 0) close(fd);
    check(access("/dev/ashmem", F_OK) == 0, "política on: access F_OK OK");
    check(stat("/dev/ashmem", &stbuf) == 0 && S_ISCHR(stbuf.st_mode),
          "política on: stat coherente (chardev)");

    unsetenv("PIXEL_HW_FAKE_PROC");
    unlink(file);
    rmdir(dir);
}

int main(void) {
    printf("== ProteoMesh ashmem selftest (shim via LD_PRELOAD) ==\n");
    int fd = test_basic();
    if (fd >= 0) {
        test_dup(fd);
        test_dup2_stale();
        test_scm(fd);
        close(fd);
    }
    test_policy();
    if (g_fails == 0) {
        printf("RESULT: OK\n");
        return 0;
    }
    printf("RESULT: %d fallas\n", g_fails);
    return 1;
}
