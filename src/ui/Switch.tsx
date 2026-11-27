import type { JSX } from 'react';
import * as RadixSwitch from '@radix-ui/react-switch';
import { cn } from '../lib/cn';

/** 开关；无可见标签时必须提供 aria-label。pending 表示请求进行中，开关保持可读但不可再点。 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  pending,
  size = 'md',
  id,
  ...aria
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  pending?: boolean;
  size?: 'sm' | 'md';
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}): JSX.Element {
  return (
    <RadixSwitch.Root
      id={id}
      data-size={size}
      data-pending={pending || undefined}
      checked={checked}
      disabled={disabled || pending}
      onCheckedChange={onCheckedChange}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-all duration-200 ease-[var(--ease-out)] disabled:cursor-not-allowed disabled:opacity-55',
        size === 'sm' ? 'h-5 w-9' : 'h-6 w-11',
        checked
          ? 'bg-[var(--color-accent)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]'
          : 'bg-[var(--color-line)]',
        pending && 'animate-pulse',
      )}
      {...aria}
    >
      <RadixSwitch.Thumb
        className={cn(
          'block rounded-full bg-white shadow-sm transition-transform duration-200 ease-[var(--ease-out)]',
          size === 'sm'
            ? 'h-4 w-4 translate-x-0.5 data-[state=checked]:translate-x-[18px]'
            : 'h-5 w-5 translate-x-0.5 data-[state=checked]:translate-x-[22px]',
        )}
      />
    </RadixSwitch.Root>
  );
}
