import { useContext, useEffect, useMemo, useState, type JSX } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, MoreHorizontal, Plus, Power, Settings2, Trash2 } from 'lucide-react';
import { listChats, type Chat } from '../../api/conversations';
import { changeInstance, getInstanceConfig, getInstanceSchema, pruneInstanceConfig, updateInstanceConfig, type AdapterInstance } from '../../api/instances';
import { listInstanceOptions, resolveInstanceOptions } from '../../api/config';
import { ConfigForm } from '../../components/ConfigForm';
import { applyMergePatch } from '../../pages/pluginConfig';
import { useUISettings } from '../../shell/settings';
import { changePackage } from '../../api/packages';
import { getProfileAssignments, listProfiles } from '../../api/profiles';
import { useUI } from '../../i18n/UI';
import { accountChats, chatProfile } from '../../pages/accountState';
import { installed, usePackages } from '../../queries/packages';
import { useInstances } from '../../queries/plugins';
import { isSecretSet } from '../../schema/patch';
import { PageHeader } from '../../shell/PageHeader';
import { SearchContext } from '../../shell/search';
import { Button } from '../../ui/Button';
import { ConfirmDialog, Dialog } from '../../ui/Dialog';
import { EmptyState, Skeleton } from '../../ui/EmptyState';
import { Menu, MenuItem, MenuSeparator } from '../../ui/Menu';
import { Pagination } from '../../ui/Pagination';
import { Switch } from '../../ui/Switch';
import { toast } from '../../ui/toast';
import { usePackageActions } from '../plugins/usePackageActions';
import { AddAccountDialog, AdapterIcon, adapterFieldMessages, officialAdapters } from './AddAccountDialog';
import styles from './Accounts.module.css';

const pageSize = 12;

/** 机器人账号：每个适配器实例一张卡片，显示最近会话及其配置文件、运行状态与所属适配器的问题。 */
export function AccountsPage(): JSX.Element {
  const ui = useUI();
  const client = useQueryClient();
  const { register } = useContext(SearchContext);
  const actions = usePackageActions();
  const packages = installed(usePackages().data);
  const instances = useInstances();
  const chats = useQuery({ queryKey: ['chats'], queryFn: listChats });
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: listProfiles });
  const assignments = useQuery({ queryKey: ['profile-assignments'], queryFn: getProfileAssignments });
  const [adding, setAdding] = useState(false);
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [deleting, setDeleting] = useState<AdapterInstance | null>(null);
  const [inspecting, setInspecting] = useState<AdapterInstance | null>(null);
  const [chatList, setChatList] = useState<AdapterInstance | null>(null);

  useEffect(() => register([{ id: 'accounts-add', title: ui.addAccount, section: ui.searchActions, icon: Plus, keywords: ['add', 'account', 'bot'], run: () => setAdding(true) }]), [register, ui]);

  const profileName = (id: string) => id === 'default' ? ui.defaultProfile : profiles.data?.find(item => item.id === id)?.name ?? id;
  const list = instances.data ?? [];
  const pages = Math.max(1, Math.ceil((list.length + 1) / pageSize));
  const current = Math.min(page, pages);

  const change = async (action: 'start' | 'stop' | 'delete', instance: AdapterInstance) => {
    setPending(previous => new Set(previous).add(instance.instance_id));
    if (action !== 'delete') client.setQueryData<AdapterInstance[]>(['instances'], items => items?.map(item => item.instance_id === instance.instance_id ? { ...item, state: action === 'start' ? 'running' : 'stopped' } : item));
    try {
      await changeInstance(action, instance.instance_id);
      if (action === 'delete') toast.success(ui.accountDeleted.replace('{name}', instance.instance_id));
    } catch (error) {
      toast.error(error);
    } finally {
      setPending(previous => { const next = new Set(previous); next.delete(instance.instance_id); return next; });
      void client.invalidateQueries({ queryKey: ['instances'] });
    }
  };

  /** 从账号卡片重新安装适配器：装好后一并启用，账号随即恢复运行。 */
  const reinstall = async (repo: string, packageID: string) => {
    if (!await actions.install({ Source: repo })) return;
    try { await changePackage('enable', packageID); }
    catch (error) { toast.error(error); }
    finally {
      void client.invalidateQueries({ queryKey: ['packages'] });
      void client.invalidateQueries({ queryKey: ['instances'] });
    }
  };

  /** 适配器组件停用或未安装时的提示与一键处理。 */
  const adapterIssue = (instance: AdapterInstance) => {
    const label = instance.adapter_id === 'telegram' ? ui.adapterTelegram : instance.adapter_id === 'onebot11' ? ui.adapterOneBot : instance.adapter_id;
    if (instance.package_state === 'disabled') {
      const pkg = packages.find(item => item.ID === instance.package_id);
      return { text: ui.adapterDisabledNotice.replace('{name}', label), action: pkg && <Button size="sm" variant="soft" icon={<Power size={14} />} onClick={() => void actions.toggle(pkg)}>{ui.actionEnable}</Button> };
    }
    if (instance.package_state === 'not_installed') {
      const repo = officialAdapters.find(item => item.adapterID === instance.adapter_id)?.repo;
      return { text: ui.adapterMissingNotice.replace('{name}', label), action: repo && <Button size="sm" variant="soft" icon={<Download size={14} />} loading={actions.busy.has(repo)} onClick={() => void reinstall(repo, instance.package_id)}>{ui.actionInstall}</Button> };
    }
    return null;
  };

  return <>
    <PageHeader right={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setAdding(true)}>{ui.addAccount}</Button>} />
    {instances.isError && !instances.data
      ? <EmptyState tone="error" icon={<AlertTriangle size={22} />} title={ui.accountsLoadFailed} description={instances.error.message}
        action={<Button variant="primary" onClick={() => void instances.refetch()}>{ui.retry}</Button>} />
      : <div className={styles.grid}>
        {instances.isPending && Array.from({ length: 2 }, (_, i) => <div key={i} className={styles.card}><Skeleton height={44} width="55%" /><Skeleton height={96} /></div>)}
        {list.slice((current - 1) * pageSize, current * pageSize).map(instance => {
          const issue = adapterIssue(instance);
          const recent = chats.data ? accountChats(chats.data, instance.instance_id) : undefined;
          const tone = issue ? 'warning' : instance.state === 'running' ? 'running' : instance.state === 'failed' ? 'danger' : 'off';
          return <article key={instance.instance_id} className={styles.card} data-tone={tone}>
            <header className={styles.head}>
              <div className={styles.avatar}><AdapterIcon adapterID={instance.adapter_id} /></div>
              <div className={styles.title}>
                <strong>{instance.instance_id}</strong>
                <span>{instance.adapter_id === 'telegram' ? ui.adapterTelegram : instance.adapter_id === 'onebot11' ? ui.adapterOneBot : instance.adapter_id}{instance.default ? ` · ${ui.defaultAccount}` : ''}</span>
              </div>
              <Switch checked={instance.state !== 'stopped'} pending={pending.has(instance.instance_id)} disabled={issue !== null}
                onCheckedChange={on => void change(on ? 'start' : 'stop', instance)} aria-label={`${instance.instance_id} ${ui.actionStart}`} />
            </header>
            <div className={styles.chats}>
              {issue ? <div className={styles.issue}><AlertTriangle size={16} aria-hidden /><span>{issue.text}</span>{issue.action}</div>
                : instance.state === 'stopped' ? <p className={styles.quiet}>{ui.accountStoppedNote}</p>
                : !recent ? <><Skeleton height={14} /><Skeleton height={14} width="70%" /></>
                : recent.length === 0 ? <p className={styles.quiet}>{ui.noAccountChatsHint}</p>
                : <>
                  <ul>{recent.slice(0, 3).map(chat => <ChatRow key={chat.session} chat={chat} profile={assignments.data ? chatProfile(assignments.data, chat.instance_id, chat.session) : undefined} profileName={profileName} />)}</ul>
                  <button type="button" className={styles.allChats} onClick={() => setChatList(instance)}>{ui.allAccountChats.replace('{count}', String(recent.length))}</button>
                </>}
            </div>
            {instance.safe_error && <p className={styles.error}>{instance.safe_error}</p>}
            <footer className={styles.foot}>
              <Menu trigger={<Button size="sm" variant="ghost" iconOnly aria-label={ui.actions}><MoreHorizontal size={18} /></Button>}>
                <MenuItem icon={<Settings2 size={16} />} onSelect={() => setInspecting(instance)}>{ui.accountSettings}</MenuItem>
                <MenuSeparator />
                <MenuItem icon={<Trash2 size={16} />} tone="danger" onSelect={() => setDeleting(instance)}>{ui.actionDelete}</MenuItem>
              </Menu>
              <span className={styles.status}><span className={styles.dot} />{issue ? ui.statusUnavailable : instance.state === 'running' ? ui.statusOnline : instance.state === 'failed' ? ui.statusFailed : ui.statusStopped}</span>
            </footer>
          </article>;
        })}
        {!instances.isPending && <button type="button" className={styles.add} onClick={() => setAdding(true)}>
          <Plus size={22} /><span>{ui.addAccount}</span>
          {list.length === 0 && <small>{ui.addAccountHint}</small>}
        </button>}
      </div>}
    <Pagination page={current} total={list.length + 1} size={pageSize} onChange={setPage} />

    {adding && <AddAccountDialog packages={packages} onClose={() => setAdding(false)} />}
    {deleting && <ConfirmDialog open tone="danger" onOpenChange={open => { if (!open) setDeleting(null); }} title={ui.deleteAccountTitle.replace('{name}', deleting.instance_id)}
      description={ui.deleteAccountDesc} confirmLabel={ui.actionDelete} onConfirm={() => { const target = deleting; setDeleting(null); void change('delete', target); }} />}
    {inspecting && <ConfigDialog instance={inspecting} onClose={() => setInspecting(null)} />}
    {chatList && <ChatsDialog instance={chatList} chats={chats.data ? accountChats(chats.data, chatList.instance_id) : []} assignments={assignments.data} profileName={profileName} onClose={() => setChatList(null)} />}
    {actions.dialogs}
  </>;
}

function ChatRow({ chat, profile, profileName }: { chat: Chat; profile?: string; profileName: (id: string) => string }): JSX.Element {
  return <li className={styles.chat}>
    <span>{chat.title || chat.session}</span>
    {profile && <span className={styles.profile} data-custom={profile !== 'default' || undefined}>{profileName(profile)}</span>}
  </li>;
}

function ChatsDialog({ instance, chats, assignments, profileName, onClose }: {
  instance: AdapterInstance;
  chats: readonly Chat[];
  assignments?: Parameters<typeof chatProfile>[0];
  profileName: (id: string) => string;
  onClose: () => void;
}): JSX.Element {
  const ui = useUI();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const visible = useMemo(() => chats.filter(chat => [chat.title, chat.session].some(value => value.toLowerCase().includes(query.toLowerCase()))), [chats, query]);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }} title={ui.accountChatsTitle.replace('{instance}', instance.instance_id)} size="md">
    <input className={styles.input} value={query} placeholder={ui.searchChats} aria-label={ui.searchChats} onChange={event => { setQuery(event.target.value); setPage(1); }} />
    <ul className={styles.chatList}>{visible.slice((page - 1) * 12, page * 12).map(chat => <ChatRow key={chat.session} chat={chat} profile={assignments ? chatProfile(assignments, chat.instance_id, chat.session) : undefined} profileName={profileName} />)}</ul>
    {visible.length === 0 && <EmptyState title={ui.noAccountChats} />}
    <Pagination page={page} total={visible.length} size={12} onChange={setPage} />
  </Dialog>;
}

/** 脱敏后的实例配置，附带自动修正与未识别键；未识别键可以一键清理。 */
/** Core 读取时把 secret 脱敏成 {"$secret_set": true|false}。 */
function isSecretMask(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1 && typeof (value as Record<string, unknown>).$secret_set === 'boolean';
}

/** 去掉未修改的 secret 占位，Core 对省略的 secret 保留原值。 */
function withoutSecretMarkers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSecretMarkers);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => !isSecretMask(entry)).map(([key, entry]) => [key, withoutSecretMarkers(entry)]));
}

/** 账号配置：与添加账号同一套表单，保存后 Core 以新配置重启该账号。 */
function ConfigDialog({ instance, onClose }: { instance: AdapterInstance; onClose: () => void }): JSX.Element {
  const ui = useUI();
  const { locale } = useUISettings();
  const client = useQueryClient();
  const config = useQuery({ queryKey: ['instance-config', instance.instance_id], queryFn: () => getInstanceConfig(instance.adapter_id, instance.instance_id) });
  const schema = useQuery({ queryKey: ['instance-schema', instance.adapter_id], queryFn: () => getInstanceSchema(instance.adapter_id) });
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>, done: string) => {
    setBusy(true);
    try { await action(); await config.refetch(); void client.invalidateQueries({ queryKey: ['instances'] }); toast.success(done); }
    catch (error) { toast.error(error); }
    finally { setBusy(false); }
  };
  const data = config.data;
  const options = useMemo(() => ({
    list: (path: string, q: string) => listInstanceOptions(instance.adapter_id, instance.instance_id, path, q, locale),
    resolve: (path: string, values: string[]) => resolveInstanceOptions(instance.adapter_id, instance.instance_id, path, values, locale),
  }), [instance.adapter_id, instance.instance_id, locale]);
  const error = config.error ?? schema.error;
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }} title={`${ui.accountSettings} · ${instance.instance_id}`} size="lg" dismissible={!busy}>
    {error ? <EmptyState tone="error" icon={<AlertTriangle size={22} />} title={ui.configLoadFailed} description={error.message} />
      : !data || !schema.data ? <Skeleton height={160} /> : <div className={styles.form}>
      {data.corrections.length > 0 && <div className={styles.notice} data-tone="warning">
        <strong>{ui.corrections}</strong>
        <ul>{data.corrections.map(item => <li key={item.path}><code>{item.path}</code> {ui[item.reason]}</li>)}</ul>
      </div>}
      {data.unknown.length > 0 && <div className={styles.notice} data-tone="danger">
        <strong>{ui.unknownKeys}</strong>
        <ul>{data.unknown.map(key => <li key={key}><code>{key}</code></li>)}</ul>
        <Button size="sm" variant="danger" loading={busy} onClick={() => void run(() => pruneInstanceConfig(instance.adapter_id, instance.instance_id), ui.pruneDone)}>{ui.pruneConfig}</Button>
      </div>}
      <fieldset disabled={busy} className={styles.schema}>
        <ConfigForm schema={schema.data} value={data.config} messages={adapterFieldMessages(ui, instance.adapter_id)} options={options}
          onSubmit={patch => void run(() => updateInstanceConfig(instance.adapter_id, instance.instance_id,
            withoutSecretMarkers(applyMergePatch(data.config, patch)) as Record<string, unknown>), ui.accountConfigSaved)} />
      </fieldset>
    </div>}
  </Dialog>;
}
