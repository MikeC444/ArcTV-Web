#!/usr/bin/env bash
# Full-stack browser tests: real Arc TV backend (throwaway Postgres) + the web server serving the built SPA +
# a local Stremio-protocol fixture addon, driven by Playwright/Chromium.
#   bash scripts/run-e2e.sh                      # all projects
#   bash scripts/run-e2e.sh --project=desktop-1920 auth.spec
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/test-backend.sh"
WEB_PORT="${WEB_PORT:-8090}"
ADDON_PORT="${ADDON_PORT:-7000}"
PIDS=()
cleanup() {
  for pid in "${PIDS[@]:-}"; do [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true; done
  stop_backend
}
trap cleanup EXIT

require_port_free "$WEB_PORT" "web server"
require_port_free "$ADDON_PORT" "fixture addon"
start_backend

echo "» building the web app"
(cd "$ROOT" && npm run build --workspace client >/dev/null)

echo "» starting fixture addon :$ADDON_PORT"
ADDON_PORT="$ADDON_PORT" node "$ROOT/e2e/fixtures/fake-addon.mjs" >"$WORK/addon.log" 2>&1 &
PIDS+=($!)

echo "» starting web server :$WEB_PORT"
(cd "$ROOT/server" && \
  MANGOTV_API_URL="http://localhost:$BACKEND_PORT" SESSION_SECRET="$(head -c 32 /dev/urandom | base64)" PORT="$WEB_PORT" NODE_ENV=development \
  TRUST_PROXY=1 ALLOW_PRIVATE_ADDON_HOSTS=1 STATIC_DIR="$ROOT/client/dist" exec node --import tsx src/index.ts) >"$WORK/web.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 60); do curl -fsS "http://127.0.0.1:$WEB_PORT/api/health" >/dev/null 2>&1 && break; sleep 0.5; done
curl -fsS "http://127.0.0.1:$WEB_PORT/api/health" >/dev/null || { echo "web server failed to start"; tail -20 "$WORK/web.log"; exit 1; }
for _ in $(seq 1 40); do curl -fsS "http://127.0.0.1:$ADDON_PORT/manifest.json" >/dev/null 2>&1 && break; sleep 0.25; done

echo "» running Playwright"
cd "$ROOT"
MANGOTV_BACKEND_URL="http://localhost:$BACKEND_PORT" WEB_URL="http://127.0.0.1:$WEB_PORT" ADDON_URL="http://127.0.0.1:$ADDON_PORT" \
  npx playwright test -c e2e/playwright.config.ts "$@"
