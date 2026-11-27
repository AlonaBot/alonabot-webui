import { createContext } from 'react';
import type { LucideIcon } from 'lucide-react';

/** 全局命令与搜索条目；既支持页面跳转，也支持直接执行动作。 */
export type SearchItem = {
  id: string;
  title: string;
  section: string;
  keywords?: string[];
  icon?: LucideIcon;
  context?: string;
  value?: string;
  run: () => void;
};

/**
 * 按关键字过滤命令面板条目；查询为空时返回全部条目（由面板裁剪展示高频推荐），
 * 不区分大小写匹配标题、关键词与上下文，按 section 分组并保持首次出现顺序。
 */
export function filterSearch(items: readonly SearchItem[], query: string, showAllWhenEmpty = false): SearchItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return showAllWhenEmpty ? [...items] : [];
  }

  const sectionMap = new Map<string, SearchItem[]>();
  for (const item of items) {
    const titleMatches = item.title.toLowerCase().includes(normalized);
    const keywordMatches = item.keywords?.some(kw => kw.toLowerCase().includes(normalized)) ?? false;
    const contextMatches = item.context?.toLowerCase().includes(normalized) ?? false;
    if (titleMatches || keywordMatches || contextMatches) {
      const existing = sectionMap.get(item.section);
      if (existing) existing.push(item);
      else sectionMap.set(item.section, [item]);
    }
  }

  const results: SearchItem[] = [];
  for (const group of sectionMap.values()) {
    results.push(...group);
  }
  return results;
}

/** 提供页面动态注册搜索项与主动唤起命令面板能力的 Context。 */
export const SearchContext = createContext<{
  register(items: SearchItem[]): () => void;
  open(): void;
}>({
  register: () => () => {},
  open: () => {},
});
