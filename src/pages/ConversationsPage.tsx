import { useEffect, useState, type JSX } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { RefreshCw, Trash2 } from 'lucide-react';
import { listPackages, listPluginConversations, clearPluginConversation, getProfileAssignments, listProfiles, type Package, type Profile, type ProfileAssignments } from '../api/admin';
import { useUI } from '../i18n/UI';
import { conversationAssignment } from './conversationState';

const pageSize = 50;
type Conversation = Awaited<ReturnType<typeof listPluginConversations>>[number];

export function ConversationsPage(): JSX.Element {
  const ui = useUI();
  const [packages, setPackages] = useState<Package[]>([]);
  const [plugin, setPlugin] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<ProfileAssignments | null>(null);
  const [list, setList] = useState<{ plugin: string; items: Conversation[] } | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const loading = metadataLoading || listLoading;
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [profile, setProfile] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [clearing, setClearing] = useState<{ plugin: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true; setMetadataLoading(true); setMetadataError(null);
    Promise.all([listPackages(), listProfiles(), getProfileAssignments()]).then(([packages, profiles, assignments]) => {
      if (!active) return;
      const installed = packages.filter(value => !value.Uninstalled && value.Role !== 'webui');
      setPackages(installed); setProfiles(profiles); setAssignments(assignments);
      setPlugin(previous => installed.some(value => value.ID === previous) ? previous : installed[0]?.ID ?? '');
    }).catch(error => { if (active) setMetadataError(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (active) setMetadataLoading(false); });
    return () => { active = false; };
  }, [revision]);
  useEffect(() => {
    if (!plugin) { setList(null); setListLoading(false); return; }
    let active = true; setListLoading(true); setList(null); setError(null); setPage(1);
    listPluginConversations(plugin).then(items => { if (active) setList({ plugin, items }); })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (active) setListLoading(false); });
    return () => { active = false; };
  }, [plugin, revision]);
  const rows = list?.plugin === plugin ? list.items.map(item => ({ ...item, assignment: assignments ? conversationAssignment(item.key, assignments) : undefined })) : [];
  const filtered = rows.filter(row => (!profile || row.assignment?.profile === profile) && row.key.toLowerCase().includes(query.toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  return <div className="conversations-page">
    <div className="conversations-toolbar">
      <select aria-label={ui.filterPlugin} value={plugin} disabled={busy} onChange={event => { setPlugin(event.target.value); setPage(1); }}>{packages.map(value => <option key={value.ID} value={value.ID}>{value.ID}</option>)}</select>
      <select aria-label={ui.profileTitle} value={profile} onChange={event => { setProfile(event.target.value); setPage(1); }}><option value="">{ui.allProfiles}</option>{profiles.map(value => <option key={value.id} value={value.id}>{value.id === 'default' ? ui.defaultProfile : value.name}</option>)}</select>
      <input type="search" aria-label={ui.searchConversations} placeholder={ui.searchConversations} value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} />
      <button type="button" className="detail-icon-button" aria-label={ui.refresh} disabled={busy || loading} onClick={() => { setError(null); setRevision(value => value + 1); }}><RefreshCw size={16} /></button>
    </div>
    {metadataError && <p className="plugins-error-banner" role="alert">{metadataError}</p>}
    {error && <p className="plugins-error-banner" role="alert">{error}</p>}
    {loading ? <p role="status">{ui.loading}</p> : <div className="conversations-table-container"><table className="conversations-table"><thead><tr><th>{ui.conversationKey}</th><th>{ui.account}</th><th>{ui.profileTitle}</th><th>{ui.conversationEntries}</th><th>{ui.conversationUpdatedAt}</th><th>{ui.actions}</th></tr></thead><tbody>{visible.map(row => <tr key={row.key}><td><code>{row.key}</code></td><td>{row.assignment?.instance}</td><td>{row.assignment?.profile === 'default' ? ui.defaultProfile : profiles.find(value => value.id === row.assignment?.profile)?.name ?? row.assignment?.profile}</td><td>{row.entries}</td><td>{row.updated_at}</td><td><button type="button" className="detail-icon-button is-danger" aria-label={`${ui.clearConversation} ${row.key}`} onClick={() => setClearing({ plugin: list!.plugin, key: row.key })}><Trash2 size={14} /></button></td></tr>)}</tbody></table>{filtered.length === 0 && <p>{ui.noConversations}</p>}</div>}
    <div className="pagination-footer"><span>{ui.paginationSummary.replace('{from}', String(filtered.length ? (currentPage - 1) * pageSize + 1 : 0)).replace('{to}', String(Math.min(currentPage * pageSize, filtered.length))).replace('{total}', String(filtered.length))}</span><div className="pagination-controls">{Array.from({ length: pages }, (_, index) => index + 1).map(value => <button key={value} type="button" className="page-number-button" aria-current={value === currentPage ? 'page' : undefined} onClick={() => setPage(value)}>{value}</button>)}</div></div>
    <Dialog.Root open={clearing !== null} onOpenChange={open => { if (!open && !busy) setClearing(null); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content"><Dialog.Title>{ui.clearConversationTitle}</Dialog.Title><Dialog.Description>{ui.clearConversationConfirm.replace('{key}', clearing?.key ?? '')}</Dialog.Description>
      {error && <p role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" disabled={busy} onClick={() => setClearing(null)}>{ui.cancel}</button><button type="button" disabled={busy} onClick={async () => { const target = clearing!; setBusy(true); setError(null); try { await clearPluginConversation(target.plugin, target.key); setClearing(null); setRevision(value => value + 1); } catch (error) { setError(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); } }}>{ui.confirm}</button></div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
