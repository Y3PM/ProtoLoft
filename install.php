<?php
/**
 * 原型托管中心 - 现代化分步安装向导 (Step-by-Step Wizard)
 */
require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/password_policy.php';

// 检查是否已安装
if (is_installed()) {
    ?>
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <title>系统已安装</title>
        <link rel="stylesheet" href="assets/css/bootstrap.min.css">
        <link rel="stylesheet" href="assets/css/app.css?v=<?php echo APP_VERSION; ?>">
    </head>
    <body class="page-standalone">
        <div class="standalone-brand">
            <picture>
                <source srcset="assets/images/logo.svg?v=<?php echo APP_VERSION; ?>" type="image/svg+xml">
                <source srcset="assets/images/logo.webp?v=<?php echo APP_VERSION; ?>" type="image/webp">
                <img src="assets/images/logo.png?v=<?php echo APP_VERSION; ?>" alt="立象原型" class="brand-logo">
            </picture>
            <p class="brand-subtitle">立象以尽意 · 披图而同心</p>
        </div>
        <div class="standalone-card" style="padding: 36px 32px; text-align: center;">
            <div style="font-size:44px;color:var(--success);margin-bottom:12px;line-height:1;">✓</div>
            <h3 style="color:var(--text-1);margin-bottom:12px;font-size:18px;font-weight:700;">系统已安装</h3>
            <p style="color:var(--text-3);margin-bottom:24px;font-size:13px;line-height:1.6;">
                如需重新安装，请删除 <code>data/install.lock</code> 文件后刷新页面。
            </p>
            <div>
                <a href="index.php" class="standalone-btn-primary" style="text-decoration:none;display:inline-flex;width:auto;padding:0 24px;">进入工作台</a>
            </div>
        </div>
    </body>
    </html>
    <?php
    exit;
}

$error = '';
$success = false;

/**
 * 读取或生成首次安装密钥文件 (data/install_token.php)
 * 优先支持环境变量 PROTOLOFT_INSTALL_TOKEN 注入
 */
function install_get_or_create_token() {
    $envToken = strtoupper(trim((string)getenv('PROTOLOFT_INSTALL_TOKEN')));
    if (preg_match('/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/', $envToken)) {
        return $envToken;
    }

    if (is_file(INSTALL_TOKEN_FILE)) {
        // 兼容 FTP 查看：确保其他系统账号（如 FTP 用户）可读，同时依赖首行 PHP 403 防 Web 直读
        $perms = @fileperms(INSTALL_TOKEN_FILE);
        if ($perms === false || ($perms & 0777) !== 0644) {
            @chmod(INSTALL_TOKEN_FILE, 0644);
        }
        $content = (string)@file_get_contents(INSTALL_TOKEN_FILE);
        $lines = explode("\n", str_replace("\r", "", $content));
        foreach ($lines as $line) {
            $candidate = strtoupper(trim($line));
            if (preg_match('/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/', $candidate)) {
                return $candidate;
            }
        }
    }
    $alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    $maxIdx = strlen($alphabet) - 1;
    $token = '';
    for ($i = 0; $i < 12; $i++) {
        $token .= $alphabet[random_int(0, $maxIdx)];
    }
    $fileContent = "<?php http_response_code(403); exit; ?>\n" . $token . "\n";
    if (@file_put_contents(INSTALL_TOKEN_FILE, $fileContent, LOCK_EX) === false) {
        return '';
    }
    @chmod(INSTALL_TOKEN_FILE, 0644);
    return $token;
}

/**
 * 安装密钥错误限速 (同一 IP 15 分钟内最多失败 5 次)
 */
function install_throttle_update($ip, $mode = 'check', $maxAttempts = 5, $windowSec = 900) {
    $now = time();
    $fp = @fopen(INSTALL_THROTTLE_FILE, 'c+');
    if (!$fp) {
        return true;
    }
    $allowed = true;
    if (@flock($fp, LOCK_EX)) {
        $raw = stream_get_contents($fp);
        $data = json_decode($raw ?: '{}', true);
        if (!is_array($data)) {
            $data = [];
        }
        $clean = [];
        foreach ($data as $k => $list) {
            if (!is_array($list)) continue;
            $validList = [];
            foreach ($list as $ts) {
                if (is_numeric($ts) && ($now - (int)$ts) < $windowSec) {
                    $validList[] = (int)$ts;
                }
            }
            if (!empty($validList)) {
                $clean[$k] = $validList;
            }
        }
        $ipList = $clean[$ip] ?? [];
        if ($mode === 'check') {
            $allowed = count($ipList) < $maxAttempts;
        } elseif ($mode === 'hit') {
            $ipList[] = $now;
            $clean[$ip] = $ipList;
            $allowed = count($ipList) < $maxAttempts;
        } elseif ($mode === 'clear') {
            unset($clean[$ip]);
        }
        if ($mode !== 'check') {
            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, json_encode($clean));
            fflush($fp);
        }
        @flock($fp, LOCK_UN);
    }
    @fclose($fp);
    @chmod(INSTALL_THROTTLE_FILE, 0600);
    return $allowed;
}

// 1. 环境自检 (精准支持 PHP 7.0.0+)
$checkPhp = version_compare(PHP_VERSION, '7.0.0', '>=');
$checkPdo = extension_loaded('pdo_sqlite');
$checkZip = class_exists('ZipArchive');
$checkMbstring = extension_loaded('mbstring');
$checkDom = class_exists('DOMDocument');

// 增强目录写权限检测与自动创建
$checkDataWritable = false;
try {
    if (!file_exists(DATA_PATH)) {
        @mkdir(DATA_PATH, 0755, true);
    }
    $testFile = DATA_PATH . '/.perm_test_' . time();
    if (@file_put_contents($testFile, 'test') !== false) {
        @unlink($testFile);
        $checkDataWritable = true;
    }
} catch (Exception $e) {
    $checkDataWritable = false;
}

$checkUploadsWritable = false;
try {
    if (!file_exists(UPLOADS_PATH)) {
        @mkdir(UPLOADS_PATH, 0755, true);
    }
    $testFile = UPLOADS_PATH . '/.perm_test_' . time();
    if (@file_put_contents($testFile, 'test') !== false) {
        @unlink($testFile);
        $checkUploadsWritable = true;
    }
} catch (Exception $e) {
    $checkUploadsWritable = false;
}

$allPass = $checkPhp && $checkPdo && $checkZip && $checkMbstring && $checkDom && $checkDataWritable && $checkUploadsWritable;

$expectedInstallToken = $checkDataWritable ? install_get_or_create_token() : '';
$expectedTokenHash = ($expectedInstallToken !== '') ? hash('sha256', $expectedInstallToken) : '';
$sessionTokenHash = $_SESSION['install_token_verified_hash'] ?? '';
$isTokenVerified = (
    $expectedTokenHash !== ''
    && is_string($sessionTokenHash)
    && $sessionTokenHash !== ''
    && hash_equals($expectedTokenHash, $sessionTokenHash)
);

$clientIp = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
$initialStep = 2;
$formSiteTitle = '';
$formAllowedDomains = '';
$formAdminEmail = '';
$formAdminName = '';

// 2. 处理表单提交 (步骤 1 密钥验证 / 步骤 4 正式安装)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $isVerifyStepPost = isset($_POST['verify_step']);
    $rawInputToken = strtoupper(trim((string)($_POST['install_token'] ?? '')));

    if (!verify_csrf_token($_POST['csrf_token'] ?? '')) {
        $error = '页面已过期，请刷新后重试';
    } elseif ($isVerifyStepPost) {
        if (!$checkDataWritable || $expectedInstallToken === '') {
            $error = 'data/ 目录不可写，无法生成安装密钥，请先赋予写入权限后再刷新。';
        } elseif (!install_throttle_update($clientIp, 'check')) {
            $error = '密钥尝试次数过多，请 15 分钟后再试';
        } elseif ($rawInputToken === '') {
            $error = '请输入安装密钥';
        } elseif (!hash_equals($expectedInstallToken, $rawInputToken)) {
            install_throttle_update($clientIp, 'hit');
            $error = '安装密钥不正确，请核对 data/install_token.php';
        } else {
            $_SESSION['install_token_verified_hash'] = $expectedTokenHash;
            install_throttle_update($clientIp, 'clear');
            header('Location: install.php');
            exit;
        }
    } else {
        // 未通过前置密钥验证时，若本次 POST 未同时携带有效密钥，严禁继续安装
        if (!$isTokenVerified) {
            if ($rawInputToken === '') {
                $error = '请先完成安装密钥验证';
            } elseif (!$checkDataWritable || $expectedInstallToken === '') {
                $error = 'data/ 目录不可写，无法生成安装密钥，请先赋予写入权限后再刷新。';
            } elseif (!install_throttle_update($clientIp, 'check')) {
                $error = '密钥尝试次数过多，请 15 分钟后再试';
            } elseif (!hash_equals($expectedInstallToken, $rawInputToken)) {
                install_throttle_update($clientIp, 'hit');
                $error = '安装密钥不正确，请核对 data/install_token.php';
            } else {
                $_SESSION['install_token_verified_hash'] = $expectedTokenHash;
                install_throttle_update($clientIp, 'clear');
                $isTokenVerified = true;
            }
        }

        if ($isTokenVerified && empty($error)) {
            $initialStep = 4;
            $formSiteTitle = trim($_POST['site_title'] ?? '');
            $formAllowedDomains = trim($_POST['allowed_email_domains'] ?? '');
            $formAdminEmail = trim(strtolower($_POST['admin_email'] ?? ''));
            $formAdminName = trim($_POST['admin_name'] ?? '');

            if (!$allPass) {
                $error = '服务器环境检测未全部通过，无法进行安装。';
            } else {
                $siteTitle = $formSiteTitle;
                require_once __DIR__ . '/includes/auth.php';
                $rawDomains = $formAllowedDomains;
                $allowedDomains = '';
                if (!empty($rawDomains)) {
                    $domainCheckList = [];
                    $domainRegex = '/^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)+$/i';
                    foreach (explode(',', str_replace('，', ',', $rawDomains)) as $d) {
                        $d = trim(strtolower($d));
                        if (empty($d)) continue;
                        $d = preg_replace('#^https?://#i', '', $d);
                        $d = trim($d, '/');
                        if (strpos($d, '@') === 0) {
                            $d = ltrim($d, '@');
                        }
                        if (empty($d) || strpos($d, '@') !== false || !preg_match($domainRegex, $d)) {
                            $error = '邮箱域名格式不正确，例如 company.com';
                            break;
                        }
                        $domainCheckList[] = $d;
                    }
                    if (empty($error)) {
                        $allowedDomains = implode(', ', array_unique($domainCheckList));
                        $formAllowedDomains = $allowedDomains;
                    }
                }

                $adminEmail = $formAdminEmail;
                $adminName = $formAdminName;
                $adminPass = $_POST['admin_password'] ?? '';
                $adminPassConfirm = $_POST['admin_password_confirm'] ?? '';
                $passwordError = app_password_length_error($adminPass);

                // 若只输入了前缀且配置了企业域名白名单，自动补齐后缀
                if (strpos($adminEmail, '@') === false && !empty($adminEmail) && !empty($allowedDomains)) {
                    $dList = array_filter(array_map('trim', explode(',', strtolower($allowedDomains))));
                    if (!empty($dList)) {
                        $adminEmail = $adminEmail . '@' . reset($dList);
                    }
                }

                if (!empty($error)) {
                    // 已有域名格式等前置错误，直接拦截阻断
                } elseif (!empty($siteTitle) && mb_strlen($siteTitle, 'utf-8') > 20) {
                    $error = '组织名称长度不能超过 20 个字符';
                } elseif (!empty($allowedDomains) && mb_strlen($allowedDomains, 'utf-8') > 200) {
                    $error = '允许注册的邮箱域名配置长度不能超过 200 个字符';
                } elseif (empty($adminEmail)) {
                    $error = '请输入管理员工作邮箱';
                } elseif (strlen($adminEmail) > 100) {
                    $error = '管理员工作邮箱长度不能超过 100 个字符';
                } elseif (strpos($adminEmail, '@') === false) {
                    $error = '请输入完整工作邮箱，如 admin@company.com';
                } elseif (!filter_var($adminEmail, FILTER_VALIDATE_EMAIL)) {
                    $error = '管理员工作邮箱格式不正确，请输入有效的邮箱地址';
                } elseif (empty($adminName) || mb_strlen($adminName, 'utf-8') < 2 || mb_strlen($adminName, 'utf-8') > 20) {
                    $error = '请输入管理员真实姓名（2~20 个字符）';
                } elseif ($passwordError !== '') {
                    $error = $passwordError;
                } elseif ($adminPassConfirm !== $adminPass) {
                    $error = '两次输入的管理员密码不一致';
                } else {
                    try {
                        require_once __DIR__ . '/includes/db.php';
                        require_once __DIR__ . '/includes/auth.php';

                        // 建表与内置基础数据
                        DB::initTables();

                        // 写入系统设置 (企业定制信息)
                        if (!empty($siteTitle)) {
                            Auth::setSetting('site_title', $siteTitle);
                        }
                        Auth::setSetting('allowed_email_domains', $allowedDomains);

                        // 创建首任主管理员 (is_owner = 1，拥有最高所有权)
                        $db = DB::getInstance();
                        $pHash = password_hash($adminPass, PASSWORD_DEFAULT);
                        $stmtAdmin = $db->prepare("INSERT INTO users (email, name, password_hash, role, is_owner, status) VALUES (?, ?, ?, 'admin', 1, 1)");
                        $stmtAdmin->execute([$adminEmail, $adminName, $pHash]);

                        // 生成锁定文件并销毁一次性安装密钥
                        file_put_contents(LOCK_FILE, json_encode([
                            'installed_at' => date('Y-m-d H:i:s'),
                            'version' => APP_VERSION,
                            'admin' => $adminEmail
                        ], JSON_PRETTY_PRINT));
                        @unlink(INSTALL_TOKEN_FILE);
                        @unlink(DATA_PATH . '/install_token.txt');
                        @unlink(INSTALL_THROTTLE_FILE);
                        unset($_SESSION['install_token_verified_hash']);

                        $success = true;
                    } catch (Exception $e) {
                        $error = '安装过程异常，请检查目录权限与数据库状态';
                    }
                }
            }
        }
    }
}
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>立象原型 - 安装向导</title>
    <link rel="icon" href="assets/images/favicon.svg?v=<?php echo substr(sha1_file(ROOT_PATH . '/assets/images/favicon.svg'), 0, 12); ?>" type="image/svg+xml">
    <link rel="alternate icon" href="assets/images/favicon.png?v=<?php echo substr(sha1_file(ROOT_PATH . '/assets/images/favicon.png'), 0, 12); ?>" type="image/png">
    <link rel="stylesheet" href="assets/css/bootstrap.min.css">
    <link rel="stylesheet" href="assets/css/remixicon.css">
    <link rel="stylesheet" href="assets/css/app.css?v=<?php echo APP_VERSION . '.' . filemtime(__DIR__ . '/assets/css/app.css'); ?>">
    <style>
        .installer-container {
            width: 100%;
            max-width: var(--modal-lg, 640px);
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        /* 独立于卡片外部的品牌区域 (Brand Header Outside Card) */
        .brand-header {
            text-align: center;
            margin-bottom: 24px;
        }
        .logo-wrap {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 8px;
        }
        .logo-wrap img {
            height: 72px;
            width: auto;
            max-width: 100%;
            object-fit: contain;
            display: block;
        }
        .brand-subtitle {
            font-size: 13px;
            color: var(--text-3);
            margin: 0;
            letter-spacing: 0.05em;
            font-weight: 400;
        }

        /* 纯粹利落的向导主体卡片 (Wizard Card) */
        .wizard-card {
            width: 100%;
            background: var(--surface);
            border-radius: var(--radius-lg);
            box-shadow: var(--shadow-card);
            border: 1px solid var(--border);
            overflow: hidden;
            position: relative;
        }

        /* 顶部极简发丝 4 段式进度刻度条 (Segmented Slim Stepper) */
        .stepper-segments {
            display: flex;
            gap: 3px;
            padding: 0;
            margin: 0;
            width: 100%;
            background-color: var(--surface-hover);
            height: 3.5px;
        }
        .stepper-segment {
            flex: 1;
            height: 100%;
            background-color: var(--border);
            transition: background 0.3s ease;
        }
        .stepper-segment.active {
            background-color: var(--primary);
        }
        .stepper-segment.completed {
            background-color: var(--success);
        }

        /* 卡片内部步骤头部 */
        .wizard-card-header {
            padding: 24px 36px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid var(--border);
        }
        .step-title-wrap h2 {
            font-size: 16px;
            font-weight: 700;
            color: var(--text-1);
            margin: 0 0 3px;
        }
        .step-title-wrap p {
            font-size: 12px;
            color: var(--text-3);
            margin: 0;
        }
        .step-badge {
            font-size: 12px;
            color: var(--primary);
            background-color: var(--primary-subtle);
            padding: 3px 10px;
            border-radius: 12px;
            font-weight: 600;
            letter-spacing: 0.02em;
            white-space: nowrap;
        }

        .wizard-body {
            padding: 20px 36px 36px;
        }

        /* 真实专业技术信息检测列表 */
        .check-box {
            background-color: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: 2px 18px;
            margin-bottom: 22px;
        }
        .check-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid var(--border);
            font-size: 13.5px;
            color: var(--text-2);
            line-height: 1.5;
        }
        .check-row:last-child {
            border-bottom: none;
        }
        .check-name {
            font-weight: 600;
            color: var(--text-1);
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .check-code {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 12px;
            background-color: var(--surface-hover);
            color: var(--text-2);
            padding: 1px 6px;
            border-radius: 4px;
            font-weight: 500;
        }
        .check-desc {
            font-size: 12px;
            color: var(--text-3);
            margin-top: 3px;
        }
        .tag-pass {
            color: var(--success);
            font-weight: 600;
            font-size: 12px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background-color: var(--success-subtle);
            padding: 2.5px 9px;
            border-radius: 20px;
            white-space: nowrap;
        }
        .tag-fail {
            color: var(--danger);
            font-weight: 600;
            font-size: 12px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background-color: var(--danger-subtle);
            padding: 2.5px 9px;
            border-radius: 20px;
            white-space: nowrap;
        }

        /* 表单控件 (温润微边框) */
        .form-group {
            margin-bottom: 18px;
        }
        .form-label {
            font-size: 13px;
            font-weight: 600;
            color: var(--text-1);
            margin-bottom: 7px;
            display: block;
        }
        .form-control {
            width: 100%;
            height: 44px;
            border: 1px solid var(--border-strong);
            border-radius: var(--radius-md);
            padding: 0 14px;
            font-size: 13.5px;
            box-sizing: border-box;
            background-color: var(--surface);
            color: var(--text-1);
            transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .install-domain-select {
            position: absolute;
            right: 8px;
            max-width: 180px;
        }
        .form-control:focus {
            border-color: var(--primary);
            outline: none;
            box-shadow: 0 0 0 3px var(--primary-ring);
        }
        .form-control.m-input-error,
        .form-control.m-input-error:focus {
            border-color: var(--danger);
            box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.14);
        }
        .form-help {
            font-size: 12px;
            color: var(--text-3);
            margin-top: 5px;
            line-height: 1.5;
        }

        /* 底部动作栏 */
        .wizard-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            flex-wrap: wrap;
            margin-top: 28px;
            padding-top: 18px;
            border-top: 1px solid var(--border);
        }
        .btn-wizard {
            height: 38px;
            padding: 0 20px;
            border-radius: var(--radius-md);
            font-size: 13.5px;
            font-weight: 600;
            cursor: pointer;
            border: none;
            box-sizing: border-box;
            white-space: nowrap;
            flex-shrink: 0;
            transition: background 0.15s ease, color 0.15s ease;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }
        @media (max-width: 480px) {
            .wizard-card-header {
                padding: 20px 20px 14px;
            }
            .wizard-body {
                padding: 16px 20px 24px;
            }
            .btn-wizard {
                padding: 0 14px;
                font-size: 13px;
            }
        }
        .btn-prev {
            background-color: var(--canvas);
            color: var(--text-2);
            border: 1px solid var(--border);
        }
        .btn-prev:hover {
            background-color: var(--surface-hover);
            color: var(--text-1);
        }
        .btn-next {
            background-color: var(--primary);
            color: #ffffff;
        }
        .btn-next:hover {
            background-color: var(--primary-hover);
            color: #ffffff;
        }
        .btn-submit {
            background-color: var(--primary);
            color: #ffffff;
        }
        .btn-submit:hover {
            background-color: var(--primary-hover);
        }
        .btn-disabled {
            background-color: var(--surface-active) !important;
            color: var(--text-3) !important;
            box-shadow: none !important;
            cursor: not-allowed !important;
        }

        .alert-box {
            background-color: var(--danger-subtle);
            border: 1px solid var(--danger-border);
            color: var(--danger);
            padding: 12px 16px;
            border-radius: 10px;
            font-size: 13px;
            margin-bottom: 20px;
            line-height: 1.5;
        }

        /* 现代化底部浮层 Toast 消息提示组件 (等级区分: info, success, warning, error) */
        .install-toast-container {
            position: fixed;
            bottom: 32px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 999999;
            pointer-events: none;
            display: flex;
            flex-direction: column-reverse;
            gap: 10px;
            max-width: 90vw;
        }
        .install-toast-item {
            pointer-events: auto;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 18px;
            background: rgba(255, 255, 255, 0.98);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.12), 0 4px 10px -2px rgba(15, 23, 42, 0.05);
            font-size: 13px;
            font-weight: 500;
            color: #1e293b;
            line-height: 1.4;
            opacity: 0;
            transform: translateY(16px) scale(0.96);
            transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
            user-select: none;
        }
        .install-toast-item.show {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
        .install-toast-item.hide {
            opacity: 0;
            transform: translateY(12px) scale(0.96);
        }
        .install-toast-icon {
            font-size: 16px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
        }
        .install-toast-item.toast-success {
            border-color: rgba(22, 163, 74, 0.35);
        }
        .install-toast-item.toast-success .install-toast-icon {
            color: #16a34a;
        }
        .install-toast-item.toast-warning {
            border-color: rgba(245, 158, 11, 0.35);
        }
        .install-toast-item.toast-warning .install-toast-icon {
            color: #f59e0b;
        }
        .install-toast-item.toast-error {
            border-color: rgba(220, 38, 38, 0.35);
        }
        .install-toast-item.toast-error .install-toast-icon {
            color: #dc2626;
        }
        .install-toast-item.toast-info {
            border-color: rgba(2, 132, 199, 0.35);
        }
        .install-toast-item.toast-info .install-toast-icon {
            color: #0284c7;
        }
    </style>
</head>
<body class="page-standalone">

<div class="installer-container">
    <!-- 独立于卡片外部的品牌区域 -->
    <div class="brand-header">
        <div class="logo-wrap">
            <picture>
                <source srcset="assets/images/logo.svg?v=<?php echo APP_VERSION; ?>" type="image/svg+xml">
                <source srcset="assets/images/logo.webp?v=<?php echo APP_VERSION; ?>" type="image/webp">
                <img src="assets/images/logo.png?v=<?php echo APP_VERSION; ?>" alt="立象原型" height="80">
            </picture>
        </div>
        <p class="brand-subtitle">立象以尽意 · 披图而同心</p>
    </div>

    <div class="wizard-card">
        <?php if (!$success): ?>
            <!-- 顶部极简发丝 4 段式进度指示条 -->
            <div class="stepper-segments">
                <div class="stepper-segment <?php echo $isTokenVerified ? 'completed' : 'active'; ?>" id="stepper-seg-1"></div>
                <div class="stepper-segment <?php echo $isTokenVerified ? 'active' : ''; ?>" id="stepper-seg-2"></div>
                <div class="stepper-segment" id="stepper-seg-3"></div>
                <div class="stepper-segment" id="stepper-seg-4"></div>
            </div>

            <!-- 卡片内步骤头部 -->
            <div class="wizard-card-header">
                <div class="step-title-wrap">
                    <h2 id="stepCardTitle"><?php echo $isTokenVerified ? '运行环境检测' : '安装验证'; ?></h2>
                    <p id="stepCardSub"><?php echo $isTokenVerified ? '检查 PHP 版本、核心扩展与目录写入权限' : '验证服务器安装密钥'; ?></p>
                </div>
                <div class="step-badge" id="stepIndicatorBadge"><?php echo $isTokenVerified ? '步骤 02 / 04' : '步骤 01 / 04'; ?></div>
            </div>
        <?php endif; ?>

        <?php if ($success): ?>
            <div class="wizard-body" style="text-align: center; padding: 48px 24px;">
                <div style="font-size: 54px; color: #16a34a; margin-bottom: 16px;">
                    <i class="ri-checkbox-circle-fill"></i>
                </div>
                <h3 style="font-weight: 700; color: #0f172a; margin-bottom: 12px; font-size: 20px;">安装完成</h3>
                <p style="color: #64748b; font-size: 14px; line-height: 1.7; margin-bottom: 32px;">
                    系统全套组件与数据存储已初始化就绪。
                </p>
                <a href="index.php" class="btn-wizard btn-next" style="text-decoration: none; padding: 12px 36px; display: inline-flex; justify-content: center;">
                    进入工作台 <i class="ri-arrow-right-line"></i>
                </a>
            </div>
        <?php elseif (!$isTokenVerified): ?>

            <form id="verifyForm" method="POST" action="" onsubmit="return validateVerifyStep();">
                <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars(get_csrf_token(), ENT_QUOTES, 'UTF-8'); ?>">
                <input type="hidden" name="verify_step" value="1">
                <div class="wizard-body">
                    <?php if (!empty($error)): ?>
                        <div class="alert-box"><?php echo htmlspecialchars($error, ENT_QUOTES, 'UTF-8'); ?></div>
                    <?php elseif (!$checkDataWritable || $expectedInstallToken === ''): ?>
                        <div class="alert-box">data/ 目录不可写，无法生成安装密钥，请先赋予写入权限后再刷新。</div>
                    <?php endif; ?>

                    <div class="form-group">
                        <label class="form-label" for="installTokenInput">安装密钥 <span class="req-star">*</span></label>
                        <input type="text" name="install_token" id="installTokenInput" class="form-control" placeholder="输入 12 位安装密钥" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" maxlength="32" data-error-target="installTokenError" aria-errormessage="installTokenError" <?php echo (!$checkDataWritable || $expectedInstallToken === '') ? 'disabled' : 'autofocus'; ?>>
                        <div class="field-error-tip" id="installTokenError" role="alert"></div>
                        <div class="form-help">请查看服务器 <code>data/install_token.php</code>（或环境变量 <code>PROTOLOFT_INSTALL_TOKEN</code>）</div>
                    </div>

                    <div class="wizard-footer">
                        <div></div>
                        <button type="submit" id="btnVerifyToken" class="btn-wizard btn-next <?php echo (!$checkDataWritable || $expectedInstallToken === '') ? 'btn-disabled' : ''; ?>" <?php echo (!$checkDataWritable || $expectedInstallToken === '') ? 'disabled' : ''; ?>>
                            验证并继续 <i class="ri-arrow-right-line"></i>
                        </button>
                    </div>
                </div>
            </form>

        <?php else: ?>

            <form id="installForm" method="POST" action="">
            <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars(get_csrf_token(), ENT_QUOTES, 'UTF-8'); ?>">
                <div class="wizard-body">
                    <?php if (!empty($error)): ?>
                        <div class="alert-box"><?php echo htmlspecialchars($error, ENT_QUOTES, 'UTF-8'); ?></div>
                    <?php endif; ?>

                    <!-- Step 2: 环境检测 (呈现客观专业的技术细节) -->
                    <div class="step-pane" id="step-2">
                        <div class="check-box">
                            <div class="check-row">
                                <div>
                                    <div class="check-name">
                                        <span>PHP 运行版本</span>
                                        <span class="check-code">PHP &ge; 7.0.0</span>
                                    </div>
                                    <div class="check-desc">支持 PHP 7.0 及以上版本</div>
                                </div>
                                <?php if ($checkPhp): ?>
                                    <span class="tag-pass"><i class="ri-check-line"></i> PHP <?php echo PHP_VERSION; ?></span>
                                <?php else: ?>
                                    <span class="tag-fail"><i class="ri-close-line"></i> 版本过低 (需 &ge; 7.0)</span>
                                <?php endif; ?>
                            </div>

                            <div class="check-row">
                                <div>
                                    <div class="check-name">
                                        <span>PDO 数据库驱动</span>
                                        <span class="check-code">pdo_sqlite</span>
                                    </div>
                                    <div class="check-desc">SQLite 本地数据库驱动</div>
                                </div>
                                <?php if ($checkPdo): ?>
                                    <span class="tag-pass"><i class="ri-check-line"></i> 驱动已就绪</span>
                                <?php else: ?>
                                    <span class="tag-fail"><i class="ri-close-line"></i> 驱动未开启</span>
                                <?php endif; ?>
                            </div>

                            <div class="check-row">
                                <div>
                                    <div class="check-name">
                                        <span>ZipArchive 压缩扩展</span>
                                        <span class="check-code">ZipArchive</span>
                                    </div>
                                    <div class="check-desc">用于原型 ZIP 压缩包自动解压</div>
                                </div>
                                <?php if ($checkZip): ?>
                                    <span class="tag-pass"><i class="ri-check-line"></i> 扩展已就绪</span>
                                <?php else: ?>
                                    <span class="tag-fail"><i class="ri-close-line"></i> 扩展缺失</span>
                                <?php endif; ?>
                            </div>

                            <div class="check-row">
                                <div>
                                    <div class="check-name">
                                        <span>mbstring 编码扩展</span>
                                        <span class="check-code">mbstring</span>
                                    </div>
                                    <div class="check-desc">多语言及中文字符编码支持</div>
                                </div>
                                <?php if ($checkMbstring): ?>
                                    <span class="tag-pass"><i class="ri-check-line"></i> 支持</span>
                                <?php else: ?>
                                    <span class="tag-fail"><i class="ri-close-line"></i> 未开启</span>
                                <?php endif; ?>
                            </div>

                            <div class="check-row">
                                <div>
                                    <div class="check-name">
                                        <span>DOM XML 解析扩展</span>
                                        <span class="check-code">ext-dom / libxml</span>
                                    </div>
                                    <div class="check-desc">矢量图形安全审查与 XML 语义解析</div>
                                </div>
                                <?php if ($checkDom): ?>
                                    <span class="tag-pass"><i class="ri-check-line"></i> 支持</span>
                                <?php else: ?>
                                    <span class="tag-fail"><i class="ri-close-line"></i> 未开启</span>
                                <?php endif; ?>
                            </div>

                            <div class="check-row">
                                <div>
                                    <div class="check-name">
                                        <span>数据存储目录权限</span>
                                        <span class="check-code">data/</span>
                                    </div>
                                    <div class="check-desc">系统数据与配置文件存储目录</div>
                                </div>
                                <?php if ($checkDataWritable): ?>
                                    <span class="tag-pass"><i class="ri-check-line"></i> 可读写</span>
                                <?php else: ?>
                                    <span class="tag-fail"><i class="ri-close-line"></i> 不可写 (请设为 755/777)</span>
                                <?php endif; ?>
                            </div>

                            <div class="check-row">
                                <div>
                                    <div class="check-name">
                                        <span>原型素材目录权限</span>
                                        <span class="check-code">uploads/</span>
                                    </div>
                                    <div class="check-desc">原型发布文件与资源解压目录</div>
                                </div>
                                <?php if ($checkUploadsWritable): ?>
                                    <span class="tag-pass"><i class="ri-check-line"></i> 可读写</span>
                                <?php else: ?>
                                    <span class="tag-fail"><i class="ri-close-line"></i> 不可写 (请设为 755/777)</span>
                                <?php endif; ?>
                            </div>
                        </div>

                        <?php if (!$allPass): ?>
                            <div class="form-help" style="color: #dc2626; margin-bottom: 16px; background:#fef2f2; padding:10px 14px; border-radius:8px;">
                                <i class="ri-information-line"></i> 请先为标记不可写的目录赋予写入权限后再继续。
                            </div>
                        <?php endif; ?>

                        <div class="wizard-footer">
                            <div></div>
                            <button type="button" class="btn-wizard btn-next <?php echo !$allPass ? 'btn-disabled' : ''; ?>" onclick="goToStep(3)" <?php echo !$allPass ? 'disabled' : ''; ?>>
                                下一步：站点与团队 <i class="ri-arrow-right-line"></i>
                            </button>
                        </div>
                    </div>

                <!-- Step 3: 站点与团队 -->
                <div class="step-pane" id="step-3" style="display: none;">
                    <div class="form-group">
                        <label class="form-label" for="installSiteTitleInput">组织名称 <span class="opt-tag">选填</span></label>
                        <input type="text" name="site_title" id="installSiteTitleInput" class="form-control" value="<?php echo htmlspecialchars($formSiteTitle, ENT_QUOTES, 'UTF-8'); ?>" placeholder="例如：某某科技" maxlength="20" data-error-target="installSiteTitleError" aria-errormessage="installSiteTitleError">
                        <div class="field-error-tip" id="installSiteTitleError" role="alert"></div>
                        <div class="form-help">展示在登录页与工作台左上角</div>
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="allowedEmailDomainsInput">
                            <span>允许注册的邮箱域名</span>
                            <span class="opt-tag">选填</span>
                        </label>
                        <input type="text" name="allowed_email_domains" id="allowedEmailDomainsInput" class="form-control" value="<?php echo htmlspecialchars($formAllowedDomains, ENT_QUOTES, 'UTF-8'); ?>" placeholder="例如：company.com, group.cn" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-form-type="other" maxlength="200" data-error-target="allowedEmailDomainsError" aria-errormessage="allowedEmailDomainsError" onblur="cleanEmailDomainsInput(this)">
                        <div class="field-error-tip" id="allowedEmailDomainsError" role="alert"></div>
                        <div class="form-help">多个域名用逗号分隔；留空不限制</div>
                    </div>

                    <div class="wizard-footer">
                        <button type="button" class="btn-wizard btn-prev" onclick="goToStep(2)">
                            <i class="ri-arrow-left-line"></i> 上一步
                        </button>
                        <button type="button" class="btn-wizard btn-next" onclick="validateStep3()">
                            下一步：管理员账号 <i class="ri-arrow-right-line"></i>
                        </button>
                    </div>
                </div>

                <!-- Step 4: 管理员账号 (邮箱 + 真实姓名) -->
                <div class="step-pane" id="step-4" style="display: none;">
                    <div class="form-group">
                        <label class="form-label" for="adminEmailInput">管理员工作邮箱 <span class="req-star">*</span></label>
                        <div style="position:relative;display:flex;align-items:center;">
                            <input type="text" name="admin_email" id="adminEmailInput" class="form-control" value="<?php echo htmlspecialchars($formAdminEmail, ENT_QUOTES, 'UTF-8'); ?>" placeholder="例如：admin@company.com" autocomplete="email" required maxlength="100" data-error-target="adminEmailError" aria-errormessage="adminEmailError" style="flex:1;">
                            <span id="installDomainBadge" style="position:absolute;right:8px;font-size:12px;color:var(--text-3);background:var(--bg-tag,#f1f5f9);border:1px solid var(--border-light,#e2e8f0);padding:2px 7px;border-radius:4px;pointer-events:none;user-select:none;display:none;"></span>
                            <select id="installDomainSelect" class="m-select-sm install-domain-select" aria-label="选择邮箱域名" style="display:none;"></select>
                        </div>
                        <div class="field-error-tip" id="adminEmailError" role="alert"></div>
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="adminNameInput">真实姓名 <span class="req-star">*</span></label>
                        <input type="text" name="admin_name" id="adminNameInput" class="form-control" value="<?php echo htmlspecialchars($formAdminName, ENT_QUOTES, 'UTF-8'); ?>" placeholder="例如：李明" required maxlength="20" data-error-target="adminNameError" aria-errormessage="adminNameError">
                        <div class="field-error-tip" id="adminNameError" role="alert"></div>
                    </div>

                    <div class="form-group">
                        <div class="field-label-row">
                            <label class="form-label" for="adminPassInput">管理员密码 <span class="req-star">*</span></label>
                            <span class="password-strength" id="adminPassStrength" role="status"></span>
                        </div>
                        <input type="password" name="admin_password" id="adminPassInput" class="form-control" placeholder="至少 6 个字符" autocomplete="new-password" required data-password-strength="adminPassStrength" data-error-target="adminPassError" aria-describedby="adminPassStrength" aria-errormessage="adminPassError">
                        <div class="field-error-tip" id="adminPassError" role="alert"></div>
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="adminPassConfirmInput">确认密码 <span class="req-star">*</span></label>
                        <input type="password" name="admin_password_confirm" id="adminPassConfirmInput" class="form-control" placeholder="再次输入密码" autocomplete="new-password" required data-error-target="adminPassConfirmError" aria-describedby="adminPassConfirmError">
                        <div class="field-error-tip" id="adminPassConfirmError" role="alert"></div>
                    </div>

                    <div class="wizard-footer">
                        <button type="button" class="btn-wizard btn-prev" onclick="goToStep(3)">
                            <i class="ri-arrow-left-line"></i> 上一步
                        </button>
                        <button type="button" class="btn-wizard btn-submit" id="btnSubmitInstall" onclick="validateAndSubmit()">
                            <i class="ri-check-line"></i> 立即安装
                        </button>
                    </div>
                </div>
            </div>
        </form>
    <?php endif; ?>
    </div> <!-- .wizard-card -->
</div> <!-- .installer-container -->

<script src="assets/js/password-strength.js?v=<?php echo filemtime(__DIR__ . '/assets/js/password-strength.js'); ?>" defer></script>
<script>
    var currentStep = <?php echo $isTokenVerified ? (int)$initialStep : 1; ?>;
    var stepMeta = [
        { title: '安装验证', sub: '验证服务器安装密钥', badge: '步骤 01 / 04' },
        { title: '运行环境检测', sub: '检查 PHP 版本、核心扩展与目录写入权限', badge: '步骤 02 / 04' },
        { title: '站点与团队', sub: '个性化品牌展示与加入规则', badge: '步骤 03 / 04' },
        { title: '管理员账号设置', sub: '创建首位系统管理员', badge: '步骤 04 / 04' }
    ];

    function reportInstallFieldError(input, message) {
        if (typeof setFieldError === 'function' && input) {
            return setFieldError(input, null, message);
        }
        showToast(message, 'warning');
        if (input && typeof input.focus === 'function') input.focus();
        return true;
    }

    function validateVerifyStep() {
        var input = document.getElementById('installTokenInput');
        var val = input ? input.value.trim() : '';
        if (!val) {
            reportInstallFieldError(input, '请输入安装密钥');
            return false;
        }
        var btn = document.getElementById('btnVerifyToken');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> 验证中...';
        }
        return true;
    }

    function goToStep(step) {
        // 隐藏所有已解锁步骤并更新 4 段进度指示条
        for (var i = 1; i <= 4; i++) {
            var pane = document.getElementById('step-' + i);
            var seg = document.getElementById('stepper-seg-' + i);
            if (pane) pane.style.display = (i === step) ? 'block' : 'none';
            if (seg) {
                if (i < step) {
                    seg.className = 'stepper-segment completed';
                } else if (i === step) {
                    seg.className = 'stepper-segment active';
                } else {
                    seg.className = 'stepper-segment';
                }
            }
        }
        var m = stepMeta[step - 1];
        if (m) {
            var t = document.getElementById('stepCardTitle');
            var s = document.getElementById('stepCardSub');
            var b = document.getElementById('stepIndicatorBadge');
            if (t) t.innerText = m.title;
            if (s) s.innerText = m.sub;
            if (b) b.innerText = m.badge;
        }
        currentStep = step;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function showToast(msg, type) {
        type = type || 'info';
        var iconMap = {
            success: 'ri-checkbox-circle-fill',
            warning: 'ri-alert-fill',
            error: 'ri-error-warning-fill',
            info: 'ri-information-fill'
        };
        var iconClass = iconMap[type] || iconMap.info;

        var container = document.getElementById('installToastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'installToastContainer';
            container.className = 'install-toast-container';
            document.body.appendChild(container);
        }

        var toast = document.createElement('div');
        toast.className = 'install-toast-item toast-' + type;
        toast.innerHTML = '<span class="install-toast-icon"><i class="' + iconClass + '"></i></span>' +
                          '<span>' + msg + '</span>';
        container.appendChild(toast);

        setTimeout(function() {
            toast.classList.add('show');
        }, 15);

        setTimeout(function() {
            toast.classList.remove('show');
            toast.classList.add('hide');
            setTimeout(function() {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
                if (container.children.length === 0 && container.parentNode) {
                    container.parentNode.removeChild(container);
                }
            }, 220);
        }, 2800);
    }

    // 严格企业邮箱域名后缀格式校验 (智能清洗前导 @ 与协议头，只要格式不合法则拦截)
    function validateEmailDomains(val) {
        if (!val || !val.trim()) return { valid: true, clean: '' };
        var rawList = val.replace(/，/g, ',').split(',');
        var cleanList = [];
        var domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;
        for (var i = 0; i < rawList.length; i++) {
            var item = rawList[i].trim().toLowerCase();
            if (!item) continue;
            // 容错：自动去除前导协议头、斜杠以及前导 @ (如用户习惯性输入 @company.com)
            item = item.replace(/^https?:\/\//i, '').replace(/^\/+|\/+$/g, '');
            if (item.charAt(0) === '@') {
                item = item.substring(1).trim();
            }
            if (!item || item.indexOf('@') !== -1 || !domainRegex.test(item)) {
                return { valid: false, item: item };
            }
            cleanList.push(item);
        }
        return { valid: true, clean: cleanList.join(', ') };
    }

    // 失焦时静默规整，绝不主动弹出全局 Toast 打扰用户或跨步骤误报
    function cleanEmailDomainsInput(input) {
        if (!input || !input.value.trim()) return;
        var res = validateEmailDomains(input.value);
        if (res.valid) {
            input.value = res.clean;
        }
    }

    function syncInstallDomainUi() {
        var domainsInput = document.getElementById('allowedEmailDomainsInput');
        var badge = document.getElementById('installDomainBadge');
        var select = document.getElementById('installDomainSelect');
        var emailInput = document.getElementById('adminEmailInput');
        if (!domainsInput || !emailInput) return;

        var domains = domainsInput.value.trim();
        var domainList = domains ? domains.split(',').map(function(s){ return s.trim(); }).filter(Boolean) : [];
        if (domainList.length === 1) {
            // 单域名：静态固化徽标
            if (select) select.style.display = 'none';
            if (badge) {
                badge.textContent = '@' + domainList[0];
                badge.style.display = 'inline-block';
            }
            emailInput.style.paddingRight = (domainList[0].length * 8 + 32) + 'px';
            emailInput.placeholder = '输入邮箱前缀 (例如：admin)';
        } else if (domainList.length > 1) {
            // 多域名：微型内嵌原生下拉切换器
            if (badge) badge.style.display = 'none';
            if (select) {
                select.innerHTML = '';
                for (var i = 0; i < domainList.length; i++) {
                    var opt = document.createElement('option');
                    opt.value = '@' + domainList[i];
                    opt.textContent = '@' + domainList[i];
                    select.appendChild(opt);
                }
                select.style.display = 'inline-block';
                var updateSelectPadding = function() {
                    var chosen = select.value || ('@' + domainList[0]);
                    emailInput.style.paddingRight = (chosen.length * 8 + 42) + 'px';
                };
                select.onchange = updateSelectPadding;
                updateSelectPadding();
            }
            emailInput.placeholder = '输入邮箱前缀 (例如：admin)';
        } else {
            // 无域名：普通标准输入框，不显示徽标和下拉
            if (badge) badge.style.display = 'none';
            if (select) select.style.display = 'none';
            emailInput.style.paddingRight = '14px';
            emailInput.placeholder = '例如：admin@company.com';
        }
    }

    function validateStep3() {
        var titleInput = document.getElementById('installSiteTitleInput') || document.querySelector('input[name="site_title"]');
        var title = titleInput ? titleInput.value.trim() : '';
        if (title.length > 20) {
            reportInstallFieldError(titleInput, '组织名称长度不能超过 20 个字符');
            return;
        }

        // 严格校验企业邮箱域名后缀输入
        var domainsInput = document.getElementById('allowedEmailDomainsInput');
        var rawDomains = domainsInput ? domainsInput.value.trim() : '';
        if (rawDomains) {
            var checkRes = validateEmailDomains(rawDomains);
            if (!checkRes.valid) {
                reportInstallFieldError(domainsInput, '邮箱域名格式不正确，例如 company.com');
                return;
            }
            domainsInput.value = checkRes.clean;
        }

        syncInstallDomainUi();
        goToStep(4);
    }

    <?php if ($isTokenVerified && !$success): ?>
    if (currentStep !== 2) {
        syncInstallDomainUi();
        goToStep(currentStep);
    }
    <?php endif; ?>

    function validateAndSubmit() {
        var emailInput = document.getElementById('adminEmailInput');
        var email = emailInput.value.trim();
        var nameInput = document.getElementById('adminNameInput');
        var name = nameInput.value.trim();
        var passInput = document.getElementById('adminPassInput');
        var pass = passInput.value;
        var passConfirmInput = document.getElementById('adminPassConfirmInput');
        var passConfirm = passConfirmInput.value;
        var domains = document.getElementById('allowedEmailDomainsInput').value.trim();
        var select = document.getElementById('installDomainSelect');

        if (!email) {
            reportInstallFieldError(emailInput, '请输入管理员工作邮箱');
            return;
        }

        var domainList = domains ? domains.split(',').map(function(s){ return s.trim(); }).filter(Boolean) : [];
        var finalEmail = email;

        if (domainList.length === 1) {
            if (finalEmail.indexOf('@') === -1) {
                finalEmail = finalEmail + '@' + domainList[0];
            }
        } else if (domainList.length > 1) {
            if (finalEmail.indexOf('@') === -1 && select && select.value) {
                finalEmail = finalEmail + select.value;
            }
        } else {
            // 未配置企业邮箱域名：必须强制输入包含 @ 的完整邮箱
            if (finalEmail.indexOf('@') === -1) {
                reportInstallFieldError(emailInput, '请输入完整邮箱（例如：admin@company.com）');
                return;
            }
        }

        // 严格邮箱格式校验
        var emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
        if (!emailRegex.test(finalEmail)) {
            reportInstallFieldError(emailInput, '邮箱格式不正确，请输入有效的邮箱地址');
            return;
        }

        if (domainList.length > 0) {
            var parts = finalEmail.toLowerCase().split('@');
            var inputDomain = parts[parts.length - 1];
            if (domainList.indexOf(inputDomain) === -1) {
                reportInstallFieldError(emailInput, '管理员邮箱后缀必须属于所配置的白名单域名');
                return;
            }
        }

        if (!name || name.length < 2 || name.length > 20) {
            reportInstallFieldError(nameInput, '请输入管理员真实姓名（2~20 个字符）');
            return;
        }
        if (typeof showPasswordLengthError === 'function' ? showPasswordLengthError(passInput) : (typeof passwordLengthError === 'function' && passwordLengthError(pass))) {
            if (typeof showPasswordLengthError !== 'function') {
                showToast(passwordLengthError(pass), 'warning');
                passInput.focus();
            }
            return;
        }
        if (typeof showPasswordMismatchError === 'function'
            ? showPasswordMismatchError(passInput, passConfirmInput, null, '两次输入的管理员密码不一致')
            : (pass !== passConfirm)) {
            if (typeof showPasswordMismatchError !== 'function') {
                showToast('两次输入的管理员密码不一致', 'error');
                passConfirmInput.focus();
            }
            return;
        }

        // 所有校验通过后再回写完整邮箱（保留用户选择的域名后缀）并收起右侧后缀控件
        emailInput.value = finalEmail;
        if (domainList.length > 0) {
            var badge = document.getElementById('installDomainBadge');
            if (badge) badge.style.display = 'none';
            if (select) select.style.display = 'none';
            emailInput.style.paddingRight = '14px';
        }

        var btn = document.getElementById('btnSubmitInstall');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> 正在安装...';
        }
        document.getElementById('installForm').submit();
    }
</script>

</body>
</html>
