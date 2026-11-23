import { useMemo, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Select } from '../../ui/Select';
import styles from './Models.module.css';
import { type ConfigSnapshot } from '../../api/config';
import { templateText } from '../../i18n/catalog';
import { useUI } from '../../i18n/UI';
import { isSecretSet, MissingSecretsError } from '../../schema/patch';
import { fieldsFromSchema } from '../../schema/model';
import { buildReplaceModelsPatch, editingConfig, modelSchema, parseModels, parseProviders, providerDefaults, type ConfiguredProvider } from '../../pages/modelConfig';

type Props = {
  snapshot: ConfigSnapshot;
  messages: Record<string, unknown>;
  /** 有值时编辑这个提供商的连接，否则新建。 */
  provider?: ConfiguredProvider;
  /** 打开时直接进入删除确认。 */
  deleting?: boolean;
  busy: boolean;
  onClose: () => void;
  /** 保存补丁；added 为新建提供商的名称，便于接着打开模型选择。 */
  onSave: (patch: Record<string, unknown>, added?: string) => Promise<void>;
};

function SecretInput({ value, label, disabled, required, onChange }: { value: unknown; label: string; disabled: boolean; required?: boolean; onChange: (value: string) => void }) {
  const ui = useUI();
  const [visible, setVisible] = useState(false);
  return <div className={styles.secret}>
    <input className={styles.input} aria-label={label} type={visible ? 'text' : 'password'} autoComplete="new-password" disabled={disabled} required={required}
      value={typeof value === 'string' ? value : ''} placeholder={isSecretSet(value) ? ui.secretKeep : undefined} onChange={event => onChange(event.target.value)} />
    <Button variant="ghost" iconOnly disabled={disabled || typeof value !== 'string' || !value} aria-label={visible ? ui.hideSecret : ui.showSecret} onClick={() => setVisible(current => !current)}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</Button>
  </div>;
}

/**
 * ProviderDialog 只管提供商的连接（预设、名称、地址、密钥），模型在 ModelPickerDialog 里单独选择。
 * providers 是整体替换的数组，其它提供商被脱敏的密钥缺失时，在同一表单里要求重新输入。
 */
export function ProviderDialog({ snapshot, messages, provider, deleting = false, busy, onClose, onSave }: Props) {
  const ui = useUI();
  const fields = useMemo(() => fieldsFromSchema(modelSchema(snapshot.schema)), [snapshot.schema]);
  const templates = fields.find(field => field.key === 'providers')!.templates!;
  const config = editingConfig(snapshot);
  const rows = (config.providers ?? []) as Record<string, Record<string, unknown>>[];
  const editIndex = provider ? parseProviders(config).findIndex(entry => entry.name === provider.name) : -1;
  const [templateKey, setTemplateKey] = useState(() => editIndex >= 0 ? Object.keys(rows[editIndex])[0] : templates[0].key);
  const [connection, setConnection] = useState<Record<string, unknown>>(() => provider ? { ...provider } : providerDefaults(templates[0]));
  const [confirmDelete, setConfirmDelete] = useState(deleting);
  const [reenter, setReenter] = useState(false);
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const template = templates.find(entry => entry.key === templateKey)!;
  const ownModels = provider ? parseModels(config).filter(model => model.provider === provider.name) : [];
  // 当前提供商的密钥在主表单里填写，这里只列出其它提供商。
  const masked = rows.flatMap((row, index) => index === editIndex ? [] : Object.entries(row).flatMap(([key, values]) =>
    Object.entries(values).filter(([, value]) => isSecretSet(value)).map(([field]) => ({ name: String(values.name), path: `${index}/${key}/${field}` }))));
  const update = (key: string, value: string) => { setConnection(current => ({ ...current, [key]: value })); setError(null); };

  const providersWith = (own?: Record<string, unknown>) => rows.flatMap((row, index) => {
    if (index === editIndex) return own ? [{ [templateKey]: own }] : [];
    return [Object.fromEntries(Object.entries(row).map(([key, values]) => [key, {
      ...values, ...Object.fromEntries(Object.keys(values).filter(field => Object.hasOwn(secretValues, `${index}/${key}/${field}`)).map(field => [field, secretValues[`${index}/${key}/${field}`]])),
    }]))];
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(null);
    const name = String(connection.name ?? '').trim();
    const models = parseModels(config);
    try {
      if (confirmDelete && provider) {
        await onSave(buildReplaceModelsPatch(snapshot, models.filter(model => model.provider !== provider.name), providersWith()));
        return;
      }
      if (!provider && parseProviders(config).some(existing => existing.name === name)) { setError(ui.duplicateProviderName); return; }
      const own = { ...connection, name };
      const list = provider ? providersWith(own) : [...providersWith(), { [templateKey]: own }];
      await onSave(buildReplaceModelsPatch(snapshot, models, list), provider ? undefined : name);
    } catch (caught) {
      if (caught instanceof MissingSecretsError) {
        setReenter(true);
        setError(caught.paths.some(path => path.startsWith(`/providers/${editIndex}/`)) ? ui.providerKeyRequired : ui.missingSecrets);
      } else setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const formID = 'provider-dialog-form';
  const title = confirmDelete ? ui.deleteProvider : provider ? ui.editConnection : ui.addProviderTitle;
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }} title={title} size="md" dismissible={!busy}
    footer={<>
      {provider && !confirmDelete && <Button variant="ghost" className={styles.footerStart} icon={<Trash2 size={16} />} disabled={busy} onClick={() => { setConfirmDelete(true); setError(null); }}>{ui.deleteProvider}</Button>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <Button onClick={confirmDelete && !deleting ? () => setConfirmDelete(false) : onClose} disabled={busy}>{ui.cancel}</Button>
      <Button type="submit" form={formID} variant={confirmDelete ? 'danger' : 'primary'} loading={busy}>{confirmDelete ? ui.deleteProviderConfirm : provider ? ui.save : ui.add}</Button>
    </>}>
    <form id={formID} onSubmit={event => void submit(event)}>
      <fieldset className={styles.form} disabled={busy}>
        {confirmDelete ? <p className={styles.confirmText}>{ui.deleteProviderHint.replace('{name}', provider?.name ?? '').replace('{count}', String(ownModels.length))}</p> : <>
          {!provider && <div className={styles.formRow}><span>{ui.providerPreset}</span><Select variant="filled" aria-label={ui.providerPreset} value={templateKey} disabled={busy}
            options={templates.map(entry => ({ value: entry.key, label: templateText(messages, entry).name }))}
            onValueChange={key => { setTemplateKey(key); setConnection(providerDefaults(templates.find(entry => entry.key === key)!)); setError(null); }} /></div>}
          <label className={styles.formRow}><span>{ui.providerName}</span><input className={styles.input} required readOnly={!!provider} value={String(connection.name ?? '')} onChange={event => update('name', event.target.value)} /></label>
          {templateKey === 'custom' && <div className={styles.formRow}><span>{ui.providerProtocol}</span><Select variant="filled" aria-label={ui.providerProtocol} value={String(connection.protocol)} disabled={busy}
            options={(template.children.find(field => field.key === 'protocol')?.options ?? []).map(value => ({ value, label: value }))} onValueChange={value => update('protocol', value)} /></div>}
          <label className={styles.formRow}><span>{ui.providerBaseUrl}</span><input className={`${styles.input} ${styles.monoInput}`} required value={String(connection.base_url ?? '')} onChange={event => update('base_url', event.target.value)} /></label>
          <div className={styles.formRow}><span>{ui.providerApiKey}</span><SecretInput value={connection.api_key} label={ui.providerApiKey} disabled={busy} onChange={value => update('api_key', value)} /></div>
        </>}
        {reenter && masked.length > 0 && <>
          <p className={styles.note}>{ui.missingSecrets}</p>
          {masked.map(secret => <div className={styles.formRow} key={secret.path}><span>{secret.name}</span>
            <SecretInput value={secretValues[secret.path] ?? { $secret_set: true }} label={`${secret.name} ${ui.providerApiKey}`} disabled={busy} required
              onChange={value => setSecretValues(current => ({ ...current, [secret.path]: value }))} /></div>)}
        </>}
      </fieldset>
    </form>
  </Dialog>;
}
