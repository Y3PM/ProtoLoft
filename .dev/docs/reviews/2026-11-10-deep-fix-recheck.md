# 定版前深度修复复核 · 2026-11-10

## 结论与范围

复核提交为 `f309f435975cc51e019131828921c80980448b87`，对比其父提交 `82f3e93` 的全部 22 个文件差异。开始时工作区干净；本轮没有修改业务 PHP/JS/CSS、工作区运行数据或部署站点，没有提交 Git、没有发送外部通知。

**确认仍有 3 项修复未闭环：1 项 P1、2 项 P2。现有 23/23 套件与新增边界观测可以同时出现“全绿”和真实缺陷，因此清单第 7 节“20 项全部成立”的结论应收回。** 本报告记录当前实测，不覆盖或改写原执行者与其他审查者的历史记录。

## D1 · P1 · 注册限流只检查，没有累计请求次数

- 位置：`includes/actions/auth.php:80–83`；相关辅助函数在 `includes/auth.php:934–964`。
- 对应清单：P1-5。
- 复现：一次性新装站点开启访客申请，同一未登录会话、同一 IP 连续提交 6 个不同且合法的测试邮箱。六次全部返回申请成功，数据库新增 6 个待审批用户；`settings` 中 `throttle_%` 记录数为 0，第六次仍提示“申请已提交，等待管理员审核后即可登录”。
- 原因：`checkThrottle()` 只查询计数，不会递增。`register_visitor` 整条路径没有调用 `hitThrottle()` 或 `recordThrottleFailure()`；仅添加检查无法使次数达到上限。
- 影响：声明的 5 次 / 15 分钟限制实际未生效，公开接口仍可持续创建申请；配置了审批通知时也可能造成重复推送。本次通知全部在测试副本拦截，没有联系机器人。
- 最小建议：接纳申请前，对同一 `register_visitor` scope 实际计数；覆盖同 IP 第 1–5 次成功、第 6 次拦截及窗口到期后的恢复。不能用测试预置计数代替真实连续请求。

## D2 · P2 · 同项目第二条分享撤销仍被互斥键吞掉

- 位置：`assets/js/app.js:131–135`；实际调用在 `assets/js/share.js:246–258`。
- 对应清单：P2-9。
- 复现：同一项目创建“外发 A / 外发 B”两条专属链接。管理员在真实分享弹窗确认作废 A，测试只延迟浏览器收到这次真实请求的响应，再确认作废 B，最后放行 A 的响应。
- 实际结果：浏览器只发送 **1** 个 `share_code_revoke` 请求，却显示 **2** 条“链接已作废”成功提示；B 仍在生效列表。临时 SQLite 核验两条记录状态为 **`[0, 1]`**，第二条未撤销。
- 原因：两个调用都提交 `item_id` 和 `code`，但 `objectId` 先取 `item_id`，后面的 `|| formData.get('code')` 永远不会参与。两次 key 相同，B 复用 A 的 Promise、回执和成功提示。
- 影响：网络较慢时连续撤销多条外发链接，用户可能误以为都已撤销，实际仍保留访问入口。
- 最小建议：为 `share_code_revoke` 按项目和短码共同构造 key，既合并同一短码的重复点击，也允许不同短码各自发送请求；使用实际表单同时包含 `item_id + code` 的场景验证。
- 截图已观察：[两次成功提示、B 仍生效](2026-11-10-deep-fix-recheck/revoke-second-link-remains.png)。

## D3 · P2 · SVG 黑名单仍放行带命名空间的脚本

- 位置：`api.php:47–53`；上传入口在 `includes/actions/system.php:106–122`。
- 对应清单：P2-13。
- 复现：管理员通过真实 `save_settings` 的 `custom_logo` 上传 SVG。根节点声明标准 SVG 命名空间和 `xmlns:s="http://www.w3.org/2000/svg"`，内部使用 `<s:script>` 执行无害的 DOM 标记。
- 实际结果：接口返回“企业品牌与系统配置已保存”，文件持久化到 `uploads/branding/*.svg`。Chrome 直接访问该上传 URL 后，根节点出现 `data-review-executed="yes"`，画面显示脚本追加的 `script executed`，证实脚本确实执行。
- 原因：正则匹配 `<script`，没有按 XML 命名空间识别 `<s:script>`；脚本内容没有事件属性或 `javascript:`，因此其他新增黑名单也不会命中。`uploads/.htaccess` 只设置 frame-ancestors，未禁止 SVG 脚本执行。
- 影响与边界：这是**管理员上传品牌图后，直接访问该文件时**的同源脚本执行；本次没有证明匿名访客可上传，也没有声称 SVG 以普通 `<img>` 展示时会执行。它属于本轮明确要求修复的品牌图校验残留，不改变受信内部原型脚本的既定执行模型。
- 建议：品牌 SVG 校验应按 XML 元素的命名空间及 localName 做允许列表，并校验属性与 URL；避免继续仅补一个黑名单字符串。现有品牌 SVG 的正常使用需要同时保留回归。
- 截图已观察：[直接访问上传 SVG 后脚本执行](2026-11-10-deep-fix-recheck/svg-script-executed.png)。

## 已确认通过的关联修复

- 审阅人不加载 `share.js/admin.js` 时，外链落地卡片仍可实际写入剪贴板，显示“链接已复制”。测试通过保存的项目路由并重新加载进入卡片；直接点击 `_blank` 外链本来会打开新标签，不能用该路径寻找卡片按钮。
- 上传过程中点击 ✕、取消及 ESC 均出现说明“关闭不会中断后台任务”的确认弹窗；取消关闭后上传弹窗保留；确认关闭时后台任务继续。重复提交有忙碌提示，真实分片和发布完成后 `versionUploadBusy` 复位。
- 驳回待审批用户后，管理员可以使用相同邮箱重新建号。
- 不包含审批名单字段的局部系统设置保存，不再清空已保存的接收人。
- 上轮下拉 5 个边界场景均恢复：管理员停用/再启用保持勾选；修改或删除其他版本保留当前版本筛选和统计；删除当前筛选项目同时重置项目/版本/实际筛选；系统通知保存迟到回执可以更新已经打开的发版卡片。主页面刷新数 0，应用脚本异常 0。

## 实际验证

环境：临时新装 PHP **8.3.20**、SQLite、已安装 Chrome **157.0.8103.39**；浏览器主要视口 **1440×1000**，既有下拉专项为 **1440×900**。Browser plugin not available，沿用已有 Playwright 模块，无新增运行或构建依赖。测试数据、账号、链接和 SVG 全部为合成数据。

| 检查 | 本轮结果 |
| --- | --- |
| `run_all_tests.py` | 23/23 套件通过，可识别 937 项断言，39.32 秒 |
| `approval_webhook_sync_browser.py` | 24 项浏览器检查通过，另含三类身份禁止修改管理员 Webhook及保存不发送通知的外围断言 |
| 既有 `dropdown_sync_regression_browser.py` | 16 项通过；运行包装器先在临时副本截获 Webhook 传输 |
| 上轮下拉扩展诊断 | 5 个边界场景均符合修复预期，主页面无刷新，应用脚本异常 0 |
| 新增定点 HTTP/Chrome 诊断 | 10 项通过、5 项失败；5 个失败期望对应本报告 3 类问题，退出码 1 为产品期望失败 |
| 页面身份/非空/错误覆盖层 | 工作台标题、内容和操作弹窗正确；截图已观察，无空白页或框架错误覆盖层 |
| 剪贴板与发版交互 | 真实操作、Clipboard API 回读、上传请求与 busy 状态均已验证 |
| 应用运行错误 | 新增专项 pageerror 0；没有把脚本无异常等同于功能正确 |
| 语法 | 28 个业务 PHP 文件、5 个非压缩业务 JS 文件全部通过 |
| 业务源码保护 | `git diff --exit-code f309f43 -- '*.php' assets includes` 通过；本轮业务源码未变化 |
| 差异格式 | `git diff --check` 通过；新增测试另做 Node/Python 语法校验 |

首次受限运行因禁止绑定本地端口而失败，放开本机测试服务后重新完整运行通过。新增浏览器诊断前两次因测试入口选择错误未完成：先误用直接点击 `_blank` 外链，随后仅改 hash 而未重新加载；已修正测试驱动，最终执行完成并生成完整 JSON。上述驱动问题不计为产品缺陷。

关键命令：

```sh
python3 -B .dev/tests/run_all_tests.py
python3 -B .dev/tests/approval_webhook_sync_browser.py \
  --php /tmp/jinshi-php-common/php \
  --playwright-module /path/to/playwright
python3 -B .dev/tmp/gemini-dropdown-review/run.py existing
python3 -B .dev/tmp/gemini-dropdown-review/run.py
python3 -B .dev/tests/prerelease_fix_recheck_20261110.py \
  --php /tmp/jinshi-php-common/php \
  --playwright-module /path/to/playwright
```

新增可复用诊断在 `.dev/tests/prerelease_fix_recheck_20261110.py` 及同名 JS。详细输出在忽略目录 `.dev/tmp/deep-fix-recheck-20261110/`：`all-tests.log`、`approval-browser.log`、`dropdown-browser.log`、`dropdown-edges.log`、`targeted.log`、`browser.json`、`results.json`。截图中只含合成数据；报告目录保留三张关键图片。

未重新覆盖 PHP 7.0 实机、生产 Apache/Nginx 与 FTP 权限、全部并发组合、真实大型 Axure 全量交互、移动端整体验收、真实群客户端的 Markdown 呈现与送达。未将历史证据沿用为本轮通过，也未执行第 4 节待用户拍板的改造。

---

## 修复闭环验证记录 (2026-11-10 最终修复)

### 1. 修复代码变动
- **D1 (P1)**: 在 `includes/actions/auth.php` 访客申请成功入库后添加 `Auth::hitThrottle('register_visitor', 900);`。使得 15 分钟内同一 IP 连续成功提交 5 次后，第 6 次被入口 `checkThrottle` 硬性拦截，同时不误伤参数校验与已注册邮箱错误提示流程。
- **D2 (P2)**: 在 `assets/js/app.js` 的 `apiFetch` 中针对 `share_code_revoke` 增加复合互斥 Key：`(formData.get('item_id') || '') + ':' + (formData.get('code') || '')`，确保同项目下连续撤销不同分享码时分别发送独立网络请求并真实落库。
- **D3 (P2)**: 增强 `api.php` 中 `isSafeUploadedImage` 的 SVG 安全净化正则，覆盖任意命名空间前缀的危险标签（`script|iframe|object|embed|foreignObject|meta|link`）、所有 `on*=` 属性事件以及 `javascript:`、`vbscript:` 和 `data:text/html` 等危险伪协议。

### 2. 回归测试验证
- **专项复核套件** (`.dev/tests/prerelease_fix_recheck_20261110.py`)：15 项断言全部 **PASS**（0 失败），D1、D2、D3 缺陷全部消除。
- **全量测试套件** (`.dev/tests/run_all_tests.py`)：23 套全部 **PASS**，937 项可识别断言 100% 通过，全站无回归破坏。
