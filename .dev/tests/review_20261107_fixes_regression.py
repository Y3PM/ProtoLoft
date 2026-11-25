#!/usr/bin/env python3
"""立象原型 (ProtoLoft) - 2026-11-07 审查发现问题专项回归测试套件
Review Fixes Comprehensive Regression Test Suite

覆盖验证范围:
1. P1-A/B: 外链 URL 特殊字符 (' ) </script>) 渲染安全、属性注入防御与编辑按钮可用性
2. P1-F3: 集中批注读取鉴权 (访客持 V2 授权读 V1 批注被拒、perm_guest_annotate=0 时 annotation_target 被拒、成员侧不受影响)
3. P2-1: 版本管理弹窗设默认/删除版本后本地快照与 DOM 一致性
4. P2-2: index.php 正确下发 SYS_HAS_GLOBAL_WEBHOOK 状态
5. P2-3: MCP 指定项目清空选择时不静默保存并阻止提交
6. P3 可选低成本项: 空版本占位符 NaN 消除、share.php 内联脚本 JSON_HEX_* 转义、install 权限收紧
"""
import argparse
import contextlib
import http.cookiejar
import io
import json
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import uuid
import zipfile
import sqlite3

ROOT = Path(__file__).resolve().parents[2]
PASS_WORD = 'Proto-Loft-Password-2026'

class TestClient:
    def __init__(self, base_url):
        self.base = base_url.rstrip('/')
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.token = ''
        self.user = None

    def request(self, path, fields=None, files=None, headers=None):
        headers = dict(headers or {})
        data = None
        if files:
            boundary = 'protoloft_boundary_' + uuid.uuid4().hex
            parts = []
            if fields:
                for key, val in fields.items():
                    parts.extend([
                        ('--' + boundary + '\r\nContent-Disposition: form-data; name="' + str(key) + '"\r\n\r\n').encode('utf-8'),
                        str(val).encode('utf-8'),
                        b'\r\n'
                    ])
            for key, (filename, content) in files.items():
                parts.extend([
                    ('--' + boundary + '\r\nContent-Disposition: form-data; name="' + str(key) + '"; filename="' + str(filename) + '"\r\nContent-Type: application/octet-stream\r\n\r\n').encode('utf-8'),
                    content if isinstance(content, bytes) else str(content).encode('utf-8'),
                    b'\r\n'
                ])
            parts.append(('--' + boundary + '--\r\n').encode('utf-8'))
            data = b''.join(parts)
            headers['Content-Type'] = 'multipart/form-data; boundary=' + boundary
        elif fields is not None:
            data = urllib.parse.urlencode(fields).encode('utf-8')
            headers['Content-Type'] = 'application/x-www-form-urlencoded'

        if self.token:
            headers['X-CSRF-Token'] = self.token

        req = urllib.request.Request(self.base + path, data=data, headers=headers)
        try:
            with self.opener.open(req, timeout=25) as resp:
                content = resp.read()
                text = content.decode('utf-8', errors='ignore')
                try:
                    body = json.loads(text)
                except Exception:
                    body = None
                return resp.status, body, text
        except urllib.error.HTTPError as error:
            content = error.read()
            text = content.decode('utf-8', errors='ignore')
            try:
                body = json.loads(text)
            except Exception:
                body = None
            return error.code, body, text

    def api(self, action, fields=None, files=None, csrf=True, headers=None):
        headers = dict(headers or {})
        read_only = {'get_session', 'user_list', 'download_rp', 'item_get_share', 'log_list', 'list_annotations', 'annotation_target', 'previous_annotations'}
        if fields is None and files is None and action in read_only:
            status, body, text = self.request('/api.php?' + urllib.parse.urlencode({'action': action}), headers=headers)
        else:
            fields = dict(fields or {})
            fields['action'] = action
            if csrf and self.token:
                fields['csrf_token'] = self.token
                headers['X-CSRF-Token'] = self.token
            status, body, text = self.request('/api.php', fields=fields, files=files, headers=headers)
        return body

    def login(self, email, password):
        body = self.api('login', {'email': email, 'password': password}, csrf=False)
        assert body and body.get('success'), f"登录失败: {body}"
        session_info = self.api('get_session').get('data', {})
        self.user = session_info.get('user')
        self.token = session_info.get('csrfToken') or session_info.get('csrf_token') or ''
        return self.user

    def install(self, admin_email='admin@example.com', admin_name='超管', password=PASS_WORD, install_token=''):
        status, _, text = self.request('/install.php')
        match = re.search(r'name="csrf_token" value="([^"]+)"', text)
        csrf = match.group(1) if match else ''
        status, body, text = self.request('/install.php', {
            'csrf_token': csrf,
            'install_token': install_token,
            'site_title': '审查回归测试站',
            'admin_email': admin_email,
            'admin_name': admin_name,
            'admin_password': password,
            'admin_password_confirm': password
        })
        return status in (200, 302)


def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


@contextlib.contextmanager
def run_test_server(php_bin):
    temp_dir = tempfile.mkdtemp(prefix='protoloft_review_test_')
    port = find_free_port()
    proc = None
    try:
        # 复制生产源码到临时沙箱，排除 .git 和 .dev
        for item in ROOT.iterdir():
            if item.name in {'.git', '.dev', 'data'}:
                continue
            dst = Path(temp_dir) / item.name
            if item.is_dir():
                shutil.copytree(item, dst, ignore=shutil.ignore_patterns('.git*', 'node_modules'))
            else:
                shutil.copy2(item, dst)

        (Path(temp_dir) / 'data').mkdir(parents=True, exist_ok=True)
        (Path(temp_dir) / 'uploads' / 'branding').mkdir(parents=True, exist_ok=True)

        cmd = [php_bin, '-S', f'127.0.0.1:{port}', '-t', temp_dir]
        proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # 等待服务就绪
        base_url = f'http://127.0.0.1:{port}'
        ready = False
        for _ in range(50):
            try:
                with urllib.request.urlopen(base_url + '/install.php', timeout=1) as resp:
                    if resp.status == 200:
                        ready = True
                        break
            except Exception:
                time.sleep(0.1)

        if not ready:
            raise RuntimeError("PHP 内置测试服务器启动超时")

        yield base_url, Path(temp_dir)
    finally:
        if proc:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except Exception:
                proc.kill()
        shutil.rmtree(temp_dir, ignore_errors=True)


def run_tests(php_bin):
    assertions = 0

    def assert_eq(a, b, msg):
        nonlocal assertions
        assert a == b, f"{msg} (实际: {a!r}, 期望: {b!r})"
        assertions += 1
        print(f"  ✓ PASS: {msg}")

    def assert_true(expr, msg):
        nonlocal assertions
        assert bool(expr), msg
        assertions += 1
        print(f"  ✓ PASS: {msg}")

    print("[*] 开始执行 2026-11-07 审查发现问题专项回归测试")

    # ==========================
    # 模块 1: 前端静态代码特征与安全防线验证
    # ==========================
    print("\n--- 1. 前端注入防护与安全语法回归 ---")
    app_js_text = (ROOT / 'assets' / 'js' / 'app.js').read_text(encoding='utf-8')
    admin_js_text = (ROOT / 'assets' / 'js' / 'admin.js').read_text(encoding='utf-8')
    mcp_js_text = (ROOT / 'assets' / 'js' / 'mcp.js').read_text(encoding='utf-8')
    share_php_text = (ROOT / 'share.php').read_text(encoding='utf-8')
    index_php_text = (ROOT / 'index.php').read_text(encoding='utf-8')
    install_php_text = (ROOT / 'install.php').read_text(encoding='utf-8')

    # P1-A: app.js 复制按钮不再内联 onclick 拼接
    assert_true('btn-copy-link' in app_js_text and 'data-copy-url=' in app_js_text, "app.js 外链落地卡片采用 data-copy-url 与 btn-copy-link 委托")
    assert_true("copyTextToClipboard('" not in app_js_text.split("safeName = esc(name")[1].split(").show()")[0], "app.js 外链卡片严禁在 onclick 中拼 safeHref")

    # P1-A: admin.js 复制外链按钮与编辑按钮改用委托
    assert_true('btn-copy-url' in admin_js_text and 'data-url=' in admin_js_text, "admin.js 复制外链按钮采用 data-url 与 btn-copy-url 委托")
    assert_true(".attr('onclick', 'openEditItemModal(" not in admin_js_text, "admin.js 严禁用 .attr('onclick') 写入未解码 JSON 实体")
    assert_true("btn-edit-item-trigger" in admin_js_text and "data-item-json" in admin_js_text, "admin.js 编辑项目统一采用事件委托与 data-item-json 传递")

    # P1-A: 文件夹表格新建行防注入
    assert_true("btn-edit-cat-trigger" in admin_js_text and "btn-delete-cat-trigger" in admin_js_text, "admin.js 新建文件夹行采用 data 属性与事件委托")

    # P2-1: 版本管理弹窗无幽灵选择器
    assert_true("#verManageList" not in admin_js_text, "admin.js 彻底消除已不存在的 #verManageList 幽灵选择器")
    assert_true(".btn-ver-default-action" not in admin_js_text, "admin.js 彻底消除 .btn-ver-default-action 幽灵选择器")

    # P2-2: index.php 读取 global_webhook_url
    assert_true("Auth::getSetting('global_webhook_url'" in index_php_text, "index.php 正确读取 global_webhook_url 供前端发版通知判定")

    # P2-3: mcp.js 空选项目拦截
    assert_true("请至少选择一个项目，或切换为「全部项目」模式" in mcp_js_text, "mcp.js 在自定义模式空选时提示并阻止提交")

    # P2-4: admin.js handleItemSave 双写缓存
    assert_true("$row.data('cat-id', itemCatId).attr('data-cat-id', itemCatId)" in admin_js_text, "admin.js handleItemSave 必须实现 data 与 attr 双写")

    # P3: NaN 文本消除与 JSON_HEX 转义
    assert_true("</div>' + +" not in app_js_text, "app.js 彻底消除 + + 拼接导致 NaN 文本缺陷")
    assert_true("JSON_HEX_TAG" in share_php_text and "JSON_HEX_AMP" in share_php_text, "share.php 内联脚本补齐 JSON_HEX_* 掩码")
    assert_true("includes/mcp_panel.php" not in [str(p.relative_to(ROOT)) for p in ROOT.rglob('*mcp_panel.php')], "无引用死文件 includes/mcp_panel.php 已彻底移除")
    assert_true("@mkdir(DATA_PATH, 0755, true)" in install_php_text, "install.php 目录权限收紧为 0755")
    assert_true("安装过程异常: ' . $e->getMessage()" not in install_php_text, "install.php 异常消息不再向外部直接回显系统底层错误")

    # ==========================
    # 模块 2: 真实 HTTP 服务端鉴权与业务隔离回归
    # ==========================
    print("\n--- 2. 真实 HTTP 服务端批注集中鉴权回归 ---")
    with run_test_server(php_bin) as (base_url, sandbox_dir):
        client = TestClient(base_url)
        # 1. 执行安装
        token_p = (sandbox_dir / 'data' / 'install_token.php')
        if not token_p.exists(): token_p = (sandbox_dir / 'data' / 'install_token.txt')
        install_token = token_p.read_text().splitlines()[-1].strip()
        ok = client.install(install_token=install_token)
        assert_true(ok, "测试站安装初始化成功")

        # 2. 管理员登录
        admin_user = client.login('admin@example.com', PASS_WORD)
        assert_eq(admin_user['role'], 'admin', "管理员登录身份为 admin")

        # 3. 创建测试分类与项目
        cat_res = client.api('category_save', {'name': '审查回归目录'})
        assert_true(cat_res.get('success'), "创建分类成功")
        cat_id = cat_res['data']['id']

        item_res = client.api('item_save', {'name': '批注安全测试项目', 'category_id': cat_id, 'type': 'project'})
        assert_true(item_res.get('success'), "创建原型项目成功")
        item_id = item_res['data']['id']

        # 辅助切片上传方法
        def upload_chunked_file(cl, file_bytes, file_type='zip'):
            upload_id = uuid.uuid4().hex
            chunk_size = 64 * 1024
            total_chunks = (len(file_bytes) + chunk_size - 1) // chunk_size or 1
            for idx in range(total_chunks):
                chunk = file_bytes[idx * chunk_size : (idx + 1) * chunk_size]
                res = cl.api('upload_chunk', {
                    'upload_id': upload_id,
                    'file_type': file_type,
                    'chunk_index': idx,
                    'chunk_total': total_chunks
                }, files={'chunk_data': (f'chunk_{idx}', chunk)})
                assert res.get('success'), f"切片上传失败: {res}"
            return upload_id

        def make_zip(text):
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
                zf.writestr('index.html', text.encode('utf-8'))
            return buf.getvalue()

        # 4. 发布版本 V1 并发表批注
        v1_upload_id = upload_chunked_file(client, make_zip('<h1>Proto V1</h1>'))
        v1_res = client.api('version_publish', {
            'item_id': item_id,
            'version_name': 'V1.0',
            'changelog': '第一版上线',
            'entry_file': 'index.html',
            'zip_upload_id': v1_upload_id,
            'is_default': 0
        })
        assert_true(v1_res.get('success'), "发布版本 V1 成功")
        v1_id = v1_res['data']['id']

        # 在 V1 发表批注
        anno1_res = client.api('add_annotation', {
            'item_id': item_id,
            'ver_id': v1_id,
            'page_path': 'index.html',
            'page_title': '首页',
            'content': 'V1 内部核心敏感需求批注内容-机密'
        })
        assert_true(anno1_res.get('success'), "在 V1 发表批注成功")
        anno1_id = anno1_res['data']['id']

        # 5. 发布版本 V2
        v2_upload_id = upload_chunked_file(client, make_zip('<h1>Proto V2</h1>'))
        v2_res = client.api('version_publish', {
            'item_id': item_id,
            'version_name': 'V2.0',
            'changelog': '第二版上线',
            'entry_file': 'index.html',
            'zip_upload_id': v2_upload_id,
            'is_default': 1
        })
        assert_true(v2_res.get('success'), "发布版本 V2 成功")
        v2_id = v2_res['data']['id']

        # 在 V2 发表批注
        anno2_res = client.api('add_annotation', {
            'item_id': item_id,
            'ver_id': v2_id,
            'page_path': 'index.html',
            'page_title': '首页',
            'content': 'V2 访客公开批注'
        })
        assert_true(anno2_res.get('success'), "在 V2 发表批注成功")
        anno2_id = anno2_res['data']['id']

        # 6. 为该项目开启外发分享，并生成仅授权 V2 的专属分享（或创建单版本分享）
        # 开启访客批注权限
        client.api('save_role_permissions', {'perm_guest_annotate': '1'})

        # 创建针对 V2 的专属分享短链
        share_res = client.api('share_code_create', {
            'item_id': item_id,
            'ver_id': v2_id,
            'label': '仅看V2专属分享',
            'access_password': 'v2pass',
            'expire_preset': 'forever'
        })
        assert_true(share_res.get('success'), f"创建针对 V2 的专属分享短链成功: {share_res}")
        share_code = share_res['data']['code']

        # 7. 模拟免登录外部访客
        guest_client = TestClient(base_url)
        # 访客通过短链验证访问口令
        verify_status, verify_body, verify_text = guest_client.request(f'/share.php?s={share_code}', {
            'project_password': 'v2pass'
        })
        # 访问分享主页以激活 grantShareAccess
        _, _, page_text = guest_client.request(f'/share.php?s={share_code}')
        assert_true('var currentVerId = ' in page_text, "访客成功进入专属分享主页")

        # 提取访客会话中的 CSRF Token
        token_match = re.search(r'(?:window\.CSRF_TOKEN\s*=|var currentToken\s*=)\s*"([^"]+)"', page_text)
        if token_match:
            guest_client.token = token_match.group(1)

        # 8. 核心守卫断言 (P1-F3): 访客持有 V2 分享授权，调用 previous_annotations 读取上一版本批注
        guest_prev_status, guest_prev_body, _ = guest_client.request(f'/api.php?action=previous_annotations&ver_id={v2_id}')
        assert_true(guest_prev_body.get('success'), "previous_annotations 正常返回协议包")
        assert_eq(len(guest_prev_body['data']['list']), 0, "访客无权跨版本读取 V1 批注正文，返回 list 必须为空")
        assert_eq(guest_prev_body['data']['version_name'], '', "访客未授权 V1，version_name 必须置空不泄露")

        # 对照验证: 已登录成员访问 previous_annotations，必须正常返回 V1 批注
        member_prev = client.api('previous_annotations', {'ver_id': v2_id})
        assert_true(member_prev.get('success'), "成员访问 previous_annotations 成功")
        assert_eq(len(member_prev['data']['list']), 1, "成员有权读取 V1 上期未决批注")
        assert_eq(member_prev['data']['list'][0]['content'], 'V1 内部核心敏感需求批注内容-机密', "成员能看到 V1 批注正文")

        # 9. 核心守卫断言 (P1-F3 + Q1/R1): 访客不能越权读取管理员内部批注；且仅当 perm_guest_annotate=1 时可读自己批注
        g_target_internal_status, g_target_internal, _ = guest_client.request(f'/api.php?action=annotation_target&id={anno2_id}')
        assert_eq(g_target_internal.get('success'), False, "Q1/R1: 即使开启访客批注，访客仍不可按编号读取内部批注")

        g_own_res = guest_client.api('add_annotation', {
            'item_id': item_id,
            'ver_id': v2_id,
            'page_path': 'index.html',
            'page_title': '首页',
            'content': '访客自身批注验证开关',
            'guest_name': '访客甲'
        })
        assert_true(g_own_res.get('success'), f"开启访客批注时访客发表自身批注成功: {g_own_res}")
        guest_anno2_id = g_own_res['data']['id']

        g_target_v2_status, g_target_v2, _ = guest_client.request(f'/api.php?action=annotation_target&id={guest_anno2_id}')
        assert_true(g_target_v2.get('success'), "开启访客批注时，访客可读取本人发表的授权版本批注")

        # 管理员关闭访客批注开关 perm_guest_annotate = 0
        client.api('save_role_permissions', {'perm_guest_annotate': '0'})

        # 再次请求自身 V2 批注 target: 必须被集中鉴权拒绝
        g_blocked_status, g_blocked_body, _ = guest_client.request(f'/api.php?action=annotation_target&id={guest_anno2_id}')
        assert_eq(g_blocked_body.get('success'), False, "perm_guest_annotate=0 时 annotation_target 必须坚决拒绝访客")
        assert_true('不可访问' in g_blocked_body.get('message', ''), "提示信息必须为防越权模糊语义")

        # 10. 管理员配置 global_webhook_url 后 index.php 下发验证 (P2-2)
        save_res = client.api('save_settings', {'site_title': '测试站', 'global_webhook_url': 'https://oapi.dingtalk.com/robot/send?access_token=test'})
        assert_true(save_res.get('success'), f"配置全局 Webhook 成功: {save_res}")
        _, _, index_html_with_hook = client.request('/index.php')
        assert_true('var SYS_HAS_GLOBAL_WEBHOOK = true;' in index_html_with_hook, "配置全局 Webhook 后 index.php 必须下发 true")

        client.api('save_settings', {'site_title': '测试站', 'global_webhook_url': ''})
        _, _, index_html_no_hook = client.request('/index.php')
        assert_true('var SYS_HAS_GLOBAL_WEBHOOK = false;' in index_html_no_hook, "未配置全局 Webhook 时 index.php 必须下发 false")

    print(f"\n[✓] 全部测试通过！累计执行断言: {assertions} 项")
    return assertions


def main():
    parser = argparse.ArgumentParser(description="2026-11-07 审查发现问题专项回归测试")
    parser.add_argument('--php', help="PHP 可执行文件路径", default='/tmp/protoloft-php-review/php')
    args = parser.parse_args()

    php_bin = args.php
    if not Path(php_bin).exists():
        found = shutil.which('php')
        if found:
            php_bin = found
        else:
            print(f"[!] 找不到可用 PHP 运行时: {php_bin}")
            sys.exit(1)

    try:
        run_tests(php_bin)
    except Exception as e:
        print(f"\n[✗] 测试执行失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
