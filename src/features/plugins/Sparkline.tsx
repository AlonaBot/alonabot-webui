import type { JSX } from 'react';
import styles from './Plugins.module.css';

/**
 * 卡片上的活跃度条：values 为按时间先后的计数，0 画成短横线，其余按最大值等比画柱。
 * 只用于一眼看出近一天是否有活动，不显示数值。
 */
export function Sparkline({ values, label }: { values: readonly number[]; label: string }): JSX.Element {
  const max = Math.max(...values, 0);
  return <div className={styles.sparkline} role="img" aria-label={label}>
    {values.map((value, index) => value === 0
      ? <span key={index} className={styles.sparkIdle} />
      : <span key={index} className={styles.sparkBar} style={{ height: `${Math.max(28, Math.round((value / max) * 100))}%` }} />)}
  </div>;
}

/** 把 24 个小时桶合并成 12 个两小时柱。 */
export function pairwise(hours: readonly number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < hours.length; i += 2) result.push(hours[i] + (hours[i + 1] ?? 0));
  return result;
}
