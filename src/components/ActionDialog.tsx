import { useState, type JSX, type ReactNode } from 'react';
import { useUI } from '../i18n/UI';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { toast } from '../ui/toast';

/**
 * 带一个确认操作的对话框。onConfirm 返回 false 表示已转入其他确认流程、保持打开；
 * 抛错时以 toast 提示并保持打开，便于修改后重试。
 */
export function ActionDialog({ title, children, onClose, onConfirm, confirmLabel }: { title: string; children: ReactNode; onClose: () => void; onConfirm: () => Promise<void | boolean>; confirmLabel?: string }): JSX.Element {
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try {
      if (await onConfirm() !== false) onClose();
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  };
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }} title={title} size="sm" dismissible={!busy}
    footer={<><Button onClick={onClose} disabled={busy}>{ui.cancel}</Button><Button variant="primary" loading={busy} onClick={() => void confirm()}>{confirmLabel ?? ui.confirm}</Button></>}>
    {children}
  </Dialog>;
}
