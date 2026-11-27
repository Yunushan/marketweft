#!/usr/bin/env bash
set -euo pipefail

test "$(uname -m)" = arm64
repository=$(git rev-parse --show-toplevel)
version=$(node -p 'require("./package.json").version')
identifier=$(node -p 'require("./apps/desktop/tauri.conf.json").identifier')
test -z "$(node -p 'require("./apps/desktop/tauri.conf.json").build.devUrl ?? ""')"
test -s apps/terminal/dist/index.html
test "$(npm run --silent tauri -- --version)" = 'tauri-cli 2.12.6'
runtime=com.apple.CoreSimulator.SimRuntime.iOS-18-5
xcrun simctl list runtimes --json |
    jq -e --arg runtime "$runtime" 'any(.runtimes[]; .identifier == $runtime and .isAvailable)' >/dev/null

export TAURI_APP_PATH="$repository/apps/desktop"
export TAURI_FRONTEND_PATH="$repository"
rustup target add aarch64-apple-ios-sim
cargo fetch --locked --target aarch64-apple-ios-sim --manifest-path apps/desktop/Cargo.toml
npm run tauri -- ios init --ci --skip-targets-install
CARGO_NET_OFFLINE=true npm run tauri -- ios build --ci --debug --target aarch64-sim --no-sign
git diff --exit-code -- apps/desktop/Cargo.lock

app=$(find apps/desktop/gen/apple -type d -name MarketWeft.app -print -prune)
test -d "$app"
info="$app/Info.plist"
test "$(plutil -extract CFBundleIdentifier raw -o - "$info")" = "$identifier"
test "$(plutil -extract CFBundleShortVersionString raw -o - "$info")" = "$version"
test "$(plutil -extract CFBundleSupportedPlatforms.0 raw -o - "$info")" = iPhoneSimulator
binary=$(plutil -extract CFBundleExecutable raw -o - "$info")
test "$(xcrun lipo -archs "$app/$binary")" = arm64
xcrun vtool -show-build "$app/$binary" | grep -E '^[[:space:]]*platform IOSSIMULATOR$'
python3 -B scripts/stage_native_application_notices.py "$app/MarketWeftNotices" aarch64-apple-ios-sim

work=$(mktemp -d)
phone=
tablet=
trap '
    for device in "$phone" "$tablet"; do
        if [[ -n "$device" ]]; then
            xcrun simctl shutdown "$device" >/dev/null 2>&1 || true
            xcrun simctl delete "$device"
        fi
    done
    rm -rf -- "$work"
' EXIT
mkdir -p reports
types=$(xcrun simctl list devicetypes --json)
phone_type=$(jq -er '.devicetypes[] | select(.name == "iPhone 16") | .identifier' <<<"$types")
tablet_type=$(jq -er '.devicetypes[] | select(.name == "iPad (A16)") | .identifier' <<<"$types")
phone=$(xcrun simctl create MarketWeft-iPhone "$phone_type" "$runtime")
tablet=$(xcrun simctl create MarketWeft-iPad "$tablet_type" "$runtime")
ditto apps/desktop/tests/ios-simulator "$work/tests"
xcodegen generate --spec "$work/tests/project.yml"

for family in iphone ipad; do
    if [[ "$family" == iphone ]]; then device="$phone"; else device="$tablet"; fi
    xcrun simctl boot "$device"
    xcrun simctl bootstatus "$device" -b
    xcrun simctl install "$device" "$app"
    installed=$(xcrun simctl get_app_container "$device" "$identifier" app)
    cmp "$app/$binary" "$installed/$binary"
    cmp "$app/MarketWeftNotices/source-revision.txt" "$installed/MarketWeftNotices/source-revision.txt"

    result="$repository/reports/ios-simulator-$family.xcresult"
    xcodebuild -project "$work/tests/MarketWeftSimulatorTests.xcodeproj" -scheme MarketWeftSimulatorTests \
        -destination "platform=iOS Simulator,id=$device" -derivedDataPath "$work/build" \
        -resultBundlePath "$result" -parallel-testing-enabled NO -testLanguage en -testRegion US \
        -only-testing:MarketWeftSimulatorTests/SimulatorStartupTests/testLoadsBundledTerminalAndExactQuote test
    xcrun xcresulttool get test-results summary --path "$result" |
        jq -e '.totalTestCount == 1 and .passedTests == 1' >/dev/null
    xcrun simctl shutdown "$device"
    printf 'Verified the exact MarketWeft bundle on the %s simulator.\n' "$family"
done

archive="MarketWeft-ios-simulator-$version-arm64.zip"
ditto -c -k --keepParent "$app" "reports/$archive"
(cd reports && shasum -a 256 "$archive" >"$archive.sha256")
