import React, { useState, type JSX } from 'react';
import type { LucideIcon } from 'lucide-react';
import { SlidersHorizontal } from 'lucide-react';
import { ConfigForm } from './components/ConfigForm';
import { useUI } from './i18n/UI';
import chinese from '../i18n/zh-CN.json';
import collections from '../fixtures/collections.config_schema.json';
import pluginChinese from '../fixtures/i18n/zh-CN.json';
import nested from '../fixtures/nested.config_schema.json';
import secrets from '../fixtures/secrets.config_schema.json';
import templates from '../fixtures/templates.config_schema.json';

/** 路由条目定义。 */
export type RouteEntry = {
  id: string;
  path: string;
  label: string; /* 文案键 */
  icon: LucideIcon;
  group: 'main' | 'bottom';
  render: () => JSX.Element;
};

const secretSet = { $secret_set: true };
const formExamples = [
  {
    key: 'nested',
    label: 'fixtureNested',
    schema: nested,
    value: { welcome: 'Hello', reply: { prefix: '> ', mode: 'fast' }, level: 3, advanced: false, template: '' },
  },
  {
    key: 'secrets',
    label: 'fixtureSecrets',
    schema: secrets,
    value: { token: secretSet, backup: '', internal: 'v1', endpoint: 'https://example.com' },
  },
  {
    key: 'collections',
    label: 'fixtureCollections',
    schema: collections,
    value: { tags: ['news'], keywords: [], accounts: [{ name: 'demo', api_key: secretSet }], headers: {}, ratio: 0.5 },
  },
  {
    key: 'templates',
    label: 'fixtureTemplates',
    schema: templates,
    value: {
      music: { netease: { cookie: secretSet } },
      sources: [{ rss: { url: 'https://example.com/feed', every_minutes: 30 } }, { webhook: { token: secretSet } }],
    },
  },
] as const;

/** FormPreview 展示配置表单及提交生成的 Merge Patch。 */
function FormPreview(): JSX.Element {
  const ui = useUI();
  const [selected, setSelected] = useState(0);
  const [patch, setPatch] = useState<Record<string, unknown> | null>(null);
  const currentExample = formExamples[selected];

  return (
    <div className="dev-form-workspace">
      <div className="page-heading">
        <h1>{ui.pageTitle}</h1>
        <p>{ui.pageIntro}</p>
      </div>

      <nav className="fixture-tabs" aria-label={ui.fixtureLabel}>
        {formExamples.map((item, index) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={selected === index}
            onClick={() => {
              setSelected(index);
              setPatch(null);
            }}
          >
            {ui[item.label]}
          </button>
        ))}
      </nav>

      <div className="workspace">
        <section className="form-panel" aria-label={ui[currentExample.label]}>
          <ConfigForm
            key={currentExample.key}
            schema={currentExample.schema}
            value={currentExample.value}
            messages={ui === chinese.messages ? pluginChinese : {}}
            onSubmit={setPatch}
          />
        </section>
        <aside className="patch-panel">
          <h2>{ui.patchTitle}</h2>
          <p className="file-label">application/merge-patch+json</p>
          {patch === null ? (
            <p className="empty-patch">{ui.patchEmpty}</p>
          ) : (
            <pre aria-live="polite">{JSON.stringify(patch, null, 2)}</pre>
          )}
        </aside>
      </div>
    </div>
  );
}

/** routes 登记官方 WebUI 页面，开发环境包含表单预览。 */
export const routes: RouteEntry[] = import.meta.env.DEV
  ? [
      {
        id: 'dev-forms',
        path: '/dev/forms',
        label: 'pageTitle',
        icon: SlidersHorizontal,
        group: 'main',
        render: () => <FormPreview />,
      },
    ]
  : [];
