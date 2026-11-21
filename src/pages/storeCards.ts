import type { Package } from '../api/admin';
import type { StoreEntry } from '../api/webui';
import { compareVersions, repository } from './versions';

/** 商店卡片当前状态：命中的已安装组件，以及是否可以对它更新。 */
export type StoreCardState = { installed?: Package; canUpdate: boolean };

/**
 * storeCardState 按组件 ID 判定已安装状态。
 * 只有该 ID 的安装包来源与条目仓库一致、且条目版本更高时才提供更新；
 * 仓库换了包 ID 时视为另一个组件，保留安装入口并交给 Core 判定同类冲突。
 */
export function storeCardState(entry: StoreEntry, packages: Package[]): StoreCardState {
  const installed = packages.find(pkg => !pkg.Uninstalled && pkg.ID === entry.id);
  if (!installed) return { installed: undefined, canUpdate: false };
  const sameSource = repository(installed.Source)?.toLowerCase() === entry.repo.toLowerCase();
  return { installed, canUpdate: sameSource && compareVersions(entry.version, installed.Version) === 1 };
}
