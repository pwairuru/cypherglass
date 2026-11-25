import { useEffect, useRef } from "react";
import { QFChart, MeasureTool } from "@qfo/qfchart";
import { sma } from "../lib/indicators";
import { cypherGlassChartOptions, metricLineColor, priceLineColor, smaLineColor } from "../lib/chartTheme";
import { registerChartTools } from "../lib/chartTools";
import { attachAxisZoom } from "../lib/axisZoom";
import { registerAllQfDrawings } from "../lib/qfdraw/registry";
export interface OhlcBar {
  /** Bar time in unix milliseconds (QFChart x labels use new Date(time); Dashboard passes backend ms via toMsBars). */
  time: number; open: number; high: number; low: number; close: number; volume: number;
}
/** Chart presentation: real OHLC candles vs close-price line (candles hidden). */
export type ChartMode = "line" | "candles";
export default function PriceChart({ bars, chartKey, mode = "candles", onReady }: { bars: OhlcBar[]; chartKey: string; mode?: ChartMode; onReady?: (chart: QFChart) => void }) {
  const divRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<QFChart | null>(null);
  useEffect(() => {
    if (!divRef.current) return;
    const lineMode = mode === "line";
    const chart = new QFChart(divRef.current, {
      // No internal title/watermark: the card header owns the title, so the
      // canvas starts at the chart. Zoom slider sits at the bottom.
      title: "",
      watermark: false,
      ...cypherGlassChartOptions(lineMode),
    });
    const measureTool = new MeasureTool();
    chart.registerPlugin(measureTool);
    // First-party QFDraw line family + Fibonacci retracement replace
    // QFChart's built-ins so colour, width, dash and anchor dots stay under
    // our control. Measure remains a transient built-in overlay.
    const qf = registerAllQfDrawings(chart);
    registerChartTools(chart, {
      measure: measureTool,
      ...qf,
    });
    chart.setMarketData(bars);
    const closes = bars.map((b) => b.close);
    const times = bars.map((b) => b.time);
    if (lineMode) {
      chart.addIndicator("price", { price: { data: times.map((t, i) => ({ time: t, value: closes[i] })), options: { style: "line", color: priceLineColor(), linewidth: 2 } } }, { isOverlay: true });
    }
    const s20 = sma(closes, 20);
    chart.addIndicator("SMA_20", { sma: { data: times.map((t, i) => ({ time: t, value: s20[i] ?? NaN })), options: { style: "line", color: smaLineColor(), linewidth: 1.5 } } }, { isOverlay: true });
    const detachZoom = attachAxisZoom(chart);
    chartRef.current = chart;
    onReady?.(chart);
    return () => {
      detachZoom();
      chart.destroy?.();
      chartRef.current = null;
    };
    // Rebuild when bars change (not chartKey alone): range switches keep the
    // same key but must recompute the SMA_20 indicator, which updateData
    // alone cannot do.
  }, [chartKey, bars, mode, onReady]);
  useEffect(() => { chartRef.current?.updateData?.(bars); }, [bars]);
  return <div ref={divRef} data-testid="price-chart" role="img" aria-label={`Price chart, ${bars.length} bars`} style={{ height: "100%", width: "100%" }} />;
}
