import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Plus, RefreshCw } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Dialog } from '../../ui/Dialog';
import styles from './Models.module.css';
import { discoverAgentModels, type ModelDiscoveryInput } from '../../api/agent';
import { type ConfigSnapshot } from '../../api/config';
import { templateText } from '../../i18n/catalog';
import { useUI } from '../../i18n/UI';
import { isSecretSet, MissingSecretsError } from '../../schema/patch';
import { fieldsFromSchema } from '../../schema/model';
import { buildAddModelsPatch, editingConfig, inferModelType, modelSchema, parseModels, parseProviders, providerDefaults, MODEL_TYPES, type ConfiguredProvider, type ModelType } from '../../pages/modelConfig';
import { Select } from '../../ui/Select';

type Choice = { id: string; name: string; type: ModelType; selected: boolean; vision: boolean };
type Props = {
  agentId: string;
  snapshot: ConfigSnapshot;
  messages: Record<string, unknown>;
  provider?: ConfiguredProvider;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
};

function SecretInput({ value, label, disabled, required, onChange }: { value: unknown; label: string; disabled: boolean; required?: boolean; onChange: (value: string) => void }) {
  const ui = useUI();
  const [visible, setVisible] = useState(false);
  return <div className={styles.secret}>
    <input className={styles.input} aria-label={label} type={visible ? 'text' : 'password'} autoComplete="new-password" disabled={disabled} required={required}
      value={typeof value === 'string' ? value : ''} placeholder={isSecretSet(value) ? ui.secretSet : undefined} onChange={event => onChange(event.target.value)} />
    <Button variant="ghost" iconOnly disabled={disabled || isSecretSet(value)} aria-label={visible ? ui.hideSecret : ui.showSecret} onClick={() => setVisible(current => !current)}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</Button>
  </div>;
}

/** ProviderDialog 在同一表单中编辑 schema 模板连接、发现模型并保存完整数组补丁。 */
export function ProviderDialog({ agentId, snapshot, messages, provider, busy, error, onClose, onSave }: Props) {
  const ui = useUI();
  const fields = useMemo(() => fieldsFromSchema(modelSchema(snapshot.schema)), [snapshot.schema]);
  const templates = fields.find(field => field.key === 'providers')!.templates!;
  const [templateKey, setTemplateKey] = useState(templates[0].key);
  const [connection, setConnection] = useState<Record<string, unknown>>(() => provider ? { ...provider } : providerDefaults(templates[0]));
  const template = templates.find(entry => entry.key === templateKey)!;
  const [models, setModels] = useState<Choice[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [reenterSecrets, setReenterSecrets] = useState(false);
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const config = editingConfig(snapshot);
  const originalProviders = (config.providers ?? []) as Record<string, Record<string, unknown>>[];
  const maskedSecrets = originalProviders.flatMap((row, index) => Object.entries(row).flatMap(([key, values]) =>
    Object.entries(values).filter(([, value]) => isSecretSet(value)).map(([field]) => ({ index, key, field, name: String(values.name), path: `${index}/${key}/${field}` }))));
  const modelFields = fields.find(field => field.key === 'models')?.children ?? [];
  const labels = { chat: ui.tabChat, speech_to_text: ui.tabSpeechToText, text_to_speech: ui.tabTextToSpeech, embedding: ui.tabEmbedding, rerank: ui.tabRerank, decision: ui.tabDecision };
  const locked = busy || discovering;
  const update = (key: string, value: string) => { setConnection(current => ({ ...current, [key]: value })); setNotice(null); };
  const close = () => { alive.current = false; onClose(); };
  const addManual = () => {
    const id = manual.trim();
    if (!id) return;
    if (!models.some(model => model.id === id)) setModels(current => [...current, { id, name: id, type: inferModelType(id), selected: true, vision: false }]);
    setManual('');
  };
  const discover = async () => {
    setDiscovering(true); setLocalError(null); setNotice(null);
    const input: ModelDiscoveryInput = provider ? { provider: provider.name } : {
      protocol: connection.protocol as string,
      base_url: connection.base_url as string,
      ...(typeof connection.api_key === 'string' && connection.api_key ? { api_key: connection.api_key } : {}),
    };
    try {
      const result = await discoverAgentModels(agentId, input);
      if (!alive.current) return;
      setModels(result.models.map(model => ({ id: model.id, name: model.id, type: model.type as ModelType, selected: true,
        vision: parseModels(config).some(existing => existing.provider === connection.name && existing.model === model.id && existing.image_input) })));
      setNotice(result.description ?? (result.models.length === 0 ? ui.noDiscoveredModels : null));
    } catch (caught) { if (alive.current) setLocalError(caught instanceof Error ? caught.message : String(caught)); }
    finally { if (alive.current) setDiscovering(false); }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault(); setLocalError(null);
    const selected = models.filter(model => model.selected);
    const names = [...parseModels(config).map(model => model.name), ...selected.map(model => model.name.trim())];
    if (names.some(name => !name) || new Set(names).size !== names.length) { setLocalError(ui.duplicateModelName); return; }
    if (!provider && parseProviders(config).some(existing => existing.name === String(connection.name).trim())) { setLocalError(ui.duplicateProviderName); return; }
    try {
      const added = selected.map(model => ({
        ...Object.fromEntries(modelFields.filter(field => Object.hasOwn(field, 'defaultValue') && !field.invisible).map(field => [field.key, field.defaultValue])),
        name: model.name.trim(), provider: String(connection.name).trim(), model: model.id, type: model.type,
        ...(model.type === 'chat' && model.vision ? { image_input: true } : {}),
      }));
      const providers = provider ? undefined : [
        ...originalProviders.map((row, index) => Object.fromEntries(Object.entries(row).map(([key, values]) => [key, {
          ...values, ...Object.fromEntries(Object.keys(values).filter(field => Object.hasOwn(secretValues, `${index}/${key}/${field}`)).map(field => [field, secretValues[`${index}/${key}/${field}`]])),
        }]))),
        { [templateKey]: { ...connection, name: String(connection.name).trim() } },
      ];
      await onSave(buildAddModelsPatch(snapshot, added, providers));
    } catch (caught) {
      if (caught instanceof MissingSecretsError) { setReenterSecrets(true); setLocalError(ui.missingSecrets); }
      else setLocalError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const formID = 'provider-dialog-form';
  return <Dialog open onOpenChange={open => { if (!open && !busy) close(); }} title={provider ? ui.addModels : ui.addProviderTitle} size="lg" dismissible={!busy}
    footer={<>
      {localError && <p className={styles.error} role="alert">{localError}</p>}
      <Button onClick={close} disabled={busy}>{ui.cancel}</Button>
      <Button type="submit" form={formID} variant="primary" loading={busy} disabled={discovering || (!!provider && !models.some(model => model.selected))}>{ui.save}</Button>
    </>}>
    <form id={formID} className={styles.form} onSubmit={event => void save(event)}>
      <fieldset className={styles.form} disabled={locked} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        {!provider && <div className={styles.formRow}><span>{ui.providerPreset}</span><Select variant="filled" aria-label={ui.providerPreset} value={templateKey} options={templates.map(entry => ({ value: entry.key, label: templateText(messages, entry).name }))} disabled={locked} onValueChange={key => {
          const next = templates.find(entry => entry.key === key)!;
          setTemplateKey(key); setConnection(providerDefaults(next)); setModels([]); setNotice(null); setLocalError(null);
        }} /></div>}
        <label className={styles.formRow}><span>{ui.providerName}</span><input className={styles.input} required readOnly={!!provider} value={String(connection.name ?? '')} onChange={event => update('name', event.target.value)} /></label>
        {!provider && templateKey === 'custom' && <div className={styles.formRow}><span>{ui.providerProtocol}</span><Select variant="filled" aria-label={ui.providerProtocol} value={String(connection.protocol)} disabled={locked} options={(template.children.find(field => field.key === 'protocol')?.options ?? []).map(value => ({ value, label: value }))} onValueChange={value => update('protocol', value)} /></div>}
        <label className={styles.formRow}><span>{ui.providerBaseUrl}</span><input className={styles.input} style={{ fontFamily: 'var(--font-mono)' }} required readOnly={!!provider} value={String(connection.base_url ?? '')} onChange={event => update('base_url', event.target.value)} /></label>
        <div className={styles.formRow}><span>{ui.providerApiKey}</span><SecretInput value={connection.api_key} label={ui.providerApiKey} disabled={locked || !!provider} onChange={value => update('api_key', value)} /></div>
        {reenterSecrets && <>{maskedSecrets.map(secret => <div className={styles.formRow} key={secret.path}><span>{secret.name} · {ui.providerApiKey}</span><SecretInput value={secretValues[secret.path] ?? { $secret_set: true }} label={`${secret.name} ${ui.providerApiKey}`} disabled={locked} required onChange={value => setSecretValues(current => ({ ...current, [secret.path]: value }))} /></div>)}</>}
      </fieldset>
      <div className={styles.sectionHead}><span>{ui.models}</span><Button size="sm" icon={<RefreshCw size={14} />} loading={discovering} disabled={busy || !connection.name || !connection.base_url} onClick={() => void discover()}>{ui.fetchModels}</Button></div>
      {notice && <p role="status" className={styles.note}>{notice}</p>}
      {models.length > 0 && <div className={styles.choices}>{models.map((model, index) => <div key={model.id} className={styles.choice}>
        <Checkbox aria-label={model.id} checked={model.selected} disabled={locked} onCheckedChange={checked => setModels(current => current.map((entry, at) => at === index ? { ...entry, selected: checked } : entry))} />
        <input className={styles.input} aria-label={`${ui.modelConfigName}: ${model.id}`} disabled={locked} value={model.name} title={model.id} onChange={event => setModels(current => current.map((entry, at) => at === index ? { ...entry, name: event.target.value } : entry))} />
        <span>{model.vision && <span className={styles.tag}>{ui.capabilitiesVision}</span>}</span>
        <Select size="sm" aria-label={`${ui.modelType}: ${model.id}`} value={model.type} disabled={locked} options={MODEL_TYPES.map(value => ({ value, label: labels[value] }))} onValueChange={value => setModels(current => current.map((entry, at) => at === index ? { ...entry, type: value as ModelType } : entry))} />
      </div>)}</div>}
      <div className={styles.manual}>
        <input className={styles.input} disabled={locked} aria-label={ui.manualModelId} placeholder={ui.manualModelId} value={manual} onChange={event => setManual(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addManual(); } }} />
        <Button icon={<Plus size={14} />} disabled={locked || !manual.trim()} onClick={addManual}>{ui.addManualModel}</Button>
      </div>
      <p className={styles.note}>{ui.manualModelHint}</p>
    </form>
  </Dialog>;
}
