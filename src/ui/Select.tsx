import type { JSX, ReactNode } from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../lib/cn';

export type SelectOption = { value: string; label: ReactNode; description?: ReactNode; disabled?: boolean };

// Radix 不允许空串作为选项值；对外保持 '' 表示「无」。
const empty = '\u0000empty';
const encode = (value: string): string => (value === '' ? empty : value);
const decode = (value: string): string => (value === empty ? '' : value);

/**
 * 下拉选择。当前值不在 options 中时仍显示 value 原文，避免静默丢失已保存的值。
 */
export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  variant = 'outline',
  size = 'md',
  className,
  id,
  name,
  ...aria
}: {
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
  return (
    <RadixSelect.Root value={encode(value)} onValueChange={next => onValueChange(decode(next))} disabled={disabled} name={name}>
      <RadixSelect.Trigger
        id={id}
        data-variant={variant}
        data-size={size}
        className={cn(
          'inline-flex min-w-[120px] items-center justify-between gap-2 text-sm text-[var(--color-ink)] transition-all duration-150 outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-accent)_22%,transparent)] disabled:pointer-events-none disabled:opacity-50',
          size === 'sm' && 'h-8 px-2.5 text-xs',
          size === 'md' && 'h-9 px-3 text-sm',
          size === 'lg' && 'h-11 px-3.5 text-sm',
          variant === 'pill'
            ? 'rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] hover:border-[color-mix(in_srgb,var(--color-accent)_50%,var(--color-line))]'
            : variant === 'filled'
              ? 'rounded-[var(--radius-sm)] border border-transparent bg-[var(--color-surface-2)] hover:border-[var(--color-line)]'
              : 'rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] hover:border-[color-mix(in_srgb,var(--color-accent)_50%,var(--color-line))]',
          className,
        )}
        {...aria}
      >
        <span className="truncate">
          <RadixSelect.Value placeholder={placeholder}>{known ? undefined : value}</RadixSelect.Value>
        </span>
        <RadixSelect.Icon className="shrink-0 text-[var(--color-ink-muted)]">
          <ChevronDown size={15} />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          className="alona-glass-elevated z-[var(--z-popover)] max-h-[300px] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[14px] p-1 text-sm text-[var(--color-ink)] shadow-[var(--shadow-popover)]"
        >
          <RadixSelect.Viewport className="p-0.5">
            {options.map(option => (
              <RadixSelect.Item
                key={option.value}
                value={encode(option.value)}
                disabled={option.disabled}
                className="relative flex cursor-pointer items-center justify-between gap-3 rounded-[10px] px-2.5 py-2 outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-[var(--color-accent-soft)] data-[highlighted]:text-[var(--color-accent-strong)]"
              >
                <span className="flex min-w-0 flex-col">
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                  {option.description && <span className="text-xs text-[var(--color-ink-muted)]">{option.description}</span>}
                </span>
                <RadixSelect.ItemIndicator className="shrink-0 text-[var(--color-accent)]">
                  <Check size={15} />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
