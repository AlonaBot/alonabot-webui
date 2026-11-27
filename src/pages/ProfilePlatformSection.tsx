import { useEffect, useState, type ChangeEvent, type FormEvent, type JSX } from 'react';
import { MessageSquareReply, Plus, RotateCcw, Terminal, X } from 'lucide-react';
import { getProfilePlatform, putProfilePlatform, type ProfilePlatform } from '../api/profiles';
import { useUI } from '../i18n/UI';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/EmptyState';
import { SpotlightCard } from '../ui/SpotlightCard';
import { Switch } from '../ui/Switch';
import { toast } from '../ui/toast';

/** ProfilePlatformSection 负责展示与编辑配置文件的平台命令前缀与消息回复偏好。 */
export function ProfilePlatformSection({ profileID }: { profileID: string }): JSX.Element {
  const ui = useUI();

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [defaultPlatform, setDefaultPlatform] = useState<ProfilePlatform | null>(null);
  const [currentPlatform, setCurrentPlatform] = useState<ProfilePlatform | null>(null);

  const [prefixes, setPrefixes] = useState<string[] | null>(null);
  const [newPrefix, setNewPrefix] = useState('');
  const [prefixError, setPrefixError] = useState<string | null>(null);

  const [mentionSender, setMentionSender] = useState<boolean | null>(null);
  const [quote, setQuote] = useState<boolean | null>(null);
  const [replyPrefix, setReplyPrefix] = useState<string | null>(null);
  const [forwardThreshold, setForwardThreshold] = useState<number | null>(null);

  const loadData = async (): Promise<void> => {
    try {
      const current = await getProfilePlatform(profileID);
      setCurrentPlatform(current);

      let def = current;
      if (profileID !== 'default') {
        def = await getProfilePlatform('default');
      }
      setDefaultPlatform(def);

      setPrefixes(current.command_prefixes);
      setMentionSender(current.reply.mention_sender);
      setQuote(current.reply.quote);
      setReplyPrefix(current.reply.prefix);
      setForwardThreshold(current.reply.forward_threshold);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void loadData();
  }, [profileID]);

  const effectivePrefixes = prefixes ?? defaultPlatform?.command_prefixes ?? [];
  const isPrefixOverridden = profileID === 'default' || prefixes !== null;

  const handleAddPrefix = (): void => {
    const candidate = newPrefix;
    setPrefixError(null);
    const baseList = prefixes ?? [...(defaultPlatform?.command_prefixes ?? [])];
    if (baseList.includes(candidate)) {
      setNewPrefix('');
      return;
    }
    setPrefixes([...baseList, candidate]);
    setNewPrefix('');
  };

  const handleRemovePrefix = (prefixToRemove: string): void => {
    const baseList = prefixes ?? [...(defaultPlatform?.command_prefixes ?? [])];
    if (baseList.length <= 1) {
      setPrefixError(ui.atLeastOnePrefix);
      return;
    }
    setPrefixError(null);
    setPrefixes(baseList.filter(p => p !== prefixToRemove));
  };

  const handleResetPrefixes = (): void => {
    setPrefixError(null);
    setPrefixes(null);
  };

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (profileID === 'default' && (!prefixes || prefixes.length === 0)) {
      setPrefixError(ui.atLeastOnePrefix);
      return;
    }
    if (prefixes !== null && prefixes.length === 0) {
      setPrefixError(ui.atLeastOnePrefix);
      return;
    }

    const payload: ProfilePlatform = {
      command_prefixes: prefixes,
      reply: {
        mention_sender: mentionSender,
        quote,
        prefix: replyPrefix,
        forward_threshold: forwardThreshold,
      },
    };

    setBusy(true);
    try {
      await putProfilePlatform(profileID, payload);
      toast.success(ui.saveSuccess);
    } catch (err: unknown) {
      toast.error(err);
    } finally {
      await loadData();
      setBusy(false);
    }
  };

  if (!currentPlatform || !defaultPlatform) {
    return (
      <SpotlightCard className="p-5">
        <Skeleton height={160} />
      </SpotlightCard>
    );
  }

  const defMention = defaultPlatform.reply.mention_sender ?? false;
  const defQuote = defaultPlatform.reply.quote ?? false;
  const defPrefix = defaultPlatform.reply.prefix ?? '';
  const defThreshold = defaultPlatform.reply.forward_threshold ?? 0;

  const inheritBadge = (overridden: boolean, onReset: () => void): JSX.Element | null => {
    if (profileID === 'default') return null;
    if (!overridden) {
      return (
        <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-ink-muted)]">
          {ui.followDefault}
        </span>
      );
    }
    return (
      <button
        type="button"
        onClick={onReset}
        className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--color-accent)_35%,transparent)] bg-[var(--color-accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-accent-strong)] transition-colors hover:brightness-105"
      >
        <RotateCcw size={11} aria-hidden="true" />
        {ui.followDefault}
      </button>
    );
  };

  return (
    <form onSubmit={e => void handleSubmit(e)}>
      <fieldset disabled={busy || loading} className="m-0 space-y-5 border-0 p-0">
        {/* 命令前缀卡片 */}
        <SpotlightCard className="p-5">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
              <Terminal size={16} aria-hidden="true" />
            </span>
            <h3 className="text-base font-semibold text-[var(--color-ink)]">{ui.sectionCommand}</h3>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-sm font-medium text-[var(--color-ink)]">{ui.commandPrefixes}</span>
              {inheritBadge(isPrefixOverridden, handleResetPrefixes)}
            </div>

            <div className="flex flex-col items-stretch gap-2.5 sm:items-end">
              <div className="flex flex-wrap gap-1.5 sm:justify-end">
                {effectivePrefixes.map(prefix => (
                  <span
                    key={prefix}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] py-1 pr-1.5 pl-3 font-mono text-xs font-medium text-[var(--color-ink)]"
                  >
                    <span>{prefix === '' ? ui.emptyCommandPrefix : prefix}</span>
                    {isPrefixOverridden && (
                      <button
                        type="button"
                        aria-label={`${ui.removeRow} ${prefix || ui.emptyCommandPrefix}`}
                        onClick={() => handleRemovePrefix(prefix)}
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--color-ink-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-danger)_16%,transparent)] hover:text-[var(--color-danger)]"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </span>
                ))}
              </div>

              {!isPrefixOverridden && profileID !== 'default' ? (
                <Button
                  size="sm"
                  variant="soft"
                  icon={<Plus size={14} />}
                  onClick={() => setPrefixes([...effectivePrefixes])}
                >
                  {ui.addPrefix}
                </Button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    aria-label={ui.addPrefix}
                    value={newPrefix}
                    placeholder={ui.addPrefix}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setNewPrefix(e.currentTarget.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddPrefix();
                      }
                    }}
                    className="h-9 min-w-[160px] flex-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 font-mono text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
                  />
                  <Button
                    size="sm"
                    variant="soft"
                    iconOnly
                    aria-label={newPrefix ? ui.addPrefix : ui.emptyCommandPrefix}
                    onClick={handleAddPrefix}
                  >
                    <Plus size={14} />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {prefixError && (
            <p className="form-error mt-3 mb-0" role="alert">
              {prefixError}
            </p>
          )}
        </SpotlightCard>

        {/* 回复设置卡片 */}
        <SpotlightCard className="p-5">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
              <MessageSquareReply size={16} aria-hidden="true" />
            </span>
            <h3 className="text-base font-semibold text-[var(--color-ink)]">{ui.sectionReply}</h3>
          </div>

          <div className="divide-y divide-[var(--color-line)]/70">
            <div className="flex items-center justify-between gap-4 py-3.5 first:pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-[var(--color-ink)]">{ui.mentionSender}</span>
                {inheritBadge(mentionSender !== null, () => setMentionSender(null))}
              </div>
              <Switch
                aria-label={ui.mentionSender}
                checked={mentionSender !== null ? mentionSender : defMention}
                onCheckedChange={setMentionSender}
              />
            </div>

            <div className="flex items-center justify-between gap-4 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-[var(--color-ink)]">{ui.quoteOriginal}</span>
                {inheritBadge(quote !== null, () => setQuote(null))}
              </div>
              <Switch
                aria-label={ui.quoteOriginal}
                checked={quote !== null ? quote : defQuote}
                onCheckedChange={setQuote}
              />
            </div>

            <div className="flex flex-col gap-2.5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-[var(--color-ink)]">{ui.replyPrefix}</span>
                {inheritBadge(replyPrefix !== null, () => setReplyPrefix(null))}
              </div>
              <input
                type="text"
                aria-label={ui.replyPrefix}
                placeholder={
                  profileID !== 'default' && replyPrefix === null
                    ? defPrefix || ui.replyPrefixPlaceholder
                    : ui.replyPrefixPlaceholder
                }
                value={replyPrefix !== null ? replyPrefix : defPrefix}
                onChange={e => setReplyPrefix(e.currentTarget.value)}
                className="h-9 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 font-mono text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] sm:w-[220px]"
              />
            </div>

            <div className="flex flex-col gap-2.5 py-3.5 last:pb-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-[var(--color-ink)]">{ui.forwardThreshold}</span>
                  {inheritBadge(forwardThreshold !== null, () => setForwardThreshold(null))}
                </div>
                <p className="text-xs text-[var(--color-ink-muted)]">{ui.forwardThresholdDesc}</p>
              </div>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label={ui.forwardThreshold}
                required
                value={forwardThreshold ?? defThreshold}
                onChange={event =>
                  setForwardThreshold(event.target.value === '' ? 0 : Number(event.target.value))
                }
                className="tabular-nums h-9 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 font-mono text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] sm:w-[140px]"
              />
            </div>
          </div>

          <div className="mt-5 flex justify-end border-t border-[var(--color-line)]/70 pt-4">
            <Button type="submit" variant="primary" loading={busy}>
              {ui.save}
            </Button>
          </div>
        </SpotlightCard>
      </fieldset>
    </form>
  );
}
