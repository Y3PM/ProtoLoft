<?php
/**
 * 领域服务：成员管理、审批与协同交接 (Users & Collaboration)
 */
if (!defined('APP_VERSION')) exit;

switch ($action) {
    case 'user_list':
        if (!Auth::canManage()) jsonResponse(false, null, t('api.not_logged_in_or_perm'));
        $list = Auth::listUsers();
        if (!Auth::isAdmin()) {
            // 协作者仅可见只读通讯录脱敏字段
            $cleanList = [];
            foreach ($list as $u) {
                $cleanList[] = [
                    'id' => (int)$u['id'],
                    'email' => $u['email'],
                    'name' => $u['name'],
                    'role' => $u['role'],
                    'status' => (int)($u['status'] ?? 1),
                    'item_count' => (int)($u['item_count'] ?? 0),
                    'published_version_count' => (int)($u['published_version_count'] ?? 0),
                    'published_project_count' => (int)($u['published_project_count'] ?? 0),
                    'is_owner' => !empty($u['is_owner']) ? 1 : 0,
                    'created_at' => $u['created_at']
                ];
            }
            $list = $cleanList;
        }
        jsonResponse(true, $list);
        break;

    case 'user_add':
        if (!Auth::isAdmin()) jsonResponse(false, null, t('api.no_admin_perm'));
        $email = trim($_POST['email'] ?? ($_POST['username'] ?? ''));
        $name = trim($_POST['name'] ?? ($_POST['display_name'] ?? ''));
        $password = $_POST['password'] ?? '';
        $role = $_POST['role'] ?? 'editor';
        $department = trim($_POST['department'] ?? ($_POST['apply_remark'] ?? ''));
        $wb = trim($_POST['webhook_url'] ?? '');
        $res = Auth::createUser($email, $name, $password, $role, $department, $wb);
        jsonResponse($res['success'], $res['id'] ?? null, $res['message'] ?? '');
        break;

    case 'user_update':
        if (!Auth::isAdmin()) jsonResponse(false, null, t('api.no_admin_perm'));
        $id = (int)($_POST['id'] ?? 0);
        $role = $_POST['role'] ?? null;
        $status = isset($_POST['status']) ? (int)$_POST['status'] : null;
        $newPwd = $_POST['new_password'] ?? null;
        $name = isset($_POST['name']) ? trim($_POST['name']) : (isset($_POST['display_name']) ? trim($_POST['display_name']) : null);
        $email = isset($_POST['email']) ? trim($_POST['email']) : null;
        $department = isset($_POST['department']) ? trim($_POST['department']) : null;
        $webhookUrl = isset($_POST['webhook_url']) ? trim($_POST['webhook_url']) : null;
        $res = Auth::updateUser($id, $role, $status, $newPwd, $name, $email, $department, $webhookUrl);
        jsonResponse($res['success'], null, $res['message'] ?? '');
        break;

    case 'user_delete':
        if (!Auth::isAdmin()) jsonResponse(false, null, t('api.no_admin_perm'));
        $id = (int)($_POST['id'] ?? 0);
        $res = Auth::deleteUser($id);
        jsonResponse($res['success'], null, $res['message'] ?? '');
        break;

    case 'transfer_ownership':
        if (!Auth::isOwner()) jsonResponse(false, null, t('api.users.owner_transfer_only'));
        $targetId = (int)($_POST['target_user_id'] ?? 0);
        $confirmPwd = $_POST['password'] ?? '';
        $res = Auth::transferOwnership($targetId, $confirmPwd);
        jsonResponse($res['success'], null, $res['message'] ?? '');
        break;

    case 'user_handover':
        if (!Auth::isAdmin()) jsonResponse(false, null, t('api.no_admin_perm'));
        $fromId = (int)($_POST['from_user_id'] ?? 0);
        $toId = (int)($_POST['to_user_id'] ?? 0);
        $deact = !empty($_POST['deactivate_from']) ? true : false;
        $res = Auth::handoverUserProjects($fromId, $toId, $deact);
        jsonResponse($res['success'], $res['project_count'] ?? 0, $res['message'] ?? '');
        break;

    case 'pending_user_list':
        if (!Auth::isAdmin()) jsonResponse(false, null, t('api.no_admin_perm'));
        if (($_POST['count_only'] ?? $_GET['count_only'] ?? '') === '1') {
            $count = (int)$db->query('SELECT COUNT(*) FROM users WHERE status = 0')->fetchColumn();
            jsonResponse(true, ['count' => $count]);
        }
        $stmt = $db->query("SELECT id, email, name, email as username, name as display_name, department as apply_remark, department, role, status, created_at FROM users WHERE status = 0 ORDER BY id DESC");
        jsonResponse(true, $stmt->fetchAll());
        break;

    case 'approve_user':
        if (!Auth::isAdmin()) jsonResponse(false, null, t('api.no_admin_perm'));
        $id = (int)($_POST['id'] ?? 0);
        if ($id <= 0) jsonResponse(false, null, t('api.users.invalid_id'));
        $role = trim($_POST['role'] ?? 'viewer');
        if (!in_array($role, ['viewer', 'editor'], true)) {
            $role = 'viewer';
        }
        $stmt = $db->prepare("UPDATE users SET status = 1, role = ? WHERE id = ? AND status = 0");
        $stmt->execute([$role, $id]);
        if ($stmt->rowCount() !== 1) jsonResponse(false, null, t('api.users.apply_handled'));
        $roleLabel = ($role === 'editor' ? t('common.role.editor') : t('common.role.viewer'));
        jsonResponse(true, ['role' => $role, 'role_label' => $roleLabel], t('api.users.approved_msg', ['role' => $roleLabel]));
        break;

    case 'reject_user':
        if (!Auth::isAdmin()) jsonResponse(false, null, t('api.no_admin_perm'));
        $id = (int)($_POST['id'] ?? 0);
        if ($id <= 0) jsonResponse(false, null, t('api.users.invalid_id'));
        $stmt = $db->prepare("DELETE FROM users WHERE id = ? AND status = 0 AND is_owner = 0");
        $stmt->execute([$id]);
        if ($stmt->rowCount() !== 1) jsonResponse(false, null, t('api.users.apply_handled'));
        jsonResponse(true, null, t('api.users.rejected_msg'));
        break;
}
