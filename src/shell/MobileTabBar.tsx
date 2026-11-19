import { useState, type JSX } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import type { RouteEntry } from '../routes';
import { useUI } from '../i18n/UI';
import { Link, navigate, usePath } from './router';

interface MobileTabBarProps {
  routes: RouteEntry[];
  moreLabel?: string;
  agentInstalled?: boolean;
}

/**
 * 移动端底部标签栏组件（屏幕宽度小于 768px）。
 * 展示已登记的总览、插件、配置文件、日志，其余入口收进「更多」。
 */
export function MobileTabBar(props: MobileTabBarProps): JSX.Element {
  const ui = useUI();
  const labels: Record<string, string> = ui;
  const { routes, moreLabel = ui.sidebarMore, agentInstalled } = props;
  const currentPath = usePath();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const visibleTabs = ['overview', 'plugins', 'profiles', 'logs']
    .map(id => routes.find(route => route.id === id && route.group === 'main'))
    .filter((route): route is RouteEntry => route !== undefined);
  const allMoreTabs = routes.filter(route => route.navigation !== false && !visibleTabs.includes(route));

  const isMoreActive = allMoreTabs.some(r => r.path === currentPath || (r.id === 'permissions' && currentPath.startsWith('/permissions/')));

  return (
    <nav className="mobile-tabbar" aria-label={ui.mobileNavigation}>
      <div className="mobile-tabbar-inner">
        {visibleTabs.map(route => {
          const Icon = route.icon;
          const isActive = currentPath === route.path || (route.id === 'plugins' && currentPath.startsWith('/components/'));
          return (
            <Link
              key={route.id}
              to={route.path}
              className={`mobile-tab-item ${isActive ? 'is-active' : ''}`}
            >
              <Icon size={20} className="mobile-tab-icon" aria-hidden="true" />
              <span className="mobile-tab-label">{labels[route.label]}</span>
            </Link>
          );
        })}

        {allMoreTabs.length > 0 ? (
          <DropdownMenu.Root open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className={`mobile-tab-item ${isMoreActive ? 'is-active' : ''}`}
                aria-label={moreLabel}
              >
                <MoreHorizontal size={20} className="mobile-tab-icon" aria-hidden="true" />
                <span className="mobile-tab-label">{moreLabel}</span>
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="dropdown-menu-content mobile-more-dropdown"
                side="top"
                align="end"
                sideOffset={10}
                // 在菜单项完成选择后阻止整页跳转，保留 Radix 的关闭与焦点处理。
                onClick={event => event.preventDefault()}
              >
                {allMoreTabs.map(tab => {
                  const TabIcon = tab.icon;
                  const isActive = currentPath === tab.path || (tab.id === 'permissions' && currentPath.startsWith('/permissions/'));
                  const isDisabled = tab.id === 'models' && agentInstalled === false;
                  if (isDisabled) {
                    return (
                      <DropdownMenu.Item
                        key={tab.id}
                        className={`dropdown-menu-item ${isActive ? 'is-active' : ''} is-disabled`}
                        disabled={true}
                      >
                        <span className="mobile-more-link is-disabled" aria-disabled="true" tabIndex={-1}>
                          <TabIcon size={16} />
                          <span>{labels[tab.label]}</span>
                        </span>
                      </DropdownMenu.Item>
                    );
                  }
                  return (
                    <DropdownMenu.Item
                      key={tab.id}
                      className={`dropdown-menu-item ${isActive ? 'is-active' : ''}`}
                      onSelect={() => navigate(tab.path)}
                      asChild
                    >
                      <a href={tab.path} className="mobile-more-link">
                        <TabIcon size={16} />
                        <span>{labels[tab.label]}</span>
                      </a>
                    </DropdownMenu.Item>
                  );
                })}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        ) : null}
      </div>
    </nav>
  );
}
