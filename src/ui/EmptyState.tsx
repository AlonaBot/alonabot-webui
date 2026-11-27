import type { JSX, ReactNode } from 'react';
import { useUI } from '../i18n/UI';
import { cn } from '../lib/cn';

/** 空状态或页面级错误：光环图标、标题、说明与可选主操作。 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = 'default',
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: 'default' | 'error';
}): JSX.Element {
  return (
    <div
      data-tone={tone}
      role={tone === 'error' ? 'alert' : undefined}
      className="flex flex-col items-center justify-center px-6 py-12 text-center"
    >
      {icon && (
        <div
          className={cn(
            'mb-3.5 inline-flex h-12 w-12 items-center justify-center rounded-2xl border',
            tone === 'error'
              ? 'border-[color-mix(in_srgb,var(--color-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger)]'
              : 'border-[var(--color-glass-border)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
          )}
        >
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-[var(--color-ink)]">{title}</p>
      {description && (
        <div className="mt-1.5 max-w-[420px] text-xs leading-relaxed text-[var(--color-ink-muted)] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:font-medium [&_a]:text-[var(--color-accent)] [&_a]:hover:underline">
          {description}
        </div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** 扫光骨架占位块。 */
export function Skeleton({
  width = '100%',
  height = 16,
  radius = 10,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
}): JSX.Element {
  return <span className="alona-skeleton block" style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}

/** 内容加载占位行，向读屏播报「加载中」。 */
export function LoadingRows({ rows = 3, height = 56 }: { rows?: number; height?: number }): JSX.Element {
  const ui = useUI();
  return (
    <div role="status" aria-label={ui.loading} className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} height={height} radius={14} />
      ))}
    </div>
  );
}

/** 行内或整页的环形加载指示器。 */
export function Spinner({ size = 22 }: { size?: number }): JSX.Element {
  const ui = useUI();
  return (
    <span
      role="status"
      aria-label={ui.loading}
      className="inline-block animate-spin rounded-full border-2 border-[var(--color-line)] border-t-[var(--color-accent)]"
      style={{ width: size, height: size }}
    />
  );
}
