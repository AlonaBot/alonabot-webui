import { useContext, useEffect, useState, type JSX } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Bot, Check, Eye, Plus, RefreshCw, Send, Trash2, X } from 'lucide-react';
import {
  assignInstanceProfile, changeInstance, createInstance, getInstanceConfig, getInstanceSchema,
  getProfileAssignments, isConfirmationError, listChats, listInstances, listPackages, listProfiles,
  pruneInstanceConfig, type AdapterInstance, type Chat, type Correction, type Package, type Profile, type ProfileAssignments,
} from '../api/admin';
import { ConfigForm } from '../components/ConfigForm';
import { useUI } from '../i18n/UI';
import { isSecretSet } from '../schema/patch';
import { SearchContext } from '../shell/search';
import { accountChats, chatProfile } from './accountState';

const emptyConfig: Record<string, unknown> = {};
const pageSize = 12;
type CreateInput = Parameters<typeof createInstance>[0];
type Creation = { input: CreateInput; profile: string };

function AdapterIcon({ adapterID }: { adapterID: string }): JSX.Element {
  return adapterID === 'telegram' ? <Send size={26} aria-hidden="true" /> : <Bot size={26} aria-hidden="true" />;
}

/** AccountsPage 管理 Core 配置中的账号，操作后读取实际运行状态。 */
export function AccountsPage(): JSX.Element {
  const ui = useUI();
  const { register } = useContext(SearchContext);
  const [instances, setInstances] = useState<AdapterInstance[]>([]);
  const [adapterPackages, setAdapterPackages] = useState<Package[]>([]);
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<ProfileAssignments | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedAdapterID, setSelectedAdapterID] = useState('');
  const selectedAdapter = adapterPackages.find(pkg => pkg.ID === selectedAdapterID);
  const [instanceName, setInstanceName] = useState('');
  const [selectedProfile, setSelectedProfile] = useState('default');
  const [instanceSchema, setInstanceSchema] = useState<unknown | null>(null);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [inspectingConfig, setInspectingConfig] = useState<Record<string, unknown> | null>(null);
  const [inspectingInstanceID, setInspectingInstanceID] = useState('');
  const [inspectingAdapterID, setInspectingAdapterID] = useState('');
  const [inspectingCorrections, setInspectingCorrections] = useState<Correction[]>([]);
  const [inspectingUnknown, setInspectingUnknown] = useState<string[]>([]);
  const [confirmPrune, setConfirmPrune] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [pruneError, setPruneError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ affected: string[]; creation: Creation } | null>(null);
  const [chatInstance, setChatInstance] = useState<AdapterInstance | null>(null);
  const [chatQuery, setChatQuery] = useState('');
  const [chatPage, setChatPage] = useState(1);

  const loadData = async () => {
    setLoading(true);
    const errors: string[] = [];
    const results = await Promise.allSettled([listPackages(), listInstances(), listChats(), listProfiles(), getProfileAssignments()]);
    const [packages, configured, directory, profileList, profileAssignments] = results;
    if (packages.status === 'fulfilled') {
      const adapters = packages.value.filter(pkg => pkg.Role === 'adapter' && !pkg.Uninstalled);
      setAdapterPackages(adapters);
      setSelectedAdapterID(previous => adapters.some(pkg => pkg.ID === previous) ? previous : adapters[0]?.ID ?? '');
    }
    if (configured.status === 'fulfilled') setInstances(configured.value);
    setChats(directory.status === 'fulfilled' ? directory.value : null);
    setProfiles(profileList.status === 'fulfilled' ? profileList.value : []);
    setAssignments(profileAssignments.status === 'fulfilled' ? profileAssignments.value : null);
    for (const result of results) {
      if (result.status === 'rejected') errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
    if (errors.length) setErrorBanner(previous => [previous, ...errors].filter(Boolean).join('\n'));
    setLoading(false);
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
    setSelectedProfile('default');
    setConfirmation(null);
  };

  const submitCreate = async (creation: Creation) => {
    setBusy(true);
    setErrorBanner(null);
    let created = false;
    try {
      await createInstance(creation.input);
      created = true;
      await assignInstanceProfile(creation.input.instance_id, creation.profile);
      closeAdd();
      await loadData();
    } catch (error) {
      if (!created && isConfirmationError(error)) {
        setConfirmation({ affected: error.affected, creation });
      } else {
        if (created) closeAdd();
        setConfirmation(null);
        const message = error instanceof Error ? error.message : String(error);
        setErrorBanner(created ? `${ui.accountProfileFailed.replace('{instance}', creation.input.instance_id)}\n${message}` : message);
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
      setInspectingAdapterID(instance.adapter_id);
      setInspectingCorrections(result.corrections);
      setInspectingUnknown(result.unknown);
      setConfigModalOpen(true);
    } catch (error) { setErrorBanner(error instanceof Error ? error.message : String(error)); }
  };

  const handlePruneInstanceConfig = async () => {
    if (!inspectingAdapterID || !inspectingInstanceID) return;
    setPruning(true); setPruneError(null);
    try {
      await pruneInstanceConfig(inspectingAdapterID, inspectingInstanceID);
      const refreshed = await getInstanceConfig(inspectingAdapterID, inspectingInstanceID);
      setInspectingConfig(refreshed.config);
      setInspectingCorrections(refreshed.corrections);
      setInspectingUnknown(refreshed.unknown);
    } catch (error) {
      setPruneError(error instanceof Error ? error.message : String(error));
    } finally {
      setPruning(false);
    }
  };

  const adapterName = (adapterID: string) => adapterID === 'telegram' ? ui.adapterTelegram : adapterID === 'onebot11' ? ui.adapterOneBot : adapterID;
  const profileName = (id: string) => id === 'default' ? ui.defaultProfile : profiles.find(profile => profile.id === id)?.name ?? id;
  const instanceMessages = { config: selectedAdapter?.AdapterID === 'telegram' ? {
    token: { description: ui.botToken }, api_base_url: { description: ui.apiBaseURL },
    proxy_mode: { description: ui.proxyMode }, proxy: { description: ui.proxyURL },
  } : selectedAdapter?.AdapterID === 'onebot11' ? {
    ws_url: { description: ui.webSocketURL }, access_token: { description: ui.accessToken }, mode: { description: ui.connectionMode },
  } : {} };
  const filtered = instances.filter(instance =>
    [instance.instance_id, instance.adapter_id, instance.package_id].some(value => value.toLowerCase().includes(query.toLowerCase())),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visibleChats = chatInstance && chats ? accountChats(chats, chatInstance.instance_id).filter(chat =>
    [chat.title, chat.session].some(value => value.toLowerCase().includes(chatQuery.toLowerCase()))) : [];
  const chatPages = Math.max(1, Math.ceil(visibleChats.length / pageSize));
  const currentChatPage = Math.min(chatPage, chatPages);

  const chatRow = (chat: Chat) => <li key={chat.session} className="account-chat-row">
    <span title={chat.session}>{chat.title || chat.session}</span>
    {assignments && <span className="account-profile-name">{profileName(chatProfile(assignments, chat.instance_id, chat.session))}</span>}
  </li>;

  const pagination = (current: number, count: number, select: (value: number) => void) => count > 1 && <nav className="accounts-pagination" aria-label={ui.pagination}>
    <button type="button" disabled={current === 1} onClick={() => select(current - 1)}>{ui.paginationPrev}</button>
    {Array.from({ length: count }, (_, index) => <button key={index} type="button" aria-current={current === index + 1 ? 'page' : undefined} onClick={() => select(index + 1)}>{index + 1}</button>)}
    <button type="button" disabled={current === count} onClick={() => select(current + 1)}>{ui.paginationNext}</button>
  </nav>;

  return (
    <div className="accounts-page">
      <div className="accounts-topbar">
        <input aria-label={ui.searchAccounts} placeholder={ui.searchAccounts} value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} />
        <button type="button" className="overview-refresh-button" aria-label={ui.refresh} disabled={loading || busy} onClick={() => { setErrorBanner(null); void loadData(); }}><RefreshCw size={16} /></button>
      </div>
      {errorBanner && <div className="plugins-error-banner" role="alert">{errorBanner}</div>}
      {loading ? <p role="status">{ui.loading}</p> : <>
        {filtered.length === 0 && query && <p>{ui.noAccountsFound}</p>}
        <div className="accounts-grid">
          {filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(instance => {
            const stateClass = instance.state === 'running' ? 'is-running' : instance.state === 'failed' ? 'is-degraded' : 'is-stopped';
            const instanceChats = chats && accountChats(chats, instance.instance_id);
            return <article key={instance.instance_id} className="account-card">
              <div className="account-card-header">
                <div className="account-avatar-box"><AdapterIcon adapterID={instance.adapter_id} /></div>
                <div className="account-header-meta"><span className="account-instance-name">{instance.instance_id}</span><span className="account-adapter-id" title={`${instance.adapter_id} (${instance.package_id})`}>{adapterName(instance.adapter_id)}{instance.default && <span className="account-default-instance">{ui.defaultInstance}</span>}</span></div>
                <label className="plugin-switch-label" title={ui.stopNote}>
                  <input type="checkbox" role="switch" checked={instance.state === 'running'} disabled={busy}
                    aria-label={`${instance.instance_id}: ${instance.state === 'running' ? ui.actionStop : ui.actionStart}. ${ui.stopNote}`}
                    onChange={event => void change(event.target.checked ? 'start' : 'stop', instance)} />
                  <span className="plugin-switch-slider" />
                </label>
              </div>
              {instanceChats && <div className="account-chat-summary">
                {instanceChats.length ? <ul>{instanceChats.slice(0, 3).map(chatRow)}</ul> : <p className="account-no-chats">{ui.noAccountChats}</p>}
                <button type="button" className="account-all-chats" onClick={() => { setChatInstance(instance); setChatQuery(''); setChatPage(1); }}>{ui.allAccountChats.replace('{count}', String(instanceChats.length))}</button>
              </div>}
              {instance.safe_error && <p className="account-safe-error" role="alert">{instance.safe_error}</p>}
              <div className="account-card-footer">
                <div className="account-card-actions">
                  <button type="button" className="account-action-button" aria-label={ui.readConfig} title={ui.readConfig} onClick={() => void inspect(instance)}><Eye size={16} /></button>
                  <button type="button" className="account-action-button is-danger-text" aria-label={ui.actionDelete} title={ui.actionDelete} disabled={busy} onClick={() => void change('delete', instance)}><Trash2 size={16} /></button>
                </div>
                <span className={`pkg-status-badge ${stateClass}`}><span className={`pkg-status-dot ${stateClass}`} />{instance.state === 'running' ? ui.statusRunning : instance.state === 'failed' ? ui.statusFailed : ui.statusStopped}</span>
              </div>
            </article>;
          })}
          <button type="button" className="account-add-card" onClick={() => { setErrorBanner(null); setAddModalOpen(true); }}><Plus size={24} /><span>{ui.addAccount}</span></button>
        </div>
        {pagination(currentPage, pages, setPage)}
      </>}

      <Dialog.Root open={addModalOpen} onOpenChange={open => { if (!busy) { if (open) setAddModalOpen(true); else closeAdd(); } }}>
        <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content accounts-dialog-content accounts-add-dialog" aria-describedby={undefined}>
          <div className="dialog-header"><Dialog.Title className="dialog-title">{ui.addBotAccount}</Dialog.Title><Dialog.Close asChild><button type="button" disabled={busy} className="dialog-close-button" aria-label={ui.close}><X size={20} /></button></Dialog.Close></div>
          {errorBanner && <p className="plugins-error-banner" role="alert">{errorBanner}</p>}
          {adapterPackages.length === 0 ? <p>{ui.adapterRequired}</p> : <div className="dialog-form-body">
            <div className="account-adapter-choices" role="group" aria-label={ui.selectAdapter}>
              {adapterPackages.map(pkg => <button type="button" key={pkg.ID} className="account-adapter-choice" aria-pressed={selectedAdapterID === pkg.ID} disabled={busy}
                onClick={() => { if (selectedAdapterID !== pkg.ID) { setInstanceSchema(null); setSelectedAdapterID(pkg.ID); } }}><AdapterIcon adapterID={pkg.AdapterID} /><span>{adapterName(pkg.AdapterID)}</span>{selectedAdapterID === pkg.ID && <Check size={20} />}</button>)}
            </div>
            <label className="dialog-form-field">{ui.instanceName}<input value={instanceName} placeholder={ui.instanceNamePlaceholder} disabled={busy} onChange={event => setInstanceName(event.target.value)} /></label>
            <div className="dialog-schema-form-box">
              {loadingSchema ? <p role="status">{ui.loadingSchema}</p> : instanceSchema ? <fieldset disabled={busy}>
                {/* 实例选项端点要求实例已存在，创建前沿用表单的普通文本输入。 */}
                <ConfigForm schema={instanceSchema} value={emptyConfig} messages={instanceMessages} onSubmit={patch => { if (selectedAdapter && instanceName.trim()) void submitCreate({ input: { package_id: selectedAdapter.ID, instance_id: instanceName.trim(), config: patch }, profile: selectedProfile }); }}
                  footer={<>
                    <label className="dialog-form-field">{ui.configProfile}<select value={selectedProfile} disabled={profiles.length === 0} onChange={event => setSelectedProfile(event.target.value)}>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profileName(profile.id)}</option>)}</select></label>
                    <div className="dialog-actions"><button type="button" className="dialog-button" disabled={busy} onClick={closeAdd}>{ui.cancel}</button><button type="submit" className="dialog-button is-primary" disabled={busy || !instanceName.trim() || !profiles.some(profile => profile.id === selectedProfile)}>{ui.add}</button></div>
                  </>} />
              </fieldset> : <p>{ui.noInstanceSchema}</p>}
            </div>
          </div>}
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={chatInstance !== null} onOpenChange={open => { if (!open) setChatInstance(null); }}>
        <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content accounts-dialog-content accounts-chats-dialog" aria-describedby={undefined}>
          <div className="dialog-header"><Dialog.Title className="dialog-title">{ui.accountChatsTitle.replace('{instance}', chatInstance?.instance_id ?? '')}</Dialog.Title><Dialog.Close asChild><button type="button" className="dialog-close-button" aria-label={ui.close}><X size={20} /></button></Dialog.Close></div>
          <input aria-label={ui.searchChats} placeholder={ui.searchChats} value={chatQuery} onChange={event => { setChatQuery(event.target.value); setChatPage(1); }} />
          <ul className="account-chat-list">{visibleChats.slice((currentChatPage - 1) * pageSize, currentChatPage * pageSize).map(chatRow)}</ul>
          {visibleChats.length === 0 && <p>{ui.noAccountChats}</p>}
          {pagination(currentChatPage, chatPages, setChatPage)}
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={confirmPrune} onOpenChange={setConfirmPrune}>
        <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content">
          <Dialog.Title>{ui.pruneConfig}</Dialog.Title><Dialog.Description>{ui.pruneConfigConfirm}</Dialog.Description>
          <ul>{inspectingUnknown.map(path => <li key={path}><code>{path}</code></li>)}</ul>
          <div className="dialog-actions"><button type="button" onClick={() => setConfirmPrune(false)}>{ui.cancel}</button><button type="button" onClick={() => { setConfirmPrune(false); void handlePruneInstanceConfig(); }}>{ui.confirm}</button></div>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={configModalOpen} onOpenChange={open => {
        setConfigModalOpen(open);
        if (!open) {
          setInspectingConfig(null);
          setInspectingCorrections([]);
          setInspectingUnknown([]);
        }
      }}>
        <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content accounts-dialog-content" aria-describedby={undefined}>
          <div className="dialog-header"><Dialog.Title className="dialog-title">{ui.configTitle}: {inspectingInstanceID}</Dialog.Title><Dialog.Close asChild><button type="button" className="dialog-close-button" aria-label={ui.close}><X size={16} /></button></Dialog.Close></div>

          {pruneError && <p role="alert">{pruneError}</p>}
          {inspectingCorrections.length > 0 && (
            <div className="config-diagnostics-alert is-warning">
              <p><strong>{ui.corrections}</strong> ({inspectingCorrections.length})</p>
              <ul className="diagnostics-list font-mono">
                {inspectingCorrections.map((c, i) => (
                  <li key={i}>{c.path}: {ui[c.reason]}{c.original !== undefined ? ` (${JSON.stringify(c.original)})` : ''}</li>
                ))}
              </ul>
            </div>
          )}

          {inspectingUnknown.length > 0 && (
            <div className="config-diagnostics-alert is-danger">
              <div className="config-diagnostics-heading">
                <p><strong>{ui.unknownKeys}</strong> ({inspectingUnknown.length})</p>
                <button
                  type="button"
                  className="dialog-button is-primary"
                  disabled={pruning}
                  onClick={() => setConfirmPrune(true)}
                >
                  {pruning ? ui.loading : ui.pruneConfig}
                </button>
              </div>
              <ul className="diagnostics-list font-mono">
                {inspectingUnknown.map((k, i) => (
                  <li key={i}>{k}</li>
                ))}
              </ul>
            </div>
          )}

          <pre className="inspect-config-pre font-mono">{JSON.stringify(inspectingConfig, (_key, value: unknown) => isSecretSet(value) ? ui.secretSet : value, 2)}</pre>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={confirmation !== null} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }}>
        <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content accounts-dialog-content" aria-describedby={undefined}>
          <Dialog.Title className="dialog-title">{ui.confirmAffectedTitle}</Dialog.Title>
          <p>{ui.confirmAffectedDesc}</p><ul className="affected-items-list font-mono">{confirmation?.affected.map((item, index) => <li key={index}>{item}</li>)}</ul>
          <div className="dialog-actions"><button type="button" className="dialog-button" disabled={busy} onClick={() => setConfirmation(null)}>{ui.cancel}</button><button type="button" className="dialog-button is-primary" disabled={busy} onClick={() => { if (confirmation) void submitCreate({ ...confirmation.creation, input: { ...confirmation.creation.input, confirm: true } }); }}>{ui.confirmContinue}</button></div>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
