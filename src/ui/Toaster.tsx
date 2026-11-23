import { useEffect, useState, type JSX } from 'react';
import * as Toast from '@radix-ui/react-toast';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useUI } from '../i18n/UI';
import { dismissToast, subscribeToasts, type ToastItem } from './toast';
import styles from './Toaster.module.css';

const icons = { success: CircleCheck, error: CircleAlert, info: Info };

/** 渲染 toast 队列；整个应用只挂载一次。 */
export function Toaster(): JSX.Element {
  const ui = useUI();
  const [items, setItems] = useState<readonly ToastItem[]>([]);
  useEffect(() => subscribeToasts(setItems), []);
  return <Toast.Provider swipeDirection="right" label={ui.notifications}>
    {items.map(item => <ToastCard key={item.id} item={item} />)}
    <Toast.Viewport className={styles.viewport} />
  </Toast.Provider>;
}

function ToastCard({ item }: { item: ToastItem }): JSX.Element {
  const ui = useUI();
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const Icon = icons[item.kind];
  return <Toast.Root
    className={styles.toast}
    data-kind={item.kind}
    type={item.kind === 'error' ? 'foreground' : 'background'}
    duration={item.kind === 'error' ? Infinity : 4000}
    open={open}
    onOpenChange={next => { setOpen(next); if (!next) window.setTimeout(() => dismissToast(item.id), 200); }}
  >
    <Icon className={styles.icon} size={18} aria-hidden />
    <div className={styles.body}>
      <Toast.Title className={styles.title}>{item.title || ui.actionFailed}</Toast.Title>
      {item.description && <Toast.Description className={styles.description}>{item.description}</Toast.Description>}
      {item.detail && <>
        <button type="button" className={styles.more} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{ui.actionDetails}</button>
        {expanded && <pre className={styles.detail}>{item.detail}</pre>}
      </>}
    </div>
    <Toast.Close className={styles.close} aria-label={ui.close}><X size={16} /></Toast.Close>
  </Toast.Root>;
}
