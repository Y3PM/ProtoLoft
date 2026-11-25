#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
立象原型 · ProtoLoft · Q9规范收口专项回归测试
验证点：
1. includes/modals.php 中所有散落硬编码 Hex 彻底清零 (0 处)；
2. assets/js/admin.js 动态内容与空状态 SVG 彻底消除裸 Hex，仅保留 CHART_PALETTE 集中调色板 (<= 10 处)；
3. index.php 组件内联硬编码色值清零，仅保留品牌官方折纸大象 Logo 几何图形 (<= 21 处)；
4. share.php 8 处错误卡片完全收敛为 render_share_error_card()，硬编码 Hex <= 2 处；
5. assets/css/app.css 具备 .m-modal-footer, .m-alert-tip, .m-domain-badge, .m-badge-tag 等标准 Linear 预设类；
6. APP_VERSION 严格升级为 3.1.6。
"""

import os
import re
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def check_q9_standards():
    passed = 0
    total = 0

    print("[*] 开始执行 Q9 规范收口专项静态与结构化验证...")

    # 1. 验证版本号
    total += 1
    config_path = os.path.join(BASE_DIR, 'includes', 'config.php')
    with open(config_path, 'r', encoding='utf-8') as f:
        config_content = f.read()
    if "define('APP_VERSION', '3.1.6');" in config_content:
        passed += 1
        print("  ✓ [1/6] 版本号已正确迭代为 3.1.6")
    else:
        print("  ✗ [1/6] 版本号未正确设置为 3.1.6")

    # 2. 验证 modals.php Hex 清零
    total += 1
    modals_path = os.path.join(BASE_DIR, 'includes', 'modals.php')
    with open(modals_path, 'r', encoding='utf-8') as f:
        modals_content = f.read()
    modals_hex = re.findall(r'#[0-9a-fA-F]{3,8}\b', modals_content)
    if len(modals_hex) == 0:
        passed += 1
        print("  ✓ [2/6] includes/modals.php 硬编码 Hex 彻底清零 (0 处)")
    else:
        print(f"  ✗ [2/6] includes/modals.php 仍有残留 Hex: {modals_hex}")

    # 3. 验证 admin.js Hex 收敛
    total += 1
    admin_js_path = os.path.join(BASE_DIR, 'assets', 'js', 'admin.js')
    with open(admin_js_path, 'r', encoding='utf-8') as f:
        admin_js_content = f.read()
    admin_hex = re.findall(r'#[0-9a-fA-F]{3,8}\b', admin_js_content)
    if len(admin_hex) <= 10 and 'getDashboardChartPalette' in admin_js_content and admin_js_content.count('function getDashboardChartPalette') == 1:
        passed += 1
        print(f"  ✓ [3/6] assets/js/admin.js 已抽取单一 CHART_PALETTE，仅保留集中色值 ({len(admin_hex)} 处)")
    else:
        print(f"  ✗ [3/6] assets/js/admin.js 色值未充分收敛: {len(admin_hex)} 处")

    # 4. 验证 index.php Hex 收敛
    total += 1
    index_path = os.path.join(BASE_DIR, 'index.php')
    with open(index_path, 'r', encoding='utf-8') as f:
        index_content = f.read()
    index_hex = re.findall(r'#[0-9a-fA-F]{3,8}\b', index_content)
    if len(index_hex) <= 21 and 'm-domain-badge' in index_content and 'm-alert-tip' in index_content:
        passed += 1
        print(f"  ✓ [4/6] index.php 界面组件已全面消费预设类，仅留存品牌大象标志色 ({len(index_hex)} 处)")
    else:
        print(f"  ✗ [4/6] index.php 未达标: {len(index_hex)} 处")

    # 5. 验证 share.php 错误卡片收敛
    total += 1
    share_path = os.path.join(BASE_DIR, 'share.php')
    with open(share_path, 'r', encoding='utf-8') as f:
        share_content = f.read()
    share_hex = re.findall(r'#[0-9a-fA-F]{3,8}\b', share_content)
    no_double_escape = "htmlspecialchars($effectiveExpiresAt)" not in share_content
    has_versioned_css = "assets/css/app.css?v=<?php echo APP_VERSION" in share_content
    if len(share_hex) <= 2 and 'render_share_error_card(' in share_content and no_double_escape and has_versioned_css:
        passed += 1
        print(f"  ✓ [5/6] share.php 错误卡片已统一、无双重转义且 CSS 带版本号，Hex 仅留存 {len(share_hex)} 处")
    else:
        print(f"  ✗ [5/6] share.php 未达标: hex={len(share_hex)}, no_double_escape={no_double_escape}, versioned_css={has_versioned_css}")

    # 6. 验证 app.css 预设类完整度与实际消费情况
    total += 1
    css_path = os.path.join(BASE_DIR, 'assets', 'css', 'app.css')
    with open(css_path, 'r', encoding='utf-8') as f:
        css_content = f.read()
    required_classes = ['.m-modal-footer', '.m-alert-tip', '.m-domain-badge', '.m-badge-tag', '.m-status-dot']
    missing_classes = [c for c in required_classes if c not in css_content]
    used_footer = 'class="m-modal-footer"' in modals_content
    used_dot = 'm-status-dot' in modals_content and 'm-status-dot' in admin_js_content
    no_dead_empty_svg = '.m-empty-svg-' not in css_content
    if not missing_classes and used_footer and used_dot and no_dead_empty_svg:
        passed += 1
        print(f"  ✓ [6/6] assets/css/app.css 预设组件类完整、已全部真实消费且无死类")
    else:
        print(f"  ✗ [6/6] assets/css/app.css 校验失败: missing={missing_classes}, footer={used_footer}, dot={used_dot}, clean={no_dead_empty_svg}")

    print(f"\n[+] Q9 专项验证结果: {passed}/{total} 项通过 ({round(passed/total*100, 1)}%)")
    return passed == total

if __name__ == '__main__':
    ok = check_q9_standards()
    sys.exit(0 if ok else 1)
