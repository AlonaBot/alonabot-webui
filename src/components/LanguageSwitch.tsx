import type { JSX } from 'react';
import { Languages } from 'lucide-react';
import { useUI } from '../i18n/UI';
import { Select } from '../ui/Select';

/** 选择 WebUI 的界面语言，与机器人回复的语言分别管理。 */
export function LanguageSwitch({ value, onChange }: { value: string; onChange: (tag: string) => void }): JSX.Element {
  const ui = useUI();
  return (
    <Select
      variant="pill"
      size="sm"
      value={value}
      onValueChange={onChange}
      aria-label={ui.language}
      options={[
        {
          value: 'zh-CN',
          label: (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Languages size={14} aria-hidden="true" />
              <span>{ui.chinese}</span>
            </span>
          ),
        },
        {
          value: 'en-US',
          label: (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Languages size={14} aria-hidden="true" />
              <span>{ui.english}</span>
            </span>
          ),
        },
      ]}
    />
  );
}
