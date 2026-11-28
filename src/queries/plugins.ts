import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { listInstances } from '../api/instances';
import type { Package } from '../api/packages';
import { getLatestRelease, getStatistics, getStore, type StatisticsRange, type StoreMirror, type StoreSort } from '../api/webui';
import { repository } from '../pages/versions';

/** 小时统计；总览与插件卡片的活跃度共用，每分钟后台刷新一次。 */
export function useStatistics(range: StatisticsRange) {
  return useQuery({ queryKey: ['statistics', range], queryFn: () => getStatistics(range), refetchInterval: 60_000 });
}

export function useInstances() {
  return useQuery({ queryKey: ['instances'], queryFn: listInstances });
}

/**
 * 每个有 GitHub 来源的组件的最新 Release。结果按仓库缓存 10 分钟；
 * 单个仓库失败只影响该卡片的「检查更新失败」提示。
 */
export function useLatestReleases(packages: readonly Package[]) {
  const repos = [...new Set(packages.map(item => repository(item.Source)).filter((repo): repo is string => repo !== null))];
  const results = useQueries({
    queries: repos.map(repo => ({
      queryKey: ['latest-release', repo.toLowerCase()],
      queryFn: () => getLatestRelease(repo),
      staleTime: 10 * 60_000,
      throwOnError: false,
    })),
  });
  return new Map(repos.map((repo, i) => [repo.toLowerCase(), results[i]]));
}

// 已按某个刷新令牌读取过远端的插件源；同一令牌下的筛选、搜索与翻页只在后台快照上进行。
const refreshed = new Set<string>();

/**
 * 商店分页；切换筛选与翻页时保留上一页内容，避免整块换成加载文本。
 * refreshToken 每次进入商店或点刷新时更换，该令牌下对每个源的第一次请求读取远端。
 */
export function useStore(input: { source: string; mirror: StoreMirror; role: string; q: string; sort: StoreSort; offset: number; limit: number }, refreshToken: number) {
  return useQuery({
    queryKey: ['store', input, refreshToken],
    queryFn: () => {
      const key = `${refreshToken}|${input.source}|${input.mirror}`;
      const refresh = !refreshed.has(key);
      refreshed.add(key);
      return getStore({ ...input, refresh });
    },
    enabled: input.source !== '',
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}
