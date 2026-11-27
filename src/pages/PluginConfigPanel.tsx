import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { AdminAPIError } from '../api/client';
import {
  discardPluginConfig,
  encodeSecretPath,
  getPluginConfig,
  listConfigOptions,
  patchPluginConfig,
  prunePluginConfig,
  resolveConfigOptions,
  revealPluginSecret,
  type ConfigSnapshot,
} from '../api/config';
import { getDefaultPlatform } from '../api/core';
import { changePackage, listPackages, pluginExampleURL, type Package } from '../api/packages';
import {
  getProfilePlugins,
  listProfiles,
  patchProfilePlugin,
  pruneProfilePlugin,
  type Profile,
  type ProfilePlugin,
} from '../api/profiles';
import { ConfigForm, type ConfigFormProps } from '../components/ConfigForm';
import { useUI } from '../i18n/UI';
import { pickLocale } from '../i18n/catalog';
import { navigate } from '../shell/router';
import { useUISettings } from '../shell/settings';
import { Button } from '../ui/Button';
import { Dialog as SharedDialog } from '../ui/Dialog';
import { LoadingRows } from '../ui/EmptyState';
import { Select } from '../ui/Select';
import { toast } from '../ui/toast';
import {
  applyMergePatch,
  applyProfileOverrides,
  editableProfilePaths,
  extractProfileOverrides,
} from './pluginConfig';

export function PluginConfigPanel({ id }: { id: string }): JSX.Element {
  const ui = useUI();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileID, setProfileID] = useState(
    () => new URLSearchParams(window.location.search).get('profile') || 'default',
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sync = (): void => setProfileID(new URLSearchParams(window.location.search).get('profile') || 'default');
    window.addEventListener('popstate', sync);
    listProfiles()
      .then(setProfiles)
      .catch(err => setError(err instanceof Error ? err.message : String(err)));
    return () => window.removeEventListener('popstate', sync);
  }, []);

  return (
    <div className="space-y-4">
      {error && (
        <p className="plugins-error-banner" role="alert">
          {error}
        </p>
      )}
      {profiles.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--color-glass-border)] bg-[var(--color-glass-surface)] px-4 py-3 backdrop-blur-md">
          <span className="text-xs font-semibold text-[var(--color-ink-muted)]">{ui.profile}</span>
          <Select
            variant="filled"
            size="sm"
            aria-label={ui.profile}
            value={profileID}
            options={profiles.map(profile => ({ value: profile.id, label: profile.name }))}
            onValueChange={next => {
              const url = new URL(window.location.href);
              url.searchParams.set('profile', next);
              url.searchParams.set('tab', 'config');
              navigate(url.pathname + url.search);
            }}
          />
        </div>
      )}
      <ProfileConfigEditor key={`${id}:${profileID}`} id={id} profileID={profileID} />
    </div>
  );
}

export function ProfileConfigEditor({
  id,
  profileID,
  renderForm,
  onChanged,
}: {
  id: string;
  profileID: string;
  renderForm?: (form: ConfigFormProps, snapshot: ConfigSnapshot) => JSX.Element;
  onChanged?: () => void;
}): JSX.Element {
  const ui = useUI();
  const { locale } = useUISettings();
  const [snapshot, setSnapshot] = useState<ConfigSnapshot | null>(null);
  const [latest, setLatest] = useState<ConfigSnapshot | null>(null);
  const [prefix, setPrefix] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmation, setConfirmation] = useState<'prune' | 'discard' | 'reload' | null>(null);
  const [profilePlugin, setProfilePlugin] = useState<ProfilePlugin | null>(null);
  const isDefault = profileID === 'default';
  const [runtime, setRuntime] = useState<Package | null>(null);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthToken, setReauthToken] = useState('');
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const pendingReveal = useRef<{ path: string[]; resolve: (value: string) => void; reject: (error: Error) => void } | null>(null);

  const load = useCallback(async () => {
    const [value, plugins] = await Promise.all([
      getPluginConfig(id),
      isDefault ? Promise.resolve([]) : getProfilePlugins(profileID),
    ]);
    setProfilePlugin(plugins.find(plugin => plugin.plugin_id === id) ?? null);
    setSnapshot(value);
    setLatest(null);
  }, [id, profileID, isDefault]);

  useEffect(() => {
    let active = true;
    Promise.all([
      getPluginConfig(id),
      getDefaultPlatform(),
      isDefault ? Promise.resolve([]) : getProfilePlugins(profileID),
    ])
      .then(([value, platform, plugins]) => {
        if (active) {
          setSnapshot(value);
          setPrefix(platform.command_prefixes[0] ?? '/');
          setProfilePlugin(plugins.find(plugin => plugin.plugin_id === id) ?? null);
        }
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      pendingReveal.current?.reject(new DOMException('cancelled', 'AbortError'));
      pendingReveal.current = null;
    };
  }, [id, profileID, isDefault]);

  const mutate = async (action: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      toast.success(ui.saveSuccess);
    } catch (err) {
      let message = err instanceof Error ? err.message : String(err);
      try {
        await load();
      } catch (readError) {
        message += '\n' + (readError instanceof Error ? readError.message : String(readError));
      }
      toast.error(message);
    } finally {
      setBusy(false);
      onChanged?.();
    }
  };

  const reload = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const errors: string[] = [];
    try {
      await changePackage('reload', id);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
    try {
      await load();
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
    try {
      setRuntime((await listPackages()).find(value => value.ID === id) ?? null);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
    if (errors.length) toast.error(errors.join('\n'));
    setBusy(false);
  };

  const options = useMemo(
    () => ({
      list: (path: string, q: string) => listConfigOptions(id, path, q, locale),
      resolve: (path: string, values: string[]) => resolveConfigOptions(id, path, values, locale),
    }),
    [id, locale],
  );
  const messages = useMemo(
    () => ({ config: snapshot?.i18n[pickLocale(Object.keys(snapshot.i18n), [locale])] ?? {} }),
    [snapshot, locale],
  );
  const value = useMemo(
    () =>
      snapshot
        ? isDefault
          ? snapshot.pending?.config ?? snapshot.active
          : applyProfileOverrides(
              snapshot.active,
              profilePlugin?.overrides ?? {},
              profilePlugin?.invalid.map(entry => entry.path) ?? [],
            )
        : {},
    [snapshot, isDefault, profilePlugin],
  );
  const editablePaths = useMemo(
    () => (isDefault ? undefined : editableProfilePaths(snapshot?.schema, profilePlugin?.fields ?? [])),
    [snapshot?.schema, profilePlugin, isDefault],
  );

  const submit = async (patch: Record<string, unknown>): Promise<void> => {
    if (!snapshot) return;
    setBusy(true);
    setError(null);
    try {
      if (isDefault) {
        await patchPluginConfig(id, snapshot.active_generation, patch);
      } else if (editablePaths) {
        await patchProfilePlugin(profileID, id, {
          overrides: extractProfileOverrides(
            applyMergePatch(value, patch) as Record<string, unknown>,
            patch,
            editablePaths,
          ),
        });
      }
      await load();
      toast.success(ui.saveSuccess);
      onChanged?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
      if (isDefault && err instanceof AdminAPIError && err.status === 409 && err.code === 'FAILED_PRECONDITION') {
        try {
          setLatest(await getPluginConfig(id));
        } catch (refreshError) {
          toast.error(`${message}\n${refreshError instanceof Error ? refreshError.message : String(refreshError)}`);
        }
      } else {
        try {
          await load();
          onChanged?.();
        } catch (readError) {
          toast.error(`${message}\n${readError instanceof Error ? readError.message : String(readError)}`);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const reveal = (path: string[]): Promise<string> =>
    new Promise((resolve, reject) => {
      pendingReveal.current = { path, resolve, reject };
      setReauthToken('');
      setReauthError(null);
      setReauthOpen(true);
    });

  const closeReauth = (): void => {
    pendingReveal.current?.reject(new DOMException('cancelled', 'AbortError'));
    pendingReveal.current = null;
    setReauthToken('');
    setReauthError(null);
    setReauthOpen(false);
  };

  const form: ConfigFormProps | null = snapshot
    ? {
        schema: snapshot.schema,
        value,
        messages,
        options,
        editablePaths,
        exampleImageURL: image => pluginExampleURL(id, image),
        commandPrefix: prefix,
        onReveal: isDefault ? reveal : undefined,
        onSubmit: patch => void submit(patch),
      }
    : null;

  return (
    <div className="space-y-4">
      {error && (
        <p className="plugins-error-banner" role="alert">
          {error}
        </p>
      )}
      {runtime && (
        <p
          role="status"
          className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3.5 py-2 text-xs text-[var(--color-ink-muted)]"
        >
          {runtime.State}
          {runtime.Warnings?.length ? `: ${runtime.Warnings.join('; ')}` : ''}
        </p>
      )}

      {loading ? (
        <LoadingRows />
      ) : snapshot?.schema == null ? (
        <p className="text-sm text-[var(--color-ink-muted)]">{snapshot ? ui.noConfig : ''}</p>
      ) : (
        <>
          {latest && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--color-warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_10%,var(--color-surface))] px-4 py-3 text-xs text-[var(--color-warning-ink)]">
              <span>{ui.configConflict}</span>
              <Button
                size="sm"
                variant="soft"
                onClick={() => {
                  setSnapshot(latest);
                  setLatest(null);
                }}
              >
                {ui.useLatestConfig}
              </Button>
            </div>
          )}

          {!isDefault && profilePlugin && editablePaths && profilePlugin.fields.length > editablePaths.length && (
            <p
              role="status"
              className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)]/70 px-3.5 py-2.5 text-xs text-[var(--color-ink-muted)]"
            >
              {ui.profileSecretReadonly.replace(
                '{paths}',
                profilePlugin.fields.filter(path => !editablePaths.includes(path)).join(', '),
              )}
            </p>
          )}

          {!isDefault && profilePlugin && profilePlugin.invalid.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--color-warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_10%,var(--color-surface))] px-4 py-3 text-xs text-[var(--color-warning-ink)]">
              <ul className="m-0 list-disc pl-4">
                {profilePlugin.invalid.map(entry => (
                  <li key={entry.path}>
                    <code className="font-mono">{entry.path}</code>: {entry.reason}
                  </li>
                ))}
              </ul>
              <Button
                size="sm"
                variant="soft"
                disabled={busy}
                onClick={() => void mutate(() => pruneProfilePlugin(profileID, id))}
              >
                {ui.pruneOverrides}
              </Button>
            </div>
          )}

          {isDefault && snapshot.pending && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--color-accent)_35%,transparent)] bg-[var(--color-accent-soft)] px-4 py-3 text-xs text-[var(--color-accent-strong)]">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="font-semibold">{ui.pendingConfig}</strong>
                <span>{ui.reloadToApply}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  icon={<RefreshCw size={13} />}
                  disabled={busy}
                  onClick={() => setConfirmation('reload')}
                >
                  {ui.actionReload}
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmation('discard')}>
                  {ui.discardPending}
                </Button>
              </div>
            </div>
          )}

          {isDefault && snapshot.unknown.length > 0 && (
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--color-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_10%,var(--color-surface))] px-4 py-3 text-xs text-[var(--color-danger)]">
              <div className="space-y-1">
                <strong className="inline-flex items-center gap-1.5 font-semibold">
                  <AlertTriangle size={14} aria-hidden="true" />
                  {ui.unknownKeys}
                </strong>
                <ul className="m-0 list-disc pl-4">
                  {snapshot.unknown.map(path => (
                    <li key={path}>
                      <code className="font-mono">{path}</code>
                    </li>
                  ))}
                </ul>
              </div>
              <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirmation('prune')}>
                {ui.pruneConfig}
              </Button>
            </div>
          )}

          {isDefault && snapshot.corrections.length > 0 && (
            <div className="rounded-2xl border border-[color-mix(in_srgb,var(--color-warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_10%,var(--color-surface))] px-4 py-3 text-xs text-[var(--color-warning-ink)]">
              <strong className="font-semibold">{ui.corrections}</strong>
              <ul className="mt-1 mb-0 list-disc pl-4">
                {snapshot.corrections.map((entry, index) => (
                  <li key={index}>
                    <code className="font-mono">{entry.path}</code>: {ui[entry.reason]}
                    {Object.hasOwn(entry, 'original') && (
                      <pre className="mt-1 overflow-auto rounded-lg bg-[var(--color-surface)]/80 p-2 font-mono text-[11px]">
                        {JSON.stringify(entry.original)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <fieldset disabled={busy} className="m-0 border-0 p-0">
            {form && (renderForm ? renderForm(form, snapshot) : <ConfigForm {...form} />)}
          </fieldset>
        </>
      )}

      <SharedDialog
        open={confirmation !== null}
        onOpenChange={open => {
          if (!open) setConfirmation(null);
        }}
        size="sm"
        title={
          confirmation === 'reload'
            ? ui.actionReload
            : confirmation === 'prune'
              ? ui.pruneConfig
              : ui.discardPending
        }
        description={
          confirmation === 'reload'
            ? ui.profileReloadConfirm
            : confirmation === 'prune'
              ? ui.prunePluginConfirm
              : ui.discardPendingConfirm
        }
        footer={
          <>
            <Button onClick={() => setConfirmation(null)}>{ui.cancel}</Button>
            <Button
              variant={confirmation === 'reload' ? 'primary' : 'danger'}
              onClick={() => {
                const action = confirmation;
                setConfirmation(null);
                if (action === 'reload') void reload();
                else if (action) {
                  void mutate(() => (action === 'prune' ? prunePluginConfig(id) : discardPluginConfig(id)));
                }
              }}
            >
              {ui.confirm}
            </Button>
          </>
        }
      >
        {confirmation === 'reload' && (
          <ul className="list-disc pl-5 font-mono text-xs text-[var(--color-ink-muted)]">
            <li>{id}</li>
          </ul>
        )}
        {confirmation === 'prune' && (
          <ul className="list-disc pl-5 font-mono text-xs text-[var(--color-ink-muted)]">
            {snapshot?.unknown.map(path => (
              <li key={path}>
                <code>{path}</code>
              </li>
            ))}
          </ul>
        )}
      </SharedDialog>

      <SharedDialog
        open={reauthOpen}
        onOpenChange={open => {
          if (!open) closeReauth();
        }}
        size="sm"
        title={ui.reauthTitle}
        description={ui.reauthPrompt}
        footer={
          <>
            <Button onClick={closeReauth} disabled={revealing}>
              {ui.cancel}
            </Button>
            <Button type="submit" form="reauth-secret-form" variant="primary" loading={revealing} disabled={!reauthToken}>
              {ui.confirm}
            </Button>
          </>
        }
      >
        <form
          id="reauth-secret-form"
          className="space-y-3"
          onSubmit={async event => {
            event.preventDefault();
            const request = pendingReveal.current;
            if (!request) return;
            setRevealing(true);
            setReauthError(null);
            try {
              const revealed = await revealPluginSecret(id, encodeSecretPath(request.path), reauthToken);
              if (pendingReveal.current === request) {
                request.resolve(revealed.value);
                pendingReveal.current = null;
                setReauthToken('');
                setReauthOpen(false);
              }
            } catch (err) {
              if (pendingReveal.current === request) {
                setReauthError(err instanceof Error ? err.message : String(err));
              }
            } finally {
              setRevealing(false);
            }
          }}
        >
          {reauthError && (
            <p className="form-error mb-0" role="alert">
              {reauthError}
            </p>
          )}
          <input
            type="password"
            aria-label={ui.tokenPlaceholder}
            placeholder={ui.tokenPlaceholder}
            autoComplete="off"
            value={reauthToken}
            onChange={event => setReauthToken(event.target.value)}
            className="h-10 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
          />
        </form>
      </SharedDialog>
    </div>
  );
}
