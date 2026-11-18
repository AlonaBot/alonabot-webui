import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageSwitch } from './components/LanguageSwitch';
import { UIContext } from './i18n/UI';
import { pickLocale } from './i18n/catalog';
import english from '../i18n/en-US.json';
import chinese from '../i18n/zh-CN.json';
import { routes } from './routes';
import { AppShell } from './shell/AppShell';
import { navigate, usePath } from './shell/router';
import './style.css';

const languageStorageKey = 'alonabot.webui.locale';
const catalogs = { 'en-US': english, 'zh-CN': chinese };

function AdminApp() {
  const [locale, setLocale] = useState(() => {
    const saved = localStorage.getItem(languageStorageKey);
    return pickLocale(Object.keys(catalogs), saved ? [saved] : navigator.languages);
  });
  const ui = catalogs[locale as keyof typeof catalogs].messages;
  const currentPath = usePath();

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `${ui.pageTitle} · AlonaBot`;
  }, [locale, ui.pageTitle]);

  // 开发环境下访问根路径时自动重定向至已有开发预览路由
  useEffect(() => {
    if (import.meta.env.DEV && (currentPath === '/' || currentPath === '')) {
      navigate('/dev/forms', { replace: true });
    }
  }, [currentPath]);

  const matchedRoute = routes.find(r => r.path === currentPath);

  return (
    <UIContext value={ui}>
      <AppShell version="v0.1.0">
        {import.meta.env.DEV && matchedRoute?.id === 'dev-forms' ? (
          <div className="dev-form-toolbar">
            <LanguageSwitch value={locale} onChange={tag => { localStorage.setItem(languageStorageKey, tag); setLocale(tag); }} />
          </div>
        ) : null}
        {matchedRoute ? (
          matchedRoute.render()
        ) : (
          <div className="shell-empty-view">
            <h2>AlonaBot WebUI</h2>
            <p>{ui.pageUnavailable}</p>
          </div>
        )}
      </AppShell>
    </UIContext>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<AdminApp />);
}
