# Professional Drawing Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, per user directive to start immediately). Steps use checkbox (`- [x]`) syntax.

**Goal:** Make the chart drawing kit look and behave like TradingView/CMC: consistent colors and widths, complete line family (trend, horizontal/vertical line, rays, extended line), persistent anchor dots with draggable handles, and a selected-drawing style toolbar for color, width, dash, duplicate and delete.

**Architecture:** Keep the two existing sources (QFChart built-ins and the ported lightweight-charts-drawing renderers) but replace the built-in line tools with first-party QFDraw line renderers/tools. A shared `drawingStyle` module supplies defaults, palette, dash mapping and legacy-style normalization; all renderers read color/width/dash from the drawing's `style`. QFChart selection events drive a React floating toolbar in `ChartCard`.

**Tech Stack:** React 19, TypeScript, ECharts 5 custom series, `@qfo/qfchart` 0.8.7, Vitest, Testing Library.

**Spec:** User objective (2026-11-24) + upstream TradingView defaults from `deepentropy/lightweight-charts-drawing` (`src/core/specs.ts`, `src/core/scene/lines.ts`) and QFChart 0.8.8 (checked: no drawing-style API changes).

## Global Constraints

- Do not remove or rename existing saved drawing types: `line`, `arrow`, `horizontal-line`, `ray` keep their type strings.
- Every new drawing gets `{ color, lineWidth, lineStyle }`; default is `#2962FF`, width `2`, solid.
- Drawn geometry stays in data coordinates (`{timeIndex,value}`); only rendering/selection popups use pixels.
- Existing user changes in the worktree are not touched or committed.
- No new npm dependencies.

## Review Focus

- A saved drawing created by the old built-ins (`#d1d4dc`, width 1) must render with the new defaults after restore.
- A one-point line (horizontal/vertical) must still be selectable, draggable and deletable after the renderer swap.
- Style changes must persist through `chart:updated` and the existing localStorage snapshot.
- A style popup must close when its drawing is deleted/deselected and must not block chart panning elsewhere.
- Resizing/fullscreen must not leave the popup at stale pixel coordinates.

---

### Task 1: Shared drawing style module

**Files:**
- Create: `frontend/src/lib/qfdraw/style.ts`
- Create: `frontend/src/lib/qfdraw/style.test.ts`

**Interfaces:**
- `type DrawingLineStyle = "solid" | "dashed" | "dotted"`
- `interface QfDrawingStyle { color?: string; lineWidth?: number; lineStyle?: DrawingLineStyle; text?: string; [key: string]: unknown }`
- `DRAWING_COLORS: string[]`, `DRAWING_WIDTHS: number[]`
- `defaultDrawingStyle(): Required<Pick<QfDrawingStyle,"color"|"lineWidth"|"lineStyle">>`
- `saveDefaultDrawingStyle(style: Partial<QfDrawingStyle>): void`
- `dashForStyle(style?: QfDrawingStyle): number[] | undefined`
- `normalizeDrawingStyle(type: string, style?: QfDrawingStyle): QfDrawingStyle`
- `LINE_FAMILY: Set<string>`

- [x] **Step 1: Write failing tests** for defaults, dash mapping, legacy `line` normalization (`#d1d4dc`/width 1 → `#2962FF`/2), non-line style preservation.
- [x] **Step 2: Run** `npm test -- --run src/lib/qfdraw/style.test.ts`; expect module-not-found failure.
- [x] **Step 3: Implement `style.ts`.**
- [x] **Step 4: Run the test**; expect PASS.

### Task 2: Line family renderers + tools

**Files:**
- Create: `frontend/src/lib/qfdraw/tools/lines/lineFamily.ts`
- Create: `frontend/src/lib/qfdraw/tools/lines/lineFamily.test.ts`
- Modify: `frontend/src/lib/qfdraw/tools/lines/arrow.ts`
- Modify: `frontend/src/lib/qfdraw/base.ts`

**Interfaces:**
- Renderer/tool pairs exported: `LineRenderer/LineTool` (`type="line"`), `HorizontalLineRenderer/HorizontalLineTool` (`"horizontal-line"`), `VerticalLineRenderer/VerticalLineTool` (`"vertical-line"`), `RayRenderer/RayTool` (`"ray"`), `HorizontalRayRenderer/HorizontalRayTool` (`"horizontal-ray"`), `VerticalRayRenderer/VerticalRayTool` (`"vertical-ray"`), `ExtendedLineRenderer/ExtendedLineTool` (`"extended-line"`).
- `lineEl` gains optional `lineWidth`, `dash`, `name`.
- `anchorDot(p,color,r?)`, `hitLine(a,b)`, `ctxColor(ctx,fallback?)`, `ctxWidth(ctx,fallback?)`, `ctxDash(ctx)`.

- [x] **Step 1: Write failing tests** proving: trend line uses drawing color/width/dash; endpoints get anchor dots; horizontal line spans `coordSys` and renders a price pill; ray extends to the pane edge; extended line extends both directions; one-point tools create with 1 click; all tools use drawing style on commit.
- [x] **Step 2: Run** the new test; expect failures.
- [x] **Step 3: Implement the renderers/tools and base helpers.**
- [x] **Step 4: Run the test; expect PASS.**

### Task 3: Selection handles, registry, panel and chart registration

**Files:**
- Modify: `frontend/src/lib/qfdraw/select.ts`
- Modify: `frontend/src/lib/qfdraw/registry.ts`
- Modify: `frontend/src/components/DrawingPanel.tsx`
- Modify: `frontend/src/components/PriceChart.tsx`
- Modify: `frontend/src/components/OnchainChart.tsx`
- Test: `frontend/src/lib/qfdraw/select.test.ts`, `registry.test.ts`, `audit-all.test.ts`, `creation.test.ts`, `DrawingPanel.test.tsx`, `PriceChart.test.tsx`, `OnchainChart.test.tsx`

- [x] **Step 1: Write failing tests** for 7 new registry types, line-family panel groups, selected handles r=5, and component registration using QFDraw `line` instead of the QFChart `LineTool`.
- [x] **Step 2: Run tests; expect failures.**
- [x] **Step 3: Wire registry/panel/components; remove built-in `LineTool/RayTool/HorizontalLineTool` registration (keep `FibonacciTool`, `MeasureTool`).**
- [x] **Step 4: Run affected tests; expect PASS.**

### Task 4: Selected-drawing style toolbar

**Files:**
- Create: `frontend/src/components/DrawingStyleToolbar.tsx`
- Create: `frontend/src/components/DrawingStyleToolbar.test.tsx`
- Modify: `frontend/src/lib/chartTools.ts`
- Modify: `frontend/src/lib/chartTools.test.ts`
- Modify: `frontend/src/routes/Dashboard.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- `updateDrawingStyle(chart, id, patch): DrawingElement | null`
- `duplicateChartDrawing(chart, id): string | null`
- `<DrawingStyleToolbar chart={QFChart|null} containerRef onChange />`

- [x] **Step 1: Write failing tests** for style patch/duplicate and popup behavior (select event shows palette/width/dash; color click calls `updateDrawing`; delete calls `removeDrawing`; deselect hides).
- [x] **Step 2: Run; expect failures.**
- [x] **Step 3: Implement chart helpers + React toolbar + CSS; mount inside `.chart-fill`; persist on change.**
- [x] **Step 4: Run; expect PASS.**

### Task 5: Adopt shared style in every existing renderer

**Files:**
- Modify: `frontend/src/lib/qfdraw/base.ts`, `tools/channels/channels.ts`, `tools/pitchforks/pitchforks.ts`, `tools/fibonacci/extras.ts`, `tools/gann/gann.ts`, `tools/forecast/forecast.ts`, `tools/shapes/shapes.ts`, `tools/annotations/annotations.ts`
- Test: `frontend/src/lib/qfdraw/tools/*/*.test.ts`, `audit-all.test.ts`

- [x] **Step 1: Write failing tests** asserting channel/pitchfork/fib/gann/forecast/shape/annotation renderers honor `drawing.style.color` and `lineWidth`, and fib time/price-range tools use `coordSys` rather than fixed 220/300 px.
- [x] **Step 2: Run; expect failures.**
- [x] **Step 3: Refactor renderers to `ctxColor/ctxWidth/ctxDash` and coordSys-bound geometry.**
- [x] **Step 4: Run all QFDraw tests; expect PASS.**

### Task 6: Restore migration, full verification, upstream note

**Files:**
- Modify: `frontend/src/lib/chartTools.ts` (normalize on restore)
- Create: `frontend/src/lib/qfdraw/README.md` (sources, upstream check, conventions)
- Test: `frontend/src/lib/qfdraw/registry.test.ts` (or chartTools test)

- [x] **Step 1: Write failing test** that restoring a legacy `line` with `#d1d4dc`/1 gets new defaults, while a user color survives.
- [x] **Step 2: Run; expect failure.**
- [x] **Step 3: Implement normalization on restore; write upstream note.**
- [x] **Step 4: Run `npm test -- --run` and `npm run build`; expect full suite + build PASS. Record output.**

### Task 7: Y-axis zoom + X-axis zoom parity (user follow-up)

**Files:**
- Create: `frontend/src/lib/axisZoom.ts`, `frontend/src/lib/axisZoom.test.ts`
- Modify: `frontend/src/components/PriceChart.tsx`, `OnchainChart.tsx`, `frontend/src/lib/chartTheme.ts`, `chartTheme.test.ts`

**Interfaces:**
- `zoomRange(range, factor, anchor): ZoomRange`
- `attachAxisZoom(chart: QFChart): () => void`

- [x] **Step 1: Write failing tests** for wheel-over-price-scale Y zoom, Shift+wheel, price-scale drag, double-click reset, reapply after QFChart rebuild, detach, and X dataZoom options.
- [x] **Step 2: Run tests; expect failures.**
- [x] **Step 3: Implement the controller and wire it into both chart components.**
- [x] **Step 4: Run unit tests + real-browser wheel/drag verification; expect all checks true.**

### Task 8: First-party Fibonacci retracement (closes style-toolbar gap)

**Files:**
- Modify: `frontend/src/lib/qfdraw/tools/fibonacci/extras.ts`, `extras.test.ts`
- Modify: `frontend/src/lib/qfdraw/registry.ts`, `registry.test.ts`
- Modify: `frontend/src/components/DrawingPanel.tsx`, `PriceChart.tsx`, `OnchainChart.tsx`, chart tests

- [x] **Step 1: Write failing tests** proving the `fibonacci` type has a renderer/tool and consumes colour/width/dash.
- [x] **Step 2: Run tests; expect failures.**
- [x] **Step 3: Implement `FibonacciRetracementRenderer/Tool` (type stays `fibonacci`), register it, swap the panel shortcut and drop the built-in tool registration.**
- [x] **Step 4: Run the full suite + production build; expect green.**
