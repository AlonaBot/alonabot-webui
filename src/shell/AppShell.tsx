import React, { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useUI } from '../i18n/UI';
import { routes } from '../routes';
import { listPackages, onPackagesChanged } from '../api/admin';
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
  coreUpdateFailed?: boolean;
  children: React.ReactNode;
}): JSX.Element {
  const { version, onLogout, coreUpdate, coreUpdateFailed, children } = props;
  const currentPath = usePath();
  const ui = useUI();

  // Agent 组件安装状态感知（明确为 false 时模型入口置灰并从搜索排除）
  const [agentInstalled, setAgentInstalled] = useState<boolean | undefined>(undefined);
  const [agentCheckError, setAgentCheckError] = useState<string | null>(null);

  const agentRequest = useRef(0);
  const checkAgentStatus = useCallback(async () => {
    const revision = ++agentRequest.current;
    try {
      const packages = await listPackages();
      if (revision !== agentRequest.current) return;
      const installed = packages.some(p => p.Role === 'agent' && !p.Uninstalled);
      setAgentInstalled(installed);
      setAgentCheckError(null);
    } catch (err) {
      if (revision === agentRequest.current) setAgentCheckError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void checkAgentStatus();
  }, [currentPath, checkAgentStatus]);

  useEffect(() => {
    const unsubscribe = onPackagesChanged(() => { void checkAgentStatus(); });
    return () => { unsubscribe(); ++agentRequest.current; };
  }, [checkAgentStatus]);

  // 搜索项管理：合并系统路由项与动态注册项
  const [registeredItems, setRegisteredItems] = useState<SearchItem[]>([]);
  const [openRequest, setOpenRequest] = useState(0);

  const register = useCallback((newItems: SearchItem[]) => {
    setRegisteredItems(prev => [...prev, ...newItems]);
    return () => {
      setRegisteredItems(prev => prev.filter(item => !newItems.includes(item)));
    };
  }, []);

  const open = useCallback(() => {
    setOpenRequest(prev => prev + 1);
  }, []);

  const searchContextValue = useMemo(() => ({ register, open }), [register, open]);

  // 将当前路由表默认注册为搜索项（section: '页面' / localized pageSection）
  // 当明确为 agentInstalled === false 时，搜索省略模型路由
  const routeSearchItems = useMemo<SearchItem[]>(() => {
    return routes
      .filter(r => !(agentInstalled === false && r.id === 'models'))
      .map(r => {
        const labelText = (ui as Record<string, string>)[r.label];
        return {
          id: `route-${r.id}`,
          title: labelText,
          section: ui.pageSection,
          keywords: [r.path],
          run: () => navigate(r.path),
        };
      });
  }, [ui, agentInstalled]);

  const allSearchItems = useMemo(() => {
    return [...routeSearchItems, ...registeredItems.filter(item => !(agentInstalled === false && item.id.startsWith('models-')))];
  }, [routeSearchItems, registeredItems, agentInstalled]);

  // 解析当前页面标题（用于移动端顶栏与桌面顶栏）
  const activeRoute = routes.find(r => r.path === currentPath || (r.id === 'plugins' && currentPath.startsWith('/components/')));
  const currentTitle = activeRoute ? (ui as Record<string, string>)[activeRoute.label] : '';

  return (
    <SearchContext.Provider value={searchContextValue}>
      <div className="app-shell">
        <Sidebar
          routes={routes}
          version={version}
          onLogout={onLogout}
          coreUpdate={coreUpdate}
          coreUpdateFailed={coreUpdateFailed}
          agentInstalled={agentInstalled}
        />

        <div className="shell-main">
          <TopBar title={currentTitle} searchItems={allSearchItems} onLogout={onLogout} openRequest={openRequest} />
          {agentCheckError ? (
            <div className="plugins-error-banner" role="alert">
              <span>{agentCheckError}</span>
              <button type="button" onClick={() => void checkAgentStatus()}>
                {ui.refresh}
              </button>
            </div>
          ) : null}
          <main className="shell-content">{children}</main>
        </div>

        <MobileTabBar routes={routes} agentInstalled={agentInstalled} />
      </div>
    </SearchContext.Provider>
  );
}
