# 参与贡献

组件实现、文档与问题反馈在本仓库提交。先阅读 [Core 贡献流程](https://github.com/AlonaBot/AlonaBot/blob/main/CONTRIBUTING.md)与[编码规范](https://github.com/AlonaBot/AlonaBot/blob/main/docs/coding-standards.md)。较大改动先通过 Issue 确认接口与范围，新依赖先取得维护者批准。

PR 标题采用 `type/scope: 摘要`，例如 `fix/config: 修正配置读取`。正文说明问题、最终行为、实际验证与剩余风险。代码注释、commit message 与文档使用简体中文；标识符、日志、错误和 CLI 输出使用英文。

根目录保留公开构造入口、组件声明与生成器资源；业务实现放在 `internal/`。现有公共包保持原导入路径。按改动影响选择以下命令：

```sh
npm ci
npm run typecheck
npm run build
go test -race ./...
CGO_ENABLED=0 go build ./...
go run github.com/AlonaBot/AlonaBot/cmd/alonabot check .
```

涉及组件生成资源或运行协议时，在 Core 仓库同步 `components.lock.json` 并执行对应的跨组件整合测试。

维护者在 `plugin.yaml` 和 `changelog/<版本>/en-US.md`、`zh-CN.md` 准备版本后，创建对应的 `v<版本>` tag。Release 工作流构建并上传五平台压缩包；正文由这两个 changelog 文件合成，源码下载由 GitHub 提供。本地打包使用：

```sh
go run github.com/AlonaBot/AlonaBot/cmd/alonabot pack . --target linux/amd64 --out /tmp/alonabot-package
```

代码采用 MIT，见 [LICENSE](LICENSE)。
