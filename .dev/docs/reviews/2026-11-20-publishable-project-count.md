# 团队成员可发版项目统计 · 2026-11-20

按用户确认的推荐方案，将团队成员列从“负责项目”改为“可发版项目”，展示当前账号的实际发版范围。

## 统计口径

- 正常管理员：全部原型项目。
- 正常协作者：所有全员协作项目，加上明确指定给该成员的项目，每个项目计一次。项目创建者不在指定名单时，不因创建者身份额外计入。
- 审阅人、停用成员：0，界面显示“—”；没有可发版项目的正常成员同样显示“—”。
- 外链不计入，尚无版本的原型项目可正常发版，仍计入。

`Auth::listUsers()` 一次读取原型项目，按正常账号状态和角色筛选，再复用发版下拉同一个 `Auth::canEditItem()` 判断；没有另写一套项目授权规则。管理员和协作者读取的成员列表返回同一 `publishable_project_count`。进入成员页及角色/状态修改后的现有刷新流程会重新获取统计。

## 与交接、删除保护分离

现有 `item_count` 保持“项目/链接归属 + 原型项目指定协作关系”的去重数量，仅供工作交接使用。可发版数量独立保存在 `publishable_project_count`，团队列表只显示后者。

- 只有全员项目协作权限、没有归属或指定关系的成员，可以直接删除，不会因可发版数量大于 0 被误拦截。
- 停用或降为审阅人的成员，可发版数量为 0，但名下归属或指定关系仍需先交接；工作交接入口继续使用独立记录数量。
- 交接和删除守卫本身保持原规则，历史发版人和署名不被改写。提示文案改为需要交接的“项目或链接”，避免与发版统计混淆。

## 实际验证

| 检查 | 实际命令与结果 |
| --- | --- |
| 全量回归 | `python3 -B .dev/tests/run_all_tests.py --php /Users/yyy/.local/bin/php`：PHP 8.3.20 下 26/26 套、可识别 1,306 项断言通过，62.16 秒 |
| 权限 HTTP 专项 | `python3 -B .dev/tests/project_owners_regression.py --php /Users/yyy/.local/bin/php`：88 项通过，包含于本轮全量回归；真实临时 HTTP 安装与合成数据 |
| Chrome 专项 | `python3 -B .dev/tests/project_owners_and_publish_browser.py --php /Users/yyy/.local/bin/php --playwright-module /Users/yyy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`：63 项通过，1440×960 与 1024×768 |
| 静态检查 | 3 个生产 PHP 文件 `php -l`、`node --check assets/js/admin.js`、浏览器脚本语法检查及 `git diff --check` 通过 |

HTTP 专项用管理员及多位协作者各自的真实 `uploadItemSelect` 选项与 API 统计逐一比对，覆盖默认开放、指定权限、创建者不在名单、外链排除、空安装、停用、角色降级/恢复、管理员范围及成员只读通讯录。还覆盖“有发版权限但无交接记录可删除”和“零发版权限但有交接记录仍拦截删除并允许交接”两条相反边界。访客、审阅人不能读取管理成员列表。

浏览器实际路径：登录 → 新建开放和指定项目 → 团队成员 → 查看管理员/两位协作者/审阅人/停用成员的数量 → 协作者只读成员页核对自身发版下拉 → 停用成员零数量状态下打开交接弹窗 → 确认独立交接数量并完成交接。

Browser plugin not available，沿用现有 Playwright/系统 Chrome，无新增生产依赖。页面身份与内容正确，无错误覆盖层，error/pageerror 为 0；22 条 warning 全为既定受信同源 iframe 提示。截图已观察，表头和数值正常。未做其他浏览器或移动工作台验收。

日志在 `.dev/tmp/publishable-count-http.log`、`publishable-count-all-tests.log`、`publishable-count-browser.log`；截图在 `.dev/tmp/publishable-project-count-verify/`，均不提交。

![团队成员可发版数量](../../tmp/publishable-project-count-verify/10-team-publishable-projects.png)

## FTP 发布

沿用本轮功能的部署与 GitHub 提交授权。发布前四个远程文件均与 Git 基线 `83bf137` 一致，先保存本地旧文件与发布快照，校验临时上传后通过 rename 替换。正式文件 4/4 回读 SHA-256 一致。没有修改数据库、原型、品牌上传、凭据或服务器配置。

匿名 HTTPS 3/3 检查通过：登录入口、会话 API、管理脚本均正常，脚本 SHA-256 与本地一致。系统 curl 保持 TLS 校验，服务器响应为 PHP/7.0.33。实际生产成员列表和多角色业务未使用真实账号验收；本地通过的角色用例不能替代生产验收。详细部署地址、清单与回滚备份在私有部署记录。
