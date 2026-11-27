import type { JSX } from 'react';
import { MoreHorizontal, Search } from 'lucide-react';
import { useUI } from '../i18n/UI';
import { cn } from '../lib/cn';
import { Menu, MenuItem } from '../ui/Menu';
import { Link, navigate } from './router';
import type { NavEntry } from './Sidebar';

const pinned = ['overview', 'plugins', 'logs'];

/** 移动端悬浮磨砂玻璃 Tab Dock：固定总览、组件、日志、⌘K 命令面板与「更多」抽屉菜单。 */
export function MobileTabBar({
  entries,
  onOpenSearch,
}: {
  entries: readonly NavEntry[];
  onOpenSearch: () => void;
}): JSX.Element {
  const ui = useUI();
  const tabs = pinned
    .map(id => entries.find(entry => entry.id === id))
    .filter((entry): entry is NavEntry => entry !== undefined);
  const more = entries.filter(entry => !pinned.includes(entry.id));

  return (
    <nav
      aria-label={ui.mobileNavigation}
      className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-3 md:hidden"
    >
      <div className="alona-glass-elevated pointer-events-auto flex w-full max-w-[420px] items-center justify-around rounded-full px-2 py-1.5">
        {tabs.map(entry => (
          <Link
            key={entry.id}
            to={entry.to}
            aria-current={entry.active ? 'page' : undefined}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 text-[10px] font-medium transition-colors',
              entry.active
                ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]'
                : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
            )}
          >
            <entry.icon size={19} aria-hidden="true" />
            <span className="truncate">{entry.label}</span>
          </Link>
        ))}

        <button
          type="button"
          onClick={onOpenSearch}
          aria-label={ui.commandPaletteTrigger}
          className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 text-[10px] font-medium text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-accent)]"
        >
          <Search size={19} aria-hidden="true" />
          <span className="truncate">⌘K</span>
        </button>

        {more.length > 0 && (
          <Menu
            side="top"
            align="end"
            trigger={
              <button
                type="button"
                aria-current={more.some(entry => entry.active) ? 'page' : undefined}
                className={cn(
                  'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 text-[10px] font-medium transition-colors',
                  more.some(entry => entry.active)
                    ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]'
                    : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
                )}
              >
                <MoreHorizontal size={19} aria-hidden="true" />
                <span className="truncate">{ui.sidebarMore}</span>
              </button>
            }
          >
            {more.map(entry => (
              <MenuItem
                key={entry.id}
                icon={<entry.icon size={15} />}
                disabled={entry.disabledReason !== undefined}
                onSelect={() => navigate(entry.to)}
              >
                {entry.label}
              </MenuItem>
            ))}
          </Menu>
        )}
      </div>
    </nav>
  );
}
