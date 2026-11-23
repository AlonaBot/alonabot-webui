import { useContext, useEffect, useMemo, useState, type JSX } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bot, Check, Download, ListChecks, MoreVertical, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { getAgentModelUsage, testAgentModel } from '../../api/agent';
import { getPluginConfig, type ConfigSnapshot } from '../../api/config';
import { changePackage } from '../../api/packages';
import english from '../../../i18n/en-US.json';
import { ConfigForm } from '../../components/ConfigForm';
import { useUI } from '../../i18n/UI';
import { pickLocale } from '../../i18n/catalog';
import { buildDefaultModelPatch, buildDeleteModelPatch, checkModelReferences, editingConfig, filterModelsByType, groupModelsByProvider, isGenerationConflict, isMissingModelRoute, modelSchema, modelsForSnapshot, parseProviders, usageByModel, MODEL_TYPES, type ConfiguredModel, type ConfiguredProvider } from '../../pages/modelConfig';
import { ModelPickerDialog } from './ModelPickerDialog';
import { saveModelConfig } from '../../pages/modelSave';
import { installed, usePackages } from '../../queries/packages';
import { PageHeader } from '../../shell/PageHeader';
import { SearchContext, type SearchItem } from '../../shell/search';
import { Button } from '../../ui/Button';
import { ConfirmDialog } from '../../ui/Dialog';
import { EmptyState, Skeleton } from '../../ui/EmptyState';
import { Menu, MenuItem, MenuSeparator } from '../../ui/Menu';
import { TabBar } from '../../ui/Tabs';
import { toast } from '../../ui/toast';
import { Tooltip } from '../../ui/Tooltip';
import { usePackageActions } from '../plugins/usePackageActions';
import { ModelDialog } from './ModelDialog';
import { ProviderDialog } from './ProviderDialog';
import styles from './Models.module.css';

const officialAgent = 'AlonaBot/alonabot-agent';
type TestState = { testing: boolean; ok?: boolean; duration_ms?: number; description?: string };

/**
 * 模型：Agent 的提供商与模型配置、连接测试与当天用量。
 * 没有 Agent 或 Agent 未启用时，页面直接给出安装或启用入口。
 */
export function ModelsPage(): JSX.Element {
  const ui = useUI();
  const client = useQueryClient();
  const { register } = useContext(SearchContext);
  const actions = usePackageActions();
  const packages = usePackages();
  const agent = installed(packages.data).find(item => item.Role === 'agent');
  const ready = !!agent?.Enabled;
  const config = useQuery({ queryKey: ['plugin-config', agent?.ID], queryFn: () => getPluginConfig(agent!.ID), enabled: ready });
  const usage = useQuery({ queryKey: ['model-usage', agent?.ID], queryFn: () => getAgentModelUsage(agent!.ID), enabled: ready && !!config.data, retry: false });
  const snapshot = config.data;
  const hasRoutes = !(usage.error && isMissingModelRoute(usage.error));
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [type, setType] = useState('all');
  const [providerDialog, setProviderDialog] = useState<{ provider?: ConfiguredProvider; deleting?: boolean } | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [editing, setEditing] = useState<ConfiguredModel | null>(null);
  const [deleting, setDeleting] = useState<ConfiguredModel | null>(null);
  const [busy, setBusy] = useState(false);

  const schema = useMemo(() => modelSchema(snapshot?.schema), [snapshot?.schema]);
  const value = useMemo(() => snapshot ? editingConfig(snapshot) : {}, [snapshot]);
  const formValue = useMemo(() => Object.fromEntries(Object.keys(schema).map(key => [key, value[key]])), [schema, value]);
  const locale = ui === english.messages ? 'en-US' : 'zh-CN';
  const messages = useMemo(() => ({ config: snapshot?.i18n[pickLocale(Object.keys(snapshot?.i18n ?? {}), [locale])] ?? {} }), [snapshot?.i18n, locale]);
  const models = useMemo(() => snapshot ? modelsForSnapshot(snapshot) : [], [snapshot]);
  const grouped = groupModelsByProvider(filterModelsByType(models, type));
  const providers = snapshot ? parseProviders(editingConfig(snapshot)) : [];
  // 「全部」下也列出还没有模型的提供商，按类型筛选时只列有匹配模型的。
  const sections = providers.filter(provider => type === 'all' || grouped.has(provider.name));
  const pickingProvider = providers.find(provider => provider.name === picking);
  const used = useMemo(() => usageByModel(usage.data?.models ?? []), [usage.data]);
  const labels = { all: ui.tabAll, chat: ui.tabChat, speech_to_text: ui.tabSpeechToText, text_to_speech: ui.tabTextToSpeech, embedding: ui.tabEmbedding, rerank: ui.tabRerank, decision: ui.tabDecision };
  const counts = Object.fromEntries(['all', ...MODEL_TYPES].map(key => [key, filterModelsByType(models, key).length]));

  useEffect(() => {
    const items: SearchItem[] = [];
    if (snapshot && hasRoutes) {
      items.push({ id: 'models-add-provider', title: ui.addProvider, section: ui.searchActions, icon: Plus, run: () => setProviderDialog({}) });
      for (const model of models) items.push({ id: 'models-' + model.name, title: model.name, section: ui.models, context: `${model.provider} · ${labels[model.type]}`, keywords: [model.model, model.provider], run: () => setType('all') });
    }
    return register(items);
  }, [snapshot, models, hasRoutes, ui, register]);

  const closeDialogs = () => { setProviderDialog(null); setPicking(null); setEditing(null); setDeleting(null); };

  /** 保存补丁：PATCH 成功即关闭表单（含明文的密钥不再留在页面上），随后重载使其生效。 */
  const save = async (patch: Record<string, unknown>, addedProvider?: string) => {
    if (!agent || !snapshot || Object.keys(patch).length === 0) return;
    setBusy(true);
    try {
      const next = await saveModelConfig(agent.ID, snapshot, patch, saved => {
        closeDialogs();
        // 保存后马上重载生效，先按已生效显示，避免「待生效」提示条和徽标闪现一次。
        client.setQueryData<ConfigSnapshot>(['plugin-config', agent.ID], previous => previous && { ...previous, active: saved.config, pending: null });
      });
      client.setQueryData(['plugin-config', agent.ID], next);
      setTests({});
      toast.success(ui.modelsConfigSaved);
      // 新提供商保存后直接进入模型选择。
      if (addedProvider) setPicking(addedProvider);
    } catch (error) {
      if (isGenerationConflict(error)) { closeDialogs(); toast.error(error, ui.staleGenerationConflict); }
      else toast.error(error);
    } finally {
      setBusy(false);
      void client.invalidateQueries({ queryKey: ['plugin-config', agent.ID] });
      void client.invalidateQueries({ queryKey: ['model-usage', agent.ID] });
    }
  };

  const apply = async () => {
    if (!agent) return;
    setBusy(true);
    try { await changePackage('reload', agent.ID); toast.success(ui.modelsConfigSaved); }
    catch (error) { toast.error(error); }
    finally { setBusy(false); void client.invalidateQueries({ queryKey: ['plugin-config', agent.ID] }); }
  };

  const test = async (model: ConfiguredModel) => {
    if (!agent) return;
    setTests(current => ({ ...current, [model.name]: { testing: true } }));
    try {
      const result = await testAgentModel(agent.ID, model.name);
      setTests(current => ({ ...current, [model.name]: { testing: false, ...result } }));
    } catch (error) {
      setTests(current => ({ ...current, [model.name]: { testing: false, ok: false, description: error instanceof Error ? error.message : String(error) } }));
    }
  };

  if (packages.isPending) return <div className={styles.list}><Skeleton height={64} /><Skeleton height={64} /></div>;
  if (!agent) return <EmptyState icon={<Bot size={22} />} title={ui.noAgentInstalled} description={ui.noAgentDesc}
    action={<Button variant="primary" icon={<Download size={16} />} loading={actions.busy.has(officialAgent)} onClick={() => void actions.install({ Source: officialAgent })}>{ui.installAgent}</Button>} />;
  if (!agent.Enabled) return <>
    <EmptyState icon={<Power size={22} />} title={ui.agentDisabledTitle} description={ui.agentDisabledDesc}
      action={<Button variant="primary" icon={<Power size={16} />} loading={actions.busy.has(agent.ID)} onClick={() => void actions.toggle(agent)}>{ui.enableAgent}</Button>} />
    {actions.dialogs}
  </>;
  if (config.isError) return <EmptyState tone="error" icon={<AlertTriangle size={22} />} title={ui.modelsLoadFailed} description={config.error.message}
    action={<Button variant="primary" onClick={() => void config.refetch()}>{ui.retry}</Button>} />;
  if (!snapshot) return <div className={styles.list}><Skeleton height={64} /><Skeleton height={64} /></div>;

  const configEditor = <fieldset disabled={busy} className={styles.fieldset}>
    <ConfigForm schema={schema} value={formValue} messages={messages} onSubmit={patch => void save(patch)} />
  </fieldset>;

  return <>
    <PageHeader
      left={hasRoutes ? <TabBar variant="pill" value={type} onValueChange={setType} aria-label={ui.modelType}
        items={(['all', ...MODEL_TYPES] as const).map(key => ({ value: key, label: labels[key], count: counts[key] }))} /> : undefined}
      right={hasRoutes ? <>
        <Button variant="primary" icon={<Plus size={16} />} disabled={busy || !schema.providers} onClick={() => setProviderDialog({})}>{ui.addProvider}</Button>
      </> : undefined} />

    {snapshot.pending && <div className={styles.pending} role="status">
      <span>{ui.modelsPending}</span>
      <Button size="sm" variant="soft" loading={busy} onClick={() => void apply()}>{ui.applyChanges}</Button>
    </div>}

    {!hasRoutes ? <><p className={styles.hint}>{ui.noModelManagementRoute}</p>{configEditor}</>
      : sections.length === 0 ? <EmptyState icon={<Bot size={22} />} title={type !== 'all' ? ui.noMatchingModels : ui.noModelsConfigured}
        description={type === 'all' ? ui.noModelsHint : undefined}
        action={type === 'all' ? <Button variant="primary" icon={<Plus size={16} />} onClick={() => setProviderDialog({})}>{ui.addProvider}</Button> : undefined} />
      : <div className={styles.sections}>{sections.map(provider => {
        const rows = grouped.get(provider.name) ?? [];
        return <section key={provider.name} className={styles.provider}>
          <header className={styles.providerHead}>
            <div className={styles.avatar}>{provider.name.charAt(0).toUpperCase()}</div>
            <div className={styles.meta}>
              <div className={styles.name}><span>{provider.name}</span></div>
              <div className={styles.sub}><span className={styles.url}>{provider.base_url}</span> · {ui.modelCount.replace('{count}', String(rows.length))}</div>
            </div>
            <Button variant="soft" icon={<ListChecks size={16} />} disabled={busy || !!snapshot.pending} onClick={() => setPicking(provider.name)}>{ui.manageModels}</Button>
            <Menu align="end" trigger={<Button variant="ghost" iconOnly aria-label={ui.actions} disabled={busy}><MoreVertical size={18} /></Button>}>
              <MenuItem icon={<Pencil size={16} />} onSelect={() => setProviderDialog({ provider })}>{ui.editConnection}</MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Trash2 size={16} />} tone="danger" onSelect={() => setProviderDialog({ provider, deleting: true })}>{ui.deleteProvider}</MenuItem>
            </Menu>
          </header>
          {rows.length === 0 ? <p className={styles.providerEmpty}>{ui.providerNoModels}</p> : rows.map(model => {
            const result = tests[model.name];
            return <div key={model.name} className={styles.row}>
              <div className={styles.meta}>
                <div className={styles.name}>
                  <span>{model.name}</span>
                  {model.type === 'chat' && value.chat_model === model.name && <span className={styles.badge}>{ui.defaultBadge}</span>}
                  {model.isPending && <span className={styles.badge} data-tone="warning">{ui.pendingBadge}</span>}
                </div>
                <div className={styles.sub}>{[model.name !== model.model ? model.model : null, labels[model.type], model.image_input && model.type === 'chat' ? ui.capabilitiesVision : null].filter(Boolean).join(' · ')}</div>
              </div>
              <Tooltip content={result?.description}><div className={styles.status} data-tone={result?.testing ? undefined : result?.ok ? 'ok' : result ? 'failed' : undefined}>
                {result && <>
                  <span className={styles.dot} />
                  {result.testing ? ui.testing : result.ok ? ui.testSuccess : ui.testFailed}
                  {result.duration_ms !== undefined && ` · ${ui.modelDuration.replace('{ms}', new Intl.NumberFormat(locale).format(result.duration_ms))}`}
                  {!result.testing && !result.ok && result.description && ` · ${result.description}`}
                </>}
              </div></Tooltip>
              <div className={styles.usage}>{usage.isError ? ui.usageUnavailable : ui.todayUsage.replace('{tokens}', new Intl.NumberFormat(locale, { notation: 'compact' }).format(used.get(model.name) ?? 0))}</div>
              <Button size="sm" loading={result?.testing} disabled={busy || model.isPending} onClick={() => void test(model)}>{ui.testConnection}</Button>
              <Menu align="end" trigger={<Button variant="ghost" iconOnly size="sm" aria-label={ui.actions} disabled={busy}><MoreVertical size={16} /></Button>}>
                <MenuItem icon={<Pencil size={16} />} onSelect={() => setEditing(model)}>{ui.editModel}</MenuItem>
                {model.type === 'chat' && <MenuItem icon={<Check size={16} />} disabled={value.chat_model === model.name} onSelect={() => void save(buildDefaultModelPatch(snapshot, model.name))}>{ui.setDefaultModel}</MenuItem>}
                <MenuSeparator />
                <MenuItem icon={<Trash2 size={16} />} tone="danger" onSelect={() => setDeleting(model)}>{ui.deleteModel}</MenuItem>
              </Menu>
            </div>;
          })}
        </section>;
      })}</div>}

    {providerDialog && <ProviderDialog snapshot={snapshot} messages={messages} provider={providerDialog.provider} deleting={providerDialog.deleting} busy={busy} onClose={() => setProviderDialog(null)} onSave={save} />}
    {pickingProvider && <ModelPickerDialog agentId={agent.ID} snapshot={snapshot} provider={pickingProvider} busy={busy} onClose={() => setPicking(null)} onSave={patch => save(patch)} />}
    {editing && <ModelDialog key={editing.name} model={editing} snapshot={snapshot} busy={busy} error={null} onClose={() => setEditing(null)} onSave={save} />}
    {deleting && <ConfirmDialog open tone="danger" pending={busy} onOpenChange={open => { if (!open) setDeleting(null); }} title={ui.deleteModelConfirmTitle} confirmLabel={ui.deleteModelConfirm}
      onConfirm={() => void save(buildDeleteModelPatch(snapshot, deleting.name))}>
      <p className={styles.mono}>{deleting.name} ({deleting.model})</p>
      {checkModelReferences(deleting.name, value).length > 0 && <div className={styles.warning} role="alert">
        <p>{ui.deleteModelReferencedWarning}</p>
        <ul>{checkModelReferences(deleting.name, value).map(location => <li key={location}><code>{location}</code></li>)}</ul>
      </div>}
    </ConfirmDialog>}
    {actions.dialogs}
  </>;
}
