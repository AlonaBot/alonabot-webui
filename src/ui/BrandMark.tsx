import { useId, type JSX } from 'react';
import { cn } from '../lib/cn';

/**
 * AlonaBot 矢量标识（供侧栏与移动端顶栏使用，与 src/assets/mark.svg 保持一致）。
 */
export function BrandMark({
  size = 28,
  badge = false,
  className,
}: {
  size?: number;
  badge?: boolean;
  className?: string;
}): JSX.Element {
  const gradID = useId();
  const glyphSize = badge ? Math.round(size * 0.62) : size;

  const svg = (
    <svg
      width={glyphSize}
      height={glyphSize}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={cn('block shrink-0', !badge && className)}
    >
      <defs>
        <linearGradient id={gradID} x1="6" y1="2" x2="60" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--color-cyan)" />
          <stop offset="100%" stopColor="var(--color-ink)" />
        </linearGradient>
      </defs>
      <path
        d="M7.73328 58C16.3999 38.9333 24.1999 22.4667 31.1333 8.6C32.8666 5.13333 34.5999 5.13333 36.3333 8.6C43.2666 22.4667 49.3333 35.4667 54.5333 47.6C57.9999 54.5333 56.2666 57.1333 49.3333 55.4C40.6666 51.9333 31.1333 47.6 20.7333 42.4"
        stroke={`url(#${gradID})`}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (!badge) return svg;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--color-accent)_26%,var(--color-line))] bg-[var(--color-surface)] shadow-[var(--shadow-card)]',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {svg}
    </span>
  );
}
