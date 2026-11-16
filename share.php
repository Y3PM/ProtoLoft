<?php
/**
 * 立象原型 · 单项目专属安全只读分享视图 (share.php)
 * 作用：为外部客户或跨部门协作提供独立的原型预览页面。
 * 安全隔离设计：
 * 1. 物理级数据隔离：绝不输出全站分类树与任何其他项目信息，杜绝商业机密泄露；
 * 2. 支持全站通行密码与单项目独立访问密码双重防御；
 * 3. 沉浸式极简无干扰全屏体验，支持多版本即时切换与 RP 底稿受控下载。
 */

require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/db.php';
require_once __DIR__ . '/includes/auth.php';

// 确保已安装
require_installed();

// 初始化数据库
$db = DB::getInstance();

// 系统品牌与企业名称处理
$systemName = '立象原型';
$systemSlogan = '立象以尽意 · 披图而同心';
$rawTitle = trim(Auth::getSetting('site_title', ''));
$companyName = '';
if (!empty($rawTitle) && $rawTitle !== '立象原型' && $rawTitle !== '立象原型托管平台' && strcasecmp($rawTitle, 'ProtoLoft') !== 0) {
    $companyName = $rawTitle;
}
$siteTitle = !empty($companyName) ? ($companyName . ' · 立象原型') : '立象原型';
$siteSubtitle = $systemSlogan;
$defaultFavicon = file_exists(ROOT_PATH . '/assets/images/favicon.svg') ? 'assets/images/favicon.svg' : 'assets/images/favicon.png';
$siteFavicon = $defaultFavicon;
$favType = (pathinfo($siteFavicon, PATHINFO_EXTENSION) === 'svg') ? 'image/svg+xml' : 'image/png';
$siteFooter = '立象原型 · 企业级产品资产交付中心';
$siteBg = '';

$logoUrl = 'assets/images/logo.png?v=' . APP_VERSION;
$faviconUrl = $siteFavicon . '?v=' . substr(sha1_file(ROOT_PATH . '/' . $siteFavicon), 0, 12);
$bgUrl = '';

$currentUser = Auth::getCurrentUser();
$canManage = Auth::canManage();
$canDownloadRp = ($canManage || Auth::canGuestDownloadRp());
$canAnnotate = $currentUser ? Auth::canAnnotate() : Auth::canGuestAnnotate();

// 获取当前分享的原型 ID 或极简安全短码 (例如 share.php?s=aB8kM9xQ)
$shareCode = trim($_GET['s'] ?? $_GET['code'] ?? '');
$itemId = 0;
$lockedVerId = 0;
$isShortCodeMode = false;
$customShareInfo = null;

if ($shareCode !== '') {
    $codeInfo = Auth::resolveShareCode($shareCode);
    if ($codeInfo) {
        if (!empty($codeInfo['is_revoked'])) {
            http_response_code(403);
            ?>
            <!DOCTYPE html>
            <html lang="zh-CN">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>专属分享链接已作废 - <?php echo htmlspecialchars($siteTitle); ?></title>
                <link rel="icon" href="<?php echo htmlspecialchars($faviconUrl); ?>" type="<?php echo $favType; ?>">
                <link rel="stylesheet" href="assets/css/remixicon.css">
                <style>
                    * { margin:0; padding:0; box-sizing:border-box; }
                    body { min-height:100vh; display:flex; align-items:center; justify-content:center; background:#f7f8fa; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:#182230; }
                    .empty-card { text-align:center; background:#fff; border:1px solid #e7eaf0; border-radius:12px; padding:48px 36px; max-width:420px; box-shadow:0 8px 24px -10px rgba(16,24,40,0.08); }
                    .empty-icon { font-size:48px; color:#dc2626; margin-bottom:12px; }
                    .empty-title { font-size:18px; font-weight:650; margin-bottom:8px; }
                    .empty-desc { font-size:13px; color:#64748b; margin-bottom:24px; line-height:1.6; }
                    .btn-home { display:inline-flex; align-items:center; gap:6px; background:#0076de; color:#fff; padding:9px 20px; border-radius:8px; text-decoration:none; font-size:13.5px; font-weight:600; }
                    .btn-home:hover { background:#005bb5; }
                </style>
            </head>
            <body>
                <div class="empty-card">
                    <i class="ri-forbid-2-line empty-icon"></i>
                    <div class="empty-title">该专属分享链接已作废</div>
                    <div class="empty-desc">该原型的专属外发分享链接已被管理人员作废吊销，请联系分享者获取最新专属有效链接。</div>
                    <a href="index.php" class="btn-home"><i class="ri-home-4-line"></i> 返回主页</a>
                </div>
            </body>
            </html>
            <?php
            exit;
        }
        $itemId = (int)$codeInfo['item_id'];
        $lockedVerId = (int)$codeInfo['ver_id'];
        $isShortCodeMode = true;
        $customShareInfo = $codeInfo;
    } else {
        http_response_code(404);
        ?>
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>分享直链已失效 - <?php echo htmlspecialchars($siteTitle); ?></title>
            <link rel="icon" href="<?php echo htmlspecialchars($faviconUrl); ?>" type="<?php echo $favType; ?>">
            <link rel="stylesheet" href="assets/css/remixicon.css">
            <style>
                * { margin:0; padding:0; box-sizing:border-box; }
                body { min-height:100vh; display:flex; align-items:center; justify-content:center; background:#f7f8fa; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:#182230; }
                .empty-card { text-align:center; background:#fff; border:1px solid #e7eaf0; border-radius:12px; padding:48px 36px; max-width:420px; box-shadow:0 8px 24px -10px rgba(16,24,40,0.08); }
                .empty-icon { font-size:48px; color:#94a3b8; margin-bottom:12px; }
                .empty-title { font-size:18px; font-weight:650; margin-bottom:8px; }
                .empty-desc { font-size:13px; color:#64748b; margin-bottom:24px; line-height:1.6; }
                .btn-home { display:inline-flex; align-items:center; gap:6px; background:#0076de; color:#fff; padding:9px 20px; border-radius:8px; text-decoration:none; font-size:13.5px; font-weight:600; }
                .btn-home:hover { background:#005bb5; }
            </style>
        </head>
        <body>
            <div class="empty-card">
                <i class="ri-link-unlink-m empty-icon"></i>
                <div class="empty-title">链接已失效</div>
                <div class="empty-desc">该分享链接已失效或已被移除</div>
                <a href="index.php" class="btn-home"><i class="ri-home-4-line"></i> 返回主页</a>
            </div>
        </body>
        </html>
        <?php
        exit;
    }
} else {
    $itemId = (int)($_GET['id'] ?? $_GET['item'] ?? 0);
}

// 查询单条项目
$stmt = $db->prepare("SELECT * FROM items WHERE id = ?");
$stmt->execute([$itemId]);
$item = $stmt->fetch();

// 1. 项目不存在处理
if (!$item) {
    http_response_code(404);
    ?>
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>原型不存在或已移除 - <?php echo htmlspecialchars($siteTitle); ?></title>
        <link rel="icon" href="<?php echo htmlspecialchars($faviconUrl); ?>" type="<?php echo $favType; ?>">
        <link rel="stylesheet" href="assets/css/remixicon.css">
        <style>
            * { margin:0; padding:0; box-sizing:border-box; }
            body { min-height:100vh; display:flex; align-items:center; justify-content:center; background:#f7f8fa; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:#182230; }
            .empty-card { text-align:center; background:#fff; border:1px solid #e7eaf0; border-radius:12px; padding:48px 36px; max-width:420px; box-shadow:0 8px 24px -10px rgba(16,24,40,0.08); }
            .empty-icon { font-size:48px; color:#94a3b8; margin-bottom:12px; }
            .empty-title { font-size:18px; font-weight:650; margin-bottom:8px; }
            .empty-desc { font-size:13px; color:#64748b; margin-bottom:24px; line-height:1.6; }
            .btn-home { display:inline-flex; align-items:center; gap:6px; background:#0076de; color:#fff; padding:9px 20px; border-radius:8px; text-decoration:none; font-size:13.5px; font-weight:600; }
            .btn-home:hover { background:#005bb5; }
        </style>
    </head>
    <body>
        <div class="empty-card">
            <i class="ri-file-search-line empty-icon"></i>
            <div class="empty-title">内容不存在</div>
            <div class="empty-desc">项目不存在或已被移除</div>
            <a href="index.php" class="btn-home"><i class="ri-home-4-line"></i> 返回主页</a>
        </div>
    </body>
    </html>
    <?php
    exit;
}

// 2. 隐藏状态拦截 (非登录管理员不可看)
if ((int)$item['is_visible'] === 0 && !$canManage) {
    http_response_code(403);
    ?>
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>原型暂未公开 - <?php echo htmlspecialchars($siteTitle); ?></title>
        <link rel="icon" href="<?php echo htmlspecialchars($faviconUrl); ?>" type="<?php echo $favType; ?>">
        <link rel="stylesheet" href="assets/css/remixicon.css">
        <style>
            * { margin:0; padding:0; box-sizing:border-box; }
            body { min-height:100vh; display:flex; align-items:center; justify-content:center; background:#f7f8fa; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:#182230; }
            .empty-card { text-align:center; background:#fff; border:1px solid #e7eaf0; border-radius:12px; padding:48px 36px; max-width:420px; box-shadow:0 8px 24px -10px rgba(16,24,40,0.08); }
            .empty-icon { font-size:48px; color:#f59e0b; margin-bottom:12px; }
            .empty-title { font-size:18px; font-weight:650; margin-bottom:8px; }
            .empty-desc { font-size:13px; color:#64748b; margin-bottom:24px; line-height:1.6; }
            .btn-home { display:inline-flex; align-items:center; gap:6px; background:#0076de; color:#fff; padding:9px 20px; border-radius:8px; text-decoration:none; font-size:13.5px; font-weight:600; }
        </style>
    </head>
    <body>
        <div class="empty-card">
            <i class="ri-eye-off-line empty-icon"></i>
            <div class="empty-title">暂未公开</div>
            <div class="empty-desc">该项目暂未对外公开</div>
            <a href="index.php" class="btn-home"><i class="ri-lock-line"></i> 管理员登录</a>
        </div>
    </body>
    </html>
    <?php
    exit;
}

// 3. 检查默认公共直链是否已被管理员停用 (专属临时外发链接独立受控，不受此开关拦截)
$isCustomShare = ($isShortCodeMode && !empty($customShareInfo) && (!empty($customShareInfo['is_custom']) || ($shareCode !== ($item['share_code'] ?? ''))));

if (!$canManage && !$isCustomShare && Auth::isItemShareDisabled($item['id'])) {
    http_response_code(403);
    ?>
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>公共直链已暂停 - <?php echo htmlspecialchars($siteTitle); ?></title>
        <link rel="icon" href="<?php echo htmlspecialchars($faviconUrl); ?>" type="<?php echo $favType; ?>">
        <link rel="stylesheet" href="assets/css/remixicon.css">
        <style>
            * { margin:0; padding:0; box-sizing:border-box; }
            body { min-height:100vh; display:flex; align-items:center; justify-content:center; background:#f7f8fa; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:#182230; }
            .empty-card { text-align:center; background:#fff; border:1px solid #e7eaf0; border-radius:12px; padding:48px 36px; max-width:420px; box-shadow:0 8px 24px -10px rgba(16,24,40,0.08); }
            .empty-icon { font-size:48px; color:#f59e0b; margin-bottom:12px; }
            .empty-title { font-size:18px; font-weight:650; margin-bottom:8px; }
            .empty-desc { font-size:13px; color:#64748b; margin-bottom:24px; line-height:1.6; }
            .btn-home { display:inline-flex; align-items:center; gap:6px; background:#0076de; color:#fff; padding:9px 20px; border-radius:8px; text-decoration:none; font-size:13.5px; font-weight:600; }
            .btn-home:hover { background:#005bb5; }
        </style>
    </head>
    <body>
        <div class="empty-card">
            <i class="ri-forbid-line empty-icon"></i>
            <div class="empty-title">链接已暂停</div>
            <div class="empty-desc">该链接已被暂停访问</div>
            <a href="index.php" class="btn-home"><i class="ri-home-4-line"></i> 返回主页</a>
        </div>
    </body>
    </html>
    <?php
    exit;
}

// 3.1 检查外链分享是否已过有效期 (仅针对非登录管理人员)
// 优先使用专属临时分享设定的有效期，兜底使用项目全局分享有效期
$effectiveExpiresAt = '';
if ($isShortCodeMode && !empty($customShareInfo['expires_at'])) {
    $effectiveExpiresAt = $customShareInfo['expires_at'];
} elseif (!$isCustomShare && !empty($item['share_expires_at'])) {
    $effectiveExpiresAt = $item['share_expires_at'];
}

if (!$canManage && !empty($effectiveExpiresAt)) {
    $expireTime = strtotime($effectiveExpiresAt);
    if ($expireTime !== false && $expireTime < time()) {
        http_response_code(403);
        ?>
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>分享链接已到期 - <?php echo htmlspecialchars($siteTitle); ?></title>
            <link rel="icon" href="<?php echo htmlspecialchars($faviconUrl); ?>" type="<?php echo $favType; ?>">
            <link rel="stylesheet" href="assets/css/remixicon.css">
            <style>
                * { margin:0; padding:0; box-sizing:border-box; }
                body { min-height:100vh; display:flex; align-items:center; justify-content:center; background:#f7f8fa; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:#182230; }
                .empty-card { text-align:center; background:#fff; border:1px solid #e7eaf0; border-radius:12px; padding:48px 36px; max-width:420px; box-shadow:0 8px 24px -10px rgba(16,24,40,0.08); }
                .empty-icon { font-size:48px; color:#f59e0b; margin-bottom:12px; }
                .empty-title { font-size:18px; font-weight:650; margin-bottom:8px; }
                .empty-desc { font-size:13px; color:#64748b; margin-bottom:24px; line-height:1.6; }
                .btn-home { display:inline-flex; align-items:center; gap:6px; background:#0076de; color:#fff; padding:9px 20px; border-radius:8px; text-decoration:none; font-size:13.5px; font-weight:600; }
                .btn-home:hover { background:#005bb5; }
            </style>
        </head>
        <body>
            <div class="empty-card">
                <i class="ri-time-line empty-icon"></i>
                <div class="empty-title">链接已过期</div>
                <div class="empty-desc">访问有效期截止于 <?php echo htmlspecialchars($effectiveExpiresAt); ?></div>
                <a href="index.php" class="btn-home"><i class="ri-home-4-line"></i> 返回主页</a>
            </div>
        </body>
        </html>
        <?php
        exit;
    }
}

// 4. 查询该项目所有版本并精准确定当前请求的版本
$versions = [];
if ($item['type'] === 'project') {
    $vStmt = $db->prepare("SELECT * FROM versions WHERE item_id = ? ORDER BY is_default DESC, id DESC");
    $vStmt->execute([$item['id']]);
    $versions = $vStmt->fetchAll();
    foreach ($versions as &$v) {
        if (!empty($v['created_at'])) $v['created_at'] = Auth::toLocalTime($v['created_at']);
        if (!empty($v['updated_at'])) $v['updated_at'] = Auth::toLocalTime($v['updated_at']);
    }
    unset($v);
}

// 确定当前请求的目标版本
$curVersion = null;
if ($isShortCodeMode && $lockedVerId > 0) {
    // 极简短码模式：直接根据短码绑定版本锁定目标版本，禁止篡改
    foreach ($versions as $v) {
        if ((int)$v['id'] === $lockedVerId) {
            $curVersion = $v;
            break;
        }
    }
} elseif (!$canManage) {
    // 未绑定具体版本的外发链接只授权当前默认版本，参数不能扩大授权范围。
    foreach ($versions as $v) {
        if ((int)$v['is_default'] === 1) {
            $curVersion = $v;
            break;
        }
    }
} else {
    // 内部管理者可按参数切换版本。
    $hasVerParam = (isset($_GET['vid']) && $_GET['vid'] !== '') || (isset($_GET['v']) && trim($_GET['v']) !== '');
    $reqVerId = (int)($_GET['vid'] ?? 0);
    $reqVerName = trim($_GET['v'] ?? '');

    if (!empty($versions)) {
        if ($reqVerId > 0) {
            foreach ($versions as $v) {
                if ((int)$v['id'] === $reqVerId) {
                    $curVersion = $v;
                    break;
                }
            }
        }
        if (!$curVersion && $reqVerName !== '') {
            foreach ($versions as $v) {
                if ($v['version_name'] === $reqVerName) {
                    $curVersion = $v;
                    break;
                }
            }
        }
        // 仅在访问未显式指定版本参数时，才自动定位默认主版本
        if (!$curVersion && !$hasVerParam) {
            foreach ($versions as $v) {
                if ((int)$v['is_default'] === 1) {
                    $curVersion = $v;
                    break;
                }
            }
            if (!$curVersion) {
                $curVersion = $versions[0];
            }
        }
    }

    // 若显式传入了版本参数但未找到对应版本 (参数被篡改或版本不存在)，且非管理员：直接拒止拦截
    if ($hasVerParam && !$curVersion && !$canManage) {
        http_response_code(403);
        ?>
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>需要安全授权 - <?php echo htmlspecialchars($siteTitle); ?></title>
            <link rel="icon" href="<?php echo htmlspecialchars($faviconUrl); ?>" type="<?php echo $favType; ?>">
            <link rel="stylesheet" href="assets/css/remixicon.css">
            <style>
                * { margin:0; padding:0; box-sizing:border-box; }
                body { min-height:100vh; display:flex; align-items:center; justify-content:center; background:#f7f8fa; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:#182230; }
                .empty-card { text-align:center; background:#fff; border:1px solid #e7eaf0; border-radius:12px; padding:48px 36px; max-width:420px; box-shadow:0 8px 24px -10px rgba(16,24,40,0.08); }
                .empty-icon { font-size:48px; color:#dc2626; margin-bottom:12px; }
                .empty-title { font-size:18px; font-weight:650; margin-bottom:8px; }
                .empty-desc { font-size:13px; color:#64748b; margin-bottom:24px; line-height:1.6; }
                .btn-home { display:inline-flex; align-items:center; gap:6px; background:#0076de; color:#fff; padding:9px 20px; border-radius:8px; text-decoration:none; font-size:13.5px; font-weight:600; }
                .btn-home:hover { background:#005bb5; }
            </style>
        </head>
        <body>
            <div class="empty-card">
                <i class="ri-shield-keyhole-line empty-icon"></i>
                <div class="empty-title">访问凭证无效</div>
                <div class="empty-desc">未携带有效凭证或链接不正确</div>
                <a href="index.php" class="btn-home"><i class="ri-home-4-line"></i> 返回主页</a>
            </div>
        </body>
        </html>
        <?php
        exit;
    }
}

$curVerId = $curVersion ? (int)$curVersion['id'] : 0;
$curVerName = $curVersion['version_name'] ?? '';
$curShareCode = $shareCode;
$validToken = '';

// 5. 项目专属安全凭证校验
// 短码模式下由服务端安全映射验证；无短码时仅允许内部管理人员查看
if (!$isShortCodeMode) {
    $isTokenValid = false; // 新版对外仅使用可撤销的分享短码。

    // 若非登录管理员，且 Token 校验未通过：直接拦截拒止 (防止横向遍历、跨版本越权刺探或无凭证探测)
    if (!$canManage && !$isTokenValid) {
        http_response_code(403);
        ?>
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>需要安全授权 - <?php echo htmlspecialchars($siteTitle); ?></title>
            <link rel="icon" href="<?php echo htmlspecialchars($faviconUrl); ?>" type="<?php echo $favType; ?>">
            <link rel="stylesheet" href="assets/css/remixicon.css">
            <style>
                * { margin:0; padding:0; box-sizing:border-box; }
                body { min-height:100vh; display:flex; align-items:center; justify-content:center; background:#f7f8fa; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:#182230; }
                .empty-card { text-align:center; background:#fff; border:1px solid #e7eaf0; border-radius:12px; padding:48px 36px; max-width:420px; box-shadow:0 8px 24px -10px rgba(16,24,40,0.08); }
                .empty-icon { font-size:48px; color:#dc2626; margin-bottom:12px; }
                .empty-title { font-size:18px; font-weight:650; margin-bottom:8px; }
                .empty-desc { font-size:13px; color:#64748b; margin-bottom:24px; line-height:1.6; }
                .btn-home { display:inline-flex; align-items:center; gap:6px; background:#0076de; color:#fff; padding:9px 20px; border-radius:8px; text-decoration:none; font-size:13.5px; font-weight:600; }
                .btn-home:hover { background:#005bb5; }
            </style>
        </head>
        <body>
            <div class="empty-card">
                <i class="ri-shield-keyhole-line empty-icon"></i>
                <div class="empty-title">访问凭证无效</div>
                <div class="empty-desc">未携带有效凭证或链接不正确</div>
                <a href="index.php" class="btn-home"><i class="ri-home-4-line"></i> 返回主页</a>
            </div>
        </body>
        </html>
        <?php
        exit;
    }
}

// 6. 单项目独立密码拦截 (Session + 30天安全签名 Cookie 双保险)
// 若通过专属临时短码访问且配置了专属密码，则优先按专属密码鉴权；否则使用项目全局密码
$projectPwd = '';
if ($isCustomShare) {
    $projectPwd = trim($customShareInfo['access_password'] ?? '');
} else {
    $projectPwd = trim($item['access_password'] ?? '');
}

$isProjectAuthPassed = false;
$codeSuffix = ($isShortCodeMode && !empty($shareCode)) ? '_' . substr(md5($shareCode), 0, 8) : '';
$sessionKey = 'item_auth_' . (int)$item['id'] . $codeSuffix;
$cookieName = 'ue_item_auth_' . (int)$item['id'] . $codeSuffix;
$shareCookieSecret = Auth::getSetting('share_cookie_secret', '');
if (empty($shareCookieSecret)) {
    try {
        $shareCookieSecret = bin2hex(random_bytes(32));
    } catch (Exception $e) {
        $shareCookieSecret = md5(uniqid('share_salt_', true) . microtime(true));
    }
    Auth::setSetting('share_cookie_secret', $shareCookieSecret);
}
$expectedCookieToken = ($projectPwd !== '') ? hash_hmac('sha256', 'item_' . (int)$item['id'] . '_' . $projectPwd . $codeSuffix, $shareCookieSecret) : '';

if ($projectPwd === '' || $canManage) {
    $isProjectAuthPassed = true;
} elseif (is_string($_SESSION[$sessionKey] ?? null) && hash_equals($expectedCookieToken, $_SESSION[$sessionKey])) {
    $isProjectAuthPassed = true;
} elseif (!empty($_COOKIE[$cookieName]) && !empty($expectedCookieToken) && hash_equals($expectedCookieToken, $_COOKIE[$cookieName])) {
    $_SESSION[$sessionKey] = $expectedCookieToken;
    $isProjectAuthPassed = true;
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['project_password'])) {
    if (!Auth::checkThrottle('share_pwd_' . $sessionKey, 10, 900)) {
        http_response_code(429); exit('尝试过多，请稍后重试');
    }
    if (hash_equals($projectPwd, (string)$_POST['project_password'])) {
        Auth::clearThrottle('share_pwd_' . $sessionKey);
        $_SESSION[$sessionKey] = $expectedCookieToken;

        // 兼容 HTTPS 反代转 HTTP(80) 回源且剥离协议头：口令已核验通过，按同域 HTTPS Origin 升级本响应 Cookie 为 Secure
        if (app_is_proxy_https_origin_candidate()) {
            $GLOBALS['app_force_https'] = true;
        }
        $isHttps = app_is_https();
        if ($isHttps && empty(session_get_cookie_params()['secure']) && !headers_sent()) {
            $sessionCookiePrefix = 'Set-Cookie: ' . session_name() . '=';
            foreach (headers_list() as $hdr) {
                if (stripos($hdr, $sessionCookiePrefix) === 0) {
                    app_regenerate_session(false);
                    break;
                }
            }
        }

        // 写入 30 天专属凭据 Cookie，即使 Session 偶发断连也能顺畅通行
        $expire = time() + 30 * 86400;
        if (PHP_VERSION_ID >= 70300) {
            setcookie($cookieName, $expectedCookieToken, [
                'expires' => $expire,
                'path' => '/',
                'httponly' => true,
                'samesite' => 'Lax',
                'secure' => $isHttps,
            ]);
        } else {
            setcookie($cookieName, $expectedCookieToken, $expire, '/', '', $isHttps, true);
        }
        $_COOKIE[$cookieName] = $expectedCookieToken;

        // 关键步骤：显式持久化 Session 数据落盘，杜绝 exit 导致会话丢失
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }

        // 精准重定向回用户当前访问的原始 URL
        $redirectUrl = !empty($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : ('share.php?s=' . urlencode($shareCode));
        header("Location: " . $redirectUrl);
        exit;
    } else {
        Auth::recordThrottleFailure('share_pwd_' . $sessionKey);
        $projectPwdError = '密码错误，请重新输入';
    }
}

if (!$isProjectAuthPassed) {
    ?>
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>请输入项目访问密码 - <?php echo htmlspecialchars($item['name']); ?></title>
        <link rel="icon" href="<?php echo htmlspecialchars($faviconUrl); ?>" type="<?php echo $favType; ?>">
        <link rel="stylesheet" href="assets/css/remixicon.css">
        <link rel="stylesheet" href="assets/css/app.css?v=<?php echo APP_VERSION . '.' . filemtime(__DIR__ . '/assets/css/app.css'); ?>">
        <style>
            .lock-icon-wrap { width:52px; height:52px; background:var(--primary-subtle); color:var(--primary); border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:24px; margin-bottom:16px; }
            .auth-title { font-size:18px; font-weight:700; color:var(--text-1); margin-bottom:6px; }
            .auth-sub { font-size:13.5px; color:var(--text-3); margin-bottom:24px; word-break:break-all; }
        </style>
    </head>
    <body class="page-standalone">
        <div class="standalone-card" style="text-align: center;">
            <div class="lock-icon-wrap"><i class="ri-shield-keyhole-line"></i></div>
            <div class="auth-title">输入访问密码</div>
            <div class="auth-sub"><?php echo htmlspecialchars($item['name']); ?></div>
            <form method="POST" autocomplete="off">
                <div style="margin-bottom: 18px; position:relative; display:flex; align-items:center;">
                    <input type="text" id="shareProjPwdInput" name="project_password" class="form-control" placeholder="输入项目访问密码" autocomplete="off" data-lpignore="true" data-1p-ignore="true" style="-webkit-text-security: disc; text-security: disc; padding-right: 38px;" autofocus required>
                    <button type="button" onclick="toggleShareProjPwdMask(this)" style="position:absolute;right:8px;background:none;border:none;color:var(--text-3);cursor:pointer;padding:4px 6px;font-size:16px;display:flex;align-items:center;" title="显示/隐藏密码">
                        <i class="ri-eye-line"></i>
                    </button>
                </div>
                <button type="submit" class="btn-submit">进入预览</button>
                <?php if (!empty($projectPwdError)): ?>
                    <div class="error-tip" style="display:block;"><?php echo htmlspecialchars($projectPwdError); ?></div>
                <?php endif; ?>
            </form>
        </div>
        <script>
            function toggleShareProjPwdMask(btnEl) {
                var input = document.getElementById('shareProjPwdInput');
                if (!input) return;
                var isMasked = input.style.webkitTextSecurity !== 'none';
                if (isMasked) {
                    input.style.webkitTextSecurity = 'none';
                    input.style.textSecurity = 'none';
                } else {
                    input.style.webkitTextSecurity = 'disc';
                    input.style.textSecurity = 'disc';
                }
                var icon = btnEl ? btnEl.querySelector('i') : null;
                if (icon) {
                    icon.className = isMasked ? 'ri-eye-off-line' : 'ri-eye-line';
                }
            }
        </script>
    </body>
    </html>
    <?php
    exit;
}

// 入口文件和 RP 文件
if ($curVersion || ($item['type'] ?? '') === 'link') {
    Auth::grantShareAccess($item, $curVersion, $shareCode, $projectPwd, $validToken);
}
$entryFile = ($item['type'] === 'link') ? ($item['link_url'] ?? '') : ($curVersion ? Auth::assetUrl($curVersion) : '');
$rpFile = $curVersion['rp_file'] ?? '';
$curVerName = $curVersion['version_name'] ?? '';
$updateTime = $curVersion['updated_at'] ?? '';
$verCount = count($versions);

// 专属短码累计访问计数埋点
if ($isShortCodeMode && !empty($shareCode)) {
    Auth::recordShareCodeView($shareCode);
}

// 审计埋点：记录原型直链访问日志
Auth::recordAccessLog($item['id'], $item['name'], $curVerName, 'share');
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($item['name']); ?> - <?php echo htmlspecialchars($siteTitle); ?></title>
    <link rel="icon" href="<?php echo htmlspecialchars($faviconUrl); ?>" type="<?php echo $favType; ?>">
    <link rel="stylesheet" href="assets/css/app.css?v=<?php echo APP_VERSION . '.' . filemtime(__DIR__ . '/assets/css/app.css'); ?>">
    <link rel="stylesheet" href="assets/css/remixicon.css">
    <script src="assets/js/jquery.min.js"></script>
    <style>
        html, body {
            margin: 0;
            padding: 0;
            height: 100%;
            overflow: hidden;
            background: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
            -webkit-font-smoothing: antialiased;
        }
        .share-app {
            display: flex;
            flex-direction: column;
            height: 100%;
            width: 100%;
        }
        .share-navbar {
            height: var(--topbar-height, 48px);
            background: var(--surface, #ffffff);
            border-bottom: 1px solid var(--border, #e7eaf0);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 16px;
            flex-shrink: 0;
            z-index: 100;
        }
        .share-left {
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 0;
        }
        .share-brand {
            display: flex;
            align-items: center;
            gap: 8px;
            text-decoration: none;
            color: var(--text-1, #182230);
            font-weight: 650;
            font-size: 13.5px;
            flex-shrink: 0;
        }
        .share-brand img {
            height: 24px;
            width: auto;
            object-fit: contain;
        }
        .share-divider {
            width: 1px;
            height: 16px;
            background: var(--border, #e7eaf0);
            flex-shrink: 0;
        }
        .share-title {
            font-size: 14.5px;
            font-weight: 650;
            color: var(--text-1, #182230);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .share-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-shrink: 0;
        }
        .share-viewport {
            flex: 1;
            position: relative;
            background: #ffffff;
            height: calc(100% - 48px);
            overflow: hidden;
        }
        .share-viewport iframe {
            width: 100%;
            height: 100%;
            border: none;
            display: block;
        }
        .share-empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--text-3, #94a3b8);
        }
    </style>
</head>
<body>

<div class="share-app" id="shareApp">
    <!-- 顶部单项目独立栏 -->
    <header class="share-navbar">
        <div class="share-left">
            <a href="index.php" class="share-brand" title="<?php echo htmlspecialchars($siteTitle); ?>">
                <img src="assets/images/logo-icon.svg?v=<?php echo APP_VERSION; ?>" alt="立象原型" onerror="this.style.display='none'">
                <?php if (!empty($companyName)): ?>
                    <span style="font-weight:600;font-size:14px;color:var(--text-1);"><?php echo htmlspecialchars($companyName); ?></span>
                <?php else: ?>
                    <span>立象原型</span>
                <?php endif; ?>
            </a>

            <div class="share-divider"></div>

            <span class="share-title" title="<?php echo htmlspecialchars($item['name']); ?>">
                <?php echo htmlspecialchars($item['name']); ?>
            </span>

            <!-- 版本切换组件 (安全红线：外部只读分享页面绝对不显示版本切换下拉框，禁止外部切换版本；仅内部登录管理人员可见) -->
            <?php if ($canManage && $verCount > 1): ?>
                <select class="top-ver-select" id="shareVerSelect" onchange="onShareVersionChange(this)">
                    <?php foreach ($versions as $v): 
                        $vShareCode = $shareCode;
                        $vToken = '';
                    ?>
                        <option value="<?php echo htmlspecialchars(Auth::assetUrl($v)); ?>"
                                data-ver="<?php echo htmlspecialchars($v['version_name']); ?>"
                                data-ver-id="<?php echo htmlspecialchars($v['id']); ?>"
                                data-share-code="<?php echo htmlspecialchars($vShareCode); ?>"
                                data-token="<?php echo htmlspecialchars($vToken); ?>"
                                data-rp="<?php echo htmlspecialchars($v['rp_file'] ?? ''); ?>"
                                data-time="<?php echo htmlspecialchars($v['updated_at'] ?? ''); ?>"
                                data-changelog="<?php echo htmlspecialchars($v['changelog'] ?? '', ENT_QUOTES); ?>"
                                <?php echo ($curVersion && $v['id'] === $curVersion['id']) ? 'selected' : ''; ?>>
                            <?php echo htmlspecialchars($v['version_name']); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            <?php elseif (!empty($curVerName)): ?>
                <span class="current-ver-tag"><?php echo htmlspecialchars($curVerName); ?></span>
            <?php endif; ?>

            <div class="top-changelog-wrap">
                <button type="button" class="btn-top-changelog" id="btnShareChangelog" onclick="toggleShareChangelog(this)" title="查看更新日志" style="display:<?php echo !empty($curVersion['changelog']) ? 'inline-flex' : 'none'; ?>;">
                    <i class="ri-file-list-2-line"></i> 日志
                </button>
                <div class="top-changelog-popover" id="shareChangelogPopover" style="display:none;" onclick="event.stopPropagation()">
                    <div class="top-changelog-head">
                        <div class="top-changelog-head-left">
                            <span class="top-changelog-title"><i class="ri-file-list-2-line" style="color:var(--primary);"></i> 更新日志</span>
                            <span class="top-changelog-ver" id="shareChangelogVerName"><?php echo !empty($curVerName) ? (' · ' . htmlspecialchars($curVerName)) : ''; ?></span>
                        </div>
                        <button type="button" class="close-x" onclick="toggleShareChangelog(false)" title="关闭 (ESC)"><i class="ri-close-line"></i></button>
                    </div>
                    <div class="top-changelog-body" id="shareChangelogBody"></div>
                </div>
            </div>

            <?php if (!empty($updateTime)): ?>
                <span class="current-update-time" id="shareUpdateTime" style="display:inline-block;"><i class="ri-time-line" style="margin-right:3px;font-size:12px;opacity:0.85;"></i>更新于 <?php echo htmlspecialchars($updateTime); ?></span>
            <?php else: ?>
                <span class="current-update-time" id="shareUpdateTime" style="display:none;"></span>
            <?php endif; ?>
        </div>

        <div class="share-actions">
            <!-- RP 下载 (内部管理人员，或已授权访客可见) -->
            <?php
                $canDownloadRp = Auth::canDownloadRp($currentUser, $item, $curVersion);
                if ($canDownloadRp):
            ?>
                <?php
                    $downloadUrl = 'api.php?action=download_rp&item_id=' . $item['id'] . ($curVersion ? '&ver_id=' . $curVersion['id'] : '');
                    $safeItemName = preg_replace('/[\\\\\\/:*?"<>|]/', '_', trim($item['name'] ?? 'prototype'));
                    if ($safeItemName === '') {
                        $safeItemName = 'prototype';
                    }
                    $safeVerName = !empty($curVerName) ? ('_' . preg_replace('/[\\\\\\/:*?"<>|]/', '_', trim($curVerName))) : '';
                    $defaultDownloadFilename = $safeItemName . $safeVerName . '.rp';
                    $hasInitialRp = !empty($rpFile);
                ?>
                <a href="<?php echo htmlspecialchars($downloadUrl); ?>" id="btnShareDownloadRp" class="btn-tool btn-tool-primary" download="<?php echo htmlspecialchars($defaultDownloadFilename); ?>" style="<?php echo $hasInitialRp ? '' : 'display:none;'; ?>">
                    <i class="ri-download-cloud-2-line"></i> 下载 RP
                </a>
            <?php endif; ?>

            <button class="btn-tool" onclick="reloadShareFrame()" title="刷新"><i class="ri-refresh-line"></i> 刷新</button>
            <?php if ($canAnnotate): ?>
                <button class="btn-tool" id="btnToggleAnnotation" onclick="toggleAnnotationDrawer()" title="页面批注与协作讨论 (快捷键 C)">
                    <i class="ri-chat-3-line"></i> 批注
                    <span id="annoHeaderBadge" class="anno-badge" style="display:none;">0</span>
                </button>
            <?php endif; ?>
            <button class="btn-tool" onclick="toggleShareFullscreen()" title="全屏"><i class="ri-fullscreen-line"></i> 全屏</button>

            <?php if ($canManage): ?>
                <a href="index.php#item=<?php echo $item['id']; ?><?php echo $curVerName ? '&v=' . urlencode($curVerName) : ''; ?>" class="btn-tool" title="进入后台工作台">
                    <i class="ri-dashboard-line"></i> 工作台
                </a>
            <?php endif; ?>
        </div>
    </header>

    <!-- 沉浸式展示视口 -->
    <main class="share-viewport" id="shareViewport">
        <?php if (!empty($entryFile)): ?>
            <?php $isWatermarkActive = (Auth::getSetting('global_watermark_enabled', '0') === '1'); ?>
            <iframe id="shareFrame" src="<?php echo htmlspecialchars($entryFile); ?>" sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"></iframe>
            <?php if ($isWatermarkActive): ?>
                <div id="shareWatermarkOverlay" class="watermark-overlay"></div>
            <?php endif; ?>
        <?php else: ?>
            <div class="share-empty">
                <i class="ri-inbox-line" style="font-size:36px;margin-bottom:8px;opacity:0.5;"></i>
                <div style="font-size:13.5px;font-weight:500;color:var(--text-3);">暂无在线版本</div>
            </div>
        <?php endif; ?>

        <?php if ($canAnnotate): ?>
        <!-- 右侧可折叠批注抽屉 (350px) -->
        <div id="annotationDrawer" class="annotation-drawer drawer-collapsed" style="display:none;">
            <div class="anno-header">
                <div class="anno-header-title">
                    <i class="ri-chat-3-line" style="color:var(--primary);"></i>
                    <span>页面批注</span>
                </div>
                <div class="anno-filter-chips anno-scope-chips">
                    <button type="button" class="anno-filter-btn active" id="annoFilterCurPage" onclick="switchAnnoFilterMode('page')">本页</button>
                    <button type="button" class="anno-filter-btn" id="annoFilterAllPages" onclick="switchAnnoFilterMode('all')">全部</button>
                </div>
                <button type="button" class="close-x" onclick="toggleAnnotationDrawer(false)" title="收起"><i class="ri-close-line"></i></button>
            </div>

            <div class="anno-context-bar">
                <div class="anno-cur-page" id="annoCurPageWrap" title="当前页面">
                    <i class="ri-file-text-line"></i>
                    <span class="anno-cur-page-label">当前页：</span>
                    <span id="annoCurPageTitle">当前页面</span>
                </div>
            </div>

            <div class="anno-status-bar">
                <div class="anno-filter-chips anno-status-chips">
                    <button type="button" class="anno-filter-btn active" id="annoStatusAll" onclick="switchAnnoStatusFilter('all')">全部</button>
                    <button type="button" class="anno-filter-btn" id="annoStatusPending" onclick="switchAnnoStatusFilter('pending')">待处理</button>
                    <button type="button" class="anno-filter-btn" id="annoStatusResolved" onclick="switchAnnoStatusFilter('resolved')">已解决</button>
                </div>
            </div>

            <div class="anno-body" id="annoListBody">
                <div style="padding:32px 16px;text-align:center;color:var(--text-3);font-size:12px;">加载中...</div>
            </div>

            <div class="anno-footer">
                <textarea id="annoNewInput" class="anno-input-textarea" placeholder="对此页面发表批注或疑问... (Cmd/Ctrl+Enter 发送)" maxlength="1000"></textarea>
                <div class="anno-footer-actions">
                    <span class="anno-hint-text"><kbd>⌘/Ctrl</kbd> + <kbd>Enter</kbd> 发送</span>
                    <button type="button" class="btn-primary btn-sm" id="btnSendAnno" onclick="submitNewAnnotation()">
                        <i class="ri-send-plane-fill"></i> 发送
                    </button>
                </div>
            </div>
        </div>
        <?php endif; ?>
    </main>
</div>

<?php if ($isWatermarkActive): ?>
<script src="assets/js/watermark.js?v=<?php echo APP_VERSION . '.' . filemtime(__DIR__ . '/assets/js/watermark.js'); ?>"></script>
<?php endif; ?>
<script>
    var currentItemId = <?php echo (int)$item['id']; ?>;
    var currentItemType = <?php echo json_encode($item['type'] ?? 'project'); ?>;
    var currentVerId = <?php echo (int)$curVerId; ?>;
    var currentVerName = <?php echo json_encode($curVerName, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE); ?>;
    var currentShareCode = <?php echo json_encode($curShareCode, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE); ?>;
    var currentToken = <?php echo json_encode($validToken ?? '', JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE); ?>;

    // 多版本切换 (仅管理员可见并操作)
    function onShareVersionChange(selectEl) {
        var $opt = $(selectEl).find('option:selected');
        var href = $opt.val();
        var ver = $opt.data('ver');
        var verId = $opt.data('ver-id');
        var code = $opt.data('share-code');
        var token = $opt.data('token');
        var rp = $opt.data('rp');
        var time = $opt.data('time');

        currentVerName = ver;
        currentVerId = verId;
        if (code) {
            currentShareCode = code;
        }
        if (token) {
            currentToken = token;
        }

        // 更新更新时间
        if (time) {
            $('#shareUpdateTime').html('<i class="ri-time-line" style="margin-right:3px;font-size:12px;opacity:0.85;"></i>更新于 ' + esc(time)).show();
        } else {
            $('#shareUpdateTime').hide().empty();
        }

        // 联动更新日志气泡内容与显隐
        var changelog = $opt.data('changelog') || '';
        var $btnLog = $('#btnShareChangelog');
        var $bodyLog = $('#shareChangelogBody');
        var ver = $opt.data('ver');
        if (changelog) {
            $bodyLog.html(renderMarkdownSafe(changelog));
            $('#shareChangelogVerName').text(ver ? (' · ' + ver) : '');
            $btnLog.show();
        } else {
            $btnLog.hide();
            $('#shareChangelogPopover').hide();
        }

        // 内部管理员或已授权访客调试更新 RP 下载链接
        var $rpBtn = $('#btnShareDownloadRp');
        if ($rpBtn.length) {
            if (rp) {
                var downloadUrl = 'api.php?action=download_rp&item_id=' + currentItemId + (verId ? '&ver_id=' + verId : '');
                var safeItemName = <?php echo json_encode(preg_replace('/[\\\\\\/:*?"<>|]/', '_', trim($item['name'] ?? 'prototype')), JSON_UNESCAPED_UNICODE); ?> || 'prototype';
                var safeVerName = ver ? ('_' + String(ver).replace(/[\\/:*?"<>|]/g, '_').trim()) : '';
                var dlName = safeItemName + safeVerName + '.rp';
                $rpBtn.attr('href', downloadUrl).attr('download', dlName).show();
            } else {
                $rpBtn.hide();
            }
        }

        // 同步联动批注上下文
        if (typeof window.updateAnnoContext === 'function') {
            window.updateAnnoContext(currentItemId, verId, ver, currentItemType);
        }

        // 切换 iframe 页面
        if (href) {
            var sep = href.indexOf('?') > -1 ? '&' : '?';
            $('#shareFrame').attr('src', href + sep + 't=' + new Date().getTime());
        }

        // 更新地址栏 URL (无刷新极简短码)
        var newUrl = window.location.pathname;
        if (currentShareCode) {
            newUrl += '?s=' + encodeURIComponent(currentShareCode);
        } else {
            newUrl += '?id=' + currentItemId + (currentVerId ? '&vid=' + currentVerId : '') + (ver ? '&v=' + encodeURIComponent(ver) : '') + (currentToken ? '&token=' + encodeURIComponent(currentToken) : '');
        }
        window.history.replaceState(null, '', newUrl);
    }

    // 刷新 iframe
    function reloadShareFrame() {
        var frame = document.getElementById('shareFrame');
        if (frame && frame.src) {
            frame.src = frame.src;
        }
    }

    // 全屏切换
    function toggleShareFullscreen() {
        var el = document.getElementById('shareViewport');
        if (!document.fullscreenElement) {
            if (el.requestFullscreen) {
                el.requestFullscreen().catch(function() {});
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function renderMarkdownSafe(text) {
        if (!text) return '';
        var safe = esc(String(text));
        var lines = safe.split(/\r?\n/);
        var htmlParts = [];
        var listType = null;
        function closeList() {
            if (listType) {
                htmlParts.push(listType === 'ul' ? '</ul>' : '</ol>');
                listType = null;
            }
        }
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var trimmed = line.trim();
            if (!trimmed) { closeList(); continue; }
            var headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
            if (headingMatch) {
                closeList();
                var level = headingMatch[1].length;
                var hTag = 'h' + Math.min(6, Math.max(1, level + 1));
                htmlParts.push('<' + hTag + ' class="md-heading">' + parseInlineMarkdown(headingMatch[2]) + '</' + hTag + '>');
                continue;
            }
            var quoteMatch = trimmed.match(/^&gt;\s+(.+)$/);
            if (quoteMatch) {
                closeList();
                htmlParts.push('<blockquote class="md-quote">' + parseInlineMarkdown(quoteMatch[1]) + '</blockquote>');
                continue;
            }
            var ulMatch = trimmed.match(/^[-*]\s+(.+)$/);
            if (ulMatch) {
                if (listType !== 'ul') {
                    closeList();
                    htmlParts.push('<ul class="md-ul">');
                    listType = 'ul';
                }
                htmlParts.push('<li>' + parseInlineMarkdown(ulMatch[1]) + '</li>');
                continue;
            }
            var olMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
            if (olMatch) {
                if (listType !== 'ol') {
                    closeList();
                    htmlParts.push('<ol class="md-ol">');
                    listType = 'ol';
                }
                htmlParts.push('<li>' + parseInlineMarkdown(olMatch[2]) + '</li>');
                continue;
            }
            closeList();
            htmlParts.push('<p class="md-p">' + parseInlineMarkdown(line) + '</p>');
        }
        closeList();
        return '<div class="md-changelog">' + htmlParts.join('') + '</div>';
    }

    function parseInlineMarkdown(str) {
        if (!str) return '';
        return str
            .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[^*])\*([^*]+)\*([^*]|$)/g, '$1<em>$2</em>$3')
            .replace(/~~([^~]+)~~/g, '<del>$1</del>')
            .replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)<>"]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>');
    }

    // 初始化分享页更新日志
    (function initShareChangelog() {
        var el = document.getElementById('shareChangelogBody');
        if (!el) return;
        var rawLog = <?php echo json_encode(!empty($curVersion['changelog']) ? $curVersion['changelog'] : '', JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE); ?>;
        if (rawLog) {
            el.innerHTML = renderMarkdownSafe(rawLog);
        }
    })();

    function clampShareChangelogPopover(pop) {
        if (!pop) return;
        var vw = window.innerWidth || (document.documentElement && document.documentElement.clientWidth) || 0;
        if (!vw || vw <= 960) {
            pop.style.removeProperty('--changelog-offset-x');
            return;
        }
        pop.style.setProperty('--changelog-offset-x', '0px');
        var rect = pop.getBoundingClientRect();
        if (!rect || rect.width <= 0) return;
        var maxRight = vw - 16;
        if (rect.right > maxRight) {
            var shift = rect.right - maxRight;
            pop.style.setProperty('--changelog-offset-x', Math.max(-shift, 16 - rect.left) + 'px');
        } else if (rect.left < 16) {
            pop.style.setProperty('--changelog-offset-x', (16 - rect.left) + 'px');
        }
    }

    // 切换更新日志气泡
    function toggleShareChangelog(force) {
        var pop = document.getElementById('shareChangelogPopover');
        if (!pop) return;
        if (force === false) {
            pop.style.display = 'none';
            return;
        }
        var shouldShow = (force === true) || (pop.style.display === 'none');
        pop.style.display = shouldShow ? 'block' : 'none';
        if (shouldShow) {
            clampShareChangelogPopover(pop);
        }
    }
    window.addEventListener('resize', function() {
        var pop = document.getElementById('shareChangelogPopover');
        if (pop && pop.style.display !== 'none') {
            clampShareChangelogPopover(pop);
        }
    });
    document.addEventListener('click', function(e) {
        var pop = document.getElementById('shareChangelogPopover');
        if (pop && pop.style.display !== 'none' && !pop.contains(e.target) && !e.target.closest('.btn-top-changelog')) {
            pop.style.display = 'none';
        }
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' || e.keyCode === 27) {
            var pop = document.getElementById('shareChangelogPopover');
            if (pop && pop.style.display !== 'none') {
                pop.style.display = 'none';
            }
        }
    });

    <?php if ($isWatermarkActive): ?>
    (function initShareWatermark() {
        var el = document.getElementById('shareWatermarkOverlay');
        if (!el) return;
        var wmUser = <?php echo json_encode(!empty($currentUser['name']) ? $currentUser['name'] : (!empty($currentUser['email']) ? $currentUser['email'] : '访客')); ?>;
        var canvas = document.createElement('canvas');
        var pad = function(n) { return n < 10 ? '0' + n : n; };

        function drawWatermark() {
            var now = new Date();
            var timeStr = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate() + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
            var text = wmUser + '@' + timeStr;
            ProtoLoftWatermark.draw(canvas, el, text);
        }

        drawWatermark();
        var timer = setInterval(function() {
            if (typeof document !== 'undefined' && document.hidden) return;
            drawWatermark();
        }, 1000);
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
            document.addEventListener('visibilitychange', function() {
                if (!document.hidden) drawWatermark();
            });
        }
    })();
    <?php endif; ?>
</script>

<script>
// Axure 原型页面树全托管自适应层级编号 (方案 B，仅针对 Axure 原型生效)
function setupAxureSitemapAutoNumbering(targetWindow) {
    if (!targetWindow) return;
    var doc;
    try {
        doc = targetWindow.document;
        if (!doc) return;
    } catch(e) { return; }

    function isAxureEnvironment() {
        try {
            if (targetWindow.$axure) return true;
            if (doc.getElementById('sitemapHost') || doc.getElementById('sitemapTreeContainer')) return true;
            if (doc.querySelector && doc.querySelector('.sitemapTree, .sitemapNode')) return true;
        } catch(e) {}
        return false;
    }

    function stripOldPrefix(s) {
        if (!s) return '';
        var str = String(s).trim();
        var m = str.match(/^(\d+(?:[.\-_]\d+)*)[.、\s\-—]+(.+)$/);
        return (m && m[2] && m[2].trim()) ? m[2].trim() : str;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function walkUl(ulEl, parentSeq) {
        if (!ulEl) return;
        var lis = [];
        for (var i = 0; i < ulEl.children.length; i++) {
            var c = ulEl.children[i];
            if (c.tagName === 'LI' && c.classList.contains('sitemapNode')) lis.push(c);
        }
        var seq = parentSeq === '' ? 0 : 1;
        for (var j = 0; j < lis.length; j++) {
            var li = lis[j];
            var nameEl = li.querySelector('.sitemapPageName');
            if (!nameEl) continue;
            var existingTag = nameEl.querySelector('.sitemapPageNameTag, [data-sitemap-page-name-tag]');
            var rawText = '';
            if (existingTag) {
                var clone = nameEl.cloneNode(true);
                var cTag = clone.querySelector('.sitemapPageNameTag, [data-sitemap-page-name-tag]');
                if (cTag) cTag.remove();
                rawText = clone.textContent || '';
            } else {
                rawText = nameEl.textContent || '';
            }
            var cleanTitle = stripOldPrefix(rawText);
            var currentSeq = parentSeq === '' ? String(seq) : (parentSeq + '.' + seq);
            seq++;
            var newHtml = '<i class="sitemapPageNameTag" data-sitemap-page-name-tag="' + escapeHtml(currentSeq) + '"></i>' + escapeHtml(cleanTitle);
            if (nameEl.getAttribute('data-applied-seq') !== currentSeq || nameEl.getAttribute('data-applied-title') !== cleanTitle) {
                nameEl.innerHTML = newHtml;
                nameEl.setAttribute('data-applied-seq', currentSeq);
                nameEl.setAttribute('data-applied-title', cleanTitle);
            }
            li.setAttribute('data-autonum-applied', '1');
            var subUl = null;
            for (var k = 0; k < li.children.length; k++) {
                if (li.children[k].tagName === 'UL') { subUl = li.children[k]; break; }
            }
            if (subUl) walkUl(subUl, currentSeq);
        }
    }

    function injectCompactStyles() {
        try {
            var head = doc.head || doc.getElementsByTagName('head')[0];
            if (!head) return;
            var styleEl = doc.getElementById('protoloft-compact-sitemap-style');
            if (!styleEl) {
                styleEl = doc.createElement('style');
                styleEl.id = 'protoloft-compact-sitemap-style';
                styleEl.textContent = 
                    '.sitemapNode { line-height: 23px !important; }' +
                    '.sitemapPageName { font-size: 13px !important; }' +
                    '.sitemapPageName i, .sitemapPageNameTag {' +
                    '  display: inline-block !important;' +
                    '  font-style: normal !important;' +
                    '  height: 15px !important;' +
                    '  line-height: 15px !important;' +
                    '  border-radius: 2.5px !important;' +
                    '  margin-right: 4px !important;' +
                    '  color: #0076de !important;' +
                    '  background: #e6f4fe !important;' +
                    '  padding: 0 3.5px !important;' +
                    '  font-size: 10px !important;' +
                    '  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;' +
                    '  font-weight: 600 !important;' +
                    '  vertical-align: 1px !important;' +
                    '  letter-spacing: -0.2px !important;' +
                    '  min-width: 0 !important;' +
                    '  text-align: center !important;' +
                    '}' +
                    '.sitemapPageNameTag::before { content: attr(data-sitemap-page-name-tag); }';
                head.appendChild(styleEl);
            }
        } catch(e) {}
    }

    function run() {
        if (!isAxureEnvironment()) return false;
        injectCompactStyles();
        var treeUl = doc.querySelector('#sitemapTreeContainer ul.sitemapTree') || doc.querySelector('.sitemapTree');
        if (!treeUl || !treeUl.children.length) return false;
        walkUl(treeUl, '');
        return true;
    }

    run();
    var attempts = 0;
    var timer = setInterval(function() {
        attempts++;
        if (run() || attempts >= 25) clearInterval(timer);
    }, 120);

    try {
        var host = doc.getElementById('sitemapHost') || doc.getElementById('sitemapTreeContainer') || doc.body;
        if (host && targetWindow.MutationObserver && !host.__autonumObserved) {
            host.__autonumObserved = true;
            var deb = null;
            var obs = new targetWindow.MutationObserver(function(muts) {
                var hit = false;
                for (var m = 0; m < muts.length; m++) {
                    var t = muts[m].target;
                    if (t && t.nodeType === 1 && (t.classList.contains('sitemapTree') || t.classList.contains('sitemapNode') || t.id === 'sitemapTreeContainer')) {
                        hit = true; break;
                    }
                }
                if (hit) {
                    if (deb) clearTimeout(deb);
                    deb = setTimeout(run, 60);
                }
            });
            obs.observe(host, { childList: true, subtree: true });
        }
    } catch(e) {}
}

window.setupAxureSitemapAutoNumbering = setupAxureSitemapAutoNumbering;

$(document).ready(function() {
    var $iframe = $('#shareFrame');
    if ($iframe.length) {
        $iframe.on('load', function() {
            try {
                if (this.contentWindow) {
                    setupAxureSitemapAutoNumbering(this.contentWindow);
                }
            } catch(e) {}
        });
        try {
            var rawFrame = $iframe[0];
            if (rawFrame && rawFrame.contentWindow) {
                setupAxureSitemapAutoNumbering(rawFrame.contentWindow);
            }
        } catch(e) {}
    }
});
</script>

<?php if ($canAnnotate): ?>
<script>
    window.GUEST_ANNOTATION_ENABLED = true;
    window.CSRF_TOKEN = <?php echo json_encode(get_csrf_token()); ?>;
    <?php if ($currentUser): ?>
    window.CURRENT_USER = <?php echo json_encode([
        'id' => (int)$currentUser['id'],
        'name' => $currentUser['name'] ?? '',
        'email' => $currentUser['email'] ?? '',
        'role' => $currentUser['role'] ?? 'guest'
    ], JSON_UNESCAPED_UNICODE); ?>;
    <?php endif; ?>
</script>
<script src="assets/js/annotation.js?v=<?php echo APP_VERSION; ?>"></script>
<script>
    $(function() {
        if (typeof window.updateAnnoContext === 'function') {
            window.updateAnnoContext(currentItemId, currentVerId, currentVerName, currentItemType);
        }
        var shareAnnoSeq = 0;
        function checkShareAnnoHash() {
            var m = window.location.hash.match(/(?:^#|&)annotation=([1-9][0-9]*)/);
            if (!m) return;
            var annoId = parseInt(m[1], 10);
            var reqSeq = ++shareAnnoSeq;
            var reqHash = window.location.hash;
            fetch('api.php?action=annotation_target&id=' + encodeURIComponent(annoId))
                .then(function(res) { return res.json(); })
                .then(function(res) {
                    if (reqSeq !== shareAnnoSeq || window.location.hash !== reqHash) return;
                    if (!res || !res.success || !res.data) {
                        if (typeof window.focusAnnotation === 'function') window.focusAnnotation(annoId);
                        return;
                    }
                    var target = res.data;
                    if (parseInt(target.item_id, 10) !== parseInt(currentItemId, 10)) return;
                    if (currentItemType !== 'link' && currentVerId > 0 && parseInt(target.version_id, 10) !== parseInt(currentVerId, 10)) return;

                    var frame = document.getElementById('shareFrame');
                    if (frame && target.page_url && currentItemType !== 'link') {
                        try {
                            var curU = new URL(frame.src, window.location.href);
                            var tgtU = new URL(target.page_url, window.location.href);
                            var curLoc = curU.pathname + (curU.hash || '');
                            var tgtLoc = tgtU.pathname + (tgtU.hash || '');
                            if (curLoc !== tgtLoc) {
                                frame.src = target.page_url;
                                try {
                                    if (frame.contentWindow && curU.pathname === tgtU.pathname && tgtU.hash) {
                                        frame.contentWindow.location.hash = tgtU.hash;
                                    }
                                } catch(e) {}
                            }
                        } catch(e) {
                            frame.src = target.page_url;
                        }
                    }
                    if (typeof window.focusAnnotation === 'function') {
                        window.focusAnnotation(annoId);
                    }
                    if (!target.page_url && currentItemType !== 'link') {
                        if (typeof showToast === 'function') showToast('原页面已不存在，已打开版本入口；请查看批注原文', 'warning');
                    } else if (target.annotation && target.annotation.needs_review) {
                        if (typeof showToast === 'function') showToast('原型已更新，此批注需要重新核对', 'info');
                    }
                }).catch(function() {
                    if (reqSeq !== shareAnnoSeq || window.location.hash !== reqHash) return;
                    if (typeof window.focusAnnotation === 'function') window.focusAnnotation(annoId);
                });
        }
        setTimeout(checkShareAnnoHash, 200);
        window.addEventListener('hashchange', checkShareAnnoHash);
    });
</script>
<?php endif; ?>

</body>
</html>
