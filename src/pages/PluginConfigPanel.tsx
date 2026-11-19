import { useEffect, useState, useMemo, useCallback, useRef, type JSX } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AdminAPIError, changePackage, getPluginConfig, patchPluginConfig, discardPluginConfig, prunePluginConfig, revealPluginSecret, encodeSecretPath, listConfigOptions, resolveConfigOptions, pluginExampleURL, getDefaultPlatform, listPackages, type ConfigSnapshot, type Package } from '../api/admin';
import { ConfigForm } from '../components/ConfigForm';
import { pickLocale } from '../i18n/catalog';
import { useUI } from '../i18n/UI';
import { useUISettings } from '../shell/settings';

export function PluginConfigPanel({ id }: { id: string }): JSX.Element {
  const ui = useUI();
  const { locale } = useUISettings();
  const [snapshot, setSnapshot] = useState<ConfigSnapshot | null>(null);
  const [latest, setLatest] = useState<ConfigSnapshot | null>(null);
  const [prefix, setPrefix] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmation, setConfirmation] = useState<'prune' | 'discard' | null>(null);
  const [saved, setSaved] = useState(false);
  const [runtime, setRuntime] = useState<Package | null>(null);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthToken, setReauthToken] = useState('');
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const pendingReveal = useRef<{ path: string[]; resolve: (value: string) => void; reject: (error: Error) => void } | null>(null);
  const load = useCallback(async () => {
    const value = await getPluginConfig(id);
    setSnapshot(value);
    setLatest(null);
  }, [id]);
  useEffect(() => {
    let active = true;
    Promise.all([getPluginConfig(id), getDefaultPlatform()]).then(([value, platform]) => {
      if (active) { setSnapshot(value); setPrefix(platform.command_prefixes[0]); }
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; pendingReveal.current?.reject(new DOMException('cancelled', 'AbortError')); pendingReveal.current = null; };
  }, [id]);

  const mutate = async (action: () => Promise<unknown>) => {
    setBusy(true); setError(null); setSaved(false);
    try { await action(); await load(); setSaved(true); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const reload = async () => {
    setBusy(true); setError(null);
    const errors: string[] = [];
    try { await changePackage('reload', id); }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    try { await load(); }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    try { setRuntime((await listPackages()).find(value => value.ID === id) ?? null); }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    setError(errors.length ? errors.join('\n') : null); setBusy(false);
  };
  const submit = async (patch: Record<string, unknown>) => {
    setBusy(true); setError(null); setSaved(false);
    try { await patchPluginConfig(id, snapshot!.active_generation, patch); await load(); setSaved(true); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setError(message);
      if (error instanceof AdminAPIError && error.status === 409 && error.code === 'FAILED_PRECONDITION') {
        try { setLatest(await getPluginConfig(id)); }
        catch (refreshError) { setError(`${message}\n${refreshError instanceof Error ? refreshError.message : String(refreshError)}`); }
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
  return <div className="plugin-config-panel">
    {error && <p className="plugins-error-banner" role="alert">{error}</p>}
    {runtime && <p role="status">{runtime.State}{runtime.Warnings?.length ? `: ${runtime.Warnings.join('; ')}` : ''}</p>}
    {loading ? <p role="status">{ui.loading}</p> : snapshot?.schema == null ? <p>{snapshot ? ui.noConfig : ''}</p> : <>
      {saved && <p role="status">{ui.saveSuccess}</p>}
      {latest && <div className="config-pending-banner"><span>{ui.configConflict}</span><button type="button" onClick={() => { setSnapshot(latest); setLatest(null); }}>{ui.useLatestConfig}</button></div>}
      {snapshot.pending && <div className="config-pending-banner"><strong>{ui.pendingConfig}</strong><span>{ui.reloadToApply}</span>
        <button type="button" disabled={busy} onClick={() => void reload()}>{ui.actionReload}</button>
        <button type="button" disabled={busy} onClick={() => setConfirmation('discard')}>{ui.discardPending}</button>
      </div>}
      {snapshot.unknown.length > 0 && <div className="config-diagnostics-banner is-unknown"><div><strong>{ui.unknownKeys}</strong><ul>{snapshot.unknown.map(path => <li key={path}><code>{path}</code></li>)}</ul></div><button type="button" disabled={busy} onClick={() => setConfirmation('prune')}>{ui.pruneConfig}</button></div>}
      {snapshot.corrections.length > 0 && <div className="config-diagnostics-banner is-corrections"><div><strong>{ui.corrections}</strong><ul>{snapshot.corrections.map((entry, index) => <li key={index}><code>{entry.path}</code>: {ui[entry.reason]}{Object.hasOwn(entry, 'original') && <pre>{JSON.stringify(entry.original)}</pre>}</li>)}</ul></div></div>}
      <fieldset className="config-edit-fields" disabled={busy}>
        <ConfigForm schema={snapshot.schema} value={snapshot.pending?.config ?? snapshot.active} messages={messages} options={options} exampleImageURL={image => pluginExampleURL(id, image)} commandPrefix={prefix} onDiscard={() => setSaved(false)} onReveal={reveal} onSubmit={patch => void submit(patch)} />
      </fieldset>
    </>}
    <Dialog.Root open={confirmation !== null} onOpenChange={open => { if (!open) setConfirmation(null); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content">
      <Dialog.Title>{confirmation === 'prune' ? ui.pruneConfig : ui.discardPending}</Dialog.Title>
      <Dialog.Description>{confirmation === 'prune' ? ui.prunePluginConfirm : ui.discardPendingConfirm}</Dialog.Description>
      {confirmation === 'prune' && <ul>{snapshot?.unknown.map(path => <li key={path}><code>{path}</code></li>)}</ul>}
      <div className="dialog-actions"><button type="button" onClick={() => setConfirmation(null)}>{ui.cancel}</button><button type="button" onClick={() => { const action = confirmation; setConfirmation(null); void mutate(() => action === 'prune' ? prunePluginConfig(id) : discardPluginConfig(id)); }}>{ui.confirm}</button></div>
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
