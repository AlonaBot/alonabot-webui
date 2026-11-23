import { useEffect, useId, useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import { useUI } from '../i18n/UI';
import { filterSearch, type SearchItem } from './search';
import styles from './GlobalSearch.module.css';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

/**
 * 顶栏全局搜索。平时是图标按钮，悬停或聚焦时向左展开，⌘K / Ctrl+K 聚焦，Esc 收起。
 * 结果按 section 分组，↑↓ 选择、↵ 打开。
 */
export function GlobalSearch({ items, openRequest }: { items: SearchItem[]; openRequest: number }): JSX.Element {
  const ui = useUI();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listID = useId();

  const expanded = hovered || focused || query.length > 0;
  const results = useMemo(() => filterSearch(items, query), [items, query]);
  const open = focused && query.trim().length > 0;

  const close = () => { setQuery(''); setFocused(false); setHovered(false); input.current?.blur(); };

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { if (openRequest > 0) input.current?.focus(); }, [openRequest]);
  useEffect(() => setSelected(0), [query]);
  useEffect(() => {
    const onDown = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) { setFocused(false); if (!query.trim()) setQuery(''); } };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [query]);
  useEffect(() => {
    document.getElementById(`${listID}-${selected}`)?.scrollIntoView({ block: 'nearest' });
  }, [selected, listID]);

  const choose = (item: SearchItem) => { item.run(); close(); };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (!results.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setSelected(index => (index + 1) % results.length); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setSelected(index => (index - 1 + results.length) % results.length); }
    else if (event.key === 'Enter') { event.preventDefault(); choose(results[selected]); }
  };

  const groups: { section: string; rows: { item: SearchItem; index: number }[] }[] = [];
  results.forEach((item, index) => {
    const group = groups.find(entry => entry.section === item.section);
    if (group) group.rows.push({ item, index });
    else groups.push({ section: item.section, rows: [{ item, index }] });
  });

  return <div ref={root} className={styles.search} role="search" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
    <div className={styles.field} data-expanded={expanded || undefined} onClick={() => input.current?.focus()}>
      <Search size={18} className={styles.icon} aria-hidden />
      <input ref={input} value={query} placeholder={expanded ? ui.searchPlaceholder : ''} aria-label={ui.searchPlaceholder}
        role="combobox" aria-expanded={open} aria-controls={listID} aria-activedescendant={open && results.length ? `${listID}-${selected}` : undefined}
        onFocus={() => setFocused(true)} onChange={event => setQuery(event.target.value)} onKeyDown={onKeyDown} />
      {expanded && <kbd className={styles.kbd}>{focused ? 'Esc' : isMac ? '⌘K' : 'Ctrl K'}</kbd>}
    </div>
    {open && <div className={styles.panel}>
      {results.length === 0 ? <p className={styles.empty}>{ui.searchEmpty}</p> : <>
        <div id={listID} role="listbox" className={styles.results}>
          {groups.map(group => <div key={group.section} role="group" aria-label={group.section}>
            <div className={styles.section}>{group.section}</div>
            {group.rows.map(({ item, index }) => {
              const Icon = item.icon;
              return <div key={item.id} id={`${listID}-${index}`} role="option" aria-selected={index === selected} className={styles.row}
                onMouseEnter={() => setSelected(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(item)}>
                {Icon && <Icon size={18} className={styles.rowIcon} aria-hidden />}
                <span className={styles.title}>{item.title}</span>
                {item.context && <span className={styles.context}>{item.context}</span>}
                {item.value && <span className={styles.value}>{item.value}</span>}
                {index === selected && <kbd className={styles.enter}><CornerDownLeft size={12} /></kbd>}
              </div>;
            })}
          </div>)}
        </div>
        <div className={styles.footer} aria-hidden>
          <span><kbd>↑</kbd><kbd>↓</kbd>{ui.searchSelect}</span>
          <span><kbd><CornerDownLeft size={11} /></kbd>{ui.searchOpen}</span>
        </div>
      </>}
    </div>}
  </div>;
}
