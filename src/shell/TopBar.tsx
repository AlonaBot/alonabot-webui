import React, { type JSX } from 'react';
import markSvg from '../assets/mark.svg?no-inline';
import { GlobalSearch } from './GlobalSearch';
import type { SearchItem } from './search';

interface TopBarProps {
  title?: string;
  searchItems?: SearchItem[];
  children?: React.ReactNode;
}

/**
 * 内容区顶部栏。
 * 桌面端右端常驻可自适应展开的全局搜索；移动端包含标志与当前页面名称。
 */
export function TopBar(props: TopBarProps): JSX.Element {
  const { title, searchItems = [], children } = props;

  return (
    <header className="shell-topbar">
      <div className="topbar-left">
        <div className="mobile-brand-slot">
          <img src={markSvg} alt="AlonaBot" className="mobile-brand-mark" width={28} height={28} />
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
