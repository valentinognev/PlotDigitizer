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
  echo "PlotDigitizer appears to be running already. Use ./kill.sh first." >&2
  exit 1
fi

if [[ ! -x "$ROOT/backend/.venv/bin/uvicorn" ]]; then
  echo "Backend not installed. Run ./install.sh first." >&2
  exit 1
fi

if [[ ! -d "$ROOT/frontend/dist" ]]; then
  echo "Frontend not built. Run ./install.sh first." >&2
  exit 1
fi

echo "==> Starting PlotDigitizer (background)"

cd "$ROOT/backend"
nohup .venv/bin/uvicorn app.main:app \
  --host "$BACKEND_HOST" \
  --port "$BACKEND_PORT" \
  >>"$BACKEND_LOG" 2>&1 &
echo $! >"$BACKEND_PID_FILE"

cd "$ROOT/frontend"
nohup npm run preview -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT" \
  >>"$FRONTEND_LOG" 2>&1 &
echo $! >"$FRONTEND_PID_FILE"

sleep 1

if ! is_running "$BACKEND_PID_FILE"; then
  echo "Backend failed to start. See $BACKEND_LOG" >&2
  exit 1
fi

if ! is_running "$FRONTEND_PID_FILE"; then
  echo "Frontend failed to start. See $FRONTEND_LOG" >&2
  "$ROOT/kill.sh" >/dev/null 2>&1 || true
  exit 1
fi

echo "PlotDigitizer started."
echo "  App:    http://${FRONTEND_HOST}:${FRONTEND_PORT}"
echo "  API:    http://${BACKEND_HOST}:${BACKEND_PORT}/docs"
echo "  Logs:   $RUN_DIR/"
echo "  Stop:   ./kill.sh"
