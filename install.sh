#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "==> PlotDigitizer install"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: '$1' is required but not installed." >&2
    exit 1
  fi
}

need_cmd python3
need_cmd npm

echo "==> Backend: Python venv + dependencies"
cd "$ROOT/backend"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
mkdir -p config

echo "==> Frontend: npm dependencies + production build"
cd "$ROOT/frontend"
npm install
npm run build

cd "$ROOT"
mkdir -p .run
chmod +x install.sh start.sh kill.sh 2>/dev/null || true

echo ""
echo "Install complete."
echo "  Start:  ./start.sh"
echo "  Stop:   ./kill.sh"
echo "  App:    http://127.0.0.1:5173"
echo "  API:    http://127.0.0.1:8000/docs"
