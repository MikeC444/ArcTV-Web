#!/usr/bin/env bash
# Keeps the full test stack (backend + throwaway DB, fixture addon, web server) running so Playwright can be re-run quickly.
#   bash scripts/e2e-stack.sh up      # start (builds the client first)
#   bash scripts/e2e-stack.sh rebuild # rebuild the client + restart only the web server
#   bash scripts/e2e-stack.sh down
#   MANGOTV_BACKEND_URL=http://localhost:3199 WEB_URL=http://127.0.0.1:8090 ADDON_URL=http://127.0.0.1:7000 npx playwright test -c e2e/playwright.config.ts --project=desktop-1920 playback
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/test-backend.sh"
STATE="$WORK/stack.pids"
WEB_PORT="${WEB_PORT:-8090}"
ADDON_PORT="${ADDON_PORT:-7000}"

start_web() {
  # `;` (not `&&`) before the backgrounded command so that $! is the setsid'd server itself — stop_web signals its whole process group
  (cd "$ROOT/server"; setsid env MANGOTV_API_URL="http://localhost:$BACKEND_PORT" SESSION_SECRET="$(head -c 32 /dev/urandom | base64)" PORT="$WEB_PORT" NODE_ENV=development \
    TRUST_PROXY=1 ALLOW_PRIVATE_ADDON_HOSTS=1 STATIC_DIR="$ROOT/client/dist" npx tsx src/index.ts >"$WORK/web.log" 2>&1 </dev/null & echo $! >"$WORK/web.pid")
  for _ in $(seq 1 60); do curl -fsS "http://127.0.0.1:$WEB_PORT/api/health" >/dev/null 2>&1 && break; sleep 0.5; done
  curl -fsS "http://127.0.0.1:$WEB_PORT/api/health" >/dev/null
}
stop_web() { [[ -f "$WORK/web.pid" ]] && { kill -TERM -- "-$(cat "$WORK/web.pid")" 2>/dev/null || true; rm -f "$WORK/web.pid"; }; return 0; }

case "${1:-}" in
  up)
    require_port_free "$WEB_PORT" "web server"
    require_port_free "$ADDON_PORT" "fixture addon"
    start_backend
    echo "$BACKEND_PID" >"$WORK/backend.pid"
    (cd "$ROOT" && npm run build --workspace client >/dev/null)
    (setsid env ADDON_PORT="$ADDON_PORT" node "$ROOT/e2e/fixtures/fake-addon.mjs" >"$WORK/addon.log" 2>&1 </dev/null & echo $! >"$WORK/addon.pid")
    start_web
    echo "stack is up: backend :$BACKEND_PORT, web :$WEB_PORT, addon :$ADDON_PORT"
    ;;
  rebuild)
    stop_web
    sleep 0.5
    require_port_free "$WEB_PORT" "web server (a stale process survived stop_web)"
    (cd "$ROOT" && npm run build --workspace client >/dev/null)
    start_web
    echo "web rebuilt and restarted"
    ;;
  down)
    stop_web
    for f in addon backend; do [[ -f "$WORK/$f.pid" ]] && { kill -TERM -- "-$(cat "$WORK/$f.pid")" 2>/dev/null || true; rm -f "$WORK/$f.pid"; }; done
    echo "stack is down"
    ;;
  *) echo "usage: $0 up|rebuild|down"; exit 2 ;;
esac
