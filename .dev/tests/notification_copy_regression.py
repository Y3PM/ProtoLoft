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
                    check(prefix + '标题包含项目名与具体事件', body.startswith('### **' + title + '**\n'))
                    if platform == 'dingtalk':
                        check(prefix + '群聊摘要标题同步', payload['markdown']['title'] == title)
                        check(prefix + '钉钉正文采用无圆点紧致左对齐', '\n- **' not in body)
                    check(prefix + '入口文案与链接正确', '[' + link_label + '](' + data['link'] + ')' in body)
                check(prefix + '来源完整且只出现一次', body.count('来自 · 立象原型 (ProtoLoft)') == 1)
                check(prefix + '正文不重复项目字段', '**项目**' not in body)
                check(prefix + '事件对应的字段标签正确', '**' + author_label + '**' in body and '**' + content_label + '**' in body)
                version = data.get('version_name', '')
                check(prefix + '版本独立展示或在缺省时省略', ('**版本**：' + version in body) if version else '**版本**' not in body)
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

        # 审批直达通知回归：配置管理员 Webhook 并允许新成员申请
        ok(admin, 'profile_update_webhook', {'webhook_url': 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=fixture-admin'})
        ok(admin, 'save_settings', {'visitor_register_enabled': '1'})
        clear()
        apply_res = guest.api('register_visitor', {
            'name': '新成员林七',
            'email': 'linqi@test.com',
            'password': PASS_WORD,
            'role': 'editor',
            'department': '产品研发部'
        })
        check('新成员提交注册申请成功', apply_res['success'])
        apply_messages = sent()
        check('user_apply: 恰好生成一条审批通知', len(apply_messages) == 1)
        apply_msg = apply_messages[0]
        expected_apply_link = base + '/index.php#admin=users&sub=pending'
        check('user_apply: 事件类型与直达审批链接正确', apply_msg['event'] == 'user_apply' and apply_msg['data'].get('link') == expected_apply_link)
        for platform, payload in apply_msg['payloads'].items():
            prefix = 'user_apply/' + platform + ': '
            if platform == 'generic':
                check(prefix + '标题、来源与直达链接正确', payload['title'] == '新成员申请待审批' and payload['source'] == '立象原型' and payload['link'] == expected_apply_link)
                continue
            if platform == 'feishu':
                check(prefix + '标题为新成员申请待审批', payload['card']['header']['title']['content'] == '新成员申请待审批')
                elements = payload['card']['elements']
                body = elements[0]['text']['content']
                button = elements[1]['actions'][0]
                check(prefix + '底部主按钮文案与直达链接正确', button['text']['content'] == '前往审批' and button['url'] == expected_apply_link and button['type'] == 'primary')
            else:
                body = payload['markdown']['content' if platform == 'wecom' else 'text']
                check(prefix + '标题为新成员申请待审批', body.startswith('### **新成员申请待审批**\n'))
                check(prefix + '独立一行高亮链接正确', '[前往审批](' + expected_apply_link + ')' in body)
            check(prefix + '不含冗余项目行且保留申请人与申请角色', '**项目**' not in body and '**申请人**：新成员林七 \\(linqi@test.com\\)' in body and '**申请角色**：协作者' in body and '**部门或职务**：产品研发部' in body)
            check(prefix + '底部保持纯文本来源落款', body.count('来自 · 立象原型 (ProtoLoft)') == 1 and '[立象原型](' not in body)

        # 多行无序列表更新说明：第一项必须位于独立行首，避免被标签前缀吞掉 Markdown 列表识别
        clear()
        list_upload_id = uuid.uuid4().hex
        ok(editor, 'upload_chunk', {'upload_id': list_upload_id, 'file_type': 'zip', 'chunk_index': 0, 'chunk_total': 1},
           {'chunk_data': ('part', make_proto_zip())})
        list_prepare = ok(editor, 'version_check_name', {'item_id': item, 'version_name': 'V1.3.0'})
        ok(editor, 'version_publish', {
            'item_id': item,
            'version_name': 'V1.3.0',
            'zip_upload_id': list_upload_id,
            'overwrite_token': list_prepare['overwrite_token'],
            'changelog': "* 第一项重构预设\n* 第二项引入新方案\n* 第三项支持变量",
            'notify_item': 1,
            'notify_global': 0
        })
        list_msgs = sent()
        check('list_changelog: 恰好生成一条发版通知', len(list_msgs) == 1)
        list_payloads = list_msgs[0]['payloads']
        check('list_changelog/dingtalk: 第一项独立成行且末尾与时间行留白',
              "**更新说明**：\n* 第一项重构预设\n* 第二项引入新方案\n* 第三项支持变量\n" in list_payloads['dingtalk']['markdown']['text'])
        check('list_changelog/wecom: 第一项独立成行',
              "**更新说明**：\n• 第一项重构预设\n• 第二项引入新方案\n• 第三项支持变量\n" in list_payloads['wecom']['markdown']['content'])
        check('list_changelog/feishu: 第一项独立成行',
              "**更新说明**：\n• 第一项重构预设\n• 第二项引入新方案\n• 第三项支持变量" in list_payloads['feishu']['card']['elements'][0]['text']['content'])

    print(json.dumps({'passed': passed, 'scope': 'temporary HTTP installation; local notification capture'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
