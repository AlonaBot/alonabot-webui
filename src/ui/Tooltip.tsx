import type { JSX, ReactElement, ReactNode } from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';

/** 悬停或聚焦时的提示气泡，取代原生 title 属性；content 为空时原样返回 child。 */
export function Tooltip({
  content,
  side = 'top',
  children,
}: {
  content: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: ReactElement;
}): JSX.Element {
  if (content === undefined || content === null || content === '') {
    return children;
  }
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-[var(--z-popover)] max-w-[280px] rounded-lg border border-white/10 bg-[var(--color-bubble)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-on-bubble)] shadow-lg"
        >
          {content}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

export const TooltipProvider = RadixTooltip.Provider;
