import { useMemo, useRef, useState, type JSX } from 'react';
import { Settings2 } from 'lucide-react';
import { AdminAPIError } from '../../api/client';
import type { PackagePage } from '../../api/packages';
import type { InstanceConfigBridge, InstanceConfigContext } from '../../bridge/pluginPage';
import { PluginPageFrame } from '../../components/PluginPageFrame';
import { useUI } from '../../i18n/UI';
import { fieldsFromSchema } from '../../schema/model';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { toast } from '../../ui/toast';
import { invalidInstancePatchField, redactInstanceDraft } from './instanceConfig';
import styles from './Accounts.module.css';

export function AccountSettingsPage({ id, page, mode, instanceID, schema, draft, applyPatch }: {
  id: string;
  page: PackagePage;
  mode: InstanceConfigContext['mode'];
  instanceID: string;
  schema: unknown;
  draft: Record<string, unknown>;
  applyPatch: InstanceConfigBridge['complete'];
}): JSX.Element {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const fields = useMemo(() => fieldsFromSchema(schema), [schema]);
  const current = useRef({ mode, instanceID, schema, fields, draft, applyPatch, message: ui.accountConfigDraftApplied });
  current.current = { mode, instanceID, schema, fields, draft, applyPatch, message: ui.accountConfigDraftApplied };
  const bridge = useMemo<InstanceConfigBridge>(() => ({
    context() {
      const { mode, instanceID, schema, fields, draft } = current.current;
      return { mode, instance_id: instanceID, config: redactInstanceDraft(draft, fields), schema: schema as Record<string, unknown> };
    },
    complete(patch) {
      const invalidField = invalidInstancePatchField(patch, current.current.fields);
      if (invalidField !== undefined) throw new AdminAPIError(400, `invalid configuration value for ${invalidField}`, 'INVALID_ARGUMENT');
      current.current.applyPatch(patch);
      setOpen(false);
      toast.success(current.current.message);
    },
  }), []);

  return <>
    <Button ref={trigger} className={styles.accountSettings} icon={<Settings2 size={16} />} title={page.title}
      onClick={() => { setSession(value => value + 1); setOpen(true); }}>{ui.accountSettings}</Button>
    <Dialog open={open} title={page.title} size="xl" onOpenChange={setOpen} returnFocusRef={trigger}>
      {/* 对话框退场前保留 iframe 接收完成响应，关闭时立即解绑。 */}
      <PluginPageFrame key={session} id={id} path={page.path} title={page.title} className={styles.accountSettingsFrame} config={bridge} active={open} />
    </Dialog>
  </>;
}
