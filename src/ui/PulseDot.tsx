import type { JSX } from 'react';
import { cn } from '../lib/cn';

export type PulseTone = 'running' | 'waking' | 'idle' | 'danger' | 'off';

export interface PulseDotProps {
  readonly tone: PulseTone;
  readonly size?: 'sm' | 'md';
  readonly className?: string;
}

const colorMap: Record<PulseTone, string> = {
  running: 'bg-[var(--color-success)]',
  waking: 'bg-[var(--color-warning)]',
  idle: 'bg-[var(--color-accent)]',
  danger: 'bg-[var(--color-danger)]',
  off: 'bg-[var(--color-ink-muted)]/55',
};

/** PulseDot 表达活体运行状态：在线扩散脉冲、休眠柔和呼吸、故障警示波纹。 */
export function PulseDot({ tone, size = 'md', className }: PulseDotProps): JSX.Element {
  const dim = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';
  const pulse = tone === 'running' || tone === 'danger' || tone === 'waking';
  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center', dim, className)} aria-hidden="true">
      {pulse && <span className={cn('alona-pulse-ring absolute inset-0 rounded-full', colorMap[tone])} />}
      <span className={cn('relative rounded-full', dim, colorMap[tone], tone === 'idle' && 'alona-breathe')} />
    </span>
  );
}
