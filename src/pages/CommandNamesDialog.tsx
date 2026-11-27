import { useRef, type JSX } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import { ArrowDown, ArrowUp, GripVertical, Plus, RotateCcw, X } from 'lucide-react';
import type { CommandPolicy } from '../api/policies';
import { useUI } from '../i18n/UI';
import { Button } from '../ui/Button';
import { Dialog as SharedDialog } from '../ui/Dialog';

export type NamesDraft = { plugin: string; command: CommandPolicy; names: string[] };

export function CommandNamesDialog({
  draft,
  setDraft,
  busy,
  error,
  onSave,
  onReset,
}: {
  draft: NamesDraft | null;
  setDraft: (draft: NamesDraft | null) => void;
  busy: boolean;
  error: string | null;
  onSave: () => void;
  onReset: () => void;
}): JSX.Element {
  const ui = useUI();
  const dragging = useRef<number | null>(null);

  return (
    <SharedDialog
      open={draft !== null}
      onOpenChange={open => {
        if (!open && !busy) setDraft(null);
      }}
      size="md"
      title={ui.editNames}
      description={
        <>
          {ui.declaredPrompt}
          <span className="font-mono text-[var(--color-ink)]">
            {draft?.command.declared_names.map(path => path.join(' ')).join(' · ')}
          </span>
          {ui.commandNameOrderHint}
        </>
      }
      footer={
        <>
          <Button
            variant="ghost"
            icon={<RotateCcw size={14} />}
            className="mr-auto"
            disabled={busy}
            onClick={onReset}
          >
            {ui.resetNames}
          </Button>
          <Button disabled={busy} onClick={() => setDraft(null)}>
            {ui.cancel}
          </Button>
          <Button type="submit" form="command-names-form" variant="primary" loading={busy}>
            {ui.save}
          </Button>
        </>
      }
    >
      <form
        id="command-names-form"
        className="space-y-2.5"
        onSubmit={event => {
          event.preventDefault();
          onSave();
        }}
      >
        {draft?.names.map((name, index) => (
          <div
            key={index}
            className="flex items-center gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)]/70 p-2"
            onDragOver={event => event.preventDefault()}
            onDrop={event => {
              event.preventDefault();
              if (!busy && dragging.current !== null) {
                setDraft({ ...draft, names: arrayMove(draft.names, dragging.current, index) });
              }
              dragging.current = null;
            }}
          >
            <span
              className="cursor-grab text-[var(--color-ink-muted)] active:cursor-grabbing"
              draggable={!busy}
              onDragStart={event => {
                dragging.current = index;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', String(index));
              }}
              onDragEnd={() => {
                dragging.current = null;
              }}
            >
              <GripVertical size={15} />
            </span>

            <input
              aria-label={index === 0 ? ui.primaryName : ui.aliasPlaceholder}
              placeholder={index === 0 ? ui.primaryName : ui.aliasPlaceholder}
              required
              disabled={busy}
              value={name}
              onChange={event =>
                setDraft({
                  ...draft,
                  names: draft.names.map((value, at) => (at === index ? event.target.value : value)),
                })
              }
              className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 font-mono text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
            />

            {index === 0 && (
              <span className="shrink-0 rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-accent-strong)]">
                {ui.primaryName}
              </span>
            )}

            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                aria-label={ui.moveNameUp}
                disabled={index === 0 || busy}
                onClick={() => setDraft({ ...draft, names: arrayMove(draft.names, index, index - 1) })}
              >
                <ArrowUp size={13} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                aria-label={ui.moveNameDown}
                disabled={index === draft.names.length - 1 || busy}
                onClick={() => setDraft({ ...draft, names: arrayMove(draft.names, index, index + 1) })}
              >
                <ArrowDown size={13} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                aria-label={ui.removeRow}
                disabled={draft.names.length <= 1 || busy}
                onClick={() => setDraft({ ...draft, names: draft.names.filter((_, at) => at !== index) })}
              >
                <X size={13} />
              </Button>
            </div>
          </div>
        ))}

        {error && (
          <p className="form-error mb-0" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => draft && setDraft({ ...draft, names: [...draft.names, ''] })}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-line))] bg-[var(--color-accent-soft)]/50 px-3 py-2 text-xs font-semibold text-[var(--color-accent-strong)] transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
        >
          <Plus size={14} aria-hidden="true" />
          <span>{ui.addCommandName}</span>
        </button>
      </form>
    </SharedDialog>
  );
}
