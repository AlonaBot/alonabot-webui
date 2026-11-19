import { useEffect, useMemo, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import * as Dialog from '@radix-ui/react-dialog';
import { LanguageSwitch } from './components/LanguageSwitch';
import { UIContext } from './i18n/UI';
import { pickLocale } from './i18n/catalog';
import english from '../i18n/en-US.json';
import chinese from '../i18n/zh-CN.json';
import { routes, setCachedCore } from './routes';
import { AppShell } from './shell/AppShell';
import { navigate, usePath } from './shell/router';
import { UISettingsContext, type UISettings } from './shell/settings';
import {
  AdminAPIError,
  getCore,
  logout,
  onSessionExpired,
  restoreSession,
  setClientLocale,
  type CoreInfo,
} from './api/admin';
import { LoginPage } from './pages/LoginPage';
import { PluginDetailPage } from './pages/PluginDetailPage';
import { getLatestRelease, type LatestRelease } from './api/webui';
import { compareVersions } from './pages/versions';
import { ChangelogDialog } from './components/ChangelogDialog';
import { useTheme } from './theme/theme';
import './style.css';

const languageStorageKey = 'alonabot.webui.locale';
const catalogs = { 'en-US': english, 'zh-CN': chinese };

function AdminApp() {
  const [theme, setTheme] = useTheme();
  const [locale, setLocale] = useState(() => {
    const saved = localStorage.getItem(languageStorageKey);
    const initial = pickLocale(Object.keys(catalogs), saved ? [saved] : navigator.languages);
    setClientLocale(initial);
    return initial;
  });
  const ui = catalogs[locale as keyof typeof catalogs].messages;
  const currentPath = usePath();

  const [sessionState, setSessionState] = useState<'checking' | 'authenticated' | 'unauthenticated' | 'failed'>('checking');
  const [coreInfo, setCoreInfo] = useState<CoreInfo | null>(null);

  const [coreUpdateFailed, setCoreUpdateFailed] = useState(false);
  const [latestCore, setLatestCore] = useState<LatestRelease | null>(null);
  const [showCoreContent, setShowCoreContent] = useState(true);
  const [appError, setAppError] = useState<string | null>(null);

  // 令牌轮换后持有结果对话框，独立于已认证页面展示
  const [rotatedToken, setRotatedToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [tokenCopyError, setTokenCopyError] = useState<string | null>(null);

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

  useEffect(() => {
    if (sessionState !== 'authenticated') return;
    let active = true;
    setCoreUpdateFailed(false); setLatestCore(null);
    getLatestRelease('AlonaBot/AlonaBot').then(value => { if (active) { setLatestCore(value); setCoreUpdateFailed(!!value?.error); } }).catch(() => { if (active) setCoreUpdateFailed(true); });
    return () => { active = false; };
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
    setClientLocale(locale);
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

  const handleLogout = useCallback(async () => {
    try {
      await logout();
      setCachedCore(null);
      setCoreInfo(null);
      setSessionState('unauthenticated');
      navigate('/login', { replace: true });
    } catch (error) {
      setAppError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const handleTokenRotated = useCallback((token: string) => {
    setTokenCopied(false); setTokenCopyError(null);
    setRotatedToken(token);
    setCachedCore(null);
    setCoreInfo(null);
    setSessionState('unauthenticated');
  }, []);

  const handleSetLocale = useCallback((tag: string) => {
    localStorage.setItem(languageStorageKey, tag);
    setClientLocale(tag);
    setLocale(tag);
  }, []);

  const uiSettingsValue = useMemo<UISettings>(() => ({
    locale,
    setLocale: handleSetLocale,
    theme,
    setTheme,
    logout: handleLogout,
    tokenRotated: handleTokenRotated,
  }), [locale, handleSetLocale, theme, setTheme, handleLogout, handleTokenRotated]);

  const renderContent = () => {
    if (sessionState === 'checking' || sessionState === 'failed') {
      return (
        <div className="shell-empty-view">
          {appError ? (
            <>
              <p role="alert">{appError}</p>
              <button type="button" onClick={() => void restore()}>{ui.refresh}</button>
            </>
          ) : (
            <p role="status">{ui.loading}</p>
          )}
        </div>
      );
    }

    // 未登录时显示登录页（开发环境下允许直接查看 /dev/forms）
    if (sessionState === 'unauthenticated' && !(import.meta.env.DEV && currentPath === '/dev/forms')) {
      return (
        <div className="login-wrapper">
          <div className="login-locale-bar">
            <LanguageSwitch
              value={locale}
              onChange={handleSetLocale}
            />
          </div>
          <LoginPage onAuthenticated={handleAuthenticated} />
        </div>
      );
    }

    const matchedRoute = routes.find(r => r.path === currentPath);
    const isComponentDetail = currentPath.startsWith('/components/');
    const componentId = isComponentDetail ? decodeURIComponent(currentPath.slice('/components/'.length)) : '';

    return (
      <UISettingsContext.Provider value={uiSettingsValue}>
        <AppShell
          version={coreInfo?.version ?? ui.loading}
          onLogout={handleLogout}
          coreUpdateFailed={coreUpdateFailed}
          coreUpdate={latestCore && coreInfo && compareVersions(latestCore.version, coreInfo.version) === 1 ? { version: latestCore.version, releaseURL: latestCore.release_url } : undefined}
        >
          {coreInfo && <ChangelogDialog component="core" version={coreInfo.version} open={showCoreContent} automatic onClose={() => setShowCoreContent(false)} />}
          {appError && (
            <div className="plugins-error-banner" role="alert">
              <span>{appError}</span>
              <button type="button" onClick={() => void loadCore()}>{ui.refresh}</button>
            </div>
          )}
          {import.meta.env.DEV && matchedRoute?.id === 'dev-forms' ? (
            <div className="dev-form-toolbar">
              <LanguageSwitch
                value={locale}
                onChange={handleSetLocale}
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
      </UISettingsContext.Provider>
    );
  };

  return (
    <UIContext value={ui}>
      {renderContent()}

      {rotatedToken ? (
        <Dialog.Root
          open={true}
          onOpenChange={open => {
            if (!open) {
              setRotatedToken(null);
              navigate('/login', { replace: true });
            }
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="dialog-content">
              <Dialog.Title className="dialog-title">{ui.rotateTokenModalTitle}</Dialog.Title>
              <Dialog.Description className="dialog-description">
                {ui.rotateTokenModalWarning}
              </Dialog.Description>
              <div className="rotated-token-result">
                <p>{ui.newTokenNotice}</p>
                <div className="settings-input-row">
                  <input
                    type="text"
                    readOnly
                    value={rotatedToken}
                    className="font-mono"
                    onClick={e => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(rotatedToken);
                        setTokenCopied(true);
                        setTokenCopyError(null);
                      } catch (error) {
                        setTokenCopyError(error instanceof Error ? error.message : String(error));
                      }
                    }}
                  >
                    {tokenCopied ? ui.copied : ui.copyCommand}
                  </button>
                </div>
              </div>
              {tokenCopyError && <p role="alert">{tokenCopyError}</p>}
              <div className="dialog-actions">
                <button
                  type="button"
                  className="save-button"
                  onClick={() => {
                    setRotatedToken(null);
                    navigate('/login', { replace: true });
                  }}
                >
                  {ui.done}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      ) : null}
    </UIContext>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<AdminApp />);
}
