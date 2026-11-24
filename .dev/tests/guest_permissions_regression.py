#!/usr/bin/env python3
"""立象原型 (ProtoLoft) - 访客权限与角色权限大盘 E2E 自动化回归套件
Guest Permissions & Role Matrix Regression Test Suite
验证范围:
1. 控制台角色权限矩阵保存 (新增访客列配置持久化，无功能开关卡片干扰)
2. 访客未授权时的严格阻断 (RP 下载与批注拦截)
3. 访客授权下载 RP 全链路 (合法分享访客 200 流式下载，非法访客 403 阻断)
4. 访客授权页面批注全链路 (访客署名、批注列表展示、访客回复)
5. 访客越权防篡改防御 (严禁访客删除批注与标记已解决)
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
        assert body and body.get('success'), f"登录失败: {body}"
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
        zf.writestr('index.html', '<!DOCTYPE html><html><head><title>原型首页</title></head><body><h1>Proto Home</h1></body></html>')
        zf.writestr('page1.html', '<!DOCTYPE html><html><head><title>页面一</title></head><body><h2>Page 1</h2></body></html>')
    return buf.getvalue()


@contextlib.contextmanager
def sandbox_server(php_bin):
    temp_dir = tempfile.mkdtemp(prefix='protoloft_guest_')
    temp = Path(temp_dir)
    port = find_free_port()
    base_url = f'http://127.0.0.1:{port}'
    proc = None
    try:
        # 复制项目运行所需文件
        for p in ROOT.glob('*.php'):
            shutil.copy2(p, temp / p.name)
        shutil.copytree(ROOT / 'includes', temp / 'includes')
        shutil.copytree(ROOT / 'assets', temp / 'assets')
        (temp / 'data').mkdir(parents=True, exist_ok=True)
        (temp / 'data' / 'prototypes').mkdir(parents=True, exist_ok=True)
        (temp / 'data' / 'chunks').mkdir(parents=True, exist_ok=True)
        (temp / 'uploads').mkdir(parents=True, exist_ok=True)
        (temp / 'uploads' / 'branding').mkdir(parents=True, exist_ok=True)

        # 编写独立测试路由器
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

        # 等待服务器启动
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

        # 执行安装向导
        code, body, _ = guest.request('/install.php')
        match = re.search(rb'name="csrf_token" value="([^"]+)"', body)
        assert match, "未能从 install.php 获取 csrf_token"
        install_csrf = match.group(1).decode('utf-8')
        token_p = (temp / 'data' / 'install_token.php')
        if not token_p.exists(): token_p = (temp / 'data' / 'install_token.txt')
        install_token = token_p.read_text().splitlines()[-1].strip()

        code, body, headers = guest.request('/install.php', {
            'csrf_token': install_csrf,
            'install_token': install_token,
            'site_title': '立象访客权限测试',
            'admin_email': 'admin@test.com',
            'admin_name': '测试超管',
            'admin_password': PASS_WORD,
            'admin_password_confirm': PASS_WORD
        })
        assert (temp / 'data' / 'install.lock').is_file(), f"站点安装初始化失败: {body.decode('utf-8', errors='ignore')}"

        yield base_url, temp_dir
    finally:
        if proc:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except Exception:
                proc.kill()
        shutil.rmtree(temp_dir, ignore_errors=True)


def run_tests(base_url, temp_dir):
    print("🚀 开始运行访客权限与角色权限大盘端到端回归测试...")

    admin = TestClient(base_url)
    admin.login('admin@test.com', PASS_WORD)

    # 1. 验证控制台角色权限矩阵保存
    print("▶ 1. 测试控制台角色权限矩阵配置保存 (perm_guest_download_rp / perm_guest_annotate)...")
    res = admin.api('save_role_permissions', {
        'perm_editor_share': '1',
        'perm_viewer_share': '0',
        'perm_viewer_download_rp': '0',
        'perm_guest_download_rp': '0',
        'perm_guest_annotate': '0'
    })
    assert res.get('success'), f"保存角色权限失败: {res}"

    # 检查数据库 settings
    db_path = Path(temp_dir, 'data', 'database.sqlite')
    con = sqlite3.connect(db_path)
    cur = con.cursor()
    cur.execute("SELECT key, value FROM settings WHERE key IN ('perm_guest_download_rp', 'perm_guest_annotate')")
    settings_map = dict(cur.fetchall())
    assert settings_map.get('perm_guest_download_rp') == '0', f"期望 0，实际 {settings_map}"
    assert settings_map.get('perm_guest_annotate') == '0', f"期望 0，实际 {settings_map}"
    print("  ✓ 初始关闭状态持久化验证通过")

    # 2. 创建分类与项目，上传带 RP 的版本
    print("▶ 2. 创建测试项目与版本 (包含 HTML 原型与 RP 底稿)...")
    cat_res = admin.api('category_save', {'name': '测试分类'})
    assert cat_res.get('success'), f"创建分类失败: {cat_res}"
    cat_id = cat_res['data']['id']

    item_res = admin.api('item_save', {
        'category_id': cat_id,
        'name': '安全交付项目',
        'type': 'project'
    })
    assert item_res.get('success'), f"创建项目失败: {item_res}"
    item_id = item_res['data']['id']

    def upload_file(client, file_bytes, file_type='zip'):
        upload_id = uuid.uuid4().hex
        chunk_size = 64 * 1024
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

    # 上传并发布版本
    zip_bytes = make_proto_zip()
    rp_content = b'AXURE_RP_TEST_FILE_CONTENT_MOCK_123456789'
    zip_uid = upload_file(admin, zip_bytes, 'zip')
    rp_uid = upload_file(admin, rp_content, 'rp')

    pub_res = admin.api('version_publish', {
        'item_id': item_id,
        'version_name': 'v1.0.0',
        'zip_upload_id': zip_uid,
        'rp_upload_id': rp_uid,
        'is_default': 1,
        'changelog': '首个测试版本'
    })
    assert pub_res.get('success'), f"发版失败: {pub_res}"
    ver_id = pub_res['data']['id']
    print(f"  ✓ 成功发布项目 #{item_id} 版本 #{ver_id}")

    # 获取项目的分享短链代码
    share_info = admin.api('item_get_share', {'id': item_id})
    assert share_info.get('success'), f"获取分享信息失败: {share_info}"
    share_code = share_info['data']['share_code']

    # 3. 访客访问未授权状态测试 (Closed Policy)
    print("▶ 3. 验证访客在权限关闭时的阻断行为...")
    guest = TestClient(base_url)

    # 访客访问 share.php 获取 share access
    st, html_bytes, headers = guest.request(f'/share.php?s={share_code}')
    assert st == 200, f"访问 share.php 失败，状态码: {st}"
    assert 'id="btnShareDownloadRp"' not in html_bytes.decode('utf-8'), "关闭状态下 share.php 页面不应展示下载 RP 按钮"
    assert 'id="btnToggleAnnotation"' not in html_bytes.decode('utf-8'), "关闭状态下 share.php 页面不应展示批注按钮"
    print("  ✓ share.php 视图在关闭状态下成功隐藏下载与批注按钮")

    # 访客直接请求下载接口 -> 应 403
    st, rp_dl_bytes, _ = guest.request(f'/api.php?action=download_rp&item_id={item_id}&ver_id={ver_id}')
    assert st == 403, f"未开放访客下载时必须返回 403，实际返回: {st}"
    print("  ✓ 访客直接调用 download_rp 被严格阻断 (403)")

    # 访客直接请求新增批注 -> 应被阻断
    anno_res = guest.api('add_annotation', {
        'item_id': item_id,
        'ver_id': ver_id,
        'page_path': 'index.html',
        'content': '未授权的批注'
    }, csrf=False)
    assert not (anno_res and anno_res.get('success')), f"未开放访客批注时严禁成功: {anno_res}"
    print("  ✓ 访客直接调用 add_annotation 被严格阻断")

    # 4. 管理员开启访客权限并验证放行 (Open Policy)
    print("▶ 4. 管理员开启访客下载 RP 与页面批注权限...")
    res = admin.api('save_role_permissions', {
        'perm_editor_share': '1',
        'perm_viewer_share': '0',
        'perm_viewer_download_rp': '0',
        'perm_guest_download_rp': '1',
        'perm_guest_annotate': '1'
    })
    assert res.get('success'), f"更新角色权限失败: {res}"
    print("  ✓ 访客权限已在控制台开启生效")

    # 5. 访客已授权下载 RP 与更新日志浮层检查
    print("▶ 5. 验证访客下载 RP 源文件全链路与更新日志/关闭交互...")
    st, html_bytes, _ = guest.request(f'/share.php?s={share_code}')
    assert st == 200
    html_text = html_bytes.decode('utf-8')
    m_csrf = re.search(r'window\.CSRF_TOKEN\s*=\s*"([^"]+)"', html_text)
    if m_csrf:
        guest.token = m_csrf.group(1)
    assert 'id="btnShareDownloadRp"' in html_text, "开启后 share.php 页面应展示下载 RP 按钮"
    assert 'download="安全交付项目_v1.0.0.rp"' in html_text, "share.php 下载按钮 download 属性应带有格式化项目与版本名"
    assert 'onclick="toggleShareChangelog(false)"' in html_text, "share.php 更新日志浮层应包含关闭按钮"
    assert 'id="btnToggleAnnotation"' in html_text, "开启后 share.php 页面应展示批注按钮"
    print("  ✓ share.php 视图在开启状态下成功渲染下载按钮(带动态download属性)、批注按钮与更新日志关闭按钮")

    st, rp_dl_bytes, headers = guest.request(f'/api.php?action=download_rp&item_id={item_id}&ver_id={ver_id}')
    assert st == 200, f"开启访客下载后应返回 200，实际: {st}"
    assert rp_dl_bytes == rp_content, "下载到的 RP 文件内容与上传内容不一致"
    cd_header = headers.get('Content-Disposition', '')
    assert 'filename=' in cd_header, f"缺失文件名响应头: {cd_header}"
    assert 'filename*=' in cd_header, f"缺失标准 RFC 5987 编码文件名: {cd_header}"
    print(f"  ✓ 访客成功以受控流式下载获取完整的 RP 源文件 (响应头: {cd_header})")

    # 验证工作台更新日志浮层关闭按钮与 CSS 样式
    st_idx, idx_html_bytes, _ = admin.request('/')
    idx_html = idx_html_bytes.decode('utf-8')
    assert 'onclick="toggleTopChangelog(false)"' in idx_html, "index.php 顶栏更新日志浮层应包含关闭按钮"
    assert 'close-x' in idx_html, "index.php 顶栏更新日志浮层应包含 close-x 关闭样式"

    st_css, css_bytes, _ = admin.request('/assets/css/app.css')
    css_text = css_bytes.decode('utf-8')
    assert '.prototype-meta' in css_text
    assert 'overflow: visible;' in css_text, ".prototype-meta 应为 overflow: visible 以免裁剪更新日志浮层"
    print("  ✓ 工作台更新日志关闭按钮与 CSS 无裁剪防遮挡校验通过")

    # 非法外部请求 (未输密码/无 session)
    hacker = TestClient(base_url)
    st, _, _ = hacker.request(f'/api.php?action=download_rp&item_id={item_id}&ver_id={ver_id}')
    assert st == 403, f"未建立合法 share access 的访客严禁下载 RP (应为 403，实际: {st})"
    print("  ✓ 无访问凭证的匿名访客严禁下载 RP (403 防御生效)")

    # 6. 访客已授权页面批注与回复全链路
    print("▶ 6. 验证访客发表批注与回复全链路...")
    print("DEBUG guest.token:", repr(guest.token))
    anno_res = guest.api('add_annotation', {
        'item_id': item_id,
        'ver_id': ver_id,
        'page_path': 'index.html',
        'page_title': '原型首页',
        'content': '这里按钮颜色太刺眼了，建议改成 Linear 晴空蓝',
        'guest_name': '前端老张'
    }, csrf=True)
    assert anno_res and anno_res.get('success'), f"访客发表批注失败: {anno_res}"
    anno_data = anno_res['data']
    anno_id = anno_data['id']
    assert anno_data['author_name'] == '[外部访客] 前端老张', f"作者称呼不符合预期: {anno_data['author_name']}"
    assert anno_data['author_dept'] == '访客', f"部门标识不符合预期: {anno_data['author_dept']}"
    assert anno_data['status'] == 0, "新批注初始状态应为待处理 (0)"
    print(f"  ✓ 访客以「[外部访客] 前端老张 (访客)」署名成功发表批注 #{anno_id}")

    # 访客回复该批注
    reply_res = guest.api('reply_annotation', {
        'annotation_id': anno_id,
        'content': '附议，支持改浅色晴空蓝',
        'guest_name': 'UI小王'
    }, csrf=True)
    assert reply_res and reply_res.get('success'), f"访客发表回复失败: {reply_res}"
    reply_data = reply_res['data']
    assert reply_data['author_name'] == '[外部访客] UI小王', f"回复作者称呼不符合预期: {reply_data['author_name']}"
    assert reply_data['author_dept'] == '访客'
    print("  ✓ 访客以「[外部访客] UI小王 (访客)」署名成功回复批注")

    # 访客查看批注列表
    list_res = guest.api('list_annotations', {
        'item_id': item_id,
        'ver_id': ver_id
    }, csrf=True)
    assert list_res and list_res.get('success'), f"访客读取批注列表失败: {list_res}"
    annos = list_res['data']['list']
    assert len(annos) == 1, f"应包含 1 条批注，实际: {len(annos)}"
    target_a = annos[0]
    assert len(target_a['replies']) == 1, f"批注应包含 1 条回复，实际: {len(target_a['replies'])}"
    assert target_a['replies'][0]['author_name'] == '[外部访客] UI小王'
    print("  ✓ 访客成功拉取批注列表与跟帖回复树")

    # 验证未在此会话发表过批注的其他外部访客，完全不可窥探已有批注
    other_guest = TestClient(base_url)
    other_html = other_guest.request(f'/share.php?s={share_code}')[1].decode('utf-8')
    m_og_csrf = re.search(r'window\.CSRF_TOKEN\s*=\s*"([^"]+)"', other_html)
    if m_og_csrf: other_guest.token = m_og_csrf.group(1)
    other_list = other_guest.api('list_annotations', {'item_id': item_id, 'ver_id': ver_id}, csrf=True)
    assert other_list and other_list.get('success') and len(other_list['data']['list']) == 0, f"新访客不应看到其他访客或内部批注: {other_list}"
    print("  ✓ 未发表批注的外部访客隔离生效 (批注列表安全为空)")

    # 7. 访客越权防篡改防御
    print("▶ 7. 验证访客越权防篡改防御 (禁止删除与标记解决)...")
    tog_res = guest.api('toggle_annotation_status', {
        'id': anno_id
    }, csrf=True)
    assert not (tog_res and tog_res.get('success')), f"严禁访客切换批注解决状态: {tog_res}"
    print("  ✓ 访客试图切换批注状态被成功拦截")

    del_res = guest.api('delete_annotation', {
        'id': anno_id
    }, csrf=True)
    assert not (del_res and del_res.get('success')), f"严禁访客删除批注: {del_res}"
    print("  ✓ 访客试图删除批注被成功拦截")

    # 8. 管理员视角核查与标记已解决
    print("▶ 8. 管理员登录并在后台正常处理访客批注...")
    admin_list = admin.api('list_annotations', {'item_id': item_id, 'ver_id': ver_id})
    assert admin_list and admin_list.get('success')
    assert admin_list['data']['list'][0]['author_name'] == '[外部访客] 前端老张'

    tog_admin = admin.api('toggle_annotation_status', {'id': anno_id})
    assert tog_admin and tog_admin.get('success'), f"管理员切换批注状态失败: {tog_admin}"
    assert tog_admin['data']['status'] == 1, "应已标记为已解决 (1)"
    print("  ✓ 管理员顺利将访客批注标记为已解决")

    print("\n🎉 全部访客权限与角色权限大盘自动化断言 100% 验证通过！")


def main():
    parser = argparse.ArgumentParser(description="访客权限与角色权限大盘 E2E 自动化回归套件")
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
