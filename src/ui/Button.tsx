import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly loading?: boolean;
  readonly icon?: ReactNode;
  readonly iconOnly?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'border border-transparent bg-[var(--color-accent)] text-white font-semibold shadow-[var(--shadow-glow-accent)] hover:bg-[var(--color-accent-strong)] active:scale-[0.985] dark:text-[#0B1322]',
  secondary:
    'border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[0_1px_2px_rgba(31,42,68,0.05)] hover:border-[color-mix(in_srgb,var(--color-accent)_48%,var(--color-line))] hover:bg-[var(--color-surface-2)] active:scale-[0.985]',
  soft:
    'border border-[color-mix(in_srgb,var(--color-accent)_26%,transparent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)] hover:border-[color-mix(in_srgb,var(--color-accent)_48%,transparent)] active:scale-[0.985]',
  ghost:
    'border border-transparent bg-transparent text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)] active:scale-[0.985]',
  danger:
    'border border-[color-mix(in_srgb,var(--color-danger)_36%,transparent)] bg-[var(--color-danger-soft)] text-[var(--color-danger)] hover:bg-[var(--color-danger)] hover:text-white active:scale-[0.985]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-[var(--radius-sm)]',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-[10px]',
  lg: 'h-11 px-5 text-sm gap-2 rounded-[12px]',
};

const iconOnlyClasses: Record<ButtonSize, string> = {
  sm: 'h-8 w-8 p-0 rounded-[var(--radius-sm)]',
  md: 'h-9 w-9 p-0 rounded-[10px]',
  lg: 'h-11 w-11 p-0 rounded-[12px]',
};

/**
 * 统一按钮原语：清透精炼触感，loading 时保持既有占位宽度避免界面跳动。
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, icon, iconOnly = false, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-all duration-150 ease-[var(--ease-out)] disabled:pointer-events-none disabled:opacity-45',
        variantClasses[variant],
        iconOnly ? iconOnlyClasses[size] : sizeClasses[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={size === 'sm' ? 14 : 16} className="animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
});
