import { useMemo, useState, type JSX } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Clock,
  MessageSquare,
  MessagesSquare,
  MoreHorizontal,
  Search,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { clearPluginConversation, listChats, listPluginConversations, type Chat } from '../../api/conversations';
import { getProfileAssignments, listProfiles } from '../../api/profiles';
import { useUI } from '../../i18n/UI';
import { cn } from '../../lib/cn';
import { conversationAssignment } from '../../pages/conversationState';
import { profileColorToken } from '../../pages/profileColors';
import { installed, usePackages } from '../../queries/packages';
import { navigate } from '../../shell/router';
import { useUISettings } from '../../shell/settings';
import { Button } from '../../ui/Button';
import { ConfirmDialog } from '../../ui/Dialog';
import { EmptyState, LoadingRows } from '../../ui/EmptyState';
import { Menu, MenuItem } from '../../ui/Menu';
import { Pagination } from '../../ui/Pagination';
import { Select } from '../../ui/Select';
import { SpotlightCard } from '../../ui/SpotlightCard';
import { TabBar } from '../../ui/Tabs';
import { toast } from '../../ui/toast';

const PAGE_SIZE = 50;

interface ConversationRow {
  readonly key: string;
  readonly title: string;
  readonly type?: Chat['chat_type'];
  readonly instance: string;
  readonly profile: string;
  readonly entries: number;
  readonly records: string[];
  readonly active: string;
}

/** 相对时间：一小时内按分钟，一天内按小时，更早显示日期。 */
function relative(iso: string, locale: string, now = Date.now()): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '';
  const minutes = Math.round((now - time) / 60_000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (minutes < 60) return format.format(-Math.max(0, minutes), 'minute');
  if (minutes < 24 * 60) return format.format(-Math.round(minutes / 60), 'hour');
  if (minutes < 3 * 24 * 60) return format.format(-Math.round(minutes / 1440), 'day');
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(time);
}

/**
 * 会话：以聊天目录为准列出每个群与私聊，合并 Agent 保存的消息记录条数与所用配置文件。
 * 只有记录、目录里已找不到的会话也列出，便于清理。
 */
export function ConversationsPage(): JSX.Element {
  const ui = useUI();
  const { locale } = useUISettings();
  const client = useQueryClient();
  const packages = usePackages();
  const agent = installed(packages.data).find(item => item.Role === 'agent' && item.Enabled);
  const chats = useQuery({ queryKey: ['chats'], queryFn: listChats });
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: listProfiles });
  const assignments = useQuery({ queryKey: ['profile-assignments'], queryFn: getProfileAssignments });
  const records = useQuery({
    queryKey: ['conversations', agent?.ID],
    queryFn: () => listPluginConversations(agent ? agent.ID : ''),
    enabled: !!agent,
  });

  const [type, setType] = useState('all');
  const [account, setAccount] = useState('');
  const [profile, setProfile] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [clearing, setClearing] = useState<ConversationRow | null>(null);
  const [busy, setBusy] = useState(false);

  const profileByID = useMemo(
    () => new Map((profiles.data ?? []).map(entry => [entry.id, entry])),
    [profiles.data],
  );
  const profileName = (id: string): string =>
    id === 'default' ? ui.defaultProfile : (profileByID.get(id)?.name ?? id);

  const rows = useMemo<ConversationRow[]>(() => {
    if (!chats.data || !assignments.data) return [];
    const entries = records.data ?? [];
    const claimed = new Set<string>();
    const result: ConversationRow[] = chats.data.map(chat => {
      const key = `${chat.session}@${chat.instance_id}`;
      // 群成员各自独立对话时，记录键在会话键后再带一段 @成员。
      const own = entries.filter(entry => entry.key === key || entry.key.startsWith(`${key}@`));
      own.forEach(entry => claimed.add(entry.key));
      const latest = [chat.last_active_at, ...own.map(entry => entry.updated_at)].sort().at(-1) ?? '';
      return {
        key,
        title: chat.title || chat.session,
        type: chat.chat_type,
        instance: chat.instance_id,
        profile: conversationAssignment(key, assignments.data)?.profile ?? 'default',
        entries: own.reduce((sum, entry) => sum + entry.entries, 0),
        records: own.map(entry => entry.key),
        active: latest,
      };
    });
    for (const entry of entries) {
      if (!claimed.has(entry.key)) {
        const instance = entry.key.split('@')[1] ?? '';
        result.push({
          key: entry.key,
          title: entry.key,
          instance,
          profile: conversationAssignment(entry.key, assignments.data)?.profile ?? 'default',
          entries: entry.entries,
          records: [entry.key],
          active: entry.updated_at,
        });
      }
    }
    return result.sort((a, b) => b.active.localeCompare(a.active));
  }, [chats.data, assignments.data, records.data]);

  const scoped = rows.filter(
    row =>
      (!account || row.instance === account) &&
      (!profile || row.profile === profile) &&
      (!query.trim() || `${row.title} ${row.key}`.toLowerCase().includes(query.trim().toLowerCase())),
  );
  const counts = {
    all: scoped.length,
    group: scoped.filter(row => row.type === 'group' || row.type === 'channel').length,
    private: scoped.filter(row => row.type === 'private').length,
  };
  const filtered =
    type === 'all'
      ? scoped
      : scoped.filter(row =>
          type === 'group' ? row.type === 'group' || row.type === 'channel' : row.type === 'private',
        );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const accounts = [...new Set(rows.map(row => row.instance).filter(Boolean))].sort();
  const typeLabel = (row: ConversationRow): string =>
    row.type === 'private' ? ui.chatPrivate : row.type ? ui.chatGroup : '';
  const number = new Intl.NumberFormat(locale);
  const reset = (apply: () => void): void => {
    apply();
    setPage(1);
  };

  const totalEntries = useMemo(() => rows.reduce((sum, row) => sum + row.entries, 0), [rows]);

  const clear = async (): Promise<void> => {
    if (!clearing || !agent) return;
    setBusy(true);
    try {
      for (const key of clearing.records) await clearPluginConversation(agent.ID, key);
      toast.success(ui.conversationCleared);
      setClearing(null);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
      void client.invalidateQueries({ queryKey: ['conversations', agent.ID] });
    }
  };

  const error = chats.error ?? assignments.error ?? records.error;
  const loading = chats.isPending || assignments.isPending || packages.isPending || (!!agent && records.isPending);

  const renderProfileBadge = (profileID: string): JSX.Element => {
    const color = profileColorToken(profileByID.get(profileID)?.color);
    return (
      <button
        type="button"
        onClick={() =>
          navigate(profileID === 'default' ? '/profiles' : `/profiles?profile=${encodeURIComponent(profileID)}`)
        }
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)]/85 px-2.5 py-0.5 text-xs font-semibold text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent-strong)]"
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: profileID === 'default' ? 'var(--color-accent)' : color.dot }}
          aria-hidden="true"
        />
        <span className="max-w-[140px] truncate">{profileName(profileID)}</span>
      </button>
    );
  };

  const renderRowMenu = (row: ConversationRow): JSX.Element => (
    <Menu
      align="end"
      trigger={
        <Button variant="ghost" size="sm" iconOnly aria-label={`${ui.actions} ${row.title}`}>
          <MoreHorizontal size={17} />
        </Button>
      }
    >
      <MenuItem
        icon={<Trash2 size={15} />}
        tone="danger"
        disabled={!agent || row.entries === 0}
        onSelect={() => setClearing(row)}
      >
        {ui.clearConversation}
      </MenuItem>
    </Menu>
  );

  return (
    <div className="space-y-4">
      {/* 顶部汇总 KPI 条（存在会话时展示） */}
      {!loading && !error && rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <SpotlightCard className="px-4 py-3">
            <p className="text-xs font-medium text-[var(--color-ink-muted)]">{ui.conversations}</p>
            <p className="tabular-nums mt-1 text-xl font-bold tracking-tight text-[var(--color-ink)]">
              {number.format(rows.length)}
            </p>
          </SpotlightCard>
          <SpotlightCard className="px-4 py-3">
            <p className="text-xs font-medium text-[var(--color-ink-muted)]">{ui.conversationEntries}</p>
            <p className="tabular-nums mt-1 text-xl font-bold tracking-tight text-[var(--color-ink)]">
              {number.format(totalEntries)}
            </p>
          </SpotlightCard>
          <SpotlightCard className="col-span-2 px-4 py-3 sm:col-span-1">
            <p className="text-xs font-medium text-[var(--color-ink-muted)]">{ui.accounts}</p>
            <p className="tabular-nums mt-1 text-xl font-bold tracking-tight text-[var(--color-ink)]">
              {number.format(accounts.length)}
            </p>
          </SpotlightCard>
        </div>
      )}

      {/* 玻璃筛选与搜索工具条 */}
      <SpotlightCard className="p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <TabBar
              variant="pill"
              value={type}
              onValueChange={value => reset(() => setType(value))}
              aria-label={ui.conversations}
              items={[
                { value: 'all', label: ui.tabAll, count: counts.all },
                { value: 'group', label: ui.chatGroup, count: counts.group },
                { value: 'private', label: ui.chatPrivate, count: counts.private },
              ]}
            />
            <Select
              size="sm"
              variant="filled"
              aria-label={ui.account}
              value={account}
              onValueChange={value => reset(() => setAccount(value))}
              options={[
                { value: '', label: ui.allAccounts },
                ...accounts.map(value => ({ value, label: value })),
              ]}
            />
            <Select
              size="sm"
              variant="filled"
              aria-label={ui.profileTitle}
              value={profile}
              onValueChange={value => reset(() => setProfile(value))}
              options={[
                { value: '', label: ui.allProfiles },
                ...(profiles.data ?? []).map(entry => ({ value: entry.id, label: profileName(entry.id) })),
              ]}
            />
          </div>

          <div className="relative min-w-[200px] flex-1 sm:max-w-[260px]">
            <Search
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-ink-muted)]"
            />
            <input
              type="search"
              placeholder={ui.searchConversations}
              aria-label={ui.searchConversations}
              value={query}
              onChange={event => reset(() => setQuery(event.target.value))}
              className="h-8 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] pr-3 pl-8.5 text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
            />
          </div>
        </div>
      </SpotlightCard>

      {error ? (
        <SpotlightCard className="p-6">
          <EmptyState
            tone="error"
            icon={<AlertTriangle size={22} />}
            title={ui.conversationsLoadFailed}
            description={error.message}
            action={
              <Button
                variant="primary"
                onClick={() => {
                  void chats.refetch();
                  void assignments.refetch();
                  void records.refetch();
                }}
              >
                {ui.retry}
              </Button>
            }
          />
        </SpotlightCard>
      ) : loading ? (
        <SpotlightCard className="p-5">
          <LoadingRows rows={6} height={40} />
        </SpotlightCard>
      ) : filtered.length === 0 ? (
        <SpotlightCard className="p-8">
          <EmptyState
            icon={<MessagesSquare size={22} />}
            title={rows.length ? ui.noMatchingConversations : ui.noConversationsYet}
            description={rows.length ? undefined : ui.noConversationsHint}
            action={
              rows.length === 0 ? (
                <Button variant="soft" onClick={() => navigate('/accounts')}>
                  {ui.accounts}
                </Button>
              ) : undefined
            }
          />
        </SpotlightCard>
      ) : (
        <>
          {/* 桌面端玻璃数据表 */}
          <SpotlightCard className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-line)] text-left text-xs font-medium text-[var(--color-ink-muted)]">
                    <th className="px-5 py-3">{ui.conversations}</th>
                    <th className="px-4 py-3">{ui.account}</th>
                    <th className="px-4 py-3">{ui.profileTitle}</th>
                    <th className="px-4 py-3 text-right">{ui.conversationEntries}</th>
                    <th className="px-4 py-3">{ui.conversationUpdatedAt}</th>
                    <th className="w-14 px-4 py-3 text-right" aria-label={ui.actions} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-line)]/70">
                  {visible.map(row => (
                    <tr key={row.key} className="transition-colors hover:bg-[var(--color-surface-2)]/55">
                      <td className="px-5 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={cn(
                              'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                              row.type === 'private'
                                ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                                : 'bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]',
                            )}
                          >
                            {row.type === 'private' ? (
                              <User size={15} aria-hidden="true" />
                            ) : (
                              <Users size={15} aria-hidden="true" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="max-w-[36ch] truncate font-medium text-[var(--color-ink)]">
                                {row.title}
                              </span>
                              {typeLabel(row) && (
                                <span className="shrink-0 rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-ink-muted)]">
                                  {typeLabel(row)}
                                </span>
                              )}
                            </div>
                            <p className="max-w-[40ch] truncate font-mono text-[11px] text-[var(--color-ink-muted)]">
                              {row.key}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="rounded-md bg-[var(--color-surface-2)] px-2 py-0.5 font-mono text-xs text-[var(--color-ink-muted)]">
                          {row.instance || '—'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{renderProfileBadge(row.profile)}</td>
                      <td className="tabular-nums whitespace-nowrap px-4 py-3 text-right font-medium text-[var(--color-ink)]">
                        {ui.entriesCount.replace('{count}', number.format(row.entries))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--color-ink-muted)]">
                        {relative(row.active, locale) || '—'}
                      </td>
                      <td className="px-4 py-3 text-right">{renderRowMenu(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SpotlightCard>

          {/* 移动端响应式卡片视图 */}
          <div className="space-y-2.5 md:hidden">
            {visible.map(row => (
              <SpotlightCard key={row.key} className="p-4">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span
                      className={cn(
                        'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                        row.type === 'private'
                          ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                          : 'bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]',
                      )}
                    >
                      {row.type === 'private' ? (
                        <User size={15} aria-hidden="true" />
                      ) : (
                        <Users size={15} aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--color-ink)]">{row.title}</p>
                      <p className="truncate font-mono text-[11px] text-[var(--color-ink-muted)]">{row.instance}</p>
                    </div>
                  </div>
                  {renderRowMenu(row)}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-line)]/70 pt-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {renderProfileBadge(row.profile)}
                    {typeLabel(row) && (
                      <span className="rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--color-ink-muted)]">
                        {typeLabel(row)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[var(--color-ink-muted)]">
                    <span className="tabular-nums inline-flex items-center gap-1">
                      <MessageSquare size={12} aria-hidden="true" />
                      {ui.entriesCount.replace('{count}', number.format(row.entries))}
                    </span>
                    {row.active && (
                      <span className="inline-flex items-center gap-1">
                        <Clock size={12} aria-hidden="true" />
                        {relative(row.active, locale)}
                      </span>
                    )}
                  </div>
                </div>
              </SpotlightCard>
            ))}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-[var(--color-ink-muted)]">
            <span className="tabular-nums">
              {ui.paginationSummary
                .replace('{from}', String((current - 1) * PAGE_SIZE + 1))
                .replace('{to}', String(Math.min(current * PAGE_SIZE, filtered.length)))
                .replace('{total}', String(filtered.length))}
            </span>
            <Pagination page={current} total={filtered.length} size={PAGE_SIZE} onChange={setPage} />
          </footer>
        </>
      )}

      {clearing && (
        <ConfirmDialog
          open
          tone="danger"
          pending={busy}
          title={ui.clearConversationTitle}
          confirmLabel={ui.clearConversation}
          onOpenChange={open => {
            if (!open && !busy) setClearing(null);
          }}
          onConfirm={() => void clear()}
        >
          <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">
            {ui.clearConversationDesc
              .replace('{name}', clearing.title)
              .replace('{count}', number.format(clearing.entries))}
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
