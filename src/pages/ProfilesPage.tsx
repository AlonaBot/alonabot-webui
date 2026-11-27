import { useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type JSX } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  Blocks,
  Check,
  ChevronDown,
  Copy,
  Edit2,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { onPackagesChanged } from '../api/client';
import { listPackages, type Package } from '../api/packages';
import {
  createProfile,
  deleteProfile,
  getProfilePlugins,
  listProfiles,
  updateProfile,
  type Profile,
  type ProfilePlugin,
} from '../api/profiles';
import { useUI } from '../i18n/UI';
import { cn } from '../lib/cn';
import { navigate } from '../shell/router';
import { SearchContext } from '../shell/search';
import { Button } from '../ui/Button';
import { ConfirmDialog, Dialog as SharedDialog } from '../ui/Dialog';
import { Skeleton } from '../ui/EmptyState';
import { Menu, MenuItem, MenuSeparator } from '../ui/Menu';
import { SpotlightCard } from '../ui/SpotlightCard';
import { TabBar } from '../ui/Tabs';
import { toast } from '../ui/toast';
import { SessionAccessCard } from '../features/profiles/SessionAccessCard';
import { ProfileAISection } from './ProfileAISection';
import { ProfileAssignmentsDialog } from './ProfileAssignmentsDialog';
import { PROFILE_COLORS, profileColorToken } from './profileColors';
import { ProfilePlatformSection } from './ProfilePlatformSection';
import { ProfilePluginsSection } from './ProfilePluginsSection';

/** ProfilesPage 提供桌面端 Master-Detail 与移动端下拉切换的配置文件管理工作区。 */
export function ProfilesPage(): JSX.Element {
  const ui = useUI();
  const reduced = useReducedMotion();
  const { register } = useContext(SearchContext);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileID, setSelectedProfileID] = useState(
    () => new URLSearchParams(window.location.search).get('profile') || 'default',
  );
  const [packages, setPackages] = useState<Package[]>([]);
  const [profilePlugins, setProfilePlugins] = useState<ProfilePlugin[]>([]);
  const [pluginsProfileID, setPluginsProfileID] = useState('');
  const [activeTab, setActiveTab] = useState<'ai' | 'platform' | 'plugins'>('ai');
  const [loading, setLoading] = useState(true);

  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [dialogName, setDialogName] = useState('');
  const [dialogColor, setDialogColor] = useState('teal');
  const [profileQuery, setProfileQuery] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const requestVersion = useRef(0);

  useEffect(() => {
    const parseProfile = (): string => {
      const search = new URLSearchParams(window.location.search);
      return search.get('profile') || 'default';
    };
    setSelectedProfileID(parseProfile());

    const handlePopState = (): void => {
      setSelectedProfileID(parseProfile());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleSelectProfile = useCallback((id: string) => {
    setSelectedProfileID(id);
    setMobileMenuOpen(false);
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
    try {
      const [profList, pkgList] = await Promise.all([listProfiles(), listPackages()]);
      const targetID = profList.some(p => p.id === selectedProfileID) ? selectedProfileID : 'default';
      const pluginsInProf = await getProfilePlugins(targetID);
      if (version !== requestVersion.current) return;
      setProfiles(profList);
      setPackages(pkgList);
      setProfilePlugins(pluginsInProf);
      setPluginsProfileID(targetID);
      if (targetID !== selectedProfileID) handleSelectProfile(targetID);
    } catch (err: unknown) {
      if (version === requestVersion.current) toast.error(err);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [selectedProfileID, handleSelectProfile]);

  useEffect(() => {
    void loadData();
    const unsubscribe = onPackagesChanged(() => void loadData());
    return () => {
      unsubscribe();
      requestVersion.current++;
    };
  }, [loadData]);

  const currentProfile = useMemo(
    () => profiles.find(p => p.id === selectedProfileID),
    [profiles, selectedProfileID],
  );

  const agentPackage = useMemo(
    () => packages.find(pkg => pkg.Role === 'agent' && !pkg.Uninstalled),
    [packages],
  );

  useEffect(() => {
    if (!loading && !agentPackage && activeTab === 'ai') {
      setActiveTab('platform');
    }
  }, [agentPackage, activeTab, loading]);

  const agentProfilePlugin = profilePlugins.find(p => p.plugin_id === agentPackage?.ID);

  useEffect(() => {
    return register([
      ...profiles.map(p => ({
        id: `profile-switch-${p.id}`,
        title: `${ui.profile}: ${p.name}`,
        section: ui.profiles,
        keywords: [p.name, p.id, 'profile'],
        run: () => handleSelectProfile(p.id),
      })),
      {
        id: 'profile-new',
        title: ui.newProfile,
        section: ui.profiles,
        keywords: ['new', 'create', 'profile'],
        run: () => {
          setDialogName('');
          setDialogColor('teal');
          setDialogError(null);
          setCreateDialogOpen(true);
        },
      },
    ]);
  }, [profiles, register, ui, handleSelectProfile]);

  const openCreateDialog = (): void => {
    setDialogName('');
    setDialogColor('teal');
    setDialogError(null);
    setCreateDialogOpen(true);
  };

  const handleCreateSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!dialogName.trim()) return;
    setDialogError(null);
    setSubmitting(true);
    try {
      const res = await createProfile({ name: dialogName.trim(), color: dialogColor });
      setCreateDialogOpen(false);
      setDialogName('');
      toast.success(ui.saveSuccess);
      handleSelectProfile(res.id);
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : String(err));
      await loadData();
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopySubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!currentProfile || !dialogName.trim()) return;
    setDialogError(null);
    setSubmitting(true);
    try {
      const res = await createProfile({
        name: dialogName.trim(),
        color: dialogColor,
        copy_from: currentProfile.id,
      });
      setCopyDialogOpen(false);
      setDialogName('');
      toast.success(ui.saveSuccess);
      await loadData();
      handleSelectProfile(res.id);
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : String(err));
      await loadData();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRenameSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!currentProfile || !dialogName.trim()) return;
    setDialogError(null);
    setSubmitting(true);
    try {
      await updateProfile(currentProfile.id, { name: dialogName.trim(), color: dialogColor });
      setRenameDialogOpen(false);
      setDialogName('');
      toast.success(ui.saveSuccess);
      await loadData();
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : String(err));
      await loadData();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSubmit = async (): Promise<void> => {
    if (!currentProfile || currentProfile.id === 'default') return;
    setDialogError(null);
    setSubmitting(true);
    try {
      await deleteProfile(currentProfile.id);
      setDeleteDialogOpen(false);
      handleSelectProfile('default');
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : String(err));
      await loadData();
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProfiles = useMemo(() => {
    const q = profileQuery.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(p => `${p.name} ${p.id}`.toLowerCase().includes(q));
  }, [profiles, profileQuery]);

  if (!currentProfile) {
    return (
      <div className="grid gap-5 lg:grid-cols-[276px_minmax(0,1fr)]">
        <SpotlightCard className="hidden p-4 lg:block">
          <div className="space-y-2.5">
            <Skeleton height={36} />
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
        </SpotlightCard>
        <div className="space-y-4">
          <SpotlightCard className="p-5">
            <Skeleton height={34} width={220} />
          </SpotlightCard>
          <SpotlightCard className="p-5">
            <Skeleton height={220} />
          </SpotlightCard>
        </div>
      </div>
    );
  }

  const currentColor = profileColorToken(currentProfile.color);

  const tabItems = [
    ...(agentPackage
      ? [
          {
            value: 'ai',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Sparkles size={15} aria-hidden="true" />
                {ui.tabAI}
              </span>
            ),
          },
        ]
      : []),
    {
      value: 'platform',
      label: (
        <span className="inline-flex items-center gap-1.5">
          <MessageSquare size={15} aria-hidden="true" />
          {ui.tabPlatform}
        </span>
      ),
    },
    {
      value: 'plugins',
      label: (
        <span className="inline-flex items-center gap-1.5">
          <Blocks size={15} aria-hidden="true" />
          {ui.tabPlugins}
        </span>
      ),
      count: profilePlugins.length || undefined,
    },
  ];

  const colorPicker = (
    <div className="space-y-2">
      <span className="block text-xs font-semibold text-[var(--color-ink-muted)]">{ui.profileColor}</span>
      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={ui.profileColor}>
        {PROFILE_COLORS.map(color => {
          const token = profileColorToken(color);
          const active = dialogColor === color;
          const label = ui[`profileColor_${color}` as keyof typeof ui];
          return (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setDialogColor(color)}
              className={cn(
                'flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-medium transition-all duration-150',
                active
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)] shadow-xs'
                  : 'border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-ink-muted)] hover:border-[var(--color-accent)]/50 hover:text-[var(--color-ink)]',
              )}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: token.dot, boxShadow: `0 0 0 3px ${token.ring}` }}
                aria-hidden="true"
              />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[276px_minmax(0,1fr)]">
      {/* 桌面端左侧配置文件导航栏 */}
      <aside className="hidden lg:sticky lg:top-[76px] lg:block" aria-label={ui.profiles}>
        <SpotlightCard className="p-3.5">
          <div className="mb-3 flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-tight text-[var(--color-ink)]">{ui.profiles}</h2>
              <span className="tabular-nums rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-ink-muted)]">
                {profiles.length}
              </span>
            </div>
            <Button
              size="sm"
              variant="soft"
              iconOnly
              aria-label={ui.newProfile}
              title={ui.newProfile}
              onClick={openCreateDialog}
            >
              <Plus size={15} />
            </Button>
          </div>

          {profiles.length > 3 && (
            <div className="relative mb-2.5">
              <Search
                size={14}
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-ink-muted)]"
              />
              <input
                type="search"
                aria-label={ui.searchProfiles}
                placeholder={ui.searchProfiles}
                value={profileQuery}
                onChange={event => setProfileQuery(event.target.value)}
                className="h-9 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] pr-3 pl-8.5 text-xs text-[var(--color-ink)] outline-none transition-all focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-accent)_20%,transparent)]"
              />
            </div>
          )}

          <div className="space-y-1">
            {filteredProfiles.map(profile => {
              const active = profile.id === currentProfile.id;
              const token = profileColorToken(profile.color);
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => handleSelectProfile(profile.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150',
                    active
                      ? 'text-[var(--color-ink)]'
                      : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)]/70 hover:text-[var(--color-ink)]',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="profile-active-rail"
                      transition={reduced ? { duration: 0.01 } : { type: 'spring', stiffness: 460, damping: 36 }}
                      className="absolute inset-0 rounded-xl border border-[color-mix(in_srgb,var(--color-accent)_32%,var(--color-glass-border))] bg-[var(--color-accent-soft)]"
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className="relative z-10 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: token.dot, boxShadow: `0 0 0 3px ${token.ring}` }}
                    aria-hidden="true"
                  />
                  <span className="relative z-10 min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{profile.name}</span>
                    <span className="block truncate text-[11px] text-[var(--color-ink-muted)]">
                      {ui.sessionCount.replace('{count}', String(profile.sessions))}
                    </span>
                  </span>
                  {active && <Check size={14} className="relative z-10 shrink-0 text-[var(--color-accent)]" />}
                </button>
              );
            })}
            {filteredProfiles.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-[var(--color-ink-muted)]">{ui.noEntries}</p>
            )}
          </div>

          <div className="mt-3 border-t border-[var(--color-line)]/70 pt-3">
            <Button variant="secondary" size="sm" icon={<Plus size={14} />} className="w-full" onClick={openCreateDialog}>
              {ui.newProfile}
            </Button>
          </div>
        </SpotlightCard>
      </aside>

      {/* 右侧主配置区 */}
      <div className="min-w-0 space-y-5">
        {/* 头部卡片：当前配置身份、使用范围入口与管理菜单 */}
        <SpotlightCard className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              {/* 移动端配置文件切换菜单 */}
              <div className="lg:hidden">
                <Menu
                  open={mobileMenuOpen}
                  onOpenChange={setMobileMenuOpen}
                  align="start"
                  trigger={
                    <button
                      type="button"
                      className="inline-flex max-w-full items-center gap-2.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)]/80 px-3 py-2 text-left transition-colors hover:border-[var(--color-accent)]/50"
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: currentColor.dot, boxShadow: `0 0 0 4px ${currentColor.ring}` }}
                        aria-hidden="true"
                      />
                      <span className="truncate text-base font-bold text-[var(--color-ink)]">{currentProfile.name}</span>
                      <ChevronDown size={16} className="shrink-0 text-[var(--color-ink-muted)]" />
                    </button>
                  }
                >
                  {profiles.map(profile => {
                    const token = profileColorToken(profile.color);
                    return (
                      <MenuItem
                        key={profile.id}
                        icon={
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: token.dot }}
                            aria-hidden="true"
                          />
                        }
                        onSelect={() => handleSelectProfile(profile.id)}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="truncate">{profile.name}</span>
                          <span className="text-xs text-[var(--color-ink-muted)]">{profile.sessions}</span>
                        </span>
                      </MenuItem>
                    );
                  })}
                  <MenuSeparator />
                  <MenuItem icon={<Plus size={15} />} onSelect={openCreateDialog}>
                    {ui.newProfile}
                  </MenuItem>
                </Menu>
              </div>

              {/* 桌面端配置标题 */}
              <div className="hidden min-w-0 items-center gap-3 lg:flex">
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full"
                  style={{ backgroundColor: currentColor.dot, boxShadow: `0 0 0 5px ${currentColor.ring}` }}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <h1 className="truncate text-xl font-bold tracking-tight text-[var(--color-ink)]">
                    {currentProfile.name}
                  </h1>
                  <p className="font-mono text-xs text-[var(--color-ink-muted)]">{currentProfile.id}</p>
                </div>
              </div>

              {/* 会话数与使用范围入口胶囊 */}
              <button
                type="button"
                onClick={() => setScopeDialogOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)]/85 px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] transition-all hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent-strong)]"
              >
                <Users size={13} aria-hidden="true" />
                <span className="tabular-nums">
                  {ui.sessionCount.replace('{count}', String(currentProfile.sessions))}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus size={14} />}
                className="lg:hidden"
                onClick={openCreateDialog}
              >
                {ui.newProfile}
              </Button>
              <Menu
                align="end"
                trigger={
                  <Button variant="secondary" size="sm" iconOnly aria-label={ui.actions}>
                    <MoreHorizontal size={17} />
                  </Button>
                }
              >
                <MenuItem
                  icon={<Edit2 size={15} />}
                  onSelect={() => {
                    setDialogName(currentProfile.name);
                    setDialogColor(currentProfile.color);
                    setDialogError(null);
                    setRenameDialogOpen(true);
                  }}
                >
                  {ui.renameProfile}
                </MenuItem>
                <MenuItem
                  icon={<Copy size={15} />}
                  onSelect={() => {
                    setDialogName(ui.profileCopyName.replace('{name}', currentProfile.name));
                    setDialogColor(currentProfile.color);
                    setDialogError(null);
                    setCopyDialogOpen(true);
                  }}
                >
                  {ui.copyProfile}
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  icon={<Trash2 size={15} />}
                  tone="danger"
                  disabled={currentProfile.id === 'default'}
                  onSelect={() => {
                    if (currentProfile.id === 'default') return;
                    setDialogError(null);
                    setDeleteDialogOpen(true);
                  }}
                >
                  {ui.deleteProfile}
                </MenuItem>
              </Menu>
            </div>
          </div>

          {/* 内部标签条 */}
          <div className="mt-4">
            <TabBar
              value={activeTab}
              onValueChange={value => setActiveTab(value as typeof activeTab)}
              aria-label={ui.profiles}
              items={tabItems}
            />
          </div>
        </SpotlightCard>

        {/* 未安装 Agent 提示横幅 */}
        {!agentPackage && !loading && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--color-warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_10%,var(--color-surface))] px-4 py-3 text-sm text-[var(--color-warning-ink)]">
            <span className="inline-flex items-center gap-2 font-medium">
              <AlertTriangle size={16} aria-hidden="true" />
              {ui.profileNeedsAgent}
            </span>
            <Button size="sm" variant="soft" onClick={() => navigate('/models')}>
              {ui.setUpAgent}
            </Button>
          </div>
        )}

        {/* 分区内容 */}
        <motion.div
          key={`${currentProfile.id}:${activeTab}`}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduced ? 0.01 : 0.14, ease: 'easeOut' }}
          className="space-y-5"
        >
          {pluginsProfileID !== currentProfile.id && activeTab !== 'platform' && (
            <SpotlightCard className="p-5">
              <Skeleton height={160} />
            </SpotlightCard>
          )}
          {pluginsProfileID === currentProfile.id && activeTab === 'ai' && agentPackage && agentProfilePlugin && (
            <ProfileAISection
              profileID={currentProfile.id}
              agent={agentPackage}
              plugin={agentProfilePlugin}
              onChanged={loadData}
            />
          )}
          {activeTab === 'platform' && (
            <>
              <ProfilePlatformSection profileID={currentProfile.id} />
              <SessionAccessCard profileID={currentProfile.id} />
            </>
          )}
          {pluginsProfileID === currentProfile.id && activeTab === 'plugins' && (
            <ProfilePluginsSection
              profileID={currentProfile.id}
              packages={packages}
              plugins={profilePlugins}
              onChanged={loadData}
            />
          )}
        </motion.div>
      </div>

      {/* 使用范围弹窗 */}
      <ProfileAssignmentsDialog
        profile={currentProfile}
        open={scopeDialogOpen}
        onOpenChange={setScopeDialogOpen}
        onChanged={loadData}
      />

      {/* 新建、复制、重命名共用名称与颜色表单 */}
      {(
        [
          [createDialogOpen, setCreateDialogOpen, ui.newProfile, ui.createProfile, handleCreateSubmit],
          [copyDialogOpen, setCopyDialogOpen, ui.copyProfileTitle, ui.copyProfile, handleCopySubmit],
          [renameDialogOpen, setRenameDialogOpen, ui.renameProfile, ui.save, handleRenameSubmit],
        ] as const
      ).map(
        ([open, setOpen, title, submit, onSubmit]) =>
          open && (
            <SharedDialog
              key={title}
              open
              onOpenChange={setOpen}
              title={title}
              size="sm"
              footer={
                <>
                  <Button onClick={() => setOpen(false)} disabled={submitting}>
                    {ui.cancel}
                  </Button>
                  <Button type="submit" form="profile-name-form" variant="primary" loading={submitting}>
                    {submit}
                  </Button>
                </>
              }
            >
              <form id="profile-name-form" className="space-y-4" onSubmit={e => void onSubmit(e)}>
                {dialogError && (
                  <p className="form-error mb-0" role="alert">
                    {dialogError}
                  </p>
                )}
                <label className="block space-y-1.5">
                  <span className="block text-xs font-semibold text-[var(--color-ink-muted)]">{ui.profileName}</span>
                  <input
                    type="text"
                    required
                    placeholder={ui.profileNamePlaceholder}
                    value={dialogName}
                    autoFocus
                    onChange={e => setDialogName(e.currentTarget.value)}
                    className="h-10 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3.5 text-sm text-[var(--color-ink)] outline-none transition-all focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-accent)_22%,transparent)]"
                  />
                </label>
                {colorPicker}
              </form>
            </SharedDialog>
          ),
      )}

      {deleteDialogOpen && (
        <ConfirmDialog
          open
          tone="danger"
          pending={submitting}
          title={ui.deleteProfile}
          confirmLabel={ui.deleteProfile}
          onOpenChange={setDeleteDialogOpen}
          onConfirm={() => void handleDeleteSubmit()}
        >
          <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">
            {ui.deleteProfileConfirm
              .replace('{name}', currentProfile.name)
              .replace('{count}', String(currentProfile.sessions))}
          </p>
          {dialogError && (
            <p className="form-error mt-3 mb-0" role="alert">
              {dialogError}
            </p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
