import type { SeenUser } from '../api/webui';
import { listSeenUsers } from '../api/webui';
import { getCoreAdmins, getCoreDenies } from '../api/admin';
export async function loadUsers() {
  const [seen, admins, denies] = await Promise.all([listSeenUsers(), getCoreAdmins(), getCoreDenies()]);
  return mergeUsers(seen, admins, denies.users);
}
export function mergeUsers(seen: SeenUser[], admins: string[], denied: string[]) {
  const users = new Map(seen.map(user => [user.user, user]));
  for (const user of [...admins, ...denied]) if (!users.has(user)) users.set(user, { user, display_name: '', first_seen_at: '', last_seen_at: '' });
  return [...users.values()].map(user => ({ ...user, admin: admins.includes(user.user), denied: denied.includes(user.user), adapter: user.user.split(':')[0] })).sort((a, b) => a.user.localeCompare(b.user));
}
