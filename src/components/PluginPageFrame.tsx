import { useEffect, useLayoutEffect, useRef, useContext, type JSX } from 'react';
import { bindPluginPage, type InstanceConfigBridge } from '../bridge/pluginPage';
import { SearchContext } from '../shell/search';
import { useUISettings } from '../shell/settings';

export function PluginPageFrame({ id, path, title, className = 'plugin-page-frame', config, active = true }: {
  id: string; path: string; title: string; className?: string; config?: InstanceConfigBridge; active?: boolean;
}): JSX.Element {
  const { locale } = useUISettings();
  const { open } = useContext(SearchContext);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<ReturnType<typeof bindPluginPage> | null>(null);
  const localeRef = useRef(locale);
  localeRef.current = locale;
  useLayoutEffect(() => {
    if (!active) return;
    // 在子页脚本运行前绑定，保留 hello 握手后收到的主题与语言订阅。
    bridgeRef.current = bindPluginPage(frameRef.current!, { id, locale: localeRef.current, openSearch: open, config });
    return () => { bridgeRef.current?.dispose(); bridgeRef.current = null; };
  }, [id, path, open, config, active]);
  useEffect(() => { bridgeRef.current?.setLocale(locale); }, [locale]);
  return <iframe ref={frameRef} className={className} src={`/plugins/${encodeURIComponent(id)}/${path.replace(/^\//, '')}`} title={title} sandbox="allow-scripts allow-forms allow-popups" />;
}
