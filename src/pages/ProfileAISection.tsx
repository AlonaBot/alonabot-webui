import { useMemo, useState, type JSX } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Bot, ChevronDown, MessageCircle, Plus, RotateCcw, Sparkles, Wrench, X } from 'lucide-react';
import type { ConfigSnapshot } from '../api/config';
import type { Package } from '../api/packages';
import type { ProfilePlugin } from '../api/profiles';
import { OptionsFromControl, type ConfigFormProps } from '../components/ConfigForm';
import { useUI } from '../i18n/UI';
import { cn } from '../lib/cn';
import { fieldsFromSchema } from '../schema/model';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { SpotlightCard } from '../ui/SpotlightCard';
import { Switch } from '../ui/Switch';
import { parseModels } from './modelConfig';
import { ProfileConfigEditor } from './PluginConfigPanel';
import { ProfileToolsPanel } from './ProfileToolsPanel';

const AI_FIELD_NAMES = ['chat_model', 'image_caption_model', 'default_persona', 'triggers', 'wake_words', 'member_sessions'];

export function ProfileAISection({
  profileID,
  agent,
  plugin,
  onChanged,
}: {
  profileID: string;
  agent: Package;
  plugin: ProfilePlugin;
  onChanged: () => void;
}): JSX.Element {
  const ui = useUI();
  return (
    <div className="space-y-5">
      <ProfileConfigEditor
        key={`${agent.ID}:${profileID}`}
        id={agent.ID}
        profileID={profileID}
        onChanged={onChanged}
        renderForm={(form, snapshot) => (
          <AIForm
            key={`${snapshot.active_generation}:${JSON.stringify(form.value)}`}
            form={form}
            snapshot={snapshot}
            profileID={profileID}
            plugin={plugin}
          />
        )}
      />
      <SpotlightCard className="p-5">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <Wrench size={16} aria-hidden="true" />
          </span>
          <h3 className="text-base font-semibold text-[var(--color-ink)]">{ui.sectionTools}</h3>
        </div>
        <ProfileToolsPanel key={profileID} profileID={profileID} />
      </SpotlightCard>
    </div>
  );
}

function AIForm({
  form,
  snapshot,
  profileID,
  plugin,
}: {
  form: ConfigFormProps;
  snapshot: ConfigSnapshot;
  profileID: string;
  plugin: ProfilePlugin;
}): JSX.Element {
  const ui = useUI();
  const [patch, setPatch] = useState<Record<string, unknown>>({});
  const [word, setWord] = useState('');
  const [personaOpen, setPersonaOpen] = useState(false);

  const fields = useMemo(
    () => fieldsFromSchema(snapshot.schema).filter(field => AI_FIELD_NAMES.includes(field.key) && field.profile),
    [snapshot.schema],
  );
  const base = form.value as Record<string, unknown>;
  const value = (name: string): unknown =>
    Object.hasOwn(patch, name) ? (patch[name] === null ? snapshot.active[name] : patch[name]) : base[name];
  const change = (name: string, next: unknown): void => setPatch(previous => ({ ...previous, [name]: next }));
  const inherited = (name: string): boolean =>
    Object.hasOwn(patch, name) ? patch[name] === null : !Object.hasOwn(plugin.overrides, name);

  const models = parseModels(snapshot.active).filter(model => model.type === 'chat');
  const modelOptions = (name: string) => {
    const candidates = models
      .filter(model => name !== 'image_caption_model' || model.image_input === true)
      .map(model => ({ value: model.name, label: model.name }));
    const stored = String(value(name) ?? '');
    if (stored && !candidates.some(option => option.value === stored)) {
      candidates.unshift({ value: stored, label: `${stored} · ${ui.optionNotFound}` });
    }
    return [{ value: '', label: ui.none }, ...candidates];
  };

  // 新装的 Agent 尚未写入 triggers，按空列表处理。
  const triggerValues = (value('triggers') as string[] | undefined) ?? [];
  const wakeWords = (value('wake_words') as string[] | undefined) ?? [];
  const hasChanges = Object.keys(patch).length > 0;

  const titleByKey: Record<string, string> = {
    chat_model: ui.chatModel,
    image_caption_model: ui.imageCaptionModel,
    default_persona: ui.persona,
    triggers: ui.triggerModes,
    wake_words: ui.wakeWords,
    member_sessions: ui.memberSessions,
  };

  const groups = [
    { title: ui.sectionModel, icon: Bot, keys: ['chat_model', 'image_caption_model'] },
    { title: ui.sectionChat, icon: MessageCircle, keys: ['default_persona', 'triggers', 'wake_words', 'member_sessions'] },
  ] as const;

  const addWakeWord = (): void => {
    const trimmed = word.trim();
    if (!trimmed) return;
    if (!wakeWords.includes(trimmed)) {
      change('wake_words', [...wakeWords, trimmed]);
    }
    setWord('');
  };

  return (
    <form
      className="space-y-5"
      onSubmit={event => {
        event.preventDefault();
        form.onSubmit(patch);
      }}
    >
      {groups.map(group => {
        const GroupIcon = group.icon;
        const visibleFields = fields
          .filter(field => (group.keys as readonly string[]).includes(field.key))
          .filter(field => field.key !== 'wake_words' || triggerValues.includes('wake_word'));
        if (visibleFields.length === 0) return null;
        return (
          <SpotlightCard key={group.title} className="p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                <GroupIcon size={16} aria-hidden="true" />
              </span>
              <h3 className="text-base font-semibold text-[var(--color-ink)]">{group.title}</h3>
            </div>

            <div className="divide-y divide-[var(--color-line)]/70">
              {visibleFields.map(field => {
                const isInherited = inherited(field.key);
                return (
                  <div
                    key={field.key}
                    className="flex flex-col gap-3 py-4 first:pt-1 last:pb-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-[var(--color-ink)]">{titleByKey[field.key]}</span>
                        {profileID !== 'default' &&
                          (isInherited ? (
                            <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-ink-muted)]">
                              {ui.followDefault}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => change(field.key, null)}
                              className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--color-accent)_35%,transparent)] bg-[var(--color-accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-accent-strong)] transition-colors hover:brightness-105"
                            >
                              <RotateCcw size={11} aria-hidden="true" />
                              {ui.followDefault}
                            </button>
                          ))}
                      </div>
                      {field.key === 'member_sessions' && (
                        <p className="text-xs leading-relaxed text-[var(--color-ink-muted)]">{ui.memberSessionsDesc}</p>
                      )}
                    </div>

                    <div className="shrink-0 sm:max-w-[340px]">
                      {field.key === 'chat_model' || field.key === 'image_caption_model' ? (
                        <Select
                          variant="filled"
                          className="w-full min-w-[200px] sm:w-[240px]"
                          value={String(value(field.key) ?? '')}
                          aria-label={titleByKey[field.key]}
                          options={modelOptions(field.key)}
                          onValueChange={next => change(field.key, next)}
                        />
                      ) : field.key === 'default_persona' ? (
                        <Popover.Root open={personaOpen} onOpenChange={setPersonaOpen}>
                          <Popover.Trigger asChild>
                            <button
                              type="button"
                              aria-label={ui.persona}
                              className="inline-flex h-9 w-full min-w-[200px] items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-transparent bg-[var(--color-surface-2)] px-3 text-sm text-[var(--color-ink)] transition-colors hover:border-[var(--color-line)] sm:w-[240px]"
                            >
                              <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                                <Sparkles size={13} className="shrink-0 text-[var(--color-accent)]" aria-hidden="true" />
                                <span className="truncate">{String(value(field.key) || ui.none)}</span>
                              </span>
                              <ChevronDown size={14} className="shrink-0 text-[var(--color-ink-muted)]" />
                            </button>
                          </Popover.Trigger>
                          <Popover.Portal>
                            <Popover.Content
                              align="end"
                              sideOffset={6}
                              collisionPadding={16}
                              className="alona-glass-elevated z-[var(--z-popover)] w-[280px] space-y-2 rounded-2xl p-3 shadow-[var(--shadow-popover)]"
                            >
                              {form.options && (
                                <OptionsFromControl
                                  field={field}
                                  value={value(field.key)}
                                  onChange={next => {
                                    change(field.key, next);
                                    setPersonaOpen(false);
                                  }}
                                  attributes={{ 'aria-label': ui.persona }}
                                  optionsAPI={form.options}
                                />
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="w-full justify-start"
                                onClick={() => {
                                  change(field.key, '');
                                  setPersonaOpen(false);
                                }}
                              >
                                {ui.none}
                              </Button>
                            </Popover.Content>
                          </Popover.Portal>
                        </Popover.Root>
                      ) : field.key === 'triggers' ? (
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label={ui.triggerModes}>
                          {(['mention', 'wake_word', 'private'] as const).map((mode, index) => {
                            const active = triggerValues.includes(mode);
                            const modeLabel = [ui.triggerMention, ui.triggerWakeWords, ui.triggerDirect][index];
                            return (
                              <button
                                key={mode}
                                type="button"
                                aria-pressed={active}
                                onClick={() =>
                                  change(
                                    'triggers',
                                    active
                                      ? triggerValues.filter(item => item !== mode)
                                      : [...triggerValues, mode],
                                  )
                                }
                                className={cn(
                                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150',
                                  active
                                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)] shadow-xs'
                                    : 'border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-ink-muted)] hover:border-[var(--color-accent)]/40 hover:text-[var(--color-ink)]',
                                )}
                              >
                                {modeLabel}
                              </button>
                            );
                          })}
                        </div>
                      ) : field.key === 'wake_words' ? (
                        <div className="flex flex-col items-stretch gap-2 sm:items-end">
                          {wakeWords.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 sm:justify-end">
                              {wakeWords.map((entry, index) => (
                                <span
                                  key={`${entry}-${index}`}
                                  className="inline-flex items-center gap-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] py-1 pr-1.5 pl-2.5 text-xs font-medium text-[var(--color-ink)]"
                                >
                                  <span>{entry}</span>
                                  <button
                                    type="button"
                                    aria-label={`${ui.removeRow} ${entry}`}
                                    onClick={() =>
                                      change(
                                        'wake_words',
                                        wakeWords.filter((_, at) => at !== index),
                                      )
                                    }
                                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--color-ink-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-danger)_16%,transparent)] hover:text-[var(--color-danger)]"
                                  >
                                    <X size={11} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              aria-label={ui.addWakeWord}
                              placeholder={ui.addWakeWord}
                              value={word}
                              onChange={event => setWord(event.target.value)}
                              onKeyDown={event => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  addWakeWord();
                                }
                              }}
                              className="h-9 min-w-[160px] flex-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
                            />
                            <Button
                              size="sm"
                              variant="soft"
                              iconOnly
                              aria-label={ui.addWakeWord}
                              disabled={!word.trim()}
                              onClick={addWakeWord}
                            >
                              <Plus size={14} />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Switch
                          aria-label={ui.memberSessions}
                          checked={value('member_sessions') === true}
                          onCheckedChange={checked => change('member_sessions', checked)}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </SpotlightCard>
        );
      })}

      {/* 悬浮保存条 */}
      {hasChanges && (
        <div className="alona-glass-elevated sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 shadow-[var(--shadow-popover)]">
          <span className="text-xs font-medium text-[var(--color-ink-muted)]">{ui.unsavedChanges}</span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setPatch({});
                form.onDiscard?.();
              }}
            >
              {ui.discard}
            </Button>
            <Button type="submit" size="sm" variant="primary">
              {ui.save}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
