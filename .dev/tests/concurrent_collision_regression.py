#!/usr/bin/env python3
"""立象原型 (ProtoLoft) - 两人同时使用并发写入快照锁回归测试 (P1-1)
Two ordinary requests overlap and neither fails with database is locked / SQLITE_BUSY_SNAPSHOT.

场景覆盖：
1. 普通并发登录 (Auth::login)
2. 并发个人改密 (change_my_password)
3. 并发上传 120MB RP 源文件底稿 (version_update_rp)
4. 并发同名覆盖发版 4000 文件 + 40MB (version_publish)
"""
import argparse
import http.cookiejar
import io
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
PW = 'Proto-Loft-Password-2026'
NEW_PW = 'Another-Pass-2026'
ADMIN_EMAIL = 'admin@protoloft.local'


class Client:
    def __init__(self, base):
        self.base = base
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.token = ''

    def get(self, path):
        req = urllib.request.Request(self.base + path)
        try:
            with self.opener.open(req, timeout=120) as r:
                return r.status, r.read().decode('utf-8', 'replace'), r.headers
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode('utf-8', 'replace'), e.headers

    def post(self, path, fields):
        data = urllib.parse.urlencode(fields).encode()
        req = urllib.request.Request(self.base + path, data=data, headers={'Content-Type': 'application/x-www-form-urlencoded'})
        with self.opener.open(req, timeout=120) as r:
            return r.status, r.read().decode('utf-8', 'replace')

    def api(self, action, fields=None, files=None):
        payload = dict(fields or {})
        payload['action'] = action
        if self.token:
            payload['csrf_token'] = self.token
        headers = {}
        if files:
            boundary = 'b_' + uuid.uuid4().hex
            parts = []
            for k, v in payload.items():
                parts.append(('--%s\r\nContent-Disposition: form-data; name="%s"\r\n\r\n%s\r\n' % (boundary, k, v)).encode())
            for k, content in files.items():
                parts.append(('--%s\r\nContent-Disposition: form-data; name="%s"; filename="c.bin"\r\nContent-Type: application/octet-stream\r\n\r\n' % (boundary, k)).encode() + content + b'\r\n')
            parts.append(('--%s--\r\n' % boundary).encode())
            data = b''.join(parts)
            headers['Content-Type'] = 'multipart/form-data; boundary=' + boundary
        else:
            data = urllib.parse.urlencode(payload).encode()
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
        if self.token:
            headers['X-CSRF-Token'] = self.token
        req = urllib.request.Request(self.base + '/api.php', data=data, headers=headers)
        try:
            with self.opener.open(req, timeout=300) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            return {'success': False, 'message': 'HTTP %s' % e.code}

    def refresh_csrf(self):
        _, body, _ = self.get('/index.php')
        m = re.search(r'meta name="csrf-token" content="([^"]+)"', body)
        if m:
            self.token = m.group(1)
        return self.token


def pick_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def big_zip(n_files, target_mb):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('index.html', '<!DOCTYPE html><html><body><h1>entry</h1></body></html>')
        per_file = max(1, int(target_mb * 1024 * 1024 / max(1, n_files)))
        payload = os.urandom(min(per_file, 8192))
        for i in range(n_files):
            data = payload * (per_file // len(payload)) + payload[:per_file % len(payload)]
            zf.writestr('assets/file_%04d.dat' % i, data)
    return buf.getvalue()


def fmt(res):
    if not isinstance(res, dict):
        return repr(res)
    msg = res.get('message', '')
    return 'success=%-5s message=%r' % (str(res.get('success')), msg)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', default='php', help='Path to php binary')
    args, unknown = parser.parse_known_args()
    php_bin = args.php

    temp = Path(tempfile.mkdtemp(prefix='pl_collision_test_'))
    proc = None
    try:
        # 复制业务源码到全新隔离运行环境
        for item in ['index.php', 'api.php', 'share.php', 'install.php', 'asset.php', 'mcp.php', 'includes', 'assets']:
            src = ROOT / item
            dst = temp / item
            if src.is_dir():
                shutil.copytree(str(src), str(dst))
            elif src.is_file():
                shutil.copy2(str(src), str(dst))
        (temp / 'data').mkdir(parents=True, exist_ok=True)
        (temp / 'uploads' / 'branding').mkdir(parents=True, exist_ok=True)

        port = pick_port()
        base = 'http://127.0.0.1:%d' % port
        env = os.environ.copy()
        env['PHP_CLI_SERVER_WORKERS'] = '8'
        proc = subprocess.Popen(
            [php_bin, '-S', '127.0.0.1:%d' % port, '-t', str(temp)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=env
        )

        for _ in range(50):
            try:
                urllib.request.urlopen(base + '/install.php', timeout=1)
                break
            except Exception:
                time.sleep(0.1)

        inst = Client(base)
        _, body, _ = inst.get('/install.php')
        csrf = re.search(r'name="csrf_token"\s+value="([^"]+)"', body).group(1)
        token = (temp / 'data' / 'install_token.php').read_text().strip().split()[-1]
        inst.post('/install.php', {
            'step': '3',
            'csrf_token': csrf,
            'install_token': token,
            'site_title': 'Collision Test',
            'admin_name': 'Admin',
            'admin_email': ADMIN_EMAIL,
            'admin_password': PW,
            'admin_password_confirm': PW
        })

        a = Client(base)
        a.refresh_csrf()
        login_res = a.api('login', {'email': ADMIN_EMAIL, 'password': PW})
        assert login_res.get('success'), f"Admin login failed: {login_res}"
        a.refresh_csrf()

        cat = a.api('category_save', {'name': 'TestCat'})['data']['id']
        item_id = a.api('item_save', {'category_id': cat, 'type': 'project', 'name': 'P1'})['data']['id']
        a.api('upload_chunk', {'upload_id': 'u0', 'file_type': 'zip', 'chunk_index': 0, 'chunk_total': 1},
               files={'chunk_data': big_zip(0, 0)})
        assert a.api('version_publish', {'item_id': item_id, 'version_name': 'V1', 'zip_upload_id': 'u0', 'is_default': 1, 'changelog': 'c'}).get('success')

        a.api('user_add', {'email': 'u2@protoloft.local', 'name': 'U2', 'password': 'Editor-Pass-2026', 'role': 'editor'})
        b = Client(base)
        b.refresh_csrf()
        assert b.api('login', {'email': 'u2@protoloft.local', 'password': 'Editor-Pass-2026'}).get('success'), 'B login'
        b.refresh_csrf()
        nudge = [0]

        def unrelated_write():
            nudge[0] += 1
            return b.api('log_workspace_access', {'item_id': item_id, 'ver_name': 'nudge-%d' % nudge[0]})

        def race(action, delay):
            box = {}
            def run():
                box['res'] = action()
            th = threading.Thread(target=run)
            th.start()
            time.sleep(delay)
            box['nudge'] = unrelated_write()
            th.join()
            return box.get('res'), box.get('nudge')

        # 1. 登录场景
        durations = []
        for _ in range(2):
            c = Client(base)
            c.refresh_csrf()
            t0 = time.time()
            res = c.api('login', {'email': ADMIN_EMAIL, 'password': PW})
            assert res.get('success')
            durations.append(time.time() - t0)
        t = max(durations)

        for _ in range(3):
            c = Client(base)
            c.refresh_csrf()
            r, n = race(lambda: c.api('login', {'email': ADMIN_EMAIL, 'password': PW}), t * 0.5)
            assert r and r.get('success'), f"Login collision failed: {r}"
            assert n and n.get('success'), f"B write failed during login: {n}"
        print("  ✓ PASS: 场景 1 登录并发碰撞 3/3 成功通过")

        # 2. 改密场景
        current = [PW]
        a.refresh_csrf()
        r0 = a.api('change_my_password', {'old_password': current[0], 'new_password': NEW_PW, 'confirm_password': NEW_PW})
        assert r0.get('success')
        current[0] = NEW_PW
        a.refresh_csrf()

        for i in range(3):
            nxt = 'Third-Pass-2026-%d' % i
            r, n = race(lambda: a.api('change_my_password', {'old_password': current[0], 'new_password': nxt, 'confirm_password': nxt}), t)
            assert r and r.get('success'), f"Password change collision failed: {r}"
            assert n and n.get('success'), f"B write failed during password change: {n}"
            current[0] = nxt
            a.refresh_csrf()
        print("  ✓ PASS: 场景 2 改密并发碰撞 3/3 成功通过")

        # 3. RP 上传合并场景 (120MB)
        ver_id = 1
        rp = [os.urandom(1024 * 1024) for _ in range(120)]
        def rp_upload(tag):
            for idx, chunk in enumerate(rp):
                a.api('upload_chunk', {'upload_id': tag, 'file_type': 'rp', 'chunk_index': idx, 'chunk_total': len(rp)}, files={'chunk_data': chunk})
            return lambda: a.api('version_update_rp', {'id': ver_id, 'rp_upload_id': tag})

        for i in range(3):
            r, n = race(rp_upload('rp_%d' % i), 0.25)
            assert r and r.get('success'), f"RP update collision failed: {r}"
            assert n and n.get('success'), f"B write failed during RP merge: {n}"
            a.api('version_remove_rp', {'id': ver_id})
        print("  ✓ PASS: 场景 3 大文件 RP 上传合并并发碰撞 3/3 成功通过")

        # 4. 覆盖发版场景 (4000文件 + 40MB)
        z = big_zip(4000, 40)
        chunks = [z[i:i + 1048576] for i in range(0, len(z), 1048576)]
        def overwrite(tag):
            for idx, chunk in enumerate(chunks):
                a.api('upload_chunk', {'upload_id': tag, 'file_type': 'zip', 'chunk_index': idx, 'chunk_total': len(chunks)}, files={'chunk_data': chunk})
            tok = a.api('version_check_name', {'item_id': item_id, 'version_name': 'V1'})['data']['overwrite_token']
            def call():
                return a.api('version_publish', {'item_id': item_id, 'version_name': 'V1', 'zip_upload_id': tag,
                                                  'overwrite_token': tok, 'is_default': 1, 'changelog': 'c'})
            return call

        for i in range(3):
            r, n = race(overwrite('ov_%d' % i), 1.0)
            assert r and r.get('success'), f"Overwrite publish collision failed: {r}"
            assert n and n.get('success'), f"B write failed during extract: {n}"
        print("  ✓ PASS: 场景 4 同名覆盖发版并发碰撞 3/3 成功通过")

        print("\nALL 4 CONCURRENT COLLISION SUITES PASSED (12/12 ASSERTIONS OK)!")
    finally:
        if proc:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except Exception:
                proc.kill()
        shutil.rmtree(str(temp), ignore_errors=True)


if __name__ == '__main__':
    main()
