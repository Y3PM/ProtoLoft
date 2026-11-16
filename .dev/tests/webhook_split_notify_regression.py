#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
发版群通知左右分列独立控制与心智模型回归测试套件 (Webhook Split Notify & Mental Model Regression)
验证：
1. 细分通知模式：
   - 场景 A (补丁修复)：仅勾选项目群 (notify_item=1, notify_global=0) -> 仅项目群收到，评审大群未收到
   - 场景 B (集中评审)：仅勾选评审群 (notify_item=0, notify_global=1) -> 仅评审大群收到，项目群未收到
   - 场景 C (全量广播)：两者均勾选 (notify_item=1, notify_global=1) -> 两者均收到
   - 场景 D (静默发版)：两者均未勾选 (notify_item=0, notify_global=0) -> 两者均未收到
2. 向下兼容老客户端/MCP：
   - 未传细分字段，仅传 notify_webhook=1 -> 两者均收到
3. 更新日志必填防呆：
   - 开启任意群通知时未填写日志 -> 接口拦截报错
   - 关闭群通知时未填写日志 -> 允许发版成功
4. M2: 群通知失败如实反馈
   - 当某个通道发送失败时，接口返回“发布成功（...通知发送失败）”，并在 notify_results 中包含失败明细
5. M3: 平台规则与 MCP 默认通知对齐
   - 当调用方完全未传通知参数时，默认对齐平台规则推送已配置的通道
6. M4: 审批通知接收人清空心智
   - 管理员在系统设置中清空审批通知接收人（[]）后，新访客申请严格不向管理员推送 Webhook
"""
import argparse
import base64
import json
from pathlib import Path
import shutil
import sys
import time
import urllib.request
import uuid

from guest_permissions_regression import sandbox_server, TestClient, PASS_WORD, make_proto_zip


def run_test(php_bin):
    item_hook_url = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=item-team-key'
    global_hook_url = 'https://oapi.dingtalk.com/robot/send?access_token=global-review-token'
    fail_hook_url = 'https://oapi.dingtalk.com/robot/send?access_token=mock-fail'

    with sandbox_server(php_bin) as (base, temporary):
        temp_path = Path(temporary)
        # 在沙箱内部的 webhook.php 中插桩记录发送目标与模拟失败
        wh_file = temp_path / 'includes' / 'webhook.php'
        content = wh_file.read_text(encoding='utf-8')
        wh_file.write_text(content.replace(
            'public static function send($url, $eventType, $data) {',
            'public static function send($url, $eventType, $data) {\n        @file_put_contents(DATA_PATH . "/webhook_test_sent.log", $url . "\\n", FILE_APPEND);\n        if (strpos($url, "mock-fail") !== false) return ["success" => false, "message" => "网络超时或拒绝"];\n        return ["success" => true];'
        ), encoding='utf-8')

        log_file = temp_path / 'data' / 'webhook_test_sent.log'

        def clear_sent_logs():
            if log_file.exists():
                log_file.unlink()

        def get_sent_urls():
            if not log_file.exists():
                return []
            lines = [line.strip() for line in log_file.read_text(encoding='utf-8').splitlines()]
            return [l for l in lines if l]

        owner = TestClient(base).login('admin@test.com', PASS_WORD)

        def ok(client, action, fields, files=None):
            result = client.api(action, fields, files=files)
            assert result['success'], (action, result)
            return result.get('data')

        def upload(kind, content):
            ident = uuid.uuid4().hex
            ok(owner, 'upload_chunk', {'upload_id': ident, 'file_type': kind, 'chunk_index': 0, 'chunk_total': 1}, {'chunk_data': ('part', content)})
            return ident

        # 1. 配置全站评审群 Webhook
        ok(owner, 'save_settings', {'global_webhook_url': global_hook_url})

        # 2. 创建测试项目并配置项目群 Webhook
        cat_id = int(ok(owner, 'category_save', {'name': '测试分类'})['id'])
        item_id = int(ok(owner, 'item_save', {
            'category_id': cat_id,
            'type': 'project',
            'name': '多版本项目',
            'webhook_url': item_hook_url
        })['id'])

        # -------------------------------------------------------------
        # 测试 1: 更新日志必填防呆
        # -------------------------------------------------------------
        # 1.1 开启项目群通知但未填写日志 -> 必须被拦截
        res_fail = owner.api('version_publish', {
            'item_id': item_id,
            'version_name': 'V_FAIL_1',
            'changelog': '',
            'notify_item': '1',
            'notify_global': '0',
            'zip_upload_id': upload('zip', make_proto_zip())
        })
        assert not res_fail['success'], "未填日志但开启群通知应拦截"
        assert '填写更新日志' in res_fail.get('message', ''), f"提示信息不匹配: {res_fail}"
        print("PASS 开启项目群通知但未填更新日志被正确拦截")

        # 1.2 关闭全部通知时，未填写日志 -> 正常放行
        clear_sent_logs()
        res_ok_no_log = owner.api('version_publish', {
            'item_id': item_id,
            'version_name': 'V_NO_LOG',
            'changelog': '',
            'notify_item': '0',
            'notify_global': '0',
            'zip_upload_id': upload('zip', make_proto_zip())
        })
        assert res_ok_no_log['success'], f"关闭群通知时应允许空更新日志: {res_ok_no_log}"
        assert get_sent_urls() == [], "关闭群通知时不应发送 Webhook"
        print("PASS 关闭群通知时允许空更新日志发版")

        # -------------------------------------------------------------
        # 测试 2: 场景 A - 补丁修复场景 (仅推项目群，不推评审群)
        # -------------------------------------------------------------
        clear_sent_logs()
        res_patch = owner.api('version_publish', {
            'item_id': item_id,
            'version_name': 'V1.0.1-patch',
            'changelog': '修复线上小偶现 Bug',
            'notify_item': '1',
            'notify_global': '0',
            'notify_webhook': '1',
            'zip_upload_id': upload('zip', make_proto_zip())
        })
        assert res_patch['success'], res_patch
        sent = get_sent_urls()
        assert sent == [item_hook_url], f"场景 A 应仅收到项目群通知，实际收到: {sent}"
        print("PASS 补丁修复场景: 仅项目群收到通知，全员评审大群未受打扰")

        # -------------------------------------------------------------
        # 测试 3: 场景 B - 集中评审场景 (仅推评审群，不推项目群)
        # -------------------------------------------------------------
        clear_sent_logs()
        res_review = owner.api('version_publish', {
            'item_id': item_id,
            'version_name': 'V1.1.0-review',
            'changelog': '提交大版集中全员评审',
            'notify_item': '0',
            'notify_global': '1',
            'notify_webhook': '1',
            'zip_upload_id': upload('zip', make_proto_zip())
        })
        assert res_review['success'], res_review
        sent = get_sent_urls()
        assert sent == [global_hook_url], f"场景 B 应仅收到评审群通知，实际收到: {sent}"
        print("PASS 集中评审场景: 仅全员评审群收到通知，项目群未收到")

        # -------------------------------------------------------------
        # 测试 4: 场景 C - 全量广播场景 (两者均勾选)
        # -------------------------------------------------------------
        clear_sent_logs()
        res_both = owner.api('version_publish', {
            'item_id': item_id,
            'version_name': 'V2.0.0-major',
            'changelog': '重大架构升级，全员通知',
            'notify_item': '1',
            'notify_global': '1',
            'notify_webhook': '1',
            'zip_upload_id': upload('zip', make_proto_zip())
        })
        assert res_both['success'], res_both
        sent = sorted(get_sent_urls())
        assert sent == sorted([item_hook_url, global_hook_url]), f"场景 C 应收到两个通知，实际收到: {sent}"
        print("PASS 全量广播场景: 项目群与评审群均顺利收到通知")

        # -------------------------------------------------------------
        # 测试 5: 场景 D - 静默发版场景 (两者均未勾选)
        # -------------------------------------------------------------
        clear_sent_logs()
        res_silent = owner.api('version_publish', {
            'item_id': item_id,
            'version_name': 'V2.0.1-silent',
            'changelog': '内部自测静默发版',
            'notify_item': '0',
            'notify_global': '0',
            'notify_webhook': '0',
            'zip_upload_id': upload('zip', make_proto_zip())
        })
        assert res_silent['success'], res_silent
        sent = get_sent_urls()
        assert sent == [], f"场景 D 不应收到任何通知，实际收到: {sent}"
        print("PASS 静默发版场景: 均未勾选时不产生任何 Webhook 推送")

        # -------------------------------------------------------------
        # 测试 6: 向下兼容模式 (未传细分字段，仅传老参数 notify_webhook: 1)
        # -------------------------------------------------------------
        clear_sent_logs()
        res_compat = owner.api('version_publish', {
            'item_id': item_id,
            'version_name': 'V2.1.0-legacy',
            'changelog': '来自老客户端/MCP 发版调用',
            'notify_webhook': '1',
            'zip_upload_id': upload('zip', make_proto_zip())
        })
        assert res_compat['success'], res_compat
        sent = sorted(get_sent_urls())
        assert sent == sorted([item_hook_url, global_hook_url]), f"向下兼容应广播至两边，实际: {sent}"
        print("PASS 向下兼容模式: 老参数 notify_webhook:1 平滑支持全渠道广播")

        # -------------------------------------------------------------
        # 测试 7: M2 - 群通知失败如实反馈，不误报全成功
        # -------------------------------------------------------------
        ok(owner, 'save_settings', {'global_webhook_url': fail_hook_url})
        clear_sent_logs()
        res_fail_feedback = owner.api('version_publish', {
            'item_id': item_id,
            'version_name': 'V2.2.0-partial-fail',
            'changelog': '测试失败通道反馈',
            'notify_item': '1',
            'notify_global': '1',
            'zip_upload_id': upload('zip', make_proto_zip())
        })
        assert res_fail_feedback['success'], "版本本身仍应成功发布"
        assert '评审群通知发送失败' in res_fail_feedback.get('message', ''), f"应明确反馈评审群失败: {res_fail_feedback}"
        notify_res = res_fail_feedback['data'].get('notify_results', {})
        assert notify_res.get('global', {}).get('success') is False
        assert notify_res.get('item', {}).get('success') is True
        print("PASS M2: 群通知失败如实反馈，版本成功保存且提示「评审群通知发送失败」")

        # 恢复全局评审群为正常 URL
        ok(owner, 'save_settings', {'global_webhook_url': global_hook_url})

        # -------------------------------------------------------------
        # 测试 8: R1 - 同一个机器人地址去重合并发送，不重复推消息
        # -------------------------------------------------------------
        # 创建一个项目，其项目群与评审群配置完全相同的 Webhook 地址
        same_url_item_id = int(ok(owner, 'item_save', {
            'category_id': cat_id,
            'type': 'project',
            'name': '同机器人地址去重项目',
            'webhook_url': global_hook_url
        })['id'])

        clear_sent_logs()
        res_same_hook = owner.api('version_publish', {
            'item_id': same_url_item_id,
            'version_name': 'V2.3.0-dedup',
            'changelog': '测试项目群与评审群地址相同时去重发送',
            'notify_item': '1',
            'notify_global': '1',
            'zip_upload_id': upload('zip', make_proto_zip())
        })
        assert res_same_hook['success'], res_same_hook
        sent = get_sent_urls()
        assert sent == [global_hook_url], f"项目群与评审群相同时必须仅发送 1 次，实际: {sent}"
        notify_res = res_same_hook['data'].get('notify_results', {})
        assert notify_res.get('item', {}).get('success') is True, "项目群状态应成功"
        assert notify_res.get('global', {}).get('success') is True, "评审群状态应成功"
        print("PASS R1: 项目群与评审群为相同机器人地址时，合并发送 1 次且两通道均如实反馈成功")

        # -------------------------------------------------------------
        # 测试 9: R2 - 统一平台发版默认心智 (API: 默认发送已配置目标群，可精准取消)
        # -------------------------------------------------------------
        # 9.1: 填写了更新日志，省略通知参数 -> 默认通知已配置的目标群 (两群均收到)
        clear_sent_logs()
        res_default_notify = owner.api('version_publish', {
            'item_id': item_id,
            'version_name': 'V2.4.0-default-notify',
            'changelog': '填写了日志，默认通知已配置的目标群',
            'zip_upload_id': upload('zip', make_proto_zip())
        })
        assert res_default_notify['success'], res_default_notify
        sent = sorted(get_sent_urls())
        assert sent == sorted([item_hook_url, global_hook_url]), f"有日志且省略通知参数时应默认通知所有已配置群，实际: {sent}"
        print("PASS R2 (API 默认通知): 有更新日志且省略通知参数时，默认推送已配置的目标群")

        # 9.2: 显式传 notify_item=0, notify_global=0 -> 允许精准取消
        clear_sent_logs()
        res_explicit_cancel = owner.api('version_publish', {
            'item_id': item_id,
            'version_name': 'V2.4.1-explicit-cancel',
            'changelog': '虽然写了日志但显式关闭了通知',
            'notify_item': '0',
            'notify_global': '0',
            'zip_upload_id': upload('zip', make_proto_zip())
        })
        assert res_explicit_cancel['success'], res_explicit_cancel
        assert get_sent_urls() == [], f"显式传 0 应精准取消通知，实际: {get_sent_urls()}"
        print("PASS R2 (API 显式取消): 显式传 0 成功精准取消通知")

        # 9.3: 显式指定部分通道
        clear_sent_logs()
        res_granular_global = owner.api('version_publish', {
            'item_id': item_id,
            'version_name': 'V2.4.2-only-global',
            'changelog': '显式指定仅通知评审大群',
            'notify_item': '0',
            'notify_global': '1',
            'zip_upload_id': upload('zip', make_proto_zip())
        })
        assert res_granular_global['success'], res_granular_global
        assert get_sent_urls() == [global_hook_url], f"显式指定仅通知评审群，实际: {get_sent_urls()}"

        # 9.4: 已配置目标群，未填写更新日志且省略通知参数 -> 统一拦截报错，绝不静默吞掉通知
        clear_sent_logs()
        res_omit_no_log = owner.api('version_publish', {
            'item_id': item_id,
            'version_name': 'V2.4.3-omit-no-log',
            'changelog': '',
            'zip_upload_id': upload('zip', make_proto_zip())
        })
        assert not res_omit_no_log['success'], "配置了目标群且省略通知参数时，空日志必须拦截"
        assert '开启群通知需填写更新日志' in res_omit_no_log.get('message', ''), res_omit_no_log
        assert get_sent_urls() == []
        print("PASS R2 (API 漏填日志拦截): 已配置目标群且省略通知参数时，空更新日志被统一拦截防呆")

        # 9.5: 显式关闭全部通知 (notify_item=0, notify_global=0) -> 允许空更新日志静默发版
        clear_sent_logs()
        res_explicit_silent = owner.api('version_publish', {
            'item_id': item_id,
            'version_name': 'V2.4.4-explicit-silent',
            'changelog': '',
            'notify_item': '0',
            'notify_global': '0',
            'zip_upload_id': upload('zip', make_proto_zip())
        })
        assert res_explicit_silent['success'], res_explicit_silent
        assert get_sent_urls() == []
        print("PASS R2 (API 显式静默): 显式关闭通知时允许空更新日志发版成功且不推送")

        # -------------------------------------------------------------
        # 测试 10: R2 - 真实 MCP 协议接口默认通知心智与精准控制
        # -------------------------------------------------------------
        # 创建一个拥有发版权限的 MCP 凭据
        mcp_token_info = ok(owner, 'mcp_token_create', {'project_ids': [item_id], 'can_publish': 1})
        mcp_secret = mcp_token_info['secret']

        mcp_counter = 0
        def mcp_invoke(tool_name, arguments):
            nonlocal mcp_counter
            mcp_counter += 1
            body = {'jsonrpc': '2.0', 'id': mcp_counter, 'method': 'tools/call', 'params': {'name': tool_name, 'arguments': arguments}}
            req = urllib.request.Request(
                base + '/mcp.php',
                data=json.dumps(body).encode('utf-8'),
                headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + mcp_secret}
            )
            with urllib.request.urlopen(req, timeout=10) as r:
                res = json.loads(r.read().decode('utf-8'))
            return res.get('result', {})

        def mcp_call(tool_name, arguments):
            res = mcp_invoke(tool_name, arguments)
            assert not res.get('isError'), f"MCP tool {tool_name} error: {res}"
            return res.get('structuredContent', res)

        # 10.1: MCP 填写了更新日志，省略通知参数 -> 默认通知两群
        clear_sent_logs()
        up_id_1 = 'mcp_up_' + uuid.uuid4().hex[:12]
        mcp_call('upload_chunk', {
            'item_id': item_id,
            'upload_id': up_id_1,
            'file_type': 'zip',
            'chunk_index': 0,
            'chunk_total': 1,
            'data_base64': base64.b64encode(make_proto_zip()).decode('utf-8')
        })
        res_mcp_default = mcp_call('publish_version', {
            'item_id': item_id,
            'version_name': 'V2.5.0-mcp-default',
            'zip_upload_id': up_id_1,
            'changelog': '通过 MCP 发版，省略通知参数应默认发送'
        })
        assert res_mcp_default.get('id'), res_mcp_default
        sent = sorted(get_sent_urls())
        assert sent == sorted([item_hook_url, global_hook_url]), f"MCP 省略参数时应默认推送两群，实际: {sent}"
        print("PASS R2 (MCP 默认通知): 真实 MCP 工具省略通知参数时默认推送已配置的目标群")

        # 10.2: MCP 显式关闭通知 (notify_item: False, notify_global: False)
        clear_sent_logs()
        up_id_2 = 'mcp_up_' + uuid.uuid4().hex[:12]
        mcp_call('upload_chunk', {
            'item_id': item_id,
            'upload_id': up_id_2,
            'file_type': 'zip',
            'chunk_index': 0,
            'chunk_total': 1,
            'data_base64': base64.b64encode(make_proto_zip()).decode('utf-8')
        })
        res_mcp_cancel = mcp_call('publish_version', {
            'item_id': item_id,
            'version_name': 'V2.5.1-mcp-cancel',
            'zip_upload_id': up_id_2,
            'changelog': 'MCP 发版但显式关闭通知',
            'notify_item': False,
            'notify_global': False
        })
        assert res_mcp_cancel.get('id'), res_mcp_cancel
        assert get_sent_urls() == [], f"MCP 显式传 false 应精准取消，实际: {get_sent_urls()}"
        print("PASS R2 (MCP 显式取消): 真实 MCP 工具显式传 false 成功取消群通知")

        # 10.3: MCP 独立控制 (仅评审群)
        clear_sent_logs()
        up_id_3 = 'mcp_up_' + uuid.uuid4().hex[:12]
        mcp_call('upload_chunk', {
            'item_id': item_id,
            'upload_id': up_id_3,
            'file_type': 'zip',
            'chunk_index': 0,
            'chunk_total': 1,
            'data_base64': base64.b64encode(make_proto_zip()).decode('utf-8')
        })
        res_mcp_global = mcp_call('publish_version', {
            'item_id': item_id,
            'version_name': 'V2.5.2-mcp-global',
            'zip_upload_id': up_id_3,
            'changelog': 'MCP 发版仅通知评审群',
            'notify_item': False,
            'notify_global': True
        })
        assert res_mcp_global.get('id'), res_mcp_global
        assert get_sent_urls() == [global_hook_url], f"MCP 显式仅评审群，实际: {get_sent_urls()}"
        print("PASS R2 (MCP 独立控制): 真实 MCP 工具支持独立控制通知通道")

        # 10.4: MCP 省略通知参数且未提供更新日志 -> 严格报错拦截，绝不静默吞掉通知
        clear_sent_logs()
        up_id_4 = 'mcp_up_' + uuid.uuid4().hex[:12]
        mcp_call('upload_chunk', {
            'item_id': item_id,
            'upload_id': up_id_4,
            'file_type': 'zip',
            'chunk_index': 0,
            'chunk_total': 1,
            'data_base64': base64.b64encode(make_proto_zip()).decode('utf-8')
        })
        res_mcp_omit_no_log = mcp_invoke('publish_version', {
            'item_id': item_id,
            'version_name': 'V2.5.3-mcp-no-log',
            'zip_upload_id': up_id_4
        })
        assert res_mcp_omit_no_log.get('isError'), "MCP 省略通知参数且空日志必须报错拦截"
        err_text = str(res_mcp_omit_no_log)
        assert '开启群通知需填写更新日志' in err_text, f"提示信息需明确需填写日志: {res_mcp_omit_no_log}"
        assert get_sent_urls() == []
        print("PASS R2 (MCP 漏填日志拦截): 真实 MCP 工具省略通知参数且未填日志被严格拦截")

        # 10.5: MCP 显式关闭通知且未填更新日志 -> 允许静默发版成功且发送 0 次
        res_mcp_silent_no_log = mcp_call('publish_version', {
            'item_id': item_id,
            'version_name': 'V2.5.3-mcp-no-log',
            'zip_upload_id': up_id_4,
            'notify_item': False,
            'notify_global': False
        })
        assert res_mcp_silent_no_log.get('id'), res_mcp_silent_no_log
        assert get_sent_urls() == []
        print("PASS R2 (MCP 显式静默): 真实 MCP 工具显式传 false 时允许空日志静默发布")

        # -------------------------------------------------------------
        # 测试 11: M4 - 审批通知接收人清空心智，清空后绝不通知管理员
        # -------------------------------------------------------------
        # 给管理员配置个人 Webhook
        admin_hook_url = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=admin-personal-hook'
        ok(owner, 'profile_update', {'name': '超级管理员', 'webhook_url': admin_hook_url})

        # 系统设置开启访客注册，同时清空审批接收人 (设置为 [])
        ok(owner, 'save_settings', {'visitor_register_enabled': '1', 'visitor_notify_admin_ids': []})

        clear_sent_logs()
        # 新访客提交注册申请 (先获取匿名 CSRF Token)
        guest = TestClient(base)
        sess = guest.api('get_session', csrf=False)
        guest.token = sess['data']['csrfToken']
        res_reg = guest.api('register_visitor', {
            'name': '新员工小王',
            'email': 'wang@test.com',
            'password': PASS_WORD,
            'department': 'UED体验设计部'
        })
        assert res_reg['success'], res_reg
        sent = get_sent_urls()
        assert sent == [], f"清空审批接收人后不应发送任何通知，实际触发: {sent}"
        print("PASS M4: 清空审批接收人后，新访客申请严格不触发任何管理员通知")

    print(json.dumps({'passed': 11, 'scope': 'split webhook notification and mental model validation'}))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', default='')
    args = parser.parse_args()
    php_bin = args.php or shutil.which('php') or '/tmp/jinshi-php-common/php'
    run_test(php_bin)


if __name__ == '__main__':
    main()
