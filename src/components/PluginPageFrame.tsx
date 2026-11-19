import { useEffect, useLayoutEffect, useRef, useContext, type JSX } from 'react';
import { bindPluginPage } from '../bridge/pluginPage';
import { SearchContext } from '../shell/search';
import { useUISettings } from '../shell/settings';

export function PluginPageFrame(props: { id: string; path: string; title: string }): JSX.Element {
  const { id, path, title } = props;
  const { locale } = useUISettings();
  const { open } = useContext(SearchContext);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<ReturnType<typeof bindPluginPage> | null>(null);
  const localeRef = useRef(locale);
  localeRef.current = locale;
  useLayoutEffect(() => {
    // 在子页脚本运行前绑定，保留 hello 握手后收到的主题与语言订阅。
    bridgeRef.current = bindPluginPage(frameRef.current!, { id, locale: localeRef.current, openSearch: open });
    return () => { bridgeRef.current?.dispose(); bridgeRef.current = null; };
  }, [id, path, open]);
  useEffect(() => { bridgeRef.current?.setLocale(locale); }, [locale]);
  return <iframe ref={frameRef} className="plugin-page-frame" src={`/plugins/${encodeURIComponent(id)}/${path.replace(/^\//, '')}`} title={title} sandbox="allow-scripts allow-forms allow-popups" />;
}
