import { useId, type JSX } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../../lib/cn';

export interface MiniSparklineProps {
  readonly values: readonly number[];
  readonly label: string;
  readonly tone?: 'accent' | 'success' | 'warning' | 'danger' | 'indigo';
  readonly height?: number;
  readonly className?: string;
}

const strokeVar: Record<NonNullable<MiniSparklineProps['tone']>, string> = {
  accent: 'var(--color-accent)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  indigo: 'var(--color-indigo)',
};

/** MiniSparkline 用轻量 SVG + motion 描绘平滑趋势微图，适合 Bento 卡片与组件卡片。 */
export function MiniSparkline({
  values,
  label,
  tone = 'accent',
  height = 38,
  className,
}: MiniSparklineProps): JSX.Element {
  const gradientID = useId();
  const reduced = useReducedMotion();
  const width = 200;
  const padY = 5;
  const usableHeight = height - padY * 2;
  const max = Math.max(1, ...values);
  const points = values.length > 1
    ? values.map((val, idx) => ({
        x: (idx / (values.length - 1)) * width,
        y: padY + usableHeight - (Math.max(0, val) / max) * usableHeight,
      }))
    : [
        { x: 0, y: height - padY },
        { x: width, y: height - padY },
      ];

  let linePath = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const midX = ((prev.x + curr.x) / 2).toFixed(1);
    linePath += ` C ${midX} ${prev.y.toFixed(1)}, ${midX} ${curr.y.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
  }
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
  const last = points[points.length - 1];
  const color = strokeVar[tone];
  const hasActivity = values.some(val => val > 0);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className={cn('block w-full overflow-visible', className)}
      style={{ height }}
    >
      <defs>
        <linearGradient id={gradientID} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={hasActivity ? 0.28 : 0.08} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientID})`} />
      <motion.path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={hasActivity ? 2 : 1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={hasActivity ? 0.95 : 0.35}
        initial={reduced ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reduced ? 0 : 0.65, ease: [0.16, 1, 0.3, 1] }}
      />
      {hasActivity && (
        <circle cx={last.x} cy={last.y} r="3" fill={color} />
      )}
    </svg>
  );
}
