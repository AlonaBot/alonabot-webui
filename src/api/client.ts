// 请求核心：同源请求、CSRF、错误结构与会话/组件变更事件。

export class AdminAPIError extends Error {
  status: number;
  code?: string;
  affected?: string[];
  responseBody?: string;
  description?: string;

  constructor(status: number, message: string, code?: string, affected?: string[], description?: string) {
    super(message);
    this.name = 'AdminAPIError';
    this.status = status;
    this.code = code;
    this.affected = affected;
    this.description = description;
  }
}

/** 判断错误是否为服务端返回的需要显式确认的 409 确认对象。 */
export function isConfirmationError(err: unknown): err is AdminAPIError & { affected: string[] } {
  return err instanceof AdminAPIError && err.status === 409 && Array.isArray(err.affected);
}

// 内存中维护的 CSRF Token（不存入 localStorage/Cookie，防明文泄露）
export let currentCSRFToken: string | null = null;

export function setCSRFToken(token: string | null): void {
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

export function notifySessionExpired() {
  currentCSRFToken = null;
  for (const handler of sessionExpiredHandlers) {
    try {
      handler();
    } catch (err) {
      console.error('Session expired handler failed:', err);
    }
  }
}

type PackagesChangedHandler = () => void;

const packagesChangedHandlers = new Set<PackagesChangedHandler>();

/** 订阅组件安装、更新或卸载成功事件，返回取消订阅函数。 */
export function onPackagesChanged(handler: PackagesChangedHandler): () => void {
  packagesChangedHandlers.add(handler);
  return () => {
    packagesChangedHandlers.delete(handler);
  };
}

export function notifyPackagesChanged() {
  for (const handler of packagesChangedHandlers) {
    try {
      handler();
    } catch (err) {
      console.error('Packages changed handler failed:', err);
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
      const description = typeof error.description === 'string' ? error.description : undefined;
      const message = typeof error.safe_message === 'string'
        ? error.safe_message
        : (description ?? text);
      const result = new AdminAPIError(response.status, message, code, affected, description);
      result.responseBody = text;
      return result;
    }
  }
  return new AdminAPIError(response.status, text || `HTTP ${response.status}`);
}

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | FormData | Blob;
  response?: 'blob';
  signal?: AbortSignal;
}

export async function request<T = unknown>(
  path: string,
  options: RequestOptions = {},
  read?: (response: Response) => Promise<T>,
): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Expected a same-origin path');
  const method = options.method || 'GET';
  const headers: Record<string, string> = { ...(options.headers || {}) };
  const isMutating = method !== 'GET' && method !== 'HEAD';
  const isLogin = path === '/api/auth/login' || path === '/api/auth/bootstrap';

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
    signal: options.signal,
  });

  if (!response.ok) {
    // 受保护请求收到 401 触发会话过期（login 失败留在登录页展示，不触发全局过期通知）
    if (response.status === 401 && !isLogin) {
      notifySessionExpired();
    }
    throw await parseErrorResponse(response);
  }

  if (read) return read(response);

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  if (options.response === 'blob') return await response.blob() as T;

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  return (await response.text()) as unknown as T;
}

let currentClientLocale = 'zh-CN';

export function setClientLocale(locale: string): void {
  currentClientLocale = locale;
}

export function getClientLocale(): string {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('alonabot.webui.locale');
    if (saved) return saved;
  }
  return currentClientLocale;
}

/** adminRequest 共享同源请求的管理 Cookie、CSRF 与认证过期处理。 */
export function adminRequest<T>(path: string, options?: { method?: string; headers?: Record<string, string>; body?: string | FormData | Blob }): Promise<T> {
  return request<T>(path, options);
}

export const pluginPath = (id: string) => `/api/v1/plugins/${encodeURIComponent(id)}`;

export const jsonBody = (body: unknown, method = 'POST'): RequestOptions => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
