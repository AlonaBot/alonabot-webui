// 配置文件及其插件、平台与工具设置。
import { jsonBody, request } from './client';

export type Profile = { id: string; name: string; color: string; sessions: number };

export type ProfileAssignments = {
  instances: Record<string, string>;
  sessions: { instance: string; session: string; profile: string }[];
};

/** listProfiles 读取配置文件选择项。 */
export function listProfiles(): Promise<Profile[]> {
  return request<Profile[]>('/api/v1/profiles');
}

/** getProfileAssignments 读取实例缺省与会话单独指定的配置文件。 */
export function getProfileAssignments(): Promise<ProfileAssignments> {
  return request<ProfileAssignments>('/api/v1/profiles/assignments');
}

/** assignInstanceProfile 保存已创建实例的配置文件指定。 */
export async function assignInstanceProfile(instanceID: string, profile: string | null): Promise<void> {
  await request('/api/v1/profiles/assignments/instances/' + encodeURIComponent(instanceID), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile }),
  });
}

/** createProfile 创建配置文件，可选 copy_from 来源。 */
export function createProfile(input: { name: string; color: string; copy_from?: string }): Promise<{ id: string }> {
  return request<{ id: string }>('/api/v1/profiles', jsonBody(input));
}

/** updateProfile 更新指定配置文件的名称与颜色。 */
export async function updateProfile(id: string, input: { name?: string; color?: string }): Promise<void> {
  await request(`/api/v1/profiles/${encodeURIComponent(id)}`, jsonBody(input, 'PATCH'));
}

/** deleteProfile 删除指定配置文件（default 默认不允许删除）。 */
export async function deleteProfile(id: string): Promise<void> {
  await request(`/api/v1/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** assignSessionProfile 保存指定会话的配置文件指定，profile 为 null 取消指定。 */
export async function assignSessionProfile(input: { instance: string; session: string; profile: string | null }): Promise<void> {
  await request('/api/v1/profiles/assignments/sessions', jsonBody(input, 'PUT'));
}

export type ProfilePlugin = {
  plugin_id: string;
  enabled: boolean;
  fields: string[];
  overrides: Record<string, unknown>;
  invalid: { path: string; reason: string }[];
};

/** getProfilePlugins 读取指定配置文件的插件覆盖及有效字段列表。 */
export function getProfilePlugins(id: string): Promise<ProfilePlugin[]> {
  return request<ProfilePlugin[]>(`/api/v1/profiles/${encodeURIComponent(id)}/plugins`);
}

/** patchProfilePlugin 修改指定配置文件的插件开关与字段覆盖。 */
export async function patchProfilePlugin(
  id: string,
  pluginID: string,
  patch: { enabled?: boolean; overrides?: Record<string, unknown> },
): Promise<void> {
  await request(`/api/v1/profiles/${encodeURIComponent(id)}/plugins/${encodeURIComponent(pluginID)}`, jsonBody(patch, 'PATCH'));
}

/** pruneProfilePlugin 清理指定配置文件的插件无效覆盖。 */
export function pruneProfilePlugin(id: string, pluginID: string): Promise<{ removed: string[] }> {
  return request<{ removed: string[] }>(
    `/api/v1/profiles/${encodeURIComponent(id)}/plugins/${encodeURIComponent(pluginID)}/prune`,
    { method: 'POST' },
  );
}

export type ProfilePlatform = {
  command_prefixes: string[] | null;
  reply: {
    mention_sender: boolean | null;
    quote: boolean | null;
    prefix: string | null;
    forward_threshold: number | null;
  };
};

/** getProfilePlatform 读取指定配置文件的平台与消息设置。 */
export function getProfilePlatform(id: string): Promise<ProfilePlatform> {
  return request<ProfilePlatform>(`/api/v1/profiles/${encodeURIComponent(id)}/platform`);
}

/** putProfilePlatform 整体替换指定配置文件的平台与消息设置。 */
export async function putProfilePlatform(id: string, platform: ProfilePlatform): Promise<void> {
  await request(`/api/v1/profiles/${encodeURIComponent(id)}/platform`, jsonBody(platform, 'PUT'));
}

export type ProfileToolPolicy =
  | { tool: string; operation?: never; policy: 'allow' | 'confirm' | 'deny' | 'inherit' }
  | { operation: { plugin_id: string; name: string }; tool?: never; policy: 'allow' | 'confirm' | 'deny' | 'inherit' };

/** getProfileTools 读取指定配置文件覆盖的工具策略。 */
export function getProfileTools(id: string): Promise<{ items: ProfileToolPolicy[] }> {
  return request<{ items: ProfileToolPolicy[] }>(`/api/v1/profiles/${encodeURIComponent(id)}/tools`);
}

/** putProfileTools 更新指定配置文件的工具策略覆盖项。 */
export async function putProfileTools(id: string, items: ProfileToolPolicy[]): Promise<void> {
  await request(`/api/v1/profiles/${encodeURIComponent(id)}/tools`, jsonBody({ items }, 'PUT'));
}
