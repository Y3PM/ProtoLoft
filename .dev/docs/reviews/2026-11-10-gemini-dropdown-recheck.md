# Gemini 下拉同步修复复核 · 2026-11-10

## 结论与范围

基于 `c9b05a9` 之后当前工作区的未提交内容复核。成员改名、升降级、删除、文件夹增删改、项目增删改及保存评审群配置的常见路径已补齐；Gemini 新增的 16 项浏览器断言实跑通过，既有 Webhook 浏览器专项 24 项与前端模拟回归 103 项也通过。

仍确认 4 类问题，共 5 个边界场景。业务代码保持原样，仅新增本记录与忽略的临时验证产物；本轮没有修复、提交或部署。

## 待修复问题

### P2：停用再启用后，审批界面与实际投递名单不一致

位置：`assets/js/admin.js:1782–1800`。

复现：先保存仅向管理员 A 通知的名单，为 A 配置合成 Webhook；在团队成员中停用 A，再恢复启用，回到系统设置。A 已恢复为候选，但未勾选，摘要显示“请选择接收通知的管理员...”。此时用另一个未登录会话提交访客申请，本地截获的投递仍然是 A 的 Webhook。

`currentSelectedIds` 仅从当前可见 checkbox 构造；停用会移除 A 的 checkbox，下次重建就丢失其选择。服务端 `visitor_notify_admin_ids` 并未变化，重新启用后 A 又符合投递条件。界面表示不通知，实际仍通知；之后保存任何系统设置又会把这次丢失的选择持久化，造成额外行为变化。

需要将已确认保存的通知选择与当前候选列表分开维护，或者明确地同步持久化的接收人规则，保证两者一致。不能只从暂时不可选的 DOM 反推接收意图。

### P2：保留了版本选项，却丢失实际图表筛选

位置：`assets/js/admin.js:1915–1919`，同类逻辑在 `1940–1943`。

复现：项目具有 V1（1 条批注）、V2（2 条批注），看板选择 V1，然后在项目管理中修改 V2 名称。返回看板后，下拉仍显示 V1，但累计批注从 1 变为 3。`currentAnnoVerFilter` 从 V1 的 ID 变为 `0`。

再选择 V1、删除 V2，也复现版本框保留 V1、实际筛选变量变为 `0` 的情况。这里调用 `onAnnoProjectFilterChange()` 会清空实际版本筛选并立即绘图；随后只恢复 `vSelect.value`，没有恢复实际筛选及重绘。发布新版本也调用同一个同步函数，受相同机制影响（本轮未另做该发布场景复现）。

恢复有效版本时应同时恢复筛选变量和图表结果，使用现有版本筛选处理函数，不能只恢复 DOM 值。删除版本后 `DASHBOARD_DATA.annos` 的已删批注也仍是首屏快照；本轮删除 V2 后合成数据只剩 V1 的 1 条，但“全部版本”统计仍可含 V2 的旧记录，需在删除同步时一并核对。

### P2：删除当前筛选项目后，界面显示全部项目，实际仍筛选已删项目

位置：`assets/js/admin.js:1876–1881`。

复现：看板选择项目 B 及其 D1 版本，切到项目管理删除 B，再返回看板。项目框显示“全部项目”，但版本框仍显示 D1，`currentAnnoProjFilter` 仍为 B 的 ID，`currentAnnoVerFilter` 仍为 D1 的 ID，统计仍为 B 的 1 条旧批注。

原因是先移除 selected option，再判断 `pSelect.value` 是否等于被删 ID。浏览器移除选中 option 时已经自动改为第一项 `0`，因此清空实际筛选的分支不会进入。应在移除前记住是否选中，之后同步重置项目、版本、内部筛选和图表。

### P2：保存成功回调调用不存在的通知卡片函数

位置：`assets/js/admin.js:3282–3284`。

`updateItemNotifyCards` 在当前生产脚本中没有定义，`typeof` 守卫让该路径静默跳过。现有实际函数为 `updateUploadNotifyState(itemId, isInitial)`。

复现：在一个没有其他未保存控制中心改动的新页面内填写评审群机器人，延迟保存响应；请求仍在等待时关闭控制中心、打开发版窗口，再释放成功响应。`SYS_HAS_GLOBAL_WEBHOOK` 已更新为 `true`，但通知卡片仍显示“未配置”，checkbox 仍禁用，直到重新打开弹窗才恢复。

Gemini 的专项在配置保存后关闭控制中心，会触发 `closeModal()` 里的整页重载，因此不能证明该卡片在原页面中收到成功响应后更新。应调用实际卡片更新入口，并覆盖保存过程中切换弹窗的情况。

## 实际验证

| 验证 | 结果与证据范围 |
|---|---|
| Gemini 下拉专项 | 16 项通过；真实 Chrome/HTTP；仅在测试副本拦截机器人传输，其余业务代码未改 |
| 已有 Webhook 专项 | 24 项浏览器断言通过；另外验证协作者、审阅人、未登录访客不可修改管理员 Webhook；无真实通知发送 |
| 同批控制中心尺寸改动 | 27 项浏览器断言通过；2560×1440、1920×1080、1440×900 下宽度符合预期，6 个面板的测试样本表格无横向溢出，无脚本异常 |
| 前端模拟回归 | `preferences_frontend_regression.js` 25 项、`security_frontend_regression.js` 78 项通过 |
| 补充边界观察 | 4 类问题、5 个场景复现；主页面在成员、版本及项目操作期间没有刷新；无应用脚本异常 |
| 页面与截图 | 临时登录工作台与控制中心正常显示，没有空白页或框架错误覆盖；看板 DOM 和筛选变量数值均采集，截图在下述临时目录 |
| 语法与差异 | `node --check assets/js/admin.js`、`node --check assets/js/app.js`、`git diff --check` 通过 |

命令：

```sh
# safe_server 仅在临时站点副本截获 Webhook::send，再调用 Gemini 原专项
python3 -B .dev/tmp/gemini-dropdown-review/run.py existing

# 补充真实 UI、HTTP、通知捕获及慢响应边界
python3 -B .dev/tmp/gemini-dropdown-review/run.py

python3 -B .dev/tests/approval_webhook_sync_browser.py --php /tmp/jinshi-php-common/php --playwright-module /path/to/playwright
python3 -B .dev/tests/admin_console_scale_browser.py --php /tmp/jinshi-php-common/php --playwright-module /path/to/playwright
node .dev/tests/preferences_frontend_regression.js
node .dev/tests/security_frontend_regression.js
node --check assets/js/admin.js
node --check assets/js/app.js
git diff --check
```

Browser plugin not available，使用已有 Playwright 和安装的 Chrome，1440×900（Gemini 专项）、1440×1000（既有专项和补查）及上述三种尺寸（控制中心）。PHP 测试运行时为 8.3.20；未安装依赖，未读取或修改现有业务数据。Webhooks 使用合成地址并在 PHP 测试副本本地截获，未联系真实群。

忽略的临时产物位于 `.dev/tmp/gemini-dropdown-review/`：`run.py`、`run.js`、`results.json`、`version-filter-mismatch.png`、`deleted-project-filter.png`。`results.json` 记录问题观察，不应把退出码 0 解读为这些功能通过；投递输出 `APPROVAL_DELIVERY` 确认 UI 未选的 A 仍接收到 `user_apply`。

本轮未做全量回归、PHP 7.0 实机、真实群送达、生产部署或用户验收。跨页面实时同步不在本轮验证范围。
