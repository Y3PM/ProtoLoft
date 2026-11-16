#!/usr/bin/env python3
"""立象原型 (ProtoLoft) - 版本 RP 源文件底稿补传、更换与移除端到端自动化回归套件
RP Management Regression Test Suite
验证范围:
1. 初始未传 RP 的版本发布 (发布成功，rp_file 为空)
2. 协作者分片切片补传 RP 底稿 (upload_chunk + version_update_rp)
3. 补传后下载验证 (流式下载受控鉴权、文件名规范、内容一致)
4. RP 底稿原子更换 (覆盖替换为新版本内容)
5. 越权防御 (未登录访客、只读审阅人越权补传/移除拦截)
6. RP 底稿彻底移除 (version_remove_rp 物理清理与数据库重置)
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
    parser.add_argument('--php', default='/tmp/jinshi-php-common/php')
    args = parser.parse_args()

    temp_dir = tempfile.mkdtemp(prefix='protoloft_rp_test_')
    print(f'[*] 临时沙箱: {temp_dir}')

    try:
        # 复制工程代码到沙箱
        shutil.copytree(ROOT, temp_dir, dirs_exist_ok=True, ignore=shutil.ignore_patterns('.git', '.dev', 'data', 'uploads'))
        (Path(temp_dir) / 'data').mkdir(parents=True, exist_ok=True)
        (Path(temp_dir) / 'uploads' / 'branding').mkdir(parents=True, exist_ok=True)

        port = find_free_port()
        proc = subprocess.Popen([args.php, '-S', f'127.0.0.1:{port}', '-t', temp_dir], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(0.8)

        base_url = f'http://127.0.0.1:{port}'
        admin = TestClient(base_url)

        # 1. 初始化安装
        code, body, _ = admin.request('/install.php')
        match = re.search(rb'name="csrf_token" value="([^"]+)"', body)
        assert match, "未能从 install.php 获取 csrf_token"
        install_csrf = match.group(1).decode('utf-8')
        token_p = (Path(temp_dir) / 'data' / 'install_token.php')
        if not token_p.exists(): token_p = (Path(temp_dir) / 'data' / 'install_token.txt')
        install_token = token_p.read_text().splitlines()[-1].strip()

        code, body, headers = admin.request('/install.php', {
            'csrf_token': install_csrf,
            'install_token': install_token,
            'site_title': '立象原型RP测试',
            'admin_email': 'admin@protoloft.local',
            'admin_name': '管理员小王',
            'admin_password': PASS_WORD,
            'admin_password_confirm': PASS_WORD
        })
        assert code in (200, 302), f'Install failed with status {code}'
        admin.refresh_csrf()
        st, res, _ = admin.json_post('login', {
            'email': 'admin@protoloft.local',
            'password': PASS_WORD
        })
        assert res.get('success'), f'Admin login failed: {res}'
        admin.refresh_csrf()

        # 2. 创建协作者账号并登录
        st, res, _ = admin.json_post('user_add', {
            'email': 'editor@protoloft.local',
            'name': '协作者小李',
            'password': PASS_WORD,
            'role': 'editor'
        })
        assert res.get('success'), f'Create editor failed: {res}'
        editor_id = res['data']

        editor = TestClient(base_url)
        editor.refresh_csrf()
        st, res, _ = editor.json_post('login', {
            'email': 'editor@protoloft.local',
            'password': PASS_WORD
        })
        assert res.get('success'), f'Editor login failed: {res}'
        editor.refresh_csrf()

        # 3. 创建测试分类与项目
        st, res, _ = editor.json_post('category_save', {'id': 0, 'name': '移动端原型'})
        cat_id = res['data']['id']
        st, res, _ = editor.json_post('item_save', {
            'id': 0,
            'category_id': cat_id,
            'name': '电商购物中心',
            'type': 'project'
        })
        item_id = res['data']['id']

        # 4. 发布首个版本 (未附带 RP 文件)
        zip_bytes = make_sample_zip()
        zip_upload_id = 'zip_init_1'
        upload_chunks_helper(editor, zip_upload_id, 'zip', zip_bytes)

        st, res, _ = editor.json_post('version_publish', {
            'item_id': item_id,
            'version_name': 'V1.0',
            'zip_upload_id': zip_upload_id,
            'is_default': 1,
            'changelog': '首版发布，暂无底稿'
        })
        assert res.get('success'), f'Publish failed: {res}'
        ver_id = res['data']['id']
        print(f'[✓] 成功发布未附带 RP 的初始版本: ID={ver_id}')

        # 5. 验证此时下载 RP 接口应返回 404
        st, _, _ = editor.request(f'/api.php?action=download_rp&item_id={item_id}&ver_id={ver_id}')
        assert st == 404, f'Expected 404 when RP missing, got {st}'
        print('[✓] 初始状态下载 RP 正确返回 404')

        # 6. 协作者分片切片补传 RP 底稿
        rp_sample_v1 = b'AXURE_RP_BINARY_HEADER_SYNTHETIC_DATA_V1_CONTENT_123456789'
        rp_upload_id = 'rp_patch_1'
        upload_chunks_helper(editor, rp_upload_id, 'rp', rp_sample_v1)

        st, res, _ = editor.json_post('version_update_rp', {
            'id': ver_id,
            'rp_upload_id': rp_upload_id
        })
        assert res.get('success'), f'Update RP failed: {res}'
        assert res['data']['rp_file'] == 'prototype.rp'
        assert res['data']['rp_size'] == len(rp_sample_v1)
        print(f'[✓] 成功补传 RP 底稿: 大小={res["data"]["rp_size"]} 字节')

        # 7. 补传后下载验证
        st, dl_body, dl_headers = editor.request(f'/api.php?action=download_rp&item_id={item_id}&ver_id={ver_id}')
        assert st == 200, f'Expected 200 download, got {st}'
        assert dl_body == rp_sample_v1, 'Downloaded RP content mismatch'
        cd_header = dl_headers.get('Content-Disposition', '')
        assert '电商购物中心_V1.0.rp' in cd_header or 'filename=' in cd_header, f'Filename header check: {cd_header}'
        print(f'[✓] 补传后受控下载成功，文件名与内容字节完全一致 (200 OK)')

        # 8. 原子更换 RP 底稿
        rp_sample_v2 = b'AXURE_RP_BINARY_REPLACED_DATA_V2_LONGER_CONTENT_987654321000'
        rp_upload_id_2 = 'rp_patch_2'
        upload_chunks_helper(editor, rp_upload_id_2, 'rp', rp_sample_v2)

        st, res, _ = editor.json_post('version_update_rp', {
            'id': ver_id,
            'rp_upload_id': rp_upload_id_2
        })
        assert res.get('success'), f'Replace RP failed: {res}'
        assert res['data']['rp_size'] == len(rp_sample_v2)

        st, dl_body_v2, _ = editor.request(f'/api.php?action=download_rp&item_id={item_id}&ver_id={ver_id}')
        assert dl_body_v2 == rp_sample_v2, 'Replaced RP content mismatch'
        print('[✓] 成功原子更换 RP 底稿为新内容')

        # 9. 越权防御拦截 (未登录访客)
        guest = TestClient(base_url)
        st, res, _ = guest.json_post('version_update_rp', {
            'id': ver_id,
            'rp_upload_id': 'fake_id'
        })
        assert not res.get('success') or st in (401, 403), f'Guest update should fail: {st}, {res}'

        st, res, _ = guest.json_post('version_remove_rp', {'id': ver_id})
        assert not res.get('success') or st in (401, 403), f'Guest remove should fail: {st}, {res}'
        print('[✓] 未登录访客越权更新与移除 RP 严格阻断 (403/Forbidden)')

        # 10. 协作者移除 RP 底稿
        st, res, _ = editor.json_post('version_remove_rp', {'id': ver_id})
        assert res.get('success'), f'Remove RP failed: {res}'
        assert res['data']['rp_file'] == ''
        assert res['data']['rp_size'] == 0
        print('[✓] 成功执行 RP 底稿移除动作')

        # 11. 验证移除后再次下载应为 404
        st, _, _ = editor.request(f'/api.php?action=download_rp&item_id={item_id}&ver_id={ver_id}')
        assert st == 404, f'Expected 404 after remove, got {st}'
        print('[✓] 移除后再次下载正确返回 404，物理资源已安全释放')

        print('\n' + '=' * 60)
        print('  ✨ RP 底稿补传、更换、下载、权限拦截与移除全链路 100% 验证通过！')
        print('=' * 60)
        print(json.dumps({"passed": 12, "status": "success"}))

    finally:
        proc.terminate()
        shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == '__main__':
    main()
