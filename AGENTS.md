# 开发入口

- 贡献、编码与测试提交规则：[本仓指南](CONTRIBUTING.zh-CN.md)及其引用的 Core 现行贡献指南。
- 改实现前读受影响代码、调用方和当前 diff，保留其他维护者改动；Git 写操作在独立 worktree，提交与远端操作按明确授权执行。
- 使用与能力：[使用指南](docs/usage.zh-CN.md)；环境、生成器和检查：[开发指南](docs/development.zh-CN.md)；打包：[发布指南](docs/releasing.zh-CN.md)。
- 文档与 GitHub 变更检查链接、YAML、脚本及 `git diff --check`；代码按开发指南运行 gofmt、vet、race、五平台 pure-Go 构建和 `alonabot check .`。WebUI 先 npm ci、typecheck、build，校验时需真实 dist/index.html。
- 新维护说明和代码注释用简体中文，日志与错误用英文；公开文档中英同步，依赖变更先获批准。
