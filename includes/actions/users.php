<?php
/**
 * 领域服务：成员管理、审批与协同交接 (Users & Collaboration)
 */
if (!defined('APP_VERSION')) exit;

switch ($action) {
    case 'user_list':
        if (!Auth::canManage()) jsonResponse(false, null, '未登录或权限不足');
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
        if (!Auth::isAdmin()) jsonResponse(false, null, '无管理员权限');
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
        if (!Auth::isAdmin()) jsonResponse(false, null, '无管理员权限');
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
        if (!Auth::isAdmin()) jsonResponse(false, null, '无管理员权限');
        $id = (int)($_POST['id'] ?? 0);
        $res = Auth::deleteUser($id);
        jsonResponse($res['success'], null, $res['message'] ?? '');
        break;

    case 'transfer_ownership':
        if (!Auth::isOwner()) jsonResponse(false, null, '仅主超级管理员有权移交所有权');
        $targetId = (int)($_POST['target_user_id'] ?? 0);
        $confirmPwd = $_POST['password'] ?? '';
        $res = Auth::transferOwnership($targetId, $confirmPwd);
        jsonResponse($res['success'], null, $res['message'] ?? '');
        break;

    case 'user_handover':
        if (!Auth::isAdmin()) jsonResponse(false, null, '无管理员权限');
        $fromId = (int)($_POST['from_user_id'] ?? 0);
        $toId = (int)($_POST['to_user_id'] ?? 0);
        $deact = !empty($_POST['deactivate_from']) ? true : false;
        $res = Auth::handoverUserProjects($fromId, $toId, $deact);
        jsonResponse($res['success'], $res['project_count'] ?? 0, $res['message'] ?? '');
        break;

    case 'pending_user_list':
        if (!Auth::isAdmin()) jsonResponse(false, null, '无管理员权限');
        if (($_POST['count_only'] ?? $_GET['count_only'] ?? '') === '1') {
            $count = (int)$db->query('SELECT COUNT(*) FROM users WHERE status = 0')->fetchColumn();
            jsonResponse(true, ['count' => $count]);
        }
        $stmt = $db->query("SELECT id, email, name, email as username, name as display_name, department as apply_remark, department, role, status, created_at FROM users WHERE status = 0 ORDER BY id DESC");
        jsonResponse(true, $stmt->fetchAll());
        break;

    case 'approve_user':
        if (!Auth::isAdmin()) jsonResponse(false, null, '无管理员权限');
        $id = (int)($_POST['id'] ?? 0);
        if ($id <= 0) jsonResponse(false, null, '无效的用户 ID');
        $role = trim($_POST['role'] ?? 'viewer');
        if (!in_array($role, ['viewer', 'editor'], true)) {
            $role = 'viewer';
        }
        $stmt = $db->prepare("UPDATE users SET status = 1, role = ? WHERE id = ? AND status = 0");
        $stmt->execute([$role, $id]);
        if ($stmt->rowCount() !== 1) jsonResponse(false, null, '申请不存在或已处理');
        $roleLabel = ($role === 'editor' ? '协作者' : '审阅人');
        jsonResponse(true, ['role' => $role, 'role_label' => $roleLabel], "已成功批准该用户入驻（角色：{$roleLabel}）");
        break;

    case 'reject_user':
        if (!Auth::isAdmin()) jsonResponse(false, null, '无管理员权限');
        $id = (int)($_POST['id'] ?? 0);
        if ($id <= 0) jsonResponse(false, null, '无效的用户 ID');
        $stmt = $db->prepare("DELETE FROM users WHERE id = ? AND status = 0 AND is_owner = 0");
        $stmt->execute([$id]);
        if ($stmt->rowCount() !== 1) jsonResponse(false, null, '申请不存在或已处理');
        jsonResponse(true, null, '已驳回该用户的申请');
        break;
}
