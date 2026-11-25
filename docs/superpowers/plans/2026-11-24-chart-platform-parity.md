# CypherGlass Chart Platform Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a catalog-driven chart platform that reaches 98% design and implementation parity with ITC, Bitcoin Magazine Pro / LookIntoBitcoin and Checkonchain, excluding social data.

**Architecture:** `docs/charts/chart-catalog.yaml` is the single source of truth. A build script generates typed frontend specs and a backend catalog JSON. One `ChartHost` renders every chart through archetype renderers (QFChart for time series, ECharts/HTML for histogram, heatmap, scatter, table, gauge). Chart pages are configuration, not components. All state is URL-encoded and server-persisted where needed.

**Tech Stack:** React 19, TypeScript, Vite, TanStack Query, QFChart, ECharts, Vitest, Playwright; Rust/Axum, ClickHouse, PostgreSQL, Redis/Valkey.

**Spec:** `docs/superpowers/specs/2026-11-24-chart-platform-parity-design.md`

## Global Constraints

- `docs/charts/chart-catalog.yaml` is the only chart source of truth. No hand-written chart arrays in React.
- All 267 registry metrics must remain covered by at least one catalog chart; `scripts/verify_chart_catalog.py` is a CI gate.
- No chart-specific page components. Additions go through catalog + shared renderers.
- Null is a gap, never zero. No client-side interpolation.
- Every series has a visible axis, unit and legend entry.
- No 1,826-day or 5,000-point truncation. Use pagination/downsampling with `max_points`.
- Log scale must reject or flag values ≤ 0.
- URL state must round-trip range, grain, variant, axes, series, transforms, theme and layout.
- Social sentiment/news/video/community is out of scope; everything else in the parity ledger is in scope.
- Every chart batch ends with the acceptance checklist in `docs/charts/chart-by-chart.md`.
- Tests are written before implementation. No batch is complete without visual and data-contract tests.

## Review Focus

These are the failure modes most likely to break charts without failing a happy-path test:

1. **Timezone and date boundaries.** A daily point at `2024-01-01` must render at the same date in UTC and local modes; range filters must not drop the first/last bucket.
2. **Null and zero handling.** Sparse early-chain days must break lines, not draw through zero; `0` must remain a real value where the metric is zero.
3. **Dual-axis scale drift.** Hiding the price series must remove the right axis and rescale the left; toggling log must not silently change the other axis.
4. **Stacked percent denominator.** Hidden series must be excluded from the denominator, and nulls must not become zero-share bands.
5. **Downsampling extrema.** LTTB must preserve min/max points; a 5,000-point series must not lose a spike when rendered at 2,000 points.

Each line has an explicit test in the task that owns the code.

---

### Task 0: Catalog, validator and generated docs

**Files:**
- Create: `docs/charts/chart-catalog.yaml` (exists)
- Create: `docs/charts/chart-by-chart.md` (exists)
- Create: `scripts/verify_chart_catalog.py`
- Create: `scripts/build_chart_docs.py`
- Modify: `README.md`

**Interfaces:**
- Consumes: `backend-rs/src/metrics/registry.rs`
- Produces: `verify_chart_catalog.py` exit 0/1; `build_chart_docs.py` regenerates markdown.

- [ ] **Step 1: Write the validator test fixture**

Add a `--self-test` mode that builds a tiny in-memory catalog missing one metric and asserts exit 1, then a valid catalog and asserts exit 0.

- [ ] **Step 2: Implement `scripts/verify_chart_catalog.py`**

Parse registry metrics with the same `Metric { ... }` regex used by `scripts/build_chart_docs.py`. Check:
- unique chart ids
- required fields
- every metric covered at least once
- no unknown metric ids in `metrics`, `variants[].series`, or `series[].metric`
- OHLC series fields resolve
- default metric exists
- every `new_metrics` name is non-empty
- parity ledger chart ids exist (optional `--ledger`)

Print `catalog OK: 109 charts, 267/267 metrics, 0 unknown`.

- [ ] **Step 3: Implement `scripts/build_chart_docs.py`**

Read YAML, render `docs/charts/chart-by-chart.md`, fail if the generated file differs from disk (`--check`).

- [ ] **Step 4: Run both**

Run: `python3 scripts/verify_chart_catalog.py`
Expected: `catalog OK: 109 charts, 267/267 metrics, 0 unknown`
Run: `python3 scripts/build_chart_docs.py --check`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add docs/charts scripts/verify_chart_catalog.py scripts/build_chart_docs.py README.md
git commit -m "docs: add chart catalog, parity ledger and validator"
```

---

### Task 1: ChartSpec types and generated catalog

**Files:**
- Create: `frontend/src/charts/types.ts`
- Create: `frontend/src/charts/generated/catalog.ts` (generated)
- Create: `frontend/src/charts/registry.ts`
- Create: `frontend/src/charts/__tests__/catalog.test.ts`
- Create: `scripts/generate_chart_catalog.py`
- Modify: `frontend/package.json` scripts

**Interfaces:**
- Consumes: `docs/charts/chart-catalog.yaml`
- Produces: `getChart(id): ChartSpec | undefined`, `listCharts(): ChartSummary[]`, `chartsByCategory(): Record<string, ChartSummary[]>`.

- [ ] **Step 1: Write the failing test**

```ts
import { getChart, listCharts } from "../registry";
import { describe, expect, it } from "vitest";

describe("chart catalog", () => {
  it("loads all 109 charts", () => expect(listCharts()).toHaveLength(109));
  it("finds MVRV", () => expect(getChart("valuation.mvrv")?.title).toContain("MVRV"));
  it("rejects unknown charts", () => expect(getChart("nope")).toBeUndefined());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/charts/__tests__/catalog.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement types and generator**

Copy the `ChartSpec` contract from spec section 8.2. Generator emits a frozen array and a `Map`. Add `npm run charts:generate` and `charts:check`.

- [ ] **Step 4: Run test and generator check**

Run: `npx vitest run src/charts/__tests__/catalog.test.ts`
Expected: PASS.
Run: `npm run charts:check`
Expected: generated file matches YAML.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/charts scripts/generate_chart_catalog.py frontend/package.json
git commit -m "feat(charts): add catalog types and generated specs"
```

---

### Task 2: ChartHost and TimeSeriesRenderer (price.btc)

**Files:**
- Create: `frontend/src/components/chart/ChartHost.tsx`
- Create: `frontend/src/charts/renderers/TimeSeriesRenderer.tsx`
- Create: `frontend/src/charts/data.ts`
- Create: `frontend/src/hooks/useChartData.ts`
- Create: `frontend/src/components/chart/__tests__/ChartHost.test.tsx`
- Modify: `frontend/src/routes/Dashboard.tsx` (feature flag)

**Interfaces:**
- Consumes: `ChartSpec`, `getChart`, `/api/v1/charts/{id}/series`
- Produces: `<ChartHost chartId="price.btc" />`, `useChartData(spec, state)` returning `{ data, isLoading, isError, error }`.

- [ ] **Step 1: Write the failing test**

Assert ChartHost renders `data-testid="chart-canvas"`, calls the series endpoint once for `price.btc`, and renders a loading skeleton then the chart.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/chart/__tests__/ChartHost.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement ChartHost + renderer**

`ChartHost` selects renderer by `spec.archetype`, owns query/error boundary, and passes normalized `ChartData`. `TimeSeriesRenderer` mounts QFChart, supports OHLC, line, area, bar, MA overlays and halving markers.

- [ ] **Step 4: Run test and compare with existing price chart**

Run: `npx vitest run src/components/chart/__tests__/ChartHost.test.tsx`
Expected: PASS.
Run the app and compare `price.btc` candles with the current `PriceChart` at 1D/1Y; values must match.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chart frontend/src/charts frontend/src/hooks
git commit -m "feat(charts): add ChartHost and time-series renderer"
```

---

### Task 3: Range, grain and URL state

**Files:**
- Create: `frontend/src/charts/ranges.ts`
- Create: `frontend/src/charts/urlState.ts`
- Create: `frontend/src/charts/state.ts`
- Create: `frontend/src/components/chart/RangeControls.tsx`
- Create: `frontend/src/charts/__tests__/ranges.test.ts`
- Create: `frontend/src/charts/__tests__/urlState.test.ts`

**Interfaces:**
- Produces: `resolveRange(preset, now): {from,to}`, `autoGrain(range)`, `parseChartState(search): ChartState`, `serializeChartState(state): string`.

- [ ] **Step 1: Write failing tests**

```ts
it("cycle starts at the 2024 halving", () => {
  expect(resolveRange("cycle", new Date("2026-01-01")).from).toBe("2024-04-20");
});
it("auto grain is weekly for 4Y", () => expect(autoGrain("4y")).toBe("weekly"));
it("round-trips log and series", () => {
  const s = parseChartState("?log=left&series=mvrv_daily:left:line:raw");
  expect(serializeChartState(s)).toContain("log=left");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/charts/__tests__/ranges.test.ts src/charts/__tests__/urlState.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement range presets and URL codec**

Presets: 1D,1W,1M,3M,6M,YTD,1Y,2Y,4Y,Cycle,All,Custom. Reject invalid dates. `All` returns `null` from/to (server resolves coverage). Include timezone.

- [ ] **Step 4: Add RangeControls and verify**

Run: `npx vitest run src/charts/__tests__/ranges.test.ts src/charts/__tests__/urlState.test.ts`
Expected: PASS.
Manual: change range, reload, state restored.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/charts frontend/src/components/chart/RangeControls.tsx
git commit -m "feat(charts): add range presets and URL state"
```

---

### Task 4: Axes, log scale and dual-axis controls

**Files:**
- Create: `frontend/src/components/chart/AxisControls.tsx`
- Create: `frontend/src/charts/format.ts`
- Create: `frontend/src/charts/__tests__/format.test.ts`
- Create: `frontend/src/components/chart/__tests__/AxisControls.test.tsx`
- Modify: `frontend/src/charts/renderers/TimeSeriesRenderer.tsx`

**Interfaces:**
- Produces: `formatValue(v, unit): string`, `buildAxisOptions(axes): EChartsAxis[]`, `toggleLog(axisId)`.

- [ ] **Step 1: Write failing tests**

```ts
it("formats USD trillions", () => expect(formatValue(2.096e12, "USD")).toBe("$2.10T"));
it("formats sats/vB", () => expect(formatValue(12.5, "sat/vB")).toBe("12.5 sat/vB"));
it("drops non-positive points on log axis", () => {
  expect(logSafe([1, 0, -2, 3])).toEqual([1, 3]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/charts/__tests__/format.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement formatters and axis options**

Axis header shows title, unit, scale, min/max, decimals, colour. Log toggle per axis. Manual min/max validation. Right axis hides when no series.

- [ ] **Step 4: Verify**

Run: `npx vitest run src/charts/__tests__/format.test.ts src/components/chart/__tests__/AxisControls.test.tsx`
Expected: PASS.
Manual: MVRV with price overlay shows two labelled axes; hiding price removes right axis.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chart/AxisControls.tsx frontend/src/charts/format.ts
git commit -m "feat(charts): add axis, log and dual-axis controls"
```

---

### Task 5: Series panel, transforms and legend

**Files:**
- Create: `frontend/src/components/chart/SeriesPanel.tsx`
- Create: `frontend/src/components/chart/Legend.tsx`
- Create: `frontend/src/charts/transforms.ts`
- Create: `frontend/src/charts/__tests__/transforms.test.ts`
- Create: `frontend/src/components/chart/__tests__/SeriesPanel.test.tsx`

**Interfaces:**
- Produces: `applyTransform(points, transform)`, `seriesKey(spec)`, `addSeries/removeSeries/reorderSeries`.

- [ ] **Step 1: Write failing tests**

```ts
it("percent change uses first visible value", () => expect(applyTransform([100,110], "pct")[1].v).toBe(10));
it("index=100 starts at 100", () => expect(applyTransform([50,75], "index")[1].v).toBe(150));
it("z-score preserves nulls", () => expect(applyTransform([1,null,3], "zscore")[1].v).toBeNull());
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/charts/__tests__/transforms.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement transforms and series UI**

Raw, %, index=100, z-score, BTC-denominated, SMA/EMA smoothing. Legend click hides, alt-click isolates, hover highlights. Series panel searches catalog metrics and enforces max 8.

- [ ] **Step 4: Verify**

Run: `npx vitest run src/charts/__tests__/transforms.test.ts src/components/chart/__tests__/SeriesPanel.test.tsx`
Expected: PASS.
Manual: add/remove series, toggle transform, reload URL.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chart/SeriesPanel.tsx frontend/src/components/chart/Legend.tsx frontend/src/charts/transforms.ts
git commit -m "feat(charts): add series, transforms and legend"
```

---

### Task 6: Bands, thresholds, halvings and multi-series time series

**Files:**
- Modify: `frontend/src/charts/renderers/TimeSeriesRenderer.tsx`
- Create: `frontend/src/charts/overlays.ts`
- Create: `frontend/src/charts/__tests__/overlays.test.ts`

**Interfaces:**
- Produces: `thresholdSeries(values, thresholds)`, `halvingMarkers()`, `bandPolygon(upper, lower)`.

- [ ] **Step 1: Write failing tests**

```ts
it("halving dates are exact", () => expect(halvingMarkers().map(m => m.date)).toEqual([
  "2012-11-28","2016-07-09","2020-05-11","2024-04-20"]));
it("band breaks on null", () => expect(bandPolygon([1,null,3],[0.5,null,2])).toHaveLength(2));
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/charts/__tests__/overlays.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement overlays**

Band fill with `connectNulls: false`; threshold lines labelled with unit; halving vertical lines; ATH marker; last-value line.

- [ ] **Step 4: Verify**

Run: `npx vitest run src/charts/__tests__/overlays.test.ts`
Expected: PASS.
Manual: MVRV bands and Pi Cycle overlays render.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/charts/renderers/TimeSeriesRenderer.tsx frontend/src/charts/overlays.ts
git commit -m "feat(charts): add bands, thresholds and event markers"
```

---

### Task 7: Histogram, heatmap, scatter, table and gauge renderers

**Files:**
- Create: `frontend/src/charts/renderers/DistributionRenderer.tsx`
- Create: `frontend/src/charts/renderers/HeatmapRenderer.tsx`
- Create: `frontend/src/charts/renderers/ScatterRenderer.tsx`
- Create: `frontend/src/charts/renderers/TableRenderer.tsx`
- Create: `frontend/src/charts/renderers/GaugeRenderer.tsx`
- Create: `frontend/src/charts/__tests__/renderers.test.tsx`

**Interfaces:**
- Consumes: `ChartRenderer` contract from spec 8.5.
- Produces: one renderer per archetype, selected by `ChartHost`.

- [ ] **Step 1: Write failing tests**

Assert each renderer mounts, renders a `data-testid`, handles empty data with an explicit message, and produces a PNG blob from `screenshot()`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/charts/__tests__/renderers.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement renderers**

ECharts histogram/heatmap/scatter/gauge; HTML table. Heatmap empty bins use background; scatter regression optional; table numeric sort; gauge thresholds.

- [ ] **Step 4: Verify**

Run: `npx vitest run src/charts/__tests__/renderers.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/charts/renderers frontend/src/charts/__tests__/renderers.test.tsx
git commit -m "feat(charts): add non-time-series renderers"
```

---

### Task 8: Multi-pane and volume

**Files:**
- Modify: `frontend/src/charts/renderers/TimeSeriesRenderer.tsx`
- Create: `frontend/src/components/chart/PaneResizer.tsx`
- Create: `frontend/src/components/chart/__tests__/Panes.test.tsx`

**Interfaces:**
- Produces: `paneHeights` in ChartState, `addPane/removePane/resizePane`.

- [ ] **Step 1: Write failing tests**

Assert price chart renders volume pane, pane heights persist in URL, and hiding volume removes the pane without a gap.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/chart/__tests__/Panes.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement panes**

QFChart multi-pane via `addIndicator(..., { paneIndex })` or ECharts grid; shared x-axis; crosshair sync; drag handle.

- [ ] **Step 4: Verify**

Run: `npx vitest run src/components/chart/__tests__/Panes.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/charts/renderers/TimeSeriesRenderer.tsx frontend/src/components/chart/PaneResizer.tsx
git commit -m "feat(charts): add multi-pane and volume support"
```

---

### Task 9: Variants, cohorts and metric parameters API

**Files:**
- Modify: `backend-rs/src/metrics/registry.rs`
- Modify: `backend-rs/src/metrics/service.rs`
- Create: `backend-rs/src/charts/params.rs`
- Create: `backend-rs/src/charts/series.rs`
- Create: `backend-rs/tests/chart_series_test.rs`
- Create: `frontend/src/components/chart/VariantTabs.tsx`
- Create: `frontend/src/components/chart/__tests__/VariantTabs.test.tsx`

**Interfaces:**
- Produces: `GET /api/v1/charts/{id}/series?metrics=...&cohort=...&params=...`; `ParamSpec` allowlist; `VariantTabs` bound to catalog variants.

- [ ] **Step 1: Write failing Rust test**

```rust
#[tokio::test]
async fn rejects_unknown_param() {
    let res = client.get("/api/v1/charts/valuation.mvrv/series?params={\"sql\":\"drop\"}").await;
    assert_eq!(res.status(), 422);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p backend-rs chart_series`
Expected: FAIL.

- [ ] **Step 3: Implement params and variants**

Allowlist: `ma_length`, `z_window`, `smoothing`, `bins`, `quantile_window`, `cohort`. Cohort values `all/sth/lth`. Reject unknown keys. Frontend tabs read `spec.variants`, preserve range.

- [ ] **Step 4: Verify**

Run: `cargo test -p backend-rs chart_series`
Expected: PASS.
Run: `npx vitest run src/components/chart/__tests__/VariantTabs.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend-rs/src/charts backend-rs/tests/chart_series_test.rs frontend/src/components/chart/VariantTabs.tsx
git commit -m "feat(charts): add variants, cohorts and parameter API"
```

---

### Task 10: Annotation editor and persistence

**Files:**
- Create: `backend-rs/src/charts/annotations.rs`
- Create: `backend-rs/migrations/003_chart_annotations.sql`
- Modify: `frontend/src/components/DrawingPanel.tsx`
- Modify: `frontend/src/components/DrawingStyleToolbar.tsx` (from the professional drawing kit; land that plan first)
- Modify: `frontend/src/lib/qfdraw/style.ts` (reuse, do not fork)
- Create: `frontend/src/components/chart/ObjectList.tsx`
- Create: `frontend/src/hooks/useAnnotations.ts`
- Create: `frontend/src/components/chart/__tests__/AnnotationPanel.test.tsx`

**Interfaces:**
- Produces: `GET/PUT /api/v1/charts/{id}/annotations`, `AnnotationSnapshot` with `schema_version`.
- Consumes: `DrawingPanel`, `DrawingStyleToolbar`, `qfdraw/style.ts` and the 52-tool registry from the professional drawing kit.

- [ ] **Step 1: Write failing test**

Assert style edit changes colour/width, object list hides/locks, undo ≥ 50, server save/restore.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/chart/__tests__/AnnotationPanel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Extend the existing `DrawingPanel`/`DrawingStyleToolbar`; do not fork or rewrite the 52 tools. Add object list, multi-select, copy/paste, undo/redo, magnet snap, text edit, server CRUD with ownership. Keep localStorage fallback.

- [ ] **Step 4: Verify**

Run: `cargo test -p backend-rs annotations`
Expected: PASS.
Run: `npx vitest run src/components/chart/__tests__/AnnotationPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend-rs/src/charts/annotations.rs backend-rs/migrations/003_chart_annotations.sql frontend/src/components/chart frontend/src/hooks/useAnnotations.ts
git commit -m "feat(charts): add annotation editor and persistence"
```

---

### Task 11: Compare overlay, dashboards and templates

**Files:**
- Create: `frontend/src/components/chart/CompareOverlay.tsx`
- Create: `frontend/src/components/dashboard/DashboardGrid.tsx`
- Create: `frontend/src/components/dashboard/DashboardTemplates.tsx`
- Create: `frontend/src/charts/__tests__/compare.test.ts`

**Interfaces:**
- Produces: `CompareState { charts: ChartRef[], overlay: SeriesRef[], normalize }`; template ids `cycle|mining|fees|liquidity|cohorts|etf`.

- [ ] **Step 1: Write failing tests**

Assert 4-chart compare shares range, overlay normalises to 100, correlation matrix matches Pearson, template loads valid chart ids.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/charts/__tests__/compare.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Overlay on one chart, small multiples, sync crosshair, correlation matrix, presets, URL state.

- [ ] **Step 4: Verify**

Run: `npx vitest run src/charts/__tests__/compare.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chart/CompareOverlay.tsx frontend/src/components/dashboard
git commit -m "feat(charts): add compare overlay and dashboard templates"
```

---

### Task 12: Screenshot, CSV, share links and layouts

**Files:**
- Create: `backend-rs/src/charts/layouts.rs`
- Create: `backend-rs/migrations/002_chart_layouts.sql`
- Create: `frontend/src/components/chart/ExportMenu.tsx`
- Create: `frontend/src/hooks/useChartLayout.ts`
- Create: `frontend/src/lib/pine.ts`
- Create: `frontend/src/charts/__tests__/export.test.ts`
- Create: `frontend/src/charts/__tests__/pine.test.ts`

**Interfaces:**
- Produces: `GET/POST/PATCH/DELETE /api/v1/charts/layouts`; `exportPng(chart)`, `exportCsv(data)`, `shareLink(state)`, `toPine(spec, state)`.

- [ ] **Step 1: Write failing tests**

Assert PNG blob, CSV header/rows match visible series, share link round-trips state, layout CRUD owner-scoped.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/charts/__tests__/export.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Client PNG via renderer `screenshot()`; CSV with unit/decimals; signed share token; layout CRUD with default and public flag; Pine v5 generation for line/oscillator/band charts.

- [ ] **Step 4: Verify**

Run: `cargo test -p backend-rs layouts`
Expected: PASS.
Run: `npx vitest run src/charts/__tests__/export.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend-rs/src/charts/layouts.rs backend-rs/migrations/002_chart_layouts.sql frontend/src/components/chart/ExportMenu.tsx
git commit -m "feat(charts): add export, share links and saved layouts"
```

---

### Task 13: Alerts backend and manager UI

**Files:**
- Create: `backend-rs/src/charts/alerts.rs`
- Create: `backend-rs/migrations/004_chart_alerts.sql`
- Create: `scheduler/src/jobs/chart_alerts.rs` (separate scheduler binary)
- Create: `scheduler/tests/chart_alerts_test.rs`
- Create: `frontend/src/routes/Alerts.tsx`
- Create: `frontend/src/hooks/useAlerts.ts`
- Create: `backend-rs/tests/alerts_test.rs`

**Interfaces:**
- Produces: `/api/v1/alerts` CRUD + `/events`; `scheduler` job `chart-alerts` runs every 5 minutes.

- [ ] **Step 1: Write failing tests**

Assert above/below/cross/% change fire exactly once, cooldown suppresses duplicates, paused rules do not fire, cross-user access 403.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p backend-rs alerts`
Expected: FAIL.

- [ ] **Step 3: Implement evaluator**

Add `chart-alerts` to the `scheduler` crate designed in `docs/superpowers/specs/2026-11-24-scheduler-design.md`. Load active rules, fetch latest values in one query, evaluate, insert idempotent event, deliver email/webhook/in-app. Quiet hours. Rate limits.

- [ ] **Step 4: Verify**

Run: `cargo test -p backend-rs alerts`
Expected: PASS.
Manual: create rule, force value, receive in-app event.

- [ ] **Step 5: Commit**

```bash
git add backend-rs/src/charts/alerts.rs backend-rs/migrations/004_chart_alerts.sql frontend/src/routes/Alerts.tsx frontend/src/hooks/useAlerts.ts
git commit -m "feat(charts): add alert engine and manager"
```

---

### Task 14: Mobile and responsive chart controls

**Files:**
- Modify: `frontend/src/components/chart/ChartToolbar.tsx`
- Create: `frontend/src/components/chart/MobileControls.tsx`
- Create: `frontend/src/components/chart/__tests__/responsive.test.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Produces: breakpoint-driven control layout; bottom-sheet controls; touch gestures.

- [ ] **Step 1: Write failing tests**

Assert 360px layout has no horizontal scroll, controls open in a sheet, pinch/pan handlers registered, tables scroll.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/chart/__tests__/responsive.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Breakpoints 360/768/1024/1440, bottom sheet, touch tooltips, simplified annotation toolbar, sticky table column.

- [ ] **Step 4: Verify**

Run: `npx vitest run src/components/chart/__tests__/responsive.test.tsx`
Expected: PASS.
Manual: iPhone/Android Chrome smoke.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chart frontend/src/index.css
git commit -m "feat(charts): add mobile-responsive controls"
```

---

### Task 15: Chart batch — price, technical and platform charts (23 charts)

**Files:**
- Create: `frontend/src/charts/specs/price.ts`
- Modify: `frontend/src/charts/registry.ts`
- Create: `frontend/e2e/charts/price.spec.ts`

**Charts:** `price.btc`, `price.drawdown`, `price.mayer`, `price.rsi`, `price.volatility`, `price.momentum`, `price.sharpe`, `price.cycle_overlays`, `technical.bollinger`, `technical.macd`, `technical.stochastic`, `technical.seasonality`, `technical.monthly_returns`, `technical.drawdown_table`, `strategies.dca`, `strategies.exit`, `strategies.portfolio`, `compare.overlay`, `workbench.custom`, `alerts.manager`, `technical.price_ranges`, `technical.risk_adjusted`, `technical.inflation_adjusted`.

**Interfaces:**
- Consumes: renderers/controls from Tasks 2-14.
- Produces: 20 catalog specs and visual tests.

- [ ] **Step 1: Add specs and run catalog check**

Run: `npm run charts:check`
Expected: pass.

- [ ] **Step 2: Add visual tests**

Each chart: default, each variant, light/dark, 360/1440.

- [ ] **Step 3: Run tests**

Run: `npx playwright test e2e/charts/price.spec.ts`
Expected: PASS.

- [ ] **Step 4: Parity review**

Compare against ITC price/risk, LIB price/drawdown/seasonality, COC price/technical. Record screenshots in PR.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/charts/specs/price.ts frontend/e2e/charts/price.spec.ts
git commit -m "feat(charts): implement price family"
```

---

### Task 16: Chart batch — valuation (15 charts)

**Files:** `frontend/src/charts/specs/valuation.ts`, `frontend/e2e/charts/valuation.spec.ts`

**Charts:** `valuation.mvrv`, `valuation.realized_cap`, `valuation.realized_price`, `valuation.nupl`, `valuation.aviv`, `valuation.sth`, `valuation.lth`, `valuation.risk_ratios`, `valuation.cap_models`, `valuation.histograms`, `valuation.quantile_bands`, `valuation.monetary_premium`, `urpd.distribution`, `urpd.heatmap`, `urpd.diffs`.

- [ ] Add specs, visual tests, parity review, commit. Acceptance per `chart-by-chart.md`.

---

### Task 17: Chart batch — profitability and risk (7 charts)

**Files:** `frontend/src/charts/specs/profitability.ts`, `frontend/src/charts/specs/risk.ts`, e2e specs.

**Charts:** `profitability.sopr`, `profitability.sopr_cohorts`, `profitability.puell`, `profitability.realized_pnl`, `profitability.sell_side_risk`, `risk.composite`, `risk.dashboard`.

- [ ] Add specs, visual tests, parity review, commit.

---

### Task 18: Chart batch — cycle (9 charts)

**Files:** `frontend/src/charts/specs/cycle.ts`, e2e.

**Charts:** `cycle.200w`, `cycle.2y`, `cycle.pi`, `cycle.powerlaw`, `cycle.bmsb`, `cycle.master`, `cycle.rainbow`, `cointime.liveliness`, `cointime.supply_regions`.

- [ ] Add specs, visual tests, parity review, commit.

---

### Task 19: Chart batch — supply (8 charts)

**Files:** `frontend/src/charts/specs/supply.ts`, `frontend/src/charts/specs/issuance.ts`, e2e.

**Charts:** `supply.circulating`, `supply.hodl_waves`, `supply.long_term`, `supply.cohorts`, `supply.profit_loss`, `supply.net_position_change`, `issuance.s2f`, `issuance.schedule`.

- [ ] Add specs, visual tests, parity review, commit.

---

### Task 20: Chart batch — addresses (5 charts)

**Files:** `frontend/src/charts/specs/addresses.ts`, e2e.

**Charts:** `addresses.activity`, `addresses.btc_cohorts`, `addresses.usd_cohorts`, `addresses.profit`, `addresses.outputs`.

- [ ] Add specs, visual tests, parity review, commit.

---

### Task 21: Chart batch — fees (8 charts)

**Files:** `frontend/src/charts/specs/fees.ts`, e2e.

**Charts:** `fees.revenue`, `fees.per_tx`, `fees.buckets`, `fees.tx_count`, `fees.tx_size`, `fees.value_bands`, `fees.vin_vout`, `fees.segwit`.

- [ ] Add specs, visual tests, parity review, commit.

---

### Task 22: Chart batch — flow (13 charts)

**Files:** `frontend/src/charts/specs/flow.ts`, e2e.

**Charts:** `flow.transfer_volume`, `flow.nvt`, `flow.velocity`, `flow.cdd`, `flow.vddm`, `flow.value_bands`, `flow.etf`, `flow.legacy`, `flow.lifespan_signals`, `flow.capital_rotation`, `etf.balances`, `etf.market`, `entity.exchange_balances`.

- [ ] Add specs, visual tests, parity review, commit.

---

### Task 23: Chart batch — mining and network (9 charts)

**Files:** `frontend/src/charts/specs/mining.ts`, `frontend/src/charts/specs/network.ts`, e2e.

**Charts:** `mining.hashrate`, `mining.hashribbon`, `mining.hashprice`, `mining.revenue`, `mining.models`, `network.blocks`, `network.blocksize`, `network.tx_per_block`, `network.lightning`.

- [ ] Add specs, visual tests, parity review, commit.

---

### Task 24: Chart batch — script, macro, derivatives, sentiment (11 charts)

**Files:** `frontend/src/charts/specs/script.ts`, `macro.ts`, `derivatives.ts`, `sentiment.ts`, e2e.

**Charts:** `script.counts`, `script.shares`, `macro.dashboard`, `macro.relative`, `macro.correlations`, `derivatives.funding`, `derivatives.open_interest`, `derivatives.options`, `derivatives.term_structure`, `derivatives.liquidations`, `sentiment.fear_greed`.

- [ ] Add specs, visual tests, parity review, commit.

---

### Task 25: New derived data — URPD, Cointime, cohort PnL

**Files:**
- Create: `clickhouse/init/15_urpd.sql`
- Create: `clickhouse/init/16_cointime.sql`
- Create: `backend-rs/src/metrics/derived/*.rs`
- Create: `backend-rs/tests/derived_metrics_test.rs`
- Modify: `docs/charts/chart-catalog.yaml` status

**Interfaces:**
- Produces: `urpd_bins`, `urpd_heatmap`, `cointime_*`, `sth_sopr`, `lth_sopr`, `net_realized_pnl_*`, `sell_side_risk*`, `pct_supply_in_profit*`, `binary_cdd`, `seller_exhaustion`, `consecutive_days_*`, `realized_cap_net_position_change`, `stablecoin_supply_usd`, `market_cap_gained_per_dollar`, `rainbow_bands`, `monetary_premium`.

- [ ] **Step 1: Write reconciliation tests**

SOPR cohort weighted average equals market SOPR within 0.1%; realized PnL reconciles with realized cap delta; URPD bins sum to supply.

- [ ] **Step 2: Implement SQL/MVs and registry entries**

Public formulas, documented in `docs/metrics-coverage.md`. Proxy badges where applicable.

- [ ] **Step 3: Add charts `urpd.*`, `cointime.*`, `profitability.*`, `flow.lifespan_signals`, `flow.capital_rotation`, `cycle.rainbow`, `valuation.monetary_premium` and run visual tests.**

- [ ] **Step 4: Commit.**

---

### Task 26: External data — ETF balances, treasuries, options

**Files:**
- Create: `backend-rs/src/ingest/etf.rs`, `treasury.rs`, `options.rs`
- Create: `backend-rs/migrations/006_external_metrics.sql`
- Create: `backend-rs/tests/external_ingest_test.rs`

**Interfaces:**
- Produces: `etf_holdings_btc`, `etf_aum_usd`, `etf_price`, `etf_volume_usd`, `etf_mvrv`, `etf_dominance`, `aggregate_volume_usd`, `etf_cash_carry`, `treasury_*`, `options_*`, `liquidations_*`, `exchange_balance_btc`, `exchange_netflow_btc`, `exchange_inflow_btc`, `exchange_outflow_btc`.

- [ ] **Step 1: Write fixture-based ingest tests.**
- [ ] **Step 2: Implement fetchers with retries, freshness metadata and source URLs.**
- [ ] **Step 3: Add charts `etf.balances`, `etf.market`, `entity.exchange_balances`, `treasury.companies`, `derivatives.options/liquidations/term_structure`.**
- [ ] **Step 4: Commit.**

---

### Task 27: Workbench, strategies and AI explanations

**Files:**
- Create: `frontend/src/routes/Workbench.tsx`
- Create: `frontend/src/lib/formula.ts`
- Create: `backend-rs/src/charts/formula.rs`
- Create: `frontend/src/routes/Strategies.tsx`
- Create: `backend-rs/src/charts/explain.rs`

**Interfaces:**
- Produces: allowlisted formula AST, `/api/v1/charts/explain`, strategy backtest endpoints.

- [ ] **Step 1: Write formula validation tests** (reject unknown identifiers, cap depth 20).
- [ ] **Step 2: Implement AST evaluator and workbench UI.**
- [ ] **Step 3: Implement DCA/exit/portfolio simulators with fees and assumptions.**
- [ ] **Step 4: Implement AI explanation with visible-series citation.**
- [ ] **Step 5: Commit.**

---

### Task 28: Parity audit, performance and accessibility

**Files:**
- Create: `docs/charts/parity-audit-2026-11-24.md`
- Create: `frontend/e2e/parity.spec.ts`
- Modify: `docs/charts/parity-ledger.md`

- [ ] **Step 1: Run full visual suite at 360/768/1440, light/dark.**
- [ ] **Step 2: Run axe-core and keyboard smoke tests.**
- [ ] **Step 3: Run 5k × 8 series performance test; record p95.**
- [ ] **Step 4: Walk the 90 in-scope parity units; mark `shipped` only with evidence.**
- [ ] **Step 5: Update ledger and commit.**

---

## Self-review

**Spec coverage:** Sections 6.1-6.21 map to Tasks 1-14 and 28. Chart families map to Tasks 15-24. New data maps to Tasks 25-26. Workbench/strategies/AI maps to Task 27. Parity ledger maps to Task 28.

**Step scan:** Each task has a testable deliverable and a verification command. Chart batches reference the per-chart acceptance list rather than repeating 98 checklists.

**Type consistency:** `ChartSpec`, `SeriesSpec`, `AxisSpec`, `VariantSpec`, `ControlId`, `ChartState`, `ChartRenderer` names are used consistently across Tasks 1-14.

**Review focus:** Timezone, null/zero, dual-axis drift, stacked denominator and downsampling extrema each have explicit tests in Tasks 3-5 and 6.

**Proportion:** Platform foundation tasks 0-14, chart batches 15-24, data tasks 25-26, workbench 27, audit 28.
