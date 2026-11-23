import { useEffect, useState, type JSX } from 'react';
import { toast } from '../ui/toast';
import { Skeleton } from '../ui/EmptyState';
import { Plus, Trash2 } from 'lucide-react';
import { onPackagesChanged } from '../api/client';
import { listPackages, type Package } from '../api/packages';
import { getToolPolicies, type ToolPolicy } from '../api/policies';
import { getProfilePlugins, getProfileTools, putProfileTools, type ProfilePlugin, type ProfileToolPolicy } from '../api/profiles';
import { useUI } from '../i18n/UI';
import { profileToolCandidates, profileToolIdentity, profileToolKey } from './profileTools';
import { Dialog as SharedDialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { SelectionTools, toggle } from '../ui/SelectionTools';

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
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [pickPolicy, setPickPolicy] = useState<ProfileToolPolicy['policy']>('deny');
  async function load() {
    const [global, saved, profilePlugins, allPackages] = await Promise.all([getToolPolicies(), getProfileTools(profileID), getProfilePlugins(profileID), listPackages()]);
    setGlobals(global.policies); setItems(saved.items); setPlugins(profilePlugins); setPackages(allPackages);
  }
  useEffect(() => {
    const refresh = () => void load().catch(error => toast.error(error)).finally(() => setLoading(false));
    refresh();
    return onPackagesChanged(refresh);
  }, [profileID]);
  async function save(item: ProfileToolPolicy, policy: ProfileToolPolicy['policy']) { await saveMany([item], policy); }
  async function saveMany(targets: ProfileToolPolicy[], policy: ProfileToolPolicy['policy']) {
    if (targets.length === 0) return;
    setBusy(true);     const errors: string[] = [];
    try { await putProfileTools(profileID, targets.map(item => ({ ...item, policy }))); setOpen(false); setSelected(new Set()); setPicked(new Set()); }
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
  const visible = items.filter(item => item.policy !== 'inherit' && matches(item, filter));
  const chosen = visible.filter(item => selected.has(profileToolKey(item)));
  const candidates = profileToolCandidates(globals, items);
  const shownCandidates = candidates.filter(item => matches(item, query));
  return <div className="profile-tools-panel">
    {loading ? <Skeleton height={120} /> : <fieldset className="config-edit-fields" disabled={busy}>
      {items.length > 0 && <div className="profile-batch-bar">
        <input aria-label={ui.searchTools} placeholder={ui.searchTools} value={filter} onChange={event => setFilter(event.target.value)} />
        <SelectionTools keys={visible.map(profileToolKey)} selected={selected} onChange={setSelected} />
      </div>}
      {selected.size > 0 && <div className="profile-batch-actions">
        <span>{ui.selectedItems.replace('{count}', String(selected.size))}</span>
        {(['allow', 'confirm', 'deny'] as const).map(policy => <button type="button" key={policy} onClick={() => void saveMany(chosen, policy)}>{label(policy)}</button>)}
        <button type="button" onClick={() => void saveMany(chosen, 'inherit')}><Trash2 size={15} />{ui.toolActionInherit}</button>
      </div>}
      <div className="profile-card">{visible.map(item => <div className="profile-card-row profile-tool-row" key={profileToolKey(item)}>
        <Checkbox aria-label={profileToolKey(item)} checked={selected.has(profileToolKey(item))} onCheckedChange={on => setSelected(toggle(selected, profileToolKey(item), on))} />
        {detail(item)}<div className="profile-tool-actions"><div className="profile-tool-segmented" role="group" aria-label={profileToolKey(item)}>{(['allow', 'confirm', 'deny'] as const).map(policy => <button type="button" key={policy} className={`profile-segmented-btn ${item.policy === policy ? 'is-active' : ''}`} aria-pressed={item.policy === policy} onClick={() => void save(item, policy)}>{label(policy)}</button>)}</div><button type="button" className="profile-tool-remove-btn" aria-label={`${ui.toolActionInherit} ${profileToolKey(item)}`} onClick={() => void save(item, 'inherit')}><Trash2 size={16} /></button></div>
      </div>)}<button type="button" className="profile-add-tool-btn" onClick={() => { setQuery(''); setPicked(new Set()); setOpen(true); }}><Plus size={16} />{ui.overrideOtherTools}</button></div>
    </fieldset>}
    <SharedDialog open={open} onOpenChange={setOpen} title={ui.addToolOverride} size="lg"
      footer={<>
        <span className="profile-batch-count">{ui.selectedItems.replace('{count}', String(picked.size))}</span>
        <div className="profile-tool-segmented" role="group" aria-label={ui.toolOverride}>{(['allow', 'confirm', 'deny'] as const).map(policy => <button type="button" key={policy} className={`profile-segmented-btn ${pickPolicy === policy ? 'is-active' : ''}`} aria-pressed={pickPolicy === policy} onClick={() => setPickPolicy(policy)}>{label(policy)}</button>)}</div>
        <Button variant="primary" loading={busy} disabled={picked.size === 0} onClick={() => void saveMany(candidates.filter(item => picked.has(profileToolKey(item))), pickPolicy)}>{ui.add}</Button>
      </>}>
      <div className="profile-batch-bar">
        <input aria-label={ui.searchTools} placeholder={ui.searchTools} value={query} onChange={event => setQuery(event.target.value)} />
        <SelectionTools keys={shownCandidates.map(profileToolKey)} selected={picked} onChange={setPicked} />
      </div>
      <div className="profile-tool-candidates-list">{shownCandidates.map(item => <label key={profileToolKey(item)} className="profile-tool-candidate-row">
        <Checkbox aria-label={profileToolKey(item)} checked={picked.has(profileToolKey(item))} onCheckedChange={on => setPicked(toggle(picked, profileToolKey(item), on))} />{detail(item)}
      </label>)}{shownCandidates.length === 0 && <p className="profile-scope-empty">{ui.noToolsToOverride}</p>}</div>
    </SharedDialog>
  </div>;
}
