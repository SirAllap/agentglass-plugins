#!/usr/bin/env bash
# Assembles what Pages publishes: the market site next to plugins.json, which
# stays at the root so its URL never changes. Used by pages.yml and locally.
#
#   scripts/build-site.sh [out-dir]    (default: _site)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="${1:-$root/_site}"
python3 -c "import json,sys;d=json.load(open(sys.argv[1]));assert isinstance(d.get('plugins'),list)" "$root/plugins.json"
rm -rf "$out"
mkdir -p "$out"
cp "$root"/site/*.html "$root"/site/*.css "$root"/site/*.js "$root"/site/*.svg "$out"/
cp "$root/plugins.json" "$out/"
# Pages runs Jekyll unless told not to, and nothing here is a Jekyll site.
touch "$out/.nojekyll"
echo "built $out"
