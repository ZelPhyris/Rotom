#!/usr/bin/env bash
# Publish the static site to the nginx web root.
# Run after the one-time setup in deploy/README.md (which makes WEBROOT yours,
# so this needs no sudo). Safe to run on every content/counts update.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEBROOT="/var/www/rotom-pogo"

# Copy every site file (.html/.css/.js/.json/.geojson), skipping docs like README.md.
shopt -s nullglob
for f in "$REPO"/app/*.html "$REPO"/app/*.css "$REPO"/app/*.js "$REPO"/app/*.json "$REPO"/app/*.geojson; do
  cp "$f" "$WEBROOT/$(basename "$f")"
done

echo "Published $REPO/app -> $WEBROOT"
