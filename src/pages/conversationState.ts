import type { ProfileAssignments } from '../api/admin';

/** conversationAssignment 只匹配会话指定及其成员键，保持不透明键原文。 */
export function conversationAssignment(key: string, assignments: ProfileAssignments) {
  return assignments.sessions.find(entry => key === `${entry.session}@${entry.instance}`) ?? [...assignments.sessions].sort((a, b) => `${b.session}@${b.instance}`.length - `${a.session}@${a.instance}`.length).find(entry => {
    const base = `${entry.session}@${entry.instance}`;
    return key === base || (key.startsWith(`${base}@`) && /^[a-z][a-z0-9_]*:.+$/.test(key.slice(base.length + 1)));
  });
}
