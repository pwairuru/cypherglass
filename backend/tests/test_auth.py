from fastapi.testclient import TestClient

from app.main import app


def test_login_and_guard(client=None):
    c = client or TestClient(app)
    r = c.post("/api/v1/auth/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200
    tok = r.json()["access_token"]
    assert tok
    r2 = c.get("/api/v1/metrics", headers={"Authorization": f"Bearer {tok}"})
    assert r2.status_code in (200, 404)  # 404 ok before Task3, but not 401
    r3 = c.get("/api/v1/metrics")
    assert r3.status_code == 401
