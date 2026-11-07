/** FieldType 列出 config_schema.json 支持的控件类型。 */
export type FieldType = 'string' | 'text' | 'int' | 'float' | 'bool' | 'object' | 'list' | 'dict' | 'template' | 'template_list';

/** Field 保留字段顺序、源文案与 schema 路径，供表单和补丁共同使用。 */
export type Field = {
  key: string;
  schemaPath: string[];
  type: FieldType;
  description?: string;
  hint?: string;
  obviousHint: boolean;
  invisible: boolean;
  secret: boolean;
  required: boolean;
  defaultValue?: unknown;
  options?: string[];
  labels?: string[];
  editorMode: boolean;
  editorLanguage: string;
  slider?: { min: number; max: number; step?: number };
  condition?: Record<string, unknown>;
  children?: Field[];
  templates?: Template[];
};

/** Template 保留模板元数据与 items 中的字段。 */
export type Template = {
  key: string;
  schemaPath: string[];
  name?: string;
  hint?: string;
  displayItem?: string;
  hideHintInList: boolean;
  children: Field[];
};

const commonKeys = ['type', 'description', 'hint', 'obvious_hint', 'invisible', 'condition'];
const typeKeys: Record<FieldType, string[]> = {
  string: ['default', 'required', 'secret', 'options', 'labels', 'editor_mode', 'editor_language'],
  text: ['default', 'required', 'secret', 'editor_mode', 'editor_language'],
  int: ['default', 'slider'],
  float: ['default', 'slider'],
  bool: ['default'],
  object: ['items'],
  list: ['default', 'required', 'items', 'options', 'labels'],
  dict: ['default', 'required'],
  template: ['default', 'required', 'templates'],
  template_list: ['default', 'required', 'templates'],
};
const templateKeys = ['name', 'hint', 'items', 'display_item', 'hide_hint_in_list'];
const schemaKey = /^[A-Za-z0-9_-]+$/;

function fail(path: string[], message: string): never {
  throw new Error(`${path.join('.') || '$'}: ${message}`);
}

function record(value: unknown, path: string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object');
  return value as Record<string, unknown>;
}

function knownKeys(value: Record<string, unknown>, keys: string[], path: string[]) {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) fail([...path, key], 'unsupported schema key');
  }
}

function text(value: Record<string, unknown>, key: string, path: string[]): string | undefined {
  if (!Object.hasOwn(value, key)) return undefined;
  if (typeof value[key] !== 'string') fail([...path, key], 'expected a string');
  return value[key];
}

function flag(value: Record<string, unknown>, key: string, path: string[]): boolean {
  if (!Object.hasOwn(value, key)) return false;
  if (typeof value[key] !== 'boolean') fail([...path, key], 'expected a boolean');
  return value[key];
}

function strings(value: Record<string, unknown>, key: string, path: string[]): string[] | undefined {
  if (!Object.hasOwn(value, key)) return undefined;
  const values = value[key];
  if (!Array.isArray(values) || !values.every(entry => typeof entry === 'string')) {
    fail([...path, key], 'expected an array of strings');
  }
  return values;
}

function parseTemplate(key: string, value: unknown, path: string[]): Template {
  if (!schemaKey.test(key)) fail(path, 'invalid template key');
  const raw = record(value, path);
  knownKeys(raw, templateKeys, path);
  const template: Template = {
    key, schemaPath: path,
    name: text(raw, 'name', path), hint: text(raw, 'hint', path),
    displayItem: text(raw, 'display_item', path),
    hideHintInList: flag(raw, 'hide_hint_in_list', path),
    children: parseFields(raw.items, [...path, 'items']),
  };
  if (template.displayItem !== undefined) {
    let children = template.children;
    const parts = template.displayItem.split('.');
    for (const [index, part] of parts.entries()) {
      const field = children.find(child => child.key === part);
      if (!field || (index === parts.length - 1 ? field.type !== 'string' : field.type !== 'object')) {
        fail([...path, 'display_item'], 'expected a path to a string field');
      }
      children = field.children ?? [];
    }
  }
  return template;
}

function parseField(key: string, value: unknown, path: string[]): Field {
  if (!schemaKey.test(key)) fail(path, 'invalid field key');
  const raw = record(value, path);
  if (typeof raw.type !== 'string' || !Object.hasOwn(typeKeys, raw.type)) fail([...path, 'type'], 'unsupported field type');
  const type = raw.type as FieldType;
  knownKeys(raw, [...commonKeys, ...typeKeys[type]], path);
  const field: Field = {
    key, schemaPath: path, type,
    description: text(raw, 'description', path), hint: text(raw, 'hint', path),
    obviousHint: flag(raw, 'obvious_hint', path), invisible: flag(raw, 'invisible', path),
    secret: flag(raw, 'secret', path), required: flag(raw, 'required', path),
    editorMode: flag(raw, 'editor_mode', path),
    editorLanguage: text(raw, 'editor_language', path) ?? 'json',
    options: strings(raw, 'options', path), labels: strings(raw, 'labels', path),
  };
  if (Object.hasOwn(raw, 'default')) field.defaultValue = raw.default;
  if (field.secret && (Object.hasOwn(raw, 'default') || Object.hasOwn(raw, 'options'))) {
    fail(path, 'secret fields cannot have default or options');
  }
  if (field.labels && (!field.options || field.labels.length > field.options.length)) {
    fail([...path, 'labels'], 'labels require corresponding options');
  }
  if (type === 'object' || Object.hasOwn(raw, 'items')) {
    field.children = parseFields(raw.items, [...path, 'items']);
    if (field.options || field.labels) fail(path, 'items cannot be combined with options or labels');
  }
  if (type === 'template' || type === 'template_list') {
    field.templates = Object.entries(record(raw.templates, [...path, 'templates']))
      .map(([name, template]) => parseTemplate(name, template, [...path, 'templates', name]));
  }
  if (Object.hasOwn(raw, 'condition')) field.condition = record(raw.condition, [...path, 'condition']);
  if (Object.hasOwn(raw, 'slider')) {
    const sliderPath = [...path, 'slider'];
    const slider = record(raw.slider, sliderPath);
    knownKeys(slider, ['min', 'max', 'step'], sliderPath);
    const { min, max, step } = slider;
    if (typeof min !== 'number' || !Number.isFinite(min) || typeof max !== 'number' || !Number.isFinite(max) || min >= max) {
      fail(sliderPath, 'expected finite min < max');
    }
    if (step !== undefined && (typeof step !== 'number' || !Number.isFinite(step) || step <= 0)) {
      fail([...sliderPath, 'step'], 'expected a positive finite number');
    }
    field.slider = { min, max, ...(step === undefined ? {} : { step: step as number }) };
  }
  return field;
}

function parseFields(schema: unknown, path: string[]): Field[] {
  const raw = record(schema, path);
  // 顶层版本与迁移由 SDK 消费，表单顺序只包含配置字段。
  const fields = Object.entries(raw)
    .filter(([key]) => path.length !== 0 || (key !== '$version' && key !== '$migrations'))
    .map(([key, value]) => parseField(key, value, [...path, key]));
  for (const field of fields) {
    for (const key of Object.keys(field.condition ?? {})) {
      if (!fields.some(sibling => sibling.key === key)) {
        fail([...field.schemaPath, 'condition', key], 'unknown sibling field');
      }
    }
  }
  return fields;
}

/** fieldsFromSchema 按 JSON 键顺序解析字段，未知类型与描述键携带路径抛错。 */
export function fieldsFromSchema(schema: unknown): Field[] {
  return parseFields(schema, []);
}
