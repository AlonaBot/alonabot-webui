import type { HourBucket } from '../api/webui';
import { adminRequest, type Package } from '../api/admin';
export type LogRecord = { time: string; level: string; source: string; message: string };
export function groupStatistics(buckets: HourBucket[], packages: Package[]) {
  const accounts = new Map<string, number>();
  const commands = new Map<string, number>();
  const pluginIDs = new Set(packages.filter(pkg => pkg.Role === 'plugin').map(pkg => pkg.ID));
  for (const bucket of buckets) {
    for (const account of bucket.accounts) accounts.set(account.instance_id, (accounts.get(account.instance_id) ?? 0) + account.incoming + account.outgoing);
    for (const command of bucket.commands) if (pluginIDs.has(command.plugin_id)) commands.set(command.plugin_id, (commands.get(command.plugin_id) ?? 0) + command.count);
  }
  return { accounts: [...accounts].sort((a, b) => b[1] - a[1]), commands: [...commands].sort((a, b) => b[1] - a[1]) };
}
export async function rangeLogs(buckets: HourBucket[]): Promise<LogRecord[]> {
  if (!buckets.length) return [];
  const from = new Date(buckets[0].hour);
  const end = new Date(buckets[buckets.length - 1].hour).getTime() + 3600000;
  const dates = [...new Set(buckets.map(bucket => bucket.hour.slice(0, 10)))];
  const rows = await Promise.all(dates.map(date => adminRequest<LogRecord[]>(`/api/v1/logs/history?${new URLSearchParams({ date, level: 'warn' })}`)));
  return rows.flat().filter(record => new Date(record.time).getTime() >= from.getTime() && new Date(record.time).getTime() < end);
}
