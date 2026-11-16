#!/usr/bin/env python3
"""Real SVG upload/render checks for XML entities and decoded URI controls.

Uses disposable installations and harmless DOM markers. No external requests or
messages are needed. Exit 1 reports failed product expectations.
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
    parser.add_argument('--output', type=Path, default=ROOT / '.dev/tmp/deep-fix-recheck-round3-20261110')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    checks = []

    def record(name, passed, detail):
        checks.append({'name': name, 'passed': bool(passed), 'detail': detail})
        print(('PASS ' if passed else 'FAIL ') + name + ': ' + json.dumps(detail, ensure_ascii=False), flush=True)

    script = ("document.documentElement.setAttribute('data-review-executed','yes');"
              "document.getElementsByTagName('text')[0].appendChild(document.createTextNode(' / script executed'));")
    cases = {
        'entity_markup': ('<!DOCTYPE svg [<!ENTITY payload "&#60;script xmlns=\'http://www.w3.org/2000/svg\'&#62;'
                          + script + '&#60;/script&#62;">]><svg xmlns="http://www.w3.org/2000/svg" '
                          'width="600" height="80"><text x="10" y="30">DTD entity review</text>&payload;</svg>'),
        'encoded_protocol': ('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="80">'
                             '<a href="java&#x9;script:' + script + '"><text x="10" y="30">Encoded URL review</text></a></svg>')
    }
    controls = {
        'unicode_prefix': '<svg xmlns="http://www.w3.org/2000/svg" xmlns:审查="http://www.w3.org/2000/svg"><审查:script>void(0)</审查:script></svg>',
        'decoded_protocol': '<svg xmlns="http://www.w3.org/2000/svg"><a href="jav&#x61;script:void(0)"><text>probe</text></a></svg>',
        'invalid_xml': '<svg xmlns="http://www.w3.org/2000/svg"><g></svg>'
    }
    with sandbox_server(args.php) as (base, temporary):
        root = Path(temporary)
        owner = TestClient(base).login('admin@test.com', PASS_WORD)
        for name, svg in {**controls, **cases}.items():
            uploaded = owner.api('save_settings', {}, {'custom_logo': (name + '.svg', svg.encode())})
            record('reject unsafe or invalid SVG ' + name, not uploaded['success'], uploaded)
            if name not in cases:
                continue
            if uploaded['success']:
                with sqlite3.connect(root / 'data/database.sqlite') as db:
                    stored = db.execute("SELECT value FROM settings WHERE key = 'site_logo'").fetchone()[0]
                fixture = {'name': name, 'url': base + '/' + stored, 'output': str(args.output.resolve())}
                run = subprocess.run(['node', str(Path(__file__).with_suffix('.js'))], env=dict(os.environ,
                    PLAYWRIGHT_MODULE=args.playwright_module, SVG_SEMANTIC_FIXTURE=json.dumps(fixture)),
                    capture_output=True, text=True, timeout=40)
                assert run.returncode == 0, run.stdout + run.stderr
                browser = json.loads(run.stdout.strip().splitlines()[-1])
                record('SVG does not execute ' + name, browser['after'] != 'yes', browser)
            else:
                record('SVG does not execute ' + name, True, {'rejected': True})
    summary = {'checks': checks, 'passed': sum(c['passed'] for c in checks),
               'failed': sum(not c['passed'] for c in checks)}
    (args.output / 'semantic-results.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(json.dumps({'passed': summary['passed'], 'failed': summary['failed']}))
    return 1 if summary['failed'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
