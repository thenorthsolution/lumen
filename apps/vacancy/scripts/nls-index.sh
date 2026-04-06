#!/bin/sh
set -eu

cd "$(dirname "$0")/../../.."

if [ "${1:-}" = "--" ]; then
  shift
fi

DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' apps/vacancy/.env | head -n 1)" \
PYTHONPATH=. \
python3 -m services.nls.index_bag_ogc_embeddings "$@"
