import { useEffect, useState, type JSX } from 'react';
import { ArrowDown, ArrowUp, Database, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import {
  deletePluginRow,
  insertPluginRow,
  listPluginRows,
  listPluginTables,
  updatePluginRow,
  type DataColumn,
  type DataRow,
  type DataTable,
  type SQLiteValue,
} from '../api/data';
import type { Generation } from '../api/packages';
import { ActionDialog } from '../components/ActionDialog';
import { useUI } from '../i18n/UI';
import { Button } from '../ui/Button';
import { EmptyState, Skeleton } from '../ui/EmptyState';
import { Pagination } from '../ui/Pagination';
import { Select } from '../ui/Select';
import { SpotlightCard } from '../ui/SpotlightCard';

type Field = { mode: 'default' | 'null' | 'text' | 'number' | 'boolean' | 'blob'; value: string };

export function rowFields(columns: DataColumn[], row?: DataRow): Record<string, Field> {
  return Object.fromEntries(
    columns.map(column => {
      const value = row?.values[column.name];
      const field: Field =
        value === undefined
          ? { mode: 'default', value: '' }
          : value === null
            ? { mode: 'null', value: '' }
            : typeof value === 'object'
              ? { mode: 'blob', value: value.$base64 }
              : {
                  mode: typeof value === 'string' ? 'text' : typeof value === 'boolean' ? 'boolean' : 'number',
                  value: String(value),
                };
      return [column.name, field];
    }),
  );
}

export function rowValues(fields: Record<string, Field>, original: Record<string, Field> = {}): Record<string, SQLiteValue> {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(
        ([name, field]) =>
          field.mode !== 'default' && !(original[name]?.mode === field.mode && original[name]?.value === field.value),
      )
      .map(([name, field]) => {
        let value: SQLiteValue = field.value;
        if (field.mode === 'null') value = null;
        if (field.mode === 'number' || field.mode === 'boolean') {
          value = JSON.parse(field.value);
          if (typeof value !== field.mode || (typeof value === 'number' && !Number.isFinite(value))) {
            throw new TypeError(`Invalid ${field.mode}: ${name}`);
          }
        }
        if (field.mode === 'blob') {
          atob(field.value);
          value = { $base64: field.value };
        }
        return [name, value];
      }),
  );
}

export function DatabasePanel({ id, generations }: { id: string; generations: readonly Generation[] }): JSX.Element {
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
  const writable = generation === '' && Boolean(table?.writable);
  const selected = generations.find(item => (generation === '' ? item.active : item.id === generation));
  const missing = selected !== undefined && !selected.has_db;

  useEffect(() => {
    let active = true;
    setTables(null);
    setError('');
    if (missing) {
      setTables([]);
      return;
    }
    listPluginTables(id, generation)
      .then(result => {
        if (!active) return;
        setTables(result.tables);
        setTableName(current =>
          result.tables.some(item => item.name === current) ? current : (result.tables[0]?.name ?? ''),
        );
      })
      .catch(err => {
        if (active) setError(String(err));
      });
    return () => {
      active = false;
    };
  }, [id, generation, refresh, missing]);

  useEffect(() => {
    if (!table) {
      setData(null);
      return;
    }
    let active = true;
    setData(null);
    setError('');
    listPluginRows(id, table.name, { offset: (page - 1) * 50, limit: 50, generation, order, desc, where })
      .then(result => {
        if (!active) return;
        setData(result);
        setPage(current => Math.min(current, Math.max(1, Math.ceil(result.total / 50))));
      })
      .catch(err => {
        if (active) setError(String(err));
      });
    return () => {
      active = false;
    };
  }, [id, table, generation, page, order, desc, where]);

  function resetQuery(): void {
    setPage(1);
    setOrder('');
    setDesc(false);
    setWhere({});
    setFilterColumn('');
    setFilterValue('');
  }

  function reload(): void {
    setRefresh(value => value + 1);
  }

  const editable = table && editing;

  return (
    <section className="space-y-4">
      <SpotlightCard className="p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              size="sm"
              variant="filled"
              aria-label={ui.databaseTable}
              value={tableName}
              onValueChange={next => {
                setTableName(next);
                resetQuery();
              }}
              options={
                !tables?.length
                  ? [{ value: '', label: ui.databaseTable }]
                  : tables.map(item => ({
                      value: item.name,
                      label: `${item.name} · ${item.rows} ${ui.databaseRows}`,
                    }))
              }
            />
            <Select
              size="sm"
              variant="filled"
              aria-label={ui.version}
              value={generation}
              onValueChange={next => {
                setGeneration(next);
                resetQuery();
              }}
              options={[
                { value: '', label: ui.currentVersion },
                ...generations
                  .filter(item => !item.active)
                  .map(item => ({ value: item.id, label: `${item.version} · ${item.created_at}` })),
              ]}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" iconOnly aria-label={ui.refresh} onClick={reload}>
              <RefreshCw size={14} />
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<Plus size={14} />}
              disabled={!writable || !table}
              onClick={() => table && setEditing({ fields: rowFields(table.columns) })}
            >
              {ui.insertRow}
            </Button>
          </div>
        </div>
      </SpotlightCard>

      {error && (
        <pre role="alert" className="form-error whitespace-pre-wrap">
          {error}
        </pre>
      )}

      {tables === null ? (
        <SpotlightCard className="p-5">
          <Skeleton height={120} />
        </SpotlightCard>
      ) : !tables.length ? (
        <SpotlightCard className="p-6">
          <EmptyState icon={<Database size={22} />} title={ui.noTables} />
        </SpotlightCard>
      ) : (
        table && (
          <>
            {!writable && <p className="text-xs text-[var(--color-ink-muted)]">{ui.databaseReadOnly}</p>}

            <SpotlightCard className="p-3.5">
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={event => {
                  event.preventDefault();
                  if (filterColumn) {
                    setWhere(current => ({ ...current, [filterColumn]: filterValue }));
                    setPage(1);
                  }
                }}
              >
                <Select
                  size="sm"
                  variant="filled"
                  aria-label={ui.databaseColumn}
                  value={filterColumn}
                  onValueChange={setFilterColumn}
                  options={[
                    { value: '', label: ui.databaseColumn },
                    ...table.columns.map(column => ({ value: column.name, label: column.name })),
                  ]}
                />
                <input
                  aria-label={ui.filterValue}
                  value={filterValue}
                  onChange={event => setFilterValue(event.target.value)}
                  placeholder={ui.filterValue}
                  className="h-8 min-w-[160px] flex-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 font-mono text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] sm:max-w-[260px]"
                />
                <Button type="submit" size="sm" variant="soft" disabled={!filterColumn}>
                  {ui.addFilter}
                </Button>
                {Object.entries(where).map(([column, value]) => (
                  <button
                    type="button"
                    key={column}
                    onClick={() => {
                      setWhere(current => Object.fromEntries(Object.entries(current).filter(([name]) => name !== column)));
                      setPage(1);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 font-mono text-xs font-medium text-[var(--color-accent-strong)]"
                  >
                    <span>
                      {column} = {value}
                    </span>
                    <X size={12} aria-label={ui.removeFilter} />
                  </button>
                ))}
              </form>
            </SpotlightCard>

            {data ? (
              <>
                <SpotlightCard className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[var(--color-line)] text-left text-[var(--color-ink-muted)]">
                          <th className="px-4 py-3 font-mono font-medium">rowid</th>
                          {table.columns.map(column => (
                            <th
                              key={column.name}
                              aria-sort={order === column.name ? (desc ? 'descending' : 'ascending') : 'none'}
                              className="px-4 py-3"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setOrder(column.name);
                                  setDesc(order === column.name ? !desc : false);
                                  setPage(1);
                                }}
                                className="inline-flex items-center gap-1 font-mono font-semibold text-[var(--color-ink)] hover:text-[var(--color-accent)]"
                              >
                                <span>{column.name}</span>
                                {order === column.name && (desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                              </button>
                              <div className="mt-0.5 font-mono text-[10px] font-normal text-[var(--color-ink-muted)]">
                                {column.type || '—'}
                                {column.pk ? ' · PK' : ''}
                                {column.notnull ? ' · NOT NULL' : ''}
                              </div>
                            </th>
                          ))}
                          <th className="w-20 px-4 py-3 text-right font-medium">{ui.actions}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-line)]/70">
                        {data.rows.map((row, index) => (
                          <tr key={row.rowid ?? index} className="transition-colors hover:bg-[var(--color-surface-2)]/50">
                            <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[var(--color-ink-muted)]">
                              {row.rowid ?? '—'}
                            </td>
                            {table.columns.map(column => {
                              const cell = row.values[column.name];
                              return (
                                <td key={column.name} className="max-w-[280px] truncate px-4 py-2.5 font-mono text-[var(--color-ink)]">
                                  {cell === null ? (
                                    <span className="italic text-[var(--color-ink-muted)]">NULL</span>
                                  ) : typeof cell === 'object' ? (
                                    `BLOB · ${JSON.stringify(cell)}`
                                  ) : (
                                    String(cell)
                                  )}
                                </td>
                              );
                            })}
                            <td className="whitespace-nowrap px-4 py-2.5 text-right">
                              <div className="inline-flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  iconOnly
                                  disabled={!writable || row.rowid === null}
                                  aria-label={`${ui.modify}: ${row.rowid}`}
                                  onClick={() => setEditing({ row, fields: rowFields(table.columns, row) })}
                                >
                                  <Pencil size={13} />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  iconOnly
                                  disabled={!writable || row.rowid === null}
                                  aria-label={`${ui.actionDelete}: ${row.rowid}`}
                                  onClick={() => setDeleting(row)}
                                >
                                  <Trash2 size={13} />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!data.rows.length && (
                      <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">{ui.noEntries}</p>
                    )}
                  </div>
                </SpotlightCard>

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--color-ink-muted)]">
                  <span className="tabular-nums">
                    {data.total} {ui.databaseRows}
                  </span>
                  <Pagination page={page} total={data.total} size={50} onChange={setPage} />
                </div>
              </>
            ) : (
              <SpotlightCard className="p-5">
                <Skeleton height={120} />
              </SpotlightCard>
            )}
          </>
        )
      )}

      {editable && (
        <ActionDialog
          title={editing.row ? ui.modify : ui.insertRow}
          onClose={() => setEditing(null)}
          onConfirm={async () => {
            let values: Record<string, SQLiteValue>;
            try {
              values = rowValues(editing.fields, editing.row ? rowFields(table.columns, editing.row) : {});
            } catch (err) {
              throw new Error(`${ui.invalidDatabaseValue}: ${String(err)}`);
            }
            if (editing.row && Object.keys(values).length === 0) return;
            if (editing.row && editing.row.rowid !== null) {
              await updatePluginRow(id, table.name, editing.row.rowid, values);
            } else {
              await insertPluginRow(id, table.name, values);
            }
            reload();
          }}
        >
          <div className="space-y-4">
            {table.columns.map(column => {
              const field = editing.fields[column.name];
              const setField = (next: Field): void =>
                setEditing({ ...editing, fields: { ...editing.fields, [column.name]: next } });
              return (
                <div key={column.name} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-[var(--color-ink)]">
                      {column.name}{' '}
                      <small className="font-normal text-[var(--color-ink-muted)]">
                        {column.type}
                        {column.pk ? ' · PK' : ''}
                        {column.notnull ? ' · NOT NULL' : ''}
                      </small>
                    </span>
                    <Select
                      size="sm"
                      variant="filled"
                      aria-label={`${column.name}: ${ui.databaseValueType}`}
                      value={field.mode}
                      onValueChange={next => setField({ ...field, mode: next as Field['mode'] })}
                      options={[
                        { value: 'default', label: ui.databaseDefault },
                        { value: 'null', label: 'NULL' },
                        { value: 'text', label: ui.textValue },
                        { value: 'number', label: ui.databaseNumber },
                        { value: 'boolean', label: ui.databaseBoolean },
                        { value: 'blob', label: 'BLOB (base64)' },
                      ]}
                    />
                  </div>
                  {field.mode === 'boolean' ? (
                    <Select
                      size="sm"
                      variant="filled"
                      className="w-full"
                      aria-label={column.name}
                      value={field.value}
                      onValueChange={next => setField({ ...field, value: next })}
                      options={[
                        { value: '', label: '—' },
                        { value: 'true', label: 'true' },
                        { value: 'false', label: 'false' },
                      ]}
                    />
                  ) : (
                    <textarea
                      aria-label={column.name}
                      rows={2}
                      disabled={field.mode === 'default' || field.mode === 'null'}
                      value={field.value}
                      onChange={event => setField({ ...field, value: event.target.value })}
                      className="w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2 font-mono text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] disabled:opacity-50"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </ActionDialog>
      )}

      {deleting && table && deleting.rowid !== null && (
        <ActionDialog
          title={ui.actionDelete}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            if (deleting.rowid === null) return;
            await deletePluginRow(id, table.name, deleting.rowid);
            reload();
          }}
        >
          <p className="text-sm text-[var(--color-ink-muted)]">{ui.deleteConfirm}</p>
          <p className="mt-2 font-mono text-xs text-[var(--color-ink)]">
            {table.name} · rowid {deleting.rowid}
          </p>
        </ActionDialog>
      )}
    </section>
  );
}
