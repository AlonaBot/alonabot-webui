import { useEffect, useState, type JSX } from 'react';
import { Select } from '../ui/Select';
import { toast } from '../ui/toast';
import { Skeleton } from '../ui/EmptyState';
import { Switch } from '../ui/Switch';
import { Plus, X } from 'lucide-react';
import { listChats, type Chat } from '../api/conversations';
import { listInstances, type AdapterInstance } from '../api/instances';
import { assignInstanceProfile, assignSessionProfile, getProfileAssignments, listProfiles, type Profile, type ProfileAssignments } from '../api/profiles';
import { useUI } from '../i18n/UI';
import { chatProfile } from './accountState';
import { Dialog as SharedDialog } from '../ui/Dialog';

export function ProfileAssignmentsDialog({ profile, open, onOpenChange, onChanged }: {
  profile: Profile; open: boolean; onOpenChange: (open: boolean) => void; onChanged: () => void;
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
  async function load() {
    const [insts, assigned, directory, allProfiles] = await Promise.all([listInstances(), getProfileAssignments(), listChats(), listProfiles()]);
    setInstances(insts); setAssignments(assigned); setChats(directory); setProfiles(allProfiles);
  }
  useEffect(() => {
    if (!open) return;
    setAssignments(null); setAdding(false); setQuery(''); setInstance(''); setSession('');
    void load().catch(error => toast.error(error));
  }, [open, profile.id]);
  async function mutate(action: () => Promise<void>) {
    setBusy(true);     const errors: string[] = [];
    try { await action(); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    try { await load(); onChanged(); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    if (errors.length) toast.error(errors.join('\n')); setBusy(false);
  }
  const matches = (text: string) => text.toLowerCase().includes(query.toLowerCase());
  const dedicated = assignments?.sessions.filter(item => item.profile === profile.id && matches(item.instance + item.session)) ?? [];
  const inherited = assignments ? chats.filter(chat => chatProfile(assignments, chat.instance_id, chat.session) === profile.id && !assignments.sessions.some(item => item.instance === chat.instance_id && item.session === chat.session) && matches(chat.instance_id + chat.session + chat.title)) : [];
  return <SharedDialog open={open} onOpenChange={onOpenChange} title={<>{ui.scopeDialogTitle.replace('{name}', profile.name)}</>}>
      
      {!assignments ? <Skeleton height={120} /> : <fieldset className="config-edit-fields profile-scope-body" disabled={busy}>
        <input aria-label={ui.searchScope} placeholder={ui.searchScope} value={query} onChange={event => setQuery(event.target.value)} />
        <section className="profile-scope-section"><h3 className="profile-scope-section-title">{ui.accountDefault}</h3><div className="profile-card">
          {instances.filter(inst => matches(inst.instance_id)).map(inst => {
            const assigned = assignments.instances[inst.instance_id];
            return <div key={inst.instance_id} className="profile-card-row"><div className="profile-instance-meta"><span>{inst.instance_id}</span><small>{ui.accountDefaultDesc.replace('{count}', String(chats.filter(chat => chat.instance_id === inst.instance_id).length)).replace('{profile}', profiles.find(p => p.id === (assigned ?? 'default'))?.name ?? assigned)}</small></div>
              <Switch aria-label={inst.instance_id} checked={assigned === profile.id} onCheckedChange={checked => void mutate(() => assignInstanceProfile(inst.instance_id, checked ? profile.id : null))} /></div>;
          })}
          {instances.length === 0 && <p className="profile-scope-empty">{ui.noEntries}</p>}
        </div></section>
        <section className="profile-scope-section"><div className="profile-scope-section-header"><h3 className="profile-scope-section-title">{ui.dedicatedSessions}</h3><button type="button" className="profile-add-session-btn" onClick={() => setAdding(!adding)}><Plus size={14} />{ui.addSession}</button></div>
          {adding && <form className="profile-manual-session" onSubmit={event => { event.preventDefault(); void mutate(async () => { await assignSessionProfile({ instance, session, profile: profile.id }); setAdding(false); }); }}>
            <label>{ui.accounts}<Select variant="filled" aria-label={ui.accounts} placeholder={ui.accounts} value={instance} onValueChange={value => { setInstance(value); setSession(''); }} options={instances.map(inst => ({ value: inst.instance_id, label: inst.instance_id }))} /></label>
            <label>{ui.manualSession}<input required list="profile-session-directory" value={session} onChange={event => setSession(event.target.value)} /></label>
            <datalist id="profile-session-directory">{chats.filter(chat => chat.instance_id === instance).map(chat => <option key={chat.session} value={chat.session}>{chat.title}</option>)}</datalist>
            <button type="submit">{ui.addSession}</button>
          </form>}
          <div className="profile-card">{dedicated.map(item => <div className="profile-card-row" key={JSON.stringify([item.instance, item.session])}><div className="profile-session-info"><span>{chats.find(chat => chat.instance_id === item.instance && chat.session === item.session)?.title || item.session}</span><small>{item.instance} · {item.session}</small></div><button type="button" aria-label={`${ui.removeRow} ${item.session}`} onClick={() => void mutate(() => assignSessionProfile({ instance: item.instance, session: item.session, profile: null }))}><X size={16} /></button></div>)}{dedicated.length === 0 && <p className="profile-scope-empty">{ui.noDedicatedSessions}</p>}</div>
        </section>
        <section className="profile-scope-section"><h3 className="profile-scope-section-title">{ui.inheritedSessions}</h3><div className="profile-card">{inherited.map(chat => <div className="profile-card-row" key={JSON.stringify([chat.instance_id, chat.session])}><div className="profile-session-info"><span>{chat.title || chat.session}</span><small>{chat.instance_id} · {chat.session}</small></div></div>)}{inherited.length === 0 && <p className="profile-scope-empty">{ui.noEntries}</p>}</div></section>
      </fieldset>}
      <div className="dialog-actions"><button type="button" onClick={() => onOpenChange(false)}>{ui.done}</button></div></SharedDialog>;
}
