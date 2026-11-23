import type { JSX } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useUI } from '../i18n/UI';
import styles from './Pagination.module.css';

/** 数字分页：首页、末页与当前页前后两页，其余以省略号表示；只有一页时不渲染。 */
export function Pagination({ page, total, size, onChange, disabled = false }: { page: number; total: number; size: number; onChange: (page: number) => void; disabled?: boolean }): JSX.Element | null {
  const ui = useUI();
  const count = Math.ceil(total / size);
  if (count < 2) return null;
  const pages = Array.from({ length: count }, (_, i) => i + 1).filter(n => n === 1 || n === count || Math.abs(n - page) <= 2);
  return <nav className={styles.pages} aria-label={ui.pagination}>
    <button type="button" className={styles.page} disabled={disabled || page === 1} onClick={() => onChange(page - 1)} aria-label={ui.previousPage}><ChevronLeft size={16} /></button>
    {pages.map((n, i) => <span key={n} className={styles.group}>
      {i > 0 && n - pages[i - 1] > 1 && <span className={styles.gap} aria-hidden>…</span>}
      <button type="button" className={styles.page} disabled={disabled} aria-current={page === n ? 'page' : undefined} onClick={() => onChange(n)}>{n}</button>
    </span>)}
    <button type="button" className={styles.page} disabled={disabled || page >= count} onClick={() => onChange(page + 1)} aria-label={ui.nextPage}><ChevronRight size={16} /></button>
  </nav>;
}
