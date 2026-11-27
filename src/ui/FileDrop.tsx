import { useId, useRef, useState, type JSX, type ReactNode } from 'react';
import { FileUp, X } from 'lucide-react';
import { useUI } from '../i18n/UI';
import { cn } from '../lib/cn';

/** 拖放或点击选择单个文件；选中后显示文件名与大小，可一键清除。 */
export function FileDrop({
  file,
  onFileChange,
  accept,
  hint,
  disabled,
}: {
  file: File | null;
  onFileChange: (file: File | null) => void;
  accept?: string;
  hint?: ReactNode;
  disabled?: boolean;
}): JSX.Element {
  const ui = useUI();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-[14px] border border-[color-mix(in_srgb,var(--color-accent)_40%,var(--color-line))] bg-[var(--color-accent-soft)]/50 px-4 py-3 text-sm">
        <FileUp size={18} className="shrink-0 text-[var(--color-accent)]" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-medium text-[var(--color-ink)]">{file.name}</span>
        <span className="tabular-nums shrink-0 font-mono text-xs text-[var(--color-ink-muted)]">{formatSize(file.size)}</span>
        <button
          type="button"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-danger)] disabled:opacity-45"
          aria-label={ui.removeFile}
          disabled={disabled}
          onClick={() => onFileChange(null)}
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <label
      htmlFor={id}
      data-over={over || undefined}
      data-disabled={disabled || undefined}
      onDragOver={event => {
        event.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={event => {
        event.preventDefault();
        setOver(false);
        const dropped = event.dataTransfer.files[0];
        if (!disabled && dropped) {
          onFileChange(dropped);
        }
      }}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[16px] border-2 border-dashed px-6 py-8 text-center transition-all duration-150',
        over
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]/70 shadow-[var(--shadow-glow-accent)]'
          : 'border-[var(--color-line)] bg-[var(--color-surface-2)]/55 hover:border-[color-mix(in_srgb,var(--color-accent)_60%,var(--color-line))] hover:bg-[var(--color-surface-2)]',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
        <FileUp size={20} aria-hidden="true" />
      </span>
      <span className="text-sm font-semibold text-[var(--color-ink)]">{ui.dropFile}</span>
      {hint && <span className="text-xs text-[var(--color-ink-muted)]">{hint}</span>}
      <input
        ref={input}
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        className="visually-hidden"
        onChange={event => {
          onFileChange(event.target.files?.[0] ?? null);
          event.target.value = '';
        }}
      />
    </label>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
