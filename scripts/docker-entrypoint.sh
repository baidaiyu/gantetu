#!/usr/bin/env sh
set -eu

mkdir -p /app/data

if [ ! -f /app/data/app.sqlite ] && [ -f /app/seed-data/app.sqlite ]; then
  cp /app/seed-data/app.sqlite /app/data/app.sqlite
fi

if [ ! -f /app/data/db.json ] && [ -f /app/seed-data/db.json ]; then
  cp /app/seed-data/db.json /app/data/db.json
fi

exec "$@"
