# 立象原型 · ProtoLoft

<p align="center">
  <img src="assets/images/logo.svg" alt="立象原型 · ProtoLoft" width="340" />
</p>

<p align="center">
  <strong>立象以尽意 · 披图而同心</strong> &nbsp;|&nbsp; <em>Give ideas a shared home.</em><br>
  <span>专为产品与设计团队打造的轻量级、自托管原型托管、版本管理与评审协作平台</span>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/PHP-≥%207.0.0-777bb4.svg?style=flat-square" alt="PHP Version" />
  <img src="https://img.shields.io/badge/Database-SQLite%203-003b57.svg?style=flat-square" alt="SQLite 3" />
  <img src="https://img.shields.io/badge/Dependencies-Zero%20External-16a34a.svg?style=flat-square" alt="Zero Dependencies" />
  <img src="https://img.shields.io/badge/Architecture-Self--Hosted-0284c7.svg?style=flat-square" alt="Self-Hosted" />
  <img src="https://img.shields.io/badge/License-MIT-gray.svg?style=flat-square" alt="MIT License" />
</p>

---

## 💡 为什么选择立象原型 (ProtoLoft)？

在日常产品研发流程中，Axure 官方的 **Axure Cloud (原 AxShare)** 虽方便，但在国内及中大型团队场景下普遍面临明显痛点：
- **访问速度缓慢**：官方服务器位于海外，原型加载大包时常出现资源断流或长时间白屏；
- **数据隐私与合规**：企业未发布的原型属核心商业资产，放公有云可能存在合规风险；
- **团队协作与多版本管理割裂**：老旧的自建方式往往是简单架设 Nginx 静态目录，导致链接泛滥、版本无法折叠归档、历史演进追溯极其困难。

**立象原型 · ProtoLoft** 专为解决上述痛点而生：**纯原生 PHP + 单文件 SQLite 构建，零 Docker 依赖、零外部编译、FTP 上传即跑**。它不仅是原型托管平台，更是一个具备完整版本管理、权限隔离、受控外发分享与批注评审的团队协作工作台。

| 对比维度 | 官方 Axure Cloud | 普通静态目录 (Nginx/FTP) | **立象原型 · ProtoLoft** |
| :--- | :--- | :--- | :--- |
| **部署难度** | SaaS 托管（无法私有化） | 简单，但需手动配规则 | **极简向导，FTP 上传即跑** |
| **网络体验** | 海外节点，加载偶发卡顿 | 取决于内网速度 | **内网/本地高速秒开，字体源头净化** |
| **多版本管理** | 平铺展示，难以收敛 | 手动改文件夹命名，链接错乱 | **单项目单行收纳，下拉自由切换版本** |
| **外发客户安全** | 仅支持简单公开密码 | 无鉴权，直链易泄漏 | **双轨制：默认主链 + 独立客户受控短链** |
| **RP 源文件管理** | 需额外网盘同步 | 无集中归档与下载鉴权 | **发版同步归档，受控流式鉴权下载** |
| **商业成本** | 按坐席持续订阅付费 | 免费 | **完全开源，商用友好 (MIT)** |

---

## 🌟 核心特性

### 1. 现代化三层资产体系与极简心智
- **标准资产层级**：`文件夹 (Folder) → 项目 (Project) → 版本 (Version) 与 外部链接 (Link)`，契合桌面操作系统级直觉认知；
- **全局 `+` 快速创建入口**：遵循业务操作频率科学排布：`发布版本` → `新建项目` → `新建链接` → `新建文件夹`，一键呼出对应模态弹窗；
- **多版本折叠收纳**：单个项目仅占左侧栏一行，默认展示最新默认版本，下拉自由切换历史版本，彻底告别左侧导航树无限拉长。

### 2. 双轨制原型分享系统 (团队协作 & 商业外发彻底解耦)
- **团队默认主链**：用于内部日常对齐与团队评审，支持一键启停；
- **专属外发短链 (Custom Share)**：
  - 针对外部客户或特定汇报对象创建专属短链（如 `share.php?s=aB3x9Q`）；
  - **独立密码与有效期**：支持自定义访问密码，支持按天限制有效期或设为长期有效；
  - **随时一键吊销**：外发项目完结后可单点注销或修改，完全不影响团队主链与其它客户。

### 3. 前后台合一沉浸式工作台
- **原地激活管理模式**：登录后直接在当前工作台原地进入维护状态，无需跳转割裂的传统后台；
- **无感拖拽排序**：文件夹与项目均支持拖动手柄上下拖拽，松手毫秒级自动持久化存库；
- **一键显隐控制**：点击 👁️ 图标快速隐藏维护中项目（隐藏后普通访客不可见）；
- **URL Hash 联动精准直达**：点击任意项目或切换版本自动同步浏览器地址栏（如 `#item=5&v=V2.0`），复制网址直接发给同事即可精准定位该项目该版本。

### 4. 零依赖绿色架构与源头净化
- **单文件 SQLite 驱动**：所有设置、用户、版本元数据保存在单文件数据库中，免安装配置 MySQL，迁移仅需拷走目录；
- **Google Fonts 源头秒级清洗**：上传解压时自动深度扫描 HTML/CSS，一键净化无用外链字体，内网/离线访问 0 毫秒首屏秒开；
- **RP 设计底稿集中归档**：发布版本时支持同步上传 `.rp` 工程文件，支持受控流式鉴权下载，严禁暴露静态直链。

### 5. 全自动安全防御体系
- **服务端资源鉴权**：原型和 RP 保存在私有 `data/prototypes/` 中；预览经 `asset.php` 校验登录或分享凭据，RP 只经下载 API 提供；分享停用、作废、到期及改密后，已有分享预览凭据失效；
- **解压边界硬核防护**：严密防御 Zip-Slip 目录穿越、符号链接提权以及 500MB 解压炸弹；
- **物理权限硬隔离**：`uploads/` 上传目录内置多层防护规则，全量阻断一切 PHP 等动态脚本执行。

---

## MCP 与评审协作

在「个人设置 → MCP 接入」创建个人凭据并复制客户端配置，即可让支持 HTTP 授权头的 AI 客户端读取原型、批注和更新日志，编写测试用例；允许发布的凭据还可以上传 ZIP/RP 并发布版本。同名替换需要明确确认。平台无需内置大模型或安装 Node。

Webhook 的批注通知可经登录直达具体版本、页面和批注。同名更新保留批注原页面文字并提示复核；新版本可显式引用上一版未解决批注。

接入方式见 [MCP 指南](mcp.php?guide=1)。当前为个人 Bearer 凭据，不提供 OAuth；原型读取是静态上下文，不代表运行或测试原型。

---

## 📁 目录结构

```text
protoloft/
├── .dev/                          <-- 本地开发资料，不上传 FTP
├── assets/                        <-- 静态资源库 (100% 离线自给自足)
│   ├── css/                       <-- Linear 风格现代化设计令牌与样式表
│   ├── js/                        <-- 前端轻量交互脚本库
│   ├── fonts/                     <-- 图标字体文件 (RemixIcon)
│   └── images/                    <-- 官方纯矢量品牌资产 (logo.svg / logo-icon.svg / favicon.svg)
├── data/                          <-- 私有数据目录，必须禁止 Web 直读
│   ├── prototypes/                <-- 按项目 ID 与随机标识隔离的原型和 RP
│   ├── chunks/                    <-- 按上传者隔离的临时切片
│   ├── database.sqlite            <-- 单文件 SQLite 数据库 (自动初始化)
│   └── install.lock               <-- 安装安全锁
├── includes/                      <-- 核心后端逻辑
│   ├── config.php                 <-- 基础路径与常量配置
│   ├── db.php                     <-- SQLite 驱动与建表逻辑
│   ├── auth.php                   <-- 权限鉴权与安全会话管理
│   ├── zip_handler.php            <-- ZIP 深度流式解压、入口自识别与字体净化
│   └── modals.php                 <-- 就地管理全套原生模态框
├── uploads/                       <-- 静态资源安全上传目录
│   ├── branding/                  <-- 静态展示资产目录
│   └── .htaccess                  <-- 静态安全防御配置
├── api.php                        <-- 统一轻量 JSON RESTful API
├── index.php                      <-- 沉浸式工作台主页面
├── install.php                    <-- WordPress 风格一键图形化安装向导
├── asset.php                      <-- 原型资源鉴权入口 (需支持 PATH_INFO)
├── mcp.php                        <-- MCP 接口与接入说明 (?guide=1)
├── llms.txt                       <-- 公开的 AI 接入说明
└── share.php                      <-- 专属分享安全展示网关
```

---

## 🚀 极速部署指南

### 环境要求
- **Web 服务器**：支持 PHP PATH_INFO 的 Apache 或 Nginx；其他服务器需配置等价的私有目录保护与 PATH_INFO 路由
- **PHP 运行环境**：原生 **PHP ≥ 7.0.0**
- **必须扩展**：`pdo_sqlite`、`zip`（ZipArchive）、`mbstring`

### 1. 首次安装向导
1. 将项目文件上传至您的 Web 站点根目录，排除 `.dev/` 和 `.git/`；
2. 确保 `data/` 与 `uploads/` 目录具备可写权限（Linux 下建议 `chmod -R 755 data uploads`）；
3. 浏览器访问站点域名（例如 `http://your-domain.com/`），系统会自动引导进入 `install.php`；
4. 页面将自动进行环境自检，输入站点名称、管理员账号密码，点击 **“立即开始安装”** 即可秒级完成初始化！

### 2. 日常发版与使用
1. 访问工作台主页，点击左下角登录协作者或管理员账号；
2. 点击左侧栏顶部 **`+`** 快速创建菜单，选择 **“发布版本”**；
3. 选择目标项目，拖入导出的原型 `.zip` 压缩包（可选附带 `.rp` 源文件），填写版本号（如 `V1.0`）；
4. 点击发布，系统将自动解压、自识别 `start.html` / `index.html` 入口并更新生效。

### 3. 数据备份与迁移
由于采用零外部服务依赖架构，全站所有配置、权限、文件夹、项目与版本记录均存储于 `data/database.sqlite`：
- **备份**：只需备份 `data/` 目录与 `uploads/` 目录即可；
- **迁移**：整站打包上传至新服务器，直接可跑，无需导出/导入任何 SQL 脚本。

---

## 🔒 生产环境访问控制 (Nginx 配置)

如果您使用的是 Nginx 服务器，必须在站点的 `server { ... }` 配置块中加入以下防护规则（Apache 环境已由自带的 `.htaccess` 自动接管）：

```nginx
# 1. 严禁外部直连下载 SQLite 数据库与锁文件
location ^~ /data/ {
    deny all;
    return 403;
}

# 2. 禁止直接访问业务实现与临时测试目录
location ~ ^/(includes|\.dev|\.git)(/|$) { deny all; }

# 3. 品牌上传目录禁止脚本执行和 RP 下载
location ~* ^/uploads/.*\.(php|phtml|phar|rp)$ { deny all; }

# 4. 原型入口保留 PATH_INFO。替换 fastcgi_pass 为实际 PHP-FPM 地址。
# 此规则应位于其他 PHP 正则 location 之前；子目录部署需对应调整前缀。
location ~ ^/asset\.php(?:/|$) {
    fastcgi_split_path_info ^(.+\.php)(/.*)$;
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    fastcgi_param PATH_INFO $fastcgi_path_info;
    fastcgi_pass unix:/run/php/php-fpm.sock;
}
```

PATH_INFO 参数说明参见 [Nginx 官方文档](https://nginx.org/en/docs/http/ngx_http_fastcgi_module.html#fastcgi_split_path_info)。Apache 需允许随包 `.htaccess` 生效，支持 `AcceptPathInfo On`。

---

## 📄 开源许可证

本项目采用 **[MIT License](LICENSE)** 协议开源，允许任何个人或企业免费商业使用、修改与分发。

本版本尚未发布，只支持全新安装。无需历史升级补丁或旧版上传接口。上传原型的内部成员应受信任：为保留 Axure 交互与批注上下文，原型脚本与宿主保持同源；不应将此平台作为不受信任代码的运行环境。
