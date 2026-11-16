<?php
if (!defined('APP_VERSION')) exit;
header('Cache-Control: no-store');
require_once __DIR__ . '/../mcp_access.php';
$user = Auth::getCurrentUser();
if (!$user) throw new DomainException('请先登录');
switch ($action) {
    case 'mcp_settings': jsonResponse(true, McpAccess::settings()); break;
    case 'mcp_token_create':
        $rawScope = isset($_POST['project_ids']) ? $_POST['project_ids'] : ($_POST['project_id'] ?? 0);
        jsonResponse(true, McpAccess::create($rawScope, !empty($_POST['can_publish']), !empty($_POST['replace'])), '个人凭据已创建，仅本次显示完整内容'); break;
    case 'mcp_permission_update':
        $rawScope = isset($_POST['project_ids']) ? $_POST['project_ids'] : ($_POST['project_id'] ?? 0);
        jsonResponse(true, McpAccess::updatePermissions($rawScope, !empty($_POST['can_publish'])), '权限已自动更新'); break;
    case 'mcp_token_revoke':
        $db->prepare('DELETE FROM mcp_tokens WHERE user_id = ?')->execute([$user['id']]);
        jsonResponse(true, null, 'MCP 凭据已撤销'); break;
}
