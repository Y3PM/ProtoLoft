<?php
/** 原型资源入口。PATH_INFO 保留相对资源路径，HTML/CSS/JS 无需重写。 */
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/storage.php';
require_installed();
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header("Content-Security-Policy: frame-ancestors 'self'");
header('Cache-Control: private, no-cache');

$path = $_SERVER['PATH_INFO'] ?? ($_SERVER['ORIG_PATH_INFO'] ?? '');
if ($path === '' && !empty($_SERVER['REQUEST_URI'])) {
    $reqPath = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    if (is_string($reqPath)) {
        $scriptPrefix = app_base_path() . '/asset.php';
        if (strncmp($reqPath, $scriptPrefix . '/', strlen($scriptPrefix) + 1) === 0) {
            $path = rawurldecode(substr($reqPath, strlen($scriptPrefix)));
        } elseif (preg_match('#/asset\.php(/v[1-9][0-9]*/.+)$#', $reqPath, $reqMatch)) {
            $path = rawurldecode($reqMatch[1]);
        }
    }
}
if (!preg_match('#^/v([1-9][0-9]*)/(.+)$#D', $path, $match)) {
    http_response_code(404); exit;
}
$db = DB::getInstance();
$stmt = $db->prepare('SELECT * FROM versions WHERE id = ?');
$stmt->execute([(int)$match[1]]);
$version = $stmt->fetch();
$item = $version ? Auth::getItem((int)$version['item_id']) : null;
if (!$item || (!Auth::canViewItem($item) && !Auth::hasShareAccess($item, $version))) {
    http_response_code(403); exit;
}
$relative = $match[2];
$ext = strtolower(pathinfo($relative, PATHINFO_EXTENSION));
$types = [
    'html' => 'text/html; charset=utf-8', 'htm' => 'text/html; charset=utf-8',
    'css' => 'text/css; charset=utf-8', 'js' => 'application/javascript; charset=utf-8',
    'json' => 'application/json', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
    'gif' => 'image/gif', 'svg' => 'image/svg+xml', 'webp' => 'image/webp', 'avif' => 'image/avif',
    'ico' => 'image/x-icon', 'woff' => 'font/woff', 'woff2' => 'font/woff2', 'ttf' => 'font/ttf', 'otf' => 'font/otf',
    'mp4' => 'video/mp4', 'webm' => 'video/webm', 'mp3' => 'audio/mpeg', 'wav' => 'audio/wav',
    'pdf' => 'application/pdf', 'txt' => 'text/plain; charset=utf-8', 'xml' => 'application/xml', 'wasm' => 'application/wasm'
];
// 底稿及未知可执行类型不能从预览入口下载。
if (!isset($types[$ext])) { http_response_code(403); exit; }
$file = Storage::filePath($version, $relative);
if (!$file) { http_response_code(404); exit; }
session_write_close();
$size = @filesize($file);
$mtime = @filemtime($file);
$etag = '"' . substr(basename($file), 0, 24) . '"';
header('ETag: ' . $etag);
if ($mtime !== false) {
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $mtime) . ' GMT');
}
$ifNoneMatch = trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? ''));
$etagMatched = false;
if ($ifNoneMatch !== '') {
    if ($ifNoneMatch === '*') {
        $etagMatched = true;
    } else {
        foreach (explode(',', $ifNoneMatch) as $candidate) {
            $candidate = trim($candidate);
            if (strpos($candidate, 'W/') === 0) $candidate = substr($candidate, 2);
            if ($candidate === $etag) {
                $etagMatched = true;
                break;
            }
        }
    }
}
if (!$etagMatched && $ifNoneMatch === '' && $mtime !== false && !empty($_SERVER['HTTP_IF_MODIFIED_SINCE'])) {
    $since = strtotime((string)$_SERVER['HTTP_IF_MODIFIED_SINCE']);
    if ($since !== false && $since >= $mtime) {
        $etagMatched = true;
    }
}
if ($etagMatched) {
    http_response_code(304);
    exit;
}
header('Content-Type: ' . $types[$ext]);
if ($size !== false) header('Content-Length: ' . $size);
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') readfile($file);
