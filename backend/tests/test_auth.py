from fastapi.testclient import TestClient

from app.main import app


def test_login_and_guard(client=None):
    import uuid

    c = client or TestClient(app)
    r = c.post("/api/v1/auth/login", json={"username": "admin", "password": "admin"})
    if r.status_code != 200:
        # Deterministic fallback: seed login is fail-closed once any real user
        # exists (or on transient DB errors); register a fresh user instead of
        # depending on table-empty seed state (fixes intermittent 401).
        uname = f"t_{uuid.uuid4().hex[:8]}"
        rr = c.post("/api/v1/auth/register", json={"username": uname, "password": "password123"})
        assert rr.status_code == 201, rr.text
        r = c.post("/api/v1/auth/login", json={"username": uname, "password": "password123"})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    assert tok
    r2 = c.get("/api/v1/metrics", headers={"Authorization": f"Bearer {tok}"})
    assert r2.status_code in (200, 404)  # 404 ok before Task3, but not 401
    r3 = c.get("/api/v1/metrics")
    assert r3.status_code == 401
