# QFDraw drawing kit

The CypherGlass drawing kit is a first-party renderer set for `@qfo/qfchart`'s
custom-series drawing API. It started as a port of two libraries and now keeps
its own line family so visuals do not depend on an upstream package's defaults.

## Sources

- **QFChart `@qfo/qfchart`** — chart, plugin lifecycle, drawing storage,
  selection events and the drag editor. Upstream checked at `0.8.8`: the only
  changes since `0.8.7` are in the box/line/fill/polyline indicator renderers;
  there is no new drawing-style API to adopt.
- **deepentropy/lightweight-charts-drawing (MIT)** — geometry and TradingView
  factory defaults. Fibonacci retracement is now first-party too, so the style
  toolbar's colour/width/dash controls apply to it. Upstream `main` was re-checked on 2026-11-24. Adopted here:
  - trend line is blue (`#2962FF`), width 2, solid, with endpoint anchors;
  - horizontal/vertical lines span the pane and show a price pill;
  - rays extend to one pane edge, extended lines both ways;
  - line text/dash/width come from the drawing style, not constants;
  - selected anchors are 5px white discs with a 2px coloured stroke;
  - hit-testing uses a wider transparent stroke than the visible line.

Newer upstream tools (patterns, cycles, volume profile, VWAP, …) are **not**
ported: the product objective is to make the existing tools professional, not
to grow the catalog.

## Style model

`frontend/src/lib/qfdraw/style.ts` is the single source of truth:

- `DRAWING_COLORS` — ten TradingView-style colours.
- `DRAWING_WIDTHS` — 1–4 px.
- `LINE_FAMILY` — types that migrate the old QFChart `#d1d4dc`/1px default to
  the current blue 2px default; explicit user widths (including 1px) survive.
- `defaultDrawingStyle()` — user-saved default, else `#2962FF / 2 / solid`.
- `dashForStyle()` — `solid` → no dash, `dashed` → `[6,4]`, `dotted` → `[2,3]`.

New drawings are committed by `QfTool.finish` with the current default style.
Semantic tools set `defaultColor` (long position green, short position red,
highlighter yellow) while still allowing per-drawing overrides.
`DrawingStyleToolbar` edits the selected drawing's style through
`updateDrawingStyle` and can save that style as the default for line tools.

## Adding a renderer

1. Return an ECharts `group` with at least one body element named `line`.
2. Use `ctxColor`, `ctxWidth`, `ctxDash` instead of literal colours/widths.
3. Put anchor dots on the real anchor points (`anchorDot`), so the QFChart drag
   editor's `point-N` handles line up with them.
4. Add the type to `TOOL_TYPES`, `ANCHORS` and `registerAllQfDrawings` in
   `registry.ts`; add it to a `DrawingPanel` group.
5. Run `npm test -- --run src/lib/qfdraw` and the audit test.
