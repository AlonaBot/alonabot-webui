import { useContext, useEffect, useState, type JSX } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Calendar,
  ChevronRight,
  Database,
  FileText,
  History,
  MoreHorizontal,
  Package as PackageIcon,
  Power,
  RefreshCw,
  RotateCcw,
  RotateCw,
  ShieldAlert,
  Sliders,
  Trash2,
  X,
} from 'lucide-react';
import {
  AdminAPIError,
  changePackage,
  getLogLevels,
  isConfirmationError,
  listPackages,
  listGenerations,
  packageIconURL,
  rollbackPackage,
  setPackageLogLevel,
  uninstallPackage,
  getAllowedInstances,
  setAllowedInstances,
  listInstances,
  getPluginConfig,
  patchPluginConfig,
  type Generation,
  type LogLevels,
  type Package,
  type SourceLogLevel,
  type AllowedInstances,
  type AdapterInstance,
  type ConfigSnapshot,
  listCoreOptions,
  resolveCoreOptions,
  type ConfigOption,
} from '../api/admin';
import { ChangelogDialog } from '../components/ChangelogDialog';
import { StoragePanel } from './StoragePanel';
import { ConversationsPanel } from './ConversationsPanel';
import { DatabasePanel } from './DatabasePanel';
import { useUI } from '../i18n/UI';
import { Link, navigate } from '../shell/router';
import { SearchContext } from '../shell/search';
import { PluginConfigPanel } from './PluginConfigPanel';
import { PluginJobsPanel } from './PluginJobsPanel';
import { useUISettings } from '../shell/settings';
import { rawConfigPatch } from './rawConfig';
import { PluginPageFrame } from '../components/PluginPageFrame';

/** PluginDetailPage 展示保留代次、回退确认及组件高级设置。 */
export function PluginDetailPage(props: {
  id: string;
  generations?: readonly Generation[];
}): JSX.Element {
  const { id, generations } = props;
  const ui = useUI();
  const { locale } = useUISettings();
  const { register } = useContext(SearchContext);

  const [showChangelog, setShowChangelog] = useState(false);
  const [autoContent, setAutoContent] = useState(true);
  const [pkg, setPkg] = useState<Package | null>(null);
  const [loading, setLoading] = useState(true);
  const [retained, setRetained] = useState<readonly Generation[]>([]);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationQuery, setGenerationQuery] = useState('');
  const [confirming, setConfirming] = useState(false);
  const generationList = (generations ?? retained).filter(generation =>
    `${generation.id} ${generation.version}`.toLowerCase().includes(generationQuery.toLowerCase()),
  );
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'config' | `page:${string}` | 'jobs' | 'data' | 'versions' | 'advanced'>('config');

  // 发信许可与实例
  const [allowedInstances, setAllowedInstancesState] = useState<AllowedInstances | null>(null);
  const [allAdapterInstances, setAllAdapterInstances] = useState<AdapterInstance[]>([]);
  const [savingAllowed, setSavingAllowed] = useState(false);
  const [allowedSaved, setAllowedSaved] = useState(false);

  const [allowedQuery, setAllowedQuery] = useState('');
  const [allowedOptions, setAllowedOptions] = useState<ConfigOption[]>([]);
  const [allowedMore, setAllowedMore] = useState(false);

  // 原始 JSON 配置
  const [rawSnapshot, setRawSnapshot] = useState<ConfigSnapshot | null>(null);
  const [configAvailable, setConfigAvailable] = useState(true);
  const [configRevision, setConfigRevision] = useState(0);
  const [rawConflict, setRawConflict] = useState<ConfigSnapshot | null>(null);
  const [rawJsonText, setRawJsonText] = useState('{}');
  const [savingRawJson, setSavingRawJson] = useState(false);
  const [rawJsonSaved, setRawJsonSaved] = useState(false);
  const [rawJsonError, setRawJsonError] = useState<string | null>(null);
  const [dataView, setDataView] = useState<'database' | 'storage' | 'conversations'>('database');

  // 日志级别状态
  const [logLevels, setLogLevels] = useState<LogLevels | null>(null);
  const [savingLogLevel, setSavingLogLevel] = useState(false);
  const [logLevelSavedMessage, setLogLevelSavedMessage] = useState(false);

  // 回退确认对话框
  const [rollbackModalOpen, setRollbackModalOpen] = useState(false);
  const [targetGeneration, setTargetGeneration] = useState<Generation | null>(null);

  // 卸载对话框
  const [uninstallModalOpen, setUninstallModalOpen] = useState(false);
  const [purgeLevel, setPurgeLevel] = useState<0 | 1 | 2>(0);

  // 409 确认对话框
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmAffected, setConfirmAffected] = useState<string[]>([]);
  const [pendingConfirmAction, setPendingConfirmAction] = useState<(() => Promise<void>) | null>(null);

  const loadData = async () => {
    setLoading(true);
    setGenerationError(null);
    const report = (error: unknown) => setErrorBanner(previous => [previous, error instanceof Error ? error.message : String(error)].filter(Boolean).join('\n'));
    await Promise.all([
      listPackages().then(packages => {
        const found = packages.find(item => item.ID === id && !item.Uninstalled);
        setPkg(found ?? null);
        if (!found) setErrorBanner(ui.packageNotFound);

      }).catch(report),
      getLogLevels().then(setLogLevels).catch(report),
      generations === undefined ? listGenerations(id).then(setRetained).catch(error => {
        setRetained([]);
        setGenerationError(error instanceof Error ? error.message : String(error));
      }) : Promise.resolve(),
      getAllowedInstances(id).then(setAllowedInstancesState).catch(report),
      listInstances().then(setAllAdapterInstances).catch(report),
      getPluginConfig(id).then(cfg => {
        setConfigAvailable(true);
        setRawSnapshot(cfg);
        const raw = cfg.pending ? cfg.pending.config : cfg.active;
        setRawJsonText(JSON.stringify(raw, null, 2));
      }).catch(error => {
        if (error instanceof AdminAPIError && error.status === 400 && error.message === 'webui has no config') { setConfigAvailable(false); setActiveTab(previous => previous === 'config' ? 'versions' : previous); }
        else report(error);
      }),
    ]);
    setConfigRevision(value => value + 1);
    setLoading(false);
  };

  const handleSaveAllowedInstances = async (value: AllowedInstances) => {
    setSavingAllowed(true);
    setAllowedSaved(false);
    try {
      await setAllowedInstances(id, value);
      setAllowedInstancesState(await getAllowedInstances(id));
      setAllowedSaved(true);
      setTimeout(() => setAllowedSaved(false), 3000);
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
      try { setAllowedInstancesState(await getAllowedInstances(id)); } catch (error) { setErrorBanner(previous => `${previous}\n${error instanceof Error ? error.message : String(error)}`); setAllowedInstancesState(null); }
    } finally {
      setSavingAllowed(false);
    }
  };

  const handleSaveRawJson = async () => {
    setSavingRawJson(true);
    setRawJsonError(null);
    setRawJsonSaved(false);
    try {
      const parsed: unknown = JSON.parse(rawJsonText);
      const snapshot = rawSnapshot!;
      await patchPluginConfig(id, snapshot.active_generation, rawConfigPatch(snapshot.pending?.config ?? snapshot.active, parsed));
      setRawJsonSaved(true);
      await loadData();
    } catch (error) {
      setRawJsonError(error instanceof Error ? error.message : String(error));
      if (error instanceof AdminAPIError && error.status === 409 && error.code === 'FAILED_PRECONDITION') {
        try { setRawConflict(await getPluginConfig(id)); }
        catch (refreshError) { setRawJsonError(previous => `${previous}\n${refreshError instanceof Error ? refreshError.message : String(refreshError)}`); }
      }
    } finally {
      setSavingRawJson(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  useEffect(() => {
    let active = true;
    listPackages().then(values => { if (active) setPkg(values.find(value => value.ID === id && !value.Uninstalled) ?? null); })
      .catch(error => { if (active) setErrorBanner(error instanceof Error ? error.message : String(error)); });
    return () => { active = false; };
  }, [id, locale]);
  useEffect(() => {
    if (activeTab !== 'advanced' || !allowedInstances) return;
    let active = true;
    Promise.all([listCoreOptions('core.adapter_instances', allowedQuery, {}, locale), resolveCoreOptions('core.adapter_instances', allowedInstances.instances, {}, locale)]).then(([page, resolved]) => {
      if (active) { setAllowedOptions([...resolved.options, ...page.options.filter(option => !resolved.options.some(value => value.value === option.value))]); setAllowedMore(page.more); }
    }).catch(error => { if (active) setErrorBanner(error instanceof Error ? error.message : String(error)); });
    return () => { active = false; };
  }, [activeTab, allowedQuery, locale, allowedInstances]);

  // 注册全局搜索项
  useEffect(() => {
    return register([
      ...(pkg && pkg.Role !== 'webui' && pkg.State === 'Activated' ? [{
        id: `plugin-detail-reload-${id}`,
        title: `${id}: ${ui.actionReload}`,
        section: ui.searchActions,
        keywords: [id, 'reload', 'restart'],
        run: () => {
          handleReload();
        },
      }] : []),
      {
        id: `plugin-detail-refresh-${id}`,
        title: `${id}: ${ui.refresh}`,
        section: ui.searchActions,
        keywords: [id, 'refresh'],
        run: () => {
          loadData();
        },
      },
    ]);
  }, [id, pkg, register, ui]);

  const handleToggleEnable = async () => {
    if (!pkg) return;
    const action = pkg.Enabled ? 'disable' : 'enable';
    try {
      await changePackage(action, pkg.ID, false);
      await loadData();
    } catch (err: unknown) {
      if (isConfirmationError(err)) {
        setConfirmAffected(err.affected);
        setPendingConfirmAction(() => async () => {
          await changePackage(action, pkg.ID, true);
          await loadData();
        });
        setConfirmModalOpen(true);
      } else {
        setErrorBanner(err instanceof Error ? err.message : String(err));
        await loadData();
      }
    }
  };

  const handleRestart = async () => {
    if (!pkg) return;
    try {
      await changePackage('restart', pkg.ID);
      await loadData();
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
      await loadData();
    }
  };

  const handleReload = async () => {
    if (!pkg) return;
    try {
      await changePackage('reload', pkg.ID);
      await loadData();
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
      await loadData();
    }
  };

  const executeUninstall = async (confirm = false) => {
    if (!pkg) return;
    try {
      await uninstallPackage(pkg.ID, purgeLevel, confirm);
      setUninstallModalOpen(false);
      navigate('/components', { replace: true });
    } catch (err: unknown) {
      if (isConfirmationError(err)) {
        setConfirmAffected(err.affected);
        setPendingConfirmAction(() => async () => {
          await executeUninstall(true);
        });
        setConfirmModalOpen(true);
      } else {
        setErrorBanner(err instanceof Error ? err.message : String(err));
        await loadData();
      }
    }
  };

  const handleRollbackClick = (gen: Generation) => {
    setTargetGeneration(gen);
    setRollbackModalOpen(true);
  };

  const executeRollback = async (confirm = false) => {
    if (!pkg || !targetGeneration) return;
    try {
      await rollbackPackage(pkg.ID, targetGeneration.id, confirm);
      setRollbackModalOpen(false);
      setTargetGeneration(null);
      await loadData();
    } catch (err: unknown) {
      if (isConfirmationError(err)) {
        setConfirmAffected(err.affected);
        setPendingConfirmAction(() => async () => {
          await executeRollback(true);
        });
        setConfirmModalOpen(true);
      } else {
        setErrorBanner(err instanceof Error ? err.message : String(err));
        await loadData();
      }
    }
  };

  const handleLogLevelChange = async (newLevel: SourceLogLevel) => {
    if (!pkg) return;
    setSavingLogLevel(true);
    setLogLevelSavedMessage(false);
    try {
      const updated = await setPackageLogLevel(pkg.ID, newLevel);
      setLogLevels(updated);
      setLogLevelSavedMessage(true);
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
      await loadData();
    } finally {
      setSavingLogLevel(false);
    }
  };

  const currentLevelSetting: SourceLogLevel = logLevels?.sources[id] ?? 'inherit';

  const renderStatus = () => {
    if (!pkg) return null;
    if (!pkg.Enabled) {
      return (
        <span className="pkg-status-badge is-stopped">
          <span className="pkg-status-dot is-stopped" />
          {ui.stateStopped}
        </span>
      );
    }
    if (pkg.State === 'Activated') {
      return (
        <span className="pkg-status-badge is-running">
          <span className="pkg-status-dot is-running" />
          {pkg.Role === 'webui' ? ui.stateActivated : ui.stateRunning}
        </span>
      );
    }
    return (
      <span className="pkg-status-badge is-degraded">
        <span className="pkg-status-dot is-degraded" />
        {pkg.State || ui.stateDegraded}
      </span>
    );
  };

  const isWebUI = pkg?.Role === 'webui';

  return (
    <div className="plugin-detail-page">
      {pkg && <><ChangelogDialog component={id} version={pkg.Version} open={showChangelog} onClose={() => setShowChangelog(false)} /><ChangelogDialog component={id} version={pkg.Version} open={autoContent} automatic onClose={() => setAutoContent(false)} /></>}
      {/* 头部导航与操作栏 */}
      <div className="plugin-detail-header">
        <div className="detail-breadcrumb-row">
          <Link to="/components" className="detail-breadcrumb-link">
            {ui.pluginBreadcrumb}
          </Link>
          <ChevronRight size={14} className="detail-breadcrumb-chevron" />
          <span className="detail-breadcrumb-current font-mono">{id}</span>
        </div>

        <div className="detail-title-row">
          <div className="detail-icon-box">
            <img
              src={packageIconURL(id)}
              alt={id}
              className="detail-icon-img"
              onError={e => {
                (e.currentTarget as HTMLElement).style.display = 'none';
                const fallback = e.currentTarget.parentElement?.querySelector('.detail-icon-fallback');
                if (fallback) (fallback as HTMLElement).style.display = 'flex';
              }}
            />
            <div className="detail-icon-fallback" style={{ display: 'none' }}>
              <PackageIcon size={26} />
            </div>
          </div>

          <div className="detail-title-info">
            <div className="detail-name-row">
              <h1 className="detail-title font-mono">{id}</h1>
              {renderStatus()}
            </div>
            {pkg?.Source ? (
              <span className="detail-source-badge font-mono">{pkg.Source}</span>
            ) : null}
          </div>

          <div className="detail-actions-right">
            {!isWebUI && pkg?.State === 'Activated' ? (
              <button
                type="button"
                className="detail-icon-button"
                onClick={handleReload}
                disabled={loading}
                title={ui.actionReload}
                aria-label={ui.actionReload}
              >
                <RotateCw size={16} />
              </button>
            ) : null}

            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="detail-icon-button"
                  aria-label={ui.actions}
                >
                  <MoreHorizontal size={18} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="dropdown-menu-content"
                  side="bottom"
                  align="end"
                >
                  {pkg ? (
                    <DropdownMenu.Item
                      className="dropdown-menu-item"
                      onSelect={handleToggleEnable}
                    >
                      <Power size={15} />
                      <span>{pkg.Enabled ? ui.actionDisable : ui.actionEnable}</span>
                    </DropdownMenu.Item>
                  ) : null}

                  {!isWebUI && pkg?.Enabled && pkg.Active ? (
                    <DropdownMenu.Item
                      className="dropdown-menu-item"
                      onSelect={handleRestart}
                    >
                      <RefreshCw size={15} />
                      <span>{ui.actionRestart}</span>
                    </DropdownMenu.Item>
                  ) : null}

                  <DropdownMenu.Separator className="dropdown-menu-separator" />
                  <DropdownMenu.Item
                    className="dropdown-menu-item is-danger"
                    onSelect={() => {
                      setPurgeLevel(0);
                      setUninstallModalOpen(true);
                    }}
                  >
                    <Trash2 size={15} />
                    <span>{ui.actionUninstall}</span>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </div>

      {errorBanner ? (
        <div className="plugins-error-banner" role="alert">
          <span>{errorBanner}</span>
          <button
            type="button"
            className="error-banner-close" aria-label={ui.close}
            onClick={() => setErrorBanner(null)}
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      {/* 功能标签栏 */}
      <div className="detail-tabs">
        {configAvailable && (
          <button
            type="button"
            className={`detail-tab-button ${activeTab === 'config' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('config')}
          >
            <Sliders size={16} />
            <span>{ui.tabConfig}</span>
          </button>
        )}

        {!isWebUI &&
          pkg?.pages?.map(p => (
            <button
              key={p.path}
              type="button"
              className={`detail-tab-button ${activeTab === `page:${p.path}` ? 'is-active' : ''}`}
              onClick={() => setActiveTab(`page:${p.path}`)}
            >
              <FileText size={16} />
              <span>{p.title}</span>
            </button>
          ))}

        {!isWebUI && (
          <button
            type="button"
            className={`detail-tab-button ${activeTab === 'jobs' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('jobs')}
          >
            <Calendar size={16} />
            <span>{ui.tabJobs}</span>
          </button>
        )}

        <button type="button" className={`detail-tab-button ${activeTab === 'data' ? 'is-active' : ''}`} onClick={() => setActiveTab('data')}><Database size={16} />{ui.dataTab}</button>
        <button
          type="button"
          className={`detail-tab-button ${activeTab === 'versions' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('versions')}
        >
          <History size={16} />
          <span>{ui.tabVersionHistory}</span>
        </button>

        <button
          type="button"
          className={`detail-tab-button ${activeTab === 'advanced' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('advanced')}
        >
          <ShieldAlert size={16} />
          <span>{ui.tabAdvanced}</span>
        </button>
      </div>

      <div className="detail-tab-content">
        {configAvailable && activeTab === 'config' && <PluginConfigPanel key={configRevision} id={id} />}

        {!isWebUI &&
          pkg?.pages?.map(p =>
            activeTab === `page:${p.path}` ? (
              <PluginPageFrame key={p.path} id={id} path={p.path} title={p.title} />
            ) : null,
          )}

        {!isWebUI && activeTab === 'jobs' && <PluginJobsPanel id={id} />}

        {activeTab === 'data' && (
          <>
            <div className="time-range-pills data-view-tabs">
              <button className={`time-range-pill ${dataView === 'database' ? 'is-active' : ''}`} onClick={() => setDataView('database')}>{ui.database}</button>
              <button className={`time-range-pill ${dataView === 'storage' ? 'is-active' : ''}`} onClick={() => setDataView('storage')}>{ui.storage}</button>
              {pkg?.Role === 'agent' && <button className={`time-range-pill ${dataView === 'conversations' ? 'is-active' : ''}`} onClick={() => setDataView('conversations')}>{ui.conversations}</button>}
            </div>
            {dataView === 'database' ? <>{generationError && <pre role="alert" className="form-error">{generationError}</pre>}<DatabasePanel id={id} generations={generations ?? retained} /></> : dataView === 'storage' ? <StoragePanel id={id} /> : <ConversationsPanel id={id} />}
          </>
        )}

        {activeTab === 'versions' && (
          <div className="versions-tab-pane">
            <button onClick={() => setShowChangelog(true)}>{ui.viewChangelog}</button>
            <div className="current-version-card">
              <div className="version-info-row">
                <div className="version-meta-item">
                  <span className="version-meta-label">{ui.currentVersion}</span>
                  <span className="version-meta-val font-mono">{pkg?.Version ?? ui.loading}</span>
                </div>
                <div className="version-meta-item">
                  <span className="version-meta-label">{ui.activeGeneration}</span>
                  <span className="version-meta-val font-mono">{pkg?.Active || ui.none}</span>
                </div>
              </div>
            </div>

            <input aria-label={ui.filterGenerations} placeholder={ui.filterGenerations} value={generationQuery} onChange={event => setGenerationQuery(event.target.value)} />
            {generationError ? <p role="alert">{generationError}</p> : loading ? <p role="status">{ui.loading}</p> : generationList.length > 0 ? (
              <div className="generations-list-container">
                <table className="generations-table font-mono">
                  <thead>
                    <tr>
                      <th>{ui.generation}</th>
                      <th>{ui.version}</th>
                      <th>{ui.createdAt}</th>
                      <th>{ui.database}</th>
                      <th>{ui.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generationList.map(gen => (
                      <tr key={gen.id} className={gen.active ? 'is-active-gen' : ''}>
                        <td>
                          <div className="generation-identity">
                            <span className="gen-id-badge font-mono" title={gen.id}>{gen.id}</span>
                            {gen.active ? <span className="active-pill">{ui.activeGeneration}</span> : null}
                          </div>
                        </td>
                        <td>{gen.version}</td>
                        <td>{gen.created_at}</td>
                        <td>
                          {gen.has_db ? (
                            <span className="db-badge" title={ui.databasePresent}>
                              <Database size={13} />
                              <span>{ui.databasePresent}</span>
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td>
                          {!gen.active ? (
                            <button
                              type="button"
                              className="rollback-button"
                              onClick={() => handleRollbackClick(gen)}
                            >
                              <RotateCcw size={13} />
                              <span>{ui.rollback}</span>
                            </button>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="generations-empty-card">
                <p>{ui.noGenerations}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'advanced' && (
          <div className="advanced-tab-pane">
            {/* 日志级别设置 */}
            <div className="advanced-card">
              <div className="advanced-card-header">
                <h3 className="advanced-card-title">{ui.logLevel}</h3>
                {logLevelSavedMessage ? (
                  <span className="log-saved-pill">{ui.logLevelSaved}</span>
                ) : null}
              </div>
              <div className="advanced-card-body">
                <div className="log-level-selector-row">
                  <select
                    className="log-level-select font-mono"
                    value={currentLevelSetting}
                    disabled={savingLogLevel || !logLevels}
                    onChange={e => handleLogLevelChange(e.target.value as SourceLogLevel)}
                  >
                    <option value="inherit">
                      {ui.logLevelInherit.replace('{level}', logLevels?.global ?? ui.loading)}
                    </option>
                    <option value="debug">{ui.logDebug}</option>
                    <option value="info">{ui.logInfo}</option>
                    <option value="warn">{ui.logWarn}</option>
                    <option value="error">{ui.logError}</option>
                    <option value="critical">{ui.logCritical}</option>
                    <option value="off">{ui.logOff}</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 发信许可 / Allowed Instances */}
            {!isWebUI && allowedInstances && (
              <div className="advanced-card">
                <div className="advanced-card-header">
                  <h3 className="advanced-card-title">{ui.allowedInstances}</h3>
                  {allowedSaved && <span className="log-saved-pill">{ui.saved}</span>}
                </div>
                <div className="advanced-card-body">
                  <p className="field-hint">{ui.allowedInstancesDesc}</p>
                  <div className="allowed-mode-controls">
                    <label >
                      <input
                        type="radio"
                        name="allowedMode"
                        disabled={savingAllowed}
                        checked={allowedInstances?.all ?? true}
                        onChange={() => {
                          const updated: AllowedInstances = { all: true, instances: [] };
                          setAllowedInstancesState(updated);
                          void handleSaveAllowedInstances(updated);
                        }}
                      />
                      <span>{ui.allInstancesAllowed}</span>
                    </label>
                    <label >
                      <input
                        type="radio"
                        name="allowedMode"
                        disabled={savingAllowed}
                        checked={!(allowedInstances?.all ?? true)}
                        onChange={() => {
                          const updated: AllowedInstances = { all: false, instances: allowedInstances?.instances ?? [] };
                          setAllowedInstancesState(updated);
                          void handleSaveAllowedInstances(updated);
                        }}
                      />
                      <span>{ui.selectAllowedInstances}</span>
                    </label>
                  </div>

                  {allowedInstances && !allowedInstances.all && (
                    <div><input aria-label={ui.searchInstances} placeholder={ui.searchInstances} value={allowedQuery} onChange={event => setAllowedQuery(event.target.value)} />
                    {allowedMore && <p>{ui.searchMoreOptions}</p>}
                    <div className="allowed-instances-list">
                      {allAdapterInstances.length === 0 && allowedInstances.instances.length === 0 && allowedOptions.length === 0 ? (
                        <p className="text-muted">{ui.noInstances}</p>
                      ) : (
                        [...new Set([...allAdapterInstances.map(instance => instance.instance_id), ...allowedInstances.instances, ...allowedOptions.map(option => option.value)])].filter(value => value.toLowerCase().includes(allowedQuery.toLowerCase()) || allowedOptions.some(option => option.value === value && option.label.toLowerCase().includes(allowedQuery.toLowerCase()))).map(instanceID => {
                          const inst = allAdapterInstances.find(instance => instance.instance_id === instanceID);
                          const option = allowedOptions.find(option => option.value === instanceID);
                          const checked = allowedInstances.instances.includes(instanceID);
                          return (
                            <label key={instanceID} >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={savingAllowed}
                                onChange={e => {
                                  const prev = allowedInstances.instances;
                                  const next = e.target.checked
                                    ? [...prev, instanceID]
                                    : prev.filter(x => x !== instanceID);
                                  const updated: AllowedInstances = { all: false, instances: next };
                                  setAllowedInstancesState(updated);
                                  void handleSaveAllowedInstances(updated);
                                }}
                              />
                              <span className="font-mono">{option?.label ?? instanceID}{!inst && !option && ` (${ui.optionNotFound})`}</span>
                              {inst && <span className="text-muted">({inst.adapter_id})</span>}
                            </label>
                          );
                        })
                      )}
                    </div></div>
                  )}
                </div>
              </div>
            )}

            {/* 完整 JSON 配置编辑 */}
            {configAvailable && (
              <div className="advanced-card">
                <div className="advanced-card-header">
                  <h3 className="advanced-card-title">{ui.rawJsonEdit}</h3>
                  {rawJsonSaved && <span className="log-saved-pill">{ui.saved}</span>}
                </div>
                <div className="advanced-card-body">
                  <p className="field-hint">{ui.rawConfigDesc}</p>
                  {rawJsonError && (
                    <div className="plugins-error-banner" role="alert">
                      <span>{rawJsonError}</span>
                    </div>
                  )}
                  {rawConflict && <div className="config-pending-banner"><span>{ui.configConflict}</span><button type="button" onClick={() => { setRawSnapshot(rawConflict); setRawJsonText(JSON.stringify(rawConflict.pending?.config ?? rawConflict.active, null, 2)); setRawConflict(null); }}>{ui.useLatestConfig}</button></div>}
                  <textarea
                    className="code-editor"
                    value={rawJsonText}
                    onChange={e => setRawJsonText(e.target.value)}
                    rows={12}

                  />
                  <div className="config-json-actions">
                    <button
                      type="button"
                      className="save-button"
                      disabled={savingRawJson || !rawSnapshot || rawConflict !== null}
                      onClick={handleSaveRawJson}
                    >
                      {savingRawJson ? ui.loading : ui.save}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 卸载危险区 */}
            <div className="advanced-card is-danger-card">
              <div className="advanced-card-header">
                <h3 className="advanced-card-title is-danger">{ui.actionUninstall}</h3>
              </div>
              <div className="advanced-card-body">
                <p className="danger-desc-text">
                  {ui.uninstallDesc.replace('{id}', id)}
                </p>
                <button
                  type="button"
                  className="dialog-button is-danger"
                  onClick={() => {
                    setPurgeLevel(0);
                    setUninstallModalOpen(true);
                  }}
                >
                  <Trash2 size={15} />
                  <span>{ui.actionUninstall}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 回退确认对话框 */}
      <Dialog.Root open={rollbackModalOpen} onOpenChange={setRollbackModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content plugins-dialog-content" aria-describedby={undefined}>
            <div className="dialog-header">
              <Dialog.Title className="dialog-title">{ui.rollbackTitle}</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="dialog-close-button" aria-label={ui.close}>
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            {errorBanner && <p className="plugins-error-banner" role="alert">{errorBanner}</p>}
            <p className="dialog-subtitle">
              {ui.rollbackDesc
                .replace('{id}', id)
                .replace('{generation}', targetGeneration?.id || '')
                .replace('{version}', targetGeneration?.version || '')}
            </p>

            <div className="dialog-actions">
              <button
                type="button"
                className="dialog-button"
                onClick={() => {
                  setRollbackModalOpen(false);
                  setTargetGeneration(null);
                }}
              >
                {ui.cancel}
              </button>
              <button
                type="button"
                className="dialog-button is-primary"
                onClick={() => executeRollback(false)}
              >
                {ui.confirm}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* 卸载对话框 */}
      <Dialog.Root open={uninstallModalOpen} onOpenChange={setUninstallModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content plugins-dialog-content" aria-describedby={undefined}>
            <div className="dialog-header">
              <Dialog.Title className="dialog-title">{ui.uninstallTitle}</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="dialog-close-button" aria-label={ui.close}>
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            {errorBanner && <p className="plugins-error-banner" role="alert">{errorBanner}</p>}
            <p className="dialog-subtitle">
              {ui.uninstallDesc.replace('{id}', id)}
            </p>

            <div className="dialog-radio-group">
              <label className="dialog-radio-item">
                <input
                  type="radio"
                  name="detail-purge-level"
                  checked={purgeLevel === 0}
                  onChange={() => setPurgeLevel(0)}
                />
                <span className="radio-text">{ui.purge0}</span>
              </label>
              <label className="dialog-radio-item">
                <input
                  type="radio"
                  name="detail-purge-level"
                  checked={purgeLevel === 1}
                  onChange={() => setPurgeLevel(1)}
                />
                <span className="radio-text">{ui.purge1}</span>
              </label>
              <label className="dialog-radio-item">
                <input
                  type="radio"
                  name="detail-purge-level"
                  checked={purgeLevel === 2}
                  onChange={() => setPurgeLevel(2)}
                />
                <span className="radio-text">{ui.purge2}</span>
              </label>
            </div>

            <div className="dialog-actions">
              <button
                type="button"
                className="dialog-button"
                onClick={() => setUninstallModalOpen(false)}
              >
                {ui.cancel}
              </button>
              <button
                type="button"
                className="dialog-button is-danger"
                onClick={() => executeUninstall(false)}
              >
                {ui.actionUninstall}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* 409 确认对话框 */}
      <Dialog.Root open={confirmModalOpen} onOpenChange={open => { if (!confirming) { setConfirmModalOpen(open); if (!open) setPendingConfirmAction(null); } }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content plugins-dialog-content" aria-describedby={undefined}>
            <div className="dialog-header">
              <Dialog.Title className="dialog-title">{ui.confirmAffectedTitle}</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="dialog-close-button" aria-label={ui.close}>
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            {errorBanner && <p className="plugins-error-banner" role="alert">{errorBanner}</p>}
            <p className="dialog-subtitle">{ui.confirmAffectedDesc}</p>

            <ul className="affected-items-list font-mono">
              {confirmAffected.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>

            <div className="dialog-actions">
              <button
                type="button"
                className="dialog-button"
                onClick={() => {
                  setConfirmModalOpen(false);
                  setPendingConfirmAction(null);
                }}
              >
                {ui.cancel}
              </button>
              <button
                type="button"
                className="dialog-button is-primary"
                disabled={confirming}
                onClick={async () => {
                  const action = pendingConfirmAction;
                  setPendingConfirmAction(null);
                  setConfirmModalOpen(false);
                  setConfirming(true);
                  try { await action?.(); }
                  catch (error) { setErrorBanner(error instanceof Error ? error.message : String(error)); await loadData(); }
                  finally { setConfirming(false); }
                }}
              >
                {ui.confirmContinue}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
