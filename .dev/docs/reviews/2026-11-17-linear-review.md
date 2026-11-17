# 2026-11-17 · Linear 规范审阅

以 `c24b5a7` 对比 `3d9943d`，按项目 [AGENTS.md](../../../AGENTS.md) 的 Linear 约定审阅本轮九个生产文件。浏览器验证聚焦访客批注、独立注册与工作台注册弹窗、邮件重置、成员编辑、个人改密和安装向导。

## 本轮回归

| 优先级 | 发现 | 建议 |
| --- | --- | --- |
| P1 | 首次批注的正文在打开署名弹窗前读取，项目、版本和页面在确认时读取。在原型首页输入批注后，实测能通过 Tab 进入原型 iframe，并用 Enter 切到第二页。随后点「确定并发布」，服务端成功将首页批注保存到 `page1.html`。见 [annotation.js](../../../assets/js/annotation.js#L819)。 | 打开弹窗时捕获正文和完整发布上下文。在上下文变化时保留草稿并提示回到原页面或重新确认，避免把批注附到另一页。 |
| P2 | 署名弹窗在确认按钮之后继续 Tab 会进入分享页底层。按 Esc 可取消并保留草稿，焦点落回页面主体。该弹窗直接切换 `display`，键盘监听仅处理 Esc。见 [annotation.js](../../../assets/js/annotation.js#L151) 和 [app.js](../../../assets/js/app.js#L1271)。 | 让分享页与工作台复用弹窗的背景隔离、焦点循环和恢复。取消后回到触发发布的按钮或输入框。 |
| P2 | 管理员只改部门也会被新的姓名和邮箱规则挡住。临时站点接受「王」与 `o'connor@test.com` 两个合法成员资料。编辑时分别触发「至少 2 个字符」与「工作邮箱格式不正确」，后者的 HTML 邮箱校验为有效。见 [admin.js](../../../assets/js/admin.js#L2989) 和 [auth.php](../../../includes/auth.php#L1113)。 | 保留字段内错误提示，沿用可编辑资料的既有校验口径。用单字姓名和含撇号邮箱补充只改部门的回归覆盖。 |
| P2 | 主管理员的 11px 徽标改为 `--warning` 文字和 `--warning-subtle` 底色。Chrome 计算样式实测对比度 **3.07:1**，旧样式是 **4.51:1**，小字目标为 **4.5:1**。见 [app.css](../../../assets/css/app.css#L1107)。 | 使用现成的 `--warning-text` 保留琥珀色系，在当前底色上为 **6.84:1**。 |

## 本轮收敛仍可补齐的地方

- **安装向导的域名下拉缺少可见焦点和显式名称。** 配置两个域名后，Tab 能进入右侧下拉。Chrome 中轮廓和阴影均为空，边框颜色保持默认。相邻输入框实测 34px，提交按钮实测约 39px。现有 `.m-select-sm` 已有箭头和焦点样式，独立卡片也已有 44px 控件规范。见 [install.php](../../../install.php#L948)、[安装输入样式](../../../install.php#L539) 和 [共用组件](../../../assets/css/app.css#L2094)。
- **同一字段的服务端和本地错误反馈仍有差异。** 个人改密留空走字段内提示。提交错误的当前密码时，实测服务端返回「当前密码输入错误，请重新输入」，界面仅弹 Toast，字段错误区和 `aria-invalid` 均未更新。可将可定位到字段的服务端错误送入 `setFieldError`，继续用 Toast 提示请求失败等全局错误。见 [app.js](../../../assets/js/app.js#L1763)。
- **匿名选择会持续影响后续发布。** 点击「匿名发布」会保存「外部访客」。同一浏览器第二次发布直接沿用该署名，用户无法从此流程填写称呼。建议确认按钮的业务含义。如果表示当次匿名，仅持久化用户主动填写的称呼。旧原生弹窗的空值也会持久化相同署名。见 [annotation.js](../../../assets/js/annotation.js#L54) 和 [匿名按钮](../../../assets/js/annotation.js#L173)。
- **共用密码控件仍有重复模板。** 独立注册、邮件重置和工作台注册的密码框仍在模板内设 flex 布局与 36px 内边距，SMTP 和移交密码框已采用 `.pwd-input-wrap`。可复用该类，让查看图标和输入区留白使用同一规则。见 [index.php](../../../index.php#L138)、[login_modal.php](../../../includes/login_modal.php#L121) 和 [app.css](../../../assets/css/app.css#L299)。

## 验证

- `git diff HEAD^ HEAD --check`、受影响四个 PHP 文件的 `php -l`、四个 JS 文件的 `node --check` 均通过。
- `python3 -B .dev/tests/run_all_tests.py --php /Users/yyy/.local/bin/php` 在 PHP 8.3.20 上通过 25 套及 1,099 项可识别断言。
- `python3 -B .dev/tmp/linear-review-c24b5a7/probe.py` 使用临时 PHP 站点和 Chrome，验证访客署名的键盘动线、提交落点、匿名重用、两个既有成员资料、徽标计算对比度及注册表单。桌面 1440×1000，窄屏 320×640。320px 时署名弹窗按钮和注册密码区域位于视口内。检查到的页面脚本错误为零。
- `python3 -B .dev/tmp/linear-review-c24b5a7/browser_probe.py` 从临时导出包安装，使用模拟 SMTP 生成重置链接。共 26 项通过，覆盖评分按需加载、成功和错误状态、输入后清除提示、窄屏、安装、注册、编辑和改密。多域名下拉和错误旧密码另作诊断记录。观察了安装、成员编辑、访客署名与注册截图。脚本和证据存放在 `.dev/tmp/linear-review-c24b5a7/`。
- 既有的 [访客外链批注浏览器专项](../../tests/test_guest_link_annotation_browser.js#L23) 仍通过原生 `prompt` 提供署名。本次以独立 Chrome 探针操作新弹窗，建议随批注修复更新该专项，并加上键盘循环、Esc 焦点恢复和跨页提交断言。
- PHP 7.0、生产服务器、Safari、实际读屏以及 200% 浏览器缩放待验证。

## 修复后复核

复核 `c24b5a7` 上的工作区改动。Chrome 157 在临时站点验证，署名期间切页会拦截提交，发送请求数为零。草稿与输入焦点保留，返回原页后成功提交到 `index.html`。Tab 和 Shift+Tab 留在弹窗内，Esc 从发送按钮或键盘快捷键打开时都能回到触发位置。新访客匿名一次后仍可填名。

管理员可保存姓名为「王」且邮箱含撇号的成员部门。主管理员徽标实测 **6.84:1**。安装页域名下拉带名称和蓝色键盘焦点，尺寸为 28px，输入框和提交按钮分别为 44px 和 38px。个人改密输错当前密码会显示字段内错误、设置 `aria-invalid` 并聚焦。共用密码包装保留 36px 的图标留白。

| 优先级 | 仍需处理 |
| --- | --- |
| P2 · 回归 | 新邮箱正则接受纯数字顶级域名。在成员编辑中提交 `account@example.123`，API 返回成功，界面显示「成员信息已更新」，重新打开表单仍显示旧邮箱。后端跳过了无法通过 `FILTER_VALIDATE_EMAIL` 的值。应在后端明确拒绝已提供的无效邮箱，前端将错误定位到邮箱字段。见 [admin.js](../../../assets/js/admin.js#L2994) 和 [auth.php](../../../includes/auth.php#L1126)。 |
| P2 · 既有问题 | 安装配置两个域名，选择第二项 `@example.test` 并仅填写 `admin` 前缀。浏览器实际发送并创建的是第一项 `admin@fixture.test`。`finalEmail` 已包含选中的域名，提交前又被首项覆盖。修复应同时覆盖校验失败后切换域名并重试的路径。见 [install.php](../../../install.php#L1286)。 |
| P3 · 焦点 | 取消署名已恢复焦点，键盘确认匿名发布成功后，焦点实测落到 `BODY`。关闭后可将焦点恢复到批注输入区域。见 [annotation.js](../../../assets/js/annotation.js#L191)。 |
| P3 · 窄屏 | 320px 宽度下，安装末步的「上一步」和「立即安装」均在固定 38px 高的按钮内折成两行。可在窄屏减少按钮内边距或调整页脚排列。见 [install.php](../../../install.php#L582)。 |

之前已经缓存 `外部访客` 的浏览器仍会继续自动使用该署名，实测不会重新出现署名弹窗。是否清理该缓存值取决于旧测试浏览器是否需要延续使用。见 [annotation.js](../../../assets/js/annotation.js#L45)。

复核命令及证据

- 修改的 PHP 和 JS 文件语法检查、`git diff --check` 通过。
- `python3 -B .dev/tests/run_all_tests.py --php /Users/yyy/.local/bin/php`，25 套及 1,101 项可识别断言通过。
- `python3 -B .dev/tests/test_guest_link_annotation_browser.py --php /Users/yyy/.local/bin/php --playwright-module /Users/yyy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`，16 项通过。另用 `python3 -B .dev/tmp/linear-review-recheck/guest.py` 确认跨页未发送请求，以及提交成功时的焦点和已有匿名缓存行为。
- `python3 -B .dev/tmp/linear-review-recheck/browser_probe.py`，32 项基线与修复断言通过。脚本另记录了错误邮箱返回成功、安装实际提交的邮箱以及两种结果对应的 UI。观察了桌面和 320px 安装截图、320px 署名弹窗。
- 复核环境为本机 PHP 8.3.20 和 Chrome 157。PHP 7.0、生产环境、Safari 与读屏待验。

## 四项修复复核

以 `c24b5a7` 为基线复核最新工作区，上一轮列出的四个场景均通过。

- 编辑成员时，纯数字顶级域名在前端被拦截。输入能通过前端格式检查但被 PHP 拒绝的 `account..name@fixture.test`，服务器明确返回失败，错误贴在邮箱输入框下并恢复焦点。随后重新查询成员，确认同次提交的邮箱和部门均保留原值。
- 用临时发布包安装，先触发密码确认不一致，再切换到第二个域名。重试请求和 SQLite 管理员记录均为 `admin@example.test`。错误期间邮箱前缀和域名控件保持可用。
- 键盘确认新的匿名批注，复测了从发送按钮和 Ctrl+Enter 两条入口。提交成功后，焦点分别回到发送按钮与批注输入框。
- 320px 下安装末步的两个 38px 按钮同排，文字均为单行且位于按钮边界内。已观察错误态截图。

同次调整涉及的访客回复路径另有两处现场结果。

- **P2 · 一次 Enter 会跳过首次回复的署名确认。** 在无缓存称呼的分享访客浏览器中，填写回复后只按一次 Enter，Chrome 触发了署名表单的原生提交事件，服务端随即以「外部访客」保存该回复。回复输入框处理 Enter 时未取消默认动作，同一按键事件继续提交了已聚焦的署名表单。应在调用 `submitReply` 前取消默认动作，验证首次 Enter 只打开署名流程，直到访客选择署名或匿名才发送请求。见 [回复输入框](../../../assets/js/annotation.js#L799) 和 [署名焦点](../../../assets/js/annotation.js#L238)。
- **P3 · 回复发布后仍丢失焦点。** 点击回复后显式确认匿名，实测回复成功且焦点落到 `BODY`。列表重绘会移除原控件，现有后备目标位于重绘后已折叠的输入区域。可在对应批注卡片中聚焦可见的「回复」按钮。见 [annotation.js](../../../assets/js/annotation.js#L1023)。

PHP 和 JS 语法检查、`git diff --check` 通过。全量测试 `python3 -B .dev/tests/run_all_tests.py --php /Users/yyy/.local/bin/php` 通过 25 套、1,102 项可识别断言。访客 Chrome 专项 `test_guest_link_annotation_browser.py` 通过 17 项。独立 Chrome 探针 `python3 -B .dev/tmp/linear-review-final-recheck/browser_probe.py` 通过 39 项，`python3 -B .dev/tmp/linear-review-final-recheck/guest.py` 复验原页发布、键盘匿名批注、再次署名并记录上述回复现象。证据存于 `.dev/tmp/linear-review-final-recheck/`。验证限于临时 PHP 8.3.20 和 Chrome 157，生产环境待验。

## 访客回复键盘复核

上一轮两项回复问题均通过。本机 Chrome 实测，无缓存称呼的访客在回复框首次按 Enter 仅打开署名弹窗，监听到的回复请求和表单提交事件均为零。按 Esc 关闭时回复草稿保留，焦点回到回复输入框。确认匿名或填写称呼后，各发出一次回复请求，列表刷新后的焦点均回到对应批注卡片可见的「回复」按钮，截图中有可见焦点环。见 [Enter 处理](../../../assets/js/annotation.js#L799) 和 [焦点恢复](../../../assets/js/annotation.js#L1029)。

- `node --check assets/js/annotation.js`、`node --check .dev/tests/test_guest_link_annotation_browser.js` 及 `git diff --check` 通过。
- `python3 -B .dev/tests/test_guest_link_annotation_browser.py --php /Users/yyy/.local/bin/php --playwright-module /Users/yyy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright` 通过 20 项。
- `python3 -B .dev/tmp/linear-review-reply-recheck/guest.py` 独立通过 7 项。日志与截图位于 `.dev/tmp/linear-review-reply-recheck/`。
- `python3 -B .dev/tests/run_all_tests.py --php /Users/yyy/.local/bin/php` 通过 25 套、1,102 项可识别断言。验证范围是本机 PHP 8.3.20 和 Chrome 157。
