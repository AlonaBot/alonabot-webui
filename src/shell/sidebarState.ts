/** 侧栏的持久化状态：展示顺序、隐藏条目与折叠状态。 */
export type SidebarState = {
  order: string[];
  hidden: string[];
  collapsed: boolean;
};

const sidebarStorageKey = 'alonabot.webui.sidebar';

/**
 * 读取保存的侧栏状态。暂时不可用的条目（如组件加载前的插件页面）保留在顺序里，
 * 由 arrangeSidebar 在渲染时过滤，避免丢失用户的自由排序。
 */
export function loadSidebar(): SidebarState {
  const empty: SidebarState = { order: [], hidden: [], collapsed: false };
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(sidebarStorageKey) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return empty;
    const value = parsed as Record<string, unknown>;
    const strings = (list: unknown): string[] =>
      Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [];
    return {
      order: [...new Set(strings(value.order))],
      hidden: [...new Set(strings(value.hidden))],
      collapsed: value.collapsed === true,
    };
  } catch {
    return empty;
  }
}

export function saveSidebar(state: SidebarState): void {
  try {
    localStorage.setItem(sidebarStorageKey, JSON.stringify(state));
  } catch {
    // 存储不可用时只在本次会话内生效。
  }
}

/** 按保存的顺序排列当前可用条目，新条目按 available 顺序追加在末尾；所有内置与插件入口一律平等。 */
export function arrangeSidebar(state: SidebarState, available: readonly string[]): { visible: string[]; hidden: string[] } {
  const known = new Set(available);
  const ordered = state.order.filter(id => known.has(id));
  const placed = new Set(ordered);
  for (const id of available) {
    if (!placed.has(id)) ordered.push(id);
  }
  const hidden = new Set(state.hidden);
  return { visible: ordered.filter(id => !hidden.has(id)), hidden: ordered.filter(id => hidden.has(id)) };
}

/** 把 active 移到 over 的位置；允许任意跨条目自由排序，并保留暂时不可用的条目。 */
export function moveSidebarItem(state: SidebarState, available: readonly string[], active: string, over: string): SidebarState {
  const { visible, hidden } = arrangeSidebar(state, available);
  const all = [...visible, ...hidden];
  const from = all.indexOf(active);
  const to = all.indexOf(over);
  if (from < 0 || to < 0 || from === to) return state;
  all.splice(to, 0, ...all.splice(from, 1));
  const rest = state.order.filter(id => !all.includes(id));
  return { ...state, order: [...all, ...rest] };
}
