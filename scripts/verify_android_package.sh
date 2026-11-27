#!/usr/bin/env bash
set -euo pipefail

apk=$1
abi=$2
revision=$(git rev-parse HEAD)
version=$(node -p 'require("./package.json").version')
package=$(node -p 'require("./apps/desktop/tauri.conf.json").identifier')
sdk_tools="$ANDROID_HOME/build-tools/37.0.0"

"$sdk_tools/apksigner" verify --verbose "$apk" >&2
badging=$("$sdk_tools/aapt2" dump badging "$apk")
package_line=$(grep '^package:' <<<"$badging")
[[ "$package_line" == "package: name='$package' versionCode='"*"' versionName='$version'"* ]]
grep -Eq "^native-code: '$abi'[[:space:]]*$" <<<"$badging"

alignment=()
if [[ "$abi" == arm64-v8a ]]; then
    "$sdk_tools/zipalign" -c -P 16 4 "$apk" >&2
    alignment=(--page-size 16384)
fi
python3 -B scripts/verify_android_terminal.py apk "$apk" "$revision" --abi "$abi" "${alignment[@]}"

activity=$(sed -n "s/^launchable-activity: name='\([^']*\)'.*/\1/p" <<<"$badging")
[[ "$activity" == "$package".* && "$activity" != *$'\n'* ]]
printf '%s\n' "$activity"
