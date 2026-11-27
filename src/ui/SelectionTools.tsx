import type { JSX } from 'react';
import { useUI } from '../i18n/UI';

/** 在集合中加入或移除一个键，返回新集合。 */
export function toggle(set: ReadonlySet<string>, key: string, on: boolean): ReadonlySet<string> {
  const next = new Set(set);
  if (on) next.add(key);
  else next.delete(key);
  return next;
}

/** 全选、全不选、反选工具条；只作用于当前可见的 keys。 */
export function SelectionTools({
  keys,
  selected,
  onChange,
  disabled,
}: {
  keys: readonly string[];
  selected: ReadonlySet<string>;
  onChange: (next: ReadonlySet<string>) => void;
  disabled?: boolean;
}): JSX.Element {
  const ui = useUI();
  const shown = keys.filter(key => selected.has(key)).length;
  const apply = (decide: (key: string) => boolean): void => {
    const next = new Set(selected);
    for (const key of keys) {
      if (decide(key)) next.add(key);
      else next.delete(key);
    }
    onChange(next);
  };
  const btn =
    'rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-medium text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-ink)] disabled:pointer-events-none disabled:opacity-40';

  return (
    <div className="inline-flex items-center gap-1.5" role="group" aria-label={ui.selection}>
      <button type="button" className={btn} disabled={disabled || keys.length === 0 || shown === keys.length} onClick={() => apply(() => true)}>
        {ui.pickAll}
      </button>
      <button type="button" className={btn} disabled={disabled || shown === 0} onClick={() => apply(() => false)}>
        {ui.pickNone}
      </button>
      <button type="button" className={btn} disabled={disabled || keys.length === 0} onClick={() => apply(key => !selected.has(key))}>
        {ui.pickInvert}
      </button>
    </div>
  );
}
