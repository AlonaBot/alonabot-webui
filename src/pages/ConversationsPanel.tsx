import { useEffect, useState } from 'react';
import { clearPluginConversation, listPluginConversations } from '../api/admin';
import { useUI } from '../i18n/UI';
import { ActionDialog } from '../components/ActionDialog';
import { Pagination } from '../components/Pagination';
export function ConversationsPanel({ id }: { id: string }) {
  const ui = useUI();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listPluginConversations>>>([]);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [clear, setClear] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); try { setRows(await listPluginConversations(id)); } catch (err) { setError(String(err)); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [id]);
  const filtered = rows.filter(row => row.key.toLowerCase().includes(query.toLowerCase()));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 20)));
  return <section><div className="data-toolbar"><input aria-label={ui.conversations} placeholder={ui.conversations} value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /><button onClick={() => { setError(''); void load(); }}>{ui.refresh}</button></div>{error && <pre role="alert" className="form-error">{error}</pre>}{loading ? <p>{ui.loading}</p> : <div className="data-table-wrap"><table className="data-table"><thead><tr><th>{ui.key}</th><th>{ui.entries}</th><th>{ui.updatedAt}</th><th>{ui.actions}</th></tr></thead><tbody>{filtered.slice((currentPage - 1) * 20, currentPage * 20).map(row => <tr key={row.key}><td>{row.key}</td><td>{row.entries}</td><td>{row.updated_at}</td><td><button onClick={() => setClear(row.key)}>{ui.clearConversation}</button></td></tr>)}</tbody></table>{!filtered.length && <p className="data-empty">{ui.noEntries}</p>}</div>}<Pagination page={currentPage} total={filtered.length} size={20} onChange={setPage} />{clear !== null && <ActionDialog title={ui.clearConversation} onClose={() => setClear(null)} onConfirm={async () => { await clearPluginConversation(id, clear); await load(); }}><p>{clear}</p></ActionDialog>}</section>;
}
