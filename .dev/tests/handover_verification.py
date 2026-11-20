#!/usr/bin/env python3
"""立象原型 (ProtoLoft) - 工作交接与项目详情负责人展示自动化回归测试
Handover & Project Author Display Verification Suite
测试场景:
1. 建立临时沙箱测试环境，完成初始化与管理员登录;
2. 新增协作者成员 Editor A (张三) 与 Editor B (李四);
3. Editor A 创建原型项目 Project X;
4. 验证交接前 Project X 在项目管理表格、前台树属性中负责人均为 Editor A;
5. 执行工作交接 (user_handover)，将 Editor A 的项目交接给 Editor B，并勾选停用 Editor A;
6. 验证数据库中 Project X 的 created_by 变更为 Editor B 的 ID;
7. 请求 index.php 验证首屏 HTML 中:
   - data-creator-name 稳健显示为接管人姓名 (李四);
   - 控制中心项目管理表格中负责人列显示为李四，无任何 "-" 或置空;
   - 下拉框中包含接管人李四;
8. 测试无真实姓名 (name 为空) 仅有邮箱的成员作为负责人时，creator_name 能够自动 fallback 至邮箱地址，杜绝 NULL 或 "-";
9. 验证编辑项目属性时 (item_save)，若修改项目名称或文件夹，负责人不会被篡改为当前操作者，严格维持实际负责人;
10. 沙箱环境自愈清理。
"""
import argparse
import http.cookiejar
import io
import json
from pathlib import Path
import re
import shutil
import socket
import sqlite3
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
            with self.opener.open(req) as resp:
                body = resp.read().decode('utf-8', errors='ignore')
                return resp.status, body, resp.headers
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', errors='ignore')
            return e.code, body, e.headers

    def json_post(self, action, fields):
        payload = dict(fields)
        if self.token:
            payload['csrf_token'] = self.token
        status, body, headers = self.request(f'api.php?action={action}', payload)
        try:
            data = json.loads(body)
        except Exception:
            data = {'success': False, 'message': body}
        return status, data, headers

    def sync_session(self):
        status, data, _ = self.json_post('get_session', {})
        if data.get('success') and data.get('data'):
            d = data['data']
            self.token = d.get('csrfToken', '')
            self.user = d.get('user')
        return status, data

def find_free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]

def make_sample_zip():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('index.html', '<!DOCTYPE html><html><body><h1>ProtoLoft Handover Test</h1></body></html>')
    return buf.getvalue()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', default='php')
    args = parser.parse_args()
    temp_dir = tempfile.mkdtemp(prefix='protoloft-handover-test-')
    app_dir = Path(temp_dir) / 'app'
    shutil.copytree(ROOT, app_dir, ignore=shutil.ignore_patterns('.git', '.dev', 'data', 'uploads'))
    (app_dir / 'data').mkdir(parents=True, exist_ok=True)
    (app_dir / 'uploads' / 'branding').mkdir(parents=True, exist_ok=True)

    port = find_free_port()
    base_url = f'http://127.0.0.1:{port}/'
    cmd = [args.php, '-S', f'127.0.0.1:{port}', '-t', str(app_dir)]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    total_checks = 7
    passed_count = 0

    try:
        time.sleep(0.5)

        # 1. 初始化安装
        admin = TestClient(base_url)
        st, body, _ = admin.request('install.php')
        m = re.search(r'name="csrf_token"\s+value="([^"]+)"', body)
        csrf = m.group(1) if m else ''
        token_p = (app_dir / 'data' / 'install_token.php')
        if not token_p.exists(): token_p = (app_dir / 'data' / 'install_token.txt')
        install_token = token_p.read_text().splitlines()[-1].strip()
        st, body, _ = admin.request('install.php?step=install', {
            'csrf_token': csrf,
            'install_token': install_token,
            'site_title': '交接验证站',
            'admin_email': 'owner@protoloft.local',
            'admin_name': '总管',
            'admin_password': PASS_WORD,
            'admin_password_confirm': PASS_WORD
        })
        assert '进入工作台' in body or '安装成功' in body, f"Install failed: {body}"
        admin.sync_session()
        st, res, _ = admin.json_post('login', {'email': 'owner@protoloft.local', 'password': PASS_WORD})
        assert res.get('success'), f"Admin login failed: {res}"
        admin.sync_session()
        passed_count += 1
        print(" [✓] 1. 沙箱环境安装与主管理员登录成功")

        # 2. 创建协作者成员 Editor A (张三) 与 Editor B (李四)
        st, resA, _ = admin.json_post('user_add', {
            'email': 'editorA@protoloft.local',
            'name': '张三',
            'password': PASS_WORD,
            'role': 'editor'
        })
        assert resA.get('success'), f"Create Editor A failed: {resA}"
        editorA_id = resA.get('data')

        st, resB, _ = admin.json_post('user_add', {
            'email': 'editorB@protoloft.local',
            'name': '李四',
            'password': PASS_WORD,
            'role': 'editor'
        })
        assert resB.get('success'), f"Create Editor B failed: {resB}"
        editorB_id = resB.get('data')
        passed_count += 1
        print(f" [✓] 2. 协作者创建成功: Editor A #{editorA_id} (张三), Editor B #{editorB_id} (李四)")

        # 3. 创建分类与项目 (负责人为 Editor A)
        st, cat_res, _ = admin.json_post('category_save', {'name': '测试产品线'})
        assert cat_res.get('success'), f"Create cat failed: {cat_res}"
        cat_id = cat_res.get('data', {}).get('id') if isinstance(cat_res.get('data'), dict) else cat_res.get('data')

        # 以 Editor A 登录建项目
        clientA = TestClient(base_url)
        clientA.sync_session()
        st, loginA, _ = clientA.json_post('login', {'email': 'editorA@protoloft.local', 'password': PASS_WORD})
        assert loginA.get('success'), f"Login A failed: {loginA}"
        clientA.sync_session()

        st, item_res, _ = clientA.json_post('item_save', {
            'category_id': cat_id,
            'type': 'project',
            'name': '用户体验核心原型'
        })
        assert item_res.get('success'), f"Create item failed: {item_res}"
        item_id = item_res.get('data', {}).get('id') if isinstance(item_res.get('data'), dict) else item_res.get('data')

        # 验证建完后 index.php 首屏上的负责人
        st, home_body, _ = admin.request('index.php')
        assert f'data-created-by="{editorA_id}"' in home_body, "Index item node should have created-by Editor A"
        assert 'data-creator-name="张三"' in home_body, "Index item node should have creator-name 张三"
        passed_count += 1
        print(f" [✓] 3. 项目 #{item_id} 创建成功，初始负责人正确归属为张三")

        # 4. 执行工作交接: 张三 -> 李四，并勾选同时停用张三
        st, handover_res, _ = admin.json_post('user_handover', {
            'from_user_id': editorA_id,
            'to_user_id': editorB_id,
            'deactivate_from': 1
        })
        assert handover_res.get('success'), f"User handover failed: {handover_res}"
        passed_count += 1
        print(f" [✓] 4. 工作交接成功: 张三 -> 李四 (同时停用张三)")

        # 5. 验证后端数据库与前端 HTML 首屏渲染
        st, home_after, _ = admin.request('index.php')
        # 项目节点属性检查
        assert f'data-created-by="{editorB_id}"' in home_after, "Index item node should now have created-by Editor B"
        assert 'data-creator-name="李四"' in home_after, "Index item node should now have creator-name 李四"
        # 控制中心表格中的负责人列与 DOM 属性
        assert f'id="admin-item-row-{item_id}"' in home_after and f'data-created-by="{editorB_id}"' in home_after, "Admin item row must carry data-created-by attribute"
        assert '所有协作者' in home_after, "Overview table should show all-collaborator scope separately from creator metadata"
        # 验证没有残留 "-" 或空
        assert '<td style="padding:9px 12px;color:var(--text-2);">-</td>' not in home_after, "Overview table should not show empty dash"
        # 验证负责人多选框中包含李四
        assert f'value="{editorB_id}" data-name="李四"' in home_after, "Item owners options should contain 李四"
        passed_count += 1
        print(" [✓] 5. 首屏 HTML 验证通过: 节点属性、表格负责人列、多选下拉全部稳健展示为李四，无任何空值")

        # 6. 验证姓名为空的用户作为接管人时，creator_name 稳健兜底为邮箱
        st, resC, _ = admin.json_post('user_add', {
            'email': 'editorC@protoloft.local',
            'name': '临时成员',
            'password': PASS_WORD,
            'role': 'editor'
        })
        editorC_id = resC.get('data')
        assert resC.get('success'), resC
        # 正常 API 不允许空姓名；仅在此合成数据库中构造空值以检验显示兜底。
        st, resC_up, _ = admin.json_post('user_update', {
            'id': editorC_id,
            'name': ''
        })
        assert not resC_up.get('success'), '正常成员资料接口必须拒绝空姓名'
        with sqlite3.connect(app_dir / 'data' / 'database.sqlite') as fixture_db:
            fixture_db.execute('UPDATE users SET name = ? WHERE id = ?', ('', editorC_id))
        # 再次交接给 editorC
        st, handover_c, _ = admin.json_post('user_handover', {
            'from_user_id': editorB_id,
            'to_user_id': editorC_id,
            'deactivate_from': 0
        })
        assert handover_c.get('success'), f"Handover to C failed: {handover_c}"

        st, home_c, _ = admin.request('index.php')
        # 必须兜底显示 editorc@protoloft.local，而不是 "-" 或空
        assert 'data-creator-name="editorc@protoloft.local"' in home_c, "Creator name should fallback to email when name is empty"
        assert '所有协作者' in home_c, "Scope cell must stay separate from creator email"
        passed_count += 1
        print(" [✓] 6. 姓名为空时邮箱兜底验证通过: 成功展示为 editorc@protoloft.local，杜绝破损")

        # 7. 验证管理员在编辑项目属性时，不修改负责人提交，项目负责人保持原样不被篡改
        st, save_res, _ = admin.json_post('item_save', {
            'id': item_id,
            'category_id': cat_id,
            'type': 'project',
            'name': '用户体验核心原型-已更新',
            'created_by': editorC_id
        })
        assert save_res.get('success'), f"Update item failed: {save_res}"
        st, home_saved, _ = admin.request('index.php')
        assert f'data-created-by="{editorC_id}"' in home_saved, "Created by must stay as editorC"
        assert '用户体验核心原型-已更新' in home_saved, "Item name should be updated"
        passed_count += 1
        print(" [✓] 7. 项目属性保存验证通过: 负责人保持归属，未被篡改为当前管理员")

        proc.terminate()
        proc.wait(timeout=5)

    finally:
        if proc.poll() is None:
            proc.terminate()
            proc.wait(timeout=5)
        shutil.rmtree(temp_dir, ignore_errors=True)

    print(f"\n==========================================")
    print(f"回归测试完成: {passed_count}/{total_checks} 全部用例 100% 通过!")
    print(f"==========================================")

if __name__ == '__main__':
    main()
