import { useState, type JSX } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { listChats, type Chat } from '../../api/conversations';
import { getCoreDenies, setCoreDenies } from '../../api/policies';
import { getSessionAccess, putSessionAccess, type SessionAccess } from '../../api/profiles';
import { useUI } from '../../i18n/UI';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Dialog } from '../../ui/Dialog';
import { Skeleton } from '../../ui/EmptyState';
import { SelectionTools, toggle } from '../../ui/SelectionTools';
import { TabBar } from '../../ui/Tabs';
import { toast } from '../../ui/toast';
import styles from './SessionAccess.module.css';

type Entry = SessionAccess['sessions'][number];
const keyOf = (entry: Entry) => `${entry.instance}\u0000${entry.session}`;

/**
 * 配置文件的会话访问：缺省全部允许；白名单只让列出的会话使用机器人，黑名单拒绝列出的会话。
 * 旧的全局禁止会话对所有配置文件生效，在这里一并列出以便移除。
 */
export function SessionAccessCard({ profileID }: { profileID: string }): JSX.Element {
  const ui = useUI();
  const client = useQueryClient();
  const access = useQuery({ queryKey: ['session-access', profileID], queryFn: () => getSessionAccess(profileID) });
  const chats = useQuery({ queryKey: ['chats'], queryFn: listChats });
  const denies = useQuery({ queryKey: ['core-denies'], queryFn: getCoreDenies });
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  const save = async (next: SessionAccess) => {
    setBusy(true);
    try { await putSessionAccess(profileID, next); client.setQueryData(['session-access', profileID], next); toast.success(ui.saveSuccess); }
    catch (error) { toast.error(error); }
    finally { setBusy(false); }
  };
  const removeGlobal = async (chat: string) => {
    setBusy(true);
    try { const current = await getCoreDenies(); await setCoreDenies({ users: current.users, chats: current.chats.filter(value => value !== chat) }); }
    catch (error) { toast.error(error); }
    finally { setBusy(false); void client.invalidateQueries({ queryKey: ['core-denies'] }); }
  };
  const title = (entry: Entry) => chats.data?.find(chat => chat.session === entry.session && chat.instance_id === entry.instance)?.title || entry.session;

  if (!access.data) return <section className={styles.card}><Skeleton height={96} /></section>;
  const value = access.data;
  return <section className={styles.card}>
    <header className={styles.head}>
      <div>
        <h3>{ui.sessionAccess}</h3>
        <p>{value.mode === 'all' ? ui.sessionAccessAllHint : value.mode === 'allow' ? ui.sessionAccessAllowHint : ui.sessionAccessDenyHint}</p>
      </div>
      <TabBar variant="pill" aria-label={ui.sessionAccess} value={value.mode} onValueChange={mode => void save({ ...value, mode: mode as SessionAccess['mode'] })}
        items={[{ value: 'all', label: ui.sessionAccessAll }, { value: 'allow', label: ui.sessionAccessAllow }, { value: 'deny', label: ui.sessionAccessDeny }]} />
    </header>
    {value.mode !== 'all' && <div className={styles.list}>
      {value.sessions.map(entry => <div key={keyOf(entry)} className={styles.row}>
        <span className={styles.name}>{title(entry)}</span>
        <span className={styles.meta}>{entry.instance}</span>
        <Button variant="ghost" size="sm" iconOnly aria-label={`${ui.removeRow} ${title(entry)}`} disabled={busy}
          onClick={() => void save({ ...value, sessions: value.sessions.filter(item => keyOf(item) !== keyOf(entry)) })}><X size={15} /></Button>
      </div>)}
      {value.sessions.length === 0 && <p className={styles.empty}>{value.mode === 'allow' ? ui.sessionAccessEmptyAllow : ui.sessionAccessEmptyDeny}</p>}
      <Button size="sm" variant="soft" icon={<Plus size={14} />} disabled={busy} onClick={() => setPicking(true)}>{ui.addSessions}</Button>
    </div>}
    {(denies.data?.chats.length ?? 0) > 0 && <div className={styles.global}>
      <strong>{ui.globalDeniedChats}</strong>
      <div className={styles.chips}>{denies.data!.chats.map(chat => <span key={chat} className={styles.chip}><code>{chat}</code>
        <button type="button" aria-label={`${ui.removeRow} ${chat}`} disabled={busy} onClick={() => void removeGlobal(chat)}><X size={13} /></button></span>)}</div>
    </div>}
    {picking && <PickSessions chats={chats.data ?? []} existing={value.sessions} onClose={() => setPicking(false)}
      onAdd={added => save({ ...value, sessions: [...value.sessions, ...added] }).then(() => setPicking(false))} />}
  </section>;
}

/** 从聊天目录多选会话；已在列表中的不再列出。 */
function PickSessions({ chats, existing, onClose, onAdd }: { chats: readonly Chat[]; existing: readonly Entry[]; onClose: () => void; onAdd: (entries: Entry[]) => Promise<void> }): JSX.Element {
  const ui = useUI();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);
  const taken = new Set(existing.map(keyOf));
  const candidates = chats.map(chat => ({ instance: chat.instance_id, session: chat.session, chat })).filter(entry => !taken.has(keyOf(entry)));
  const shown = candidates.filter(entry => `${entry.chat.title} ${entry.session} ${entry.instance}`.toLowerCase().includes(query.trim().toLowerCase()));
  const submit = async () => {
    setPending(true);
    try { await onAdd(candidates.filter(entry => picked.has(keyOf(entry))).map(({ instance, session }) => ({ instance, session }))); }
    finally { setPending(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }} title={ui.addSessions} size="md"
    footer={<>
      <span className={styles.count}>{ui.selectedItems.replace('{count}', String(picked.size))}</span>
      <Button onClick={onClose} disabled={pending}>{ui.cancel}</Button>
      <Button variant="primary" loading={pending} disabled={picked.size === 0} onClick={() => void submit()}>{ui.add}</Button>
    </>}>
    <div className={styles.pickBar}>
      <input placeholder={ui.searchConversations} aria-label={ui.searchConversations} value={query} onChange={event => setQuery(event.target.value)} />
      <SelectionTools keys={shown.map(keyOf)} selected={picked} onChange={setPicked} />
    </div>
    <div className={styles.picks}>
      {shown.map(entry => <label key={keyOf(entry)} className={styles.pick}>
        <Checkbox aria-label={entry.chat.title || entry.session} checked={picked.has(keyOf(entry))} onCheckedChange={on => setPicked(toggle(picked, keyOf(entry), on))} />
        <span className={styles.name}>{entry.chat.title || entry.session}</span>
        <span className={styles.meta}>{entry.chat.chat_type === 'private' ? ui.chatPrivate : ui.chatGroup} · {entry.instance}</span>
      </label>)}
      {shown.length === 0 && <p className={styles.empty}>{chats.length === 0 ? ui.noConversationsHint : ui.noMatchingConversations}</p>}
    </div>
  </Dialog>;
}
