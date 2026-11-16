<?php
/**
 * 领域服务：系统全局配置、角色权限、审计日志与 Webhook 测试 (System Settings & Logs)
 */
if (!defined('APP_VERSION')) exit;

switch ($action) {
    case 'log_list':
        if (!Auth::isAdmin()) jsonResponse(false, null, '无管理员权限');
        $type = $_GET['type'] ?? 'all';
        $limit = min(max((int)($_GET['limit'] ?? 100), 10), 500);
        $data = [];
        if ($type === 'login' || $type === 'all') {
            $data['login_logs'] = Auth::getLoginLogs($limit);
        }
        if ($type === 'access' || $type === 'all') {
            $data['access_logs'] = Auth::getAccessLogs($limit);
        }
        jsonResponse(true, $data);
        break;

    case 'log_clear':
        if (!Auth::isAdmin()) jsonResponse(false, null, '无管理员权限');
        $clearType = $_POST['type'] ?? 'all';
        $res = Auth::clearLogs($clearType);
        jsonResponse($res, null, $res ? '系统日志已清空' : '清空日志失败');
        break;

    case 'log_workspace_access':
        $itemId = (int)($_POST['item_id'] ?? 0);
        $item = Auth::getItem($itemId);
        if (!$item || !Auth::canViewItem($item)) jsonResponse(false, null, '无权访问此项目');
        $verName = trim($_POST['ver_name'] ?? '');
        Auth::recordAccessLog($itemId, $item['name'], $verName, 'workspace');
        jsonResponse(true);
        break;

    case 'test_webhook':
        if (!Auth::getCurrentUser()) jsonResponse(false, null, '未登录或会话已过期');
        $url = trim($_POST['url'] ?? '');
        if (empty($url)) jsonResponse(false, null, '请输入 Webhook 地址');
        $curUser = Auth::getCurrentUser();
        $res = Webhook::send($url, 'test', [
            'title' => 'Webhook 联通测试',
            'item_name' => '系统测试',
            'author' => !empty($curUser['name']) ? $curUser['name'] : ($curUser['email'] ?? '管理员'),
            'content' => 'Webhook 联通测试正常。',
            'link' => ''
        ]);
        jsonResponse($res['success'], null, $res['success'] ? '测试消息已送达' : ($res['message'] ?? '推送失败'));
        break;

    case 'save_settings':
        if (!Auth::isAdmin()) jsonResponse(false, null, '无管理员权限');
        
        // 先完成所有输入与图片校验，再一次提交配置和新文件引用。
        $updates = [];
        if (isset($_POST['site_title'])) {
            $st = trim($_POST['site_title']);
            if (mb_strlen($st, 'UTF-8') > 20) jsonResponse(false, null, '组织/站点名称不能超过 20 个字符');
            $updates['site_title'] = $st;
        }
        if (isset($_POST['global_webhook_url'])) {
            $gw = trim($_POST['global_webhook_url']);
            if (mb_strlen($gw, 'UTF-8') > 1000) jsonResponse(false, null, '评审群通知 Webhook 地址不能超过 1000 个字符');
            if ($gw !== '' && !Webhook::isAllowedUrl($gw)) {
                jsonResponse(false, null, '仅支持企业微信、飞书或钉钉的 HTTPS Webhook 地址');
            }
            $updates['global_webhook_url'] = $gw;
        }
        if (isset($_POST['visitor_register_enabled'])) {
            $updates['visitor_register_enabled'] = !empty($_POST['visitor_register_enabled']) ? '1' : '0';
        }
        if (isset($_POST['allowed_email_domains'])) {
            $rawD = trim($_POST['allowed_email_domains']);
            if (strlen($rawD) > 200) jsonResponse(false, null, '邮箱域名限制不能超过 200 个字符');
            $domainRegex = '/^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)+$/i';
            foreach (explode(',', str_replace('，', ',', $rawD)) as $d) {
                $d = trim(strtolower($d));
                if ($d === '') continue;
                $d = trim(preg_replace('#^https?://#i', '', $d), '/');
                if (strpos($d, '@') === 0) $d = ltrim($d, '@');
                if ($d === '' || strpos($d, '@') !== false || !preg_match($domainRegex, $d)) {
                    jsonResponse(false, null, '邮箱域名格式不正确，例如 company.com');
                }
            }
            $updates['allowed_email_domains'] = Auth::sanitizeEmailDomains($rawD);
        }
        if (isset($_POST['visitor_notify_admin_ids'])) {
            $updates['visitor_notify_admin_ids'] = json_encode(array_values(array_filter(array_map('intval', (array)$_POST['visitor_notify_admin_ids']))));
        }
        if (isset($_POST['system_timezone'])) {
            $tz = trim($_POST['system_timezone']);
            if (in_array($tz, timezone_identifiers_list(), true)) {
                $updates['system_timezone'] = $tz;
            }
        }
        if (isset($_POST['max_custom_shares_per_item'])) {
            $updates['max_custom_shares_per_item'] = (string)min(99, max(1, (int)$_POST['max_custom_shares_per_item']));
        }
        if (isset($_POST['site_base_url'])) {
            $rawBase = trim((string)$_POST['site_base_url']);
            if (strlen($rawBase) > 200) {
                jsonResponse(false, null, '站点访问地址长度不能超过 200 个字符');
            }
            if ($rawBase === '') {
                $updates['site_base_url'] = '';
            } else {
                try {
                    $normalizedBase = app_normalize_base_url($rawBase);
                } catch (Exception $e) {
                    jsonResponse(false, null, '站点访问地址格式不正确，例如 https://proto.company.com');
                }
                $parsedBase = parse_url($normalizedBase);
                $baseScheme = strtolower($parsedBase['scheme'] ?? '');
                $baseExplicitPort = isset($parsedBase['port']) ? (int)$parsedBase['port'] : null;
                $reqHostRaw = trim((string)($_SERVER['HTTP_HOST'] ?? ''));
                if ($reqHostRaw !== '') {
                    $reqParts = parse_url('http://' . $reqHostRaw);
                    $reqHost = $reqParts['host'] ?? '';
                    $reqPort = isset($reqParts['port']) ? (int)$reqParts['port'] : null;
                    if ($reqHost !== '' && strcasecmp($parsedBase['host'] ?? '', $reqHost) !== 0) {
                        jsonResponse(false, null, '站点访问地址的域名需与当前访问域名一致');
                    }
                    if ($reqPort !== null) {
                        $effectiveBasePort = $baseExplicitPort ?? ($baseScheme === 'https' ? 443 : 80);
                        if ($effectiveBasePort !== $reqPort) {
                            jsonResponse(false, null, '站点访问地址的端口需与当前访问端口一致');
                        }
                    } elseif ($baseExplicitPort !== null && $baseExplicitPort !== ($baseScheme === 'https' ? 443 : 80)) {
                        jsonResponse(false, null, '站点访问地址的端口需与当前访问端口一致');
                    }
                }
                $updates['site_base_url'] = $normalizedBase;
            }
        }
        foreach (['global_watermark_enabled', 'perm_editor_share', 'perm_viewer_download_rp', 'perm_viewer_share'] as $key) {
            if (isset($_POST[$key])) $updates[$key] = !empty($_POST[$key]) ? '1' : '0';
        }
        if (isset($_POST['smtp_enabled'])) {
            $updates['smtp_enabled'] = !empty($_POST['smtp_enabled']) ? '1' : '0';
        }
        if (isset($_POST['smtp_preset'])) {
            $presetKey = trim((string)$_POST['smtp_preset']);
            $presets = Mailer::presets();
            $updates['smtp_preset'] = isset($presets[$presetKey]) ? $presetKey : 'custom';
        }
        if (isset($_POST['smtp_host'])) {
            $smtpHost = trim((string)$_POST['smtp_host']);
            if ($smtpHost !== '' && !Mailer::isValidHost($smtpHost)) {
                jsonResponse(false, null, 'SMTP 服务器地址格式不正确');
            }
            $updates['smtp_host'] = $smtpHost;
        }
        if (isset($_POST['smtp_port'])) {
            $smtpPort = (int)$_POST['smtp_port'];
            if ($smtpPort < 1 || $smtpPort > 65535) {
                jsonResponse(false, null, 'SMTP 端口需在 1 ~ 65535 之间');
            }
            $updates['smtp_port'] = (string)$smtpPort;
        }
        if (isset($_POST['smtp_encryption'])) {
            $smtpEnc = strtolower(trim((string)$_POST['smtp_encryption']));
            $updates['smtp_encryption'] = in_array($smtpEnc, ['ssl', 'tls', 'none'], true) ? $smtpEnc : 'ssl';
        }
        if (isset($_POST['smtp_user'])) {
            $smtpUser = trim(strtolower((string)$_POST['smtp_user']));
            if (strlen($smtpUser) > 100) {
                jsonResponse(false, null, '发信邮箱不能超过 100 个字符');
            }
            if ($smtpUser !== '' && !filter_var($smtpUser, FILTER_VALIDATE_EMAIL)) {
                jsonResponse(false, null, '发信邮箱格式不正确');
            }
            $updates['smtp_user'] = $smtpUser;
        }
        if (isset($_POST['smtp_from_name'])) {
            $fromName = trim((string)$_POST['smtp_from_name']);
            if (mb_strlen($fromName, 'UTF-8') > 40) {
                jsonResponse(false, null, '发件人名称不能超过 40 个字符');
            }
            $updates['smtp_from_name'] = $fromName;
        }
        if (!empty($_POST['smtp_pass_clear']) && $_POST['smtp_pass_clear'] === '1') {
            $updates['smtp_pass_enc'] = '';
        } elseif (isset($_POST['smtp_pass']) && (string)$_POST['smtp_pass'] !== '') {
            $smtpPass = (string)$_POST['smtp_pass'];
            if (strlen($smtpPass) > 128) {
                jsonResponse(false, null, '授权码长度不能超过 128 个字符');
            }
            try {
                $updates['smtp_pass_enc'] = Mailer::encryptSecret($smtpPass);
            } catch (Throwable $e) {
                jsonResponse(false, null, $e->getMessage());
            }
        }
        $savedSmtpHost = Auth::getSetting('smtp_host', '');
        $savedSmtpUser = Auth::getSetting('smtp_user', '');
        $smtpIdentityChanged = strcasecmp($updates['smtp_host'] ?? $savedSmtpHost, $savedSmtpHost) !== 0
            || strcasecmp($updates['smtp_user'] ?? $savedSmtpUser, $savedSmtpUser) !== 0;
        if ($smtpIdentityChanged && !isset($updates['smtp_pass_enc']) && Auth::getSetting('smtp_pass_enc', '') !== '') {
            $updates['smtp_pass_enc'] = '';
            $updates['smtp_enabled'] = '0';
        }
        $effectiveSmtpEnabled = array_key_exists('smtp_enabled', $updates)
            ? $updates['smtp_enabled']
            : Auth::getSetting('smtp_enabled', '0');
        $smtpChanged = array_key_exists('smtp_enabled', $updates) || array_key_exists('site_base_url', $updates);
        foreach (array_keys($updates) as $key) {
            if (strpos($key, 'smtp_') === 0) $smtpChanged = true;
        }
        if ($effectiveSmtpEnabled === '1' && $smtpChanged) {
            $effHost = array_key_exists('smtp_host', $updates) ? $updates['smtp_host'] : Auth::getSetting('smtp_host', '');
            $effPort = (int)(array_key_exists('smtp_port', $updates) ? $updates['smtp_port'] : Auth::getSetting('smtp_port', '465'));
            $effUser = array_key_exists('smtp_user', $updates) ? $updates['smtp_user'] : Auth::getSetting('smtp_user', '');
            $effPassEnc = array_key_exists('smtp_pass_enc', $updates) ? $updates['smtp_pass_enc'] : Auth::getSetting('smtp_pass_enc', '');
            if (!Mailer::isValidHost($effHost) || $effPort < 1 || $effPort > 65535 || !filter_var($effUser, FILTER_VALIDATE_EMAIL)) {
                jsonResponse(false, null, '请先填写完整的 SMTP 服务器、端口与发信邮箱');
            }
            if ($effPassEnc === '' || Mailer::decryptSecret($effPassEnc) === '') {
                jsonResponse(false, null, '请填写邮箱客户端授权码');
            }
            if (Mailer::passwordResetBaseUrl($updates['site_base_url'] ?? null) === '') {
                jsonResponse(false, null, '请先填写 HTTPS 站点访问地址，再启用邮件找回密码');
            }
        }
        if (!empty($_POST['reset_logo'])) {
            $updates['site_logo'] = 'assets/images/logo.png';
        }

        $imageSpecs = [
            'custom_logo' => ['key' => 'site_logo', 'prefix' => 'logo', 'exts' => ['svg', 'png', 'jpg', 'jpeg', 'webp', 'ico']]
        ];
        $images = [];
        foreach ($imageSpecs as $field => $spec) {
            if (!isset($_FILES[$field]) || (int)$_FILES[$field]['error'] === UPLOAD_ERR_NO_FILE) continue;
            $file = $_FILES[$field];
            if ((int)$file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) {
                jsonResponse(false, null, '图片上传失败，请重新选择');
            }
            $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, $spec['exts'], true) || !isSafeUploadedImage($file['tmp_name'], $ext)) {
                jsonResponse(false, null, '图片格式或安全性校验失败，请重新选择');
            }
            $images[$field] = ['tmp' => $file['tmp_name'], 'key' => $spec['key'],
                'path' => 'uploads/branding/' . $spec['prefix'] . '_' . bin2hex(random_bytes(16)) . '.' . $ext];
        }
        $newFiles = [];
        $db = DB::getInstance();
        try {
            $db->beginTransaction();
            $db->exec('UPDATE settings SET key = key WHERE 0');
            $oldImages = [];
            foreach (['site_logo'] as $key) $oldImages[$key] = Auth::getSetting($key, '');
            if ($images && !is_dir(BRANDING_PATH) && !@mkdir(BRANDING_PATH, 0755, true) && !is_dir(BRANDING_PATH)) {
                throw new RuntimeException('无法创建品牌图片目录');
            }
            foreach ($images as $field => $image) {
                $dest = ROOT_PATH . '/' . $image['path'];
                if (!move_uploaded_file($image['tmp'], $dest)) throw new RuntimeException('图片保存失败');
                $newFiles[] = $dest;
                $updates[$image['key']] = $image['path'];
            }
            foreach ($updates as $key => $value) Auth::setSetting($key, $value);
            $activeImages = [];
            foreach (['site_logo'] as $key) $activeImages[] = Auth::getSetting($key, '');
            $db->commit();
            app_configured_base_url(true);
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            foreach ($newFiles as $path) @unlink($path);
            error_log('[protoloft] 设置保存失败: ' . $e->getMessage());
            jsonResponse(false, null, '设置保存失败，请重试');
        }
        // 仅删除已经退役且没有其他配置引用的图片。新文件使用不可变文件名。
        foreach (array_unique($oldImages) as $path) {
            if (preg_match('#^uploads/branding/[a-zA-Z0-9_.-]+$#D', $path) && !in_array($path, $activeImages, true)) {
                if (is_file(ROOT_PATH . '/' . $path) && !@unlink(ROOT_PATH . '/' . $path)) error_log('[protoloft] 退役品牌图片清理失败');
            }
        }

        $smtpPassEncNow = Auth::getSetting('smtp_pass_enc', '');
        $smtpHasPassNow = ($smtpPassEncNow !== '' && Mailer::decryptSecret($smtpPassEncNow) !== '');
        jsonResponse(true, [
            'smtp_has_pass' => $smtpHasPassNow,
            'mail_reset_enabled' => Mailer::isConfiguredAndEnabled()
        ], '企业品牌与系统配置已保存');
        break;

    case 'test_smtp':
        if (!Auth::isAdmin()) jsonResponse(false, null, '无管理员权限');
        $toEmail = trim(strtolower((string)($_POST['to_email'] ?? '')));
        if ($toEmail === '' || !filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
            jsonResponse(false, null, '请输入有效的测试收件邮箱');
        }
        $host = trim((string)($_POST['smtp_host'] ?? Auth::getSetting('smtp_host', '')));
        $port = (int)($_POST['smtp_port'] ?? Auth::getSetting('smtp_port', '465'));
        $enc = strtolower(trim((string)($_POST['smtp_encryption'] ?? Auth::getSetting('smtp_encryption', 'ssl'))));
        $user = trim(strtolower((string)($_POST['smtp_user'] ?? Auth::getSetting('smtp_user', ''))));
        $fromName = trim((string)($_POST['smtp_from_name'] ?? Auth::getSetting('smtp_from_name', '')));
        $pass = (string)($_POST['smtp_pass'] ?? '');
        if ($pass === '') {
            $storedSmtp = Mailer::getRuntimeConfig();
            if ($storedSmtp && strcasecmp($host, $storedSmtp['host']) === 0
                && strcasecmp($user, $storedSmtp['user']) === 0) {
                $pass = $storedSmtp['pass'];
            }
        }
        if (!Mailer::isValidHost($host) || $port < 1 || $port > 65535) {
            jsonResponse(false, null, '请先填写正确的 SMTP 服务器与端口');
        }
        if (!filter_var($user, FILTER_VALIDATE_EMAIL)) {
            jsonResponse(false, null, '请先填写正确的发信邮箱');
        }
        if ($pass === '') {
            jsonResponse(false, null, '请先填写邮箱客户端授权码');
        }
        $curUser = Auth::getCurrentUser();
        $res = Mailer::sendTest(
            $toEmail,
            [
                'host' => $host,
                'port' => $port,
                'encryption' => in_array($enc, ['ssl', 'tls', 'none'], true) ? $enc : 'ssl',
                'user' => $user,
                'pass' => $pass,
                'from_name' => $fromName,
            ],
            Auth::getCompanyDisplayName(),
            (string)($curUser['name'] ?? '')
        );
        jsonResponse($res['success'], null, $res['success'] ? '测试邮件已发送，请查收' : ($res['message'] ?? '发送失败'));
        break;

    case 'save_role_permissions':
        if (!Auth::isAdmin()) jsonResponse(false, null, '无管理员权限');

        // 1. 角色权限标准白名单矩阵 (系统唯一真理源)
        $permKeys = ['perm_editor_share', 'perm_viewer_download_rp', 'perm_viewer_share', 'perm_guest_download_rp', 'perm_guest_annotate'];
        foreach ($permKeys as $pk) {
            if (isset($_POST[$pk])) {
                Auth::setSetting($pk, !empty($_POST[$pk]) ? '1' : '0');
            }
        }

        jsonResponse(true, null, '角色权限配置已保存生效');
        break;
}
