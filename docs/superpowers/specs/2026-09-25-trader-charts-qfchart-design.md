# Trader Charts + Drawings Design — QFChart for Everything (2026-09-25)

## Goal
Make CypherGlass usable by traders: price action, onchain overlays, TA indicators,
and drawing tools on ANY chart via one shared side panel. Single chart stack:
QFChart (`@qfo/qfchart`, Apache-2.0, ECharts-based) everywhere.

## Context
- `frontend/src/components/ChartPane.tsx` — single ECharts `line` series, one metric at a time.
- `frontend/src/routes/Dashboard.tsx` — one active metric card, ranges 7/30/90, grain select.
- `backend/app/metrics/registry.py` — price entries select `close` only; OHLCV exists in
  `bitcoin.price_ohlc_hourly/daily` (`clickhouse/init/03_schema_v2.sql`) but is never exposed.
- Decisions this session: price action + onchain overlays both in scope; QFChart for ALL
  charts (incl. onchain trend-line drawings); drawings local-first (localStorage, export/import
  JSON, schema versioned for later backend sync); TA computed frontend-side.

## Architecture
- One chart engine: QFChart instance per chart card (price hero + onchain cards).
  Remove direct `echarts-for-react` usage from chart cards; keep `echarts` as QFChart peer dep.
- New `PriceChart` component: wraps QFChart, `setMarketData(OHLCV)` + `updateData()` for live ticks.
- New `OnchainChart` adapter: maps onchain `{t, v}` series onto QFChart. Implementation inspects
  QFChart src at build time; primary approach is onchain series as QFChart indicator line plots
  on the shared time axis (price optional second overlay). Fallback if QFChart requires market
  data: synthetic flat bars (o=h=l=c=v, volume 0) hidden, real data as indicator plots.
  No fork of QFChart; adapter lives in our repo.
- New `DrawingPanel` side toolbar rendered for EVERY chart card: trend line, horizontal line/ray,
  rectangle/zone, Fibonacci retracement, measure, text/label (if QFChart exposes it, else deferred),
  clear + undo. Panel drives QFChart plugin API (`LineTool`, `FibonacciTool`, `MeasureTool`
  registered per instance). Same panel, same UX, price or onchain.
- New `lib/drawings.ts` store: localStorage keyed `cg-drawings:<chartKey>:v1`, export/import JSON,
  schema version field for future backend sync. Drawings never affect series queries.
- New `lib/indicators.ts`: MA, EMA, RSI, MACD, Bollinger computed from closes in browser.
- Dashboard layout: price hero (candles + volume + TA overlays + pane indicators RSI/MACD) plus
  onchain cards each with overlay selector (e.g. MVRV+price, SOPR+price, fees+price, NUPL+price),
  dual-axis rendering, synced crosshair where QFChart supports it, fullscreen per card.

## Data flow
- Backend: add OHLCV series endpoint (e.g. `GET /api/v1/metrics/price_ohlc_{daily,hourly}/ohlc`
  returning `{time, open, high, low, close, volume}` bars from `bitcoin.price_ohlc_*`).
  Reads price tables only — consistent with catalog rule (`test_metrics_catalog.py` allows
  `bitcoin.price_ohlc`). No new MVs/marts.
- Frontend: fetch OHLCV once per grain/range; compute TA client-side; feed QFChart
  `setMarketData` + `addIndicator(isOverlay / pane)`. Onchain overlays fetched via existing
  `/series` endpoints in parallel and merged client-side (no join endpoint in v1).
- Drawings: user draws → plugin state → `drawingStore.save(chartKey)` → localStorage;
  reload restores; export/import via JSON file buttons in panel.

## Components / files
- `frontend/src/components/PriceChart.tsx` (new) — QFChart wrapper, candles+volume+TA.
- `frontend/src/components/OnchainChart.tsx` (new) — QFChart adapter for `{t,v}` series + price overlay.
- `frontend/src/components/DrawingPanel.tsx` (new) — side toolbar, works with any chart instance.
- `frontend/src/lib/indicators.ts` (new) — MA/EMA/RSI/MACD/Bollinger, pure functions + tests.
- `frontend/src/lib/drawings.ts` (new) — localStorage store, schema v1, export/import + tests.
- `frontend/src/routes/Dashboard.tsx` (edit) — hero + cards layout, overlay selectors, fullscreen.
- `frontend/src/components/ChartPane.tsx` (remove/replace) — superseded by above; delete after migration.
- `backend/app/metrics/router.py` + `service.py` (edit) — OHLCV endpoint; `registry.py` untouched or
  plus ohlc entries; tests for endpoint shape/params.
- `frontend/package.json` (edit) — add `@qfo/qfchart` (peer `echarts` already present).

## Error handling
- Empty OHLCV → card shows "No data" state (existing pattern), drawings panel disabled until data loads.
- Indicator compute guards: insufficient bars → indicator hidden with tooltip note, no throw.
- Corrupt drawing JSON on import/load → reject with message, keep existing drawings intact.
- QFChart adapter fallback (synthetic bars) chosen at implementation time after src inspection;
  spec does not lock the mechanism, only the UX contract (onchain draws work identically).

## Testing
- Vitest: `indicators.ts` golden-vector tests (MA/EMA/RSI/MACD/Bollinger), `drawings.ts` roundtrip +
  corrupt-import rejection, component render tests for Price/Onchain/DrawingPanel.
- Backend: OHLC endpoint param/shape tests (from/to normalization reuse `_norm`).
- Manual: headed Playwright pass (user preference: non-headless) — candles, overlay, draw/save/reload,
  export/import.

## Scope check (single plan)
Price hero + onchain adapter + shared drawing panel + OHLC endpoint + frontend TA. Deferred:
backend-synced drawings, alerts, custom date ranges beyond extended presets, live websocket ticks
(`updateData` path kept open but fed by polling in v1).

## Self-review
- No TBDs; QFChart mechanism risk explicitly left to implementation-time inspection with fallback.
- Consistent: single stack everywhere per user correction; drawings identical on onchain charts.
- Focused: one plan; sync/alerts/live-socket deferred by name.
