import { useRef, type HTMLAttributes, type JSX, type MouseEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface SpotlightCardProps extends HTMLAttributes<HTMLDivElement> {
  readonly children: ReactNode;
  readonly glowTone?: 'accent' | 'indigo' | 'success' | 'warning' | 'danger';
  readonly interactive?: boolean;
}

const glowToneMap: Record<NonNullable<SpotlightCardProps['glowTone']>, string> = {
  accent: 'rgba(34, 184, 207, 0.085)',
  indigo: 'rgba(59, 85, 136, 0.085)',
  success: 'rgba(18, 148, 99, 0.08)',
  warning: 'rgba(201, 122, 0, 0.08)',
  danger: 'rgba(220, 53, 69, 0.085)',
};

/**
 * Alona 清透卡片容器：高辨识度冰灰细边与微光跟随（直接操作 DOM ref 零重渲染）。
 */
export function SpotlightCard({
  children,
  className,
  glowTone = 'accent',
  interactive = false,
  onMouseMove,
  onMouseLeave,
  ...rest
}: SpotlightCardProps): JSX.Element {
  const cardRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const glowColor = glowToneMap[glowTone];

  const handleMove = (event: MouseEvent<HTMLDivElement>): void => {
    const el = cardRef.current;
    const glow = glowRef.current;
    if (el && glow) {
      const rect = el.getBoundingClientRect();
      glow.style.background = `radial-gradient(280px circle at ${event.clientX - rect.left}px ${event.clientY - rect.top}px, ${glowColor}, transparent 72%)`;
      glow.style.opacity = '1';
    }
    onMouseMove?.(event);
  };

  const handleLeave = (event: MouseEvent<HTMLDivElement>): void => {
    if (glowRef.current) {
      glowRef.current.style.opacity = '0';
    }
    onMouseLeave?.(event);
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={cn(
        'alona-glass relative overflow-hidden rounded-[var(--radius-lg)] transition-[border-color,box-shadow] duration-200 ease-[var(--ease-out)]',
        interactive && 'cursor-pointer hover:border-[color-mix(in_srgb,var(--color-accent)_48%,var(--color-line))] hover:shadow-[var(--shadow-popover)]',
        className,
      )}
      {...rest}
    >
      <div
        ref={glowRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300"
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
