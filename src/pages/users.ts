import type { SeenUser } from '../api/webui';
export function mergeUsers(seen: SeenUser[], admins: string[], denied: string[]) {
  const users = new Map(seen.map(user => [user.user, user]));
  for (const user of [...admins, ...denied]) if (!users.has(user)) users.set(user, { user, display_name: '', first_seen_at: '', last_seen_at: '' });
  return [...users.values()].map(user => ({ ...user, admin: admins.includes(user.user), denied: denied.includes(user.user), adapter: user.user.split(':')[0] })).sort((a, b) => a.user.localeCompare(b.user));
}
