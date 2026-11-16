# 2026-11-16 下午更新与邮件找回审核

以开源发布提交 `e52b389` 为基线，审核 `137098c` 至 `9fe2429` 的五笔增量。用户已收到测试邮件和找回密码邮件。本地用临时安装、合成账号与回环 SMTP 复核发信、浏览器交互和异常分支。

## 审核发现

| 优先级 | 发现 | 复现与修复方向 |
| --- | --- | --- |
| P1 | 缺少固定站点地址时，密码重置链接可受请求 `Host` 控制 | 在未配置 `site_base_url` / `PROTOLOFT_BASE_URL` 的站点上，用自定义 `Host` 请求活跃测试账号找回密码。模拟邮箱收到指向该域名的链接，其中令牌可提交到真实站点并改密。线上风险取决于反代是否允许该 Host 到达应用，以及是否配置固定地址。重置邮件始终从可信 HTTPS 地址生成，避免请求头回退。`includes/auth.php:1645`、`includes/config.php:351`。参考 [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)。 |
| P1 | 更换账号邮箱或管理员手动改密后，已发出的旧链接仍可改密 | 先申请链接，再通过正常 `user_update` 改邮箱或手动设置密码。两种情况下旧链接都能改密，改邮箱场景还会把新邮箱回填到旧链接持有者的登录页。令牌校验应绑定签发时的账号安全状态，邮箱变更和改密后同步作废。`includes/auth.php:1630`、`:1675`、`:1722`。 |
| P2 | 工作台登录弹窗在剥离 HTTPS 协议头的反代上无法发送重置邮件 | 用同域 HTTPS Origin 模拟 HTTP 回源。弹窗提交缺少 CSRF token，返回「页面已过期」。带 token 的独立登录页请求在同一站点成功。弹窗应复用公共请求入口的 CSRF 处理。`includes/login_modal.php:448`、`api.php:238`。 |
| P2 | 发信失败会暴露活跃账号 | 把授权码换成错误值后，未登录请求已启用邮箱得到「邮件发送失败」，请求不存在邮箱仍得到通用成功提示。正常发信时也只有已启用账号同步等待 SMTP。公开响应需对齐文案和时延，具体故障保留给管理员。`includes/auth.php:1615`、`:1652`。参考 [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)。 |
| P2 | 通用设置的旧回执会抹掉新输入的 SMTP 授权码 | Chrome 中延迟一笔发件人名称设置的真实响应。在它返回前输入新授权码并保持焦点，旧响应会把输入清空。清空前应比对请求保存的值和当前编辑值，让未保存的草稿保留。`assets/js/admin.js:3937`、`:3997`。 |
| P3 | 中文邮件头可超出 MIME 编码长度上限 | 用表单允许长度内的中文组织名和发件人名发测试邮件，抓到 From 和 Subject 的单个编码词分别长 152 和 136 字符。部分客户端可能显示异常。采用支持分段和折行的 MIME 头编码。`includes/mailer.php:220`。参考 [RFC 2047 第 2 节](https://www.rfc-editor.org/rfc/rfc2047#section-2)。 |
| P3 | 关闭工作台找回密码弹窗后，重新打开仍停在找回页 | Chrome 实测通过工作台弹窗发信后，关闭并按 `openLoginModal('login')` 重开，仍保留上次找回面板。后加载的公共同名函数覆盖了模板中的面板初始化。`assets/js/app.js:1354`、`includes/login_modal.php:160`。 |

额外边界来自源码检查。两档邮箱频控最终都拼接客户端 IP，跨 IP 对同一邮箱会使用不同计数。重置表同时定义在初始 Schema 和认证请求的运行期 DDL，需按项目的一次定稿约定收口。`includes/auth.php:947`、`:1526`、`:1602`。

## 验证记录

- `git diff --check e52b389..9fe2429` 与 `node --check assets/js/admin.js` 通过。`python3 -B .dev/tests/run_all_tests.py --php /Users/yyy/.local/bin/php` 在 PHP 8.3.20 下 24 套通过，共 1,066 项可识别断言，含邮件回归 42 项和 9 个 PHP 文件语法检查。
- `python3 -B .dev/tmp/afternoon-mail-review-20261116/probe.py` 完成 HTTP 与 Chrome 两阶段，共 36 项观察吻合，含上述故障复现。覆盖测试邮件、启用找回、独立登录页与工作台弹窗、收到邮件后打开链接、邮箱回填、两次密码不一致、改密后重新登录、旧密码与旧会话拒绝、令牌过期与重放、清除授权码。过期由临时数据库时间戳模拟。
- `python3 -B .dev/tmp/afternoon-mail-review-20261116/smtp_tls.py` 完成 6 项观察，含邮件头长度实测。隐式 TLS、STARTTLS 均通过本地自建可信证书握手、认证并成功提交邮件。隐式 TLS 拒绝不受信证书，STARTTLS 拒绝与服务器地址不匹配的证书。
- `python3 -B .dev/tmp/afternoon-mail-review-20261116/afternoon_ui.py` 的其余下午改动 Chrome 烟雾测试 9 项通过。协作者申请进入待审批列表并被正确预选，管理员可改批审阅人。上版日志可换行追加，切到无版本项目时按钮隐藏。真实 ECharts 验证堆叠顺序、零数据角色描边隐藏及 30 天切换，并观察了桌面截图。反代会话、分享凭据和群通知载荷由全量 HTTP 与前端回归覆盖。
- Browser 插件未提供，使用本机 Playwright 与 Chrome。邮件设置页面在 1440×1000，找回密码页面在 390×844。上述邮件流程无浏览器脚本或控制台错误，已观察密码表单、改密后的登录提示及邮件设置截图。截图与专项日志位于 `.dev/tmp/afternoon-mail-review-20261116/`。

线上 SMTP 参数、反向代理、邮箱客户端渲染和 PHP 7.0 仍待部署环境验证。所有发信与改密操作均在本地合成环境执行。

## 修复复核

- 邮件找回只使用 `PROTOLOFT_BASE_URL` 或系统设置里的固定站点地址。生产填写含子目录的完整 HTTPS 地址，本机测试可显式使用回环 HTTP 地址。SMTP 测试发送独立可用。已发出的旧格式链接会在升级后失效，成员可重新申请。令牌哈希写入现有 `settings` 表，每账号一条，无需升级数据库结构。更改邮箱、密码或成员启用状态时在同一事务内作废令牌。重置页面关闭 Referer 转发。
- 找回请求按 IP 和邮箱全局分别限流。账号查找和 SMTP 在公开响应发送后执行，管理员的测试邮件仍返回具体发送错误。模拟 SMTP 卡住 5 秒时，客户端提前收到通用回执。工作台弹窗走公共 CSRF 请求，重开回到登录面板。慢响应只清掉该响应确认保存的授权码。
- 五种预设统一填入服务器、SSL/TLS 和 465。账号和授权码由管理员输入。首次配置显示自定义，手动修改连接参数会回到自定义。换服务器或发信邮箱时旧授权码不沿用。阿里预设改用 `smtp.qiye.aliyun.com`，既有 `smtp.mxhichina.com` 配置保留。网易企业邮箱参照 [华为客户端配置说明](https://consumer.huawei.com/cn/support/content/zh-cn16081272/)，网易个人邮箱、腾讯企业邮箱和 QQ 邮箱参照 [腾讯 CloudBase 配置说明](https://intl.cloud.tencent.com/zh/document/product/1266/71700)，阿里企业邮箱参照 [阿里云配置说明](https://help.aliyun.com/zh/document_detail/36576.html)。
- `python3 -B .dev/tests/run_all_tests.py --php /Users/yyy/.local/bin/php` 通过 24 套、1,077 项可识别断言，邮件专项 53 项。Chrome 临时站 30 项通过，包括全部五种预设、旧响应保留授权码草稿及收到邮件后改密。模拟 SMTP 验证 MIME 邮件头换行和原文解码。
- 本机对五个预设的 465 端口实测 TLS 1.3，使用 macOS 系统 CA 校验证书和主机名，五个均返回 SMTP `220`。验证止于连接，第三方账号认证与实际投递、线上 FTP 站点和 PHP 7.0 待验证。
