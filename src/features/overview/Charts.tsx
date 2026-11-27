import { useEffect, useMemo, useState, type JSX } from 'react';
import { EChart, readThemeColors, type EChartOption } from '../../components/charts/EChart';

export type Series = { label: string; values: readonly number[]; color: string };
export type Marker = { index: number; label: string };

/** 监听根节点 data-theme 变更并返回递增版本号，驱动 ECharts 实时同步亮/暗配色。 */
function useThemeVersion(): number {
  const [ver, setVer] = useState(0);
  useEffect(() => {
    const observer = new MutationObserver(() => setVer(v => v + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return ver;
}

function resolveCSSColor(color: string): string {
  const match = /^var\((--[^)]+)\)$/.exec(color.trim());
  if (match && match[1]) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim();
    if (value) return value;
  }
  return color;
}

/** 渐变面积趋势图：基于 ECharts 按需实例，支持错误时间点标记与十字准星交互。 */
export function AreaChart({
  labels,
  series,
  markers = [],
  height = 240,
}: {
  labels: readonly string[];
  series: readonly Series[];
  markers?: readonly Marker[];
  height?: number;
}): JSX.Element {
  const themeVersion = useThemeVersion();

  const option = useMemo<EChartOption>(() => {
    const palette = readThemeColors();
    const resolvedSeries = series.map((item, idx) => {
      const baseColor = resolveCSSColor(item.color);
      return {
        name: item.label,
        type: 'line' as const,
        smooth: 0.36,
        showSymbol: false,
        symbolSize: 7,
        data: [...item.values],
        lineStyle: { width: 2.4, color: baseColor },
        itemStyle: { color: baseColor },
        areaStyle: {
          color: {
            type: 'linear' as const,
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${baseColor}40` },
              { offset: 1, color: `${baseColor}00` },
            ],
          },
        },
        ...(idx === 0 && markers.length > 0
          ? {
              markPoint: {
                symbol: 'circle',
                symbolSize: 8,
                itemStyle: { color: palette.danger, borderColor: palette.surface, borderWidth: 2 },
                data: markers.slice(0, 12).map(marker => ({
                  coord: [marker.index, item.values[marker.index] ?? 0],
                  name: marker.label,
                })),
              },
            }
          : {}),
      };
    });

    return {
      animationDuration: 450,
      animationEasing: 'cubicOut',
      grid: { top: 14, right: 12, bottom: 26, left: 36, containLabel: false },
      tooltip: {
        trigger: 'axis',
        backgroundColor: palette.surface,
        borderColor: palette.line,
        borderWidth: 1,
        textStyle: { color: palette.ink, fontSize: 12 },
        axisPointer: { type: 'line', lineStyle: { color: palette.accent, width: 1, type: 'dashed' } },
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: [...labels],
        axisLine: { lineStyle: { color: palette.line } },
        axisTick: { show: false },
        axisLabel: { color: palette.muted, fontSize: 11, fontFamily: palette.fontMono },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: palette.line, type: 'dashed', opacity: 0.6 } },
        axisLabel: { color: palette.muted, fontSize: 11, fontFamily: palette.fontMono },
      },
      series: resolvedSeries,
    };
  }, [labels, series, markers, themeVersion]);

  return <EChart option={option} height={height} />;
}

/** 现代圆角环形图：中央展示总数，悬停显示分项数值与占比。 */
export function Donut({
  parts,
  total,
  totalLabel,
}: {
  parts: readonly { label: string; value: number; color: string }[];
  total: string;
  totalLabel: string;
}): JSX.Element {
  const themeVersion = useThemeVersion();

  const option = useMemo<EChartOption>(() => {
    const palette = readThemeColors();
    return {
      animationDuration: 500,
      tooltip: {
        trigger: 'item',
        backgroundColor: palette.surface,
        borderColor: palette.line,
        borderWidth: 1,
        textStyle: { color: palette.ink, fontSize: 12 },
      },
      series: [
        {
          type: 'pie',
          radius: ['64%', '86%'],
          center: ['50%', '50%'],
          padAngle: 3,
          itemStyle: { borderRadius: 6 },
          label: { show: false },
          emphasis: { scale: true, scaleSize: 4 },
          data: parts.map(part => ({
            name: part.label,
            value: part.value,
            itemStyle: { color: resolveCSSColor(part.color) },
          })),
        },
      ],
    };
  }, [parts, themeVersion]);

  return (
    <div className="relative h-[168px] w-[168px] shrink-0">
      <EChart option={option} height={168} />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="tabular-nums text-xl font-bold tracking-tight text-[var(--color-ink)]">{total}</span>
        <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">{totalLabel}</span>
      </div>
    </div>
  );
}

/** 错误与警告堆叠柱状图：圆角柱体 + 清晰交互提示。 */
export function StackedBars({
  labels,
  series,
  height = 185,
}: {
  labels: readonly string[];
  series: readonly Series[];
  height?: number;
}): JSX.Element {
  const themeVersion = useThemeVersion();

  const option = useMemo<EChartOption>(() => {
    const palette = readThemeColors();
    return {
      animationDuration: 420,
      grid: { top: 12, right: 8, bottom: 24, left: 30 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: palette.surface,
        borderColor: palette.line,
        borderWidth: 1,
        textStyle: { color: palette.ink, fontSize: 12 },
      },
      xAxis: {
        type: 'category',
        data: [...labels],
        axisLine: { lineStyle: { color: palette.line } },
        axisTick: { show: false },
        axisLabel: { color: palette.muted, fontSize: 10, fontFamily: palette.fontMono },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: palette.line, type: 'dashed', opacity: 0.55 } },
        axisLabel: { color: palette.muted, fontSize: 10, fontFamily: palette.fontMono },
      },
      series: series.map((item, idx) => ({
        name: item.label,
        type: 'bar' as const,
        stack: 'alerts',
        barMaxWidth: 16,
        data: [...item.values],
        itemStyle: {
          color: resolveCSSColor(item.color),
          borderRadius: idx === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0],
        },
      })),
    };
  }, [labels, series, themeVersion]);

  return <EChart option={option} height={height} />;
}

/** 格式化遥测数值，用于资源趋势图的坐标轴与悬浮提示。 */
function formatMetricValue(value: number, unit: 'mib' | 'percent'): string {
  if (unit === 'percent') {
    return `${value.toFixed(1)}%`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(2)} GB`;
  }
  return `${value.toFixed(1)} MB`;
}

/** 资源开销趋势图：支持多角色堆叠常驻内存（MiB）或总计/Core CPU% 曲线。 */
export function ResourceTrendChart({
  labels,
  series,
  unit,
  stacked = false,
  height = 230,
  ariaLabel,
}: {
  readonly labels: readonly string[];
  readonly series: readonly Series[];
  readonly unit: 'mib' | 'percent';
  readonly stacked?: boolean;
  readonly height?: number;
  readonly ariaLabel?: string;
}): JSX.Element {
  const themeVersion = useThemeVersion();

  const option = useMemo<EChartOption>(() => {
    const palette = readThemeColors();
    const showDots = labels.length <= 3;

    const resolvedSeries = series.map(item => {
      const baseColor = resolveCSSColor(item.color);
      return {
        name: item.label,
        type: 'line' as const,
        smooth: 0.32,
        stack: stacked ? 'telemetry-rss' : undefined,
        showSymbol: showDots,
        symbolSize: showDots ? 6 : 5,
        data: [...item.values],
        lineStyle: { width: stacked ? 1.8 : 2.2, color: baseColor },
        itemStyle: { color: baseColor },
        areaStyle: {
          color: {
            type: 'linear' as const,
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${baseColor}${stacked ? '55' : '38'}` },
              { offset: 1, color: `${baseColor}${stacked ? '12' : '00'}` },
            ],
          },
        },
      };
    });

    return {
      animationDuration: 360,
      animationEasing: 'cubicOut',
      grid: { top: 14, right: 14, bottom: 26, left: 54, containLabel: false },
      tooltip: {
        trigger: 'axis',
        backgroundColor: palette.surface,
        borderColor: palette.line,
        borderWidth: 1,
        textStyle: { color: palette.ink, fontSize: 12 },
        axisPointer: { type: 'line', lineStyle: { color: palette.accent, width: 1, type: 'dashed' } },
        valueFormatter: value => {
          const numeric = typeof value === 'number' ? value : Number(value);
          return Number.isFinite(numeric) ? formatMetricValue(numeric, unit) : String(value ?? '—');
        },
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: [...labels],
        axisLine: { lineStyle: { color: palette.line } },
        axisTick: { show: false },
        axisLabel: { color: palette.muted, fontSize: 11, fontFamily: palette.fontMono },
      },
      yAxis: {
        type: 'value',
        min: 0,
        splitLine: { lineStyle: { color: palette.line, type: 'dashed', opacity: 0.55 } },
        axisLabel: {
          color: palette.muted,
          fontSize: 11,
          fontFamily: palette.fontMono,
          formatter: (val: number) =>
            unit === 'percent' ? `${val}%` : val >= 1024 ? `${(val / 1024).toFixed(1)}G` : `${Math.round(val)}M`,
        },
      },
      series: resolvedSeries,
    };
  }, [labels, series, unit, stacked, themeVersion]);

  return <EChart option={option} height={height} ariaLabel={ariaLabel} />;
}
