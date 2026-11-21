import { useUI } from '../i18n/UI';
export function Pagination({ page, total, size, onChange, disabled = false }: { page: number; total: number; size: number; onChange: (page: number) => void; disabled?: boolean }) {
  const ui = useUI();
  const count = Math.ceil(total / size);
  if (count < 2) return null;
  const pages = Array.from({ length: count }, (_, i) => i + 1).filter(n => n === 1 || n === count || Math.abs(n - page) <= 2);
  return <nav className="number-pages" aria-label={ui.pagination}>
    <button disabled={disabled || page === 1} onClick={() => onChange(page - 1)} aria-label={ui.previousPage}>‹</button>
    {pages.map((n, i) => <span key={n}>{i > 0 && n - pages[i - 1] > 1 && <span className="page-gap">…</span>}<button disabled={disabled} aria-current={page === n ? 'page' : undefined} onClick={() => onChange(n)}>{n}</button></span>)}
    <button disabled={disabled || page >= count} onClick={() => onChange(page + 1)} aria-label={ui.nextPage}>›</button>
  </nav>;
}
