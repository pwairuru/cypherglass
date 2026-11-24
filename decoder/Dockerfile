# Rust decoder (musl static).
# Build with context ./decoder (compose: context ./decoder, dockerfile Dockerfile).
# NOTE: CLICKHOUSE_PORT here is the HTTP port (8123 server-side).

FROM rust:alpine AS rust-builder
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY src/ ./src/
RUN cargo build --release --locked && cp target/release/decoder /decoder

FROM alpine:3.20
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 decoder
COPY --from=rust-builder /decoder /usr/local/bin/decoder
USER decoder
HEALTHCHECK --interval=60s --timeout=5s --retries=3 CMD test -f "${STATE_FILE:-/data/decoder_state.json}" || exit 1
ENTRYPOINT ["/usr/local/bin/decoder"]
