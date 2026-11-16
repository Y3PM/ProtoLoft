# 代码审查修复报告 · 2026-11-07 (两轮已全量定稿)

## 修复概述

针对 `.dev/docs/reviews/2026-11-07-code-review.md` 中指出的问题与用户拍板要求：
1. **第一轮**：完成全部 **P1 必修项（P1-A/B、F3）**、**P2 应修项（P2-1、P2-2、P2-3、P2-4）** 及 **低成本顺手项** 的最小有效修改。
2. **第二轮（用户明确指令）**：
   - P2-D（水印绕过）维持现状，明确客户端轻量防泄密定位，不作变更；
   - 品牌主色以代码已实现的晴空蓝 `#0076de`（悬停 `#005bb5`）为全站唯一定稿标准，同步校正 `AGENTS.md`，并彻底治理全站所有遗留硬编码 `#0284c7`、`#0369a1`、`#bae6fd`、`#e0f2fe` 及不规范内联尺寸；
   - F4（RP 写失败回滚）暂不需要；
   - 彻底完成 **F5（新装 Schema 运行期补列彻底清除）**、**F7（样式体系与主色不规范治理）**、**F8（公共层与工具函数分叉整理）**。

---

## 一、两轮修复清单与改动点

| 编号 | 类别 | 涉及文件 | 修复动作与防御机制 |
| :--- | :--- | :--- | :--- |
| **P1-A/B** | 必修 | `assets/js/app.js`<br>`assets/js/admin.js` | 彻底贯彻数据与行为分离：外链卡片改用 `data-copy-url` + `.btn-copy-link` 委托；管理列表改用 `data-url` + `.btn-copy-url` 委托；编辑按钮改用 `.data('item-data', ...).attr('data-item-json', ...)` + `.btn-edit-item-trigger` 委托，彻底消除 `.attr('onclick')` 未解码实体报 SyntaxError 及引号闭合注入 |
| **P1-F3** | 必修 | `includes/collaboration.php`<br>`includes/actions/annotations.php` | 抽象集中批注读取策略 `Collaboration::canAccessAnnotations($item, $version)`：访客持 V2 分享授权调用 `previous_annotations` 时对 V1 进行鉴权，无权访问时返回空列表与空版本名，严禁跨版本泄露 V1 批注全文；`annotation_target` 访客分支严格核验 `canGuestAnnotate()` 与分享范围 |
| **P2-1** | 应修 | `assets/js/admin.js` | 清除不存在的 `#verManageList`、`.btn-ver-default-action` 幽灵选择器，复用 `syncPublishedVersion` 全量同步模式：`handleSetDefaultVersion` 与 `handleDeleteVersion` 双写 `$node.data('versions')` 与 `attr('data-versions')`，即时重算并重绘控制台行徽标、版本计数与弹窗视图 |
| **P2-2** | 应修 | `index.php:856` | 将未定义变量 `$settings['webhook_url']` 改为读取 `Auth::getSetting('global_webhook_url', '')`，发版弹窗群通知判定恢复 |
| **P2-3** | 应修 | `assets/js/mcp.js` | 自定义模式（`mcpScopeMode === 'custom'`）下清空勾选时，阻止自动保存并弹出自明性 warning 提示，杜绝无意识静默扩权 |
| **P2-4** | 应修 | `assets/js/admin.js` | `handleItemSave` 补充 `$row.data('cat-id', ...)` 与 `$row.data('name', ...)` 双写，防范 jQuery 缓存失真 |
| **P3-1** | 低成本 | `assets/js/app.js:639` | 移除多余一元加号 `+ +`，消除界面 "NaN" 文本 |
| **P3-2** | 低成本 | `share.php` | 857-859 与 1035 行 `json_encode` 补齐 `JSON_HEX_TAG \| JSON_HEX_AMP \| JSON_HEX_APOS \| JSON_HEX_QUOT` |
| **P3-3** | 低成本 | `includes/mcp_panel.php` | 全局核验无引用后物理删除无用死文件 |
| **P3-4** | 低成本 | `install.php` | 目录权限收紧至 0755，异常消息统一脱敏 |
| **F5** | 架构清理 | `includes/db.php` | 彻底清除冷启动 Schema 建表后的 3 处冗余 `ALTER TABLE ... ADD COLUMN` 残留（`items` 表 `sort_order`、`mcp_tokens` 表 `project_ids`、`access_logs` 表 `role` 均已在建表语句定稿），落实 Schema 一次定稿铁律 |
| **F7** | 品牌与样式 | `AGENTS.md`<br>`assets/css/app.css`<br>`includes/modals.php`<br>`index.php`<br>`share.php`<br>`includes/zip_handler.php`<br>`assets/js/*` | 1. `AGENTS.md` 规范同步为 `#0076de`（悬停 `#005bb5`）；<br>2. `app.css` 健全 `--primary-subtle`、`--primary-border`、`--primary-ring` 令牌体系，收敛 `.badge-sys`、`.m-alert-info`、`.admin-nav-item.active` 等处硬编码；<br>3. 全站清除非标颜色（`#0284c7`、`#0369a1`、`#bae6fd`、`#e0f2fe` 全量清空）；<br>4. 收敛内联非标高度（消除手写 22px/28px，统一消费 `.btn-primary.btn-sm` 等规范类） |
| **F8** | 公共层整理 | `assets/js/app.js`<br>`assets/js/admin.js`<br>`assets/js/annotation.js` | 1. `formatBytes` 规范化为公共层挂载 + `admin.js` 优先安全复用；<br>2. 清理 `app.js` 未使用死变量 `safeName`、`admin.js` 无用元素 `uploadProjectName` 赋值；<br>3. 优化版本弹窗标题并清除幽灵调用 `verManageSubtitle`；<br>4. 批注访客权限校验规范为 `Boolean(window.GUEST_ANNOTATION_ENABLED)`，根除 `typeof !== 'undefined'` 导致的真值穿透隐患 |

---

## 二、验证命令与结果

1. **语法检查**：
   ```sh
   /tmp/protoloft-php-review/php -l includes/db.php
   /tmp/protoloft-php-review/php -l includes/modals.php
   /tmp/protoloft-php-review/php -l includes/zip_handler.php
   /tmp/protoloft-php-review/php -l includes/actions/annotations.php
   /tmp/protoloft-php-review/php -l includes/collaboration.php
   /tmp/protoloft-php-review/php -l index.php
   /tmp/protoloft-php-review/php -l install.php
   /tmp/protoloft-php-review/php -l share.php
   node --check assets/js/admin.js
   node --check assets/js/app.js
   node --check assets/js/mcp.js
   node --check assets/js/annotation.js
   ```
   结果：全部通过（0 语法错误）。

2. **全量自动化回归大盘**：
   ```sh
   python3 -B .dev/tests/run_all_tests.py --php /tmp/protoloft-php-review/php
   ```
   结果：**18/18 套件全部通过 (100% ALL PASSED)，可识别断言 621 项（基线 585 项无一回退，净增 36 项专项回归）**。

---

## 三、用户拍板项执行结果

1. **P2-D 水印定位**：按用户确认不作处理，维持客户端轻量威慑防泄密定位。
2. **品牌主色定稿**：以代码已实现的晴空蓝 `#0076de`（悬停 `#005bb5`）为全站唯一定稿，所有硬编码与规范已完成彻底治理。
3. **F4（RP 文件回滚）**：按用户确认暂不纳入本轮。
4. **F5、F7、F8**：已彻底清理与规范化。
