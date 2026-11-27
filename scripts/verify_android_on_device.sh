#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 4 && $# != 7 ]]; then
    printf 'Usage: %s SERIAL ABI APK EVIDENCE [BASELINE_APK BASELINE_VERSION BASELINE_COMMIT]\n' "$0" >&2
    exit 2
fi
serial=$1
abi=$2
apk=$3
evidence=$4
shift 4
package=$(node -p 'require("./apps/desktop/tauri.conf.json").identifier')
version=$(node -p 'require("./package.json").version')
sdk_tools="$ANDROID_HOME/build-tools/37.0.0"
activity=$(bash scripts/verify_android_package.sh "$apk" "$abi")
device=(adb -s "$serial")

device_state=$("${device[@]}" get-state | tr -d '\r')
actual_abi=$("${device[@]}" shell getprop ro.product.cpu.abi | tr -d '\r')
if [[ "$device_state" != device || "$actual_abi" != "$abi" ]]; then
    printf 'Expected an ADB connection to an Android device with ABI %s. Observed state=%s ABI=%s.\n' "$abi" "$device_state" "$actual_abi" >&2
    exit 1
fi

offline_deadline=$((SECONDS + 15))
while :; do
    airplane=$("${device[@]}" shell settings get global airplane_mode_on | tr -d '\r')
    wifi=$("${device[@]}" shell settings get global wifi_on | tr -d '\r')
    # Android records 3 when airplane mode turns Wi-Fi off and 0 when Wi-Fi is explicitly off.
    if [[ "$airplane" == 1 && ( "$wifi" == 0 || "$wifi" == 3 ) ]]; then
        break
    fi
    if (( SECONDS >= offline_deadline )); then
        printf 'Enable airplane mode and disable Wi-Fi before verification. Observed airplane_mode_on=%s wifi_on=%s.\n' "$airplane" "$wifi" >&2
        exit 1
    fi
    sleep 1
done
installed=$("${device[@]}" shell pm list packages "$package" | tr -d '\r')
if grep -Fxq "package:$package" <<<"$installed"; then
    printf 'Use a device without an existing MarketWeft installation for the fresh workspace test.\n' >&2
    exit 1
fi
for remote in /sdcard/Download/marketweft-native.csv /sdcard/marketweft-terminal.xml /sdcard/marketweft-csv-hierarchy.xml; do
    if "${device[@]}" shell test -e "$remote"; then
        printf 'The Android device already contains the test path %s.\n' "$remote" >&2
        exit 1
    fi
done
mkdir -p "$evidence"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

"${device[@]}" shell getprop ro.build.version.sdk >"$evidence/android-api-level.txt"
"${device[@]}" shell getconf PAGE_SIZE >"$evidence/android-page-size.txt"
"${device[@]}" install "$apk"
"${device[@]}" shell dumpsys webviewupdate >"$evidence/android-webview.txt"
grep -Eq 'Current WebView package \(name, version\): \([^,]+, [^)]+\)' "$evidence/android-webview.txt"
"${device[@]}" shell am start -W -n "$package/$activity" | tee "$evidence/android-launch.txt"
grep -q '^Status: ok' "$evidence/android-launch.txt"

for _ in {1..15}; do
    if "${device[@]}" shell uiautomator dump /sdcard/marketweft-terminal.xml >"$work/dump.log" 2>&1 &&
        "${device[@]}" exec-out cat /sdcard/marketweft-terminal.xml >"$evidence/android-terminal.xml" &&
        python3 -B scripts/verify_android_terminal.py hierarchy "$evidence/android-terminal.xml" "$package" >"$work/hierarchy.log" 2>&1; then
        fixture=apps/desktop/tests/fixtures/native-verification.csv
        python3 -B scripts/verify_android_csv.py "$serial" "$package" "$activity" "$fixture" "$evidence/android-import-latest.xml"
        python3 -B scripts/verify_android_workspace_backup.py "$serial" "$package" "$activity" "$apk" "$fixture" "$evidence/android-backup"
        if [[ $# == 3 ]]; then
            python3 -B scripts/verify_android_terminal.py apk "$1" "$3" --abi "$abi"
            python3 -B scripts/verify_android_upgrade.py "$serial" "$package" "$activity" "$sdk_tools" \
                "$fixture" "$evidence/android-upgrade" "$1" "$2" "$apk" "$version"
        fi
        printf 'Verified MarketWeft %s offline in Android %s System WebView.\n' "$version" "$abi"
        exit 0
    fi
    sleep 2
done
if [[ -f "$work/hierarchy.log" ]]; then cat "$work/hierarchy.log" >&2; fi
cat "$work/dump.log" >&2
exit 1
