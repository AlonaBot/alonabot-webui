import { useId, type JSX, type ReactNode } from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../lib/cn';

export type TabItem = { value: string; label: ReactNode; count?: number; disabled?: boolean };

/**
 * 标签切换条，内置 motion layoutId 弹性磁吸指示条。
 * underline 用于页面级大标签，pill 用于筛选胶囊与主题分段开关。
 */
export function TabBar({
  value,
  onValueChange,
  items,
  variant = 'underline',
  className,
  ...aria
}: {
  value: string;
  onValueChange: (value: string) => void;
  items: readonly TabItem[];
  variant?: 'underline' | 'pill';
  className?: string;
  'aria-label'?: string;
}): JSX.Element {
  const groupID = useId();
  const reduced = useReducedMotion();

  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange} activationMode="manual" className="max-w-full min-w-0">
      <RadixTabs.List
        data-variant={variant}
        className={cn(
          variant === 'pill'
            ? 'inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-surface-2)_82%,transparent)] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            : 'inline-flex max-w-full items-center gap-1 overflow-x-auto border-b border-[var(--color-line)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          className,
        )}
        {...aria}
      >
        {items.map(item => {
          const active = item.value === value;
          return (
            <RadixTabs.Trigger
              key={item.value}
              value={item.value}
              disabled={item.disabled}
              className={cn(
                'relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45',
                variant === 'pill'
                  ? cn(
                      'rounded-full px-3 py-1.5',
                      active ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
                    )
                  : cn(
                      'px-3.5 py-2.5',
                      active ? 'text-[var(--color-accent-strong)]' : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
                    ),
              )}
            >
              {active && variant === 'pill' && (
                <motion.span
                  layoutId={`tab-pill-${groupID}`}
                  transition={reduced ? { duration: 0.01 } : { type: 'spring', stiffness: 460, damping: 34 }}
                  className="absolute inset-0 rounded-full border border-[var(--color-glass-border)] bg-[var(--color-surface)] shadow-sm"
                  aria-hidden="true"
                />
              )}
              {active && variant === 'underline' && (
                <motion.span
                  layoutId={`tab-line-${groupID}`}
                  transition={reduced ? { duration: 0.01 } : { type: 'spring', stiffness: 460, damping: 34 }}
                  className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[linear-gradient(90deg,var(--color-accent),var(--color-cyan))]"
                  aria-hidden="true"
                />
              )}
              <span className="relative z-10 inline-flex items-center gap-1.5">
                {item.label}
                {item.count !== undefined && (
                  <span
                    className={cn(
                      'tabular-nums rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none',
                      active
                        ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]'
                        : 'bg-[var(--color-line)]/65 text-[var(--color-ink-muted)]',
                    )}
                  >
                    {item.count}
                  </span>
                )}
              </span>
            </RadixTabs.Trigger>
          );
        })}
      </RadixTabs.List>
    </RadixTabs.Root>
  );
}
