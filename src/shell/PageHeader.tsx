import { createContext, useContext, type JSX, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** 顶栏左右两个插槽的挂载点，由 AppShell 提供。 */
export const PageHeaderSlots = createContext<{ left: HTMLElement | null; right: HTMLElement | null }>({ left: null, right: null });

/**
 * 页面把标签、筛选或页面级操作放进顶栏，与全局搜索同排（原型中「已安装 / 商店」「24 小时」等）。
 * 窄屏时两个插槽各占一行，排在标题下方。
 */
export function PageHeader({ left, right }: { left?: ReactNode; right?: ReactNode }): JSX.Element {
  const slots = useContext(PageHeaderSlots);
  return <>
    {left && slots.left && createPortal(left, slots.left)}
    {right && slots.right && createPortal(right, slots.right)}
  </>;
}
