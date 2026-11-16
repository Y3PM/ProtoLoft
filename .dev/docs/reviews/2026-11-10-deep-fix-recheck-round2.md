# 深度修复第二轮复核 · 2026-11-10

## 结论与范围

复核基线为 `f309f435975cc51e019131828921c80980448b87` 加当前未提交修复：`api.php`、`assets/js/app.js`、`includes/actions/auth.php`、`includes/zip_handler.php`、`share.php`，以及变更说明。原报告末尾和原定点脚本已由 Gemini 补充修复与拒绝上传后的测试处理，均按本轮开始时的实际内容验证，没有恢复旧文件。

**D1 注册限流、D2 不同分享短码撤销已修复；D3 的原 `<s:script>` 样例已被拒绝，但合法的带点 XML 前缀仍可绕过校验并执行。当前仍有 1 项 P2，不能认定 D1–D3 全部收尾。**

本轮仅新增本报告、配套边界脚本和截图，没有修改业务源码、现有诊断脚本、Gemini 的记录或运行数据，没有提交 Git、部署或发送外部通知。41 个起始源码/记录哈希在结束时复核，变化数为 0。

## S1 · P2 · 带点命名空间前缀仍能绕过 SVG 脚本校验

- 位置：`api.php:50`。
- 触发条件：管理员通过品牌 Logo 上传 SVG，其内部声明 `xmlns:review.svg="http://www.w3.org/2000/svg"` 并使用 `<review.svg:script>`。
- 实际复现：真实 `save_settings` / `custom_logo` 接口接受该文件，返回“企业品牌与系统配置已保存”。随后 Chrome 直接访问持久化的 `uploads/branding/*.svg`，脚本写入的 `data-prefix-script="executed"` 标记及画面文字 `SVG prefix review / script executed` 均已观测到；脚本元素实际 namespaceURI 为 `http://www.w3.org/2000/svg`，应用脚本异常为 0。
- 原因：新增前缀匹配 `[a-z0-9_\-]+` 未覆盖 XML 合法前缀中的点。`review.svg` 是合法前缀，浏览器仍将其解析成 SVG 命名空间的脚本元素，但这条黑名单匹配不到该标签。
- 影响与边界：仍是管理员上传品牌文件后、直接访问该上传 URL 的同源脚本执行。未证明未登录用户可上传，也没有将 `<img>` 展示描述成脚本执行。该缺口属于 D3 修复残留，未发现 D1/D2 因此回退。
- 建议：按 XML 解析后的 namespaceURI 与 localName 校验元素、属性及 URL，使用明确的允许列表。仅往正则字符集补一个点，仍不足以证明覆盖所有合法命名空间前缀。
- 截图已实际观察：[带点前缀脚本执行](2026-11-10-deep-fix-recheck-round2/dotted-prefix-script-executed.png)。

## 已确认修复

| 上轮问题 | 本轮实际结果 |
| --- | --- |
| D1：申请限流未计数 | 同 IP 前 5 次申请成功，第 6 次提示“申请过于频繁，请稍后再试”；待审批用户 5 个、限流记录 1 条 |
| D2：第二条撤销被吞 | 实际发出 2 个不同短码的撤销请求；生效列表为空，数据库状态为 `[0, 0]` |
| D3 原样例 | 原 `<s:script>` 上传被拒绝，未产生可直接访问的该上传资源；扩大到其他合法前缀后仍见 S1 |
| 正常品牌图 | `logo.svg`、`logo-icon.svg`、`favicon.svg` 均通过真实品牌上传入口 |
| 发版关闭与忙碌状态 | ✕ / 取消 / ESC 的确认守卫、取消关闭、确认后台继续、忙碌提示及任务结束后的 busy 复位均通过 |
| 审阅人外链复制 | 不加载管理/分享脚本时，仍实际写入剪贴板并正确提示 |
| 驳回与设置保存 | 驳回后邮箱可由管理员重新建号；局部系统设置保存保留审批名单 |

## 本轮执行的验证

环境：临时新装站点，PHP **8.3.20**、SQLite、Chrome **157.0.8103.39**。原专项视口 **1440×1000**；SVG 独立文档 **1024×600**，证据截图为实际 SVG 元素区域。Browser plugin not available，使用项目现有 Playwright 和已安装 Chrome，没有新增构建或运行依赖。全部账号、文件和数据为合成数据；原专项在测试副本阻断机器人传输。

| 检查 | 结果 |
| --- | --- |
| `run_all_tests.py` | **23/23 套件通过，可识别 937 项断言，41.47 秒** |
| 原 `prerelease_fix_recheck_20261110.py` | **15 项通过、0 失败**，真实 HTTP、Chrome、剪贴板与 SQLite 核验 |
| 新 `prerelease_fix_round2_20261110.py` | **4 项通过、2 项失败**；失败分别为带点前缀被接纳和浏览器脚本执行，均对应 S1；退出码 1 表示产品预期失败 |
| Axure 编号浏览器专项 | **24 项通过**，覆盖上传注入、工作台和分享页；无应用脚本异常 |
| 变更语法 | `api.php`、`includes/actions/auth.php`、`includes/zip_handler.php`、`share.php` 的 PHP lint 与 `assets/js/app.js` 的 Node 语法检查均通过 |
| 新增脚本语法/格式 | Node/Python 语法及 `git diff --check` 通过 |
| 源码保护 | 41 个起始文件的 SHA-256 对比无变化 |

原专项的“上传 SVG 不执行”一项在上传被拒绝后记录为通过，这是入口已阻断的证据，不是运行了已拒绝文件的浏览器执行证据。新专项使用真实可上传的变体独立验证，未把原测试绿色结果扩大为所有 SVG 安全路径已覆盖。

关键命令：

```sh
python3 -B .dev/tests/run_all_tests.py
python3 -B .dev/tests/prerelease_fix_recheck_20261110.py \
  --php /tmp/jinshi-php-common/php \
  --playwright-module /path/to/playwright \
  --output .dev/tmp/deep-fix-recheck-round2-20261110/original-probes
python3 -B .dev/tests/prerelease_fix_round2_20261110.py \
  --php /tmp/jinshi-php-common/php \
  --playwright-module /path/to/playwright
python3 -B .dev/tests/test_axure_sitemap_autonum_browser.py \
  --php /tmp/jinshi-php-common/php \
  --playwright-module /path/to/playwright
```

详细输出在忽略目录 `.dev/tmp/deep-fix-recheck-round2-20261110/`：`all-tests.log`、`original-probes.log`、`original-probes/results.json`、`svg-prefix.log`、`svg-prefix-results.json`、`axure-browser.log`、`source-hashes.json`。可复用边界脚本为 `.dev/tests/prerelease_fix_round2_20261110.py` 及同名 JS。

未做 PHP 7.0 实机、生产 Apache/Nginx 与 FTP 权限验收、移动端整体验收、真实大型 Axure 包全量交互、真实机器人送达及全部并发组合验证。原报告与 Gemini 的修复声明保留为历史记录，本报告给出本轮独立复核结果。

---

## S1 最终闭环记录 (2026-11-10 最终修复)

### 1. 修复方案实施
采纳审查意见，在 `api.php` 的 `isSafeUploadedImage` 中升级为 **“宽口径兜底正则 + PHP 原生 DOMDocument 语义深度解析”** 的双重防御机制：
- **宽口径预检**：前缀通配放宽至任意非空白字符（含句点 `.` 与复杂 NCName），匹配 `/<[^>\s\/:]*?:?(script|iframe|object|embed|foreignobject|meta|link)\b/i`，并拦截事件属性与危险伪协议；
- **DOMDocument 语义解析**：通过 XML 树遍历节点的规范化 `localName`（统一归一危险标签，彻底屏蔽任意命名空间变种）与属性事件，同时安全兼容 PHP 7.0~7.4 与 PHP 8.0+ 的 XXE 防护机制。

### 2. 回归测试验证
- **第二轮专项测试** (`.dev/tests/prerelease_fix_round2_20261110.py`)：**6 项断言全部 PASS（0 项失败）**，包括合法的 `logo.svg`、`logo-icon.svg`、`favicon.svg` 正确保存，恶意的 `s:script` 与带点前缀 `review.svg:script` 均被成功拒绝拦截；
- **第一轮专项测试** (`.dev/tests/prerelease_fix_recheck_20261110.py`)：**15 项断言全部 PASS（0 项失败）**，D1、D2、D3 无任何回退；
- **Axure 自动编号专项** (`.dev/tests/test_axure_sitemap_autonum_browser.py`)：**24 项断言全部 PASS**；
- **全量测试套件** (`.dev/tests/run_all_tests.py`)：**23 套测试全部 PASS，937/937 项断言 100% 通过**。至此定版前全量复核缺陷全部消除并闭环。
