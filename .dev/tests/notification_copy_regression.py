#!/usr/bin/env python3
"""Real HTTP notification copy regression in a disposable installation.
Capture payloads locally before transport; never contact real chat robots.
"""
import argparse
import json
from pathlib import Path
import uuid

from guest_permissions_regression import sandbox_server, TestClient, PASS_WORD, make_proto_zip


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', required=True)
    args = parser.parse_args()
    passed = 0

    def check(label, condition):
        nonlocal passed
        assert condition, label
        passed += 1
        print('PASS ' + label, flush=True)

    with sandbox_server(args.php) as (base, temporary):
        temporary = Path(temporary)
        hook = temporary / 'includes/webhook.php'
        needle = '        $platform = self::detectPlatform($url);'
        capture = '''
        $payloads = [];
        foreach (['wecom', 'dingtalk', 'feishu', 'generic'] as $testPlatform) {
            $payloads[$testPlatform] = self::buildPayload($testPlatform, $eventType, $data);
        }
        file_put_contents(DATA_PATH . '/notification-copy.jsonl', json_encode([
            'event' => $eventType, 'data' => $data, 'payloads' => $payloads
        ], JSON_UNESCAPED_UNICODE) . "\\n", FILE_APPEND);
        return ['success' => true];
'''
        source = hook.read_text()
        assert source.count(needle) == 1
        hook.write_text(source.replace(needle, needle + capture, 1))
        log = temporary / 'data/notification-copy.jsonl'

        def clear():
            log.unlink(missing_ok=True)

        def sent():
            return [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []

        def ok(client, action, fields, files=None):
            result = client.api(action, fields, files=files)
            assert result['success'], (action, result)
            return result.get('data')

        def notice(event, suffix, author_label, content_label, link_label):
            messages = sent()
            check(event + ': 恰好生成一条通知', len(messages) == 1)
            message = messages[0]
            check(event + ': 事件类型正确', message['event'] == event)
            data = message['data']
            title = '测试项目 · ' + suffix
            for platform, payload in message['payloads'].items():
                prefix = event + '/' + platform + ': '
                if platform == 'generic':
                    check(prefix + '标题与来源正确', payload['title'] == title and payload['source'] == '立象原型')
                    check(prefix + '业务数据与精确链接保留', all(payload[key] == data.get(key, '')
                          for key in ['item_name', 'version_name', 'author', 'content', 'link']))
                    continue
                if platform == 'feishu':
                    check(prefix + '标题包含项目名与具体事件', payload['card']['header']['title']['content'] == title)
                    elements = payload['card']['elements']
                    body = elements[0]['text']['content']
                    button = elements[1]['actions'][0]
                    check(prefix + '入口文案与链接正确', button['text']['content'] == link_label and button['url'] == data['link'])
                else:
                    body = payload['markdown']['content' if platform == 'wecom' else 'text']
                    check(prefix + '标题包含项目名与具体事件', body.startswith('### ' + title + '\n'))
                    if platform == 'dingtalk':
                        check(prefix + '群聊摘要标题同步', payload['markdown']['title'] == title)
                    check(prefix + '入口文案与链接正确', '[' + link_label + '](' + data['link'] + ')' in body)
                check(prefix + '来源完整且只出现一次', body.count('来自 · 立象原型') == 1)
                check(prefix + '正文不重复项目字段', '**项目**' not in body)
                check(prefix + '事件对应的字段标签正确', '**' + author_label + '**' in body and '**' + content_label + '**' in body)
                version = data.get('version_name', '')
                check(prefix + '版本独立展示或在缺省时省略', ('**版本**：`' + version + '`' in body) if version else '**版本**' not in body)
            return data

        admin = TestClient(base).login('admin@test.com', PASS_WORD)
        for role in ['editor', 'viewer']:
            ok(admin, 'user_add', {'email': role + '@test.com', 'name': role, 'password': PASS_WORD,
                                  'role': role, 'webhook_url': 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=fixture-' + role})
        editor = TestClient(base).login('editor@test.com', PASS_WORD)
        viewer = TestClient(base).login('viewer@test.com', PASS_WORD)
        guest = TestClient(base)
        guest.token = guest.api('get_session')['data']['csrfToken']
        category = ok(admin, 'category_save', {'name': '通知文案回归'})['id']
        item = int(ok(editor, 'item_save', {'category_id': category, 'name': '测试项目', 'type': 'project',
                                           'webhook_url': 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=fixture-team'})['id'])

        def publish(client, version):
            upload_id = uuid.uuid4().hex
            ok(client, 'upload_chunk', {'upload_id': upload_id, 'file_type': 'zip', 'chunk_index': 0, 'chunk_total': 1},
               {'chunk_data': ('part', make_proto_zip())})
            prepare = ok(client, 'version_check_name', {'item_id': item, 'version_name': version})
            return ok(client, 'version_publish', {'item_id': item, 'version_name': version,
                      'zip_upload_id': upload_id, 'overwrite_token': prepare['overwrite_token'],
                      'changelog': '优化首页布局，新增订阅消息页面', 'notify_item': 1, 'notify_global': 0})

        clear()
        first = publish(editor, 'V1.1.0')
        data = notice('version_update', '新版本已发布', '发布人', '更新说明', '查看原型')
        check('新版本通知指向实际发布版本', data['link'] == base + '/index.php#item=' + str(item) + '&vid=' + str(first['id']))
        clear()
        replaced = publish(editor, 'V1.1.0')
        notice('version_update', '版本内容已更新', '发布人', '更新说明', '查看原型')
        check('同名覆盖保留版本 ID', replaced['id'] == first['id'])
        clear()
        latest = publish(admin, 'V1.2.0')
        notice('version_update', '新版本已发布', '发布人', '更新说明', '查看原型')
        version_id = latest['id']

        for client in [viewer, guest]:
            clear()
            denied = client.api('version_publish', {'item_id': item, 'version_name': 'DENIED'})
            check('审阅人/未登录访客不可发版且不触发通知', not denied['success'] and not sent())

        def annotate(client):
            return client.api('add_annotation', {'item_id': item, 'ver_id': version_id,
                              'page_path': 'index.html', 'page_title': '首页', 'content': '请调整按钮间距', 'guest_name': '测试访客'})

        annotation_id = None
        for role, client in [('超管', admin), ('协作者', editor), ('审阅人', viewer)]:
            clear()
            result = annotate(client)
            check(role + '可以创建批注', result['success'])
            if role == '协作者':
                check('项目负责人不收到本人批注通知', not sent())
            else:
                notice('annotation_new', '收到新批注', '批注人', '批注内容', '查看批注')
            if role == '审阅人':
                annotation_id = result['data']['id']

        clear()
        check('未授权访客批注被拒绝且无通知', not annotate(guest)['success'] and not sent())
        ok(admin, 'save_role_permissions', {'perm_guest_annotate': 1})
        code = ok(admin, 'share_code_create', {'item_id': item, 'ver_id': version_id,
                                              'label': '通知样本', 'expire_preset': 'forever'})['code']
        guest.request('/share.php?s=' + code)
        clear()
        guest_annotation = annotate(guest)
        assert guest_annotation['success'], guest_annotation
        check('已授权分享访客可以发表批注', guest_annotation['success'])
        notice('annotation_new', '收到新批注', '批注人', '批注内容', '查看批注')

        clear()
        ok(admin, 'reply_annotation', {'annotation_id': annotation_id, 'content': '已调整，请复核'})
        notice('annotation_reply', '批注有新回复', '回复人', '回复内容', '查看批注')
        clear()
        ok(editor, 'toggle_annotation_status', {'id': annotation_id})
        notice('annotation_resolve', '批注已解决', '处理人', '批注内容', '查看批注')

    print(json.dumps({'passed': passed, 'scope': 'temporary HTTP installation; local notification capture'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
