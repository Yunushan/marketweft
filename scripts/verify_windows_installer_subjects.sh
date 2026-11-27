#!/usr/bin/env bash
set -euo pipefail

version=$1
revision=$2
directory=$3
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
[[ "$revision" =~ ^[0-9a-f]{40}$ ]]
shopt -s dotglob nullglob
entries=("$directory"/*)
test "${#entries[@]}" -eq 4

work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
for arch in x64 arm64; do
    filename="MarketWeft-desktop-$version-windows-$arch-setup.exe"
    installer="$directory/$filename"
    digest=$(sha256sum "$installer")
    printf '%s  %s\n' "${digest%% *}" "$filename" > "$work/checksum.txt"
    sed 's/\r$//' "$installer.sha256" | cmp - "$work/checksum.txt"
    printf '%s\n' "$revision" > "$work/revision.txt"
    7z x -so "$installer" source-revision.txt | sed 's/\r$//' | cmp - "$work/revision.txt"
    7z x -so "$installer" marketweft-desktop.exe > "$work/$arch.exe"
    python3 -B scripts/verify_windows_arch.py "$arch" "$work/$arch.exe"
    printf 'Verified %s against source commit %s.\n' "$filename" "$revision"
done
