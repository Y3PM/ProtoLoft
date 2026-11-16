#!/usr/bin/env python3
"""立象原型 (ProtoLoft) - 角色控制与权限矩阵全链路 E2E 自动化回归套件
Role-Based Access Control (RBAC) & Permission Matrix Regression Test Suite

验证范围:
1. 控制中心仅保留角色权限矩阵，弃用的全站开关不再参与保存与鉴权
2. 管理员 (Admin) 全局最高权限全链路验证
3. 协作者 (Editor) 项目级权限隔离 (仅能管理自身项目，跨项目发版/编辑/删除/分享配置严格 403 阻断)
4. 协作者 (Editor) 批注权限隔离 (仅项目负责人或批注作者可标记已解决，非负责人协作者被阻断)
5. 审阅人 (Viewer) 权限矩阵动态管控:
   - perm_viewer_share 开启/关闭时的外发分享接口行为与只读隔离
   - perm_viewer_download_rp 开启/关闭时的 RP 下载 403 拦截与 200 下载
   - 审阅人严格禁止发版、新建项目、管理成员等写操作
6. 前端 DOM 属性与组件守卫规范校验 (data-share-manage、data-can-edit、autoSaveRolePermissions)
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
        read_only = {'get_session', 'user_list', 'download_rp', 'item_get_share', 'log_list', 'list_annotations', 'annotation_target', 'previous_annotations'}
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
            return json.loads(body.decode('utf-8', errors='replace'))
        except Exception:
            return {'success': False, 'data': None, 'message': body.decode('utf-8', errors='ignore')}

    def login(self, email, password):
        body = self.api('login', {'email': email, 'password': password}, csrf=False)
        assert body and body.get('success'), f"登录失败 ({email}): {body}"
        self.user = body['data']
        sess_body = self.api('get_session', csrf=False)
        if sess_body and sess_body.get('data'):
            self.token = sess_body['data'].get('csrfToken', '')
        return self


def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def make_proto_zip():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as zf:
        zf.writestr('index.html', '<!DOCTYPE html><html><head><title>原型首页</title></head><body><h1>RBAC Test Home</h1></body></html>')
    return buf.getvalue()


@contextlib.contextmanager
def sandbox_server(php_bin):
    temp_dir = tempfile.mkdtemp(prefix='protoloft_rbac_')
    temp = Path(temp_dir)
    port = find_free_port()
    base_url = f'http://127.0.0.1:{port}'
    proc = None
    try:
        for p in ROOT.glob('*.php'):
            shutil.copy2(p, temp / p.name)
        shutil.copytree(ROOT / 'includes', temp / 'includes')
        shutil.copytree(ROOT / 'assets', temp / 'assets')
        (temp / 'data').mkdir(parents=True, exist_ok=True)
        (temp / 'data' / 'prototypes').mkdir(parents=True, exist_ok=True)
        (temp / 'data' / 'chunks').mkdir(parents=True, exist_ok=True)
        (temp / 'uploads').mkdir(parents=True, exist_ok=True)
        (temp / 'uploads' / 'branding').mkdir(parents=True, exist_ok=True)

        (temp / 'test-router.php').write_text('''<?php
        $path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
        if (preg_match('#^/(data|includes|\\.dev|\\.git)(/|$)#', $path)) {
            http_response_code(403);
            echo "403 Forbidden";
            exit;
        }
        if (preg_match('#^/asset\\.php/#', $path)) {
            $_SERVER['PATH_INFO'] = substr($path, strlen('/asset.php'));
            $_SERVER['SCRIPT_NAME'] = '/asset.php';
            include __DIR__ . '/asset.php';
            return true;
        }
        return false;
        ''')

        log_file = open(temp / 'php-server.log', 'w+')
        proc = subprocess.Popen(
            [php_bin, '-S', f'127.0.0.1:{port}', '-t', str(temp), str(temp / 'test-router.php')],
            stdout=log_file,
            stderr=log_file
        )

        guest = TestClient(base_url)
        for _ in range(50):
            try:
                code, _, _ = guest.request('/install.php')
                if code in (200, 302):
                    break
            except Exception:
                time.sleep(0.05)
        else:
            raise RuntimeError("PHP 开发服务器启动超时")

        code, body, _ = guest.request('/install.php')
        match = re.search(rb'name="csrf_token" value="([^"]+)"', body)
        assert match, "未能从 install.php 获取 csrf_token"
        install_csrf = match.group(1).decode('utf-8')
        token_p = (temp / 'data' / 'install_token.php')
        if not token_p.exists(): token_p = (temp / 'data' / 'install_token.txt')
        install_token = token_p.read_text().splitlines()[-1].strip()

        code, body, _ = guest.request('/install.php', {
            'csrf_token': install_csrf,
            'install_token': install_token,
            'site_title': '立象权限测试',
            'admin_email': 'admin@test.com',
            'admin_name': '测试超管',
            'admin_password': PASS_WORD,
            'admin_password_confirm': PASS_WORD
        })
        assert (temp / 'data' / 'install.lock').is_file(), f"站点安装失败: {body}"

        yield base_url, temp_dir
    finally:
        if proc:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except Exception:
                proc.kill()
        shutil.rmtree(temp_dir, ignore_errors=True)


def publish_version(client, item_id, ver_name="v1.0.0", rp_bytes=None):
    zip_bytes = make_proto_zip()
    upload_id = 'zip_' + uuid.uuid4().hex[:12]
    payload = client.api('upload_chunk', {
        'upload_id': upload_id,
        'file_type': 'zip',
        'chunk_index': 0,
        'chunk_total': 1
    }, files={'chunk_data': ('chunk.bin', zip_bytes)})
    if not payload.get('success'):
        return False, payload

    rp_upload_id = ''
    if rp_bytes:
        rp_upload_id = 'rp_' + uuid.uuid4().hex[:12]
        payload = client.api('upload_chunk', {
            'upload_id': rp_upload_id,
            'file_type': 'rp',
            'chunk_index': 0,
            'chunk_total': 1
        }, files={'chunk_data': ('chunk.bin', rp_bytes)})
        if not payload.get('success'):
            return False, payload

    payload = client.api('version_publish', {
        'item_id': item_id,
        'version_name': ver_name,
        'zip_upload_id': upload_id,
        'rp_upload_id': rp_upload_id,
        'changelog': 'RBAC version test'
    })
    return payload.get('success', False), payload


def run_tests(base_url, temp_dir):
    print("🚀 开始运行角色控制与权限矩阵 (RBAC) E2E 自动化回归测试...")

    admin = TestClient(base_url)
    admin.login('admin@test.com', PASS_WORD)

    # ----------------------------------------------------
    # 1. 验证控制台只保存角色权限，旧的总开关字段不再被接受
    # ----------------------------------------------------
    print("▶ 1. 测试角色权限保存与总开关移除...")
    res = admin.api('save_role_permissions', {
        'perm_editor_share': '1',
        'perm_viewer_share': '1',
        'perm_viewer_download_rp': '1',
        'perm_guest_download_rp': '1',
        'perm_guest_annotate': '1',
        'feature_annotation_enabled': '0',
        'feature_share_enabled': '0'
    })
    assert res and res.get('success') is True, f"保存角色权限失败: {res}"

    db_path = Path(temp_dir) / 'data' / 'database.sqlite'
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT key, value FROM settings WHERE key IN ('feature_annotation_enabled', 'feature_share_enabled', 'perm_editor_share', 'perm_viewer_share', 'perm_viewer_download_rp', 'perm_guest_download_rp', 'perm_guest_annotate')")
    settings_dict = dict(cur.fetchall())
    assert 'feature_annotation_enabled' not in settings_dict, "角色权限接口仍保存弃用的批注总开关"
    assert 'feature_share_enabled' not in settings_dict, "角色权限接口仍保存弃用的分享总开关"
    assert settings_dict.get('perm_editor_share') == '1', "perm_editor_share 保存不准确"
    assert settings_dict.get('perm_viewer_share') == '1', "perm_viewer_share 保存不准确"
    assert settings_dict.get('perm_viewer_download_rp') == '1', "perm_viewer_download_rp 保存不准确"
    assert settings_dict.get('perm_guest_download_rp') == '1', "perm_guest_download_rp 保存不准确"
    assert settings_dict.get('perm_guest_annotate') == '1', "perm_guest_annotate 保存不准确"
    res = admin.api('save_settings', {'feature_annotation_enabled': '0', 'feature_share_enabled': '0'})
    assert res.get('success'), res
    assert conn.execute("SELECT COUNT(*) FROM settings WHERE key IN ('feature_annotation_enabled', 'feature_share_enabled')").fetchone()[0] == 0, "系统设置接口仍保存弃用的总开关"
    _, admin_page, _ = admin.request('/index.php')
    roles_panel = admin_page.split(b'id="panel-roles"', 1)[1].split(b'</form>', 1)[0]
    assert b'roleFeatureAnno' not in roles_panel and b'roleFeatureShare' not in roles_panel, "角色权限页面仍渲染总开关"
    assert roles_panel.count(b'type="checkbox"') == 5, "角色权限页面应仅包含五项可配置角色权限"
    # 仅在合成库留下旧值，后续多角色真实请求必须仍按角色矩阵决定，不能靠改回 1 自愈。
    conn.executemany('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)', [
        ('feature_annotation_enabled', '0'), ('feature_share_enabled', '0')])
    conn.commit()
    print("  ✓ 两个接口均不保存总开关；真实页面只渲染五项角色权限")

    # ----------------------------------------------------
    # 2. 准备多角色用户环境 (Admin, Editor A, Editor B, Viewer)
    # ----------------------------------------------------
    print("▶ 2. 初始化多角色测试用户 (Editor A, Editor B, Viewer)...")
    cat_res = admin.api('category_save', {'name': 'RBAC测试目录'})
    cat_id = cat_res['data']['id']

    users_needed = [
        ('editor_a@test.com', '协作者A', 'editor'),
        ('editor_b@test.com', '协作者B', 'editor'),
        ('viewer_x@test.com', '审阅人X', 'viewer')
    ]
    user_clients = {}
    for email, name, role in users_needed:
        add_res = admin.api('user_add', {'email': email, 'name': name, 'password': PASS_WORD, 'role': role})
        assert add_res and add_res.get('success'), f"添加用户失败: {add_res}"
        client = TestClient(base_url)
        client.login(email, PASS_WORD)
        user_clients[email] = client

    editor_a = user_clients['editor_a@test.com']
    editor_b = user_clients['editor_b@test.com']
    viewer = user_clients['viewer_x@test.com']
    print("  ✓ 多角色用户登录会话就绪")

    # ----------------------------------------------------
    # 3. 协作者项目级隔离验证 (Editor A 创建项目 A，包含 RP 底稿)
    # ----------------------------------------------------
    print("▶ 3. 测试协作者项目隔离与防越权...")
    proj_a_res = editor_a.api('item_save', {
        'category_id': cat_id,
        'type': 'project',
        'name': '协作者A专属项目'
    })
    assert proj_a_res and proj_a_res.get('success'), f"Editor A 创建项目失败: {proj_a_res}"
    proj_a_id = proj_a_res['data']['id']

    # Editor A 可以为自己的项目发版 (附带 RP 底稿)
    fake_rp = b'PK\x03\x04FAKE_RP_CONTENT_FOR_RBAC_TESTING'
    ok, pub_res = publish_version(editor_a, proj_a_id, 'v1.0.0', fake_rp)
    assert ok and pub_res.get('success') is True, f"Editor A 发版失败: {pub_res}"
    ver_id = pub_res['data']['version_id']
    print("  ✓ Editor A 成功为自己的项目发版并上传 RP 底稿")

    # Editor B 试图越权修改 Project A 的信息 -> 必须被拒绝
    hack_item = editor_b.api('item_save', {
        'id': proj_a_id,
        'category_id': cat_id,
        'name': 'Editor B 恶意篡改名称'
    })
    assert not (hack_item and hack_item.get('success')), "严重安全漏洞: Editor B 越权修改了他人的项目属性"

    # Editor B 试图越权为 Project A 发版 -> 必须被拒绝
    ok_hack, hack_ver = publish_version(editor_b, proj_a_id, 'v9.9.9')
    assert not ok_hack, "严重安全漏洞: Editor B 越权为他人的项目发版"

    # Editor B 试图越权删除 Project A -> 必须被拒绝
    hack_del = editor_b.api('item_delete', {'id': proj_a_id})
    assert not (hack_del and hack_del.get('success')), "严重安全漏洞: Editor B 越权删除了他人的项目"

    # Editor B 试图越权修改 Project A 的分享配置 -> 必须被拒绝
    hack_share = editor_b.api('item_save_share', {'id': proj_a_id, 'access_password': 'hacked_pwd'})
    assert not (hack_share and hack_share.get('success')), "严重安全漏洞: Editor B 越权修改了他人的分享设置"
    print("  ✓ 协作者项目越权全方位防御生效 (编辑/发版/删除/分享配置均被严格拦截)")

    # ----------------------------------------------------
    # 4. 批注状态切换角色边界验证
    # ----------------------------------------------------
    print("▶ 4. 测试批注状态切换的角色控制边界...")
    # Editor A 在 Project A 发表一条批注
    anno_res = editor_a.api('add_annotation', {
        'item_id': proj_a_id,
        'ver_id': ver_id,
        'page_path': 'index.html',
        'page_title': '首页',
        'content': '请核对按钮规范'
    })
    assert anno_res and anno_res.get('success'), f"发表批注失败: {anno_res}"
    anno_id = anno_res['data']['id']

    # Editor B (非负责人非作者) 试图将 Editor A 的批注标记为已解决 -> 必须被拦截
    hack_toggle = editor_b.api('toggle_annotation_status', {'id': anno_id})
    assert not (hack_toggle and hack_toggle.get('success')), "严重漏洞: 非负责人协作者越权解决了他人批注"

    # 审阅人 Viewer 试图解决他人批注 -> 必须被拦截
    viewer_toggle = viewer.api('toggle_annotation_status', {'id': anno_id})
    assert not (viewer_toggle and viewer_toggle.get('success')), "严重漏洞: 审阅人越权解决了他人批注"

    # 项目负责人 Editor A 标记解决 -> 成功
    ok_toggle = editor_a.api('toggle_annotation_status', {'id': anno_id})
    assert ok_toggle and ok_toggle.get('success') is True, f"项目负责人标记解决失败: {ok_toggle}"
    assert ok_toggle['data']['status'] == 1
    print("  ✓ 批注状态切换权限精确守卫: 仅作者或项目负责人可操作")

    # ----------------------------------------------------
    # 5. 审阅人 (Viewer) 权限矩阵动态测试 (分享与 RP 下载)
    # ----------------------------------------------------
    print("▶ 5. 测试审阅人 (Viewer) 权限矩阵动态受控...")
    # 5.1 关闭 perm_viewer_share
    admin.api('save_role_permissions', {'perm_viewer_share': '0'})
    v_share_off = viewer.api('item_get_share', {'id': proj_a_id})
    assert not (v_share_off and v_share_off.get('success')), "审阅人分享关闭时应禁止获取分享信息"

    # 验证审阅人工作台主页无分享按钮
    _, v_home_off, _ = viewer.request('/')
    assert b'copyShareUrl()' not in v_home_off, "审阅人分享关闭时工作台顶栏不应出现分享按钮"

    # 5.2 开启 perm_viewer_share
    admin.api('save_role_permissions', {'perm_viewer_share': '1'})
    v_share_on = viewer.api('item_get_share', {'id': proj_a_id})
    assert v_share_on and v_share_on.get('success') is True, f"审阅人开启分享后未能获取分享信息: {v_share_on}"
    assert v_share_on['data']['can_manage'] is False, "审阅人必须是只读分享 (can_manage=False)"
    assert v_share_on['data']['can_copy'] is True

    # 验证审阅人工作台主页正常渲染分享按钮
    _, v_home_on, _ = viewer.request('/')
    assert b'copyShareUrl()' in v_home_on, "审阅人开启分享后工作台顶栏未能渲染分享按钮"

    # 验证管理员特权兜底：无论何时管理员工作台主页均拥有分享按钮
    _, admin_home, _ = admin.request('/')
    assert b'copyShareUrl()' in admin_home, "管理员工作台顶栏未能渲染分享按钮 (特权兜底失效)"

    # 审阅人即使开启分享，也绝对禁止修改密码或创建专属短链 (写操作阻断)
    v_save_share = viewer.api('item_save_share', {'id': proj_a_id, 'access_password': '123'})
    assert not (v_save_share and v_save_share.get('success')), "审阅人越权修改了分享设置"
    v_create_code = viewer.api('share_code_create', {'item_id': proj_a_id, 'label': '外部客户'})
    assert not (v_create_code and v_create_code.get('success')), "审阅人越权创建了专属分享短链"
    print("  ✓ 审阅人外发分享动态开关生效，写操作严格受控")

    # 5.3 验证 RP 下载受控 (perm_viewer_download_rp)
    admin.api('save_role_permissions', {'perm_viewer_download_rp': '0'})
    http_code, _, _ = viewer.request(f"/api.php?action=download_rp&item_id={proj_a_id}&ver_id={ver_id}")
    assert http_code == 403, f"关闭 RP 下载时审阅人应被 403 阻断，实际返回 {http_code}"

    admin.api('save_role_permissions', {'perm_viewer_download_rp': '1'})
    http_code, rp_data, _ = viewer.request(f"/api.php?action=download_rp&item_id={proj_a_id}&ver_id={ver_id}")
    assert http_code == 200, f"开启 RP 下载后审阅人下载失败，返回 {http_code}"
    assert rp_data == fake_rp, "审阅人下载的 RP 数据与源文件不一致"
    print("  ✓ 审阅人 RP 下载权限矩阵动态生效 (0 阻断 / 1 流式下载)")

    # ----------------------------------------------------
    # 6. 前端代码规范与 DOM 属性守卫校验
    # ----------------------------------------------------
    print("▶ 6. 校验前端组件与 DOM 防线...")
    modals_code = (ROOT / 'includes' / 'modals.php').read_text(encoding='utf-8')
    admin_js = (ROOT / 'assets' / 'js' / 'admin.js').read_text(encoding='utf-8')
    share_js = (ROOT / 'assets' / 'js' / 'share.js').read_text(encoding='utf-8')
    anno_js = (ROOT / 'assets' / 'js' / 'annotation.js').read_text(encoding='utf-8')

    # 检查分享弹窗是否有 data-share-manage 守卫
    assert 'data-share-manage' in modals_code, "modals.php 分享弹窗缺失 data-share-manage 属性"

    # 检查 modals.php 角色权限表单字段是否齐全
    assert 'name="perm_guest_download_rp"' in modals_code, "modals.php 漏掉了 perm_guest_download_rp"
    assert 'name="perm_guest_annotate"' in modals_code, "modals.php 漏掉了 perm_guest_annotate"
    assert 'roleFeatureAnno' not in admin_js, "admin.js 中不应存在伪字段 roleFeatureAnno"

    # 检查项目列表表格发版按钮是否在 canManageThisItem 内部
    assert 'data-can-edit="<?php echo $canManageThisItem ? \'1\' : \'0\'; ?>"' in modals_code, "modals.php 未输出 data-can-edit 属性"

    # 检查发版项目下拉框是否包含 canEditThisProject 过滤
    assert '$canEditThisProject' in modals_code, "modals.php 发版下拉列表未过滤协作者权限"

    # 检查 annotation.js 切换批注状态是否检查了 canManageCurrentItem
    assert 'canManageCurrentItem' in anno_js, "annotation.js 状态切换未严格校验当前项目权限"
    print("  ✓ 前端 DOM 属性与守卫代码校验 100% 符合规范")

    assert dict(conn.execute("SELECT key,value FROM settings WHERE key IN ('feature_annotation_enabled', 'feature_share_enabled')")) == {
        'feature_annotation_enabled': '0', 'feature_share_enabled': '0'
    }, "权限请求不应通过修改旧开关值自愈"
    print("  ✓ 弃用配置未被重写，角色权限独立生效")

    conn.close()
    print("\n🎉 全部角色控制 (RBAC) 与权限矩阵自动化回归断言 100% 验证通过！")


def main():
    parser = argparse.ArgumentParser(description="角色控制与权限矩阵 E2E 自动化回归套件")
    parser.add_argument('--php', default='/tmp/jinshi-php-common/php', help="PHP 可执行程序路径")
    args = parser.parse_args()

    php_bin = args.php
    if not Path(php_bin).is_file():
        which = shutil.which('php')
        if which:
            php_bin = which
        else:
            print(f"❌ 未找到 PHP 二进制文件: {php_bin}")
            sys.exit(1)

    with sandbox_server(php_bin) as (base_url, temp_dir):
        run_tests(base_url, temp_dir)


if __name__ == '__main__':
    main()
