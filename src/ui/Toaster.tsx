import { useEffect, useState, type JSX } from 'react';
import * as Toast from '@radix-ui/react-toast';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useUI } from '../i18n/UI';
import { cn } from '../lib/cn';
import { dismissToast, subscribeToasts, type ToastItem } from './toast';

const icons = { success: CircleCheck, error: CircleAlert, info: Info };
const kindAccent: Record<ToastItem['kind'], string> = {
  success: 'border-l-[var(--color-success)] text-[var(--color-success)]',
  error: 'border-l-[var(--color-danger)] text-[var(--color-danger)]',
  info: 'border-l-[var(--color-accent)] text-[var(--color-accent)]',
};

/** 渲染全局 toast 队列；整个应用只挂载一次。 */
export function Toaster(): JSX.Element {
  const ui = useUI();
  const [items, setItems] = useState<readonly ToastItem[]>([]);
  useEffect(() => subscribeToasts(setItems), []);
  return (
    <Toast.Provider swipeDirection="right" label={ui.notifications}>
      {items.map(item => (
        <ToastCard key={item.id} item={item} />
      ))}
      <Toast.Viewport className="fixed right-4 bottom-20 z-[var(--z-toast)] flex w-[min(390px,calc(100vw-32px))] flex-col gap-2.5 outline-none md:bottom-5" />
    </Toast.Provider>
  );
}

function ToastCard({ item }: { item: ToastItem }): JSX.Element {
  const ui = useUI();
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const Icon = icons[item.kind];

  return (
    <Toast.Root
      data-kind={item.kind}
      type={item.kind === 'error' ? 'foreground' : 'background'}
      duration={item.kind === 'error' ? Infinity : 4000}
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) {
          window.setTimeout(() => dismissToast(item.id), 200);
        }
      }}
      className={cn(
        'alona-glass-elevated flex items-start gap-3 rounded-[14px] border-l-[3px] p-3.5 text-sm shadow-[var(--shadow-popover)]',
        kindAccent[item.kind],
      )}
    >
      <Icon className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
      <div className="min-w-0 flex-1 text-[var(--color-ink)]">
        <Toast.Title className="font-semibold leading-snug">{item.title || ui.actionFailed}</Toast.Title>
        {item.description && (
          <Toast.Description className="mt-0.5 text-xs text-[var(--color-ink-muted)]">{item.description}</Toast.Description>
        )}
        {item.detail && (
          <>
            <button
              type="button"
              className="mt-1.5 text-xs font-medium text-[var(--color-accent)] hover:underline"
              aria-expanded={expanded}
              onClick={() => setExpanded(value => !value)}
            >
              {ui.actionDetails}
            </button>
            {expanded && (
              <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-[var(--color-surface-2)] p-2 font-mono text-[11px] whitespace-pre-wrap text-[var(--color-ink-muted)]">
                {item.detail}
              </pre>
            )}
          </>
        )}
      </div>
      <Toast.Close
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
        aria-label={ui.close}
      >
        <X size={15} />
      </Toast.Close>
    </Toast.Root>
  );
}
