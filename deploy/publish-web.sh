#!/usr/bin/env bash
# Build the React site and publish it to the nginx web root.
# Run after the one-time setup in deploy/README.md (which makes WEBROOT yours).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEBROOT="/var/www/rotom-pogo"

echo "Building web/ ..."
cd "$REPO/web"
npm install --no-audit --no-fund
npm run build

echo "Publishing dist/ -> $WEBROOT"
# Replace the previous build, but keep runtime data files (counts.json, etc.).
find "$WEBROOT/assets" -mindepth 1 -delete 2>/dev/null || true
cp -r "$REPO"/web/dist/. "$WEBROOT"/

echo "Done. React site published to $WEBROOT"
