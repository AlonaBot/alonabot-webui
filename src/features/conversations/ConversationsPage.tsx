import { useMemo, useState, type JSX } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Filter, MessagesSquare, MoreHorizontal, Trash2 } from 'lucide-react';
import { clearPluginConversation, listChats, listPluginConversations, type Chat } from '../../api/conversations';
import { getProfileAssignments, listProfiles } from '../../api/profiles';
import { useUI } from '../../i18n/UI';
import { useUISettings } from '../../shell/settings';
import { installed, usePackages } from '../../queries/packages';
import { PageHeader } from '../../shell/PageHeader';
import { conversationAssignment } from '../../pages/conversationState';
import { Button } from '../../ui/Button';
import { ConfirmDialog } from '../../ui/Dialog';
import { EmptyState, LoadingRows } from '../../ui/EmptyState';
import { Menu, MenuItem } from '../../ui/Menu';
import { Pagination } from '../../ui/Pagination';
import { Select } from '../../ui/Select';
import { TabBar } from '../../ui/Tabs';
import { toast } from '../../ui/toast';
import styles from './Conversations.module.css';

const pageSize = 50;
type Row = { key: string; title: string; type?: Chat['chat_type']; instance: string; profile: string; entries: number; records: string[]; active: string };

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
  const records = useQuery({ queryKey: ['conversations', agent?.ID], queryFn: () => listPluginConversations(agent!.ID), enabled: !!agent });
  const [type, setType] = useState('all');
  const [account, setAccount] = useState('');
  const [profile, setProfile] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [clearing, setClearing] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const profileName = (id: string) => id === 'default' ? ui.defaultProfile : profiles.data?.find(entry => entry.id === id)?.name ?? id;
  const rows = useMemo<Row[]>(() => {
    if (!chats.data || !assignments.data) return [];
    const entries = records.data ?? [];
    const claimed = new Set<string>();
    const result: Row[] = chats.data.map(chat => {
      const key = `${chat.session}@${chat.instance_id}`;
      // 群成员各自独立对话时，记录键在会话键后再带一段 @成员。
      const own = entries.filter(entry => entry.key === key || entry.key.startsWith(`${key}@`));
      own.forEach(entry => claimed.add(entry.key));
      const latest = [chat.last_active_at, ...own.map(entry => entry.updated_at)].sort().at(-1) ?? '';
      return { key, title: chat.title || chat.session, type: chat.chat_type, instance: chat.instance_id, profile: conversationAssignment(key, assignments.data)?.profile ?? 'default',
        entries: own.reduce((sum, entry) => sum + entry.entries, 0), records: own.map(entry => entry.key), active: latest };
    });
    for (const entry of entries) if (!claimed.has(entry.key)) {
      const instance = entry.key.split('@')[1] ?? '';
      result.push({ key: entry.key, title: entry.key, instance, profile: conversationAssignment(entry.key, assignments.data)?.profile ?? 'default', entries: entry.entries, records: [entry.key], active: entry.updated_at });
    }
    return result.sort((a, b) => b.active.localeCompare(a.active));
  }, [chats.data, assignments.data, records.data]);

  const scoped = rows.filter(row => (!account || row.instance === account) && (!profile || row.profile === profile)
    && (!query.trim() || `${row.title} ${row.key}`.toLowerCase().includes(query.trim().toLowerCase())));
  const counts = { all: scoped.length, group: scoped.filter(row => row.type === 'group' || row.type === 'channel').length, private: scoped.filter(row => row.type === 'private').length };
  const filtered = type === 'all' ? scoped : scoped.filter(row => type === 'group' ? row.type === 'group' || row.type === 'channel' : row.type === 'private');
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);
  const accounts = [...new Set(rows.map(row => row.instance).filter(Boolean))].sort();
  const typeLabel = (row: Row) => row.type === 'private' ? ui.chatPrivate : row.type ? ui.chatGroup : '';
  const number = new Intl.NumberFormat(locale);
  const reset = (apply: () => void) => { apply(); setPage(1); };

  const clear = async () => {
    if (!clearing || !agent) return;
    setBusy(true);
    try {
      for (const key of clearing.records) await clearPluginConversation(agent.ID, key);
      toast.success(ui.conversationCleared);
      setClearing(null);
    } catch (error) { toast.error(error); }
    finally { setBusy(false); void client.invalidateQueries({ queryKey: ['conversations', agent.ID] }); }
  };

  const error = chats.error ?? assignments.error ?? records.error;
  const loading = chats.isPending || assignments.isPending || packages.isPending || (!!agent && records.isPending);

  return <>
    <PageHeader
      left={<>
        <TabBar variant="pill" value={type} onValueChange={value => reset(() => setType(value))} aria-label={ui.conversations}
          items={[{ value: 'all', label: ui.tabAll, count: counts.all }, { value: 'group', label: ui.chatGroup, count: counts.group }, { value: 'private', label: ui.chatPrivate, count: counts.private }]} />
        <Select variant="pill" aria-label={ui.account} value={account} onValueChange={value => reset(() => setAccount(value))}
          options={[{ value: '', label: ui.allAccounts }, ...accounts.map(value => ({ value, label: value }))]} />
        <Select variant="pill" aria-label={ui.profileTitle} value={profile} onValueChange={value => reset(() => setProfile(value))}
          options={[{ value: '', label: ui.allProfiles }, ...(profiles.data ?? []).map(entry => ({ value: entry.id, label: profileName(entry.id) }))]} />
      </>}
      right={<label className={styles.search}>
        <Filter size={16} aria-hidden />
        <input type="search" placeholder={ui.searchConversations} aria-label={ui.searchConversations} value={query} onChange={event => reset(() => setQuery(event.target.value))} />
      </label>} />

    {error ? <EmptyState tone="error" icon={<AlertTriangle size={22} />} title={ui.conversationsLoadFailed} description={error.message}
      action={<Button variant="primary" onClick={() => { void chats.refetch(); void assignments.refetch(); void records.refetch(); }}>{ui.retry}</Button>} />
      : loading ? <div className={styles.card}><LoadingRows rows={6} height={40} /></div>
      : filtered.length === 0 ? <EmptyState icon={<MessagesSquare size={22} />} title={rows.length ? ui.noMatchingConversations : ui.noConversationsYet}
        description={rows.length ? undefined : ui.noConversationsHint} />
      : <>
        <div className={styles.card}>
          <table className={styles.table}>
            <thead><tr><th>{ui.conversations}</th><th>{ui.account}</th><th>{ui.profileTitle}</th><th className={styles.num}>{ui.conversationEntries}</th><th>{ui.conversationUpdatedAt}</th><th aria-label={ui.actions} /></tr></thead>
            <tbody>{visible.map(row => <tr key={row.key}>
              <td><div className={styles.title}><span>{row.title}</span>{typeLabel(row) && <small>{typeLabel(row)}</small>}</div></td>
              <td className={styles.muted}>{row.instance}</td>
              <td><span className={styles.profile} data-default={row.profile === 'default' || undefined}>{profileName(row.profile)}</span></td>
              <td className={styles.num}>{ui.entriesCount.replace('{count}', number.format(row.entries))}</td>
              <td className={styles.muted}>{relative(row.active, locale)}</td>
              <td className={styles.actions}>
                <Menu align="end" trigger={<Button variant="ghost" size="sm" iconOnly aria-label={`${ui.actions} ${row.title}`}><MoreHorizontal size={18} /></Button>}>
                  <MenuItem icon={<Trash2 size={16} />} tone="danger" disabled={!agent || row.entries === 0} onSelect={() => setClearing(row)}>{ui.clearConversation}</MenuItem>
                </Menu>
              </td>
            </tr>)}</tbody>
          </table>
        </div>
        <footer className={styles.footer}>
          <span>{ui.paginationSummary.replace('{from}', String((current - 1) * pageSize + 1)).replace('{to}', String(Math.min(current * pageSize, filtered.length))).replace('{total}', String(filtered.length))}</span>
          <Pagination page={current} total={filtered.length} size={pageSize} onChange={setPage} />
        </footer>
      </>}

    {clearing && <ConfirmDialog open tone="danger" pending={busy} title={ui.clearConversationTitle} confirmLabel={ui.clearConversation}
      onOpenChange={open => { if (!open && !busy) setClearing(null); }} onConfirm={() => void clear()}>
      <p className={styles.confirm}>{ui.clearConversationDesc.replace('{name}', clearing.title).replace('{count}', number.format(clearing.entries))}</p>
    </ConfirmDialog>}
  </>;
}
