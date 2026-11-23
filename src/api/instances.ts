// 适配器实例（机器人账号）。
import { request } from './client';
import type { ConfigDiagnostics } from './config';

// ----------------------------------------------------------------------------
// Adapter 实例管理 API
// ----------------------------------------------------------------------------

/** 读取 Adapter 实例配置 Schema。 */
export async function getInstanceSchema(adapterID: string): Promise<unknown> {
  return request<unknown>(`/api/v1/adapters/${encodeURIComponent(adapterID)}/instance-schema`);
}

/** 读取指定 Adapter 实例的脱敏配置（凭证形如 {$secret_set:true}）。 */
export async function getInstanceConfig(
  adapterID: string,
  instanceID: string,
): Promise<ConfigDiagnostics & { config: Record<string, unknown> }> {
  return request<ConfigDiagnostics & { config: Record<string, unknown> }>(
    `/api/v1/adapters/${encodeURIComponent(adapterID)}/instances/${encodeURIComponent(instanceID)}`,
  );
}

/** 整体替换账号配置；省略的 secret 字段由 Core 保留原值。 */
export async function updateInstanceConfig(adapterID: string, instanceID: string, config: Record<string, unknown>): Promise<void> {
  await request<void>(`/api/v1/adapters/${encodeURIComponent(adapterID)}/instances/${encodeURIComponent(instanceID)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
}

/** 创建 Adapter 实例。 */
export async function createInstance(input: {
  package_id: string;
  instance_id: string;
  config: Record<string, unknown>;
  confirm?: boolean;
}): Promise<void> {
  await request<void>('/api/v1/adapter/instances/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      package_id: input.package_id,
      instance_id: input.instance_id,
      config: input.config,
      confirm: input.confirm ?? false,
    }),
  });
}

/** 启停或删除指定 Adapter 实例。 */
export async function changeInstance(action: 'start' | 'stop' | 'delete', instanceID: string): Promise<void> {
  await request<void>(`/api/v1/adapter/instances/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instance_id: instanceID,
    }),
  });
}

export type AdapterInstance = {
  instance_id: string;
  adapter_id: string;
  package_id: string;
  /** 所属适配器组件的状态；被停用或卸载时账号保留但不会运行。 */
  package_state?: 'enabled' | 'disabled' | 'not_installed';
  state: 'running' | 'stopped' | 'failed';
  safe_error: string;
  default: boolean;
};

/** listInstances 读取 Core 持久配置中的账号及当前运行状态。 */
export async function listInstances(): Promise<AdapterInstance[]> {
  const result = await request<{ instances: AdapterInstance[] }>('/api/v1/adapter/instances');
  return result.instances;
}

export async function pruneInstanceConfig(adapterID: string, instanceID: string): Promise<void> {
  await request<void>(
    `/api/v1/adapters/${encodeURIComponent(adapterID)}/instances/${encodeURIComponent(instanceID)}/prune`,
    {
      method: 'POST',
    },
  );
}
