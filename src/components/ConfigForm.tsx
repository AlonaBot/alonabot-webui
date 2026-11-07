import { useId, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { fieldsFromSchema } from '../schema/model';
import type { Field, Template } from '../schema/model';
import { buildPatch, isSecretSet, MissingSecretsError } from '../schema/patch';
import { fieldText, templateText } from '../i18n/catalog';
import { useUI } from '../i18n/UI';

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

function FieldControl({ field, value, original, path, messages, missing, onChange }: FieldProps) {
  const ui = useUI();
  const id = useId();
  const [editingSecret, setEditingSecret] = useState(false);
  const text = fieldText(messages, field);
  const missingValue = missing.includes(valuePath(path));
  const attributes = { id, 'aria-describedby': text.hint ? `${id}-hint` : undefined, 'aria-invalid': missingValue || undefined };
  let control;

  if (value === null) {
    control = <div className="default-pending" role="status">
      <p>{ui.defaultPending}</p>
      <button type="button" onClick={() => onChange(editableValue(original))}>{ui.undoReset}</button>
    </div>;
  } else if (field.secret) {
    const set = isSecretSet(value) || (typeof value === 'string' && value.length > 0);
    control = <div className="secret-control">
      <span role="status">{set ? ui.secretSet : ui.secretUnset}</span>
      {!editingSecret && <button type="button" onClick={() => setEditingSecret(true)}>{ui.modify}</button>}
      {editingSecret && <input {...attributes} type="password" autoComplete="new-password"
        required={field.required} value={typeof value === 'string' ? value : ''}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.currentTarget.value)} />}
      <button type="button" onClick={() => { setEditingSecret(false); onChange(null); }}>{ui.clear}</button>
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
        control = <input {...attributes} type="checkbox" role="switch" checked={value === true}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.currentTarget.checked)} />;
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
        if (field.editorMode || field.type === 'text') {
          control = <div>
            {field.editorMode && <span className="editor-language">{ui.codeLanguage}: {field.editorLanguage}</span>}
            <textarea {...attributes} className={field.editorMode ? 'code-editor' : undefined}
              style={field.editorMode ? { fontFamily: 'monospace' } : undefined}
              required={field.required} value={typeof value === 'string' ? value : ''} spellCheck={!field.editorMode}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.currentTarget.value)} />
          </div>;
        } else if (field.options) {
          control = <select {...attributes} required={field.required} value={typeof value === 'string' ? value : ''}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.currentTarget.value)}>
            {!field.options.includes(value as string) && <option value="" />}
            {field.options.map((option, index) => <option key={option} value={option}>{text.labels?.[index] ?? option}</option>)}
          </select>;
        } else {
          control = <input {...attributes} type="text" required={field.required} value={typeof value === 'string' ? value : ''}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.currentTarget.value)} />;
        }
        break;
      default:
        throw new Error(`unsupported form control: ${field.type}`);
    }
  }

  const title = <>{text.description}{field.required && <span className="required-mark"> · {ui.required}</span>}</>;
  const body = <>
    {field.type === 'object' && <legend>{title}</legend>}
    <div className="field-heading">
      {field.type !== 'object' && <label htmlFor={id}>{title}</label>}
      <button type="button" onClick={() => { setEditingSecret(false); onChange(null); }}>{ui.restoreDefault}</button>
    </div>
    {text.hint && <p id={`${id}-hint`} className={field.obviousHint ? 'field-hint obvious-hint' : 'field-hint'}
      style={field.obviousHint ? { fontWeight: 700 } : undefined}>{text.hint}</p>}
    {control}
    {missingValue && <p role="alert">{ui.missingSecrets} {valuePath(path)}</p>}
  </>;
  return field.type === 'object' ? <fieldset className="config-group">{body}</fieldset> : <div className="config-field">{body}</div>;
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
  return <>{fields.filter(field => !field.invisible && (!field.condition || Object.entries(field.condition)
    .every(([key, expected]) => Object.hasOwn(value, key) && JSON.stringify(value[key]) === JSON.stringify(expected))))
    .map(field => <FieldControl key={field.key} field={field} value={Object.hasOwn(value, field.key) ? value[field.key] : undefined}
      original={original && Object.hasOwn(original, field.key) ? original[field.key] : undefined}
      path={[...path, field.key]} messages={messages} missing={missing}
      onChange={next => {
        const updated = { ...value, [field.key]: next };
        originalValues.set(updated, original);
        onChange(updated);
      }} />)}</>;
}

type ConfigFormProps = {
  schema: unknown;
  value: unknown;
  messages: Record<string, unknown>;
  onSubmit: (patch: Record<string, unknown>) => void;
};

/** ConfigForm 将完整编辑状态绑定到当前读取的配置和 Schema。 */
export function ConfigForm(props: ConfigFormProps) {
  const [source, setSource] = useState({ value: props.value, schema: props.schema, revision: 0 });
  if (source.value !== props.value || source.schema !== props.schema) {
    // 输入快照变化时在渲染子控件前切换版本，避免旧行与新补丁基线配对。
    setSource({ value: props.value, schema: props.schema, revision: source.revision + 1 });
  }
  return <FormEditor key={source.revision} {...props} />;
}

function FormEditor(props: ConfigFormProps) {
  const ui = useUI();
  const fields = useMemo(() => fieldsFromSchema(props.schema), [props.schema]);
  const [edited, setEdited] = useState(() => editableValue(props.value) as Record<string, unknown>);
  const [error, setError] = useState<Error | null>(null);
  const missing = error instanceof MissingSecretsError ? error.paths : [];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    let patch: Record<string, unknown>;
    try {
      patch = buildPatch(props.value, submissionFields(edited, fields, false), fields);
    } catch (caught) {
      if (!(caught instanceof Error)) throw caught;
      setError(caught);
      return;
    }
    setError(null);
    props.onSubmit(patch);
  }

  return <form onSubmit={submit} onInvalidCapture={event => {
    let details = (event.target as HTMLElement).closest('details');
    while (details) {
      details.open = true;
      details = details.parentElement?.closest('details') ?? null;
    }
  }}>
    <Fields fields={fields} value={edited} original={props.value as Record<string, unknown>}
      path={[]} messages={props.messages} missing={missing} onChange={next => { setEdited(next as Record<string, unknown>); setError(null); }} />
    {error && <div role="alert" className="form-error">
      <p>{error instanceof MissingSecretsError ? ui.missingSecrets : ui.patchError}</p>
      <pre>{error.message}</pre>
    </div>}
    <button type="submit" className="save-button">{ui.save}</button>
  </form>;
}

function ListControl(props: FieldProps & { id: string }) {
  const ui = useUI();
  const values = (props.value ?? []) as unknown[];
  const serial = useRef(0);
  const rows = useRef(values.map(() => ({ id: serial.current++ })));
  const text = fieldText(props.messages, props.field);
  if (props.field.options) return <select id={props.id} multiple required={props.field.required} value={values as string[]}
    onChange={(event: ChangeEvent<HTMLSelectElement>) => props.onChange(Array.from<HTMLOptionElement, string>(event.currentTarget.selectedOptions, option => option.value))}>
    {props.field.options.map((option, index) => <option key={option} value={option}>{text.labels?.[index] ?? option}</option>)}
  </select>;
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
          <label>{ui.valueType}<select value={row.kind} onChange={(event: ChangeEvent<HTMLSelectElement>) => {
            const kind = event.currentTarget.value as DictRow['kind'];
            change({ kind, text: kind === 'string' ? '' : kind === 'number' ? '0' : kind === 'boolean' ? 'false' : '{}' });
          }}><option value="string">{ui.stringValue}</option><option value="number">{ui.numberValue}</option>
            <option value="boolean">{ui.booleanValue}</option><option value="json">{ui.jsonValue}</option></select></label>
          <label>{ui.value}{row.kind === 'boolean' ? <select value={row.text}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => change({ text: event.currentTarget.value })}>
            <option value="true">{ui.trueValue}</option><option value="false">{ui.falseValue}</option></select>
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
      <select id={many ? undefined : props.id} aria-label={fieldText(props.messages, props.field).description}
        required={many || props.field.required} value={template?.key ?? ''}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => {
          const chosen = props.field.templates!.find(candidate => candidate.key === event.currentTarget.value);
          edit(index, chosen ? { [chosen.key]: templateDefaults(chosen.children) } : null);
        }}>
        <option value="">{ui.chooseTemplate}</option>
        {props.field.templates!.map(candidate => <option key={candidate.key} value={candidate.key}>{templateText(props.messages, candidate).name}</option>)}
      </select>
      {text?.hint && <p className="field-hint">{text.hint}</p>}
      {template && <Fields key={template.key} fields={template.children} value={value![template.key] as Record<string, unknown>}
        original={(original && Object.hasOwn(original, template.key) ? original[template.key] : undefined) as Record<string, unknown>}
        path={[...rowPath, template.key]} messages={props.messages} missing={props.missing}
        onChange={next => edit(index, { [template.key]: next })} />}
    </>;
  }
  if (!many) return editor(values[0], 0);
  return <div id={props.id} className="template-list">
    {values.map((value, index) => {
      const template = selection(value);
      const text = template && templateText(props.messages, template);
      return <div key={rows.current[index].id} className="collection-row">
        <details open={props.missing.some(path => path.startsWith(valuePath([...props.path, String(index)]) + '/')) || undefined}>
          <summary>{template ? label(template, value!) : ui.chooseTemplate}
            {text?.hint && !template!.hideHintInList && <span className="summary-hint">{text.hint}</span>}
          </summary>
          {editor(value, index)}
        </details>
        <button type="button" onClick={() => { rows.current.splice(index, 1); props.onChange(values.filter((_, at) => at !== index)); }}>{ui.removeRow}</button>
      </div>;
    })}
    {props.field.required && values.length === 0 && <input required value="" aria-label={ui.emptyCollection} onChange={() => {}} />}
    <button type="button" onClick={() => { rows.current.push({ id: serial.current++ }); props.onChange([...values, {}]); }}>{ui.addRow}</button>
  </div>;
}
