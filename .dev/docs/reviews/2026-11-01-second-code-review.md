# 第二轮代码审查 · 2026-11-01

对象为当前工作区源码，包括上一轮未提交的修复。版本边界仍是全新未发布版本，不要求历史兼容。本轮未修改业务代码、数据库或上传资源，只新增本审查记录。

**修复跟进：下列 7 项现已修复。** 下文保留发现时的复现证据；修复结果和验证范围见文末。

重新追踪了认证、权限、分享、发布、删除、设置保存和批注上下文。确认了 7 项上一轮未覆盖的问题，其中 3 项 P1、4 项 P2。以下实验均使用合成账号、合成原型及独立 `/tmp` 安装，没有访问生产环境或发送外部消息。

**S01 · P1 · 默认分享链接仍可通过参数读取历史版本**

位置：[share.php:338](../../../share.php:338)。

只有短码明确绑定 `ver_id > 0` 时才走锁定版本分支；默认主链和跟随默认版本的专属链接绑定 0，会进入读取访客 `vid` / `v` 参数的分支。虽然外发页面不显示版本切换器，访客仍可选择同项目任一历史版本；随后 share.php 还会为该版本签发资源访问凭据，asset.php 也会放行。

真实 HTTP 复现：建立 V1 和 V2，将 V2 设为默认；匿名浏览器先打开正常主链，再携带 V1 的 `vid` 访问。返回页面包含 V1 的 iframe，随后读取 V1 资源得到 HTTP 200 和合成旧内容。没有跨项目访问，也没有使用管理员 Cookie。

影响：发给外部的当前版本链接同时变成了历史版本入口，违背代码中“外部禁止切换版本”的安全边界。

建议：非管理人员的版本由短码配置或当前默认版本决定，不接受请求参数扩展授权范围；为默认主链和 `ver_id=0` 专属链接增加反向用例。

**S02 · P1 · 两个在途的移交请求可以产生两个 Owner**

位置：[includes/auth.php:1247](../../../includes/auth.php:1247)。

当前 Owner 身份来自请求早期的 `getCurrentUser()` 缓存。事务仅无条件清除原账号标识、设置目标标识，没有在事务中再次确认原账号仍是唯一 Owner，也不检查清除操作的影响行数。

受控进程复现：请求 B 先执行真实身份读取并缓存 Owner；请求 A 调用真实移交接口，成功移交给管理员 2；恢复 B，调用未修改的 `Auth::transferOwnership()`，再移交给管理员 3。两次均返回成功，最终用户 2 和 3 的 `is_owner` 都为 1。实验控制的是两个请求的执行顺序，身份及移交方法本身没有修改。

影响：原 Owner 已移交权限后，另一个在途请求仍可继续操作，破坏主管理员唯一性和保护边界。

建议：取得写锁后重新校验当前 Owner、接收者状态和授权条件，使用条件更新并检查影响行数，同时保证数据库中的单一 Owner 不变量。

**S03 · P1 · 清理目录抛异常时，删除已完成但接口报失败**

位置：[includes/storage.php:34](../../../includes/storage.php:34)、[includes/actions/versions.php:172](../../../includes/actions/versions.php:172)。

逻辑删除在事务中提交后才调用垃圾清理。`removeTree()` 对 unlink/rmdir 返回失败做了处理，却没有捕获 `FilesystemIterator` 构造或遍历异常；异常穿过 `collectGarbage()`，最终由 API 通用处理器返回失败。

真实 HTTP 复现：仅将隔离副本中一个版本目录设为不可读，然后调用删除版本。接口返回 `success=false` 和通用服务端错误，但版本记录已变成 0 条，清理任务仍为 1 条。目录权限在实验后恢复。

影响：用户看到失败并尝试重试时，数据实际上已被删除；同一清理方法还用于项目、文件夹删除和发布后的旧代际清理，可能让一次已成功的业务操作被报告为失败。

建议：捕获清理阶段的文件系统异常并保留重试任务；事务提交后的清理失败应返回业务成功及“清理待重试”，不能再作为业务回滚失败响应。

**S04 · P2 · 设置保存失败后，前面的字段已经生效**

位置：[includes/actions/system.php:55](../../../includes/actions/system.php:55)。

`save_settings` 一边读取和校验后续字段/图片，一边直接持久化前面的站点名称、访客准入等设置。没有全量预检或整体事务，后续校验失败不会撤回已写入内容。

真实 HTTP 复现：同时提交新的站点名称和不安全 SVG Logo。接口返回失败，但再次读取会话信息，站点名称已经变成新值。

建议：先校验全部字段和文件，验证成功后统一保存；图片先暂存再替换，失败时保留原配置和原图片。

**S05 · P2 · 新资源 URL 会把嵌套同名页面的批注混在一起**

位置：[assets/js/annotation.js:483](../../../assets/js/annotation.js:483)。

批注识别仍匹配旧的 `uploads/ux/项目/版本/` 路径。新的 `/asset.php/v版本/...` 无法匹配，只取最后一个文件名。因此 `section-a/index.html` 和 `section-b/index.html` 都被存成 `page_path=index.html`；同一版本内，这两个页面的批注会混在一起。

实际 JS 复现：执行完整 annotation.js，以模拟 iframe 依次加载上述两个新路径。两次提交的项目/版本相同，页面标题不同，但 `page_path` 都是 `index.html`。没有浏览器渲染验收；此实验验证的是实际页面上下文和提交代码。

建议：按新资源入口提取完整的版本内相对路径，并保留现有 Axure Hash 页标识处理。为嵌套同名文件增加测试。这是上一轮资源网关改动未同步到批注解析的遗漏。

**S06 · P2 · 切换项目后，iframe 加载前仍可使用旧页面上下文提交批注**

位置：[assets/js/annotation.js:105](../../../assets/js/annotation.js:105)。

`updateAnnoContext()` 清空列表、计数和输入框，却保留旧的 `pagePath`、`pageTitle`。新 iframe 尚未触发 load 时，提交函数不会检查页面上下文是否已准备好，便可将旧页面信息写入新项目/版本。

实际 JS 复现：在项目 10/版本 20 捕获 Page B 后，切到项目 11/版本 21，不触发新 iframe load，立即提交。请求中项目与版本已经是新的，页面路径和标题仍来自 Page B。后端的项目/版本归属校验无法发现这个错误。

建议：上下文切换时清空页面信息并进入未就绪状态，待新 iframe 的上下文确认后再启用提交；不能只清空输入框。

**S07 · P2 · 未勾选“记住登录”仍获得 30 天 Session Cookie**

位置：[includes/config.php:44](../../../includes/config.php:44)、[includes/auth.php:123](../../../includes/auth.php:123)。

登录时 `remember_me=0` 只阻止签发或删除 `ue_admin_auth`，没有改变统一配置的 PHP Session Cookie 生命周期。登录轮换 Session ID 时仍签发 30 天 Cookie，实际保留效果与“单次会话”选项不符。

真实 HTTP 复现：新 CookieJar 提交 `remember_me=0`，登录成功；未签发长期认证 Token，但 PHPSESSID 的 Set-Cookie 仍带 `Max-Age=2592000`。没有将 Cookie 属性检查等同于真实浏览器关闭验收。

建议：未记住时将会话 Cookie 设为浏览器会话有效，并确保后续改密等 Session ID 轮换保留用户选择。

**证据与边界**

- HTTP 与受控进程探针：`/tmp/jinshi_second_audit.py`；本轮结果保存在 `/tmp/jinshi-review2-vpae8dhu/results.json`。
- 前端上下文探针：`/tmp/jinshi_second_audit_js.js`。运行的是当前完整 annotation.js，使用模拟 iframe、DOM 和网络，不是浏览器验收。
- 运行时为独立的 PHP 8.3.20；本轮仍未实际运行 PHP 7.0、生产服务器配置或真实 Axure 大包。
- 这些实验是“缺陷已复现”，不是应用测试通过。上一轮 74 项 HTTP 与 16 项前端回归没有覆盖上述所有维度，不能据此推导没有其他问题。
- 未改业务代码、未提交、未部署。建议先处理 S01–S03，再处理其余状态与页面识别问题。

## 修复跟进 · 2026-11-01

| 问题 | 修复结果 |
| --- | --- |
| S01 | 外部访客和审阅人的分享页面只使用绑定版本或当前默认版本，忽略 `vid` / `v` 扩权参数；资源网关再次核验当前默认版本，旧默认版本的授权随默认切换失效；明确绑定历史版本的短链继续有效。 |
| S02 | Owner 移交先取得写锁，再读取当前 Owner、密码和接收管理员状态；条件更新核验影响行数。全新 Schema 使用基础 SQLite 触发器阻止第二个 Owner，不增加历史迁移。 |
| S03 | 清理捕获文件系统和队列异常，失败保留任务；已提交的删除或发布返回成功和“文件清理待重试”，后续操作继续重试。发布提示消费接口的实际消息。 |
| S04 | 设置与图片全部预检后提交。新图片使用独立文件名，数据库失败或图片移动失败时回滚配置并移除新文件；提交后只删除已无配置引用的旧图片，避免 Logo/Favicon 共用文件被误删。 |
| S05 | 按 `/asset.php/v版本/完整相对路径` 识别页面，包含子目录、编码文件名和 Axure Hash 页标识；发表接口同时返回页面路径与标题，列表在页面切换时立即过滤。 |
| S06 | 切换项目/版本清空页面上下文，禁用输入和发送；仅匹配当前版本的 iframe 加载完成后恢复。拒绝重复提交，旧提交回包不会清空新项目草稿或恢复不应启用的按钮。 |
| S07 | 默认签发浏览器会话 Cookie；勾选记住时才签发 30 天 Cookie。改密轮换 Session ID 和持久凭证恢复均保持用户选择。 |

验证结果：

- `python3 scratch/security_regression.py --php /tmp/jinshi-php-runtime/php`：原有 **74 项**真实 HTTP 回归通过。
- `python3 scratch/security_round2_regression.py --php /tmp/jinshi-php-runtime/php`：新增 **58 项**通过，覆盖多角色分享授权、设置全量回滚、图片写入失败、目录不可读、清理重试、Cookie 属性、持久凭证恢复、数据库 Owner 约束和受控在途移交。
- `node scratch/security_frontend_regression.js`：**26 项**实际 JS 回归通过。使用模拟 DOM/网络，覆盖路径识别、页面未就绪、旧 iframe 事件、双击和旧提交回包。
- PHP 8.3.20 下 **21 个 PHP 文件**语法检查通过，**6 个 JS 文件**通过 `node --check`；`git diff --check` 通过。
- Chrome / Playwright CLI，`1280×720`，仅访问临时合成安装：真实登录 → 页面 A 发表批注 → 页面 B 发表批注且不显示 A → 全部筛选显示两页 → 人为延迟新项目 iframe → 输入与发送立即禁用 → 加载完成恢复 → 新项目发表成功。8 项浏览器状态断言通过，数据库核对三条批注的项目、版本与完整路径均正确。
- 浏览器还发现发表接口未返回 `page_path` / `page_title`，导致刚发表的本地列表项在刷新前缺少页面归属；本轮已补齐，并加入 HTTP 回归。

边界：Browser 插件不可用，使用已存在的临时 Playwright CLI 和 Chrome，没有向项目添加 Node 依赖。页面身份、非空内容、错误遮罩、控制台和截图均检查；无应用运行错误。Chrome 的 `allow-scripts` + `allow-same-origin` 警告对应项目已声明的受信任原型同源模型，不能将其视为恶意代码沙箱。截图保存在 `/tmp/jinshi-round2-nested-annotations.png`、`/tmp/jinshi-round2-loading-guard.png`、`/tmp/jinshi-round2-new-project.png`。

未实际运行 PHP 7.0、生产 Apache/Nginx 配置、真实大型 Axure 原型、移动端或其他浏览器。关闭浏览器后的登录效果以 Cookie 属性和 CookieJar 丢弃会话 Cookie 模拟验证，没有执行真实 Chrome 退出/重启验收。未提交、未部署，未修改工作区真实数据库或上传数据。

## 后续版本命名调整 · 2026-11-02

按确认的自由命名方案，发布字段改为“版本名称”，示例为“如 V1.2、首次评审”。名称保留大小写、中英文、内部空格、常用符号与 emoji；前后端一致地去除首尾空格，拒绝空名称、超过 100 个 Unicode 字符及换行/控制字符。

输入已有名称后显示同名提示，提交时通过现有确认弹窗明确替换的版本和影响。取消不上传文件，保留名称、ZIP 和更新日志。确认凭据与当前会话、版本 ID 和内容代际绑定；缺少、伪造或过期确认都不能覆盖版本，发布事务仍重新核验权限和版本快照。

本轮验证：

- `python3 scratch/security_regression.py --php /tmp/jinshi-php-runtime/php`：104 项通过，其中新增 30 项覆盖自由命名、Unicode 长度与空格、无效字符、CSRF、多角色检查及替换确认。
- `python3 scratch/security_round2_regression.py --php /tmp/jinshi-php-runtime/php`：58 项通过；原有覆盖测试更新为显式申请替换确认。
- `node scratch/security_frontend_regression.js`：48 项通过，新增校验、不同名称并行检查、后台检查不禁用发布按钮、取消保留草稿、确认后上传、检查中编辑和断网恢复等用例。
- PHP 8.3.20 下 21 个 PHP 文件语法检查、6 个 JS 文件的 `node --check` 及 `git diff --check` 通过。
- Browser 插件未提供，使用既有 Playwright CLI / Chrome，在临时 localhost 合成安装、1280×720 下完成真实发布 → 同名提示 → 取消 → 确认替换 → iframe 预览，9 项状态断言通过。页面身份、非空内容、无错误遮罩、截图及控制台均检查，无应用运行错误；保留既有受信任原型同源模型的 iframe 警告。截图：`/tmp/jinshi-version-name-hint.png`、`/tmp/jinshi-version-name-confirmation.png`。

仅验证临时合成数据，未提交、未部署、未增加 AI 能力或生产 Node 依赖。PHP 7.0、生产服务器及其他浏览器仍未实测。
