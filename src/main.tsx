import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageSwitch } from './components/LanguageSwitch';
import { UIContext } from './i18n/UI';
import { pickLocale } from './i18n/catalog';
import english from '../i18n/en-US.json';
import chinese from '../i18n/zh-CN.json';
import { routes, setCachedCore } from './routes';
import { AppShell } from './shell/AppShell';
import { navigate, usePath } from './shell/router';
import { AdminAPIError, getCore, logout, onSessionExpired, restoreSession, type CoreInfo } from './api/admin';
import { LoginPage } from './pages/LoginPage';
import { PluginDetailPage } from './pages/PluginDetailPage';
import { useTheme } from './theme/theme';
import './style.css';

const languageStorageKey = 'alonabot.webui.locale';
const catalogs = { 'en-US': english, 'zh-CN': chinese };

function AdminApp() {
  useTheme();
  const [locale, setLocale] = useState(() => {
    const saved = localStorage.getItem(languageStorageKey);
    return pickLocale(Object.keys(catalogs), saved ? [saved] : navigator.languages);
  });
  const ui = catalogs[locale as keyof typeof catalogs].messages;
  const currentPath = usePath();

  const [sessionState, setSessionState] = useState<'checking' | 'authenticated' | 'unauthenticated' | 'failed'>('checking');
  const [coreInfo, setCoreInfo] = useState<CoreInfo | null>(null);

  const [appError, setAppError] = useState<string | null>(null);

  const restore = async () => {
    setSessionState('checking');
    setAppError(null);
    try {
      await restoreSession();
      setSessionState('authenticated');
    } catch (error) {
      if (error instanceof AdminAPIError && error.status === 401) {
        setSessionState('unauthenticated');
      } else {
        setAppError(error instanceof Error ? error.message : String(error));
        setSessionState('failed');
      }
    }
  };

  const loadCore = async () => {
    setAppError(null);
    try {
      const core = await getCore();
      setCachedCore(core);
      setCoreInfo(core);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    const unsubscribe = onSessionExpired(() => {
      setCachedCore(null);
      setCoreInfo(null);
      setSessionState('unauthenticated');
      navigate('/login', { replace: true });
    });
    void restore();
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (sessionState === 'authenticated') void loadCore();
  }, [sessionState]);

  // 路由跳转与鉴权保护
  useEffect(() => {
    if (sessionState === 'authenticated') {
      if (currentPath === '/' || currentPath === '' || currentPath === '/login') {
        navigate('/overview', { replace: true });
      }
    } else if (sessionState === 'unauthenticated') {
      if (import.meta.env.DEV && currentPath === '/dev/forms') {
        return;
      }
      if (currentPath !== '/login') {
        navigate('/login', { replace: true });
      }
    }
  }, [sessionState, currentPath]);

  // 设置页面语言与标题
  useEffect(() => {
    document.documentElement.lang = locale;
    const labels = ui as Record<string, string>;
    if (currentPath === '/login') {
      document.title = `${ui.loginTitle} · AlonaBot`;
    } else if (currentPath.startsWith('/components/')) {
      document.title = `${ui.plugins} · AlonaBot`;
    } else {
      const activeRoute = routes.find(r => r.path === currentPath);
      const title = activeRoute ? labels[activeRoute.label] : ui.overview;
      document.title = `${title} · AlonaBot`;
    }
  }, [locale, currentPath, ui]);

  const handleAuthenticated = () => {
    setAppError(null);
    setSessionState('authenticated');
    navigate('/overview', { replace: true });
  };

  const handleLogout = async () => {
    try {
      await logout();
      setCachedCore(null);
      setCoreInfo(null);
      setSessionState('unauthenticated');
      navigate('/login', { replace: true });
    } catch (error) {
      setAppError(error instanceof Error ? error.message : String(error));
    }
  };

  if (sessionState === 'checking' || sessionState === 'failed') {
    return <UIContext value={ui}><div className="shell-empty-view">
      {appError ? <><p role="alert">{appError}</p><button type="button" onClick={() => void restore()}>{ui.refresh}</button></> : <p role="status">{ui.loading}</p>}
    </div></UIContext>;
  }

  // 未登录时显示登录页（开发环境下允许直接查看 /dev/forms）
  if (sessionState === 'unauthenticated' && !(import.meta.env.DEV && currentPath === '/dev/forms')) {
    return (
      <UIContext value={ui}>
        <div className="login-wrapper">
          <div className="login-locale-bar">
            <LanguageSwitch
              value={locale}
              onChange={tag => {
                localStorage.setItem(languageStorageKey, tag);
                setLocale(tag);
              }}
            />
          </div>
          <LoginPage onAuthenticated={handleAuthenticated} />
        </div>
      </UIContext>
    );
  }

  const matchedRoute = routes.find(r => r.path === currentPath);
  const isComponentDetail = currentPath.startsWith('/components/');
  const componentId = isComponentDetail ? decodeURIComponent(currentPath.slice('/components/'.length)) : '';

  return (
    <UIContext value={ui}>
      <AppShell
        version={coreInfo?.version ?? ui.loading}
        onLogout={handleLogout}
      >
        {appError && <div className="plugins-error-banner" role="alert"><span>{appError}</span><button type="button" onClick={() => void loadCore()}>{ui.refresh}</button></div>}
        {import.meta.env.DEV && matchedRoute?.id === 'dev-forms' ? (
          <div className="dev-form-toolbar">
            <LanguageSwitch
              value={locale}
              onChange={tag => {
                localStorage.setItem(languageStorageKey, tag);
                setLocale(tag);
              }}
            />
          </div>
        ) : null}

        {isComponentDetail && componentId ? (
          <PluginDetailPage key={componentId} id={componentId} />
        ) : matchedRoute ? (
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
