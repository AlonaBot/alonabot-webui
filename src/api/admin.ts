/**
 * Admin API 客户端与数据结构定义。
 * 遵循 spec/ADMIN-API.md 规范与 CONTRACTS §7.3～§7.5、§9.3、§12.1。
 */

export class AdminAPIError extends Error {
  status: number;
  code?: string;
  affected?: string[];

  constructor(status: number, message: string, code?: string, affected?: string[]) {
    super(message);
    this.name = 'AdminAPIError';
    this.status = status;
    this.code = code;
    this.affected = affected;
  }
}

/** 判断错误是否为服务端返回的需要显式确认的 409 确认对象。 */
export function isConfirmationError(err: unknown): err is AdminAPIError & { affected: string[] } {
  return err instanceof AdminAPIError && err.status === 409 && Array.isArray(err.affected);
}

export type CoreInfo = {
  version: string;
  listen: string;
  admin_api_major: number;
};

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
  Warnings?: string[];
  pages?: unknown[];
};

export type Generation = {
  id: string;
  version: string;
  created_at: string;
  active: boolean;
  has_db: boolean;
};

export type SourceLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical' | 'off' | 'inherit';

export type LogLevels = {
  global: string;
  sources: Record<string, SourceLogLevel>;
};

// 内存中维护的 CSRF Token（不存入 localStorage/Cookie，防明文泄露）
let currentCSRFToken: string | null = null;

function setCSRFToken(token: string | null): void {
  currentCSRFToken = token;
}

type SessionExpiredHandler = () => void;
const sessionExpiredHandlers = new Set<SessionExpiredHandler>();

/** 订阅受保护请求收到的 401 认证过期事件，返回取消订阅函数。 */
export function onSessionExpired(handler: SessionExpiredHandler): () => void {
  sessionExpiredHandlers.add(handler);
  return () => {
    sessionExpiredHandlers.delete(handler);
  };
}

function notifySessionExpired() {
  currentCSRFToken = null;
  for (const handler of sessionExpiredHandlers) {
    try {
      handler();
    } catch (err) {
      console.error('Session expired handler failed:', err);
    }
  }
}

async function parseErrorResponse(response: Response): Promise<AdminAPIError> {
  const text = await response.text();
  if (response.headers.get('content-type')?.includes('application/json')) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return new AdminAPIError(response.status, text);
    }
    if (data && typeof data === 'object') {
      const error = data as Record<string, unknown>;
      const affected = Array.isArray(error.affected) && error.affected.every(item => typeof item === 'string')
        ? error.affected as string[] : undefined;
      const code = typeof error.code === 'string' ? error.code : undefined;
      const message = typeof error.safe_message === 'string' ? error.safe_message : text;
      return new AdminAPIError(response.status, message, code, affected);
    }
  }
  return new AdminAPIError(response.status, text || `HTTP ${response.status}`);
}

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | FormData;
}

async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method || 'GET';
  const headers: Record<string, string> = { ...(options.headers || {}) };
  const isMutating = method !== 'GET' && method !== 'HEAD';
  const isLogin = path === '/api/auth/login';

  // 受保护的变更请求携带内存中的 X-Alonabot-CSRF
  if (isMutating && !isLogin && currentCSRFToken) {
    headers['X-Alonabot-CSRF'] = currentCSRFToken;
  }

  // Origin 由浏览器按当前页面来源设置，Cookie 仅发往同源入口。
  const response = await fetch(path, {
    method,
    headers,
    body: options.body,
    credentials: 'same-origin',
  });

  if (!response.ok) {
    // 受保护请求收到 401 触发会话过期（login 失败留在登录页展示，不触发全局过期通知）
    if (response.status === 401 && !isLogin) {
      notifySessionExpired();
    }
    throw await parseErrorResponse(response);
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  return (await response.text()) as unknown as T;
}

// ----------------------------------------------------------------------------
// 认证与会话 API
// ----------------------------------------------------------------------------

/** 提交管理 token 登录，200 时取 csrf_token 存入内存。 */
export async function login(token: string): Promise<void> {
  const result = await request<{ csrf_token: string }>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  setCSRFToken(result.csrf_token);
}

/** 页面加载或刷新后取回已有管理会话与固定过期时间。 */
export async function restoreSession(): Promise<{ expires_at_unix_ms: number }> {
  const result = await request<{ csrf_token: string; expires_at_unix_ms: number }>('/api/auth/session', {
    method: 'GET',
  });
  setCSRFToken(result.csrf_token);
  return { expires_at_unix_ms: result.expires_at_unix_ms };
}

/** 登出并撤销管理会话，清空本地 CSRF。 */
export async function logout(): Promise<void> {
  await request<void>('/api/auth/logout', { method: 'POST' });
  setCSRFToken(null);
}

// ----------------------------------------------------------------------------
// Core 与组件管理 API
// ----------------------------------------------------------------------------

/** 获取 Core 基本信息（版本、监听地址、Admin API 主版本号）。 */
export async function getCore(): Promise<CoreInfo> {
  return request<CoreInfo>('/api/v1/core');
}

/** 获取全部组件包列表。 */
export async function listPackages(): Promise<Package[]> {
  return request<Package[]>('/api/v1/packages');
}

/** 返回组件图标的绝对路径 URL。 */
export function packageIconURL(id: string): string {
  return `/api/v1/packages/${encodeURIComponent(id)}/icon`;
}

/** 安装组件（远程 Source: "owner/repo" 或浏览器本地上传 FormData）。 */
export async function installPackage(
  input: { Source: string; Replace?: boolean; Confirm?: boolean } | FormData,
): Promise<Package> {
  if (input instanceof FormData) {
    return request<Package>('/api/v1/packages/install', {
      method: 'POST',
      body: input,
    });
  }

  return request<Package>('/api/v1/packages/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

/** 更新组件（JSON 沿用原来源或 FormData 上传更新包）。 */
export async function updatePackage(
  id: string,
  input: { confirm?: boolean } | FormData,
): Promise<{ warnings?: string[] }> {
  if (input instanceof FormData) {
    input.set('id', id);
    return request<{ warnings?: string[] }>('/api/v1/packages/update', {
      method: 'POST',
      body: input,
    });
  }

  return request<{ warnings?: string[] }>('/api/v1/packages/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      confirm: input.confirm ?? false,
      install: {},
    }),
  });
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

/** 获取全局及来源日志级别。 */
export async function getLogLevels(): Promise<LogLevels> {
  return request<LogLevels>('/api/v1/logs/levels');
}

/** 设置特定组件的日志级别。 */
export async function setPackageLogLevel(id: string, level: SourceLogLevel): Promise<LogLevels> {
  return request<LogLevels>('/api/v1/logs/levels', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sources: { [id]: level },
    }),
  });
}

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
): Promise<{ config: Record<string, unknown> }> {
  return request<{ config: Record<string, unknown> }>(
    `/api/v1/adapters/${encodeURIComponent(adapterID)}/instances/${encodeURIComponent(instanceID)}`,
  );
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

/** listGenerations 读取按提交时间降序排列的保留代次。 */
export async function listGenerations(id: string): Promise<Generation[]> {
  const result = await request<{ generations: Generation[] }>(
    `/api/v1/plugins/${encodeURIComponent(id)}/generations`,
  );
  return result.generations;
}

export type AdapterInstance = {
  instance_id: string;
  adapter_id: string;
  package_id: string;
  state: 'running' | 'stopped' | 'failed';
  safe_error: string;
  default: boolean;
};

/** listInstances 读取 Core 持久配置中的账号及当前运行状态。 */
export async function listInstances(): Promise<AdapterInstance[]> {
  const result = await request<{ instances: AdapterInstance[] }>('/api/v1/adapter/instances');
  return result.instances;
}

export type Chat = {
  session: string;
  title: string;
  chat_type: 'private' | 'group' | 'channel';
  instance_id: string;
  last_active_at: string;
};

/** listChats 读取完整聊天目录，再按实例归组，避免把单页或 Adapter 总数当成账号会话数。 */
export async function listChats(): Promise<Chat[]> {
  const chats: Chat[] = [];
  let total: number;
  do {
    const page = await request<{ chats: Chat[]; total: number }>(`/api/v1/chats?offset=${chats.length}&limit=50`);
    chats.push(...page.chats);
    total = page.total;
  } while (chats.length < total);
  return chats;
}

export type Profile = { id: string; name: string; color: string; sessions: number };
export type ProfileAssignments = {
  instances: Record<string, string>;
  sessions: { instance: string; session: string; profile: string }[];
};

/** listProfiles 读取配置文件选择项。 */
export function listProfiles(): Promise<Profile[]> {
  return request<Profile[]>('/api/v1/profiles');
}

/** getProfileAssignments 读取实例缺省与会话单独指定的配置文件。 */
export function getProfileAssignments(): Promise<ProfileAssignments> {
  return request<ProfileAssignments>('/api/v1/profiles/assignments');
}

/** assignInstanceProfile 保存已创建实例的配置文件指定。 */
export async function assignInstanceProfile(instanceID: string, profile: string): Promise<void> {
  await request('/api/v1/profiles/assignments/instances/' + encodeURIComponent(instanceID), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile }),
  });
}
