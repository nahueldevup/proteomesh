#!/system/bin/sh
# Micro-dinámica química de batería para Pixel 5
while true; do
    sleep 40
    if [ -f /sys/class/power_supply/battery/voltage_now ]; then
        V=$((4195000 + (RANDOM % 15000) - 7500))
        T=$((290 + (RANDOM % 6) - 3))
        echo "$V" > /sys/class/power_supply/battery/voltage_now 2>/dev/null || true
        echo "$T" > /sys/class/power_supply/battery/temp 2>/dev/null || true
    fi
done
