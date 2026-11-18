import { adminRequest, AdminAPIError } from './admin';
export { adminRequest } from './admin';

export type StatisticsRange = '24h' | '7d' | '30d';
export type HourBucket = { hour: string; incoming: number; outgoing: number; send_errors: number; accounts: { instance_id: string; incoming: number; outgoing: number }[]; commands: { plugin_id: string; route_id: string; command_name: string; result: 'ok' | 'error' | 'denied'; count: number; duration_ms: number }[] };
export type Statistics = { timezone: string; observed_since: string; buckets: HourBucket[] };
export type SeenUser = { user: string; display_name: string; first_seen_at: string; last_seen_at: string };
export type StoreEntry = { repo: string; role: string; tags: string[]; id: string; name: string; description?: string; version: string; author?: string; stars?: number; icon_url?: string };
export type StorePage = { source: string; fetched_at: string; stale: boolean; error?: string; items: StoreEntry[]; total: number };
export type LatestRelease = { repo: string; version: string; release_url: string; markdown: string; fetched_at: string; stale: boolean; error?: string };
const root = '/plugins/alonabot-webui-admin';
export function getStatistics(range: StatisticsRange): Promise<Statistics> { return adminRequest(`${root}/stats?${new URLSearchParams({ range })}`); }
export function listSeenUsers(): Promise<SeenUser[]> { return adminRequest(`${root}/users`); }
export function getStore(input: { source: string; role: string; q: string; offset: number; limit: number }): Promise<StorePage> { return adminRequest(`${root}/store?${new URLSearchParams({ ...input, offset: String(input.offset), limit: String(input.limit) })}`); }
export async function getLatestRelease(repo: string): Promise<LatestRelease | null> {
  try { return await adminRequest<LatestRelease>(`${root}/updates?${new URLSearchParams({ repo })}`); }
  catch (error) { if (error instanceof AdminAPIError && error.status === 404 && error.code === 'NO_RELEASE') return null; throw error; }
}
export function getSeenVersion(component: string): Promise<{ version: string | null }> { return adminRequest(`${root}/changelog/seen?${new URLSearchParams({ component })}`); }
export function setSeenVersion(component: string, version: string): Promise<void> { return adminRequest(`${root}/changelog/seen`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ component, version }) }); }
