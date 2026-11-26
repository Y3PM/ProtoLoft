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
        jsonResponse(true, null, t('api.logged_out'));
        break;

    case 'get_session':
        $user = Auth::getCurrentUser();
        $rawSiteTitle = trim(Auth::getSetting('site_title', ''));
        $effectiveTitle = (!empty($rawSiteTitle) && $rawSiteTitle !== '立象原型' && $rawSiteTitle !== '立象原型托管平台' && strcasecmp($rawSiteTitle, 'ProtoLoft') !== 0)
            ? t('brand.with_company', ['company' => $rawSiteTitle])
            : I18n::brandName();
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
        if (!Auth::getCurrentUser()) jsonResponse(false, null, t('api.not_logged_in_or_expired'));
        $name = trim($_POST['name'] ?? ($_POST['display_name'] ?? ''));
        if (!empty($_POST['webhook_url']) && !Webhook::isAllowedUrl($_POST['webhook_url'])) jsonResponse(false, null, t('webhook.err_url'));
        $res = Auth::updateMyProfile($name);
        if (!$res['success']) {
            jsonResponse(false, null, $res['message'] ?? t('common.save_failed'));
        }
        if (isset($_POST['webhook_url'])) {
            $wb = trim($_POST['webhook_url']);
            $hookResult = Auth::updateMyWebhook($wb);
            if (!$hookResult['success']) jsonResponse(false, null, $hookResult['message']);
        }
        jsonResponse(true, ['name' => $res['name'] ?? $name], t('profile.saved'));
        break;

    case 'profile_update_webhook':
        if (!Auth::getCurrentUser()) jsonResponse(false, null, t('api.not_logged_in_or_expired'));
        $wb = trim($_POST['webhook_url'] ?? '');
        $res = Auth::updateMyWebhook($wb);
        jsonResponse($res['success'], $res['webhook_url'] ?? '', $res['success'] ? t('api.auth.personal_bot_saved') : ($res['message'] ?? t('common.save_failed')));
        break;

    case 'profile_update_avatar':
        if (!Auth::getCurrentUser()) jsonResponse(false, null, t('api.not_logged_in_or_expired'));
        $avatar = trim($_POST['avatar'] ?? '');
        $res = Auth::updateMyAvatar($avatar);
        jsonResponse($res['success'], $res['success'] ? ['avatar' => $res['avatar']] : null, $res['success'] ? t('api.auth.avatar_updated') : ($res['message'] ?? t('common.save_failed')));
        break;

    case 'change_my_password':
        if (!Auth::getCurrentUser()) jsonResponse(false, null, t('api.not_logged_in_or_expired'));
        $old = $_POST['old_password'] ?? '';
        $new = $_POST['new_password'] ?? '';
        $confirm = $_POST['confirm_password'] ?? '';
        if (!is_string($old) || $old === '') jsonResponse(false, null, t('api.auth.enter_old_pwd'));
        if (empty($new)) jsonResponse(false, null, t('api.auth.enter_new_pwd'));
        if ($new !== $confirm) jsonResponse(false, null, t('auth.password_mismatch'));
        $res = Auth::changeMyPassword($old, $new);
        jsonResponse($res['success'], null, $res['message'] ?? '');
        break;

    case 'dismiss_first_login':
        if (!Auth::getCurrentUser()) jsonResponse(false, null, t('api.not_logged_in'));
        $res = Auth::dismissFirstLoginTip();
        jsonResponse($res['success'], null, $res['message'] ?? '');
        break;

    case 'register_visitor':
        if (!Auth::checkThrottle('register_visitor', 5, 900)) {
            jsonResponse(false, null, t('api.auth.apply_throttle'));
        }
        if (Auth::getSetting('visitor_register_enabled', '1') === '0') {
            jsonResponse(false, null, t('api.auth.reg_closed'));
        }

        $email = trim(strtolower($_POST['email'] ?? ''));
        $name = trim($_POST['name'] ?? ($_POST['display_name'] ?? ''));
        $p = $_POST['password'] ?? '';
        $department = trim($_POST['department'] ?? ($_POST['apply_remark'] ?? ''));
        $requestedRole = trim((string)($_POST['role'] ?? 'viewer'));
        if (!in_array($requestedRole, ['viewer', 'editor'], true)) {
            $requestedRole = 'viewer';
        }
        $requestedRoleLabel = ($requestedRole === 'editor') ? t('common.role.editor') : t('common.role.viewer');

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
            jsonResponse(false, null, t('api.auth.invalid_email'));
        }
        if (strlen($email) > 100) {
            jsonResponse(false, null, t('api.auth.email_len_100_reg'));
        }
        if (empty($name)) {
            jsonResponse(false, null, t('api.auth.name_empty_reg'));
        }
        if (mb_strlen($name, 'UTF-8') > 20) {
            jsonResponse(false, null, t('api.auth.name_len_20'));
        }
        $passwordError = app_password_length_error($p);
        if ($passwordError !== '') {
            jsonResponse(false, null, $passwordError);
        }
        if (mb_strlen($department, 'UTF-8') > 30) {
            jsonResponse(false, null, t('api.auth.dept_len_30'));
        }

        $allowedDomains = Auth::getSetting('allowed_email_domains', '');
        if (!empty(trim($allowedDomains))) {
            $allowedArr = array_filter(array_map('trim', explode(',', strtolower($allowedDomains))));
            $parts = explode('@', strtolower($email));
            $domain = end($parts);
            if (!in_array($domain, $allowedArr, true)) {
                jsonResponse(false, null, t('api.auth.domain_restricted', ['domains' => '@' . implode(', @', $allowedArr)]));
            }
        }

        $existingUser = DB::row("SELECT id, status FROM users WHERE email = ?", [$email]);
        if ($existingUser) {
            jsonResponse(false, null, t('api.auth.email_already_exists'));
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
                t('api.auth.apply_field_role') => $requestedRoleLabel,
            ];
            if ($department !== '') {
                $applyFields[t('api.auth.apply_field_dept')] = $department;
            }
            $applyContent = t('api.auth.apply_content_role', ['role' => $requestedRoleLabel]) . ($department ? "\n" . t('api.auth.apply_content_dept', ['dept' => $department]) : "");
            foreach ($targetHooks as $wb) {
                $wb = trim((string)$wb);
                if (!empty($wb)) {
                    Webhook::send($wb, 'user_apply', [
                        'title' => t('webhook.ev_visitor_apply'),
                        'item_name' => I18n::brandName(),
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

        jsonResponse(true, ['id' => $newId], t('auth.apply_submitted'));
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
        if (!is_string($new) || $new === '') jsonResponse(false, null, t('api.auth.enter_new_pwd'));
        if ($new !== $confirm) jsonResponse(false, null, t('auth.password_mismatch'));
        $res = Auth::resetPasswordByToken(is_string($token) ? trim($token) : '', $new);
        if (!empty($res['success']) && Auth::getCurrentUser()) {
            Auth::logout();
        }
        jsonResponse($res['success'], !empty($res['success']) ? ['email' => $res['email'] ?? ''] : null, $res['message'] ?? '');
        break;
}
