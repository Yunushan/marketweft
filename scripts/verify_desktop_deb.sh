#!/bin/sh
# Run on an Ubuntu CI host after building the native release binary.
set -eu
binary=$1
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
trap 'exit 1' HUP INT TERM
architecture=$(dpkg --print-architecture)
version=$(python3 -B -c 'import json; from pathlib import Path; print(json.loads(Path("package.json").read_text())["version"])')
package=$(python3 -B scripts/package_desktop_deb.py "$binary")
copy=$(python3 -B scripts/package_desktop_deb.py "$binary" --output "$scratch/reproducible")
cmp "$package" "$copy"
(cd "$(dirname "$package")" && sha256sum --check "$(basename "$package").sha256")
test "$(dpkg-deb --field "$package" Package)" = marketweft-desktop
test "$(dpkg-deb --field "$package" Version)" = "$version"
test "$(dpkg-deb --field "$package" Architecture)" = "$architecture"
dpkg-deb --field "$package" Depends
dpkg-deb --extract "$package" "$scratch/files"
doc="$scratch/files/usr/share/doc/marketweft-desktop"
test -x "$scratch/files/usr/bin/marketweft-desktop"
test -s "$doc/copyright"
test -s "$doc/cargo-sources.json"
test -s "$doc/web-notices.txt"
test -s "$doc/wasm-notices.txt"
test -s "$doc/rust-library-notices.html"
test -s "$doc/dependencies.cdx.json"
test "$(cat "$doc/source-revision")" = "$(git rev-parse HEAD)"
desktop-file-validate "$scratch/files/usr/share/applications/org.marketweft.terminal.desktop"
if dpkg-query -W -f='${db:Status-Status}' marketweft-desktop 2>/dev/null | grep -qx installed; then
    echo 'The installer check requires a host without a MarketWeft package.' >&2
    exit 1
fi
sudo apt-get install -y --no-install-recommends "$package"
test "$(dpkg-query -W -f='${db:Status-Status}' marketweft-desktop)" = installed
test "$(dpkg-query -W -f='${Version}' marketweft-desktop)" = "$version"
test -z "$(dpkg -V marketweft-desktop)"
PATH="/usr/bin:$PATH" sh apps/desktop/tests/smoke-x11.sh /usr/bin/marketweft-desktop
PATH="/usr/bin:$PATH" xvfb-run -a dbus-run-session -- python3 -B apps/desktop/tests/import_webview.py /usr/bin/marketweft-desktop
printf 'Verified reproducible Ubuntu desktop package %s (%s), installation and WebView import.\n' "$version" "$architecture"
