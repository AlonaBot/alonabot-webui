// 登录、会话、首次领取与令牌轮换。
import { AdminAPIError, request, setCSRFToken } from './client';

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
export async function restoreSession(): Promise<{ expires_at_unix_ms: number; bootstrap_pending?: boolean }> {
  const result = await request<{ csrf_token: string; expires_at_unix_ms: number; bootstrap_pending?: boolean }>('/api/auth/session', {
    method: 'GET',
  });
  setCSRFToken(result.csrf_token);
  return { expires_at_unix_ms: result.expires_at_unix_ms, bootstrap_pending: result.bootstrap_pending };
}

/** 登出并撤销管理会话，清空本地 CSRF。 */
export async function logout(): Promise<void> {
  await request<void>('/api/auth/logout', { method: 'POST' });
  setCSRFToken(null);
}

export async function rotateAdminToken(token: string): Promise<{ token: string }> {
  const result = await request<{ token: string }>('/api/auth/token/rotate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  setCSRFToken(null);
  return result;
}

/** 本机领取待确认凭据，沿用管理 Cookie 与内存 CSRF。 */
export async function bootstrap(): Promise<string | null> {
  try {
    const result = await request<{ token: string; csrf_token: string }>('/api/auth/bootstrap', { method: 'POST' });
    setCSRFToken(result.csrf_token);
    return result.token;
  } catch (error) {
    // 旧版 Core 无此接口；远程连接和已确认代次沿用普通登录。
    if (error instanceof AdminAPIError && [401, 403, 404, 409].includes(error.status)) return null;
    throw error;
  }
}

/** 保存当前代次的领取确认，成功后由页面清空明文。 */
export async function confirmBootstrap(): Promise<void> {
  await request<void>('/api/auth/bootstrap/confirm', { method: 'POST' });
}
