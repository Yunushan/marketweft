#!/usr/bin/env bash
set -euo pipefail

version=$1
revision=$2
distribution=$3
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
[[ "$revision" =~ ^[0-9a-f]{40}$ ]]
shopt -s nullglob
packages=("$distribution"/*.apk)
test "${#packages[@]}" -eq 2

for abi in x86_64 arm64-v8a; do
    filename="MarketWeft-android-$version-$abi-debug.apk"
    package="$distribution/$filename"
    digest=$(sha256sum <"$package")
    test "$(cat "$package.sha256")" = "${digest%% *}  $filename"

    alignment=()
    if [[ "$abi" == arm64-v8a ]]; then alignment=(--page-size 16384); fi
    python3 -B scripts/verify_android_terminal.py apk "$package" "$revision" --abi "$abi" "${alignment[@]}"
done
