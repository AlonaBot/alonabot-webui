# AlonaBot 官方 WebUI

[![Go component](https://github.com/AlonaBot/alonabot-webui/actions/workflows/ci.yml/badge.svg)](https://github.com/AlonaBot/alonabot-webui/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

官方 WebUI通过 AlonaBot SDK 与 Core 通信，独立安装、升级和替换。组件版本为 `0.1.0`。
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

在运行中的 Core 上执行 `alonabot install --source AlonaBot/alonabot-webui --yes`。发行资产包含五平台包、`release.json`、签名和公钥。版本说明维护在 `changelog/<版本>/`。
