// 阶段 C Core 生命周期与在线自更新探测接口；现行 Core 尚未提供时按 404 平滑降级。
import { AdminAPIError, request } from './client';

export type CoreEnvironment = 'native' | 'container' | 'managed';

export interface CoreLifecycleCapabilities {
  readonly environment: CoreEnvironment;
  readonly executable_path: string;
  readonly can_restart: boolean;
  readonly can_shutdown: boolean;
  readonly can_self_update: boolean;
  readonly unavailable_reason: string;
}

export type CoreUpdateState = 'idle' | 'checking' | 'downloading' | 'verifying' | 'applying' | 'restarting' | 'failed';

export interface CoreUpdateStatus {
  readonly state: CoreUpdateState;
  readonly current_version: string;
  readonly target_version: string;
  readonly downloaded_bytes: number;
  readonly total_bytes: number;
  readonly started_at?: string;
  readonly error: string;
}

/** 探测 Core 生命周期管理能力；Core 返回 404 时返回 null。 */
export async function getCoreLifecycle(): Promise<CoreLifecycleCapabilities | null> {
  try {
    return await request<CoreLifecycleCapabilities>('/api/v1/core/lifecycle');
  } catch (error: unknown) {
    if (error instanceof AdminAPIError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/** 探测 Core 在线更新状态；Core 返回 404 时返回 null。 */
export async function getCoreUpdateStatus(): Promise<CoreUpdateStatus | null> {
  try {
    return await request<CoreUpdateStatus>('/api/v1/core/update/status');
  } catch (error: unknown) {
    if (error instanceof AdminAPIError && error.status === 404) {
      return null;
    }
    throw error;
  }
}
