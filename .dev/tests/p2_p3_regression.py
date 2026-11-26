#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
立象原型 · ProtoLoft · P2 与 P3 审查缺陷专项回归测试套件 (静态特征 + 真实 HTTP 端到端)
覆盖:
  P2-1 (防嵌框响应头 X-Frame-Options / CSP)
  P2-2 (登录限速不可被成功登录绕过)
  P2-3 (version_update 透传真实业务错误 DomainException)
  P3-1 (管理员在成员管理给自己改密后会话保持)
  P3-2 (createUser 增加 Webhook 白名单校验)
  P3-3 (item_rotate_share 事务与失败防护)
  P3-4 (批注 page_title / page_path 长度限制与 Webhook 防爆)
  P3-5 (损坏 ZIP 上传失败清理临时分片，同名确认保留分片)
  P3-6 (install.php 建站设置与管理员创建事务一致性)
  P3-7 (resolved_at 统一采用 gmdate UTC 基准)
  P3-8 ~ P3-18 (前端静态特征与语法、防实体穿透、动画自愈、安全遮罩验证)
  Q1 ~ Q6 (访客批注可见性隔离、注册防枚举、随机分享密码、字段上限、DB 结构化助手)
"""

import concurrent.futures
import hashlib
import os
import re
import shutil
import signal
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

from security_regression import ROOT, Client, PASS, zipped


def assert_check(title, condition, extra=''):
    if not condition:
        print("FAIL: {} {}".format(title, extra))
        sys.exit(1)
    print("PASS {}".format(title))


def test_p2_1_headers():
    print("\n[*] P2-1: 防嵌框架响应头静态检查")
    for script in ['index.php', 'share.php', 'install.php']:
        content = open(os.path.join(ROOT, script), 'r', encoding='utf-8').read()
        assert_check(script + " 包含 X-Frame-Options: SAMEORIGIN", "header('X-Frame-Options: SAMEORIGIN');" in content)
        assert_check(script + " 包含 frame-ancestors 'self'", "header(\"Content-Security-Policy: frame-ancestors 'self'\");" in content)


def test_p2_2_login_throttle():
    print("\n[*] P2-2: 登录限速不可通过成功登录重置（静态检查）")
    content = open(os.path.join(ROOT, 'includes', 'auth.php'), 'r', encoding='utf-8').read()
    login_slice = content[content.find('public static function login('):content.find('public static function logout(')]
    assert_check("login 成功逻辑中不包含 clearThrottle('login')", "clearThrottle('login')" not in login_slice)


def test_p2_3_version_update_error():
    print("\n[*] P2-3: version_update 异常透传 DomainException（静态检查）")
    content = open(os.path.join(ROOT, 'includes', 'actions', 'versions.php'), 'r', encoding='utf-8').read()
    update_slice = content[content.find("case 'version_update':"):content.find("case 'version_delete':")]
    assert_check("version_update 中遇到 DomainException 原样抛出", "$e instanceof DomainException" in update_slice and "throw $e;" in update_slice)


def test_p3_backend():
    print("\n[*] P3 后端缺陷静态与逻辑核验")
    auth_content = open(os.path.join(ROOT, 'includes', 'auth.php'), 'r', encoding='utf-8').read()
    # P3-1
    assert_check("P3-1: updateUser 给自身改密时同步 auth_version 与 session", "$_SESSION['auth_version'] = $newVer;" in auth_content and "self::$cachedUser['auth_version'] = $newVer;" in auth_content)
    # P3-2 (精确限定在 createUser 函数体内)
    create_slice = auth_content[auth_content.find('public static function createUser('):auth_content.find('public static function updateUser(')]
    assert_check("P3-2: createUser 包含 Webhook::isAllowedUrl 白名单校验", "Webhook::isAllowedUrl($trimmedWb)" in create_slice)
    # P3-3
    zh_cn_lang = open(os.path.join(ROOT, 'includes', 'lang', 'zh-CN.php'), 'r', encoding='utf-8').read()
    share_action = open(os.path.join(ROOT, 'includes', 'actions', 'shares.php'), 'r', encoding='utf-8').read()
    assert_check("P3-3: item_rotate_share 失败时正确返回 success=false", "empty($newCode)" in share_action and "t('api.shares.rotate_fail')" in share_action and "'api.shares.rotate_fail' => '重置安全短链失败" in zh_cn_lang)
    # P3-4
    anno_action = open(os.path.join(ROOT, 'includes', 'actions', 'annotations.php'), 'r', encoding='utf-8').read()
    assert_check("P3-4: add_annotation 限制 pageTitle 200 字符", "mb_strlen($pageTitle, 'UTF-8') > 200" in anno_action)
    assert_check("P3-4: add_annotation 限制 pagePath 500 字符", "mb_strlen($pagePath, 'UTF-8') > 500" in anno_action)
    webhook_content = open(os.path.join(ROOT, 'includes', 'webhook.php'), 'r', encoding='utf-8').read()
    assert_check("P3-4: Webhook::buildPayload 对 page 长度截断至 200", "mb_strlen($page, 'utf-8') > 200" in webhook_content)
    # P3-5
    ver_action = open(os.path.join(ROOT, 'includes', 'actions', 'versions.php'), 'r', encoding='utf-8').read()
    assert_check("P3-5: version_publish 在 finally 中根据 cleanupChunks 清理分片", "$cleanupChunks" in ver_action and "if ($committed || $cleanupChunks)" in ver_action)
    # P3-6
    install_content = open(os.path.join(ROOT, 'install.php'), 'r', encoding='utf-8').read()
    assert_check("P3-6: install.php 系统设置与管理员创建置于事务中", "$db->beginTransaction();" in install_content and "$db->commit();" in install_content and "$db->rollBack();" in install_content)
    # P3-7
    mcp_serv = open(os.path.join(ROOT, 'includes', 'mcp_service.php'), 'r', encoding='utf-8').read()
    assert_check("P3-7: annotations.php 中 resolved_at 采用 gmdate", "gmdate('Y-m-d H:i:s')" in anno_action)
    assert_check("P3-7: mcp_service.php 中 resolved_at 采用 gmdate", "gmdate('Y-m-d H:i:s')" in mcp_serv)

    # Q 决策项扩展验证
    db_php = open(os.path.join(ROOT, 'includes', 'db.php'), 'r', encoding='utf-8').read()
    assert_check("Q6: includes/db.php 提供 DB::row 与 DB::value 结构化安全助手", "public static function row(" in db_php and "public static function value(" in db_php and "$stmt->closeCursor();" in db_php)
    assert_check("Q5: includes/auth.php 包含按账号维度的登录防爆限速与成功重置", "login_account_" in auth_content and "self::clearThrottle($accountThrottleScope, false);" in auth_content)
    action_auth = open(os.path.join(ROOT, 'includes', 'actions', 'auth.php'), 'r', encoding='utf-8').read()
    assert_check("Q2: includes/actions/auth.php 统一已有账号提示防探测", "t('api.auth.email_already_exists')" in action_auth and "该邮箱已提交申请或已存在账号" in zh_cn_lang)
    assert_check("Q1: includes/actions/annotations.php 强制外部访客署名前缀与可见性会话隔离", "t('api.anno.guest_prefix')" in anno_action and "[外部访客]" in zh_cn_lang and "$_SESSION['guest_anno_ids']" in anno_action and "!$curUser" in anno_action)


def test_p3_frontend():
    print("\n[*] P3 前端缺陷静态特征与语法核验")
    zh_cn_lang = open(os.path.join(ROOT, 'includes', 'lang', 'zh-CN.php'), 'r', encoding='utf-8').read()
    anno_js = open(os.path.join(ROOT, 'assets', 'js', 'annotation.js'), 'r', encoding='utf-8').read()
    assert_check("P3-8: deleteAnno 包含 window.confirm 兜底", "window.confirm(" in anno_js and "t('anno.delete_confirm'" in anno_js and "确定删除此批注及其全部回复？" in zh_cn_lang)
    assert_check("P3-8: toggleAnnoStatus 与 deleteAnno 补齐 .catch 错误处理", ".catch(function(err)" in anno_js)

    ver_js = open(os.path.join(ROOT, 'assets', 'js', 'ver-picker.js'), 'r', encoding='utf-8').read()
    app_js = open(os.path.join(ROOT, 'assets', 'js', 'app.js'), 'r', encoding='utf-8').read()
    assert_check("P3-9: ver-picker 暴露 global.closeAllVersionPickers", "global.closeAllVersionPickers = function()" in ver_js)
    assert_check("P3-9: app.js modalKeyboardBoundary 优先调用 closeAllVersionPickers", "typeof window.closeAllVersionPickers === 'function' && window.closeAllVersionPickers()" in app_js)

    assert_check("P3-10: app.js 声明 safeDecodeURIComponent", "function safeDecodeURIComponent(str)" in app_js)
    assert_check("P3-10: app.js 水印初始化置于 try-catch 保护下", "renderWorkspaceWatermark(true);" in app_js)

    assert_check("P3-11: app.js window.open 包含 noopener,noreferrer", "window.open(linkHref, '_blank', 'noopener,noreferrer')" in app_js)

    pwd_js = open(os.path.join(ROOT, 'assets', 'js', 'password-strength.js'), 'r', encoding='utf-8').read()
    assert_check("P3-12: password-strength.js 失败后重置 estimator = null", "estimator = null;" in pwd_js)
    assert_check("P3-12: password-strength.js vendor 脚本携带版本号", "part + '.min.js' + vQuery" in pwd_js)

    share_php = open(os.path.join(ROOT, 'share.php'), 'r', encoding='utf-8').read()
    assert_check("P3-13: share.php 分享密码输入框为 type='password'", 'type="password" id="shareProjPwdInput"' in share_php and 'autocomplete="new-password"' in share_php)
    assert_check("P3-13: toggleShareProjPwdMask 切换 input.type", "input.type = isPassword ? 'text' : 'password';" in share_php)

    items_action = open(os.path.join(ROOT, 'includes', 'actions', 'items.php'), 'r', encoding='utf-8').read()
    index_php = open(os.path.join(ROOT, 'index.php'), 'r', encoding='utf-8').read()
    assert_check("P3-14: items.php item_save 校验 name 为有效 UTF-8", "mb_check_encoding($name, 'UTF-8')" in items_action)
    assert_check("P3-14: share.php 内联 CURRENT_USER 包含 HEX 标志", "JSON_HEX_TAG | JSON_HEX_AMP" in share_php)
    assert_check("P3-14: index.php 内联 CURRENT_USER 包含 HEX 标志", "JSON_HEX_TAG | JSON_HEX_AMP" in index_php)

    assert_check("P3-15: share.php 调用 ProtoLoftWatermark 前检查 draw 方法", "typeof ProtoLoftWatermark === 'undefined' || typeof ProtoLoftWatermark.draw !== 'function'" in share_php)
    assert_check("P3-16: app.js 避免使用正则替换顶栏负责人文字", "curHtml.replace(/@([^\s·<]+)/" not in app_js)
    assert_check("P3-17: app.js 折叠展开动画记录 _animDirection 并反向自愈", "items._animDirection = 'expanding';" in app_js and "items._animDirection = 'collapsing';" in app_js and "interruptedDirection === 'collapsing'" in app_js)
    assert_check("P3-18: app.js highlightSearchMatches 在 rawText 上匹配分块转义", "while ((match = regex.exec(rawText)) !== null)" in app_js)

    share_js = open(os.path.join(ROOT, 'assets', 'js', 'share.js'), 'r', encoding='utf-8').read()
    assert_check("Q3: assets/js/share.js 采用 crypto.getRandomValues 生成 6 位随机口令", "generateSecureRandomSharePwd" in share_js and "crypto.getRandomValues" in share_js and "generateSecureRandomSharePwd(6)" in share_js)


def test_http_e2e_defects(php_bin):
    print("\n[*] P2/P3 与 Q1/Q2 真实 HTTP 端到端动态回归")
    fixture = tempfile.mkdtemp(prefix='protoloft-p2p3-test-', dir='/tmp')
    server = None
    log = None
    try:
        for path in ROOT.glob('*.php'):
            shutil.copy2(path, os.path.join(fixture, path.name))
        for name in ('includes', 'assets'):
            shutil.copytree(os.path.join(ROOT, name), os.path.join(fixture, name))
        os.makedirs(os.path.join(fixture, 'data'), exist_ok=True)
        os.makedirs(os.path.join(fixture, 'uploads', 'branding'), exist_ok=True)
        with open(os.path.join(fixture, 'router.php'), 'w', encoding='utf-8') as rf:
            rf.write("<?php if(preg_match('#^/(data|includes|\\.dev|\\.git)(/|$)#',rawurldecode(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH)))){http_response_code(403);exit;} return false;")

        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]

        log = open(os.path.join(fixture, 'server.log'), 'w', encoding='utf-8')
        env = os.environ.copy()
        env['PHP_CLI_SERVER_WORKERS'] = '6'
        server = subprocess.Popen(
            [php_bin, '-S', '127.0.0.1:' + str(port), '-t', fixture, os.path.join(fixture, 'router.php')],
            stdout=log, stderr=log, env=env, start_new_session=True
        )
        base = 'http://127.0.0.1:' + str(port)
        guest = Client(base)

        for _ in range(50):
            try:
                guest.request('/install.php')
                break
            except OSError:
                if server.poll() is not None:
                    raise RuntimeError('PHP server startup failed')
                time.sleep(0.1)

        # P2-1 install.php 响应头
        st, body, hdrs = guest.request('/install.php')
        assert_check("HTTP P2-1: install.php 返回 SAMEORIGIN 与 frame-ancestors 'self'",
                     st == 200 and hdrs.get('X-Frame-Options') == 'SAMEORIGIN' and "frame-ancestors 'self'" in (hdrs.get('Content-Security-Policy') or ''))

        token = re.search(rb'name="csrf_token" value="([^"]+)"', body).group(1).decode()
        token_file = os.path.join(fixture, 'data', 'install_token.php')
        if not os.path.exists(token_file):
            token_file = os.path.join(fixture, 'data', 'install_token.txt')
        install_token = open(token_file, 'r', encoding='utf-8').read().splitlines()[-1].strip()
        guest.request('/install.php', {
            'csrf_token': token,
            'install_token': install_token,
            'site_title': 'P2P3 Test',
            'admin_email': 'owner@example.com',
            'admin_name': 'Owner',
            'admin_password': PASS,
            'admin_password_confirm': PASS,
        })

        # P2-1 index.php / share.php 响应头
        _, _, hdr_idx = guest.request('/index.php')
        _, _, hdr_shr = guest.request('/share.php')
        assert_check("HTTP P2-1: index.php 返回 SAMEORIGIN 与 frame-ancestors 'self'",
                     hdr_idx.get('X-Frame-Options') == 'SAMEORIGIN' and "frame-ancestors 'self'" in (hdr_idx.get('Content-Security-Policy') or ''))
        assert_check("HTTP P2-1: share.php 返回 SAMEORIGIN 与 frame-ancestors 'self'",
                     hdr_shr.get('X-Frame-Options') == 'SAMEORIGIN' and "frame-ancestors 'self'" in (hdr_shr.get('Content-Security-Policy') or ''))

        owner = Client(base)
        owner.login('owner@example.com')

        # P3-2 createUser Webhook 白名单
        bad_wb = owner.api('user_add', {
            'email': 'badhook@example.com',
            'name': 'BadHook',
            'password': PASS,
            'role': 'editor',
            'webhook_url': 'https://evil.example.com/hook',
        })
        assert_check("HTTP P3-2: user_add 拒绝非白名单 Webhook", (not bad_wb.get('success')) and '企微' in bad_wb.get('message', ''))

        # 创建第二成员供后续限速与会话测试
        u2_res = owner.api('user_add', {
            'email': 'member2@example.com',
            'name': 'Member2',
            'password': PASS,
            'role': 'editor',
        })
        assert_check("HTTP 准备辅助成员成功", u2_res.get('success') is True)

        # Q2 register_visitor 防枚举
        reg_dup = guest.api('register_visitor', {
            'email': 'owner@example.com',
            'name': 'Probe',
            'password': PASS,
            'role': 'viewer',
        }, csrf=False)
        assert_check("HTTP Q2: register_visitor 对已存在账号返回统一模糊提示",
                     (not reg_dup.get('success')) and '该邮箱已提交申请或已存在账号' in reg_dup.get('message', ''))

        # P3-14 item_save UTF-8 校验
        cat_res = owner.api('category_save', {'name': 'Cat1'})
        assert_check("HTTP 准备文件夹成功", cat_res.get('success') is True)
        cat_id = cat_res['data']['id']
        bad_utf8 = owner.request('/api.php', {
            'action': 'item_save',
            'csrf_token': owner.token,
            'category_id': cat_id,
            'type': 'project',
            'name': b'\xff\xfeBadName',
        })
        assert_check("HTTP P3-14: item_save 拒绝非法 UTF-8 名称", b'"success":false' in bad_utf8[1] and '编码无效'.encode('utf-8') in bad_utf8[1])

        proj_res = owner.api('item_save', {'category_id': cat_id, 'type': 'project', 'name': 'DemoProj'})
        assert_check("HTTP 准备项目成功", proj_res.get('success') is True)
        item_id = proj_res['data']['id']

        # P3-5 损坏 ZIP 上传失败必须清理 chunks
        bad_id = uuid.uuid4().hex
        owner.api('upload_chunk', {'upload_id': bad_id, 'file_type': 'zip', 'chunk_index': 0, 'chunk_total': 1}, {'chunk_data': ('bad.zip', b'NOT_A_VALID_ZIP_BYTES')})
        bad_pub = owner.api('version_publish', {'item_id': item_id, 'version_name': 'V_BAD', 'zip_upload_id': bad_id})
        chunks_root = os.path.join(fixture, 'data', 'chunks')
        remaining_bad = [d for d in os.listdir(chunks_root) if bad_id in d] if os.path.isdir(chunks_root) else []
        assert_check("HTTP P3-5: 损坏 ZIP 发布失败并已清理对应分片目录", (not bad_pub.get('success')) and len(remaining_bad) == 0)

        # 发布 V1.0 与 V2.0，并验证同名覆盖确认期间保留分片，确认后成功且清理
        v1_id = uuid.uuid4().hex
        owner.api('upload_chunk', {'upload_id': v1_id, 'file_type': 'zip', 'chunk_index': 0, 'chunk_total': 1}, {'chunk_data': ('v1.zip', zipped('v1'))})
        v1_pub = owner.api('version_publish', {'item_id': item_id, 'version_name': 'V1.0', 'zip_upload_id': v1_id})
        assert_check("HTTP 发布 V1.0 成功", v1_pub.get('success') is True)
        ver1_id = v1_pub['data']['version_id']

        v2_id = uuid.uuid4().hex
        owner.api('upload_chunk', {'upload_id': v2_id, 'file_type': 'zip', 'chunk_index': 0, 'chunk_total': 1}, {'chunk_data': ('v2.zip', zipped('v2'))})
        v2_pub = owner.api('version_publish', {'item_id': item_id, 'version_name': 'V2.0', 'zip_upload_id': v2_id})
        assert_check("HTTP 发布 V2.0 成功", v2_pub.get('success') is True)
        ver2_id = v2_pub['data']['version_id']

        # 同名覆盖二次确认保留分片
        ow_id = uuid.uuid4().hex
        owner.api('upload_chunk', {'upload_id': ow_id, 'file_type': 'zip', 'chunk_index': 0, 'chunk_total': 1}, {'chunk_data': ('ow.zip', zipped('v2-new'))})
        ow_confirm = owner.api('version_publish', {'item_id': item_id, 'version_name': 'V2.0', 'zip_upload_id': ow_id})
        assert_check("HTTP P3-5: 同名覆盖待确认返回 requires_confirmation",
                     (not ow_confirm.get('success')) and (ow_confirm.get('data') or {}).get('requires_confirmation') is True)
        ow_chk = owner.api('version_check_name', {'item_id': item_id, 'version_name': 'V2.0'})
        assert_check("HTTP P3-5: 获取 overwrite_token 成功", ow_chk.get('success') is True and bool(ow_chk['data']['overwrite_token']))
        ow_pub = owner.api('version_publish', {
            'item_id': item_id,
            'version_name': 'V2.0',
            'zip_upload_id': ow_id,
            'overwrite_token': ow_chk['data']['overwrite_token'],
        })
        assert_check("HTTP P3-5: 同名覆盖二次提交复用保留分片成功", ow_pub.get('success') is True)
        ver2_id = ow_pub['data']['version_id']

        # P2-3 version_update 真实错误透传
        dup_upd = owner.api('version_update', {'id': ver2_id, 'version_name': 'V1.0'})
        assert_check("HTTP P2-3: version_update 改名冲突返回真实原因", (not dup_upd.get('success')) and dup_upd.get('message') == '该项目已存在同名版本')
        none_upd = owner.api('version_update', {'id': 999999, 'version_name': 'V9.0'})
        assert_check("HTTP P2-3: version_update 不存在返回真实原因", (not none_upd.get('success')) and none_upd.get('message') == '版本不存在')

        # P3-4 批注长度上限 + Q1 访客隔离
        long_title = owner.api('add_annotation', {'item_id': item_id, 'ver_id': ver1_id, 'page_title': 'A' * 201, 'page_path': 'p.html', 'content': 'ok'})
        assert_check("HTTP P3-4: page_title 超过 200 字符被拒", (not long_title.get('success')) and '200' in long_title.get('message', ''))
        long_path = owner.api('add_annotation', {'item_id': item_id, 'ver_id': ver1_id, 'page_title': 'ok', 'page_path': 'p' * 501, 'content': 'ok'})
        assert_check("HTTP P3-4: page_path 超过 500 字符被拒", (not long_path.get('success')) and '500' in long_path.get('message', ''))

        # 开启访客批注，验证 Q1
        role_res = owner.api('save_role_permissions', {
            'perm_editor_share': '1',
            'perm_viewer_share': '0',
            'perm_viewer_download_rp': '0',
            'perm_guest_download_rp': '0',
            'perm_guest_annotate': '1',
        })
        assert_check("HTTP 开启访客批注权限成功", role_res.get('success') is True)
        share_res = owner.api('item_get_share', {'id': item_id})
        assert_check("HTTP 获取项目分享短码成功", share_res.get('success') is True and bool(share_res['data']['share_code']))
        share_code = share_res['data']['share_code']
        g1 = Client(base)
        g2 = Client(base)
        _, g1_html, _ = g1.request('/share.php?s=' + share_code)
        _, g2_html, _ = g2.request('/share.php?s=' + share_code)
        m_csrf1 = re.search(rb'window\.CSRF_TOKEN\s*=\s*"([^"]+)"', g1_html)
        m_csrf2 = re.search(rb'window\.CSRF_TOKEN\s*=\s*"([^"]+)"', g2_html)
        if m_csrf1:
            g1.token = m_csrf1.group(1).decode()
        if m_csrf2:
            g2.token = m_csrf2.group(1).decode()
        g1_add = g1.api('add_annotation', {'item_id': item_id, 'ver_id': ver1_id, 'page_path': 'index.html', 'page_title': '首页', 'content': '访客意见', 'guest_name': 'Alice'})
        assert_check("HTTP Q1: 访客批注强制追加 [外部访客] 前缀", g1_add.get('success') is True and g1_add['data']['author_name'].startswith('[外部访客]'), str(g1_add))
        g2_list = g2.api('list_annotations', {'item_id': item_id, 'ver_id': ver1_id})
        assert_check("HTTP Q1: 另一访客会话无法看到他人批注", g2_list.get('success') is True and len(g2_list['data']['list']) == 0, str(g2_list))

        # R1 访客按编号调用 annotation_target / previous_annotations / reply_annotation 隔离验证
        secret_note = 'INTERNAL_REVIEW_SECRET_R1_TOKEN'
        own_anno_res = owner.api('add_annotation', {
            'item_id': item_id,
            'ver_id': ver1_id,
            'page_path': 'index.html',
            'page_title': '首页',
            'content': secret_note,
        })
        assert_check("HTTP R1: 准备管理员内部批注成功", own_anno_res.get('success') is True)
        internal_id = int(own_anno_res['data']['id'])

        _, tgt_internal_body, _ = g2.request('/api.php?action=annotation_target&id=' + str(internal_id))
        assert_check("HTTP R1: 访客调 annotation_target 读取内部批注被拒且不泄露正文",
                     secret_note.encode('utf-8') not in tgt_internal_body and b'"success":false' in tgt_internal_body)

        g1_own_id = int(g1_add['data']['id'])
        _, tgt_g1_by_g1, _ = g1.request('/api.php?action=annotation_target&id=' + str(g1_own_id))
        _, tgt_g1_by_g2, _ = g2.request('/api.php?action=annotation_target&id=' + str(g1_own_id))
        assert_check("HTTP R1: 访客可调 annotation_target 读取自己发表的批注",
                     b'"success":true' in tgt_g1_by_g1 and '访客意见'.encode('utf-8') in tgt_g1_by_g1)
        assert_check("HTTP R1: 另一访客调 annotation_target 读取他人访客批注同样被拒",
                     b'"success":false' in tgt_g1_by_g2 and '访客意见'.encode('utf-8') not in tgt_g1_by_g2)

        owner.api('version_set_default', {'id': ver2_id})
        g2.request('/share.php?s=' + share_code)
        prev_res = g2.api('previous_annotations', {'ver_id': ver2_id})
        prev_list = (prev_res.get('data') or {}).get('list') or []
        assert_check("HTTP R1: 访客请求 previous_annotations 不会泄露旧版内部批注",
                     prev_res.get('success') is True and all(secret_note not in (x.get('content') or '') for x in prev_list),
                     str(prev_res))

        rep_internal = g2.api('reply_annotation', {'annotation_id': internal_id, 'content': 'probe'})
        assert_check("HTTP R1: 访客回复内部批注被拒绝", not rep_internal.get('success'))

        # P3-7 resolved_at UTC 时间基准
        anno_id = g1_add['data']['id']
        res_toggle = owner.api('toggle_annotation_status', {'id': anno_id})
        assert_check("HTTP P3-7: 解决批注成功", res_toggle.get('success') is True)
        db = sqlite3.connect(os.path.join(fixture, 'data', 'database.sqlite'))
        created_at, resolved_at = db.execute("SELECT created_at, resolved_at FROM annotations WHERE id = ?", (anno_id,)).fetchone()
        db.close()
        assert_check("HTTP P3-7: resolved_at 与 created_at 同为 UTC 格式且日期一致", bool(resolved_at) and created_at[:10] == resolved_at[:10])

        # P3-1 管理员 user_update 给自己改密后会话保持
        new_owner_pw = 'Owner-New-Pass-2026'
        me = owner.api('get_session')['data']['user']
        upd_self = owner.api('user_update', {
            'id': me['id'],
            'name': me['name'],
            'email': me['email'],
            'role': 'admin',
            'status': 1,
            'new_password': new_owner_pw,
        })
        assert_check("HTTP P3-1: user_update 给自己改密成功", upd_self.get('success') is True)
        sess_after = owner.api('get_session')
        assert_check("HTTP P3-1: 改密后 get_session 仍保持当前本人登录态",
                     sess_after.get('success') is True and (sess_after.get('data') or {}).get('user', {}).get('id') == me['id'])
        old_login = Client(base).api('login', {'email': 'owner@example.com', 'password': PASS}, csrf=False)
        assert_check("HTTP P3-1: 改密后旧密码无法登录", not old_login.get('success'))
        new_login = Client(base).api('login', {'email': 'owner@example.com', 'password': new_owner_pw}, csrf=False)
        assert_check("HTTP P3-1: 改密后新密码可正常登录", new_login.get('success') is True)

        # P2-2 同 IP 连续错误 9 次后插入正确登录，第 10 次错误后第 11 次触发 IP 限速拦截
        db_t = sqlite3.connect(os.path.join(fixture, 'data', 'database.sqlite'))
        db_t.execute("DELETE FROM settings WHERE key LIKE 'throttle_%'")
        db_t.commit()
        db_t.close()
        attacker = Client(base)
        for _ in range(5):
            r = attacker.api('login', {'email': 'owner@example.com', 'password': 'Wrong-Password-1'}, csrf=False)
            assert not r.get('success')
        for _ in range(4):
            r = attacker.api('login', {'email': 'member2@example.com', 'password': 'Wrong-Password-2'}, csrf=False)
            assert not r.get('success')
        # 插入正确登录（应成功，但绝不能重置 IP 计数）
        ok_m2 = attacker.api('login', {'email': 'member2@example.com', 'password': PASS}, csrf=False)
        assert_check("HTTP P2-2: 中间插入另一账号正确登录成功", ok_m2.get('success') is True)
        # 第 10 次错误（累计 IP 失败达到 10）
        r10 = attacker.api('login', {'email': 'owner@example.com', 'password': 'Wrong-Password-3'}, csrf=False)
        assert not r10.get('success')
        # 第 11 次尝试应被 IP 防爆破限速拦截
        r11 = attacker.api('login', {'email': 'owner@example.com', 'password': 'Wrong-Password-4'}, csrf=False)
        assert_check("HTTP P2-2: 第 11 次登录请求被 IP 限速拦截（未被成功登录清零）",
                     (not r11.get('success')) and '失败次数过多' in r11.get('message', ''))

        # R3 方案 C：未登录过的网段受账号锁拦截，近期成功登录网段豁免账号锁
        tr_res = owner.api('user_add', {
            'email': 'traveler@example.com',
            'name': 'Traveler',
            'password': PASS,
            'role': 'editor',
        })
        assert_check("HTTP R3: 创建测试账号 traveler 成功", tr_res.get('success') is True)
        db_t = sqlite3.connect(os.path.join(fixture, 'data', 'database.sqlite'))
        db_t.execute("DELETE FROM settings WHERE key LIKE 'throttle_%'")
        db_t.commit()
        db_t.close()
        for idx in range(10):
            Client(base).api('login', {'email': 'traveler@example.com', 'password': 'Wrong-%d' % idx}, csrf=False)
        # 清除 IP 限速但保留账号维度限速，模拟第 11 次来自从未登录过的新网络
        ip_throttle_key = 'throttle_' + hashlib.sha256(b'login|127.0.0.1').hexdigest()
        db_t = sqlite3.connect(os.path.join(fixture, 'data', 'database.sqlite'))
        db_t.execute("DELETE FROM settings WHERE key = ?", (ip_throttle_key,))
        db_t.commit()
        db_t.close()
        tr_blocked = Client(base).api('login', {'email': 'traveler@example.com', 'password': PASS}, csrf=False)
        assert_check("HTTP R3: 从未成功登录过的新网络被账号锁拦截",
                     (not tr_blocked.get('success')) and '该账号失败次数过多' in tr_blocked.get('message', ''), str(tr_blocked))

        # 清空限速后让 traveler 正常登录一次记入常用网段，再模拟外部刷新账号错误次数至 10 次
        db_t = sqlite3.connect(os.path.join(fixture, 'data', 'database.sqlite'))
        db_t.execute("DELETE FROM settings WHERE key LIKE 'throttle_%'")
        db_t.commit()
        db_t.close()
        tr_ok1 = Client(base).api('login', {'email': 'traveler@example.com', 'password': PASS}, csrf=False)
        assert_check("HTTP R3: traveler 首次成功登录记入常用网段", tr_ok1.get('success') is True)
        acc_key = 'throttle_' + hashlib.sha256(b'login_account_traveler@example.com|').hexdigest()
        db_t = sqlite3.connect(os.path.join(fixture, 'data', 'database.sqlite'))
        db_t.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (acc_key, '{"c":10,"ts":%d}' % int(time.time())))
        db_t.commit()
        db_t.close()
        tr_trusted_ok = Client(base).api('login', {'email': 'traveler@example.com', 'password': PASS}, csrf=False)
        assert_check("HTTP R3: 近期成功登录网段豁免账号维度锁，不被外部刷错锁死", tr_trusted_ok.get('success') is True, str(tr_trusted_ok))

        # R2 并发压测：24 个并发错误登录与 24 个并发错误分享口令，实际校验次数均严格 <= 10 且零 500 错误
        pwd_set = owner.api('item_save_share', {'id': item_id, 'share_enabled': 1, 'access_password': 'SharePwd!2026'})
        assert_check("HTTP R2: 设置分享口令成功", pwd_set.get('success') is True)
        db_t = sqlite3.connect(os.path.join(fixture, 'data', 'database.sqlite'))
        db_t.execute("DELETE FROM settings WHERE key LIKE 'throttle_%' OR key LIKE 'login_trusted_nets_%'")
        db_t.commit()
        db_t.close()

        def raw_post(path, fields):
            req = urllib.request.Request(
                base + path,
                data=urllib.parse.urlencode(fields).encode('utf-8'),
                headers={'Content-Type': 'application/x-www-form-urlencoded'}
            )
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    return resp.status, resp.read().decode('utf-8', 'replace')
            except urllib.error.HTTPError as err:
                return err.code, err.read().decode('utf-8', 'replace')

        with concurrent.futures.ThreadPoolExecutor(max_workers=24) as pool:
            login_outs = list(pool.map(
                lambda i: raw_post('/api.php', {'action': 'login', 'email': 'owner@example.com', 'password': 'Nope-%d' % i}),
                range(24)
            ))
        login_eval = sum(1 for st_c, bd in login_outs if st_c < 500 and '邮箱或密码错误' in bd)
        login_5xx = sum(1 for st_c, _ in login_outs if st_c >= 500)
        assert_check("HTTP R2: 24 并发错误登录仅校验 <=10 次且零 500 错误",
                     login_5xx == 0 and 1 <= login_eval <= 10, f"eval={login_eval}, 5xx={login_5xx}")

        with concurrent.futures.ThreadPoolExecutor(max_workers=24) as pool:
            share_outs = list(pool.map(
                lambda i: raw_post('/share.php?s=' + share_code, {'project_password': 'WrongPwd-%d' % i}),
                range(24)
            ))
        share_eval = sum(1 for st_c, bd in share_outs if st_c == 200 and 'shareProjPwdInput' in bd)
        share_429 = sum(1 for st_c, _ in share_outs if st_c == 429)
        share_5xx = sum(1 for st_c, _ in share_outs if st_c >= 500)
        assert_check("HTTP R2: 24 并发错误分享口令仅校验 <=10 次且其余 429 拦截",
                     share_5xx == 0 and 1 <= share_eval <= 10 and share_429 >= 14,
                     f"eval={share_eval}, 429={share_429}, 5xx={share_5xx}")
    finally:
        if log:
            log.close()
        if server and server.poll() is None:
            try:
                pgid = os.getpgid(server.pid)
            except Exception:
                pgid = None
            try:
                if pgid is not None:
                    os.killpg(pgid, signal.SIGTERM)
                else:
                    server.terminate()
                server.wait(timeout=5)
            except Exception:
                try:
                    if pgid is not None:
                        os.killpg(pgid, signal.SIGKILL)
                    else:
                        server.kill()
                except Exception:
                    pass
        shutil.rmtree(fixture, ignore_errors=True)


def main():
    php_bin = 'php'
    if len(sys.argv) > 1 and sys.argv[1].startswith('--php='):
        php_bin = sys.argv[1].split('=', 1)[1]
    elif len(sys.argv) > 2 and sys.argv[1] == '--php':
        php_bin = sys.argv[2]

    print("======================================================================")
    print("   立象原型 · ProtoLoft · P2 与 P3 缺陷专项回归测试                   ")
    print("======================================================================")

    test_p2_1_headers()
    test_p2_2_login_throttle()
    test_p2_3_version_update_error()
    test_p3_backend()
    test_p3_frontend()
    test_http_e2e_defects(php_bin)

    print("\n======================================================================")
    print("  ALL P2 AND P3 DEFECT REGRESSION TESTS PASSED (STATIC + HTTP E2E)!   ")
    print("======================================================================")


if __name__ == '__main__':
    main()
