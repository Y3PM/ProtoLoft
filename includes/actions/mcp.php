<?php
if (!defined('APP_VERSION')) exit;
header('Cache-Control: no-store');
require_once __DIR__ . '/../mcp_access.php';
$user = Auth::getCurrentUser();
if (!$user) throw new DomainException(t('api.login_first'));
switch ($action) {
    case 'mcp_settings': jsonResponse(true, McpAccess::settings()); break;
    case 'mcp_token_create':
        $rawScope = isset($_POST['project_ids']) ? $_POST['project_ids'] : ($_POST['project_id'] ?? 0);
        jsonResponse(true, McpAccess::create($rawScope, !empty($_POST['can_publish']), !empty($_POST['replace'])), t('api.mcp.token_created')); break;
    case 'mcp_permission_update':
        $rawScope = isset($_POST['project_ids']) ? $_POST['project_ids'] : ($_POST['project_id'] ?? 0);
        jsonResponse(true, McpAccess::updatePermissions($rawScope, !empty($_POST['can_publish'])), t('api.mcp.perm_updated')); break;
    case 'mcp_token_revoke':
        $db->prepare('DELETE FROM mcp_tokens WHERE user_id = ?')->execute([$user['id']]);
        jsonResponse(true, null, t('api.mcp.token_revoked')); break;
}
