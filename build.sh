#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
OUT="$ROOT/dist"
VERSION_URL=${VYLK_VERSION_URL:-https://raw.githubusercontent.com/toxdes/vylk/main/VERSION}

if [ -n "${VYLK_VERSION:-}" ]; then
  VERSION=$VYLK_VERSION
else
  CACHE_BUSTER=$(date +%s)
  case "$VERSION_URL" in
    *\?*) VERSION_URL="${VERSION_URL}&build=${CACHE_BUSTER}" ;;
    *) VERSION_URL="${VERSION_URL}?build=${CACHE_BUSTER}" ;;
  esac
  VERSION=$(curl -fsSL --retry 3 --connect-timeout 10 "$VERSION_URL" | tr -d '[:space:]')
fi

case "$VERSION" in
  ''|*[!A-Za-z0-9.+_~-]*)
    echo "Invalid VYLK version: $VERSION" >&2
    exit 1
    ;;
esac

rm -rf "$OUT"
mkdir -p "$OUT"

for file in "$ROOT"/index.html "$ROOT"/*.css "$ROOT"/*.js; do
  [ -f "$file" ] && cp "$file" "$OUT/"
done
cp -R "$ROOT/assets" "$ROOT/docs" "$OUT/"
printf 'window.VYLK_VERSION = "%s";\n' "$VERSION" > "$OUT/version.js"
find "$OUT" -type f \( -name '*.html' -o -name '*.js' \) -exec sed -i "s/__VYLK_VERSION__/$VERSION/g" {} +

echo "Prepared VYLK lander for $VERSION"
