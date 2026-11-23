import { useState, type JSX, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { useUI } from '../../i18n/UI';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Dialog } from '../../ui/Dialog';
import { Tooltip } from '../../ui/Tooltip';
import { toast } from '../../ui/toast';
import styles from './TokenRevealDialog.module.css';

/**
 * 只显示一次的管理令牌。不能用 Esc 或点遮罩关闭；勾选「已保存」后才能继续，
 * 首次领取与更换令牌共用。onConfirm 失败时保持打开并提示错误。
 */
export function TokenRevealDialog({ token, title, description, confirmLabel, onConfirm }: {
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

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch (error) {
      toast.error(error, ui.copyFailed);
    }
  };

  const confirm = async () => {
    setPending(true);
    try {
      await onConfirm();
    } catch (error) {
      toast.error(error);
      setPending(false);
    }
  };

  return <Dialog open onOpenChange={() => undefined} dismissible={false} title={title} description={description}
    footer={<Button variant="primary" size="lg" disabled={!saved} loading={pending} onClick={() => void confirm()}>{confirmLabel}</Button>}>
    <div className={styles.token}>
      <code onClick={event => window.getSelection()?.selectAllChildren(event.currentTarget)}>{token}</code>
      <Tooltip content={copied ? ui.copied : ui.copyToken}>
        <Button variant={copied ? 'soft' : 'secondary'} iconOnly aria-label={ui.copyToken} onClick={() => void copy()}>{copied ? <Check size={16} /> : <Copy size={16} />}</Button>
      </Tooltip>
    </div>
    <Checkbox className={styles.saved} checked={saved} onCheckedChange={setSaved} label={ui.tokenSavedConfirm} />
  </Dialog>;
}
