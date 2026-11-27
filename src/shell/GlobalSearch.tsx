import { useEffect, useId, useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CornerDownLeft, Search, Sparkles } from 'lucide-react';
import { useUI } from '../i18n/UI';
import { cn } from '../lib/cn';
import { filterSearch, type SearchItem } from './search';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

/**
 * 居中悬浮毛玻璃命令面板（⌘K / Ctrl+K）：
 * 既可瞬时跳转任意页面/插件，也可直接执行主题切换、语言切换、组件检查与重载等高频动作。
 */
export function GlobalSearch({
  items,
  openRequest,
}: {
  items: readonly SearchItem[];
  openRequest: number;
}): JSX.Element {
  const ui = useUI();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listID = useId();

  const results = useMemo(() => filterSearch(items, query, true).slice(0, 36), [items, query]);

  const close = (): void => {
    setOpen(false);
    setQuery('');
    setSelected(0);
  };

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (openRequest > 0) {
      setOpen(true);
    }
  }, [openRequest]);

  useEffect(() => {
    setSelected(0);
  }, [query, open]);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    document.getElementById(`${listID}-${selected}`)?.scrollIntoView({ block: 'nearest' });
  }, [selected, listID]);

  const choose = (item: SearchItem): void => {
    item.run();
    close();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (results.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected(index => (index + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected(index => (index - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = results[selected];
      if (target) choose(target);
    }
  };

  const groups: { section: string; rows: { item: SearchItem; index: number }[] }[] = [];
  results.forEach((item, index) => {
    const group = groups.find(entry => entry.section === item.section);
    if (group) group.rows.push({ item, index });
    else groups.push({ section: item.section, rows: [{ item, index }] });
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ui.searchPlaceholder}
        className="group inline-flex h-9 items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)]/85 px-3 text-xs text-[var(--color-ink-muted)] shadow-xs transition-all hover:border-[var(--color-accent)] hover:text-[var(--color-ink)] hover:shadow-[var(--shadow-glow-accent)]"
      >
        <Search size={14} className="text-[var(--color-accent)] transition-transform group-hover:scale-110" aria-hidden="true" />
        <span className="hidden sm:inline">{ui.commandPaletteTrigger}</span>
        <kbd className="hidden rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--color-ink-muted)] sm:inline">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>

      <RadixDialog.Root open={open} onOpenChange={next => (next ? setOpen(true) : close())}>
        <AnimatePresence>
          {open && (
            <RadixDialog.Portal forceMount>
              <RadixDialog.Overlay asChild forceMount>
                <motion.div
                  className="fixed inset-0 z-[var(--z-popover)] bg-black/55 backdrop-blur-[4px]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0.01 : 0.14 }}
                />
              </RadixDialog.Overlay>
              <div className="pointer-events-none fixed inset-0 z-[var(--z-popover)] flex items-start justify-center px-4 pt-[12vh]">
                <RadixDialog.Content asChild forceMount>
                  <motion.div
                    initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -8 }}
                    transition={reduced ? { duration: 0.01 } : { type: 'spring', stiffness: 460, damping: 34 }}
                    className="alona-glass-elevated pointer-events-auto w-full max-w-[600px] overflow-hidden rounded-[20px] outline-none"
                  >
                    <RadixDialog.Title className="visually-hidden">{ui.commandPaletteTrigger}</RadixDialog.Title>
                    <RadixDialog.Description className="visually-hidden">{ui.searchPlaceholder}</RadixDialog.Description>
                    <div className="flex items-center gap-3 border-b border-[var(--color-line)]/80 px-4 py-3.5">
                      <Search size={18} className="shrink-0 text-[var(--color-accent)]" aria-hidden="true" />
                      <input
                        ref={inputRef}
                        value={query}
                        placeholder={ui.commandPalettePlaceholder}
                        aria-label={ui.searchPlaceholder}
                        role="combobox"
                        aria-expanded={true}
                        aria-controls={listID}
                        aria-activedescendant={results.length > 0 ? `${listID}-${selected}` : undefined}
                        onChange={event => setQuery(event.target.value)}
                        onKeyDown={onKeyDown}
                        className="w-full bg-transparent text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-muted)]"
                      />
                      <kbd className="shrink-0 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-ink-muted)]">
                        Esc
                      </kbd>
                    </div>

                    <div id={listID} role="listbox" className="max-h-[min(56dvh,420px)] overflow-y-auto p-2">
                      {results.length === 0 ? (
                        <p className="py-10 text-center text-sm text-[var(--color-ink-muted)]">{ui.searchEmpty}</p>
                      ) : (
                        groups.map(group => (
                          <div key={group.section} role="group" aria-label={group.section} className="mb-2 last:mb-0">
                            <div className="px-2.5 py-1.5 text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">
                              {group.section}
                            </div>
                            {group.rows.map(({ item, index }) => {
                              const Icon = item.icon ?? Sparkles;
                              const active = index === selected;
                              return (
                                <div
                                  key={item.id}
                                  id={`${listID}-${index}`}
                                  role="option"
                                  aria-selected={active}
                                  onMouseEnter={() => setSelected(index)}
                                  onMouseDown={event => event.preventDefault()}
                                  onClick={() => choose(item)}
                                  className={cn(
                                    'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                                    active
                                      ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]'
                                      : 'text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]/70',
                                  )}
                                >
                                  <Icon size={16} className={cn('shrink-0', active ? 'text-[var(--color-accent)]' : 'text-[var(--color-ink-muted)]')} aria-hidden="true" />
                                  <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
                                  {item.context && <span className="shrink-0 text-xs text-[var(--color-ink-muted)]">{item.context}</span>}
                                  {item.value && (
                                    <span className="shrink-0 rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-ink-muted)]">
                                      {item.value}
                                    </span>
                                  )}
                                  {active && (
                                    <kbd className="inline-flex shrink-0 items-center rounded-md border border-[color-mix(in_srgb,var(--color-accent)_35%,transparent)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[var(--color-accent)]">
                                      <CornerDownLeft size={12} />
                                    </kbd>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ))
                      )}
                    </div>

                    <div className="flex items-center justify-between border-t border-[var(--color-line)]/70 bg-[color-mix(in_srgb,var(--color-surface-2)_55%,transparent)] px-4 py-2 text-[11px] text-[var(--color-ink-muted)]" aria-hidden="true">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1">
                          <kbd className="rounded border border-[var(--color-line)] bg-[var(--color-surface)] px-1 font-mono">↑</kbd>
                          <kbd className="rounded border border-[var(--color-line)] bg-[var(--color-surface)] px-1 font-mono">↓</kbd>
                          {ui.searchSelect}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <kbd className="inline-flex rounded border border-[var(--color-line)] bg-[var(--color-surface)] px-1">
                            <CornerDownLeft size={10} />
                          </kbd>
                          {ui.searchOpen}
                        </span>
                      </div>
                      <span className="font-mono text-[10px]">AlonaBot Command</span>
                    </div>
                  </motion.div>
                </RadixDialog.Content>
              </div>
            </RadixDialog.Portal>
          )}
        </AnimatePresence>
      </RadixDialog.Root>
    </>
  );
}
