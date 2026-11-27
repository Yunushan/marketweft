#!/usr/bin/env bash
set -euo pipefail

architecture=$1
case "$architecture" in
    x64) machine=x86_64 ;;
    arm64) machine=arm64 ;;
    *) exit 2 ;;
esac
test "$(uname -m)" = "$machine"
version=$(node -p 'require("./package.json").version')
identifier=$(node -p 'require("./apps/desktop/tauri.conf.json").identifier')
name="MarketWeft-desktop-$version-macos-$architecture"
work=$(mktemp -d)
mountpoint="$work/mounted"
mounted=false

cleanup() {
    if "$mounted"; then
        hdiutil detach "$mountpoint" -quiet || return 1
    fi
    rm -rf -- "$work"
}
trap cleanup EXIT

mkdir -p "$mountpoint" "$work/Applications"
ditto -x -k "reports/$name.zip" "$work/source"
ln -s /Applications "$work/source/Applications"
hdiutil create -srcfolder "$work/source" -volname MarketWeft -fs HFS+ -format UDZO "$work/$name.dmg"
hdiutil verify "$work/$name.dmg"
hdiutil attach "$work/$name.dmg" -readonly -nobrowse -mountpoint "$mountpoint"
mounted=true
test "$(readlink "$mountpoint/Applications")" = /Applications

installed="$work/Applications/MarketWeft.app"
ditto "$mountpoint/MarketWeft.app" "$installed"
hdiutil detach "$mountpoint"
mounted=false

diff -rq "$work/source/MarketWeft.app" "$installed"
executable="$installed/Contents/MacOS/marketweft-desktop"
test -x "$executable"
test "$(xcrun lipo -archs "$executable")" = "$machine"
codesign --verify --deep --strict "$installed"
open -n -g "$installed"
swift apps/desktop/tests/verify_macos_launch.swift "$installed" "$identifier"

(cd "$work" && shasum -a 256 "$name.dmg" > "$name.dmg.sha256" && shasum -a 256 -c "$name.dmg.sha256")
mv "$work/$name.dmg" "$work/$name.dmg.sha256" reports/
printf 'Verified the macOS %s disk image and launched the copied application after ejecting the image.\n' "$architecture"
