import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowUpCircle, BadgeCheck, Download, ExternalLink, Plus, RefreshCw, Star, Trash2, Upload, X } from 'lucide-react';
import { AdminAPIError, installPackage, isConfirmationError, listPackages, updatePackage, type Package } from '../api/admin';
import { ChangelogDialog, ReleasePreview } from '../components/ChangelogDialog';
import { checkStoreRepo, getStore, type StoreCheck, type StoreEntry, type StorePage, type StoreSort } from '../api/webui';
import { useUI } from '../i18n/UI';
import { SearchContext } from '../shell/search';
import { navigate } from '../shell/router';
import { Pagination } from '../components/Pagination';
import { ActionDialog } from '../components/ActionDialog';
import { storeCardState } from './storeCards';

const sourceKey = 'alonabot.webui.sources';
const mirrorKey = 'alonabot.webui.storeMirror';
const defaultSource = 'AlonaBot/plugin-store';
const pageSize = 9;
const repositoryPattern = /^[\w.-]+\/[\w.-]+$/;

/** loadStoreSources 读取浏览器保存的插件源；内容不是字符串数组时把实际错误交给调用方显示。 */
export function loadStoreSources(): { sources: string[]; error: string | null } {
  const raw = localStorage.getItem(sourceKey);
  if (raw === null) return { sources: [defaultSource], error: null };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch (error) { return { sources: [defaultSource], error: `plugin sources: ${error instanceof Error ? error.message : String(error)}; using ${defaultSource}` }; }
  if (!Array.isArray(parsed) || !parsed.every(value => typeof value === 'string')) {
    return { sources: [defaultSource], error: `plugin sources: stored value is not a string array; using ${defaultSource}` };
  }
  return { sources: parsed, error: null };
}

function validRepository(value: string): boolean {
  return repositoryPattern.test(value) && !value.split('/').some(part => part === '.' || part === '..');
}

const roleKeys = { plugin: 'filterRolePlugin', adapter: 'filterRoleAdapter', agent: 'filterRoleAgent', webui: 'filterRoleWebUI' } as const;

function roleLabel(ui: ReturnType<typeof useUI>, role: string): string {
  const key = roleKeys[role as keyof typeof roleKeys];
  return key ? ui[key] : role;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * issueURL 构造 GitHub 收录申请地址。
 * validRepository 是来源的唯一信任边界：只允许两个 [\w.-] 段且排除 . 与 ..，因此协议与主机是常量。
 */
export function issueURL(source: string, fields: [string, string][]): string | null {
  if (!validRepository(source)) return null;
  const query = fields.map(([key, value], i) => `${i === 0 ? 'template=submit-plugin.yml&' : ''}${key}=${encodeURIComponent(value)}`).join('&');
  return `https://github.com/${source}/issues/new?${query}`;
}

/**
 * 插件商店面板：搜索、角色筛选、排序、分页、安装/更新反馈，以及发布插件的检查与提交。
 * 安装沿用 Core 的 remote Source 入口；同类替换与信任确认沿用返回的 409 确认对象。
 */
export function StorePanel({ packages, onInstalled, onManage }: { packages: Package[]; onInstalled: () => Promise<void>; onManage: () => void }) {
  const ui = useUI();
  const { register } = useContext(SearchContext);
  const [initial] = useState(loadStoreSources);
  const [sources, setSources] = useState<string[]>(initial.sources);
  const [sourceErrorText, setSourceErrorText] = useState<string | null>(initial.error);
  const [source, setSource] = useState(() => sources[0] ?? '');
  const [adding, setAdding] = useState(false);
  const [newSource, setNewSource] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [sort, setSort] = useState<StoreSort>('stars');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<StorePage | null>(null);
  const [loading, setLoading] = useState(false);
  const [sourceError, setSourceError] = useState<unknown>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [updating, setUpdating] = useState<StoreEntry | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [updated, setUpdated] = useState<{ id: string; version: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<{ title: string; affected: string[]; run: () => Promise<void | boolean> } | null>(null);

  const pageCount = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  // 进入商店、切换源、手动刷新要求刷新远端，其余查询走本地快照。
  // 用 ref 记录待执行的刷新意图，effect 在请求启动后立即清零，避免刷新完成再触发一次多余请求。
  const pendingRefresh = useRef(true);
  // syncing 表示「有一轮会刷新远端的请求尚未完成」：期间锁住会改变当前请求的控件，
  // 避免 effect 清理把远端结果标记为失效而丢弃成功或失败。
  const [syncing, setSyncing] = useState(true);
  // 手动刷新同一筛选条件时 source/query 等值不变，用计数显式重跑 effect。
  const [reloadKey, setReloadKey] = useState(0);
  // 控件是否可改：本轮刷新未完成时一律锁定，避免丢弃在途结果。
  const controlsLocked = syncing;

  useEffect(() => {
    let active = true;
    setSourceError(null); setError('');
    if (!source) { setData(null); setLoading(false); setSyncing(false); return; }
    const refresh = pendingRefresh.current;
    pendingRefresh.current = false;
    if (refresh) setSyncing(true);
    setLoading(true);
    getStore({ source, mirror: localStorage.getItem(mirrorKey) ?? 'auto', role, q: query, sort, offset: (page - 1) * pageSize, limit: pageSize, refresh })
      .then(value => { if (active) setData(value); })
      .catch(err => { if (active) { setData(null); setSourceError(err); } })
      .finally(() => { if (active) { setLoading(false); setSyncing(false); } });
    return () => { active = false; };
  }, [source, role, query, sort, page, reloadKey]);

  // 结果变少时退回最后一个存在的页，避免停在空页。
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  useEffect(() => register([
    { id: 'store-publish', title: ui.publishPlugin, section: ui.storeTab, run: () => setPublishing(true), keywords: ['publish', 'store'] },
    { id: 'store-source', title: ui.addSource, section: ui.storeTab, run: () => { if (!syncing) setAdding(true); } },
  ]), [register, ui, syncing]);

  function saveSources(next: string[]) {
    try { localStorage.setItem(sourceKey, JSON.stringify(next)); setSourceErrorText(null); }
    catch (error) { setSourceErrorText(`plugin sources: ${error instanceof Error ? error.message : String(error)}`); }
    setSources(next);
  }

  function applySource(next: string) {
    // 重复选择当前来源时不改变任何请求条件，直接返回，避免把界面锁在不可操作状态。
    if (next === source) return;
    setSource(next);
    setPage(1);
    setQuery('');
    pendingRefresh.current = true;
    setSyncing(true);
  }

  function refreshSnapshot() {
    pendingRefresh.current = true;
    setSyncing(true);
    setReloadKey(key => key + 1);
  }

  // 安装：Core 返回同类冲突或信任确认时用 409 的 affected 结果重新发起。
  // 同类冲突（Adapter 按 adapter_id 判定）同样回 409，但没 affected，需要带 Replace 再问一次。
  async function install(entry: StoreEntry, replace = false, confirm = false): Promise<void | boolean> {
    setBusy(true); setError(''); setNotice(`${ui.installStarted.replace('{name}', entry.name || entry.repo)}…`);
    try {
      const pkg = await installPackage({ Source: entry.repo, Replace: replace, Confirm: confirm });
      await onInstalled();
      setNotice(`${ui.installed}: ${pkg.ID} v${pkg.Version}`);
      if (pkg.Warnings?.length) setError(pkg.Warnings.join('\n'));
    } catch (err) {
      setNotice('');
      // 先认确认对象：Core 的信任/同类替换确认带 affected，原样展示后再重发。
      if (isConfirmationError(err)) {
        setConfirmation({ title: ui.confirmAffectedTitle, affected: err.affected, run: () => install(entry, replace, true) });
        return false;
      }
      // 同类冲突（Adapter 按 adapter_id 判定）返回不带 affected 的 ALREADY_EXISTS：
      // 只用 Core 给出的原因，不猜 adapter_id；替换请求再交给 Core 按真实冲突判定并回复全部 affected。
      if (!replace && err instanceof AdminAPIError && err.status === 409 && err.code === 'ALREADY_EXISTS') {
        setConfirmation({ title: ui.replaceComponent, affected: [err.message, entry.repo], run: () => install(entry, true) });
        return false;
      }
      setError(message(err));
    } finally { setBusy(false); }
  }

  async function update(entry: StoreEntry, confirm = false): Promise<void | boolean> {
    setError(''); setNotice(`${ui.updateStarted.replace('{name}', entry.name || entry.repo)}…`);
    try {
      const result = await updatePackage(entry.id, { confirm });
      const changed = (await listPackages()).find(pkg => pkg.ID === entry.id);
      if (changed) setUpdated({ id: changed.ID, version: changed.Version });
      await onInstalled();
      setNotice(`${ui.installed}: ${changed?.ID ?? entry.id} v${changed?.Version ?? entry.version}`);
      if (result.warnings?.length) setError(result.warnings.join('\n'));
    } catch (err) {
      setNotice('');
      if (isConfirmationError(err)) {
        setConfirmation({ title: ui.confirmAffectedTitle, affected: err.affected, run: () => update(entry, true) });
        setUpdating(null);
        return false;
      }
      setError(message(err));
    }
  }

  const counts = data?.counts;
  const roleLabels: [string, string, number | undefined][] = [
    ['', ui.filterRoleAll, counts?.all],
    ['plugin', ui.filterRolePlugin, counts?.plugin],
    ['adapter', ui.filterRoleAdapter, counts?.adapter],
    ['agent', ui.filterRoleAgent, counts?.agent],
    ['webui', ui.filterRoleWebUI, counts?.webui],
  ];

  return <div className="store-panel">
    {updated && <ChangelogDialog component={updated.id} version={updated.version} open automatic onClose={() => setUpdated(null)} />}

    <div className="data-toolbar store-toolbar">
      <label className="store-source-picker"><Upload size={13} className="muted" /><span className="muted">{ui.pluginSources}</span>
        <select aria-label={ui.pluginSources} value={source} disabled={controlsLocked} onChange={e => applySource(e.target.value)}>
          {!sources.length && <option value="">{ui.pluginSources}</option>}
          {sources.map(value => <option key={value}>{value}</option>)}
        </select>
      </label>
      <button title={ui.addSource} aria-label={ui.addSource} disabled={controlsLocked} onClick={() => { setNewSource(''); setAdding(true); }}><Plus size={16} /></button>
      {source && <button title={ui.removeSource} aria-label={ui.removeSource} disabled={controlsLocked} onClick={() => { const next = sources.filter(value => value !== source); saveSources(next); applySource(next[0] ?? ''); }}><Trash2 size={16} /></button>}
      <div className="role-filter-pills store-role-pills">{roleLabels.map(([value, label, count]) => <button
        key={value || 'all'}
        className={`role-filter-pill ${role === value ? 'is-active' : ''}`}
        aria-pressed={role === value}
        onClick={() => { setRole(value); setPage(1); }}
        disabled={controlsLocked}
      >{label}{count !== undefined && <span className="pill-badge">{count}</span>}</button>)}</div>
      <div className="store-actions">
        <div className="search-filter-box">
          <input className="search-filter-input" type="search" aria-label={ui.searchStore} placeholder={ui.searchStore} value={query} disabled={controlsLocked} onChange={e => { setQuery(e.target.value); setPage(1); }} />
        </div>
        <button className="sort-toggle-button is-active" onClick={() => { setSort(sort === 'stars' ? 'name' : 'stars'); setPage(1); }} disabled={controlsLocked} title={sort === 'stars' ? ui.storeSortStars : ui.storeSortName}>
          <span>{sort === 'stars' ? ui.storeSortStars : ui.storeSortName}</span>
        </button>
        <button className="sort-toggle-button" onClick={refreshSnapshot} disabled={!source || syncing} aria-label={ui.storeRefresh}>
          <RefreshCw size={15} className={syncing ? 'is-spinning' : undefined} />
          <span>{syncing ? ui.loading : ui.storeRefresh}</span>
        </button>
        <button className="plugin-primary-button" onClick={() => setPublishing(true)}><Upload size={15} /><span>{ui.publishPlugin}</span></button>
      </div>
    </div>

    {sourceErrorText && <p role="alert" className="form-error">{sourceErrorText}</p>}
    {notice && <p role="status" className="store-notice">{notice}</p>}
    {error && <pre role="alert" className="form-error">{error}</pre>}
    {!!sourceError && <div role="status" className="form-error">
      <p>{sourceError instanceof AdminAPIError && sourceError.code === 'SOURCE_INDEX_MISSING' ? ui.sourceIndexMissing : ui.storeFetchFailed}</p>
      <span>{message(sourceError)}</span>
    </div>}
    {data?.error && <div role="status" className="form-error">
      <p>{ui.storeFetchFailed}</p>
      <span>{data.error}</span>
    </div>}
    {data && <p className="muted store-fetched-at">{ui.cacheTime}: <span className="font-mono">{data.fetched_at}</span></p>}

    {loading ? <p role="status">{ui.loading}</p> : !source ? <div className="data-empty">
      <p>{ui.noSources}</p>
      <button onClick={() => setAdding(true)}>{ui.addSource}</button>
    </div> : <>
      <div className="store-grid">{data?.items.map(entry => {
        // 更新优先：同一 ID 换了来源仍要给详情入口，所以更新与详情各自独立判断。
        const card = storeCardState(entry, packages);
        return <article className="store-card" key={entry.repo}>
          <header>
            <div className="store-icon">{entry.icon_url && <img src={entry.icon_url} alt="" />}</div>
            <div className="store-heading">
              <strong>{entry.name || ui.unknownMetadata}</strong>
              {entry.repo.split('/')[0].toLowerCase() === 'alonabot' && <BadgeCheck size={16} aria-label={ui.officialVerified} className="verified" />}
              <small>{entry.repo}</small>
            </div>
            <span className="store-role-badge">{roleLabel(ui, entry.role)}</span>
          </header>
          <p className="store-description">{entry.description || ui.unknownMetadata}</p>
          <div className="store-tags">{entry.author && <span>{entry.author}</span>}{entry.tags.map(tag => <span key={tag}>#{tag}</span>)}</div>
          <footer>
            <span><Star size={14} />{entry.stars?.toLocaleString() ?? '—'}</span>
            <span className="font-mono">{entry.version || '—'}</span>
            <div className="store-card-actions">
              {card.installed && <button className="dialog-button" onClick={() => navigate(`/components/${encodeURIComponent(card.installed!.ID)}`)}>{ui.actionDetails}</button>}
              {card.canUpdate
                ? <button className="dialog-button is-primary" disabled={busy} onClick={() => { setPreviewReady(false); setUpdating(entry); }}><ArrowUpCircle size={14} />{ui.actionUpdate}</button>
                : card.installed
                  ? <button className="dialog-button" disabled>{ui.installed}</button>
                  : <button className="dialog-button is-primary" disabled={busy} onClick={() => void install(entry)}><Download size={14} />{ui.actionInstall}</button>}
            </div>
          </footer>
        </article>;
      })}</div>
      {data && data.total === 0 && <p className="data-empty">{ui.noEntries}</p>}
      {data && <button className="store-manage-link" onClick={onManage}>{ui.goManage}</button>}
      {data && <Pagination page={page} total={data.total} size={pageSize} onChange={setPage} disabled={controlsLocked} />}
    </>}

    {updating && <ActionDialog title={ui.actionUpdate} onClose={() => setUpdating(null)} onConfirm={async () => { if (!previewReady) throw new Error(ui.loadingUpdate); return update(updating); }}>
      <ReleasePreview repo={updating.repo} onLoaded={() => setPreviewReady(true)} />
    </ActionDialog>}

    {adding && <ActionDialog title={ui.addSource} onClose={() => setAdding(false)} onConfirm={async () => {
      if (!validRepository(newSource)) throw new Error(ui.sourceRepository);
      const next = [...new Set([...sources, newSource])];
      saveSources(next);
      applySource(newSource);
    }}>
      <label className="dialog-field-label">{ui.sourceRepository}<input value={newSource} onChange={e => setNewSource(e.target.value.trim())} placeholder="owner/repo" /></label>
    </ActionDialog>}

    {confirmation && <ActionDialog key={confirmation.affected.join(':')} title={confirmation.title} onClose={() => setConfirmation(null)} onConfirm={confirmation.run}>
      <p>{ui.confirmAffectedDesc}</p>
      <ul>{confirmation.affected.map(value => <li key={value}>{value}</li>)}</ul>
    </ActionDialog>}

    {publishing && <PublishDialog source={source} sources={sources} onClose={() => setPublishing(false)} />}
  </div>;
}

/**
 * 发布插件弹窗：仓库输入 → 检查 → 结果 → 提交到商店。
 * 检查走 WebUI 后台的只读接口；提交在 GitHub 上以预填的收录申请完成，WebUI 不保存凭据。
 */
function PublishDialog({ source, sources, onClose }: { source: string; sources: string[]; onClose: () => void }) {
  const ui = useUI();
  const [repo, setRepo] = useState('');
  const [check, setCheck] = useState<StoreCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [target, setTarget] = useState(source || sources[0] || defaultSource);
  const [tags, setTags] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const tagList = tags.split(',').map(tag => tag.trim()).filter(Boolean);
  const fields = useMemo(() => check ? [
    ['repo', check.repo], ['role', check.role],
    ...(tagList.length ? [['tags', tagList.join(',')] as [string, string]] : []),
    ['release_url', check.release_url],
  ] as [string, string][] : [], [check, tagList]);

  // 仓库输入在 checking 期间禁用，因此返回的检查结果必然对应当前输入。
  async function runCheck() {
    setChecking(true); setCheckError(''); setCheck(null); setSubmitted(false);
    try { setCheck(await checkStoreRepo(repo.trim())); }
    catch (err) {
      setCheckError(err instanceof AdminAPIError && err.code === 'NO_RELEASE' ? ui.noPublishedRelease : message(err));
    } finally { setChecking(false); }
  }

  function submit() {
    const url = issueURL(target, fields);
    if (url === null) { setCheckError(ui.sourceRepository); return; }
    window.open(url, '_blank', 'noreferrer');
    setSubmitted(true);
  }

  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" />
    <Dialog.Content className="dialog-content plugins-dialog-content publish-dialog" aria-describedby={undefined}>
      <div className="dialog-header"><Dialog.Title className="dialog-title">{ui.publishPlugin}</Dialog.Title>
        <Dialog.Close className="dialog-close-button" aria-label={ui.close}><X size={16} /></Dialog.Close>
      </div>
      <p className="muted">{ui.publishInstructions} <a href="https://github.com/AlonaBot/alonabot-plugin-template" target="_blank" rel="noreferrer">{ui.pluginTemplate} <ExternalLink size={13} /></a></p>

      <div className="publish-repo-row">
        <label className="dialog-field-label">{ui.storeCheckRepo}
          <input className="font-mono" value={repo} placeholder="owner/repo" aria-label={ui.storeCheckRepo} disabled={checking} onChange={e => { setRepo(e.target.value); setCheck(null); setCheckError(''); }} />
        </label>
        <button className="dialog-button is-primary" disabled={checking || !validRepository(repo.trim())} onClick={() => void runCheck()}>
          {checking ? ui.loading : ui.storeCheckAction}
        </button>
      </div>

      {checking && <p role="status">{ui.storeCheckPending}</p>}
      {checkError && <pre role="alert" className="form-error">{checkError}</pre>}

      {check && <div className="publish-result">
        <strong>{check.name || ui.unknownMetadata}</strong>
        <dl>
          <dt>{ui.sourceLabel}</dt><dd className="font-mono">{check.repo}</dd>
          <dt>{ui.storeCheckType}</dt><dd>{roleLabel(ui, check.role)}</dd>
          <dt>{ui.version}</dt><dd className="font-mono">{check.version}</dd>
          {check.description && <><dt>{ui.storeCheckDescription}</dt><dd>{check.description}</dd></>}
          {check.author && <><dt>{ui.storeCheckAuthor}</dt><dd>{check.author}</dd></>}
        </dl>
        {!!check.warnings.length && <div className="form-error" role="status"><p>{ui.warnings}</p><ul>{check.warnings.map(value => <li key={value}>{value}</li>)}</ul></div>}
        <label className="dialog-field-label">{ui.storeCheckTags}
          <input value={tags} placeholder="music, fun" onChange={e => setTags(e.target.value)} />
        </label>
        <label className="dialog-field-label">{ui.pluginSources}
          <select aria-label={ui.pluginSources} value={target} onChange={e => setTarget(e.target.value)}>
            {(sources.length ? sources : [target]).map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        {target && <pre className="publish-preview">{JSON.stringify({ version: 1, plugins: [{ repo: check.repo, role: check.role, ...(tagList.length ? { tags: tagList } : {}) }] }, null, 2)}</pre>}
      </div>}

      <div className="dialog-actions">
        <button className="dialog-button" onClick={onClose}>{ui.cancel}</button>
        <button className="dialog-button is-primary" disabled={!check || !target} onClick={submit}>{ui.storeSubmit}</button>
      </div>
      {submitted && <p role="status" className="store-notice">{ui.storeSubmitted} <a href={`https://github.com/${target}/blob/HEAD/index.json`} target="_blank" rel="noreferrer">{target}/index.json <ExternalLink size={13} /></a></p>}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
