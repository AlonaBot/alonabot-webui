import type { JSX } from 'react';
import * as RadixSwitch from '@radix-ui/react-switch';
import styles from './Switch.module.css';

/** 开关；没有可见标签时必须提供 aria-label。pending 表示请求进行中，开关保持可读但不可再点。 */
export function Switch({ checked, onCheckedChange, disabled, pending, size = 'md', id, ...aria }: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  pending?: boolean;
  size?: 'sm' | 'md';
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}): JSX.Element {
  return <RadixSwitch.Root id={id} className={styles.root} data-size={size} data-pending={pending || undefined} checked={checked} disabled={disabled || pending} onCheckedChange={onCheckedChange} {...aria}>
    <RadixSwitch.Thumb className={styles.thumb} />
  </RadixSwitch.Root>;
}
