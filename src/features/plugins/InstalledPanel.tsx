import { useMemo, useState, type JSX } from 'react';
import { Filter, PackageOpen, Store } from 'lucide-react';
import type { Package } from '../../api/packages';
import type { HourBucket } from '../../api/webui';
import { useUI } from '../../i18n/UI';
import { hasPackageProblem } from '../../pages/packageState';
import { compareVersions, repository } from '../../pages/versions';
import { useInstances, useLatestReleases, useStatistics } from '../../queries/plugins';
import { Button } from '../../ui/Button';
import { EmptyState, Skeleton } from '../../ui/EmptyState';
import { Pagination } from '../../ui/Pagination';
import { Select } from '../../ui/Select';
import { TabBar } from '../../ui/Tabs';
import { PluginCard } from './PluginCard';
import { ReasonDialog, UninstallDialog, UpdateDialog } from './PluginDialogs';
import { pairwise } from './Sparkline';
import { packageName, usePackageActions } from './usePackageActions';
import styles from './Plugins.module.css';

const pageSize = 9;
const roles = ['plugin', 'adapter', 'agent', 'webui'] as const;

/** 每个组件近 24 小时的活动：插件与 Agent 按命令触发次数，适配器按其账号的收发消息数。 */
function activity(pkg: Package, buckets: readonly HourBucket[], instancesOf: ReadonlyMap<string, string[]>): number[] {
  const hours = buckets.slice(-24).map(bucket => pkg.Role === 'adapter'
    ? bucket.accounts.filter(account => instancesOf.get(pkg.ID)?.includes(account.instance_id)).reduce((sum, account) => sum + account.incoming + account.outgoing, 0)
    : bucket.commands.filter(command => command.plugin_id === pkg.ID).reduce((sum, command) => sum + command.count, 0));
  while (hours.length < 24) hours.unshift(0);
  return pairwise(hours);
}

/** 已安装组件：角色筛选、按名称筛选、排序与分页。 */
export function InstalledPanel({ packages, loading, onOpenStore }: { packages: readonly Package[]; loading: boolean; onOpenStore: () => void }): JSX.Element {
  const ui = useUI();
  const actions = usePackageActions();
  const [role, setRole] = useState('all');
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<'problem' | 'name'>('problem');
  const [page, setPage] = useState(1);
  const [updating, setUpdating] = useState<Package | null>(null);
  const [removing, setRemoving] = useState<Package | null>(null);
  const [inspecting, setInspecting] = useState<Package | null>(null);

  const statistics = useStatistics('24h');
  const instances = useInstances();
  const latest = useLatestReleases(packages);
  const instancesOf = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const instance of instances.data ?? []) map.set(instance.package_id, [...(map.get(instance.package_id) ?? []), instance.instance_id]);
    return map;
  }, [instances.data]);

  const counts = useMemo(() => Object.fromEntries([['all', packages.length], ...roles.map(value => [value, packages.filter(item => item.Role === value).length])]) as Record<string, number>, [packages]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = packages.filter(item => (role === 'all' || item.Role === role)
      && (!needle || [packageName(item), item.ID, item.AdapterID, item.Source].some(value => value?.toLowerCase().includes(needle))));
    return order === 'name'
      ? [...list].sort((a, b) => packageName(a).localeCompare(packageName(b)))
      : [...list].sort((a, b) => Number(hasPackageProblem(b)) - Number(hasPackageProblem(a)));
  }, [packages, role, query, order]);
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const current = Math.min(page, pages);

  const newer = (pkg: Package) => {
    const release = latest.get(repository(pkg.Source)?.toLowerCase() ?? '')?.data;
    return release && compareVersions(release.version, pkg.Version) === 1 ? release.version : undefined;
  };
  const updateFailed = (pkg: Package) => {
    const result = latest.get(repository(pkg.Source)?.toLowerCase() ?? '');
    return result?.isError === true;
  };

  return <>
    <div className={styles.toolbar}>
      <TabBar variant="pill" value={role} onValueChange={value => { setRole(value); setPage(1); }} aria-label={ui.filterByRole}
        items={[{ value: 'all', label: ui.filterRoleAll, count: counts.all }, ...roles.map(value => ({ value, label: ui[({ plugin: 'filterRolePlugin', adapter: 'filterRoleAdapter', agent: 'filterRoleAgent', webui: 'filterRoleWebUI' } as const)[value]], count: counts[value] }))]} />
      <span className={styles.spacer} />
      <label className={styles.search}>
        <Filter size={16} aria-hidden />
        <input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder={ui.filterByName} aria-label={ui.filterByName} />
      </label>
      <Select className={styles.sort} value={order} onValueChange={value => setOrder(value as 'problem' | 'name')} aria-label={ui.sortBy}
        options={[{ value: 'problem', label: ui.sortProblemFirst }, { value: 'name', label: ui.storeSortName }]} />
    </div>

    {loading ? <div className={styles.grid}>{Array.from({ length: 6 }, (_, i) => <div key={i} className={styles.card}><Skeleton height={40} width="60%" /><Skeleton height={14} /><Skeleton height={28} /></div>)}</div>
      : packages.length === 0 ? <EmptyState icon={<PackageOpen size={22} />} title={ui.noPackagesTitle} description={ui.noPackagesHint}
        action={<Button variant="dark" icon={<Store size={16} />} onClick={onOpenStore}>{ui.goToStore}</Button>} />
      : visible.length === 0 ? <EmptyState icon={<Filter size={22} />} title={ui.noPackagesFound} />
      : <div className={styles.grid}>
        {visible.slice((current - 1) * pageSize, current * pageSize).map(pkg => <PluginCard key={pkg.ID} pkg={pkg}
          latest={newer(pkg)} updateFailed={updateFailed(pkg)} activity={activity(pkg, statistics.data?.buckets ?? [], instancesOf)} busy={actions.busy.has(pkg.ID)}
          onToggle={() => void actions.toggle(pkg)} onRestart={() => void actions.restart(pkg)} onReload={() => void actions.reload(pkg)}
          onUpdate={() => setUpdating(pkg)} onUninstall={() => setRemoving(pkg)} onReason={() => setInspecting(pkg)} />)}
      </div>}
    <Pagination page={current} total={visible.length} size={pageSize} onChange={setPage} />

    {updating && <UpdateDialog pkg={updating} onClose={() => setUpdating(null)} onUpdate={archive => actions.update(updating, archive)} />}
    {removing && <UninstallDialog pkg={removing} onClose={() => setRemoving(null)} onUninstall={purge => actions.uninstall(removing, purge)} />}
    {inspecting && <ReasonDialog pkg={inspecting} onClose={() => setInspecting(null)} onRestart={() => void actions.restart(inspecting)} />}
    {actions.dialogs}
  </>;
}
