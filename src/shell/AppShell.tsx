import { useCallback, useMemo, useState, type JSX, type ReactNode } from 'react';
import { AppWindow } from 'lucide-react';
import { useUI } from '../i18n/UI';
import { installed, usePackages } from '../queries/packages';
import { routes } from '../routes';
import { MobileTabBar } from './MobileTabBar';
import { PageHeaderSlots } from './PageHeader';
import { navigate, usePath, useQueryParam } from './router';
import { SearchContext, type SearchItem } from './search';
import { Sidebar, type NavEntry } from './Sidebar';
import { TopBar } from './TopBar';
import styles from './AppShell.module.css';

/** 插件页面在详情页里以标签打开；侧栏与搜索共用这个地址。 */
export function pluginPagePath(pluginID: string, page: string): string {
  return `/pages/${encodeURIComponent(pluginID)}?path=${encodeURIComponent(page)}`;
}

/**
 * 管理界面外壳：桌面侧栏、顶栏（页面插槽 + 全局搜索）、内容区与手机底栏。
 * 侧栏条目由内置页面与已安装插件声明的页面组成；没有 Agent 时「模型」置灰。
 */
export function AppShell({ version, onLogout, coreUpdate, coreUpdateFailed, children }: {
  version: string;
  onLogout?: () => void;
  coreUpdate?: { version: string; releaseURL: string };
  coreUpdateFailed?: boolean;
  children: ReactNode;
}): JSX.Element {
  const ui = useUI();
  const labels = ui as Record<string, string>;
  const path = usePath();
  const pagePath = useQueryParam('path');
  const packageQuery = usePackages();
  const packages = useMemo(() => installed(packageQuery.data), [packageQuery.data]);
  const agentMissing = packageQuery.isSuccess && !packages.some(item => item.Role === 'agent');

  const pageEntries = useMemo<NavEntry[]>(() => packages.flatMap(item => (item.pages ?? []).map(page => ({
    id: `page:${item.ID}:${page.path}`,
    label: page.title,
    icon: AppWindow,
    to: pluginPagePath(item.ID, page.path),
    active: path === `/pages/${encodeURIComponent(item.ID)}` && pagePath === page.path,
    disabledReason: item.Enabled ? undefined : ui.pluginPageDisabled,
  }))), [packages, path, pagePath, ui]);
  const onPluginPage = pageEntries.some(entry => entry.active);

  const routeEntry = useCallback((route: typeof routes[number]): NavEntry => ({
    id: route.id,
    label: labels[route.label],
    icon: route.icon,
    to: route.path,
    active: path === route.path || (path.startsWith(route.path + '/') && !(route.path === '/components' && onPluginPage)),
    disabledReason: route.id === 'models' && agentMissing ? ui.modelsNeedAgent : undefined,
  }), [labels, path, onPluginPage, agentMissing, ui]);

  const mainEntries = useMemo(() => [...routes.filter(route => route.group === 'main' && route.navigation !== false).map(routeEntry), ...pageEntries], [routeEntry, pageEntries]);
  const bottomEntries = useMemo(() => routes.filter(route => route.group === 'bottom').map(routeEntry), [routeEntry]);

  // 页面通过 SearchContext 注册的条目与内置页面、插件页面合并。
  const [registered, setRegistered] = useState<SearchItem[]>([]);
  const [openRequest, setOpenRequest] = useState(0);
  const register = useCallback((items: SearchItem[]) => {
    setRegistered(previous => [...previous, ...items]);
    return () => setRegistered(previous => previous.filter(item => !items.includes(item)));
  }, []);
  const searchContext = useMemo(() => ({ register, open: () => setOpenRequest(value => value + 1) }), [register]);
  const searchItems = useMemo<SearchItem[]>(() => [
    ...mainEntries.concat(bottomEntries).filter(entry => !entry.disabledReason).map(entry => ({
      id: `nav-${entry.id}`, title: entry.label, section: ui.pageSection, icon: entry.icon, keywords: [entry.to], run: () => navigate(entry.to),
    })),
    ...registered.filter(item => !(agentMissing && item.id.startsWith('models-'))),
  ], [mainEntries, bottomEntries, registered, agentMissing, ui]);

  const [left, setLeft] = useState<HTMLElement | null>(null);
  const [right, setRight] = useState<HTMLElement | null>(null);
  const slots = useMemo(() => ({ left, right }), [left, right]);
  const title = [...mainEntries, ...bottomEntries].find(entry => entry.active)?.label ?? '';

  return <SearchContext.Provider value={searchContext}>
    <PageHeaderSlots.Provider value={slots}>
      <div className={styles.shell}>
        <Sidebar entries={mainEntries} bottom={bottomEntries} version={version} onLogout={onLogout} coreUpdate={coreUpdate} coreUpdateFailed={coreUpdateFailed} />
        <div className={styles.main}>
          <TopBar title={title} searchItems={searchItems} openRequest={openRequest} onLogout={onLogout} leftRef={setLeft} rightRef={setRight} />
          <main key={path} className={styles.content}>{children}</main>
        </div>
        <MobileTabBar entries={[...mainEntries, ...bottomEntries]} />
      </div>
    </PageHeaderSlots.Provider>
  </SearchContext.Provider>;
}
