<?php
/**
 * 保护上传资产目录安全，禁止外部直接访问根路径
 */
header('Location: ../');
exit;
