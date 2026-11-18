import React, { type JSX } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { LogOut } from 'lucide-react';
import markSvg from '../assets/mark.svg?no-inline';
import { useUI } from '../i18n/UI';
import { GlobalSearch } from './GlobalSearch';
import type { SearchItem } from './search';

interface TopBarProps {
  title?: string;
  searchItems?: SearchItem[];
  onLogout?: () => void;
  children?: React.ReactNode;
}

/**
 * 内容区顶部栏。
 * 桌面端右端常驻可自适应展开的全局搜索；移动端包含标志与当前页面名称，且可从标志菜单登出。
 */
export function TopBar(props: TopBarProps): JSX.Element {
  const { title, searchItems = [], onLogout, children } = props;
  const ui = useUI();

  return (
    <header className="shell-topbar">
      <div className="topbar-left">
        <div className="mobile-brand-slot">
          {onLogout ? (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button type="button" className="mobile-brand-button" aria-label={ui.brandMenu}>
                  <img src={markSvg} alt="AlonaBot" className="mobile-brand-mark" width={28} height={28} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="dropdown-menu-content" side="bottom" align="start">
                  <DropdownMenu.Item className="dropdown-menu-item is-danger" onSelect={onLogout}>
                    <LogOut size={15} />
                    <span>{ui.logout}</span>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          ) : (
            <img src={markSvg} alt="AlonaBot" className="mobile-brand-mark" width={28} height={28} />
          )}
          {title ? <h1 className="mobile-page-title">{title}</h1> : null}
        </div>
        {children ? <div className="topbar-content-slot">{children}</div> : null}
      </div>
      <div className="topbar-right">
        <GlobalSearch items={searchItems} />
      </div>
    </header>
  );
}
