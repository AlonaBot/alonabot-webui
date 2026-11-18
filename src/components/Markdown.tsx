import { Fragment, type ReactNode } from 'react';
export function safeLink(href: string): string | undefined {
  try { const url = new URL(href, location.origin); return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? href : undefined; } catch { return undefined; }
}
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\[[^\]]*\]\([^\s)]+\)|\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    const link = /^\[([^\]]*)\]\(([^\s)]+)\)$/.exec(part);
    if (link && safeLink(link[2])) return <a key={i} href={safeLink(link[2])} target="_blank" rel="noreferrer">{link[1]}</a>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}
/** Markdown 以 React 文本节点保留原始 HTML，仅把安全协议链接渲染成锚点。 */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let code: string[] | null = null;
  let fence = '';
  let paragraph: string[] = [];
  const flush = () => { if (paragraph.length) blocks.push(<p key={blocks.length}>{inline(paragraph.join('\n'))}</p>); paragraph = []; };
  for (const line of text.split('\n')) {
    const opening = /^\s*(`{3,}|~{3,})/.exec(line);
    if (code !== null) {
      if (opening && opening[1][0] === fence[0] && opening[1].length >= fence.length) { blocks.push(<pre key={blocks.length}><code>{code.join('\n')}</code></pre>); code = null; } else code.push(line);
      continue;
    }
    if (opening) { flush(); fence = opening[1]; code = []; continue; }
    if (!line.trim()) { flush(); continue; }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { flush(); blocks.push(<h3 key={blocks.length}>{inline(heading[2])}</h3>); continue; }
    const item = /^\s*(?:[-*+] |\d+\. )(.+)$/.exec(line);
    if (item) { flush(); blocks.push(<ul key={blocks.length}><li>{inline(item[1])}</li></ul>); continue; }
    paragraph.push(line);
  }
  flush();
  if (code !== null) blocks.push(<pre key={blocks.length}><code>{code.join('\n')}</code></pre>);
  return <div className="markdown-content">{blocks}</div>;
}
