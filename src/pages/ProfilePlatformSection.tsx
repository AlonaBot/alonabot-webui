import { useEffect, useState, type ChangeEvent, type FormEvent, type JSX } from 'react';
import { Plus, X } from 'lucide-react';
import {
  getProfilePlatform,
  putProfilePlatform,
  type ProfilePlatform,
} from '../api/admin';
import { useUI } from '../i18n/UI';

/** ProfilePlatformSection 负责展示与编辑配置文件的平台与消息设置。 */
export function ProfilePlatformSection(props: { profileID: string }): JSX.Element {
  const { profileID } = props;
  const ui = useUI();

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const [defaultPlatform, setDefaultPlatform] = useState<ProfilePlatform | null>(null);
  const [currentPlatform, setCurrentPlatform] = useState<ProfilePlatform | null>(null);

  // 本地草稿状态
  const [prefixes, setPrefixes] = useState<string[] | null>(null);
  const [newPrefix, setNewPrefix] = useState('');
  const [prefixError, setPrefixError] = useState<string | null>(null);

  const [mentionSender, setMentionSender] = useState<boolean | null>(null);
  const [quote, setQuote] = useState<boolean | null>(null);
  const [replyPrefix, setReplyPrefix] = useState<string | null>(null);
  const [forwardThreshold, setForwardThreshold] = useState<number | null>(null);

  const loadData = async (clearError = true) => {
    setLoading(true);
    if (clearError) setErrorBanner(null);
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
      const message = err instanceof Error ? err.message : String(err);
      setErrorBanner(previous => !clearError && previous ? previous + '\n' + message : message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [profileID]);

  // 前缀增删操作
  const effectivePrefixes = prefixes ?? defaultPlatform?.command_prefixes ?? [];
  const isPrefixOverridden = profileID === 'default' || prefixes !== null;

  const handleAddPrefix = () => {
    const trimmed = newPrefix;
    setPrefixError(null);
    const target = prefixes ?? [...defaultPlatform!.command_prefixes!];
    if (target.includes(trimmed)) {
      setNewPrefix('');
      return;
    }
    setPrefixes([...target, trimmed]);
    setNewPrefix('');
  };

  const handleRemovePrefix = (prefixToRemove: string) => {
    const target = prefixes ?? defaultPlatform!.command_prefixes!;
    if (target.length <= 1) {
      setPrefixError(ui.atLeastOnePrefix);
      return;
    }
    setPrefixError(null);
    setPrefixes(target.filter(p => p !== prefixToRemove));
  };

  const handleResetPrefixes = () => {
    setPrefixError(null);
    setPrefixes(null);
  };

  // 提交保存
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    setSuccessBanner(null);

    // 校验前缀：若非跟随默认或为 default，前缀数组必须非空
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
      setSuccessBanner(ui.saveSuccess);
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally { await loadData(false); setBusy(false); }
  };

  if (!currentPlatform || !defaultPlatform) {
    return <div className="profile-section-loading"><p role={errorBanner ? "alert" : "status"}>{errorBanner ?? ui.loading}</p></div>;
  }

  // 默认值解析（供非 default 配置文件显示基线）
  const defMention = defaultPlatform.reply.mention_sender!;
  const defQuote = defaultPlatform.reply.quote!;
  const defPrefix = defaultPlatform.reply.prefix!;
  const defThreshold = defaultPlatform.reply.forward_threshold!;

  return (
    <form className="profile-platform-section" onSubmit={handleSubmit}>
      {errorBanner && (
        <div className="plugins-error-banner" role="alert">
          <span>{errorBanner}</span>
          <button type="button" className="error-banner-close" aria-label={ui.close} onClick={() => setErrorBanner(null)}>
            &times;
          </button>
        </div>
      )}

      {successBanner && (
        <div className="plugins-success-banner" role="status">
          <span>{successBanner}</span>
        </div>
      )}

      <fieldset className="config-edit-fields" disabled={busy || loading}>
      {/* 命令设置卡片 */}
      <div className="profile-section-group">
        <h3 className="profile-section-title">{ui.sectionCommand}</h3>
        <div className="profile-card">
          <div className="profile-card-row profile-prefixes-row">
            <div className="profile-row-info">
              <span className="profile-row-title">{ui.commandPrefixes}</span>
              {profileID !== 'default' && (
                <div className="profile-row-inherit-status">
                  {isPrefixOverridden ? (
                    <button type="button" className="profile-inherit-btn" onClick={handleResetPrefixes}>
                      {ui.followDefault}
                    </button>
                  ) : (
                    <span className="profile-inherit-badge">{ui.followDefault}</span>
                  )}
                </div>
              )}
            </div>

            <div className="profile-tag-editor">
              <div className="profile-tags-list">
                {effectivePrefixes.map(prefix => (
                  <span key={prefix} className="profile-tag-pill">
                    <span className="profile-tag-text font-mono">{prefix === '' ? ui.emptyCommandPrefix : prefix}</span>
                    {isPrefixOverridden && (
                      <button
                        type="button"
                        className="profile-tag-remove"
                        aria-label={`${ui.removeRow} ${prefix || ui.emptyCommandPrefix}`}
                        onClick={() => handleRemovePrefix(prefix)}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </span>
                ))}
              </div>

              {(!isPrefixOverridden && profileID !== 'default') ? (
                <button
                  type="button"
                  className="profile-customize-btn"
                  onClick={() => setPrefixes([...effectivePrefixes])}
                >
                  <Plus size={14} />
                  <span>{ui.addPrefix}</span>
                </button>
              ) : (
                <div className="profile-tag-input-box">
                  <input
                    type="text"
                    aria-label={ui.addPrefix}
                    value={newPrefix}
                    placeholder={ui.addPrefix}
                    className="profile-tag-input font-mono"
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setNewPrefix(e.currentTarget.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddPrefix();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="profile-tag-add-btn"
                    aria-label={newPrefix ? ui.addPrefix : ui.emptyCommandPrefix}
                    onClick={handleAddPrefix}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
          {prefixError && <p className="form-error profile-prefix-error" role="alert">{prefixError}</p>}
        </div>
      </div>

      {/* 回复设置卡片 */}
      <div className="profile-section-group">
        <h3 className="profile-section-title">{ui.sectionReply}</h3>
        <div className="profile-card">
          {/* 回复时 @ 发送人 */}
          <div className="profile-card-row">
            <div className="profile-row-info">
              <span className="profile-row-title">{ui.mentionSender}</span>
              {profileID !== 'default' && (
                <div className="profile-row-inherit-status">
                  {mentionSender !== null ? (
                    <button type="button" className="profile-inherit-btn" onClick={() => setMentionSender(null)}>
                      {ui.followDefault}
                    </button>
                  ) : (
                    <span className="profile-inherit-badge">{ui.followDefault}</span>
                  )}
                </div>
              )}
            </div>
            <label className="plugin-switch-label">
              <input
                type="checkbox"
                aria-label={ui.mentionSender}
                checked={mentionSender !== null ? mentionSender : defMention}
                onChange={e => setMentionSender(e.currentTarget.checked)}
              />
              <span className="plugin-switch-slider" />
            </label>
          </div>

          {/* 引用原消息 */}
          <div className="profile-card-row">
            <div className="profile-row-info">
              <span className="profile-row-title">{ui.quoteOriginal}</span>
              {profileID !== 'default' && (
                <div className="profile-row-inherit-status">
                  {quote !== null ? (
                    <button type="button" className="profile-inherit-btn" onClick={() => setQuote(null)}>
                      {ui.followDefault}
                    </button>
                  ) : (
                    <span className="profile-inherit-badge">{ui.followDefault}</span>
                  )}
                </div>
              )}
            </div>
            <label className="plugin-switch-label">
              <input
                type="checkbox"
                aria-label={ui.quoteOriginal}
                checked={quote !== null ? quote : defQuote}
                onChange={e => setQuote(e.currentTarget.checked)}
              />
              <span className="plugin-switch-slider" />
            </label>
          </div>

          {/* 回复前缀 */}
          <div className="profile-card-row">
            <div className="profile-row-info">
              <span className="profile-row-title">{ui.replyPrefix}</span>
              {profileID !== 'default' && (
                <div className="profile-row-inherit-status">
                  {replyPrefix !== null ? (
                    <button type="button" className="profile-inherit-btn" onClick={() => setReplyPrefix(null)}>
                      {ui.followDefault}
                    </button>
                  ) : (
                    <span className="profile-inherit-badge">{ui.followDefault}</span>
                  )}
                </div>
              )}
            </div>
            <input
              type="text"
              aria-label={ui.replyPrefix}
              className="profile-text-input font-mono"
              placeholder={profileID !== 'default' && replyPrefix === null ? (defPrefix || ui.replyPrefixPlaceholder) : ui.replyPrefixPlaceholder}
              value={replyPrefix !== null ? replyPrefix : defPrefix}
              onChange={e => setReplyPrefix(e.currentTarget.value)}
            />
          </div>

          {/* 长回复合并转发 */}
          <div className="profile-card-row">
            <div className="profile-row-info">
              <span className="profile-row-title">{ui.forwardThreshold}</span>
              <span className="profile-row-desc">{ui.forwardThresholdDesc}</span>
              {profileID !== 'default' && (
                <div className="profile-row-inherit-status">
                  {forwardThreshold !== null ? (
                    <button type="button" className="profile-inherit-btn" onClick={() => setForwardThreshold(null)}>
                      {ui.followDefault}
                    </button>
                  ) : (
                    <span className="profile-inherit-badge">{ui.followDefault}</span>
                  )}
                </div>
              )}
            </div>
            <input type="number" className="profile-text-input" aria-label={ui.forwardThreshold} required min={0} step={1}
              value={forwardThreshold ?? defThreshold} onChange={event => setForwardThreshold(event.target.valueAsNumber)} />
          </div>
        </div>
      </div>

      <div className="profile-actions-bar">
        <button type="submit" className="save-button">
          {ui.save}
        </button>
      </div>
      </fieldset>
    </form>
  );
}
