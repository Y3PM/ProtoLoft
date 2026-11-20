# 团队成员发版贡献与排序 · 2026-11-20

用户确认以实际发版记录替代可发版权限范围：团队成员列使用“发版数/项目数”，例如一个成员在两个项目里发布五个不同版本，显示 `5/2`。没有发版记录显示 `0/0`；悬停显示“5 个版本 · 2 个项目”。成员同时改按角色与加入时间排序。

## 统计与排序口径

- 以当前保留的 `versions.created_by` 归属为准；版本数逐条统计，项目数对本人这些版本的 `item_id` 去重，仅计原型项目。
- 同名覆盖更新原版本记录，不增加数量；不同项目的同名版本各算一个。改名、RP 更新或默认版切换不增加数量。
- 这是当前保留版本的统计，删除版本或项目后相应减少；删完某人在一个项目的所有版本后，该项目不再计入其项目数。空项目、外链和仅有管理授权的项目均不增加统计。
- 管理员同样只统计自己的版本；管理员代为覆盖仍保留原上传者归属。项目授权变更、工作交接、账号停用或降为审阅人都不改写原上传者的版本记录与统计。
- 只显示现存团队成员，删除账号后不再有该成员行；其历史版本和署名仍留存，不转计到接管人名下。
- 顺序为主管理员（`is_owner`）→ 管理员 → 协作者 → 审阅人；同角色按 `created_at ASC`，时间相同按 `id ASC` 稳定排序。停用成员仍在其角色组内，申请与驳回账号不进入正式成员列表。

`Auth::listUsers()` 使用一条版本分组查询获取所有上传者的统计，不按每位成员逐项目计算权限。API 返回整数 `published_version_count` 与 `published_project_count`，管理员和协作者只读通讯录使用相同字段与顺序。原 `publishable_project_count` 已移除。切入团队成员页、修改成员或完成交接后，沿用现有加载流程获取新统计。

原 `item_count` 继续只供工作交接使用，保持归属与指定关系的独立判断，不能替换成发版贡献统计：有发版记录但没有归属/指定关系的成员可删除；零发版但仍有归属/指定关系的成员仍需交接。没有改变授权、交接、删除或版本署名逻辑，没有修改 Schema。

## 实际验证

| 检查 | 命令与结果 |
| --- | --- |
| 权限与统计 HTTP 专项 | `python3 -B .dev/tests/project_owners_regression.py --php /Users/yyy/.local/bin/php`：101 项通过 |
| 全量回归 | `python3 -B .dev/tests/run_all_tests.py --php /Users/yyy/.local/bin/php`：26/26 套，可识别 1,319 项断言通过，72.64 秒；包含上述专项 |
| Chrome 交互 | `python3 -B .dev/tests/project_owners_and_publish_browser.py --php /Users/yyy/.local/bin/php --playwright-module /Users/yyy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`：最终 72 项通过 |
| 静态检查 | 3 个生产 PHP 文件 `php -l`、`node --check assets/js/admin.js`、浏览器脚本语法检查及 `git diff --check` 通过 |

HTTP 临时站点覆盖未登录访客、审阅人禁止读管理列表，管理员与协作者读同一贡献统计；实际分片上传、五版两个项目、覆盖、管理员代覆盖、版本改名、RP 操作、删版/删项目、授权移出、交接、停用、降级/恢复、删除账号及独立删除保护。排序用刻意打乱的创建时间核对完整角色顺序、同角色时间顺序与同时间 ID 顺序。

浏览器路径：登录 → 新建开放/指定项目 → 团队页确认所有成员 `0/0` 与角色排序 → 协作者上传后显示 `1/1` → 停用后仍保留 `1/1` 并可交接 → 另一协作者在两个项目上传五版并覆盖一版 → 管理员和协作者成员页均显示 `5/2` → 核对悬停说明与 1024 桌面表头。全量回归后仅补充了统计表头禁止断行；最终已重跑 Chrome 全流程及 PHP/JS 静态检查。

Browser plugin not available，使用已有 Playwright 与系统 Chrome；生产没有增加依赖。本地 PHP 8.3.20，视口 1440×960、1024×768。页面身份、有效内容、无错误覆盖层、交互结果与截图均核对通过，error/pageerror 为 0；22 条 warning 均为项目已接受的受信同源 iframe 提示，无其他应用警告。截图已观察，最终统计表头无断行、数值在可视范围内。未验收移动工作台和其他浏览器。

临时日志：`.dev/tmp/publication-count-http.log`、`publication-count-all-tests.log`、`publication-count-browser.log`。截图：`.dev/tmp/publication-count-verify/11-team-publication-counts.png` 与 `12-team-publication-counts-1024.png`，不纳入 Git 或 FTP。

## 部署记录

沿用本轮部署与 GitHub 提交授权。四个远程目标与 Git 基线 `799d2d6` 一致，保存本地旧文件及最终发布快照，临时上传并校验后通过 rename 替换。正式文件 4/4 回读 SHA-256 一致，无数据库、用户原型、品牌上传或服务器配置变更。

匿名 HTTPS 3/3 检查通过：登录入口、会话 API 与管理脚本，脚本哈希与发布快照一致；TLS 校验保持开启，服务器响应 PHP/7.0.33。生产真实账号的团队业务仍需登录验收，本地角色验证不能替代生产验收。详细地址与回滚备份见私有部署记录。
