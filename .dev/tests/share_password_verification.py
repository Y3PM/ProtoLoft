#!/usr/bin/env python3
"""立象原型 (ProtoLoft) - 分享密码与随机密码变更生效端到端自动化验证
验证目标:
1. 默认免密状态畅通访问
2. 随机生成公共分享密码并保存后，新密码立即生效 (访客被密码拦截)
3. 错误密码被严格阻断
4. 正确的新密码成功解锁并颁发有效凭据
5. 随机密码再次变更后，已通过旧密码验证的 Cookie/Session 立即失效 (防偷跑)
6. 旧密码彻底失效，唯有新密码能够重新解锁
7. 清空密码后恢复免密直接访问
8. 专属短链随机密码生成、生效与作废全链路
"""
import argparse
import http.cookiejar
import io
import json
import os
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

class Client:
    def __init__(self, base_url):
        self.base = base_url
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.token = ''

    def get(self, path):
        req = urllib.request.Request(self.base + path)
        try:
            with self.opener.open(req) as resp:
                return resp.status, resp.read().decode('utf-8', errors='replace'), resp.headers
        except urllib.error.HTTPError as err:
            return err.code, err.read().decode('utf-8', errors='replace'), err.headers

    def post(self, path, fields):
        data = urllib.parse.urlencode(fields).encode('utf-8')
        headers = {'Content-Type': 'application/x-www-form-urlencoded'}
        if self.token:
            headers['X-CSRF-Token'] = self.token
        req = urllib.request.Request(self.base + path, data=data, headers=headers)
        try:
            with self.opener.open(req) as resp:
                body = resp.read().decode('utf-8', errors='replace')
                return resp.status, body, resp.headers
        except urllib.error.HTTPError as err:
            return err.code, err.read().decode('utf-8', errors='replace'), err.headers

    def json_post(self, action, fields=None, files=None):
        payload = dict(fields or {})
        payload['action'] = action
        if self.token and 'csrf_token' not in payload:
            payload['csrf_token'] = self.token
        data = None
        headers = {}
        if files:
            boundary = 'boundary_' + uuid.uuid4().hex
            parts = []
            for k, v in payload.items():
                parts.append(('--' + boundary + '\r\nContent-Disposition: form-data; name="' + str(k) + '"\r\n\r\n' + str(v) + '\r\n').encode('utf-8'))
            for k, (fn, content) in files.items():
                parts.append(('--' + boundary + '\r\nContent-Disposition: form-data; name="' + str(k) + '"; filename="' + str(fn) + '"\r\nContent-Type: application/octet-stream\r\n\r\n').encode('utf-8') + content + b'\r\n')
            parts.append(('--' + boundary + '--\r\n').encode('utf-8'))
            data = b''.join(parts)
            headers['Content-Type'] = 'multipart/form-data; boundary=' + boundary
        else:
            data = urllib.parse.urlencode(payload).encode('utf-8')
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
        if self.token:
            headers['X-CSRF-Token'] = self.token
        req = urllib.request.Request(self.base + '/api.php', data=data, headers=headers)
        try:
            with self.opener.open(req) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as err:
            try:
                return json.loads(err.read().decode('utf-8'))
            except Exception:
                return {'success': False, 'message': str(err)}

    def refresh_csrf(self):
        st, body, _ = self.get('/index.php')
        m = re.search(r'meta name="csrf-token" content="([^"]+)"', body)
        if m:
            self.token = m.group(1)
        return self.token

def make_sample_zip():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('index.html', '<!DOCTYPE html><html><body><h1>Prototype Loaded Successfully</h1></body></html>')
    return buf.getvalue()

def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', default=os.environ.get('PHP_BIN', 'php'))
    args = parser.parse_args()

    temp_dir = tempfile.mkdtemp(prefix='protoloft_share_pwd_test_')
    print(f'[*] 临时测试沙箱: {temp_dir}')

    try:
        shutil.copytree(ROOT, temp_dir, dirs_exist_ok=True, ignore=shutil.ignore_patterns('.git', '.dev', 'data', 'uploads'))
        (Path(temp_dir) / 'data').mkdir(parents=True, exist_ok=True)
        (Path(temp_dir) / 'uploads' / 'branding').mkdir(parents=True, exist_ok=True)

        port = find_free_port()
        proc = subprocess.Popen([args.php, '-S', f'127.0.0.1:{port}', '-t', temp_dir], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(0.8)

        base_url = f'http://127.0.0.1:{port}'
        admin = Client(base_url)

        # 1. 安装
        st, body, _ = admin.get('/install.php')
        csrf = re.search(r'name="csrf_token" value="([^"]+)"', body).group(1)
        token_p = (Path(temp_dir) / 'data' / 'install_token.php')
        if not token_p.exists(): token_p = (Path(temp_dir) / 'data' / 'install_token.txt')
        install_token = token_p.read_text().splitlines()[-1].strip()
        admin.post('/install.php', {
            'csrf_token': csrf,
            'install_token': install_token,
            'site_title': '密码生效验证平台',
            'admin_email': 'admin@protoloft.local',
            'admin_name': '超管',
            'admin_password': PASS_WORD,
            'admin_password_confirm': PASS_WORD
        })

        admin.refresh_csrf()
        res = admin.json_post('login', {'email': 'admin@protoloft.local', 'password': PASS_WORD})
        assert res.get('success'), f'Login failed: {res}'
        admin.refresh_csrf()

        # 2. 创建项目并发布原型
        res = admin.json_post('category_save', {'id': 0, 'name': '密码测试分类'})
        cat_id = res['data']['id']
        res = admin.json_post('item_save', {'id': 0, 'category_id': cat_id, 'name': '加密分享原型', 'type': 'project'})
        item_id = res['data']['id']

        zip_bytes = make_sample_zip()
        admin.json_post('upload_chunk', {'upload_id': 'up_1', 'file_type': 'zip', 'chunk_index': 0, 'chunk_total': 1}, files={'chunk_data': ('zip', zip_bytes)})
        res = admin.json_post('version_publish', {'item_id': item_id, 'version_name': 'V1.0', 'zip_upload_id': 'up_1', 'is_default': 1, 'changelog': '首版'})
        assert res.get('success'), f'Publish failed: {res}'

        # 获取当前公共分享链接
        res = admin.json_post('item_get_share', {'id': item_id})
        assert res.get('success'), f'Get share failed: {res}'
        share_code = res['data']['share_code']
        share_path = f'/share.php?s={share_code}'
        print(f"[*] 初始公共分享链接: {share_path}")

        # 3. 访客未配置密码时访问 -> 免密直接进入预览
        visitor = Client(base_url)
        st, body, _ = visitor.get(share_path)
        assert st == 200 and 'shareProjPwdInput' not in body, "免密状态被错误拦截"
        # 验证底层原型资产无需密码可直接读取
        st, asset_body, _ = visitor.get('/asset.php/v1/index.html')
        assert st == 200 and 'Prototype Loaded Successfully' in asset_body, "免密未能读取原型资产"
        print(" [✓] 1. 默认免密状态畅通访问通过")

        # 4. 超管在后台生成随机密码并保存 -> 密码改为 'k9X2'
        new_pwd_1 = 'k9X2'
        res = admin.json_post('item_save_share', {'id': item_id, 'share_enabled': 1, 'access_password': new_pwd_1})
        assert res.get('success'), f'Save share pwd 1 failed: {res}'
        print(f"[*] 已在后台保存首个随机密码: {new_pwd_1}")

        # 5. 访客再次访问 -> 必须被拦截并展示密码输入框，且直读 asset 返回 403
        visitor2 = Client(base_url)
        st, body, _ = visitor2.get(share_path)
        assert st == 200 and 'shareProjPwdInput' in body, "未被密码表单拦截"
        st, _, _ = visitor2.get('/asset.php/v1/index.html')
        assert st == 403, "未输密码时应被 asset 拦截为 403"
        print(" [✓] 2. 随机密码保存后，新密码立即生效 (访客被密码表单拦截且资产受保护)")

        # 6. 访客提交错误密码 -> 拦截并提示错误
        st, body, _ = visitor2.post(share_path, {'project_password': 'wrong_password'})
        assert '密码错误，请重新输入' in body, "错误密码未被提示"
        print(" [✓] 3. 错误密码被严格阻断通过")

        # 7. 访客提交正确新密码 'k9X2' -> 解锁并重定向
        st, body, headers = visitor2.post(share_path, {'project_password': new_pwd_1})
        assert st in (302, 200), f"Password post status: {st}"
        # 刷新或跟随重定向
        st, body, _ = visitor2.get(share_path)
        assert 'shareProjPwdInput' not in body, "输入正确新密码后仍显示密码框"
        st, asset_body, _ = visitor2.get('/asset.php/v1/index.html')
        assert st == 200 and 'Prototype Loaded Successfully' in asset_body, "解锁后未能读取原型资产"
        print(" [✓] 4. 正确新密码成功解锁并颁发会话凭据通过")

        # 8. 超管再次变更随机密码 -> 从 'k9X2' 改为 'm8P5'
        new_pwd_2 = 'm8P5'
        res = admin.json_post('item_save_share', {'id': item_id, 'share_enabled': 1, 'access_password': new_pwd_2})
        assert res.get('success'), f'Save share pwd 2 failed: {res}'
        print(f"[*] 再次将随机密码变更为: {new_pwd_2}")

        # 9. 关键验证: 原先已解锁的 visitor2 (持有基于 k9X2 颁发的会话凭据) 刷新页面 -> 必须立刻被拦截！
        st, body, _ = visitor2.get(share_path)
        assert 'shareProjPwdInput' in body, "旧凭据未能自动失效!"
        st, _, _ = visitor2.get('/asset.php/v1/index.html')
        assert st == 403, "旧凭据应无法继续读取 asset 资产"
        print(" [✓] 5. 随机密码再次变更后，已通过旧密码验证的凭据立即失效 (防偷跑机制生效)")

        # 10. visitor2 再次输入旧密码 'k9X2' -> 必须失败
        st, body, _ = visitor2.post(share_path, {'project_password': new_pwd_1})
        assert '密码错误，请重新输入' in body, "旧密码未被拒绝!"
        print(" [✓] 6. 旧密码彻底失效被阻断通过")

        # 11. visitor2 输入新密码 'm8P5' -> 成功解锁
        visitor2.post(share_path, {'project_password': new_pwd_2})
        st, body, _ = visitor2.get(share_path)
        assert 'shareProjPwdInput' not in body, "新密码未能重新解锁"
        st, asset_body, _ = visitor2.get('/asset.php/v1/index.html')
        assert st == 200 and 'Prototype Loaded Successfully' in asset_body, "新密码解锁后未能读取资产"
        print(" [✓] 7. 输入最新随机密码成功重新解锁通过")

        # 12. 超管清空密码 -> 改为免密
        res = admin.json_post('item_save_share', {'id': item_id, 'share_enabled': 1, 'access_password': ''})
        assert res.get('success'), "Clear pwd failed"
        visitor3 = Client(base_url)
        st, body, _ = visitor3.get(share_path)
        assert 'shareProjPwdInput' not in body, "清空密码后未恢复免密"
        print(" [✓] 8. 清空密码后恢复免密直接访问通过")

        # 13. 专属外发短链随机密码验证
        custom_pwd = 'c4R7'
        res = admin.json_post('share_code_create', {
            'item_id': item_id,
            'label': '外发测试',
            'access_password': custom_pwd,
            'expire_preset': 'forever'
        })
        assert res.get('success') and res['data']['access_password'] == custom_pwd, f"Create custom share failed: {res}"
        custom_code = res['data']['code']
        custom_share_path = f'/share.php?s={custom_code}'
        print(f"[*] 创建专属短链: {custom_share_path}，密码: {custom_pwd}")

        # 访客访问专属短链 -> 被密码拦截
        cust_visitor = Client(base_url)
        st, body, _ = cust_visitor.get(custom_share_path)
        assert 'shareProjPwdInput' in body, "专属短链未被密码拦截"
        # 错密码拦截
        st, body, _ = cust_visitor.post(custom_share_path, {'project_password': 'wrong'})
        assert '密码错误，请重新输入' in body
        # 正确专属随机密码解锁
        cust_visitor.post(custom_share_path, {'project_password': custom_pwd})
        st, body, _ = cust_visitor.get(custom_share_path)
        assert 'shareProjPwdInput' not in body, "专属短链输入密码后未解锁"
        print(" [✓] 9. 专属短链随机密码生成与鉴权解锁全链路通过")

        proc.terminate()
        proc.wait(timeout=5)
        print("\n=======================================================")
        print("✨ 分享随机密码变更与鉴权机制全部 9 项验证 100% 通过！")
        print("=======================================================")

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == '__main__':
    main()
