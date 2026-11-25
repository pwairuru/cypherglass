# CypherGlass Chart Platform — Parity Design Spec

**Status:** approved for implementation planning  
**Date:** 2026-11-24  
**Target:** 98% chart and feature parity with Into The Cryptoverse (ITC), Bitcoin Magazine Pro / LookIntoBitcoin (LIB), and Checkonchain (COC), with social data explicitly excluded.  
**Scope:** every chart page, every chart control, every platform feature needed to research and chart Bitcoin onchain data. Data staleness is treated as an ingestion dependency, not a chart-design constraint.

**Companion documents**

| Document | Purpose |
|---|---|
| `docs/charts/chart-catalog.yaml` | Machine-readable source of truth for all 109 chart pages, 267 metrics, variants, series, axes, controls and new data requirements. |
| `docs/charts/chart-by-chart.md` | Generated human-readable contract for every chart. |
| `docs/charts/implementation-tracker.md` | Generated chart-by-chart implementation status. |
| `docs/charts/parity-ledger.md` | 91 parity units mapped to competitors, with the 90/91 = 98.90% calculation and the social exclusion. |
| `docs/superpowers/plans/2026-11-24-chart-platform-parity.md` | Task-by-task implementation plan. |
| `scripts/verify_chart_catalog.py` | CI gate: catalog covers every registry metric, every series resolves, every chart is complete. |
| `docs/superpowers/plans/2026-11-24-professional-drawing-kit.md` | Existing drawing-style/line-family plan; this spec consumes it rather than duplicating it. |
| `docs/superpowers/specs/2026-11-24-scheduler-design.md` | Separate scheduler binary used for chart-alert evaluation and future ingest. |

---

## 1. Goal

Every analytical view a competitor can produce from Bitcoin onchain, price, macro, derivatives, ETF or treasury data must be available in CypherGlass with equal or better controls. Every one of the 267 existing metrics must be reachable through a designed chart page. Chart-by-chart work must be executable without re-deciding product behaviour.

The product target is not "267 line charts". It is **109 chart pages**, each an instrument with explicit series, axes, variants, controls, annotations and acceptance criteria.

### 1.1 Parity definition

Parity is measured in `docs/charts/parity-ledger.md`:

- **91 parity units** cover chart mechanics, chart families and platform features.
- **90 units are in scope.** Social sentiment is the single excluded unit.
- **90/90 in-scope units are designed** by this spec and the catalog.
- **90/91 overall = 98.90%**, which meets the 98% target.

This number measures **design coverage**, not shipped code. The ledger carries a separate `implementation` column that starts at `not_started` and is updated as chart batches land. A chart is not "done" until its acceptance list in `chart-by-chart.md` passes.

### 1.2 Non-goals

- Social sentiment, news, video, Telegram/Discord communities, influencer content.
- Copying proprietary formulas or data that is not publicly documented. Public definitions are used; proxies are labelled.
- Order execution, portfolio custody, tax reporting.
- Native iOS/Android apps in the first release. Responsive web first; native shell later if needed.
- Tick-level trading charts. The finest grain is hourly.

### 1.3 Definitions

| Term | Meaning |
|---|---|
| **Chart page** | One entry in the catalog, addressable by URL, with one question, one default view and a set of variants. |
| **Archetype** | Shared rendering and interaction contract (candles, oscillator, bands, heatmap, etc.). |
| **Variant** | A tab inside a chart page that changes series, cohort, unit or transform without changing the page. |
| **Cohort** | A holder or supply segment (All, STH, LTH, address balance bucket, script type). |
| **Series** | One rendered data line/bar/area/band, bound to one metric and one axis. |
| **Transform** | Display-time or server-side operation: raw, %, index=100, z-score, BTC-denominated, SMA/EMA smoothing. |
| **Proxy** | A metric that approximates a canonical definition; must carry a visible badge. |
| **Freshness** | Last successful data timestamp plus an explicit stale reason. |

---

## 2. Baseline: what exists today

The current chart surface is a good shell with a narrow control layer.

| Area | Current implementation | File |
|---|---|---|
| Price chart | Candles or close line, hardcoded SMA20, drawings, fullscreen | `frontend/src/components/PriceChart.tsx` |
| Onchain chart | One line plus optional price line; price forced into hidden second Y axis; single pane | `frontend/src/components/OnchainChart.tsx` |
| Page controls | 4 views (Single/Overview/Compare/DCA), 6 ranges (1D–1Y), grain, price overlay, candle/line, theme, density | `frontend/src/routes/Dashboard.tsx` |
| Metric rail | Search, categories, collapsible groups, grain variants | `frontend/src/components/MetricList.tsx` |
| Drawings | 52 tools, per-chart localStorage, JSON import/export, undo/clear | `frontend/src/components/DrawingPanel.tsx`, `frontend/src/lib/qfdraw/` |
| Chart engine | QFChart/ECharts supports multi-pane, histogram/columns/background/fill, axis min/max/formatter; UI uses a fraction of it | `frontend/node_modules/@qfo/qfchart/dist/index.d.ts` |
| Indicators | SMA/EMA/RSI/MACD/Bollinger helpers exist; only SMA20 is wired | `frontend/src/lib/indicators.ts` |
| Compare | Up to 4 mini cards side by side; no overlay, no shared crosshair | `frontend/src/routes/Dashboard.tsx` |

**Missing control families:** log scale, axis min/max/formatter, visible dual axis, multi-series add/remove, multi-pane, histogram/heatmap/scatter/table/gauge, cohort variants, metric parameters, normalization, alerts, screenshots, CSV, share links, saved layouts, responsive mobile controls.

The design below closes those gaps by making chart behaviour declarative instead of hand-coded per component.

---

## 3. Competitor benchmark

The benchmark is feature-level. Competitor charts are paywalled; no proprietary data or formulas were copied.

| Platform | What it is good at | What CypherGlass must match |
|---|---|---|
| **ITC (Benjamin Cowen)** | Hundreds of charts, flagship risk model, DCA/exit/risk-portfolio/MPT tools, no-code Workbench, TradingView indicators, mobile app, weekly research | Risk dashboard, DCA/exit/portfolio simulators, custom indicator workbench, mobile-readable charts, chart explanations |
| **Bitcoin Magazine Pro / LookIntoBitcoin** | 200+ live charts, 40–100 chart alerts, API + CSV on 200+ metrics, AI Analyst, private TradingView indicators, Top Strategies, treasury tracker, macro suite, research | Full-history charts with log/linear, alerts, API/CSV, chart explanations, strategy/backtest views, treasury table, polished presentation |
| **Checkonchain (James Check)** | Deepest onchain catalogue: URPD and heatmaps, Cointime/AVIV, STH/LTH suites, realized PnL by cohort, sell-side risk, options/derivatives, ETF, MSTR/treasuries, curated per-chart zoom presets and info toggles | URPD, Cointime, cohort PnL, sell-side risk, options, ETF balances, treasury metrics, per-chart preset buttons, series/axis controls |

Representative evidence:

- Checkonchain MVRV chart contains 9 series, SD bands, log price axis, metric axis, and 12 relayout buttons (`Default Zoom`, `Full History`, `Cycle 4`, `Last 3-Month`, `Last 6-Month`, `Last Year`, `Modern Era`, `Recent History`, `Unified`, `Info On/Off`, `Details`). Source: `charts.checkonchain.com`.
- LookIntoBitcoin advertises 200+ member charts, 40/100 alerts, API + CSV on 200+ metrics, AI Analyst, 10/20 private TradingView indicators, 5 strategies. Source: `lookintobitcoin.com`.
- ITC advertises hundreds of charts, risk models, DCA, exit strategies, risk portfolio tester, MPT, no-code Workbench, mobile app, TradingView indicators. Source: `intothecryptoverse.com`.

The lesson is consistent: **their charts are bespoke instruments; ours are one generic renderer**. The fix is a chart spec per page, not 267 frontend branches.

---

## 4. Product principles

1. **Chart page, not metric page.** Metrics are ingredients. Users open "MVRV & Z-Score", not "mvrv_z_daily".
2. **Every control answers a question.** Log scale answers "is this exponential?"; cohort tabs answer "who?". No decorative knobs.
3. **No hidden axes.** Every rendered series has a visible, labelled axis with unit and colour.
4. **Null is not zero.** Gaps break lines and fills. Zero is plotted only when the API returns zero.
5. **State is shareable.** Range, grain, variant, scale, series, transforms and annotations live in the URL.
6. **Progressive disclosure.** Default view is readable at a glance; advanced controls are one click away.
7. **Drawings are first-class.** 52 tools stay; add style/object management and server persistence.
8. **Data honesty.** Proxy, stale, partial and estimated data carry visible badges.
9. **Performance is a feature.** 5,000 points × 8 series must stay interactive.
10. **One engine, many archetypes.** QFChart for time series; raw ECharts/HTML for heatmap, scatter, table, gauge.

---

## 5. Chart archetypes

Every chart page uses exactly one archetype. Archetype defaults are stored in the catalog; chart-specific overrides win.

| Archetype | Chart types | Used by | Core controls | Acceptance focus |
|---|---|---:|---|---|
| `candles` | candles, line | 1 | range, grain, log, MA overlay, volume pane, drawings | OHLC integrity, volume axis, log safety |
| `line_oscillator` | line, step, area, histogram | 12 | range, grain, log, price overlay, thresholds, histogram | null gaps, threshold labels |
| `line_dual_axis` | line, area | 9 | dual visible axes, axis assignment, log per axis | colour-matched axes, axis reflow |
| `bands_overlay` | line, area, band | 8 | band toggle, quantile window, price overlay | fill bounds, missing-point breaks |
| `multi_series` | line, step, area | 10 | series add/remove, axis assign, normalize | unit compatibility, reversible transforms |
| `stacked_area` | stacked area, line | 8 | percent mode, reorder, series hide | sum to 100%, denominator excludes hidden |
| `bar_series` | columns, stacked columns, line | 10 | bar mode, log, thresholds | negative bars, adaptive width |
| `price_distribution` | columns | 2 | price bins, log x/y, percent mode | bins sum to supply, empty bins |
| `distribution_histogram` | histogram | 1 | window, bins, log Y, percentile markers | bin labels, current-value marker |
| `heatmap` | heatmap | 4 | bin size, colour scale, log colour | empty bins, legend, hover |
| `scatter` | scatter, regression | 2 | x/y metric, log x/y, regression, quadrants | axis labels, R², point dates |
| `table` | table | 3 | period, sort, export | numeric sort, theme contrast |
| `gauge_composite` | gauge, line | 3 | thresholds, components, history | band labels, component sum |
| `dashboard_grid` | grid | 6 | card select, layout, sync range | shared range, persistent order |
| `multi_pane` | line, columns | 1 | indicator params, pane resize | shared time axis, pane persistence |

Detailed archetype rules:

### 5.1 `candles`
- Data: one OHLC series plus optional volume pane. Open/high/low/close must come from the same grain and symbol.
- Default: candles, linear price axis, auto range, volume pane on.
- Log scale: allowed for price; non-positive prices are dropped from the log series and the chart shows a "non-positive values hidden" badge.
- Gaps: missing bars create a time gap; no synthetic flat candle.
- Volume: separate pane, own Y axis, never shares price axis.
- Overlays: SMA/EMA with configurable periods (default 20/50/200/21), each toggleable and colour-coded.
- Annotations: halving vertical markers, ATH marker, last-price line.
- Acceptance: candle close equals line close at the same timestamp; volume hidden reflows main pane; period changes recalc on visible range.

### 5.2 `line_oscillator`
- Single primary metric on the left axis; optional price on the right log axis.
- Thresholds: metric-defined horizontal lines with labels (e.g., SOPR=1, RSI=30/70, risk=35/60).
- Histogram variant: bins the visible window; current value marker.
- Smoothing: none/SMA7/SMA30/EMA; smoothing label always visible.
- Log: off by default; reject non-positive data with a badge.
- Acceptance: nulls break the line; threshold labels use the metric unit; histogram bins are labelled.

### 5.3 `line_dual_axis`
- Two axes maximum. Left = metric, right = price by default; both visible and colour-matched.
- Axis assignment is user-changeable per series.
- Hiding all right-axis series removes the right axis and reflows the left axis.
- Log toggle is per axis, not global.
- Acceptance: both axis titles and units visible; no hidden second Y; axis state survives range/variant changes.

### 5.4 `bands_overlay`
- A primary line plus one or more bands (upper/lower, quantiles, SD, model bands).
- Band fill uses a single polygon between upper/lower; gaps in either bound break the fill.
- Quantile window: 1Y/2Y/4Y/All, default 4Y; label the window.
- Acceptance: fill never bridges a null; toggling bands does not rescale the primary series; window change is labelled.

### 5.5 `multi_series`
- Two to eight series. Same-unit series share an axis by default; incompatible units force a second axis or a normalisation prompt.
- Normalisation: raw, %, index=100, z-score, BTC-denominated. Each series shows its transform in the legend.
- Series add/remove from the catalog without leaving the page.
- Acceptance: normalised values are reversible; hidden series do not affect scales; each series has a distinct accessible colour.

### 5.6 `stacked_area`
- Absolute and percent modes. Percent denominator excludes hidden series; label says "share of visible series" when series are hidden.
- Stack order user-reorderable; default order is semantic (age bands oldest at bottom, fee buckets low to high).
- Negative values are not stacked; the chart warns and switches to lines.
- Acceptance: percent sums to 100 ± 0.1%; reorder persists; hidden series excluded from denominator.

### 5.7 `bar_series`
- Grouped or stacked columns, plus optional line overlay.
- Bar width adapts to grain and visible range; at All range bars become thin or aggregate to the next grain.
- Negative values render below the zero line.
- Acceptance: zero line visible; bar tooltip includes period and exact value; stacked mode labels total.

### 5.8 `distribution_histogram`
- Bins the selected metric over a window; x = metric value, y = count/time.
- Current value marker plus percentile markers (10/50/90).
- Bin count default 40; user selectable 10–100; log Y optional.
- Acceptance: current marker equals latest API point; bin labels show range; changing window recomputes locally from cached series where possible.

### 5.9 `heatmap`
- Two dimensions plus colour. For 200W heat: x = date, y = price bucket, colour = metric. For URPD: x = price, y = date, colour = supply.
- Empty bins render as background, never as zero-colour.
- Colour scale legend with unit and min/max; log colour optional.
- Acceptance: hover reports x, y and value; empty bins distinguishable; colour scale survives theme switch.

### 5.10 `scatter`
- x and y metrics selectable from a compatible list; each point is a date.
- Optional log axes, regression line, R², quadrant lines.
- Acceptance: axis labels name metric and unit; hover identifies date; regression only shown when computed.

### 5.11 `table`
- Period rows and metric columns; numeric sort; colour scale cells.
- CSV export matches visible table.
- Acceptance: sorting is numeric; colour scale readable in light/dark; sticky header.

### 5.12 `gauge_composite`
- One 0–100 (or metric-defined) gauge plus component breakdown and history.
- Bands: low/neutral/high with labels and thresholds.
- Acceptance: gauge value equals latest series point; components sum or weight correctly; history uses the same scale.

### 5.13 `dashboard_grid`
- A named set of chart cards sharing range and grain.
- Card order and size persist per user.
- Empty/stale cards show badges, not blank panels.
- Acceptance: all cards share range; card order persists; stale card shows reason.

### 5.14 `price_distribution`
- x = price bin, y = supply or supply delta; columns, not a time series.
- Price bins are explicit and labelled; log x optional.
- Percent mode shows share of supply; bins sum to 100% within rounding.
- Empty bins render as background, not zero-height bars.
- Diffs mode shows 7/30/90/180/365-day change per bin with a symmetric colour scale.
- Acceptance: bins sum to supply, empty bins distinguishable, price scale labelled.

### 5.15 `multi_pane`
- Main price pane plus up to three indicator panes (volume, RSI, MACD, etc.).
- Panes share the time axis and crosshair; each pane has its own Y axis.
- Pane heights are draggable and persisted.
- Acceptance: crosshair is synchronised; pane resize persists; hidden pane does not leave a gap.

---

## 6. Platform requirements

Requirement IDs are stable and referenced by the implementation plan and tests. `MUST` items are release blockers.

### 6.1 Catalog and navigation (CAT)

| ID | Requirement | Acceptance |
|---|---|---|
| CAT-01 | Catalog lists chart pages, not raw metrics. Each row shows title, category, variant count, freshness dot and proxy badge. | A chart with 4 variants is one row, not four. |
| CAT-02 | Search matches chart title, id, metric id and metric title. `/` focuses search. | Search "mvrv" returns the MVRV chart. |
| CAT-03 | Categories match the 13 catalog categories with counts. | Counts equal catalog counts. |
| CAT-04 | Favourites and recents are per user, stored server-side with local fallback. | Favourite survives logout/login on another browser. |
| CAT-05 | Catalog supports deep links: `/charts/:chartId`. | Direct URL opens the chart with default state. |
| CAT-06 | Disabled and legacy metrics are hidden from normal browsing but reachable by URL for debugging. | `price_btc_usd` does not appear in the rail. |
| CAT-07 | A chart page shows related charts (same family/cohort) at the bottom. | MVRV links to NUPL, SOPR, realized cap. |
| CAT-08 | Empty catalog state explains how to seed/ingest data. | No blank rail. |

### 6.2 Canvas and layout (CAN)

| ID | Requirement | Acceptance |
|---|---|---|
| CAN-01 | One `ChartHost` renders every catalog chart from its spec. No per-chart page components. | Adding a chart requires catalog + spec only. |
| CAN-02 | Canvas supports 1–4 panes with resizable heights. | Drag handle changes pane height and persists. |
| CAN-03 | Crosshair is synchronised across panes and compare cards. | Hover shows the same date everywhere. |
| CAN-04 | Tooltip lists date, every visible series, value, unit and transform. | Tooltip has no hidden series. |
| CAN-05 | Legend shows series name, colour, axis, last value and visibility toggle. | Clicking legend hides series and rescales. |
| CAN-06 | Last-value line/label is optional per chart. | Toggle removes line and label. |
| CAN-07 | Chart title, question and description sit outside the canvas, never overlapping data. | No title overlap at 360px. |
| CAN-08 | Loading, empty, error and stale states are distinct and actionable. | Each state has a different message and role. |
| CAN-09 | Fullscreen preserves state and drawings. | Exit fullscreen restores identical chart. |
| CAN-10 | Theme switch re-renders colours without refetching data. | Light/dark screenshots differ only in theme. |

### 6.3 Time controls (TIME)

| ID | Requirement | Acceptance |
|---|---|---|
| TIME-01 | Presets: 1D, 1W, 1M, 3M, 6M, YTD, 1Y, 2Y, 4Y, Cycle, All, Custom. | Every preset maps to a deterministic from/to. |
| TIME-02 | `Cycle` means from the most recent halving to now; label shows the halving date. | Cycle start = 2024-04-20 for the current cycle. |
| TIME-03 | `All` returns the full metric history, not a truncated window. | No 5-year/1,826-day cap. |
| TIME-04 | Custom range uses a date picker with metric coverage bounds. | Dates outside coverage are disabled. |
| TIME-05 | Grain selector: Auto, Hourly, Daily, Weekly, Monthly. Auto picks by range. | 1D→hourly, 1Y→daily, 4Y→weekly, All→monthly. |
| TIME-06 | Zoom: wheel, pinch, box zoom and slider; reset button. | Reset returns to selected preset. |
| TIME-07 | Panning is bounded to available data. | Cannot pan into empty future. |
| TIME-08 | Halving markers at 2012-11-28, 2016-07-09, 2020-05-11, 2024-04-20; toggleable. | Markers align to the correct dates. |
| TIME-09 | Timezone toggle UTC/local; default UTC. | Axis labels update without refetch. |
| TIME-10 | URL stores preset or explicit from/to plus grain and timezone. | Copy URL restores identical window. |

### 6.4 Axes and scale (AXIS)

| ID | Requirement | Acceptance |
|---|---|---|
| AXIS-01 | Every axis has title, unit, scale type, min/max mode, decimals and colour. | Axis header shows all fields. |
| AXIS-02 | Log/linear toggle per axis. | Log toggle affects only its axis. |
| AXIS-03 | Log scale drops or flags values ≤ 0; it never plots them at zero. | Badge appears when values are hidden. |
| AXIS-04 | Auto/manual min/max; manual values validated against scale. | Invalid manual range shows inline error. |
| AXIS-05 | "Fit visible" vs "Fit all" mode. | Zooming does not force a rescale in Fit all. |
| AXIS-06 | Dual axes are visible and colour-matched to series. | No hidden second Y axis. |
| AXIS-07 | Unit formatter: USD ($1.2T/$84.3k), BTC, %, ratio, sats/vB, WU, bytes, count. | Axis labels use the formatter. |
| AXIS-08 | Stacked percent axis locked 0–100%. | Axis cannot exceed 100 in percent mode. |
| AXIS-09 | Axis state is per chart and stored in URL. | Reload preserves log/min/max. |

### 6.5 Series and transforms (SER)

| ID | Requirement | Acceptance |
|---|---|---|
| SER-01 | Add up to 8 series from the catalog to a chart. | Series panel search adds without navigation. |
| SER-02 | Remove, hide, reorder and recolour series. | Order persists in URL/layout. |
| SER-03 | Assign each series to left/right axis. | Axis assignment updates legend. |
| SER-04 | Transforms: raw, %, index=100, z-score, BTC-denominated, SMA/EMA smoothing. | Transform label appears in legend and tooltip. |
| SER-05 | Transform is reversible without refetch when data is cached. | Toggle raw restores exact values. |
| SER-06 | Incompatible units warn before sharing an axis. | Warning names both units. |
| SER-07 | Series names include metric, variant, grain and transform. | No ambiguous duplicate labels. |
| SER-08 | Colour palette is accessible and stable per metric. | Same metric keeps colour across charts. |
| SER-09 | Missing values are gaps, not zeros. | Line breaks at null. |
| SER-10 | Series metadata (unit, proxy, freshness) is available from the legend. | Info popover shows source and last update. |

### 6.6 Chart types (TYPE)

| ID | Requirement | Acceptance |
|---|---|---|
| TYPE-01 | Time-series renderer supports line, step, area, candles, columns, stacked columns, band fill. | Each style renders without re-instantiating the page. |
| TYPE-02 | Distribution renderer supports histogram with bins and markers. | Bin count changes without refetch. |
| TYPE-03 | Heatmap renderer supports date×price and price×date. | Axis orientation is configurable. |
| TYPE-04 | Scatter renderer supports log axes and regression. | Regression line and R² render. |
| TYPE-05 | Table renderer supports numeric sort and CSV export. | Export matches visible rows. |
| TYPE-06 | Gauge renderer supports thresholds and component breakdown. | Gauge matches latest value. |
| TYPE-07 | Dashboard renderer composes cards with shared range. | Range change updates all cards. |
| TYPE-08 | Multi-pane renderer supports price + up to 3 indicators. | Panes share time axis. |
| TYPE-09 | Chart type switch preserves series, range, axes and annotations where meaningful. | No state loss on switch. |
| TYPE-10 | Unsupported combination shows a clear message, never a blank canvas. | Error names the combination. |

### 6.7 Variants, cohorts and parameters (VAR)

| ID | Requirement | Acceptance |
|---|---|---|
| VAR-01 | Variant tabs switch metric/series without page reload. | Tab state in URL. |
| VAR-02 | Cohort selector: All/STH/LTH where the metric supports it. | Cohort label visible in legend/title. |
| VAR-03 | Unit selector: BTC/USD/% where available. | Unit change updates axis formatter. |
| VAR-04 | Count/share selector for cohorts, script types and fee buckets. | Share mode sums to 100%. |
| VAR-05 | Metric parameters: MA length, z-score window, smoothing, bin size, quantile window. | Parameters validated and labelled. |
| VAR-06 | Allowlisted parameters only; no free SQL or formula injection. | Unknown parameter is rejected 422. |
| VAR-07 | Variant switch preserves range, grain, annotations and layout. | No reset on tab change. |
| VAR-08 | Variant availability is declared in the catalog, not inferred from metric names. | No accidental tab from suffix parsing. |

### 6.8 Annotations and drawings (ANN)

| ID | Requirement | Acceptance |
|---|---|---|
| ANN-01 | Keep all 52 drawing tools. | Tool registry count = 52. |
| ANN-02 | Per-object style editor: colour, width, fill, opacity, font size, line style, lock, hide. Reuse the `DrawingStyleToolbar`/`qfdraw/style.ts` work from the professional drawing kit; do not fork it. | Edits persist and re-render. |
| ANN-03 | Object list with select, rename, hide, lock, delete, z-order. Extends the existing `DrawingPanel` and selection model. | Selecting object highlights it. |
| ANN-04 | Multi-select, move, copy/paste, duplicate. | Group move preserves relative positions. |
| ANN-05 | Undo/redo stack ≥ 50 actions. | Undo restores exact prior state. |
| ANN-06 | Text edit after creation; double-click opens editor. | Text persists. |
| ANN-07 | Magnet/snap to candle OHLC and time. | Snap indicator visible. |
| ANN-08 | Persist annotations server-side per user/chart/variant; localStorage fallback. | Cross-device restore. |
| ANN-09 | Import/export JSON with schema version. | Older schema migrates or rejects clearly. |
| ANN-10 | Annotation tooltips show creation time and author. | Shared layout shows author. |
| ANN-11 | Clear undoable; clear all requires confirmation. | Accidental clear recoverable. |
| ANN-12 | Drawings survive range/grain/variant changes when anchored to time/price. | Anchors remain correct. |

### 6.9 Compare (CMP)

| ID | Requirement | Acceptance |
|---|---|---|
| CMP-01 | Side-by-side small multiples, up to 4 charts, shared range and crosshair. | Hover date syncs. |
| CMP-02 | Overlay up to 4 series on one chart. | Legend lists all. |
| CMP-03 | Normalisation for overlay: raw, %, index=100, z-score. | Axes relabel. |
| CMP-04 | Correlation matrix for selected metrics. | Matrix values match computed Pearson. |
| CMP-05 | Compare presets: Cycle, Risk, Cohorts, Fees. | Preset loads correct charts. |
| CMP-06 | Compare state in URL and saved layouts. | Reload restores. |
| CMP-07 | Empty/incompatible compare slot shows actionable message. | No blank card. |

### 6.10 Dashboards (DASH)

| ID | Requirement | Acceptance |
|---|---|---|
| DASH-01 | Overview grid of 9 key cards with risk header. | All cards load independently. |
| DASH-02 | Custom dashboard: add/remove/resize/reorder cards. | Layout persists. |
| DASH-03 | Template dashboards: Cycle, Mining, Fees, Liquidity, Holder Cohorts, ETF. | Each loads a valid set. |
| DASH-04 | Cards share range/grain and show per-card stale badge. | One stale card does not block others. |
| DASH-05 | Dashboard fullscreen mode. | All cards fill viewport. |
| DASH-06 | Dashboard URL is shareable. | Recipient sees same cards. |

### 6.11 Saved layouts (LAY)

| ID | Requirement | Acceptance |
|---|---|---|
| LAY-01 | Save chart state (range, grain, variant, axes, series, transforms, annotations). | Save/restore exact state. |
| LAY-02 | Name, rename, duplicate, delete, set default. | Default loads on chart open. |
| LAY-03 | Server-side per user; local fallback when offline. | Offline save syncs later. |
| LAY-04 | Share read-only link. | Recipient cannot mutate owner layout. |
| LAY-05 | Schema version and migration. | Old layout loads or shows migration error. |
| LAY-06 | Layout list shows updated time and chart count. | Sort by recent. |

### 6.12 Alerts (ALR)

| ID | Requirement | Acceptance |
|---|---|---|
| ALR-01 | Rule types: above, below, cross up, cross down, % change, band breach. | Each type fires on a synthetic series. |
| ALR-02 | Rule scope: chart, series, metric, range, cooldown, repeat. | Cooldown suppresses duplicates. |
| ALR-03 | Evaluate after each ingest and at a fixed 5-minute cadence. | Late data evaluates within 5 min. |
| ALR-04 | Delivery: in-app, email, webhook. | Test delivery works. |
| ALR-05 | Alert manager: list, pause, edit, delete, test. | Paused rule does not fire. |
| ALR-06 | Event log with value, threshold, timestamp and chart link. | Event links to chart state. |
| ALR-07 | Idempotent evaluation; no duplicate events. | Re-run produces one event. |
| ALR-08 | Timezone-aware quiet hours. | Quiet hours suppress delivery. |
| ALR-09 | Alert rules are user-scoped and authorised. | Cannot read another user's rules. |
| ALR-10 | Rate limit alert creation and delivery. | 429 after limit. |

### 6.13 Export, share and API (EXP)

| ID | Requirement | Acceptance |
|---|---|---|
| EXP-01 | PNG screenshot with title, range, legend, axes and optional watermark. | Image matches canvas at 2x. |
| EXP-02 | CSV export of visible series and range. | CSV values equal API values. |
| EXP-03 | JSON export of chart state. | Import restores. |
| EXP-04 | Share link encodes state and optional annotation snapshot. | Recipient sees same view. |
| EXP-05 | Embed iframe with read-only chart. | Embed works cross-origin with signed token. |
| EXP-06 | Public API keys with scopes and rotation. | Revoked key returns 401. |
| EXP-07 | API endpoints for catalog, series, OHLC, layouts and alerts. | OpenAPI documents all. |
| EXP-08 | Rate limits per key and per user. | 429 with `Retry-After`. |
| EXP-09 | CSV/API units and decimals match UI. | No unit drift. |
| EXP-10 | Pine Script v5 export for line, oscillator and band charts. Generated script exposes periods/inputs and names the source metric. | Exported script compiles in TradingView and matches the chart on the same data. |

### 6.14 Mobile and responsive (MOB)

| ID | Requirement | Acceptance |
|---|---|---|
| MOB-01 | Breakpoints: 360, 768, 1024, 1440. | No horizontal scroll. |
| MOB-02 | Touch: pinch zoom, drag pan, tap tooltip. | Gestures work on iOS/Android Chrome. |
| MOB-03 | Controls collapse into a bottom sheet. | All controls reachable. |
| MOB-04 | Metric rail becomes a searchable sheet. | Search and select work. |
| MOB-05 | Tables scroll horizontally with sticky first column. | Readable at 360px. |
| MOB-06 | Drawings available but simplified toolbar. | Core tools reachable. |
| MOB-07 | No hover-only information. | Tap reveals tooltip. |
| MOB-08 | Performance budget on mid-tier phone. | 5k points renders < 500ms. |

### 6.15 Research and education (EDU)

| ID | Requirement | Acceptance |
|---|---|---|
| EDU-01 | Every chart has a plain-language description, question and "how to read". | No empty description. |
| EDU-02 | Methodology: formula, inputs, source, proxy status. | Proxy badge links to explanation. |
| EDU-03 | Related charts. | At least two where meaningful. |
| EDU-04 | Glossary terms inline. | Hover/tap definition. |
| EDU-05 | AI explanation of current chart (LIB parity). | Answer cites visible series and values. |
| EDU-06 | Strategy/backtest explanation where applicable. | Assumptions and fees stated. |
| EDU-07 | No financial advice language. | Copy review checklist passes. |

### 6.16 Data quality and freshness (DQ)

| ID | Requirement | Acceptance |
|---|---|---|
| DQ-01 | Metric metadata: unit, grain, source, coverage, last_updated, stale_reason, proxy. | API returns all fields. |
| DQ-02 | Freshness badge: live, daily, stale, empty. | Badge matches API. |
| DQ-03 | Stale reason is human-readable. | "No rows since 2010-03-05". |
| DQ-04 | Proxy badge on proxy metrics. | At least 6 metrics flagged. |
| DQ-05 | Coverage shading for missing periods. | Missing range visibly distinct. |
| DQ-06 | Partial-period warning at range edges. | Warning names the period. |
| DQ-07 | No fake or interpolated values in chart series. | Nulls preserved end-to-end. |
| DQ-08 | Data source and methodology link. | Link opens correct doc. |

### 6.17 Performance (PERF)

| ID | Requirement | Acceptance |
|---|---|---|
| PERF-01 | Chart render < 300ms for 5k points × 4 series on desktop. | Lighthouse/Playwright timing. |
| PERF-02 | API p95 < 1s for 5k points; p95 < 2s for 8 series. | Load test. |
| PERF-03 | Downsample to max 2 points per pixel; preserve min/max extrema. | Visual diff vs raw. |
| PERF-04 | Cache series by key; no refetch on theme/fullscreen. | Network tab shows one request. |
| PERF-05 | Metric rail virtualised above 1,000 rows. | Scroll stays 60fps. |
| PERF-06 | Bundle: chart route < 350KB gzip initial. | Build report. |

### 6.18 Accessibility (A11Y)

| ID | Requirement | Acceptance |
|---|---|---|
| A11Y-01 | Keyboard navigation for catalog, controls, legend and drawings. | Tab order logical. |
| A11Y-02 | ARIA labels for chart, axes, controls and states. | axe-core zero critical. |
| A11Y-03 | Contrast ≥ 4.5:1 for text, ≥ 3:1 for graphics. | Automated check. |
| A11Y-04 | Colour is not the only series differentiator (dash/label). | Legend has patterns. |
| A11Y-05 | Reduced-motion respects `prefers-reduced-motion`. | No animation. |
| A11Y-06 | Screen-reader summary of chart values. | Hidden table or text summary. |
| A11Y-07 | Focus visible on all interactive elements. | No outline removal. |

### 6.19 Security (SEC)

| ID | Requirement | Acceptance |
|---|---|---|
| SEC-01 | All layout/annotation/alert endpoints require auth and ownership. | 403 for other users. |
| SEC-02 | Parameter values allowlisted; no SQL injection. | Fuzz tests. |
| SEC-03 | Share tokens are signed, expiring and read-only. | Expired token 401. |
| SEC-04 | Rate limits on chart series, export and alerts. | 429. |
| SEC-05 | CSV/JSON export escapes formula injection. | Leading `= + - @` escaped. |
| SEC-06 | Screenshots/embeds do not leak private annotations. | Public flag required. |

### 6.20 API contract (API)

| ID | Requirement | Acceptance |
|---|---|---|
| API-01 | `GET /api/v1/charts` returns catalog summary. | Matches YAML counts. |
| API-02 | `GET /api/v1/charts/{id}` returns chart spec. | Includes variants and controls. |
| API-03 | `GET /api/v1/charts/{id}/series` returns multiple metrics in one response. | One round trip per chart. |
| API-04 | Series params: from, to, grain, max_points, transform, cohort, params. | Invalid values 422. |
| API-05 | Response includes per-metric meta and null gaps. | No zero-fill. |
| API-06 | `GET /api/v1/ohlc/{grain}` supports hourly/daily/weekly/monthly. | Grain labels correct. |
| API-07 | Layouts CRUD: `/api/v1/charts/layouts`. | Owner scoped. |
| API-08 | Annotations CRUD: `/api/v1/charts/{id}/annotations`. | Batch upsert. |
| API-09 | Alerts CRUD and events: `/api/v1/alerts`. | Test endpoint. |
| API-10 | OpenAPI schema and examples. | CI validates. |

### 6.21 Data and derived series (DATA)

| ID | Requirement | Acceptance |
|---|---|---|
| DATA-01 | Derived series definitions live in SQL/MV or Rust, never in chart code. | Chart spec only references metric ids. |
| DATA-02 | Cohort and parameterised metrics are first-class registry entries. | No client-side SQL. |
| DATA-03 | URPD bins and heatmaps are precomputed for performance. | Query < 1s. |
| DATA-04 | Cointime metrics (liveliness, vaultedness, AVIV) derived from UTXO ages. | Formula documented. |
| DATA-05 | Realized PnL and sell-side risk derived from spent outputs. | Values reconcile with SOPR. |
| DATA-06 | ETF, treasury, options and macro ingest have explicit freshness SLAs. | Badge shows source time. |
| DATA-07 | Entity labels and exchange balances have a labelling workflow. | Labels versioned and auditable. |
| DATA-08 | Every proxy metric is named `*_proxy` or carries a proxy badge. | No silent proxies. |

---

### 6.22 Workbench and strategy features (WB/STR)

| ID | Requirement | Acceptance |
|---|---|---|
| WB-01 | Formula builder with allowlisted identifiers, operators and functions; max AST depth 20. | Unknown identifier or SQL token returns 422. |
| WB-02 | Inputs can be any catalog metric, with grain and transform selectors. | Preview uses the same series pipeline as charts. |
| WB-03 | Save private/custom indicators; they appear in the series picker. | Saved indicator renders after reload. |
| WB-04 | Version custom indicators; old versions remain reproducible. | Version history shows inputs and formula. |
| WB-05 | Share a read-only custom indicator link. | Recipient cannot edit. |
| WB-06 | Export custom indicator as JSON and Pine Script. | Round-trip import and compile check. |
| STR-01 | DCA simulator: amount, frequency, range, fees, lump-sum comparison. | Results reconcile with `lib/dca.ts` vectors. |
| STR-02 | Exit strategy simulator: rule-based exits, no lookahead, fees. | Signals use close data available at the time. |
| STR-03 | Portfolio/MPT simulator: weights, rebalance, risk-adjusted metrics. | Weights sum to 100%; metrics match definitions. |
| STR-04 | Backtest assumptions displayed: fees, slippage, range, rebalance. | Assumptions visible on results. |
| STR-05 | Strategy alerts when a rule changes. | Alert links to strategy state. |
| STR-06 | No financial-advice language in strategy copy. | Copy review checklist passes. |

### 6.23 Chart page anatomy

Every chart page uses the same regions, in this order:

1. **Header** — breadcrumb (`Category / Chart`), title, question, freshness badge, proxy badge, favourite star.
2. **Toolbar** — variant tabs, range presets, custom range, grain, axis menu, series button, compare button, alert button, export menu, fullscreen.
3. **Chart surface** — panes, axes, series, thresholds, halvings, annotations, last-value label.
4. **Legend** — one row per series: colour/pattern, label, axis tag, last value, visibility toggle, info popover.
5. **Description** — "How to read", formula, source, proxy note, related charts.
6. **Footer actions** — save layout, share, screenshot, CSV, copy link.

On mobile, toolbar collapses into a bottom sheet; legend becomes a horizontally scrollable strip; description collapses into an accordion.

### 6.24 Key user flows

**A. Open and inspect a chart**

1. Search `mvrv` in the catalog.
2. Open `valuation.mvrv`.
3. Default shows MVRV + SMA30 + price on a log right axis.
4. Click `Z-Score` tab; range, grain and annotations stay.
5. Switch range to `All`; grain auto-changes to monthly; chart request uses `max_points`.
6. Toggle log off for the left axis; right axis stays log.
7. Hover shows date, MVRV, SMA30, price and units.
8. Copy URL; a teammate sees the same state.

**B. Compare two metrics**

1. Open `Compare`.
2. Add `valuation.mvrv` and `profitability.sopr`.
3. Choose `Normalise → index=100`.
4. Both series share one axis; legend shows transform.
5. Hover synchronises the date across both.
6. Save as a layout named "Cycle valuation".

**C. Create an alert**

1. On `valuation.mvrv`, click the bell.
2. Choose series `MVRV Z-Score`, rule `cross above`, threshold `7`.
3. Cooldown 24h; delivery in-app + email.
4. Save; the rule appears in `Alerts`.
5. When the value crosses, one event is written; the chart link restores the state.

**D. Annotate and share**

1. Draw a horizontal line at a threshold, a trend line and a text note.
2. Open the object list, change the line colour and lock the note.
3. Save the annotation snapshot.
4. Export JSON; import on another chart.
5. Share a read-only link; annotations render but cannot be edited.

**E. Build a custom indicator**

1. Open `Workbench`.
2. Select `MVRV Z-Score` and `SOPR` as inputs.
3. Write `zscore(mvrv, 4y) - zscore(sopr, 1y)` using the formula builder.
4. Parser validates identifiers and depth; preview renders.
5. Save as a private indicator; it appears in the series picker.

**F. Mobile check-in**

1. Open a saved dashboard on a phone.
2. Cards stack; range control in bottom sheet.
3. Tap a card; pinch to zoom; tap a point for tooltip.
4. Stale cards show a badge and reason.
5. Share link opens the same dashboard.

**G. API consumer**

1. Create an API key with `charts:read`.
2. `GET /api/v1/charts` lists 109 charts.
3. `GET /api/v1/charts/valuation.mvrv/series?range=1y&grain=daily` returns all series and meta.
4. `GET /api/v1/charts/valuation.mvrv/series.csv` returns the same values.
5. Rate limit headers show remaining quota.

### 6.25 Visual language

| Element | Rule |
|---|---|
| Background | Theme surface; chart transparent. |
| Grid | 1px, 18% opacity; horizontal only by default. |
| Axes | 1px border; labels 11–12px; unit in axis title. |
| Metric colour | Teal family, stable per metric. |
| Price colour | Amber, always right axis when overlaid. |
| Positive/negative | Green/red only for signed bars and candles; never for line identity. |
| Thresholds | Dashed 1px, label at right edge. |
| Halvings | Vertical dotted line + date label. |
| Bands | 12–18% opacity fill, 1px border. |
| Tooltip | Date header, colour swatch, series name, value + unit, transform. |
| Badges | `LIVE`, `DAILY`, `STALE`, `PROXY`, `PARTIAL`; text + colour, never colour alone. |
| Empty state | Icon + reason + action (change range, seed data, open related chart). |
| Error state | Message + retry + request id. |

---

## 7. Chart catalog summary

The catalog defines **109 chart pages**: 68 existing, 41 new. It covers **267/267 registry metrics**. `scripts/verify_chart_catalog.py` enforces this.

| Category | Charts | Unique metrics referenced | Phase |
|---|---:|---:|---|
| price | 17 | 25 | 2 + 15 + 17 |
| valuation | 15 | 29 | 3 + 15 + 17 |
| profitability | 5 | 6 | 4 |
| risk | 2 | 8 | 4 |
| cycle | 9 | 15 | 5 + 15 + 17 |
| supply | 8 | 32 | 6 + 15 + 17 |
| addresses | 5 | 20 | 7 |
| fees | 8 | 48 | 8 |
| flow | 13 | 25 | 9 + 16 + 17 |
| mining | 5 | 18 | 10 + 17 |
| network | 4 | 22 | 11 |
| script | 2 | 18 | 12 |
| macro | 4 | 8 | 13 + 15 |
| derivatives | 5 | 2 | 14 + 16 |
| sentiment | 1 | 1 | 15 |
| platform (compare, workbench, alerts, strategies) | 6 | 1 | 15 |
| **total** | **109** | **267 unique** | |

Some metrics appear in more than one chart (for example `price_close_daily` as a comparison series), so the column sums exceed 267; unique coverage is exactly 267/267. The chart rail adds a `platform` category for compare/workbench/alerts/strategies; metric categories stay as they are today.

The 41 new chart pages include:

`valuation.histograms`, `valuation.quantile_bands`, `profitability.sopr_cohorts`, `profitability.realized_pnl`, `profitability.sell_side_risk`, `risk.dashboard`, `cycle.master`, `supply.profit_loss`, `derivatives.options`, `derivatives.liquidations`, `derivatives.term_structure`, `urpd.distribution`, `urpd.heatmap`, `urpd.diffs`, `cointime.liveliness`, `cointime.supply_regions`, `technical.bollinger`, `technical.macd`, `technical.stochastic`, `technical.seasonality`, `technical.monthly_returns`, `technical.drawdown_table`, `etf.balances`, `treasury.companies`, `strategies.exit`, `strategies.portfolio`, `compare.overlay`, `workbench.custom`, `alerts.manager`, `macro.correlations`, `entity.exchange_balances`, `flow.lifespan_signals`, `flow.capital_rotation`, `valuation.monetary_premium`, `mining.models`, `cycle.rainbow`, `technical.price_ranges`, `technical.risk_adjusted`, `technical.inflation_adjusted`, `etf.market`, `supply.net_position_change`.

Per-chart contracts are in `docs/charts/chart-by-chart.md`. The catalog is the source of truth; the markdown is generated.

---

## 8. Chart specification model

### 8.1 Source of truth

`docs/charts/chart-catalog.yaml` is authored and reviewed. A build script generates:

- `frontend/src/charts/generated/catalog.ts` — typed catalog for the app.
- `backend-rs/src/charts/catalog.json` — served by `/api/v1/charts`.
- `docs/charts/chart-by-chart.md` — human-readable contract.

No hand-written chart arrays in React components. The validator fails CI if the catalog and metric registry diverge.

### 8.2 TypeScript contract

```ts
export type ChartArchetype =
  | "candles" | "line_oscillator" | "line_dual_axis" | "bands_overlay"
  | "multi_series" | "stacked_area" | "bar_series" | "distribution_histogram"
  | "heatmap" | "scatter" | "table" | "price_distribution" | "gauge_composite"
  | "dashboard_grid" | "multi_pane";

export type AxisId = "left" | "right" | "volume" | "color" | "x" | "y" | "gauge";

export type ControlId =
  | "range" | "custom_range" | "grain" | "log_axis" | "price_overlay"
  | "ma_overlay" | "volume_pane" | "legend" | "crosshair" | "zoom"
  | "reset_zoom" | "fullscreen" | "screenshot" | "csv" | "saved_layout"
  | "thresholds" | "histogram_variant" | "smoothing" | "axis_toggle"
  | "dual_axis_labels" | "band_toggle" | "quantile_window" | "series_toggle"
  | "axis_assign" | "normalize" | "percent_mode" | "reorder" | "bar_mode"
  | "window" | "bins" | "log_y" | "percentile_markers" | "bin_size"
  | "color_scale" | "log_color" | "hover_detail" | "x_metric" | "y_metric"
  | "log_x" | "log_y" | "regression" | "quadrants" | "period" | "sort"
  | "export_csv" | "components" | "history_toggle" | "card_select"
  | "layout" | "sync_range" | "indicator_params";

export interface AxisSpec {
  id: AxisId;
  unit: string;
  scale: "linear" | "log";
  min?: number | "auto";
  max?: number | "auto";
  decimals?: number;
  color?: string;
  title?: string;
}

export interface SeriesSpec {
  /** Composite OHLC series. */
  type?: "ohlc";
  open?: MetricId; high?: MetricId; low?: MetricId; close?: MetricId; volume?: MetricId;
  /** Single-metric series. */
  metric?: MetricId;
  label?: string;
  axis: AxisId;
  style: "line" | "area" | "bar" | "candle" | "band" | "heat" | "gauge";
  color?: string;
  width?: number;
  dash?: "solid" | "dashed" | "dotted";
  hiddenByDefault?: boolean;
  transform?: TransformId;
}

export interface VariantSpec {
  id: string;
  label: string;
  series: MetricId[];
  cohort?: "all" | "sth" | "lth";
  unit?: "btc" | "usd" | "pct";
  note?: string;
}

export interface ChartSpec {
  id: string;
  title: string;
  category: string;
  archetype: ChartArchetype;
  status: "existing" | "new";
  phase: string;
  priority: "P0" | "P1" | "P2";
  question: string;
  parity: string[];
  chartTypes: ("candles" | "line" | "area" | "step" | "columns" | "stacked_columns"
    | "stacked_area" | "band" | "histogram" | "heatmap" | "scatter" | "table"
    | "gauge" | "grid")[];
  panes: string[];
  metrics: MetricId[];
  legacyMetrics?: MetricId[];
  disabledMetrics?: MetricId[];
  newMetrics?: string[];
  defaultMetric: MetricId;
  series: SeriesSpec[];
  variants: VariantSpec[];
  axes: AxisSpec[];
  controls: ControlId[];
  annotations: ("halvings" | "crosshair" | "last_value" | "ath" | "thresholds")[];
  dataFreshness: string;
  dataRequirements?: string;
  expected: string[];
  acceptance: string[];
}
```

### 8.3 URL state

```
/charts/valuation.mvrv
  ?variant=z
  &range=4y            # preset, or from=2020-01-01&to=2024-01-01
  &grain=weekly
  &log=left
  &axis=left:linear,right:log
  &series=mvrv_daily:left:line:raw,mvrv_sma30_daily:left:line:raw
  &thresholds=on
  &halvings=on
  &tz=utc
  &layout=<id>
```

Rules:
- Unknown keys ignored, invalid values fall back to defaults with a toast.
- `range=all` is valid; `from/to` override presets.
- `series` is encoded as `metric:axis:style:transform`; order = render order.
- Annotation state is separate (`annotations=<snapshotId>`), not inline geometry.
- Share links are read-only by default.

### 8.4 State machine

```
idle -> loading -> ready
              \-> empty
              \-> error
ready -> zooming/panning -> ready
ready -> variant-changing -> loading (if new data) -> ready
```

Rules:
- Variant/range/grain changes abort in-flight requests.
- Cache key includes chart id, metrics, range, grain, transform, cohort, params.
- Optimistic UI for axis/series visibility; no refetch.
- Error state keeps last good data visible with a banner when possible.

### 8.5 Rendering contract

| Archetype family | Renderer | Engine |
|---|---|---|
| candles, line, area, step, columns, stacked area | `TimeSeriesRenderer` | QFChart |
| band fill, thresholds, halvings | `TimeSeriesRenderer` overlays | QFChart/ECharts |
| histogram | `DistributionRenderer` | ECharts |
| price distribution (URPD) | `PriceDistributionRenderer` | ECharts |
| heatmap | `HeatmapRenderer` | ECharts |
| scatter | `ScatterRenderer` | ECharts |
| table | `TableRenderer` | HTML/CSS |
| gauge | `GaugeRenderer` | ECharts |
| dashboard | `DashboardRenderer` | React grid |

Every renderer implements:

```ts
interface ChartRenderer<P = unknown> {
  mount(el: HTMLElement, spec: ChartSpec, data: ChartData, state: ChartState): void;
  update(data: ChartData, state: ChartState): void;
  resize(): void;
  screenshot(): Promise<Blob>;
  destroy(): void;
}
```

`ChartHost` owns the renderer lifecycle, data fetching, state and error boundaries. Chart pages are config, not components.

---

## 9. Data and API design

### 9.1 Metric metadata extension

Current `MetricSummary` has `id/title/category/unit/interval/disabled/description`. Extend with:

```ts
interface MetricMeta {
  id: string;
  title: string;
  category: string;
  unit: string;
  grain: "hourly" | "daily" | "weekly" | "monthly" | "none";
  precision: number;
  scale: "linear" | "log";
  proxy: boolean;
  source: string;
  coverage: { min: string; max: string };
  lastUpdated: string | null;
  staleReason: string | null;
  disabled: boolean;
}
```

Backend source: registry + `system.parts`/marts metadata. Cache for 60s.

### 9.2 Series endpoint

`GET /api/v1/charts/{chartId}/series`

| Param | Type | Default | Rules |
|---|---|---|---|
| `metrics` | CSV | chart default | Must belong to chart or allowlisted extras; max 8 |
| `from` / `to` | ISO date | range preset | Validated, from ≤ to |
| `grain` | `hourly\|daily\|weekly\|monthly` | chart default | Coarser than native only |
| `max_points` | int | 2000 | 100–10000; server downsamples |
| `transform` | `raw\|pct\|index\|zscore\|btc` | `raw` | Applied server-side for heavy windows |
| `cohort` | `all\|sth\|lth` | `all` | Only where supported |
| `params` | JSON | `{}` | Allowlisted per metric |

Response:

```json
{
  "chartId": "valuation.mvrv",
  "from": "2020-01-01",
  "to": "2024-01-01",
  "grain": "weekly",
  "series": [
    {
      "metric": "mvrv_z_daily",
      "label": "MVRV Z-Score",
      "unit": "ratio",
      "axis": "left",
      "points": [{"t": "2020-01-06", "v": 1.23}, {"t": "2020-01-13", "v": null}],
      "meta": {"proxy": false, "lastUpdated": "2024-01-01T00:00:00Z"}
    }
  ]
}
```

No zero-fill. Timestamps are UTC ISO. `v: null` is a real gap.

### 9.3 Downsampling

- Server-side LTTB for > `max_points`, with min/max preservation.
- Bucket by grain: hourly ≤ 2d, daily ≤ 2y, weekly ≤ 6y, monthly > 6y.
- Return `downsampled: true` and the effective bucket size.
- Charts never receive more than 10,000 points; default 2,000.

### 9.4 Range and grain resolution

| Range | Default grain | Max points |
|---|---|---|
| 1D | hourly | 24 |
| 1W | hourly | 168 |
| 1M | daily | 31 |
| 3M | daily | 92 |
| 6M | daily | 183 |
| YTD | daily | 366 |
| 1Y | daily | 366 |
| 2Y | weekly | 105 |
| 4Y | weekly | 209 |
| Cycle | weekly | ~120 |
| All | monthly | ~220 |

Users can override grain; backend rejects finer-than-native grains.

### 9.5 New derived series

| Series | Source | Method |
|---|---|---|
| `mvrv_quantile_bands` | MVRV history | Rolling quantiles 10/25/50/75/90 over 4Y/All |
| `sth_sopr`, `lth_sopr` | spent outputs + age | Age < 155d / ≥ 155d |
| `net_realized_pnl_*` | spent outputs | (spend price − acquisition price) × value |
| `sell_side_risk*` | realized PnL / realized cap | Public definition |
| `pct_supply_in_profit*` | UTXO set + price | Supply where price > acquisition price |
| `urpd_*` | UTXO set + acquisition price | Bins by price, daily snapshots |
| `liveliness`, `vaultedness`, `active_supply`, `vaulted_supply` | coinblocks | Cointime definitions |
| `options_*` | Deribit public API | OI, volume, ATM IV, put/call, skew |
| `liquidations_*` | exchange public API | Long/short liquidation USD |
| `etf_*` balances | issuer CSVs/APIs | Holdings, AUM, volume |
| `treasury_*` | filings | Holdings, cost basis, mNAV |
| `seasonality_matrix`, `monthly_return_matrix` | price history | Calendar aggregation |
| `bollinger_*`, `macd_*`, `stoch_*` | price history | Standard formulas |
| `rolling_correlation_*` | aligned daily series | Pearson over 90d |

Every derived series follows DATA-01: SQL/MV/Rust, not chart code.

### 9.5.1 Data acquisition and freshness

| Series family | Source | Cadence | Freshness SLA |
|---|---|---|---|
| Price OHLC | Exchange public API (Binance/Kraken) | Hourly + daily | 15 min after bar close |
| Blocks, txs, outputs, inputs, fees | Local Bitcoin node + decoder | Per block | 10 min |
| URPD, Cointime, cohort PnL, SOPR | Derived from chain | Daily | 1 hour after daily close |
| Funding, open interest | Binance/CME public API | Hourly | 30 min |
| Options OI/IV/skew, term structure | Deribit public API | Hourly | 30 min |
| Liquidations | Exchange public API | Hourly | 30 min |
| ETF flows/balances/AUM | Issuer CSV/API + AP data | Daily | 2 hours after US close |
| Treasury holdings/cost basis | SEC filings + company releases | Weekly/manual review | 7 days |
| Exchange balances/netflow | Versioned address labels + chain | Daily | 24 hours |
| Macro (DXY, M2, Fed, CPI) | FRED | Per release | 1 day |
| Fear & Greed | Alternative.me | Daily | 2 hours |
| Dominance, ETH/BTC, total cap | CoinGecko/Kraken | Hourly | 30 min |
| Lightning capacity/nodes | 1ML or mempool.space | Daily | 24 hours |
| Social sentiment/news/video | Excluded | n/a | n/a |

Each ingested row carries `source`, `source_ts`, `ingested_at` and `label_version` where applicable. Charts never synthesize a missing timestamp; the freshness badge and coverage shading do the explaining.

### 9.6 Persistence tables

```sql
CREATE TABLE chart_layouts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  chart_id TEXT,
  spec JSONB NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chart_annotations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  chart_id TEXT NOT NULL,
  variant_id TEXT,
  payload JSONB NOT NULL,
  schema_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chart_alerts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  chart_id TEXT NOT NULL,
  metric_id TEXT NOT NULL,
  rule JSONB NOT NULL,
  delivery JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  cooldown_seconds INT NOT NULL DEFAULT 3600,
  last_evaluated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chart_alert_events (
  id UUID PRIMARY KEY,
  alert_id UUID NOT NULL,
  value DOUBLE PRECISION,
  threshold DOUBLE PRECISION,
  fired_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  payload JSONB
);
```

### 9.7 Alert evaluator

- Runs as a `chart-alerts` job in the separate `scheduler` binary designed in `docs/superpowers/specs/2026-11-24-scheduler-design.md`. The API only serves CRUD and event history.
- Every 5 minutes: load active alerts, fetch latest metric values in one query, evaluate, insert events, deliver.
- Idempotency: unique `(alert_id, metric_id, bucket_ts, rule_hash)`.
- Cooldown enforced before delivery.
- Failure isolated per alert; log and continue.
- No alert evaluation during a known data outage; use freshness metadata.

---

## 10. Frontend architecture

### 10.1 File map

```
frontend/src/charts/
  types.ts                 # ChartSpec, SeriesSpec, AxisSpec, VariantSpec, ControlId
  registry.ts              # generated catalog lookup + helpers
  generated/catalog.ts     # generated from YAML, do not edit
  ranges.ts                # presets, cycle start, grain auto
  transforms.ts            # raw/pct/index/zscore/btc/smoothing
  downsampling.ts          # client-side LTTB fallback
  colors.ts                # accessible palette, stable metric colors
  format.ts                # USD/BTC/%/ratio/sats formatters
  urlState.ts              # parse/serialize ChartState
  state.ts                 # reducer, defaults, validation
  data.ts                  # query keys, fetch, cache, abort
  renderers/
    TimeSeriesRenderer.tsx
    DistributionRenderer.tsx
    PriceDistributionRenderer.tsx
    HeatmapRenderer.tsx
    ScatterRenderer.tsx
    TableRenderer.tsx
    GaugeRenderer.tsx
    DashboardRenderer.tsx
  specs/
    price.ts valuation.ts profitability.ts risk.ts cycle.ts supply.ts
    addresses.ts fees.ts flow.ts mining.ts network.ts script.ts macro.ts
    derivatives.ts sentiment.ts new.ts
frontend/src/components/chart/
  ChartHost.tsx
  ChartToolbar.tsx
  RangeControls.tsx
  GrainControls.tsx
  AxisControls.tsx
  SeriesPanel.tsx
  Legend.tsx
  Tooltip.tsx
  VariantTabs.tsx
  DrawingPanel.tsx        # existing 52-tool panel, extended
  DrawingStyleToolbar.tsx # from professional drawing kit
  ObjectList.tsx
  EmptyState.tsx
  StaleBadge.tsx
  ChartErrorBoundary.tsx
frontend/src/components/dashboard/
  DashboardGrid.tsx
  DashboardCard.tsx
  DashboardTemplates.tsx
frontend/src/hooks/
  useChartState.ts
  useChartData.ts
  useChartLayout.ts
  useAnnotations.ts
  useAlerts.ts
```

### 10.2 Responsibility boundaries

- `ChartHost` = lifecycle, renderer selection, error boundary, data/state wiring. No chart-specific logic.
- `specs/*` = catalog data only. No JSX, no fetching.
- `renderers/*` = pixels and chart engine. No business rules.
- `transforms.ts` = pure functions, fully unit-tested.
- `state.ts` = pure reducer, URL-safe.
- `data.ts` = API contract, cache keys, abort.
- `components/chart/*` = controls and presentation.

### 10.3 Migration path

1. Generate catalog TS from YAML.
2. Build `ChartHost` and `TimeSeriesRenderer` behind a feature flag.
3. Port `price.btc` first; verify pixel parity with current `PriceChart`.
4. Port existing onchain charts by archetype; delete `OnchainChart` and hardcoded `PriceChart` after all 68 existing charts pass.
5. Add new archetypes and new charts.

No big-bang rewrite. The old components stay until each chart's acceptance list passes.

---

## 11. Backend architecture

### 11.1 File map

```
backend-rs/src/charts/
  mod.rs            # router, state
  catalog.rs        # include generated catalog.json
  series.rs         # multi-metric fetch, downsampling, transforms
  layouts.rs        # CRUD, ownership, share tokens
  annotations.rs    # CRUD, schema version
  alerts.rs         # CRUD, evaluator, delivery
  params.rs         # allowlisted metric params/cohorts
backend-rs/migrations/
  002_chart_layouts.sql
  003_chart_annotations.sql
  004_chart_alerts.sql
  005_chart_favorites.sql
```

### 11.2 Series query construction

- One ClickHouse query per chart request, `UNION ALL` per metric, or one query per metric executed concurrently (max 8). Choose UNION ALL with a `metric` column when metrics share the same time key; otherwise concurrent queries + merge.
- Parameter binding only; no string interpolation of user values.
- Cohort/params resolved from allowlist.
- `max_points` downsampling in SQL where possible (`quantile`/bucket) or Rust LTTB after fetch.
- Cache: in-process LRU keyed by normalized query, TTL 30s; HTTP `Cache-Control: private, max-age=30`.
- Timeout: 10s; partial results allowed only if flagged.

### 11.3 Catalog generation

- Build script reads YAML, validates, writes TS and JSON.
- Backend includes JSON at compile time.
- `/api/v1/charts` returns summaries; `/api/v1/charts/{id}` returns full spec.
- Version field in catalog; frontend warns on mismatch.

---

## 12. Chart-by-chart delivery protocol

Each chart is implemented in this order. No chart is "done" before all steps pass.

1. Read its section in `docs/charts/chart-by-chart.md`.
2. Confirm every metric exists in `/api/v1/metrics`; if new, add the derived metric first.
3. Add/verify the spec in `frontend/src/charts/specs/<category>.ts`.
4. Implement variants, series, axes and controls through the shared components.
5. Add unit tests for transforms/ranges/state specific to the chart.
6. Add a Playwright visual test for default + each variant + light/dark + 360/1440.
7. Add data-contract test: all series resolve, null gaps preserved, units correct.
8. Compare side-by-side with the competitor reference; record the review in the PR.
9. Update `implementation` in the catalog and regenerate `implementation-tracker.md`; update the parity ledger implementation column.
10. Update `docs/charts/chart-catalog.yaml` status if it was `new`.

### 12.1 Chart acceptance checklist

- [ ] Default view answers the chart question without interaction.
- [ ] Every variant is reachable and preserves range/grain/annotations.
- [ ] Every series has visible axis, unit and legend entry.
- [ ] Log scale is safe (non-positive values flagged).
- [ ] Nulls are gaps, never zeros.
- [ ] Tooltip lists all visible series with correct values.
- [ ] Thresholds/bands/halvings are labelled.
- [ ] Range presets include All and Cycle.
- [ ] Screenshot, CSV and share link include the visible state.
- [ ] Empty/stale/error states are explicit.
- [ ] Keyboard and screen-reader checks pass.
- [ ] Visual test passes at 360/768/1440 and both themes.
- [ ] Competitor parity review recorded.

---

## 13. Implementation phases

| Phase | Deliverable | Exit criteria |
|---|---|---|
| 0 | Catalog, validator, generated docs, spec sign-off | `verify_chart_catalog.py` passes; 267/267 metrics covered |
| 1 | Chart foundation: types, catalog TS, ChartHost, TimeSeriesRenderer, URL state | `price.btc` and one oscillator render through ChartHost |
| 2 | Time/axes/series/transforms controls | Log, dual axis, multi-series, ranges, downsampling pass tests |
| 3 | Chart types: histogram, heatmap, scatter, table, gauge, multi-pane | Each renderer has a demo chart and tests |
| 4 | Platform shell: screenshot, CSV, share, layouts | State round-trips; PNG/CSV match UI |
| 5 | Price family (8 original charts) | All acceptance lists pass |
| 6 | Valuation family (9 original charts) | All acceptance lists pass |
| 7 | Profitability/risk (3 original charts) | All acceptance lists pass |
| 8 | Cycle family (5 original charts) | All acceptance lists pass |
| 9 | Supply family (6 original charts) | All acceptance lists pass |
| 10 | Address family (5 charts) | All acceptance lists pass |
| 11 | Fees family (8 charts) | All acceptance lists pass |
| 12 | Flow family (8 original charts) | All acceptance lists pass |
| 13 | Mining/network (8 original charts) | All acceptance lists pass |
| 14 | Script/macro/derivatives/sentiment (7 original charts) | All acceptance lists pass |
| 15 | Platform features: alerts, mobile, API keys, AI explanation, workbench, strategies | Feature acceptance lists pass |
| 16 | Data-dependent charts (25: URPD, Cointime, cohort PnL, options, ETF balances, treasuries, etc.) | Data definitions shipped and validated |
| 17 | Parity extension charts (11: exchange balances, lifespan signals, monetary premium, mining models, capital rotation, rainbow, price ranges, risk-adjusted, inflation-adjusted, ETF market, supply net change) | Ingest/derived series shipped; acceptance lists pass |
| 18 | Parity audit, performance, accessibility, documentation | 90/90 in-scope units marked `shipped`; no critical a11y/perf failures |

Phase 0-4 are platform foundations and must land before chart batches. Chart batches 5-14 can run in parallel once the foundation is stable. Phases 16-17 depend on derived/external data; phase 15 can run in parallel after the platform shell.

---

## 14. Quality gates

### 14.1 Automated

- `scripts/verify_chart_catalog.py` — catalog/metric coverage.
- Rust: `cargo test` for series API, params, layouts, alerts.
- Frontend: `vitest` for transforms, ranges, state, formatters, each renderer.
- Playwright: visual snapshots per chart × variant × theme × 360/1440.
- Data contract: all series resolve; no unknown metrics; no zero-fill.
- Performance: 5k × 8 series render < 300ms; API p95 < 1s.
- Accessibility: axe-core zero critical; keyboard smoke test.
- Security: parameter fuzzing; ownership tests for layouts/alerts/annotations.

### 14.2 Manual parity review

For each chart family, put CypherGlass and the competitor chart side by side. Record:

- Default view readability.
- Presence of every control the competitor has.
- Variants/cohorts.
- Time presets.
- Axis/log handling.
- Annotations.
- Export/share.

A chart missing a competitor control must have a written exception in the parity ledger.

### 14.3 Definition of done

A chart is done when:

1. Catalog entry status is `existing` or `new` with `implementation: shipped`.
2. All acceptance items pass.
3. Visual tests pass.
4. Data contract passes.
5. Parity review is recorded.
6. Docs and tooltips are written.
7. No critical accessibility issue.
8. Performance budget met.

---

## 15. Risks and assumptions

| Risk | Impact | Mitigation |
|---|---|---|
| Data pipeline is stale/partial | Charts look broken even when UI is correct | Freshness badges, explicit stale reasons; ingestion tracked separately |
| Full-history API cap | "All"/Cycle charts fail | Remove 1,826-day cap; cursor pagination; server downsampling |
| QFChart limits for heatmap/scatter | New chart types blocked | Raw ECharts adapters; renderer contract isolates engine |
| Derived metric correctness | Wrong cohort/URPD values | Public formulas, reconciliation tests, proxy badges |
| 109 charts is a large surface | Long implementation | Archetype reuse; chart batches; catalog-driven tests |
| Alert scheduler absent | Alerts cannot ship | Dedicated evaluator task; 5-minute cadence |
| Competitor paywalls | Parity review incomplete | Public feature lists + screenshots; no proprietary data copied |
| Mobile drawing complexity | Poor touch UX | Simplified toolbar; editing on desktop first |
| Performance at 8 series × 5k points | Sluggish charts | LTTB, max points, memoised transforms, canvas rendering |
| Layout/annotation schema drift | Broken saved states | Versioned JSON + migrations |

**Assumption:** full-history data and spent-output/UTXO-age series will be available by the time data-dependent charts ship. This spec designs the charts; ingestion is a separate workstream.

---

## 16. Open decisions

| Decision | Choice | Reason |
|---|---|---|
| Catalog source of truth | YAML → generated TS/JSON | Reviewable, language-neutral, CI-validated |
| Time-series engine | QFChart | Already integrated, drawing support, ECharts base |
| Non-time-series engine | Raw ECharts/HTML | Heatmap/scatter/gauge/table need custom series |
| Transform location | Server for heavy windows, client for display | Performance and correctness |
| Alert scheduler | Job in the separate `scheduler` binary | Consistent with the scheduler design; no in-API timer |
| Mobile | Responsive web first | Scope control |
| API auth | API keys + user bearer | Public API parity with LIB |
| Annotation storage | Server-side with local fallback | Cross-device parity |
| Social data | Excluded | Explicit user scope |
| 98% metric | 90/91 parity units | 1 excluded social unit |

---

## 17. Appendix A — competitor references

- ITC: `https://intothecryptoverse.com` (charts, risk, DCA, exit strategies, risk portfolio tester, MPT, Workbench, mobile app).
- LookIntoBitcoin / Bitcoin Magazine Pro: `https://www.lookintobitcoin.com` (200+ charts, alerts, API/CSV, AI Analyst, TradingView indicators, strategies, treasury).
- Checkonchain: `https://charts.checkonchain.com` (pricing models, cycle extremes, STH/LTH, URPD, Cointime, derivatives/options, ETF, MSTR/treasuries, profit/loss, lifespan, network, supply, mining, technical).

## 18. Appendix B — requirement traceability

Every requirement ID in section 6 maps to at least one task in `docs/superpowers/plans/2026-11-24-chart-platform-parity.md`. Every chart ID in the catalog maps to one batch task and one visual test. The validator enforces metric coverage; the plan enforces requirement coverage.

| Requirement group | Primary task(s) |
|---|---|
| CAT-01..08 | Task 1, Task 2 |
| CAN-01..10 | Task 2, Task 8 |
| TIME-01..10 | Task 3 |
| AXIS-01..09 | Task 4 |
| SER-01..10 | Task 5 |
| TYPE-01..10 | Task 6, Task 7, Task 8 |
| VAR-01..08 | Task 9 |
| ANN-01..12 | Task 10 |
| CMP-01..07, DASH-01..06 | Task 11 |
| LAY-01..06, EXP-01..10 | Task 12 |
| ALR-01..10 | Task 13 |
| MOB-01..08 | Task 14 |
| EDU-01..07, WB-01..06, STR-01..06 | Task 27 |
| DQ-01..08 | Task 4, Task 9 |
| PERF-01..06, A11Y-01..07 | Task 28 |
| SEC-01..06 | Task 9, Task 12, Task 13 |
| API-01..10 | Task 9, Task 12 |
| DATA-01..08 | Task 25, Task 26 |

## 19. Appendix C — chart index

| Chart | Title | Category | Archetype | Status | Phase |
|---|---|---|---|---|---|
| `price.btc` | Bitcoin Price | price | candles | existing | phase_2_price |
| `price.drawdown` | Drawdown from ATH | price | line_oscillator | existing | phase_2_price |
| `price.mayer` | Mayer Multiple | price | line_dual_axis | existing | phase_2_price |
| `price.rsi` | RSI-14 | price | line_oscillator | existing | phase_2_price |
| `price.volatility` | Realized Volatility 30D | price | line_oscillator | existing | phase_2_price |
| `price.momentum` | Price Momentum | price | multi_series | existing | phase_2_price |
| `price.sharpe` | Sharpe Proxy 30D | price | line_oscillator | existing | phase_2_price |
| `price.cycle_overlays` | Cycle Overlays | price | multi_series | existing | phase_2_price |
| `valuation.mvrv` | MVRV / Z-Score / Momentum | valuation | bands_overlay | existing | phase_3_valuation |
| `valuation.realized_cap` | Realized Cap vs Market Cap | valuation | line_dual_axis | existing | phase_3_valuation |
| `valuation.realized_price` | Realized Price | valuation | line_dual_axis | existing | phase_3_valuation |
| `valuation.nupl` | NUPL | valuation | line_oscillator | existing | phase_3_valuation |
| `valuation.aviv` | AVIV Ratio | valuation | line_oscillator | existing | phase_3_valuation |
| `valuation.sth` | STH MVRV & Cost Basis | valuation | line_dual_axis | existing | phase_3_valuation |
| `valuation.lth` | LTH MVRV & Cost Basis | valuation | line_dual_axis | existing | phase_3_valuation |
| `valuation.risk_ratios` | Reserve Risk & RHODL | valuation | multi_series | existing | phase_3_valuation |
| `valuation.cap_models` | Cap Models: Average, Top, Delta, Balanced, CVDD | valuation | bands_overlay | existing | phase_3_valuation |
| `valuation.histograms` | MVRV / NUPL / SOPR Histograms | valuation | distribution_histogram | new | phase_16_data_dependent |
| `valuation.quantile_bands` | MVRV Quantile Bands | valuation | bands_overlay | new | phase_16_data_dependent |
| `profitability.sopr` | SOPR | profitability | line_oscillator | existing | phase_4_profitability_risk |
| `profitability.sopr_cohorts` | SOPR by Cohort | profitability | multi_series | new | phase_16_data_dependent |
| `profitability.puell` | Puell Multiple | profitability | line_oscillator | existing | phase_4_profitability_risk |
| `profitability.realized_pnl` | Net Realized PnL | profitability | bar_series | new | phase_16_data_dependent |
| `profitability.sell_side_risk` | Sell-Side Risk Ratio | profitability | line_oscillator | new | phase_16_data_dependent |
| `risk.composite` | Risk Composite | risk | gauge_composite | existing | phase_4_profitability_risk |
| `risk.dashboard` | Risk Regime Dashboard | risk | dashboard_grid | new | phase_16_data_dependent |
| `cycle.200w` | 200W MA + Heatmap | cycle | heatmap | existing | phase_5_cycle |
| `cycle.2y` | 2Y MA, 5x Bands, Golden 1.6 | cycle | bands_overlay | existing | phase_5_cycle |
| `cycle.pi` | Pi Cycle Top | cycle | multi_series | existing | phase_5_cycle |
| `cycle.powerlaw` | Power Law & Log Regression | cycle | bands_overlay | existing | phase_5_cycle |
| `cycle.bmsb` | Bull Market Support Band | cycle | bands_overlay | existing | phase_5_cycle |
| `cycle.master` | Cycle Master Dashboard | cycle | dashboard_grid | new | phase_16_data_dependent |
| `supply.circulating` | Circulating Supply & Inflation | supply | line_dual_axis | existing | phase_6_supply |
| `supply.hodl_waves` | HODL Waves | supply | stacked_area | existing | phase_6_supply |
| `supply.long_term` | Long-Term Supply | supply | multi_series | existing | phase_6_supply |
| `supply.cohorts` | STH / LTH Supply | supply | stacked_area | existing | phase_6_supply |
| `supply.profit_loss` | Supply in Profit / Loss | supply | bands_overlay | new | phase_16_data_dependent |
| `issuance.s2f` | Stock-to-Flow | supply | line_dual_axis | existing | phase_6_supply |
| `issuance.schedule` | Issuance & Halving Schedule | supply | bar_series | existing | phase_6_supply |
| `addresses.activity` | Active & New Addresses | addresses | line_dual_axis | existing | phase_7_addresses |
| `addresses.btc_cohorts` | Address Cohorts by BTC Balance | addresses | multi_series | existing | phase_7_addresses |
| `addresses.usd_cohorts` | Address Cohorts by USD Balance | addresses | multi_series | existing | phase_7_addresses |
| `addresses.profit` | Addresses in Profit | addresses | line_oscillator | existing | phase_7_addresses |
| `addresses.outputs` | Outputs & Output Value | addresses | multi_series | existing | phase_7_addresses |
| `fees.revenue` | Fee Revenue | fees | bar_series | existing | phase_8_fees |
| `fees.per_tx` | Fee per Transaction / Fee Rate | fees | multi_series | existing | phase_8_fees |
| `fees.buckets` | Fee Rate Buckets | fees | stacked_area | existing | phase_8_fees |
| `fees.tx_count` | Transaction Count | fees | bar_series | existing | phase_8_fees |
| `fees.tx_size` | Transaction Size & Weight | fees | multi_series | existing | phase_8_fees |
| `fees.value_bands` | Transaction Value Bands | fees | stacked_area | existing | phase_8_fees |
| `fees.vin_vout` | Inputs & Outputs per Tx | fees | multi_series | existing | phase_8_fees |
| `fees.segwit` | SegWit Share | fees | line_oscillator | existing | phase_8_fees |
| `flow.transfer_volume` | Transfer Volume & Velocity | flow | line_dual_axis | existing | phase_9_flow |
| `flow.nvt` | NVT Ratio | flow | bands_overlay | existing | phase_9_flow |
| `flow.velocity` | Monetary Velocity | flow | line_oscillator | existing | phase_9_flow |
| `flow.cdd` | Coin Days Destroyed | flow | bar_series | existing | phase_9_flow |
| `flow.vddm` | Value Days Destroyed Multiple | flow | line_oscillator | existing | phase_9_flow |
| `flow.value_bands` | Value Bands in BTC | flow | stacked_area | existing | phase_9_flow |
| `flow.etf` | ETF Flows | flow | bar_series | existing | phase_9_flow |
| `flow.legacy` | Legacy Transfer Volume | flow | line_oscillator | existing | phase_9_flow |
| `mining.hashrate` | Hashrate & Difficulty | mining | line_dual_axis | existing | phase_10_mining |
| `mining.hashribbon` | Hash Ribbons | mining | bands_overlay | existing | phase_10_mining |
| `mining.hashprice` | Hashprice | mining | line_oscillator | existing | phase_10_mining |
| `mining.revenue` | Miner Revenue | mining | line_dual_axis | existing | phase_10_mining |
| `network.blocks` | Blocks & Block Interval | network | bar_series | existing | phase_11_network |
| `network.blocksize` | Block Size & Weight | network | line_dual_axis | existing | phase_11_network |
| `network.tx_per_block` | Transactions per Block | network | multi_series | existing | phase_11_network |
| `network.lightning` | Lightning Network | network | line_dual_axis | existing | phase_11_network |
| `script.counts` | Script Type Counts | script | stacked_area | existing | phase_12_script |
| `script.shares` | Script Type Shares | script | stacked_area | existing | phase_12_script |
| `macro.dashboard` | Macro Dashboard | macro | dashboard_grid | existing | phase_13_macro |
| `macro.relative` | BTC Dominance / ETH-BTC / Total Cap | macro | line_dual_axis | existing | phase_13_macro |
| `macro.correlations` | Cross-Asset Correlations | macro | scatter | new | phase_16_data_dependent |
| `derivatives.funding` | Funding Rates | derivatives | bar_series | existing | phase_14_derivatives |
| `derivatives.open_interest` | Open Interest | derivatives | line_dual_axis | existing | phase_14_derivatives |
| `derivatives.options` | Options OI / IV / Skew | derivatives | multi_series | new | phase_16_data_dependent |
| `derivatives.liquidations` | Liquidations | derivatives | bar_series | new | phase_16_data_dependent |
| `derivatives.term_structure` | Futures Term Structure | derivatives | multi_series | new | phase_16_data_dependent |
| `sentiment.fear_greed` | Fear & Greed | sentiment | gauge_composite | existing | phase_15_sentiment |
| `urpd.distribution` | URPD: Supply by Cost Basis | valuation | bar_series | new | phase_16_data_dependent |
| `urpd.heatmap` | URPD Heatmap | valuation | heatmap | new | phase_16_data_dependent |
| `urpd.diffs` | URPD Differences | valuation | bar_series | new | phase_16_data_dependent |
| `cointime.liveliness` | Liveliness & Vaultedness | cycle | line_oscillator | new | phase_16_data_dependent |
| `cointime.supply_regions` | Active vs Vaulted Supply | cycle | stacked_area | new | phase_16_data_dependent |
| `technical.bollinger` | Bollinger Bands | price | bands_overlay | new | phase_16_data_dependent |
| `technical.macd` | MACD | price | multi_pane | new | phase_16_data_dependent |
| `technical.stochastic` | Stochastic Oscillator | price | line_oscillator | new | phase_16_data_dependent |
| `technical.seasonality` | Seasonality | price | table | new | phase_16_data_dependent |
| `technical.monthly_returns` | Monthly Returns Heatmap | price | heatmap | new | phase_16_data_dependent |
| `technical.drawdown_table` | Drawdown Table | price | table | new | phase_16_data_dependent |
| `etf.balances` | ETF Balances & AUM | flow | line_dual_axis | new | phase_16_data_dependent |
| `treasury.companies` | Treasury Companies | macro | table | new | phase_16_data_dependent |
| `strategies.dca` | DCA Lab | price | dashboard_grid | existing | phase_2_price |
| `strategies.exit` | Exit Strategy Simulator | price | dashboard_grid | new | phase_16_data_dependent |
| `strategies.portfolio` | Risk Portfolio Tester | price | dashboard_grid | new | phase_16_data_dependent |
| `compare.overlay` | Compare Overlay | price | multi_series | new | phase_16_data_dependent |
| `workbench.custom` | Indicator Workbench | price | multi_series | new | phase_16_data_dependent |
| `alerts.manager` | Chart Alerts | price | dashboard_grid | new | phase_16_data_dependent |
| `entity.exchange_balances` | Exchange Balances & Netflow | flow | line_dual_axis | new | phase_17_parity_extension |
| `flow.lifespan_signals` | Lifespan Signals | flow | multi_series | new | phase_17_parity_extension |
| `valuation.monetary_premium` | Monetary Premium | valuation | line_oscillator | new | phase_17_parity_extension |
| `mining.models` | Mining Models | mining | multi_series | new | phase_17_parity_extension |
| `flow.capital_rotation` | Capital Rotation | flow | multi_series | new | phase_17_parity_extension |
| `cycle.rainbow` | Rainbow Chart | cycle | bands_overlay | new | phase_17_parity_extension |
| `technical.price_ranges` | Price High/Low Range | price | multi_series | new | phase_17_parity_extension |
| `technical.risk_adjusted` | Risk-Adjusted Returns | price | multi_series | new | phase_17_parity_extension |
| `technical.inflation_adjusted` | Inflation-Adjusted Price | price | line_dual_axis | new | phase_17_parity_extension |
| `etf.market` | ETF Market Dashboard | flow | dashboard_grid | new | phase_17_parity_extension |
| `supply.net_position_change` | Supply Net Position Change | supply | bar_series | new | phase_17_parity_extension |

## 20. Appendix D — change control

- Adding a chart: add catalog entry, run validator, add spec, add visual test, update ledger.
- Changing an archetype: update section 5, catalog defaults, renderer tests; notify all chart owners.
- Adding a metric: add registry entry, assign to a chart, run validator.
- Removing a chart: mark `deprecated`, keep URL redirect, update ledger.
- Changing parity scope: update ledger and recalculate the 90/91 score; requires sign-off.
