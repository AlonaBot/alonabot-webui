import { fieldsFromSchema, type Field } from '../schema/model';

/** fieldDottedPath 从 schemaPath 中去除 items 与 templates 结构层，生成点分字段路径。 */
export function fieldDottedPath(schemaPath: string[]): string {
  return schemaPath.filter((_, index) => index % 2 === 0).join('.');
}

/** getValueByDottedPath 获取对象中点分路径对应的值，不存在返回 undefined。 */
export function getValueByDottedPath(obj: unknown, path: string): unknown {
  if (obj === null || typeof obj !== 'object') return undefined;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) return undefined;
    if (!Object.hasOwn(current, part)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** setValueByDottedPath 在对象中设置点分路径对应的值，必要时递归补齐中间对象。 */
export function setValueByDottedPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!Object.hasOwn(current, part) || current[part] === null || typeof current[part] !== 'object' || Array.isArray(current[part])) {
      Object.defineProperty(current, part, { value: {}, writable: true, enumerable: true, configurable: true });
    }
    current = current[part] as Record<string, unknown>;
  }
  Object.defineProperty(current, parts[parts.length - 1], { value, writable: true, enumerable: true, configurable: true });
}

/** applyMergePatch 应用 RFC 7396 Merge Patch 到目标对象。 */
export function applyMergePatch(target: unknown, patch: unknown): unknown {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    return patch;
  }
  const result: Record<string, unknown> =
    target !== null && typeof target === 'object' && !Array.isArray(target)
      ? structuredClone(target as Record<string, unknown>)
      : {};
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === null) {
      delete result[key];
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      Object.defineProperty(result, key, { value: applyMergePatch(Object.hasOwn(result, key) ? result[key] : undefined, value), writable: true, enumerable: true, configurable: true });
    } else {
      Object.defineProperty(result, key, { value: structuredClone(value), writable: true, enumerable: true, configurable: true });
    }
  }
  return result;
}

/**
 * applyProfileOverrides 将有效的配置文件覆盖值应用到 Active 配置基线上。
 * invalid 中的路径排除在有效覆盖之外。
 */
export function applyProfileOverrides(
  activeConfig: Record<string, unknown>,
  overrides: Record<string, unknown>,
  invalidPaths: string[],
): Record<string, unknown> {
  const cloned = structuredClone(activeConfig);
  for (const [path, val] of Object.entries(overrides)) {
    if (invalidPaths.includes(path)) continue;
    if (val !== null) setValueByDottedPath(cloned, path, structuredClone(val));
  }
  return cloned;
}

/** 判断补丁是否影响指定的点分路径。 */
export function isPathInPatch(dotPath: string, patch: Record<string, unknown>): boolean {
  const parts = dotPath.split('.');
  let current: unknown = patch;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return false;
    if (!Object.hasOwn(current as Record<string, unknown>, part)) return false;
    current = (current as Record<string, unknown>)[part];
  }
  return true;
}

/**
 * extractProfileOverrides 从更新后的有效草稿与 patch 中，提取属于标记路径的完整覆盖值。
 * 恢复跟随默认写该路径: null；未涉及的标记路径不输出。
 */
export function extractProfileOverrides(
  nextDraft: Record<string, unknown>,
  patch: Record<string, unknown>,
  markedFields: string[],
): Record<string, unknown> {
  return Object.fromEntries(markedFields.filter(path => isPathInPatch(path, patch)).map(path => {
    const value = getValueByDottedPath(nextDraft, path);
    return [path, value === undefined ? null : structuredClone(value)];
  }));
}

function containsSecret(field: Field): boolean {
  return field.secret || (field.children ?? []).some(containsSecret) || (field.templates ?? []).some(template => template.children.some(containsSecret));
}

export function editableProfilePaths(schema: unknown, paths: string[]): string[] {
  if (schema == null) return [];
  const all: Field[] = [];
  function collect(fields: Field[]) { for (const field of fields) { all.push(field); if (field.children) collect(field.children); } }
  collect(fieldsFromSchema(schema));
  return paths.filter(path => { const field = all.find(field => fieldDottedPath(field.schemaPath) === path); return field !== undefined && !containsSecret(field); });
}
