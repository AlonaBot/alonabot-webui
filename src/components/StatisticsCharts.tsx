import { useMemo } from 'react';
import type { Statistics } from '../api/webui';
import type { Package } from '../api/admin';
import { hasPackageProblem } from '../pages/packageState';
import { useUI } from '../i18n/UI';
import { groupStatistics, type LogRecord } from '../pages/statistics';

function Series({ hours, series, faults = [] }: { hours: string[]; series: { label: string; values: number[]; color: string }[]; faults?: LogRecord[] }) {
  const max = Math.max(1, ...series.flatMap(item => item.values));
  const x = (i: number) => 38 + i * 592 / Math.max(1, hours.length - 1);
  const y = (value: number) => 198 - value * 166 / max;
  return <div className="chart-series"><div className="chart-legend">{series.map(item => <span key={item.label}><i style={{ background: item.color }} />{item.label} <strong>{item.values.reduce((a, b) => a + b, 0).toLocaleString()}</strong></span>)}</div>
    <svg viewBox="0 0 652 240" role="img" aria-label={series.map(item => item.label).join(', ')}>
      {[0, .5, 1].map(fraction => <g key={fraction}><line x1="38" x2="630" y1={y(max * fraction)} y2={y(max * fraction)} className="chart-grid" /><text x="30" y={y(max * fraction) + 4} textAnchor="end">{Math.round(max * fraction)}</text></g>)}
      {series.map(item => <polyline key={item.label} fill="none" stroke={item.color} strokeWidth="2.5" points={item.values.map((value, i) => `${x(i)},${y(value)}`).join(' ')} />)}
      {hours.map((hour, i) => i % Math.max(1, Math.floor(hours.length / 4)) === 0 ? <text key={hour} x={x(i)} y="225" textAnchor="middle">{new Date(hour).toLocaleString(undefined, hours.length > 25 ? { month: 'numeric', day: 'numeric' } : { hour: '2-digit', minute: '2-digit' })}</text> : null)}
      {faults.map((fault, i) => { const index = hours.findIndex(hour => new Date(fault.time).getTime() >= new Date(hour).getTime() && new Date(fault.time).getTime() < new Date(hour).getTime() + 3600000); return index < 0 ? null : <g key={i}><title>{`${fault.time} ${fault.source}: ${fault.message}`}</title><line x1={x(index)} x2={x(index)} y1="22" y2="198" stroke="var(--color-danger)" strokeDasharray="3 3" /><circle cx={x(index)} cy="22" r="4" fill="var(--color-danger)" /></g>; })}
    </svg>
    <details className="chart-values"><summary>{series.map(item => item.label).join(' / ')}</summary><div className="data-table-wrap"><table className="data-table"><tbody>{hours.map((hour, i) => <tr key={hour}><th>{hour}</th>{series.map(item => <td key={item.label}>{item.values[i]}</td>)}</tr>)}</tbody></table></div></details>
  </div>;
}

export function StatisticsCharts({ statistics, packages, logs, logError }: { statistics: Statistics; packages: Package[]; logs: LogRecord[]; logError?: string }) {
  const ui = useUI();
  const { accounts, commands } = useMemo(() => groupStatistics(statistics.buckets, packages), [statistics, packages]);
  const hours = statistics.buckets.map(bucket => bucket.hour);
  const counts = (levels: string[]) => hours.map(hour => logs.filter(log => levels.includes(log.level) && new Date(log.time).getTime() >= new Date(hour).getTime() && new Date(log.time).getTime() < new Date(hour).getTime() + 3600000).length);
  const total = accounts.reduce((sum, [, n]) => sum + n, 0);
  const colors = ['var(--color-accent)', 'var(--color-chart-2)', 'var(--color-success)', 'var(--color-warning)', 'var(--color-critical)'];
  let accumulated = 0;
  return <><div className="overview-charts-grid statistics-grid">
    <section className="overview-chart-card stats-messages"><h2 className="chart-card-title">{ui.chartMessageVolume}</h2><Series hours={hours} series={[{ label: ui.incoming, values: statistics.buckets.map(b => b.incoming), color: colors[0] }, { label: ui.outgoing, values: statistics.buckets.map(b => b.outgoing), color: colors[1] }]} faults={[...logs.filter(log => log.level === 'ERROR' || log.level === 'CRITICAL'), ...packages.filter(hasPackageProblem).map(pkg => ({ time: new Date().toISOString(), source: pkg.ID, level: 'ERROR', message: `${ui.status}: ${pkg.State}` }))]} /></section>
    <section className="overview-chart-card stats-accounts"><h2 className="chart-card-title">{ui.chartAccounts}</h2>{total === 0 ? <p className="data-empty">{ui.noMessages}</p> : <div className="account-chart"><svg viewBox="0 0 160 160" role="img" aria-label={`${ui.chartAccounts}: ${total}`}><circle cx="80" cy="80" r="60" fill="none" stroke="var(--color-line)" strokeWidth="16" />{accounts.map(([name, count], i) => { const start = accumulated; accumulated += count / total; return <circle key={name} cx="80" cy="80" r="60" fill="none" stroke={colors[i % colors.length]} strokeWidth="16" pathLength="100" strokeDasharray={`${count / total * 100} ${100 - count / total * 100}`} strokeDashoffset={-start * 100} transform="rotate(-90 80 80)"><title>{name}: {count}</title></circle>; })}<text x="80" y="85" textAnchor="middle" className="chart-total">{total.toLocaleString()}</text></svg><div className="account-legend">{accounts.map(([name, count], i) => <div key={name}><i style={{ background: colors[i % colors.length] }} /><span>{name}</span><strong>{(count / total * 100).toFixed(1)}%</strong></div>)}</div></div>}</section>
    <section className="overview-chart-card stats-plugins"><h2 className="chart-card-title">{ui.chartTopPlugins}</h2>{commands.length === 0 ? <p className="data-empty">{ui.noCommands}</p> : <div className="command-bars">{commands.map(([name, count]) => <div key={name}><span title={name}>{name}</span><meter min={0} max={commands[0][1]} value={count} /><strong>{count}</strong></div>)}</div>}</section>
    <section className="overview-chart-card stats-errors"><h2 className="chart-card-title">{ui.chartErrorsWarnings}</h2>{logError && <pre role="alert" className="form-error">{logError}</pre>}<Series hours={hours} series={[{ label: ui.errors, values: counts(['ERROR', 'CRITICAL']), color: 'var(--color-danger)' }, { label: ui.warnings, values: counts(['WARNING', 'WARN']), color: 'var(--color-warning)' }, { label: ui.sendErrors, values: statistics.buckets.map(b => b.send_errors), color: colors[4] }, { label: ui.commandErrors, values: statistics.buckets.map(b => b.commands.filter(c => c.result === 'error').reduce((sum, c) => sum + c.count, 0)), color: colors[1] }]} /></section>
  </div><p className="muted stats-since">{ui.observedSince}: {statistics.observed_since} ({statistics.timezone})</p></>;
}
