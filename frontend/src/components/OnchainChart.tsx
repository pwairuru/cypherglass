import { useEffect, useRef } from "react";
import { QFChart, MeasureTool } from "@qfo/qfchart";
import type { ChartMode, OhlcBar } from "./PriceChart";
import { cypherGlassChartOptions, metricLineColor, priceLineColor } from "../lib/chartTheme";
import { registerChartTools } from "../lib/chartTools";
import { attachAxisZoom } from "../lib/axisZoom";
import { registerAllQfDrawings } from "../lib/qfdraw/registry";

export interface SeriesPoint {
  t: string;
  v: number;
}

interface OnchainChartProps {
  chartKey: string;
  title: string;
  points: SeriesPoint[];
  priceBars?: OhlcBar[];
  mode?: ChartMode;
  onReady?: (chart: QFChart) => void;
}

const toTime = (t: string) => Date.parse(t); // unix ms: QFChart labels use new Date(time)

export default function OnchainChart({ chartKey, title, points, priceBars, mode = "line", onReady }: OnchainChartProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<QFChart | null>(null);

  useEffect(() => {
    if (!divRef.current) return;
    // Candles mode reuses the price overlay's real OHLC as market data (the
    // metric itself is single-value: flat o=h=l=c "candles" would carry no
    // information). Without price bars, fall back to line mode.
    const candleMode = mode === "candles" && priceBars !== undefined && priceBars.length > 0;
    const chart = new QFChart(divRef.current, {
      title: "",
      watermark: false,
      ...cypherGlassChartOptions(!candleMode),
    });
    // Registration contract mirrors PriceChart (direct calls; tests mock
    // the full QFChart instance the same way).
    const measureTool = new MeasureTool();
    chart.registerPlugin(measureTool);
    const qf = registerAllQfDrawings(chart);
    registerChartTools(chart, {
      measure: measureTool,
      ...qf,
    });
    // QFChart requires market data via setMarketData to build its time axis,
    // even when only indicator series are shown. Line mode feeds synthetic
    // flat bars (o=h=l=c=v, volume 0) derived from the onchain points as a
    // hidden base; candles mode feeds the real price OHLC instead.
    const base = candleMode
      ? priceBars!
      : points.map((p) => ({
        time: toTime(p.t),
        open: p.v,
        high: p.v,
        low: p.v,
        close: p.v,
        volume: 0,
      }));
    chart.setMarketData(base);
    // Single-pane: the onchain line must overlay (pane 0), otherwise QFChart
    // splits into main-candle pane + indicator pane with duplicate Y axes
    // (top empty transparent candles, bottom line). Both metric + price
    // share pane 0; LayoutManager auto-assigns a hidden second Y for the
    // incompatible scale.
    chart.addIndicator(
      title,
      {
        line: {
          data: points.map((p) => ({ time: toTime(p.t), value: p.v })),
          options: { style: "line", color: metricLineColor(), linewidth: 2 },
        },
      },
      { isOverlay: true },
    );
    if (priceBars && !candleMode) {
      chart.addIndicator(
        "price",
        {
          price: {
            data: priceBars.map((b) => ({ time: b.time, value: b.close })),
            options: { style: "line", color: priceLineColor(), linewidth: 1.5 },
          },
        },
        { isOverlay: true },
      );
    }
    const detachZoom = attachAxisZoom(chart);
    chartRef.current = chart;
    onReady?.(chart);
    return () => {
      detachZoom();
      chart.destroy?.();
      chartRef.current = null;
    };
    // Rebuild on data-prop changes (not chartKey alone): overlay/series
    // switches must re-add indicators, which updateData alone cannot do.
  }, [chartKey, title, points, priceBars, mode, onReady]);

  useEffect(() => {
    if (mode === "candles" && priceBars !== undefined && priceBars.length > 0) {
      chartRef.current?.updateData?.(priceBars);
      return;
    }
    chartRef.current?.updateData?.(
      points.map((p) => ({
        time: toTime(p.t),
        open: p.v,
        high: p.v,
        low: p.v,
        close: p.v,
        volume: 0,
      })),
    );
  }, [points, priceBars, mode]);

  return <div ref={divRef} data-testid="onchain-chart" role="img" aria-label={`Onchain chart, ${points.length} points`} style={{ height: "100%", width: "100%" }} />;
}
