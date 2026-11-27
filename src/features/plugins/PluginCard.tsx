import { useState, type JSX } from 'react';
import { ArrowRight, ArrowUpCircle, Cpu, FileWarning, Info, Layers, Lock, Moon, MoreHorizontal, Package as PackageIcon, PanelRightOpen, Power, RefreshCw, RotateCw, Trash2 } from 'lucide-react';
import { packageIconURL, type Package } from '../../api/packages';
import { formatMemoryBytes, formatUptime, isComponentSleeping, type ComponentTelemetry } from '../../api/telemetry';
import { MiniSparkline } from '../../components/charts/MiniSparkline';
import { useUI } from '../../i18n/UI';
import { hasPackageProblem } from '../../pages/packageState';
import { useInspector } from '../../shell/inspector';
import { navigate } from '../../shell/router';
import { Button } from '../../ui/Button';
import { Menu, MenuItem, MenuSeparator } from '../../ui/Menu';
import { PulseDot, type PulseTone } from '../../ui/PulseDot';
import { SpotlightCard } from '../../ui/SpotlightCard';
import { Switch } from '../../ui/Switch';
import { Tooltip } from '../../ui/Tooltip';
import { packageName } from './usePackageActions';

const statusPillTone: Readonly<Record<PulseTone, string>> = {
  running:
    'border-[color-mix(in_srgb,var(--color-success)_32%,transparent)] bg-[color-mix(in_srgb,var(--color-success)_10%,var(--color-surface))] text-[var(--color-success)]',
  idle:
    'border-[color-mix(in_srgb,var(--color-accent)_32%,transparent)] bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--color-surface))] text-[var(--color-accent-strong)]',
  waking:
    'border-[color-mix(in_srgb,var(--color-warning)_36%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_12%,var(--color-surface))] text-[var(--color-warning-ink)]',
  danger:
    'border-[color-mix(in_srgb,var(--color-danger)_36%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_12%,var(--color-surface))] text-[var(--color-danger)]',
  off:
    'border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]',
};

function resolveStatus(pkg: Package, ui: ReturnType<typeof useUI>): { tone: PulseTone; text: string } {
  if (!pkg.Enabled) return { tone: 'off', text: ui.stateStopped };
  if (hasPackageProblem(pkg) || pkg.RuntimeState === 'FAILED') {
    return { tone: 'danger', text: pkg.RuntimeState === 'FAILED' ? ui.runtimeFAILED : ui.stateProblem };
  }
  if (pkg.RuntimeState) {
    const toneMap: Record<string, PulseTone> = {
      ACTIVE: 'running',
      WAKING: 'waking',
      QUIESCING: 'waking',
      SUSPENDED: 'idle',
      STOPPED: 'off',
    };
    return { tone: toneMap[pkg.RuntimeState] ?? 'idle', text: ui[`runtime${pkg.RuntimeState}`] };
  }
  if (pkg.State === 'Activated') return { tone: 'running', text: ui.stateRunning };
  if (pkg.State === 'Installed') return { tone: 'idle', text: ui.stateInstalled };
  return { tone: 'danger', text: pkg.State || ui.stateDegraded };
}

/** 已安装组件 Bento 卡片：Spotlight 聚光、活体脉冲、24h 活动微图与一键滑出 Quick Inspector。 */
export function PluginCard({
  pkg,
  latest,
  updateFailed,
  activity,
  metrics,
  busy,
  onToggle,
  onRestart,
  onReload,
  onUpdate,
  onUninstall,
  onReason,
}: {
  pkg: Package;
  latest?: string;
  updateFailed: boolean;
  activity: readonly number[];
  metrics?: ComponentTelemetry;
  busy: boolean;
  onToggle: () => void;
  onRestart: () => void;
  onReload: () => void;
  onUpdate: () => void;
  onUninstall: () => void;
  onReason: () => void;
}): JSX.Element {
  const ui = useUI();
  const { openComponent } = useInspector();
  const [iconFailed, setIconFailed] = useState(false);
  const self = pkg.Role === 'webui';
  const state = resolveStatus(pkg, ui);
  const detail = `/components/${encodeURIComponent(pkg.ID)}`;
  const name = packageName(pkg);

  return (
    <SpotlightCard
      glowTone={state.tone === 'danger' ? 'danger' : state.tone === 'running' ? 'accent' : 'indigo'}
      className="flex h-full flex-col p-4"
    >
      <div className="flex h-full flex-col gap-3">
        <header className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => openComponent(pkg.ID, 'overview')}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-2)] transition-transform hover:scale-105"
            aria-label={`${ui.quickInspect} ${name}`}
          >
            {iconFailed ? (
              <PackageIcon size={20} className="text-[var(--color-accent)]" aria-hidden="true" />
            ) : (
              <img src={packageIconURL(pkg.ID)} alt="" className="h-full w-full object-cover" onError={() => setIconFailed(true)} />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => openComponent(pkg.ID, 'overview')}
                className="truncate text-left text-sm font-bold text-[var(--color-ink)] transition-colors hover:text-[var(--color-accent)]"
              >
                {name}
              </button>
              <span className="shrink-0 rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--color-ink-muted)]">
                {pkg.Role}
              </span>
            </div>
            <div className="tabular-nums mt-0.5 flex items-center gap-1 font-mono text-[11px] text-[var(--color-ink-muted)]">
              <span>v{pkg.Version}</span>
              {latest && (
                <>
                  <ArrowRight size={11} aria-hidden="true" />
                  <span className="font-semibold text-[var(--color-accent)]">v{latest}</span>
                </>
              )}
            </div>
          </div>

          {self ? (
            <Tooltip content={ui.webuiSelfLocked}>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-ink-muted)]">
                <Lock size={15} aria-label={ui.webuiSelfLocked} />
              </span>
            </Tooltip>
          ) : (
            <Switch
              checked={pkg.Enabled}
              pending={busy}
              onCheckedChange={onToggle}
              aria-label={`${pkg.Enabled ? ui.actionDisable : ui.actionEnable} ${name}`}
            />
          )}
        </header>

        <p className="line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-[var(--color-ink-muted)]">
          {pkg.Description || (self ? ui.webuiSelfDescription : pkg.Source || ui.unknownMetadata)}
        </p>

        {metrics && (isComponentSleeping(metrics, pkg.RuntimeState) ? (
          <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--color-success)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-success)_10%,var(--color-surface))] px-2.5 py-1 text-[11px] font-medium text-[var(--color-success)]">
            <Moon size={12} aria-hidden="true" />
            <span>{ui.telemetrySleepingZero}</span>
          </div>
        ) : metrics.in_process ? (
          <div className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-[var(--color-surface-2)]/70 px-2.5 py-1 font-mono text-[11px] text-[var(--color-ink-muted)]">
            <Layers size={12} aria-hidden="true" />
            <span>{ui.telemetryInProcess}</span>
          </div>
        ) : metrics.running ? (
          <div className="tabular-nums flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-[var(--color-surface-2)]/70 px-2.5 py-1.5 font-mono text-[11px] text-[var(--color-ink-muted)]">
            <span className="inline-flex items-center gap-1 text-[var(--color-ink)]">
              <Cpu size={11} className="text-[var(--color-accent)]" aria-hidden="true" />
              {metrics.cpu_percent.toFixed(1)}%
            </span>
            <span>·</span>
            <span className="text-[var(--color-ink)]">{formatMemoryBytes(metrics.rss_bytes)}</span>
            <span>·</span>
            <span>UP {formatUptime(metrics.uptime_seconds)}</span>
            {metrics.process_count > 1 && (
              <>
                <span>·</span>
                <span>{ui.telemetryProcesses.replace('{count}', String(metrics.process_count))}</span>
              </>
            )}
          </div>
        ) : null)}

        {!self && <MiniSparkline values={activity} label={ui.activityLast24h} height={32} tone={state.tone === 'danger' ? 'danger' : 'accent'} />}

        <footer className="mt-auto flex items-center gap-1.5 border-t border-[var(--color-line)]/65 pt-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusPillTone[state.tone]}`}
          >
            <PulseDot tone={state.tone} size="sm" />
            {state.text}
          </span>
          {updateFailed && (
            <Tooltip content={ui.updateCheckFailed}>
              <FileWarning size={14} className="text-[var(--color-warning)]" aria-label={ui.updateCheckFailed} />
            </Tooltip>
          )}
          <span className="flex-1" />
          {state.tone === 'danger' && (
            <Button size="sm" variant="danger" icon={<Info size={13} />} onClick={onReason}>
              {ui.viewReason}
            </Button>
          )}
          {latest && state.tone !== 'danger' && (
            <Button size="sm" variant="soft" icon={<ArrowUpCircle size={13} />} onClick={onUpdate} disabled={busy}>
              {ui.actionUpdate}
            </Button>
          )}
          <Tooltip content={ui.quickInspect}>
            <Button size="sm" variant="ghost" iconOnly aria-label={ui.quickInspect} onClick={() => openComponent(pkg.ID, 'overview')}>
              <PanelRightOpen size={15} />
            </Button>
          </Tooltip>
          {!self && (
            <Menu
              align="end"
              trigger={
                <Button size="sm" variant="ghost" iconOnly aria-label={ui.actions}>
                  <MoreHorizontal size={16} />
                </Button>
              }
            >
              <MenuItem icon={<PanelRightOpen size={15} />} onSelect={() => openComponent(pkg.ID, 'overview')}>
                {ui.quickInspect}
              </MenuItem>
              <MenuItem icon={<PackageIcon size={15} />} onSelect={() => navigate(detail)}>
                {ui.actionDetails}
              </MenuItem>
              <MenuItem icon={<Power size={15} />} onSelect={onToggle}>
                {pkg.Enabled ? ui.actionDisable : ui.actionEnable}
              </MenuItem>
              {pkg.Enabled && pkg.Active && (
                <MenuItem icon={<RefreshCw size={15} />} onSelect={onRestart}>
                  {ui.actionRestart}
                </MenuItem>
              )}
              {pkg.State === 'Activated' && (
                <MenuItem icon={<RotateCw size={15} />} onSelect={onReload}>
                  {ui.actionReload}
                </MenuItem>
              )}
              <MenuItem icon={<ArrowUpCircle size={15} />} onSelect={onUpdate}>
                {ui.actionUpdate}
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Trash2 size={15} />} tone="danger" onSelect={onUninstall}>
                {ui.actionUninstall}
              </MenuItem>
            </Menu>
          )}
        </footer>
      </div>
    </SpotlightCard>
  );
}
