import { useId, type JSX, type ReactNode } from 'react';
import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import { cn } from '../lib/cn';

/** 复选框；有 label 时整行可点，description 显示在标签下方。 */
export function Checkbox({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  className,
  id,
  ...aria
}: {
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
  const active = checked === true || checked === 'indeterminate';

  const box = (
    <RadixCheckbox.Root
      id={inputID}
      checked={checked}
      disabled={disabled}
      onCheckedChange={value => onCheckedChange(value === true)}
      className={cn(
        'inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        active
          ? 'border-transparent bg-[var(--color-accent)] text-white shadow-xs dark:text-[#0B1322]'
          : 'border-[var(--color-line)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]',
      )}
      {...aria}
    >
      <RadixCheckbox.Indicator className="inline-flex items-center justify-center">
        {checked === 'indeterminate' ? <Minus size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3} />}
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );

  if (label === undefined) {
    return box;
  }

  return (
    <div
      className={cn('inline-flex items-start gap-2.5', disabled && 'opacity-55', className)}
      data-disabled={disabled || undefined}
    >
      <span className="mt-0.5 inline-flex">{box}</span>
      <label htmlFor={inputID} className="flex cursor-pointer flex-col text-sm text-[var(--color-ink)] select-none">
        <span>{label}</span>
        {description && <span className="mt-0.5 text-xs text-[var(--color-ink-muted)]">{description}</span>}
      </label>
    </div>
  );
}
