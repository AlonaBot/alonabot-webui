import { useEffect, useRef, type JSX } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, type BarSeriesOption, type LineSeriesOption, type PieSeriesOption } from 'echarts/charts';
import { GridComponent, MarkPointComponent, TooltipComponent, type GridComponentOption, type MarkPointComponentOption, type TooltipComponentOption } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { cn } from '../../lib/cn';

echarts.use([LineChart, BarChart, PieChart, GridComponent, TooltipComponent, MarkPointComponent, CanvasRenderer]);

export type EChartOption = echarts.ComposeOption<
  LineSeriesOption | BarSeriesOption | PieSeriesOption | GridComponentOption | TooltipComponentOption | MarkPointComponentOption
>;

export interface EChartProps {
  readonly option: EChartOption;
  readonly height?: number;
  readonly className?: string;
  readonly ariaLabel?: string;
}

/** 读取当前根元素已解析的主题 CSS 变量，供 ECharts 亮暗切换实时取色。 */
export function readThemeColors(): {
  readonly ink: string;
  readonly muted: string;
  readonly line: string;
  readonly surface: string;
  readonly accent: string;
  readonly cyan: string;
  readonly indigo: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  readonly fontMono: string;
} {
  const style = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback;
  return {
    ink: pick('--color-ink', '#1F2A44'),
    muted: pick('--color-ink-muted', '#5A6B86'),
    line: pick('--color-line', '#DCE5F0'),
    surface: pick('--color-surface', '#FFFFFF'),
    accent: pick('--color-accent', '#18A7BE'),
    cyan: pick('--color-cyan', '#22B8CF'),
    indigo: pick('--color-indigo', '#3B5588'),
    success: pick('--color-success', '#129463'),
    warning: pick('--color-warning', '#C97A00'),
    danger: pick('--color-danger', '#DC3545'),
    fontMono: pick('--font-mono', 'monospace'),
  };
}

/**
 * EChart 封装按需导入的 ECharts Canvas 实例：自动响应容器尺寸变化，
 * 并在 `data-theme` 变化时重新渲染配色。
 */
export function EChart({ option, height = 220, className, ariaLabel }: EChartProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return undefined;
    }
    const chart = echarts.init(node, undefined, { renderer: 'canvas' });
    instanceRef.current = chart;

    const observer = new ResizeObserver(() => {
      chart.resize();
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
      chart.dispose();
      instanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    instanceRef.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  return (
    <div
      ref={containerRef}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      className={cn('w-full', className)}
      style={{ height }}
    />
  );
}
