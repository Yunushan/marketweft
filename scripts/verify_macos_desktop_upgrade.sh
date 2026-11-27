#!/usr/bin/env bash
set -euo pipefail

architecture=$1
baseline_run=$2
baseline_commit=$3
baseline_version=$4
case "$architecture" in
    x64) machine=x86_64 ;;
    arm64) machine=arm64 ;;
    *) exit 2 ;;
esac
test "$(uname -m)" = "$machine"
repo=$(git rev-parse --show-toplevel)
version=$(node -p 'require("./package.json").version')
revision=$(git rev-parse HEAD)
identifier=$(node -p 'require("./apps/desktop/tauri.conf.json").identifier')
baseline_name="MarketWeft-desktop-$baseline_version-macos-$architecture"
candidate_name="MarketWeft-desktop-$version-macos-$architecture"
binary="$repo/apps/desktop/target/release/marketweft-desktop"
work=$(mktemp -d)
mountpoint="$work/mounted"
source="$work/baseline-source"
installed="$work/Applications/MarketWeft.app"
mounted=false

cleanup() {
    if "$mounted"; then
        hdiutil detach "$mountpoint" -quiet || return 1
    fi
    rm -rf -- "$work"
}
trap cleanup EXIT

mkdir -p "$mountpoint" "$work/Applications"
python3 -B scripts/package_desktop_macos.py "$binary" --architecture "$architecture" --output "$work/candidate-probe"
ditto -x -k "$work/candidate-probe/$candidate_name.zip" "$work/candidate-probe"

download_status=0
python3 -B scripts/download_desktop_baseline.py --platform macos-disk-image --architecture "$architecture" \
    --run "$baseline_run" --commit "$baseline_commit" --version "$baseline_version" \
    --output "$work/baseline" || download_status=$?
unset GITHUB_TOKEN
if [[ "$download_status" != 0 && "$download_status" != 42 ]]; then
    exit "$download_status"
fi

# Both probes embed their own revision's frontend and differ only in test instrumentation.
git init --quiet "$source"
git -C "$source" fetch --no-tags --depth 1 https://github.com/Yunushan/marketweft.git "$baseline_commit"
git -C "$source" checkout --quiet --detach FETCH_HEAD
test "$(git -C "$source" rev-parse HEAD)" = "$baseline_commit"
(
    cd "$source"
    test "$(node -p 'require("./package.json").version')" = "$baseline_version"
    test "$(node -p 'require("./apps/desktop/tauri.conf.json").identifier')" = "$identifier"
    npm ci
    npm run build
    baseline_binary=apps/desktop/target/release/marketweft-desktop
    if [[ "$download_status" == 42 ]]; then
        cargo build --locked --release --manifest-path apps/desktop/Cargo.toml
        python3 -B scripts/package_desktop_macos.py "$baseline_binary" --architecture "$architecture"
        bash scripts/verify_desktop_macos_disk_image.sh "$architecture"
        mkdir -p "$work/baseline"
        mv "reports/$baseline_name.dmg" "reports/$baseline_name.dmg.sha256" "$work/baseline"
    fi
    ditto "$repo/apps/desktop/src/native_smoke.rs" apps/desktop/src/native_smoke.rs
    ditto "$repo/apps/desktop/tests/import_native_fixture.js" apps/desktop/tests/import_native_fixture.js
    cargo build --locked --release --manifest-path apps/desktop/Cargo.toml --features native-smoke
    python3 -B scripts/package_desktop_macos.py "$baseline_binary" --architecture "$architecture" --output "$work/baseline-probe"
    ditto -x -k "$work/baseline-probe/$baseline_name.zip" "$work/baseline-probe"
)

copy_application() {
    local image=$1
    local destination=$2
    local expected_version=$3
    local expected_revision=$4
    hdiutil attach "$image" -readonly -nobrowse -mountpoint "$mountpoint"
    mounted=true
    ditto "$mountpoint/MarketWeft.app" "$destination"
    hdiutil detach "$mountpoint"
    mounted=false
    local contents="$destination/Contents"
    test "$(plutil -extract CFBundleShortVersionString raw -o - "$contents/Info.plist")" = "$expected_version"
    test "$(plutil -extract CFBundleIdentifier raw -o - "$contents/Info.plist")" = "$identifier"
    test "$(cat "$contents/Resources/source-revision.txt")" = "$expected_revision"
    test "$(xcrun lipo -archs "$contents/MacOS/marketweft-desktop")" = "$machine"
    codesign --verify --deep --strict "$destination"
}

launch_application() {
    open -n -g "$installed"
    swift apps/desktop/tests/verify_macos_launch.swift "$installed" "$identifier"
}

check_workspace() {
    local probe="$1/MarketWeft.app/Contents/MacOS/marketweft-desktop"
    local phase=$2
    MARKETWEFT_NATIVE_SMOKE_PHASE="$phase" "$probe" | tee "$work/$phase.log"
    grep -Fx "Verified native WebView workspace $phase and exact OHLCV." "$work/$phase.log"
}

export MARKETWEFT_NATIVE_SMOKE_PROFILE
MARKETWEFT_NATIVE_SMOKE_PROFILE=$(uuidgen | tr -d '-')
copy_application "$work/baseline/$baseline_name.dmg" "$installed" "$baseline_version" "$baseline_commit"
launch_application
printf '%s\n' 'preserve this file across app upgrades' > "$work/Applications/user-created.txt"
check_workspace "$work/baseline-probe" seed
check_workspace "$work/baseline-probe" reopen

copy_application "reports/$candidate_name.dmg" "$work/candidate.app" "$version" "$revision"
mv "$installed" "$work/previous.app"
mv "$work/candidate.app" "$installed"
codesign --verify --deep --strict "$installed"
launch_application
test "$(cat "$work/Applications/user-created.txt")" = 'preserve this file across app upgrades'
check_workspace "$work/candidate-probe" reopen
printf 'Verified the macOS %s upgrade from %s to %s and the saved WKWebView workspace.\n' "$architecture" "$baseline_version" "$version"
