import type { JSX, ReactNode, RefObject } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { useUI } from '../i18n/UI';
import { cn } from '../lib/cn';
import { Button } from './Button';

const sizeClasses: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
  sm: 'max-w-[420px]',
  md: 'max-w-[560px]',
  lg: 'max-w-[720px]',
  xl: 'max-w-[920px]',
};

/**
 * 模态对话框。dismissible=false 时 Esc、点遮罩与关闭按钮均不可用，
 * 只能通过 footer 操作关闭，用于「令牌只显示这一次」等关键场景。
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  dismissible?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
}): JSX.Element {
  const ui = useUI();
  const reduced = useReducedMotion();
  const block = (event: Event): void => {
    if (!dismissible) {
      event.preventDefault();
    }
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={next => { if (next || dismissible) onOpenChange(next); }}>
      <AnimatePresence>
        {open && (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-[var(--z-dialog)] bg-black/55 backdrop-blur-[4px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0.01 : 0.16 }}
              />
            </RadixDialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-[var(--z-dialog)] flex items-center justify-center p-4">
              <RadixDialog.Content
                asChild
                forceMount
                onEscapeKeyDown={block}
                onPointerDownOutside={block}
                onInteractOutside={block}
                onCloseAutoFocus={
                  returnFocusRef
                    ? event => {
                        if (returnFocusRef.current) {
                          event.preventDefault();
                          returnFocusRef.current.focus();
                        }
                      }
                    : undefined
                }
              >
                <motion.section
                  initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 6 }}
                  transition={reduced ? { duration: 0.01 } : { type: 'spring', stiffness: 420, damping: 32 }}
                  data-size={size}
                  className={cn(
                    'alona-glass-elevated pointer-events-auto flex max-h-[86dvh] w-full flex-col overflow-hidden rounded-[20px] outline-none',
                    sizeClasses[size],
                  )}
                >
                  <header className="flex items-start justify-between gap-3 px-6 pt-5 pb-3">
                    <div className="min-w-0 flex-1">
                      <RadixDialog.Title className="text-[17px] font-semibold tracking-tight text-[var(--color-ink)]">
                        {title}
                      </RadixDialog.Title>
                      {description ? (
                        <RadixDialog.Description className="mt-1 text-sm text-[var(--color-ink-muted)]">
                          {description}
                        </RadixDialog.Description>
                      ) : (
                        <RadixDialog.Description className="visually-hidden">{title}</RadixDialog.Description>
                      )}
                    </div>
                    {dismissible && (
                      <RadixDialog.Close asChild>
                        <Button variant="ghost" iconOnly size="sm" aria-label={ui.close}>
                          <X size={18} />
                        </Button>
                      </RadixDialog.Close>
                    )}
                  </header>
                  {children !== undefined && (
                    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2 text-sm text-[var(--color-ink)]">
                      {children}
                    </div>
                  )}
                  {footer && (
                    <footer className="mt-2 flex items-center justify-end gap-2 border-t border-[var(--color-line)]/70 bg-[color-mix(in_srgb,var(--color-surface-2)_45%,transparent)] px-6 py-3.5">
                      {footer}
                    </footer>
                  )}
                </motion.section>
              </RadixDialog.Content>
            </div>
          </RadixDialog.Portal>
        )}
      </AnimatePresence>
    </RadixDialog.Root>
  );
}

/** 二次确认对话框。tone=danger 时确认按钮为危险样式；pending 时禁止误关。 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  onConfirm,
  tone = 'default',
  pending = false,
}: {
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
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      dismissible={!pending}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={pending}>
            {ui.cancel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={pending} onClick={onConfirm}>
            {confirmLabel ?? ui.confirm}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
