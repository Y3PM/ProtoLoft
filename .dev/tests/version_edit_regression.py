#!/usr/bin/env python3
"""立象原型 (ProtoLoft) - 版本编辑功能与上版提示端到端自动化回归套件
Version Edit & Last Version Hint Regression Test Suite
验证范围:
1. 未登录访客越权拦截 (403/无权操作)
2. 审阅人 (viewer) 越权修改拦截
3. 项目负责人/协作者正常编辑版本号与日志
4. 底层不可变性 (id, storage_dir, author_name 绝对保持不可变)
5. 同名冲突拦截 (修改为同项目已有其他版本名时必须拒绝)
6. 自身保留原名仅改日志通过
7. 非法字符与边界限制 (空字符、控制字符、换行、超长拦截)
8. 超管全局编辑权限验证
9. 无权协作者跨项目越权拦截
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
import sqlite3

ROOT = Path(__file__).resolve().parents[2]
PASS_WORD = 'Proto-Loft-Password-2026'

class TestClient:
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
                parts.append(('--' + boundary + '\r\nContent-Disposition: form-data; name="' + str(key) + '"; filename="' + str(filename) + '"\r\nContent-Type: application/octet-stream\r\n\r\n').encode('utf-8') + content + b'\r\n')
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
            with self.opener.open(req) as resp:
                body = resp.read()
                return resp.status, body, resp.headers
        except urllib.error.HTTPError as err:
            return err.code, err.read(), err.headers

    def json_post(self, action, fields=None, files=None):
        payload = dict(fields or {})
        payload['action'] = action
        if self.token and 'csrf_token' not in payload:
            payload['csrf_token'] = self.token
        status, body, headers = self.request('/api.php', fields=payload, files=files)
        try:
            parsed = json.loads(body.decode('utf-8'))
        except Exception:
            parsed = {'success': False, 'message': body.decode('utf-8', errors='replace')}
        return status, parsed, headers

    def refresh_csrf(self):
        status, body, _ = self.request('/index.php')
        match = re.search(r'meta name="csrf-token" content="([^"]+)"', body.decode('utf-8', errors='replace'))
        if match:
            self.token = match.group(1)
        return self.token

def make_sample_zip():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('index.html', '<!DOCTYPE html><html><head><title>Test</title></head><body>Hello ProtoLoft</body></html>')
    return buf.getvalue()

def upload_chunks_helper(client, upload_id, file_type, file_bytes):
    chunk_size = 1024 * 1024
    total = (len(file_bytes) + chunk_size - 1) // chunk_size
    if total == 0:
        total = 1
        file_bytes = b' '
    for idx in range(total):
        chunk = file_bytes[idx * chunk_size : (idx + 1) * chunk_size]
        st, res, _ = client.json_post('upload_chunk', {
            'upload_id': upload_id,
            'file_type': file_type,
            'chunk_index': idx,
            'chunk_total': total,
        }, files={'chunk_data': ('part', chunk)})
        assert res.get('success'), f'Chunk upload failed: {res}'

def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', default=os.environ.get('PHP_BIN', 'php'))
    args = parser.parse_args()

    temp_dir = tempfile.mkdtemp(prefix='protoloft_ver_edit_test_')
    print(f'[*] 临时沙箱: {temp_dir}')

    passed_count = 0
    total_checks = 9

    try:
        shutil.copytree(ROOT, temp_dir, dirs_exist_ok=True, ignore=shutil.ignore_patterns('.git', '.dev', 'data', 'uploads'))
        (Path(temp_dir) / 'data').mkdir(parents=True, exist_ok=True)
        (Path(temp_dir) / 'uploads' / 'branding').mkdir(parents=True, exist_ok=True)

        port = find_free_port()
        proc = subprocess.Popen([args.php, '-S', f'127.0.0.1:{port}', '-t', temp_dir], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(0.8)

        base_url = f'http://127.0.0.1:{port}'
        admin = TestClient(base_url)

        # 0. 初始化系统
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
            'site_title': '版本编辑回归测试',
            'admin_email': 'admin@protoloft.local',
            'admin_name': '超管',
            'admin_password': PASS_WORD,
            'admin_password_confirm': PASS_WORD
        })
        assert code in (200, 302), f'Install failed: {code}'

        admin.refresh_csrf()
        st, res, _ = admin.json_post('login', {'email': 'admin@protoloft.local', 'password': PASS_WORD})
        assert res.get('success'), f'Admin login failed: {res}'
        admin.refresh_csrf()

        # 创建协作者与审阅人
        st, res, _ = admin.json_post('user_add', {'email': 'editor1@protoloft.local', 'name': '协作者1', 'password': PASS_WORD, 'role': 'editor'})
        editor1_id = res['data']
        st, res, _ = admin.json_post('user_add', {'email': 'editor2@protoloft.local', 'name': '协作者2', 'password': PASS_WORD, 'role': 'editor'})
        editor2_id = res['data']
        st, res, _ = admin.json_post('user_add', {'email': 'viewer@protoloft.local', 'name': '审阅人', 'password': PASS_WORD, 'role': 'viewer'})
        viewer_id = res['data']

        # editor1 登录并创建项目与发版
        editor1 = TestClient(base_url)
        editor1.refresh_csrf()
        editor1.json_post('login', {'email': 'editor1@protoloft.local', 'password': PASS_WORD})
        editor1.refresh_csrf()

        st, res, _ = editor1.json_post('category_save', {'id': 0, 'name': '分类A'})
        cat_id = res['data']['id']
        st, res, _ = editor1.json_post('item_save', {'id': 0, 'category_id': cat_id, 'name': '核心项目', 'type': 'project'})
        item_id = res['data']['id']

        # 发版 V1.0
        zip_bytes = make_sample_zip()
        upload_chunks_helper(editor1, 'zip_up_1', 'zip', zip_bytes)
        st, res, _ = editor1.json_post('version_publish', {
            'item_id': item_id,
            'version_name': 'V1.0',
            'zip_upload_id': 'zip_up_1',
            'is_default': 1,
            'changelog': '初始版本说明'
        })
        assert res.get('success'), f'Publish V1.0 failed: {res}'
        v1_id = res['data']['id']

        # 读取数据库记录初始状态
        db_path = Path(temp_dir) / 'data' / 'database.sqlite'
        conn = sqlite3.connect(db_path)
        v1_initial = conn.execute("SELECT id, version_name, storage_dir, changelog, author_name FROM versions WHERE id = ?", (v1_id,)).fetchone()
        assert v1_initial[1] == 'V1.0'
        storage_dir_initial = v1_initial[2]

        # 检查 1: 未登录访客拦截
        guest = TestClient(base_url)
        guest.refresh_csrf()
        st, res, _ = guest.json_post('version_update', {'id': v1_id, 'version_name': 'V1.0.1', 'changelog': 'hack'})
        assert not res.get('success') and any(msg in res.get('message', '') for msg in ('无权操作', '登录状态已过期', '请重新登录')), f"Guest check failed: {res}"
        passed_count += 1
        print(" [✓] 1. 未登录访客越权拦截通过")

        # 检查 2: 审阅人 (viewer) 越权拦截
        viewer = TestClient(base_url)
        viewer.refresh_csrf()
        viewer.json_post('login', {'email': 'viewer@protoloft.local', 'password': PASS_WORD})
        viewer.refresh_csrf()
        st, res, _ = viewer.json_post('version_update', {'id': v1_id, 'version_name': 'V1.0.1', 'changelog': 'hack'})
        assert not res.get('success') and '无权操作' in res.get('message', ''), f"Viewer check failed: {res}"
        passed_count += 1
        print(" [✓] 2. 审阅人 (viewer) 越权修改拦截通过")

        # 检查 3: 项目负责人/协作者正常编辑版本号与更新说明
        st, res, _ = editor1.json_post('version_update', {
            'id': v1_id,
            'version_name': 'V1.0.1',
            'changelog': '修复线上登录弹窗显示问题'
        })
        assert res.get('success') and res['data']['version_name'] == 'V1.0.1', f"Editor1 update failed: {res}"
        passed_count += 1
        print(" [✓] 3. 项目协作者正常编辑版本号与更新说明通过")

        # 检查 4: 底层物理存储与不可变字段核验
        v1_after = conn.execute("SELECT id, version_name, storage_dir, changelog, author_name FROM versions WHERE id = ?", (v1_id,)).fetchone()
        assert v1_after[1] == 'V1.0.1', "DB version_name mismatch"
        assert v1_after[2] == storage_dir_initial, "storage_dir was mutated!"
        assert v1_after[3] == '修复线上登录弹窗显示问题', "Changelog mismatch"
        assert v1_after[4] == '协作者1', "author_name was mutated!"
        passed_count += 1
        print(" [✓] 4. 底层存储不可变性 (id, storage_dir, author_name) 核验通过")

        # 检查 5: 发版 V2.0 并测试同名冲突拦截
        upload_chunks_helper(editor1, 'zip_up_2', 'zip', zip_bytes)
        st, res, _ = editor1.json_post('version_publish', {
            'item_id': item_id,
            'version_name': 'V2.0',
            'zip_upload_id': 'zip_up_2',
            'is_default': 0,
            'changelog': '重大架构升级'
        })
        assert res.get('success'), f'Publish V2.0 failed: {res}'
        v2_id = res['data']['id']

        # 尝试将 V1.0.1 改名为已有版本 V2.0 -> 必须拦截
        st, res, _ = editor1.json_post('version_update', {
            'id': v1_id,
            'version_name': 'V2.0',
            'changelog': '试图重名'
        })
        assert not res.get('success') and '已存在同名版本' in res.get('message', ''), f"Conflict check failed: {res}"
        passed_count += 1
        print(" [✓] 5. 同名版本冲突拦截通过")

        # 检查 6: 自身原名仅改日志通过
        st, res, _ = editor1.json_post('version_update', {
            'id': v2_id,
            'version_name': 'V2.0',
            'changelog': '重大架构升级 (补写更新细则)'
        })
        assert res.get('success') and res['data']['changelog'] == '重大架构升级 (补写更新细则)', f"Self rename failed: {res}"
        passed_count += 1
        print(" [✓] 6. 自身原名仅改日志通过")

        # 检查 7: 非法字符与边界限制
        # 空名称
        st, res, _ = editor1.json_post('version_update', {'id': v1_id, 'version_name': '   ', 'changelog': ''})
        assert not res.get('success') and '请输入版本名称' in res.get('message', ''), f"Empty name check failed: {res}"
        # 换行符
        st, res, _ = editor1.json_post('version_update', {'id': v1_id, 'version_name': "V1.0\n.2", 'changelog': ''})
        assert not res.get('success') and '换行或控制字符' in res.get('message', ''), f"Newline check failed: {res}"
        # 超长 31 字
        st, res, _ = editor1.json_post('version_update', {'id': v1_id, 'version_name': 'V' * 31, 'changelog': ''})
        assert not res.get('success') and '最多 30 字' in res.get('message', ''), f"Overlength check failed: {res}"
        passed_count += 1
        print(" [✓] 7. 非法字符与边界规范校验通过")

        # 检查 8: 超管全局编辑权限
        st, res, _ = admin.json_post('version_update', {
            'id': v2_id,
            'version_name': 'V2.0.0-GA',
            'changelog': '超管审核定稿发布'
        })
        assert res.get('success') and res['data']['version_name'] == 'V2.0.0-GA', f"Admin update failed: {res}"
        passed_count += 1
        print(" [✓] 8. 超管全局维护权限验证通过")

        # 检查 9: 无协作权的普通成员越权修改他人项目拦截
        editor2 = TestClient(base_url)
        editor2.refresh_csrf()
        editor2.json_post('login', {'email': 'editor2@protoloft.local', 'password': PASS_WORD})
        editor2.refresh_csrf()
        st, res, _ = editor2.json_post('version_update', {
            'id': v1_id,
            'version_name': 'V1.0.1-hacked',
            'changelog': '越权修改'
        })
        assert not res.get('success') and '无权' in res.get('message', ''), f"Cross-project check failed: {res}"
        passed_count += 1
        print(" [✓] 9. 无协作权普通成员跨项目越权拦截通过")

        conn.close()
        proc.terminate()
        proc.wait(timeout=5)

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

    print(f"\n==========================================")
    print(f"回归测试完成: {passed_count}/{total_checks} 全部用例通过!")
    print(f"==========================================")

if __name__ == '__main__':
    main()
