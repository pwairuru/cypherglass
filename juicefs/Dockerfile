FROM alpine:3.20
RUN apk add --no-cache fuse
COPY juicefs-bin /usr/local/bin/juicefs
RUN chmod +x /usr/local/bin/juicefs
ENTRYPOINT ["/usr/local/bin/juicefs"]
