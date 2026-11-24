# Production TLS + secrets checklist

> Risk-acceptance note (2026-11-16): TLS terminates at the reverse proxy,
> which cannot be live-probed on this dev machine (no public domain or
> ports 80/443 here). Verified instead: opt-in `tls` profile passes
> `docker compose --profile tls config` with 0 errors, the Caddyfile
> targets match the loopback-bound app ports, and HSTS + CSP/frame headers
> are asserted live on `:8002`/`:5173`. Before real traffic: point DNS at
> the host, `up -d --profile tls`, confirm `curl -v https://$DOMAIN`
> shows a valid LE cert and HSTS.

Reverse proxy terminates TLS; app containers stay on `127.0.0.1` loopback.
Minimal Caddy example (host):

```caddy
analytics.example.com {
    reverse_proxy 127.0.0.1:5173
}
api.example.com {
    reverse_proxy 127.0.0.1:8002
}
```

Caddy obtains/renews Let's Encrypt certs automatically. HSTS is already sent
by the API (`max-age=63072000; includeSubDomains`) and nginx CSP headers are
on the frontend. Do not expose `5433/6381/6382/8124/9000/9010/8332` beyond
loopback; both compose files now bind them to `127.0.0.1`.

Secrets (prod, before first `up`):
1. `python3 scripts/rotate_secrets.py --check` must print OK.
2. Safe anytime: `python3 scripts/rotate_secrets.py --rotate-jwt`.
3. Manual (baked into volumes on first start — set before first `up`):
   `POSTGRES_PASSWORD`, `CLICKHOUSE_PASSWORD`, `BITCOIN_RPC_PASSWORD`,
   `VALKEY_PASSWORD`, `AWS_SECRET_ACCESS_KEY`. `docker-compose.prod.yml`
   fails fast if `CLICKHOUSE_PASSWORD` is unset.
4. Valkey: prod compose passes `VALKEY_PASSWORD` via `command --requirepass`
   and healthcheck auth; set `VALKEY_URL=redis://:PASS@valkey:6379/0` (or
   `valkey://`) wherever the API runs.
5. Never commit `.env` (gitignored). JWT must be 32+ random bytes
   (`python3 -c "import secrets; print(secrets.token_hex(32))"`).
