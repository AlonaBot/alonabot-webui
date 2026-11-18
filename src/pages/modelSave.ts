import { changePackage, getPluginConfig, patchPluginConfig, type ConfigSnapshot, type PendingConfig } from '../api/admin';

/** saveModelConfig 在 PATCH 成功后立即交还脱敏快照，开发来源保存已重启，安装来源继续激活 Pending。 */
export async function saveModelConfig(
  id: string,
  snapshot: ConfigSnapshot,
  patch: Record<string, unknown>,
  onSaved: (pending: PendingConfig) => void,
): Promise<ConfigSnapshot> {
  const pending = await patchPluginConfig(id, snapshot.active_generation, patch);
  onSaved(pending);
  const saved = await getPluginConfig(id);
  if (!saved.pending) return saved;
  await changePackage('reload', id);
  return getPluginConfig(id);
}
