import { useMemo, useState, type JSX } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, Plus, X } from 'lucide-react';
import type { ConfigSnapshot, Package, ProfilePlugin } from '../api/admin';
import { OptionsFromControl, type ConfigFormProps } from '../components/ConfigForm';
import { useUI } from '../i18n/UI';
import { fieldsFromSchema } from '../schema/model';
import { ModelSelect } from './ModelSelect';
import { parseModels } from './modelConfig';
import { ProfileConfigEditor } from './PluginConfigPanel';
import { ProfileToolsPanel } from './ProfileToolsPanel';

const names = ['chat_model', 'image_caption_model', 'default_persona', 'triggers', 'wake_words', 'member_sessions'];

export function ProfileAISection({ profileID, agent, plugin, onChanged }: {
  profileID: string; agent: Package; plugin: ProfilePlugin; onChanged: () => void;
}): JSX.Element {
  const ui = useUI();
  return <div className="profile-ai-section">
    <ProfileConfigEditor key={agent.ID + ':' + profileID} id={agent.ID} profileID={profileID} onChanged={onChanged}
      renderForm={(form, snapshot) => <AIForm key={snapshot.active_generation + ':' + JSON.stringify(form.value)} form={form} snapshot={snapshot} profileID={profileID} plugin={plugin} />} />
    <div className="profile-section-group"><h3 className="profile-section-title">{ui.sectionTools}</h3><ProfileToolsPanel key={profileID} profileID={profileID} /></div>
  </div>;
}

function AIForm({ form, snapshot, profileID, plugin }: { form: ConfigFormProps; snapshot: ConfigSnapshot; profileID: string; plugin: ProfilePlugin }): JSX.Element {
  const ui = useUI();
  const [patch, setPatch] = useState<Record<string, unknown>>({});
  const [word, setWord] = useState('');
  const [personaOpen, setPersonaOpen] = useState(false);
  const fields = useMemo(() => fieldsFromSchema(snapshot.schema).filter(field => names.includes(field.key) && field.profile), [snapshot.schema]);
  const base = form.value as Record<string, unknown>;
  const value = (name: string) => Object.hasOwn(patch, name) ? patch[name] === null ? snapshot.active[name] : patch[name] : base[name];
  const change = (name: string, next: unknown) => setPatch(previous => ({ ...previous, [name]: next }));
  const inherited = (name: string) => Object.hasOwn(patch, name) ? patch[name] === null : !Object.hasOwn(plugin.overrides, name);
  const models = parseModels(snapshot.active).filter(model => model.type === 'chat');
  const modelOptions = (name: string) => {
    const candidates = models.filter(model => name !== 'image_caption_model' || model.image_input === true).map(model => ({ value: model.name, label: model.name }));
    const stored = value(name) as string;
    if (stored && !candidates.some(option => option.value === stored)) candidates.unshift({ value: stored, label: `${stored} · ${ui.optionNotFound}` });
    return [{ value: '', label: ui.none }, ...candidates];
  };
  const triggerValues = value('triggers') as string[];
  return <form onSubmit={event => { event.preventDefault(); form.onSubmit(patch); }}>
    {[['chat_model', 'image_caption_model'], ['default_persona', 'triggers', 'wake_words', 'member_sessions']].map((group, index) => <section className="profile-section-group" key={index}><h3 className="profile-section-title">{index === 0 ? ui.sectionModel : ui.sectionChat}</h3><div className="profile-card">
      {fields.filter(field => group.includes(field.key)).filter(field => field.key !== 'wake_words' || triggerValues.includes('wake_word')).map(field => <div className="profile-card-row" key={field.key}>
        <div className="profile-row-info"><span className="profile-row-title">{({ chat_model: ui.chatModel, image_caption_model: ui.imageCaptionModel, default_persona: ui.persona, triggers: ui.triggerModes, wake_words: ui.wakeWords, member_sessions: ui.memberSessions } as Record<string, string>)[field.key]}</span>
          {field.key === 'member_sessions' && <span className="profile-row-desc">{ui.memberSessionsDesc}</span>}
          {profileID !== 'default' && (inherited(field.key) ? <span className="profile-inherit-badge">{ui.followDefault}</span> : <button type="button" className="profile-inherit-btn" onClick={() => change(field.key, null)}>{ui.followDefault}</button>)}
        </div>
        {field.key === 'chat_model' || field.key === 'image_caption_model' ? <ModelSelect value={value(field.key) as string} label={field.key === 'chat_model' ? ui.chatModel : ui.imageCaptionModel} options={modelOptions(field.key)} onChange={next => change(field.key, next)} />
          : field.key === 'default_persona' ? <Popover.Root open={personaOpen} onOpenChange={setPersonaOpen}>
            <Popover.Trigger asChild><button type="button" className="model-select profile-persona-control" aria-label={ui.persona}><span>{value(field.key) as string || ui.none}</span><ChevronDown size={14} /></button></Popover.Trigger>
            <Popover.Portal><Popover.Content className="profile-persona-popover" align="end" sideOffset={6} collisionPadding={16}>
              <OptionsFromControl field={field} value={value(field.key)} onChange={next => { change(field.key, next); setPersonaOpen(false); }} attributes={{ 'aria-label': ui.persona }} optionsAPI={form.options!} />
              <button type="button" onClick={() => { change(field.key, ''); setPersonaOpen(false); }}>{ui.none}</button>
            </Popover.Content></Popover.Portal>
          </Popover.Root>
          : field.key === 'triggers' ? <div className="profile-trigger-pills">{(['mention', 'wake_word', 'private'] as const).map((mode, index) => <button type="button" key={mode} aria-pressed={triggerValues.includes(mode)} className={`profile-trigger-pill ${triggerValues.includes(mode) ? 'is-active' : ''}`} onClick={() => change('triggers', triggerValues.includes(mode) ? triggerValues.filter(item => item !== mode) : [...triggerValues, mode])}>{[ui.triggerMention, ui.triggerWakeWords, ui.triggerDirect][index]}</button>)}</div>
          : field.key === 'wake_words' ? <div className="profile-tag-editor"><div className="profile-tags-list">{(value('wake_words') as string[]).map((entry, index) => <span className="profile-tag-pill" key={index}>{entry}<button type="button" aria-label={`${ui.removeRow} ${entry}`} onClick={() => change('wake_words', (value('wake_words') as string[]).filter((_, at) => at !== index))}><X size={12} /></button></span>)}</div><div className="profile-tag-input-box"><input aria-label={ui.addWakeWord} placeholder={ui.addWakeWord} value={word} onChange={event => setWord(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (word) { change('wake_words', [...value('wake_words') as string[], word]); setWord(''); } } }} /><button type="button" aria-label={ui.addWakeWord} disabled={!word} onClick={() => { change('wake_words', [...value('wake_words') as string[], word]); setWord(''); }}><Plus size={14} /></button></div></div>
          : <label className="plugin-switch-label"><input type="checkbox" role="switch" aria-label={ui.memberSessions} checked={value('member_sessions') === true} onChange={event => change('member_sessions', event.target.checked)} /><span className="plugin-switch-slider" /></label>}
      </div>)}
    </div></section>)}
    {Object.keys(patch).length > 0 && <div className="config-form-actions"><button type="button" onClick={() => { setPatch({}); form.onDiscard?.(); }}>{ui.discard}</button><button type="submit" className="save-button">{ui.save}</button></div>}
  </form>;
}
