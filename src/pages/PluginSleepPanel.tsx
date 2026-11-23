import { useId, useState, type JSX } from 'react';
import { OptionSelect } from '../ui/NativeAdapters';
import { Skeleton } from '../ui/EmptyState';
import { LockKeyhole } from 'lucide-react';
import type { PluginRuntime, SleepPolicy } from '../api/packages';
import { useUI } from '../i18n/UI';
import { Link } from '../shell/router';
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
  const match = /^route (.+): (HTTP|Hook|Bus subscription|Raw|unfiltered message event|continuous event listener) may cause frequent wakeups$/.exec(warning);
  if (!match) return warning;
  const kinds: Record<string, string> = { HTTP: ui.sleepWarningHTTP, Hook: ui.sleepWarningHook, 'Bus subscription': ui.sleepWarningBus, Raw: ui.sleepWarningRaw, 'unfiltered message event': ui.sleepWarningMessage, 'continuous event listener': ui.sleepWarningListener };
  return ui.sleepWarning.replace(/\{route\}|\{kind\}/g, token => token === '{route}' ? match[1] : kinds[match[2]]);
}

/** PluginSleepPanel 编辑休眠覆盖，分别展示已读取策略、运行记录与保存错误。 */
export function PluginSleepPanel({ policy, runtime, policyError, runtimeError, writeError, loading, busy, onSubmit }: {
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
  const value = draft === undefined ? policy?.policy : draft;
  const mode = value === null ? 'auto' : value === 'never' ? 'never' : 'duration';
  const locked = policy !== null && (!policy.sleep_capable || policy.reason === 'manifest_requires_resident' || policy.reason === 'in_process');
  const policyText = (value: string | null) => value === null ? ui.sleepFollowGlobal : value === 'never' ? ui.sleepNever : value;

  return <div className="plugin-sleep-panel">
    {writeError && <pre className="sleep-error plugins-error-banner" role="alert">{writeError}</pre>}
    {policyError && <div className="sleep-error plugins-error-banner" role="alert"><strong>{ui.sleepPolicy}</strong><pre>{policyError}</pre></div>}
    {loading && <Skeleton height={120} />}
    {policy && <form onSubmit={async event => {
      event.preventDefault();
      if (await onSubmit(value!)) { setDraft(undefined); toast.success(ui.saveSuccess); }
    }}>
      <fieldset className="config-edit-fields" disabled={busy || loading || policyError !== null}>
        <div className="settings-row sleep-policy-row">
          <div className="settings-label-col"><label htmlFor={fieldID}>{ui.sleepPolicy}</label><p id={fieldID + '-reason'}>{policy.reason ? reasonText(policy.reason, ui) : ui.sleepPolicyDesc}</p>
            {policy.reason === 'always_on' && <Link to="/settings">{ui.sleepSettings}</Link>}
          </div>
          <div className="sleep-policy-controls">
            <div className="sleep-policy-select">{locked && <LockKeyhole size={14} aria-hidden="true" />}<OptionSelect id={fieldID} aria-describedby={fieldID + '-reason'} value={mode} onChange={event => {
             
              setDraft(event.target.value === 'auto' ? null : event.target.value === 'never' ? 'never' : policy.policy !== null && policy.policy !== 'never' ? policy.policy : policy.effective_policy !== 'never' ? policy.effective_policy : '');
            }}>
              <option value="auto">{ui.sleepFollowGlobal}</option><option value="never">{ui.sleepNever}</option><option value="duration" disabled={locked}>{ui.sleepDuration}</option>
            </OptionSelect></div>
            {mode === 'duration' && <label className="sleep-duration-field">{ui.sleepDuration}<input required aria-describedby={fieldID + '-duration-hint'} disabled={locked} value={value ?? ''} onChange={event => { setDraft(event.target.value); }} /><span id={fieldID + '-duration-hint'}>{ui.sleepDurationHint}</span></label>}
          </div>
        </div>
        {draft !== undefined && <div className="sleep-form-actions"><button type="button" onClick={() => { setDraft(undefined); }}>{ui.discard}</button><button type="submit" className="save-button">{ui.save}</button></div>}
      </fieldset>
      <dl className="sleep-policy-summary">
        {draft !== undefined && <div><dt>{ui.sleepSavedPolicy}</dt><dd>{policyText(policy.policy)}</dd></div>}
        <div><dt>{ui.sleepEffectivePolicy}</dt><dd>{policyText(policy.effective_policy)}</dd></div>
      </dl>
      {policy.eligible && <p className="sleep-eligible">{ui.sleepEligible}</p>}
      {policy.warnings && policy.warnings.length > 0 && <ul className="sleep-warnings">{policy.warnings.map((warning, index) => <li key={index}>{warningText(warning, ui)}</li>)}</ul>}
    </form>}
    {runtimeError && <div className="sleep-error plugins-error-banner" role="alert"><strong>{ui.runtimeStatus}</strong><pre>{runtimeError}</pre></div>}
    {runtime && <dl className="sleep-runtime-records">
      <div><dt>{ui.runtimeStatus}</dt><dd>{ui[`runtime${runtime.state}`]}</dd></div>
    </dl>}
  </div>;
}
