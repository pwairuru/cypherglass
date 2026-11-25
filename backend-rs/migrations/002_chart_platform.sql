-- Chart platform persistence: layouts, annotation snapshots, alert rules/events.

CREATE TABLE IF NOT EXISTS chart_layouts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    chart_id TEXT,
    spec JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_chart_layouts_user ON chart_layouts (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_chart_layouts_chart ON chart_layouts (chart_id);

CREATE TABLE IF NOT EXISTS chart_annotations (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chart_id TEXT NOT NULL,
    variant_id TEXT NOT NULL DEFAULT '',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    schema_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_chart_annotation UNIQUE (user_id, chart_id, variant_id)
);
CREATE INDEX IF NOT EXISTS ix_chart_annotations_user ON chart_annotations (user_id, chart_id);

CREATE TABLE IF NOT EXISTS chart_alerts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chart_id TEXT NOT NULL,
    metric_id TEXT NOT NULL,
    rule JSONB NOT NULL DEFAULT '{}'::jsonb,
    delivery JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    cooldown_seconds INT NOT NULL DEFAULT 3600,
    last_evaluated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_chart_alerts_active ON chart_alerts (is_active, last_evaluated_at);
CREATE INDEX IF NOT EXISTS ix_chart_alerts_user ON chart_alerts (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chart_alert_events (
    id UUID PRIMARY KEY,
    alert_id UUID NOT NULL REFERENCES chart_alerts(id) ON DELETE CASCADE,
    value DOUBLE PRECISION,
    threshold DOUBLE PRECISION,
    bucket_ts TIMESTAMPTZ NOT NULL,
    rule_hash TEXT NOT NULL,
    fired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at TIMESTAMPTZ,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT uq_chart_alert_event UNIQUE (alert_id, bucket_ts, rule_hash)
);
CREATE INDEX IF NOT EXISTS ix_chart_alert_events_alert ON chart_alert_events (alert_id, fired_at DESC);

CREATE TABLE IF NOT EXISTS chart_favorites (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chart_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, chart_id)
);
