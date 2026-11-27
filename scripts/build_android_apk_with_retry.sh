#!/usr/bin/env bash
set -euo pipefail

target=$1
log=$(mktemp)
trap 'rm -f -- "$log"' EXIT

for attempt in 1 2 3; do
    if CARGO_NET_OFFLINE=true npm run tauri -- android build --ci --debug --apk --split-per-abi \
        --target "$target" 2>&1 | tee "$log"; then
        exit 0
    fi
    if [[ "$attempt" == 3 ]] || ! grep -Eq \
        'https://repo\.maven\.apache\.org/maven2/.*Received status code 429' "$log"; then
        exit 1
    fi
    delay=$((20 * attempt))
    printf 'Maven Central returned HTTP 429. Retrying the APK build in %s seconds.\n' "$delay" >&2
    sleep "$delay"
done
