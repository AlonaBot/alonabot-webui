import { useId, useState, type JSX } from 'react';
import { AlertTriangle, Download } from 'lucide-react';
import { downloadDiagnostics, type DiagnosticsOptions } from '../api/logs';
import { useUI } from '../i18n/UI';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { Dialog as SharedDialog } from '../ui/Dialog';
import { Select } from '../ui/Select';

interface DiagnosticsDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function DiagnosticsDialog(props: DiagnosticsDialogProps): JSX.Element {
  const { open, onOpenChange } = props;
  const ui = useUI();
  const timeRangeSelectId = useId();

  const [options, setOptions] = useState<DiagnosticsOptions>({
    since: '24h',
    logs: true,
    settings: true,
    components: true,
    redact: true,
  });

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDownload = async (): Promise<void> => {
    if (!options.logs && !options.settings && !options.components) {
      setErrorMessage(ui.diagnosticsAtLeastOne);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const { blob, filename } = await downloadDiagnostics(options);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onOpenChange(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SharedDialog
      open={open}
      onOpenChange={onOpenChange}
      title={ui.exportDiagnosticsTitle}
      size="md"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={loading}>
            {ui.cancel}
          </Button>
          <Button
            variant="primary"
            icon={<Download size={14} />}
            loading={loading}
            onClick={() => void handleDownload()}
          >
            {loading ? ui.diagnosticsDownloading : ui.diagnosticsDownload}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor={timeRangeSelectId} className="block text-xs font-semibold text-[var(--color-ink-muted)]">
            {ui.diagnosticsTimeRange}
          </label>
          <Select
            id={timeRangeSelectId}
            variant="filled"
            className="w-full"
            value={options.since}
            disabled={loading}
            onValueChange={since => setOptions({ ...options, since })}
            options={[
              { value: '24h', label: ui.diagnosticsRange24h },
              { value: '72h', label: ui.diagnosticsRange72h },
              { value: '168h', label: ui.diagnosticsRange168h },
            ]}
          />
        </div>

        <div className="space-y-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)]/55 p-3">
          {(
            [
              ['logs', ui.diagnosticsLogs],
              ['settings', ui.diagnosticsSettings],
              ['components', ui.diagnosticsComponents],
              ['redact', ui.diagnosticsRedact],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface)]/80"
            >
              <Checkbox
                checked={options[key]}
                disabled={loading}
                onCheckedChange={checked => setOptions({ ...options, [key]: checked })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        <div className="flex items-start gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--color-warning)_32%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] px-3.5 py-2.5 text-xs leading-relaxed text-[var(--color-warning-ink)]">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{ui.diagnosticsChatWarning}</span>
        </div>

        {errorMessage && (
          <div className="form-error mb-0" role="alert">
            <span>{errorMessage}</span>
          </div>
        )}
      </div>
    </SharedDialog>
  );
}
