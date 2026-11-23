# WebUI development

[简体中文](development.zh-CN.md)

Run commands from this repository root. `go.mod` declares Go and pins the SDK; `package.json` declares Node. Manage local runtimes with asdf. Build the CLI with the component's toolchain:

```fish
go mod download github.com/AlonaBot/AlonaBot
env GOTOOLCHAIN=(go env GOVERSION) go -C (go list -m -f '{{.Dir}}' github.com/AlonaBot/AlonaBot) install ./cmd/alonabot
```

The existing GORM dependency uses upstream releases pinned in `go.mod`.

## Preview and build

```fish
npm ci
npm run dev
```

Open the address printed by Vite. `/dev/forms` previews configuration forms and JSON Merge Patch using local fixtures. The dev server forwards `/api` and `/plugins` to Core at `http://127.0.0.1:7650` and rewrites Host and Origin to Core's origin: start Core, sign in on the dev page (or sign in at 7650 first; cookies are not port-specific), and front-end edits hot-reload against real data. The WebUI's own Go backend is still the version installed in Core; repack and reinstall after backend changes. Routes live in `src/routes.tsx`, translations in `i18n/`, and reusable theme/shell elements in `src/theme/` and `src/shell/`.

```fish
npm run typecheck
npm run test
npm run build
```

Production assets go to `dist/`. WebUI also has a `New() *sdk.Plugin` backend using managed SQLite for statistics, user directories, store caches, and read-version state. Installation packages static assets and the process together. Run `npm ci`, `npm run typecheck`, and `npm run build` first, then verify that `dist/index.html` exists before Go and CLI checks:

```fish
gofmt -l (git ls-files '*.go')
go vet ./...
go test -race ./...
for target in linux/amd64 linux/arm64 windows/amd64 darwin/amd64 darwin/arm64
    set -l parts (string split / $target)
    env GOOS=$parts[1] GOARCH=$parts[2] CGO_ENABLED=0 go build ./...
end
alonabot check .
alonabot build .
alonabot pack . --target darwin/arm64 --out bin
```

Choose the target you need. For full integration, start `alonabot run --data-dir ./data` in a separate terminal, provide the CLI token following [management authentication](https://github.com/AlonaBot/AlonaBot/blob/main/docs/deployment.md#core-settings-and-http-entry-point), then install and enable the local package:

```fish
alonabot install ./bin/alonabot-webui-admin-0.2.0-darwin-arm64.tar.gz --data-dir ./data --yes
alonabot enable alonabot-webui-admin --data-dir ./data
```

Adjust the package version and target. Open Core at `http://127.0.0.1:7650` to check pages, backend, and the plugin bridge. To preview only static pages, build the frontend and use `alonabot run . --data-dir ./data`. A development WebUI directory mounts static assets; verify the Go backend through an installed package. Browsers call the Admin API with same-origin Cookie/CSRF authentication; the backend communicates with Core through the SDK. See the current [Core management API](https://github.com/AlonaBot/AlonaBot/blob/main/docs/deployment.md#changelog-and-webui-backend).

## Add pages to the shell

Register a `RouteEntry` in `src/routes.tsx`: `id`, `path`, `label`, `icon: LucideIcon`, `group: 'main' | 'bottom'`, and `render: () => JSX.Element`. `label` is a `messages` key present in both `i18n/en-US.json` and `zh-CN.json`; navigation, titles, and search share it. Routes include overview, plugins, accounts, models, profiles, conversations, logs, permissions, and system settings. Permission subpages share one navigation entry. `/dev/forms` is development-only. Signed-in `/` redirects to `/overview`; unauthenticated management access redirects to `/login`.

The desktop sidebar stores `main` ordering, hidden entries, and collapse preferences in the browser. `bottom` entries stay at the bottom. The sidebar is fixed at the top with `100vh` height, internal navigation scrolling, and version/About entries below. Mobile uses registered `main` entries in `overview`, `plugins`, `profiles`, `logs` order; other entries, including `bottom`, appear in More. More is omitted when no entries remain.

`AppShell({ version, onLogout?, coreUpdate?, coreUpdateFailed?, children })` assembles navigation and search. The entry point selects a page by path and passes it as `children`. Logout appears when `onLogout` is supplied. `coreUpdate` is `{ version, releaseURL }`; `coreUpdateFailed` shows a local failure beside the sidebar update. Navigate with `router.ts`'s `navigate(path, options?)` or `Link`. `Link` takes `to`, optional `className`, and `children`. Mobile More uses Radix menu-item `onSelect` to call `navigate`.

Registered routes automatically join global search using the current-language title and path. Pages add entries with `SearchContext.register(items: SearchItem[]): () => void` and call the returned unregister function on unmount. Entries contain `id`, `title`, `section`, `run: () => void`, and optional `keywords`. Search matches case-insensitive title/keyword substrings and groups results by `section`. Enter or click runs the action and clears query, focus, and hover state.

`useTheme(): [ThemeChoice, (choice: ThemeChoice) => void]` provides theme selection through system settings. Desktop search expands inline at the right of the transparent top bar; its collapsed size is 40×40 with a 40px content right margin. The mobile top bar is 54px high. Forms and development previews retain their structure, fonts, sizing, and spacing while theme changes update colors, backgrounds, outlines, and native-control `color-scheme`.

Plugin details expose database tables, KV/file storage, export/clear, and Agent conversation summaries/clearing. Agent pages show conversation contents. The shell retains configuration, job, and plugin-page entries and shares `/permissions/users`.

## Plugin bridge and configuration state

Following the [plugin-page guide](https://github.com/AlonaBot/AlonaBot/blob/main/docs/plugin-guide.md#plugin-pages), the parent bridge answers each `translate` request with `text` using current language and request arguments. `hello` supplies language, theme, and token; `locale` supplies language updates. Browser verification uses a sandbox iframe to check initial showcase translation, fresh translations after language changes, themes, and shortcut forwarding.

Profile tool-override candidates expand `identities` from the current [`ToolPolicy` definition](../src/api/policies.ts) into separate tools and operations. Identically named entries of both types are edited separately. Empty-identity rows representing only legacy global overrides add no candidates; saved profile overrides continue reading/writing under their original identities. Configuration and profile pages share `src/api/policies.ts`'s `ToolPolicy.identities: ('tool' | 'operation')[]`.

Configuration pages use `PluginConfigPanel({id})` and shared `ConfigForm`. The editing baseline is `pending.config ?? active`; saves use `active_generation`. A 409 retains the draft and permits explicitly adopting current configuration. Secret reauthentication, dynamic options, reply examples, and bilingual fields use the same form. Plugin-detail tabs scroll horizontally on one row. The Agent page entry is `pages/memory`; Core data tabs remain. The parent bridge binds in a layout effect to retain first-hello theme and language subscriptions.

This repository currently has no `go:generate` entry. CI selects frontend, Go, and component checks by changed paths; docs-only changes run Repository's commit-range whitespace check. Check links for documentation and YAML/scripts for GitHub changes; run `git diff --check` locally. Contribution and test submission rules are in [CONTRIBUTING.md](../CONTRIBUTING.md).
