#!/bin/sh
set -e

DATA_DIR=${BITCOIN_DATA:-/home/bitcoin/.bitcoin}

echo "Initializing JuiceFS..."
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
/usr/local/bin/juicefs mount -d redis://valkey:6379/1 "$DATA_DIR"

# Copy bitcoin config from bind mount (hidden by FUSE)
if [ -f /tmp/bitcoin.conf ]; then
  cp /tmp/bitcoin.conf "$DATA_DIR/bitcoin.conf"
  chmod 644 "$DATA_DIR/bitcoin.conf"
fi

# Remove stale lock/pid files left by a previously killed bitcoind session.
# JuiceFS emulates flock in the metadata engine (valkey), so records from a
# hard-killed container survive and block startup.
rm -f "$DATA_DIR/.lock" "$DATA_DIR/bitcoind.pid" "$DATA_DIR/.cookie"
find "$DATA_DIR" -name LOCK -type f -delete 2>/dev/null || true

# Start bitcoind in background
echo "Starting bitcoind..."
gosu bitcoin bitcoind -datadir="$DATA_DIR" -conf="$DATA_DIR/bitcoin.conf" &
BITCOIN_PID=$!

# Wait for blocks dir to exist
echo "Waiting for bitcoind blocks directory..."
for i in $(seq 1 60); do
  if [ -d "$DATA_DIR/blocks" ]; then
    echo "Blocks directory ready after ${i}s"
    break
  fi
  sleep 1
done

# Start decoder in background
echo "Starting decoder..."
/usr/local/bin/decoder &
DECODER_PID=$!

echo "All processes started. bitcoind PID=$BITCOIN_PID, decoder PID=$DECODER_PID"
wait $BITCOIN_PID
