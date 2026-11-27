import { useEffect, useState, type JSX } from 'react';
import { RefreshCw, Search, Trash2 } from 'lucide-react';
import { clearPluginConversation, listPluginConversations } from '../api/conversations';
import { ActionDialog } from '../components/ActionDialog';
import { useUI } from '../i18n/UI';
import { Button } from '../ui/Button';
import { LoadingRows } from '../ui/EmptyState';
import { Pagination } from '../ui/Pagination';
import { SpotlightCard } from '../ui/SpotlightCard';

export function ConversationsPanel({ id }: { id: string }): JSX.Element {
  const ui = useUI();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listPluginConversations>>>([]);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [clear, setClear] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      setRows(await listPluginConversations(id));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  const filtered = rows.filter(row => row.key.toLowerCase().includes(query.trim().toLowerCase()));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 20)));

  return (
    <section className="space-y-4">
      <SpotlightCard className="p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="relative min-w-[200px] flex-1 sm:max-w-[320px]">
            <Search
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-ink-muted)]"
            />
            <input
              type="search"
              aria-label={ui.conversations}
              placeholder={ui.conversations}
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setPage(1);
              }}
              className="h-8 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] pr-3 pl-8.5 font-mono text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon={<RefreshCw size={14} />}
            onClick={() => {
              setError('');
              void load();
            }}
          >
            {ui.refresh}
          </Button>
        </div>
      </SpotlightCard>

      {error && (
        <pre role="alert" className="form-error whitespace-pre-wrap">
          {error}
        </pre>
      )}

      {loading ? (
        <SpotlightCard className="p-5">
          <LoadingRows />
        </SpotlightCard>
      ) : (
        <SpotlightCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left text-[var(--color-ink-muted)]">
                  <th className="px-5 py-3 font-medium">{ui.key}</th>
                  <th className="px-4 py-3 text-right font-medium">{ui.entries}</th>
                  <th className="px-4 py-3 font-medium">{ui.updatedAt}</th>
                  <th className="w-28 px-4 py-3 text-right font-medium">{ui.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]/70">
                {filtered.slice((currentPage - 1) * 20, currentPage * 20).map(row => (
                  <tr key={row.key} className="transition-colors hover:bg-[var(--color-surface-2)]/50">
                    <td className="px-5 py-3 font-mono text-[var(--color-ink)]">{row.key}</td>
                    <td className="tabular-nums px-4 py-3 text-right font-mono text-[var(--color-ink)]">
                      {row.entries}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[var(--color-ink-muted)]">
                      {row.updated_at}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={() => setClear(row.key)}>
                        {ui.clearConversation}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && (
              <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">{ui.noEntries}</p>
            )}
          </div>
        </SpotlightCard>
      )}

      <Pagination page={currentPage} total={filtered.length} size={20} onChange={setPage} />

      {clear !== null && (
        <ActionDialog
          title={ui.clearConversation}
          onClose={() => setClear(null)}
          onConfirm={async () => {
            await clearPluginConversation(id, clear);
            await load();
          }}
        >
          <p className="break-all font-mono text-xs text-[var(--color-ink-muted)]">{clear}</p>
        </ActionDialog>
      )}
    </section>
  );
}
