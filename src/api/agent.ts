// 官方 Agent 的模型发现、测试与用量。
import { request } from './client';

// ----------------------------------------------------------------------------
// Agent 模型管理路由 API
// ----------------------------------------------------------------------------

export type ModelDiscoveryInput =
  | { provider: string }
  | { protocol: string; base_url: string; api_key?: string };

export type DiscoveredModel = {
  id: string;
  type: string;
};

export type ModelUsage = {
  model: string;
  input_tokens: number;
  output_tokens: number;
};

/** discoverAgentModels 调用 Agent 的 POST discover 路由发现远端可用模型。 */
export async function discoverAgentModels(
  id: string,
  input: ModelDiscoveryInput,
): Promise<{ models: DiscoveredModel[]; description?: string }> {
  return request<{ models: DiscoveredModel[]; description?: string }>(
    `/plugins/${encodeURIComponent(id)}/models/discover`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

/** testAgentModel 调用 Agent 的 POST test 路由测试 Active 模型。 */
export async function testAgentModel(
  id: string,
  model: string,
): Promise<{ ok: boolean; duration_ms: number; description?: string }> {
  return request<{ ok: boolean; duration_ms: number; description?: string }>(
    `/plugins/${encodeURIComponent(id)}/models/test`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    },
  );
}

/** getAgentModelUsage 调用 Agent 的 GET usage 路由读取当天用量记录。 */
export async function getAgentModelUsage(
  id: string,
): Promise<{ models: ModelUsage[] }> {
  return request<{ models: ModelUsage[] }>(
    `/plugins/${encodeURIComponent(id)}/models/usage`,
    {
      method: 'GET',
    },
  );
}
