import { useMemo, type JSX } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useUI } from '../../i18n/UI';
import { installed, usePackages } from '../../queries/packages';
import { PageHeader } from '../../shell/PageHeader';
import { navigate, useQueryParam } from '../../shell/router';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { TabBar } from '../../ui/Tabs';
import { InstalledPanel } from './InstalledPanel';
import { StorePanel } from './StorePanel';

/** 插件页：已安装与商店两个标签，当前标签记在地址的 ?tab= 里，刷新或分享链接后保持。 */
export function PluginsPage(): JSX.Element {
  const ui = useUI();
  const tab = useQueryParam('tab') === 'store' ? 'store' : 'installed';
  const query = usePackages();
  const packages = useMemo(() => installed(query.data), [query.data]);
  const open = (value: string) => navigate(value === 'store' ? '/components?tab=store' : '/components', { replace: true });

  return <>
    <PageHeader left={<TabBar value={tab} onValueChange={open} aria-label={ui.plugins}
      items={[{ value: 'installed', label: ui.installedTab, count: packages.length }, { value: 'store', label: ui.storeTab }]} />} />
    {query.isError && !query.data
      ? <EmptyState tone="error" icon={<AlertTriangle size={22} />} title={ui.packagesLoadFailed} description={query.error.message}
        action={<Button variant="primary" loading={query.isFetching} onClick={() => void query.refetch()}>{ui.retry}</Button>} />
      : tab === 'store' ? <StorePanel packages={packages} />
      : <InstalledPanel packages={packages} loading={query.isPending} onOpenStore={() => open('store')} />}
  </>;
}
