import type { JSX } from 'react';
import { MiniSparkline } from '../../components/charts/MiniSparkline';

/** 卡片上的活跃度趋势微图。 */
export function Sparkline({ values, label }: { values: readonly number[]; label: string }): JSX.Element {
  return <MiniSparkline values={values} label={label} height={32} />;
}

/** 把 24 个小时桶合并成 12 个两小时柱。 */
export function pairwise(hours: readonly number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < hours.length; i += 2) {
    result.push(hours[i] + (hours[i + 1] ?? 0));
  }
  return result;
}
