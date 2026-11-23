import { useQuery } from '@tanstack/react-query';
import { listPackages, type Package } from '../api/packages';

export const packagesKey = ['packages'] as const;

/** 已安装组件列表；安装、更新、卸载成功后由 client.ts 统一失效。 */
export function usePackages() {
  return useQuery({ queryKey: packagesKey, queryFn: listPackages });
}

/** 侧栏与搜索用：已安装且未卸载的组件。 */
export function installed(packages: readonly Package[] | undefined): Package[] {
  return (packages ?? []).filter(item => !item.Uninstalled);
}
