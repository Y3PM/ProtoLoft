#!/usr/bin/env python3
"""SVG prefix variants through real uploads and Chrome in disposable data.

No production data or external robot transport is used. Exit 1 means that an
uploaded script was accepted or executed, not that diagnostics failed to run.
"""
import argparse
import json
import os
from pathlib import Path
import sqlite3
import subprocess

from guest_permissions_regression import sandbox_server, TestClient, PASS_WORD

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', required=True)
    parser.add_argument('--playwright-module', required=True)
    parser.add_argument('--output', type=Path, default=ROOT / '.dev/tmp/deep-fix-recheck-round2-20261110')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    checks = []

    def record(name, passed, detail):
        checks.append({'name': name, 'passed': bool(passed), 'detail': detail})
        print(('PASS ' if passed else 'FAIL ') + name + ': ' + json.dumps(detail, ensure_ascii=False), flush=True)

    with sandbox_server(args.php) as (base, temporary):
        root = Path(temporary)
        owner = TestClient(base).login('admin@test.com', PASS_WORD)
        for filename in ['logo.svg', 'logo-icon.svg', 'favicon.svg']:
            result = owner.api('save_settings', {}, {
                'custom_logo': (filename, (ROOT / 'assets/images' / filename).read_bytes())})
            record('normal brand image ' + filename, result['success'], result.get('message'))
        for prefix in ['s', 'review.svg']:
            svg = ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:' + prefix + '="http://www.w3.org/2000/svg" '
                   'width="480" height="80"><text x="10" y="30">SVG prefix review</text><' + prefix + ':script>'
                   'document.documentElement.setAttribute("data-prefix-script","executed");'
                   'document.getElementsByTagName("text")[0].appendChild(document.createTextNode(" / script executed"));'
                   '</' + prefix + ':script></svg>')
            result = owner.api('save_settings', {}, {'custom_logo': ('prefix.svg', svg.encode())})
            record('reject script prefix ' + prefix, not result['success'], result)
            if result['success']:
                with sqlite3.connect(root / 'data/database.sqlite') as db:
                    stored = db.execute("SELECT value FROM settings WHERE key = 'site_logo'").fetchone()[0]
                fixture = {'url': base + '/' + stored, 'output': str(args.output.resolve())}
                run = subprocess.run(['node', str(Path(__file__).with_suffix('.js'))], env=dict(os.environ,
                    PLAYWRIGHT_MODULE=args.playwright_module, SVG_PREFIX_FIXTURE=json.dumps(fixture)),
                    capture_output=True, text=True, timeout=40)
                assert run.returncode == 0, run.stdout + run.stderr
                browser = json.loads(run.stdout.strip().splitlines()[-1])
                record('accepted SVG cannot execute in browser', browser['marker'] != 'executed', browser)
            elif prefix == 'review.svg':
                record('accepted SVG cannot execute in browser', True, {'rejected': True})
    summary = {'checks': checks, 'passed': sum(c['passed'] for c in checks),
               'failed': sum(not c['passed'] for c in checks)}
    (args.output / 'svg-prefix-results.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(json.dumps({'passed': summary['passed'], 'failed': summary['failed']}))
    return 1 if summary['failed'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
