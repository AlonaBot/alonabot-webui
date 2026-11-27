import { useContext, useEffect, useRef, useState, type JSX } from 'react';
import {
  Activity,
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
  Search,
  Send,
  ShieldAlert,
  Sliders,
  Trash2,
  X,
} from 'lucide-react';
import { AdminAPIError, isConfirmationError } from '../api/client';
import { getPluginConfig, listCoreOptions, resolveCoreOptions, type ConfigOption } from '../api/config';
import { listInstances, type AdapterInstance } from '../api/instances';
import { getLogLevels, setPackageLogLevel, type LogLevels, type SourceLogLevel } from '../api/logs';
import {
  changePackage,
  getPluginRuntime,
  getPluginSleepPolicy,
  listGenerations,
  listPackages,
  listPluginJobs,
  packageIconURL,
  rollbackPackage,
  setPluginSleepPolicy,
  type Generation,
  type Package,
  type PluginRuntime,
  type SleepPolicy,
} from '../api/packages';
import { getAllowedInstances, setAllowedInstances, type AllowedInstances } from '../api/policies';
import { ChangelogDialog } from '../components/ChangelogDialog';
import { PluginPageFrame } from '../components/PluginPageFrame';
import { UninstallDialog } from '../features/plugins/PluginDialogs';
import { usePackageActions } from '../features/plugins/usePackageActions';
import { useUI } from '../i18n/UI';
import { cn } from '../lib/cn';
import { usePackages } from '../queries/packages';
import { Link, navigate, useQueryParam } from '../shell/router';
import { SearchContext } from '../shell/search';
import { useUISettings } from '../shell/settings';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { Dialog as SharedDialog } from '../ui/Dialog';
import { EmptyState, LoadingRows, Skeleton } from '../ui/EmptyState';
import { Menu, MenuItem, MenuSeparator } from '../ui/Menu';
import { PulseDot, type PulseTone } from '../ui/PulseDot';
import { RadioGroup } from '../ui/RadioGroup';
import { Select } from '../ui/Select';
import { SpotlightCard } from '../ui/SpotlightCard';
import { TabBar, type TabItem } from '../ui/Tabs';
import { toast } from '../ui/toast';
import { ConversationsPanel } from './ConversationsPanel';
import { DatabasePanel } from './DatabasePanel';
import { PluginConfigPanel } from './PluginConfigPanel';
import { PluginJobsPanel } from './PluginJobsPanel';
import { PluginSleepPanel } from './PluginSleepPanel';
import { StoragePanel } from './StoragePanel';

/** PluginDetailPage 展示组件详情、配置、数据管理、保留代次、回退与高级运行策略。 */
export function PluginDetailPage(props: { id: string; generations?: readonly Generation[] }): JSX.Element {
  const { id, generations } = props;
  const ui = useUI();
  const actions = usePackageActions();
  const { locale } = useUISettings();
  const { register } = useContext(SearchContext);

  const [showChangelog, setShowChangelog] = useState(false);
  const [autoContent, setAutoContent] = useState(true);
  const [pkg, setPkg] = useState<Package | null>(null);
  const cachedPackages = usePackages();
  const [loading, setLoading] = useState(true);
  const [retained, setRetained] = useState<readonly Generation[]>([]);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationQuery, setGenerationQuery] = useState('');
  const [confirming, setConfirming] = useState(false);
  const generationList = (generations ?? retained).filter(generation =>
    `${generation.id} ${generation.version}`.toLowerCase().includes(generationQuery.trim().toLowerCase()),
  );
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'config' | `page:${string}` | 'jobs' | 'data' | 'versions' | 'advanced'>(
    'config',
  );

  // 地址里的 ?tab= 决定当前标签，侧栏的插件页面入口与刷新后都能回到同一标签。
  const tabParam = useQueryParam('tab');
  useEffect(() => {
    if (
      tabParam === 'config' ||
      tabParam === 'jobs' ||
      tabParam === 'data' ||
      tabParam === 'versions' ||
      tabParam === 'advanced'
    ) {
      setActiveTab(tabParam);
    } else if (tabParam?.startsWith('page:')) {
      setActiveTab(tabParam as `page:${string}`);
    }
  }, [tabParam]);

  const [allowedInstances, setAllowedInstancesState] = useState<AllowedInstances | null>(null);
  const [allAdapterInstances, setAllAdapterInstances] = useState<AdapterInstance[]>([]);
  const [savingAllowed, setSavingAllowed] = useState(false);
  const [allowedQuery, setAllowedQuery] = useState('');
  const [allowedOptions, setAllowedOptions] = useState<ConfigOption[]>([]);
  const [allowedMore, setAllowedMore] = useState(false);

  const [configAvailable, setConfigAvailable] = useState(true);
  const [configRevision, setConfigRevision] = useState(0);
  const [hasJobs, setHasJobs] = useState(false);
  const [dataView, setDataView] = useState<'database' | 'storage' | 'conversations'>('database');

  const [logLevels, setLogLevels] = useState<LogLevels | null>(null);
  const [savingLogLevel, setSavingLogLevel] = useState(false);
  const [sleepPolicy, setSleepPolicy] = useState<SleepPolicy | null>(null);
  const [runtime, setRuntime] = useState<PluginRuntime | null>(null);
  const [sleepPolicyError, setSleepPolicyError] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [sleepWriteError, setSleepWriteError] = useState<string | null>(null);
  const [sleepLoading, setSleepLoading] = useState(true);
  const [savingSleep, setSavingSleep] = useState(false);
  const sleepRead = useRef(0);

  const [rollbackModalOpen, setRollbackModalOpen] = useState(false);
  const [targetGeneration, setTargetGeneration] = useState<Generation | null>(null);
  const [uninstallModalOpen, setUninstallModalOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmAffected, setConfirmAffected] = useState<string[]>([]);
  const [pendingConfirmAction, setPendingConfirmAction] = useState<(() => Promise<void>) | null>(null);

  const readSleep = async (): Promise<boolean> => {
    const revision = ++sleepRead.current;
    setSleepLoading(true);
    const results = await Promise.all([
      getPluginSleepPolicy(id)
        .then(value => {
          if (revision !== sleepRead.current) return false;
          setSleepPolicy(value);
          setSleepPolicyError(null);
          return true;
        })
        .catch(error => {
          if (revision === sleepRead.current) {
            setSleepPolicyError(error instanceof Error ? error.message : String(error));
          }
          return false;
        }),
      getPluginRuntime(id)
        .then(value => {
          if (revision !== sleepRead.current) return false;
          setRuntime(value);
          setRuntimeError(null);
          return true;
        })
        .catch(error => {
          if (revision === sleepRead.current) {
            setRuntimeError(error instanceof Error ? error.message : String(error));
          }
          return false;
        }),
    ]);
    if (revision !== sleepRead.current) return false;
    setSleepLoading(false);
    return results.every(Boolean);
  };

  const saveSleep = async (policy: string | null): Promise<boolean> => {
    setSavingSleep(true);
    setSleepWriteError(null);
    let written = true;
    try {
      await setPluginSleepPolicy(id, policy);
    } catch (error) {
      written = false;
      setSleepWriteError(error instanceof Error ? error.message : String(error));
    }
    const read = await readSleep();
    setSavingSleep(false);
    return written && read;
  };

  const loadData = async (): Promise<void> => {
    setGenerationError(null);
    const report = (error: unknown): void =>
      setErrorBanner(previous => [previous, error instanceof Error ? error.message : String(error)].filter(Boolean).join('\n'));
    await Promise.all([
      listPackages()
        .then(async packages => {
          const found = packages.find(item => item.ID === id && !item.Uninstalled);
          setPkg(found ?? null);
          if (!found) setErrorBanner(ui.packageNotFound);
          if (found?.Role === 'plugin' || found?.Role === 'agent') await readSleep();
        })
        .catch(report),
      getLogLevels().then(setLogLevels).catch(report),
      generations === undefined
        ? listGenerations(id)
            .then(setRetained)
            .catch(error => {
              setRetained([]);
              setGenerationError(error instanceof Error ? error.message : String(error));
            })
        : Promise.resolve(),
      getAllowedInstances(id).then(setAllowedInstancesState).catch(report),
      listInstances().then(setAllAdapterInstances).catch(report),
      getPluginConfig(id)
        .then(cfg => {
          const available = cfg.schema !== null && typeof cfg.schema === 'object' && Object.keys(cfg.schema).length > 0;
          setConfigAvailable(available);
          if (!available) setActiveTab(previous => (previous === 'config' ? 'data' : previous));
        })
        .catch(error => {
          if (error instanceof AdminAPIError && error.status === 400 && error.message === 'webui has no config') {
            setConfigAvailable(false);
            setActiveTab(previous => (previous === 'config' ? 'versions' : previous));
          } else {
            report(error);
          }
        }),
      listPluginJobs(id)
        .then(result => setHasJobs(result.jobs.length > 0))
        .catch(() => setHasJobs(true)),
    ]);
    setConfigRevision(value => value + 1);
    setLoading(false);
  };

  const handleSaveAllowedInstances = async (value: AllowedInstances): Promise<void> => {
    setSavingAllowed(true);
    try {
      await setAllowedInstances(id, value);
      setAllowedInstancesState(await getAllowedInstances(id));
      toast.success(ui.saved);
    } catch (err: unknown) {
      toast.error(err);
      try {
        setAllowedInstancesState(await getAllowedInstances(id));
      } catch (error) {
        setErrorBanner(previous => `${previous}\n${error instanceof Error ? error.message : String(error)}`);
        setAllowedInstancesState(null);
      }
    } finally {
      setSavingAllowed(false);
    }
  };

  useEffect(() => {
    void loadData();
    return () => {
      sleepRead.current += 1;
    };
  }, [id]);

  useEffect(() => {
    let active = true;
    listPackages()
      .then(values => {
        if (active) setPkg(values.find(value => value.ID === id && !value.Uninstalled) ?? null);
      })
      .catch(error => {
        if (active) setErrorBanner(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
    };
  }, [id, locale]);

  useEffect(() => {
    if (activeTab !== 'advanced' || !allowedInstances) return;
    let active = true;
    Promise.all([
      listCoreOptions('core.adapter_instances', allowedQuery, {}, locale),
      resolveCoreOptions('core.adapter_instances', allowedInstances.instances, {}, locale),
    ])
      .then(([page, resolved]) => {
        if (active) {
          setAllowedOptions([
            ...resolved.options,
            ...page.options.filter(option => !resolved.options.some(value => value.value === option.value)),
          ]);
          setAllowedMore(page.more);
        }
      })
      .catch(error => {
        if (active) setErrorBanner(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
    };
  }, [activeTab, allowedQuery, locale, allowedInstances]);

  const handleToggleEnable = async (): Promise<void> => {
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
        toast.error(err);
        await loadData();
      }
    }
  };

  const handleRestart = async (): Promise<void> => {
    if (!pkg) return;
    try {
      await changePackage('restart', pkg.ID);
      await loadData();
    } catch (err: unknown) {
      toast.error(err);
      await loadData();
    }
  };

  const handleReload = async (): Promise<void> => {
    if (!pkg) return;
    try {
      await changePackage('reload', pkg.ID);
      await loadData();
    } catch (err: unknown) {
      toast.error(err);
      await loadData();
    }
  };

  useEffect(() => {
    return register([
      ...(pkg && pkg.Role !== 'webui' && pkg.State === 'Activated'
        ? [
            {
              id: `plugin-detail-reload-${id}`,
              title: `${id}: ${ui.actionReload}`,
              section: ui.searchActions,
              keywords: [id, 'reload', 'restart'],
              run: () => void handleReload(),
            },
          ]
        : []),
      {
        id: `plugin-detail-refresh-${id}`,
        title: `${id}: ${ui.refresh}`,
        section: ui.searchActions,
        keywords: [id, 'refresh'],
        run: () => void loadData(),
      },
    ]);
  }, [id, pkg, register, ui]);

  const handleRollbackClick = (gen: Generation): void => {
    setTargetGeneration(gen);
    setRollbackModalOpen(true);
  };

  const executeRollback = async (confirm = false): Promise<void> => {
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
        toast.error(err);
        await loadData();
      }
    }
  };

  const handleLogLevelChange = async (newLevel: SourceLogLevel): Promise<void> => {
    if (!pkg) return;
    setSavingLogLevel(true);
    try {
      const updated = await setPackageLogLevel(pkg.ID, newLevel);
      setLogLevels(updated);
      toast.success(ui.logLevelSaved);
    } catch (err: unknown) {
      toast.error(err);
      await loadData();
    } finally {
      setSavingLogLevel(false);
    }
  };

  const currentLevelSetting: SourceLogLevel = logLevels?.sources[id] ?? 'inherit';

  const renderStatus = (): JSX.Element | null => {
    if (!pkg) return null;
    const state = pkg.Role === 'plugin' || pkg.Role === 'agent' ? (runtime?.state ?? pkg.RuntimeState) : undefined;
    let tone: PulseTone = 'off';
    let label: string = ui.stateStopped;

    if (state) {
      const toneMap: Record<string, PulseTone> = {
        STOPPED: 'off',
        WAKING: 'waking',
        ACTIVE: 'running',
        QUIESCING: 'waking',
        SUSPENDED: 'idle',
        FAILED: 'danger',
      };
      tone = toneMap[state] ?? 'idle';
      label = ui[`runtime${state}`];
    } else if (!pkg.Enabled) {
      tone = 'off';
      label = ui.stateStopped;
    } else if (pkg.State === 'Activated') {
      tone = 'running';
      label = pkg.Role === 'webui' ? ui.stateActivated : ui.stateRunning;
    } else {
      tone = 'danger';
      label = pkg.State || ui.stateDegraded;
    }

    const badgeTone =
      tone === 'running'
        ? 'bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)] text-[var(--color-success)]'
        : tone === 'danger'
          ? 'bg-[color-mix(in_srgb,var(--color-danger)_14%,transparent)] text-[var(--color-danger)]'
          : tone === 'waking'
            ? 'bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)] text-[var(--color-warning-ink)]'
            : 'bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]';

    return (
      <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', badgeTone)}>
        <PulseDot tone={tone} size="sm" />
        <span>{label}</span>
      </span>
    );
  };

  const shown = pkg ?? cachedPackages.data?.find(item => item.ID === id && !item.Uninstalled) ?? null;
  const isWebUI = pkg?.Role === 'webui';
  const hasDatabase = (generations ?? retained).some(generation => generation.has_db);
  const shownDataView = !hasDatabase && dataView === 'database' ? 'storage' : dataView;
  const pages = pkg?.pages?.filter(page => page.purpose !== 'instance_config');
  const hasSleep = pkg?.Role === 'plugin' || pkg?.Role === 'agent';

  const tabs: TabItem[] = [
    ...(configAvailable
      ? [
          {
            value: 'config',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Sliders size={15} aria-hidden="true" />
                {ui.tabConfig}
              </span>
            ),
          },
        ]
      : []),
    ...(!isWebUI && pages
      ? pages.map(p => ({
          value: `page:${p.path}`,
          label: (
            <span className="inline-flex items-center gap-1.5">
              <FileText size={15} aria-hidden="true" />
              {p.title}
            </span>
          ),
        }))
      : []),
    ...(!isWebUI && hasJobs
      ? [
          {
            value: 'jobs',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={15} aria-hidden="true" />
                {ui.tabJobs}
              </span>
            ),
          },
        ]
      : []),
    {
      value: 'data',
      label: (
        <span className="inline-flex items-center gap-1.5">
          <Database size={15} aria-hidden="true" />
          {ui.dataTab}
        </span>
      ),
    },
    {
      value: 'versions',
      label: (
        <span className="inline-flex items-center gap-1.5">
          <History size={15} aria-hidden="true" />
          {ui.tabVersionHistory}
        </span>
      ),
    },
    {
      value: 'advanced',
      label: (
        <span className="inline-flex items-center gap-1.5">
          <ShieldAlert size={15} aria-hidden="true" />
          {ui.tabAdvanced}
        </span>
      ),
    },
  ];

  const dataSubTabs: TabItem[] = [
    ...(hasDatabase ? [{ value: 'database', label: ui.database }] : []),
    { value: 'storage', label: ui.storage },
    ...(pkg?.Role === 'agent' ? [{ value: 'conversations', label: ui.conversations }] : []),
  ];

  const allowedCandidates = allowedInstances
    ? [
        ...new Set([
          ...allAdapterInstances.map(instance => instance.instance_id),
          ...allowedInstances.instances,
          ...allowedOptions.map(option => option.value),
        ]),
      ].filter(
        value =>
          value.toLowerCase().includes(allowedQuery.trim().toLowerCase()) ||
          allowedOptions.some(
            option => option.value === value && option.label.toLowerCase().includes(allowedQuery.trim().toLowerCase()),
          ),
      )
    : [];

  return (
    <div className="space-y-5">
      {pkg && (
        <>
          <ChangelogDialog
            component={id}
            name={pkg.Name || id}
            version={pkg.Version}
            open={showChangelog}
            onClose={() => setShowChangelog(false)}
          />
          <ChangelogDialog
            component={id}
            name={pkg.Name || id}
            version={pkg.Version}
            open={autoContent}
            automatic
            onClose={() => setAutoContent(false)}
          />
        </>
      )}

      {/* 头部玻璃卡片 */}
      <SpotlightCard className="p-5">
        <div className="mb-3 flex items-center gap-1.5 text-xs text-[var(--color-ink-muted)]">
          <Link to="/components" className="font-medium text-[var(--color-accent)] hover:underline">
            {ui.pluginBreadcrumb}
          </Link>
          <ChevronRight size={13} aria-hidden="true" />
          <span className="font-mono">{id}</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-2)]">
              <img
                src={packageIconURL(id)}
                alt={id}
                className="h-full w-full object-cover"
                onError={e => {
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.nextElementSibling;
                  if (fallback instanceof HTMLElement) fallback.style.display = 'flex';
                }}
              />
              <span className="hidden items-center justify-center text-[var(--color-ink-muted)]">
                <PackageIcon size={24} />
              </span>
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                {shown ? (
                  <h1 className="text-xl font-bold tracking-tight text-[var(--color-ink)]">{shown.Name || id}</h1>
                ) : (
                  <Skeleton width={180} height={28} />
                )}
                {renderStatus()}
              </div>
              {shown ? (
                <p className="truncate font-mono text-xs text-[var(--color-ink-muted)]">{shown.Source || id}</p>
              ) : (
                <Skeleton width={240} height={14} />
              )}
              {shown?.Description && (
                <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">{shown.Description}</p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!isWebUI && pkg?.State === 'Activated' && (
              <Button
                size="sm"
                variant="secondary"
                iconOnly
                disabled={loading}
                title={ui.actionReload}
                aria-label={ui.actionReload}
                onClick={() => void handleReload()}
              >
                <RotateCw size={15} />
              </Button>
            )}

            <Menu
              align="end"
              trigger={
                <Button size="sm" variant="secondary" iconOnly aria-label={ui.actions}>
                  <MoreHorizontal size={17} />
                </Button>
              }
            >
              {pkg && (
                <MenuItem icon={<Power size={15} />} onSelect={() => void handleToggleEnable()}>
                  {pkg.Enabled ? ui.actionDisable : ui.actionEnable}
                </MenuItem>
              )}
              {!isWebUI && pkg?.Enabled && pkg.Active && (
                <MenuItem icon={<RefreshCw size={15} />} onSelect={() => void handleRestart()}>
                  {ui.actionRestart}
                </MenuItem>
              )}
              <MenuSeparator />
              <MenuItem icon={<Trash2 size={15} />} tone="danger" onSelect={() => setUninstallModalOpen(true)}>
                {ui.actionUninstall}
              </MenuItem>
            </Menu>
          </div>
        </div>
      </SpotlightCard>

      {errorBanner && (
        <div className="plugins-error-banner" role="alert">
          <span className="whitespace-pre-wrap break-words">{errorBanner}</span>
          <button
            type="button"
            className="error-banner-close"
            aria-label={ui.close}
            onClick={() => setErrorBanner(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {loading ? (
        <SpotlightCard className="p-5">
          <LoadingRows rows={3} />
        </SpotlightCard>
      ) : (
        <>
          <TabBar
            value={activeTab}
            onValueChange={next => setActiveTab(next as typeof activeTab)}
            aria-label={shown?.Name || id}
            items={tabs}
          />

          <div className="space-y-4">
            {configAvailable && activeTab === 'config' && (
              <SpotlightCard className="p-5">
                <PluginConfigPanel key={configRevision} id={id} />
              </SpotlightCard>
            )}

            {!isWebUI &&
              pages?.map(p =>
                activeTab === `page:${p.path}` ? (
                  <PluginPageFrame key={p.path} id={id} path={p.path} title={p.title} />
                ) : null,
              )}

            {!isWebUI && hasJobs && activeTab === 'jobs' && <PluginJobsPanel id={id} />}

            {activeTab === 'data' && (
              <div className="space-y-4">
                {dataSubTabs.length > 1 && (
                  <TabBar
                    variant="pill"
                    value={shownDataView}
                    onValueChange={next => setDataView(next as typeof dataView)}
                    aria-label={ui.dataTab}
                    items={dataSubTabs}
                  />
                )}
                {shownDataView === 'database' ? (
                  <>
                    {generationError && (
                      <pre role="alert" className="form-error whitespace-pre-wrap">
                        {generationError}
                      </pre>
                    )}
                    <DatabasePanel id={id} generations={generations ?? retained} />
                  </>
                ) : shownDataView === 'storage' ? (
                  <StoragePanel id={id} hasDatabase={hasDatabase} />
                ) : (
                  <ConversationsPanel id={id} />
                )}
              </div>
            )}

            {activeTab === 'versions' && (
              <div className="space-y-4">
                <SpotlightCard className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap gap-6">
                      <div className="space-y-1">
                        <span className="block text-xs font-medium text-[var(--color-ink-muted)]">
                          {ui.currentVersion}
                        </span>
                        <span className="block font-mono text-lg font-bold text-[var(--color-ink)]">
                          {pkg?.Version ?? <Skeleton width={60} height={18} />}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-xs font-medium text-[var(--color-ink-muted)]">
                          {ui.activeGeneration}
                        </span>
                        <span className="block font-mono text-lg font-bold text-[var(--color-accent-strong)]">
                          {pkg?.Active || ui.none}
                        </span>
                      </div>
                    </div>
                    <Button variant="soft" size="sm" icon={<FileText size={14} />} onClick={() => setShowChangelog(true)}>
                      {ui.viewChangelog}
                    </Button>
                  </div>
                </SpotlightCard>

                <SpotlightCard className="p-3.5">
                  <div className="relative max-w-[320px]">
                    <Search
                      size={14}
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-ink-muted)]"
                    />
                    <input
                      type="search"
                      aria-label={ui.filterGenerations}
                      placeholder={ui.filterGenerations}
                      value={generationQuery}
                      onChange={event => setGenerationQuery(event.target.value)}
                      className="h-9 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] pr-3 pl-8.5 text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
                    />
                  </div>
                </SpotlightCard>

                {generationError ? (
                  <p role="alert" className="form-error">
                    {generationError}
                  </p>
                ) : generationList.length > 0 ? (
                  <SpotlightCard className="overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse font-mono text-xs">
                        <thead>
                          <tr className="border-b border-[var(--color-line)] text-left font-sans text-xs font-medium text-[var(--color-ink-muted)]">
                            <th className="px-5 py-3">{ui.generation}</th>
                            <th className="px-4 py-3">{ui.version}</th>
                            <th className="px-4 py-3">{ui.createdAt}</th>
                            <th className="px-4 py-3">{ui.database}</th>
                            <th className="px-4 py-3 text-right">{ui.actions}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-line)]/70">
                          {generationList.map(gen => (
                            <tr
                              key={gen.id}
                              className={cn(
                                'transition-colors hover:bg-[var(--color-surface-2)]/50',
                                gen.active && 'bg-[var(--color-accent-soft)]/35',
                              )}
                            >
                              <td className="px-5 py-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    title={gen.id}
                                    className="rounded-md bg-[var(--color-surface-2)] px-2 py-0.5 text-[var(--color-ink)]"
                                  >
                                    {gen.id}
                                  </span>
                                  {gen.active && (
                                    <span className="rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 font-sans text-[11px] font-semibold text-[var(--color-accent-strong)]">
                                      {ui.activeGeneration}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-[var(--color-ink)]">{gen.version}</td>
                              <td className="whitespace-nowrap px-4 py-3 text-[var(--color-ink-muted)]">
                                {gen.created_at}
                              </td>
                              <td className="px-4 py-3">
                                {gen.has_db ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] px-2 py-0.5 font-sans text-[11px] font-medium text-[var(--color-success)]">
                                    <Database size={12} aria-hidden="true" />
                                    {ui.databasePresent}
                                  </span>
                                ) : (
                                  <span className="text-[var(--color-ink-muted)]">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {!gen.active ? (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    icon={<RotateCcw size={13} />}
                                    onClick={() => handleRollbackClick(gen)}
                                  >
                                    {ui.rollback}
                                  </Button>
                                ) : (
                                  <span className="text-[var(--color-ink-muted)]">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </SpotlightCard>
                ) : (
                  <SpotlightCard className="p-6">
                    <EmptyState icon={<History size={22} />} title={ui.noGenerations} />
                  </SpotlightCard>
                )}
              </div>
            )}

            {activeTab === 'advanced' && (
              <div className="space-y-4">
                {/* 运行与日志级别卡片 */}
                <SpotlightCard className="p-5">
                  <div className="mb-4 flex items-center gap-2.5">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                      <Activity size={16} aria-hidden="true" />
                    </span>
                    <h3 className="text-base font-semibold text-[var(--color-ink)]">
                      {hasSleep ? ui.runtimeStatus : ui.logLevel}
                    </h3>
                  </div>

                  <div className="divide-y divide-[var(--color-line)]/70">
                    <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                      <div className="min-w-0 flex-1 space-y-1">
                        <label htmlFor="plugin-log-level" className="block text-sm font-medium text-[var(--color-ink)]">
                          {ui.logLevel}
                        </label>
                        {hasSleep && (
                          <p className="text-xs leading-relaxed text-[var(--color-ink-muted)]">{ui.pluginLogLevelDesc}</p>
                        )}
                      </div>
                      <Select
                        id="plugin-log-level"
                        variant="filled"
                        aria-label={ui.logLevel}
                        value={currentLevelSetting}
                        disabled={savingLogLevel || !logLevels}
                        className="w-full min-w-[180px] font-mono sm:w-[210px]"
                        options={[
                          {
                            value: 'inherit',
                            label: ui.logLevelInherit.replace('{level}', logLevels?.global ?? '…'),
                          },
                          { value: 'debug', label: ui.logDebug },
                          { value: 'info', label: ui.logInfo },
                          { value: 'warn', label: ui.logWarn },
                          { value: 'error', label: ui.logError },
                          { value: 'critical', label: ui.logCritical },
                          { value: 'off', label: ui.logOff },
                        ]}
                        onValueChange={next => void handleLogLevelChange(next as SourceLogLevel)}
                      />
                    </div>

                    {hasSleep && (
                      <div className="pt-4">
                        <PluginSleepPanel
                          policy={sleepPolicy}
                          runtime={runtime}
                          policyError={sleepPolicyError}
                          runtimeError={runtimeError}
                          writeError={sleepWriteError}
                          loading={sleepLoading}
                          busy={savingSleep}
                          onSubmit={saveSleep}
                        />
                      </div>
                    )}
                  </div>
                </SpotlightCard>

                {/* 发信许可卡片 */}
                {!isWebUI && allowedInstances && (
                  <SpotlightCard className="p-5">
                    <div className="mb-3 flex items-center gap-2.5">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                        <Send size={16} aria-hidden="true" />
                      </span>
                      <div>
                        <h3 className="text-base font-semibold text-[var(--color-ink)]">{ui.allowedInstances}</h3>
                        <p className="text-xs text-[var(--color-ink-muted)]">{ui.allowedInstancesDesc}</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <RadioGroup
                        aria-label={ui.allowedInstances}
                        disabled={savingAllowed}
                        value={allowedInstances.all ? 'all' : 'some'}
                        options={[
                          { value: 'all', label: ui.allInstancesAllowed },
                          { value: 'some', label: ui.selectAllowedInstances },
                        ]}
                        onValueChange={mode => {
                          const updated: AllowedInstances =
                            mode === 'all'
                              ? { all: true, instances: [] }
                              : { all: false, instances: allowedInstances.instances };
                          setAllowedInstancesState(updated);
                          void handleSaveAllowedInstances(updated);
                        }}
                      />

                      {!allowedInstances.all && (
                        <div className="space-y-2.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)]/50 p-3.5">
                          <div className="relative">
                            <Search
                              size={14}
                              aria-hidden="true"
                              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-ink-muted)]"
                            />
                            <input
                              type="search"
                              aria-label={ui.searchInstances}
                              placeholder={ui.searchInstances}
                              value={allowedQuery}
                              onChange={event => setAllowedQuery(event.target.value)}
                              className="h-9 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] pr-3 pl-8.5 text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                            />
                          </div>
                          {allowedMore && <p className="text-xs text-[var(--color-ink-muted)]">{ui.searchMoreOptions}</p>}
                          <div className="space-y-1">
                            {allowedCandidates.length === 0 ? (
                              <p className="py-4 text-center text-xs text-[var(--color-ink-muted)]">{ui.noInstances}</p>
                            ) : (
                              allowedCandidates.map(instanceID => {
                                const inst = allAdapterInstances.find(instance => instance.instance_id === instanceID);
                                const option = allowedOptions.find(item => item.value === instanceID);
                                const checked = allowedInstances.instances.includes(instanceID);
                                return (
                                  <label
                                    key={instanceID}
                                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs transition-colors hover:bg-[var(--color-surface)]"
                                  >
                                    <Checkbox
                                      checked={checked}
                                      disabled={savingAllowed}
                                      onCheckedChange={next => {
                                        const prev = allowedInstances.instances;
                                        const updatedList = next
                                          ? [...prev, instanceID]
                                          : prev.filter(x => x !== instanceID);
                                        const updated: AllowedInstances = { all: false, instances: updatedList };
                                        setAllowedInstancesState(updated);
                                        void handleSaveAllowedInstances(updated);
                                      }}
                                    />
                                    <span className="font-mono text-[var(--color-ink)]">
                                      {option?.label ?? instanceID}
                                      {!inst && !option && ` (${ui.optionNotFound})`}
                                    </span>
                                    {inst && (
                                      <span className="font-mono text-[var(--color-ink-muted)]">
                                        ({inst.adapter_id})
                                      </span>
                                    )}
                                  </label>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </SpotlightCard>
                )}

                {/* 卸载危险区 */}
                <SpotlightCard
                  glowTone="danger"
                  className="border-[color-mix(in_srgb,var(--color-danger)_35%,var(--color-glass-border))] p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold text-[var(--color-danger)]">{ui.actionUninstall}</h3>
                      <p className="text-xs leading-relaxed text-[var(--color-ink-muted)]">
                        {ui.uninstallDesc.replace('{id}', id)}
                      </p>
                    </div>
                    <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => setUninstallModalOpen(true)}>
                      {ui.actionUninstall}
                    </Button>
                  </div>
                </SpotlightCard>
              </div>
            )}
          </div>
        </>
      )}

      {/* 回退确认对话框 */}
      <SharedDialog
        open={rollbackModalOpen}
        onOpenChange={setRollbackModalOpen}
        title={ui.rollbackTitle}
        size="md"
        footer={
          <>
            <Button
              onClick={() => {
                setRollbackModalOpen(false);
                setTargetGeneration(null);
              }}
            >
              {ui.cancel}
            </Button>
            <Button variant="primary" onClick={() => void executeRollback(false)}>
              {ui.confirm}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">
          {ui.rollbackDesc
            .replace('{id}', id)
            .replace('{generation}', targetGeneration?.id || '')
            .replace('{version}', targetGeneration?.version || '')}
        </p>
      </SharedDialog>

      {uninstallModalOpen && pkg && (
        <UninstallDialog
          pkg={pkg}
          onClose={() => setUninstallModalOpen(false)}
          onUninstall={async purge => {
            const done = await actions.uninstall(pkg, purge);
            if (done) navigate('/components', { replace: true });
            return done;
          }}
        />
      )}
      {actions.dialogs}

      {/* 409 确认对话框 */}
      <SharedDialog
        open={confirmModalOpen}
        onOpenChange={open => {
          if (!confirming) {
            setConfirmModalOpen(open);
            if (!open) setPendingConfirmAction(null);
          }
        }}
        title={ui.confirmAffectedTitle}
        size="md"
        footer={
          <>
            <Button
              onClick={() => {
                setConfirmModalOpen(false);
                setPendingConfirmAction(null);
              }}
            >
              {ui.cancel}
            </Button>
            <Button
              variant="primary"
              loading={confirming}
              onClick={async () => {
                const action = pendingConfirmAction;
                setPendingConfirmAction(null);
                setConfirmModalOpen(false);
                setConfirming(true);
                try {
                  await action?.();
                } catch (error) {
                  toast.error(error);
                  await loadData();
                } finally {
                  setConfirming(false);
                }
              }}
            >
              {ui.confirmContinue}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">{ui.confirmAffectedDesc}</p>
          <ul className="m-0 space-y-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)]/70 px-4 py-3 font-mono text-xs text-[var(--color-ink)]">
            {confirmAffected.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      </SharedDialog>
    </div>
  );
}
