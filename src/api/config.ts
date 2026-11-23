// 插件、实例与 Core 的配置快照、密钥与动态选项。
import { request } from './client';

export type ConfigOption = { value: string; label: string; description?: string };

export type OptionsPage = { options: ConfigOption[]; more: boolean };

export type Correction = { path: string; reason: 'converted' | 'reset' | 'removed'; original?: unknown };

export type ConfigDiagnostics = { corrections: Correction[]; unknown: string[] };

export type PendingConfig = { base_generation: string; config: Record<string, unknown> };

export type ConfigSnapshot = ConfigDiagnostics & {
  active_generation: string;
  active: Record<string, unknown>;
  pending: PendingConfig | null;
  schema: unknown;
  i18n: Record<string, Record<string, unknown>>;
  messages: Record<string, Record<string, unknown>>;
};

// ----------------------------------------------------------------------------
// 插件配置与诊断 API
// ----------------------------------------------------------------------------

export async function getPluginConfig(id: string): Promise<ConfigSnapshot> {
  return request<ConfigSnapshot>(`/api/v1/plugins/${encodeURIComponent(id)}/config`);
}

export async function patchPluginConfig(
  id: string,
  baseGeneration: string,
  patch: Record<string, unknown>,
): Promise<PendingConfig> {
  return request<PendingConfig>(`/api/v1/plugins/${encodeURIComponent(id)}/config/pending`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_generation: baseGeneration, patch }),
  });
}

export async function discardPluginConfig(id: string): Promise<void> {
  await request<void>(`/api/v1/plugins/${encodeURIComponent(id)}/config/pending`, {
    method: 'DELETE',
  });
}

export async function prunePluginConfig(id: string): Promise<PendingConfig> {
  return request<PendingConfig>(`/api/v1/plugins/${encodeURIComponent(id)}/config/prune`, {
    method: 'POST',
  });
}

/** 将实际值路径逐段将 ~ 转成 ~0、. 转成 ~1 后用点连接。数组下标占一段（§12.2）。 */
export function encodeSecretPath(segments: (string | number)[]): string {
  return segments.map(s => String(s).replace(/~/g, '~0').replace(/\./g, '~1')).join('.');
}

export async function revealPluginSecret(id: string, path: string, token: string): Promise<{ value: string }> {
  return request<{ value: string }>(`/api/v1/secrets/${encodeURIComponent(id)}/${encodeURIComponent(path)}/reveal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
  });
}

// ----------------------------------------------------------------------------
// 选项查询与示例 API
// ----------------------------------------------------------------------------

export async function listConfigOptions(
  id: string,
  path: string,
  q: string,
  locale: string,
): Promise<OptionsPage> {
  const query = new URLSearchParams({ path, q });
  return request<OptionsPage>(`/api/v1/plugins/${encodeURIComponent(id)}/config/options?${query.toString()}`, {
    headers: { 'Accept-Language': locale },
  });
}

export async function resolveConfigOptions(
  id: string,
  path: string,
  values: string[],
  locale: string,
): Promise<OptionsPage> {
  return request<OptionsPage>(`/api/v1/plugins/${encodeURIComponent(id)}/config/options/resolve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': locale,
    },
    body: JSON.stringify({ path, values }),
  });
}

export async function listInstanceOptions(
  adapterID: string,
  instanceID: string,
  path: string,
  q: string,
  locale: string,
): Promise<OptionsPage> {
  const query = new URLSearchParams({ path, q });
  return request<OptionsPage>(
    `/api/v1/adapters/${encodeURIComponent(adapterID)}/instances/${encodeURIComponent(instanceID)}/options?${query.toString()}`,
    {
      headers: { 'Accept-Language': locale },
    },
  );
}

export async function resolveInstanceOptions(
  adapterID: string,
  instanceID: string,
  path: string,
  values: string[],
  locale: string,
): Promise<OptionsPage> {
  return request<OptionsPage>(
    `/api/v1/adapters/${encodeURIComponent(adapterID)}/instances/${encodeURIComponent(instanceID)}/options/resolve`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': locale,
      },
      body: JSON.stringify({ path, values }),
    },
  );
}

function buildFilterParams(params: URLSearchParams, filter: Record<string, string>): void {
  for (const [k, v] of Object.entries(filter)) {
    params.set(`filter[${k}]`, v);
  }
}

export async function listCoreOptions(
  source: 'core.chats' | 'core.adapter_instances',
  q: string,
  filter: Record<string, string>,
  locale: string,
): Promise<OptionsPage> {
  const params = new URLSearchParams({ q });
  buildFilterParams(params, filter);
  return request<OptionsPage>(`/api/v1/core/options/${encodeURIComponent(source)}?${params.toString()}`, {
    headers: { 'Accept-Language': locale },
  });
}

export async function resolveCoreOptions(
  source: 'core.chats' | 'core.adapter_instances',
  values: string[],
  filter: Record<string, string>,
  locale: string,
): Promise<OptionsPage> {
  const params = new URLSearchParams();
  buildFilterParams(params, filter);
  const qs = params.toString();
  const url = `/api/v1/core/options/${encodeURIComponent(source)}/resolve${qs ? `?${qs}` : ''}`;
  return request<OptionsPage>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': locale,
    },
    body: JSON.stringify({ values }),
  });
}
