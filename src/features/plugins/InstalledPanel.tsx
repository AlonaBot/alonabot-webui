import { useMemo, useState, type JSX } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Filter, PackageOpen, Store } from 'lucide-react';
import type { Package } from '../../api/packages';
import { getCoreTelemetry } from '../../api/telemetry';
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

const pageSize = 9;
const roles = ['plugin', 'adapter', 'agent', 'webui'] as const;

function activity(pkg: Package, buckets: readonly HourBucket[], instancesOf: ReadonlyMap<string, string[]>): number[] {
  const hours = buckets.slice(-24).map(bucket =>
    pkg.Role === 'adapter'
      ? bucket.accounts
          .filter(account => instancesOf.get(pkg.ID)?.includes(account.instance_id))
          .reduce((sum, account) => sum + account.incoming + account.outgoing, 0)
      : bucket.commands.filter(command => command.plugin_id === pkg.ID).reduce((sum, command) => sum + command.count, 0),
  );
  while (hours.length < 24) hours.unshift(0);
  return pairwise(hours);
}

/** 已安装组件：角色筛选、按名称检索、排序、分页与可选遥测透传。 */
export function InstalledPanel({
  packages,
  loading,
  onOpenStore,
}: {
  packages: readonly Package[];
  loading: boolean;
  onOpenStore: () => void;
}): JSX.Element {
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
  const telemetry = useQuery({
    queryKey: ['core-telemetry', '5m'],
    queryFn: () => getCoreTelemetry('5m'),
    refetchInterval: 5000,
    retry: false,
  });

  const metricsByID = useMemo(
    () => new Map((telemetry.data?.components ?? []).map(item => [item.id, item])),
    [telemetry.data],
  );

  const instancesOf = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const instance of instances.data ?? []) {
      map.set(instance.package_id, [...(map.get(instance.package_id) ?? []), instance.instance_id]);
    }
    return map;
  }, [instances.data]);

  const counts = useMemo(
    () =>
      Object.fromEntries([
        ['all', packages.length],
        ...roles.map(value => [value, packages.filter(item => item.Role === value).length]),
      ]) as Record<string, number>,
    [packages],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = packages.filter(
      item =>
        (role === 'all' || item.Role === role) &&
        (!needle || [packageName(item), item.ID, item.AdapterID, item.Source].some(value => value?.toLowerCase().includes(needle))),
    );
    return order === 'name'
      ? [...list].sort((a, b) => packageName(a).localeCompare(packageName(b)))
      : [...list].sort((a, b) => Number(hasPackageProblem(b)) - Number(hasPackageProblem(a)));
  }, [packages, role, query, order]);

  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const current = Math.min(page, pages);

  const newer = (pkg: Package): string | undefined => {
    const release = latest.get(repository(pkg.Source)?.toLowerCase() ?? '')?.data;
    return release && compareVersions(release.version, pkg.Version) === 1 ? release.version : undefined;
  };
  const updateFailed = (pkg: Package): boolean => {
    const result = latest.get(repository(pkg.Source)?.toLowerCase() ?? '');
    return result?.isError === true;
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <TabBar
          variant="pill"
          value={role}
          onValueChange={value => {
            setRole(value);
            setPage(1);
          }}
          aria-label={ui.filterByRole}
          items={[
            { value: 'all', label: ui.filterRoleAll, count: counts.all },
            ...roles.map(value => ({
              value,
              label: ui[({ plugin: 'filterRolePlugin', adapter: 'filterRoleAdapter', agent: 'filterRoleAgent', webui: 'filterRoleWebUI' } as const)[value]],
              count: counts[value],
            })),
          ]}
        />
        <span className="hidden flex-1 lg:inline" />
        <label className="relative flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3.5 text-sm focus-within:border-[var(--color-accent)] sm:max-w-[260px] sm:flex-initial">
          <Filter size={14} className="shrink-0 text-[var(--color-ink-muted)]" aria-hidden="true" />
          <input
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder={ui.filterByName}
            aria-label={ui.filterByName}
            className="w-full bg-transparent text-xs text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-muted)]"
          />
        </label>
        <Select
          variant="pill"
          size="sm"
          value={order}
          onValueChange={value => setOrder(value as 'problem' | 'name')}
          aria-label={ui.sortBy}
          options={[
            { value: 'problem', label: ui.sortProblemFirst },
            { value: 'name', label: ui.storeSortName },
          ]}
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="alona-glass flex flex-col gap-3 rounded-[18px] p-4">
              <Skeleton height={44} width="65%" />
              <Skeleton height={16} />
              <Skeleton height={32} />
            </div>
          ))}
        </div>
      ) : packages.length === 0 ? (
        <div className="alona-glass rounded-[18px]">
          <EmptyState
            icon={<PackageOpen size={22} />}
            title={ui.noPackagesTitle}
            description={ui.noPackagesHint}
            action={
              <Button variant="primary" icon={<Store size={15} />} onClick={onOpenStore}>
                {ui.goToStore}
              </Button>
            }
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="alona-glass rounded-[18px]">
          <EmptyState icon={<Filter size={22} />} title={ui.noPackagesFound} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.slice((current - 1) * pageSize, current * pageSize).map(pkg => (
            <PluginCard
              key={pkg.ID}
              pkg={pkg}
              latest={newer(pkg)}
              updateFailed={updateFailed(pkg)}
              activity={activity(pkg, statistics.data?.buckets ?? [], instancesOf)}
              metrics={metricsByID.get(pkg.ID)}
              busy={actions.busy.has(pkg.ID)}
              onToggle={() => void actions.toggle(pkg)}
              onRestart={() => void actions.restart(pkg)}
              onReload={() => void actions.reload(pkg)}
              onUpdate={() => setUpdating(pkg)}
              onUninstall={() => setRemoving(pkg)}
              onReason={() => setInspecting(pkg)}
            />
          ))}
        </div>
      )}

      <Pagination page={current} total={visible.length} size={pageSize} onChange={setPage} />

      {updating && <UpdateDialog pkg={updating} onClose={() => setUpdating(null)} onUpdate={archive => actions.update(updating, archive)} />}
      {removing && <UninstallDialog pkg={removing} onClose={() => setRemoving(null)} onUninstall={purge => actions.uninstall(removing, purge)} />}
      {inspecting && <ReasonDialog pkg={inspecting} onClose={() => setInspecting(null)} onRestart={() => void actions.restart(inspecting)} />}
      {actions.dialogs}
    </div>
  );
}
