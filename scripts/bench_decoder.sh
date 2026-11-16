#!/usr/bin/env bash
# Go-vs-Rust decoder benchmark: same synthetic blk fixture through both
# release binaries, wall/CPU/RSS via /usr/bin/time -v, binary bytes, host info.
#
# Knobs (env): N_BLOCKS=300 CH_HTTP_HOST/PORT (Rust, HTTP), CH_NATIVE_HOST/PORT
# (Go, native), CH_USER, CH_PASSWORD, BENCH_DIR (scratch, default mktemp),
# KEEP=1 (retain DBs + artifacts).
set -euo pipefail

N_BLOCKS="${N_BLOCKS:-300}"
CH_HTTP_HOST="${CH_HTTP_HOST:-127.0.0.1}"
CH_HTTP_PORT="${CH_HTTP_PORT:-8124}"
CH_NATIVE_HOST="${CH_NATIVE_HOST:-127.0.0.1}"
CH_NATIVE_PORT="${CH_NATIVE_PORT:-9005}"
CH_USER="${CH_USER:-bitcoin}"
CH_PASSWORD="${CH_PASSWORD:-bitcoin_clickhouse}"
GO_IMAGE="${GO_IMAGE:-golang:1.26-alpine}"

REPO="$(cd "$(dirname "$0")/.." && pwd)"
BENCH_DIR="${BENCH_DIR:-$(mktemp -d /tmp/decoder-bench-XXXXXX)}"
mkdir -p "$BENCH_DIR/blocks"
FIX="$BENCH_DIR/blocks/blk00001.dat"
TS="$(date +%s)_$$"
DB_GO="bench_go_${TS}"
DB_RS="bench_rs_${TS}"

q() { # q <sql> : POST query via HTTP, print response, fail on Code:
    local out
    out="$(curl -s -m 60 -u "$CH_USER:$CH_PASSWORD" "http://$CH_HTTP_HOST:$CH_HTTP_PORT/" --data-binary "$1")"
    if [[ "$out" == Code:* ]]; then echo "CH error: $out" >&2; return 1; fi
    printf '%s' "$out"
}

echo "== host =="
uname -a | tee "$BENCH_DIR/host.txt"
nproc | tee -a "$BENCH_DIR/host.txt"
free -m | head -2 | tee -a "$BENCH_DIR/host.txt"
q "SELECT version()" | tee -a "$BENCH_DIR/host.txt"; echo

echo "== fixture: $N_BLOCKS chained blocks =="
python3 - "$FIX" "$N_BLOCKS" << 'PYEOF'
import hashlib, struct, sys
path, n = sys.argv[1], int(sys.argv[2])
MAGIC = bytes.fromhex('f9beb4d9')
def varint(i):
    if i < 0xfd: return bytes([i])
    if i <= 0xffff: return b'\xfd' + struct.pack('<H', i)
    if i <= 0xffffffff: return b'\xfe' + struct.pack('<I', i)
    return b'\xff' + struct.pack('<Q', i)
def txin(prev, vout, script, seq=0xffffffff):
    return prev + struct.pack('<I', vout) + varint(len(script)) + script + struct.pack('<I', seq)
def txout(value, script):
    return struct.pack('<Q', value) + varint(len(script)) + script
prev_internal = bytes(32)
time0 = 1700000000
out = bytearray()
for h in range(1, n + 1):
    cb_script = struct.pack('<I', h) + b'bench-fixture'
    cb = (struct.pack('<i', 1) + varint(1)
          + txin(bytes(32), 0xffffffff, cb_script)
          + varint(1) + txout(5_000_000_000 + 1_000, bytes([0x51]))
          + struct.pack('<I', 0))
    parent = hashlib.sha256(b'parent-%d' % h).digest()
    spend = (struct.pack('<i', 1) + varint(1)
             + txin(parent, 0, b'sig')
             + varint(1) + txout(8_000, bytes([0x51, 0x41]))
             + struct.pack('<I', 0))
    header = (struct.pack('<i', 1) + prev_internal + bytes(32)
              + struct.pack('<I', time0 + h * 600) + struct.pack('<I', 0x1d00ffff)
              + struct.pack('<I', h))
    body = header + varint(2) + cb + spend
    out += MAGIC + struct.pack('<I', len(body)) + body
    prev_internal = hashlib.sha256(hashlib.sha256(header).digest()).digest()
open(path, 'wb').write(bytes(out))
PYEOF
sha256sum "$FIX" | tee "$BENCH_DIR/fixture.sha256"
ls -l "$FIX"

echo "== build Go (release-equivalent plain go build) =="
docker run --rm -v "$REPO/decoder/legacy-go:/src" -w /src \
    -v "$BENCH_DIR:/out" "$GO_IMAGE" \
    sh -c 'go build -o /out/decoder-go . && go build -ldflags="-s -w" -o /out/decoder-go-stripped .'
echo "== build Rust (release) =="
cargo build --release --manifest-path "$REPO/decoder/Cargo.toml"
cp "$REPO/decoder/target/release/decoder" "$BENCH_DIR/decoder-rs"
cp "$REPO/decoder/target/release/decoder" "$BENCH_DIR/decoder-rs-stripped"
CARGO_PROFILE_RELEASE_STRIP=none cargo build --release \
    --manifest-path "$REPO/decoder/Cargo.toml" --target-dir "$BENCH_DIR/unstrip-target"
cp "$BENCH_DIR/unstrip-target/release/decoder" "$BENCH_DIR/decoder-rs-unstripped"
ls -l "$BENCH_DIR"/decoder-go "$BENCH_DIR"/decoder-go-stripped \
      "$BENCH_DIR"/decoder-rs-stripped "$BENCH_DIR"/decoder-rs-unstripped | tee "$BENCH_DIR/binaries.txt"

echo "== scratch DBs =="
python3 - "$REPO" "$DB_GO" "$DB_RS" > "$BENCH_DIR/ddl.sql" << 'PYEOF'
import re, sys
repo, go_db, rs_db = sys.argv[1], sys.argv[2], sys.argv[3]
want = {'blocks', 'transactions', 'outputs', 'inputs',
        'blocks_v2', 'transactions_v2', 'outputs_v2', 'inputs_v2'}
sql = ''
for f in ('clickhouse/init/01_schema.sql', 'clickhouse/init/03_schema_v2.sql'):
    sql += open(f'{repo}/{f}').read() + '\n'
stmts = [s.strip() for s in sql.split(';') if s.strip()]
out = []
for db in (go_db, rs_db):
    out.append(f'CREATE DATABASE IF NOT EXISTS {db}')
    for s in stmts:
        m = re.search(r'CREATE TABLE IF NOT EXISTS \w+\.(\w+)', s)
        if m and m.group(1) in want:
            out.append(s.replace('bitcoin.', f'{db}.', 1))
sys.stdout.write('\0'.join(out) + '\0')
PYEOF
tr '\0' '\n' < "$BENCH_DIR/ddl.sql" | grep -c "CREATE TABLE" | tr '\n' ' '; echo "table statements (expect 16)"
while IFS= read -r -d '' stmt; do q "$stmt" > /dev/null; done < "$BENCH_DIR/ddl.sql"

run_and_time() { # run_and_time <name> <binary> <db> VAR=val... : background under
    # /usr/bin/time, poll blocks count until N_BLOCKS, wall-clock the sync,
    # then SIGTERM (both binaries watch forever; TERM triggers graceful
    # shutdown with final flush). CPU/RSS come from the time file; wall from
    # the poll loop (excludes idle watch).
    local name="$1" bin="$2" db="$3"; shift 3
    local state="$BENCH_DIR/state-$name.json"
    rm -f "$state"
    local start end wall count pid
    start=$(date +%s.%N)
    /usr/bin/time -v -o "$BENCH_DIR/time-$name.txt" \
        env "$@" "BLOCKS_DIR=$BENCH_DIR/blocks" "STATE_FILE=$state" \
        timeout 600 "$bin" > "$BENCH_DIR/$name.stdout.log" 2>&1 &
    pid=$!
    count=0
    for _ in $(seq 1 300); do
        sleep 2
        count="$(q "SELECT count() FROM $db.blocks" 2>/dev/null || echo 0)"
        if [ "$count" = "$N_BLOCKS" ]; then break; fi
        kill -0 "$pid" 2>/dev/null || break
    done
    end=$(date +%s.%N)
    # TERM the `timeout` child (not `time` itself, or no stats file is
    # written): timeout forwards TERM to the decoder, which shuts down
    # gracefully; time then records cumulative usage incl. the decoder.
    child="$(pgrep -P "$pid" | head -1)"
    if [ -n "$child" ]; then kill -TERM "$child" 2>/dev/null || true; fi
    wait "$pid" 2>/dev/null || true
    wall="$(awk "BEGIN{print $end - $start}")"
    echo "$wall" > "$BENCH_DIR/wall-$name.txt"
    echo "== run $name: $count/$N_BLOCKS blocks in ${wall}s =="
    tail -2 "$BENCH_DIR/$name.stdout.log"
}

run_and_time go "$BENCH_DIR/decoder-go" "$DB_GO" \
    "CLICKHOUSE_HOST=$CH_NATIVE_HOST" "CLICKHOUSE_PORT=$CH_NATIVE_PORT" \
    "CLICKHOUSE_USER=$CH_USER" "CLICKHOUSE_PASSWORD=$CH_PASSWORD" \
    "CLICKHOUSE_DATABASE=$DB_GO"

run_and_time rs "$BENCH_DIR/decoder-rs-stripped" "$DB_RS" \
    "CLICKHOUSE_HOST=$CH_HTTP_HOST" "CLICKHOUSE_PORT=$CH_HTTP_PORT" \
    "CLICKHOUSE_USER=$CH_USER" "CLICKHOUSE_PASSWORD=$CH_PASSWORD" \
    "CLICKHOUSE_DATABASE=$DB_RS" "UTXO_DB=$BENCH_DIR/utxo.redb" \
    "BATCH_BLOCKS=10"

echo "== verify =="
echo "go blocks/txs/maxheight: $(q "SELECT count(), max(height) FROM $DB_GO.blocks")"
echo "   txs: $(q "SELECT count() FROM $DB_GO.transactions")"
echo "rs blocks/txs/maxheight: $(q "SELECT count(), max(height) FROM $DB_RS.blocks")"
echo "   txs: $(q "SELECT count() FROM $DB_RS.transactions")"

if [[ "${KEEP:-0}" != "1" ]]; then
    q "DROP DATABASE IF EXISTS $DB_GO" > /dev/null
    q "DROP DATABASE IF EXISTS $DB_RS" > /dev/null
    echo "(scratch DBs dropped; KEEP=1 to retain)"
fi

echo
echo "== result table (metric | Go | Rust | delta) =="
get() { grep -F "$2" "$1" 2>/dev/null | head -1 | sed 's/.*: //' || true; }
GO_WALL="$(cat "$BENCH_DIR/wall-go.txt")s (sync poll)"
RS_WALL="$(cat "$BENCH_DIR/wall-rs.txt")s (sync poll)"
GO_USER="$(get "$BENCH_DIR/time-go.txt" 'User time (seconds)')"
RS_USER="$(get "$BENCH_DIR/time-rs.txt" 'User time (seconds)')"
GO_SYS="$(get "$BENCH_DIR/time-go.txt" 'System time (seconds)')"
RS_SYS="$(get "$BENCH_DIR/time-rs.txt" 'System time (seconds)')"
GO_RSS="$(get "$BENCH_DIR/time-go.txt" 'Maximum resident set size')"
RS_RSS="$(get "$BENCH_DIR/time-rs.txt" 'Maximum resident set size')"
GO_B="$(stat -c%s "$BENCH_DIR/decoder-go-stripped")"
GO_BU="$(stat -c%s "$BENCH_DIR/decoder-go")"
RS_B="$(stat -c%s "$BENCH_DIR/decoder-rs-stripped")"
RS_BU="$(stat -c%s "$BENCH_DIR/decoder-rs-unstripped")"
printf '| %-22s | %-18s | %-18s | %s |\n' metric Go Rust delta
printf '| %-22s | %-18s | %-18s | %s |\n' wall "$GO_WALL" "$RS_WALL" "see report"
printf '| %-22s | %-18s | %-18s | %s |\n' "cpu user+sys (s)" "$GO_USER + $GO_SYS" "$RS_USER + $RS_SYS" "see report"
printf '| %-22s | %-18s | %-18s | %s |\n' "max RSS (kB)" "$GO_RSS" "$RS_RSS" "see report"
printf '| %-22s | %-18s | %-18s | %s |\n' "binary stripped (B)" "$GO_B" "$RS_B" "see report"
printf '| %-22s | %-18s | %-18s | %s |\n' "binary unstripped (B)" "$GO_BU" "$RS_BU" "see report"
echo
echo "fixture: $(cat "$BENCH_DIR/fixture.sha256")"
echo "artifacts: $BENCH_DIR"
