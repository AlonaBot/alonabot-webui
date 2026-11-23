import type { JSX } from 'react';
import { LogOut } from 'lucide-react';
import markSvg from '../assets/mark.svg?no-inline';
import { useUI } from '../i18n/UI';
import { Menu, MenuItem } from '../ui/Menu';
import { GlobalSearch } from './GlobalSearch';
import type { SearchItem } from './search';
import styles from './TopBar.module.css';

/**
 * 内容区顶栏：左右两个页面插槽（见 PageHeader）与全局搜索。
 * 手机上额外显示标志与当前页面名，标志菜单可退出登录；插槽内容换行排在标题下方。
 */
export function TopBar({ title, searchItems, openRequest, onLogout, leftRef, rightRef }: {
  title: string;
  searchItems: SearchItem[];
  openRequest: number;
  onLogout?: () => void;
  leftRef: (node: HTMLElement | null) => void;
  rightRef: (node: HTMLElement | null) => void;
}): JSX.Element {
  const ui = useUI();
  const mark = <img src={markSvg} alt="" width={26} height={28} />;
  return <header className={styles.bar}>
    <div className={styles.mobileTitle}>
      {onLogout ? <Menu trigger={<button type="button" className={styles.mark} aria-label={ui.brandMenu}>{mark}</button>}>
        <MenuItem icon={<LogOut size={16} />} onSelect={onLogout}>{ui.logout}</MenuItem>
      </Menu> : mark}
      <h1>{title}</h1>
    </div>
    <div ref={leftRef} className={styles.left} />
    <div ref={rightRef} className={styles.right} />
    <GlobalSearch items={searchItems} openRequest={openRequest} />
  </header>;
}
