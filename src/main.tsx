import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigForm } from './components/ConfigForm';
import { LanguageSwitch } from './components/LanguageSwitch';
import { UIContext } from './i18n/UI';
import { pickLocale } from './i18n/catalog';
import english from '../i18n/en-US.json';
import chinese from '../i18n/zh-CN.json';
import pluginChinese from '../fixtures/i18n/zh-CN.json';
import nested from '../fixtures/nested.config_schema.json';
import secrets from '../fixtures/secrets.config_schema.json';
import collections from '../fixtures/collections.config_schema.json';
import templates from '../fixtures/templates.config_schema.json';
import './style.css';

const languageStorageKey = 'alonabot.webui.locale';
const catalogs = { 'en-US': english, 'zh-CN': chinese };
const secretSet = { $secret_set: true };
// 预览值按管理读取的完整结构手写；表单本身不承担 SDK 的默认值补齐。
const examples = [
  { key: 'nested', label: 'fixtureNested', schema: nested, value: { welcome: 'Hello', reply: { prefix: '> ', mode: 'fast' }, level: 3, advanced: false, template: '' } },
  { key: 'secrets', label: 'fixtureSecrets', schema: secrets, value: { token: secretSet, backup: '', internal: 'v1', endpoint: 'https://example.com' } },
  { key: 'collections', label: 'fixtureCollections', schema: collections, value: { tags: ['news'], keywords: [], accounts: [{ name: 'demo', api_key: secretSet }], headers: {}, ratio: 0.5 } },
  { key: 'templates', label: 'fixtureTemplates', schema: templates, value: { music: { netease: { cookie: secretSet } }, sources: [{ rss: { url: 'https://example.com/feed', every_minutes: 30 } }, { webhook: { token: secretSet } }] } },
] as const;

function App() {
  const [locale, setLocale] = useState(() => {
    const saved = localStorage.getItem(languageStorageKey);
    return pickLocale(Object.keys(catalogs), saved ? [saved] : navigator.languages);
  });
  const [selected, setSelected] = useState(0);
  const [patch, setPatch] = useState<Record<string, unknown> | null>(null);
  const ui = catalogs[locale as keyof typeof catalogs].messages;
  const example = examples[selected];
  useEffect(() => { document.documentElement.lang = locale; document.title = `${ui.pageTitle} · AlonaBot`; }, [locale, ui.pageTitle]);
  return <UIContext value={ui}>
    <div className="page-shell">
      <header><a className="brand" href="/">AlonaBot <span>WEBUI</span></a>
        <LanguageSwitch value={locale} onChange={tag => { localStorage.setItem(languageStorageKey, tag); setLocale(tag); }} /></header>
      <main>
        <div className="page-heading"><h1>{ui.pageTitle}</h1><p>{ui.pageIntro}</p></div>
        <nav className="fixture-tabs" aria-label={ui.fixtureLabel}>{examples.map((item, index) =>
          <button key={item.key} type="button" aria-pressed={selected === index} onClick={() => { setSelected(index); setPatch(null); }}>{ui[item.label]}</button>)}</nav>
        <div className="workspace"><section className="form-panel" aria-label={ui[example.label]}>
          <ConfigForm key={example.key} schema={example.schema} value={example.value}
            messages={locale === 'zh-CN' ? pluginChinese : {}} onSubmit={setPatch} />
        </section><aside className="patch-panel"><h2>{ui.patchTitle}</h2>
          <p className="file-label">application/merge-patch+json</p>
          {patch === null ? <p className="empty-patch">{ui.patchEmpty}</p> : <pre aria-live="polite">{JSON.stringify(patch, null, 2)}</pre>}
        </aside></div>
      </main>
    </div>
  </UIContext>;
}
createRoot(document.getElementById('root')!).render(<App />);
