#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
立象原型 · ProtoLoft 生产发布包导出工具
用法：python3 .dev/export_release.py

功能：
1. 采用严格生产白名单，从当前工作区提取核心生产文件；
2. 彻底剔除本地测试数据 (database.sqlite, install.lock, sessions, prototypes, chunks)；
3. 彻底剔除开发与测试资料 (.dev, .git, .cursor, .mimosa, AGENTS.md, 日志等)；
4. 在 release/ 下生成解压后的纯净源码目录 release/protoloft/ (供传统 FTP 上传)；
5. 在 release/ 下生成标准的单文件发布包 release/protoloft-v{version}.zip (供宝塔/面板一键解压)；
6. 自动执行纯净度与安全防御自检，并输出 SHA-256 校验和。
"""

import hashlib
import os
import re
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 生产环境根目录白名单文件
ROOT_FILES = [
    'api.php',
    'asset.php',
    'index.php',
    'install.php',
    'mcp.php',
    'share.php',
    '.htaccess',
    '.user.ini',
    'LICENSE',
    'README.md',
    'llms.txt',
]

# 审定的核心模块文件清单（严格白名单，严禁宽泛盲拷，彻底阻断未审定文件与符号链接）
APPROVED_CORE_FILES = [
    'assets/css/app.css',
    'assets/css/bootstrap.min.css',
    'assets/css/remixicon.css',
    'assets/fonts/remixicon.woff2',
    'assets/images/favicon.png',
    'assets/images/favicon.svg',
    'assets/images/logo-dark.png',
    'assets/images/logo-icon.png',
    'assets/images/logo-icon.svg',
    'assets/images/logo.png',
    'assets/images/logo.svg',
    'assets/images/logo.webp',
    'assets/js/admin.js',
    'assets/js/annotation.js',
    'assets/js/app.js',
    'assets/js/echarts.min.js',
    'assets/js/jquery.min.js',
    'assets/js/mcp.js',
    'assets/js/password-strength.js',
    'assets/js/share.js',
    'assets/js/ver-picker.js',
    'assets/js/watermark.js',
    'assets/js/vendor/zxcvbn-ts/core.min.js',
    'assets/js/vendor/zxcvbn-ts/language-common.min.js',
    'assets/js/vendor/zxcvbn-ts/language-en.min.js',
    'assets/js/vendor/zxcvbn-ts/LICENSE.txt',
    'assets/mcp-upload.py.txt',
    'includes/actions/annotations.php',
    'includes/actions/auth.php',
    'includes/actions/items.php',
    'includes/actions/mcp.php',
    'includes/actions/shares.php',
    'includes/actions/system.php',
    'includes/actions/users.php',
    'includes/actions/versions.php',
    'includes/auth.php',
    'includes/collaboration.php',
    'includes/config.php',
    'includes/db.php',
    'includes/login_modal.php',
    'includes/mailer.php',
    'includes/mcp_access.php',
    'includes/mcp_service.php',
    'includes/modals.php',
    'includes/password_policy.php',
    'includes/prototype_context.php',
    'includes/storage.php',
    'includes/views/mcp-guide.php',
    'includes/webhook.php',
    'includes/zip_handler.php',
]

# 私有数据与上传目录仅保留的安全占位与防护规则文件
SECURITY_PLACEHOLDERS = [
    'data/.htaccess',
    'data/index.html',
    'data/index.php',
    'uploads/.htaccess',
    'uploads/index.html',
    'uploads/index.php',
    'uploads/branding/index.html',
]

# 严格黑名单特征（若产物包含任何一项，立即阻断并报警）
FORBIDDEN_PATTERNS = [
    re.compile(r'(^|/)\.dev(/|$)'),
    re.compile(r'(^|/)\.git(/|$)'),
    re.compile(r'(^|/)\.cursor(/|$)'),
    re.compile(r'(^|/)\.mimosa(/|$)'),
    re.compile(r'(^|/)AGENTS\.md$'),
    re.compile(r'(^|/)\.DS_Store$'),
    re.compile(r'\.sqlite($|-wal|-shm)'),
    re.compile(r'(^|/)install\.lock$'),
    re.compile(r'(^|/)install_token\.(php|txt)$'),
    re.compile(r'(^|/)data/sessions(/|$)'),
    re.compile(r'(^|/)data/prototypes(/|$)'),
    re.compile(r'(^|/)data/chunks(/|$)'),
    re.compile(r'\.py$'),  # assets/mcp-upload.py.txt 是 .txt 扩展名，非 .py
    re.compile(r'\.log$'),
    re.compile(r'\.tmp$'),
    re.compile(r'\.bak$'),
    re.compile(r'\.swp$'),
    re.compile(r'(^|/)\.(?!htaccess|user\.ini)[^/]+$'),  # 除 .htaccess 与 .user.ini 外禁止任何隐藏文件
]


def extract_version() -> str:
    config_file = ROOT / 'includes' / 'config.php'
    if not config_file.exists():
        return '3.1.1'
    content = config_file.read_text(encoding='utf-8')
    match = re.search(r"define\('APP_VERSION',\s*'([^']+)'\)", content)
    return match.group(1) if match else '3.1.1'


def sha256_file(filepath: Path) -> str:
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def verify_no_symlinks(path: Path, root: Path):
    """检查 path 自身及其所有向上的父级目录（直到 root），确保任何一级均非符号链接"""
    curr = path
    root_resolved = root.resolve()
    while True:
        if os.path.islink(curr) or curr.is_symlink():
            rel_name = curr.relative_to(root).as_posix() if curr != root else curr.name
            raise RuntimeError(f"纯净度校验失败！路径层级禁止包含符号链接: {rel_name}")
        if curr.resolve() == root_resolved or curr == root or curr.parent == curr:
            break
        curr = curr.parent


def create_deploy_guide(target_dir: Path, version: str):
    guide_content = f"""# 立象原型 · ProtoLoft (v{version}) 生产部署指南

感谢使用立象原型！本目录为 100% 纯净生产发布包，已剥离所有本地测试数据与开发调试文件。

## 一、服务器环境要求
- **PHP**：7.0.0+（推荐 PHP 7.4 或 PHP 8.0~8.3），需开启以下扩展：
  - `pdo_sqlite`（SQLite 3 数据引擎，免配置）
  - `zip`（Axure 与原型解压缩）
  - `mbstring`（多字节字符串处理）
  - `dom`（SVG 图形解析与安全防御）
- **Web 服务器**：Nginx / Apache / IIS / 宝塔面板 / 1Panel
- **写入权限要求**：确保 `data/` 与 `uploads/` 目录具备 Web 进程的写入权限（建议 755 或 775）。

## 二、前置安全加固（重要 · 强烈建议在安装前配置）
- 系统核心私有数据与原型存放在 `data/` 目录，Apache 用户系统已内置 `.htaccess` 全自动阻断 Web 直读。
- **若使用 Nginx / OpenResty**，请在站点配置文件中加入以下规则（兼容根目录与子目录部署），以防止敏感文件被直接下载：
  ```nginx
  location ~ /(data|includes)/ {{
      deny all;
      return 403;
  }}
  location ~* /uploads/.*\\.(rp|php|phtml|phar|py|sh)$ {{
      deny all;
      return 403;
  }}
  ```

## 三、部署方式（任选其一）

### 方式 1：面板一键上传解压（强烈推荐 · 耗时 5 秒）
1. 将 `protoloft-v{version}.zip` 上传到服务器网站根目录；
2. 在宝塔 / 1Panel / cPanel 后台点击 **「解压」** 到当前网站根目录；
3. 浏览器访问 `http://您的域名/install.php` 即可启动 4 步利落全新安装向导。

### 方式 2：传统 FTP 上传
1. 打开 FileZilla / WinSCP 等客户端，连接服务器网站根目录；
2. 进入 `protoloft/` 文件夹，全选所有文件与文件夹，直接拖入服务器根目录上传；
3. 浏览器访问 `http://您的域名/install.php` 即可启动 4 步利落全新安装向导。

## 四、安装与运维说明
- 安装时系统会自动生成一次性安全密钥至 `data/install_token.php`（权限 `0644` 以兼容 FTP 与 PHP 属主分离环境直接读取；若部署在多租户共享宿主机，强烈建议安装前通过环境变量 `PROTOLOFT_INSTALL_TOKEN` 注入自定义 12 位密钥）；
- 安装完成后系统会自动销毁安装密钥并生成 `data/install.lock` 锁定安装。
- 祝协作顺畅！立象以尽意 · 披图而同心。
"""
    (target_dir / 'DEPLOY.md').write_text(guide_content, encoding='utf-8')


def main():
    version = extract_version()
    release_root = ROOT / 'release'
    package_dir = release_root / 'protoloft'
    zip_path = release_root / f'protoloft-v{version}.zip'

    print("=" * 60)
    print(f"立象原型 · ProtoLoft 生产发布包导出器 (v{version})")
    print("=" * 60)

    # 1. 清理旧产物
    if release_root.exists():
        print(f"[1/5] 清理旧发布目录: {release_root.relative_to(ROOT)}...")
        shutil.rmtree(release_root)
    package_dir.mkdir(parents=True, exist_ok=True)

    # 2. 拷贝根目录白名单文件
    print(f"[2/5] 拷贝根目录核心文件 ({len(ROOT_FILES)} 个)...")
    for fname in ROOT_FILES:
        src = ROOT / fname
        if not src.exists():
            raise FileNotFoundError(f"缺少必要核心文件: {fname}")
        verify_no_symlinks(src, ROOT)
        shutil.copy2(src, package_dir / fname)

    # 3. 严格依据已审定清单逐项拷贝核心模块 (拒绝宽泛盲拷、未审定文件与多层级符号链接)
    print(f"[3/5] 依据审定清单拷贝核心模块 ({len(APPROVED_CORE_FILES)} 个)...")
    # 前置安全扫描：若源目录中混入任何文件级或目录级符号链接，立即阻断报警
    for scan_dir in ['assets', 'includes']:
        dir_path = ROOT / scan_dir
        if dir_path.is_dir():
            for root, dirs, files in os.walk(dir_path, followlinks=False):
                for d in dirs:
                    dp = Path(root) / d
                    if os.path.islink(dp) or dp.is_symlink():
                        raise RuntimeError(f"纯净度校验失败！源模块目录禁止包含目录级符号链接: {dp.relative_to(ROOT)}")
                for f in files:
                    fp = Path(root) / f
                    if os.path.islink(fp) or fp.is_symlink():
                        raise RuntimeError(f"纯净度校验失败！源模块目录禁止包含文件级符号链接: {fp.relative_to(ROOT)}")

    for rel in APPROVED_CORE_FILES:
        src = ROOT / rel
        if not src.exists():
            raise FileNotFoundError(f"缺少审定核心模块文件: {rel}")
        verify_no_symlinks(src, ROOT)
        dst = package_dir / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)

    # 4. 创建 data 和 uploads 安全占位
    print(f"[4/5] 初始化纯净防护占位 ({len(SECURITY_PLACEHOLDERS)} 个)...")
    for rel_path in SECURITY_PLACEHOLDERS:
        src = ROOT / rel_path
        verify_no_symlinks(src, ROOT)
        dst = package_dir / rel_path
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src.exists():
            shutil.copy2(src, dst)
        else:
            dst.write_text("<!-- placeholder -->", encoding='utf-8')

    # 生成部署说明文档
    create_deploy_guide(release_root, version)

    # 5. 安全与纯净度扫描校验
    print("[5/5] 执行纯净度与安全防御白名单扫描...")
    expected_files = set(ROOT_FILES + APPROVED_CORE_FILES + SECURITY_PLACEHOLDERS)
    collected_files = []
    for root, _, files in os.walk(package_dir):
        for f in files:
            p = Path(root) / f
            if os.path.islink(p) or p.is_symlink():
                raise RuntimeError(f"纯净度校验失败！产物禁止包含符号链接: {p}")
            rel = p.relative_to(package_dir).as_posix()
            collected_files.append(rel)
            if rel not in expected_files:
                raise RuntimeError(f"纯净度校验失败！发现未审定白名单外的杂质文件: {rel}")
            # 检查是否有非法黑名单文件
            for pat in FORBIDDEN_PATTERNS:
                if pat.search(rel):
                    raise RuntimeError(f"纯净度校验失败！发现违禁文件混入: {rel}")

    if len(collected_files) != len(expected_files):
        raise RuntimeError(f"产物数量不一致！预期 {len(expected_files)} 个，实际收集到 {len(collected_files)} 个")

    print(f"✓ 纯净度扫描通过！共包含 {len(collected_files)} 个生产必备文件。")

    # 6. 生成 ZIP 压缩包
    print(f"正在打包发布压缩包: {zip_path.name}...")
    with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for root, _, files in os.walk(package_dir):
            for f in files:
                p = Path(root) / f
                arcname = p.relative_to(package_dir).as_posix()
                zf.write(p, arcname)

    zip_size_kb = zip_path.stat().st_size / 1024
    zip_sha = sha256_file(zip_path)

    print("=" * 60)
    print("发布包导出成功！")
    print(f"- 纯净目录: {package_dir.relative_to(ROOT)}/ （供传统 FTP 全选上传）")
    print(f"- 压缩包:   {zip_path.relative_to(ROOT)} ({zip_size_kb:.1f} KB，供面板一键解压)")
    print(f"- SHA-256:  {zip_sha}")
    print(f"- 部署说明: {release_root.relative_to(ROOT)}/DEPLOY.md")
    print("=" * 60)


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f"❌ 导出失败: {e}", file=sys.stderr)
        sys.exit(1)
