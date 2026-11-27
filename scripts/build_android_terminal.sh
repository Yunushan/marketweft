#!/usr/bin/env bash
set -euo pipefail

abi=${1:-x86_64}
case "$abi" in
    x86_64) rust_target=x86_64-linux-android; tauri_target=x86_64 ;;
    arm64-v8a) rust_target=aarch64-linux-android; tauri_target=aarch64 ;;
    *) printf 'Unsupported Android ABI: %s\n' "$abi" >&2; exit 2 ;;
esac

repository=$(git rev-parse --show-toplevel)
version=$(node -p 'require("./package.json").version')
test "$(npm run --silent tauri -- --version)" = 'tauri-cli 2.12.6'
test -s apps/terminal/dist/index.html
test -d "$NDK_HOME"
rustup target add "$rust_target"
cargo fetch --locked --target "$rust_target" --manifest-path apps/desktop/Cargo.toml

export TAURI_APP_PATH="$repository/apps/desktop"
export TAURI_FRONTEND_PATH="$repository"
# Generate the Gradle project from the pinned CLI and the checked-in Tauri configuration.
npm run tauri -- android init --ci --skip-targets-install
python3 -B scripts/stage_native_application_notices.py \
    apps/desktop/gen/android/app/src/main/assets/marketweft-notices "$rust_target"
bash scripts/build_android_apk_with_retry.sh "$tauri_target"
git diff --exit-code -- apps/desktop/Cargo.lock

mapfile -d '' -t packages < <(find apps/desktop/gen/android/app/build/outputs/apk -name "*-$abi-debug.apk" -type f -print0)
test "${#packages[@]}" -eq 1
name="MarketWeft-android-$version-$abi-debug.apk"
mkdir -p reports
cp "${packages[0]}" "reports/$name"
printf 'Staged %s for Android emulator verification.\n' "$name"
