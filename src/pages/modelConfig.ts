import { AdminAPIError, type ConfigSnapshot } from '../api/admin';
import { fieldsFromSchema, type Template } from '../schema/model';
import { buildPatch } from '../schema/patch';

export const MODEL_TYPES = ['chat', 'speech_to_text', 'text_to_speech', 'embedding', 'rerank', 'decision'] as const;
export type ModelType = typeof MODEL_TYPES[number];
export type ConfiguredModel = {
  name: string;
  provider: string;
  model: string;
  type: ModelType;
  max_tokens?: number;
  image_input?: boolean;
  isPending?: boolean;
};
export type ConfiguredProvider = { name: string; protocol: string; base_url: string; api_key?: unknown };

export function providerDefaults(template: Template): Record<string, unknown> {
  return {
    ...Object.fromEntries(template.children.filter(field => Object.hasOwn(field, 'defaultValue') && !field.invisible)
      .map(field => [field.key, field.defaultValue])),
    name: template.name ?? template.key,
  };
}

export function buildUpdateModelPatch(snapshot: ConfigSnapshot, name: string, changes: Partial<ConfiguredModel>): Record<string, unknown> {
  const original = editingConfig(snapshot);
  const patch = buildPatch(original, { models: parseModels(original).map(model => model.name === name ? { ...model, ...changes } : model) }, fieldsFromSchema(modelSchema(snapshot.schema)));
  if (changes.name && changes.name !== name) {
    for (const key of ['chat_model', 'image_caption_model']) if (original[key] === name) patch[key] = changes.name;
    if ((original.fallback_chat_models as string[] | undefined)?.includes(name)) {
      patch.fallback_chat_models = (original.fallback_chat_models as string[]).map(entry => entry === name ? changes.name : entry);
    }
  }
  return patch;
}

export function buildDefaultModelPatch(snapshot: ConfigSnapshot, name: string): Record<string, unknown> {
  return editingConfig(snapshot).chat_model === name ? {} : { chat_model: name };
}

export function inferModelType(id: string): ModelType {
  const lower = id.toLowerCase();
  if (lower.includes('embed')) return 'embedding';
  if (lower.includes('rerank')) return 'rerank';
  if (lower.includes('whisper') || lower.includes('transcribe')) return 'speech_to_text';
  if (lower.includes('tts')) return 'text_to_speech';
  return 'chat';
}

export function parseProviders(config: Record<string, unknown>): ConfiguredProvider[] {
  return ((config.providers ?? []) as Record<string, ConfiguredProvider>[]).flatMap(row => Object.values(row));
}

export function parseModels(config: Record<string, unknown>): ConfiguredModel[] {
  return (config.models ?? []) as ConfiguredModel[];
}

export function editingConfig(snapshot: ConfigSnapshot): Record<string, unknown> {
  return snapshot.pending?.config ?? snapshot.active;
}

export function modelsForSnapshot(snapshot: ConfigSnapshot): ConfiguredModel[] {
  // Pending 的秘密已脱敏，整个编辑草稿在激活后再测试，避免把旧连接结果归给新配置。
  return parseModels(editingConfig(snapshot)).map(model => ({ ...model, isPending: snapshot.pending !== null }));
}

export function modelSchema(schema: unknown): Record<string, unknown> {
  return Object.fromEntries(Object.entries((schema ?? {}) as Record<string, unknown>)
    .filter(([key]) => key === 'providers' || key === 'models'));
}

export function filterModelsByType(models: ConfiguredModel[], type: string): ConfiguredModel[] {
  return type === 'all' ? models : models.filter(model => model.type === type);
}

export function groupModelsByProvider(models: ConfiguredModel[]): Map<string, ConfiguredModel[]> {
  const grouped = new Map<string, ConfiguredModel[]>();
  for (const model of models) {
    const group = grouped.get(model.provider) ?? [];
    group.push(model);
    grouped.set(model.provider, group);
  }
  return grouped;
}

export function checkModelReferences(name: string, config: Record<string, unknown>): string[] {
  const locations: string[] = [];
  if (config.chat_model === name) locations.push('chat_model');
  (config.fallback_chat_models as string[] | undefined)?.forEach((model, index) => {
    if (model === name) locations.push(`fallback_chat_models[${index}]`);
  });
  return locations;
}

export function buildDeleteModelPatch(snapshot: ConfigSnapshot, name: string): Record<string, unknown> {
  const original = editingConfig(snapshot);
  return buildPatch(original, { models: parseModels(original).filter(model => model.name !== name) }, fieldsFromSchema(modelSchema(snapshot.schema)));
}

export function buildAddModelsPatch(snapshot: ConfigSnapshot, models: Record<string, unknown>[], providers?: unknown[]): Record<string, unknown> {
  const original = editingConfig(snapshot);
  return buildPatch(original, {
    models: [...parseModels(original), ...models],
    ...(providers ? { providers } : {}),
  }, fieldsFromSchema(modelSchema(snapshot.schema)));
}

export function isGenerationConflict(error: unknown): boolean {
  return error instanceof AdminAPIError && error.status === 409 && error.code === 'FAILED_PRECONDITION';
}

export function isMissingModelRoute(error: unknown): boolean {
  return error instanceof AdminAPIError && error.status === 404 && error.description === undefined;
}

export function usageByModel(models: { model: string; input_tokens: number; output_tokens: number }[]): Map<string, number> {
  return new Map(models.map(model => [model.model, model.input_tokens + model.output_tokens]));
}
