import { createContext, useContext } from 'react';
import english from '../../i18n/en-US.json';

// 界面语言与 props.messages 提供的插件字段翻译分别选择。
export const UIContext = createContext(english.messages);
export function useUI(): typeof english.messages {
  return useContext(UIContext);
}
