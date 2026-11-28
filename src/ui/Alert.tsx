import type { JSX, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleAlert, Info } from 'lucide-react';
import { cn } from '../lib/cn';

export type AlertTone = 'info' | 'warning' | 'danger' | 'success';

export interface AlertProps {
  readonly tone?: AlertTone;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly compact?: boolean;
  readonly monoDescription?: boolean;
  readonly className?: string;
}

interface ToneStyles {
  readonly container: string;
  readonly accentBar: string;
  readonly iconBox: string;
  readonly title: string;
}

const toneIcons = {
  info: Info,
  warning: AlertTriangle,
  danger: CircleAlert,
  success: CheckCircle2,
} as const;

const toneStyles: Readonly<Record<AlertTone, ToneStyles>> = {
  info: {
    container:
      'border-[color-mix(in_srgb,var(--color-accent)_32%,transparent)] bg-[color-mix(in_srgb,var(--color-accent)_8%,var(--color-surface))]',
    accentBar: 'bg-[var(--color-accent)]',
    iconBox:
      'border-[color-mix(in_srgb,var(--color-accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-[var(--color-accent)]',
    title: 'text-[var(--color-accent-strong)]',
  },
  warning: {
    container:
      'border-[color-mix(in_srgb,var(--color-warning)_34%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_9%,var(--color-surface))]',
    accentBar: 'bg-[var(--color-warning)]',
    iconBox:
      'border-[color-mix(in_srgb,var(--color-warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)] text-[var(--color-warning)]',
    title: 'text-[var(--color-warning-ink)]',
  },
  danger: {
    container:
      'border-[color-mix(in_srgb,var(--color-danger)_34%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_9%,var(--color-surface))]',
    accentBar: 'bg-[var(--color-danger)]',
    iconBox:
      'border-[color-mix(in_srgb,var(--color-danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_14%,transparent)] text-[var(--color-danger)]',
    title: 'text-[var(--color-danger)]',
  },
  success: {
    container:
      'border-[color-mix(in_srgb,var(--color-success)_32%,transparent)] bg-[color-mix(in_srgb,var(--color-success)_9%,var(--color-surface))]',
    accentBar: 'bg-[var(--color-success)]',
    iconBox:
      'border-[color-mix(in_srgb,var(--color-success)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)] text-[var(--color-success)]',
    title: 'text-[var(--color-success)]',
  },
};

/**
 * 行内状态与告警横幅：采用与 Alona 玻璃卡片一致的柔和语义底色、左侧强调边与图标徽章，
 * 将主标题、技术错误详情与可选重试操作清晰分层。
 */
export function Alert({
  tone = 'info',
  title,
  description,
  action,
  compact = false,
  monoDescription = false,
  className,
}: AlertProps): JSX.Element {
  const Icon = toneIcons[tone];
  const style = toneStyles[tone];
  const role = tone === 'danger' || tone === 'warning' ? 'alert' : 'status';

  return (
    <div
      role={role}
      data-tone={tone}
      className={cn(
        'relative flex flex-wrap items-start overflow-hidden border transition-colors',
        compact ? 'gap-2.5 rounded-xl py-2.5 pr-3 pl-3.5' : 'gap-3 rounded-2xl py-3 pr-4 pl-4 shadow-[var(--shadow-card)]',
        style.container,
        className,
      )}
    >
      <span aria-hidden="true" className={cn('pointer-events-none absolute inset-y-0 left-0 w-[3px]', style.accentBar)} />
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex shrink-0 items-center justify-center border',
          compact ? 'mt-0.5 h-7 w-7 rounded-lg' : 'h-8 w-8 rounded-xl',
          style.iconBox,
        )}
      >
        <Icon size={compact ? 14 : 16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('m-0 font-semibold leading-snug', compact ? 'text-xs' : 'text-[13px]', style.title)}>{title}</p>
        {description && (
          <p
            className={cn(
              'm-0 mt-1 break-words leading-relaxed text-[var(--color-ink-muted)]',
              monoDescription ? 'font-mono text-[11.5px]' : 'text-xs',
            )}
          >
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0 self-center sm:ml-auto">{action}</div>}
    </div>
  );
}
