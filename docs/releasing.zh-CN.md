# 打包与发布

[English](releasing.md)

先按[开发指南](development.zh-CN.md)准备锁定 SDK 的 CLI。支持 linux/amd64、linux/arm64、windows/amd64、darwin/amd64、darwin/arm64 五目标。

```fish
npm ci
npm run typecheck
npm run build
alonabot check .
alonabot pack . --target linux/amd64 --out bin
```

维护者准备 `plugin.yaml` 和 `changelog/<版本>/en-US.md`、`zh-CN.md`。审查后发布匹配的 `v<版本>` tag。发布工作流核对版本、构建五平台归档、检查包内 LICENSE，并按 `## English`、`## 简体中文` 生成正文；跳过首个版本标题，分类统一为 `###`，保留正文和 fenced code。

发行资产提供各平台 `.tar.gz` 归档，源码下载由 GitHub 提供。Core 从包内 `plugin.yaml` 读取组件身份与版本并绑定仓库来源。正式组件安装或更新前先升级 Core v0.3.0；替换前停止组件并备份数据，保留组件 ID、来源和数据目录。

[Core 发行维护](https://github.com/AlonaBot/AlonaBot/blob/main/docs/releasing.md)
