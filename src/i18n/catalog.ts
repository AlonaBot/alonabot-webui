import type { Field, Template } from '../schema/model';

const sourceLocale = 'en-US';

/** pickLocale 按浏览器偏好依次进行精确匹配与确定性的主语言回退。 */
export function pickLocale(available: string[], preferred: readonly string[]): string {
  const sorted = [...available].sort();
  for (const preference of preferred) {
    const tag = preference.toLowerCase();
    const exact = sorted.find(locale => locale.toLowerCase() === tag);
    if (exact) return exact;
    const language = tag.split('-')[0];
    const primary = sorted.find(locale => locale.toLowerCase().split('-')[0] === language);
    if (primary) return primary;
  }
  return sourceLocale;
}

function overrides(locale: Record<string, unknown>, path: string[]): Record<string, unknown> {
  let current: unknown = locale.config;
  for (const key of path) {
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, key)) return {};
    current = (current as Record<string, unknown>)[key];
  }
  if (current === null || typeof current !== 'object' || Array.isArray(current)) return {};
  return current as Record<string, unknown>;
}

/** fieldText 沿 schemaPath 读取当前语言覆盖，再回退源文案与字段键。 */
export function fieldText(locale: Record<string, unknown>, field: Field): { description: string; hint?: string; labels?: string[] } {
  const translated = overrides(locale, field.schemaPath);
  return {
    description: (translated.description as string | undefined) ?? field.description ?? field.key,
    hint: (translated.hint as string | undefined) ?? field.hint,
    labels: (translated.labels as string[] | undefined) ?? field.labels,
  };
}

/** templateText 沿模板路径读取当前语言覆盖，再回退源文案与模板键。 */
export function templateText(locale: Record<string, unknown>, template: Template): { name: string; hint?: string } {
  const translated = overrides(locale, template.schemaPath);
  return {
    name: (translated.name as string | undefined) ?? template.name ?? template.key,
    hint: (translated.hint as string | undefined) ?? template.hint,
  };
}
