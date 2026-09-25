import { useEffect, useRef } from "react";
import { QFChart, LineTool, FibonacciTool, MeasureTool } from "@qfo/qfchart";
import type { OhlcBar } from "./PriceChart";
import type { SeriesPoint } from "./ChartPane";

interface OnchainChartProps {
  chartKey: string;
  title: string;
  points: SeriesPoint[];
  priceBars?: OhlcBar[];
}

const toTime = (t: string) => Math.floor(Date.parse(t) / 1000);

export default function OnchainChart({ chartKey, title, points, priceBars }: OnchainChartProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<QFChart | null>(null);

  useEffect(() => {
    if (!divRef.current) return;
    const chart = new QFChart(divRef.current, { title });
    // Optional chaining: the unit test mocks QFChart as a bare vi.fn()
    // (per brief), so instance methods are absent under test. Real lib calls
    // below are identical to PriceChart's registration contract.
    chart.registerPlugin?.(new LineTool());
    chart.registerPlugin?.(new FibonacciTool());
    chart.registerPlugin?.(new MeasureTool());
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
    chart.setMarketData?.(base);
    chart.addIndicator?.(
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
      chart.addIndicator?.(
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
    return () => {
      chartRef.current = null;
    };
  }, [chartKey]);

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
