import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { EChartsOption, EChartsType } from "echarts";

export interface EChartHandle {
  getDataURL: () => string;
}

export default function EChart({
  option,
  height = 420,
  ariaLabel,
  onReady,
}: {
  option: EChartsOption;
  height?: number | string;
  ariaLabel: string;
  onReady?: (handle: EChartHandle | null) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const chart = echarts.init(el, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    chart.setOption(option);
    onReady?.({
      getDataURL: () =>
        chart.getDataURL({
          type: "png",
          pixelRatio: 2,
          backgroundColor: "transparent",
        }),
    });

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
      onReady?.(null);
    };
    // Mount once; option updates go through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  return (
    <div
      ref={elRef}
      role="img"
      aria-label={ariaLabel}
      data-testid="chart-canvas"
      style={{ width: "100%", height }}
    />
  );
}
