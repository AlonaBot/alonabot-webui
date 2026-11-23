// 会话列表与插件会话记录。
import { request } from './client';

export type Chat = {
  session: string;
  title: string;
  chat_type: 'private' | 'group' | 'channel';
  instance_id: string;
  last_active_at: string;
};

/** listChats 读取完整聊天目录，再按实例归组，避免把单页或 Adapter 总数当成账号会话数。 */
export async function listChats(): Promise<Chat[]> {
  const chats: Chat[] = [];
  let total: number;
  do {
    const page = await request<{ chats: Chat[]; total: number }>(`/api/v1/chats?offset=${chats.length}&limit=50`);
    chats.push(...page.chats);
    total = page.total;
  } while (chats.length < total);
  return chats;
}

export async function listPluginConversations(
  id: string,
): Promise<{ key: string; entries: number; updated_at: string }[]> {
  return request<{ key: string; entries: number; updated_at: string }[]>(
    `/api/v1/plugins/${encodeURIComponent(id)}/conversations`,
  );
}

export async function clearPluginConversation(id: string, key: string): Promise<void> {
  await request<void>(
    `/api/v1/plugins/${encodeURIComponent(id)}/conversations/${encodeURIComponent(key)}`,
    {
      method: 'DELETE',
    },
  );
}
