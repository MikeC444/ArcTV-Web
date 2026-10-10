#!/usr/bin/env bash
# Runs the web server's integration tests against the REAL, UNMODIFIED Arc TV backend (from the Firestick repository)
# on a THROWAWAY Postgres database with all of the backend's real migrations applied. See scripts/lib/test-backend.sh.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/test-backend.sh"
trap stop_backend EXIT
start_backend
echo "» running integration tests"
cd "$ROOT/server"
MANGOTV_BACKEND_URL="http://localhost:$BACKEND_PORT" npx vitest run tests/integration
