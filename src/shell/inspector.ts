import { createContext, useContext } from 'react';

export type InspectorTab = 'overview' | 'config' | 'logs';

export interface InspectorState {
  readonly openComponent: (id: string, tab?: InspectorTab) => void;
  readonly close: () => void;
}

/** 全局 Quick Inspector 上下文：任意页面均可唤起组件右侧滑出抽屉，无需切页。 */
export const InspectorContext = createContext<InspectorState>({
  openComponent: () => {},
  close: () => {},
});

export function useInspector(): InspectorState {
  return useContext(InspectorContext);
}
