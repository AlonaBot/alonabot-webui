import type { Package } from '../api/admin';

/** hasPackageProblem 只将已启用组件的故障或停止状态计入故障概况。 */
export function hasPackageProblem(pkg: Package): boolean {
  return !pkg.Uninstalled && pkg.Enabled && (pkg.State === 'Degraded' || pkg.State === 'Stopped');
}
