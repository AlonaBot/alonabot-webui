import type { JSX, ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import styles from './Menu.module.css';

/** 下拉菜单。trigger 必须能接收 ref；open/onOpenChange 可选，用于右键等受控场景。 */
export function Menu({ trigger, children, side = 'bottom', align = 'start', open, onOpenChange, modal }: {
  trigger: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
}): JSX.Element {
  return <DropdownMenu.Root open={open} onOpenChange={onOpenChange} modal={modal}>
    <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content className={styles.content} side={side} align={align} sideOffset={6} collisionPadding={8}>{children}</DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
}

/** 菜单项；shortcut 显示在右侧（例如 ⌘\）。tone=danger 用于退出、卸载等。 */
export function MenuItem({ icon, children, shortcut, onSelect, disabled, tone }: {
  icon?: ReactNode;
  children: ReactNode;
  shortcut?: string;
  onSelect: () => void;
  disabled?: boolean;
  tone?: 'danger';
}): JSX.Element {
  return <DropdownMenu.Item className={styles.item} data-tone={tone} disabled={disabled} onSelect={onSelect}>
    {icon && <span className={styles.icon}>{icon}</span>}
    <span className={styles.label}>{children}</span>
    {shortcut && <kbd className={styles.shortcut}>{shortcut}</kbd>}
  </DropdownMenu.Item>;
}

export function MenuSeparator(): JSX.Element {
  return <DropdownMenu.Separator className={styles.separator} />;
}

export function MenuLabel({ children }: { children: ReactNode }): JSX.Element {
  return <DropdownMenu.Label className={styles.heading}>{children}</DropdownMenu.Label>;
}
