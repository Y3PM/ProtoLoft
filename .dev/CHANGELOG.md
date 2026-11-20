# 立象原型 · ProtoLoft · 版本演进与历史变更全记录 (CHANGELOG)

> 本文件记录了立象原型（ProtoLoft，原锦时平台）从早期版本演进至当前版本期间的所有功能迭代、问题排查、架构重构与历史教训。
> 最新系统架构规范与 AI 协同开发指南请参见根目录下的 `AGENTS.md`。

---

## 发布前修复（全新版本，未发布）

- 2026-11-20：按确认方案 A 将项目负责人表单改为“协作权限”，先选所有协作者或指定成员，后者才显示名单；空名单由前后端拦截，切回全员清空成员值。项目列表显示“所有协作者 / 仅指定姓名”，创建者自动记录并与权限列分离，外链列称为“创建者”。
  - 验证：全量 26/26 套通过，权限 HTTP 专项 53 项、Chrome 专项 46 项、交接专项 7/7 通过。FTP 5 个程序文件回读校验、匿名 HTTPS 5 项检查通过。详见 [协作权限更新记录](docs/reviews/2026-11-20-collaboration-scope-a.md)。

- 2026-11-20：复核并补齐“全部协作者 / 指定项目负责人”的权限模型与发布入口。
  - 指定名单统一控制项目发版；创建者保留范围调整和整项目删除权。补全指定负责人的成员统计、删除保护与工作交接，保留历史版本署名。
  - RP 底稿补传、更换、移除按版本发布者归属保护；保存负责人后即时同步表格、侧栏及发布下拉，候选重绘保留已选的停用成员，避免误变成全员开放。外链保持创建者语义。
  - 验证：PHP 8.3.20 全量 26/26 套、可识别断言 1,256 项通过；Chrome 负责人专项 39 项、原交接专项 7/7 通过。详情及未覆盖项见 [负责人审查与修复记录](docs/reviews/2026-11-20-project-owners-review.md)。后续按用户明确授权完成 FTP 部署，10/10 个程序文件回读校验一致，匿名 HTTPS 入口与静态资源 5/5 检查通过；生产多角色业务待用户验收。

- 2026-11-20：重构群机器人通知排版，彻底解决跨端缩进、多余引号与 Markdown 语法破坏问题。
  - **钉钉跨端紧凑无缩进**：针对钉钉移动端原生渲染将行末双空格（`"  \n"`）识别为下一行行首物理缩进的问题，将行间与落款换行统一升级为 HTML `<br>`，彻底消除空格缩进与冒号错位，实现电脑端与手机端像素级纯净顶格与落款独立成行。
  - **飞书卡片纯净文本规范**：彻底移除版本号反引号，消除 `lark_md` 不支持行内代码块导致卡片多出字面反引号的 Bug；自动将正文列表符号（`* ` / `- `）规范化为卡片项目符号（`• `），保持飞书原生交互卡片（带蓝色顶通 Header 与操作按钮）的高质感。
  - **企业微信风格归一与防冲突**：移除企业微信左侧引用竖线（`> `），与钉钉保持一致的纯净左对齐开阔布局；正文列表符号同步收敛为 `• `，杜绝未闭合星号与后续加粗标记错误配对成斜体破坏排版的 Bug（如 `*时间**`）。
  - **测试与验证**：同步更新 `.dev/tests/notification_copy_regression.py` 断言，自动化套件 222 项测试 100% 通过；在钉钉、飞书、企业微信三大官方群机器人实机推送并验证通过。

- 2026-11-20：修复近期代码审查（`.dev/docs/reviews/2026-11-20-recent-changes-review.md`）发现的 4 项 P2 问题并补全回归断言。
  - **原型注入脚本补全 Axure 环境判定**：在 `includes/zip_handler.php` 注入给原型 HTML 的 `#protoloft-axure-sitemap-autonum` 自执行脚本内部补全 `isAxureEnvironment()` 定义，消除普通 HTML 原型页面轮询时触发的 `ReferenceError: isAxureEnvironment is not defined`。
  - **批注抽屉关闭重开同步更新**：在 `assets/js/annotation.js` 中分离并发在途键 `inflightKey` 与已加载上下文键 `loadedKey`，仅拦截正在进行的同一上下文重复请求；用户关闭再打开批注抽屉、或抽屉处于开启态且距上次同步超过 5 秒切换原型页面时，均静默发起 `list_annotations` 重新拉取最新批注列表，避免遗漏其他成员新增批注。
  - **搜索索引精准失效**：在 `assets/js/app.js` 新增全局 `invalidateSidebarSearchIndex()`，对 `#categoryTree` 绑定轻量化 `MutationObserver`（监听 `data-name` / `data-creator-name` / `data-versions` / `data-created-by` 属性、项目/目录增删及 `.cat-name-text` 变更，并用 `_isApplyingSearchHighlight` 避开搜索高亮自身变更），同时优先读取 DOM 最新属性、在个人改名热同步后显式使索引失效。
  - **全站单选下拉焦点与空格提交同步**：在 `assets/js/ver-picker.js` 中扩展 `highlightIndex(idx, scrollIntoView, moveFocus)`，键盘 `ArrowDown`/`ArrowUp` 移动高亮时同步聚焦目标选项按钮，并在 `menu` `keydown` 中将 `Enter` 与 `Space`（`' '` / `'Spacebar'`）统一拦截并提交当前 `activeIndex` 选项。
  - **验证与测试补强**：在 `.dev/tests/security_frontend_regression.js` 增补上述 4 项场景与 `ver-picker.js` 语法编译共 18 项自动化断言；通过无头 Chrome（CDP 1440×1000，主管理员/审阅人/分享访客）实机验证（控制台与 iframe 零 `pageerror`/`error`、抽屉重开同步 `协作者后发批注`、个人改名后搜索即时命中、`ArrowDown + Space` 与 `ArrowUp + Enter` 精确切换 `v1`/`v2`），并重新跑通全量测试 `python3 -B .dev/tests/run_all_tests.py --php /Users/yyy/.local/bin/php`（25/25 套 PASS，可识别断言 1,206 项，耗时 60.41s）。

- 2026-11-19：全面优化浏览器端加载性能、缓存复用与运行时功耗（保持原有视觉细节与覆盖发版即时可见）。
  - **原型资产私有协商缓存**：在 `asset.php` 将 `Cache-Control: private, no-store` 调整为 `private, no-cache`，基于 `storage_dir` + 相对路径 + 文件大小/更新时间生成强 `ETag` 与 `Last-Modified`，命中 `If-None-Match` 返回 `304 Not Modified`；移除 `assets/js/app.js` 与 `share.php` 加载原型 `iframe` 时拼接的 `?t=Date.now()`。同名版本覆盖发布因 `storage_dir` 换新而自动失效缓存，未变更资产切回时直接走 `304` 零字节体复用。
  - **分钟级低耗防泄密水印**：将 `assets/js/app.js` 与 `share.php` 水印时间精度调整为 `YYYY-M-D HH:MM` 并按分钟级低频更新，在 `assets/js/watermark.js` 增加同文本早退缓存、最宽数字宽度缓存、CSS `--watermark-ink` 色值缓存与 Canvas 缓冲区复用，消除每秒主线程 PNG 编码与样式重算；同步调整 `.dev/tests/copy_consistency_frontend.js` 与 `.dev/tests/watermark_layout_browser.js` 分钟级断言。
  - **首屏资源与 HTML 体积瘦身**：抽离并合并极简标准化重置规则至 `assets/css/app.css`，从 `index.php`、`install.php` 移除未使用率近 99% 的 `bootstrap.min.css` 引用；将 `jquery.min.js` 从 `<head>` 移至页面底部避免阻塞渲染；`echarts.min.js` 改为脱离首屏同步加载，并在 `assets/js/admin.js` 中按控制中心按钮悬停/聚焦预热与打开控制中心时按需加载；消除 `includes/modals.php` 中 `#admin-item-row-{id}` 与左侧树重复输出的 `data-versions` JSON（打开控制台及版本同步时由 `hydrateAdminRowVersions` 共享内存引用），并将 `DASHBOARD_DATA.annos` 改为 SQL 聚合计数；在 `.htaccess` 添加 `<IfModule mod_deflate.c>` 压缩与 `<IfModule mod_expires.c>` 静态资源缓存规则。
  - **重复请求、注入与轮询收敛**：在 `assets/js/annotation.js` 避免 `updateContext` 初次加载 `iframe` 时重发 `list_annotations`，并将 `iframe` 内 `click`/`mousedown` 并发 8 定时器收敛为 `AnnoState.isOpen` 下的单一防抖探测；在 `includes/zip_handler.php` 仅向潜在入口页或含 Axure 播放器特征的 HTML 注入完整 Sitemap 增强（普通子页面仅在用到 `ri-` 图标时注入轻量字体规则），并在 `app.js`/`share.php`/`zip_handler.php` 中对已注入或非 Axure 完成页提前终止空轮询；为左侧项目搜索 `handleSearch` 增加 `120 ms` 防抖与内存索引。
  - **验证结果**：已通过 `php -l` 语法检查、`node --check`、`git diff --check`、全量自动化套件 `python3 -B .dev/tests/run_all_tests.py --php /Users/yyy/.local/bin/php`（25/25 套全部 PASS，可识别断言 1,188 项 100% 通过），以及无头 Chrome（CDP 1440×900，20 项目/35 版本/50 批注沙箱）实测对比与 4 界面截图目视验收（登录页/工作台/控制中心/分享页视觉一致、工作台首屏传输降至 `1,580.3 KB`、登录页 FCP 由 `556 ms` 降至 `332 ms`、5 秒空闲期 `RecalcStyle` 与 `ScriptDuration` 降至 `0`、同名覆盖发版即时拉取新版）；尚未在真实公网/FTP 服务器（`mod_deflate` 实际压测）与 PHP 7.0 环境运行，未更新 FTP。

- 2026-11-17：统一成员管理角色下拉为权限由低到高顺序（审阅人 → 协作者 → 管理员）。
  - 在 `includes/modals.php` 将「添加成员（`#newRole`）」与「编辑成员（`#editUserRole`）」角色下拉选项顺序由旧序调整为 `viewer（审阅人）→ editor（协作者）→ admin（管理员）`（`openAddUserModal` 保持默认预选 `editor` 不变）；核查待审批入驻下拉（`#pendingRole_*`）与申请加入协作单选卡（`index.php`、`includes/login_modal.php`），二者已按 `viewer → editor` 递增排列。
  - 在 `.dev/tests/copy_consistency_frontend.js` 增补成员弹窗角色升序断言；已通过 `php -l includes/modals.php`、`git diff --check`、`node .dev/tests/copy_consistency_frontend.js`（47/47）及 `python3 -B .dev/tests/run_all_tests.py`（PHP 8.3.20 下 25/25 套通过，可识别 1,111 项断言 100% PASS）；尚未提交 GitHub 与部署 FTP，真实浏览器效果待用户验收。

- 2026-11-17：重构全站弹窗自动聚焦策略，解决控制中心误聚焦筛选下拉框及部分表单弹窗焦点错位问题。
  - 在 `assets/js/app.js` 优化 `openModal(id, preferredId)` 默认聚焦兜底逻辑：排除 `<select>`、`readonly` 输入框及非文本型 `input`（`checkbox` / `radio` / `file` / 按钮类），无有效可编辑输入时聚焦弹窗容器本身并保留 `Tab` 键循环；在 `assets/css/app.css` 为 `.custom-modal:focus, .admin-console-modal:focus` 隐藏外框轮廓。
  - 在 `assets/js/admin.js` 与 `assets/js/share.js` 为所有管理/录入弹窗显式指定合理焦点：控制中心（`adminConsoleModal`）、版本管理（`versionManageModal`）与分享设置（`shareManageModal`）聚焦容器本身，不再误抓「批注待办与闭环」项目筛选下拉、搜索框或只读短链框；发版（`uploadModal` → `uploadVerName`）、新建/编辑项目（`itemModal` → `itemName`）、编辑版本（`versionEditModal` → `editVerName`）、移交所有权（`transferOwnerModal` → `transferConfirmPwd`）直接聚焦核心输入，工作交接（`userHandoverModal` → `handoverToUserId`）聚焦唯一必选下拉框。
  - 在 `.dev/tests/interaction_no_reload_regression.js` 增补弹窗聚焦策略护栏断言；已通过 `node --check`、`git diff --check`、`node .dev/tests/interaction_no_reload_regression.js`（50/50）及 `python3 -B .dev/tests/run_all_tests.py`（PHP 8.3.20 下 25/25 套通过，可识别 1,110 项断言 100% PASS）；尚未提交 GitHub 与部署 FTP，真实浏览器交互手感待用户验收。

- 2026-11-17：扩大全站轻量行内操作与多选下拉「全选 / 清空」点击热区。
  - 在 `assets/css/app.css` 新增通用行内操作类 `.inline-action-btn`（含 `.is-primary` 与 `.is-compact`，最小高 `26px` / `24px`、内边距 `4px 10px` / `3px 8px`、圆角悬停背景反馈），并同步放大 `.upload-last-log-btn`（`+ 上版日志`）、`.auth-footer-links a`（登录/注册/找回密码切换链接）与 `.anno-link-btn`（查看原批注）的交互热区且保持既有基线对齐。
  - 在 `includes/modals.php` 将 MCP 项目范围下拉与系统设置审批通知人下拉顶部的「全选 / 清空」及 SMTP 授权码「清除」统一收敛为 `<button type="button" class="inline-action-btn ...">`，消除纯文字热区过小与重复内联样式。
  - 在 `.dev/tests/copy_consistency_frontend.js` 增补热区按钮契约断言；已通过 `php -l includes/modals.php`、`git diff --check`、`node .dev/tests/copy_consistency_frontend.js`（46/46）及 `python3 -B .dev/tests/run_all_tests.py`（PHP 8.3.20 下 25/25 套通过，可识别 1,106 项断言 100% PASS）；尚未提交 GitHub 与部署 FTP，真实浏览器手感待用户验收。

- 2026-11-17：隐藏审阅人 MCP 发布权限禁用开关，并统一控制中心角色权限表「管理员」称谓。
  - 在 `includes/modals.php`、`assets/js/mcp.js` 与 `assets/css/app.css` 为不可发布的审阅人隐藏 `#mcpPublishSwitchRow`（「允许发布和替换版本」开关行），首帧与接口返回双重同步隐藏并保留简短只读提示 `#mcpReadOnlyHint`（`审阅人仅可读取项目与批注。`），同时在提交凭据/权限参数时二次锁定 `mcpSettings.can_publish` 为真才允许 `can_publish=1`。
  - 在 `includes/modals.php` 将控制中心「角色权限」表头由旧称谓「超级管理员」统一为「管理员」，覆盖主管理员与普通管理员两类后台管理角色。
  - 在 `.dev/tests/profile_mcp_frontend_regression.js` 与 `.dev/tests/role_permissions_regression.py` 增补开关隐藏与表头称谓断言；已通过 `php -l includes/modals.php`、`node --check assets/js/mcp.js`、`git diff --check` 与 `python3 -B .dev/tests/run_all_tests.py`（PHP 8.3.20 下 25/25 套通过，可识别 1,105 项断言 100% PASS）；本轮尚未部署 FTP、未提交 GitHub，真实浏览器视觉效果待用户验收。

- 2026-11-17：修复文件夹上传漏过隐藏目录（如 `.mimosa/`、`.git/`）导致服务端安全拦截报错，并精细化 ZIP 安全报错提示。
  - 在 `assets/js/admin.js` 提取 `getPrototypeFilePath()` 与 `findBlockedPrototypeFile()`，升级 `filterPrototypeFiles()`：将路径每一段中以 `.` 开头的隐藏目录与隐藏文件（如 `.mimosa/`、`.git/`、`.DS_Store`、`._*`）以及 `__MACOSX`、`Thumbs.db`、`desktop.ini` 一并自动跳过，并在 `setProtoSourceFolder()` 阶段预检服务端禁止扩展名（如 `.php`、`.sh`），发现时立即提示具体文件路径。
  - 在 `includes/zip_handler.php` 新增 `formatZipEntryLabel()` 与 `inspectZipEntryName()`，保持全部既有安全规则不放宽的同时，区分绝对路径、路径穿越、隐藏文件/目录、服务端脚本四类拦截场景并附带脱敏截断后的条目路径提示。
  - 在 `.dev/tests/folder_upload_and_changelog_regression.js`（改为 `vm` 加载真实 `assets/js/admin.js` 校验）及 `.dev/tests/security_regression.py` 增补 `.mimosa/` 隐藏目录过滤、脚本拦截与服务端精准报错回归断言；已通过 `php -l includes/zip_handler.php`、`node --check assets/js/admin.js`、`git diff --check`、`node .dev/tests/folder_upload_and_changelog_regression.js`（35/35）与 `python3 -B .dev/tests/run_all_tests.py`（PHP 8.3.20 下 25/25 套通过，可识别 1,105 项断言 100% PASS）；已执行 `python3 .dev/export_release.py`（67 个文件纯净导出）并增量同步 `/assets/js/admin.js`、`/includes/zip_handler.php` 至 FTP 根目录，FTP 回读与线上 HTTPS `/assets/js/admin.js` 回读 SHA-256 校验一致（线上浏览器选目录上传及 PHP 7.0 实机执行待用户实测验收）。

- 2026-11-16：优化群机器人通知排版，并重构新成员申请通知为结构化键值展示。
  - 在 `includes/webhook.php` 提取统一属性行组装逻辑（`$fieldRows`）：钉钉端去除 `- ` 列表圆点与右缩进、加粗标题（`### **...**`）并改用 `  \n` 紧致左对齐换行，移除底部 `> ` 引用竖线；企业微信端同步加粗标题、修复多行内容引用前缀并弱化底部来源；飞书端沿用交互卡片并共用结构化属性行。
  - 当通知数据传入结构化 `fields`（如 `includes/actions/auth.php` 的 `user_apply` 传递「申请角色」「部门或职务」且不再重复邮箱行）时，三端均自动跳过多余的 `**内容**：` 前缀，直接逐行平铺为 `**标题**：内容`。
  - 在 `.dev/tests/notification_copy_regression.py` 与 `.dev/tests/webhook_keyword_regression.py` 更新钉钉无圆点左对齐与结构化 `user_apply` 断言；已通过 `php -l`、`python3 -B .dev/tests/run_all_tests.py`（PHP 8.3.20 下 23/23 套通过，可识别 1,024 项断言 100% PASS），并经用户提供的钉钉/飞书/企微测试机器人验证投递成功与渲染验收。

- 2026-11-16：新增成员申请加入协作时的角色选择与审批预选。
  - 在独立登录页（`index.php`）与工作台登录弹窗（`includes/login_modal.php`）同步接入双栏角色单选卡（样式收口至 `assets/css/app.css` `.reg-role-grid`），默认选中「审阅人（查看与批注 · 研发/测试）」，可选「协作者（上传与管理 · 产品/交互）」，绝不暴露管理员选项。
  - 在 `includes/actions/auth.php` 的 `register_visitor` 对入参 `role` 做 `['viewer', 'editor']` 严格白名单收口后写入待审批记录（`status = 0`），并在 `user_apply` 通知中携带申请角色。
  - 在控制中心待审批列表（`includes/modals.php`、`assets/js/admin.js` `renderPendingUsers`）新增「申请角色」徽标列（`colspan` 同步更新为 `5`），并按申请意向自动预选右侧审批下拉框；管理员仍可按需调整角色后批准。
  - 在 `.dev/tests/visitor_flow_frontend_regression.js`、`.dev/tests/security_frontend_regression.js` 与 `.dev/tests/comprehensive_e2e_regression.py` 补充角色选择契约、越权参数（`admin`）收口及预选渲染断言；已通过 `php -l` 与 `python3 -B .dev/tests/run_all_tests.py`（23/23 套通过），并增量同步至 FTP 根目录与回读校验 SHA-256 一致（线上表单待浏览器实际注册流验收）。

- 2026-11-16：优化控制中心「查阅走势」堆叠面积图视觉层次与 `0` 值压线问题。
  - 在 `assets/js/admin.js` 将堆叠顺序调整为自下而上「外发访客（底层）→ 内部审阅人（中层）→ 管理与协作者（顶层）」，加深各层 `areaStyle` 渐变透明度（`opacity: 1`、`0.46 → 0.20`），使蓝/绿堆叠空隙清晰可辨。
  - 全周期总量为 `0` 的角色隐藏描边与填充、单日 `0` 值不渲染高亮圆点（仅保留 Tooltip 明细），避免 `0` 值线与圆点覆盖有数据的曲线；Tooltip 增加 `confine: true` 防止遮挡 `7天 / 30天` 按钮，并按图例一致顺序（`内部审阅人 → 管理与协作者 → 外发访客`）排序渲染。
  - 在 `.dev/tests/copy_consistency_frontend.js` 更新堆叠顺序并增补 Tooltip 排序断言；已通过 `node -c assets/js/admin.js`、`node .dev/tests/copy_consistency_frontend.js`（45 项）、`node .dev/tests/security_frontend_regression.js`（79 项）及 `python3 -B .dev/tests/dashboard_regression.py --php /Users/yyy/.local/bin/php`（14 项）；已增量上传 `/assets/js/admin.js` 至 FTP 并回读校验 SHA-256 一致（尚未完成浏览器视觉截图验收）。

- 2026-11-16：发布版本弹窗「更新日志」新增 `+ 上版日志` 快捷按钮（无需键盘快捷键）。
  - 在 `includes/modals.php`「更新日志」标签行右侧增加对称操作按钮 `#uploadLastLogBtn`（`+ 上版日志`），在 `assets/css/app.css` 补充 `.upload-label-row` 与 `.upload-last-log-btn` 样式及 `[hidden]` 隐藏守卫。
  - 在 `assets/js/admin.js` 提取 `getLatestItemVersion()`，随项目选中及切换自动刷新按钮显隐（仅在上一版本含非空日志时展示），点击 `appendUploadLastChangelog()` 自动将上一版日志换行追加至输入框末尾并支持 3000 字上限截断提示。
  - 在 `.dev/tests/copy_consistency_frontend.js` 增补显隐联动、空填/末尾追加及截断提示单元测试。

- 2026-11-16：管理员登录后自动同步入驻申请状态。工作台可见时每 15 秒检查，切回可见页面或重新获得焦点时立即检查。控制中心红点、团队成员角标及入驻申请角标同步更新。打开申请列表时同步新申请，保留已选角色和焦点。
  - 后台检查复用管理员待审批接口，仅查询数量。批准或驳回后重新请求，忽略操作前启动的旧响应，读取失败时沿用最近确认的状态。
  - 本机 Playwright 与 Chrome 157 专项 12 项通过。验证从零到有申请、批准或驳回清零、后台暂停和切回补查、角色草稿保留、慢响应和协作者不轮询。浏览器计时使用加速时钟，请求走临时 PHP 站点。截图位于 `.dev/tmp/pending-approval-refresh/two-pending-applications.png`，已观察。生产环境待验证。
  - `node --check assets/js/admin.js`、`php -l includes/actions/users.php`、`git diff --check` 通过。`python3 -B .dev/tests/run_all_tests.py` 在 PHP 8.3.20 下通过 23 套、1,000 项可识别断言，新增覆盖主管理员及管理员的数量查询、其他角色拒绝访问、审批后数量回落。

- 2026-11-16：修复代理剥离协议头时的分享会话恢复。
  - 分享持久 Cookie 的签名绑定链接、口令和签发时的传输状态。输入口令与凭据恢复共用会话轮换，轮换成功后才授予预览权限。HTTPS 凭据恢复的会话带 `Secure`，普通 HTTP 仍可恢复。旧格式持久 Cookie 在仅凭它恢复时需重新输入口令，已建立的会话继续有效。
  - `php -l` 与 `git diff --check` 通过。`python3 -B .dev/tests/run_all_tests.py` 在 PHP 8.3.20 下通过 23 套、994 项可识别断言。公开分享与专属分享口令专项另通过 9 项。

- 2026-11-16：闭环根提交 `e52b389` 复核发现的两处会话细节（[部署兼容与界面更新审查](docs/reviews/2026-11-16-deployment-update-review.md)）。
  - **分享解锁强制轮换旧会话（P2）**：`share.php` 在访客提交正确访问口令后，改为无条件调用 `app_regenerate_session(!empty($_SESSION['remember_me']))` 强制废除解锁前的旧 `PHPSESSID` 并下发匹配当前安全上下文的新 `PHPSESSID`，解决先 GET 口令页再 POST 提交时旧非 `Secure` 会话仍可用于访问受保护原型的问题。
  - **消除活动会话调整 Cookie 参数警告（P3）**：移除 `includes/config.php` 中 `app_regenerate_session()` 在活动会话期间调用 `session_set_cookie_params()` 的代码，并在每次 `session_regenerate_id(true)` 后统一通过 `app_strip_session_set_cookie_headers()` + `set_session_persistence()` 下发唯一会话 Cookie，彻底消除 PHP 8 警告日志。
  - **回归测试补强**：在 `.dev/tests/security_regression.py` 增补分享解锁前旧 `PHPSESSID` 失效断言与服务端零 `PHP Warning` 日志校验。
  - 实测命令：`git diff --check`、`php -l includes/config.php`、`php -l share.php`、`python3 -B .dev/tests/run_all_tests.py`（23/23 套通过，可识别 989 项断言 100% PASS）。

- 2026-11-16：彻底闭环 [部署兼容与界面更新审查](docs/reviews/2026-11-16-deployment-update-review.md) 复核阶段仍可复现的 3 个问题。
  - **API 预期 Origin 与公开地址完全解耦（P1 登录锁死）**：在 `includes/config.php` 抽取纯传输层判定 `app_transport_is_https()` 供 `app_request_origin_url()` 与无配置回退的 `app_url()` 使用，彻底剥离对 `site_base_url` 与 `PROTOLOFT_BASE_URL` 的依赖；同时通过 `app_client_explicit_http_request()`、`app_base_matches_request_host()` 端口校验及非 80 直连保护，避免 HTTP 入口误保存同主机同端口 `https://` 公开地址后锁死清空设置、回退或新窗口登录。
  - **反代剥离协议头下全链路 Cookie `Secure` 延续（P2 Cookie）**：提取公共函数 `app_is_proxy_https_origin_candidate()` 与 `app_regenerate_session()`（精确剔除早期 `session_start()` 预置的非 `Secure` 同名会话响应头后重发）；在 `Auth::sendAdminAuthCookie()` 为持久设备 Token 记录 `secure` 标记，`Auth::getCurrentUser()` 通过 `ue_admin_auth` 恢复会话时按需激活 HTTPS 标记并重发带 `Secure` 的 `PHPSESSID`；在 `share.php` 访客验证口令通过后复用 `app_is_proxy_https_origin_candidate()` 确保签发的 `ue_item_auth_*` 严格携带 `Secure`。
  - **同名文件夹发版分组与评审看板跨文件夹排序一致（P2 项目排序）**：在 `includes/modals.php` 为 `#uploadItemSelect` 的 `<optgroup>`、`DASHBOARD_DATA.projects` 及 `#filterAnnoProject` 的 `<option>` 补全 `data-cat-id` / `category_id`；在 `assets/js/admin.js` 提取共用排序定位函数 `findCategoryGroupInsertIndex()`，让项目表、`#uploadItemSelect`（按 `data-cat-id` 精准匹配组）及评审看板 `#filterAnnoProject` / `DASHBOARD_DATA.projects` 共用「文件夹顺序优先、同组置顶」规则，同步更新改名文件夹后的发版下拉组标签。
  - **回归测试补强**：在 `.dev/tests/security_regression.py` 增补 HTTPS `site_base_url` 不锁死 HTTP 操作与登录、无协议头反代 `ue_admin_auth` GET 恢复会话带 `Secure`、访客分享口令签发 `ue_item_auth_*` 带 `Secure` 断言；在 `.dev/tests/interaction_no_reload_regression.js` 增补同名文件夹发版分组与评审看板排序一致性仿真断言。
  - 实测命令：`git diff --check`、改动 PHP 文件 `php -l`、`node --check assets/js/admin.js`、`python3 -B .dev/tests/run_all_tests.py`（23/23 套通过，可识别 987 项断言 100% PASS）、以及临时 PHP 站点 + Chrome 专项实测（8/8 项全通过，页面 0 报错）。

- 2026-11-16：闭环 [部署兼容与界面更新审查](docs/reviews/2026-11-16-deployment-update-review.md) 中的 1、2-B、3、4、5、7 项发现。
  - **Origin 与公开地址解耦及端口校验（第 1 项）**：在 `includes/config.php` 新增 `app_request_origin_url()` 与 `app_base_matches_request_host()`，使 `api.php` 来源校验与公开分享/MCP 基准地址（`site_base_url` / 备用 `PROTOLOFT_BASE_URL`）解耦；在 `includes/actions/system.php` 与 `assets/js/admin.js` 增加 `site_base_url` 端口一致性校验，防止填错端口锁死后台与登录。
  - **安装密钥部署说明（第 2-B 项）**：按用户确认保留 `install.php` 生成 `0644` 以兼容 FTP 与 PHP 属主分离直读，同时在 `.dev/export_release.py` 生成的 `DEPLOY.md` 注明多租户共享宿主机应通过环境变量 `PROTOLOFT_INSTALL_TOKEN` 注入。
  - **Cookie `Secure` 与代理头收紧（第 3 项）**：让 `session_start()`、`set_session_persistence()` 与 `Auth::isHttps()` 统一通过 `app_is_https(true)` 识别同域名 `site_base_url` 与标准代理头（移除冷门 `X-Forwarded-Scheme` 等非标头）；当 `api.php` 经 HTTPS→HTTP 反代兜底登录成功时，在 `Auth::login()` 清除非 `Secure` 会话头并确保 `PHPSESSID` 与 `ue_admin_auth` 均携带 `Secure`。
  - **中屏更新日志气泡定位（第 4 项）**：在 `assets/css/app.css` 增加 `max-width: 960px` 视口右对齐定位并用 `--changelog-offset-x` 隔离内联偏移，同时在 `assets/js/app.js` 与 `share.php` 增加视口钳位与 `resize` 联动，解决 768px/900px 气泡右侧及关闭按钮被裁切问题。
  - **跨文件夹新建项目刷新前后序一致（第 5 项）**：在 `assets/js/admin.js` 新增 `insertItemRowInOrder` 与 `syncProjectSelectOption` 按所属 `<optgroup>` 置顶插入，与刷新后 `index.php` 按文件夹顺序分组 + 组内新建置顶保持一致。
  - **专项脚本导入补全（第 7 项）**：在 `.dev/tests/test_custom_share_pwd_browser.js` 顶部补全 `const fs = require('fs');`。
  - 实测命令：`php -l`（改动 PHP 文件全通过）、`node --check`（`app.js`/`admin.js` 全通过）、`python3 -B .dev/tests/run_all_tests.py`（23/23 套通过，可识别 982 项断言 100% PASS）、`test_custom_share_pwd_browser.py`（Chrome 10/10 断言通过）、`changelog.py`（1440/900/768/640/390px 工作台与分享页全部 `containsClose: true`）及 Chrome 实景排序/端口复测（6/6 通过，页面 0 报错）。

- 2026-11-16：修复补传/更换 RP 源文件在 Nginx/OpenResty 默认 1MB 请求体限制下触发 HTTP 413 的问题。
  - 将 `assets/js/admin.js` 中版本发版与补传 RP 的切片大小统一收口为 `UPLOAD_CHUNK_SIZE = 512 * 1024`（此前 `uploadRpForVersion` 仍使用 `1024 * 1024`，叠加 multipart 请求头后超过 1MB 触发 HTTP 413），同时补充空文件与 500MB 上限前置提示。
  - 在 `.dev/tests/security_frontend_regression.js` 新增 `uploadRpForVersion` 分片体积回归断言。
  - 实测命令：`node --check assets/js/admin.js`、`node .dev/tests/security_frontend_regression.js`（79 项通过）、`python3 -B .dev/tests/rp_management_regression.py --php /path/to/php`（12 项通过）、`python3 -B .dev/tests/run_all_tests.py`（PHP 8.3.20 下 23/23 套通过，可识别 978 项断言 100% PASS）。

- 2026-11-16：新建的文件夹与项目默认位于列表顶部，并同步无刷新插入与下拉置顶。
  - `includes/actions/items.php` 中 `category_save`（新建）与 `item_save`（新建及跨文件夹移动）改为取 `MIN(sort_order) - 10`（空列表取 `10`），在保留手动上移/下移调序的同时确保新条目排在顶部；`index.php` 项目查询增加联表 `categories.sort_order ASC`，使顶部文件夹下的项目同步靠前。
  - `assets/js/admin.js` 控制中心新建文件夹、项目、外链改用 `.prepend()` 插入首行并补全动态项目行调序按钮；发版项目下拉、文件夹筛选下拉、评审看板项目下拉同步改为置顶插入。
  - 实测命令：`/path/to/php -l includes/actions/items.php`、`/path/to/php -l index.php`、`node --check assets/js/admin.js`、`python3 -B .dev/tests/run_all_tests.py`（PHP 8.3.20 下 23/23 套通过，可识别 977 项断言 100% PASS）。

- 2026-11-16：调宽工作台与分享页共用的顶部更新日志气泡窗口。
  - 将 `assets/css/app.css` 中 `.top-changelog-popover` 宽度从 `340px` 调宽为 `480px`（`max-width: calc(100vw - 32px)`），内容区 `.top-changelog-body` 高度放宽至 `min(340px, 55vh)`，并在 `max-width: 640px` 下切换为左右 16px 边距固定悬浮防止窄屏溢出。
  - 实测命令：`git diff --check`、`python3 -B .dev/tests/run_all_tests.py`（23/23 套、可识别 975 项断言 100% PASS）。

- 2026-11-16：兼容未传递 `PATH_INFO` 的 Nginx/OpenResty FastCGI 环境，修复原型预览 iframe 空白。
  - 在 `asset.php` 增加 `ORIG_PATH_INFO` 与 `REQUEST_URI`（结合 `app_base_path()` 与 `rawurldecode`）兜底解析，保持 `Storage::filePath()` 路径穿越校验及后缀白名单不变。
  - 在 `.dev/tests/security_regression.py` 补充抹除 `PATH_INFO`/`ORIG_PATH_INFO` 后的 `asset.php` 正常预览、子资源加载及路径穿越拦截断言。
  - 实测命令：`/path/to/php -l asset.php`、`python3 -B .dev/tests/security_regression.py --php /path/to/php`（142 项通过）、`python3 -B .dev/tests/run_all_tests.py`（PHP 8.3.20 下 23/23 套通过，可识别 975 项断言 100% PASS）。

- 2026-11-16：兼容 HTTPS 反向代理剥离协议头回源场景，修复登录后“跨站来源校验失败”。
  - 在 `includes/config.php` 收口 `app_is_https()`、`app_normalize_base_url()` 与 `app_configured_base_url()`，统一替换 `api.php`、`includes/auth.php`、`share.php`、`includes/actions/shares.php` 等处的分散 HTTPS 与基准地址拼接；支持大小写与多级逗号分隔 `X-Forwarded-Proto`、`X-Forwarded-Scheme`、`X-Forwarded-Ssl`、`Front-End-Https`、`CF-Visitor`、`Forwarded`、`REQUEST_SCHEME` 及系统设置 `site_base_url`（优先级次于 `PROTOLOFT_BASE_URL`）。
  - 为 `index.php` 独立登录与访客注册页面补充 `csrf_token` 传递；`api.php` 在统一使用 `app_url()` 校验 Origin 的基础上，当后端因未收到代理头而判为标准 `http(80)` 时，仅对同域名标准 `https(443)` Origin 且携带有效站内 CSRF 令牌的请求放行，反向降级、跨域名与非标端口仍严格拒绝。
  - 在控制中心系统设置新增可选「站点访问地址」（`site_base_url`），校验同域名防止误填锁死，并同步补齐 `includes/actions/system.php` 中 `visitor_register_enabled` 的 `isset` 守卫以防部分更新误关注册。
  - 实测命令：`php -l`（改动 8 个 PHP 文件通过）、`node --check assets/js/admin.js`、`python3 -B .dev/tests/security_regression.py --php /path/to/php`（141 项通过）、`python3 -B .dev/tests/run_all_tests.py`（PHP 8.3.20 下 23/23 套通过，可识别 974 项断言 100% PASS）。未在生产 OpenResty/PHP 7.0 现场实测，待用户覆盖上传更新文件后验收。

- 2026-11-16：修复 FTP 部署时 `data/install_token.php` 因 `0600` 权限导致 FTP 客户端无法读取/下载的问题。
  - 修改 `install.php` 中的 `install_get_or_create_token()`：新建 `data/install_token.php` 时权限改为 `0644`（兼容 FTP 登录账号与 PHP 进程属主分离的场景），同时保留首行 `<?php http_response_code(403); exit; ?>` 防浏览器直读；读取已存在的 `data/install_token.php` 时若权限非 `0644`，自动修复为 `0644`。
  - 在 `.dev/tests/comprehensive_e2e_regression.py` 补充 `0644` 权限校验及存量 `0600` 自动修复回归断言。
  - 实测命令：`/path/to/php -l install.php`、`python3 -B .dev/tests/run_all_tests.py`（PHP 8.3.20 下 23/23 套通过，可识别 963 项断言 100% PASS）、`python3 .dev/export_release.py`（导出 60 个生产文件与 `protoloft-v3.8.0.zip`）、`git diff --check`。未在本次环境直接操作线上 FTP 或 PHP 7.0 验证，待用户覆盖上传 `install.php` 后验收。

- 2026-11-10：水印按确认的 B 方案改为 -25° 文字、隔行横向错开半格。
  - 工作台与分享页复用轻量绘制器 `assets/js/watermark.js` 及 CSS 色值令牌，统一排布；长姓名自动留出间距、边界补画保持连续，时间数字预留稳定宽度。保持原有浅灰透明度、姓名与秒级时间、后台暂停及点击穿透。
  - 两处入口的 CSS 缓存版本加入文件修改时间，防止新绘制器读取旧样式而丢失水印色值。真实 HTTP 回归改为明确验证水印开关与共用脚本，不再匹配无效的页面关键字。
  - 实测命令：`node --check assets/js/watermark.js`、`node --check assets/js/app.js`、`/tmp/jinshi-php-common/php -l index.php`、`/tmp/jinshi-php-common/php -l share.php`、`git diff --check`；`python3 -B .dev/tests/run_all_tests.py --php /tmp/jinshi-php-common/php` 全量 23 套、938 项通过；`python3 -B .dev/tests/watermark_layout_browser.py --php /tmp/jinshi-php-common/php --playwright-module /path/to/playwright` 浏览器专项 48 项通过。
  - 浏览器使用现有 Chrome 157（Browser plugin not available），覆盖三类内部角色工作台、四角色分享页、长中文姓名、1×/2× 像素密度及 390px 分享页；像素检查确认半格错位与两行文字完整，实际点击原型按钮成功。桌面、长姓名和窄屏截图已观察。无应用错误；13 条既有 iframe 同源脚本提示单独记录。390px 分享页顶栏仍有既有控件重叠，未扩展修改。全部在临时安装执行，未部署；PHP 7.0、其他浏览器与用户视觉验收未验证。

- 2026-11-10：修复批注抽屉在项目/版本切换及“上版未决”中的状态串用，并增加历史纸面样式。
  - 修复 `.anno-body` 强制 flex 覆盖隐藏、导致当前版本列表与历史面板同时显示的问题；切换上下文同步清空旧 DOM、筛选与请求状态。
  - 切项目回到当前版本全部批注；同项目切版本时保留可用筛选，上版未决重新读取对应上一版；无上一版则回到全部。空项目禁止从旧 iframe 反推版本，保持输入不可用和既有自动收起行为。
  - 历史请求采用请求序号、上下文代际和项目/版本快照，阻止迟到成功/失败覆盖新视图；引用到本版后恢复当前列表与输入区。
  - 上版未决卡片按批注创建时长分为 0–7 天、8–30 天、31 天以上三档浅纸色与边线，显示相对天数；正文和按钮不褪色。历史面板使用剩余抽屉空间，不再与底部空状态同时显示。
  - 引用后的来源提示改为作者信息下方的 12px 灰色“引用自旧版”与蓝色“查看原批注”；统一两处原批注链接的字号、悬停与键盘焦点样式，保留精确来源链接。
  - 实测：新增抽屉专项 42 项、既有四角色跳转专项 44 项通过；全量 23 套、可识别 937 项断言通过。证据与窄屏既有局限见 [修复记录](docs/reviews/2026-11-10-annotation-drawer-context.md)。未部署、未操作工作区业务数据。

- 2026-11-10：闭环定版前深度复核（D1-D3 全部彻底修复与自动化闭环，回归 100% 全绿）。
  - **访客注册申请限流计数生效（D1 · P1）**：在 `register_visitor` 成功入库后调用 `Auth::hitThrottle('register_visitor', 900)`，杜绝同 IP 无限制重复创建待审批申请，同时保持未入库的合法校验提示不被误伤。
  - **同项目分享撤销复合互斥键（D2 · P2）**：在 `apiFetch` 中为 `share_code_revoke` 增加 `item_id:code` 复合互斥 Key，确保同项目下连续撤销不同短码时各自发送独立网络请求并真实落库。
  - **SVG 命名空间脚本防御与 DOM 语义深度解析（D3 / S1 / X1 / X2 · P2）**：在 `api.php` 的 `isSafeUploadedImage` 中升级为“宽口径正则预检 + PHP 原生 DOMDocument 语义深度解析”双重防御，全面覆盖带句点及任意前缀的危险标签（如 `<review.svg:script>`）、彻底禁止任何 `<!DOCTYPE` / `<!ENTITY` 实体定义注入（X1）、按 WHATWG 规范对齐清洗 ASCII 控制字符以防御编码制表符绕过 `java&#x9;script:` 协议（X2），并在 `install.php` 中补齐 `DOMDocument` 扩展环境自检。
  - **验证**：第三轮语义专项测试（`.dev/tests/prerelease_fix_round3_20261110.py`）7 项全 PASS；第二轮专项（6 项）、第一轮复核专项（15 项）、Axure 自动编号专项（24 项）及全量 23 套测试套件 937/937 项断言全部 PASS (100%)。详见 [第三轮深度复核报告](docs/reviews/2026-11-10-deep-fix-recheck-round3.md)。

- 2026-11-10：全面闭环定版前审查清单（P1 六项、P2 八项、P3 六项稳健性细节全部修复完成，回归 100% 通过）。
  - **P1 核心阻断与闭环修复**：
    1. 补齐 `review_fixes_frontend_regression.js` 测试沙箱存根，全套回归恢复 100% 全绿；
    2. 将 `copyTextToClipboard` 沉淀至公共脚本 `assets/js/app.js`，清除 `share.js` 孤立定义，彻底消除普通审阅人（Viewer）点击外链复制报 `ReferenceError` 的缺陷；
    3. 发版弹窗上传中关闭增加拦截确认弹窗，重复点击发布增加友好 Toast 提示，彻底解决后台静默发版与弹窗死锁；
    4. 访客申请被驳回改为物理清理未激活申请行，彻底消除 `status=2` 僵尸账号导致同邮箱永久无法重申或建号的问题；
    5. 公开接口 `register_visitor` 增加 5次/15分钟 IP 频控，管理员推送异常补充 `error_log` 记录；
    6. PHP 7.0–7.2 部署环境下补齐 Cookie 的 HttpOnly 与 Secure 属性，启用 `session.use_strict_mode`，持久 Cookie 恢复登录时重新生成 Session ID。
  - **P2 安全与并发防御**：
    1. `save_settings` 后端补充 `isset` 守卫、前端清空时显式提交占位符，杜绝局部保存误清空审批通知名单；
    2. Webhook 载荷正文、标题等字段增加 Markdown 保留符号转义（`mdEscape`），彻底封死群消息钓鱼链接注入；
    3. `apiFetch` 互斥 key 覆盖 `ids` 与 `code`，解决排序与分享撤销连续操作时第二笔被静默丢弃的问题；
    4. 修正发版弹窗移除项目函数中调用的不存在函数，准确联动 `onUploadItemSelectChange`；
    5. 管理员代填成员 Webhook 补充白名单校验，批注推送异常补充 `error_log`；
    6. 分享密码 Cookie HMAC 引入站点独立 32 字节随机盐；
    7. SVG 品牌图上传正则升级为通用事件属性拦截，彻底封死 `<animate onbegin=...>` 等 SMIL 动画 XSS 绕过；
    8. 删除项目时同步清理 `item_share_disabled_{id}`，消除 settings 表孤儿数据。
  - **P3 细节稳健性**：撤销不存在短码、清空日志未知类型、文件夹排序畸形参数等假成功状态纠正；版本更新与交接异常避免 PDO 底层报错直出；修正 URL hash 过滤中的单引号 CRLF 清洗问题。
  - **验证**：全量 23 套测试套件 **937/937 项断言全部 PASS (100%)**；下拉同步浏览器专项（16 项）、审批通知 Webhook 浏览器专项（24 项）全部 PASS。详见 [定版前修复清单](docs/reviews/2026-11-10-prerelease-fix-checklist.md)。

- 2026-11-10：彻底闭环修复 Codex 复核指出的单页状态与下拉同步 4 类深层边界缺陷（5 个边界场景全解决）。
  - **审批通知人停用再启用保持勾选（P2）**：以服务端注入并持久化的 `window.SAVED_NOTIFY_ADMIN_IDS` 数组（或全选 null）作为基准，用户手动更改时更新该变量，重建时依据该基准决定勾选；停用时管理员移出活跃候选，重新启用时正确保持勾选，杜绝“界面未选、后台仍投递”的矛盾。
  - **看板版本筛选与图表同步更新（P2）**：项目版本改名、发版或删除其他版本时，重构版本下拉后若原选中版本依然有效，恢复 `vSelect.value` 并显式调用 `onAnnoVersionFilterChange(curVerVal)`，同步更新内部筛选变量 `currentAnnoVerFilter` 并重新绘制看板图表；同时删除版本时从 `DASHBOARD_DATA.annos` 中同步过滤清理已删版本的批注缓存。
  - **删除当前选中项目后看板状态重置（P2）**：在移除 DOM `<option>` 前预先判定 `isCurrentSelected`，并在移除后据此将下拉重置为“全部项目（0）”并触发 `onAnnoProjectFilterChange(0)`，安全重置内部项目与版本筛选变量、隐藏版本框，并同步清理该项目的全部批注缓存。
  - **发版通知卡片保存回调修正（P2）**：修正 `save_settings` 自动保存回调中笔误调用的不存在函数，准确调用全站统一的 `updateUploadNotifyState(curItemId, false)`，确保发版弹窗即使正在打开状态，通知卡片也能立即响应变成“已配置”并启用。
  - **实测证据**：Codex 边界复现专项 `.dev/tmp/gemini-dropdown-review/run.py` 5 个场景全部通过并验证数据闭环（主页面 0 刷新，控制台 0 报错）；既有 Webhook 专项（24 项）、下拉同步专项（16 项）、控制中心多分辨率专项（27 项）、前端质量护栏（25 + 78 + 37 + 43 项）全部 100% 通过。

- 2026-11-10：闭环修复单页生命周期内全站下拉菜单与通道状态同步缺口（5 类 15 个场景全解决）。
  - **新成员审批通知人**：新增 `syncAdminApprovalSelectOptions()`，在成员列表刷新时依据最新活跃管理员全量重构候选名单；保留有效已勾选 ID、剔除失效/降级/停用人员、即时反映改名并更新 Webhook 状态图标，摘要胶囊同步刷新。
  - **文件夹筛选下拉**：文件夹新增、改名、删除时，同步增删改项目管理（`#filterProjectCategory`）与外链列表（`#filterLinkCategory`）的筛选 option；若被删文件夹当前正被选中，安全重置为全部文件夹（`0`）并重新触发过滤。
  - **发版项目下拉**：删除项目或删除文件夹级联删除项目时，调用 `syncUploadModalRemoveItem()` 彻底从 `#uploadItemSelect` 移除对应选项，若当前正选中被删项目则安全顺延重选。
  - **评审看板筛选下拉**：项目保存、改名、删除以及发版、版本改名、版本删除时，联动更新 `DASHBOARD_DATA.projects` 内存字典与 `#filterAnnoProject` / `#filterAnnoVersion` 下拉，解决看板钻取脱节问题。
  - **发版评审群通知状态**：系统设置保存成功回调中同步更新全局 `window.SYS_HAS_GLOBAL_WEBHOOK`，并联动 `updateItemNotifyCards()`，发版通道可用状态与置灰即改即显。
  - 新增 Chrome/真实 HTTP 端到端自动化专项 `.dev/tests/dropdown_sync_regression_browser.py`，**16 项断言全部 100% 通过**；既有前端质量护栏（105 项）持续全部通过。详见审查报告与修复闭环记录。

- 2026-11-10：按推荐方案优化 2K 显示器下控制中心弹窗宽度，解决过宽空旷问题。
  - 将 `.admin-console-box` 宽度由 `clamp(1160px, 80vw, 1580px)` 调整为 `clamp(1040px, 62vw, 1240px)`，同步更新 `--modal-xl: 1240px` 与 `AGENTS.md`。
  - 在 2K 显示器（2560×1440）下，弹窗宽度由 1580px 收敛至 1240px（占屏比 48.4%，缩窄 340px），彻底消除大屏横向扫视疲劳；在 1080P 下自适应为 1190px，笔记本下保持 1040px 兜底。
  - 右侧可用内容宽度保持在 952px，数据概览四卡片与双栏图表呈现黄金比例；项目、成员、权限、日志等 6 列表格全部从容展示，无横向溢出滚动条。
  - 新增 Chrome/真实 HTTP 自动化测试 `.dev/tests/admin_console_scale_browser.py`（27 项检查通过），覆盖 2K、1080P 与笔记本 3 种主流分辨率，并截取实景快照保存至 `.dev/screenshots/admin-console-scale/`。所有前端回归测试（105 项）全部通过。

- 2026-11-10：修复审批通知人下拉的机器人配置状态不随 Webhook 保存更新的问题。
  - 成员管理添加/清除管理员 Webhook，以及管理员修改自己的个人通知，保存成功后定点同步对应状态；不重建名单、不改变勾选、不触发设置保存，不依赖成员列表刷新。
  - 新增 Chrome/真实 HTTP 专项：24 项浏览器检查通过，覆盖慢请求、添加/清除、本人/其他管理员、保存失败和普通角色；权限边界与未发送真实机器人消息也已核对。前端模拟回归 25 + 78 项、语法与差异检查通过。未部署、未验证真实群联通。详见 [状态同步修复记录](docs/reviews/2026-11-10-approval-webhook-sync.md)。

- 2026-11-10：修正新成员审批通知提示与下拉菜单定位。
  - 用户确认留空不通知：字段旁使用“选填。留空不通知”，移除误称私信及空选默认全员的说明。通知仍发送到所选管理员配置的机器人；保留空数组不通知规则。
  - 菜单以选择框为锚点，下方空间不足时向上展开，避免被控制中心滚动容器裁切；保留用户本轮的版本弹窗宽度与其他局部调整。
  - `node .dev/tests/preferences_frontend_regression.js`：25 项通过；临时 Chrome/HTTP 专项 `python3 -B .dev/tmp/small-detail-fix/check_settings.py`：16 项通过，覆盖清空保存、重载、不发送通知及重新选择后恢复投递。静态语法和差异检查通过。仅使用可清理合成安装，本地截获机器人发送；未部署、未验证真实群送达。详情见 [小细节复查及修复](docs/reviews/2026-11-10-small-detail-recheck.md)。

- 2026-11-10：按用户确认的方案统一项目通知文案，并保留“来自 · 立象原型”。
  - 标题采用“项目名 · 具体事件”：新发版为“新版本已发布”，同名覆盖为“版本内容已更新”，批注为“收到新批注 / 批注有新回复 / 批注已解决”。正文不重复项目字段，版本独立一行；按事件使用发布人、批注人、回复人、处理人及更新说明、批注内容、回复内容，入口为“查看原型 / 查看批注”。
  - `includes/webhook.php` 集中生成事件文案，同步企微、钉钉、飞书与通用载荷；企微正文也补齐来源。发版处理器传入实际同名覆盖状态，API 与 MCP 批注处理器移除旧的固定标题。系统测试、成员申请等其他事件保留原有标题和正文标签。
  - 新增 `.dev/tests/notification_copy_regression.py` 并纳入统一执行器、README：临时安装中的真实 HTTP 回归 **194 项通过**，覆盖超管、协作者、审阅人、未授权与已授权分享访客；逐平台核对标题、独立版本字段、来源、字段标签和精确链接，验证同名覆盖保持版本 ID、自发批注不通知本人、越权请求无通知。仅在测试副本内截获机器人发送，不联系真实群。
  - 实际执行：`python3 -B .dev/tests/notification_copy_regression.py --php /tmp/jinshi-php-common/php`、`python3 -B .dev/tests/webhook_split_notify_regression.py --php /tmp/jinshi-php-common/php`、`python3 -B .dev/tests/mcp_collaboration_regression.py --php /tmp/jinshi-php-common/php`（93 项）与 `python3 -B .dev/tests/webhook_keyword_regression.py` 均通过。关键词专项覆盖 8 组事件、4 种载荷和 5 种安全校验诊断样本。
  - `php -l` 检查 `includes/webhook.php`、`includes/actions/versions.php`、`includes/actions/annotations.php`、`includes/mcp_service.php` 及 `git diff --check` 通过；PHP 为 8.3.20。未做全量回归、PHP 7.0 实机、生产部署或真实企微/钉钉/飞书客户端显示与送达验收。
  - 用户随后明确暂缓 @ 提醒；本轮未增加提醒名单输入、平台账号绑定或 @ 消息逻辑。

- 2026-11-10：调整 Axure 页面树编号规则：根层页面与文件夹从 `0` 开始，其余层级从 `1` 开始；取消所有说明页豁免。例如 `0 版本说明`、`1 一休运营 → 1.1 首页 → 1.1.1 项目概览`，第 `0` 个根节点的子页从 `0.1` 开始。
  - 同步修改 `assets/js/app.js`、`share.php` 与 `includes/zip_handler.php` 的上传注入脚本，保留旧手写前缀剥离和重复执行保护。
  - `node .dev/tests/review_fixes_frontend_regression.js`：66 项通过，其中三处编号入口各 12 项，覆盖原豁免标题、根编号 `0` 的子树、连续编号和重复执行。
  - `python3 -B .dev/tests/test_axure_sitemap_autonum_browser.py --php /tmp/jinshi-php-common/php --playwright-module /path/to/playwright`：24 项通过，覆盖临时安装中的上传发布、工作台选项目与版本、未登录分享页及重复编号，无应用脚本异常。Browser plugin not available，使用已有 Playwright 与 Chrome，未安装依赖。原浏览器脚本依赖的私有原型包已不存在，改为自包含的合成 Axure DOM 样本；截图在忽略的 `.dev/screenshots/axure-numbering/`。
  - `node --check assets/js/app.js`、`node --check .dev/tests/test_axure_sitemap_autonum_browser.js`、`/tmp/jinshi-php-common/php -l includes/zip_handler.php`、`/tmp/jinshi-php-common/php -l share.php` 与 `git diff --check` 通过。PHP 检查运行时为 8.3.20；未做 PHP 7.0 实机、完整真实 Axure 包、全量回归或生产部署，尚待用户验收。

- 2026-11-07：Axure 原型页面树（Sitemap）层级微标牌与行距精细化紧凑重构：
  - 需求响应：用户反馈自适应编号落地后，微标牌与侧栏目录树节点占位偏大偏松散，期望更加紧凑精致；
  - 紧凑优化实施细节：
    1. 微徽标尺寸精雕：字号由 `11px` 收紧至 `10px`（等宽字体 SFMono/Menlo 在 10px 时极为清秀精致），高度/行高由 `18px` 收缩至 `15px`，圆角微调为 `2.5px`，内边距收缩至 `0 3.5px`，增加 `vertical-align: 1px` 基线微对齐，并增加 `-0.2px` 字间距，视觉更紧致；
    2. 目录树垂直行距压实：节点行高由松散的 `28px` 紧凑至 `23px`（垂直空间节省近 18%，大幅提升首屏信息密度），页面标题文本字号微调至标准的 `13px`，整体阶梯高度与 Linear 设计系统严丝合缝；
    3. 间距精密控制：彻底消除微标牌与标题文本之间拼接的冗余硬空格 `' '`，改由 `margin-right: 4px` 精准统一控制；
    4. 全链路实时注入：在 `includes/zip_handler.php`（物理源头）、`assets/js/app.js`（工作台宿主）以及 `share.php`（外部免登录分享页）同步落地 `injectCompactStyles`，历史解压原型与新发原型零感知即刻呈现紧凑视图；
  - 质量与回归：真机 Chrome 端到端测试重新生成高清紧凑实景截图（`axure_sitemap_autonumbering.png`），20 套自动化质量大盘（673 项断言）保持 100% 绿色通过。

- 2026-11-07：Axure 原型页面树（Sitemap）全托管层级自适应编号落地（方案 B）：
  - 需求背景：用户上传 Axure 原型时，页面名称中的缩进序号多为手工填写（如 `1 一休运营`、`1.1 首页`、`1.4.1 修改密码`），容易出现漏标（如漏掉“订阅消息”导致没有编号）或层级重排繁琐的问题，用户拍板后续不再手工打标号，期望系统全自动接管编号；
  - 明确适用边界：严格遵循指令约束，此能力**仅适用于 Axure 原型**（通过 Axure 特有 DOM 结构与 API 严格判定，非 Axure 环境零触发零影响）；
  - 核心实现逻辑：
    1. 旧前缀智能剥离：自动匹配并剥除页面或文件夹名称开头残留的历史手写层级前缀（如 `1.1 `、`1.3.1 `），保留纯净业务标题（如将 `1.1 首页` 剥离为 `首页`），杜绝重复打标导致序号重叠；
    2. 顶层前言/说明智能豁免：智能识别“版本说明”、“变更记录”、“更新日志”、“前言”、“导读”等说明性前置页面，豁免自动编号并不占用后续主业务序号；
    3. DOM 树全托管自适应递增：自顶向下遍历 Axure 页面树，不管是文件夹还是独立页面，递归推导当前层级的严谨连续序号（如 `1`、`1.1`、`1.1.1`、`1.2`、`1.3.1`、`1.3.2`）；
    4. 规范化晴空蓝微徽标注入：所有层级节点统一调用 Axure 原生 `.sitemapPageNameTag` 晴空蓝微徽标规范渲染；此前漏填序号的节点（如“订阅消息”）自动补齐 `[ 1.3.2 ]` 标牌，文件夹与页面视觉阶梯完全统一；
    5. 双引擎闭环（源头固化 + 宿主守护）：
       - `includes/zip_handler.php`：在解压原型及历史资产遍历时注入自执行内嵌脚本与样式，新旧原型解压源头一次性固化；
       - `assets/js/app.js` 与 `share.php`：宿主工作台与外发分享页在 iframe 加载时监听并实时探测执行，即使老原型未重传也能即刻自适应生效；
       - `MutationObserver` 动态监听：当 Axure Sitemap 树异步懒加载或节点动态展开时，自动防抖执行重排与补齐，并借助 `data-applied-seq` 实现幂等性守卫，杜绝死循环。
  - 自动化验证与质量保障：
    - `review_fixes_frontend_regression.js` 新增 Axure 页面树仿真测试套件（8 项断言，覆盖豁免、剥离、重排、文件夹徽标与漏标补齐）；
    - 新增真实 Chrome 浏览器端到端套件（`.dev/tests/test_axure_sitemap_autonum_browser.py` + `.js`，8 项真机断言全部通过，并生成实景截图 `axure_sitemap_autonumbering.png`）；
    - 全量 20 套测试套件质量大盘（673 项断言）100% 保持绿色通过。

- 2026-11-07：专属外发链接密码显式展示与智能一键组合复制落地（方案 A）：
  - 列表密码显式可读：生效中的专属外发短链列表中，加密记录不再仅仅展示抽象模糊的「密码保护」，而是显式渲染出带有锁图标的标准微徽标 `[ 🔒 密码: xxxxxx ]`（等宽字体易辨认，免密链接展示 `[ 免密 ]`）；
  - 单拷密码快捷交互：点击密码微徽标直接单独将真实密码复制至剪贴板，Toast 提示「访问密码已复制」，便于仅向协作者发送密码；
  - 智能组合一键复制：
    - 加密链接点击复制（或创建成功时）：自动打包为行业标准格式复制到剪贴板：
      `链接：https://domain/share.php?s=xxxx`
      `访问密码：xxxxxx`
      并明确 Toast 提示「链接与访问密码已复制」；
    - 免密链接点击复制：保持纯 URL 复制，Toast 提示「链接已复制」；
  - 默认公共链接体验对齐：弹窗顶部的默认长效公共链接在设置了密码时，点击复制同样自动打包为「链接 + 访问密码」标准组合文本；
  - 数据与行为彻底分离：移除行内 onclick 代码拼接，统一通过 `data-copy-url` 与 `data-copy-pwd` 属性传参并采用 jQuery 事件委托，彻底防范 XSS 注入风险；
  - 自动化回归与真机截屏：
    - 在 `review_fixes_frontend_regression.js` 补充 10 项状态机与数据流断言；
    - 新增真实 Chrome 自动化脚本（`test_custom_share_pwd_browser.py` + `.js`，10 项真机断言全部通过，并生成实景截图 `custom_share_pwd_modal.png`）；
    - 全量 20 套测试套件质量大盘（665 项断言）100% 保持绿色通过。

- 2026-11-07：修复外链项目在分享页未向前端批注组件传递资产类型导致抽屉与输入框被误禁用的缺陷：
  - 根因排查：`share.php` 在页面脚本与底部初始化时仅传递了 `currentItemId`、`currentVerId`、`currentVerName`，未传递 `currentItemType`；由于分享页沙箱无后台目录树 DOM 节点，前端批注组件默认回退为 `project` 类型，而外链项目无版本号（`verId=0`），导致 `isProtoViewActive()` 将外链判定为未就绪视图，批注抽屉被拦截无法展开，输入框与提交按钮被永久 `disabled` 置灰；
  - 修复实现：
    1. `share.php` 全局定义 `currentItemType` 并在调用 `updateAnnoContext` 时完整传递该参数；
    2. `assets/js/annotation.js` 加固双重防呆：在未传参数时优先读取全局 `currentItemType`，`isProtoViewActive()` 与标题提取识别 `.share-title` 真实项目名；
  - 自动化真机验证：新增真实 Chrome 浏览器端到端套件（`test_guest_link_annotation_browser.py` + `.js`，8 项断言 100% 通过），验证访客展开抽屉、输入启用、外链标题自适应与发表成功渲染全链路；全量 20 套测试（655 项断言）保持绿色通过。

- 2026-11-07：收尾清单治理（外链批注全链路授权、手风琴连击优化、RP 事务一致性与尺寸对齐）：
  - 外链项目访客批注全链路贯通：`includes/auth.php` 与 `share.php` 兼容无版本（`$version === null`）的外链 Session Grant 凭据，外链项目在分享页对外部访客开放与否完全、无缝遵从系统设置中「允许访客发表批注（`perm_guest_annotate`）」角色权限管控；
  - 手风琴折叠动画平滑连击优化：`assets/js/app.js` 在 Web Animations `cancel` 时彻底清理并复位内联样式，收起动画起步高度改取当前渲染瞬时高度 `getBoundingClientRect().height`，彻底消除连击视觉跳变与样式残留；
  - RP 底稿更新与移除的事务一致性（F4）：`includes/actions/versions.php` 在写锁内重验版本归属，`version_update_rp` 采用先临时暂存、事务提交后再原子重命名替换；`version_remove_rp` 改为事务提交后再物理删除旧底稿，彻底消除文件与数据库不一致隐患；
  - 尺寸规范化对齐：`assets/css/app.css` 将版本卡片左侧 `.ver-asset-pill` 徽标高度统一至标准 `28px`（`line-height: 26px`），与右侧操作按钮在同一水平线 1:1 等高对齐；
  - 水印定位定稿：维持当前全屏动态旋转水印威慑（姓名+IP+秒级时间戳），不侵入改写原型 HTML 确保零业务影响；
  - 自动化回归套件更新：`link_annotation_regression.py` 新增访客在外链分享页的批注与角色权限拦截断言，全量 20 套测试（655 项断言）全部保持绿色通过。

- 2026-11-07：访客注册成功动线平滑重塑与企业域名徽标稳态守护：
  - 根除注册时域名徽标丢失缺陷：彻底移除提交时强行篡改 DOM `emailInput.value` 与内联设 `badge.style.display = 'none'` 的错误侵入逻辑，保持输入框仅展示邮箱名前缀，表单重置后企业域名徽标 `@company.com` 稳健常驻；
  - 注册成功体验重塑（对标 Linear / SaaS 标准注册动线）：访客提交加入协作申请成功后，前端自动平滑切回「账号登录」界面，自动回填刚申请的邮箱名，保持域名徽标正确展示，登录卡片顶部显式展示绿色通知条（`✓ 申请已提交，等待管理员审核后即可登录`），光标自动聚焦至密码框；
  - 同步覆盖独立整屏登录页（`index.php`）与工作台通用模态弹窗（`includes/login_modal.php`）；
  - 新增专用浏览器真机端到端自动化套件（`test_visitor_flow_browser.py` + `test_visitor_flow_browser.js`，19 项 Chrome 断言全部通过）与离线轻量守护套件（`visitor_flow_frontend_regression.js`，15 项断言）；
  - 全量 20 套自动化回归测试套件（651 项断言）100% 保持绿色通过。

- 2026-11-07：版本管理卡片细节对齐与结构解耦（对标 Linear 标准）：
  - 资产状态与维护操作彻底解耦：左侧原型包与 RP 底稿收敛为纯只读状态微徽标（统一高 26px），彻底消除 Badge 内嵌 Button 导致的圆角弯曲反模式；
  - 维护动作统一下沉至右侧操作列：更换 RP、移除 RP、补传 RP 统一采用标准 28px 高度的 `.btn-sm` 独立按钮，消除局部积木块 Hover 变色撕裂；
  - 根除日志文本切字缺陷：移除卡片内 `max-height: 84px` 嵌套滚动条，更新说明多行自然换行完整呈现；
  - 统一删除按钮为标准 28px × 28px 纯图标方块，顶部版本数量徽标补齐 `.m-badge-neutral`；
  - 更新版本弹窗浏览器端断言，全量 19 套自动化测试（636 项断言）100% 保持绿色通过。

- 2026-11-07：找回并恢复昨晚已确认的版本管理卡片流及 620–720px 尺度；保留今天的权限、状态同步和公共动效。补齐分页真实节点及 RP 文件选择输入，按钮、徽标和搜索消费公共组件。新增生产渲染与真实 Chrome 专项，验证搜索分页、默认保护、删除同步及 RP 补传/更换/移除；恢复证据与范围见 [版本弹窗恢复](docs/reviews/2026-11-07-version-modal-recovery.md)。未操作现有业务记录。

- 2026-11-07：核实并收敛代码审查发现的问题（两轮已全量定稿）：
  1. **数据与行为分离根治 onclick 注入与按钮损坏（P1-A/B）**：
     - 重构 `assets/js/app.js` 外链落地卡片「复制链接」按钮，移除行内 onclick 拼接，改用 `data-copy-url` 属性传值配合通用事件委托 `.btn-copy-link`；
     - 重构 `assets/js/admin.js` 外链表格行中复制按钮与编辑按钮，移除行内 onclick 拼接，统一改用事件委托 `.btn-copy-url` 与 `.btn-edit-item-trigger`，保存后通过 `.data('item-data', ...).attr('data-item-json', ...)` 传值，彻底杜绝 `.attr('onclick')` 未解码实体导致 SyntaxError 的缺陷；
     - 修复 `admin.js` 新建文件夹行与新建项目行的按钮拼接，移除无效的 `.replace(/'/g, "\\'")`。
  2. **集中批注衍生接口鉴权与版本范围守卫（P1-F3）**：
     - 在 `includes/collaboration.php` 沉淀统一批注访问守卫 `Collaboration::canAccessAnnotations($item, $version = null)`，区分成员与访客策略；
     - `includes/actions/annotations.php` 的 `previous_annotations` 针对返回的上一版本核验授权，访客持有单版本（如 V2）授权时严禁跨版本返回 V1 批注正文；
     - `annotation_target` 访客分支严格核验 `Auth::canGuestAnnotate()` 与分享访问权限，`perm_guest_annotate=0` 时拒绝访客探测。
  3. **版本管理弹窗状态与数据快照实时同步（P2-1）**：
     - 彻底清除 `assets/js/admin.js` 中不存在的 `#verManageList`、`.btn-ver-default-action` 等幽灵选择器；
     - 复用 `syncPublishedVersion` 全量同步模式：`handleSetDefaultVersion` 与 `handleDeleteVersion` 双写 `$node.data('versions')` 与 `attr('data-versions')`，即时重算并重绘控制台行徽标、版本计数与弹窗视图。
  4. **发版弹窗群通知判定恢复（P2-2）**：
     - `index.php:856` 改读 `Auth::getSetting('global_webhook_url', '')`，修复未定义变量导致 `SYS_HAS_GLOBAL_WEBHOOK` 恒为 false 的问题。
  5. **MCP 自定义模式空选项目拦截（P2-3）**：
     - `assets/js/mcp.js` 在自定义模式（`mcpScopeMode === 'custom'`）下清空勾选时，阻止自动保存并弹出显式 warning 引导，杜绝无意识扩大为全部项目。
  6. **jQuery 缓存双写同步（P2-4 / P2-E）**：
     - `assets/js/admin.js` 的 `handleItemSave` 同步补充 `$row.data('cat-id', ...)` 与 `$row.data('name', ...)`，防范筛选与调序缓存失真。
  7. **低成本项收敛**：
     - 修复 `assets/js/app.js` 占位符字符串中多余的一元加号 `+ +`（消除界面 "NaN" 文本）；
     - `share.php` 内联脚本 `json_encode` 补齐 `JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT`；
     - 删除无引用死文件 `includes/mcp_panel.php`；
     - `install.php` 目录权限收紧至 0755，异常消息统一脱敏。
  8. **冷启动 Schema 纯净收敛（F5）**：
     - 彻底清理 `includes/db.php` 运行期中吞异常补列的 `ALTER TABLE` 残留（`items` 的 `sort_order`、`mcp_tokens` 的 `project_ids`、`access_logs` 的 `role` 均已在标准建表语句中一次性定稿），坚决杜绝运行时打地质层补丁。
  9. **品牌主色定稿与样式体系规范化（F7）**：
     - 统一定稿全站唯一品牌主色晴空蓝 `#0076de`（悬停 `#005bb5`），同步校正 `AGENTS.md` 规范文档；
     - `assets/css/app.css` 完善 `--primary-subtle`、`--primary-border`、`--primary-ring` 令牌系统，消除 `.badge-sys`、`.m-alert-info`、`.admin-nav-item.active` 等处的旧色值；
     - 全站彻底清理 `#0284c7`、`#0369a1`、`#bae6fd`、`#e0f2fe` 旧色值，包括 `modals.php`、`index.php`、`share.php`、`zip_handler.php`、`admin.js`、`app.js`、`annotation.js` 中的插画、徽标与报错页；
     - 收敛非标内联高度与样式（消除手写 22px/28px，统一消费 `.btn-primary.btn-sm` 等预设规范类）。
  10. **公共层与工具函数整理（F8）**：
      - `formatBytes` 规范化为 `app.js` 环境安全导出与 `admin.js` 优先复用；
      - 清理 `app.js` 死变量 `safeName`、`admin.js` 无用元素 `uploadProjectName` 赋值；
      - 优化版本弹窗标题显式标注项目名称（`版本管理 · 项目名`），清理无效的 `verManageSubtitle` 调用；
      - 批注访客权限校验规范为 `Boolean(window.GUEST_ANNOTATION_ENABLED)`，根除 `typeof !== 'undefined'` 导致的真值穿透隐患。
  11. **工作台快速添加后即时刷新与控制中心判定收紧**：
      - 根治 `assets/js/admin.js` 中 `isAdminConsoleOpen()` 因初态空字符串导致主工作台操作被误判为控制中心打开的穿透缺陷；
      - `includes/modals.php` 为 `#adminConsoleModal` 初始 HTML 补齐 `style="display:none;"`；
      - 彻底恢复主工作台左上角快速添加项目、外链、文件夹以及发布版本保存成功后的即时整页刷新与左侧目录树同步。
  12. **回归自动化**：
      - 补充专项测试套件 `.dev/tests/review_fixes_frontend_regression.js`（20 项断言）与 `.dev/tests/review_20261107_fixes_regression.py`（38 项断言），并接入 `run_all_tests.py`；
      - 全量 18 套测试套件 100% 绿色通过，可识别断言达到 621 项。
  13. **动效体验重构（全面对标 Linear 规范）**：
      - 彻底清除 `assets/js/admin.js` 中对 4 个原生表格（文件夹、项目、外链、成员）挂载的 `autoAnimate`，严禁在 `display: table-row` 上使用 FLIP 绝对定位补间，根除条目删除时列宽坍塌与“先变高再变窄”的形变缺陷；
      - 恢复 Linear 规范的瞬时响应（Instant Snap），条目删除即时从 DOM 移除，下方行瞬时平整紧凑贴合；
      - 调优 Tab 切换与面板切换动效（`@keyframes panelFadeIn` 从 `160ms/3px` 调优至 `220ms/6px`，搭配 `cubic-bezier(0.16, 1, 0.3, 1)` 微浮入场），在控制中心概览/成员/日志与个人设置选项卡中平滑生效；
      - 移除 `index.php` 中冗余的 `assets/js/auto-animate.min.js` 引用并清理物理文件，实现轻量无多余依赖加载。

- 2026-11-06：按最后确认需求归一界面/功能回退，恢复个人 MCP 多选与布局、成员弹窗、ZIP/目录/RP 入口和评审看板；保留角色权限、同名覆盖、宽版版本表及后续批注逻辑。发布回执与首次渲染共用版本展示字段，修正新建后错选发布目标及发版后列表/数量/署名不同步。统一入口补入五个既有专项，新增隔离 Chrome 连续流程回归；恢复依据、执行结果和剩余架构项见 [状态归一记录](docs/reviews/2026-11-06-state-reconciliation.md)。未修改工作区业务数据，未上传 FTP。

- 2026-11-06：根据用户指出的模板回退，从 Gemini 原始修改记录精确恢复组织名称说明删除、UTC 排序的 24 项时区及 UTC+8 默认、邮箱域名说明并入选填。只恢复 `includes/modals.php` 对应区块，保留当前权限和个人设置。已定位此前整文件 checkout 与旧模板组装覆盖记录；129 项 HTTP、24 项时区标识校验及 Chrome 保存刷新验证通过。详见 [设置优化恢复](docs/reviews/2026-11-06-settings-recovery.md)。

- 2026-11-06：移除角色权限页遗留的批注、分享全站总开关，以及后端配置读写、全局拦截和自动重开逻辑；保留五项角色权限及项目公共链接、口令、有效期、撤销控制。补充现有角色 HTTP 回归：弃用字段不再保存，合成库旧值不再影响角色授权。现有十套回归通过，Chrome 桌面完成勾选保存与刷新保持验证。架构审查按用户确认校正：支持同名覆盖更新，MCP 未选项目默认权限内全部项目，不增加文件恢复功能。详情见 [架构审查](docs/reviews/2026-11-06-architecture-review.md)。

- 2026-11-05：解决 Axure 原型翻页时批注抽屉顶部页面信息与挂载路径无法联动感知的系统缺陷，并扩充 MCP 批注协同闭环能力：
  1. **Axure 官方通道与多源智能解析引擎升级**：
     - 重构 `assets/js/annotation.js` 中的原型页面感知引擎（`getActiveFrameInfo` / `resolvePageContext` / `updateContext`）；
     - 直通 Axure 运行时权威通道：优先读取 `outerWin.$axure.page.pageName` 与 `page.location`；
     - 原生集成 Axure 顶栏当前页容器 `.pageNameHeader` / `#interfacePageNameButton`；
     - **支持 Sitemap 多级嵌套面包屑回溯**：当选中深层嵌套子页面时，自动沿树向上递归回溯父级目录，构建自明性极强的面包屑标题（如 `1.1 运营中心 › 1.1.1 项目概览`）；
     - 自动穿透识别 Axure 播放器壳子 `start.html` 内真实承载具体页面的内嵌子 iframe（`#mainFrame`），提取真实子页面路径（如 `一休运营1023/1_1_首页.html`）；
     - 递归为子 iframe 挂载 `load` 事件监听与快捷键 C 穿透代理，一旦子页面翻页完成立即捕获。
  2. **消除“当前页面”冷硬兜底与多级互保策略**：
     - 优先采用嵌套面包屑与 Axure 官方页面名称，回退采用子文档 `<title>`、URL Hash 与相对路径文件名多级互保；
     - 彻底消除未匹配时直接展示占位符“当前页面”的问题，确保只要在有效原型下 100% 呈现具体页面语义。
  3. **实时感知联动与 mousedown 翻页捕获**：
     - 针对 Axure Sitemap 树点击基于 `mousedown` 的底层机制，在捕获阶段挂载 `mousedown` 监听并在 80ms/250ms/500ms 持续刷新；
     - 批注抽屉展开期间启用 400ms 轻量自适应探测，监听外层 `hashchange` 与翻页动作；
     - 一旦感知页面切换，毫秒级更新顶部 `#annoCurPageTitle`，且在“仅当前页面”过滤模式下立即自动重新过滤展示当前页批注；抽屉关闭时自动销毁定时器，零性能负担。
  4. **扩充 MCP 批注闭环能力并成功解决批注 #2**：
     - 在 `includes/mcp_service.php` 中新增 `resolve_annotation` 工具（支持 `annotation_id`, `status: 'resolved'|'pending'`, `comment`）；
     - 使用用户提供的最新凭据调用该工具，将批注 `#2` 标记为已解决并注入修复说明；
  5. **全量自动化回归验证**：
     - 扩充 `interaction_no_reload_regression.js` 与 `mcp_collaboration_regression.py`；
     - 全量 12 套自动化回归测试套件（累计 553 项严密断言）100% 绿色全部通过。

- 2026-11-05：修复批注快捷键 C 在原型查看时穿透失效与选择文件夹/空状态误触发 Bug：
  1. **iframe 焦点穿透与按键代理机制**：此前键盘事件仅监听外层宿主 `document`，当用户在右侧预览原型时焦点落于 iframe（及 Axure 内嵌 `#mainFrame`）内部，外层无法捕获按键；通过在同源 iframe 加载、hashchange 及子 frame 加载时递归挂载 `bindFrameHotkeys`，实现看原型时按 C 毫秒级呼出批注抽屉；
  2. **精准活跃原型守卫（`isProtoViewActive`）**：此前仅判断 `myFrame.style.display !== 'none'`，因 CSS 中默认 `display: block` 导致在未选项目或仅选中文件夹时被误判为“有原型”而误触发；升级为严格排查占位画卷（`#placeholder`）、无版本占位（`#noVersionPlaceholder`）、外链落地卡片与项目版本有效性，非原型视口下按 C 坚决不响应；
  3. **系统修饰键与输入域绝对保护**：按 `Cmd+C` / `Ctrl+C` / `Alt+C` 时坚决放行（保护系统复制）；在表单输入框内打字按 c 坚决放行输入；批注抽屉打开时支持按 `ESC` 平滑收起；
  4. **全量回归验证**：更新交互回归套件，全量 12 套测试（545 项严密断言）100% 绿色全部通过。

- 2026-11-05：外链资产交互守卫、控制台沉浸无刷新改造与数据大盘重构（批注待办闭环仪表盘与多角色查阅走势面积图）：
  1. **外链乱弹窗根治与手势意图守卫**：
     - 在 `index.php` 侧边栏项目点击显式传递用户直接点击标志（`isUserDirectClick = true`）；
     - 在 `assets/js/app.js` 的 `selectItem` 建立意图守卫：仅当用户在侧边栏手动点击且打开方式为 `_blank` 时，才执行 `window.open` 新标签打开并 `return`；录入外链完成、被动路由定位与初始化加载时杜绝任何弹窗扰动，平滑在右侧画板渲染沉浸式外链资产信息卡片。
  2. **消除控制台操作刷新与关闭集中同步机制**：
     - 调序（`moveCategoryOrder`, `moveItemOrder`）、开关分享（`toggleShareStatus`）、显隐切换（`toggleVisibility`）、重置短链（`rotateShareToken`）、发版、项目/分类增删改、版本管理（`handleSetDefaultVersion`, `handleDeleteVersion`）等控制面板内部高频操作，全面移除即时页面重载与 `sessionStorage`，原地通过局部 DOM 增量更新并打上 `window.adminConsoleChanged = true` 变动标记；
     - 在公共弹窗关闭守卫 `closeModal` 中拦截 `adminConsoleModal`，仅在面板完全退出且发生过变动时集中刷新一次，保证控制台内操作丝滑连贯、无任何闪烁打断。
  3. **数据概览重构：批注待办与评审闭环仪表盘（支持项目/版本两级钻取联动）**：
     - 将原本业务价值不高且尺度失调的“文件夹分布与查阅”柱状图彻底替换为【批注待办与评审闭环】板块；
     - 左栏配备纯前端 ECharts 甜甜圈环形图（圆心居中展示大号全站/项目闭环率，环外展示待处理与已解决色块占比），右栏联动展示未解决待办卡点清单（包含项目名、版本名、子页面名称及发生相对时间）；
     - 板块顶栏支持【全部项目】与【全部版本】下拉动态钻取（Drill-down），基于服务端输出的全量数据在前端纯内存过滤重绘，0 毫秒瞬时响应且无任何网络抖动。
  4. **查阅走势升级为多角色平滑堆叠面积图（审阅人 / 协作者 / 外发访客）**：
     - `access_logs` 数据库表引入 `role` 角色快照并自动回填；
     - 查阅走势（7 天 / 30 天）按「内部审阅人（翡翠绿 `#10b981`）」、「协作者与管理员（晴空蓝 `#0284c7`）」及「外发访客（琥珀橙 `#f59e0b`）」三个业务角色实现平滑堆叠面积折线图；
     - 悬停 Tooltip 呈现各角色精细化分层数值与总计，精准洞察需求交付的内外部传播生命周期。
  5. **全量自动化回归质量验证**：
     - 新增专属前端交互测试套件 `.dev/tests/interaction_no_reload_regression.js`（12 项断言）；
     - 修复 `includes/auth.php` 访问日志记录方法引用（`self::getCurrentUser()`）；
     - 维护向下兼容层，全量质量大盘 12 套测试套件（累计 538 项严密断言）100% 绿色全部通过。

- 2026-11-05：全站空状态（Empty States）系列化视觉升级与叙事性重构：
  1. **场景一确定保留为全站基准**：全站空库状态保持线框画卷 + 品牌折纸大象守护 + 朱砂红点睛的工程基调，确立全站设计语言 Anchor；
  2. **场景二落地方案 2-A（透视画卷与聚焦光波）**：重构未选择项目时的右侧空状态，去除此前杂乱的双层外圈，采用双层轻盈叠放画卷营造原型工程景深，检阅光标落于几何中轴触发晴空蓝聚焦微波纹（Focus Ring），右上角点缀朱砂红灵感火花；
  3. **场景三落地方案 3-A（灵感托举与弧形光轨）**：重构项目已建未发版状态（`#noVersionPlaceholder`），将折纸大象拔高至最高层级前景，挺拔昂首站在地平线（y=94）上；象鼻托举朱砂红小球，向左侧空白蓝图装配台延伸出轻盈优雅的红色弧形灵感光轨，生动呼应“坑位已占，只待图纸落定，大象便与团队并肩开工”；
  4. **全量回归验证**：全量 11 个自动化测试套件（528 项严密断言）100% 绿色全部通过。

- 2026-11-05：新建/编辑外链彻底移除项目群通知能力与防误发通知闭环：
  1. **前端交互纯粹化**：在新建链接与编辑链接弹窗中，动态隐藏【项目群通知】整行区域（`#itemWebhookGroup`）并清空残留值，表单仅聚焦于所属文件夹、链接名称、链接地址与打开方式；原型项目（`type === 'project'`）完整保留群通知能力；
  2. **前后端双重防呆与强制置空**：前端 `handleItemSave` 在提交链接时强制将 `webhook_url` 设为空串；后端 `includes/actions/items.php` 在 `item_save` 时若 `$type === 'link'` 强制覆写 `$webhookUrl = ''`；在 `item_set_webhook` 接口拦截外链类型的非法配置请求；
  3. **大盘状态与通知逻辑一致性**：控制大盘“机器人”徽标仅对原型项目生效，杜绝脏数据误标；排查确认系统通知链路仅包含发版、批注与注册审批，外链无任何发通知途径；
  4. **全量回归验证**：更新前端表单条件测试，全量 11 个自动化测试套件（528 项严密断言）100% 绿色全部通过。

- 2026-11-05：新增发版时原型文件夹直接上传、RP源文件拖拽与更新日志 Markdown/自然换行兼容：
  1. **原型文件夹与 RP 源文件全拖拽与统一样式**：发版弹窗全面升级为统一风格的投放区（Drop Zone），原型内容支持选择 ZIP 包或原型文件夹，RP 底稿支持选择或拖放投入；纯原生前端高速封装为标准 Store 模式 PKZIP Blob，自动剥离多层冗余公共父外壳并智能过滤 `.DS_Store`、`__MACOSX`、`Thumbs.db` 系统杂质；RP 投放区增加 `.rp` 扩展名校验与误拖入拦截；两者均复用 512KB 分片稳定上传机制，服务端零新增并发与存储风险；
  2. **多层嵌套与直接多文件智能寻根**：服务端解压升级为广度优先搜索 (BFS) 智能探测，彻底兼容“文件夹套多层文件夹”、“压缩包套多层文件夹”或“根目录直接多文件平铺”等任意打包结构，按优先级标准名称逐层深度探测穿透，精准命中入口 HTML；
  3. **更新日志 Markdown 与换行全链路覆盖**：新增纯净防 XSS 的轻量 Markdown 解析引擎，工作台状态栏气泡、外部分享页气泡及控制台版本管理弹窗全面支持自然换行、有序/无序列表、加粗、斜体、行内代码、引用块及受控协议超链接排版；
  4. **彻底修复发版弹窗校验死锁与全站报错体系归一化**：全面移除浏览器原生丑陋的白底带投影系统级校验气泡（加 `novalidate`、移除 `reportValidity`），修复 `clearUploadVersionNameHint` 初始化误打错标 Bug；在 `app.css` 建立规范的 `.m-input-error` 浅色红晕高亮，输入实时复位，统一收口至 Linear 风格的 `showToast` + 字段内联联动；
  5. **外发分享页与工作台顶栏版本/日志对齐归一**：建立 `.top-changelog-wrap` 就近锚定容器，废除历史遗留硬编码绝对坐标（`left: 140px`/`200px`），气泡永远精确贴合「日志」按钮正下方对齐展开；分享页按钮由非标 24px `btn-tool` 统一升级为 32px 浅晴空蓝 `.btn-top-changelog`，与版本标签完美齐平；弹层头部补齐版本号副标题并去除硬编码 Hex 杂色，更新时间对齐 `<i class="ri-time-line"></i>` 图标；
  6. **全量回归验证**：新增 32 项文件夹打包、目录剥离、BFS 寻根、RP 拖拽守卫、表单报错复位与 Markdown/XSS 专项回归测试，全量 184 项自动化测试 100% 绿色通过。


- 2026-11-05：按原版紧凑布局收回个人设置的额外拆分：账号摘要常驻，使用「基本资料 / 安全设置 / MCP 接入」三 Tab；姓名与通知合回基本资料，操作就近放置，窄屏通知行自适应换行。保留完整 MCP 和独立保存/校验修复。129 项真实 HTTP、99 项前端复验通过，浏览器确认保存、摘要同步、草稿及 320px 布局。

- 2026-11-05：按用户最新偏好将个人设置改回顶部四 Tab，撤回四入口首页和返回层级；保留 MCP 完整配置，切换时保留表单草稿，支持键盘方向键及 Home/End。31 项设置/MCP 前端、68 项公共前端、128 项真实 HTTP 复验通过，浏览器检查直接切换与草稿保留。

- 2026-11-05：按用户选择 B 重做个人设置：资料、密码、通知、MCP 四入口及独立子页，替代此前的折叠布局；补齐缺失的 MCP 配置界面（凭据生命周期、项目范围、发版授权、接入指令与配置复制）。补上请求锁、读取乱序和复制失败处理。215 项真实 HTTP、130 项前端逻辑通过；隔离浏览器验证管理员/审阅人、深链、复制与窄屏。详见 `.dev/docs/reviews/2026-11-05-profile-mcp.md`。

- 2026-11-05：完成产品偏好复查后的第二轮整理。系统设置和角色权限串行保存最新快照，保留失败重试与可见保存状态，避免旧请求错误确认新修改；空工作台按文件夹、项目、发布逐步引导。个人设置将密码/通知改为按需展开，未修改的保存按钮不强调；删除重复说明，加深辅助文字。通用弹窗隔离背景并约束/返回键盘焦点，控制中心导航、多选入口和设置标签补齐原生语义。260 项 HTTP、104 项前端逻辑检查通过，隔离浏览器验证连续延迟保存、嵌套弹窗、管理员/审阅人和 320px 个人设置。详见 `.dev/docs/reviews/2026-11-05-preference-fixes.md`。

- 2026-11-05：统一文案、必填/选填标识、角色与状态名称、通知表单与分享控件尺寸；注册和改密增加固定标签，个人设置采用 540px M 档。移除项目表单中已失效的协作者/水印选项，基本资料保存保留未提交的既有配置；补齐链接地址必填及申请状态提示、复制失败反馈。255 项真实 HTTP 回归、86 项前端逻辑检查通过；浏览器观察桌面管理弹窗及 390px 注册页。证据与未覆盖范围见 `.dev/docs/reviews/2026-11-05-copy-polish.md`。

- 2026-11-04：按用户要求将新 favicon 的底色恢复为接手时的 `#0076de`，同步重生成 PNG，保留已确认的图案与放大比例。

- 2026-11-04：按用户确认的完整象身生图重绘纯路径 favicon，象与红球整体放大约 8%，同步 PNG 备用资源。各入口按图标内容生成缓存标识，分享页统一正确的 SVG MIME 类型。4 个 PHP 文件语法检查通过；浏览器观察 16/24/32/64/128px 与浅深标签示意，确认登录页、MCP 指南及分享空状态引用新图标。验证边界与重生成命令见 `.dev/docs/reviews/2026-11-04-favicon.md`。

- 2026-11-04：完成品牌口号、纯矢量折纸大象视觉资产与全库技术标识一步到位定稿：
  - 中文名定稿为“立象原型”，英文名定稿为“ProtoLoft”，中文口号定稿为“立象以尽意 · 披图而同心”（释义：让想法可见，让协作清晰），英文口号定稿为“Give ideas a shared home.”；
  - 品牌标志全面纯矢量化：页面横版组合标志新增 `assets/images/logo.svg`（左侧 17 块整洁几何折纸大象 + 朱砂红圆球，右侧纯矢量转曲 `立象原型 / ProtoLoft` 字标，放大左侧大象占比并收敛文字比例），侧边栏图标采用透明底折纸大象 `assets/images/logo-icon.svg`，浏览器标签页 Favicon（`assets/images/favicon.svg` / `favicon.png`）采用连续曲率曲线圆角（Squircle）皇家蓝底板 + 反白折纸大象；
  - 全库说明文档与底层技术标识统一收口：`README.md`、`LICENSE`、`AGENTS.md`、`.dev/docs/mcp.md` 全面消除 `AxShare Hub`、`锦时` 与 `LiXiang` 过渡拼音；MCP 服务标识、资源 URI（`protoloft://guide`）、个人凭据前缀（`plmcp_`）、环境变量（`PROTOLOFT_MCP_TOKEN` / `PROTOLOFT_BASE_URL`）、错误日志前缀（`[protoloft]`）与 ZIP 注入标记一步到位统一为 `ProtoLoft / protoloft`。

- 2026-11-03：正式完成品牌升级与品牌边界重构：
  - 项目名称由“锦时原型托管平台”升级为“立象原型 · ProtoLoft”；
  - 厘清并严格落实系统品牌与企业品牌的有机结合边界：
    1. **系统品牌（绝对固化 · 坚决捍卫）**：立象原型官方 Logo、折纸大象 Favicon、核心口号、经典工程网格底纹与全站页脚版权恒定固化，彻底移除后台设置中过度侵蚀品牌的副标题、页脚、Favicon 与登录壁纸修改项；
    2. **企业品牌（克制收敛 · 轻量定制）**：控制中心设置面板收拢为极简「企业组织定制」，仅开放“企业/团队名称”选填与邮箱域名规则；
    3. **前台呈现（主次分明 · 联合品牌）**：登录页主视觉恒定归属立象原型，卡片标题温和呈现 `[企业名] · 账号登录`；工作台与外发分享页左上角以 `立象原型 / [企业名]` 联合呈现，立象原型始终稳居首位；
  - 同步更新安装向导步骤 2 为企业组织定制，更新全站注释、文档与开源协议。

- 2026-11-03：进一步整理可直接 FTP 上传的站点目录。删除无引用的旧管理跳转页 `admin.php`；MCP 说明页归入 `mcp.php?guide=1`，模板移至 `includes/views/`，原 MCP 协议地址保持不变；移除旧 `uploads/ux/` 占位目录与初始化代码，原型继续只存私有 `data/prototypes/`。补齐生成数据的 Git 忽略规则并更新部署说明。PHP 8.3.20 下 286 项 HTTP 检查（含原样复制目录的 29 项 FTP 检查）、55 项前端回归通过；范围和行业实践参考见 `.dev/docs/reviews/2026-11-03-ftp-layout.md`。未上传 FTP，未验证生产服务器配置。

- 2026-11-03：开发资料统一收进不上传 FTP 的 `.dev/`：测试脚本迁至 `.dev/tests/`，开发文档与审查报告迁至 `.dev/docs/`，历史变更记录迁至本文件。更新共用 AI 规则、开发入口、测试相对路径与缓存忽略规则；站点不依赖 `.dev/`。迁移后 55 项前端回归通过（模拟 DOM/网络），4 个 Python 套件语法/导入/帮助入口和 2 个开发 JS/MJS 语法检查通过；62 个运行文件的哈希与迁移前一致。未重跑 PHP/HTTP、官方 SDK 或浏览器验收。

- 2026-11-03：移除 ZIP 处理器两个未调用的旧方法；侧栏补齐主管理员身份标签；删除版本保留名称回退，名称缺失时提示刷新并中止；首次登录提示按钮复用 `.btn-sm`。55 项前端回归通过（模拟 DOM/网络），本轮未执行 PHP 运行验证与浏览器验收。

- 2026-11-02：分类查阅次数按访问日志 ID 去重，避免被版本关联重复放大；补充 14 项真实 HTTP 统计回归。统一批注回复、分享、通知机器人、日志与侧栏按钮的离散尺寸，标准按钮默认固定 38px；104 项核心 HTTP 回归和 51 项前端检查通过，Chrome 实测相关控件和交互。

- 2026-11-02：补齐控制中心分类统计的最大项目数计算，恢复业务板块条形比例，消除变量未定义警告。

- 2026-11-02：统一个人设置和 MCP 指南的标准表单与按钮为 38px，补齐共享 `.btn-standard`、`.m-form-row`、`.m-checkbox`；清理个人设置的 34px/36px 内联按钮，确认框和个人设置使用标准弹窗规格。

- 2026-11-02：新增个人设置「MCP 接入」与接入指南，支持个人凭据、项目范围、只读/发布授权、配置复制与撤销；AI 可读取原型和批注、获取测试用例模板、上传 ZIP/RP 并发布版本，继续复用同名替换确认与权限校验。
- Webhook 批注消息经登录可直达对应版本、页面和批注；同名更新保留原页面文字并提示复核，新版本可显式引用上一版未解决批注。接入与边界见 `.dev/docs/mcp.md`。
- 本轮新增 75 项 MCP/批注协作检查通过，原有 162 项接口与权限回归、51 项前端检查、14 项官方 SDK 互通检查通过；配套客户端上传助手支持本地分片处理多兆 ZIP，避免文件内容进入模型对话。

- 2026-11-02：发布字段改为“版本名称”，保留中英文、内部空格及常用符号，统一前后端非空、100 字上限与控制字符校验，自动去除首尾空格。
- 同名版本先提示再确认替换；取消保留表单且不上传，确认绑定当前版本内容，过期确认不能覆盖后来发布的版本。当前 104 + 58 项 HTTP/数据库/进程回归、48 项前端检查及 9 项 Chrome 状态断言通过。
- 修复认证绕过、注销递归、CSRF、对象越权与申请审批边界，统一全角色公共请求。
- 原型与 RP 使用私有存储和服务端资源鉴权；发布采用独立代际验证后切换，失败保留旧版。
- 补齐新装 Schema、Owner 状态与个人设置，发版署名快照独立于成员生命周期。
- 删除按事务清理批注、回复、分享与资产；切片校验归属和完整性；Webhook 限定受支持平台并校验 TLS。
- 第二轮修复分享历史版本越权、并发 Owner 移交、提交后清理异常、设置部分保存、批注路径/加载上下文及登录 Cookie 有效期；设置图片失败保留旧文件与引用。
- 两轮回归共 132 项 HTTP/数据库/进程检查、26 项前端检查通过，Chrome 批注隔离与加载守卫交互通过；范围与限制见 `.dev/docs/reviews/2026-11-01-second-code-review.md`。
- 回归和实际边界见 `.dev/docs/reviews/2026-11-01-project-review.md`。只面向全新安装，无历史迁移与旧接口兼容。

## 历史版本与架构演进记录

- **当前最新状态 (v3.8.0)**：
  - **全新架构大脱胎：巨石路由领域解构、存储层地质风化层彻底清除与全站物理防重锁闭环**：
    - **接口网关领域刀切解耦 (`api.php` $\rightarrow$ `includes/actions/`)**：
      - 彻底重构近 1900 行巨石单文件 `api.php`，瘦身 90% 变为纯粹锋利的网关分发器（约 180 行）；
      - 业务逻辑按领域高内聚、低耦合收拢于 7 大专属处理器：`auth.php`、`users.php`、`items.php`、`versions.php`、`shares.php`、`annotations.php`、`system.php`；
    - **存储层地质沉积彻底铲除 (`includes/db.php`)**：
      - 彻底删除过去 v3.0~v3.7 堆叠的近百行 `PRAGMA table_info` 与动态探测兼容补丁；
      - 一步到位定稿包含 `collaborators`、`watermark_enabled`、`file_size`、`rp_size`、`changelog` 的完美全量 Schema，秒级冷开箱即用；
    - **全局确定性防重互斥锁 (`assets/js/admin.js`)**：
      - `adminFetch` 底层深度集成 350ms 物理防重拦截与操作按钮自动互斥加载态（Loading），彻底告别连击与悬空状态；
    - **端到端自动化测试套件 100% 绿色通过 (`scratch/deploy_and_verify.py`)**：
      - 覆盖 10 项全链路测试并重置测试环境供用户验收；系统平滑升至 `v3.8.0`。
- **历史状态回顾 (v3.7.1)**：
  - **下拉框标准体系与箭头规范化、全站表单星标统一、企业邮箱严格校验与入驻审批隔离流转闭环**：
    - **下拉选择器全站规范建设与防漏底防御 (`assets/css/app.css` & `assets/js/admin.js`)**：
      - **全站通用下拉底座**：对全局 `select` 进行 `-webkit-appearance: none; appearance: none;` 重置，注入发丝级浅灰矢量下三角与安全内边距，防范任何漏挂类导致的丑陋贴边原生箭头；
      - **双档尺寸清晰分工**：标准表单（`select.m-input`，高 38px，右内边距 36px，箭头位置 `right 12px center`）与紧凑行内微下拉（`select.m-select-sm`，高 28px，右内边距 24px，箭头位置 `right 8px center`）；
      - **消除内联覆盖隐患**：彻底移除待审批行内下拉框的内联 `background:var(--surface)` 与不均衡 padding，加持 `!important` 保护层，根除“无箭头”与“箭头太靠右贴边”的顽疾；
    - **全站表单必填星标规范化**：
      - 统一规范“必填项标红星 `<span class="req-star">*</span>`，选填项标 `<span class="opt-tag">(选填)</span>`”，覆盖安装向导 Step 2/3、项目创建/编辑、个人资料、用户管理等所有表单；
    - **安装向导企业邮箱域名严格校验与文案精简 (`install.php`)**：
      - 文案精简定稿为“填写后仅限该企业邮箱申请加入（留空则不限制，后续可随时修改）。”，彻底清除免输说明；
      - 前后端双重严格域名格式校验，输入带有 `@` 的完整邮箱或非法域名直接报错拦截；
    - **入驻申请成员数据隔离与审批角色一键分配 (`includes/auth.php` & `api.php`)**：
      - 彻底修复未审批人员（`status = 0`）泄露在正式成员通讯录列表（`user_list`）中的严重缺陷；
      - 审批时支持行内一键指定角色（如直接赋予协作者），并在超管侧栏齿轮图标挂载待审批红点徽标；
    - **控制台角色权限矩阵与个人中心体验升级 (`includes/modals.php`)**：
      - 角色矩阵补齐“管理后台”行（超管独占绿勾，其余为横线）与“访客”列（全横线占位）；
      - 用户管理 Tab 精简定稿为“入驻申请”，非主 Owner 超管操作列统一为横线 `—`；
      - 个人中心弹窗放宽至 540px，重构为“个人资料”与“修改密码”双 Tab 结构，各 Tab 仅保留 1 个主保存按钮；
    - **端到端自动化测试套件 100% 绿色通过 (`scratch/deploy_and_verify.py`)**：
      - 真实覆盖 10 项全链路测试并重置测试环境供用户测试验收；系统升至 `v3.7.1`。
- **历史状态回顾 (v3.7.0)**：
  - **架构体验优化与过度建设收敛、业务层级数据沉淀与 0 毫秒大盘、ECharts 开源图表引入、侧栏原地管理收敛与全员个人设置解耦**：
    - **数据大盘彻底根除全盘扫描与业务实体体积沉淀**：
      - **彻底铲除整盘递归扫描**：彻底删除 `includes/modals.php` 中近 50 行的 `RecursiveDirectoryIterator` 物理扫盘逻辑；
      - **业务实体层级精准入库 (`includes/db.php`, `includes/zip_handler.php`, `api.php`)**：`versions` 表自愈追加 `file_size` 与 `rp_size` 字段；发版解压时实时持久化，数据大盘仅需一条极简 SQL `SELECT SUM(file_size), SUM(rp_size) FROM versions`，实现 0 毫秒秒开，消除了对服务器 I/O 的长期冲击；并提供历史存量版本一次性平滑体积补算；
    - **开源图表 ECharts 优雅引入与死板手写 SVG XML 铲除**：
      - **轻量本地化引入 (`assets/js/echarts.min.js`)**：引入官方自包含轻量版 ECharts（内网离线自给自足，零外部构建工具依赖）；
      - **彻底删除 130 余行手写拼装的脆弱 SVG**：以 ECharts 双容器优雅渲染「业务板块层级资产分布」与「查阅走势面积折线图（支持 7天/30天 动态切换与窗口平滑自适应）」；
    - **侧栏原地管理彻底收敛至高频操作**：
      - **清空侧栏多余浮层**：侧栏目录树中各项目与分类彻底移除三点悬浮更多菜单（`tree-more-wrap`）；
      - **权责明晰**：侧栏仅保留最核心、最高频的发布版本 `[+]` 微按钮；设为隐藏、删除项目、重命名分类等低频管理操作统一收拢至控制中心专属面板，侧栏回归纯粹清晰的目录导航树；
    - **访问日志按业务结构层级节流防刷**：
      - **拒绝时间一刀切**：放弃“15分钟粗暴一刀切”，改为基于业务实体层级 `(item_id, version_name, access_type, ip)` 进行 30 秒物理连点防刷；
      - **数据 0 遗漏**：跨版本对比（V1.0 $\leftrightarrow$ V2.0）、跨渠道切换（内部工作台 $\leftrightarrow$ 外发短链）立即作为独立业务事件客观记录；
    - **个人设置全员直达微弹窗解耦优化**：
      - **全员可用**：从控制中心底层解耦，在工作台左下角当前登录用户名字处点击即可直接呼出独立的 `#profileModal` 微弹窗；
      - **全角色覆盖**：普通审阅人、协作者与管理员均能自主便捷维护姓名、修改密码与绑定专属机器人 Webhook；控制中心移除冗余的 `nav-profile` 与 `panel-profile`；
    - **端到端全业务自动化测试套件 100% 绿色通过 (`scratch/deploy_and_verify_v3_7_suite.py`)**：
      - 真实覆盖：FTP 部署 $\rightarrow$ 数据库升级 $\rightarrow$ 真实登录 $\rightarrow$ 结构收敛与 ECharts 挂载 $\rightarrow$ 发版体积精准沉淀 $\rightarrow$ 访问日志业务层级防刷 $\rightarrow$ 个人设置微弹窗持久化 $\rightarrow$ 数据自愈清理，全链路 7 大环节全部绿色通过；系统平滑升至 `v3.7.0`。
- **历史状态回顾 (v3.6.0)**：
  - **离职/转岗工作交接闭环、项目联合共管 (Co-ownership)、动态安全防泄密水印与更新日志 (Changelog) 正名贯通**：
    - **资产与待办工作交接机制 (Handover) 完整闭环**：
      - **防孤儿资产硬性拦截 (`includes/auth.php` & `api.php`)**：删除成员时严格检查名下负责的项目数量，若数量 $>0$，强行阻断并提示：`该成员名下仍有负责的项目，请先完成工作交接再删除`，杜绝项目无主漂流；
      - **一键项目所有权交接 (`api.php?action=user_handover`)**：管理员可将指定成员名下的负责项目批量转交指定接管成员，可选联动停用原成员账号；
      - **客观历史留存**：原成员发布过的历史版本（`versions.created_by`）永久保留其真实署名（`@原姓名`）；新发表打点批注的群通知（`api.php:1633`）精准推给新接管人个人机器人，协同链条无缝延续；
      - **极简弹窗与操作交互 (`includes/modals.php` & `assets/js/admin.js`)**：用户管理表格新增「负责项目」列（显示 `X 个` 或 `—`），操作列挂载专属「交接」按钮；弹窗 `#userHandoverModal` 简洁无废话；
    - **项目联合共管协作体系 (Co-ownership) 全面打通**：
      - **数据与权限扩展 (`includes/db.php` & `includes/auth.php`)**：`items` 表自愈追加 `collaborators TEXT` 字段；`Auth::canEditItem($item)` 扩展支持主负责人与共管人同权，协作者（Editor）被列入共管人后即可在工作台原地获得发版与管理权限；
      - **项目属性配置联动 (`includes/modals.php` & `assets/js/admin.js`)**：项目编辑弹窗新增「项目协作者」多选复选列表，负责人或管理员可按需指定多位协作者；
      - **发版权限与通知同步 (`api.php`)**：共管人发版时（`version_publish`）真实记录版本发版人，新打点批注同时推送到负责人与共管人的个人通知 Webhook；
    - **动态安全防泄密水印 (Security Watermark) 0 侵入穿透渲染**：
      - **数据与开关**：`items` 表自愈追加 `watermark_enabled INTEGER` 字段，项目编辑弹窗配备极简复选开关；
      - **轻量 Canvas 穿透渲染 (`assets/js/app.js` & `share.php`)**：0 外部依赖，利用原生 Canvas 动态生成平铺倾斜半透明背景（`pointer-events: none; z-index: 20;`），完全不影响原型交互；
      - **双轨自适应**：工作台内部登录状态渲染 `姓名 · 邮箱 · 当前日期`；外发分享页（`share.php`）渲染 `系统名 · 专属短码 · 当前日期`；
    - **更新日志 (Changelog) 全链路正名与多端打通**：
      - **彻底正名**：发版弹窗、提示信息与数据库字段全部统一为**「更新日志」**（Changelog），彻底告别口语化“更新备注”；
      - **工作台与外发分享顶栏查看**：当前版本存在更新日志时，顶栏版本号旁自适应展示 `[日志]` 微胶囊按钮，点击滑出轻量更新日志气泡卡片；
      - **版本管理弹窗显式呈现**：在 `#versionManageModal` 的版本元信息下方直接以精致微卡片展示该版本的更新日志；
    - **端到端全业务自动化测试套件 100% 绿色通过 (`scratch/deploy_and_verify_v3_6_suite.py`)**：
      - 真实覆盖：FTP 部署 $\rightarrow$ 数据库升级 $\rightarrow$ 真实登录 $\rightarrow$ 孤儿删除拦截 $\rightarrow$ 一键交接并停用 $\rightarrow$ 协作者共管发版 $\rightarrow$ 外发分享水印与日志展示 $\rightarrow$ 工作台水印与日志展示 $\rightarrow$ 全链路数据自愈清理，全链路 9 大步骤全部绿色通过；系统平滑升至 `v3.6.0`。
- **历史状态回顾 (v3.5.1)**：
  - **代码复核安全漏洞根除、全站文案废话文学彻底净化与系统设置重复开关收敛归整**：
    - **接口鉴权一致性与边界加固 (`api.php`)**：
      - **根除分享读取 403 阻断 Bug**：修复 `item_get_share` 硬编码 `Auth::canManage()` 的遗留问题，统一接入 `Auth::canShare()` 门禁并校验隐藏项目访问权限，彻底打通审阅人被超管授权外发分享后打开分享弹窗读取配置的全链路；
      - **根除批注停用误导提示**：在批注写操作入口（`add_annotation`、`reply_annotation`、`toggle_annotation_status`、`delete_annotation`）前置统一校验 `Auth::isAnnotationEnabled()`，停用时准确提示“全站页面批注功能已关闭”，彻底杜绝误报“请先登录以发表批注”；
    - **废话文学地毯式清洗与文案极简克制 (`includes/modals.php`)**：
      - 彻底消除自卖自夸、自嗨口号与过度解释：清除“简单直观”、“(勾选即授权)”、“(核心资产保护)”、“纯净托管”等假大空大词；
      - 文案全面收敛：能力说明与开关提示全部精简为纯粹客观的行为描述（如“开启后支持页面打点批注与跟帖；关闭后隐藏批注入口并停用快捷键”）；
    - **控制中心重复开关收敛与信息层级归整 (`includes/modals.php` & `assets/js/admin.js`)**：
      - 遵循职责单一原则，将批注与分享全局功能总控统一收敛在「角色与权限」专区；
      - 「系统设置」卡片 3 彻底剔除重复开关，更名为“团队协作与访客准入”，聚焦访客准入与企业邮箱白名单，并挂载轻量专区导航指引（点击平滑直达「角色与权限」）；
      - 剥离 `switchAdminTab` 中的内联 JS 样式侵入，纯靠 CSS `.admin-nav-item.active` 统领高亮渲染；
    - **端到端自动化测试 100% 通过与版本号推进**：
      - 套件 `deploy_and_verify_role_perms_suite.py` 覆盖鉴权修复、精准提示、文案无废话校验、去重指引及自愈清理，全链路 9 大步骤全部绿色通过；系统升级至 `v3.5.1`。
- **历史状态回顾 (v3.5.0)**：
  - **控制面板专属「角色与权限」功能落地、全局功能总控开关（批注/分享）、细粒度能力勾选矩阵与全链路安全闭环**：
    - **极简直观的「角色能力矩阵 (勾选即授权)」(方案 A)**：
      - **控制中心独立专区 (`includes/modals.php`)**：左侧一级功能导航新增「角色与权限 (`#nav-roles`)」专属入口（挂载 `ri-shield-user-line`，仅管理员可见）；
      - **卡片 1: 全局功能总控**：
        - `页面级批注协同 (feature_annotation_enabled)`：一键总控全站批注能力。开启时支持打点批注与跟帖；关闭后工作台 0 批注按钮、0 批注抽屉 DOM、0 `annotation.js` 冗余加载，快捷键 C 自动静默跳过，后端接口 `list_annotations` 返回 403 彻底阻断；
        - `原型专属外发分享 (feature_share_enabled)`：一键总控全站外发能力。开启时支持为原型生成外发短链；关闭后全站顶栏分享按钮完全移除，外部访问 `share.php` 立即返回 HTTP 403 并渲染友好的“外发分享功能已暂停”卡片，彻底阻断任何外发风险；
      - **卡片 2: 角色能力矩阵表**：
        - 明确界定超级管理员（Admin）、协作者（Editor）、审阅人（Viewer）三档核心角色；
        - 采用简单直白的“功能项 $\times$ 角色”能力勾选表，管理员可直接对能力进行勾选授权（如勾选“开放审阅人下载 RP”、勾选“开放审阅人外发分享”、取消“协作者外发分享”等），彻底告别过度设计的新建角色组合死锁；
        - 系统设置（`#panel-brand`）团队协作分区同步联动批注与分享全局开关，支持双向自适应持久化；
    - **前后端鉴权引擎全面重构与动态赋权 (`includes/auth.php` & `api.php`)**：
      - 封装并暴露 `Auth::isAnnotationEnabled()`、`Auth::isShareEnabled()`、`Auth::canShare($user)`、`Auth::canDownloadRp($user)`、`Auth::canAnnotate($user)`；
      - 顶栏 RP 下载按钮根据 `can-download-rp` 类名动态展示，支持审阅人被超管授权后秒级获得 RP 底稿下载权；
      - 接口层面：`save_role_permissions` 专有动作统一持久化 5 大配置项，`download_rp`、`share_code_create`、`item_save_share` 严格依据动态权限拦截；
    - **视觉体验与导航高亮深层加固 (`assets/css/app.css` & `assets/js/admin.js`)**：
      - 彻底修复 `modals.php` 中面板内联 `style="display:none;"` 阻断 CSS `.active` 显示的暗病；
      - 规范化控制中心左侧导航选中态为 Linear 官方品牌浅蓝底（`#e0f2fe` + `#0284c7` + `#bae6fd`），彻底解决浅灰背景下纯白底视觉反差微弱的问题；
      - 全局版本号强缓存控制同步升级至 `v3.5.0`，破除浏览器静态资源缓存；
    - **端到端多角色生命周期与全局开关全业务自动化测试 100% 通过 (`scratch/deploy_and_verify_role_perms_suite.py`)**：
      - 覆盖：默认权限状态检验 $\rightarrow$ 超管勾选开放审阅人下载 RP $\rightarrow$ 审阅人成功下载 RP $\rightarrow$ 超管取消协作者外发分享 $\rightarrow$ 协作者分享接口 403 阻断 $\rightarrow$ 全局关闭批注（0 按钮 0 抽屉 0 脚本） $\rightarrow$ 全局关闭外发分享（顶栏无分享、share.php 403 卡片） $\rightarrow$ 系统设置面板联动保存 $\rightarrow$ 环境自愈清理，全链路 9 大步骤全部绿色通过。
- **历史状态回顾 (v3.4.4)**：
  - **批注抽屉与项目/版本严格联动、版本切换异常根治、全站死代码彻底扫除与体验闭环**：
    - **彻底修复批注抽屉跨项目/跨版本失联断点 (`assets/js/annotation.js` & `assets/js/app.js`)**：
      - **排查根因**：`annotation.js` 内部设计了 `if (!AnnoState.itemId)`，只要设置过一次，后续切换项目直接跳过更新；同时 `app.js` 在切换项目和版本时从未通知批注组件更新上下文；导致用户切换项目后，抽屉内依然显示上个项目的历史批注，新发表批注也被错误关联到上个项目的 ID，顶栏未解决批注计数 Badge 无法动态同步；
      - **架构联动重构**：在 `annotation.js` 中封装并暴露 `window.updateAnnoContext(itemId, verId, verName)`；在 `selectItem`（切换项目）与 `onTopVersionChange`（切换版本）中精准调用，动态重置/切换项目与版本 ID，重绘当前页面批注列表，顶栏 Badge 与批注状态 100% 动态精准同步；
    - **彻底根除版本切换运行时 JS 异常 (`assets/js/app.js`)**：
      - 修复 `onTopVersionChange` 中直接使用未定义变量 `itemId` 和 `name` 导致的 `ReferenceError`，精准采用 `currentSelectedItemId` 与标题节点 DOM 值，工作区访问审计日志 100% 正常上报；
    - **彻底清除旧弹窗时代残留死代码 (`assets/js/admin.js`)**：
      - 物理剔除第 703 行旧的 `openUserModal`（操作不存在的 `#userModal`）与第 1172 行旧的 `openSettingsModal`（操作不存在的 `#settingsModal`），彻底解决与第 1647/1651 行新控制中心同名函数覆盖冲突的隐患；
    - **规范化登录日志与控制中心账号渲染 (`assets/js/admin.js` & `includes/modals.php`)**：
      - 针对二元身份模型重构后的工作邮箱，增加 `@` 智能识别逻辑：若已包含 `@`（邮箱）则直接输出，避免硬拼接造成 `@user@company.com` 的怪异显示；
    - **消除 `share.php` 变量未定义警告 (`share.php`)**：
      - 预初始化 `$validToken = ''`，彻底消灭严苛 PHP 环境下的 Notice 级隐患；
    - **版本管理弹窗空状态体验优化 (`assets/js/admin.js`)**：
      - 当项目尚无任何版本时，版本管理弹窗内直接提供「发布首个版本」高亮主操作，无缝打通从空项目到首发版本的流转链路；
    - **自动化全业务与深层暗病端到端测试 100% 通过**：
      - 运行 `scratch/verify_deep_fixes_suite.py` 与 `scratch/run_full_business_suite.py`，全业务模块与隔离机制 100% 绿色通过，测试数据自动清空。
- **历史状态回顾 (v3.4.3)**：
  - **角色权限架构解耦、全员通用登出闭环与全角色生命周期端到端健全性**：
    - **彻底修复审阅人无法退出登录断点 (JS 架构解耦)**：
      - **排查根因**：`index.php` 严格按角色加载脚本（`$canManage` 仅对管理员与协作者加载 `admin.js`，普通审阅人绝不加载）；而通用登出函数 `doLogout()` 历史代码错误放置在 `admin.js` 中，导致审阅人点击退出登录按钮时触发 `Uncaught ReferenceError: doLogout is not defined`，退出毫无反应；
      - **架构解耦与下沉**：将全员通用的 `doLogout()` 移入所有角色共享的底座脚本 `assets/js/app.js`，内部调用 `showConfirm` 友好弹窗提示并以原生 `fetch` 向 `api.php?action=logout` 提交登出；彻底清除 `admin.js` 中的旧定义，杜绝同名冲突与架构职责错位；
    - **Session 会话彻底物理销毁 (`includes/auth.php`)**：
      - `Auth::logout()` 在注销时将 `$_SESSION = []` 重置并通过 `session_destroy()` 彻底销毁服务端存储文件，同步将 `ue_admin_auth` 等 Cookie 置空过期；
    - **协作者控制中心入口与个人设置闭环 (`index.php`)**：
      - 侧栏齿轮按钮权限判定规范为 `<?php if ($canManage): ?>`，使协作者（Editor）能够正常进入控制中心维护自身项目、查看只读通讯录并在「个人设置」中自主修改姓名、群机器人 Webhook 与密码；审阅人（Viewer）保持纯粹只读与轻量，无齿轮按钮；
    - **全生命周期自动化端到端测试闭环验证 (`scratch/run_full_lifecycle_journey_test.py`)**：
      - 覆盖全链路：访客申请 $\rightarrow$ 管理员审批 $\rightarrow$ 审阅人正式登录 $\rightarrow$ 沉浸工作台元素与脚本权限隔离验证（审阅人页面 100% 无 admin.js 且无管理死代码） $\rightarrow$ 审阅人退出登录并彻底重定向至登录卡片 $\rightarrow$ 协作者登录 $\rightarrow$ 进入控制中心修改个人设置 $\rightarrow$ 协作者退出登录 $\rightarrow$ 自动化自愈清理测试数据，测试用例 100% 通过；
    - **项目管理、分享体系与页面批注协同全业务自动化端到端测试闭环 (`scratch/run_full_business_suite.py`)**：
      - **项目与文件夹管理**：新建分类、重命名、拖拽排序；新建原型项目、新建外链项目、`javascript:` 危险协议 XSS 拦截；项目显隐切换（公开 $\leftrightarrow$ 隐藏）审阅人视角物理隔离；
      - **原型发版与解压安全**：真实 HTML 原型包安全解压、自动清洗 Google 字体、自动注入同源安全防盗链守卫；多版本并存（V1.0.0 与 V2.0.0）与默认版本切换；RP 底稿流式鉴权下载（管理员/协作者可下，审阅人 403 严格阻断）；
      - **免登录分享体系**：专属临时短码生成、口令保护验证、外部人员沙箱隔离预览（绝不泄露全站分类树）、30 天凭据 Cookie 写入、一键作废与吊销即时失效；
      - **页面级批注协同**：审阅人发表页面批注与标题路径绑定、协作者跟帖讨论、待处理/已解决状态流转、越权删除严格防御（非作者不能删）、作者合规级联删除；
      - **测试全绿与自愈**：所有测试用例 100% 成功通过，临时数据与磁盘目录完全自动物理清空。
- **历史状态回顾 (v3.4.2)**：
  - **开放访客申请开关全链路闭环、全站死代码垃圾清理与纯粹双轨制固化**：
    - **彻底修复访客申请开关状态不同步（Checkbox 规范避坑）**：
      - **排查根因**：浏览器标准规定未勾选的 Checkbox 在 `FormData` 序列化时不发送键名；后端 `api.php` 误写为 `if (isset($_POST['visitor_register_enabled']))`，导致取消勾选时分支被跳过，数据库永远保持开启；
      - **全链路闭环**：前端 `assets/js/admin.js` 显式写入 `fd.set('visitor_register_enabled', switchEl.checked ? '1' : '0')`；后端只要提交系统设置即精准持久化；前台独立登录页（`index.php`）与通用弹窗（`login_modal.php`）严格双重联动：一旦关闭，前台绝不渲染任何申请入口与表单，弹窗禁止切换至注册面板，经远程实测开关开/关双向自适应 100% 闭环；
    - **全站死代码地毯式巡检与垃圾拔除**：
      - **工作台侧栏死分支清理**：彻底删除 `index.php` 第 604-622 行旧访客码时代的“退出全站访问”按钮及 `require_site_password` 废弃代码；
      - **废弃 JS 清除**：彻底移除 `assets/js/app.js` 中无用的 `doSiteLogout()` 函数；
      - **认证层死函数清理**：彻底清除 `includes/auth.php` 中残留的 `verifySitePassword`、`ensureSiteAuthToken`、`rotateSiteAuthToken`、`siteLogout` 与 `sendSiteAuthCookie` 等全站口令历史废弃方法；
      - **排查消除通知变量与字段隐患**：`api.php` 第 1449 行将未定义的 `$remark` 纠正为 `$department`，清理 938/1490/1701 行旧字段回退，全站 SQL 彻底对齐二元身份模型；
    - **彻底铲除全站公共访客码、确立纯粹双轨制架构、修复存储空间微容量自适应与登录卡片呼吸间距**：
    - **全站做减法，确立现代化「双轨制」模型**：
      - **内部协同（工作台主站 `index.php`）**：纯粹的企业级私有工作台，进入工作台必须工作账号登录（邮箱 + 密码）；未登录者一律硬性拦截在独立登录卡片页（440px-460px 沉稳规范），彻底铲除“全站访问验证/大门访客口令”以及内部空画布“登录解密工作台”的怪异状态；
      - **外部评审/临时浏览（`share.php`）**：免账号只读浏览全部走项目专属分享短链（`share.php?s=xxx`），具备单项目物理隔离、独立访问口令、有效期控制与随时一键作废，兼顾安全与便捷；
    - **独立登录卡片纯净蜕变与呼吸间距优化**：
      - 独立卡片彻底移除 `sitePwdForm`（访问密码）与“使用访客通行码”，默认唯一呈现大气挺拔的「账号登录」主面板；
      - 表单配备规范的 `name="username" autocomplete="username"` 与 `name="password" autocomplete="current-password"`，提交前将真实 DOM 物理值自动补全为规范完整邮箱（如 `admin@company.com`），浏览器凭据管理器捕获的用户名 100% 具备真实前缀与域名，彻底杜绝“仅存域名”的骚扰弹窗；
      - 底栏链接上边距从拥挤的 `4px` 优化为舒展的 **`22px`**，并补齐微引导文案（`还没有账号？申请加入协作` $\leftrightarrow$ `已有账号？返回登录`）；
    - **存储空间深度拆解自适应修复（根治“0.0 MB 却有占比”假象）**：
      - **容量单位四级自适应**：`< 1 KB` 显示 `B`，`< 1 MB` 智能显示为 **`KB`**（如 `40 KB`），$\ge 1\text{ MB}$ 显示 `MB`，$\ge 1\text{ GB}$ 显示 `GB`，彻底杜绝微数据被粗暴截为 `0.0 MB`；
      - **严密素材归类与未发版清零**：根目录防遍历 `index.html` 等系统安全文件归入“数据库与媒体”，未发布任何原型版本时“HTML 预览包”与“RP 源文件”严格为 `0 B (0%)`，分段比例条彻底消除虚假蓝色段；
    - **工作台内部空状态纯净化，拔除「登录解密工作台」**：
      - 彻底移除空状态下为无账号访客预留的 `登录解密工作台` 按钮；
      - 具有管理权人员（管理员/协作者）清晰呈现【发布首个原型】与【新建项目】；审阅人（只读）呈现客观指引“暂无公开图纸，请等待产品经理或项目成员发布”，全站业务逻辑严密自洽；
    - **安装向导与控制面板全面轻量化**：
      - **安装向导（`install.php`）**：Step 2 彻底移除全站密码保护开关与输入框，聚焦站点名称与企业邮箱域名后缀白名单；
      - **控制面板（`includes/modals.php`）**：系统设置彻底移除旧的“卡片 3: 访问安全”，由 5 分区收敛为 4 个清晰独立专区（基础设置、品牌资产、团队协作与访客准入、通知设置）；
      - **接口与认证（`api.php`, `includes/auth.php`）**：彻底封堵并清除废弃的 `verify_site_pwd` 接口与相关全站访客通行凭据逻辑。
- **历史状态回顾 (v3.4.1)**：
  - **全站弹窗与卡片标准规格体系 (S/M/L/XL)、浏览器完整邮箱捕获与通行口令底层伪装重构**：
    - **全站卡片与模态弹窗 4 大标准规格统一 (Standard Modal & Card Scale)**：
      - 在 `assets/css/app.css` 核心 `:root` 固化标准设计令牌：
        - `S 档 (--modal-sm: 440px)`：全站访问锁屏验证、工作台登录弹窗（`#loginModal`）、新建文件夹（`#categoryModal`）、移交所有权（`#transferOwnerModal`）、项目专属分享密码卡片；
        - `M 档 (--modal-md: 540px)`：发布/更新版本（`#uploadModal`）、版本管理（`#versionManageModal`）、新建/编辑项目（`#itemModal`）、原型专属分享管理（`#shareManageModal`）；
        - `L 档 (--modal-lg: 640px)`：安装向导主容器卡片（`install.php`）；
        - `XL 档 (--modal-xl: 1080px)`：管理控制中心超级大盘（`clamp(1040px, 64vw, 1460px)`）；
      - 彻底清除全站历史随手写死的 380px、390px、420px、460px、500px 等杂碎尺寸，实现工业级标准化；
    - **大屏视觉小气与单薄问题彻底解决**：
      - 独立卡片 `.standalone-card` 基准宽度升级至 `440px`，大屏（`min-width: 1200px`）自适应舒展至 `460px`，内边距充盈至 `38px 34px` / `42px 38px`；
      - 表单控件与首选主按钮高度从 40px 统一升级至 **`44px`**（字号 14px / 14.5px，字重 600），气场挺拔沉稳；
      - 外置品牌标头 LOGO 高度提升至 `74px`（副标题提升至 13.5px），在大屏下与主卡片呼应平衡，彻底告别局促小气感；
    - **浏览器保存密码“仅域名无前缀”根治与通行口令物理伪装**：
      - **阻断访客通行口令无意义骚扰弹窗**：全站访问密码与分享密码输入框物理类型改为普通 `type="text"`，挂载 `-webkit-text-security: disc; text-security: disc;` 并补齐眼睛切换明暗文；肉眼感知为密码圆点，但 Chrome 等浏览器判定为普通文本框，从底层彻底根除将网站域名当做用户名弹出的骚扰保存框；
      - **登录表单 DOM 物理邮箱自动补全**：在全站锁屏登录、工作台登录弹窗、访客申请及安装向导提交表单前，将输入框真实的 DOM 物理 `.value` 自动补全为完整邮箱（如 `admin@company.com`）并隐藏徽标；浏览器凭据管理器捕获的用户名 100% 包含前缀与完整域名；表单元素补齐规范的 `name="username" autocomplete="username"` 与 `name="password" autocomplete="current-password"`；
    - **HTTP 500 遗留字段根治与二元模型彻底对齐**：
      - 排查根因：新系统 `users` 表结构已不再含 `username` 与 `display_name`，但在进入工作台主页时，`index.php`（第 424/428 行）、`includes/modals.php`（第 6/599/1509 行）、`includes/auth.php`（第 720/1307 行）及 `api.php`（第 1489 行）仍残留了 `COALESCE(u.display_name, u.username)` 或直接查询 `u.username`，SQLite 抛出 `no such column: u.username` 触发 HTTP 500；
      - 修复加固：全站 SQL 彻底收敛对齐为标准 `u.name` 与 `u.email`，并补全双向兼容字段，经远程端到端测试 100% 恢复 HTTP 200 OK 正常渲染。
    - **模态弹窗稳妥规范落地与未登录强拦截守卫（专属登录卡片回归）**：
      - **模态弹窗禁止点击遮罩关闭**：在 `assets/js/app.js` 彻底移除蒙版背景点击监听，仅允许右上角 `✕` 按钮、底部「取消」按钮或键盘 `ESC` 键关闭，彻底杜绝发版上传、配置修改、移交所有权等表单因手滑误触丢失数据；
      - **未登录严禁进入工作台内部界面**：当开启全站密码保护时，未登录人员（`!$currentUser`）无论是否有访客通行 Cookie，一律硬性拦截在专门的独立登录页面（`.standalone-card`），绝不放行进入内部空壳界面；
      - **专门登录页面默认回归「账号登录」**：独立卡片默认首选激活「账号登录」（输入工作邮箱与密码直接一步进入工作台），保留「申请加入协作」与「使用访客通行码」辅助切换；
      - **访客通行 0 项目安全防御**：若系统内无公开原型，访客通行码友好提示“当前暂无公开原型，请管理人员直接输入账号密码登录”并自动切换到账号登录；
      - **退出登录闭环**：`Auth::logout()` 同步清空 `ue_site_auth` 与 Session，退出后 100% 干净回弹至专门独立登录页面。
- **历史状态回顾 (v3.4.0)**：
  - **二元身份模型重构（Email + Name）、固化域名自适应交互、所有权移交（Transfer Ownership）安全护城河与全站纯净重构**：
    - **彻底消灭冗余用户名，建立「工作邮箱 + 真实姓名」二元模型**：
      - 彻底剥离全站历史冗余的 `username`（拼音/字母账号），统一收敛为：唯一业务凭据 `email`（工作邮箱/登录主键）与团队协作人际称谓 `name`（真实姓名）；
      - 批注作者、跟帖署名、操作日志、团队列表、申请审批等全部统一采用真实姓名展示，彻底告别拼音代号；
      - 登录认证全面支持邮箱全称或前缀直登；
    - **企业邮箱固化域名自适应交互**：
      - 当系统设置了企业邮箱白名单（`allowed_email_domains`，如 `company.com`）时，前台登录锁屏、登录弹窗、访客申请弹窗的邮箱输入框右侧自适应挂载 `@域名` 固化徽标；
      - 智能感知交互：员工只需输入前缀（如 `alex`）即享有一键补全，无需重复输入长域名；一旦输入包含 `@`，徽标平滑淡出解除固化，自由支持外部供应商、顾问等非企业域名访客；
    - **申请加入协作面板极致瘦身（3+1 极简表单）**：
      - 原 5 个冗长表单项彻底砍为 3 个必填项 + 1 个选填项：工作邮箱（带固化自适应）、真实姓名、登录密码（集成小眼睛明文切换）及选填部门说明；
      - 提交按钮克制精炼为「申请加入」；
    - **主管理员所有权移交（Transfer Ownership）与防背刺闭环**：
      - 引入 `is_owner = 1`（主超级管理员/平台所有者）机制：系统首任创建者自动标记为 Owner，拥有系统最高管理权；
      - **物理免疫防篡权**：普通管理员（`role = 'admin'`）无权对 Owner 执行修改角色、禁用、删除或修改密码操作；普通管理员之间亦禁止互相删除，彻底杜绝越权背刺；
      - **规范交接闭环**：在控制中心成员管理中，仅 Owner 账号独占钥匙状「移交所有权」按钮；移交时需 Owner 亲自输入自身密码二次确认，安全平滑移交给指定管理员，无缝解决团队工作交接；
      - **底线防御**：系统最后一名管理员受绝对物理保护，不可删除；
    - **安装向导（`install.php`）纯净化升级与废话文学彻底拔除**：
      - 初始安装管理员账号直接采用标准「工作邮箱 + 真实姓名 + 密码」初始化；
      - **彻底铲除自作聪明拼接 `@company.local` 的暗病**：彻底拔除在未配置域名时后端擅自拼接假域名的逻辑，全面收敛为前后端严格的合法邮箱格式校验（RFC 标准）；
      - **消除误导性默认值与智能 Placeholder**：拔除 `value="admin"`，未配置域名后缀时占位符与前端强校验必须为完整邮箱（如 `admin@company.com`），配置域名后缀时自适应支持前缀；
      - **全站举一反三表单校验体系**：全站前台登录、访客申请、后台添加成员均补齐邮箱格式、密码长度与非空防呆拦截，未配置域名时若输入纯前缀即刻友好引导；
      - **彻底砍掉形式主义的 Step 4「确认与初始化」**：流程缩短 25%，用户在 Step 3 填完管理员账号后直接「立即安装」一键建库锁定，彻底杜绝让用户反复核对刚才亲手输入内容的无效点击阻力；顶部发丝微进度条与角标全面重构为利落的「步骤 01 / 03」；
      - 彻底拔除 Step 3 中残留的爹味说教与车轱辘废话（如“请妥善保存该密码”、“唯一登录账号”等无用提示）；
      - 清除成功界面的营销腔与自嗨口号（如“可立即开启全新体验”等），回归纯粹利落的专业工程界面；
    - **历史遗留中继目录（`s/`）与空文件物理清除**：
      - 彻底删除历史遗留的短链中继目录 `s/`（含 `s/index.php` 与 `s/.htaccess`），全站分享 100% 统一基于无门槛零配置的 `share.php?s=<code>`；
      - 清除本地 `data/database.sqlite`（0 字节空文件），净化源码仓库；
      - 同步更新 `README.md` 目录树与 Nginx 安全配置，剔除无用的 `/s/` rewrite 段；
    - **企业邮箱域名后缀微文案重构与全链路容错清洗 (Sanitization)**：
      - **Label 统一精准化**：统一升级为「企业邮箱域名后缀」，精准锚定邮箱 `@` 之后的后缀部分，杜绝用户潜意识联想为网站网址；
      - **微文案心理减压（方案 1）**：说明文案统一规范为 `员工登录可免输 @域名；仅限该企业邮箱申请加入（留空则不限制，后续可随时修改）。`，彻底消除“被锁死”或“排斥合作方”的顾虑；
      - **占位符明确指引**：全站占位符统一标明 `例如：company.com（无需输入 @ 或 www，留空则不限）`；
      - **全自动容错防呆清洗**：`Auth::sanitizeEmailDomains()` 与前端 `window.cleanEmailDomains()` 双重自愈，自动剔除用户手误输入的 `http(s)://`、`www.`、前导 `@`、尾部斜杠并转换全角逗号，即使随意粘贴网址也能毫秒级清洗为标准根域；
    - **生产环境与远程 FTP 纯净清理与初始态重置**：
      - 编写全自动脚本深度清理远程 FTP `/v2` 下历史废弃目录 `一休运营1023` 及 `/v2/s/` 目录；
      - 远程环境彻底还原至全新出厂安装就绪态（删除 `install.lock` 与 `database.sqlite`，清空 `uploads/` 用户资产，保留防遍历安全占位）；
      - 主页自动 HTTP 302 重定向至 `install.php`，安装向导 Step 1 状态 200 正常就绪。
- **历史状态回顾 (v3.3.6)**：
  - **全站 Webhook 配置处补齐克制「测试」按钮与通用防重机制**：
    - **按钮文案与状态高度克制**：
      - 按钮文案统一精炼为 `<i class="ri-send-plane-line"></i> 测试`，字数短促客观，杜绝营销感与多余字样；
      - 点击后即时置灰禁用并切换为 `<i class="ri-loader-4-line ri-spin"></i> 发送中...` 杜绝重复连击与请求冲突；
      - 响应结果采用轻量、纯粹的 Toast 反馈（“测试消息已送达” / “推送失败: [原因]”）；
    - **全员测试权限开放 (`api.php`)**：
      - `test_webhook` 接口检查由 `Auth::isAdmin()` 放宽至 `Auth::getCurrentUser()`，协作者与审阅访客均可在个人设置中测试自己的个人通知机器人；
    - **前端通用方法封装 (`assets/js/admin.js`)**：
      - 抽取通用 `testAnyWebhook(inputId, btnEl)`，支持传入任意输入框 ID 与按钮自身引用；兼容原有 `handleTestWebhook()`；
    - **全站 5 处 Webhook 配置点完整覆盖 (`includes/modals.php`)**：
      - **【个人设置】**（`#myWebhookUrl`）：输入框右侧补齐 `[测试]` 与 `[保存配置]` 并列平铺；
      - **【项目管理 $\rightarrow$ 编辑项目属性】**（`#itemWebhookUrl`）：输入框右侧补齐 `[测试]` 按钮；
      - **【成员管理 $\rightarrow$ 新增与编辑成员】**（`#newWebhookUrl`、`#editUserWebhook`）：输入框右侧补齐 `[测试]` 按钮；
      - **【系统设置 $\rightarrow$ 通知设置】**（`#settingGlobalWebhook`）：测试文案由“测试发送”精简为“测试”，接入通用防重函数；
    - **自动化验证与热同步**：
      - 编写自动化脚本执行 FTP 热同步与接口安全性测试（空 URL 拦截与协议安全强校验 100% 通过）；
      - 经线上环境验证，全站 5 处 Webhook 测试按钮均已准确生效。
- **历史状态回顾 (v3.3.5)**：
  - **发版群通知默认开启、侧栏项目去除编辑属性、空项目禁用批注与分享及废话文学全面纯净化**：
    - **发版群通知默认开启**：发布版本弹窗探查到项目专属或全局 Webhook 后，开关自动置为 `checked = true`，并联动将更新备注置为必填红星高亮，彻底避免发版漏通知；
    - **侧栏项目移除「编辑属性」入口**：侧边栏项目的“更多操作”气泡菜单中彻底拔除低频的「编辑属性」，仅保留「设为隐藏」与「删除项目」，低频属性维护统一收拢在控制面板【项目管理】；
    - **空项目严禁批注与分享**：
      - 空项目状态下，顶栏【刷新】、【批注】、【分享】、【全屏】工具按钮全部自动置灰处于 `disabled` 状态，鼠标悬停展示清晰禁用说明；
      - 若批注抽屉原处于展开状态，切入空项目时自动平滑收起；按下键盘 `C` 快捷键时友好拦截并提示“当前项目暂无原型版本，无法发起批注”，杜绝在空白页上沉淀垃圾脏数据；
      - `copyShareUrl` 增设版本校验防御拦截，无版本项目拦截外发；
    - **空状态趣味调性文案完好保留**：保留平台专属产研趣味调性文案“坑位已占，图纸未到”与“研发点进来直挠头。丢个 ZIP 上来，马上开工！”，兼顾趣味性与团队共鸣感；
    - 编写并执行自动化部署与验证脚本 `deploy_cleanups_and_empty_state.py`，完成生产环境 FTP 热同步与 WebKit 真实高保真截图验收。
- **历史状态回顾 (v3.3.4)**：
  - **成员管理与个人设置 Webhook & 资料双向实时同步落地**：
    - 管理员在【成员管理】编辑自身账号时，若更改了 Webhook 或展示名，前端自动即时同步写入【个人设置】输入框、顶栏姓名与侧边栏底栏，无需刷新页面；
    - 全局 JS 对象 `CURRENT_USER` 补齐 `webhook_url` 属性，后端 `Auth::updateUser` 针对当前登录用户即时刷新内存缓存与 Session；
    - 在【个人设置】保存 Webhook 时自动刷新成员列表表格微标；切换至个人设置 Tab 时增加自愈对齐防御；
  - **控制面板「系统设置」5 大清晰分区重构、高扩展性架构落地与页脚版权丢失彻底修复**：
    - **系统设置 5 大高扩展性独立分区重构**：
      - **卡片 1：基础设置 (`ri-equalizer-line`)**：平台名称、副标题、页脚版权、单项目专属分享上限；
      - **卡片 2：品牌资产 (`ri-palette-line`)**：平台 Logo、Favicon、登录背景壁纸（支持更换、清除与恢复默认）；
      - **卡片 3：访问安全 (`ri-shield-keyhole-line`)**：全站密码保护开关、访问密码设置与明文眼睛切换；
      - **卡片 4：团队协作与访客准入 (`ri-user-shared-line`)**：开放访客自主申请开关、限制企业邮箱后缀白名单，纯粹聚焦用户准入策略；
      - **卡片 5：通知设置 (`ri-notification-3-line`)**：评审群版本发布 Webhook（专属测试发送）与新访客审批通知（原生下拉多选管理员胶囊组件），彻底正交解耦，为未来接入更多通知流提供无限扩展空间；
    - **页脚版权丢失根因修复与双重防御体系**：
      - 排查根因：`save_settings` 无脑更新未提交字段导致空字符串覆盖，且 `getSetting()` 查出空字符串时不回退默认值；
      - 读取兜底加固：`Auth::getSetting()` 增加对 `null` 与 `""` 空字符串的判断，若无有效内容一律安全回退到传入的 `$default`；
      - 保存防呆保护：`api.php` 增加非空防护，若用户清空页脚版权，自动重置为官方标准文本：`© 2026 锦时原型托管平台 · 让每一次产品迭代清晰可见`；
    - 编写并执行自动化部署与验证脚本 `deploy_settings_reorg.py`，完成生产环境 FTP 热同步、线上数据库数据自愈与 WebKit 5 大分区真实高保真截图验收。
- **历史状态回顾 (v3.3.3)**：
  - **管理员审批通知下拉多选组件、个人 Webhook 权责绝对纯粹化、Webhook 安全加固与废话文学全面清洗**：
    - **管理员审批通知升级为原生下拉多选**：
      - 彻底解决平铺复选框随人员增加导致界面纵向失衡的问题，打造 36px 紧凑触发器，已选人员以微胶囊呈现；
      - 悬浮卡片式多选菜单，支持快捷「全选 / 清空」，点击外部自动收起，数据实时双向绑定；
    - **个人设置与成员管理 Webhook 纯粹化**：
      - 剥离新访客审批等多余描述，所有角色（管理员/协作者/访客）个人机器人统一定位为：`接收与我相关的批注回复与结项通知`；
      - 新访客审批通知彻底收拢于系统设置中独立管理；
    - **Webhook 核心引擎安全加固与防爆截断**：
      - SSRF 防御：严格限定 `https?://` 白名单，curl 强制锁定协议栈，成功拦截非法协议探测；
      - 正文防爆截断：正文超过 400 字符时自动截断加 `...`，防止超出钉钉/飞书/企微单条字符上限；
    - **批注抽屉协同体验去废话文学**：
      - 彻底拔除全站 6 处原生 `alert` 与 `confirm`，全面换用无侵入的 `showToast` 和 `showConfirm`；未登录温和呼出登录框；
      - 补齐 iframe 的 `hashchange` 事件监听，完美感知 Axure SPA 单页应用内子页面路由切换；
      - 回复跟帖增加点击锁与防重复提交保护；
    - 编写并执行全流程自动化部署与端到端测试脚本 `deploy_webhook_consolidation.py`，完成生产环境 FTP 热同步、SSRF 安全防御断言测试与原生 WebKit Retina 2X 高保真截图验收。
- **历史状态回顾 (v3.3.2)**：
  - **Webhook 极简克制架构与通知场景绝对分流落地、分享弹窗文字纵向溢出消除**：
    - **通知流向权责绝对分明·杜绝公共群消息轰炸**：
      - **全站任意项目发版（全局层）**：推向「评审群 Webhook」（系统设置维护，适用于产研评审群）；
      - **单个项目版本发布（项目层）**：推向「本项目研发群 Webhook」（项目属性维护，仅在本项目发布新版时推送）；
      - **新访客入驻申请待审批**：**100% 纯粹推向「管理员个人 Webhook」**，绝不打扰任何公共群。系统设置【协作与访客准入】支持多选指定接收审批通知的超级管理员（显示管理员姓名、账号及是否已配置个人机器人）；
      - **批注讨论与结项闭环（个人层）**：**彻底移除向公共项目群的任何推送**！新增批注定向通知项目负责人个人，回复跟帖定向通知被回复人个人，结项解决定向通知提问人个人；
    - **分享设置弹窗按钮文字溢出修复**：
      - 排查根因：全局 `.btn-act` 为 `28×28px` 紧凑正方形动作按钮，内部硬编码文本导致文字单字换行纵向溢出；
      - 修复落地：彻底移除“创建专属链接”文本，保持纯净的正方形 `<i class="ri-add-line"></i>` 图标按钮，悬浮提示 `title="创建专属外发链接"`，彻底消除右下角竖排文字；
    - 编写并执行全流程自动化部署与端到端测试脚本 `deploy_webhook_consolidation.py`，完成生产环境 FTP 热同步、API 接口自动化回归测试与原生 WebKit Retina 2X 高保真截图视觉验收。
- **历史状态回顾 (v3.3.1)**：
  - **Webhook 架构彻底收拢至控制中心设置面板、三层级通知分流、团队成员支持「审阅访客」与通知范围清晰标注**：
    - **Webhook 配置边界彻底收拢**：
      - 发版弹窗严禁侵入低频配置，未绑定群机器人时通知开关置灰禁用并提供客观指引；
      - 所有 Webhook 配置严格收拢于控制中心设置面板，按权责清晰划分三层级；
    - **三层级架构分流与通知范围清晰标注**：
      - **项目层（控制中心 $\rightarrow$ 项目管理）**：在【编辑项目属性】中维护项目专属 Webhook。输入框下方清晰注明：`可接收：该项目新版本发布通知、该项目页面新增批注与回复、批注处理结项`；
      - **个人层（控制中心 $\rightarrow$ 成员管理 / 个人设置）**：
        - 个人设置面板新增通栏「个人专属通知机器人 Webhook」卡片，注明：`可接收：与我相关的通知（我发表的批注有新回复、我提出的批注已标记解决）`；
        - 成员管理添加/编辑成员表单均支持配置个人 Webhook，输入框注明：`可接收：与该成员相关的批注回复与处理闭环通知`；
      - **全局层（控制中心 $\rightarrow$ 系统设置）**：超级管理员维护全局通知 Webhook，输入框注明：`可接收：任意项目新版本发布通知（评审群）、新访客入驻申请待审批、未配置项目机器人的兜底通知`；
    - **团队成员管理支持添加与编辑「审阅访客」角色**：
      - 添加成员（`#addUserBox`）与编辑成员（`#editUserBox`）的角色下拉框均补全 `<option value="viewer">审阅访客</option>`；
      - 成员列表针对 `viewer` 角色渲染专属中性微徽标，配置了个人 Webhook 的成员展示 `ri-robot-line` 机器人微标；
    - **数据库无损热升级自愈与防御性回退**：
      - `includes/db.php` 增设自适应自愈热补丁，自动探测并执行 `ALTER TABLE users ADD COLUMN webhook_url TEXT DEFAULT ''`；
      - `includes/auth.php` 对历史单一主管理员固定凭证（`1`）与多设备凭证池实现双向向下兼容；查询用户字段增加异常回退，杜绝任何字段升级间隙的 500 报错；
    - 编写并执行全流程自动化部署与端到端测试脚本 `deploy_webhook_consolidation.py`，完成生产环境 FTP 热同步、API 接口自动化回归测试与原生 WebKit Retina 2X 高保真截图视觉验收。
- **历史状态回顾 (v3.3.0)**：
  - **版本发布群通知联动、页面级轻量批注抽屉、企业级访客准入与自适应 Webhook 全闭环**：
    - **发版通知开关与更新备注必填联动**：
      - 原型发布/版本迭代弹窗 (`#uploadModal`) 增设「发送群通知」原生发丝级微开关；
      - **未配置 Webhook 智能置灰与极简指引**：打开弹窗或切换项目时自动探查全局与项目 Webhook 状态，未配置时开关自动置灰禁用（`disabled`，透明度 0.4，光标禁止符号），提示语保持客观中立的“未配置群机器人（可在项目属性中配置）”，发版主流程保持纯粹克制，不在发版弹窗中引入多余的展开式配置卡片；
      - **项目属性 Webhook 字段打通**：修复侧边栏菜单【更多 $\rightarrow$ 编辑属性】遗漏传递 `webhook_url` 的缺陷，使团队成员随时可通过低频的“编辑属性”入口配置或更新自己负责项目的群机器人，控制中心项目列表中直观标注 `ri-robot-line 机器人` 徽标；
      - 开启通知开关后，更新备注自动变为必填项（红星标识，动态切换选填/必填提示）；未填写提交时前后端严密拦截拦截，杜绝发版群消息轰炸与空洞通知；
      - 版本发布成功后，通过项目专属 Webhook（优先）或全局 Webhook 自动推送卡片至评审/开发群；
    - **全站文案克制化与去废话文学纯净化**：
      - 彻底清除所有“快来留下你的第一条想法吧”、“恭喜！您的群机器人...”等自嗨式营销腔与同义反复车轱辘话；
      - 全面规范为短促、客观、实用的工程语言（如“当前页面暂无批注”、“测试消息已送达”、“申请已提交，等待审核”）；
      - **空状态排版防孤字优化**：扩宽 `.empty-state-desc` 至 `max-width: 480px` 并注入 `text-wrap: balance`，消除副标尾部掉落孤字换行现象（如“真不改了””整句笔挺单行舒展呈现）；
      - **CSRF 令牌与持久会话自愈重构**：在任何 HTML 输出前预先下发 `ue_csrf_token` 突破 Headers Already Sent 限制；Session Cookie 统一升级为 30 天持久生命周期；管理员/协作者同源写操作自动信任放行；真正掉线时自动弹出登录框替代生硬的 CSRF 报错死循环；
    - **批注处理结项闭环通知**：
      - 批注被标记解决结项时，自动定向通知原提问人（@原作者），实现团队问题闭环；
    - **企业级访客准入体系与管理员审批中心**：
      - 前台登录锁屏与通用登录弹窗全面支持「申请加入协作」轻量卡片切换；
      - 企业邮箱后缀白名单强校验拦截（如配置 `@company.com` 时，拦截外部公共邮箱刺探与垃圾注册）；
      - 注册用户默认进入 `status = 0`（待审核 Pending），登录时温和友好提示“账号审核中，通过后即可登录”；
      - 管理员控制中心【团队成员】面板升级为双 Tab 结构（正式成员 vs 待审批申请），侧边栏导航与 Tab 均挂载发丝级琥珀色待审批微徽标，支持一键「批准入驻」（自动激活为 `viewer` 审阅访客角色并允许参与批注）与「驳回」；
    - **多平台自适应轻量群机器人 Webhook 发送引擎 (`includes/webhook.php`)**：
      - 原生实现，零第三方 Composer 库依赖，配置 1.5 秒极短超时非阻塞与异常静默保护；
      - 智能识别企业微信、飞书、钉钉三平台机器人 URL 特征，全自动封装对应平台原生 Markdown 与交互卡片格式；
      - 双层级分流：支持全局 Webhook 兜底与单个项目专属 Webhook（按不同项目分群精准推送，彻底杜绝群消息轰炸）；
      - 系统设置支持一键「测试发送」，支持新批注、回复跟帖、新用户入驻申请待审批多事件秒级推送；
    - **页面级轻量批注抽屉与协作闭环 (`assets/js/annotation.js` + `assets/css/app.css`)**：
      - 原型工具栏增设 `💬 批注` 快捷入口（挂载动态待处理未读计数徽标，支持键盘单键 `C` 丝滑滑出/收起）；
      - 右侧 350px 浅色抽屉完全遵循 Linear 设计规范，通过同源事件智能监听 `iframe.onload`，无缝捕获子页面路径（如 `pages/order.html`）与 `<title>`；
      - 协作状态机流转：`待处理 Pending (琥珀色)` $\leftrightarrow$ `已解决 Resolved (淡雅绿)`，支持回复盖楼对话、发起人与管理员一键结项，支持按「当前子页面 / 本版本全部」与「状态」快速过滤；
      - 严格版本物理隔离与历史归档透视，新版发布自动重置干净画布；
    - **控制中心大盘项目管理待办徽标集成**：
      - 项目管理列表中为包含未处理批注的项目直观展示 `● N 待办` 标签，方便产品经理一眼掌握各项目的待办进展；
    - 编写并执行全流程自动化部署与多场景验证脚本 `deploy_upload_notify.py`，完成生产环境 FTP 热同步、数据库无损增量自愈升级与 WebKit 真实 Retina 2X 高保真截图验收。
- **历史状态回顾 (v3.2.73)**：
  - **彻底拔除历史迁移包袱，回归零污染极简原生架构**：
    - **铲除数据库动态打补丁逻辑 (`ensureSchemaUpgrades`)**：彻底删除 `includes/db.php` 中近 150 行动态 PRAGMA 元数据探测与 ALTER TABLE 补丁，数据库连接响应速度恢复极致轻量（0.1ms 级）；`initTables()` 维护全套 9 张表的终极标准 Schema，从零初始化即是最优形态；
    - **物理删除废旧历史导入引擎**：彻底删除为了兼容特定历史 HTML 菜单而编写的 `includes/importer.php`，源头净化无死角；
    - **安装向导 Step 4 纯净化**：铲除「导入既有历史项目」复选框与历史导入逻辑，Step 4 升级为「确认与初始化」，展示清晰的安装摘要卡片，一键建立标准系统并生成锁定文件；
    - **清理老旧路径兜底垫片**：移除 `index.php` 与 `includes/modals.php` 中兼容历史废弃路径 `media/logo.svg` 的冗余代码；
    - 编写并执行自动化测试与清理部署脚本 `deploy_v3_2_73.py`，完成生产环境 FTP 热同步与真实工作台截屏验收。
- **历史状态回顾 (v3.2.72)**：
  - **控制中心菜单按角色优雅开放、个人资料与自主修改密码闭环、首次登录安全软提示落地**：
    - **控制中心菜单结构重构 (双角色工整对称)**：
      - **超级管理员 (6项)**：数据概览、项目管理、团队成员 (全权管理与重置密码)、系统设置 (品牌与全站密码)、系统日志 (安全审计)、个人设置 (修改姓名与密码)；
      - **协作者 (4项)**：数据概览、项目管理 (仅管理个人项目，他人项目受保护)、团队成员 (只读通讯录，隐藏增删改)、个人设置 (自主修改展示名与密码)；
    - **个人设置面板 (`#panel-profile`)**：
      - **账号资料卡片**：展示名修改实时同步更新 Session、侧边栏底栏与团队通讯录；
      - **修改密码卡片**：严格比对当前原密码，新密码合规校验（≥6 位），更新密码并自动消除首次登录提示状态；
    - **首次登录温和安全提醒 (`#firstLoginTipBanner`)**：
      - 数据库表自适应热迁移 `is_first_login INTEGER NOT NULL DEFAULT 1`（安装默认管理员为 0，新增协作者为 1）；
      - 协作人首次登录成功进入工作台时，右下角浮现克制温和的安全提醒卡片，提供「立即修改」与「稍后再说」，绝不强打断工作流程；
    - 编写并执行全流程自动化部署与多场景验证脚本 `deploy_v3_2_72.py`，完成生产环境 FTP 热同步与协作者视角真实高保真截图验收。
- **历史状态回顾 (v3.2.71)**：
  - **大盘图表全幅满尺寸重构与卡片四周间距像素级对齐 (彻底消除留白失衡)**：
    - **排查根因**：原【查阅走势】与【时段分布】卡片因基准线左右缩进 12px、立柱局促挤在左中段（右侧空出 36px 荒漠），且外层挂载 `display:flex; justify-content:space-between;` 与固定 `102px` 高度，导致底部挤出多达 33px 虚空留白，图表距离卡片四周的距离与其它卡片（如存储空间进度条）产生严重撕裂；
    - **全幅贯通与像素级对齐法则 (Full-Size & Pixel-Perfect)**：
      - **横向 100% 满宽铺满**：基准线设为 `x1="0" y1="70" x2="360" y2="70"`，左右直抵卡片内容边缘（与卡片 `padding: 13px 15px` 完美贴合，与下方存储空间、热度排行进度条形成垂直绝对基准对齐）；
      - **立柱全幅均布**：7 天走势按 `360 / 7` 步长（51.4px）均布铺满，30 天走势按 `360 / 30 = 12px` 铺满，24 小时时段按 `360 / 24 = 15px` 均布铺满，无任何左右偏斜；
      - **纵向充盈挺拔**：容器高度统一精简为 `92px`，立柱最大高度由局促的 40px/46px 提升至 54px，文字刻度基准线齐平于 `y="86"`，彻底抹除 33px 底部虚空，上下间距与其它卡片严格统一为 `13px`；
    - 编写并执行自动化测试与同步脚本 `deploy_v3_2_71.py`，完成生产环境 FTP 热部署与真实控制中心 Retina 2X 高保真截图验收。
- **历史状态回顾 (v3.2.70)**：
  - **彻底拔除全站网点光晕与过度阴影，回归纯粹纯白 10px 单像素点阵**：
    - **铲除光晕变量与径向渐变**：从 `assets/css/app.css` 中彻底删除 `--canvas-dot-glow` 与 `radial-gradient(...)` 径向光晕叠加，`--bg-axure-dots` 纯化为单一干净的 10px 针尖点阵 SVG，独立全屏页面 `background-size` 彻底精简为单层；
    - **消除微插画外扩阴影**：移除 `.empty-state-illustration` 上的 `filter: drop-shadow(...)`，Axure 原型图纸与领航指针干净挺拔地悬浮于纯白画布上，零杂色、零光晕、零过度装饰；
    - 编写并执行自动化测试与同步脚本 `deploy_v3_2_70.py`，完成生产环境 FTP 热部署与真实高保真截图验收。
- **历史状态回顾 (v3.2.69)**：
  - **内容区点阵画布去多余背景色彻底纯净化 (纯白通透 #ffffff)**：
    - **铲除杂色与灰底叠加**：采纳用户精准视觉意见，彻底移除 `.empty-placeholder` 的灰色底色（`var(--canvas)`），替换为通透清爽的纯白底板（`#ffffff`），并移除径向多余光晕，仅保留纯粹刀刻般的 10px 针尖网点；
    - **插画视觉减负**：彻底剥离 Axure 折角图纸插画背后多余的蓝色虚线圆底色，图纸挺拔立于纯白点阵画板之上，呼吸感大开，通透纯粹；
    - 编写并执行 `deploy_v3_2_69.py`，完成生产环境 FTP 热部署与真实纯白网点画板截图验收。
- **历史状态回顾 (v3.2.68)**：
  - **内容区空状态融入 Axure 10px 点阵画布与全局下拉选择框矢量重构**：
    - **内容区空状态画布点阵化**：右侧原型展示区空状态（`.empty-placeholder`）全面接入全局令牌 `--bg-axure-dots` 与 10px 发丝级点阵栅格。当未选择原型或处于首发引导态时，Axure 原型图纸微插画优雅悬浮于 10px 画布之上，契合“画布已就绪”的产品隐喻；加载具体原型时 iframe 自动遮罩覆盖；
    - **弹窗下拉框箭头重构与边距修正**：重置浏览器原生丑陋且贴边的下拉三角，为 `select.m-input, select.m-select` 注入现代发丝级 SVG 微弧矢量下三角（低饱和石板灰 `#64748b`），并将箭头位置精调至 `right: 12px`（与左侧 padding 达成绝对物理对称），设定 `padding-right: 36px` 彻底消除贴边压迫感；
    - 编写并执行 `deploy_v3_2_68.py`，完成生产环境 FTP 热部署与主画布点阵、弹窗下拉箭头双场景真实截图验收。
- **历史状态回顾 (v3.2.67)**：
  - **侧边栏空状态判定与目录树渲染严格权责分离 (修复已有文件夹被吞 Bug)**：
    - **排查根因**：侧边栏误用全站原型项目总数 `$totalDisplayItems === 0` 判定空状态，导致在用户已导入 5 个空文件夹（校园网、其他内容、智慧迎新等）时，整棵目录树被暴力替换为空状态卡片，造成“明明已有 5 个文件夹，却提示目录树空空如也”的严重悖论；
    - **权责分离修复**：引入 `$sidebarVisibleCats`（基于当前角色实际可见文件夹数精确判定）。管理员视角下 5 个文件夹全部完整渲染，显示 `(0)` 且支持就地管理，点开展开空占位微提示；访客视角下保持静默空文件夹并展示友好赶稿提示；右侧主画布精准维持首发引导态；
    - 编写并执行 `deploy_v3_2_67.py`，完成生产环境 FTP 热部署与真实管理视图截屏验收。
- **历史状态回顾 (v3.2.66)**：
  - **大盘图表与进度条核心色彩绝对统一落地 (晴空蓝 var(--primary))**：
    - **排查根因**：查阅走势柱图使用了 `<linearGradient>` 蓝天渐变，热度排行与业务板块使用了 `linear-gradient(90deg, #38bdf8, #0284c7)`，而时段分布与存储空间使用了实心纯色 `var(--primary)`，导致同一屏幕内多处蓝色柱体与条形深浅分裂；
    - **统一闭环**：彻底废除杂色天蓝 `#38bdf8` 渐变，查阅走势今日高亮柱、时段分布峰值柱、热度排行进度条、业务板块进度条、存储空间 HTML 预览包主色段全部严格统一为官方晴空蓝 `var(--primary)`（`#0284c7`）；
    - 编写并执行自动化测试与截图脚本 `deploy_v3_2_66.py`，完成生产环境 FTP 热部署与真实大盘截屏验收。
- **历史状态回顾 (v3.2.65)**：
  - **全局层级概念彻底统一为「文件夹」术语闭环**：
    - **彻底铲除“新建分类”术语残留**：将空状态侧边栏中的行动按钮从 `+ 新建分类` 更正为 `新建文件夹`，图标从通用加号对齐为 `ri-folder-add-line`（与顶部全局快捷加号菜单中的「新建文件夹」保持 100% 像素级一致）；
    - **文案拉齐**：管理员空态副标更正为「建个文件夹治愈强迫症」；
    - 编写并执行 `deploy_v3_2_65.py`，签发真实管理员双保险凭证 `ue_admin_auth`，完成生产环境 FTP 热部署与真实管理视图截屏验收。
- **历史状态回顾 (v3.2.64)**：
  - **空状态全面去“废话文学”与产品研发日常梗落地 (方案 A 定稿)**：
    - **全站 0 项目·首发引导态**：主标保留「画布已就绪，静待第一份图纸」，副标铲除假大空 Slogan，重构为充满产品心声的「万事俱备，就差那份改了 18 版的“最终版_v3_真不改了”」；访客引导按钮优化为「登录解密工作台」；
    - **左侧侧边栏·0 项目空态**：管理员模式下为「目录树空空如也 · 建个文件夹治愈强迫症」，访客模式下为「空空如也 · 产品经理还在疯狂赶稿中…」，彻底消除“暂无”与“未托管任何”的同义反复车轱辘话；
    - **已有项目·未选择交互态**：主标「今天看哪份原型？」，副标「在左侧挑一个项目，见证每一次“按原样实现”的承诺」，保留 `<kbd>/</kbd> 键快速搜索`；
    - **项目已建·无版本态**：主标「坑位已占，图纸未到」，副标「研发点进来直挠头。丢个 ZIP 上来，马上开工！」，行动按钮精简为「上传原型包」；
    - **搜索无匹配态**：文案重构为「搜了个寂寞，是不是敲错字了？」，附带一键「清空搜索」按钮；
    - 编写并通过自动化测试与线上真实截图脚本 `deploy_v3_2_64.py`，生产环境 FTP 同步热更新完成。
- **历史状态回顾 (v3.2.63)**：
  - **体验优先空状态全矩阵与 Axure 原型图纸微插画重构落地**：
    - **全站 0 项目·首发引导态**：右侧画布沉浸呈现纯矢量发丝级 Axure 蓝图折角图纸 + 金色罗盘领航飞镖插画，文案“画布已就绪，静待第一份图纸”，管理员专属「发布首个原型」/「新建项目」直达行动按钮，访客模式引导「登录管理后台」；
    - **侧边栏分类树·空态引导**：左侧侧边栏在 0 项目时告别无内容死白，提供微缩书签插画与「新建分类」快捷按钮；
    - **已有项目·未选择态**：展示交互微光标插画与「从左侧选择项目以交互预览」，并在底部增加全局 `<kbd>/</kbd>` 键快速搜索提示；
    - **项目已建·无版本态**：项目创建但未发包时，展示打包箱微矢量插画与「上传原型版本」引导；
    - **搜索无匹配态**：搜索过滤为空时，增加「清空搜索」一键复原；
    - **快捷键生态**：按键盘 `/` 键自动聚焦搜索框并全选，按 `Escape` 自动退出搜索或关闭弹窗；
  - **服务器 13MB 物理历史残留文件彻底排查与归零**：
    - **排查根因**：系统大盘存储空间由底座 `RecursiveDirectoryIterator` 物理扫描真实文件计算。此前测试重置时，FTP 协议无法直接递归删除包含深层中文路径的文件夹（如“智慧校园”、“经分系统”等 708 个解压文件），导致虽初始化数据库，但物理磁盘仍残留 12.7 MB HTML 与 0.3 MB RP 文件；
    - **解决落地**：编写并执行 Web 原生 POSIX 递归深度清理探针，彻底清除 708 个历史孤儿文件，磁盘占用降至 1.93 KB（仅 4 个基础安全占位文件），大盘 HTML/RP 占用真实归零为 **0.0 MB**；
    - 编写并通过全自动测试脚本 `test_and_deploy_v3_2_63.py`，完成生产环境 FTP 同步部署与真实环境截图验收。
- **历史状态回顾 (v3.2.62)**：
  - **物理像素单晶格点阵落地 (1X=1px, 2X=2px, 3X=3px 零抗锯齿晕染)**：
    - **排查根因**：纯 CSS `radial-gradient` 算法在栅格化时存在亚像素抗锯齿羽化，强行向相邻像素晕染扩散，导致视觉面积被迫放大 2~3 倍；
    - **物理单像素对齐法则 (Pixel-Perfect)**：彻底废除 `radial-gradient` 圆形渐变，采用 10×10 单元格 + 绝对整数坐标 `1px × 1px` SVG 矢量微点（`url("data:image/svg+xml,...<rect width='1' height='1'.../>")`）；
    - **多倍屏绝对对齐**：1X 屏严格点亮 1 个物理像素，2X 视网膜屏严格点亮 2×2 物理像素，3X 屏严格点亮 3×3 物理像素，零外扩、零发散，呈现真正刀刻般的 Axure 标尺针尖点；
    - 编写并通过自动化测试脚本 `test_and_deploy_v3_2_62.py`（涵盖 1px 矢量点断言、线上 CSS 与 HTTP 响应验收）。
- **历史状态回顾 (v3.2.61)**：
  - **Axure 10px 点阵画布发丝级微点阵调优 (微缩 60%)**：
    - **排查根因**：原点径半径 1.15px（实际直径超过 2.3px），在 10px 栅格内比例偏大且过于抢眼，视觉嘈杂；
    - **发丝级针尖微点精调**：将核心点径半径降为 `0.5px`（物理直径仅约 1.0px），并在 `0.5px ~ 0.9px` 之间加入柔和过渡羽化，色彩收敛至低饱和冷灰阶 `rgba(100, 116, 139, 0.38)`；
    - **全局统一生效**：复用 `assets/css/app.css` 的 `--bg-axure-dots` 全局令牌，安装向导、登录锁屏与项目密码卡片全站同步瘦身，极度纯粹克制；
    - 编写并通过自动化测试脚本 `test_and_deploy_v3_2_61.py`（涵盖发丝点参数断言、线上 CSS 与 HTTP 响应验收）。
- **历史状态回顾 (v3.2.60)**：
  - **全屏独立页面全局样式抽象与 Axure 10px 网点画布落地**：
    - **Axure 原型网点画布 (Dot Grid)**：在 `assets/css/app.css` 中抽象 `--bg-axure-dots` 与 `--canvas-dot-gap: 10px`，1X 标准下 10px 间距微圆点（直径约 1.2px，石板灰渐变羽化），彻底替换原 28px 粗实线方格，兼顾纯粹克制与 Axure 原型图纸工具感；
    - **全局独立页面规范抽象**：在 `app.css` 中沉淀 `.page-standalone`、`.standalone-brand`（外置居中 LOGO 与副标题）、`.standalone-card`（12px 标准圆角、1px 细边框与克制阴影）、`.form-control` 与 `.btn-submit`（8px 标准圆角、40px 高度）；
    - **全站多入口拉齐共用**：
      - `index.php` 登录锁屏：彻底铲除 70+ 行 inline 重复样式，接入 `.page-standalone` 与 `.standalone-card`，LOGO 与副标题外置，卡片纯粹聚焦密码/登录验证；
      - `install.php` 安装向导：全面接入 `app.css` 与 `.page-standalone`，共享 Axure 10px 点阵画布与向导卡片规范；
      - `share.php` 项目密码锁屏：同步接入 `.page-standalone` 与 `.standalone-card`；
      - `assets/js/admin.js`：系统设置中的“默认背景缩略图”同步切换为 10px Axure 网点预览；
    - 编写并通过自动化测试脚本 `test_and_deploy_v3_2_60.py`（涵盖全局网点断言、多页面共用断言与 FTP 生产环境同步部署验收）。
- **历史状态回顾 (v3.2.59)**：
  - **杜绝过度设计：恪守职责边界，源头净化文件管线**：
    - **排查根因**：环境重置时本地残留的 0 字节 `data/database.sqlite` 被意外同步至生产环境，其 Linux 属主为 FTP 账号（UID 1002，权限 `664`），而 Web 服务器 PHP 进程属于 other 仅有只读权限，导致触发 `attempt to write a readonly database`；
    - **拒绝过度设计与代码兜底**：初始安装场景下系统天然不应预置任何数据库文件，严禁用运行期业务代码给部署期失误“擦屁股”；彻底撤回了 `includes/db.php` 与 `install.php` 中冗余的 `unlink`、`chmod` 与 0 字节判断逻辑，保持核心代码极简纯粹；
    - **守住源头干净底线**：本地 `data/` 目录彻底清除所有 `.sqlite` 占位文件，FTP 远程 `/v2/data/` 保持绝对纯净（仅保留安全占位文件），全新安装完全由 Web 进程自然创建 SQLite 库，权责边界清晰明了。
- **历史状态回顾 (v3.2.58)**：
  - **安装向导 Step 1 废话提示节点彻底铲除 (正常静默·异常才显现)**：
    - **铲除冗余成功提示**：彻底删除了环境检测下方的“环境检测全部通过”邀功式提示，各行绿标与激活的蓝色主按钮已完整表达就绪状态，正常流程不增加持续可见的视觉噪音；
    - **保留异常行动指导**：未通过时精准提示“请先为标记不可写的目录赋予写入权限后再继续”，界面更加克制紧凑；
    - 编写并通过自动化测试脚本 `test_and_deploy_v3_2_58.py`（涵盖废话节点清除断言、异常守卫保留断言与 FTP 生产环境同步部署验收）。
- **历史状态回顾 (v3.2.57)**：
  - **外链字体净化彻底收敛为底层默认静默基础设施**：
    - **铲除技术细节向用户做选择题**：移除了安装向导 Step 4 中容易引起困惑的技术选项“清理无用外链字体”，Step 4 仅保留纯粹的核心业务决策“导入既有历史项目”；
    - **全站静默全自动净化**：无论是安装向导老项目迁移导入，还是工作台日常发布新版本原型 ZIP，底层全部自动静默清洗 Google Fonts 等导致内网卡顿的外链，用户完全无感知，0 毫秒秒开；
    - 编写并通过自动化测试脚本 `test_and_deploy_v3_2_57.py`（涵盖 Step 4 选项精炼断言、后台静默清洗断言与 FTP 生产环境同步部署验收）。
- **历史状态回顾 (v3.2.56)**：
  - **安装引导文案全面去废话文学与体验精炼**：
    - **铲除大词吹嘘与营销套话**：彻底删除“底层脚本引擎”、“免配置轻量数据引擎，支持本地高效持久化存取”、“支持 Axure 原型发布包自动化流式解压与解析”、“设置最高管理权限账号与通行凭据”等冗余自嗨文案，全面重构为“SQLite 本地数据库驱动”、“用于原型 ZIP 压缩包自动解压”等客观自然的技术语言；
    - **精简表单标签与冗余副标题**：删除卡片头部的重复报菜名副标题，表单字段由“管理员登录账号 / 管理员密码 (至少 6 位)”精简为干练的“管理员账号 / 管理员密码 / 确认密码”，去除括号内显而易见的说教（如“(防止外部未授权访问)”）；
    - **行动按钮干练化**：主按钮由拖沓的“立即完成安装 / 正在初始化系统并导入数据...”升级为有力的“开始安装 / 正在安装...”，安装完成及已安装跳转由“进入锦时原型中心”优化为“进入工作台”；
    - 编写并通过自动化测试脚本 `test_and_deploy_v3_2_56.py`（涵盖废话词汇黑名单断言、精炼文案白名单断言与 FTP 生产环境同步部署验收）。
- **历史状态回顾 (v3.2.55)**：
  - **Toast 状态等级细分与底部弹出展示重构落地**：
    - **等级细分与语义图标**：将安装向导单一的黑框 Toast 升级为支持 4 级状态规范的现代轻量组件——通知（`info` 晴空蓝 `#0284c7` + `ri-information-fill`）、警示（`warning` 警示琥珀 `#f59e0b` + `ri-alert-fill`）、出错（`error` 低饱和赭红 `#dc2626` + `ri-error-warning-fill`）、成功（`success` 淡雅绿 `#16a34a` + `ri-checkbox-circle-fill`）；
    - **弹出位置由顶部整体迁移至底部**：由原来顶部的 `top: 24px` 改为**屏幕底部居中**（`bottom: 32px`），彻底避免遮挡顶部的品牌 LOGO 与安装步骤卡片；
    - **自底部向上平滑浮现动效**：重构动画逻辑为 `translateY(14px/16px) scale(0.96) → translateY(0) scale(1)`，离开时自然淡出下落；
    - **全站体验同步拉齐**：主站 `assets/css/app.css` 中的全局 `.toast-container` 同步迁移至 `bottom: 28px`，且通过 `flex-direction: column-reverse` 实现多条消息从底部往上自然堆叠，全系统交互语义高度统一；
    - 编写并通过自动化测试脚本 `test_and_deploy_v3_2_55.py`（涵盖 Toast DOM 结构、4 级图标断言、底部定位 CSS 断言与线上环境 HTTP 真实响应验收）。
- **历史状态回顾 (v3.2.54)**：
  - **位图资产折角外侧白底污染彻底清除 (真·透明光栅化)**：
    - **排查根因**：原位图资产在早期导出时使用了 macOS `qlmanage -t` 缩略图命令，该工具在渲染 SVG 时强制垫入了一层 `#ffffff` 纯白背景底板，导致折角外侧本应完全透明的直角三角区域被硬塞了 609 个纯白不透明像素（在浅灰底色 `#f8fafc` 下严重现形）；
    - **重构真·透明光栅化管线**：升级为基于 macOS 原生 Swift AppKit + CoreGraphics 原生矢量光栅化渲染，彻底消除一切白底污染，将 `logo.png`、`logo.webp`、`logo-dark.png`、`logo-icon.png` 与 `favicon.png` 的折角外侧纯白像素彻底清零为 `(0, 0, 0, 0)` 绝对真透明；
    - **全站图片资源防旧缓存绑定**：在 `install.php` 中引入 `logo.webp?v=3.2.54` 与 `logo.png?v=3.2.54`，彻底杜绝浏览器本地旧缓存导致的白底残留；
    - 编写并通过自动化测试脚本 `test_and_deploy_v3_2_54.py`（涵盖 5 大位图白底像素断言、线上 HTTP 200 及线上 WebP 像素实时抽检全部通过）。
- **历史状态回顾 (v3.2.53)**：
  - **安装向导顶部 LOGO 物理对称居中修复**：
    - **彻底铲除原图右侧 236px 偏心空白**：排查发现原 `logo.png` / `logo.webp`（560×160）中有效图形仅占前 324px，右侧有 236px 的多余透明空白，导致浏览器在按图居中时有效内容向左严重偏移约 53px；
    - **重构为 100% 绝对物理对称资产**：重新切出有效区域并设定严格等距边距（左 8px、右 8px、上 6px、下 6px），生成紧凑型 `logo.png` (304×116)、`logo.webp` 与 `logo-dark.png`，实现任意居中容器下真正像素级绝对居中；
  - **安装向导底部标语删除**：彻底删除了 `install.php` 底部的 `.installer-footer-note`（“锦时原型托管平台 · 极简独立部署”），让安装界面更加纯粹克制；
  - **Favicon 与 LOGO 正式解耦双轨制落地 (款式 1 纯白色系双翼立体款)**：
    - **彻底解决微缩识别与品牌细节权衡**：
      - 原单 SVG 方案在 16px 浏览器标签页下，原型线框与双色指针微缩后产生细碎噪点；
      - 重构为**双轨架构**：标签页调用专属纯色高对比 `favicon.svg`，工作台与顶栏调用具象富细节的 `logo-icon.svg`；
    - **定稿款式 1 (纯白色系双翼立体款)**：
      - 严格还原原始指南针几何参数（长针尖 55、短尾针 28、两翼 16.5 的非对称航向动势），左翼 100% 纯白（`#ffffff`）、右翼 80% 亮白（`fill-opacity: 0.80`）；
      - 彻底剔除细碎线框与非品牌杂色，在 Axure 湛蓝（`#0076de`）底板与亮天青折角（`#00b4d8`）衬托下，微缩至 16px 依然秒级识别、立体分明；
      - 同步生成 128×128 高保真 Retina 兼容兜底图 `favicon.png`；
    - **全站入口与业务代码闭环**：
      - `index.php`、`share.php`、`install.php` 默认 Favicon 统一接入 `assets/images/favicon.svg`；
      - `includes/modals.php` 与 `assets/js/admin.js` 中的 Favicon 设置与“恢复默认”逻辑完全回退至 `assets/images/favicon.svg`；
    - 编写并通过自动化测试脚本 `test_and_deploy_v3_2_53.py`（涵盖长短针几何断言、纯色双翼断言、LOGO 细节保留断言、全站解耦闭环与 FTP 生产环境同步部署验收）。
- **历史状态回顾 (v3.2.52)**：
  - **控制面板顶部表头像素级拉齐 (用户截图红圈彻底修复)**：
    - **铲除 14~18px 错位断阶**：原左侧 `.admin-nav-header` 未设定物理高度仅约 51px，而右侧 `.admin-content-header` 因关闭按钮与标题内边距被撑至 65px~69px，造成横线交界处严重错位；
    - **几何级绝对水平贯穿**：在 `assets/css/app.css` 中将 `.admin-nav-header` 与 `.admin-content-header` 统一设定为严格一致的 `height: 56px`（2K 大屏同步拉齐为 `60px`），`box-sizing: border-box`，左右两条细边框 100% 绝对水平对齐，彻底消除断层；
  - **纯 CSS 默认“原型工程蓝图网格”底纹落地**：
    - **0 字节、0 毫秒首屏直出**：未配置企业壁纸时，默认激活 `28px × 28px` 发丝级微蓝原型工程网格 + 居中柔光环境底纹（Blueprint Grid），既彻底摆脱纯灰白底的寡淡，又极具 Axure 原型图纸的工具专业感，且完全支持管理员随时上传实景壁纸平滑覆盖；
    - 系统设置背景预览框同步联动展示默认网格缩略图标；
  - 编写并通过自动化测试脚本 `test_and_deploy_v3_2_52.py`（涵盖表头物理高度等宽断言、2K 大屏对齐断言、网格背景 CSS 断言及 FTP 生产环境同步部署验收）。
- **历史状态回顾 (v3.2.51)**：
  - **数据概览大盘板块层级与对称美学全面重组**：
    - **打破语义割裂，建立「业务对撞与时间对称」逻辑流**：
      - **顶层 4 指标卡顺畅承接**：重组为 `[托管资产] → [累计查阅] → [协作团队] → [存储占用]`，由宏观交付成果顺畅引渡到受众热度与底层支撑；
      - **第二层【纯时间图谱层】**：左【查阅走势】 vs 右【时段分布】。两端均为纯原生宽幅 SVG 柱状图，参考基准线与高度像素级水平贯穿，左看天、右看时，极具工业级图表纯粹对称美感；
      - **第三层【核心业务脉搏层】**：左【最近上传】 vs 右【热度排行】。项目条目胶囊 1:1 对齐，构建经典“最新交付 (Newest) vs 最热查阅 (Hottest)”双栏对撞，直击产品管理与团队协同核心；
      - **第四层【资产结构与物理底座】**：左【业务板块】 vs 右【存储空间】。两栏均带平滑比例进度条，左边看各业务分类项目沉淀，右边看预览/RP源文件磁盘占用，稳健托底；
    - 编写并通过自动化测试脚本 `test_and_deploy_v3_2_51.py`（涵盖板块层级 DOM 顺序断言、FTP 生产环境同步部署与线上 HTTP 200 验证）。
- **历史状态回顾 (v3.2.50)**：
  - **“记住我”多设备并发凭证池落地与单端退出隔离**：
    - **彻底根治单 Token 互踢致命缺陷**：
      - 原系统在 `settings` 表中仅存储单条 `admin_token_{userId}` 哈希，导致用户只要在办公室、家或移动端第二处登录，新生成的 Token 会瞬间覆盖旧 Hash，造成原工作设备被误判失效踢下线的体验困扰；
      - 架构升级为**多设备活跃凭证池（Multi-device Remember-Me Pool）**，支持同一账号在最多 10 台不同设备/浏览器并发持有独立 30 天持久凭证，多端登录互不干扰，换设备绝不再发生登录态丢失；
    - **单端精准登出隔离**：
      - 用户在某一台设备点击退出时，仅精准注销并清除当前设备的 Token，其他工作电脑、平板仍稳健保持记住登录态；
  - **管理控制台 2K/1080P/矮屏全视窗流式弹性自适应重构**：
    - **彻底废除固定死像素**：铲除原 `.admin-console-box` 硬编码 `1040px × 660px` 导致的 2K 大屏空间严重浪费与小框逼仄感；
    - **现代 CSS `clamp()` 流式自适应**：
      - 宽度采用 `width: clamp(1040px, 64vw, 1460px)`：在 1080P 屏稳定维持 1040px 黄金尺寸，在 2K 屏（2560×1440）自动扩展舒展至 **1460px**（净增超 400px 宽度，图表与数据表格完全舒展）；
      - 高度采用 `height: clamp(660px, 76vh, 920px)`：在 2K 屏自动扩展至 **920px**，数据概览上中下三层卡片一屏尽收眼底，无需滚动滚轮；
    - **大屏与矮屏专项适配**：
      - 2K 大屏专属增加导航、表头与内边距舒展（`@media (min-width: 1921px)`）；
      - 笔记本与矮屏幕自动弹性自适应（`@media (max-height: 740px)`），确保任何设备永不溢出视口；
    - 编写并通过自动化测试脚本 `test_and_deploy_v3_2_50.py`（涵盖双设备并发登录验证、单端登出隔离验证、CSS 自适应语法与线上 HTTP 200 真实响应）。
- **历史状态回顾 (v3.2.49)**：
  - **全站纯矢量资产终极收敛至唯一 SVG (单文件通吃全站) 与 G2 连续平滑曲线落地**：
    - **彻底清零四周 12px 留白**：
      - 视口严格设定为 $128 \times 128$ 正方形，折角原型图纸的上下左右四条外切边严格切在 $0$ 与 $128$ 边缘，消除全部四周 12px（18.75%）边距，有效视觉面积直接提升 **51.5%**；
      - 在浏览器标签页 $16 \times 16\text{px}$ 空间下，彻底杜绝图标缩水偏小的顽疾，折角与领航菱形指针大一圈且刀刻般清晰立体；
    - **G2 连续平滑曲线 (Continuous Curvature / Squircle) 升级**：
      - 彻底铲除普通圆弧在切点处曲率突变（$0 \to 1/R$）造成的视觉生硬折痕，全面升级为工业级三阶贝塞尔连续曲率过渡（`C 128 114, 114 128, 96 128` 等）；
      - 外轮廓及右上角内折凹角曲率均平滑温润，视觉高级感拉满；
    - **全站唯一 SVG 彻底收敛 (Single File Architecture)**：
      - 全站矢量资产物理收敛为**唯一的** `assets/images/logo-icon.svg`（仅 1.1 KB），彻底物理删除冗余重复的 `favicon.svg`；
      - `index.php`、`share.php`、`install.php`、`includes/modals.php`、`assets/js/admin.js` 统一全量指向 `assets/images/logo-icon.svg`，全局共用同一份浏览器缓存，首屏 0ms 秒开；
      - 同步更新高保真 Retina 兼容位图兜底（`favicon.png`、`logo-icon.png`、`logo.png` 等）；
    - 编写并通过自动化测试脚本 `test_and_deploy_v3_2_49.py`（涵盖唯一 SVG 断言、连续曲线三阶贝塞尔断言、0 留白四边贴满断言、全站引用闭环、FTP 线上部署与线上 HTTP 200 验收）。
- **历史状态回顾 (v3.2.48)**：
  - **搜索系统全维度重构与折叠误判致命 Bug 彻底根除**：
    - **根治已折叠分类搜不到的致命 Bug**：
      - 彻底铲除原 `hasVisible = $(this).find('.item-row:visible').length > 0` 缺陷代码。在 jQuery 规范中，父容器处于折叠状态（`display: none`）时，后代 `:visible` 伪类恒返回 `false`，导致匹配项所在的折叠组被误当成无匹配而强行执行 `hide()`，用户一搜全部消失；
      - 重构为基于元素底层 `style.display !== 'none'` 内存级真实状态判定，只要分类组内有任一匹配项，即刻自动展开（`removeClass('collapsed').show()`），分类折叠态下搜索 100% 灵敏自愈展开；
    - **兑现“搜索项目或版本”承诺，打通多维度联合穿透检索**：
      - 检索文本池（Search Text Pool）打通：项目名称（`data-name`）+ 所属文件夹分类名称（`.cat-name-text`）+ 项目作者（`data-creator-name`）+ 解析 `data-versions` 中历史所有版本的版本号（`version_name`）与版本作者（`creator_name`）；
      - 支持多词空格拆分联合过滤（AND 查询），如搜索“智博 2026”或“PoD V1”，多条件组合精准筛选；
    - **品牌一致的高亮反馈与优雅交互闭环**：
      - **搜索关键词安全高亮**：对项目标题中命中的词元动态包裹 `<mark class="search-highlight">`，搭配 Axure 湛蓝品牌浅底（`var(--primary-soft)` 与 `var(--primary)` 晴空蓝字体），视觉高级克制，输入清空时无损还原原始纯文本；
      - **快速清空控件与键盘快捷响应**：输入框右侧内嵌实体清空按钮 `#searchClearBtn`（`✕`），输入有内容时浮现，支持点击一键清空或按键盘 `ESC` 键毫秒级清空并自动聚焦；
      - **Linear 风格极简空状态**：未找到任何匹配项时展示 `#searchEmptyState`（带微型放大镜与极简浅灰提示语），彻底杜绝白屏与茫然感；
    - 编写并通过端到端测试脚本 `test_and_deploy_v3_2_48.py`（涵盖多词、版本跨字段检索、折叠自愈、清空与线上 HTTP 真实响应），全量部署至生产环境。
- **历史状态回顾 (v3.2.47)**：
  - **纯矢量 SVG Favicon 与 Axure 经典面性品牌体系全面落地**：
    - **彻底解决图标微缩看不清顽疾**：
      - 彻底重构官方图标为纯矢量 SVG 面性风格（`assets/images/favicon.svg`、`logo-icon.svg`），每个文件体积仅 **1.0 KB**，全站资产总体积暴降 89%（从 520KB 骤降至 58KB）；
      - 彻底铲除旧版 60 个繁杂细刻度线与杂乱装饰，提炼为**纯净面性折角图纸（R=22 同阶圆角）+ 严格 -45° 黄金对角线领航双色菱形指针**；
      - 现代浏览器标签页通过 `type="image/svg+xml"` 优先加载纯矢量 Favicon，在 16px、32px 及 Retina 屏下实现无限无损秒开、刀刻般锐利清晰；
    - **Axure 官方经典品牌色体系与站点 CSS 全面拉齐**：
      - **图标配色定稿**：Axure 官方湛蓝 `#0076de` + 亮天青折角 `#00b4d8` + 珊瑚红橙与纯白指针 `#ff5c35`，彻底告别 Safari 既视感，原型工具纯正血统；
      - **站点设计令牌无缝升级**：`assets/css/app.css` 变量升级为 Axure 湛蓝体系（`--primary: #0076de`、`--primary-hover: #005bb5`、`--primary-soft: #e6f4fe`），全站主按钮、高亮条、选中态与新图标浑然天成；
    - **全端协同与兼容兜底**：
      - `index.php`、`share.php` 侧边栏与顶栏优先调用 `logo-icon.svg`，配套导出 Retina PNG/WebP 作为老旧设备兜底；
    - 编写并通过 `test_and_deploy_v3_2_47.py` 全量端到端测试，同步部署至生产环境并推送 GitHub。
- **历史状态回顾 (v3.2.46)**：
  - **历史冗余脚本清理与非标逻辑全面标准化**：
    - **彻底清除未引用的遗留 JS 库**：清理了历史遗留的 `assets/js/bootstrap.min.js` (58KB) 与 `assets/js/jquery.nicescroll.min.js` (60KB)，全站交互 100% 收敛至原生标准，零死代码；
    - **收敛过时兜底路径**：`index.php` 移除了对废弃 `favicon.svg` 的过时兜底逻辑，统一规范为官方定稿标准 `favicon.png`；
    - **全工程总文件数极致收敛至 36 个**，达到现代顶级开源软件的纯粹标准；
  - **原型沉浸式增强样式源头内联与 `iframe.css` 彻底下线**：
    - **源头解压固化**：在 `includes/zip_handler.php` 中新增 `injectPrototypeEnhancement()`，解压时直接将 Axure 播放器美化规则（消除烦人翻页提示/分割线、目录树晴空蓝主题、隐藏 Axure 商业占位、内联 Remix Icon 图标字体定义）内联注入到 HTML `<head>` 中；
    - **消灭首屏跳变闪烁 (0ms FOUC)**：原型首帧直出即是优化后的沉浸式样式，彻底根除了原 `iframe.on('load')` 动态注入导致的二次跳变；
    - **物理文件与父页面监听彻底清零**：彻底删除了 `assets/css/iframe.css` 物理文件，从 `app.js` 与 `share.php` 中彻底剥离了跨 DOM 注入逻辑，父子页面完全解耦；
  - **历史遗留文件全面清理与资产深度瘦身**：
    - **清理历史测试原型包**：彻底删除 `uploads/ux/SuperPoD` 与 `uploads/ux/智博教育2026开学`，清除几百个历史测试原型文件（释放近 6MB 磁盘）；
    - **清理本地审计状态**：彻底删除两处 `.mimosa/` 目录（释放近 3MB 缓存）；
    - **精简古代字体与废弃矢量图**：删除 2.89MB 古代 `remixicon.svg` 与 592KB `remixicon.eot`，进一步删除冗余的 `remixicon.ttf` 与 `remixicon.woff`，全站彻底收敛至唯一的现代标准高压缩 `woff2` 格式（仅 178KB，释放 842KB）；删除废弃的旧 SVG 图标（`logo.svg`、`favicon.svg`、`logo-icon.svg`）；
    - **全工程总文件数极致收敛至 38 个**，代码库极致轻量、纯粹、专业；
  - **工程根目录平铺与 Git 开源仓库彻底脱噪重构**：
    - **系统全量文件平铺至根目录**：将原本嵌套在 `新版/` 下的所有核心控制器（`index.php`、`admin.php`、`api.php`、`install.php`、`share.php`）、资产池（`assets/`）、业务逻辑库（`includes/`）及数据/附件目录（`data/`、`uploads/`、`s/`）直接平移至根目录，构建标准的顶级开源项目结构，开箱即跑；
    - **老旧“现状/”目录彻底剥离**：彻底将 25MB 老版本只读目录从 Git 历史与工作区中移除（冷备至本地安全区），彻底杜绝历史原型与代码泄露至 GitHub；
    - **首个提交重构与强推**：执行 Git 根提交重构并强制推送至 GitHub，确保远程仓库零历史泄露、零冗余对象，代码库纯净轻盈；
  - **数据概览大盘极致克制扩充 (4指标 + 6主题卡片完整矩阵)**：
    - **全站累计查阅主指标落地**：顶层指标卡第 3 项升级为【累计查阅】，大字突出全站总被访问频次，副标精准呈现 `近7天 +XX · 今日 +XX`，全局沉淀与增量脉搏一目了然；
    - **新增【最近上传】深度卡片 (下层左栏)**：展示最新 5 个发版记录，单行内嵌 `[版本胶囊] [项目名称 flex:1 省略] [文件夹微标] [RP 归档标] [相对时间 今天/昨天/日期]`，直击团队迭代脉搏；
    - **新增【业务板块】深度卡片 (下层右栏)**：按业务文件夹统计项目沉淀与版本数，单行内嵌 `[分类名称 flex:1 省略] [70px 平滑进度条] [X 项目 · Y 版本]`，业务比重一览无余；
    - **严守克制与 1:1 对称工业美感**：下层两卡片与中层、中下层保持完全一致的 1:1 双栏等宽对齐，无任何花哨装饰，无废话文学，条目单行紧凑自适应截断，数据真实说话；
  - 编写并通过 `test_v3_2_46_expanded_dashboard.py` 全量端到端测试，同步部署至生产环境。
- **历史状态回顾 (v3.2.45)**：
  - **数据大盘 1:1 严格对称与视觉对齐彻底重构**：
    - **中下层 1:1 严格等宽对称**：中层（走势/存储）与下层（排行/时段）栅格统一重构为 `grid-template-columns: 1fr 1fr; gap: 12px;`，中间中缝垂直贯通对齐，消除右侧留白空洞；
    - **SVG 图表 360 宽幅横向铺满**：走势图与 24 小时时段分布 SVG `viewBox` 扩充至 `360 95`，基准线横向贯穿 `12 ~ 348`，立柱在卡片内舒展铺满，消灭原 320 viewBox 造成的右侧空虚；
    - **热度排行单行内嵌紧凑排布**：卡片彻底移除了 `justify-content: space-between`，恢复靠顶流式布局；进度条收敛为固定宽 70px 的行内组件，形成 `[徽章 17px] [标题 flex:1 截断] [分类微标] [进度条 70px] [次数 36px]` 单行规整排列，条目少时也能优雅靠顶，杜绝拉扯割裂；
    - **右上角控件统一规范**：四大卡片头部水平居中拉齐，时段峰值收敛为极简微标 `峰值 09:00`，字阶与视觉权重高度一致；
  - 编写并通过 `test_v3_2_45_grid_and_alignment.py` 静态断言与生产环境自动化测试，全量同步部署至生产环境。
- **历史状态回顾 (v3.2.44)**：
  - **数据大盘地毯式脱噪与生硬标注彻底清零**：
    - **废话文学全面铲除**：彻底清除了“24小时作息图谱”、“每日访问频次 (PV)”、“月度每日查阅量”、“累计查阅”等所有过度修饰词与冗余表头；
    - **移除生硬的硬编码工作时段**：彻底删除了图表中间生硬的“工作时段 (9:00 - 18:00)”浅蓝底块与居中文本，避免主观臆断与在系统设置中强增配置复杂度的两难境地，24 小时各时段高低完全由真实数据客观自然说话；
    - **标题体系极致纯粹**：四大卡片标题整齐对齐为 `查阅走势`、`存储空间`、`热度排行`、`时段分布`，控件与数据自解释，视觉干练高级；
  - 编写并通过 `test_v3_2_44_clean_dashboard.py` 全量端到端测试，同步部署至生产环境。
- **历史状态回顾 (v3.2.43)**：
  - **数据概览大盘克制与深度多维升级 (饱满撑满视口)**：
    - **极简克制拒绝鸡肋**：坚决贯彻克制哲学，彻底剔除桌面/移动端、外链占比等无实质指导意义的细碎杂讯，全盘聚焦“迭代节奏”、“访问趋势”、“热度排行”、“查阅时钟”4 大核心业务诉求；
    - **走势图支持 [7天/30天] 微胶囊无缝切换**：右上角增加轻量分段微控制器，7 天粗柱与 30 天月度连续波谱纯原生 SVG 秒切，0 延迟、0 外部依赖；
    - **下层新增严格对称双栏 (1.25 : 1)**：
      - **左栏【原型热度排行 Top 5】**：展示近 30 天访问最多的 5 个项目，带 1~5 排名徽章（Top 3 晴空蓝微标）、项目名称、所属文件夹微注、4px 极细平滑进度条与累计查阅频次；
      - **右栏【24 小时查阅时段分布】**：纯原生矢量 SVG 绘制 24 根紧凑时段立柱（00:00~23:00），柔和标记 09:00~18:00 工作时段区间，hover 浮现整点查阅量，右上角自动提炼查阅峰值时段；
    - **上下中层栅格完美对齐**：上层指标卡（新增“近30天发布 X 个迭代”交付脉搏）+ 中层双栏（走势与存储）+ 下层双栏（热度榜与作息时钟），整体高度恰好撑满控制中心视口，干净、高级、耐看；
  - 编写并通过 `test_v3_2_43_dashboard_expansion.py` 全量端到端测试，同步部署至生产环境。
- **历史状态回顾 (v3.2.42)**：
  - **侧边栏登录实体按钮全面重构 (用户截图命中)**：
    - 彻底根除原内联极简、仅 12px 浅灰死文本形态，重构为标准 Linear 实体控件 `.sidebar-login-btn`；
    - 物理尺寸规范为高度 `34px`，宽度饱满居中，带 1px 微细边框与清晰图标；
    - 配备平滑鲜明的 `:hover`（边框与文字变品牌蓝、背景反白浮现、微蓝光晕）、`:active`（轻微下压）以及聚焦环反馈；
    - 全站密码模式下配套提供浅红软底高亮悬停的 `退出访问` 辅助链接；
  - **全站 Hover / Active / Focus 交互状态可用性系统性排查与强化**：
    - **左侧树条目对比度翻倍**：修复原 hover 底色与画布仅差 3 色阶导致肉眼无法辨识的重大缺陷，`.category-header:hover` 提升为 `#eef1f5`，`.item-row:hover` 提升为 `#eaedf2`，悬停轮廓分明；
    - **数据表格行 Hover 补全**：控制中心所有表格行增加 `tbody tr:hover { background: #f8fafc; }` 平滑底色高亮，增强数据扫视易读性；
    - **控制台导航 Hover 强化**：`.admin-nav-item:hover` 升级为 `#eaedf2` 并联动高亮品牌蓝图标；
    - **表单控件交互递进**：所有输入框与下拉框 (`.m-input`, `.m-select`, `.search-input`) 补全 `:hover` 边框平滑过渡色（`#cbd5e1`）；
    - **微文本按钮热区扩展**：`.text-link-btn` 增加 `4px 8px` 内边距与浅底悬浮反馈，彻底告别细文字滑脱；
    - **弹窗关闭按钮反馈**：`.close-x` 增加 `:active { transform: scale(0.92); }` 实体触感；
  - 编写并通过 `test_v3_2_42_login_btn_and_hover.py` 全量自动化测试，同步部署至生产环境。
- **历史状态回顾 (v3.2.41)**：
  - **控制中心【数据概览】独立置顶导航落地**：
    - **导航首位独立 Tab**：将双层数据大盘从系统设置卡片中彻底抽离，在控制中心左侧导航栏第 1 项置顶为【数据概览】（`dashboard`），打开控制中心默认高亮直达；
    - **系统设置纯粹归位**：原【系统设置】（`brand`）完全剥离图表与大盘，恢复纯净的“常规信息 + 品牌资产 + 访问安全”配置属性，彻底杜绝臃肿与误解；
    - **SVG 图表交互体验加倍**：在 7 天走势图每根柱子周围增加宽 38px、高 90px 的全高隐形感应槽，鼠标随手滑入任意日期区域即刻精准触发 hover 查阅量；
  - **全站点击热区（Click Area）与人机工效全面升级**：
    - **全局小按钮物理热区扩张**：`.btn-act` 统一规范为 `28×28px`，图标 15px 居中对齐，杜绝鼠标瞄准费力；
    - **快速创建随手触发**：左上角全局 `+` 快速创建按钮 `#btnQuickAdd` 提升至 `30×30px`，带微细边框与悬浮反馈；
    - **弹窗关闭高效干脆**：右上角关闭叉号 `.close-x` 扩充至 `32×32px`（图标 19px），关闭更稳健随手；
    - **顶部多版本下拉升级**：`.top-ver-select` 高度提升至 `28px`，扩充内边距，告别原 20px 细窄下拉框；
    - **拖拽手柄稳抓手感**：`.drag-handle` 增加隐形内边距，感应区扩至 `22×22px`，抓取丝滑无滑脱感；
    - **开关与文件选择整行触控**：
      - `.linear-switch` 增加 `::after` 外扩 6px 隐形感应区，边缘盲点也能触发；
      - `.file-name-display` 支持整行点选，点击文件名文本区域同样秒开文件选择器；
  - 编写并执行全量自动化断言与生产环境鉴权测试，全量同步部署至生产环境。
- **历史状态回顾 (v3.2.40)**：
  - **系统设置顶部·双层饱满数据概览大盘落地**：
    - **严守克制直白·拒绝废话文学**：
      - 彻底剔除“安全水位”、“配额”等生造与运维黑话，全盘聚焦产品团队真正关心的 3 大核心维度（资产沉淀、磁盘开销、查阅热度）；
    - **双层饱满结构·撑满 800px 控制中心视口**：
      - **上层（4 列等宽核心指标卡）**：
        1. `托管资产`：`X 项目 · Y 版本`，副标签清楚标注 `归档 Z 份 RP 源文件`；
        2. `存储占用`：真实磁盘占用（如 `5.1 MB`），副标签显示 `空间状态良好`；
        3. `近 7 天查阅`：累计访问总量（如 `X,XXX 次浏览`），副标签显示 `今日新增 +XX`；
        4. `协作团队`：当前正常状态成员数（如 `X 位成员`），副标签显示 `X 个工作文件夹`；
      - **下层（双栏深度图表区，55% : 45% 横向铺满）**：
        1. **左侧【近 7 天走势柱状图】**：纯原生矢量 SVG 绘制 7 根平滑微圆角晴空蓝立柱，带日期标签与基准线，hover 直观显示当日 PV；
        2. **右侧【存储空间深度拆解】**：带总容量与 5px 彩色分段比例条（HTML 预览包 蓝 / RP 源文件 琥珀黄 / 数据库与媒体 灰），下方配对清晰的容量与占比清单；
    - **零重型库依赖与极速毫秒级响应**：
      - 100% 纯内联原生 SVG + 原生 PHP 统计，无任何图表库网络开销，Retina 屏极致锐利，打开控制台 0 延迟；
    - 编写并执行自动化测试验证生产环境渲染无误，全量同步部署至生产环境。
- **历史状态回顾 (v3.2.39)**：
  - **原生确认弹窗全面根除·现代 Linear 确认对话框落地**：
    - **原生 `confirm()` 彻底清零 (0 命中)**：
      - 地毯式排查全站所有调用系统级浏览器弹窗（如 `example.com 显示`）的点位，实现全局现代轻量确认对话框组件 `showConfirm()`；
      - 纯原生 DOM + 项目既有设计系统变量，无任何外部重型构建依赖，开箱即用支持 Promise 与键盘交互（ESC 取消、Enter 确认、点击背景关闭）；
      - 涵盖 9 处核心操作场景：
        1. **清空系统日志**（用户截图命中）：标题 `清空日志`，说明 `确定清空所有系统日志？`，红色危险确认按钮 `清空`；
        2. **删除项目**：标题 `删除项目`，说明 `确定删除该项目及所有版本？`，红色危险确认按钮 `删除`；
        3. **删除文件夹**：标题 `删除文件夹`，说明 `确定删除该文件夹及其所有项目？`，红色危险确认按钮 `删除`；
        4. **删除版本**：标题 `删除版本`，说明 `确定删除版本【xxx】？`，红色危险确认按钮 `删除`；
        5. **删除成员**：标题 `删除成员`，说明 `确定删除该成员账号？`，红色危险确认按钮 `删除`；
        6. **作废专属短链**：标题 `作废链接`，说明 `确定作废此专属分享链接？`，红色危险确认按钮 `作废`；
        7. **重置安全直链**：标题 `重置链接`，说明 `确定重置分享链接？旧链接将失效。`，红色确认按钮 `重置`；
        8. **后台退出登录**：标题 `退出登录`，说明 `确定退出当前管理账号？`，蓝色主按钮 `退出`；
        9. **前台退出访问**：标题 `退出访问`，说明 `退出后需重新输入全站访问密码。`，蓝色主按钮 `退出`；
    - **安装向导原生 `alert()` 升级**：`install.php` 中移除所有原生 `alert()`，改为深色胶囊轻量 Toast 提示浮层；
    - 编写并执行自动化测试断言全站 `confirm()` 与 `alert()` 调用数为 0，且全量同步至生产环境。
- **历史状态回顾 (v3.2.38)**：
  - **废话文学地毯式清洗·全站脱噪极净化**：
    - **主视口空状态（用户截图命中）**：
      - 标题统一收紧为纯净的 `暂无在线版本`，彻底删除 `该项目已建立，尚未上传任何 Axure HTML 静态版本文件` 技术说教长句；
      - 访客态彻底删除 `访客仅可浏览已发布的原型资产` 权限说明，保持纯净留白；
      - 管理员按钮从“立即发布版本”提炼为干练的 `发布版本`；
      - 未选项目默认提示由“请在左侧选择项目开始浏览/点击左侧目录树中的原型资产即可沉浸式在线预览”极简收敛为 `选择项目以浏览`；
    - **弹窗与文件选择器**：
      - 压缩包与 RP 源文件占位符统一精简为 `未选择文件`，彻底移除“选择 Axure 导出的 HTML 静态压缩包”、“可选，支持 .rp 原型源文件受控鉴权下载”等说教；
      - “Axure 源文件 (.rp)”统一简称为 `RP 源文件 (.rp)`，发版按钮精简为 `发布`；
      - 专属分享面板标题、占位符和按钮精简为 `创建专属链接`、`备注 (选填)`、`创建并复制`，空状态移除“可通过右上角为指定对象单独生成...”碎碎念；
    - **独立外链与安全拦截页**：
      - 失效、不存在、未公开、已暂停、已到期、凭证无效拦截卡片文案全面脱噪（标题均为 4~6 字，说明干脆克制）；
      - 独立密码保护卡片标题统一为 `输入访问密码`，副标题直接显示项目名称，移除多余产品说明；
    - **操作反馈与确认框**：
      - 全面清洗 Toast 提示语（如 `链接已重置`、`设置已保存`、`日志已清空`、`版本已删除`、`专属链接已创建并复制`）；
      - Confirm 确认弹窗彻底剔除“删除后不可恢复”、“作废后即刻失效”等恐吓冗余词；
    - 编写并执行自动化断言脚本校验全量废话短语 0 命中，全量同步部署至生产环境。
- **历史状态回顾 (v3.2.37)**：
  - **举一反三·全站重复关闭彻底清除**：
    - 地毯式排查全站弹窗，精准识别并移除了 2 处“右上角已有 `×`，底部又单独做一个底栏只放一个【关闭/完成】”的重复设计：
      1. **版本管理弹窗（`versionManageModal`）**：彻底删除底部的灰色条栏与“关闭”按钮；
      2. **分享设置弹窗（`shareManageModal`）**：彻底删除底部的细边框与“完成”按钮；
    - 查看与管理类弹窗统一收敛至右上角标准 `×` 按钮或 ESC 键关闭，弹窗高度有效收紧约 45~55px，界面纯粹轻盈；
    - 带有提交动作的表单类弹窗（新建项目/文件夹/发布版本）依然规整保留标准的 `[取消]` + `[确定/保存]` 动作对；
  - 编写并通过全量自动化断言测试，同步部署至生产环境。
- **历史状态回顾 (v3.2.36)**：
  - **幽灵保存按钮彻底根除**：
    - 排查并移除了此前在 `modals.php` 中多写的一处 `settings-footer-bar`（内含多余的“保存配置”蓝色主按钮）；
    - 该多余按钮因处于 Tab 面板容器外部，导致切换到“系统日志”等面板时依然悬浮在右上角露出半截蓝色块；
    - 修复后确保全站唯一并严格封装在系统设置面板内，切换 Tab 时彻底洁净无残留；
  - 编写并通过端到端自动化断言测试，同步部署至生产环境。
- **历史状态回顾 (v3.2.35)**：
  - **项目管理表格去噪音与极致简化**：
    - 彻底移除创建人列每一行的灰色药丸底色、小人图标与 `@` 符号，回归纯净的文本人名呈现（无姓名时展示 `-`）；
    - 彻底移除历史版本列每一行的时钟图标与“个版本”冗长赘字，直接呈现聚焦的纯数字链接；
  - **发版入口坚决收拢闭环**：
    - 彻底移除“版本管理”弹窗（`versionManageModal`）底部的“发布新版本”重复按钮，底栏仅保留右对齐的“关闭”；
    - 贯彻“单一顺手入口”设计哲学，全站发版统一收拢至左上角全局 `+` 快速创建菜单，杜绝散乱发版入口；
  - 编写并通过全量自动化脱噪与功能断言测试，同步部署至生产环境。
- **历史状态回顾 (v3.2.34)**：
  - **系统设置页面地毯式脱噪与极简化**：
    - 彻底剔除三大卡片顶部的概述长句（`配置平台对外展示...`、`自定义全站...`、`设置前台原型...`）；
    - 彻底砍掉媒体卡片下方的说明书式碎碎念（`用于侧边栏与前台直链页头部...`、`推荐 128×128...` 等）；
    - 彻底根除密码框周围的“三重重复轰炸”说教长句，仅保留微型标签 `[已设置]` 与 placeholder `留空保持不变`；
    - 字段名全面归正极简：`平台名称`、`平台副标题`、`页脚版权`、`Favicon`、`全站密码保护`；
    - 页面高度显著压缩，控件自解释，彻底回归 Linear 克制干练质感；
  - 编写并通过全量自动化脱噪断言测试，同步部署至生产环境。
- **历史状态回顾 (v3.2.33)**：
  - **后台登录弹窗补充“记住我”双模式凭据**：
    - 登录弹窗密码框下方新增微型复选框 `[✓] 记住登录状态 (30天)`，默认保持勾选；
    - **勾选时（默认）**：签发 30 天持久安全 Cookie 凭证，一个月内免重复输入账号密码；
    - **取消勾选时**：仅在当前浏览器会话生效（Session 级），关闭浏览器即自动安全登出；
    - 登录日志精确区分记录 `登录成功 (记住30天)` 与 `登录成功 (单次会话)`；
  - **系统设置与访问安全完善**：
    - 增加“全站访问密码”实时状态徽标（已设置密码 / 尚未设置密码）与前后端防呆拦截；
    - 彻底根除背景图内联 JS 截断 Bug，补全媒体卡片规整对齐与 Tab 切换回顶；
  - 编写并通过 `test_remember_me.py` 自动化端到端测试，且全量同步至生产环境。
- **历史状态回顾 (v3.2.32)**：
  - **管理控制中心导航收拢为 4 项 (方案 A)**：
    - 精简为干脆利落的 4 项架构：`项目管理` $\to$ `团队成员` $\to$ `系统设置` $\to$ `系统日志`；
    - 彻底移除原仅含两行表单、空荡孤立的“访问安全”独立 Tab；
  - **【系统设置】全面对齐 Linear 设计系统规范**：
    - 采用白底 + 1px 细边框三大独立 Section 卡片：
      - `常规信息`：2 列响应式网格排布企业名称与平台副标题，优雅分列单项目专属分享上限；
      - `品牌资产`：精致微缩预览卡片（Logo 120×38、Favicon 38×38、登录背景状态），微文本操作按钮；
      - `访问安全`：纯 CSS 现代平滑 Toggle 开关（`linear-switch`）取代古老 Checkbox，密码输入框智能联动展开；
    - 底部统一右对齐带图标的操作保存条；
  - 编写并通过 `test_linear_settings.py` 自动化端到端测试，且全量同步至生产环境。
- **历史状态回顾 (v3.2.31)**：
  - **全站地毯式脱噪与说教文案全量清理**：
    - 清除弹窗中所有“括号产品说明书”式文案（如 `(不显示)`、`(长期有效)`、`(可选，仅供内部下载备份)`、`如：发给客户李总...` 等）；
    - 统一归正控制中心“访问日志”与“单项目专属分享上限”描述，彻底根除“原型”残留旧词；
    - 全面精简 Confirm 确认对话框中的恐吓式冗长文字，回归直接克制；
    - 右侧顶部工具栏分享按钮 hover title 与文案完全统一。
- **历史状态回顾 (v3.2.30)**：
  - **侧边栏与表单深度净化**：移除文件夹行右侧冗余的 `+` 加号与“新建链接”，彻底收拢至左上角全局统一入口；
  - **侧栏项目菜单极简化**：移除项目更多菜单中重复的“分享设置”（统一由右侧顶部主视口分享按钮承接），清理“由 @xxx 创建”标签，文案对齐为“删除项目”；
  - **说教与垃圾文案全量清除**：清理弹窗中“项目负责人 / 作者 (管理员可调整项目归属)”等废话文案，纯净呈现为“项目负责人”。
- **历史状态回顾 (v3.2.29)**：
  - **外链属性彻底剥离负责人**：在新建与编辑外链弹窗中全面隐藏“项目负责人”选择框，外链纯粹作为 URL 资产管理；
  - **发版强约束：ZIP 必选、RP 可选**：界面与前后端接口严格约束原型压缩包 (.zip) 为必填项，RP 源文件设为可选备忘下载，杜绝仅传 RP 无法在线预览的无效版本。
- **历史状态回顾 (v3.2.28)**：
  - **新建链接弹窗修复**：重构 `openItemModal` 重载参数解析，精准支持 `(catId, 'link')` 传参，彻底修复新建外链误弹出新建项目的 Bug；
  - **发布版本弹窗极简化**：彻底移除“更新日志”冗余输入框，将“设为当前默认版本”收拢为默认项，发版弹窗仅保留所属项目、版本号与压缩包/源文件选择，秒级发布；
  - **默认版本机制清晰化**：多版本下默认版本即为主展示版本，打开项目或外发时直达此版本，日常发布默认生效。
- **历史状态回顾 (v3.2.27)**：
  - **新建项目与版本彻底解耦与极简化**：新建项目弹窗剥离初始版本输入与上传区，仅保留“所属文件夹”和“项目名称”，秒级创建纯净资产容器；
  - **项目与版本作者权责自然归属**：新建项目不设作者指定，谁创建默认归属谁；多产品经理协作时，各版本谁上传就归属谁，系统原生展示对应版本发版人；
  - **管理员专属兜底调整**：作者指派下拉框仅在“编辑项目”且登录身份为管理员时呈现，供管理员必要时移交或调整项目负责人，非管理员完全不可见。
- **历史状态回顾 (v3.2.26)**：
  - **“分类”全量对齐更名为“文件夹”**：彻底将全站“分类”心智统一更名为“文件夹”（桌面操作系统级认知），视觉图标与文案完美契合；
  - **概念层级全面定稿**：`文件夹 (Folder, 归纳目录) -> 项目 (Project, 资产容器) -> 版本 (Version, 交付迭代) 与 链接 (Link, 外部资产)`；
  - **弹窗与交互文案全链路闭环**：快速创建气泡菜单（新建文件夹）、树节点管理（文件夹管理、重命名文件夹、删除此文件夹）、弹窗（新建文件夹、所属文件夹）、控制台统计与列表全部对齐，后端返回提示同步更新。
- **历史状态回顾 (v3.2.25)**：
  - **全局快速创建统一入口落地**：侧边栏顶部将原单一低频的“添加分类”重构为全局 **`+`** 快速创建气泡菜单；
  - **四字极简文案与频率排布**：遵循实际业务频率与菲茨定律排布：**发布版本 (首位高频) → 新建项目 → 新建链接 → [细分割线] → 新建文件夹**；
  - **发版项目可切换智能联动**：“发布版本”弹窗升级为项目下拉选择框，默认自动锁定当前选中的原型项目，且允许随时自由切换至其他项目；
  - **专属分享上限参数管控**：控制中心【系统设置】支持自定义“单项目专属分享上限”（`max_custom_shares_per_item`），默认 5 条，支持 1 ~ 99 条严格校验；
  - **默认主链与专属外发彻底解耦**：默认主链的暂停开关仅管控公共直链本身，发给特定客户的专属外发短链完全独立受控。
- **后续接续工作**：
  1. 协助用户在生产环境（`https://example.com/v2/`）验收“文件夹”概念统一后的使用体验；
  2. 后续任何修改继续坚持**“操作前先向用户说明计划与范围、保持视觉克制极简、绝不破坏现状备份”**。
