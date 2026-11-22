import { useId, type JSX, type ReactNode } from 'react';
import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import styles from './Checkbox.module.css';

/** 复选框；有 label 时整行可点，description 显示在标签下方。 */
export function Checkbox({ checked, onCheckedChange, label, description, disabled, className, id, ...aria }: {
  checked: boolean | 'indeterminate';
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
}): JSX.Element {
  const generated = useId();
  const inputID = id ?? generated;
  const box = <RadixCheckbox.Root id={inputID} className={styles.box} checked={checked} disabled={disabled} onCheckedChange={value => onCheckedChange(value === true)} {...aria}>
    <RadixCheckbox.Indicator className={styles.indicator}>{checked === 'indeterminate' ? <Minus size={13} strokeWidth={3} /> : <Check size={13} strokeWidth={3} />}</RadixCheckbox.Indicator>
  </RadixCheckbox.Root>;
  if (label === undefined) return box;
  return <div className={[styles.row, className].filter(Boolean).join(' ')} data-disabled={disabled || undefined}>
    {box}
    <label htmlFor={inputID} className={styles.text}>
      <span>{label}</span>
      {description && <span className={styles.description}>{description}</span>}
    </label>
  </div>;
}
