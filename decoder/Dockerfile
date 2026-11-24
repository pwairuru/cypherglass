# Rust decoder (musl static) + Go legacy reference (still builds until cutover).
# Build with context ./decoder (compose: context ./decoder, dockerfile Dockerfile).
# NOTE: CLICKHOUSE_PORT here is the HTTP port (8123 server-side); the retired
# Go client spoke the native protocol on 9000.

# Go legacy reference: proves decoder/legacy-go still builds at cutover time.
# GOPROXY/GOSUMDB are build args so restricted networks can override the
# module proxy without editing the file (defaults = upstream behavior).
ARG GOPROXY=https://proxy.golang.org,direct
ARG GOSUMDB=sum.golang.org
FROM golang:1.26-alpine AS go-builder
ARG GOPROXY
ARG GOSUMDB
WORKDIR /src
COPY legacy-go/go.mod legacy-go/go.sum ./
RUN GOPROXY=${GOPROXY} GOSUMDB=${GOSUMDB} GOFLAGS=-mod=mod go mod download
COPY legacy-go/ ./
RUN CGO_ENABLED=0 GOPROXY=${GOPROXY} GOSUMDB=${GOSUMDB} GOFLAGS=-mod=mod go build -o /decoder-go-legacy .

# Rust decoder: musl static binary (rust:alpine ships the musl target).
FROM rust:alpine AS rust-builder
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY src/ ./src/
RUN cargo build --release --locked && cp target/release/decoder /decoder

FROM alpine:3.20
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 decoder
COPY --from=rust-builder /decoder /usr/local/bin/decoder
COPY --from=go-builder /decoder-go-legacy /usr/local/bin/decoder-go-legacy
USER decoder
HEALTHCHECK --interval=60s --timeout=5s --retries=3 CMD test -f "${STATE_FILE:-/data/decoder_state.json}" || exit 1
ENTRYPOINT ["/usr/local/bin/decoder"]
