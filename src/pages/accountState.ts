import type { Chat, ProfileAssignments } from '../api/admin';

/** accountChats 只使用聊天目录实际记录的账号归属，保留最近活跃顺序。 */
export function accountChats(chats: Chat[], instanceID: string): Chat[] {
  return chats.filter(chat => chat.instance_id === instanceID);
}

/** chatProfile 按会话指定、实例缺省、默认配置文件的顺序解析。 */
export function chatProfile(assignments: ProfileAssignments, instanceID: string, session: string): string {
  return assignments.sessions.find(item => item.instance === instanceID && item.session === session)?.profile
    ?? (Object.hasOwn(assignments.instances, instanceID) ? assignments.instances[instanceID] : 'default');
}
