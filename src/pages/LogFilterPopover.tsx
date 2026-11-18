import { useState, type JSX } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Filter, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { useUI } from '../i18n/UI';
import {
  type LogFilterState,
  type LogLevelKey,
  createDefaultFilterState,
} from './logsFormat';
import type { Package, AdapterInstance } from '../api/admin';

interface LogFilterPopoverProps {
  filter: LogFilterState;
  onFilterChange: (next: LogFilterState) => void;
  counts: Record<LogLevelKey, number>;
  packages: Package[];
  instances: AdapterInstance[];
  otherSources: string[];
}

export function LogFilterPopover(props: LogFilterPopoverProps): JSX.Element {
  const {
    filter,
    onFilterChange,
    counts,
    packages,
    instances,
    otherSources,
  } = props;
  const ui = useUI();
  const [sourceSearch, setSourceSearch] = useState('');
  const [pluginsExpanded, setPluginsExpanded] = useState(true);
  const [accountsExpanded, setAccountsExpanded] = useState(true);
  const [otherExpanded, setOtherExpanded] = useState(true);

  // 判断当前是否有任何自定义筛选生效（不同于默认值）
  const defaultFilter = createDefaultFilterState(filter.date);
  const isLevelsChanged = (['critical', 'error', 'warning', 'info', 'debug'] as LogLevelKey[]).some(
    lvl => filter.levels[lvl] !== defaultFilter.levels[lvl],
  );
  const isCoreDisabled = filter.sources.core === false;
  const isAnyPluginDisabled = Object.values(filter.sources.plugins).some(v => v === false);
  const isAnyAccountDisabled = Object.values(filter.sources.accounts).some(v => v === false);
  const isAnyOtherDisabled = Object.values(filter.sources.other).some(v => v === false);
  const isDateChanged = filter.date !== 'today';

  const isFilterActive = isLevelsChanged || isCoreDisabled || isAnyPluginDisabled || isAnyAccountDisabled || isAnyOtherDisabled || isDateChanged;

  const handleReset = () => {
    onFilterChange(createDefaultFilterState());
  };

  const handleLevelToggle = (lvl: LogLevelKey) => {
    onFilterChange({
      ...filter,
      levels: {
        ...filter.levels,
        [lvl]: !filter.levels[lvl],
      },
    });
  };

  const handleCoreToggle = () => {
    onFilterChange({
      ...filter,
      sources: {
        ...filter.sources,
        core: !filter.sources.core,
      },
    });
  };

  const handlePluginToggle = (id: string) => {
    const current = filter.sources.plugins[id] ?? true;
    onFilterChange({
      ...filter,
      sources: {
        ...filter.sources,
        plugins: {
          ...filter.sources.plugins,
          [id]: !current,
        },
      },
    });
  };

  const handleAllPluginsToggle = () => {
    const allChecked = packages.every(pkg => (filter.sources.plugins[pkg.ID] ?? true));
    const nextPlugins: Record<string, boolean> = {};
    for (const pkg of packages) {
      nextPlugins[pkg.ID] = !allChecked;
    }
    onFilterChange({
      ...filter,
      sources: {
        ...filter.sources,
        plugins: nextPlugins,
      },
    });
  };

  const handleAccountToggle = (id: string) => {
    const current = filter.sources.accounts[id] ?? true;
    onFilterChange({
      ...filter,
      sources: {
        ...filter.sources,
        accounts: {
          ...filter.sources.accounts,
          [id]: !current,
        },
      },
    });
  };

  const handleAllAccountsToggle = () => {
    const allChecked = instances.every(inst => (filter.sources.accounts[inst.instance_id] ?? true));
    const nextAccounts: Record<string, boolean> = {};
    for (const inst of instances) {
      nextAccounts[inst.instance_id] = !allChecked;
    }
    onFilterChange({
      ...filter,
      sources: {
        ...filter.sources,
        accounts: nextAccounts,
      },
    });
  };

  const handleOtherToggle = (tag: string) => {
    const current = filter.sources.other[tag] ?? true;
    onFilterChange({
      ...filter,
      sources: {
        ...filter.sources,
        other: {
          ...filter.sources.other,
          [tag]: !current,
        },
      },
    });
  };

  const handleDateSelect = (newDate: string) => {
    onFilterChange({
      ...filter,
      date: newDate,
    });
  };

  // 过滤插件与账号列表
  const normalizedSearch = sourceSearch.trim().toLowerCase();
  const filteredPackages = packages.filter(pkg =>
    !normalizedSearch || pkg.ID.toLowerCase().includes(normalizedSearch),
  );
  const filteredInstances = instances.filter(inst =>
    !normalizedSearch || inst.instance_id.toLowerCase().includes(normalizedSearch) || inst.adapter_id.toLowerCase().includes(normalizedSearch),
  );
  const filteredOther = otherSources.filter(src =>
    !normalizedSearch || src.toLowerCase().includes(normalizedSearch),
  );

  const selectedPluginsCount = packages.filter(pkg => (filter.sources.plugins[pkg.ID] ?? true)).length;
  const selectedAccountsCount = instances.filter(inst => (filter.sources.accounts[inst.instance_id] ?? true)).length;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={`logs-toolbar-button logs-filter-trigger ${isFilterActive ? 'is-active' : ''}`}
          aria-label={ui.logsFilter}
          title={ui.logsFilter}
        >
          <Filter size={16} />
          <span className="logs-filter-label">{ui.logsFilter}</span>
          {isFilterActive && <span className="logs-filter-dot" aria-hidden="true" />}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content sideOffset={8} align="start" className="logs-popover-content">
          {/* 弹层顶栏：标题与重置 */}
          <div className="logs-popover-header">
            <span className="logs-popover-title">{ui.logsFilter}</span>
            <button
              type="button"
              className="logs-popover-reset"
              onClick={handleReset}
            >
              {ui.logsReset}
            </button>
          </div>

          <div className="logs-popover-body">
            {/* 级别筛选 */}
            <div className="logs-popover-section">
              <span className="logs-section-title">{ui.logsLevel}</span>
              <div className="logs-level-list">
                {([
                  { key: 'critical', label: 'CRITICAL', color: 'critical' },
                  { key: 'error', label: 'ERROR', color: 'danger' },
                  { key: 'warning', label: 'WARNING', color: 'warning' },
                  { key: 'info', label: 'INFO', color: 'info' },
                  { key: 'debug', label: 'DEBUG', color: 'dim' },
                ] as const).map(({ key, label, color }) => {
                  const checked = filter.levels[key];
                  const count = counts[key];
                  return (
                    <label key={key} className="logs-checkbox-row">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleLevelToggle(key)}
                      />
                      <span className={`logs-color-indicator ${color}`} />
                      <span className="logs-level-name">{label}</span>
                      <span className="logs-row-count">
                        {count}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 来源筛选 */}
            <div className="logs-popover-section">
              <span className="logs-section-title">{ui.logsSource}</span>
              <div className="logs-source-search-box">
                <Search size={14} className="logs-source-search-icon" />
                <input
                  aria-label={ui.logsSearchPluginOrAccount}
                  type="text"
                  placeholder={ui.logsSearchPluginOrAccount}
                  value={sourceSearch}
                  onChange={e => setSourceSearch(e.target.value)}
                  className="logs-source-search-input"
                />
              </div>

              <div className="logs-source-tree">
                {/* Core */}
                {(!normalizedSearch || 'core'.includes(normalizedSearch)) && (
                  <label className="logs-checkbox-row logs-source-parent">
                    <input
                      type="checkbox"
                      checked={filter.sources.core}
                      onChange={handleCoreToggle}
                    />
                    <span className="logs-source-name">{ui.logsCoreSource}</span>
                  </label>
                )}

                {/* 插件组 */}
                {packages.length > 0 && (
                  <div className="logs-source-group">
                    <div className="logs-source-group-header">
                      <button
                        type="button"
                        className="logs-collapse-toggle"
                        onClick={() => setPluginsExpanded(!pluginsExpanded)}
                        aria-label={pluginsExpanded ? ui.logsCollapsePlugins : ui.logsExpandPlugins}
                        aria-expanded={pluginsExpanded}
                      >
                        {pluginsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <label className="logs-checkbox-row logs-group-label">
                        <input
                          type="checkbox"
                          checked={packages.length > 0 && selectedPluginsCount === packages.length}
                          onChange={handleAllPluginsToggle}
                        />
                        <span className="logs-source-name">{ui.logsPluginsGroup}</span>
                      </label>
                      <span className="logs-group-count">{selectedPluginsCount}/{packages.length}</span>
                    </div>

                    {pluginsExpanded && (
                      <div className="logs-source-children">
                        {filteredPackages.map(pkg => (
                          <label key={pkg.ID} className="logs-checkbox-row logs-source-child">
                            <input
                              type="checkbox"
                              checked={filter.sources.plugins[pkg.ID] ?? true}
                              onChange={() => handlePluginToggle(pkg.ID)}
                            />
                            <span className="logs-source-name">{pkg.ID}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 账号组 */}
                {instances.length > 0 && (
                  <div className="logs-source-group">
                    <div className="logs-source-group-header">
                      <button
                        type="button"
                        className="logs-collapse-toggle"
                        onClick={() => setAccountsExpanded(!accountsExpanded)}
                        aria-label={accountsExpanded ? ui.logsCollapseAccounts : ui.logsExpandAccounts}
                        aria-expanded={accountsExpanded}
                      >
                        {accountsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <label className="logs-checkbox-row logs-group-label">
                        <input
                          type="checkbox"
                          checked={instances.length > 0 && selectedAccountsCount === instances.length}
                          onChange={handleAllAccountsToggle}
                        />
                        <span className="logs-source-name">{ui.logsAccountsGroup}</span>
                      </label>
                      <span className="logs-group-count">{selectedAccountsCount}/{instances.length}</span>
                    </div>

                    {accountsExpanded && (
                      <div className="logs-source-children">
                        {filteredInstances.map(inst => (
                          <label key={inst.instance_id} className="logs-checkbox-row logs-source-child">
                            <input
                              type="checkbox"
                              checked={filter.sources.accounts[inst.instance_id] ?? true}
                              onChange={() => handleAccountToggle(inst.instance_id)}
                            />
                            <span className="logs-source-name">{inst.instance_id}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 其他历史来源 */}
                {filteredOther.length > 0 && (
                  <div className="logs-source-group">
                    <div className="logs-source-group-header">
                      <button
                        type="button"
                        className="logs-collapse-toggle"
                        onClick={() => setOtherExpanded(!otherExpanded)}
                        aria-label={otherExpanded ? ui.logsCollapseOther : ui.logsExpandOther}
                        aria-expanded={otherExpanded}
                      >
                        {otherExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <span className="logs-source-name">{ui.logsOtherSources}</span>
                    </div>
                    {otherExpanded && (
                      <div className="logs-source-children">
                        {filteredOther.map(tag => (
                          <label key={tag} className="logs-checkbox-row logs-source-child">
                            <input
                              type="checkbox"
                              checked={filter.sources.other[tag] ?? true}
                              onChange={() => handleOtherToggle(tag)}
                            />
                            <span className="logs-source-name">{tag}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 日期筛选 */}
            <div className="logs-popover-section">
              <span className="logs-section-title">{ui.logsDate}</span>
              <select
                className="logs-date-select"
                aria-label={ui.logsDate}
                value={filter.date === 'today' ? 'today' : 'history'}
                onChange={e => {
                  if (e.target.value === 'today') handleDateSelect('today');
                  else {
                    const date = new Date();
                    date.setDate(date.getDate() - 1);
                    handleDateSelect(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
                  }
                }}
              >
                <option value="today">{ui.logsDateToday}</option>
                <option value="history">{ui.logsDateHistory}</option>
              </select>
              {filter.date !== 'today' && (
                <label className="logs-history-date">
                  <span>{ui.logsDateCore}</span>
                  <input
                    type="date"
                    value={filter.date}
                    onChange={e => { if (e.target.value) handleDateSelect(e.target.value); }}
                  />
                </label>
              )}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
