import { useContext, useEffect, useState, type JSX } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { changeCoreAdmin, getCoreDenies, setCoreDenies } from '../api/admin';
import { useUI } from '../i18n/UI';
import { SearchContext } from '../shell/search';
import { loadUsers, mergeUsers } from './users';
import { PermissionsTabs } from './PermissionsTabs';
import { Pagination } from '../components/Pagination';
import { ActionDialog } from '../components/ActionDialog';

export function UsersPage(): JSX.Element {
  const ui = useUI();
  const { register } = useContext(SearchContext);
  const [users, setUsers] = useState<ReturnType<typeof mergeUsers>>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [adapter, setAdapter] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [newUser, setNewUser] = useState('');
  const [newAction, setNewAction] = useState('admin');
  async function load() {
    setLoading(true);
    try {
      setUsers(await loadUsers());
    } catch (err) { setError(String(err)); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => register([{ id: 'users-add', title: ui.addUser, section: ui.users, run: () => setAdding(true), keywords: ['user', 'admin', 'deny'] }]), [register, ui]);
  async function change(user: string, action: 'admin' | 'deny', enabled: boolean) {
    setBusy(true);
    try {
      if (action === 'admin') await changeCoreAdmin(enabled ? 'add' : 'remove', user);
      else {
        const current = await getCoreDenies();
        await setCoreDenies({ chats: current.chats, users: enabled ? [...new Set([...current.users, user])] : current.users.filter(value => value !== user) });
      }
    } finally { await load(); setBusy(false); }
  }
  const filtered = users.filter(user => (!adapter || user.adapter === adapter) && (filter === 'all' || (filter === 'admin' ? user.admin : user.denied)) && `${user.user} ${user.display_name}`.toLowerCase().includes(query.toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pages);
  return <div className="users-page">
    <PermissionsTabs active="users" userCount={loading || error ? null : users.length} />
    <div className="data-toolbar">
      <div className="time-range-pills">{(['all', 'admin', 'denied'] as const).map(value => <button key={value} className={`time-range-pill ${filter === value ? 'is-active' : ''}`} onClick={() => { setFilter(value); setPage(1); }}>{({ all: ui.filterRoleAll, admin: ui.administrator, denied: ui.denied })[value]} <small>{users.filter(user => value === 'all' || (value === 'admin' ? user.admin : user.denied)).length}</small></button>)}</div>
      <select aria-label={ui.platform} value={adapter} onChange={e => { setAdapter(e.target.value); setPage(1); }}><option value="">{ui.allPlatforms}</option>{[...new Set(users.map(user => user.adapter))].map(value => <option key={value}>{value}</option>)}</select>
      <input aria-label={ui.searchUsers} placeholder={ui.searchUsers} value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} />
      <button aria-label={ui.refresh} onClick={() => { setError(''); void load(); }}><RefreshCw size={16} /></button>
      <button className="dialog-button is-primary" disabled={busy} onClick={() => { setNewUser(''); setAdding(true); }}><Plus size={16} />{ui.addUser}</button>
    </div>
    {error && <pre role="alert" className="form-error">{error}</pre>}
    {loading ? <p role="status">{ui.loading}</p> : <div className="data-table-wrap"><table className="data-table"><thead><tr><th>{ui.users}</th><th>{ui.platform}</th><th>{ui.identity}</th><th>{ui.status}</th><th>{ui.actions}</th></tr></thead><tbody>
      {filtered.slice((currentPage - 1) * 20, currentPage * 20).map(user => <tr key={user.user}><td><strong>{user.display_name || user.user}</strong><small className="muted block">{user.user}</small></td><td>{user.adapter}</td><td>{user.admin ? <span className="status-tag"><ShieldCheck size={13} />{ui.administrator}</span> : '—'}</td><td><span className={user.denied ? 'is-danger' : 'muted'}>{user.denied ? ui.denied : ui.normal}</span></td><td><DropdownMenu.Root><DropdownMenu.Trigger asChild><button aria-label={`${ui.actions}: ${user.user}`}><MoreHorizontal size={16} /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="dropdown-menu-content" align="end">{(['admin', 'deny'] as const).map(action => <DropdownMenu.Item disabled={busy} className="dropdown-menu-item" key={action} onSelect={() => { setError(''); void change(user.user, action, !(action === 'admin' ? user.admin : user.denied)).catch(err => setError(String(err))); }}>{action === 'admin' ? (user.admin ? ui.removeAdmin : ui.grantAdmin) : (user.denied ? ui.allowUser : ui.denyUser)}</DropdownMenu.Item>)}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></td></tr>)}
    </tbody></table>{filtered.length === 0 && <p className="data-empty">{ui.noUsers}</p>}</div>}
    <Pagination page={currentPage} total={filtered.length} size={20} onChange={setPage} />
    {adding && <ActionDialog title={ui.addUser} onClose={() => setAdding(false)} onConfirm={async () => { await change(newUser, newAction === 'admin' ? 'admin' : 'deny', true); }}>
      <label className="dialog-field-label">{ui.userID}<input value={newUser} placeholder="telegram:123" onChange={e => setNewUser(e.target.value)} /></label>
      <label className="dialog-field-label">{ui.identity}<select value={newAction} onChange={e => setNewAction(e.target.value)}><option value="admin">{ui.administrator}</option><option value="deny">{ui.denied}</option></select></label>
    </ActionDialog>}
  </div>;
}
