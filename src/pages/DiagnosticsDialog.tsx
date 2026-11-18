import { useState, useId, type JSX } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, X } from 'lucide-react';
import { useUI } from '../i18n/UI';
import { downloadDiagnostics, type DiagnosticsOptions } from '../api/admin';

interface DiagnosticsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

  const handleDownload = async () => {
    // 检查三组内容是否全关
    if (!options.logs && !options.settings && !options.components) {
      setErrorMessage(ui.diagnosticsAtLeastOne);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const { blob, filename } = await downloadDiagnostics(options);
      // 生成下载并释放对象 URL
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      // 下载成功后关闭对话框
      onOpenChange(false);
    } catch (err) {
      // 保持失败对话框与选择
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content logs-diagnostics-dialog">
          <div className="dialog-header">
            <div>
              <Dialog.Title className="dialog-title">{ui.exportDiagnosticsTitle}</Dialog.Title>
              <Dialog.Description className="dialog-subtitle">
                {ui.exportDiagnosticsDesc}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="dialog-close-button" aria-label={ui.close}>
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <div className="diagnostics-dialog-body">
            {/* 时间范围选择 */}
            <div className="diagnostics-field">
              <label htmlFor={timeRangeSelectId} className="diagnostics-field-label">
                {ui.diagnosticsTimeRange}
              </label>
              <select
                id={timeRangeSelectId}
                className="diagnostics-select"
                value={options.since}
                onChange={e => setOptions({ ...options, since: e.target.value })}
                disabled={loading}
              >
                <option value="24h">{ui.diagnosticsRange24h}</option>
                <option value="72h">{ui.diagnosticsRange72h}</option>
                <option value="168h">{ui.diagnosticsRange168h}</option>
              </select>
            </div>

            {/* 内容多选 */}
            <div className="diagnostics-checkboxes">
              <label className="logs-checkbox-row diagnostics-check-row">
                <input
                  type="checkbox"
                  checked={options.logs}
                  onChange={e => setOptions({ ...options, logs: e.target.checked })}
                  disabled={loading}
                />
                <span>{ui.diagnosticsLogs}</span>
              </label>

              <label className="logs-checkbox-row diagnostics-check-row">
                <input
                  type="checkbox"
                  checked={options.settings}
                  onChange={e => setOptions({ ...options, settings: e.target.checked })}
                  disabled={loading}
                />
                <span>{ui.diagnosticsSettings}</span>
              </label>

              <label className="logs-checkbox-row diagnostics-check-row">
                <input
                  type="checkbox"
                  checked={options.components}
                  onChange={e => setOptions({ ...options, components: e.target.checked })}
                  disabled={loading}
                />
                <span>{ui.diagnosticsComponents}</span>
              </label>

              <label className="logs-checkbox-row diagnostics-check-row">
                <input
                  type="checkbox"
                  checked={options.redact}
                  onChange={e => setOptions({ ...options, redact: e.target.checked })}
                  disabled={loading}
                />
                <span>{ui.diagnosticsRedact}</span>
              </label>
            </div>

            {/* 提示信息 */}
            <div className="diagnostics-warning-banner">
              <AlertTriangle size={15} className="diagnostics-warning-icon" />
              <span>{ui.diagnosticsChatWarning}</span>
            </div>

            {/* 错误展示 */}
            {errorMessage && (
              <div className="diagnostics-error-banner" role="alert">
                <span>{errorMessage}</span>
              </div>
            )}
          </div>

          <div className="dialog-actions diagnostics-actions">
            <button
              type="button"
              className="dialog-button"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {ui.cancel}
            </button>
            <button
              type="button"
              className="dialog-button is-primary"
              onClick={() => void handleDownload()}
              disabled={loading}
            >
              {loading ? ui.diagnosticsDownloading : ui.diagnosticsDownload}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
