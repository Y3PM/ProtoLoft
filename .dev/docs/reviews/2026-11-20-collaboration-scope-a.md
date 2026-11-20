# 协作权限表单与列表表达 · 2026-11-20

按用户确认的方案 A 完成并部署：新建/编辑项目使用“协作权限”，先选择所有协作者或指定成员，指定模式才显示成员多选。项目列表统一显示权限范围，创建者继续自动记录。

## 最终交互

- 默认选项：`所有协作者可管理版本和分享`，成员多选隐藏。
- 指定选项：`仅指定成员可管理版本和分享`，展开“协作成员”多选。空名单保存显示就地错误并聚焦成员控件，不发请求；选择成员后移除错误。
- 切回全员模式会清空成员提交值并隐藏多选，避免旧的选择继续限制协作。
- 编辑时从现有名单回填模式；成员候选重绘保留空的指定模式及已选停用成员，不默默切回全员。
- 项目列表列名为“协作权限”，内容显示“所有协作者”或“仅张三、李四”。创建者名字不再混排在权限列；原创建者数据、历史发版署名、交接关系继续保留。外链表对应列准确称为“创建者”。
- 发版、分享、版本归属、项目删除和调整权限的角色规则沿用当前实现。模式只明确表达用户选择，数据库仍保存原有成员名单，无 Schema 迁移。

## 前后端校验

表单提交 `collaboration_scope=all|selected`。指定模式至少需要一位有效成员；全员模式清除遗留名单。接口校验指定空名单和未知模式，继续核验只有创建者/管理员可调整范围，以及成员角色和状态。基本配置编辑没有呈现权限字段时仍保留现有范围。

## 验证结果

环境：PHP 8.3.20、现有 Playwright/系统 Chrome，隔离的 127.0.0.1 临时站点。Browser plugin not available，沿用项目已有浏览器测试，不添加生产依赖。

| 检查 | 实际命令与结果 |
| --- | --- |
| 全量回归 | `python3 -B .dev/tests/run_all_tests.py --php /Users/yyy/.local/bin/php`：26/26 套通过，可识别 1,263 项断言，63.95 秒 |
| 权限 HTTP 专项 | `python3 -B .dev/tests/project_owners_regression.py --php /Users/yyy/.local/bin/php`：补充“编辑空名单保留原限制”后独立重跑，53 项通过；包含管理员、协作者、审阅人、未登录访客 |
| Chrome 专项 | `python3 -B .dev/tests/project_owners_and_publish_browser.py --php /Users/yyy/.local/bin/php --playwright-module /Users/yyy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`：46 项通过，1440×960 与 1024×768 |
| 交接专项 | `python3 -B .dev/tests/handover_verification.py --php /Users/yyy/.local/bin/php`：7/7 场景通过 |
| 静态检查 | 两个生产 PHP 文件 `php -l`、两个生产 JS 文件 `node --check`、浏览器脚本语法检查及 `git diff --check` 均通过 |

浏览器实际操作：登录 → 新建默认全员项目 → 切指定成员 → 重绘候选且保留指定空状态 → 空名单保存被拦截 → 选成员后保存 → 列表回填 → 协作者发布入口 → 创建者切换权限后的即时同步 → 外链 → 停用成员保留 → 工作交接后的编辑回填。

页面 URL、标题与工作台内容正确，页面非空，无错误覆盖层；页面脚本与 console error 为 0。20 条 console warning 全为既定受信同源 iframe 的 sandbox 提示，其他警告为 0。已观察两种模式截图，默认模式干净收起名单，指定模式显示名单；1024px 菜单仍在视口内。截图禁用过渡动画以避免中间帧影响证据。

截图：`.dev/tmp/collaboration-scope-a-verify/`；日志：`.dev/tmp/scope-a-all-tests.log`、`scope-a-http.log`、`scope-a-browser.log`、`scope-a-handover.log`。它们是本地忽略产物，不提交。

![默认全员](../../tmp/collaboration-scope-a-verify/01-admin-new-project-default.png)

![指定成员](../../tmp/collaboration-scope-a-verify/02-admin-multi-owners-dropdown.png)

## FTP 发布

用户明确要求完成后部署 FTP 并提交 GitHub。发布前 5 个远程程序文件均与 Git 基线 `3cdb6e0` 一致，先保存旧文件和发布快照，再校验临时上传并逐个 rename 替换。正式文件 5/5 回读 SHA-256 一致。没有上传开发目录、凭据或运行数据。

匿名 HTTPS 5/5 检查通过：登录页与会话 API 均 200，三项静态资源均 200 且字节哈希与发布快照一致。保留系统 TLS 证书校验，服务器响应为 PHP/7.0.33。部署地址、回滚备份路径与详细清单保存在私有部署记录，不纳入公开 Git 历史。

本地多角色测试不等同于生产账号验收。本次没有使用真实账号执行发版、删除或交接；移动工作台、其他浏览器与生产多角色操作仍待实际验收。
