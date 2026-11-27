import { useEffect, useRef, useState, type JSX } from 'react';
import {
  ArrowUp,
  Download,
  Folder,
  FolderPlus,
  HardDrive,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { AdminAPIError } from '../api/client';
import {
  clearPluginData,
  deletePluginFile,
  deletePluginKV,
  downloadPluginFile,
  exportPluginData,
  getPluginKV,
  listPluginFiles,
  listPluginKV,
  makePluginDirectory,
  renamePluginFile,
  setPluginKV,
  uploadPluginFile,
} from '../api/data';
import { ActionDialog } from '../components/ActionDialog';
import { useUI } from '../i18n/UI';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/EmptyState';
import { Pagination } from '../ui/Pagination';
import { Select } from '../ui/Select';
import { SpotlightCard } from '../ui/SpotlightCard';
import { TabBar } from '../ui/Tabs';

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function kvInput(value: string, encoding: string): { text: string } | { value_base64: string } {
  if (encoding === 'text') return { text: value };
  atob(value);
  return { value_base64: value };
}

/** hasDatabase 为假时组件还没有数据库文件，读取 KV 失败按空列表显示。 */
export function StoragePanel({ id, hasDatabase = true }: { id: string; hasDatabase?: boolean }): JSX.Element {
  const ui = useUI();
  const kvSequence = useRef(0);
  const fileSequence = useRef(0);
  const [view, setView] = useState<'summary' | 'kv' | 'files'>('summary');
  const [kv, setKV] = useState<Awaited<ReturnType<typeof listPluginKV>> | null>(null);
  const [files, setFiles] = useState<Awaited<ReturnType<typeof listPluginFiles>> | null>(null);
  const [kvError, setKVError] = useState('');
  const [fileError, setFileError] = useState('');
  const [error, setError] = useState('');
  const [prefix, setPrefix] = useState('');
  const [page, setPage] = useState(1);
  const [fileQuery, setFileQuery] = useState('');
  const [filePage, setFilePage] = useState(1);
  const [path, setPath] = useState('');
  const [editing, setEditing] = useState<{ key: string; value: string; encoding: string; new: boolean } | null>(null);
  const [directory, setDirectory] = useState<string | null>(null);
  const [rename, setRename] = useState<{ from: string; to: string } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; text: string; run: () => Promise<void> } | null>(null);

  async function loadKV(): Promise<void> {
    const sequence = ++kvSequence.current;
    setKVError('');
    try {
      const result = await listPluginKV(id, { prefix, offset: (page - 1) * 20, limit: 20 });
      if (sequence !== kvSequence.current) return;
      setKV(result);
      setPage(current => Math.min(current, Math.max(1, Math.ceil(result.total / 20))));
    } catch (err) {
      if (sequence !== kvSequence.current) return;
      if (hasDatabase) {
        setKV(null);
        setKVError(String(err));
      } else {
        setKV({ items: [], total: 0 });
      }
    }
  }

  async function loadFiles(): Promise<void> {
    const sequence = ++fileSequence.current;
    setFileError('');
    try {
      const result = await listPluginFiles(id, path);
      if (sequence === fileSequence.current) setFiles(result);
    } catch (err) {
      if (sequence === fileSequence.current) {
        setFiles(null);
        setFileError(String(err));
      }
    }
  }

  useEffect(() => {
    setKV(null);
    void loadKV();
    return () => {
      kvSequence.current++;
    };
  }, [id, prefix, page]);

  useEffect(() => {
    setFiles(null);
    void loadFiles();
    return () => {
      fileSequence.current++;
    };
  }, [id, path]);

  async function run(action: () => Promise<void>): Promise<void> {
    setError('');
    try {
      await action();
    } catch (err) {
      setError(String(err));
    }
  }

  const filteredFiles =
    files?.entries.filter(entry => entry.name.toLowerCase().includes(fileQuery.trim().toLowerCase())) ?? [];
  const currentFilePage = Math.min(filePage, Math.max(1, Math.ceil(filteredFiles.length / 20)));
  const childPath = (name: string): string => (path ? `${path}/${name}` : name);

  async function upload(file: File, overwrite = false): Promise<void> {
    const target = childPath(file.name);
    try {
      await uploadPluginFile(id, target, file, overwrite);
      await loadFiles();
    } catch (err) {
      if (err instanceof AdminAPIError && err.status === 409 && !overwrite) {
        setConfirm({
          title: ui.overwriteFile,
          text: `${ui.overwriteFileDesc}\n${target}`,
          run: () => upload(file, true),
        });
      } else {
        throw err;
      }
    }
  }

  async function edit(key: string): Promise<void> {
    const value = await getPluginKV(id, key);
    setEditing({
      key,
      value: value.text ?? value.value_base64,
      encoding: value.text === undefined ? 'base64' : 'text',
      new: false,
    });
  }

  return (
    <div className="space-y-4">
      <TabBar
        variant="pill"
        aria-label={ui.storage}
        value={view}
        onValueChange={next => setView(next as typeof view)}
        items={[
          { value: 'summary', label: ui.storage },
          { value: 'kv', label: 'KV', count: kv?.total },
          { value: 'files', label: ui.files, count: files?.entries.length },
        ]}
      />

      {error && (
        <pre className="form-error whitespace-pre-wrap" role="alert">
          {error}
        </pre>
      )}

      {view === 'summary' && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <SpotlightCard className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                    <KeyRound size={17} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--color-ink)]">KV</h3>
                    <div className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
                      {kv ? `${kv.total} ${ui.key}` : <Skeleton width={80} height={14} />}
                    </div>
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setView('kv')}>
                  {ui.view}
                </Button>
              </div>
              {kvError && (
                <pre role="alert" className="form-error mt-3 mb-0 whitespace-pre-wrap">
                  {kvError}
                </pre>
              )}
            </SpotlightCard>

            <SpotlightCard className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                    <Folder size={17} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--color-ink)]">{ui.files}</h3>
                    <div className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
                      {files ? `${files.entries.length} ${ui.entries}` : <Skeleton width={80} height={14} />}
                    </div>
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setView('files')}>
                  {ui.view}
                </Button>
              </div>
              {fileError && (
                <pre role="alert" className="form-error mt-3 mb-0 whitespace-pre-wrap">
                  {fileError}
                </pre>
              )}
            </SpotlightCard>
          </div>

          <SpotlightCard className="p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                <HardDrive size={16} aria-hidden="true" />
              </span>
              <h3 className="text-base font-semibold text-[var(--color-ink)]">{ui.allPluginData}</h3>
            </div>

            <div className="divide-y divide-[var(--color-line)]/70">
              <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-[var(--color-ink)]">{ui.exportData}</p>
                  <p className="text-xs text-[var(--color-ink-muted)]">{ui.exportDataDesc}</p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Download size={14} />}
                  onClick={() => void run(async () => downloadBlob(await exportPluginData(id), `${id}-data.zip`))}
                >
                  {ui.exportData}
                </Button>
              </div>

              <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-[var(--color-danger)]">{ui.clearData}</p>
                  <p className="text-xs text-[var(--color-ink-muted)]">{ui.clearDataDesc}</p>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Trash2 size={14} />}
                  onClick={() =>
                    setConfirm({
                      title: ui.clearData,
                      text: ui.clearDataDesc,
                      run: async () => {
                        await clearPluginData(id, true);
                        setPage(1);
                        setPath('');
                        await Promise.all([loadKV(), loadFiles()]);
                      },
                    })
                  }
                >
                  {ui.clearData}
                </Button>
              </div>
            </div>
          </SpotlightCard>
        </div>
      )}

      {view === 'kv' && (
        <div className="space-y-3.5">
          <SpotlightCard className="p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="relative min-w-[180px] flex-1 sm:max-w-[300px]">
                <Search
                  size={14}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-ink-muted)]"
                />
                <input
                  type="search"
                  aria-label={ui.kvPrefix}
                  placeholder={ui.kvPrefix}
                  value={prefix}
                  onChange={e => {
                    setPrefix(e.target.value);
                    setPage(1);
                  }}
                  className="h-8 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] pr-3 pl-8.5 font-mono text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" iconOnly aria-label={ui.refresh} onClick={() => void loadKV()}>
                  <RefreshCw size={14} />
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Plus size={14} />}
                  onClick={() => setEditing({ key: '', value: '', encoding: 'text', new: true })}
                >
                  {ui.newKey}
                </Button>
              </div>
            </div>
          </SpotlightCard>

          {kvError && (
            <pre role="alert" className="form-error whitespace-pre-wrap">
              {kvError}
            </pre>
          )}

          <SpotlightCard className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-line)] text-left text-[var(--color-ink-muted)]">
                    <th className="px-5 py-3 font-medium">{ui.key}</th>
                    <th className="px-4 py-3 font-medium">{ui.size}</th>
                    <th className="px-4 py-3 font-medium">{ui.updatedAt}</th>
                    <th className="w-24 px-4 py-3 text-right font-medium">{ui.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-line)]/70">
                  {kv?.items.map(item => (
                    <tr key={item.key} className="transition-colors hover:bg-[var(--color-surface-2)]/50">
                      <td className="px-5 py-3 font-mono font-medium text-[var(--color-ink)]">{item.key}</td>
                      <td className="tabular-nums whitespace-nowrap px-4 py-3 font-mono text-[var(--color-ink-muted)]">
                        {item.size} B
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[var(--color-ink-muted)]">
                        {item.updated_at}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            iconOnly
                            aria-label={`${ui.modify}: ${item.key}`}
                            onClick={() => void run(() => edit(item.key))}
                          >
                            <Pencil size={13} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            iconOnly
                            aria-label={`${ui.actionDelete}: ${item.key}`}
                            onClick={() =>
                              setConfirm({
                                title: ui.actionDelete,
                                text: item.key,
                                run: async () => {
                                  await deletePluginKV(id, item.key);
                                  await loadKV();
                                },
                              })
                            }
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {kv?.total === 0 && (
                <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">{ui.noEntries}</p>
              )}
            </div>
          </SpotlightCard>
          {kv && <Pagination page={page} total={kv.total} size={20} onChange={setPage} />}
        </div>
      )}

      {view === 'files' && (
        <div className="space-y-3.5">
          <SpotlightCard className="p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  iconOnly
                  disabled={!path}
                  aria-label={ui.parentDirectory}
                  onClick={() => setPath(path.split('/').slice(0, -1).join('/'))}
                >
                  <ArrowUp size={14} />
                </Button>
                <span className="truncate rounded-lg bg-[var(--color-surface-2)] px-2.5 py-1 font-mono text-xs text-[var(--color-ink)]">
                  /{path}
                </span>
                <div className="relative min-w-[160px] flex-1 sm:max-w-[240px]">
                  <Search
                    size={14}
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-ink-muted)]"
                  />
                  <input
                    type="search"
                    aria-label={ui.files}
                    placeholder={ui.files}
                    value={fileQuery}
                    onChange={e => {
                      setFileQuery(e.target.value);
                      setFilePage(1);
                    }}
                    className="h-8 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] pr-3 pl-8.5 text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" iconOnly aria-label={ui.refresh} onClick={() => void loadFiles()}>
                  <RefreshCw size={14} />
                </Button>
                <Button size="sm" variant="secondary" icon={<FolderPlus size={14} />} onClick={() => setDirectory('')}>
                  {ui.newDirectory}
                </Button>
                <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[var(--color-accent-strong)] dark:text-[#0B1322]">
                  <Upload size={14} aria-hidden="true" />
                  <span>{ui.uploadFile}</span>
                  <input
                    type="file"
                    hidden
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) void run(() => upload(file));
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>
          </SpotlightCard>

          {fileError && (
            <pre role="alert" className="form-error whitespace-pre-wrap">
              {fileError}
            </pre>
          )}

          <SpotlightCard className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-line)] text-left text-[var(--color-ink-muted)]">
                    <th className="px-5 py-3 font-medium">{ui.name}</th>
                    <th className="px-4 py-3 font-medium">{ui.size}</th>
                    <th className="px-4 py-3 font-medium">{ui.updatedAt}</th>
                    <th className="w-28 px-4 py-3 text-right font-medium">{ui.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-line)]/70">
                  {filteredFiles.slice((currentFilePage - 1) * 20, currentFilePage * 20).map(entry => (
                    <tr key={entry.name} className="transition-colors hover:bg-[var(--color-surface-2)]/50">
                      <td className="px-5 py-3 font-mono text-[var(--color-ink)]">
                        {entry.dir ? (
                          <button
                            type="button"
                            onClick={() => setPath(childPath(entry.name))}
                            className="inline-flex items-center gap-2 font-medium text-[var(--color-accent)] hover:underline"
                          >
                            <Folder size={14} aria-hidden="true" />
                            <span>{entry.name}</span>
                          </button>
                        ) : (
                          entry.name
                        )}
                      </td>
                      <td className="tabular-nums whitespace-nowrap px-4 py-3 font-mono text-[var(--color-ink-muted)]">
                        {entry.dir ? '—' : `${entry.size} B`}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[var(--color-ink-muted)]">
                        {entry.modified_at}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          {!entry.dir && (
                            <Button
                              size="sm"
                              variant="ghost"
                              iconOnly
                              aria-label={`${ui.download}: ${entry.name}`}
                              onClick={() =>
                                void run(async () =>
                                  downloadBlob(await downloadPluginFile(id, childPath(entry.name)), entry.name),
                                )
                              }
                            >
                              <Download size={13} />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            iconOnly
                            aria-label={`${ui.rename}: ${entry.name}`}
                            onClick={() => setRename({ from: childPath(entry.name), to: childPath(entry.name) })}
                          >
                            <Pencil size={13} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            iconOnly
                            aria-label={`${ui.actionDelete}: ${entry.name}`}
                            onClick={() =>
                              setConfirm({
                                title: entry.dir ? ui.deleteDirectory : ui.actionDelete,
                                text: `${entry.dir ? ui.deleteDirectoryDesc : ui.deleteConfirm}\n${childPath(entry.name)}`,
                                run: async () => {
                                  await deletePluginFile(id, childPath(entry.name), entry.dir);
                                  await loadFiles();
                                },
                              })
                            }
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {files && filteredFiles.length === 0 && (
                <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">{ui.noEntries}</p>
              )}
            </div>
          </SpotlightCard>
          <Pagination page={currentFilePage} total={filteredFiles.length} size={20} onChange={setFilePage} />
        </div>
      )}

      {editing && (
        <ActionDialog
          title={ui.editValue}
          onClose={() => setEditing(null)}
          onConfirm={async () => {
            let value;
            try {
              value = kvInput(editing.value, editing.encoding);
            } catch {
              throw new Error(ui.invalidBase64);
            }
            await setPluginKV(id, editing.key, value);
            await loadKV();
          }}
        >
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="block text-xs font-semibold text-[var(--color-ink-muted)]">{ui.key}</span>
              <input
                value={editing.key}
                disabled={!editing.new}
                onChange={e => setEditing({ ...editing, key: e.target.value })}
                className="h-9 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 font-mono text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] disabled:opacity-60"
              />
            </label>
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-[var(--color-ink-muted)]">{ui.encoding}</span>
              <Select
                size="sm"
                variant="filled"
                className="w-full"
                aria-label={ui.encoding}
                value={editing.encoding}
                onValueChange={encoding => {
                  try {
                    const value =
                      encoding === 'base64'
                        ? btoa(Array.from(new TextEncoder().encode(editing.value), byte => String.fromCharCode(byte)).join(''))
                        : new TextDecoder('utf-8', { fatal: true }).decode(
                            Uint8Array.from(atob(editing.value), c => c.charCodeAt(0)),
                          );
                    setEditing({ ...editing, encoding, value });
                  } catch (err) {
                    setError(String(err));
                  }
                }}
                options={[
                  { value: 'text', label: ui.textValue },
                  { value: 'base64', label: ui.base64Value },
                ]}
              />
            </div>
            <label className="block space-y-1.5">
              <span className="block text-xs font-semibold text-[var(--color-ink-muted)]">{ui.value}</span>
              <textarea
                rows={4}
                value={editing.value}
                onChange={e => setEditing({ ...editing, value: e.target.value })}
                className="w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2 font-mono text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
              />
            </label>
          </div>
        </ActionDialog>
      )}

      {directory !== null && (
        <ActionDialog
          title={ui.newDirectory}
          onClose={() => setDirectory(null)}
          onConfirm={async () => {
            await makePluginDirectory(id, childPath(directory));
            await loadFiles();
          }}
        >
          <label className="block space-y-1.5">
            <span className="block text-xs font-semibold text-[var(--color-ink-muted)]">{ui.name}</span>
            <input
              value={directory}
              autoFocus
              onChange={e => setDirectory(e.target.value)}
              className="h-9 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 font-mono text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
            />
          </label>
        </ActionDialog>
      )}

      {rename && (
        <ActionDialog
          title={ui.rename}
          onClose={() => setRename(null)}
          onConfirm={async () => {
            await renamePluginFile(id, rename.from, rename.to);
            await loadFiles();
          }}
        >
          <label className="block space-y-1.5">
            <span className="block text-xs font-semibold text-[var(--color-ink-muted)]">{ui.filePath}</span>
            <input
              value={rename.to}
              autoFocus
              onChange={e => setRename({ ...rename, to: e.target.value })}
              className="h-9 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 font-mono text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
            />
          </label>
        </ActionDialog>
      )}

      {confirm && (
        <ActionDialog title={confirm.title} onClose={() => setConfirm(null)} onConfirm={confirm.run}>
          <p className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--color-ink-muted)]">
            {confirm.text}
          </p>
        </ActionDialog>
      )}
    </div>
  );
}
