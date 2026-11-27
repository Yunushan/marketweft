#!/bin/sh
# Use an isolated Ubuntu verification runner. The arguments are the previous and candidate packages.
set -eu
if [ "$#" -ne 2 ]; then
    echo 'Usage: verify_desktop_upgrade.sh PREVIOUS.deb CANDIDATE.deb' >&2
    exit 2
fi
previous=$(realpath "$1")
candidate=$(realpath "$2")
host=$(dpkg --print-architecture)
for package in "$previous" "$candidate"; do
    (cd "$(dirname "$package")" && sha256sum --check "$(basename "$package").sha256")
    test "$(dpkg-deb --field "$package" Package)" = marketweft-desktop
    test "$(dpkg-deb --field "$package" Architecture)" = "$host"
done
old_version=$(dpkg-deb --field "$previous" Version)
new_version=$(dpkg-deb --field "$candidate" Version)
dpkg --compare-versions "$old_version" lt "$new_version"
if dpkg-query -W -f='${db:Status-Status}' marketweft-desktop 2>/dev/null | grep -qx installed; then
    echo 'Use an Ubuntu verification host without an installed MarketWeft package.' >&2
    exit 1
fi

workspace=$(mktemp -d)
trap 'rm -rf -- "$workspace"' EXIT
trap 'exit 1' HUP INT TERM
apt_install() {
    sudo apt-get install -y --no-install-recommends "$1"
    test "$(dpkg-query -W -f='${Version}' marketweft-desktop)" = "$2"
    test -z "$(dpkg -V marketweft-desktop)"
}
webview() {
    PATH="/usr/bin:$PATH" xvfb-run -a dbus-run-session -- python3 -B \
        apps/desktop/tests/import_webview.py /usr/bin/marketweft-desktop \
        --workspace "$workspace" --phase "$1"
}

apt_install "$previous" "$old_version"
webview seed
webview reopen
apt_install "$candidate" "$new_version"
webview reopen
printf 'Verified native Ubuntu %s workspace across upgrade from %s to %s.\n' "$host" "$old_version" "$new_version"
