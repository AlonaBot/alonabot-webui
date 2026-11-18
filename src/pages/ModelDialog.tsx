import { useState, type FormEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ConfigSnapshot } from '../api/admin';
import { useUI } from '../i18n/UI';
import { buildUpdateModelPatch, editingConfig, MODEL_TYPES, parseModels, parseProviders, type ConfiguredModel, type ModelType } from './modelConfig';
import { ModelSelect } from './ModelSelect';

type Props = { model: ConfiguredModel; snapshot: ConfigSnapshot; busy: boolean; error: string | null; onClose: () => void; onSave: (patch: Record<string, unknown>) => Promise<void> };

export function ModelDialog({ model, snapshot, busy, error, onClose, onSave }: Props) {
  const ui = useUI();
  const [name, setName] = useState(model.name);
  const [remote, setRemote] = useState(model.model);
  const [provider, setProvider] = useState(model.provider);
  const [type, setType] = useState(model.type);
  const [vision, setVision] = useState(model.image_input ?? false);
  const [maxTokens, setMaxTokens] = useState<number | undefined>(model.max_tokens);
  const [localError, setLocalError] = useState<string | null>(null);
  const labels = { chat: ui.tabChat, speech_to_text: ui.tabSpeechToText, text_to_speech: ui.tabTextToSpeech, embedding: ui.tabEmbedding, rerank: ui.tabRerank, decision: ui.tabDecision };
  const config = editingConfig(snapshot);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || parseModels(config).some(entry => entry.name !== model.name && entry.name === name.trim())) { setLocalError(ui.duplicateModelName); return; }
    try {
      void onSave(buildUpdateModelPatch(snapshot, model.name, {
        name: name.trim(), model: remote.trim(), provider, type,
        ...(type === 'chat' ? { image_input: vision, ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}) } : {}),
      }));
    } catch (caught) { setLocalError(caught instanceof Error ? caught.message : String(caught)); }
  };
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content model-edit-dialog" aria-describedby={undefined}>
      <div className="dialog-header"><Dialog.Title className="dialog-title">{ui.editModel}</Dialog.Title><Dialog.Close asChild><button type="button" className="dialog-close-button" disabled={busy} aria-label={ui.close}><X size={16} /></button></Dialog.Close></div>
      <form onSubmit={submit}>
        {(error || localError) && <p role="alert" className="plugins-error-banner">{[error, localError].filter(Boolean).join('\n')}</p>}
        <fieldset className="model-form-fields" disabled={busy}>
          <label className="model-form-row"><span>{ui.modelConfigName}</span><input required value={name} onChange={event => setName(event.target.value)} /></label>
          <label className="model-form-row"><span>{ui.remoteModelId}</span><input required value={remote} onChange={event => setRemote(event.target.value)} /></label>
          <div className="model-form-row"><span>{ui.modelProvider}</span><ModelSelect label={ui.modelProvider} value={provider} options={parseProviders(config).map(entry => ({ value: entry.name, label: entry.name }))} onChange={setProvider} disabled={busy} /></div>
          <div className="model-form-row"><span>{ui.modelType}</span><ModelSelect label={ui.modelType} value={type} options={MODEL_TYPES.map(value => ({ value, label: labels[value] }))} onChange={value => setType(value as ModelType)} disabled={busy} /></div>
          {type === 'chat' && <>
            <label className="model-form-row"><span>{ui.maxOutputTokens}</span><input type="number" min={1} required={model.max_tokens !== undefined} value={maxTokens ?? ''} onChange={event => setMaxTokens(event.target.value === '' ? undefined : Number(event.target.value))} /></label>
            <label className="model-vision-control"><input type="checkbox" checked={vision} onChange={event => setVision(event.target.checked)} />{ui.capabilitiesVision}</label>
          </>}
        </fieldset>
        <div className="dialog-actions"><button type="button" className="dialog-button" disabled={busy} onClick={onClose}>{ui.cancel}</button><button type="submit" className="dialog-button is-primary" disabled={busy}>{busy ? ui.saving : ui.save}</button></div>
      </form>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
