import { useState, type JSX } from 'react';
import { ArrowRight, ArrowUpCircle, FileWarning, Info, Lock, MoreHorizontal, Package as PackageIcon, Power, RefreshCw, RotateCw, Trash2 } from 'lucide-react';
import { packageIconURL, type Package } from '../../api/packages';
import { useUI } from '../../i18n/UI';
import { hasPackageProblem } from '../../pages/packageState';
import { navigate } from '../../shell/router';
import { Button } from '../../ui/Button';
import { Menu, MenuItem, MenuSeparator } from '../../ui/Menu';
import { Switch } from '../../ui/Switch';
import { Tooltip } from '../../ui/Tooltip';
import { packageName } from './usePackageActions';
import { Sparkline } from './Sparkline';
import styles from './Plugins.module.css';

type Tone = 'running' | 'idle' | 'warning' | 'danger' | 'off';

/** 卡片底部的状态：颜色点 + 文字。插件与 Agent 优先用运行态，其他角色用安装态。 */
function status(pkg: Package, ui: ReturnType<typeof useUI>): { tone: Tone; text: string } {
  if (!pkg.Enabled) return { tone: 'off', text: ui.stateStopped };
  if (hasPackageProblem(pkg) || pkg.RuntimeState === 'FAILED') return { tone: 'danger', text: pkg.RuntimeState === 'FAILED' ? ui.runtimeFAILED : ui.stateProblem };
  if (pkg.RuntimeState) {
    const tone: Record<string, Tone> = { ACTIVE: 'running', WAKING: 'warning', QUIESCING: 'warning', SUSPENDED: 'idle', STOPPED: 'off' };
    return { tone: tone[pkg.RuntimeState] ?? 'idle', text: ui[`runtime${pkg.RuntimeState}`] };
  }
  if (pkg.State === 'Activated') return { tone: 'running', text: ui.stateRunning };
  if (pkg.State === 'Installed') return { tone: 'idle', text: ui.stateInstalled };
  return { tone: 'danger', text: pkg.State || ui.stateDegraded };
}

/** 已安装组件卡片。WebUI 自己不能在这里停用或卸载，显示锁。 */
export function PluginCard({ pkg, latest, updateFailed, activity, busy, onToggle, onRestart, onReload, onUpdate, onUninstall, onReason }: {
  pkg: Package;
  latest?: string;
  updateFailed: boolean;
  activity: readonly number[];
  busy: boolean;
  onToggle: () => void;
  onRestart: () => void;
  onReload: () => void;
  onUpdate: () => void;
  onUninstall: () => void;
  onReason: () => void;
}): JSX.Element {
  const ui = useUI();
  const [iconFailed, setIconFailed] = useState(false);
  const self = pkg.Role === 'webui';
  const state = status(pkg, ui);
  const detail = `/components/${encodeURIComponent(pkg.ID)}`;
  const name = packageName(pkg);

  return <article className={styles.card} data-tone={state.tone}>
    <header className={styles.cardHead}>
      <div className={styles.icon}>
        {iconFailed ? <PackageIcon size={20} aria-hidden /> : <img src={packageIconURL(pkg.ID)} alt="" onError={() => setIconFailed(true)} />}
      </div>
      <div className={styles.heading}>
        <button type="button" className={styles.name} onClick={() => navigate(detail)}>{name}</button>
        <span className={styles.version}>
          v{pkg.Version}
          {latest && <><ArrowRight size={12} aria-hidden /><span className={styles.newVersion}>v{latest}</span></>}
        </span>
      </div>
      {self
        ? <Tooltip content={ui.webuiSelfLocked}><span className={styles.lock}><Lock size={16} aria-label={ui.webuiSelfLocked} /></span></Tooltip>
        : <Switch checked={pkg.Enabled} pending={busy} onCheckedChange={onToggle} aria-label={`${pkg.Enabled ? ui.actionDisable : ui.actionEnable} ${name}`} />}
    </header>

    <p className={styles.description}>{pkg.Description || (self ? ui.webuiSelfDescription : <span className={styles.muted}>{pkg.Source || ui.unknownMetadata}</span>)}</p>
    {!self && <Sparkline values={activity} label={ui.activityLast24h} />}

    <footer className={styles.cardFoot}>
      <span className={styles.status}><span className={styles.dot} />{state.text}</span>
      {updateFailed && <Tooltip content={ui.updateCheckFailed}><FileWarning size={14} className={styles.muted} aria-label={ui.updateCheckFailed} /></Tooltip>}
      <span className={styles.spacer} />
      {state.tone === 'danger' && <Button size="sm" icon={<Info size={14} />} onClick={onReason}>{ui.viewReason}</Button>}
      {latest && state.tone !== 'danger' && <Button size="sm" variant="soft" icon={<ArrowUpCircle size={14} />} onClick={onUpdate} disabled={busy}>{ui.actionUpdate}</Button>}
      {!self && <Menu align="end" trigger={<Button size="sm" variant="ghost" iconOnly aria-label={ui.actions}><MoreHorizontal size={18} /></Button>}>
        <MenuItem icon={<PackageIcon size={16} />} onSelect={() => navigate(detail)}>{ui.actionDetails}</MenuItem>
        <MenuItem icon={<Power size={16} />} onSelect={onToggle}>{pkg.Enabled ? ui.actionDisable : ui.actionEnable}</MenuItem>
        {pkg.Enabled && pkg.Active && <MenuItem icon={<RefreshCw size={16} />} onSelect={onRestart}>{ui.actionRestart}</MenuItem>}
        {pkg.State === 'Activated' && <MenuItem icon={<RotateCw size={16} />} onSelect={onReload}>{ui.actionReload}</MenuItem>}
        <MenuItem icon={<ArrowUpCircle size={16} />} onSelect={onUpdate}>{ui.actionUpdate}</MenuItem>
        <MenuSeparator />
        <MenuItem icon={<Trash2 size={16} />} tone="danger" onSelect={onUninstall}>{ui.actionUninstall}</MenuItem>
      </Menu>}
    </footer>
  </article>;
}
