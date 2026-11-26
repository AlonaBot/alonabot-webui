# 参与贡献

[English](CONTRIBUTING.md)

遵循本仓[编码规范](docs/coding-standards.zh-CN.md)（同步自 Core）与 Core [贡献流程](https://github.com/AlonaBot/AlonaBot/blob/main/CONTRIBUTING.zh-CN.md)。本组件变更提交到本仓；较大改动先在 Issue 确认方向，新增依赖先取得维护者明确批准。

代码注释、内部维护说明与 commit message 使用简体中文；日志、错误、标识符和 CLI 输出使用英文。公开使用与开发指南提供中英版本。PR 标题采用 `type/scope: 中文摘要`；[PR 模板](.github/PULL_REQUEST_TEMPLATE.md)接受中英文正文和确认项，记录实际验证与风险。

命名、边界校验、错误、兼容性和测试提交范围以编码规范为准，与 Core 不同之处见其「本仓差异」。提交覆盖真实入口的集成测试，临时单元与 SDK 边界检查留本地；PR 写明新增测试行数与本地结果。分享资料先移除凭据和真实用户数据；漏洞走[私密安全报告](https://github.com/AlonaBot/AlonaBot/security/advisories/new)，使用求助走[讨论区](https://github.com/AlonaBot/AlonaBot/discussions)。

## 本仓差异

公开入口为 `admin.go`，实现位于 `internal/admin/`。保留公共导入路径，生成资源先改生成源再重新生成。

具体工具链、生成器、前端和组件命令见[开发指南](docs/development.zh-CN.md)。CI 始终检查实际提交范围空白，再按路径选择 Go、前端与组件检查；WebUI 在组件校验前构建静态资源。

涉及跨组件行为时，与 Core 维护者协调组件锁文件与整合验证。[打包与发布](docs/releasing.zh-CN.md)说明维护者流程。

贡献采用 [MIT License](LICENSE)。
