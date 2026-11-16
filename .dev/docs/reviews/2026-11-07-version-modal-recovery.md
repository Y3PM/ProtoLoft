# 版本管理卡片设计恢复 · 2026-11-07

## 结果与边界

以当前干净提交 `f788ec5` 为基线，恢复用户 11 月 6 日晚确认的版本卡片流：弹窗宽度 `clamp(620px, 48vw, 720px)`，顶部版本名/默认状态与发版人/时间，中部多行更新日志，底部原型包/RP 操作和版本操作，保留搜索与每页 10 项分页。

运行代码仅局部修改 `includes/modals.php`、`assets/js/admin.js`、`assets/css/app.css`。保留 11 月 7 日的权限守卫、数据缓存双写、默认/删除后状态同步、品牌色及公共动效；没有整文件恢复、没有改动接口或数据库，没有操作工作区业务记录。Git 交付状态以提交历史为准。

## 丢失过程与恢复依据

来源为 Gemini 会话 `0e1a7fbb-a006-4f22-b175-f8a93e566fb6` 的用户消息、工具参数及成功执行结果，时间均为 UTC+8。没有执行历史命令，也没有拷贝私人会话全文或凭据。

| 时间/步骤 | 证据 |
| --- | --- |
| 11 月 6 日 21:55，step 0 | 用户要求评估版本管理界面 |
| step 38 | 用户确认“按推荐方案吧” |
| 22:00，step 45 | 弹窗由宽表格尺度调整为 620–720px |
| 22:02，step 61 | 表格容器改为 `div.ver-card-list` |
| 22:03，step 67 | 增加卡片、日志区、RP 资产及操作样式；工具返回执行成功 |
| 22:04，step 71 | 行渲染改为 `.ver-card`，含默认版本删除保护；工具返回执行成功 |
| 22:19–22:20，step 200/202 | 补齐搜索框样式与类名 |
| 11 月 7 日 00:06，step 656 | `git checkout assets/css/app.css`；后续整文件回退撤掉卡片样式 |
| 00:20，step 720 | `git checkout assets/js/admin.js`；卡片渲染被撤掉 |

当前 Git 中从 `e84b00c` 已能看到卡片容器，但没有相应卡片渲染和样式；不能将这次问题归咎于 11 月 7 日最后一笔审查修复。恢复前 Chrome 实际读取为 **0 张卡片、10 个表格行、1000px 宽弹窗**；旧表格行塞进 div，日志及操作区域横向溢出，分页按钮也未显示。

## 本轮修改

- 从成功执行的原始差异恢复卡片布局和渲染区块，保留当前其余函数，不恢复旧版完整文件。
- 按当前规范接入公共 `btn-cancel/btn-sm`、`m-badge`、`m-input/m-input-md`、`close-x`；版本域的样式只负责布局、状态与用途。新增样式仅使用既有颜色令牌，按钮按 28px、搜索框按 32px；移除已不用的旧表格/列表样式和重复控件尺寸。
- 保留当前含项目名的标题，长名称/日志可换行；窄屏排列改为上下结构，弹窗保持内部滚动。
- 修正分页写入目标：脚本原来写 `#verPaginationNav`，模板实际为 `#verPaginationBtns`；统一使用已有真实节点。
- 补齐 `#verManageRpInput`。既有 `triggerRpUploadForVersion` 依赖此节点，缺失时点击补传/更换不会打开文件选择；沿用原有分片及 RP 保存流程。
- 不改动默认设置、删除、RP 写入的服务端规则；卡片继续消费当前状态与项目权限。默认版本的前端删除保护按原确认设计恢复，非负责人协作者只能阅读卡片。

## 验证

`Browser plugin not available`；使用已有 Playwright 模块与已安装 Chrome，未添加项目依赖。浏览器在临时新装站点及合成数据上操作，未登录或修改工作区站点。最终 26/26 项通过，页面脚本及控制台错误为 0。Chrome 仍提示同源 iframe 同时含 `allow-scripts/allow-same-origin`；这是 AGENTS 明确保留的受信原型执行模型，本轮未调整其边界。

| 检查 | 实际结果 |
| --- | --- |
| 页面身份/非空/错误覆盖层 | 临时站点标题和版本弹窗正确；有真实内容；截图无错误覆盖层 |
| 渲染与布局 | 10 张卡片、0 个 tr/td；620–720px 桌面宽度；日志换行；按钮共享尺寸 |
| 搜索/分页 | 按版本、发版人、日志筛选；12 项可切至第二页；无匹配为空状态 |
| 默认与删除 | 默认删除按钮受保护；筛选后设默认即时更新；删除后计数、当前筛选与卡片同步 |
| RP | 真实点击移除、补传、更换；通过原有受控下载接口核对更换后内容 |
| 角色 | 管理员可操作；非负责人协作者可读、无有效写操作按钮 |
| 空项目 | “发布首个版本”进入正确项目的发布弹窗 |
| 窄屏 | 390×844 含 RP 操作卡片无横向溢出，弹窗不超出视口 |
| 生产渲染函数专项 | 新增 15 项，通过；覆盖分页真实目标、搜索/权限/空状态及文本转义 |
| 统一回归 | 19/19 套通过，36.07 秒；可识别计数 636，不等同于全部旧套件的精确断言总数 |
| 语法/差异 | PHP 8.3.20 lint、Node 语法、`git diff --check` 通过 |

命令：

```sh
node .dev/tests/version_modal_frontend_regression.js
python3 -B .dev/tests/version_modal_browser.py \
  --php /tmp/protoloft-php-review/php \
  --playwright-module /path/to/playwright
python3 -B .dev/tests/run_all_tests.py --php /tmp/protoloft-php-review/php
```

原有静态测试的“1080px 宽表格”描述只检查了几个 ID，因而在设计已丢失时仍会通过。本轮改为卡片容器描述，并把执行生产渲染函数的专项接入统一入口；独立浏览器专项验证真实 CSS、DOM 和 HTTP 操作，不以函数名或静态类名存在代替验收。

浏览器证据：`/private/tmp/protoloft-version-modal-before.png`、`/private/tmp/protoloft-version-modal-restored.png`、`/private/tmp/protoloft-version-modal-mobile.png`。临时日志在 `.dev/tmp/version-modal-recovery-20261107/`，不提交。

供用户验收的 `http://127.0.0.1:8765/` 返回当前 JS/CSS，HTTP 200 且 SHA-256 与源码一致。用户可强制刷新后打开版本管理。本轮未部署生产、未做 PHP 7.0 实机验收，也不代表用户最终确认。
