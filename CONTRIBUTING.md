# 参与贡献

组件实现、文档与问题反馈在本仓库提交。先阅读 [Core 贡献流程](https://github.com/AlonaBot/AlonaBot/blob/main/CONTRIBUTING.md)与[编码规范](https://github.com/AlonaBot/AlonaBot/blob/main/docs/coding-standards.md)。较大改动先通过 Issue 确认接口与范围，新依赖先取得维护者批准。

PR 标题采用 `type/scope: 摘要`，例如 `fix/config: 修正配置读取`。正文说明问题、最终行为、实际验证与剩余风险，保留未运行项。代码注释、commit message 与文档使用简体中文；标识符、日志、错误和 CLI 输出使用英文。

按影响运行 `go test ./...`、`go build ./...`；WebUI 另运行 `npm ci`、`npm run typecheck` 和 `npm run build`。Core 协议与跨组件联调在主仓的 `tests/` 中验证。代码采用 AGPL-3.0-only，见 [LICENSE](LICENSE)。
