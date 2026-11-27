import type { JSX, ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '../lib/cn';

/** 下拉菜单。trigger 必须能接收 ref；open/onOpenChange 可选，用于右键等受控场景。 */
export function Menu({
  trigger,
  children,
  side = 'bottom',
  align = 'start',
  open,
  onOpenChange,
  modal,
}: {
  trigger: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
}): JSX.Element {
  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className="alona-glass-elevated z-[var(--z-popover)] min-w-[188px] rounded-[14px] p-1.5 text-sm text-[var(--color-ink)] shadow-[var(--shadow-popover)] outline-none"
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** 菜单项；shortcut 显示在右侧（例如 ⌘\）。tone=danger 用于退出、卸载等危险动作。 */
export function MenuItem({
  icon,
  children,
  shortcut,
  onSelect,
  disabled,
  tone,
}: {
  icon?: ReactNode;
  children: ReactNode;
  shortcut?: string;
  onSelect: () => void;
  disabled?: boolean;
  tone?: 'danger';
}): JSX.Element {
  return (
    <DropdownMenu.Item
      data-tone={tone}
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm outline-none transition-colors duration-100 select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
        tone === 'danger'
          ? 'text-[var(--color-danger)] data-[highlighted]:bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)]'
          : 'text-[var(--color-ink)] data-[highlighted]:bg-[var(--color-accent-soft)] data-[highlighted]:text-[var(--color-accent-strong)]',
      )}
    >
      {icon && <span className="inline-flex shrink-0 items-center opacity-85">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut && (
        <kbd className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-ink-muted)]">
          {shortcut}
        </kbd>
      )}
    </DropdownMenu.Item>
  );
}

export function MenuSeparator(): JSX.Element {
  return <DropdownMenu.Separator className="my-1 h-px bg-[var(--color-line)]/80" />;
}

export function MenuLabel({ children }: { children: ReactNode }): JSX.Element {
  return (
    <DropdownMenu.Label className="px-2.5 py-1.5 text-[11px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">
      {children}
    </DropdownMenu.Label>
  );
}
