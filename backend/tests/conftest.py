import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from app.main import app

MOCK_POINTS = [{"t": "2024-01-01", "v": 1.0}, {"t": "2024-01-02", "v": 2.0}]


@pytest.fixture
def client():
    with patch("app.ch.query_series", return_value=MOCK_POINTS):
        try:
            with patch("app.metrics.service.query_series", return_value=MOCK_POINTS):
                yield TestClient(app)
        except (ImportError, AttributeError):
            yield TestClient(app)


@pytest.fixture
def token(client):
    r = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200
    return r.json()["access_token"]
