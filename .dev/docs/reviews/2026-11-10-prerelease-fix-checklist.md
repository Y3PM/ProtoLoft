# 定版前修复清单 · 2026-11-10

> 来源：ZCode 定版前全面审查（5 域深审 + 逐条独立核实，关键项实跑验证）。所有位置与行为均已核实成立。
> 执行者：Gemini。**只修本清单所列项，禁止扩大范围、禁止顺手重构。**

## 0. 硬约束（每次改动前重读）

- PHP 7.0.0+ 兼容：禁止 `?类型`、`: void`、多 catch、箭头函数等 7.1+ 语法；SQLite 禁止 `INSERT ... ON CONFLICT DO UPDATE`（用 `INSERT OR REPLACE`）。
- 零构建：不引入任何 Node/npm 依赖；JS 原生 + jQuery。
- 前端铁律：色值只用 CSS 变量；组件消费 `app.css` 预设类；尺寸阶梯 28/32/38/44px。
- 同一文件改动串行；改完必须跑「第 5 节验证命令」；结果写入 `.dev/CHANGELOG.md` 或本文档末尾。
- **待拍板事项（第 4 节）不得擅自修复。**

---

## 1. P1（定版前必修，按序执行）

### P1-1 测试套件红灯：review_fixes_frontend 沙箱缺新函数 stub

- **位置**：`.dev/tests/review_fixes_frontend_regression.js`（沙箱定义约 :196-215，`deleteVerSrc` 执行在 :224）
- **现象**：`node .dev/tests/review_fixes_frontend_regression.js` 确定性失败：`ReferenceError: syncDashboardRemoveVersion is not defined`。原因：本轮 `admin.js` 的 `handleDeleteVersion` 新增了调用 `syncDashboardRemoveVersion(itemId, verId)`，测试用 vm 抽取片段执行，沙箱没有该函数。
- **修复**：在测试沙箱补 stub（`syncDashboardRemoveVersion`、`syncUploadModalRemoveItem` 等本轮新增的同步函数，逐一 grep `handleDeleteVersion`/`handleSetDefaultVersion` 片段内引用确认齐）。产品代码无需改动。
- **验收**：该测试全绿；`python3 -B .dev/tests/run_all_tests.py` 23/23 PASS。

### P1-2 viewer 点外链「复制链接」ReferenceError

- **位置**：定义 `assets/js/share.js:291`（唯一定义）；调用 `assets/js/app.js:1806-1813`（`.btn-copy-link` 全局委托，无 typeof 守卫）；按钮渲染 `app.js:572`（外链落地卡片，全角色可见）。
- **根因**：share.js 仅 `Auth::canShare()` 时加载（index.php:905-908），viewer 默认 `perm_viewer_share='0'` 不加载 → 点击必报 ReferenceError。违反 AGENTS.md「全员函数必须沉淀在 app.js」。
- **修复**：把 `copyTextToClipboard` 搬入 `app.js`（放公共函数区），**删除 share.js:291 的原定义**（避免双定义覆盖漂移）。
- **验收**：grep 全库仅一处定义；viewer 登录 → 点外链项目 → 落地卡片 → 复制成功且 toast「链接已复制」；`node .dev/tests/security_frontend_regression.js` 通过。

### P1-3 发版上传中关窗：假取消 + 重开后「发布」静默死锁

- **位置**：`assets/js/admin.js`：`versionUploadBusy`（:281 声明，:954 静默拦截，:1124/:1145 上传链 then 内复位）；`openUploadModal`（:391-420，不重置该标志）；关闭入口 `includes/modals.php:14`（✕）、`:160`（取消）、ESC（app.js `modalKeyboardBoundary` :1304-1318）。
- **现象**：上传中点 ✕/取消/ESC → 弹窗关但后台上传继续，成功后 300ms 强制整页 reload（假取消）；重开弹窗再点「发布」→ :954 静默 return，按钮无响应。`closeModal` 与全库均无 `.abort()`，关窗不中止请求。
- **修复（最小方案）**：
  1. `handleVersionUpload` 的 busy 拦截改为有反馈：`showToast('发布任务进行中，请稍候', 'error')`；
  2. ✕/取消/ESC 关闭 `uploadModal` 时若 `versionUploadBusy === true`：弹 `showConfirm`（文案如实告知「上传不会中断，完成后将自动发布并刷新页面」），确认后放行关闭。不改遮罩关闭语义（本就禁止）。
- **验收**：上传中关窗出现确认弹窗；busy 期间重复点「发布」有 toast；现有测试全绿。

### P1-4 被驳回申请成僵尸账号，邮箱永久烧毁

- **位置**：`includes/actions/users.php:105`（`UPDATE users SET status = 2`）；`pending_user_list` 只查 `status = 0`（:82）；`listUsers` 过滤 `status NOT IN (0, 2)`（auth.php:977）；重复申请被拒（actions/auth.php:136-138）；建号查重被拒（auth.php:1021-1025）。全库 status=2 零读取、零清理。
- **修复（默认采用 A，若用户改选 B 见第 4 节）**：
  - **A（推荐）**：驳回改物理删除该行。申请未产生任何关联资产（无项目/批注/分享），`DELETE FROM users WHERE id = ? AND status = 0 AND is_owner = 0`，无孤儿风险。保留现「已驳回」toast 文案。
  - B（备选）：待审列表增加「已驳回」分区支持删除/复活——需产品拍板后才做。
- **验收**：驳回后同邮箱可重新申请；管理员可手动创建同邮箱账号；`comprehensive_e2e_regression.py` 全链路（含访客申请）通过。

### P1-5 register_visitor 完全无频控

- **位置**：`includes/actions/auth.php:80` 起（case 整块无 checkThrottle）；推送块空 catch（:177 附近）。对照：login 限速 10 次/900 秒（auth.php:134）、访客批注 15 次/60 秒（annotations.php:193）。
- **修复**：
  1. 该 case 入口处加 `if (!Auth::checkThrottle('register_visitor', 5, 900)) jsonResponse(false, null, '申请过于频繁，请稍后再试');`（checkThrottle 内部已按 scope+IP 组键）；
  2. 管理员通知推送的空 catch 改为 `catch (Exception $e) { error_log('register_visitor webhook: ' . $e->getMessage()); }`（不影响主流程返回）。
- **验收**：同一 IP 第 6 次申请被限速文案拦截；正常首次申请不受影响；`visitor_flow` 相关测试通过。

### P1-6 PHP 7.0-7.2 部署：持久 Cookie 丢安全属性 + 会话固定链

- **位置**：`includes/auth.php:427`（`ue_admin_auth` 回退 `setcookie($val, $expire, '/')` 丢 httponly/secure）；`share.php:489-490`（口令 Cookie 同样回退）；`includes/config.php`（全项目无 `session.use_strict_mode`）；`includes/auth.php:347`（Cookie 恢复命中直接写 `$_SESSION['user_id']`，无 `session_regenerate_id`）。对照：config.php 的 session 回退 `session_set_cookie_params(0, '/', '', $isHttps, true)` 保留了 httponly——三处标准不一致。
- **修复**：
  1. auth.php:427 回退分支改 `setcookie('ue_admin_auth', $val, $expire, '/', '', self::isHttps(), true);`（7.0 签名，恢复 httponly+secure）；share.php 回退分支同改；
  2. config.php 在 `session_start()` 前加 `ini_set('session.use_strict_mode', '1');`（仅在尚未 start 时）；
  3. auth.php Cookie 恢复命中分支（`$matched` 内）加 `session_regenerate_id(true);`。
- **验收**：PHP 8.3 下全量回归通过（行为不变）；改动仅为向后兼容的低版本分支补齐，静态确认无 7.1+ 语法。

---

## 2. P2（应修）

### P2-7 save_settings 无条件覆写审批通知名单

- **位置**：`includes/actions/system.php:87`：`$updates['visitor_notify_admin_ids'] = json_encode(... ($_POST['visitor_notify_admin_ids'] ?? []))` —— 同函数其他键均有 `isset` 守卫，唯此键任何不含该字段的请求都会清空通知名单。
- **修复（前后端必须配套，缺一会破坏「清空」语义）**：
  1. 后端改 `if (isset($_POST['visitor_notify_admin_ids']))` 守卫；
  2. 前端 `executeAutoSaveSettings`（admin.js:3300 附近）序列化时：若勾选数为 0，显式 `fd.append('visitor_notify_admin_ids[]', '')`（PHP 端 `array_filter+intval` 归一为 `[]`，表达"明确清空"）。
- **验收**：模拟不含该字段的 save_settings 请求（如 curl 直调）不清空既有名单；前端清空全部勾选后保存 → 名单确为空；`preferences_frontend_regression.js` 与审批同步浏览器专项通过。

### P2-8 Webhook 群消息 Markdown 注入

- **位置**：`includes/webhook.php:129-181` `buildPayload`：`$content/$author/$page/$item/$version` 原样拼进企微/钉钉/飞书 markdown。触发链：访客批注内容 `[点此领取](https://evil)`（annotations.php:241 原文传入）。
- **修复**：buildPayload 入口对上述变量做 markdown 保留字符转义（至少 `\ [ ] ( ) < > \` 反引号、换行 strip），新增私有静态助手 `mdEscape` 统一调用。
- **验收**：notification_copy 套件通过；手工构造含 `[x](http://evil)` 的批注，投递 payload 中不出现可渲染链接（grep 断言或临时单测）。

### P2-9 apiFetch 互斥 key 不足，并发第二笔被静默丢弃

- **位置**：`assets/js/app.js:131-136`：key = `action + ':' + (id||item_id||annotation_id)`。受害调用方：`item_sort`/`category_sort`（fd 只有 `ids`，admin.js:1676/1531）、`share_code_revoke`（fd 有 `code` 但 key 不含，share.js:249-252）。第二笔返回第一笔 Promise → 照样弹「已更新」，载荷从未发出；关控制中心 reload 后数据丢失坐实。
- **修复**：key 取值链补两个字段：`|| formData.get('ids') || formData.get('code')`（保持 upload_chunk/version_check_name 专项分支不变）。
- **验收**：`security_frontend_regression.js`（含互斥断言）通过；模拟两条不同 ids 的 item_sort 并发，第二条在第一条完成后真实发出（可临时日志断言）。

### P2-10 本轮新引入：调用不存在的 `onUploadItemChange`

- **位置**：`assets/js/admin.js:1826-1828`（`syncUploadModalRemoveItem` 内）。全库仅此引用、零定义；真实函数为 `onUploadItemSelectChange(val)`（admin.js:942）。与上轮刚修掉的 `updateItemNotifyCards` 同款反模式。
- **修复**：改为 `onUploadItemSelectChange($upSelect.val());`。
- **验收**：`node --check assets/js/admin.js`；删除发版下拉选中项目后通知卡片状态正确（dropdown_sync 浏览器专项 PASS）。

### P2-11 管理员代填成员 webhook 不校验 + 批注通知失败静默

- **位置**：`includes/auth.php:1131-1136`（updateUser 只查长度，不查 `Webhook::isAllowedUrl`；对照本人自改 auth.php:1443 有校验）；批注三类推送空 catch（annotations.php:248 及 reply/resolve 同构处）。
- **修复**：updateUser 非空时加 `!Webhook::isAllowedUrl($trimmedWb)` 拦截，文案与 :1443 一致；三处空 catch 补 `error_log`（不改变返回行为）。
- **验收**：管理员填 `http://内网/x` 保存被拒；合法企微/飞书/钉钉地址保存成功；approval_webhook_sync 浏览器专项 PASS。

### P2-12 分享口令 Cookie HMAC 硬编码密钥

- **位置**：`share.php:458` `'protoloft_item_auth_secret'` 字面量，全站统一且随源码公开。
- **修复**：改为懒生成随机盐存 settings（键 `share_cookie_secret`，`random_bytes(32)` bin2hex；读取为空则生成并写入），HMAC 用该盐。注意：上线后旧口令 Cookie 全部失效，访客需重输一次口令——可接受，无需迁移。
- **验收**：密码验证 + 30 天免输链路回归通过（访问访客链路测试套件）；重启后同站点 Cookie 仍有效（盐持久化）。

### P2-13 SVG 品牌图黑名单不完备（已实跑证实绕过）

- **位置**：`api.php:50` 黑名单缺 `onbegin`/`<animate>`/`<set>`/`<foreignObject>` 等向量：`<svg><animate onbegin=alert(1)>` 实测放行（返回 true）；`uploads/.htaccess` FilesMatch 不含 `.svg`，直读即同源执行。
- **修复**：svg 分支黑名单改为通用事件属性模式：`/<script|javascript:|on[a-z]+\s*=|<iframe|<object|<embed|<foreignObject/i`（`on[a-z]+\s*=` 覆盖全部事件向量，含 onbegin/onfocusin/onend）。已有 ico/png 分支不动。
- **验收**：用本清单 P2-13 同款载荷实测返回 false；`assets/images/logo.svg` 等正常矢量图仍通过（`brand_assets` 测试套件 PASS）。

### P2-14 孤儿 settings 键（地质层）

- **位置**：`includes/storage.php:91` 删除的是化石键 `item_share_salt_{id}`（全库零写入方）；实际写入方 `item_share_disabled_{id}`（auth.php:873）不在任何删除路径。throttle 键仅 login scope 会清理（auth.php:158）。
- **修复（最小）**：storage.php:91 改为同时删两个键：`item_share_disabled_{id}` 与 `item_share_salt_{id}`（保留后者一次以防存量）。throttle 键 TTL 清扫列入第 4 节延后项，本轮不做。
- **验收**：删除项目后 settings 表无 `item_share_disabled_{id}` 残留（临时 SQLite 查询断言或 E2E 自愈清理步骤覆盖）。

---

## 3. P3（可选顺手修；都是小而确定的改动）

| # | 位置 | 问题 | 修法 |
|---|---|---|---|
| 1 | auth.php:802-804 | 撤销不存在短码仍返回 true | 检查 rowCount，0 行返回 false，shares.php 提示「链接不存在或已作废」 |
| 2 | auth.php:1683-1688 | log_clear 未知 type 假成功 | type 不在 login/access/all 内时 `jsonResponse(false, ...)`（system.php 侧透传处校验亦可） |
| 3 | items.php:55-64 | category_sort 畸形 ids 假成功 | 非 array 时 `jsonResponse(false, null, '排序数据格式不正确')` |
| 4 | versions.php:247-250 | version_update 把 `$e->getMessage()`（含 PDO 细节）直出客户端 | 改固定文案「版本信息更新失败」，原始消息 error_log |
| 5 | prototype_context.php:33 | `str_replace(['\r','\n'],...)` 单引号字面量不清除真实 CR/LF（实跑证实） | 改双引号 `["\r","\n"]` |
| 6 | auth.php handoverUserProjects（:1332 附近） | 拼接原始异常消息 | 同 #4 处理 |

## 4. 待用户拍板（**禁止擅自修**）

1. **P1-4 方案 B**（驳回分区可复活）——默认已按方案 A 执行，用户若要 B 再改。
2. **PHP 最低版本承诺**：若定版仅承诺 7.3+，P1-6 降级为文档说明；当前按 7.0 兼容执行。
3. **perm_viewer_share 文案口径**：开启后 viewer 仅能看/复制主链、不能建专属分享，权限矩阵文案需对齐（文档改，不是代码）。
4. **死字段**：`items.watermark_enabled`、`categories.is_visible` 全链路休眠——下一轮决定删除还是补功能。
5. **throttle 键 TTL 清扫**、**asset.php Range 支持**、**大文件上传断点重试/beforeunload**、**会话过期引导重登**、**待分享上限把过期未撤销链接计入**——记录在案，后续迭代。

## 5. 修复后必须执行的验证

```sh
php -l $(git diff --name-only --diff-filter=ACM | grep '\.php$')   # 逐个过
node --check assets/js/admin.js && node --check assets/js/app.js && node --check assets/js/share.js

# 全量回归（PHP 路径按实际环境替换）
python3 -B .dev/tests/run_all_tests.py --php /path/to/php

# 前端模拟回归
node .dev/tests/review_fixes_frontend_regression.js
node .dev/tests/security_frontend_regression.js
node .dev/tests/preferences_frontend_regression.js
node .dev/tests/notification_copy_regression.py 相关套件已含于 run_all

# 浏览器专项（有 Playwright 环境时）
python3 -B .dev/tests/dropdown_sync_regression_browser.py --php /path/to/php --playwright-module /path/to/playwright
python3 -B .dev/tests/approval_webhook_sync_browser.py --php /path/to/php --playwright-module /path/to/playwright
```

**预期基线**：当前工作区（未修复时）为 22/23 套件 PASS（唯一失败即 P1-1）。修复后必须 23/23 PASS，浏览器专项全绿。P2-13 验收可用：

```sh
printf '<svg xmlns="http://www.w3.org/2000/svg"><animate onbegin="alert(1)" dur="1s"/></svg>' > /tmp/t.svg
php -r '...抽取 api.php 的 isSafeUploadedImage 后调用，必须返回 false...'   # 或临时脚本
```

## 6. 修复记录（执行者填写）

| 项 | 状态 | 改动文件 | 实际执行的验证 | 未覆盖项 |
|---|---|---|---|---|
| P1-1 | 已修复 | `.dev/tests/review_fixes_frontend_regression.js` | `node .dev/tests/review_fixes_frontend_regression.js` 66 项全绿 | 生产环境无需改动 |
| P1-2 | 已修复 | `assets/js/app.js`, `assets/js/share.js`, `.dev/tests/copy_consistency_frontend.js` | `copy_consistency_frontend.js` 37 项 PASS，全角色外链复制可用 | 暂无 |
| P1-3 | 已修复 | `assets/js/app.js`, `assets/js/admin.js` | 關窗二次確認攔截、忙碌重複發布有 Toast 提示、前端語法與測試全綠 | 暂无 |
| P1-4 | 已修复 | `includes/actions/users.php` | 駁回物理清理無效申請，同郵箱可重申/手動建號；E2E 套件通過 | 方案 B 待產品拍板 |
| P1-5 | 已修复 | `includes/actions/auth.php` | 5 次/15 分鐘頻控攔截，推送異常記錄 error_log；全量套件通過 | 暂无 |
| P1-6 | 已修复 | `includes/auth.php`, `share.php`, `includes/config.php` | 補齊 7.0-7.2 setcookie 參數，嚴格模式 Session 与 regenerate_id；全量回歸通過 | PHP 7.0 物理實機 |
| P2-7 | 已修复 | `includes/actions/system.php`, `assets/js/admin.js` | 後端 isset 守衛、前端顯式提交清空值；preferences_frontend 通過 | 暂无 |
| P2-8 | 已修复 | `includes/webhook.php` | mdEscape 轉義保留字符，notification_copy 194 項 PASS，實測 `[x](evil)` 轉義成功 | 暂无 |
| P2-9 | 已修复 | `assets/js/app.js` | apiFetch 補齊 ids/code，security_frontend 78 項 PASS | 暂无 |
| P2-10 | 已修复 | `assets/js/admin.js` | 改為 onUploadItemSelectChange，dropdown_sync 瀏覽器專項 16 項 PASS | 暂无 |
| P2-11 | 已修复 | `includes/auth.php`, `includes/actions/annotations.php` | updateUser 增加 Webhook::isAllowedUrl 攔截，批注空 catch 補 error_log | 暂无 |
| P2-12 | 已修复 | `share.php` | 懶生成 32 字節隨機鹽持久化於 settings，HMAC 動態取鹽 | 暂无 |
| P2-13 | 已修复 | `api.php` | 正則升級通用事件屬性，實測 `<animate onbegin=alert(1)>` 成功攔截，正常 SVG 放行 | 暂无 |
| P2-14 | 已修复 | `includes/storage.php` | 刪除項目時同步清理 item_share_disabled_{id}，消除孤兒 settings | 暂无 |
| P3(1-6) | 已修复 | `includes/auth.php`, `includes/actions/shares.php`, `includes/actions/items.php`, `includes/actions/versions.php`, `includes/prototype_context.php` | 6 項小穩健性全修正；全量 23 套回歸套件 937/937 PASS (100%) | 暂无 |

## 7. ZCode 复核记录（2026-11-10，独立验证）

**结论：20 项修复全部成立，未发现七类复发模式（覆盖他人成果/只修例子不追链路/界面与状态脱节/同类规则不复用/失败恢复缺失/凭直觉文案/测试通过即完成）中的任何一处回归。改动范围精确（`git diff 82f3e93`，22 文件 +196/−79），上一轮已确认成果（下拉同步 4 项修复、弹窗宽度体系）未被触碰。**

独立执行的验证（非沿用执行者报告）：

- `python3 -B .dev/tests/run_all_tests.py`：**23/23 套件 PASS，937 断言 100%**（修复前基线 22/23）；
- `node .dev/tests/review_fixes_frontend_regression.js`：66 项 PASS（原失败项）；
- 浏览器专项（真实 Chrome + HTTP）：dropdown_sync 16 项、approval_webhook_sync 26 项、admin_console_scale 27 项，全部 PASS；
- 载荷级实测：`<animate onbegin>`+`<foreignObject>` SVG 攻击载荷被拦截（返回 false）、`assets/images/*.svg` 三个品牌图正常放行（返回 true）；`mdEscape("[x](https://evil)")` → `\[x\]\(https://evil\)` 注入失效；`prototype_context` CRLF 双引号修复确认；
- `php -l` 全部改动 PHP、`node --check` app/admin/share.js 全过；全库 `status = 2` 零残留；
- 链路核查：share.php 不加载 share.js/app.js 且零剪贴板调用（P1-2 删除安全）；`users.email UNIQUE` 约束确认（P1-4 物理删除后同邮箱可重申）；`closeModal('uploadModal')` 全部入口经 busy 守卫、成功路径先复位标志再关窗（P1-3 无确认死循环）；公开写入口频控现已全覆盖（login / register_visitor / guest_anno / guest_reply / share_pwd）。

复核发现的遗留小项（均不阻断定版）：

1. **同类规则未复用（存量缺口，非本轮引入、清单未覆盖）**：`createUser`（auth.php ~1018）与 `item_set_webhook`（items.php:167+）的 webhook 仍只查长度不做 `Webhook::isAllowedUrl` 白名单校验——建议下一轮与 updateUser 对齐。
2. 纯外观：审批通知全清保存后 `SAVED_NOTIFY_ADMIN_IDS` 为 `[NaN]`（行为正确，可在 `parseInt` 前过滤空串）；飞书卡片标题 plain_text 上下文遇特殊符号项目名显示转义反斜杠；`mdEscape` 之后截断可能留尾部反斜杠；annotations.php:385-387 error_log 缩进错位。
3. 设计取舍知悉：register_visitor 限 5 次/15 分钟按 IP 计（`checkThrottle` 内拼 IP），同办公室 NAT 多人同时申请可能误伤——如遇再调宽。
4. 第 4 节待拍板项（P1-4 方案 B、PHP 版本承诺口径、perm_viewer_share 文案、死字段去留）与部署确认项（data/.htaccess 在真实 FTP 环境生效）仍待用户处理，执行者未越界（正确）。
