// Core 后台任务（源码构建等长时间管理操作）。
import { AdminAPIError, request } from './client';

export type Task<T = unknown> = {
  id: string;
  action: string;
  status: 'running' | 'succeeded' | 'failed';
  created_at: string;
  finished_at?: string;
  log?: string;
  result?: T;
  http_status?: number;
  error?: { code?: string; safe_message?: string; affected?: string[] };
};

export function getTask<T>(id: string): Promise<Task<T>> {
  return request<Task<T>>(`/api/v1/tasks/${encodeURIComponent(id)}`);
}

/**
 * 每秒查询一次任务直到结束，期间把完整日志交给 onLog。失败时抛出与同步接口相同形状的
 * AdminAPIError（含 409 的 affected），调用方可以沿用同一套确认流程。
 */
export async function waitTask<T>(id: string, onLog?: (log: string) => void): Promise<T> {
  for (;;) {
    const task = await getTask<T>(id);
    if (task.log !== undefined) onLog?.(task.log);
    if (task.status === 'succeeded') return task.result as T;
    if (task.status === 'failed') {
      const error = task.error ?? {};
      throw new AdminAPIError(task.http_status ?? 500, error.safe_message ?? 'task failed', error.code, error.affected);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
