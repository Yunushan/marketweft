#!/usr/bin/env bash
set -euo pipefail

architecture=$1
case "$architecture" in
    x64) machine=x86_64 ;;
    arm64) machine=arm64 ;;
    *) exit 2 ;;
esac
test "$(uname -m)" = "$machine"
repository=$(git rev-parse --show-toplevel)
version=$(node -p 'require("./package.json").version')
archive="MarketWeft-desktop-$version-macos-$architecture.zip"
result="$repository/reports/macos-file-picker-$architecture.xcresult"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

(cd reports && shasum -a 256 -c "$archive.sha256")
ditto -x -k "reports/$archive" "$work"
app="$work/MarketWeft.app"
codesign --verify --deep --strict "$app"
test "$(cat "$app/Contents/Resources/source-revision.txt")" = "$(git rev-parse HEAD)"
test "$(xcrun lipo -archs "$app/Contents/MacOS/marketweft-desktop")" = "$machine"
ditto apps/desktop/tests/fixtures/native-verification.csv "$work/native-verification.csv"

xcodebuild -project apps/desktop/tests/macos-file-picker/FilePicker.xcodeproj -scheme FilePicker \
    -destination "platform=macOS,arch=$machine" -derivedDataPath "$work/build" \
    -resultBundlePath "$result" -parallel-testing-enabled NO \
    -testLanguage en -testRegion US \
    -only-testing:FilePickerTests/FilePickerTests/testImportsAuthorizedCSVThroughNativeOpenPanel \
    "MARKETWEFT_APPLICATION_PATH=$app" "MARKETWEFT_CSV_PATH=$work/native-verification.csv" test

xcrun xcresulttool get test-results summary --path "$result" |
    jq -e '.totalTestCount == 1 and .passedTests == 1' >/dev/null
printf 'Verified native file picker CSV import and exact OHLCV in the production macOS %s application.\n' "$architecture"
