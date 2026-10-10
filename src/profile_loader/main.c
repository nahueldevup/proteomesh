#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <time.h>
#include <sys/stat.h>
#include "cJSON.h"

#define DEFAULT_PROFILE_PATH "/system/etc/proteomesh_profile.json"
#define FAKEDIR "/data/local/tmp/fake_proc"

static const char *get_resetprop_bin(void) {
    if (access("/sbin/resetprop", X_OK) == 0) return "/sbin/resetprop";
    if (access("/system/bin/resetprop", X_OK) == 0) return "/system/bin/resetprop";
    return "/data/adb/magisk/magisk resetprop";
}

static void set_prop(const char *key, const char *val) {
    if (!key || !val || strlen(key) == 0 || strlen(val) == 0) return;
    char cmd[1024];
    snprintf(cmd, sizeof(cmd), "%s -n \"%s\" \"%s\" 2>/dev/null", get_resetprop_bin(), key, val);
    system(cmd);
}

static char *get_prop(const char *key, char *out, size_t max_len) {
    char cmd[512];
    snprintf(cmd, sizeof(cmd), "%s \"%s\" 2>/dev/null", get_resetprop_bin(), key);
    FILE *fp = popen(cmd, "r");
    if (!fp) { out[0] = '\0'; return out; }
    if (fgets(out, max_len, fp) == NULL) { out[0] = '\0'; }
    pclose(fp);
    size_t l = strlen(out);
    while (l > 0 && (out[l-1] == '\r' || out[l-1] == '\n' || out[l-1] == ' ')) {
        out[--l] = '\0';
    }
    return out;
}

static int calc_luhn(const char *digits, int len) {
    int total = 0;
    for (int i = 0; i < len; i++) {
        int d = digits[i] - '0';
        if (i % 2 == 1) {
            d *= 2;
            if (d > 9) d = (d / 10) + (d % 10);
        }
        total += d;
    }
    return (10 - (total % 10)) % 10;
}

static void rand_hex(char *out, int bytes, int uppercase) {
    FILE *fp = fopen("/dev/urandom", "rb");
    if (!fp) {
        srand(time(NULL));
        for (int i = 0; i < bytes; i++) {
            sprintf(out + (i * 2), uppercase ? "%02X" : "%02x", rand() % 256);
        }
        out[bytes * 2] = '\0';
        return;
    }
    for (int i = 0; i < bytes; i++) {
        unsigned char b;
        fread(&b, 1, 1, fp);
        sprintf(out + (i * 2), uppercase ? "%02X" : "%02x", b);
    }
    fclose(fp);
}

static void rand_digits(char *out, int count) {
    FILE *fp = fopen("/dev/urandom", "rb");
    if (!fp) {
        srand(time(NULL));
        for (int i = 0; i < count; i++) out[i] = '0' + (rand() % 10);
        out[count] = '\0';
        return;
    }
    for (int i = 0; i < count; i++) {
        unsigned char b;
        fread(&b, 1, 1, fp);
        out[i] = '0' + (b % 10);
    }
    out[count] = '\0';
    fclose(fp);
}

static cJSON *load_profile(const char *path) {
    const char *p = (path && access(path, R_OK) == 0) ? path : DEFAULT_PROFILE_PATH;
    if (access(p, R_OK) != 0) {
        fprintf(stderr, "Error: Profile file not found: %s\n", p);
        return NULL;
    }
    FILE *fp = fopen(p, "rb");
    if (!fp) return NULL;
    fseek(fp, 0, SEEK_END);
    long sz = ftell(fp);
    fseek(fp, 0, SEEK_SET);
    char *buf = malloc(sz + 1);
    fread(buf, 1, sz, fp);
    buf[sz] = '\0';
    fclose(fp);

    cJSON *json = cJSON_Parse(buf);
    free(buf);
    return json;
}

static const char *json_get_str(cJSON *obj, const char *key, const char *defval) {
    if (!obj) return defval;
    cJSON *item = cJSON_GetObjectItem(obj, key);
    if (item && cJSON_IsString(item) && item->valuestring) {
        return item->valuestring;
    }
    return defval;
}

static int json_get_int(cJSON *obj, const char *key, int defval) {
    if (!obj) return defval;
    cJSON *item = cJSON_GetObjectItem(obj, key);
    if (item && cJSON_IsNumber(item)) {
        return item->valueint;
    }
    return defval;
}

static double json_get_double(cJSON *obj, const char *key, double defval) {
    if (!obj) return defval;
    cJSON *item = cJSON_GetObjectItem(obj, key);
    if (item && cJSON_IsNumber(item)) {
        return item->valuedouble;
    }
    return defval;
}

static void generate_identity(cJSON *json) {
    cJSON *id_tmpl = cJSON_GetObjectItem(json, "identity_template");
    const char *tac = json_get_str(id_tmpl, "tac", "35824011");
    const char *serial_pfx = json_get_str(id_tmpl, "serial_prefix", "1A181F");
    const char *wifi_oui = json_get_str(id_tmpl, "wifi_mac_oui", "3c:28:6d");
    const char *bt_oui = json_get_str(id_tmpl, "bt_mac_oui", "3c:28:6d");
    const char *imsi_pfx = json_get_str(id_tmpl, "imsi_prefix", "72234");
    const char *iccid_pfx = json_get_str(id_tmpl, "iccid_prefix", "895434");
    const char *phone_pfx = json_get_str(id_tmpl, "phone_prefix", "+54911");

    // 1. IMEI
    char base_imei[32];
    char rand_snr[8];
    rand_digits(rand_snr, 6);
    snprintf(base_imei, sizeof(base_imei), "%s%s", tac, rand_snr);
    int cd = calc_luhn(base_imei, (int)strlen(base_imei));
    char full_imei[32];
    snprintf(full_imei, sizeof(full_imei), "%s%d", base_imei, cd);
    set_prop("persist.sys.fake.imei", full_imei);

    // 2. MEID
    char rand_meid[16];
    rand_hex(rand_meid, 4, 1);
    char full_meid[32];
    snprintf(full_meid, sizeof(full_meid), "A00000%s", rand_meid);
    set_prop("persist.sys.fake.meid", full_meid);

    // 3. Serial
    char rand_ser[16];
    rand_hex(rand_ser, 3, 1);
    char full_serial[32];
    snprintf(full_serial, sizeof(full_serial), "%s%s", serial_pfx, rand_ser);
    set_prop("persist.sys.fake.serial", full_serial);
    set_prop("ro.serialno", full_serial);
    set_prop("ro.boot.serialno", full_serial);

    // 4. Android ID
    char full_aid[32];
    rand_hex(full_aid, 8, 0);
    set_prop("persist.sys.fake.android_id", full_aid);
    char aid_cmd[256];
    snprintf(aid_cmd, sizeof(aid_cmd), "settings put secure android_id %s 2>/dev/null", full_aid);
    system(aid_cmd);

    // 5. Wi-Fi MAC
    char r_wmac[8];
    rand_hex(r_wmac, 3, 0);
    char full_wmac[32];
    snprintf(full_wmac, sizeof(full_wmac), "%s:%.2s:%.2s:%.2s", wifi_oui, r_wmac, r_wmac+2, r_wmac+4);
    set_prop("persist.sys.fake.wifi_mac", full_wmac);

    // 6. Bluetooth MAC
    char r_bmac[8];
    rand_hex(r_bmac, 3, 0);
    char full_bmac[32];
    snprintf(full_bmac, sizeof(full_bmac), "%s:%.2s:%.2s:%.2s", bt_oui, r_bmac, r_bmac+2, r_bmac+4);
    set_prop("persist.sys.fake.bt_mac", full_bmac);

    // 7. IMSI
    char rand_imsi[16];
    rand_digits(rand_imsi, 10);
    char full_imsi[32];
    snprintf(full_imsi, sizeof(full_imsi), "%s%s", imsi_pfx, rand_imsi);
    set_prop("persist.sys.fake.imsi", full_imsi);

    // 8. ICCID
    char rand_iccid[24];
    rand_digits(rand_iccid, 13);
    char base_iccid[32];
    snprintf(base_iccid, sizeof(base_iccid), "%s%s", iccid_pfx, rand_iccid);
    int iccid_cd = calc_luhn(base_iccid, (int)strlen(base_iccid));
    char full_iccid[32];
    snprintf(full_iccid, sizeof(full_iccid), "%s%d", base_iccid, iccid_cd);
    set_prop("persist.sys.fake.iccid", full_iccid);

    // 9. Phone
    char rand_phone[16];
    rand_digits(rand_phone, 8);
    char full_phone[32];
    snprintf(full_phone, sizeof(full_phone), "%s%s", phone_pfx, rand_phone);
    set_prop("persist.sys.fake.phone", full_phone);
}

static void ensure_identity(cJSON *json) {
    char cur_imei[64];
    get_prop("persist.sys.fake.imei", cur_imei, sizeof(cur_imei));
    if (strlen(cur_imei) == 0) {
        generate_identity(json);
    } else {
        char cur_ser[64];
        get_prop("persist.sys.fake.serial", cur_ser, sizeof(cur_ser));
        if (strlen(cur_ser) > 0) {
            set_prop("ro.serialno", cur_ser);
            set_prop("ro.boot.serialno", cur_ser);
        }
    }
}

static void apply_cpuinfo(cJSON *cpu) {
    mkdir(FAKEDIR, 0755);
    char path[256];
    snprintf(path, sizeof(path), "%s/cpuinfo", FAKEDIR);
    FILE *fp = fopen(path, "w");
    if (!fp) return;

    cJSON *clusters = cJSON_GetObjectItem(cpu, "clusters");
    int core_idx = 0;
    if (clusters && cJSON_IsArray(clusters)) {
        int num_clusters = cJSON_GetArraySize(clusters);
        for (int c = 0; c < num_clusters; c++) {
            cJSON *cl = cJSON_GetArrayItem(clusters, c);
            int count = json_get_int(cl, "count", 1);
            const char *impl = json_get_str(cl, "implementer", "0x41");
            const char *part = json_get_str(cl, "part", "0xd05");
            const char *variant = json_get_str(cl, "variant", "0x1");
            const char *rev = json_get_str(cl, "revision", "0");
            for (int k = 0; k < count; k++) {
                fprintf(fp, "processor\t: %d\n", core_idx++);
                fprintf(fp, "BogoMIPS\t: 38.40\n");
                fprintf(fp, "Features\t: fp asimd evtstrm aes pmull sha1 sha2 crc32 atomics fphp asimdhp cpuid asimdrdm lrcpc dcpop asimddp\n");
                fprintf(fp, "CPU implementer\t: %s\n", impl);
                fprintf(fp, "CPU architecture: 8\n");
                fprintf(fp, "CPU variant\t: %s\n", variant);
                fprintf(fp, "CPU part\t: %s\n", part);
                fprintf(fp, "CPU revision\t: %s\n\n", rev);
            }
        }
    }
    const char *hw_line = json_get_str(cpu, "hardware_line", "Qualcomm Technologies, Inc SM7250");
    fprintf(fp, "Hardware\t: %s\n", hw_line);
    fprintf(fp, "Revision\t: 0000\n");
    fprintf(fp, "Serial\t\t: 0000000000000000\n");
    fclose(fp);
    chmod(path, 0644);
}

static void apply_cpu_sysfs(cJSON *cpu) {
    const char *sys_dir = "/data/local/tmp/fake_sys_cpu";
    mkdir(sys_dir, 0755);
    char path[512];
    char cmd[512];

    cJSON *clusters = cJSON_GetObjectItem(cpu, "clusters");
    int total_cores = 0;
    if (clusters && cJSON_IsArray(clusters)) {
        int n = cJSON_GetArraySize(clusters);
        for (int i = 0; i < n; i++) {
            total_cores += json_get_int(cJSON_GetArrayItem(clusters, i), "count", 1);
        }
    }
    if (total_cores <= 0) total_cores = 8;

    snprintf(path, sizeof(path), "%s/online", sys_dir);
    FILE *fp = fopen(path, "w");
    if (fp) { fprintf(fp, "0-%d\n", total_cores - 1); fclose(fp); chmod(path, 0644); }
    snprintf(path, sizeof(path), "%s/present", sys_dir);
    fp = fopen(path, "w");
    if (fp) { fprintf(fp, "0-%d\n", total_cores - 1); fclose(fp); chmod(path, 0644); }
    snprintf(path, sizeof(path), "%s/possible", sys_dir);
    fp = fopen(path, "w");
    if (fp) { fprintf(fp, "0-%d\n", total_cores - 1); fclose(fp); chmod(path, 0644); }
    snprintf(path, sizeof(path), "%s/kernel_max", sys_dir);
    fp = fopen(path, "w");
    if (fp) { fprintf(fp, "%d\n", total_cores - 1); fclose(fp); chmod(path, 0644); }
    snprintf(path, sizeof(path), "%s/offline", sys_dir);
    fp = fopen(path, "w");
    if (fp) { fprintf(fp, "\n"); fclose(fp); chmod(path, 0644); }
    snprintf(path, sizeof(path), "%s/isolated", sys_dir);
    fp = fopen(path, "w");
    if (fp) { fprintf(fp, "\n"); fclose(fp); chmod(path, 0644); }

    const char *driver = json_get_str(cpu, "driver", "qcom-cpufreq");
    const char *gov = json_get_str(cpu, "governor", "schedutil");

    int core_idx = 0;
    if (clusters && cJSON_IsArray(clusters)) {
        int num_clusters = cJSON_GetArraySize(clusters);
        for (int c = 0; c < num_clusters; c++) {
            cJSON *cl = cJSON_GetArrayItem(clusters, c);
            int count = json_get_int(cl, "count", 1);
            int min_freq = json_get_int(cl, "min_freq", 576000);
            int max_freq = json_get_int(cl, "max_freq", 1804800);
            for (int k = 0; k < count; k++) {
                char cpu_dir[512];
                snprintf(cpu_dir, sizeof(cpu_dir), "%s/cpu%d/cpufreq", sys_dir, core_idx);
                snprintf(cmd, sizeof(cmd), "mkdir -p %s", cpu_dir);
                system(cmd);

                snprintf(path, sizeof(path), "%s/cpuinfo_max_freq", cpu_dir);
                fp = fopen(path, "w"); if (fp) { fprintf(fp, "%d\n", max_freq); fclose(fp); chmod(path, 0644); }

                snprintf(path, sizeof(path), "%s/cpuinfo_min_freq", cpu_dir);
                fp = fopen(path, "w"); if (fp) { fprintf(fp, "%d\n", min_freq); fclose(fp); chmod(path, 0644); }

                snprintf(path, sizeof(path), "%s/scaling_cur_freq", cpu_dir);
                fp = fopen(path, "w"); if (fp) { fprintf(fp, "%d\n", max_freq); fclose(fp); chmod(path, 0644); }

                snprintf(path, sizeof(path), "%s/scaling_max_freq", cpu_dir);
                fp = fopen(path, "w"); if (fp) { fprintf(fp, "%d\n", max_freq); fclose(fp); chmod(path, 0644); }

                snprintf(path, sizeof(path), "%s/scaling_min_freq", cpu_dir);
                fp = fopen(path, "w"); if (fp) { fprintf(fp, "%d\n", min_freq); fclose(fp); chmod(path, 0644); }

                snprintf(path, sizeof(path), "%s/scaling_governor", cpu_dir);
                fp = fopen(path, "w"); if (fp) { fprintf(fp, "%s\n", gov); fclose(fp); chmod(path, 0644); }

                snprintf(path, sizeof(path), "%s/scaling_available_governors", cpu_dir);
                fp = fopen(path, "w"); if (fp) { fprintf(fp, "schedutil performance powersave\n"); fclose(fp); chmod(path, 0644); }

                snprintf(path, sizeof(path), "%s/scaling_driver", cpu_dir);
                fp = fopen(path, "w"); if (fp) { fprintf(fp, "%s\n", driver); fclose(fp); chmod(path, 0644); }

                core_idx++;
            }
        }
    }
}

static void apply_cmdline_and_version(cJSON *dev, cJSON *kernel) {
    mkdir(FAKEDIR, 0755);
    char path[256];
    const char *hw = json_get_str(dev, "hardware", "qcom");
    const char *flavor = json_get_str(dev, "type", "user");

    snprintf(path, sizeof(path), "%s/cmdline", FAKEDIR);
    FILE *fp = fopen(path, "w");
    if (fp) {
        fprintf(fp, "console=null androidboot.hardware=%s androidboot.verifiedbootstate=green androidboot.flash.locked=1 androidboot.veritymode=enforcing androidboot.bootdevice=1d84000.ufshc buildvariant=%s\n", hw, flavor);
        fclose(fp);
        chmod(path, 0644);
    }

    const char *def_full_ver = "Linux version 4.19.282-g9e27c0faec01-ab10532298 (android-build@google.com) (Android (8490178, based on r450784d) clang version 14.0.6) #1 SMP PREEMPT Wed Oct 18 10:14:02 UTC 2023";
    const char *full_ver = json_get_str(kernel, "full_version", def_full_ver);

    snprintf(path, sizeof(path), "%s/version", FAKEDIR);
    fp = fopen(path, "w");
    if (fp) {
        fprintf(fp, "%s\n", full_ver);
        fclose(fp);
        chmod(path, 0644);
    }

    const char *uname_rel = json_get_str(kernel, "version", "4.19.282-g9e27c0faec01");
    snprintf(path, sizeof(path), "%s/uname_release", FAKEDIR);
    fp = fopen(path, "w");
    if (fp) {
        fprintf(fp, "%s\n", uname_rel);
        fclose(fp);
        chmod(path, 0644);
    }

    snprintf(path, sizeof(path), "%s/uname_version", FAKEDIR);
    fp = fopen(path, "w");
    if (fp) {
        fprintf(fp, "#1 SMP PREEMPT Wed Oct 18 10:14:02 UTC 2023\n");
        fclose(fp);
        chmod(path, 0644);
    }
}

static void apply_gpuinfo(cJSON *gpu) {
    mkdir(FAKEDIR, 0755);
    char path[256];
    const char *renderer = json_get_str(gpu, "renderer", "Adreno (TM) 620");
    const char *vendor = json_get_str(gpu, "vendor", "Qualcomm");
    const char *version = json_get_str(gpu, "version", "OpenGL ES 3.2 V@0502.0 (GIT@b843336, I155baec6fc, 1618349272) (Date:04/13/21)");

    snprintf(path, sizeof(path), "%s/gpu_renderer", FAKEDIR);
    FILE *fp = fopen(path, "w");
    if (fp) { fprintf(fp, "%s\n", renderer); fclose(fp); chmod(path, 0644); }

    snprintf(path, sizeof(path), "%s/gpu_vendor", FAKEDIR);
    fp = fopen(path, "w");
    if (fp) { fprintf(fp, "%s\n", vendor); fclose(fp); chmod(path, 0644); }

    snprintf(path, sizeof(path), "%s/gpu_version", FAKEDIR);
    fp = fopen(path, "w");
    if (fp) { fprintf(fp, "%s\n", version); fclose(fp); chmod(path, 0644); }
}

static void apply_sensors_dump(cJSON *json) {
    mkdir(FAKEDIR, 0755);
    char path[256];
    snprintf(path, sizeof(path), "%s/sensorservice.txt", FAKEDIR);
    FILE *fp = fopen(path, "w");
    if (!fp) return;

    cJSON *sensors = cJSON_GetObjectItem(json, "sensors");
    int count = (sensors && cJSON_IsArray(sensors)) ? cJSON_GetArraySize(sensors) : 0;
    fprintf(fp, "Sensor Device:\n");
    fprintf(fp, "Total %d h/w sensors, 0 running 0 disabled clients:\n", count > 0 ? count : 11);

    if (count > 0) {
        for (int i = 0; i < count; i++) {
            cJSON *s = cJSON_GetArrayItem(sensors, i);
            const char *name = json_get_str(s, "name", "Sensor");
            const char *vendor = json_get_str(s, "vendor", "Vendor");
            int ver = json_get_int(s, "version", 1);
            int type = json_get_int(s, "type", 1);
            const char *str_type = json_get_str(s, "string_type", "android.sensor.accelerometer");
            int fifo_res = json_get_int(s, "fifo_reserved", 0);
            int fifo_max = json_get_int(s, "fifo_max", 0);
            double min_delay = json_get_double(s, "min_delay", 2500);
            double max_delay = json_get_double(s, "max_delay", 200000);
            double min_rate = (max_delay > 0) ? (1000000.0 / max_delay) : 0.0;
            double max_rate = (min_delay > 0) ? (1000000.0 / min_delay) : 0.0;

            fprintf(fp, "0x%08x) %-30s | %-24s | ver: %d | type: %s(%d) | perm: n/a | flags: 0x00000000\n",
                    i + 1, name, vendor, ver, str_type, type);
            if (fifo_max > 0) {
                fprintf(fp, "\tcontinuous | minRate=%.2fHz | maxRate=%.2fHz | FIFO (reserved=%d, max=%d) | non-wakeUp | \n",
                        min_rate, max_rate, fifo_res, fifo_max);
            } else {
                fprintf(fp, "\tcontinuous | minRate=%.2fHz | maxRate=%.2fHz | no batching | non-wakeUp | \n",
                        min_rate, max_rate);
            }
        }
    } else {
        fprintf(fp, "0x00000001) BMI260 Accelerometer           | Bosch Sensortec          | ver: 1 | type: android.sensor.accelerometer(1) | perm: n/a | flags: 0x00000000\n");
        fprintf(fp, "\tcontinuous | minRate=10.00Hz | maxRate=200.00Hz | FIFO (reserved=3000, max=3000) | non-wakeUp | \n");
        fprintf(fp, "0x00000002) AK09918 Magnetometer           | Asahi Kasei Microdevices | ver: 1 | type: android.sensor.magnetic_field(2) | perm: n/a | flags: 0x00000000\n");
        fprintf(fp, "\tcontinuous | minRate=10.00Hz | maxRate=100.00Hz | FIFO (reserved=600, max=600) | non-wakeUp | \n");
        fprintf(fp, "0x00000003) BMI260 Gyroscope               | Bosch Sensortec          | ver: 1 | type: android.sensor.gyroscope(4) | perm: n/a | flags: 0x00000000\n");
        fprintf(fp, "\tcontinuous | minRate=10.00Hz | maxRate=200.00Hz | FIFO (reserved=3000, max=3000) | non-wakeUp | \n");
    }
    fclose(fp);
    chmod(path, 0644);
}

static void apply_camera_dump(cJSON *json) {
    mkdir(FAKEDIR, 0755);
    char path[256];
    snprintf(path, sizeof(path), "%s/camera_dump.txt", FAKEDIR);
    FILE *fp = fopen(path, "w");
    if (!fp) return;

    cJSON *tmpl = cJSON_GetObjectItem(json, "template");
    const char *dev_name = json_get_str(tmpl, "name", "Pixel 5");
    cJSON *cams = cJSON_GetObjectItem(json, "cameras");
    int count = (cams && cJSON_IsArray(cams)) ? cJSON_GetArraySize(cams) : 3;

    fprintf(fp, "Camera module HAL API version: 0x204\n");
    fprintf(fp, "Camera module API version: 0x204\n");
    fprintf(fp, "Camera module name: %s Camera HAL\n", dev_name);
    fprintf(fp, "Number of camera devices: %d\n", count);
    fprintf(fp, "Number of normal camera devices: %d\n", count);
    fprintf(fp, "Number of public camera devices visible to API1: 2\n");

    if (cams && cJSON_IsArray(cams)) {
        for (int i = 0; i < count; i++) {
            cJSON *c = cJSON_GetArrayItem(cams, i);
            const char *id = json_get_str(c, "id", "0");
            const char *facing = json_get_str(c, "facing", "BACK");
            int ori = json_get_int(c, "orientation", 90);
            fprintf(fp, "Camera ID: %s (%s)\n", id, strcmp(facing, "FRONT") == 0 ? "Front" : "Back");
            fprintf(fp, "  Facing: %s\n", facing);
            fprintf(fp, "  Orientation: %d\n", ori);
            fprintf(fp, "  Resource Cost: 100\n");
        }
    } else {
        fprintf(fp, "Camera ID: 0 (Back)\n  Facing: BACK\n  Orientation: 90\n  Resource Cost: 100\n");
        fprintf(fp, "Camera ID: 1 (Front)\n  Facing: FRONT\n  Orientation: 270\n  Resource Cost: 100\n");
        fprintf(fp, "Camera ID: 2 (Ultrawide)\n  Facing: BACK\n  Orientation: 90\n  Resource Cost: 100\n");
    }
    fclose(fp);
    chmod(path, 0644);
}

static void apply_build_props(cJSON *json) {
    mkdir(FAKEDIR, 0755);
    cJSON *dev = cJSON_GetObjectItem(json, "device");
    cJSON *cpu = cJSON_GetObjectItem(json, "cpu");
    cJSON *tel = cJSON_GetObjectItem(json, "telephony");

    const char *brand = json_get_str(dev, "brand", "google");
    const char *manuf = json_get_str(dev, "manufacturer", "Google");
    const char *model = json_get_str(dev, "model", "Pixel 5");
    const char *device = json_get_str(dev, "device", "redfin");
    const char *product = json_get_str(dev, "product", "redfin");
    const char *board = json_get_str(dev, "board", "redfin");
    const char *hardware = json_get_str(dev, "hardware", "qcom");
    const char *platform = json_get_str(dev, "platform", "sm7250");
    const char *build_id = json_get_str(dev, "build_id", "TQ3A.230901.001.C2");
    const char *incremental = json_get_str(dev, "incremental", "10750268");
    const char *sec_patch = json_get_str(dev, "security_patch", "2023-11-01");
    const char *release = json_get_str(dev, "release", "13");
    const char *sdk = json_get_str(dev, "sdk", "33");
    const char *fp_str = json_get_str(dev, "fingerprint", "google/redfin/redfin:13/TQ3A.230901.001.C2/10750268:user/release-keys");
    const char *desc = json_get_str(dev, "description", "redfin-user 13 TQ3A.230901.001.C2 10750268 release-keys");
    const char *flavor = json_get_str(dev, "flavor", "redfin-user");
    const char *build_host = json_get_str(dev, "build_host", strcmp(brand, "samsung") == 0 ? "se-corp.samsung.com" : "google.com");
    const char *carrier = json_get_str(tel, "carrier_name", "Personal");
    const char *carrier_prop = strcmp(brand, "samsung") == 0 ? "unknown" : carrier;
    const char *abilist = json_get_str(cpu, "abilist", "arm64-v8a,armeabi-v7a,armeabi");

    // 1. system_build.prop
    char path[256];
    snprintf(path, sizeof(path), "%s/system_build.prop", FAKEDIR);
    FILE *fp = fopen(path, "w");
    if (fp) {
        fprintf(fp, "####################################\n");
        fprintf(fp, "# ProteoMesh Dynamic System Build Properties\n");
        fprintf(fp, "####################################\n");
        fprintf(fp, "ro.product.system.brand=%s\n", brand);
        fprintf(fp, "ro.product.system.device=%s\n", device);
        fprintf(fp, "ro.product.system.manufacturer=%s\n", manuf);
        fprintf(fp, "ro.product.system.model=%s\n", model);
        fprintf(fp, "ro.product.system.name=%s\n", product);
        fprintf(fp, "ro.system.product.cpu.abilist=%s\n", abilist);
        fprintf(fp, "ro.system.product.cpu.abilist32=x86,armeabi-v7a,armeabi\n");
        fprintf(fp, "ro.system.product.cpu.abilist64=x86_64,arm64-v8a\n");
        fprintf(fp, "ro.system.build.date=Tue Sep 12 00:00:00 UTC 2023\n");
        fprintf(fp, "ro.system.build.date.utc=1694476800\n");
        fprintf(fp, "ro.system.build.fingerprint=%s\n", fp_str);
        fprintf(fp, "ro.system.build.id=%s\n", build_id);
        fprintf(fp, "ro.system.build.tags=release-keys\n");
        fprintf(fp, "ro.system.build.type=user\n");
        fprintf(fp, "ro.system.build.version.incremental=%s\n", incremental);
        fprintf(fp, "ro.system.build.version.release=%s\n", release);
        fprintf(fp, "ro.system.build.version.release_or_codename=%s\n", release);
        fprintf(fp, "ro.system.build.version.sdk=%s\n", sdk);
        fprintf(fp, "ro.build.id=%s\n", build_id);
        fprintf(fp, "ro.build.display.id=%s\n", build_id);
        fprintf(fp, "ro.build.version.incremental=%s\n", incremental);
        fprintf(fp, "ro.build.version.sdk=%s\n", sdk);
        fprintf(fp, "ro.build.version.preview_sdk=0\n");
        fprintf(fp, "ro.build.version.preview_sdk_fingerprint=REL\n");
        fprintf(fp, "ro.build.version.codename=REL\n");
        fprintf(fp, "ro.build.version.all_codenames=REL\n");
        fprintf(fp, "ro.build.version.release=%s\n", release);
        fprintf(fp, "ro.build.version.release_or_codename=%s\n", release);
        fprintf(fp, "ro.build.version.security_patch=%s\n", sec_patch);
        fprintf(fp, "ro.build.version.base_os=\n");
        fprintf(fp, "ro.build.date=Tue Sep 12 00:00:00 UTC 2023\n");
        fprintf(fp, "ro.build.date.utc=1694476800\n");
        fprintf(fp, "ro.build.type=user\n");
        fprintf(fp, "ro.build.user=android-build\n");
        fprintf(fp, "ro.build.host=%s\n", build_host);
        fprintf(fp, "ro.build.tags=release-keys\n");
        fprintf(fp, "ro.build.flavor=%s\n", flavor);
        fprintf(fp, "ro.product.board=%s\n", board);
        fprintf(fp, "ro.board.platform=%s\n", platform);
        fprintf(fp, "ro.hardware=%s\n", hardware);
        fprintf(fp, "ro.build.product=%s\n", product);
        fprintf(fp, "ro.build.description=%s\n", desc);
        fprintf(fp, "ro.product.brand=%s\n", brand);
        fprintf(fp, "ro.product.device=%s\n", device);
        fprintf(fp, "ro.product.manufacturer=%s\n", manuf);
        fprintf(fp, "ro.product.model=%s\n", model);
        fprintf(fp, "ro.product.name=%s\n", product);
        fclose(fp);
        chmod(path, 0644);
    }

    // 2. vendor_build.prop
    snprintf(path, sizeof(path), "%s/vendor_build.prop", FAKEDIR);
    fp = fopen(path, "w");
    if (fp) {
        fprintf(fp, "####################################\n");
        fprintf(fp, "# ProteoMesh Dynamic Vendor Build Properties\n");
        fprintf(fp, "####################################\n");
        fprintf(fp, "ro.product.vendor.brand=%s\n", brand);
        fprintf(fp, "ro.product.vendor.device=%s\n", device);
        fprintf(fp, "ro.product.vendor.manufacturer=%s\n", manuf);
        fprintf(fp, "ro.product.vendor.model=%s\n", model);
        fprintf(fp, "ro.product.vendor.name=%s\n", product);
        fprintf(fp, "ro.vendor.product.cpu.abilist=%s\n", abilist);
        fprintf(fp, "ro.vendor.product.cpu.abilist32=x86,armeabi-v7a,armeabi\n");
        fprintf(fp, "ro.vendor.product.cpu.abilist64=x86_64,arm64-v8a\n");
        fprintf(fp, "ro.vendor.build.date=Tue Sep 12 00:00:00 UTC 2023\n");
        fprintf(fp, "ro.vendor.build.date.utc=1694476800\n");
        fprintf(fp, "ro.vendor.build.fingerprint=%s\n", fp_str);
        fprintf(fp, "ro.vendor.build.id=%s\n", build_id);
        fprintf(fp, "ro.vendor.build.tags=release-keys\n");
        fprintf(fp, "ro.vendor.build.type=user\n");
        fprintf(fp, "ro.vendor.build.version.incremental=%s\n", incremental);
        fprintf(fp, "ro.vendor.build.version.release=%s\n", release);
        fprintf(fp, "ro.vendor.build.version.release_or_codename=%s\n", release);
        fprintf(fp, "ro.vendor.build.version.sdk=%s\n", sdk);
        fprintf(fp, "ro.hardware=%s\n", hardware);
        fprintf(fp, "ro.cold_boot_done=true\n");
        fprintf(fp, "persist.sys.fuse=1\n");
        fprintf(fp, "ro.radio.noril=0\n");
        fprintf(fp, "debug.sf.nobootanimation=1\n");
        fprintf(fp, "ro.vndk.version=33\n");
        fprintf(fp, "ro.bionic.arch=x86_64\n");
        fprintf(fp, "ro.bionic.2nd_arch=x86\n");
        fprintf(fp, "persist.sys.dalvik.vm.lib.2=libart.so\n");
        fprintf(fp, "dalvik.vm.isa.x86_64.variant=x86_64\n");
        fprintf(fp, "dalvik.vm.isa.x86_64.features=default\n");
        fprintf(fp, "dalvik.vm.isa.x86.variant=x86_64\n");
        fprintf(fp, "dalvik.vm.isa.x86.features=default\n");
        fprintf(fp, "ro.product.first_api_level=%s\n", sdk);
        fprintf(fp, "ro.product.board=%s\n", board);
        fprintf(fp, "ro.board.platform=%s\n", platform);
        fprintf(fp, "ro.zygote=zygote64_32\n");
        fprintf(fp, "ro.carrier=%s\n", carrier_prop);
        fclose(fp);
        chmod(path, 0644);
    }

    // 3. product_build.prop
    snprintf(path, sizeof(path), "%s/product_build.prop", FAKEDIR);
    fp = fopen(path, "w");
    if (fp) {
        fprintf(fp, "####################################\n");
        fprintf(fp, "# ProteoMesh Dynamic Product Build Properties\n");
        fprintf(fp, "####################################\n");
        fprintf(fp, "ro.product.product.brand=%s\n", brand);
        fprintf(fp, "ro.product.product.device=%s\n", device);
        fprintf(fp, "ro.product.product.manufacturer=%s\n", manuf);
        fprintf(fp, "ro.product.product.model=%s\n", model);
        fprintf(fp, "ro.product.product.name=%s\n", product);
        fprintf(fp, "ro.product.build.date=Tue Sep 12 00:00:00 UTC 2023\n");
        fprintf(fp, "ro.product.build.date.utc=1694476800\n");
        fprintf(fp, "ro.product.build.fingerprint=%s\n", fp_str);
        fprintf(fp, "ro.product.build.id=%s\n", build_id);
        fprintf(fp, "ro.product.build.tags=release-keys\n");
        fprintf(fp, "ro.product.build.type=user\n");
        fprintf(fp, "ro.product.build.version.incremental=%s\n", incremental);
        fprintf(fp, "ro.product.build.version.release=%s\n", release);
        fprintf(fp, "ro.product.build.version.release_or_codename=%s\n", release);
        fprintf(fp, "ro.product.build.version.sdk=%s\n", sdk);
        fprintf(fp, "ro.product.vndk.version=33\n");
        fprintf(fp, "ro.build.characteristics=default\n");
        fclose(fp);
        chmod(path, 0644);
    }

    // 4. system_ext_build.prop
    snprintf(path, sizeof(path), "%s/system_ext_build.prop", FAKEDIR);
    fp = fopen(path, "w");
    if (fp) {
        fprintf(fp, "####################################\n");
        fprintf(fp, "# ProteoMesh Dynamic System_Ext Build Properties\n");
        fprintf(fp, "####################################\n");
        fprintf(fp, "ro.product.system_ext.brand=%s\n", brand);
        fprintf(fp, "ro.product.system_ext.device=%s\n", device);
        fprintf(fp, "ro.product.system_ext.manufacturer=%s\n", manuf);
        fprintf(fp, "ro.product.system_ext.model=%s\n", model);
        fprintf(fp, "ro.product.system_ext.name=%s\n", product);
        fprintf(fp, "ro.system_ext.build.date=Tue Sep 12 00:00:00 UTC 2023\n");
        fprintf(fp, "ro.system_ext.build.date.utc=1694476800\n");
        fprintf(fp, "ro.system_ext.build.fingerprint=%s\n", fp_str);
        fprintf(fp, "ro.system_ext.build.id=%s\n", build_id);
        fprintf(fp, "ro.system_ext.build.tags=release-keys\n");
        fprintf(fp, "ro.system_ext.build.type=user\n");
        fprintf(fp, "ro.system_ext.build.version.incremental=%s\n", incremental);
        fprintf(fp, "ro.system_ext.build.version.release=%s\n", release);
        fprintf(fp, "ro.system_ext.build.version.release_or_codename=%s\n", release);
        fprintf(fp, "ro.system_ext.build.version.sdk=%s\n", sdk);
        fprintf(fp, "ro.cp_system_other_odex=0\n");
        fprintf(fp, "ro.adb.secure=1\n");
        fclose(fp);
        chmod(path, 0644);
    }
}

static void apply_props(cJSON *json) {
    cJSON *dev = cJSON_GetObjectItem(json, "device");
    cJSON *cpu = cJSON_GetObjectItem(json, "cpu");
    cJSON *gpu = cJSON_GetObjectItem(json, "gpu");
    cJSON *kernel = cJSON_GetObjectItem(json, "kernel");
    cJSON *tel = cJSON_GetObjectItem(json, "telephony");

    const char *brand = json_get_str(dev, "brand", "google");
    const char *manuf = json_get_str(dev, "manufacturer", "Google");
    const char *model = json_get_str(dev, "model", "Pixel 5");
    const char *device = json_get_str(dev, "device", "redfin");
    const char *product = json_get_str(dev, "product", "redfin");
    const char *board = json_get_str(dev, "board", "redfin");
    const char *hardware = json_get_str(dev, "hardware", "qcom");
    const char *platform = json_get_str(dev, "platform", "sm7250");
    const char *build_id = json_get_str(dev, "build_id", "TQ3A.230901.001.C2");
    const char *incremental = json_get_str(dev, "incremental", "10750268");
    const char *sec_patch = json_get_str(dev, "security_patch", "2023-11-01");
    const char *release = json_get_str(dev, "release", "13");
    const char *sdk = json_get_str(dev, "sdk", "33");
    const char *fp = json_get_str(dev, "fingerprint", "google/redfin/redfin:13/TQ3A.230901.001.C2/10750268:user/release-keys");
    const char *desc = json_get_str(dev, "description", "redfin-user 13 TQ3A.230901.001.C2 10750268 release-keys");
    const char *flavor = json_get_str(dev, "flavor", "redfin-user");
    const char *type = json_get_str(dev, "type", "user");
    const char *tags = json_get_str(dev, "tags", "release-keys");
    const char *bootloader = json_get_str(dev, "bootloader", "b1c1-0.5-9876543");
    const char *sku = json_get_str(dev, "sku", "GTT9Q");
    const char *color = json_get_str(dev, "color", "just_black");

    const char *def_bb = (strstr(platform, "exynos") != NULL) ? "s5100" : "msm";
    const char *baseband = json_get_str(dev, "baseband", def_bb);
    const char *baseband_ver = json_get_str(dev, "baseband_version", bootloader);
    const char *build_host = json_get_str(dev, "build_host", strcmp(brand, "samsung") == 0 ? "se-corp.samsung.com" : "google.com");

    const char *parts[] = {"", "system.", "vendor.", "product.", "system_ext.", "odm.", "vendor_dlkm."};
    int num_parts = sizeof(parts) / sizeof(parts[0]);

    for (int i = 0; i < num_parts; i++) {
        char k[128];
        snprintf(k, sizeof(k), "ro.product.%sbrand", parts[i]); set_prop(k, brand);
        snprintf(k, sizeof(k), "ro.product.%smanufacturer", parts[i]); set_prop(k, manuf);
        snprintf(k, sizeof(k), "ro.product.%smodel", parts[i]); set_prop(k, model);
        snprintf(k, sizeof(k), "ro.product.%sname", parts[i]); set_prop(k, product);
        snprintf(k, sizeof(k), "ro.product.%sdevice", parts[i]); set_prop(k, device);
        snprintf(k, sizeof(k), "ro.product.%smarketname", parts[i]); set_prop(k, model);

        if (strlen(parts[i]) > 0) {
            snprintf(k, sizeof(k), "ro.%sbuild.id", parts[i]); set_prop(k, build_id);
            snprintf(k, sizeof(k), "ro.%sbuild.display.id", parts[i]); set_prop(k, build_id);
            snprintf(k, sizeof(k), "ro.%sbuild.fingerprint", parts[i]); set_prop(k, fp);
            snprintf(k, sizeof(k), "ro.%sbuild.type", parts[i]); set_prop(k, type);
            snprintf(k, sizeof(k), "ro.%sbuild.tags", parts[i]); set_prop(k, tags);
            snprintf(k, sizeof(k), "ro.%sbuild.version.release", parts[i]); set_prop(k, release);
            snprintf(k, sizeof(k), "ro.%sbuild.version.release_or_codename", parts[i]); set_prop(k, release);
            snprintf(k, sizeof(k), "ro.%sbuild.version.sdk", parts[i]); set_prop(k, sdk);
            snprintf(k, sizeof(k), "ro.%sbuild.version.security_patch", parts[i]); set_prop(k, sec_patch);
            snprintf(k, sizeof(k), "ro.%sbuild.version.incremental", parts[i]); set_prop(k, incremental);
        }
    }

    set_prop("ro.build.id", build_id);
    set_prop("ro.build.display.id", build_id);
    set_prop("ro.build.fingerprint", fp);
    set_prop("ro.build.description", desc);
    set_prop("ro.build.flavor", flavor);
    set_prop("ro.build.type", type);
    set_prop("ro.build.tags", tags);
    set_prop("ro.build.product", product);
    set_prop("ro.build.version.release", release);
    set_prop("ro.build.version.release_or_codename", release);
    set_prop("ro.build.version.sdk", sdk);
    set_prop("ro.build.version.security_patch", sec_patch);
    set_prop("ro.build.version.incremental", incremental);
    set_prop("ro.build.host", build_host);

    set_prop("ro.product.board", board);
    set_prop("ro.board.platform", platform);
    set_prop("ro.hardware", hardware);
    set_prop("ro.boot.hardware", hardware);
    set_prop("ro.boot.hardware.sku", sku);
    set_prop("ro.boot.hardware.color", color);
    set_prop("ro.bootloader", bootloader);
    set_prop("ro.boot.bootloader", bootloader);
    set_prop("ro.boot.flash.locked", "1");
    set_prop("ro.boot.verifiedbootstate", "green");
    set_prop("ro.boot.veritymode", "enforcing");
    set_prop("ro.boot.vbmeta.device_state", "locked");
    set_prop("ro.bootmode", "normal");
    set_prop("ro.boot.mode", "normal");
    set_prop("ro.debuggable", "0");
    set_prop("ro.secure", "1");
    set_prop("ro.adb.secure", "1");

    // Modem / Baseband
    set_prop("ro.baseband", baseband);
    set_prop("ro.boot.baseband", baseband);
    set_prop("gsm.version.baseband", baseband_ver);

    // SoC properties
    const char *soc_manuf = json_get_str(cpu, "soc_manufacturer", "Qualcomm");
    const char *soc_model = json_get_str(cpu, "soc_model", "SM7250");
    set_prop("ro.soc.manufacturer", soc_manuf);
    set_prop("ro.soc.model", soc_model);
    set_prop("ro.hardware.chipname", platform);
    set_prop("ro.boot.hardware.platform", platform);

    // Telephony
    const char *carrier = json_get_str(tel, "carrier_name", "Personal");
    const char *carrier_prop = strcmp(brand, "samsung") == 0 ? "unknown" : carrier;
    set_prop("ro.carrier", carrier_prop);
    set_prop("ro.telephony.sim.count", "1");
    set_prop("ro.telephony.default_network", "22");
    set_prop("ro.com.android.mobiledata", "true");

    // GPU properties
    if (gpu) {
        const char *gpu_rend = json_get_str(gpu, "renderer", "Adreno (TM) 620");
        const char *gpu_vend = json_get_str(gpu, "vendor", "Qualcomm");
        const char *gpu_vers = json_get_str(gpu, "version", "OpenGL ES 3.2");
        set_prop("persist.sys.fake.gpu_renderer", gpu_rend);
        set_prop("persist.sys.fake.gpu_vendor", gpu_vend);
        set_prop("persist.sys.fake.gpu_version", gpu_vers);
    }

    // Apply subsystems
    apply_cpuinfo(cpu);
    apply_cpu_sysfs(cpu);
    apply_cmdline_and_version(dev, kernel);
    apply_gpuinfo(gpu);
    apply_sensors_dump(json);
    apply_camera_dump(json);
    apply_build_props(json);
    ensure_identity(json);
}

static void show_status(cJSON *json) {
    cJSON *tmpl = cJSON_GetObjectItem(json, "template");
    cJSON *dev = cJSON_GetObjectItem(json, "device");
    cJSON *cpu = cJSON_GetObjectItem(json, "cpu");
    cJSON *disp = cJSON_GetObjectItem(json, "display");
    cJSON *tel = cJSON_GetObjectItem(json, "telephony");
    cJSON *gpu = cJSON_GetObjectItem(json, "gpu");

    char imei[64], meid[64], serial[64], aid[64], wmac[64], bmac[64], imsi[64], iccid[64], phone[64];
    get_prop("persist.sys.fake.imei", imei, sizeof(imei));
    get_prop("persist.sys.fake.meid", meid, sizeof(meid));
    get_prop("persist.sys.fake.serial", serial, sizeof(serial));
    get_prop("persist.sys.fake.android_id", aid, sizeof(aid));
    get_prop("persist.sys.fake.wifi_mac", wmac, sizeof(wmac));
    get_prop("persist.sys.fake.bt_mac", bmac, sizeof(bmac));
    get_prop("persist.sys.fake.imsi", imsi, sizeof(imsi));
    get_prop("persist.sys.fake.iccid", iccid, sizeof(iccid));
    get_prop("persist.sys.fake.phone", phone, sizeof(phone));

    printf("======================================================================\n");
    printf("                PROTEOMESH HARDWARE PROFILE & IDENTITY                \n");
    printf("======================================================================\n");
    printf("  [PLANTILLA DE DISPOSITIVO]\n");
    printf("  Dispositivo         : %s (%s)\n", json_get_str(tmpl, "name", "Pixel 5"), json_get_str(dev, "model", "Pixel 5"));
    printf("  Fabricante / Marca  : %s / %s\n", json_get_str(dev, "manufacturer", "Google"), json_get_str(dev, "brand", "google"));
    printf("  Board / Plataforma  : %s / %s\n", json_get_str(dev, "board", "redfin"), json_get_str(dev, "platform", "sm7250"));
    printf("  Baseband / Modem    : %s (v: %s)\n", json_get_str(dev, "baseband", "msm"), json_get_str(dev, "baseband_version", ""));
    printf("  Bootloader          : %s\n", json_get_str(dev, "bootloader", ""));
    printf("  Build Fingerprint   : %s\n", json_get_str(dev, "fingerprint", ""));
    printf("  Patch de Seguridad  : %s (Android %s, API %s)\n", json_get_str(dev, "security_patch", ""), json_get_str(dev, "release", "13"), json_get_str(dev, "sdk", "33"));
    printf("\n  [HARDWARE & SOC]\n");
    printf("  Procesador SoC      : %s %s\n", json_get_str(cpu, "soc_manufacturer", ""), json_get_str(cpu, "soc_model", ""));
    printf("  GPU / Acelerador    : %s (%s)\n", json_get_str(gpu, "renderer", "Adreno (TM) 620"), json_get_str(gpu, "vendor", "Qualcomm"));
    printf("  Resolución Pantalla : %dx%d @ %d fps (DPI: %d)\n", json_get_int(disp, "width", 1080), json_get_int(disp, "height", 2340), json_get_int(disp, "fps", 90), json_get_int(disp, "dpi", 440));
    printf("  Operadora Móvil     : %s (MCC/MNC: %s, País: %s)\n", json_get_str(tel, "carrier_name", ""), json_get_str(tel, "operator_numeric", ""), json_get_str(tel, "country_iso", ""));
    printf("\n  [IDENTIDAD DINÁMICA DE HARDWARE]\n");
    printf("  IMEI (Luhn Válido)  : %s\n", imei);
    printf("  MEID                : %s\n", meid);
    printf("  Número de Serie     : %s\n", serial);
    printf("  Android ID (SSAID)  : %s\n", aid);
    printf("  Wi-Fi MAC (OUI OEM) : %s\n", wmac);
    printf("  Bluetooth MAC       : %s\n", bmac);
    printf("  SIM IMSI            : %s\n", imsi);
    printf("  SIM ICCID           : %s\n", iccid);
    printf("  Línea Telefónica    : %s\n", phone);
    printf("======================================================================\n");
}

int main(int argc, char **argv) {
    if (argc < 2) {
        printf("Uso: profile-loader {apply|random|status|set <k> <v>} [ruta_a_perfil.json]\n");
        return 1;
    }

    const char *cmd = argv[1];
    const char *prof_path = (argc >= 3 && strcmp(cmd, "set") != 0) ? argv[2] : DEFAULT_PROFILE_PATH;

    if (strcmp(cmd, "apply") == 0) {
        cJSON *json = load_profile(prof_path);
        if (!json) return 1;
        apply_props(json);
        cJSON_Delete(json);
        return 0;
    } else if (strcmp(cmd, "random") == 0 || strcmp(cmd, "generate") == 0) {
        cJSON *json = load_profile(prof_path);
        if (!json) return 1;
        generate_identity(json);
        printf("[✓] Nueva identidad dinámica generada con éxito.\n");
        show_status(json);
        cJSON_Delete(json);
        return 0;
    } else if (strcmp(cmd, "status") == 0 || strcmp(cmd, "show") == 0) {
        cJSON *json = load_profile(prof_path);
        if (!json) return 1;
        show_status(json);
        cJSON_Delete(json);
        return 0;
    } else if (strcmp(cmd, "set") == 0) {
        if (argc < 4) {
            fprintf(stderr, "Uso: profile-loader set <imei|serial|android_id|wifi_mac|bt_mac|imsi|iccid|phone> <valor>\n");
            return 1;
        }
        char prop_key[128];
        snprintf(prop_key, sizeof(prop_key), "persist.sys.fake.%s", argv[2]);
        set_prop(prop_key, argv[3]);
        if (strcmp(argv[2], "android_id") == 0) {
            char aid_cmd[256];
            snprintf(aid_cmd, sizeof(aid_cmd), "settings put secure android_id %s 2>/dev/null", argv[3]);
            system(aid_cmd);
        }
        printf("[✓] %s actualizado a: %s\n", argv[2], argv[3]);
        return 0;
    } else {
        printf("Uso: profile-loader {apply|random|status|set <k> <v>} [ruta_a_perfil.json]\n");
        return 1;
    }
}
