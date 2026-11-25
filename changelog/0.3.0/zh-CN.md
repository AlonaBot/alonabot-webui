# alonabot-webui 0.3.0 - 2026-11-23

首次领取令牌、源码构建、下载设置和会话访问需要 Core v0.3.0 引入的管理 API。

### 新增

- Docker 首次打开时直接弹出管理令牌，勾选「我已保存」后关闭并登录；登录页可选择在这台设备上保持登录 ([#10](https://github.com/AlonaBot/alonabot-webui/pull/10))。
- 商店支持切换插件源（GitHub、jsDelivr、自定义镜像），手动安装可上传归档、填写仓库或从源码构建，源码构建显示步骤与日志 ([#10](https://github.com/AlonaBot/alonabot-webui/pull/10))。
- 系统设置可配置 GitHub 下载镜像、API 地址、Go 工具链下载地址、GOPROXY 与网络代理 ([#9](https://github.com/AlonaBot/alonabot-webui/pull/9))。
- 模型页按提供商管理连接，模型单独挑选，支持自动发现、搜索、全选、全不选与反选。
- 配置文件的「平台与消息」新增会话访问：全部允许、只允许或屏蔽所选会话 ([#11](https://github.com/AlonaBot/alonabot-webui/pull/11))。
- 新增会话页面；账号配置可直接编辑，不再只能新增。
- Adapter 声明账号配置页面时，添加和编辑账号对话框显示「账号设置」，页面结果回填到表单后保存 ([#14](https://github.com/AlonaBot/alonabot-webui/pull/14))。

### 变更

- WebUI 支持深色模式和手机布局，侧栏可折叠和拖动排序。刷新时会保留原有内容 ([#10](https://github.com/AlonaBot/alonabot-webui/pull/10))。
- 插件扩展页面直接打开；插件配置按分组卡片显示，不再暴露 JSON。
- 密钥字段改为带显示开关的输入框，留空保留原值。
- 从源码构建时说明内存需求，并提供下载受阻时更换 GOPROXY 或配置代理的入口 ([#12](https://github.com/AlonaBot/alonabot-webui/pull/12))。

### 移除

- 系统设置不再编辑禁止的会话，改在配置文件的会话访问中设置 ([#11](https://github.com/AlonaBot/alonabot-webui/pull/11))。
