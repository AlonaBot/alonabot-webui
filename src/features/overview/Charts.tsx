import type { JSX } from 'react';
import styles from './Overview.module.css';

const W = 640;
const H = 220;
const pad = { left: 36, right: 8, top: 12, bottom: 26 };

/** 单调三次插值的平滑路径，不会在数据点之间越过极值。 */
function smoothPath(points: readonly [number, number][]): string {
  if (points.length < 2) return points.length ? `M${points[0][0]},${points[0][1]}` : '';
  const slopes: number[] = [];
  for (let i = 0; i < points.length - 1; i++) slopes.push((points[i + 1][1] - points[i][1]) / (points[i + 1][0] - points[i][0]));
  const tangents = points.map((_, i) => i === 0 ? slopes[0] : i === points.length - 1 ? slopes[i - 1] : slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2);
  let path = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const dx = (x1 - x0) / 3;
    path += ` C${x0 + dx},${y0 + tangents[i] * dx} ${x1 - dx},${y1 - tangents[i + 1] * dx} ${x1},${y1}`;
  }
  return path;
}

export type Series = { label: string; values: readonly number[]; color: string };
export type Marker = { index: number; label: string };

/** 面积折线图：第一条序列带渐变填充，markers 画成竖线与标签（例如插件出错的时刻）。 */
export function AreaChart({ labels, series, markers = [] }: { labels: readonly string[]; series: readonly Series[]; markers?: readonly Marker[] }): JSX.Element {
  const max = Math.max(1, ...series.flatMap(item => item.values));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const x = (i: number) => pad.left + (i * (W - pad.left - pad.right)) / Math.max(1, labels.length - 1);
  const y = (v: number) => pad.top + (1 - v / top) * (H - pad.top - pad.bottom);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const every = Math.max(1, Math.ceil(labels.length / 5));
  return <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map(item => item.label).join('、')}>
    <defs>
      <linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.22" />
        <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
      </linearGradient>
    </defs>
    {ticks.map(tick => <g key={tick}>
      <line x1={pad.left} x2={W - pad.right} y1={y(tick)} y2={y(tick)} className={styles.gridLine} />
      <text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" className={styles.axis}>{tick}</text>
    </g>)}
    {labels.map((label, i) => i % every === 0 || i === labels.length - 1 ? <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className={styles.axis}>{label}</text> : null)}
    {series.map((item, index) => {
      const points = item.values.map((v, i) => [x(i), y(v)] as [number, number]);
      const line = smoothPath(points);
      return <g key={item.label}>
        {index === 0 && <path d={`${line} L${x(item.values.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="url(#area-fill)" className={styles.fade} />}
        <path d={line} fill="none" stroke={item.color} strokeWidth={index === 0 ? 2.5 : 1.5} pathLength={1} className={styles.draw} />
      </g>;
    })}
    {markers.map(marker => <g key={`${marker.index}-${marker.label}`} className={styles.fade}>
      <line x1={x(marker.index)} x2={x(marker.index)} y1={pad.top} y2={y(0)} className={styles.marker} />
      <title>{marker.label}</title>
      <circle cx={x(marker.index)} cy={pad.top + 2} r={4} className={styles.markerDot} />
    </g>)}
  </svg>;
}

/** 堆叠柱：每个时间段一根柱，从下往上依次叠放各序列。 */
export function StackedBars({ labels, series }: { labels: readonly string[]; series: readonly Series[] }): JSX.Element {
  const totals = labels.map((_, i) => series.reduce((sum, item) => sum + item.values[i], 0));
  const max = Math.max(1, ...totals);
  const width = (W - pad.left - pad.right) / labels.length;
  const y = (v: number) => (v / max) * (H - pad.top - pad.bottom);
  const every = Math.max(1, Math.ceil(labels.length / 4));
  return <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map(item => item.label).join('、')}>
    <line x1={pad.left} x2={W - pad.right} y1={H - pad.bottom} y2={H - pad.bottom} className={styles.gridLine} />
    {labels.map((label, i) => {
      let base = H - pad.bottom;
      return <g key={i}>
        {series.map(item => {
          const h = y(item.values[i]);
          base -= h;
          return h > 0 ? <rect key={item.label} x={pad.left + i * width + width * 0.18} y={base} width={width * 0.64} height={h} rx={2} fill={item.color} className={styles.grow}><title>{`${label} ${item.label} ${item.values[i]}`}</title></rect> : null;
        })}
        {i % every === 0 && <text x={pad.left + i * width + width / 2} y={H - 6} textAnchor="middle" className={styles.axis}>{label}</text>}
      </g>;
    })}
  </svg>;
}

/** 环形图：中心显示总数，按份额顺时针排列。 */
export function Donut({ total, totalLabel, parts }: { total: string; totalLabel: string; parts: readonly { label: string; value: number; color: string }[] }): JSX.Element {
  const sum = parts.reduce((a, part) => a + part.value, 0) || 1;
  const r = 62;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return <svg className={styles.donut} viewBox="0 0 160 160" role="img" aria-label={`${totalLabel} ${total}`}>
    <circle cx="80" cy="80" r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth="16" />
    {parts.map(part => {
      const length = (part.value / sum) * c;
      const node = <circle key={part.label} cx="80" cy="80" r={r} fill="none" stroke={part.color} strokeWidth="16" strokeDasharray={`${Math.max(0, length - 2)} ${c}`} strokeDashoffset={-offset} transform="rotate(-90 80 80)" className={styles.fade} />;
      offset += length;
      return node;
    })}
    <text x="80" y="80" textAnchor="middle" className={styles.donutValue}>{total}</text>
    <text x="80" y="100" textAnchor="middle" className={styles.donutLabel}>{totalLabel}</text>
  </svg>;
}

function niceStep(max: number): number {
  const raw = max / 3;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return Math.max(1, (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power);
}
