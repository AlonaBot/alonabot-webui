import { useId, useRef, useState, type JSX, type ReactNode } from 'react';
import { FileUp, X } from 'lucide-react';
import { useUI } from '../i18n/UI';
import styles from './FileDrop.module.css';

/** 拖放或点击选择单个文件；选中后显示文件名与大小，可清除。accept 同 input 的 accept。 */
export function FileDrop({ file, onFileChange, accept, hint, disabled }: {
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
    return <div className={styles.selected}>
      <FileUp size={18} aria-hidden />
      <span className={styles.name}>{file.name}</span>
      <span className={styles.size}>{formatSize(file.size)}</span>
      <button type="button" className={styles.clear} aria-label={ui.removeFile} disabled={disabled} onClick={() => onFileChange(null)}><X size={16} /></button>
    </div>;
  }
  return <label htmlFor={id} className={styles.zone} data-over={over || undefined} data-disabled={disabled || undefined}
    onDragOver={event => { event.preventDefault(); if (!disabled) setOver(true); }}
    onDragLeave={() => setOver(false)}
    onDrop={event => { event.preventDefault(); setOver(false); if (!disabled && event.dataTransfer.files[0]) onFileChange(event.dataTransfer.files[0]); }}>
    <FileUp size={22} aria-hidden />
    <span className={styles.prompt}>{ui.dropFile}</span>
    {hint && <span className={styles.hint}>{hint}</span>}
    <input ref={input} id={id} type="file" accept={accept} disabled={disabled} className={styles.input}
      onChange={event => { onFileChange(event.target.files?.[0] ?? null); event.target.value = ''; }} />
  </label>;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
