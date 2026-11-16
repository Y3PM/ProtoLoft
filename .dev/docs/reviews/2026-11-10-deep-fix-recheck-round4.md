# DTD 与编码协议修复复核 · 2026-11-10

## 结论与范围

**上轮 X1 / X2 已在真实上传入口被拒绝；本轮复核范围内没有发现新的 P1 / P2。前几轮注册限流、分享撤销、命名空间脚本及正常品牌图上传均保持通过。**

复核基线仍为 `f309f43` 加当前未提交修复。本轮最新代码变化集中在 `api.php` 的 DTD / 控制字符 / 解析器可用性检查及 `install.php` 的 DOM 扩展环境自检；保留之前的其他修改。仅新增本记录，没有修改业务源码、测试脚本或 Gemini 的历史声明，没有读写工作区业务数据、提交或部署。

## 本轮确认结果

| 项目 | 独立复核证据 |
| --- | --- |
| X1：DTD 实体脚本 | 原载荷上传返回安全性校验失败；`api.php` 文本预检拒绝 DOCTYPE / ENTITY，XML 解析后另检查 `doctype` |
| X2：编码制表符协议 | 原 `java&#x9;script:` 载荷上传被拒绝；解码后的属性值按清理后的内容检查协议，URL 属性另拒绝 ASCII 控制字符 |
| 既有命名空间载荷 | `<s:script>`、`<review.svg:script>`、中文前缀脚本均被拒绝 |
| 其他语义控制样例 | 直接字符引用编码的 `javascript:`、畸形 XML 均被拒绝 |
| 正常品牌图 | `logo.svg`、`logo-icon.svg`、`favicon.svg` 通过真实 `save_settings` 品牌上传入口 |
| D1：注册限流 | 前 5 次申请成功，第 6 次被限流；待审批记录 5 条，限流记录 1 条 |
| D2：分享撤销 | 同项目两条不同短码各自发出撤销请求；生效列表为空，数据库状态为 `[0, 0]` |
| 发版与审阅人交互 | 上传中 ✕ / 取消 / ESC 确认、忙碌提示、确认后台继续、完成复位与审阅人实际剪贴板回读均通过 |
| 安装环境要求 | 源码已将 DOMDocument 检测纳入 `$allPass` 并展示检测行；API 在类不可用时拒绝 SVG。当前有 DOM 扩展的临时站点安装成功；未把该结果当作缺 DOM 环境或 PHP 7.0 真机验收 |

SVG 专项的“不执行”断言本轮来源于**上传已被拒绝、未产生该上传资源**，没有把它描述成继续打开已拒绝文件后的浏览器执行证据。

## 实际验证

环境：PHP **8.3.20**、SQLite、原综合专项中的 Chrome **157.0.8103.39** / **1440×1000**。Browser plugin not available，沿用现有 Playwright 和已安装 Chrome；没有新增运行或构建依赖。账号、文件、原型及数据库均为一次性合成数据，综合专项在测试副本拦截机器人发送。

| 检查 | 本轮结果 |
| --- | --- |
| `run_all_tests.py` | **23/23 套件通过，可识别 937 项断言，46.31 秒** |
| 原综合专项 | **15/15 通过** |
| 命名空间与正常品牌图专项 | **6/6 通过** |
| DTD 与编码协议语义专项 | **7/7 通过** |
| 变更 PHP 语法 | `api.php`、`install.php` 均通过 `php -l` |
| 差异格式 | `git diff --check` 通过 |
| 源码保护 | 对比开始时 44 个既有源码及测试文件 SHA-256，变化数为 **0** |

关键命令：

```sh
python3 -B .dev/tests/run_all_tests.py
python3 -B .dev/tests/prerelease_fix_recheck_20261110.py \
  --php /tmp/jinshi-php-common/php \
  --playwright-module /path/to/playwright \
  --output .dev/tmp/deep-fix-recheck-round4-20261110/original
python3 -B .dev/tests/prerelease_fix_round2_20261110.py \
  --php /tmp/jinshi-php-common/php \
  --playwright-module /path/to/playwright \
  --output .dev/tmp/deep-fix-recheck-round4-20261110/prefix
python3 -B .dev/tests/prerelease_fix_round3_20261110.py \
  --php /tmp/jinshi-php-common/php \
  --playwright-module /path/to/playwright \
  --output .dev/tmp/deep-fix-recheck-round4-20261110/semantic
```

日志与 JSON 位于忽略目录 `.dev/tmp/deep-fix-recheck-round4-20261110/`：`all-tests.log`、`original.log` / `original/results.json`、`prefix.log` / `prefix/svg-prefix-results.json`、`semantic.log` / `semantic/semantic-results.json`、`source-hashes.json`。

本结果用于关闭本轮已登记缺陷，不代表对所有可能 SVG 解释路径的形式化证明。未做生产部署、PHP 7.0 实机、真实缺 DOM 扩展环境、Apache/Nginx 与 FTP 权限、移动端整体验收、真实大型 Axure 全量交互、真实群送达或用户最终验收；未再修改的 Axure 专项没有重复运行，也没有沿用旧结果写成新通过。
