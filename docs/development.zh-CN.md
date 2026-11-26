# WebUI 源码开发

[English](development.md)

在 WebUI 仓库根目录执行；Go 版本由 `go.mod` 声明，Node 版本由 `package.json` 声明，本地由 asdf 管理。CLI 使用锁定 SDK 和当前组件工具链：

```fish
go mod download github.com/AlonaBot/AlonaBot
env GOTOOLCHAIN=(go env GOVERSION) go -C (go list -m -f '{{.Dir}}' github.com/AlonaBot/AlonaBot) install ./cmd/alonabot
```

前端开发：

```fish
npm ci
npm run dev
```

打开 Vite 输出的地址。`/dev/forms` 可以用本地 fixture 预览配置表单与 JSON Merge Patch。开发服务器把 `/api` 与 `/plugins` 转发到 `http://127.0.0.1:7650` 的 Core，并把 Host 与 Origin 改写为 Core 的来源：先启动 Core，在开发页登录（或先在 7650 登录，Cookie 不区分端口），改动前端后页面直接热更新并使用真实数据。WebUI 自己的 Go 后台仍是 Core 里已安装的版本，改后台要重新打包安装。路由登记在 `src/routes.tsx`，界面文案通过 `i18n/` 提供，主题与外壳复用 `src/theme/` 和 `src/shell/`。

```fish
npm run typecheck
npm run test
npm run build
```

生产静态文件输出到 `dist/`。官方 WebUI 还有 `New() *sdk.Plugin` 后台，使用受管 SQLite 保存统计、用户目录、商店缓存与已读版本；安装时静态资源和进程一起打包。先执行 `npm ci`、`npm run typecheck`、`npm run build`，确认真实 `dist/index.html` 后再运行 Go 与 CLI 检查：

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

将 target 换为需要的平台。完整联调时，先在独立终端运行 `alonabot run --data-dir ./data`，按[管理认证](https://github.com/AlonaBot/AlonaBot/blob/main/docs/management-api.zh-CN.md#core-设置与-http-入口)为 CLI 提供 token，再安装并启用上一步的本机 WebUI 包：

```fish
alonabot install ./bin/alonabot-webui-admin-0.3.2-darwin-arm64.tar.gz --data-dir ./data --yes
alonabot enable alonabot-webui-admin --data-dir ./data
```

包名随组件版本与 target 调整。打开 Core 的 `http://127.0.0.1:7650` 入口检查页面、后台与插件桥。只预览静态页面时可在构建前端后运行 `alonabot run . --data-dir ./data`；开发 WebUI 目录仅挂载静态资源，带 Go 后台的行为通过安装包验证。浏览器通过同源 Cookie/CSRF 调用 Admin API，WebUI 后台通过 SDK 与 Core 通信；后端接口见 [Core 管理 API](https://github.com/AlonaBot/AlonaBot/blob/main/docs/management-api.zh-CN.md#更新日志与-webui-后台)。

### 页面接入外壳

- 在 `src/routes.tsx` 的 `routes` 登记 `RouteEntry`：`id`、`path`、`label`、`icon: LucideIcon`、`group: 'main' | 'bottom'`、`render: () => JSX.Element`。`label` 填 `i18n/en-US.json` 与 `zh-CN.json` 均定义的 `messages` 键，供导航、顶栏标题和搜索共用。已登记总览、插件、账号、模型、配置文件、会话、日志、权限与系统设置，权限子页共用同一导航入口；`/dev/forms` 仅在开发模式登记。登录后访问 `/` 跳转 `/overview`，未登录访问管理页跳转 `/login`。
- 桌面侧栏将 `main` 条目的顺序、隐藏状态和侧栏折叠偏好保存在浏览器中，`bottom` 条目放在底部。侧栏以 `100vh` 固定高度贴顶，导航内部滚动，底部保留版本号与「关于」入口。手机固定入口按 `overview`、`plugins`、`profiles`、`logs` 的顺序取已登记的 `main` 条目；其余条目（含 `bottom`）只出现在「更多」，无剩余条目时省略「更多」。
- `AppShell({ version, onLogout?, coreUpdate?, coreUpdateFailed?, children })` 装配导航和搜索，页面由入口按路径选择后作为 `children` 传入；传入 `onLogout` 才显示退出入口。`coreUpdate` 为 `{ version, releaseURL }`，`coreUpdateFailed` 在侧栏更新处显示局部失败提示。站内跳转用 `router.ts` 的 `navigate(path, options?)` 或 `Link`。`Link` 的 props 为 `to`、可选的 `className` 和 `children`；手机「更多」使用 Radix 菜单项的 `onSelect` 调用 `navigate`。
- 已登记路由自动加入全局搜索，匹配当前语言的标题和路径。页面可通过 `SearchContext.register(items: SearchItem[]): () => void` 补充搜索项，卸载时调用返回的注销函数。搜索项包含 `id`、`title`、`section`、`run: () => void` 与可选 `keywords`；按标题和关键词做大小写不敏感的子串匹配，结果按 `section` 分组。按 Enter 或点击执行后清除查询、焦点和悬停状态。
- `useTheme(): [ThemeChoice, (choice: ThemeChoice) => void]` 提供主题选择接口，面向用户的控件由系统设置页接入。桌面搜索在透明顶栏右端，同排展开；收起时为 40×40，内容右边距为 40px。手机顶栏高 54px。配置表单与开发预览沿用原有结构、字体、尺寸和间距，颜色、背景、描边及原生控件 `color-scheme` 随主题更新。

插件详情提供详情页的数据库表格、KV/文件存储、导出与清空，以及 Agent 会话摘要与清除；Agent 页面提供会话正文。外壳保留配置、任务与插件页面入口，共用 `/permissions/users` 用户页。

父桥按 [插件页面指南](https://github.com/AlonaBot/AlonaBot/blob/main/docs/plugin-guide.zh-CN.md#插件页面) 在每次 `translate` 请求时用当前语言和请求参数返回 `text`；`hello` 交付语言、主题与令牌，`locale` 事件交付语言。浏览器验证用沙箱 iframe 验证 showcase 首次翻译、切换语言后重新取词、主题与快捷键转发。

配置文件的工具覆盖候选按现行 [`ToolPolicy` 定义](../src/api/policies.ts)的 `identities` 展开为独立工具与操作；同名两类分别编辑，仅有旧全局覆盖的空身份行没有新增候选。已保存的配置文件覆盖按原身份继续读写。配置与配置文件页面共用 `src/api/policies.ts` 的 `ToolPolicy.identities: ('tool' | 'operation')[]`。

配置页面使用 `PluginConfigPanel({id})` 与共享 `ConfigForm`：编辑基线为 `pending.config ?? active`，保存使用 `active_generation`，409 保留草稿并允许显式采用最新配置；secret 再认证、动态选项、回复示例及双语字段沿用同一表单。插件详情标签单行横滚，Agent 页面入口为 `pages/memory`（记忆），Core 数据标签保留。父桥在 layout effect 提前绑定，保留首次 hello 的主题与语言订阅。

本仓当前没有 `go:generate` 入口。CI 按改动路径选择前端、Go 与组件检查；纯文档只运行 Repository 提交范围空白检查。文档变更另核对链接，GitHub 配置核对 YAML 与脚本；本地执行 `git diff --check`。贡献与测试提交范围见 [CONTRIBUTING.zh-CN.md](../CONTRIBUTING.zh-CN.md)。

现有 GORM 依赖使用 `go.mod` 固定的上游正式版本。
