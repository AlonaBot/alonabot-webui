import { useEffect, useState, type JSX } from 'react';
import { toast } from '../ui/toast';
import { Skeleton } from '../ui/EmptyState';
import { Plus, Trash2, X } from 'lucide-react';
import { onPackagesChanged } from '../api/client';
import { listPackages, type Package } from '../api/packages';
import { getToolPolicies, type ToolPolicy } from '../api/policies';
import { getProfilePlugins, getProfileTools, putProfileTools, type ProfilePlugin, type ProfileToolPolicy } from '../api/profiles';
import { useUI } from '../i18n/UI';
import { profileToolCandidates, profileToolIdentity, profileToolKey } from './profileTools';
import { Dialog as SharedDialog } from '../ui/Dialog';

export function ProfileToolsPanel({ profileID }: { profileID: string }): JSX.Element {
  const ui = useUI();
  const [globals, setGlobals] = useState<ToolPolicy[]>([]);
  const [items, setItems] = useState<ProfileToolPolicy[]>([]);
  const [plugins, setPlugins] = useState<ProfilePlugin[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  async function load() {
    const [global, saved, profilePlugins, allPackages] = await Promise.all([getToolPolicies(), getProfileTools(profileID), getProfilePlugins(profileID), listPackages()]);
    setGlobals(global.policies); setItems(saved.items); setPlugins(profilePlugins); setPackages(allPackages);
  }
  useEffect(() => {
    const refresh = () => void load().catch(error => toast.error(error)).finally(() => setLoading(false));
    refresh();
    return onPackagesChanged(refresh);
  }, [profileID]);
  async function save(item: ProfileToolPolicy, policy: ProfileToolPolicy['policy']) {
    setBusy(true);     const errors: string[] = [];
    try { await putProfileTools(profileID, [{ ...item, policy }]); setOpen(false); }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    try { await load(); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    if (errors.length) toast.error(errors.join('\n')); setBusy(false);
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
    {loading ? <Skeleton height={120} /> : <fieldset className="config-edit-fields" disabled={busy}>
      {items.length > 0 && <input aria-label={ui.searchTools} placeholder={ui.searchTools} value={filter} onChange={event => setFilter(event.target.value)} />}
      <div className="profile-card">{items.filter(item => item.policy !== 'inherit' && matches(item, filter)).map(item => <div className="profile-card-row profile-tool-row" key={profileToolKey(item)}>
        {detail(item)}<div className="profile-tool-actions"><div className="profile-tool-segmented" role="group" aria-label={profileToolKey(item)}>{(['allow', 'confirm', 'deny'] as const).map(policy => <button type="button" key={policy} className={`profile-segmented-btn ${item.policy === policy ? 'is-active' : ''}`} aria-pressed={item.policy === policy} onClick={() => void save(item, policy)}>{label(policy)}</button>)}</div><button type="button" className="profile-tool-remove-btn" aria-label={`${ui.toolActionInherit} ${profileToolKey(item)}`} onClick={() => void save(item, 'inherit')}><Trash2 size={16} /></button></div>
      </div>)}<button type="button" className="profile-add-tool-btn" onClick={() => { setQuery(''); setOpen(true); }}><Plus size={16} />{ui.overrideOtherTools}</button></div>
    </fieldset>}
    <SharedDialog open={open} onOpenChange={setOpen} title={ui.addToolOverride}>
      
      <input aria-label={ui.searchTools} placeholder={ui.searchTools} value={query} onChange={event => setQuery(event.target.value)} />
      <div className="profile-tool-candidates-list">{profileToolCandidates(globals, items).filter(item => matches(item, query)).map(item => <button key={profileToolKey(item)} type="button" disabled={busy} className="profile-tool-candidate-row" onClick={() => void save(item, 'deny')}>{detail(item)}<Plus size={16} /></button>)}{profileToolCandidates(globals, items).filter(item => matches(item, query)).length === 0 && <p>{ui.noToolsToOverride}</p>}</div></SharedDialog>
  </div>;
}
