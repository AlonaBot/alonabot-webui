import type { JSX } from 'react';
import { LogOut, Moon, Sun } from 'lucide-react';
import { useUI } from '../i18n/UI';
import { BrandMark } from '../ui/BrandMark';
import { Menu, MenuItem } from '../ui/Menu';
import { Tooltip } from '../ui/Tooltip';
import { GlobalSearch } from './GlobalSearch';
import type { SearchItem } from './search';
import { useUISettings } from './settings';

/**
 * 玻璃态悬浮顶栏：页面左右插槽 + 快捷主题切换 + ⌘K 命令面板入口；
 * 移动端展示品牌徽章与页面标题。
 */
export function TopBar({
  title,
  searchItems,
  openRequest,
  onLogout,
  leftRef,
  rightRef,
}: {
  title: string;
  searchItems: readonly SearchItem[];
  openRequest: number;
  onLogout?: () => void;
  leftRef: (node: HTMLElement | null) => void;
  rightRef: (node: HTMLElement | null) => void;
}): JSX.Element {
  const ui = useUI();
  const { theme, setTheme } = useUISettings();
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark');

  const toggleTheme = (): void => setTheme(isDark ? 'light' : 'dark');

  return (
    <header className="alona-glass sticky top-0 z-[var(--z-header)] flex flex-wrap items-center gap-x-3 gap-y-2 border-x-0 border-t-0 px-4 py-2.5 md:h-[64px] md:flex-nowrap md:px-6 md:py-0">
      <div className="flex items-center gap-2.5 md:hidden">
        {onLogout ? (
          <Menu
            trigger={
              <button type="button" aria-label={ui.brandMenu} className="inline-flex items-center">
                <BrandMark size={30} badge />
              </button>
            }
          >
            <MenuItem icon={<LogOut size={15} />} tone="danger" onSelect={onLogout}>
              {ui.logout}
            </MenuItem>
          </Menu>
        ) : (
          <BrandMark size={30} badge />
        )}
        <h1 className="truncate text-base font-bold tracking-tight text-[var(--color-ink)]">{title}</h1>
      </div>

      <div ref={leftRef} className="order-3 flex min-w-0 flex-1 basis-full items-center gap-2 empty:hidden md:order-1 md:basis-auto md:empty:flex" />
      <div ref={rightRef} className="order-4 flex items-center gap-2 empty:hidden md:order-2" />

      <div className="order-2 ml-auto flex shrink-0 items-center gap-2 md:order-3 md:ml-0">
        <Tooltip content={isDark ? ui.themeLight : ui.themeDark}>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? ui.themeLight : ui.themeDark}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)]/85 text-[var(--color-ink-muted)] transition-all hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </Tooltip>
        <GlobalSearch items={searchItems} openRequest={openRequest} />
      </div>
    </header>
  );
}
