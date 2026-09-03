METRICS = [
    {
        "id": "block_stats_daily",
        "title": "Blocks / day",
        "category": "onchain",
        "unit": "blocks",
        "sql": "SELECT day, block_count FROM bitcoin.block_stats_daily WHERE day BETWEEN {from:Date} AND {to:Date} ORDER BY day",
    },
    {
        "id": "tx_volume_hourly",
        "title": "TX volume / hour",
        "category": "onchain",
        "unit": "tx",
        "sql": "SELECT hour, tx_count FROM bitcoin.tx_volume_hourly WHERE hour BETWEEN {from:DateTime} AND {to:DateTime} ORDER BY hour",
    },
    {
        "id": "address_activity_daily",
        "title": "Active addresses / day",
        "category": "onchain",
        "unit": "addresses",
        "sql": "SELECT day, active_addresses FROM bitcoin.address_activity_daily WHERE day BETWEEN {from:Date} AND {to:Date} ORDER BY day",
    },
    {
        "id": "price_btc_usd",
        "title": "BTC price (stub)",
        "category": "price",
        "unit": "USD",
        "disabled": True,
    },
]
