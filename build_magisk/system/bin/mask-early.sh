#!/bin/sh
# ==============================================================================
# mask-early.sh — Enmascaramiento temprano de hardware en post-fs-data
# Configurado para: Google Pixel 5 (redfin / Qualcomm Snapdragon 765G SM7250)
# ==============================================================================
FAKEDIR="/data/local/tmp/fake_proc"
mkdir -p "$FAKEDIR"
chmod 755 "$FAKEDIR" 2>/dev/null || true

# Prevenir deshabilitación silenciosa de Magisk/LSPosed
rm -f /data/adb/modules/*/disable /data/adb/modules/*/remove /data/adb/modules/*/*.disable 2>/dev/null || true
rm -f /dev/.props_applied 2>/dev/null || true
chmod 666 /dev/fb* /dev/dri/* 2>/dev/null || true

# Infraestructura de contenedor y Zygisk (siempre requeridos)
RP="/system/bin/resetprop"
if [ -x "$RP" ]; then
    $RP -n ro.dalvik.vm.native.bridge "libzygisk.solibnb.so"
    $RP -n ro.enable.native.bridge.exec "1"
    $RP -n ro.hardware.hwcomposer "redroid"
    $RP -n ro.hardware.gralloc "redroid"
fi

# Aplicar plantilla de hardware activa desde el perfil
if [ -x "/system/bin/profile-loader" ]; then
    /system/bin/profile-loader apply /system/etc/proteomesh_profile.json
else
# Identidad temprana Google Pixel 5 para Zygote (Fallback)
if [ -x "$RP" ]; then
    $RP -n ro.product.model "Pixel 5"
    $RP -n ro.product.brand "google"
    $RP -n ro.product.manufacturer "Google"
    $RP -n ro.product.device "redfin"
    $RP -n ro.product.board "redfin"
    $RP -n ro.product.name "redfin"
    $RP -n ro.soc.manufacturer "Qualcomm"
    $RP -n ro.soc.model "SM7250"
    $RP -n ro.hardware "qcom"
    $RP -n ro.boot.hardware "qcom"
    $RP -n ro.boot.hardware.sku "GTT9Q"
    $RP -n ro.boot.hardware.color "just_black"
    $RP -n ro.bootloader "b1c1-0.5-9876543"
    $RP -n ro.boot.bootloader "b1c1-0.5-9876543"
    $RP -n ro.boot.flash.locked "1"
    $RP -n ro.boot.verifiedbootstate "green"
    $RP -n ro.boot.veritymode "enforcing"
    $RP -n ro.build.id "TQ3A.230901.001.C2"
    $RP -n ro.build.display.id "TQ3A.230901.001.C2"
    $RP -n ro.build.fingerprint "google/redfin/redfin:13/TQ3A.230901.001.C2/10750268:user/release-keys"
    $RP -n ro.build.description "redfin-user 13 TQ3A.230901.001.C2 10750268 release-keys"
    $RP -n ro.build.flavor "redfin-user"
    $RP -n ro.build.type "user"
    $RP -n ro.build.tags "release-keys"
    $RP -n ro.telephony.sim.count "1"
    $RP -n ro.telephony.default_network "22"
    $RP -n ro.carrier "google"
    $RP -n ro.com.android.mobiledata "true"
    for part in system vendor product system_ext odm vendor_dlkm; do
        $RP -n "ro.product.${part}.brand" "google"
        $RP -n "ro.product.${part}.manufacturer" "Google"
        $RP -n "ro.product.${part}.model" "Pixel 5"
        $RP -n "ro.product.${part}.name" "redfin"
        $RP -n "ro.product.${part}.device" "redfin"
        $RP -n "ro.${part}.build.id" "TQ3A.230901.001.C2"
        $RP -n "ro.${part}.build.display.id" "TQ3A.230901.001.C2"
        $RP -n "ro.${part}.build.fingerprint" "google/redfin/redfin:13/TQ3A.230901.001.C2/10750268:user/release-keys"
        $RP -n "ro.${part}.build.type" "user"
        $RP -n "ro.${part}.build.tags" "release-keys"
    done
fi
fi

# Aislar la propagación de montajes para evitar loops de multiplicación
mount --make-rslave /sys 2>/dev/null || true
mount --make-rslave /proc 2>/dev/null || true

# Helper para bind-mounts estrictamente idempotentes
bind_mount() {
    src="$1"
    dst="$2"
    if [ -e "$src" ] && [ -e "$dst" ]; then
        real_dst=$(readlink -f "$dst" 2>/dev/null || echo "$dst")
        if ! grep -q " $real_dst " /proc/mounts 2>/dev/null && ! grep -q " $dst " /proc/mounts 2>/dev/null; then
            mount --bind "$src" "$dst" 2>/dev/null || true
        fi
    fi
}

mount_tmpfs() {
    dst="$1"
    if [ -d "$dst" ]; then
        real_dst=$(readlink -f "$dst" 2>/dev/null || echo "$dst")
        if ! grep -q " $real_dst " /proc/mounts 2>/dev/null && ! grep -q " $dst " /proc/mounts 2>/dev/null; then
            mount -t tmpfs -o mode=755,nodev,noexec,nosuid tmpfs "$dst" 2>/dev/null || true
        fi
    fi
}

# 1. /proc/cpuinfo (Qualcomm Snapdragon 765G: 6x Cortex-A55 + 2x Cortex-A76)
cat << 'EOF' > "$FAKEDIR/cpuinfo"
processor	: 0
BogoMIPS	: 38.40
Features	: fp asimd evtstrm aes pmull sha1 sha2 crc32 atomics fphp asimdhp cpuid asimdrdm lrcpc dcpop asimddp
CPU implementer	: 0x41
CPU architecture: 8
CPU variant	: 0x1
CPU part	: 0xd05
CPU revision	: 0

processor	: 1
BogoMIPS	: 38.40
Features	: fp asimd evtstrm aes pmull sha1 sha2 crc32 atomics fphp asimdhp cpuid asimdrdm lrcpc dcpop asimddp
CPU implementer	: 0x41
CPU architecture: 8
CPU variant	: 0x1
CPU part	: 0xd05
CPU revision	: 0

processor	: 2
BogoMIPS	: 38.40
Features	: fp asimd evtstrm aes pmull sha1 sha2 crc32 atomics fphp asimdhp cpuid asimdrdm lrcpc dcpop asimddp
CPU implementer	: 0x41
CPU architecture: 8
CPU variant	: 0x1
CPU part	: 0xd05
CPU revision	: 0

processor	: 3
BogoMIPS	: 38.40
Features	: fp asimd evtstrm aes pmull sha1 sha2 crc32 atomics fphp asimdhp cpuid asimdrdm lrcpc dcpop asimddp
CPU implementer	: 0x41
CPU architecture: 8
CPU variant	: 0x1
CPU part	: 0xd05
CPU revision	: 0

processor	: 4
BogoMIPS	: 38.40
Features	: fp asimd evtstrm aes pmull sha1 sha2 crc32 atomics fphp asimdhp cpuid asimdrdm lrcpc dcpop asimddp
CPU implementer	: 0x41
CPU architecture: 8
CPU variant	: 0x1
CPU part	: 0xd05
CPU revision	: 0

processor	: 5
BogoMIPS	: 38.40
Features	: fp asimd evtstrm aes pmull sha1 sha2 crc32 atomics fphp asimdhp cpuid asimdrdm lrcpc dcpop asimddp
CPU implementer	: 0x41
CPU architecture: 8
CPU variant	: 0x1
CPU part	: 0xd05
CPU revision	: 0

processor	: 6
BogoMIPS	: 38.40
Features	: fp asimd evtstrm aes pmull sha1 sha2 crc32 atomics fphp asimdhp cpuid asimdrdm lrcpc dcpop asimddp
CPU implementer	: 0x41
CPU architecture: 8
CPU variant	: 0x4
CPU part	: 0xd0b
CPU revision	: 0

processor	: 7
BogoMIPS	: 38.40
Features	: fp asimd evtstrm aes pmull sha1 sha2 crc32 atomics fphp asimdhp cpuid asimdrdm lrcpc dcpop asimddp
CPU implementer	: 0x41
CPU architecture: 8
CPU variant	: 0x4
CPU part	: 0xd0b
CPU revision	: 0

Hardware	: Qualcomm Technologies, Inc SM7250
Revision	: 0000
Serial		: 0000000000000000
EOF

# 2. /proc/cmdline oficial
echo "console=null androidboot.hardware=qcom androidboot.verifiedbootstate=green androidboot.flash.locked=1 androidboot.veritymode=enforcing androidboot.bootdevice=1d84000.ufshc buildvariant=user" > "$FAKEDIR/cmdline"

# 3. /proc/version oficial Pixel 5 Android 13
echo "Linux version 4.19.282-g9e27c0faec01-ab10532298 (android-build@google.com) (Android (8490178, based on r450784d) clang version 14.0.6) #1 SMP PREEMPT Wed Oct 18 10:14:02 UTC 2023" > "$FAKEDIR/version"

# 3b. SELinux enforce mock file
echo "1" > "$FAKEDIR/selinux_enforce"
chmod 644 "$FAKEDIR/selinux_enforce"


# 4. /proc/meminfo oficial Pixel 5 (8 GB LPDDR4X)
cat << 'EOF' > "$FAKEDIR/meminfo"
MemTotal:        7854200 kB
MemFree:         2170340 kB
MemAvailable:    4850120 kB
Buffers:          112450 kB
Cached:          2540120 kB
SwapCached:            0 kB
Active:          3120450 kB
Inactive:        1850230 kB
Active(anon):    1520100 kB
Inactive(anon):   320140 kB
Active(file):    1600350 kB
Inactive(file):  1530090 kB
Unevictable:        8192 kB
Mlocked:            8192 kB
SwapTotal:       2097148 kB
SwapFree:        2097148 kB
Dirty:                64 kB
Writeback:             0 kB
AnonPages:       1840240 kB
Mapped:           520130 kB
Shmem:             24500 kB
KReclaimable:     180200 kB
Slab:             280140 kB
SReclaimable:     180200 kB
SUnreclaim:        99940 kB
KernelStack:       45000 kB
PageTables:        62000 kB
NFS_Unstable:          0 kB
Bounce:                0 kB
WritebackTmp:          0 kB
CommitLimit:     6024248 kB
Committed_AS:   35210450 kB
VmallocTotal:   263061440 kB
VmallocUsed:       75400 kB
VmallocChunk:          0 kB
Percpu:             4500 kB
AnonHugePages:         0 kB
ShmemHugePages:        0 kB
ShmemPmdMapped:        0 kB
FileHugePages:         0 kB
FilePmdMapped:         0 kB
CmaTotal:         819200 kB
CmaFree:          210400 kB
EOF

chmod 644 "$FAKEDIR"/* 2>/dev/null || true

# Crear symlink magisk64 necesario para que zygiskd64 se lance
if [ -x /sbin/magisk ] && [ ! -e /sbin/magisk64 ]; then
    ln -sf /sbin/magisk /sbin/magisk64
fi

# Aplicar bind mounts de procfs
bind_mount "$FAKEDIR/cpuinfo" /proc/cpuinfo
bind_mount "$FAKEDIR/version" /proc/version
bind_mount "$FAKEDIR/meminfo" /proc/meminfo

# Directorio para sockets VR/PDX de SurfaceFlinger
mkdir -p /dev/socket/pdx/system/vr/display 2>/dev/null || true
chmod -R 775 /dev/socket/pdx 2>/dev/null || true
chown -R 1000:1003 /dev/socket/pdx 2>/dev/null || true

# Ocultar huellas de PC / emulador en sysfs
mount_tmpfs /sys/devices/virtual/dmi
mount_tmpfs /sys/class/dmi
mount_tmpfs /sys/module/goldfish_battery
mount_tmpfs /sys/devices/virtual/misc/hw_random

# 4. Topología completa de CPU octa-core Snapdragon 765G en sysfs
# Elimina los 16 núcleos del Ryzen host, amd_pstate, smt y expone exactamente 8 núcleos con frecuencias oficiales
TMP_CPU="/data/local/tmp/fake_sys_cpu"
if [ ! -d "$TMP_CPU" ]; then
    mkdir -p "$TMP_CPU"
    echo "0-7" > "$TMP_CPU/online"
    echo "0-7" > "$TMP_CPU/present"
    echo "0-7" > "$TMP_CPU/possible"
    echo "7" > "$TMP_CPU/kernel_max"
    echo "" > "$TMP_CPU/offline"
    echo "" > "$TMP_CPU/isolated"

    # Cores 0-5: Cortex-A55 @ 1.80 GHz
    for i in 0 1 2 3 4 5; do
        mkdir -p "$TMP_CPU/cpu$i/cpufreq"
        echo "1804800" > "$TMP_CPU/cpu$i/cpufreq/cpuinfo_max_freq"
        echo "576000" > "$TMP_CPU/cpu$i/cpufreq/cpuinfo_min_freq"
        echo "1804800" > "$TMP_CPU/cpu$i/cpufreq/scaling_cur_freq"
        echo "1804800" > "$TMP_CPU/cpu$i/cpufreq/scaling_max_freq"
        echo "576000" > "$TMP_CPU/cpu$i/cpufreq/scaling_min_freq"
        echo "schedutil" > "$TMP_CPU/cpu$i/cpufreq/scaling_governor"
        echo "schedutil performance powersave" > "$TMP_CPU/cpu$i/cpufreq/scaling_available_governors"
        echo "qcom-cpufreq" > "$TMP_CPU/cpu$i/cpufreq/scaling_driver"
    done

    # Core 6: Cortex-A76 Gold @ 2.20 GHz
    mkdir -p "$TMP_CPU/cpu6/cpufreq"
    echo "2208000" > "$TMP_CPU/cpu6/cpufreq/cpuinfo_max_freq"
    echo "844800" > "$TMP_CPU/cpu6/cpufreq/cpuinfo_min_freq"
    echo "2208000" > "$TMP_CPU/cpu6/cpufreq/scaling_cur_freq"
    echo "2208000" > "$TMP_CPU/cpu6/cpufreq/scaling_max_freq"
    echo "844800" > "$TMP_CPU/cpu6/cpufreq/scaling_min_freq"
    echo "schedutil" > "$TMP_CPU/cpu6/cpufreq/scaling_governor"
    echo "schedutil performance powersave" > "$TMP_CPU/cpu6/cpufreq/scaling_available_governors"
    echo "qcom-cpufreq" > "$TMP_CPU/cpu6/cpufreq/scaling_driver"

    # Core 7: Cortex-A76 Prime @ 2.40 GHz
    mkdir -p "$TMP_CPU/cpu7/cpufreq"
    echo "2400000" > "$TMP_CPU/cpu7/cpufreq/cpuinfo_max_freq"
    echo "844800" > "$TMP_CPU/cpu7/cpufreq/cpuinfo_min_freq"
    echo "2400000" > "$TMP_CPU/cpu7/cpufreq/scaling_cur_freq"
    echo "2400000" > "$TMP_CPU/cpu7/cpufreq/scaling_max_freq"
    echo "844800" > "$TMP_CPU/cpu7/cpufreq/scaling_min_freq"
    echo "schedutil" > "$TMP_CPU/cpu7/cpufreq/scaling_governor"
    echo "schedutil performance powersave" > "$TMP_CPU/cpu7/cpufreq/scaling_available_governors"
    echo "qcom-cpufreq" > "$TMP_CPU/cpu7/cpufreq/scaling_driver"

    chmod -R 755 "$TMP_CPU"
    find "$TMP_CPU" -type f -exec chmod 644 {} + 2>/dev/null || true
fi

bind_mount "$TMP_CPU" /sys/devices/system/cpu

# 5. Simulación de batería y cargador en sysfs (para health HAL)
if ! grep -q " /sys/class/power_supply " /proc/mounts 2>/dev/null; then
    mount -t tmpfs tmpfs /sys/class/power_supply 2>/dev/null || true
    mkdir -p /sys/class/power_supply/battery /sys/class/power_supply/ac
    echo 'Battery' > /sys/class/power_supply/battery/type
    echo 'Charging' > /sys/class/power_supply/battery/status
    echo 'Good' > /sys/class/power_supply/battery/health
    echo '1' > /sys/class/power_supply/battery/present
    echo '85' > /sys/class/power_supply/battery/capacity
    echo '4200000' > /sys/class/power_supply/battery/voltage_now
    echo '290' > /sys/class/power_supply/battery/temp
    echo 'Li-ion' > /sys/class/power_supply/battery/technology

    echo 'Mains' > /sys/class/power_supply/ac/type
    echo '1' > /sys/class/power_supply/ac/online
    chmod 755 /sys/class/power_supply /sys/class/power_supply/battery /sys/class/power_supply/ac 2>/dev/null || true
    chmod 644 /sys/class/power_supply/battery/* /sys/class/power_supply/ac/* 2>/dev/null || true

    # Micro-dinámica química de batería en segundo plano
    (
        while true; do
            sleep 45
            V=$((4195000 + (RANDOM % 15000) - 7500))
            T=$((290 + (RANDOM % 5) - 2))
            echo "$V" > /sys/class/power_supply/battery/voltage_now 2>/dev/null
            echo "$T" > /sys/class/power_supply/battery/temp 2>/dev/null
        done
    ) &
fi

# 6. Mocks de SELinux enforce y Mounts limpios (Pixel 5)
echo '1' > "$FAKEDIR/selinux_enforce"

cat << 'EOF' > "$FAKEDIR/mountinfo"
14 0 254:0 / / ro,nodev,noatime - ext4 /dev/block/dm-0 ro
15 14 0:14 /dev /dev rw,nosuid,relatime - tmpfs tmpfs rw,seclabel,mode=755
16 14 0:15 /proc /proc rw,relatime - proc proc rw
17 14 0:16 /sys /sys rw,relatime - sysfs sysfs rw,seclabel
18 14 254:0 /system /system ro,nodev,noatime - ext4 /dev/block/dm-0 ro
19 14 254:1 /vendor /vendor ro,nodev,noatime - ext4 /dev/block/dm-1 ro
20 14 254:2 /product /product ro,nodev,noatime - ext4 /dev/block/dm-2 ro
21 14 254:3 /system_ext /system_ext ro,nodev,noatime - ext4 /dev/block/dm-3 ro
22 14 253:0 /metadata /metadata rw,nodev,noatime - ext4 /dev/block/by-name/metadata rw
23 14 253:1 /data /data rw,nosuid,nodev,noatime - f2fs /dev/block/by-name/userdata rw,seclabel,background_gc=on,discard,no_heap,user_xattr,inline_xattr,acl,inline_data,inline_dentry,flush_merge,extent_cache,mode=adaptive,active_logs=6,alloc_mode=default,fsync_mode=nobarrier
24 14 0:17 /storage /storage rw,nosuid,nodev,noatime - tmpfs tmpfs rw,seclabel,mode=755,gid=1028
25 24 0:18 /storage/emulated /storage/emulated rw,nosuid,nodev,noatime - fuse /data/media rw,nosuid,nodev,noatime,user_id=0,group_id=0,default_permissions,allow_other
EOF

cat << 'EOF' > "$FAKEDIR/mounts"
/dev/block/dm-0 / ext4 ro,nodev,noatime 0 0
tmpfs /dev tmpfs rw,seclabel,nosuid,relatime,mode=755 0 0
proc /proc proc rw,relatime 0 0
sysfs /sys sysfs rw,seclabel,relatime 0 0
/dev/block/dm-0 /system ext4 ro,nodev,noatime 0 0
/dev/block/dm-1 /vendor ext4 ro,nodev,noatime 0 0
/dev/block/dm-2 /product ext4 ro,nodev,noatime 0 0
/dev/block/dm-3 /system_ext ext4 ro,nodev,noatime 0 0
/dev/block/by-name/metadata /metadata ext4 rw,nodev,noatime 0 0
/dev/block/by-name/userdata /data f2fs rw,seclabel,nosuid,nodev,noatime,background_gc=on,discard,no_heap,user_xattr,inline_xattr,acl,inline_data,inline_dentry,flush_merge,extent_cache,mode=adaptive,active_logs=6,alloc_mode=default,fsync_mode=nobarrier 0 0
tmpfs /storage tmpfs rw,seclabel,nosuid,nodev,relatime,mode=755,gid=1028 0 0
/data/media /storage/emulated fuse rw,nosuid,nodev,noatime,user_id=0,group_id=0,default_permissions,allow_other 0 0
EOF

chmod 644 "$FAKEDIR/selinux_enforce" "$FAKEDIR/mountinfo" "$FAKEDIR/mounts" 2>/dev/null || true

# Partitions Mock (Pixel 5 128 GB UFS)
cat << 'EOF' > "$FAKEDIR/partitions"
major minor  #blocks  name

 259        0  122183680 sda
 259        1       4096 sda1
 259        2       4096 sda2
 259        3     131072 sda3
 259        4   15728640 sda4
 259        5  106315776 sda5
 254        0    3145728 dm-0
 254        1    1048576 dm-1
 254        2    1048576 dm-2
 254        3     524288 dm-3
 253        0    4194304 zram0
EOF
chmod 644 "$FAKEDIR/partitions" 2>/dev/null || true
mount --bind "$FAKEDIR/partitions" /proc/partitions 2>/dev/null || true

# 7. Wrapper de dumpsys para sensorservice (Pixel 5 Oficial)
if [ -f /system/bin/dumpsys ]; then
    if [ ! -f /data/local/tmp/dumpsys.orig ]; then
        cp /system/bin/dumpsys /data/local/tmp/dumpsys.orig
        chmod 755 /data/local/tmp/dumpsys.orig
    fi

    cat << 'EOF' > /data/local/tmp/fake_dumpsys.sh
#!/system/bin/sh
for arg in "$@"; do
    if [ "$arg" = "sensorservice" ]; then
        cat << 'SOF'
Sensor Device:
Total 11 h/w sensors, 0 running 0 disabled clients:
0x00000001) BMI260 Accelerometer           | Bosch Sensortec          | ver: 1 | type: android.sensor.accelerometer(1) | perm: n/a | flags: 0x00000000
	continuous | minRate=10.00Hz | maxRate=200.00Hz | FIFO (reserved=3000, max=3000) | non-wakeUp | 
0x00000002) AK09918 Magnetometer           | Asahi Kasei Microdevices | ver: 1 | type: android.sensor.magnetic_field(2) | perm: n/a | flags: 0x00000000
	continuous | minRate=10.00Hz | maxRate=100.00Hz | FIFO (reserved=600, max=600) | non-wakeUp | 
0x00000003) BMI260 Gyroscope               | Bosch Sensortec          | ver: 1 | type: android.sensor.gyroscope(4) | perm: n/a | flags: 0x00000000
	continuous | minRate=10.00Hz | maxRate=200.00Hz | FIFO (reserved=3000, max=3000) | non-wakeUp | 
0x00000004) TMD3702 Ambient Light Sensor   | AMS AG                   | ver: 1 | type: android.sensor.light(5) | perm: n/a | flags: 0x00000002
	on-change | minRate=0.10Hz | maxRate=5.00Hz | no batching | non-wakeUp | 
0x00000005) BMP380 Pressure Sensor         | Bosch Sensortec          | ver: 1 | type: android.sensor.pressure(6) | perm: n/a | flags: 0x00000000
	continuous | minRate=1.00Hz | maxRate=50.00Hz | FIFO (reserved=300, max=300) | non-wakeUp | 
0x00000006) TMD3702 Proximity Sensor       | AMS AG                   | ver: 1 | type: android.sensor.proximity(8) | perm: n/a | flags: 0x00000003
	on-change | minRate=0.10Hz | maxRate=5.00Hz | no batching | wakeUp | 
0x00000007) Gravity                        | Google                   | ver: 1 | type: android.sensor.gravity(9) | perm: n/a | flags: 0x00000000
	continuous | minRate=10.00Hz | maxRate=200.00Hz | no batching | non-wakeUp | 
0x00000008) Linear Acceleration            | Google                   | ver: 1 | type: android.sensor.linear_acceleration(10) | perm: n/a | flags: 0x00000000
	continuous | minRate=10.00Hz | maxRate=200.00Hz | no batching | non-wakeUp | 
0x00000009) Rotation Vector                | Google                   | ver: 1 | type: android.sensor.rotation_vector(11) | perm: n/a | flags: 0x00000000
	continuous | minRate=10.00Hz | maxRate=200.00Hz | no batching | non-wakeUp | 
0x0000000a) Step Counter                   | Bosch Sensortec          | ver: 1 | type: android.sensor.step_counter(19) | perm: n/a | flags: 0x00000002
	on-change | minRate=0.00Hz | maxRate=0.00Hz | no batching | non-wakeUp | 
0x0000000b) Step Detector                  | Bosch Sensortec          | ver: 1 | type: android.sensor.step_detector(18) | perm: n/a | flags: 0x00000006
	special-trigger | minRate=0.00Hz | maxRate=0.00Hz | no batching | non-wakeUp | 
devInitCheck : 0
SOF
        exit 0
    fi
    if [ "$arg" = "telephony.registry" ]; then
        cat << 'SOF_TEL'
last known state:
  Phone Id=0
    mCallState=0
    mRingingCallState=0
    mForegroundCallState=0
    mBackgroundCallState=0
    mPreciseCallState=Ringing call state: -1, Foreground call state: -1, Background call state: -1, Disconnect cause: -1, Precise disconnect cause: -1
    mCallDisconnectCause=-1
    mCallIncomingNumber=
    mServiceState={mVoiceRegState=0(IN_SERVICE), mDataRegState=0(IN_SERVICE), mChannelNumber=0, duplexMode()=0, mCellBandwidths=[], mOperatorAlphaLong=Personal, mOperatorAlphaShort=Personal, isManualNetworkSelection=false(automatic), getRilVoiceRadioTechnology=14(LTE), getRilDataRadioTechnology=14(LTE), mCssIndicator=supported, mNetworkId=0, mSystemId=0, mCdmaRoamingIndicator=0, mCdmaDefaultRoamingIndicator=0, mIsEmergencyOnly=false, isUsingCarrierAggregation=false, mArfcnRsrpBoost=0, mNetworkRegistrationInfos=[], mNrFrequencyRange=0, mOperatorAlphaLongRaw=Personal, mOperatorAlphaShortRaw=Personal, mIsDataRoamingFromRegistration=false, mIsIwlanPreferred=false}
    mVoiceActivationState= 0
    mDataActivationState= 0
    mUserMobileDataState= true
    mSignalStrength=SignalStrength: mCdma=CellSignalStrengthCdma: mGsm=CellSignalStrengthGsm: mLte=CellSignalStrengthLte: rssi=99 rsrp=-85 rsrq=-10 rssnr=150 cqi=15 ta=2147483647 level=4
    mMessageWaiting=false
    mCallForwarding=false
    mDataActivity=0
    mDataConnectionState=2
    mCellIdentity=CellIdentityLte:{ mPci=312 mEarfcn=1650 mBands=[3] mMcc=722 mMnc=34 mAlphaLong=Personal mAlphaShort=Personal }
    mCellInfo=[CellInfoLte:{mRegistered=true mTimeStampType=OEM_RIL mTimeStamp=1791127000000ns mCellIdentity=CellIdentityLte:{ mPci=312 mEarfcn=1650 mBands=[3] mMcc=722 mMnc=34 mAlphaLong=Personal mAlphaShort=Personal } mCellSignalStrength=CellSignalStrengthLte: rssi=99 rsrp=-85 rsrq=-10 rssnr=150 cqi=15 ta=2147483647 level=4}]
    mSrvccState=-1
    mCallPreciseDisconnectCause=-1
    mCallNetworkType=13
    mCallAttributes=mPreciseCallState=Ringing call state: -1, Foreground call state: -1, Background call state: -1, Disconnect cause: -1, Precise disconnect cause: -1 mNetworkType=13 mCallQuality=CallQuality: {downlinkCallQualityLevel=5 uplinkCallQualityLevel=5 callDuration=0}
SOF_TEL
        exit 0
    fi
    if [ "$arg" = "wifi" ]; then
        cat << 'SOF_WIFI'
Wi-Fi is enabled
WifiState 3
Current wifi mode: EnabledState
NumActiveModeManagers: 1
WifiInfo SSID: "Personal-WiFi-5.8G", BSSID: 82:5e:45:1a:27:54, MAC: 82:5e:45:1a:27:54, Supplicant state: COMPLETED, RSSI: -52, Link speed: 866Mbps, Tx Link speed: 866Mbps, Rx Link speed: 866Mbps, Frequency: 5180MHz, Net ID: 1, Metered hint: false, score: 60, isUsable: true, CarrierId: 1341
SOF_WIFI
        exit 0
    fi
    if [ "$arg" = "media.camera" ]; then
        cat << 'SOF_CAM'
Camera module HAL API version: 0x204
Camera module API version: 0x204
Camera module name: Google Pixel 5 Camera HAL
Number of camera devices: 3
Number of normal camera devices: 3
Number of public camera devices visible to API1: 2
Camera ID: 0 (Back)
  Facing: BACK
  Orientation: 90
  Resource Cost: 100
Camera ID: 1 (Front)
  Facing: FRONT
  Orientation: 270
  Resource Cost: 100
Camera ID: 2 (Ultrawide)
  Facing: BACK
  Orientation: 90
  Resource Cost: 100
SOF_CAM
        exit 0
    fi
done
exec /data/local/tmp/dumpsys.orig "$@"
EOF
    chmod 755 /data/local/tmp/fake_dumpsys.sh
    mount --bind /data/local/tmp/fake_dumpsys.sh /system/bin/dumpsys
fi

# 8. Wrapper de /system/bin/mount y formato de montajes de Pixel 5
awk '{print $1 " on " $2 " type " $3 " (" $4 ")"}' "$FAKEDIR/mounts" > "$FAKEDIR/mounts_formatted"
chmod 644 "$FAKEDIR/mounts_formatted" 2>/dev/null || true

mount -o remount,rw / 2>/dev/null || true
if [ -L /system/bin/mount ]; then
    rm -f /system/bin/mount
    cat << 'EOF' > /system/bin/mount
#!/system/bin/sh
if [ $# -eq 0 ]; then
    cat /data/local/tmp/fake_proc/mounts_formatted
    exit 0
fi
exec /system/bin/toybox mount "$@"
EOF
    chmod 755 /system/bin/mount
fi
mount -o remount,ro / 2>/dev/null || true

# 9. Wrapper de /system/bin/uname (Pixel 5 Oficial)
mount -o remount,rw / 2>/dev/null || true
if [ -L /system/bin/uname ]; then
    rm -f /system/bin/uname
    cat << 'EOF' > /system/bin/uname
#!/system/bin/sh
KREL="4.19.282-g9e27c0faec01"
KVER="#1 SMP PREEMPT Wed Oct 18 10:14:02 UTC 2023"
ARCH="aarch64"

if [ $# -eq 0 ]; then
    echo "Linux"
    exit 0
fi

case "$1" in
    -a|--all)
        echo "Linux localhost $KREL $KVER $ARCH Toybox"
        ;;
    -r|--kernel-release)
        echo "$KREL"
        ;;
    -v|--kernel-version)
        echo "$KVER"
        ;;
    -m|--machine)
        echo "$ARCH"
        ;;
    -s|--kernel-name)
        echo "Linux"
        ;;
    -n|--nodename)
        echo "localhost"
        ;;
    *)
        exec /system/bin/toybox uname "$@"
        ;;
esac
EOF
    chmod 755 /system/bin/uname
fi
mount -o remount,ro / 2>/dev/null || true

# 10. Wrapper de /system/bin/ip (Enmascarar eth0 -> wlan0)
if [ -f /system/bin/ip ] && [ ! -d /data/local/tmp/ip_bin ]; then
    mkdir -p /data/local/tmp/ip_bin
    cp /system/bin/ip /data/local/tmp/ip_bin/ip
    chmod 755 /data/local/tmp/ip_bin/ip
fi

if [ -f /data/local/tmp/ip_bin/ip ]; then
    cat << 'EOF' > /data/local/tmp/fake_ip.sh
#!/system/bin/sh
/data/local/tmp/ip_bin/ip "$@" | sed -E 's/eth0@[^:]+/wlan0/g; s/eth0/wlan0/g'
EOF
    chmod 755 /data/local/tmp/fake_ip.sh
    mount --bind /data/local/tmp/fake_ip.sh /system/bin/ip 2>/dev/null || true
fi









