#!/usr/bin/env bash
set -euo pipefail

release=$1
smoke=$2
architecture=$3
case "$architecture" in
    x64) machine=x86_64 ;;
    arm64) machine=arm64 ;;
    *) exit 2 ;;
esac
test "$(uname -m)" = "$machine"
version=$(node -p 'require("./package.json").version')
identifier=$(node -p 'require("./apps/desktop/tauri.conf.json").identifier')
revision=$(git rev-parse HEAD)
name="MarketWeft-desktop-$version-macos-$architecture.zip"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

python3 -B scripts/package_desktop_macos.py "$release" --architecture "$architecture" --output reports
python3 -B scripts/package_desktop_macos.py "$release" --architecture "$architecture" --output "$work/reproduction"
cmp "reports/$name" "$work/reproduction/$name"
cmp "reports/$name.sha256" "$work/reproduction/$name.sha256"
(cd reports && shasum -a 256 -c "$name.sha256")

ditto -x -k "reports/$name" "$work/release"
bundle="$work/release/MarketWeft.app"
executable="$bundle/Contents/MacOS/marketweft-desktop"
info="$bundle/Contents/Info.plist"
test -x "$executable"
test "$(xcrun lipo -archs "$executable")" = "$machine"
test "$(plutil -extract CFBundleIdentifier raw -o - "$info")" = "$identifier"
test "$(plutil -extract CFBundleExecutable raw -o - "$info")" = marketweft-desktop
test "$(plutil -extract CFBundleShortVersionString raw -o - "$info")" = "$version"
test "$(cat "$bundle/Contents/Resources/source-revision.txt")" = "$revision"
test -s "$bundle/Contents/Resources/MarketWeft.icns"
test -s "$bundle/Contents/Resources/licenses/cargo-sources.json"
test -s "$bundle/Contents/Resources/licenses/dependencies.cdx.json"
codesign --verify --deep --strict "$bundle"
open -n -g "$bundle"
swift apps/desktop/tests/verify_macos_launch.swift "$bundle" "$identifier"

python3 -B scripts/package_desktop_macos.py "$smoke" --architecture "$architecture" --output "$work/smoke-package"
ditto -x -k "$work/smoke-package/$name" "$work/smoke"
smoke_bundle="$work/smoke/MarketWeft.app"
codesign --verify --deep --strict "$smoke_bundle"
"$smoke_bundle/Contents/MacOS/marketweft-desktop" | tee "$work/wkwebview.log"
grep -Fx "Verified native WebView CSV import and exact OHLCV." "$work/wkwebview.log"
printf 'Verified the reproducible macOS %s bundle and native WKWebView CSV fixture.\n' "$architecture"
