import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Eye, EyeOff, Plus, RefreshCw, X } from 'lucide-react';
import { discoverAgentModels, type ConfigSnapshot, type ModelDiscoveryInput } from '../api/admin';
import { templateText } from '../i18n/catalog';
import { useUI } from '../i18n/UI';
import { isSecretSet, MissingSecretsError } from '../schema/patch';
import { fieldsFromSchema } from '../schema/model';
import { buildAddModelsPatch, editingConfig, inferModelType, modelSchema, parseModels, parseProviders, providerDefaults, MODEL_TYPES, type ConfiguredProvider, type ModelType } from './modelConfig';
import { ModelSelect } from './ModelSelect';

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
  return <div className="provider-secret-input">
    <input aria-label={label} type={visible ? 'text' : 'password'} autoComplete="new-password" disabled={disabled} required={required}
      value={typeof value === 'string' ? value : ''} placeholder={isSecretSet(value) ? ui.secretSet : undefined} onChange={event => onChange(event.target.value)} />
    <button type="button" className="dialog-close-button" disabled={disabled || isSecretSet(value)} aria-label={visible ? ui.hideSecret : ui.showSecret} onClick={() => setVisible(current => !current)}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button>
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

  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) close(); }}><Dialog.Portal>
    <Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content provider-dialog-content" aria-describedby={undefined}>
      <div className="dialog-header"><Dialog.Title className="dialog-title">{provider ? ui.addModels : ui.addProviderTitle}</Dialog.Title><button type="button" disabled={busy} className="dialog-close-button" aria-label={ui.close} onClick={close}><X size={16} /></button></div>
      <form onSubmit={event => void save(event)}>
        {(error || localError) && <p className="plugins-error-banner" role="alert">{[error, localError].filter(Boolean).join('\n')}</p>}
        <fieldset className="model-form-fields" disabled={locked}>
          {!provider && <div className="model-form-row"><span>{ui.providerPreset}</span><ModelSelect label={ui.providerPreset} value={templateKey} options={templates.map(entry => ({ value: entry.key, label: templateText(messages, entry).name }))} disabled={locked} onChange={key => {
            const next = templates.find(entry => entry.key === key)!;
            setTemplateKey(key); setConnection(providerDefaults(next)); setModels([]); setNotice(null); setLocalError(null);
          }} /></div>}
          <label className="model-form-row"><span>{ui.providerName}</span><input required readOnly={!!provider} value={String(connection.name ?? '')} onChange={event => update('name', event.target.value)} /></label>
          {!provider && templateKey === 'custom' && <div className="model-form-row"><span>{ui.providerProtocol}</span><ModelSelect label={ui.providerProtocol} value={String(connection.protocol)} disabled={locked} options={(template.children.find(field => field.key === 'protocol')?.options ?? []).map(value => ({ value, label: value }))} onChange={value => update('protocol', value)} /></div>}
          <label className="model-form-row"><span>{ui.providerBaseUrl}</span><input required readOnly={!!provider} className="font-mono" value={String(connection.base_url ?? '')} onChange={event => update('base_url', event.target.value)} /></label>
          <div className="model-form-row"><span>{ui.providerApiKey}</span><SecretInput value={connection.api_key} label={ui.providerApiKey} disabled={locked || !!provider} onChange={value => update('api_key', value)} /></div>
          {reenterSecrets && <div className="provider-existing-secrets"><p className="field-hint">{ui.missingSecrets}</p>{maskedSecrets.map(secret => <div className="model-form-row" key={secret.path}><span>{secret.name} · {ui.providerApiKey}</span><SecretInput value={secretValues[secret.path] ?? { $secret_set: true }} label={`${secret.name} ${ui.providerApiKey}`} disabled={locked} required onChange={value => setSecretValues(current => ({ ...current, [secret.path]: value }))} /></div>)}</div>}
        </fieldset>
        <div className="provider-models-header"><span className="provider-models-title">{ui.models}</span><button type="button" className="provider-fetch-button" disabled={locked || !connection.name || !connection.base_url} onClick={() => void discover()}><RefreshCw size={14} className={discovering ? 'models-spin' : undefined} />{ui.fetchModels}</button></div>
        {notice && <p role="status" className="field-hint">{notice}</p>}
        {models.length > 0 && <div className="discovered-models-list">{models.map((model, index) => <div key={model.id} className="discovered-model-row">
          <label className="discovered-checkbox-wrap"><input type="checkbox" aria-label={model.id} checked={model.selected} disabled={locked} onChange={event => setModels(current => current.map((entry, at) => at === index ? { ...entry, selected: event.target.checked } : entry))} /></label>
          <div className="discovered-model-name"><input className="font-mono" aria-label={`${ui.modelConfigName}: ${model.id}`} disabled={locked} value={model.name} onChange={event => setModels(current => current.map((entry, at) => at === index ? { ...entry, name: event.target.value } : entry))} />{model.name !== model.id && <span className="field-hint font-mono">{model.id}</span>}</div>
          <span className="model-capability-tags">{model.vision && <span>{ui.capabilitiesVision}</span>}</span>
          <ModelSelect label={`${ui.modelType}: ${model.id}`} value={model.type} disabled={locked} options={MODEL_TYPES.map(value => ({ value, label: labels[value] }))} onChange={value => setModels(current => current.map((entry, at) => at === index ? { ...entry, type: value as ModelType } : entry))} />
        </div>)}</div>}
        <div className="manual-model-input-row"><input className="font-mono" disabled={locked} aria-label={ui.manualModelId} placeholder={ui.manualModelId} value={manual} onChange={event => setManual(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addManual(); } }} />
          <button type="button" className="dialog-button" disabled={locked || !manual.trim()} onClick={addManual}><Plus size={14} />{ui.addManualModel}</button></div>
        <div className="dialog-actions"><button type="button" className="dialog-button" disabled={busy} onClick={close}>{ui.cancel}</button><button type="submit" className="dialog-button is-primary" disabled={locked || (!!provider && !models.some(model => model.selected))}>{busy ? ui.saving : ui.save}</button></div>
      </form>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
