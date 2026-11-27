#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 0 && $# != 3 ]]; then
    printf 'Usage: %s [BASELINE_APK BASELINE_VERSION BASELINE_COMMIT]\n' "$0" >&2
    exit 2
fi

version=$(node -p 'require("./package.json").version')
name="MarketWeft-android-$version-x86_64-debug.apk"
apk="reports/$name"
image='system-images;android-35;google_apis;x86_64'
emulator="$ANDROID_HOME/emulator/emulator"
test -c /dev/kvm
if [[ ! -r /dev/kvm || ! -w /dev/kvm ]]; then
    sudo setfacl -m "u:$(id -un):rw" /dev/kvm
fi

work=$(mktemp -d)
serial='emulator-5554'
device=(adb -s "$serial")
emulator_pid=
trap '
    if [[ -n "$emulator_pid" ]] && kill -0 "$emulator_pid" 2>/dev/null; then
        timeout 10 "${device[@]}" emu kill >/dev/null 2>&1 || kill "$emulator_pid" 2>/dev/null || true
        wait "$emulator_pid" || true
    fi
    rm -rf -- "$work"
' EXIT

if adb devices | grep -Eq "^${serial}[[:space:]]"; then
    printf 'An emulator already uses %s.\n' "$serial" >&2
    exit 1
fi
export ANDROID_AVD_HOME="$work/avd"
mkdir -p "$ANDROID_AVD_HOME"
sdkmanager --install emulator "$image"
avdmanager create avd --name marketweft-api35 --package "$image" --abi x86_64 <<<no
"$emulator" -avd marketweft-api35 -port 5554 -accel on -no-window -no-audio -no-boot-anim \
    -no-snapshot -gpu swiftshader >reports/android-emulator.log 2>&1 &
emulator_pid=$!
timeout 180 "${device[@]}" wait-for-device
boot_deadline=$((SECONDS + 180))
until [[ "$(timeout 10 "${device[@]}" shell getprop sys.boot_completed | tr -d '\r')" == 1 ]]; do
    if (( SECONDS >= boot_deadline )); then
        printf 'The Android emulator did not finish booting.\n' >&2
        exit 1
    fi
    sleep 2
done
test "$("${device[@]}" shell getprop ro.build.version.sdk | tr -d '\r')" = 35
test "$("${device[@]}" shell getprop ro.product.cpu.abi | tr -d '\r')" = x86_64

"${device[@]}" shell input keyevent KEYCODE_WAKEUP
"${device[@]}" shell wm dismiss-keyguard
# Turn Wi-Fi off first so airplane mode cannot preserve an enabled Wi-Fi override.
"${device[@]}" shell svc wifi disable
"${device[@]}" shell svc data disable
"${device[@]}" shell cmd connectivity airplane-mode enable
# Airplane mode can restore the emulator image's saved Wi-Fi override.
offline_deadline=$((SECONDS + 15))
while :; do
    "${device[@]}" shell svc wifi disable
    sleep 1
    airplane=$("${device[@]}" shell settings get global airplane_mode_on | tr -d '\r')
    wifi=$("${device[@]}" shell settings get global wifi_on | tr -d '\r')
    if [[ "$airplane" == 1 && ( "$wifi" == 0 || "$wifi" == 3 ) ]]; then
        break
    fi
    if (( SECONDS >= offline_deadline )); then
        printf 'The emulator could not become offline. Observed airplane_mode_on=%s wifi_on=%s.\n' "$airplane" "$wifi" >&2
        exit 1
    fi
done
bash scripts/verify_android_on_device.sh "$serial" x86_64 "$apk" reports "$@"
(cd reports && sha256sum "$name" >"$name.sha256")
