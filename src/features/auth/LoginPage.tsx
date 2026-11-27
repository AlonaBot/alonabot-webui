import { useEffect, useState, type FormEvent, type JSX } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Check, Copy, Eye, EyeOff, HelpCircle, KeyRound, Moon, Sun } from 'lucide-react';
import { bootstrap, confirmBootstrap, login } from '../../api/auth';
import { AdminAPIError } from '../../api/client';
import { LanguageSwitch } from '../../components/LanguageSwitch';
import { useUI } from '../../i18n/UI';
import { cn } from '../../lib/cn';
import type { ThemeChoice } from '../../theme/theme';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { SpotlightCard } from '../../ui/SpotlightCard';
import { Tooltip } from '../../ui/Tooltip';
import { toast } from '../../ui/toast';
import { version } from '../../../package.json';
import { NetworkBackground } from './NetworkBackground';
import { TokenRevealDialog } from './TokenRevealDialog';

/**
 * 克制极简登录页：藏青/冰青正交点阵背景 + 干净居中表单卡片 + 按需展开 CLI 令牌气泡。
 */
export function LoginPage({
  onAuthenticated,
  locale,
  onLocaleChange,
  theme,
  onThemeChange,
}: {
  onAuthenticated: () => void;
  locale: string;
  onLocaleChange: (locale: string) => void;
  theme?: ThemeChoice;
  onThemeChange?: (choice: ThemeChoice) => void;
}): JSX.Element {
  const ui = useUI();
  const reduced = useReducedMotion();
  const [claimed, setClaimed] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [token, setToken] = useState('');
  const [visible, setVisible] = useState(false);
  const [remember, setRemember] = useState(true);
  const [pending, setPending] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const triggerLaunch = (): void => {
    if (reduced) {
      onAuthenticated();
      return;
    }
    setLaunching(true);
    window.setTimeout(() => {
      onAuthenticated();
    }, 340);
  };

  const isDark =
    theme === 'dark' ||
    ((!theme || theme === 'system') && typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark');

  useEffect(() => {
    let active = true;
    bootstrap()
      .then(value => {
        if (active) setClaimed(value);
      })
      .catch(error => {
        if (active) toast.error(error);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const value = token.trim();
    if (!value) {
      setFieldError(ui.tokenRequired);
      return;
    }
    setPending(true);
    setFieldError(null);
    try {
      await login(value, remember);
      setToken('');
      triggerLaunch();
    } catch (error: unknown) {
      if (error instanceof AdminAPIError && error.status === 401) {
        setFieldError(ui.tokenInvalid);
      } else {
        toast.error(error, ui.loginFailed);
      }
      setPending(false);
    }
  };

  const copyCommand = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(ui.tokenCommand);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error: unknown) {
      toast.error(error, ui.copyFailed);
    }
  };

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-12">
      <NetworkBackground className="pointer-events-none fixed inset-0 h-full w-full" />

      {/* 登录成功时的冰青光环跃迁层，无缝衔接主界面入场 */}
      {launching && !reduced && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.16 }}
        >
          <motion.div
            className="h-[360px] w-[360px] rounded-full"
            style={{
              background:
                'radial-gradient(circle, color-mix(in srgb, var(--color-accent) 34%, transparent) 0%, color-mix(in srgb, var(--color-cyan) 14%, transparent) 45%, transparent 72%)',
            }}
            initial={{ scale: 0.45, opacity: 0.9 }}
            animate={{ scale: 4.8, opacity: 0 }}
            transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
          />
          <motion.div
            className="absolute h-[220px] w-[220px] rounded-full border-2 border-[var(--color-accent)]/60"
            initial={{ scale: 0.6, opacity: 0.85 }}
            animate={{ scale: 5.2, opacity: 0 }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
          />
        </motion.div>
      )}

      {/* 顶部右侧快捷切换：亮暗主题 + 语言 */}
      <motion.div
        animate={launching && !reduced ? { opacity: 0, y: -8 } : { opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed top-4 right-4 z-20 flex items-center gap-2"
      >
        {onThemeChange && (
          <Tooltip content={isDark ? ui.themeLight : ui.themeDark}>
            <button
              type="button"
              onClick={() => onThemeChange(isDark ? 'light' : 'dark')}
              aria-label={isDark ? ui.themeLight : ui.themeDark}
              className="alona-glass inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </Tooltip>
        )}
        <div className="alona-glass rounded-full p-0.5">
          <LanguageSwitch value={locale} onChange={onLocaleChange} />
        </div>
      </motion.div>

      <motion.main
        initial={reduced ? false : { opacity: 0, scale: 0.985 }}
        animate={
          launching && !reduced
            ? { opacity: 0, scale: 1.06, y: -12, filter: 'blur(10px)' }
            : { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }
        }
        transition={
          reduced
            ? { duration: 0.01 }
            : launching
              ? { duration: 0.3, ease: [0.22, 1, 0.36, 1] }
              : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }
        }
        className="relative z-10 w-full max-w-[384px]"
      >
        <SpotlightCard className="alona-glass-elevated rounded-[18px] p-7">
          <h1 className="mb-5 text-center text-[19px] font-bold tracking-tight text-[var(--color-ink)]">
            {ui.loginHeading}
          </h1>

          <form onSubmit={event => void submit(event)} noValidate className="flex flex-col gap-4">
            <div>
              <label htmlFor="admin-token" className="visually-hidden">
                {ui.adminToken}
              </label>
              <div
                data-invalid={fieldError ? true : undefined}
                className={cn(
                  'flex h-11 items-center gap-2.5 rounded-xl border bg-[var(--color-surface-2)]/85 px-3.5 transition-all focus-within:bg-[var(--color-surface)] focus-within:ring-2',
                  fieldError
                    ? 'border-[var(--color-danger)] focus-within:ring-[color-mix(in_srgb,var(--color-danger)_22%,transparent)]'
                    : 'border-[var(--color-line)] focus-within:border-[var(--color-accent)] focus-within:ring-[color-mix(in_srgb,var(--color-accent)_20%,transparent)]',
                )}
              >
                <KeyRound size={15} className="shrink-0 text-[var(--color-accent)]" aria-hidden="true" />
                <input
                  id="admin-token"
                  type={visible ? 'text' : 'password'}
                  value={token}
                  placeholder={ui.adminToken}
                  onChange={event => {
                    setToken(event.target.value);
                    setFieldError(null);
                  }}
                  autoFocus
                  autoComplete="current-password"
                  spellCheck={false}
                  disabled={pending}
                  aria-invalid={fieldError ? true : undefined}
                  aria-describedby={fieldError ? 'admin-token-error' : undefined}
                  className="min-w-0 flex-1 bg-transparent font-mono text-sm text-[var(--color-ink)] outline-none placeholder:font-sans placeholder:text-[var(--color-ink-muted)]"
                />
                <Tooltip content={visible ? ui.hideSecret : ui.showSecret}>
                  <button
                    type="button"
                    aria-label={visible ? ui.hideSecret : ui.showSecret}
                    aria-pressed={visible}
                    onClick={() => setVisible(value => !value)}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]"
                  >
                    {visible ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </Tooltip>
              </div>
              {fieldError && (
                <p id="admin-token-error" role="alert" className="mt-1.5 text-xs font-medium text-[var(--color-danger)]">
                  {fieldError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <Checkbox checked={remember} onCheckedChange={setRemember} label={ui.keepSignedIn} />

              <Popover.Root>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    aria-label={ui.tokenHelp}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)]"
                  >
                    <HelpCircle size={13} aria-hidden="true" />
                    <span className="font-mono">CLI</span>
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    align="end"
                    sideOffset={8}
                    collisionPadding={16}
                    className="alona-glass-elevated z-[var(--z-popover)] w-[320px] max-w-[calc(100vw-32px)] space-y-2.5 rounded-2xl p-4 text-xs text-[var(--color-ink-muted)] shadow-[var(--shadow-popover)] outline-none"
                  >
                    <p className="leading-relaxed text-[var(--color-ink)]">{ui.tokenHelp}</p>
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2">
                      <code className="truncate font-mono text-[11px] text-[var(--color-ink)]">{ui.tokenCommand}</code>
                      <button
                        type="button"
                        aria-label={ui.copyCommand}
                        onClick={() => void copyCommand()}
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-accent)]"
                      >
                        {copied ? <Check size={13} className="text-[var(--color-success)]" /> : <Copy size={13} />}
                      </button>
                    </div>
                    <p className="leading-relaxed opacity-85">{ui.tokenDockerHelp}</p>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>

            <Button type="submit" variant="primary" size="lg" className="mt-1 w-full" loading={pending && !launching} disabled={checking || launching}>
              {launching ? (
                <>
                  <Check size={16} aria-hidden="true" />
                  <span>{ui.enteringConsole}</span>
                </>
              ) : (
                <>
                  <span>{ui.login}</span>
                  {!pending && <ArrowRight size={16} aria-hidden="true" />}
                </>
              )}
            </Button>
          </form>
        </SpotlightCard>

        <p className="tabular-nums mt-4 text-center font-mono text-[11px] text-[var(--color-ink-muted)]/75">
          v{version}
        </p>
      </motion.main>

      {claimed && (
        <TokenRevealDialog
          token={claimed}
          title={ui.bootstrapTitle}
          description={ui.bootstrapHelp}
          confirmLabel={ui.enterConsole}
          onConfirm={async () => {
            await confirmBootstrap();
            setClaimed(null);
            triggerLaunch();
          }}
        />
      )}
    </div>
  );
}
