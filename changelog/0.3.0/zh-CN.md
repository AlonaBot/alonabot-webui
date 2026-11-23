# alonabot-webui 0.3.0 - 2026-11-23

### 新增

- Docker 首次打开时直接弹出管理令牌，勾选「我已保存」后关闭并登录；登录页可选择在这台设备上保持登录。见 [PR #10](https://github.com/AlonaBot/alonabot-webui/pull/10)。
- 商店支持切换插件源（GitHub、jsDelivr、自定义镜像），手动安装可上传归档、填写仓库或从源码构建，源码构建显示步骤与日志。见 [PR #10](https://github.com/AlonaBot/alonabot-webui/pull/10)。
- 系统设置可配置 GitHub 下载镜像、API 地址、Go 工具链下载地址、GOPROXY 与网络代理。见 [PR #9](https://github.com/AlonaBot/alonabot-webui/pull/9)。
- 模型页按提供商管理连接，模型单独挑选，支持自动发现、搜索、全选、全不选与反选。
- 配置文件的「平台与消息」新增会话访问：全部允许、只允许或屏蔽所选会话。见 [PR #11](https://github.com/AlonaBot/alonabot-webui/pull/11)。
- 新增会话页面；账号配置可直接编辑，不再只能新增。
- Adapter 声明账号配置页面时，添加和编辑账号对话框显示「账号设置」，页面结果回填到表单后保存。见 [PR #14](https://github.com/AlonaBot/alonabot-webui/pull/14)。

### 变更

- 界面按原型重做：自定义下拉、开关、复选框与对话框取代原生控件，操作结果改用自动消失的提示，刷新时保留原内容，侧栏可折叠与拖动排序，并支持深色模式和手机布局。见 [PR #10](https://github.com/AlonaBot/alonabot-webui/pull/10)。
- 插件扩展页面直接打开；插件配置按分组卡片显示，不再暴露 JSON。
- 密钥字段改为带显示开关的输入框，留空保留原值。
- 从源码构建时说明内存需求，并提供下载受阻时更换 GOPROXY 或配置代理的入口。见 [PR #12](https://github.com/AlonaBot/alonabot-webui/pull/12)。

### 移除

- 系统设置不再编辑禁止的会话，改在配置文件的会话访问中设置。见 [PR #11](https://github.com/AlonaBot/alonabot-webui/pull/11)。

### 发行与升级

- SDK 与打包器固定到 Core 提交 `25a0f851099f`（`v0.2.1-0.20261123105642-25a0f851099f`）。
- 安装或更新本版前先升级 Core v0.3.0；首启令牌、源码构建、下载设置与会话访问依赖 Core v0.3.0 的管理 API。
