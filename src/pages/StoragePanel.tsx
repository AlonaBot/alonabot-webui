import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Download, Folder, FolderPlus, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { AdminAPIError, clearPluginData, deletePluginFile, deletePluginKV, downloadPluginFile, exportPluginData, getPluginKV, listPluginFiles, listPluginKV, makePluginDirectory, renamePluginFile, setPluginKV, uploadPluginFile } from '../api/admin';
import { useUI } from '../i18n/UI';
import { Pagination } from '../components/Pagination';
import { ActionDialog } from '../components/ActionDialog';

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
export function kvInput(value: string, encoding: string): { text: string } | { value_base64: string } {
  if (encoding === 'text') return { text: value };
  atob(value);
  return { value_base64: value };
}
export function StoragePanel({ id }: { id: string }) {
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
  async function loadKV() {
    const sequence = ++kvSequence.current;
    setKVError('');
    try { const result = await listPluginKV(id, { prefix, offset: (page - 1) * 20, limit: 20 }); if (sequence !== kvSequence.current) return; setKV(result); setPage(current => Math.min(current, Math.max(1, Math.ceil(result.total / 20)))); } catch (err) { if (sequence === kvSequence.current) { setKV(null); setKVError(String(err)); } }
  }
  async function loadFiles() {
    const sequence = ++fileSequence.current;
    setFileError('');
    try { const result = await listPluginFiles(id, path); if (sequence === fileSequence.current) setFiles(result); } catch (err) { if (sequence === fileSequence.current) { setFiles(null); setFileError(String(err)); } }
  }
  useEffect(() => { setKV(null); void loadKV(); return () => { kvSequence.current++; }; }, [id, prefix, page]);
  useEffect(() => { setFiles(null); void loadFiles(); return () => { fileSequence.current++; }; }, [id, path]);
  async function run(action: () => Promise<void>) { setError(''); try { await action(); } catch (err) { setError(String(err)); } }
  const filteredFiles = files?.entries.filter(entry => entry.name.toLowerCase().includes(fileQuery.toLowerCase())) ?? [];
  const currentFilePage = Math.min(filePage, Math.max(1, Math.ceil(filteredFiles.length / 20)));
  const childPath = (name: string) => path ? `${path}/${name}` : name;
  async function upload(file: File, overwrite = false): Promise<void> {
    const target = childPath(file.name);
    try { await uploadPluginFile(id, target, file, overwrite); await loadFiles(); }
    catch (err) {
      if (err instanceof AdminAPIError && err.status === 409 && !overwrite) setConfirm({ title: ui.overwriteFile, text: `${ui.overwriteFileDesc}\n${target}`, run: () => upload(file, true) });
      else throw err;
    }
  }
  async function edit(key: string) {
    const value = await getPluginKV(id, key);
    setEditing({ key, value: value.text ?? value.value_base64, encoding: value.text === undefined ? 'base64' : 'text', new: false });
  }
  return <div className="storage-panel">
    <div className="time-range-pills"><button className={`time-range-pill ${view === 'summary' ? 'is-active' : ''}`} onClick={() => setView('summary')}>{ui.storage}</button><button className={`time-range-pill ${view === 'kv' ? 'is-active' : ''}`} onClick={() => setView('kv')}>KV</button><button className={`time-range-pill ${view === 'files' ? 'is-active' : ''}`} onClick={() => setView('files')}>{ui.files}</button></div>
    {error && <pre className="form-error" role="alert">{error}</pre>}
    {view === 'summary' && <>
      <section className="storage-section"><h3>KV</h3><div className="storage-row"><div>{kv ? `${kv.total} ${ui.key}` : ui.loading}{kvError && <pre role="alert">{kvError}</pre>}</div><button onClick={() => setView('kv')}>{ui.view}</button></div></section>
      <section className="storage-section"><h3>{ui.files}</h3><div className="storage-row"><div>{files ? `${files.entries.length} ${ui.entries}` : ui.loading}{fileError && <pre role="alert">{fileError}</pre>}</div><button onClick={() => setView('files')}>{ui.view}</button></div></section>
      <section className="storage-section"><h3>{ui.allPluginData}</h3><div className="storage-row"><div>{ui.exportData}<p>{ui.exportDataDesc}</p></div><button onClick={() => void run(async () => downloadBlob(await exportPluginData(id), `${id}-data.zip`))}><Download size={14} /> {ui.exportData}</button></div><div className="storage-row"><div>{ui.clearData}<p>{ui.clearDataDesc}</p></div><button className="dialog-button is-danger" onClick={() => setConfirm({ title: ui.clearData, text: ui.clearDataDesc, run: async () => { await clearPluginData(id, true); setPage(1); setPath(''); await Promise.all([loadKV(), loadFiles()]); } })}>{ui.clearData}</button></div></section>
    </>}
    {view === 'kv' && <div className="storage-browser"><div className="data-toolbar"><input aria-label={ui.kvPrefix} placeholder={ui.kvPrefix} value={prefix} onChange={e => { setPrefix(e.target.value); setPage(1); }} /><button onClick={() => void loadKV()}>{ui.refresh}</button><button onClick={() => setEditing({ key: '', value: '', encoding: 'text', new: true })}><Plus size={15} />{ui.newKey}</button></div>{kvError && <pre role="alert" className="form-error">{kvError}</pre>}
      <div className="data-table-wrap"><table className="data-table"><thead><tr><th>{ui.key}</th><th>{ui.size}</th><th>{ui.updatedAt}</th><th>{ui.actions}</th></tr></thead><tbody>{kv?.items.map(item => <tr key={item.key}><td>{item.key}</td><td>{item.size} B</td><td>{item.updated_at}</td><td><button aria-label={`${ui.modify}: ${item.key}`} onClick={() => void run(() => edit(item.key))}><Pencil size={14} /></button><button aria-label={`${ui.actionDelete}: ${item.key}`} onClick={() => setConfirm({ title: ui.actionDelete, text: item.key, run: async () => { await deletePluginKV(id, item.key); await loadKV(); } })}><Trash2 size={14} /></button></td></tr>)}</tbody></table>{kv?.total === 0 && <p className="data-empty">{ui.noEntries}</p>}</div>{kv && <Pagination page={page} total={kv.total} size={20} onChange={setPage} />}
    </div>}
    {view === 'files' && <div className="storage-browser"><div className="data-toolbar"><button disabled={!path} aria-label={ui.parentDirectory} onClick={() => setPath(path.split('/').slice(0, -1).join('/'))}><ArrowUp size={16} /></button><span className="storage-path">/{path}</span><input aria-label={ui.files} placeholder={ui.files} value={fileQuery} onChange={e => { setFileQuery(e.target.value); setFilePage(1); }} /><button onClick={() => void loadFiles()}>{ui.refresh}</button><button onClick={() => setDirectory('')}><FolderPlus size={16} />{ui.newDirectory}</button><label className="dialog-button"><Upload size={16} />{ui.uploadFile}<input type="file" hidden onChange={e => { const file = e.target.files?.[0]; if (file) void run(() => upload(file)); e.target.value = ''; }} /></label></div>{fileError && <pre role="alert" className="form-error">{fileError}</pre>}
      <div className="data-table-wrap"><table className="data-table"><thead><tr><th>{ui.name}</th><th>{ui.size}</th><th>{ui.updatedAt}</th><th>{ui.actions}</th></tr></thead><tbody>{filteredFiles.slice((currentFilePage - 1) * 20, currentFilePage * 20).map(entry => <tr key={entry.name}><td>{entry.dir ? <button onClick={() => setPath(childPath(entry.name))}><Folder size={14} /> {entry.name}</button> : entry.name}</td><td>{entry.dir ? '—' : `${entry.size} B`}</td><td>{entry.modified_at}</td><td>{!entry.dir && <button aria-label={`${ui.download}: ${entry.name}`} onClick={() => void run(async () => downloadBlob(await downloadPluginFile(id, childPath(entry.name)), entry.name))}><Download size={14} /></button>}<button aria-label={`${ui.rename}: ${entry.name}`} onClick={() => setRename({ from: childPath(entry.name), to: childPath(entry.name) })}><Pencil size={14} /></button><button aria-label={`${ui.actionDelete}: ${entry.name}`} onClick={() => setConfirm({ title: entry.dir ? ui.deleteDirectory : ui.actionDelete, text: `${entry.dir ? ui.deleteDirectoryDesc : ui.deleteConfirm}\n${childPath(entry.name)}`, run: async () => { await deletePluginFile(id, childPath(entry.name), entry.dir); await loadFiles(); } })}><Trash2 size={14} /></button></td></tr>)}</tbody></table>{files && filteredFiles.length === 0 && <p className="data-empty">{ui.noEntries}</p>}</div><Pagination page={currentFilePage} total={filteredFiles.length} size={20} onChange={setFilePage} />
    </div>}
    {editing && <ActionDialog title={ui.editValue} onClose={() => setEditing(null)} onConfirm={async () => { let value; try { value = kvInput(editing.value, editing.encoding); } catch { throw new Error(ui.invalidBase64); } await setPluginKV(id, editing.key, value); await loadKV(); }}>
      <label className="dialog-field-label">{ui.key}<input value={editing.key} disabled={!editing.new} onChange={e => setEditing({ ...editing, key: e.target.value })} /></label>
      <label className="dialog-field-label">{ui.encoding}<select value={editing.encoding} onChange={e => {
        const encoding = e.target.value;
        try {
          const value = encoding === 'base64' ? btoa(Array.from(new TextEncoder().encode(editing.value), byte => String.fromCharCode(byte)).join('')) : new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(editing.value), c => c.charCodeAt(0)));
          setEditing({ ...editing, encoding, value });
        } catch (err) { setError(String(err)); }
      }}><option value="text">{ui.textValue}</option><option value="base64">{ui.base64Value}</option></select></label>
      <label className="dialog-field-label">{ui.value}<textarea className="font-mono" value={editing.value} onChange={e => setEditing({ ...editing, value: e.target.value })} /></label>
    </ActionDialog>}
    {directory !== null && <ActionDialog title={ui.newDirectory} onClose={() => setDirectory(null)} onConfirm={async () => { await makePluginDirectory(id, childPath(directory)); await loadFiles(); }}><label>{ui.name}<input value={directory} onChange={e => setDirectory(e.target.value)} /></label></ActionDialog>}
    {rename && <ActionDialog title={ui.rename} onClose={() => setRename(null)} onConfirm={async () => { await renamePluginFile(id, rename.from, rename.to); await loadFiles(); }}><label>{ui.filePath}<input value={rename.to} onChange={e => setRename({ ...rename, to: e.target.value })} /></label></ActionDialog>}
    {confirm && <ActionDialog title={confirm.title} onClose={() => setConfirm(null)} onConfirm={confirm.run}><p className="storage-path">{confirm.text}</p></ActionDialog>}
  </div>;
}
