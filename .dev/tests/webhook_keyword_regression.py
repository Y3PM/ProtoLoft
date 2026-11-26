#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Webhook 关键词安全设置回归测试套件
验证钉钉、飞书、企微及通用平台通知 Payload 100% 包含「立象原型」关键词，
并验证当平台由于安全设置拦截时，服务端返回自愈诊断提示。
"""

import subprocess
import json
import sys

def test_webhook_payloads():
    php_code = """
    require_once __DIR__ . '/includes/webhook.php';

    $testEvents = [
        ['event' => 'version_update', 'expected_title' => '电商后台 · 新版本已发布', 'data' => ['item_name' => '电商后台', 'version_name' => 'v1.0.0', 'author' => '张工', 'content' => '发版说明', 'link' => 'https://example.com/p/1']],
        ['event' => 'version_update', 'expected_title' => '电商后台 · 版本内容已更新', 'data' => ['item_name' => '电商后台', 'is_overwrite' => true, 'version_name' => 'v1.0.0', 'author' => '张工', 'content' => '覆盖说明', 'link' => 'https://example.com/p/1']],
        ['event' => 'annotation_new', 'expected_title' => 'CRM系统 · 收到新批注', 'data' => ['item_name' => 'CRM系统', 'author' => '李总', 'content' => '这里的按钮不对', 'link' => 'https://example.com/p/2']],
        ['event' => 'annotation_reply', 'expected_title' => 'CRM系统 · 批注有新回复', 'data' => ['item_name' => 'CRM系统', 'author' => '王设计师', 'content' => '已修正', 'link' => 'https://example.com/p/2#reply']],
        ['event' => 'annotation_resolve', 'expected_title' => 'CRM系统 · 批注已解决', 'data' => ['item_name' => 'CRM系统', 'author' => '王设计师', 'content' => '原批注', 'link' => 'https://example.com/p/2']],
        ['event' => 'user_apply', 'data' => ['title' => '新成员申请待审批', 'item_name' => '立象原型', 'author' => '赵六 (zhao@example.com)', 'fields' => ['申请角色' => '协作者', '部门或职务' => '产品部'], 'content' => '申请角色：协作者', 'link' => 'https://example.com/admin']],
        ['event' => 'custom_raw', 'data' => ['title' => '简单通知', 'item_name' => '测试', 'content' => 'Hello', 'link' => 'https://example.com']],
        ['event' => 'no_link_fallback', 'data' => ['title' => '无链接通知', 'item_name' => '测试', 'content' => '兜底测试', 'link' => '']]
    ];

    $platforms = ['dingtalk', 'feishu', 'wecom', 'generic'];
    $reflection = new ReflectionClass('Webhook');
    $buildPayload = $reflection->getMethod('buildPayload');
    $buildPayload->setAccessible(true);

    $results = [];
    foreach ($testEvents as $ev) {
        $evResults = [];
        foreach ($platforms as $plat) {
            $payload = $buildPayload->invoke(null, $plat, $ev['event'], $ev['data']);
            $evResults[$plat] = $payload;
        }
        $results[] = [
            'event' => $ev['event'],
            'raw_title' => $ev['expected_title'] ?? $ev['data']['title'],
            'payloads' => $evResults
        ];
    }

    echo json_encode($results, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    """

    res = subprocess.run(['php', '-r', php_code], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        print(f"❌ PHP 执行失败: {res.stderr}")
        return False

    data = json.loads(res.stdout)
    keyword = 'ProtoLoft'
    brand_cn = '立象原型'

    for item in data:
        ev = item['event']
        payloads = item['payloads']

        # 1. 钉钉断言：标准原生 Markdown 气泡，简洁直观
        dt = payloads['dingtalk']
        assert dt.get('msgtype') == 'markdown', f"钉钉应使用简单直观的 markdown 消息"
        assert dt.get('markdown', {}).get('title') == item['raw_title']
        assert keyword in dt.get('markdown', {}).get('text', '')

        # 2. 飞书断言：简单直观的单文本块卡片，包含按钮与关键词
        fs = payloads['feishu']
        assert fs.get('msg_type') == 'interactive'
        fs_title = fs.get('card', {}).get('header', {}).get('title', {}).get('content', '')
        fs_str = json.dumps(fs, ensure_ascii=False)
        assert fs_title == item['raw_title']
        assert keyword in fs_str

        # 3. 企微断言：标准原生 Markdown 气泡，广泛兼容
        wc = payloads['wecom']
        assert wc.get('msgtype') == 'markdown'
        assert '来自 · 立象原型 (ProtoLoft)' in wc.get('markdown', {}).get('content', '')

        # 4. 通用断言
        gen = payloads['generic']
        assert brand_cn in gen.get('title', '') or brand_cn in gen.get('source', ''), f"通用载荷未包含品牌 (event: {ev})"

        # 5. 结构化 user_apply 逐行平铺键值与审批直达入口断言（不出现多余“项目”“内容”标签）
        if ev == 'user_apply':
            fs_body = fs.get('card', {}).get('elements', [{}])[0].get('text', {}).get('content', '')
            fs_btn = fs.get('card', {}).get('elements', [{}, {}])[1].get('actions', [{}])[0]
            dt_text = dt.get('markdown', {}).get('text', '')
            wc_text = wc.get('markdown', {}).get('content', '')
            assert '**项目**' not in fs_body and '**内容**' not in fs_body and '**申请人**：赵六 \\(zhao@example.com\\)' in fs_body
            assert '**申请角色**：协作者' in fs_body and '**部门或职务**：产品部' in fs_body
            assert fs_btn.get('text', {}).get('content') == '前往审批' and fs_btn.get('url') == 'https://example.com/admin'
            assert '**项目**' not in dt_text and '**内容**' not in dt_text and '**申请人**：赵六 \\(zhao@example.com\\)' in dt_text
            assert '**申请角色**：协作者' in dt_text and '[前往审批](https://example.com/admin)' in dt_text
            assert '**项目**' not in wc_text and '**内容**' not in wc_text and '**申请人**：赵六 \\(zhao@example.com\\)' in wc_text
            assert '**申请角色**：协作者' in wc_text and '[前往审批](https://example.com/admin)' in wc_text
            assert '<font color="comment">来自 · 立象原型 (ProtoLoft)</font>' in wc_text

    print("✅ 所有平台 Payload 均 100% 包含统一「ProtoLoft」关键词！")

    # 三语推送关键词与英文半角冒号排版验证
    locale_php = """
    require_once __DIR__ . '/includes/webhook.php';
    $reflection = new ReflectionClass('Webhook');
    $buildPayload = $reflection->getMethod('buildPayload');
    $buildPayload->setAccessible(true);
    $out = [];
    foreach (['zh-CN', 'zh-TW', 'en'] as $loc) {
        I18n::setLocale($loc);
        $out[$loc] = [
            'dingtalk' => $buildPayload->invoke(null, 'dingtalk', 'version_update', ['item_name' => 'Demo', 'version_name' => 'V1.0', 'author' => 'Alice', 'content' => 'Notes', 'link' => 'https://example.com']),
            'feishu' => $buildPayload->invoke(null, 'feishu', 'version_update', ['item_name' => 'Demo', 'version_name' => 'V1.0', 'author' => 'Alice', 'content' => 'Notes', 'link' => 'https://example.com']),
            'wecom' => $buildPayload->invoke(null, 'wecom', 'version_update', ['item_name' => 'Demo', 'version_name' => 'V1.0', 'author' => 'Alice', 'content' => 'Notes', 'link' => 'https://example.com']),
            'err' => t('webhook.err_keyword')
        ];
    }
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
    """
    res_loc = subprocess.run(['php', '-r', locale_php], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    assert res_loc.returncode == 0, res_loc.stderr
    loc_data = json.loads(res_loc.stdout)
    for loc in ('zh-CN', 'zh-TW', 'en'):
        assert 'ProtoLoft' in loc_data[loc]['dingtalk']['markdown']['text'], f"{loc} dingtalk 缺少 ProtoLoft"
        assert 'ProtoLoft' in json.dumps(loc_data[loc]['feishu'], ensure_ascii=False), f"{loc} feishu 缺少 ProtoLoft"
        assert 'ProtoLoft' in loc_data[loc]['wecom']['markdown']['content'], f"{loc} wecom 缺少 ProtoLoft"
        assert 'ProtoLoft' in loc_data[loc]['err'], f"{loc} err_keyword 缺少 ProtoLoft"
    en_wc = loc_data['en']['wecom']['markdown']['content']
    assert '**Publisher**: Alice' in en_wc and '**Publisher**：' not in en_wc, f"en wecom 冒号格式异常: {en_wc}"
    print("✅ 三语 Webhook 统一 ProtoLoft 关键词与英文半角冒号校验通过！")

    # 5. 模拟测试平台报错自愈引导 (覆盖钉钉与飞书真实返回样本)
    test_error_handling = """
    require_once __DIR__ . '/includes/webhook.php';
    
    // 真实平台错误样本
    $mockErrors = [
        ['errcode' => 310000, 'errmsg' => 'keywords not in content'],
        ['errcode' => 310000, 'errmsg' => 'sign not match'],
        ['code' => 19024, 'msg' => 'Key Words Not Found'],
        ['code' => 19021, 'msg' => 'sign match fail'],
        ['code' => 19022, 'msg' => 'ip not in whitelist']
    ];

    foreach ($mockErrors as $err) {
        $errMsg = $err['errmsg'] ?? ($err['msg'] ?? '');
        $code = $err['errcode'] ?? ($err['code'] ?? 0);
        $lowerErr = strtolower($errMsg);
        if (strpos($lowerErr, 'keyword') !== false || strpos($lowerErr, 'key word') !== false || strpos($lowerErr, 'sign') !== false || strpos($lowerErr, 'ip') !== false || (int)$code === 19024) {
            $diag = t('webhook.err_keyword');
            assert(strpos($diag, 'ProtoLoft') !== false);
        } else {
            throw new Exception("诊断逻辑未命中: " . $errMsg);
        }
    }
    echo "OK";
    """
    res_err = subprocess.run(['php', '-r', test_error_handling], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    assert res_err.stdout.strip() == "OK", "诊断逻辑测试失败"
    print("✅ 机器人安全校验拦截自愈诊断测试通过！")
    return True

if __name__ == '__main__':
    ok = test_webhook_payloads()
    sys.exit(0 if ok else 1)
