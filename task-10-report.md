
## Task 10 follow-up — OnchainChart QFDraw wiring (merge-blocker)

- Root cause: OnchainChart.tsx registered only 5 QFChart built-ins and claimed rectangle/text had no counterpart; DrawingPanel enables them globally so onchain cards silently dropped activateChartTool.
- Fix: mirror PriceChart.tsx — import registerAllQfDrawings, call after built-in registration, spread ...qf into registerChartTools map, updated stale comment. Preserved cde37dc declutter (title/watermark/layout/dataZoom/transparent).
- Test: extended OnchainChart.test.tsx qfchart mock with registerDrawingRenderer (PriceChart.test.tsx pattern) so real registry runs.
- Verify: vitest registry + OnchainChart + PriceChart + DrawingPanel → PASS (8) FAIL (0); tsc --noEmit → No errors.

## Re-applied on feat/qfdraw-port (worktree)

- Note: repo HEAD had moved to main (declutter cherry-pick); fix re-applied on feat/qfdraw-port worktree.
- OnchainChart.tsx now mirrors PriceChart.tsx: registerAllQfDrawings import + call + ...qf spread; stale rect/text comment replaced.
- Verify (branch): vitest registry + OnchainChart + PriceChart + DrawingPanel → PASS (8) FAIL (0).
- tsc --noEmit on branch: 9 pre-existing errors, all in src/routes/Dashboard.tsx (TS7006 implicit any, 1x TS2307); zero in OnchainChart/PriceChart/qfdraw/chartTools.
