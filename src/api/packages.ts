// 组件安装、更新、卸载、版本、运行与休眠。
import { currentCSRFToken, getClientLocale, jsonBody, notifyPackagesChanged, notifySessionExpired, pluginPath, request } from './client';
import type { Changelog } from './core';
import { waitTask } from './tasks';

export type PackagePage = { path: string; title: string; purpose?: string };

export type Package = {
  ID: string;
  Role: string;
  AdapterID: string;
  Version: string;
  Source: string;
  PublisherKeyID: string;
  Pin: string;
  Enabled: boolean;
  Uninstalled: boolean;
  Signed: boolean;
  Active: string;
  State: string;
  RuntimeState?: RuntimeState;
  Warnings?: string[];
  pages?: PackagePage[];
  Name?: string;
  Description?: string;
  Author?: string;
};

export type Generation = {
  id: string;
  version: string;
  created_at: string;
  active: boolean;
  has_db: boolean;
};

export type PluginJob = {
  job_id: string;
  trigger: string;
  paused: boolean;
  last_run_at?: string;
  next_run_at?: string;
};

/** 获取全部组件包列表。 */
export async function listPackages(): Promise<Package[]> {
  const lang = getClientLocale();
  return request<Package[]>('/api/v1/packages', {
    headers: { 'Accept-Language': lang },
  });
}

/** 返回组件图标的绝对路径 URL。 */
export function packageIconURL(id: string): string {
  return `/api/v1/packages/${encodeURIComponent(id)}/icon`;
}

/** 安装组件（远程 Source: "owner/repo" 或浏览器本地上传 FormData）。 */
export async function installPackage(
  input: { Source: string; Replace?: boolean; Confirm?: boolean; Build?: boolean; Ref?: string } | FormData,
  onLog?: (log: string) => void,
): Promise<Package> {
  let pkg: Package;
  if (!(input instanceof FormData) && input.Build) {
    // 源码构建在 Core 里作为后台任务运行，返回任务 ID，这里等它结束。
    const accepted = await request<{ task_id: string }>('/api/v1/packages/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    pkg = await waitTask<Package>(accepted.task_id, onLog);
  } else if (input instanceof FormData) {
    pkg = await request<Package>('/api/v1/packages/install', {
      method: 'POST',
      body: input,
    });
  } else {
    pkg = await request<Package>('/api/v1/packages/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }
  notifyPackagesChanged();
  return pkg;
}

/** 更新组件（JSON 沿用原来源或 FormData 上传更新包）。 */
export async function updatePackage(
  id: string,
  input: { confirm?: boolean } | FormData,
): Promise<{ warnings?: string[] }> {
  let result: { warnings?: string[] };
  if (input instanceof FormData) {
    input.set('id', id);
    result = await request<{ warnings?: string[] }>('/api/v1/packages/update', {
      method: 'POST',
      body: input,
    });
  } else {
    result = await request<{ warnings?: string[] }>('/api/v1/packages/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        confirm: input.confirm ?? false,
        install: {},
      }),
    });
  }
  notifyPackagesChanged();
  return result;
}

/** 启停、重启或重载组件。 */
export async function changePackage(
  action: 'enable' | 'disable' | 'restart' | 'reload',
  id: string,
  confirm?: boolean,
): Promise<void> {
  const body: Record<string, unknown> = { id };
  if (action === 'disable') {
    body.confirm = confirm ?? false;
  }
  await request<void>(`/api/v1/packages/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** 卸载组件。purge: 0 保留数据和配置，1 清除数据，2 清除数据和配置。 */
export async function uninstallPackage(id: string, purge: 0 | 1 | 2, confirm?: boolean): Promise<void> {
  await request<void>('/api/v1/packages/uninstall', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      purge,
      confirm: confirm ?? false,
    }),
  });
  notifyPackagesChanged();
}

/** 回退组件到指定代次。 */
export async function rollbackPackage(id: string, generation: string, confirm?: boolean): Promise<void> {
  await request<void>('/api/v1/packages/rollback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      generation,
      confirm: confirm ?? false,
    }),
  });
}

/** listGenerations 读取按提交时间降序排列的保留代次。 */
export async function listGenerations(id: string): Promise<Generation[]> {
  const result = await request<{ generations: Generation[] }>(
    `/api/v1/plugins/${encodeURIComponent(id)}/generations`,
  );
  return result.generations;
}

export function getPackageChangelog(id: string, locale: string): Promise<Changelog> { return request(`/api/v1/packages/${encodeURIComponent(id)}/changelog`, { headers: { 'Accept-Language': locale } }); }

export function pluginExampleURL(id: string, image: string): string {
  const stripped = image.startsWith('examples/') ? image.slice('examples/'.length) : image;
  const encodedSegments = stripped
    .split('/')
    .filter(Boolean)
    .map(seg => encodeURIComponent(seg))
    .join('/');
  return `/api/v1/packages/${encodeURIComponent(id)}/examples/${encodedSegments}`;
}

export async function listPluginJobs(id: string): Promise<{ jobs: PluginJob[] }> {
  return request<{ jobs: PluginJob[] }>(`/api/v1/plugins/${encodeURIComponent(id)}/jobs`);
}

export async function changePluginJob(
  id: string,
  jobID: string,
  action: 'pause' | 'resume',
): Promise<void> {
  await request<void>(
    `/api/v1/plugins/${encodeURIComponent(id)}/jobs/${encodeURIComponent(jobID)}/${action}`,
    {
      method: 'POST',
    },
  );
}

// ----------------------------------------------------------------------------
// 插件页面代理 API
// ----------------------------------------------------------------------------

export async function requestPluginPage(
  id: string,
  input: { method: string; path: string; headers?: Record<string, string>; body_base64?: string },
): Promise<{ status: number; headers: Record<string, string>; body_base64: string }> {
  const headers = new Headers(input.headers);
  if (input.method !== 'GET' && input.method !== 'HEAD' && currentCSRFToken) headers.set('X-Alonabot-CSRF', currentCSRFToken);
  const body = input.body_base64 === undefined ? undefined : Uint8Array.from(atob(input.body_base64), char => char.charCodeAt(0));
  const response = await fetch(`/plugins/${encodeURIComponent(id)}/${input.path}`, {
    method: input.method, headers, body, credentials: 'same-origin', redirect: 'error',
  });
  if (response.status === 401) notifySessionExpired();
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { status: response.status, headers: Object.fromEntries(response.headers), body_base64: btoa(binary) };
}

/** SleepPolicy 返回原始覆盖、生效策略与当前准入原因。 */
export type SleepPolicy = {
  policy: string | null;
  effective_policy: string;
  sleep_capable: boolean;
  eligible: boolean;
  reason: string;
  warnings?: string[];
};

/** RuntimeState 描述插件或 Agent 的实际运行状态。 */
export type RuntimeState = 'STOPPED' | 'WAKING' | 'ACTIVE' | 'QUIESCING' | 'SUSPENDED' | 'FAILED';

/** PluginRuntime 保留实际代次及最近的状态、唤醒和休眠记录。 */
export type PluginRuntime = {
  enabled: boolean;
  generation_id: string;
  state: RuntimeState;
  reason: string;
  changed_at: string;
  last_wake?: { reason: string; at: string };
  last_suspend?: { reason: string; at: string };
};

/** getPluginSleepPolicy 查询休眠准入，不启动插件。 */
export function getPluginSleepPolicy(id: string): Promise<SleepPolicy> {
  return request<SleepPolicy>(`${pluginPath(id)}/sleep-policy`);
}

/** setPluginSleepPolicy 保存原始策略，null 删除覆盖并跟随全局。 */
export async function setPluginSleepPolicy(id: string, policy: string | null): Promise<void> {
  await request(`${pluginPath(id)}/sleep-policy`, policy === null ? { method: 'DELETE' } : jsonBody({ policy }, 'PUT'));
}

/** getPluginRuntime 只读运行状态与实际事件时间。 */
export function getPluginRuntime(id: string): Promise<PluginRuntime> {
  return request<PluginRuntime>(`${pluginPath(id)}/runtime`);
}
