import { useEffect, useState, type JSX } from 'react';
import { ExternalLink } from 'lucide-react';
import { getCoreChangelog, type Changelog } from '../api/core';
import { getPackageChangelog } from '../api/packages';
import { getLatestRelease, getSeenVersion, setSeenVersion, type LatestRelease } from '../api/webui';
import chinese from '../../i18n/zh-CN.json';
import { useUI } from '../i18n/UI';
import { compareVersions, unreadEntries } from '../pages/versions';
import { Dialog as SharedDialog } from '../ui/Dialog';
import { Skeleton } from '../ui/EmptyState';
import { Markdown, safeLink } from './Markdown';

export function ChangelogDialog({
  component,
  name,
  version,
  open,
  automatic = false,
  onClose,
}: {
  component: string;
  name?: string;
  version: string;
  open: boolean;
  automatic?: boolean;
  onClose: () => void;
}): JSX.Element {
  const ui = useUI();
  const locale = ui === chinese.messages ? 'zh-CN' : 'en-US';
  const [entries, setEntries] = useState<Changelog['entries']>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [actualLocale, setActualLocale] = useState('');
  const [saving, setSaving] = useState(false);
  const normalizedVersion = version.trim().replace(/^v/i, '');

  useEffect(() => {
    if (!open) return;
    // 本地开发版（如 dev）不是 SemVer，自动检测时跳过弹窗与已读上报，避免每页都弹出校验报错。
    if (automatic && compareVersions(normalizedVersion, normalizedVersion) !== 0) {
      setError('');
      setEntries([]);
      setLoading(false);
      return;
    }
    let active = true;
    setError('');
    setLoading(true);
    setEntries([]);
    Promise.all([
      component === 'core' ? getCoreChangelog(locale) : getPackageChangelog(component, locale),
      automatic ? getSeenVersion(component) : Promise.resolve({ version: null }),
    ])
      .then(([value, seen]) => {
        if (!active) return;
        const installed = value.entries.filter(entry => {
          const compared = compareVersions(entry.version, normalizedVersion);
          return compared === 0 || compared === -1;
        });
        // 全新安装还没有已读记录：直接记为已读当前版本，不在第一次登录时弹出整段更新说明。
        if (automatic && component === 'core' && seen.version === null) {
          void setSeenVersion(component, normalizedVersion).catch(err => {
            if (active) setError(String(err));
          });
          return;
        }
        setEntries(unreadEntries(installed, seen.version));
        setActualLocale(value.locale);
      })
      .catch(err => {
        if (active) setError(String(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [component, normalizedVersion, open, automatic, locale]);

  const visible = open && (!automatic || !!error || entries.length > 0);

  async function close(): Promise<void> {
    if (saving) return;
    setSaving(true);
    try {
      if (entries.length) await setSeenVersion(component, entries[0].version);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SharedDialog
      open={visible}
      onOpenChange={value => {
        if (!value) void close();
      }}
      title={`${ui.changelog} · ${name ?? component}`}
      size="lg"
    >
      {error && (
        <pre role="alert" className="form-error whitespace-pre-wrap break-words">
          {error}
        </pre>
      )}
      {loading && <Skeleton height={120} />}
      <div className="space-y-4 text-sm leading-relaxed text-[var(--color-ink)]" lang={actualLocale}>
        {entries.map(entry => (
          <article
            key={entry.version}
            className="rounded-xl border border-[var(--color-line)]/80 bg-[var(--color-surface-2)]/55 p-4"
          >
            <h3 className="mb-2 flex items-baseline gap-2 font-mono text-sm font-bold text-[var(--color-ink)]">
              <span>{entry.version}</span>
              <small className="font-sans text-xs font-normal text-[var(--color-ink-muted)]">{entry.date}</small>
            </h3>
            <div className="space-y-2 text-xs leading-relaxed text-[var(--color-ink-muted)]">
              <Markdown text={entry.markdown} />
            </div>
          </article>
        ))}
        {!loading && !entries.length && !error && (
          <p className="py-6 text-center text-sm text-[var(--color-ink-muted)]">{ui.noChangelog}</p>
        )}
      </div>
    </SharedDialog>
  );
}

export function ReleasePreview({
  repo,
  onLoaded,
}: {
  repo: string;
  onLoaded?: (release: LatestRelease) => void;
}): JSX.Element {
  const ui = useUI();
  const [release, setRelease] = useState<LatestRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setRelease(null);
    setFailed(null);
    setLoading(true);
    getLatestRelease(repo)
      .then(value => {
        if (active) {
          setRelease(value);
          if (value) onLoaded?.(value);
        }
      })
      .catch(error => {
        if (active) setFailed(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repo]);

  return (
    <section className="space-y-2.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)]/55 p-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--color-ink)]">{ui.releasePreview}</h3>
        <span className="font-mono text-[11px] text-[var(--color-ink-muted)]">
          {ui.releaseSource}: {repo}
        </span>
      </div>
      {failed && (
        <p role="alert" className="form-error mb-0">
          {ui.updateCheckFailed}
          <br />
          {failed}
        </p>
      )}
      {loading && (
        <p role="status" className="text-[var(--color-ink-muted)]">
          {ui.loadingUpdate}
        </p>
      )}
      {!loading && !release && !failed && <p className="text-[var(--color-ink-muted)]">{ui.noPublishedRelease}</p>}
      {release && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-sm font-bold text-[var(--color-accent-strong)]">{release.version}</span>
            {safeLink(release.release_url) && (
              <a
                href={release.release_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-[var(--color-accent)] hover:underline"
              >
                <span>GitHub</span>
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}
          </div>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-[var(--color-line)]/70 bg-[var(--color-surface)]/80 p-3 leading-relaxed text-[var(--color-ink-muted)]">
            <Markdown text={release.markdown} />
          </div>
        </div>
      )}
    </section>
  );
}
