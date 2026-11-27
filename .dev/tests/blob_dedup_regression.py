#!/usr/bin/env python3
"""Blob 内容寻址去重、跨项目模板复用、秒传协议与一次性迁移脚本端到端回归测试。
用法: python3 -B .dev/tests/blob_dedup_regression.py --php /path/to/php
"""
import argparse
import contextlib
import hashlib
import io
import json
from pathlib import Path
import re
import shutil
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.error
import zipfile
from security_regression import ROOT, PASS, Client, uuid


def make_zip(entries):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for path, content in entries.items():
            zf.writestr(path, content)
    return buf.getvalue()


def sha256_bytes(data):
    if isinstance(data, str):
        data = data.encode('utf-8')
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', required=True)
    args = parser.parse_args()

    temp = Path(tempfile.mkdtemp(prefix='protoloft-blob-test-', dir='/tmp'))
    for p in ROOT.glob('*.php'):
        shutil.copy2(p, temp / p.name)
    for name in ('includes', 'assets'):
        shutil.copytree(ROOT / name, temp / name)
    (temp / 'data').mkdir()
    (temp / 'router.php').write_text(
        "<?php if (preg_match('#^/(data|includes|\\.dev|\\.git)(/|$)#', rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH)))) {http_response_code(403);exit;} return false;"
    )

    with contextlib.closing(socket.socket()) as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base = 'http://127.0.0.1:%d' % port
    log = open(temp / 'server.log', 'w')
    server = subprocess.Popen([args.php, '-S', '127.0.0.1:%d' % port, '-t', str(temp), str(temp / 'router.php')], stdout=log, stderr=log)
    db = None
    checks = []

    def check(name, cond):
        assert cond, name
        checks.append(name)
        print('PASS', name, flush=True)

    try:
        guest = Client(base)
        for _ in range(60):
            try:
                guest.request('/install.php')
                break
            except (OSError, urllib.error.URLError):
                if server.poll() is not None:
                    raise RuntimeError((temp / 'server.log').read_text())
                time.sleep(0.1)
        _, body, _ = guest.request('/install.php')
        csrf_token = re.search(rb'name="csrf_token" value="([^"]+)"', body).group(1).decode()
        token_p = (temp / 'data/install_token.php') if (temp / 'data/install_token.php').exists() else (temp / 'data/install_token.txt')
        install_token = token_p.read_text().splitlines()[-1].strip()
        guest.request('/install.php', {
            'csrf_token': csrf_token,
            'install_token': install_token,
            'site_title': 'Blob Hub',
            'admin_email': 'owner@test.local',
            'admin_name': 'Owner',
            'admin_password': PASS,
            'admin_password_confirm': PASS,
        })
        owner = Client(base)
        owner.login('owner@test.local')
        db = sqlite3.connect(temp / 'data/database.sqlite')

        cat_id = owner.api('category_save', {'name': 'Dedup Folder'})['data']['id']
        item_a = owner.api('item_save', {'category_id': cat_id, 'name': 'Project A', 'type': 'project'})['data']['id']
        item_b = owner.api('item_save', {'category_id': cat_id, 'name': 'Project B', 'type': 'project'})['data']['id']

        shared_pdf = b'%PDF-1.4\n' + (b'SHARED_TEMPLATE_PDF_CONTENT_' * 500)
        shared_html = '<!DOCTYPE html><html><head><title>Template</title></head><body><h1>Shared</h1></body></html>'
        page_a = '<!DOCTYPE html><html><head><title>Page A</title></head><body><a href="shared.pdf">PDF</a></body></html>'
        page_b = '<!DOCTYPE html><html><head><title>Page B</title></head><body><a href="shared.pdf">PDF</a></body></html>'

        # 1. Project A 发布 v1.0（全量上传）
        zip_a = make_zip({'index.html': page_a, 'shared.html': shared_html, 'docs/shared.pdf': shared_pdf})
        up_a = uuid.uuid4().hex
        assert owner.api('upload_chunk', {'upload_id': up_a, 'file_type': 'zip', 'chunk_index': 0, 'chunk_total': 1}, {'chunk_data': ('part', zip_a)})['success']
        pub_a = owner.api('version_publish', {'item_id': item_a, 'version_name': 'v1.0', 'zip_upload_id': up_a, 'is_default': 1})
        check('Project A v1.0 全量发布成功', pub_a['success'])
        va1 = pub_a['data']['id']

        blob_count_after_a = len([p for p in (temp / 'data/blobs').rglob('*') if p.is_file()])
        check('Project A 落盘 3 个唯一 Blob', blob_count_after_a == 3)

        # 2. blob_check 校验秒传命中（含二进制 PDF 与被注入过的 HTML）
        pdf_hash = sha256_bytes(shared_pdf)
        html_hash = sha256_bytes(shared_html)
        miss_hash = sha256_bytes(page_b)
        chk = owner.api('blob_check', {'hashes': json.dumps([pdf_hash, html_hash, miss_hash])})
        check('blob_check 精确命中已存在的 PDF 与模板 HTML，未命中新页面', chk['success'] and set(chk['data']['existing']) == {pdf_hash, html_hash})

        # 3. Project B 使用相同模板 HTML 和 PDF，仅上传差异 index.html 发布
        delta_zip_b = make_zip({'index.html': page_b})
        up_b = uuid.uuid4().hex
        assert owner.api('upload_chunk', {'upload_id': up_b, 'file_type': 'zip', 'chunk_index': 0, 'chunk_total': 1}, {'chunk_data': ('part', delta_zip_b)})['success']
        manifest_b = [
            {'path': 'shared.html', 'hash': html_hash, 'size': len(shared_html)},
            {'path': 'docs/shared.pdf', 'hash': pdf_hash, 'size': len(shared_pdf)},
        ]
        pub_b = owner.api('version_publish', {
            'item_id': item_b,
            'version_name': 'v1.0',
            'zip_upload_id': up_b,
            'blob_manifest': json.dumps(manifest_b),
            'is_default': 1,
        })
        check('Project B 增量秒传发布成功', pub_b['success'])
        vb1 = pub_b['data']['id']

        blob_count_after_b = len([p for p in (temp / 'data/blobs').rglob('*') if p.is_file()])
        check('跨项目共用模板与 PDF 仅增量落盘 1 个新 Blob', blob_count_after_b == 4)

        code_b, body_b, _ = owner.request('/asset.php/v%d/docs/shared.pdf' % vb1)
        check('Project B 可正常读取秒传复用的 PDF', code_b == 200 and body_b == shared_pdf)

        # 4. 全量 100% 秒传发布（zip_upload_id 为空）
        manifest_a2 = [
            {'path': 'index.html', 'hash': sha256_bytes(page_a), 'size': len(page_a)},
            {'path': 'shared.html', 'hash': html_hash, 'size': len(shared_html)},
            {'path': 'docs/shared.pdf', 'hash': pdf_hash, 'size': len(shared_pdf)},
        ]
        pub_a2 = owner.api('version_publish', {
            'item_id': item_a,
            'version_name': 'v1.1',
            'blob_manifest': json.dumps(manifest_a2),
            'is_default': 1,
        })
        check('全量 100% 秒传免传 ZIP 发布成功', pub_a2['success'])
        check('全量秒传不产生任何新 Blob', len([p for p in (temp / 'data/blobs').rglob('*') if p.is_file()]) == 4)

        # 5. 删除 Project A，验证共享 Blob 不被误删，独有 Blob 被 GC 清理
        del_a = owner.api('item_delete', {'id': item_a})
        check('删除 Project A 成功', del_a['success'])
        check('共享模板与 PDF 仍保留，Project A 独有页面 Blob 已回收', len([p for p in (temp / 'data/blobs').rglob('*') if p.is_file()]) == 3)
        code_b_after, body_b_after, _ = owner.request('/asset.php/v%d/docs/shared.pdf' % vb1)
        check('删除 Project A 后 Project B 仍可正常访问共享 PDF', code_b_after == 200 and body_b_after == shared_pdf)

        # 6. 验证临时迁移脚本存在时自动触发 503 维护拦截，且迁移脚本可将旧 prototypes 目录归档并清理
        legacy_item = int(owner.api('item_save', {'category_id': cat_id, 'name': 'Legacy', 'type': 'project'})['data']['id'])
        legacy_dir = 'p%d/%s' % (legacy_item, uuid.uuid4().hex)
        legacy_full = temp / 'data/prototypes' / legacy_dir
        legacy_full.mkdir(parents=True, exist_ok=True)
        (legacy_full / 'index.html').write_text('<html><body>Legacy OK</body></html>', encoding='utf-8')
        db.execute(
            'INSERT INTO versions (item_id, version_name, entry_file, storage_dir, file_size, created_by, author_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
            (legacy_item, 'v0.9', 'index.html', legacy_dir, 32, 1, 'Owner')
        )
        db.commit()
        legacy_vid = db.execute('SELECT id FROM versions WHERE item_id=?', (legacy_item,)).fetchone()[0]

        shutil.copy2(ROOT / '.dev/tools/migrate_blobs.php', temp / 'migrate_blobs.php')
        maint_code, maint_body, _ = owner.request('/index.php')
        check('migrate_blobs.php 存在时普通入口自动进入 503 维护状态', maint_code == 503 and '升级'.encode('utf-8') in maint_body)
        _, mig_raw, _ = owner.request('/migrate_blobs.php', {'act': 'step'})
        mig_res = json.loads(mig_raw.decode('utf-8'))
        check('迁移脚本成功归档旧目录到 Blob 池', mig_res.get('success') and mig_res.get('done') and not legacy_full.exists())
        (temp / 'migrate_blobs.php').unlink()

        restored_code, restored_body, _ = owner.request('/asset.php/v%d/index.html' % legacy_vid)
        check('删除 migrate_blobs.php 后站点自动恢复且已迁移历史版本可正常打开', restored_code == 200 and b'Legacy OK' in restored_body)

        print('\nALL %d BLOB DEDUP & MIGRATION CHECKS PASSED!' % len(checks))
    finally:
        if db is not None:
            db.close()
        server.terminate()
        server.wait(timeout=5)
        log.close()
        shutil.rmtree(temp, ignore_errors=True)


if __name__ == '__main__':
    main()
