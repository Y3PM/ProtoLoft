<?php
/**
 * 领域服务：系统全局配置、角色权限、审计日志与 Webhook 测试 (System Settings & Logs)
 */
if (!defined('APP_VERSION')) exit;

switch ($action) {
    case 'log_list':
        if (!Auth::isAdmin()) jsonResponse(false, null, t('api.no_admin_perm'));
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
        if (!Auth::isAdmin()) jsonResponse(false, null, t('api.no_admin_perm'));
        $clearType = $_POST['type'] ?? 'all';
        $res = Auth::clearLogs($clearType);
        jsonResponse($res, null, $res ? t('api.sys.logs_cleared') : t('api.sys.logs_clear_fail'));
        break;

    case 'log_workspace_access':
        $itemId = (int)($_POST['item_id'] ?? 0);
        $item = Auth::getItem($itemId);
        if (!$item || !Auth::canViewItem($item)) jsonResponse(false, null, t('api.cannot_view_item'));
        $verName = trim($_POST['ver_name'] ?? '');
        Auth::recordAccessLog($itemId, $item['name'], $verName, 'workspace');
        jsonResponse(true);
        break;

    case 'test_webhook':
        if (!Auth::getCurrentUser()) jsonResponse(false, null, t('api.not_logged_in_or_expired'));
        $url = trim($_POST['url'] ?? '');
        if (empty($url)) jsonResponse(false, null, t('profile.enter_webhook'));
        $curUser = Auth::getCurrentUser();
        $res = Webhook::send($url, 'test', [
            'title' => t('api.sys.webhook_test_title'),
            'item_name' => t('api.sys.webhook_test_item'),
            'author' => !empty($curUser['name']) ? $curUser['name'] : ($curUser['email'] ?? t('common.role.admin')),
            'content' => t('api.sys.webhook_test_body'),
            'link' => ''
        ]);
        jsonResponse($res['success'], null, $res['success'] ? t('profile.webhook_test_ok') : ($res['message'] ?? t('api.sys.webhook_push_fail')));
        break;

    case 'save_settings':
        if (!Auth::isAdmin()) jsonResponse(false, null, t('api.no_admin_perm'));
        
        // 先完成所有输入与图片校验，再一次提交配置和新文件引用。
        $updates = [];
        if (isset($_POST['site_title'])) {
            $st = trim($_POST['site_title']);
            if (mb_strlen($st, 'UTF-8') > 20) jsonResponse(false, null, t('api.sys.site_title_len'));
            $updates['site_title'] = $st;
        }
        if (isset($_POST['global_webhook_url'])) {
            $gw = trim($_POST['global_webhook_url']);
            if (mb_strlen($gw, 'UTF-8') > 1000) jsonResponse(false, null, t('api.sys.global_webhook_len'));
            if ($gw !== '' && !Webhook::isAllowedUrl($gw)) {
                jsonResponse(false, null, t('api.sys.webhook_https_only'));
            }
            $updates['global_webhook_url'] = $gw;
        }
        if (isset($_POST['visitor_register_enabled'])) {
            $updates['visitor_register_enabled'] = !empty($_POST['visitor_register_enabled']) ? '1' : '0';
        }
        if (isset($_POST['allowed_email_domains'])) {
            $rawD = trim($_POST['allowed_email_domains']);
            if (strlen($rawD) > 200) jsonResponse(false, null, t('api.sys.domains_len'));
            $domainRegex = '/^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)+$/i';
            foreach (explode(',', str_replace('，', ',', $rawD)) as $d) {
                $d = trim(strtolower($d));
                if ($d === '') continue;
                $d = trim(preg_replace('#^https?://#i', '', $d), '/');
                if (strpos($d, '@') === 0) $d = ltrim($d, '@');
                if ($d === '' || strpos($d, '@') !== false || !preg_match($domainRegex, $d)) {
                    jsonResponse(false, null, t('api.sys.domains_fmt'));
                }
            }
            $updates['allowed_email_domains'] = Auth::sanitizeEmailDomains($rawD);
        }
        if (isset($_POST['visitor_notify_admin_ids'])) {
            $updates['visitor_notify_admin_ids'] = json_encode(array_values(array_filter(array_map('intval', (array)$_POST['visitor_notify_admin_ids']))));
        }
        if (isset($_POST['system_language'])) {
            $lang = trim((string)$_POST['system_language']);
            if (!I18n::isValidLocale($lang)) {
                jsonResponse(false, null, t('api.sys.invalid_language'));
            }
            $updates['system_language'] = $lang;
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
                jsonResponse(false, null, t('api.sys.base_url_len'));
            }
            if ($rawBase === '') {
                $updates['site_base_url'] = '';
            } else {
                try {
                    $normalizedBase = app_normalize_base_url($rawBase);
                } catch (Exception $e) {
                    jsonResponse(false, null, t('api.sys.base_url_fmt'));
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
                        jsonResponse(false, null, t('api.sys.base_url_host'));
                    }
                    if ($reqPort !== null) {
                        $effectiveBasePort = $baseExplicitPort ?? ($baseScheme === 'https' ? 443 : 80);
                        if ($effectiveBasePort !== $reqPort) {
                            jsonResponse(false, null, t('api.sys.base_url_port'));
                        }
                    } elseif ($baseExplicitPort !== null && $baseExplicitPort !== ($baseScheme === 'https' ? 443 : 80)) {
                        jsonResponse(false, null, t('api.sys.base_url_port'));
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
                jsonResponse(false, null, t('api.sys.smtp_host_fmt'));
            }
            $updates['smtp_host'] = $smtpHost;
        }
        if (isset($_POST['smtp_port'])) {
            $smtpPort = (int)$_POST['smtp_port'];
            if ($smtpPort < 1 || $smtpPort > 65535) {
                jsonResponse(false, null, t('api.sys.smtp_port_range'));
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
                jsonResponse(false, null, t('api.sys.smtp_user_len'));
            }
            if ($smtpUser !== '' && !filter_var($smtpUser, FILTER_VALIDATE_EMAIL)) {
                jsonResponse(false, null, t('api.sys.smtp_user_fmt'));
            }
            $updates['smtp_user'] = $smtpUser;
        }
        if (isset($_POST['smtp_from_name'])) {
            $fromName = trim((string)$_POST['smtp_from_name']);
            if (mb_strlen($fromName, 'UTF-8') > 40) {
                jsonResponse(false, null, t('api.sys.smtp_from_len'));
            }
            $updates['smtp_from_name'] = $fromName;
        }
        if (!empty($_POST['smtp_pass_clear']) && $_POST['smtp_pass_clear'] === '1') {
            $updates['smtp_pass_enc'] = '';
        } elseif (isset($_POST['smtp_pass']) && (string)$_POST['smtp_pass'] !== '') {
            $smtpPass = (string)$_POST['smtp_pass'];
            if (strlen($smtpPass) > 128) {
                jsonResponse(false, null, t('api.sys.smtp_pass_len'));
            }
            try {
                $updates['smtp_pass_enc'] = Mailer::encryptSecret($smtpPass);
            } catch (Throwable $e) {
                jsonResponse(false, null, $e->getMessage());
            }
        }
        $smtpChanged = array_key_exists('smtp_enabled', $updates) || array_key_exists('site_base_url', $updates);
        foreach (array_keys($updates) as $key) {
            if (strpos($key, 'smtp_') === 0) $smtpChanged = true;
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
                jsonResponse(false, null, t('api.sys.img_upload_fail'));
            }
            $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, $spec['exts'], true) || !isSafeUploadedImage($file['tmp_name'], $ext)) {
                jsonResponse(false, null, t('api.sys.img_sec_fail'));
            }
            $images[$field] = ['tmp' => $file['tmp_name'], 'key' => $spec['key'],
                'path' => 'uploads/branding/' . $spec['prefix'] . '_' . bin2hex(random_bytes(16)) . '.' . $ext];
        }
        $newFiles = [];
        $db = DB::getInstance();
        try {
            $db->beginTransaction();
            $db->exec('UPDATE settings SET key = key WHERE 0');
            if ($smtpChanged) {
                $savedSmtp = [
                    'host' => Auth::getSetting('smtp_host', ''),
                    'port' => Auth::getSetting('smtp_port', '465'),
                    'encryption' => Auth::getSetting('smtp_encryption', 'ssl'),
                    'user' => Auth::getSetting('smtp_user', ''),
                ];
                $host = $updates['smtp_host'] ?? $savedSmtp['host'];
                $port = (int)($updates['smtp_port'] ?? $savedSmtp['port']);
                $encryption = $updates['smtp_encryption'] ?? $savedSmtp['encryption'];
                $user = $updates['smtp_user'] ?? $savedSmtp['user'];
                $savedPass = Auth::getSetting('smtp_pass_enc', '');
                if ($savedPass !== '' && empty($updates['smtp_pass_enc'])
                    && !Mailer::matchesSmtpIdentity($savedSmtp, $host, $port, $encryption, $user)) {
                    $updates['smtp_pass_enc'] = '';
                    $updates['smtp_enabled'] = '0';
                }
                if (($updates['smtp_enabled'] ?? Auth::getSetting('smtp_enabled', '0')) === '1') {
                    if (!Mailer::isValidHost($host) || $port < 1 || $port > 65535 || !filter_var($user, FILTER_VALIDATE_EMAIL)) {
                        throw new DomainException(t('api.sys.smtp_incomplete'));
                    }
                    if (Mailer::decryptSecret($updates['smtp_pass_enc'] ?? $savedPass) === '') {
                        throw new DomainException(t('api.sys.smtp_need_pass'));
                    }
                    if (Mailer::passwordResetBaseUrl($updates['site_base_url'] ?? null) === '') {
                        throw new DomainException(t('api.sys.smtp_need_https_base'));
                    }
                }
            }
            $oldImages = [];
            foreach (['site_logo'] as $key) $oldImages[$key] = Auth::getSetting($key, '');
            if ($images && !is_dir(BRANDING_PATH) && !@mkdir(BRANDING_PATH, 0755, true) && !is_dir(BRANDING_PATH)) {
                throw new RuntimeException(t('api.sys.branding_dir_fail'));
            }
            foreach ($images as $field => $image) {
                $dest = ROOT_PATH . '/' . $image['path'];
                if (!move_uploaded_file($image['tmp'], $dest)) throw new RuntimeException(t('api.sys.img_save_fail'));
                $newFiles[] = $dest;
                $updates[$image['key']] = $image['path'];
            }
            foreach ($updates as $key => $value) Auth::setSetting($key, $value);
            $db->commit();
            if (isset($updates['system_language'])) {
                I18n::setLocale($updates['system_language']);
            }
            $activeImages = [];
            foreach (['site_logo'] as $key) $activeImages[] = Auth::getSetting($key, '');
            app_configured_base_url(true);
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            foreach ($newFiles as $path) @unlink($path);
            if ($e instanceof DomainException) throw $e;
            error_log('[protoloft] 设置保存失败: ' . $e->getMessage());
            jsonResponse(false, null, t('api.sys.save_fail'));
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
            'mail_reset_enabled' => Mailer::isConfiguredAndEnabled(),
            'system_language' => I18n::getLocale()
        ], t('api.sys.save_ok'));
        break;

    case 'test_smtp':
        if (!Auth::isAdmin()) jsonResponse(false, null, t('api.no_admin_perm'));
        $toEmail = trim(strtolower((string)($_POST['to_email'] ?? '')));
        if ($toEmail === '' || !filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
            jsonResponse(false, null, t('api.sys.test_email_invalid'));
        }
        $host = trim((string)($_POST['smtp_host'] ?? Auth::getSetting('smtp_host', '')));
        $port = (int)($_POST['smtp_port'] ?? Auth::getSetting('smtp_port', '465'));
        $enc = strtolower(trim((string)($_POST['smtp_encryption'] ?? Auth::getSetting('smtp_encryption', 'ssl'))));
        if (!in_array($enc, ['ssl', 'tls', 'none'], true)) $enc = 'ssl';
        $user = trim(strtolower((string)($_POST['smtp_user'] ?? Auth::getSetting('smtp_user', ''))));
        $fromName = trim((string)($_POST['smtp_from_name'] ?? Auth::getSetting('smtp_from_name', '')));
        $pass = (string)($_POST['smtp_pass'] ?? '');
        if ($pass === '') {
            $storedSmtp = Mailer::getRuntimeConfig();
            if ($storedSmtp && Mailer::matchesSmtpIdentity($storedSmtp, $host, $port, $enc, $user)) {
                $pass = $storedSmtp['pass'];
            }
        }
        if (!Mailer::isValidHost($host) || $port < 1 || $port > 65535) {
            jsonResponse(false, null, t('api.sys.smtp_host_port_req'));
        }
        if (!filter_var($user, FILTER_VALIDATE_EMAIL)) {
            jsonResponse(false, null, t('api.sys.smtp_user_req'));
        }
        if ($pass === '') {
            jsonResponse(false, null, t('api.sys.smtp_need_pass'));
        }
        $curUser = Auth::getCurrentUser();
        $res = Mailer::sendTest(
            $toEmail,
            [
                'host' => $host,
                'port' => $port,
                'encryption' => $enc,
                'user' => $user,
                'pass' => $pass,
                'from_name' => $fromName,
            ],
            Auth::getCompanyDisplayName(),
            (string)($curUser['name'] ?? '')
        );
        jsonResponse($res['success'], null, $res['success'] ? t('api.sys.test_mail_sent') : ($res['message'] ?? t('auth.send_failed')));
        break;

    case 'save_role_permissions':
        if (!Auth::isAdmin()) jsonResponse(false, null, t('api.no_admin_perm'));

        // 1. 角色权限标准白名单矩阵 (系统唯一真理源)
        $permKeys = ['perm_editor_share', 'perm_viewer_download_rp', 'perm_viewer_share', 'perm_guest_download_rp', 'perm_guest_annotate'];
        foreach ($permKeys as $pk) {
            if (isset($_POST[$pk])) {
                Auth::setSetting($pk, !empty($_POST[$pk]) ? '1' : '0');
            }
        }

        jsonResponse(true, null, t('api.sys.roles_saved'));
        break;
}
