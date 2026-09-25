import { useEffect, useRef } from "react";
import { QFChart, LineTool, RayTool, HorizontalLineTool, FibonacciTool, MeasureTool } from "@qfo/qfchart";
import { sma } from "../lib/indicators";
import { registerChartTools } from "../lib/chartTools";
import { registerAllQfDrawings } from "../lib/qfdraw/registry";
export interface OhlcBar {
  /** Bar time in unix seconds (QFChart contract; Dashboard converts backend ms via toSecBars). */
  time: number; open: number; high: number; low: number; close: number; volume: number;
}
export default function PriceChart({ bars, chartKey, onReady }: { bars: OhlcBar[]; chartKey: string; onReady?: (chart: QFChart) => void }) {
  const divRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<QFChart | null>(null);
  useEffect(() => {
    if (!divRef.current) return;
    const chart = new QFChart(divRef.current, {
      // No internal title/watermark: the card header owns the title, so the
      // canvas starts at the chart. Zoom slider sits at the bottom.
      title: "",
      watermark: false,
      backgroundColor: "transparent",
      // Tight sides (library defaults to 10% each).
      layout: { left: "2%", right: "7%" },
      // No slider: wheel/pinch (inside) zoom stays active, so the x-axis
      // labels have the bottom to themselves.
      dataZoom: { visible: false },
    });
    const lineTool = new LineTool();
    const rayTool = new RayTool();
    const horizontalTool = new HorizontalLineTool();
    const fibTool = new FibonacciTool();
    const measureTool = new MeasureTool();
    chart.registerPlugin(lineTool);
    chart.registerPlugin(rayTool);
    chart.registerPlugin(horizontalTool);
    chart.registerPlugin(fibTool);
    chart.registerPlugin(measureTool);
    // QFChart built-ins stay registered directly; the 52 ported QFDraw
    // renderers/tools (incl. rectangle/text) register via the registry and
    // join the panel-name map spread below.
    const qf = registerAllQfDrawings(chart);
    registerChartTools(chart, {
      trend: lineTool,
      horizontal: horizontalTool,
      ray: rayTool,
      fibonacci: fibTool,
      measure: measureTool,
      ...qf,
    });
    chart.setMarketData(bars);
    const closes = bars.map((b) => b.close);
    const times = bars.map((b) => b.time);
    const s20 = sma(closes, 20);
    chart.addIndicator("SMA_20", { sma: { data: times.map((t, i) => ({ time: t, value: s20[i] ?? NaN })), options: { style: "line", color: "#2962FF" } } }, { isOverlay: true });
    chartRef.current = chart;
    onReady?.(chart);
    return () => { chart.destroy?.(); chartRef.current = null; };
    // Rebuild when bars change (not chartKey alone): range switches keep the
    // same key but must recompute the SMA_20 indicator, which updateData
    // alone cannot do.
  }, [chartKey, bars, onReady]);
  useEffect(() => { chartRef.current?.updateData?.(bars); }, [bars]);
  return <div ref={divRef} data-testid="price-chart" style={{ height: "100%", width: "100%" }} />;
}
