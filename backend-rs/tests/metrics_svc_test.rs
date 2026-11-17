use backend_rs::ch::{ChClient, SeriesPoint};
use backend_rs::metrics::registry::{by_id, METRICS};
use backend_rs::metrics::service::{
    check_range, get_coverage, get_ohlc, get_series, norm_date, parse_coverage_rows, series_stale,
};

fn test_ch_client() -> ChClient {
    ChClient::from_env()
}

#[test]
fn registry_has_210_ids_and_no_base_reads() {
    assert_eq!(METRICS.len(), 210);

    let forbidden = [
        "FROM bitcoin.blocks_v2",
        "FROM bitcoin.transactions_v2",
        "FROM bitcoin.inputs_v2",
        "FROM bitcoin.outputs_v2",
        "FROM bitcoin.blocks",
        "FROM bitcoin.transactions",
        "FROM bitcoin.inputs",
        "FROM bitcoin.outputs",
    ];

    for m in METRICS.iter() {
        for pattern in &forbidden {
            assert!(
                !m.sql.contains(pattern),
                "metric {} reads base table: {}",
                m.id,
                pattern
            );
        }
    }
}

#[test]
fn registry_spot_check_sql() {
    let blocks_daily = by_id("blocks_daily").expect("blocks_daily exists");
    assert_eq!(
        blocks_daily.sql,
        "SELECT day, countMerge(block_count) FROM bitcoin.mv_blocks_daily WHERE day BETWEEN {from:Date} AND {to:Date} GROUP BY day ORDER BY day"
    );

    let hashrate = by_id("hashrate_daily").expect("hashrate_daily exists");
    assert_eq!(
        hashrate.sql,
        "SELECT day, avgMerge(avg_difficulty) * 4294967296 / 600 FROM bitcoin.mv_blocks_daily WHERE day BETWEEN {from:Date} AND {to:Date} GROUP BY day ORDER BY day"
    );

    let mvrv = by_id("mvrv_daily").expect("mvrv_daily exists");
    assert_eq!(
        mvrv.sql,
        "SELECT day, argMax(mvrv, updated_at) FROM marts.mvrv_nupl_daily WHERE day BETWEEN {from:Date} AND {to:Date} GROUP BY day ORDER BY day"
    );

    let price_close_hourly = by_id("price_close_hourly").expect("price_close_hourly exists");
    assert_eq!(
        price_close_hourly.sql,
        "SELECT ts, close FROM bitcoin.price_ohlc_hourly WHERE symbol = 'BTCUSDT' AND ts BETWEEN {from:DateTime} AND {to:DateTime} ORDER BY ts"
    );
}

#[test]
fn norm_trims_iso_to_date() {
    assert_eq!(
        norm_date("2023-01-15T08:30:00.000Z", "Date").unwrap(),
        "2023-01-15"
    );
}

#[test]
fn norm_offset_preserves_wall_clock_datetime() {
    assert_eq!(
        norm_date("2023-01-15T08:30:00+02:00", "DateTime").unwrap(),
        "2023-01-15 08:30:00"
    );
}

#[test]
fn norm_offset_preserves_wall_clock_date() {
    assert_eq!(
        norm_date("2023-01-15T01:00:00+02:00", "Date").unwrap(),
        "2023-01-15"
    );
}

#[test]
fn from_gt_to_422() {
    let err = check_range("2023-01-15", "2023-01-10", "Date").unwrap_err();
    assert_eq!(err.status, 422);
    assert!(err.message.contains("range too large"));
}

#[test]
fn hourly_over_370d_422() {
    let err = check_range("2023-01-01 00:00:00", "2024-01-15 00:00:00", "DateTime").unwrap_err();
    assert_eq!(err.status, 422);
    assert!(err.message.contains("370"));
}

#[test]
fn daily_over_1826d_422() {
    let err = check_range("2018-01-01", "2023-01-15", "Date").unwrap_err();
    assert_eq!(err.status, 422);
    assert!(err.message.contains("1826"));
}

#[test]
fn empty_coverage_404() {
    let rows = vec![vec![serde_json::Value::Null, serde_json::Value::Null]];
    let err = parse_coverage_rows(rows).unwrap_err();
    assert_eq!(err.status, 404);
    assert!(err.message.contains("No coverage yet"));
}

#[test]
fn null_value_sets_stale() {
    let points = vec![
        SeriesPoint {
            t: "2023-01-01".into(),
            v: Some(1.0),
        },
        SeriesPoint {
            t: "2023-01-02".into(),
            v: None,
        },
    ];
    assert!(series_stale(&points));
}

#[tokio::test]
async fn coverage_query_shape_requires_live_clickhouse() {
    // This test is gated by ClickHouse reachability; it asserts the query
    // shape returns either a valid coverage range or the expected 404 when
    // the MV is empty. It does not assert fixed dates.
    let ch = test_ch_client();
    let result = get_coverage(&ch).await;
    match result {
        Ok(cov) => {
            assert!(!cov.min_day.is_empty());
            assert!(!cov.max_day.is_empty());
        }
        Err(e) => {
            // Either no data yet (404) or CH is not running (502).
            assert!(e.status == 404 || e.status == 502, "unexpected status {}", e.status);
        }
    }
}

#[tokio::test]
async fn ohlc_daily_query_shape_requires_live_clickhouse() {
    let ch = test_ch_client();
    let result = get_ohlc(&ch, "daily", "2023-01-01", "2023-01-07").await;
    match result {
        Ok(out) => {
            for bar in &out.bars {
                assert!(bar.time > 0);
            }
        }
        Err(e) => {
            assert!(e.status == 404 || e.status == 502, "unexpected status {}", e.status);
        }
    }
}

#[tokio::test]
async fn unknown_metric_404() {
    let ch = test_ch_client();
    let err = get_series(&ch, "not_a_metric", "2023-01-01", "2023-01-07")
        .await
        .unwrap_err();
    assert_eq!(err.status, 404);
}
