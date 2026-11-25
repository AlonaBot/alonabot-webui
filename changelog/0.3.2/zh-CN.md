# alonabot-webui 0.3.2 - 2026-11-23

### 修复

- 添加账号时，表单会带上 Adapter 声明的默认值。OneBot 11 默认使用正向连接，表单会显示 WebSocket 地址；媒体和机器人 QQ 号字段也有了易懂的名称 ([#18](https://github.com/AlonaBot/alonabot-webui/pull/18))。
- 插件详情只显示有内容的标签页。插件还没有数据库时，数据和存储显示为空列表；插件详情和总览在加载时用占位内容代替组件 ID ([#18](https://github.com/AlonaBot/alonabot-webui/pull/18))。
- 统一配置文件页的分组、标题和字段标签样式，修复选中标签和折叠按钮的显示问题 ([#18](https://github.com/AlonaBot/alonabot-webui/pull/18))。

### 移除

- 插件的完整 JSON 编辑入口已移除。请在「配置」标签页用表单修改配置 ([#18](https://github.com/AlonaBot/alonabot-webui/pull/18))。
