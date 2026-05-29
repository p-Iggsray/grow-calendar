#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

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

# ── Local database ────────────────────────────────────────────────────────────
echo ""
echo "Ensuring local database tables exist..."
npx wrangler d1 execute grow-calendar-db --local --file=./schema.sql >/dev/null 2>&1

# ── Worker (background) ───────────────────────────────────────────────────────
echo ""
echo "Starting the Cloudflare Worker in the background (API + local database)..."
npx wrangler dev &
WORKER_PID=$!

# Kill the Worker automatically when this script exits (Ctrl+C or normal exit)
trap 'kill "$WORKER_PID" 2>/dev/null; echo ""; echo "Worker stopped."' EXIT

echo "Giving the Worker a few seconds to start..."
sleep 6

# ── Vite dev server ───────────────────────────────────────────────────────────
echo ""
echo "Starting the Vite dev server."
echo "  App:    http://localhost:5173"
echo "  Worker: http://localhost:8787"
echo "Press Ctrl+C to stop everything."
echo ""
npm run dev
