import { createContext } from 'react';

/** 全局搜索条目定义。 */
export type SearchItem = {
  id: string;
  title: string;
  section: string;
  keywords?: string[];
  run: () => void;
};

/**
 * 根据关键字过滤搜索项。
 * 不区分大小写匹配标题与关键字，按 section 分组并保持原始输入顺序。
 */
export function filterSearch(items: SearchItem[], query: string): SearchItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  // step 1: 按 section 分组收集匹配条目，Map 保持首次出现的分组顺序
  const sectionMap = new Map<string, SearchItem[]>();

  for (const item of items) {
    const titleMatches = item.title.toLowerCase().includes(normalized);
    const keywordMatches = item.keywords?.some(kw => kw.toLowerCase().includes(normalized)) ?? false;

    if (titleMatches || keywordMatches) {
      const existing = sectionMap.get(item.section);
      if (existing) {
        existing.push(item);
      } else {
        sectionMap.set(item.section, [item]);
      }
    }
  }

  // step 2: 平铺各分组条目
  const results: SearchItem[] = [];
  for (const group of sectionMap.values()) {
    results.push(...group);
  }

  return results;
}

/** 提供页面动态注册搜索项能力的 Context。 */
export const SearchContext = createContext<{ register(items: SearchItem[]): () => void }>({
  register: () => () => {},
});
