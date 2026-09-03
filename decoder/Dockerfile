FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY decoder /usr/local/bin/decoder
RUN chmod +x /usr/local/bin/decoder
ENTRYPOINT ["/usr/local/bin/decoder"]
