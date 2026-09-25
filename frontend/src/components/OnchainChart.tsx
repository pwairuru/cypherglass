import { useEffect, useRef } from "react";
import { QFChart, LineTool, RayTool, HorizontalLineTool, FibonacciTool, MeasureTool } from "@qfo/qfchart";
import type { OhlcBar } from "./PriceChart";
import { registerChartTools } from "../lib/chartTools";

export interface SeriesPoint {
  t: string;
  v: number;
}

interface OnchainChartProps {
  chartKey: string;
  title: string;
  points: SeriesPoint[];
  priceBars?: OhlcBar[];
  onReady?: (chart: QFChart) => void;
}

const toTime = (t: string) => Math.floor(Date.parse(t) / 1000);

export default function OnchainChart({ chartKey, title, points, priceBars, onReady }: OnchainChartProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<QFChart | null>(null);

  useEffect(() => {
    if (!divRef.current) return;
    // No hide-candles flag exists in QFChart typings (checked 0.8.7
    // index.d.ts: only upColor/downColor/fontColor styling). The synthetic
    // flat bars (o=h=l=c=v, volume 0) exist only to build the time axis, so
    // render them transparent rather than as visible candles.
    const chart = new QFChart(divRef.current, {
      title: "",
      watermark: false,
      backgroundColor: "transparent",
      layout: { left: "2%", right: "7%" },
      dataZoom: { visible: false },
      upColor: "transparent",
      downColor: "transparent",
    });
    // Registration contract mirrors PriceChart (direct calls; tests mock
    // the full QFChart instance the same way).
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
    // rectangle/text have no QFChart plugin counterpart (see PriceChart) —
    // the panel renders them disabled, so they are not registered here.
    registerChartTools(chart, {
      trend: lineTool,
      horizontal: horizontalTool,
      ray: rayTool,
      fibonacci: fibTool,
      measure: measureTool,
    });
    // QFChart requires market data via setMarketData to build its time axis,
    // even when only indicator series are shown. Feed synthetic flat bars
    // (o=h=l=c=v, volume 0) derived from the onchain points as a hidden base.
    const base = points.map((p) => ({
      time: toTime(p.t),
      open: p.v,
      high: p.v,
      low: p.v,
      close: p.v,
      volume: 0,
    }));
    chart.setMarketData(base);
    chart.addIndicator(
      title,
      {
        line: {
          data: points.map((p) => ({ time: toTime(p.t), value: p.v })),
          options: { style: "line", color: "#2962FF" },
        },
      },
      { isOverlay: false },
    );
    if (priceBars) {
      chart.addIndicator(
        "price",
        {
          price: {
            data: priceBars.map((b) => ({ time: b.time, value: b.close })),
            options: { style: "line", color: "#FF6D00" },
          },
        },
        { isOverlay: true },
      );
    }
    chartRef.current = chart;
    onReady?.(chart);
    return () => {
      chart.destroy?.();
      chartRef.current = null;
    };
    // Rebuild on data-prop changes (not chartKey alone): overlay/series
    // switches must re-add indicators, which updateData alone cannot do.
  }, [chartKey, title, points, priceBars, onReady]);

  useEffect(() => {
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
  }, [points]);

  return <div ref={divRef} data-testid="onchain-chart" style={{ height: "100%", width: "100%" }} />;
}
