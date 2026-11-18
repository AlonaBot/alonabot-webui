import { useContext, useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { BadgeCheck, Download, ExternalLink, Plus, Star, Trash2, Upload, X } from 'lucide-react';
import { AdminAPIError, installPackage, isConfirmationError, listPackages, updatePackage, type Package } from '../api/admin';
import { compareVersions, repository } from './versions';
import { ChangelogDialog, ReleasePreview } from '../components/ChangelogDialog';
import { getStore, type StorePage, type StoreEntry } from '../api/webui';
import { useUI } from '../i18n/UI';
import { SearchContext } from '../shell/search';
import { Pagination } from '../components/Pagination';
import { ActionDialog } from '../components/ActionDialog';

const sourceKey = 'alonabot.webui.sources';
export function loadStoreSources(): string[] {
  return JSON.parse(localStorage.getItem(sourceKey) ?? '["AlonaBot/plugin-store"]');
}
export function StorePanel({ packages, onInstalled }: { packages: Package[]; onInstalled: () => Promise<void> }) {
  const ui = useUI();
  const { register } = useContext(SearchContext);
  const [sources, setSources] = useState<string[]>(loadStoreSources);
  const [source, setSource] = useState(() => sources[0] ?? '');
  const [adding, setAdding] = useState(false);
  const [newSource, setNewSource] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<StorePage | null>(null);
  const [loading, setLoading] = useState(false);
  const [sourceError, setSourceError] = useState<unknown>(null);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState<StoreEntry | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [updated, setUpdated] = useState<{ id: string; version: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<{ title: string; affected: string[]; run: () => Promise<void | boolean> } | null>(null);
  useEffect(() => {
    let active = true;
    setData(null); setSourceError(null); setError('');
    if (!source) { setLoading(false); return; }
    setLoading(true);
    getStore({ source, role, q: query, offset: (page - 1) * 9, limit: 9 }).then(value => { if (active) setData(value); }).catch(err => { if (active) setSourceError(err); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [source, role, query, page]);
  useEffect(() => register([{ id: 'store-publish', title: ui.publishPlugin, section: ui.storeTab, run: () => setPublishing(true), keywords: ['publish', 'store'] }, { id: 'store-source', title: ui.addSource, section: ui.storeTab, run: () => setAdding(true) }]), [register, ui]);
  function saveSources(next: string[]) { localStorage.setItem(sourceKey, JSON.stringify(next)); setSources(next); }
  async function install(entry: StoreEntry, replace = false, confirm = false): Promise<void | boolean> {
    setBusy(true); setError('');
    try { await installPackage({ Source: entry.repo, Replace: replace, Confirm: confirm }); await onInstalled(); }
    catch (err) {
      if (isConfirmationError(err)) { setConfirmation({ title: ui.confirmAffectedTitle, affected: err.affected, run: () => install(entry, replace, true) }); return false; }
      else throw err;
    } finally { setBusy(false); }
  }
  function choose(entry: StoreEntry) {
    const conflict = packages.find(pkg => !pkg.Uninstalled && pkg.Role === entry.role && (entry.role === 'agent' || entry.role === 'webui'));
    if (conflict) setConfirmation({ title: ui.replaceComponent, affected: [conflict.ID, entry.repo], run: () => install(entry, true) });
    else void install(entry).catch(err => setError(String(err)));
  }
  async function update(entry: StoreEntry, confirm = false): Promise<void | boolean> {
    try { await updatePackage(entry.id, { confirm }); const installed = (await listPackages()).find(pkg => pkg.ID === entry.id); if (installed) setUpdated({ id: installed.ID, version: installed.Version }); await onInstalled(); }
    catch (err) { if (isConfirmationError(err)) { setConfirmation({ title: ui.confirmAffectedTitle, affected: err.affected, run: () => update(entry, true) }); setUpdating(null); return false; } throw err; }
  }
  return <div className="store-panel">
    {updated && <ChangelogDialog component={updated.id} version={updated.version} open automatic onClose={() => setUpdated(null)} />}
    <div className="data-toolbar store-toolbar">
      <select aria-label={ui.pluginSources} value={source} onChange={e => { setSource(e.target.value); setPage(1); }}>{!sources.length && <option value="">{ui.pluginSources}</option>}{sources.map(value => <option key={value}>{value}</option>)}</select>
      <button title={ui.addSource} aria-label={ui.addSource} onClick={() => { setNewSource(''); setAdding(true); }}><Plus size={16} /></button>
      {source && <button title={ui.removeSource} aria-label={ui.removeSource} onClick={() => { const next = sources.filter(value => value !== source); saveSources(next); setSource(next[0] ?? ''); setPage(1); }}><Trash2 size={16} /></button>}
      <div className="time-range-pills">{[['', ui.filterRoleAll], ['plugin', ui.filterRolePlugin], ['adapter', ui.filterRoleAdapter], ['agent', ui.filterRoleAgent], ['webui', ui.filterRoleWebUI]].map(([value, label]) => <button className={`time-range-pill ${role === value ? 'is-active' : ''}`} key={value} onClick={() => { setRole(value); setPage(1); }}>{label}</button>)}</div>
      <input aria-label={ui.searchPluginPlaceholder} placeholder={ui.searchPluginPlaceholder} value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} />
      <button className="dialog-button is-primary" onClick={() => setPublishing(true)}><Upload size={15} />{ui.publishPlugin}</button>
    </div>
    {error && <pre role="alert" className="form-error">{error}</pre>}
    {!!sourceError && <p className="data-empty" role="status">{sourceError instanceof AdminAPIError && sourceError.code === 'SOURCE_INDEX_MISSING' ? ui.sourceIndexMissing : ui.storeFetchFailed}</p>}
    {data?.error && <div role="status" className="form-error"><p>{ui.storeFetchFailed}</p><span>{ui.cacheTime}: {data.fetched_at}</span></div>}
    {loading ? <p role="status">{ui.loading}</p> : !source ? <div className="data-empty"><p>{ui.noSources}</p><button onClick={() => setAdding(true)}>{ui.addSource}</button></div> : <>
      <div className="store-grid">{data?.items.map(entry => {
        const installed = packages.find(pkg => !pkg.Uninstalled && pkg.ID === entry.id);
        const canUpdate = installed && repository(installed.Source)?.toLowerCase() === entry.repo.toLowerCase() && compareVersions(entry.version, installed.Version) === 1;
        return <article className="store-card" key={entry.repo}>
          <header><div className="store-icon">{entry.icon_url && <img src={entry.icon_url} alt="" />}</div><div className="store-heading"><strong>{entry.name || ui.unknownMetadata}</strong>{entry.repo.split('/')[0].toLowerCase() === 'alonabot' && <BadgeCheck size={16} aria-label={ui.officialVerified} className="verified" />}<small>{entry.repo}</small></div></header>
          <p className="store-description">{entry.description || ui.unknownMetadata}</p>
          <div className="store-tags"><span>{entry.author || ui.unknownMetadata}</span>{entry.tags.map(tag => <span key={tag}>#{tag}</span>)}</div>
          <footer><span><Star size={14} />{entry.stars?.toLocaleString() ?? '—'}</span><span className="font-mono">{entry.version || '—'}</span><button disabled={busy || (!!installed && !canUpdate)} className="dialog-button is-primary" onClick={() => { if (installed) { setPreviewReady(false); setUpdating(entry); } else choose(entry); }}>{installed ? (canUpdate ? ui.actionUpdate : ui.installed) : <><Download size={14} />{ui.actionInstall}</>}</button></footer>
        </article>;
      })}</div>
      {data?.total === 0 && <p className="data-empty">{ui.noEntries}</p>}
      {data && <Pagination page={page} total={data.total} size={9} onChange={setPage} />}
    </>}
    {updating && <ActionDialog title={ui.actionUpdate} onClose={() => setUpdating(null)} onConfirm={async () => { if (!previewReady) throw new Error(ui.loadingUpdate); return update(updating); }}><ReleasePreview repo={updating.repo} onLoaded={() => setPreviewReady(true)} /></ActionDialog>}
    {adding && <ActionDialog title={ui.addSource} onClose={() => setAdding(false)} onConfirm={async () => {
      if (!/^[\w.-]+\/[\w.-]+$/.test(newSource) || newSource.split('/').some(part => part === '.' || part === '..')) throw new Error(ui.sourceRepository);
      saveSources([...new Set([...sources, newSource])]); setSource(newSource); setPage(1);
    }}><label className="dialog-field-label">{ui.sourceRepository}<input value={newSource} onChange={e => setNewSource(e.target.value)} placeholder="owner/repo" /></label></ActionDialog>}
    {confirmation && <ActionDialog key={confirmation.affected.join(':')} title={confirmation.title} onClose={() => setConfirmation(null)} onConfirm={confirmation.run}><ul>{confirmation.affected.map(value => <li key={value}>{value}</li>)}</ul></ActionDialog>}
    <Dialog.Root open={publishing} onOpenChange={setPublishing}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content plugins-dialog-content" aria-describedby={undefined}><div className="dialog-header"><Dialog.Title className="dialog-title">{ui.publishPlugin}</Dialog.Title><Dialog.Close className="dialog-close-button" aria-label={ui.close}><X size={16} /></Dialog.Close></div><p>{ui.publishInstructions}</p><a href="https://github.com/AlonaBot/alonabot-plugin-template" target="_blank" rel="noreferrer">{ui.pluginTemplate} <ExternalLink size={14} /></a><pre>{JSON.stringify({ repo: 'owner/repo', role: 'plugin', tags: [] }, null, 2)}</pre>{source && <a href={`https://github.com/${source}/blob/HEAD/index.json`} target="_blank" rel="noreferrer">{source}/index.json</a>}</Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
