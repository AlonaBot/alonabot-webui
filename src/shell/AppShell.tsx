import { useCallback, useMemo, useState, type JSX, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AppWindow, Languages, Laptop, Moon, Puzzle, RotateCw, ScrollText, Sun, Wrench } from 'lucide-react';
import { changePackage } from '../api/packages';
import { useUI } from '../i18n/UI';
import { packageName } from '../features/plugins/usePackageActions';
import { installed, usePackages } from '../queries/packages';
import { routes } from '../routes';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { toast } from '../ui/toast';
import { InspectorContext, type InspectorTab } from './inspector';
import { MobileTabBar } from './MobileTabBar';
import { PageHeaderSlots } from './PageHeader';
import { QuickInspector } from './QuickInspector';
import { navigate, usePath, useQueryParam } from './router';
import { SearchContext, type SearchItem } from './search';
import { useUISettings } from './settings';
import { Sidebar, type NavEntry } from './Sidebar';
import { TopBar } from './TopBar';

/** 插件页面在详情页里以标签打开；侧栏与搜索共用这个地址。 */
export function pluginPagePath(pluginID: string, page: string): string {
  return `/pages/${encodeURIComponent(pluginID)}?path=${encodeURIComponent(page)}`;
}

/**
 * 新版管理界面外壳：分组桌面侧栏 + Core 状态胶囊、玻璃顶栏、可执行 ⌘K 命令面板、
 * 全局右侧滑出 Quick Inspector 抽屉与移动端悬浮 Dock。
 */
export function AppShell({
  version,
  coreStartedAt,
  entering,
  onLogout,
  coreUpdate,
  coreUpdateFailed,
  children,
}: {
  version: string;
  coreStartedAt?: string;
  entering?: boolean;
  onLogout?: () => void;
  coreUpdate?: { version: string; releaseURL: string };
  coreUpdateFailed?: boolean;
  children: ReactNode;
}): JSX.Element {
  const ui = useUI();
  const reduced = useReducedMotion();
  const { locale, setLocale, setTheme } = useUISettings();
  const labels = ui as Record<string, string>;
  const path = usePath();
  const pagePath = useQueryParam('path');
  // 外壳侧栏与命令面板不因 403 抛出到顶层，确保页面边界展示 403 状态页时导航仍保持可用。
  const packageQuery = usePackages({ throwOnError: false });
  const packages = useMemo(() => installed(packageQuery.data), [packageQuery.data]);
  const agentMissing = packageQuery.isSuccess && !packages.some(item => item.Role === 'agent');

  const [inspectorID, setInspectorID] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('overview');
  const openComponent = useCallback((id: string, tab: InspectorTab = 'overview') => {
    setInspectorID(id);
    setInspectorTab(tab);
  }, []);
  const closeInspector = useCallback(() => setInspectorID(null), []);
  const inspectorValue = useMemo(() => ({ openComponent, close: closeInspector }), [openComponent, closeInspector]);

  const pageEntries = useMemo<NavEntry[]>(
    () =>
      packages.flatMap(item =>
        (item.pages ?? [])
          .filter(page => page.purpose !== 'instance_config')
          .map(page => ({
            id: `page:${item.ID}:${page.path}`,
            label: page.title,
            icon: AppWindow,
            to: pluginPagePath(item.ID, page.path),
            active: path === `/pages/${encodeURIComponent(item.ID)}` && pagePath === page.path,
            disabledReason: item.Enabled ? undefined : ui.pluginPageDisabled,
          })),
      ),
    [packages, path, pagePath, ui],
  );
  const onPluginPage = pageEntries.some(entry => entry.active);

  const routeEntry = useCallback(
    (route: (typeof routes)[number]): NavEntry => ({
      id: route.id,
      label: labels[route.label],
      icon: route.icon,
      to: route.path,
      active: path === route.path || (path.startsWith(`${route.path}/`) && !(route.path === '/components' && onPluginPage)),
      disabledReason: route.id === 'models' && agentMissing ? ui.modelsNeedAgent : undefined,
    }),
    [labels, path, onPluginPage, agentMissing, ui],
  );

  const mainEntries = useMemo(
    () => [...routes.filter(route => route.group === 'main' && route.navigation !== false).map(routeEntry), ...pageEntries],
    [routeEntry, pageEntries],
  );
  const bottomEntries = useMemo(() => routes.filter(route => route.group === 'bottom').map(routeEntry), [routeEntry]);

  const [registered, setRegistered] = useState<SearchItem[]>([]);
  const [openRequest, setOpenRequest] = useState(0);
  const register = useCallback((items: SearchItem[]) => {
    setRegistered(previous => [...previous, ...items]);
    return () => setRegistered(previous => previous.filter(item => !items.includes(item)));
  }, []);
  const openSearch = useCallback(() => setOpenRequest(value => value + 1), []);
  const searchContext = useMemo(() => ({ register, open: openSearch }), [register, openSearch]);

  // 合并页面跳转、已装组件快捷检查/重载动作与全局设置动作。
  const searchItems = useMemo<SearchItem[]>(() => {
    const navItems: SearchItem[] = mainEntries
      .concat(bottomEntries)
      .filter(entry => !entry.disabledReason)
      .map(entry => ({
        id: `nav-${entry.id}`,
        title: entry.label,
        section: ui.pageSection,
        icon: entry.icon,
        keywords: [entry.to, entry.id],
        run: () => navigate(entry.to),
      }));

    const componentActions: SearchItem[] = packages.flatMap(pkg => {
      const name = packageName(pkg);
      const list: SearchItem[] = [
        {
          id: `inspect-${pkg.ID}`,
          title: name,
          section: ui.plugins,
          icon: Puzzle,
          context: ui.quickInspect,
          value: `v${pkg.Version}`,
          keywords: [pkg.ID, pkg.Role, 'inspect', 'plugin'],
          run: () => openComponent(pkg.ID, 'overview'),
        },
      ];
      if (pkg.Role !== 'webui' && pkg.State === 'Activated') {
        list.push({
          id: `reload-${pkg.ID}`,
          title: `${ui.actionReload} ${name}`,
          section: ui.commandSectionActions,
          icon: RotateCw,
          context: pkg.ID,
          keywords: ['reload', 'restart', pkg.ID, name],
          run: () => {
            void changePackage('reload', pkg.ID)
              .then(() => toast.success(ui.reloadedSuccess))
              .catch((error: unknown) => toast.error(error));
          },
        });
      }
      return list;
    });

    const quickCommands: SearchItem[] = [
      {
        id: 'cmd-theme-dark',
        title: `${ui.themeMode}: ${ui.themeDark}`,
        section: ui.commandSectionActions,
        icon: Moon,
        keywords: ['dark', 'theme', 'night', '深色', '暗黑'],
        run: () => setTheme('dark'),
      },
      {
        id: 'cmd-theme-light',
        title: `${ui.themeMode}: ${ui.themeLight}`,
        section: ui.commandSectionActions,
        icon: Sun,
        keywords: ['light', 'theme', 'day', '浅色', '亮色'],
        run: () => setTheme('light'),
      },
      {
        id: 'cmd-theme-system',
        title: `${ui.themeMode}: ${ui.themeSystem}`,
        section: ui.commandSectionActions,
        icon: Laptop,
        keywords: ['system', 'theme', 'auto', '跟随系统'],
        run: () => setTheme('system'),
      },
      {
        id: 'cmd-locale-toggle',
        title: locale === 'zh-CN' ? 'Switch UI Language → English' : '切换界面语言 → 简体中文',
        section: ui.commandSectionActions,
        icon: Languages,
        keywords: ['language', 'locale', 'i18n', 'english', '中文'],
        run: () => setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN'),
      },
      {
        id: 'cmd-core-lifecycle',
        title: ui.coreLifecycleSection,
        section: ui.commandSectionActions,
        icon: Wrench,
        keywords: ['core', 'update', 'restart', 'lifecycle', '更新', '重启'],
        run: () => navigate('/settings#core-lifecycle'),
      },
      {
        id: 'cmd-logs',
        title: ui.viewLogs,
        section: ui.commandSectionActions,
        icon: ScrollText,
        keywords: ['logs', 'error', 'debug', '日志'],
        run: () => navigate('/logs'),
      },
    ];

    return [
      ...navItems,
      ...quickCommands,
      ...componentActions,
      ...registered.filter(item => !(agentMissing && item.id.startsWith('models-'))),
    ];
  }, [mainEntries, bottomEntries, packages, registered, agentMissing, ui, openComponent, setTheme, locale, setLocale]);

  const [left, setLeft] = useState<HTMLElement | null>(null);
  const [right, setRight] = useState<HTMLElement | null>(null);
  const slots = useMemo(() => ({ left, right }), [left, right]);
  const title = [...mainEntries, ...bottomEntries].find(entry => entry.active)?.label ?? '';

  const playEntrance = Boolean(entering && !reduced);

  return (
    <SearchContext.Provider value={searchContext}>
      <InspectorContext.Provider value={inspectorValue}>
        <PageHeaderSlots.Provider value={slots}>
          <div className="relative flex min-h-dvh w-full">
            {playEntrance && (
              <motion.div
                aria-hidden="true"
                className="pointer-events-none fixed inset-0 z-[var(--z-popover)]"
                style={{
                  background:
                    'radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--color-accent) 22%, transparent), var(--color-bg) 68%)',
                }}
                initial={{ opacity: 0.9, scale: 0.96 }}
                animate={{ opacity: 0, scale: 1.08 }}
                transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
            <motion.div
              className="flex shrink-0"
              initial={playEntrance ? { opacity: 0, x: -20 } : false}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: playEntrance ? 0.38 : 0.01, ease: [0.16, 1, 0.3, 1] }}
            >
              <Sidebar
                entries={mainEntries}
                bottom={bottomEntries}
                version={version}
                coreStartedAt={coreStartedAt}
                onLogout={onLogout}
                coreUpdate={coreUpdate}
                coreUpdateFailed={coreUpdateFailed}
              />
            </motion.div>
            <div className="flex min-w-0 flex-1 flex-col">
              <motion.div
                initial={playEntrance ? { opacity: 0, y: -12 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: playEntrance ? 0.34 : 0.01, delay: playEntrance ? 0.04 : 0, ease: [0.16, 1, 0.3, 1] }}
              >
                <TopBar
                  title={title}
                  searchItems={searchItems}
                  openRequest={openRequest}
                  onLogout={onLogout}
                  leftRef={setLeft}
                  rightRef={setRight}
                />
              </motion.div>
              <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-5 pb-24 md:px-6 md:pt-6 md:pb-10">
                <motion.div
                  key={path.startsWith('/permissions') ? '/permissions' : path}
                  initial={
                    reduced
                      ? false
                      : playEntrance
                        ? { opacity: 0, y: 14, scale: 0.985 }
                        : { opacity: 0 }
                  }
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={
                    reduced
                      ? { duration: 0.01 }
                      : playEntrance
                        ? { duration: 0.44, delay: 0.06, ease: [0.16, 1, 0.3, 1] }
                        : { duration: 0.14, ease: 'easeOut' }
                  }
                >
                  {children}
                </motion.div>
              </main>
            </div>
            <MobileTabBar entries={[...mainEntries, ...bottomEntries]} onOpenSearch={openSearch} />
            <ErrorBoundary key={inspectorID ?? 'inspector-closed'} onReauthenticate={onLogout}>
              <QuickInspector
                componentID={inspectorID}
                tab={inspectorTab}
                onTabChange={setInspectorTab}
                onClose={closeInspector}
              />
            </ErrorBoundary>
          </div>
        </PageHeaderSlots.Provider>
      </InspectorContext.Provider>
    </SearchContext.Provider>
  );
}
