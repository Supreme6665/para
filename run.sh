#!/usr/bin/env bash
# Serve the app on localhost so localStorage works in every browser.
set -euo pipefail

cd "$(dirname "$0")"

START_PORT="${PORT:-8000}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to serve the app. You can also open index.html directly." >&2
  exit 1
fi

PORT="$(python3 - "$START_PORT" <<'PY'
import socket
import sys

start = int(sys.argv[1])
for port in range(start, start + 25):
    sock = socket.socket()
    try:
        sock.bind(("127.0.0.1", port))
    except OSError:
        sock.close()
        continue
    sock.close()
    print(port)
    break
PY
)"

if [ -z "${PORT}" ]; then
  echo "No free port found near ${START_PORT}." >&2
  exit 1
fi

URL="http://127.0.0.1:${PORT}/"

echo "Peridot is running at ${URL}"
echo "Press Ctrl+C to stop."

if [ -z "${NO_OPEN:-}" ]; then
  if [ "$(uname -s)" = "Darwin" ] && command -v open >/dev/null 2>&1; then
    ( sleep 0.8; open "${URL}" >/dev/null 2>&1 || true ) &
  elif command -v xdg-open >/dev/null 2>&1 &&
       { [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; }; then
    ( sleep 0.8; xdg-open "${URL}" >/dev/null 2>&1 || true ) &
  fi
fi

exec python3 -m http.server "${PORT}" --bind 127.0.0.1
