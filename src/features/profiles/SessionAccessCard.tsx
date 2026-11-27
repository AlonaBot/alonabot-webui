import { useState, type JSX } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Shield, X } from 'lucide-react';
import { listChats, type Chat } from '../../api/conversations';
import { getCoreDenies, setCoreDenies } from '../../api/policies';
import { getSessionAccess, putSessionAccess, type SessionAccess } from '../../api/profiles';
import { useUI } from '../../i18n/UI';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Dialog } from '../../ui/Dialog';
import { Skeleton } from '../../ui/EmptyState';
import { SelectionTools, toggle } from '../../ui/SelectionTools';
import { SpotlightCard } from '../../ui/SpotlightCard';
import { TabBar } from '../../ui/Tabs';
import { toast } from '../../ui/toast';

type Entry = SessionAccess['sessions'][number];
const keyOf = (entry: Entry): string => `${entry.instance}\u0000${entry.session}`;

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

  const save = async (next: SessionAccess): Promise<void> => {
    setBusy(true);
    try {
      await putSessionAccess(profileID, next);
      client.setQueryData(['session-access', profileID], next);
      toast.success(ui.saveSuccess);
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  };

  const removeGlobal = async (chat: string): Promise<void> => {
    setBusy(true);
    try {
      const current = await getCoreDenies();
      await setCoreDenies({ users: current.users, chats: current.chats.filter(value => value !== chat) });
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
      void client.invalidateQueries({ queryKey: ['core-denies'] });
    }
  };

  const title = (entry: Entry): string =>
    chats.data?.find(chat => chat.session === entry.session && chat.instance_id === entry.instance)?.title ||
    entry.session;

  if (!access.data) {
    return (
      <SpotlightCard className="p-5">
        <Skeleton height={96} />
      </SpotlightCard>
    );
  }

  const value = access.data;
  const globalChats = denies.data?.chats ?? [];

  return (
    <SpotlightCard className="p-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2.5">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <Shield size={16} aria-hidden="true" />
          </span>
          <div className="space-y-0.5">
            <h3 className="text-base font-semibold text-[var(--color-ink)]">{ui.sessionAccess}</h3>
            <p className="text-xs leading-relaxed text-[var(--color-ink-muted)]">
              {value.mode === 'all'
                ? ui.sessionAccessAllHint
                : value.mode === 'allow'
                  ? ui.sessionAccessAllowHint
                  : ui.sessionAccessDenyHint}
            </p>
          </div>
        </div>
        <TabBar
          variant="pill"
          aria-label={ui.sessionAccess}
          value={value.mode}
          onValueChange={mode => void save({ ...value, mode: mode as SessionAccess['mode'] })}
          items={[
            { value: 'all', label: ui.sessionAccessAll },
            { value: 'allow', label: ui.sessionAccessAllow },
            { value: 'deny', label: ui.sessionAccessDeny },
          ]}
        />
      </header>

      {value.mode !== 'all' && (
        <div className="mt-4 space-y-2.5">
          {value.sessions.length > 0 ? (
            <div className="space-y-1.5">
              {value.sessions.map(entry => (
                <div
                  key={keyOf(entry)}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl border border-[var(--color-line)]/70 bg-[var(--color-surface-2)]/70 px-3 py-2"
                >
                  <span className="truncate text-sm font-medium text-[var(--color-ink)]">{title(entry)}</span>
                  <span className="font-mono text-xs text-[var(--color-ink-muted)]">{entry.instance}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    aria-label={`${ui.removeRow} ${title(entry)}`}
                    disabled={busy}
                    onClick={() =>
                      void save({ ...value, sessions: value.sessions.filter(item => keyOf(item) !== keyOf(entry)) })
                    }
                  >
                    <X size={15} />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-[var(--color-line)] px-4 py-4 text-center text-xs text-[var(--color-ink-muted)]">
              {value.mode === 'allow' ? ui.sessionAccessEmptyAllow : ui.sessionAccessEmptyDeny}
            </p>
          )}
          <Button size="sm" variant="soft" icon={<Plus size={14} />} disabled={busy} onClick={() => setPicking(true)}>
            {ui.addSessions}
          </Button>
        </div>
      )}

      {globalChats.length > 0 && (
        <div className="mt-4 border-t border-[var(--color-line)]/70 pt-3.5 text-xs">
          <strong className="font-semibold text-[var(--color-ink)]">{ui.globalDeniedChats}</strong>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {globalChats.map(chat => (
              <span
                key={chat}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] py-1 pr-1 pl-2.5 font-mono text-xs text-[var(--color-ink)]"
              >
                <code>{chat}</code>
                <button
                  type="button"
                  aria-label={`${ui.removeRow} ${chat}`}
                  disabled={busy}
                  onClick={() => void removeGlobal(chat)}
                  className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--color-ink-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-danger)_15%,transparent)] hover:text-[var(--color-danger)]"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {picking && (
        <PickSessions
          chats={chats.data ?? []}
          existing={value.sessions}
          onClose={() => setPicking(false)}
          onAdd={added => save({ ...value, sessions: [...value.sessions, ...added] }).then(() => setPicking(false))}
        />
      )}
    </SpotlightCard>
  );
}

/** 从聊天目录多选会话；已在列表中的不再列出。 */
function PickSessions({
  chats,
  existing,
  onClose,
  onAdd,
}: {
  chats: readonly Chat[];
  existing: readonly Entry[];
  onClose: () => void;
  onAdd: (entries: Entry[]) => Promise<void>;
}): JSX.Element {
  const ui = useUI();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);

  const taken = new Set(existing.map(keyOf));
  const candidates = chats
    .map(chat => ({ instance: chat.instance_id, session: chat.session, chat }))
    .filter(entry => !taken.has(keyOf(entry)));
  const shown = candidates.filter(entry =>
    `${entry.chat.title} ${entry.session} ${entry.instance}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const submit = async (): Promise<void> => {
    setPending(true);
    try {
      await onAdd(
        candidates
          .filter(entry => picked.has(keyOf(entry)))
          .map(({ instance, session }) => ({ instance, session })),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !pending) onClose();
      }}
      title={ui.addSessions}
      size="md"
      footer={
        <>
          <span className="mr-auto text-xs font-medium text-[var(--color-ink-muted)]">
            {ui.selectedItems.replace('{count}', String(picked.size))}
          </span>
          <Button onClick={onClose} disabled={pending}>
            {ui.cancel}
          </Button>
          <Button variant="primary" loading={pending} disabled={picked.size === 0} onClick={() => void submit()}>
            {ui.add}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[180px] flex-1">
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
              onChange={event => setQuery(event.target.value)}
              className="h-9 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] pr-3 pl-8.5 text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
            />
          </div>
          <SelectionTools keys={shown.map(keyOf)} selected={picked} onChange={setPicked} />
        </div>

        <div className="max-h-[min(420px,50vh)] space-y-1 overflow-y-auto pr-1">
          {shown.map(entry => (
            <label
              key={keyOf(entry)}
              className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--color-surface-2)]"
            >
              <Checkbox
                aria-label={entry.chat.title || entry.session}
                checked={picked.has(keyOf(entry))}
                onCheckedChange={on => setPicked(toggle(picked, keyOf(entry), on))}
              />
              <span className="truncate text-sm text-[var(--color-ink)]">{entry.chat.title || entry.session}</span>
              <span className="whitespace-nowrap font-mono text-xs text-[var(--color-ink-muted)]">
                {entry.chat.chat_type === 'private' ? ui.chatPrivate : ui.chatGroup} · {entry.instance}
              </span>
            </label>
          ))}
          {shown.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">
              {chats.length === 0 ? ui.noConversationsHint : ui.noMatchingConversations}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
