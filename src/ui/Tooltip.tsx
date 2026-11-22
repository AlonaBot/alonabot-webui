import type { JSX, ReactElement, ReactNode } from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import styles from './Tooltip.module.css';

/** 悬停或聚焦时的说明，取代 title 属性；child 必须能接收 ref（按钮、链接等）。 */
export function Tooltip({ content, side = 'top', children }: { content: ReactNode; side?: 'top' | 'right' | 'bottom' | 'left'; children: ReactElement }): JSX.Element {
  return <RadixTooltip.Root>
    <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
    <RadixTooltip.Portal>
      <RadixTooltip.Content side={side} sideOffset={6} collisionPadding={8} className={styles.content}>{content}</RadixTooltip.Content>
    </RadixTooltip.Portal>
  </RadixTooltip.Root>;
}

export const TooltipProvider = RadixTooltip.Provider;
