import { useEffect, useState, type JSX } from 'react';
import { ChevronRight } from 'lucide-react';
import { getPluginConfig, patchProfilePlugin, pruneProfilePlugin, type ConfigSnapshot, type Package, type ProfilePlugin } from '../api/admin';
import { useUI } from '../i18n/UI';
import { fieldText, pickLocale } from '../i18n/catalog';
import { fieldsFromSchema, type Field } from '../schema/model';
import { navigate } from '../shell/router';
import { useUISettings } from '../shell/settings';
import { fieldDottedPath } from './pluginConfig';

export function ProfilePluginsSection({ profileID, packages, plugins, onChanged }: {
  profileID: string; packages: Package[]; plugins: ProfilePlugin[]; onChanged: () => void;
}): JSX.Element {
  const ui = useUI();
  const { locale } = useUISettings();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [snapshots, setSnapshots] = useState<Record<string, ConfigSnapshot>>({});
  const summaryIDs = plugins.filter(plugin => Object.keys(plugin.overrides).length > 0).map(plugin => plugin.plugin_id).join('\n');
  useEffect(() => {
    let active = true;
    void Promise.allSettled(summaryIDs ? summaryIDs.split('\n').map(async id => [id, await getPluginConfig(id)] as const) : []).then(results => {
      if (!active) return;
      const errors: string[] = [];
      const entries: [string, ConfigSnapshot][] = [];
      for (const result of results) {
        if (result.status === 'fulfilled') entries.push([...result.value]);
        else errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
      }
      setSnapshots(Object.fromEntries(entries));
      if (errors.length) setError(errors.join('\n'));
    });
    return () => { active = false; };
  }, [summaryIDs]);
  async function mutate(action: () => Promise<unknown>) {
    setError(null); setBusy(true);
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { await onChanged(); setBusy(false); }
  }
  function fieldLabel(pluginID: string, path: string) {
    const snapshot = snapshots[pluginID];
    if (!snapshot) return path;
    const messages = { config: snapshot.i18n[pickLocale(Object.keys(snapshot.i18n), [locale])] ?? {} };
    function find(fields: Field[]): Field | undefined {
      for (const field of fields) {
        if (fieldDottedPath(field.schemaPath) === path) return field;
        const child = field.children && find(field.children);
        if (child) return child;
      }
    }
    const field = find(fieldsFromSchema(snapshot.schema));
    return field ? fieldText(messages, field).description : path;
  }
  return <div className="profile-plugins-section">
    {error && <p role="alert" className="plugins-error-banner">{error}</p>}
    <input aria-label={ui.searchPlugins} placeholder={ui.searchPlugins} value={query} onChange={event => setQuery(event.target.value)} />
    <fieldset className="config-edit-fields" disabled={busy}><div className="profile-card">
      {plugins.filter(plugin => plugin.plugin_id.toLowerCase().includes(query.toLowerCase())).map(plugin => {
        const pkg = packages.find(pkg => pkg.ID === plugin.plugin_id);
        const disabled = !pkg?.Enabled;
        const valid = Object.keys(plugin.overrides).filter(path => !plugin.invalid.some(invalid => invalid.path === path));
        return <div key={plugin.plugin_id} className={`profile-card-row profile-plugin-row ${disabled ? 'is-globally-disabled' : ''}`}>
          <div className="profile-plugin-info"><span className="profile-plugin-name">{plugin.plugin_id}</span><div className="profile-plugin-meta">
            <span>{disabled ? ui.pluginDisabled : valid.length ? ui.overrideItemCount.replace('{count}', String(valid.length)).replace('{items}', valid.map(path => fieldLabel(plugin.plugin_id, path)).join(', ')) : ui.followDefault}</span>
            {plugin.invalid.length > 0 && <div className="profile-invalid-list">{plugin.invalid.map(invalid => <small key={invalid.path}><code>{invalid.path}</code>: {invalid.reason}</small>)}<button type="button" onClick={() => void mutate(() => pruneProfilePlugin(profileID, plugin.plugin_id))}>{ui.pruneOverrides}</button></div>}
          </div></div>
          <div className="profile-plugin-controls"><label className="plugin-switch-label"><input type="checkbox" role="switch" aria-label={`${ui.actionEnable} ${plugin.plugin_id}`} disabled={disabled} checked={plugin.enabled} onChange={event => void mutate(() => patchProfilePlugin(profileID, plugin.plugin_id, { enabled: event.target.checked }))} /><span className="plugin-switch-slider" /></label><button type="button" className="profile-plugin-arrow-btn" disabled={disabled} aria-label={ui.pluginConfigAction.replace('{plugin}', plugin.plugin_id)} onClick={() => navigate(`/components/${encodeURIComponent(plugin.plugin_id)}?tab=config&profile=${encodeURIComponent(profileID)}`)}><ChevronRight size={18} /></button></div>
        </div>;
      })}
      {plugins.length === 0 && <p className="profile-scope-empty">{ui.noEntries}</p>}
    </div></fieldset>
  </div>;
}
