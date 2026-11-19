import { useEffect, useState, useRef, type JSX, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Sun, Moon, Laptop, X, KeyRound } from 'lucide-react';
import { getDefaultLocale, setDefaultLocale, getLogLevels, setGlobalLogLevel, rotateAdminToken, getCoreDenies, setCoreDenies, getCoreConfigDiagnostics, pruneCoreConfig, type GlobalLogLevel } from '../api/admin';
import { useUI } from '../i18n/UI';
import { useUISettings } from '../shell/settings';
import { Link } from '../shell/router';

async function readSettings() {
  const [locale, logs, denies, diagnostics] = await Promise.all([getDefaultLocale(), getLogLevels(), getCoreDenies(), getCoreConfigDiagnostics()]);
  return { locale: locale.default_locale, logs, denies, diagnostics };
}
function SettingsRow({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <div className="settings-row"><div className="settings-label-col"><strong>{title}</strong>{description && <p>{description}</p>}</div><div className="settings-control-col">{children}</div></div>;
}

export function SettingsPage(): JSX.Element {
  const ui = useUI();
  const { locale, setLocale, theme, setTheme, logout, tokenRotated } = useUISettings();
  const [data, setData] = useState<Awaited<ReturnType<typeof readSettings>> | null>(null);
  const [coreLocale, setCoreLocale] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [identity, setIdentity] = useState('');
  const [pruneOpen, setPruneOpen] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [token, setToken] = useState('');
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const load = async () => {
    setLoading(true); setError(null);
    try { const next = await readSettings(); setData(next); setCoreLocale(next.locale); }
    catch (error) { setData(null); setError(error instanceof Error ? error.message : String(error)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  // 写入后始终核对有效快照，覆盖设置已提交但通知失败及禁止表部分提交的路径。
  const mutate = async (action: () => Promise<unknown>) => {
    if (writing.current) return;
    writing.current = true; setBusy(true); setError(null);
    const errors: string[] = [];
    try { await action(); }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    try { const next = await readSettings(); setData(next); setCoreLocale(next.locale); }
    catch (error) { setData(null); errors.push(error instanceof Error ? error.message : String(error)); }
    setError(errors.length ? errors.join('\n') : null);
    writing.current = false; setBusy(false);
    return errors.length === 0;
  };
  const closeRotate = () => { if (!rotating) { setRotateOpen(false); setToken(''); setRotateError(null); } };
  const matches = (value: string) => value.toLowerCase().includes(query.toLowerCase());
  const roster = (values: string[], remove: (value: string) => void) => <div className="admins-list">{values.filter(matches).map(value => <div key={value} className="admin-chip"><code>{value}</code><button type="button" className="chip-remove-btn" aria-label={`${ui.removeRow} ${value}`} onClick={() => remove(value)}><X size={14} /></button></div>)}</div>;
  return <div className="settings-page">
    <div className="settings-header"><button type="button" className="settings-logout" onClick={() => void logout().catch(error => setError(error instanceof Error ? error.message : String(error)))}>{ui.logout}</button></div>
    {error && <div className="plugins-error-banner" role="alert">{error}<button type="button" disabled={busy || loading} onClick={() => void load()}>{ui.refresh}</button></div>}
    {loading && <p role="status">{ui.loading}</p>}
    <section className="settings-card"><h2 className="settings-card-title">{ui.general}</h2>
      <SettingsRow title={ui.uiLanguage} description={ui.uiLanguageDesc}><select aria-label={ui.uiLanguage} value={locale} onChange={event => setLocale(event.target.value)}><option value="zh-CN">{ui.languageChinese}</option><option value="en-US">{ui.languageEnglish}</option></select></SettingsRow>
      <SettingsRow title={ui.themeMode} description={ui.themeModeDesc}><div className="theme-toggle-group">{([{ value: 'light', label: ui.themeLight, Icon: Sun }, { value: 'dark', label: ui.themeDark, Icon: Moon }, { value: 'system', label: ui.themeSystem, Icon: Laptop }] as const).map(({ value, label, Icon }) => <button key={value} type="button" className={`theme-toggle-btn ${theme === value ? 'is-active' : ''}`} aria-pressed={theme === value} onClick={() => setTheme(value)}><Icon size={14} />{label}</button>)}</div></SettingsRow>
    </section>
    <fieldset className="settings-fields" disabled={!data || busy || loading}>
      <section className="settings-card"><h2 className="settings-card-title">{ui.security}</h2>
        <SettingsRow title={ui.rotateToken} description={ui.rotateTokenDesc}><button type="button" onClick={() => { setToken(''); setRotateError(null); setRotateOpen(true); }}><KeyRound size={14} />{ui.rotateTokenButton}</button></SettingsRow>
        <SettingsRow title={ui.accessControl}><Link to="/permissions/users" className="dialog-button">{ui.manageUsers}</Link></SettingsRow>
        <details className="settings-access"><summary>{ui.deniedChats}</summary>
        <input aria-label={ui.filterIdentities} placeholder={ui.filterIdentities} value={query} onChange={event => setQuery(event.target.value)} />
        <SettingsRow title={ui.deniedChats}>{data && roster(data.denies.chats, chat => void mutate(async () => { const current = await getCoreDenies(); await setCoreDenies({ users: current.users, chats: current.chats.filter(value => value !== chat) }); }))}<button type="button" onClick={() => { setIdentity(''); setAdding(true); }}>{ui.addChat}</button></SettingsRow>
        </details>
      </section>
      <section className="settings-card"><h2 className="settings-card-title">{ui.system}</h2>
        <SettingsRow title={ui.globalLogLevel} description={ui.globalLogLevelDesc}><select aria-label={ui.globalLogLevel} value={data?.logs.global ?? ''} onChange={event => void mutate(() => setGlobalLogLevel(event.target.value as GlobalLogLevel))}>{(['debug', 'info', 'warn', 'error', 'critical'] as const).map(level => <option key={level} value={level}>{({ debug: ui.logDebug, info: ui.logInfo, warn: ui.logWarn, error: ui.logError, critical: ui.logCritical })[level]}</option>)}</select></SettingsRow>
        <SettingsRow title={ui.coreDefaultLocale} description={ui.coreDefaultLocaleDesc}><form className="settings-input-row" onSubmit={event => { event.preventDefault(); void mutate(() => setDefaultLocale(coreLocale)); }}><input aria-label={ui.coreDefaultLocale} value={coreLocale} required onChange={event => setCoreLocale(event.target.value)} /><button type="submit" disabled={coreLocale === data?.locale}>{ui.save}</button></form></SettingsRow>
        {data && (data.diagnostics.corrections.length > 0 || data.diagnostics.unknown.length > 0) && <SettingsRow title={ui.corrections}><ul>{data.diagnostics.corrections.map((entry, index) => <li key={index}><code>{entry.path}</code>: {ui[entry.reason]}{Object.hasOwn(entry, 'original') && <pre>{JSON.stringify(entry.original)}</pre>}</li>)}</ul><ul>{data.diagnostics.unknown.map(path => <li key={path}><code>{path}</code></li>)}</ul>{data.diagnostics.unknown.length > 0 && <button type="button" onClick={() => setPruneOpen(true)}>{ui.pruneConfig}</button>}</SettingsRow>}
      </section>
    </fieldset>
    <Dialog.Root open={adding} onOpenChange={open => { if (!open && !busy) { setAdding(false); setIdentity(''); } }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content" aria-describedby={undefined}><Dialog.Title>{ui.addChat}</Dialog.Title>
      {error && <p role="alert">{error}</p>}
      <form onSubmit={async event => { event.preventDefault(); if (!data) return; const value = identity.trim(); const success = await mutate(async () => { const current = await getCoreDenies(); await setCoreDenies({ users: current.users, chats: [...current.chats, value] }); }); if (success) { setAdding(false); setIdentity(''); } }}><input autoFocus aria-label={ui.addChat} required value={identity} onChange={event => setIdentity(event.target.value)} /><div className="dialog-actions"><button type="button" disabled={busy} onClick={() => { setAdding(false); setIdentity(''); }}>{ui.cancel}</button><button type="submit" disabled={busy || !identity.trim() || !data}>{ui.save}</button></div></form>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={pruneOpen} onOpenChange={setPruneOpen}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content"><Dialog.Title>{ui.pruneConfig}</Dialog.Title><Dialog.Description>{ui.pruneConfigConfirm}</Dialog.Description><ul>{data?.diagnostics.unknown.map(path => <li key={path}><code>{path}</code></li>)}</ul><div className="dialog-actions"><button type="button" onClick={() => setPruneOpen(false)}>{ui.cancel}</button><button type="button" onClick={() => { setPruneOpen(false); void mutate(pruneCoreConfig); }}>{ui.confirm}</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={rotateOpen} onOpenChange={open => { if (!open) closeRotate(); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content settings-token-dialog">
      <div className="dialog-header"><Dialog.Title className="dialog-title">{ui.rotateTokenModalTitle}</Dialog.Title><button type="button" className="dialog-close-button" aria-label={ui.close} disabled={rotating} onClick={closeRotate}><X size={18} /></button></div>
      <Dialog.Description className="dialog-description">{ui.rotateReauthenticate}</Dialog.Description>
      {rotateError && <p role="alert">{rotateError}</p>}
      <form onSubmit={async event => { event.preventDefault(); setRotating(true); setRotateError(null); try { const result = await rotateAdminToken(token); setToken(''); setRotateOpen(false); tokenRotated(result.token); } catch (error) { setRotateError(error instanceof Error ? error.message : String(error)); } finally { setRotating(false); } }}><label className="dialog-form-field">{ui.currentToken}<input type="password" autoComplete="off" autoFocus required disabled={rotating} value={token} onChange={event => setToken(event.target.value)} /></label><p className="settings-token-warning">{ui.rotatePrompt}</p><div className="dialog-actions"><button type="button" className="dialog-button" disabled={rotating} onClick={closeRotate}>{ui.cancel}</button><button type="submit" className="dialog-button is-primary" disabled={rotating || !token}>{rotating ? ui.loading : ui.confirmAction}</button></div></form>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
