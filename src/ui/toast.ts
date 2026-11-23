import { AdminAPIError } from '../api/client';

export type ToastKind = 'success' | 'error' | 'info';

/** 一条提示；title 为空时由 Toaster 填入当前语言的「操作失败」。 */
export type ToastItem = {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
  /** 服务端原始响应或错误全文，折叠显示，不截断。 */
  detail?: string;
};

type Listener = (items: readonly ToastItem[]) => void;

let nextID = 1;
let items: readonly ToastItem[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(items);
}

function push(item: Omit<ToastItem, 'id'>): number {
  const id = nextID++;
  items = [...items, { ...item, id }];
  emit();
  return id;
}

/** 移除一条提示；Toaster 在关闭动画结束后调用。 */
export function dismissToast(id: number) {
  items = items.filter(item => item.id !== id);
  emit();
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(items);
  return () => { listeners.delete(listener); };
}

/** 错误的一句话说明：服务端 safe_message 优先，其次是 Error.message。 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function errorDetail(error: unknown): string | undefined {
  if (error instanceof AdminAPIError) {
    const parts = [`HTTP ${error.status}${error.code ? ` ${error.code}` : ''}`];
    if (error.description && error.description !== error.message) parts.push(error.description);
    if (error.responseBody) parts.push(error.responseBody);
    return parts.join('\n');
  }
  return undefined;
}

/** 操作结果提示。成功与普通提示自动消失；错误保留到用户关闭。 */
export const toast = {
  success: (title: string, description?: string) => push({ kind: 'success', title, description }),
  info: (title: string, description?: string) => push({ kind: 'info', title, description }),
  error: (error: unknown, title = '') => push({ kind: 'error', title, description: errorMessage(error), detail: errorDetail(error) }),
};
