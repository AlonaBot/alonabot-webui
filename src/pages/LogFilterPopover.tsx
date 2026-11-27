import { useState, type JSX } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, ChevronRight, Filter, RotateCcw, Search } from 'lucide-react';
import type { AdapterInstance } from '../api/instances';
import type { Package } from '../api/packages';
import { useUI } from '../i18n/UI';
import { cn } from '../lib/cn';
import { Checkbox } from '../ui/Checkbox';
import { Select } from '../ui/Select';
import { createDefaultFilterState, type LogFilterState, type LogLevelKey } from './logsFormat';

interface LogFilterPopoverProps {
  readonly filter: LogFilterState;
  readonly onFilterChange: (next: LogFilterState) => void;
  readonly counts: Record<LogLevelKey, number>;
  readonly packages: Package[];
  readonly instances: AdapterInstance[];
  readonly otherSources: string[];
}

const levelDotClass: Record<LogLevelKey, string> = {
  critical: 'bg-[var(--color-critical)]',
  error: 'bg-[var(--color-danger)]',
  warning: 'bg-[var(--color-warning)]',
  info: 'bg-[var(--color-accent)]',
  debug: 'bg-[var(--color-ink-muted)]',
};

export function LogFilterPopover(props: LogFilterPopoverProps): JSX.Element {
  const { filter, onFilterChange, counts, packages, instances, otherSources } = props;
  const ui = useUI();
  const [sourceSearch, setSourceSearch] = useState('');
  const [pluginsExpanded, setPluginsExpanded] = useState(true);
  const [accountsExpanded, setAccountsExpanded] = useState(true);
  const [otherExpanded, setOtherExpanded] = useState(true);

  const defaultFilter = createDefaultFilterState(filter.date);
  const isLevelsChanged = (['critical', 'error', 'warning', 'info', 'debug'] as LogLevelKey[]).some(
    lvl => filter.levels[lvl] !== defaultFilter.levels[lvl],
  );
  const isCoreDisabled = filter.sources.core === false;
  const isAnyPluginDisabled = Object.values(filter.sources.plugins).some(v => v === false);
  const isAnyAccountDisabled = Object.values(filter.sources.accounts).some(v => v === false);
  const isAnyOtherDisabled = Object.values(filter.sources.other).some(v => v === false);
  const isDateChanged = filter.date !== 'today';

  const isFilterActive =
    isLevelsChanged || isCoreDisabled || isAnyPluginDisabled || isAnyAccountDisabled || isAnyOtherDisabled || isDateChanged;

  const handleReset = (): void => onFilterChange(createDefaultFilterState());

  const handleLevelToggle = (lvl: LogLevelKey): void => {
    onFilterChange({
      ...filter,
      levels: { ...filter.levels, [lvl]: !filter.levels[lvl] },
    });
  };

  const handleCoreToggle = (): void => {
    onFilterChange({
      ...filter,
      sources: { ...filter.sources, core: !filter.sources.core },
    });
  };

  const handlePluginToggle = (id: string): void => {
    const current = filter.sources.plugins[id] ?? true;
    onFilterChange({
      ...filter,
      sources: { ...filter.sources, plugins: { ...filter.sources.plugins, [id]: !current } },
    });
  };

  const handleAllPluginsToggle = (): void => {
    const allChecked = packages.every(pkg => filter.sources.plugins[pkg.ID] ?? true);
    const nextPlugins: Record<string, boolean> = {};
    for (const pkg of packages) nextPlugins[pkg.ID] = !allChecked;
    onFilterChange({ ...filter, sources: { ...filter.sources, plugins: nextPlugins } });
  };

  const handleAccountToggle = (id: string): void => {
    const current = filter.sources.accounts[id] ?? true;
    onFilterChange({
      ...filter,
      sources: { ...filter.sources, accounts: { ...filter.sources.accounts, [id]: !current } },
    });
  };

  const handleAllAccountsToggle = (): void => {
    const allChecked = instances.every(inst => filter.sources.accounts[inst.instance_id] ?? true);
    const nextAccounts: Record<string, boolean> = {};
    for (const inst of instances) nextAccounts[inst.instance_id] = !allChecked;
    onFilterChange({ ...filter, sources: { ...filter.sources, accounts: nextAccounts } });
  };

  const handleOtherToggle = (tag: string): void => {
    const current = filter.sources.other[tag] ?? true;
    onFilterChange({
      ...filter,
      sources: { ...filter.sources, other: { ...filter.sources.other, [tag]: !current } },
    });
  };

  const handleDateSelect = (newDate: string): void => {
    onFilterChange({ ...filter, date: newDate });
  };

  const normalizedSearch = sourceSearch.trim().toLowerCase();
  const filteredPackages = packages.filter(pkg => !normalizedSearch || pkg.ID.toLowerCase().includes(normalizedSearch));
  const filteredInstances = instances.filter(
    inst =>
      !normalizedSearch ||
      inst.instance_id.toLowerCase().includes(normalizedSearch) ||
      inst.adapter_id.toLowerCase().includes(normalizedSearch),
  );
  const filteredOther = otherSources.filter(src => !normalizedSearch || src.toLowerCase().includes(normalizedSearch));

  const selectedPluginsCount = packages.filter(pkg => filter.sources.plugins[pkg.ID] ?? true).length;
  const selectedAccountsCount = instances.filter(inst => filter.sources.accounts[inst.instance_id] ?? true).length;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn('logs-toolbar-button logs-filter-trigger', isFilterActive && 'is-active')}
          aria-label={ui.logsFilter}
          title={ui.logsFilter}
        >
          <Filter size={15} aria-hidden="true" />
          <span>{ui.logsFilter}</span>
          {isFilterActive && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" aria-hidden="true" />}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          align="start"
          collisionPadding={12}
          className="alona-glass-elevated z-[var(--z-popover)] w-[320px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl text-sm text-[var(--color-ink)] shadow-[var(--shadow-popover)] outline-none"
        >
          <div className="flex items-center justify-between border-b border-[var(--color-line)]/70 px-4 py-3">
            <span className="text-xs font-semibold tracking-wider text-[var(--color-ink)] uppercase">
              {ui.logsFilter}
            </span>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-soft)]"
            >
              <RotateCcw size={12} aria-hidden="true" />
              <span>{ui.logsReset}</span>
            </button>
          </div>

          <div className="max-h-[min(520px,70vh)] space-y-4 overflow-y-auto p-4">
            {/* 级别筛选 */}
            <div className="space-y-1.5">
              <span className="block text-[11px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">
                {ui.logsLevel}
              </span>
              <div className="space-y-0.5">
                {(
                  [
                    { key: 'critical', label: 'CRITICAL' },
                    { key: 'error', label: 'ERROR' },
                    { key: 'warning', label: 'WARNING' },
                    { key: 'info', label: 'INFO' },
                    { key: 'debug', label: 'DEBUG' },
                  ] as const
                ).map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-[var(--color-surface-2)]/80"
                  >
                    <Checkbox checked={filter.levels[key]} onCheckedChange={() => handleLevelToggle(key)} />
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', levelDotClass[key])} aria-hidden="true" />
                    <span className="flex-1 font-mono font-medium text-[var(--color-ink)]">{label}</span>
                    <span className="tabular-nums font-mono text-[11px] text-[var(--color-ink-muted)]">
                      {counts[key]}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* 来源筛选 */}
            <div className="space-y-2 border-t border-[var(--color-line)]/70 pt-3">
              <span className="block text-[11px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">
                {ui.logsSource}
              </span>
              <div className="relative">
                <Search
                  size={13}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--color-ink-muted)]"
                />
                <input
                  aria-label={ui.logsSearchPluginOrAccount}
                  type="text"
                  placeholder={ui.logsSearchPluginOrAccount}
                  value={sourceSearch}
                  onChange={e => setSourceSearch(e.target.value)}
                  className="h-8 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] pr-2.5 pl-8 text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
                />
              </div>

              <div className="space-y-1 text-xs">
                {(!normalizedSearch || 'core'.includes(normalizedSearch)) && (
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--color-surface-2)]/80">
                    <Checkbox checked={filter.sources.core} onCheckedChange={handleCoreToggle} />
                    <span className="font-medium text-[var(--color-ink)]">{ui.logsCoreSource}</span>
                  </label>
                )}

                {packages.length > 0 && (
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1 rounded-lg px-1 py-1 hover:bg-[var(--color-surface-2)]/60">
                      <button
                        type="button"
                        onClick={() => setPluginsExpanded(!pluginsExpanded)}
                        aria-label={pluginsExpanded ? ui.logsCollapsePlugins : ui.logsExpandPlugins}
                        aria-expanded={pluginsExpanded}
                        className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                      >
                        {pluginsExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>
                      <label className="flex flex-1 cursor-pointer items-center gap-2">
                        <Checkbox
                          checked={packages.length > 0 && selectedPluginsCount === packages.length}
                          onCheckedChange={handleAllPluginsToggle}
                        />
                        <span className="font-medium text-[var(--color-ink)]">{ui.logsPluginsGroup}</span>
                      </label>
                      <span className="tabular-nums pr-1 font-mono text-[11px] text-[var(--color-ink-muted)]">
                        {selectedPluginsCount}/{packages.length}
                      </span>
                    </div>
                    {pluginsExpanded && (
                      <div className="space-y-0.5 pl-6">
                        {filteredPackages.map(pkg => (
                          <label
                            key={pkg.ID}
                            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-[var(--color-surface-2)]/80"
                          >
                            <Checkbox
                              checked={filter.sources.plugins[pkg.ID] ?? true}
                              onCheckedChange={() => handlePluginToggle(pkg.ID)}
                            />
                            <span className="truncate font-mono text-[11px] text-[var(--color-ink)]">{pkg.ID}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {instances.length > 0 && (
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1 rounded-lg px-1 py-1 hover:bg-[var(--color-surface-2)]/60">
                      <button
                        type="button"
                        onClick={() => setAccountsExpanded(!accountsExpanded)}
                        aria-label={accountsExpanded ? ui.logsCollapseAccounts : ui.logsExpandAccounts}
                        aria-expanded={accountsExpanded}
                        className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                      >
                        {accountsExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>
                      <label className="flex flex-1 cursor-pointer items-center gap-2">
                        <Checkbox
                          checked={instances.length > 0 && selectedAccountsCount === instances.length}
                          onCheckedChange={handleAllAccountsToggle}
                        />
                        <span className="font-medium text-[var(--color-ink)]">{ui.logsAccountsGroup}</span>
                      </label>
                      <span className="tabular-nums pr-1 font-mono text-[11px] text-[var(--color-ink-muted)]">
                        {selectedAccountsCount}/{instances.length}
                      </span>
                    </div>
                    {accountsExpanded && (
                      <div className="space-y-0.5 pl-6">
                        {filteredInstances.map(inst => (
                          <label
                            key={inst.instance_id}
                            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-[var(--color-surface-2)]/80"
                          >
                            <Checkbox
                              checked={filter.sources.accounts[inst.instance_id] ?? true}
                              onCheckedChange={() => handleAccountToggle(inst.instance_id)}
                            />
                            <span className="truncate font-mono text-[11px] text-[var(--color-ink)]">
                              {inst.instance_id}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {filteredOther.length > 0 && (
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1 rounded-lg px-1 py-1 hover:bg-[var(--color-surface-2)]/60">
                      <button
                        type="button"
                        onClick={() => setOtherExpanded(!otherExpanded)}
                        aria-label={otherExpanded ? ui.logsCollapseOther : ui.logsExpandOther}
                        aria-expanded={otherExpanded}
                        className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                      >
                        {otherExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>
                      <span className="font-medium text-[var(--color-ink)]">{ui.logsOtherSources}</span>
                    </div>
                    {otherExpanded && (
                      <div className="space-y-0.5 pl-6">
                        {filteredOther.map(tag => (
                          <label
                            key={tag}
                            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-[var(--color-surface-2)]/80"
                          >
                            <Checkbox
                              checked={filter.sources.other[tag] ?? true}
                              onCheckedChange={() => handleOtherToggle(tag)}
                            />
                            <span className="truncate font-mono text-[11px] text-[var(--color-ink)]">{tag}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 日期筛选 */}
            <div className="space-y-2 border-t border-[var(--color-line)]/70 pt-3">
              <span className="block text-[11px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">
                {ui.logsDate}
              </span>
              <Select
                size="sm"
                variant="filled"
                className="w-full"
                aria-label={ui.logsDate}
                value={filter.date === 'today' ? 'today' : 'history'}
                onValueChange={next => {
                  if (next === 'today') handleDateSelect('today');
                  else {
                    const date = new Date();
                    date.setDate(date.getDate() - 1);
                    handleDateSelect(
                      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
                    );
                  }
                }}
                options={[
                  { value: 'today', label: ui.logsDateToday },
                  { value: 'history', label: ui.logsDateHistory },
                ]}
              />
              {filter.date !== 'today' && (
                <label className="block space-y-1 text-xs text-[var(--color-ink-muted)]">
                  <span>{ui.logsDateCore}</span>
                  <input
                    type="date"
                    value={filter.date}
                    onChange={e => {
                      if (e.target.value) handleDateSelect(e.target.value);
                    }}
                    className="h-8 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-2.5 font-mono text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
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
