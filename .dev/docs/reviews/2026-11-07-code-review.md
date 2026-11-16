# 代码审查 · 2026-11-07

## 结论

发布前需收敛:**1 项存量 P1(F3 批注关联对象授权)+ 2 项新增 P1(JS onclick 注入链)+ 5 项新增 P2**;2026-11-06 架构审查登记的 F4/F5/F7/F8 全部仍在,F9 前半升级为确凿缺陷、后半已修复。授权模型、SQL 参数化、CSRF、会话治理、MCP 凭据生命周期与 PHP 7.0 兼容性经全面静态审查无新问题。

## 验证证据

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 全量回归 | `python3 -B .dev/tests/run_all_tests.py --php /tmp/protoloft-php-review/php` | 15/15 套件 PASS,可识别断言 585,45.84s |
| PHP 语法 | `/tmp/protoloft-php-review/php -l` 遍历根目录与 includes 全部 PHP | 全部通过(运行时 PHP 8.3.20) |
| JS 语法 | `node --check` app/admin/annotation/mcp/share.js | 5/5 通过 |
| 关键发现复核 | 审查员报告后,主审对全部 P1/P2 逐条重读源码核验 | 见下文标注 |

方式:4 个领域并行静态审查(后端授权、资产/分享/ZIP、MCP、前端逻辑与规范)+ 主审复核。所有动态利用场景均标注「未复现,仅静态分析」;未操作工作区数据、未上传 FTP。**未覆盖**:PHP 7.0 实机、生产 Apache/Nginx、真实浏览器键盘/窄屏验收、官方 MCP SDK 互通、Webhook 实际送达。

## 存量问题核验(2026-11-06 登记)

### F3 · P1 · 仍在 · 批注衍生接口绕过版本范围与访客开关

- `previous_annotations`(`includes/actions/annotations.php:31-43`):授权只核验当前版本(`PrototypeContext::version` → `hasShareAccess`),上一版本查询 `SELECT * FROM versions WHERE item_id=? AND id<?` 后直接取批注全文,`$previous` 从未过 `hasShareAccess($item, $previous)` 或 `canGuestAnnotate()`。访客持有 V2 分享授权即可读 V1 全部未解决批注正文(content/page_snapshot/author_name)。接口在 `api.php:128` 列入 `$readOnlyActions`,GET 直达。
- `annotation_target`(`annotations.php:28-30` → `collaboration.php:17-26` → `prototype_context.php:9-19`):访客分支唯一检查是 `hasShareAccess`,全链路无 `canGuestAnnotate()`(该函数定义于 `auth.php:466-468`,仅被写入口引用)。`perm_guest_annotate=0` 时访客仍可 GET 拿到授权版本上任意批注完整记录。
- 版本锁定本身有效(非授权版本会被 `prototype_context.php:18` 拒绝);跨版本泄露仅经由 previous 路径。修复方向同原审查:集中批注读取策略,对实际返回的每个版本核验授权。

### F4 · P2 · 仍在 · RP 写操作失败时文件与数据库不一致

`versions.php:190-235`(更换):`copy()` 在事务开始前覆盖物理文件,锁内仅拿写锁、未像 `version_publish:104-114` 一样复核归属与状态;`:237-270`(移除):事务内 commit 前 `@unlink`。DB 回滚无法恢复文件。另:两条路径读版本/权限均早于最终写锁。

### F5 · P2 · 仍在 · 新装 Schema 运行期补列

`includes/db.php:37-38、256、272` 的 `ALTER TABLE ... ADD COLUMN` 残留,每请求吞异常执行。当前版本边界明确不承担旧库兼容,应删。

### F7 · P2 · 仍在 · 局部样式绕开公共体系

- 批注发送按钮内联 28px 仍在(`index.php:822、829`);share.php 7 个状态分支各自复制 empty-card 模板且仅引 remixicon.css(`share.php:58-88、96-127、140-171、213-244、259-291、359-390、404-437`);
- app.css `!important` 现为 97 处(略降);`:root` 的 `--primary: #0076de` 与 AGENTS.md 定稿 `#0284c7` 不一致,品牌色二选一需对齐(见下文 P3-前端-8);
- modals.php 新聚集一批硬编码状态色 hex(见 P3-前端-1)。

### F8 · P2 · 仍在(垫片式缓解) · 公共请求层分叉

- annotation.js:9-24 的 apiFetch 垫片已改为 fallback(仅当 window.apiFetch 不存在时定义),但分享页无 Promise 互斥;状态切换类操作(toggleAnnoStatus/deleteAnno/reviewAnno/carryAnnotation)无防连点(提交类有局部标记);
- `formatBytes` 于 app.js:14 与 admin.js:47 双定义(后者覆盖前者);Markdown 双实现仍在(app.js:27 起 与 share.php:964-1029);
- MCP 解决批注仍另写全套逻辑(`mcp_service.php:148-198` vs `annotations.php:306-362`),且规则已漂移:Web 允许批注作者本人解决,MCP 要求 canEditItem(更严、无越权,但两套规则);MCP 额外插入 annotation_replies 行;Webhook 载荷分叉(MCP 追加「，说明：{reply}」)。

### F9 · 前半升级为确凿缺陷(见新发现 P2-B),后半已修复

`toggleItemType`(admin.js:1621-1624)link 类型已隐藏 Webhook 分组,`handleItemSave` 强制清空。

## 新发现

### P1-A · 外链 URL 拼入 onclick 属性,转义链失效 → 存储型 XSS + 按钮损坏

- 位置:`assets/js/app.js:548`(工作台外链落地卡片)、`assets/js/admin.js:1697`(编辑外链后重渲染)、`assets/js/admin.js:1762`(新建外链行)。
- 机制(主审已核验 `esc()` 实现,app.js:9-12):`esc()` 把单引号转为 `&#39;` 后拼入 `onclick="copyTextToClipboard('...')"`,innerHTML 注入后浏览器解码 `&#39;` 回裸引号,URL 中的 `')` 可闭合 JS 字符串注入任意代码。admin.js 的补救 `.replace(/'/g, "\\'")` 在 esc **之后**执行,找不到裸引号,完全无效。
- 场景:后端 `items.php:90` 仅校验 `^(https?://|/)` 前缀、不禁引号。协作者创建外链 URL 填 `http://x.com/page');alert(document.cookie)//`,管理员打开控制台点击「复制链接」即执行——协作者向管理员页面注入 JS 的横向路径;即使非攻击,仅含一个普通单引号的 URL 也让该按钮 JS 语法报错失效。
- 对照:`modals.php:1293` 的 PHP 渲染用 `htmlspecialchars(addslashes(...))` 组合,是正确的;仅 JS 动态渲染路径错误。
- 修复:数据与行为分离(事件委托 + `data-*` 属性传值),或先 `addslashes` 再 `esc`。同类无效模式:`admin.js:1098、1797`(文件夹名/项目名)。

### P1-B · `.attr('onclick', ...)` 写入 `&quot;` 实体,编辑保存后再点编辑按钮即损坏

- 位置:`assets/js/admin.js:1711-1712`(外链)、`:1729-1730`(项目),属 916dc34 引入的动态编辑链。
- 机制:jQuery `.attr()` 底层 setAttribute 不做 HTML 实体解码,onclick 的 JS 源码变成 `openEditItemModal({&quot;id&quot;:1,...})`,点击即 SyntaxError,直到刷新页面(控制台关闭本就整页 reload,故暴露窗口为控制台打开期间)。新建行走 `.append(html)`(innerHTML 路径)反而正常,行为不一致。
- 修复:与 P1-A 一并改为事件委托 + data 属性,不在 onclick 字符串里放数据。

### P2-A · 「设为默认版本」「删除版本」同步选择器全部落空(F1 同类残留)

- 位置:`assets/js/admin.js:3628-3632`、`:3666-3676`。
- 主审已 grep 实锤:modals.php 中不存在 `#verManageList`、`.ver-manage-name-cell`、`.btn-ver-default-action`(现容器是 `#verManageTableBody`,行结构 `.ver-cell-ver-wrap`/`.ver-badge-default`,modals.php:156);版本管理入口是 `<button class="btn-table-ver">` 而非代码查找的 `<a>`(modals.php:1180)。
- 场景:设默认 → 请求成功、控制台行徽标更新,但弹窗内无变化、`currentVerManageAllVersions` 未同步 → 重开弹窗仍显示旧默认;删除 → `currentVerManageAllVersions` 与 `$node.data('versions')` 均未剔除 → 重开弹窗已删版本复活,「N 个版本」计数不更新。修复方向:复用 `syncPublishedVersion`(admin.js:1008-1020)同款全量同步,不修补局部 DOM。

### P2-B · `SYS_HAS_GLOBAL_WEBHOOK` 读未定义 `$settings`,恒为 false(F9 确凿化)

- 位置:`index.php:856`。主审已 grep 实锤:`$settings` 在 index.php/modals.php/login_modal.php 中无任何赋值(实际设置键是 `global_webhook_url`,modals.php:1683)。
- 场景:管理员配置全局评审群 Webhook 后,发版弹窗「发送群通知」开关仍被 `updateUploadNotifyState`(admin.js:161)判为不可用恒禁用——全局通知功能在前端判定层整体失效。修复:读 `Auth::getSetting('global_webhook_url')`。

### P2-C · MCP「指定项目」清空选择自动保存,凭据范围静默扩大为全部项目

- 位置:`assets/js/mcp.js:434-437`(空数组时不 append `project_ids[]`)+ `includes/actions/mcp.php:13`(缺省回退 `project_id=0`)+ `mcp_access.php`(空值归一为全部)。
- 场景(主审已核验代码路径):用户切「指定项目」→ 清空 → 下拉关闭自动保存 → 服务端立即置为该账号可见的全部项目;UI 显示「请选择项目…」、toast 提示「权限已自动保存」,本地快照与真实状态分叉,刷新前不回显。扩权上限是账号自身可见范围(非越权提升),且「未选=全部」的 API 语义是已确认设计;问题在 UI 把「什么都没选」无声翻译成「全部」,无拦截无确认。修复:自定义模式空选时阻止保存并提示,或显式确认「将范围改为全部项目」。

### P2-D · 防泄密水印可经 iframe 直开 asset.php 绕过

- 位置:`share.php:794` 的 iframe 直接暴露 `asset.php` 资源 URL;水印仅为顶层文档 canvas overlay(share.php:1071-1107),`asset.php` 全文无水印注入。
- 场景:访客复制 iframe src 新标签直开(session 中已有 share_grants,`asset.php:20` 放行),得到完全无水印的原型页面;或 devtools 删除 overlay。客户端水印可移除属固有限度,但「iframe 直开即无水印」使该功能对真实泄密场景基本无效。需产品定位决策:标注为威慑,或评估 asset.php 服务端叠加水印的成本。

### P2-E · `handleItemSave` 只 attr 不 data,jQuery data 缓存失真

- 位置:`assets/js/admin.js:1684-1685`。其他同步路径(如 admin.js:1017、3837-3838)均 `data(k,v).attr(k,...)` 双写,此处仅 attr。
- 场景(未复现,静态推演,依赖「先读缓存→改→再读」时序):先按文件夹筛选(读取 `data('cat-id')` 进缓存)→ 编辑项目换文件夹(仅 attr)→ 再筛选或调序(`moveItemOrder` admin.js:1466)→ 拿到旧分类 ID,`item_sort` 携带错误的 category_id。

## P3 清单(合并各领域,均静态分析)

**后端/安装**
1. 记住登录态回填无 `session_regenerate_id`(auth.php:305-328;登录/改密路径已正确再生),需前置 cookie 投放能力,实际可达性低。
2. login CSRF(豁免,api.php:151)+ 差异化消息与未命中不跑 password_verify 的账号枚举/时序差(auth.php:120-133)。
3. `register_visitor` 无限流且同步扇出管理员 Webhook(actions/auth.php:80-161;每次最长 2s),可刷量放大并污染待审列表。
4. SVG 品牌图上传黑名单不完备(api.php:44-63):缺 `onbegin`/`onanimationstart`/`foreignObject` 等;上传者本就是最高信任角色,降为纵深。
5. install.php:`@mkdir 0777`(56,70 行,共享主机同租户可读数据库);PDO 异常消息直接回显(176);lock 文件明文写管理员邮箱(168-172)。重装路径依赖文件系统权限,未发现远程绕过。
6. 分享口令明文入库并明文回显给管理者(db.php:131,178;auth.php:742,871)——DB 泄露即泄露全部外发口令;比较侧已用 hash_equals,属设计权衡。
7. 存储侧 `webhook_url` 不走 `Webhook::isAllowedUrl`(auth.php:1064-1067、items.php:73-75),与 profile 更新不一致;发送侧已白名单兜底,无 SSRF,仅一致性与垃圾数据问题。
8. `link_url` 允许协议相对地址 `//evil.com`(items.php:90-92),弱钓鱼面。
9. 低权限可稀释 `access_logs` 滚动窗口(system.php:29-36;40 次抽样裁剪保留 2000 条)。
10. `getClientIp` 注释称自适应反代,实现仅取 REMOTE_ADDR(auth.php:885-891):反代部署后全站共享单一 IP,login 限速集体误伤、审计 IP 失真。

**分享/资产**
11. share.php 内联 `<script>` 中 `json_encode` 未加 `JSON_HEX_TAG`(share.php:855-859、1035):含 `</script>` 的版本名/更新日志可闭合脚本标签;输入者为受信内部成员,不新增实际攻击能力,建议补 flag。
12. 自定义短码口令为空时绕过项目全局口令与有效期(share.php:443-447、455)——与「专属链接独立受控」设计一致,属行为确认项,建议创建空口令专属链接时显式确认。
13. Webhook 消息体未转义用户输入即拼 Markdown(webhook.php:137-148),访客批注正文可注入钓鱼链接到内部群频道。
14. Google Fonts 净化旁路:@import 字符串形式、无引号 href、JS 动态注入均不匹配(zip_handler.php:52-86)——内网场景仅为多余请求。
15. ZIP 纵深加固点:符号链接检测仅覆盖 Unix 条目(367-376);500MB 上限基于中央目录声明尺寸预扫描;NUL 字节未显式拒绝(读侧已兜底)。主结构(强制 realpath 前缀、逐条拒绝穿越/绝对路径/脚本扩展、30000 文件+500MB 双上限、失败清理)扎实。
16. 访客对访客批注获得 `can_review=true`(collaboration.php:14 的 `(int)null['id']===0`),仅 UI 层显示无效按钮,后端有 `canAnnotate` 硬门。

**MCP**
17. `includes/mcp_panel.php` 为无引用死代码,且重复 modals.php 全部 DOM id、含 14 处内联样式——一旦误 include 即控制失灵,建议删除或移入 .dev/。
18. `resolve_annotation` 三种错误文案区分「不存在/不可见/范围外」,泄露存在性 oracle(mcp_service.php:151-156),与 `McpAccess::project()` 统一文案的防 oracle 意图不一致;信息量低。
19. Bearer 凭据认证无速率限制与失败审计(mcp_access.php:103-116);凭据 256 位熵穷举不可行,属纵深缺口。
20. `mcp.php` 中 `app_url()` 在 try 块外,畸形 Host 头 → 空白 500(mcp.php:22,56,75;config.php:113-127);无泄露,纯健壮性。
21. 无 Cookie 的 MCP 请求每次创建服务端会话文件(config.php:32-59 无条件 session_start);stateless 端点宜跳过会话。
22. 「复制 AI 接入指令」把完整明文凭据送入 AI 聊天提示词(mcp.js:297-316、452-464),与 `.dev/docs/mcp.md:25`「不要把凭据写入聊天提示词」相抵;属便利性取舍,建议面板文案提示风险。
23. MCP 发布强制 `is_default=1`(mcp_service.php:218)与 Web 行为不一致且未写入工具描述。

**前端**
24. modals.php 硬编码状态色 hex 聚集(1170、1173、1271、1692、1744、1822-1824、1899、1919、975-983、401),应映射 `var(--success)/var(--warning)/var(--danger)` 等;SVG 插画与 ECharts 场景不算违规。
25. 复制按钮内联非标 22px(modals.php:1293、admin.js:1699、1762),不在 28/32/38/44 阶梯。
26. `openLoginModal/closeLoginModal` 双定义(login_modal.php:99-103 与 app.js:1205-1214,app.js 后载覆盖,参数被静默忽略)。
27. `app.js:624` 的 `+ +` 拼接使空版本占位符渲染出 "NaN" 文本(node 已验证表达式求值)。
28. 批注快捷键模态检测漏掉控制中心(annotation.js:859 只匹配 `.custom-modal`),控制中心打开时按 `C` 仍弹批注抽屉;建议改用 `modalStack.length`。
29. 分享页「复制批注链接」在无 mcp.js 时静默无效(annotation.js:783 的 typeof 守卫无降级反馈)。
30. 死代码/幽灵引用:admin.js:3372 `#verManageSubtitle`、admin.js:270-272 `#uploadProjectName`、app.js:580 `safeName`。
31. `GUEST_ANNOTATION_ENABLED === true || typeof !== 'undefined'` 恒真写法(annotation.js:585、656)——share.php 仅在 canAnnotate 时注入 `= true`、关闭时不注入,当前行为正确(主审已核验 share.php:1110-1112),纯脆弱写法,降级为此。
32. `--primary: #0076de`(app.css:12)与 AGENTS.md 品牌定稿 `#0284c7` 不一致(F7 关联):令牌机制健康,主色值需二选一对齐。

## 核验通过面(正面结论)

- **SQL**:全参数化,仅两处拼接且均 `(int)` 强转;动态 IN 用占位符;UPDATE 字段名固定白名单;LIMIT 走绑定或钳制。全库无 `INSERT ... ON CONFLICT`。
- **CSRF**:会话绑定 token + hash_equals,登录/改密轮换,豁免仅 login/get_session/register_visitor,另有 Origin-Host 一致性校验。
- **会话**:登录 `session_regenerate_id(true)`;每请求回查 users 表(status/auth_version 即时失效);登出销毁 + 移除持久 token + 双 Cookie 清除;持久凭据仅存 sha256 哈希。
- **授权一致性**:写操作均「角色+资源归属」双核验;transferOwnership/version_publish/version_delete/item_delete/category_delete/item_sort 均在写锁内复核;version_publish 的 overwrite_token 用 HMAC 绑定会话 CSRF 且代际变更即作废。
- **MCP**:凭据 256 位 CSPRNG、仅存哈希、锚定正则校验、error_log 与错误响应无凭据泄露;`authenticate()` 联查 status/auth_version/过期,改密/停用/删除/撤销即时失效;发布写路径在事务锁内 `guardWrite()` 重验;桥接层按 inputSchema 白名单+类型+范围校验后才替换 $_POST/$_GET,无注入面。
- **asset.php/storage.php**:PATH_INFO 正则带 D 修饰、filePath 统一拒绝穿越段/NUL、realpath 强制前缀、MIME 白名单 26 类、`rp` 不在白名单(访客无法经预览取底稿);分片 uploadId 白名单、meta 绑定 user、500MB/1000 片双上限、flock 互斥。
- **webhook SSRF**:HTTPS-only + 三平台 host+path 白名单 + 禁跳转 + TLS 双校验,内网场景收敛到基本为零。
- **前端机制**:apiFetch 成功/失败均释放锁、Promise 复用键粒度合理;角色脚本隔离正确(annotation/share/mcp/admin 按权限加载,跨脚本引用均有守卫,未发现审阅人 ReferenceError 路径);事件绑定有防重守卫、定时器随抽屉关闭清理;app.js Markdown 先全量转义再解析 + scheme 白名单。
- **PHP 7.0 兼容**:四个领域分别静态扫描,无可空类型/void/multi-catch/const 可见性/箭头函数/短解构等 7.1+ 特征;7.3+ setcookie 已按 PHP_VERSION_ID 分叉。**未在 7.0 实机验证**。

## 收敛顺序建议

1. 先修 P1-A/P1-B(同根:onclick 字符串拼数据 → 统一改事件委托 + data 属性)与 F3(批注读取策略集中)。三者都是发布前阻断项。
2. P2-A/P2-B/P2-E 为同一主题(前端实体状态同步),与 P2-C(UI 空选语义)、P2-D(水印定位需产品决策)可并行。
3. F4/F5/F7/F8 按原架构审查的收敛顺序继续。
4. P3 按成本挑拣:install 0777、register_visitor 限流、mcp_panel.php 删除、NaN 文本、json_encode 补 flag 属低成本高确定性项。

---

# 修复复核 · 2026-11-07

对提交 `f788ec5`(收敛代码审查项、品牌主色定稿)、`d77c74e`、`4f66032`(版本管理卡片布局与分页)的逐项复核。工作区干净,基线为审查时点 `916dc34`。

## 已确认修复(主审逐项重读源码核验)

| 项 | 修复实现 | 核验证据 |
| --- | --- | --- |
| P1-A onclick 注入 | 复制按钮改 `data-copy-url` 属性 + 事件委托(app.js:571、1734-1736);admin.js 同款替换 | 全库 grep 无残留 `onclick="copyTextToClipboard` 拼接 |
| P1-B `.attr('onclick', json)` | 改 `data-item-json` + 委托处理 JSON.parse(admin.js:1794、1823、4194-4206);顺带修了 1098/1797 同款无效 replace | `.attr('onclick'` 全库零命中 |
| F3(P1)批注衍生接口 | 新增集中策略 `Collaboration::canAccessAnnotations`(collaboration.php:27-37):登录走 `canViewItem`,访客强制 `canGuestAnnotate() && hasShareAccess`;`previous_annotations` 对 current 与 previous 双核验(annotations.php:41-56);`Collaboration::target()` 统一「批注不存在或不可访问」文案,顺带消除 Web 侧存在性 oracle;并新增外链项目批注支持(ver_id=0 分支) | annotations.php 全文重读 |
| P2-A 版本弹窗幽灵选择器 | `handleSetDefaultVersion`/`handleDeleteVersion`(admin.js:3697-3796)改为实体级同步:`$node.data('versions').attr('data-versions')` 双写 + `currentVerManageAllVersions` 同步 + `renderVersionManageView()` 重渲染,覆盖控制台行与侧栏树节点 | 选择器与卡片渲染结构一致(3509、3624) |
| P2-B SYS_HAS_GLOBAL_WEBHOOK | index.php:856 改读 `Auth::getSetting('global_webhook_url', '')` | 已核验 |
| P2-C MCP 空选静默扩权 | mcp.js:378、442 空选时 toast「请至少选择一个项目,或切换为全部项目模式」并阻止保存;API 语义「未选=全部」保持不变 | 已核验 |
| P2-E data 缓存失真 | admin.js:1703-1704 改 `data().attr()` 双写 | 已核验 |
| F5 运行期补列 | db.php `ALTER TABLE` 全部移除(grep 计数 0) | 已核验 |
| GUEST 开关恒真写法 | annotation.js:631、702 改 `Boolean(window.GUEST_ANNOTATION_ENABLED)` | 已核验 |
| NaN 文本 | app.js:647 拼接已修正 | 已核验 |
| share.php json_encode | 857-859、1035 补 `JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT` | 已核验 |
| mcp_panel.php 死文件 | 已删除(diff -73) | ls 确认不存在 |
| install.php 0777 | 两处 mkdir 改 0755(install.php:56、70) | 已核验 |
| 品牌主色分叉 | **用户已定稿 `#0076de`(hover `#005bb5`)**,AGENTS.md 第 58 行同步更新,与 app.css:13-14 一致 | 文档与代码已对齐 |

## 回归证据

`python3 -B .dev/tests/run_all_tests.py --php /tmp/protoloft-php-review/php`:**19/19 套件 PASS,636 断言,34.78s**(新增 4 个专项:版本卡片 15 项、外链批注协同 16 项、审查修复前端注入/快照 20 项、批注集中鉴权全链路;最后一个套件沿用「输出计数 0,不作精确断言数」的既有统计口径)。基线 15/15/585 未回退。

## 仍开放项(本轮未处理)

- **F4 · P2**:RP 更换/移除失败时文件与数据库不一致(versions.php 本轮未改),按原架构审查独立排期。
- **P2-D · 水印**:iframe 直开 asset.php 无水印,待产品定位决策。
- **F7/F8 残余**:share.php 7 个状态分支重复 empty-card 模板;annotation.js 垫片仍无 Promise 互斥;formatBytes/Markdown 双实现;MCP resolve_annotation 与 Web 侧职责分叉。
- **P3 未动**:register_visitor 无限流、login CSRF/枚举、webhook 消息体 Markdown 注入、ZIP 纵深加固、getClientIp 注释不符、分享口令明文存储等(见上文 P3 清单)。用户说明部分未修项属需求如此;具体哪些按需求保留,由用户在验收时圈定后补记于此。

---

# 第二轮复审 · HEAD(4f66032)· 2026-11-07

对基线 916dc34 之后的 4 个提交(a35e819 动效系统+外链批注闭环、f788ec5 审查修复、d77c74e/4f66032 版本卡片)的全部新代码(约 2600 行)重新审查。方式:主审逐 hunk 读全量 diff(/tmp 临时快照)+ 源文件上下文核验;两个并行子代理因沙箱超时未产出,全部结论出自主审直读。

## 新发现

### P2 · 访客批注外链项目结构性不可达,分享页却渲染批注输入框(需产品拍板)

- `includes/auth.php:557-560`:`hasShareAccess` 以 `(int)$version['id']` 查 `$_SESSION['share_grants']`;传 null 时键为 0,而 `grantShareAccess`(auth.php:549-555)只按真实版本 id(≥1)写 grant;`share.php:564` 对 link 项目不写 grant(`$curVersion` 为 null)。
- 结果:`Collaboration::canAccessAnnotations($linkItem, null)` 访客分支恒 false——即使 `perm_guest_annotate=1` 且访客持有效分享,提交批注必被拒(「无权访问此项目的批注」)。而 `share.php:44` 的 `$canAnnotate` 对访客只看 `canGuestAnnotate()`,分享页仍渲染批注 composer,形成「能输入、必失败」死胡同。
- 安全面:拒绝默认,无泄露;但「外链批注协同闭环」实际仅对内部成员成立,link_annotation_regression.py 也只覆盖成员侧。二选一:分享页 link 项目对访客隐藏批注 UI,或为 link 项目实现 grant 机制。

### P3 · toggleCategory 手风琴动画快速连点残留内联样式

- `assets/js/app.js`(toggleCategory):展开中途再次点击时 `items._currentAnim.cancel()` 不触发 onfinish,内联 `display:block;overflow:hidden` 残留;收起 onfinish 清 height/overflow 但不清 display,若 `.collapsed` 依赖 display:none,内联值赢得级联,目录树可能卡在展开态;收起动画从 scrollHeight(全高)起步,半展开状态收起有视觉跳变。静态推演,未复现。建议 oncancel 同步清理或在取消分支补 inline style 复位。

### P3 · 两处 26px 非标尺寸

- `assets/css/app.css`:`.ver-asset-pill{height:26px}`、`.mcp-scope-btn{height:26px}`,不在 28/32/38/44 阶梯。前者注释自称「纯只读微徽标」,若属有意档位应在 AGENTS.md 补充定义,否则对齐 28px。

## 核验通过面(新代码)

- **F3 修复授权矩阵完整**:`canAccessAnnotations` 成员走 `canViewItem`、访客强制 `canGuestAnnotate() && hasShareAccess`(双条件,annotations.php 与 collaboration.php 同源);previous_annotations 双版本核验;`target()` 对不存在/无权统一「批注不存在或不可访问」文案。
- **外链批注后端防呆**:carry 从 link 源必拒(`version['item_id'] !== source['item_id']` 恒真);review 对 ver_id=0 经 `PrototypeContext::version(0)` 抛 DomainException(前端 decorate 对 link 置 needs_review=false,不发复核按钮);previous 对外链安全返回空列表;`add_annotation` link 分支 revision/snapshot 空值处理正确。
- **annotation.js 外链门控**:history/carry 硬拦截(`itemType==='link' || !verId`)、访客门改 `Boolean()`、ver_id=0 提交链路、同源 iframe 标题读取 try/catch 兜底。
- **事件委托全覆盖**:.btn-copy-link(app.js:1734)、.btn-copy-url/.btn-edit-item-trigger/.btn-edit-cat-trigger/.btn-delete-cat-trigger(admin.js:4184-4227)均有处理器;版本卡片 creatorName/safeVerName/timeStr 均过 esc;分页/删除/RP 按钮仅数字参数。
- **动效体系**:prefers-reduced-motion 覆盖全部新增动画元素;新增 token(--primary-subtle/border、success/danger/warning-subtle+border)替换硬编码;ver-card 样式用 background-color;旧 ver-manage-item/表格样式随之移除无残留引用。
- **新增测试质量**:review_fixes_frontend_regression.js 以恶意 URL(`');alert(document.cookie)//` 等)真实执行生产 selectItem,断言复制无损且未执行脚本;review_20261107_fixes_regression.py 对全部修复点做源码级防回归断言(0 可解析计数系其自定义输出格式,断言真实存在);link_annotation_regression.py 覆盖成员全生命周期与删除后孤儿清理;security_frontend_regression.js 仅 6 行适配,无断言删弱。
- **约束清扫**:全部 PHP lint 通过、5 个业务 JS node --check 通过、无 `INSERT ... ON CONFLICT`、变更 PHP 文件无 7.1+ 语法标记;脚本隔离不变(annotation.js 仅 canAnnotate 加载,app.js 对 updateAnnoContext 有 typeof 守卫);mcp.js 创建与自动保存两条路径均拦空选;isAdminConsoleOpen 加固为 computedStyle 回退;formatBytes 改为复用 app.js 公共定义(F8 子项收敛);批注发送按钮消费 .btn-sm(F7 子项收敛)。
- **回归**:19/19 套件 PASS、636 断言(同日早前复核结果,本轮未重跑;代码此后无变更,git 工作区干净)。

## 待办汇总(合并两轮)

| 优先级 | 项 | 状态 |
| --- | --- | --- |
| 用户拍板定稿 | 访客批注外链项目严格受角色权限控制 | **已修复**: `auth.php` 兼容 `link_` grant，`share.php` 放行外链授权，`link_annotation_regression.py` 覆盖通过 |
| 用户拍板定稿 | F4 RP 文件一致性与写锁归属复核 | **已修复**: `versions.php` 改为提交后 unlink 与 tmp 原子 rename，锁内重验版本归属 |
| 用户拍板定稿 | P2-D 水印定位 | **已定稿**: 维持当前全屏动态旋转水印威慑（姓名+IP+时间戳），不侵入改写原型 HTML 确保零业务影响 |
| P3 | toggleCategory 连点残留与跳变 | **已修复**: `app.js` 取消动画时重置内联样式，收起改用当前渲染瞬时高度 |
| P3 | .ver-asset-pill 26px 非标尺寸 | **已修复**: 对齐标准 28px（微型行内档），与操作列 1:1 等高对齐 |

