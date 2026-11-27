import type { JSX, ReactNode } from 'react';
import * as Radio from '@radix-ui/react-radio-group';
import { Check } from 'lucide-react';
import { cn } from '../lib/cn';

export type RadioOption = { value: string; label: ReactNode; description?: ReactNode; icon?: ReactNode; disabled?: boolean };

/** 单选组。list 为竖排圆点单选；card 为带图标与高亮描边的选择卡片。 */
export function RadioGroup({
  value,
  onValueChange,
  options,
  variant = 'list',
  columns,
  disabled,
  className,
  ...aria
}: {
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
  return (
    <Radio.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      data-variant={variant}
      className={cn(variant === 'card' ? 'grid gap-3' : 'flex flex-col gap-2', className)}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
      {...aria}
    >
      {options.map(option => {
        const selected = option.value === value;
        return (
          <Radio.Item
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className={cn(
              'group flex cursor-pointer items-center gap-3 text-left transition-all duration-150 outline-none disabled:cursor-not-allowed disabled:opacity-45',
              variant === 'card'
                ? cn(
                    'rounded-[14px] border p-3.5',
                    selected
                      ? 'border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--color-surface))] shadow-[0_0_0_1px_var(--color-accent)]'
                      : 'border-[var(--color-line)] bg-[var(--color-surface)] hover:border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-line))]',
                  )
                : 'rounded-[10px] px-2 py-1.5 hover:bg-[var(--color-surface-2)]',
            )}
          >
            {variant === 'list' && (
              <span
                className={cn(
                  'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                  selected ? 'border-[var(--color-accent)]' : 'border-[var(--color-line)]',
                )}
              >
                <Radio.Indicator className="h-2 w-2 rounded-full bg-[var(--color-accent)]" />
              </span>
            )}
            {option.icon && (
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-2)] text-[var(--color-accent)]">
                {option.icon}
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium text-[var(--color-ink)]">{option.label}</span>
              {option.description && <span className="text-xs text-[var(--color-ink-muted)]">{option.description}</span>}
            </span>
            {variant === 'card' && (
              <Radio.Indicator className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-white dark:text-[#0B1322]">
                <Check size={13} strokeWidth={3} />
              </Radio.Indicator>
            )}
          </Radio.Item>
        );
      })}
    </Radio.Root>
  );
}
