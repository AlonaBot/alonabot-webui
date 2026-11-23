import type { JSX } from 'react';
import { AppWindow } from 'lucide-react';
import { PluginPageFrame } from '../../components/PluginPageFrame';
import { useUI } from '../../i18n/UI';
import { installed, usePackages } from '../../queries/packages';
import { useQueryParam } from '../../shell/router';
import { EmptyState, LoadingRows } from '../../ui/EmptyState';

/** 插件扩展页面：侧栏直接打开页面本身，不经过插件详情的标签页。 */
export function PluginPageView({ id }: { id: string }): JSX.Element {
  const ui = useUI();
  const path = useQueryParam('path') ?? '';
  const packages = usePackages();
  if (packages.isPending) return <LoadingRows rows={4} />;
  const pkg = installed(packages.data).find(item => item.ID === id);
  const page = pkg?.pages?.find(item => item.path === path);
  if (!pkg || !page) return <EmptyState icon={<AppWindow size={22} />} title={ui.pluginPageMissing} />;
  if (!pkg.Enabled) return <EmptyState icon={<AppWindow size={22} />} title={ui.pluginPageDisabled} />;
  return <PluginPageFrame key={`${id}:${path}`} id={id} path={page.path} title={page.title} />;
}
