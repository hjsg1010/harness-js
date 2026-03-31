#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "Hybrid Harness requires Node.js 20+." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Hybrid Harness requires npm." >&2
  exit 1
fi

if [ ! -d "${ROOT_DIR}/node_modules" ]; then
  echo "Installing Hybrid Harness dependencies..." >&2
  (cd "${ROOT_DIR}" && npm install)
fi

if [ ! -f "${ROOT_DIR}/dist/cli.js" ]; then
  echo "Building Hybrid Harness CLI..." >&2
  (cd "${ROOT_DIR}" && npm run build)
fi

exec node "${ROOT_DIR}/dist/cli.js" "$@"
