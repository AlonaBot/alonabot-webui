import type { ChangeEvent } from 'react';
import { useUI } from '../i18n/UI';

/** LanguageSwitch 选择 WebUI 的语言，与聊天回复的语言分别管理。 */
export function LanguageSwitch(props: { value: string; onChange: (tag: string) => void }) {
  const ui = useUI();
  return <label className="language-switch">{ui.language}
    <select value={props.value} onChange={(event: ChangeEvent<HTMLSelectElement>) => props.onChange(event.currentTarget.value)}>
      <option value="en-US">{ui.english}</option><option value="zh-CN">{ui.chinese}</option>
    </select>
  </label>;
}
