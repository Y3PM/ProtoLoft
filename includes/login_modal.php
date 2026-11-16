<?php
$visitorRegEnabled = (Auth::getSetting('visitor_register_enabled', '1') !== '0');
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
            <div style="font-size:15px;font-weight:600;color:var(--text-1);" id="loginModalTitle">账号登录</div>
            <button type="button" onclick="closeLoginModal()" class="close-x" title="关闭"><i class="ri-close-line"></i></button>
        </div>

        <!-- 1. 登录面板 -->
        <div id="paneDoLogin">
            <form id="loginForm" onsubmit="handleDoLogin(event)" autocomplete="on">
                <div id="loginSuccessNotice" class="m-alert m-alert-success" style="display:none;margin-bottom:14px;align-items:center;gap:6px;">
                    <i class="ri-checkbox-circle-fill" style="font-size:15px;color:#10b981;flex-shrink:0;"></i>
                    <span></span>
                </div>
                <div class="m-form-group">
                    <label class="m-label" for="loginEmail">工作邮箱</label>
                    <div style="position:relative;display:flex;align-items:center;">
                        <input type="text" id="loginEmail" name="username" class="m-input" data-fixed-domain="<?php echo htmlspecialchars($fixedEmailDomain); ?>" placeholder="<?php echo $fixedEmailDomain ? '输入邮箱名' : '输入工作邮箱'; ?>" autocomplete="username" required autofocus maxlength="100" style="flex:1;<?php echo $fixedEmailDomain ? ('padding-right:' . (mb_strlen($fixedEmailDomain)*8 + 34) . 'px;') : ''; ?>" oninput="handleEmailInputWithDomain(this, 'loginDomainBadge')">
                        <?php if ($fixedEmailDomain): ?>
                            <span id="loginDomainBadge" class="email-fixed-badge" style="position:absolute;right:8px;font-size:12px;color:var(--text-3);background:var(--bg-tag, #f1f5f9);border:1px solid var(--border-light, #e2e8f0);padding:2px 7px;border-radius:4px;pointer-events:none;user-select:none;">@<?php echo htmlspecialchars($fixedEmailDomain); ?></span>
                        <?php endif; ?>
                    </div>
                </div>
                <div class="m-form-group">
                    <label class="m-label" for="loginPassword">密码</label>
                    <div style="position:relative;display:flex;align-items:center;">
                        <input type="password" id="loginPassword" name="password" class="m-input" placeholder="输入密码" autocomplete="current-password" required maxlength="64" style="flex:1;padding-right:36px;">
                        <button type="button" class="btn-eye-toggle" onclick="togglePasswordVisibility('loginPassword', this)" style="position:absolute;right:8px;background:none;border:none;color:var(--text-3);cursor:pointer;padding:4px 6px;font-size:15px;display:flex;align-items:center;" title="显示/隐藏密码">
                            <i class="ri-eye-line"></i>
                        </button>
                    </div>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin:10px 0 14px;">
                    <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--text-2);cursor:pointer;user-select:none;">
                        <input type="checkbox" id="loginRememberMe" name="remember_me" value="1" checked style="cursor:pointer;accent-color:var(--primary);width:14px;height:14px;">
                        <span>记住登录 (30天)</span>
                    </label>
                    <?php if ($visitorRegEnabled): ?>
                        <a href="javascript:void(0)" onclick="toggleLoginRegPane('reg')" id="linkToRegister" style="font-size:12.5px;color:var(--primary);text-decoration:none;">申请加入协作</a>
                    <?php endif; ?>
                </div>
                <div id="loginError" class="m-error" style="display:none;margin-bottom:12px;"></div>
                <button type="submit" id="btnLoginSubmit" class="btn-primary btn-block" style="margin-top:4px;">登录</button>
            </form>
        </div>

        <!-- 2. 访客申请注册面板 (极致收敛为 3+1 项) -->
        <div id="paneDoRegister" style="display:none;">
            <form id="registerForm" onsubmit="handleDoRegister(event)">
                <div class="m-form-group">
                    <label class="m-label" for="regEmail">工作邮箱 <span class="req-star">*</span></label>
                    <div style="position:relative;display:flex;align-items:center;">
                        <input type="text" id="regEmail" class="m-input" data-fixed-domain="<?php echo htmlspecialchars($fixedEmailDomain); ?>" placeholder="<?php echo $fixedEmailDomain ? '输入邮箱名' : '例如：admin@company.com'; ?>" autocomplete="email" required maxlength="100" style="flex:1;<?php echo $fixedEmailDomain ? ('padding-right:' . (mb_strlen($fixedEmailDomain)*8 + 34) . 'px;') : ''; ?>" oninput="handleEmailInputWithDomain(this, 'regDomainBadge')">
                        <?php if ($fixedEmailDomain): ?>
                            <span id="regDomainBadge" class="email-fixed-badge" style="position:absolute;right:8px;font-size:12px;color:var(--text-3);background:var(--bg-tag, #f1f5f9);border:1px solid var(--border-light, #e2e8f0);padding:2px 7px;border-radius:4px;pointer-events:none;user-select:none;">@<?php echo htmlspecialchars($fixedEmailDomain); ?></span>
                        <?php endif; ?>
                    </div>
                    <?php if ($fixedEmailDomain): ?>
                        <div style="font-size:11px;color:var(--text-3);margin-top:4px;">可输入邮箱名或完整工作邮箱</div>
                    <?php endif; ?>
                </div>
                <div class="m-form-group">
                    <label class="m-label" for="regName">真实姓名 <span class="req-star">*</span></label>
                    <input type="text" id="regName" class="m-input" placeholder="例如：李明" required maxlength="20">
                </div>
                <div class="m-form-group">
                    <label class="m-label" for="regPassword">登录密码 <span class="req-star">*</span></label>
                    <div style="position:relative;display:flex;align-items:center;">
                        <input type="password" id="regPassword" class="m-input" placeholder="至少 6 位密码" autocomplete="new-password" required maxlength="64" style="flex:1;padding-right:36px;">
                        <button type="button" class="btn-eye-toggle" onclick="togglePasswordVisibility('regPassword', this)" style="position:absolute;right:8px;background:none;border:none;color:var(--text-3);cursor:pointer;padding:4px 6px;font-size:15px;display:flex;align-items:center;" title="显示/隐藏密码">
                            <i class="ri-eye-line"></i>
                        </button>
                    </div>
                </div>
                <div class="m-form-group">
                    <div class="m-label">申请角色 <span class="req-star">*</span></div>
                    <div class="reg-role-grid">
                        <label class="reg-role-card" for="regRoleViewer">
                            <input type="radio" id="regRoleViewer" name="reg_role" value="viewer" checked>
                            <div class="reg-role-head">
                                <span class="reg-role-title">审阅人</span>
                                <span class="reg-role-check" aria-hidden="true"></span>
                            </div>
                            <div class="reg-role-desc">查看与批注 · 研发/测试</div>
                        </label>
                        <label class="reg-role-card" for="regRoleEditor">
                            <input type="radio" id="regRoleEditor" name="reg_role" value="editor">
                            <div class="reg-role-head">
                                <span class="reg-role-title">协作者</span>
                                <span class="reg-role-check" aria-hidden="true"></span>
                            </div>
                            <div class="reg-role-desc">上传与管理 · 产品/交互</div>
                        </label>
                    </div>
                </div>
                <div class="m-form-group">
                    <label class="m-label" for="regDepartment">部门或职务 <span class="opt-tag">选填</span></label>
                    <input type="text" id="regDepartment" class="m-input" placeholder="例如：研发部 · 前端开发" maxlength="30">
                </div>
                <div id="regError" class="m-error" style="display:none;margin-bottom:12px;"></div>
                <div id="regSuccess" class="m-alert m-alert-success" style="display:none;"></div>
                <button type="submit" id="btnRegSubmit" class="btn-primary btn-block" style="margin-top:4px;">申请加入</button>
                <div style="text-align:center;margin-top:12px;">
                    <a href="javascript:void(0)" onclick="toggleLoginRegPane('login')" style="font-size:12.5px;color:var(--text-3);text-decoration:none;">已有账号？返回登录</a>
                </div>
            </form>
        </div>
    </div>
</div>

<script>
    function openLoginModal(pane) {
        openModal('loginModal');
        var succLogin = document.getElementById('loginSuccessNotice');
        if (succLogin) succLogin.style.display = 'none';
        toggleLoginRegPane(pane || 'login');
    }
    function closeLoginModal() {
        closeModal('loginModal');
    }

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

    function toggleLoginRegPane(target) {
        var paneLogin = document.getElementById('paneDoLogin');
        var paneReg = document.getElementById('paneDoRegister');
        var titleEl = document.getElementById('loginModalTitle');
        var errLogin = document.getElementById('loginError');
        var errReg = document.getElementById('regError');
        var succReg = document.getElementById('regSuccess');
        if (errLogin) errLogin.style.display = 'none';
        if (errReg) errReg.style.display = 'none';
        if (succReg) succReg.style.display = 'none';

        var regEnabled = <?php echo $visitorRegEnabled ? 'true' : 'false'; ?>;
        if (target === 'reg' && !regEnabled) {
            target = 'login';
        }

        if (target === 'reg') {
            paneLogin.style.display = 'none';
            paneReg.style.display = 'block';
            titleEl.textContent = '申请加入协作';
            var succLogin = document.getElementById('loginSuccessNotice');
            if (succLogin) succLogin.style.display = 'none';
            var u = document.getElementById('regEmail');
            if (u) {
                u.focus();
                handleEmailInputWithDomain(u, 'regDomainBadge');
            }
        } else {
            paneReg.style.display = 'none';
            paneLogin.style.display = 'block';
            titleEl.textContent = '账号登录';
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
            err.innerText = '请输入完整工作邮箱，如 name@company.com';
            err.style.display = 'block';
            if (succLogin) succLogin.style.display = 'none';
            emailInput.focus();
            return;
        }

        btn.disabled = true;
        btn.innerText = '登录中...';
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
                    throw new Error(text || ('服务响应异常 (HTTP ' + r.status + ')'));
                }
            });
        })
        .then(function(res) {
            if (res.success) {
                if (typeof showToast === 'function') {
                    showToast('登录成功', 'success', 2000, true);
                }
                window.location.reload();
            } else {
                err.innerText = res.message || '邮箱或密码错误';
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

    function handleDoRegister(e) {
        e.preventDefault();
        var emailInput = document.getElementById('regEmail');
        var rawEmailVal = emailInput ? emailInput.value.trim() : '';
        var email = getResolvedEmail('regEmail');
        var name = document.getElementById('regName').value.trim();
        var p = document.getElementById('regPassword').value;
        var roleEl = document.querySelector('input[name="reg_role"]:checked');
        var role = roleEl ? roleEl.value : 'viewer';
        var dept = document.getElementById('regDepartment').value.trim();

        var err = document.getElementById('regError');
        var btn = document.getElementById('btnRegSubmit');

        var fixedDomain = emailInput ? (emailInput.getAttribute('data-fixed-domain') || '') : '';
        if (!fixedDomain && email.indexOf('@') === -1) {
            err.innerText = '请输入完整工作邮箱，如 name@company.com';
            err.style.display = 'block';
            emailInput.focus();
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
        fd.append('department', dept);

        fetch('api.php', { method: 'POST', body: fd })
        .then(function(r) { return r.json(); })
        .then(function(res) {
            btn.disabled = false;
            btn.innerText = '申请加入';
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
                    if (tipSpan) tipSpan.innerText = res.message || '申请已提交，等待管理员审核后即可登录';
                    succTip.style.display = 'flex';
                }

                // 5. 光标自动聚焦至密码框，方便用户记住未来登录位置
                var pwdInput = document.getElementById('loginPassword');
                if (pwdInput) {
                    pwdInput.focus();
                }
            } else {
                err.innerText = res.message || '提交申请失败';
                err.style.display = 'block';
            }
        })
        .catch(function() {
            btn.disabled = false;
            btn.innerText = '申请加入';
            err.innerText = '网络连接异常，请重试';
            err.style.display = 'block';
        });
    }
</script>
