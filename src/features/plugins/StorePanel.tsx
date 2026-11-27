import { useMemo, useState, type JSX } from 'react';
import { AlertTriangle, ArrowRight, ArrowUpCircle, BadgeCheck, Check, ChevronDown, CircleCheck, Download, FileUp, GitBranch, Globe, Hammer, Plus, Repeat, Search, Star, Trash2, Upload } from 'lucide-react';
import { AdminAPIError } from '../../api/client';
import type { Package } from '../../api/packages';
import { checkStoreRepo, type StoreCheck, type StoreEntry, type StoreMirror, type StoreSort } from '../../api/webui';
import { useUI } from '../../i18n/UI';
import { storeCardState } from '../../pages/storeCards';
import { useStore } from '../../queries/plugins';
import { PageHeader } from '../../shell/PageHeader';
import { navigate } from '../../shell/router';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { EmptyState, Skeleton } from '../../ui/EmptyState';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../../ui/Menu';
import { Pagination } from '../../ui/Pagination';
import { Select } from '../../ui/Select';
import { SpotlightCard } from '../../ui/SpotlightCard';
import { TabBar } from '../../ui/Tabs';
import { toast } from '../../ui/toast';
import { InstallDialog, UpdateDialog, type InstallMode } from './PluginDialogs';
import { usePackageActions } from './usePackageActions';

const sourcesKey = 'alonabot.webui.sources';
const mirrorKey = 'alonabot.webui.storeMirror';
const officialSource = 'AlonaBot/plugin-store';
const pageSize = 9;
const repositoryPattern = /^[\w.-]+\/[\w.-]+$/;

const validRepository = (value: string): boolean =>
  repositoryPattern.test(value) && !value.split('/').some(part => part === '.' || part === '..');

function loadSources(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(sourcesKey) ?? 'null');
    if (Array.isArray(parsed) && parsed.every(value => typeof value === 'string')) return parsed;
  } catch {
    // 存储内容损坏时回到官方源。
  }
  return [officialSource];
}

function persist(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (error: unknown) {
    toast.error(error);
  }
}

/** GitHub 收录申请地址；仓库名按 owner/repo 严格校验。 */
export function issueURL(source: string, fields: [string, string][]): string | null {
  if (!validRepository(source)) return null;
  const query = fields.map(([key, value], i) => `${i === 0 ? 'template=submit-plugin.yml&' : ''}${key}=${encodeURIComponent(value)}`).join('&');
  return `https://github.com/${source}/issues/new?${query}`;
}

/** 插件商店面板。 */
export function StorePanel({ packages }: { packages: readonly Package[] }): JSX.Element {
  const ui = useUI();
  const actions = usePackageActions();
  const [sources, setSources] = useState(loadSources);
  const [source, setSource] = useState(() => loadSources()[0] ?? '');
  const [mirror, setMirror] = useState<StoreMirror>(() => localStorage.getItem(mirrorKey) ?? 'auto');
  const [role, setRole] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<StoreSort>('stars');
  const [page, setPage] = useState(1);
  const [token, setToken] = useState(() => Date.now());
  const [installMode, setInstallMode] = useState<InstallMode | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [addingSource, setAddingSource] = useState(false);
  const [customMirror, setCustomMirror] = useState(false);
  const [updating, setUpdating] = useState<Package | null>(null);

  const store = useStore({ source, mirror, role, q: query, sort, offset: (page - 1) * pageSize, limit: pageSize }, token);
  const data = store.data;
  const sourceLabel = (value: string): string => (value === officialSource ? ui.officialSource : value);

  const chooseSource = (value: string): void => {
    setSource(value);
    setPage(1);
    setQuery('');
  };
  const saveSources = (next: string[]): void => {
    setSources(next);
    persist(sourcesKey, JSON.stringify(next));
  };
  const chooseMirror = (value: StoreMirror): void => {
    setMirror(value);
    persist(mirrorKey, value);
    setToken(Date.now());
  };

  const counts = data?.counts;
  const roleItems = [
    { value: '', label: ui.filterRoleAll, count: counts?.all },
    { value: 'plugin', label: ui.filterRolePlugin, count: counts?.plugin },
    { value: 'adapter', label: ui.filterRoleAdapter, count: counts?.adapter },
    { value: 'agent', label: ui.filterRoleAgent, count: counts?.agent },
    { value: 'webui', label: ui.filterRoleWebUI, count: counts?.webui },
  ];
  const mirrorLabel = mirror === 'auto' ? ui.mirrorAuto : mirror === 'github' ? 'GitHub' : mirror === 'jsdelivr' ? 'jsDelivr' : ui.mirrorCustom;
  const error = store.error ?? (data?.error ? new Error(data.error) : null);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        right={
          <>
            <Menu
              align="end"
              trigger={
                <Button size="sm" icon={<Download size={15} />}>
                  {ui.manualInstall}
                  <ChevronDown size={13} aria-hidden="true" />
                </Button>
              }
            >
              <MenuItem icon={<GitBranch size={15} />} onSelect={() => setInstallMode('repo')}>
                {ui.installFromRepo}
              </MenuItem>
              <MenuItem icon={<Hammer size={15} />} onSelect={() => setInstallMode('build')}>
                {ui.installFromSource}
              </MenuItem>
              <MenuItem icon={<FileUp size={15} />} onSelect={() => setInstallMode('upload')}>
                {ui.uploadInstall}
              </MenuItem>
            </Menu>
            <Button size="sm" variant="primary" icon={<Upload size={15} />} onClick={() => setPublishing(true)}>
              {ui.publishPlugin}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Menu
          trigger={
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3.5 text-xs transition-colors hover:border-[var(--color-accent)]"
            >
              <Globe size={14} className="text-[var(--color-accent)]" aria-hidden="true" />
              <span className="text-[var(--color-ink-muted)]">{ui.pluginSources}</span>
              <strong className="font-semibold text-[var(--color-ink)]">{source ? sourceLabel(source) : ui.noSources}</strong>
              <ChevronDown size={13} className="text-[var(--color-ink-muted)]" aria-hidden="true" />
            </button>
          }
        >
          <MenuLabel>{ui.pluginSources}</MenuLabel>
          {sources.map(value => (
            <MenuItem key={value} icon={value === source ? <Check size={15} /> : <span className="inline-block w-4" />} onSelect={() => chooseSource(value)}>
              {sourceLabel(value)}
            </MenuItem>
          ))}
          <MenuItem icon={<Plus size={15} />} onSelect={() => setAddingSource(true)}>
            {ui.addSource}
          </MenuItem>
          {source && sources.length > 1 && (
            <MenuItem
              icon={<Trash2 size={15} />}
              tone="danger"
              onSelect={() => {
                const next = sources.filter(value => value !== source);
                saveSources(next);
                chooseSource(next[0] ?? '');
              }}
            >
              {ui.removeSource}
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuLabel>
            {ui.storeRoute} · {mirrorLabel}
          </MenuLabel>
          {(['auto', 'github', 'jsdelivr'] as const).map(value => (
            <MenuItem key={value} icon={mirror === value ? <Check size={15} /> : <span className="inline-block w-4" />} onSelect={() => chooseMirror(value)}>
              {value === 'auto' ? ui.mirrorAuto : value === 'github' ? 'GitHub' : 'jsDelivr'}
            </MenuItem>
          ))}
          <MenuItem icon={!['auto', 'github', 'jsdelivr'].includes(mirror) ? <Check size={15} /> : <span className="inline-block w-4" />} onSelect={() => setCustomMirror(true)}>
            {ui.mirrorCustom}…
          </MenuItem>
        </Menu>

        <TabBar
          variant="pill"
          value={role}
          onValueChange={value => {
            setRole(value);
            setPage(1);
          }}
          items={roleItems}
          aria-label={ui.filterByRole}
        />
        <span className="hidden flex-1 xl:inline" />
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3.5 text-sm focus-within:border-[var(--color-accent)] sm:max-w-[260px] sm:flex-initial">
          <Search size={14} className="shrink-0 text-[var(--color-ink-muted)]" aria-hidden="true" />
          <input
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder={ui.searchStore}
            aria-label={ui.searchStore}
            className="w-full bg-transparent text-xs text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-muted)]"
          />
        </label>
        <Select
          variant="pill"
          size="sm"
          value={sort}
          onValueChange={value => {
            setSort(value as StoreSort);
            setPage(1);
          }}
          aria-label={ui.sortBy}
          options={[
            { value: 'stars', label: ui.storeSortStars },
            { value: 'name', label: ui.storeSortName },
          ]}
        />
      </div>

      {!source ? (
        <div className="alona-glass rounded-[18px]">
          <EmptyState
            icon={<Globe size={22} />}
            title={ui.noSources}
            action={
              <Button variant="primary" icon={<Plus size={15} />} onClick={() => setAddingSource(true)}>
                {ui.addSource}
              </Button>
            }
          />
        </div>
      ) : error && !data?.items.length ? (
        <div className="alona-glass rounded-[18px]">
          <EmptyState
            tone="error"
            icon={<AlertTriangle size={22} />}
            title={error instanceof AdminAPIError && error.code === 'SOURCE_INDEX_MISSING' ? ui.sourceIndexMissing : ui.storeFetchFailed}
            description={
              <>
                {error.message}
                <br />
                {ui.storeFetchHint}
              </>
            }
            action={
              <Button variant="primary" loading={store.isFetching} onClick={() => setToken(Date.now())}>
                {ui.retry}
              </Button>
            }
          />
        </div>
      ) : store.isPending ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="alona-glass flex flex-col gap-3 rounded-[18px] p-4">
              <Skeleton height={42} width="65%" />
              <Skeleton height={16} />
              <Skeleton height={24} width="45%" />
            </div>
          ))}
        </div>
      ) : data && data.items.length === 0 ? (
        <div className="alona-glass rounded-[18px]">
          <EmptyState icon={<Search size={22} />} title={ui.noEntries} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-refreshing={store.isPlaceholderData || undefined}>
          {data?.items.map(entry => (
            <StoreCard
              key={entry.repo}
              entry={entry}
              packages={packages}
              busy={actions.busy.has(entry.repo)}
              onInstall={replace => void actions.install({ Source: entry.repo, Replace: replace })}
              onUpdate={pkg => setUpdating(pkg)}
            />
          ))}
        </div>
      )}

      {data && <Pagination page={page} total={data.total} size={pageSize} onChange={setPage} disabled={store.isFetching} />}
      {data?.stale && <p className="text-center text-xs text-[var(--color-ink-muted)]">{ui.storeStale}</p>}

      {installMode && <InstallDialog initialMode={installMode} onClose={() => setInstallMode(null)} onInstall={actions.install} />}
      {updating && <UpdateDialog pkg={updating} onClose={() => setUpdating(null)} onUpdate={archive => actions.update(updating, archive)} />}
      {addingSource && (
        <TextDialog
          title={ui.addSource}
          label={ui.sourceRepository}
          placeholder="owner/repo"
          validate={value => (validRepository(value) ? null : ui.repositoryInvalid)}
          onClose={() => setAddingSource(false)}
          onSubmit={value => {
            saveSources([...new Set([...sources, value])]);
            chooseSource(value);
          }}
        />
      )}
      {customMirror && (
        <TextDialog
          title={ui.mirrorCustom}
          label={ui.mirrorPrefix}
          placeholder="https://ghfast.top/"
          description={ui.mirrorPrefixHint}
          initial={['auto', 'github', 'jsdelivr'].includes(mirror) ? '' : mirror}
          validate={value => (/^https:\/\/[^\s/?#]+(\/[^\s?#]*)?$/.test(value) ? null : ui.mirrorPrefixInvalid)}
          onClose={() => setCustomMirror(false)}
          onSubmit={chooseMirror}
        />
      )}
      {publishing && <PublishDialog sources={sources.length ? sources : [officialSource]} source={source || officialSource} onClose={() => setPublishing(false)} />}
      {actions.dialogs}
    </div>
  );
}

function StoreCard({
  entry,
  packages,
  busy,
  onInstall,
  onUpdate,
}: {
  entry: StoreEntry;
  packages: readonly Package[];
  busy: boolean;
  onInstall: (replace: boolean) => void;
  onUpdate: (pkg: Package) => void;
}): JSX.Element {
  const ui = useUI();
  const state = storeCardState(entry, [...packages]);
  const official = entry.repo.split('/')[0].toLowerCase() === 'alonabot';
  const occupant = !state.installed && (entry.role === 'agent' || entry.role === 'webui') ? packages.find(item => item.Role === entry.role) : undefined;
  const roleBadge = entry.role === 'adapter' ? ui.filterRoleAdapter : entry.role === 'agent' ? ui.filterRoleAgent : entry.role === 'webui' ? ui.filterRoleWebUI : null;

  return (
    <SpotlightCard className="flex h-full flex-col p-4">
      <div className="flex h-full flex-col gap-3">
        <header className="flex items-start gap-3">
          <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-2)] font-bold text-[var(--color-accent)]">
            {entry.icon_url ? <img src={entry.icon_url} alt="" className="h-full w-full object-cover" /> : <span aria-hidden="true">{(entry.name || entry.repo).slice(0, 1).toUpperCase()}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-bold text-[var(--color-ink)]">{entry.name || entry.repo}</span>
              {official && <BadgeCheck size={15} className="shrink-0 text-[var(--color-accent)]" aria-label={ui.officialVerified} />}
            </div>
            <span className="block truncate font-mono text-[11px] text-[var(--color-ink-muted)]">{entry.repo}</span>
          </div>
          {roleBadge && (
            <span className="shrink-0 rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-accent-strong)]">
              {roleBadge}
            </span>
          )}
        </header>

        <p className="line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-[var(--color-ink-muted)]">
          {entry.description || ui.unknownMetadata}
        </p>

        {entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {entry.tags.map(tag => (
              <span key={tag} className="rounded-md bg-[var(--color-surface-2)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-ink-muted)]">
                #{tag}
              </span>
            ))}
          </div>
        )}

        <footer className="mt-auto flex items-center gap-2 border-t border-[var(--color-line)]/65 pt-3 text-xs text-[var(--color-ink-muted)]">
          <span className="tabular-nums inline-flex items-center gap-1 font-mono">
            <Star size={13} className="text-[var(--color-warning)]" aria-hidden="true" />
            {entry.stars !== undefined ? compact(entry.stars) : '—'}
          </span>
          <span className="tabular-nums inline-flex items-center gap-1 font-mono">
            {state.installed && state.canUpdate ? (
              <>
                v{state.installed.Version}
                <ArrowRight size={11} aria-hidden="true" />
                <span className="font-semibold text-[var(--color-accent)]">v{entry.version}</span>
              </>
            ) : (
              `v${entry.version}`
            )}
          </span>
          <span className="flex-1" />
          {state.canUpdate && state.installed ? (
            <Button size="sm" variant="soft" icon={<ArrowUpCircle size={13} />} onClick={() => onUpdate(state.installed!)}>
              {ui.actionUpdate}
            </Button>
          ) : state.installed ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-success)] hover:underline"
              onClick={() => navigate(`/components/${encodeURIComponent(state.installed!.ID)}`)}
            >
              <CircleCheck size={14} />
              {ui.installed}
            </button>
          ) : occupant ? (
            <Button size="sm" variant="secondary" icon={<Repeat size={13} />} loading={busy} onClick={() => onInstall(true)}>
              {entry.role === 'agent' ? ui.replaceCurrentAgent : ui.replaceComponent}
            </Button>
          ) : (
            <Button size="sm" variant="primary" icon={<Download size={13} />} loading={busy} onClick={() => onInstall(false)}>
              {ui.actionInstall}
            </Button>
          )}
        </footer>
      </div>
    </SpotlightCard>
  );
}

function compact(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k` : String(value);
}

function TextDialog({
  title,
  label,
  placeholder,
  description,
  initial = '',
  validate,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  placeholder: string;
  description?: string;
  initial?: string;
  validate: (value: string) => string | null;
  onClose: () => void;
  onSubmit: (value: string) => void;
}): JSX.Element {
  const ui = useUI();
  const [value, setValue] = useState(initial);
  const [touched, setTouched] = useState(false);
  const problem = validate(value.trim());
  const submit = (): void => {
    setTouched(true);
    if (!problem) {
      onSubmit(value.trim());
      onClose();
    }
  };
  return (
    <Dialog
      open
      onOpenChange={open => { if (!open) onClose(); }}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>{ui.cancel}</Button>
          <Button variant="primary" disabled={!value.trim()} onClick={submit}>
            {ui.confirm}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3 py-1"
        onSubmit={event => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--color-ink)]">
          <span>{label}</span>
          <input
            className="alona-input font-mono"
            value={value}
            placeholder={placeholder}
            autoFocus
            spellCheck={false}
            onChange={event => setValue(event.target.value)}
            aria-invalid={touched && problem ? true : undefined}
          />
          {touched && problem && <small className="text-xs font-normal text-[var(--color-danger)]">{problem}</small>}
        </label>
      </form>
    </Dialog>
  );
}

function PublishDialog({
  sources,
  source,
  onClose,
}: {
  sources: readonly string[];
  source: string;
  onClose: () => void;
}): JSX.Element {
  const ui = useUI();
  const [repo, setRepo] = useState('');
  const [check, setCheck] = useState<StoreCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [tags, setTags] = useState('');
  const [target, setTarget] = useState(source);
  const tagList = tags
    .split(/[,，\s]+/)
    .map(tag => tag.trim().replace(/^#/, ''))
    .filter(Boolean);
  const fields = useMemo(
    () =>
      check
        ? ([
            ['repo', check.repo],
            ['role', check.role],
            ...(tagList.length ? ([['tags', tagList.join(',')]] as [string, string][]) : []),
            ['release_url', check.release_url],
          ] as [string, string][])
        : [],
    [check, tagList],
  );

  const runCheck = async (): Promise<void> => {
    setChecking(true);
    setFailure(null);
    setCheck(null);
    try {
      setCheck(await checkStoreRepo(repo.trim()));
    } catch (error: unknown) {
      setFailure(error instanceof AdminAPIError && error.code === 'NO_RELEASE' ? ui.noPublishedRelease : error instanceof Error ? error.message : String(error));
    } finally {
      setChecking(false);
    }
  };
  const submit = (): void => {
    const url = issueURL(target, fields);
    if (!url) {
      toast.error(ui.repositoryInvalid);
      return;
    }
    window.open(url, '_blank', 'noreferrer');
    toast.info(ui.storeSubmitted);
    onClose();
  };
  const role = check
    ? ({ plugin: ui.filterRolePlugin, adapter: ui.filterRoleAdapter, agent: ui.filterRoleAgent, webui: ui.filterRoleWebUI } as Record<string, string>)[check.role] ?? check.role
    : '';

  return (
    <Dialog
      open
      onOpenChange={open => { if (!open) onClose(); }}
      title={ui.publishPlugin}
      description={ui.publishInstructions}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {ui.cancel}
          </Button>
          <Button variant="primary" disabled={!check} onClick={submit}>
            {ui.storeSubmit}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3.5 py-1"
        onSubmit={event => {
          event.preventDefault();
          if (validRepository(repo.trim())) void runCheck();
        }}
      >
        <span className="text-xs font-semibold text-[var(--color-ink)]">{ui.storeCheckRepo}</span>
        <div className="flex items-center gap-2">
          <input
            className="alona-input flex-1 font-mono"
            value={repo}
            placeholder="owner/repo"
            spellCheck={false}
            disabled={checking}
            aria-label={ui.storeCheckRepo}
            onChange={event => {
              setRepo(event.target.value);
              setCheck(null);
              setFailure(null);
            }}
          />
          <Button type="submit" loading={checking} disabled={!validRepository(repo.trim())}>
            {ui.storeCheckAction}
          </Button>
        </div>
        {failure && (
          <p className="text-xs text-[var(--color-danger)]" role="alert">
            {failure}
          </p>
        )}
        {check && (
          <ul className="flex flex-col gap-1.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)]/70 p-3 text-xs">
            <li className="flex items-center gap-2 text-[var(--color-success)]">
              <Check size={14} /> {ui.publishLatestRelease.replace('{version}', check.version)}
            </li>
            <li className="flex items-center gap-2 text-[var(--color-success)]">
              <Check size={14} /> {ui.publishManifestValid.replace('{name}', check.name || check.repo)}
            </li>
            <li className="flex items-center gap-2 text-[var(--color-ink)]">
              <Check size={14} className="text-[var(--color-success)]" /> {ui.storeCheckType}：{role}
            </li>
            {check.warnings.map(warning => (
              <li key={warning} className="flex items-center gap-2 text-[var(--color-warning-ink)]">
                <AlertTriangle size={14} className="text-[var(--color-warning)]" /> {warning}
              </li>
            ))}
          </ul>
        )}
        {check && (
          <>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--color-ink)]">
              <span>{ui.storeCheckTags}</span>
              <input className="alona-input" value={tags} placeholder={ui.publishTagsPlaceholder} onChange={event => setTags(event.target.value)} />
            </label>
            {sources.length > 1 && (
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--color-ink)]">
                <span>{ui.pluginSources}</span>
                <Select variant="filled" value={target} onValueChange={setTarget} options={sources.map(value => ({ value, label: value }))} />
              </label>
            )}
          </>
        )}
      </form>
    </Dialog>
  );
}
