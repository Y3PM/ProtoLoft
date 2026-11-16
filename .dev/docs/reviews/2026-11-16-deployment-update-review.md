# 2026-11-16 部署兼容与界面更新审查

以上次复核通过的 `ceb4142` 为基线，审查 `760ef28` 和 `c769fe2`。开始时 `main` 与本地 `origin/main` 均指向 `c769fe2`，工作区干净。

## 审查发现

1. **P1 · 站点访问地址填错端口会锁住登录和设置回退。** `includes/actions/system.php:114–123` 允许保存同域名的任意端口，`api.php:211–243` 随即用该配置作为整个 API 的预期 Origin。Chrome 中把当前地址改成同主机的 `:1` 并移开焦点，响应确认保存成功。清空字段回退以及用新窗口登录均返回“跨站来源校验失败”。应将用于分享、通知与 MCP 的公开地址和用于验证请求的来源分开，并覆盖已有 `PROTOLOFT_BASE_URL` 指向备用域名的部署。
2. **P1 · 安装密钥在共享宿主机上可被其他系统账号读取。** `install.php:56–61` 会扩大已有密钥的权限，`install.php:77–81` 给新密钥设置 `0644`。真实 HTTP 回归验证了两条路径的文件模式。在其他账号可遍历站点目录的共享宿主机上，密钥即可被读取并用于抢先完成管理员初始化。PHP 文件中的 403 只经 Web 执行时起作用。FTP 与 PHP 属主分离时，可通过指定组或 ACL 授权 FTP 账号，或由部署端注入安装密钥。
3. **P2 · 反代剥离协议头时，复用登录凭据缺少 `Secure`。** 模拟实际浏览器发送 HTTPS Origin、后端接收 HTTP 且无协议头，`api.php:229–239` 在校验 CSRF 后允许登录，但 `includes/config.php:155–171,174–186` 与 `includes/auth.php:913–915` 仍按 HTTP 处理。真实 HTTP 响应中 `PHPSESSID` 和 `ue_admin_auth` 均缺少 `Secure`。若客户端向同域发出明文 HTTP 请求，浏览器可以附带这些凭据。另测直连后端时，由客户端填写的 `X-Forwarded-Scheme: https` 可改变 Cookie 标记。应由可信代理覆盖协议头，或由部署配置明确外部协议，并让 Origin 与 Cookie 使用一致的判定。
4. **P2 · 中等宽度窗口的更新日志右侧被裁掉。** `assets/css/app.css:3872–3895` 在 641px 以上从按钮左缘起算 480px，按全视口设置的 `max-width` 未扣掉按钮偏移。Chrome 768px 下工作台气泡的右缘为 909px，外发分享页为 877px，两处关闭按钮都无法命中。900px 下工作台右侧也有裁切。1440px 正常，640px 和 390px 下已打开的气泡左右各留 16px。后续应根据锚点与视口的实际几何关系调整定位。
5. **P2 · 较旧文件夹的新项目刷新后掉出首位。** `assets/js/admin.js:2539` 与 `assets/js/admin.js:1286–1293` 立即把新项目插在全列表以及发版下拉顶部，`index.php:382` 则在刷新后按文件夹优先排序。Chrome 复现两个顺序均从“新项目、B 文件夹旧项目、A 文件夹旧项目”变为“B 文件夹旧项目、新项目、A 文件夹旧项目”。应确定跨文件夹列表的排序规则，并让实时插入和重新渲染共用该规则。
6. **P2 · 如果公开现有 Git 历史，已移除的部署记录仍可读取。** `760ef28` 删除并忽略了两份记录；本地 `main` 仍包含此前提交，可从父提交读回原文件。审查只确认其中存在实际部署地址和环境信息。发布时应选择从干净源码创建公开历史，或在公开前单独处理现有历史。
7. **P3 · 外发口令浏览器专项在截图步骤退出。** `760ef28` 在 `.dev/tests/test_custom_share_pwd_browser.js:115` 新增了 `fs` 调用，顶部缺少导入。实际运行前 10 项业务断言通过，截图步骤报 `ReferenceError: fs is not defined`，Python 启动器最终退出 1。该专项在 23 套默认运行器之外。

## 验证记录

- 源码检查通过。执行 `git diff --check ceb4142..HEAD`，用 `php -l` 检查变更的 11 个 PHP 文件，用 `node --check` 检查生产 JS。
- `python3 -B .dev/tests/run_all_tests.py` 在 PHP 8.3.20、Node.js 22.23.5 下 23 套通过，运行器识别 977 项断言。安全专项模拟 PHP 入口已收到请求且无 `PATH_INFO` 的情况，HTML 和相对 JS 资源正常响应，路径穿越请求被拒绝。真实 HTTP 套件使用 127.0.0.1 与合成安装数据。
- Browser 插件未提供，使用现有 Playwright 与 Chrome 157。设置与排序专项命令为 `python3 -B .dev/tmp/review-c769fe2/probe.py "$(command -v php)" "$PLAYWRIGHT_MODULE"`，覆盖 HTTP Cookie 标记和 1440×900 的管理员实景。观察了登录失败及刷新前后两张排序截图，页面脚本未抛出异常。
- 更新日志专项命令为 `python3 -B .dev/tmp/review-c769fe2/changelog.py "$(command -v php)" "$PLAYWRIGHT_MODULE"`，覆盖工作台与访客分享页的 1440、900、768、640、390px 宽度，观察了工作台 900px 截图并测量边界与关闭按钮命中位置。`ARTIFACT_DIR=.dev/tmp/review-c769fe2 python3 -B .dev/tests/test_custom_share_pwd_browser.py --php "$(command -v php)" --playwright-module "$PLAYWRIGHT_MODULE"` 在截图阶段退出 1。
- 专项脚本与截图在 Git 忽略的 `.dev/tmp/review-c769fe2/`。尚未验证生产 OpenResty/FastCGI 路由、实际 FTP 用户权限、PHP 7.0、其他浏览器与用户验收。本轮产出为审查记录。

## 2026-11-16 修订复核

复核 `c769fe2` 之后工作区内的 14 个文件差异。源代码与测试脚本由本轮修订提供，复核仅更新本记录。

| 上轮发现 | 复核结果 |
| --- | --- |
| 1 · 站点地址锁死 | **P1 仍可复现。** Chrome 验证错端口已被拒绝，正确地址可保存。HTTP 入口中保留同一域名与端口，仅把公开地址改为 HTTPS 仍可自动保存，随后清空设置及无痕登录均被 Origin 校验拒绝。`includes/config.php:226` 仍通过 `app_is_https(true)` 读取公开地址的 scheme。应从 API 预期来源移除对公开地址的依赖，保留可信代理及经 CSRF 验证的兼容路径。 |
| 2 · 安装密钥权限 | 按本次改动保留 FTP 可读的 `0644`。在临时目录实际生成 `DEPLOY.md`，确认包含多租户下通过 `PROTOLOFT_INSTALL_TOKEN` 注入的说明。默认文件的本地可读范围依旧取决于父目录访问边界。 |
| 3 · 反代 Cookie | **P2 部分通过。** 模拟 HTTPS Origin、HTTP 回源且剥离协议头，首次登录响应只签发两条带 `Secure` 的 Cookie。随后用记住登录 Cookie 单独访问工作台 GET，成功恢复账号并签发无 `Secure` 的 `PHPSESSID`。访客提交正确分享口令时签发的 `ue_item_auth_*` 也缺少 `Secure`。应覆盖所有签发入口与实际代理配置。 |
| 4 · 日志气泡裁切 | **通过。** Chrome 下工作台与分享页在 1440、900、768、640、390px 宽度内的气泡均处在窗口内，关闭按钮可命中。已观察 900px 工作台截图。 |
| 5 · 新建项目实时顺序 | **P2 部分通过。** 文件夹异名时，控制中心项目表和发版项目下拉在刷新前后顺序一致。同名文件夹中，发版下拉匹配首个同名组，刷新后才回到正确的组。评审看板在异名场景仍先把新项目插到所有项目顶部，刷新后变回按文件夹优先。建议用文件夹 ID 标识组，并共用跨文件夹的排序规则。 |
| 6 · 开源历史脱敏 | 本地 `main` 仍含有已删除记录的旧提交。继续沿用现有历史公开时，该项仍待处理。 |
| 7 · 外发口令截图 | **通过。** Chrome 10 项断言通过，截图生成完成并已观察。 |

- `git diff --check c769fe2`、变更 PHP 文件 `php -l`、变更 JS 文件 `node --check` 通过。`python3 -B .dev/tests/run_all_tests.py` 在 PHP 8.3.20 与 Node.js 22.23.5 下通过 23 套、982 项可识别断言。新增的 900 KiB RP 分片断言使用模拟网络，观察到切片上限 512 KiB。另有真 HTTP 的 RP 补传、更换和下载专项 12 项通过。
- 专项复现使用临时 PHP 站点与 Playwright/Chrome 157，Browser 插件未提供。命令为 `python3 -B .dev/tmp/review-c769fe2-recheck/probe.py "$(command -v php)" "$PLAYWRIGHT_MODULE"`、同目录 `changelog.py`，以及 `ARTIFACT_DIR=.dev/tmp/review-c769fe2-recheck python3 -B .dev/tests/test_custom_share_pwd_browser.py --php "$(command -v php)" --playwright-module "$PLAYWRIGHT_MODULE"`。专项脚本与合成数据截图保存在 `.dev/tmp/review-c769fe2-recheck/`。
- 生产 OpenResty 请求体上限、真实 FTP 用户权限、PHP 7.0 与用户验收仍未验证。

## 2026-11-16 开源根提交复核

- `main` 与本地追踪的 `origin/main` 指向无父提交的 `4100c4c`，可达提交数为 1。`git ls-tree -r --name-only HEAD -- .dev/docs/deployments` 无输出，旧部署记录所在提交仅能从本地内部备份分支到达。本轮核对范围为本地 Git 引用与可达历史。
- `git diff --name-status backup/internal-history-20261116 HEAD` 无输出，新根提交的文件内容与备份顶端 `733f3af` 一致。`git diff --check c769fe2`、变更文件的 PHP 与 JS 语法检查通过。
- 在该根提交重跑 `python3 -B .dev/tmp/review-c769fe2-recheck/probe.py "$(command -v php)" "$PLAYWRIGHT_MODULE"`。PHP 8.3.20 与 Chrome 157 再次复现协议误填后无法回退或登录、反代无协议头时恢复会话及访客分享授权 Cookie 缺少 `Secure`、同名文件夹发版分组及评审看板顺序跳变。生产环境仍待验证。

## 2026-11-16 根提交 e52b389 复核

- **协议误填通过。** Chrome 在 HTTP 入口把公开地址改为同主机、同端口的 HTTPS 后，能清空配置，也能在该配置生效时用新浏览器上下文登录。错误端口仍被拦截。
- **项目分组和排序通过。** 异名文件夹的新项目在控制中心、发版下拉及评审看板的顺序与刷新后一致。同名文件夹的项目刷新前后均在正确组。已选的评审项目移入另一文件夹后，下拉与看板继续选中同一项目。
- **P2 · 访客输对分享口令后，旧的非 `Secure` 会话仍获得预览权限。** 模拟反代剥离协议头时，首次登录、记住登录恢复和新签发的 `ue_item_auth_*` 都带 `Secure`。但分享页初次 GET 发出的 `PHPSESSID` 缺少 `Secure`。后续带该会话的正确口令 POST 没有重新签发会话 Cookie，因为 `share.php:489–496` 仅在本次响应已有 `Set-Cookie: PHPSESSID` 时轮换。另一个客户端仅携带输口令前的会话 ID，即可打开保护分享页并读取原型 HTML。应在授予受保护分享权限时轮换会话并使旧 ID 失效，覆盖先 GET 口令页再提交的实际路径。
- **P3 · 提升会话安全标记时触发 PHP 警告。** `includes/config.php:305–308` 在会话活动期间调用 `session_set_cookie_params()`。PHP 8.3.20 的本机服务日志在无协议头登录与恢复环节各记录一条警告。最终显式签发的两条会话 Cookie 均有 `Secure`。
- `git diff --check 4100c4c`、相关 PHP/JS 语法检查及 `python3 -B .dev/tests/run_all_tests.py` 均通过。全量共 23 套、987 项可识别断言。HTTP 与 Chrome 专项命令为 `python3 -B .dev/tmp/review-e52b389/probe.py "$(command -v php)" "$PLAYWRIGHT_MODULE"`，使用 PHP 8.3.20 与 Chrome 157，浏览器页面无脚本错误。生产 OpenResty、FTP 用户权限、PHP 7.0 与用户验收尚未验证。

## 2026-11-16 分享会话轮换复核

- **上轮两项通过。** 模拟 HTTPS 反代剥离协议头，访客先 GET 口令页，再提交正确口令。响应轮换 `PHPSESSID`，新会话和分享授权 Cookie 均带 `Secure`。另一个客户端仅带旧会话访问时仍需输入口令，原型资源返回 403。新会话可加载原型，首次登录和记住登录恢复也正常。专项 PHP 日志无 `PHP Warning`。
- **仍有一处 P2 · 从持久分享 Cookie 恢复时，新会话缺少 `Secure`。** 同样的反代条件下，浏览器只剩带 `Secure` 的 `ue_item_auth_*` 时，`share.php:473–475` 在 GET 恢复预览授权。该响应发出的新 `PHPSESSID` 缺少 `Secure`，独立客户端仅凭这个新会话就能读取受保护原型。应覆盖持久分享凭据恢复路径，使恢复后的会话沿用签发时的安全状态。
- `git diff --check`、`php -l includes/config.php`、`php -l share.php` 和 `python3 -B .dev/tests/run_all_tests.py` 均通过。PHP 8.3.20 下全量 23 套、989 项可识别断言通过。补充复现为 `python3 -B .dev/tmp/review-share-session-rotation/probe.py "$(command -v php)"`，使用临时安装与真实 HTTP。生产反代及 PHP 7.0 尚未验证。

## 2026-11-16 持久分享凭据恢复修复

- `share.php` 将链接、当前口令和传输状态绑定到新版持久凭据的签名。输入口令和恢复持久授权在同一入口轮换会话，`app_regenerate_session()` 失败时预览返回 503。旧格式单独用于恢复时要求重新输入口令，原有会话内已建立的授权继续按现有规则校验。
- 修复前新增的反代恢复断言复现缺少 `Secure`。修复后 HTTP 回归确认恢复会话签发 `Secure`、旧匿名会话不可读取原型、普通 HTTP 能恢复、篡改传输标记无效、旧格式重新要求口令。独立复跑原复现脚本，新会话正常加载原型，旧会话返回 403，PHP 日志零警告。
- `php -l includes/config.php`、`php -l share.php`、`git diff --check` 和 `python3 -B .dev/tests/run_all_tests.py` 通过，PHP 8.3.20 下全量 23 套、994 项可识别断言。补齐口令专项缺失的 `os` 导入后，`python3 -B .dev/tests/share_password_verification.py --php /path/to/php` 的公开分享与专属分享共 9 项通过。真实生产反代与 PHP 7.0 尚未验证。
- 用户确认安装密钥是既定产品决策。沿用 FTP 安装流程，安装完成后删除一次性密钥。
