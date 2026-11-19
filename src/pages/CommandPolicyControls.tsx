import { Edit2, RotateCcw } from 'lucide-react';
import type { CommandOverride, CommandScope } from '../api/admin';
import { useUI } from '../i18n/UI';
import { commandOverride, permissionParent, permissionPreset } from './permissionState';

type Change = Partial<Pick<CommandOverride, 'enabled' | 'permissions'>>;

export function CommandPolicyControls({ overrides, scope, enabled, permissions, path, enabledOnly, label, busy, onChange, onCustom }: {
  overrides: CommandOverride[]; scope: CommandScope; enabled: boolean; permissions?: string[] | null;
  path?: string[]; enabledOnly?: boolean;
  label: string; busy: boolean; onChange: (change: Change) => void; onCustom: (permissions: string[] | null) => void;
}) {
  const ui = useUI();
  const override = commandOverride(overrides, scope, {});
  const preset = permissionPreset(override.permissions);
  const parent = permissionParent(overrides, scope, path);
  const effective = override.permissions ?? permissions ?? parent?.permissions ?? null;
  const labels: Record<string, string> = { inherit: ui.commandInherit, everyone: ui.permEveryone, chat_admin: ui.permGroupAdmin, admin: ui.permAdminOnly, custom: `${ui.customPermissions}: ${effective?.join(', ')}` };
  const inheritTitle = parent?.scope.kind === 'group' ? ui.inheritGroup : parent?.scope.kind === 'plugin' ? ui.inheritPlugin : ui.inheritDeclaration;
  return <div className="command-policy-controls">
    {!enabledOnly && <><select className={preset === 'inherit' ? 'is-inherited' : undefined} title={preset === 'inherit' ? inheritTitle : undefined} aria-label={`${ui.permissions} ${label}`} disabled={busy} value={preset} onChange={event => {
      const value = event.target.value;
      if (value === 'custom') onCustom(effective);
      else onChange({ permissions: value === 'inherit' ? null : value === 'everyone' ? [] : [value] });
    }}>
      <option value="inherit">{preset === 'inherit' ? labels[permissionPreset(effective)] : ui.commandInherit}</option>
      <option value="everyone">{ui.permEveryone}</option><option value="chat_admin">{ui.permGroupAdmin}</option><option value="admin">{ui.permAdminOnly}</option>
      <option value="custom">{preset === 'custom' ? `${ui.customPermissions}: ${override.permissions?.join(', ')}` : ui.customPermissions}</option>
    </select>
    {preset === 'custom' && <button type="button" className="detail-icon-button" aria-label={`${ui.customPermissions} ${label}`} disabled={busy} onClick={() => onCustom(override.permissions)}><Edit2 size={14} /></button>}</>}
    <div className="command-enabled-control">
      {!enabledOnly && override.enabled !== null && <button type="button" className="command-inherit-button" disabled={busy} title={ui.resetEnabled} aria-label={`${ui.resetEnabled} ${label}`} onClick={() => onChange({ enabled: null })}><RotateCcw size={12} /></button>}
      <label className="plugin-switch-label"><input type="checkbox" role="switch" aria-label={`${ui.commandEnabled} ${label}`} title={override.enabled === null ? ui.commandInherit : undefined} checked={enabled} disabled={busy} onChange={event => onChange({ enabled: event.target.checked })} /><span className="plugin-switch-slider" /></label>
    </div>
  </div>;
}
