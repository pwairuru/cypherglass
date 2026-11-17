#!/usr/bin/env python3
"""Rotate weak placeholder secrets in .env (safe subset by default).

What it does:
- Audits known secret keys for weak placeholders (empty, changeme,
  cypher, bitcoinrpc, rustfsadmin, bitcoin_clickhouse, dev-only default).
- `--rotate-jwt` replaces JWT_SECRET with secrets.token_hex(32) (64 chars).
  Safe: only invalidates existing JWTs (users re-login). No volume dependency.
- Other keys (POSTGRES/CLICKHOUSE/RPC/S3) are REPORTED but not auto-rotated:
  those are baked into initialized volumes (pg data dir, CH users.xml dev
  fallback). Rotating them without re-init breaks connectivity; prod must set
  them before first `docker compose up` (prod compose fails fast via :? ...).

Usage:
  python3 scripts/rotate_secrets.py --check        # audit only, exit 1 if weak
  python3 scripts/rotate_secrets.py --rotate-jwt  # rotate JWT_SECRET in .env
"""
import re
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"

WEAK = {
    "", "changeme", "cypher", "bitcoinrpc", "rustfsadmin",
    "bitcoin_clickhouse", "changeme-dev-secret",
    "dev-only-not-for-prod-0123456789abcdef0123456789abcdef01234567",
}
KEYS = [
    "JWT_SECRET", "POSTGRES_PASSWORD", "CLICKHOUSE_PASSWORD",
    "BITCOIN_RPC_PASSWORD", "VALKEY_PASSWORD", "AWS_SECRET_ACCESS_KEY",
]


def _read_env(path: Path) -> tuple[list[str], dict[str, str]]:
    if not path.exists():
        return [], {}
    lines = path.read_text().splitlines()
    vals: dict[str, str] = {}
    for ln in lines:
        m = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$", ln)
        if m and not ln.lstrip().startswith("#"):
            vals[m.group(1)] = m.group(2).strip().strip("'\"")
    return lines, vals


def _is_weak(key: str, val: str) -> bool:
    if key == "JWT_SECRET":
        return len(val) < 32 or val in WEAK
    return val in WEAK


def audit(vals: dict[str, str]) -> list[str]:
    weak = []
    for k in KEYS:
        if _is_weak(k, vals.get(k, "")):
            weak.append(k)
    return weak


def rotate_jwt(path: Path) -> str:
    lines, vals = _read_env(path)
    new = secrets.token_hex(32)
    out = []
    found = False
    for ln in lines:
        if re.match(r"^\s*JWT_SECRET\s*=", ln) and not ln.lstrip().startswith("#"):
            out.append(f"JWT_SECRET={new}")
            found = True
        else:
            out.append(ln)
    if not found:
        out.append(f"JWT_SECRET={new}")
    path.write_text("\n".join(out) + "\n")
    return new


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "--check"
    lines, vals = _read_env(ENV_PATH)
    if mode == "--rotate-jwt":
        rotate_jwt(ENV_PATH)
        print("JWT_SECRET rotated (64 hex chars). Users must re-login.")
        weak = audit(_read_env(ENV_PATH)[1])
        weak = [k for k in weak if k != "JWT_SECRET"]
        if weak:
            print("Remaining weak (manual prod step, see docs/PROD_TLS.md): " + ", ".join(weak))
        return 0
    weak = audit(vals)
    if weak:
        print("WEAK secrets: " + ", ".join(weak))
        print("Run: python3 scripts/rotate_secrets.py --rotate-jwt  (safe: JWT only)")
        print("Prod: set strong POSTGRES/CLICKHOUSE/RPC/S3/VALKEY passwords before first up (prod compose fails fast).")
        return 1
    print("OK: no weak placeholder secrets.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
