# Chart platform implementation status

**Date:** 2026-11-25  
**Design:** `docs/superpowers/specs/2026-11-24-chart-platform-parity-design.md`  
**Plan:** `docs/superpowers/plans/2026-11-24-chart-platform-parity.md`

This is the evidence-backed status of the implementation, separate from the design-complete parity score in `parity-ledger.md`.

## Shipped in this pass

| Area | Implementation | Evidence |
|---|---|---|
| Catalog generation | YAML → typed frontend catalog + backend JSON | `python3 scripts/generate_chart_catalog.py --check` |
| Catalog validation | 109 charts, 267/267 metrics, axes, variants, series, ledger ids | `python3 scripts/verify_chart_catalog.py --ledger docs/charts/parity-ledger.md --self-test` |
| Backend chart API | index, spec, multi-series, CSV, OHLC alias | `GET /api/v1/charts`, `/charts/{id}`, `/charts/{id}/series`, `/charts/{id}/series.csv`, `/ohlc/{grain}` |
| Series transforms | raw, %, index=100, z-score, SMA7/SMA30, downsampling | `cargo test -p backend-rs --lib charts::` |
| Chart controls | range presets incl. All/Cycle/custom, grain, per-axis log, halvings, thresholds, % mode, legend toggles | Playwright smoke at 1440 |
| Archetype renderers | time series/candles, histogram, price distribution, heatmap, scatter, table, gauge, dashboard grid | `src/charts/__tests__/renderers.test.ts` |
| Catalog UI | 109-card searchable catalog, category filter | Playwright smoke: 109 cards |
| Chart page | `/charts/:chartId`, URL state, variant tabs, legend, screenshot, CSV, share, save layout, alert creation | Playwright smoke: `valuation.mvrv`, `price.btc`, `supply.hodl_waves`, `risk.composite`, `technical.seasonality`, `urpd.distribution` |
| Alerts | backend CRUD/events; pure evaluator; `chart-alerts` scheduler job | `cargo test -p backend-rs --lib charts::alerts`; scheduler `cargo check` |
| Layouts | persisted range/grain/variant/axes/series/annotations state | live `POST/GET/DELETE /api/v1/charts/layouts` |
| Annotations | server snapshot per user/chart/variant, schema version, 1 MB cap | live `PUT/GET/DELETE /api/v1/charts/{id}/annotations` |
| Compare | 4-slot index=100 overlay, shared crosshair, Pearson matrix | Playwright smoke `/compare` |
| Mobile CSS | 360/768 breakpoints, wrapping toolbar, scrollable tables | CSS in `frontend/src/index.css` |
| Data-required states | new charts stay addressable and explain missing ingest | `/charts/urpd.distribution` shows `urpd_bins` requirement |

## Verification commands

```bash
python3 scripts/verify_chart_catalog.py --ledger docs/charts/parity-ledger.md --self-test
python3 scripts/build_chart_docs.py --check
cd frontend && npm run charts:check
cd frontend && npx vitest run
cd frontend && npx tsc --noEmit
cargo test -p backend-rs
cargo check -p scheduler
```

Latest observed results:

```text
self-test OK: broken catalog rejected
catalog OK: 109 charts, 267/267 metrics, 0 unknown
chart docs OK
chart catalog OK: 109 charts, 267 metrics
frontend: 44 test files, 378 tests passed
tsc: exit 0
backend-rs: all tests passed
scheduler: cargo check passed
```

Live smoke against the running ClickHouse sample (2009-01-03 → 2010-03-05):

- `valuation.mvrv` → MVRV, MVRV SMA30, BTC price on a visible log right axis.
- `price.btc` → 422 candles + SMA20/50/200 + EMA21 + volume pane.
- `supply.hodl_waves` → 8 stacked age bands; % mode normalises.
- `risk.composite` → gauge 38.9 with history.
- `technical.seasonality` → monthly return table.
- `cycle.200w` → time × heat strip, `technical.monthly_returns`/`drawdown_table` → tables.
- `fees.buckets` → stacked fee-rate areas.
- `compare` → normalised overlay and symmetric correlation matrix.
- `urpd.distribution` → explicit data-required state, no fake values.
- Full-history price now returns `from=2009-01-03`, `to=2010-03-05`, chronological points; `max_points=100` returned 64 bars (not the raw 422); `max_points=20` returns 422.

## Deliberate deviations (rulings)

1. **ECharts renderer instead of QFChart for generic chart pages.** QFChart exposes no log axis, per-axis scale, or dual visible axis. The design requires those in AXIS-02/06 and TYPE-01. QFChart remains the engine for the existing Dashboard price/onchain charts and the 52-tool drawing kit. Cost: drawing tools are not yet available on the new `/charts` pages.
2. **Downsampling is min/max bucket, not LTTB.** This preserves isolated onchain spikes by construction, and the response is still bounded by `max_points`. Cost: point count is an upper bound, not an exact target.
3. **Derived chart-only tables (seasonality, monthly returns, drawdown episodes) are computed in the renderer for now.** They are explicitly listed as `new_metrics`; moving them to SQL/Rust is the next data task (DATA-01).
4. **Alert delivery is in-app/event-store only.** Webhook and email delivery are modelled and stored but not dispatched yet (ALR-04/76).
5. **Chart pages share server-persisted layouts and annotations with the Dashboard drawing kit through the same schema, but the page canvas is ECharts.** Wiring the 52-tool panel onto the chart page is an explicit next task.

## Remaining chart work

- 41 new charts are catalogued; 33 depend on data that is not ingested (URPD, Cointime, cohort SOPR/PnL, sell-side risk, supply in profit, options, liquidations, term structure, ETF balances, treasuries, exchange balances, miner models, rainbow, risk-adjusted/inflation-adjusted series).
- Charts with existing data render through the shared archetypes; each still needs its chart-specific visual snapshot and competitor review before `parity-ledger.md` moves from `not_started` to `shipped`.
- Price/valuation/risk/supply/seasonality pages are smoke-tested; the remaining families use the same renderers but need the batch visual pass from plan tasks 15–24.
- Mobile visual snapshots at 360/768 and light/other themes still need a Playwright pass (MOB-01..08).
- The production build succeeds but the ECharts chunk is ~374 KB gzip, above the 350 KB target in PERF-06. Modular ECharts imports or route-level lazy loading is the fix.
- Workbench, DCA/exit/portfolio simulators, and AI explanations remain plan task 27.

## How to mark a chart shipped

Only after:

1. its acceptance list in `chart-by-chart.md` passes,
2. default + every variant has a visual snapshot at 1440 and 360,
3. data-contract test resolves every series and preserves nulls,
4. competitor review is recorded,
5. `implementation: shipped` is set in the catalog and the tracker is regenerated.
