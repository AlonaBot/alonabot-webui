import { MutationCache, QueryClient } from '@tanstack/react-query';
import { onPackagesChanged, onSessionExpired } from '../api/admin';
import { toast } from '../ui/toast';

declare module '@tanstack/react-query' {
  interface Register {
    /** toast=false 的变更自行展示错误（例如在表单字段旁），不再弹出全局提示。 */
    mutationMeta: { toast?: boolean; errorTitle?: string };
  }
}

/**
 * 全局请求缓存。查询与变更都不自动重试：读取失败直接显示错误与重试按钮，
 * 业务副作用不重复提交。窗口重新获得焦点时后台刷新，旧数据在刷新期间保持可见。
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 15_000, refetchOnWindowFocus: true },
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
