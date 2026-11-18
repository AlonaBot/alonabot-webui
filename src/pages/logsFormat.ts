/**
 * 日志格式化、去重、筛选与搜索纯逻辑模块。
 * 遵循 ADMIN-API §8, CONTRACTS §14 与 DECISIONS D-158。
 */

import type { AdapterInstance, LogRecord, Package } from '../api/admin';

export type LogLevelKey = 'critical' | 'error' | 'warning' | 'info' | 'debug';

export interface SourceLocation {
  display: string;
  fullPath: string;
  func: string;
}

export interface LogFilterState {
  levels: Record<LogLevelKey, boolean>;
  sources: {
    core: boolean;
    plugins: Record<string, boolean>; // pluginId -> boolean
    accounts: Record<string, boolean>; // instanceId -> boolean
    other: Record<string, boolean>; // 历史记录中无法还原的标签
  };
  query: string;
  date: string; // 'today' 或 'YYYY-MM-DD'
}

/** 格式化桌面终端时间，保留 YYYY-MM-DD HH:mm:ss.SSS 毫秒精度。 */
export function formatLogTimeDesktop(timeStr: string): string {
  if (!timeStr) return '';
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?)/.exec(timeStr);
  if (match) {
    const datePart = match[1];
    let timePart = match[2];
    if (timePart.includes('.')) {
      const [sec, ms] = timePart.split('.');
      timePart = `${sec}.${ms.padEnd(3, '0').slice(0, 3)}`;
    } else {
      timePart = `${timePart}.000`;
    }
    return `${datePart} ${timePart}`;
  }
  return timeStr;
}

/** 格式化移动端时间，保留 HH:mm:ss.SSS。 */
export function formatLogTimeMobile(timeStr: string): string {
  if (!timeStr) return '';
  const match = /T(\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?)/.exec(timeStr);
  if (match) {
    let timePart = match[1];
    if (timePart.includes('.')) {
      const [sec, ms] = timePart.split('.');
      timePart = `${sec}.${ms.padEnd(3, '0').slice(0, 3)}`;
    } else {
      timePart = `${timePart}.000`;
    }
    return timePart;
  }
  return timeStr;
}

/** 解析级别展示文本与颜色类名。WARN 显示为 WARNING，CRITICAL 为独立级别。 */
export function formatLogLevel(level: string): { display: string; key: LogLevelKey; colorClass: string } {
  const upper = (level || '').toUpperCase();
  if (upper === 'CRITICAL') {
    return { display: 'CRITICAL', key: 'critical', colorClass: 'level-critical' };
  }
  if (upper === 'ERROR' || upper === 'ERRO') {
    return { display: 'ERROR', key: 'error', colorClass: 'level-error' };
  }
  if (upper === 'WARN' || upper === 'WARNING') {
    return { display: 'WARNING', key: 'warning', colorClass: 'level-warning' };
  }
  if (upper === 'DEBUG' || upper === 'DBUG') {
    return { display: 'DEBUG', key: 'debug', colorClass: 'level-debug' };
  }
  return { display: 'INFO', key: 'info', colorClass: 'level-info' };
}

/**
 * 解析源码位置。
 * 取 Record.attrs.source 中的 {file, line, function}。
 * 显示取 file 的最后两段目录与文件名加 line，悬停完整路径与函数名，点击复制。
 */
export function parseSourceLocation(attrs?: Record<string, unknown>): SourceLocation | null {
  if (!attrs || typeof attrs !== 'object') return null;
  const source = attrs.source;
  if (!source || typeof source !== 'object') return null;

  const srcObj = source as Record<string, unknown>;
  const file = typeof srcObj.file === 'string' ? srcObj.file : '';
  const line = srcObj.line !== undefined ? String(srcObj.line) : '';
  const func = typeof srcObj.function === 'string' ? srcObj.function : '';

  if (!file && !line) return null;

  // 截取文件最后两段，如 /project/plugin.go -> project/plugin.go
  const normalizedFile = file.replace(/\\/g, '/');
  const parts = normalizedFile.split('/').filter(Boolean);
  const shortFile = parts.length > 2 ? parts.slice(-2).join('/') : (parts.join('/') || file);

  const display = line ? `${shortFile}:${line}` : shortFile;
  const fullPath = line ? `${file}:${line}` : file;

  return {
    display,
    fullPath,
    func,
  };
}

/**
 * 获取日志记录的来源展示标签。
 * 实时组件按包 ID，账号追加实际实例 ID，历史保留原标签。
 */
export function getRecordSourceTag(record: LogRecord): string {
  const instance = record.attrs.instance_id;
  if (record.source !== 'core' && record.attrs.component === 'adapter' && typeof instance === 'string'
    && instance && !record.source.endsWith(`/${instance}`)) {
    return `${record.source}/${instance}`;
  }
  return record.source;
}

/** formatLogMessage 将实时结构化字段连同正文显示，历史正文保留文件原文。 */
export function formatLogMessage(record: LogRecord, historical: boolean): string {
  if (historical) return record.message;
  const identityFields = new Set([
    'component', 'plugin_id', 'adapter_id', 'instance_id', 'session_id', 'generation_id',
  ]);
  const fields = Object.entries(record.attrs)
    .filter(([key]) => key !== 'source' && key !== 'trace_id'
      && (record.source === 'core' || !identityFields.has(key)))
    .map(([key, value]) => `${key}=${typeof value === 'string' && !/[\s"\\]/.test(value) ? value : JSON.stringify(value)}`);
  if (record.trace_id) fields.push(`trace=${record.trace_id}`);
  return [record.message, ...fields].join(' ');
}

/** 生成用于去重的记录指纹。 */
function getRecordFingerprint(record: LogRecord): string {
  return `${record.time}|${record.level}|${record.source}|${record.trace_id}|${record.message}|${JSON.stringify(record.attrs || {})}`;
}

/**
 * 日志流合并与去重器。
 * 针对今日记录：先读 recent，再订阅 SSE（会先重发缓冲中的记录）。
 * 只对 recent 与初始快照重叠部分按完整时间与内容去重，后续实时新记录保留重复出现的次数。
 */
export class LogStreamMerger {
  private initialFingerprints: Map<string, number> = new Map();

  constructor(recentRecords: LogRecord[]) {
    for (const r of recentRecords) {
      const fp = getRecordFingerprint(r);
      this.initialFingerprints.set(fp, (this.initialFingerprints.get(fp) || 0) + 1);
    }
  }

  /**
   * 检查新到达的流式记录是否应被去重。
   * 如果属于初始重叠，返回 true（丢弃）；否则返回 false（保留并显示）。
   */
  shouldDeduplicate(record: LogRecord): boolean {
    const fp = getRecordFingerprint(record);
    const count = this.initialFingerprints.get(fp) || 0;
    if (count > 0) {
      if (count === 1) {
        this.initialFingerprints.delete(fp);
      } else {
        this.initialFingerprints.set(fp, count - 1);
      }
      return true;
    }
    return false;
  }
}

/** 统计已载入日志各级别条数。 */
export function countLogLevels(logs: LogRecord[]): Record<LogLevelKey, number> {
  const counts: Record<LogLevelKey, number> = {
    critical: 0,
    error: 0,
    warning: 0,
    info: 0,
    debug: 0,
  };

  for (const log of logs) {
    const { key } = formatLogLevel(log.level);
    counts[key]++;
  }

  return counts;
}

/**
 * 根据筛选条件和搜索词对日志记录进行过滤。
 * 纯前端过滤，支持级别、来源分组多选、正文与 trace 搜索。
 */
export function filterLogs(
  logs: LogRecord[], filter: LogFilterState, packages: Package[] = [], instances: AdapterInstance[] = [],
): LogRecord[] {
  const query = filter.query.trim().toLowerCase();

  return logs.filter((log) => {
    // 1. 级别过滤
    const { key: levelKey } = formatLogLevel(log.level);
    if (!filter.levels[levelKey]) {
      return false;
    }

    // 2. 来源过滤
    const selection = getLogSourceSelection(log, filter.date !== 'today', packages, instances);
    const sourceAllowed = selection.group === 'core' ? filter.sources.core
      : filter.sources[selection.group][selection.key] ?? true;

    if (!sourceAllowed) {
      return false;
    }

    // 3. 搜索内容或 trace_id 过滤
    if (query) {
      const messageMatch = formatLogMessage(log, filter.date !== 'today').toLowerCase().includes(query);
      const trace = (log.trace_id || '').toLowerCase();
      // 支持 trace 包含，或历史 8 位前缀匹配
      const traceMatch = trace.includes(query) || (filter.date !== 'today' && trace.length > 0 && query.startsWith(trace));

      if (!messageMatch && !traceMatch) {
        return false;
      }
    }

    return true;
  });
}

/** getLogSourceSelection 只将可以还原的历史身份关联到组件或账号，其他来源保留原标签。 */
export function getLogSourceSelection(
  record: LogRecord, historical: boolean, packages: Package[], instances: AdapterInstance[],
): { group: 'core' | 'plugins' | 'accounts' | 'other'; key: string } {
  if (record.source === 'core') return { group: 'core', key: 'core' };
  const instance = typeof record.attrs.instance_id === 'string' ? record.attrs.instance_id : '';
  const account = instances.find(item => historical
    ? record.source === `${item.adapter_id}/${item.instance_id}`
    : record.source === item.package_id && instance === item.instance_id);
  if (account) return { group: 'accounts', key: account.instance_id };
  if (instance && record.attrs.component === 'adapter') return { group: 'other', key: getRecordSourceTag(record) };
  const candidates = packages.filter(pkg => historical
    ? (record.attrs.component === 'adapter' ? pkg.Role === 'adapter' && pkg.AdapterID === record.source
      : pkg.ID.replace(/^alonabot-plugin-/, '') === record.source)
    : pkg.ID === record.source);
  if (candidates.length === 1) return { group: 'plugins', key: candidates[0].ID };
  return { group: 'other', key: record.source };
}

/** parseLogFilter 校验浏览器保存的筛选条件，损坏的内容保留为可见错误。 */
export function parseLogFilter(saved: string | null): LogFilterState {
  if (saved === null) return createDefaultFilterState();
  const value: unknown = JSON.parse(saved);
  const object = (input: unknown): input is Record<string, unknown> =>
    input !== null && typeof input === 'object' && !Array.isArray(input);
  const booleans = (input: unknown): boolean => object(input) && Object.values(input).every(v => typeof v === 'boolean');
  const levels = object(value) ? value.levels : null;
  if (!object(value) || !object(levels) || !object(value.sources)
    || !Object.keys(createDefaultFilterState().levels).every(key => typeof levels[key] === 'boolean')
    || typeof value.sources.core !== 'boolean'
    || !booleans(value.sources.plugins) || !booleans(value.sources.accounts) || !booleans(value.sources.other)
    || typeof value.query !== 'string' || typeof value.date !== 'string'
    || (value.date !== 'today' && !/^\d{4}-\d{2}-\d{2}$/.test(value.date))) {
    throw new Error('Invalid saved log filters');
  }
  return value as unknown as LogFilterState;
}

/** 默认筛选配置。DEBUG 默认未勾选，其余默认全选。 */
export function createDefaultFilterState(date = 'today'): LogFilterState {
  return {
    levels: {
      critical: true,
      error: true,
      warning: true,
      info: true,
      debug: false,
    },
    sources: {
      core: true,
      plugins: {},
      accounts: {},
      other: {},
    },
    query: '',
    date,
  };
}
