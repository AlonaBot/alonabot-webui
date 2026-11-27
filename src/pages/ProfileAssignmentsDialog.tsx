import { useEffect, useState, type JSX } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { listChats, type Chat } from '../api/conversations';
import { listInstances, type AdapterInstance } from '../api/instances';
import {
  assignInstanceProfile,
  assignSessionProfile,
  getProfileAssignments,
  listProfiles,
  type Profile,
  type ProfileAssignments,
} from '../api/profiles';
import { useUI } from '../i18n/UI';
import { Button } from '../ui/Button';
import { Dialog as SharedDialog } from '../ui/Dialog';
import { Skeleton } from '../ui/EmptyState';
import { Select } from '../ui/Select';
import { Switch } from '../ui/Switch';
import { toast } from '../ui/toast';
import { chatProfile } from './accountState';

export function ProfileAssignmentsDialog({
  profile,
  open,
  onOpenChange,
  onChanged,
}: {
  profile: Profile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}): JSX.Element {
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  const [instances, setInstances] = useState<AdapterInstance[]>([]);
  const [assignments, setAssignments] = useState<ProfileAssignments | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [instance, setInstance] = useState('');
  const [session, setSession] = useState('');

  async function load(): Promise<void> {
    const [insts, assigned, directory, allProfiles] = await Promise.all([
      listInstances(),
      getProfileAssignments(),
      listChats(),
      listProfiles(),
    ]);
    setInstances(insts);
    setAssignments(assigned);
    setChats(directory);
    setProfiles(allProfiles);
  }

  useEffect(() => {
    if (!open) return;
    setAssignments(null);
    setAdding(false);
    setQuery('');
    setInstance('');
    setSession('');
    void load().catch(error => toast.error(error));
  }, [open, profile.id]);

  async function mutate(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    const errors: string[] = [];
    try {
      await action();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    try {
      await load();
      onChanged();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    if (errors.length) toast.error(errors.join('\n'));
    setBusy(false);
  }

  const matches = (text: string): boolean => text.toLowerCase().includes(query.trim().toLowerCase());
  const dedicated =
    assignments?.sessions.filter(item => item.profile === profile.id && matches(item.instance + item.session)) ?? [];
  const inherited = assignments
    ? chats.filter(
        chat =>
          chatProfile(assignments, chat.instance_id, chat.session) === profile.id &&
          !assignments.sessions.some(item => item.instance === chat.instance_id && item.session === chat.session) &&
          matches(chat.instance_id + chat.session + chat.title),
      )
    : [];

  return (
    <SharedDialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={ui.scopeDialogTitle.replace('{name}', profile.name)}
      footer={
        <Button variant="primary" onClick={() => onOpenChange(false)}>
          {ui.done}
        </Button>
      }
    >
      {!assignments ? (
        <Skeleton height={160} />
      ) : (
        <fieldset disabled={busy} className="m-0 space-y-5 border-0 p-0">
          <div className="relative">
            <Search
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-ink-muted)]"
            />
            <input
              type="search"
              aria-label={ui.searchScope}
              placeholder={ui.searchScope}
              value={query}
              onChange={event => setQuery(event.target.value)}
              className="h-9 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] pr-3 pl-8.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
            />
          </div>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">
              {ui.accountDefault}
            </h3>
            <div className="divide-y divide-[var(--color-line)]/70 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)]/50 px-3">
              {instances
                .filter(inst => matches(inst.instance_id))
                .map(inst => {
                  const assigned = assignments.instances[inst.instance_id];
                  const assignedName =
                    profiles.find(p => p.id === (assigned ?? 'default'))?.name ?? assigned ?? ui.defaultProfile;
                  return (
                    <div key={inst.instance_id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm font-medium text-[var(--color-ink)]">
                          {inst.instance_id}
                        </p>
                        <p className="text-xs text-[var(--color-ink-muted)]">
                          {ui.accountDefaultDesc
                            .replace('{count}', String(chats.filter(chat => chat.instance_id === inst.instance_id).length))
                            .replace('{profile}', assignedName)}
                        </p>
                      </div>
                      <Switch
                        aria-label={inst.instance_id}
                        checked={assigned === profile.id}
                        onCheckedChange={checked =>
                          void mutate(() => assignInstanceProfile(inst.instance_id, checked ? profile.id : null))
                        }
                      />
                    </div>
                  );
                })}
              {instances.length === 0 && (
                <p className="py-5 text-center text-xs text-[var(--color-ink-muted)]">{ui.noEntries}</p>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">
                {ui.dedicatedSessions}
              </h3>
              <Button size="sm" variant="soft" icon={<Plus size={13} />} onClick={() => setAdding(!adding)}>
                {ui.addSession}
              </Button>
            </div>

            {adding && (
              <form
                className="space-y-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)]/70 p-3"
                onSubmit={event => {
                  event.preventDefault();
                  void mutate(async () => {
                    await assignSessionProfile({ instance, session, profile: profile.id });
                    setAdding(false);
                  });
                }}
              >
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <label className="space-y-1 text-xs font-medium text-[var(--color-ink-muted)]">
                    <span className="block">{ui.accounts}</span>
                    <Select
                      variant="filled"
                      className="w-full"
                      aria-label={ui.accounts}
                      placeholder={ui.accounts}
                      value={instance}
                      onValueChange={value => {
                        setInstance(value);
                        setSession('');
                      }}
                      options={instances.map(inst => ({ value: inst.instance_id, label: inst.instance_id }))}
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-[var(--color-ink-muted)]">
                    <span className="block">{ui.manualSession}</span>
                    <input
                      required
                      list="profile-session-directory"
                      value={session}
                      onChange={event => setSession(event.target.value)}
                      className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 font-mono text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                    />
                  </label>
                </div>
                <datalist id="profile-session-directory">
                  {chats
                    .filter(chat => chat.instance_id === instance)
                    .map(chat => (
                      <option key={chat.session} value={chat.session}>
                        {chat.title}
                      </option>
                    ))}
                </datalist>
                <div className="flex justify-end">
                  <Button type="submit" size="sm" variant="primary" disabled={!instance || !session.trim()}>
                    {ui.addSession}
                  </Button>
                </div>
              </form>
            )}

            <div className="divide-y divide-[var(--color-line)]/70 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)]/50 px-3">
              {dedicated.map(item => (
                <div
                  key={JSON.stringify([item.instance, item.session])}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--color-ink)]">
                      {chats.find(chat => chat.instance_id === item.instance && chat.session === item.session)?.title ||
                        item.session}
                    </p>
                    <p className="truncate font-mono text-xs text-[var(--color-ink-muted)]">
                      {item.instance} · {item.session}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    aria-label={`${ui.removeRow} ${item.session}`}
                    onClick={() =>
                      void mutate(() =>
                        assignSessionProfile({ instance: item.instance, session: item.session, profile: null }),
                      )
                    }
                  >
                    <X size={15} />
                  </Button>
                </div>
              ))}
              {dedicated.length === 0 && (
                <p className="py-5 text-center text-xs text-[var(--color-ink-muted)]">{ui.noDedicatedSessions}</p>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">
              {ui.inheritedSessions}
            </h3>
            <div className="divide-y divide-[var(--color-line)]/70 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)]/50 px-3">
              {inherited.map(chat => (
                <div key={JSON.stringify([chat.instance_id, chat.session])} className="py-2.5">
                  <p className="truncate text-sm font-medium text-[var(--color-ink)]">{chat.title || chat.session}</p>
                  <p className="truncate font-mono text-xs text-[var(--color-ink-muted)]">
                    {chat.instance_id} · {chat.session}
                  </p>
                </div>
              ))}
              {inherited.length === 0 && (
                <p className="py-5 text-center text-xs text-[var(--color-ink-muted)]">{ui.noEntries}</p>
              )}
            </div>
          </section>
        </fieldset>
      )}
    </SharedDialog>
  );
}
