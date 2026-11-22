import type { JSX, ReactNode } from 'react';
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
