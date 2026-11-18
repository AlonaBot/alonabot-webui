import React, { useCallback, useMemo, useState, type JSX } from 'react';
import { useUI } from '../i18n/UI';
import { routes } from '../routes';
import { useTheme } from '../theme/theme';
import { MobileTabBar } from './MobileTabBar';
import { navigate, usePath } from './router';
import { SearchContext, type SearchItem } from './search';
// @ts-ignore macOS 大小写不敏感文件系统下避免 Sidebar.tsx 与 sidebar.ts 解析冲突
import { Sidebar } from './Sidebar.tsx';
import { TopBar } from './TopBar';

/**
 * 官方 WebUI 核心外壳组件。
 * 承载视觉令牌系统、桌面侧栏、顶栏全局搜索、移动端标签栏与路由视图内容。
 */
export function AppShell(props: {
  version: string;
  onLogout?: () => void;
  coreUpdate?: { version: string; releaseURL: string };
  children: React.ReactNode;
}): JSX.Element {
  const { version, onLogout, coreUpdate, children } = props;
  const currentPath = usePath();
  const ui = useUI();

  // 初始化主题 Hook 并同步 data-theme
  useTheme();

  // 搜索项管理：合并系统路由项与动态注册项
  const [registeredItems, setRegisteredItems] = useState<SearchItem[]>([]);

  const register = useCallback((newItems: SearchItem[]) => {
    setRegisteredItems(prev => [...prev, ...newItems]);
    return () => {
      setRegisteredItems(prev => prev.filter(item => !newItems.includes(item)));
    };
  }, []);

  const searchContextValue = useMemo(() => ({ register }), [register]);

  // 将当前路由表默认注册为搜索项（section: '页面' / localized pageSection）
  const routeSearchItems = useMemo<SearchItem[]>(() => {
    return routes.map(r => {
      const labelText = (ui as Record<string, string>)[r.label];
      return {
        id: `route-${r.id}`,
        title: labelText,
        section: ui.pageSection,
        keywords: [r.path],
        run: () => navigate(r.path),
      };
    });
  }, [ui]);

  const allSearchItems = useMemo(() => {
    return [...routeSearchItems, ...registeredItems];
  }, [routeSearchItems, registeredItems]);

  // 解析当前页面标题（用于移动端顶栏与桌面顶栏）
  const activeRoute = routes.find(r => r.path === currentPath || (r.id === 'plugins' && currentPath.startsWith('/components/')));
  const currentTitle = activeRoute ? (ui as Record<string, string>)[activeRoute.label] : '';

  return (
    <SearchContext.Provider value={searchContextValue}>
      <div className="app-shell">
        <Sidebar routes={routes} version={version} onLogout={onLogout} coreUpdate={coreUpdate} />

        <div className="shell-main">
          <TopBar title={currentTitle} searchItems={allSearchItems} onLogout={onLogout} />
          <main className="shell-content">{children}</main>
        </div>

        <MobileTabBar routes={routes} />
      </div>
    </SearchContext.Provider>
  );
}
