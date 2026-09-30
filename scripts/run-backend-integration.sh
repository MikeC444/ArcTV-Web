#!/usr/bin/env bash
# Runs the web server's integration tests against the REAL, UNMODIFIED MangoTV
# backend (from the Firestick repository) on a THROWAWAY Postgres database with
# all of the backend's real migrations applied.
#
#   MANGOTV_BACKEND_DIR   path to a checkout of MangoTV-Live-TV (default: clone it into .backend-under-test)
#   MANGOTV_BACKEND_REPO  git URL to clone           (default: https://github.com/MikeC444/MangoTV-Live-TV)
#   MANGOTV_BACKEND_REF   git ref to test against    (default: 924d366 — the commit this port was built against)
#   TEST_DATABASE_URL     a DISPOSABLE database; its name must contain "test" or end in "_it".
#                         Default (Linux dev boxes / this sandbox): a local Postgres cluster is started
#                         and postgresql://mangotv_test:mangotv_test@localhost:5432/mangotv_web_it is created.
#
# This script never touches the source repository (it copies `server/` into
# .backend-under-test/, which is git-ignored) and never touches a real database.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$ROOT/.backend-under-test"
REPO="${MANGOTV_BACKEND_REPO:-https://github.com/MikeC444/MangoTV-Live-TV}"
REF="${MANGOTV_BACKEND_REF:-924d366}"
PORT="${BACKEND_PORT:-3199}"

if [[ -z "${TEST_DATABASE_URL:-}" ]]; then
  if command -v pg_ctlcluster >/dev/null 2>&1 && [[ "$(id -u)" == "0" ]]; then
    pg_ctlcluster "$(ls /etc/postgresql | head -1)" main start 2>/dev/null || true
    for _ in $(seq 1 20); do su postgres -c "pg_isready -q" && break; sleep 0.5; done
    su postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='mangotv_test'\" | grep -q 1 || psql -c \"CREATE ROLE mangotv_test LOGIN PASSWORD 'mangotv_test'\"" >/dev/null
    su postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='mangotv_web_it'\" | grep -q 1 || psql -c \"CREATE DATABASE mangotv_web_it OWNER mangotv_test\"" >/dev/null
    export TEST_DATABASE_URL="postgresql://mangotv_test:mangotv_test@localhost:5432/mangotv_web_it"
  else
    echo "Set TEST_DATABASE_URL to a disposable Postgres database (name containing 'test' or ending in '_it')." >&2
    exit 2
  fi
fi

DB_NAME="$(node -e "console.log(new URL(process.env.TEST_DATABASE_URL).pathname.slice(1))")"
if ! [[ "$DB_NAME" =~ test || "$DB_NAME" =~ _it$ ]]; then
  echo "Refusing to run: database '$DB_NAME' does not look disposable." >&2
  exit 2
fi

mkdir -p "$WORK"
if [[ -n "${MANGOTV_BACKEND_DIR:-}" ]]; then
  echo "» copying backend from $MANGOTV_BACKEND_DIR"
  rm -rf "$WORK/server"
  (cd "$MANGOTV_BACKEND_DIR" && tar --exclude=node_modules --exclude=.git --exclude=dist --exclude='.env*' -cf - server) | tar -xf - -C "$WORK"
else
  echo "» cloning $REPO @ $REF"
  rm -rf "$WORK/src-clone" "$WORK/server"
  git clone --quiet "$REPO" "$WORK/src-clone"
  git -C "$WORK/src-clone" checkout --quiet "$REF"
  mv "$WORK/src-clone/server" "$WORK/server"
  rm -rf "$WORK/src-clone"
fi

cd "$WORK/server"
[[ -d node_modules ]] || npm ci --no-audit --no-fund >/dev/null
export DATABASE_URL="$TEST_DATABASE_URL"
export API_BASE_URL="http://localhost:$PORT"
export NODE_ENV=test
export PORT
npm run --silent migrate

npx tsx src/index.ts >"$WORK/backend.log" 2>&1 &
BACKEND_PID=$!
trap 'kill $BACKEND_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do
  curl -fsS "http://localhost:$PORT/health" >/dev/null 2>&1 && break
  sleep 0.5
done
curl -fsS "http://localhost:$PORT/health" >/dev/null || { echo "backend failed to start:"; tail -30 "$WORK/backend.log"; exit 1; }
echo "» backend up on :$PORT — running integration tests"

cd "$ROOT/server"
MANGOTV_BACKEND_URL="http://localhost:$PORT" npx vitest run tests/integration
