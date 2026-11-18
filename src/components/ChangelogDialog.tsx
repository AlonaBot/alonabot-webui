import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ExternalLink, X } from 'lucide-react';
import { getCoreChangelog, getPackageChangelog, type Changelog } from '../api/admin';
import { getLatestRelease, getSeenVersion, setSeenVersion, type LatestRelease } from '../api/webui';
import { useUI } from '../i18n/UI';
import chinese from '../../i18n/zh-CN.json';
import { compareVersions, unreadEntries } from '../pages/versions';
import { Markdown, safeLink } from './Markdown';

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
  return <Dialog.Root open={visible} onOpenChange={value => { if (!value) void close(); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content plugins-dialog-content" aria-describedby={undefined}><div className="dialog-header"><Dialog.Title className="dialog-title">{ui.changelog} · {component}</Dialog.Title><button className="dialog-close-button" disabled={saving} aria-label={ui.close} onClick={() => void close()}><X size={16} /></button></div>{error && <pre role="alert" className="form-error">{error}</pre>}{loading && <p role="status">{ui.loading}</p>}<div className="data-dialog-body" lang={actualLocale}>{entries.map(entry => <article className="changelog-entry" key={entry.version}><h3 className="font-mono">{entry.version} <small className="muted">{entry.date}</small></h3><Markdown text={entry.markdown} /></article>)}{!loading && !entries.length && !error && <p>{ui.noChangelog}</p>}</div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function ReleasePreview({ repo, onLoaded }: { repo: string; onLoaded?: (release: LatestRelease) => void }) {
  const ui = useUI();
  const [release, setRelease] = useState<LatestRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true; setRelease(null); setFailed(false); setLoading(true);
    getLatestRelease(repo).then(value => { if (active) { setRelease(value); if (value) onLoaded?.(value); } }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [repo]);
  return <section className="release-preview"><h3>{ui.releasePreview}</h3><p className="muted">{ui.releaseSource}: {repo}</p>{failed && <p role="alert" className="form-error">{ui.updateCheckFailed}</p>}{loading && <p role="status">{ui.loadingUpdate}</p>}{!loading && !release && !failed && <p>{ui.noPublishedRelease}</p>}{release && <>{release.error && <p role="status" className="form-error">{ui.updateCheckFailed}<br />{ui.cacheTime}: {release.fetched_at}</p>}<h3>{release.version}</h3>{safeLink(release.release_url) && <a href={release.release_url} target="_blank" rel="noreferrer">GitHub <ExternalLink size={13} /></a>}<div className="data-dialog-body"><Markdown text={release.markdown} /></div></>}</section>;
}
