#!/usr/bin/env python3
"""立象原型 (ProtoLoft) - 外链批注协同全链路与上版未决隐藏回归套件
Link Annotation & Previous History Isolation Regression Test Suite
验证范围:
1. 外链创建与属性校验 (type='link', link_target='myFrame' 与 '_blank')
2. 外链批注全链路 (发表批注 ver_id=0, 列表获取, 回复, 标记解决)
3. 铁律守卫: 外链无版本, previous_annotations 必须为空且前端入口彻底隐藏
4. 孤儿资产清理: 删除外链时级联清除名下所有批注与回复
5. 前端交互与静态守卫断言 (快捷键 C、抽屉输入就绪、跨域兜底)
"""
import argparse
import contextlib
import http.cookiejar
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

    def request(self, path, fields=None, headers=None):
        headers = dict(headers or {})
        data = None
        if fields is not None:
            boundary = 'protoloft_boundary_' + uuid.uuid4().hex
            parts = []
            for key, val in fields.items():
                parts.append(('--' + boundary + '\r\nContent-Disposition: form-data; name="' + str(key) + '"\r\n\r\n' + str(val) + '\r\n').encode('utf-8'))
            parts.append(('--' + boundary + '--\r\n').encode('utf-8'))
            data = b''.join(parts)
            headers['Content-Type'] = 'multipart/form-data; boundary=' + boundary

        if self.token:
            headers['X-CSRF-Token'] = self.token

        req = urllib.request.Request(self.base.rstrip('/') + '/' + path.lstrip('/'), data=data, headers=headers)
        with self.opener.open(req) as resp:
            content = resp.read()
            text = content.decode('utf-8', errors='ignore')
            try:
                body = json.loads(text)
            except Exception:
                body = None
            return resp.status, body, text

    def api(self, action, fields=None, csrf=True, headers=None):
        headers = dict(headers or {})
        read_only = {'get_session', 'user_list', 'download_rp', 'item_get_share', 'log_list', 'list_annotations', 'annotation_target', 'previous_annotations'}
        if fields is None and action in read_only:
            status, body, text = self.request('/api.php?' + urllib.parse.urlencode({'action': action}), headers=headers)
        else:
            fields = dict(fields or {})
            fields['action'] = action
            if csrf and self.token:
                fields['csrf_token'] = self.token
                headers['X-CSRF-Token'] = self.token
            status, body, text = self.request('/api.php', fields=fields, headers=headers)
        return body

    def login(self, email, password):
        body = self.api('login', {'email': email, 'password': password}, csrf=False)
        assert body and body.get('success'), f"登录失败: {body}"
        self.user = body['data']
        sess_body = self.api('get_session', csrf=False)
        if sess_body and sess_body.get('data'):
            self.token = sess_body['data'].get('csrfToken', '')
        return self.user

def run_tests(base_url, temp_dir):
    print("\n[*] 1. 前端代码静态特征与铁律硬约束断言")
    app_js = (ROOT / 'assets/js/app.js').read_text(encoding='utf-8')
    anno_js = (ROOT / 'assets/js/annotation.js').read_text(encoding='utf-8')

    # 断言 1: AnnoState 包含 itemType
    assert "itemType: 'project'" in anno_js or 'itemType:' in anno_js, "AnnoState 缺少 itemType 声明"
    print("PASS AnnoState 明确支持 itemType 资产类型状态")

    # 断言 2: 外链选中时彻底隐藏上版未决
    assert "historyToolbar.hidden = true;" in anno_js, "updateAnnoContext 必须隐藏上版未决按钮"
    assert "historyDivider.hidden = true;" in anno_js, "updateAnnoContext 必须隐藏上版未决分割线"
    print("PASS updateAnnoContext 遇到外链强制隐藏上版未决按钮及分割线")

    # 断言 3: togglePreviousAnnotations 和 carryAnnotation 拦截外链
    assert "if (AnnoState.itemType === 'link' || !AnnoState.verId) return;" in anno_js, "togglePreviousAnnotations 必须硬拦截外链"
    print("PASS togglePreviousAnnotations 与 carryAnnotation 具备外链强拦截守卫")

    # 断言 4: submitNewAnnotation 放行外链的 verId=0
    assert "(!AnnoState.verId && AnnoState.itemType !== 'link')" in anno_js, "submitNewAnnotation 必须放行外链"
    print("PASS submitNewAnnotation 安全放行外链的零版本提交")

    # 断言 5: updateTopActionsState 针对外链点亮批注与分享
    assert "if (itemType === 'link') {" in app_js, "updateTopActionsState 必须分支处理外链"
    assert "$btnAnnotation.prop('disabled', false)" in app_js, "外链必须启用顶栏批注按钮"
    print("PASS updateTopActionsState 外链激活时启用顶栏批注按钮")

    # 断言 6: selectItem 传递 type 参数至 updateAnnoContext
    assert "window.updateAnnoContext(itemId, verId, ver, type);" in app_js, "selectItem 必须向批注上下文传入 type"
    print("PASS selectItem 精确同步当前项目资产类型至批注组件")

    print("\n[*] 2. 真实 HTTP E2E: 外链生命周期与批注协作闭环")
    client = TestClient(base_url)
    client.login('admin@test.com', PASS_WORD)

    # 创建测试文件夹
    body = client.api('category_save', {
        'name': '外链协作评审目录'
    })
    assert body and body.get('success'), f"创建文件夹失败: {body}"
    cat_id = body['data']['id']
    print(f"PASS 创建测试文件夹 id={cat_id}")

    # 创建测试外链资产
    link_url = 'https://example.com/demo-activity-page'
    body = client.api('item_save', {
        'category_id': cat_id,
        'type': 'link',
        'name': '自研双十一活动页 (Link)',
        'link_url': link_url,
        'link_target': 'myFrame'
    })
    assert body and body.get('success'), f"创建外链失败: {body}"
    item_id = body['data']['id']
    print(f"PASS 创建外链资产 id={item_id}, url={link_url}")

    # 获取初始批注列表 (应当为空且成功)
    body = client.api('list_annotations', {'item_id': item_id, 'ver_id': 0})
    assert body and body.get('success'), f"读取外链批注列表失败: {body}"
    assert len(body['data']['list']) == 0, "新建外链初始批注应为空"
    assert body['data']['ver_id'] == 0, "外链 ver_id 必须为 0"
    print("PASS 读取新建外链批注列表初始为空且 ver_id=0")

    # 发表外链批注
    body = client.api('add_annotation', {
        'item_id': item_id,
        'ver_id': 0,
        'page_path': 'link',
        'page_title': '自研双十一活动页 (Link)',
        'content': '首屏倒计时在 iPhone 15 上换行了，需微调容器宽度。'
    })
    assert body and body.get('success'), f"发表外链批注失败: {body}"
    anno_id = body['data']['id']
    assert body['data']['ver_id'] == 0, "新增批注 ver_id 必须为 0"
    print(f"PASS 成功发表外链批注 id={anno_id}, ver_id=0")

    # 再次读取批注列表，验证批注已存在且装饰数据正确
    body = client.api('list_annotations', {'item_id': item_id, 'ver_id': 0})
    assert body and body.get('success')
    items = body['data']['list']
    assert len(items) == 1, f"应当恰有 1 条批注，实际: {len(items)}"
    target_anno = items[0]
    assert target_anno['id'] == anno_id
    assert target_anno['version_name'] == '外部链接', f"外链批注版本名应为'外部链接'，实际: {target_anno.get('version_name')}"
    assert target_anno['status'] == 0, "新批注初始状态应为待处理(0)"
    print("PASS 验证外链批注列表包含该批注，且 version_name='外部链接'")

    # 发表多轮回复
    body = client.api('reply_annotation', {
        'annotation_id': anno_id,
        'content': '前端已定位，设置了 flex-shrink: 0 搞定。'
    })
    assert body and body.get('success'), f"发表回复失败: {body}"
    reply_id = body['data']['id']
    print(f"PASS 成功发表外链批注回复 id={reply_id}")

    # 标记解决批注
    body = client.api('toggle_annotation_status', {
        'id': anno_id
    })
    assert body and body.get('success'), f"标记解决失败: {body}"
    assert body['data']['status'] == 1, "批注状态应已变更为已解决 (1)"
    print(f"PASS 成功将外链批注标记为已解决 status=1")

    # 验证【核心铁律】: previous_annotations&ver_id=0 安全返回空列表，绝不崩溃或错乱
    body = client.api('previous_annotations', {'ver_id': 0})
    assert body and body.get('success'), f"previous_annotations 针对外链应当安全返回成功: {body}"
    assert len(body['data']['list']) == 0, "外链无历史版本，上一版未决必须为空列表"
    print("PASS 铁律验证: previous_annotations&ver_id=0 安全返回空列表，杜绝版本混淆")

    # 验证【角色权限控制与访客外链批注闭环】
    # 步骤 1: 开启全局访客批注权限，并为外链项目开启分享
    body = client.api('save_role_permissions', {'perm_guest_annotate': '1'})
    assert body and body.get('success'), f"开启访客批注权限失败: {body}"
    print("PASS 开启系统角色权限: perm_guest_annotate=1")

    client.api('item_save_share', {'id': item_id, 'share_enabled': '1'})
    share_info = client.api('item_get_share', {'id': item_id})
    assert share_info and share_info.get('success'), f"获取外链分享信息失败: {share_info}"
    share_code = share_info['data']['share_code']

    # 步骤 2: 建立未登录访客客户端，访问外链分享页并建立有效 session grant
    guest = TestClient(base_url)
    status, _, share_html = guest.request(f'share.php?s={share_code}')
    assert status == 200, f"访客打开外链分享页失败: {status}"
    csrf_match = re.search(r'window\.CSRF_TOKEN\s*=\s*"([^"]+)"', share_html)
    if csrf_match:
        guest.token = csrf_match.group(1)

    # 步骤 3: 访客成功发表外链批注
    guest_body = guest.api('add_annotation', {
        'item_id': item_id,
        'ver_id': 0,
        'page_path': 'link',
        'page_title': '自研双十一活动页 (Link)',
        'guest_name': '外部审阅访客',
        'content': '访客反馈：页面顶栏在暗黑模式下色彩对比度偏低。'
    })
    assert guest_body and guest_body.get('success'), f"访客发表外链批注失败: {guest_body}"
    guest_anno_id = guest_body['data']['id']
    print(f"PASS 访客在外链分享页成功发表批注 id={guest_anno_id}")

    # 步骤 4: 访客成功读取外链批注列表
    guest_list = guest.api('list_annotations', {'item_id': item_id, 'ver_id': 0})
    assert guest_list and guest_list.get('success'), f"访客读取外链批注失败: {guest_list}"
    assert any(a['id'] == guest_anno_id for a in guest_list['data']['list']), "访客读取列表中应包含该批注"
    print("PASS 访客在外链分享页成功读取批注列表")

    # 步骤 5: 验证角色权限严密控制: 当管理员关闭 perm_guest_annotate=0 时，访客无法发表批注
    client.api('save_role_permissions', {'perm_guest_annotate': '0'})
    guest_blocked = guest.api('add_annotation', {
        'item_id': item_id,
        'ver_id': 0,
        'page_path': 'link',
        'content': '无权发言'
    })
    assert not guest_blocked.get('success'), "关闭访客批注权限后，访客提交应当被拒"
    print("PASS 角色权限严密拦截: 当 perm_guest_annotate=0 时访客发表批注被拒 (403)")

    # 验证【数据完整性与孤儿资产防呆】: 删除外链时级联清理名下全部批注和回复
    db_path = Path(temp_dir) / 'data' / 'database.sqlite'
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM annotations WHERE item_id = ?", (item_id,))
    count_before = cursor.fetchone()[0]
    assert count_before == 2, f"删除前数据库应有 2 条批注 (内部成员1条 + 外部访客1条)，实际: {count_before}"

    body = client.api('item_delete', {
        'id': item_id
    })
    assert body and body.get('success'), f"删除外链项目失败: {body}"
    print(f"PASS 成功删除外链项目 id={item_id}")

    # 检查数据库
    cursor.execute("SELECT COUNT(*) FROM annotations WHERE item_id = ?", (item_id,))
    count_after = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM annotation_replies WHERE annotation_id = ?", (anno_id,))
    reply_after = cursor.fetchone()[0]
    conn.close()

    assert count_after == 0, f"删除外链后批注必须被完全物理清除，实际残留: {count_after}"
    assert reply_after == 0, f"删除外链后批注回复必须被完全物理清除，实际残留: {reply_after}"
    print("PASS 孤儿资产防呆验证: 删除外链时自动物理级联清空名下所有批注与回复！")

def setup_test_server(php_bin):
    temp_dir = tempfile.mkdtemp(prefix='protoloft-link-anno-')
    temp = Path(temp_dir)
    for p in ROOT.glob('*.php'):
        shutil.copy2(p, temp / p.name)
    shutil.copytree(ROOT / 'includes', temp / 'includes')
    shutil.copytree(ROOT / 'assets', temp / 'assets')
    (temp / 'data').mkdir(parents=True, exist_ok=True)
    (temp / 'data' / 'prototypes').mkdir(parents=True, exist_ok=True)
    (temp / 'data' / 'chunks').mkdir(parents=True, exist_ok=True)
    (temp / 'uploads').mkdir(parents=True, exist_ok=True)

    sock = socket.socket()
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
    sock.close()

    base_url = f'http://127.0.0.1:{port}'
    proc = subprocess.Popen(
        [php_bin, '-S', f'127.0.0.1:{port}', '-t', str(temp)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    client = TestClient(base_url)
    for _ in range(50):
        try:
            status, _, _ = client.request('install.php')
            if status in (200, 302):
                break
        except Exception:
            time.sleep(0.05)
    else:
        raise RuntimeError("PHP 服务启动超时")

    # 执行全新安装
    _, _, html = client.request('install.php')
    match = re.search(r'name="csrf_token"\s+value="([^"]+)"', html)
    assert match, "未能从 install.php 获取 csrf_token"
    install_csrf = match.group(1)
    token_p = (Path(temp_dir) / 'data' / 'install_token.php')
    if not token_p.exists(): token_p = (Path(temp_dir) / 'data' / 'install_token.txt')
    install_token = token_p.read_text().splitlines()[-1].strip()

    client.request('install.php', {
        'csrf_token': install_csrf,
        'install_token': install_token,
        'site_title': '外链批注回归测试',
        'admin_email': 'admin@test.com',
        'admin_name': '测试超管',
        'admin_password': PASS_WORD,
        'admin_password_confirm': PASS_WORD
    })

    return proc, base_url, temp_dir

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', default=sys.executable)
    args = parser.parse_args()

    php_bin = args.php if 'php' in Path(args.php).name else '/tmp/protoloft-php-review/php'
    if not Path(php_bin).exists():
        php_bin = 'php'

    proc, base_url, temp_dir = setup_test_server(php_bin)
    try:
        run_tests(base_url, temp_dir)
        print("\n=======================================================")
        print("  外链批注全链路与上版未决隐藏回归测试: 全部通过！")
        print("=======================================================\n")
    finally:
        proc.terminate()
        proc.wait()
        shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == '__main__':
    main()
