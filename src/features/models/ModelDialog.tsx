import { useState, type FormEvent } from 'react';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Dialog } from '../../ui/Dialog';
import styles from './Models.module.css';
import type { ConfigSnapshot } from '../../api/config';
import { useUI } from '../../i18n/UI';
import { buildUpdateModelPatch, editingConfig, MODEL_TYPES, parseModels, parseProviders, type ConfiguredModel, type ModelType } from '../../pages/modelConfig';
import { Select } from '../../ui/Select';

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
  const formID = 'model-dialog-form';
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }} title={ui.editModel} size="md" dismissible={!busy}
    footer={<>
      {localError && <p className={styles.error} role="alert">{localError}</p>}
      <Button onClick={onClose} disabled={busy}>{ui.cancel}</Button>
      <Button type="submit" form={formID} variant="primary" loading={busy}>{ui.save}</Button>
    </>}>
    <form id={formID} onSubmit={submit}>
      <fieldset className={styles.form} disabled={busy} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <label className={styles.formRow}><span>{ui.modelConfigName}</span><input className={styles.input} required value={name} onChange={event => setName(event.target.value)} /></label>
        <label className={styles.formRow}><span>{ui.remoteModelId}</span><input className={styles.input} style={{ fontFamily: 'var(--font-mono)' }} required value={remote} onChange={event => setRemote(event.target.value)} /></label>
        <div className={styles.formRow}><span>{ui.modelProvider}</span><Select variant="filled" aria-label={ui.modelProvider} value={provider} options={parseProviders(config).map(entry => ({ value: entry.name, label: entry.name }))} onValueChange={setProvider} disabled={busy} /></div>
        <div className={styles.formRow}><span>{ui.modelType}</span><Select variant="filled" aria-label={ui.modelType} value={type} options={MODEL_TYPES.map(value => ({ value, label: labels[value] }))} onValueChange={value => setType(value as ModelType)} disabled={busy} /></div>
        {type === 'chat' && <>
          <label className={styles.formRow}><span>{ui.maxOutputTokens}</span><input className={styles.input} inputMode="numeric" pattern="[0-9]*" required={model.max_tokens !== undefined} value={maxTokens ?? ''} onChange={event => setMaxTokens(event.target.value === '' ? undefined : Number(event.target.value))} /></label>
          <div className={styles.formRow}><span /><Checkbox checked={vision} onCheckedChange={setVision} label={ui.capabilitiesVision} /></div>
        </>}
      </fieldset>
    </form>
  </Dialog>;
}
