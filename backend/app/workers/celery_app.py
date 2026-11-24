import logging

from celery import Celery

from app.config import settings

log = logging.getLogger(__name__)


def _redis_alias(url: str) -> str:
    # kombu has no valkey:// transport; mirror fusionpbx: rewrite to redis://
    if url.startswith("valkey://"):
        return "redis://" + url[len("valkey://") :]
    return url


broker_url = _redis_alias(settings.valkey_url)
backend_url = _redis_alias(settings.valkey_url)

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
        "external-fear-greed": {
            "task": "app.workers.external.poll_fear_greed",
            "schedule": 86400.0,
        },
        "external-funding": {
            "task": "app.workers.external.poll_funding",
            "schedule": 3600.0,
        },
        "external-cross-asset": {
            "task": "app.workers.external.poll_cross_asset",
            "schedule": 86400.0,
        },
        "external-keyed": {
            "task": "app.workers.external.poll_keyed_sources",
            "schedule": 86400.0,
        },
        "external-cohorts": {
            "task": "app.workers.external.poll_address_cohorts",
            "schedule": 86400.0,
        },
        "external-sweeper": {
            "task": "app.workers.external.poll_address_sweeper",
            "schedule": 86400.0,
        },
        "external-usd-cohorts": {
            "task": "app.workers.external.poll_address_usd",
            "schedule": 86400.0,
        },
        "external-macro": {
            "task": "app.workers.external.poll_macro",
            "schedule": 86400.0,
        },
        "external-etf": {
            "task": "app.workers.external.poll_etf_flows",
            "schedule": 86400.0,
        },
        "external-lightning": {
            "task": "app.workers.external.poll_lightning",
            "schedule": 86400.0,
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
