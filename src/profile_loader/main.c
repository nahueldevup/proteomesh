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

static void apply_cmdline_and_version(cJSON *dev) {
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

    snprintf(path, sizeof(path), "%s/version", FAKEDIR);
    fp = fopen(path, "w");
    if (fp) {
        fprintf(fp, "Linux version 4.19.282-g9e27c0faec01-ab10532298 (android-build@google.com) (Android (8490178, based on r450784d) clang version 14.0.6) #1 SMP PREEMPT Wed Oct 18 10:14:02 UTC 2023\n");
        fclose(fp);
        chmod(path, 0644);
    }
}

static void apply_props(cJSON *json) {
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
    const char *fp = json_get_str(dev, "fingerprint", "google/redfin/redfin:13/TQ3A.230901.001.C2/10750268:user/release-keys");
    const char *desc = json_get_str(dev, "description", "redfin-user 13 TQ3A.230901.001.C2 10750268 release-keys");
    const char *flavor = json_get_str(dev, "flavor", "redfin-user");
    const char *type = json_get_str(dev, "type", "user");
    const char *tags = json_get_str(dev, "tags", "release-keys");
    const char *bootloader = json_get_str(dev, "bootloader", "b1c1-0.5-9876543");
    const char *sku = json_get_str(dev, "sku", "GTT9Q");
    const char *color = json_get_str(dev, "color", "just_black");

    const char *parts[] = {"", "system.", "vendor.", "product.", "system_ext.", "odm.", "vendor_dlkm.", NULL};
    for (int i = 0; parts[i] != NULL; i++) {
        char k[128];
        snprintf(k, sizeof(k), "ro.product.%sbrand", parts[i]); set_prop(k, brand);
        snprintf(k, sizeof(k), "ro.product.%smanufacturer", parts[i]); set_prop(k, manuf);
        snprintf(k, sizeof(k), "ro.product.%smodel", parts[i]); set_prop(k, model);
        snprintf(k, sizeof(k), "ro.product.%sdevice", parts[i]); set_prop(k, device);
        snprintf(k, sizeof(k), "ro.product.%sname", parts[i]); set_prop(k, product);
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

    // SoC properties
    const char *soc_manuf = json_get_str(cpu, "soc_manufacturer", "Qualcomm");
    const char *soc_model = json_get_str(cpu, "soc_model", "SM7250");
    set_prop("ro.soc.manufacturer", soc_manuf);
    set_prop("ro.soc.model", soc_model);

    // Telephony
    const char *carrier = json_get_str(tel, "carrier_name", "google");
    set_prop("ro.carrier", carrier);
    set_prop("ro.telephony.sim.count", "1");
    set_prop("ro.telephony.default_network", "22");
    set_prop("ro.com.android.mobiledata", "true");

    // Apply CPU info
    apply_cpuinfo(cpu);
    apply_cmdline_and_version(dev);
    ensure_identity(json);
}

static void show_status(cJSON *json) {
    cJSON *tmpl = cJSON_GetObjectItem(json, "template");
    cJSON *dev = cJSON_GetObjectItem(json, "device");
    cJSON *cpu = cJSON_GetObjectItem(json, "cpu");
    cJSON *disp = cJSON_GetObjectItem(json, "display");
    cJSON *tel = cJSON_GetObjectItem(json, "telephony");

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
    printf("  Nombre Clave / Board: %s / %s\n", json_get_str(dev, "device", "redfin"), json_get_str(dev, "board", "redfin"));
    printf("  SoC / Procesador    : %s (%s - %s)\n", json_get_str(cpu, "chipname", "SM7250"), json_get_str(cpu, "soc_manufacturer", "QCOM"), json_get_str(cpu, "soc_model", "SM7250"));
    printf("  Pantalla            : %dx%d @ %d dpi, %d fps\n", json_get_int(disp, "width", 1080), json_get_int(disp, "height", 2340), json_get_int(disp, "dpi", 440), json_get_int(disp, "fps", 90));
    printf("  Huella de Sistema   : %s\n", json_get_str(dev, "fingerprint", ""));
    printf("----------------------------------------------------------------------\n");
    printf("  [IDENTIDAD DINÁMICA DE LA INSTANCIA]\n");
    printf("  IMEI (Luhn valid)   : %s\n", strlen(imei) ? imei : "No asignado");
    printf("  MEID                : %s\n", strlen(meid) ? meid : "No asignado");
    printf("  Número de Serie     : %s\n", strlen(serial) ? serial : "No asignado");
    printf("  Android ID          : %s\n", strlen(aid) ? aid : "No asignado");
    printf("  MAC Wi-Fi (wlan0)   : %s\n", strlen(wmac) ? wmac : "No asignado");
    printf("  MAC Bluetooth       : %s\n", strlen(bmac) ? bmac : "No asignado");
    printf("  IMSI / ICCID (SIM)  : %s / %s\n", strlen(imsi) ? imsi : "-", strlen(iccid) ? iccid : "-");
    printf("  Línea Móvil         : %s (%s)\n", strlen(phone) ? phone : "-", json_get_str(tel, "carrier_name", "Personal"));
    printf("======================================================================\n");
}

int main(int argc, char **argv) {
    const char *cmd = (argc > 1) ? argv[1] : "status";
    const char *prof_path = (argc > 2 && argv[2][0] == '/') ? argv[2] : DEFAULT_PROFILE_PATH;

    if (strcmp(cmd, "apply") == 0) {
        cJSON *json = load_profile(prof_path);
        if (!json) return 1;
        apply_props(json);
        printf("[✓] Perfil de hardware y propiedades aplicadas correctamente: %s\n", prof_path);
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
