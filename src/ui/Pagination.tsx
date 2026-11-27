import type { JSX } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useUI } from '../i18n/UI';
import { cn } from '../lib/cn';

/** 数字分页：首页、末页与当前页前后两页；仅有一页时不渲染。 */
export function Pagination({
  page,
  total,
  size,
  onChange,
  disabled = false,
}: {
  page: number;
  total: number;
  size: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}): JSX.Element | null {
  const ui = useUI();
  const count = Math.ceil(total / size);
  if (count < 2) {
    return null;
  }
  const pages = Array.from({ length: count }, (_, i) => i + 1).filter(n => n === 1 || n === count || Math.abs(n - page) <= 2);

  return (
    <nav className="mt-4 flex items-center justify-center gap-1.5" aria-label={ui.pagination}>
      <button
        type="button"
        disabled={disabled || page === 1}
        onClick={() => onChange(page - 1)}
        aria-label={ui.previousPage}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-ink)] disabled:pointer-events-none disabled:opacity-40"
      >
        <ChevronLeft size={16} />
      </button>
      {pages.map((n, i) => (
        <span key={n} className="inline-flex items-center gap-1.5">
          {i > 0 && n - pages[i - 1] > 1 && (
            <span className="px-1 text-xs text-[var(--color-ink-muted)]" aria-hidden="true">
              …
            </span>
          )}
          <button
            type="button"
            disabled={disabled}
            aria-current={page === n ? 'page' : undefined}
            onClick={() => onChange(n)}
            className={cn(
              'tabular-nums inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2.5 text-xs font-semibold transition-all',
              page === n
                ? 'border-transparent bg-[var(--color-accent)] text-white shadow-xs dark:text-[#0B1322]'
                : 'border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-ink)]',
            )}
          >
            {n}
          </button>
        </span>
      ))}
      <button
        type="button"
        disabled={disabled || page >= count}
        onClick={() => onChange(page + 1)}
        aria-label={ui.nextPage}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-ink)] disabled:pointer-events-none disabled:opacity-40"
      >
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}
