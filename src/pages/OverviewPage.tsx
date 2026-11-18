import { useContext, useEffect, useMemo, useState, type JSX } from 'react';
import { AlertTriangle, CheckCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { listPackages, type CoreInfo, type Package } from '../api/admin';
import { useUI } from '../i18n/UI';
import { hasPackageProblem } from './packageState';
import { routes } from '../routes';
import { navigate } from '../shell/router';
import { SearchContext, type SearchItem } from '../shell/search';

export interface OverviewPageProps {
  core: CoreInfo;
}

type TimeRange = '24h' | '7d' | '30d';

/** OverviewPage 展示真实 Core 信息、组件故障概况与统计空态。 */
export function OverviewPage(props: { core: CoreInfo }): JSX.Element {
  const { core } = props;
  const ui = useUI();
  const { register } = useContext(SearchContext);

  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const pkgs = await listPackages();
      setPackages(pkgs);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
  }, [register, ui]);

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

      {/* 四组图表卡片区 */}
      <div className="overview-charts-grid">
        {/* 卡片 1：消息量 */}
        <section className="overview-chart-card" aria-labelledby="chart-message-title">
          <div className="chart-card-header">
            <h2 id="chart-message-title" className="chart-card-title">
              {ui.chartMessageVolume}
            </h2>
          </div>
          <div className="chart-empty-container">
            <div className="chart-empty-placeholder">
              <span className="chart-empty-title">{ui.noStatsData}</span>
              
            </div>
          </div>
        </section>

        {/* 卡片 2：各账号 */}
        <section className="overview-chart-card" aria-labelledby="chart-accounts-title">
          <div className="chart-card-header">
            <h2 id="chart-accounts-title" className="chart-card-title">
              {ui.chartAccounts}
            </h2>
          </div>
          <div className="chart-empty-container">
            <div className="chart-empty-placeholder">
              <span className="chart-empty-title">{ui.noStatsData}</span>
              
            </div>
          </div>
        </section>

        {/* 卡片 3：热门插件 */}
        <section className="overview-chart-card" aria-labelledby="chart-plugins-title">
          <div className="chart-card-header">
            <h2 id="chart-plugins-title" className="chart-card-title">
              {ui.chartTopPlugins}
            </h2>
          </div>
          <div className="chart-empty-container">
            <div className="chart-empty-placeholder">
              <span className="chart-empty-title">{ui.noStatsData}</span>
              
            </div>
          </div>
        </section>

        {/* 卡片 4：错误与警告 */}
        <section className="overview-chart-card" aria-labelledby="chart-errors-title">
          <div className="chart-card-header">
            <h2 id="chart-errors-title" className="chart-card-title">
              {ui.chartErrorsWarnings}
            </h2>
            <div className="chart-legend-row">
              <span className="chart-legend-badge is-warning">
                <span className="legend-dot is-warning" />
                {ui.warningLabel}
              </span>
              <span className="chart-legend-badge is-critical">
                <span className="legend-dot is-critical" />
                {ui.criticalLabel}
              </span>
            </div>
          </div>
          <div className="chart-empty-container">
            <div className="chart-empty-placeholder">
              <span className="chart-empty-title">{ui.noStatsData}</span>
              
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
