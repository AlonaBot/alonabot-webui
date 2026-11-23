import type { Field } from '../../schema/model';
import { isSecretMask } from '../../schema/patch';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function redactRecord(value: unknown, fields: Field[]): unknown {
  if (!isRecord(value)) return value;
  const result = { ...value };
  for (const field of fields) {
    const present = Object.hasOwn(value, field.key);
    if (!present && !field.secret) continue;
    const entry = present ? value[field.key] : undefined;
    Object.defineProperty(result, field.key, { value: redactField(entry, field), enumerable: true, configurable: true });
  }
  return result;
}

function redactField(value: unknown, field: Field): unknown {
  if (field.secret) return { $secret_set: isSecretMask(value) ? value.$secret_set : typeof value === 'string' && value.length > 0 };
  const redactTemplate = (entry: unknown) => {
    if (!isRecord(entry)) return entry;
    return Object.fromEntries(Object.entries(entry).map(([key, item]) => {
      const template = field.templates!.find(candidate => candidate.key === key);
      return [key, template ? redactRecord(item, template.children) : item];
    }));
  };
  switch (field.type) {
    case 'object': return redactRecord(value, field.children!);
    case 'list': return Array.isArray(value) && field.children ? value.map(item => redactRecord(item, field.children!)) : value;
    case 'template': return redactTemplate(value);
    case 'template_list': return Array.isArray(value) ? value.map(redactTemplate) : value;
    default: return value;
  }
}

/** 按实例 Schema 脱敏，包括刚输入的值和缺省的 secret 字段。 */
export function redactInstanceDraft(draft: Record<string, unknown>, fields: Field[]): Record<string, unknown> {
  return redactRecord(draft, fields) as Record<string, unknown>;
}

/** 在进入控件前检查页面补丁的已知字段形状，完整配置仍由 Core 校验。 */
export function invalidInstancePatchField(patch: Record<string, unknown>, fields: Field[]): string | undefined {
  function matchesRecord(value: unknown, children: Field[]): boolean {
    return isRecord(value) && invalidInstancePatchField(value, children) === undefined;
  }
  function matches(value: unknown, field: Field): boolean {
    const template = (entry: unknown, merging: boolean) => isRecord(entry) && Object.entries(entry).every(([key, item]) => {
      const candidate = field.templates!.find(variant => variant.key === key);
      return !candidate || (merging && item === null) || matchesRecord(item, candidate.children);
    });
    switch (field.type) {
      case 'object': return matchesRecord(value, field.children!);
      case 'list': return Array.isArray(value) && value.every(item => field.children ? matchesRecord(item, field.children) : typeof item === 'string');
      case 'dict': return isRecord(value);
      case 'template': return template(value, true);
      case 'template_list': return Array.isArray(value) && value.every(item => template(item, false));
      case 'string': case 'text': return typeof value === 'string';
      case 'int': case 'float': return typeof value === 'number';
      case 'bool': return typeof value === 'boolean';
    }
  }
  return fields.find(field => Object.hasOwn(patch, field.key) && patch[field.key] !== null && !matches(patch[field.key], field))?.key;
}

/** 更新实例时省略原凭证的占位，Core 会保留省略的凭证。 */
export function withoutSecretMarkers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSecretMarkers);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => !isSecretMask(entry)).map(([key, entry]) => [key, withoutSecretMarkers(entry)]));
}
