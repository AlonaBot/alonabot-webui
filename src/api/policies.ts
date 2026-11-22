// 命令与工具调用策略、管理员与禁止名单。
import { request } from './client';

export type CommandScope = { kind: 'plugin' } | { kind: 'group'; group: string[] } | { kind: 'route'; route_id: string };

export type CommandOverride = { scope: CommandScope; permissions: string[] | null; enabled: boolean | null };

export type InvalidCommandName = { route_id: string; name: string[] | null; reason: 'declared' | 'unregistered' };

export type CommandPolicy = {
  route_id: string;
  descriptions?: Record<string, string>;
  enabled: boolean;
  permissions: string[] | null;
  declared_names: string[][];
  effective_names: string[][];
  has_names_override: boolean;
  invalid_names: InvalidCommandName[];
};

export type CommandReference = { plugin_id: string; route_id: string };

export type PluginPolicies = {
  default_locale?: string;
  overrides: CommandOverride[];
  commands: CommandPolicy[];
  shadows: { path: string[]; winner: CommandReference; shadowed: CommandReference[] }[];
  invalid_names: InvalidCommandName[];
};

export type ToolPolicyValue = 'allow' | 'confirm' | 'deny' | 'inherit';

export type ToolPolicy = {
  plugin_id: string;
  service: string;
  identities: ('tool' | 'operation')[];
  default: ToolPolicyValue;
  override: ToolPolicyValue;
  effect: 'read_only' | 'write' | 'destructive' | 'unspecified';
};

export type ToolPolicyUpdate = { plugin_id: string; service: string; policy: ToolPolicyValue };

export type AllowedInstances = { all: boolean; instances: string[] };

// ----------------------------------------------------------------------------
// 命令权限与名称 API
// ----------------------------------------------------------------------------

export async function getPluginPolicies(id: string): Promise<PluginPolicies> {
  return request<PluginPolicies>(`/api/v1/plugins/${encodeURIComponent(id)}/policies`);
}

export async function setPluginPolicy(id: string, override: CommandOverride): Promise<void> {
  await request<void>(`/api/v1/plugins/${encodeURIComponent(id)}/policies`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(override),
  });
}

export async function setCommandNames(id: string, routeID: string, names: string[][]): Promise<void> {
  await request<void>(
    `/api/v1/plugins/${encodeURIComponent(id)}/commands/${encodeURIComponent(routeID)}/names`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names }),
    },
  );
}

export async function resetCommandNames(id: string, routeID: string): Promise<void> {
  await request<void>(
    `/api/v1/plugins/${encodeURIComponent(id)}/commands/${encodeURIComponent(routeID)}/names`,
    {
      method: 'DELETE',
    },
  );
}

// ----------------------------------------------------------------------------
// 工具、发信许可、会话与静态任务 API
// ----------------------------------------------------------------------------

export async function getToolPolicies(): Promise<{ policies: ToolPolicy[] }> {
  return request<{ policies: ToolPolicy[] }>('/api/v1/tools/policies');
}

export async function setToolPolicy(item: ToolPolicyUpdate): Promise<void> {
  await request<void>('/api/v1/tools/policies', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
}

export async function setToolPolicies(items: ToolPolicyUpdate[]): Promise<void> {
  await request<void>('/api/v1/tools/policies', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
}

export async function getAllowedInstances(id: string): Promise<AllowedInstances> {
  return request<AllowedInstances>(`/api/v1/plugins/${encodeURIComponent(id)}/allowed-instances`);
}

export async function setAllowedInstances(id: string, value: AllowedInstances): Promise<void> {
  await request<void>(`/api/v1/plugins/${encodeURIComponent(id)}/allowed-instances`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
}

// ----------------------------------------------------------------------------
// Core 设置与管理认证 API
// ----------------------------------------------------------------------------

export async function getCoreAdmins(): Promise<string[]> {
  return request<string[]>('/api/v1/admins');
}

export async function changeCoreAdmin(action: 'add' | 'remove', user: string): Promise<void> {
  await request<void>(`/api/v1/admins/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user }),
  });
}

export async function getCoreDenies(): Promise<{ users: string[]; chats: string[] }> {
  return request<{ users: string[]; chats: string[] }>('/api/v1/core/denies');
}

export async function setCoreDenies(value: { users: string[]; chats: string[] }): Promise<void> {
  await request<void>('/api/v1/core/denies', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
}
