#!/usr/bin/env bash
# Shared helpers: provision a THROWAWAY Postgres database + run the real, unmodified Arc TV backend against it.
# Sourced by run-backend-integration.sh and run-e2e.sh. Never touches a real database or the source repository.
#
#   MANGOTV_BACKEND_DIR   path to a checkout of ArcTV-AndroidTV (default: clone it into .backend-under-test)
#   MANGOTV_BACKEND_REPO  git URL to clone           (default: https://github.com/MikeC444/ArcTV-AndroidTV)
#   MANGOTV_BACKEND_REF   git ref to test against    (default: 924d366 — the commit this port was built against)
#   TEST_DATABASE_URL     a DISPOSABLE database; its name must contain "test" or end in "_it".
#                         Default (Debian/Ubuntu boxes / this sandbox, when run as root): the local Postgres cluster is started and a
#                         throwaway role + database (arctv_web_it) is created with a random per-run password.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$ROOT/.backend-under-test"
REPO="${MANGOTV_BACKEND_REPO:-https://github.com/MikeC444/ArcTV-AndroidTV}"
REF="${MANGOTV_BACKEND_REF:-924d366}"
BACKEND_PORT="${BACKEND_PORT:-3199}"
BACKEND_PID=""

provision_database() {
  if [[ -z "${TEST_DATABASE_URL:-}" ]]; then
    if command -v pg_ctlcluster >/dev/null 2>&1 && [[ "$(id -u)" == "0" ]]; then
      pg_ctlcluster "$(ls /etc/postgresql | head -1)" main start 2>/dev/null || true
      for _ in $(seq 1 20); do su postgres -c "pg_isready -q" && break; sleep 0.5; done
      # a fresh random password every run — no credential is stored in this repository, even for the throwaway role
      local pw
      pw="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"
      su postgres -c "psql -q -v ON_ERROR_STOP=1" <<SQL
DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'arctv_test') THEN CREATE ROLE arctv_test LOGIN; END IF; END \$\$;
ALTER ROLE arctv_test PASSWORD '$pw';
SQL
      su postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='arctv_web_it'\" | grep -q 1 || createdb -O arctv_test arctv_web_it"
      export TEST_DATABASE_URL="postgresql://arctv_test:$pw@localhost:5432/arctv_web_it"
    else
      echo "Set TEST_DATABASE_URL to a disposable Postgres database (name containing 'test' or ending in '_it')." >&2
      return 2
    fi
  fi
  local name
  name="$(node -e "console.log(new URL(process.env.TEST_DATABASE_URL).pathname.slice(1))")"
  if ! [[ "$name" =~ test || "$name" =~ _it$ ]]; then
    echo "Refusing to run: database '$name' does not look disposable." >&2
    return 2
  fi
}

fetch_backend() {
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
  (cd "$WORK/server" && { [[ -d node_modules ]] || npm ci --no-audit --no-fund >/dev/null; })
}

# Fails fast if something already listens on the port (a stale server would otherwise answer the health check and hide a failed start).
require_port_free() {
  local port="$1" name="$2"
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    echo "Port $port ($name) is already in use — stop whatever is listening (bash scripts/e2e-stack.sh down) or choose another port." >&2
    return 1
  fi
}

start_backend() {
  if curl -fsS "http://localhost:$BACKEND_PORT/health" >/dev/null 2>&1; then
    echo "Port $BACKEND_PORT is already serving something — stop it first (or set BACKEND_PORT)." >&2
    return 1
  fi
  provision_database || return $?
  fetch_backend
  # its own process group (setsid), so stop_backend can signal npx → tsx → node in one go
  setsid bash -c '
    cd "$1"
    export DATABASE_URL="$2" API_BASE_URL="http://localhost:$3" NODE_ENV=test PORT="$3"
    npm run --silent migrate
    exec npx tsx src/index.ts >"$4" 2>&1
  ' _ "$WORK/server" "$TEST_DATABASE_URL" "$BACKEND_PORT" "$WORK/backend.log" &
  BACKEND_PID=$!
  for _ in $(seq 1 80); do
    curl -fsS "http://localhost:$BACKEND_PORT/health" >/dev/null 2>&1 && break
    sleep 0.5
  done
  curl -fsS "http://localhost:$BACKEND_PORT/health" >/dev/null || { echo "backend failed to start:"; tail -30 "$WORK/backend.log"; return 1; }
  echo "» backend up on :$BACKEND_PORT (throwaway database)"
}

stop_backend() {
  if [[ -n "$BACKEND_PID" ]]; then kill -TERM -- "-$BACKEND_PID" 2>/dev/null || true; fi
  return 0
}
