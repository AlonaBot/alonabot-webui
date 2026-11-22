# AlonaBot 官方 WebUI

[![Go component](https://github.com/AlonaBot/alonabot-webui/actions/workflows/ci.yml/badge.svg)](https://github.com/AlonaBot/alonabot-webui/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

官方 WebUI通过 AlonaBot SDK 与 Core 通信，独立安装、升级和替换。组件版本为 `0.2.0`。
## 开发

需要 Go 1.27.1。SDK 版本固定在 `go.mod`；GORM 使用上游正式版本。
先执行 `npm ci`、`npm run typecheck`、`npm run build`，再构建 Go 后台。前端入口位于 `src/`，翻译位于 `i18n/`。

```sh
go mod download
go test ./...
go build .
```

使用 Core CLI 从工程根目录打包：

```sh
alonabot check .
alonabot pack . --target linux/amd64 --out bin
```

[Core 开发指南](https://github.com/AlonaBot/AlonaBot/blob/main/docs/development.md)说明协议、调试和整合验证；[插件指南](https://github.com/AlonaBot/AlonaBot/blob/main/docs/plugin-guide.md)说明依赖和存储约定。

## 贡献

向本仓库提交组件变更，PR 标题采用 `fix/scope: 中文摘要` 等 `type/scope: 摘要` 形式。代码注释与文档使用简体中文，程序日志和错误使用英文。新依赖须先取得维护者批准；按影响运行检查并在 PR 中记录结果。

## 许可

采用 [MIT](LICENSE)。

## 目录

根包提供公开构造入口，`internal/admin/` 保存组件实现。`plugin.yaml`、Schema 与 i18n 是工程打包入口。

## 安装与发行

在运行中的 Core 上执行 `alonabot install --source AlonaBot/alonabot-webui --yes`。发行资产仅包含五平台压缩包，源码下载由 GitHub 提供。版本说明维护在 `changelog/<版本>/`。

## 新 SDK 联调与升级

插件与 Agent 的配置 Schema 使用 `plugin_config_schema.json`。Go 源文件名自由，包级 `New` 保持现行签名。旧 `config_schema.json` 须改名并用新 SDK 重建。升级先停用旧组件、升级 Core，再更新组件包并启用；配置值与用户数据保留。

新 SDK 发布前，通过本机临时 `go.work` 同时 `use` Core 和本组件 worktree，执行 `go test`、`go build` 和本地 Core CLI 的 `check`。`pack` 会使用临时 modfile，需在独立临时源码副本中添加指向本地 Core 的 `replace`，设置 `GOWORK=off` 后打包；保留原 worktree 的 `go.mod`。正式发行前将 `go.mod` 中 SDK 固定到真实发布版本，重新构建五平台归档，组件发布后再更新 Core 的 `components.lock.json`。

For local integration before the SDK release, use a temporary `go.work` containing Core and this component, then run Go checks and the locally built Core CLI's `check`. For `pack`, add a local Core `replace` in a disposable source copy and set `GOWORK=off`, preserving the original worktree's module declarations. Pin the published SDK before releasing rebuilt packages. Disable the old component, upgrade Core, update the component package, then enable it; configuration values and user data are retained. Adapter instance Schemas keep `adapter_config_schema.json`; plugin and Agent Schemas use `plugin_config_schema.json`.
