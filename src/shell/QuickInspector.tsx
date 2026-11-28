import { useMemo, useState, type JSX } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Cpu, HardDrive, Layers, Moon, Package as PackageIcon, RefreshCw, RotateCw, ScrollText, Timer } from 'lucide-react';
import { getRecentLogs } from '../api/logs';
import { changePackage, packageIconURL, type Package } from '../api/packages';
import { formatMemoryBytes, formatUptime, getCoreTelemetry, isComponentSleeping } from '../api/telemetry';
import { MiniSparkline } from '../components/charts/MiniSparkline';
import { useUI } from '../i18n/UI';
import { useLiveUptime } from '../lib/useLiveUptime';
import { hasPackageProblem } from '../pages/packageState';
import { PluginConfigPanel } from '../pages/PluginConfigPanel';
import { packageName } from '../features/plugins/usePackageActions';
import { installed, usePackages } from '../queries/packages';
import { useStatistics } from '../queries/plugins';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { EmptyState, LoadingRows } from '../ui/EmptyState';
import { PulseDot, type PulseTone } from '../ui/PulseDot';
import { Sheet } from '../ui/Sheet';
import { Switch } from '../ui/Switch';
import { TabBar } from '../ui/Tabs';
import { toast } from '../ui/toast';
import { navigate } from './router';
import type { InspectorTab } from './inspector';

export interface QuickInspectorProps {
  readonly componentID: string | null;
  readonly tab: InspectorTab;
  readonly onTabChange: (tab: InspectorTab) => void;
  readonly onClose: () => void;
}

function resolvePulseTone(pkg: Package): PulseTone {
  if (!pkg.Enabled) return 'off';
  if (hasPackageProblem(pkg) || pkg.RuntimeState === 'FAILED') return 'danger';
  if (pkg.RuntimeState === 'WAKING' || pkg.RuntimeState === 'QUIESCING') return 'waking';
  if (pkg.RuntimeState === 'SUSPENDED' || pkg.State === 'Installed') return 'idle';
  if (pkg.RuntimeState === 'ACTIVE' || pkg.State === 'Activated') return 'running';
  return 'danger';
}

const inspectorToneBadge: Readonly<Record<PulseTone, string>> = {
  running:
    'border-[color-mix(in_srgb,var(--color-success)_32%,transparent)] bg-[color-mix(in_srgb,var(--color-success)_10%,var(--color-surface))] text-[var(--color-success)]',
  idle:
    'border-[color-mix(in_srgb,var(--color-accent)_32%,transparent)] bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--color-surface))] text-[var(--color-accent-strong)]',
  waking:
    'border-[color-mix(in_srgb,var(--color-warning)_36%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_12%,var(--color-surface))] text-[var(--color-warning-ink)]',
  danger:
    'border-[color-mix(in_srgb,var(--color-danger)_36%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_12%,var(--color-surface))] text-[var(--color-danger)]',
  off:
    'border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-muted)]',
};

const levelBadge: Record<string, string> = {
  DEBUG: 'bg-stone-500/15 text-stone-500 dark:text-stone-400',
  INFO: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  WARN: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  ERROR: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  CRITICAL: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
};

/**
 * QuickInspector 全局右侧滑出抽屉（移动端自动切换手势 Bottom Sheet）：
 * 免切页完成组件启停、重启、重载、快捷配置与最近日志排查。
 */
export function QuickInspector({ componentID, tab, onTabChange, onClose }: QuickInspectorProps): JSX.Element {
  const ui = useUI();
  const client = useQueryClient();
  const packagesQuery = usePackages();
  const statsQuery = useStatistics('24h');
  const telemetryQuery = useQuery({
    queryKey: ['core-telemetry', '5m'],
    queryFn: () => getCoreTelemetry('5m'),
    enabled: componentID !== null,
    refetchInterval: 5000,
    retry: false,
  });
  const logsQuery = useQuery({
    queryKey: ['inspector-logs', componentID],
    queryFn: getRecentLogs,
    enabled: componentID !== null && tab === 'logs',
    refetchInterval: tab === 'logs' ? 4000 : false,
  });

  const [busy, setBusy] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);

  const pkg = useMemo(
    () => installed(packagesQuery.data).find(item => item.ID === componentID) ?? null,
    [packagesQuery.data, componentID],
  );

  const activity = useMemo(() => {
    const buckets = statsQuery.data?.buckets ?? [];
    if (!pkg || buckets.length === 0) return [];
    return buckets.map(bucket =>
      bucket.commands.filter(cmd => cmd.plugin_id === pkg.ID).reduce((sum, cmd) => sum + cmd.count, 0),
    );
  }, [statsQuery.data, pkg]);

  const componentMetrics = useMemo(
    () => telemetryQuery.data?.components.find(item => item.id === componentID) ?? null,
    [telemetryQuery.data, componentID],
  );
  const componentUptime = useLiveUptime(
    componentMetrics?.running ? componentMetrics.started_at : undefined,
    componentMetrics?.running ? componentMetrics.uptime_seconds : undefined,
  );
  const componentSleeping = isComponentSleeping(componentMetrics ?? undefined, pkg?.RuntimeState);

  const componentLogs = useMemo(() => {
    if (!componentID || !logsQuery.data) return [];
    return logsQuery.data
      .filter(entry => entry.source === componentID || entry.source.includes(componentID))
      .slice(-30)
      .reverse();
  }, [logsQuery.data, componentID]);

  const runAction = async (fn: () => Promise<unknown>, okText: string): Promise<void> => {
    setBusy(true);
    try {
      await fn();
      toast.success(okText);
      await client.invalidateQueries({ queryKey: ['packages'] });
    } catch (error: unknown) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  };

  const openFullDetail = (): void => {
    if (!pkg) return;
    onClose();
    navigate(`/components/${encodeURIComponent(pkg.ID)}`);
  };

  const self = pkg?.Role === 'webui';
  const tone = pkg ? resolvePulseTone(pkg) : 'off';

  return (
    <Sheet
      open={componentID !== null}
      onOpenChange={open => { if (!open) onClose(); }}
      width="lg"
      title={
        pkg ? (
          <span className="inline-flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)]">
              {iconFailed ? (
                <PackageIcon size={16} className="text-[var(--color-accent)]" aria-hidden="true" />
              ) : (
                <img
                  src={packageIconURL(pkg.ID)}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={() => setIconFailed(true)}
                />
              )}
            </span>
            <span className="truncate">{packageName(pkg)}</span>
            <PulseDot tone={tone} size="sm" />
          </span>
        ) : (
          ui.inspectorTitle
        )
      }
      description={pkg ? `${pkg.ID} · v${pkg.Version} · ${pkg.Role}` : undefined}
      headerActions={
        pkg ? (
          <Button size="sm" variant="soft" icon={<ArrowUpRight size={14} />} onClick={openFullDetail}>
            {ui.openFullPage}
          </Button>
        ) : undefined
      }
    >
      {!pkg ? (
        <LoadingRows rows={3} height={54} />
      ) : (
        <div className="flex flex-col gap-4">
          {/* 快捷控制栏：免切页直接启停、重启、重载 */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-[var(--color-line)] bg-[var(--color-surface-2)]/70 px-3.5 py-2.5">
            <div className="flex items-center gap-2.5">
              {!self && (
                <Switch
                  checked={pkg.Enabled}
                  pending={busy}
                  onCheckedChange={checked =>
                    void runAction(
                      () => changePackage(checked ? 'enable' : 'disable', pkg.ID, false),
                      checked ? ui.enabledSuccess : ui.disabledSuccess,
                    )
                  }
                  aria-label={`${pkg.Enabled ? ui.actionDisable : ui.actionEnable} ${packageName(pkg)}`}
                />
              )}
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${inspectorToneBadge[tone]}`}
              >
                <PulseDot tone={tone} size="sm" />
                {pkg.Enabled ? (pkg.RuntimeState ? ui[`runtime${pkg.RuntimeState}`] : pkg.State) : ui.stateStopped}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {!self && pkg.Enabled && pkg.Active && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy}
                  icon={<RefreshCw size={13} />}
                  onClick={() => void runAction(() => changePackage('restart', pkg.ID), ui.restartedSuccess)}
                >
                  {ui.actionRestart}
                </Button>
              )}
              {!self && pkg.State === 'Activated' && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy}
                  icon={<RotateCw size={13} />}
                  onClick={() => void runAction(() => changePackage('reload', pkg.ID), ui.reloadedSuccess)}
                >
                  {ui.actionReload}
                </Button>
              )}
            </div>
          </div>

          <TabBar
            variant="pill"
            value={tab}
            onValueChange={next => onTabChange(next as InspectorTab)}
            aria-label={ui.inspectorTitle}
            items={[
              { value: 'overview', label: ui.inspectorOverview },
              { value: 'config', label: ui.inspectorConfig },
              { value: 'logs', label: ui.inspectorLogs },
            ]}
          />

          {tab === 'overview' && (
            <div className="flex flex-col gap-4">
              {(telemetryQuery.error || telemetryQuery.data?.error) && (
                <Alert
                  compact
                  tone={telemetryQuery.error ? 'danger' : 'warning'}
                  title={telemetryQuery.error ? ui.telemetryLoadFailed : ui.telemetryIssue}
                  description={telemetryQuery.error ? telemetryQuery.error.message : telemetryQuery.data?.error}
                  monoDescription
                  action={
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={telemetryQuery.isFetching}
                      icon={<RefreshCw size={12} />}
                      onClick={() => void telemetryQuery.refetch()}
                    >
                      {ui.retry}
                    </Button>
                  }
                />
              )}
              {componentMetrics && (
                <div className="flex flex-col gap-2">
                  {componentSleeping && (
                    <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--color-success)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-success)_10%,var(--color-surface))] px-3 py-1 text-xs font-medium text-[var(--color-success)]">
                      <Moon size={13} aria-hidden="true" />
                      <span>{ui.telemetrySleepingZero}</span>
                    </div>
                  )}
                  {componentMetrics.in_process ? (
                    <div className="flex items-center gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3 text-xs text-[var(--color-ink-muted)]">
                      <Layers size={14} className="shrink-0 text-[var(--color-accent)]" aria-hidden="true" />
                      <span>{ui.telemetryInProcessHint}</span>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
                          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-ink-muted)]">
                            <Cpu size={13} aria-hidden="true" /> CPU
                          </div>
                          <div className="tabular-nums mt-1 font-mono text-base font-semibold text-[var(--color-ink)]">
                            {componentMetrics.cpu_percent.toFixed(1)}%
                          </div>
                        </div>
                        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
                          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-ink-muted)]">
                            <HardDrive size={13} aria-hidden="true" /> RAM
                          </div>
                          <div className="tabular-nums mt-1 font-mono text-base font-semibold text-[var(--color-ink)]">
                            {formatMemoryBytes(componentMetrics.rss_bytes)}
                          </div>
                        </div>
                        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
                          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-ink-muted)]">
                            <Timer size={13} aria-hidden="true" /> {ui.telemetryUptime}
                          </div>
                          <div className="tabular-nums mt-1 font-mono text-base font-semibold text-[var(--color-ink)]">
                            {componentMetrics.running && componentUptime !== null ? formatUptime(componentUptime) : '—'}
                          </div>
                        </div>
                      </div>
                      {componentMetrics.running && componentMetrics.pid > 0 && (
                        <div className="tabular-nums flex items-center justify-between px-1 font-mono text-[11px] text-[var(--color-ink-muted)]">
                          <span>PID {componentMetrics.pid}</span>
                          <span>{ui.telemetryProcesses.replace('{count}', String(componentMetrics.process_count))}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {pkg.Description && (
                <p className="rounded-xl border border-[var(--color-line)]/70 bg-[var(--color-surface)]/70 p-3.5 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                  {pkg.Description}
                </p>
              )}

              {!self && (
                <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3.5">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-medium text-[var(--color-ink)]">{ui.activityLast24h}</span>
                    <span className="tabular-nums font-mono text-[var(--color-ink-muted)]">
                      {activity.reduce((sum, n) => sum + n, 0).toLocaleString()}
                    </span>
                  </div>
                  <MiniSparkline values={activity} label={ui.activityLast24h} height={44} />
                </div>
              )}

              <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-y-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3.5 text-xs">
                <dt className="text-[var(--color-ink-muted)]">{ui.version}</dt>
                <dd className="font-mono text-[var(--color-ink)]">v{pkg.Version}</dd>
                <dt className="text-[var(--color-ink-muted)]">{ui.source}</dt>
                <dd className="truncate font-mono text-[var(--color-ink)]">{pkg.Source || '—'}</dd>
                {pkg.Author && (
                  <>
                    <dt className="text-[var(--color-ink-muted)]">{ui.author}</dt>
                    <dd className="text-[var(--color-ink)]">{pkg.Author}</dd>
                  </>
                )}
              </dl>

              {pkg.Warnings && pkg.Warnings.length > 0 && (
                <div className="rounded-xl border border-[color-mix(in_srgb,var(--color-warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] p-3.5 text-xs text-[var(--color-warning-ink)]">
                  <ul className="list-disc space-y-1 pl-4">
                    {pkg.Warnings.map((warning, idx) => (
                      <li key={idx}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === 'config' && (
            <div className="pt-1">
              <PluginConfigPanel id={pkg.ID} />
            </div>
          )}

          {tab === 'logs' && (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--color-ink-muted)]">{ui.inspectorRecentLogsHint}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ScrollText size={14} />}
                  onClick={() => {
                    onClose();
                    navigate('/logs');
                  }}
                >
                  {ui.viewLogs}
                </Button>
              </div>
              {logsQuery.isPending ? (
                <LoadingRows rows={4} height={42} />
              ) : componentLogs.length === 0 ? (
                <EmptyState icon={<ScrollText size={18} />} title={ui.inspectorNoLogs} />
              ) : (
                <div className="flex flex-col gap-1.5 rounded-xl border border-[var(--color-console-line)] bg-[var(--color-console-bg)] p-3 font-mono text-xs text-[var(--color-console-text)]">
                  {componentLogs.map((record, idx) => (
                    <div key={`${record.time}-${idx}`} className="flex items-start gap-2 border-b border-[var(--color-console-line)]/70 pb-1.5 last:border-b-0 last:pb-0">
                      <span className="tabular-nums shrink-0 text-[11px] text-[var(--color-console-dim)]">
                        {new Date(record.time).toLocaleTimeString()}
                      </span>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${levelBadge[record.level] ?? 'bg-slate-500/20 text-slate-300'}`}>
                        {record.level}
                      </span>
                      <span className="min-w-0 flex-1 break-words leading-relaxed">{record.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
