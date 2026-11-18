import { useCallback, useContext, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ArrowRight, Bot, Check, MoreVertical, Pencil, Plus, Trash2, X } from 'lucide-react';
import { changePackage, getAgentModelUsage, getPluginConfig, listPackages, onPackagesChanged, testAgentModel, type ConfigSnapshot, type Package } from '../api/admin';
import english from '../../i18n/en-US.json';
import { ConfigForm } from '../components/ConfigForm';
import { useUI } from '../i18n/UI';
import { pickLocale } from '../i18n/catalog';
import { navigate } from '../shell/router';
import { SearchContext, type SearchItem } from '../shell/search';
import { buildDefaultModelPatch, buildDeleteModelPatch, checkModelReferences, editingConfig, filterModelsByType, groupModelsByProvider, isGenerationConflict, isMissingModelRoute, modelSchema, modelsForSnapshot, parseProviders, usageByModel, MODEL_TYPES, type ConfiguredModel, type ConfiguredProvider } from './modelConfig';
import { saveModelConfig } from './modelSave';
import { ProviderDialog } from './ProviderDialog';
import { ModelDialog } from './ModelDialog';

type TestState = { testing: boolean; ok?: boolean; duration_ms?: number; description?: string; testedAt?: number };

/** ModelsPage 编辑 Agent 模型配置，并对 Active 连接执行发现、探测与当天用量查询。 */
export function ModelsPage(): JSX.Element {
  const ui = useUI();
  const { register } = useContext(SearchContext);
  const [agent, setAgent] = useState<Package | null>(null);
  const [snapshot, setSnapshot] = useState<ConfigSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hasRoutes, setHasRoutes] = useState(true);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usage, setUsage] = useState(new Map<string, number>());
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [type, setType] = useState('all');
  const [providerDialog, setProviderDialog] = useState<{ provider?: ConfiguredProvider } | null>(null);
  const [editing, setEditing] = useState<ConfiguredModel | null>(null);
  const [deleting, setDeleting] = useState<ConfiguredModel | null>(null);
  const [busy, setBusy] = useState(false);
  const requestRevision = useRef(0);
  const testRevision = useRef(0);
  const snapshotAgent = useRef<string | null>(null);

  const load = useCallback(async () => {
    const revision = ++requestRevision.current;
    setLoading(true);
    ++testRevision.current;
    try {
      const packages = await listPackages();
      if (revision !== requestRevision.current) return;
      const installed = packages.find(pkg => pkg.Role === 'agent' && !pkg.Uninstalled) ?? null;
      setAgent(installed);
      if (snapshotAgent.current !== (installed?.ID ?? null)) {
        snapshotAgent.current = installed?.ID ?? null;
        setSnapshot(null); setProviderDialog(null); setEditing(null); setDeleting(null);
      }
      if (!installed) { setSnapshot(null); setTests({}); return; }
      const next = await getPluginConfig(installed.ID);
      if (revision !== requestRevision.current) return;
      setSnapshot(next);
      ++testRevision.current;
      setTests({});
      setUsage(new Map());
      setUsageError(null);
      try {
        const result = await getAgentModelUsage(installed.ID);
        if (revision !== requestRevision.current) return;
        setHasRoutes(true);
        setUsage(usageByModel(result.models));
      } catch (caught) {
        if (revision !== requestRevision.current) return;
        setHasRoutes(!isMissingModelRoute(caught));
        if (!isMissingModelRoute(caught)) setUsageError(caught instanceof Error ? caught.message : String(caught));
      }
    } catch (caught) {
      if (revision === requestRevision.current) setError(previous => [previous, caught instanceof Error ? caught.message : String(caught)].filter(Boolean).join('\n'));
    } finally { if (revision === requestRevision.current) setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const unsubscribe = onPackagesChanged(() => { setProviderDialog(null); setEditing(null); setDeleting(null); void load(); });
    return () => { unsubscribe(); ++requestRevision.current; ++testRevision.current; };
  }, [load]);

  const schema = useMemo(() => modelSchema(snapshot?.schema), [snapshot?.schema]);
  const value = useMemo(() => snapshot ? editingConfig(snapshot) : {}, [snapshot]);
  const formValue = useMemo(() => Object.fromEntries(Object.keys(schema).map(key => [key, value[key]])), [schema, value]);
  const locale = ui === english.messages ? 'en-US' : 'zh-CN';
  const messages = useMemo(() => {
    const selected = pickLocale(Object.keys(snapshot?.i18n ?? {}), [locale]);
    return { config: snapshot?.i18n[selected] ?? {} };
  }, [snapshot?.i18n, locale]);
  const models = useMemo(() => snapshot ? modelsForSnapshot(snapshot) : [], [snapshot]);
  const visibleModels = Array.from(groupModelsByProvider(filterModelsByType(models, type)).values()).flat();
  const labels = { all: ui.tabAll, chat: ui.tabChat, speech_to_text: ui.tabSpeechToText, text_to_speech: ui.tabTextToSpeech, embedding: ui.tabEmbedding, rerank: ui.tabRerank, decision: ui.tabDecision };

  useEffect(() => {
    const items: SearchItem[] = [];
    if (agent && snapshot && !loading && !busy) {
      items.push({ id: 'models-refresh', title: ui.models + ': ' + ui.refresh, section: ui.searchActions, run: () => { setError(null); void load(); } });
      if (hasRoutes) {
        items.push({ id: 'models-add-provider', title: ui.models + ': ' + ui.addProvider, section: ui.searchActions, run: () => setProviderDialog({}) });
        for (const model of models) items.push({ id: 'model-' + model.name, title: model.name, section: ui.models, keywords: [model.model, model.provider, labels[model.type]], run: () => {
          setType('all');
          requestAnimationFrame(() => document.getElementById('model-' + model.name)?.focus());
        } });
      }
    }
    return register(items);
  }, [agent, snapshot, models, hasRoutes, loading, busy, ui, register, load]);

  const save = async (patch: Record<string, unknown>) => {
    if (!agent || !snapshot) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      if (Object.keys(patch).length === 0) return;
      const next = await saveModelConfig(agent.ID, snapshot, patch, saved => {
        // PATCH 已持久化即卸载含明文的表单；候选失败仍能显示 Pending。
        setProviderDialog(null); setEditing(null); setDeleting(null);
        setSnapshot(previous => previous && (previous.active_generation.startsWith('dev:')
          ? { ...previous, active: saved.config, pending: null }
          : { ...previous, pending: saved }));
      });
      setSnapshot(next);
      setMessage(ui.modelsConfigSaved);
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message : String(caught);
      if (isGenerationConflict(caught)) { setProviderDialog(null); setEditing(null); setDeleting(null); }
      setError(isGenerationConflict(caught) ? `${ui.staleGenerationConflict}\n${reason}` : reason);
    } finally { await load(); setBusy(false); }
  };

  const reload = async () => {
    if (!agent) return;
    setBusy(true); setError(null); setMessage(null);
    try { await changePackage('reload', agent.ID); setMessage(ui.modelsConfigSaved); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { await load(); setBusy(false); }
  };

  const test = async (model: ConfiguredModel) => {
    if (!agent) return;
    if (model.isPending) { setError(ui.pendingReloadNotice); return; }
    const revision = testRevision.current;
    setTests(current => ({ ...current, [model.name]: { testing: true } }));
    try {
      const result = await testAgentModel(agent.ID, model.name);
      if (revision === testRevision.current) setTests(current => ({ ...current, [model.name]: { testing: false, ...result, testedAt: Date.now() } }));
    } catch (caught) {
      if (revision === testRevision.current) setTests(current => ({ ...current, [model.name]: { testing: false, ok: false, description: caught instanceof Error ? caught.message : String(caught), testedAt: Date.now() } }));
    }
  };

  const banners = <>
    {error && <div className="plugins-error-banner" role="alert"><span>{error}</span><button type="button" onClick={() => { setError(null); void load(); }}>{ui.refresh}</button></div>}
    {message && <div className="models-success-banner" role="status">{message}</div>}
    {snapshot?.pending && <div className="models-pending-banner"><span>{ui.modelsPending}</span><button type="button" className="dialog-button" disabled={busy || loading} onClick={() => void reload()}>{ui.reloadAfterSave}</button></div>}
  </>;
  const configEditor = <fieldset disabled={busy || loading} className="models-config-fieldset dialog-schema-form-box">
    <ConfigForm schema={schema} value={formValue} messages={messages} onSubmit={patch => void save(patch)} />
  </fieldset>;

  if (loading && !snapshot) return <div className="shell-empty-view">{banners}<p role="status">{ui.loading}</p></div>;
  if (!agent) return <div className="models-page">{banners}{!error && <div className="models-empty-state"><Bot size={44} /><h2>{ui.noAgentInstalled}</h2><p>{ui.noAgentDesc}</p><button type="button" className="dialog-button is-primary" onClick={() => navigate('/components?tab=store')}>{ui.goToStore}<ArrowRight size={16} /></button></div>}</div>;
  if (!snapshot) return <div className="models-page">{banners}</div>;
  if (!hasRoutes) return <div className="models-page">{banners}<div className="models-fallback-banner" role="status">{ui.noModelManagementRoute}</div>{configEditor}</div>;

  return <div className="models-page" aria-busy={loading || busy}>
    <div className="models-header-bar">
      <div className="models-tabs" role="group" aria-label={ui.modelType}>
        {(['all', ...MODEL_TYPES] as const).map(key => <button key={key} type="button" aria-pressed={type === key} className={`models-tab ${type === key ? 'is-active' : ''}`} onClick={() => setType(key)}>{labels[key]}<span className="models-tab-count font-mono">{key === 'all' ? models.length : models.filter(model => model.type === key).length}</span></button>)}
      </div>
      <button type="button" className="dialog-button is-primary" disabled={busy || loading || !schema.providers} onClick={() => { setError(null); setProviderDialog({}); }}>{ui.addProvider}</button>
    </div>
    {banners}
    {usageError && <p className="plugins-error-banner" role="alert">{ui.usageUnavailable}: {usageError}</p>}
    {visibleModels.length === 0 ? <div className="models-empty-state"><p>{type !== 'all' ? ui.noMatchingModels : ui.noModelsConfigured}</p></div> : <div className="models-card-container">{visibleModels.map(model => {
      const result = tests[model.name];
      const provider = parseProviders(snapshot.active).find(connection => connection.name === model.provider);
      return <div key={model.name} id={'model-' + model.name} tabIndex={-1} className="model-row-item">
        <div className="model-avatar">{model.provider.charAt(0).toUpperCase()}</div>
        <div className="model-meta"><div className="model-title-line"><span className="model-name">{model.name}</span>{model.type === 'chat' && value.chat_model === model.name && <span className="model-default-badge">{ui.defaultBadge}</span>}{model.isPending && <span className="model-pending-badge">{ui.modelsPendingBadge}</span>}</div>
          <div className="model-subtitle"><span>{model.provider}</span><span>·</span><span>{labels[model.type]}</span>{model.image_input && model.type === 'chat' && <><span>·</span><span>{ui.capabilitiesVision}</span></>}</div>
          {model.model !== model.name && <div className="model-remote-id font-mono" title={ui.remoteModelId}>{model.model}</div>}
        </div>
        <div className={'model-status-col' + (result?.ok === false ? ' is-failed' : result?.ok ? ' is-success' : '')} role="status">
          {result && <><span className="model-status-dot" /><span>{result.testing ? ui.testing : result.ok ? ui.testSuccess : ui.testFailed}</span>
            {result.duration_ms !== undefined && <span> · {ui.modelDuration.replace('{ms}', new Intl.NumberFormat(locale).format(result.duration_ms))}</span>}
            {result.testedAt !== undefined && <span> · <time dateTime={new Date(result.testedAt).toISOString()}>{ui.testedAt.replace('{time}', new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(result.testedAt))}</time></span>}
            {result.description && <div className="model-test-description">{result.description}</div>}
          </>}
        </div>
        <div className="model-usage-col">{usageError ? ui.usageUnavailable : usage.has(model.name) ? ui.todayUsage.replace('{tokens}', new Intl.NumberFormat(locale).format(usage.get(model.name)!)) : ui.noUsageRecorded}</div>
        <div className="model-actions-col"><button type="button" className="model-test-button" disabled={busy || loading || result?.testing || model.isPending} title={model.isPending ? ui.pendingReloadNotice : undefined} onClick={() => void test(model)}>{ui.testModel}</button>
          <DropdownMenu.Root><DropdownMenu.Trigger asChild><button type="button" className="model-more-button" disabled={busy || loading} aria-label={ui.actions}><MoreVertical size={16} /></button></DropdownMenu.Trigger>
            <DropdownMenu.Portal><DropdownMenu.Content className="dropdown-menu-content" align="end">
              <DropdownMenu.Item className="dropdown-menu-item" onSelect={() => { setError(null); setEditing(model); }}><Pencil size={14} />{ui.editModel}</DropdownMenu.Item>
              {provider && <DropdownMenu.Item className="dropdown-menu-item" onSelect={() => { setError(null); setProviderDialog({ provider }); }}><Plus size={14} />{ui.addModels}</DropdownMenu.Item>}
              {model.type === 'chat' && <DropdownMenu.Item className="dropdown-menu-item" disabled={value.chat_model === model.name} onSelect={() => { void save(buildDefaultModelPatch(snapshot, model.name)); }}><Check size={14} />{ui.setDefaultModel}</DropdownMenu.Item>}
              <DropdownMenu.Item className="dropdown-menu-item is-danger" onSelect={() => { setError(null); setDeleting(model); }}><Trash2 size={14} />{ui.deleteModel}</DropdownMenu.Item>
            </DropdownMenu.Content></DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>;
    })}</div>}
    {providerDialog && <ProviderDialog key={agent.ID} agentId={agent.ID} snapshot={snapshot} messages={messages} provider={providerDialog.provider} busy={busy} error={error} onClose={() => setProviderDialog(null)} onSave={save} />}
    {editing && <ModelDialog key={editing.name} model={editing} snapshot={snapshot} busy={busy} error={error} onClose={() => setEditing(null)} onSave={save} />}
    <Dialog.Root open={deleting !== null} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content model-delete-dialog" aria-describedby={undefined}>
      <div className="dialog-header"><Dialog.Title className="dialog-title">{ui.deleteModelConfirmTitle}</Dialog.Title><Dialog.Close asChild><button type="button" className="dialog-close-button" disabled={busy} aria-label={ui.close}><X size={16} /></button></Dialog.Close></div>
      <p className="font-mono">{deleting?.name} ({deleting?.model})</p>
      {deleting && checkModelReferences(deleting.name, value).length > 0 && <div className="model-reference-alert" role="alert"><p>{ui.deleteModelReferencedWarning}</p><ul className="font-mono">{checkModelReferences(deleting.name, value).map(location => <li key={location}>{location}</li>)}</ul></div>}
      {error && <p className="plugins-error-banner" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="dialog-button" disabled={busy} onClick={() => setDeleting(null)}>{ui.cancel}</button><button type="button" className="dialog-button is-danger" disabled={busy || loading} onClick={() => {
        if (!deleting) return;
        try { void save(buildDeleteModelPatch(snapshot, deleting.name)); }
        catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
      }}>{ui.deleteModelConfirm}</button></div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
