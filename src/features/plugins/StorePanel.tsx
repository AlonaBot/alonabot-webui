import { useMemo, useState, type JSX } from 'react';
import { AlertTriangle, ArrowRight, ArrowUpCircle, BadgeCheck, Check, ChevronDown, CircleCheck, Download, FileUp, GitBranch, Globe, Hammer, Plus, Repeat, Search, Star, Trash2, Upload } from 'lucide-react';
import { AdminAPIError } from '../../api/client';
import type { Package } from '../../api/packages';
import { checkStoreRepo, type StoreCheck, type StoreEntry, type StoreMirror, type StoreSort } from '../../api/webui';
import { useUI } from '../../i18n/UI';
import { storeCardState } from '../../pages/storeCards';
import { useStore } from '../../queries/plugins';
import { PageHeader } from '../../shell/PageHeader';
import { navigate } from '../../shell/router';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { EmptyState, Skeleton } from '../../ui/EmptyState';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../../ui/Menu';
import { Pagination } from '../../ui/Pagination';
import { Select } from '../../ui/Select';
import { TabBar } from '../../ui/Tabs';
import { toast } from '../../ui/toast';
import { InstallDialog, UpdateDialog, type InstallMode } from './PluginDialogs';
import { usePackageActions } from './usePackageActions';
import styles from './Plugins.module.css';

const sourcesKey = 'alonabot.webui.sources';
const mirrorKey = 'alonabot.webui.storeMirror';
const officialSource = 'AlonaBot/plugin-store';
const pageSize = 9;
const repositoryPattern = /^[\w.-]+\/[\w.-]+$/;

const validRepository = (value: string) => repositoryPattern.test(value) && !value.split('/').some(part => part === '.' || part === '..');

function loadSources(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(sourcesKey) ?? 'null');
    if (Array.isArray(parsed) && parsed.every(value => typeof value === 'string')) return parsed;
  } catch {
    // 存储内容损坏时回到官方源。
  }
  return [officialSource];
}

function persist(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch (error) { toast.error(error); }
}

/** GitHub 收录申请地址；仓库名是唯一的不可信输入，已按 owner/repo 校验。 */
export function issueURL(source: string, fields: [string, string][]): string | null {
  if (!validRepository(source)) return null;
  const query = fields.map(([key, value], i) => `${i === 0 ? 'template=submit-plugin.yml&' : ''}${key}=${encodeURIComponent(value)}`).join('&');
  return `https://github.com/${source}/issues/new?${query}`;
}

/** 插件商店：插件源与读取线路、角色筛选、搜索、排序、分页、安装与更新，以及手动安装和发布。 */
export function StorePanel({ packages }: { packages: readonly Package[] }): JSX.Element {
  const ui = useUI();
  const actions = usePackageActions();
  const [sources, setSources] = useState(loadSources);
  const [source, setSource] = useState(() => loadSources()[0] ?? '');
  const [mirror, setMirror] = useState<StoreMirror>(() => localStorage.getItem(mirrorKey) ?? 'auto');
  const [role, setRole] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<StoreSort>('stars');
  const [page, setPage] = useState(1);
  const [token, setToken] = useState(() => Date.now());
  const [installMode, setInstallMode] = useState<InstallMode | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [addingSource, setAddingSource] = useState(false);
  const [customMirror, setCustomMirror] = useState(false);
  const [updating, setUpdating] = useState<Package | null>(null);

  const store = useStore({ source, mirror, role, q: query, sort, offset: (page - 1) * pageSize, limit: pageSize }, token);
  const data = store.data;
  const sourceLabel = (value: string) => value === officialSource ? ui.officialSource : value;

  const chooseSource = (value: string) => { setSource(value); setPage(1); setQuery(''); };
  const saveSources = (next: string[]) => { setSources(next); persist(sourcesKey, JSON.stringify(next)); };
  const chooseMirror = (value: StoreMirror) => { setMirror(value); persist(mirrorKey, value); setToken(Date.now()); };

  const counts = data?.counts;
  const roleItems = [
    { value: '', label: ui.filterRoleAll, count: counts?.all },
    { value: 'plugin', label: ui.filterRolePlugin, count: counts?.plugin },
    { value: 'adapter', label: ui.filterRoleAdapter, count: counts?.adapter },
    { value: 'agent', label: ui.filterRoleAgent, count: counts?.agent },
    { value: 'webui', label: ui.filterRoleWebUI, count: counts?.webui },
  ];
  const mirrorLabel = mirror === 'auto' ? ui.mirrorAuto : mirror === 'github' ? 'GitHub' : mirror === 'jsdelivr' ? 'jsDelivr' : ui.mirrorCustom;

  const error = store.error ?? (data?.error ? new Error(data.error) : null);

  return <>
    <PageHeader right={<>
      <Menu align="end" trigger={<Button icon={<Download size={16} />}>{ui.manualInstall}<ChevronDown size={14} aria-hidden /></Button>}>
        <MenuItem icon={<GitBranch size={16} />} onSelect={() => setInstallMode('repo')}>{ui.installFromRepo}</MenuItem>
        <MenuItem icon={<Hammer size={16} />} onSelect={() => setInstallMode('build')}>{ui.installFromSource}</MenuItem>
        <MenuItem icon={<FileUp size={16} />} onSelect={() => setInstallMode('upload')}>{ui.uploadInstall}</MenuItem>
      </Menu>
      <Button variant="dark" icon={<Upload size={16} />} onClick={() => setPublishing(true)}>{ui.publishPlugin}</Button>
    </>} />

    <div className={styles.toolbar}>
      <Menu trigger={<button type="button" className={styles.sourcePill}>
        <Globe size={16} aria-hidden /><span className={styles.muted}>{ui.pluginSources}</span><strong>{source ? sourceLabel(source) : ui.noSources}</strong><ChevronDown size={15} aria-hidden />
      </button>}>
        <MenuLabel>{ui.pluginSources}</MenuLabel>
        {sources.map(value => <MenuItem key={value} icon={value === source ? <Check size={16} /> : <span style={{ width: 16 }} />} onSelect={() => chooseSource(value)}>{sourceLabel(value)}</MenuItem>)}
        <MenuItem icon={<Plus size={16} />} onSelect={() => setAddingSource(true)}>{ui.addSource}</MenuItem>
        {source && sources.length > 1 && <MenuItem icon={<Trash2 size={16} />} tone="danger" onSelect={() => { const next = sources.filter(value => value !== source); saveSources(next); chooseSource(next[0] ?? ''); }}>{ui.removeSource}</MenuItem>}
        <MenuSeparator />
        <MenuLabel>{ui.storeRoute} · {mirrorLabel}</MenuLabel>
        {(['auto', 'github', 'jsdelivr'] as const).map(value => <MenuItem key={value} icon={mirror === value ? <Check size={16} /> : <span style={{ width: 16 }} />} onSelect={() => chooseMirror(value)}>
          {value === 'auto' ? ui.mirrorAuto : value === 'github' ? 'GitHub' : 'jsDelivr'}
        </MenuItem>)}
        <MenuItem icon={!['auto', 'github', 'jsdelivr'].includes(mirror) ? <Check size={16} /> : <span style={{ width: 16 }} />} onSelect={() => setCustomMirror(true)}>{ui.mirrorCustom}…</MenuItem>
      </Menu>
      <TabBar variant="pill" value={role} onValueChange={value => { setRole(value); setPage(1); }} items={roleItems} aria-label={ui.filterByRole} />
      <span className={styles.spacer} />
      <label className={styles.search} data-wide>
        <Search size={16} aria-hidden />
        <input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder={ui.searchStore} aria-label={ui.searchStore} />
      </label>
      <Select className={styles.sort} value={sort} onValueChange={value => { setSort(value as StoreSort); setPage(1); }} aria-label={ui.sortBy}
        options={[{ value: 'stars', label: ui.storeSortStars }, { value: 'name', label: ui.storeSortName }]} />
    </div>

    {!source ? <EmptyState icon={<Globe size={22} />} title={ui.noSources} action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setAddingSource(true)}>{ui.addSource}</Button>} />
      : error && !data?.items.length ? <EmptyState tone="error" icon={<AlertTriangle size={22} />}
        title={error instanceof AdminAPIError && error.code === 'SOURCE_INDEX_MISSING' ? ui.sourceIndexMissing : ui.storeFetchFailed}
        description={<>{error.message}<br />{ui.storeFetchHint}</>}
        action={<Button variant="primary" loading={store.isFetching} onClick={() => setToken(Date.now())}>{ui.retry}</Button>} />
      : store.isPending ? <div className={styles.grid}>{Array.from({ length: 6 }, (_, i) => <div key={i} className={styles.card}><Skeleton height={40} width="60%" /><Skeleton height={14} /><Skeleton height={20} width="40%" /></div>)}</div>
      : data && data.items.length === 0 ? <EmptyState icon={<Search size={22} />} title={ui.noEntries} />
      : <div className={styles.grid} data-refreshing={store.isPlaceholderData || undefined}>
        {data?.items.map(entry => <StoreCard key={entry.repo} entry={entry} packages={packages} busy={actions.busy.has(entry.repo)}
          onInstall={replace => void actions.install({ Source: entry.repo, Replace: replace })}
          onUpdate={pkg => setUpdating(pkg)} />)}
      </div>}
    {data && <Pagination page={page} total={data.total} size={pageSize} onChange={setPage} disabled={store.isFetching} />}
    {data?.stale && <p className={styles.staleNote}>{ui.storeStale}</p>}

    {installMode && <InstallDialog initialMode={installMode} onClose={() => setInstallMode(null)} onInstall={actions.install} />}
    {updating && <UpdateDialog pkg={updating} onClose={() => setUpdating(null)} onUpdate={archive => actions.update(updating, archive)} />}
    {addingSource && <TextDialog title={ui.addSource} label={ui.sourceRepository} placeholder="owner/repo" validate={value => validRepository(value) ? null : ui.repositoryInvalid}
      onClose={() => setAddingSource(false)} onSubmit={value => { saveSources([...new Set([...sources, value])]); chooseSource(value); }} />}
    {customMirror && <TextDialog title={ui.mirrorCustom} label={ui.mirrorPrefix} placeholder="https://ghfast.top/" description={ui.mirrorPrefixHint}
      initial={['auto', 'github', 'jsdelivr'].includes(mirror) ? '' : mirror}
      validate={value => /^https:\/\/[^\s/?#]+(\/[^\s?#]*)?$/.test(value) ? null : ui.mirrorPrefixInvalid}
      onClose={() => setCustomMirror(false)} onSubmit={chooseMirror} />}
    {publishing && <PublishDialog sources={sources.length ? sources : [officialSource]} source={source || officialSource} onClose={() => setPublishing(false)} />}
    {actions.dialogs}
  </>;
}

function StoreCard({ entry, packages, busy, onInstall, onUpdate }: {
  entry: StoreEntry;
  packages: readonly Package[];
  busy: boolean;
  onInstall: (replace: boolean) => void;
  onUpdate: (pkg: Package) => void;
}): JSX.Element {
  const ui = useUI();
  const state = storeCardState(entry, [...packages]);
  const official = entry.repo.split('/')[0].toLowerCase() === 'alonabot';
  // Agent 与 WebUI 全局只能有一个；已装了另一个时提供替换，而不是安装后再报冲突。
  const occupant = !state.installed && (entry.role === 'agent' || entry.role === 'webui') ? packages.find(item => item.Role === entry.role) : undefined;
  const roleBadge = entry.role === 'adapter' ? ui.filterRoleAdapter : entry.role === 'agent' ? ui.filterRoleAgent : entry.role === 'webui' ? ui.filterRoleWebUI : null;

  return <article className={styles.card}>
    <header className={styles.cardHead}>
      <div className={styles.icon}>{entry.icon_url ? <img src={entry.icon_url} alt="" /> : <span aria-hidden>{(entry.name || entry.repo).slice(0, 1).toUpperCase()}</span>}</div>
      <div className={styles.heading}>
        <span className={styles.storeName}>{entry.name || entry.repo}{official && <BadgeCheck size={16} className={styles.verified} aria-label={ui.officialVerified} />}</span>
        <span className={styles.repo}>{entry.repo}</span>
      </div>
      {roleBadge && <span className={styles.roleBadge}>{roleBadge}</span>}
    </header>
    <p className={styles.description}>{entry.description || <span className={styles.muted}>{ui.unknownMetadata}</span>}</p>
    {entry.tags.length > 0 && <div className={styles.tags}>{entry.tags.map(tag => <span key={tag}>#{tag}</span>)}</div>}
    <footer className={styles.cardFoot}>
      <span className={styles.meta}><Star size={14} aria-hidden />{entry.stars !== undefined ? compact(entry.stars) : '—'}</span>
      <span className={styles.meta}>
        {state.installed && state.canUpdate
          ? <>v{state.installed.Version}<ArrowRight size={12} aria-hidden /><span className={styles.newVersion}>v{entry.version}</span></>
          : `v${entry.version}`}
      </span>
      <span className={styles.spacer} />
      {state.canUpdate ? <Button size="sm" variant="soft" icon={<ArrowUpCircle size={14} />} onClick={() => onUpdate(state.installed!)}>{ui.actionUpdate}</Button>
        : state.installed ? <button type="button" className={styles.installedLink} onClick={() => navigate(`/components/${encodeURIComponent(state.installed!.ID)}`)}><CircleCheck size={14} />{ui.installed}</button>
        : occupant ? <Button size="sm" icon={<Repeat size={14} />} loading={busy} onClick={() => onInstall(true)}>{entry.role === 'agent' ? ui.replaceCurrentAgent : ui.replaceComponent}</Button>
        : <Button size="sm" variant="dark" icon={<Download size={14} />} loading={busy} onClick={() => onInstall(false)}>{ui.actionInstall}</Button>}
    </footer>
  </article>;
}

function compact(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k` : String(value);
}

/** 单个文本输入的小对话框；validate 返回错误文案或 null。 */
function TextDialog({ title, label, placeholder, description, initial = '', validate, onClose, onSubmit }: {
  title: string;
  label: string;
  placeholder: string;
  description?: string;
  initial?: string;
  validate: (value: string) => string | null;
  onClose: () => void;
  onSubmit: (value: string) => void;
}): JSX.Element {
  const ui = useUI();
  const [value, setValue] = useState(initial);
  const [touched, setTouched] = useState(false);
  const problem = validate(value.trim());
  const submit = () => { setTouched(true); if (!problem) { onSubmit(value.trim()); onClose(); } };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }} title={title} description={description} size="sm"
    footer={<><Button onClick={onClose}>{ui.cancel}</Button><Button variant="primary" disabled={!value.trim()} onClick={submit}>{ui.confirm}</Button></>}>
    <form className={styles.form} onSubmit={event => { event.preventDefault(); submit(); }}>
      <label className={styles.field}>
        <span>{label}</span>
        <input className={styles.input} value={value} placeholder={placeholder} autoFocus spellCheck={false} onChange={event => setValue(event.target.value)} aria-invalid={touched && problem ? true : undefined} />
        {touched && problem && <small className={styles.fieldError}>{problem}</small>}
      </label>
    </form>
  </Dialog>;
}

/**
 * 发布插件：检查仓库最新 Release 与包内声明，确认后在浏览器打开预填好的 GitHub 收录申请。
 * WebUI 不保存任何 GitHub 凭据。
 */
function PublishDialog({ sources, source, onClose }: { sources: readonly string[]; source: string; onClose: () => void }): JSX.Element {
  const ui = useUI();
  const [repo, setRepo] = useState('');
  const [check, setCheck] = useState<StoreCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [tags, setTags] = useState('');
  const [target, setTarget] = useState(source);
  const tagList = tags.split(/[,，\s]+/).map(tag => tag.trim().replace(/^#/, '')).filter(Boolean);
  const fields = useMemo(() => check ? [['repo', check.repo], ['role', check.role], ...(tagList.length ? [['tags', tagList.join(',')] as [string, string]] : []), ['release_url', check.release_url]] as [string, string][] : [], [check, tagList]);

  const runCheck = async () => {
    setChecking(true); setFailure(null); setCheck(null);
    try { setCheck(await checkStoreRepo(repo.trim())); }
    catch (error) { setFailure(error instanceof AdminAPIError && error.code === 'NO_RELEASE' ? ui.noPublishedRelease : error instanceof Error ? error.message : String(error)); }
    finally { setChecking(false); }
  };
  const submit = () => {
    const url = issueURL(target, fields);
    if (!url) { toast.error(ui.repositoryInvalid); return; }
    window.open(url, '_blank', 'noreferrer');
    toast.info(ui.storeSubmitted);
    onClose();
  };
  const role = check ? ({ plugin: ui.filterRolePlugin, adapter: ui.filterRoleAdapter, agent: ui.filterRoleAgent, webui: ui.filterRoleWebUI } as Record<string, string>)[check.role] ?? check.role : '';

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }} title={ui.publishPlugin} description={ui.publishInstructions}
    footer={<><Button variant="ghost" onClick={onClose}>{ui.cancel}</Button><Button variant="primary" disabled={!check} onClick={submit}>{ui.storeSubmit}</Button></>}>
    <form className={styles.form} onSubmit={event => { event.preventDefault(); if (validRepository(repo.trim())) void runCheck(); }}>
      <span className={styles.fieldLabel}>{ui.storeCheckRepo}</span>
      <div className={styles.inline}>
        <label className={styles.search} data-wide data-filled>
          <Globe size={16} aria-hidden />
          <input value={repo} placeholder="owner/repo" spellCheck={false} disabled={checking} aria-label={ui.storeCheckRepo} onChange={event => { setRepo(event.target.value); setCheck(null); setFailure(null); }} />
        </label>
        <Button type="submit" loading={checking} disabled={!validRepository(repo.trim())}>{ui.storeCheckAction}</Button>
      </div>
      {failure && <p className={styles.fieldError} role="alert">{failure}</p>}
      {check && <ul className={styles.checklist}>
        <li><Check size={16} />{ui.publishLatestRelease.replace('{version}', check.version)}</li>
        <li><Check size={16} />{ui.publishManifestValid.replace('{name}', check.name || check.repo)}</li>
        <li><Check size={16} />{ui.storeCheckType}：{role}</li>
        {check.warnings.map(warning => <li key={warning} data-tone="warning"><AlertTriangle size={16} />{warning}</li>)}
      </ul>}
      {check && <>
        <label className={styles.field}>
          <span>{ui.storeCheckTags}</span>
          <input className={styles.input} value={tags} placeholder={ui.publishTagsPlaceholder} onChange={event => setTags(event.target.value)} />
        </label>
        {sources.length > 1 && <label className={styles.field}>
          <span>{ui.pluginSources}</span>
          <Select variant="filled" value={target} onValueChange={setTarget} options={sources.map(value => ({ value, label: value }))} />
        </label>}
      </>}
    </form>
  </Dialog>;
}
