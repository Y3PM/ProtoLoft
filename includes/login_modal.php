<?php
$visitorRegEnabled = (Auth::getSetting('visitor_register_enabled', '1') !== '0');
$mailResetEnabled = class_exists('Mailer') ? Mailer::isConfiguredAndEnabled() : false;
$allowedDomainsSetting = Auth::getSetting('allowed_email_domains', '');
$fixedEmailDomain = '';
if (!empty(trim($allowedDomainsSetting))) {
    $domainList = array_filter(array_map('trim', explode(',', strtolower($allowedDomainsSetting))));
    if (count($domainList) === 1) {
        $fixedEmailDomain = reset($domainList);
    }
}
?>
<!-- 登录与访客申请通用弹窗 (标准 S 档 440px) -->
<div id="loginModal" class="custom-modal" style="display:none;">
    <div class="modal-dialog-box modal-sm" style="box-sizing:border-box;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
            <div style="font-size:15px;font-weight:600;color:var(--text-1);" id="loginModalTitle"><?php echo htmlspecialchars(t('auth.login_title')); ?></div>
            <button type="button" onclick="closeLoginModal()" class="close-x" title="<?php echo htmlspecialchars(t('common.close')); ?>"><i class="ri-close-line"></i></button>
        </div>

        <!-- 1. 登录面板 -->
        <div id="paneDoLogin">
            <form id="loginForm" onsubmit="handleDoLogin(event)" autocomplete="on">
                <div id="loginSuccessNotice" class="m-alert m-alert-success" style="display:none;margin-bottom:14px;align-items:center;gap:6px;">
                    <i class="ri-checkbox-circle-fill" style="font-size:15px;color:#10b981;flex-shrink:0;"></i>
                    <span></span>
                </div>
                <div class="m-form-group">
                    <label class="m-label" for="loginEmail"><?php echo htmlspecialchars(t('auth.work_email')); ?></label>
                    <div style="position:relative;display:flex;align-items:center;">
                        <input type="text" id="loginEmail" name="username" class="m-input" data-fixed-domain="<?php echo htmlspecialchars($fixedEmailDomain); ?>" placeholder="<?php echo htmlspecialchars($fixedEmailDomain ? t('auth.email_prefix_input') : t('auth.work_email')); ?>" autocomplete="username" required autofocus maxlength="100" style="flex:1;<?php echo $fixedEmailDomain ? ('padding-right:' . (mb_strlen($fixedEmailDomain)*8 + 34) . 'px;') : ''; ?>" oninput="handleEmailInputWithDomain(this, 'loginDomainBadge')">
                        <?php if ($fixedEmailDomain): ?>
                            <span id="loginDomainBadge" class="email-fixed-badge" style="position:absolute;right:8px;font-size:12px;color:var(--text-3);background:var(--bg-tag, #f1f5f9);border:1px solid var(--border-light, #e2e8f0);padding:2px 7px;border-radius:4px;pointer-events:none;user-select:none;">@<?php echo htmlspecialchars($fixedEmailDomain); ?></span>
                        <?php endif; ?>
                    </div>
                </div>
                <div class="m-form-group">
                    <label class="m-label" for="loginPassword"><?php echo htmlspecialchars(t('auth.password')); ?></label>
                    <div class="pwd-input-wrap">
                        <input type="password" id="loginPassword" name="password" class="m-input" placeholder="<?php echo htmlspecialchars(t('auth.enter_password')); ?>" autocomplete="current-password" required maxlength="64">
                        <button type="button" class="btn-eye-toggle" onclick="togglePasswordVisibility('loginPassword', this)" title="<?php echo htmlspecialchars(t('auth.toggle_password')); ?>">
                            <i class="ri-eye-line"></i>
                        </button>
                    </div>
                </div>
                <div style="display:flex;align-items:center;justify-content:flex-start;margin:10px 0 14px;">
                    <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--text-2);cursor:pointer;user-select:none;">
                        <input type="checkbox" id="loginRememberMe" name="remember_me" value="1" checked style="cursor:pointer;accent-color:var(--primary);width:14px;height:14px;">
                        <span><?php echo htmlspecialchars(t('auth.remember_me')); ?></span>
                    </label>
                </div>
                <div id="loginError" class="m-error" style="display:none;margin-bottom:12px;"></div>
                <button type="submit" id="btnLoginSubmit" class="btn-primary btn-block" style="margin-top:4px;"><?php echo htmlspecialchars(t('auth.login_btn')); ?></button>
                <div class="auth-footer-links">
                    <?php if ($visitorRegEnabled): ?>
                        <a href="javascript:void(0)" onclick="toggleLoginRegPane('reg')" id="linkToRegister"><?php echo htmlspecialchars(t('auth.apply_join_link')); ?></a>
                    <?php else: ?>
                        <span></span>
                    <?php endif; ?>
                    <a href="javascript:void(0)" onclick="toggleLoginRegPane('forgot')" id="linkToForgot" class="auth-link-muted"><?php echo htmlspecialchars(t('auth.forgot_link')); ?></a>
                </div>
            </form>
        </div>

        <!-- 3. 找回密码面板 -->
        <div id="paneForgotPassword" style="display:none;">
            <form id="modalForgotForm" onsubmit="handleDoForgotPassword(event)">
                <div id="modalForgotMailBox">
                    <div id="modalForgotSuccess" class="m-alert m-alert-success" style="display:none;margin-bottom:14px;align-items:center;gap:6px;">
                        <i class="ri-checkbox-circle-fill" style="font-size:15px;color:#10b981;flex-shrink:0;"></i>
                        <span></span>
                    </div>
                    <div class="m-form-group">
                        <label class="m-label" for="modalForgotEmail"><?php echo htmlspecialchars(t('auth.work_email')); ?></label>
                        <div style="position:relative;display:flex;align-items:center;">
                            <input type="text" id="modalForgotEmail" class="m-input" data-fixed-domain="<?php echo htmlspecialchars($fixedEmailDomain); ?>" placeholder="<?php echo htmlspecialchars($fixedEmailDomain ? t('auth.email_prefix_input') : t('auth.email_example_placeholder')); ?>" autocomplete="email" required maxlength="100" style="flex:1;<?php echo $fixedEmailDomain ? ('padding-right:' . (mb_strlen($fixedEmailDomain)*8 + 34) . 'px;') : ''; ?>" oninput="handleEmailInputWithDomain(this, 'modalForgotDomainBadge')">
                            <?php if ($fixedEmailDomain): ?>
                                <span id="modalForgotDomainBadge" class="email-fixed-badge" style="position:absolute;right:8px;font-size:12px;color:var(--text-3);background:var(--bg-tag, #f1f5f9);border:1px solid var(--border-light, #e2e8f0);padding:2px 7px;border-radius:4px;pointer-events:none;user-select:none;">@<?php echo htmlspecialchars($fixedEmailDomain); ?></span>
                            <?php endif; ?>
                        </div>
                    </div>
                    <div id="modalForgotError" class="m-error" style="display:none;margin-bottom:12px;"></div>
                    <button type="submit" id="btnModalForgotSubmit" class="btn-primary btn-block" style="margin-top:4px;"><?php echo htmlspecialchars(t('auth.send_reset_mail')); ?></button>
                </div>
                <div id="modalForgotDisabledBox" style="display:none;">
                    <div class="auth-sub-note"><?php echo htmlspecialchars(t('auth.mail_reset_disabled')); ?></div>
                    <button type="button" class="btn-primary btn-block" onclick="toggleLoginRegPane('login')"><?php echo htmlspecialchars(t('auth.back_to_login')); ?></button>
                </div>
                <div id="modalForgotBackWrap" style="text-align:center;margin-top:12px;">
                    <a href="javascript:void(0)" onclick="toggleLoginRegPane('login')" style="font-size:12.5px;color:var(--text-3);text-decoration:none;"><?php echo htmlspecialchars(t('auth.back_to_login')); ?></a>
                </div>
            </form>
        </div>

        <!-- 2. 访客申请注册面板 (极致收敛为 3+1 项) -->
        <div id="paneDoRegister" style="display:none;">
            <form id="registerForm" onsubmit="handleDoRegister(event)" novalidate>
                <div class="m-form-group">
                    <label class="m-label" for="regEmail"><?php echo htmlspecialchars(t('auth.work_email')); ?> <span class="req-star">*</span></label>
                    <div style="position:relative;display:flex;align-items:center;">
                        <input type="text" id="regEmail" class="m-input" data-fixed-domain="<?php echo htmlspecialchars($fixedEmailDomain); ?>" placeholder="<?php echo htmlspecialchars($fixedEmailDomain ? t('auth.email_prefix_input') : t('auth.email_example_placeholder')); ?>" autocomplete="email" required maxlength="100" data-error-target="regEmailFieldError" aria-errormessage="regEmailFieldError" style="flex:1;<?php echo $fixedEmailDomain ? ('padding-right:' . (mb_strlen($fixedEmailDomain)*8 + 34) . 'px;') : ''; ?>" oninput="handleEmailInputWithDomain(this, 'regDomainBadge')">
                        <?php if ($fixedEmailDomain): ?>
                            <span id="regDomainBadge" class="email-fixed-badge" style="position:absolute;right:8px;font-size:12px;color:var(--text-3);background:var(--bg-tag, #f1f5f9);border:1px solid var(--border-light, #e2e8f0);padding:2px 7px;border-radius:4px;pointer-events:none;user-select:none;">@<?php echo htmlspecialchars($fixedEmailDomain); ?></span>
                        <?php endif; ?>
                    </div>
                    <div class="field-error-tip" id="regEmailFieldError" role="alert"></div>
                    <?php if ($fixedEmailDomain): ?>
                        <div style="font-size:11px;color:var(--text-3);margin-top:4px;"><?php echo htmlspecialchars(t('auth.email_hint_domain')); ?></div>
                    <?php endif; ?>
                </div>
                <div class="m-form-group">
                    <label class="m-label" for="regName"><?php echo htmlspecialchars(t('auth.real_name')); ?> <span class="req-star">*</span></label>
                    <input type="text" id="regName" class="m-input" placeholder="<?php echo htmlspecialchars(t('auth.real_name_example')); ?>" required maxlength="20" data-error-target="regNameFieldError" aria-errormessage="regNameFieldError">
                    <div class="field-error-tip" id="regNameFieldError" role="alert"></div>
                </div>
                <div class="m-form-group">
                    <div class="field-label-row">
                        <label class="m-label" for="regPassword"><?php echo htmlspecialchars(t('auth.login_password')); ?> <span class="req-star">*</span></label>
                        <span class="password-strength" id="regPasswordStrength" role="status"></span>
                    </div>
                    <div class="pwd-input-wrap">
                        <input type="password" id="regPassword" class="m-input" placeholder="<?php echo htmlspecialchars(t('auth.password_min_placeholder')); ?>" autocomplete="new-password" required data-password-strength="regPasswordStrength" data-error-target="regPasswordError" aria-describedby="regPasswordStrength" aria-errormessage="regPasswordError">
                        <button type="button" class="btn-eye-toggle" onclick="togglePasswordVisibility('regPassword', this)" title="<?php echo htmlspecialchars(t('auth.toggle_password')); ?>">
                            <i class="ri-eye-line"></i>
                        </button>
                    </div>
                    <div class="field-error-tip" id="regPasswordError" role="alert"></div>
                </div>
                <div class="m-form-group">
                    <div class="m-label"><?php echo htmlspecialchars(t('auth.apply_role')); ?> <span class="req-star">*</span></div>
                    <div class="reg-role-grid">
                        <label class="reg-role-card" for="regRoleViewer">
                            <input type="radio" id="regRoleViewer" name="reg_role" value="viewer" checked>
                            <div class="reg-role-head">
                                <span class="reg-role-title"><?php echo htmlspecialchars(t('common.role.viewer')); ?></span>
                                <span class="reg-role-check" aria-hidden="true"></span>
                            </div>
                            <div class="reg-role-desc"><?php echo htmlspecialchars(t('auth.role_viewer_desc')); ?></div>
                        </label>
                        <label class="reg-role-card" for="regRoleEditor">
                            <input type="radio" id="regRoleEditor" name="reg_role" value="editor">
                            <div class="reg-role-head">
                                <span class="reg-role-title"><?php echo htmlspecialchars(t('common.role.editor')); ?></span>
                                <span class="reg-role-check" aria-hidden="true"></span>
                            </div>
                            <div class="reg-role-desc"><?php echo htmlspecialchars(t('auth.role_editor_desc')); ?></div>
                        </label>
                    </div>
                </div>
                <div class="m-form-group">
                    <label class="m-label" for="regDepartment"><?php echo htmlspecialchars(t('auth.department')); ?> <span class="opt-tag"><?php echo htmlspecialchars(t('common.optional')); ?></span></label>
                    <input type="text" id="regDepartment" class="m-input" placeholder="<?php echo htmlspecialchars(t('auth.department_example')); ?>" maxlength="30">
                </div>
                <div id="regError" class="m-error" style="display:none;margin-bottom:12px;"></div>
                <div id="regSuccess" class="m-alert m-alert-success" style="display:none;"></div>
                <button type="submit" id="btnRegSubmit" class="btn-primary btn-block" style="margin-top:4px;"><?php echo htmlspecialchars(t('auth.submit_apply')); ?></button>
                <div style="text-align:center;margin-top:12px;">
                    <a href="javascript:void(0)" onclick="toggleLoginRegPane('login')" style="font-size:12.5px;color:var(--text-3);text-decoration:none;"><?php echo htmlspecialchars(t('auth.has_account_back')); ?></a>
                </div>
            </form>
        </div>
    </div>
</div>

<script>
    function togglePasswordVisibility(inputId, btnEl) {
        var input = document.getElementById(inputId);
        if (!input) return;
        var isPwd = input.type === 'password';
        input.type = isPwd ? 'text' : 'password';
        var icon = btnEl ? btnEl.querySelector('i') : null;
        if (icon) {
            icon.className = isPwd ? 'ri-eye-off-line' : 'ri-eye-line';
        }
    }

    function handleEmailInputWithDomain(input, badgeId) {
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
            input.style.paddingRight = (fixedDomain.length * 8 + 34) + 'px';
        }
    }

    function getResolvedEmail(inputId) {
        var input = document.getElementById(inputId);
        if (!input) return '';
        var val = input.value.trim();
        var fixedDomain = input.getAttribute('data-fixed-domain') || '';
        if (fixedDomain && val && val.indexOf('@') === -1) {
            return val + '@' + fixedDomain;
        }
        return val;
    }

    function isModalMailResetEnabled() {
        if (typeof window.SYS_MAIL_RESET_ENABLED === 'boolean') {
            return window.SYS_MAIL_RESET_ENABLED;
        }
        return <?php echo $mailResetEnabled ? 'true' : 'false'; ?>;
    }

    function toggleLoginRegPane(target) {
        var paneLogin = document.getElementById('paneDoLogin');
        var paneReg = document.getElementById('paneDoRegister');
        var paneForgot = document.getElementById('paneForgotPassword');
        var titleEl = document.getElementById('loginModalTitle');
        var errLogin = document.getElementById('loginError');
        var errReg = document.getElementById('regError');
        var errForgot = document.getElementById('modalForgotError');
        var succReg = document.getElementById('regSuccess');
        var succForgot = document.getElementById('modalForgotSuccess');
        if (errLogin) errLogin.style.display = 'none';
        if (errReg) errReg.style.display = 'none';
        if (errForgot) errForgot.style.display = 'none';
        if (succReg) succReg.style.display = 'none';
        if (succForgot) succForgot.style.display = 'none';
        if (typeof clearPasswordStrength === 'function' && paneReg) clearPasswordStrength(paneReg);

        var regEnabled = <?php echo $visitorRegEnabled ? 'true' : 'false'; ?>;
        if (target === 'reg' && !regEnabled) {
            target = 'login';
        }

        if (paneLogin) paneLogin.style.display = (target === 'login' || !target) ? 'block' : 'none';
        if (paneReg) paneReg.style.display = (target === 'reg') ? 'block' : 'none';
        if (paneForgot) paneForgot.style.display = (target === 'forgot') ? 'block' : 'none';

        if (target === 'reg') {
            titleEl.textContent = t('auth.register_title', null, '申请加入协作');
            var succLogin = document.getElementById('loginSuccessNotice');
            if (succLogin) succLogin.style.display = 'none';
            var u = document.getElementById('regEmail');
            if (u) {
                u.focus();
                handleEmailInputWithDomain(u, 'regDomainBadge');
            }
        } else if (target === 'forgot') {
            titleEl.textContent = t('auth.forgot_title', null, '找回密码');
            var succLogin2 = document.getElementById('loginSuccessNotice');
            if (succLogin2) succLogin2.style.display = 'none';
            var mailEnabled = isModalMailResetEnabled();
            var mailBox = document.getElementById('modalForgotMailBox');
            var disBox = document.getElementById('modalForgotDisabledBox');
            var backWrap = document.getElementById('modalForgotBackWrap');
            if (mailBox) mailBox.style.display = mailEnabled ? 'block' : 'none';
            if (disBox) disBox.style.display = mailEnabled ? 'none' : 'block';
            if (backWrap) backWrap.style.display = mailEnabled ? 'block' : 'none';
            if (mailEnabled) {
                var fEmail = document.getElementById('modalForgotEmail');
                var lEmail = document.getElementById('loginEmail');
                if (fEmail) {
                    if (!fEmail.value && lEmail && lEmail.value.trim()) {
                        fEmail.value = lEmail.value.trim();
                    }
                    fEmail.focus();
                    handleEmailInputWithDomain(fEmail, 'modalForgotDomainBadge');
                }
            }
        } else {
            titleEl.textContent = t('auth.login_title', null, '账号登录');
            var u2 = document.getElementById('loginEmail');
            if (u2) {
                u2.focus();
                handleEmailInputWithDomain(u2, 'loginDomainBadge');
            }
        }
    }

    function handleDoLogin(e) {
        e.preventDefault();
        var emailInput = document.getElementById('loginEmail');
        var email = getResolvedEmail('loginEmail');
        var p = document.getElementById('loginPassword').value;
        var rem = document.getElementById('loginRememberMe');
        var isRemember = rem ? rem.checked : true;
        var err = document.getElementById('loginError');
        var btn = document.getElementById('btnLoginSubmit');
        var succLogin = document.getElementById('loginSuccessNotice');

        var fixedDomain = emailInput ? (emailInput.getAttribute('data-fixed-domain') || '') : '';
        if (!fixedDomain && email.indexOf('@') === -1) {
            err.innerText = t('auth.enter_full_email', null, '请输入完整工作邮箱，如 name@company.com');
            err.style.display = 'block';
            if (succLogin) succLogin.style.display = 'none';
            emailInput.focus();
            return;
        }

        btn.disabled = true;
        btn.innerText = t('auth.logging_in', null, '登录中...');
        err.style.display = 'none';

        var fd = new FormData();
        fd.append('action', 'login');
        fd.append('email', email);
        fd.append('password', p);
        fd.append('remember_me', isRemember ? '1' : '0');

        fetch('api.php', { method: 'POST', body: fd })
        .then(function(r) {
            return r.text().then(function(text) {
                try {
                    return JSON.parse(text);
                } catch(e) {
                    throw new Error(text || t('common.http_error', {status: r.status}, '服务响应异常 (HTTP ' + r.status + ')'));
                }
            });
        })
        .then(function(res) {
            if (res.success) {
                if (typeof showToast === 'function') {
                    showToast(t('auth.login_success', null, '登录成功'), 'success', 2000, true);
                }
                window.location.reload();
            } else {
                err.innerText = res.message || t('auth.invalid_credentials', null, '邮箱或密码错误');
                err.style.display = 'block';
                btn.disabled = false;
                btn.innerText = t('auth.login_btn', null, '登录');
            }
        })
        .catch(function(e) {
            err.innerText = (e && e.message) ? e.message : t('common.network_error', null, '网络异常，请重试');
            err.style.display = 'block';
            btn.disabled = false;
            btn.innerText = t('auth.login_btn', null, '登录');
        });
    }

    function handleDoRegister(e) {
        e.preventDefault();
        var emailInput = document.getElementById('regEmail');
        var rawEmailVal = emailInput ? emailInput.value.trim() : '';
        var email = getResolvedEmail('regEmail');
        var nameInput = document.getElementById('regName');
        var name = nameInput ? nameInput.value.trim() : '';
        var passwordInput = document.getElementById('regPassword');
        var p = passwordInput.value;
        var roleEl = document.querySelector('input[name="reg_role"]:checked');
        var role = roleEl ? roleEl.value : 'viewer';
        var dept = document.getElementById('regDepartment').value.trim();

        var err = document.getElementById('regError');
        var btn = document.getElementById('btnRegSubmit');

        var fixedDomain = emailInput ? (emailInput.getAttribute('data-fixed-domain') || '') : '';
        if (!rawEmailVal) {
            if (typeof setFieldError === 'function') setFieldError(emailInput, null, t('auth.enter_work_email', null, '请输入工作邮箱'));
            else { err.innerText = t('auth.enter_work_email', null, '请输入工作邮箱'); err.style.display = 'block'; if (emailInput) emailInput.focus(); }
            return;
        }
        if (!fixedDomain && email.indexOf('@') === -1) {
            if (typeof setFieldError === 'function') setFieldError(emailInput, null, t('auth.enter_full_email', null, '请输入完整工作邮箱，如 name@company.com'));
            else { err.innerText = t('auth.enter_full_email', null, '请输入完整工作邮箱，如 name@company.com'); err.style.display = 'block'; emailInput.focus(); }
            return;
        }
        if (!name) {
            if (typeof setFieldError === 'function') setFieldError(nameInput, null, t('auth.enter_real_name', null, '请输入真实姓名'));
            else { err.innerText = t('auth.enter_real_name', null, '请输入真实姓名'); err.style.display = 'block'; if (nameInput) nameInput.focus(); }
            return;
        }

        if (typeof showPasswordLengthError === 'function' && showPasswordLengthError(passwordInput)) {
            err.style.display = 'none';
            return;
        }

        btn.disabled = true;
        btn.innerText = t('common.submitting', null, '正在提交...');
        err.style.display = 'none';

        var fd = new FormData();
        fd.append('action', 'register_visitor');
        fd.append('email', email);
        fd.append('name', name);
        fd.append('password', p);
        fd.append('role', role);
        fd.append('department', dept);

        fetch('api.php', { method: 'POST', body: fd })
        .then(function(r) { return r.json(); })
        .then(function(res) {
            btn.disabled = false;
            btn.innerText = t('auth.submit_apply', null, '申请加入');
            if (res.success) {
                // 1. 重置注册表单并恢复域名徽标
                var regForm = document.getElementById('registerForm');
                if (regForm) regForm.reset();
                var regBadge = document.getElementById('regDomainBadge');
                if (regBadge && fixedDomain) {
                    regBadge.style.display = 'inline-block';
                    emailInput.style.paddingRight = (fixedDomain.length * 8 + 34) + 'px';
                }

                // 2. 平滑切回登录面板
                toggleLoginRegPane('login');

                // 3. 自动回填刚刚申请的邮箱账号到登录框
                var loginUserInput = document.getElementById('loginEmail');
                if (loginUserInput && rawEmailVal) {
                    loginUserInput.value = rawEmailVal;
                    handleEmailInputWithDomain(loginUserInput, 'loginDomainBadge');
                }

                // 4. 登录卡片顶部展示明确成功的通知条
                var succTip = document.getElementById('loginSuccessNotice');
                if (succTip) {
                    var tipSpan = succTip.querySelector('span');
                    if (tipSpan) tipSpan.innerText = res.message || t('auth.apply_submitted', null, '申请已提交，等待管理员审核后即可登录');
                    succTip.style.display = 'flex';
                }

                // 5. 光标自动聚焦至密码框，方便用户记住未来登录位置
                var pwdInput = document.getElementById('loginPassword');
                if (pwdInput) {
                    pwdInput.focus();
                }
            } else {
                err.innerText = res.message || t('auth.apply_failed', null, '提交申请失败');
                err.style.display = 'block';
            }
        })
        .catch(function() {
            btn.disabled = false;
            btn.innerText = t('auth.submit_apply', null, '申请加入');
            err.innerText = t('common.network_error', null, '网络连接异常，请重试');
            err.style.display = 'block';
        });
    }

    function handleDoForgotPassword(e) {
        e.preventDefault();
        var emailInput = document.getElementById('modalForgotEmail');
        var email = getResolvedEmail('modalForgotEmail');
        var err = document.getElementById('modalForgotError');
        var succ = document.getElementById('modalForgotSuccess');
        var btn = document.getElementById('btnModalForgotSubmit');
        if (!emailInput || !btn || !err) return;

        var fixedDomain = emailInput.getAttribute('data-fixed-domain') || '';
        if (!fixedDomain && email.indexOf('@') === -1) {
            err.innerText = t('auth.enter_full_email', null, '请输入完整工作邮箱，如 name@company.com');
            err.style.display = 'block';
            emailInput.focus();
            return;
        }

        btn.disabled = true;
        btn.innerText = t('common.sending', null, '发送中...');
        err.style.display = 'none';
        if (succ) succ.style.display = 'none';

        var fd = new FormData();
        fd.append('email', email);

        apiFetch('request_password_reset', fd, false)
        .then(function(res) {
            btn.disabled = false;
            btn.innerText = t('auth.send_reset_mail', null, '发送重置邮件');
            if (res.success) {
                if (succ) {
                    var tipSpan = succ.querySelector('span');
                    if (tipSpan) tipSpan.innerText = res.message || t('auth.reset_sent_tip', null, '如果该邮箱已注册且状态正常，你将收到密码重置邮件');
                    succ.style.display = 'flex';
                }
            } else {
                err.innerText = res.message || t('auth.send_failed', null, '发送失败，请重试');
                err.style.display = 'block';
            }
        })
        .catch(function() {
            btn.disabled = false;
            btn.innerText = t('auth.send_reset_mail', null, '发送重置邮件');
            err.innerText = t('common.network_error', null, '网络连接异常，请重试');
            err.style.display = 'block';
        });
    }
</script>
