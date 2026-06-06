#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT/.run"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"

stop_pid_file() {
  local name="$1"
  local pid_file="$2"
  if [[ ! -f "$pid_file" ]]; then
    echo "  $name: not running (no pid file)"
    return 0
  fi

  local pid
  pid="$(cat "$pid_file")"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 10); do
      if ! kill -0 "$pid" 2>/dev/null; then
        break
      fi
      sleep 0.2
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
    echo "  $name: stopped (pid $pid)"
  else
    echo "  $name: stale pid file removed"
  fi
  rm -f "$pid_file"
}

echo "==> Stopping PlotDigitizer"
stop_pid_file "Backend" "$BACKEND_PID_FILE"
stop_pid_file "Frontend" "$FRONTEND_PID_FILE"

# Clean up child processes (e.g. vite/node spawned by npm)
if command -v pkill >/dev/null 2>&1; then
  pkill -f "uvicorn app.main:app.*--port ${BACKEND_PORT:-8000}" 2>/dev/null || true
  pkill -f "vite preview.*--port ${FRONTEND_PORT:-5173}" 2>/dev/null || true
fi

echo "Done."
