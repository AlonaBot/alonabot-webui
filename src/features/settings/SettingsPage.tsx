import { useEffect, useState, type FormEvent, type JSX, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpCircle, ExternalLink, Globe, HardDrive, KeyRound, Laptop, LogOut, Moon, Palette, Shield, Sliders, Sun, Trash2, Wrench } from 'lucide-react';
import { rotateAdminToken } from '../../api/auth';
import {
  clearBuildEnvironment,
  getBuildEnvironment,
  getCore,
  getCoreConfigDiagnostics,
  getCoreSleep,
  getDefaultLocale,
  getDownloadSettings,
  getGitHubSettings,
  pruneCoreConfig,
  setCoreSleep,
  setDefaultLocale,
  setDownloadSettings,
  setGitHubSettings,
  type CoreSleep,
  type DownloadSettings,
  type GitHubSettings,
} from '../../api/core';
import { getCoreLifecycle } from '../../api/lifecycle';
import { getLogLevels, setGlobalLogLevel, type GlobalLogLevel } from '../../api/logs';
import { getLatestRelease } from '../../api/webui';
import { ChangelogDialog } from '../../components/ChangelogDialog';
import { useUI } from '../../i18n/UI';
import { compareVersions } from '../../pages/versions';
import { PageHeader } from '../../shell/PageHeader';
import { Link } from '../../shell/router';
import { useUISettings } from '../../shell/settings';
import { Button } from '../../ui/Button';
import { ConfirmDialog, Dialog } from '../../ui/Dialog';
import { Disclosure } from '../../ui/Disclosure';
import { Skeleton } from '../../ui/EmptyState';
import { PulseDot } from '../../ui/PulseDot';
import { Select } from '../../ui/Select';
import { SpotlightCard } from '../../ui/SpotlightCard';
import { TabBar } from '../../ui/Tabs';
import { toast } from '../../ui/toast';

const storeMirrorKey = 'alonabot.webui.storeMirror';
const custom = '\u0000custom';

function Row({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col justify-between gap-3 border-t border-[var(--color-line)]/70 py-3.5 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <strong className="block text-sm font-semibold text-[var(--color-ink)]">{title}</strong>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-[var(--color-ink-muted)]">{description}</span>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{children}</div>
    </div>
  );
}

function PresetField({
  value,
  presets,
  placeholder,
  onCommit,
  ariaLabel,
}: {
  value: string;
  presets: { value: string; label: string }[];
  placeholder: string;
  onCommit: (value: string) => Promise<void>;
  ariaLabel: string;
}): JSX.Element {
  const ui = useUI();
  const known = presets.some(item => item.value === value);
  const [mode, setMode] = useState(known ? value : custom);
  const [draft, setDraft] = useState(known ? '' : value);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setMode(known ? value : custom);
    setDraft(known ? '' : value);
  }, [value, known]);

  const commit = async (next: string): Promise<void> => {
    setPending(true);
    try {
      await onCommit(next);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <Select
        aria-label={ariaLabel}
        value={mode}
        disabled={pending}
        options={[...presets, { value: custom, label: ui.customValue }]}
        onValueChange={next => {
          setMode(next);
          if (next !== custom) void commit(next);
        }}
      />
      {mode === custom && (
        <form
          className="flex items-center gap-2"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void commit(draft.trim());
          }}
        >
          <input
            className="alona-input w-56 font-mono text-xs"
            value={draft}
            placeholder={placeholder}
            aria-label={ariaLabel}
            spellCheck={false}
            onChange={event => setDraft(event.target.value)}
          />
          <Button type="submit" size="sm" variant="primary" loading={pending} disabled={draft.trim() === value}>
            {ui.save}
          </Button>
        </form>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** 系统设置：左侧快速锚点 + 外观、Core 版本与生命周期、安全、网络与下载、系统运行卡片。 */
export function SettingsPage(): JSX.Element {
  const ui = useUI();
  const client = useQueryClient();
  const { locale, setLocale, theme, setTheme, logout, tokenRotated } = useUISettings();

  const core = useQuery({ queryKey: ['core-info'], queryFn: getCore });
  const lifecycle = useQuery({ queryKey: ['core-lifecycle'], queryFn: getCoreLifecycle, retry: false });
  const latestRelease = useQuery({ queryKey: ['core-latest-release'], queryFn: () => getLatestRelease('AlonaBot/AlonaBot'), retry: false });
  const logs = useQuery({ queryKey: ['log-levels'], queryFn: getLogLevels });
  const coreLocale = useQuery({ queryKey: ['core-locale'], queryFn: getDefaultLocale });
  const diagnostics = useQuery({ queryKey: ['core-diagnostics'], queryFn: getCoreConfigDiagnostics });
  const sleep = useQuery({ queryKey: ['core-sleep'], queryFn: getCoreSleep });
  const downloads = useQuery({ queryKey: ['core-downloads'], queryFn: getDownloadSettings });
  const github = useQuery({ queryKey: ['core-github'], queryFn: getGitHubSettings });
  const build = useQuery({ queryKey: ['build-environment'], queryFn: getBuildEnvironment });

  const [storeMirror, setStoreMirror] = useState(() => localStorage.getItem(storeMirrorKey) ?? 'auto');
  const [sleepDraft, setSleepDraft] = useState<Pick<CoreSleep, 'mode' | 'idle_timeout'> | null>(null);
  const [rotating, setRotating] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);

  const write = async (action: () => Promise<unknown>, keys: string[][], success = ui.saveSuccess): Promise<void> => {
    try {
      await action();
      toast.success(success);
    } catch (error: unknown) {
      toast.error(error);
      throw error;
    } finally {
      for (const key of keys) void client.invalidateQueries({ queryKey: key });
    }
  };
  const saveDownload = (patch: Partial<DownloadSettings>, note?: string): Promise<void> =>
    write(() => setDownloadSettings(patch), [['core-downloads']], note);
  const saveGitHub = (patch: Partial<GitHubSettings>): Promise<void> => {
    if (!github.data) return Promise.resolve();
    return write(() => setGitHubSettings({ ...github.data, ...patch }), [['core-github']]);
  };
  const sleepValue = sleepDraft ?? sleep.data;

  const hasUpdate = Boolean(
    latestRelease.data && core.data && compareVersions(latestRelease.data.version, core.data.version) === 1,
  );

  const anchors = [
    { id: 'general', label: ui.general, icon: Palette },
    { id: 'core-lifecycle', label: ui.coreLifecycleSection, icon: Wrench },
    { id: 'security', label: ui.security, icon: Shield },
    { id: 'network', label: ui.networkAndDownloads, icon: Globe },
    { id: 'system', label: ui.system, icon: Sliders },
  ];

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <PageHeader
        right={
          <Button variant="danger" size="sm" icon={<LogOut size={15} />} onClick={() => void logout().catch(error => toast.error(error))}>
            {ui.logout}
          </Button>
        }
      />

      {/* 桌面端左侧锚点导航 */}
      <aside className="hidden w-52 shrink-0 lg:sticky lg:top-20 lg:block">
        <nav aria-label={ui.settings} className="alona-glass flex flex-col gap-1 rounded-[18px] p-2">
          {anchors.map(anchor => (
            <a
              key={anchor.id}
              href={`#${anchor.id}`}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent-strong)]"
            >
              <anchor.icon size={15} aria-hidden="true" />
              <span>{anchor.label}</span>
            </a>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <SpotlightCard id="general" className="scroll-mt-20 p-5 sm:p-6">
          <h2 className="mb-4 text-base font-bold tracking-tight text-[var(--color-ink)]">{ui.general}</h2>
          <Row title={ui.uiLanguage} description={ui.uiLanguageDesc}>
            <Select
              aria-label={ui.uiLanguage}
              value={locale}
              onValueChange={setLocale}
              options={[
                { value: 'zh-CN', label: ui.languageChinese },
                { value: 'en-US', label: ui.languageEnglish },
              ]}
            />
          </Row>
          <Row title={ui.themeMode} description={ui.themeModeDesc}>
            <TabBar
              variant="pill"
              value={theme}
              onValueChange={value => setTheme(value as typeof theme)}
              aria-label={ui.themeMode}
              items={[
                { value: 'light', label: <><Sun size={13} /> {ui.themeLight}</> },
                { value: 'dark', label: <><Moon size={13} /> {ui.themeDark}</> },
                { value: 'system', label: <><Laptop size={13} /> {ui.themeSystem}</> },
              ]}
            />
          </Row>
        </SpotlightCard>

        {/* Core 生命周期与更新中心（阶段 C 入口位 + 阶段 A 完整版本/更新日志体验） */}
        <SpotlightCard id="core-lifecycle" className="scroll-mt-20 p-5 sm:p-6" glowTone={hasUpdate ? 'accent' : 'success'}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-bold tracking-tight text-[var(--color-ink)]">{ui.coreLifecycleSection}</h2>
              <PulseDot tone="running" size="sm" />
            </div>
            {core.data && (
              <span className="tabular-nums rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] px-2.5 py-0.5 font-mono text-xs font-semibold text-[var(--color-accent-strong)]">
                v{core.data.version.replace(/^v/, '')}
              </span>
            )}
          </div>

          <Row
            title={ui.coreVersionStatus}
            description={
              hasUpdate && latestRelease.data
                ? `${ui.newVersionAvailable}: v${latestRelease.data.version.replace(/^v/, '')}`
                : ui.coreUpToDateHint
            }
          >
            <Button size="sm" variant="secondary" onClick={() => setChangelogOpen(true)}>
              {ui.viewChangelog}
            </Button>
            {hasUpdate && latestRelease.data && (
              <a
                href={latestRelease.data.release_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[var(--color-accent-strong)] dark:text-[#0B1322]"
              >
                <ArrowUpCircle size={13} />
                <span>v{latestRelease.data.version.replace(/^v/, '')}</span>
                <ExternalLink size={12} />
              </a>
            )}
          </Row>

          <Row
            title={ui.coreLifecycleControls}
            description={
              lifecycle.data
                ? `${ui.coreEnvironmentLabel}: ${lifecycle.data.environment}${lifecycle.data.unavailable_reason ? ` · ${lifecycle.data.unavailable_reason}` : ''}`
                : ui.coreLifecyclePendingHint
            }
          >
            <span className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-1 font-mono text-[11px] text-[var(--color-ink-muted)]">
              {lifecycle.data ? lifecycle.data.environment : 'Admin API v1'}
            </span>
          </Row>
        </SpotlightCard>

        <SpotlightCard id="security" className="scroll-mt-20 p-5 sm:p-6">
          <h2 className="mb-4 text-base font-bold tracking-tight text-[var(--color-ink)]">{ui.security}</h2>
          <Row title={ui.rotateToken} description={ui.rotateTokenDesc}>
            <Button size="sm" icon={<KeyRound size={14} />} onClick={() => setRotating(true)}>
              {ui.rotateTokenButton}
            </Button>
          </Row>
          <Row title={ui.accessControl} description={ui.accessControlDesc}>
            <Link to="/permissions/users" className="text-sm font-semibold text-[var(--color-accent)] hover:underline">
              {ui.manageUsers}
            </Link>
          </Row>
        </SpotlightCard>

        <SpotlightCard id="network" className="scroll-mt-20 p-5 sm:p-6">
          <h2 className="mb-4 text-base font-bold tracking-tight text-[var(--color-ink)]">{ui.networkAndDownloads}</h2>
          {!downloads.data ? (
            <Skeleton height={120} />
          ) : (
            <>
              <Row title={ui.networkProxy} description={ui.networkProxyDesc}>
                <PresetField
                  ariaLabel={ui.networkProxy}
                  value={downloads.data.proxy ?? ''}
                  placeholder="http://127.0.0.1:7890"
                  presets={[
                    { value: '', label: ui.directConnection },
                    { value: 'http://host.docker.internal:7890', label: ui.proxyHostDocker },
                  ]}
                  onCommit={value => saveDownload({ proxy: value }, ui.proxySavedRestart)}
                />
              </Row>
              {github.data && (
                <>
                  <Row title={ui.githubMirror} description={ui.githubMirrorDesc}>
                    <PresetField
                      ariaLabel={ui.githubMirror}
                      value={github.data.github_download_prefix}
                      placeholder="https://ghfast.top/"
                      presets={[
                        { value: '', label: ui.directConnection },
                        { value: 'https://ghfast.top/', label: 'ghfast.top' },
                      ]}
                      onCommit={value => saveGitHub({ github_download_prefix: value })}
                    />
                  </Row>
                  <Row title={ui.githubAPIBase} description={ui.githubAPIBaseTrust}>
                    <PresetField
                      ariaLabel={ui.githubAPIBase}
                      value={github.data.github_api_base}
                      placeholder="https://api.github.com"
                      presets={[{ value: '', label: ui.officialAPI }]}
                      onCommit={value => saveGitHub({ github_api_base: value })}
                    />
                  </Row>
                </>
              )}
              <Row title={ui.storeRoute} description={ui.storeRouteDesc}>
                <Select
                  aria-label={ui.storeRoute}
                  value={['auto', 'github', 'jsdelivr'].includes(storeMirror) ? storeMirror : 'auto'}
                  onValueChange={value => {
                    localStorage.setItem(storeMirrorKey, value);
                    setStoreMirror(value);
                    toast.success(ui.saveSuccess);
                  }}
                  options={[
                    { value: 'auto', label: ui.mirrorAuto },
                    { value: 'github', label: 'GitHub' },
                    { value: 'jsdelivr', label: 'jsDelivr' },
                  ]}
                />
              </Row>
              <div className="mt-4">
                <Disclosure summary={ui.sourceBuildSettings} hint={ui.sourceBuildSettingsHint}>
                  <Row title={ui.goDownloadBase} description={ui.goDownloadBaseDesc}>
                    <PresetField
                      ariaLabel={ui.goDownloadBase}
                      value={downloads.data.go_download_base}
                      placeholder="https://golang.google.cn/dl/"
                      presets={[
                        { value: 'https://go.dev/dl/', label: 'go.dev' },
                        { value: 'https://golang.google.cn/dl/', label: 'golang.google.cn' },
                      ]}
                      onCommit={value => saveDownload({ go_download_base: value })}
                    />
                  </Row>
                  <Row title="GOPROXY" description={ui.goProxyDesc}>
                    <PresetField
                      ariaLabel="GOPROXY"
                      value={downloads.data.goproxy}
                      placeholder="https://goproxy.cn,direct"
                      presets={[
                        { value: 'https://proxy.golang.org,direct', label: 'proxy.golang.org' },
                        { value: 'https://goproxy.cn,direct', label: 'goproxy.cn' },
                      ]}
                      onCommit={value => saveDownload({ goproxy: value })}
                    />
                  </Row>
                  <Row
                    title={ui.buildEnvironment}
                    description={
                      build.data
                        ? build.data.go_version
                          ? ui.buildEnvironmentUsage
                              .replace('{version}', build.data.go_version.replace(/^go/, ''))
                              .replace('{size}', formatBytes(build.data.toolchain_bytes + build.data.cache_bytes))
                          : ui.buildEnvironmentEmpty
                        : undefined
                    }
                  >
                    <Button
                      size="sm"
                      icon={<HardDrive size={14} />}
                      disabled={!build.data || build.data.toolchain_bytes + build.data.cache_bytes === 0}
                      onClick={() => setClearing(true)}
                    >
                      {ui.clearBuildEnvironment}
                    </Button>
                  </Row>
                </Disclosure>
              </div>
            </>
          )}
        </SpotlightCard>

        <SpotlightCard id="system" className="scroll-mt-20 p-5 sm:p-6">
          <h2 className="mb-4 text-base font-bold tracking-tight text-[var(--color-ink)]">{ui.system}</h2>
          <Row title={ui.globalLogLevel} description={ui.globalLogLevelDesc}>
            <Select
              aria-label={ui.globalLogLevel}
              value={logs.data?.global ?? ''}
              disabled={!logs.data}
              placeholder="…"
              onValueChange={value => void write(() => setGlobalLogLevel(value as GlobalLogLevel), [['log-levels']]).catch(() => undefined)}
              options={(['debug', 'info', 'warn', 'error', 'critical'] as const).map(level => ({
                value: level,
                label: ui[`log${level[0].toUpperCase()}${level.slice(1)}` as 'logDebug'],
              }))}
            />
          </Row>
          <Row title={ui.coreDefaultLocale} description={ui.coreDefaultLocaleDesc}>
            {(() => {
              const currentLocale = coreLocale.data?.default_locale ?? '';
              const baseLocaleOptions = [
                { value: 'zh-CN', label: `${ui.languageChinese} (zh-CN)` },
                { value: 'zh-TW', label: `${ui.localeChineseTW} (zh-TW)` },
                { value: 'en-US', label: `${ui.languageEnglish} (en-US)` },
                { value: 'ja-JP', label: `${ui.localeJapanese} (ja-JP)` },
                { value: 'ko-KR', label: `${ui.localeKorean} (ko-KR)` },
              ];
              const localeOptions =
                currentLocale && !baseLocaleOptions.some(item => item.value === currentLocale)
                  ? [{ value: currentLocale, label: currentLocale }, ...baseLocaleOptions]
                  : baseLocaleOptions;
              return (
                <Select
                  aria-label={ui.coreDefaultLocale}
                  value={currentLocale}
                  disabled={!coreLocale.data}
                  placeholder="…"
                  options={localeOptions}
                  onValueChange={value =>
                    void write(() => setDefaultLocale(value), [['core-locale']]).catch(() => undefined)
                  }
                />
              );
            })()}
          </Row>
          {sleepValue && (
            <>
              <Row title={ui.sleepMode} description={ui.sleepModeDesc}>
                <Select
                  aria-label={ui.sleepMode}
                  value={sleepValue.mode}
                  onValueChange={value => setSleepDraft({ ...sleepValue, mode: value as CoreSleep['mode'] })}
                  options={[
                    { value: 'always_on', label: ui.sleepModeAlwaysOn },
                    { value: 'component_idle', label: ui.sleepModeComponentIdle },
                  ]}
                />
              </Row>
              <Row title={ui.sleepGlobalTimeout} description={ui.sleepGlobalTimeoutDesc}>
                <input
                  className="alona-input w-40 font-mono text-xs"
                  aria-label={ui.sleepGlobalTimeout}
                  value={sleepValue.idle_timeout}
                  placeholder="10m"
                  title={ui.sleepDurationHint}
                  onChange={event => setSleepDraft({ ...sleepValue, idle_timeout: event.target.value })}
                />
              </Row>
              {sleepDraft && (
                <div className="mt-3 flex justify-end gap-2">
                  <Button size="sm" onClick={() => setSleepDraft(null)}>
                    {ui.discard}
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() =>
                      void write(() => setCoreSleep(sleepDraft), [['core-sleep']])
                        .then(() => setSleepDraft(null))
                        .catch(() => undefined)
                    }
                  >
                    {ui.save}
                  </Button>
                </div>
              )}
            </>
          )}
          {diagnostics.data && (diagnostics.data.corrections.length > 0 || diagnostics.data.unknown.length > 0) && (
            <Row title={ui.corrections} description={ui.correctionsDesc}>
              <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => setPruning(true)}>
                {ui.pruneConfig}
              </Button>
            </Row>
          )}
        </SpotlightCard>
      </div>

      {core.data && (
        <ChangelogDialog component="core" version={core.data.version} open={changelogOpen} onClose={() => setChangelogOpen(false)} />
      )}
      {rotating && <RotateDialog onClose={() => setRotating(false)} onRotated={tokenRotated} />}
      {pruning && (
        <ConfirmDialog
          open
          tone="danger"
          title={ui.pruneConfig}
          description={ui.pruneConfigConfirm}
          onOpenChange={setPruning}
          onConfirm={() => {
            setPruning(false);
            void write(pruneCoreConfig, [['core-diagnostics']]).catch(() => undefined);
          }}
        >
          <ul className="list-disc pl-5 font-mono text-xs text-[var(--color-ink-muted)]">
            {diagnostics.data?.unknown.map(path => (
              <li key={path}>
                <code>{path}</code>
              </li>
            ))}
          </ul>
        </ConfirmDialog>
      )}
      {clearing && (
        <ConfirmDialog
          open
          tone="danger"
          title={ui.clearBuildEnvironment}
          description={ui.clearBuildEnvironmentConfirm}
          onOpenChange={setClearing}
          onConfirm={() => {
            setClearing(false);
            void write(clearBuildEnvironment, [['build-environment']], ui.buildEnvironmentCleared).catch(() => undefined);
          }}
        />
      )}
    </div>
  );
}

function RotateDialog({ onClose, onRotated }: { onClose: () => void; onRotated: (token: string) => void }): JSX.Element {
  const ui = useUI();
  const [token, setToken] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setPending(true);
    try {
      const result = await rotateAdminToken(token);
      onClose();
      onRotated(result.token);
    } catch (error: unknown) {
      toast.error(error);
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={open => { if (!open && !pending) onClose(); }}
      title={ui.rotateTokenModalTitle}
      description={ui.rotateReauthenticate}
      size="sm"
      dismissible={!pending}
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            {ui.cancel}
          </Button>
          <Button type="submit" form="rotate-token" variant="primary" loading={pending} disabled={!token}>
            {ui.rotateTokenButton}
          </Button>
        </>
      }
    >
      <form id="rotate-token" onSubmit={event => void submit(event)}>
        <input
          className="alona-input font-mono"
          type="password"
          autoComplete="current-password"
          aria-label={ui.currentToken}
          placeholder={ui.currentToken}
          value={token}
          onChange={event => setToken(event.target.value)}
          autoFocus
        />
      </form>
    </Dialog>
  );
}
