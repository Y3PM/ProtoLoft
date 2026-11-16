<?php
/**
 * 保护数据目录安全，禁止外部直接访问
 */
http_response_code(403);
header('Content-Type: text/plain; charset=utf-8');
exit('403 Forbidden: Access to data directory is denied.');
