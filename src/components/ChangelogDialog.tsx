import { useEffect, useState } from 'react';
import { Skeleton } from '../ui/EmptyState';
import { ExternalLink, X } from 'lucide-react';
import { getCoreChangelog, type Changelog } from '../api/core';
import { getPackageChangelog } from '../api/packages';
import { getLatestRelease, getSeenVersion, setSeenVersion, type LatestRelease } from '../api/webui';
import { useUI } from '../i18n/UI';
import chinese from '../../i18n/zh-CN.json';
import { compareVersions, unreadEntries } from '../pages/versions';
import { Markdown, safeLink } from './Markdown';
import { Dialog as SharedDialog } from '../ui/Dialog';

export function ChangelogDialog({ component, version, open, automatic = false, onClose }: { component: string; version: string; open: boolean; automatic?: boolean; onClose: () => void }) {
  const ui = useUI();
  const locale = ui === chinese.messages ? 'zh-CN' : 'en-US';
  const [entries, setEntries] = useState<Changelog['entries']>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [actualLocale, setActualLocale] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setError(''); setLoading(true); setEntries([]);
    Promise.all([component === 'core' ? getCoreChangelog(locale) : getPackageChangelog(component, locale), automatic ? getSeenVersion(component) : Promise.resolve({ version: null })]).then(([value, seen]) => {
      if (!active) return;
      const installed = value.entries.filter(entry => { const compared = compareVersions(entry.version, version); return compared === 0 || compared === -1; });
      // 全新安装还没有已读记录：直接记为已读当前版本，不在第一次登录时弹出整段更新说明。
      if (automatic && component === 'core' && seen.version === null) {
        void setSeenVersion(component, version).catch(err => { if (active) setError(String(err)); });
        return;
      }
      setEntries(unreadEntries(installed, seen.version)); setActualLocale(value.locale);
    }).catch(err => { if (active) setError(String(err)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [component, version, open, automatic, locale]);
  const visible = open && (!automatic || !!error || entries.length > 0);
  async function close() {
    if (saving) return;
    setSaving(true);
    try { if (entries.length) await setSeenVersion(component, entries[0].version); onClose(); } catch (err) { setError(String(err)); } finally { setSaving(false); }
  }
  return <SharedDialog open={visible} onOpenChange={value => { if (!value) void close(); }} title={<>{ui.changelog} · {component}</>} size="lg">{error && <pre role="alert" className="form-error">{error}</pre>}{loading && <Skeleton height={120} />}<div className="data-dialog-body" lang={actualLocale}>{entries.map(entry => <article className="changelog-entry" key={entry.version}><h3 className="font-mono">{entry.version} <small className="muted">{entry.date}</small></h3><Markdown text={entry.markdown} /></article>)}{!loading && !entries.length && !error && <p>{ui.noChangelog}</p>}</div></SharedDialog>;
}

export function ReleasePreview({ repo, onLoaded }: { repo: string; onLoaded?: (release: LatestRelease) => void }) {
  const ui = useUI();
  const [release, setRelease] = useState<LatestRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let active = true; setRelease(null); setFailed(null); setLoading(true);
    getLatestRelease(repo).then(value => { if (active) { setRelease(value); if (value) onLoaded?.(value); } }).catch(error => { if (active) setFailed(error instanceof Error ? error.message : String(error)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [repo]);
  return <section className="release-preview"><h3>{ui.releasePreview}</h3><p className="muted">{ui.releaseSource}: {repo}</p>{failed && <p role="alert" className="form-error">{ui.updateCheckFailed}<br />{failed}</p>}{loading && <p role="status">{ui.loadingUpdate}</p>}{!loading && !release && !failed && <p>{ui.noPublishedRelease}</p>}{release && <><h3>{release.version}</h3>{safeLink(release.release_url) && <a href={release.release_url} target="_blank" rel="noreferrer">GitHub <ExternalLink size={13} /></a>}<div className="data-dialog-body"><Markdown text={release.markdown} /></div></>}</section>;
}
