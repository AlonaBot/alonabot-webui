import type { JSX } from 'react';
import { Languages } from 'lucide-react';
import { useUI } from '../i18n/UI';
import { Select } from '../ui/Select';

/** 选择 WebUI 的界面语言，与机器人回复的语言分别管理。 */
export function LanguageSwitch({ value, onChange }: { value: string; onChange: (tag: string) => void }): JSX.Element {
  const ui = useUI();
  return <Select variant="pill" value={value} onValueChange={onChange} aria-label={ui.language}
    options={[{ value: 'zh-CN', label: <><Languages size={15} aria-hidden style={{ verticalAlign: '-2px', marginRight: 6 }} />{ui.chinese}</> }, { value: 'en-US', label: <><Languages size={15} aria-hidden style={{ verticalAlign: '-2px', marginRight: 6 }} />{ui.english}</> }]} />;
}
