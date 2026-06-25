#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

cat <<'BANNER'
============================================================
  The Grow Calendar - LOCAL launcher

  This serves the EXACT deployed build and connects to the
  REAL production database. Any change you make here (when
  logged into your account) changes live data permanently.
  There is no undo. Press Ctrl+C to stop.
============================================================
BANNER
echo ""

# ── Node version check ────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js is not installed or not found in PATH."
  echo "Download the latest LTS from https://nodejs.org"
  exit 1
fi

NODE_MAJOR=$(node -e "console.log(parseInt(process.version.slice(1)))")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "ERROR: Node 18 or higher is required. You are on $(node --version)."
  echo "Download the latest LTS from https://nodejs.org"
  exit 1
fi

# ── Dependencies ──────────────────────────────────────────────────────────────
if [ ! -d node_modules ]; then
  echo "node_modules not found. Running npm install..."
  npm install || { echo "npm install failed."; exit 1; }
fi

# ── Cloudflare auth ───────────────────────────────────────────────────────────
# --remote talks to your real Cloudflare account, so you must be logged in.
echo "Checking Cloudflare login..."
if npx wrangler whoami 2>&1 | grep -qi "not authenticated"; then
  echo "You are not logged in to Cloudflare. Opening the login flow..."
  npx wrangler login || { echo "Cloudflare login failed or was cancelled."; exit 1; }
fi

# ── Build the deployed bundle ─────────────────────────────────────────────────
echo ""
echo "Building the production bundle (same as deploy)..."
npm run build || { echo "Build failed."; exit 1; }

# ── Open the browser once the Worker has had a moment to boot ──────────────────
open_url() {
  local url="$1"
  if command -v wslview &>/dev/null; then
    wslview "$url"
  elif grep -qiE "microsoft|wsl" /proc/version 2>/dev/null; then
    explorer.exe "$url" 2>/dev/null || cmd.exe /c start "" "$url" 2>/dev/null || true
  elif command -v xdg-open &>/dev/null; then
    xdg-open "$url"
  elif command -v open &>/dev/null; then
    open "$url"
  else
    echo "Open your browser to $url"
  fi
}
( sleep 8; open_url "http://localhost:8787" ) &

# ── Run the Worker against the REMOTE (production) database ────────────────────
echo ""
echo "Starting the Worker against the PRODUCTION database..."
echo "The app will open at http://localhost:8787"
echo "Press Ctrl+C to stop."
echo ""
npx wrangler dev --remote
