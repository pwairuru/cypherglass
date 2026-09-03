import logging

from celery import Celery

from app.config import settings

log = logging.getLogger(__name__)


def _redis_alias(url: str) -> str:
    # kombu has no valkey:// transport; mirror fusionpbx: rewrite to redis://
    if url.startswith("valkey://"):
        return "redis://" + url[len("valkey://") :]
    return url


broker_url = _redis_alias(settings.redis_url)
backend_url = _redis_alias(settings.redis_url)

celery_app = Celery("cypherglass", broker=broker_url, backend=backend_url)
celery_app.conf.update(
    task_acks_late=True,
    beat_schedule={
        "price-poll-stub": {
            "task": "app.workers.celery_app.poll_price_stub",
            "schedule": 60.0,
        },
        "price-poll-hourly": {
            "task": "app.workers.price.poll_price_hourly",
            "schedule": 3600.0,
        },
    },
)


@celery_app.task(name="app.workers.celery_app.ping")
def ping():
    log.info("ping")
    return {"ok": True}


@celery_app.task(name="app.workers.celery_app.poll_price_stub")
def poll_price_stub():
    log.info("price poll stub")
    return {"ok": True, "note": "binance job later"}
