import { useMemo, useState, type JSX } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Cpu, HardDrive, HeartPulse, MessageSquare, Moon, Puzzle, Sparkles, Terminal, Timer, Wrench } from 'lucide-react';
import { getAgentModelUsage } from '../../api/agent';
import { getCore } from '../../api/core';
import {
  bytesToMiB,
  computeRoleShares,
  formatMemoryBytes,
  formatUptime,
  getCoreTelemetry,
  isComponentSleeping,
  type TelemetryRoleKey,
  type TelemetryWindow,
} from '../../api/telemetry';
import type { StatisticsRange } from '../../api/webui';
import { MiniSparkline } from '../../components/charts/MiniSparkline';
import { useUI } from '../../i18n/UI';
import { useLiveUptime } from '../../lib/useLiveUptime';
import { hasPackageProblem } from '../../pages/packageState';
import { groupStatistics, rangeLogs } from '../../pages/statistics';
import { installed, usePackages } from '../../queries/packages';
import { useStatistics } from '../../queries/plugins';
import { useInspector } from '../../shell/inspector';
import { PageHeader } from '../../shell/PageHeader';
import { Link, navigate } from '../../shell/router';
import { AnimatedNumber } from '../../ui/AnimatedNumber';
import { Button } from '../../ui/Button';
import { EmptyState, Skeleton } from '../../ui/EmptyState';
import { PulseDot } from '../../ui/PulseDot';
import { SpotlightCard } from '../../ui/SpotlightCard';
import { TabBar } from '../../ui/Tabs';
import { packageName } from '../plugins/usePackageActions';
import { AreaChart, Donut, ResourceTrendChart, StackedBars, type Series } from './Charts';

const chartPalette = ['var(--color-accent)', 'var(--color-indigo)', 'var(--color-cyan)', 'var(--color-success)', 'var(--color-warning)'];

const roleColors: Readonly<Record<TelemetryRoleKey, string>> = {
  core: 'var(--color-indigo)',
  plugin: 'var(--color-accent)',
  adapter: 'var(--color-cyan)',
  agent: 'var(--color-success)',
  webui: 'var(--color-warning)',
};

/**
 * 总览旗舰 Bento 看板：
 * 1. Core 生命体征 Hero + 时间范围磁吸切换；
 * 2. 资源开销与实时运行 KPI Bento 行（遥测端点可用时自动切换为 CPU/RAM/Uptime 遥测视图）；
 * 3. ECharts 消息趋势、账号份额、热门插件（点击直达 Quick Inspector）、错误警告与 Agent Token 分布。
 */
export function OverviewPage(): JSX.Element {
  const ui = useUI();
  const reduced = useReducedMotion();
  const { openComponent } = useInspector();
  const [range, setRange] = useState<StatisticsRange>('24h');
  const [resourceSort, setResourceSort] = useState<'rss' | 'cpu'>('rss');
  const [telemetryWindow, setTelemetryWindow] = useState<TelemetryWindow>('30m');
  const [trendMetric, setTrendMetric] = useState<'rss' | 'cpu'>('rss');

  const coreQuery = useQuery({ queryKey: ['core-info'], queryFn: getCore });
  const telemetryQuery = useQuery({
    queryKey: ['core-telemetry', telemetryWindow],
    queryFn: () => getCoreTelemetry(telemetryWindow),
    refetchInterval: 5000,
    placeholderData: previous => previous,
    retry: false,
  });
  const packagesQuery = usePackages();
  const packages = installed(packagesQuery.data);
  const statistics = useStatistics(range);
  const buckets = statistics.data?.buckets ?? [];
  const logs = useQuery({
    queryKey: ['overview-logs', range, buckets.length && buckets[0].hour],
    queryFn: () => rangeLogs(buckets),
    enabled: buckets.length > 0,
  });
  const agent = packages.find(item => item.Role === 'agent' && item.Enabled);
  const usage = useQuery({
    queryKey: ['model-usage', agent?.ID],
    queryFn: () => (agent ? getAgentModelUsage(agent.ID) : Promise.reject(new Error('no agent'))),
    enabled: agent !== undefined,
    retry: false,
  });

  const problems = packages.filter(hasPackageProblem);
  const runningCount = packages.filter(item => item.Enabled && (item.RuntimeState === 'ACTIVE' || item.State === 'Activated')).length;
  const sleepingCount = packages.filter(item => item.Enabled && item.RuntimeState === 'SUSPENDED').length;

  const { accounts, commands } = useMemo(() => groupStatistics(buckets, packages), [buckets, packages]);
  const labels = buckets.map(bucket =>
    new Date(bucket.hour).toLocaleString(
      undefined,
      range === '24h' ? { hour: '2-digit', minute: '2-digit' } : { month: 'numeric', day: 'numeric' },
    ),
  );
  const inHour = (time: string, hour: string): boolean => {
    const t = new Date(time).getTime();
    const h = new Date(hour).getTime();
    return t >= h && t < h + 3_600_000;
  };
  const countLevels = (levels: readonly string[]): number[] =>
    buckets.map(bucket => (logs.data ?? []).filter(log => levels.includes(log.level) && inHour(log.time, bucket.hour)).length);
  const markers = (logs.data ?? [])
    .filter(log => log.level === 'ERROR' || log.level === 'CRITICAL')
    .flatMap(log => {
      const index = buckets.findIndex(bucket => inHour(log.time, bucket.hour));
      return index < 0 ? [] : [{ index, label: `${new Date(log.time).toLocaleTimeString()} ${log.source}: ${log.message}` }];
    });

  const totalMessages = accounts.reduce((sum, [, n]) => sum + n, 0);
  const incoming = buckets.reduce((sum, b) => sum + b.incoming, 0);
  const outgoing = buckets.reduce((sum, b) => sum + b.outgoing, 0);
  const totalCommands = commands.reduce((sum, [, n]) => sum + n, 0);
  const compact = useMemo(() => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }), []);
  const errors = countLevels(['ERROR', 'CRITICAL']);
  const warnings = countLevels(['WARN']);
  const errorTotal = errors.reduce((a, b) => a + b, 0);
  const warningTotal = warnings.reduce((a, b) => a + b, 0);
  const tokens = (usage.data?.models ?? [])
    .map(model => ({ name: model.model, total: model.input_tokens + model.output_tokens }))
    .sort((a, b) => b.total - a.total);
  const tokenTotal = tokens.reduce((a, b) => a + b.total, 0);
  const maxCommand = Math.max(1, ...commands.map(([, n]) => n));
  const maxTokens = Math.max(1, ...tokens.map(item => item.total));

  const telemetry = telemetryQuery.data ?? null;
  const liveCoreUptime = useLiveUptime(
    telemetry?.core.started_at ?? coreQuery.data?.started_at,
    telemetry?.core.uptime_seconds,
  );
  const packageByID = useMemo(() => new Map(packages.map(item => [item.ID, item])), [packages]);
  const roleShares = useMemo(() => (telemetry ? computeRoleShares(telemetry) : []), [telemetry]);
  const sortedResources = useMemo(() => {
    if (!telemetry) return [];
    return [...(telemetry.components ?? [])]
      .sort((a, b) => {
        if (a.running !== b.running) return Number(b.running) - Number(a.running);
        return resourceSort === 'cpu' ? b.cpu_percent - a.cpu_percent : b.rss_bytes - a.rss_bytes;
      })
      .slice(0, 5);
  }, [telemetry, resourceSort]);

  const roleLabels: Readonly<Record<TelemetryRoleKey, string>> = useMemo(
    () => ({
      core: ui.telemetryRoleCore,
      plugin: ui.filterRolePlugin,
      adapter: ui.filterRoleAdapter,
      agent: ui.filterRoleAgent,
      webui: ui.filterRoleWebUI,
    }),
    [ui],
  );

  const telemetryHistoryLabels = useMemo(() => {
    const history = telemetry?.history ?? [];
    const showSeconds = telemetryWindow === '5m' || history.length <= 60;
    return history.map(point =>
      new Date(point.ts).toLocaleTimeString(
        undefined,
        showSeconds ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : { hour: '2-digit', minute: '2-digit' },
      ),
    );
  }, [telemetry?.history, telemetryWindow]);

  const telemetryTrendSeries = useMemo<readonly Series[]>(() => {
    const history = telemetry?.history ?? [];
    if (history.length === 0) return [];
    if (trendMetric === 'cpu') {
      return [
        { label: ui.telemetryTotalCpu, values: history.map(point => point.total_cpu_percent), color: 'var(--color-accent)' },
        { label: ui.telemetryCoreCpu, values: history.map(point => point.core_cpu_percent), color: 'var(--color-indigo)' },
      ];
    }
    const candidates: readonly { readonly role: TelemetryRoleKey; readonly pick: (point: (typeof history)[number]) => number }[] = [
      { role: 'core', pick: point => bytesToMiB(point.core_rss_bytes) },
      { role: 'plugin', pick: point => bytesToMiB(point.plugin_rss_bytes) },
      { role: 'adapter', pick: point => bytesToMiB(point.adapter_rss_bytes) },
      { role: 'agent', pick: point => bytesToMiB(point.agent_rss_bytes) },
      { role: 'webui', pick: point => bytesToMiB(point.webui_rss_bytes) },
    ];
    return candidates
      .filter(candidate => candidate.role === 'core' || history.some(point => candidate.pick(point) > 0))
      .map(candidate => ({
        label: roleLabels[candidate.role],
        values: history.map(candidate.pick),
        color: roleColors[candidate.role],
      }));
  }, [telemetry?.history, trendMetric, roleLabels, ui]);

  const hostRamShare =
    telemetry && telemetry.host.memory_total_bytes > 0
      ? ((telemetry.total.rss_bytes / telemetry.host.memory_total_bytes) * 100).toFixed(1)
      : null;

  const cardMotion = {
    initial: reduced ? false : { opacity: 0 },
    animate: { opacity: 1 },
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        left={
          problems.length > 0 ? (
            <button
              type="button"
              onClick={() => openComponent(problems[0].ID, 'logs')}
              role="alert"
              className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--color-danger)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_12%,var(--color-surface))] px-3.5 py-1.5 text-xs font-medium text-[var(--color-danger)] transition-all hover:brightness-105"
            >
              <PulseDot tone="danger" size="sm" />
              <AlertTriangle size={14} aria-hidden="true" />
              <span className="truncate">
                {ui.overviewProblems
                  .replace('{names}', problems.slice(0, 2).map(packageName).join('、'))
                  .replace('{count}', String(problems.length))}
              </span>
              <span className="underline">{ui.quickInspect}</span>
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--color-success)_32%,transparent)] bg-[color-mix(in_srgb,var(--color-success)_10%,var(--color-surface))] px-3.5 py-1.5 text-xs font-medium text-[var(--color-success)]">
              <PulseDot tone="running" size="sm" />
              <CheckCircle2 size={14} aria-hidden="true" />
              <span>{ui.runningNormal}</span>
            </div>
          )
        }
        right={
          <TabBar
            variant="pill"
            value={range}
            onValueChange={value => setRange(value as StatisticsRange)}
            aria-label={ui.timeRange}
            items={[
              { value: '24h', label: ui.timeRange24h },
              { value: '7d', label: ui.timeRange7d },
              { value: '30d', label: ui.timeRange30d },
            ]}
          />
        }
      />

      {/* Core 生命体征 Hero 横幅 */}
      <motion.div {...cardMotion} transition={{ duration: 0.24 }}>
        <SpotlightCard className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[color-mix(in_srgb,var(--color-accent)_35%,transparent)] bg-[linear-gradient(135deg,var(--color-accent-soft),transparent)] text-[var(--color-accent)]">
                <Activity size={22} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold tracking-tight text-[var(--color-ink)]">AlonaBot Core</h2>
                  <span className="tabular-nums rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] px-2.5 py-0.5 font-mono text-xs font-semibold text-[var(--color-accent-strong)]">
                    v{(coreQuery.data?.version ?? '—').replace(/^v/, '')}
                  </span>
                  {liveCoreUptime !== null && (
                    <span className="tabular-nums inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] px-2.5 py-0.5 font-mono text-xs font-medium text-[var(--color-success)]">
                      <Timer size={12} aria-hidden="true" /> UP {formatUptime(liveCoreUptime)}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
                  {coreQuery.data?.listen ? `${ui.coreListening}: ${coreQuery.data.listen}` : ui.overviewSubtitle}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" icon={<Puzzle size={14} />} onClick={() => navigate('/components')}>
                {ui.plugins} ({packages.length})
              </Button>
              <Button size="sm" variant="soft" icon={<Wrench size={14} />} onClick={() => navigate('/settings#core-lifecycle')}>
                {ui.coreLifecycleSection}
              </Button>
            </div>
          </div>
        </SpotlightCard>
      </motion.div>

      {(telemetry?.error || telemetryQuery.error) && (
        <p role="alert" className="text-sm text-[var(--color-warning-ink)]">
          {ui.telemetryIssue.replace('{error}', telemetry?.error || telemetryQuery.error?.message || '')}
        </p>
      )}

      {/* 第一排 Bento：遥测可用时展示 4 张资源与脉搏卡 + 多序列历史趋势图，否则展示 4 张实时业务 KPI 卡片 */}
      {telemetry ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {/* 卡 1：全局总开销 + 角色占比堆叠条 */}
            <SpotlightCard className="flex flex-col p-5">
              <div className="flex items-center justify-between text-xs font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">
                <span>{ui.telemetryTotalOverhead}</span>
                <Cpu size={15} className="text-[var(--color-accent)]" aria-hidden="true" />
              </div>
              <div className="mt-2.5 flex items-baseline gap-2.5">
                <AnimatedNumber
                  value={telemetry.total.cpu_percent}
                  format={v => `${v.toFixed(1)}%`}
                  className="font-mono text-3xl font-bold tracking-tight text-[var(--color-ink)]"
                />
                <span className="tabular-nums font-mono text-sm font-semibold text-[var(--color-accent-strong)]">
                  {formatMemoryBytes(telemetry.total.rss_bytes)}
                </span>
              </div>
              <div className="tabular-nums mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--color-ink-muted)]">
                <span>{ui.telemetryProcesses.replace('{count}', String(telemetry.total.process_count))}</span>
                {hostRamShare && <span>· {ui.telemetryHostRamShare.replace('{pct}', hostRamShare)}</span>}
              </div>

              {/* 角色内存占比堆叠条 */}
              <div className="mt-auto pt-3.5">
                <div
                  className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]"
                  role="img"
                  aria-label={ui.telemetryTotalOverhead}
                >
                  {roleShares.map(share => (
                    <div
                      key={share.role}
                      style={{
                        width: `${Math.max(share.rssBytes > 0 ? 3 : 0, share.percent)}%`,
                        background: roleColors[share.role],
                      }}
                      title={`${roleLabels[share.role]}: ${formatMemoryBytes(share.rssBytes)} (${share.percent.toFixed(0)}%)`}
                    />
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--color-ink-muted)]">
                  {roleShares.map(share => (
                    <span key={share.role} className="inline-flex items-center gap-1">
                      <i className="h-2 w-2 rounded-full" style={{ background: roleColors[share.role] }} aria-hidden="true" />
                      <span>{roleLabels[share.role]}</span>
                      <strong className="tabular-nums font-mono font-medium text-[var(--color-ink)]">
                        {formatMemoryBytes(share.rssBytes)}
                      </strong>
                    </span>
                  ))}
                </div>
              </div>
            </SpotlightCard>

            {/* 卡 2：Core 自身开销与实时跳动 Uptime */}
            <SpotlightCard className="flex flex-col p-5" glowTone="indigo">
              <div className="flex items-center justify-between text-xs font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">
                <span>{ui.telemetryCoreProcess}</span>
                <HardDrive size={15} className="text-[var(--color-indigo)]" aria-hidden="true" />
              </div>
              <div className="mt-2.5 flex items-baseline gap-2.5">
                <span className="tabular-nums font-mono text-3xl font-bold tracking-tight text-[var(--color-ink)]">
                  {formatMemoryBytes(telemetry.core.rss_bytes)}
                </span>
                <span className="tabular-nums font-mono text-xs font-semibold text-[var(--color-indigo)]">
                  {telemetry.core.cpu_percent.toFixed(1)}% CPU
                </span>
              </div>
              <div className="tabular-nums mt-2 flex flex-wrap items-center gap-2 font-mono text-[11px] text-[var(--color-ink-muted)]">
                {liveCoreUptime !== null && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[var(--color-ink)]">
                    <Timer size={11} aria-hidden="true" /> UP {formatUptime(liveCoreUptime)}
                  </span>
                )}
                <span>PID {telemetry.core.pid}</span>
                <span>· {telemetry.core.goroutines} go</span>
              </div>
              <div className="mt-auto pt-3">
                <MiniSparkline
                  values={telemetry.history.map(item => bytesToMiB(item.core_rss_bytes))}
                  label={ui.telemetryCoreProcess}
                  tone="indigo"
                  height={28}
                />
                <div className="tabular-nums mt-1.5 flex items-center justify-between font-mono text-[10px] text-[var(--color-ink-muted)]">
                  <span>{telemetry.host.platform}</span>
                  <span>
                    {telemetry.host.cpu_cores}C · {formatMemoryBytes(telemetry.host.memory_total_bytes)}
                  </span>
                </div>
              </div>
            </SpotlightCard>

            {/* 卡 3：组件资源排行（RAM / CPU 切换，点击滑出 Quick Inspector） */}
            <SpotlightCard className="flex flex-col p-5">
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">
                  {ui.telemetryTopComponents}
                </span>
                <TabBar
                  variant="pill"
                  value={resourceSort}
                  onValueChange={v => setResourceSort(v as 'rss' | 'cpu')}
                  aria-label={ui.telemetryTopComponents}
                  items={[
                    { value: 'rss', label: 'RAM' },
                    { value: 'cpu', label: 'CPU' },
                  ]}
                />
              </div>
              <ul className="flex flex-col gap-1">
                {sortedResources.map(item => {
                  const pkg = packageByID.get(item.id);
                  const sleeping = isComponentSleeping(item, pkg?.RuntimeState);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => openComponent(item.id, 'overview')}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-[var(--color-surface-2)]"
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <PulseDot tone={item.running ? 'running' : sleeping ? 'idle' : 'off'} size="sm" />
                          <span className="truncate font-medium text-[var(--color-ink)]">
                            {pkg ? packageName(pkg) : item.id}
                          </span>
                        </span>
                        <span className="tabular-nums shrink-0 font-mono text-[11px] text-[var(--color-ink-muted)]">
                          {sleeping ? (
                            <span className="inline-flex items-center gap-1 text-[var(--color-success)]">
                              <Moon size={11} aria-hidden="true" /> 0 MB
                            </span>
                          ) : item.in_process ? (
                            <span>{ui.telemetryInProcess}</span>
                          ) : (
                            <span>
                              {item.cpu_percent.toFixed(1)}% · {formatMemoryBytes(item.rss_bytes)}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </SpotlightCard>

            {/* 卡 4：系统健康与告警脉搏 */}
            <SpotlightCard className="flex flex-col p-5" glowTone={problems.length > 0 || errorTotal > 0 ? 'danger' : 'success'}>
              <div className="flex items-center justify-between text-xs font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">
                <span>{ui.telemetrySystemPulse}</span>
                <HeartPulse
                  size={15}
                  className={problems.length > 0 || errorTotal > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}
                  aria-hidden="true"
                />
              </div>
              <div className="mt-2.5 flex items-baseline gap-2">
                <AnimatedNumber value={runningCount} className="font-mono text-3xl font-bold tracking-tight text-[var(--color-ink)]" />
                <span className="font-mono text-sm text-[var(--color-ink-muted)]">/ {packages.length}</span>
                <span className="text-xs text-[var(--color-ink-muted)]">{ui.kpiActiveComponents}</span>
              </div>
              <p className="mt-1.5 text-xs text-[var(--color-ink-muted)]">
                {sleepingCount > 0 ? ui.kpiSleepingCount.replace('{count}', String(sleepingCount)) : ui.kpiAllReady}
              </p>
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--color-line)]/65 pt-3 text-xs">
                <span className="tabular-nums font-mono text-[var(--color-ink-muted)]">
                  <strong className={errorTotal > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-ink)]'}>{errorTotal}</strong>{' '}
                  {ui.errors} · <strong className="text-[var(--color-ink)]">{warningTotal}</strong> {ui.warnings}
                </span>
                <Link to="/logs" className="inline-flex items-center gap-1 font-medium text-[var(--color-accent)] hover:underline">
                  {ui.viewLogs} <ArrowRight size={12} aria-hidden="true" />
                </Link>
              </div>
            </SpotlightCard>
          </div>

          {/* 30m 内存环形历史多序列 ECharts 趋势图 */}
          <SpotlightCard className="p-5">
            <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-semibold text-[var(--color-ink)]">{ui.telemetryResourceTrend}</h3>
                <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-ink-muted)]">
                  {telemetryTrendSeries.map(item => (
                    <span key={item.label} className="inline-flex items-center gap-1.5">
                      <i className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} aria-hidden="true" />
                      <span>{item.label}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <TabBar
                  variant="pill"
                  value={trendMetric}
                  onValueChange={v => setTrendMetric(v as 'rss' | 'cpu')}
                  aria-label={ui.telemetryResourceTrend}
                  items={[
                    { value: 'rss', label: 'RAM' },
                    { value: 'cpu', label: 'CPU' },
                  ]}
                />
                <TabBar
                  variant="pill"
                  value={telemetryWindow}
                  onValueChange={v => setTelemetryWindow(v as TelemetryWindow)}
                  aria-label={ui.timeRange}
                  items={[
                    { value: '5m', label: '5m' },
                    { value: '15m', label: '15m' },
                    { value: '30m', label: '30m' },
                  ]}
                />
              </div>
            </header>
            {telemetryHistoryLabels.length === 0 ? (
              <EmptyState title={ui.telemetryCollecting} />
            ) : (
              <ResourceTrendChart
                labels={telemetryHistoryLabels}
                series={telemetryTrendSeries}
                unit={trendMetric === 'cpu' ? 'percent' : 'mib'}
                stacked={trendMetric === 'rss'}
                ariaLabel={ui.telemetryResourceTrend}
              />
            )}
          </SpotlightCard>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SpotlightCard className="p-5" glowTone="success">
            <div className="flex items-center justify-between text-[11px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">
              <span>{ui.kpiActiveComponents}</span>
              <Puzzle size={15} className="text-[var(--color-success)]" />
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <AnimatedNumber value={runningCount} className="font-mono text-3xl font-bold tracking-tight text-[var(--color-ink)]" />
              <span className="font-mono text-sm text-[var(--color-ink-muted)]">/ {packages.length}</span>
            </div>
            <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
              {sleepingCount > 0 ? ui.kpiSleepingCount.replace('{count}', String(sleepingCount)) : ui.kpiAllReady}
            </p>
          </SpotlightCard>

          <SpotlightCard className="p-5" glowTone="accent">
            <div className="flex items-center justify-between text-[11px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">
              <span>{ui.chartMessageVolume}</span>
              <MessageSquare size={15} className="text-[var(--color-accent)]" />
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <AnimatedNumber value={incoming + outgoing} format={v => compact.format(v)} className="font-mono text-3xl font-bold tracking-tight text-[var(--color-ink)]" />
              <span className="text-xs text-[var(--color-ink-muted)]">{ui.messagesUnit}</span>
            </div>
            <div className="mt-2">
              <MiniSparkline values={buckets.map(b => b.incoming + b.outgoing)} label={ui.chartMessageVolume} height={30} />
            </div>
          </SpotlightCard>

          <SpotlightCard className="p-5" glowTone="indigo">
            <div className="flex items-center justify-between text-[11px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">
              <span>{ui.commandTriggers}</span>
              <Terminal size={15} className="text-[var(--color-indigo)]" />
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <AnimatedNumber value={totalCommands} format={v => compact.format(v)} className="font-mono text-3xl font-bold tracking-tight text-[var(--color-ink)]" />
              <span className="text-xs text-[var(--color-ink-muted)]">{commands.length} {ui.plugins}</span>
            </div>
            <div className="mt-2">
              <MiniSparkline
                values={buckets.map(b => b.commands.reduce((s, c) => s + c.count, 0))}
                label={ui.commandTriggers}
                tone="indigo"
                height={30}
              />
            </div>
          </SpotlightCard>

          <SpotlightCard className="p-5" glowTone={errorTotal > 0 ? 'danger' : 'accent'}>
            <div className="flex items-center justify-between text-[11px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">
              <span>{agent ? ui.chartAgentUsage : ui.chartErrorsWarnings}</span>
              <Sparkles size={15} className={errorTotal > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-accent)]'} />
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              {agent && !usage.isError ? (
                <>
                  <AnimatedNumber value={tokenTotal} format={v => compact.format(v)} className="font-mono text-3xl font-bold tracking-tight text-[var(--color-ink)]" />
                  <span className="text-xs text-[var(--color-ink-muted)]">tokens</span>
                </>
              ) : (
                <>
                  <AnimatedNumber value={errorTotal} className="font-mono text-3xl font-bold tracking-tight text-[var(--color-ink)]" />
                  <span className="text-xs text-[var(--color-ink-muted)]">{ui.errors} · {warningTotal} {ui.warnings}</span>
                </>
              )}
            </div>
            <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
              <Link to={agent ? '/models' : '/logs'} className="inline-flex items-center gap-1 font-medium text-[var(--color-accent)] hover:underline">
                {agent ? ui.models : ui.viewLogs} <ArrowRight size={12} />
              </Link>
            </p>
          </SpotlightCard>
        </div>
      )}

      {/* 第二排：业务图表 Bento 网格 */}
      {statistics.isError ? (
        <SpotlightCard>
          <EmptyState tone="error" icon={<AlertTriangle size={22} />} title={ui.statisticsUnavailable} description={statistics.error.message} />
        </SpotlightCard>
      ) : !statistics.data ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton height={300} radius={18} />
          <Skeleton height={300} radius={18} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-refreshing={statistics.isFetching || undefined}>
          <SpotlightCard className="p-5 lg:col-span-2">
            <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">{ui.chartMessageVolume}</h3>
              <div className="flex items-center gap-4 text-xs text-[var(--color-ink-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <i className="h-2.5 w-2.5 rounded-full bg-[var(--color-accent)]" />
                  {ui.incoming}
                  <strong className="tabular-nums font-mono text-[var(--color-ink)]">{incoming.toLocaleString()}</strong>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="h-2.5 w-2.5 rounded-full bg-[var(--color-indigo)]" />
                  {ui.outgoing}
                  <strong className="tabular-nums font-mono text-[var(--color-ink)]">{outgoing.toLocaleString()}</strong>
                </span>
              </div>
            </header>
            <AreaChart
              labels={labels}
              markers={markers}
              series={[
                { label: ui.incoming, values: buckets.map(b => b.incoming), color: chartPalette[0] },
                { label: ui.outgoing, values: buckets.map(b => b.outgoing), color: chartPalette[1] },
              ]}
            />
          </SpotlightCard>

          <SpotlightCard className="p-5">
            <header className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">{ui.chartAccounts}</h3>
            </header>
            {totalMessages === 0 ? (
              <EmptyState
                title={ui.noMessages}
                description={
                  <Link to="/accounts">
                    {ui.addAccount} <ArrowRight size={12} />
                  </Link>
                }
              />
            ) : (
              <div className="flex flex-col items-center gap-5 sm:flex-row">
                <Donut
                  total={compact.format(totalMessages)}
                  totalLabel={ui.messagesUnit}
                  parts={accounts.slice(0, 5).map(([name, value], i) => ({ label: name, value, color: chartPalette[i % chartPalette.length] }))}
                />
                <ul className="flex w-full flex-1 flex-col gap-2.5 text-xs">
                  {accounts.slice(0, 5).map(([name, value], i) => (
                    <li key={name} className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: chartPalette[i % chartPalette.length] }} />
                        <span className="truncate font-medium text-[var(--color-ink)]">{name}</span>
                      </span>
                      <strong className="tabular-nums font-mono text-[var(--color-ink-muted)]">
                        {Math.round((value / totalMessages) * 100)}%
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </SpotlightCard>

          <SpotlightCard className="p-5">
            <header className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">{ui.chartTopPlugins}</h3>
              <span className="text-xs text-[var(--color-ink-muted)]">{ui.commandTriggers}</span>
            </header>
            {commands.length === 0 ? (
              <EmptyState title={ui.noCommands} />
            ) : (
              <ul className="flex flex-col gap-2.5">
                {commands.slice(0, 6).map(([id, value]) => {
                  const pkg = packages.find(item => item.ID === id);
                  const pct = Math.max(4, (value / maxCommand) * 100);
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => openComponent(id, 'overview')}
                        className="group flex w-full items-center gap-3 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-[var(--color-surface-2)]/70"
                      >
                        <span className="w-28 shrink-0 truncate text-xs font-medium text-[var(--color-ink)] group-hover:text-[var(--color-accent)]">
                          {pkg ? packageName(pkg) : packagesQuery.isPending ? <Skeleton width={72} height={12} /> : id}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-accent),var(--color-cyan))] transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <strong className="tabular-nums w-12 shrink-0 text-right font-mono text-xs text-[var(--color-ink-muted)]">
                          {value.toLocaleString()}
                        </strong>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </SpotlightCard>

          <SpotlightCard className="p-5" glowTone={errorTotal > 0 ? 'danger' : 'warning'}>
            <header className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">{ui.chartErrorsWarnings}</h3>
              <div className="flex items-center gap-3 text-xs text-[var(--color-ink-muted)]">
                <span className="inline-flex items-center gap-1">
                  <i className="h-2 w-2 rounded-full bg-[var(--color-danger)]" />
                  {ui.errors} <strong className="tabular-nums font-mono text-[var(--color-ink)]">{errorTotal}</strong>
                </span>
                <span className="inline-flex items-center gap-1">
                  <i className="h-2 w-2 rounded-full bg-[var(--color-warning)]" />
                  {ui.warnings} <strong className="tabular-nums font-mono text-[var(--color-ink)]">{warningTotal}</strong>
                </span>
              </div>
            </header>
            <StackedBars
              labels={labels}
              series={[
                { label: ui.warnings, values: warnings, color: 'var(--color-warning)' },
                { label: ui.errors, values: errors, color: 'var(--color-danger)' },
              ]}
            />
          </SpotlightCard>

          {agent && !usage.isError && (
            <SpotlightCard className="p-5" glowTone="indigo">
              <header className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--color-ink)]">{ui.chartAgentUsage}</h3>
                <strong className="tabular-nums font-mono text-xs font-semibold text-[var(--color-indigo)]">
                  {compact.format(tokenTotal)} tokens
                </strong>
              </header>
              {tokens.length === 0 ? (
                <EmptyState
                  title={ui.noUsageToday}
                  description={
                    <Link to="/models">
                      {ui.models} <ArrowRight size={12} />
                    </Link>
                  }
                />
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {tokens.slice(0, 6).map(item => (
                    <li key={item.name} className="flex items-center gap-3">
                      <span className="w-32 shrink-0 truncate font-mono text-xs text-[var(--color-ink)]">{item.name}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-indigo),var(--color-accent))]"
                          style={{ width: `${Math.max(4, (item.total / maxTokens) * 100)}%` }}
                        />
                      </div>
                      <strong className="tabular-nums w-12 shrink-0 text-right font-mono text-xs text-[var(--color-ink-muted)]">
                        {compact.format(item.total)}
                      </strong>
                    </li>
                  ))}
                </ul>
              )}
            </SpotlightCard>
          )}
        </div>
      )}
    </div>
  );
}
