import { useContext, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { AlertTriangle, CheckCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { listPackages, type CoreInfo, type Package } from '../api/admin';
import { getStatistics, type Statistics } from '../api/webui';
import { StatisticsCharts } from '../components/StatisticsCharts';
import { rangeLogs, type LogRecord } from './statistics';
import { useUI } from '../i18n/UI';
import { hasPackageProblem } from './packageState';
import { routes } from '../routes';
import { navigate } from '../shell/router';
import { SearchContext, type SearchItem } from '../shell/search';

export interface OverviewPageProps {
  core: CoreInfo;
}

type TimeRange = '24h' | '7d' | '30d';

/** OverviewPage 展示 Core、组件故障与后台采集的统计。 */
export function OverviewPage(props: { core: CoreInfo }): JSX.Element {
  const { core } = props;
  const ui = useUI();
  const { register } = useContext(SearchContext);

  const loadSequence = useRef(0);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [logError, setLogError] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');

  const loadData = async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError(null);
    setStatistics(null);
    try {
      const [pkgs, stats] = await Promise.all([listPackages(), getStatistics(timeRange)]);
      if (sequence !== loadSequence.current) return;
      setPackages(pkgs);
      setStatistics(stats);
      setLogError('');
      try { const rows = await rangeLogs(stats.buckets); if (sequence === loadSequence.current) setLogs(rows); } catch (err) { if (sequence === loadSequence.current) { setLogs([]); setLogError(String(err)); } }
    } catch (error) {
      if (sequence === loadSequence.current) setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    return () => { loadSequence.current++; };
  }, [timeRange]);

  // 注册页面搜索项，离开时注销
  useEffect(() => {
    const searchItems: SearchItem[] = [
      {
        id: 'overview-refresh',
        title: `${ui.overview}: ${ui.refresh}`,
        section: ui.searchActions,
        keywords: ['overview', 'refresh', 'reload', 'core'],
        run: () => {
          loadData();
        },
      },
    ];
    return register(searchItems);
  }, [register, ui, timeRange]);

  // 只统计已确认的故障，启动和停止中的过渡阶段保留实际状态。
  const problematicPackages = useMemo(() => {
    return packages.filter(hasPackageProblem);
  }, [packages]);

  const hasLogsRoute = routes.some(r => r.id === 'logs');

  return (
    <div className="overview-page">
      {/* 状态行与时间范围切换 */}
      <div className="overview-topbar">
        <div className="overview-status-container">
          {error ? <p role="alert">{error}</p> : loading ? <p role="status">{ui.loading}</p> : problematicPackages.length > 0 ? (
            <div className="overview-alert-banner" role="alert">
              <AlertTriangle className="overview-alert-icon" size={18} />
              <span className="overview-alert-text">
                {ui.degradedWarning.replace('{count}', String(problematicPackages.length))}
                {problematicPackages.length <= 2
                  ? ` (${problematicPackages.map(p => p.ID).join(', ')})`
                  : ''}
              </span>
              {hasLogsRoute ? (
                <button
                  type="button"
                  className="overview-alert-link"
                  onClick={() => navigate('/logs')}
                >
                  {ui.viewLogs}
                  <ExternalLink size={12} />
                </button>
              ) : null}
            </div>
          ) : (
            <div className="overview-normal-banner">
              <CheckCircle className="overview-normal-icon" size={18} />
              <span className="overview-normal-text">{ui.runningNormal}</span>
            </div>
          )}
        </div>

        <div className="overview-actions-row">
          <div className="time-range-pills" role="radiogroup" aria-label={ui.timeRange}>
            <button
              type="button"
              className={`time-range-pill ${timeRange === '24h' ? 'is-active' : ''}`}
              onClick={() => setTimeRange('24h')}
              aria-checked={timeRange === '24h'}
              role="radio"
            >
              {ui.timeRange24h}
            </button>
            <button
              type="button"
              className={`time-range-pill ${timeRange === '7d' ? 'is-active' : ''}`}
              onClick={() => setTimeRange('7d')}
              aria-checked={timeRange === '7d'}
              role="radio"
            >
              {ui.timeRange7d}
            </button>
            <button
              type="button"
              className={`time-range-pill ${timeRange === '30d' ? 'is-active' : ''}`}
              onClick={() => setTimeRange('30d')}
              aria-checked={timeRange === '30d'}
              role="radio"
            >
              {ui.timeRange30d}
            </button>
          </div>

          <button
            type="button"
            className="overview-refresh-button"
            onClick={loadData}
            disabled={loading}
            title={ui.refresh}
            aria-label={ui.refresh}
          >
            <RefreshCw size={15} className={loading ? 'is-spinning' : ''} />
          </button>
        </div>
      </div>

      {/* Core 基本信息横幅 */}
      <div className="overview-core-banner">
        <div className="core-info-item">
          <span className="core-info-label">{ui.coreVersion}</span>
          <span className="core-info-value font-mono">{core.version}</span>
        </div>
        <div className="core-info-divider" />
        <div className="core-info-item">
          <span className="core-info-label">{ui.listenAddress}</span>
          <span className="core-info-value font-mono">{core.listen}</span>
        </div>
      </div>

      {statistics && <StatisticsCharts statistics={statistics} packages={packages} logs={logs} logError={logError} />}

    </div>
  );
}
