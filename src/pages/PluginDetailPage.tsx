import { useContext, useEffect, useState, type JSX } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ChevronRight,
  Database,
  History,
  MoreHorizontal,
  Package as PackageIcon,
  Power,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Sliders,
  Trash2,
  X,
} from 'lucide-react';
import {
  changePackage,
  getLogLevels,
  isConfirmationError,
  listPackages,
  listGenerations,
  packageIconURL,
  rollbackPackage,
  setPackageLogLevel,
  uninstallPackage,
  type Generation,
  type LogLevels,
  type Package,
  type SourceLogLevel,
} from '../api/admin';
import { useUI } from '../i18n/UI';
import { Link, navigate } from '../shell/router';
import { SearchContext } from '../shell/search';

/** PluginDetailPage 展示保留代次、回退确认及组件高级设置。 */
export function PluginDetailPage(props: {
  id: string;
  generations?: readonly Generation[];
}): JSX.Element {
  const { id, generations } = props;
  const ui = useUI();
  const { register } = useContext(SearchContext);

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
  const [activeTab, setActiveTab] = useState<'versions' | 'advanced'>('versions');

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
    ]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [id]);

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

      {/* 两个功能标签：版本记录 / 高级 */}
      <div className="detail-tabs">
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
          <Sliders size={16} />
          <span>{ui.tabAdvanced}</span>
        </button>
      </div>

      <div className="detail-tab-content">
        {activeTab === 'versions' ? (
          <div className="versions-tab-pane">
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
                          <span className="gen-id-badge">{gen.id}</span>
                          {gen.active ? <span className="active-pill">{ui.activeGeneration}</span> : null}
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
        ) : (
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
                    <option value="debug">debug</option>
                    <option value="info">info</option>
                    <option value="warn">warn</option>
                    <option value="error">error</option>
                    <option value="critical">critical</option>
                    <option value="off">off</option>
                  </select>
                </div>
              </div>
            </div>

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
