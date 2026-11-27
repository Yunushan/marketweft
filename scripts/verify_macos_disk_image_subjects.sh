#!/usr/bin/env bash
set -euo pipefail

version=$1
revision=$2
directory=$3
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
[[ "$revision" =~ ^[0-9a-f]{40}$ ]]
identifier=$(plutil -extract identifier raw -o - apps/desktop/tauri.conf.json)
shopt -s nullglob
images=("$directory"/*.dmg)
test "${#images[@]}" -eq 2

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
mkdir "$mountpoint"

for architecture in x64 arm64; do
    case "$architecture" in
        x64) machine=x86_64 ;;
        arm64) machine=arm64 ;;
    esac
    filename="MarketWeft-desktop-$version-macos-$architecture.dmg"
    image="$directory/$filename"
    digest=$(shasum -a 256 "$image")
    test "$(cat "$image.sha256")" = "${digest%% *}  $filename"
    hdiutil verify "$image"
    hdiutil attach "$image" -readonly -nobrowse -mountpoint "$mountpoint"
    mounted=true
    test "$(readlink "$mountpoint/Applications")" = /Applications
    bundle="$mountpoint/MarketWeft.app"
    contents="$bundle/Contents"
    test "$(plutil -extract CFBundleIdentifier raw -o - "$contents/Info.plist")" = "$identifier"
    test "$(plutil -extract CFBundleShortVersionString raw -o - "$contents/Info.plist")" = "$version"
    test "$(plutil -extract CFBundleExecutable raw -o - "$contents/Info.plist")" = marketweft-desktop
    test "$(cat "$contents/Resources/source-revision.txt")" = "$revision"
    test "$(xcrun lipo -archs "$contents/MacOS/marketweft-desktop")" = "$machine"
    codesign --verify --deep --strict "$bundle"
    hdiutil detach "$mountpoint"
    mounted=false
    printf 'Verified %s with source %s and SHA-256 %s.\n' "$filename" "$revision" "${digest%% *}"
done
