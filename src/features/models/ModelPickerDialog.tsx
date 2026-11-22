import { useMemo, useState } from 'react';
import { Plus, RefreshCw, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Dialog } from '../../ui/Dialog';
import { Skeleton } from '../../ui/EmptyState';
import styles from './Models.module.css';
import { discoverAgentModels } from '../../api/agent';
import { type ConfigSnapshot } from '../../api/config';
import { useUI } from '../../i18n/UI';
import { fieldsFromSchema } from '../../schema/model';
import { buildReplaceModelsPatch, checkModelReferences, editingConfig, inferModelType, modelSchema, parseModels, type ConfiguredProvider, type ModelType } from '../../pages/modelConfig';

type Choice = { id: string; type: ModelType };
type Props = {
  agentId: string;
  snapshot: ConfigSnapshot;
  provider: ConfiguredProvider;
  busy: boolean;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
};

/**
 * 选择某个提供商下要用的模型：打开即拉取模型列表，已添加的预先勾选，
 * 取消勾选即移除（同时清掉对它的默认模型等引用）。
 */
export function ModelPickerDialog({ agentId, snapshot, provider, busy, onClose, onSave }: Props) {
  const ui = useUI();
  const config = editingConfig(snapshot);
  const models = parseModels(config);
  const own = models.filter(model => model.provider === provider.name);
  const discovered = useQuery({ queryKey: ['model-discovery', agentId, provider.name], queryFn: () => discoverAgentModels(agentId, { provider: provider.name }), retry: false, staleTime: 60_000 });
  const [manual, setManual] = useState<Choice[]>([]);
  const [selected, setSelected] = useState(() => new Set(own.map(model => model.model)));
  const [query, setQuery] = useState('');
  const [manualID, setManualID] = useState('');
  const labels: Record<ModelType, string> = { chat: ui.tabChat, speech_to_text: ui.tabSpeechToText, text_to_speech: ui.tabTextToSpeech, embedding: ui.tabEmbedding, rerank: ui.tabRerank, decision: ui.tabDecision };

  // 列表 = 拉取结果 + 已配置但不在结果里的 + 手动输入的，按模型 ID 去重。
  const choices = useMemo(() => {
    const seen = new Map<string, Choice>();
    for (const model of discovered.data?.models ?? []) seen.set(model.id, { id: model.id, type: model.type as ModelType });
    for (const model of own) if (!seen.has(model.model)) seen.set(model.model, { id: model.model, type: model.type });
    for (const model of manual) if (!seen.has(model.id)) seen.set(model.id, model);
    return [...seen.values()];
  }, [discovered.data, own, manual]);
  const needle = query.trim().toLowerCase();
  const shown = needle ? choices.filter(choice => choice.id.toLowerCase().includes(needle)) : choices;
  const shownSelected = shown.filter(choice => selected.has(choice.id)).length;

  const removed = own.filter(model => !selected.has(model.model));
  const references = removed.flatMap(model => checkModelReferences(model.name, config).map(location => `${model.name} → ${location}`));

  const setMany = (ids: string[], on: boolean) => setSelected(current => {
    const next = new Set(current);
    for (const id of ids) if (on) next.add(id); else next.delete(id);
    return next;
  });
  const invert = () => setSelected(current => {
    const next = new Set(current);
    for (const choice of shown) if (next.has(choice.id)) next.delete(choice.id); else next.add(choice.id);
    return next;
  });
  const addManual = () => {
    const id = manualID.trim();
    if (!id) return;
    if (!choices.some(choice => choice.id === id)) setManual(current => [...current, { id, type: inferModelType(id) }]);
    setMany([id], true);
    setManualID('');
  };

  const save = () => {
    const defaults = Object.fromEntries((fieldsFromSchema(modelSchema(snapshot.schema)).find(field => field.key === 'models')?.children ?? [])
      .filter(field => Object.hasOwn(field, 'defaultValue') && !field.invisible).map(field => [field.key, field.defaultValue]));
    const others = models.filter(model => model.provider !== provider.name);
    const names = new Set(others.map(model => model.name));
    const kept = own.filter(model => selected.has(model.model));
    for (const model of kept) names.add(model.name);
    const added = choices.filter(choice => selected.has(choice.id) && !own.some(model => model.model === choice.id)).map(choice => {
      // 模型名在全部提供商之间唯一，重名时带上提供商前缀。
      const name = names.has(choice.id) ? `${provider.name}/${choice.id}` : choice.id;
      names.add(name);
      return { ...defaults, name, provider: provider.name, model: choice.id, type: choice.type };
    });
    // 保持原有顺序：其它提供商的模型原位不动，本提供商的保留项在前、新增项在后。
    const next = models.flatMap(model => model.provider !== provider.name ? [model] : selected.has(model.model) ? [model] : []);
    void onSave(buildReplaceModelsPatch(snapshot, [...next, ...added]));
  };

  const changed = removed.length > 0 || choices.some(choice => selected.has(choice.id) && !own.some(model => model.model === choice.id));
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }} title={`${ui.manageModels} · ${provider.name}`} size="lg" dismissible={!busy}
    footer={<>
      <span className={`${styles.note} ${styles.footerStart}`}>{ui.selectedCount.replace('{selected}', String(selected.size)).replace('{total}', String(choices.length))}</span>
      <Button onClick={onClose} disabled={busy}>{ui.cancel}</Button>
      <Button variant="primary" loading={busy} disabled={!changed} onClick={save}>{ui.save}</Button>
    </>}>
    <div className={styles.form}>
      <div className={styles.pickerBar}>
        <label className={styles.search}>
          <Search size={16} aria-hidden />
          <input className={styles.input} placeholder={ui.searchModels} aria-label={ui.searchModels} value={query} onChange={event => setQuery(event.target.value)} />
        </label>
        <Button size="sm" variant="ghost" disabled={busy || shown.length === 0 || shownSelected === shown.length} onClick={() => setMany(shown.map(choice => choice.id), true)}>{ui.pickAll}</Button>
        <Button size="sm" variant="ghost" disabled={busy || shownSelected === 0} onClick={() => setMany(shown.map(choice => choice.id), false)}>{ui.pickNone}</Button>
        <Button size="sm" variant="ghost" disabled={busy || shown.length === 0} onClick={invert}>{ui.pickInvert}</Button>
        <Button size="sm" variant="ghost" iconOnly aria-label={ui.fetchModels} disabled={busy} loading={discovered.isFetching} onClick={() => void discovered.refetch()}><RefreshCw size={15} /></Button>
      </div>

      {discovered.isError && <p className={styles.error} role="alert">{discovered.error.message}</p>}
      {discovered.isSuccess && discovered.data.description && <p className={styles.note}>{discovered.data.description}</p>}
      {discovered.isPending ? <div className={styles.choices}>{[0, 1, 2, 3].map(index => <Skeleton key={index} height={36} />)}</div>
        : shown.length === 0 ? <p className={styles.emptyChoices}>{choices.length === 0 ? ui.noDiscoveredModels : ui.noMatchingModels}</p>
        : <div className={styles.choices} role="group" aria-label={ui.models}>
          {shown.map(choice => <label key={choice.id} className={styles.choice} data-selected={selected.has(choice.id) || undefined}>
            <Checkbox checked={selected.has(choice.id)} disabled={busy} aria-label={choice.id} onCheckedChange={on => setMany([choice.id], on)} />
            <span className={styles.choiceID}>{choice.id}</span>
            {own.some(model => model.model === choice.id) && <span className={styles.tag}>{ui.addedBadge}</span>}
            <span className={styles.choiceType}>{labels[choice.type] ?? choice.type}</span>
          </label>)}
        </div>}

      {references.length > 0 && <div className={styles.warning} role="alert">
        <p>{ui.removeReferencedWarning}</p>
        <ul>{references.map(reference => <li key={reference}><code>{reference}</code></li>)}</ul>
      </div>}

      <div className={styles.manual}>
        <input className={`${styles.input} ${styles.monoInput}`} disabled={busy} aria-label={ui.manualModelId} placeholder={ui.manualModelId} value={manualID}
          onChange={event => setManualID(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addManual(); } }} />
        <Button icon={<Plus size={14} />} disabled={busy || !manualID.trim()} onClick={addManual}>{ui.addManualModel}</Button>
      </div>
    </div>
  </Dialog>;
}
