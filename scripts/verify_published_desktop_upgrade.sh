#!/bin/sh
# Run after the current package passes the fresh-install smoke test on a disposable Ubuntu CI runner.
set -eu
baseline_run=45983565432
baseline_commit=833d0cf35f61eeff396d436cfee874626371ff65
baseline_version=0.160.0
architecture=$(dpkg --print-architecture)
version=$(python3 -B -c 'import json; from pathlib import Path; print(json.loads(Path("package.json").read_text())["version"])')
candidate="reports/marketweft-desktop_${version}_${architecture}.deb"
test -f "$candidate"
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
trap 'exit 1' HUP INT TERM
archive="$scratch/packages"

if python3 -B scripts/download_desktop_baseline.py --run "$baseline_run" --commit "$baseline_commit" \
    --version "$baseline_version" --architecture "$architecture" --output "$archive"; then
    :
else
    status=$?
    test "$status" -eq 42 || exit "$status"
    unset GITHUB_TOKEN
    # Rebuild the already verified commit if GitHub has expired its package archive.
    source="$scratch/source"
    git init "$source"
    git -C "$source" fetch --no-tags --depth 1 https://github.com/Yunushan/marketweft.git "$baseline_commit"
    git -C "$source" checkout --detach FETCH_HEAD
    test "$(git -C "$source" rev-parse HEAD)" = "$baseline_commit"
    (
        cd "$source"
        npm ci
        npm run build
        cargo build --locked --release --manifest-path apps/desktop/Cargo.toml
        python3 -B scripts/package_desktop_deb.py apps/desktop/target/release/marketweft-desktop --output "$archive"
    )
fi

unset GITHUB_TOKEN

test "$(dpkg-query -W -f='${Version}' marketweft-desktop)" = "$version"
sudo apt-get remove -y marketweft-desktop
sh scripts/verify_desktop_upgrade.sh "$archive/marketweft-desktop_${baseline_version}_${architecture}.deb" "$candidate"
