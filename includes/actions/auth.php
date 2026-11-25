<?php
/**
 * 领域服务：认证与个人中心 (Authentication & Profile)
 */
if (!defined('APP_VERSION')) exit;

switch ($action) {
    case 'login':
        $email = trim($_POST['email'] ?? ($_POST['username'] ?? ''));
        $password = $_POST['password'] ?? '';
        $rememberMe = isset($_POST['remember_me']) ? (!empty($_POST['remember_me']) && $_POST['remember_me'] !== '0' && $_POST['remember_me'] !== 'false') : true;
        $res = Auth::login($email, $password, $rememberMe);
        jsonResponse($res['success'], $res['user'] ?? null, $res['message'] ?? '');
        break;

    case 'logout':
        Auth::logout();
        jsonResponse(true, null, '已成功登出');
        break;

    case 'get_session':
        $user = Auth::getCurrentUser();
        $rawSiteTitle = trim(Auth::getSetting('site_title', ''));
        $effectiveTitle = (!empty($rawSiteTitle) && $rawSiteTitle !== '立象原型' && $rawSiteTitle !== '立象原型托管平台' && strcasecmp($rawSiteTitle, 'ProtoLoft') !== 0) ? ($rawSiteTitle . ' · 立象原型') : '立象原型';
        jsonResponse(true, [
            'user' => $user,
            'csrfToken' => get_csrf_token(),
            'isAdmin' => Auth::isAdmin(),
            'isOwner' => Auth::isOwner(),
            'canManage' => Auth::canManage(),
            'isViewer' => Auth::isViewer(),
            'canAnnotate' => Auth::canAnnotate(),
            'siteTitle' => $effectiveTitle,
            'visitorRegisterEnabled' => Auth::getSetting('visitor_register_enabled', '1') !== '0',
            'allowedEmailDomains' => Auth::getSetting('allowed_email_domains', ''),
            'mailResetEnabled' => Mailer::isConfiguredAndEnabled()
        ]);
        break;

    case 'profile_update':
        if (!Auth::getCurrentUser()) jsonResponse(false, null, '未登录或会话已过期');
        $name = trim($_POST['name'] ?? ($_POST['display_name'] ?? ''));
        if (!empty($_POST['webhook_url']) && !Webhook::isAllowedUrl($_POST['webhook_url'])) jsonResponse(false, null, '请使用企微、飞书或钉钉的 HTTPS 机器人地址');
        $res = Auth::updateMyProfile($name);
        if (!$res['success']) {
            jsonResponse(false, null, $res['message'] ?? '保存失败');
        }
        if (isset($_POST['webhook_url'])) {
            $wb = trim($_POST['webhook_url']);
            $hookResult = Auth::updateMyWebhook($wb);
            if (!$hookResult['success']) jsonResponse(false, null, $hookResult['message']);
        }
        jsonResponse(true, ['name' => $res['name'] ?? $name], '个人资料已保存');
        break;

    case 'profile_update_webhook':
        if (!Auth::getCurrentUser()) jsonResponse(false, null, '未登录或会话已过期');
        $wb = trim($_POST['webhook_url'] ?? '');
        $res = Auth::updateMyWebhook($wb);
        jsonResponse($res['success'], $res['webhook_url'] ?? '', $res['success'] ? '个人通知机器人已保存' : ($res['message'] ?? '保存失败'));
        break;

    case 'profile_update_avatar':
        if (!Auth::getCurrentUser()) jsonResponse(false, null, '未登录或会话已过期');
        $avatar = trim($_POST['avatar'] ?? '');
        $res = Auth::updateMyAvatar($avatar);
        jsonResponse($res['success'], $res['success'] ? ['avatar' => $res['avatar']] : null, $res['success'] ? '个人头像已更新' : ($res['message'] ?? '保存失败'));
        break;

    case 'change_my_password':
        if (!Auth::getCurrentUser()) jsonResponse(false, null, '未登录或会话已过期');
        $old = $_POST['old_password'] ?? '';
        $new = $_POST['new_password'] ?? '';
        $confirm = $_POST['confirm_password'] ?? '';
        if (!is_string($old) || $old === '') jsonResponse(false, null, '请输入当前密码');
        if (empty($new)) jsonResponse(false, null, '请输入新密码');
        if ($new !== $confirm) jsonResponse(false, null, '两次输入的新密码不一致');
        $res = Auth::changeMyPassword($old, $new);
        jsonResponse($res['success'], null, $res['message'] ?? '');
        break;

    case 'dismiss_first_login':
        if (!Auth::getCurrentUser()) jsonResponse(false, null, '未登录');
        $res = Auth::dismissFirstLoginTip();
        jsonResponse($res['success'], null, $res['message'] ?? '');
        break;

    case 'register_visitor':
        if (!Auth::checkThrottle('register_visitor', 5, 900)) {
            jsonResponse(false, null, '申请过于频繁，请稍后再试');
        }
        if (Auth::getSetting('visitor_register_enabled', '1') === '0') {
            jsonResponse(false, null, '当前系统未开放自主注册，请联系管理员分配账号');
        }

        $email = trim(strtolower($_POST['email'] ?? ''));
        $name = trim($_POST['name'] ?? ($_POST['display_name'] ?? ''));
        $p = $_POST['password'] ?? '';
        $department = trim($_POST['department'] ?? ($_POST['apply_remark'] ?? ''));
        $requestedRole = trim((string)($_POST['role'] ?? 'viewer'));
        if (!in_array($requestedRole, ['viewer', 'editor'], true)) {
            $requestedRole = 'viewer';
        }
        $requestedRoleLabel = ($requestedRole === 'editor') ? '协作者' : '审阅人';

        if (strpos($email, '@') === false && !empty($email)) {
            $allowedDomains = Auth::getSetting('allowed_email_domains', '');
            if (!empty(trim($allowedDomains))) {
                $domains = array_filter(array_map('trim', explode(',', strtolower($allowedDomains))));
                if (count($domains) === 1) {
                    $email = $email . '@' . reset($domains);
                }
            }
        }

        if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            jsonResponse(false, null, '请输入有效的工作邮箱地址');
        }
        if (strlen($email) > 100) {
            jsonResponse(false, null, '邮箱长度不能超过 100 位');
        }
        if (empty($name)) {
            jsonResponse(false, null, '请输入您的真实姓名');
        }
        if (mb_strlen($name, 'UTF-8') > 20) {
            jsonResponse(false, null, '姓名不能超过 20 个字符');
        }
        $passwordError = app_password_length_error($p);
        if ($passwordError !== '') {
            jsonResponse(false, null, $passwordError);
        }
        if (mb_strlen($department, 'UTF-8') > 30) {
            jsonResponse(false, null, '部门/备注不能超过 30 个字符');
        }

        $allowedDomains = Auth::getSetting('allowed_email_domains', '');
        if (!empty(trim($allowedDomains))) {
            $allowedArr = array_filter(array_map('trim', explode(',', strtolower($allowedDomains))));
            $parts = explode('@', strtolower($email));
            $domain = end($parts);
            if (!in_array($domain, $allowedArr, true)) {
                jsonResponse(false, null, '当前系统仅限企业邮箱注册，允许的后缀为：@' . implode(', @', $allowedArr));
            }
        }

        $existingUser = DB::row("SELECT id, status FROM users WHERE email = ?", [$email]);
        if ($existingUser) {
            jsonResponse(false, null, '该邮箱已提交申请或已存在账号，如有疑问请直接登录或联系管理员');
        }

        $pHash = password_hash($p, PASSWORD_DEFAULT);
        $defaultAvatar = Auth::pickRandomAvatar();
        $stmt = $db->prepare("INSERT INTO users (email, name, password_hash, role, is_owner, status, department, avatar) VALUES (?, ?, ?, ?, 0, 0, ?, ?)");
        $stmt->execute([$email, $name, $pHash, $requestedRole, $department, $defaultAvatar]);
        $newId = (int)$db->lastInsertId();
        Auth::hitThrottle('register_visitor', 900);

        // 异步推送到管理员个人通知机器人 (区分冷启动未设置与管理员明确清空)
        try {
            $rawAdminIds = Auth::getSetting('visitor_notify_admin_ids', null);
            if ($rawAdminIds === null) {
                // 冷启动未设置时：默认通知全体正常管理员
                $adminStmt = $db->query("SELECT webhook_url FROM users WHERE role = 'admin' AND status = 1");
                $targetHooks = $adminStmt->fetchAll(PDO::FETCH_COLUMN);
            } else {
                $savedAdminIds = json_decode($rawAdminIds, true);
                if (empty($savedAdminIds) || !is_array($savedAdminIds)) {
                    // 管理员明确清空接收人：不发送任何审批通知
                    $targetHooks = [];
                } else {
                    $placeholders = implode(',', array_fill(0, count($savedAdminIds), '?'));
                    $adminStmt = $db->prepare("SELECT webhook_url FROM users WHERE id IN ($placeholders) AND role = 'admin' AND status = 1");
                    $adminStmt->execute($savedAdminIds);
                    $targetHooks = $adminStmt->fetchAll(PDO::FETCH_COLUMN);
                }
            }
            $applyFields = [
                '申请角色' => $requestedRoleLabel,
            ];
            if ($department !== '') {
                $applyFields['部门或职务'] = $department;
            }
            $applyContent = "申请角色：{$requestedRoleLabel}" . ($department ? "\n部门或职务：{$department}" : "");
            foreach ($targetHooks as $wb) {
                $wb = trim((string)$wb);
                if (!empty($wb)) {
                    Webhook::send($wb, 'user_apply', [
                        'title' => '新成员申请待审批',
                        'item_name' => '立象原型',
                        'author' => $name . " ({$email})",
                        'fields' => $applyFields,
                        'content' => $applyContent,
                        'link' => app_url('index.php#admin=users&sub=pending')
                    ]);
                }
            }
        } catch (Exception $e) {
            error_log('register_visitor webhook: ' . $e->getMessage());
        }

        jsonResponse(true, ['id' => $newId], '申请已提交，等待管理员审核后即可登录');
        break;

    case 'request_password_reset':
        $email = $_POST['email'] ?? '';
        $res = Auth::preparePasswordReset(is_string($email) ? $email : '');
        jsonResponse($res['success'], null, $res['message'], $res['send'] ?? null);
        break;

    case 'validate_password_reset':
        header('Cache-Control: no-store');
        $token = $_POST['token'] ?? '';
        $info = Auth::verifyPasswordResetToken(is_string($token) ? trim($token) : '');
        jsonResponse($info['valid'], $info['valid'] ? ['masked_email' => $info['masked_email']] : null, $info['message'] ?? '');
        break;

    case 'reset_password':
        $token = $_POST['token'] ?? '';
        $new = $_POST['new_password'] ?? '';
        $confirm = $_POST['confirm_password'] ?? '';
        if (!is_string($new) || $new === '') jsonResponse(false, null, '请输入新密码');
        if ($new !== $confirm) jsonResponse(false, null, '两次输入的新密码不一致');
        $res = Auth::resetPasswordByToken(is_string($token) ? trim($token) : '', $new);
        if (!empty($res['success']) && Auth::getCurrentUser()) {
            Auth::logout();
        }
        jsonResponse($res['success'], !empty($res['success']) ? ['email' => $res['email'] ?? ''] : null, $res['message'] ?? '');
        break;
}
