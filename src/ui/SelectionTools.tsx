import type { JSX } from 'react';
import { useUI } from '../i18n/UI';
import styles from './SelectionTools.module.css';

/** 在集合里加入或移除一个键，返回新集合。 */
export function toggle(set: ReadonlySet<string>, key: string, on: boolean): ReadonlySet<string> {
  const next = new Set(set);
  if (on) next.add(key); else next.delete(key);
  return next;
}

/** 全选、全不选、反选；只作用于当前可见的 keys，不影响已筛掉的项。 */
export function SelectionTools({ keys, selected, onChange, disabled }: { keys: readonly string[]; selected: ReadonlySet<string>; onChange: (next: ReadonlySet<string>) => void; disabled?: boolean }): JSX.Element {
  const ui = useUI();
  const shown = keys.filter(key => selected.has(key)).length;
  const apply = (decide: (key: string) => boolean) => {
    const next = new Set(selected);
    for (const key of keys) if (decide(key)) next.add(key); else next.delete(key);
    onChange(next);
  };
  return <div className={styles.tools} role="group" aria-label={ui.selection}>
    <button type="button" disabled={disabled || keys.length === 0 || shown === keys.length} onClick={() => apply(() => true)}>{ui.pickAll}</button>
    <button type="button" disabled={disabled || shown === 0} onClick={() => apply(() => false)}>{ui.pickNone}</button>
    <button type="button" disabled={disabled || keys.length === 0} onClick={() => apply(key => !selected.has(key))}>{ui.pickInvert}</button>
  </div>;
}
