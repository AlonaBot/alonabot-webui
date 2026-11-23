import type { JSX, ReactNode } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useUI } from '../i18n/UI';
import { Button } from './Button';
import styles from './Dialog.module.css';

/**
 * 模态对话框。dismissible=false 时 Esc、点遮罩与关闭按钮都不可用，只能通过 footer 里的操作关闭，
 * 用于「令牌只显示这一次」这类不能误关的内容。
 */
export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md', dismissible = true }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  dismissible?: boolean;
}): JSX.Element {
  const ui = useUI();
  const block = (event: Event) => { if (!dismissible) event.preventDefault(); };
  return <RadixDialog.Root open={open} onOpenChange={next => { if (next || dismissible) onOpenChange(next); }}>
    <RadixDialog.Portal>
      <RadixDialog.Overlay className={styles.overlay} />
      <RadixDialog.Content className={styles.content} data-size={size} onEscapeKeyDown={block} onPointerDownOutside={block} onInteractOutside={block}>
        <header className={styles.header}>
          <RadixDialog.Title className={styles.title}>{title}</RadixDialog.Title>
          {dismissible && <RadixDialog.Close asChild><Button variant="ghost" iconOnly size="sm" aria-label={ui.close}><X size={18} /></Button></RadixDialog.Close>}
        </header>
        {description ? <RadixDialog.Description className={styles.description}>{description}</RadixDialog.Description> : <RadixDialog.Description className={styles.hidden} />}
        {children !== undefined && <div className={styles.body}>{children}</div>}
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  </RadixDialog.Root>;
}

/** 二次确认。tone=danger 时确认按钮为危险样式；pending 时确认按钮转圈且对话框不可关闭。 */
export function ConfirmDialog({ open, onOpenChange, title, description, children, confirmLabel, onConfirm, tone = 'default', pending = false }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel?: ReactNode;
  onConfirm: () => void;
  tone?: 'default' | 'danger';
  pending?: boolean;
}): JSX.Element {
  const ui = useUI();
  return <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description} size="sm" dismissible={!pending}
    footer={<>
      <Button onClick={() => onOpenChange(false)} disabled={pending}>{ui.cancel}</Button>
      <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={pending} onClick={onConfirm}>{confirmLabel ?? ui.confirm}</Button>
    </>}>
    {children}
  </Dialog>;
}
