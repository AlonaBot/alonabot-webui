import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { OptionSelect } from '../ui/NativeAdapters';
import type { ChangeEvent, FormEvent, JSX, ReactNode } from 'react';
import { Eye, EyeOff, Search, X } from 'lucide-react';
import { fieldsFromSchema } from '../schema/model';
import type { Field, Template } from '../schema/model';
import { buildPatch, equalConfigValue, isSecretSet, MissingSecretsError } from '../schema/patch';
import { applyMergePatch, applyPatchToDraftBase } from '../pages/pluginConfig';
import { fieldExamples, fieldText, templateText } from '../i18n/catalog';
import { useUI } from '../i18n/UI';
import { Disclosure } from '../ui/Disclosure';
import { Checkbox } from '../ui/Checkbox';
import { Switch } from '../ui/Switch';
import { AdminAPIError } from '../api/client';
import { type ConfigOption, type OptionsPage } from '../api/config';
import { Spinner } from '../ui/EmptyState';
import styles from './ConfigForm.module.css';

export type ConfigFormProps = {
  schema: unknown;
  value: unknown;
  messages: Record<string, unknown>;
  /** 页面补丁已并入 draftBase；其余调用方沿用 value 作为补丁基线。 */
  onSubmit: (patch: Record<string, unknown>, draftBase?: Record<string, unknown>) => void;
  draftAction?: (draft: Record<string, unknown>, applyPatch: (patch: Record<string, unknown>) => void) => ReactNode;
  options?: {
    list: (path: string, q: string) => Promise<OptionsPage>;
    resolve: (path: string, values: string[]) => Promise<OptionsPage>;
  };
  exampleImageURL?: (image: string) => string;
  commandPrefix?: string;
  onDiscard?: () => void;
  onReveal?: (path: string[]) => Promise<string>;
  footer?: ReactNode;
  editablePaths?: readonly string[];
  /** 为真时只直接显示必填项，其余顶层字段收进「高级设置」。用于新建账号这类首次填写的表单。 */
  collapseOptional?: boolean;
};

interface FormContextValue {
  editablePaths?: readonly string[];
  fieldRevisions: Readonly<Record<string, number>>;
  options?: {
    list: (path: string, q: string) => Promise<OptionsPage>;
    resolve: (path: string, values: string[]) => Promise<OptionsPage>;
  };
  exampleImageURL?: (image: string) => string;
  commandPrefix?: string;
  onReveal?: (path: string[]) => Promise<string>;
  rootEdited: Record<string, unknown>;
  fields: Field[];
  messages: Record<string, unknown>;
}

const FormContext = createContext<FormContextValue | null>(null);

function getDraftValue(root: Record<string, unknown>, pathStr: string): unknown {
  if (pathStr.endsWith('.$key')) {
    const parentPath = pathStr.slice(0, -5);
    const parentVal = getDraftValue(root, parentPath);
    if (parentVal && typeof parentVal === 'object' && !Array.isArray(parentVal)) {
      return Object.keys(parentVal)[0] ?? '';
    }
    return '';
  }
  const parts = pathStr.split('.');
  let curr: unknown = root;
  for (const part of parts) {
    if (curr === null || typeof curr !== 'object' || !Object.hasOwn(curr as object, part)) {
      return undefined;
    }
    curr = (curr as Record<string, unknown>)[part];
  }
  return curr;
}

function findFieldByPath(fields: Field[], pathStr: string): Field | undefined {
  const parts = pathStr.split('.');
  let currFields: Field[] = fields;
  let result: Field | undefined;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const match = currFields.find(f => f.key === part);
    if (!match) return undefined;
    if (i === parts.length - 1) return match;
    if (match.children) {
      currFields = match.children;
    } else if (match.templates) {
      const nextPart = parts[++i];
      const tmpl = match.templates.find(t => t.key === nextPart);
      if (!tmpl) return undefined;
      currFields = tmpl.children;
    } else {
      return undefined;
    }
  }
  return result;
}

function formatPlaceholderValue(
  value: unknown,
  pathStr: string,
  fields: Field[],
  messages: Record<string, unknown>,
): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    const targetField = findFieldByPath(fields, pathStr);
    if (targetField && targetField.options) {
      const idx = targetField.options.indexOf(value);
      if (idx !== -1) {
        const text = fieldText(messages, targetField);
        return text.labels?.[idx] ?? targetField.labels?.[idx] ?? value;
      }
    }
    return value;
  }
  return '';
}

function checkCondition(condition: Record<string, unknown> | undefined, root: Record<string, unknown>): boolean {
  if (!condition) return true;
  for (const [key, expected] of Object.entries(condition)) {
    const actual = getDraftValue(root, key);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      return false;
    }
  }
  return true;
}

function replacePlaceholders(
  text: string,
  root: Record<string, unknown>,
  fields: Field[],
  messages: Record<string, unknown>,
): string {
  const sentinels = text.replaceAll('{{', '\uE000').replaceAll('}}', '\uE001');
  const replaced = sentinels.replace(/\{([A-Za-z0-9_.\-$]+)\}/g, (_, fieldPath) => {
    const val = getDraftValue(root, fieldPath);
    return formatPlaceholderValue(val, fieldPath, fields, messages);
  });
  return replaced.replaceAll('\uE000', '{').replaceAll('\uE001', '}');
}

// 原值跟随编辑对象身份，数组删行或控件隐藏重挂载后仍能找到同一行。
const originalValues = new WeakMap<object, Record<string, unknown> | undefined>();

function editableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(editableValue);
  if (value !== null && typeof value === 'object') {
    const copy = Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, editableValue(entry)]));
    originalValues.set(copy, value as Record<string, unknown>);
    return copy;
  }
  return value;
}

// 合并对象时保留未变的行身份；数组整体替换时，新行用页面结果作为原值。
function mergeEditedValue(before: unknown, after: unknown): unknown {
  if (equalConfigValue(before, after)) return before;
  if (after !== null && typeof after === 'object' && !Array.isArray(after)) {
    const previous = before !== null && typeof before === 'object' && !Array.isArray(before) ? before as Record<string, unknown> : {};
    return Object.fromEntries(Object.entries(after).map(([key, value]) => [key, mergeEditedValue(Object.hasOwn(previous, key) ? previous[key] : undefined, value)]));
  }
  return editableValue(after);
}

function submissionFields(value: Record<string, unknown>, fields: Field[], replacing: boolean, original = originalValues.get(value)): Record<string, unknown> {
  const result: Record<string, unknown> = Object.assign(Object.create(null), replacing ? original : value);
  for (const field of fields) {
    if (field.invisible || (field.condition && !Object.entries(field.condition)
      .every(([key, expected]) => Object.hasOwn(value, key) && JSON.stringify(value[key]) === JSON.stringify(expected)))) continue;
    const previous = original && Object.hasOwn(original, field.key) ? original[field.key] : undefined;
    if (Object.hasOwn(value, field.key)) result[field.key] = submissionValue(value[field.key], field, replacing, previous);
    else delete result[field.key];
  }
  return result;
}

function submissionTemplate(value: Record<string, unknown>, field: Field, replacing: boolean, original = originalValues.get(value)): Record<string, unknown> {
  const result: Record<string, unknown> = Object.assign(Object.create(null), replacing ? original : value);
  for (const template of field.templates!) {
    delete result[template.key];
    const previous = original && Object.hasOwn(original, template.key) ? original[template.key] : undefined;
    if (Object.hasOwn(value, template.key)) result[template.key] = submissionFields(value[template.key] as Record<string, unknown>, template.children, replacing, previous as Record<string, unknown> | undefined);
  }
  return result;
}

function submissionValue(value: unknown, field: Field, replacing: boolean, original: unknown): unknown {
  if (value === null || value === undefined || field.secret) return value;
  switch (field.type) {
    case 'object': return submissionFields(value as Record<string, unknown>, field.children!, replacing, original as Record<string, unknown> | undefined);
    case 'list': return field.children ? (value as Record<string, unknown>[]).map(row => submissionFields(row, field.children!, true)) : value;
    case 'template': return submissionTemplate(value as Record<string, unknown>, field, replacing, original as Record<string, unknown> | undefined);
    case 'template_list': return (value as Record<string, unknown>[]).map(row => submissionTemplate(row, field, true));
    default: return value;
  }
}

function valuePath(path: string[]): string {
  return '/' + path.map(part => part.replaceAll('~', '~0').replaceAll('/', '~1')).join('/');
}

type FieldProps = {
  field: Field;
  value: unknown;
  original: unknown;
  path: string[];
  messages: Record<string, unknown>;
  missing: string[];
  onChange: (value: unknown) => void;
};

function optionsPath(path: string[]): string {
  return path.filter((_, index) => index % 2 === 0).join('.');
}

export function OptionsFromControl({ field, value, onChange, attributes, optionsAPI }: {
  field: Field; value: unknown; onChange: (value: unknown) => void;
  attributes: Record<string, unknown>; optionsAPI: NonNullable<ConfigFormProps['options']>;
}) {
  const ui = useUI();
  const many = field.type === 'list';
  const selected = many ? (value ?? []) as string[] : typeof value === 'string' && value ? [value] : [];
  const selectedKey = JSON.stringify(selected);
  const path = optionsPath(field.schemaPath);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<OptionsPage>({ options: [], more: false });
  const [resolved, setResolved] = useState<ConfigOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);
  useEffect(() => { setDegraded(false); setError(null); }, [optionsAPI, path]);
  useEffect(() => {
    let active = true;
    setResolved(null);
    setResolveError(null);
    const values = JSON.parse(selectedKey) as string[];
    if (values.length) void optionsAPI.resolve(path, values).then(result => {
      if (active) setResolved(result.options);
    }).catch((caught: unknown) => {
      if (!active) return;
      setResolveError(caught instanceof Error ? caught.message : String(caught));
      if (caught instanceof AdminAPIError && caught.code === 'UNAVAILABLE') setDegraded(true);
    });
    return () => { active = false; };
  }, [optionsAPI, path, selectedKey]);
  useEffect(() => {
    if (!open || degraded) return;
    let active = true;
    setLoading(true);
    setError(null);
    setPage({ options: [], more: false });
    void optionsAPI.list(path, query).then(result => {
      if (active) setPage(result);
    }).catch((caught: unknown) => {
      if (!active) return;
      setError(caught instanceof Error ? caught.message : String(caught));
      if (caught instanceof AdminAPIError && caught.code === 'UNAVAILABLE') setDegraded(true);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, query, optionsAPI, path, degraded]);
  function choose(next: string) {
    onChange(many ? selected.includes(next) ? selected.filter(entry => entry !== next) : [...selected, next] : next);
    if (!many) setOpen(false);
    setQuery('');
  }
  function label(stored: string) {
    if (!resolved) return stored;
    const option = resolved.find(entry => entry.value === stored);
    return option ? option.label : `${ui.optionNotFound}: ${stored}`;
  }
  return <div className="options-from-control">
    {resolveError && <p role="alert">{degraded && `${ui.degradedToText}: `}{resolveError}</p>}
    {error && <p role="alert">{degraded && `${ui.degradedToText}: `}{error}</p>}
    {degraded ? many ? <div className="list-control">
      {selected.map((entry, index) => <div className="collection-row" key={index}>
        <input aria-label={ui.value} value={entry} onChange={event => onChange(selected.map((old, at) => index === at ? event.currentTarget.value : old))} />
        <button type="button" onClick={() => onChange(selected.filter((_, at) => index !== at))}>{ui.removeRow}</button>
      </div>)}
      <button type="button" onClick={() => onChange([...selected, ''])}>{ui.addRow}</button>
    </div> : <input {...attributes} required={field.required} value={selected[0] ?? ''} onChange={event => onChange(event.currentTarget.value)} /> : <>
      {many ? <div className="options-chips-list">{selected.map(entry => <span className="option-chip" key={entry}>
        {label(entry)}<button type="button" aria-label={`${ui.removeRow} ${entry}`} onClick={() => choose(entry)}><X size={14} /></button>
      </span>)}</div> : <div className="option-current">{selected.map(entry => <span key={entry}>{label(entry)}</span>)}</div>}
      <div className="options-input-row">
        <Search size={16} aria-hidden />
        <input {...attributes} required={field.required && selected.length === 0} value={query} placeholder={ui.searchOptions} aria-expanded={open}
          onFocus={() => setOpen(true)} onChange={event => { setQuery(event.currentTarget.value); setOpen(true); }} />
      </div>
      {open && <div className="options-dropdown">
        {loading && <div className="options-loading"><Spinner size={16} /></div>}
        {page.options.map(option => <button type="button" key={option.value} className="option-item" aria-pressed={selected.includes(option.value)} onClick={() => choose(option.value)}>
          <span>{option.label}</span>{option.description && <small>{option.description}</small>}
        </button>)}
        {!loading && page.options.length === 0 && <p className="options-empty">{ui.noMatches}</p>}
        {page.more && <p className="options-empty">{ui.searchMoreOptions}</p>}
        {query && !page.options.some(option => option.value === query) && <button type="button" className="option-item" onClick={() => choose(query)}><span>{ui.customValue}: <code>{query}</code></span></button>}
      </div>}
    </>}
  </div>;
}

function ExampleImage({ src, image, alt }: { src?: string; image: string; alt?: string }) {
  const ui = useUI();
  const [failed, setFailed] = useState(false);
  if (!src) return <span className="example-image-alt">{alt ?? image}</span>;
  return !failed ? <img src={src} alt={alt ?? ''} className="example-image" onError={() => setFailed(true)} />
    : <span className="example-image-alt" role="status">{ui.imageLoadFailed}: {alt ?? image}</span>;
}

function FieldControl({ field, value, original, path, messages, missing, onChange }: FieldProps) {
  const ui = useUI();
  const id = useId();
  const formContext = useContext(FormContext);
  const [showSecret, setShowSecret] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  const dottedPath = path.join('.');
  const editable = !formContext?.editablePaths || formContext.editablePaths.some(marked => dottedPath === marked || dottedPath.startsWith(marked + '.'));
  const group = field.type === 'object' && formContext?.editablePaths?.some(marked => marked.startsWith(dottedPath + '.'));
  const text = fieldText(messages, field);
  const missingValue = missing.includes(valuePath(path));
  const attributes = { id, 'aria-describedby': text.hint ? `${id}-hint` : undefined, 'aria-invalid': missingValue || undefined };
  let control;

  const handleRevealInto = async () => {
    if (!formContext?.onReveal) return;
    setRevealing(true);
    setRevealError(null);
    try {
      onChange(await formContext.onReveal(path));
      setShowSecret(true);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) setRevealError(err instanceof Error ? err.message : String(err));
    } finally {
      setRevealing(false);
    }
  };


  if (value === null) {
    control = <div className="default-pending" role="status">
      <p>{ui.defaultPending}</p>
      <button type="button" onClick={() => onChange(editableValue(original))}>{ui.undoReset}</button>
    </div>;
  } else if (field.secret) {
    // 一个密码框加显示开关：留空保持已保存的值，输入即替换。
    const stored = isSecretSet(original) || (typeof original === 'string' && original.length > 0);
    const text = typeof value === 'string' ? value : '';
    const toggle = async () => {
      if (!showSecret && text === '' && stored && formContext?.onReveal) {
        await handleRevealInto();
        return;
      }
      setShowSecret(!showSecret);
    };
    control = <div className="secret-control">
      <div className="secret-input">
        <input {...attributes} type={showSecret ? 'text' : 'password'} autoComplete="new-password"
          required={field.required && !stored} value={text} placeholder={stored ? ui.secretKeepPlaceholder : undefined}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const next = event.currentTarget.value;
            // 清空输入时恢复为已保存的值，而不是提交空字符串。
            onChange(next === '' && stored ? original : next);
          }} />
        <button type="button" className="secret-toggle" aria-label={showSecret ? ui.hideSecret : ui.showSecret} aria-pressed={showSecret}
          disabled={revealing} onClick={() => void toggle()}>{showSecret ? <EyeOff size={16} /> : <Eye size={16} />}</button>
      </div>
      {revealError && <p role="alert" className="form-error-inline">{revealError}</p>}
    </div>;
  } else {
    switch (field.type) {
      case 'template':
      case 'template_list':
        control = <TemplateControl {...{ field, value, original, path, messages, missing, onChange }} id={id} />;
        break;
      case 'list':
        control = <ListControl {...{ field, value, original, path, messages, missing, onChange }} id={id} />;
        break;
      case 'dict':
        control = <DictControl value={value as Record<string, unknown>} onChange={onChange} id={id} required={field.required} />;
        break;
      case 'object':
        control = <Fields fields={field.children!} value={value as Record<string, unknown>}
          original={original as Record<string, unknown>} path={path} messages={messages} missing={missing} onChange={onChange} />;
        break;
      case 'bool':
        control = <Switch id={id} aria-describedby={attributes['aria-describedby']} checked={value === true} onCheckedChange={onChange} />;
        break;
      case 'int':
      case 'float':
        control = <div className="number-control">
          <input {...attributes} type={field.slider ? 'range' : 'number'} required={value !== undefined} value={value === undefined ? '' : value as number | string}
            min={field.slider?.min} max={field.slider?.max} step={field.slider?.step ?? (field.type === 'int' ? 1 : 'any')}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.currentTarget.value === '' ? '' : event.currentTarget.valueAsNumber)} />
          {field.slider && <output htmlFor={id}>{value === undefined ? '' : String(value)}</output>}
        </div>;
        break;
      case 'string':
      case 'text':
        if (field.type === 'string' && field.optionsFrom && formContext?.options) {
          control = <OptionsFromControl
            field={field}
            value={value}
            onChange={onChange}
            attributes={attributes}
            optionsAPI={formContext.options}
          />;
        } else if (field.editorMode || field.type === 'text') {
          control = <div>
            {field.editorMode && <span className="editor-language">{ui.codeLanguage}: {field.editorLanguage}</span>}
            <textarea {...attributes} className={field.editorMode ? 'code-editor' : undefined}
              required={field.required} value={typeof value === 'string' ? value : ''} spellCheck={!field.editorMode}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.currentTarget.value)} />
          </div>;
        } else if (field.options) {
          control = <OptionSelect {...attributes} required={field.required} value={typeof value === 'string' ? value : ''}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.currentTarget.value)}>
            {!field.options.includes(value as string) && <option value="" />}
            {field.options.map((option, index) => <option key={option} value={option}>{text.labels?.[index] ?? option}</option>)}
          </OptionSelect>;
        } else {
          control = <input {...attributes} type="text" required={field.required} value={typeof value === 'string' ? value : ''}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.currentTarget.value)} />;
        }
        break;
      default:
        throw new Error(`unsupported form control: ${field.type}`);
    }
  }

  const rawExamples = formContext ? fieldExamples(messages, field) : [];
  const visibleExamples = rawExamples.filter(ex => checkCondition(ex.condition, formContext?.rootEdited ?? {}));

  // 只有值不同于缺省值时才给出「恢复默认」；密钥用自己的清除按钮。
  const customized = !field.secret && value !== undefined && value !== null
    && !(Object.hasOwn(field, 'defaultValue') && JSON.stringify(value) === JSON.stringify(field.defaultValue));
  const fromPage = path.length === 1 && formContext && Object.hasOwn(formContext.fieldRevisions, field.key);
  const title = <>{text.description}{field.required && <span className="required-mark"> · {ui.required}</span>}
    {fromPage && <span className={styles.updated}>{ui.accountConfigFieldChanged}</span>}</>;
  const body = <>
    {field.type === 'object' && <legend>{title}</legend>}
    <div className="field-heading">
      {field.type !== 'object' && <label htmlFor={id}>{title}</label>}
      {customized && <button type="button" disabled={!editable} onClick={() => { setShowSecret(false); onChange(null); }}>{ui.restoreDefault}</button>}
    </div>
    {text.hint && <p id={`${id}-hint`} className={field.obviousHint ? 'field-hint obvious-hint' : 'field-hint'}
>{text.hint}</p>}
    {control}
    {visibleExamples.length > 0 && (
      <div className="field-examples" aria-label={ui.examples}>
        {visibleExamples.map((ex, index) => {
          const formattedInput = replacePlaceholders(ex.input, formContext?.rootEdited ?? {}, formContext?.fields ?? [], messages);
          const fullInput = `${formContext?.commandPrefix ?? ''}${formattedInput}`;
          return (
            <div key={index} className="field-example-item">
              <div className="example-input">
                <span className="example-prompt">&gt;</span>
                <code>{fullInput}</code>
              </div>
              <div className="example-reply">
                {typeof ex.reply === 'string' ? (
                  <div className="example-text">
                    {replacePlaceholders(ex.reply, formContext?.rootEdited ?? {}, formContext?.fields ?? [], messages)}
                  </div>
                ) : Array.isArray(ex.reply) ? (
                  <div className="example-segments">
                    {ex.reply.map((seg, segIdx) => {
                      if ('text' in seg) {
                        return (
                          <div key={segIdx} className="example-text">
                            {replacePlaceholders(seg.text, formContext?.rootEdited ?? {}, formContext?.fields ?? [], messages)}
                          </div>
                        );
                      }
                      const imageSrc = formContext?.exampleImageURL ? formContext.exampleImageURL(seg.image) : '';
                      return <ExampleImage key={`${segIdx}:${imageSrc}`} src={imageSrc} image={seg.image} alt={seg.alt} />;
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    )}
    {missingValue && <p role="alert">{ui.missingSecrets} {valuePath(path)}</p>}
  </>;
  return <fieldset className={field.type === 'object' ? 'config-group' : 'config-field'} disabled={!editable && !group}>{body}</fieldset>;
}

function Fields({ fields, value = {}, original, path, messages, missing, onChange }: {
  fields: Field[];
  value: Record<string, unknown>;
  original: Record<string, unknown>;
  path: string[];
  messages: Record<string, unknown>;
  missing: string[];
  onChange: (value: unknown) => void;
}) {
  const formContext = useContext(FormContext);
  return <>{fields.filter(field => !field.invisible && (!field.condition || Object.entries(field.condition)
    .every(([key, expected]) => Object.hasOwn(value, key) && JSON.stringify(value[key]) === JSON.stringify(expected))))
    .map(field => <FieldControl key={path.length === 0 && formContext && Object.hasOwn(formContext.fieldRevisions, field.key) ? `${field.key}:${formContext.fieldRevisions[field.key]}` : field.key} field={field} value={Object.hasOwn(value, field.key) ? value[field.key] : undefined}
      original={original && Object.hasOwn(original, field.key) ? original[field.key] : undefined}
      path={[...path, field.key]} messages={messages} missing={missing}
      onChange={next => {
        const updated = { ...value, [field.key]: next };
        originalValues.set(updated, original);
        onChange(updated);
      }} />)}</>;
}

/** ConfigForm 将完整编辑状态绑定到当前读取的配置和 Schema。 */
export function ConfigForm(props: ConfigFormProps): JSX.Element {
  const [source, setSource] = useState({ value: props.value, schema: props.schema, revision: 0 });
  if (source.value !== props.value || source.schema !== props.schema) {
    // 输入快照变化时在渲染子控件前切换版本，避免旧行与新补丁基线配对。
    setSource({ value: props.value, schema: props.schema, revision: source.revision + 1 });
  }
  return <FormEditor key={source.revision} {...props} />;
}

function editablePatch(patch: Record<string, unknown>, paths: readonly string[], prefix = ''): Record<string, unknown> {
  return Object.fromEntries(Object.entries(patch).flatMap(([key, value]) => {
    const path = prefix ? prefix + '.' + key : key;
    if (paths.some(marked => path === marked || path.startsWith(marked + '.'))) return [[key, value]];
    if (!paths.some(marked => marked.startsWith(path + '.')) || value === null || typeof value !== 'object' || Array.isArray(value)) return [];
    const nested = editablePatch(value as Record<string, unknown>, paths, path);
    return Object.keys(nested).length ? [[key, nested]] : [];
  }));
}

function FormEditor(props: ConfigFormProps) {
  const ui = useUI();
  const fields = useMemo(() => fieldsFromSchema(props.schema), [props.schema]);
  const [edited, setEdited] = useState(() => editableValue(props.value) as Record<string, unknown>);
  const [external, setExternal] = useState<{ base: Record<string, unknown>; revisions: Record<string, number> }>();
  const base = external?.base ?? props.value;
  const [error, setError] = useState<Error | null>(null);
  const [resetVersion, setResetVersion] = useState(0);
  const missing = error instanceof MissingSecretsError ? error.paths : [];
  const isDirty = useMemo(() => JSON.stringify(edited) !== JSON.stringify(props.value), [edited, props.value]);
  const optionalUpdated = fields.some(field => !field.required && !field.invisible && external && Object.hasOwn(external.revisions, field.key));

  const formContextValue = useMemo<FormContextValue>(() => ({
    editablePaths: props.editablePaths,
    fieldRevisions: external?.revisions ?? {},
    options: props.options,
    exampleImageURL: props.exampleImageURL,
    commandPrefix: props.commandPrefix,
    onReveal: props.onReveal,
    rootEdited: edited,
    fields,
    messages: props.messages,
  }), [props.editablePaths, props.options, props.exampleImageURL, props.commandPrefix, props.onReveal, edited, fields, props.messages, external]);

  function applyDraftPatch(patch: Record<string, unknown>) {
    const next = mergeEditedValue(edited, applyMergePatch(edited, patch)) as Record<string, unknown>;
    const revisions = { ...external?.revisions };
    for (const key of Object.keys(patch)) {
      if (!equalConfigValue(edited[key], next[key])) Object.defineProperty(revisions, key, {
        value: (Object.hasOwn(revisions, key) ? revisions[key] : 0) + 1, enumerable: true, configurable: true,
      });
    }
    // 页面有权限改隐藏字段和删除字段；以合入页面结果后的配置为表单补丁基线。
    setExternal({ base: applyPatchToDraftBase(base as Record<string, unknown>, edited, patch), revisions });
    setEdited(next);
    setError(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    let patch: Record<string, unknown>;
    try {
      patch = buildPatch(base, submissionFields(edited, fields, false), fields);
      if (props.editablePaths) patch = editablePatch(patch, props.editablePaths);
    } catch (caught) {
      if (!(caught instanceof Error)) throw caught;
      setError(caught);
      return;
    }
    setError(null);
    props.onSubmit(patch, external?.base);
  }

  return (
    <FormContext.Provider value={formContextValue}>
      {props.draftAction?.(edited, applyDraftPatch)}
      <form onSubmit={submit} onInvalidCapture={event => {
        let details = (event.target as HTMLElement).closest('details');
        while (details) {
          details.open = true;
          details = details.parentElement?.closest('details') ?? null;
        }
      }}>
        {props.collapseOptional ? <>
          <Fields key={resetVersion} fields={fields.filter(field => field.required)} value={edited} original={base as Record<string, unknown>}
            path={[]} messages={props.messages} missing={missing} onChange={next => { setEdited(next as Record<string, unknown>); setError(null); }} />
          {fields.some(field => !field.required && !field.invisible) && <Disclosure key={optionalUpdated ? 'updated' : 'normal'} summary={ui.advancedSettings} defaultOpen={optionalUpdated}>
            <Fields key={resetVersion} fields={fields.filter(field => !field.required)} value={edited} original={base as Record<string, unknown>}
              path={[]} messages={props.messages} missing={missing} onChange={next => { setEdited(next as Record<string, unknown>); setError(null); }} />
          </Disclosure>}
        </> : <Fields key={resetVersion} fields={fields} value={edited} original={base as Record<string, unknown>}
          path={[]} messages={props.messages} missing={missing} onChange={next => { setEdited(next as Record<string, unknown>); setError(null); }} />}
        {error && <div role="alert" className="form-error">
          <p>{error instanceof MissingSecretsError ? ui.missingSecrets : ui.patchError}</p>
          <pre>{error.message}</pre>
        </div>}
        {props.onDiscard ? (isDirty && (
          <div className="config-form-actions">
            <button
              type="button"
              className="discard-button"
              disabled={!isDirty}
              onClick={() => {
                setEdited(editableValue(props.value) as Record<string, unknown>);
                setExternal(undefined);
                setError(null);
                setResetVersion(version => version + 1);
                props.onDiscard!();
              }}
            >
              {ui.discard}
            </button>
            <button type="submit" className="save-button" disabled={!isDirty}>
              {ui.save}
            </button>
          </div>
        )) : (
          props.footer ?? <button type="submit" className="save-button">{ui.save}</button>
        )}
      </form>
    </FormContext.Provider>
  );
}

function ListControl(props: FieldProps & { id: string }) {
  const formContext = useContext(FormContext);
  if (props.field.optionsFrom && formContext?.options) {
    return <OptionsFromControl
      field={props.field}
      value={props.value}
      onChange={props.onChange}
      attributes={{ id: props.id }}
      optionsAPI={formContext.options}
    />;
  }
  return <StaticListControl {...props} />;
}

function StaticListControl(props: FieldProps & { id: string }) {
  const ui = useUI();
  const values = (props.value ?? []) as unknown[];
  const serial = useRef(0);
  const rows = useRef(values.map(() => ({ id: serial.current++ })));
  const text = fieldText(props.messages, props.field);
  if (props.field.options) {
    const options = props.field.options;
    return <div id={props.id} className="option-checks" role="group" aria-label={text.description}>
      {options.map((option, index) => <Checkbox key={option} label={text.labels?.[index] ?? option} checked={values.includes(option)}
        // 按选项顺序写回，结果与原多选框一致。
        onCheckedChange={on => props.onChange(options.filter(entry => entry === option ? on : values.includes(entry)))} />)}
      {props.field.required && values.length === 0 && <input required value="" aria-label={ui.emptyCollection} onChange={() => {}} className="visually-hidden" />}
    </div>;
  }
  return <div id={props.id} className="list-control">
    {values.map((value, index) => <div key={rows.current[index].id} className="collection-row">
      {props.field.children ? <Fields fields={props.field.children} value={value as Record<string, unknown>}
        original={originalValues.get(value as object)!} path={[...props.path, String(index)]}
        messages={props.messages} missing={props.missing} onChange={next => props.onChange(values.map((entry, at) => at === index ? next : entry))} />
        : <input aria-label={`${text.description} ${index + 1}`} value={value as string}
          onChange={(event: ChangeEvent<HTMLInputElement>) => { const next = event.currentTarget.value; props.onChange(values.map((entry, at) => at === index ? next : entry)); }} />}
      <button type="button" onClick={() => { rows.current.splice(index, 1); props.onChange(values.filter((_, at) => at !== index)); }}>{ui.removeRow}</button>
    </div>)}
    {props.field.required && values.length === 0 && <input required value="" aria-label={ui.emptyCollection} onChange={() => {}} />}
    <button type="button" onClick={() => {
      const value = props.field.children ? templateDefaults(props.field.children) : '';
      rows.current.push({ id: serial.current++ }); props.onChange([...values, value]);
    }}>{ui.addRow}</button>
  </div>;
}

type DictRow = { id: number; key: string; kind: 'string' | 'number' | 'boolean' | 'json' | 'secret'; text: string; editingSecret: boolean; stored: unknown };
function dictRow(key: string, value: unknown, id: number): DictRow {
  const kind = isSecretSet(value) ? 'secret' : typeof value === 'string' ? 'string' : typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'json';
  return { id, key, kind, text: kind === 'secret' ? '' : kind === 'string' ? value as string : JSON.stringify(value), editingSecret: false, stored: value };
}
function dictValue(row: DictRow): unknown {
  switch (row.kind) {
    case 'secret': return row.stored;
    case 'string': return row.text;
    case 'boolean': return row.text === 'true';
    case 'number': {
      const number = Number(row.text);
      if (!row.text.trim() || !Number.isFinite(number)) throw new Error('expected a finite number');
      return number;
    }
    case 'json': return JSON.parse(row.text);
  }
}
function DictControl({ value = {}, onChange, id, required }: { value: Record<string, unknown>; onChange: (value: unknown) => void; id: string; required: boolean }) {
  const ui = useUI();
  const serial = useRef(0);
  const [rows, setRows] = useState<DictRow[]>(() => Object.entries(value).map(([key, entry]) => dictRow(key, entry, serial.current++)));
  function update(next: DictRow[]) {
    setRows(next);
    if (next.some((row, index) => next.findIndex(other => other.key === row.key) !== index)) return;
    const entries: [string, unknown][] = [];
    for (const row of next) {
      try { entries.push([row.key, dictValue(row)]); }
      catch (error) { if (!(error instanceof Error)) throw error; return; }
    }
    onChange(Object.fromEntries(entries));
  }
  return <div id={id} className="dict-control">
    {rows.map((row: DictRow, index: number) => {
      const duplicate = rows.some((other: DictRow) => other.id !== row.id && other.key === row.key);
      let parseError: string | undefined;
      try { dictValue(row); } catch (error) { if (!(error instanceof Error)) throw error; parseError = error.message; }
      const change = (changes: Partial<DictRow>) => update(rows.map((entry: DictRow, at: number) => at === index ? { ...row, ...changes } : entry));
      return <div key={row.id} className="collection-row dict-row">
        <label>{ui.key}<input value={row.key} aria-invalid={duplicate || undefined}
          ref={(input: HTMLInputElement | null) => { input?.setCustomValidity(duplicate ? ui.duplicateKey : ''); }}
          onChange={(event: ChangeEvent<HTMLInputElement>) => change({ key: event.currentTarget.value })} /></label>
        {duplicate && <p role="alert">{ui.duplicateKey}</p>}
        {row.kind === 'secret' ? <div><span>{isSecretSet(row.stored) || row.stored !== '' ? ui.secretSet : ui.secretUnset}</span>
          {row.editingSecret ? <input type="password" aria-label={ui.value} autoComplete="new-password"
            onChange={(event: ChangeEvent<HTMLInputElement>) => change({ stored: event.currentTarget.value, text: event.currentTarget.value })} />
            : <button type="button" onClick={() => change({ editingSecret: true })}>{ui.modify}</button>}
        </div> : <>
          <label>{ui.valueType}<OptionSelect value={row.kind} onChange={(event: ChangeEvent<HTMLSelectElement>) => {
            const kind = event.currentTarget.value as DictRow['kind'];
            change({ kind, text: kind === 'string' ? '' : kind === 'number' ? '0' : kind === 'boolean' ? 'false' : '{}' });
          }}><option value="string">{ui.stringValue}</option><option value="number">{ui.numberValue}</option>
            <option value="boolean">{ui.booleanValue}</option><option value="json">{ui.jsonValue}</option></OptionSelect></label>
          <label>{ui.value}{row.kind === 'boolean' ? <OptionSelect value={row.text}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => change({ text: event.currentTarget.value })}>
            <option value="true">{ui.trueValue}</option><option value="false">{ui.falseValue}</option></OptionSelect>
            : <textarea value={row.text} className={row.kind === 'json' ? 'code-editor' : undefined} aria-invalid={!!parseError || undefined}
              ref={(input: HTMLTextAreaElement | null) => { input?.setCustomValidity(parseError ? row.kind === 'number' ? ui.invalidNumber : ui.invalidJSON : ''); }}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => change({ text: event.currentTarget.value })} />}</label>
          {parseError && <p role="alert">{row.kind === 'number' ? ui.invalidNumber : ui.invalidJSON} <code>{parseError}</code></p>}
        </>}
        <button type="button" onClick={() => update(rows.filter((entry: DictRow) => entry.id !== row.id))}>{ui.removeRow}</button>
      </div>;
    })}
    {required && rows.length === 0 && <input required value="" aria-label={ui.emptyCollection} onChange={() => {}} />}
    <button type="button" onClick={() => {
      let key = ''; while (rows.some((row: DictRow) => row.key === key)) key += '_';
      update([...rows, dictRow(key, '', serial.current++)]);
    }}>{ui.addRow}</button>
  </div>;
}

/** schemaDefaults 返回 Schema 声明的缺省值，用作新建配置的初始草稿。 */
export function schemaDefaults(schema: unknown): Record<string, unknown> {
  return templateDefaults(fieldsFromSchema(schema));
}

// 新行与新选模板预填声明过的默认值，读取的配置仍由 SDK 补齐。
function templateDefaults(fields: Field[]): Record<string, unknown> {
  return Object.fromEntries(fields.flatMap(field => Object.hasOwn(field, 'defaultValue') ? [[field.key, structuredClone(field.defaultValue)]]
    : field.type === 'object' ? [[field.key, templateDefaults(field.children!)]] : []));
}

function TemplateControl(props: FieldProps & { id: string }) {
  const ui = useUI();
  const many = props.field.type === 'template_list';
  const values = many ? (props.value ?? []) as Record<string, unknown>[] : [props.value as Record<string, unknown> | undefined];
  const serial = useRef(0);
  const rows = useRef(values.map(() => ({ id: serial.current++ })));
  function selection(value: Record<string, unknown> | undefined) {
    return props.field.templates!.find(template => value && Object.hasOwn(value, template.key));
  }
  function edit(index: number, next: unknown) {
    if (next !== null && typeof next === 'object') {
      originalValues.set(next, originalValues.get(values[index]!));
    }
    props.onChange(many ? values.map((value, at) => at === index ? next : value) : next);
  }
  function label(template: Template, value: Record<string, unknown>) {
    const text = templateText(props.messages, template);
    if (!template.displayItem) return text.name;
    const parts = template.displayItem.split('.');
    let current = value[template.key] as Record<string, unknown> | undefined;
    let children = template.children;
    let field: Field | undefined;
    for (const part of parts) {
      field = children.find(child => child.key === part)!;
      if (field.secret) return text.name;
      current = current && Object.hasOwn(current, part) ? current[part] as Record<string, unknown> : undefined;
      children = field.children ?? [];
    }
    return current ? `${text.name} · ${fieldText(props.messages, field!).description}: ${String(current)}` : text.name;
  }
  function editor(value: Record<string, unknown> | undefined, index: number) {
    const template = selection(value);
    const original = value && originalValues.get(value);
    const text = template && templateText(props.messages, template);
    const rowPath = many ? [...props.path, String(index)] : props.path;
    return <>
      <OptionSelect id={many ? undefined : props.id} aria-label={fieldText(props.messages, props.field).description}
        required={many || props.field.required} value={template?.key ?? ''}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => {
          const chosen = props.field.templates!.find(candidate => candidate.key === event.currentTarget.value);
          edit(index, chosen ? { [chosen.key]: templateDefaults(chosen.children) } : null);
        }}>
        <option value="">{ui.chooseTemplate}</option>
        {props.field.templates!.map(candidate => <option key={candidate.key} value={candidate.key}>{templateText(props.messages, candidate).name}</option>)}
      </OptionSelect>
      {text?.hint && <p className="field-hint">{text.hint}</p>}
      {template && <Fields key={template.key} fields={template.children} value={value![template.key] as Record<string, unknown>}
        original={(original && Object.hasOwn(original, template.key) ? original[template.key] : undefined) as Record<string, unknown>}
        path={[...rowPath, template.key]} messages={props.messages} missing={props.missing}
        onChange={next => edit(index, { [template.key]: next })} />}
    </>;
  }
  if (!many) return editor(values[0], 0);
  const missingIn = (index: number) => props.missing.some(path => path.startsWith(valuePath([...props.path, String(index)]) + '/'));
  return <div id={props.id} className="template-list">
    {values.map((value, index) => {
      const template = selection(value);
      const text = template && templateText(props.messages, template);
      return <div key={rows.current[index].id} className="collection-row">
        {/* 有缺失字段时换 key 重新挂载，使该行自动展开。 */}
        <Disclosure key={missingIn(index) ? 'missing' : 'ok'} defaultOpen={missingIn(index) || !template}
          summary={template ? label(template, value!) : ui.chooseTemplate}
          hint={text?.hint && !template!.hideHintInList ? text.hint : undefined}>
          {editor(value, index)}
        </Disclosure>
        <button type="button" onClick={() => { rows.current.splice(index, 1); props.onChange(values.filter((_, at) => at !== index)); }}>{ui.removeRow}</button>
      </div>;
    })}
    {props.field.required && values.length === 0 && <input required value="" aria-label={ui.emptyCollection} onChange={() => {}} />}
    <button type="button" onClick={() => { rows.current.push({ id: serial.current++ }); props.onChange([...values, {}]); }}>{ui.addRow}</button>
  </div>;
}
