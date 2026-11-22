// 插件受管数据：SQLite 表、KV 与文件。
import { jsonBody, pluginPath, request } from './client';

export type SQLiteValue = string | number | boolean | null | { $base64: string };

export type DataColumn = { name: string; type: string; pk: boolean; notnull: boolean };

export type DataTable = { name: string; rows: number; writable: boolean; columns: DataColumn[] };

export type DataRow = { rowid: number | null; values: Record<string, SQLiteValue> };

export function listPluginTables(id: string, generation = ''): Promise<{ tables: DataTable[] }> {
  return request(`${pluginPath(id)}/data/tables?${new URLSearchParams({ generation })}`);
}

export function listPluginRows(id: string, table: string, input: { offset: number; limit: number; generation?: string; order?: string; desc?: boolean; where?: Record<string, string> }): Promise<{ rows: DataRow[]; total: number }> {
  const query = new URLSearchParams({ offset: String(input.offset), limit: String(input.limit), generation: input.generation ?? '' });
  if (input.order) query.set('order', input.order);
  if (input.desc) query.set('desc', '1');
  for (const [column, value] of Object.entries(input.where ?? {})) query.set(`where.${column}`, value);
  return request(`${pluginPath(id)}/data/tables/${encodeURIComponent(table)}/rows?${query}`);
}

export function insertPluginRow(id: string, table: string, values: Record<string, SQLiteValue>): Promise<{ rowid: number }> {
  return request(`${pluginPath(id)}/data/tables/${encodeURIComponent(table)}/rows`, jsonBody({ values }));
}

export function updatePluginRow(id: string, table: string, rowid: number, values: Record<string, SQLiteValue>): Promise<void> {
  return request(`${pluginPath(id)}/data/tables/${encodeURIComponent(table)}/rows/${rowid}`, jsonBody({ values }, 'PATCH'));
}

export function deletePluginRow(id: string, table: string, rowid: number): Promise<void> {
  return request(`${pluginPath(id)}/data/tables/${encodeURIComponent(table)}/rows/${rowid}`, { method: 'DELETE' });
}

export function listPluginKV(id: string, input: { prefix: string; offset: number; limit: number }): Promise<{ items: { key: string; size: number; updated_at: string }[]; total: number }> {
  return request(`${pluginPath(id)}/data/kv?${new URLSearchParams({ prefix: input.prefix, offset: String(input.offset), limit: String(input.limit) })}`);
}

export function getPluginKV(id: string, key: string): Promise<{ value_base64: string; text?: string }> { return request(`${pluginPath(id)}/data/kv/${encodeURIComponent(key)}`); }

export function setPluginKV(id: string, key: string, value: { text: string } | { value_base64: string }): Promise<void> { return request(`${pluginPath(id)}/data/kv/${encodeURIComponent(key)}`, jsonBody(value, 'PUT')); }

export function deletePluginKV(id: string, key: string): Promise<void> { return request(`${pluginPath(id)}/data/kv/${encodeURIComponent(key)}`, { method: 'DELETE' }); }

export function listPluginFiles(id: string, path: string): Promise<{ entries: { name: string; dir: boolean; size: number; modified_at: string }[] }> { return request(`${pluginPath(id)}/data/files?${new URLSearchParams({ path })}`); }

export function downloadPluginFile(id: string, path: string): Promise<Blob> { return request(`${pluginPath(id)}/data/files/content?${new URLSearchParams({ path })}`, { response: 'blob' }); }

export function uploadPluginFile(id: string, path: string, file: File, overwrite: boolean): Promise<void> { return request(`${pluginPath(id)}/data/files/content?${new URLSearchParams({ path, ...(overwrite ? { overwrite: '1' } : {}) })}`, { method: 'PUT', body: file }); }

export function makePluginDirectory(id: string, path: string): Promise<void> { return request(`${pluginPath(id)}/data/files/mkdir`, jsonBody({ path })); }

export function renamePluginFile(id: string, from: string, to: string): Promise<void> { return request(`${pluginPath(id)}/data/files/rename`, jsonBody({ from, to })); }

export function deletePluginFile(id: string, path: string, recursive: boolean): Promise<void> { return request(`${pluginPath(id)}/data/files/delete`, jsonBody({ path, recursive })); }

export function exportPluginData(id: string): Promise<Blob> { return request(`${pluginPath(id)}/data/export`, { response: 'blob' }); }

export function clearPluginData(id: string, confirm: true): Promise<void> { return request(`${pluginPath(id)}/data/clear`, jsonBody({ confirm })); }
