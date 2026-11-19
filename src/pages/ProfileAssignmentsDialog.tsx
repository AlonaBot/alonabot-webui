import { useEffect, useState, type JSX } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Plus, X } from 'lucide-react';
import {
  assignInstanceProfile, assignSessionProfile, getProfileAssignments, listChats, listInstances, listProfiles,
  type AdapterInstance, type Chat, type Profile, type ProfileAssignments,
} from '../api/admin';
import { useUI } from '../i18n/UI';
import { chatProfile } from './accountState';

export function ProfileAssignmentsDialog({ profile, open, onOpenChange, onChanged }: {
  profile: Profile; open: boolean; onOpenChange: (open: boolean) => void; onChanged: () => void;
}): JSX.Element {
  const ui = useUI();
  const [error, setError] = useState<string | null>(null);
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
    setAssignments(null); setError(null); setAdding(false); setQuery(''); setInstance(''); setSession('');
    void load().catch(error => setError(error instanceof Error ? error.message : String(error)));
  }, [open, profile.id]);
  async function mutate(action: () => Promise<void>) {
    setBusy(true); setError(null);
    const errors: string[] = [];
    try { await action(); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    try { await load(); onChanged(); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    setError(errors.length ? errors.join('\n') : null); setBusy(false);
  }
  const matches = (text: string) => text.toLowerCase().includes(query.toLowerCase());
  const dedicated = assignments?.sessions.filter(item => item.profile === profile.id && matches(item.instance + item.session)) ?? [];
  const inherited = assignments ? chats.filter(chat => chatProfile(assignments, chat.instance_id, chat.session) === profile.id && !assignments.sessions.some(item => item.instance === chat.instance_id && item.session === chat.session) && matches(chat.instance_id + chat.session + chat.title)) : [];
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" />
    <Dialog.Content className="dialog-content profile-scope-dialog" aria-describedby={undefined}>
      <div className="dialog-header"><Dialog.Title className="dialog-title">{ui.scopeDialogTitle.replace('{name}', profile.name)}</Dialog.Title><Dialog.Close asChild><button type="button" aria-label={ui.close}><X size={18} /></button></Dialog.Close></div>
      {error && <p role="alert" className="plugins-error-banner">{error}</p>}
      {!assignments ? !error && <p role="status">{ui.loading}</p> : <fieldset className="config-edit-fields profile-scope-body" disabled={busy}>
        <input aria-label={ui.searchScope} placeholder={ui.searchScope} value={query} onChange={event => setQuery(event.target.value)} />
        <section className="profile-scope-section"><h3 className="profile-scope-section-title">{ui.accountDefault}</h3><div className="profile-card">
          {instances.filter(inst => matches(inst.instance_id)).map(inst => {
            const assigned = assignments.instances[inst.instance_id];
            return <div key={inst.instance_id} className="profile-card-row"><div className="profile-instance-meta"><span>{inst.instance_id}</span><small>{ui.accountDefaultDesc.replace('{count}', String(chats.filter(chat => chat.instance_id === inst.instance_id).length)).replace('{profile}', profiles.find(p => p.id === (assigned ?? 'default'))?.name ?? assigned)}</small></div>
              <label className="plugin-switch-label"><input type="checkbox" role="switch" aria-label={inst.instance_id} checked={assigned === profile.id} onChange={event => void mutate(() => assignInstanceProfile(inst.instance_id, event.target.checked ? profile.id : null))} /><span className="plugin-switch-slider" /></label></div>;
          })}
          {instances.length === 0 && <p className="profile-scope-empty">{ui.noEntries}</p>}
        </div></section>
        <section className="profile-scope-section"><div className="profile-scope-section-header"><h3 className="profile-scope-section-title">{ui.dedicatedSessions}</h3><button type="button" className="profile-add-session-btn" onClick={() => setAdding(!adding)}><Plus size={14} />{ui.addSession}</button></div>
          {adding && <form className="profile-manual-session" onSubmit={event => { event.preventDefault(); void mutate(async () => { await assignSessionProfile({ instance, session, profile: profile.id }); setAdding(false); }); }}>
            <label>{ui.accounts}<select required value={instance} onChange={event => { setInstance(event.target.value); setSession(''); }}><option value="">{ui.accounts}</option>{instances.map(inst => <option key={inst.instance_id} value={inst.instance_id}>{inst.instance_id}</option>)}</select></label>
            <label>{ui.manualSession}<input required list="profile-session-directory" value={session} onChange={event => setSession(event.target.value)} /></label>
            <datalist id="profile-session-directory">{chats.filter(chat => chat.instance_id === instance).map(chat => <option key={chat.session} value={chat.session}>{chat.title}</option>)}</datalist>
            <button type="submit">{ui.addSession}</button>
          </form>}
          <div className="profile-card">{dedicated.map(item => <div className="profile-card-row" key={JSON.stringify([item.instance, item.session])}><div className="profile-session-info"><span>{chats.find(chat => chat.instance_id === item.instance && chat.session === item.session)?.title || item.session}</span><small>{item.instance} · {item.session}</small></div><button type="button" aria-label={`${ui.removeRow} ${item.session}`} onClick={() => void mutate(() => assignSessionProfile({ instance: item.instance, session: item.session, profile: null }))}><X size={16} /></button></div>)}{dedicated.length === 0 && <p className="profile-scope-empty">{ui.noDedicatedSessions}</p>}</div>
        </section>
        <section className="profile-scope-section"><h3 className="profile-scope-section-title">{ui.inheritedSessions}</h3><div className="profile-card">{inherited.map(chat => <div className="profile-card-row" key={JSON.stringify([chat.instance_id, chat.session])}><div className="profile-session-info"><span>{chat.title || chat.session}</span><small>{chat.instance_id} · {chat.session}</small></div></div>)}{inherited.length === 0 && <p className="profile-scope-empty">{ui.noEntries}</p>}</div></section>
      </fieldset>}
      <div className="dialog-actions"><button type="button" onClick={() => onOpenChange(false)}>{ui.done}</button></div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
