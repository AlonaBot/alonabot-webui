import type { JSX, ReactNode } from 'react';
import { useUI } from '../i18n/UI';
import styles from './EmptyState.module.css';

/** 空状态或页面级错误：一个图标、一句话、可选说明与操作。tone=error 时图标为危险色。 */
export function EmptyState({ icon, title, description, action, tone = 'default' }: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: 'default' | 'error';
}): JSX.Element {
  return <div className={styles.root} data-tone={tone} role={tone === 'error' ? 'alert' : undefined}>
    {icon && <div className={styles.icon}>{icon}</div>}
    <p className={styles.title}>{title}</p>
    {description && <div className={styles.description}>{description}</div>}
    {action && <div className={styles.action}>{action}</div>}
  </div>;
}

/** 加载占位块；按内容的大致形状给宽高。 */
export function Skeleton({ width = '100%', height = 16, radius }: { width?: number | string; height?: number | string; radius?: number }): JSX.Element {
  return <span className={styles.skeleton} style={{ width, height, borderRadius: radius }} aria-hidden />;
}

/** 内容加载占位：几行骨架，读屏读作「加载中」。 */
export function LoadingRows({ rows = 3, height = 48 }: { rows?: number; height?: number }): JSX.Element {
  const ui = useUI();
  return <div role="status" aria-label={ui.loading} className={styles.loading}>
    {Array.from({ length: rows }, (_, index) => <Skeleton key={index} height={height} radius={12} />)}
  </div>;
}

/** 行内或整页的转圈指示，用于没有固定版式可占位的地方。 */
export function Spinner({ size = 20 }: { size?: number }): JSX.Element {
  const ui = useUI();
  return <span role="status" aria-label={ui.loading} className={styles.spinner} style={{ width: size, height: size }} />;
}
