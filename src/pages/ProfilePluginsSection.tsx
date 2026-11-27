import { useEffect, useState, type JSX } from 'react';
import { AlertTriangle, ChevronRight, Package as PackageIcon, Search } from 'lucide-react';
import { getPluginConfig, type ConfigSnapshot } from '../api/config';
import { packageIconURL, type Package } from '../api/packages';
import { patchProfilePlugin, pruneProfilePlugin, type ProfilePlugin } from '../api/profiles';
import { useUI } from '../i18n/UI';
import { fieldText, pickLocale } from '../i18n/catalog';
import { cn } from '../lib/cn';
import { fieldsFromSchema, type Field } from '../schema/model';
import { navigate } from '../shell/router';
import { useUISettings } from '../shell/settings';
import { Button } from '../ui/Button';
import { SpotlightCard } from '../ui/SpotlightCard';
import { Switch } from '../ui/Switch';
import { toast } from '../ui/toast';
import { fieldDottedPath } from './pluginConfig';

export function ProfilePluginsSection({
  profileID,
  packages,
  plugins,
  onChanged,
}: {
  profileID: string;
  packages: Package[];
  plugins: ProfilePlugin[];
  onChanged: () => void;
}): JSX.Element {
  const ui = useUI();
  const { locale } = useUISettings();
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [snapshots, setSnapshots] = useState<Record<string, ConfigSnapshot>>({});

  const summaryIDs = plugins
    .filter(plugin => Object.keys(plugin.overrides).length > 0)
    .map(plugin => plugin.plugin_id)
    .join('\n');

  useEffect(() => {
    let active = true;
    void Promise.allSettled(
      summaryIDs ? summaryIDs.split('\n').map(async id => [id, await getPluginConfig(id)] as const) : [],
    ).then(results => {
      if (!active) return;
      const errors: string[] = [];
      const entries: [string, ConfigSnapshot][] = [];
      for (const result of results) {
        if (result.status === 'fulfilled') entries.push([...result.value]);
        else errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
      }
      setSnapshots(Object.fromEntries(entries));
      if (errors.length) toast.error(errors.join('\n'));
    });
    return () => {
      active = false;
    };
  }, [summaryIDs]);

  async function mutate(action: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(error);
    } finally {
      await onChanged();
      setBusy(false);
    }
  }

  function fieldLabel(pluginID: string, path: string): string {
    const snapshot = snapshots[pluginID];
    if (!snapshot) return path;
    const messages = { config: snapshot.i18n[pickLocale(Object.keys(snapshot.i18n), [locale])] ?? {} };
    function find(fields: Field[]): Field | undefined {
      for (const field of fields) {
        if (fieldDottedPath(field.schemaPath) === path) return field;
        const child = field.children && find(field.children);
        if (child) return child;
      }
      return undefined;
    }
    const field = find(fieldsFromSchema(snapshot.schema));
    return field ? fieldText(messages, field).description : path;
  }

  const shown = plugins.filter(plugin =>
    `${plugin.plugin_id} ${packages.find(pkg => pkg.ID === plugin.plugin_id)?.Name ?? ''}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  // 批量操作只作用于当前筛选出、且全局已启用的插件。
  const switchable = shown.filter(plugin => packages.find(pkg => pkg.ID === plugin.plugin_id)?.Enabled);
  const setAll = (want: (plugin: ProfilePlugin) => boolean): void =>
    void mutate(async () => {
      for (const plugin of switchable) {
        if (plugin.enabled !== want(plugin)) {
          await patchProfilePlugin(profileID, plugin.plugin_id, { enabled: want(plugin) });
        }
      }
    });

  return (
    <div className="space-y-4">
      <SpotlightCard className="p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search
              size={15}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-ink-muted)]"
            />
            <input
              type="search"
              aria-label={ui.searchPlugins}
              placeholder={ui.searchPlugins}
              value={query}
              onChange={event => setQuery(event.target.value)}
              className="h-9 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] pr-3 pl-9 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={ui.selection}>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || switchable.every(plugin => plugin.enabled)}
              onClick={() => setAll(() => true)}
            >
              {ui.enableAll}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || switchable.every(plugin => !plugin.enabled)}
              onClick={() => setAll(() => false)}
            >
              {ui.disableAll}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || switchable.length === 0}
              onClick={() => setAll(plugin => !plugin.enabled)}
            >
              {ui.invertEnabled}
            </Button>
          </div>
        </div>
      </SpotlightCard>

      <fieldset disabled={busy} className="m-0 border-0 p-0">
        <SpotlightCard className="divide-y divide-[var(--color-line)]/70 p-2 sm:p-3">
          {shown.map(plugin => {
            const pkg = packages.find(item => item.ID === plugin.plugin_id);
            const disabled = !pkg?.Enabled;
            const valid = Object.keys(plugin.overrides).filter(
              path => !plugin.invalid.some(invalid => invalid.path === path),
            );
            return (
              <div
                key={plugin.plugin_id}
                className={cn(
                  'flex flex-col gap-3 rounded-xl px-3 py-3.5 transition-colors hover:bg-[var(--color-surface-2)]/50 sm:flex-row sm:items-center sm:justify-between',
                  disabled && 'opacity-65',
                )}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)]">
                    <img
                      src={packageIconURL(plugin.plugin_id)}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={e => {
                        e.currentTarget.style.display = 'none';
                        const fallback = e.currentTarget.nextElementSibling;
                        if (fallback instanceof HTMLElement) fallback.style.display = 'flex';
                      }}
                    />
                    <span className="hidden items-center justify-center text-[var(--color-ink-muted)]">
                      <PackageIcon size={18} />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-[var(--color-ink)]">
                        {pkg?.Name || plugin.plugin_id}
                      </span>
                      <span className="font-mono text-[11px] text-[var(--color-ink-muted)]">{plugin.plugin_id}</span>
                    </div>
                    <p className="text-xs text-[var(--color-ink-muted)]">
                      {disabled
                        ? ui.pluginDisabled
                        : valid.length > 0
                          ? ui.overrideItemCount
                              .replace('{count}', String(valid.length))
                              .replace('{items}', valid.map(path => fieldLabel(plugin.plugin_id, path)).join(', '))
                          : ui.followDefault}
                    </p>
                    {plugin.invalid.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--color-warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] px-2.5 py-1.5 text-xs text-[var(--color-warning-ink)]">
                        <AlertTriangle size={13} aria-hidden="true" />
                        <span className="flex flex-wrap gap-x-2 gap-y-1">
                          {plugin.invalid.map(invalid => (
                            <span key={invalid.path}>
                              <code className="font-mono">{invalid.path}</code>: {invalid.reason}
                            </span>
                          ))}
                        </span>
                        <Button
                          size="sm"
                          variant="soft"
                          onClick={() => void mutate(() => pruneProfilePlugin(profileID, plugin.plugin_id))}
                        >
                          {ui.pruneOverrides}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5">
                  <Switch
                    aria-label={`${ui.actionEnable} ${plugin.plugin_id}`}
                    checked={plugin.enabled}
                    onCheckedChange={checked =>
                      void mutate(() => patchProfilePlugin(profileID, plugin.plugin_id, { enabled: checked }))
                    }
                    disabled={disabled}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    disabled={disabled}
                    aria-label={ui.pluginConfigAction.replace('{plugin}', plugin.plugin_id)}
                    onClick={() =>
                      navigate(
                        `/components/${encodeURIComponent(plugin.plugin_id)}?tab=config&profile=${encodeURIComponent(profileID)}`,
                      )
                    }
                  >
                    <ChevronRight size={17} />
                  </Button>
                </div>
              </div>
            );
          })}
          {shown.length === 0 && (
            <p className="py-10 text-center text-sm text-[var(--color-ink-muted)]">{ui.noEntries}</p>
          )}
        </SpotlightCard>
      </fieldset>
    </div>
  );
}
