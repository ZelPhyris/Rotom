#!/usr/bin/env bash
# Publish the static map to the nginx web root.
# Run after the one-time setup in deploy/README.md (which makes WEBROOT yours,
# so this needs no sudo). Safe to run on every counts.json update.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEBROOT="/var/www/rotom-pogo"

# Only the files the site actually needs (CNAME/README.md are GitHub-Pages-only).
for f in index.html style.css app.js counts.json sectors.geojson; do
  cp "$REPO/app/$f" "$WEBROOT/$f"
done

echo "Published $REPO/app -> $WEBROOT"
