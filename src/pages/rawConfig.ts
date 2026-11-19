import { fieldsFromSchema } from '../schema/model';
import { buildPatch } from '../schema/patch';

const rawFields = fieldsFromSchema({ config: { type: 'dict' } });

/** rawConfigPatch 复用补丁的对象删除、数组替换与机密掩码规则。 */
export function rawConfigPatch(original: Record<string, unknown>, edited: unknown): Record<string, unknown> {
  if (!edited || typeof edited !== 'object' || Array.isArray(edited)) throw new Error('configuration must be an object');
  return (buildPatch({ config: original }, { config: edited }, rawFields).config ?? {}) as Record<string, unknown>;
}
