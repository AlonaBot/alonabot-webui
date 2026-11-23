import type { JSX, ReactNode } from 'react';
import * as Radio from '@radix-ui/react-radio-group';
import { Check } from 'lucide-react';
import styles from './RadioGroup.module.css';

export type RadioOption = { value: string; label: ReactNode; description?: ReactNode; icon?: ReactNode; disabled?: boolean };

/**
 * 单选组。list 是竖排的圆点单选；card 是原型「添加机器人账号」里带图标的选择卡，选中时带强调描边与对勾。
 */
export function RadioGroup({ value, onValueChange, options, variant = 'list', columns, disabled, className, ...aria }: {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly RadioOption[];
  variant?: 'list' | 'card';
  columns?: number;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}): JSX.Element {
  return <Radio.Root value={value} onValueChange={onValueChange} disabled={disabled} className={[styles.group, className].filter(Boolean).join(' ')} data-variant={variant}
    style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined} {...aria}>
    {options.map(option => <Radio.Item key={option.value} value={option.value} disabled={option.disabled} className={styles.item}>
      {variant === 'list' && <span className={styles.dot}><Radio.Indicator className={styles.dotFill} /></span>}
      {option.icon && <span className={styles.icon}>{option.icon}</span>}
      <span className={styles.text}>
        <span className={styles.label}>{option.label}</span>
        {option.description && <span className={styles.description}>{option.description}</span>}
      </span>
      {variant === 'card' && <Radio.Indicator className={styles.check}><Check size={18} /></Radio.Indicator>}
    </Radio.Item>)}
  </Radio.Root>;
}
