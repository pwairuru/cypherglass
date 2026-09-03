def test_beat_schedule():
    from app.workers.celery_app import celery_app

    assert "price-poll-stub" in celery_app.conf.beat_schedule


def test_ping_task_importable():
    from app.workers.celery_app import ping

    assert callable(ping)
