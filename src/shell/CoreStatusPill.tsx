import { type JSX } from 'react';
import { ArrowUpCircle, AlertCircle } from 'lucide-react';
import { formatUptime } from '../api/telemetry';
import { useUI } from '../i18n/UI';
import { cn } from '../lib/cn';
import { useLiveUptime } from '../lib/useLiveUptime';
import { PulseDot } from '../ui/PulseDot';
import { Tooltip } from '../ui/Tooltip';
import { navigate } from './router';

export interface CoreStatusPillProps {
  readonly version: string;
  readonly startedAt?: string;
  readonly collapsed: boolean;
  readonly coreUpdate?: { readonly version: string; readonly releaseURL: string };
  readonly coreUpdateFailed?: boolean;
  readonly onOpenAbout: () => void;
}

/**
 * CoreStatusPill 侧栏底部 Core 活体状态胶囊：展示在线心跳、版本号、实时 Uptime，
 * 并在检测到新版本时呈现柔和脉冲升级入口（阶段 A 跳转系统设置 Core 版本区）。
 */
export function CoreStatusPill({
  version,
  startedAt,
  collapsed,
  coreUpdate,
  coreUpdateFailed,
  onOpenAbout,
}: CoreStatusPillProps): JSX.Element {
  const ui = useUI();
  const uptimeSeconds = useLiveUptime(startedAt);

  const cleanVersion = `v${version.replace(/^v/, '')}`;

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1.5 pt-1">
        <Tooltip content={`AlonaBot Core ${cleanVersion}${uptimeSeconds !== null ? ` · ${formatUptime(uptimeSeconds)}` : ''}`} side="right">
          <button
            type="button"
            onClick={onOpenAbout}
            aria-label={ui.about}
            className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/80 text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-ink)]"
          >
            <PulseDot tone={coreUpdateFailed ? 'waking' : 'running'} size="sm" />
            {coreUpdate && (
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[var(--color-accent)] ring-2 ring-[var(--color-surface)]" />
            )}
          </button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="mt-1 rounded-[14px] border border-[var(--color-line)]/85 bg-[color-mix(in_srgb,var(--color-surface-2)_68%,transparent)] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onOpenAbout}
          aria-label={ui.about}
          className="group flex min-w-0 items-center gap-2 text-left"
        >
          <PulseDot tone={coreUpdateFailed ? 'waking' : 'running'} size="sm" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-[var(--color-ink)] group-hover:text-[var(--color-accent)]">Core</span>
              <span className="tabular-nums font-mono text-[11px] text-[var(--color-ink-muted)]">{cleanVersion}</span>
            </div>
            {uptimeSeconds !== null && (
              <div className="tabular-nums font-mono text-[10px] text-[var(--color-ink-muted)]">
                UP {formatUptime(uptimeSeconds)}
              </div>
            )}
          </div>
        </button>

        {coreUpdate && (
          <Tooltip content={`${ui.newVersionAvailable}: ${coreUpdate.version}`} side="right">
            <button
              type="button"
              onClick={() => navigate('/settings#core-lifecycle')}
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--color-accent)_40%,transparent)] bg-[var(--color-accent-soft)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--color-accent-strong)] transition-all hover:brightness-110',
              )}
              aria-label={`${ui.newVersionAvailable}: ${coreUpdate.version}`}
            >
              <ArrowUpCircle size={12} aria-hidden="true" />
              <span>{coreUpdate.version}</span>
            </button>
          </Tooltip>
        )}
        {coreUpdateFailed && !coreUpdate && (
          <Tooltip content={ui.updateCheckFailed} side="right">
            <span className="inline-flex text-[var(--color-warning)]" role="status" aria-label={ui.updateCheckFailed}>
              <AlertCircle size={14} />
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
