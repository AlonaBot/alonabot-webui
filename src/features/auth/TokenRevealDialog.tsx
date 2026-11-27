import { useState, type JSX, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { useUI } from '../../i18n/UI';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Dialog } from '../../ui/Dialog';
import { Tooltip } from '../../ui/Tooltip';
import { toast } from '../../ui/toast';

/**
 * 只显示一次的管理令牌对话框；禁止 Esc/遮罩误关，勾选已保存后方可确认进入。
 */
export function TokenRevealDialog({
  token,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  token: string;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: ReactNode;
  onConfirm: () => Promise<void> | void;
}): JSX.Element {
  const ui = useUI();
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch (error: unknown) {
      toast.error(error, ui.copyFailed);
    }
  };

  const confirm = async (): Promise<void> => {
    setPending(true);
    try {
      await onConfirm();
    } catch (error: unknown) {
      toast.error(error);
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={() => undefined}
      dismissible={false}
      title={title}
      description={description}
      footer={
        <Button variant="primary" size="lg" disabled={!saved} loading={pending} onClick={() => void confirm()}>
          {confirmLabel}
        </Button>
      }
    >
      <div className="flex items-center gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-3">
        <code
          onClick={event => window.getSelection()?.selectAllChildren(event.currentTarget)}
          className="min-w-0 flex-1 break-all font-mono text-xs font-semibold text-[var(--color-ink)] select-all"
        >
          {token}
        </code>
        <Tooltip content={copied ? ui.copied : ui.copyToken}>
          <Button variant={copied ? 'soft' : 'secondary'} iconOnly aria-label={ui.copyToken} onClick={() => void copy()}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </Button>
        </Tooltip>
      </div>
      <Checkbox className="mt-4" checked={saved} onCheckedChange={setSaved} label={ui.tokenSavedConfirm} />
    </Dialog>
  );
}
