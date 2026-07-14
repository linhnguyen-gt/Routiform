#!/usr/bin/env bash
#
# Build Open WebUI's SvelteKit frontend into a static SPA and install it at public/owui.
#
# The output is a BUILD ARTIFACT (~66MB) and is gitignored — regenerate it with this script
# rather than committing it. The SOURCE (`open-webui/`) IS committed: it carries our patches and
# the chat cannot be built without it.
#
# **Every build of Routiform must run this**, including the Docker image. Skip it and the app
# boots perfectly with no chat at all: /owui 404s and /dashboard/chat redirects into that 404.
#
# The vendored source carries patches marked ROUTIFORM PATCH; if you re-clone upstream, reapply
# them (see plans/260714-0952-embed-open-webui-spa/plan.md).
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/open-webui"
DEST="$ROOT/public/owui"

if [ ! -d "$SRC" ]; then
  echo "error: $SRC not found. It is a gitignored vendored checkout of open-webui." >&2
  exit 1
fi

cd "$SRC"

if [ ! -d node_modules ]; then
  # Upstream pins node <=22 via engine-strict; the build itself is fine on newer runtimes.
  echo "==> installing open-webui frontend deps"
  npm install --engine-strict=false --no-audit --no-fund
fi

echo "==> building static SPA"
# `npm run build` also runs pyodide:fetch, which pulls a Python runtime we do not ship.
npx vite build --sourcemap false

echo "==> rebasing /static/ references onto /owui"
# app.html hardcodes /static/favicon.png, /static/loader.js, /static/custom.css … at the SITE
# ROOT. Routiform serves the SPA from /owui, so every one of those 404s.
#
# This is done HERE and not in the Vite plugin's transformIndexHtml on purpose: with
# adapter-static the page is emitted by SvelteKit's prerenderer, which never goes through
# Vite's HTML transform — the hook simply does not fire, and the plugin looked like it was
# working because it does rewrite the JS.
#
# Fails loudly if it matches nothing: silence here means the SPA boots with a broken icon, a
# missing loader and no custom.css, and nobody notices until a user does.
# Rewrites EVERY /static/ occurrence, not just href=/src= attributes: app.html also names
# /static/splash.png from inline script, which an attribute-only rule silently misses.
# Safe as a blind global replace because the fresh build output never contains /owui/static/.
if ! grep -rq '/static/' build/*.html; then
  echo "ERROR: no /static/ references found in build/*.html — upstream changed app.html." >&2
  exit 1
fi
# NOT `sed -i` — its in-place syntax is incompatible between BSD (macOS, needs `-i ''`) and GNU
# (Linux/Docker, where `-i ''` makes '' the SCRIPT and the real script a FILENAME). Writing to a
# temp file and moving it works identically on both. This script runs in the Docker build.
for html in build/*.html; do
  sed 's#/static/#/owui/static/#g' "$html" > "$html.tmp" && mv "$html.tmp" "$html"
done

echo "==> pruning what we do not ship"
# onnxruntime + Kokoro are the in-browser TTS stack (~72MB of wasm). Routiform does not
# expose read-aloud, and these are lazily fetched, so dropping them costs nothing at runtime.
find build \( -name 'ort-wasm*' -o -name '*kokoro*' -o -name '*.map' \) -delete 2>/dev/null || true

echo "==> installing to public/owui"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R build/. "$DEST/"

echo "done: $(du -sh "$DEST" | cut -f1) at public/owui"
