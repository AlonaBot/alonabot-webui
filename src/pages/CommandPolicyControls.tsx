import type { JSX } from 'react';
import { Edit2, RotateCcw } from 'lucide-react';
import type { CommandOverride, CommandScope } from '../api/policies';
import { useUI } from '../i18n/UI';
import { cn } from '../lib/cn';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Switch } from '../ui/Switch';
import { commandOverride, permissionParent, permissionPreset } from './permissionState';

type Change = Partial<Pick<CommandOverride, 'enabled' | 'permissions'>>;

export function CommandPolicyControls({
  overrides,
  scope,
  enabled,
  permissions,
  path,
  enabledOnly,
  label,
  busy,
  onChange,
  onCustom,
}: {
  overrides: CommandOverride[];
  scope: CommandScope;
  enabled: boolean;
  permissions?: string[] | null;
  path?: string[];
  enabledOnly?: boolean;
  label: string;
  busy: boolean;
  onChange: (change: Change) => void;
  onCustom: (permissions: string[] | null) => void;
}): JSX.Element {
  const ui = useUI();
  const override = commandOverride(overrides, scope, {});
  const preset = permissionPreset(override.permissions);
  const parent = permissionParent(overrides, scope, path);
  const effective = override.permissions ?? permissions ?? parent?.permissions ?? null;

  const labels: Record<string, string> = {
    inherit: ui.commandInherit,
    everyone: ui.permEveryone,
    chat_admin: ui.permGroupAdmin,
    admin: ui.permAdminOnly,
    custom: `${ui.customPermissions}: ${effective?.join(', ')}`,
  };
  const inheritTitle =
    parent?.scope.kind === 'group'
      ? ui.inheritGroup
      : parent?.scope.kind === 'plugin'
        ? ui.inheritPlugin
        : ui.inheritDeclaration;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {!enabledOnly && (
        <div className="flex items-center gap-1.5" title={preset === 'inherit' ? inheritTitle : undefined}>
          <Select
            size="sm"
            variant="filled"
            aria-label={`${ui.permissions} ${label}`}
            disabled={busy}
            value={preset}
            className={cn(
              'min-w-[136px] max-w-[200px]',
              preset === 'inherit' ? 'text-[var(--color-ink-muted)]' : 'font-medium text-[var(--color-accent-strong)]',
            )}
            options={[
              {
                value: 'inherit',
                label: preset === 'inherit' ? labels[permissionPreset(effective)] : ui.commandInherit,
              },
              { value: 'everyone', label: ui.permEveryone },
              { value: 'chat_admin', label: ui.permGroupAdmin },
              { value: 'admin', label: ui.permAdminOnly },
              {
                value: 'custom',
                label:
                  preset === 'custom'
                    ? `${ui.customPermissions}: ${override.permissions?.join(', ')}`
                    : ui.customPermissions,
              },
            ]}
            onValueChange={value => {
              if (value === 'custom') onCustom(effective);
              else onChange({ permissions: value === 'inherit' ? null : value === 'everyone' ? [] : [value] });
            }}
          />
          {preset === 'custom' && (
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              aria-label={`${ui.customPermissions} ${label}`}
              disabled={busy}
              onClick={() => onCustom(override.permissions)}
            >
              <Edit2 size={14} />
            </Button>
          )}
        </div>
      )}

      <div className="inline-flex items-center gap-1.5">
        {!enabledOnly && override.enabled !== null && (
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            disabled={busy}
            title={ui.resetEnabled}
            aria-label={`${ui.resetEnabled} ${label}`}
            onClick={() => onChange({ enabled: null })}
          >
            <RotateCcw size={13} />
          </Button>
        )}
        <Switch
          aria-label={`${ui.commandEnabled} ${label}`}
          checked={enabled}
          onCheckedChange={checked => onChange({ enabled: checked })}
          disabled={busy}
        />
      </div>
    </div>
  );
}
