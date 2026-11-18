import { useContext, useEffect, useState, type JSX } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Bot, Eye, Info, Play, Plus, RefreshCw, Square, Trash2, X } from 'lucide-react';
import {
  changeInstance, createInstance, getInstanceConfig, getInstanceSchema,
  isConfirmationError, listInstances, listPackages, packageIconURL,
  type AdapterInstance, type Package,
} from '../api/admin';
import { ConfigForm } from '../components/ConfigForm';
import { useUI } from '../i18n/UI';
import { isSecretSet } from '../schema/patch';
import { SearchContext } from '../shell/search';

const emptyConfig: Record<string, unknown> = {};
type CreateInput = Parameters<typeof createInstance>[0];

/** AccountsPage 管理 Core 配置中的账号，操作后读取实际运行状态。 */
export function AccountsPage(): JSX.Element {
  const ui = useUI();
  const { register } = useContext(SearchContext);
  const [instances, setInstances] = useState<AdapterInstance[]>([]);
  const [adapterPackages, setAdapterPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedAdapterID, setSelectedAdapterID] = useState('');
  const selectedAdapter = adapterPackages.find(pkg => pkg.ID === selectedAdapterID);
  const [instanceName, setInstanceName] = useState('');
  const [instanceSchema, setInstanceSchema] = useState<unknown | null>(null);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [inspectingConfig, setInspectingConfig] = useState<Record<string, unknown> | null>(null);
  const [inspectingInstanceID, setInspectingInstanceID] = useState('');
  const [confirmation, setConfirmation] = useState<{ affected: string[]; input: CreateInput } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [packages, configured] = await Promise.all([listPackages(), listInstances()]);
      const adapters = packages.filter(pkg => pkg.Role === 'adapter' && !pkg.Uninstalled);
      setAdapterPackages(adapters);
      setInstances(configured);
      setSelectedAdapterID(previous => adapters.some(pkg => pkg.ID === previous) ? previous : adapters[0]?.ID ?? '');
    } catch (error) {
      setErrorBanner(previous => [previous, error instanceof Error ? error.message : String(error)].filter(Boolean).join('\n'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);
  useEffect(() => register([
    { id: 'accounts-add', title: `${ui.accounts}: ${ui.addAccount}`, section: ui.searchActions,
      keywords: ['add', 'account', 'bot'], run: () => setAddModalOpen(true) },
    { id: 'accounts-refresh', title: `${ui.accounts}: ${ui.refresh}`, section: ui.searchActions,
      keywords: ['refresh', 'accounts'], run: () => { void loadData(); } },
  ]), [register, ui]);

  useEffect(() => {
    setInstanceSchema(null);
    if (!addModalOpen || !selectedAdapter) return;
    let cancelled = false;
    setLoadingSchema(true);
    getInstanceSchema(selectedAdapter.AdapterID).then(schema => {
      if (!cancelled) setInstanceSchema(schema);
    }).catch(error => {
      if (!cancelled) setErrorBanner(error instanceof Error ? error.message : String(error));
    }).finally(() => { if (!cancelled) setLoadingSchema(false); });
    return () => { cancelled = true; };
  }, [addModalOpen, selectedAdapter?.ID, selectedAdapter?.AdapterID]);

  const closeAdd = () => {
    setAddModalOpen(false);
    setInstanceSchema(null);
    setInstanceName('');
    setConfirmation(null);
  };

  const submitCreate = async (input: CreateInput) => {
    setBusy(true);
    setErrorBanner(null);
    try {
      await createInstance(input);
      closeAdd();
      await loadData();
    } catch (error) {
      if (isConfirmationError(error)) {
        setConfirmation({ affected: error.affected, input });
      } else {
        setConfirmation(null);
        setErrorBanner(error instanceof Error ? error.message : String(error));
        await loadData();
      }
    } finally { setBusy(false); }
  };

  const change = async (action: 'start' | 'stop' | 'delete', instance: AdapterInstance) => {
    setBusy(true);
    setErrorBanner(null);
    try { await changeInstance(action, instance.instance_id); }
    catch (error) { setErrorBanner(error instanceof Error ? error.message : String(error)); }
    finally { await loadData(); setBusy(false); }
  };

  const inspect = async (instance: AdapterInstance) => {
    try {
      const result = await getInstanceConfig(instance.adapter_id, instance.instance_id);
      setInspectingConfig(result.config);
      setInspectingInstanceID(instance.instance_id);
      setConfigModalOpen(true);
    } catch (error) { setErrorBanner(error instanceof Error ? error.message : String(error)); }
  };

  const filtered = instances.filter(instance =>
    [instance.instance_id, instance.adapter_id, instance.package_id].some(value => value.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <div className="accounts-page">
      <div className="accounts-topbar">
        <input aria-label={ui.searchAccounts} placeholder={ui.searchAccounts} value={query} onChange={event => setQuery(event.target.value)} />
        <button type="button" className="overview-refresh-button" aria-label={ui.refresh} disabled={loading || busy} onClick={() => { setErrorBanner(null); void loadData(); }}><RefreshCw size={16} /></button>
        <button type="button" className="plugin-primary-button" onClick={() => { setErrorBanner(null); setAddModalOpen(true); }}><Plus size={16} />{ui.addAccount}</button>
      </div>
      <div className="accounts-notice-card"><Info size={18} /><span>{ui.stopNote}</span></div>
      {errorBanner && <div className="plugins-error-banner" role="alert">{errorBanner}</div>}
      {loading ? <p role="status">{ui.loading}</p> : errorBanner && instances.length === 0 ? null : filtered.length === 0 ? (
        <div className="accounts-empty-view"><Bot size={40} /><p>{query ? ui.noAccountsFound : ui.noAccountsYet}</p></div>
      ) : <div className="accounts-grid">
        {filtered.map(instance => {
          const stateClass = instance.state === 'running' ? 'is-running' : instance.state === 'failed' ? 'is-degraded' : 'is-stopped';
          return <div key={instance.instance_id} className="account-card">
            <div className="account-card-header">
              <div className="account-avatar-box">
                <Bot size={22} className="account-avatar-fallback" />
                <img src={packageIconURL(instance.package_id)} alt="" className="account-avatar-img" onError={event => { event.currentTarget.style.display = 'none'; }} />
              </div>
              <div className="account-header-meta"><span className="account-instance-name font-mono">{instance.instance_id}</span><span className="account-adapter-id font-mono">{instance.adapter_id} ({instance.package_id})</span>{instance.default && <span>{ui.defaultInstance}</span>}</div>
              <span className={`pkg-status-badge ${stateClass}`}><span className={`pkg-status-dot ${stateClass}`} />{instance.state === 'running' ? ui.statusRunning : instance.state === 'failed' ? ui.statusFailed : ui.statusStopped}</span>
            </div>
            {instance.safe_error && <p className="account-safe-error" role="alert">{instance.safe_error}</p>}
            <div className="account-stat-item"><span>{ui.conversationCount}</span><span>{ui.conversationsUnavailable}</span></div>
            <div className="account-card-actions">
              <button type="button" className="account-action-button" disabled={busy} onClick={() => change(instance.state === 'running' ? 'stop' : 'start', instance)}>{instance.state === 'running' ? <Square size={14} /> : <Play size={14} />}{instance.state === 'running' ? ui.actionStop : ui.actionStart}</button>
              <button type="button" className="account-action-button" onClick={() => inspect(instance)}><Eye size={14} />{ui.readConfig}</button>
              <button type="button" className="account-action-button is-danger-text" disabled={busy} onClick={() => change('delete', instance)}><Trash2 size={14} />{ui.actionDelete}</button>
            </div>
          </div>;
        })}
      </div>}

      <Dialog.Root open={addModalOpen} onOpenChange={open => { if (!busy) { if (open) setAddModalOpen(true); else closeAdd(); } }}>
        <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content accounts-dialog-content" aria-describedby={undefined}>
          <div className="dialog-header"><Dialog.Title className="dialog-title">{ui.addAccount}</Dialog.Title><Dialog.Close asChild><button type="button" disabled={busy} className="dialog-close-button" aria-label={ui.close}><X size={16} /></button></Dialog.Close></div>
          {errorBanner && <p className="plugins-error-banner" role="alert">{errorBanner}</p>}
          {adapterPackages.length === 0 ? <p>{ui.adapterRequired}</p> : <div className="dialog-form-body">
            <label className="dialog-form-field">{ui.selectAdapter}<select value={selectedAdapterID} disabled={busy} onChange={event => { setInstanceSchema(null); setSelectedAdapterID(event.target.value); }}>{adapterPackages.map(pkg => <option key={pkg.ID} value={pkg.ID}>{pkg.ID} ({pkg.AdapterID})</option>)}</select></label>
            <label className="dialog-form-field">{ui.instanceName}<input value={instanceName} placeholder={ui.instanceNamePlaceholder} disabled={busy} onChange={event => setInstanceName(event.target.value)} /></label>
            <div className="dialog-schema-form-box">
              {loadingSchema ? <p role="status">{ui.loadingSchema}</p> : instanceSchema ? <fieldset disabled={busy || !instanceName.trim()}>
                <ConfigForm schema={instanceSchema} value={emptyConfig} messages={{}} onSubmit={patch => { if (selectedAdapter) void submitCreate({ package_id: selectedAdapter.ID, instance_id: instanceName.trim(), config: patch }); }} />
              </fieldset> : <p>{ui.noInstanceSchema}</p>}
            </div>
          </div>}
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={configModalOpen} onOpenChange={open => { setConfigModalOpen(open); if (!open) setInspectingConfig(null); }}>
        <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content accounts-dialog-content" aria-describedby={undefined}>
          <div className="dialog-header"><Dialog.Title className="dialog-title">{ui.configTitle}: {inspectingInstanceID}</Dialog.Title><Dialog.Close asChild><button type="button" className="dialog-close-button" aria-label={ui.close}><X size={16} /></button></Dialog.Close></div>
          <pre className="inspect-config-pre font-mono">{JSON.stringify(inspectingConfig, (_key, value: unknown) => isSecretSet(value) ? ui.secretSet : value, 2)}</pre>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={confirmation !== null} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }}>
        <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content accounts-dialog-content" aria-describedby={undefined}>
          <Dialog.Title className="dialog-title">{ui.confirmAffectedTitle}</Dialog.Title>
          <p>{ui.confirmAffectedDesc}</p><ul className="affected-items-list font-mono">{confirmation?.affected.map((item, index) => <li key={index}>{item}</li>)}</ul>
          <div className="dialog-actions"><button type="button" className="dialog-button" disabled={busy} onClick={() => setConfirmation(null)}>{ui.cancel}</button><button type="button" className="dialog-button is-primary" disabled={busy} onClick={() => { if (confirmation) void submitCreate({ ...confirmation.input, confirm: true }); }}>{ui.confirmContinue}</button></div>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
