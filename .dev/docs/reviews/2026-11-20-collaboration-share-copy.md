# 协作权限文案随外发授权更新 · 2026-11-20

修复协作权限选择器和列表提示将“版本和分享”固定写死的问题。文案读取协作者角色的 `perm_editor_share`，与实际外发授权一致，不以当前登录管理员的分享特权代替协作者配置。

## 最终表现

| 协作者外发授权 | 全员模式 | 指定成员模式 |
| --- | --- | --- |
| 开启 | 所有协作者可管理版本和分享 | 仅指定成员可管理版本和分享 |
| 关闭 | 所有协作者可管理版本 | 仅指定成员可管理版本 |

首次渲染和项目列表 title 使用同一角色配置。管理员在当前页面保存角色权限后，两项文案和列表提示即时更新，不改变选中的模式或成员草稿。保存等待期间保留已确认文案，失败时不采用未保存草稿；连续切换和重试均使用已被服务端确认的快照。其他已打开页面需刷新以读取新的角色配置。

实际分享接口、管理员特权与项目范围规则未改变：角色授权和项目操作范围继续共同校验。没有更改数据库 Schema、成员或生产角色配置。

## 实测

- `python3 -B .dev/tests/run_all_tests.py --php /Users/yyy/.local/bin/php`：PHP 8.3.20 下 26/26 套通过，可识别断言 1,277 项，63.33 秒。其中权限 HTTP 专项 59 项，保存队列/前端专项 32 项。
- `python3 -B .dev/tests/project_owners_and_publish_browser.py --php /Users/yyy/.local/bin/php --playwright-module /Users/yyy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`：Chrome 54 项通过，1440×960 与 1024×768，Browser plugin not available，沿用现有 Playwright。
- 浏览器从权限表取消协作者分享授权，冻结实际保存请求后打开项目并修改成员草稿，再放行请求：文案改为仅版本，模式和成员草稿保持；刷新仍读取禁用授权，重新授权后文案和列表提示恢复分享。
- HTTP 分别验证管理员/协作者的初次 HTML、分享接口对未授权协作者的拒绝、管理员特权和重新授权后的恢复。
- 保存队列执行真实业务 JS，覆盖等待、快速反转、失败及重试。PHP/JS 语法检查和 `git diff --check` 通过。
- 页面身份和内容正常，无错误覆盖层；浏览器 error/pageerror 为 0，22 条 warning 均为项目既定受信同源 iframe 提示，无其他警告。截图已观察，未见本次控件裁切。

日志：`.dev/tmp/share-copy-all-tests.log`、`share-copy-preferences.log`、`share-copy-browser.log`。截图：`.dev/tmp/collaboration-share-copy-verify/09-sharing-disabled-copy.png`。这些是本地忽略产物。

![协作者未获外发授权时仅显示管理版本](../../tmp/collaboration-share-copy-verify/09-sharing-disabled-copy.png)

## 发布与边界

沿用本次功能的 FTP 发布和 GitHub 提交授权，发布前核对两个目标文件与 Git 基线 `ad72bc7` 一致并保存旧文件。正式文件 2/2 回读 SHA-256 一致，匿名 HTTPS 入口、会话 API、管理脚本 3/3 检查通过，管理脚本字节与本地发布副本一致；使用系统 curl 保持 TLS 校验。回滚备份和详细清单保存在不公开的本地部署记录。

没有使用生产账号修改分享权限；实际线上多角色功能验收仍需真实账号执行。其他浏览器、移动工作台未新增验收。
