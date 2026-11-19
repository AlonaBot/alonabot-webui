import { useEffect, useState, type JSX } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Plus, Trash2, X } from 'lucide-react';
import { getProfilePlugins, getProfileTools, getToolPolicies, listPackages, onPackagesChanged, putProfileTools, type Package, type ProfilePlugin, type ProfileToolPolicy, type ToolPolicy } from '../api/admin';
import { useUI } from '../i18n/UI';
import { profileToolCandidates, profileToolIdentity, profileToolKey } from './profileTools';

export function ProfileToolsPanel({ profileID }: { profileID: string }): JSX.Element {
  const ui = useUI();
  const [globals, setGlobals] = useState<ToolPolicy[]>([]);
  const [items, setItems] = useState<ProfileToolPolicy[]>([]);
  const [plugins, setPlugins] = useState<ProfilePlugin[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  async function load() {
    const [global, saved, profilePlugins, allPackages] = await Promise.all([getToolPolicies(), getProfileTools(profileID), getProfilePlugins(profileID), listPackages()]);
    setGlobals(global.policies); setItems(saved.items); setPlugins(profilePlugins); setPackages(allPackages);
  }
  useEffect(() => {
    const refresh = () => void load().catch(error => setError(error instanceof Error ? error.message : String(error))).finally(() => setLoading(false));
    refresh();
    return onPackagesChanged(refresh);
  }, [profileID]);
  async function save(item: ProfileToolPolicy, policy: ProfileToolPolicy['policy']) {
    setBusy(true); setError(null);
    const errors: string[] = [];
    try { await putProfileTools(profileID, [{ ...item, policy }]); setOpen(false); }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    try { await load(); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    setError(errors.length ? errors.join('\n') : null); setBusy(false);
  }
  const label = (policy: string) => policy === 'allow' ? ui.toolActionAllow : policy === 'confirm' ? ui.toolActionAsk : policy === 'deny' ? ui.toolActionDeny : ui.toolActionInherit;
  const matches = (item: ProfileToolPolicy, search: string) => {
    const { pluginID, name, kind } = profileToolIdentity(item);
    return (pluginID + '/' + name + (kind === 'tool' ? ui.profileToolIdentity : ui.profileOperationIdentity)).toLowerCase().includes(search.toLowerCase());
  };
  const detail = (item: ProfileToolPolicy) => {
    const { pluginID, name, kind } = profileToolIdentity(item);
    const global = globals.find(row => row.plugin_id === pluginID && row.service === name);
    const disabled = packages.some(pkg => pkg.ID === pluginID && !pkg.Enabled) || plugins.some(plugin => plugin.plugin_id === pluginID && !plugin.enabled);
    return <div className="profile-tool-info"><span className="profile-tool-title">{name} <small>{kind === 'tool' ? ui.profileToolIdentity : ui.profileOperationIdentity}</small></span><span className="profile-tool-subtext">{pluginID}{global && ` · ${ui.toolGlobalPrefix.replace('{policy}', label(global.override === 'inherit' ? global.default : global.override))}`}{disabled && ` · ${ui.pluginDisabled}`}</span></div>;
  };
  return <div className="profile-tools-panel">
    {error && <p className="plugins-error-banner" role="alert">{error}</p>}
    {loading ? <p role="status">{ui.loading}</p> : <fieldset className="config-edit-fields" disabled={busy}>
      {items.length > 0 && <input aria-label={ui.searchTools} placeholder={ui.searchTools} value={filter} onChange={event => setFilter(event.target.value)} />}
      <div className="profile-card">{items.filter(item => item.policy !== 'inherit' && matches(item, filter)).map(item => <div className="profile-card-row profile-tool-row" key={profileToolKey(item)}>
        {detail(item)}<div className="profile-tool-actions"><div className="profile-tool-segmented" role="group" aria-label={profileToolKey(item)}>{(['allow', 'confirm', 'deny'] as const).map(policy => <button type="button" key={policy} className={`profile-segmented-btn ${item.policy === policy ? 'is-active' : ''}`} aria-pressed={item.policy === policy} onClick={() => void save(item, policy)}>{label(policy)}</button>)}</div><button type="button" className="profile-tool-remove-btn" aria-label={`${ui.toolActionInherit} ${profileToolKey(item)}`} onClick={() => void save(item, 'inherit')}><Trash2 size={16} /></button></div>
      </div>)}<button type="button" className="profile-add-tool-btn" onClick={() => { setQuery(''); setOpen(true); }}><Plus size={16} />{ui.overrideOtherTools}</button></div>
    </fieldset>}
    <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content profile-add-tool-dialog" aria-describedby={undefined}>
      <div className="dialog-header"><Dialog.Title className="dialog-title">{ui.addToolOverride}</Dialog.Title><Dialog.Close asChild><button type="button" aria-label={ui.close}><X size={18} /></button></Dialog.Close></div>
      <input aria-label={ui.searchTools} placeholder={ui.searchTools} value={query} onChange={event => setQuery(event.target.value)} />
      <div className="profile-tool-candidates-list">{profileToolCandidates(globals, items).filter(item => matches(item, query)).map(item => <button key={profileToolKey(item)} type="button" disabled={busy} className="profile-tool-candidate-row" onClick={() => void save(item, 'deny')}>{detail(item)}<Plus size={16} /></button>)}{profileToolCandidates(globals, items).filter(item => matches(item, query)).length === 0 && <p>{ui.noToolsToOverride}</p>}</div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
