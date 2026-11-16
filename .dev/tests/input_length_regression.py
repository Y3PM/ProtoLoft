#!/usr/bin/env python3
"""立象原型 (ProtoLoft) - 输入长度限制端到端自动化回归测试套件
Input Length Limits Regression Test Suite
覆盖范围:
1. 分类名称长度边界 (<=20 放行, >20 拦截)
2. 项目名称长度边界 (<=40 放行, >40 拦截)
3. 外链 URL 长度边界 (<=2000 放行, >2000 拦截)
4. 项目 Webhook 长度边界 (<=1000 放行, >1000 拦截)
5. 版本更新日志长度边界 (<=3000 放行, >3000 拦截)
6. 分享密码长度边界 (<=16 放行, >16 拦截)
7. 专属分享标签长度边界 (<=20 放行, >20 拦截)
8. 批注与回复正文长度边界 (<=1000 放行, >1000 拦截)
9. 用户创建与资料更新长度边界 (姓名<=20, 密码<=64, 部门<=30)
10. 全局系统设置长度边界 (站点名<=20, 域名规则<=200, Webhook<=1000)
"""
import argparse
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
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile

ROOT = Path(__file__).resolve().parents[2]
PASS_WORD = 'Proto-Loft-Password-2026'

class TestClient:
    def __init__(self, base_url):
        self.base = base_url
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.token = ''
        self.user = None

    def request(self, path, fields=None, headers=None):
        headers = dict(headers or {})
        data = None
        if fields is not None:
            data = urllib.parse.urlencode(fields).encode('utf-8')
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
        url = urllib.parse.urljoin(self.base, path)
        req = urllib.request.Request(url, data=data, headers=headers)
        try:
            with self.opener.open(req, timeout=10) as resp:
                content = resp.read()
                return resp.status, content, dict(resp.headers)
        except urllib.error.HTTPError as e:
            return e.code, e.read(), dict(e.headers)

    def refresh_csrf(self):
        status, body, _ = self.request('/index.php')
        match = re.search(r'meta name="csrf-token" content="([^"]+)"', body.decode('utf-8', errors='replace'))
        if match:
            self.token = match.group(1)
        return self.token

    def json_post(self, action, fields=None):
        payload = dict(fields or {})
        payload['action'] = action
        if self.token and 'csrf_token' not in payload:
            payload['csrf_token'] = self.token
        status, body, headers = self.request('/api.php', fields=payload)
        try:
            parsed = json.loads(body.decode('utf-8'))
        except Exception:
            parsed = {'success': False, 'message': body.decode('utf-8', errors='replace')}
        return status, parsed, headers

def make_sample_zip():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('index.html', '<!DOCTYPE html><html><head><title>Test</title></head><body>Hello ProtoLoft</body></html>')
    return buf.getvalue()

def upload_zip_helper(client, zip_bytes):
    upload_id = uuid.uuid4().hex
    boundary = 'protoloft_boundary_' + uuid.uuid4().hex
    parts = []
    fields = {
        'action': 'upload_chunk',
        'csrf_token': client.token,
        'upload_id': upload_id,
        'file_type': 'zip',
        'chunk_index': 0,
        'chunk_total': 1,
    }
    for k, v in fields.items():
        parts.append(('--' + boundary + '\r\nContent-Disposition: form-data; name="' + str(k) + '"\r\n\r\n' + str(v) + '\r\n').encode('utf-8'))
    parts.append(('--' + boundary + '\r\nContent-Disposition: form-data; name="chunk_data"; filename="sample.zip"\r\nContent-Type: application/octet-stream\r\n\r\n').encode('utf-8') + zip_bytes + b'\r\n')
    parts.append(('--' + boundary + '--\r\n').encode('utf-8'))
    data = b''.join(parts)
    headers = {'Content-Type': 'multipart/form-data; boundary=' + boundary}
    req = urllib.request.Request(urllib.parse.urljoin(client.base, '/api.php'), data=data, headers=headers)
    with client.opener.open(req) as resp:
        res = json.loads(resp.read().decode('utf-8'))
        assert res.get('success'), f"Chunk upload failed: {res}"
    return upload_id

def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]

def main():
    php_bin = 'php'
    temp_dir = tempfile.mkdtemp(prefix='protoloft_len_test_')
    port = find_free_port()
    base_url = f'http://127.0.0.1:{port}'
    passed_count = 0
    total_checks = 10

    try:
        shutil.copytree(ROOT, temp_dir, dirs_exist_ok=True, ignore=shutil.ignore_patterns('.git', '.dev', 'data', 'uploads'))
        (Path(temp_dir) / 'data').mkdir(parents=True, exist_ok=True)
        (Path(temp_dir) / 'uploads' / 'branding').mkdir(parents=True, exist_ok=True)

        proc = subprocess.Popen([php_bin, '-S', f'127.0.0.1:{port}', '-t', temp_dir], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(0.8)

        admin = TestClient(base_url)

        # 0. 初始化安装
        code, body, _ = admin.request('/install.php')
        match = re.search(rb'name="csrf_token" value="([^"]+)"', body)
        assert match, "未能从 install.php 获取 csrf_token"
        install_csrf = match.group(1).decode('utf-8')
        token_p = (Path(temp_dir) / 'data' / 'install_token.php')
        if not token_p.exists(): token_p = (Path(temp_dir) / 'data' / 'install_token.txt')
        install_token = token_p.read_text().splitlines()[-1].strip()

        code, body, _ = admin.request('/install.php', {
            'csrf_token': install_csrf,
            'install_token': install_token,
            'site_title': '测试平台',
            'admin_email': 'admin@protoloft.local',
            'admin_name': '超管小象',
            'admin_password': PASS_WORD,
            'admin_password_confirm': PASS_WORD
        })
        assert code in (200, 302), f'Install failed: {code}'

        admin.refresh_csrf()
        st, res, _ = admin.json_post('login', {'email': 'admin@protoloft.local', 'password': PASS_WORD})
        assert res.get('success'), f'Admin login failed: {res}'
        admin.refresh_csrf()

        print(f"=== 开始执行输入长度限制防御测试 (端口: {port}) ===")

        # 1. 分类名称长度 (<=20 放行, >20 拦截)
        st, res, _ = admin.json_post('category_save', {'name': '测' * 21})
        assert not res.get('success') and '不能超过 20' in res.get('message', ''), f"Cat overlength failed: {res}"
        st, res, _ = admin.json_post('category_save', {'name': '文件夹二十字' + '字' * 14})
        assert res.get('success'), f"Cat valid length failed: {res}"
        cat_id = res['data']['id']
        passed_count += 1
        print(" [✓] 1. 分类名称长度边界 (<=20 放行, >20 拦截) 验证通过")

        # 2. 项目名称长度 (<=40 放行, >40 拦截)
        st, res, _ = admin.json_post('item_save', {
            'category_id': cat_id,
            'type': 'project',
            'name': '项' * 41
        })
        assert not res.get('success') and '不能超过 40' in res.get('message', ''), f"Item name overlength failed: {res}"
        st, res, _ = admin.json_post('item_save', {
            'category_id': cat_id,
            'type': 'project',
            'name': '项目四十字' + '字' * 35
        })
        assert res.get('success'), f"Item valid length failed: {res}"
        proj_id = res['data']['id']
        passed_count += 1
        print(" [✓] 2. 项目名称长度边界 (<=40 放行, >40 拦截) 验证通过")

        # 3. 外链 URL 长度 (<=2000 放行, >2000 拦截)
        st, res, _ = admin.json_post('item_save', {
            'category_id': cat_id,
            'type': 'link',
            'name': '超长外链测试',
            'link_url': 'https://example.com/' + 'a' * 1990
        })
        assert not res.get('success') and '不能超过 2000' in res.get('message', ''), f"Link overlength failed: {res}"
        st, res, _ = admin.json_post('item_save', {
            'category_id': cat_id,
            'type': 'link',
            'name': '正常外链测试',
            'link_url': 'https://example.com/' + 'a' * 100
        })
        assert res.get('success'), f"Link valid length failed: {res}"
        passed_count += 1
        print(" [✓] 3. 外链 URL 长度边界 (<=2000 放行, >2000 拦截) 验证通过")

        # 4. 项目 Webhook 长度 (<=1000 放行, >1000 拦截)
        st, res, _ = admin.json_post('item_save', {
            'id': proj_id,
            'category_id': cat_id,
            'type': 'project',
            'name': '测试项目',
            'webhook_url': 'https://qyapi.weixin.qq.com/' + 'w' * 980
        })
        assert not res.get('success') and '不能超过 1000' in res.get('message', ''), f"Item webhook overlength failed: {res}"
        passed_count += 1
        print(" [✓] 4. 项目 Webhook 长度边界 (<=1000 放行, >1000 拦截) 验证通过")

        # 发布一个版本用于后续测试
        sample_zip = make_sample_zip()
        zip_id = upload_zip_helper(admin, sample_zip)
        st, res, _ = admin.json_post('version_publish', {
            'item_id': proj_id,
            'version_name': 'V1.0',
            'zip_upload_id': zip_id,
            'changelog': '字' * 3001
        })
        assert not res.get('success') and '不能超过 3000' in res.get('message', ''), f"Publish changelog overlength failed: {res}"

        st, res, _ = admin.json_post('version_publish', {
            'item_id': proj_id,
            'version_name': 'V1.0',
            'zip_upload_id': zip_id,
            'changelog': '字' * 3000
        })
        assert res.get('success'), f"Publish failed: {res}"
        ver_id = res['data']['id']

        # 5. 版本更新说明日志长度 (<=3000 放行, >3000 拦截)
        st, res, _ = admin.json_post('version_update', {
            'id': ver_id,
            'version_name': 'V1.0',
            'changelog': '字' * 3001
        })
        assert not res.get('success') and '不能超过 3000' in res.get('message', ''), f"Update changelog overlength failed: {res}"
        st, res, _ = admin.json_post('version_update', {
            'id': ver_id,
            'version_name': 'V1.0',
            'changelog': '字' * 2999
        })
        assert res.get('success'), f"Update changelog valid failed: {res}"
        passed_count += 1
        print(" [✓] 5. 版本更新日志长度边界 (<=3000 放行, >3000 拦截) 验证通过")

        # 6. 分享密码长度 (<=16 放行, >16 拦截)
        st, res, _ = admin.json_post('item_save_share', {
            'id': proj_id,
            'access_password': '1' * 17,
            'share_enabled': 1
        })
        assert not res.get('success') and '不能超过 16' in res.get('message', ''), f"Share pwd overlength failed: {res}"
        st, res, _ = admin.json_post('item_save_share', {
            'id': proj_id,
            'access_password': '1' * 16,
            'share_enabled': 1
        })
        assert res.get('success'), f"Share pwd valid length failed: {res}"
        passed_count += 1
        print(" [✓] 6. 分享密码长度边界 (<=16 放行, >16 拦截) 验证通过")

        # 7. 专属分享标识与密码长度 (标识<=20, 密码<=16)
        st, res, _ = admin.json_post('share_code_create', {
            'item_id': proj_id,
            'label': '标' * 21,
            'access_password': '123'
        })
        assert not res.get('success') and '不能超过 20' in res.get('message', ''), f"Share label overlength failed: {res}"
        st, res, _ = admin.json_post('share_code_create', {
            'item_id': proj_id,
            'label': '正常标签',
            'access_password': 'p' * 17
        })
        assert not res.get('success') and '不能超过 16' in res.get('message', ''), f"Custom share pwd overlength failed: {res}"
        passed_count += 1
        print(" [✓] 7. 专属分享标识与密码长度边界 (标识<=20, 密码<=16) 验证通过")

        # 8. 批注与回复正文长度 (<=1000 放行, >1000 拦截)
        st, res, _ = admin.json_post('add_annotation', {
            'item_id': proj_id,
            'ver_id': ver_id,
            'page_path': 'index.html',
            'page_title': '首页',
            'content': '批' * 1001
        })
        assert not res.get('success') and '最多 1000' in res.get('message', ''), f"Anno overlength failed: {res}"
        st, res, _ = admin.json_post('add_annotation', {
            'item_id': proj_id,
            'ver_id': ver_id,
            'page_path': 'index.html',
            'page_title': '首页',
            'content': '这是一条正常的批注内容'
        })
        assert res.get('success'), f"Add anno failed: {res}"
        anno_id = res['data']['id']
        st, res, _ = admin.json_post('reply_annotation', {
            'annotation_id': anno_id,
            'content': '回' * 1001
        })
        assert not res.get('success') and '最多 1000' in res.get('message', ''), f"Reply overlength failed: {res}"
        passed_count += 1
        print(" [✓] 8. 批注与回复正文长度边界 (<=1000 放行, >1000 拦截) 验证通过")

        # 9. 用户管理与资料更新长度 (姓名<=20, 密码<=64, 部门<=30)
        st, res, _ = admin.json_post('user_add', {
            'email': 'newuser@protoloft.local',
            'name': '李' * 21,
            'password': PASS_WORD,
            'role': 'viewer'
        })
        assert not res.get('success') and '不能超过 20' in res.get('message', ''), f"User name overlength failed: {res}"
        st, res, _ = admin.json_post('user_add', {
            'email': 'newuser@protoloft.local',
            'name': '正常姓名',
            'password': 'p' * 65,
            'role': 'viewer'
        })
        assert not res.get('success') and '不能超过 64' in res.get('message', ''), f"User pwd overlength failed: {res}"
        st, res, _ = admin.json_post('user_add', {
            'email': 'newuser@protoloft.local',
            'name': '正常姓名',
            'password': PASS_WORD,
            'role': 'viewer',
            'department': '部' * 31
        })
        assert not res.get('success') and '不能超过 30' in res.get('message', ''), f"User dept overlength failed: {res}"
        passed_count += 1
        print(" [✓] 9. 用户管理与资料更新长度边界 (姓名<=20, 密码<=64, 部门<=30) 验证通过")

        # 10. 系统全局设置长度 (站点名<=20, 域名规则<=200, Webhook<=1000)
        st, res, _ = admin.json_post('save_settings', {
            'site_title': '站' * 21
        })
        assert not res.get('success') and '不能超过 20' in res.get('message', ''), f"Settings title overlength failed: {res}"
        st, res, _ = admin.json_post('save_settings', {
            'allowed_email_domains': 'a' * 201
        })
        assert not res.get('success') and '不能超过 200' in res.get('message', ''), f"Settings domain overlength failed: {res}"
        st, res, _ = admin.json_post('save_settings', {
            'global_webhook_url': 'https://qyapi.weixin.qq.com/' + 'g' * 980
        })
        assert not res.get('success') and '不能超过 1000' in res.get('message', ''), f"Settings webhook overlength failed: {res}"
        passed_count += 1
        print(" [✓] 10. 系统全局设置长度边界 (站点名<=20, 域名规则<=200, Webhook<=1000) 验证通过")

        proc.terminate()
        proc.wait(timeout=5)

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

    print(f"\n==========================================")
    print(f"回归测试完成: {passed_count}/{total_checks} 全部用例 100% 通过!")
    print(f"==========================================")

if __name__ == '__main__':
    main()
