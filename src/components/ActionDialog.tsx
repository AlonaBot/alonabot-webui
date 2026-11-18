import { useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useUI } from '../i18n/UI';

export function ActionDialog({ title, children, onClose, onConfirm, confirmLabel }: { title: string; children: ReactNode; onClose: () => void; onConfirm: () => Promise<void | boolean>; confirmLabel?: string }) {
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) onClose(); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" />
    <Dialog.Content className="dialog-content plugins-dialog-content" aria-describedby={undefined}>
      <div className="dialog-header"><Dialog.Title className="dialog-title">{title}</Dialog.Title><button className="dialog-close-button" aria-label={ui.close} disabled={busy} onClick={onClose}><X size={16} /></button></div>
      {children}
      {error && <pre role="alert" className="form-error">{error}</pre>}
      <div className="dialog-actions"><button disabled={busy} onClick={onClose}>{ui.cancel}</button><button className="dialog-button is-primary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { const completed = await onConfirm(); if (completed !== false) onClose(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); } }}>{busy ? ui.loading : confirmLabel ?? ui.confirm}</button></div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
