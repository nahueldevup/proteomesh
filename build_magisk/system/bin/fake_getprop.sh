#!/system/bin/sh
FAKEDIR="/data/local/tmp/fake_proc"

HWC=$(cat "$FAKEDIR/hwcomposer" 2>/dev/null)
[ -z "$HWC" ] && HWC="redroid"
GRALLOC=$(cat "$FAKEDIR/gralloc" 2>/dev/null)
[ -z "$GRALLOC" ] && GRALLOC="redroid"

case "$1" in
    ro.hardware.hwcomposer)
        echo "$HWC"
        exit 0
        ;;
    ro.hardware.gralloc)
        echo "$GRALLOC"
        exit 0
        ;;
    init.svc.adbd)
        echo "stopped"
        exit 0
        ;;
    sys.usb.config|sys.usb.state|persist.sys.usb.config)
        echo "none"
        exit 0
        ;;
esac

/system/bin/toolbox getprop "$@" \
    | grep -v -iE 'adbd|_debug_pid|x86_64\.features|isa\.arm' \
    | sed -e "s|\[ro\.hardware\.hwcomposer\]: \[.*\]|[ro.hardware.hwcomposer]: [$HWC]|g" \
          -e "s|\[ro\.hardware\.gralloc\]: \[.*\]|[ro.hardware.gralloc]: [$GRALLOC]|g" \
          -e '/redroid/d'
