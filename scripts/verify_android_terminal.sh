#!/usr/bin/env bash
set -euo pipefail

version=$(node -p 'require("./package.json").version')
package=$(node -p 'require("./apps/desktop/tauri.conf.json").identifier')
name="MarketWeft-android-$version-x86_64-debug.apk"
apk="reports/$name"
sdk_tools="$ANDROID_HOME/build-tools/37.0.0"
image='system-images;android-35;google_apis;x86_64'
emulator="$ANDROID_HOME/emulator/emulator"
test -c /dev/kvm
if [[ ! -r /dev/kvm || ! -w /dev/kvm ]]; then
    sudo setfacl -m "u:$(id -un):rw" /dev/kvm
fi

"$sdk_tools/apksigner" verify --verbose "$apk"
badging=$("$sdk_tools/aapt2" dump badging "$apk")
package_line=$(grep '^package:' <<<"$badging")
[[ "$package_line" == "package: name='$package' versionCode='"*"' versionName='$version'"* ]]
grep -Fq "native-code: 'x86_64'" <<<"$badging"
python3 -B scripts/verify_android_terminal.py apk "$apk" "$(git rev-parse HEAD)"
activity=$(sed -n "s/^launchable-activity: name='\([^']*\)'.*/\1/p" <<<"$badging")
[[ "$activity" == "$package".* ]]

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
"${device[@]}" shell cmd connectivity airplane-mode enable
"${device[@]}" shell svc wifi disable
"${device[@]}" shell svc data disable
test "$("${device[@]}" shell settings get global airplane_mode_on | tr -d '\r')" = 1
"${device[@]}" install "$apk"
"${device[@]}" shell dumpsys webviewupdate >reports/android-webview.txt
grep -Eq 'Current WebView package \(name, version\): \([^,]+, [^)]+\)' reports/android-webview.txt
"${device[@]}" shell am start -W -n "$package/$activity" | tee reports/android-launch.txt
grep -q '^Status: ok' reports/android-launch.txt

for _ in {1..15}; do
    if "${device[@]}" shell uiautomator dump /sdcard/marketweft-terminal.xml >"$work/dump.log" 2>&1 &&
        "${device[@]}" exec-out cat /sdcard/marketweft-terminal.xml >reports/android-terminal.xml &&
        python3 -B scripts/verify_android_terminal.py hierarchy reports/android-terminal.xml "$package" >"$work/hierarchy.log" 2>&1; then
        python3 -B scripts/verify_android_csv.py "$serial" "$package" "$activity" \
            apps/desktop/tests/fixtures/native-verification.csv reports/android-import-latest.xml
        (cd reports && sha256sum "$name" >"$name.sha256")
        printf 'Verified MarketWeft %s offline in Android 35 x86_64 System WebView.\n' "$version"
        exit 0
    fi
    sleep 2
done
if [[ -f "$work/hierarchy.log" ]]; then cat "$work/hierarchy.log" >&2; fi
cat "$work/dump.log" >&2
exit 1
