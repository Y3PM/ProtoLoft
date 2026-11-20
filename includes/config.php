<?php
/**
 * 全局系统配置文件
 */
// 规范运行环境：生产环境屏蔽直接屏幕报错，防止 Notice 污染 API 输出
error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);
ini_set('display_errors', '0');
ini_set('log_errors', '1');

// 默认时区：未指定时默认使用中国标准时间 (Asia/Shanghai)
date_default_timezone_set('Asia/Shanghai');

if (!defined('ROOT_PATH')) {
    define('ROOT_PATH', dirname(__DIR__));
}

define('DATA_PATH', ROOT_PATH . '/data');
define('DB_FILE', DATA_PATH . '/database.sqlite');
define('LOCK_FILE', DATA_PATH . '/install.lock');
define('INSTALL_TOKEN_FILE', DATA_PATH . '/install_token.php');
define('INSTALL_THROTTLE_FILE', DATA_PATH . '/.install_throttle.json');

// 用户生成资产唯一集中存储池 (动静分离与集中防护)
define('UPLOADS_PATH', ROOT_PATH . '/uploads');
define('BRANDING_PATH', UPLOADS_PATH . '/branding');

// 原型与上传切片不对 Web 静态目录开放。
define('PROTOTYPES_PATH', DATA_PATH . '/prototypes');
define('CHUNKS_PATH', DATA_PATH . '/chunks');

define('APP_VERSION', '3.1.3');

/**
 * 检查系统是否已安装
 */
function is_installed() {
    return file_exists(LOCK_FILE) && file_exists(DB_FILE);
}

/**
 * 规范化校验显式站点基准地址（仅允许 http/https 及合法主机名）
 */
function app_normalize_base_url($raw) {
    $url = rtrim(trim((string)$raw), '/');
    if ($url === '') {
        return '';
    }
    $parts = parse_url($url);
    $scheme = strtolower($parts['scheme'] ?? '');
    if (!$parts || !in_array($scheme, ['http', 'https'], true) || empty($parts['host'])
        || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])
        || preg_match('/[\x00-\x20\x7f]/', $url)) {
        throw new RuntimeException('站点地址配置无效');
    }
    return $url;
}

/**
 * 读取显式配置的站点外部地址：优先环境变量 PROTOLOFT_BASE_URL，其次系统设置 site_base_url
 */
function app_configured_base_url($refresh = false) {
    $envBase = trim((string)getenv('PROTOLOFT_BASE_URL'));
    if ($envBase !== '') {
        return app_normalize_base_url($envBase);
    }
    static $cachedDbBase = null;
    if ($refresh) {
        $cachedDbBase = null;
    }
    if ($cachedDbBase !== null) {
        return $cachedDbBase;
    }
    $cachedDbBase = '';
    if (is_installed()) {
        try {
            if (!class_exists('DB', false)) {
                require_once __DIR__ . '/db.php';
            }
            $stmt = DB::getInstance()->prepare("SELECT value FROM settings WHERE key = ?");
            $stmt->execute(['site_base_url']);
            $row = $stmt->fetch();
            if ($row && !empty($row['value'])) {
                $cachedDbBase = app_normalize_base_url($row['value']);
            }
        } catch (Throwable $e) {
            $cachedDbBase = '';
        }
    }
    return $cachedDbBase;
}

function app_base_matches_request_host($baseUrl) {
    $baseParts = parse_url((string)$baseUrl);
    $baseHost = $baseParts['host'] ?? '';
    $reqHostRaw = trim((string)($_SERVER['HTTP_HOST'] ?? ''));
    if ($reqHostRaw === '') {
        return true;
    }
    $reqParts = parse_url('http://' . $reqHostRaw);
    $reqHost = $reqParts['host'] ?? '';
    if (!$baseHost || !$reqHost || strcasecmp($baseHost, $reqHost) !== 0) {
        return false;
    }
    if (isset($reqParts['port'])) {
        $baseScheme = strtolower($baseParts['scheme'] ?? '');
        $effectiveBasePort = isset($baseParts['port'])
            ? (int)$baseParts['port']
            : ($baseScheme === 'https' ? 443 : 80);
        if ($effectiveBasePort !== (int)$reqParts['port']) {
            return false;
        }
    }
    return true;
}

/**
 * 检查显式浏览器来源头（Origin / Referer）是否明确通过明文 http:// 访问当前主机
 */
function app_client_explicit_http_request() {
    $reqHostRaw = trim((string)($_SERVER['HTTP_HOST'] ?? ''));
    $reqHost = $reqHostRaw !== '' ? (string)parse_url('http://' . $reqHostRaw, PHP_URL_HOST) : '';
    foreach (['HTTP_ORIGIN', 'HTTP_REFERER'] as $headerKey) {
        $raw = trim((string)($_SERVER[$headerKey] ?? ''));
        if ($raw === '') {
            continue;
        }
        $parts = parse_url($raw);
        if (!$parts || empty($parts['scheme']) || empty($parts['host'])) {
            continue;
        }
        $scheme = strtolower($parts['scheme']);
        $hostMatch = ($reqHost === '' || strcasecmp($parts['host'], $reqHost) === 0);
        if ($hostMatch && $scheme === 'http') {
            return true;
        }
        if ($hostMatch && $scheme === 'https') {
            return false;
        }
    }
    return false;
}

/**
 * 仅依据实际传输层与标准反代协议头判断当前是否 HTTPS（不读取公开地址配置）
 */
function app_transport_is_https() {
    if (!empty($GLOBALS['app_force_https'])) {
        return true;
    }
    if (!empty($_SERVER['HTTPS']) && strcasecmp((string)$_SERVER['HTTPS'], 'off') !== 0) {
        return true;
    }
    if (strcasecmp((string)($_SERVER['REQUEST_SCHEME'] ?? ''), 'https') === 0) {
        return true;
    }
    if ((string)($_SERVER['SERVER_PORT'] ?? '') === '443') {
        return true;
    }
    $xfProto = trim((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    if ($xfProto !== '') {
        $firstProto = strtolower(trim(explode(',', $xfProto)[0]));
        if ($firstProto === 'https') {
            return true;
        }
    }
    if (strtolower(trim((string)($_SERVER['HTTP_X_FORWARDED_SSL'] ?? ''))) === 'on') {
        return true;
    }
    return false;
}

/**
 * 判断是否匹配外层标准 HTTPS(443) 经 HTTP(80) 回源且剥离协议头的反代 Origin 特征
 */
function app_is_proxy_https_origin_candidate() {
    if (empty($_SERVER['HTTP_ORIGIN']) || app_transport_is_https()) {
        return false;
    }
    $reqHost = trim((string)($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $reqParts = parse_url('http://' . $reqHost);
    $expectedHost = $reqParts['host'] ?? '';
    $expectedPort = isset($reqParts['port']) ? (int)$reqParts['port'] : 80;
    if ($expectedHost === '' || $expectedPort !== 80) {
        return false;
    }
    $origin = parse_url((string)$_SERVER['HTTP_ORIGIN']);
    if (!$origin || empty($origin['host'])) {
        return false;
    }
    $originScheme = strtolower($origin['scheme'] ?? '');
    $originPort = isset($origin['port']) ? (int)$origin['port'] : ($originScheme === 'https' ? 443 : 80);
    return strcasecmp($origin['host'], $expectedHost) === 0
        && $originScheme === 'https'
        && $originPort === 443;
}

/**
 * 统一判断 Cookie / 运行时是否应按 HTTPS 处理（兼容标准代理头与同域名显式 HTTPS 配置）
 */
function app_is_https($checkDbConfig = true) {
    if (app_transport_is_https()) {
        return true;
    }
    // 浏览器明确通过 http:// Origin 或 Referer 访问时，不让公开地址配置强制把当前 HTTP 会话打上 Secure
    if (app_client_explicit_http_request()) {
        return false;
    }
    $reqPort = parse_url('http://' . trim((string)($_SERVER['HTTP_HOST'] ?? '')), PHP_URL_PORT);
    // 若当前通过非 80 的显式 HTTP 端口直连（如 :8080），仅依赖传输层与代理头，防止误配 https://host:8080 锁死非本机 HTTP 会话
    if ($reqPort !== null && (int)$reqPort !== 80) {
        return false;
    }
    $envBase = trim((string)getenv('PROTOLOFT_BASE_URL'));
    if ($envBase !== '' && stripos($envBase, 'https://') === 0 && app_base_matches_request_host($envBase)) {
        return true;
    }
    if ($checkDbConfig) {
        try {
            $dbBase = app_configured_base_url();
            if ($dbBase !== '' && stripos($dbBase, 'https://') === 0 && app_base_matches_request_host($dbBase)) {
                return true;
            }
        } catch (Throwable $e) {
            // 忽略异常，回退传输层判定
        }
    }
    return false;
}

function app_apply_session_cookie_params($isHttps) {
    if (PHP_VERSION_ID >= 70300) {
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'httponly' => true,
            'samesite' => 'Lax',
            'secure' => (bool)$isHttps,
        ]);
    } else {
        session_set_cookie_params(0, '/', '', (bool)$isHttps, true);
    }
}

// 默认仅当前浏览器会话有效；登录成功后按“记住登录”选择签发持久 Cookie。
if (session_status() === PHP_SESSION_NONE) {
    // 确保独立的本地 Session 存储目录，避免宿主环境默认 /var/lib/php/session 不存在或无权限
    $sessionSavePath = DATA_PATH . '/sessions';
    if (!is_dir($sessionSavePath)) {
        @mkdir($sessionSavePath, 0700, true);
    }
    if (is_dir($sessionSavePath) && is_writable($sessionSavePath)) {
        @ini_set('session.save_path', $sessionSavePath);
    }

    $isHttps = app_is_https(true);
    $sessionLifetime = 30 * 86400;
    ini_set('session.gc_maxlifetime', (string)$sessionLifetime);
    ini_set('session.cookie_lifetime', '0');
    @ini_set('session.use_strict_mode', '1');
    app_apply_session_cookie_params($isHttps);
    session_start();
}

function set_session_persistence($remember) {
    $_SESSION['remember_me'] = (bool)$remember;
    $params = session_get_cookie_params();
    $secure = !empty($params['secure']) || app_is_https();
    $expires = $remember ? time() + 30 * 86400 : 0;
    if (PHP_VERSION_ID >= 70300) {
        setcookie(session_name(), session_id(), [
            'expires' => $expires, 'path' => $params['path'],
            'secure' => $secure, 'httponly' => true, 'samesite' => 'Lax'
        ]);
    } else {
        setcookie(session_name(), session_id(), $expires, $params['path'], '', $secure, true);
    }
}

/**
 * 清理响应头中由早期 session_start 预置的同名会话 Cookie（保留其余 Set-Cookie）
 */
function app_strip_session_set_cookie_headers() {
    if (headers_sent()) {
        return;
    }
    $prefix = 'Set-Cookie: ' . session_name() . '=';
    $kept = [];
    foreach (headers_list() as $h) {
        if (stripos($h, 'Set-Cookie:') === 0 && stripos($h, $prefix) !== 0) {
            $kept[] = $h;
        }
    }
    header_remove('Set-Cookie');
    foreach ($kept as $h) {
        header($h, false);
    }
}

/**
 * 统一轮换 Session ID 并按当前真实安全上下文同步签发 PHPSESSID Cookie
 */
function app_regenerate_session($remember) {
    if (!session_regenerate_id(true)) {
        return false;
    }
    app_strip_session_set_cookie_headers();
    set_session_persistence($remember);
    return true;
}

/**
 * 确保已安装，若未安装则自动跳转至安装向导
 */
function require_installed() {
    if (!is_installed()) {
        header('Location: install.php');
        exit;
    }
}

/** 当前会话独立签发令牌；Cookie 仅用于前端传递，不能重建服务端令牌。 */
function get_csrf_token() {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function verify_csrf_token($token) {
    return is_string($token) && $token !== '' && !empty($_SESSION['csrf_token'])
        && hash_equals($_SESSION['csrf_token'], $token);
}

function app_base_path() {
    $script = $_SERVER['SCRIPT_NAME'] ?? '/index.php';
    // PATH_INFO 形式的资源请求也使用应用根目录。
    $script = preg_replace('#/(asset\.php)(?:/.*)?$#', '/$1', $script);
    return rtrim(str_replace('\\', '/', dirname($script)), '/.');
}

/** 校验浏览器 Origin 使用的服务端实际访问来源（仅依据传输层，与公开分享/MCP 链接配置完全解耦，防止配置错误锁死后台） */
function app_request_origin_url() {
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    if (!preg_match('/^(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])(?::[0-9]{1,5})?$/D', $host)) {
        throw new DomainException('站点地址无效');
    }
    return (app_transport_is_https() ? 'https://' : 'http://') . $host . app_base_path() . '/';
}

/** 站内通知与 MCP 配置共用的绝对地址，支持子目录部署。 */
function app_url($relative = '') {
    $envBase = trim((string)getenv('PROTOLOFT_BASE_URL'));
    if ($envBase !== '') {
        $base = app_normalize_base_url($envBase);
    } else {
        $dbBase = app_configured_base_url();
        if ($dbBase !== '') {
            $parts = parse_url($dbBase);
            $hasSubPath = !empty($parts['path']) && $parts['path'] !== '/';
            $base = $hasSubPath ? $dbBase : ($dbBase . app_base_path());
        } else {
            $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
            if (!preg_match('/^(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])(?::[0-9]{1,5})?$/D', $host)) throw new DomainException('站点地址无效');
            $base = (app_transport_is_https() ? 'https://' : 'http://') . $host . app_base_path();
        }
    }
    return $base . '/' . ltrim($relative, '/');
}

get_csrf_token();
