use crate::auth::routes::CurrentUser;
use crate::charts::catalog::chart;
use crate::error::ApiError;
use axum::extract::{Path, State};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::FromRow;
use uuid::Uuid;

use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RuleKind {
    Above,
    Below,
    CrossUp,
    CrossDown,
    PctChange,
    BandBreach,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertRule {
    pub kind: RuleKind,
    pub threshold: f64,
    #[serde(default)]
    pub secondary: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AlertDelivery {
    #[serde(default = "default_true")]
    pub in_app: bool,
    #[serde(default)]
    pub email: bool,
    #[serde(default)]
    pub webhook_url: Option<String>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Alert {
    pub id: Uuid,
    pub chart_id: String,
    pub metric_id: String,
    pub rule: Value,
    pub delivery: Value,
    pub is_active: bool,
    pub cooldown_seconds: i32,
    pub last_evaluated_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct AlertEvent {
    pub id: Uuid,
    pub alert_id: Uuid,
    pub value: Option<f64>,
    pub threshold: Option<f64>,
    pub fired_at: chrono::DateTime<chrono::Utc>,
    pub delivered_at: Option<chrono::DateTime<chrono::Utc>>,
    pub payload: Value,
}

#[derive(Debug, Deserialize)]
pub struct AlertCreate {
    pub chart_id: String,
    pub metric_id: String,
    pub rule: AlertRule,
    #[serde(default)]
    pub delivery: AlertDelivery,
    #[serde(default = "default_cooldown")]
    pub cooldown_seconds: i32,
}

fn default_cooldown() -> i32 {
    3600
}

#[derive(Debug, Deserialize)]
pub struct AlertUpdate {
    #[serde(default)]
    pub rule: Option<AlertRule>,
    #[serde(default)]
    pub delivery: Option<AlertDelivery>,
    #[serde(default)]
    pub is_active: Option<bool>,
    #[serde(default)]
    pub cooldown_seconds: Option<i32>,
}

fn require_user(user: &CurrentUser) -> Result<(), ApiError> {
    if user.0.is_transient() || user.0.id == Uuid::nil() {
        return Err(ApiError::forbidden("Sign in with a persisted account"));
    }
    Ok(())
}

/// Pure rule evaluation. `previous` is the value from the prior bucket;
/// `current` is the newest value. Cross rules need both. `pct_change` compares
/// against `previous`; `band_breach` fires outside [threshold, secondary].
pub fn evaluate(rule: &AlertRule, previous: Option<f64>, current: f64) -> bool {
    match rule.kind {
        RuleKind::Above => current > rule.threshold,
        RuleKind::Below => current < rule.threshold,
        RuleKind::CrossUp => {
            matches!(previous, Some(p) if p <= rule.threshold && current > rule.threshold)
        }
        RuleKind::CrossDown => {
            matches!(previous, Some(p) if p >= rule.threshold && current < rule.threshold)
        }
        RuleKind::PctChange => match previous {
            Some(p) if p != 0.0 => ((current - p) / p * 100.0).abs() >= rule.threshold,
            _ => false,
        },
        RuleKind::BandBreach => {
            let upper = rule.secondary.unwrap_or(rule.threshold);
            let lower = rule.threshold.min(upper);
            let upper = rule.threshold.max(upper);
            current < lower || current > upper
        }
    }
}

fn validate_create(body: &AlertCreate) -> Result<(), ApiError> {
    let spec = chart(&body.chart_id).ok_or_else(|| ApiError::not_found("Unknown chart"))?;
    if body.metric_id.is_empty() || body.metric_id.len() > 120 {
        return Err(ApiError::unprocessable("metric_id is required"));
    }
    let belongs = spec.metrics.iter().any(|m| m == &body.metric_id)
        || spec
            .series
            .iter()
            .any(|s| s.metric.as_deref() == Some(body.metric_id.as_str()));
    if !belongs {
        return Err(ApiError::unprocessable(
            "metric_id is not part of this chart",
        ));
    }
    if !body.rule.threshold.is_finite() {
        return Err(ApiError::unprocessable("threshold must be finite"));
    }
    if matches!(body.rule.kind, RuleKind::BandBreach) && body.rule.secondary.is_none() {
        return Err(ApiError::unprocessable(
            "band_breach requires a secondary threshold",
        ));
    }
    if !(60..=2_592_000).contains(&body.cooldown_seconds) {
        return Err(ApiError::unprocessable(
            "cooldown_seconds must be between 60 and 2592000",
        ));
    }
    if let Some(url) = &body.delivery.webhook_url {
        if !(url.starts_with("https://") || url.starts_with("http://")) {
            return Err(ApiError::unprocessable("webhook_url must be http(s)"));
        }
    }
    Ok(())
}

pub async fn list(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    require_user(&user)?;
    let rows = sqlx::query_as::<_, Alert>(
        "SELECT id, chart_id, metric_id, rule, delivery, is_active, cooldown_seconds,
                last_evaluated_at, created_at
         FROM chart_alerts WHERE user_id = $1 ORDER BY created_at DESC",
    )
    .bind(user.0.id)
    .fetch_all(&state.pg)
    .await
    .map_err(|_| ApiError::service_unavailable("alert store unavailable"))?;
    Ok(Json(json!(rows)))
}

pub async fn create(
    State(state): State<AppState>,
    user: CurrentUser,
    Json(body): Json<AlertCreate>,
) -> Result<Json<Value>, ApiError> {
    require_user(&user)?;
    validate_create(&body)?;
    let row = sqlx::query_as::<_, Alert>(
        "INSERT INTO chart_alerts (id, user_id, chart_id, metric_id, rule, delivery, cooldown_seconds)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, chart_id, metric_id, rule, delivery, is_active, cooldown_seconds,
                   last_evaluated_at, created_at",
    )
    .bind(Uuid::new_v4())
    .bind(user.0.id)
    .bind(&body.chart_id)
    .bind(&body.metric_id)
    .bind(serde_json::to_value(&body.rule).unwrap_or(Value::Null))
    .bind(serde_json::to_value(&body.delivery).unwrap_or(Value::Null))
    .bind(body.cooldown_seconds)
    .fetch_one(&state.pg)
    .await
    .map_err(|_| ApiError::service_unavailable("alert store unavailable"))?;
    Ok(Json(json!(row)))
}

pub async fn update(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(body): Json<AlertUpdate>,
) -> Result<Json<Value>, ApiError> {
    require_user(&user)?;
    if let Some(rule) = &body.rule {
        if !rule.threshold.is_finite() {
            return Err(ApiError::unprocessable("threshold must be finite"));
        }
        if matches!(rule.kind, RuleKind::BandBreach) && rule.secondary.is_none() {
            return Err(ApiError::unprocessable(
                "band_breach requires a secondary threshold",
            ));
        }
    }
    if let Some(seconds) = body.cooldown_seconds {
        if !(60..=2_592_000).contains(&seconds) {
            return Err(ApiError::unprocessable(
                "cooldown_seconds must be between 60 and 2592000",
            ));
        }
    }
    let rule = body
        .rule
        .as_ref()
        .map(|r| serde_json::to_value(r).unwrap_or(Value::Null));
    let delivery = body
        .delivery
        .as_ref()
        .map(|d| serde_json::to_value(d).unwrap_or(Value::Null));
    let row = sqlx::query_as::<_, Alert>(
        "UPDATE chart_alerts SET
            rule = COALESCE($3, rule),
            delivery = COALESCE($4, delivery),
            is_active = COALESCE($5, is_active),
            cooldown_seconds = COALESCE($6, cooldown_seconds)
         WHERE id = $1 AND user_id = $2
         RETURNING id, chart_id, metric_id, rule, delivery, is_active, cooldown_seconds,
                   last_evaluated_at, created_at",
    )
    .bind(id)
    .bind(user.0.id)
    .bind(rule)
    .bind(delivery)
    .bind(body.is_active)
    .bind(body.cooldown_seconds)
    .fetch_optional(&state.pg)
    .await
    .map_err(|_| ApiError::service_unavailable("alert store unavailable"))?
    .ok_or_else(|| ApiError::not_found("Alert not found"))?;
    Ok(Json(json!(row)))
}

pub async fn delete(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    require_user(&user)?;
    let result = sqlx::query("DELETE FROM chart_alerts WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user.0.id)
        .execute(&state.pg)
        .await
        .map_err(|_| ApiError::service_unavailable("alert store unavailable"))?;
    if result.rows_affected() == 0 {
        return Err(ApiError::not_found("Alert not found"));
    }
    Ok(Json(json!({"deleted": true})))
}

pub async fn events(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    require_user(&user)?;
    let owns: Option<Uuid> =
        sqlx::query_scalar("SELECT id FROM chart_alerts WHERE id = $1 AND user_id = $2")
            .bind(id)
            .bind(user.0.id)
            .fetch_optional(&state.pg)
            .await
            .map_err(|_| ApiError::service_unavailable("alert store unavailable"))?;
    if owns.is_none() {
        return Err(ApiError::not_found("Alert not found"));
    }
    let rows = sqlx::query_as::<_, AlertEvent>(
        "SELECT id, alert_id, value, threshold, fired_at, delivered_at, payload
         FROM chart_alert_events WHERE alert_id = $1 ORDER BY fired_at DESC LIMIT 100",
    )
    .bind(id)
    .fetch_all(&state.pg)
    .await
    .map_err(|_| ApiError::service_unavailable("alert store unavailable"))?;
    Ok(Json(json!(rows)))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/alerts", axum::routing::get(list).post(create))
        .route(
            "/api/v1/alerts/{id}",
            axum::routing::patch(update).delete(delete),
        )
        .route("/api/v1/alerts/{id}/events", axum::routing::get(events))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rule(kind: RuleKind, threshold: f64) -> AlertRule {
        AlertRule {
            kind,
            threshold,
            secondary: None,
        }
    }

    #[test]
    fn above_and_below() {
        assert!(evaluate(&rule(RuleKind::Above, 10.0), None, 11.0));
        assert!(!evaluate(&rule(RuleKind::Above, 10.0), None, 10.0));
        assert!(evaluate(&rule(RuleKind::Below, 10.0), None, 9.0));
    }

    #[test]
    fn crosses_need_previous() {
        assert!(evaluate(&rule(RuleKind::CrossUp, 10.0), Some(9.0), 11.0));
        assert!(!evaluate(&rule(RuleKind::CrossUp, 10.0), None, 11.0));
        assert!(evaluate(&rule(RuleKind::CrossDown, 10.0), Some(11.0), 9.0));
    }

    #[test]
    fn pct_change_uses_previous() {
        assert!(evaluate(
            &rule(RuleKind::PctChange, 10.0),
            Some(100.0),
            111.0
        ));
        assert!(!evaluate(
            &rule(RuleKind::PctChange, 10.0),
            Some(100.0),
            105.0
        ));
    }

    #[test]
    fn band_breach_uses_bounds() {
        let mut r = rule(RuleKind::BandBreach, 1.0);
        r.secondary = Some(3.0);
        assert!(!evaluate(&r, None, 2.0));
        assert!(evaluate(&r, None, 3.5));
        assert!(evaluate(&r, None, 0.5));
    }

    #[test]
    fn rejects_metric_outside_chart() {
        let body = AlertCreate {
            chart_id: "valuation.mvrv".into(),
            metric_id: "sopr_daily".into(),
            rule: rule(RuleKind::Above, 1.0),
            delivery: AlertDelivery::default(),
            cooldown_seconds: 3600,
        };
        assert_eq!(validate_create(&body).unwrap_err().status, 422);
    }

    #[test]
    fn rejects_band_without_second_bound() {
        let body = AlertCreate {
            chart_id: "valuation.mvrv".into(),
            metric_id: "mvrv_daily".into(),
            rule: rule(RuleKind::BandBreach, 1.0),
            delivery: AlertDelivery::default(),
            cooldown_seconds: 3600,
        };
        assert_eq!(validate_create(&body).unwrap_err().status, 422);
    }
}

#[derive(Debug, Clone, FromRow)]
struct DueAlert {
    id: Uuid,
    metric_id: String,
    rule: Value,
    delivery: Value,
    cooldown_seconds: i32,
    last_evaluated_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct EvalSummary {
    pub evaluated: usize,
    pub fired: usize,
    pub skipped: usize,
}

fn parse_rule(value: &Value) -> Option<AlertRule> {
    serde_json::from_value(value.clone()).ok()
}

fn bucket_for(value: &str) -> chrono::DateTime<chrono::Utc> {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(value) {
        return dt.to_utc();
    }
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S") {
        return dt.and_utc();
    }
    if let Ok(date) = chrono::NaiveDate::parse_from_str(value.get(0..10).unwrap_or(""), "%Y-%m-%d")
    {
        return date.and_hms_opt(0, 0, 0).unwrap().and_utc();
    }
    chrono::Utc::now()
}

/// Evaluate every active alert against the latest metric points.
///
/// Called by the separate `scheduler` binary. Each event is keyed by
/// `(alert_id, data bucket, rule hash)` so a re-run cannot duplicate it.
pub async fn evaluate_due(
    pg: &sqlx::PgPool,
    ch: &crate::ch::ChClient,
) -> Result<EvalSummary, ApiError> {
    let alerts = sqlx::query_as::<_, DueAlert>(
        "SELECT id, metric_id, rule, delivery, cooldown_seconds, last_evaluated_at
         FROM chart_alerts WHERE is_active",
    )
    .fetch_all(pg)
    .await
    .map_err(|_| ApiError::service_unavailable("alert store unavailable"))?;

    let mut summary = EvalSummary {
        evaluated: 0,
        fired: 0,
        skipped: 0,
    };

    // Group by metric: one ClickHouse query per metric per tick instead of
    // one per alert.
    let mut by_metric: std::collections::HashMap<String, Vec<DueAlert>> =
        std::collections::HashMap::new();
    for alert in alerts {
        by_metric
            .entry(alert.metric_id.clone())
            .or_default()
            .push(alert);
    }

    for (metric_id, alerts) in by_metric {
        let Some(metric) = crate::metrics::registry::by_id(&metric_id) else {
            summary.evaluated += alerts.len();
            summary.skipped += alerts.len();
            continue;
        };
        let kind = if metric.sql.contains("{from:DateTime}") {
            "DateTime"
        } else {
            "Date"
        };
        let now = chrono::Utc::now();
        let from = if kind == "DateTime" {
            (now - chrono::Duration::days(3))
                .format("%Y-%m-%d %H:%M:%S")
                .to_string()
        } else {
            (now - chrono::Duration::days(10))
                .format("%Y-%m-%d")
                .to_string()
        };
        let to = if kind == "DateTime" {
            now.format("%Y-%m-%d %H:%M:%S").to_string()
        } else {
            now.format("%Y-%m-%d").to_string()
        };
        let Ok(series) = crate::metrics::service::get_series(ch, &metric_id, &from, &to).await
        else {
            summary.evaluated += alerts.len();
            summary.skipped += alerts.len();
            continue;
        };
        let points: Vec<_> = series.points.iter().filter(|p| p.v.is_some()).collect();
        let Some(latest) = points.last() else {
            summary.evaluated += alerts.len();
            summary.skipped += alerts.len();
            continue;
        };
        let current = latest.v.unwrap_or_default();
        let previous = if points.len() >= 2 {
            points[points.len() - 2].v
        } else {
            None
        };
        let bucket = bucket_for(&latest.t);

        for alert in alerts {
            summary.evaluated += 1;
            let Some(rule) = parse_rule(&alert.rule) else {
                summary.skipped += 1;
                continue;
            };
            if !evaluate(&rule, previous, current) {
                summary.skipped += 1;
                continue;
            }
            if let Some(last) = alert.last_evaluated_at {
                if (now - last).num_seconds() < alert.cooldown_seconds as i64 {
                    summary.skipped += 1;
                    continue;
                }
            }
            let rule_hash = serde_json::to_string(&alert.rule).unwrap_or_else(|_| "rule".into());
            let payload = serde_json::json!({
                "metric": alert.metric_id,
                "value": current,
                "threshold": rule.threshold,
                "kind": rule.kind,
                "delivery": alert.delivery,
            });
            let inserted = sqlx::query(
                "INSERT INTO chart_alert_events (id, alert_id, value, threshold, bucket_ts, rule_hash, payload)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (alert_id, bucket_ts, rule_hash) DO NOTHING",
            )
            .bind(Uuid::new_v4())
            .bind(alert.id)
            .bind(current)
            .bind(rule.threshold)
            .bind(bucket)
            .bind(&rule_hash)
            .bind(&payload)
            .execute(pg)
            .await;

            match inserted {
                Ok(result) if result.rows_affected() > 0 => {
                    if let Err(err) = sqlx::query(
                        "UPDATE chart_alerts SET last_evaluated_at = now() WHERE id = $1",
                    )
                    .bind(alert.id)
                    .execute(pg)
                    .await
                    {
                        tracing::warn!(alert_id = %alert.id, error = %err, "alert timestamp update failed");
                    }
                    summary.fired += 1;
                }
                Ok(_) => summary.skipped += 1,
                Err(err) => {
                    tracing::warn!(alert_id = %alert.id, error = %err, "alert event insert failed");
                    summary.skipped += 1;
                }
            }
        }
    }

    Ok(summary)
}

#[cfg(test)]
mod eval_tests {
    use super::*;

    #[test]
    fn bucket_parses_daily_and_rfc3339() {
        assert_eq!(
            bucket_for("2024-01-02").to_rfc3339(),
            "2024-01-02T00:00:00+00:00"
        );
        assert_eq!(
            bucket_for("2024-01-02T03:04:05Z").to_rfc3339(),
            "2024-01-02T03:04:05+00:00"
        );
        assert_eq!(
            bucket_for("2024-01-02 03:04:05").to_rfc3339(),
            "2024-01-02T03:04:05+00:00"
        );
    }

    #[test]
    fn rule_json_roundtrip() {
        let rule: AlertRule = serde_json::from_str(r#"{"kind":"above","threshold":10}"#).unwrap();
        assert_eq!(rule.kind, RuleKind::Above);
    }
}
