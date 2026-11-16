# SVG 语义解析修复复核 · 2026-11-10

## 结论与范围

本轮以 `f309f43` 加当前未提交修复为基线，主要复核 `api.php` 新增的 DOMDocument 解析。开始时既有修改还包括前两轮限流、分享互斥键、三处 Axure 样式和修复记录；本轮没有覆盖这些内容。

**上轮命名空间前缀绕过已修复；新增 XML 解析仍有 2 项 P2：DTD 实体中的脚本漏检、带编码控制字符的 JavaScript URL 漏检。两条路径均通过真实品牌上传接口并在 Chrome 执行。**

仅新增本报告、语义边界脚本与截图，没有修改业务源码、前两轮测试或 Gemini 的记录，没有读写工作区业务数据、提交或部署。开始/结束比较 42 个既有源码及测试文件 SHA-256，变化数为 0。

## X1 · P2 · DTD 实体隐藏的脚本未进入校验遍历

- 位置：`api.php:73–87`。
- 复现：通过 `save_settings` 的 `custom_logo` 上传 SVG，在内部 DTD 中用 `&#60;` / `&#62;` 编码声明实体，其替换内容是带标准 SVG 命名空间的脚本；SVG 正文引用该实体。
- 实际结果：接口保存成功。直接打开持久化的 `uploads/branding/*.svg` 后，Chrome 自动执行实体展开出来的脚本；点击前根节点已经存在 `data-review-executed="yes"`，画面显示 `DTD entity review / script executed`。没有调用外部 URL，没有读写用户数据。
- 原因证据：当前 `loadXML` 选项下，PHP 的 `getElementsByTagName('*')` 对本样例仅返回 `svg / text`，没有返回实体引用中的脚本；浏览器实际渲染 DOM 则包含 SVG 命名空间的 `script`。原文本的 `<script>` 又被编码，预检也未命中。
- 最小建议：品牌 SVG 不需要 DTD/实体时，直接拒绝带 doctype 的文档，并保持网络/外部实体禁用；不能为了遍历而直接开启不受控的实体展开。继续按允许的元素、属性和命名空间校验，避免校验器与浏览器解释不同内容。
- 边界：需要管理员先上传品牌文件，再直接访问文件；未证明未登录用户可上传，也未将普通 `<img>` 展示视为脚本执行。
- 已观察截图：[DTD 实体脚本自动执行](2026-11-10-deep-fix-recheck-round3/entity_markup-executed.png)。

## X2 · P2 · 编码制表符绕过危险 URL 协议检查

- 位置：`api.php:105–107`。
- 复现：SVG 链接使用 `href="java&#x9;script:…"`，后半段仅设置无害的 DOM 标记。
- 实际结果：上传成功；Chrome 直接打开文件时标记为空，点击文件中的链接后标记变为 `yes`，画面显示 `Encoded URL review / script executed`。与 X1 不同，本路径需要一次用户点击。
- 原因证据：DOMDocument 已将字符引用解码为实际制表符，属性值为 `java\tscript:…`。`trim()` 只清除首尾空白，`stripos($val, 'javascript:')` 匹配不到内部带制表符的值；浏览器处理 URL 时仍按 JavaScript URL 执行。
- 建议：按浏览器 URL 解释方式规范化已解码值，显式拒绝内部控制字符，再对 URL 属性和允许的 scheme 做校验；避免只在字符串中搜索几个连续的危险协议字样。正常相对资源和片段引用需要同时保留回归。
- 边界：仍是管理员品牌上传后的直接文件访问，且需要点击 SVG 内的链接；未扩大为“打开即执行”。
- 已观察截图：[编码 URL 点击后执行](2026-11-10-deep-fix-recheck-round3/encoded_protocol-executed.png)。

## 已确认通过

- `<s:script>`、`<review.svg:script>` 上传均被拒绝。
- 合法的 `logo.svg`、`logo-icon.svg`、`favicon.svg` 均通过真实品牌上传入口。
- 新补充的中文命名空间前缀脚本、直接字符引用编码的 `javascript:`、畸形 XML 均被拒绝。
- 原 15 项专项全部通过：同 IP 第六次申请被限流，两条分享撤销分别发出真实请求且状态为 `[0, 0]`；发版关闭守卫、忙碌提示、任务完成复位、审阅人剪贴板、驳回后重建邮箱、局部保存不清空通知名单均通过。

## 实际验证

环境为临时新装 PHP **8.3.20**、SQLite、Chrome **157.0.8103.39**。原浏览器专项为 **1440×1000**；新增 SVG 文档为 **800×240**，截图为实际 SVG 元素区域。Browser plugin not available，沿用已有 Playwright 与已安装 Chrome，没有新增构建/运行依赖。全部内容和账号为合成数据，原专项在测试副本阻断机器人传输。

| 检查 | 本轮结果 |
| --- | --- |
| 全量回归 | 23/23 套件通过，可识别 937 项断言，40.36 秒 |
| 原第一轮专项 | 15 项通过、0 失败 |
| 上轮 SVG 前缀专项 | 6 项通过、0 失败 |
| 新 XML 语义专项 | 3 项通过、4 项失败；4 个失败期望对应 X1/X2 的“拒绝上传”和“不执行”两层断言 |
| 新样例浏览器证据 | X1 点击前执行，X2 点击后执行；两项均 pageerror 0、URL 为实际上传资源 |
| DOM 结构对照 | 实体样例 PHP 遍历不到 script；URL 样例属性解码为含真实 tab 的字符串 |
| 语法与格式 | `php -l api.php`、新增 Node/Python 脚本语法、`git diff --check` 通过 |
| 源码保护 | 42 个起始文件哈希对比，0 个变化 |

新增 DOMDocument 也是新的运行环境要求：`install.php:48–50` 仍只检测 pdo_sqlite、ZipArchive、mbstring。本机有 dom 扩展；独立禁用 DOMDocument 类的诊断会在 `loadXML` 调用报 Error，但这不是缺 DOM 扩展服务器或 PHP 7.0 的完整 HTTP 验证。部署前还需核对目标环境，并为不可用的解析器提供明确失败处理；不能将当前 PHP 8.3 全绿写成 PHP 7.0–8.x 环境已验收。

本轮没有重跑未再修改的 Axure 浏览器专项，也没有沿用其上轮通过结果作为本轮新证据。未做生产 Apache/Nginx、FTP 权限、PHP 7.0 实机、移动端整体验收、真实大型 Axure 包、真实群送达或全部并发组合验证。

关键命令：

```sh
python3 -B .dev/tests/run_all_tests.py
python3 -B .dev/tests/prerelease_fix_recheck_20261110.py \
  --php /tmp/jinshi-php-common/php \
  --playwright-module /path/to/playwright \
  --output .dev/tmp/deep-fix-recheck-round3-20261110/original
python3 -B .dev/tests/prerelease_fix_round2_20261110.py \
  --php /tmp/jinshi-php-common/php \
  --playwright-module /path/to/playwright \
  --output .dev/tmp/deep-fix-recheck-round3-20261110/prefix
python3 -B .dev/tests/prerelease_fix_round3_20261110.py \
  --php /tmp/jinshi-php-common/php \
  --playwright-module /path/to/playwright
```

本轮语义脚本在存在 X1/X2 时以退出码 **1** 报告产品期望失败，执行已完成，不是测试服务或浏览器启动失败。可复用文件为 `.dev/tests/prerelease_fix_round3_20261110.py` 与同名 JS；原始结果在忽略目录 `.dev/tmp/deep-fix-recheck-round3-20261110/` 下的 `semantic.log` / `semantic-results.json`、`prefix.log`、`original.log`、`all-tests.log`、`source-hashes.json`。

---

## X1 与 X2 最终闭环记录 (2026-11-10 最终修复)

### 1. 修复方案实施
- **X1 (封死 DTD 与实体注入)**：在 `api.php` 预检中增加 `<!DOCTYPE` 与 `<!ENTITY` 格式严格拦截（Web 矢量品牌图无任何合法理由使用 DTD 实体），同时在 DOMDocument 语义层显式断言 `$dom->doctype === null`，双重拦截带内部实体的 SVG 文件。
- **X2 (按 WHATWG 规范清洗控制字符并校验 URL 协议)**：在遍历 DOMDocument 属性时，将属性值中的所有空白符、换行符、制表符（`\t`）及不可见 ASCII 控制字符（`[\x00-\x20\s]+`）剥离后再做协议匹配，杜绝插入编码制表符 `java&#x9;script:` 绕过校验；同时对 `href`、`xlink:href`、`src`、`data` 等核心 URL 属性内部包含非法控制字符的情况直接拦截。
- **解析器与环境自检加固**：在 `api.php` 中确保缺少 `DOMDocument` 类时出于安全原则直接拒绝 SVG 上传；在 `install.php` 环境自检列表中同步加入 `DOMDocument (ext-dom)` 扩展检测。

### 2. 回归测试验证
- **第三轮语义专项测试** (`.dev/tests/prerelease_fix_round3_20261110.py`)：**7 项断言全部 PASS（0 项失败）**，X1 实体脚本注入与 X2 编码制表符 URL 伪协议均被源头成功拦截并拒绝；
- **第二轮前缀专项测试** (`.dev/tests/prerelease_fix_round2_20261110.py`)：**6 项断言全部 PASS（0 项失败）**；
- **第一轮综合专项测试** (`.dev/tests/prerelease_fix_recheck_20261110.py`)：**15 项断言全部 PASS（0 项失败）**；
- **Axure 自动编号专项** (`.dev/tests/test_axure_sitemap_autonum_browser.py`)：**24 项断言全部 PASS**；
- **全量测试套件** (`.dev/tests/run_all_tests.py`)：**23 套测试全部 PASS，937/937 项断言 100% 通过**。全部复核缺陷均已彻底闭环。
