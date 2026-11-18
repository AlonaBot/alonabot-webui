import { useEffect, useMemo, useRef, useState, useContext, type JSX } from 'react';
import {
  Radio,
  Trash2,
  Search,
  X,
  MoreHorizontal,
  RefreshCw,
  AlertCircle,
  Copy,
  Check,
  Download,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useUI } from '../i18n/UI';
import { SearchContext, type SearchItem } from '../shell/search';
import {
  getRecentLogs,
  getLogHistory,
  subscribeLogs,
  listPackages,
  listInstances,
  type LogRecord,
  type Package,
  type AdapterInstance,
} from '../api/admin';
import {
  type LogFilterState,
  type LogLevelKey,
  createDefaultFilterState,
  countLogLevels,
  filterLogs,
  formatLogTimeDesktop,
  formatLogTimeMobile,
  formatLogLevel,
  formatLogMessage,
  parseSourceLocation,
  getRecordSourceTag,
  getLogSourceSelection,
  parseLogFilter,
  LogStreamMerger,
} from './logsFormat';
import { LogFilterPopover } from './LogFilterPopover';
import { DiagnosticsDialog } from './DiagnosticsDialog';

const storageFilterKey = 'alonabot.webui.logs.filters';

export function LogsPage(): JSX.Element {
  const ui = useUI();
  const { register } = useContext(SearchContext);

  // 1. 过滤状态（优先从 localStorage 恢复）
  const [initial] = useState(() => {
    try {
      return { filter: parseLogFilter(localStorage.getItem(storageFilterKey)), error: null };
    } catch (error) {
      return { filter: createDefaultFilterState(), error: error instanceof Error ? error.message : String(error) };
    }
  });
  const [filter, setFilter] = useState<LogFilterState>(initial.filter);
  const [storageError, setStorageError] = useState<string | null>(initial.error);

  // 持久化过滤条件到 localStorage
  useEffect(() => {
    if (initial.error && filter === initial.filter) return;
    try {
      localStorage.setItem(storageFilterKey, JSON.stringify(filter));
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : String(error));
    }
  }, [filter, initial]);

  // 2. 数据与连接状态
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [instances, setInstances] = useState<AdapterInstance[]>([]);
  const [isLive, setIsLive] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [overflowTime, setOverflowTime] = useState<string | null>(null);
  const [lastDelivered, setLastDelivered] = useState<string | null>(null);
  const [gap, setGap] = useState(false);
  const [streamState, setStreamState] = useState<'waiting' | 'live' | 'paused' | 'disconnected'>('waiting');
  const [loading, setLoading] = useState(true);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [copiedLocation, setCopiedLocation] = useState<string | null>(null);

  // 3. 已载入记录及当前请求的归属
  const logsRef = useRef<LogRecord[]>([]);
  const loadedDateRef = useRef<string | null>(null);
  const loadedReloadRef = useRef(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);

  // 4. 统计与过滤结果
  const counts = useMemo(() => countLogLevels(logs), [logs]);
  const filteredLogs = useMemo(() => filterLogs(logs, filter, packages, instances), [logs, filter, packages, instances]);

  // 收集日志中存在但不在 packages/instances 中的其他历史标签
  const otherSources = useMemo(() => {
    const tags = new Set<string>();
    for (const log of logs) {
      const selection = getLogSourceSelection(log, filter.date !== 'today', packages, instances);
      if (selection.group === 'other') tags.add(selection.key);
    }
    return Array.from(tags).sort();
  }, [logs, packages, instances, filter.date]);

  // 5. 加载组件与账号列表（用于筛选分组）
  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      listPackages(),
      listInstances(),
    ]).then(([pkgs, insts]) => {
      if (active) {
        const errors: string[] = [];
        if (pkgs.status === 'fulfilled') setPackages(pkgs.value);
        else errors.push(String(pkgs.reason));
        if (insts.status === 'fulfilled') setInstances(insts.value);
        else errors.push(String(insts.reason));
        setSourcesError(errors.length ? errors.join('\n') : null);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // 6. 日志加载与 SSE 订阅调度
  useEffect(() => {
    let active = true;
    let cancelStream: (() => void) | undefined;
    const dateChanged = loadedDateRef.current !== filter.date;
    setStreamState(filter.date === 'today' && isLive ? 'waiting' : 'paused');
    if (dateChanged) {
      logsRef.current = [];
      setLogs([]);
      setLastDelivered(null);
      setGap(false);
      setOverflowTime(null);
    }
    // 暂停只关闭订阅，保留已显示的记录；重连重新读取 recent 并合并。
    if (!dateChanged && !isLive && loadedReloadRef.current === reload) {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    setStreamError(null);
    const load = async () => {
      try {
        const records = filter.date === 'today' ? await getRecentLogs() : await getLogHistory(filter.date);
        if (!active) return;
        if (filter.date === 'today' && !dateChanged) {
          const existing = new LogStreamMerger(logsRef.current);
          logsRef.current = [...logsRef.current, ...records.filter(record => !existing.shouldDeduplicate(record))];
        } else {
          logsRef.current = records;
        }
        loadedDateRef.current = filter.date;
        loadedReloadRef.current = reload;
        setLogs(logsRef.current);
        setLoading(false);
        if (filter.date !== 'today' || !isLive) return;
        const merger = new LogStreamMerger(records);
        let deliveredTime: string | null = null;
        cancelStream = subscribeLogs({
          onLog: record => {
            if (!active) return;
            deliveredTime = record.time;
            setStreamState('live');
            if (!merger.shouldDeduplicate(record)) {
              logsRef.current = [...logsRef.current, record];
              setLogs(logsRef.current);
            }
          },
          onOverflow: time => {
            if (!active) return;
            setStreamState('disconnected');
            setLastDelivered(time);
            setOverflowTime(time);
            setGap(true);
          },
          onError: error => {
            if (!active) return;
            setStreamState('disconnected');
            setStreamError(error.message);
            setLastDelivered(deliveredTime);
            setGap(true);
          },
        });
      } catch (error) {
        if (active) {
          setLoading(false);
          setStreamError(error instanceof Error ? error.message : String(error));
        }
      }
    };
    void load();
    return () => {
      active = false;
      cancelStream?.();
    };
  }, [filter.date, isLive, reload]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport && streamState === 'live' && followRef.current) viewport.scrollTop = viewport.scrollHeight;
  }, [filteredLogs, streamState]);

  // 7. 注册全局搜索操作
  useEffect(() => {
    const searchItems: SearchItem[] = [
      {
        id: 'logs-reconnect',
        title: `${ui.logs}: ${ui.logsReconnect}`,
        section: ui.searchActions,
        keywords: ['logs', 'reconnect', 'refresh', 'stream'],
        run: () => {
          if (filter.date === 'today') setIsLive(true);
          setReload(value => value + 1);
        },
      },
      {
        id: 'logs-clear',
        title: `${ui.logs}: ${ui.logsClear}`,
        section: ui.searchActions,
        keywords: ['logs', 'clear'],
        run: () => {
          handleClearLogs();
        },
      },
      {
        id: 'logs-export',
        title: `${ui.logs}: ${ui.logsExport}`,
        section: ui.searchActions,
        keywords: ['logs', 'export', 'diagnostics'],
        run: () => {
          setDiagnosticsOpen(true);
        },
      },
      {
        id: 'logs-toggle-live',
        title: `${ui.logs}: ${isLive ? ui.logsLivePaused : ui.logsLiveActive}`,
        section: ui.searchActions,
        keywords: ['logs', 'live', 'stream'],
        run: () => {
          if (filter.date === 'today') setIsLive(value => !value);
        },
      },
    ];
    return register(searchItems.filter(item => filter.date === 'today' || item.id !== 'logs-toggle-live'));
  }, [register, ui, isLive, filter.date]);

  // 8. 清空记录操作
  const handleClearLogs = () => {
    logsRef.current = [];
    setLogs([]);
  };

  // 9. 点击 CRITICAL / ERROR / WARNING 计数筛选
  const handleLevelPillClick = (lvl: LogLevelKey) => {
    const isSingleActive =
      filter.levels[lvl] &&
      (['critical', 'error', 'warning', 'info', 'debug'] as LogLevelKey[])
        .filter(k => k !== lvl)
        .every(k => !filter.levels[k]);

    if (isSingleActive) {
      // 再次点击恢复默认级别
      setFilter({
        ...filter,
        levels: createDefaultFilterState(filter.date).levels,
      });
    } else {
      // 单选该级别
      const nextLevels: Record<LogLevelKey, boolean> = {
        critical: false,
        error: false,
        warning: false,
        info: false,
        debug: false,
        [lvl]: true,
      };
      setFilter({
        ...filter,
        levels: nextLevels,
      });
    }
  };

  // 10. 源码位置复制
  const handleCopyLocation = async (fullPath: string) => {
    setCopyError(null);
    try {
      if (!navigator.clipboard) throw new Error(ui.logsClipboardUnavailable);
      await navigator.clipboard.writeText(fullPath);
      setCopiedLocation(fullPath);
    } catch (error) {
      setCopyError(error instanceof Error ? error.message : String(error));
    }
  };

  const liveLabel = loading ? ui.loading : streamState === 'live' ? ui.logsLiveActive
    : streamState === 'waiting' ? ui.logsWaiting
    : streamState === 'disconnected' ? ui.logsDisconnected : ui.logsLivePaused;

  return (
    <div className="logs-page">
      {/* 桌面端与移动端工具栏 */}
      <div className="logs-toolbar">
        <div className="logs-toolbar-left">
          {/* 筛选弹层 */}
          <LogFilterPopover
            filter={filter}
            onFilterChange={setFilter}
            counts={counts}
            packages={packages}
            instances={instances}
            otherSources={otherSources}
          />

          {/* 级别计数 Pill */}
          <div className="logs-level-pills">
            <button
              type="button"
              className={`logs-level-pill pill-critical ${filter.levels.critical && !filter.levels.error && !filter.levels.warning && !filter.levels.info && !filter.levels.debug ? 'is-selected' : ''}`}
              onClick={() => handleLevelPillClick('critical')}
              aria-label={`CRITICAL: ${counts.critical}`}
            >
              <span>CRITICAL</span>
              <span className="logs-pill-badge">{counts.critical}</span>
            </button>

            <button
              type="button"
              className={`logs-level-pill pill-error ${filter.levels.error && !filter.levels.critical && !filter.levels.warning && !filter.levels.info && !filter.levels.debug ? 'is-selected' : ''}`}
              onClick={() => handleLevelPillClick('error')}
              aria-label={`ERROR: ${counts.error}`}
            >
              <span>ERROR</span>
              <span className="logs-pill-badge">{counts.error}</span>
            </button>

            <button
              type="button"
              className={`logs-level-pill pill-warning ${filter.levels.warning && !filter.levels.critical && !filter.levels.error && !filter.levels.info && !filter.levels.debug ? 'is-selected' : ''}`}
              onClick={() => handleLevelPillClick('warning')}
              aria-label={`WARNING: ${counts.warning}`}
            >
              <span>WARNING</span>
              <span className="logs-pill-badge">{counts.warning}</span>
            </button>
          </div>
        </div>

        <div className="logs-toolbar-center">
          {/* 搜索内容或 trace */}
          <div className="logs-search-wrapper">
            <Search size={15} className="logs-search-icon" />
            <input
              type="text"
              className="logs-search-input"
              placeholder={ui.logsSearchPlaceholder}
              aria-label={ui.logsSearchPlaceholder}
              value={filter.query}
              onChange={e => setFilter({ ...filter, query: e.target.value })}
            />
            {filter.query && (
              <button
                type="button"
                className="logs-search-clear"
                onClick={() => setFilter({ ...filter, query: '' })}
                aria-label={ui.clear}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="logs-toolbar-right logs-desktop-only">
          {/* 实时开关 */}
          {filter.date === 'today' && (
            <button
              type="button"
              className={`logs-icon-button ${streamState === 'live' ? 'is-live-active' : ''}`}
              onClick={() => setIsLive(!isLive)}
              title={liveLabel}
              aria-label={liveLabel}
              aria-pressed={isLive}
            >
              <Radio size={18} />
            </button>
          )}

          {/* 清空按钮 */}
          <button
            type="button"
            className="logs-icon-button"
            onClick={handleClearLogs}
            title={ui.logsClearTip}
            aria-label={ui.logsClear}
          >
            <Trash2 size={18} />
          </button>

          {/* 导出诊断包按钮 */}
          <button
            type="button"
            className="logs-export-button"
            onClick={() => setDiagnosticsOpen(true)}
            aria-label={ui.logsExport}
            title={ui.logsExport}
          >
            <Download size={18} className="logs-export-icon" />
            <span className="logs-export-label">{ui.logsExport}</span>
          </button>
        </div>

        {/* 移动端操作按钮收纳到 ⋯ */}
        <div className="logs-toolbar-mobile logs-mobile-only">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="logs-icon-button"
                aria-label={ui.logsMoreOptions}
              >
                <MoreHorizontal size={18} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="dropdown-menu-content" sideOffset={6} align="end">
                {filter.date === 'today' && (
                  <DropdownMenu.Item
                    className="dropdown-menu-item"
                    onSelect={() => setIsLive(!isLive)}
                  >
                    <Radio size={16} />
                    <span>{isLive ? ui.logsLivePaused : ui.logsLiveActive}</span>
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Item
                  className="dropdown-menu-item"
                  onSelect={handleClearLogs}
                >
                  <Trash2 size={16} />
                  <span>{ui.logsClear}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="dropdown-menu-item"
                  onSelect={() => setDiagnosticsOpen(true)}
                >
                  <span>{ui.logsExport}</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      {[storageError && `${ui.logsStorageError}: ${storageError}`,
        sourcesError && `${ui.logsSourcesError}: ${sourcesError}`,
        copyError && `${ui.logsCopyError}: ${copyError}`].filter(Boolean).map(message => (
          <div key={message as string} className="diagnostics-error-banner" role="alert">{message}</div>
        ))}

      {/* 终端视图区域 */}
      <Tooltip.Provider delayDuration={150}>
        <div className="logs-terminal-viewport" ref={viewportRef} tabIndex={0}
          onScroll={event => {
            const viewport = event.currentTarget;
            followRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 1;
          }}>
          {/* 异常断流或 overflow 状态横幅 */}
          {(streamError || gap) && (
            <div className="logs-status-banner" role="alert">
              <AlertCircle size={16} className="logs-status-icon" />
              <span className="logs-status-text">
                {streamError ? `${gap ? ui.logsDisconnected : ui.logsLoadFailed}: ${streamError}`
                  : overflowTime ? ui.logsOverflow.replace('{time}', overflowTime) : ui.logsInterruption}
                {gap && <>
                  {(!overflowTime || streamError) && <> · {lastDelivered ? ui.logsLastDelivered.replace('{time}', lastDelivered) : ui.logsNoDelivery}</>}
                  {' · '}{ui.logsGap}
                </>}
              </span>
              <button
                type="button"
                className="logs-reconnect-button"
                onClick={() => {
                  if (filter.date === 'today') setIsLive(true);
                  setReload(value => value + 1);
                }}
              >
                <RefreshCw size={14} />
                <span>{ui.logsReconnect}</span>
              </button>
            </div>
          )}

          {/* 记录列表 */}
          {filteredLogs.length === 0 ? (
            <div className="logs-empty-view">
              <span>{loading ? ui.loading : logs.length === 0 ? ui.logsEmpty : ui.logsNoMatching}</span>
            </div>
          ) : (
            <div className="logs-record-list" role="log">
              {filteredLogs.map((record, index) => {
                const { display: levelDisplay, colorClass } = formatLogLevel(record.level);
                const sourceTag = getRecordSourceTag(record);
                const location = parseSourceLocation(record.attrs);
                const desktopTime = formatLogTimeDesktop(record.time);
                const mobileTime = formatLogTimeMobile(record.time);
                const message = formatLogMessage(record, filter.date !== 'today');

                return (
                  <div key={`${record.time}-${index}`} className={`log-row ${colorClass}`}>
                    {/* 桌面端单行对齐布局 */}
                    <div className="log-row-desktop logs-desktop-only">
                      <span className="log-col log-col-time" title={record.time}>[{desktopTime}]</span>
                      <span className="log-col log-col-source" title={sourceTag}>
                        [{sourceTag}]
                      </span>
                      <span className="log-col log-col-level">[{levelDisplay}]</span>

                      {/* 源码位置：悬停展示函数与完整路径，点击复制 */}
                      {location ? (
                        <Tooltip.Root>
                          <Tooltip.Trigger asChild>
                            <button
                              type="button"
                              className="log-col log-col-location"
                              onClick={() => void handleCopyLocation(location.fullPath)}
                              title={location.fullPath}
                            >
                              [{location.display}]
                            </button>
                          </Tooltip.Trigger>
                          <Tooltip.Portal>
                            <Tooltip.Content
                              className="logs-tooltip-content"
                              side="top"
                              sideOffset={4}
                            >
                              {location.func && (
                                <div className="logs-tooltip-func">{location.func}</div>
                              )}
                              <div className="logs-tooltip-path">{location.fullPath}</div>
                              <div className="logs-tooltip-tip">
                                {copiedLocation === location.fullPath ? (
                                  <>
                                    <Check size={12} /> {ui.logsSourceLocationCopied}
                                  </>
                                ) : (
                                  <>
                                    <Copy size={12} /> {ui.logsCopyLocation}
                                  </>
                                )}
                              </div>
                            </Tooltip.Content>
                          </Tooltip.Portal>
                        </Tooltip.Root>
                      ) : (
                        <span className="log-col log-col-location" />
                      )}

                      {/* 消息正文：换行并对齐到消息列 */}
                      <span className="log-col log-col-msg">{message}</span>
                    </div>

                    {/* 移动端两行布局 */}
                    <div className="log-row-mobile logs-mobile-only">
                      <div className="log-mobile-header">
                        <span className="log-mobile-time" title={record.time}>{mobileTime}</span>
                        <span className="log-mobile-level">{levelDisplay}</span>
                        <span className="log-mobile-source">{sourceTag}</span>
                        {location && (
                          <button
                            type="button"
                            className="log-mobile-location"
                            onClick={() => void handleCopyLocation(location.fullPath)}
                            title={location.fullPath}
                          >
                            {location.display}
                          </button>
                        )}
                      </div>
                      <div className="log-mobile-message">{message}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Tooltip.Provider>

      {/* 导出诊断包对话框 */}
      <DiagnosticsDialog
        open={diagnosticsOpen}
        onOpenChange={setDiagnosticsOpen}
      />
    </div>
  );
}
