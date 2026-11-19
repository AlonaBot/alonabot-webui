import { useEffect, useState, useMemo, useCallback, useRef, type JSX } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AdminAPIError, changePackage, getPluginConfig, patchPluginConfig, discardPluginConfig, prunePluginConfig, revealPluginSecret, encodeSecretPath, listConfigOptions, resolveConfigOptions, pluginExampleURL, getDefaultPlatform, listPackages, type ConfigSnapshot, type Package, type Profile, type ProfilePlugin, listProfiles, getProfilePlugins, patchProfilePlugin, pruneProfilePlugin } from '../api/admin';
import { ConfigForm, type ConfigFormProps } from '../components/ConfigForm';
import { pickLocale } from '../i18n/catalog';
import { useUI } from '../i18n/UI';
import { useUISettings } from '../shell/settings';
import { navigate } from '../shell/router';
import { applyMergePatch, applyProfileOverrides, extractProfileOverrides, editableProfilePaths } from './pluginConfig';

export function PluginConfigPanel({ id }: { id: string }): JSX.Element {
  const ui = useUI();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileID, setProfileID] = useState(() => new URLSearchParams(window.location.search).get('profile') || 'default');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setProfileID(new URLSearchParams(window.location.search).get('profile') || 'default');
    window.addEventListener('popstate', sync);
    listProfiles().then(setProfiles).catch(error => setError(error instanceof Error ? error.message : String(error)));
    return () => window.removeEventListener('popstate', sync);
  }, []);
  return <>
    {error && <p role="alert">{error}</p>}
    <label className="plugin-profile-selector">{ui.profile}<select aria-label={ui.profile} value={profileID} onChange={event => {
      const url = new URL(window.location.href); url.searchParams.set('profile', event.target.value); url.searchParams.set('tab', 'config'); navigate(url.pathname + url.search);
    }}>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
    <ProfileConfigEditor key={id + ':' + profileID} id={id} profileID={profileID} />
  </>;
}

export function ProfileConfigEditor({ id, profileID, renderForm, onChanged }: {
  id: string;
  profileID: string;
  renderForm?: (form: ConfigFormProps, snapshot: ConfigSnapshot) => JSX.Element;
  onChanged?: () => void;
}): JSX.Element {
  const ui = useUI();
  const { locale } = useUISettings();
  const [snapshot, setSnapshot] = useState<ConfigSnapshot | null>(null);
  const [latest, setLatest] = useState<ConfigSnapshot | null>(null);
  const [prefix, setPrefix] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmation, setConfirmation] = useState<'prune' | 'discard' | 'reload' | null>(null);
  const [profilePlugin, setProfilePlugin] = useState<ProfilePlugin | null>(null);
  const isDefault = profileID === 'default';
  const [saved, setSaved] = useState(false);
  const [runtime, setRuntime] = useState<Package | null>(null);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthToken, setReauthToken] = useState('');
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const pendingReveal = useRef<{ path: string[]; resolve: (value: string) => void; reject: (error: Error) => void } | null>(null);
  const load = useCallback(async () => {
    const [value, plugins] = await Promise.all([getPluginConfig(id), isDefault ? Promise.resolve([]) : getProfilePlugins(profileID)]);
    setProfilePlugin(plugins.find(plugin => plugin.plugin_id === id) ?? null);
    setSnapshot(value);
    setLatest(null);
  }, [id, profileID, isDefault]);
  useEffect(() => {
    let active = true;
    Promise.all([getPluginConfig(id), getDefaultPlatform(), isDefault ? Promise.resolve([]) : getProfilePlugins(profileID)]).then(([value, platform, plugins]) => {
      if (active) { setSnapshot(value); setPrefix(platform.command_prefixes[0]); setProfilePlugin(plugins.find(plugin => plugin.plugin_id === id) ?? null); }
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; pendingReveal.current?.reject(new DOMException('cancelled', 'AbortError')); pendingReveal.current = null; };
  }, [id, profileID, isDefault]);

  const mutate = async (action: () => Promise<unknown>) => {
    setBusy(true); setError(null); setSaved(false);
    try { await action(); await load(); setSaved(true); }
    catch (error) {
      let message = error instanceof Error ? error.message : String(error);
      try { await load(); } catch (readError) { message += '\n' + (readError instanceof Error ? readError.message : String(readError)); }
      setError(message);
    }
    finally { setBusy(false); onChanged?.(); }
  };
  const reload = async () => {
    setBusy(true); setError(null);
    const errors: string[] = [];
    try { await changePackage('reload', id); }
    catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    try { await load(); }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    try { setRuntime((await listPackages()).find(value => value.ID === id) ?? null); }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    setError(errors.length ? errors.join('\n') : null); setBusy(false);
  };
  const submit = async (patch: Record<string, unknown>) => {
    setBusy(true); setError(null); setSaved(false);
    try {
      if (isDefault) await patchPluginConfig(id, snapshot!.active_generation, patch);
      else await patchProfilePlugin(profileID, id, { overrides: extractProfileOverrides(applyMergePatch(value, patch) as Record<string, unknown>, patch, editablePaths!) });
      await load(); setSaved(true); onChanged?.();
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setError(message);
      if (isDefault && error instanceof AdminAPIError && error.status === 409 && error.code === 'FAILED_PRECONDITION') {
        try { setLatest(await getPluginConfig(id)); }
        catch (refreshError) { setError(`${message}\n${refreshError instanceof Error ? refreshError.message : String(refreshError)}`); }
      } else {
        try { await load(); onChanged?.(); } catch (readError) { setError(message + '\n' + (readError instanceof Error ? readError.message : String(readError))); }
      }
    } finally { setBusy(false); }
  };
  const reveal = (path: string[]): Promise<string> => new Promise((resolve, reject) => {
    pendingReveal.current = { path, resolve, reject };
    setReauthToken(''); setReauthError(null); setReauthOpen(true);
  });
  const closeReauth = () => {
    pendingReveal.current?.reject(new DOMException('cancelled', 'AbortError'));
    pendingReveal.current = null; setReauthToken(''); setReauthError(null); setReauthOpen(false);
  };
  const options = useMemo(() => ({
    list: (path: string, q: string) => listConfigOptions(id, path, q, locale),
    resolve: (path: string, values: string[]) => resolveConfigOptions(id, path, values, locale),
  }), [id, locale]);
  const messages = useMemo(() => ({ config: snapshot?.i18n[pickLocale(Object.keys(snapshot.i18n), [locale])] ?? {} }), [snapshot, locale]);
  const value = useMemo(() => snapshot ? isDefault ? snapshot.pending?.config ?? snapshot.active : applyProfileOverrides(snapshot.active, profilePlugin?.overrides ?? {}, profilePlugin?.invalid.map(entry => entry.path) ?? []) : {}, [snapshot, isDefault, profilePlugin]);
  const editablePaths = useMemo(() => isDefault ? undefined : editableProfilePaths(snapshot?.schema, profilePlugin?.fields ?? []), [snapshot?.schema, profilePlugin, isDefault]);
  const form: ConfigFormProps | null = snapshot && { schema: snapshot.schema, value, messages, options, editablePaths, exampleImageURL: image => pluginExampleURL(id, image), commandPrefix: prefix, onDiscard: () => setSaved(false), onReveal: isDefault ? reveal : undefined, onSubmit: patch => void submit(patch) };
  return <div className="plugin-config-panel">
    {error && <p className="plugins-error-banner" role="alert">{error}</p>}
    {runtime && <p role="status">{runtime.State}{runtime.Warnings?.length ? `: ${runtime.Warnings.join('; ')}` : ''}</p>}
    {loading ? <p role="status">{ui.loading}</p> : snapshot?.schema == null ? <p>{snapshot ? ui.noConfig : ''}</p> : <>
      {saved && <p role="status">{ui.saveSuccess}</p>}
      {latest && <div className="config-pending-banner"><span>{ui.configConflict}</span><button type="button" onClick={() => { setSnapshot(latest); setLatest(null); }}>{ui.useLatestConfig}</button></div>}
      {isDefault && <p className="field-hint">{ui.profileDefaultConfigHint.replace('{plugin}', id)}</p>}
      {!isDefault && profilePlugin && editablePaths && profilePlugin.fields.length > editablePaths.length && <p role="status">{ui.profileSecretReadonly.replace('{paths}', profilePlugin.fields.filter(path => !editablePaths.includes(path)).join(', '))}</p>}
      {!isDefault && profilePlugin && profilePlugin.invalid.length > 0 && <div className="config-diagnostics-banner"><ul>{profilePlugin.invalid.map(entry => <li key={entry.path}><code>{entry.path}</code>: {entry.reason}</li>)}</ul><button type="button" disabled={busy} onClick={() => void mutate(() => pruneProfilePlugin(profileID, id))}>{ui.pruneOverrides}</button></div>}
      {isDefault && snapshot.pending && <div className="config-pending-banner"><strong>{ui.pendingConfig}</strong><span>{ui.reloadToApply}</span>
        <button type="button" disabled={busy} onClick={() => setConfirmation('reload')}>{ui.actionReload}</button>
        <button type="button" disabled={busy} onClick={() => setConfirmation('discard')}>{ui.discardPending}</button>
      </div>}
      {isDefault && snapshot.unknown.length > 0 && <div className="config-diagnostics-banner is-unknown"><div><strong>{ui.unknownKeys}</strong><ul>{snapshot.unknown.map(path => <li key={path}><code>{path}</code></li>)}</ul></div><button type="button" disabled={busy} onClick={() => setConfirmation('prune')}>{ui.pruneConfig}</button></div>}
      {isDefault && snapshot.corrections.length > 0 && <div className="config-diagnostics-banner is-corrections"><div><strong>{ui.corrections}</strong><ul>{snapshot.corrections.map((entry, index) => <li key={index}><code>{entry.path}</code>: {ui[entry.reason]}{Object.hasOwn(entry, 'original') && <pre>{JSON.stringify(entry.original)}</pre>}</li>)}</ul></div></div>}
      <fieldset className="config-edit-fields" disabled={busy}>
        {form && (renderForm ? renderForm(form, snapshot) : <ConfigForm {...form} />)}
      </fieldset>
    </>}
    <Dialog.Root open={confirmation !== null} onOpenChange={open => { if (!open) setConfirmation(null); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content">
      <Dialog.Title>{confirmation === 'reload' ? ui.actionReload : confirmation === 'prune' ? ui.pruneConfig : ui.discardPending}</Dialog.Title>
      <Dialog.Description>{confirmation === 'reload' ? ui.profileReloadConfirm : confirmation === 'prune' ? ui.prunePluginConfirm : ui.discardPendingConfirm}</Dialog.Description>
      {confirmation === 'reload' && <ul><li>{id}</li></ul>}
      {confirmation === 'prune' && <ul>{snapshot?.unknown.map(path => <li key={path}><code>{path}</code></li>)}</ul>}
      <div className="dialog-actions"><button type="button" onClick={() => setConfirmation(null)}>{ui.cancel}</button><button type="button" onClick={() => { const action = confirmation; setConfirmation(null); if (action === 'reload') void reload(); else void mutate(() => action === 'prune' ? prunePluginConfig(id) : discardPluginConfig(id)); }}>{ui.confirm}</button></div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={reauthOpen} onOpenChange={open => { if (!open) closeReauth(); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content">
      <Dialog.Title>{ui.reauthTitle}</Dialog.Title><Dialog.Description>{ui.reauthPrompt}</Dialog.Description>
      <form onSubmit={async event => {
        event.preventDefault(); const request = pendingReveal.current; if (!request) return;
        setRevealing(true); setReauthError(null);
        try {
          const value = await revealPluginSecret(id, encodeSecretPath(request.path), reauthToken);
          if (pendingReveal.current === request) { request.resolve(value.value); pendingReveal.current = null; setReauthToken(''); setReauthOpen(false); }
        } catch (error) { if (pendingReveal.current === request) setReauthError(error instanceof Error ? error.message : String(error)); }
        finally { setRevealing(false); }
      }}>
        {reauthError && <p role="alert">{reauthError}</p>}
        <input type="password" aria-label={ui.tokenPlaceholder} autoComplete="off" value={reauthToken} onChange={event => setReauthToken(event.target.value)} />
        <div className="dialog-actions"><button type="button" onClick={closeReauth}>{ui.cancel}</button><button type="submit" disabled={revealing || !reauthToken}>{ui.confirm}</button></div>
      </form>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
