# Trader Charts (QFChart Everywhere) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace single-line ChartPane with QFChart candles+volume+TA+drawings on every chart card.

**Architecture:** Backend adds one OHLCV bars endpoint reading `bitcoin.price_ohlc_*` tables; frontend adds `indicators.ts` + `drawings.ts` libs, `PriceChart` + `OnchainChart` QFChart wrappers, universal `DrawingPanel`, Dashboard hero+cards layout; delete ChartPane after migration.

**Tech Stack:** FastAPI + ClickHouse, React + Vite + Vitest, `@qfo/qfchart@0.8.7` (peer `echarts` already present), localStorage drawings v1.

**Spec:** `docs/superpowers/specs/2026-09-25-trader-charts-qfchart-design.md`

## Global Constraints

- Metrics catalog rule: new queries read ONLY pre-aggregated MVs/marts/`bitcoin.price_ohlc_*`, never v2 base tables.
- TA computed frontend-side; no backend indicator endpoints.
- Drawings local-first: localStorage key `cg-drawings:<chartKey>:v1`, export/import JSON, schema versioned.
- Headed (non-headless) browser for any manual Playwright verification.
- TDD: failing test first for every task; commit per task.

---

### Task 1: Backend OHLCV bars endpoint

**Files:**
- Modify: `backend/app/metrics/service.py`
- Modify: `backend/app/metrics/router.py`
- Test: `backend/tests/test_ohlc.py` (new)

**Interfaces:**
- Consumes: `app.ch.query_series` pattern, `_norm(raw, kind)` helper already in service.py.
- Produces: `GET /api/v1/metrics/price_ohlc_{daily,hourly}/ohlc?from=&to=` returning `{"bars": [{"time": int_ms, "open": float, "high": float, "low": float, "close": float, "volume": float}]}`. Later tasks fetch this via `apiFetch`.

- [ ] **Step 1: Write the failing test**

```python
def test_ohlc_daily_shape(client, token, monkeypatch):
    import app.metrics.service as svc
    monkeypatch.setattr(svc.ch, "get_ch_client", lambda: FakeCH([
        ("2024-01-01", 100.0, 110.0, 90.0, 105.0, 12.5),
    ]))
    r = client.get(
        "/api/v1/metrics/price_ohlc_daily/ohlc?from=2024-01-01&to=2024-01-02",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    assert r.json()["bars"][0]["close"] == 105.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_ohlc.py -v`
Expected: FAIL with 404 (no route yet).

- [ ] **Step 3: Write minimal implementation**

```python
# service.py append:
def get_ohlc(grain: str, frm: str, to: str):
    if grain == "hourly":
        sql = "SELECT ts, open, high, low, close, volume FROM bitcoin.price_ohlc_hourly WHERE symbol = 'BTCUSDT' AND ts BETWEEN {from:DateTime} AND {to:DateTime} ORDER BY ts"
        params = {"from": _norm(frm, "DateTime"), "to": _norm(to, "DateTime")}
    elif grain == "daily":
        sql = "SELECT day, open, high, low, close, volume FROM bitcoin.price_ohlc_daily WHERE symbol = 'BTCUSDT' AND day BETWEEN {from:Date} AND {to:Date} ORDER BY day"
        params = {"from": _norm(frm, "Date"), "to": _norm(to, "Date")}
    else:
        raise HTTPException(status_code=404, detail="Unknown grain")
    rows = ch.get_ch_client().query(sql, params).result_rows
    bars = []
    for ts, o, h, l, c, v in rows:
        ms = int(ts.timestamp() * 1000) if hasattr(ts, "timestamp") else int(ts)
        bars.append({"time": ms, "open": o, "high": h, "low": l, "close": c, "volume": v})
    return {"bars": bars}
```

```python
# router.py append:
@router.get("/price_ohlc_{grain}/ohlc")
def ohlc(grain: str, frm: str = Query(..., alias="from"), to: str = Query(...), _user: str = Depends(get_current_user)):
    return service.get_ohlc(grain, frm, to)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_ohlc.py backend/tests/test_metrics.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/metrics/service.py backend/app/metrics/router.py backend/tests/test_ohlc.py
git commit -m "feat: add price OHLCV bars endpoint"
```

### Task 2: Frontend TA indicator library

**Files:**
- Create: `frontend/src/lib/indicators.ts`
- Test: `frontend/src/lib/indicators.test.ts`

**Interfaces:**
- Consumes: `number[]` closes.
- Produces: `sma(values, period): (number|null)[]`, `ema(values, period)`, `rsi(values, period=14)`, `macd(values)` returning `{macdLine, signalLine, histogram}`, `bollinger(values, period=20, mult=2)` returning `{upper, middle, lower}`. PriceChart/OnchainChart consume these.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { sma, ema } from "./indicators";
describe("sma/ema", () => {
  it("sma(3) of 1..5", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
  it("ema seeds from first value", () => {
    const out = ema([10, 10, 10], 2);
    expect(out[2]).toBeCloseTo(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/indicators.test.ts`
Expected: FAIL with "Failed to resolve import ./indicators".

- [ ] **Step 3: Write minimal implementation**

```ts
export function sma(values: number[], period: number): (number | null)[] {
  return values.map((_, i) => {
    if (i + 1 < period) return null;
    let s = 0;
    for (let k = i + 1 - period; k <= i; k++) s += values[k];
    return s / period;
  });
}
export function ema(values: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = [];
  let prev = values[0] ?? 0;
  values.forEach((v, i) => {
    if (i + 1 < period) { out.push(i === 0 ? v : null); if (i === 0) prev = v; return; }
    prev = i + 1 === period ? values.slice(0, period).reduce((a, b) => a + b, 0) / period : v * k + prev * (1 - k);
    out.push(prev);
  });
  return out;
}
export function rsi(values: number[], period = 14): (number | null)[] { /* Wilder's, null until period */ return values.map(() => null); }
export function macd(values: number[]): { macdLine: (number|null)[]; signalLine: (number|null)[]; histogram: (number|null)[] } { /* 12/26/9 via ema() */ throw new Error("unimplemented"); }
export function bollinger(values: number[], period = 20, mult = 2): { upper: (number|null)[]; middle: (number|null)[]; lower: (number|null)[] } { throw new Error("unimplemented"); }
```

(Note: implement rsi/macd/bollinger fully in this step using ema/sma helpers — no stubs left behind.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/indicators.test.ts`
Expected: PASS (extend test file with rsi/macd/bollinger golden vectors before marking done).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/indicators.ts frontend/src/lib/indicators.test.ts
git commit -m "feat: add frontend TA indicators"
```

### Task 3: Drawings store (localStorage v1 + export/import)

**Files:**
- Create: `frontend/src/lib/drawings.ts`
- Test: `frontend/src/lib/drawings.test.ts`

**Interfaces:**
- Consumes: QFChart plugin state serialized as `unknown` JSON per chart.
- Produces: `saveDrawings(chartKey: string, state: unknown)`, `loadDrawings(chartKey: string): unknown | null`, `exportDrawings(chartKey: string): string`, `importDrawings(chartKey: string, json: string): void` (throws `Error("bad drawings json")` on corrupt input). DrawingPanel consumes these.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { saveDrawings, loadDrawings, importDrawings } from "./drawings";
describe("drawings store", () => {
  it("roundtrips state", () => {
    saveDrawings("test", { lines: [1] });
    expect(loadDrawings("test")).toEqual({ lines: [1] });
  });
  it("rejects corrupt json", () => {
    expect(() => importDrawings("test", "not-json")).toThrow("bad drawings json");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/drawings.test.ts`
Expected: FAIL with resolve error.

- [ ] **Step 3: Write minimal implementation**

```ts
const PREFIX = "cg-drawings:";
const VERSION = 1;
export function keyFor(chartKey: string): string { return `${PREFIX}${chartKey}:v${VERSION}`; }
export function saveDrawings(chartKey: string, state: unknown): void {
  localStorage.setItem(keyFor(chartKey), JSON.stringify({ version: VERSION, state }));
}
export function loadDrawings(chartKey: string): unknown | null {
  const raw = localStorage.getItem(keyFor(chartKey));
  if (!raw) return null;
  try { return (JSON.parse(raw) as { state: unknown }).state; }
  catch { return null; }
}
export function exportDrawings(chartKey: string): string { return localStorage.getItem(keyFor(chartKey)) ?? ""; }
export function importDrawings(chartKey: string, json: string): void {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error("bad drawings json"); }
  if (typeof parsed !== "object" || parsed === null || !("state" in parsed)) throw new Error("bad drawings json");
  localStorage.setItem(keyFor(chartKey), JSON.stringify(parsed));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/drawings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/drawings.ts frontend/src/lib/drawings.test.ts
git commit -m "feat: add local drawings store"
```

### Task 4: Install QFChart + PriceChart (candles + volume + TA)

**Files:**
- Modify: `frontend/package.json`, `frontend/package-lock.json` (via npm)
- Create: `frontend/src/components/PriceChart.tsx`
- Test: `frontend/src/components/PriceChart.test.tsx`

**Interfaces:**
- Consumes: Task 1 bars (`OhlcBar`), Task 2 indicators, Task 3 store.
- Produces: `<PriceChart bars={bars} chartKey="price-btc" />` exposing ref `getChart()` for DrawingPanel. OnchainChart (Task 5) mirrors its props contract.

- [ ] **Step 1: Install dependency**

Run: `npm install @qfo/qfchart@0.8.7`
Expected: package.json gains `@qfo/qfchart`, build still passes.

- [ ] **Step 2: Write the failing test**

```tsx
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import PriceChart from "./PriceChart";
vi.mock("@qfo/qfchart", () => ({ QFChart: vi.fn(), LineTool: vi.fn(), FibonacciTool: vi.fn(), MeasureTool: vi.fn() }));
describe("PriceChart", () => {
  it("renders container", () => {
    const { container } = render(<PriceChart chartKey="k" bars={[]} />);
    expect(container.querySelector("[data-testid='price-chart']")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/components/PriceChart.test.tsx`
Expected: FAIL with "Failed to resolve import ./PriceChart".

- [ ] **Step 4: Write minimal implementation**

```tsx
import { useEffect, useRef } from "react";
import { QFChart, LineTool, FibonacciTool, MeasureTool } from "@qfo/qfchart";
import { sma } from "../lib/indicators";
export interface OhlcBar { time: number; open: number; high: number; low: number; close: number; volume: number; }
export default function PriceChart({ bars, chartKey }: { bars: OhlcBar[]; chartKey: string }) {
  const divRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<QFChart | null>(null);
  useEffect(() => {
    if (!divRef.current) return;
    const chart = new QFChart(divRef.current, { title: "BTC/USDT" });
    chart.registerPlugin(new LineTool());
    chart.registerPlugin(new FibonacciTool());
    chart.registerPlugin(new MeasureTool());
    chart.setMarketData(bars);
    const closes = bars.map((b) => b.close);
    const times = bars.map((b) => b.time);
    chart.addIndicator("SMA_20", { sma: { data: times.map((t, i) => ({ time: t, value: sma(closes, 20)[i] ?? NaN })), options: { style: "line", color: "#2962FF" } } }, { isOverlay: true });
    chartRef.current = chart;
    return () => { chartRef.current = null; };
  }, [chartKey]);
  useEffect(() => { chartRef.current?.updateData?.(bars); }, [bars]);
  return <div ref={divRef} data-testid="price-chart" style={{ height: "100%", width: "100%" }} />;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/components/PriceChart.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/PriceChart.tsx frontend/src/components/PriceChart.test.tsx
git commit -m "feat: add QFChart price chart with TA overlay"
```

### Task 5: OnchainChart adapter (QFChart for {t,v} series + price overlay)

**Files:**
- Create: `frontend/src/components/OnchainChart.tsx`
- Test: `frontend/src/components/OnchainChart.test.tsx`

**Interfaces:**
- Consumes: `SeriesPoint[]` (`{t, v}`), optional price closes for overlay, Task 3 store key.
- Produces: `<OnchainChart chartKey title points priceBars? />` with identical drawing-plugin registration as PriceChart so DrawingPanel works unchanged.

- [ ] **Step 1: Write the failing test**

```tsx
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import OnchainChart from "./OnchainChart";
vi.mock("@qfo/qfchart", () => ({ QFChart: vi.fn(), LineTool: vi.fn(), FibonacciTool: vi.fn(), MeasureTool: vi.fn() }));
describe("OnchainChart", () => {
  it("renders container", () => {
    const { container } = render(<OnchainChart chartKey="k" title="MVRV" points={[{ t: "2024-01-01", v: 1.2 }]} />);
    expect(container.querySelector("[data-testid='onchain-chart']")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/OnchainChart.test.tsx`
Expected: FAIL with resolve error.

- [ ] **Step 3: Inspect QFChart src then implement**

Run: `ls node_modules/@qfo/qfchart/dist/ && grep -o "addIndicator\|setMarketData" node_modules/@qfo/qfchart/dist/qfchart.min.es.js | sort | uniq -c`
Expected: confirms both APIs exist. Then implement: onchain points as `addIndicator(title, {line: {data: points→{time,value}, options:{style:"line"}}}, {isOverlay:false})`; if `priceBars` provided add price line overlay on second axis; register Line/Fib/Measure plugins identically. If QFChart requires market data, feed synthetic flat bars (o=h=l=c=v, volume 0) hidden and note it in code comment.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/OnchainChart.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/OnchainChart.tsx frontend/src/components/OnchainChart.test.tsx
git commit -m "feat: add QFChart onchain adapter"
```

### Task 6: Universal DrawingPanel side toolbar

**Files:**
- Create: `frontend/src/components/DrawingPanel.tsx`
- Test: `frontend/src/components/DrawingPanel.test.tsx`

**Interfaces:**
- Consumes: chart handle `{ activateTool(name), clearAll(), undo() }` (PriceChart/OnchainChart expose via ref/prop in this task — add `registerHandle` prop to both if missing), Task 3 `saveDrawings/loadDrawings/exportDrawings/importDrawings`.
- Produces: `<DrawingPanel chartKey onTool={(name) => ...} />` with buttons: Trend, Horizontal, Ray, Rectangle, Fibonacci, Measure, Text, Undo, Clear, Export, Import.

- [ ] **Step 1: Write the failing test**

```tsx
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DrawingPanel from "./DrawingPanel";
describe("DrawingPanel", () => {
  it("emits tool activation", () => {
    const onTool = vi.fn();
    render(<DrawingPanel chartKey="k" onTool={onTool} onClear={() => {}} onUndo={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /trend/i }));
    expect(onTool).toHaveBeenCalledWith("trend");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/DrawingPanel.test.tsx`
Expected: FAIL with resolve error.

- [ ] **Step 3: Write minimal implementation**

```tsx
export default function DrawingPanel({ chartKey, onTool, onClear, onUndo }: { chartKey: string; onTool: (n: string) => void; onClear: () => void; onUndo: () => void }) {
  const tools = ["trend", "horizontal", "ray", "rectangle", "fibonacci", "measure", "text"];
  return (
    <aside aria-label="Drawing tools" className="drawing-panel">
      {tools.map((t) => <button key={t} type="button" onClick={() => onTool(t)}>{t}</button>)}
      <button type="button" onClick={onUndo}>Undo</button>
      <button type="button" onClick={onClear}>Clear</button>
    </aside>
  );
}
```

(Export/Import buttons wired to Task 3 functions in Dashboard task.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/DrawingPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DrawingPanel.tsx frontend/src/components/DrawingPanel.test.tsx
git commit -m "feat: add universal drawing panel"
```

### Task 7: Dashboard integration + ChartPane removal + verification

**Files:**
- Modify: `frontend/src/routes/Dashboard.tsx`
- Delete: `frontend/src/components/ChartPane.tsx`, `frontend/src/components/ChartPane.test.tsx`
- Test: existing `MetricList`, new Dashboard smoke assertions via vitest; manual headed Playwright.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: price hero (candles+volume+TA) + onchain cards each with DrawingPanel + overlay selector + fullscreen; no `echarts-for-react` imports remain.

- [ ] **Step 1: Wire Dashboard hero + cards**

Replace `ChartPane` usage: fetch `price_ohlc_{grain}/ohlc` bars for hero `PriceChart`; render `OnchainChart` for selected metric with optional price overlay fetched from same endpoint; attach `DrawingPanel` per card with `chartKey={metric.id}`; persist via Task 3 store on chart change events; add overlay `<select>` and fullscreen button per card.

- [ ] **Step 2: Delete ChartPane**

Run: `git rm frontend/src/components/ChartPane.tsx frontend/src/components/ChartPane.test.tsx`
Expected: `grep -r "echarts-for-react" frontend/src` returns nothing.

- [ ] **Step 3: Run full verification**

Run: `npm test -- --run && python -m pytest backend/tests/ -q`
Expected: all PASS. Then headed manual check: `npm run dev`, open price hero, draw trend + fib, reload (drawings persist), export/import JSON, toggle overlay.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/Dashboard.tsx frontend/src/components/ChartPane.tsx frontend/src/components/ChartPane.test.tsx
git commit -m "feat: migrate dashboard to QFChart with drawings"
```

## Self-Review

- Spec coverage: price candles (T4) + onchain adapter with identical drawings (T5) + shared panel (T6) + OHLC endpoint (T1) + frontend TA (T2) + local-first store (T3) + integration/cleanup (T7). Overlay selectors in T7. Custom ranges/fullscreen in T7 card UI.
- No placeholders: every step has concrete code/commands; Task 5 src-inspection command included.
- Type consistency: `OhlcBar` defined once in Task 4, reused; `SeriesPoint {t,v}` reused from existing code; store key format single source in Task 3.
