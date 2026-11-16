<?php
/**
 * 立象原型 · 本地开发内置服务器轻量路由网关
 * 模拟生产环境 .htaccess 私有目录防护规则
 */
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
if (preg_match('#^/(data|includes|\.dev|\.git)(/|$)#', $path)) {
    http_response_code(403);
    echo "403 Forbidden: Private Directory Access Denied";
    exit;
}
return false;
