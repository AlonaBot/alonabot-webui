// 日志级别、日志读取与诊断包。
import { request } from './client';

export type GlobalLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export type SourceLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical' | 'off' | 'inherit';

export type LogLevels = {
  global: string;
  sources: Record<string, SourceLogLevel>;
};

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
// 日志与诊断包 API (ADMIN-API §8, §19, CONTRACTS §14)
// ----------------------------------------------------------------------------

export type LogRecord = {
  time: string;
  level: string;
  source: string;
  message: string;
  attrs: Record<string, unknown>;
  trace_id: string;
};

export type DiagnosticsOptions = {
  since: string;
  logs: boolean;
  settings: boolean;
  components: boolean;
  redact: boolean;
};

/** 获取今日最近已缓冲的日志记录（时间升序）。 */
export async function getRecentLogs(): Promise<LogRecord[]> {
  return request<LogRecord[]>('/api/v1/logs/recent');
}

/** 获取指定日期的历史日志记录（按日志文件续写顺序）。 */
export async function getLogHistory(date: string): Promise<LogRecord[]> {
  return request<LogRecord[]>(`/api/v1/logs/history?date=${encodeURIComponent(date)}`);
}

/** 解析 Content-Disposition 中的 attachment 文件名。 */
function parseContentDispositionFilename(header: string | null): string {
  if (!header) return 'alonabot-diagnostics.zip';
  const starMatch = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (starMatch && starMatch[1]) {
    try {
      return decodeURIComponent(starMatch[1].trim());
    } catch {
      return starMatch[1].trim();
    }
  }
  const match = /filename=(?:"([^"]+)"|([^;\s]+))/i.exec(header);
  if (match) {
    return (match[1] || match[2] || '').trim();
  }
  return 'alonabot-diagnostics.zip';
}

/** 解析并派发单条 SSE 事件块。 */
function parseAndDispatchSSEEvent(
  rawEvent: string,
  handlers: {
    onLog: (record: LogRecord) => void;
    onOverflow: (lastTime: string) => void;
    onError: (error: Error) => void;
  },
): boolean {
  const lines = rawEvent.split(/\r?\n/);
  let eventType = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(':')) {
      continue;
    }
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    } else if (line === 'data') {
      dataLines.push('');
    }
  }

  if (dataLines.length === 0) return false;
  const dataStr = dataLines.join('\n');

  if (eventType === 'log') {
    const record = JSON.parse(dataStr) as LogRecord | null;
    if (!record || !['time', 'level', 'source', 'message', 'trace_id'].every(
      key => typeof record[key as keyof LogRecord] === 'string',
    ) || !record.attrs || typeof record.attrs !== 'object' || Array.isArray(record.attrs)) {
      throw new Error(`Invalid log event: ${dataStr}`);
    }
    handlers.onLog(record);
  } else if (eventType === 'overflow') {
    const lastTime: unknown = JSON.parse(dataStr);
    if (typeof lastTime !== 'string') {
      throw new Error(`Invalid overflow event: ${dataStr}`);
    }
    handlers.onOverflow(lastTime);
    return true;
  }
  return false;
}

/** 订阅实时日志流（text/event-stream），返回取消订阅函数。 */
export function subscribeLogs(handlers: {
  onLog: (record: LogRecord) => void;
  onOverflow: (lastTime: string) => void;
  onError: (error: Error) => void;
}): () => void {
  const abortController = new AbortController();
  let cancelled = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  const startStream = async () => {
    try {
      const response = await request<Response>('/api/v1/logs/stream', {
        headers: { Accept: 'text/event-stream' },
        signal: abortController.signal,
      }, async response => response);
      if (cancelled) return;

      if (!response.body) {
        if (!cancelled) {
          handlers.onError(new Error('ReadableStream not supported'));
        }
        return;
      }

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!cancelled) {
        const { value, done } = await reader.read();
        if (cancelled) return;
        if (done) throw new Error('Log stream ended');
        buffer += decoder.decode(value, { stream: true });

        let boundaryMatch = buffer.match(/\r?\n\r?\n/);
        while (boundaryMatch && boundaryMatch.index !== undefined) {
          const boundaryIndex = boundaryMatch.index;
          const delimiterLength = boundaryMatch[0].length;
          const rawEvent = buffer.slice(0, boundaryIndex);
          buffer = buffer.slice(boundaryIndex + delimiterLength);
          if (cancelled) return;
          if (parseAndDispatchSSEEvent(rawEvent, handlers)) {
            await reader.cancel();
            return;
          }
          boundaryMatch = buffer.match(/\r?\n\r?\n/);
        }
      }
    } catch (err: unknown) {
      if (cancelled) return;
      handlers.onError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      abortController.abort();
      reader?.releaseLock();
    }
  };

  void startStream();

  return () => {
    cancelled = true;
    abortController.abort();
  };
}

/** 导出诊断包，返回 zip 文件 Blob 与 Content-Disposition 附件名。 */
export async function downloadDiagnostics(
  input: DiagnosticsOptions,
): Promise<{ blob: Blob; filename: string }> {
  return request('/api/v1/diagnostics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }, async response => {
    const filename = parseContentDispositionFilename(response.headers.get('content-disposition'));
    return { blob: await response.blob(), filename };
  });
}

export async function setGlobalLogLevel(level: GlobalLogLevel): Promise<LogLevels> {
  return request<LogLevels>('/api/v1/logs/levels', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ global: level }),
  });
}
