#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT/.run"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"
BACKEND_LOG="$RUN_DIR/backend.log"
FRONTEND_LOG="$RUN_DIR/frontend.log"

BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
PORT_TRIES="${PORT_TRIES:-50}"

mkdir -p "$RUN_DIR"

is_running() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    rm -f "$pid_file"
  fi
  return 1
}

if is_running "$BACKEND_PID_FILE" || is_running "$FRONTEND_PID_FILE"; then
  echo "==> Already running; stopping it first"
  "$ROOT/kill.sh"
fi

if [[ ! -x "$ROOT/backend/.venv/bin/uvicorn" ]]; then
  echo "Backend not installed. Run ./install.sh first." >&2
  exit 1
fi

if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  echo "Frontend not installed. Run ./install.sh first." >&2
  exit 1
fi

needs_frontend_build=0
if [[ ! -f "$ROOT/frontend/dist/index.html" ]]; then
  needs_frontend_build=1
elif find "$ROOT/frontend/src" -newer "$ROOT/frontend/dist/index.html" -print -quit | grep -q .; then
  needs_frontend_build=1
fi

if [[ "$needs_frontend_build" -eq 1 ]]; then
  echo "==> Rebuilding frontend (sources changed)"
  (cd "$ROOT/frontend" && npm run build)
fi

# True if anything is listening on TCP $2 (host $1 is used for /dev/tcp fallback).
port_occupied() {
  local host="$1"
  local port="$2"
  if command -v ss >/dev/null 2>&1; then
    [[ -n "$(ss -ltnH "sport = :${port}" 2>/dev/null)" ]]
    return $?
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  timeout 0.2 bash -c "echo >/dev/tcp/${host}/${port}" >/dev/null 2>&1
}

# Print the first free port at or above $2. Checks each candidate; never reuses $3.
pick_free_port() {
  local host="$1"
  local port="$2"
  local avoid="${3:-}"
  local i
  for ((i = 0; i < PORT_TRIES; i++)); do
    if [[ -n "$avoid" && "$port" -eq "$avoid" ]]; then
      echo "==> Port ${port} already chosen for the other process, trying $((port + 1))" >&2
      port=$((port + 1))
      continue
    fi
    if port_occupied "$host" "$port"; then
      echo "==> Port ${port} is in use, trying $((port + 1))" >&2
      port=$((port + 1))
      continue
    fi
    echo "$port"
    return 0
  done
  echo "No free TCP port found after ${PORT_TRIES} tries (started at $2)." >&2
  return 1
}

BACKEND_PORT="$(pick_free_port "$BACKEND_HOST" "$BACKEND_PORT")"
FRONTEND_PORT="$(pick_free_port "$FRONTEND_HOST" "$FRONTEND_PORT" "$BACKEND_PORT")"
echo "$BACKEND_PORT" >"$RUN_DIR/backend.port"
echo "$FRONTEND_PORT" >"$RUN_DIR/frontend.port"

echo "==> Starting PlotDigitizer (background)"

cd "$ROOT/backend"
nohup .venv/bin/uvicorn app.main:app \
  --host "$BACKEND_HOST" \
  --port "$BACKEND_PORT" \
  >>"$BACKEND_LOG" 2>&1 &
echo $! >"$BACKEND_PID_FILE"

cd "$ROOT/frontend"
export PLOT_API_ORIGIN="http://${BACKEND_HOST}:${BACKEND_PORT}"
nohup npm run preview -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT" --strictPort \
  >>"$FRONTEND_LOG" 2>&1 &
echo $! >"$FRONTEND_PID_FILE"

if ! is_running "$BACKEND_PID_FILE"; then
  echo "Backend failed to start. See $BACKEND_LOG" >&2
  exit 1
fi

if ! is_running "$FRONTEND_PID_FILE"; then
  echo "Frontend failed to start. See $FRONTEND_LOG" >&2
  "$ROOT/kill.sh" >/dev/null 2>&1 || true
  exit 1
fi

echo "==> Waiting for backend"
for _ in $(seq 1 40); do
  if curl -sf "http://${BACKEND_HOST}:${BACKEND_PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done
if ! curl -sf "http://${BACKEND_HOST}:${BACKEND_PORT}/health" >/dev/null 2>&1; then
  echo "Backend did not become healthy. See $BACKEND_LOG" >&2
  exit 1
fi

echo "PlotDigitizer started."
echo "  App:    http://${FRONTEND_HOST}:${FRONTEND_PORT}"
echo "  API:    http://${BACKEND_HOST}:${BACKEND_PORT}/docs"
echo "  Logs:   $RUN_DIR/"
echo "  Stop:   ./kill.sh"
