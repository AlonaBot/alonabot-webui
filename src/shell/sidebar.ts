/** 侧栏的持久化状态：展示顺序、隐藏条目与折叠状态。 */
export type SidebarState = {
  order: string[];
  hidden: string[];
  collapsed: boolean;
};

const sidebarStorageKey = 'alonabot.webui.sidebar';

/**
 * 从 localStorage 加载侧栏状态。
 * 丢弃当前路由表中已不存在的 id，并将新出现的 id 按 available 的顺序追加在末尾。
 */
export function loadSidebar(available: string[]): SidebarState {
  const availableSet = new Set(available);
  let savedOrder: string[] = [];
  let savedHidden: string[] = [];
  let collapsed = false;

  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(sidebarStorageKey) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.order)) {
          savedOrder = parsed.order.filter((id: unknown): id is string => typeof id === 'string');
        }
        if (Array.isArray(parsed.hidden)) {
          savedHidden = parsed.hidden.filter((id: unknown): id is string => typeof id === 'string');
        }
        collapsed = Boolean(parsed.collapsed);
      }
    }
  } catch {
    // 忽略存储读取或 JSON 解析异常
  }

  // step 1: 丢弃已不存在的 id
  const validOrder = savedOrder.filter(id => availableSet.has(id));
  const validHidden = savedHidden.filter(id => availableSet.has(id));

  // step 2: 保持 order 中的唯一性并按 available 顺序追加新条目
  const orderSet = new Set(validOrder);
  for (const id of available) {
    if (!orderSet.has(id)) {
      validOrder.push(id);
      orderSet.add(id);
    }
  }

  return {
    order: validOrder,
    hidden: Array.from(new Set(validHidden)),
    collapsed,
  };
}

/**
 * 将侧栏状态持久化到 localStorage。
 */
export function saveSidebar(state: SidebarState): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(sidebarStorageKey, JSON.stringify(state));
    }
  } catch {
    // 忽略存储写入异常
  }
}
