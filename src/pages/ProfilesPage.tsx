import { useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type JSX } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Check,
  ChevronDown,
  Copy,
  Edit2,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  createProfile,
  deleteProfile,
  getProfilePlugins,
  listPackages,
  listProfiles,
  onPackagesChanged,
  updateProfile,
  type Package,
  type Profile,
  type ProfilePlugin,
} from '../api/admin';
import { useUI } from '../i18n/UI';
import { navigate } from '../shell/router';
import { SearchContext } from '../shell/search';
import { ProfileAssignmentsDialog } from './ProfileAssignmentsDialog';
import { ProfileAISection } from './ProfileAISection';
import { ProfilePlatformSection } from './ProfilePlatformSection';
import { ProfilePluginsSection } from './ProfilePluginsSection';

/** ProfilesPage 负责配置文件的多标签展示、切换、增删改查及使用范围设定。 */
export function ProfilesPage(): JSX.Element {
  const ui = useUI();
  const { register } = useContext(SearchContext);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileID, setSelectedProfileID] = useState(() => new URLSearchParams(window.location.search).get('profile') || 'default');
  const [packages, setPackages] = useState<Package[]>([]);
  const [profilePlugins, setProfilePlugins] = useState<ProfilePlugin[]>([]);
  const [pluginsProfileID, setPluginsProfileID] = useState('');
  const [activeTab, setActiveTab] = useState<'ai' | 'platform' | 'plugins'>('ai');
  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // 对话框状态
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // 对话框表单数据
  const [dialogName, setDialogName] = useState('');
  const [dialogColor, setDialogColor] = useState('teal');
  const [profileQuery, setProfileQuery] = useState('');
  const requestVersion = useRef(0);
  const [dialogError, setDialogError] = useState<string | null>(null);

  // 读取 URL 参数同步
  useEffect(() => {
    const parseProfile = () => {
      const search = new URLSearchParams(window.location.search);
      return search.get('profile') || 'default';
    };
    setSelectedProfileID(parseProfile());

    const handlePopState = () => {
      setSelectedProfileID(parseProfile());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleSelectProfile = useCallback((id: string) => {
    setSelectedProfileID(id);
    const url = new URL(window.location.href);
    if (id === 'default') {
      url.searchParams.delete('profile');
    } else {
      url.searchParams.set('profile', id);
    }
    navigate(url.pathname + url.search);
  }, []);

  const loadData = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setErrorBanner(null);
    try {
      const [profList, pkgList] = await Promise.all([
        listProfiles(),
        listPackages(),
      ]);
      const targetID = profList.some(p => p.id === selectedProfileID) ? selectedProfileID : 'default';
      const pluginsInProf = await getProfilePlugins(targetID);
      if (version !== requestVersion.current) return;
      setProfiles(profList); setPackages(pkgList); setProfilePlugins(pluginsInProf);
      setPluginsProfileID(targetID);
      if (targetID !== selectedProfileID) handleSelectProfile(targetID);
    } catch (err: unknown) {
      if (version === requestVersion.current) setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [selectedProfileID, handleSelectProfile]);

  useEffect(() => {
    void loadData();
    const unsubscribe = onPackagesChanged(() => void loadData());
    return () => { unsubscribe(); requestVersion.current++; };
  }, [loadData]);

  const currentProfile = useMemo(() => {
    return profiles.find(p => p.id === selectedProfileID);
  }, [profiles, selectedProfileID]);

  // 检测 Agent 安装状态
  const agentPackage = useMemo(() => {
    return packages.find(pkg => pkg.Role === 'agent' && !pkg.Uninstalled);
  }, [packages]);

  // 如果无 Agent 且当前处于 AI 标签，自动切换到平台标签
  useEffect(() => {
    if (!loading && !agentPackage && activeTab === 'ai') {
      setActiveTab('platform');
    }
  }, [agentPackage, activeTab, loading]);

  const agentProfilePlugin = profilePlugins.find(p => p.plugin_id === agentPackage?.ID);

  // 注册全局搜索命令
  useEffect(() => {
    return register([
      ...profiles.map(p => ({
        id: `profile-switch-${p.id}`,
        title: `${ui.profile}: ${p.name}`,
        section: ui.profiles,
        keywords: [p.name, p.id, 'profile'],
        run: () => {
          handleSelectProfile(p.id);
        },
      })),
      {
        id: 'profile-new',
        title: ui.newProfile,
        section: ui.profiles,
        keywords: ['new', 'create', 'profile'],
        run: () => {
          setDialogName(''); setDialogColor('teal');
          setDialogError(null);
          setCreateDialogOpen(true);
        },
      },
    ]);
  }, [profiles, register, ui, handleSelectProfile]);

  // 创建配置文件提交
  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!dialogName.trim()) return;
    setDialogError(null);
    try {
      const res = await createProfile({ name: dialogName.trim(), color: dialogColor });
      setCreateDialogOpen(false);
      setDialogName('');
      handleSelectProfile(res.id);
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : String(err));
      await loadData();
    }
  };

  // 复制配置文件提交
  const handleCopySubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!dialogName.trim()) return;
    setDialogError(null);
    try {
      const res = await createProfile({
        name: dialogName.trim(),
        color: dialogColor,
        copy_from: currentProfile!.id,
      });
      setCopyDialogOpen(false);
      setDialogName('');
      await loadData();
      handleSelectProfile(res.id);
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : String(err));
      await loadData();
    }
  };

  // 重命名配置文件提交
  const handleRenameSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!dialogName.trim()) return;
    setDialogError(null);
    try {
      await updateProfile(currentProfile!.id, { name: dialogName.trim(), color: dialogColor });
      setRenameDialogOpen(false);
      setDialogName('');
      await loadData();
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : String(err));
      await loadData();
    }
  };

  // 删除配置文件提交
  const handleDeleteSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (currentProfile!.id === 'default') return;
    setDialogError(null);
    try {
      await deleteProfile(currentProfile!.id);
      setDeleteDialogOpen(false);
      handleSelectProfile('default');
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : String(err));
      await loadData();
    }
  };

  if (!currentProfile) return <div className="profiles-page">{errorBanner ? <p role="alert">{errorBanner}</p> : <p role="status">{ui.loading}</p>}</div>;

  const colorControl = <label className="dialog-form-field"><span>{ui.profileColor}</span><select aria-label={ui.profileColor} value={dialogColor} onChange={event => setDialogColor(event.target.value)}>{['teal', 'navy', 'amber', 'pink', 'green', 'purple', 'red', 'gray'].map(color => <option key={color} value={color}>{ui[`profileColor_${color}` as keyof typeof ui]}</option>)}</select></label>;
  return (
    <div className="profiles-page">
      {/* 头部：● 名称 ⌄、会话数入口、⋯ 操作菜单 */}
      <div className="profiles-header">
        <div className="profiles-header-left">
          {/* 配置文件切换下拉菜单 */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button type="button" className="profile-title-switcher">
                <span className={`profile-dot profile-color-${currentProfile.color}`} />
                <h1 className="profile-active-title">{currentProfile.name}</h1>
                <ChevronDown size={18} className="profile-switcher-chevron" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="dropdown-menu-content profile-menu-content" align="start" sideOffset={6}>
                <input aria-label={ui.searchProfiles} placeholder={ui.searchProfiles} value={profileQuery} onChange={event => setProfileQuery(event.target.value)} onKeyDown={event => { if (event.key.length === 1) event.stopPropagation(); }} />
                {profiles.filter(p => (p.name + p.id).toLowerCase().includes(profileQuery.toLowerCase())).map(p => (
                  <DropdownMenu.Item
                    key={p.id}
                    className={`dropdown-menu-item profile-menu-item ${p.id === currentProfile.id ? 'is-selected' : ''}`}
                    onSelect={() => handleSelectProfile(p.id)}
                  >
                    <div className="profile-menu-item-text">
                      <span className="profile-menu-name">{p.name}</span>
                      <span className="profile-menu-sessions">
                        {ui.sessionCount.replace('{count}', String(p.sessions))}
                      </span>
                    </div>
                    {p.id === currentProfile.id && <Check size={16} className="profile-menu-check" />}
                  </DropdownMenu.Item>
                ))}
                <DropdownMenu.Separator className="dropdown-menu-separator" />
                <DropdownMenu.Item
                  className="dropdown-menu-item profile-menu-new"
                  onSelect={() => {
                    setDialogName(''); setDialogColor('teal');
                    setDialogError(null);
                    setCreateDialogOpen(true);
                  }}
                >
                  <Plus size={16} />
                  <span>{ui.newProfile}</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          {/* 会话数超链接 */}
          <button
            type="button"
            className="profile-sessions-link"
            onClick={() => setScopeDialogOpen(true)}
          >
            {ui.sessionCount.replace('{count}', String(currentProfile.sessions))}
          </button>
        </div>

        <div className="profiles-header-right">
          {/* ⋯ 更多操作菜单 */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button type="button" className="detail-icon-button" aria-label={ui.actions}>
                <MoreHorizontal size={18} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="dropdown-menu-content" align="end" sideOffset={6}>
                <DropdownMenu.Item
                  className="dropdown-menu-item"
                  onSelect={() => {
                    setDialogName(currentProfile.name); setDialogColor(currentProfile.color);
                    setDialogError(null);
                    setRenameDialogOpen(true);
                  }}
                >
                  <Edit2 size={15} />
                  <span>{ui.renameProfile}</span>
                </DropdownMenu.Item>

                <DropdownMenu.Item
                  className="dropdown-menu-item"
                  onSelect={() => {
                    setDialogName(ui.profileCopyName.replace('{name}', currentProfile.name)); setDialogColor(currentProfile.color);
                    setDialogError(null);
                    setCopyDialogOpen(true);
                  }}
                >
                  <Copy size={15} />
                  <span>{ui.copyProfile}</span>
                </DropdownMenu.Item>

                <DropdownMenu.Separator className="dropdown-menu-separator" />

                <DropdownMenu.Item
                  className={`dropdown-menu-item is-danger ${currentProfile.id === 'default' ? 'is-disabled' : ''}`}
                  disabled={currentProfile.id === 'default'}
                  onSelect={() => {
                    if (currentProfile.id === 'default') return;
                    setDialogError(null);
                    setDeleteDialogOpen(true);
                  }}
                >
                  <Trash2 size={15} />
                  <span>{ui.deleteProfile}</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      {errorBanner && (
        <div className="plugins-error-banner" role="alert">
          <span>{errorBanner}</span>
          <button type="button" className="error-banner-close" aria-label={ui.close} onClick={() => setErrorBanner(null)}>
            &times;
          </button>
        </div>
      )}

      {!agentPackage && !loading && <div className="profile-no-agent-banner"><span>{ui.noAgentInstalled}</span><button type="button" onClick={() => navigate('/components?tab=store')}>{ui.goToStore}</button></div>}

      {/* 子标签导航：AI / 平台与消息 / 插件 */}
      <div className="profile-tabs">
        {agentPackage && (
          <button
            type="button"
            className={`profile-tab-btn ${activeTab === 'ai' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('ai')}
          >
            {ui.tabAI}
          </button>
        )}
        <button
          type="button"
          className={`profile-tab-btn ${activeTab === 'platform' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('platform')}
        >
          {ui.tabPlatform}
        </button>
        <button
          type="button"
          className={`profile-tab-btn ${activeTab === 'plugins' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('plugins')}
        >
          {ui.tabPlugins}
        </button>
      </div>

      {/* 分区内容渲染 */}
      <div className="profile-tab-content" key={currentProfile.id}>
        {pluginsProfileID !== currentProfile.id && <p role="status">{ui.loading}</p>}
        {pluginsProfileID === currentProfile.id && activeTab === 'ai' && agentPackage && agentProfilePlugin && (
          <ProfileAISection
            profileID={currentProfile.id}
            agent={agentPackage}
            plugin={agentProfilePlugin}
            onChanged={loadData}
          />
        )}
        {activeTab === 'platform' && (
          <ProfilePlatformSection profileID={currentProfile.id} />
        )}
        {pluginsProfileID === currentProfile.id && activeTab === 'plugins' && (
          <ProfilePluginsSection
            profileID={currentProfile.id}
            packages={packages}
            plugins={profilePlugins}
            onChanged={loadData}
          />
        )}
      </div>

      {/* 使用范围弹窗 */}
      <ProfileAssignmentsDialog
        profile={currentProfile}
        open={scopeDialogOpen}
        onOpenChange={setScopeDialogOpen}
        onChanged={loadData}
      />

      {/* 新建配置文件弹窗 */}
      <Dialog.Root open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content profile-action-dialog" aria-describedby={undefined}>
            <div className="dialog-header">
              <Dialog.Title className="dialog-title">{ui.newProfile}</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="dialog-close" aria-label={ui.close}>
                  <X size={18} />
                </button>
              </Dialog.Close>
            </div>
            <form onSubmit={handleCreateSubmit}>
              <div className="dialog-form-body">
                <label className="dialog-form-field">
                  <span>{ui.profileName}</span>
                  <input
                    type="text"
                    required
                    placeholder={ui.profileNamePlaceholder}
                    value={dialogName}
                    autoFocus
                    onChange={e => setDialogName(e.currentTarget.value)}
                  />
                </label>
                {colorControl}
                {dialogError && <p className="form-error" role="alert">{dialogError}</p>}
              </div>
              <div className="dialog-actions">
                <button type="button" className="dialog-button" onClick={() => setCreateDialogOpen(false)}>
                  {ui.close}
                </button>
                <button type="submit" className="dialog-button is-primary">
                  {ui.createProfile}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* 复制配置文件弹窗 */}
      <Dialog.Root open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content profile-action-dialog" aria-describedby={undefined}>
            <div className="dialog-header">
              <Dialog.Title className="dialog-title">{ui.copyProfileTitle}</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="dialog-close" aria-label={ui.close}>
                  <X size={18} />
                </button>
              </Dialog.Close>
            </div>
            <form onSubmit={handleCopySubmit}>
              <div className="dialog-form-body">
                <label className="dialog-form-field">
                  <span>{ui.profileName}</span>
                  <input
                    type="text"
                    required
                    placeholder={ui.profileNamePlaceholder}
                    value={dialogName}
                    autoFocus
                    onChange={e => setDialogName(e.currentTarget.value)}
                  />
                </label>
                {colorControl}
                {dialogError && <p className="form-error" role="alert">{dialogError}</p>}
              </div>
              <div className="dialog-actions">
                <button type="button" className="dialog-button" onClick={() => setCopyDialogOpen(false)}>
                  {ui.close}
                </button>
                <button type="submit" className="dialog-button is-primary">
                  {ui.copyProfile}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* 重命名配置文件弹窗 */}
      <Dialog.Root open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content profile-action-dialog" aria-describedby={undefined}>
            <div className="dialog-header">
              <Dialog.Title className="dialog-title">{ui.renameProfile}</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="dialog-close" aria-label={ui.close}>
                  <X size={18} />
                </button>
              </Dialog.Close>
            </div>
            <form onSubmit={handleRenameSubmit}>
              <div className="dialog-form-body">
                <label className="dialog-form-field">
                  <span>{ui.profileName}</span>
                  <input
                    type="text"
                    required
                    placeholder={ui.profileNamePlaceholder}
                    value={dialogName}
                    autoFocus
                    onChange={e => setDialogName(e.currentTarget.value)}
                  />
                </label>
                {colorControl}
                {dialogError && <p className="form-error" role="alert">{dialogError}</p>}
              </div>
              <div className="dialog-actions">
                <button type="button" className="dialog-button" onClick={() => setRenameDialogOpen(false)}>
                  {ui.close}
                </button>
                <button type="submit" className="dialog-button is-primary">
                  {ui.save}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* 删除配置文件确认弹窗 */}
      <Dialog.Root open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content profile-action-dialog" aria-describedby={undefined}>
            <div className="dialog-header">
              <Dialog.Title className="dialog-title">{ui.deleteProfile}</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="dialog-close" aria-label={ui.close}>
                  <X size={18} />
                </button>
              </Dialog.Close>
            </div>
            <form onSubmit={handleDeleteSubmit}>
              <div className="dialog-form-body">
                <p className="dialog-delete-warning">
                  {ui.deleteProfileConfirm.replace('{name}', currentProfile.name).replace('{count}', String(currentProfile.sessions))}
                </p>
                {dialogError && <p className="form-error" role="alert">{dialogError}</p>}
              </div>
              <div className="dialog-actions">
                <button type="button" className="dialog-button" onClick={() => setDeleteDialogOpen(false)}>
                  {ui.close}
                </button>
                <button type="submit" className="dialog-button is-danger">
                  {ui.deleteProfile}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
