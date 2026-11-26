#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
立象原型 · ProtoLoft · 全局多语言闭环专项回归测试 (v3.2.0)
覆盖：
1. 静态语言包校验：语法检查、三语键集合严格一致、非空校验、{placeholder} 占位符一致、钉钉/飞书安全关键词保留；
2. 端到端 HTTP 闭环：默认 zh-CN、切至 zh-TW/en 并持久化、index.php/share.php/API 联动、Viewer 权限包隔离（不暴露 admin.*）、非法语言拒绝拦截。
"""
import argparse
import json
import re
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from security_regression import Client, PASS, ROOT, uuid, zipped

WEBHOOK_KEYWORD_KEYS = {
    'profile.webhook_hint',
    'admin.users.personal_webhook_hint',
    'admin.settings.global_webhook_hint',
    'admin.item.item_webhook_hint',
    'webhook.err_keyword',
}


def load_lang_packs(php_bin):
    code = (
        "echo json_encode(["
        "'zh-CN' => require 'includes/lang/zh-CN.php',"
        "'zh-TW' => require 'includes/lang/zh-TW.php',"
        "'en' => require 'includes/lang/en.php'"
        "], JSON_UNESCAPED_UNICODE);"
    )
    out = subprocess.check_output([php_bin, '-r', code], cwd=str(ROOT), stderr=subprocess.PIPE).decode('utf-8')
    return json.loads(out)


def run_static_checks(php_bin, check):
    for rel in ('includes/i18n.php', 'includes/lang/zh-CN.php', 'includes/lang/zh-TW.php', 'includes/lang/en.php'):
        res = subprocess.run([php_bin, '-l', str(ROOT / rel)], capture_output=True, text=True)
        check(f'php syntax valid: {rel}', res.returncode == 0)

    node_bin = shutil.which('node') or '/Users/yyy/.nvm/versions/node/v22.23.5/bin/node'
    if Path(node_bin).is_file() or shutil.which(node_bin):
        res = subprocess.run([node_bin, '--check', str(ROOT / 'assets/js/i18n.js')], capture_output=True, text=True)
        check('js syntax valid: assets/js/i18n.js', res.returncode == 0)

    packs = load_lang_packs(php_bin)
    zh_cn, zh_tw, en = packs['zh-CN'], packs['zh-TW'], packs['en']
    keys_cn, keys_tw, keys_en = set(zh_cn.keys()), set(zh_tw.keys()), set(en.keys())
    check(f'language packs contain full catalog ({len(keys_cn)} keys)', len(keys_cn) >= 1500)
    check('zh-CN and zh-TW share identical key set', keys_cn == keys_tw)
    check('zh-CN and en share identical key set', keys_cn == keys_en)

    intentional_empty = {('en', 'admin.dash.unit_item'), ('en', 'admin.dash.unit_people')}
    empty_keys = [
        (loc, k)
        for loc, data in packs.items()
        for k, v in data.items()
        if (loc, k) not in intentional_empty and (not isinstance(v, str) or v.strip() == '')
    ]
    check('no unexpected empty translations across zh-CN/zh-TW/en', len(empty_keys) == 0)

    ph_re = re.compile(r'\{([a-zA-Z0-9_]+)\}')
    ph_mismatches = []
    for k in keys_cn:
        p_cn = sorted(ph_re.findall(zh_cn[k]))
        p_tw = sorted(ph_re.findall(zh_tw[k]))
        p_en = sorted(ph_re.findall(en[k]))
        if p_cn != p_tw or p_cn != p_en:
            ph_mismatches.append((k, p_cn, p_tw, p_en))
    check('placeholder variables match across all 3 locales', len(ph_mismatches) == 0)

    check('en brand.name is ProtoLoft', en.get('brand.name') == 'ProtoLoft')
    check('en brand.slogan matches guideline', en.get('brand.slogan') == 'Give ideas a shared home.')
    check(
        'unified ProtoLoft webhook keyword present across all 3 locales',
        all(
            'ProtoLoft' in packs[loc].get(k, '') and 'ProtoLoft' in packs[loc].get('webhook.footer_source', '')
            for loc in ('zh-CN', 'zh-TW', 'en')
            for k in WEBHOOK_KEYWORD_KEYS
        )
    )

    en_cjk_leaks = [
        k for k, v in en.items()
        if re.search(r'[\u4e00-\u9fff]', v)
    ]
    check(f'en pack completely free of CJK characters (found={len(en_cjk_leaks)})', len(en_cjk_leaks) == 0)


def extract_i18n_bundle(html):
    lm = re.search(r'window\.__LOCALE__\s*=\s*"([^"]+)"', html)
    assert lm, 'window.__LOCALE__ missing from rendered HTML'
    m = re.search(r'window\.__I18N__\s*=\s*', html)
    assert m, 'window.__I18N__ bundle missing from rendered HTML'
    catalog, _ = json.JSONDecoder().raw_decode(html[m.end():])
    assert isinstance(catalog, dict), 'window.__I18N__ must be a JSON object'
    return {'locale': lm.group(1), 'catalog': catalog}


def run_http_checks(php_bin, check):
    fixture = Path(tempfile.mkdtemp(prefix='protoloft-i18n-test-', dir='/tmp'))
    for path in ROOT.glob('*.php'):
        shutil.copy2(path, fixture / path.name)
    for name in ('includes', 'assets'):
        shutil.copytree(ROOT / name, fixture / name)
    (fixture / 'data').mkdir()
    (fixture / 'uploads').mkdir()
    (fixture / 'router.php').write_text(
        "<?php if(preg_match('#^/(data|includes|\\.dev|\\.git)(/|$)#',rawurldecode(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH)))){http_response_code(403);exit;} return false;",
        encoding='utf-8'
    )

    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]

    log = open(fixture / 'server.log', 'w')
    server = subprocess.Popen(
        [php_bin, '-S', f'127.0.0.1:{port}', '-t', str(fixture), str(fixture / 'router.php')],
        stdout=log,
        stderr=log,
    )
    db = None

    try:
        guest = Client(f'http://127.0.0.1:{port}')
        for _ in range(50):
            try:
                guest.request('/install.php')
                break
            except OSError:
                if server.poll() is not None:
                    raise RuntimeError('PHP server startup failed')
                time.sleep(0.1)

        # 全新安装前应显示默认 zh-CN 安装向导
        st_inst, body_inst, _ = guest.request('/install.php')
        html_inst = body_inst.decode('utf-8')
        check('install wizard defaults to zh-CN', st_inst == 200 and '<html lang="zh-CN">' in html_inst and '安装向导' in html_inst)

        token = re.search(r'name="csrf_token" value="([^"]+)"', html_inst).group(1)
        token_file = (fixture / 'data/install_token.php') if (fixture / 'data/install_token.php').exists() else (fixture / 'data/install_token.txt')
        install_token = token_file.read_text(encoding='utf-8').splitlines()[-1].strip()
        guest.request('/install.php', {
            'csrf_token': token,
            'install_token': install_token,
            'site_title': '',
            'admin_email': 'owner@example.com',
            'admin_name': 'Owner',
            'admin_password': PASS,
            'admin_password_confirm': PASS,
        })

        owner = Client(guest.base)
        owner.login('owner@example.com')

        # 1. 默认 zh-CN
        st, body, _ = owner.request('/index.php')
        html_cn = body.decode('utf-8')
        bundle_cn = extract_i18n_bundle(html_cn)
        check('default workspace renders zh-CN', st == 200 and '<html lang="zh-CN">' in html_cn and '系统语言' in html_cn)
        check('admin receives admin.* catalog in bundle', any(k.startswith('admin.') for k in bundle_cn.get('catalog', {})))

        # 创建测试分类、项目、发布首个版本与专属分享短链
        cat_res = owner.api('category_save', {'name': 'DemoCat'})
        assert cat_res['success'], cat_res
        item_res = owner.api('item_save', {'name': 'DemoProj', 'category_id': cat_res['data']['id'], 'type': 'project'})
        assert item_res['success'], item_res
        item_id = item_res['data']['id']
        up_id = uuid.uuid4().hex
        up_res = owner.api('upload_chunk', {'upload_id': up_id, 'file_type': 'zip', 'chunk_index': 0, 'chunk_total': 1}, {'chunk_data': ('part', zipped())})
        assert up_res['success'], up_res
        ver_res = owner.api('version_publish', {'item_id': item_id, 'version_name': 'v1.0', 'zip_upload_id': up_id})
        assert ver_res['success'], ver_res
        share_res = owner.api('share_code_create', {'item_id': item_id, 'label': 'Public'})
        assert share_res['success'], share_res
        share_code = share_res['data']['code']

        st_s, body_s, _ = guest.request(f'/share.php?s={share_code}')
        check('share sandbox renders zh-CN by default', st_s == 200 and '<html lang="zh-CN">' in body_s.decode('utf-8') and '立象原型' in body_s.decode('utf-8'))

        # 2. 切换为繁體中文 zh-TW 并核验全链路
        save_tw = owner.api('save_settings', {'system_language': 'zh-TW'})
        check('save_settings accepts zh-TW and returns updated value', save_tw['success'] and save_tw['data'].get('system_language') == 'zh-TW')

        st_tw, body_tw, _ = owner.request('/index.php')
        html_tw = body_tw.decode('utf-8')
        bundle_tw = extract_i18n_bundle(html_tw)
        check('workspace switches to zh-TW', st_tw == 200 and '<html lang="zh-TW">' in html_tw and '系統語言' in html_tw)
        check('zh-TW window.__I18N__ uses zh-TW locale', bundle_tw.get('locale') == 'zh-TW')

        st_stw, body_stw, _ = guest.request(f'/share.php?s={share_code}')
        check('share sandbox follows zh-TW setting', st_stw == 200 and '<html lang="zh-TW">' in body_stw.decode('utf-8') and '企業級產品資產交付中心' in body_stw.decode('utf-8'))

        # 3. 切换为 English (en) 并核验全链路
        save_en = owner.api('save_settings', {'system_language': 'en'})
        check('save_settings accepts en and returns updated value', save_en['success'] and save_en['data'].get('system_language') == 'en')

        st_en, body_en, _ = owner.request('/index.php')
        html_en = body_en.decode('utf-8')
        bundle_en = extract_i18n_bundle(html_en)
        check('workspace switches to en', st_en == 200 and '<html lang="en">' in html_en and 'Language' in html_en and 'ProtoLoft' in html_en)
        check('en window.__I18N__ uses en locale', bundle_en.get('locale') == 'en')

        st_sen, body_sen, _ = guest.request(f'/share.php?s={share_code}')
        html_sen = body_sen.decode('utf-8')
        check('share sandbox follows en setting', st_sen == 200 and '<html lang="en">' in html_sen and 'ProtoLoft · Shared Prototype Delivery' in html_sen)

        # 未登录 / 错误凭据 API 返回英文
        bad_login = guest.api('login', {'email': 'owner@example.com', 'password': 'WrongPassword123'})
        check('API error response follows en setting', (not bad_login['success']) and bool(bad_login.get('message')) and not re.search(r'[\u4e00-\u9fff]', bad_login['message']))

        # 4. 普通审阅人 (Viewer) 不加载 admin.js，且 __I18N__ 不泄露 admin.* 词条
        viewer_create = owner.api('user_add', {
            'email': 'viewer@example.com',
            'name': 'ViewerUser',
            'role': 'viewer',
            'password': PASS,
        })
        assert viewer_create['success'], viewer_create
        viewer = Client(guest.base)
        viewer.login('viewer@example.com')
        st_v, body_v, _ = viewer.request('/index.php')
        html_v = body_v.decode('utf-8')
        bundle_v = extract_i18n_bundle(html_v)
        check('viewer page renders en without admin.js', st_v == 200 and '<html lang="en">' in html_v and 'assets/js/admin.js' not in html_v)
        check('viewer __I18N__ excludes admin.* catalog keys', not any(k.startswith('admin.') for k in bundle_v.get('catalog', {})))

        # 5. 非法语言值拦截与持久保持
        bad_lang = owner.api('save_settings', {'system_language': 'fr-FR'})
        check('invalid system_language is rejected', (not bad_lang['success']) and not re.search(r'[\u4e00-\u9fff]', bad_lang.get('message', '')))

        db = sqlite3.connect(fixture / 'data/database.sqlite')
        saved_lang = db.execute("SELECT value FROM settings WHERE key = 'system_language'").fetchone()[0]
        check('database retains valid system_language after rejected write', saved_lang == 'en')

        # 6. 恢复 zh-CN 验证完整闭环
        save_back = owner.api('save_settings', {'system_language': 'zh-CN'})
        check('switching back to zh-CN succeeds', save_back['success'] and save_back['data'].get('system_language') == 'zh-CN')
        _, body_back, _ = owner.request('/index.php')
        check('workspace returns to zh-CN cleanly', '<html lang="zh-CN">' in body_back.decode('utf-8') and '系统语言' in body_back.decode('utf-8'))

    finally:
        if db is not None:
            db.close()
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
        log.close()
        shutil.rmtree(fixture, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser(description='立象原型多语言专项回归测试')
    parser.add_argument('--php', default=shutil.which('php') or '/Users/yyy/.local/bin/php')
    args = parser.parse_args()

    checks = []

    def check(name, condition):
        assert condition, name
        checks.append(name)
        print('PASS', name, flush=True)

    run_static_checks(args.php, check)
    run_http_checks(args.php, check)
    print(json.dumps({'passed': len(checks), 'scope': 'i18n static catalog & live 3-locale E2E'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
