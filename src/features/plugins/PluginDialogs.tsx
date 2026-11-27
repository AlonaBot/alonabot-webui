import { useState, type JSX } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileUp, GitBranch, Hammer, ScrollText } from 'lucide-react';
import { getPluginRuntime, type Package } from '../../api/packages';
import { ReleasePreview } from '../../components/ChangelogDialog';
import { useUI } from '../../i18n/UI';
import { repository } from '../../pages/versions';
import { navigate } from '../../shell/router';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Dialog } from '../../ui/Dialog';
import { FileDrop } from '../../ui/FileDrop';
import { RadioGroup } from '../../ui/RadioGroup';
import { TabBar } from '../../ui/Tabs';
import { packageName, type InstallInput } from './usePackageActions';

export type InstallMode = 'repo' | 'build' | 'upload';

/** 手动安装对话框：GitHub Release / 源码构建 / 上传压缩包。 */
export function InstallDialog({
  initialMode,
  onClose,
  onInstall,
}: {
  initialMode: InstallMode;
  onClose: () => void;
  onInstall: (input: InstallInput, onLog?: (log: string) => void) => Promise<boolean>;
}): JSX.Element {
  const ui = useUI();
  const [mode, setMode] = useState<InstallMode>(initialMode);
  const [log, setLog] = useState('');
  const [source, setSource] = useState('');
  const [ref, setRef] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [replace, setReplace] = useState(false);
  const [pending, setPending] = useState(false);
  const repo = repository(source.trim());
  const ready = mode === 'upload' ? file !== null : repo !== null;

  const submit = async (): Promise<void> => {
    if (mode === 'upload' && !file) return;
    if (mode !== 'upload' && !repo) return;
    setPending(true);
    const input: InstallInput =
      mode === 'upload' && file
        ? { archive: file, replace }
        : { Source: repo ?? '', Replace: replace, ...(mode === 'build' ? { Build: true, ...(ref.trim() ? { Ref: ref.trim() } : {}) } : {}) };
    setLog('');
    const done = await onInstall(input, setLog);
    setPending(false);
    if (done) onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={open => { if (!open && !pending) onClose(); }}
      title={ui.manualInstall}
      dismissible={!pending}
      size={mode === 'build' && log ? 'lg' : 'md'}
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            {ui.cancel}
          </Button>
          <Button variant="primary" loading={pending} disabled={!ready} onClick={() => void submit()}>
            {mode === 'build' ? ui.buildAndInstall : ui.actionInstall}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 py-1">
        <TabBar
          variant="pill"
          value={mode}
          onValueChange={value => setMode(value as InstallMode)}
          items={[
            { value: 'repo', label: <><GitBranch size={13} aria-hidden="true" /> {ui.installFromRepo}</> },
            { value: 'build', label: <><Hammer size={13} aria-hidden="true" /> {ui.installFromSource}</> },
            { value: 'upload', label: <><FileUp size={13} aria-hidden="true" /> {ui.uploadInstall}</> },
          ]}
        />

        {mode === 'upload' ? (
          <FileDrop file={file} onFileChange={setFile} accept=".tar.gz,.tgz" hint={ui.archiveHint} disabled={pending} />
        ) : (
          <div className="flex flex-col gap-3.5">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--color-ink)]">
              <span>{ui.githubRepository}</span>
              <input
                className="alona-input font-mono"
                value={source}
                onChange={event => setSource(event.target.value)}
                placeholder="owner/repo"
                spellCheck={false}
                disabled={pending}
                aria-invalid={source.trim() !== '' && repo === null ? true : undefined}
              />
              <small className={source.trim() !== '' && repo === null ? 'font-normal text-[var(--color-danger)]' : 'font-normal text-[var(--color-ink-muted)]'}>
                {source.trim() !== '' && repo === null ? ui.repositoryInvalid : mode === 'build' ? ui.installFromSourceHint : ui.installFromRepoHint}
              </small>
            </label>
            {mode === 'build' && (
              <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)]/70 p-3 text-xs text-[var(--color-ink-muted)]">
                <p>{ui.sourceBuildRequirements}</p>
                <button
                  type="button"
                  className="mt-1 font-semibold text-[var(--color-accent)] hover:underline"
                  onClick={() => {
                    onClose();
                    navigate('/settings');
                  }}
                >
                  {ui.sourceBuildSettingsLink}
                </button>
              </div>
            )}
            {mode === 'build' && (
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--color-ink)]">
                <span>{ui.sourceRef}</span>
                <input
                  className="alona-input font-mono"
                  value={ref}
                  onChange={event => setRef(event.target.value)}
                  placeholder={ui.sourceRefPlaceholder}
                  spellCheck={false}
                  disabled={pending}
                />
              </label>
            )}
          </div>
        )}

        <Checkbox checked={replace} onCheckedChange={setReplace} label={ui.replaceConflict} description={ui.replaceConflictHint} disabled={pending} />
        {pending && mode === 'build' && (
          <p className="text-xs text-[var(--color-accent)]" role="status">
            {ui.buildInProgress}
          </p>
        )}
        {mode === 'build' && log && <BuildLog text={log} />}
      </div>
    </Dialog>
  );
}

function BuildLog({ text }: { text: string }): JSX.Element {
  return (
    <pre
      ref={node => {
        if (node) node.scrollTop = node.scrollHeight;
      }}
      aria-live="polite"
      className="max-h-56 overflow-auto rounded-xl border border-[var(--color-console-line)] bg-[var(--color-console-bg)] p-3 font-mono text-[11px] whitespace-pre-wrap text-[var(--color-console-text)]"
    >
      {text}
    </pre>
  );
}

/** 更新对话框。 */
export function UpdateDialog({
  pkg,
  onClose,
  onUpdate,
}: {
  pkg: Package;
  onClose: () => void;
  onUpdate: (archive?: File) => Promise<boolean>;
}): JSX.Element {
  const ui = useUI();
  const repo = repository(pkg.Source);
  const [mode, setMode] = useState<'source' | 'upload'>(repo ? 'source' : 'upload');
  const [file, setFile] = useState<File | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = async (): Promise<void> => {
    setPending(true);
    const done = await onUpdate(mode === 'upload' ? (file ?? undefined) : undefined);
    setPending(false);
    if (done) onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={open => { if (!open && !pending) onClose(); }}
      title={`${ui.updatePackageTitle} · ${packageName(pkg)}`}
      size="lg"
      dismissible={!pending}
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            {ui.cancel}
          </Button>
          <Button variant="primary" loading={pending} disabled={mode === 'upload' ? !file : !ready} onClick={() => void submit()}>
            {ui.actionUpdate}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 py-1">
        {repo && (
          <TabBar
            variant="pill"
            value={mode}
            onValueChange={value => setMode(value as 'source' | 'upload')}
            items={[
              { value: 'source', label: ui.updateFromSource },
              { value: 'upload', label: ui.updateUpload },
            ]}
          />
        )}
        {mode === 'source' && repo ? (
          <div className="max-h-[45dvh] overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)]/50 p-4">
            <ReleasePreview repo={repo} onLoaded={() => setReady(true)} />
          </div>
        ) : (
          <FileDrop file={file} onFileChange={setFile} accept=".tar.gz,.tgz" hint={ui.archiveHint} disabled={pending} />
        )}
      </div>
    </Dialog>
  );
}

/** 卸载对话框。 */
export function UninstallDialog({
  pkg,
  onClose,
  onUninstall,
}: {
  pkg: Package;
  onClose: () => void;
  onUninstall: (purge: 0 | 1 | 2) => Promise<boolean>;
}): JSX.Element {
  const ui = useUI();
  const [purge, setPurge] = useState<'0' | '1' | '2'>('0');
  const [pending, setPending] = useState(false);

  const submit = async (): Promise<void> => {
    setPending(true);
    const done = await onUninstall(Number(purge) as 0 | 1 | 2);
    setPending(false);
    if (done) onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={open => { if (!open && !pending) onClose(); }}
      title={ui.uninstallTitle}
      size="sm"
      dismissible={!pending}
      description={ui.uninstallDesc.replace('{id}', packageName(pkg))}
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            {ui.cancel}
          </Button>
          <Button variant="danger" loading={pending} onClick={() => void submit()}>
            {ui.actionUninstall}
          </Button>
        </>
      }
    >
      <RadioGroup
        value={purge}
        onValueChange={value => setPurge(value as '0' | '1' | '2')}
        aria-label={ui.uninstallTitle}
        options={[
          { value: '0', label: ui.purge0, description: ui.purge0Hint },
          { value: '1', label: ui.purge1, description: ui.purge1Hint },
          { value: '2', label: ui.purge2, description: ui.purge2Hint },
        ]}
      />
    </Dialog>
  );
}

/** 故障原因诊断对话框。 */
export function ReasonDialog({
  pkg,
  onClose,
  onRestart,
}: {
  pkg: Package;
  onClose: () => void;
  onRestart: () => void;
}): JSX.Element {
  const ui = useUI();
  const runtime = useQuery({
    queryKey: ['runtime', pkg.ID],
    queryFn: () => getPluginRuntime(pkg.ID),
    enabled: pkg.Role === 'plugin' || pkg.Role === 'agent',
  });
  const reason = runtime.data?.reason;

  return (
    <Dialog
      open
      onOpenChange={open => { if (!open) onClose(); }}
      title={`${packageName(pkg)} · ${ui.viewReason}`}
      size="sm"
      footer={
        <>
          <Button
            icon={<ScrollText size={15} />}
            onClick={() => {
              onClose();
              navigate(`/logs?source=${encodeURIComponent(pkg.ID)}`);
            }}
          >
            {ui.viewLogs}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onClose();
              onRestart();
            }}
          >
            {ui.actionRestart}
          </Button>
        </>
      }
    >
      <dl className="grid grid-cols-[92px_minmax(0,1fr)] gap-y-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)]/60 p-3.5 text-xs">
        <dt className="text-[var(--color-ink-muted)]">{ui.instanceState}</dt>
        <dd className="font-medium text-[var(--color-ink)]">{runtime.data ? ui[`runtime${runtime.data.state}`] : pkg.State}</dd>
        {reason && (
          <>
            <dt className="text-[var(--color-ink-muted)]">{ui.runtimeReason}</dt>
            <dd className="break-words font-mono text-[var(--color-danger)]">{reason}</dd>
          </>
        )}
        {runtime.data?.changed_at && (
          <>
            <dt className="text-[var(--color-ink-muted)]">{ui.runtimeChangedAt}</dt>
            <dd className="tabular-nums font-mono text-[var(--color-ink)]">{new Date(runtime.data.changed_at).toLocaleString()}</dd>
          </>
        )}
        <dt className="text-[var(--color-ink-muted)]">{ui.version}</dt>
        <dd className="font-mono text-[var(--color-ink)]">{pkg.Version}</dd>
        {pkg.Source && (
          <>
            <dt className="text-[var(--color-ink-muted)]">{ui.sourceLabel}</dt>
            <dd className="truncate font-mono text-[var(--color-ink)]">{pkg.Source}</dd>
          </>
        )}
      </dl>
    </Dialog>
  );
}
