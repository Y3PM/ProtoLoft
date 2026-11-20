# 开发资料与交接

本目录由 Codex 和 Gemini/Antigravity 共用，不上传 FTP。项目规则以根目录 [AGENTS.md](../AGENTS.md) 为准；使用其他工具接手时，也应先要求它阅读这两份文件。

## 目录

- `tests/`：可复用回归脚本，仅在临时安装与合成数据上执行。
- `docs/`：开发文档及 `docs/reviews/` 审查证据；[MCP 开发说明](docs/mcp.md)。
- [CHANGELOG.md](CHANGELOG.md)：项目历史与本轮变更。
- `tmp/`、`screenshots/`：按需创建的临时产物与截图目录，不提交 Git；需要保留的验收图片应放入对应的审查资料目录。

根目录原有 `scratch/` 已迁至 `.dev/tests/`，`docs/` 已迁至 `.dev/docs/`，`CHANGELOG.md` 已迁至 `.dev/CHANGELOG.md`。历史审查记录保留当时的命令和路径，不代表这些旧位置现在仍存在；早期 Gemini 会话中的脚本仍在其原会话目录。

## 验证命令

以下命令均在项目根目录运行。PHP 需具备 `pdo_sqlite`、`zip`、`mbstring` 扩展，将 `/path/to/php` 换为实际可执行文件；也可使用一键执行器自动探测：

```sh
# 一键运行全量测试套件（自动探测 PHP 环境，支持 --php /path/to/php）
python3 -B .dev/tests/run_all_tests.py

# 单独运行各领域专项套件：
python3 -B .dev/tests/comprehensive_e2e_regression.py --php /path/to/php
node .dev/tests/security_frontend_regression.js
node .dev/tests/copy_consistency_frontend.js
node .dev/tests/preferences_frontend_regression.js
node .dev/tests/profile_mcp_frontend_regression.js
python3 -B .dev/tests/security_regression.py --php /path/to/php
python3 -B .dev/tests/security_round2_regression.py --php /path/to/php
python3 -B .dev/tests/dashboard_regression.py --php /path/to/php
python3 -B .dev/tests/mcp_collaboration_regression.py --php /path/to/php
python3 -B .dev/tests/ftp_layout_regression.py --php /path/to/php
python3 -B .dev/tests/notification_copy_regression.py --php /path/to/php

# 协作权限：全员/指定成员模式、版本归属与工作交接
python3 -B .dev/tests/project_owners_regression.py --php /path/to/php
python3 -B .dev/tests/handover_verification.py --php /path/to/php
python3 -B .dev/tests/project_owners_and_publish_browser.py --php /path/to/php --playwright-module /path/to/playwright

# 已有 Playwright 与 Chrome 环境：四角色批注跳转浏览器专项
python3 -B .dev/tests/annotation_jump_browser.py --php /path/to/php --playwright-module /path/to/playwright

# 批注抽屉：项目/版本切换、上版未决请求乱序、引用与纸面年龄样式
python3 -B .dev/tests/annotation_drawer_context_browser.py --php /path/to/php --playwright-module /path/to/playwright

# 水印：工作台/分享页四角色、隔行错位像素、长姓名、秒级更新与点击穿透
python3 -B .dev/tests/watermark_layout_browser.py --php /path/to/php --playwright-module /path/to/playwright

# 审批通知下拉：成员与个人通知 Webhook 保存后的即时状态同步
python3 -B .dev/tests/approval_webhook_sync_browser.py --php /path/to/php --playwright-module /path/to/playwright

# 一键导出纯净生产发布包（自动生成 release/protoloft/ 纯净目录与 release/protoloft-v{version}.zip 压缩包）
python3 .dev/export_release.py



# 控制中心规格与多屏幕尺寸自适应（2K / 1080P / Laptop）
python3 -B .dev/tests/admin_console_scale_browser.py --php /path/to/php --playwright-module /path/to/playwright

# 单页生命周期内全站下拉选项与状态同步专项（审批名单 / 文件夹筛选 / 发版项目 / 看板筛选 / 全局通道）
python3 -B .dev/tests/dropdown_sync_regression_browser.py --php /path/to/php --playwright-module /path/to/playwright
```

前端脚本执行实际业务 JS，但使用模拟 DOM/网络，不是浏览器验收。Python 套件执行临时安装的真实 HTTP 请求，默认清理临时数据；只有明确需要调试时才使用 `--keep`，保留的副本可能含测试凭据。官方 MCP SDK 互通验证另见 `docs/mcp.md`，SDK 只能在项目外临时安装，不能成为生产依赖。

## 交接方式

2026-11-20 最新：[外发授权文案记录](docs/reviews/2026-11-20-collaboration-share-copy.md)。协作权限选择器及列表提示跟随协作者外发授权，角色保存成功后即时更新；不以管理员个人分享特权替代协作者配置。已完成 FTP 两项文件校验和 HTTPS 3/3 检查。

2026-11-20 最新：[协作权限更新记录](docs/reviews/2026-11-20-collaboration-scope-a.md)。采用已确认方案 A：先选所有协作者或指定成员，指定模式才显示名单且至少选一人；项目列表按权限范围表达。已部署 FTP，程序文件 5/5 回读及匿名 HTTPS 5/5 检查通过。

2026-11-20 项目负责人模型与发布入口复核见 [负责人审查与修复记录](docs/reviews/2026-11-20-project-owners-review.md)。指定名单控制发版权限；创建者保留负责人范围与整项目删除的管理权。指定负责人也计入工作交接与成员删除保护。已按用户授权完成 FTP 部署，程序文件 10/10 回读校验、匿名 HTTPS 5/5 检查通过；生产多角色操作待用户验收。

开始前检查 `git status`、相关差异和最近记录；同一文件避免并行编辑。完成后在变更记录或对应审查文档中写明改动范围、实际执行的命令与结果，以及尚未验证的内容。没有运行的检查不得沿用历史结果写成通过。

## 最近状态 · 2026-11-10

更新：水印采用用户确认的 B 方案，文字倾斜 -25°，相邻行错开半格；工作台与分享页共用 `assets/js/watermark.js`，保留浅灰透明度与秒级更新。文字包围盒决定长姓名的间距，数字宽度预留避免时间刷新导致布局跳动，跨边界补画避免平铺接缝截字。Chrome 专项 48 项通过（1440×1000 工作台/分享页，390×844 分享页，1×/2× 像素密度）；全量 23 套、938 项断言通过。Browser plugin not available，使用现有 Playwright/Chrome 157；记录的 13 条同源 iframe 提示符合项目受信内部原型边界，无应用运行错误。截图已观察，临时证据在 `.dev/tmp/watermark-layout-b-20261110/`。390px 分享页顶栏有既有控件重叠，不据本次水印检查宣称整站移动布局通过。测试 PHP 为 8.3.20，未验证 PHP 7.0 或生产部署，尚待用户视觉验收。

更新：批注抽屉切换串内容已修复。切项目重置为当前版全部；同项目切版本时，上版未决重新读取，没有上一版则回到全部；两套列表通过真正的隐藏规则互斥，空项目不再从旧 iframe 推断版本。历史卡片按创建时间分三档浅纸色，保留清晰正文与操作。专项与边界见 [抽屉上下文修复记录](docs/reviews/2026-11-10-annotation-drawer-context.md)。桌面已观察；390px 工作台存在既有布局裁切，不能据卡片内部无溢出宣称整站移动端验收通过。

更新：2026-11-10 定版前全面审查清单（`docs/reviews/2026-11-10-prerelease-fix-checklist.md`）已全部完成修复并闭环：
1. P1 核心项：测试套件沙箱存根补齐（恢复 23/23 全绿）、全角色外链复制可用（清除 `copyTextToClipboard` 引用报错）、发版上传中关闭弹窗拦截二次确认与防死锁、驳回申请物理清理防止僵尸账号与邮箱烧毁、访客申请 5次/15分钟频控、PHP 7.0–7.2 Cookie 属性补齐与 session strict/regenerate_id 防固定；
2. P2 核心项：`save_settings` 守卫与显式空占位防误清空、Webhook Markdown 保留字符转义（`mdEscape`）防注入、`apiFetch` 互斥 key 覆盖 ids/code 防并发丢笔、发版下拉联动真实入口 `onUploadItemSelectChange`、管理员代填 Webhook 白名单校验、分享 Cookie HMAC 独立随机盐持久化、SVG 上传通用事件属性拦截防 SMIL XSS 绕过、清理 `item_share_disabled_{id}` 孤儿 settings 键；
3. P3 核心项：撤销短码/清空日志/排序等假成功修正、PDO 底层异常安全收拢、URL hash 换行转义修正；
4. 验证：全量 23 套自动化套件 937 项断言全部 PASS (100%)，浏览器下拉同步 16 项与 Webhook 同步 24 项全部 PASS。

更新：2026-11-10 已彻底闭环修复 Codex 复核报告（`docs/reviews/2026-11-10-gemini-dropdown-recheck.md`）指出的 4 类深层边界缺陷（5 个边界场景）：
1. 审批通知人以持久化选择为基准，停用后重新启用正确保持勾选，杜绝“界面未选、后台仍投递”的矛盾；
2. 评审看板版本筛选联动更新 `currentAnnoVerFilter` 并重绘画布，删除版本同步清洗 `DASHBOARD_DATA.annos` 批注快照；
3. 删除当前正被筛选的项目时，在选项移除前预先捕获，安全重置为“全部项目（0）”并清空批注缓存；
4. 修复系统设置保存回调中笔误调用的卡片更新函数，准确调用 `updateUploadNotifyState()`，慢响应并发下即时激活发版通道。
Codex 专项（5 个场景）、既有 Webhook 专项（24 项）、下拉同步专项（16 项）、控制中心多分辨率专项（27 项）与前端护栏全部 100% 通过。

更新：2026-11-10 已按推荐方案优化 2K 显示器下控制中心弹窗宽度为 `clamp(1040px, 62vw, 1240px)`，彻底消除大屏横向扫视疲劳；多分辨率专项 27 项通过。同时闭环修复单页全站下拉同步缺口（5 类 15 个场景全解决），新增浏览器专项 16 项通过。

更新：2026-11-07 已恢复用户确认的版本管理卡片流，保留最新权限与状态同步；统一入口现为 19 套，版本渲染专项已纳入，真实 Chrome 验证命令见 [版本弹窗恢复](docs/reviews/2026-11-07-version-modal-recovery.md)。恢复仅按局部差异执行，不得再用旧表格脚本覆盖卡片容器。

更新：2026-11-06 已按最后确认的需求恢复个人 MCP、成员弹窗、文件夹/RP 上传和评审看板，保留最新角色权限及宽版版本表，并修正新建后的发布目标与发布后的版本状态同步。交接以 [状态归一记录](docs/reviews/2026-11-06-state-reconciliation.md) 为准；不要从旧模板整文件覆盖。统一入口现纳入 15 套回归；真实 Chrome 命令、FTP 干净源码前提及剩余架构项见该记录。`http://127.0.0.1:8765/` 为当前工作区本地测试服务，未部署生产。以下为 11 月 3 日的部署历史。

V2 测试站已按用户“先只上传”的要求上传 61 个文件并逐个回读校验 SHA-256，安装入口能打开，未执行初始化。服务器仍存在上传目录不可写、`data/` 可被直接读取、PATH_INFO 未传入 PHP 的问题；上传状态不能视为可完整测试。详细证据见 [V2 上传记录](docs/deployments/2026-11-03-v2.md)。

开发资料迁移及 FTP 目录清理已完成：根目录 15 个文件收敛为 13 个；删除无引用的 `admin.php`，MCP 说明页改由 `mcp.php?guide=1` 提供，模板在 `includes/views/`；移除旧 `uploads/ux/` 占位目录及初始化逻辑。现有 MCP、分享、API 和资产 URL 保持原样。

使用项目外临时 PHP 8.3.20 运行时（`pdo_sqlite`、`zip`、`mbstring` 均满足要求），5 套真实 HTTP 回归共 286 项通过，其中原样复制目录的 FTP 检查 29 项；前端模拟 DOM/网络回归 55 项通过。具体命令、整理依据和未覆盖范围见 [目录整理记录](docs/reviews/2026-11-03-ftp-layout.md)。本轮未上传 FTP，未运行生产 Apache/Nginx、官方 SDK 互通或浏览器验收；之前“本机无 PHP”的限制已由临时测试运行时解决，无须将运行时上传服务器。
