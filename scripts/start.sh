#!/bin/bash
# start.sh — Start Generale server in production mode
# Usage: ./start.sh [--help|--stop|--restart]

set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Load .env if exists
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

export PORT="${PORT:-3000}"
export HOST="${HOST:-0.0.0.0}"
export DB_FILE_NAME="${DB_FILE_NAME:-./data/generale.sqlite}"
export FRONTEND_DIST="${FRONTEND_DIST:-./frontend}"

MIGRATIONS_FOLDER="${MIGRATIONS_FOLDER:-./migrations}"
mkdir -p "$(dirname "$DB_FILE_NAME")"
mkdir -p "$MIGRATIONS_FOLDER"

echo "[generale] Starting server on ${HOST}:${PORT}..."
echo "[generale] DB: $DB_FILE_NAME"
echo "[generale] Frontend: $FRONTEND_DIST"
echo "[generale] Migrations: $MIGRATIONS_FOLDER"
export MIGRATIONS_FOLDER

exec ./server
