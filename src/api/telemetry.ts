// 阶段 B 资源开销与运行时间遥测探测接口；现行 Core 尚未提供时按 404 平滑降级。
import { AdminAPIError, request } from './client';

export interface HostTelemetry {
  readonly cpu_cores: number;
  readonly memory_total_bytes: number;
  readonly platform: string;
}

export interface ResourceAggregate {
  readonly cpu_percent: number;
  readonly rss_bytes: number;
  readonly process_count: number;
}

export interface CoreProcessTelemetry {
  readonly pid: number;
  readonly started_at: string;
  readonly uptime_seconds: number;
  readonly cpu_percent: number;
  readonly rss_bytes: number;
  readonly goroutines: number;
}

export interface RoleTelemetry {
  readonly cpu_percent: number;
  readonly rss_bytes: number;
  readonly running_count: number;
  readonly total_count: number;
}

export interface ComponentTelemetry {
  readonly id: string;
  readonly role: string;
  readonly state: string;
  readonly running: boolean;
  readonly in_process: boolean;
  readonly pid: number;
  readonly process_count: number;
  readonly started_at?: string;
  readonly uptime_seconds: number;
  readonly cpu_percent: number;
  readonly rss_bytes: number;
}

export interface TelemetryHistoryPoint {
  readonly ts: string;
  readonly total_cpu_percent: number;
  readonly total_rss_bytes: number;
  readonly core_cpu_percent: number;
  readonly core_rss_bytes: number;
  readonly plugin_rss_bytes: number;
  readonly adapter_rss_bytes: number;
  readonly agent_rss_bytes: number;
  readonly webui_rss_bytes: number;
}

export interface CoreTelemetry {
  readonly sampled_at: string;
  readonly interval_seconds: number;
  readonly cpu_scale: 'host_normalized_percent';
  readonly host: HostTelemetry;
  readonly total: ResourceAggregate;
  readonly core: CoreProcessTelemetry;
  readonly by_role: Readonly<Record<string, RoleTelemetry>>;
  readonly components: readonly ComponentTelemetry[];
  readonly history: readonly TelemetryHistoryPoint[];
}

export type TelemetryWindow = '5m' | '15m' | '30m';

/** 拉取 Core 与组件资源遥测；Core 返回 404 时返回 null 以便阶段 A 无感降级。 */
export async function getCoreTelemetry(windowSize: TelemetryWindow = '30m'): Promise<CoreTelemetry | null> {
  try {
    return await request<CoreTelemetry>(`/api/v1/core/telemetry?window=${encodeURIComponent(windowSize)}`);
  } catch (error: unknown) {
    if (error instanceof AdminAPIError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/** 格式化内存字节数为紧凑可读文本。 */
export function formatMemoryBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** 格式化运行秒数为紧凑时长（如 14d 6h、3h 12m、42m）。 */
export function formatUptime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${total}s`;
}
