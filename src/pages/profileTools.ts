import type { ProfileToolPolicy, ToolPolicy } from '../api/admin';

export function profileToolKey(item: ProfileToolPolicy): string {
  return item.operation ? `operation:${item.operation.plugin_id}/${item.operation.name}` : `tool:${item.tool}`;
}

export function profileToolIdentity(item: ProfileToolPolicy): { pluginID: string; name: string; kind: 'tool' | 'operation' } {
  if (item.operation) return { pluginID: item.operation.plugin_id, name: item.operation.name, kind: 'operation' };
  const slash = item.tool.indexOf('/');
  return { pluginID: item.tool.slice(0, slash), name: item.tool.slice(slash + 1), kind: 'tool' };
}

export function profileToolCandidates(directory: ToolPolicy[], saved: ProfileToolPolicy[]): ProfileToolPolicy[] {
  const keys = new Set(saved.map(profileToolKey));
  return directory.flatMap(row => row.identities.map(kind => kind === 'tool'
    ? { tool: `${row.plugin_id}/${row.service}`, policy: 'deny' as const }
    : { operation: { plugin_id: row.plugin_id, name: row.service }, policy: 'deny' as const }))
    .filter(item => !keys.has(profileToolKey(item)));
}
