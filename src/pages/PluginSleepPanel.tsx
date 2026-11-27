import { useId, useState, type JSX } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, LockKeyhole } from 'lucide-react';
import type { PluginRuntime, SleepPolicy } from '../api/packages';
import { useUI } from '../i18n/UI';
import { Link } from '../shell/router';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/EmptyState';
import { Select } from '../ui/Select';
import { toast } from '../ui/toast';

type Messages = ReturnType<typeof useUI>;

function reasonText(reason: string, ui: Messages): string {
  const known: Record<string, string> = {
    always_on: ui.sleepReasonAlwaysOn,
    manifest_requires_resident: ui.sleepReasonManifest,
    in_process: ui.sleepReasonInProcess,
    policy_never: ui.sleepReasonNever,
    route_requires_resident: ui.sleepReasonRoutes,
    starting: ui.runtimeReasonStarting,
    activated: ui.runtimeReasonActivated,
    resume: ui.runtimeReasonResume,
    idle: ui.runtimeReasonIdle,
    installed: ui.runtimeReasonInstalled,
    uninstalled: ui.runtimeReasonUninstalled,
    'core startup': ui.runtimeReasonCoreStartup,
    STOP_REASON_DISABLE: ui.runtimeReasonDisable,
    STOP_REASON_RESTART: ui.runtimeReasonRestart,
    STOP_REASON_RELOAD: ui.runtimeReasonReload,
    STOP_REASON_UPDATE: ui.runtimeReasonUpdate,
    STOP_REASON_CORE_SHUTDOWN: ui.runtimeReasonCoreShutdown,
    STOP_REASON_IDLE: ui.runtimeReasonIdle,
  };
  return Object.hasOwn(known, reason) ? known[reason] : reason;
}

function warningText(warning: string, ui: Messages): string {
  const match =
    /^route (.+): (HTTP|Hook|Bus subscription|Raw|unfiltered message event|continuous event listener) may cause frequent wakeups$/.exec(
      warning,
    );
  if (!match) return warning;
  const kinds: Record<string, string> = {
    HTTP: ui.sleepWarningHTTP,
    Hook: ui.sleepWarningHook,
    'Bus subscription': ui.sleepWarningBus,
    Raw: ui.sleepWarningRaw,
    'unfiltered message event': ui.sleepWarningMessage,
    'continuous event listener': ui.sleepWarningListener,
  };
  return ui.sleepWarning.replace(/\{route\}|\{kind\}/g, token => (token === '{route}' ? match[1] : kinds[match[2]]));
}

/** PluginSleepPanel 编辑休眠覆盖，分别展示已读取策略、运行记录与保存错误。 */
export function PluginSleepPanel({
  policy,
  runtime,
  policyError,
  runtimeError,
  writeError,
  loading,
  busy,
  onSubmit,
}: {
  policy: SleepPolicy | null;
  runtime: PluginRuntime | null;
  policyError: string | null;
  runtimeError: string | null;
  writeError: string | null;
  loading: boolean;
  busy: boolean;
  onSubmit: (policy: string | null) => Promise<boolean>;
}): JSX.Element {
  const ui = useUI();
  const fieldID = useId();
  const [draft, setDraft] = useState<string | null | undefined>(undefined);
  const value = draft === undefined ? (policy?.policy ?? null) : draft;
  const mode = value === null ? 'auto' : value === 'never' ? 'never' : 'duration';
  const locked =
    policy !== null &&
    (!policy.sleep_capable || policy.reason === 'manifest_requires_resident' || policy.reason === 'in_process');
  const policyText = (next: string | null): string =>
    next === null ? ui.sleepFollowGlobal : next === 'never' ? ui.sleepNever : next;

  return (
    <div className="space-y-4">
      {writeError && (
        <pre className="form-error mb-0 whitespace-pre-wrap break-words" role="alert">
          {writeError}
        </pre>
      )}
      {policyError && (
        <div className="form-error mb-0 flex-col gap-1" role="alert">
          <strong>{ui.sleepPolicy}</strong>
          <pre className="m-0 whitespace-pre-wrap break-words font-mono text-xs">{policyError}</pre>
        </div>
      )}
      {loading && <Skeleton height={110} />}

      {policy && (
        <form
          className="space-y-4"
          onSubmit={async event => {
            event.preventDefault();
            if (await onSubmit(value)) {
              setDraft(undefined);
              toast.success(ui.saveSuccess);
            }
          }}
        >
          <fieldset disabled={busy || loading || policyError !== null} className="m-0 space-y-4 border-0 p-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="min-w-0 flex-1 space-y-1">
                <label htmlFor={fieldID} className="block text-sm font-medium text-[var(--color-ink)]">
                  {ui.sleepPolicy}
                </label>
                <p id={`${fieldID}-reason`} className="text-xs leading-relaxed text-[var(--color-ink-muted)]">
                  {policy.reason ? reasonText(policy.reason, ui) : ui.sleepPolicyDesc}
                </p>
                {policy.reason === 'always_on' && (
                  <Link
                    to="/settings"
                    className="inline-flex items-center gap-1 pt-0.5 text-xs font-medium text-[var(--color-accent)] transition-colors hover:text-[var(--color-accent-strong)]"
                  >
                    <span>{ui.sleepSettings}</span>
                    <ExternalLink size={12} aria-hidden="true" />
                  </Link>
                )}
              </div>

              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                <div className="flex items-center gap-2">
                  {locked && <LockKeyhole size={14} className="shrink-0 text-[var(--color-ink-muted)]" aria-hidden="true" />}
                  <Select
                    id={fieldID}
                    variant="filled"
                    aria-label={ui.sleepPolicy}
                    value={mode}
                    className="w-full min-w-[180px] sm:w-[210px]"
                    options={[
                      { value: 'auto', label: ui.sleepFollowGlobal },
                      { value: 'never', label: ui.sleepNever },
                      { value: 'duration', label: ui.sleepDuration, disabled: locked },
                    ]}
                    onValueChange={nextMode => {
                      setDraft(
                        nextMode === 'auto'
                          ? null
                          : nextMode === 'never'
                            ? 'never'
                            : policy.policy !== null && policy.policy !== 'never'
                              ? policy.policy
                              : policy.effective_policy !== 'never'
                                ? policy.effective_policy
                                : '',
                      );
                    }}
                  />
                </div>

                {mode === 'duration' && (
                  <label className="space-y-1 text-xs text-[var(--color-ink-muted)] sm:w-[210px]">
                    <span className="sr-only">{ui.sleepDuration}</span>
                    <input
                      required
                      aria-describedby={`${fieldID}-duration-hint`}
                      disabled={locked}
                      value={value ?? ''}
                      onChange={event => setDraft(event.target.value)}
                      placeholder="15m"
                      className="h-9 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 font-mono text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
                    />
                    <span id={`${fieldID}-duration-hint`} className="block text-[11px] leading-snug">
                      {ui.sleepDurationHint}
                    </span>
                  </label>
                )}
              </div>
            </div>

            {draft !== undefined && (
              <div className="flex items-center justify-end gap-2 border-t border-[var(--color-line)]/70 pt-3">
                <Button size="sm" variant="secondary" onClick={() => setDraft(undefined)}>
                  {ui.discard}
                </Button>
                <Button type="submit" size="sm" variant="primary" loading={busy}>
                  {ui.save}
                </Button>
              </div>
            )}
          </fieldset>

          {/* 策略与运行状态摘要卡片网格 */}
          <dl className="m-0 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {draft !== undefined && (
              <div className="rounded-xl border border-[var(--color-line)]/70 bg-[var(--color-surface-2)]/55 px-3.5 py-2.5">
                <dt className="text-[11px] font-medium text-[var(--color-ink-muted)]">{ui.sleepSavedPolicy}</dt>
                <dd className="m-0 mt-1 font-mono text-sm font-semibold text-[var(--color-ink)]">
                  {policyText(policy.policy)}
                </dd>
              </div>
            )}
            <div className="rounded-xl border border-[var(--color-line)]/70 bg-[var(--color-surface-2)]/55 px-3.5 py-2.5">
              <dt className="text-[11px] font-medium text-[var(--color-ink-muted)]">{ui.sleepEffectivePolicy}</dt>
              <dd className="m-0 mt-1 font-mono text-sm font-semibold text-[var(--color-ink)]">
                {policyText(policy.effective_policy)}
              </dd>
            </div>
            {runtime && (
              <div className="rounded-xl border border-[var(--color-line)]/70 bg-[var(--color-surface-2)]/55 px-3.5 py-2.5">
                <dt className="text-[11px] font-medium text-[var(--color-ink-muted)]">{ui.runtimeStatus}</dt>
                <dd className="m-0 mt-1 text-sm font-semibold text-[var(--color-ink)]">
                  {ui[`runtime${runtime.state}`]}
                </dd>
              </div>
            )}
          </dl>

          {policy.eligible && (
            <p className="m-0 inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] px-3 py-1 text-xs font-medium text-[var(--color-success)]">
              <CheckCircle2 size={13} aria-hidden="true" />
              <span>{ui.sleepEligible}</span>
            </p>
          )}

          {policy.warnings && policy.warnings.length > 0 && (
            <ul className="m-0 space-y-1.5 rounded-xl border border-[color-mix(in_srgb,var(--color-warning)_32%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] px-3.5 py-2.5 text-xs text-[var(--color-warning-ink)]">
              {policy.warnings.map((warning, index) => (
                <li key={index} className="flex items-start gap-2">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{warningText(warning, ui)}</span>
                </li>
              ))}
            </ul>
          )}
        </form>
      )}

      {runtimeError && (
        <div className="form-error mb-0 flex-col gap-1" role="alert">
          <strong>{ui.runtimeStatus}</strong>
          <pre className="m-0 whitespace-pre-wrap break-words font-mono text-xs">{runtimeError}</pre>
        </div>
      )}

      {!policy && runtime && (
        <dl className="m-0 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--color-line)]/70 bg-[var(--color-surface-2)]/55 px-3.5 py-2.5">
            <dt className="text-[11px] font-medium text-[var(--color-ink-muted)]">{ui.runtimeStatus}</dt>
            <dd className="m-0 mt-1 text-sm font-semibold text-[var(--color-ink)]">
              {ui[`runtime${runtime.state}`]}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}
