/** FieldType 列出 config_schema.json 支持的控件类型。 */
export type FieldType = 'string' | 'text' | 'int' | 'float' | 'bool' | 'object' | 'list' | 'dict' | 'template' | 'template_list';

/** OptionsFrom 描述配置字段的可搜索选项来源与过滤器。 */
export type OptionsFrom = {
  source: string;
  filter?: Record<string, string>;
};

/** ExampleSegment 描述回复示例中的纯文字片段或图片片段。 */
export type ExampleSegment = { text: string } | { image: string; alt?: string };

/** ReplyExample 描述配置字段的触发词与回复示例及展示条件。 */
export type ReplyExample = {
  input: string;
  reply: string | ExampleSegment[];
  condition?: Record<string, unknown>;
};

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
  optionsFrom?: OptionsFrom;
  examples?: ReplyExample[];
  profile: boolean;
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

const commonKeys = ['type', 'description', 'hint', 'obvious_hint', 'invisible', 'condition', 'example', 'profile'];
const typeKeys: Record<FieldType, string[]> = {
  string: ['default', 'required', 'secret', 'options', 'labels', 'editor_mode', 'editor_language', 'options_from'],
  text: ['default', 'required', 'secret', 'editor_mode', 'editor_language'],
  int: ['default', 'slider'],
  float: ['default', 'slider'],
  bool: ['default'],
  object: ['items'],
  list: ['default', 'required', 'items', 'options', 'labels', 'options_from'],
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

function parseExampleSegment(value: unknown, path: string[]): ExampleSegment {
  const obj = record(value, path);
  const hasText = Object.hasOwn(obj, 'text');
  const hasImage = Object.hasOwn(obj, 'image');
  if ((hasText && hasImage) || (!hasText && !hasImage)) {
    fail(path, 'example segment must have exactly text or image');
  }
  if (hasText) {
    knownKeys(obj, ['text'], path);
    if (typeof obj.text !== 'string') fail([...path, 'text'], 'expected a string');
    return { text: obj.text };
  }
  knownKeys(obj, ['image', 'alt'], path);
  if (typeof obj.image !== 'string') fail([...path, 'image'], 'expected a string');
  if (!obj.image.startsWith('examples/') || obj.image.split('/').some(part => !part || part === '.' || part === '..') || /[\\:\x00]/.test(obj.image) || !/\.(png|jpg|jpeg|webp|gif)$/.test(obj.image)) fail([...path, 'image'], 'expected a canonical examples/ image path');
  const alt = text(obj, 'alt', path);
  return { image: obj.image, ...(alt !== undefined ? { alt } : {}) };
}

function parseSingleExample(value: unknown, path: string[]): ReplyExample {
  const obj = record(value, path);
  knownKeys(obj, ['input', 'reply', 'condition'], path);
  const input = text(obj, 'input', path);
  if (input === undefined) fail([...path, 'input'], 'expected input string');
  if (!Object.hasOwn(obj, 'reply')) fail([...path, 'reply'], 'expected reply');
  let reply: string | ExampleSegment[];
  if (typeof obj.reply === 'string') {
    reply = obj.reply;
  } else if (Array.isArray(obj.reply)) {
    reply = obj.reply.map((seg, idx) => parseExampleSegment(seg, [...path, 'reply', String(idx)]));
  } else {
    fail([...path, 'reply'], 'expected string or array of segments');
  }
  let condition: Record<string, unknown> | undefined;
  if (Object.hasOwn(obj, 'condition')) {
    condition = record(obj.condition, [...path, 'condition']);
  }
  return { input, reply, ...(condition ? { condition } : {}) };
}

function parseExamples(value: unknown, path: string[]): ReplyExample[] {
  if (Array.isArray(value)) {
    return value.map((item, idx) => parseSingleExample(item, [...path, String(idx)]));
  }
  return [parseSingleExample(value, path)];
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
    profile: flag(raw, 'profile', path),
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
  if (Object.hasOwn(raw, 'options_from')) {
    const optPath = [...path, 'options_from'];
    const optObj = record(raw.options_from, optPath);
    knownKeys(optObj, ['source', 'filter'], optPath);
    const source = text(optObj, 'source', optPath);
    if (!source) fail([...optPath, 'source'], 'expected a non-empty source string');
    const builtin: Record<string, string[]> = { 'core.chats': ['chat_type', 'adapter_id'], 'core.adapter_instances': ['adapter_id'] };
    const [component, service, extra] = source.split('/');
    const validComponent = component === '@agent' || (/^[a-z][a-z0-9_-]{0,63}$/.test(component) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(component) && (!component.startsWith('alonabot-plugin-') || /^alonabot-plugin-[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(component)));
    if (!Object.hasOwn(builtin, source) && !(validComponent && service && /^[a-z][a-z0-9_.]{0,63}$/.test(service) && extra === undefined)) fail([...optPath, 'source'], 'expected a known Core source or component_id/service_name');
    let filter: Record<string, string> | undefined;
    if (Object.hasOwn(optObj, 'filter')) {
      const filterPath = [...optPath, 'filter'];
      const rawFilter = record(optObj.filter, filterPath);
      filter = {};
      for (const [k, v] of Object.entries(rawFilter)) {
        if (typeof v !== 'string') fail([...filterPath, k], 'expected a string');
        if (Object.hasOwn(builtin, source) && !builtin[source].includes(k)) fail([...filterPath, k], 'unknown filter key for builtin source');
        filter[k] = v;
      }
    }
    if (field.secret) fail(path, 'options_from cannot be combined with secret');
    if (field.options || field.labels) fail(path, 'options_from cannot be combined with options or labels');
    if (type === 'list' && Object.hasOwn(raw, 'items')) fail(path, 'options_from cannot be combined with items');
    field.optionsFrom = { source, ...(filter ? { filter } : {}) };
  }
  if (field.profile && field.secret) {
    fail(path, 'profile cannot be combined with secret');
  }
  if (Object.hasOwn(raw, 'example')) {
    field.examples = parseExamples(raw.example, [...path, 'example']);
  }
  return field;
}

function parseFields(schema: unknown, path: string[]): Field[] {
  const raw = record(schema, path);
  const fields = Object.entries(raw).map(([key, value]) => parseField(key, value, [...path, key]));
  for (const field of fields) {
    for (const key of Object.keys(field.condition ?? {})) {
      if (!fields.some(sibling => sibling.key === key)) {
        fail([...field.schemaPath, 'condition', key], 'unknown sibling field');
      }
    }
  }
  return fields;
}

function checkDeclarations(fields: Field[], raw: Record<string, unknown>, root: Field[], allowed = true, ancestor = false): void {
  function reference(path: string): Field | undefined {
    const parts = path.split('.');
    let children = root;
    for (let index = 0; index < parts.length; index++) {
      const field = children.find(entry => entry.key === parts[index]);
      if (!field || field.secret) return undefined;
      if (index === parts.length - 1) return ['string', 'text', 'int', 'float', 'bool'].includes(field.type) ? field : undefined;
      if (field.type === 'object') children = field.children!;
      else if (field.type === 'template') {
        if (parts[index + 1] === '$key' && index + 2 === parts.length) return { ...field, type: 'string', options: undefined };
        const template = field.templates!.find(entry => entry.key === parts[++index]);
        if (!template) return undefined;
        children = template.children;
      } else return undefined;
    }
    return undefined;
  }
  function checkText(value: string, path: string[]) {
    for (let index = 0; index < value.length; index++) {
      if (value[index] !== '{' && value[index] !== '}') continue;
      if (value[index + 1] === value[index]) { index++; continue; }
      const end = value.indexOf('}', index + 1);
      if (value[index] === '}' || end < 0) fail(path, 'unescaped or unmatched example brace');
      if (!reference(value.slice(index + 1, end))) fail(path, 'example placeholder must reference a non-secret scalar field or template.$key');
      index = end;
    }
  }
  for (const field of fields) {
    const source = raw[field.key] as Record<string, unknown>;
    const declared = Object.hasOwn(source, 'profile');
    if (declared && (!allowed || field.secret || ancestor)) fail([...field.schemaPath, 'profile'], 'profile requires a non-secret top-level field or object child without a marked ancestor');
    if (field.children) checkDeclarations(field.children, source.items as Record<string, unknown>, root, allowed && field.type === 'object', ancestor || declared);
    for (const template of field.templates ?? []) {
      const templates = source.templates as Record<string, Record<string, unknown>>;
      checkDeclarations(template.children, templates[template.key].items as Record<string, unknown>, root, false, ancestor || declared);
    }
    for (const [index, example] of (field.examples ?? []).entries()) {
      const path = [...field.schemaPath, 'example', String(index)];
      checkText(example.input, [...path, 'input']);
      if (typeof example.reply === 'string') checkText(example.reply, [...path, 'reply']);
      else for (const segment of example.reply) if ('text' in segment) checkText(segment.text, [...path, 'reply']);
      for (const [key, value] of Object.entries(example.condition ?? {})) {
        const target = reference(key);
        if (!target) fail([...path, 'condition', key], 'expected a non-secret scalar field or template.$key');
        const valid = target.type === 'bool' ? typeof value === 'boolean' : target.type === 'int' ? Number.isInteger(value) : target.type === 'float' ? typeof value === 'number' && Number.isFinite(value) : typeof value === 'string';
        if (!valid) fail([...path, 'condition', key], 'expected the referenced scalar type');
      }
    }
  }
}

/** fieldsFromSchema 按 JSON 键顺序解析字段，未知类型与描述键携带路径抛错。 */
export function fieldsFromSchema(schema: unknown): Field[] {
  const fields = parseFields(schema, []);
  checkDeclarations(fields, schema as Record<string, unknown>, fields);
  return fields;
}
