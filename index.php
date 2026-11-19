<?php
/**
 * 全功能一体化主页 (沉浸式原型浏览 + 原地管理模式)
 */
require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/db.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/mailer.php';

// 确保已安装
require_installed();

// 1. 全站身份认证与登录守卫检查 (纯粹双轨制：工作台严密私有化，进入必须账号登录)
$currentUser = Auth::getCurrentUser();
$canManage = Auth::canManage();
$isAdmin = Auth::isAdmin();

// 新链接只在浏览器片段携带令牌。保留旧查询串入口，兼容此前发出的短效链接。
$legacyResetToken = $_GET['reset_token'] ?? '';
$resetTokenParam = is_string($legacyResetToken) ? trim($legacyResetToken) : '';
$resetFromFragment = ($_GET['reset'] ?? '') === '1' && $resetTokenParam === '';
$isResetPage = $resetFromFragment || $resetTokenParam !== '';
if ($isResetPage) {
    header('Referrer-Policy: no-referrer');
    header('Cache-Control: no-store');
}
$isSiteAuthorized = !empty($currentUser) && !$isResetPage;

// 系统品牌固化 (立象原型 · 立象以尽意 · 披图而同心)
$systemName = '立象原型';
$systemSlogan = '立象以尽意 · 披图而同心';
$siteFooter = '© ' . date('Y') . ' 立象原型 · 让想法可见，让协作清晰';

// 获取企业名称定制 (选填: 若未配置则纯粹展示立象原型)
$companyName = Auth::getCompanyDisplayName();
$siteTitle = !empty($companyName) ? ($companyName . ' · 立象原型') : '立象原型';

// 系统固定矢量 Favicon
$siteFavicon = file_exists(ROOT_PATH . '/assets/images/favicon.svg') ? 'assets/images/favicon.svg' : 'assets/images/favicon.png';
$favType = (pathinfo($siteFavicon, PATHINFO_EXTENSION) === 'svg') ? 'image/svg+xml' : 'image/png';
$favUrl = $siteFavicon . '?v=' . substr(sha1_file(ROOT_PATH . '/' . $siteFavicon), 0, 12);

$visitorRegEnabled = (Auth::getSetting('visitor_register_enabled', '1') !== '0');
$mailResetEnabled = Mailer::isConfiguredAndEnabled();
$resetTokenInfo = $resetTokenParam !== '' ? Auth::verifyPasswordResetToken($resetTokenParam) : ['valid' => false, 'message' => ''];

// 企业邮箱域名白名单与固化后缀支持
$allowedDomainsSetting = Auth::getSetting('allowed_email_domains', '');
$fixedEmailDomain = '';
if (!empty(trim($allowedDomainsSetting))) {
    $domainList = array_filter(array_map('trim', explode(',', strtolower($allowedDomainsSetting))));
    if (count($domainList) === 1) {
        $fixedEmailDomain = reset($domainList);
    }
}

// 2. 如果未通过全站访问密码验证，或携带密码重置令牌，渲染独立认证页
if (!$isSiteAuthorized) {
    $initialAuthPane = $isResetPage ? 'reset' : 'login';
    $loginBaseTitle = !empty($companyName) ? ($companyName . ' · 账号登录') : '账号登录';
    $initialTitle = $loginBaseTitle;
    if ($isResetPage) {
        $initialTitle = $resetFromFragment || $resetTokenInfo['valid'] ? '设置新密码' : '重置链接已失效';
    }
    ?>
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="csrf-token" content="<?php echo htmlspecialchars(get_csrf_token(), ENT_QUOTES, 'UTF-8'); ?>">
        <title><?php echo htmlspecialchars(!empty($companyName) ? ($companyName . ' - 账号登录') : '立象原型 - 账号登录'); ?></title>
        <link rel="icon" href="<?php echo htmlspecialchars($favUrl); ?>" type="<?php echo $favType; ?>">
        <link rel="stylesheet" href="assets/css/bootstrap.min.css">
        <link rel="stylesheet" href="assets/css/remixicon.css">
        <link rel="stylesheet" href="assets/css/app.css?v=<?php echo APP_VERSION . '.' . filemtime(__DIR__ . '/assets/css/app.css'); ?>">
    </head>
    <body class="page-standalone">
        <div class="standalone-brand">
            <picture>
                <source srcset="assets/images/logo.svg?v=<?php echo APP_VERSION; ?>" type="image/svg+xml">
                <source srcset="assets/images/logo.webp?v=<?php echo APP_VERSION; ?>" type="image/webp">
                <img src="assets/images/logo.png?v=<?php echo APP_VERSION; ?>" alt="立象原型" class="brand-logo" onerror="this.style.display='none'">
            </picture>
            <p class="brand-subtitle"><?php echo htmlspecialchars($systemSlogan); ?></p>
        </div>

        <div class="standalone-card">
            <div style="font-size: 18px; font-weight: 700; color: var(--text-1); margin-bottom: 22px; text-align: center;" id="authPanelTitle"><?php echo htmlspecialchars($initialTitle); ?></div>

            <!-- 人员账号登录面板 (作为首选默认主面板) -->
            <form id="adminLoginForm" onsubmit="submitAdminLogin(event)" autocomplete="on" style="<?php echo $initialAuthPane === 'login' ? '' : 'display:none;'; ?>">
                <div id="adminLoginSuccessTip" style="display:none;margin-bottom:14px;padding:9px 12px;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;border-radius:6px;font-size:12.5px;line-height:1.5;align-items:center;gap:6px;"><i class="ri-checkbox-circle-fill" style="font-size:15px;color:#10b981;flex-shrink:0;"></i><span></span></div>
                <div style="margin-bottom: 14px; position:relative; display:flex; align-items:center;">
                    <input type="text" id="adminLoginUser" name="username" class="form-control" data-fixed-domain="<?php echo htmlspecialchars($fixedEmailDomain); ?>" placeholder="<?php echo $fixedEmailDomain ? '邮箱名' : '工作邮箱'; ?>" autocomplete="username" required maxlength="100" style="<?php echo $fixedEmailDomain ? ('padding-right:' . (mb_strlen($fixedEmailDomain)*8 + 32) . 'px;') : ''; ?>" oninput="handleLockEmailInput(this, 'adminDomainBadge')">
                    <?php if ($fixedEmailDomain): ?>
                        <span id="adminDomainBadge" style="position:absolute;right:8px;font-size:12px;color:var(--text-3);background:var(--bg-tag,#f1f5f9);border:1px solid var(--border-light,#e2e8f0);padding:2px 7px;border-radius:4px;pointer-events:none;user-select:none;">@<?php echo htmlspecialchars($fixedEmailDomain); ?></span>
                    <?php endif; ?>
                </div>
                <div class="pwd-input-wrap" style="margin-bottom: 18px;">
                    <input type="password" id="adminLoginPwd" name="password" class="form-control" placeholder="登录密码" autocomplete="current-password" required maxlength="64">
                    <button type="button" class="btn-eye-toggle" onclick="toggleLockPwd('adminLoginPwd', this)" title="显示/隐藏密码">
                        <i class="ri-eye-line"></i>
                    </button>
                </div>
                <button type="submit" class="btn-submit" id="btnAdminLogin">登录</button>
                <div class="error-tip" id="adminLoginError"></div>
                <div class="auth-footer-links" id="authLoginFooter">
                    <?php if ($visitorRegEnabled): ?>
                        <a href="javascript:void(0)" id="switchRegister" onclick="toggleAuthPane('reg')">申请加入协作</a>
                    <?php else: ?>
                        <span></span>
                    <?php endif; ?>
                    <a href="javascript:void(0)" id="linkForgotPwd" class="auth-link-muted" onclick="toggleAuthPane('forgot')">忘记密码？</a>
                </div>
            </form>

            <?php if ($visitorRegEnabled): ?>
            <!-- 访客申请加入面板 (3+1 项极简模型) -->
            <form id="visitorRegForm" onsubmit="submitVisitorReg(event)" style="display:none;" novalidate>
                <label class="m-label" for="regEmailInput">工作邮箱 <span class="req-star">*</span></label>
                <div style="margin-bottom: 10px;">
                    <div style="position:relative; display:flex; align-items:center;">
                        <input type="text" id="regEmailInput" class="form-control" data-fixed-domain="<?php echo htmlspecialchars($fixedEmailDomain); ?>" placeholder="<?php echo $fixedEmailDomain ? '邮箱名' : '如：name@company.com'; ?>" autocomplete="email" required maxlength="100" data-error-target="regEmailError" aria-errormessage="regEmailError" style="<?php echo $fixedEmailDomain ? ('padding-right:' . (mb_strlen($fixedEmailDomain)*8 + 32) . 'px;') : ''; ?>" oninput="handleLockEmailInput(this, 'regLockDomainBadge')">
                        <?php if ($fixedEmailDomain): ?>
                            <span id="regLockDomainBadge" style="position:absolute;right:8px;font-size:12px;color:var(--text-3);background:var(--bg-tag,#f1f5f9);border:1px solid var(--border-light,#e2e8f0);padding:2px 7px;border-radius:4px;pointer-events:none;user-select:none;">@<?php echo htmlspecialchars($fixedEmailDomain); ?></span>
                        <?php endif; ?>
                    </div>
                    <div class="field-error-tip" id="regEmailError" role="alert"></div>
                </div>
                <label class="m-label" for="regName">真实姓名 <span class="req-star">*</span></label>
                <div style="margin-bottom: 10px;">
                    <input type="text" id="regName" class="form-control" placeholder="如：李明" required maxlength="20" data-error-target="regNameError" aria-errormessage="regNameError">
                    <div class="field-error-tip" id="regNameError" role="alert"></div>
                </div>
                <div class="field-label-row">
                    <label class="m-label" for="regPwdInput">登录密码 <span class="req-star">*</span></label>
                    <span class="password-strength" id="regPwdStrength" role="status"></span>
                </div>
                <div style="margin-bottom: 10px;">
                    <div class="pwd-input-wrap">
                        <input type="password" id="regPwdInput" class="form-control" placeholder="至少 6 个字符" autocomplete="new-password" required data-password-strength="regPwdStrength" data-error-target="regPwdError" aria-describedby="regPwdStrength" aria-errormessage="regPwdError">
                        <button type="button" class="btn-eye-toggle" onclick="toggleLockPwd('regPwdInput', this)" title="显示/隐藏密码">
                            <i class="ri-eye-line"></i>
                        </button>
                    </div>
                    <div class="field-error-tip" id="regPwdError" role="alert"></div>
                </div>
                <div class="m-label">申请角色 <span class="req-star">*</span></div>
                <div class="reg-role-grid" style="margin-bottom: 10px;">
                    <label class="reg-role-card" for="lockRegRoleViewer">
                        <input type="radio" id="lockRegRoleViewer" name="lock_reg_role" value="viewer" checked>
                        <div class="reg-role-head">
                            <span class="reg-role-title">审阅人</span>
                            <span class="reg-role-check" aria-hidden="true"></span>
                        </div>
                        <div class="reg-role-desc">查看与批注 · 研发/测试</div>
                    </label>
                    <label class="reg-role-card" for="lockRegRoleEditor">
                        <input type="radio" id="lockRegRoleEditor" name="lock_reg_role" value="editor">
                        <div class="reg-role-head">
                            <span class="reg-role-title">协作者</span>
                            <span class="reg-role-check" aria-hidden="true"></span>
                        </div>
                        <div class="reg-role-desc">上传与管理 · 产品/交互</div>
                    </label>
                </div>
                <label class="m-label" for="regRemarkInput">部门或职务 <span class="opt-tag">选填</span></label>
                <div style="margin-bottom: 14px;">
                    <input type="text" id="regRemarkInput" class="form-control" placeholder="如：研发部 · 前端工程师" maxlength="30">
                </div>
                <button type="submit" class="btn-submit" id="btnVisitorReg">申请加入</button>
                <div class="error-tip" id="regErrorTip"></div>
                <div id="regSuccessTip" style="display:none;margin-top:12px;padding:8px 12px;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;border-radius:6px;font-size:12.5px;line-height:1.5;"></div>
                <div class="admin-login-link">
                    <span>已有账号？</span><a href="javascript:void(0)" onclick="toggleAuthPane('login')">返回登录</a>
                </div>
            </form>
            <?php endif; ?>

            <!-- 找回密码面板 -->
            <form id="forgotPwdForm" onsubmit="submitForgotPwd(event)" style="display:none;">
                <?php if ($mailResetEnabled): ?>
                    <div id="forgotSuccessTip" style="display:none;margin-bottom:14px;padding:10px 12px;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;border-radius:6px;font-size:12.5px;line-height:1.5;align-items:center;gap:6px;"><i class="ri-checkbox-circle-fill" style="font-size:15px;color:#10b981;flex-shrink:0;"></i><span></span></div>
                    <label class="m-label" for="forgotEmailInput">工作邮箱</label>
                    <div style="margin-bottom: 16px; position:relative; display:flex; align-items:center;">
                        <input type="text" id="forgotEmailInput" class="form-control" data-fixed-domain="<?php echo htmlspecialchars($fixedEmailDomain); ?>" placeholder="<?php echo $fixedEmailDomain ? '邮箱名' : '输入注册时的工作邮箱'; ?>" autocomplete="email" required maxlength="100" style="<?php echo $fixedEmailDomain ? ('padding-right:' . (mb_strlen($fixedEmailDomain)*8 + 32) . 'px;') : ''; ?>" oninput="handleLockEmailInput(this, 'forgotDomainBadge')">
                        <?php if ($fixedEmailDomain): ?>
                            <span id="forgotDomainBadge" style="position:absolute;right:8px;font-size:12px;color:var(--text-3);background:var(--bg-tag,#f1f5f9);border:1px solid var(--border-light,#e2e8f0);padding:2px 7px;border-radius:4px;pointer-events:none;user-select:none;">@<?php echo htmlspecialchars($fixedEmailDomain); ?></span>
                        <?php endif; ?>
                    </div>
                    <button type="submit" class="btn-submit" id="btnForgotSubmit">发送重置邮件</button>
                    <div class="error-tip" id="forgotErrorTip"></div>
                <?php else: ?>
                    <div class="auth-sub-note">暂未启用邮件找回，请联系管理员重置密码。</div>
                    <button type="button" class="btn-submit" onclick="toggleAuthPane('login')">返回登录</button>
                <?php endif; ?>
                <?php if ($mailResetEnabled): ?>
                <div class="admin-login-link">
                    <a href="javascript:void(0)" onclick="toggleAuthPane('login')">返回登录</a>
                </div>
                <?php endif; ?>
            </form>

            <!-- 设置新密码面板（邮件链接回调） -->
            <form id="resetPwdForm" onsubmit="submitResetPwd(event)" style="<?php echo $initialAuthPane === 'reset' ? '' : 'display:none;'; ?>" novalidate>
                <?php if ($isResetPage): ?>
                <div id="resetFields"<?php echo $resetTokenInfo['valid'] ? '' : ' hidden'; ?>>
                    <input type="hidden" id="resetTokenInput" value="<?php echo htmlspecialchars($resetTokenParam); ?>">
                    <div class="auth-sub-note">账号：<strong id="resetMaskedEmail"><?php echo htmlspecialchars($resetTokenInfo['masked_email'] ?? ''); ?></strong></div>
                    <div class="field-label-row">
                        <label class="m-label" for="resetNewPwdInput">新密码 <span class="req-star">*</span></label>
                        <span class="password-strength" id="resetPwdStrength" role="status"></span>
                    </div>
                    <div style="margin-bottom: 12px;">
                        <div class="pwd-input-wrap">
                            <input type="password" id="resetNewPwdInput" class="form-control" placeholder="至少 6 个字符" autocomplete="new-password" required data-password-strength="resetPwdStrength" data-error-target="resetNewPwdError" aria-describedby="resetPwdStrength" aria-errormessage="resetNewPwdError">
                            <button type="button" class="btn-eye-toggle" onclick="toggleLockPwd('resetNewPwdInput', this)" title="显示/隐藏密码">
                                <i class="ri-eye-line"></i>
                            </button>
                        </div>
                        <div class="field-error-tip" id="resetNewPwdError" role="alert"></div>
                    </div>
                    <label class="m-label" for="resetConfirmPwdInput">确认新密码 <span class="req-star">*</span></label>
                    <div style="margin-bottom: 18px;">
                        <div class="pwd-input-wrap">
                            <input type="password" id="resetConfirmPwdInput" class="form-control" placeholder="再次输入新密码" autocomplete="new-password" required data-error-target="resetConfirmPwdError" aria-describedby="resetConfirmPwdError">
                            <button type="button" class="btn-eye-toggle" onclick="toggleLockPwd('resetConfirmPwdInput', this)" title="显示/隐藏密码">
                                <i class="ri-eye-line"></i>
                            </button>
                        </div>
                        <div class="field-error-tip" id="resetConfirmPwdError" role="alert"></div>
                    </div>
                    <button type="submit" class="btn-submit" id="btnResetSubmit">保存新密码</button>
                    <div class="error-tip" id="resetErrorTip"></div>
                </div>
                <div id="resetLinkNotice"<?php echo $resetTokenInfo['valid'] ? ' hidden' : ''; ?>>
                    <div class="auth-sub-note" role="status" id="resetLinkStatus"><?php echo htmlspecialchars($resetTokenInfo['message'] ?: ($resetFromFragment ? '正在验证重置链接…' : '重置链接无效或已过期，请重新申请。')); ?></div>
                    <?php if ($mailResetEnabled): ?>
                        <button type="button" class="btn-submit" onclick="toggleAuthPane('forgot')">重新找回</button>
                    <?php else: ?>
                        <button type="button" class="btn-submit" onclick="toggleAuthPane('login')">返回登录</button>
                    <?php endif; ?>
                </div>
                <?php endif; ?>
                <div class="admin-login-link">
                    <a href="javascript:void(0)" onclick="toggleAuthPane('login')">返回登录</a>
                </div>
            </form>
        </div>

        <?php if (!empty($siteFooter)): ?>
            <div class="standalone-footer"><?php echo htmlspecialchars($siteFooter); ?></div>
        <?php endif; ?>

        <script src="assets/js/password-strength.js?v=<?php echo filemtime(__DIR__ . '/assets/js/password-strength.js'); ?>" defer></script>
        <script>
            var authPane = <?php echo json_encode($initialAuthPane); ?>;
            var resetPage = <?php echo $isResetPage ? 'true' : 'false'; ?>;
            var visitorRegAllowed = <?php echo $visitorRegEnabled ? 'true' : 'false'; ?>;
            var loginBaseTitle = <?php echo json_encode($loginBaseTitle); ?>;

            function toggleAuthPane(forceTarget) {
                var target = forceTarget || ((authPane === 'login') ? 'reg' : 'login');
                if (target === 'reg' && !visitorRegAllowed) {
                    target = 'login';
                }
                authPane = target;

                var loginForm = document.getElementById('adminLoginForm');
                var regForm = document.getElementById('visitorRegForm');
                var forgotForm = document.getElementById('forgotPwdForm');
                var resetForm = document.getElementById('resetPwdForm');
                if (loginForm) loginForm.style.display = (authPane === 'login') ? 'block' : 'none';
                if (regForm) regForm.style.display = (authPane === 'reg') ? 'block' : 'none';
                if (forgotForm) forgotForm.style.display = (authPane === 'forgot') ? 'block' : 'none';
                if (resetForm) resetForm.style.display = (authPane === 'reset') ? 'block' : 'none';

                var panelTitle = document.getElementById('authPanelTitle');
                if (panelTitle) {
                    if (authPane === 'reg') panelTitle.innerText = '申请加入协作';
                    else if (authPane === 'forgot') panelTitle.innerText = '找回密码';
                    else if (authPane === 'reset') panelTitle.innerText = '设置新密码';
                    else panelTitle.innerText = loginBaseTitle;
                }

                if (authPane !== 'login') {
                    var succTip = document.getElementById('adminLoginSuccessTip');
                    if (succTip) succTip.style.display = 'none';
                }

                ['adminLoginError', 'regErrorTip', 'forgotErrorTip', 'resetErrorTip'].forEach(function(id) {
                    var el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                });
                if (typeof clearPasswordStrength === 'function') {
                    [regForm, resetForm].forEach(function(f) { if (f) clearPasswordStrength(f); });
                }

                if (authPane === 'login') {
                    if (resetPage && window.history && window.history.replaceState) {
                        window.history.replaceState(null, '', window.location.pathname);
                    }
                    var resetTokenInput = document.getElementById('resetTokenInput');
                    if (resetTokenInput) resetTokenInput.value = '';
                    var adminUser = document.getElementById('adminLoginUser');
                    if (adminUser) {
                        adminUser.focus();
                        handleLockEmailInput(adminUser, 'adminDomainBadge');
                    }
                } else if (authPane === 'reg') {
                    var regInput = document.getElementById('regEmailInput');
                    if (regInput) {
                        regInput.focus();
                        handleLockEmailInput(regInput, 'regLockDomainBadge');
                    }
                } else if (authPane === 'forgot') {
                    var fSucc = document.getElementById('forgotSuccessTip');
                    if (fSucc) fSucc.style.display = 'none';
                    var forgotInput = document.getElementById('forgotEmailInput');
                    if (forgotInput) {
                        var existingEmail = document.getElementById('adminLoginUser');
                        if (!forgotInput.value && existingEmail && existingEmail.value.trim()) {
                            forgotInput.value = existingEmail.value.trim();
                        }
                        forgotInput.focus();
                        handleLockEmailInput(forgotInput, 'forgotDomainBadge');
                    }
                }
            }

            function toggleLockPwd(inputId, btnEl) {
                var input = document.getElementById(inputId);
                if (!input) return;
                var isPwd = input.type === 'password';
                input.type = isPwd ? 'text' : 'password';
                var icon = btnEl ? btnEl.querySelector('i') : null;
                if (icon) {
                    icon.className = isPwd ? 'ri-eye-off-line' : 'ri-eye-line';
                }
            }

            function handleLockEmailInput(input, badgeId) {
                var badge = document.getElementById(badgeId);
                if (!badge) return;
                var val = input.value.trim();
                var fixedDomain = input.getAttribute('data-fixed-domain') || '';
                if (!fixedDomain) return;
                if (val.indexOf('@') !== -1) {
                    badge.style.display = 'none';
                    input.style.paddingRight = '12px';
                } else {
                    badge.style.display = 'inline-block';
                    input.style.paddingRight = (fixedDomain.length * 8 + 32) + 'px';
                }
            }

            function getLockResolvedEmail(inputId) {
                var input = document.getElementById(inputId);
                if (!input) return '';
                var val = input.value.trim();
                var fixedDomain = input.getAttribute('data-fixed-domain') || '';
                if (fixedDomain && val && val.indexOf('@') === -1) {
                    return val + '@' + fixedDomain;
                }
                return val;
            }

            function postLockApi(fd) {
                var meta = document.querySelector('meta[name="csrf-token"]');
                var csrf = meta ? meta.getAttribute('content') : '';
                if (csrf) fd.set('csrf_token', csrf);
                return fetch('api.php', {
                    method: 'POST',
                    headers: csrf ? { 'X-CSRF-Token': csrf } : {},
                    body: fd
                });
            }

            function initPasswordResetLink() {
                var match = window.location.hash.match(/^#reset_token=([1-9][0-9]{0,18}\.[a-f0-9]{64})$/);
                if (window.location.hash && window.history && window.history.replaceState) {
                    window.history.replaceState(null, '', window.location.pathname + window.location.search);
                }
                var status = document.getElementById('resetLinkStatus');
                if (!match) {
                    status.textContent = '重置链接无效或已过期，请重新申请。';
                    return;
                }
                var token = match[1];
                var fd = new FormData();
                fd.append('action', 'validate_password_reset');
                fd.append('token', token);
                postLockApi(fd).then(function(response) { return response.json(); }).then(function(res) {
                    if (authPane !== 'reset') return;
                    if (!res.success) {
                        status.textContent = res.message || '重置链接无效或已过期，请重新申请。';
                        return;
                    }
                    document.getElementById('resetTokenInput').value = token;
                    document.getElementById('resetMaskedEmail').textContent = res.data.masked_email;
                    document.getElementById('resetLinkNotice').hidden = true;
                    document.getElementById('resetFields').hidden = false;
                    document.getElementById('resetNewPwdInput').focus();
                }).catch(function() {
                    status.textContent = '验证失败，请重新打开邮件中的链接。';
                });
            }

            function submitVisitorReg(e) {
                e.preventDefault();
                var emailInput = document.getElementById('regEmailInput');
                var rawEmailVal = emailInput ? emailInput.value.trim() : '';
                var email = getLockResolvedEmail('regEmailInput');
                var nameInput = document.getElementById('regName');
                var name = nameInput ? nameInput.value.trim() : '';
                var passwordInput = document.getElementById('regPwdInput');
                var p = passwordInput.value;
                var roleEl = document.querySelector('input[name="lock_reg_role"]:checked');
                var role = roleEl ? roleEl.value : 'viewer';
                var remark = document.getElementById('regRemarkInput').value.trim();

                var btn = document.getElementById('btnVisitorReg');
                var err = document.getElementById('regErrorTip');

                var fixedDomain = emailInput ? (emailInput.getAttribute('data-fixed-domain') || '') : '';
                if (!rawEmailVal) {
                    if (typeof setFieldError === 'function') setFieldError(emailInput, null, '请输入工作邮箱');
                    else { err.innerText = '请输入工作邮箱'; err.style.display = 'block'; if (emailInput) emailInput.focus(); }
                    return;
                }
                if (!fixedDomain && email.indexOf('@') === -1) {
                    if (typeof setFieldError === 'function') setFieldError(emailInput, null, '请输入完整工作邮箱，如 name@company.com');
                    else { err.innerText = '请输入完整工作邮箱，如 name@company.com'; err.style.display = 'block'; emailInput.focus(); }
                    return;
                }
                if (!name) {
                    if (typeof setFieldError === 'function') setFieldError(nameInput, null, '请输入真实姓名');
                    else { err.innerText = '请输入真实姓名'; err.style.display = 'block'; if (nameInput) nameInput.focus(); }
                    return;
                }

                if (typeof showPasswordLengthError === 'function' && showPasswordLengthError(passwordInput)) {
                    err.style.display = 'none';
                    return;
                }

                btn.disabled = true;
                btn.innerText = '正在提交...';
                err.style.display = 'none';

                var fd = new FormData();
                fd.append('action', 'register_visitor');
                fd.append('email', email);
                fd.append('name', name);
                fd.append('password', p);
                fd.append('role', role);
                fd.append('department', remark);

                postLockApi(fd)
                .then(function(r) { return r.json(); })
                .then(function(res) {
                    btn.disabled = false;
                    btn.innerText = '申请加入';
                    if (res.success) {
                        // 重置注册表单并恢复域名徽标
                        document.getElementById('visitorRegForm').reset();
                        var regBadge = document.getElementById('regLockDomainBadge');
                        if (regBadge && fixedDomain) {
                            regBadge.style.display = 'inline-block';
                            emailInput.style.paddingRight = (fixedDomain.length * 8 + 32) + 'px';
                        }

                        // 平滑切回登录面板
                        toggleAuthPane('login');

                        // 自动回填刚刚申请的邮箱账号到登录框
                        var loginUserInput = document.getElementById('adminLoginUser');
                        if (loginUserInput && rawEmailVal) {
                            loginUserInput.value = rawEmailVal;
                            handleLockEmailInput(loginUserInput, 'adminDomainBadge');
                        }

                        // 登录卡片顶部展示明确成功的通知条
                        var succTip = document.getElementById('adminLoginSuccessTip');
                        if (succTip) {
                            var tipSpan = succTip.querySelector('span');
                            if (tipSpan) tipSpan.innerText = res.message || '申请已提交，等待管理员审核后即可登录';
                            succTip.style.display = 'flex';
                        }

                        var pwdInput = document.getElementById('adminLoginPwd');
                        if (pwdInput) pwdInput.focus();
                    } else {
                        err.innerText = res.message || '提交申请失败';
                        err.style.display = 'block';
                    }
                })
                .catch(function() {
                    btn.disabled = false;
                    btn.innerText = '申请加入';
                    err.innerText = '网络异常，请重试';
                    err.style.display = 'block';
                });
            }

            function submitAdminLogin(e) {
                e.preventDefault();
                var emailInput = document.getElementById('adminLoginUser');
                var email = getLockResolvedEmail('adminLoginUser');
                var p = document.getElementById('adminLoginPwd').value;
                var btn = document.getElementById('btnAdminLogin');
                var err = document.getElementById('adminLoginError');

                var fixedDomain = emailInput ? (emailInput.getAttribute('data-fixed-domain') || '') : '';
                if (!fixedDomain && email.indexOf('@') === -1) {
                    err.innerText = '请输入完整工作邮箱，如 name@company.com';
                    err.style.display = 'block';
                    emailInput.focus();
                    return;
                }

                btn.disabled = true;
                btn.innerText = '登录中...';
                err.style.display = 'none';
                var succTip = document.getElementById('adminLoginSuccessTip');
                if (succTip) succTip.style.display = 'none';

                var formData = new FormData();
                formData.append('action', 'login');
                formData.append('email', email);
                formData.append('password', p);

                postLockApi(formData)
                .then(function(r) {
                    return r.text().then(function(text) {
                        try {
                            return JSON.parse(text);
                        } catch(e) {
                            throw new Error(text || ('服务响应异常 (HTTP ' + r.status + ')'));
                        }
                    });
                })
                .then(function(res) {
                    if (res.success) {
                        window.location.reload();
                    } else {
                        err.innerText = res.message || '登录失败，请重试';
                        err.style.display = 'block';
                        btn.disabled = false;
                        btn.innerText = '登录';
                    }
                })
                .catch(function(e) {
                    err.innerText = (e && e.message) ? e.message : '网络异常，请重试';
                    err.style.display = 'block';
                    btn.disabled = false;
                    btn.innerText = '登录';
                });
            }

            function submitForgotPwd(e) {
                e.preventDefault();
                var emailInput = document.getElementById('forgotEmailInput');
                var email = getLockResolvedEmail('forgotEmailInput');
                var btn = document.getElementById('btnForgotSubmit');
                var err = document.getElementById('forgotErrorTip');
                var succ = document.getElementById('forgotSuccessTip');
                if (!emailInput || !btn || !err) return;

                var fixedDomain = emailInput.getAttribute('data-fixed-domain') || '';
                if (!fixedDomain && email.indexOf('@') === -1) {
                    err.innerText = '请输入完整工作邮箱，如 name@company.com';
                    err.style.display = 'block';
                    emailInput.focus();
                    return;
                }

                btn.disabled = true;
                btn.innerText = '发送中...';
                err.style.display = 'none';
                if (succ) succ.style.display = 'none';

                var fd = new FormData();
                fd.append('action', 'request_password_reset');
                fd.append('email', email);

                postLockApi(fd)
                .then(function(r) { return r.json(); })
                .then(function(res) {
                    btn.disabled = false;
                    btn.innerText = '发送重置邮件';
                    if (res.success) {
                        if (succ) {
                            var tipSpan = succ.querySelector('span');
                            if (tipSpan) tipSpan.innerText = res.message || '如果该邮箱已注册且状态正常，你将收到密码重置邮件';
                            succ.style.display = 'flex';
                        }
                    } else {
                        err.innerText = res.message || '发送失败，请重试';
                        err.style.display = 'block';
                    }
                })
                .catch(function() {
                    btn.disabled = false;
                    btn.innerText = '发送重置邮件';
                    err.innerText = '网络异常，请重试';
                    err.style.display = 'block';
                });
            }

            function submitResetPwd(e) {
                e.preventDefault();
                var tokenEl = document.getElementById('resetTokenInput');
                var newEl = document.getElementById('resetNewPwdInput');
                var confirmEl = document.getElementById('resetConfirmPwdInput');
                var btn = document.getElementById('btnResetSubmit');
                var err = document.getElementById('resetErrorTip');
                if (!tokenEl || !newEl || !confirmEl || !btn || !err) return;

                var newPwd = newEl.value;
                var confirmPwd = confirmEl.value;
                if (typeof showPasswordLengthError === 'function' && showPasswordLengthError(newEl)) {
                    err.style.display = 'none';
                    return;
                }
                if (typeof showPasswordMismatchError === 'function'
                    ? showPasswordMismatchError(newEl, confirmEl, null, '两次输入的新密码不一致')
                    : (newPwd !== confirmPwd)) {
                    if (typeof showPasswordMismatchError !== 'function') {
                        err.innerText = '两次输入的新密码不一致';
                        err.style.display = 'block';
                        confirmEl.focus();
                    } else {
                        err.style.display = 'none';
                    }
                    return;
                }

                btn.disabled = true;
                btn.innerText = '保存中...';
                err.style.display = 'none';

                var fd = new FormData();
                fd.append('action', 'reset_password');
                fd.append('token', tokenEl.value);
                fd.append('new_password', newPwd);
                fd.append('confirm_password', confirmPwd);

                postLockApi(fd)
                .then(function(r) { return r.json(); })
                .then(function(res) {
                    btn.disabled = false;
                    btn.innerText = '保存新密码';
                    if (res.success) {
                        newEl.value = '';
                        confirmEl.value = '';
                        if (typeof clearPasswordStrength === 'function') clearPasswordStrength(newEl.form);
                        toggleAuthPane('login');
                        var loginUserInput = document.getElementById('adminLoginUser');
                        var returnedEmail = (res.data && res.data.email) ? res.data.email : '';
                        if (loginUserInput && returnedEmail) {
                            var fixedDomain = loginUserInput.getAttribute('data-fixed-domain') || '';
                            if (fixedDomain && returnedEmail.toLowerCase().endsWith('@' + fixedDomain.toLowerCase())) {
                                loginUserInput.value = returnedEmail.slice(0, -(fixedDomain.length + 1));
                            } else {
                                loginUserInput.value = returnedEmail;
                            }
                            handleLockEmailInput(loginUserInput, 'adminDomainBadge');
                        }
                        var succTip = document.getElementById('adminLoginSuccessTip');
                        if (succTip) {
                            var tipSpan = succTip.querySelector('span');
                            if (tipSpan) tipSpan.innerText = res.message || '密码已重置，请使用新密码登录';
                            succTip.style.display = 'flex';
                        }
                        var pwdInput = document.getElementById('adminLoginPwd');
                        if (pwdInput) {
                            pwdInput.value = '';
                            pwdInput.focus();
                        }
                    } else {
                        err.innerText = res.message || '重置失败，请重试';
                        err.style.display = 'block';
                    }
                })
                .catch(function() {
                    btn.disabled = false;
                    btn.innerText = '保存新密码';
                    err.innerText = '网络异常，请重试';
                    err.style.display = 'block';
                });
            }
            <?php if ($resetFromFragment): ?>initPasswordResetLink();<?php endif; ?>
        </script>
    </body>
    </html>
    <?php
    exit;
}

// 3. 读取完整数据并组装
$db = DB::getInstance();

// 查询分类
$cats = $db->query("SELECT * FROM categories ORDER BY sort_order ASC, id ASC")->fetchAll();

// 查询所有项目与外链 (联表查出创建者真实姓名及所属文件夹排序，访客模式仅显示 is_visible = 1)
$itemSql = "SELECT i.*, COALESCE(NULLIF(u.name, ''), u.email) as creator_name FROM items i LEFT JOIN users u ON i.created_by = u.id LEFT JOIN categories c ON i.category_id = c.id " . ($canManage ? "" : "WHERE i.is_visible = 1 ") . "ORDER BY COALESCE(c.sort_order, 0) ASC, i.category_id ASC, i.sort_order ASC, i.id ASC";
$itemsRaw = $db->query($itemSql)->fetchAll();

// 查询所有版本 (联表查出发版者真实姓名)
$verSql = "SELECT v.*, v.author_name as creator_name FROM versions v ORDER BY v.item_id ASC, v.is_default DESC, v.id DESC";
$versionsRaw = $db->query($verSql)->fetchAll();

// 按项目组织版本 (未指定作者的迁移数据保持 null，不强行填“管理员”)
$itemVersions = [];
foreach ($versionsRaw as $v) {
    $itemVersions[$v['item_id']][] = Auth::versionForClient($v);
}

// 查询待审批入驻申请数量 (用于管理员控制中心图标红点提示)
$pendingUserCount = 0;
if ($isAdmin) {
    try {
        $pRow = $db->query("SELECT COUNT(*) as c FROM users WHERE status = 0")->fetch();
        $pendingUserCount = $pRow ? (int)$pRow['c'] : 0;
    } catch (\Exception $e) {}
}

// 按分类组织项目
$catItems = [];
foreach ($itemsRaw as $it) {
    $it['creator_name'] = !empty($it['creator_name']) ? $it['creator_name'] : null;
    $it['versions'] = $itemVersions[$it['id']] ?? [];
    $catItems[$it['category_id']][] = $it;
}

// 计算项目总展示数量 (用于右侧画布空状态判定)
$totalDisplayItems = 0;
foreach ($catItems as $cId => $its) {
    $totalDisplayItems += count($its);
}

// 计算当前视角在左侧侧边栏实际能见到的文件夹数量 (管理视角只要有文件夹即展示，访客视角仅展示非空文件夹)
$sidebarVisibleCats = 0;
foreach ($cats as $cat) {
    $cItems = $catItems[$cat['id']] ?? [];
    if ($canManage || !empty($cItems)) {
        $sidebarVisibleCats++;
    }
}
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($siteTitle); ?></title>
    <meta name="csrf-token" content="<?php echo get_csrf_token(); ?>">
    <link rel="icon" href="<?php echo htmlspecialchars($favUrl); ?>" type="<?php echo $favType; ?>">
    <link rel="stylesheet" href="assets/css/bootstrap.min.css">
    <link rel="stylesheet" href="assets/css/remixicon.css">
    <link rel="stylesheet" href="assets/css/app.css?v=<?php echo APP_VERSION . '.' . filemtime(__DIR__ . '/assets/css/app.css'); ?>">
    <script src="assets/js/jquery.min.js"></script>
</head>
<?php
    $bodyClasses = [];
    if ($canManage) $bodyClasses[] = 'can-manage';
    if (Auth::canShare()) $bodyClasses[] = 'can-share';
    if (Auth::canDownloadRp()) $bodyClasses[] = 'can-download-rp';
    if (Auth::canAnnotate()) $bodyClasses[] = 'has-anno';
?>
<body class="<?php echo implode(' ', $bodyClasses); ?>">

<div class="layout-container">
    <!-- 左侧侧边栏 -->
    <div class="workspace-sidebar" id="sidebar">
        <div class="sidebar-header">
            <div class="site-brand">
                <img src="assets/images/logo-icon.svg?v=<?php echo APP_VERSION; ?>" alt="立象原型" onerror="this.style.display='none'">
                <?php if (!empty($companyName)): ?>
                    <span class="brand-company-name" title="<?php echo htmlspecialchars($companyName); ?>"><?php echo htmlspecialchars($companyName); ?></span>
                <?php else: ?>
                    <span>立象原型</span>
                <?php endif; ?>
            </div>
            <?php if ($canManage): ?>
                <div class="quick-add-wrap" id="quickAddWrap">
                    <button class="btn-act" id="btnQuickAdd" onclick="toggleQuickAddMenu(event)" title="快速创建">
                        <i class="ri-add-line" style="font-size:18px;"></i>
                    </button>
                    <div class="quick-add-menu" id="quickAddMenu" onclick="event.stopPropagation()">
                        <button type="button" class="quick-add-item" onclick="closeQuickAddMenu();openQuickUploadModal();">
                            <i class="ri-upload-cloud-line" style="color:var(--primary);"></i>
                            <span>发布版本</span>
                        </button>
                        <button type="button" class="quick-add-item" onclick="closeQuickAddMenu();openQuickItemModal('project');">
                            <i class="ri-pages-line"></i>
                            <span>新建项目</span>
                        </button>
                        <button type="button" class="quick-add-item" onclick="closeQuickAddMenu();openQuickItemModal('link');">
                            <i class="ri-links-line"></i>
                            <span>新建链接</span>
                        </button>
                        <div class="quick-add-divider"></div>
                        <button type="button" class="quick-add-item" onclick="closeQuickAddMenu();openCategoryModal();">
                            <i class="ri-folder-add-line"></i>
                            <span>新建文件夹</span>
                        </button>
                    </div>
                </div>
            <?php endif; ?>
        </div>

        <div class="search-wrap">
            <i class="ri-search-line search-icon"></i>
            <input type="text" class="search-input" id="searchKeyword" placeholder="搜索项目或版本..." oninput="handleSearch(this.value)" onkeydown="if(event.key==='Escape')clearSearch()">
            <button type="button" class="search-clear-btn" id="searchClearBtn" onclick="clearSearch()" title="清空搜索" style="display:none;">
                <i class="ri-close-line"></i>
            </button>
        </div>

        <!-- 分类与项目树 -->
        <div class="sidebar-menu" id="categoryTree">
            <div id="searchEmptyState" class="search-empty-state" style="display:none;">
                <i class="ri-search-line"></i>
                <span>搜了个寂寞，是不是敲错字了？</span>
                <button type="button" class="search-empty-clear-btn" onclick="clearSearch()">清空搜索</button>
            </div>
            <?php if ($sidebarVisibleCats === 0): ?>
                <div class="sidebar-empty-box">
                    <div class="sidebar-empty-icon"><i class="ri-folder-add-line"></i></div>
                    <div class="sidebar-empty-title"><?php echo $canManage ? '目录树空空如也' : '空空如也'; ?></div>
                    <div class="sidebar-empty-desc"><?php echo $canManage ? '建个文件夹治愈强迫症' : '产品经理还在疯狂赶稿中…'; ?></div>
                    <?php if ($canManage): ?>
                        <button type="button" class="sidebar-empty-btn" onclick="openCategoryModal()">
                            <i class="ri-folder-add-line"></i> 新建文件夹
                        </button>
                    <?php endif; ?>
                </div>
            <?php else: ?>
                <?php foreach ($cats as $cat): ?>
                <?php 
                $items = $catItems[$cat['id']] ?? [];
                // 如果是访客且该分类下没有任何公开项目，跳过该分类
                if (!$canManage && empty($items)) continue;
                // 空文件夹默认折叠，有项目的文件夹保持展开
                $isCollapsedClass = empty($items) ? 'collapsed' : '';
                ?>
                <div class="category-group <?php echo $isCollapsedClass; ?>" data-cat-id="<?php echo $cat['id']; ?>">
                    <div class="category-header" onclick="toggleCategory(this, event)">
                        <div class="cat-title-wrap">
                            <i class="ri-arrow-down-s-line cat-arrow"></i>
                            <span class="cat-name-text"><?php echo htmlspecialchars($cat['name']); ?></span>
                            <span style="font-size:11px;opacity:0.6;">(<?php echo count($items); ?>)</span>
                        </div>
                    </div>

                    <ul class="category-items">
                        <?php if ($canManage && empty($items)): ?>
                            <li class="empty-folder-item" style="padding:6px 10px 6px 30px;font-size:11.5px;color:var(--text-4);user-select:none;display:flex;align-items:center;gap:4px;">
                                <i class="ri-inbox-line" style="font-size:12px;opacity:0.6;"></i>
                                <span>暂无项目</span>
                            </li>
                        <?php else: ?>
                        <?php foreach ($items as $it): ?>
                            <?php
                            $defaultVer = null;
                            foreach ($it['versions'] as &$v) {
                                if ($v['is_default']) { $defaultVer = $v; }
                            }
                            unset($v);
                            if (!$defaultVer && !empty($it['versions'])) {
                                $defaultVer = $it['versions'][0];
                            }

                            $isShareDisabled = Auth::isItemShareDisabled($it['id']);
                            $isCollaborator = false;
                            if (!empty($it['collaborators'])) {
                                $collabIds = array_filter(array_map('intval', explode(',', (string)$it['collaborators'])));
                                $isCollaborator = in_array((int)($currentUser['id'] ?? 0), $collabIds, true);
                            }
                            $canEditThisItem = ($isAdmin || ($currentUser && (int)$it['created_by'] === (int)$currentUser['id']) || $isCollaborator);
                            $canDeleteThisItem = ($isAdmin || ($currentUser && (int)$it['created_by'] === (int)$currentUser['id']));
                            ?>
                            <li class="item-row <?php echo ($it['is_visible'] == 0) ? 'is-hidden-item' : ''; ?>"
                                id="item-node-<?php echo $it['id']; ?>"
                                data-item-id="<?php echo $it['id']; ?>"
                                data-cat-id="<?php echo $cat['id']; ?>"
                                data-type="<?php echo $it['type']; ?>"
                                data-name="<?php echo htmlspecialchars($it['name']); ?>"
                                data-target="<?php echo htmlspecialchars($it['link_target'] ?? '_blank'); ?>"
                                data-href="<?php echo htmlspecialchars($it['type'] === 'link' ? $it['link_url'] : ($defaultVer['entry_file'] ?? '')); ?>"
                                data-rp="<?php echo htmlspecialchars($defaultVer['rp_file'] ?? ''); ?>"
                                data-ver="<?php echo htmlspecialchars($defaultVer['version_name'] ?? ''); ?>"
                                data-ver-id="<?php echo htmlspecialchars($defaultVer['id'] ?? ''); ?>"
                                data-time="<?php echo htmlspecialchars($defaultVer['updated_at'] ?? ''); ?>"
                                data-share-disabled="<?php echo $isShareDisabled ? '1' : '0'; ?>"
                                data-created-by="<?php echo (int)($it['created_by'] ?? 0); ?>"
                                data-creator-name="<?php echo htmlspecialchars($it['creator_name'] ?? ''); ?>"
                                data-collaborators="<?php echo htmlspecialchars($it['collaborators'] ?? ''); ?>"
                                data-watermark="<?php echo (int)($it['watermark_enabled'] ?? 0); ?>"
                                data-ver-creator="<?php echo htmlspecialchars($defaultVer['creator_name'] ?? ''); ?>"
                                data-versions="<?php echo htmlspecialchars(json_encode($it['versions'] ?? []), ENT_QUOTES, 'UTF-8'); ?>"
                                data-can-edit="<?php echo ($canManage && $canEditThisItem) ? '1' : '0'; ?>"
                                onclick="selectItem(<?php echo $it['id']; ?>, this, null, true)">

                                <div class="item-name-wrap">
                                    <i class="<?php echo $it['type'] === 'link' ? 'ri-external-link-line' : 'ri-pages-line'; ?> item-icon"></i>
                                    <span class="item-title" title="<?php echo htmlspecialchars($it['name']); ?>"><?php echo htmlspecialchars($it['name']); ?></span>
                                    <?php if ($it['is_visible'] == 0): ?>
                                        <i class="ri-eye-off-line" style="font-size:12px;color:var(--warning);opacity:0.8;margin-left:2px;" title="已隐藏"></i>
                                    <?php endif; ?>
                                    <?php if ($isShareDisabled): ?>
                                        <i class="ri-forbid-line" style="font-size:12px;color:var(--text-3);opacity:0.7;margin-left:2px;" title="分享已停用"></i>
                                    <?php endif; ?>
                                </div>

                                <!-- 侧栏原地操作收敛: 仅保留核心高频发版，设为隐藏与删除等统一收归控制台项目管理 -->
                                <?php if ($canManage && $it['type'] === 'project' && $canEditThisItem): ?>
                                    <div class="admin-controls" onclick="event.stopPropagation()">
                                        <button class="btn-act" onclick="openUploadModal(<?php echo $it['id']; ?>, '<?php echo htmlspecialchars(addslashes($it['name'])); ?>')" title="发布版本"><i class="ri-upload-cloud-line"></i></button>
                                    </div>
                                <?php endif; ?>
                            </li>
                        <?php endforeach; ?>
                        <?php endif; ?>
                    </ul>
                </div>
            <?php endforeach; ?>
            <?php endif; ?>
        </div>

        <!-- 侧边栏底部信息与登录 -->
        <div class="sidebar-footer">
            <?php if ($currentUser): ?>
                <div style="display:flex;align-items:center;justify-content:space-between;width:100%;">
                    <button type="button" class="user-badge" style="min-width:0;max-width:calc(100% - 68px);" onclick="openProfileModal()">
                        <i class="ri-user-smile-line" style="color:var(--primary);flex-shrink:0;"></i>
                        <?php $showName = !empty($currentUser['name']) ? $currentUser['name'] : (!empty($currentUser['email']) ? $currentUser['email'] : '用户'); ?>
                        <span style="font-weight:600;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;" title="<?php echo htmlspecialchars($currentUser['email'] ?? ''); ?>"><?php echo htmlspecialchars($showName); ?></span>
                        <span class="badge-tag <?php echo !empty($currentUser['is_owner']) ? 'badge-role-owner' : ($isAdmin ? 'badge-role-admin' : ($canManage ? 'badge-role-editor' : 'badge-role-viewer')); ?>" style="flex-shrink:0;"><?php echo !empty($currentUser['is_owner']) ? '主管理员' : ($isAdmin ? '管理员' : ($canManage ? '协作者' : '审阅人')); ?></span>
                    </button>
                    <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
                        <?php if ($canManage): ?>
                            <button class="btn-act" onclick="openAdminConsole()" title="控制中心" style="position:relative;">
                                <i class="ri-settings-3-line"></i>
                                <span id="adminSettingsDot" style="<?php echo ($isAdmin && $pendingUserCount > 0) ? '' : 'display:none;'; ?>position:absolute;top:4px;right:4px;width:7px;height:7px;background:var(--danger,#dc2626);border-radius:50%;border:1.5px solid var(--surface,#fff);pointer-events:none;"></span>
                            </button>
                        <?php endif; ?>
                        <button class="btn-act" onclick="doLogout()" title="退出登录">
                            <i class="ri-logout-box-r-line"></i>
                        </button>
                    </div>
                </div>
            <?php endif; ?>
        </div>
    </div>

    <!-- 右侧沉浸展示区 -->
    <div class="workspace-main">
        <div class="top-navbar">
            <div class="prototype-meta" style="position:relative;">
                <span class="current-proto-title" id="barTitle">未选择项目</span>
                <span class="current-ver-tag" id="barVer" style="display:none;"></span>
                <div class="ver-picker-wrap" id="barVerPickerWrap" style="display:none;">
                    <select class="top-ver-select" id="barVerSelect" style="display:none;" onchange="onTopVersionChange(this)"></select>
                </div>
                <div class="top-changelog-wrap" id="barChangelogWrap" style="display:none;">
                    <button type="button" class="btn-top-changelog" id="barChangelogBtn" onclick="toggleTopChangelog(this)" title="查看更新日志">
                        <i class="ri-file-list-2-line"></i> 日志
                    </button>
                    <div class="top-changelog-popover" id="topChangelogPopover" style="display:none;" onclick="event.stopPropagation()">
                        <div class="top-changelog-head">
                            <div class="top-changelog-head-left">
                                <span class="top-changelog-title"><i class="ri-file-list-2-line" style="color:var(--primary);"></i> 更新日志</span>
                                <span class="top-changelog-ver" id="topChangelogVerName"></span>
                            </div>
                            <button type="button" class="close-x" onclick="toggleTopChangelog(false)" title="关闭 (ESC)"><i class="ri-close-line"></i></button>
                        </div>
                        <div class="top-changelog-body" id="topChangelogBody"></div>
                    </div>
                </div>
                <?php if ($canManage): ?>
                <button type="button" class="btn-top-ver-manage" id="barBtnVerManage" style="display:none;" onclick="openCurrentVersionManage()" title="管理此项目的历史版本与底稿">
                    <i class="ri-history-line"></i> 版本
                </button>
                <?php endif; ?>
                <span class="current-proto-author" id="barAuthor" style="display:none;"></span>
                <span class="current-update-time" id="barTime" style="display:none;"></span>
            </div>

            <div class="top-actions">
                <!-- RP 源文件一键下载按钮 -->
                <a href="javascript:void(0)" id="btnDownloadRp" class="btn-tool btn-tool-primary" style="display:none;" download>
                    <i class="ri-download-cloud-2-line"></i> 下载 RP
                </a>
                <!-- RP 快捷补传按钮 (仅有发版/管理权限且当前版本未上传 RP 时展示) -->
                <?php if ($canManage): ?>
                <button type="button" id="btnUploadRpQuick" class="btn-tool btn-tool-dashed" style="display:none;" title="此版本暂无 RP 底稿，点击补传" onclick="triggerQuickRpUpload()">
                    <i class="ri-upload-2-line"></i> 补传 RP
                </button>
                <input type="file" id="quickRpFileInput" accept=".rp" style="display:none;" onchange="handleQuickRpFileSelected(this)">
                <?php endif; ?>
                <button class="btn-tool" onclick="reloadIframe()" title="刷新"><i class="ri-refresh-line"></i> 刷新</button>
                <?php if (Auth::canAnnotate()): ?>
                <button class="btn-tool" id="btnToggleAnnotation" onclick="toggleAnnotationDrawer()" title="页面批注与协作讨论 (快捷键 C)">
                    <i class="ri-chat-3-line"></i> 批注
                    <span id="annoHeaderBadge" class="anno-badge" style="display:none;">0</span>
                </button>
                <?php endif; ?>
                <?php if (Auth::canShare()): ?>
                <button class="btn-tool" onclick="copyShareUrl()" title="分享"><i class="ri-share-forward-line"></i> 分享</button>
                <?php endif; ?>
                <button class="btn-tool" onclick="toggleFullscreen()" title="全屏"><i class="ri-fullscreen-line"></i> 全屏</button>
            </div>
        </div>

        <div class="iframe-container" id="iframeWrap">
            <div class="empty-placeholder" id="placeholder">
                <?php if ($totalDisplayItems === 0): ?>
                    <div class="empty-state-box">
                        <div class="empty-state-illustration">
                            <svg width="148" height="118" viewBox="0 0 148 118" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <!-- 辅助对齐网格与十字标 -->
                                <line x1="8" y1="28" x2="140" y2="28" stroke="#e7eaf0" stroke-width="1" stroke-dasharray="3 3"/>
                                <line x1="8" y1="92" x2="140" y2="92" stroke="#e7eaf0" stroke-width="1" stroke-dasharray="3 3"/>
                                <line x1="28" y1="12" x2="28" y2="108" stroke="#e7eaf0" stroke-width="1" stroke-dasharray="3 3"/>
                                <line x1="120" y1="12" x2="120" y2="108" stroke="#e7eaf0" stroke-width="1" stroke-dasharray="3 3"/>
                                <circle cx="28" cy="28" r="2" fill="#cbd5e1"/>
                                <circle cx="120" cy="28" r="2" fill="#cbd5e1"/>
                                <circle cx="28" cy="92" r="2" fill="#cbd5e1"/>
                                <circle cx="120" cy="92" r="2" fill="#cbd5e1"/>

                                <!-- 纯白原型图纸画卷 (微倾斜立体阴影层) -->
                                <rect x="18" y="22" width="76" height="74" rx="7" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
                                <!-- 图纸顶部标签栏 -->
                                <line x1="18" y1="34" x2="94" y2="34" stroke="#f1f5f9" stroke-width="1"/>
                                <circle cx="25" cy="28" r="1.75" fill="#e2e8f0"/>
                                <circle cx="30" cy="28" r="1.75" fill="#e2e8f0"/>
                                <circle cx="35" cy="28" r="1.75" fill="#e2e8f0"/>

                                <!-- 原型线框骨架图景 -->
                                <rect x="25" y="40" width="34" height="6" rx="2" fill="#0076de" fill-opacity="0.2"/>
                                <rect x="25" y="50" width="56" height="2.5" rx="1" fill="#f1f5f9"/>
                                <rect x="25" y="55.5" width="44" height="2.5" rx="1" fill="#f1f5f9"/>
                                <rect x="25" y="63" width="28" height="24" rx="4" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
                                <rect x="28" y="66" width="22" height="10" rx="2" fill="#0076de" fill-opacity="0.12"/>
                                <rect x="28" y="79" width="16" height="2" rx="1" fill="#cbd5e1"/>
                                <rect x="58" y="63" width="28" height="24" rx="4" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
                                <rect x="61" y="66" width="22" height="10" rx="2" fill="#0076de" fill-opacity="0.12"/>
                                <rect x="61" y="79" width="16" height="2" rx="1" fill="#cbd5e1"/>

                                <!-- 品牌官方折纸大象 (等比缩放嵌入右侧，带来生机与守护感) -->
                                <g transform="translate(68, 20) scale(0.62)">
                                    <polygon points="16.3,51.15 16.64,59.63 9.89,65.51" fill="#68b5f8" />
                                    <polygon points="17.51,75.89 18.2,89.21 3.32,85.06" fill="#68b5f8" />
                                    <polygon points="2.97,86.97 11.97,89.21 6.61,96.48" fill="#68b5f8" />
                                    <polygon points="17.85,49.42 34.46,31.78 31.87,78.66 19.76,88.52" fill="#0076de" />
                                    <polygon points="36.71,31.43 64.22,34.72 54.36,47.35 33.77,76.93" fill="#0076de" />
                                    <polygon points="57.47,50.46 57.47,78.49 36.71,76.24" fill="#68b5f8" />
                                    <polygon points="59.2,49.94 76.85,60.67 68.02,99.94 59.2,107.55" fill="#0076de" />
                                    <polygon points="68.2,102.02 71.31,108.59 60.58,108.59" fill="#0076de" />
                                    <polygon points="77.71,67.76 88.26,79.01 81.0,84.72 74.6,80.91" fill="#68b5f8" />
                                    <polygon points="88.96,80.39 88.44,95.1 79.44,91.98 82.21,86.45" fill="#0076de" />
                                    <polygon points="72.69,28.66 80.82,60.5 57.12,46.48" fill="#68b5f8" />
                                    <polygon points="74.77,28.49 86.19,28.49 96.05,34.72 108.68,62.75 96.05,57.73 93.63,53.23 97.26,62.57 81.86,57.21" fill="#0076de" />
                                    <polygon points="105.74,52.19 120.44,56.0 110.41,62.92" fill="#68b5f8" />
                                    <polygon points="112.48,52.19 122.0,42.85 120.79,54.44" fill="#0076de" />
                                    <polygon points="113.69,35.76 121.31,41.64 117.33,45.27 116.12,45.96" fill="#68b5f8" />
                                    <polygon points="114.04,33.85 116.81,31.09 117.67,36.8" fill="#68b5f8" />
                                    <polygon points="118.02,30.74 122.52,30.74 118.71,34.72" fill="#0076de" />
                                    <!-- 朱砂红灵感小球及其微波纹 -->
                                    <circle cx="120.27" cy="24.17" r="9" fill="#ff5d47" fill-opacity="0.14" />
                                    <circle cx="120.27" cy="24.17" r="4.76" fill="#ff5d47" />
                                </g>
                            </svg>
                        </div>
                        <div class="empty-state-title">画布已就绪，静待第一份图纸</div>
                        <div class="empty-state-desc">万事俱备，就差那份改了 18 版的“最终版_v3_真不改了”</div>
                        <?php if ($canManage): ?>
                            <div class="empty-state-actions">
                                <?php if (empty($cats)): ?>
                                <button type="button" class="empty-state-btn" onclick="openCategoryModal(0)"><i class="ri-folder-add-line"></i> 新建文件夹</button>
                                <?php else: ?>
                                <button type="button" class="empty-state-btn" onclick="openQuickItemModal('project')"><i class="ri-add-line"></i> 新建项目</button>
                                <?php endif; ?>
                            </div>
                        <?php else: ?>
                            <div style="margin-top:14px;font-size:13px;color:var(--text-3);">
                                暂无公开图纸，请等待产品经理或项目成员发布
                            </div>
                        <?php endif; ?>
                    </div>
                <?php else: ?>
                    <div class="empty-state-box">
                        <div class="empty-state-illustration">
                            <svg width="124" height="100" viewBox="0 0 124 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <!-- 背景工程十字定位坐标 -->
                                <circle cx="16" cy="18" r="1.5" fill="#cbd5e1"/>
                                <circle cx="108" cy="18" r="1.5" fill="#cbd5e1"/>
                                <circle cx="16" cy="82" r="1.5" fill="#cbd5e1"/>
                                <circle cx="108" cy="82" r="1.5" fill="#cbd5e1"/>

                                <!-- 后层微倾斜画卷（营造原型多页面景深感） -->
                                <rect x="36" y="20" width="58" height="46" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2" transform="rotate(3 65 43)"/>

                                <!-- 前层纯白原型画卷（绝对居中，中心 62, 50） -->
                                <rect x="33" y="27" width="58" height="46" rx="6" fill="#ffffff" stroke="#94a3b8" stroke-width="1.5"/>
                                <line x1="33" y1="38" x2="91" y2="38" stroke="#f1f5f9" stroke-width="1"/>
                                <circle cx="39" cy="32.5" r="1.5" fill="#e2e8f0"/>
                                <circle cx="43.5" cy="32.5" r="1.5" fill="#e2e8f0"/>
                                <circle cx="48" cy="32.5" r="1.5" fill="#e2e8f0"/>

                                <!-- 线框骨架 -->
                                <rect x="40" y="43" width="22" height="4" rx="1.5" fill="#0076de" fill-opacity="0.25"/>
                                <rect x="40" y="50" width="44" height="2" rx="1" fill="#f1f5f9"/>
                                <rect x="40" y="55" width="20" height="11" rx="2" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
                                <rect x="63" y="55" width="20" height="11" rx="2" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>

                                <!-- 交互核心：画卷中央的聚焦涟漪 Focus Ring -->
                                <circle cx="62" cy="54" r="16" fill="#0076de" fill-opacity="0.06" stroke="#0076de" stroke-width="1" stroke-dasharray="2 3"/>
                                <circle cx="62" cy="54" r="8" fill="#0076de" fill-opacity="0.12"/>

                                <!-- 优雅的晴空蓝检阅光标 (落点精准对齐中心 62, 54) -->
                                <g transform="translate(56, 48)">
                                    <path d="M0 0 L11 11 L6 12 L9 18.5 L6 19.8 L3 13.5 L-2.5 17 Z" fill="#0076de" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>
                                </g>

                                <!-- 右上角点睛朱砂红灵感火花与光环 -->
                                <circle cx="95" cy="24" r="7" fill="#ff5d47" fill-opacity="0.15"/>
                                <circle cx="95" cy="24" r="3.5" fill="#ff5d47"/>
                            </svg>
                        </div>
                        <div class="empty-state-title">今天看哪份原型？</div>
                        <div class="empty-state-desc">在左侧挑一个项目，见证每一次“按原样实现”的承诺</div>
                        <div class="empty-kbd-hint"><kbd>/</kbd> 键快速搜索</div>
                    </div>
                <?php endif; ?>
            </div>
            <div class="empty-placeholder" id="noVersionPlaceholder" style="display:none;"></div>
            <iframe name="myFrame" id="myFrame" sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"></iframe>
            <div id="watermarkOverlay" class="watermark-overlay" style="display:none;"></div>

            <!-- 右侧可折叠批注抽屉 (350px) -->
            <?php if (Auth::canAnnotate()): ?>
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
                        <span class="anno-filter-divider" id="annoHistoryDivider" hidden></span>
                        <button type="button" class="anno-filter-btn" id="annoHistoryToolbar" onclick="togglePreviousAnnotations()" title="查看上一版未解决批注并引用到本版" hidden>上版未决</button>
                    </div>
                </div>

                <div id="annoPreviousPanel" class="anno-previous-panel" hidden></div>
                <div class="anno-body" id="annoListBody">
                    <div style="padding:32px 16px;text-align:center;color:var(--text-3);font-size:12px;">加载中...</div>
                </div>

                <div class="anno-footer" id="annoFooter">
                    <?php if ($currentUser): ?>
                        <textarea id="annoNewInput" class="anno-input-textarea" placeholder="对此页面发表批注或疑问... (Cmd/Ctrl+Enter 快捷发送)" maxlength="1000"></textarea>
                        <div class="anno-footer-actions">
                            <span class="anno-hint-text"><kbd>⌘/Ctrl</kbd> + <kbd>Enter</kbd> 发送</span>
                            <button type="button" class="btn-primary btn-sm" id="btnSendAnno" onclick="submitNewAnnotation()">
                                <i class="ri-send-plane-fill"></i> 发送
                            </button>
                        </div>
                    <?php else: ?>
                        <div style="text-align:center;padding:8px 0;">
                            <div style="font-size:12.5px;color:var(--text-2);margin-bottom:8px;">登录后参与批注</div>
                            <button type="button" class="btn-primary btn-sm" onclick="openLoginModal('login')">
                                <i class="ri-login-box-line"></i> 登录 / 申请
                            </button>
                        </div>
                    <?php endif; ?>
                </div>
            </div>
            <?php endif; ?>
        </div>
    </div>
</div>

<!-- 弹窗组件集合 -->
<?php include __DIR__ . '/includes/modals.php'; ?>

<script>
    var CURRENT_USER = <?php echo json_encode($currentUser ? [
        'id' => (int)$currentUser['id'],
        'email' => $currentUser['email'] ?? '',
        'name' => $currentUser['name'] ?? '',
        'username' => $currentUser['email'] ?? '',
        'display_name' => $currentUser['name'] ?? '',
        'webhook_url' => $currentUser['webhook_url'] ?? '',
        'role' => $currentUser['role'],
        'is_owner' => (int)$currentUser['is_owner'],
        'is_first_login' => (int)($currentUser['is_first_login'] ?? 0)
    ] : null); ?>;
    var SYS_HAS_GLOBAL_WEBHOOK = <?php echo !empty(Auth::getSetting('global_webhook_url', '')) ? 'true' : 'false'; ?>;
    var GLOBAL_WATERMARK_ENABLED = <?php echo Auth::getSetting('global_watermark_enabled', '0') === '1' ? 'true' : 'false'; ?>;
    var PENDING_USER_COUNT = <?php echo (int)$pendingUserCount; ?>;
    <?php
        $savedNotifyAdminJson = Auth::getSetting('visitor_notify_admin_ids', '');
        $selectedNotifyAdminIds = !empty($savedNotifyAdminJson) ? json_decode($savedNotifyAdminJson, true) : null;
    ?>
    var SAVED_NOTIFY_ADMIN_IDS = <?php echo json_encode($selectedNotifyAdminIds !== null ? array_values(array_map('intval', $selectedNotifyAdminIds)) : null); ?>;
</script>
<!-- 核心脚本加载 (带版本强缓存自动刷新控制) -->
<?php
$verSuffix = function($relPath) {
    $full = __DIR__ . '/' . $relPath;
    return APP_VERSION . '.' . (file_exists($full) ? filemtime($full) : '0');
};
?>
<script src="assets/js/mcp.js?v=<?php echo $verSuffix('assets/js/mcp.js'); ?>"></script>
<script src="assets/js/watermark.js?v=<?php echo $verSuffix('assets/js/watermark.js'); ?>"></script>
<script src="assets/js/ver-picker.js?v=<?php echo $verSuffix('assets/js/ver-picker.js'); ?>"></script>
<script src="assets/js/password-strength.js?v=<?php echo $verSuffix('assets/js/password-strength.js'); ?>" defer></script>
<script src="assets/js/app.js?v=<?php echo $verSuffix('assets/js/app.js'); ?>"></script>
<?php if (Auth::canAnnotate()): ?>
<script src="assets/js/annotation.js?v=<?php echo $verSuffix('assets/js/annotation.js'); ?>"></script>
<?php endif; ?>
<?php if ($canManage): ?>
    <script src="assets/js/echarts.min.js?v=<?php echo APP_VERSION; ?>"></script>
<?php endif; ?>
<?php if (Auth::canShare()): ?>
    <script src="assets/js/share.js?v=<?php echo $verSuffix('assets/js/share.js'); ?>"></script>
<?php endif; ?>
<?php if ($canManage): ?>
    <script src="assets/js/admin.js?v=<?php echo $verSuffix('assets/js/admin.js'); ?>"></script>
<?php endif; ?>

</body>
</html>
