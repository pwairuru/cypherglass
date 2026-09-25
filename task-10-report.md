
## Task 10 follow-up — OnchainChart QFDraw wiring (merge-blocker)

- Root cause: OnchainChart.tsx registered only 5 QFChart built-ins and claimed rectangle/text had no counterpart; DrawingPanel enables them globally so onchain cards silently dropped activateChartTool.
- Fix: mirror PriceChart.tsx — import registerAllQfDrawings, call after built-in registration, spread ...qf into registerChartTools map, updated stale comment. Preserved cde37dc declutter (title/watermark/layout/dataZoom/transparent).
- Test: extended OnchainChart.test.tsx qfchart mock with registerDrawingRenderer (PriceChart.test.tsx pattern) so real registry runs.
- Verify: vitest registry + OnchainChart + PriceChart + DrawingPanel → PASS (8) FAIL (0); tsc --noEmit → No errors.
