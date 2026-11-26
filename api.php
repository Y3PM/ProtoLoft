<?php
/**
 * 统一后端 JSON API 调度网关 (Gateway)
 * 采用高内聚、低耦合领域路由架构，纯原生零外部框架
 */
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

// 注册底层致命错误拦截，防止 PHP 致命异常抛出空 500 导致前端只能提示"网络异常"
register_shutdown_function(function() {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR], true)) {
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode([
            'success' => false,
            'data' => null,
            'message' => function_exists('t') ? t('common.server_fatal') : '服务端发生错误，请稍后重试'
        ], JSON_UNESCAPED_UNICODE);
    }
});

require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/db.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/zip_handler.php';
require_once __DIR__ . '/includes/webhook.php';
require_once __DIR__ . '/includes/mailer.php';
require_once __DIR__ . '/includes/storage.php';
require_once __DIR__ . '/includes/collaboration.php';

function jsonResponse($success, $data = null, $message = '', $afterResponse = null) {
    $body = json_encode([
        'success' => $success,
        'data' => $data,
        'message' => $message
    ], JSON_UNESCAPED_UNICODE);
    if (!$afterResponse) {
        echo $body;
        exit;
    }

    // Flush before the account lookup and SMTP so neither influences the public response.
    session_write_close();
    ignore_user_abort(true);
    ini_set('zlib.output_compression', '0');
    if (function_exists('apache_setenv')) apache_setenv('no-gzip', '1');
    header('X-Accel-Buffering: no');
    header('Content-Length: ' . strlen($body));
    echo $body;
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    } elseif (function_exists('litespeed_finish_request')) {
        litespeed_finish_request();
    } else {
        while (ob_get_level() > 0 && @ob_end_flush()) {}
        flush();
    }
    try {
        $afterResponse();
    } catch (Throwable $e) {
        error_log('[protoloft] 找回密码邮件处理失败: ' . $e->getMessage());
    }
    exit;
}

/**
 * 校验上传的图像或矢量 SVG 内容是否真实且安全
 */
function isSafeUploadedImage($tmpPath, $ext) {
    if (!file_exists($tmpPath) || filesize($tmpPath) <= 0) return false;
    $ext = strtolower($ext);
    if ($ext === 'svg') {
        $content = file_get_contents($tmpPath);
        if ($content === false) return false;
        if (stripos($content, '<svg') === false) return false;

        // 1. 宽口径文本与伪协议预检 (防御任意标签前缀与文本级危险注入)
        if (preg_match('/<!(?:DOCTYPE|ENTITY)/i', $content)) {
            return false;
        }
        if (preg_match('/<[^>\s\/:]*?:?(script|iframe|object|embed|foreignobject|meta|link)\b/i', $content)) {
            return false;
        }
        if (preg_match('/\bon[a-z0-9_\-]+\s*=/i', $content)) {
            return false;
        }
        if (preg_match('/(?:javascript|vbscript):/i', $content)) {
            return false;
        }
        if (preg_match('/data:\s*text\/html/i', $content)) {
            return false;
        }

        // 2. 原生 DOMDocument 语义深度解析 (从底层 AST 节点彻底封死未知/变异命名空间)
        if (!class_exists('DOMDocument')) {
            return false;
        }
        $dom = new DOMDocument();
        $prevEntityLoader = null;
        if (PHP_VERSION_ID < 80000 && function_exists('libxml_disable_entity_loader')) {
            $prevEntityLoader = @libxml_disable_entity_loader(true);
        }
        $prevErrors = libxml_use_internal_errors(true);
        $loaded = $dom->loadXML($content, LIBXML_NONET | LIBXML_NOWARNING | LIBXML_NOERROR);
        libxml_clear_errors();
        libxml_use_internal_errors($prevErrors);
        if (PHP_VERSION_ID < 80000 && $prevEntityLoader !== null) {
            @libxml_disable_entity_loader($prevEntityLoader);
        }

        if (!$loaded || !$dom->documentElement) {
            return false;
        }
        if ($dom->doctype !== null) {
            return false;
        }
        if (strtolower($dom->documentElement->localName) !== 'svg') {
            return false;
        }

        $elements = $dom->getElementsByTagName('*');
        $dangerousTags = [
            'script' => true, 'iframe' => true, 'object' => true, 'embed' => true,
            'foreignobject' => true, 'meta' => true, 'link' => true, 'applet' => true
        ];

        foreach ($elements as $el) {
            $localName = strtolower($el->localName);
            if (!empty($dangerousTags[$localName])) {
                return false;
            }
            if ($el->hasAttributes()) {
                foreach ($el->attributes as $attr) {
                    $attrName = strtolower($attr->localName);
                    $nodeName = strtolower($attr->nodeName);
                    if (strpos($attrName, 'on') === 0 || strpos($nodeName, 'on') === 0) {
                        return false;
                    }
                    $val = (string)$attr->value;
                    $cleanVal = preg_replace('/[\x00-\x20\s]+/u', '', $val);
                    if (preg_match('/(?:javascript|vbscript):/i', $cleanVal)) {
                        return false;
                    }
                    if (preg_match('/^data:\s*text\/html/i', $cleanVal)) {
                        return false;
                    }
                    if (in_array($attrName, ['href', 'src', 'data'], true) || in_array($nodeName, ['href', 'xlink:href', 'src', 'data'], true)) {
                        if (preg_match('/[\x00-\x1f\x7f]/', $val)) {
                            return false;
                        }
                    }
                }
            }
        }

        return true;
    }
    if (in_array($ext, ['png', 'jpg', 'jpeg', 'webp'], true)) {
        return (@getimagesize($tmpPath) !== false);
    }
    if ($ext === 'ico') {
        $header = file_get_contents($tmpPath, false, null, 0, 4);
        return ($header === "\x00\x00\x01\x00");
    }
    return false;
}

/**
 * 安全过滤并生成合法目录名片段 (彻底封死目录逃逸)
 */
function sanitizeSafeDirSegment($seg, $default = 'unnamed') {
    $seg = trim((string)$seg);
    $seg = preg_replace('/[^\w\.\-\p{Han}]/u', '_', $seg);
    $seg = preg_replace('/\.{2,}/', '_', $seg);
    $seg = trim($seg, "._ \t\n\r\0\x0B");
    if ($seg === '' || $seg === '.' || $seg === '..') {
        $seg = $default;
    }
    return $seg;
}

/**
 * 受控的物理目录安全递归清理 (严格限定在 UPLOADS_PATH 之内)
 */
function safeRemoveDirectory($targetDir) {
    if (empty($targetDir)) return false;
    $realUploads = realpath(UPLOADS_PATH);
    $realTarget = realpath($targetDir);
    if (!$realTarget || !$realUploads) return false;
    if (strpos($realTarget, $realUploads . DIRECTORY_SEPARATOR) !== 0) return false;
    if ($realTarget === $realUploads || dirname($realTarget) === $realUploads) {
        return false;
    }

    try {
        $it = new RecursiveDirectoryIterator($realTarget, RecursiveDirectoryIterator::SKIP_DOTS);
        $files = new RecursiveIteratorIterator($it, RecursiveIteratorIterator::CHILD_FIRST);
        foreach ($files as $file) {
            if ($file->isDir()) {
                @rmdir($file->getRealPath());
            } else {
                @unlink($file->getRealPath());
            }
        }
        return @rmdir($realTarget);
    } catch (Exception $e) {
        return false;
    }
}

// 检查是否安装
if (!is_installed()) {
    jsonResponse(false, null, t('api.not_installed'));
}

$action = trim($_REQUEST['action'] ?? '');

try {
    $db = DB::getInstance();
} catch (Exception $e) {
    error_log('[ue-hub] api.php 数据库初始化失败: ' . $e->getMessage());
    jsonResponse(false, null, t('api.db_init_failed'));
}

// 检查 post_max_size 超限丢弃
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' && empty($_POST) && empty($_FILES) && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    jsonResponse(false, null, t('api.post_too_large'));
}

// 读操作白名单与请求方式限制
$readOnlyActions = ['get_session', 'user_list', 'download_rp', 'item_get_share', 'log_list', 'list_annotations', 'pending_user_list', 'annotation_target', 'previous_annotations', 'mcp_settings'];
if (!in_array($action, $readOnlyActions, true) && ($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    jsonResponse(false, null, t('api.method_not_allowed'));
}

// 跨站 Origin 校验（基于实际访问来源，不因公开链接地址配错锁死管理与登录；兼容 HTTPS 反代转 HTTP 回源且未透传协议头）
if (!empty($_SERVER['HTTP_ORIGIN'])) {
    try {
        $expected = parse_url(app_request_origin_url());
    } catch (Exception $e) {
        $expected = false;
    }
    $origin = parse_url($_SERVER['HTTP_ORIGIN']);
    $originScheme = strtolower($origin['scheme'] ?? '');
    $expectedScheme = strtolower($expected['scheme'] ?? '');
    $originHost = $origin['host'] ?? '';
    $expectedHost = $expected['host'] ?? '';
    $originPort = (int)($origin['port'] ?? ($originScheme === 'https' ? 443 : 80));
    $expectedPort = (int)($expected['port'] ?? ($expectedScheme === 'https' ? 443 : 80));

    $hostMatched = ($originHost !== '' && $expectedHost !== '' && strcasecmp($originHost, $expectedHost) === 0);
    $exactOriginMatched = $hostMatched && ($originScheme === $expectedScheme) && ($originPort === $expectedPort);

    // 兜底：若外层反代以标准 HTTP(80) 回源且未透传协议头，仅当 Origin 为同域名标准 HTTPS(443) 且附带有效站内 CSRF 令牌时放行，并提升本响应凭据为 Secure
    $originCsrfToken = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['csrf_token'] ?? '');
    $isProxyHttpsCandidate = app_is_proxy_https_origin_candidate();

    if ($exactOriginMatched) {
        if ($expectedScheme === 'https') {
            $GLOBALS['app_force_https'] = true;
        }
    } else {
        if ($isProxyHttpsCandidate) {
            if (!verify_csrf_token($originCsrfToken)) {
                jsonResponse(false, null, t('api.csrf_expired'));
            }
            $GLOBALS['app_force_https'] = true;
        } else {
            error_log('[protoloft] 跨站来源校验失败: origin=' . ($_SERVER['HTTP_ORIGIN'] ?? '') . ' expected=' . ($expectedScheme . '://' . $expectedHost . ':' . $expectedPort));
            jsonResponse(false, null, t('api.origin_check_failed'));
        }
    }
}

// 初始化会话与当前身份
Auth::getCurrentUser();

// 敏感管理写操作 CSRF 强制校验
$csrfExemptActions = ['login', 'get_session', 'register_visitor', 'request_password_reset', 'reset_password'];
if (!in_array($action, $csrfExemptActions, true) && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['csrf_token'] ?? '');
    if (!verify_csrf_token($token)) {
        jsonResponse(false, null, t('api.login_expired'));
    }
}

// ===================== 领域路由调度分发矩阵 =====================
$actionRoutes = [
    // 1. 认证与个人中心
    'login' => 'auth',
    'logout' => 'auth',
    'get_session' => 'auth',
    'register_visitor' => 'auth',
    'request_password_reset' => 'auth',
    'validate_password_reset' => 'auth',
    'reset_password' => 'auth',
    'profile_update' => 'auth',
    'profile_update_webhook' => 'auth',
    'profile_update_avatar' => 'auth',
    'change_my_password' => 'auth',
    'dismiss_first_login' => 'auth',

    // 2. 成员管理、审批与协同交接
    'user_list' => 'users',
    'user_add' => 'users',
    'user_update' => 'users',
    'user_delete' => 'users',
    'transfer_ownership' => 'users',
    'user_handover' => 'users',
    'pending_user_list' => 'users',
    'approve_user' => 'users',
    'reject_user' => 'users',

    // 3. 分类与项目管理
    'category_save' => 'items',
    'category_delete' => 'items',
    'category_sort' => 'items',
    'item_save' => 'items',
    'item_delete' => 'items',
    'item_toggle_visibility' => 'items',
    'item_sort' => 'items',
    'item_set_webhook' => 'items',
    'download_rp' => 'items',

    // 4. 版本发布与管理
    'upload_chunk' => 'versions',
    'version_check_name' => 'versions',
    'version_publish' => 'versions',
    'version_update' => 'versions',
    'version_delete' => 'versions',
    'version_set_default' => 'versions',
    'version_update_rp' => 'versions',
    'version_remove_rp' => 'versions',

    // 5. 原型外发短链与专属分享
    'item_get_share' => 'shares',
    'item_save_share' => 'shares',
    'share_code_create' => 'shares',
    'share_code_revoke' => 'shares',
    'item_toggle_share' => 'shares',
    'item_rotate_share' => 'shares',

    // 6. 页面打点批注协同
    'list_annotations' => 'annotations',
    'annotation_target' => 'annotations',
    'previous_annotations' => 'annotations',
    'review_annotation' => 'annotations',
    'carry_annotation' => 'annotations',
    'add_annotation' => 'annotations',
    'reply_annotation' => 'annotations',
    'toggle_annotation_status' => 'annotations',
    'delete_annotation' => 'annotations',

    'mcp_settings' => 'mcp',
    'mcp_token_create' => 'mcp',
    'mcp_permission_update' => 'mcp',
    'mcp_token_revoke' => 'mcp',

    // 7. 系统设置、角色权限、审计日志与 Webhook
    'save_settings' => 'system',
    'save_role_permissions' => 'system',
    'log_list' => 'system',
    'log_clear' => 'system',
    'log_workspace_access' => 'system',
    'test_webhook' => 'system',
    'test_smtp' => 'system',
];

$domain = $actionRoutes[$action] ?? null;
if (!$domain) {
    jsonResponse(false, null, t('api.unknown_action', ['action' => htmlspecialchars($action)]));
}

try {
    require __DIR__ . "/includes/actions/{$domain}.php";
} catch (DomainException $e) {
    jsonResponse(false, null, $e->getMessage());
} catch (Throwable $e) {
    error_log("[ue-hub] api domain={$domain} action={$action} 异常: " . $e->getMessage());
    jsonResponse(false, null, t('common.server_error'));
}
