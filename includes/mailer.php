<?php
/**
 * 轻量原生 SMTP 邮件客户端与服务配置管理
 * 纯 PHP 7.0+ 实现，零第三方依赖，支持 SSL/TLS (465)、STARTTLS (587) 与无加密 (25)
 */
require_once __DIR__ . '/db.php';

class Mailer {
    const KEY_FILE = DATA_PATH . '/.smtp_secret';

    /**
     * 常见企业邮箱与公共邮箱预设
     */
    public static function presets() {
        return [
            '163_qiye' => [
                'label' => '163 企业邮箱',
                'host' => 'smtp.qiye.163.com',
                'port' => 465,
                'encryption' => 'ssl',
            ],
            'qq_exmail' => [
                'label' => '腾讯企业邮箱',
                'host' => 'smtp.exmail.qq.com',
                'port' => 465,
                'encryption' => 'ssl',
            ],
            'ali_mail' => [
                'label' => '阿里企业邮箱',
                'host' => 'smtp.mxhichina.com',
                'port' => 465,
                'encryption' => 'ssl',
            ],
            '163_personal' => [
                'label' => '163 个人邮箱',
                'host' => 'smtp.163.com',
                'port' => 465,
                'encryption' => 'ssl',
            ],
            'qq_personal' => [
                'label' => 'QQ 邮箱',
                'host' => 'smtp.qq.com',
                'port' => 465,
                'encryption' => 'ssl',
            ],
            'custom' => [
                'label' => '自定义 SMTP',
                'host' => '',
                'port' => 465,
                'encryption' => 'ssl',
            ],
        ];
    }

    /**
     * 获取或初始化本地对称加密密钥（32 字节）
     */
    private static function getSecretKey() {
        if (is_file(self::KEY_FILE)) {
            $raw = @file_get_contents(self::KEY_FILE);
            if (is_string($raw) && strlen($raw) >= 32) {
                return substr($raw, 0, 32);
            }
        }
        $key = random_bytes(32);
        if (!is_dir(DATA_PATH)) {
            @mkdir(DATA_PATH, 0755, true);
        }
        if (@file_put_contents(self::KEY_FILE, $key, LOCK_EX) !== false) {
            @chmod(self::KEY_FILE, 0600);
        }
        return $key;
    }

    /**
     * 加密敏感授权码（使用 AES-256-CBC + HMAC-SHA256，兼容 PHP 7.0）
     */
    public static function encryptSecret($plain) {
        $plain = (string)$plain;
        if ($plain === '') {
            return '';
        }
        if (!function_exists('openssl_encrypt')) {
            throw new RuntimeException('当前 PHP 环境未启用 OpenSSL 扩展，无法安全保存授权码');
        }
        $key = self::getSecretKey();
        $encKey = hash('sha256', 'enc|' . $key, true);
        $macKey = hash('sha256', 'mac|' . $key, true);
        $iv = random_bytes(16);
        $cipher = openssl_encrypt($plain, 'AES-256-CBC', $encKey, OPENSSL_RAW_DATA, $iv);
        if ($cipher === false) {
            throw new RuntimeException('授权码加密失败');
        }
        $mac = hash_hmac('sha256', $iv . $cipher, $macKey, true);
        return 'v1:' . base64_encode($iv . $mac . $cipher);
    }

    /**
     * 解密已存储的授权码
     */
    public static function decryptSecret($stored) {
        $stored = (string)$stored;
        if ($stored === '') {
            return '';
        }
        if (strpos($stored, 'v1:') !== 0) {
            return '';
        }
        if (!function_exists('openssl_decrypt')) {
            return '';
        }
        $raw = base64_decode(substr($stored, 3), true);
        if ($raw === false || strlen($raw) <= 48) {
            return '';
        }
        $iv = substr($raw, 0, 16);
        $mac = substr($raw, 16, 32);
        $cipher = substr($raw, 48);
        $key = self::getSecretKey();
        $encKey = hash('sha256', 'enc|' . $key, true);
        $macKey = hash('sha256', 'mac|' . $key, true);
        $expectedMac = hash_hmac('sha256', $iv . $cipher, $macKey, true);
        if (!hash_equals($expectedMac, $mac)) {
            return '';
        }
        $plain = openssl_decrypt($cipher, 'AES-256-CBC', $encKey, OPENSSL_RAW_DATA, $iv);
        return $plain === false ? '' : $plain;
    }

    /**
     * 读取脱敏后的邮件配置（供控制中心视图渲染，绝不返回明文密码）
     */
    public static function getPublicSettings() {
        $preset = Auth::getSetting('smtp_preset', '163_qiye');
        $presets = self::presets();
        if (!isset($presets[$preset])) {
            $preset = 'custom';
        }
        $passRaw = Auth::getSetting('smtp_pass_enc', '');
        return [
            'enabled' => Auth::getSetting('smtp_enabled', '0') === '1',
            'preset' => $preset,
            'host' => Auth::getSetting('smtp_host', ''),
            'port' => (int)Auth::getSetting('smtp_port', '465') ?: 465,
            'encryption' => Auth::getSetting('smtp_encryption', 'ssl'),
            'user' => Auth::getSetting('smtp_user', ''),
            'from_name' => Auth::getSetting('smtp_from_name', ''),
            'has_pass' => ($passRaw !== '' && self::decryptSecret($passRaw) !== ''),
        ];
    }

    /**
     * 判断当前是否已启用且具备完整有效的 SMTP 配置
     */
    public static function isConfiguredAndEnabled() {
        if (Auth::getSetting('smtp_enabled', '0') !== '1') {
            return false;
        }
        $cfg = self::getRuntimeConfig();
        return $cfg !== null;
    }

    /**
     * 获取运行时完整配置（含解密授权码），无效则返回 null
     */
    public static function getRuntimeConfig() {
        $host = trim(Auth::getSetting('smtp_host', ''));
        $port = (int)Auth::getSetting('smtp_port', '465');
        $enc = strtolower(trim(Auth::getSetting('smtp_encryption', 'ssl')));
        $user = trim(Auth::getSetting('smtp_user', ''));
        $pass = self::decryptSecret(Auth::getSetting('smtp_pass_enc', ''));
        $fromName = trim(Auth::getSetting('smtp_from_name', ''));

        if (!self::isValidHost($host) || $port < 1 || $port > 65535) {
            return null;
        }
        if (!in_array($enc, ['ssl', 'tls', 'none'], true)) {
            $enc = 'ssl';
        }
        if ($user === '' || !filter_var($user, FILTER_VALIDATE_EMAIL) || $pass === '') {
            return null;
        }
        return [
            'host' => $host,
            'port' => $port,
            'encryption' => $enc,
            'user' => $user,
            'pass' => $pass,
            'from_name' => $fromName,
        ];
    }

    /**
     * 校验 SMTP 主机名合法性，阻断协议前缀、换行或控制字符注入
     */
    public static function isValidHost($host) {
        $host = trim((string)$host);
        if ($host === '' || strlen($host) > 120) {
            return false;
        }
        if (preg_match('/[\s\x00-\x1f\x7f:\/\\\\]/', $host)) {
            return false;
        }
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return true;
        }
        return (bool)preg_match('/^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)+$/i', $host);
    }

    /**
     * 清洗单行邮件头文本，防止 CRLF 头注入
     */
    private static function cleanHeaderText($text) {
        return trim(str_replace(["\r", "\n", "\0"], ' ', (string)$text));
    }

    /**
     * RFC 2047 UTF-8 Base64 头字段编码
     */
    private static function encodeHeader($text) {
        $clean = self::cleanHeaderText($text);
        if ($clean === '') {
            return '';
        }
        return '=?UTF-8?B?' . base64_encode($clean) . '?=';
    }

    /**
     * 读取 SMTP 多行响应，返回 [code, fullMessage]
     */
    private static function readResponse($fp) {
        $lines = [];
        $code = 0;
        while (($line = fgets($fp, 2048)) !== false) {
            $lines[] = rtrim($line, "\r\n");
            if (preg_match('/^(\d{3})([\s-])/', $line, $m)) {
                $code = (int)$m[1];
                if ($m[2] === ' ') {
                    break;
                }
            } else {
                break;
            }
        }
        return [$code, implode("\n", $lines)];
    }

    /**
     * 发送单条 SMTP 命令并校验预期状态码
     */
    private static function command($fp, $cmd, $expectedCodes) {
        if ($cmd !== null) {
            $written = @fwrite($fp, $cmd . "\r\n");
            if ($written === false) {
                return [false, 0, '连接写入失败'];
            }
        }
        $res = self::readResponse($fp);
        $code = $res[0];
        $msg = $res[1];
        if (!in_array($code, (array)$expectedCodes, true)) {
            return [false, $code, $msg];
        }
        return [true, $code, $msg];
    }

    /**
     * 根据 SMTP 响应码与上下文返回克制准确的中文诊断
     */
    private static function formatSmtpError($stage, $code, $rawMsg) {
        $lower = strtolower((string)$rawMsg);
        if ($code === 535 || strpos($lower, 'auth') !== false && strpos($lower, 'fail') !== false) {
            return '邮箱账号或客户端授权码校验失败';
        }
        if ($code === 553 || strpos($lower, 'authorized user') !== false || strpos($lower, 'mail from') !== false) {
            return '发信邮箱与认证账号不一致，被服务器拒绝';
        }
        if ($stage === 'connect') {
            return '无法连接邮件服务器，请检查地址、端口或服务器出站网络';
        }
        if ($stage === 'tls') {
            return 'TLS 加密握手失败，请核对端口与加密方式';
        }
        if ($code > 0) {
            return '邮件服务器拒绝请求（' . $code . '）';
        }
        return '邮件发送失败，请检查邮件服务配置';
    }

    /**
     * 使用当前系统配置或指定配置发送 HTML 邮件（支持 multipart/related 内嵌图片）
     *
     * @param string $toEmail 收件人邮箱
     * @param string $subject 邮件主题
     * @param string $htmlBody HTML 正文
     * @param array|null $overrideConfig 测试场景传入临时配置
     * @param array $inlineAssets 内嵌资源 [['cid' => ..., 'path' => ..., 'mime' => ..., 'name' => ...]]
     * @return array ['success' => bool, 'message' => string]
     */
    public static function send($toEmail, $subject, $htmlBody, $overrideConfig = null, $inlineAssets = []) {
        $toEmail = self::cleanHeaderText(strtolower($toEmail));
        if ($toEmail === '' || !filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
            return ['success' => false, 'message' => '收件邮箱格式不正确'];
        }

        $cfg = is_array($overrideConfig) ? $overrideConfig : self::getRuntimeConfig();
        if (!$cfg) {
            return ['success' => false, 'message' => '邮件服务未配置或已关闭'];
        }

        $host = trim((string)($cfg['host'] ?? ''));
        $port = (int)($cfg['port'] ?? 465);
        $enc = strtolower(trim((string)($cfg['encryption'] ?? 'ssl')));
        $user = self::cleanHeaderText($cfg['user'] ?? '');
        $pass = (string)($cfg['pass'] ?? '');
        $fromName = self::cleanHeaderText($cfg['from_name'] ?? '');
        if ($fromName === '') {
            $rawTitle = trim(Auth::getSetting('site_title', ''));
            $fromName = ($rawTitle !== '' && strcasecmp($rawTitle, 'ProtoLoft') !== 0) ? $rawTitle : '立象原型';
        }

        if (!self::isValidHost($host) || $port < 1 || $port > 65535) {
            return ['success' => false, 'message' => 'SMTP 服务器或端口格式不正确'];
        }
        if ($user === '' || !filter_var($user, FILTER_VALIDATE_EMAIL) || $pass === '') {
            return ['success' => false, 'message' => '请填写发信邮箱与授权码'];
        }

        $remote = ($enc === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
        $ctxOptions = [
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
                'allow_self_signed' => false,
                'peer_name' => $host,
            ],
        ];
        if (!empty($cfg['allow_insecure_local'])) {
            $ctxOptions['ssl']['verify_peer'] = false;
            $ctxOptions['ssl']['verify_peer_name'] = false;
            $ctxOptions['ssl']['allow_self_signed'] = true;
        }
        $context = stream_context_create($ctxOptions);

        $errno = 0;
        $errstr = '';
        $fp = @stream_socket_client($remote, $errno, $errstr, 8, STREAM_CLIENT_CONNECT, $context);
        if (!$fp) {
            error_log('[protoloft] SMTP 连接失败 (' . $remote . '): ' . $errstr);
            return ['success' => false, 'message' => self::formatSmtpError('connect', 0, $errstr)];
        }
        stream_set_timeout($fp, 8);

        try {
            $res = self::command($fp, null, [220]);
            if (!$res[0]) {
                return ['success' => false, 'message' => self::formatSmtpError('connect', $res[1], $res[2])];
            }

            $ehloHost = preg_replace('/[^a-zA-Z0-9.\-]/', '', (string)($_SERVER['SERVER_NAME'] ?? 'localhost')) ?: 'localhost';
            $res = self::command($fp, 'EHLO ' . $ehloHost, [250]);
            if (!$res[0]) {
                $res = self::command($fp, 'HELO ' . $ehloHost, [250]);
                if (!$res[0]) {
                    return ['success' => false, 'message' => self::formatSmtpError('ehlo', $res[1], $res[2])];
                }
            }

            if ($enc === 'tls') {
                $res = self::command($fp, 'STARTTLS', [220]);
                if (!$res[0]) {
                    return ['success' => false, 'message' => self::formatSmtpError('tls', $res[1], $res[2])];
                }
                $cryptoMethod = STREAM_CRYPTO_METHOD_TLS_CLIENT;
                if (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT')) {
                    $cryptoMethod |= STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
                }
                if (!@stream_socket_enable_crypto($fp, true, $cryptoMethod)) {
                    return ['success' => false, 'message' => self::formatSmtpError('tls', 0, 'TLS 握手失败')];
                }
                $res = self::command($fp, 'EHLO ' . $ehloHost, [250]);
                if (!$res[0]) {
                    return ['success' => false, 'message' => self::formatSmtpError('tls', $res[1], $res[2])];
                }
            }

            // 优先使用 AUTH LOGIN，不成功再兼容 AUTH PLAIN
            $res = self::command($fp, 'AUTH LOGIN', [334]);
            if ($res[0]) {
                $resU = self::command($fp, base64_encode($user), [334]);
                if (!$resU[0]) {
                    return ['success' => false, 'message' => self::formatSmtpError('auth', $resU[1], $resU[2])];
                }
                $resP = self::command($fp, base64_encode($pass), [235]);
                if (!$resP[0]) {
                    return ['success' => false, 'message' => self::formatSmtpError('auth', $resP[1], $resP[2])];
                }
            } else {
                $plainToken = base64_encode("\0" . $user . "\0" . $pass);
                $resPlain = self::command($fp, 'AUTH PLAIN ' . $plainToken, [235]);
                if (!$resPlain[0]) {
                    return ['success' => false, 'message' => self::formatSmtpError('auth', $resPlain[1], $resPlain[2])];
                }
            }

            $res = self::command($fp, 'MAIL FROM:<' . $user . '>', [250]);
            if (!$res[0]) {
                return ['success' => false, 'message' => self::formatSmtpError('mail_from', $res[1], $res[2])];
            }

            $res = self::command($fp, 'RCPT TO:<' . $toEmail . '>', [250, 251]);
            if (!$res[0]) {
                return ['success' => false, 'message' => self::formatSmtpError('rcpt_to', $res[1], $res[2])];
            }

            $res = self::command($fp, 'DATA', [354]);
            if (!$res[0]) {
                return ['success' => false, 'message' => self::formatSmtpError('data', $res[1], $res[2])];
            }

            $encodedFrom = self::encodeHeader($fromName) . ' <' . $user . '>';
            $encodedSubject = self::encodeHeader($subject);
            $domain = substr(strrchr($user, '@'), 1) ?: 'localhost';
            $messageId = '<' . bin2hex(random_bytes(12)) . '@' . $domain . '>';

            $validAssets = [];
            if (is_array($inlineAssets)) {
                foreach ($inlineAssets as $asset) {
                    $path = (string)($asset['path'] ?? '');
                    $cid = preg_replace('/[^a-zA-Z0-9._@-]/', '', (string)($asset['cid'] ?? ''));
                    if ($cid !== '' && $path !== '' && is_file($path) && is_readable($path)) {
                        $bytes = @file_get_contents($path);
                        if ($bytes !== false && $bytes !== '') {
                            $validAssets[] = [
                                'cid' => $cid,
                                'mime' => self::cleanHeaderText($asset['mime'] ?? 'application/octet-stream'),
                                'name' => self::cleanHeaderText($asset['name'] ?? basename($path)),
                                'data' => $bytes,
                            ];
                        }
                    }
                }
            }

            $headers = [
                'Date: ' . date('r'),
                'Message-ID: ' . $messageId,
                'From: ' . $encodedFrom,
                'To: <' . $toEmail . '>',
                'Subject: ' . $encodedSubject,
                'MIME-Version: 1.0',
            ];

            $encodedBody = rtrim(chunk_split(base64_encode((string)$htmlBody), 76, "\r\n"), "\r\n");

            if (empty($validAssets)) {
                $headers[] = 'Content-Type: text/html; charset=UTF-8';
                $headers[] = 'Content-Transfer-Encoding: base64';
                $mimeBody = $encodedBody;
            } else {
                $boundary = '=_ProtoLoft_Rel_' . bin2hex(random_bytes(12));
                $headers[] = 'Content-Type: multipart/related; boundary="' . $boundary . '"';
                $parts = [];
                $parts[] = "--{$boundary}\r\n"
                    . "Content-Type: text/html; charset=UTF-8\r\n"
                    . "Content-Transfer-Encoding: base64\r\n\r\n"
                    . $encodedBody;
                foreach ($validAssets as $asset) {
                    $assetB64 = rtrim(chunk_split(base64_encode($asset['data']), 76, "\r\n"), "\r\n");
                    $parts[] = "--{$boundary}\r\n"
                        . "Content-Type: {$asset['mime']}; name=\"{$asset['name']}\"\r\n"
                        . "Content-Transfer-Encoding: base64\r\n"
                        . "Content-ID: <{$asset['cid']}>\r\n"
                        . "Content-Disposition: inline; filename=\"{$asset['name']}\"\r\n\r\n"
                        . $assetB64;
                }
                $mimeBody = implode("\r\n", $parts) . "\r\n--{$boundary}--";
            }

            $rawMessage = implode("\r\n", $headers) . "\r\n\r\n" . $mimeBody . "\r\n.";

            $res = self::command($fp, $rawMessage, [250]);
            if (!$res[0]) {
                return ['success' => false, 'message' => self::formatSmtpError('send', $res[1], $res[2])];
            }

            @fwrite($fp, "QUIT\r\n");
            return ['success' => true, 'message' => '邮件已发送'];
        } finally {
            @fclose($fp);
        }
    }

    /**
     * 获取邮件内嵌品牌图标资源定义（高兼容 PNG，使用网页工作台同款几何折纸大象图标）
     */
    private static function brandIconAssets() {
        $iconPath = ROOT_PATH . '/assets/images/logo-icon.png';
        if (!is_file($iconPath) || !is_readable($iconPath)) {
            return [];
        }
        return [[
            'cid' => 'protoloft-brand-icon',
            'path' => $iconPath,
            'mime' => 'image/png',
            'name' => 'protoloft-logo-icon.png',
        ]];
    }

    /**
     * 生成统一品牌信封 HTML 框架（全内联样式 + 表格布局，兼容 163/QQ/Outlook/Gmail，不依赖易被拦截的外链图片）
     */
    private static function buildBrandEmailHtml($params) {
        $siteLabel = trim((string)($params['site_label'] ?? '立象原型'));
        $companyName = trim((string)($params['company_name'] ?? ''));
        $badgeText = trim((string)($params['badge'] ?? '账号安全'));
        $title = trim((string)($params['title'] ?? ''));
        $greeting = trim((string)($params['greeting'] ?? ''));
        $lead = (string)($params['lead'] ?? '');
        $buttonText = trim((string)($params['button_text'] ?? ''));
        $buttonUrl = trim((string)($params['button_url'] ?? ''));
        $metaItems = is_array($params['meta_items'] ?? null) ? $params['meta_items'] : [];
        $footerNote = (string)($params['footer_note'] ?? '');
        $hasBrandIcon = !empty($params['has_brand_icon']);

        $safeCompany = htmlspecialchars($companyName, ENT_QUOTES, 'UTF-8');
        $safeBadge = htmlspecialchars($badgeText, ENT_QUOTES, 'UTF-8');
        $safeTitle = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
        $safeGreeting = htmlspecialchars($greeting, ENT_QUOTES, 'UTF-8');
        $safeUrl = htmlspecialchars($buttonUrl, ENT_QUOTES, 'UTF-8');
        $safeBtnText = htmlspecialchars($buttonText, ENT_QUOTES, 'UTF-8');
        $year = date('Y');

        $brandLogoCell = $hasBrandIcon
            ? '<td style="width:40px;height:40px;vertical-align:middle;"><img src="cid:protoloft-brand-icon" width="40" height="40" alt="立象原型" style="display:block;width:40px;height:40px;border:0;"></td>'
            : '<td style="width:36px;height:36px;background:#0076de;border-radius:8px;text-align:center;vertical-align:middle;color:#ffffff;font-size:15px;font-weight:700;letter-spacing:-0.5px;">象</td>';

        $companyPill = '';
        if ($safeCompany !== '') {
            $companyPill = '<span style="display:inline-block;margin-left:8px;padding:2px 8px;font-size:11px;font-weight:600;color:#0076de;background:#eff6ff;border:1px solid #bfdbfe;border-radius:999px;vertical-align:middle;">' . $safeCompany . '</span>';
        }

        $metaHtml = '';
        if (!empty($metaItems)) {
            $rows = '';
            foreach ($metaItems as $item) {
                $k = htmlspecialchars((string)($item[0] ?? ''), ENT_QUOTES, 'UTF-8');
                $v = htmlspecialchars((string)($item[1] ?? ''), ENT_QUOTES, 'UTF-8');
                $rows .= '<tr>'
                    . '<td style="padding:5px 0;font-size:12.5px;color:#64748b;width:84px;vertical-align:top;">' . $k . '</td>'
                    . '<td style="padding:5px 0;font-size:12.5px;color:#1e293b;font-weight:500;vertical-align:top;">' . $v . '</td>'
                    . '</tr>';
            }
            $metaHtml = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0;padding:12px 16px;background:#f8fafc;border:1px solid #e7eaf0;border-radius:8px;border-collapse:separate;">'
                . $rows
                . '</table>';
        }

        $ctaHtml = '';
        $fallbackHtml = '';
        if ($safeBtnText !== '' && $safeUrl !== '') {
            $ctaHtml = '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">'
                . '<tr><td align="center" bgcolor="#0076de" style="border-radius:7px;">'
                . '<a href="' . $safeUrl . '" target="_blank" style="display:inline-block;padding:11px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:7px;letter-spacing:0.2px;">' . $safeBtnText . '</a>'
                . '</td></tr></table>';

            $fallbackHtml = '<div style="margin-top:22px;padding:12px 14px;background:#f8fafc;border:1px solid #e7eaf0;border-radius:7px;">'
                . '<div style="font-size:11.5px;color:#64748b;margin-bottom:5px;">如果按钮无法点击，请复制以下链接到浏览器打开：</div>'
                . '<div style="font-size:11.5px;line-height:1.5;color:#0076de;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">' . $safeUrl . '</div>'
                . '</div>';
        }

        $noteHtml = $footerNote !== ''
            ? '<p style="margin:18px 0 0;font-size:12px;line-height:1.65;color:#64748b;">' . nl2br(htmlspecialchars($footerNote, ENT_QUOTES, 'UTF-8')) . '</p>'
            : '';

        return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>'
            . '<body style="margin:0;padding:0;background:#f7f8fa;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,\'PingFang SC\',\'Hiragino Sans GB\',\'Microsoft YaHei\',sans-serif;color:#111827;-webkit-font-smoothing:antialiased;">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fa;padding:32px 16px;">'
            . '<tr><td align="center">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border:1px solid #e7eaf0;border-radius:12px;overflow:hidden;">'
            // 顶部晴空蓝品牌装饰线
            . '<tr><td style="height:4px;background:#0076de;font-size:0;line-height:0;">&nbsp;</td></tr>'
            // 品牌识别头栏
            . '<tr><td style="padding:22px 28px 18px;border-bottom:1px solid #f1f5f9;">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
            . '<tr>'
            . '<td style="vertical-align:middle;">'
            . '<table role="presentation" cellpadding="0" cellspacing="0"><tr>'
            . $brandLogoCell
            . '<td style="padding-left:10px;vertical-align:middle;">'
            . '<div style="font-size:15px;font-weight:700;color:#0f172a;line-height:1.25;">立象原型 <span style="font-weight:500;color:#64748b;font-size:12.5px;">ProtoLoft</span>' . $companyPill . '</div>'
            . '<div style="font-size:11.5px;color:#64748b;margin-top:2px;">立象以尽意 · 披图而同心</div>'
            . '</td></tr></table>'
            . '</td>'
            . '<td align="right" style="vertical-align:middle;">'
            . '<span style="display:inline-block;padding:3px 9px;font-size:11px;font-weight:600;color:#475569;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;">' . $safeBadge . '</span>'
            . '</td>'
            . '</tr></table>'
            . '</td></tr>'
            // 正文卡片区
            . '<tr><td style="padding:26px 28px 28px;">'
            . '<h1 style="margin:0 0 14px;font-size:18px;font-weight:700;color:#0f172a;line-height:1.35;">' . $safeTitle . '</h1>'
            . ($safeGreeting !== '' ? '<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#334155;">' . $safeGreeting . '</p>' : '')
            . '<p style="margin:0;font-size:14px;line-height:1.7;color:#475569;">' . $lead . '</p>'
            . $ctaHtml
            . $metaHtml
            . $fallbackHtml
            . $noteHtml
            . '</td></tr>'
            // 品牌页脚
            . '<tr><td style="padding:16px 28px;background:#fafbfc;border-top:1px solid #f1f5f9;text-align:center;">'
            . '<div style="font-size:11.5px;color:#64748b;line-height:1.6;">'
            . '© ' . $year . ' 立象原型 · ProtoLoft &nbsp;|&nbsp; Give ideas a shared home.'
            . '</div>'
            . '</td></tr>'
            . '</table>'
            . '</td></tr></table>'
            . '</body></html>';
    }

    /**
     * 发送密码重置邮件
     */
    public static function sendPasswordReset($toEmail, $userName, $resetUrl, $companyName = '') {
        $brandPrefix = $companyName !== '' ? ($companyName . ' · 立象原型') : '立象原型';
        $subject = $brandPrefix . ' · 重置登录密码';
        $displayName = $userName !== '' ? $userName : $toEmail;
        $assets = self::brandIconAssets();

        $html = self::buildBrandEmailHtml([
            'site_label' => $brandPrefix,
            'company_name' => $companyName,
            'badge' => '安全验证',
            'title' => '重置你的登录密码',
            'greeting' => $displayName . '，你好：',
            'lead' => '我们收到了重置你工作台账号密码的请求。请点击下方按钮前往设置新密码。',
            'button_text' => '设置新密码',
            'button_url' => $resetUrl,
            'has_brand_icon' => !empty($assets),
            'meta_items' => [
                ['账号邮箱', $toEmail],
                ['有效时长', '15 分钟内有效（单次使用后失效）'],
            ],
            'footer_note' => '如果这不是你本人的操作，请直接忽略此邮件，你的原密码不会被更改。',
        ]);

        return self::send($toEmail, $subject, $html, null, $assets);
    }

    /**
     * 发送系统配置测试邮件
     */
    public static function sendTest($toEmail, $overrideConfig, $companyName = '', $operatorName = '') {
        $brandPrefix = $companyName !== '' ? ($companyName . ' · 立象原型') : '立象原型';
        $subject = $brandPrefix . ' · 邮件服务联通测试';
        $host = trim((string)($overrideConfig['host'] ?? ''));
        $port = (int)($overrideConfig['port'] ?? 465);
        $assets = self::brandIconAssets();

        $html = self::buildBrandEmailHtml([
            'site_label' => $brandPrefix,
            'company_name' => $companyName,
            'badge' => '联通测试',
            'title' => '邮件服务配置测试正常',
            'greeting' => $operatorName !== '' ? ($operatorName . '，你好：') : '你好：',
            'lead' => '当你收到这封邮件，说明当前 SMTP 发信服务已正常联通，可用于成员找回登录密码。',
            'has_brand_icon' => !empty($assets),
            'meta_items' => [
                ['发信服务器', $host . ':' . $port],
                ['发送时间', date('Y-m-d H:i:s')],
            ],
            'footer_note' => '这是一封由系统设置触发的测试邮件，无需回复。',
        ]);

        return self::send($toEmail, $subject, $html, $overrideConfig, $assets);
    }
}
