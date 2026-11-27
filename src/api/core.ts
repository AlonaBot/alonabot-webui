// Core 信息、更新说明与全局设置。
import { jsonBody, request } from './client';
import type { ConfigDiagnostics } from './config';

export type CoreInfo = {
  version: string;
  listen: string;
  admin_api_major: number;
  started_at?: string;
};

// ----------------------------------------------------------------------------
// Core 与组件管理 API
// ----------------------------------------------------------------------------

/** 获取 Core 基本信息（版本、监听地址、Admin API 主版本号）。 */
export async function getCore(): Promise<CoreInfo> {
  return request<CoreInfo>('/api/v1/core');
}

export type Changelog = { locale: string; entries: { version: string; date?: string; markdown: string }[] };

export function getCoreChangelog(locale: string): Promise<Changelog> { return request('/api/v1/core/changelog', { headers: { 'Accept-Language': locale } }); }

export async function getCoreConfigDiagnostics(): Promise<ConfigDiagnostics> {
  return request<ConfigDiagnostics>('/api/v1/core/settings/corrections');
}

export async function pruneCoreConfig(): Promise<void> {
  await request<void>('/api/v1/core/settings/prune', {
    method: 'POST',
  });
}

export async function getDefaultLocale(): Promise<{ default_locale: string }> {
  return request<{ default_locale: string }>('/api/v1/core/default-locale');
}

export async function setDefaultLocale(locale: string): Promise<void> {
  await request<void>('/api/v1/core/default-locale', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ default_locale: locale }),
  });
}

export async function getDefaultPlatform(): Promise<{
  command_prefixes: string[];
  reply: { mention_sender: boolean; quote: boolean; prefix: string; forward_threshold: number };
}> {
  return request<{
    command_prefixes: string[];
    reply: { mention_sender: boolean; quote: boolean; prefix: string; forward_threshold: number };
  }>('/api/v1/profiles/default/platform');
}

/** CoreSleep 保存全局休眠设置与逐插件覆盖。 */
export type CoreSleep = {
  mode: 'always_on' | 'component_idle';
  idle_timeout: string;
  plugins: Record<string, string>;
};

/** getCoreSleep 只读当前全局休眠设置与插件覆盖。 */
export function getCoreSleep(): Promise<CoreSleep> {
  return request<CoreSleep>('/api/v1/core/sleep');
}

/** setCoreSleep 修改全局模式和空闲时长，保留逐插件覆盖。 */
export async function setCoreSleep(value: Pick<CoreSleep, 'mode' | 'idle_timeout'>): Promise<void> {
  await request('/api/v1/core/sleep', jsonBody({ mode: value.mode, idle_timeout: value.idle_timeout }, 'PUT'));
}

/** 网络代理与源码构建的下载来源；proxy 修改后重启 Core 生效。 */
export type DownloadSettings = { proxy: string; go_download_base: string; goproxy: string };

/** GitHub Release 元数据基址与下载前缀；API 基址决定资产摘要的信任根。 */
export type GitHubSettings = { github_api_base: string; github_download_prefix: string };

export function getGitHubSettings(): Promise<GitHubSettings> {
  return request<GitHubSettings>('/api/v1/core/github');
}

export async function setGitHubSettings(value: GitHubSettings): Promise<void> {
  await request<void>('/api/v1/core/github', jsonBody(value, 'PUT'));
}

export function getDownloadSettings(): Promise<DownloadSettings> {
  return request<DownloadSettings>('/api/v1/core/downloads');
}

/** 只更新给出的字段。 */
export async function setDownloadSettings(value: Partial<DownloadSettings>): Promise<void> {
  await request<void>('/api/v1/core/downloads', jsonBody(value, 'PUT'));
}

/** 源码构建按需下载的 Go 工具链与构建缓存占用。 */
export type BuildEnvironment = { go_version: string; toolchain_bytes: number; cache_bytes: number };

export function getBuildEnvironment(): Promise<BuildEnvironment> {
  return request<BuildEnvironment>('/api/v1/core/build-environment');
}

export async function clearBuildEnvironment(): Promise<void> {
  await request<void>('/api/v1/core/build-environment', { method: 'DELETE' });
}
