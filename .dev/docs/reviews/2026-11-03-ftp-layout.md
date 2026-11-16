# FTP 目录整理与清理 · 2026-11-03

## 目标与依据

用户继续直接将项目文件上传 FTP，手动排除 `.dev/`；Git 元数据 `.git/` 也不部署。不新增构建步骤、框架依赖、URL 重写方案或修改站点根目录的要求。

行业资料提供的是分离公开入口和内部代码的原则，而不是适用于所有项目的固定树形目录：

- [PHP-FIG PSR-4](https://www.php-fig.org/psr/psr-4/) 规定命名空间与类文件的加载映射，不规定整个应用必须采用 `public/ + src/`。
- [Slim Web Servers](https://www.slimframework.com/docs/v4/start/web-servers.html) 展示公开目录和前端控制器模式，也明确其站点根目录及重写配置要求。

结合本项目原生 PHP、直接 FTP 部署的约束，采用少量公开入口、集中内部实现和独立开发资料的组织方式。这是按项目部署条件做的取舍，不宣称为强制行业标准。

## 最终职责

| 位置 | 职责 |
| --- | --- |
| `index.php` | 工作台 |
| `api.php` | 网页业务 API |
| `asset.php` | 私有原型资源鉴权与输出 |
| `share.php` | 外部分享 |
| `mcp.php` | MCP 协议及 `?guide=1` 浏览器说明页 |
| `install.php` | 全新安装 |
| `llms.txt` | 公开的 AI 接入概览 |
| `includes/` | 后端实现，`actions/` 为领域处理器，`views/` 为内部页面模板 |
| `assets/` | CSS、JS、字体、图片及用户可下载的上传助手 |
| `data/` | 私有数据库、原型、分片、会话，禁止 Web 直读 |
| `uploads/branding/` | 品牌上传资源 |
| `.dev/` | 测试、报告、开发文档和交接资料，不部署 |

根目录保留原有 `README.md`、`AGENTS.md`、`LICENSE` 和服务器/Git 配置。目录文件不是越少越好；保留独立入口以维持清晰职责和现有调用地址。

## 实际清理

- 本轮整理前根目录 15 个文件，最近一次已提交版本为 11 个；本轮完成后为 13 个。与最近提交相比，新增的资源鉴权和 MCP 接口承担实际功能。
- 删除仓库内无调用引用的旧 `admin.php`，该文件只重定向到主工作台。新版本尚未发布，不保留该旧地址。
- 原 `mcp-guide.php` 的模板移到 `includes/views/mcp-guide.php`，浏览器使用 `mcp.php?guide=1`；浏览器直接访问 `mcp.php` 且 Accept 包含 `text/html` 时也渲染说明页。协议客户端的 JSON/事件流请求继续走原认证和方法校验。
- 更新个人设置链接、返回的 `guide_url`、MCP 说明文本、`llms.txt` 及 README；生产代码没有对旧独立说明页的链接。
- 删除仅剩防护和占位文件的 `uploads/ux/`，同时删除 `UX_PATH` 和初始化建目录逻辑，不删除数据库中的 `ux` 业务空间。
- 移除旧路径的 Git/Nginx 说明；Apache 的开发目录保护从旧 `scratch/` 改为 `.dev/`。保留现有私有目录与上传目录防护。
- Git 忽略 SQLite WAL/SHM、私有原型、分片和会话；开发脚本与报告继续可纳入 Git。
- 保留现有图标与品牌图片回退、第三方静态库和目录防护占位；未因文件名相似而删掉仍被引用的资源。

## 实际验证

独立 PHP 8.3.20 运行时临时保存在项目外 `/tmp/jinshi-php-common/php`，不是站点依赖。`pdo_sqlite`、`zip`、`mbstring` 检查通过。最先尝试的 bulk 运行时未注册 `pdo_sqlite`，安装被正常拦截；更换扩展齐全的 common 运行时后执行以下回归，未修改安装自检。

以下命令在项目根目录执行，所有业务数据均为临时副本中的合成数据：

| 命令 | 通过数量 | 范围 |
| --- | ---: | --- |
| `python3 -B .dev/tests/security_regression.py --php /tmp/jinshi-php-common/php` | 104 | 新装、账号角色、权限、上传、分享、批注、替换与清理 |
| `python3 -B .dev/tests/security_round2_regression.py --php /tmp/jinshi-php-common/php` | 58 | 历史版本隔离、在途 Owner 移交、设置回滚、会话及清理失败 |
| `python3 -B .dev/tests/dashboard_regression.py --php /tmp/jinshi-php-common/php` | 14 | 实际 HTTP 大盘数据与输出 |
| `python3 -B .dev/tests/mcp_collaboration_regression.py --php /tmp/jinshi-php-common/php` | 81 | Bearer 凭据、多角色、发布、协议、批注和归并后的说明页 |
| `python3 -B .dev/tests/ftp_layout_regression.py --php /tmp/jinshi-php-common/php` | 29 | 根目录原样复制，仅排除 `.dev/.git`，核对字节一致后新装及全链路冒烟 |
| `node .dev/tests/security_frontend_regression.js` | 55 | 实际业务 JS，模拟 DOM/网络 |

FTP 副本检查覆盖：不依赖开发文件、新装自动创建私有存储且不再创建旧公开原型目录、Owner/管理员/协作者/审阅人的页面及脚本范围、MCP 元数据、静态资源与上传助手、ZIP 发布、原有资产 URL、匿名拒绝、外部分享、内部路径阻断和源目录未被运行污染。

30 个生产 PHP 文件在 PHP 8.3.20 下语法检查通过；业务与开发 JS/MJS 语法检查、Python 脚本语法/导入检查以及 `git diff --check` 通过。临时日志在 `.dev/tmp/ftp-clean-checks/`，不提交 Git。

边界：没有上传 FTP 或修改线上环境，没有运行 PHP 7.0、生产 Apache/Nginx、官方 MCP SDK 或浏览器验收。HTTP 测试使用 PHP 开发服务器及测试路由器模拟目录访问控制，不能证明生产服务器已加载 `.htaccess` 或 Nginx 配置；服务器仍需满足 README 中原有 PHP 扩展、私有目录和 PATH_INFO 要求。
