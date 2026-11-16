# 小细节调整复查 · 2026-11-10

审查基线为 `c9b05a9` 后的 5 个未提交文件：`AGENTS.md`、`assets/css/app.css`、`assets/js/admin.js`、`includes/modals.php`、`.dev/tests/version_modal_browser.js`。初次审查阶段只记录与验证，未修改这些文件。用户随后授权修复，当前结果见下方，尚未提交或部署。

## 已按用户确认修复

- “新成员审批通知人”旁的简短提示改为“选填。留空不通知”。删除“群机器人私信 / 留空默认通知全部管理员”的新增说明，保留已实现的空数组不通知规则。
- 新页面完整重载后发现，仅删除说明仍不足以保证底部菜单可见：滚动区域的内容高度随之变短，原有菜单依然可能超出容器。因此 `toggleAdminDropdown` 以触发按钮为锚点，并在下方空间不足且上方可容纳时向上展开，同时检查滚动容器与视口边界。
- 局部修改 `includes/modals.php`、`assets/js/admin.js`，在 `.dev/tests/preferences_frontend_regression.js` 补充 5 个菜单行为断言。保留本轮原有的版本弹窗加宽、标签改名、邮箱域名区域调整及其他未提交修改。
- `node .dev/tests/preferences_frontend_regression.js`：25 项通过，覆盖自动保存及菜单上下展开、重复打开、关闭状态与视口边界。
- `python3 -B .dev/tmp/small-detail-fix/check_settings.py`：16 项通过，其中 Chrome 11 项、数据库/真实 HTTP 5 项。确认新提示、无误导文案、菜单约 4px 间距、选项不裁切、清空自动保存与重载、数据库为空数组、空选时申请成功且不发送通知、重新选择后恢复投递到该管理员配置的机器人。测试副本内截获全部发送，不联系真实机器人。
- 已观察 1440×1000 的修复后截图；位置在 `.dev/tmp/small-detail-fix/settings-dropdown-fixed.png`、`settings-empty-fixed.png`。截图与交互使用合成数据。`node --check assets/js/admin.js`、`php -l includes/modals.php`、`git diff --check` 通过。
- 本次没有重跑未受影响的版本/RP 浏览器全流程，之前的 31 项证据属于初次审查阶段；未执行全量回归、生产部署或真实群送达验收。

## 初次审查发现（已修复）

### P2：审批通知说明与真实行为不符

位置：`includes/modals.php:1796`，新增“系统通过群机器人私信通知所选管理员；留空默认通知全部管理员”。

- 点击“清空”并保存后，实际不发送审批通知。`includes/actions/auth.php:148–157` 只在从未保存配置（值为 `null`）时默认选择所有正常管理员；已保存空数组明确关闭通知。浏览器实测清空、自动保存、重载后仍为空，真实 HTTP 专项也确认新申请不会触发机器人发送。
- 通知发送到所选管理员各自配置的群机器人 Webhook，并没有私聊接口，也没有 @ 成员逻辑。注册通知正文包含申请人姓名、邮箱及部门，因此“私信”会误导管理员对接收范围的判断。

建议删除这条新增说明；若保留，使用“通知发送至所选管理员配置的机器人；不选则不通知”。保留当前空数组不通知的后端规则。

### P2：新增说明改变下拉菜单锚点，导致底部选项被裁切

位置同为 `includes/modals.php:1796`。下拉菜单位于同一个相对定位的表单组中，使用 `top: calc(100% + 4px)`。说明加入触发按钮之后，使该表单组变高，菜单因而定位到说明底部，而非按钮底部。

1440×1000、系统设置滚动到审批通知项、展开只有一个管理员的列表时，实测：

| 状态 | 按钮至菜单间距 | 菜单底边 | 最后选项底边 | 容器裁切底边 | 选项被裁切 |
|---|---:|---:|---:|---:|---:|
| 当前代码 | 25.09px | 910.09px | 898.09px | 889px | 9.09px |
| 仅在浏览器中隐藏新增说明 | 4px | 889px | 877px | 889px | 0px |

删除该说明即可同时恢复原锚点；若需要保留说明，应把按钮和菜单放到独立的定位容器中，说明置于该容器外。

## 验证结果

- 版本弹窗加宽后的桌面宽度为 777.59px，符合 `clamp(740px, 54vw, 820px)`；1440×1000 与 390×844 下未发现横向溢出。
- Chrome 共 31 项通过：卡片渲染、搜索分页、默认版本保护与切换、删除、RP 补传/更换/移除、空项目发版入口、非项目负责协作者只读权限，以及审批名单下拉、清空自动保存、重载持久化。没有应用脚本错误；另有既有 iframe sandbox 属性组合的浏览器警告，本轮没有改动这部分。
- 模拟 DOM/网络回归共 72 项通过：版本卡片 15、自动保存队列 20、共享交互及文案契约 37。
- 通知分流真实 HTTP 专项通过，包含明确清空审批接收人后不发送通知的场景。该脚本输出 19 条 PASS，末尾汇总仍硬编码为 11，故此处仅报告套件通过，不以该数字作为断言数。
- `node --check assets/js/admin.js`、`php -l includes/modals.php` 与 `git diff --check` 通过。PHP 运行时为 8.3.20。

命令：

```sh
node .dev/tests/version_modal_frontend_regression.js
node .dev/tests/preferences_frontend_regression.js
node .dev/tests/copy_consistency_frontend.js
python3 -B .dev/tests/webhook_split_notify_regression.py --php /tmp/jinshi-php-common/php
python3 -B .dev/tmp/small-detail-recheck/run_browser.py --php /tmp/jinshi-php-common/php --playwright-module /path/to/playwright
python3 -B .dev/tmp/small-detail-recheck/check_dropdown.py
```

Browser plugin not available，沿用已有 Playwright 与已安装 Chrome。浏览器临时包装脚本只扩展验证、重定向截图到 `.dev/tmp/`，未改动用户正在编辑的浏览器套件。第一次扩展验证因测试仅匹配 URL 编码而未识别 multipart 保存请求而超时，修正临时测试后 31 项完整通过；这不是应用失败。

测试使用可清理临时安装及合成数据，不触碰工作区运行数据，不发送真实群消息。截图与局部对照脚本位于忽略的 `.dev/tmp/small-detail-recheck/`。未执行全量回归、生产部署、真实群通知送达或用户验收。
