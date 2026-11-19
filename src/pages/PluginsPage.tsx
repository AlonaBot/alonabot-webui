import { useContext, useEffect, useMemo, useState, type JSX } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  AlertCircle,
  ArrowUpCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  MoreHorizontal,
  Package as PackageIcon,
  Plus,
  Power,
  RefreshCw,
  RotateCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  changePackage,
  installPackage,
  isConfirmationError,
  listPackages,
  packageIconURL,
  uninstallPackage,
  updatePackage,
  type Package,
} from '../api/admin';
import { ChangelogDialog, ReleasePreview } from '../components/ChangelogDialog';
import { getLatestRelease, type LatestRelease } from '../api/webui';
import { repository, compareVersions } from './versions';
import { StorePanel } from './StorePanel';
import { useUI } from '../i18n/UI';
import { buildPackageUpload } from './packageUpload';
import { hasPackageProblem } from './packageState';
import { navigate } from '../shell/router';
import { SearchContext } from '../shell/search';

const PAGE_SIZE = 9;

export function filterPackages(
  packages: Package[],
  roleFilter: string,
  searchQuery: string,
): Package[] {
  const q = searchQuery.trim().toLowerCase();
  return packages.filter(pkg => {
    if (pkg.Uninstalled) return false;
    if (roleFilter !== 'all' && pkg.Role !== roleFilter) return false;
    if (q) {
      const matchId = pkg.ID.toLowerCase().includes(q);
      const matchAdapter = pkg.AdapterID ? pkg.AdapterID.toLowerCase().includes(q) : false;
      const matchSource = pkg.Source ? pkg.Source.toLowerCase().includes(q) : false;
      return matchId || matchAdapter || matchSource;
    }
    return true;
  });
}

export function sortPackages(packages: Package[], problemFirst: boolean): Package[] {
  if (!problemFirst) {
    return [...packages];
  }
  return [...packages].sort((a, b) => {
    const aProblem = hasPackageProblem(a);
    const bProblem = hasPackageProblem(b);
    if (aProblem && !bProblem) return -1;
    if (!aProblem && bProblem) return 1;
    return 0;
  });
}

/**
 * 官方 WebUI 插件管理页面。
 * 支持筛选、有问题的在前、数字分页、卡片展示、安装、替换、启停、重启、重载、更新、卸载与 409 确认。
 */
export function PluginsPage(): JSX.Element {
  const ui = useUI();
  const { register } = useContext(SearchContext);

  const [updateFailures, setUpdateFailures] = useState<string[]>([]);
  const [latest, setLatest] = useState<Record<string, LatestRelease>>({});
  const [updated, setUpdated] = useState<{id: string; version: string} | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'installed' | 'store'>(() => {
    if (typeof window !== 'undefined') {
      const search = new URLSearchParams(window.location.search);
      if (search.get('tab') === 'store') return 'store';
    }
    return 'installed';
  });

  useEffect(() => {
    const handlePopState = () => {
      const search = new URLSearchParams(window.location.search);
      if (search.get('tab') === 'store') {
        setActiveTab('store');
      } else if (!search.has('tab')) {
        setActiveTab('installed');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 筛选与排序
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [problemFirst, setProblemFirst] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // 对话框状态
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [installMode, setInstallMode] = useState<'remote' | 'upload'>('remote');
  const [remoteSource, setRemoteSource] = useState('');
  const [replaceConflict, setReplaceConflict] = useState(false);
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [releaseFile, setReleaseFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [publicKeyText, setPublicKeyText] = useState('');

  // 更新对话框
  const [previewReady, setPreviewReady] = useState(false);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updatingPkg, setUpdatingPkg] = useState<Package | null>(null);
  const [updateMode, setUpdateMode] = useState<'source' | 'upload'>('source');

  // 卸载对话框
  const [uninstallModalOpen, setUninstallModalOpen] = useState(false);
  const [uninstallingPkg, setUninstallingPkg] = useState<Package | null>(null);
  const [purgeLevel, setPurgeLevel] = useState<0 | 1 | 2>(0);

  // 409 确认对话框
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmAffected, setConfirmAffected] = useState<string[]>([]);
  const [pendingConfirmAction, setPendingConfirmAction] = useState<(() => Promise<void>) | null>(null);

  // 查看原因对话框
  const [reasonModalOpen, setReasonModalOpen] = useState(false);
  const [inspectingPkg, setInspectingPkg] = useState<Package | null>(null);

  // 警告信息展示
  const [warningsList, setWarningsList] = useState<string[] | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await listPackages();
      setPackages(data);
    } catch (err: unknown) {
      setErrorBanner(previous => [previous, err instanceof Error ? err.message : String(err)].filter(Boolean).join('\n'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 注册全局搜索项
  useEffect(() => {
    return register([
      {
        id: 'plugins-install',
        title: `${ui.plugins}: ${ui.installPackage}`,
        section: ui.searchActions,
        keywords: ['install', 'package', 'plugin'],
        run: () => {
          setErrorBanner(null);
          setInstallModalOpen(true);
        },
      },
      {
        id: 'plugins-refresh',
        title: `${ui.plugins}: ${ui.refresh}`,
        section: ui.searchActions,
        keywords: ['refresh', 'reload', 'plugins'],
        run: () => {
          loadData();
        },
      },
    ]);
  }, [register, ui]);

  // 筛选与分页
  const filteredPackages = useMemo(() => {
    return filterPackages(packages, roleFilter, searchQuery);
  }, [packages, roleFilter, searchQuery]);

  const sortedPackages = useMemo(() => {
    return sortPackages(filteredPackages, problemFirst);
  }, [filteredPackages, problemFirst]);

  const totalPages = Math.max(1, Math.ceil(sortedPackages.length / PAGE_SIZE));
  const visiblePage = Math.min(currentPage, totalPages);
  const paginatedPackages = useMemo(() => {
    const start = (visiblePage - 1) * PAGE_SIZE;
    return sortedPackages.slice(start, start + PAGE_SIZE);
  }, [sortedPackages, visiblePage]);
  useEffect(() => { setCurrentPage(visiblePage); }, [visiblePage]);

  // 各类别计数
  const roleCounts = useMemo(() => {
    const active = packages.filter(p => !p.Uninstalled);
    return {
      all: active.length,
      plugin: active.filter(p => p.Role === 'plugin').length,
      adapter: active.filter(p => p.Role === 'adapter').length,
      agent: active.filter(p => p.Role === 'agent').length,
      webui: active.filter(p => p.Role === 'webui').length,
    };
  }, [packages]);

  // --------------------------------------------------------------------------
  // 操作动作处理
  // --------------------------------------------------------------------------

  const handleToggleEnable = async (pkg: Package) => {
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

  const handleRestart = async (pkg: Package) => {
    try {
      await changePackage('restart', pkg.ID);
      await loadData();
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
      await loadData();
    }
  };

  const handleReload = async (pkg: Package) => {
    try {
      await changePackage('reload', pkg.ID);
      await loadData();
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
      await loadData();
    }
  };

  const handleOpenUninstall = (pkg: Package) => {
    setErrorBanner(null);
    setUninstallingPkg(pkg);
    setPurgeLevel(0);
    setUninstallModalOpen(true);
  };

  const executeUninstall = async (confirm = false) => {
    if (!uninstallingPkg) return;
    try {
      await uninstallPackage(uninstallingPkg.ID, purgeLevel, confirm);
      setUninstallModalOpen(false);
      setUninstallingPkg(null);
      await loadData();
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

  useEffect(() => {
    let active = true;
    const installed = packages.filter(pkg => !pkg.Uninstalled && repository(pkg.Source));
    Promise.allSettled(installed.map(async pkg => [pkg.ID, await getLatestRelease(repository(pkg.Source)!)] as const)).then(results => {
      if (!active) return;
      const values: Record<string, LatestRelease> = {};
      const errors: string[] = [];
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') { const [id, release] = result.value; if (release) { values[id] = release; if (release.error) errors.push(id); } }
        else errors.push(installed[i].ID);
      });
      setLatest(values); setUpdateFailures(errors);
    });
    return () => { active = false; };
  }, [packages]);

  const handleOpenUpdate = (pkg: Package) => {
    setErrorBanner(null);
    setUpdatingPkg(pkg);
    setPreviewReady(false);
    setUpdateMode('source');
    setArchiveFile(null);
    setReleaseFile(null);
    setSignatureFile(null);
    setPublicKeyText('');
    setUpdateModalOpen(true);
  };

  const executeUpdate = async (confirm = false) => {
    if (!updatingPkg) return;
    try {
      let res: { warnings?: string[] };
      if (updateMode === 'source') {
        res = await updatePackage(updatingPkg.ID, { confirm });
      } else {
        if (!archiveFile || !releaseFile) {
          setErrorBanner(ui.uploadFilesRequired);
          return;
        }
        const formData = buildPackageUpload({ archive: archiveFile, release: releaseFile, signature: signatureFile, publicKey: publicKeyText, confirm });
        res = await updatePackage(updatingPkg.ID, formData);
      }

      const installed = (await listPackages()).find(pkg => pkg.ID === updatingPkg.ID);
      if (installed) setUpdated({ id: installed.ID, version: installed.Version });
      setUpdateModalOpen(false);
      setUpdatingPkg(null);
      setArchiveFile(null);
      setReleaseFile(null);
      setSignatureFile(null);
      setPublicKeyText('');
      if (res.warnings && res.warnings.length > 0) {
        setWarningsList(res.warnings);
      }
      await loadData();
    } catch (err: unknown) {
      if (isConfirmationError(err)) {
        setConfirmAffected(err.affected);
        setPendingConfirmAction(() => async () => {
          await executeUpdate(true);
        });
        setConfirmModalOpen(true);
      } else {
        setErrorBanner(err instanceof Error ? err.message : String(err));
        await loadData();
      }
    }
  };

  const executeInstall = async (confirm = false) => {
    try {
      let resultPkg: Package;
      if (installMode === 'remote') {
        resultPkg = await installPackage({
          Source: remoteSource.trim(),
          Replace: replaceConflict,
          Confirm: confirm,
        });
      } else {
        if (!archiveFile || !releaseFile) {
          setErrorBanner(ui.uploadFilesRequired);
          return;
        }
        const formData = buildPackageUpload({ archive: archiveFile, release: releaseFile, signature: signatureFile, publicKey: publicKeyText, confirm, replace: replaceConflict });
        resultPkg = await installPackage(formData);
      }

      setInstallModalOpen(false);
      setRemoteSource('');
      setReplaceConflict(false);
      setArchiveFile(null);
      setReleaseFile(null);
      setSignatureFile(null);
      setPublicKeyText('');

      if (resultPkg.Warnings && resultPkg.Warnings.length > 0) {
        setWarningsList(resultPkg.Warnings);
      }
      await loadData();
    } catch (err: unknown) {
      if (isConfirmationError(err)) {
        setConfirmAffected(err.affected);
        setPendingConfirmAction(() => async () => {
          await executeInstall(true);
        });
        setConfirmModalOpen(true);
      } else {
        setErrorBanner(err instanceof Error ? err.message : String(err));
        await loadData();
      }
    }
  };

  const renderStatusDot = (pkg: Package) => {
    const state = pkg.Role === 'plugin' || pkg.Role === 'agent' ? pkg.RuntimeState : undefined;
    if (state) {
      const tone = ({ STOPPED: 'stopped', WAKING: 'transition', ACTIVE: 'running', QUIESCING: 'transition', SUSPENDED: 'suspended', FAILED: 'degraded' } as const)[state];
      return <span className={`pkg-status-badge is-${tone}`}><span className={`pkg-status-dot is-${tone}`} />{ui[`runtime${state}`]}</span>;
    }
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
    if (pkg.State === 'Installed') {
      return (
        <span className="pkg-status-badge is-installed">
          <span className="pkg-status-dot is-installed" />
          {ui.stateInstalled}
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

  return (
    <div className="plugins-page">
      {updated && <ChangelogDialog component={updated.id} version={updated.version} open automatic onClose={() => setUpdated(null)} />}
      {/* 顶部标签切换：已安装 / 商店 */}
      <div className="plugins-top-tabs">
        <button
          type="button"
          className={`plugin-tab-button ${activeTab === 'installed' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('installed')}
        >
          {ui.installedTab}
          <span className="plugin-tab-count font-mono">{roleCounts.all}</span>
        </button>
        <button
          type="button"
          className={`plugin-tab-button ${activeTab === 'store' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('store')}
        >
          {ui.storeTab}
        </button>
      </div>

      {activeTab === 'store' ? (
        <StorePanel packages={packages} onInstalled={loadData} />
      ) : (
        <>
          {/* 筛选与搜索工具栏 */}
          <div className="plugins-toolbar">
            <div className="role-filter-pills">
              <button
                type="button"
                className={`role-filter-pill ${roleFilter === 'all' ? 'is-active' : ''}`}
                onClick={() => {
                  setRoleFilter('all');
                  setCurrentPage(1);
                }}
              >
                {ui.filterRoleAll}
                <span className="pill-badge">{roleCounts.all}</span>
              </button>
              <button
                type="button"
                className={`role-filter-pill ${roleFilter === 'plugin' ? 'is-active' : ''}`}
                onClick={() => {
                  setRoleFilter('plugin');
                  setCurrentPage(1);
                }}
              >
                {ui.filterRolePlugin}
                <span className="pill-badge">{roleCounts.plugin}</span>
              </button>
              <button
                type="button"
                className={`role-filter-pill ${roleFilter === 'adapter' ? 'is-active' : ''}`}
                onClick={() => {
                  setRoleFilter('adapter');
                  setCurrentPage(1);
                }}
              >
                {ui.filterRoleAdapter}
                <span className="pill-badge">{roleCounts.adapter}</span>
              </button>
              <button
                type="button"
                className={`role-filter-pill ${roleFilter === 'agent' ? 'is-active' : ''}`}
                onClick={() => {
                  setRoleFilter('agent');
                  setCurrentPage(1);
                }}
              >
                {ui.filterRoleAgent}
                <span className="pill-badge">{roleCounts.agent}</span>
              </button>
              <button
                type="button"
                className={`role-filter-pill ${roleFilter === 'webui' ? 'is-active' : ''}`}
                onClick={() => {
                  setRoleFilter('webui');
                  setCurrentPage(1);
                }}
              >
                {ui.filterRoleWebUI}
                <span className="pill-badge">{roleCounts.webui}</span>
              </button>
            </div>

            <div className="plugins-actions-row">
              <div className="search-filter-box">
                <Search size={15} className="search-filter-icon" />
                <input
                  type="text"
                  className="search-filter-input"
                  placeholder={ui.searchPluginPlaceholder}
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                />
                {searchQuery ? (
                  <button
                    type="button"
                    className="search-filter-clear" aria-label={ui.clear}
                    onClick={() => {
                      setSearchQuery('');
                      setCurrentPage(1);
                    }}
                  >
                    <X size={13} />
                  </button>
                ) : null}
              </div>

              <button
                type="button"
                className={`sort-toggle-button ${problemFirst ? 'is-active' : ''}`}
                onClick={() => { setProblemFirst(!problemFirst); setCurrentPage(1); }}
                title={problemFirst ? ui.sortProblemFirst : ui.sortDefault}
              >
                <Filter size={15} />
                <span>{problemFirst ? ui.sortProblemFirst : ui.sortDefault}</span>
              </button>

              <button
                type="button"
                className="plugin-primary-button"
                onClick={() => {
                  setErrorBanner(null);
          setInstallModalOpen(true);
                  setInstallMode('remote');
                }}
              >
                <Plus size={16} />
                <span>{ui.installPackage}</span>
              </button>
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

          {/* 插件卡片网格 */}
          {loading ? <p role="status">{ui.loading}</p> : errorBanner && packages.length === 0 ? null : paginatedPackages.length === 0 ? (
            <div className="plugins-empty-view">
              <p>{ui.noPackagesFound}</p>
            </div>
          ) : (
            <div className="plugins-grid">
              {paginatedPackages.map(pkg => {
                const isWebUI = pkg.Role === 'webui';
                const hasProblem = hasPackageProblem(pkg);

                return (
                  <div key={pkg.ID} className={`plugin-card ${hasProblem ? 'has-problem' : ''}`}>
                    <div className="plugin-card-header">
                      <div className="plugin-icon-box">
                        <img
                          src={packageIconURL(pkg.ID)}
                          alt={pkg.ID}
                          className="plugin-icon-img"
                          onError={e => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                            const fallback = e.currentTarget.parentElement?.querySelector('.plugin-icon-fallback');
                            if (fallback) (fallback as HTMLElement).style.display = 'flex';
                          }}
                        />
                        <div className="plugin-icon-fallback" style={{ display: 'none' }}>
                          <PackageIcon size={22} />
                        </div>
                      </div>

                      <div className="plugin-header-info">
                        <button
                          type="button"
                          className="plugin-title-link"
                          onClick={() => navigate(`/components/${encodeURIComponent(pkg.ID)}`)}
                        >
                          {pkg.ID}
                        </button>
                        <span className="plugin-version font-mono">v{pkg.Version}{latest[pkg.ID] && compareVersions(latest[pkg.ID].version, pkg.Version) === 1 ? ` → ${latest[pkg.ID].version}` : ''}</span>
                      </div>

                      <div className="plugin-switch-box">
                        <label className="plugin-switch-label">
                          <input type="checkbox" aria-label={pkg.Enabled ? ui.actionDisable : ui.actionEnable}
                            checked={pkg.Enabled} onChange={() => handleToggleEnable(pkg)} disabled={loading} />
                          <span className="plugin-switch-slider" />
                        </label>
                      </div>
                    </div>

                    <div className="plugin-card-body">
                      {updateFailures.includes(pkg.ID) && <p className="muted" role="status">{ui.updateCheckFailed}</p>}
                      {pkg.Source ? (
                        <p className="plugin-source-text font-mono" title={pkg.Source}>
                          {pkg.Source}
                        </p>
                      ) : (
                        <p className="plugin-source-placeholder" />
                      )}
                    </div>

                    <div className="plugin-card-footer">
                      <div className="plugin-status-slot">
                        {renderStatusDot(pkg)}
                      </div>

                      <div className="plugin-actions-slot">
                        {hasProblem ? (
                          <button
                            type="button"
                            className="plugin-view-reason-button"
                            onClick={() => {
                              setInspectingPkg(pkg);
                              setReasonModalOpen(true);
                            }}
                          >
                            <AlertCircle size={14} />
                            <span>{ui.viewReason}</span>
                          </button>
                        ) : null}

                        <button
                          type="button"
                          className="plugin-update-button"
                          onClick={() => handleOpenUpdate(pkg)}
                          title={ui.actionUpdate}
                        >
                          <ArrowUpCircle size={15} />
                          <span>{ui.actionUpdate}</span>
                        </button>

                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger asChild>
                            <button
                              type="button"
                              className="plugin-menu-trigger"
                              aria-label={ui.actions}
                            >
                              <MoreHorizontal size={18} aria-hidden="true" />
                            </button>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content
                              className="dropdown-menu-content"
                              side="bottom"
                              align="end"
                            >
                              <DropdownMenu.Item
                                className="dropdown-menu-item"
                                onSelect={() => navigate(`/components/${encodeURIComponent(pkg.ID)}`)}
                              >
                                <PackageIcon size={15} />
                                <span>{ui.actionDetails}</span>
                              </DropdownMenu.Item>

                              <DropdownMenu.Item
                                  className="dropdown-menu-item"
                                  onSelect={() => handleToggleEnable(pkg)}
                                >
                                  <Power size={15} />
                                  <span>{pkg.Enabled ? ui.actionDisable : ui.actionEnable}</span>
                                </DropdownMenu.Item>

                              {!isWebUI && pkg.Enabled && pkg.Active ? (
                                <DropdownMenu.Item
                                  className="dropdown-menu-item"
                                  onSelect={() => handleRestart(pkg)}
                                >
                                  <RefreshCw size={15} />
                                  <span>{ui.actionRestart}</span>
                                </DropdownMenu.Item>
                              ) : null}

                              {!isWebUI && pkg.State === 'Activated' ? (
                                <DropdownMenu.Item
                                  className="dropdown-menu-item"
                                  onSelect={() => handleReload(pkg)}
                                >
                                  <RotateCw size={15} />
                                  <span>{ui.actionReload}</span>
                                </DropdownMenu.Item>
                              ) : null}

                              <DropdownMenu.Separator className="dropdown-menu-separator" />
                              <DropdownMenu.Item
                                className="dropdown-menu-item is-danger"
                                onSelect={() => handleOpenUninstall(pkg)}
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
                );
              })}
            </div>
          )}

          {/* 分页控制器 */}
          {totalPages > 1 ? (
            <div className="plugins-pagination">
              <button
                type="button"
                className="pagination-button"
                disabled={visiblePage <= 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              >
                <ChevronLeft size={16} />
                <span>{ui.paginationPrev}</span>
              </button>

              <div className="pagination-numbers">
                {Array.from({ length: totalPages }, (_, idx) => idx + 1).map(num => (
                  <button
                    key={num}
                    type="button"
                    className={`pagination-number-btn ${visiblePage === num ? 'is-active' : ''}`}
                    onClick={() => setCurrentPage(num)}
                  >
                    {num}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="pagination-button"
                disabled={visiblePage >= totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              >
                <span>{ui.paginationNext}</span>
                <ChevronRight size={16} />
              </button>
            </div>
          ) : null}
        </>
      )}

      {/* 安装对话框 */}
      <Dialog.Root open={installModalOpen} onOpenChange={setInstallModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content plugins-dialog-content" aria-describedby={undefined}>
            <div className="dialog-header">
              <Dialog.Title className="dialog-title">{ui.installPackage}</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="dialog-close-button" aria-label={ui.close}>
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            <div className="install-mode-tabs">
              <button
                type="button"
                className={`install-mode-tab ${installMode === 'remote' ? 'is-active' : ''}`}
                onClick={() => setInstallMode('remote')}
              >
                <Download size={15} />
                <span>{ui.remoteInstall}</span>
              </button>
              <button
                type="button"
                className={`install-mode-tab ${installMode === 'upload' ? 'is-active' : ''}`}
                onClick={() => setInstallMode('upload')}
              >
                <Upload size={15} />
                <span>{ui.uploadInstall}</span>
              </button>
            </div>

            <div className="install-notice-banner">
              <AlertCircle size={16} className="notice-icon" />
              <span>{ui.installNotice}</span>
            </div>

            {installMode === 'remote' ? (
              <div className="dialog-form-body">
                <div className="dialog-form-field">
                  <label className="dialog-form-label">{ui.sourceLabel}</label>
                  <input
                    type="text"
                    className="dialog-form-input font-mono"
                    placeholder={ui.sourcePlaceholder}
                    value={remoteSource}
                    onChange={e => setRemoteSource(e.target.value)}
                  />
                </div>
                <label className="dialog-checkbox-label">
                  <input
                    type="checkbox"
                    checked={replaceConflict}
                    onChange={e => setReplaceConflict(e.target.checked)}
                  />
                  <span>{ui.replaceConflict}</span>
                </label>
              </div>
            ) : (
              <div className="dialog-form-body">
                <div className="dialog-form-field">
                  <label className="dialog-form-label">{ui.archiveFile}</label>
                  <input
                    type="file"
                    accept=".tar.gz,.tgz"
                    className="dialog-file-input"
                    onChange={e => setArchiveFile(e.target.files?.[0] || null)}
                  />
                </div>
                <div className="dialog-form-field">
                  <label className="dialog-form-label">{ui.releaseJSON}</label>
                  <input
                    type="file"
                    accept=".json"
                    className="dialog-file-input"
                    onChange={e => setReleaseFile(e.target.files?.[0] || null)}
                  />
                </div>
                <div className="dialog-form-field">
                  <label className="dialog-form-label">{ui.signatureFile}</label>
                  <input
                    type="file"
                    accept=".sig"
                    className="dialog-file-input"
                    onChange={e => setSignatureFile(e.target.files?.[0] || null)}
                  />
                </div>
                <div className="dialog-form-field">
                  <label className="dialog-form-label">{ui.publicKeyText}</label>
                  <textarea
                    className="dialog-textarea font-mono"
                    placeholder={ui.publicKeyText}
                    value={publicKeyText}
                    onChange={e => setPublicKeyText(e.target.value)}
                    rows={2}
                  />
                </div>
                <label className="dialog-checkbox-label">
                  <input
                    type="checkbox"
                    checked={replaceConflict}
                    onChange={e => setReplaceConflict(e.target.checked)}
                  />
                  <span>{ui.replaceConflict}</span>
                </label>
              </div>
            )}

            {errorBanner && <p className="plugins-error-banner" role="alert">{errorBanner}</p>}
            <div className="dialog-actions">
              <button
                type="button"
                className="dialog-button"
                onClick={() => setInstallModalOpen(false)}
              >
                {ui.cancel}
              </button>
              <button
                type="button"
                className="dialog-button is-primary"
                onClick={() => executeInstall(false)}
                disabled={installMode === 'remote' ? !remoteSource.trim() : !archiveFile || !releaseFile}
              >
                {ui.confirm}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* 更新对话框 */}
      <Dialog.Root open={updateModalOpen} onOpenChange={setUpdateModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content plugins-dialog-content" aria-describedby={undefined}>
            <div className="dialog-header">
              <Dialog.Title className="dialog-title">
                {ui.updatePackageTitle}: {updatingPkg?.ID}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="dialog-close-button" aria-label={ui.close}>
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            <div className="install-mode-tabs">
              <button
                type="button"
                className={`install-mode-tab ${updateMode === 'source' ? 'is-active' : ''}`}
                onClick={() => setUpdateMode('source')}
              >
                <Download size={15} />
                <span>{ui.updateFromSource}</span>
              </button>
              <button
                type="button"
                className={`install-mode-tab ${updateMode === 'upload' ? 'is-active' : ''}`}
                onClick={() => setUpdateMode('upload')}
              >
                <Upload size={15} />
                <span>{ui.updateUpload}</span>
              </button>
            </div>

            {updateMode === 'source' ? (
              <div className="dialog-form-body">
                <p className="dialog-hint-text">
                  {ui.sourceLabel}: <span className="font-mono">{updatingPkg?.Source || ui.none}</span>
                </p>
                {updatingPkg && repository(updatingPkg.Source) && <ReleasePreview repo={repository(updatingPkg.Source)!} onLoaded={() => setPreviewReady(true)} />}
              </div>
            ) : (
              <div className="dialog-form-body">
                <div className="dialog-form-field">
                  <label className="dialog-form-label">{ui.archiveFile}</label>
                  <input
                    type="file"
                    accept=".tar.gz,.tgz"
                    className="dialog-file-input"
                    onChange={e => setArchiveFile(e.target.files?.[0] || null)}
                  />
                </div>
                <div className="dialog-form-field">
                  <label className="dialog-form-label">{ui.releaseJSON}</label>
                  <input
                    type="file"
                    accept=".json"
                    className="dialog-file-input"
                    onChange={e => setReleaseFile(e.target.files?.[0] || null)}
                  />
                </div>
                <div className="dialog-form-field">
                  <label className="dialog-form-label">{ui.signatureFile}</label>
                  <input
                    type="file"
                    accept=".sig"
                    className="dialog-file-input"
                    onChange={e => setSignatureFile(e.target.files?.[0] || null)}
                  />
                </div>
                <div className="dialog-form-field">
                  <label className="dialog-form-label">{ui.publicKeyText}</label>
                  <textarea
                    className="dialog-textarea font-mono"
                    placeholder={ui.publicKeyText}
                    value={publicKeyText}
                    onChange={e => setPublicKeyText(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
            )}

            {errorBanner && <p className="plugins-error-banner" role="alert">{errorBanner}</p>}
            <div className="dialog-actions">
              <button
                type="button"
                className="dialog-button"
                onClick={() => setUpdateModalOpen(false)}
              >
                {ui.cancel}
              </button>
              <button
                type="button"
                className="dialog-button is-primary"
                onClick={() => executeUpdate(false)}
                disabled={updateMode === 'upload' ? (!archiveFile || !releaseFile) : !previewReady}
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

            <p className="dialog-subtitle">
              {ui.uninstallDesc.replace('{id}', uninstallingPkg?.ID || '')}
            </p>

            <div className="dialog-radio-group">
              <label className="dialog-radio-item">
                <input
                  type="radio"
                  name="purge-level"
                  checked={purgeLevel === 0}
                  onChange={() => setPurgeLevel(0)}
                />
                <span className="radio-text">{ui.purge0}</span>
              </label>
              <label className="dialog-radio-item">
                <input
                  type="radio"
                  name="purge-level"
                  checked={purgeLevel === 1}
                  onChange={() => setPurgeLevel(1)}
                />
                <span className="radio-text">{ui.purge1}</span>
              </label>
              <label className="dialog-radio-item">
                <input
                  type="radio"
                  name="purge-level"
                  checked={purgeLevel === 2}
                  onChange={() => setPurgeLevel(2)}
                />
                <span className="radio-text">{ui.purge2}</span>
              </label>
            </div>

            {errorBanner && <p className="plugins-error-banner" role="alert">{errorBanner}</p>}
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

            <p className="dialog-subtitle">{ui.confirmAffectedDesc}</p>

            <ul className="affected-items-list font-mono">
              {confirmAffected.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>

            {errorBanner && <p className="plugins-error-banner" role="alert">{errorBanner}</p>}
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
                  catch (error) {
                    setErrorBanner(error instanceof Error ? error.message : String(error));
                    await loadData();
                  }
                  finally { setConfirming(false); }
                }}
              >
                {ui.confirmContinue}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* 查看原因对话框 */}
      <Dialog.Root open={reasonModalOpen} onOpenChange={setReasonModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content plugins-dialog-content" aria-describedby={undefined}>
            <div className="dialog-header">
              <Dialog.Title className="dialog-title">
                {inspectingPkg?.ID} · {ui.viewReason}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="dialog-close-button" aria-label={ui.close}>
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            <div className="inspect-reason-body">
              <div className="inspect-field">
                <span className="inspect-label">{ui.instanceState}:</span>
                <span className="inspect-val font-mono">{inspectingPkg?.State}</span>
              </div>
              <div className="inspect-field">
                <span className="inspect-label">{ui.version}:</span>
                <span className="inspect-val font-mono">{inspectingPkg?.Version}</span>
              </div>
              {inspectingPkg?.Source ? (
                <div className="inspect-field">
                  <span className="inspect-label">{ui.sourceLabel}:</span>
                  <span className="inspect-val font-mono">{inspectingPkg.Source}</span>
                </div>
              ) : null}
            </div>

            {errorBanner && <p className="plugins-error-banner" role="alert">{errorBanner}</p>}
            <div className="dialog-actions">
              <button
                type="button"
                className="dialog-button is-primary"
                onClick={() => setReasonModalOpen(false)}
              >
                {ui.done}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* 警告信息对话框 */}
      <Dialog.Root open={warningsList !== null} onOpenChange={open => !open && setWarningsList(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content plugins-dialog-content" aria-describedby={undefined}>
            <div className="dialog-header">
              <Dialog.Title className="dialog-title">{ui.warningsTitle}</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="dialog-close-button" aria-label={ui.close}>
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            <ul className="affected-items-list font-mono">
              {warningsList?.map((warn, index) => (
                <li key={index}>{warn}</li>
              ))}
            </ul>

            {errorBanner && <p className="plugins-error-banner" role="alert">{errorBanner}</p>}
            <div className="dialog-actions">
              <button
                type="button"
                className="dialog-button is-primary"
                onClick={() => setWarningsList(null)}
              >
                {ui.done}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
