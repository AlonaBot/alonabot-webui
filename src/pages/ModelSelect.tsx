import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown } from 'lucide-react';

type Props = {
  value: string;
  label: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
};

/** ModelSelect 复用外壳菜单的选择、焦点与键盘行为。 */
export function ModelSelect({ value, label, options, disabled, onChange }: Props) {
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild><button type="button" className="model-select" disabled={disabled} aria-label={label}>
      <span>{options.find(option => option.value === value)?.label ?? value}</span><ChevronDown size={14} />
    </button></DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content className="dropdown-menu-content model-select-menu" align="start" sideOffset={4}>
      <DropdownMenu.RadioGroup value={value} onValueChange={onChange}>
        {options.map(option => <DropdownMenu.RadioItem key={option.value} value={option.value} className="dropdown-menu-item model-select-option">
          <span>{option.label}</span><DropdownMenu.ItemIndicator><Check size={14} /></DropdownMenu.ItemIndicator>
        </DropdownMenu.RadioItem>)}
      </DropdownMenu.RadioGroup>
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
