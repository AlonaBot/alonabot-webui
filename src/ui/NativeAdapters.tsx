import { Children, Fragment, isValidElement, type ChangeEvent, type JSX, type ReactNode } from 'react';
import { Checkbox } from './Checkbox';
import { Select, type SelectOption } from './Select';
import { Tooltip } from './Tooltip';

type ValueEvent = ChangeEvent<HTMLSelectElement>;
type CheckedEvent = ChangeEvent<HTMLInputElement>;

/** 收集 <option> 子节点（含 Fragment、数组与条件渲染）为选项列表。 */
function collect(children: ReactNode, out: SelectOption[] = []): SelectOption[] {
  Children.forEach(children, child => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(child)) return;
    if (child.type === Fragment) { collect(child.props.children, out); return; }
    if (child.type === 'option') {
      const value = child.props.value ?? (typeof child.props.children === 'string' ? child.props.children : '');
      out.push({ value: String(value), label: child.props.children, disabled: child.props.disabled });
    }
  });
  return out;
}

/**
 * 以 <select> 的写法使用共享下拉：接受 value、onChange 与 <option> 子节点，
 * onChange 收到的对象带 target.value / currentTarget.value，调用方无需改动。
 */
export function OptionSelect({ value, onChange, children, disabled, className, id, title, 'aria-label': ariaLabel }: {
  value?: string | number | readonly string[];
  onChange?: (event: ValueEvent) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  id?: string;
  required?: boolean;
  title?: string;
  'aria-label'?: string;
}): JSX.Element {
  const options = collect(children);
  const emit = (next: string) => {
    const target = { value: next } as HTMLSelectElement;
    onChange?.({ target, currentTarget: target } as ValueEvent);
  };
  const select = <Select id={id} className={className} aria-label={ariaLabel} value={String(value ?? '')} disabled={disabled} options={options} onValueChange={emit} />;
  // title 原本是原生提示，这里改为共享 Tooltip。
  return title ? <Tooltip content={title}><span style={{ display: 'inline-flex' }}>{select}</span></Tooltip> : select;
}

/** 以 <input type="checkbox"> 的写法使用共享复选框；onChange 收到带 target.checked 的对象。 */
export function CheckboxInput({ checked, onChange, disabled, id, 'aria-label': ariaLabel }: {
  type?: 'checkbox';
  checked?: boolean;
  onChange?: (event: CheckedEvent) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  role?: string;
  'aria-label'?: string;
}): JSX.Element {
  return <Checkbox id={id} aria-label={ariaLabel} checked={checked === true} disabled={disabled}
    onCheckedChange={next => { const target = { checked: next } as HTMLInputElement; onChange?.({ target, currentTarget: target } as CheckedEvent); }} />;
}
