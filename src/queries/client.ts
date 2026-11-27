import { MutationCache, QueryClient } from '@tanstack/react-query';
import { AdminAPIError, onPackagesChanged, onSessionExpired } from '../api/client';
import { toast } from '../ui/toast';

declare module '@tanstack/react-query' {
  interface Register {
    /** toast=false 的变更自行展示错误（例如在表单字段旁），不再弹出全局提示。 */
    mutationMeta: { toast?: boolean; errorTitle?: string };
  }
}

/** 判断查询错误是否为管理端 403 无权访问错误，供查询层定向交由页面 ErrorBoundary 展示 403 状态页。 */
export function isForbiddenAPIError(error: unknown): boolean {
  return error instanceof AdminAPIError && error.status === 403;
}

/**
 * 全局请求缓存。查询与变更都不自动重试：读取失败直接显示错误与重试按钮，
 * 403 错误定向抛出给最近 ErrorBoundary 切换无权状态页；业务副作用不重复提交。
 * 窗口重新获得焦点时后台刷新，旧数据在刷新期间保持可见。
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      throwOnError: isForbiddenAPIError,
    },
    mutations: { retry: false },
  },
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.toast === false) return;
      toast.error(error, mutation.meta?.errorTitle);
    },
  }),
});

// 安装、更新、卸载会改变组件列表及其派生数据；会话过期后丢弃全部缓存。
onPackagesChanged(() => { void queryClient.invalidateQueries(); });
onSessionExpired(() => { queryClient.clear(); });
