#!/system/bin/sh
/system/bin/toolbox getprop "$@" | grep -v -iE 'redroid|adbd|_debug_pid|x86_64\.features|isa\.arm' | sed 's/\[ro\.hardware\]: \[.*\]/\[ro\.hardware\]: \[qcom\]/g'
