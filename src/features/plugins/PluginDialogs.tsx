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
import styles from './Plugins.module.css';

export type InstallMode = 'repo' | 'build' | 'upload';

/**
 * 手动安装：GitHub 仓库的 Release 包、从源码构建（Core 按需下载 Go 工具链）或上传安装包。
 * 仓库可填 owner/repo 或完整的 GitHub 地址；源码构建可另填分支、标签或提交。
 */
export function InstallDialog({ initialMode, onClose, onInstall }: {
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

  const submit = async () => {
    setPending(true);
    const input: InstallInput = mode === 'upload'
      ? { archive: file!, replace }
      : { Source: repo!, Replace: replace, ...(mode === 'build' ? { Build: true, ...(ref.trim() ? { Ref: ref.trim() } : {}) } : {}) };
    setLog('');
    const done = await onInstall(input, setLog);
    setPending(false);
    if (done) onClose();
  };

  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }} title={ui.manualInstall} dismissible={!pending} size={mode === 'build' && log ? 'lg' : 'md'}
    footer={<>
      <Button onClick={onClose} disabled={pending}>{ui.cancel}</Button>
      <Button variant="primary" loading={pending} disabled={!ready} onClick={() => void submit()}>{mode === 'build' ? ui.buildAndInstall : ui.actionInstall}</Button>
    </>}>
    <TabBar variant="pill" value={mode} onValueChange={value => setMode(value as InstallMode)} className={styles.modeTabs} items={[
      { value: 'repo', label: <><GitBranch size={14} aria-hidden /> {ui.installFromRepo}</> },
      { value: 'build', label: <><Hammer size={14} aria-hidden /> {ui.installFromSource}</> },
      { value: 'upload', label: <><FileUp size={14} aria-hidden /> {ui.uploadInstall}</> },
    ]} />
    <div className={styles.form}>
      {mode === 'upload'
        ? <FileDrop file={file} onFileChange={setFile} accept=".tar.gz,.tgz" hint={ui.archiveHint} disabled={pending} />
        : <>
          <label className={styles.field}>
            <span>{ui.githubRepository}</span>
            <input className={styles.input} value={source} onChange={event => setSource(event.target.value)} placeholder="owner/repo" spellCheck={false} disabled={pending}
              aria-invalid={source.trim() !== '' && repo === null ? true : undefined} />
            <small className={source.trim() !== '' && repo === null ? styles.fieldError : styles.hint}>
              {source.trim() !== '' && repo === null ? ui.repositoryInvalid : mode === 'build' ? ui.installFromSourceHint : ui.installFromRepoHint}
            </small>
          </label>
          {mode === 'build' && <div className={styles.buildNotice}>
            <p>{ui.sourceBuildRequirements}</p>
            <button type="button" className={styles.linkButton} onClick={() => { onClose(); navigate('/settings'); }}>{ui.sourceBuildSettingsLink}</button>
          </div>}
          {mode === 'build' && <label className={styles.field}>
            <span>{ui.sourceRef}</span>
            <input className={styles.input} value={ref} onChange={event => setRef(event.target.value)} placeholder={ui.sourceRefPlaceholder} spellCheck={false} disabled={pending} />
          </label>}
        </>}
      <Checkbox checked={replace} onCheckedChange={setReplace} label={ui.replaceConflict} description={ui.replaceConflictHint} disabled={pending} />
      {pending && mode === 'build' && <p className={styles.hint} role="status">{ui.buildInProgress}</p>}
      {mode === 'build' && log && <BuildLog text={log} />}
    </div>
  </Dialog>;
}

/** 构建日志：等宽、自动滚到最新一行。 */
function BuildLog({ text }: { text: string }): JSX.Element {
  return <pre className={styles.buildLog} ref={node => { if (node) node.scrollTop = node.scrollHeight; }} aria-live="polite">{text}</pre>;
}

/** 更新：沿用原来源时先显示新版本说明，读完才允许更新；也可上传新版本包。 */
export function UpdateDialog({ pkg, onClose, onUpdate }: { pkg: Package; onClose: () => void; onUpdate: (archive?: File) => Promise<boolean> }): JSX.Element {
  const ui = useUI();
  const repo = repository(pkg.Source);
  const [mode, setMode] = useState<'source' | 'upload'>(repo ? 'source' : 'upload');
  const [file, setFile] = useState<File | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true);
    const done = await onUpdate(mode === 'upload' ? file! : undefined);
    setPending(false);
    if (done) onClose();
  };
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }} title={`${ui.updatePackageTitle} · ${packageName(pkg)}`} size="lg" dismissible={!pending}
    footer={<>
      <Button onClick={onClose} disabled={pending}>{ui.cancel}</Button>
      <Button variant="primary" loading={pending} disabled={mode === 'upload' ? !file : !ready} onClick={() => void submit()}>{ui.actionUpdate}</Button>
    </>}>
    {repo && <TabBar variant="pill" value={mode} onValueChange={value => setMode(value as 'source' | 'upload')} className={styles.modeTabs}
      items={[{ value: 'source', label: ui.updateFromSource }, { value: 'upload', label: ui.updateUpload }]} />}
    {mode === 'source' && repo
      ? <div className={styles.preview}><ReleasePreview repo={repo} onLoaded={() => setReady(true)} /></div>
      : <FileDrop file={file} onFileChange={setFile} accept=".tar.gz,.tgz" hint={ui.archiveHint} disabled={pending} />}
  </Dialog>;
}

/** 卸载：选择保留或清理数据与配置的范围。 */
export function UninstallDialog({ pkg, onClose, onUninstall }: { pkg: Package; onClose: () => void; onUninstall: (purge: 0 | 1 | 2) => Promise<boolean> }): JSX.Element {
  const ui = useUI();
  const [purge, setPurge] = useState<'0' | '1' | '2'>('0');
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true);
    const done = await onUninstall(Number(purge) as 0 | 1 | 2);
    setPending(false);
    if (done) onClose();
  };
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }} title={ui.uninstallTitle} size="sm" dismissible={!pending}
    description={ui.uninstallDesc.replace('{id}', packageName(pkg))}
    footer={<>
      <Button onClick={onClose} disabled={pending}>{ui.cancel}</Button>
      <Button variant="danger" loading={pending} onClick={() => void submit()}>{ui.actionUninstall}</Button>
    </>}>
    <RadioGroup value={purge} onValueChange={value => setPurge(value as '0' | '1' | '2')} aria-label={ui.uninstallTitle} options={[
      { value: '0', label: ui.purge0, description: ui.purge0Hint },
      { value: '1', label: ui.purge1, description: ui.purge1Hint },
      { value: '2', label: ui.purge2, description: ui.purge2Hint },
    ]} />
  </Dialog>;
}

/** 出错原因：最近一次状态变化的原因与时间，以及跳到该组件日志的入口。 */
export function ReasonDialog({ pkg, onClose, onRestart }: { pkg: Package; onClose: () => void; onRestart: () => void }): JSX.Element {
  const ui = useUI();
  const runtime = useQuery({ queryKey: ['runtime', pkg.ID], queryFn: () => getPluginRuntime(pkg.ID), enabled: pkg.Role === 'plugin' || pkg.Role === 'agent' });
  const reason = runtime.data?.reason;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }} title={`${packageName(pkg)} · ${ui.viewReason}`} size="sm"
    footer={<>
      <Button icon={<ScrollText size={16} />} onClick={() => { onClose(); navigate(`/logs?source=${encodeURIComponent(pkg.ID)}`); }}>{ui.viewLogs}</Button>
      <Button variant="primary" onClick={() => { onClose(); onRestart(); }}>{ui.actionRestart}</Button>
    </>}>
    <dl className={styles.facts}>
      <dt>{ui.instanceState}</dt><dd>{runtime.data ? ui[`runtime${runtime.data.state}`] : pkg.State}</dd>
      {reason && <><dt>{ui.runtimeReason}</dt><dd className={styles.mono}>{reason}</dd></>}
      {runtime.data?.changed_at && <><dt>{ui.runtimeChangedAt}</dt><dd>{new Date(runtime.data.changed_at).toLocaleString()}</dd></>}
      <dt>{ui.version}</dt><dd className={styles.mono}>{pkg.Version}</dd>
      {pkg.Source && <><dt>{ui.sourceLabel}</dt><dd className={styles.mono}>{pkg.Source}</dd></>}
    </dl>
  </Dialog>;
}
