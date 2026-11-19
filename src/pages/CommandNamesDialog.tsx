import { useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowUp, ArrowDown, GripVertical, Plus, X } from 'lucide-react';
import { arrayMove } from '@dnd-kit/sortable';
import type { CommandPolicy } from '../api/admin';
import { useUI } from '../i18n/UI';

export type NamesDraft = { plugin: string; command: CommandPolicy; names: string[] };

export function CommandNamesDialog({ draft, setDraft, busy, error, onSave, onReset }: {
  draft: NamesDraft | null; setDraft: (draft: NamesDraft | null) => void; busy: boolean; error: string | null;
  onSave: () => void; onReset: () => void;
}) {
  const ui = useUI();
  const dragging = useRef<number | null>(null);
  return <Dialog.Root open={draft !== null} onOpenChange={open => { if (!open && !busy) setDraft(null); }}><Dialog.Portal>
    <Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content command-names-dialog">
      <div className="dialog-header"><Dialog.Title className="dialog-title">{ui.editNames}</Dialog.Title><Dialog.Close asChild><button type="button" className="dialog-close-button" aria-label={ui.close} disabled={busy}><X size={18} /></button></Dialog.Close></div>
      <Dialog.Description className="dialog-description">{ui.declaredPrompt}{draft?.command.declared_names.map(path => path.join(' ')).join(' · ')}{ui.commandNameOrderHint}</Dialog.Description>
      <form onSubmit={event => { event.preventDefault(); onSave(); }}>
        {draft?.names.map((name, index) => <div key={index} className="command-name-row" onDragOver={event => event.preventDefault()} onDrop={event => {
          event.preventDefault();
          if (!busy && dragging.current !== null) setDraft({ ...draft, names: arrayMove(draft.names, dragging.current, index) });
          dragging.current = null;
        }}>
          <span className="command-name-drag" draggable={!busy} onDragStart={event => { dragging.current = index; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); }} onDragEnd={() => { dragging.current = null; }}><GripVertical size={16} /></span>
          <input aria-label={index === 0 ? ui.primaryName : ui.aliasPlaceholder} required disabled={busy} value={name} onChange={event => setDraft({ ...draft, names: draft.names.map((value, at) => at === index ? event.target.value : value) })} />
          {index === 0 && <span className="command-primary-label">{ui.primaryName}</span>}
          <button type="button" className="detail-icon-button" aria-label={ui.moveNameUp} disabled={index === 0 || busy} onClick={() => setDraft({ ...draft, names: arrayMove(draft.names, index, index - 1) })}><ArrowUp size={14} /></button>
          <button type="button" className="detail-icon-button" aria-label={ui.moveNameDown} disabled={index === draft.names.length - 1 || busy} onClick={() => setDraft({ ...draft, names: arrayMove(draft.names, index, index + 1) })}><ArrowDown size={14} /></button>
          <button type="button" className="detail-icon-button" aria-label={ui.removeRow} disabled={draft.names.length <= 1 || busy} onClick={() => setDraft({ ...draft, names: draft.names.filter((_, at) => at !== index) })}><X size={14} /></button>
        </div>)}
        {error && <p className="form-error-inline" role="alert">{error}</p>}
        <button type="button" className="command-add-name" disabled={busy} onClick={() => draft && setDraft({ ...draft, names: [...draft.names, ''] })}><Plus size={15} />{ui.addCommandName}</button>
        <div className="dialog-actions"><button type="button" className="dialog-button command-reset-names" disabled={busy} onClick={onReset}>{ui.resetNames}</button><button type="button" className="dialog-button" disabled={busy} onClick={() => setDraft(null)}>{ui.cancel}</button><button type="submit" className="dialog-button is-primary" disabled={busy}>{ui.save}</button></div>
      </form>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
