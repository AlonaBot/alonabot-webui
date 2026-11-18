import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { deletePluginRow, insertPluginRow, listPluginRows, listPluginTables, updatePluginRow, type DataColumn, type DataRow, type DataTable, type Generation, type SQLiteValue } from '../api/admin';
import { ActionDialog } from '../components/ActionDialog';
import { Pagination } from '../components/Pagination';
import { useUI } from '../i18n/UI';

type Field = { mode: 'default' | 'null' | 'text' | 'number' | 'boolean' | 'blob'; value: string };
export function rowFields(columns: DataColumn[], row?: DataRow): Record<string, Field> {
  return Object.fromEntries(columns.map(column => {
    const value = row?.values[column.name];
    const field: Field = value === undefined ? { mode: 'default', value: '' }
      : value === null ? { mode: 'null', value: '' }
      : typeof value === 'object' ? { mode: 'blob', value: value.$base64 }
      : { mode: typeof value === 'string' ? 'text' : typeof value === 'boolean' ? 'boolean' : 'number', value: String(value) };
    return [column.name, field];
  }));
}
export function rowValues(fields: Record<string, Field>, original: Record<string, Field> = {}): Record<string, SQLiteValue> {
  return Object.fromEntries(Object.entries(fields).filter(([name, field]) => field.mode !== 'default' && !(original[name]?.mode === field.mode && original[name]?.value === field.value)).map(([name, field]) => {
    let value: SQLiteValue = field.value;
    if (field.mode === 'null') value = null;
    if (field.mode === 'number' || field.mode === 'boolean') {
      value = JSON.parse(field.value);
      if (typeof value !== field.mode || (typeof value === 'number' && !Number.isFinite(value))) throw new TypeError(`Invalid ${field.mode}: ${name}`);
    }
    if (field.mode === 'blob') { atob(field.value); value = { $base64: field.value }; }
    return [name, value];
  }));
}

export function DatabasePanel({ id, generations }: { id: string; generations: readonly Generation[] }) {
  const ui = useUI();
  const [generation, setGeneration] = useState('');
  const [tables, setTables] = useState<DataTable[] | null>(null);
  const [tableName, setTableName] = useState('');
  const [data, setData] = useState<Awaited<ReturnType<typeof listPluginRows>> | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [order, setOrder] = useState('');
  const [desc, setDesc] = useState(false);
  const [where, setWhere] = useState<Record<string, string>>({});
  const [filterColumn, setFilterColumn] = useState('');
  const [filterValue, setFilterValue] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<{ row?: DataRow; fields: Record<string, Field> } | null>(null);
  const [deleting, setDeleting] = useState<DataRow | null>(null);
  const table = tables?.find(item => item.name === tableName);
  const writable = generation === '' && table?.writable;
  useEffect(() => {
    let active = true;
    setTables(null); setError('');
    listPluginTables(id, generation).then(result => {
      if (!active) return;
      setTables(result.tables);
      setTableName(current => result.tables.some(item => item.name === current) ? current : result.tables[0]?.name ?? '');
    }).catch(err => { if (active) setError(String(err)); });
    return () => { active = false; };
  }, [id, generation, refresh]);
  useEffect(() => {
    if (!table) { setData(null); return; }
    let active = true;
    setData(null); setError('');
    listPluginRows(id, table.name, { offset: (page - 1) * 50, limit: 50, generation, order, desc, where }).then(result => {
      if (!active) return;
      setData(result);
      setPage(current => Math.min(current, Math.max(1, Math.ceil(result.total / 50))));
    }).catch(err => { if (active) setError(String(err)); });
    return () => { active = false; };
  }, [id, table, generation, page, order, desc, where]);
  function resetQuery() { setPage(1); setOrder(''); setDesc(false); setWhere({}); setFilterColumn(''); setFilterValue(''); }
  function reload() { setRefresh(value => value + 1); }
  const editable = table && editing;
  return <section className="database-panel">
    <div className="data-toolbar">
      <select aria-label={ui.databaseTable} value={tableName} onChange={event => { setTableName(event.target.value); resetQuery(); }}>
        {!tables?.length && <option value="">{ui.databaseTable}</option>}
        {tables?.map(item => <option key={item.name} value={item.name}>{item.name} · {item.rows} {ui.databaseRows}</option>)}
      </select>
      <select aria-label={ui.version} value={generation} onChange={event => { setGeneration(event.target.value); resetQuery(); }}>
        <option value="">{ui.currentVersion}</option>
        {generations.filter(item => !item.active).map(item => <option key={item.id} value={item.id}>{item.version} · {item.created_at}</option>)}
      </select>
      <button aria-label={ui.refresh} onClick={reload}><RefreshCw size={16} /></button>
      <button className="dialog-button is-primary" disabled={!writable || !table} onClick={() => table && setEditing({ fields: rowFields(table.columns) })}><Plus size={15} />{ui.insertRow}</button>
    </div>
    {error && <pre role="alert" className="form-error">{error}</pre>}
    {tables === null ? !error && <p role="status">{ui.loading}</p> : !tables.length ? <p className="data-empty">{ui.noTables}</p> : table && <>
      {!writable && <p className="muted">{ui.databaseReadOnly}</p>}
      <form className="data-toolbar database-filters" onSubmit={event => { event.preventDefault(); if (filterColumn) { setWhere(current => ({ ...current, [filterColumn]: filterValue })); setPage(1); } }}>
        <select aria-label={ui.databaseColumn} value={filterColumn} onChange={event => setFilterColumn(event.target.value)}><option value="">{ui.databaseColumn}</option>{table.columns.map(column => <option key={column.name}>{column.name}</option>)}</select>
        <input aria-label={ui.filterValue} value={filterValue} onChange={event => setFilterValue(event.target.value)} placeholder={ui.filterValue} />
        <button type="submit" disabled={!filterColumn}>{ui.addFilter}</button>
        {Object.entries(where).map(([column, value]) => <button type="button" className="database-filter" key={column} onClick={() => { setWhere(current => Object.fromEntries(Object.entries(current).filter(([name]) => name !== column))); setPage(1); }}>{column} = {value}<X size={12} aria-label={ui.removeFilter} /></button>)}
      </form>
      {data ? <>
        <div className="data-table-wrap database-grid"><table className="data-table"><thead><tr><th>rowid</th>{table.columns.map(column => <th key={column.name} aria-sort={order === column.name ? desc ? 'descending' : 'ascending' : 'none'}><button onClick={() => { setOrder(column.name); setDesc(order === column.name ? !desc : false); setPage(1); }}>{column.name}{order === column.name && (desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}</button><small>{column.type || '—'}{column.pk ? ' · PK' : ''}{column.notnull ? ' · NOT NULL' : ''}</small></th>)}<th>{ui.actions}</th></tr></thead><tbody>
          {data.rows.map((row, index) => <tr key={row.rowid ?? index}><td className="font-mono">{row.rowid ?? '—'}</td>{table.columns.map(column => <td key={column.name} className="database-cell"><span>{row.values[column.name] === null ? <i className="muted">NULL</i> : typeof row.values[column.name] === 'object' ? `BLOB · ${JSON.stringify(row.values[column.name])}` : String(row.values[column.name])}</span></td>)}<td><button disabled={!writable || row.rowid === null} aria-label={`${ui.modify}: ${row.rowid}`} onClick={() => setEditing({ row, fields: rowFields(table.columns, row) })}><Pencil size={14} /></button><button disabled={!writable || row.rowid === null} aria-label={`${ui.actionDelete}: ${row.rowid}`} onClick={() => setDeleting(row)}><Trash2 size={14} /></button></td></tr>)}
        </tbody></table>{!data.rows.length && <p className="data-empty">{ui.noEntries}</p>}</div>
        <div className="database-footer"><span className="muted">{data.total} {ui.databaseRows}</span><Pagination page={page} total={data.total} size={50} onChange={setPage} /></div>
      </> : !error && <p role="status">{ui.loading}</p>}
    </>}
    {editable && <ActionDialog title={editing.row ? ui.modify : ui.insertRow} onClose={() => setEditing(null)} onConfirm={async () => {
      let values: Record<string, SQLiteValue>;
      try { values = rowValues(editing.fields, editing.row ? rowFields(table.columns, editing.row) : {}); } catch (err) { throw new Error(`${ui.invalidDatabaseValue}: ${String(err)}`); }
      if (editing.row && Object.keys(values).length === 0) return;
      if (editing.row) await updatePluginRow(id, table.name, editing.row.rowid!, values);
      else await insertPluginRow(id, table.name, values);
      reload();
    }}><div className="data-dialog-body database-editor">{table.columns.map(column => {
      const field = editing.fields[column.name];
      const setField = (next: Field) => setEditing({ ...editing, fields: { ...editing.fields, [column.name]: next } });
      return <div className="database-field" key={column.name}><label>{column.name} <small className="muted">{column.type}{column.pk ? ' · PK' : ''}{column.notnull ? ' · NOT NULL' : ''}</small>
        <select aria-label={`${column.name}: ${ui.databaseValueType}`} value={field.mode} onChange={event => setField({ ...field, mode: event.target.value as Field['mode'] })}>
          <option value="default">{ui.databaseDefault}</option><option value="null">NULL</option><option value="text">{ui.textValue}</option><option value="number">{ui.databaseNumber}</option><option value="boolean">{ui.databaseBoolean}</option><option value="blob">BLOB (base64)</option>
        </select></label>
        {field.mode === 'boolean' ? <select aria-label={column.name} value={field.value} onChange={event => setField({ ...field, value: event.target.value })}><option value="">—</option><option>true</option><option>false</option></select> : <textarea aria-label={column.name} className="font-mono" disabled={field.mode === 'default' || field.mode === 'null'} value={field.value} onChange={event => setField({ ...field, value: event.target.value })} />}
      </div>;
    })}</div></ActionDialog>}
    {deleting && table && <ActionDialog title={ui.actionDelete} onClose={() => setDeleting(null)} onConfirm={async () => { await deletePluginRow(id, table.name, deleting.rowid!); reload(); }}><p>{ui.deleteConfirm}</p><p className="font-mono">{table.name} · rowid {deleting.rowid}</p></ActionDialog>}
  </section>;
}
