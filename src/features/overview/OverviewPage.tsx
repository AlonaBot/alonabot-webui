import { useMemo, useState, type JSX } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { getAgentModelUsage } from '../../api/agent';
import type { StatisticsRange } from '../../api/webui';
import { useUI } from '../../i18n/UI';
import { hasPackageProblem } from '../../pages/packageState';
import { groupStatistics, rangeLogs } from '../../pages/statistics';
import { installed, usePackages } from '../../queries/packages';
import { useStatistics } from '../../queries/plugins';
import { PageHeader } from '../../shell/PageHeader';
import { Link } from '../../shell/router';
import { EmptyState, Skeleton } from '../../ui/EmptyState';
import { TabBar } from '../../ui/Tabs';
import { packageName } from '../plugins/usePackageActions';
import { AreaChart, Donut, StackedBars } from './Charts';
import styles from './Overview.module.css';

const palette = ['var(--color-accent)', 'var(--color-chart-2)', 'color-mix(in srgb, var(--color-ink-muted) 70%, transparent)', 'var(--color-success)', 'var(--color-warning)'];

/** 总览：组件故障提示、消息量、各账号份额、热门插件、错误与警告和 Agent 当天用量。 */
export function OverviewPage(): JSX.Element {
  const ui = useUI();
  const [range, setRange] = useState<StatisticsRange>('24h');
  const packagesQuery = usePackages();
  const packages = installed(packagesQuery.data);
  const statistics = useStatistics(range);
  const buckets = statistics.data?.buckets ?? [];
  const logs = useQuery({ queryKey: ['overview-logs', range, buckets.length && buckets[0].hour], queryFn: () => rangeLogs(buckets), enabled: buckets.length > 0 });
  const agent = packages.find(item => item.Role === 'agent' && item.Enabled);
  const usage = useQuery({ queryKey: ['model-usage', agent?.ID], queryFn: () => getAgentModelUsage(agent!.ID), enabled: !!agent, retry: false });
  const problems = packages.filter(hasPackageProblem);

  const { accounts, commands } = useMemo(() => groupStatistics(buckets, packages), [buckets, packages]);
  const labels = buckets.map(bucket => new Date(bucket.hour).toLocaleString(undefined, range === '24h' ? { hour: '2-digit', minute: '2-digit' } : { month: 'numeric', day: 'numeric' }));
  const inHour = (time: string, hour: string) => { const t = new Date(time).getTime(); const h = new Date(hour).getTime(); return t >= h && t < h + 3_600_000; };
  const count = (levels: string[]) => buckets.map(bucket => (logs.data ?? []).filter(log => levels.includes(log.level) && inHour(log.time, bucket.hour)).length);
  const markers = (logs.data ?? []).filter(log => log.level === 'ERROR' || log.level === 'CRITICAL').flatMap(log => {
    const index = buckets.findIndex(bucket => inHour(log.time, bucket.hour));
    return index < 0 ? [] : [{ index, label: `${new Date(log.time).toLocaleTimeString()} ${log.source}: ${log.message}` }];
  });
  const totalMessages = accounts.reduce((sum, [, n]) => sum + n, 0);
  const incoming = buckets.reduce((sum, b) => sum + b.incoming, 0);
  const outgoing = buckets.reduce((sum, b) => sum + b.outgoing, 0);
  const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  const errors = count(['ERROR', 'CRITICAL']);
  const warnings = count(['WARN']);
  const tokens = (usage.data?.models ?? []).map(model => ({ name: model.model, total: model.input_tokens + model.output_tokens })).sort((a, b) => b.total - a.total);
  const maxCommand = Math.max(1, ...commands.map(([, n]) => n));
  const maxTokens = Math.max(1, ...tokens.map(item => item.total));

  return <>
    <PageHeader
      left={problems.length > 0
        ? <div className={styles.alert} role="alert"><AlertTriangle size={18} /><span>{ui.overviewProblems.replace('{names}', problems.slice(0, 2).map(packageName).join('、')).replace('{count}', String(problems.length))}</span><Link to="/logs" className={styles.alertLink}>{ui.viewLogs}</Link></div>
        : <div className={styles.ok}><CheckCircle2 size={18} /><span>{ui.runningNormal}</span></div>}
      right={<TabBar variant="pill" value={range} onValueChange={value => setRange(value as StatisticsRange)} aria-label={ui.timeRange}
        items={[{ value: '24h', label: ui.timeRange24h }, { value: '7d', label: ui.timeRange7d }, { value: '30d', label: ui.timeRange30d }]} />} />

    {statistics.isError ? <EmptyState tone="error" icon={<AlertTriangle size={22} />} title={ui.statisticsUnavailable} description={statistics.error.message} />
      : !statistics.data ? <div className={styles.grid}><Skeleton height={320} /><Skeleton height={320} /></div>
      : <div className={styles.grid} data-refreshing={statistics.isFetching || undefined}>
        <section className={styles.card} data-span="wide">
          <header><h2>{ui.chartMessageVolume}</h2><div className={styles.legend}>
            <span><i style={{ background: palette[0] }} />{ui.incoming}<strong>{incoming.toLocaleString()}</strong></span>
            <span><i style={{ background: palette[1] }} />{ui.outgoing}<strong>{outgoing.toLocaleString()}</strong></span>
          </div></header>
          <AreaChart labels={labels} markers={markers} series={[{ label: ui.incoming, values: buckets.map(b => b.incoming), color: palette[0] }, { label: ui.outgoing, values: buckets.map(b => b.outgoing), color: palette[1] }]} />
        </section>

        <section className={styles.card}>
          <header><h2>{ui.chartAccounts}</h2></header>
          {totalMessages === 0 ? <EmptyState title={ui.noMessages} description={<Link to="/accounts">{ui.addAccount}<ArrowRight size={12} /></Link>} />
            : <div className={styles.accounts}>
              <Donut total={compact.format(totalMessages)} totalLabel={ui.messagesUnit} parts={accounts.slice(0, 5).map(([name, value], i) => ({ label: name, value, color: palette[i] }))} />
              <ul>{accounts.slice(0, 5).map(([name, value], i) => <li key={name}><i style={{ background: palette[i] }} /><span>{name}</span><strong>{Math.round((value / totalMessages) * 100)}%</strong></li>)}</ul>
            </div>}
        </section>

        <section className={styles.card}>
          <header><h2>{ui.chartTopPlugins}</h2><span className={styles.caption}>{ui.commandTriggers}</span></header>
          {commands.length === 0 ? <EmptyState title={ui.noCommands} />
            : <ul className={styles.bars}>{commands.slice(0, 6).map(([id, value]) => {
              const pkg = packages.find(item => item.ID === id);
              return <li key={id}><span>{pkg ? packageName(pkg) : packagesQuery.isPending ? <Skeleton width={72} height={12} /> : id}</span><div><i style={{ width: `${(value / maxCommand) * 100}%` }} /></div><strong>{value.toLocaleString()}</strong></li>;
            })}</ul>}
        </section>

        <section className={styles.card}>
          <header><h2>{ui.chartErrorsWarnings}</h2></header>
          <StackedBars labels={labels} series={[{ label: ui.warnings, values: warnings, color: 'var(--color-yellow)' }, { label: ui.errors, values: errors, color: 'var(--color-danger)' }]} />
          <div className={styles.legend}>
            <span><i style={{ background: 'var(--color-danger)' }} />{ui.errors}<strong>{errors.reduce((a, b) => a + b, 0)}</strong></span>
            <span><i style={{ background: 'var(--color-yellow)' }} />{ui.warnings}<strong>{warnings.reduce((a, b) => a + b, 0)}</strong></span>
          </div>
        </section>

        {agent && !usage.isError && <section className={styles.card}>
          <header><h2>{ui.chartAgentUsage}</h2><strong className={styles.total}>{compact.format(tokens.reduce((a, b) => a + b.total, 0))} tokens</strong></header>
          {tokens.length === 0 ? <EmptyState title={ui.noUsageToday} description={<Link to="/models">{ui.models}<ArrowRight size={12} /></Link>} />
            : <ul className={styles.bars}>{tokens.slice(0, 6).map(item => <li key={item.name}><span>{item.name}</span><div><i style={{ width: `${(item.total / maxTokens) * 100}%` }} /></div><strong>{compact.format(item.total)}</strong></li>)}</ul>}
        </section>}
      </div>}
  </>;
}
