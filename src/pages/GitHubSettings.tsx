import { useEffect, useState } from 'react';
import { getGitHubSettings, setGitHubSettings, type GitHubSettings as Values } from '../api/admin';
import { useUI } from '../i18n/UI';

/** GitHubSettings 编辑 Core 持久下载设置，后续安装与更新读取保存后的值。 */
export function GitHubSettings() {
  const ui = useUI();
  const [value, setValue] = useState<Values | null>(null);
  const [saved, setSaved] = useState<Values | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setBusy(true); setError(null);
    try { const next = await getGitHubSettings(); setValue(next); setSaved(next); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);
  return <section className="settings-card">
    <h2 className="settings-card-title">{ui.githubDownloads}</h2>
    {error && <div className="plugins-error-banner" role="alert">{error}<button type="button" disabled={busy} onClick={() => void load()}>{ui.refresh}</button></div>}
    {!value && !error && <p role="status">{ui.loading}</p>}
    {value && <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(null);
      try { await setGitHubSettings(value); const next = await getGitHubSettings(); setValue(next); setSaved(next); }
      catch (error) { setError(error instanceof Error ? error.message : String(error)); }
      finally { setBusy(false); }
    }}><fieldset className="settings-fields" disabled={busy}>
      <div className="settings-row"><div className="settings-label-col"><label htmlFor="github-api-base"><strong>{ui.githubAPIBase}</strong></label><p>{ui.githubAPIBaseHint}</p></div><div className="settings-control-col"><input id="github-api-base" type="url" value={value.github_api_base} placeholder="https://api.github.com" onChange={event => setValue({ ...value, github_api_base: event.target.value })} /></div></div>
      <div className="settings-row"><div className="settings-label-col"><label htmlFor="github-download-prefix"><strong>{ui.githubDownloadPrefix}</strong></label><p>{ui.githubDownloadPrefixHint}</p></div><div className="settings-control-col"><input id="github-download-prefix" type="url" value={value.github_download_prefix} placeholder="https://proxy.example/" onChange={event => setValue({ ...value, github_download_prefix: event.target.value })} /></div></div>
      <div className="settings-row"><p className="settings-download-example">{ui.githubDownloadExample}</p><button type="submit" disabled={value.github_api_base === saved?.github_api_base && value.github_download_prefix === saved?.github_download_prefix}>{busy ? ui.loading : ui.save}</button></div>
    </fieldset></form>}
  </section>;
}
