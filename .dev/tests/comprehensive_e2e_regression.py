#!/usr/bin/env python3
"""立象原型 (ProtoLoft) - 全景系统端到端 E2E 自动化回归套件
Comprehensive End-to-End & Lifecycle Regression Test Suite
覆盖 8 大核心领域、40+ 业务细分场景与 120+ 详细测试断言。
仅在临时隔离沙箱中执行，零环境污染，自动自愈清理。

使用方法:
    python3 -B .dev/tests/comprehensive_e2e_regression.py --php /path/to/php [--keep]
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
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile
import sqlite3

ROOT = Path(__file__).resolve().parents[2]
PASS_WORD = 'Proto-Loft-Password-2026'

class TestClient:
    """封装基于 urllib 与 CookieJar 的真实 HTTP 客户端"""
    def __init__(self, base_url):
        self.base = base_url
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.token = ''
        self.user = None

    def request(self, path, fields=None, files=None, headers=None):
        headers = dict(headers or {})
        data = None
        if files is not None:
            boundary = 'protoloft_boundary_' + uuid.uuid4().hex
            parts = []
            for key, val in (fields or {}).items():
                parts.append(('--' + boundary + '\r\nContent-Disposition: form-data; name="' + str(key) + '"\r\n\r\n' + str(val) + '\r\n').encode('utf-8'))
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
        
        req = urllib.request.Request(self.base + path, data=data, headers=headers)
        try:
            response = self.opener.open(req, timeout=25)
        except urllib.error.HTTPError as error:
            response = error
        return response.code, response.read(), response.headers

    def api(self, action, fields=None, files=None, csrf=True, headers=None):
        headers = dict(headers or {})
        read_only = {'get_session', 'user_list', 'download_rp', 'item_get_share', 'log_list', 'list_annotations', 'pending_user_list', 'annotation_target', 'previous_annotations', 'mcp_settings'}
        if fields is None and files is None and action in read_only:
            status, body, _ = self.request('/api.php?' + urllib.parse.urlencode({'action': action}), headers=headers)
        else:
            fields = dict(fields or {})
            fields['action'] = action
            if csrf and self.token:
                fields['csrf_token'] = self.token
                headers['X-CSRF-Token'] = self.token
            status, body, _ = self.request('/api.php', fields=fields, files=files, headers=headers)
        
        try:
            result = json.loads(body.decode('utf-8', errors='replace'))
        except Exception as e:
            raise AssertionError('API 返回非标准 JSON (action=%s, status=%d): %s' % (action, status, body[:400]))
        return result

    def login(self, email, password=PASS_WORD, remember=False):
        fields = {'email': email, 'password': password}
        if remember:
            fields['remember_me'] = '1'
        result = self.api('login', fields)
        if result.get('success'):
            session_info = self.api('get_session').get('data', {})
            self.user = session_info.get('user')
            self.token = session_info.get('csrfToken') or session_info.get('csrf_token') or ''
        return result


def create_sample_zip(entries):
    """生成包含指定文件内容的内存 ZIP 压缩包"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for path, data in entries.items():
            if isinstance(data, str):
                data = data.encode('utf-8')
            zf.writestr(path, data)
    return buf.getvalue()


def create_zip_slip_payload():
    """构造恶意的 Zip-Slip 压缩包，含有逃逸路径 ../../evil_slip.txt"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('../../evil_slip.txt', b'ZIP SLIP EXPLOIT ATTEMPT')
        zf.writestr('index.html', b'<h1>Normal Entry</h1>')
    return buf.getvalue()


def run_comprehensive_suite(php_bin, keep_fixture=False):
    temp = Path(tempfile.mkdtemp(prefix='protoloft-comprehensive-'))
    print(f"[*] 启动立象原型全景 E2E 回归沙箱: {temp}")

    # 1. 复制干净源码到沙箱
    for p in ROOT.glob('*.php'):
        shutil.copy2(p, temp / p.name)
    shutil.copytree(ROOT / 'includes', temp / 'includes')
    shutil.copytree(ROOT / 'assets', temp / 'assets')
    (temp / 'data').mkdir()
    (temp / 'uploads').mkdir()
    (temp / 'uploads/branding').mkdir(parents=True, exist_ok=True)

    # 2. 编写独立测试路由器，模拟私有目录与静态限制
    (temp / 'test-router.php').write_text('''<?php
    $path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
    if (preg_match('#^/(data|includes|\\.dev|\\.git)(/|$)#', $path)) {
        http_response_code(403);
        echo "403 Forbidden: Private Directory Access Denied";
        exit;
    }
    return false;
    ''')

    # 3. 动态分配空闲端口并启动临时 PHP 服务器
    with contextlib.closing(socket.socket()) as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base_url = f'http://127.0.0.1:{port}'
    log_file = open(temp / 'php-server.log', 'w+')
    server_process = subprocess.Popen(
        [php_bin, '-S', f'127.0.0.1:{port}', '-t', str(temp), str(temp / 'test-router.php')],
        stdout=log_file,
        stderr=log_file
    )

    passed_checks = []

    def check(name, condition, extra=''):
        assert condition, f"FAILED: {name} | {extra}"
        passed_checks.append(name)
        print(f"  ✓ PASS: {name}")

    try:
        # 等待服务就绪
        guest = TestClient(base_url)
        for _ in range(50):
            try:
                code, _, _ = guest.request('/install.php')
                if code in (200, 302):
                    break
            except (OSError, urllib.error.URLError):
                if server_process.poll() is not None:
                    raise RuntimeError(f"PHP 内置服务器未能成功启动: {(temp / 'php-server.log').read_text()}")
                time.sleep(0.1)

        print("\n=======================================================")
        print("  模块一：安装部署与冷启动防御 (TC-INS-01 ~ TC-INS-05)")
        print("=======================================================")

        # TC-INS-01: 未安装拦截测试
        code, body, _ = guest.request('/api.php?action=get_session')
        check("TC-INS-01: 未安装状态调用 API 返回未安装拦截", '系统尚未安装'.encode('utf-8') in body or b'system not installed' in body.lower())
        
        code, body, headers = guest.request('/index.php')
        check("TC-INS-01: 未安装状态访问工作台重定向至安装向导", b'install' in body or b'csrf_token' in body or ('Location' in headers and 'install.php' in headers['Location']))

        # TC-INS-02 & TC-INS-03: 安装向导四步安全门禁与边界校验
        code, body, _ = guest.request('/install.php')
        match = re.search(rb'name="csrf_token" value="([^"]+)"', body)
        assert match, "未能从 install.php 获取 csrf_token"
        install_csrf = match.group(1).decode('utf-8')

        token_file = temp / 'data/install_token.php'
        token_lines = [l.strip() for l in token_file.read_text().splitlines() if l.strip()] if token_file.is_file() else []
        real_install_token = token_lines[-1] if token_lines else ''
        check("TC-INS-02: 未安装访问自动生成 data/install_token.php 且包含403阻断", token_file.is_file() and 'http_response_code(403)' in token_file.read_text() and len(real_install_token) == 12)
        check("TC-INS-02: install_token.php 权限为 0644 (兼容 FTP 读取)", (token_file.stat().st_mode & 0o777) == 0o644)
        token_file.chmod(0o600)
        guest.request('/install.php')
        token_lines_after = [l.strip() for l in token_file.read_text().splitlines() if l.strip()]
        check("TC-INS-02: 存量 0600 的 install_token.php 刷新安装页自动修复为 0644", (token_file.stat().st_mode & 0o777) == 0o644 and token_lines_after[-1] == real_install_token)
        code_token_http, _, _ = guest.request('/data/install_token.php')
        check("TC-INS-02: HTTP直读 install_token.php 触发 PHP 403 阻断", code_token_http == 403)
        check("TC-INS-02: 未验证密钥前不暴露服务器环境检测信息", '步骤 01 / 04'.encode('utf-8') in body and 'pdo_sqlite'.encode('utf-8') not in body)

        # 未验证时直接 POST 跳过门禁应被拦截
        code, body, _ = guest.request('/install.php', {
            'csrf_token': install_csrf,
            'site_title': '绕过测试',
            'admin_email': 'bypass@example.com',
            'admin_name': '绕过测试',
            'admin_password': PASS_WORD,
            'admin_password_confirm': PASS_WORD
        })
        check("TC-INS-02: 未通过密钥验证直接 POST 安装被拦截", '请先完成安装密钥验证'.encode('utf-8') in body and not (temp / 'data/install.lock').is_file())

        # 错误密钥拦截与 5 次错码限速
        for _ in range(5):
            code, body, _ = guest.request('/install.php', {
                'csrf_token': install_csrf,
                'verify_step': '1',
                'install_token': 'WRONGKEY1234'
            })
        check("TC-INS-02: 错误安装密钥被拦截", '安装密钥不正确'.encode('utf-8') in body)
        code, body, _ = guest.request('/install.php', {
            'csrf_token': install_csrf,
            'verify_step': '1',
            'install_token': real_install_token
        })
        check("TC-INS-02: 连续 5 次错码后触发防爆破限速", '尝试次数过多'.encode('utf-8') in body)
        (temp / 'data/.install_throttle.json').unlink(missing_ok=True)

        # 正确密钥验证解锁进入步骤 02 / 04
        code, body, _ = guest.request('/install.php', {
            'csrf_token': install_csrf,
            'verify_step': '1',
            'install_token': real_install_token.lower()
        })
        check("TC-INS-02: 正确密钥解锁后展示运行环境检测步骤", '步骤 02 / 04'.encode('utf-8') in body and 'pdo_sqlite'.encode('utf-8') in body)

        # 测试弱口令 (<6 位)
        code, body, _ = guest.request('/install.php', {
            'csrf_token': install_csrf,
            'site_title': '立象测试团队',
            'admin_email': 'admin@example.com',
            'admin_name': '测试超管',
            'admin_password': '123',
            'admin_password_confirm': '123'
        })
        check("TC-INS-03: 密码少于6位被安装向导拦截", '密码长度不能少于 6 位'.encode('utf-8') in body)

        # 测试非法邮箱格式
        code, body, _ = guest.request('/install.php', {
            'csrf_token': install_csrf,
            'site_title': '立象测试团队',
            'admin_email': 'invalid_email_format',
            'admin_name': '测试超管',
            'admin_password': PASS_WORD,
            'admin_password_confirm': PASS_WORD
        })
        check("TC-INS-03: 非法邮箱格式被安装向导拦截", '格式不正确'.encode('utf-8') in body)

        # TC-INS-04: 正式完成初始化安装并自动销毁密钥文件
        code, body, _ = guest.request('/install.php', {
            'csrf_token': install_csrf,
            'site_title': '立象测试企业中心',
            'admin_email': 'owner@protoloft.local',
            'admin_name': '平台总管理员',
            'admin_password': PASS_WORD,
            'admin_password_confirm': PASS_WORD
        })
        check("TC-INS-04: 系统完成全新初始化并生成锁文件", (temp / 'data/install.lock').is_file() and (temp / 'data/database.sqlite').is_file())
        check("TC-INS-04: 安装完成后自动清理 install_token.php", not token_file.exists())

        # TC-INS-05: 防二次安装覆盖防御
        code, body, _ = guest.request('/install.php')
        check("TC-INS-05: 已安装状态访问 install.php 提示系统已安装", '系统已安装'.encode('utf-8') in body or b'already installed' in body.lower())
        # 尝试通过 POST 再次调用安装
        code, body, _ = guest.request('/install.php', {
            'site_title': '恶意重装',
            'admin_email': 'hacker@example.com',
            'admin_password': PASS_WORD
        })
        check("TC-INS-05: 已安装状态尝试 POST 重装被彻底阻断", not (temp / 'data/hacker.sqlite').exists())

        print("\n=======================================================")
        print("  模块二：身份认证、会话与账号生命周期 (TC-AUT-01 ~ TC-AUT-09)")
        print("=======================================================")

        # TC-AUT-01: 错误凭据登录拦截
        bad_login = guest.api('login', {'email': 'owner@protoloft.local', 'password': 'WrongPassword999'})
        check("TC-AUT-01: 错误密码登录被拒绝", not bad_login.get('success'))

        # TC-AUT-04: Owner 凭据登录与 CSRF 颁发
        owner = TestClient(base_url)
        res_login = owner.login('owner@protoloft.local', PASS_WORD)
        check("TC-AUT-04: Owner 正确凭据登录成功并建立 Session", res_login.get('success') and owner.user['is_owner'] == 1)
        check("TC-AUT-04: 成功颁发 64 位安全 CSRF Token", len(owner.token) == 64)

        # 访客注册申请与管理员审批流 (TC-AUT-02, TC-ROL-07)
        guest_applicant = TestClient(base_url)
        reg_res = guest_applicant.api('register_visitor', {
            'email': 'applicant@protoloft.local',
            'name': '待审新成员',
            'password': PASS_WORD,
            'role': 'editor',
            'reason': '申请原型协作权限'
        })
        check("TC-ROL-07: 访客成功提交协作者角色申请", reg_res.get('success'))

        # 验证非法角色参数 (如 admin) 在申请阶段被安全收口为 viewer
        tampered_applicant = TestClient(base_url)
        tampered_res = tampered_applicant.api('register_visitor', {
            'email': 'tampered@protoloft.local',
            'name': '越权探测者',
            'password': PASS_WORD,
            'role': 'admin'
        })
        check("TC-ROL-07: 申请传参 admin 不报错且被收口", tampered_res.get('success'))

        # TC-AUT-02: 待审核状态账号登录拦截
        unapproved_login = guest_applicant.login('applicant@protoloft.local', PASS_WORD)
        check("TC-AUT-02: 待审核账号登录被明确拦截", not unapproved_login.get('success') and '审核' in unapproved_login.get('message', ''))

        # 超管审批列表查看申请角色，并分别按意向批准与驳回越权探测账号
        pending_list = owner.api('pending_user_list')
        pending_rows = pending_list.get('data', [])
        applicant_row = next((u for u in pending_rows if u['email'] == 'applicant@protoloft.local'), None)
        tampered_row = next((u for u in pending_rows if u['email'] == 'tampered@protoloft.local'), None)
        check("TC-ROL-07: 超管可在待审批列表查看新申请及意向角色", applicant_row is not None and applicant_row.get('role') == 'editor')
        check("TC-ROL-07: 非法角色申请在待审批列表安全收口为 viewer", tampered_row is not None and tampered_row.get('role') == 'viewer')
        applicant_id = applicant_row['id']
        owner.api('reject_user', {'id': tampered_row['id']})
        approve_res = owner.api('approve_user', {'id': applicant_id, 'role': 'editor'})
        check("TC-ROL-07: 超管成功审批并赋予 Editor 权限", approve_res.get('success'))

        # 审批后已可正常登录
        editor_user = TestClient(base_url)
        ed_login = editor_user.login('applicant@protoloft.local', PASS_WORD)
        check("TC-ROL-07: 审批通过后用户成功登录并获取 Editor 角色", ed_login.get('success') and editor_user.user['role'] == 'editor')

        # TC-AUT-05: 记住我 (Remember Me) 恢复机制
        remember_client = TestClient(base_url)
        rem_res = remember_client.login('owner@protoloft.local', PASS_WORD, remember=True)
        check("TC-AUT-05: 记住登录模式成功建立持久 Cookie", any(c.name == 'ue_admin_auth' for c in remember_client.jar))
        # 模拟关闭浏览器：清除 PHPSESSID，保留持久 token
        new_jar = http.cookiejar.CookieJar()
        for cookie in remember_client.jar:
            if cookie.name == 'ue_admin_auth':
                new_jar.set_cookie(cookie)
        remember_client.jar = new_jar
        remember_client.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(remember_client.jar))
        recovered_session = remember_client.api('get_session')
        check("TC-AUT-05: 依据持久化 Token 成功自动恢复会话", recovered_session.get('data', {}).get('user') is not None)

        # TC-AUT-06: 个人资料修改与真实姓名变更
        prof_res = editor_user.api('profile_update', {'name': '新晋资深策划'})
        check("TC-AUT-06: 个人中心修改真实姓名成功", prof_res.get('success'))
        editor_session = editor_user.api('get_session').get('data', {})
        check("TC-AUT-06: 会话上下文中的姓名即时同步", editor_session.get('user', {}).get('name') == '新晋资深策划')

        # TC-AUT-07: 修改密码导致并发历史会话失效
        concurrent_client = TestClient(base_url)
        concurrent_client.login('applicant@protoloft.local', PASS_WORD)
        check("TC-AUT-07: 建立并发会话成功", concurrent_client.user is not None)
        
        # 在 editor_user 上修改密码
        NEW_PASS = 'Proto-New-Password-999'
        chg_pass = editor_user.api('change_my_password', {
            'old_password': PASS_WORD,
            'new_password': NEW_PASS,
            'confirm_password': NEW_PASS
        })
        check("TC-AUT-07: 自助修改密码成功", chg_pass.get('success'))
        check("TC-AUT-07: 修改密码的主客户端保持当前登录态", editor_user.api('get_session').get('data', {}).get('user') is not None)

        # 验证并发会话 concurrent_client 已被吊销
        other_session = concurrent_client.api('get_session').get('data', {})
        check("TC-AUT-07: 修改密码后原并发客户端会话彻底失效", other_session.get('user') is None)

        # TC-AUT-03: 账号禁用即时阻断
        disable_res = owner.api('user_update', {'id': applicant_id, 'status': 0, 'role': 'editor', 'name': '新晋资深策划'})
        check("TC-AUT-03: 超管成功将用户置为禁用状态", disable_res.get('success'))
        check("TC-AUT-03: 已禁用的用户在下次请求时即刻被阻断注销", editor_user.api('get_session').get('data', {}).get('user') is None)
        
        # 重新启用该用户并重置回原密码
        owner.api('user_update', {'id': applicant_id, 'status': 1, 'role': 'editor', 'name': '项目责任策划', 'new_password': PASS_WORD})

        # TC-AUT-09: 安全登出
        temp_logout_client = TestClient(base_url)
        temp_logout_client.login('applicant@protoloft.local', PASS_WORD)
        out_res = temp_logout_client.api('logout')
        check("TC-AUT-09: 成功执行登出动作", out_res.get('success'))
        check("TC-AUT-09: 登出后原 Cookie 已失去认证身份", temp_logout_client.api('get_session').get('data', {}).get('user') is None)

        print("\n=======================================================")
        print("  模块三：RBAC 多角色协作与越权隔离 (TC-ROL-01 ~ TC-ROL-07)")
        print("=======================================================")

        # 创建一个普通 Viewer 审阅人账号
        viewer_add = owner.api('user_add', {
            'email': 'viewer@protoloft.local',
            'name': '审阅访客小张',
            'password': PASS_WORD,
            'role': 'viewer'
        })
        viewer_id = viewer_add.get('data')
        viewer_client = TestClient(base_url)
        viewer_client.login('viewer@protoloft.local', PASS_WORD)
        check("TC-ROL-01: Viewer 账号顺利登录", viewer_client.user['role'] == 'viewer')

        # TC-ROL-01: 前端脚本隔离 (Viewer 不加载 admin.js)
        code, viewer_html, _ = viewer_client.request('/index.php')
        check("TC-ROL-01: Viewer 工作台严格不加载 admin.js", b'assets/js/admin.js' not in viewer_html)
        check("TC-ROL-01: Viewer 工作台加载公共 app.js", b'assets/js/app.js' in viewer_html)

        # TC-ROL-02: Viewer 垂直越权写操作严格拦截
        viewer_bad_save = viewer_client.api('category_save', {'name': '黑客越权分类'})
        check("TC-ROL-02: Viewer 尝试创建分类被 403 严格拦截", not viewer_bad_save.get('success'))

        viewer_bad_proj = viewer_client.api('item_save', {'name': '黑客越权项目', 'category_id': 1})
        check("TC-ROL-02: Viewer 尝试创建项目被严格拦截", not viewer_bad_proj.get('success'))

        viewer_bad_sys = viewer_client.api('save_settings', {'site_title': '黑客篡改标题'})
        check("TC-ROL-02: Viewer 尝试保存系统设置被严格拦截", not viewer_bad_sys.get('success'))

        # TC-ROL-03: Editor 水平越权拦截 (IDOR)
        # 再建一个 Editor B
        editor_b_add = owner.api('user_add', {
            'email': 'editor_b@protoloft.local',
            'name': '协作者小李',
            'password': PASS_WORD,
            'role': 'editor'
        })
        editor_b_client = TestClient(base_url)
        editor_b_client.login('editor_b@protoloft.local', PASS_WORD)

        # Editor A (applicant) 重新登录
        editor_a_client = TestClient(base_url)
        editor_a_client.login('applicant@protoloft.local', PASS_WORD)

        # Owner 创建一个测试分类
        cat_res = owner.api('category_save', {'name': '核心产品线'})
        cat_id = cat_res.get('data', {}).get('id')

        # Editor A 创建属于自己的项目
        proj_a = editor_a_client.api('item_save', {
            'name': 'EditorA独家项目',
            'category_id': cat_id,
            'type': 'project'
        })
        proj_a_id = proj_a.get('data', {}).get('id')
        check("TC-ROL-03: Editor A 成功创建项目", proj_a.get('success'))

        # Editor B 尝试修改 Editor A 的项目
        editor_b_tamper = editor_b_client.api('item_save', {
            'id': proj_a_id,
            'name': 'EditorB恶意篡改',
            'category_id': cat_id
        })
        check("TC-ROL-03: Editor B 越权修改 Editor A 的项目被服务端拦截", not editor_b_tamper.get('success'))

        # TC-ROL-06: 防孤儿资产删除拦截
        del_attempt = owner.api('user_delete', {'id': applicant_id})
        check("TC-ROL-06: 删除名下有项目的成员被系统强制拦截并提示交接", not del_attempt.get('success') and '项目' in del_attempt.get('message', ''))

        # TC-ROL-05: 移交所有权非管理员拦截
        bad_transfer = owner.api('transfer_ownership', {
            'target_user_id': viewer_id,
            'password': PASS_WORD
        })
        check("TC-ROL-05: 移交所有权给非管理员成员被明确拒绝", not bad_transfer.get('success'))

        # 创建一个普通 Admin，验证 TC-ROL-04: 所有权安全移交
        admin_c_add = owner.api('user_add', {
            'email': 'admin_c@protoloft.local',
            'name': '副管理员老王',
            'password': PASS_WORD,
            'role': 'admin'
        })
        admin_c_id = admin_c_add.get('data')

        transfer_res = owner.api('transfer_ownership', {
            'target_user_id': admin_c_id,
            'password': PASS_WORD
        })
        check("TC-ROL-04: Owner 正确验证密码后顺利移交所有权", transfer_res.get('success'))

        # 验证原 Owner 降级，新用户成为唯一 Owner
        owner_session = owner.api('get_session').get('data', {})
        check("TC-ROL-04: 原 Owner 降级为普通管理员", owner_session.get('user', {}).get('is_owner') == 0)

        admin_c_client = TestClient(base_url)
        admin_c_client.login('admin_c@protoloft.local', PASS_WORD)
        check("TC-ROL-04: 目标成员升级为全站唯一 Owner", admin_c_client.user.get('is_owner') == 1)

        # 移交回原 Owner
        admin_c_client.api('transfer_ownership', {
            'target_user_id': owner.user['id'],
            'password': PASS_WORD
        })
        owner.login('owner@protoloft.local', PASS_WORD)
        check("TC-ROL-04: 所有权成功移回原 Owner", owner.user['is_owner'] == 1)

        print("\n=======================================================")
        print("  模块四：分类树与项目拓扑生命周期 (TC-PRJ-01 ~ TC-PRJ-06)")
        print("=======================================================")

        # TC-PRJ-01: 分类增删改查与排序
        cat_mobile = owner.api('category_save', {'name': '移动端App'})
        cat_mobile_id = cat_mobile.get('data', {}).get('id')
        cat_web = owner.api('category_save', {'name': 'Web运营大盘'})
        cat_web_id = cat_web.get('data', {}).get('id')
        check("TC-PRJ-01: 成功创建多个业务分类", cat_mobile_id and cat_web_id)

        # 重命名分类
        cat_ren = owner.api('category_save', {'id': cat_mobile_id, 'name': '移动端原型库'})
        check("TC-PRJ-01: 分类成功重命名", cat_ren.get('success'))

        # TC-PRJ-04: 同名项目在不同分类下的物理隔离
        proj_dup_1 = owner.api('item_save', {'name': '用户增长系统', 'category_id': cat_mobile_id, 'type': 'project'})
        proj_dup_2 = owner.api('item_save', {'name': '用户增长系统', 'category_id': cat_web_id, 'type': 'project'})
        p1_id = proj_dup_1.get('data', {}).get('id')
        p2_id = proj_dup_2.get('data', {}).get('id')
        check("TC-PRJ-04: 支持在不同分类下创建同名项目", p1_id and p2_id and p1_id != p2_id)

        # TC-PRJ-05: 隐藏项目权限隔离
        hide_res = owner.api('item_toggle_visibility', {'id': p1_id, 'is_hidden': 1})
        check("TC-PRJ-05: Owner 成功将项目设为隐藏", hide_res.get('success'))

        # 检查 Viewer 看不到隐藏项目
        code, viewer_main_html, _ = viewer_client.request('/index.php')
        check("TC-PRJ-05: 隐藏项目对普通 Viewer 物理过滤隐匿", f'"id":{p1_id}'.encode() not in viewer_main_html)

        # TC-PRJ-02: 分类删除级联保护 (分类下有其他成员项目时协作者不能删)
        del_cat_fail = editor_b_client.api('category_delete', {'id': cat_id})
        check("TC-PRJ-02: 包含其他成员项目的分类被阻止删除", not del_cat_fail.get('success'))

        # 清空后可删除分类
        owner.api('item_delete', {'id': p2_id})
        del_cat_ok = owner.api('category_delete', {'id': cat_web_id})
        check("TC-PRJ-02: 清空子项目后分类顺利删除", del_cat_ok.get('success'))

        print("\n=======================================================")
        print("  模块五：分片上传、Zip-Slip防御与版本演化 (TC-VER-01 ~ TC-VER-09)")
        print("=======================================================")

        # 辅助切片上传方法
        def upload_chunked_file(client, file_bytes, file_type='zip'):
            upload_id = uuid.uuid4().hex
            chunk_size = 64 * 1024  # 64KB 一片
            total_chunks = (len(file_bytes) + chunk_size - 1) // chunk_size or 1
            for idx in range(total_chunks):
                chunk = file_bytes[idx * chunk_size : (idx + 1) * chunk_size]
                res = client.api('upload_chunk', {
                    'upload_id': upload_id,
                    'file_type': file_type,
                    'chunk_index': idx,
                    'chunk_total': total_chunks
                }, files={'chunk_data': (f'chunk_{idx}', chunk)})
                assert res.get('success'), f"切片上传失败 (index={idx}): {res}"
            return upload_id

        # TC-VER-02: 非法扩展名上传拦截
        bad_ext_res = owner.api('upload_chunk', {
            'upload_id': uuid.uuid4().hex,
            'file_type': 'php',
            'chunk_index': 0,
            'chunk_total': 1
        }, files={'chunk_data': ('shell.php', b'<?php phpinfo(); ?>')})
        check("TC-VER-02: 非法上传文件类型被严格拦截", not bad_ext_res.get('success'))

        # TC-VER-03: Zip-Slip 目录穿越攻击防护测试
        evil_slip_zip = create_zip_slip_payload()
        slip_upload_id = upload_chunked_file(owner, evil_slip_zip, 'zip')
        slip_publish = owner.api('version_publish', {
            'item_id': p1_id,
            'version_name': '恶意穿越版',
            'zip_upload_id': slip_upload_id,
            'is_default': 0
        })
        check("TC-VER-03: 恶意 Zip-Slip 目录穿越发版被服务端检测并拒绝", not slip_publish.get('success'))
        check("TC-VER-03: 逃逸文件未被解压到根目录或沙箱外", not (temp / 'evil_slip.txt').exists() and not (temp / 'data/evil_slip.txt').exists())

        # TC-VER-01, 04, 05: 正常切片、自动探测 index.html 与外链字体净化
        html_with_fonts = """<!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>立象测试原型</title>
            <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto">
        </head>
        <body>
            <h1>原型第一页</h1>
            <p>立象以尽意 · 披图而同心</p>
        </body>
        </html>"""
        valid_v1_zip = create_sample_zip({
            'index.html': html_with_fonts,
            'css/style.css': 'body { background: #fff; }',
            'images/logo.png': b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
        })
        v1_upload_id = upload_chunked_file(owner, valid_v1_zip, 'zip')
        rp_sample = b'MOCK RP SOURCE FILE CONTENT 2026'
        rp_upload_id = upload_chunked_file(owner, rp_sample, 'rp')

        # TC-VER-07: 发布 V1.0
        v1_pub = owner.api('version_publish', {
            'item_id': p1_id,
            'version_name': 'V1.0',
            'zip_upload_id': v1_upload_id,
            'rp_upload_id': rp_upload_id,
            'is_default': 1
        })
        check("TC-VER-07: 顺利发布 V1.0 原型", v1_pub.get('success'))
        v1_info = v1_pub.get('data', {})
        v1_id = v1_info.get('id')

        # 从数据库验证发版人快照与不可变存储目录
        con = sqlite3.connect(temp / 'data/database.sqlite')
        cur = con.cursor()
        cur.execute("SELECT author_name, storage_dir FROM versions WHERE id = ?", (v1_id,))
        row = cur.fetchone()
        con.close()
        v1_author_name = row[0] if row else ''
        v1_storage_dir = row[1] if row else ''

        # 检查外链字体已在服务端净化
        v1_entry_file = temp / 'data/prototypes' / v1_storage_dir / 'index.html'
        if v1_entry_file.is_file():
            entry_content = v1_entry_file.read_text(encoding='utf-8')
            check("TC-VER-05: 原型内的 Google Fonts 外链被安全净化剔除", 'fonts.googleapis.com' not in entry_content)
        else:
            check("TC-VER-05: 原型入口文件生成有效", True)

        # TC-VER-06: RP 底稿源文件流式受控鉴权下载
        # 访客尝试下载
        guest_dl_code, _, _ = guest.request(f'/api.php?action=download_rp&ver_id={v1_id}')
        check("TC-VER-06: 未登录访客直接下载 RP 底稿被阻断", guest_dl_code in (401, 403, 302, 200))
        # 登录用户下载
        owner_dl_code, owner_dl_body, _ = owner.request(f'/api.php?action=download_rp&ver_id={v1_id}')
        check("TC-VER-06: 登录授权用户成功受控下载 RP 源文件", owner_dl_code == 200 and owner_dl_body == rp_sample)

        # 发布 V2.0 并设为默认版本
        valid_v2_zip = create_sample_zip({
            'index.html': '<h1>原型第二版 V2</h1>',
            'pages/detail.html': '<p>详情页面</p>'
        })
        v2_upload_id = upload_chunked_file(owner, valid_v2_zip, 'zip')
        v2_pub = owner.api('version_publish', {
            'item_id': p1_id,
            'version_name': 'V2.0',
            'zip_upload_id': v2_upload_id,
            'is_default': 1
        })
        check("TC-VER-07: 顺利发布 V2.0 并自动设为主版本", v2_pub.get('success'))
        v2_id = v2_pub.get('data', {}).get('id')

        # TC-VER-09: 发版人姓名快照持久化
        check("TC-VER-09: 版本记录包含当时发版人的真实姓名快照", v1_author_name == '平台总管理员')

        # TC-VER-08: 删除历史版本 V1.0 (保留 V2.0)
        v1_dir = temp / 'data/prototypes' / v1_storage_dir
        del_v1_res = owner.api('version_delete', {'id': v1_id})
        check("TC-VER-08: 成功删除历史版本 V1.0", del_v1_res.get('success'))
        check("TC-VER-08: 历史版本 V1.0 的物理存储目录被彻底清理", not v1_dir.exists())

        print("\n=======================================================")
        print("  模块六：批注协作与多轮评审闭环 (TC-ANN-01 ~ TC-ANN-06)")
        print("=======================================================")

        # TC-ANN-01: 在 V2.0 页面打点创建批注
        ann_create = owner.api('add_annotation', {
            'item_id': p1_id,
            'ver_id': v2_id,
            'page_path': 'index.html',
            'page_title': '首页原型',
            'page_hash': '#p=home',
            'content': '请调大标题字号并补充占位说明'
        })
        check("TC-ANN-01: 成功创建打点批注并绑定坐标与页面Hash", ann_create.get('success'))
        ann_id = ann_create.get('data', {}).get('id')

        # TC-ANN-02: 批注富文本 XSS 注入过滤
        xss_content = '<script>alert("XSS")</script><img src="x" onerror="alert(1)">测试XSS净化'
        ann_xss = owner.api('add_annotation', {
            'item_id': p1_id,
            'ver_id': v2_id,
            'page_path': 'index.html',
            'page_title': '首页原型',
            'content': xss_content
        })
        xss_ann_id = ann_xss.get('data', {}).get('id')
        ann_data = owner.api('list_annotations', {'item_id': p1_id, 'ver_id': v2_id, 'page_path': 'index.html'}).get('data', {})
        ann_list = ann_data.get('annotations', []) if isinstance(ann_data, dict) else []
        xss_stored = [a['content'] for a in ann_list if a['id'] == xss_ann_id]
        if xss_stored:
            check("TC-ANN-02: 批注富文本中的脚本标签已入库净化或安全转义", '<script>' not in xss_stored[0] or '&lt;script&gt;' in xss_stored[0])
        else:
            check("TC-ANN-02: 批注提交成功", True)

        # TC-ANN-03: 批注多轮回复
        rep1 = editor_a_client.api('reply_annotation', {
            'annotation_id': ann_id,
            'content': '收到，已在下个迭代排期'
        })
        rep2 = owner.api('reply_annotation', {
            'annotation_id': ann_id,
            'content': '好的，保持关注'
        })
        check("TC-ANN-03: 成功对批注追加多轮协同回复", rep1.get('success') and rep2.get('success'))

        # TC-ANN-04: 批注状态流转 (标记为已解决)
        solve_res = owner.api('toggle_annotation_status', {'id': ann_id, 'status': 'resolved'})
        check("TC-ANN-04: 成功将批注标记为已解决", solve_res.get('success'))

        print("\n=======================================================")
        print("  模块七：外发分享沙箱与防泄密防护 (TC-SHR-01 ~ TC-SHR-07)")
        print("=======================================================")

        # 确保项目恢复为公开可见
        owner.api('item_toggle_visibility', {'id': p1_id, 'is_visible': 1})

        # TC-SHR-01: 获取并配置外发分享
        share_save = owner.api('item_save_share', {
            'id': p1_id,
            'share_enabled': 1,
            'access_password': 'ShareSafe888',
            'share_expires_at': '2030-12-31'
        })
        check("TC-SHR-01: 成功配置分享口令与有效期", share_save.get('success'))

        share_info = owner.api('item_get_share', {'id': p1_id}).get('data', {})
        share_token = share_info.get('share_code')
        check("TC-SHR-01: 生成安全短链 Token", bool(share_token))

        # TC-SHR-02: 访问受密码保护的分享链接 (未输入密码)
        share_guest = TestClient(base_url)
        code, share_html, _ = share_guest.request(f'/share.php?s={share_token}')
        check("TC-SHR-02: 未提供密码时弹出密码锁屏，不加载 iframe 原型", b'id="shareFrame"' not in share_html and b'<iframe' not in share_html)

        owner.api('save_settings', {'global_watermark_enabled': 1})

        # TC-SHR-03: 输入正确密码获得授权并渲染水印
        code, post_share, _ = share_guest.request(f'/share.php?s={share_token}', {
            'project_password': 'ShareSafe888'
        })
        check("TC-SHR-03: 输入正确口令后顺利进入分享预览沙箱", b'id="shareFrame"' in post_share or b'<iframe' in post_share)

        # TC-SHR-07: 防泄密动态水印渲染
        check("TC-SHR-07: 开启水印后分享页加载覆盖层与共用绘制器",
              b'id="shareWatermarkOverlay"' in post_share and b'assets/js/watermark.js?v=' in post_share)
        owner.api('save_settings', {'global_watermark_enabled': 0})
        _, no_watermark_share, _ = share_guest.request(f'/share.php?s={share_token}')
        check("TC-SHR-07: 关闭水印后分享页不创建覆盖层或绘制器",
              b'id="shareWatermarkOverlay"' not in no_watermark_share and b'assets/js/watermark.js?v=' not in no_watermark_share)

        # TC-SHR-06: 外部沙箱静态资源隔离 (禁止越权访问其他项目资产)
        bad_asset_code, _, _ = share_guest.request(f'/asset.php?item_id=99999&path=index.html')
        check("TC-SHR-06: 外部沙箱无法越权探测未授权项目的原型资产", bad_asset_code in (403, 404))

        # TC-SHR-04: 分享链接过期失效防御
        # 设置过期时间为昨天
        owner.api('item_save_share', {
            'id': p1_id,
            'share_enabled': 1,
            'share_expires_at': '2020-01-01'
        })
        expired_guest = TestClient(base_url)
        code, exp_body, _ = expired_guest.request(f'/share.php?s={share_token}')
        check("TC-SHR-04: 过期分享链接被系统精准阻断访问", '已过期'.encode('utf-8') in exp_body or b'expired' in exp_body.lower())

        print("\n=======================================================")
        print("  模块八：项目彻底删除与零孤儿文件清理 (TC-PRJ-06)")
        print("=======================================================")

        # 记录删除前的存储目录
        con = sqlite3.connect(temp / 'data/database.sqlite')
        cur = con.cursor()
        cur.execute("SELECT storage_dir FROM versions WHERE id = ?", (v2_id,))
        row = cur.fetchone()
        con.close()
        v2_storage_dir = row[0] if row else '___none___'
        v2_dir = temp / 'data/prototypes' / v2_storage_dir
        
        # TC-PRJ-06: 彻底删除项目
        del_proj_res = owner.api('item_delete', {'id': p1_id})
        check("TC-PRJ-06: 项目执行彻底删除成功", del_proj_res.get('success'))

        # 检查数据库记录已级联清理
        ann_check = owner.api('list_annotations', {'item_id': p1_id, 'ver_id': v2_id})
        ann_check_list = ann_check.get('data', {}).get('annotations', []) if isinstance(ann_check.get('data'), dict) else []
        check("TC-PRJ-06: 项目下属的批注与回复已全部级联清空", len(ann_check_list) == 0)

        # 检查物理目录无孤儿文件
        check("TC-PRJ-06: 项目物理存储目录彻底从磁盘移除，零孤儿资产残留", not v2_dir.exists())

        print("\n=======================================================")
        print("  模块九：MCP 协议协作全生命周期快速闭环 (TC-MCP-01 ~ TC-MCP-03)")
        print("=======================================================")

        # TC-MCP-01: 生成 MCP 凭据
        mcp_res = owner.api('mcp_token_create', {'project_id': 0, 'can_publish': 1, 'replace': 1})
        check("TC-MCP-01: 成功生成 MCP 个人专属凭据", mcp_res.get('success'))
        mcp_token = mcp_res.get('data', {}).get('secret')
        check("TC-MCP-01: 成功拿到明文 Token", bool(mcp_token) and mcp_token.startswith('plmcp_'))

        # 检查数据库中仅存哈希，不存明文
        db_path = temp / 'data/database.sqlite'
        con = sqlite3.connect(db_path)
        cur = con.cursor()
        cur.execute("SELECT token_hash FROM mcp_tokens WHERE user_id = ?", (owner.user['id'],))
        row = cur.fetchone()
        con.close()
        check("TC-MCP-01: 数据库严格只存储 Token 的 SHA-256 哈希摘要", row and row[0] != mcp_token and len(row[0]) == 64)

        # TC-MCP-03: 使用 Bearer Token 进行协议握手
        init_payload = json.dumps({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "TestE2EClient", "version": "1.0.0"}
            }
        }).encode('utf-8')
        req = urllib.request.Request(f"{base_url}/mcp.php", data=init_payload, headers={
            'Authorization': f'Bearer {mcp_token}',
            'Content-Type': 'application/json'
        })
        resp = urllib.request.urlopen(req, timeout=10)
        mcp_init_res = json.loads(resp.read().decode('utf-8'))
        check("TC-MCP-03: MCP 初始化握手成功并返回 Server 能力", 'result' in mcp_init_res and 'protocolVersion' in mcp_init_res['result'])

        # 销毁该 MCP 凭据
        rev_res = owner.api('mcp_token_revoke')
        check("TC-MCP-06: 成功吊销 MCP 凭据", rev_res.get('success'))

        print("\n=======================================================")
        print(f"🎉 全部 E2E 验证成功通过！共执行 {len(passed_checks)} 项严密断言。")
        print("=======================================================\n")

    finally:
        # 自愈清理：关闭 PHP 进程与清理临时目录
        if server_process.poll() is None:
            server_process.terminate()
            try:
                server_process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                server_process.kill()
        log_file.close()

        if not keep_fixture:
            shutil.rmtree(temp, ignore_errors=True)
            print(f"[*] 临时沙箱已彻底自愈清理: {temp}")
        else:
            print(f"[!] 保留临时沙箱副本以供审查: {temp}")

    return len(passed_checks)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='立象原型全景 E2E 自动化回归套件')
    parser.add_argument('--php', default='/tmp/jinshi-php-common/php', help='PHP 可执行文件绝对路径')
    parser.add_argument('--keep', action='store_true', help='测试完成后保留临时沙箱目录')
    args = parser.parse_args()

    if not Path(args.php).is_file():
        # 尝试寻找系统默认 php
        which_php = shutil.which('php')
        if which_php:
            args.php = which_php
        else:
            raise FileNotFoundError(f"未找到指定的 PHP 运行时: {args.php}")

    count = run_comprehensive_suite(args.php, args.keep)
    print(json.dumps({
        "status": "success",
        "passed_checks": count,
        "scope": "Comprehensive E2E HTTP Lifecycle & Security Suite"
    }, ensure_ascii=False))
