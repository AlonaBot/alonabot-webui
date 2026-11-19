import { useEffect, useState, useRef, type JSX } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { RefreshCw, Edit2, ChevronDown, ChevronRight, Filter, RotateCcw } from 'lucide-react';
import { listPackages, getPluginPolicies, setPluginPolicy, setCommandNames, resetCommandNames, getToolPolicies, setToolPolicy, setToolPolicies, packageIconURL, type Package, type PluginPolicies, type CommandPolicy, type CommandScope, type ToolPolicy, type ToolPolicyValue } from '../api/admin';
import { useUI } from '../i18n/UI';
import { useUISettings } from '../shell/settings';
import { commandDescription, commandOverride, commandTree, matchesCommand, scopeEnabled, scopeKey, type CommandTree } from './permissionState';
import { CommandPolicyControls } from './CommandPolicyControls';
import { CommandNamesDialog, type NamesDraft } from './CommandNamesDialog';
import { PermissionsTabs } from './PermissionsTabs';

const policyValues: ToolPolicyValue[] = ['inherit', 'allow', 'confirm', 'deny'];
const toolKey = (tool: ToolPolicy) => JSON.stringify([tool.plugin_id, tool.service]);

export function PermissionsPage({ tab = 'commands' }: { tab?: 'commands' | 'tools' }): JSX.Element {
  const ui = useUI();
  const { locale } = useUISettings();
  const [packages, setPackages] = useState<Package[]>([]);
  const [policies, setPolicies] = useState<Record<string, PluginPolicies>>({});
  const [tools, setTools] = useState<ToolPolicy[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const [plugin, setPlugin] = useState('');
  const [query, setQuery] = useState('');
  const [permission, setPermission] = useState('');
  const [toolPolicy, setToolPolicyFilter] = useState('');
  const [category, setCategory] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [batchPolicy, setBatchPolicy] = useState<ToolPolicyValue>('allow');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [names, setNames] = useState<NamesDraft | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [custom, setCustom] = useState<{ plugin: string; scope: CommandScope; permissions: string } | null>(null);
  const labels: Record<ToolPolicyValue, string> = { inherit: ui.policyInherit, allow: ui.policyAllow, confirm: ui.policyConfirm, deny: ui.policyDeny };
  const effects = { read_only: ui.catReadOnly, write: ui.catWrite, destructive: ui.catDestructive, unspecified: ui.catUnspecified };
  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [all, directory] = await Promise.all([listPackages(), getToolPolicies()]);
      const installed = all.filter(value => !value.Uninstalled && value.Role !== 'webui');
      setPackages(installed); setTools(directory.policies);
      const results = await Promise.allSettled(installed.map(async value => [value.ID, await getPluginPolicies(value.ID)] as const));
      const next: Record<string, PluginPolicies> = {}; const errors: string[] = [];
      for (const result of results) { if (result.status === 'fulfilled') next[result.value[0]] = result.value[1]; else errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason)); }
      setPolicies(next); if (errors.length) setError(errors.join('\n'));
    } catch (error) { setTools(null); setPolicies({}); setError(error instanceof Error ? error.message : String(error)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => { setQuery(''); setSelected(new Set()); }, [tab]);
  const mutate = async (action: () => Promise<void>, pluginID?: string) => {
    if (writing.current) return false;
    writing.current = true; setBusy(true); setError(null); setDialogError(null);
    const errors: string[] = [];
    try { await action(); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    try {
      if (pluginID) { const next = await getPluginPolicies(pluginID); setPolicies(previous => ({ ...previous, [pluginID]: next })); }
      else setTools((await getToolPolicies()).policies);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      if (pluginID) setPolicies(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => id !== pluginID))); else setTools(null);
    }
    const message = errors.length ? errors.join('\n') : null;
    setError(message); setDialogError(message); setBusy(false); writing.current = false;
    return errors.length === 0;
  };
  const controls = (pluginID: string, scope: CommandScope, label: string, command?: CommandPolicy, enabledOnly = false) => <CommandPolicyControls
    overrides={policies[pluginID].overrides} scope={scope} label={label} busy={busy}
    path={command?.declared_names[0]} enabledOnly={enabledOnly}
    enabled={command?.enabled ?? scopeEnabled(policies[pluginID].overrides, scope)} permissions={command ? command.permissions ?? [] : undefined}
    onChange={change => void mutate(() => setPluginPolicy(pluginID, commandOverride(policies[pluginID].overrides, scope, change)), pluginID)}
    onCustom={permissions => { setDialogError(null); setCustom({ plugin: pluginID, scope, permissions: permissions?.join(', ') ?? '' }); }} />;
  const toggle = (key: string) => setCollapsed(previous => {
    const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next;
  });
  const matches = (command: CommandPolicy) => matchesCommand(command, query, permission);
  const renderCommand = (pluginID: string, command: CommandPolicy) => {
    if (!matches(command)) return null;
    const paths = command.effective_names.map(path => path.join(' '));
    const display = paths[0] || command.route_id;
    const description = commandDescription(command, locale, policies[pluginID].default_locale);
    const shadows = policies[pluginID].shadows.filter(shadow => (shadow.winner.plugin_id === pluginID && shadow.winner.route_id === command.route_id)
      || shadow.shadowed.some(entry => entry.plugin_id === pluginID && entry.route_id === command.route_id));
    return <div key={command.route_id} className="route-item-row">
      <div className="route-title"><div className="command-name-line"><strong>{display}</strong>{paths.slice(1).map(path => <span key={path} className="command-alias">{path}</span>)}
        {command.has_names_override && <span className="renamed-badge">{ui.renamedBadge}</span>}
        {shadows.map((shadow, index) => <span key={index} className="command-conflict-badge" title={`${shadow.path.join(' ')}: ${ui.shadowWinner} ${shadow.winner.plugin_id}/${shadow.winner.route_id}; ${ui.commandShadowed} ${shadow.shadowed.map(entry => `${entry.plugin_id}/${entry.route_id}`).join(', ')}`}>{shadow.winner.plugin_id === pluginID && shadow.winner.route_id === command.route_id ? ui.shadowWinner : ui.commandShadowed}</span>)}
        {command.invalid_names.length > 0 && <span className="command-conflict-badge">{ui.invalidNamesBadge}</span>}
      </div>{description && <span className="command-description">{description}</span>}</div>
      {command.declared_names.length > 0 && <button type="button" className="detail-icon-button" aria-label={`${ui.editNames} ${display}`} onClick={() => { setDialogError(null); setNames({ plugin: pluginID, command, names: paths }); }}><Edit2 size={16} /></button>}
      {controls(pluginID, { kind: 'route', route_id: command.route_id }, display, command)}
    </div>;
  };
  const groupMatches = (node: CommandTree): boolean => node.commands.some(matches) || node.children.some(groupMatches);
  const renderGroup = (pluginID: string, node: CommandTree): JSX.Element => <div className="command-tree">
    {node.commands.map(command => renderCommand(pluginID, command))}
    {node.children.filter(child => (!query && !permission) || groupMatches(child)).map(child => {
      const scope: CommandScope = { kind: 'group', group: child.path };
      const key = JSON.stringify([pluginID, scopeKey(scope)]);
      const open = !collapsed.has(key);
      return <div key={key} className="command-group"><div className="command-group-header">
        <button type="button" className="command-disclosure" aria-expanded={open} onClick={() => toggle(key)}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<strong>{child.path.join(' ')}</strong></button>
        {controls(pluginID, scope, child.path.join(' '))}
      </div>{open && renderGroup(pluginID, child)}</div>;
    })}
  </div>;
  const visibleTools = (tools ?? []).filter(tool => (!plugin || tool.plugin_id === plugin) && (!category || tool.effect === category)
    && (!toolPolicy || (tool.override === 'inherit' ? tool.default : tool.override) === toolPolicy) && `${tool.plugin_id} ${tool.service}`.toLowerCase().includes(query.toLowerCase()));
  const pickedTools = visibleTools.filter(tool => selected.has(toolKey(tool)));
  const toolPlugins = [...new Set(visibleTools.map(tool => tool.plugin_id))];
  const commandPackages = packages.filter(value => (!plugin || value.ID === plugin) && ((!query && !permission) || policies[value.ID]?.commands.some(matches)));
  const visibleKeys = tab === 'commands' ? commandPackages.flatMap(value => {
    const keys = [value.ID];
    const collect = (node: CommandTree) => { for (const child of node.children) { keys.push(JSON.stringify([value.ID, scopeKey({ kind: 'group', group: child.path })])); collect(child); } };
    if (policies[value.ID]) collect(commandTree(policies[value.ID].commands, policies[value.ID].overrides));
    return keys;
  }) : toolPlugins;
  const allCollapsed = visibleKeys.length > 0 && visibleKeys.every(key => collapsed.has(key));
  return <div className="permissions-page">
    <PermissionsTabs active={tab} />
    <div className="permissions-toolbar">
      <select aria-label={ui.filterPlugin} value={plugin} onChange={event => { setPlugin(event.target.value); setSelected(new Set()); }}><option value="">{ui.allPlugins}</option>{packages.map(value => <option key={value.ID} value={value.ID}>{value.ID}</option>)}</select>
      {tab === 'commands' ? <select aria-label={ui.filterPermission} value={permission} onChange={event => setPermission(event.target.value)}><option value="">{ui.allPermissions}</option><option value="everyone">{ui.permEveryone}</option><option value="chat_admin">{ui.permGroupAdmin}</option><option value="admin">{ui.permAdminOnly}</option><option value="custom">{ui.customPermissions}</option></select>
        : <select aria-label={ui.allPolicies} value={toolPolicy} onChange={event => { setToolPolicyFilter(event.target.value); setSelected(new Set()); }}><option value="">{ui.allPolicies}</option>{policyValues.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select>}
      <div className="permission-search"><Filter size={16} /><input aria-label={tab === 'commands' ? ui.searchCommandPlaceholder : ui.searchToolPlaceholder} placeholder={tab === 'commands' ? ui.searchCommandPlaceholder : ui.searchToolPlaceholder} value={query} onChange={event => { setQuery(event.target.value); setSelected(new Set()); }} /></div>
      <button type="button" className="detail-icon-button" disabled={busy || loading} aria-label={ui.refresh} onClick={() => void load()}><RefreshCw size={16} /></button>
      <button type="button" className="permission-expand" onClick={() => setCollapsed(previous => { const next = new Set(previous); for (const key of visibleKeys) { if (allCollapsed) next.delete(key); else next.add(key); } return next; })}>{allCollapsed ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{allCollapsed ? ui.expandAll : ui.collapseAll}</button>
    </div>
    {error && <p className="plugins-error-banner" role="alert">{error}</p>}
    {loading && <p role="status">{ui.loading}</p>}
    {!loading && tab === 'commands' && commandPackages.map(value => {
      const policy = policies[value.ID]; const open = !collapsed.has(value.ID);
      const conflicts = (policy?.shadows.length ?? 0) + (policy?.invalid_names.length ?? 0);
      return <section key={value.ID} className="command-plugin-card">
        <div className="command-card-header"><button type="button" className="command-disclosure" aria-expanded={open} onClick={() => toggle(value.ID)}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<img className="plugin-mini-icon" src={packageIconURL(value.ID)} alt="" /><strong>{value.ID}</strong><span className="command-count">{policy?.commands.length} {ui.commandsCount}</span></button>
          {conflicts > 0 && <span className="command-conflict-badge">{conflicts} {ui.conflictWarning}</span>}
          {policy && controls(value.ID, { kind: 'plugin' }, value.ID, undefined, !open)}
        </div>
        {open && policy && <div className="command-card-body">{renderGroup(value.ID, commandTree(policy.commands, policy.overrides))}
          {policy.commands.length === 0 && <p className="command-empty">{ui.noCommands}</p>}
          {policy.overrides.filter(entry => entry.scope.kind === 'route' && !policy.commands.some(command => entry.scope.kind === 'route' && command.route_id === entry.scope.route_id)).map(entry => <div key={scopeKey(entry.scope)} className="route-item-row"><code className="route-title">{entry.scope.kind === 'route' ? entry.scope.route_id : ''}</code><span className="command-conflict-badge">{ui.invalidNameUnregistered}</span>{controls(value.ID, entry.scope, entry.scope.kind === 'route' ? entry.scope.route_id : '')}</div>)}
          {policy.shadows.length > 0 && <ul className="policy-diagnostics">{policy.shadows.map((shadow, index) => <li key={index}><code>{shadow.path.join(' ')}</code> · {ui.shadowWinner}: <code>{shadow.winner.plugin_id}/{shadow.winner.route_id}</code> · {ui.commandShadowed}: {shadow.shadowed.map(entry => `${entry.plugin_id}/${entry.route_id}`).join(', ')}</li>)}</ul>}
          {policy.invalid_names.length > 0 && <ul className="policy-diagnostics">{policy.invalid_names.map((entry, index) => <li key={index}><code>{entry.route_id}: {entry.name?.join(' ')}</code> · {entry.reason === 'declared' ? ui.invalidNameDeclared : ui.invalidNameUnregistered}<button type="button" disabled={busy} onClick={() => void mutate(() => resetCommandNames(value.ID, entry.route_id), value.ID)}>{ui.resetNames}</button></li>)}</ul>}
        </div>}
      </section>;
    })}
    {!loading && tab === 'tools' && <><div className="tools-batch-bar"><select aria-label={ui.toolCategory} value={category} onChange={event => { setCategory(event.target.value); setSelected(new Set()); }}><option value="">{ui.all}</option>{Object.entries(effects).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label><input type="checkbox" checked={visibleTools.length > 0 && pickedTools.length === visibleTools.length} onChange={event => setSelected(event.target.checked ? new Set(visibleTools.map(toolKey)) : new Set())} />{ui.selectAll}</label><select aria-label={ui.toolOverride} value={batchPolicy} onChange={event => setBatchPolicy(event.target.value as ToolPolicyValue)}>{policyValues.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select><button type="button" disabled={busy || pickedTools.length === 0 || tools === null} onClick={() => void mutate(() => setToolPolicies(pickedTools.map(tool => ({ plugin_id: tool.plugin_id, service: tool.service, policy: batchPolicy }))))}>{ui.batchSet} ({pickedTools.length})</button></div>
      {toolPlugins.map(id => { const open = !collapsed.has(id); const rows = visibleTools.filter(tool => tool.plugin_id === id); return <section key={id} className="tool-plugin-card">
        <div className="command-card-header"><button type="button" className="command-disclosure" aria-expanded={open} onClick={() => toggle(id)}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<img className="plugin-mini-icon" src={packageIconURL(id)} alt="" /><strong>{id}</strong><span className="command-count">{rows.length} {ui.toolsCount}</span></button></div>
        {open && <div className="command-card-body">{rows.map(tool => <div key={tool.service} className="tool-row"><label><input type="checkbox" checked={selected.has(toolKey(tool))} onChange={event => { const next = new Set(selected); if (event.target.checked) next.add(toolKey(tool)); else next.delete(toolKey(tool)); setSelected(next); }} /><span><strong>{tool.service}</strong><span className="tool-metadata">{effects[tool.effect]} · {ui.toolDefault}: {labels[tool.default]}</span></span></label>
          <div className="tool-policy-options" role="group" aria-label={`${ui.toolOverride} ${tool.service}`}>{policyValues.map(policy => <button key={policy} type="button" className={`tool-policy-option policy-${policy}`} aria-pressed={tool.override === policy} aria-label={labels[policy]} title={labels[policy]} disabled={busy} onClick={() => void mutate(() => setToolPolicy({ plugin_id: tool.plugin_id, service: tool.service, policy }))}>{policy === 'inherit' ? <RotateCcw size={14} /> : labels[policy]}</button>)}</div>
        </div>)}</div>}
      </section>; })}
    </>}
    <CommandNamesDialog draft={names} setDraft={setNames} busy={busy} error={dialogError} onSave={() => {
      if (!names) return;
      const matrix = names.names.map(name => name.trim().split(/\s+/));
      if (!matrix.length || matrix.some(path => path.some(token => !token || token.startsWith('/')))) { setDialogError(ui.invalidCommandName); return; }
      void mutate(() => setCommandNames(names.plugin, names.command.route_id, matrix), names.plugin).then(success => { if (success) setNames(null); });
    }} onReset={() => { if (names) void mutate(() => resetCommandNames(names.plugin, names.command.route_id), names.plugin).then(success => { if (success) setNames(null); }); }} />
    <Dialog.Root open={custom !== null} onOpenChange={open => { if (!open && !busy) setCustom(null); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content"><Dialog.Title>{ui.customPermissions}</Dialog.Title><Dialog.Description>{ui.permissionsInputHint}</Dialog.Description>{dialogError && <p role="alert">{dialogError}</p>}<form onSubmit={async event => { event.preventDefault(); if (!custom || !policies[custom.plugin]) return; const permissions = custom.permissions.split(',').map(value => value.trim()).filter(Boolean); if (await mutate(() => setPluginPolicy(custom.plugin, commandOverride(policies[custom.plugin].overrides, custom.scope, { permissions })), custom.plugin)) setCustom(null); }}><input aria-label={ui.permissions} value={custom?.permissions ?? ''} onChange={event => custom && setCustom({ ...custom, permissions: event.target.value })} /><div className="dialog-actions"><button type="button" disabled={busy} onClick={() => setCustom(null)}>{ui.cancel}</button><button type="submit" disabled={busy || !custom || !policies[custom.plugin]}>{ui.save}</button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
