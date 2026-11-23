import { useEffect, useState, type FormEvent, type JSX, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HardDrive, KeyRound, Laptop, LogOut, Moon, Plus, Sun, Trash2, X } from 'lucide-react';
import { rotateAdminToken } from '../../api/auth';
import { clearBuildEnvironment, getBuildEnvironment, getCoreConfigDiagnostics, getCoreSleep, getDefaultLocale, getDownloadSettings, getGitHubSettings, setGitHubSettings, type GitHubSettings, pruneCoreConfig, setCoreSleep, setDefaultLocale, setDownloadSettings, type CoreSleep, type DownloadSettings } from '../../api/core';
import { getLogLevels, setGlobalLogLevel, type GlobalLogLevel } from '../../api/logs';
import { getCoreDenies, setCoreDenies } from '../../api/policies';
import { useUI } from '../../i18n/UI';
import { PageHeader } from '../../shell/PageHeader';
import { Link } from '../../shell/router';
import { useUISettings } from '../../shell/settings';
import { Button } from '../../ui/Button';
import { ConfirmDialog, Dialog } from '../../ui/Dialog';
import { Disclosure } from '../../ui/Disclosure';
import { Skeleton } from '../../ui/EmptyState';
import { Select } from '../../ui/Select';
import { TabBar } from '../../ui/Tabs';
import { toast } from '../../ui/toast';
import styles from './Settings.module.css';

const storeMirrorKey = 'alonabot.webui.storeMirror';
const custom = '\u0000custom';

function Row({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }): JSX.Element {
  return <div className={styles.row}>
    <div className={styles.label}><strong>{title}</strong>{description && <span>{description}</span>}</div>
    <div className={styles.control}>{children}</div>
  </div>;
}

/**
 * 常用地址的下拉选择，选「自定义」时展开输入框。value 为当前生效值；保存时调用 onCommit，
 * 失败由调用方提示并保持原值。
 */
function PresetField({ value, presets, placeholder, onCommit, ariaLabel }: {
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
  useEffect(() => { setMode(known ? value : custom); setDraft(known ? '' : value); }, [value]);
  const commit = async (next: string) => { setPending(true); try { await onCommit(next); } finally { setPending(false); } };
  return <div className={styles.preset}>
    <Select aria-label={ariaLabel} value={mode} disabled={pending} options={[...presets, { value: custom, label: ui.customValue }]}
      onValueChange={next => { setMode(next); if (next !== custom) void commit(next); }} />
    {mode === custom && <form className={styles.inline} onSubmit={(event: FormEvent) => { event.preventDefault(); void commit(draft.trim()); }}>
      <input className={styles.input} value={draft} placeholder={placeholder} aria-label={ariaLabel} spellCheck={false} onChange={event => setDraft(event.target.value)} />
      <Button type="submit" size="sm" variant="primary" loading={pending} disabled={draft.trim() === value}>{ui.save}</Button>
    </form>}
  </div>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** 系统设置：界面、安全、网络与下载、系统运行。每项修改立即保存并以 toast 告知结果。 */
export function SettingsPage(): JSX.Element {
  const ui = useUI();
  const client = useQueryClient();
  const { locale, setLocale, theme, setTheme, logout, tokenRotated } = useUISettings();
  const logs = useQuery({ queryKey: ['log-levels'], queryFn: getLogLevels });
  const coreLocale = useQuery({ queryKey: ['core-locale'], queryFn: getDefaultLocale });
  const denies = useQuery({ queryKey: ['core-denies'], queryFn: getCoreDenies });
  const diagnostics = useQuery({ queryKey: ['core-diagnostics'], queryFn: getCoreConfigDiagnostics });
  const sleep = useQuery({ queryKey: ['core-sleep'], queryFn: getCoreSleep });
  const downloads = useQuery({ queryKey: ['core-downloads'], queryFn: getDownloadSettings });
  const github = useQuery({ queryKey: ['core-github'], queryFn: getGitHubSettings });
  const build = useQuery({ queryKey: ['build-environment'], queryFn: getBuildEnvironment });
  const [storeMirror, setStoreMirror] = useState(() => localStorage.getItem(storeMirrorKey) ?? 'auto');
  const [localeDraft, setLocaleDraft] = useState<string | null>(null);
  const [sleepDraft, setSleepDraft] = useState<Pick<CoreSleep, 'mode' | 'idle_timeout'> | null>(null);
  const [rotating, setRotating] = useState(false);
  const [addingChat, setAddingChat] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [clearing, setClearing] = useState(false);

  /** 执行一次写入，成功提示「已保存」，失败提示原因；之后刷新对应查询。 */
  const write = async (action: () => Promise<unknown>, keys: string[][], success = ui.saveSuccess) => {
    try { await action(); toast.success(success); }
    catch (error) { toast.error(error); throw error; }
    finally { for (const key of keys) void client.invalidateQueries({ queryKey: key }); }
  };
  const saveDownload = (patch: Partial<DownloadSettings>, note?: string) => write(() => setDownloadSettings(patch), [['core-downloads']], note);
  const saveGitHub = (patch: Partial<GitHubSettings>) => write(() => setGitHubSettings({ ...github.data!, ...patch }), [['core-github']]);
  const sleepValue = sleepDraft ?? sleep.data;

  return <div className={styles.page}>
    <PageHeader right={<Button variant="danger" icon={<LogOut size={16} />} onClick={() => void logout().catch(error => toast.error(error))}>{ui.logout}</Button>} />

    <section className={styles.card}>
      <h2>{ui.general}</h2>
      <Row title={ui.uiLanguage} description={ui.uiLanguageDesc}>
        <Select aria-label={ui.uiLanguage} value={locale} onValueChange={setLocale} options={[{ value: 'zh-CN', label: ui.languageChinese }, { value: 'en-US', label: ui.languageEnglish }]} />
      </Row>
      <Row title={ui.themeMode} description={ui.themeModeDesc}>
        <TabBar variant="pill" value={theme} onValueChange={value => setTheme(value as typeof theme)} aria-label={ui.themeMode} className={styles.theme}
          items={[{ value: 'light', label: <><Sun size={14} /> {ui.themeLight}</> }, { value: 'dark', label: <><Moon size={14} /> {ui.themeDark}</> }, { value: 'system', label: <><Laptop size={14} /> {ui.themeSystem}</> }]} />
      </Row>
    </section>

    <section className={styles.card}>
      <h2>{ui.security}</h2>
      <Row title={ui.rotateToken} description={ui.rotateTokenDesc}><Button size="sm" icon={<KeyRound size={14} />} onClick={() => setRotating(true)}>{ui.rotateTokenButton}</Button></Row>
      <Row title={ui.accessControl} description={ui.accessControlDesc}><Link to="/permissions/users" className={styles.link}>{ui.manageUsers}</Link></Row>
      <Disclosure summary={ui.deniedChats} hint={denies.data ? String(denies.data.chats.length) : undefined}>
        <div className={styles.chips}>
          {denies.data?.chats.map(chat => <span key={chat} className={styles.chip}><code>{chat}</code>
            <button type="button" aria-label={ui.removeRow} onClick={() => void write(async () => { const current = await getCoreDenies(); await setCoreDenies({ users: current.users, chats: current.chats.filter(value => value !== chat) }); }, [['core-denies']])}><X size={14} /></button>
          </span>)}
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setAddingChat(true)}>{ui.addChat}</Button>
        </div>
      </Disclosure>
    </section>

    <section className={styles.card}>
      <h2>{ui.networkAndDownloads}</h2>
      {!downloads.data ? <Skeleton height={120} /> : <>
        <Row title={ui.networkProxy} description={ui.networkProxyDesc}>
          <PresetField ariaLabel={ui.networkProxy} value={downloads.data.proxy ?? ''} placeholder="http://127.0.0.1:7890"
            presets={[{ value: '', label: ui.directConnection }, { value: 'http://host.docker.internal:7890', label: ui.proxyHostDocker }]}
            onCommit={value => saveDownload({ proxy: value }, ui.proxySavedRestart)} />
        </Row>
        {github.data && <>
          <Row title={ui.githubMirror} description={ui.githubMirrorDesc}>
            <PresetField ariaLabel={ui.githubMirror} value={github.data.github_download_prefix} placeholder="https://ghfast.top/"
              presets={[{ value: '', label: ui.directConnection }, { value: 'https://ghfast.top/', label: 'ghfast.top' }]}
              onCommit={value => saveGitHub({ github_download_prefix: value })} />
          </Row>
          <Row title={ui.githubAPIBase} description={ui.githubAPIBaseTrust}>
            <PresetField ariaLabel={ui.githubAPIBase} value={github.data.github_api_base} placeholder="https://api.github.com"
              presets={[{ value: '', label: ui.officialAPI }]}
              onCommit={value => saveGitHub({ github_api_base: value })} />
          </Row>
        </>}
        <Row title={ui.storeRoute} description={ui.storeRouteDesc}>
          <Select aria-label={ui.storeRoute} value={['auto', 'github', 'jsdelivr'].includes(storeMirror) ? storeMirror : 'auto'}
            onValueChange={value => { localStorage.setItem(storeMirrorKey, value); setStoreMirror(value); toast.success(ui.saveSuccess); }}
            options={[{ value: 'auto', label: ui.mirrorAuto }, { value: 'github', label: 'GitHub' }, { value: 'jsdelivr', label: 'jsDelivr' }]} />
        </Row>
        <Disclosure summary={ui.sourceBuildSettings} hint={ui.sourceBuildSettingsHint}>
          <Row title={ui.goDownloadBase} description={ui.goDownloadBaseDesc}>
            <PresetField ariaLabel={ui.goDownloadBase} value={downloads.data.go_download_base} placeholder="https://golang.google.cn/dl/"
              presets={[{ value: 'https://go.dev/dl/', label: 'go.dev' }, { value: 'https://golang.google.cn/dl/', label: 'golang.google.cn' }]}
              onCommit={value => saveDownload({ go_download_base: value })} />
          </Row>
          <Row title="GOPROXY" description={ui.goProxyDesc}>
            <PresetField ariaLabel="GOPROXY" value={downloads.data.goproxy} placeholder="https://goproxy.cn,direct"
              presets={[{ value: 'https://proxy.golang.org,direct', label: 'proxy.golang.org' }, { value: 'https://goproxy.cn,direct', label: 'goproxy.cn' }]}
              onCommit={value => saveDownload({ goproxy: value })} />
          </Row>
          <Row title={ui.buildEnvironment} description={build.data ? (build.data.go_version ? ui.buildEnvironmentUsage.replace('{version}', build.data.go_version.replace(/^go/, '')).replace('{size}', formatBytes(build.data.toolchain_bytes + build.data.cache_bytes)) : ui.buildEnvironmentEmpty) : undefined}>
            <Button size="sm" icon={<HardDrive size={14} />} disabled={!build.data || (build.data.toolchain_bytes + build.data.cache_bytes === 0)} onClick={() => setClearing(true)}>{ui.clearBuildEnvironment}</Button>
          </Row>
        </Disclosure>
      </>}
    </section>

    <section className={styles.card}>
      <h2>{ui.system}</h2>
      <Row title={ui.globalLogLevel} description={ui.globalLogLevelDesc}>
        <Select aria-label={ui.globalLogLevel} value={logs.data?.global ?? ''} disabled={!logs.data} placeholder="…"
          onValueChange={value => void write(() => setGlobalLogLevel(value as GlobalLogLevel), [['log-levels']]).catch(() => undefined)}
          options={(['debug', 'info', 'warn', 'error', 'critical'] as const).map(level => ({ value: level, label: ui[`log${level[0].toUpperCase()}${level.slice(1)}` as 'logDebug'] }))} />
      </Row>
      <Row title={ui.coreDefaultLocale} description={ui.coreDefaultLocaleDesc}>
        <form className={styles.inline} onSubmit={event => { event.preventDefault(); if (localeDraft !== null) void write(() => setDefaultLocale(localeDraft), [['core-locale']]).then(() => setLocaleDraft(null)).catch(() => undefined); }}>
          <input className={styles.input} aria-label={ui.coreDefaultLocale} value={localeDraft ?? coreLocale.data?.default_locale ?? ''} onChange={event => setLocaleDraft(event.target.value)} />
          {localeDraft !== null && <Button type="submit" size="sm" variant="primary">{ui.save}</Button>}
        </form>
      </Row>
      {sleepValue && <>
        <Row title={ui.sleepMode} description={ui.sleepModeDesc}>
          <Select aria-label={ui.sleepMode} value={sleepValue.mode} onValueChange={value => setSleepDraft({ ...sleepValue, mode: value as CoreSleep['mode'] })}
            options={[{ value: 'always_on', label: ui.sleepModeAlwaysOn }, { value: 'component_idle', label: ui.sleepModeComponentIdle }]} />
        </Row>
        <Row title={ui.sleepGlobalTimeout} description={ui.sleepGlobalTimeoutDesc}>
          <input className={styles.input} aria-label={ui.sleepGlobalTimeout} value={sleepValue.idle_timeout} placeholder="10m" title={ui.sleepDurationHint}
            onChange={event => setSleepDraft({ ...sleepValue, idle_timeout: event.target.value })} />
        </Row>
        {sleepDraft && <div className={styles.actions}>
          <Button onClick={() => setSleepDraft(null)}>{ui.discard}</Button>
          <Button variant="primary" onClick={() => void write(() => setCoreSleep(sleepDraft), [['core-sleep']]).then(() => setSleepDraft(null)).catch(() => undefined)}>{ui.save}</Button>
        </div>}
      </>}
      {diagnostics.data && (diagnostics.data.corrections.length > 0 || diagnostics.data.unknown.length > 0) && <Row title={ui.corrections} description={ui.correctionsDesc}>
        <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => setPruning(true)}>{ui.pruneConfig}</Button>
      </Row>}
    </section>

    {rotating && <RotateDialog onClose={() => setRotating(false)} onRotated={tokenRotated} />}
    {addingChat && <AddChatDialog onClose={() => setAddingChat(false)} onAdd={chat => write(async () => { const current = await getCoreDenies(); await setCoreDenies({ users: current.users, chats: [...new Set([...current.chats, chat])] }); }, [['core-denies']])} />}
    {pruning && <ConfirmDialog open tone="danger" title={ui.pruneConfig} description={ui.pruneConfigConfirm} onOpenChange={setPruning}
      onConfirm={() => { setPruning(false); void write(pruneCoreConfig, [['core-diagnostics']]).catch(() => undefined); }}>
      <ul className={styles.list}>{diagnostics.data?.unknown.map(path => <li key={path}><code>{path}</code></li>)}</ul>
    </ConfirmDialog>}
    {clearing && <ConfirmDialog open tone="danger" title={ui.clearBuildEnvironment} description={ui.clearBuildEnvironmentConfirm} onOpenChange={setClearing}
      onConfirm={() => { setClearing(false); void write(clearBuildEnvironment, [['build-environment']], ui.buildEnvironmentCleared).catch(() => undefined); }} />}
  </div>;
}

function RotateDialog({ onClose, onRotated }: { onClose: () => void; onRotated: (token: string) => void }): JSX.Element {
  const ui = useUI();
  const [token, setToken] = useState('');
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    try { const result = await rotateAdminToken(token); onClose(); onRotated(result.token); }
    catch (error) { toast.error(error); setPending(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }} title={ui.rotateTokenModalTitle} description={ui.rotateReauthenticate} size="sm" dismissible={!pending}
    footer={<><Button onClick={onClose} disabled={pending}>{ui.cancel}</Button><Button type="submit" form="rotate-token" variant="primary" loading={pending} disabled={!token}>{ui.rotateTokenButton}</Button></>}>
    <form id="rotate-token" onSubmit={event => void submit(event)}>
      <input className={styles.input} style={{ width: '100%' }} type="password" autoComplete="current-password" aria-label={ui.currentToken} placeholder={ui.currentToken} value={token} onChange={event => setToken(event.target.value)} autoFocus />
    </form>
  </Dialog>;
}

function AddChatDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (chat: string) => Promise<void> }): JSX.Element {
  const ui = useUI();
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    try { await onAdd(value.trim()); onClose(); } catch { setPending(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }} title={ui.addChat} size="sm"
    footer={<><Button onClick={onClose} disabled={pending}>{ui.cancel}</Button><Button type="submit" form="add-denied-chat" variant="primary" loading={pending} disabled={!value.trim()}>{ui.confirm}</Button></>}>
    <form id="add-denied-chat" onSubmit={event => void submit(event)}>
      <input className={styles.input} style={{ width: '100%' }} aria-label={ui.addChat} placeholder="telegram:main:group:-100123" value={value} onChange={event => setValue(event.target.value)} autoFocus />
    </form>
  </Dialog>;
}
