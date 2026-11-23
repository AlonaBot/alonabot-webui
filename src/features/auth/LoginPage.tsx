import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { Check, Copy, Eye, EyeOff, KeyRound } from 'lucide-react';
import markSvg from '../../assets/mark.svg?no-inline';
import { bootstrap, confirmBootstrap, login } from '../../api/auth';
import { AdminAPIError } from '../../api/client';
import { LanguageSwitch } from '../../components/LanguageSwitch';
import { useUI } from '../../i18n/UI';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Tooltip } from '../../ui/Tooltip';
import { toast } from '../../ui/toast';
import { version } from '../../../package.json';
import { NetworkBackground } from './NetworkBackground';
import { TokenRevealDialog } from './TokenRevealDialog';
import styles from './LoginPage.module.css';

/**
 * 登录页。打开时先尝试本机首次领取：Core 判定为本机且令牌未确认时返回令牌，
 * 以不可误关的对话框展示，确认后直接进入后台；否则显示普通的令牌登录。
 */
export function LoginPage({ onAuthenticated, locale, onLocaleChange }: {
  onAuthenticated: () => void;
  locale: string;
  onLocaleChange: (locale: string) => void;
}): JSX.Element {
  const ui = useUI();
  const [claimed, setClaimed] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [token, setToken] = useState('');
  const [visible, setVisible] = useState(false);
  const [remember, setRemember] = useState(true);
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    bootstrap()
      .then(value => { if (active) setClaimed(value); })
      .catch(error => { if (active) toast.error(error); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = token.trim();
    if (!value) { setFieldError(ui.tokenRequired); return; }
    setPending(true);
    setFieldError(null);
    try {
      await login(value, remember);
      setToken('');
      onAuthenticated();
    } catch (error) {
      if (error instanceof AdminAPIError && error.status === 401) setFieldError(ui.tokenInvalid);
      else toast.error(error, ui.loginFailed);
    } finally {
      setPending(false);
    }
  };

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(ui.tokenCommand);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      toast.error(error, ui.copyFailed);
    }
  };

  return <div className={styles.page}>
    <NetworkBackground className={styles.network} />
    <div className={styles.locale}><LanguageSwitch value={locale} onChange={onLocaleChange} /></div>
    <main className={styles.center}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <img src={markSvg} alt="" width={34} height={38} />
          <h1>{ui.brandName}</h1>
        </div>
        <form onSubmit={event => void submit(event)} noValidate>
          <label htmlFor="admin-token" className={styles.label}>{ui.adminToken}</label>
          <div className={styles.field} data-invalid={fieldError ? true : undefined}>
            <KeyRound size={18} aria-hidden />
            <input id="admin-token" type={visible ? 'text' : 'password'} value={token} placeholder={ui.adminTokenPlaceholder}
              onChange={event => { setToken(event.target.value); setFieldError(null); }}
              autoFocus autoComplete="current-password" spellCheck={false} disabled={pending}
              aria-invalid={fieldError ? true : undefined} aria-describedby={fieldError ? 'admin-token-error' : undefined} />
            <Tooltip content={visible ? ui.hideSecret : ui.showSecret}>
              <button type="button" className={styles.eye} aria-label={visible ? ui.hideSecret : ui.showSecret} aria-pressed={visible} onClick={() => setVisible(value => !value)}>
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </Tooltip>
          </div>
          {fieldError && <p id="admin-token-error" className={styles.error} role="alert">{fieldError}</p>}
          <Checkbox className={styles.remember} checked={remember} onCheckedChange={setRemember} label={ui.keepSignedIn} />
          <Button type="submit" variant="dark" size="lg" className={styles.submit} loading={pending} disabled={checking}>{ui.login}</Button>
        </form>
        <div className={styles.help}>
          <p>{ui.tokenHelp}</p>
          <div className={styles.command}>
            <code>{ui.tokenCommand}</code>
            <Tooltip content={copied ? ui.copied : ui.copyCommand}>
              <button type="button" aria-label={ui.copyCommand} onClick={() => void copyCommand()}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>
            </Tooltip>
          </div>
          <p>{ui.tokenDockerHelp}</p>
        </div>
      </div>
      <p className={styles.version}>v{version}</p>
    </main>
    {claimed && <TokenRevealDialog token={claimed} title={ui.bootstrapTitle} description={ui.bootstrapHelp} confirmLabel={ui.enterConsole}
      onConfirm={async () => { await confirmBootstrap(); setClaimed(null); onAuthenticated(); }} />}
  </div>;
}
