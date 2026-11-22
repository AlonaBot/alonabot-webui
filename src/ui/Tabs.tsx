import type { JSX, ReactNode } from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';
import styles from './Tabs.module.css';

export type TabItem = { value: string; label: ReactNode; count?: number; disabled?: boolean };

/**
 * 标签切换。underline 是页面级标签（原型「已安装 / 商店」），pill 是筛选胶囊组（「全部 10 / 功能 6」）。
 * 只渲染标签条；内容由调用方按 value 自行渲染，切换不卸载调用方状态。
 */
export function TabBar({ value, onValueChange, items, variant = 'underline', className, ...aria }: {
  value: string;
  onValueChange: (value: string) => void;
  items: readonly TabItem[];
  variant?: 'underline' | 'pill';
  className?: string;
  'aria-label'?: string;
}): JSX.Element {
  return <RadixTabs.Root value={value} onValueChange={onValueChange} activationMode="manual">
    <RadixTabs.List className={[styles.list, className].filter(Boolean).join(' ')} data-variant={variant} {...aria}>
      {items.map(item => <RadixTabs.Trigger key={item.value} value={item.value} disabled={item.disabled} className={styles.tab}>
        {item.label}
        {item.count !== undefined && <span className={styles.count}>{item.count}</span>}
      </RadixTabs.Trigger>)}
    </RadixTabs.List>
  </RadixTabs.Root>;
}
