FROM rust:1-slim-bookworm AS builder
WORKDIR /src
# Workspace manifests first for layer caching (backend-rs shares the root lockfile).
COPY Cargo.toml Cargo.lock ./
COPY backend-rs/Cargo.toml ./backend-rs/Cargo.toml
COPY decoder/Cargo.toml ./decoder/Cargo.toml
COPY decoder/Cargo.lock ./decoder/Cargo.lock
RUN mkdir -p backend-rs/src decoder/src && \
    cargo fetch || true
COPY backend-rs ./backend-rs
COPY decoder ./decoder
RUN cargo build --release --locked -p backend-rs && \
    cp target/release/backend-rs /backend-rs

FROM debian:12-slim
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/* && \
    useradd -m -u 10001 appuser
COPY --from=builder /backend-rs /usr/local/bin/backend-rs
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -sf http://localhost:8000/health || exit 1
CMD ["/usr/local/bin/backend-rs"]
