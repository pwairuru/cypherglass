# Legacy Go decoder reference (moved from decoder/ at cutover; still builds).
# Build with context ./decoder: docker build -f legacy-go/Dockerfile .
# NOTE: go.mod requires go >= 1.26.4, hence golang:1.26 (not 1.23).
FROM golang:1.26-alpine AS builder
WORKDIR /src
COPY legacy-go/go.mod legacy-go/go.sum ./
RUN go mod download
COPY legacy-go/ ./
RUN CGO_ENABLED=0 go build -o /decoder .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 decoder
COPY --from=builder /decoder /usr/local/bin/decoder
USER decoder
HEALTHCHECK --interval=60s --timeout=5s --retries=3 CMD test -f /data/decoder_state.json || exit 1
ENTRYPOINT ["/usr/local/bin/decoder"]
