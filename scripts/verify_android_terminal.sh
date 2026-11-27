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
# Keep Wi-Fi in the airplane-mode radios and prevent the disposable emulator
# from restoring or toggling it while airplane mode is active.
"${device[@]}" shell settings put global airplane_mode_radios cell,bluetooth,wifi,nfc,wimax
"${device[@]}" shell settings put global airplane_mode_toggleable_radios bluetooth
"${device[@]}" shell settings --user 0 put secure wifi_apm_state 0
"${device[@]}" shell svc wifi disable
"${device[@]}" shell svc data disable
"${device[@]}" shell cmd connectivity airplane-mode enable
bash scripts/verify_android_on_device.sh "$serial" x86_64 "$apk" reports "$@"
(cd reports && sha256sum "$name" >"$name.sha256")
