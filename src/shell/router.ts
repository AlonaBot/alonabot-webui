import React, { useEffect, useState, type JSX } from 'react';

/**
 * 监听浏览器当前路径的 Hook。
 * 依靠 popstate 与内部导航事件同步，无需额外路由库。
 */
export function usePath(): string {
  const [path, setPath] = useState<string>(() => {
    if (typeof window === 'undefined') {
      return '/';
    }
    return window.location.pathname || '/';
  });

  useEffect(() => {
    const handlePopState = () => {
      setPath(window.location.pathname || '/');
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  return path;
}

/** 读取当前地址的查询参数，地址变化（含仅查询串变化）时更新。 */
export function useQueryParam(name: string): string | null {
  const read = () => typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(name);
  const [value, setValue] = useState<string | null>(read);
  useEffect(() => {
    const sync = () => setValue(read());
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [name]);
  return value;
}

/**
 * 客户端页面导航，基于 HTML5 History API 实现。
 * 进入新页面时回到顶部；只改查询串（同一页面内切换标签）时保持滚动位置。
 */
export function navigate(path: string, options?: { replace?: boolean }): void {
  if (typeof window === 'undefined') {
    return;
  }
  const samePage = new URL(path, window.location.href).pathname === window.location.pathname;
  if (options?.replace) {
    window.history.replaceState(null, '', path);
  } else {
    window.history.pushState(null, '', path);
    if (!samePage) window.scrollTo(0, 0);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

interface LinkProps {
  to: string;
  className?: string;
  'aria-label'?: string;
  'aria-current'?: 'page';
  'data-disabled'?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

/**
 * SPA 页面跳转链接组件，拦截常规左键点击使用 pushState 导航。
 * 因文件为 router.ts（而非 .tsx），使用 React.createElement 创建 DOM 元素。
 */
export function Link(props: LinkProps): JSX.Element {
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey
    ) {
      return;
    }
    event.preventDefault();
    if (props['data-disabled']) return;
    props.onClick?.();
    navigate(props.to);
  };

  return React.createElement(
    'a',
    {
      href: props.to,
      className: props.className,
      'aria-label': props['aria-label'],
      'aria-current': props['aria-current'],
      'data-disabled': props['data-disabled'] || undefined,
      onClick: handleClick,
    },
    props.children,
  );
}
