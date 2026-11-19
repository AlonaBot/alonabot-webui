import { AdminAPIError, getPluginConfig, requestPluginPage } from '../api/admin';
import { pickLocale } from '../i18n/catalog';

const channel = 'alonabot.plugin';
const tokenNames = {
  bg: '--color-bg', surface: '--color-surface', 'surface-2': '--color-surface-2',
  line: '--color-line', text: '--color-ink', 'text-muted': '--color-ink-muted',
  accent: '--color-accent', 'accent-soft': '--color-accent-soft', success: '--color-success',
  warning: '--color-warning', danger: '--color-danger', critical: '--color-critical',
  'radius-sm': '--radius-sm', radius: '--radius', 'radius-lg': '--radius-lg',
  'font-sans': '--font-sans', 'font-mono': '--font-mono',
};
const forbiddenHeaders = new Set([
  'cookie', 'cookie2', 'authorization', 'proxy-authorization', 'set-cookie', 'set-cookie2',
  'x-alonabot-csrf', 'x-alonabot-proxy-auth', 'origin', 'host', 'forwarded',
]);

function forbiddenHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return forbiddenHeaders.has(lower) || lower.startsWith('x-forwarded-') || lower.startsWith('x-alonabot-');
}

/** sanitizePluginPath 在 URL 规范化前检查插件相对路径，查询参数保持原样。 */
export function sanitizePluginPath(rawPath: string): { ok: true; path: string } | { ok: false; reason: string } {
  const path = rawPath.split(/[?#]/, 1)[0];
  if (!path || /[\s\\]/.test(path) || path.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(path)) {
    return { ok: false, reason: 'invalid plugin relative path' };
  }
  const relative = path.replace(/^\//, '');
  if (/^(api|plugins|auth|admin|media|healthz|internal)(\/|$)/i.test(relative)) {
    return { ok: false, reason: 'system path is not allowed' };
  }
  let decoded: string;
  try { decoded = decodeURIComponent(path); }
  catch { return { ok: false, reason: 'invalid path encoding' }; }
  if (/^(api|plugins|auth|admin|media|healthz|internal)(\/|$)/i.test(decoded.replace(/^\//, '')) || /%(?:2f|5c|25)/i.test(path) || /[\\\s]/.test(decoded) || decoded.split('/').some(part => part === '.' || part === '..') || relative.includes('//')) {
    return { ok: false, reason: 'path traversal or encoded separator is not allowed' };
  }
  return { ok: true, path: rawPath.replace(/^\//, '') };
}

/** filterHeaders 隐藏传回插件的凭证和内部身份头。 */
export function filterHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !forbiddenHeader(name)));
}

/** translateKey 使用既有语言回退，并保留缺少参数的占位符。 */
export function translateKey(messages: Record<string, Record<string, unknown>>, locale: string, key: string, args: Record<string, string> = {}): string {
  const selected = pickLocale(Object.keys(messages), [locale]);
  const value = messages[selected]?.[key] ?? messages['en-US']?.[key];
  if (typeof value !== 'string') return key;
  return value.replace(/\{([^{}]+)\}/g, (placeholder, name: string) => Object.hasOwn(args, name) ? args[name] : placeholder);
}

function stringRecord(value: unknown): value is Record<string, string> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(entry => typeof entry === 'string');
}

function themeState() {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const computed = getComputedStyle(document.documentElement);
  const tokens = Object.fromEntries(Object.entries(tokenNames).map(([name, source]) => [`--ab-${name}`, computed.getPropertyValue(source).trim()]));
  return { theme, tokens };
}

/** bindPluginPage 将消息和响应限定到当前 iframe 窗口，释放后丢弃在途结果。 */
export function bindPluginPage(frame: HTMLIFrameElement, input: { id: string; locale: string; openSearch: () => void }): { setLocale: (locale: string) => void; dispose: () => void } {
  const target = frame.contentWindow;
  let locale = input.locale;
  let ready = false;
  let disposed = false;
  let catalog: ReturnType<typeof getPluginConfig> | undefined;
  const post = (message: unknown) => {
    if (!disposed && frame.contentWindow === target) target?.postMessage(message, '*');
  };
  const handleMessage = async (event: MessageEvent<unknown>) => {
    if (disposed || !target || event.source !== target || event.origin !== 'null') return;
    const data = event.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    const message = data as Record<string, unknown>;
    if (message.channel !== channel || typeof message.id !== 'string' || typeof message.op !== 'string') return;
    const { id, op } = message;
    try {
      let result: unknown;
      switch (op) {
        case 'hello': ready = true; result = { locale, ...themeState() }; break;
        case 'locale': result = { locale }; break;
        case 'theme': result = { theme: themeState().theme }; break;
        case 'shortcut':
          if (message.key !== 'mod+k') throw new AdminAPIError(400, 'unsupported shortcut', 'INVALID_ARGUMENT');
          input.openSearch(); result = {}; break;
        case 'translate': {
          if (typeof message.key !== 'string' || (message.args !== undefined && !stringRecord(message.args))) throw new AdminAPIError(400, 'invalid translation message', 'INVALID_ARGUMENT');
          catalog ??= getPluginConfig(input.id);
          const snapshot = await catalog;
          result = { text: translateKey(snapshot.messages, locale, message.key, message.args as Record<string, string> | undefined) }; break;
        }
        case 'request': {
          if (typeof message.path !== 'string' || typeof message.method !== 'string' || !/^[A-Za-z]+$/.test(message.method) ||
              (message.headers !== undefined && !stringRecord(message.headers)) || (message.body_base64 !== undefined && typeof message.body_base64 !== 'string')) {
            throw new AdminAPIError(400, 'invalid request message', 'INVALID_ARGUMENT');
          }
          const sanitized = sanitizePluginPath(message.path);
          if (!sanitized.ok) throw new AdminAPIError(400, sanitized.reason, 'INVALID_ARGUMENT');
          const headers = message.headers as Record<string, string> | undefined;
          if (headers && Object.keys(headers).some(forbiddenHeader)) throw new AdminAPIError(400, 'credential or internal header is not allowed', 'INVALID_ARGUMENT');
          const response = await requestPluginPage(input.id, { method: message.method.toUpperCase(), path: sanitized.path, headers, body_base64: message.body_base64 as string | undefined });
          result = { ...response, headers: filterHeaders(response.headers) }; break;
        }
        default: throw new AdminAPIError(400, 'unsupported operation', 'INVALID_ARGUMENT');
      }
      post({ channel, id, ok: true, result });
    } catch (error) {
      post({ channel, id, ok: false, error: { code: error instanceof AdminAPIError ? error.code ?? 'REQUEST_FAILED' : 'REQUEST_FAILED', safe_message: error instanceof Error ? error.message : String(error) } });
    }
  };
  window.addEventListener('message', handleMessage);
  const observer = new MutationObserver(() => {
    if (ready) post({ channel, event: 'theme', data: themeState() });
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] });
  return {
    setLocale(next) { locale = next; if (ready) post({ channel, event: 'locale', data: { locale } }); },
    dispose() { disposed = true; window.removeEventListener('message', handleMessage); observer.disconnect(); },
  };
}
