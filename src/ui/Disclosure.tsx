import { useId, useState, type JSX, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import styles from './Disclosure.module.css';

/** 可展开的区块，取代 <details>；展开收起带高度过渡，收起时内容仍挂载以保留表单状态。 */
export function Disclosure({ summary, hint, children, defaultOpen = false, className }: {
  summary: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return <div className={[styles.root, className].filter(Boolean).join(' ')} data-open={open || undefined}>
    <button type="button" className={styles.trigger} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <ChevronRight size={16} className={styles.chevron} aria-hidden />
      <span className={styles.summary}>{summary}</span>
      {hint && !open && <span className={styles.hint}>{hint}</span>}
    </button>
    <div id={id} className={styles.panel} inert={!open || undefined}>
      <div className={styles.inner}>{children}</div>
    </div>
  </div>;
}
