import { useEffect, useState } from 'react';

/** 主题偏好设置：浅色、深色或跟随系统。 */
export type ThemeChoice = 'light' | 'dark' | 'system';

const themeStorageKey = 'alonabot.webui.theme';

/** 根据用户选择与系统深色模式偏好解析最终生效的主题（浅色或深色）。 */
export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): 'light' | 'dark' {
  if (choice === 'light') {
    return 'light';
  }
  if (choice === 'dark') {
    return 'dark';
  }
  return prefersDark ? 'dark' : 'light';
}

function applyTheme(resolved: 'light' | 'dark'): void {
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', resolved === 'dark' ? '#0D1422' : '#F4F7FB');
  }
}

function readStoredChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(themeStorageKey);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch {
    // 忽略 localStorage 访问异常
  }
  return 'system';
}

/**
 * 管理 WebUI 主题状态的 Hook。
 * 状态持久化在 localStorage，并同步到根节点 data-theme 属性与移动端浏览器 theme-color。
 */
export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => readStoredChoice());

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const updateThemeAttribute = (): void => {
      applyTheme(resolveTheme(choice, media.matches));
    };

    updateThemeAttribute();

    const listener = (): void => {
      if (choice === 'system') {
        updateThemeAttribute();
      }
    };

    media.addEventListener('change', listener);
    return () => {
      media.removeEventListener('change', listener);
    };
  }, [choice]);

  const setChoice = (nextChoice: ThemeChoice): void => {
    try {
      localStorage.setItem(themeStorageKey, nextChoice);
    } catch {
      // 忽略存储失败
    }
    setChoiceState(nextChoice);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(resolveTheme(nextChoice, media.matches));
  };

  return [choice, setChoice];
}
