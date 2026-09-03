#!/bin/sh
set -e

# Format JuiceFS if needed and mount at bitcoin data directory
echo "Initializing JuiceFS..."
DATA_DIR=${BITCOIN_DATA:-/home/bitcoin/.bitcoin}
mkdir -p "$DATA_DIR"

if ! /usr/local/bin/juicefs status redis://valkey:6379/1 >/dev/null 2>&1; then
  echo "Formatting new JuiceFS volume..."
  /usr/local/bin/juicefs format \
    --storage s3 \
    --bucket http://rustfs:9000/juicefs-blockchain \
    --access-key ${ACCESS_KEY:-rustfsadmin} \
    --secret-key ${SECRET_KEY:-rustfsadmin} \
    --compress zstd \
    redis://valkey:6379/1 \
    juicefs-blockchain 2>&1 | grep -v 'already formatted' || true
else
  echo "JuiceFS volume already formatted, skipping format."
fi

echo "Mounting JuiceFS at $DATA_DIR..."
/usr/local/bin/juicefs mount redis://valkey:6379/1 "$DATA_DIR"

# Hand off to the original bitcoin entrypoint
exec /entrypoint.sh "$@"
