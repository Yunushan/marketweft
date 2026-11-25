#!/bin/sh
# After building the frontend and the native Linux wrapper:
# sh apps/desktop/tests/smoke-x11.sh apps/desktop/target/debug/marketweft-desktop
# Requires Xvfb, xauth, dbus-run-session, xdotool, timeout and Python 3 with pyatspi.
set -eu

if [ "${1:-}" != --display-ready ]; then
    if [ "$#" -ne 1 ] || [ ! -x "$1" ]; then
        echo "Usage: sh smoke-x11.sh PATH_TO_COMPILED_MARKETWEFT_DESKTOP" >&2
        exit 2
    fi
    exec xvfb-run -a -s '-screen 0 1600x1000x24' dbus-run-session -- sh "$0" --display-ready "$1"
fi

binary=$2
test_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
scratch=$(mktemp -d)
export XDG_CONFIG_HOME="$scratch/config" XDG_DATA_HOME="$scratch/data" XDG_CACHE_HOME="$scratch/cache"
export XDG_RUNTIME_DIR="$scratch/runtime" GDK_BACKEND=x11 NO_AT_BRIDGE=0 GTK_MODULES=gail:atk-bridge
export WEBKIT_DISABLE_DMABUF_RENDERER=1
mkdir -m 700 "$XDG_RUNTIME_DIR"
"$binary" >"$scratch/app.log" 2>&1 &
app=$!
cleanup() {
    kill "$app" 2>/dev/null || true
    wait "$app" 2>/dev/null || true
    cat "$scratch/app.log" >&2
    rm -rf -- "$scratch"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

window=$(timeout 30 xdotool search --sync --onlyvisible --name '^MarketWeft$' | head -n 1)
test -n "$window" || { echo 'Timed out waiting for the MarketWeft window.' >&2; exit 1; }
xdotool getwindowname "$window"
xdotool getwindowgeometry "$window"
timeout 55 python3 "$test_dir/check_window.py"
kill -0 "$app"
echo 'Verified the native window, chart, watchlist, and import controls.'
