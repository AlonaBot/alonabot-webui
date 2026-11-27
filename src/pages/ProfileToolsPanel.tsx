import { useEffect, useState, type JSX } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { onPackagesChanged } from '../api/client';
import { listPackages, type Package } from '../api/packages';
import { getToolPolicies, type ToolPolicy } from '../api/policies';
import {
  getProfilePlugins,
  getProfileTools,
  putProfileTools,
  type ProfilePlugin,
  type ProfileToolPolicy,
} from '../api/profiles';
import { useUI } from '../i18n/UI';
import { cn } from '../lib/cn';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { Dialog as SharedDialog } from '../ui/Dialog';
import { Skeleton } from '../ui/EmptyState';
import { SelectionTools, toggle } from '../ui/SelectionTools';
import { toast } from '../ui/toast';
import { profileToolCandidates, profileToolIdentity, profileToolKey } from './profileTools';

function policySegmentStyle(policy: 'allow' | 'confirm' | 'deny', active: boolean): string {
  if (!active) {
    return 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface)]/70 hover:text-[var(--color-ink)]';
  }
  if (policy === 'allow') {
    return 'bg-[color-mix(in_srgb,var(--color-success)_18%,var(--color-surface))] text-[var(--color-success)] shadow-xs';
  }
  if (policy === 'confirm') {
    return 'bg-[color-mix(in_srgb,var(--color-warning)_18%,var(--color-surface))] text-[var(--color-warning-ink)] shadow-xs';
  }
  return 'bg-[color-mix(in_srgb,var(--color-danger)_18%,var(--color-surface))] text-[var(--color-danger)] shadow-xs';
}

export function ProfileToolsPanel({ profileID }: { profileID: string }): JSX.Element {
  const ui = useUI();
  const [globals, setGlobals] = useState<ToolPolicy[]>([]);
  const [items, setItems] = useState<ProfileToolPolicy[]>([]);
  const [plugins, setPlugins] = useState<ProfilePlugin[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [pickPolicy, setPickPolicy] = useState<ProfileToolPolicy['policy']>('deny');

  async function load(): Promise<void> {
    const [global, saved, profilePlugins, allPackages] = await Promise.all([
      getToolPolicies(),
      getProfileTools(profileID),
      getProfilePlugins(profileID),
      listPackages(),
    ]);
    setGlobals(global.policies);
    setItems(saved.items);
    setPlugins(profilePlugins);
    setPackages(allPackages);
  }

  useEffect(() => {
    const refresh = (): void => {
      void load()
        .catch(error => toast.error(error))
        .finally(() => setLoading(false));
    };
    refresh();
    return onPackagesChanged(refresh);
  }, [profileID]);

  async function save(item: ProfileToolPolicy, policy: ProfileToolPolicy['policy']): Promise<void> {
    await saveMany([item], policy);
  }

  async function saveMany(targets: ProfileToolPolicy[], policy: ProfileToolPolicy['policy']): Promise<void> {
    if (targets.length === 0) return;
    setBusy(true);
    const errors: string[] = [];
    try {
      await putProfileTools(
        profileID,
        targets.map(item => ({ ...item, policy })),
      );
      setOpen(false);
      setSelected(new Set());
      setPicked(new Set());
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    try {
      await load();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    if (errors.length) toast.error(errors.join('\n'));
    setBusy(false);
  }

  const label = (policy: string): string =>
    policy === 'allow'
      ? ui.toolActionAllow
      : policy === 'confirm'
        ? ui.toolActionAsk
        : policy === 'deny'
          ? ui.toolActionDeny
          : ui.toolActionInherit;

  const matches = (item: ProfileToolPolicy, search: string): boolean => {
    const { pluginID, name, kind } = profileToolIdentity(item);
    return (pluginID + '/' + name + (kind === 'tool' ? ui.profileToolIdentity : ui.profileOperationIdentity))
      .toLowerCase()
      .includes(search.trim().toLowerCase());
  };

  const detail = (item: ProfileToolPolicy): JSX.Element => {
    const { pluginID, name, kind } = profileToolIdentity(item);
    const global = globals.find(row => row.plugin_id === pluginID && row.service === name);
    const disabled =
      packages.some(pkg => pkg.ID === pluginID && !pkg.Enabled) ||
      plugins.some(plugin => plugin.plugin_id === pluginID && !plugin.enabled);
    return (
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-mono text-xs font-semibold text-[var(--color-ink)]">{name}</span>
          <span className="rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-ink-muted)]">
            {kind === 'tool' ? ui.profileToolIdentity : ui.profileOperationIdentity}
          </span>
        </div>
        <p className="truncate text-xs text-[var(--color-ink-muted)]">
          <span className="font-mono">{pluginID}</span>
          {global &&
            ` · ${ui.toolGlobalPrefix.replace('{policy}', label(global.override === 'inherit' ? global.default : global.override))}`}
          {disabled && ` · ${ui.pluginDisabled}`}
        </p>
      </div>
    );
  };

  const visible = items.filter(item => item.policy !== 'inherit' && matches(item, filter));
  const chosen = visible.filter(item => selected.has(profileToolKey(item)));
  const candidates = profileToolCandidates(globals, items);
  const shownCandidates = candidates.filter(item => matches(item, query));

  return (
    <div className="space-y-3">
      {loading ? (
        <Skeleton height={110} />
      ) : (
        <fieldset disabled={busy} className="m-0 space-y-3 border-0 p-0">
          {items.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="relative min-w-[180px] flex-1">
                <Search
                  size={14}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-ink-muted)]"
                />
                <input
                  type="search"
                  aria-label={ui.searchTools}
                  placeholder={ui.searchTools}
                  value={filter}
                  onChange={event => setFilter(event.target.value)}
                  className="h-9 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] pr-3 pl-8.5 text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
                />
              </div>
              <SelectionTools keys={visible.map(profileToolKey)} selected={selected} onChange={setSelected} />
            </div>
          )}

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color-mix(in_srgb,var(--color-accent)_35%,transparent)] bg-[var(--color-accent-soft)] px-3 py-2 text-xs">
              <span className="font-semibold text-[var(--color-accent-strong)]">
                {ui.selectedItems.replace('{count}', String(selected.size))}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {(['allow', 'confirm', 'deny'] as const).map(policy => (
                  <Button key={policy} size="sm" variant="secondary" onClick={() => void saveMany(chosen, policy)}>
                    {label(policy)}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Trash2 size={13} />}
                  onClick={() => void saveMany(chosen, 'inherit')}
                >
                  {ui.toolActionInherit}
                </Button>
              </div>
            </div>
          )}

          {visible.length > 0 && (
            <div className="divide-y divide-[var(--color-line)]/70 rounded-xl border border-[var(--color-line)]/80 bg-[var(--color-surface-2)]/35 px-3">
              {visible.map(item => {
                const key = profileToolKey(item);
                return (
                  <div
                    key={key}
                    className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Checkbox
                        aria-label={key}
                        checked={selected.has(key)}
                        onCheckedChange={on => setSelected(toggle(selected, key, on))}
                      />
                      {detail(item)}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <div
                        className="inline-flex items-center rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-0.5"
                        role="group"
                        aria-label={key}
                      >
                        {(['allow', 'confirm', 'deny'] as const).map(policy => (
                          <button
                            key={policy}
                            type="button"
                            aria-pressed={item.policy === policy}
                            onClick={() => void save(item, policy)}
                            className={cn(
                              'rounded-lg px-2.5 py-1 text-xs font-medium transition-all',
                              policySegmentStyle(policy, item.policy === policy),
                            )}
                          >
                            {label(policy)}
                          </button>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        aria-label={`${ui.toolActionInherit} ${key}`}
                        onClick={() => void save(item, 'inherit')}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setQuery('');
              setPicked(new Set());
              setOpen(true);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-line))] bg-[var(--color-accent-soft)]/50 px-4 py-2.5 text-xs font-semibold text-[var(--color-accent-strong)] transition-all hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
          >
            <Plus size={15} aria-hidden="true" />
            <span>{ui.overrideOtherTools}</span>
          </button>
        </fieldset>
      )}

      <SharedDialog
        open={open}
        onOpenChange={setOpen}
        title={ui.addToolOverride}
        size="lg"
        footer={
          <>
            <span className="mr-auto text-xs font-medium text-[var(--color-ink-muted)]">
              {ui.selectedItems.replace('{count}', String(picked.size))}
            </span>
            <div
              className="inline-flex items-center rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-0.5"
              role="group"
              aria-label={ui.toolOverride}
            >
              {(['allow', 'confirm', 'deny'] as const).map(policy => (
                <button
                  key={policy}
                  type="button"
                  aria-pressed={pickPolicy === policy}
                  onClick={() => setPickPolicy(policy)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-medium transition-all',
                    policySegmentStyle(policy, pickPolicy === policy),
                  )}
                >
                  {label(policy)}
                </button>
              ))}
            </div>
            <Button
              variant="primary"
              loading={busy}
              disabled={picked.size === 0}
              onClick={() =>
                void saveMany(
                  candidates.filter(item => picked.has(profileToolKey(item))),
                  pickPolicy,
                )
              }
            >
              {ui.add}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[180px] flex-1">
              <Search
                size={14}
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-ink-muted)]"
              />
              <input
                type="search"
                aria-label={ui.searchTools}
                placeholder={ui.searchTools}
                value={query}
                onChange={event => setQuery(event.target.value)}
                className="h-9 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] pr-3 pl-8.5 text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
              />
            </div>
            <SelectionTools keys={shownCandidates.map(profileToolKey)} selected={picked} onChange={setPicked} />
          </div>

          <div className="max-h-[min(420px,50vh)] space-y-1 overflow-y-auto pr-1">
            {shownCandidates.map(item => {
              const key = profileToolKey(item);
              return (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--color-surface-2)]"
                >
                  <Checkbox
                    aria-label={key}
                    checked={picked.has(key)}
                    onCheckedChange={on => setPicked(toggle(picked, key, on))}
                  />
                  {detail(item)}
                </label>
              );
            })}
            {shownCandidates.length === 0 && (
              <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">{ui.noToolsToOverride}</p>
            )}
          </div>
        </div>
      </SharedDialog>
    </div>
  );
}
