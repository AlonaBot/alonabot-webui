import { useEffect, useState, type JSX, type ReactNode } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { useUI } from '../i18n/UI';
import { cn } from '../lib/cn';
import { Button } from './Button';

export interface SheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly headerActions?: ReactNode;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
  readonly width?: 'md' | 'lg';
}

function useIsMobileViewport(): boolean {
  const [mobile, setMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false,
  );
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const onChange = (): void => setMobile(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

/**
 * Sheet 统一抽屉容器：桌面端从右侧弹簧滑入（用于 Quick Inspector 与详情抽屉），
 * 移动端自动切换为支持下拉手势关闭的 Bottom Sheet。
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  headerActions,
  footer,
  children,
  width = 'md',
}: SheetProps): JSX.Element {
  const ui = useUI();
  const mobile = useIsMobileViewport();
  const reduced = useReducedMotion();

  const panelWidth = width === 'lg' ? 'md:w-[620px]' : 'md:w-[480px]';

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-[var(--z-dialog)] bg-black/50 backdrop-blur-[4px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0.01 : 0.18 }}
              />
            </RadixDialog.Overlay>
            <RadixDialog.Content asChild forceMount>
              <motion.aside
                drag={mobile && !reduced ? 'y' : false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0.04, bottom: 0.45 }}
                onDragEnd={(_, info) => {
                  if (mobile && (info.offset.y > 110 || info.velocity.y > 500)) {
                    onOpenChange(false);
                  }
                }}
                initial={
                  reduced
                    ? { opacity: 0 }
                    : mobile
                      ? { y: '100%', opacity: 0.9 }
                      : { x: '100%', opacity: 0.85 }
                }
                animate={{ x: 0, y: 0, opacity: 1 }}
                exit={
                  reduced
                    ? { opacity: 0 }
                    : mobile
                      ? { y: '100%', opacity: 0.9 }
                      : { x: '100%', opacity: 0.85 }
                }
                transition={
                  reduced
                    ? { duration: 0.01 }
                    : { type: 'spring', stiffness: 380, damping: 36, mass: 0.85 }
                }
                className={cn(
                  'alona-glass-elevated fixed z-[var(--z-dialog)] flex flex-col outline-none',
                  mobile
                    ? 'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[24px] border-x-0 border-b-0'
                    : cn('inset-y-2 right-2 max-w-[calc(100vw-16px)] rounded-[20px]', panelWidth),
                )}
              >
                {mobile && (
                  <div className="flex justify-center pt-2.5 pb-1" aria-hidden="true">
                    <span className="h-1.5 w-11 rounded-full bg-[var(--color-ink-muted)]/30" />
                  </div>
                )}
                <header className="flex items-start justify-between gap-3 border-b border-[var(--color-line)]/80 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <RadixDialog.Title className="truncate text-[17px] font-semibold tracking-tight text-[var(--color-ink)]">
                      {title}
                    </RadixDialog.Title>
                    {description ? (
                      <RadixDialog.Description className="mt-1 text-xs text-[var(--color-ink-muted)]">
                        {description}
                      </RadixDialog.Description>
                    ) : (
                      <RadixDialog.Description className="visually-hidden">{title}</RadixDialog.Description>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {headerActions}
                    <RadixDialog.Close asChild>
                      <Button variant="ghost" iconOnly size="sm" aria-label={ui.close}>
                        <X size={18} />
                      </Button>
                    </RadixDialog.Close>
                  </div>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
                {footer && (
                  <footer className="flex items-center justify-end gap-2 border-t border-[var(--color-line)]/80 px-5 py-3.5">
                    {footer}
                  </footer>
                )}
              </motion.aside>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        )}
      </AnimatePresence>
    </RadixDialog.Root>
  );
}
