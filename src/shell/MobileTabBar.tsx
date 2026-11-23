import type { JSX } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useUI } from '../i18n/UI';
import { Menu, MenuItem } from '../ui/Menu';
import { Link, navigate } from './router';
import type { NavEntry } from './Sidebar';
import styles from './MobileTabBar.module.css';

const pinned = ['overview', 'plugins', 'profiles', 'logs'];

/** 手机底栏：固定总览、插件、配置文件、日志四个入口，其余（含插件页面与系统设置）收进「更多」。 */
export function MobileTabBar({ entries }: { entries: readonly NavEntry[] }): JSX.Element {
  const ui = useUI();
  const tabs = pinned.map(id => entries.find(entry => entry.id === id)).filter((entry): entry is NavEntry => entry !== undefined);
  const more = entries.filter(entry => !pinned.includes(entry.id));
  return <nav className={styles.bar} aria-label={ui.mobileNavigation}>
    {tabs.map(entry => <Link key={entry.id} to={entry.to} className={styles.tab} aria-current={entry.active ? 'page' : undefined}>
      <entry.icon size={22} aria-hidden /><span>{entry.label}</span>
    </Link>)}
    {more.length > 0 && <Menu side="top" align="end" trigger={<button type="button" className={styles.tab} aria-current={more.some(entry => entry.active) ? 'page' : undefined}>
      <MoreHorizontal size={22} aria-hidden /><span>{ui.sidebarMore}</span>
    </button>}>
      {more.map(entry => <MenuItem key={entry.id} icon={<entry.icon size={16} />} disabled={entry.disabledReason !== undefined} onSelect={() => navigate(entry.to)}>{entry.label}</MenuItem>)}
    </Menu>}
  </nav>;
}
