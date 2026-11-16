# 个人设置四入口与 MCP 接入恢复

## 当前定稿：按接手前的紧凑布局收回改动

用户要求继续以 Gemini 原版布局为基线。本轮依据接手前备份中的账号摘要、输入与操作同行，以及原脚本的 basic/security/mcp 三分区意图，调整为账号摘要常驻 +「基本资料 / 安全设置 / MCP 接入」三个 Tab。姓名与通知配置合回基本资料，保存/测试回到对应输入旁；320px 下通知按钮换行，地址输入保持全宽。这里只恢复已找到的布局特征，不声称找回了缺失的完整 Gemini Tab 模板。MCP 界面和独立保存、校验、焦点及草稿逻辑保持。

本轮实际验证（PHP 8.3.20，临时安装及合成数据）：

- `python3 -B .dev/tests/security_regression.py --php /private/tmp/jinshi-php-common/php`：129 项真实 HTTP 通过，含三 Tab、账号摘要位置、基本资料中的两个独立表单，以及各角色隔离。
- `node .dev/tests/profile_mcp_frontend_regression.js`：31 项通过；`node .dev/tests/security_frontend_regression.js`：68 项通过。JS 语法、模板 PHP lint、所改 JS/CSS/测试的 diff 检查通过。
- CUA 隔离浏览器 `http://127.0.0.1:8789`：基本资料、安全设置、MCP 三 Tab 可直接切换；保存合成账号姓名后摘要同步，通知未提交草稿保持；Home 键切回基本资料，草稿仍在；MCP 正常读取。无相关 error/warn。
- 桌面截图观察通过；320×600 测得弹窗 clientWidth/scrollWidth 均 299，三个 Tab 均无溢出，通知输入约 247px；临时视口已恢复。
- 截图（合成数据，无完整凭据）：`.dev/screenshots/profile-compact-basic.png`、`profile-compact-mcp.png`。临时站点与数据库已清理。未连接真实 AI 客户端、运行 PHP 7.0 或上传 FTP；视觉仍待用户验收。

以下保留前几轮设计的历史记录，当前界面以上述三 Tab 紧凑布局为准。


用户否定了将密码、通知折叠在资料下方的方案，明确选择 B：资料、密码、通知、MCP 四个入口，点击进入对应子页。本记录替代此前偏好整理中个人设置的折叠设计结论，其他已完成的保存队列、空状态与键盘修复保持。

## 后续调整：恢复 Tab 切换

用户再次明确偏好之前的 Tab 排版。本轮已撤回四入口首页与返回层级，改为顶部「资料 / 密码 / 通知 / MCP 接入」四个标签页，账号摘要移入资料页；保留已恢复的 MCP 功能与独立表单。切换保留草稿（包括 MCP 权限草稿），每次重新打开设置后首次进入 MCP 读取最新状态。支持方向键、Home/End 与 ARIA 标签页语义。以下四入口描述作为历史记录。

实际复验：`node .dev/tests/profile_mcp_frontend_regression.js` 31 项通过；`security_frontend_regression.js` 68 项通过；真实 HTTP `security_regression.py --php /private/tmp/jinshi-php-common/php` 128 项通过；PHP lint 和 JS 语法通过。隔离浏览器观察资料、通知、MCP 标签页，验证直接切换、Home 键与未保存姓名保留，控制台无 error/warn。另验证 MCP 权限草稿在切换后保留、MCP 深链，以及 320px 下四 Tab 不换行且无横向溢出；视口已恢复。截图位于 `.dev/screenshots/profile-tabs-data.png`、`profile-tabs-mcp.png`。本轮未重新测试真实 AI 客户端或 PHP 7.0。

## 结果

- 首页仅账号摘要与四个原生按钮入口。子页独立标题、返回按钮和表单；返回保留未提交输入并将焦点交还对应入口。首次登录改密按钮直接打开密码页；`#settings=mcp` 直接打开 MCP。
- 资料、通知采用全宽输入和下方操作区；密码沿用相同操作区。原有必填/选填与修改后才启用保存保持。
- MCP 后端与脚本原先存在，但个人设置缺少对应 HTML，本轮补齐完整界面：凭据状态、生成/重新生成/撤销、项目范围、发版授权、个人凭据复制、AI 接入指令与 JSON/TOML 配置复制、接入说明。
- 权限用「保存权限」明确提交，失败保留草稿可重试。加载/提交期间禁用相关操作，忽略过期读取；加载失败提供重试。审阅人仅可读取，发版选项禁用。
- 完整凭据仅保存在当前页面内存，不写浏览器持久存储。重新获取已有凭据的指令需确认旧凭据失效；外部轮换后清除过期明文。复制反馈只反映一次真实结果，失败不再同时提示成功。

## 实际验证

测试均使用临时安装和合成账号，不使用用户真实数据库和凭据。PHP 为项目外临时 8.3.20 运行时（pdo_sqlite/zip/mbstring）；未引入生产依赖。

| 命令 | 结果 |
| --- | --- |
| `node .dev/tests/profile_mcp_frontend_regression.js` | 26 项通过；运行实际导航/MCP JS，模拟 DOM、HTTP、剪贴板；覆盖重复生成/保存、读请求乱序、失败重试、轮换清理与复制结果 |
| `node .dev/tests/security_frontend_regression.js` | 68 项通过 |
| `node .dev/tests/copy_consistency_frontend.js` | 18 项通过 |
| `node .dev/tests/preferences_frontend_regression.js` | 18 项通过 |
| `python3 -B .dev/tests/security_regression.py --php /private/tmp/jinshi-php-common/php` | 128 项真实 HTTP 通过；含审阅人完整 MCP 控件与管理脚本隔离 |
| `python3 -B .dev/tests/mcp_collaboration_regression.py --php /private/tmp/jinshi-php-common/php` | 87 项真实 HTTP 通过；含多角色凭据、读取/发布范围与撤销等既有协作行为 |
| JS 语法检查、PHP 模板 lint | 通过 |

浏览器使用 CUA 的 in-app browser（无独立 Browser 插件，不引入终端浏览器依赖），在 `http://127.0.0.1:8789` 的隔离副本验证：管理员四入口、姓名保存与首页同步、密码/通知子页、返回焦点、ESC 退出、MCP 深链、已有凭据操作、手动配置展开、服务地址实际剪贴板复制、JSON/TOML 切换；审阅人可进入 MCP 且发布复选框禁用。控制台无相关 error/warn。桌面观察截图通过，320×600 下检查通知和 MCP 无横向溢出（弹窗 clientWidth 与 scrollWidth 同为 299）；通知输入从挤在按钮旁改为全宽约 247px。临时视口已恢复。

截图（合成数据）保存于忽略目录 `.dev/screenshots/profile-b-home.png` 与 `profile-b-mcp.png`，不包含完整凭据。临时服务与数据库验证后清理。

## 边界

- 前端逻辑模拟、真实 HTTP 和浏览器观察分别计数；没有用浏览器点击实际创建/重置/撤销真实凭据。
- 未连接真实 AI 客户端、运行官方 SDK、测试 PHP 7.0 或上传 FTP，视觉效果仍待用户验收。
- 本轮修改文件的定向 diff 检查通过；`includes/modals.php` 整体 diff 仍有前置文件夹循环两行尾随空白，与本轮个人设置无关，未覆盖并行修改。
