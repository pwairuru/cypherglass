#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Source .env from project root
set -a
source "${PROJECT_DIR}/.env"
set +a

echo "=== Installing JuiceFS Docker volume plugin ==="
docker plugin install juicedata/juicefs --grant-all-permissions 2>/dev/null \
  && echo "Plugin installed." \
  || echo "Plugin already installed."

echo "=== Creating JuiceFS volume (format + mount) ==="
JUICE_VOL="juicefs_blockchain"

# Remove old volume if exists
docker volume rm "$JUICE_VOL" 2>/dev/null || true

docker volume create \
  --driver juicedata/juicefs \
  --opt name="$JUICE_VOL" \
  --opt storage="s3" \
  --opt bucket="${S3_ENDPOINT}/${JUICE_BUCKET}" \
  --opt access-key="${AWS_ACCESS_KEY_ID}" \
  --opt secret-key="${AWS_SECRET_ACCESS_KEY}" \
  --opt meta-url="redis://valkey:6379/1" \
  --opt compress="zstd" \
  "$JUICE_VOL"

echo "=== JuiceFS volume '$JUICE_VOL' created ==="
echo "Volume will be mounted at /data/bitcoin in docker-compose."
