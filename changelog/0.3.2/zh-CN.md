# alonabot-webui 0.3.2 - 2026-11-23

### 修复

- 添加账号时，表单会带上 Adapter 声明的缺省值。OneBot 11 的连接模式默认为正向，WebSocket 地址字段随之显示；媒体目录、媒体地址、机器人 QQ 号等字段也有了中文名称。见 [PR #18](https://github.com/AlonaBot/alonabot-webui/pull/18)。
- 插件详情中，没有配置项、定时任务或数据库时，不再显示对应的标签页。组件还没有数据库文件时，数据与存储显示为空列表，不再报 `no such file or directory`。见 [PR #18](https://github.com/AlonaBot/alonabot-webui/pull/18)。
- 插件详情和总览在数据读回前显示占位，不再先显示组件 ID、再换成名称。见 [PR #18](https://github.com/AlonaBot/alonabot-webui/pull/18)。
- 界面显示（见 [PR #18](https://github.com/AlonaBot/alonabot-webui/pull/18)）：
  - 配置文件页的「模型」「对话」「工具」三组，标题和卡片的排布保持一致；
  - 页面标题和表单标签的字号保持一致；
  - 已修正标签选中线、插件卡片标题、折叠标题和图标按钮的显示问题。

### 移除

- 插件「高级」里的完整 JSON 配置编辑。请在「配置」标签页的表单里修改配置。

### 发行与升级

- 适用于 Core v0.3.0，可直接从 0.3.0 或 0.3.1 更新；配置与数据保留。
