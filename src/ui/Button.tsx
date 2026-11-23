import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'dark' | 'secondary' | 'soft' | 'ghost' | 'danger';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  /** 进行中时禁用并在图标位显示转圈，宽度不变。 */
  loading?: boolean;
  icon?: ReactNode;
  /** 仅图标的方形按钮；必须同时提供 aria-label。 */
  iconOnly?: boolean;
};

/**
 * 统一按钮。primary 是强调色主操作，dark 是原型里「安装」「发布插件」一类的深色按钮，
 * soft 是浅强调底的行内操作（「更新」「应用」）。
 */
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'secondary', size = 'md', loading = false, icon, iconOnly = false, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return <button
    ref={ref}
    type={type}
    className={[styles.button, className].filter(Boolean).join(' ')}
    data-variant={variant}
    data-size={size}
    data-icon-only={iconOnly || undefined}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    {...rest}
  >
    {loading ? <LoaderCircle className={styles.spin} size={size === 'sm' ? 14 : 16} aria-hidden /> : icon}
    {children}
  </button>;
});
