import { useContext, useEffect, useState, type JSX } from 'react';
import { MoreHorizontal, Plus, RefreshCw, Search, ShieldCheck, ShieldOff, UserCheck, Users } from 'lucide-react';
import { changeCoreAdmin, getCoreDenies, setCoreDenies } from '../api/policies';
import { ActionDialog } from '../components/ActionDialog';
import { useUI } from '../i18n/UI';
import { cn } from '../lib/cn';
import { SearchContext } from '../shell/search';
import { Button } from '../ui/Button';
import { EmptyState, Skeleton } from '../ui/EmptyState';
import { Menu, MenuItem } from '../ui/Menu';
import { Pagination } from '../ui/Pagination';
import { Select } from '../ui/Select';
import { SpotlightCard } from '../ui/SpotlightCard';
import { TabBar } from '../ui/Tabs';
import { PermissionsTabs } from './PermissionsTabs';
import { loadUsers, mergeUsers } from './users';

export function UsersPage(): JSX.Element {
  const ui = useUI();
  const { register } = useContext(SearchContext);
  const [users, setUsers] = useState<ReturnType<typeof mergeUsers>>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'admin' | 'denied'>('all');
  const [adapter, setAdapter] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [newUser, setNewUser] = useState('');
  const [newAction, setNewAction] = useState<'admin' | 'deny'>('admin');

  async function load(): Promise<void> {
    try {
      setUsers(await loadUsers());
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(
    () =>
      register([
        {
          id: 'users-add',
          title: ui.addUser,
          section: ui.users,
          run: () => setAdding(true),
          keywords: ['user', 'admin', 'deny'],
        },
      ]),
    [register, ui],
  );

  async function change(user: string, action: 'admin' | 'deny', enabled: boolean): Promise<void> {
    setBusy(true);
    try {
      if (action === 'admin') {
        await changeCoreAdmin(enabled ? 'add' : 'remove', user);
      } else {
        const current = await getCoreDenies();
        await setCoreDenies({
          chats: current.chats,
          users: enabled
            ? [...new Set([...current.users, user])]
            : current.users.filter(value => value !== user),
        });
      }
    } finally {
      await load();
      setBusy(false);
    }
  }

  const adapters = [...new Set(users.map(user => user.adapter).filter(Boolean))];
  const filtered = users.filter(
    user =>
      (!adapter || user.adapter === adapter) &&
      (filter === 'all' || (filter === 'admin' ? user.admin : user.denied)) &&
      `${user.user} ${user.display_name}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 20, currentPage * 20);

  const renderUserMenu = (user: (typeof users)[number]): JSX.Element => (
    <Menu
      align="end"
      trigger={
        <Button size="sm" variant="ghost" iconOnly aria-label={`${ui.actions}: ${user.user}`}>
          <MoreHorizontal size={16} />
        </Button>
      }
    >
      <MenuItem
        icon={<ShieldCheck size={15} />}
        disabled={busy}
        onSelect={() => {
          setError('');
          void change(user.user, 'admin', !user.admin).catch(err => setError(String(err)));
        }}
      >
        {user.admin ? ui.removeAdmin : ui.grantAdmin}
      </MenuItem>
      <MenuItem
        icon={user.denied ? <UserCheck size={15} /> : <ShieldOff size={15} />}
        tone={user.denied ? undefined : 'danger'}
        disabled={busy}
        onSelect={() => {
          setError('');
          void change(user.user, 'deny', !user.denied).catch(err => setError(String(err)));
        }}
      >
        {user.denied ? ui.allowUser : ui.denyUser}
      </MenuItem>
    </Menu>
  );

  return (
    <div className="space-y-4">
      <PermissionsTabs active="users" userCount={loading || error ? null : users.length} />

      <SpotlightCard className="p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <TabBar
              variant="pill"
              aria-label={ui.users}
              value={filter}
              onValueChange={value => {
                setFilter(value as typeof filter);
                setPage(1);
              }}
              items={[
                { value: 'all', label: ui.filterRoleAll, count: users.length },
                { value: 'admin', label: ui.administrator, count: users.filter(user => user.admin).length },
                { value: 'denied', label: ui.denied, count: users.filter(user => user.denied).length },
              ]}
            />
            <Select
              size="sm"
              variant="filled"
              aria-label={ui.platform}
              value={adapter}
              onValueChange={next => {
                setAdapter(next);
                setPage(1);
              }}
              options={[
                { value: '', label: ui.allPlatforms },
                ...adapters.map(value => ({ value, label: value })),
              ]}
            />
          </div>

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2 sm:flex-initial">
            <div className="relative min-w-[180px] flex-1 sm:w-[220px] sm:flex-initial">
              <Search
                size={14}
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-ink-muted)]"
              />
              <input
                type="search"
                aria-label={ui.searchUsers}
                placeholder={ui.searchUsers}
                value={query}
                onChange={e => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                className="h-8 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] pr-3 pl-8.5 text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
              />
            </div>

            <Button
              size="sm"
              variant="secondary"
              iconOnly
              aria-label={ui.refresh}
              title={ui.refresh}
              onClick={() => {
                setError('');
                void load();
              }}
            >
              <RefreshCw size={14} />
            </Button>

            <Button
              size="sm"
              variant="primary"
              icon={<Plus size={15} />}
              disabled={busy}
              onClick={() => {
                setNewUser('');
                setAdding(true);
              }}
            >
              {ui.addUser}
            </Button>
          </div>
        </div>
      </SpotlightCard>

      {error && (
        <pre role="alert" className="form-error whitespace-pre-wrap">
          {error}
        </pre>
      )}

      {loading ? (
        <SpotlightCard className="p-5">
          <Skeleton height={160} />
        </SpotlightCard>
      ) : filtered.length === 0 ? (
        <SpotlightCard className="p-6">
          <EmptyState
            icon={<Users size={22} />}
            title={ui.noUsers}
            action={
              users.length === 0 ? (
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Plus size={15} />}
                  onClick={() => {
                    setNewUser('');
                    setAdding(true);
                  }}
                >
                  {ui.addUser}
                </Button>
              ) : undefined
            }
          />
        </SpotlightCard>
      ) : (
        <>
          {/* 桌面端表格视图 */}
          <SpotlightCard className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-line)] text-left text-xs font-medium text-[var(--color-ink-muted)]">
                    <th className="px-5 py-3">{ui.users}</th>
                    <th className="px-4 py-3">{ui.platform}</th>
                    <th className="px-4 py-3">{ui.identity}</th>
                    <th className="px-4 py-3">{ui.status}</th>
                    <th className="w-16 px-4 py-3 text-right">{ui.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-line)]/70">
                  {visible.map(user => (
                    <tr
                      key={user.user}
                      className="transition-colors hover:bg-[var(--color-surface-2)]/55"
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium text-[var(--color-ink)]">{user.display_name || user.user}</div>
                        <div className="font-mono text-xs text-[var(--color-ink-muted)]">{user.user}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-[var(--color-surface-2)] px-2 py-0.5 font-mono text-xs text-[var(--color-ink-muted)]">
                          {user.adapter || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {user.admin ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-accent-strong)]">
                            <ShieldCheck size={13} aria-hidden="true" />
                            {ui.administrator}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--color-ink-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                            user.denied
                              ? 'bg-[color-mix(in_srgb,var(--color-danger)_14%,transparent)] text-[var(--color-danger)]'
                              : 'bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[var(--color-success)]',
                          )}
                        >
                          {user.denied ? ui.denied : ui.normal}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{renderUserMenu(user)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SpotlightCard>

          {/* 移动端卡片视图 */}
          <div className="space-y-2.5 md:hidden">
            {visible.map(user => (
              <SpotlightCard key={user.user} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
                      {user.display_name || user.user}
                    </p>
                    <p className="truncate font-mono text-xs text-[var(--color-ink-muted)]">{user.user}</p>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {user.adapter && (
                        <span className="rounded-md bg-[var(--color-surface-2)] px-2 py-0.5 font-mono text-[11px] text-[var(--color-ink-muted)]">
                          {user.adapter}
                        </span>
                      )}
                      {user.admin && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-accent-strong)]">
                          <ShieldCheck size={12} aria-hidden="true" />
                          {ui.administrator}
                        </span>
                      )}
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                          user.denied
                            ? 'bg-[color-mix(in_srgb,var(--color-danger)_14%,transparent)] text-[var(--color-danger)]'
                            : 'bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[var(--color-success)]',
                        )}
                      >
                        {user.denied ? ui.denied : ui.normal}
                      </span>
                    </div>
                  </div>
                  {renderUserMenu(user)}
                </div>
              </SpotlightCard>
            ))}
          </div>

          <Pagination page={currentPage} total={filtered.length} size={20} onChange={setPage} />
        </>
      )}

      {adding && (
        <ActionDialog
          title={ui.addUser}
          onClose={() => setAdding(false)}
          onConfirm={async () => {
            await change(newUser.trim(), newAction, true);
          }}
        >
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="block text-xs font-semibold text-[var(--color-ink-muted)]">{ui.userID}</span>
              <input
                value={newUser}
                placeholder="telegram:123"
                autoFocus
                onChange={e => setNewUser(e.target.value)}
                className="h-10 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3.5 font-mono text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
              />
            </label>
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-[var(--color-ink-muted)]">{ui.identity}</span>
              <Select
                variant="filled"
                className="w-full"
                aria-label={ui.identity}
                value={newAction}
                onValueChange={val => setNewAction(val as 'admin' | 'deny')}
                options={[
                  { value: 'admin', label: ui.administrator },
                  { value: 'deny', label: ui.denied },
                ]}
              />
            </div>
          </div>
        </ActionDialog>
      )}
    </div>
  );
}
