import { useEffect, useRef, useState, type JSX } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Edit2,
  Package as PackageIcon,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  Wrench,
} from 'lucide-react';
import { listPackages, packageIconURL, type Package } from '../api/packages';
import {
  getPluginPolicies,
  getToolPolicies,
  resetCommandNames,
  setCommandNames,
  setPluginPolicy,
  setToolPolicies,
  setToolPolicy,
  type CommandPolicy,
  type CommandScope,
  type PluginPolicies,
  type ToolPolicy,
  type ToolPolicyValue,
} from '../api/policies';
import { useUI } from '../i18n/UI';
import { cn } from '../lib/cn';
import { useUISettings } from '../shell/settings';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { Dialog as SharedDialog } from '../ui/Dialog';
import { EmptyState, LoadingRows } from '../ui/EmptyState';
import { Select } from '../ui/Select';
import { SpotlightCard } from '../ui/SpotlightCard';
import { toast } from '../ui/toast';
import { CommandNamesDialog, type NamesDraft } from './CommandNamesDialog';
import { CommandPolicyControls } from './CommandPolicyControls';
import { PermissionsTabs } from './PermissionsTabs';
import {
  commandDescription,
  commandOverride,
  commandTree,
  matchesCommand,
  scopeEnabled,
  scopeKey,
  type CommandTree,
} from './permissionState';

const POLICY_VALUES: readonly ToolPolicyValue[] = ['inherit', 'allow', 'confirm', 'deny'];
const toolKey = (tool: ToolPolicy): string => JSON.stringify([tool.plugin_id, tool.service]);

function toolPolicyButtonClass(policy: ToolPolicyValue, active: boolean): string {
  if (!active) {
    return 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface)]/80 hover:text-[var(--color-ink)]';
  }
  if (policy === 'allow') {
    return 'bg-[color-mix(in_srgb,var(--color-success)_18%,var(--color-surface))] text-[var(--color-success)] shadow-xs';
  }
  if (policy === 'confirm') {
    return 'bg-[color-mix(in_srgb,var(--color-warning)_18%,var(--color-surface))] text-[var(--color-warning-ink)] shadow-xs';
  }
  if (policy === 'deny') {
    return 'bg-[color-mix(in_srgb,var(--color-danger)_18%,var(--color-surface))] text-[var(--color-danger)] shadow-xs';
  }
  return 'bg-[var(--color-surface)] text-[var(--color-ink)] shadow-xs';
}

function effectBadgeClass(effect: ToolPolicy['effect']): string {
  if (effect === 'read_only') {
    return 'bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[var(--color-success)]';
  }
  if (effect === 'write') {
    return 'bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)] text-[var(--color-warning-ink)]';
  }
  if (effect === 'destructive') {
    return 'bg-[color-mix(in_srgb,var(--color-danger)_14%,transparent)] text-[var(--color-danger)]';
  }
  return 'bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]';
}

export function PermissionsPage({ tab = 'commands' }: { tab?: 'commands' | 'tools' }): JSX.Element {
  const ui = useUI();
  const { locale } = useUISettings();
  const [packages, setPackages] = useState<Package[]>([]);
  const [policies, setPolicies] = useState<Record<string, PluginPolicies>>({});
  const [tools, setTools] = useState<ToolPolicy[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const [plugin, setPlugin] = useState('');
  const [query, setQuery] = useState('');
  const [permission, setPermission] = useState('');
  const [toolPolicy, setToolPolicyFilter] = useState('');
  const [category, setCategory] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [batchPolicy, setBatchPolicy] = useState<ToolPolicyValue>('allow');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [names, setNames] = useState<NamesDraft | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [custom, setCustom] = useState<{ plugin: string; scope: CommandScope; permissions: string } | null>(null);

  const labels: Record<ToolPolicyValue, string> = {
    inherit: ui.policyInherit,
    allow: ui.policyAllow,
    confirm: ui.policyConfirm,
    deny: ui.policyDeny,
  };
  const effects: Record<ToolPolicy['effect'], string> = {
    read_only: ui.catReadOnly,
    write: ui.catWrite,
    destructive: ui.catDestructive,
    unspecified: ui.catUnspecified,
  };

  const load = async (): Promise<void> => {
    setError(null);
    try {
      const [all, directory] = await Promise.all([listPackages(), getToolPolicies()]);
      const installed = all.filter(value => !value.Uninstalled && value.Role !== 'webui');
      setPackages(installed);
      setTools(directory.policies);
      const results = await Promise.allSettled(
        installed.map(async value => [value.ID, await getPluginPolicies(value.ID)] as const),
      );
      const next: Record<string, PluginPolicies> = {};
      const errors: string[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled') next[result.value[0]] = result.value[1];
        else errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
      }
      setPolicies(next);
      if (errors.length) setError(errors.join('\n'));
    } catch (err) {
      setTools(null);
      setPolicies({});
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setQuery('');
    setSelected(new Set());
  }, [tab]);

  const mutate = async (action: () => Promise<void>, pluginID?: string): Promise<boolean> => {
    if (writing.current) return false;
    writing.current = true;
    setBusy(true);
    setDialogError(null);
    const errors: string[] = [];
    try {
      await action();
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
    try {
      if (pluginID) {
        const next = await getPluginPolicies(pluginID);
        setPolicies(previous => ({ ...previous, [pluginID]: next }));
      } else {
        setTools((await getToolPolicies()).policies);
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      if (pluginID) {
        setPolicies(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => id !== pluginID)));
      } else {
        setTools(null);
      }
    }
    const message = errors.length ? errors.join('\n') : null;
    if (message) toast.error(message);
    setDialogError(message);
    setBusy(false);
    writing.current = false;
    return errors.length === 0;
  };

  const controls = (
    pluginID: string,
    scope: CommandScope,
    label: string,
    command?: CommandPolicy,
    enabledOnly = false,
  ): JSX.Element => (
    <CommandPolicyControls
      overrides={policies[pluginID].overrides}
      scope={scope}
      label={label}
      busy={busy}
      path={command?.declared_names[0]}
      enabledOnly={enabledOnly}
      enabled={command?.enabled ?? scopeEnabled(policies[pluginID].overrides, scope)}
      permissions={command ? (command.permissions ?? []) : undefined}
      onChange={change =>
        void mutate(
          () => setPluginPolicy(pluginID, commandOverride(policies[pluginID].overrides, scope, change)),
          pluginID,
        )
      }
      onCustom={perms => {
        setDialogError(null);
        setCustom({ plugin: pluginID, scope, permissions: perms?.join(', ') ?? '' });
      }}
    />
  );

  const toggle = (key: string): void =>
    setCollapsed(previous => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const matches = (command: CommandPolicy): boolean => matchesCommand(command, query, permission);

  const renderCommand = (pluginID: string, command: CommandPolicy): JSX.Element | null => {
    if (!matches(command)) return null;
    const paths = command.effective_names.map(path => path.join(' '));
    const display = paths[0] || command.route_id;
    const description = commandDescription(command, locale, policies[pluginID].default_locale);
    const shadows = policies[pluginID].shadows.filter(
      shadow =>
        (shadow.winner.plugin_id === pluginID && shadow.winner.route_id === command.route_id) ||
        shadow.shadowed.some(entry => entry.plugin_id === pluginID && entry.route_id === command.route_id),
    );

    return (
      <div
        key={command.route_id}
        className="flex flex-col gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-[var(--color-surface-2)]/55 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <code className="font-mono text-sm font-semibold text-[var(--color-ink)]">{display}</code>
            {paths.slice(1).map(path => (
              <span
                key={path}
                className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-ink-muted)]"
              >
                {path}
              </span>
            ))}
            {command.has_names_override && (
              <span className="rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-accent-strong)]">
                {ui.renamedBadge}
              </span>
            )}
            {shadows.map((shadow, index) => (
              <span
                key={index}
                title={`${shadow.path.join(' ')}: ${ui.shadowWinner} ${shadow.winner.plugin_id}/${shadow.winner.route_id}; ${ui.commandShadowed} ${shadow.shadowed.map(entry => `${entry.plugin_id}/${entry.route_id}`).join(', ')}`}
                className="rounded-full bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-warning-ink)]"
              >
                {shadow.winner.plugin_id === pluginID && shadow.winner.route_id === command.route_id
                  ? ui.shadowWinner
                  : ui.commandShadowed}
              </span>
            ))}
            {command.invalid_names.length > 0 && (
              <span className="rounded-full bg-[color-mix(in_srgb,var(--color-danger)_14%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-danger)]">
                {ui.invalidNamesBadge}
              </span>
            )}
          </div>
          {description && <p className="text-xs leading-relaxed text-[var(--color-ink-muted)]">{description}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {command.declared_names.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              aria-label={`${ui.editNames} ${display}`}
              title={ui.editNames}
              onClick={() => {
                setDialogError(null);
                setNames({ plugin: pluginID, command, names: paths });
              }}
            >
              <Edit2 size={14} />
            </Button>
          )}
          {controls(pluginID, { kind: 'route', route_id: command.route_id }, display, command)}
        </div>
      </div>
    );
  };

  const groupMatches = (node: CommandTree): boolean =>
    node.commands.some(matches) || node.children.some(groupMatches);

  const renderGroup = (pluginID: string, node: CommandTree, depth = 0): JSX.Element => (
    <div className={cn('space-y-1', depth > 0 && 'ml-3 border-l border-[var(--color-line)]/80 pl-3 sm:ml-4 sm:pl-4')}>
      {node.commands.map(command => renderCommand(pluginID, command))}
      {node.children
        .filter(child => (!query && !permission) || groupMatches(child))
        .map(child => {
          const scope: CommandScope = { kind: 'group', group: child.path };
          const key = JSON.stringify([pluginID, scopeKey(scope)]);
          const open = !collapsed.has(key);
          return (
            <div key={key} className="space-y-1 pt-1">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--color-surface-2)]/55 px-3 py-2">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => toggle(key)}
                  className="inline-flex items-center gap-2 text-left text-sm font-semibold text-[var(--color-ink)]"
                >
                  {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  <code className="font-mono">{child.path.join(' ')}</code>
                </button>
                {controls(pluginID, scope, child.path.join(' '))}
              </div>
              {open && renderGroup(pluginID, child, depth + 1)}
            </div>
          );
        })}
    </div>
  );

  const visibleTools = (tools ?? []).filter(
    tool =>
      (!plugin || tool.plugin_id === plugin) &&
      (!category || tool.effect === category) &&
      (!toolPolicy || (tool.override === 'inherit' ? tool.default : tool.override) === toolPolicy) &&
      `${tool.plugin_id} ${tool.service}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const pickedTools = visibleTools.filter(tool => selected.has(toolKey(tool)));
  const toolPlugins = [...new Set(visibleTools.map(tool => tool.plugin_id))];
  const commandPackages = packages.filter(
    value => (!plugin || value.ID === plugin) && ((!query && !permission) || policies[value.ID]?.commands.some(matches)),
  );

  const visibleKeys =
    tab === 'commands'
      ? commandPackages.flatMap(value => {
          const keys = [value.ID];
          const collect = (node: CommandTree): void => {
            for (const child of node.children) {
              keys.push(JSON.stringify([value.ID, scopeKey({ kind: 'group', group: child.path })]));
              collect(child);
            }
          };
          if (policies[value.ID]) collect(commandTree(policies[value.ID].commands, policies[value.ID].overrides));
          return keys;
        })
      : toolPlugins;
  const allCollapsed = visibleKeys.length > 0 && visibleKeys.every(key => collapsed.has(key));

  const renderPluginIcon = (id: string): JSX.Element => (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)]">
      <img
        src={packageIconURL(id)}
        alt=""
        className="h-full w-full object-cover"
        onError={e => {
          e.currentTarget.style.display = 'none';
          const fallback = e.currentTarget.nextElementSibling;
          if (fallback instanceof HTMLElement) fallback.style.display = 'flex';
        }}
      />
      <span className="hidden items-center justify-center text-[var(--color-ink-muted)]">
        <PackageIcon size={14} />
      </span>
    </span>
  );

  return (
    <div className="space-y-4">
      <PermissionsTabs active={tab} />

      {/* 玻璃筛选工具条 */}
      <SpotlightCard className="p-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <Select
            size="sm"
            variant="filled"
            aria-label={ui.filterPlugin}
            value={plugin}
            onValueChange={next => {
              setPlugin(next);
              setSelected(new Set());
            }}
            options={[
              { value: '', label: ui.allPlugins },
              ...packages.map(value => ({ value: value.ID, label: value.Name || value.ID })),
            ]}
          />

          {tab === 'commands' ? (
            <Select
              size="sm"
              variant="filled"
              aria-label={ui.filterPermission}
              value={permission}
              onValueChange={setPermission}
              options={[
                { value: '', label: ui.allPermissions },
                { value: 'everyone', label: ui.permEveryone },
                { value: 'chat_admin', label: ui.permGroupAdmin },
                { value: 'admin', label: ui.permAdminOnly },
                { value: 'custom', label: ui.customPermissions },
              ]}
            />
          ) : (
            <Select
              size="sm"
              variant="filled"
              aria-label={ui.allPolicies}
              value={toolPolicy}
              onValueChange={next => {
                setToolPolicyFilter(next);
                setSelected(new Set());
              }}
              options={[
                { value: '', label: ui.allPolicies },
                ...POLICY_VALUES.map(value => ({ value, label: labels[value] })),
              ]}
            />
          )}

          <div className="relative min-w-[180px] flex-1">
            <Search
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-ink-muted)]"
            />
            <input
              type="search"
              aria-label={tab === 'commands' ? ui.searchCommandPlaceholder : ui.searchToolPlaceholder}
              placeholder={tab === 'commands' ? ui.searchCommandPlaceholder : ui.searchToolPlaceholder}
              value={query}
              onChange={event => {
                setQuery(event.target.value);
                setSelected(new Set());
              }}
              className="h-8 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] pr-3 pl-8.5 text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
            />
          </div>

          <Button
            size="sm"
            variant="secondary"
            iconOnly
            disabled={busy || loading}
            aria-label={ui.refresh}
            title={ui.refresh}
            onClick={() => void load()}
          >
            <RefreshCw size={14} />
          </Button>

          <Button
            size="sm"
            variant="secondary"
            icon={allCollapsed ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            onClick={() =>
              setCollapsed(previous => {
                const next = new Set(previous);
                for (const key of visibleKeys) {
                  if (allCollapsed) next.delete(key);
                  else next.add(key);
                }
                return next;
              })
            }
          >
            {allCollapsed ? ui.expandAll : ui.collapseAll}
          </Button>
        </div>
      </SpotlightCard>

      {error && (
        <p className="plugins-error-banner" role="alert">
          {error}
        </p>
      )}

      {loading && (
        <SpotlightCard className="p-5">
          <LoadingRows />
        </SpotlightCard>
      )}

      {/* 命令权限树视图 */}
      {!loading && tab === 'commands' && (
        <div className="space-y-3.5">
          {commandPackages.length === 0 ? (
            <SpotlightCard className="p-6">
              <EmptyState icon={<Shield size={22} />} title={ui.noCommands} />
            </SpotlightCard>
          ) : (
            commandPackages.map(value => {
              const policy = policies[value.ID];
              const open = !collapsed.has(value.ID);
              const conflicts = (policy?.shadows.length ?? 0) + (policy?.invalid_names.length ?? 0);
              return (
                <SpotlightCard key={value.ID} className="overflow-hidden">
                  <div className="flex flex-col gap-2.5 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => toggle(value.ID)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <span className="text-[var(--color-ink-muted)]">
                        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </span>
                      {renderPluginIcon(value.ID)}
                      <span className="truncate text-sm font-semibold text-[var(--color-ink)]">
                        {value.Name || value.ID}
                      </span>
                      <span className="tabular-nums shrink-0 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-ink-muted)]">
                        {policy?.commands.length ?? 0} {ui.commandsCount}
                      </span>
                      {conflicts > 0 && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-warning-ink)]">
                          <AlertTriangle size={11} aria-hidden="true" />
                          {conflicts} {ui.conflictWarning}
                        </span>
                      )}
                    </button>
                    {policy && controls(value.ID, { kind: 'plugin' }, value.ID, undefined, !open)}
                  </div>

                  {open && policy && (
                    <div className="space-y-2 border-t border-[var(--color-line)]/70 px-3 py-3 sm:px-4">
                      {renderGroup(value.ID, commandTree(policy.commands, policy.overrides))}
                      {policy.commands.length === 0 && (
                        <p className="py-4 text-center text-xs text-[var(--color-ink-muted)]">{ui.noCommands}</p>
                      )}
                      {policy.overrides
                        .filter(
                          entry =>
                            entry.scope.kind === 'route' &&
                            !policy.commands.some(
                              command => entry.scope.kind === 'route' && command.route_id === entry.scope.route_id,
                            ),
                        )
                        .map(entry => (
                          <div
                            key={scopeKey(entry.scope)}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color-mix(in_srgb,var(--color-danger)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_6%,transparent)] px-3 py-2.5"
                          >
                            <div className="flex items-center gap-2">
                              <code className="font-mono text-xs text-[var(--color-ink)]">
                                {entry.scope.kind === 'route' ? entry.scope.route_id : ''}
                              </code>
                              <span className="rounded-full bg-[color-mix(in_srgb,var(--color-danger)_14%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-danger)]">
                                {ui.invalidNameUnregistered}
                              </span>
                            </div>
                            {controls(
                              value.ID,
                              entry.scope,
                              entry.scope.kind === 'route' ? entry.scope.route_id : '',
                            )}
                          </div>
                        ))}

                      {policy.shadows.length > 0 && (
                        <ul className="m-0 space-y-1 rounded-xl border border-[color-mix(in_srgb,var(--color-warning)_32%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] px-3.5 py-2.5 text-xs text-[var(--color-warning-ink)]">
                          {policy.shadows.map((shadow, index) => (
                            <li key={index}>
                              <code className="font-mono font-semibold">{shadow.path.join(' ')}</code> ·{' '}
                              {ui.shadowWinner}:{' '}
                              <code className="font-mono">
                                {shadow.winner.plugin_id}/{shadow.winner.route_id}
                              </code>{' '}
                              · {ui.commandShadowed}:{' '}
                              {shadow.shadowed.map(entry => `${entry.plugin_id}/${entry.route_id}`).join(', ')}
                            </li>
                          ))}
                        </ul>
                      )}

                      {policy.invalid_names.length > 0 && (
                        <ul className="m-0 space-y-1.5 rounded-xl border border-[color-mix(in_srgb,var(--color-danger)_32%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)] px-3.5 py-2.5 text-xs text-[var(--color-danger)]">
                          {policy.invalid_names.map((entry, index) => (
                            <li key={index} className="flex flex-wrap items-center justify-between gap-2">
                              <span>
                                <code className="font-mono font-semibold">
                                  {entry.route_id}: {entry.name?.join(' ')}
                                </code>{' '}
                                · {entry.reason === 'declared' ? ui.invalidNameDeclared : ui.invalidNameUnregistered}
                              </span>
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={busy}
                                onClick={() => void mutate(() => resetCommandNames(value.ID, entry.route_id), value.ID)}
                              >
                                {ui.resetNames}
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </SpotlightCard>
              );
            })
          )}
        </div>
      )}

      {/* 工具策略视图 */}
      {!loading && tab === 'tools' && (
        <div className="space-y-3.5">
          <SpotlightCard className="p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Select
                  size="sm"
                  variant="filled"
                  aria-label={ui.toolCategory}
                  value={category}
                  onValueChange={next => {
                    setCategory(next);
                    setSelected(new Set());
                  }}
                  options={[
                    { value: '', label: ui.all },
                    ...Object.entries(effects).map(([value, label]) => ({ value, label })),
                  ]}
                />
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-[var(--color-ink)]">
                  <Checkbox
                    checked={visibleTools.length > 0 && pickedTools.length === visibleTools.length}
                    onCheckedChange={checked =>
                      setSelected(checked ? new Set(visibleTools.map(toolKey)) : new Set())
                    }
                  />
                  <span>{ui.selectAll}</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Select
                  size="sm"
                  variant="filled"
                  aria-label={ui.toolOverride}
                  value={batchPolicy}
                  onValueChange={next => setBatchPolicy(next as ToolPolicyValue)}
                  options={POLICY_VALUES.map(value => ({ value, label: labels[value] }))}
                />
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy || pickedTools.length === 0 || tools === null}
                  onClick={() =>
                    void mutate(() =>
                      setToolPolicies(
                        pickedTools.map(tool => ({
                          plugin_id: tool.plugin_id,
                          service: tool.service,
                          policy: batchPolicy,
                        })),
                      ),
                    )
                  }
                >
                  {ui.batchSet} ({pickedTools.length})
                </Button>
              </div>
            </div>
          </SpotlightCard>

          {toolPlugins.length === 0 ? (
            <SpotlightCard className="p-6">
              <EmptyState icon={<Wrench size={22} />} title={ui.noEntries} />
            </SpotlightCard>
          ) : (
            toolPlugins.map(id => {
              const open = !collapsed.has(id);
              const rows = visibleTools.filter(tool => tool.plugin_id === id);
              return (
                <SpotlightCard key={id} className="overflow-hidden">
                  <div className="px-4 py-3.5 sm:px-5">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => toggle(id)}
                      className="flex w-full items-center gap-2.5 text-left"
                    >
                      <span className="text-[var(--color-ink-muted)]">
                        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </span>
                      {renderPluginIcon(id)}
                      <span className="truncate text-sm font-semibold text-[var(--color-ink)]">
                        {packages.find(value => value.ID === id)?.Name || id}
                      </span>
                      <span className="tabular-nums shrink-0 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-ink-muted)]">
                        {rows.length} {ui.toolsCount}
                      </span>
                    </button>
                  </div>

                  {open && (
                    <div className="divide-y divide-[var(--color-line)]/70 border-t border-[var(--color-line)]/70 px-4 py-1 sm:px-5">
                      {rows.map(tool => {
                        const key = toolKey(tool);
                        return (
                          <div
                            key={tool.service}
                            className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                              <Checkbox
                                checked={selected.has(key)}
                                onCheckedChange={checked => {
                                  const next = new Set(selected);
                                  if (checked) next.add(key);
                                  else next.delete(key);
                                  setSelected(next);
                                }}
                              />
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <code className="truncate font-mono text-sm font-semibold text-[var(--color-ink)]">
                                    {tool.service}
                                  </code>
                                  <span
                                    className={cn(
                                      'rounded-full px-2 py-0.5 text-[11px] font-medium',
                                      effectBadgeClass(tool.effect),
                                    )}
                                  >
                                    {effects[tool.effect]}
                                  </span>
                                </div>
                                <p className="text-xs text-[var(--color-ink-muted)]">
                                  {ui.toolDefault}: {labels[tool.default]}
                                </p>
                              </div>
                            </label>

                            <div
                              className="inline-flex shrink-0 items-center self-end rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-0.5 sm:self-center"
                              role="group"
                              aria-label={`${ui.toolOverride} ${tool.service}`}
                            >
                              {POLICY_VALUES.map(policy => (
                                <button
                                  key={policy}
                                  type="button"
                                  aria-pressed={tool.override === policy}
                                  aria-label={labels[policy]}
                                  title={labels[policy]}
                                  disabled={busy}
                                  onClick={() =>
                                    void mutate(() =>
                                      setToolPolicy({ plugin_id: tool.plugin_id, service: tool.service, policy }),
                                    )
                                  }
                                  className={cn(
                                    'inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-xs font-medium transition-all disabled:opacity-50',
                                    toolPolicyButtonClass(policy, tool.override === policy),
                                  )}
                                >
                                  {policy === 'inherit' ? <RotateCcw size={13} /> : labels[policy]}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </SpotlightCard>
              );
            })
          )}
        </div>
      )}

      <CommandNamesDialog
        draft={names}
        setDraft={setNames}
        busy={busy}
        error={dialogError}
        onSave={() => {
          if (!names) return;
          const matrix = names.names.map(name => name.trim().split(/\s+/));
          if (!matrix.length || matrix.some(path => path.some(token => !token || token.startsWith('/')))) {
            setDialogError(ui.invalidCommandName);
            return;
          }
          void mutate(() => setCommandNames(names.plugin, names.command.route_id, matrix), names.plugin).then(
            success => {
              if (success) setNames(null);
            },
          );
        }}
        onReset={() => {
          if (names) {
            void mutate(() => resetCommandNames(names.plugin, names.command.route_id), names.plugin).then(success => {
              if (success) setNames(null);
            });
          }
        }}
      />

      <SharedDialog
        open={custom !== null}
        onOpenChange={open => {
          if (!open && !busy) setCustom(null);
        }}
        size="sm"
        title={ui.customPermissions}
        description={ui.permissionsInputHint}
        footer={
          <>
            <Button disabled={busy} onClick={() => setCustom(null)}>
              {ui.cancel}
            </Button>
            <Button
              type="submit"
              form="custom-permissions-form"
              variant="primary"
              loading={busy}
              disabled={!custom || !policies[custom.plugin]}
            >
              {ui.save}
            </Button>
          </>
        }
      >
        <form
          id="custom-permissions-form"
          className="space-y-3"
          onSubmit={async event => {
            event.preventDefault();
            if (!custom || !policies[custom.plugin]) return;
            const permissions = custom.permissions
              .split(',')
              .map(value => value.trim())
              .filter(Boolean);
            if (
              await mutate(
                () =>
                  setPluginPolicy(
                    custom.plugin,
                    commandOverride(policies[custom.plugin].overrides, custom.scope, { permissions }),
                  ),
                custom.plugin,
              )
            ) {
              setCustom(null);
            }
          }}
        >
          {dialogError && (
            <p className="form-error mb-0" role="alert">
              {dialogError}
            </p>
          )}
          <input
            aria-label={ui.permissions}
            placeholder="admin, chat_admin"
            value={custom?.permissions ?? ''}
            onChange={event => custom && setCustom({ ...custom, permissions: event.target.value })}
            className="h-10 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3.5 font-mono text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
          />
        </form>
      </SharedDialog>
    </div>
  );
}
