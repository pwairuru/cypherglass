FROM golang:1.23-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . ./
RUN CGO_ENABLED=0 go build -o /decoder .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 decoder
COPY --from=builder /decoder /usr/local/bin/decoder
USER decoder
HEALTHCHECK --interval=60s --timeout=5s --retries=3 CMD test -f /data/decoder_state.json || exit 1
ENTRYPOINT ["/usr/local/bin/decoder"]
