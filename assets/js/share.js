function _tShare(key, params, fallback) {
    return (typeof t === 'function') ? t(key, params, fallback) : fallback;
}

/** 保持动态状态切换后双色悬停图标槽位完好 */
function setShareBtnIconLabel($btn, duoName, restIconClass, labelText) {
    if (!$btn || !$btn.length) return;
    $btn.html('<span class="duo-icon-slot" data-duo-icon="' + duoName + '"><i class="' + restIconClass + ' duo-rest-icon"></i></span>' + (labelText ? ' ' + labelText : ''));
    if (typeof window !== 'undefined' && window.ProtoLoftDuoIcons && typeof window.ProtoLoftDuoIcons.init === 'function') {
        window.ProtoLoftDuoIcons.init($btn[0]);
    }
}

/** 全员分享视图；接口决定是否可编辑。 */
function openShareModal(itemId) {
    if (!itemId) {
        showToast(_tShare('admin.upload.err_select_project', null, '请选择项目'), 'info');
        return;
    }
    itemId = parseInt(itemId, 10);
    var $modal = $('#shareManageModal');
    if (!$modal.length) return;

    fetch('api.php?action=item_get_share&id=' + itemId)
    .then(function(r) { return r.json(); })
    .then(function(res) {
        if (!res.success) {
            showToast(res.message || _tShare('share.load_failed', null, '加载分享设置失败'), 'error');
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

        // 重置复制按钮文本并保留双色结构
        setShareBtnIconLabel($('#btnCopyShareModal'), 'copy', 'ri-file-copy-line', _tShare('common.copy', null, '复制'));

        // 渲染生效中的专属外发分享记录表
        toggleCustomSharePanel(false);
        renderActiveShareList(data.active_shares || [], data.max_custom_shares || 5, !!data.can_manage);

        openModal('shareManageModal', 'shareManageModal');
    }).catch(function() {
        showToast(_tShare('share.fetch_failed', null, '网络异常，获取分享信息失败'), 'error');
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
        $badge.text(_tShare('share.badge_zero', {max: max}, '0 / ' + max + ' 条生效中')).css({ 'background': 'var(--canvas)', 'color': 'var(--text-3)' });
        $container.html(
            '<div style="text-align:center;padding:20px 12px;background:var(--canvas);border:1px dashed var(--border);border-radius:8px;color:var(--text-3);font-size:12px;">' +
                '<i class="ri-share-forward-line" style="font-size:20px;display:block;margin-bottom:4px;color:var(--primary);opacity:0.6;"></i>' +
                '<div style="font-weight:500;color:var(--text-2);">' + esc(_tShare('share.empty_title', null, '暂无外发链接')) + '</div>' +
                '<div style="font-size:11px;color:var(--text-3);margin-top:2px;">' + esc(_tShare('share.empty_desc', null, '随时可为外部客户或领导生成专属临时预览')) + '</div>' +
            '</div>'
        );
        return;
    }

    if (len >= max) {
        $badge.text(_tShare('share.badge_full', {len: len, max: max}, len + ' / ' + max + ' 条 (已满)')).removeClass('badge-primary').addClass('badge-danger');
    } else {
        $badge.text(_tShare('share.badge_active', {len: len, max: max}, len + ' / ' + max + ' 条生效中')).removeClass('badge-danger').addClass('badge-primary');
    }
    var html = '';
    for (var i = 0; i < list.length; i++) {
        var s = list[i];
        var isExpired = s.is_expired;
        var expText = _tShare('share.expire_forever', null, '永久有效');
        if (s.expires_at) {
            var expDate = s.expires_at.substring(0, 10);
            expText = isExpired
                ? _tShare('share.expired_at', {date: expDate}, '已到期 (' + expDate + ')')
                : _tShare('share.valid_until', {date: expDate}, '截止 ' + expDate);
        }
        var expBadge = isExpired
            ? '<span class="badge-tag badge-danger">' + esc(expText) + '</span>'
            : '<span class="badge-tag badge-neutral">' + esc(expText) + '</span>';

        var pwdText = s.access_password ? String(s.access_password) : '';
        var pwdBadge = '';
        if (s.has_password && pwdText) {
            pwdBadge = '<span class="badge-tag badge-primary btn-copy-share-pwd" data-copy-pwd-only="' + esc(pwdText) + '" style="cursor:pointer;user-select:all;" title="' + esc(_tShare('share.copy_pwd_tip', null, '点击复制密码')) + '"><i class="ri-lock-2-line"></i> ' + esc(_tShare('share.access_pwd', null, '访问密码')) + ': <code style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-weight:600;letter-spacing:0.5px;">' + esc(pwdText) + '</code></span>';
        } else if (s.has_password) {
            pwdBadge = '<span class="badge-tag badge-primary"><i class="ri-lock-2-line"></i> ' + esc(_tShare('share.pwd_protected', null, '密码保护')) + '</span>';
        } else {
            pwdBadge = '<span class="badge-tag badge-neutral">' + esc(_tShare('share.no_pwd', null, '免密')) + '</span>';
        }

        var viewText = '<span style="font-size:11.5px;color:var(--text-3);display:inline-flex;align-items:center;gap:2px;"><i class="ri-eye-line"></i> ' + esc(_tShare('share.view_count', {n: s.view_count || 0}, (s.view_count || 0) + '次访问')) + '</span>';

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
                    '<span>@' + esc(s.creator_name || _tShare('common.role.admin', null, '管理员')) + '</span>' +
                '</div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">' +
                '<button type="button" class="btn-cancel btn-sm" data-copy-url="' + esc(shareUrl) + '" data-copy-pwd="' + esc(pwdText) + '" title="' + esc(_tShare('share.copy_custom_tip', null, '复制该专属分享链接')) + '">' +
                    '<span class="duo-icon-slot" data-duo-icon="copy"><i class="ri-file-copy-line duo-rest-icon"></i></span> ' + esc(_tShare('common.copy', null, '复制')) +
                '</button>' +
                (isManageable ? (
                    '<button type="button" class="btn-cancel btn-sm btn-danger-sm" onclick="revokeCustomShare(\'' + esc(s.code) + '\')" title="' + esc(_tShare('share.revoke_custom_tip', null, '作废吊销此专属短链')) + '">' +
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
            showToast(_tShare('share.limit_reached', {max: currentShareMaxLimit}, '专属分享数量已达上限 (' + currentShareMaxLimit + ' 条)'), 'warning');
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
        showToast(_tShare('share.select_expire_date', null, '请选择截止日期'), 'info');
        $('#customShareExpireCustomDate').focus();
        return;
    }

    var $btn = $('#btnSubmitCustomShare');
    $btn.prop('disabled', true).text(_tShare('common.creating', null, '创建中...'));

    var fd = new FormData();
    fd.append('item_id', itemId);
    fd.append('label', label);
    fd.append('access_password', pwd);
    fd.append('expire_preset', preset);
    fd.append('expires_at', customDate);

    apiFetch('share_code_create', fd).then(function(res) {
        $btn.prop('disabled', false);
        setShareBtnIconLabel($btn, 'circle-check', 'ri-check-line', _tShare('share.create_and_copy', null, '创建并复制'));
        if (res.success) {
            var newUrl = res.data.share_url;
            var newPwd = (res.data && res.data.access_password !== undefined) ? res.data.access_password : pwd;
            var textToCopy = newUrl;
            var toastMsg = _tShare('share.created_and_copied', null, '专属链接已创建并复制');
            if (newPwd) {
                textToCopy = _tShare('share.copy_template_pwd', {url: newUrl, pwd: newPwd}, '链接：' + newUrl + '\n访问密码：' + newPwd);
                toastMsg = _tShare('share.created_pwd_copied', null, '专属链接与访问密码已创建并复制');
            }
            copyTextToClipboard(textToCopy, function() {
                showToast(toastMsg, 'success', 2800);
            });
            toggleCustomSharePanel(false);
            renderActiveShareList(res.data.active_shares || [], res.data.max_custom_shares);
        } else {
            showToast(res.message || _tShare('share.create_failed', null, '创建专属链接失败'), 'error');
        }
    }).catch(function() {
        $btn.prop('disabled', false);
        setShareBtnIconLabel($btn, 'circle-check', 'ri-check-line', _tShare('share.create_and_copy', null, '创建并复制'));
        showToast(_tShare('share.create_net_failed', null, '网络异常，创建失败'), 'error');
    });
}

// 作废某条专属分享链接
function revokeCustomShare(code) {
    var itemId = $('#shareItemId').val();
    showConfirm({
        title: _tShare('share.revoke_title', null, '作废链接'),
        message: _tShare('share.revoke_confirm', null, '确定作废此专属分享链接？'),
        confirmText: _tShare('share.revoke_btn', null, '作废'),
        isDanger: true,
        onConfirm: function() {
            var fd = new FormData();
            fd.append('item_id', itemId);
            fd.append('code', code);

            apiFetch('share_code_revoke', fd).then(function(res) {
                if (res.success) {
                    showToast(_tShare('share.revoked', null, '链接已作废'), 'success');
                    renderActiveShareList(res.data.active_shares || [], res.data.max_custom_shares);
                } else {
                    showToast(res.message || _tShare('share.revoke_failed', null, '作废失败'), 'error');
                }
            }).catch(function() {
                showToast(_tShare('share.revoke_net_failed', null, '网络异常，作废失败'), 'error');
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
    var _tr = (typeof t === 'function') ? t : function(k, p, f) { return f; };
    var textToCopy = url;
    var toastMsg = _tr('common.link_copied', null, '链接已复制');
    if (pwd) {
        textToCopy = _tr('share.copy_template_pwd', {url: url, pwd: pwd}, '链接：' + url + '\n访问密码：' + pwd);
        toastMsg = _tr('share.link_and_pwd_copied', null, '链接与访问密码已复制');
    }
    copyTextToClipboard(textToCopy, function() {
        showToast(toastMsg, 'success');
        if (btnEl) {
            var $btn = $(btnEl);
            var origLabel = ($btn.text() || '').replace(/\s+/g, ' ').trim();
            setShareBtnIconLabel($btn, 'circle-check', 'ri-check-line', origLabel ? _tr('common.copied', null, '已复制') : '');
            setTimeout(function() {
                setShareBtnIconLabel($btn, 'copy', 'ri-file-copy-line', origLabel);
            }, 2000);
        }
    });
}

function doExecuteShareCopy(url, pwd) {
    var _tr = (typeof t === 'function') ? t : function(k, p, f) { return f; };
    var textToCopy = url;
    var toastMsg = _tr('share.share_link_copied', null, '分享链接已复制');
    if (pwd) {
        textToCopy = _tr('share.copy_template_pwd', {url: url, pwd: pwd}, '链接：' + url + '\n访问密码：' + pwd);
        toastMsg = _tr('share.share_link_pwd_copied', null, '分享链接与访问密码已复制');
    }
    return copyTextToClipboard(textToCopy, function() {
        var $copyBtn = $('#btnCopyShareModal');
        setShareBtnIconLabel($copyBtn, 'circle-check', 'ri-check-line', _tr('common.copied', null, '已复制'));
        showToast(toastMsg, 'success');
        setTimeout(function() {
            setShareBtnIconLabel($copyBtn, 'copy', 'ri-file-copy-line', _tr('common.copy', null, '复制'));
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
        $('#shareEnabledText').text(_tShare('share.allow_access', null, '允许访问')).css('color', 'var(--success)');
    } else {
        $('#shareEnabledText').text(_tShare('share.pause_access', null, '暂停访问')).css('color', 'var(--warning)');
    }
}

function syncSidebarShareDisabledState(itemId, isDisabled) {
    if (!itemId || typeof document === 'undefined') return;
    var row = document.querySelector('.item-row[data-item-id="' + String(itemId).replace(/"/g, '') + '"]');
    if (!row) return;
    if (row.getAttribute('data-type') !== 'project') {
        isDisabled = false;
    }
    row.setAttribute('data-share-disabled', isDisabled ? '1' : '0');
    var wrap = row.querySelector('.item-name-wrap');
    if (!wrap) return;
    var existing = wrap.querySelector('.item-status-icon.is-share-off');
    if (isDisabled) {
        if (!existing) {
            var icon = document.createElement('i');
            icon.className = 'ri-forbid-line item-status-icon is-share-off';
            icon.title = _tShare('workspace.share_disabled_tip', null, '分享已停用');
            wrap.appendChild(icon);
        }
    } else if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
    }
}
if (typeof window !== 'undefined') {
    window.syncSidebarShareDisabledState = syncSidebarShareDisabledState;
}

function saveShareSettingsFromModal(isAutoSave, callback) {
    var itemId = $('#shareItemId').val();
    var pwd = ($('#sharePasswordInput').val() || '').trim();

    var $btn = $('#btnSaveDefaultShare, #btnSaveShareSettings');
    if (!isAutoSave) {
        $btn.prop('disabled', true).html('<i class="ri-loader-4-line ri-spin"></i> ' + _tShare('common.saving', null, '保存中...'));
    }

    var fd = new FormData();
    fd.append('id', itemId);
    fd.append('share_enabled', $('#shareEnabledSwitch').is(':checked') ? 1 : 0);
    fd.append('access_password', pwd);
    fd.append('share_expires_at', ''); // 默认公共直链彻底固化为永久有效

    return apiFetch('item_save_share', fd).then(function(res) {
        if (!isAutoSave) {
            $btn.prop('disabled', false).html('<span class="duo-icon-slot" data-duo-icon="save"><i class="ri-save-line duo-rest-icon"></i></span> ' + _tShare('common.save', null, '保存'));
        }
        if (res.success) {
            $('#sharePasswordInput').data('saved-pwd', pwd);
            var shareEnabled = (res.data && typeof res.data.share_enabled !== 'undefined')
                ? !!res.data.share_enabled
                : $('#shareEnabledSwitch').is(':checked');
            syncSidebarShareDisabledState(itemId, !shareEnabled);
            if (isAutoSave) {
                showToast(_tShare('share.random_pwd_saved', null, '随机密码已生成并生效'), 'success');
            } else {
                showToast(_tShare('share.settings_saved', null, '设置已保存'), 'success');
            }
            if (typeof callback === 'function') callback(true);
        } else {
            showToast(res.message || _tShare('share.save_failed', null, '保存设置失败'), 'error');
            if (typeof callback === 'function') callback(false);
        }
        return res;
    }).catch(function(err) {
        if (!isAutoSave) {
            $btn.prop('disabled', false).html('<span class="duo-icon-slot" data-duo-icon="save"><i class="ri-save-line duo-rest-icon"></i></span> ' + _tShare('common.save', null, '保存'));
        }
        showToast(_tShare('share.save_net_failed', null, '网络异常，保存失败'), 'error');
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
        showToast(_tShare('share.pwd_copied', null, '访问密码已复制'), 'success');
    });
});
