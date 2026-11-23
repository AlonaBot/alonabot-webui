import type { JSX, ReactNode } from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import styles from './Select.module.css';

export type SelectOption = { value: string; label: ReactNode; description?: ReactNode; disabled?: boolean };

// Radix 不允许空串作为选项值；对外保持 '' 表示「无」。
const empty = '\u0000empty';
const encode = (value: string) => value === '' ? empty : value;
const decode = (value: string) => value === empty ? '' : value;

/**
 * 下拉选择。variant=filled 用于对话框表单（原型的浅底输入），outline 用于设置行与工具栏。
 * 当前值不在 options 里时仍显示 value 原文，避免静默丢失已保存的值。
 */
export function Select({ value, onValueChange, options, placeholder, disabled, variant = 'outline', size = 'md', className, id, name, ...aria }: {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: ReactNode;
  disabled?: boolean;
  variant?: 'outline' | 'filled' | 'pill';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  id?: string;
  name?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-invalid'?: boolean;
}): JSX.Element {
  const known = options.some(option => option.value === value);
  return <RadixSelect.Root value={encode(value)} onValueChange={next => onValueChange(decode(next))} disabled={disabled} name={name}>
    <RadixSelect.Trigger id={id} className={[styles.trigger, className].filter(Boolean).join(' ')} data-variant={variant} data-size={size} {...aria}>
      <RadixSelect.Value placeholder={placeholder}>{known ? undefined : value}</RadixSelect.Value>
      <RadixSelect.Icon className={styles.chevron}><ChevronDown size={16} /></RadixSelect.Icon>
    </RadixSelect.Trigger>
    <RadixSelect.Portal>
      <RadixSelect.Content className={styles.content} position="popper" sideOffset={6} collisionPadding={12}>
        <RadixSelect.Viewport className={styles.viewport}>
          {options.map(option => <RadixSelect.Item key={option.value} value={encode(option.value)} disabled={option.disabled} className={styles.item}>
            <span className={styles.itemText}>
              <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
              {option.description && <span className={styles.description}>{option.description}</span>}
            </span>
            <RadixSelect.ItemIndicator className={styles.indicator}><Check size={15} /></RadixSelect.ItemIndicator>
          </RadixSelect.Item>)}
        </RadixSelect.Viewport>
      </RadixSelect.Content>
    </RadixSelect.Portal>
  </RadixSelect.Root>;
}
