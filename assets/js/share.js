/** 全员分享视图；接口决定是否可编辑。 */
function openShareModal(itemId) {
    if (!itemId) {
        showToast('请选择项目', 'info');
        return;
    }
    itemId = parseInt(itemId, 10);
    var $modal = $('#shareManageModal');
    if (!$modal.length) return;

    fetch('api.php?action=item_get_share&id=' + itemId)
    .then(function(r) { return r.json(); })
    .then(function(res) {
        if (!res.success) {
            showToast(res.message || '加载分享设置失败', 'error');
            return;
        }
        var data = res.data;
        $modal.find('[data-share-manage]').toggle(!!data.can_manage);
        $('#btnCopyShareModal, #btnOpenSharePreview').toggle(!!data.can_copy);

        $('#shareItemId').val(data.id);
        $('#shareItemName').text(data.name || '');

        // 专属短参直链展示 (前端根据当前实际协议自动校准，优先 HTTPS)
        var shareUrl = data.direct_url || data.wechat_url || '';
        if (window.location.protocol === 'https:' && shareUrl.indexOf('http://') === 0) {
            shareUrl = 'https://' + shareUrl.substring(7);
        }
        $('#shareUrlDisplay').val(shareUrl);
        $('#btnOpenSharePreview').attr('href', shareUrl);

        // 访问密码 (留空免密)
        $('#sharePasswordInput').val(data.access_password || '').data('saved-pwd', (data.access_password || '').trim());

        // 分享开关
        var enabled = !!data.share_enabled;
        $('#shareEnabledSwitch').prop('checked', enabled);
        onShareSwitchChange(enabled);

        // 重置复制按钮文本
        $('#btnCopyShareModal').html('<i class="ri-file-copy-line"></i> 复制');

        // 渲染生效中的专属外发分享记录表
        toggleCustomSharePanel(false);
        renderActiveShareList(data.active_shares || [], data.max_custom_shares || 5, !!data.can_manage);

        openModal('shareManageModal', 'shareManageModal');
    }).catch(function() {
        showToast('网络异常，获取分享信息失败', 'error');
    });
}

var currentShareMaxLimit = 5;

// 渲染生效中的专属外发分享记录表
function renderActiveShareList(list, maxLimit, canManage) {
    if (typeof maxLimit === 'number' && maxLimit > 0) {
        currentShareMaxLimit = maxLimit;
    }
    var isManageable = (typeof canManage === 'boolean') ? canManage : true;
    var max = currentShareMaxLimit || 5;
    var len = list ? list.length : 0;
    var $container = $('#activeShareListContainer');
    var $badge = $('#activeShareBadge');

    if (!list || !list.length) {
        $badge.text('0 / ' + max + ' 条生效中').css({ 'background': 'var(--canvas)', 'color': 'var(--text-3)' });
        $container.html(
            '<div style="text-align:center;padding:20px 12px;background:var(--canvas);border:1px dashed var(--border);border-radius:8px;color:var(--text-3);font-size:12px;">' +
                '<i class="ri-share-forward-line" style="font-size:20px;display:block;margin-bottom:4px;color:var(--primary);opacity:0.6;"></i>' +
                '<div style="font-weight:500;color:var(--text-2);">暂无外发链接</div>' +
                '<div style="font-size:11px;color:var(--text-3);margin-top:2px;">随时可为外部客户或领导生成专属临时预览</div>' +
            '</div>'
        );
        return;
    }

    if (len >= max) {
        $badge.text(len + ' / ' + max + ' 条 (已满)').removeClass('badge-primary').addClass('badge-danger');
    } else {
        $badge.text(len + ' / ' + max + ' 条生效中').removeClass('badge-danger').addClass('badge-primary');
    }
    var html = '';
    for (var i = 0; i < list.length; i++) {
        var s = list[i];
        var isExpired = s.is_expired;
        var expText = '永久有效';
        if (s.expires_at) {
            expText = isExpired ? ('已到期 (' + s.expires_at.substring(0, 10) + ')') : ('截止 ' + s.expires_at.substring(0, 10));
        }
        var expBadge = isExpired
            ? '<span class="badge-tag badge-danger">' + expText + '</span>'
            : '<span class="badge-tag badge-neutral">' + expText + '</span>';

        var pwdText = s.access_password ? String(s.access_password) : '';
        var pwdBadge = '';
        if (s.has_password && pwdText) {
            pwdBadge = '<span class="badge-tag badge-primary btn-copy-share-pwd" data-copy-pwd-only="' + esc(pwdText) + '" style="cursor:pointer;user-select:all;" title="点击复制密码"><i class="ri-lock-2-line"></i> 密码: <code style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-weight:600;letter-spacing:0.5px;">' + esc(pwdText) + '</code></span>';
        } else if (s.has_password) {
            pwdBadge = '<span class="badge-tag badge-primary"><i class="ri-lock-2-line"></i> 密码保护</span>';
        } else {
            pwdBadge = '<span class="badge-tag badge-neutral">免密</span>';
        }

        var viewText = '<span style="font-size:11.5px;color:var(--text-3);display:inline-flex;align-items:center;gap:2px;"><i class="ri-eye-line"></i> ' + (s.view_count || 0) + '次访问</span>';

        var shareUrl = s.share_url || (window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/') + 'share.php?s=' + s.code);
        if (window.location.protocol === 'https:' && shareUrl.indexOf('http://') === 0) {
            shareUrl = 'https://' + shareUrl.substring(7);
        }

        html += '<div data-share-row="1" style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;transition:border-color 0.15s;">' +
            '<div style="min-width:0;flex:1;">' +
                '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;">' +
                    '<span style="font-size:13px;font-weight:600;color:var(--text-1);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(s.label) + '">' + esc(s.label) + '</span>' +
                    pwdBadge +
                    expBadge +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:10px;font-size:11.5px;color:var(--text-3);">' +
                    '<span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;color:var(--text-2);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">s=' + esc(s.code) + '</span>' +
                    viewText +
                    '<span>@' + esc(s.creator_name || '管理员') + '</span>' +
                '</div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">' +
                '<button type="button" class="btn-cancel btn-sm" data-copy-url="' + esc(shareUrl) + '" data-copy-pwd="' + esc(pwdText) + '" title="复制该专属分享链接">' +
                    '<span class="duo-icon-slot" data-duo-icon="copy"><i class="ri-file-copy-line duo-rest-icon"></i></span> 复制' +
                '</button>' +
                (isManageable ? (
                    '<button type="button" class="btn-cancel btn-sm btn-danger-sm" onclick="revokeCustomShare(\'' + esc(s.code) + '\')" title="作废吊销此专属短链">' +
                        '<span class="duo-icon-slot" data-duo-icon="trash"><i class="ri-delete-bin-line duo-rest-icon"></i></span>' +
                    '</button>'
                ) : '') +
            '</div>' +
        '</div>';
    }
    $container.html(html);
}

// 切换创建专属分享展开面板
function toggleCustomSharePanel(forceState) {
    var $panel = $('#customShareCreatePanel');
    var isShow = (typeof forceState === 'boolean') ? forceState : !$panel.is(':visible');
    if (isShow) {
        var currentLen = $('#activeShareListContainer').find('> div[data-share-row="1"]').length;
        if (currentShareMaxLimit && currentLen >= currentShareMaxLimit) {
            showToast('专属分享数量已达上限 (' + currentShareMaxLimit + ' 条)', 'warning');
            return;
        }
        $('#customShareLabelInput').val('');
        $('#customSharePwdInput').val('');
        $('#customShareExpirePreset').val('7d');
        onCustomShareExpirePresetChange('7d');
        $panel.slideDown(150, function() {
            $('#customShareLabelInput').focus();
        });
        $('#btnToggleNewCustomShare').hide();
    } else {
        $panel.slideUp(150);
        $('#btnToggleNewCustomShare').show();
    }
}

// 专属分享随机密码 (6 位安全随机，crypto.getRandomValues 驱动)
function generateSecureRandomSharePwd(length) {
    length = length || 6;
    var chars = '23456789abcdefghkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
    var values = new Uint32Array(length);
    if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(values);
    } else {
        for (var j = 0; j < length; j++) values[j] = Math.floor(Math.random() * 0xFFFFFFFF);
    }
    var pwd = '';
    for (var i = 0; i < length; i++) {
        pwd += chars.charAt(values[i] % chars.length);
    }
    return pwd;
}

function generateRandomCustomSharePwd() {
    $('#customSharePwdInput').val(generateSecureRandomSharePwd(6));
}

// 专属分享有效期限切换
function onCustomShareExpirePresetChange(val) {
    var group = document.getElementById('customShareDateGroup');
    var input = document.getElementById('customShareExpireCustomDate');
    var isCustom = val === 'custom';
    if (group) group.hidden = !isCustom;
    if (input) {
        input.required = isCustom;
        if (isCustom) input.focus();
        else input.value = '';
    }
}

// 提交创建专属链接
function submitCreateCustomShare() {
    var itemId = $('#shareItemId').val();
    if (!itemId) return;

    var label = $('#customShareLabelInput').val().trim();

    var pwd = $('#customSharePwdInput').val().trim();
    var preset = $('#customShareExpirePreset').val();
    var customDate = $('#customShareExpireCustomDate').val();
    if (preset === 'custom' && !customDate) {
        showToast('请选择截止日期', 'info');
        $('#customShareExpireCustomDate').focus();
        return;
    }

    var $btn = $('#btnSubmitCustomShare');
    $btn.prop('disabled', true).text('创建中...');

    var fd = new FormData();
    fd.append('item_id', itemId);
    fd.append('label', label);
    fd.append('access_password', pwd);
    fd.append('expire_preset', preset);
    fd.append('expires_at', customDate);

    apiFetch('share_code_create', fd).then(function(res) {
        $btn.prop('disabled', false).html('<i class="ri-check-line"></i> 创建并复制');
        if (res.success) {
            var newUrl = res.data.share_url;
            var newPwd = (res.data && res.data.access_password !== undefined) ? res.data.access_password : pwd;
            var textToCopy = newUrl;
            var toastMsg = '专属链接已创建并复制';
            if (newPwd) {
                textToCopy = '链接：' + newUrl + '\n访问密码：' + newPwd;
                toastMsg = '专属链接与访问密码已创建并复制';
            }
            copyTextToClipboard(textToCopy, function() {
                showToast(toastMsg, 'success', 2800);
            });
            toggleCustomSharePanel(false);
            renderActiveShareList(res.data.active_shares || [], res.data.max_custom_shares);
        } else {
            showToast(res.message || '创建专属链接失败', 'error');
        }
    }).catch(function() {
        $btn.prop('disabled', false).html('<i class="ri-check-line"></i> 创建并复制');
        showToast('网络异常，创建失败', 'error');
    });
}

// 作废某条专属分享链接
function revokeCustomShare(code) {
    var itemId = $('#shareItemId').val();
    showConfirm({
        title: '作废链接',
        message: '确定作废此专属分享链接？',
        confirmText: '作废',
        isDanger: true,
        onConfirm: function() {
            var fd = new FormData();
            fd.append('item_id', itemId);
            fd.append('code', code);

            apiFetch('share_code_revoke', fd).then(function(res) {
                if (res.success) {
                    showToast('链接已作废', 'success');
                    renderActiveShareList(res.data.active_shares || [], res.data.max_custom_shares);
                } else {
                    showToast(res.message || '作废失败', 'error');
                }
            }).catch(function() {
                showToast('网络异常，作废失败', 'error');
            });
        }
    });
}

// 复制指定的特定分享链接（智能组合密码）
function copySpecificShareUrl(url, pwd, btnEl) {
    if (!url) return;
    if (typeof pwd === 'object' && !btnEl) {
        btnEl = pwd;
        pwd = '';
    }
    var textToCopy = url;
    var toastMsg = '链接已复制';
    if (pwd) {
        textToCopy = '链接：' + url + '\n访问密码：' + pwd;
        toastMsg = '链接与访问密码已复制';
    }
    copyTextToClipboard(textToCopy, function() {
        showToast(toastMsg, 'success');
        if (btnEl) {
            var $btn = $(btnEl);
            var oldHtml = $btn.html();
            $btn.html('<i class="ri-check-line" style="color:var(--primary);"></i> 已复制');
            setTimeout(function() { $btn.html(oldHtml); }, 2000);
        }
    });
}

function doExecuteShareCopy(url, pwd) {
    var textToCopy = url;
    var toastMsg = '分享链接已复制';
    if (pwd) {
        textToCopy = '链接：' + url + '\n访问密码：' + pwd;
        toastMsg = '分享链接与访问密码已复制';
    }
    return copyTextToClipboard(textToCopy, function() {
        $('#btnCopyShareModal').html('<i class="ri-check-line" style="color:var(--primary);"></i> 已复制');
        showToast(toastMsg, 'success');
        setTimeout(function() {
            $('#btnCopyShareModal').html('<i class="ri-file-copy-line"></i> 复制');
        }, 2000);
    });
}

function copyFromShareModal() {
    var input = document.getElementById('shareUrlDisplay');
    if (!input || !input.value) return;
    var url = input.value;
    var pwd = ($('#sharePasswordInput').val() || '').trim();
    var savedPwd = $('#sharePasswordInput').data('saved-pwd');

    // 若用户手动改了密码但尚未点击保存，自动帮其静默保存后再复制
    if (savedPwd !== undefined && pwd !== savedPwd) {
        return saveShareSettingsFromModal(false, function(ok) {
            if (ok) {
                doExecuteShareCopy(url, pwd);
            }
        });
    }
    return doExecuteShareCopy(url, pwd);
}

function generateRandomSharePwd() {
    $('#sharePasswordInput').val(generateSecureRandomSharePwd(6));
    saveShareSettingsFromModal(true);
}

function onShareSwitchChange(checked) {
    if (checked) {
        $('#shareEnabledText').text('允许访问').css('color', 'var(--success)');
    } else {
        $('#shareEnabledText').text('暂停访问').css('color', 'var(--warning)');
    }
}

function saveShareSettingsFromModal(isAutoSave, callback) {
    var itemId = $('#shareItemId').val();
    var pwd = ($('#sharePasswordInput').val() || '').trim();

    var $btn = $('#btnSaveDefaultShare, #btnSaveShareSettings');
    if (!isAutoSave) {
        $btn.prop('disabled', true).html('<i class="ri-loader-4-line ri-spin"></i> 保存中...');
    }

    var fd = new FormData();
    fd.append('id', itemId);
    fd.append('share_enabled', $('#shareEnabledSwitch').is(':checked') ? 1 : 0);
    fd.append('access_password', pwd);
    fd.append('share_expires_at', ''); // 默认公共直链彻底固化为永久有效

    return apiFetch('item_save_share', fd).then(function(res) {
        if (!isAutoSave) {
            $btn.prop('disabled', false).html('<span class="duo-icon-slot" data-duo-icon="save"><i class="ri-save-line duo-rest-icon"></i></span> 保存');
        }
        if (res.success) {
            $('#sharePasswordInput').data('saved-pwd', pwd);
            if (isAutoSave) {
                showToast('随机密码已生成并生效', 'success');
            } else {
                showToast('设置已保存', 'success');
            }
            if (typeof callback === 'function') callback(true);
        } else {
            showToast(res.message || '保存设置失败', 'error');
            if (typeof callback === 'function') callback(false);
        }
        return res;
    }).catch(function(err) {
        if (!isAutoSave) {
            $btn.prop('disabled', false).html('<span class="duo-icon-slot" data-duo-icon="save"><i class="ri-save-line duo-rest-icon"></i></span> 保存');
        }
        showToast('网络异常，保存失败', 'error');
        if (typeof callback === 'function') callback(false);
        throw err;
    });
}


$(document).on('click', '[data-copy-url]', function() {
    var url = this.getAttribute('data-copy-url');
    var pwd = this.getAttribute('data-copy-pwd') || '';
    copySpecificShareUrl(url, pwd, this);
});

$(document).on('click', '.btn-copy-share-pwd, [data-copy-pwd-only]', function(e) {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }
    var pwd = this.getAttribute('data-copy-pwd-only') || '';
    if (!pwd) return;
    copyTextToClipboard(pwd, function() {
        showToast('访问密码已复制', 'success');
    });
});
