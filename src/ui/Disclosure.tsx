import { useId, useState, type JSX, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../lib/cn';

/** 可展开区块，取代 <details>；收起时保留子树挂载以不丢失内部表单状态。 */
export function Disclosure({
  summary,
  hint,
  children,
  defaultOpen = false,
  className,
}: {
  summary: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div
      className={cn(
        'rounded-[14px] border border-[var(--color-line)]/85 bg-[color-mix(in_srgb,var(--color-surface-2)_48%,transparent)] transition-colors',
        className,
      )}
      data-open={open || undefined}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--color-ink)] transition-colors hover:text-[var(--color-accent-strong)]"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(value => !value)}
      >
        <ChevronRight
          size={16}
          className={cn('shrink-0 text-[var(--color-ink-muted)] transition-transform duration-200', open && 'rotate-90 text-[var(--color-accent)]')}
          aria-hidden="true"
        />
        <span className="font-semibold">{summary}</span>
        {hint && !open && <span className="ml-auto truncate text-xs font-normal text-[var(--color-ink-muted)]">{hint}</span>}
      </button>
      <div
        id={id}
        inert={!open || undefined}
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-200 ease-[var(--ease-out)]',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-[var(--color-line)]/70 px-4 py-3.5">{children}</div>
        </div>
      </div>
    </div>
  );
}
