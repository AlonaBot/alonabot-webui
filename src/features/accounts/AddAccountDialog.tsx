import { useMemo, useState, type JSX } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Download, Send } from 'lucide-react';
import { isConfirmationError } from '../../api/client';
import { assignInstanceProfile, listProfiles } from '../../api/profiles';
import { createInstance, getInstanceSchema } from '../../api/instances';
import type { Package } from '../../api/packages';
import { ConfigForm } from '../../components/ConfigForm';
import { useUI } from '../../i18n/UI';
import { Button } from '../../ui/Button';
import { ConfirmDialog, Dialog } from '../../ui/Dialog';
import { EmptyState, Skeleton } from '../../ui/EmptyState';
import { RadioGroup } from '../../ui/RadioGroup';
import { Select } from '../../ui/Select';
import { toast } from '../../ui/toast';
import { usePackageActions } from '../plugins/usePackageActions';
import styles from './Accounts.module.css';

/** 官方适配器：未安装时也列在选项里，选中后可一键安装再继续填写。 */
export const officialAdapters = [
  { adapterID: 'telegram', repo: 'AlonaBot/alonabot-adapter-telegram' },
  { adapterID: 'onebot11', repo: 'AlonaBot/alonabot-adapter-onebot11' },
] as const;

export function AdapterIcon({ adapterID, size = 22 }: { adapterID: string; size?: number }): JSX.Element {
  return adapterID === 'telegram' ? <Send size={size} className={styles.telegram} aria-hidden /> : <Bot size={size} aria-hidden />;
}

/**
 * 添加机器人账号：选适配器 → 填名称与适配器表单 → 选配置文件。
 * 账号建好后再指定配置文件；后一步失败时账号保留并提示。
 */
export function AddAccountDialog({ packages, onClose }: { packages: readonly Package[]; onClose: () => void }): JSX.Element {
  const ui = useUI();
  const client = useQueryClient();
  const actions = usePackageActions();
  const adapters = packages.filter(item => item.Role === 'adapter');
  const choices = useMemo(() => {
    const list = adapters.map(item => ({ adapterID: item.AdapterID, pkg: item as Package | undefined, repo: '' }));
    for (const official of officialAdapters) if (!list.some(item => item.adapterID === official.adapterID)) list.push({ adapterID: official.adapterID, pkg: undefined, repo: official.repo });
    return list;
  }, [adapters]);
  const [adapterID, setAdapterID] = useState(choices[0]?.adapterID ?? '');
  const choice = choices.find(item => item.adapterID === adapterID);
  const [name, setName] = useState('');
  const [profile, setProfile] = useState('default');
  const [pending, setPending] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [confirm, setConfirm] = useState<{ affected: string[]; patch: Record<string, unknown> } | null>(null);

  const schema = useQuery({ queryKey: ['instance-schema', adapterID], queryFn: () => getInstanceSchema(adapterID), enabled: !!choice?.pkg });
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: listProfiles });
  const label = (id: string) => id === 'telegram' ? ui.adapterTelegram : id === 'onebot11' ? ui.adapterOneBot : id;
  const instanceID = name.trim();
  const messages = { config: adapterID === 'telegram'
    ? { token: { description: ui.botToken }, api_base_url: { description: ui.apiBaseURL }, proxy_mode: { description: ui.proxyMode }, proxy: { description: ui.proxyURL } }
    : adapterID === 'onebot11' ? { ws_url: { description: ui.webSocketURL }, access_token: { description: ui.accessToken }, mode: { description: ui.connectionMode } } : {} };

  const create = async (patch: Record<string, unknown>, confirmed = false) => {
    if (!choice?.pkg || !instanceID) return;
    setPending(true);
    let created = false;
    try {
      await createInstance({ package_id: choice.pkg.ID, instance_id: instanceID, config: patch, confirm: confirmed });
      created = true;
      if (profile !== 'default') await assignInstanceProfile(instanceID, profile);
      toast.success(ui.accountAdded.replace('{name}', instanceID));
      onClose();
    } catch (error) {
      if (!created && isConfirmationError(error)) setConfirm({ affected: error.affected, patch });
      else if (created) { toast.error(error, ui.accountProfileFailed.replace('{instance}', instanceID)); onClose(); }
      else toast.error(error);
    } finally {
      setPending(false);
      void client.invalidateQueries({ queryKey: ['instances'] });
      void client.invalidateQueries({ queryKey: ['profile-assignments'] });
    }
  };

  const install = async () => {
    if (!choice?.repo) return;
    setInstalling(true);
    await actions.install({ Source: choice.repo });
    setInstalling(false);
  };

  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }} title={ui.addBotAccount} dismissible={!pending} size="md">
    <RadioGroup variant="card" columns={Math.min(choices.length, 2)} value={adapterID} onValueChange={setAdapterID} aria-label={ui.selectAdapter} className={styles.choices}
      options={choices.map(item => ({ value: item.adapterID, label: label(item.adapterID), icon: <AdapterIcon adapterID={item.adapterID} />, description: item.pkg ? undefined : ui.adapterNotInstalled }))} />

    {!choice ? <EmptyState title={ui.adapterRequired} />
      : !choice.pkg ? <div className={styles.installPrompt}>
        <p>{ui.adapterInstallPrompt.replace('{name}', label(adapterID))}</p>
        <Button variant="primary" icon={<Download size={16} />} loading={installing} onClick={() => void install()}>{ui.installAdapter.replace('{name}', label(adapterID))}</Button>
      </div>
      : schema.isPending ? <div className={styles.formSkeleton}><Skeleton height={44} /><Skeleton height={44} /><Skeleton height={44} /></div>
      : schema.isError ? <EmptyState tone="error" title={ui.noInstanceSchema} description={schema.error.message} />
      : <div className={styles.form}>
        <label className={styles.field}>
          <span>{ui.instanceName}</span>
          <input className={styles.input} value={name} placeholder={ui.instanceNamePlaceholder} disabled={pending} onChange={event => setName(event.target.value)} autoFocus />
          <small>{ui.instanceNameHint}</small>
        </label>
        {adapterID === 'telegram' && <p className={styles.tip}>{ui.botTokenHint}</p>}
        <fieldset disabled={pending} className={styles.schema}>
          {/* 实例选项端点要求实例已存在，创建前沿用表单的普通文本输入。 */}
          <ConfigForm schema={schema.data} value={{}} messages={messages} collapseOptional onSubmit={patch => void create(patch)}
            footer={<>
              <label className={styles.field}>
                <span>{ui.configProfile}</span>
                <Select variant="filled" size="lg" value={profile} onValueChange={setProfile}
                  options={(profiles.data ?? [{ id: 'default', name: ui.defaultProfile }]).map(item => ({ value: item.id, label: item.id === 'default' ? ui.defaultProfile : item.name }))} />
              </label>
              <div className={styles.footer}>
                <Button onClick={onClose} disabled={pending}>{ui.cancel}</Button>
                <Button type="submit" variant="primary" loading={pending} disabled={!instanceID}>{ui.add}</Button>
              </div>
            </>} />
        </fieldset>
      </div>}

    {confirm && <ConfirmDialog open onOpenChange={open => { if (!open) setConfirm(null); }} title={ui.confirmAffectedTitle} description={ui.confirmAffectedDesc}
      confirmLabel={ui.confirmContinue} onConfirm={() => { const patch = confirm.patch; setConfirm(null); void create(patch, true); }}>
      <ul className={styles.affected}>{confirm.affected.map(item => <li key={item}>{item}</li>)}</ul>
    </ConfirmDialog>}
    {actions.dialogs}
  </Dialog>;
}
