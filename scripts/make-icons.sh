#!/usr/bin/env bash
# Generate PWA icons from assets/*.svg with ImageMagick 7 (`magick`).
# Usage: scripts/make-icons.sh   (run from anywhere; writes public/icons/)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/assets/icon.svg"
SRC_MASKABLE="$ROOT/assets/icon-maskable.svg"
OUT="$ROOT/public/icons"
PLUM="#7a2e4f"

command -v magick >/dev/null || { echo "make-icons: ImageMagick 7 'magick' not found" >&2; exit 1; }
mkdir -p "$OUT"

# Render the SVG at high density, then downscale for crisp edges.
# -strip and excluded date chunks keep the output byte-stable between runs.
render() { # <svg> <size> <out> [extra args...]
  local svg="$1" size="$2" out="$3"
  shift 3
  magick -background none -density 384 "$svg" -resize "${size}x${size}" "$@" \
    -strip -define png:exclude-chunks=date,time "$out"
}

render "$SRC" 192 "$OUT/icon-192.png"
render "$SRC" 512 "$OUT/icon-512.png"
render "$SRC" 32 "$OUT/favicon-32.png"
render "$SRC_MASKABLE" 512 "$OUT/icon-maskable-512.png" -background "$PLUM" -alpha remove -alpha off
# iOS applies its own corner mask and renders transparency as black: flatten onto plum, no alpha.
render "$SRC" 180 "$OUT/apple-touch-icon-180.png" -background "$PLUM" -alpha remove -alpha off

for f in icon-192 icon-512 icon-maskable-512 apple-touch-icon-180 favicon-32; do
  magick identify -format "%f %wx%h %[channels]\n" "$OUT/$f.png"
done
