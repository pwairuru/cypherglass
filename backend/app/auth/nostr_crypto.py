"""Nostr event id + BIP-340 Schnorr verification (NIP-01).

Primary path uses ``coincurve`` (libsecp256k1). A pure-Python BIP-340
fallback is included so verification keeps working when the optional
C extension is unavailable; both paths are fail-closed (any error or
malformed input returns ``False``, never raises).
"""

import hashlib
import json

try:  # optional C dependency — pure-Python fallback below
    from coincurve import PublicKeyXOnly as _XOnlyKey
except ImportError:  # pragma: no cover - coincurve installed in backend env
    _XOnlyKey = None


def nostr_event_id(ev: dict) -> str:
    data = [0, ev["pubkey"], ev["created_at"], ev["kind"], ev["tags"], ev["content"]]
    return hashlib.sha256(
        json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()


# ---- pure-Python BIP-340 fallback (secp256k1) ----

_P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
_G = (
    0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798,
    0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8,
)


def _tagged(tag: str, msg: bytes) -> bytes:
    t = hashlib.sha256(tag.encode()).digest()
    return hashlib.sha256(t + t + msg).digest()


def _lift_x(x: int):
    if x >= _P:
        return None
    y2 = (pow(x, 3, _P) + 7) % _P
    y = pow(y2, (_P + 1) // 4, _P)
    if (y * y) % _P != y2:
        return None
    return (x, y if y % 2 == 0 else _P - y)


def _add(p1, p2):
    if p1 is None:
        return p2
    if p2 is None:
        return p1
    x1, y1 = p1
    x2, y2 = p2
    if x1 == x2:
        if (y1 + y2) % _P == 0:
            return None
        s = (3 * x1 * x1 * pow(2 * y1, _P - 2, _P)) % _P
    else:
        s = ((y2 - y1) * pow(x2 - x1, _P - 2, _P)) % _P
    x3 = (s * s - x1 - x2) % _P
    return (x3, (s * (x1 - x3) - y1) % _P)


def _mul(pt, n: int):
    acc = None
    base = pt
    while n:
        if n & 1:
            acc = _add(acc, base)
        base = _add(base, base)
        n >>= 1
    return acc


def _verify_schnorr_pure(pub: bytes, sig: bytes, msg: bytes) -> bool:
    try:
        if len(pub) != 32 or len(sig) != 64 or len(msg) != 32:
            return False
        r = int.from_bytes(sig[:32], "big")
        s = int.from_bytes(sig[32:], "big")
        if r >= _P or s >= _N:
            return False
        x = int.from_bytes(pub, "big")
        P = _lift_x(x)
        if P is None:
            return False
        e = int.from_bytes(_tagged("BIP0340/challenge", sig[:32] + pub + msg), "big") % _N
        R = _add(_mul(_G, s), _mul(P, _N - e))
        if R is None or R[1] % 2 == 1 or R[0] != r:
            return False
        return True
    except Exception:
        return False


def verify_nostr_event(ev: dict) -> bool:
    """Recompute NIP-01 id, then BIP-340 verify sig against pubkey."""
    try:
        if ev["id"] != nostr_event_id(ev):
            return False
        pub = bytes.fromhex(ev["pubkey"])
        sig = bytes.fromhex(ev["sig"])
        msg = bytes.fromhex(ev["id"])
        if len(pub) != 32 or len(sig) != 64 or len(msg) != 32:
            return False
    except Exception:
        return False
    if _XOnlyKey is not None:
        try:
            return bool(_XOnlyKey(pub).verify(sig, msg))
        except Exception:
            return False
    return _verify_schnorr_pure(pub, sig, msg)
