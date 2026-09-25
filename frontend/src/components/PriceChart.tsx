import { useEffect, useRef } from "react";
import { QFChart, LineTool, FibonacciTool, MeasureTool } from "@qfo/qfchart";
import { sma } from "../lib/indicators";
import { registerChartTools } from "../lib/chartTools";
export interface OhlcBar { time: number; open: number; high: number; low: number; close: number; volume: number; }
export default function PriceChart({ bars, chartKey, onReady }: { bars: OhlcBar[]; chartKey: string; onReady?: (chart: QFChart) => void }) {
  const divRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<QFChart | null>(null);
  useEffect(() => {
    if (!divRef.current) return;
    const chart = new QFChart(divRef.current, { title: "BTC/USDT" });
    const lineTool = new LineTool();
    const fibTool = new FibonacciTool();
    const measureTool = new MeasureTool();
    chart.registerPlugin(lineTool);
    chart.registerPlugin(fibTool);
    chart.registerPlugin(measureTool);
    // DrawingPanel emits 7 tool names but only 3 drawing plugins exist here
    // (QFChart ships no rectangle/text plugins); map the line-like tools
    // onto LineTool. Dashboard activates these via activateChartTool.
    registerChartTools(chart, {
      trend: lineTool,
      horizontal: lineTool,
      ray: lineTool,
      rectangle: lineTool,
      text: lineTool,
      fibonacci: fibTool,
      measure: measureTool,
    });
    chart.setMarketData(bars);
    const closes = bars.map((b) => b.close);
    const times = bars.map((b) => b.time);
    chart.addIndicator("SMA_20", { sma: { data: times.map((t, i) => ({ time: t, value: sma(closes, 20)[i] ?? NaN })), options: { style: "line", color: "#2962FF" } } }, { isOverlay: true });
    chartRef.current = chart;
    onReady?.(chart);
    return () => { chart.destroy?.(); chartRef.current = null; };
  }, [chartKey]);
  useEffect(() => { chartRef.current?.updateData?.(bars); }, [bars]);
  return <div ref={divRef} data-testid="price-chart" style={{ height: "100%", width: "100%" }} />;
}
