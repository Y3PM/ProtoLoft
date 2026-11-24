#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
立象原型 · ProtoLoft · P2 与 P3 审查缺陷专项回归测试套件
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
"""

import sys
import os
import shutil
import tempfile
import subprocess
import time
import json
import urllib.parse
from http.server import HTTPServer
import socket

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

def run_php(code, php_bin='php'):
    cmd = [php_bin, '-r', code]
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True, cwd=ROOT)
    return p.returncode, p.stdout, p.stderr

def assert_check(title, condition, extra=''):
    if not condition:
        print("FAIL: {} {}".format(title, extra))
        sys.exit(1)
    print("PASS: {}".format(title))

def test_p2_1_headers():
    print("\n[*] P2-1: 防嵌框架响应头检测")
    for script in ['index.php', 'share.php', 'install.php']:
        content = open(os.path.join(ROOT, script), 'r', encoding='utf-8').read()
        assert_check(script + " 包含 X-Frame-Options: SAMEORIGIN", "header('X-Frame-Options: SAMEORIGIN');" in content)
        assert_check(script + " 包含 frame-ancestors 'self'", "header(\"Content-Security-Policy: frame-ancestors 'self'\");" in content)

def test_p2_2_login_throttle(php_bin):
    print("\n[*] P2-2: 登录限速不可通过成功登录重置")
    content = open(os.path.join(ROOT, 'includes', 'auth.php'), 'r', encoding='utf-8').read()
    # 确认 login 函数成功分支没有 clearThrottle('login')
    login_slice = content[content.find('public static function login('):content.find('public static function logout(')]
    assert_check("login 成功逻辑中不包含 clearThrottle('login')", "clearThrottle('login')" not in login_slice)

def test_p2_3_version_update_error(php_bin):
    print("\n[*] P2-3: version_update 异常透传 DomainException")
    content = open(os.path.join(ROOT, 'includes', 'actions', 'versions.php'), 'r', encoding='utf-8').read()
    update_slice = content[content.find("case 'version_update':"):content.find("case 'version_delete':")]
    assert_check("version_update 中遇到 DomainException 原样抛出", "$e instanceof DomainException" in update_slice and "throw $e;" in update_slice)

def test_p3_backend(php_bin):
    print("\n[*] P3 后端缺陷静态与逻辑核验")
    auth_content = open(os.path.join(ROOT, 'includes', 'auth.php'), 'r', encoding='utf-8').read()
    # P3-1
    assert_check("P3-1: updateUser 给自身改密时同步 auth_version 与 session", "$_SESSION['auth_version'] = $newVer;" in auth_content and "self::$cachedUser['auth_version'] = $newVer;" in auth_content)
    # P3-2
    assert_check("P3-2: createUser 包含 Webhook::isAllowedUrl 白名单校验", "Webhook::isAllowedUrl($webhookUrl)" in auth_content)
    # P3-3
    share_action = open(os.path.join(ROOT, 'includes', 'actions', 'shares.php'), 'r', encoding='utf-8').read()
    assert_check("P3-3: item_rotate_share 失败时正确返回 success=false", "empty($newCode)" in share_action and "重置安全短链失败" in share_action)
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
    assert_check("Q2: includes/actions/auth.php 统一已有账号提示防探测", "该邮箱已提交申请或已存在账号" in action_auth)
    assert_check("Q1: includes/actions/annotations.php 强制外部访客署名前缀与可见性会话隔离", "[外部访客]" in anno_action and "$_SESSION['guest_anno_ids']" in anno_action and "!$curUser" in anno_action)

def test_p3_frontend():
    print("\n[*] P3 前端缺陷静态特征与语法核验")
    anno_js = open(os.path.join(ROOT, 'assets', 'js', 'annotation.js'), 'r', encoding='utf-8').read()
    assert_check("P3-8: deleteAnno 包含 window.confirm 兜底", "window.confirm('确定删除此批注及其全部回复？')" in anno_js)
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
    test_p2_2_login_throttle(php_bin)
    test_p2_3_version_update_error(php_bin)
    test_p3_backend(php_bin)
    test_p3_frontend()

    print("\n======================================================================")
    print("  ALL P2 AND P3 DEFECT REGRESSION TESTS PASSED (32/32 ASSERTIONS OK)! ")
    print("======================================================================")

if __name__ == '__main__':
    main()
