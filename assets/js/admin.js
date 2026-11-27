/**
 * 立象原型 · 管理员/协作者就地管理逻辑 (admin.js)
 * 涵盖：CSRF安全通信封装、拖拽调序、版本发布解压、分类/项目维护、存储空间管理、用户管理、品牌与全局设置
 */

// 全局控制中心变动脏标记 (退出控制中心时才集中同步，操作期间杜绝闪烁整页重载)
window.adminConsoleChanged = false;

function markAdminConsoleChanged() {
    window.adminConsoleChanged = true;
}
window.markAdminConsoleChanged = markAdminConsoleChanged;

function isAdminConsoleOpen() {
    var modal = document.getElementById('adminConsoleModal');
    if (!modal) return false;
    if (modal.classList.contains('active')) return true;
    if (modal.style.display === 'flex') return true;
    if (modal.style.display === 'none') return false;
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
        try {
            return window.getComputedStyle(modal).display !== 'none';
        } catch (e) {}
    }
    return false;
}
window.isAdminConsoleOpen = isAdminConsoleOpen;

// 严格企业邮箱域名后缀格式校验 (智能清洗前导 @ 与协议头，只要格式不合法则拦截)
window.validateEmailDomains = function(val) {
    if (!val || !val.trim()) return { valid: true, clean: '' };
    var rawList = val.replace(/，/g, ',').split(',');
    var cleanList = [];
    var domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;
    for (var i = 0; i < rawList.length; i++) {
        var item = rawList[i].trim().toLowerCase();
        if (!item) continue;
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
};

window.cleanEmailDomains = function(val) {
    var res = window.validateEmailDomains(val);
    return res.valid ? res.clean : val;
};

// 格式化字节大小 (优先复用 app.js 公共定义)
var formatBytes = (typeof window !== 'undefined' && window.formatBytes) ? window.formatBytes : function(bytes) {
    var b = parseInt(bytes, 10);
    if (!b || b <= 0) return '0 B';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
    return (b / 1073741824).toFixed(2) + ' GB';
};
if (typeof window !== 'undefined') {
    window.formatBytes = formatBytes;
}

// 触发 Tab 面板与选项卡平滑流体进场动效
var triggerTabTransition = (typeof window !== 'undefined' && window.triggerTabTransition) ? window.triggerTabTransition : function(el) {
    if (!el || el.nodeType !== 1) return;
    el.classList.remove('tab-pane-fade');
    void el.offsetWidth;
    el.classList.add('tab-pane-fade');
};

// 管理请求与全员请求使用同一安全传输层。
function adminFetch(action, formData, btnEl) { return apiFetch(action, formData, btnEl); }

/* ===================== 1. 拖拽排序与快捷管理 (已全面收拢至控制台，侧栏保持纯净导航) ===================== */
function initDragAndDrop() {
    // 侧栏已卸载 HTML5 拖拽事件，杜绝点选原型时的误触漂移
}

function saveCategoriesOrder() {
    // 保留兼容函数
}

function saveItemsOrder($ul) {
    // 保留兼容函数
}

// 快速切换项目公开 / 隐藏
function toggleVisibility(itemId) {
    var fd = new FormData();
    fd.append('id', itemId);
    adminFetch('item_toggle_visibility', fd).then(function(res) {
        if (res.success) {
            showToast((typeof t === 'function' ? t('admin.item.vis_updated', null, '项目显隐状态已更新') : '项目显隐状态已更新'), 'success');
            if (isAdminConsoleOpen()) {
                markAdminConsoleChanged();
            } else {
                window.location.reload();
            }
        } else {
            showToast(res.message || (typeof t === 'function' ? t('common.op_failed', null, '操作失败') : '操作失败'), 'error');
        }
    });
}

// 切换项目外链分享启用/停用状态
function toggleShareStatus(itemId) {
    var fd = new FormData();
    fd.append('id', itemId);
    adminFetch('item_toggle_share', fd).then(function(res) {
        if (res.success) {
            showToast((typeof t === 'function' ? t('admin.item.share_updated', null, '外链分享状态已更新') : '外链分享状态已更新'), 'success');
            if (isAdminConsoleOpen()) {
                markAdminConsoleChanged();
            } else {
                window.location.reload();
            }
        } else {
            showToast(res.message || (typeof t === 'function' ? t('common.op_failed', null, '操作失败') : '操作失败'), 'error');
        }
    });
}

// 一键重置分享直链
function rotateShareToken(itemId) {
    showConfirm({
        title: (typeof t === 'function' ? t('admin.item.reset_link_title', null, '重置链接') : '重置链接'),
        message: (typeof t === 'function' ? t('admin.item.reset_link_confirm', null, '确定重置分享链接？旧链接将失效。') : '确定重置分享链接？旧链接将失效。'),
        confirmText: (typeof t === 'function' ? t('admin.item.reset_btn', null, '重置') : '重置'),
        isDanger: true,
        onConfirm: function() {
            var fd = new FormData();
            fd.append('id', itemId);
            adminFetch('item_rotate_share', fd).then(function(res) {
                if (res.success) {
                    showToast((typeof t === 'function' ? t('admin.item.link_reset_ok', null, '链接已重置') : '链接已重置'), 'success');
                    if (isAdminConsoleOpen()) {
                        markAdminConsoleChanged();
                    } else {
                        window.location.reload();
                    }
                } else {
                    showToast(res.message || (typeof t === 'function' ? t('admin.item.reset_failed', null, '重置失败') : '重置失败'), 'error');
                }
            });
        }
    });
}

/* ===================== 2. 原型版本发布与解压 (2MB切片上传) ===================== */
function handleNotifyTargetChange() {
    var itemCb = document.getElementById('notifyItemWebhook');
    var globalCb = document.getElementById('notifyGlobalWebhook');
    var anyActive = (itemCb && !itemCb.disabled && itemCb.checked) || 
                    (globalCb && !globalCb.disabled && globalCb.checked);

    var star = document.getElementById('changelogReqStar');
    var opt = document.getElementById('changelogOptTag');
    var logInput = document.getElementById('uploadChangelog');
    if (star) star.style.display = anyActive ? 'inline' : 'none';
    if (opt) opt.style.display = anyActive ? 'none' : 'inline';
    if (logInput) {
        logInput.required = anyActive;
        logInput.placeholder = (typeof t === 'function' ? t('admin.upload.changelog_placeholder', null, '本次版本的改动说明，支持换行与 Markdown（如 - 列表、**加粗**、# 标题）') : '本次版本的改动说明，支持换行与 Markdown（如 - 列表、**加粗**、# 标题）');
        if (!anyActive && logInput.classList && typeof logInput.classList.remove === 'function') {
            logInput.classList.remove('m-input-error');
        }
    }
}

function toggleUploadNotify(checked) {
    if (typeof handleNotifyTargetChange === 'function' && (document.getElementById('notifyItemWebhook') || document.getElementById('notifyGlobalWebhook'))) {
        handleNotifyTargetChange();
        return;
    }
    var star = document.getElementById('changelogReqStar');
    var opt = document.getElementById('changelogOptTag');
    var logInput = document.getElementById('uploadChangelog');
    if (star) star.style.display = checked ? 'inline' : 'none';
    if (opt) opt.style.display = checked ? 'none' : 'inline';
    if (logInput) {
        logInput.required = checked;
        logInput.placeholder = (typeof t === 'function' ? t('admin.upload.changelog_placeholder', null, '本次版本的改动说明，支持换行与 Markdown（如 - 列表、**加粗**、# 标题）') : '本次版本的改动说明，支持换行与 Markdown（如 - 列表、**加粗**、# 标题）');
        if (!checked && logInput.classList && typeof logInput.classList.remove === 'function') {
            logInput.classList.remove('m-input-error');
        }
    }
}

function updateUploadNotifyState(itemId, isInitial) {
    var isInit = (isInitial === true);
    var itemCard = document.getElementById('uploadNotifyItemCard');
    var itemCb = document.getElementById('notifyItemWebhook');
    var itemLabel = document.getElementById('uploadNotifyItemSwitchLabel');
    var itemStatus = document.getElementById('uploadNotifyItemStatus');

    var globalCard = document.getElementById('uploadNotifyGlobalCard');
    var globalCb = document.getElementById('notifyGlobalWebhook');
    var globalLabel = document.getElementById('uploadNotifyGlobalSwitchLabel');
    var globalStatus = document.getElementById('uploadNotifyGlobalStatus');

    if (!itemCard || !globalCard) return;

    // 1. 判断项目群 Webhook 配置
    var hasItem = false;
    var $sel = $('#uploadItemSelect');
    if ($sel.length) {
        var opt = $sel.find('option:selected');
        if (opt.length && opt.attr('data-has-webhook') === '1') {
            hasItem = true;
        }
    }

    if (hasItem) {
        itemCard.classList.remove('is-disabled');
        itemCard.title = (typeof t === 'function' ? t('admin.upload.notify_item_on_tip', null, '通知当前项目配置的群机器人') : '通知当前项目配置的群机器人');
        if (itemCb) {
            var wasDisabled = itemCb.disabled;
            itemCb.disabled = false;
            // 首次打开弹窗或由未配置状态恢复可用时，默认开启；切换项目若原已可用则保留用户手动设置
            if (isInit || wasDisabled) {
                itemCb.checked = true;
            }
        }
        if (itemLabel) itemLabel.classList.remove('disabled');
        if (itemStatus) {
            itemStatus.textContent = (typeof t === 'function' ? t('common.configured', null, '已配置') : '已配置');
        }
    } else {
        itemCard.classList.add('is-disabled');
        itemCard.title = (typeof t === 'function' ? t('admin.upload.notify_item_off_tip', null, '当前项目未配置 Webhook 机器人，可在编辑项目属性中配置') : '当前项目未配置 Webhook 机器人，可在编辑项目属性中配置');
        if (itemCb) {
            itemCb.disabled = true;
            itemCb.checked = false;
        }
        if (itemLabel) itemLabel.classList.add('disabled');
        if (itemStatus) {
            itemStatus.textContent = (typeof t === 'function' ? t('common.unconfigured', null, '未配置') : '未配置');
        }
    }

    // 2. 判断评审群 Webhook 配置 (全局通道，切换项目时不覆盖用户的取消选择)
    var hasGlobal = typeof SYS_HAS_GLOBAL_WEBHOOK !== 'undefined' && SYS_HAS_GLOBAL_WEBHOOK;
    if (hasGlobal) {
        globalCard.classList.remove('is-disabled');
        globalCard.title = (typeof t === 'function' ? t('admin.upload.notify_global_on_tip', null, '通知全站大盘配置的集中评审群') : '通知全站大盘配置的集中评审群');
        if (globalCb) {
            var wasGlobalDisabled = globalCb.disabled;
            globalCb.disabled = false;
            // 仅在首次打开弹窗或全局状态从无变有初始时设为默认开启，换项目时不覆盖用户的取消选择
            if (isInit || wasGlobalDisabled) {
                globalCb.checked = true;
            }
        }
        if (globalLabel) globalLabel.classList.remove('disabled');
        if (globalStatus) {
            globalStatus.textContent = (typeof t === 'function' ? t('common.configured', null, '已配置') : '已配置');
        }
    } else {
        globalCard.classList.add('is-disabled');
        globalCard.title = (typeof t === 'function' ? t('admin.upload.notify_global_off_tip', null, '系统控制中心未配置评审群 Webhook') : '系统控制中心未配置评审群 Webhook');
        if (globalCb) {
            globalCb.disabled = true;
            globalCb.checked = false;
        }
        if (globalLabel) globalLabel.classList.add('disabled');
        if (globalStatus) {
            globalStatus.textContent = (typeof t === 'function' ? t('common.unconfigured', null, '未配置') : '未配置');
        }
    }

    // 3. 联动日志必填状态
    handleNotifyTargetChange();
}

var versionNameCheckSequence = 0;
var UPLOAD_CHUNK_SIZE = 512 * 1024; // 512KB 原生微切片 (安全适配 Nginx 1MB client_max_body_size)
var versionUploadBusy = false;

function validateVersionName(raw) {
    if (/[\x00-\x1f\x7f-\x9f\u2028\u2029]/.test(raw)) return {error:(typeof t === 'function' ? t('admin.upload.err_ver_ctrl', null, '版本名称不能包含换行或控制字符') : '版本名称不能包含换行或控制字符')};
    var name = raw.replace(/^[ \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]+|[ \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]+$/g, '');
    if (!name) return {error:(typeof t === 'function' ? t('admin.upload.err_ver_empty', null, '请输入版本名称') : '请输入版本名称')};
    if (Array.from(name).length > 30) return {error:(typeof t === 'function' ? t('admin.upload.err_ver_len', null, '版本名称最多 30 字') : '版本名称最多 30 字')};
    return {name:name};
}

function clearUploadVersionNameHint() {
    versionNameCheckSequence++;
    var input = document.getElementById('uploadVerName');
    var hint = document.getElementById('uploadVersionHint');
    if (input) {
        if (typeof input.setCustomValidity === 'function') input.setCustomValidity('');
        if (input.classList && typeof input.classList.remove === 'function') input.classList.remove('m-input-error');
    }
    if (hint) { hint.textContent = ''; hint.hidden = true; }
}

function onUploadVersionNameInput(input) {
    if (input) {
        if (typeof input.setCustomValidity === 'function') input.setCustomValidity('');
        if (input.classList && typeof input.classList.remove === 'function') input.classList.remove('m-input-error');
    }
    clearUploadVersionNameHint();
}

function checkUploadVersionName() {
    var sequence = ++versionNameCheckSequence;
    var input = document.getElementById('uploadVerName');
    var itemId = document.getElementById('uploadItemId').value;
    var hint = document.getElementById('uploadVersionHint');
    var validation = validateVersionName(input.value);
    if (typeof input.setCustomValidity === 'function') input.setCustomValidity(validation.error || '');
    if (validation.error || !itemId) return Promise.resolve({success:false,message:validation.error || (typeof t === 'function' ? t('admin.upload.err_select_project', null, '请选择项目') : '请选择项目')});
    input.value = validation.name;
    var fd = new FormData();
    fd.append('item_id', itemId);
    fd.append('version_name', validation.name);
    return adminFetch('version_check_name', fd, false).catch(function() {
        return {success:false,message:(typeof t === 'function' ? t('admin.upload.err_check_name', null, '版本名称检查失败，请重试') : '版本名称检查失败，请重试')};
    }).then(function(res) {
        if (sequence === versionNameCheckSequence && hint && document.getElementById('uploadItemId').value === itemId && input.value === validation.name) {
            hint.textContent = res.success ? (res.data.exists ? (typeof t === 'function' ? t('admin.upload.ver_exists_hint', null, '同名版本已存在，发布时将确认替换') : '同名版本已存在，发布时将确认替换') : '') : res.message;
            hint.hidden = !hint.textContent;
        }
        return res;
    });
}

function getItemVersionsData(itemId) {
    if (!itemId) return [];
    var $adminRow = $('#admin-item-row-' + itemId);
    var $treeNode = $('#item-node-' + itemId);
    var $node = $adminRow.length ? $adminRow : $treeNode;
    var versions = $node.data('versions') || [];
    if (typeof versions === 'string') {
        try { versions = JSON.parse(versions); } catch(e) { versions = []; }
    }
    if ((!versions || !versions.length) && $treeNode.length) {
        var treeVers = $treeNode.data('versions');
        if (typeof treeVers === 'string') {
            try { treeVers = JSON.parse(treeVers); } catch(e) { treeVers = []; }
        }
        if (treeVers && treeVers.length) versions = treeVers;
    }
    return versions || [];
}

function getLatestItemVersion(itemId) {
    var versions = getItemVersionsData(itemId);
    if (!versions || !versions.length) return null;
    var latest = versions[0];
    for (var i = 1; i < versions.length; i++) {
        if ((parseInt(versions[i].id, 10) || 0) > (parseInt(latest.id, 10) || 0)) {
            latest = versions[i];
        }
    }
    return latest || null;
}

function updateUploadLastVersionHint(itemId) {
    var $hintWrap = $('#uploadLastVerHint');
    var $nameEl = $('#uploadLastVerName');
    var logBtn = document.getElementById('uploadLastLogBtn');
    var latest = getLatestItemVersion(itemId);
    if ($hintWrap.length && $nameEl.length) {
        var verName = (latest && latest.version_name) ? latest.version_name : '';
        if (verName) {
            $nameEl.text(verName).data('ver-name', verName);
            $hintWrap.show();
        } else {
            $hintWrap.hide();
            $nameEl.text('').data('ver-name', '');
        }
    }
    if (logBtn) {
        var lastLog = (latest && typeof latest.changelog === 'string') ? latest.changelog.replace(/\r\n?/g, '\n').trim() : '';
        if (lastLog) {
            logBtn.setAttribute('data-changelog', lastLog);
            logBtn.hidden = false;
        } else {
            logBtn.removeAttribute('data-changelog');
            logBtn.hidden = true;
        }
    }
}

function appendUploadLastChangelog() {
    var logBtn = document.getElementById('uploadLastLogBtn');
    var lastLog = logBtn ? (logBtn.getAttribute('data-changelog') || '') : '';
    if (!lastLog) {
        var itemEl = document.getElementById('uploadItemId');
        var latest = itemEl && itemEl.value ? getLatestItemVersion(itemEl.value) : null;
        lastLog = (latest && typeof latest.changelog === 'string') ? latest.changelog.replace(/\r\n?/g, '\n').trim() : '';
    }
    if (!lastLog) return;

    var logEl = document.getElementById('uploadChangelog');
    if (!logEl) return;
    if (logEl.classList && typeof logEl.classList.remove === 'function') {
        logEl.classList.remove('m-input-error');
    }

    var cur = typeof logEl.value === 'string' ? logEl.value : '';
    var addition = (cur === '' || cur.slice(-1) === '\n') ? lastLog : ('\n' + lastLog);
    var maxLen = parseInt((typeof logEl.getAttribute === 'function' ? logEl.getAttribute('maxlength') : '') || '3000', 10) || 3000;
    if (cur.length >= maxLen) {
        if (typeof showToast === 'function') showToast((typeof t === 'function' ? t('admin.upload.log_max_warn', {max: maxLen}, '更新日志已达 ' + maxLen + ' 字上限') : ('更新日志已达 ' + maxLen + ' 字上限')), 'warning');
        if (typeof logEl.focus === 'function') logEl.focus();
        return;
    }

    var truncated = false;
    if (cur.length + addition.length > maxLen) {
        addition = addition.slice(0, maxLen - cur.length);
        truncated = true;
    }

    if (typeof logEl.setRangeText === 'function') {
        logEl.setRangeText(addition, cur.length, cur.length, 'end');
    } else {
        logEl.value = cur + addition;
    }
    if (typeof logEl.focus === 'function') logEl.focus();
    if (typeof logEl.setSelectionRange === 'function') {
        var endPos = logEl.value.length;
        logEl.setSelectionRange(endPos, endPos);
    }
    if (typeof logEl.scrollHeight === 'number') {
        logEl.scrollTop = logEl.scrollHeight;
    }
    if (truncated && typeof showToast === 'function') {
        showToast((typeof t === 'function' ? t('admin.upload.log_appended_trunc', {max: maxLen}, '已添加上版日志（超出 ' + maxLen + ' 字部分已截断）') : ('已添加上版日志（超出 ' + maxLen + ' 字部分已截断）')), 'info');
    }
}

function applyUploadLastVerSuggestion() {
    var $nameEl = $('#uploadLastVerName');
    var verName = $nameEl.data('ver-name') || $nameEl.text();
    if (!verName) return;
    var input = document.getElementById('uploadVerName');
    if (input) {
        input.value = verName;
        onUploadVersionNameInput(input);
        input.focus();
        if (typeof input.select === 'function') input.select();
    }
}

function openUploadModal(itemId, projectName) {
    var curFlow = getQuickCreateFlow();
    if (curFlow && curFlow.advancing) {
        curFlow.advancing = false;
    } else if (typeof resetQuickCreateFlow === 'function') {
        resetQuickCreateFlow();
    }
    var $sel = $('#uploadItemSelect');
    if ($sel.length) {
        if (itemId) {
            $sel.val(itemId);
            if (!$sel.val()) {
                showToast((typeof t === 'function' ? t('admin.upload.projects_changed', null, '项目列表已变化，请关闭控制中心后重试') : '项目列表已变化，请关闭控制中心后重试'), 'warning');
                return;
            }
        } else if (typeof currentSelectedItemId !== 'undefined' && currentSelectedItemId) {
            $sel.val(currentSelectedItemId);
        }
        if (!$sel.val() && $sel.find('option').length) {
            $sel.val($sel.find('option:first').val());
        }
        itemId = $sel.val();
    }
    if (document.getElementById('uploadItemId')) {
        document.getElementById('uploadItemId').value = itemId || '';
    }
    document.getElementById('uploadVerName').value = '';
    clearUploadVersionNameHint();
    updateUploadLastVersionHint(itemId);
    if (document.getElementById('uploadChangelog')) document.getElementById('uploadChangelog').value = '';
    updateUploadNotifyState(itemId, true);
    document.getElementById('uploadZipFile').value = '';
    document.getElementById('uploadRpFile').value = '';
    clearSelectedProtoSource();
    clearSelectedRpFile();
    document.getElementById('uploadProgressWrap').style.display = 'none';
    initProtoDropZone();
    initRpDropZone();
    openModal('uploadModal', 'uploadVerName');
}

// RP 源文件管理：支持选择与拖拽
var currentRpFile = null;

function clearSelectedRpFile(e) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    currentRpFile = null;
    var rpInput = document.getElementById('uploadRpFile');
    if (rpInput) rpInput.value = '';
    var badge = document.getElementById('rpFileBadge');
    if (badge) badge.style.display = 'none';
    var actions = document.getElementById('rpDropActions');
    if (actions) actions.style.display = 'flex';
    var rn = document.getElementById('uploadRpName');
    if (rn) { rn.textContent = (typeof t === 'function' ? t('admin.upload.no_file', null, '未选择文件') : '未选择文件'); rn.classList.remove('has-file'); }
}

function handleRpSelected(input) {
    var file = input.files && input.files[0];
    if (!file) {
        clearSelectedRpFile();
        return;
    }
    if (!file.name.toLowerCase().endsWith('.rp')) {
        showToast((typeof t === 'function' ? t('ver.select_rp_file', null, '请选择 .rp 格式的源文件底稿') : '请选择 .rp 格式的源文件底稿'), 'warning');
        clearSelectedRpFile();
        return;
    }
    setRpSourceFile(file);
}

function setRpSourceFile(file) {
    currentRpFile = file;
    var badge = document.getElementById('rpFileBadge');
    var badgeText = document.getElementById('rpFileBadgeText');
    var actions = document.getElementById('rpDropActions');
    var displayText = file.name + ' (' + formatProtoBytes(file.size) + ')';
    if (badge && badgeText) {
        badgeText.textContent = displayText;
        badge.style.display = 'flex';
    }
    if (actions) actions.style.display = 'none';
    var rn = document.getElementById('uploadRpName');
    if (rn) { rn.textContent = displayText; rn.classList.add('has-file'); }
}

function initRpDropZone() {
    var zone = document.getElementById('rpDropZone');
    if (!zone || zone._boundDrop) return;
    zone._boundDrop = true;

    zone.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.add('is-dragover');
    });

    zone.addEventListener('dragleave', function(e) {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('is-dragover');
    });

    zone.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('is-dragover');

        var dt = e.dataTransfer;
        if (!dt) return;

        var file = null;
        if (dt.items && dt.items.length > 0) {
            var item = dt.items[0];
            if (item.kind === 'file') {
                file = item.getAsFile();
            }
        }
        if (!file && dt.files && dt.files.length > 0) {
            file = dt.files[0];
        }

        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.rp')) {
            showToast((typeof t === 'function' ? t('ver.drop_rp_file', null, '请拖入 .rp 格式的源文件底稿') : '请拖入 .rp 格式的源文件底稿'), 'warning');
            return;
        }

        setRpSourceFile(file);
    });
}

// 原型发布源管理：支持 ZIP 包与原型文件夹
var currentProtoSource = null;
var folderFilterSession = null;

function clearSelectedProtoSource(e) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    currentProtoSource = null;
    folderFilterSession = null;
    var zipInput = document.getElementById('uploadZipFile');
    if (zipInput) zipInput.value = '';
    var folderInput = document.getElementById('uploadFolderInput');
    if (folderInput) folderInput.value = '';
    var badge = document.getElementById('protoFileBadge');
    if (badge) badge.style.display = 'none';
    updateProtoFolderManageBtn(false);
    var actions = document.getElementById('protoDropActions');
    if (actions) actions.style.display = 'flex';
    var zn = document.getElementById('uploadZipName');
    if (zn) { zn.textContent = (typeof t === 'function' ? t('admin.upload.no_file', null, '未选择文件') : '未选择文件'); zn.classList.remove('has-file'); }
    var filterModal = document.getElementById('folderFilesModal');
    if (filterModal && filterModal.style.display !== 'none' && typeof closeModal === 'function') {
        closeModal('folderFilesModal');
    }
}

function handleZipSelected(input) {
    var file = input.files && input.files[0];
    if (!file) {
        clearSelectedProtoSource();
        return;
    }
    setProtoSourceZip(file);
}

function handleFolderSelected(input) {
    var files = input.files;
    if (!files || files.length === 0) {
        clearSelectedProtoSource();
        return;
    }
    var firstRel = files[0].webkitRelativePath || '';
    var folderName = firstRel.split('/')[0] || (typeof t === 'function' ? t('admin.upload.folder_default_name', null, '原型文件夹') : '原型文件夹');
    setProtoSourceFolder(folderName, Array.prototype.slice.call(files));
}

function formatProtoBytes(bytes) {
    if (typeof formatBytes === 'function') return formatBytes(bytes);
    if (!bytes || bytes <= 0) return '0 B';
    var k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + (sizes[i] || 'MB');
}

function setProtoSourceZip(file) {
    folderFilterSession = null;
    currentProtoSource = {
        type: 'zip',
        file: file,
        name: file.name,
        size: file.size
    };
    updateProtoFolderManageBtn(false);
    renderProtoSourceBadge('ri-file-zip-line', file.name + ' (' + formatProtoBytes(file.size) + ')');
}

function setProtoSourceFolder(folderName, filesList) {
    var validFiles = filterPrototypeFiles(filesList);
    if (validFiles.length === 0) {
        showToast((typeof t === 'function' ? t('admin.upload.folder_no_valid_files', null, '选中的文件夹内没有有效文件') : '选中的文件夹内没有有效文件'), 'warning');
        clearSelectedProtoSource();
        return;
    }
    var blockedPath = findBlockedPrototypeFile(validFiles);
    if (blockedPath) {
        showToast((typeof t === 'function' ? t('admin.upload.folder_blocked_script', {path: blockedPath}, '文件夹内包含不允许的服务端脚本文件「' + blockedPath + '」') : ('文件夹内包含不允许的服务端脚本文件「' + blockedPath + '」')), 'warning');
        clearSelectedProtoSource();
        return;
    }
    var rootPrefix = getSelectedRootPrefix(validFiles);
    var packagePrefix = computeProtoCommonPrefix(validFiles);
    var totalBytes = 0;
    for (var i = 0; i < validFiles.length; i++) {
        totalBytes += (validFiles[i].size || 0);
    }
    currentProtoSource = {
        type: 'folder',
        name: folderName,
        rootPrefix: rootPrefix,
        packagePrefix: packagePrefix,
        allFiles: validFiles,
        excludedPaths: {},
        files: validFiles.slice(),
        totalSize: totalBytes,
        size: totalBytes
    };
    folderFilterSession = null;
    refreshProtoFolderBadge();
}

function getProtoRelativePath(file, rootPrefix) {
    var path = getPrototypeFilePath(file);
    if (rootPrefix && path.indexOf(rootPrefix) === 0) {
        return path.slice(rootPrefix.length);
    }
    return path;
}

function computeProtoCommonPrefix(files) {
    if (!files || files.length === 0) return '';
    var paths = [];
    for (var i = 0; i < files.length; i++) {
        var p = getPrototypeFilePath(files[i]);
        if (p) paths.push(p);
    }
    if (paths.length === 0) return '';
    var firstParts = paths[0].split('/');
    if (firstParts.length <= 1) return '';
    var prefixParts = [];
    for (var pi = 0; pi < firstParts.length - 1; pi++) {
        var candidate = firstParts[pi];
        var allMatch = true;
        for (var fi = 1; fi < paths.length; fi++) {
            var curParts = paths[fi].split('/');
            if (curParts.length <= pi + 1 || curParts[pi] !== candidate) {
                allMatch = false;
                break;
            }
        }
        if (allMatch) {
            prefixParts.push(candidate);
        } else {
            break;
        }
    }
    return prefixParts.length > 0 ? (prefixParts.join('/') + '/') : '';
}

function updateProtoFolderManageBtn(visible, excludedCount) {
    var btn = document.getElementById('protoFolderManageBtn');
    if (!btn) return;
    btn.hidden = !visible;
    if (visible) {
        btn.innerHTML = excludedCount > 0
            ? '<i class="ri-list-check-2"></i> ' + esc(typeof t === 'function' ? t('admin.upload.filter_files_excl', {n: excludedCount}, '筛选文件 (已排除 ' + excludedCount + ')') : ('筛选文件 (已排除 ' + excludedCount + ')'))
            : '<i class="ri-list-check-2"></i> ' + esc(typeof t === 'function' ? t('admin.upload.filter_files', null, '筛选文件') : '筛选文件');
    }
}

function refreshProtoFolderBadge() {
    if (!currentProtoSource || currentProtoSource.type !== 'folder') return;
    var allFiles = currentProtoSource.allFiles || currentProtoSource.files || [];
    var excluded = currentProtoSource.excludedPaths || {};
    var selected = [];
    var selectedBytes = 0;
    for (var i = 0; i < allFiles.length; i++) {
        var f = allFiles[i];
        var rel = getProtoRelativePath(f, currentProtoSource.rootPrefix || '');
        if (!Object.prototype.hasOwnProperty.call(excluded, rel)) {
            selected.push(f);
            selectedBytes += (f.size || 0);
        }
    }
    currentProtoSource.files = selected;
    currentProtoSource.size = selectedBytes;
    var totalCount = allFiles.length;
    var selectedCount = selected.length;
    var excludedCount = totalCount - selectedCount;
    var formattedSize = formatProtoBytes(selectedBytes);
    var badgeText = excludedCount > 0
        ? (typeof t === 'function' ? t('admin.upload.folder_summary_selected', {name: currentProtoSource.name, selected: selectedCount, total: totalCount, size: formattedSize}, '文件夹: ' + currentProtoSource.name + ' (已选 ' + selectedCount + ' / ' + totalCount + ' 个文件，' + formattedSize + ')') : ('文件夹: ' + currentProtoSource.name + ' (已选 ' + selectedCount + ' / ' + totalCount + ' 个文件，' + formattedSize + ')'))
        : (typeof t === 'function' ? t('admin.upload.folder_summary_all', {name: currentProtoSource.name, total: totalCount, size: formattedSize}, '文件夹: ' + currentProtoSource.name + ' (' + totalCount + ' 个文件，' + formattedSize + ')') : ('文件夹: ' + currentProtoSource.name + ' (' + totalCount + ' 个文件，' + formattedSize + ')'));
    updateProtoFolderManageBtn(true, excludedCount);
    renderProtoSourceBadge('ri-folder-upload-line', badgeText);
}

function renderProtoSourceBadge(iconClass, text) {
    var badge = document.getElementById('protoFileBadge');
    var badgeIcon = document.getElementById('protoFileBadgeIcon');
    var badgeText = document.getElementById('protoFileBadgeText');
    var actions = document.getElementById('protoDropActions');
    if (badge && badgeText) {
        if (badgeIcon) badgeIcon.className = iconClass;
        badgeText.textContent = text;
        badge.style.display = 'flex';
    }
    if (actions) actions.style.display = 'none';
    var zn = document.getElementById('uploadZipName');
    if (zn) { zn.textContent = text; zn.classList.add('has-file'); }
}

var PROTO_BLOCKED_EXTENSIONS = {
    php: true, phtml: true, php3: true, php4: true, php5: true, php7: true, php8: true, pht: true, phar: true,
    cgi: true, pl: true, py: true, sh: true, asp: true, aspx: true, jsp: true, jspx: true, shtml: true,
    htaccess: true, htpasswd: true, ini: true
};

function getPrototypeFilePath(file) {
    return String((file && (file.webkitRelativePath || file.relativePath || file.name)) || '')
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '');
}

// 仅剥离浏览器附带的单层所选根目录（如 .selected-root/），保留其内部隐藏目录以供安全过滤
function getSelectedRootPrefix(files) {
    var rootName = null;
    for (var i = 0; i < files.length; i++) {
        var path = getPrototypeFilePath(files[i]);
        if (!path) continue;
        var parts = path.split('/');
        if (parts.length < 2 || !parts[0]) return '';
        if (rootName === null) rootName = parts[0];
        else if (parts[0] !== rootName) return '';
    }
    return rootName ? (rootName + '/') : '';
}

function findBlockedPrototypeFile(files) {
    var rootPrefix = getSelectedRootPrefix(files);
    for (var i = 0; i < files.length; i++) {
        var path = getPrototypeFilePath(files[i]);
        var relPath = (rootPrefix && path.indexOf(rootPrefix) === 0) ? path.slice(rootPrefix.length) : path;
        var fileName = relPath.split('/').pop() || '';
        var dotIdx = fileName.lastIndexOf('.');
        if (dotIdx > 0 && dotIdx < fileName.length - 1) {
            var ext = fileName.slice(dotIdx + 1).toLowerCase();
            if (Object.prototype.hasOwnProperty.call(PROTO_BLOCKED_EXTENSIONS, ext)) {
                return relPath;
            }
        }
    }
    return '';
}

function filterPrototypeFiles(files) {
    var rootPrefix = getSelectedRootPrefix(files);
    var res = [];
    for (var i = 0; i < files.length; i++) {
        var f = files[i];
        var path = getPrototypeFilePath(f);
        if (!path) continue;
        var relPath = (rootPrefix && path.indexOf(rootPrefix) === 0) ? path.slice(rootPrefix.length) : path;
        if (!relPath) continue;
        var parts = relPath.split('/');
        var hasJunk = false;
        for (var j = 0; j < parts.length; j++) {
            var p = parts[j];
            if (!p || p === '__MACOSX' || p === 'Thumbs.db' || p === 'desktop.ini' || p.indexOf('.') === 0) {
                hasJunk = true;
                break;
            }
        }
        if (hasJunk) continue;
        res.push(f);
    }
    return res;
}

function initProtoDropZone() {
    var zone = document.getElementById('protoDropZone');
    if (!zone || zone._boundDrop) return;
    zone._boundDrop = true;

    zone.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.add('is-dragover');
    });

    zone.addEventListener('dragleave', function(e) {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('is-dragover');
    });

    zone.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('is-dragover');

        var dt = e.dataTransfer;
        if (!dt) return;

        if (dt.items && dt.items.length > 0) {
            var item = dt.items[0];
            var entry = (typeof item.webkitGetAsEntry === 'function') ? item.webkitGetAsEntry() : null;
            if (entry && entry.isDirectory) {
                readFileSystemEntry(entry).then(function(files) {
                    if (!files || files.length === 0) {
                        showToast((typeof t === 'function' ? t('admin.upload.folder_empty_unreadable', null, '文件夹为空或无法读取') : '文件夹为空或无法读取'), 'warning');
                        return;
                    }
                    setProtoSourceFolder(entry.name, files);
                }).catch(function(err) {
                    var unk = (typeof t === 'function' ? t('admin.upload.unknown_error', null, '未知错误') : '未知错误');
                    showToast((typeof t === 'function' ? t('admin.upload.folder_read_failed', { msg: err.message || unk }, '文件夹读取失败: ' + (err.message || unk)) : '文件夹读取失败: ' + (err.message || unk)), 'error');
                });
                return;
            } else if (item.kind === 'file') {
                var file = item.getAsFile();
                if (file) {
                    if (file.name.toLowerCase().endsWith('.zip')) {
                        setProtoSourceZip(file);
                    } else {
                        showToast((typeof t === 'function' ? t('admin.upload.drop_zip_or_folder', null, '请拖入 .zip 压缩包或原型文件夹') : '请拖入 .zip 压缩包或原型文件夹'), 'warning');
                    }
                    return;
                }
            }
        }

        if (dt.files && dt.files.length > 0) {
            var f = dt.files[0];
            if (f.name.toLowerCase().endsWith('.zip')) {
                setProtoSourceZip(f);
            } else {
                showToast((typeof t === 'function' ? t('admin.upload.drop_zip_or_folder', null, '请拖入 .zip 压缩包或原型文件夹') : '请拖入 .zip 压缩包或原型文件夹'), 'warning');
            }
        }
    });
}

function readFileSystemEntry(entry) {
    var files = [];
    function scanEntry(ent, path) {
        if (ent.isFile) {
            return new Promise(function(resolve) {
                ent.file(function(file) {
                    file.relativePath = (path ? path + '/' : '') + ent.name;
                    files.push(file);
                    resolve();
                }, function() { resolve(); });
            });
        } else if (ent.isDirectory) {
            return new Promise(function(resolve) {
                var dirReader = ent.createReader();
                var currentPath = (path ? path + '/' : '') + ent.name;
                function readAll() {
                    dirReader.readEntries(function(entries) {
                        if (entries.length === 0) {
                            resolve();
                        } else {
                            var pList = [];
                            for (var i = 0; i < entries.length; i++) {
                                pList.push(scanEntry(entries[i], currentPath));
                            }
                            Promise.all(pList).then(readAll);
                        }
                    }, function() { resolve(); });
                }
                readAll();
            });
        }
        return Promise.resolve();
    }
    return scanEntry(entry, '').then(function() {
        return files;
    });
}

function openFolderFilesModal() {
    if (typeof versionUploadBusy !== 'undefined' && versionUploadBusy) {
        showToast((typeof t === 'function' ? t('admin.upload.busy_no_adjust', null, '发布任务进行中，暂不可调整文件') : '发布任务进行中，暂不可调整文件'), 'warning');
        return;
    }
    if (!currentProtoSource || currentProtoSource.type !== 'folder') return;
    var rootPrefix = currentProtoSource.rootPrefix || '';
    var allFiles = currentProtoSource.allFiles || currentProtoSource.files || [];
    var tree = buildFolderFilesTree(allFiles, rootPrefix);
    var expandedMap = { '': true };
    if (tree.dirs.length === 1 && tree.files.length === 0) {
        expandedMap[tree.dirs[0].path] = true;
    }
    var draftExcluded = {};
    var prevExcluded = currentProtoSource.excludedPaths || {};
    for (var key in prevExcluded) {
        if (Object.prototype.hasOwnProperty.call(prevExcluded, key) && prevExcluded[key]) {
            draftExcluded[key] = true;
        }
    }
    folderFilterSession = {
        tree: tree,
        draftExcluded: draftExcluded,
        expandedMap: expandedMap,
        searchQuery: '',
        viewMode: 'all'
    };
    var rootBadge = document.getElementById('folderFilesRootBadge');
    if (rootBadge) rootBadge.textContent = currentProtoSource.name || (typeof t === 'function' ? t('admin.upload.folder_default_name', null, '原型文件夹') : '原型文件夹');
    var searchInput = document.getElementById('folderFilesSearchInput');
    if (searchInput) searchInput.value = '';
    var searchClear = document.getElementById('folderFilesSearchClear');
    if (searchClear) searchClear.hidden = true;
    updateFolderFilesViewModeButtons();
    renderFolderFilesTree();
    openModal('folderFilesModal', 'folderFilesSearchInput');
}

function buildFolderFilesTree(allFiles, rootPrefix) {
    var root = {
        type: 'dir',
        name: '',
        path: '',
        dirsMap: {},
        dirs: [],
        files: [],
        totalCount: 0,
        totalSize: 0
    };
    for (var i = 0; i < allFiles.length; i++) {
        var file = allFiles[i];
        var relPath = getProtoRelativePath(file, rootPrefix);
        if (!relPath) continue;
        var parts = relPath.split('/');
        var cur = root;
        for (var j = 0; j < parts.length - 1; j++) {
            var seg = parts[j];
            if (!seg) continue;
            var dirPath = cur.path ? (cur.path + '/' + seg) : seg;
            if (!Object.prototype.hasOwnProperty.call(cur.dirsMap, seg)) {
                cur.dirsMap[seg] = {
                    type: 'dir',
                    name: seg,
                    path: dirPath,
                    dirsMap: {},
                    dirs: [],
                    files: [],
                    totalCount: 0,
                    totalSize: 0
                };
                cur.dirs.push(cur.dirsMap[seg]);
            }
            cur = cur.dirsMap[seg];
        }
        cur.files.push({
            type: 'file',
            name: parts[parts.length - 1],
            relPath: relPath,
            size: file.size || 0,
            file: file
        });
    }
    function finalizeNode(node) {
        node.dirs.sort(function(a, b) {
            return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        });
        node.files.sort(function(a, b) {
            return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        });
        var count = node.files.length;
        var size = 0;
        for (var fi = 0; fi < node.files.length; fi++) {
            size += node.files[fi].size;
        }
        for (var di = 0; di < node.dirs.length; di++) {
            finalizeNode(node.dirs[di]);
            count += node.dirs[di].totalCount;
            size += node.dirs[di].totalSize;
        }
        node.totalCount = count;
        node.totalSize = size;
    }
    finalizeNode(root);
    return root;
}

function onFolderFilesSearchInput(val) {
    if (!folderFilterSession) return;
    folderFilterSession.searchQuery = String(val || '');
    var clearBtn = document.getElementById('folderFilesSearchClear');
    if (clearBtn) clearBtn.hidden = !folderFilterSession.searchQuery.trim();
    renderFolderFilesTree();
}

function clearFolderFilesSearch() {
    var input = document.getElementById('folderFilesSearchInput');
    if (input) {
        input.value = '';
        input.focus();
    }
    onFolderFilesSearchInput('');
}

function setFolderFilesViewMode(mode) {
    if (!folderFilterSession) return;
    folderFilterSession.viewMode = (mode === 'excluded') ? 'excluded' : 'all';
    updateFolderFilesViewModeButtons();
    renderFolderFilesTree();
}

function updateFolderFilesViewModeButtons() {
    if (!folderFilterSession) return;
    var allBtn = document.getElementById('folderFilesViewAllBtn');
    var exclBtn = document.getElementById('folderFilesViewExclBtn');
    if (allBtn) allBtn.classList.toggle('is-active', folderFilterSession.viewMode === 'all');
    if (exclBtn) exclBtn.classList.toggle('is-active', folderFilterSession.viewMode === 'excluded');
}

function getFolderFileIconClass(name) {
    var dot = name.lastIndexOf('.');
    var ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
    if (ext === 'html' || ext === 'htm') return 'ri-pages-line';
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'svg' || ext === 'webp' || ext === 'ico') return 'ri-image-line';
    if (ext === 'css' || ext === 'js' || ext === 'json' || ext === 'map') return 'ri-file-code-line';
    if (ext === 'woff' || ext === 'woff2' || ext === 'ttf' || ext === 'otf' || ext === 'eot') return 'ri-font-size';
    return 'ri-file-text-line';
}

function collectFolderVisibleFiles(node, queryLower, viewMode, draftExcluded, parentMatched) {
    var dirMatched = parentMatched || (queryLower && node.path && node.path.toLowerCase().indexOf(queryLower) !== -1);
    var visibleFiles = [];
    var visibleDirs = [];
    for (var i = 0; i < node.dirs.length; i++) {
        var childRes = collectFolderVisibleFiles(node.dirs[i], queryLower, viewMode, draftExcluded, dirMatched);
        if (childRes.files.length > 0) {
            visibleDirs.push(childRes);
            for (var k = 0; k < childRes.files.length; k++) {
                visibleFiles.push(childRes.files[k]);
            }
        }
    }
    var directFiles = [];
    for (var j = 0; j < node.files.length; j++) {
        var f = node.files[j];
        var isExcluded = !!draftExcluded[f.relPath];
        if (viewMode === 'excluded' && !isExcluded) continue;
        if (queryLower && !dirMatched && f.relPath.toLowerCase().indexOf(queryLower) === -1) continue;
        directFiles.push(f);
        visibleFiles.push(f);
    }
    return {
        dir: node,
        dirs: visibleDirs,
        directFiles: directFiles,
        files: visibleFiles
    };
}

function getFolderStatsForFiles(filesList, draftExcluded) {
    var selectedCount = 0;
    var selectedSize = 0;
    for (var i = 0; i < filesList.length; i++) {
        var f = filesList[i];
        if (!draftExcluded[f.relPath]) {
            selectedCount++;
            selectedSize += f.size;
        }
    }
    return {
        totalCount: filesList.length,
        selectedCount: selectedCount,
        selectedSize: selectedSize
    };
}

function toggleFolderFilesVisibleSelection(shouldSelect) {
    if (!folderFilterSession) return;
    var targets = folderFilterSession.currentVisibleFiles || [];
    for (var i = 0; i < targets.length; i++) {
        var relPath = targets[i].relPath;
        if (shouldSelect) {
            delete folderFilterSession.draftExcluded[relPath];
        } else {
            folderFilterSession.draftExcluded[relPath] = true;
        }
    }
    updateFolderTreeCheckStates();
}

function renderFolderFilesTree() {
    if (!folderFilterSession) return;
    var body = document.getElementById('folderFilesTreeBody');
    var emptyEl = document.getElementById('folderFilesEmptyState');
    if (!body || !emptyEl) return;

    var queryLower = folderFilterSession.searchQuery.trim().toLowerCase();
    var viewMode = folderFilterSession.viewMode;
    var forceExpand = !!queryLower || viewMode === 'excluded';
    var visibleTree = collectFolderVisibleFiles(folderFilterSession.tree, queryLower, viewMode, folderFilterSession.draftExcluded, false);
    folderFilterSession.currentVisibleFiles = visibleTree.files;

    var isScoped = !!queryLower || viewMode === 'excluded';
    var checkAllBtn = document.getElementById('folderFilesCheckAllBtn');
    var uncheckAllBtn = document.getElementById('folderFilesUncheckAllBtn');
    if (checkAllBtn) checkAllBtn.textContent = isScoped ? (typeof t === 'function' ? t('admin.ff.check_current', null, '全选当前') : '全选当前') : (typeof t === 'function' ? t('admin.ff.check_all', null, '全选') : '全选');
    if (uncheckAllBtn) uncheckAllBtn.textContent = isScoped ? (typeof t === 'function' ? t('admin.ff.uncheck_current', null, '取消当前') : '取消当前') : (typeof t === 'function' ? t('admin.ff.uncheck_all', null, '全不选') : '全不选');

    body.innerHTML = '';
    if (visibleTree.files.length === 0) {
        body.hidden = true;
        emptyEl.hidden = false;
        if (viewMode === 'excluded' && !queryLower) {
            emptyEl.innerHTML = '<i class="ri-checkbox-circle-line"></i><span>' + esc(typeof t === 'function' ? t('admin.ff.empty_excluded', null, '当前没有已排除的文件，所有文件均会随版本上传') : '当前没有已排除的文件，所有文件均会随版本上传') + '</span>';
        } else {
            emptyEl.innerHTML = '<i class="ri-search-eye-line"></i><span>' + esc(typeof t === 'function' ? t('admin.ff.empty_search', null, '没有找到匹配的文件') : '没有找到匹配的文件') + '</span>';
        }
        updateFolderFilesSummary();
        return;
    }

    body.hidden = false;
    emptyEl.hidden = true;
    var frag = document.createDocumentFragment();

    function appendDirChildren(visNode, depth) {
        for (var i = 0; i < visNode.dirs.length; i++) {
            var childVis = visNode.dirs[i];
            var dir = childVis.dir;
            var isExpanded = forceExpand || !!folderFilterSession.expandedMap[dir.path];
            var row = document.createElement('div');
            row.className = 'folder-tree-row is-dir';
            row.style.paddingLeft = (10 + depth * 18) + 'px';
            row.setAttribute('data-dir-path', dir.path);

            var toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'folder-tree-toggle';
            toggleBtn.setAttribute('aria-label', isExpanded ? (typeof t === 'function' ? t('admin.ff.fold_folder', null, '折叠文件夹') : '折叠文件夹') : (typeof t === 'function' ? t('admin.ff.expand_folder', null, '展开文件夹') : '展开文件夹'));
            toggleBtn.innerHTML = '<i class="' + (isExpanded ? 'ri-arrow-down-s-fill' : 'ri-arrow-right-s-fill') + '"></i>';
            if (forceExpand) {
                toggleBtn.disabled = true;
            } else {
                (function(dirPath) {
                    toggleBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        folderFilterSession.expandedMap[dirPath] = !folderFilterSession.expandedMap[dirPath];
                        renderFolderFilesTree();
                    });
                })(dir.path);
            }

            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'folder-tree-cb';
            cb.setAttribute('data-dir-cb', dir.path);
            cb._dirVisibleFiles = childVis.files;
            cb.addEventListener('click', function(e) { e.stopPropagation(); });
            cb.addEventListener('change', (function(filesInDir, checkbox) {
                return function() {
                    var check = checkbox.checked;
                    for (var fi = 0; fi < filesInDir.length; fi++) {
                        if (check) delete folderFilterSession.draftExcluded[filesInDir[fi].relPath];
                        else folderFilterSession.draftExcluded[filesInDir[fi].relPath] = true;
                    }
                    updateFolderTreeCheckStates();
                };
            })(childVis.files, cb));

            var icon = document.createElement('i');
            icon.className = 'folder-tree-icon ' + (isExpanded ? 'ri-folder-open-line' : 'ri-folder-3-line');

            var nameEl = document.createElement('span');
            nameEl.className = 'folder-tree-name';
            nameEl.textContent = dir.name;
            nameEl.title = dir.path;

            var metaEl = document.createElement('span');
            metaEl.className = 'folder-tree-meta';
            metaEl.setAttribute('data-dir-meta', dir.path);
            metaEl._dirVisibleFiles = childVis.files;

            row.appendChild(toggleBtn);
            row.appendChild(cb);
            row.appendChild(icon);
            row.appendChild(nameEl);
            row.appendChild(metaEl);

            if (!forceExpand) {
                (function(dirPath) {
                    row.addEventListener('click', function() {
                        folderFilterSession.expandedMap[dirPath] = !folderFilterSession.expandedMap[dirPath];
                        renderFolderFilesTree();
                    });
                })(dir.path);
            }

            frag.appendChild(row);
            if (isExpanded) {
                appendDirChildren(childVis, depth + 1);
            }
        }

        for (var j = 0; j < visNode.directFiles.length; j++) {
            var fileItem = visNode.directFiles[j];
            var fRow = document.createElement('div');
            fRow.className = 'folder-tree-row is-file';
            fRow.style.paddingLeft = (10 + depth * 18) + 'px';
            fRow.setAttribute('data-file-path', fileItem.relPath);

            var spacer = document.createElement('span');
            spacer.className = 'folder-tree-spacer';

            var fCb = document.createElement('input');
            fCb.type = 'checkbox';
            fCb.className = 'folder-tree-cb';
            fCb.setAttribute('data-file-cb', fileItem.relPath);
            fCb.addEventListener('click', function(e) { e.stopPropagation(); });
            fCb.addEventListener('change', (function(relPath, checkbox) {
                return function() {
                    if (checkbox.checked) delete folderFilterSession.draftExcluded[relPath];
                    else folderFilterSession.draftExcluded[relPath] = true;
                    updateFolderTreeCheckStates();
                };
            })(fileItem.relPath, fCb));

            var fIcon = document.createElement('i');
            fIcon.className = 'folder-tree-icon ' + getFolderFileIconClass(fileItem.name);

            var fName = document.createElement('span');
            fName.className = 'folder-tree-name';
            fName.textContent = fileItem.name;
            fName.title = fileItem.relPath;

            var fMeta = document.createElement('span');
            fMeta.className = 'folder-tree-meta';
            fMeta.textContent = formatProtoBytes(fileItem.size);

            fRow.appendChild(spacer);
            fRow.appendChild(fCb);
            fRow.appendChild(fIcon);
            fRow.appendChild(fName);
            fRow.appendChild(fMeta);

            (function(relPath, checkbox) {
                fRow.addEventListener('click', function() {
                    checkbox.checked = !checkbox.checked;
                    if (checkbox.checked) delete folderFilterSession.draftExcluded[relPath];
                    else folderFilterSession.draftExcluded[relPath] = true;
                    updateFolderTreeCheckStates();
                });
            })(fileItem.relPath, fCb);

            frag.appendChild(fRow);
        }
    }

    appendDirChildren(visibleTree, 0);
    body.appendChild(frag);
    updateFolderTreeCheckStates();
}

function updateFolderTreeCheckStates() {
    if (!folderFilterSession) return;
    var body = document.getElementById('folderFilesTreeBody');
    var draftExcluded = folderFilterSession.draftExcluded;
    if (body) {
        var fileRows = body.querySelectorAll('.folder-tree-row.is-file');
        for (var i = 0; i < fileRows.length; i++) {
            var row = fileRows[i];
            var relPath = row.getAttribute('data-file-path');
            var excluded = !!draftExcluded[relPath];
            row.classList.toggle('is-excluded', excluded);
            var cb = row.querySelector('input[type="checkbox"]');
            if (cb) cb.checked = !excluded;
        }
        var dirRows = body.querySelectorAll('.folder-tree-row.is-dir');
        for (var j = 0; j < dirRows.length; j++) {
            var dRow = dirRows[j];
            var dCb = dRow.querySelector('input[type="checkbox"]');
            var dMeta = dRow.querySelector('.folder-tree-meta');
            var dirFiles = (dCb && dCb._dirVisibleFiles) || [];
            var stats = getFolderStatsForFiles(dirFiles, draftExcluded);
            if (dCb) {
                dCb.checked = (stats.totalCount > 0 && stats.selectedCount === stats.totalCount);
                dCb.indeterminate = (stats.selectedCount > 0 && stats.selectedCount < stats.totalCount);
            }
            dRow.classList.toggle('is-excluded', stats.selectedCount === 0);
            if (dMeta) {
                var dirSizeStr = formatProtoBytes(stats.selectedSize);
                dMeta.textContent = stats.selectedCount === stats.totalCount
                    ? (typeof t === 'function' ? t('admin.ff.dir_stats_all', { total: stats.totalCount, size: dirSizeStr }, stats.totalCount + ' 项 · ' + dirSizeStr) : stats.totalCount + ' 项 · ' + dirSizeStr)
                    : (typeof t === 'function' ? t('admin.ff.dir_stats_part', { selected: stats.selectedCount, total: stats.totalCount, size: dirSizeStr }, stats.selectedCount + '/' + stats.totalCount + ' 项 · ' + dirSizeStr) : stats.selectedCount + '/' + stats.totalCount + ' 项 · ' + dirSizeStr);
            }
        }
    }
    updateFolderFilesSummary();
}

function getFolderDraftSummary() {
    if (!currentProtoSource || currentProtoSource.type !== 'folder' || !folderFilterSession) {
        return { totalCount: 0, selectedCount: 0, excludedCount: 0, selectedSize: 0, hasHtml: false };
    }
    var allFiles = currentProtoSource.allFiles || [];
    var rootPrefix = currentProtoSource.rootPrefix || '';
    var draftExcluded = folderFilterSession.draftExcluded;
    var selectedCount = 0;
    var selectedSize = 0;
    var hasHtml = false;
    for (var i = 0; i < allFiles.length; i++) {
        var f = allFiles[i];
        var rel = getProtoRelativePath(f, rootPrefix);
        if (!draftExcluded[rel]) {
            selectedCount++;
            selectedSize += (f.size || 0);
            if (/\.html?$/i.test(rel)) hasHtml = true;
        }
    }
    return {
        totalCount: allFiles.length,
        selectedCount: selectedCount,
        excludedCount: allFiles.length - selectedCount,
        selectedSize: selectedSize,
        hasHtml: hasHtml
    };
}

function updateFolderFilesSummary() {
    var summaryEl = document.getElementById('folderFilesSummary');
    var exclCountEl = document.getElementById('folderFilesExclCount');
    var applyBtn = document.getElementById('folderFilesApplyBtn');
    var info = getFolderDraftSummary();
    if (exclCountEl) exclCountEl.textContent = String(info.excludedCount);
    if (!summaryEl) return;
    if (info.selectedCount === 0) {
        summaryEl.classList.add('is-error');
        summaryEl.textContent = (typeof t === 'function' ? t('admin.ff.keep_one', null, '请至少保留 1 个文件') : '请至少保留 1 个文件');
        if (applyBtn) applyBtn.disabled = true;
    } else if (!info.hasHtml) {
        summaryEl.classList.add('is-error');
        summaryEl.textContent = (typeof t === 'function' ? t('admin.ff.summary_no_html', { selected: info.selectedCount }, '已选 ' + info.selectedCount + ' 个文件，但未包含 HTML 原型页面') : '已选 ' + info.selectedCount + ' 个文件，但未包含 HTML 原型页面');
        if (applyBtn) applyBtn.disabled = true;
    } else {
        summaryEl.classList.remove('is-error');
        var sumSizeStr = formatProtoBytes(info.selectedSize);
        var baseSum = (typeof t === 'function' ? t('admin.ff.summary_selected', { selected: info.selectedCount, total: info.totalCount, size: sumSizeStr }, '已选 ' + info.selectedCount + ' / ' + info.totalCount + ' 个文件 · ' + sumSizeStr) : '已选 ' + info.selectedCount + ' / ' + info.totalCount + ' 个文件 · ' + sumSizeStr);
        var exclSuffix = info.excludedCount > 0 ? (typeof t === 'function' ? t('admin.ff.summary_excluded_suffix', { n: info.excludedCount }, '（已排除 ' + info.excludedCount + ' 个）') : '（已排除 ' + info.excludedCount + ' 个）') : '';
        summaryEl.textContent = baseSum + exclSuffix;
        if (applyBtn) applyBtn.disabled = false;
    }
}

function applyFolderFilesFilter() {
    if (!currentProtoSource || currentProtoSource.type !== 'folder' || !folderFilterSession) return;
    var info = getFolderDraftSummary();
    if (info.selectedCount === 0) {
        showToast((typeof t === 'function' ? t('admin.ff.keep_one', null, '请至少保留 1 个文件') : '请至少保留 1 个文件'), 'warning');
        return;
    }
    if (!info.hasHtml) {
        showToast((typeof t === 'function' ? t('admin.ff.warn_no_html', null, '已选文件中未包含 HTML 原型页面，无法作为原型预览') : '已选文件中未包含 HTML 原型页面，无法作为原型预览'), 'warning');
        return;
    }
    var nextExcluded = {};
    for (var key in folderFilterSession.draftExcluded) {
        if (Object.prototype.hasOwnProperty.call(folderFilterSession.draftExcluded, key) && folderFilterSession.draftExcluded[key]) {
            nextExcluded[key] = true;
        }
    }
    currentProtoSource.excludedPaths = nextExcluded;
    refreshProtoFolderBadge();
    folderFilterSession = null;
    closeModal('folderFilesModal');
}

// 快速 Store 模式原生 PKZIP 组装器（含剥离公共父目录）
function createZipBlobFromFolder(files, defaultName, onProgress, fixedCommonPrefix) {
    return new Promise(function(resolve, reject) {
        if (!files || files.length === 0) {
            return reject(new Error((typeof t === 'function' ? t('admin.ff.err_folder_empty', null, '文件夹中没有有效文件') : '文件夹中没有有效文件')));
        }

        var fileList = [];
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            var p = getPrototypeFilePath(f);
            if (p) fileList.push({ file: f, path: p });
        }
        if (fileList.length === 0) {
            return reject(new Error((typeof t === 'function' ? t('admin.ff.err_folder_empty', null, '文件夹中没有有效文件') : '文件夹中没有有效文件')));
        }

        // 优先沿用原文件夹公共父目录前缀，防止取消部分文件后误剥离剩余子目录层级
        var commonPrefix = '';
        if (typeof fixedCommonPrefix === 'string') {
            commonPrefix = fixedCommonPrefix;
        } else {
            var firstPathParts = fileList[0].path.split('/');
            if (firstPathParts.length > 1) {
                var prefixParts = [];
                for (var pi = 0; pi < firstPathParts.length - 1; pi++) {
                    var candidate = firstPathParts[pi];
                    var allMatch = true;
                    for (var fi = 1; fi < fileList.length; fi++) {
                        var curParts = fileList[fi].path.split('/');
                        if (curParts.length <= pi + 1 || curParts[pi] !== candidate) {
                            allMatch = false;
                            break;
                        }
                    }
                    if (allMatch) {
                        prefixParts.push(candidate);
                    } else {
                        break;
                    }
                }
                if (prefixParts.length > 0) {
                    commonPrefix = prefixParts.join('/') + '/';
                }
            }
        }

        var hasHtml = false;
        var strippedFiles = [];
        for (var k = 0; k < fileList.length; k++) {
            var item = fileList[k];
            var newPath = item.path;
            if (commonPrefix && newPath.indexOf(commonPrefix) === 0) {
                newPath = newPath.substring(commonPrefix.length);
            }
            if (newPath) {
                if (/\.html?$/i.test(newPath)) hasHtml = true;
                strippedFiles.push({ file: item.file, path: newPath });
            }
        }

        if (strippedFiles.length === 0) {
            return reject(new Error((typeof t === 'function' ? t('admin.ff.err_no_packable', null, '未发现可打包的文件') : '未发现可打包的文件')));
        }
        if (!hasHtml) {
            return reject(new Error((typeof t === 'function' ? t('admin.ff.err_missing_html', null, '选中的文件夹内未包含 HTML 原型页面，请确认是否为导出的原型文件夹') : '选中的文件夹内未包含 HTML 原型页面，请确认是否为导出的原型文件夹')));
        }

        buildPkZipBlob(strippedFiles, onProgress).then(function(blob) {
            var zipName = (defaultName || 'prototype').replace(/\.[^/.]+$/, '') + '.zip';
            blob.name = zipName;
            resolve(blob);
        }).catch(reject);
    });
}

function buildPkZipBlob(fileItems, onProgress) {
    return new Promise(function(resolve, reject) {
        var encoder = new TextEncoder();
        var localHeaders = [];
        var centralHeaders = [];
        var offset = 0;
        var total = fileItems.length;
        var index = 0;

        function processNext() {
            if (index >= total) {
                finishZip();
                return;
            }
            var item = fileItems[index];
            var file = item.file;
            var pathBytes = encoder.encode(item.path);

            var reader = new FileReader();
            reader.onload = function(e) {
                try {
                    var arrayBuf = e.target.result;
                    var uint8 = new Uint8Array(arrayBuf);
                    var crc = computeCrc32(uint8);
                    var size = uint8.length;

                    var mtime = file.lastModified ? new Date(file.lastModified) : new Date();
                    var dosTime = ((mtime.getHours() << 11) | (mtime.getMinutes() << 5) | (mtime.getSeconds() >> 1)) & 0xFFFF;
                    var dosDate = (((mtime.getFullYear() - 1980) << 9) | ((mtime.getMonth() + 1) << 5) | mtime.getDate()) & 0xFFFF;

                    var lh = new Uint8Array(30 + pathBytes.length);
                    var lhdv = new DataView(lh.buffer);
                    lhdv.setUint32(0, 0x04034b50, true);
                    lhdv.setUint16(4, 20, true);
                    lhdv.setUint16(6, 0x0800, true);
                    lhdv.setUint16(8, 0, true);
                    lhdv.setUint16(10, dosTime, true);
                    lhdv.setUint16(12, dosDate, true);
                    lhdv.setUint32(14, crc, true);
                    lhdv.setUint32(18, size, true);
                    lhdv.setUint32(22, size, true);
                    lhdv.setUint16(26, pathBytes.length, true);
                    lhdv.setUint16(28, 0, true);
                    lh.set(pathBytes, 30);

                    localHeaders.push(lh, uint8);

                    var ch = new Uint8Array(46 + pathBytes.length);
                    var chdv = new DataView(ch.buffer);
                    chdv.setUint32(0, 0x02014b50, true);
                    chdv.setUint16(4, 20, true);
                    chdv.setUint16(6, 20, true);
                    chdv.setUint16(8, 0x0800, true);
                    chdv.setUint16(10, 0, true);
                    chdv.setUint16(12, dosTime, true);
                    chdv.setUint16(14, dosDate, true);
                    chdv.setUint32(16, crc, true);
                    chdv.setUint32(20, size, true);
                    chdv.setUint32(24, size, true);
                    chdv.setUint16(28, pathBytes.length, true);
                    chdv.setUint16(30, 0, true);
                    chdv.setUint16(32, 0, true);
                    chdv.setUint16(34, 0, true);
                    chdv.setUint16(36, 0, true);
                    chdv.setUint32(38, 0, true);
                    chdv.setUint32(42, offset, true);
                    ch.set(pathBytes, 46);

                    centralHeaders.push(ch);

                    offset += lh.length + size;
                    index++;
                    if (typeof onProgress === 'function') {
                        onProgress(index, total);
                    }
                    if (index % 12 === 0) {
                        setTimeout(processNext, 0);
                    } else {
                        processNext();
                    }
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = function() {
                reject(new Error((typeof t === 'function' ? t('admin.ff.err_read_file', { path: item.path }, '读取文件「' + item.path + '」失败') : '读取文件「' + item.path + '」失败')));
            };
            reader.readAsArrayBuffer(file);
        }

        function finishZip() {
            try {
                var centralOffset = offset;
                var centralSize = 0;
                for (var ci = 0; ci < centralHeaders.length; ci++) {
                    centralSize += centralHeaders[ci].length;
                }

                var eocd = new Uint8Array(22);
                var edv = new DataView(eocd.buffer);
                edv.setUint32(0, 0x06054b50, true);
                edv.setUint16(4, 0, true);
                edv.setUint16(6, 0, true);
                edv.setUint16(8, total, true);
                edv.setUint16(10, total, true);
                edv.setUint32(12, centralSize, true);
                edv.setUint32(16, centralOffset, true);
                edv.setUint16(20, 0, true);

                var allParts = localHeaders.concat(centralHeaders, [eocd]);
                var zipBlob = new Blob(allParts, { type: 'application/zip' });
                resolve(zipBlob);
            } catch (err) {
                reject(err);
            }
        }

        processNext();
    });
}

function computeCrc32(buf, prevCrc) {
    var crc = (prevCrc === undefined) ? 0xFFFFFFFF : (prevCrc ^ 0xFFFFFFFF);
    if (!computeCrc32.table) {
        var table = new Uint32Array(256);
        for (var i = 0; i < 256; i++) {
            var c = i;
            for (var j = 0; j < 8; j++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[i] = c;
        }
        computeCrc32.table = table;
    }
    var t = computeCrc32.table;
    for (var k = 0; k < buf.length; k++) {
        crc = t[(crc ^ buf[k]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function onUploadItemSelectChange(val) {
    if (document.getElementById('uploadItemId')) {
        document.getElementById('uploadItemId').value = val;
    }
    updateUploadNotifyState(val, false);
    updateUploadLastVersionHint(val);
    clearUploadVersionNameHint();
    if (document.getElementById('uploadVerName').value) checkUploadVersionName();
}

function handleVersionUpload(e) {
    e.preventDefault();
    if (versionUploadBusy) {
        showToast((typeof t === 'function' ? t('admin.upload.busy_wait', null, '发布任务进行中，请稍候') : '发布任务进行中，请稍候'), 'warning');
        return;
    }

    // 确定选中的原型源 (ZIP 或 文件夹)
    if (!currentProtoSource) {
        var zipInput = document.getElementById('uploadZipFile');
        if (zipInput && zipInput.files && zipInput.files[0]) {
            setProtoSourceZip(zipInput.files[0]);
        }
    }

    if (!currentProtoSource) {
        showToast((typeof t === 'function' ? t('admin.upload.pick_zip_or_folder_warn', null, '请选择 ZIP 压缩包或原型文件夹') : '请选择 ZIP 压缩包或原型文件夹'), 'warning');
        return;
    }

    var protoSourceSnapshot = currentProtoSource;

    var rpInput = document.getElementById('uploadRpFile');
    var rpFile = currentRpFile || (rpInput && rpInput.files ? rpInput.files[0] : null);

    var itemId = document.getElementById('uploadItemId').value;
    var nameInput = document.getElementById('uploadVerName');
    var validation = validateVersionName(nameInput.value);
    var verName = validation.name;
    var logEl = document.getElementById('uploadChangelog');
    var changelog = logEl ? logEl.value.trim() : '';
    var itemCb = document.getElementById('notifyItemWebhook');
    var globalCb = document.getElementById('notifyGlobalWebhook');
    var legacyNotifyEl = document.getElementById('uploadNotifyWebhook');
    var notifyItem = (itemCb && !itemCb.disabled && itemCb.checked) ? '1' : '0';
    var notifyGlobal = (globalCb && !globalCb.disabled && globalCb.checked) ? '1' : '0';
    var notifyWebhook = (notifyItem === '1' || notifyGlobal === '1' || (legacyNotifyEl && legacyNotifyEl.checked)) ? '1' : '0';

    if (typeof nameInput.setCustomValidity === 'function') {
        nameInput.setCustomValidity(validation.error || '');
    }
    if (validation.error) {
        showToast(validation.error, 'warning');
        if (nameInput.classList && typeof nameInput.classList.add === 'function') {
            nameInput.classList.add('m-input-error');
        }
        if (typeof nameInput.focus === 'function') {
            nameInput.focus();
        }
        return;
    }
    if (nameInput.classList && typeof nameInput.classList.remove === 'function') {
        nameInput.classList.remove('m-input-error');
    }
    nameInput.value = verName;

    if (notifyWebhook === '1' && !changelog) {
        showToast((typeof t === 'function' ? t('admin.upload.notify_needs_log', null, '开启群通知需填写更新日志') : '开启群通知需填写更新日志'), 'warning');
        if (logEl) {
            if (typeof logEl.focus === 'function') logEl.focus();
            if (logEl.classList && typeof logEl.classList.add === 'function') {
                logEl.classList.add('m-input-error');
            } else {
                logEl.style.borderColor = 'var(--danger)';
            }
        }
        return;
    }
    if (logEl && logEl.classList && typeof logEl.classList.remove === 'function') {
        logEl.classList.remove('m-input-error');
    }

    var defEl = document.querySelector('#uploadVersionForm [name="is_default"]');
    var isDefault = (defEl && defEl.type === 'checkbox') ? (defEl.checked ? '1' : '0') : (defEl ? defEl.value : '1');

    var btn = document.getElementById('btnUploadSubmit');
    var pWrap = document.getElementById('uploadProgressWrap');
    var pBar = document.getElementById('uploadProgressBar');
    var pText = document.getElementById('uploadProgressText');
    var pPercent = document.getElementById('uploadProgressPercent');

    versionUploadBusy = true;
    btn.disabled = true;
    var overwriteToken = '';

    var CHUNK_SIZE = UPLOAD_CHUNK_SIZE;
    var uploadedBytes = 0;

    return checkUploadVersionName().then(function(res) {
        if (!res.success) throw new Error(res.message || (typeof t === 'function' ? t('admin.upload.err_check_name', null, '版本名称检查失败，请重试') : '版本名称检查失败，请重试'));
        overwriteToken = res.data.overwrite_token || '';
        if (!res.data.exists) return true;
        return showConfirm({
            title: (typeof t === 'function' ? t('admin.upload.replace_title', null, '替换已有版本') : '替换已有版本'),
            message: (typeof t === 'function' ? t('admin.upload.replace_confirm', { name: verName }, '版本「' + verName + '」已存在，继续将替换其原型文件和更新日志。') : '版本「' + verName + '」已存在，继续将替换其原型文件和更新日志。'),
            confirmText: (typeof t === 'function' ? t('admin.upload.replace_btn', null, '确认替换') : '确认替换'),
            isDanger: true
        });
    }).then(function(confirmed) {
        if (!confirmed) return null;

        // 检查期间仍可编辑表单；变化后重新提交，避免确认对象与实际上传不一致。
        var curLegacyEl = document.getElementById('uploadNotifyWebhook');
        var curNotifyItem = (itemCb && !itemCb.disabled && itemCb.checked) ? '1' : '0';
        var curNotifyGlobal = (globalCb && !globalCb.disabled && globalCb.checked) ? '1' : '0';
        var curLegacyNotify = (curLegacyEl && curLegacyEl.checked) ? '1' : '0';
        var legacyChanged = curLegacyEl ? (curLegacyNotify !== (legacyNotifyEl && legacyNotifyEl.checked ? '1' : '0')) : false;
        if (document.getElementById('uploadItemId').value !== itemId || nameInput.value !== verName
            || currentProtoSource !== protoSourceSnapshot
            || ((currentRpFile || (rpInput && rpInput.files ? rpInput.files[0] : null)) !== rpFile)
            || (logEl ? logEl.value.trim() : '') !== changelog || curNotifyItem !== notifyItem || curNotifyGlobal !== notifyGlobal || legacyChanged) {
            throw new Error((typeof t === 'function' ? t('admin.upload.content_changed', null, '发布内容已变更，请重新提交') : '发布内容已变更，请重新提交'));
        }

        pWrap.style.display = 'block';
        pBar.style.width = '0%';
        pPercent.innerText = '0%';

        var prepareZipPromise;
        if (currentProtoSource.type === 'folder') {
            if (!currentProtoSource.files || currentProtoSource.files.length === 0) {
                throw new Error((typeof t === 'function' ? t('admin.upload.keep_one_file', null, '请至少保留 1 个文件再发布') : '请至少保留 1 个文件再发布'));
            }
            pText.innerText = (typeof t === 'function' ? t('admin.upload.packing_folder', null, '正在整理打包文件夹...') : '正在整理打包文件夹...');
            prepareZipPromise = createZipBlobFromFolder(currentProtoSource.files, currentProtoSource.name, function(curr, tot) {
                var p = Math.round((curr / tot) * 100);
                pText.innerText = (typeof t === 'function' ? t('admin.upload.packing_progress', { curr: curr, tot: tot }, '正在整理文件夹 (' + curr + '/' + tot + ')...') : '正在整理文件夹 (' + curr + '/' + tot + ')...');
                pBar.style.width = Math.min(95, Math.round(p * 0.2)) + '%';
            }, currentProtoSource.packagePrefix);
        } else {
            prepareZipPromise = Promise.resolve(currentProtoSource.file);
        }

        return prepareZipPromise.then(function(zipFile) {
            var zipUploadId = 'up_z_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
            var rpUploadId = rpFile ? ('up_r_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)) : '';
            var totalBytes = (zipFile ? zipFile.size : 0) + (rpFile ? rpFile.size : 0);

            pText.innerText = (typeof t === 'function' ? t('admin.upload.progress_uploading', null, '正在上传...') : '正在上传...');
            return uploadFileChunks(zipFile, 'zip', zipUploadId, CHUNK_SIZE, function(bytes) {
                uploadedBytes += bytes;
                var pct = Math.min(99, Math.round((uploadedBytes / totalBytes) * 100));
                pBar.style.width = pct + '%';
                pPercent.innerText = pct + '%';
            }).then(function() {
                return uploadFileChunks(rpFile, 'rp', rpUploadId, CHUNK_SIZE, function(bytes) {
                    uploadedBytes += bytes;
                    var pct = Math.min(99, Math.round((uploadedBytes / totalBytes) * 100));
                    pBar.style.width = pct + '%';
                    pPercent.innerText = pct + '%';
                });
            }).then(function() {
                pBar.style.width = '100%';
                pPercent.innerText = '100%';
                pText.innerText = (typeof t === 'function' ? t('admin.upload.progress_extracting', null, '正在解压发布...') : '正在解压发布...');

                var pubFd = new FormData();
                pubFd.append('action', 'version_publish');
                pubFd.append('item_id', itemId);
                pubFd.append('version_name', verName);
                pubFd.append('overwrite_token', overwriteToken);
                pubFd.append('changelog', changelog);
                pubFd.append('notify_webhook', notifyWebhook);
                pubFd.append('notify_item', notifyItem);
                pubFd.append('notify_global', notifyGlobal);
                pubFd.append('is_default', isDefault);
                if (zipFile) {
                    pubFd.append('zip_upload_id', zipUploadId);
                    pubFd.append('zip_file_name', zipFile.name || 'prototype.zip');
                }
                if (rpFile) {
                    pubFd.append('rp_upload_id', rpUploadId);
                    pubFd.append('rp_file_name', rpFile.name);
                }
                return adminFetch('version_publish', pubFd);
            });
        });
    }).then(function(res) {
        versionUploadBusy = false;
        btn.disabled = false;
        if (!res) return;
        if (res.success) {
            if (typeof resetQuickCreateFlow === 'function') resetQuickCreateFlow();
            if (res.data && res.data.version && res.data.version.id && typeof markVersionAsRead === 'function') {
                markVersionAsRead(res.data.version.id);
            }
            if (isAdminConsoleOpen()) {
                closeModal('uploadModal');
                markAdminConsoleChanged();
                showToast(res.message || (typeof t === 'function' ? t('admin.upload.success', null, '版本发布成功') : '版本发布成功'), 'success');
                syncPublishedVersion(itemId, res.data.version);
            } else {
                pText.innerText = (typeof t === 'function' ? t('admin.upload.progress_done_loading', null, '发布成功！正在加载预览...') : '发布成功！正在加载预览...');
                showToast(res.message || (typeof t === 'function' ? t('admin.upload.success', null, '版本发布成功') : '版本发布成功'), 'success', 2800, true);
                window.location.hash = '#item=' + itemId + '&v=' + encodeURIComponent(verName);
                setTimeout(function() {
                    window.location.reload();
                }, 300);
            }
        } else {
            showToast(res.message || (typeof t === 'function' ? t('admin.upload.failed', null, '发布失败') : '发布失败'), 'error');
        }
    }).catch(function(err) {
        versionUploadBusy = false;
        btn.disabled = false;
        pText.innerText = (typeof t === 'function' ? t('admin.upload.interrupted', null, '上传中断') : '上传中断');
        showToast((err && err.message) ? err.message : (typeof t === 'function' ? t('common.network_error', null, '网络异常，请重试') : '网络异常，请重试'), 'error');
    });
}

// 通用分片上传辅助函数
function syncPublishedVersion(itemId, version) {
    if (!version) return;
    if (version.id && typeof markVersionAsRead === 'function') {
        markVersionAsRead(version.id);
    }
    if (typeof hydrateAdminRowVersions === 'function') hydrateAdminRowVersions(itemId);
    var latest = [];
    $('#admin-item-row-' + itemId + ', #item-node-' + itemId).each(function() {
        var $node = $(this);
        var versions = $node.data('versions') || [];
        if (typeof versions === 'string') versions = JSON.parse(versions);
        latest = [version];
        versions.forEach(function(existing) {
            if (parseInt(existing.id, 10) === parseInt(version.id, 10)) return;
            latest.push(Object.assign({}, existing, version.is_default ? {is_default:0} : {}));
        });
        $node.data('versions', latest).attr('data-versions', JSON.stringify(latest));
        $node.find('.badge-ver').text(version.version_name);
        $node.find('.btn-table-ver').html('<span class="duo-icon-slot" data-duo-icon="history"><i class="ri-history-line duo-rest-icon"></i></span> ' + esc(typeof t === 'function' ? t('ver.count_btn', { n: latest.length }, latest.length + ' 个版本') : latest.length + ' 个版本'));
    });
    if (parseInt(currentVerManageItemId, 10) === parseInt(itemId, 10)) {
        currentVerManageAllVersions = latest;
        renderVersionManageView();
    }
    syncDashboardVersion(itemId, version.id, version.version_name);
    if (typeof refreshCategoryTreeNewBadges === 'function') {
        refreshCategoryTreeNewBadges();
    }
}

function uploadFileChunks(file, fileType, uploadId, CHUNK_SIZE, onChunkUploaded) {
    if (!file) return Promise.resolve();
    CHUNK_SIZE = CHUNK_SIZE || (typeof UPLOAD_CHUNK_SIZE !== 'undefined' ? UPLOAD_CHUNK_SIZE : 512 * 1024);
    var totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    var chunkIndex = 0;

    function nextChunk() {
        if (chunkIndex >= totalChunks) return Promise.resolve();
        var start = chunkIndex * CHUNK_SIZE;
        var end = Math.min(start + CHUNK_SIZE, file.size);
        var chunk = file.slice(start, end);

        var fd = new FormData();
        fd.append('action', 'upload_chunk');
        fd.append('upload_id', uploadId);
        fd.append('file_type', fileType);
        fd.append('chunk_index', chunkIndex);
        fd.append('chunk_total', totalChunks);
        fd.append('chunk_data', chunk, 'part');

        return adminFetch('upload_chunk', fd).then(function(res) {
            if (!res.success) throw new Error(res.message || (typeof t === 'function' ? t('admin.upload.chunk_failed', null, '分片上传失败') : '分片上传失败'));
            if (onChunkUploaded) onChunkUploaded(end - start);
            chunkIndex++;
            return nextChunk();
        });
    }
    return nextChunk();
}

/* ===================== 3. 文件夹与项目管理 ===================== */
if (typeof window !== 'undefined') {
    window.quickCreateFlow = null;
}
var quickCreateFlowSeq = 0;

function getQuickCreateFlow() {
    return (typeof window !== 'undefined' && window.quickCreateFlow) ? window.quickCreateFlow : null;
}

function getQuickCreateFlowId() {
    var flow = getQuickCreateFlow();
    return (flow && flow.id) ? flow.id : 0;
}

function setQuickCreateFlow(flow) {
    if (typeof window !== 'undefined') {
        window.quickCreateFlow = flow;
    }
}

function createQuickCreateFlow(target, advancing) {
    return {
        id: ++quickCreateFlowSeq,
        target: target,
        advancing: !!advancing,
        createdAny: false
    };
}

function setQuickCreateSubmitLabel(modalId, text) {
    var btn = (modalId === 'categoryModal')
        ? (document.querySelector ? document.querySelector('#categoryModal button[type="submit"]') : null)
        : (document.getElementById ? document.getElementById('btnItemSubmit') : null);
    if (btn) btn.textContent = text;
}

function resetQuickCreateFlow() {
    setQuickCreateFlow(null);
    var lblSave = (typeof t === 'function' ? t('common.save', null, '保存') : '保存');
    setQuickCreateSubmitLabel('categoryModal', lblSave);
    setQuickCreateSubmitLabel('itemModal', lblSave);
}

var categoryModalSession = 0;
var itemModalSession = 0;

function isModalOpen(id) {
    var modal = document.getElementById(id);
    if (!modal) return false;
    if (modal.style.display === 'none') return false;
    if (typeof modalStack !== 'undefined' && Array.isArray(modalStack)) {
        return modalStack.some(function(entry) { return entry.node === modal; });
    }
    return modal.style.display === 'flex' || modal.style.display === 'block';
}

function prependOptionAfterAll($select, value, text) {
    if (!$select || !$select.length || $select.find('option[value="' + value + '"]').length) return;
    var $opt = $('<option>', { value: value, text: text });
    var $allOpt = $select.find('option[value="0"]').first();
    if ($allOpt.length) $allOpt.after($opt);
    else $select.prepend($opt);
}

function getCategoryNameById(catId) {
    var sel = document.getElementById('itemCatSelect');
    if (!sel || !sel.options) return '';
    for (var i = 0; i < sel.options.length; i++) {
        if (String(sel.options[i].value) === String(catId)) {
            return sel.options[i].textContent || sel.options[i].text || '';
        }
    }
    return '';
}

function getOrderedCategoryIds() {
    var ids = [];
    var sel = document.getElementById('itemCatSelect');
    if (sel && sel.options) {
        Array.prototype.forEach.call(sel.options, function(opt) {
            if (opt.value && opt.value !== '0') ids.push(String(opt.value));
        });
    }
    return ids;
}

/**
 * 根据全局文件夹顺序计算新项应插入的基准下标（同文件夹置顶，否则紧邻后续首个非空文件夹前）
 */
function findCategoryGroupInsertIndex(items, getCatId, catId) {
    var catStr = String(catId || '0');
    for (var i = 0; i < items.length; i++) {
        if (String(getCatId(items[i]) || '0') === catStr) {
            return i;
        }
    }
    var ordered = getOrderedCategoryIds();
    var idx = ordered.indexOf(catStr);
    if (idx !== -1) {
        for (var j = idx + 1; j < ordered.length; j++) {
            for (var k = 0; k < items.length; k++) {
                if (String(getCatId(items[k]) || '0') === ordered[j]) {
                    return k;
                }
            }
        }
    }
    return items.length;
}

function insertItemRowInOrder($tbody, rowHtml, catId) {
    var rows = $tbody.find('tr[data-item-id]').toArray();
    var pos = findCategoryGroupInsertIndex(rows, function(el) {
        return el.getAttribute('data-cat-id');
    }, catId);
    if (pos < rows.length) {
        $(rows[pos]).before(rowHtml);
    } else {
        $tbody.append(rowHtml);
    }
}

function syncProjectSelectOption(itemId, name, webhookUrl, catId, catName) {
    if (!itemId) return;
    var normCatStr = String(catId || '0');
    var select = document.getElementById('uploadItemSelect');
    if (select) {
        var resolvedCatName = catName || '';
        if (!resolvedCatName && catId) {
            resolvedCatName = getCategoryNameById(catId);
        }
        var option = Array.prototype.find.call(select.options || [], function(entry) {
            return String(entry.value) === String(itemId);
        });
        var isNewOption = !option;
        if (!option) {
            option = document.createElement('option');
            option.value = itemId;
        }
        option.textContent = name;
        option.setAttribute('data-has-webhook', webhookUrl ? '1' : '0');
        option.setAttribute('data-webhook-url', webhookUrl || '');

        var targetGroup = null;
        if (typeof select.querySelectorAll === 'function' && (normCatStr !== '0' || resolvedCatName)) {
            var groups = Array.prototype.slice.call(select.querySelectorAll('optgroup'));
            if (normCatStr !== '0') {
                for (var g = 0; g < groups.length; g++) {
                    if (String(groups[g].getAttribute('data-cat-id') || '') === normCatStr) {
                        targetGroup = groups[g];
                        break;
                    }
                }
            }
            if (!targetGroup && resolvedCatName) {
                for (var g2 = 0; g2 < groups.length; g2++) {
                    if (!groups[g2].getAttribute('data-cat-id') && groups[g2].label === resolvedCatName) {
                        targetGroup = groups[g2];
                        if (normCatStr !== '0') {
                            targetGroup.setAttribute('data-cat-id', normCatStr);
                        }
                        break;
                    }
                }
            }
            if (!targetGroup && resolvedCatName) {
                targetGroup = document.createElement('optgroup');
                targetGroup.label = resolvedCatName;
                if (normCatStr !== '0') {
                    targetGroup.setAttribute('data-cat-id', normCatStr);
                }
                var groupPos = findCategoryGroupInsertIndex(groups, function(grp) {
                    return grp.getAttribute('data-cat-id') || '0';
                }, normCatStr);
                if (groupPos < groups.length && typeof select.insertBefore === 'function') {
                    select.insertBefore(targetGroup, groups[groupPos]);
                } else {
                    select.appendChild(targetGroup);
                }
            }
        }
        if (targetGroup) {
            if (isNewOption || option.parentNode !== targetGroup) {
                if (typeof targetGroup.insertBefore === 'function') {
                    targetGroup.insertBefore(option, targetGroup.firstChild || null);
                } else {
                    targetGroup.appendChild(option);
                }
            }
        } else if (isNewOption) {
            if (typeof select.insertBefore === 'function' && select.firstChild) {
                select.insertBefore(option, select.firstChild);
            } else {
                select.appendChild(option);
            }
        }
    }
    if (typeof syncDashboardSaveProject === 'function') {
        syncDashboardSaveProject(itemId, name, normCatStr);
    }
}

if (typeof window !== 'undefined') {
    window.onQuickCreateModalClosed = function(modalId) {
        var flow = getQuickCreateFlow();
        if (!flow) return;
        if (modalId !== 'categoryModal' && modalId !== 'itemModal' && modalId !== 'uploadModal') {
            return;
        }
        if (flow.advancing) return;
        // 上传中关窗属于最小化后台继续任务，严禁重载页面打断切片上传与发布
        if (typeof versionUploadBusy !== 'undefined' && versionUploadBusy) {
            resetQuickCreateFlow();
            return;
        }
        var createdAny = !!flow.createdAny;
        resetQuickCreateFlow();
        if (createdAny && typeof isAdminConsoleOpen === 'function' && !isAdminConsoleOpen()) {
            if (typeof window.location !== 'undefined' && window.location.reload) {
                window.location.reload();
            }
        }
    };
}

function openCategoryModal(id, name) {
    if (typeof categoryModalSession !== 'undefined') categoryModalSession++;
    var curFlow = getQuickCreateFlow();
    if (!id && curFlow && curFlow.advancing) {
        curFlow.advancing = false;
        setQuickCreateSubmitLabel('categoryModal', (typeof t === 'function' ? t('common.save_and_continue', null, '保存并继续') : '保存并继续'));
    } else {
        resetQuickCreateFlow();
    }
    document.getElementById('catId').value = id || '0';
    document.getElementById('catName').value = name || '';
    document.getElementById('catModalTitle').innerText = id
        ? (typeof t === 'function' ? t('admin.cat.edit_title', null, '编辑文件夹') : '编辑文件夹')
        : (typeof t === 'function' ? t('admin.cat.new_title', null, '新建文件夹') : '新建文件夹');
    if (typeof clearPasswordStrength === 'function') clearPasswordStrength(document.getElementById('categoryModal'));
    openModal('categoryModal', 'catName');
}

function editCategory(id, name) {
    openCategoryModal(id, name);
}

function handleCategorySave(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    var btn = (document.querySelector ? document.querySelector('#categoryModal button[type="submit"]') : null);
    var idInput = document.getElementById('catId');
    var nameInput = document.getElementById('catName');
    var catId = parseInt(idInput ? idInput.value : '0', 10) || 0;
    var catName = nameInput ? nameInput.value.trim() : '';
    if (!catName) {
        var msgCatName = (typeof t === 'function' ? t('admin.cat.enter_name', null, '请输入文件夹名称') : '请输入文件夹名称');
        if (typeof setFieldError === 'function' && nameInput) setFieldError(nameInput, null, msgCatName);
        else if (typeof showToast === 'function') showToast(msgCatName, 'warning');
        return;
    }
    var capturedFlowId = (typeof getQuickCreateFlowId === 'function') ? getQuickCreateFlowId() : 0;
    var capturedModalSession = (typeof categoryModalSession !== 'undefined') ? categoryModalSession : 0;
    if (btn) btn.disabled = true;

    var fd = new FormData();
    fd.append('id', catId);
    fd.append('name', catName);
    adminFetch('category_save', fd).then(function(res) {
        if (btn) btn.disabled = false;
        if (res.success) {
            var isEdit = (catId > 0);
            var newId = (res.data && res.data.id) ? parseInt(res.data.id, 10) : catId;
            var newName = (res.data && res.data.name) ? res.data.name : catName;
            var curFlow = (typeof getQuickCreateFlow === 'function') ? getQuickCreateFlow() : null;
            var isFlowActive = (!isEdit && capturedFlowId > 0 && curFlow && curFlow.id === capturedFlowId);
            var flow = (isFlowActive && (curFlow.target === 'project' || curFlow.target === 'link' || curFlow.target === 'upload'))
                ? curFlow
                : null;

            // 同步下拉选项 (项目表单文件夹下拉 + 项目列表与外链列表筛选下拉)
            var $select = $('#itemCatSelect');
            var $filterProj = $('#filterProjectCategory');
            var $filterLink = $('#filterLinkCategory');
            if (isEdit) {
                $select.find('option[value="' + newId + '"]').text(newName);
                $filterProj.find('option[value="' + newId + '"]').text(newName);
                $filterLink.find('option[value="' + newId + '"]').text(newName);
                $('#uploadItemSelect optgroup[data-cat-id="' + newId + '"]').attr('label', newName);
            } else {
                if ($select.length && !$select.find('option[value="' + newId + '"]').length) {
                    $select.prepend($('<option>', { value: newId, text: newName }));
                }
                prependOptionAfterAll($filterProj, newId, newName);
                prependOptionAfterAll($filterLink, newId, newName);
            }

            if (isAdminConsoleOpen()) {
                markAdminConsoleChanged();
                if (isEdit) {
                    $('#overviewTableProjects tr[data-cat-id="' + newId + '"] td:nth-child(2)').text(newName);
                    $('#overviewTableFolders tr[data-cat-id="' + newId + '"] td:first-child span').text(newName);
                } else {
                    var $fBody = $('#overviewTableFolders tbody');
                    if ($fBody.length) {
                        $fBody.find('tr:not([data-cat-id])').remove();
                        var safeName = esc(newName);
                        var unitItems = esc(typeof t === 'function' ? t('admin.proj.item_count_unit', null, '个项目') : '个项目');
                        var tipUp = esc(typeof t === 'function' ? t('common.move_up', null, '上移') : '上移');
                        var tipDown = esc(typeof t === 'function' ? t('common.move_down', null, '下移') : '下移');
                        var tipEditName = esc(typeof t === 'function' ? t('admin.proj.edit_name_tip', null, '编辑名称') : '编辑名称');
                        var tipDelFolder = esc(typeof t === 'function' ? t('admin.proj.delete_folder_tip', null, '删除文件夹') : '删除文件夹');
                        var rowHtml = '<tr data-cat-id="' + newId + '" style="border-bottom:1px solid var(--border);">' +
                            '<td style="padding:10px 12px;font-weight:600;color:var(--text-1);"><i class="ri-folder-line" style="color:var(--primary);margin-right:6px;font-size:15px;vertical-align:-1px;"></i><span>' + safeName + '</span></td>' +
                            '<td style="padding:10px 12px;color:var(--text-2);font-size:12.5px;"><span style="font-weight:500;color:var(--text-1);">0</span> <span style="color:var(--text-3);font-size:11.5px;">' + unitItems + '</span></td>' +
                            '<td style="padding:10px 12px;white-space:nowrap;">' +
                                '<button type="button" class="btn-act btn-cat-move-up" onclick="moveCategoryOrder(this, -1)" title="' + tipUp + '"><i class="ri-arrow-up-s-line"></i></button> ' +
                                '<button type="button" class="btn-act btn-cat-move-down" onclick="moveCategoryOrder(this, 1)" title="' + tipDown + '"><i class="ri-arrow-down-s-line"></i></button>' +
                            '</td>' +
                            '<td style="padding:10px 12px;text-align:right;white-space:nowrap;">' +
                                '<button type="button" class="btn-act btn-edit-cat-trigger" data-cat-id="' + newId + '" data-cat-name="' + safeName + '" title="' + tipEditName + '"><span class="duo-icon-slot" data-duo-icon="pencil"><i class="ri-edit-line duo-rest-icon"></i></span></button> ' +
                                '<button type="button" class="btn-act btn-delete-cat-trigger" data-cat-id="' + newId + '" data-cat-name="' + safeName + '" data-count="0" title="' + tipDelFolder + '"><span class="duo-icon-slot" data-duo-icon="trash"><i class="ri-delete-bin-line duo-rest-icon"></i></span></button>' +
                            '</td>' +
                        '</tr>';
                        $fBody.prepend(rowHtml);
                        updateCategoryOrderButtons();
                    }
                }
            }

            var curCatSession = (typeof categoryModalSession !== 'undefined') ? categoryModalSession : 0;
            var isFormSessionValid = (curCatSession === capturedModalSession && isModalOpen('categoryModal'));

            if (flow) {
                flow.createdAny = true;
                flow.advancing = true;
                if (typeof closeModal === 'function') {
                    closeModal('categoryModal');
                }
                setQuickCreateSubmitLabel('categoryModal', (typeof t === 'function' ? t('common.save', null, '保存') : '保存'));
                if (typeof showToast === 'function') {
                    showToast((typeof t === 'function' ? t('admin.cat.created_next', null, '文件夹已创建，继续下一步') : '文件夹已创建，继续下一步'), 'success');
                }
                openItemModal(newId, flow.target === 'link' ? 'link' : 'project');
                return;
            }

            // 若本次提交的表单会话已失效（用户在慢网络期间已取消关窗，或切换了其他弹窗），仅静默更新下拉与列表，绝不误关新弹窗、绝不误 reload
            if ((capturedFlowId > 0 && !isFlowActive) || !isFormSessionValid) {
                return;
            }

            // 普通新建 / 编辑文件夹保存成功
            resetQuickCreateFlow();
            if (typeof closeModal === 'function') {
                closeModal('categoryModal');
            }
            if (typeof showToast === 'function') {
                showToast(isEdit
                    ? (typeof t === 'function' ? t('admin.cat.updated', null, '文件夹已更新') : '文件夹已更新')
                    : (typeof t === 'function' ? t('admin.cat.created', null, '文件夹创建成功') : '文件夹创建成功'), 'success');
            }
            if (typeof isAdminConsoleOpen === 'function' && !isAdminConsoleOpen()) {
                if (typeof window !== 'undefined' && window.location) {
                    window.location.reload();
                }
            }
        } else {
            showToast(res.message || (typeof t === 'function' ? t('admin.cat.save_failed', null, '保存文件夹失败') : '保存文件夹失败'), 'error');
        }
    }).catch(function(err) {
        if (btn) btn.disabled = false;
        showToast((err && err.message) ? err.message : (typeof t === 'function' ? t('common.network_error', null, '网络异常，请重试') : '网络异常，请重试'), 'error');
    });
}

// 控制中心家族化矢量微插画辅助生成器 (对齐 Linear 浅色工作台与立象原型图纸体系)
function getConsoleFolderEmptySvg() {
    return '<svg width="120" height="96" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">' +
        '<rect x="34" y="24" width="56" height="44" rx="6" fill="var(--canvas)" stroke="var(--border-strong)" stroke-width="1.2" transform="rotate(-3 34 24)"/>' +
        '<path d="M30 28C30 25 32 23 35 23H48L53 28H81C84 28 86 30 86 33V66C86 69 84 71 81 71H35C32 71 30 69 30 66V28Z" fill="var(--surface)" stroke="var(--border-strong)" stroke-width="1.4"/>' +
        '<line x1="36" y1="36" x2="80" y2="36" stroke="var(--surface-hover)" stroke-width="1"/>' +
        '<rect x="38" y="42" width="22" height="3" rx="1.5" fill="var(--border-strong)"/>' +
        '<rect x="38" y="48" width="34" height="2.5" rx="1" fill="var(--surface-hover)"/>' +
        '<rect x="38" y="54" width="26" height="2.5" rx="1" fill="var(--surface-hover)"/>' +
        '<g transform="translate(68, 46)">' +
            '<circle cx="14" cy="14" r="13" fill="var(--primary-subtle)" stroke="var(--primary-border)" stroke-width="1.3"/>' +
            '<path d="M14 9V19M9 14H19" stroke="var(--primary)" stroke-width="2" stroke-linecap="round"/>' +
        '</g>' +
    '</svg>';
}

function getConsoleProjectEmptySvg() {
    return '<svg width="120" height="96" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">' +
        '<rect x="34" y="20" width="56" height="46" rx="6" fill="var(--canvas)" stroke="var(--border-strong)" stroke-width="1.2" transform="rotate(3 62 43)"/>' +
        '<rect x="30" y="24" width="56" height="46" rx="6" fill="var(--surface)" stroke="var(--border-strong)" stroke-width="1.4"/>' +
        '<line x1="30" y1="34" x2="86" y2="34" stroke="var(--surface-hover)" stroke-width="1"/>' +
        '<circle cx="36" cy="29" r="1.5" fill="var(--border)"/>' +
        '<circle cx="40.5" cy="29" r="1.5" fill="var(--border)"/>' +
        '<circle cx="45" cy="29" r="1.5" fill="var(--border)"/>' +
        '<rect x="37" y="40" width="18" height="4" rx="1.5" fill="var(--primary)" fill-opacity="0.2"/>' +
        '<rect x="37" y="48" width="18" height="12" rx="3" fill="var(--canvas)" stroke="var(--border)" stroke-width="1"/>' +
        '<rect x="59" y="48" width="18" height="12" rx="3" fill="var(--canvas)" stroke="var(--border)" stroke-width="1"/>' +
        '<g transform="translate(66, 44)">' +
            '<circle cx="14" cy="14" r="13" fill="var(--primary-subtle)" stroke="var(--primary-border)" stroke-width="1.3"/>' +
            '<path d="M10 8L18 16L14 17L16 21L14 22L12 18L9 20Z" fill="var(--primary)" stroke="var(--surface)" stroke-width="1" stroke-linejoin="round"/>' +
        '</g>' +
    '</svg>';
}

function getConsoleLinkEmptySvg() {
    return '<svg width="120" height="96" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">' +
        '<rect x="34" y="20" width="56" height="46" rx="6" fill="var(--canvas)" stroke="var(--border-strong)" stroke-width="1.2" transform="rotate(-3 34 20)"/>' +
        '<rect x="30" y="24" width="56" height="46" rx="6" fill="var(--surface)" stroke="var(--border-strong)" stroke-width="1.4"/>' +
        '<line x1="30" y1="34" x2="86" y2="34" stroke="var(--surface-hover)" stroke-width="1"/>' +
        '<circle cx="36" cy="29" r="1.5" fill="var(--border)"/>' +
        '<circle cx="40.5" cy="29" r="1.5" fill="var(--border)"/>' +
        '<rect x="37" y="42" width="22" height="3" rx="1.5" fill="var(--border-strong)"/>' +
        '<rect x="37" y="49" width="34" height="2.5" rx="1" fill="var(--surface-hover)"/>' +
        '<rect x="37" y="55" width="26" height="2.5" rx="1" fill="var(--surface-hover)"/>' +
        '<g transform="translate(66, 44)">' +
            '<circle cx="14" cy="14" r="13" fill="var(--primary-subtle)" stroke="var(--primary-border)" stroke-width="1.3"/>' +
            '<path d="M11 17L17 11M17 11H12M17 11V16" stroke="var(--primary)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</g>' +
    '</svg>';
}

function getConsoleMemberEmptySvg() {
    return '<svg width="120" height="96" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">' +
        '<rect x="26" y="22" width="46" height="46" rx="6" fill="var(--canvas)" stroke="var(--border-strong)" stroke-width="1.2" transform="rotate(-6 26 22)"/>' +
        '<circle cx="49" cy="36" r="4.5" fill="var(--border)"/>' +
        '<path d="M43 45C43 42.5 46 40.5 49 40.5C52 40.5 55 42.5 55 45" fill="var(--border-strong)"/>' +
        '<rect x="36" y="24" width="48" height="46" rx="6" fill="var(--surface)" stroke="var(--border-strong)" stroke-width="1.4"/>' +
        '<line x1="36" y1="34" x2="84" y2="34" stroke="var(--surface-hover)" stroke-width="1"/>' +
        '<circle cx="60" cy="29" r="1.75" fill="var(--border)"/>' +
        '<circle cx="60" cy="42" r="5" fill="var(--primary-subtle)"/>' +
        '<path d="M54 51C54 48 57 46 60 46C63 46 66 48 66 51" fill="var(--primary-border)"/>' +
        '<line x1="48" y1="58" x2="72" y2="58" stroke="var(--border-strong)" stroke-width="1.5" stroke-linecap="round"/>' +
        '<g transform="translate(68, 46)">' +
            '<circle cx="14" cy="14" r="13" fill="var(--primary-subtle)" stroke="var(--primary-border)" stroke-width="1.3"/>' +
            '<path d="M11 18V17C11 15.3431 12.3431 14 14 14C15.6569 14 17 15.3431 17 17V18" stroke="var(--primary)" stroke-width="1.4" stroke-linecap="round"/>' +
            '<circle cx="14" cy="10.5" r="2.5" stroke="var(--primary)" stroke-width="1.4"/>' +
        '</g>' +
    '</svg>';
}

function getConsoleVersionDraftSvg() {
    return '<svg width="120" height="96" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto 10px;">' +
        '<rect x="34" y="20" width="56" height="48" rx="6" fill="var(--canvas)" stroke="var(--border-strong)" stroke-width="1.2" transform="rotate(-3 34 20)"/>' +
        '<rect x="30" y="22" width="56" height="48" rx="6" fill="var(--surface)" stroke="var(--border-strong)" stroke-width="1.4"/>' +
        '<line x1="30" y1="33" x2="86" y2="33" stroke="var(--surface-hover)" stroke-width="1"/>' +
        '<circle cx="36" cy="28" r="1.5" fill="var(--border)"/>' +
        '<circle cx="41" cy="28" r="1.5" fill="var(--border)"/>' +
        '<rect x="36" y="37" width="44" height="28" rx="4" fill="var(--canvas)" stroke="var(--primary)" stroke-width="1.2" stroke-dasharray="3 3"/>' +
        '<g transform="translate(68, 46)">' +
            '<circle cx="14" cy="14" r="13" fill="var(--primary-subtle)" stroke="var(--primary-border)" stroke-width="1.3"/>' +
            '<path d="M14 9V17M14 9L10 13M14 9L18 13" stroke="var(--primary)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M9 19H19" stroke="var(--primary)" stroke-width="1.6" stroke-linecap="round"/>' +
        '</g>' +
    '</svg>';
}

function deleteCategory(catId) {
    confirmDeleteCategory(catId, (typeof t === 'function' ? t('admin.proj.this_folder', null, '此文件夹') : '此文件夹'), 0);
}

function confirmDeleteCategory(catId, catName, itemCount) {
    var count = parseInt(itemCount || 0, 10);
    var nameStr = catName || (typeof t === 'function' ? t('admin.proj.this_folder', null, '此文件夹') : '此文件夹');
    var msg = (count > 0)
        ? (typeof t === 'function' ? t('admin.cat.delete_nonempty', { name: nameStr, count: count }, '文件夹「' + nameStr + '」下包含 ' + count + ' 个项目。删除将同时清空该文件夹下的所有项目与历史版本，确定继续？') : '文件夹「' + nameStr + '」下包含 ' + count + ' 个项目。删除将同时清空该文件夹下的所有项目与历史版本，确定继续？')
        : (typeof t === 'function' ? t('admin.cat.delete_empty', { name: nameStr }, '确定删除空文件夹「' + nameStr + '」？') : '确定删除空文件夹「' + nameStr + '」？');
    showConfirm({
        title: (typeof t === 'function' ? t('admin.cat.delete_title', null, '删除文件夹') : '删除文件夹'),
        message: msg,
        confirmText: (typeof t === 'function' ? t('admin.cat.delete_title', null, '删除文件夹') : '删除文件夹'),
        isDanger: true,
        onConfirm: function() {
            var fd = new FormData();
            fd.append('id', catId);
            adminFetch('category_delete', fd).then(function(res) {
                if (res.success) {
                    showToast((typeof t === 'function' ? t('admin.cat.deleted', null, '文件夹已删除') : '文件夹已删除'), 'success');
                    if (isAdminConsoleOpen()) {
                        markAdminConsoleChanged();
                        $('#itemCatSelect option[value="' + catId + '"]').remove();
                        var $fp = $('#filterProjectCategory');
                        var $fl = $('#filterLinkCategory');
                        var fpReset = false;
                        var flReset = false;
                        if ($fp.val() == catId) {
                            $fp.val('0');
                            fpReset = true;
                        }
                        $fp.find('option[value="' + catId + '"]').remove();
                        if (fpReset && typeof filterProjectsByCategory === 'function') {
                            filterProjectsByCategory('0');
                        }

                        if ($fl.val() == catId) {
                            $fl.val('0');
                            flReset = true;
                        }
                        $fl.find('option[value="' + catId + '"]').remove();
                        if (flReset && typeof filterLinksByCategory === 'function') {
                            filterLinksByCategory('0');
                        }

                        // 级联同步发版项目下拉与看板项目
                        $('#overviewTableProjects tr[data-cat-id="' + catId + '"]').each(function() {
                            var itId = $(this).data('item-id') || $(this).attr('data-item-id');
                            if (itId) {
                                syncUploadModalRemoveItem(itId);
                                syncDashboardRemoveProject(itId);
                            }
                        });

                        $('#overviewTableFolders tr[data-cat-id="' + catId + '"]').remove();
                        $('#overviewTableProjects tr[data-cat-id="' + catId + '"]').remove();
                        $('#overviewTableLinks tr[data-cat-id="' + catId + '"]').remove();
                        updateCategoryOrderButtons();
                        var $fRows = $('#overviewTableFolders tbody tr[data-cat-id]');
                        if (!$fRows.length) {
                            $('#overviewTableFolders tbody').html(
                                '<tr class="empty-folders-row"><td colspan="4" style="padding:44px 20px;text-align:center;">' +
                                    getConsoleFolderEmptySvg() +
                                    '<div style="font-weight:600;font-size:13.5px;color:var(--text-1);margin-top:10px;">' + esc(typeof t === 'function' ? t('admin.proj.empty_folders_title', null, '暂无文件夹分类') : '暂无文件夹分类') + '</div>' +
                                    '<div style="font-size:12px;color:var(--text-3);margin-top:3px;margin-bottom:14px;">' + esc(typeof t === 'function' ? t('admin.proj.empty_folders_desc', null, '创建文件夹以井井有条地组织您的原型项目') : '创建文件夹以井井有条地组织您的原型项目') + '</div>' +
                                    '<button type="button" class="btn-primary btn-sm" onclick="openCategoryModal(0)"><span class="duo-icon-slot" data-duo-icon="folder-plus"><i class="ri-folder-add-line duo-rest-icon"></i></span> ' + esc(typeof t === 'function' ? t('workspace.new_folder', null, '新建文件夹') : '新建文件夹') + '</button>' +
                                '</td></tr>'
                            );
                        }
                    } else {
                        window.location.reload();
                    }
                } else {
                    showToast(res.message || (typeof t === 'function' ? t('admin.cat.delete_failed', null, '删除文件夹失败') : '删除文件夹失败'), 'error');
                }
            });
        }
    });
}
window.confirmDeleteCategory = confirmDeleteCategory;

function switchOverviewSubTab(subTab) {
    subTab = (subTab === 'links' || subTab === 'folders') ? subTab : 'projects';
    sessionStorage.setItem('overview_active_subtab', subTab);
    if (typeof closeAllLinearHintPopovers === 'function') closeAllLinearHintPopovers();
    $('#btnSubtabProjects, #btnSubtabLinks, #btnSubtabFolders').removeClass('active');
    $('#overviewTableProjects, #overviewTableLinks, #overviewTableFolders').hide();
    $('#overviewActionsProjects, #overviewActionsLinks, #overviewActionsFolders').hide();

    if (subTab === 'folders') {
        $('#btnSubtabFolders').addClass('active');
        $('#overviewTableFolders').show();
        $('#overviewActionsFolders').css('display', 'flex');
        if (typeof triggerTabTransition === 'function') triggerTabTransition(document.getElementById('overviewTableFolders'));
    } else if (subTab === 'links') {
        $('#btnSubtabLinks').addClass('active');
        $('#overviewTableLinks').show();
        $('#overviewActionsLinks').css('display', 'flex');
        if (typeof triggerTabTransition === 'function') triggerTabTransition(document.getElementById('overviewTableLinks'));
    } else {
        $('#btnSubtabProjects').addClass('active');
        $('#overviewTableProjects').show();
        $('#overviewActionsProjects').css('display', 'flex');
        if (typeof triggerTabTransition === 'function') triggerTabTransition(document.getElementById('overviewTableProjects'));
    }
}
window.switchOverviewSubTab = switchOverviewSubTab;

function updateCategoryOrderButtons() {
    var $rows = $('#overviewTableFolders tbody tr[data-cat-id]');
    $rows.each(function(idx) {
        var isFirst = idx === 0;
        var isLast = idx === $rows.length - 1;
        $(this).find('.btn-cat-move-up').prop('disabled', isFirst).css({
            'opacity': isFirst ? '0.28' : '1',
            'cursor': isFirst ? 'not-allowed' : 'pointer'
        });
        $(this).find('.btn-cat-move-down').prop('disabled', isLast).css({
            'opacity': isLast ? '0.28' : '1',
            'cursor': isLast ? 'not-allowed' : 'pointer'
        });
    });
}
window.updateCategoryOrderButtons = updateCategoryOrderButtons;

/* ===================== 控制台内部秩序调序 (文件夹与项目排序) ===================== */
function moveCategoryOrder(btn, direction) {
    var $tr = $(btn).closest('tr');
    var $tbody = $tr.closest('tbody');
    var $rows = $tbody.find('tr[data-cat-id]');
    var curIdx = $rows.index($tr);
    var targetIdx = curIdx + direction;
    if (targetIdx < 0 || targetIdx >= $rows.length) return;

    var targetTr = $rows.get(targetIdx);
    if (direction < 0) {
        $tr.insertBefore(targetTr);
    } else {
        $tr.insertAfter(targetTr);
    }

    var ids = [];
    $tbody.find('tr[data-cat-id]').each(function() {
        var cid = parseInt($(this).data('cat-id'), 10);
        if (cid) ids.push(cid);
    });

    var fd = new FormData();
    fd.append('ids', JSON.stringify(ids));
    adminFetch('category_sort', fd).then(function(res) {
        if (res.success) {
            markAdminConsoleChanged();
            updateCategoryOrderButtons();
            showToast((typeof t === 'function' ? t('admin.cat.order_updated', null, '文件夹排序已更新') : '文件夹排序已更新'), 'success');
        } else {
            showToast(res.message || (typeof t === 'function' ? t('admin.cat.order_failed', null, '更新排序失败') : '更新排序失败'), 'error');
        }
    });
}
window.moveCategoryOrder = moveCategoryOrder;

function filterProjectsByCategory(catId) {
    catId = parseInt(catId || 0, 10);
    sessionStorage.setItem('selected_project_cat_filter', catId);
    var $rows = $('#overviewTableProjects tbody tr[data-item-id]');
    $('#overviewTableProjects tbody tr.filtered-empty-row').remove();

    if (catId === 0) {
        $rows.show();
        $('.project-order-btn').hide();
    } else {
        var matchCount = 0;
        $rows.each(function() {
            var rowCatId = parseInt($(this).data('cat-id') || 0, 10);
            if (rowCatId === catId) {
                $(this).show();
                matchCount++;
            } else {
                $(this).hide();
            }
        });
        $('.project-order-btn').show();
        updateProjectOrderButtons(catId);

        if (matchCount === 0 && $rows.length > 0) {
            var catName = $('#filterProjectCategory option:selected').text() || (typeof t === 'function' ? t('admin.proj.this_folder', null, '此文件夹') : '此文件夹');
            var emptyFilterHtml = '<tr class="filtered-empty-row"><td colspan="6" style="padding:40px 20px;text-align:center;">' +
                getConsoleProjectEmptySvg() +
                '<div style="font-weight:600;font-size:13.5px;color:var(--text-1);margin-top:10px;">' + esc(typeof t === 'function' ? t('admin.proj.folder_empty_title', { name: catName }, '「' + catName + '」下暂无原型项目') : '「' + catName + '」下暂无原型项目') + '</div>' +
                '<div style="font-size:12px;color:var(--text-3);margin-top:3px;margin-bottom:14px;">' + esc(typeof t === 'function' ? t('admin.proj.folder_empty_desc', null, '当前分类空空如也，可将已有项目归类至此或新建项目') : '当前分类空空如也，可将已有项目归类至此或新建项目') + '</div>' +
                '<button type="button" class="btn-primary btn-sm" onclick="openItemModal(0, ' + catId + ', \'project\')"><span class="duo-icon-slot" data-duo-icon="circle-plus"><i class="ri-add-line duo-rest-icon"></i></span> ' + esc(typeof t === 'function' ? t('workspace.new_project', null, '新建项目') : '新建项目') + '</button>' +
            '</td></tr>';
            $('#overviewTableProjects tbody').append(emptyFilterHtml);
        }
    }
    if (typeof updateOverviewSortHint === 'function') updateOverviewSortHint('project', catId);
}
window.filterProjectsByCategory = filterProjectsByCategory;

function filterLinksByCategory(catId) {
    catId = parseInt(catId || 0, 10);
    sessionStorage.setItem('selected_link_cat_filter', catId);
    var $rows = $('#overviewTableLinks tbody tr[data-item-id]');
    $('#overviewTableLinks tbody tr.filtered-empty-row').remove();

    if (catId === 0) {
        $rows.show();
        $('.link-order-btn').hide();
    } else {
        var matchCount = 0;
        $rows.each(function() {
            var rowCatId = parseInt($(this).data('cat-id') || 0, 10);
            if (rowCatId === catId) {
                $(this).show();
                matchCount++;
            } else {
                $(this).hide();
            }
        });
        $('.link-order-btn').show();
        updateLinkOrderButtons(catId);

        if (matchCount === 0 && $rows.length > 0) {
            var catName = $('#filterLinkCategory option:selected').text() || (typeof t === 'function' ? t('admin.proj.this_folder', null, '此文件夹') : '此文件夹');
            var emptyFilterHtml = '<tr class="filtered-empty-row"><td colspan="6" style="padding:40px 20px;text-align:center;">' +
                getConsoleLinkEmptySvg() +
                '<div style="font-weight:600;font-size:13.5px;color:var(--text-1);margin-top:10px;">' + esc(typeof t === 'function' ? t('admin.proj.folder_links_empty_title', { name: catName }, '「' + catName + '」下暂无外部链接') : '「' + catName + '」下暂无外部链接') + '</div>' +
                '<div style="font-size:12px;color:var(--text-3);margin-top:3px;margin-bottom:14px;">' + esc(typeof t === 'function' ? t('admin.proj.folder_links_empty_desc', null, '当前分类空空如也，可将外部设计稿或演示地址收纳至此') : '当前分类空空如也，可将外部设计稿或演示地址收纳至此') + '</div>' +
                '<button type="button" class="btn-primary btn-sm" onclick="openItemModal(0, ' + catId + ', \'link\')"><span class="duo-icon-slot" data-duo-icon="circle-plus"><i class="ri-add-line duo-rest-icon"></i></span> ' + esc(typeof t === 'function' ? t('workspace.new_link', null, '新建链接') : '新建链接') + '</button>' +
            '</td></tr>';
            $('#overviewTableLinks tbody').append(emptyFilterHtml);
        }
    }
    if (typeof updateOverviewSortHint === 'function') updateOverviewSortHint('link', catId);
}
window.filterLinksByCategory = filterLinksByCategory;

function updateLinkOrderButtons(catId) {
    var $visibleRows = $('#overviewTableLinks tbody tr[data-item-id]:visible');
    $visibleRows.each(function(idx) {
        var isFirst = idx === 0;
        var isLast = idx === $visibleRows.length - 1;
        $(this).find('.btn-link-move-up').prop('disabled', isFirst).css({
            'opacity': isFirst ? '0.28' : '1',
            'cursor': isFirst ? 'not-allowed' : 'pointer'
        });
        $(this).find('.btn-link-move-down').prop('disabled', isLast).css({
            'opacity': isLast ? '0.28' : '1',
            'cursor': isLast ? 'not-allowed' : 'pointer'
        });
    });
}
window.updateLinkOrderButtons = updateLinkOrderButtons;

function updateProjectOrderButtons(catId) {
    var $visibleRows = $('#overviewTableProjects tbody tr[data-item-id]:visible');
    $visibleRows.each(function(idx) {
        var isFirst = idx === 0;
        var isLast = idx === $visibleRows.length - 1;
        $(this).find('.btn-proj-move-up').prop('disabled', isFirst).css({
            'opacity': isFirst ? '0.28' : '1',
            'cursor': isFirst ? 'not-allowed' : 'pointer'
        });
        $(this).find('.btn-proj-move-down').prop('disabled', isLast).css({
            'opacity': isLast ? '0.28' : '1',
            'cursor': isLast ? 'not-allowed' : 'pointer'
        });
    });
}

function moveItemOrder(btn, direction) {
    var $tr = $(btn).closest('tr');
    var catId = parseInt($tr.data('cat-id') || 0, 10);
    var isLink = ($tr.attr('data-type') === 'link' || $tr.closest('#overviewTableLinks').length > 0);
    var $table = isLink ? $('#overviewTableLinks') : $('#overviewTableProjects');
    var $visibleRows = $table.find('tbody tr[data-item-id]:visible');
    var curIdx = $visibleRows.index($tr);
    var targetIdx = curIdx + direction;
    if (targetIdx < 0 || targetIdx >= $visibleRows.length) return;

    var targetTr = $visibleRows.get(targetIdx);
    if (direction < 0) {
        $tr.insertBefore(targetTr);
    } else {
        $tr.insertAfter(targetTr);
    }

    var ids = [];
    $table.find('tbody tr[data-item-id]:visible').each(function() {
        var iid = parseInt($(this).data('item-id'), 10);
        if (iid) ids.push(iid);
    });

    var fd = new FormData();
    fd.append('ids', JSON.stringify(ids));
    if (catId > 0) fd.append('category_id', catId);
    adminFetch('item_sort', fd).then(function(res) {
        if (res.success) {
            markAdminConsoleChanged();
            if (isLink) {
                updateLinkOrderButtons(catId);
                showToast((typeof t === 'function' ? t('admin.item.link_order_updated', null, '外链排序已更新') : '外链排序已更新'), 'success');
            } else {
                updateProjectOrderButtons(catId);
                showToast((typeof t === 'function' ? t('admin.item.proj_order_updated', null, '项目排序已更新') : '项目排序已更新'), 'success');
            }
        } else {
            showToast(res.message || (typeof t === 'function' ? t('admin.cat.order_failed', null, '更新排序失败') : '更新排序失败'), 'error');
        }
    });
}
window.moveItemOrder = moveItemOrder;

function openItemModal(arg1, arg2, arg3) {
    if (typeof itemModalSession !== 'undefined') itemModalSession++;
    // 严密兼容: openItemModal(catId) / openItemModal(catId, type) / openItemModal(itemId, catId, type)
    var catId = '';
    var type = 'project';
    if (arguments.length === 1) {
        catId = arg1 || '';
    } else if (arguments.length === 2) {
        catId = arg1 || '';
        type = arg2 || 'project';
    } else if (arguments.length >= 3) {
        catId = arg2 || '';
        type = arg3 || 'project';
    }

    var flow = getQuickCreateFlow();
    if (!flow || !flow.advancing) {
        resetQuickCreateFlow();
        flow = null;
    } else {
        flow.advancing = false;
    }

    var folders = document.getElementById('itemCatSelect');
    if (folders && !folders.options.length) {
        if (!flow) {
            flow = createQuickCreateFlow(type === 'link' ? 'link' : 'project', false);
            setQuickCreateFlow(flow);
        }
        flow.advancing = true;
        showToast((typeof t === 'function' ? t('admin.item.create_folder_first', null, '请先创建文件夹，保存后继续') : '请先创建文件夹，保存后继续'), 'info');
        openCategoryModal(0);
        return;
    }

    document.getElementById('editItemId').value = '0';
    document.getElementById('itemCatSelect').value = catId || '';
    document.getElementById('itemName').value = '';
    document.getElementById('itemType').value = type;
    
    var titleEl = document.getElementById('itemModalTitle');
    var nameLabel = document.getElementById('itemNameLabel');
    var nameInput = document.getElementById('itemName');

    if (type === 'link') {
        if (titleEl) titleEl.textContent = (typeof t === 'function' ? t('admin.item.new_link', null, '新建链接') : '新建链接');
        if (nameLabel) nameLabel.innerHTML = esc(typeof t === 'function' ? t('admin.item.link_name', null, '链接名称') : '链接名称') + ' <span class="req-star">*</span>';
        if (nameInput) nameInput.placeholder = (typeof t === 'function' ? t('admin.item.link_name_placeholder', null, '输入链接名称') : '输入链接名称');
    } else {
        if (titleEl) titleEl.textContent = (typeof t === 'function' ? t('admin.item.new_project', null, '新建项目') : '新建项目');
        if (nameLabel) nameLabel.innerHTML = esc(typeof t === 'function' ? t('admin.item.project_name', null, '项目名称') : '项目名称') + ' <span class="req-star">*</span>';
        if (nameInput) nameInput.placeholder = (typeof t === 'function' ? t('admin.item.project_name_placeholder', null, '输入项目名称') : '输入项目名称');
    }

    // 新建模式：默认全部协作者可发版，创建者也可主动指定一位或多位负责人
    if (typeof setItemOwnersSelection === 'function') {
        setItemOwnersSelection('', true);
    }

    if (document.getElementById('itemLinkUrl')) document.getElementById('itemLinkUrl').value = '';
    if (document.getElementById('itemLinkTarget')) document.getElementById('itemLinkTarget').value = '_blank';
    if (document.getElementById('itemWebhookUrl')) document.getElementById('itemWebhookUrl').value = '';
    var isAdvancingToUpload = (flow && flow.target === 'upload' && type !== 'link');
    setQuickCreateSubmitLabel('itemModal', isAdvancingToUpload ? (typeof t === 'function' ? t('common.save_and_continue', null, '保存并继续') : '保存并继续') : (typeof t === 'function' ? t('common.save', null, '保存') : '保存'));
    if (isAdvancingToUpload) {
        showToast((typeof t === 'function' ? t('admin.item.create_project_first', null, '请先创建项目，保存后继续发布') : '请先创建项目，保存后继续发布'), 'info');
    }

    toggleItemType(type);
    openModal('itemModal', 'itemName');
}

// 全局成员负责人下拉选项热重绘 (保持 #itemOwnersOptions 永远与当前成员数据最新一致)
function parseOwnerIds(raw) {
    if (!raw) return [];
    var seen = {};
    var out = [];
    String(raw).split(',').forEach(function(part) {
        var id = parseInt(String(part).trim(), 10);
        if (id > 0 && !seen[id]) {
            seen[id] = true;
            out.push(String(id));
        }
    });
    return out;
}

function getOwnerDisplayName(uid) {
    var idNum = parseInt(uid, 10);
    if (!idNum) return '';
    if (typeof cachedUsersMap !== 'undefined' && cachedUsersMap[idNum]) {
        return cachedUsersMap[idNum].name || cachedUsersMap[idNum].email || (typeof t === 'function' ? t('admin.item.member_id', { id: idNum }, '成员 #' + idNum) : '成员 #' + idNum);
    }
    var cb = document.querySelector('#itemOwnersOptions input.item-owner-cb[value="' + idNum + '"]');
    if (cb && cb.getAttribute('data-name')) {
        return cb.getAttribute('data-name');
    }
    return (typeof t === 'function' ? t('admin.item.member_id', { id: idNum }, '成员 #' + idNum) : '成员 #' + idNum);
}

function canEditorsShare() {
    var group = document.getElementById('itemOwnersGroup');
    return !group || group.getAttribute('data-editor-share') !== '0';
}

function syncItemCollaborationSharePermission(allowed) {
    var group = document.getElementById('itemOwnersGroup');
    if (!group) return;
    group.setAttribute('data-editor-share', allowed ? '1' : '0');
    var scope = document.getElementById('itemCollaborationScope');
    if (scope) {
        var all = scope.querySelector('option[value="all"]');
        var selected = scope.querySelector('option[value="selected"]');
        if (all) all.textContent = allowed
            ? (typeof t === 'function' ? t('admin.item.scope_all_ver_share', null, '所有协作者可管理版本和分享') : '所有协作者可管理版本和分享')
            : (typeof t === 'function' ? t('admin.item.scope_all_ver', null, '所有协作者可管理版本') : '所有协作者可管理版本');
        if (selected) selected.textContent = allowed
            ? (typeof t === 'function' ? t('admin.item.scope_sel_ver_share', null, '仅指定成员可管理版本和分享') : '仅指定成员可管理版本和分享')
            : (typeof t === 'function' ? t('admin.item.scope_sel_ver', null, '仅指定成员可管理版本') : '仅指定成员可管理版本');
    }
    $('#overviewTableProjects tbody tr[data-item-id]').each(function() {
        var $row = $(this);
        $row.find('td').eq(2).html(renderItemOwnersCellHtml($row.attr('data-collaborators') || ''));
    });
}

function renderItemOwnersCellHtml(collaboratorsStr, creatorName) {
    var actions = canEditorsShare()
        ? (typeof t === 'function' ? t('admin.item.perm_ver_share', null, '版本与分享') : '版本与分享')
        : (typeof t === 'function' ? t('admin.item.perm_ver', null, '版本') : '版本');
    var ids = parseOwnerIds(collaboratorsStr);
    if (ids.length > 0) {
        var names = ids.map(getOwnerDisplayName);
        var fullText = names.join('、');
        var onlyNames = (typeof t === 'function' ? t('admin.item.only_owners', { names: fullText }, '仅' + fullText) : '仅' + fullText);
        return '<span title="' + esc(actions) + '：' + esc(onlyNames) + '">' + esc(onlyNames) + '</span>';
    }
    var allEd = (typeof t === 'function' ? t('admin.item.all_editors', null, '所有协作者') : '所有协作者');
    return '<span title="' + esc(actions) + '：' + esc(allEd) + '">' + esc(allEd) + '</span>';
}
window.renderItemOwnersCellHtml = renderItemOwnersCellHtml;

function canCurrentUserEditItemByOwners(collaboratorsStr, createdBy) {
    if (typeof CURRENT_USER === 'undefined' || !CURRENT_USER || (CURRENT_USER.role !== 'admin' && CURRENT_USER.role !== 'editor')) return false;
    if (typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.role === 'admin') {
        return true;
    }
    var myUidNum = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) ? (parseInt(CURRENT_USER.id, 10) || 0) : 0;
    var ids = parseOwnerIds(collaboratorsStr);
    if (ids.length === 0) return true;
    return myUidNum > 0 && ids.indexOf(String(myUidNum)) !== -1;
}

// 保存负责人后同步当前页面的发版入口，避免等到整页刷新才收回权限。
function syncItemOwnerPermissions(itemId, collaboratorsStr, createdBy) {
    var canPublish = canCurrentUserEditItemByOwners(collaboratorsStr, createdBy);
    var $tree = $('#item-node-' + itemId);
    var $row = $('#admin-item-row-' + itemId);
    $tree.add($row).attr('data-collaborators', collaboratorsStr).data('collaborators', collaboratorsStr)
        .attr('data-can-edit', canPublish ? '1' : '0').data('can-edit', canPublish ? 1 : 0);
    var $treeControls = $tree.find('.admin-controls');
    var $rowUpload = $row.find('button[onclick*="openUploadModal"]');
    if (!canPublish) {
        $treeControls.remove();
        $rowUpload.remove();
    } else {
        if ($tree.length && !$treeControls.length) {
            var tipPubVer = esc(typeof t === 'function' ? t('workspace.publish_version', null, '发布版本') : '发布版本');
            $tree.append('<div class="admin-controls" onclick="event.stopPropagation()"><button type="button" class="btn-act duo-hover-btn" data-duo-icon="cloud-upload" onclick="openUploadModal(' + parseInt(itemId, 10) + ')" title="' + tipPubVer + '"><i class="ri-upload-cloud-line duo-rest-icon"></i></button></div>');
        }
        if ($row.length && !$rowUpload.length) {
            var tipPubNew = esc(typeof t === 'function' ? t('workspace.publish_new_ver', null, '发布新版本') : '发布新版本');
            $row.find('td').last().prepend('<button type="button" class="btn-act" onclick="openUploadModal(' + parseInt(itemId, 10) + ')" title="' + tipPubNew + '"><span class="duo-icon-slot" data-duo-icon="cloud-upload"><i class="ri-upload-cloud-line duo-rest-icon"></i></span></button> ');
        }
    }
}

function closeItemOwnersDropdown() {
    var menu = document.getElementById('itemOwnersMenu');
    var trigger = document.getElementById('itemOwnersTrigger');
    if (menu) menu.style.display = 'none';
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

function toggleItemOwnersDropdown(e) {
    if (e) e.stopPropagation();
    var menu = document.getElementById('itemOwnersMenu');
    var trigger = document.getElementById('itemOwnersTrigger');
    if (!menu || !trigger) return;
    var isOpen = (menu.style.display !== 'none');
    menu.style.display = isOpen ? 'none' : 'block';
    trigger.setAttribute('aria-expanded', String(!isOpen));
    if (!isOpen) {
        menu.style.top = (trigger.offsetTop + trigger.offsetHeight + 4) + 'px';
        var modalBox = trigger.closest('.modal-dialog-box');
        var visibleTop = 0;
        var visibleBottom = window.innerHeight;
        if (modalBox) {
            var boxRect = modalBox.getBoundingClientRect();
            visibleTop = Math.max(visibleTop, boxRect.top);
            visibleBottom = Math.min(visibleBottom, boxRect.bottom);
        }
        var triggerRect = trigger.getBoundingClientRect();
        var menuRect = menu.getBoundingClientRect();
        if (menuRect.bottom > visibleBottom && triggerRect.top - menuRect.height - 4 >= visibleTop) {
            menu.style.top = (trigger.offsetTop - menu.offsetHeight - 4) + 'px';
        }
    }
}

function onItemCollaborationScopeChange() {
    var scope = document.getElementById('itemCollaborationScope');
    var selection = document.getElementById('itemOwnersSelection');
    var isSelected = scope && scope.value === 'selected';
    if (selection) selection.hidden = !isSelected;
    if (typeof clearFieldError === 'function') clearFieldError(document.getElementById('itemOwnersTrigger'));
    if (!isSelected) clearItemOwnersSelection();
    else onItemOwnersChange();
}

function onItemOwnersChange() {
    var optionsEl = document.getElementById('itemOwnersOptions');
    var hiddenEl = document.getElementById('itemCollaborators');
    var tagsWrap = document.getElementById('itemOwnersTags');
    if (!optionsEl || !tagsWrap) return;

    var selectedIds = [];
    var selectedNames = [];
    var cbs = optionsEl.querySelectorAll('input.item-owner-cb');
    cbs.forEach(function(cb) {
        if (cb.checked) {
            var idNum = parseInt(cb.value, 10);
            if (idNum > 0) {
                selectedIds.push(String(idNum));
                selectedNames.push(cb.getAttribute('data-name') || getOwnerDisplayName(idNum));
            }
        }
    });

    if (hiddenEl) {
        hiddenEl.value = selectedIds.join(',');
    }

    if (selectedNames.length === 0) {
        tagsWrap.innerHTML = '<span class="item-owner-placeholder">' + esc(typeof t === 'function' ? t('admin.item.select_owners', null, '选择协作成员') : '选择协作成员') + '</span>';
    } else if (selectedNames.length <= 3) {
        var html = '';
        selectedNames.forEach(function(name) {
            html += '<span class="badge-tag badge-primary">' + esc(name) + '</span>';
        });
        tagsWrap.innerHTML = html;
    } else {
        tagsWrap.innerHTML = '<span class="badge-tag badge-primary">' + esc(typeof t === 'function' ? t('admin.item.selected_owners_n', { first: selectedNames[0], n: selectedNames.length }, selectedNames[0] + ' 等 ' + selectedNames.length + ' 人') : selectedNames[0] + ' 等 ' + selectedNames.length + ' 人') + '</span>';
    }
    if (selectedNames.length > 0 && typeof clearFieldError === 'function') clearFieldError(document.getElementById('itemOwnersTrigger'));
}

function clearItemOwnersSelection() {
    var optionsEl = document.getElementById('itemOwnersOptions');
    if (optionsEl) {
        optionsEl.querySelectorAll('input.item-owner-cb').forEach(function(cb) {
            cb.checked = false;
        });
    }
    onItemOwnersChange();
    closeItemOwnersDropdown();
}

function setItemOwnersSelection(collaboratorsStr, canEditOwners) {
    closeItemOwnersDropdown();
    var group = document.getElementById('itemOwnersGroup');
    var optionsEl = document.getElementById('itemOwnersOptions');
    var hiddenEl = document.getElementById('itemCollaborators');
    var selectedIds = parseOwnerIds(collaboratorsStr);
    var scope = document.getElementById('itemCollaborationScope');
    var selection = document.getElementById('itemOwnersSelection');
    if (scope) scope.value = selectedIds.length ? 'selected' : 'all';
    if (selection) selection.hidden = selectedIds.length === 0;
    if (typeof clearFieldError === 'function') clearFieldError(document.getElementById('itemOwnersTrigger'));
    if (hiddenEl) hiddenEl.value = selectedIds.join(',');
    if (group) {
        group.setAttribute('data-can-edit-owners', canEditOwners ? '1' : '0');
        group.style.display = canEditOwners ? 'block' : 'none';
    }
    if (!optionsEl) return;

    optionsEl.querySelectorAll('.temp-fallback-owner-option').forEach(function(el) {
        el.remove();
    });

    var cbs = optionsEl.querySelectorAll('input.item-owner-cb');
    var existingMap = {};
    cbs.forEach(function(cb) {
        var val = String(parseInt(cb.value, 10) || '');
        existingMap[val] = cb;
        cb.checked = selectedIds.indexOf(val) !== -1;
    });

    selectedIds.forEach(function(sid) {
        if (!existingMap[sid]) {
            var u = (typeof cachedUsersMap !== 'undefined' && cachedUsersMap[sid]) ? cachedUsersMap[sid] : null;
            var uName = u ? (u.name || u.email) : (typeof t === 'function' ? t('admin.item.member_id', { id: sid }, '成员 #' + sid) : '成员 #' + sid);
            var suffix = (u && parseInt(u.status, 10) === 3) ? (typeof t === 'function' ? t('admin.item.status_off_tag', null, ' (已停用)') : ' (已停用)') : '';
            var lbl = document.createElement('label');
            lbl.className = 'mcp-project-option temp-fallback-owner-option';
            lbl.innerHTML = '<input type="checkbox" class="item-owner-cb" value="' + esc(sid) + '" data-name="' + esc(uName) + '" checked onchange="onItemOwnersChange()">' +
                '<span>' + esc(uName + suffix) + '</span>';
            optionsEl.appendChild(lbl);
        }
    });

    onItemOwnersChange();
}

function syncAuthorSelectOptions() {
    var optionsEl = document.getElementById('itemOwnersOptions');
    if (!optionsEl || typeof cachedUsersMap === 'undefined') return;
    var scope = document.getElementById('itemCollaborationScope');
    var previousScope = scope ? scope.value : 'all';

    var curSelected = [];
    optionsEl.querySelectorAll('input.item-owner-cb:checked').forEach(function(cb) {
        curSelected.push(String(parseInt(cb.value, 10) || ''));
    });

    var activeUsers = [];
    for (var uid in cachedUsersMap) {
        var u = cachedUsersMap[uid];
        if ((u.role === 'admin' || u.role === 'editor') && parseInt(u.status, 10) === 1) {
            activeUsers.push(u);
        }
    }
    activeUsers.sort(function(a, b) { return parseInt(a.id, 10) - parseInt(b.id, 10); });

    var html = '';
    activeUsers.forEach(function(u) {
        var uDisplay = u.name || u.email || (typeof t === 'function' ? t('admin.item.member_id', { id: u.id }, '成员 #' + u.id) : '成员 #' + u.id);
        var roleTag = u.role === 'admin' ? (typeof t === 'function' ? t('admin.item.role_admin_tag', null, ' (管理员)') : ' (管理员)') : '';
        var checkedAttr = curSelected.indexOf(String(u.id)) !== -1 ? ' checked' : '';
        html += '<label class="mcp-project-option">' +
            '<input type="checkbox" class="item-owner-cb" value="' + parseInt(u.id, 10) + '" data-name="' + esc(uDisplay) + '"' + checkedAttr + ' onchange="onItemOwnersChange()">' +
            '<span>' + esc(uDisplay + roleTag) + '</span>' +
        '</label>';
    });
    optionsEl.innerHTML = html;
    var group = document.getElementById('itemOwnersGroup');
    setItemOwnersSelection(curSelected.join(','), !!group && group.getAttribute('data-can-edit-owners') === '1');
    if (scope && previousScope === 'selected') {
        scope.value = 'selected';
        onItemCollaborationScopeChange();
    }
    var typeEl = document.getElementById('itemType');
    if (typeEl) toggleItemType(typeEl.value);
}
window.syncAuthorSelectOptions = syncAuthorSelectOptions;

// 全局同步审批通知人候选下拉名单 (根据当前最新活跃管理员重构)
function syncAdminApprovalSelectOptions() {
    var container = document.getElementById('adminMultiSelectOptions');
    if (!container || typeof cachedUsersMap === 'undefined') return;

    var activeAdmins = [];
    for (var uid in cachedUsersMap) {
        var u = cachedUsersMap[uid];
        if (u.role === 'admin' && parseInt(u.status, 10) === 1) {
            activeAdmins.push(u);
        }
    }
    activeAdmins.sort(function(a, b) { return parseInt(a.id, 10) - parseInt(b.id, 10); });

    var defaultAll = (typeof SAVED_NOTIFY_ADMIN_IDS === 'undefined' || SAVED_NOTIFY_ADMIN_IDS === null);
    var savedIds = Array.isArray(window.SAVED_NOTIFY_ADMIN_IDS) ? window.SAVED_NOTIFY_ADMIN_IDS : null;

    var html = '';
    var tipBotConfigured = esc(typeof t === 'function' ? t('admin.users.bot_configured_tip', null, '已配置个人机器人 Webhook') : '已配置个人机器人 Webhook');
    var labelNoBot = esc(typeof t === 'function' ? t('admin.settings.no_bot', null, '未配置机器人') : '未配置机器人');
    activeAdmins.forEach(function(au) {
        var auId = parseInt(au.id, 10);
        var isChecked = defaultAll ? true : (savedIds ? savedIds.indexOf(auId) !== -1 : false);
        var hasHook = !!String(au.webhook_url || '').trim();
        var uName = esc(au.name || au.email);
        html += '<label class="admin-select-option" style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:4px;cursor:pointer;font-size:12.5px;transition:background 0.15s;" onmouseover="this.style.background=\'var(--canvas)\'" onmouseout="this.style.background=\'transparent\'">' +
            '<input type="checkbox" name="visitor_notify_admin_ids[]" value="' + au.id + '" ' + (isChecked ? 'checked' : '') + ' onchange="onAdminSelectChange()" style="cursor:pointer;">' +
            '<span style="font-weight:600;color:var(--text-1);">' + uName + '</span>' +
            '<span class="admin-select-webhook-status" data-admin-webhook-status>' +
                (hasHook ? '<i class="ri-robot-line" title="' + tipBotConfigured + '" role="img" aria-label="' + tipBotConfigured + '"></i>' : labelNoBot) +
            '</span>' +
        '</label>';
    });
    container.innerHTML = html;
    if (typeof onAdminSelectChange === 'function') {
        onAdminSelectChange(true);
    }
}
window.syncAdminApprovalSelectOptions = syncAdminApprovalSelectOptions;

// 从发版弹窗的所属项目下拉中移除被删除项目
function syncUploadModalRemoveItem(itemId) {
    itemId = parseInt(itemId, 10);
    if (!itemId) return;
    var $upSelect = $('#uploadItemSelect');
    if ($upSelect.length) {
        var isSelected = (parseInt($upSelect.val(), 10) === itemId);
        $upSelect.find('option[value="' + itemId + '"]').remove();
        if (isSelected) {
            var firstOpt = $upSelect.find('option:first').val();
            $upSelect.val(firstOpt || '');
            if (typeof onUploadItemSelectChange === 'function') {
                onUploadItemSelectChange($upSelect.val());
            }
        }
    }
}
window.syncUploadModalRemoveItem = syncUploadModalRemoveItem;

// 评审看板项目与版本筛选下拉同步体系（与工作台跨文件夹优先、同组置顶规则一致）
function syncDashboardSaveProject(itemId, itemName, catId) {
    itemId = parseInt(itemId, 10);
    if (!itemId) return;
    var data = window.DASHBOARD_DATA = window.DASHBOARD_DATA || {};
    var projs = data.projects = data.projects || [];
    var pSelect = document.getElementById('filterAnnoProject');
    var existingIdx = -1;
    var existing = null;
    for (var i = 0; i < projs.length; i++) {
        if (parseInt(projs[i].id, 10) === itemId) {
            existingIdx = i;
            existing = projs[i];
            break;
        }
    }
    var resolvedCatNum = (typeof catId !== 'undefined' && catId !== null && String(catId) !== '')
        ? (parseInt(catId, 10) || 0)
        : (existing ? (parseInt(existing.category_id, 10) || 0) : 0);
    var catChanged = existing ? ((parseInt(existing.category_id, 10) || 0) !== resolvedCatNum) : true;

    var entry = existing || { id: itemId, category_id: resolvedCatNum, name: itemName, versions: [] };
    entry.name = itemName;
    entry.category_id = resolvedCatNum;

    if (!existing || catChanged) {
        if (existingIdx !== -1) {
            projs.splice(existingIdx, 1);
        }
        var dataPos = findCategoryGroupInsertIndex(projs, function(p) {
            return p.category_id || 0;
        }, resolvedCatNum);
        projs.splice(dataPos, 0, entry);
    }

    if (pSelect) {
        var opt = pSelect.querySelector('option[value="' + itemId + '"]');
        var isNewOpt = !opt;
        if (!opt) {
            opt = document.createElement('option');
            opt.value = itemId;
        }
        opt.textContent = itemName;
        opt.setAttribute('data-cat-id', String(resolvedCatNum));
        if (isNewOpt || catChanged) {
            if (opt.parentNode === pSelect) {
                pSelect.removeChild(opt);
            }
            var itemOpts = Array.prototype.filter.call(pSelect.options || [], function(o) {
                return String(o.value) !== '0';
            });
            var optPos = findCategoryGroupInsertIndex(itemOpts, function(o) {
                return o.getAttribute('data-cat-id') || '0';
            }, resolvedCatNum);
            if (optPos < itemOpts.length) {
                pSelect.insertBefore(opt, itemOpts[optPos]);
            } else {
                pSelect.appendChild(opt);
            }
        }
    }
}

function syncDashboardRemoveProject(itemId) {
    itemId = parseInt(itemId, 10);
    if (!itemId) return;
    var data = window.DASHBOARD_DATA = window.DASHBOARD_DATA || {};
    var projs = data.projects = data.projects || [];
    data.projects = projs.filter(function(p) { return parseInt(p.id, 10) !== itemId; });

    // 同步从 DASHBOARD_DATA.annos 缓存中移除被删项目的批注
    if (data.annos && Array.isArray(data.annos)) {
        data.annos = data.annos.filter(function(a) {
            return parseInt(a.item_id, 10) !== itemId;
        });
    }

    var pSelect = document.getElementById('filterAnnoProject');
    var isCurrentSelected = (window.currentAnnoProjFilter === itemId || (pSelect && parseInt(pSelect.value, 10) === itemId));

    if (pSelect) {
        var opt = pSelect.querySelector('option[value="' + itemId + '"]');
        if (opt) opt.remove();
    }

    if (isCurrentSelected) {
        if (pSelect) pSelect.value = '0';
        if (typeof onAnnoProjectFilterChange === 'function') {
            onAnnoProjectFilterChange(0);
        }
    }
}

function syncDashboardVersion(itemId, verId, verName) {
    itemId = parseInt(itemId, 10);
    verId = parseInt(verId, 10);
    if (!itemId || !verId) return;
    var data = window.DASHBOARD_DATA = window.DASHBOARD_DATA || {};
    var projs = data.projects = data.projects || [];
    var target = null;
    for (var i = 0; i < projs.length; i++) {
        if (parseInt(projs[i].id, 10) === itemId) {
            target = projs[i];
            break;
        }
    }
    if (!target) return;
    target.versions = target.versions || [];
    var vExist = null;
    for (var j = 0; j < target.versions.length; j++) {
        if (parseInt(target.versions[j].id, 10) === verId) {
            vExist = target.versions[j];
            break;
        }
    }
    if (vExist) {
        vExist.name = verName;
    } else {
        target.versions.push({ id: verId, name: verName });
    }
    var pSelect = document.getElementById('filterAnnoProject');
    if (pSelect && parseInt(pSelect.value, 10) === itemId && typeof onAnnoProjectFilterChange === 'function') {
        var curVerVal = document.getElementById('filterAnnoVersion') ? document.getElementById('filterAnnoVersion').value : '0';
        onAnnoProjectFilterChange(itemId);
        var vSelect = document.getElementById('filterAnnoVersion');
        if (vSelect && curVerVal && curVerVal !== '0') {
            var targetOpt = vSelect.querySelector('option[value="' + curVerVal + '"]');
            if (targetOpt) {
                vSelect.value = curVerVal;
                if (typeof onAnnoVersionFilterChange === 'function') {
                    onAnnoVersionFilterChange(curVerVal);
                }
            }
        }
    }
}

function syncDashboardRemoveVersion(itemId, verId) {
    itemId = parseInt(itemId, 10);
    verId = parseInt(verId, 10);
    if (!itemId || !verId) return;
    var data = window.DASHBOARD_DATA = window.DASHBOARD_DATA || {};
    var projs = data.projects = data.projects || [];
    var target = null;
    for (var i = 0; i < projs.length; i++) {
        if (parseInt(projs[i].id, 10) === itemId) {
            target = projs[i];
            break;
        }
    }
    if (!target || !target.versions) return;
    target.versions = target.versions.filter(function(v) { return parseInt(v.id, 10) !== verId; });

    // 同步从 DASHBOARD_DATA.annos 缓存中移除该版本的批注
    if (data.annos && Array.isArray(data.annos)) {
        data.annos = data.annos.filter(function(a) {
            return !(parseInt(a.item_id, 10) === itemId && parseInt(a.ver_id, 10) === verId);
        });
    }

    var pSelect = document.getElementById('filterAnnoProject');
    if (pSelect && parseInt(pSelect.value, 10) === itemId && typeof onAnnoProjectFilterChange === 'function') {
        var vSelect = document.getElementById('filterAnnoVersion');
        var curVerVal = vSelect ? vSelect.value : '0';
        onAnnoProjectFilterChange(itemId);
        if (vSelect && curVerVal && curVerVal !== String(verId) && curVerVal !== '0') {
            var targetOpt = vSelect.querySelector('option[value="' + curVerVal + '"]');
            if (targetOpt) {
                vSelect.value = curVerVal;
                if (typeof onAnnoVersionFilterChange === 'function') {
                    onAnnoVersionFilterChange(curVerVal);
                }
            }
        }
    }
}
window.syncDashboardSaveProject = syncDashboardSaveProject;
window.syncDashboardRemoveProject = syncDashboardRemoveProject;
window.syncDashboardVersion = syncDashboardVersion;
window.syncDashboardRemoveVersion = syncDashboardRemoveVersion;

// 别名桥接，兼容控制台列表中的直接调用
function openEditItemModal(data) {
    editItem(data);
}

function editItem(data) {
    if (typeof itemModalSession !== 'undefined') itemModalSession++;
    if (typeof resetQuickCreateFlow === 'function') resetQuickCreateFlow();
    if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch(e) { return; }
    }
    var type = data.type || 'project';
    document.getElementById('editItemId').value = data.id || '0';
    document.getElementById('itemCatSelect').value = data.category_id || '';
    document.getElementById('itemName').value = data.name || '';
    document.getElementById('itemType').value = type;

    // 管理员或项目创建者可调整项目负责人范围（默认全部协作者；勾选则仅限所选负责人）
    var isCurAdmin = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.role === 'admin');
    var isCreator = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER && parseInt(CURRENT_USER.id, 10) === parseInt(data.created_by || 0, 10));
    if (typeof setItemOwnersSelection === 'function') {
        setItemOwnersSelection(data.collaborators || '', isCurAdmin || isCreator);
    }
    toggleItemType(type);

    if (document.getElementById('itemLinkUrl')) {
        document.getElementById('itemLinkUrl').value = data.link_url || '';
    }
    if (document.getElementById('itemLinkTarget')) {
        document.getElementById('itemLinkTarget').value = data.link_target || '_blank';
    }
    if (document.getElementById('itemWebhookUrl')) {
        document.getElementById('itemWebhookUrl').value = (type === 'link') ? '' : (data.webhook_url || '');
    }

    if (document.getElementById('btnItemSubmit')) document.getElementById('btnItemSubmit').innerText = (typeof t === 'function' ? t('common.save', null, '保存') : '保存');

    var titleEl = document.getElementById('itemModalTitle');
    var nameLabel = document.getElementById('itemNameLabel');
    if (type === 'link') {
        if (titleEl) titleEl.textContent = (typeof t === 'function' ? t('admin.item.edit_link', null, '编辑链接') : '编辑链接');
        if (nameLabel) nameLabel.innerHTML = esc(typeof t === 'function' ? t('admin.item.link_name', null, '链接名称') : '链接名称') + ' <span class="req-star">*</span>';
    } else {
        if (titleEl) titleEl.textContent = (typeof t === 'function' ? t('admin.item.edit_project', null, '编辑项目属性') : '编辑项目属性');
        if (nameLabel) nameLabel.innerHTML = esc(typeof t === 'function' ? t('admin.item.project_name', null, '项目名称') : '项目名称') + ' <span class="req-star">*</span>';
    }
    openModal('itemModal', 'itemName');
}

function toggleItemType(type) {
    var ownersGroup = document.getElementById('itemOwnersGroup');
    if (ownersGroup) ownersGroup.style.display = (type !== 'link' && ownersGroup.getAttribute('data-can-edit-owners') === '1') ? 'block' : 'none';
    var lFields = document.getElementById('linkFields');
    if (lFields) {
        lFields.style.display = (type === 'link') ? 'block' : 'none';
        var urlInput = document.getElementById('itemLinkUrl');
        if (urlInput) urlInput.required = type === 'link';
    }
    var hookGroup = document.getElementById('itemWebhookGroup');
    if (hookGroup) {
        hookGroup.style.display = (type === 'link') ? 'none' : 'block';
    }
}

function handleItemSave(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    var editIdEl = document.getElementById('editItemId');
    var editId = parseInt(editIdEl ? editIdEl.value : '0', 10) || 0;
    var itemTypeEl = document.getElementById('itemType');
    var itemType = itemTypeEl ? itemTypeEl.value : 'project';
    var btn = document.getElementById('btnItemSubmit');
    var capturedFlowId = (typeof getQuickCreateFlowId === 'function') ? getQuickCreateFlowId() : 0;
    var capturedModalSession = (typeof itemModalSession !== 'undefined') ? itemModalSession : 0;
    if (btn) btn.disabled = true;

    var fd = new FormData();
    fd.append('id', editId);
    var catSel = document.getElementById('itemCatSelect');
    fd.append('category_id', catSel ? catSel.value : '0');
    fd.append('type', itemType);
    var nameEl = document.getElementById('itemName');
    fd.append('name', nameEl ? nameEl.value : '');
    var urlEl = document.getElementById('itemLinkUrl');
    fd.append('link_url', urlEl ? urlEl.value : '');
    var tgtEl = document.getElementById('itemLinkTarget');
    fd.append('link_target', tgtEl ? tgtEl.value : '_blank');
    var hookEl = document.getElementById('itemWebhookUrl');
    fd.append('webhook_url', (itemType === 'link' || !hookEl) ? '' : hookEl.value.trim());

    // 基本资料编辑不覆盖未呈现的全局水印或无权变更的负责人配置。
    var ownersGroup = document.getElementById('itemOwnersGroup');
    var ownersInput = document.getElementById('itemCollaborators');
    var hasSubmittedCollaborators = false;
    var submittedCollaborators = null;
    if (ownersGroup && ownersGroup.style && ownersGroup.style.display !== 'none' && ownersInput) {
        hasSubmittedCollaborators = true;
        var scopeSelect = document.getElementById('itemCollaborationScope');
        var scopeValue = scopeSelect ? scopeSelect.value : 'all';
        submittedCollaborators = scopeValue === 'selected' ? (ownersInput.value || '') : '';
        if (scopeValue === 'selected' && !submittedCollaborators) {
            if (btn) btn.disabled = false;
            var selOwnerErr = (typeof t === 'function' ? t('admin.item.select_one_owner', null, '请至少选择一位协作成员') : '请至少选择一位协作成员');
            if (typeof setFieldError === 'function') {
                setFieldError(document.getElementById('itemOwnersTrigger'), document.getElementById('itemCollaboratorsError'), selOwnerErr);
            } else showToast(selOwnerErr, 'warning');
            return;
        }
        fd.append('collaboration_scope', scopeValue);
        fd.append('collaborators', submittedCollaborators);
    }

    adminFetch('item_save', fd).then(function(res) {
        if (btn) btn.disabled = false;
        if (res.success) {
            var itemId = (res.data && res.data.id) ? res.data.id : editId;
            var curFlow = (typeof getQuickCreateFlow === 'function') ? getQuickCreateFlow() : null;
            var isFlowActive = (!editId && capturedFlowId > 0 && curFlow && curFlow.id === capturedFlowId);
            var flow = isFlowActive ? curFlow : null;
            var shouldAdvanceUpload = (flow && flow.target === 'upload' && itemType === 'project' && canCurrentUserEditItemByOwners(submittedCollaborators));
            var curItemSession = (typeof itemModalSession !== 'undefined') ? itemModalSession : 0;
            var isFormSessionValid = (curItemSession === capturedModalSession && isModalOpen('itemModal'));
            var savedCollaborators = hasSubmittedCollaborators ? (submittedCollaborators || '') : null;

            function syncProjectOptionByOwners(targetId, targetName, targetHook, targetCatId, targetCollaborators, targetCreatedBy) {
                syncItemOwnerPermissions(targetId, targetCollaborators, targetCreatedBy);
                var canEdit = (typeof canCurrentUserEditItemByOwners === 'function')
                    ? canCurrentUserEditItemByOwners(targetCollaborators, targetCreatedBy)
                    : true;
                if (canEdit) {
                    syncProjectSelectOption(targetId, targetName, targetHook, targetCatId, getCategoryNameById(targetCatId));
                } else {
                    if (typeof syncUploadModalRemoveItem === 'function') {
                        syncUploadModalRemoveItem(targetId);
                    }
                    if (typeof syncDashboardSaveProject === 'function') {
                        syncDashboardSaveProject(targetId, targetName, targetCatId);
                    }
                }
            }

            if (shouldAdvanceUpload) {
                flow.createdAny = true;
                flow.advancing = true;
                if (typeof closeModal === 'function') {
                    closeModal('itemModal');
                }
                if (itemType === 'project') {
                    var advCatId = fd.get('category_id') || '0';
                    var advUid = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) ? CURRENT_USER.id : 0;
                    syncProjectOptionByOwners(itemId, fd.get('name') || '', fd.get('webhook_url') || '', advCatId, savedCollaborators || '', advUid);
                }
                if (typeof setQuickCreateSubmitLabel === 'function') {
                    setQuickCreateSubmitLabel('itemModal', (typeof t === 'function' ? t('common.save', null, '保存') : '保存'));
                }
                if (typeof showToast === 'function') {
                    showToast((typeof t === 'function' ? t('admin.item.created_next_upload', null, '项目已创建，继续发布版本') : '项目已创建，继续发布版本'), 'success');
                }
                if (typeof openUploadModal === 'function') {
                    openUploadModal(itemId, fd.get('name') || '');
                }
                return;
            }

            // 若本次提交的表单会话已失效（用户在慢网络期间已取消表单，或切换了新建链接等新弹窗）：
            // 必须同步已落库项目的发布选项（让后续点击发布版本能直接选中），但严禁关窗、严禁 reload 冲掉新草稿！
            if ((capturedFlowId > 0 && !isFlowActive) || !isFormSessionValid) {
                if (itemType === 'project') {
                    var advCatId = fd.get('category_id') || '0';
                    var staleUid = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) ? CURRENT_USER.id : 0;
                    syncProjectOptionByOwners(itemId, fd.get('name') || '', fd.get('webhook_url') || '', advCatId, savedCollaborators || '', staleUid);
                }
                return;
            }

            // 普通项目新建或修改保存（表单会话依然有效）
            resetQuickCreateFlow();
            if (typeof closeModal === 'function') {
                closeModal('itemModal');
            }
            if (itemType === 'project') {
                var normCatId = fd.get('category_id') || '0';
                var effectiveCollabForSelect = savedCollaborators;
                var effectiveCreatorId = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) ? CURRENT_USER.id : 0;
                if (typeof $ === 'function') {
                    var $existingRow = $('#admin-item-row-' + itemId);
                    if ($existingRow.length) {
                        if (effectiveCollabForSelect === null) {
                            effectiveCollabForSelect = $existingRow.attr('data-collaborators') || '';
                        }
                        effectiveCreatorId = parseInt($existingRow.attr('data-created-by') || effectiveCreatorId, 10) || effectiveCreatorId;
                    }
                }
                syncProjectOptionByOwners(itemId, fd.get('name') || '', fd.get('webhook_url') || '', normCatId, effectiveCollabForSelect || '', effectiveCreatorId);
            }
            if (typeof showToast === 'function') {
                showToast(editId
                    ? (typeof t === 'function' ? t('admin.item.updated', null, '修改保存成功') : '修改保存成功')
                    : (typeof t === 'function' ? t('admin.item.created', null, '项目创建成功') : '项目创建成功'), 'success');
            }
            if (isAdminConsoleOpen()) {
                markAdminConsoleChanged();
                var itemName = fd.get('name') || '';
                var itemCatId = fd.get('category_id') || '0';
                var catText = $('#itemCatSelect option[value="' + itemCatId + '"]').text() || (typeof t === 'function' ? t('admin.proj.uncategorized', null, '未归类') : '未归类');
                var $row = $('#admin-item-row-' + itemId);
                if ($row.length) {
                    var prevCatId = String($row.attr('data-cat-id') || '0');
                    var prevItemData = $row.find('.btn-edit-item-trigger').data('item-data') || {};
                    var rowCreatorId = parseInt($row.attr('data-created-by') || prevItemData.created_by || 0, 10) || ((typeof CURRENT_USER !== 'undefined' && CURRENT_USER) ? CURRENT_USER.id : 0);
                    var rowCreatorName = String($row.attr('data-creator-name') || '').trim();
                    if (!rowCreatorName && typeof cachedUsersMap !== 'undefined' && cachedUsersMap[rowCreatorId]) {
                        rowCreatorName = cachedUsersMap[rowCreatorId].name || cachedUsersMap[rowCreatorId].email || '';
                    }
                    var nextCollaborators = (savedCollaborators !== null) ? savedCollaborators : String($row.attr('data-collaborators') || prevItemData.collaborators || '');
                    $row.data('cat-id', itemCatId).attr('data-cat-id', itemCatId);
                    $row.data('name', itemName).attr('data-name', itemName);
                    $row.data('collaborators', nextCollaborators).attr('data-collaborators', nextCollaborators);
                    if (prevCatId !== String(itemCatId)) {
                        var $hostBody = $row.closest('tbody');
                        $row.detach();
                        insertItemRowInOrder($hostBody, $row, itemCatId);
                    }
                    var isLinkRow = ($row.attr('data-type') === 'link' || itemType === 'link');
                    var $tds = $row.find('td');
                    if (isLinkRow) {
                        var linkUrl = fd.get('link_url') || '';
                        var linkTarget = fd.get('link_target') || '_blank';
                        var targetText = (linkTarget === '_blank')
                            ? (typeof t === 'function' ? t('admin.proj.open_new_tab', null, '新标签页') : '新标签页')
                            : (typeof t === 'function' ? t('admin.proj.open_embed', null, '内嵌预览') : '内嵌预览');
                        var tipCopyLink = esc(typeof t === 'function' ? t('admin.item.copy_link_tip', null, '复制链接') : '复制链接');
                        var targetBadgeStyle = (linkTarget === '_blank') ? 'background:var(--primary-subtle);color:var(--primary);border:1px solid var(--primary-border);' : 'background:var(--canvas);color:var(--text-3);border:1px solid var(--border);';
                        if ($tds.length >= 5) {
                            $tds.eq(0).html('<i class="ri-external-link-line" style="color:var(--primary);margin-right:4px;font-size:14px;vertical-align:-1px;"></i>' + esc(itemName));
                            $tds.eq(1).text(catText);
                            $tds.eq(2).html('<span class="badge-tag" style="' + targetBadgeStyle + 'font-size:11px;">' + esc(targetText) + '</span>');
                            var urlHtml = '<div style="display:flex;align-items:center;gap:6px;">' +
                                '<a href="' + esc(linkUrl) + '" target="_blank" rel="noopener noreferrer" style="color:var(--primary);text-decoration:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;max-width:200px;" title="' + esc(linkUrl) + '">' + esc(linkUrl || '-') + '</a>' +
                                (linkUrl ? '<button type="button" class="btn-act btn-copy-url" data-url="' + esc(linkUrl) + '" title="' + tipCopyLink + '"><span class="duo-icon-slot" data-duo-icon="copy"><i class="ri-file-copy-line duo-rest-icon"></i></span></button>' : '') +
                            '</div>';
                            $tds.eq(3).html(urlHtml);
                            $tds.eq(4).text(rowCreatorName || '-');
                            var updatedLinkData = {
                                id: itemId,
                                type: 'link',
                                category_id: parseInt(itemCatId, 10),
                                name: itemName,
                                link_url: linkUrl,
                                link_target: linkTarget,
                                webhook_url: '',
                                created_by: rowCreatorId,
                                collaborators: nextCollaborators
                            };
                            $row.find('.btn-edit-item-trigger')
                                .removeAttr('onclick')
                                .data('item-data', updatedLinkData)
                                .attr('data-item-json', JSON.stringify(updatedLinkData));
                        }
                    } else {
                        if ($tds.length >= 3) {
                            var $nameTd = $tds.eq(0);
                            var $badges = $nameTd.find('.badge-tag, .badge-link').detach();
                            $nameTd.text(' ' + itemName + ' ').append($badges);
                            $tds.eq(1).text(catText);
                            $tds.eq(2).html(renderItemOwnersCellHtml(nextCollaborators, rowCreatorName));
                            var updatedProjData = {
                                id: itemId,
                                type: 'project',
                                category_id: parseInt(itemCatId, 10),
                                name: itemName,
                                link_url: '',
                                link_target: '_blank',
                                webhook_url: fd.get('webhook_url') || '',
                                created_by: rowCreatorId,
                                collaborators: nextCollaborators
                            };
                            $row.find('.btn-edit-item-trigger')
                                .removeAttr('onclick')
                                .data('item-data', updatedProjData)
                                .attr('data-item-json', JSON.stringify(updatedProjData));
                        }
                    }
                } else {
                    var safeItemName = esc(itemName);
                    var curUserName = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) ? (CURRENT_USER.name || CURRENT_USER.email || '-') : '-';
                    var curUserId = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) ? CURRENT_USER.id : 0;
                    var newCollabStr = savedCollaborators || '';
                    var canUploadNewItem = canCurrentUserEditItemByOwners(newCollabStr);
                    if (itemType === 'link') {
                        var $lTableBody = $('#overviewTableLinks tbody');
                        if ($lTableBody.length) {
                            $lTableBody.find('tr:not([data-item-id])').remove();
                            var linkUrl = fd.get('link_url') || '';
                            var linkTarget = fd.get('link_target') || '_blank';
                            var targetText = (linkTarget === '_blank')
                                ? (typeof t === 'function' ? t('admin.proj.open_new_tab', null, '新标签页') : '新标签页')
                                : (typeof t === 'function' ? t('admin.proj.open_embed', null, '内嵌预览') : '内嵌预览');
                            var tipCopyLink2 = esc(typeof t === 'function' ? t('admin.item.copy_link_tip', null, '复制链接') : '复制链接');
                            var tipMoveUp2 = esc(typeof t === 'function' ? t('common.move_up', null, '上移') : '上移');
                            var tipMoveDown2 = esc(typeof t === 'function' ? t('common.move_down', null, '下移') : '下移');
                            var tipEditProps2 = esc(typeof t === 'function' ? t('admin.proj.edit_props_tip', null, '编辑属性') : '编辑属性');
                            var tipDel2 = esc(typeof t === 'function' ? t('common.delete', null, '删除') : '删除');
                            var targetBadgeStyle = (linkTarget === '_blank') ? 'background:var(--primary-subtle);color:var(--primary);border:1px solid var(--primary-border);' : 'background:var(--canvas);color:var(--text-3);border:1px solid var(--border);';
                            var newLinkData = {
                                id: itemId,
                                type: 'link',
                                category_id: parseInt(itemCatId, 10),
                                name: itemName,
                                link_url: linkUrl,
                                link_target: linkTarget,
                                webhook_url: '',
                                created_by: curUserId,
                                collaborators: newCollabStr
                            };
                            var newLinkRowHtml = '<tr id="admin-item-row-' + itemId + '" data-item-id="' + itemId + '" data-cat-id="' + itemCatId + '" data-name="' + safeItemName + '" data-type="link" data-created-by="' + curUserId + '" data-creator-name="' + esc(curUserName) + '" data-collaborators="' + esc(newCollabStr) + '" data-can-edit="1" style="border-bottom:1px solid var(--border);">' +
                                '<td style="padding:9px 12px;font-weight:600;color:var(--text-1);"><i class="ri-external-link-line" style="color:var(--primary);margin-right:4px;font-size:14px;vertical-align:-1px;"></i>' + safeItemName + '</td>' +
                                '<td style="padding:9px 12px;color:var(--text-2);">' + esc(catText) + '</td>' +
                                '<td style="padding:9px 12px;"><span class="badge-tag" style="' + targetBadgeStyle + 'font-size:11px;">' + esc(targetText) + '</span></td>' +
                                '<td style="padding:9px 12px;max-width:260px;">' +
                                    '<div style="display:flex;align-items:center;gap:6px;">' +
                                        '<a href="' + esc(linkUrl) + '" target="_blank" rel="noopener noreferrer" style="color:var(--primary);text-decoration:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;max-width:200px;" title="' + esc(linkUrl) + '">' + esc(linkUrl || '-') + '</a>' +
                                        (linkUrl ? '<button type="button" class="btn-act btn-copy-url" data-url="' + esc(linkUrl) + '" title="' + tipCopyLink2 + '"><span class="duo-icon-slot" data-duo-icon="copy"><i class="ri-file-copy-line duo-rest-icon"></i></span></button>' : '') +
                                    '</div>' +
                                '</td>' +
                                '<td style="padding:9px 12px;color:var(--text-2);">' + esc(curUserName) + '</td>' +
                                '<td style="padding:9px 12px;text-align:right;white-space:nowrap;">' +
                                    '<button type="button" class="btn-act link-order-btn btn-link-move-up" style="display:none;margin-right:2px;" onclick="moveItemOrder(this, -1)" title="' + tipMoveUp2 + '"><i class="ri-arrow-up-s-line"></i></button>' +
                                    '<button type="button" class="btn-act link-order-btn btn-link-move-down" style="display:none;margin-right:6px;" onclick="moveItemOrder(this, 1)" title="' + tipMoveDown2 + '"><i class="ri-arrow-down-s-line"></i></button>' +
                                    '<button type="button" class="btn-act btn-edit-item-trigger" data-item-json="' + esc(JSON.stringify(newLinkData)) + '" title="' + tipEditProps2 + '"><span class="duo-icon-slot" data-duo-icon="pencil"><i class="ri-edit-line duo-rest-icon"></i></span></button> ' +
                                    '<button type="button" class="btn-act" onclick="deleteItem(' + itemId + ')" title="' + tipDel2 + '"><span class="duo-icon-slot" data-duo-icon="trash"><i class="ri-delete-bin-line duo-rest-icon"></i></span></button>' +
                                '</td>' +
                            '</tr>';
                            insertItemRowInOrder($lTableBody, newLinkRowHtml, itemCatId);
                            switchOverviewSubTab('links');
                            var curLinkFilter = parseInt($('#filterLinkCategory').val() || 0, 10);
                            if (curLinkFilter > 0) filterLinksByCategory(curLinkFilter);
                        }
                    } else {
                        var $pTableBody = $('#overviewTableProjects tbody');
                        if ($pTableBody.length) {
                            $pTableBody.find('tr:not([data-item-id])').remove();
                            var verZeroLabel = esc(typeof t === 'function' ? t('ver.count_btn', { n: 0 }, '0 个版本') : '0 个版本');
                            var tipMoveUp3 = esc(typeof t === 'function' ? t('common.move_up', null, '上移') : '上移');
                            var tipMoveDown3 = esc(typeof t === 'function' ? t('common.move_down', null, '下移') : '下移');
                            var tipPubNew3 = esc(typeof t === 'function' ? t('workspace.publish_new_ver', null, '发布新版本') : '发布新版本');
                            var tipEditProps3 = esc(typeof t === 'function' ? t('admin.proj.edit_props_tip', null, '编辑属性') : '编辑属性');
                            var tipDel3 = esc(typeof t === 'function' ? t('common.delete', null, '删除') : '删除');
                            var newProjData = {
                                id: itemId,
                                type: 'project',
                                category_id: parseInt(itemCatId, 10),
                                name: itemName,
                                link_url: '',
                                link_target: '_blank',
                                webhook_url: fd.get('webhook_url') || '',
                                created_by: curUserId,
                                collaborators: newCollabStr
                            };
                            var newRowHtml = '<tr id="admin-item-row-' + itemId + '" data-item-id="' + itemId + '" data-cat-id="' + itemCatId + '" data-name="' + safeItemName + '" data-type="project" data-created-by="' + curUserId + '" data-creator-name="' + esc(curUserName) + '" data-collaborators="' + esc(newCollabStr) + '" data-can-edit="' + (canUploadNewItem ? '1' : '0') + '" data-can-config="1" style="border-bottom:1px solid var(--border);">' +
                                '<td style="padding:9px 12px;font-weight:600;color:var(--text-1);">' + safeItemName + '</td>' +
                                '<td style="padding:9px 12px;color:var(--text-2);">' + esc(catText) + '</td>' +
                                '<td style="padding:9px 12px;color:var(--text-2);">' + renderItemOwnersCellHtml(newCollabStr, curUserName) + '</td>' +
                                '<td style="padding:9px 12px;"><span class="badge-ver">-</span></td>' +
                                '<td style="padding:9px 12px;"><button type="button" class="btn-cancel btn-sm btn-table-ver" onclick="openVersionManageModal(' + itemId + ')"><span class="duo-icon-slot" data-duo-icon="history"><i class="ri-history-line duo-rest-icon"></i></span> ' + verZeroLabel + '</button></td>' +
                                '<td style="padding:9px 12px;text-align:right;white-space:nowrap;">' +
                                    '<button type="button" class="btn-act project-order-btn btn-proj-move-up" style="display:none;margin-right:2px;" onclick="moveItemOrder(this, -1)" title="' + tipMoveUp3 + '"><i class="ri-arrow-up-s-line"></i></button>' +
                                    '<button type="button" class="btn-act project-order-btn btn-proj-move-down" style="display:none;margin-right:6px;" onclick="moveItemOrder(this, 1)" title="' + tipMoveDown3 + '"><i class="ri-arrow-down-s-line"></i></button>' +
                                    (canUploadNewItem ? '<button type="button" class="btn-act" onclick="openUploadModal(' + itemId + ')" title="' + tipPubNew3 + '"><span class="duo-icon-slot" data-duo-icon="cloud-upload"><i class="ri-upload-cloud-line duo-rest-icon"></i></span></button> ' : '') +
                                    '<button type="button" class="btn-act btn-edit-item-trigger" data-item-json="' + esc(JSON.stringify(newProjData)) + '" title="' + tipEditProps3 + '"><span class="duo-icon-slot" data-duo-icon="pencil"><i class="ri-edit-line duo-rest-icon"></i></span></button> ' +
                                    '<button type="button" class="btn-act" onclick="deleteItem(' + itemId + ')" title="' + tipDel3 + '"><span class="duo-icon-slot" data-duo-icon="trash"><i class="ri-delete-bin-line duo-rest-icon"></i></span></button>' +
                                '</td>' +
                            '</tr>';
                            insertItemRowInOrder($pTableBody, newRowHtml, itemCatId);
                            switchOverviewSubTab('projects');
                            var curProjFilter = parseInt($('#filterProjectCategory').val() || 0, 10);
                            if (curProjFilter > 0) filterProjectsByCategory(curProjFilter);
                        }
                    }
                }
            } else {
                if (typeof isAdminConsoleOpen === 'function' && !isAdminConsoleOpen() && typeof window !== 'undefined' && window.location) {
                    window.location.hash = '#item=' + itemId;
                    window.location.reload();
                }
            }
        } else {
            showToast(res.message || (typeof t === 'function' ? t('common.save_failed', null, '保存失败') : '保存失败'), 'error');
        }
    }).catch(function(err) {
        if (btn) btn.disabled = false;
        showToast((err && err.message) ? err.message : (typeof t === 'function' ? t('common.network_error', null, '网络异常，请重试') : '网络异常，请重试'), 'error');
    });
}

function deleteItem(itemId) {
    showConfirm({
        title: (typeof t === 'function' ? t('admin.item.delete_title', null, '删除项目') : '删除项目'),
        message: (typeof t === 'function' ? t('admin.item.delete_confirm', null, '确定删除该项目及所有版本？') : '确定删除该项目及所有版本？'),
        confirmText: (typeof t === 'function' ? t('admin.item.delete_btn', null, '删除项目') : '删除项目'),
        isDanger: true,
        onConfirm: function() {
            var fd = new FormData();
            fd.append('id', itemId);
            adminFetch('item_delete', fd).then(function(res) {
                if (res.success) {
                    showToast((typeof t === 'function' ? t('admin.item.deleted', null, '已删除') : '已删除'), 'success');
                    if (isAdminConsoleOpen()) {
                        markAdminConsoleChanged();
                        var $targetRow = $('#admin-item-row-' + itemId);
                        $targetRow.remove();
                        syncUploadModalRemoveItem(itemId);
                        syncDashboardRemoveProject(itemId);
                        var $pRows = $('#overviewTableProjects tbody tr[data-item-id]');
                        if (!$pRows.length) {
                            $('#overviewTableProjects tbody').html('<tr class="empty-projects-row"><td colspan="6" style="padding:44px 20px;text-align:center;">' +
                                getConsoleProjectEmptySvg() +
                                '<div style="font-weight:600;font-size:13.5px;color:var(--text-1);margin-top:10px;">' + esc(typeof t === 'function' ? t('admin.proj.empty_title', null, '暂无原型项目') : '暂无原型项目') + '</div>' +
                                '<div style="font-size:12px;color:var(--text-3);margin-top:3px;margin-bottom:14px;">' + esc(typeof t === 'function' ? t('admin.proj.empty_desc', null, '万事俱备，点击下方创建团队的第一份图纸') : '万事俱备，点击下方创建团队的第一份图纸') + '</div>' +
                                '<button type="button" class="btn-primary btn-sm" onclick="openItemModal(0, 0, \'project\')"><span class="duo-icon-slot" data-duo-icon="circle-plus"><i class="ri-add-line duo-rest-icon"></i></span> ' + esc(typeof t === 'function' ? t('workspace.new_project', null, '新建项目') : '新建项目') + '</button>' +
                            '</td></tr>');
                        }
                        var $lRows = $('#overviewTableLinks tbody tr[data-item-id]');
                        if (!$lRows.length) {
                            $('#overviewTableLinks tbody').html('<tr class="empty-links-row"><td colspan="6" style="padding:44px 20px;text-align:center;">' +
                                getConsoleLinkEmptySvg() +
                                '<div style="font-weight:600;font-size:13.5px;color:var(--text-1);margin-top:10px;">' + esc(typeof t === 'function' ? t('admin.proj.empty_links_title', null, '暂无外部链接') : '暂无外部链接') + '</div>' +
                                '<div style="font-size:12px;color:var(--text-3);margin-top:3px;margin-bottom:14px;">' + esc(typeof t === 'function' ? t('admin.proj.empty_links_desc', null, '将 Figma、蓝湖、飞书文档或外部演示地址收纳至此，统一看板索引') : '将 Figma、蓝湖、飞书文档或外部演示地址收纳至此，统一看板索引') + '</div>' +
                                '<button type="button" class="btn-primary btn-sm" onclick="openItemModal(0, 0, \'link\')"><span class="duo-icon-slot" data-duo-icon="circle-plus"><i class="ri-add-line duo-rest-icon"></i></span> ' + esc(typeof t === 'function' ? t('workspace.new_link', null, '新建外链') : '新建外链') + '</button>' +
                            '</td></tr>');
                        }
                    } else {
                        window.location.reload();
                    }
                } else {
                    showToast(res.message || (typeof t === 'function' ? t('admin.item.delete_failed', null, '删除失败') : '删除失败'), 'error');
                }
            });
        }
    });
}

/* ===================== 4. 用户管理 (邮箱 + 姓名二元架构，所有权交接机制) ===================== */
var cachedUsersMap = {};

function loadUserList() {
    var tbody = document.getElementById('userTableBody');
    fetch('api.php?action=user_list')
    .then(function(r) { return r.json(); })
    .then(function(res) {
        if (!res.success) {
            showToast(res.message || (typeof t === 'function' ? t('admin.users.load_failed_retry', null, '获取成员列表失败，请重试') : '获取成员列表失败，请重试'), 'warning');
            if (tbody && tbody.children.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--danger);"><i class="ri-error-warning-line"></i> ' + esc(res.message || (typeof t === 'function' ? t('admin.users.load_failed', null, '获取成员列表失败') : '获取成员列表失败')) + ' <a href="javascript:void(0)" onclick="loadUserList()" style="color:var(--primary);margin-left:8px;">' + esc(typeof t === 'function' ? t('common.retry', null, '重试') : '重试') + '</a></td></tr>';
            }
            return;
        }
        cachedUsersMap = {};
        if (!res.data || res.data.length === 0) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--text-3);">' + esc(typeof t === 'function' ? t('admin.users.empty', null, '暂无团队成员数据') : '暂无团队成员数据') + '</td></tr>';
            return;
        }
        var html = '';
        var isCurAdmin = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.role === 'admin');
        var isCurOwner = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER && (CURRENT_USER.is_owner === 1 || CURRENT_USER.is_owner === '1'));
        if (isCurAdmin) {
            loadPendingUsers();
        }
        var roleOwner = esc(typeof t === 'function' ? t('common.role.owner', null, '主管理员') : '主管理员');
        var roleAdmin = esc(typeof t === 'function' ? t('common.role.admin', null, '管理员') : '管理员');
        var roleViewer = esc(typeof t === 'function' ? t('common.role.viewer', null, '审阅人') : '审阅人');
        var roleEditor = esc(typeof t === 'function' ? t('common.role.editor', null, '协作者') : '协作者');
        var lblDisabled = esc(typeof t === 'function' ? t('common.disabled', null, '已停用') : '已停用');
        var lblEnabled = esc(typeof t === 'function' ? t('common.enabled', null, '已启用') : '已启用');
        var lblUnnamed = (typeof t === 'function' ? t('common.unnamed', null, '未命名') : '未命名');
        var tipBot = esc(typeof t === 'function' ? t('admin.users.bot_configured_tip', null, '已配置个人机器人 Webhook') : '已配置个人机器人 Webhook');
        var tipTransfer = esc(typeof t === 'function' ? t('admin.users.transfer_owner_tip', null, '移交主管理员所有权') : '移交主管理员所有权');
        var tipHandover = esc(typeof t === 'function' ? t('admin.users.handover_tip', null, '工作交接') : '工作交接');
        var tipEditUser = esc(typeof t === 'function' ? t('admin.users.edit_user_tip', null, '编辑成员信息') : '编辑成员信息');
        var tipDelUser = esc(typeof t === 'function' ? t('admin.users.delete_user_tip', null, '删除用户') : '删除用户');
        res.data.forEach(function(u) {
            cachedUsersMap[u.id] = u;
            var isTargetOwner = (u.is_owner === 1 || u.is_owner === '1');
            var roleBadge = isTargetOwner 
                ? '<span class="badge-tag badge-role-owner"><i class="ri-vip-crown-2-line"></i> ' + roleOwner + '</span>'
                : ((u.role === 'admin') ? '<span class="badge-tag badge-role-admin">' + roleAdmin + '</span>' : ((u.role === 'viewer') ? '<span class="badge-tag badge-role-viewer">' + roleViewer + '</span>' : '<span class="badge-tag badge-role-editor">' + roleEditor + '</span>'));
            
            var statusBadge = (parseInt(u.status, 10) === 3 || parseInt(u.status, 10) === 0) ? '<span class="badge-tag badge-status-off">' + lblDisabled + '</span>' : '';
            var nameText = esc(u.name || u.display_name || lblUnnamed);
            var emailText = esc(u.email || u.username || '-');
            var deptText = esc(u.department || u.apply_remark || '-');
            var versionCount = parseInt(u.published_version_count || 0, 10);
            var projectCount = parseInt(u.published_project_count || 0, 10);
            var contribTip = esc(typeof t === 'function' ? t('admin.users.contrib_tip', { vers: versionCount, projs: projectCount }, versionCount + ' 个版本 · ' + projectCount + ' 个项目') : versionCount + ' 个版本 · ' + projectCount + ' 个项目');
            var webhookBadge = u.webhook_url ? '<i class="ri-robot-line" title="' + tipBot + '" style="font-size:12px;color:var(--primary);margin-left:5px;cursor:help;"></i>' : '';

            var actionButtons = '';
            if (isCurAdmin) {
                // 如果当前登录者是 Owner，且目标也是管理员（非自己），显示移交钥匙按钮
                var transferBtn = (isCurOwner && u.role === 'admin' && parseInt(CURRENT_USER.id, 10) !== parseInt(u.id, 10))
                    ? `<button class="btn-act" onclick="openTransferOwnerModal(${parseInt(u.id, 10)})" title="${tipTransfer}"><span class="duo-icon-slot" data-duo-icon="key"><i class="ri-key-2-line duo-rest-icon" style="color:var(--primary);"></i></span></button>`
                    : '';

                // 工作交接按钮 (只要是管理员，可交接成员名下负责的项目)
                var handoverBtn = `<button class="btn-act" onclick="openHandoverModal(${parseInt(u.id, 10)})" title="${tipHandover}"><span class="duo-icon-slot" data-duo-icon="arrow-left-right"><i class="ri-arrow-left-right-line duo-rest-icon" style="color:var(--primary);"></i></span></button>`;

                // 若目标是 Owner，且当前用户非 Owner，隐藏删除与编辑按钮以防篡权
                if (isTargetOwner && !isCurOwner) {
                    actionButtons = `<span style="color:var(--text-3);opacity:0.6;">—</span>`;
                } else {
                    actionButtons = `
                        ${transferBtn}
                        ${handoverBtn}
                        <button class="btn-act" onclick="openEditUserModal(${parseInt(u.id, 10)})" title="${tipEditUser}"><span class="duo-icon-slot" data-duo-icon="pencil"><i class="ri-edit-line duo-rest-icon"></i></span></button>
                        ${isTargetOwner ? '' : `<button class="btn-act" onclick="handleDeleteUser(${parseInt(u.id, 10)})" title="${tipDelUser}"><span class="duo-icon-slot" data-duo-icon="trash"><i class="ri-delete-bin-line duo-rest-icon"></i></span></button>`}
                    `;
                }
            } else {
                actionButtons = `<span style="font-size:12px;color:var(--text-3);">${(parseInt(u.status, 10) === 3 || parseInt(u.status, 10) === 0 ? lblDisabled : lblEnabled)}</span>`;
            }

            html += `
                <tr style="border-bottom:1px solid var(--border);">
                    <td style="padding:10px 12px;">
                        <div style="font-weight:600;font-size:13.5px;color:var(--text-1);display:flex;align-items:center;">
                            ${nameText} ${webhookBadge}
                        </div>
                        <div style="font-size:11.5px;color:var(--text-3);margin-top:2px;font-family:monospace;">${emailText}</div>
                    </td>
                    <td style="padding:10px 12px;">${roleBadge} ${statusBadge}</td>
                    <td style="padding:10px 12px;font-size:12.5px;">
                        <span title="${contribTip}"${versionCount > 0 ? ' style="font-weight:600;color:var(--text-1);"' : ' style="color:var(--text-3);"'}>${versionCount}/${projectCount}</span>
                    </td>
                    <td style="padding:10px 12px;color:var(--text-2);font-size:12.5px;">${deptText}</td>
                    <td style="padding:10px 12px;color:var(--text-3);font-size:12px;">${esc(u.created_at)}</td>
                    <td style="padding:10px 12px;text-align:right;">
                        ${actionButtons}
                    </td>
                </tr>
            `;
        });
        if (tbody) tbody.innerHTML = html;
        syncAuthorSelectOptions();
        syncAdminApprovalSelectOptions();
    }).catch(function(err) {
        showToast((typeof t === 'function' ? t('admin.users.net_load_failed', null, '网络异常，获取成员列表失败') : '网络异常，获取成员列表失败'), 'error');
        if (tbody && tbody.children.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--text-3);"><i class="ri-wifi-off-line"></i> ' + esc(typeof t === 'function' ? t('admin.users.net_load_failed', null, '网络异常，获取成员列表失败') : '网络异常，获取成员列表失败') + ' <a href="javascript:void(0)" onclick="loadUserList()" style="color:var(--primary);">' + esc(typeof t === 'function' ? t('common.retry', null, '重试') : '重试') + '</a></td></tr>';
        }
    });
}

function openAddUserModal() {
    var nameEl = document.getElementById('newName');
    if (nameEl) nameEl.value = '';
    var emailEl = document.getElementById('newEmail');
    if (emailEl) emailEl.value = '';
    var pwdEl = document.getElementById('newPassword');
    if (pwdEl) pwdEl.value = '';
    var deptEl = document.getElementById('newDepartment');
    if (deptEl) deptEl.value = '';
    var wbEl = document.getElementById('newWebhookUrl');
    if (wbEl) wbEl.value = '';
    var roleEl = document.getElementById('newRole');
    if (roleEl) roleEl.value = 'editor';
    if (typeof clearPasswordStrength === 'function') clearPasswordStrength(document.getElementById('addUserModal'));
    openModal('addUserModal', 'newName');
}

function showAddUserBox() {
    openAddUserModal();
}
window.openAddUserModal = openAddUserModal;
window.showAddUserBox = showAddUserBox;

function openEditUserModal(userId) {
    var u = cachedUsersMap[userId];
    if (!u) {
        showToast((typeof t === 'function' ? t('admin.users.not_found', null, '未找到该用户信息') : '未找到该用户信息'), 'warning');
        return;
    }
    document.getElementById('editUserId').value = u.id;
    document.getElementById('editUserTargetName').textContent = u.name || u.display_name || u.email;
    document.getElementById('editUserName').value = u.name || u.display_name || '';
    document.getElementById('editUserEmail').value = u.email || u.username || '';
    document.getElementById('editUserPassword').value = '';
    document.getElementById('editUserDepartment').value = u.department || u.apply_remark || '';
    
    var roleEl = document.getElementById('editUserRole');
    var statusEl = document.getElementById('editUserStatus');
    roleEl.value = u.role || 'editor';
    statusEl.value = (parseInt(u.status, 10) === 1) ? '1' : '0';

    // 若目标是 Owner，锁定不可更改角色和状态
    var isTargetOwner = (u.is_owner === 1 || u.is_owner === '1');
    roleEl.disabled = isTargetOwner;
    statusEl.disabled = isTargetOwner;

    if (document.getElementById('editUserWebhook')) {
        document.getElementById('editUserWebhook').value = u.webhook_url || '';
    }

    if (typeof clearPasswordStrength === 'function') clearPasswordStrength(document.getElementById('editUserModal'));
    openModal('editUserModal', 'editUserName');
}

function openEditUserBox(userId) {
    openEditUserModal(userId);
}
window.openEditUserModal = openEditUserModal;
window.openEditUserBox = openEditUserBox;

function handleUpdateUser(e) {
    e.preventDefault();
    var uid = parseInt(document.getElementById('editUserId').value, 10);
    var nameInput = document.getElementById('editUserName');
    var name = nameInput ? nameInput.value.trim() : '';
    var emailInput = document.getElementById('editUserEmail');
    var email = emailInput ? emailInput.value.trim() : '';
    var dept = document.getElementById('editUserDepartment').value.trim();
    var wbEl = document.getElementById('editUserWebhook');
    var wb = wbEl ? wbEl.value.trim() : '';

    if (!name || name.length > 20) {
        var msgBadName = (typeof t === 'function' ? t('admin.users.invalid_name_len', null, '请输入真实姓名（1~20 个字符）') : '请输入真实姓名（1~20 个字符）');
        if (typeof setFieldError === 'function' && nameInput) setFieldError(nameInput, null, msgBadName);
        else { showToast(msgBadName, 'warning'); if (nameInput) nameInput.focus(); }
        return;
    }
    var emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
    if (!email || !emailRegex.test(email)) {
        var msgBadEmail = (typeof t === 'function' ? t('admin.users.invalid_email', null, '工作邮箱格式不正确，请输入有效的邮箱地址') : '工作邮箱格式不正确，请输入有效的邮箱地址');
        if (typeof setFieldError === 'function' && emailInput) setFieldError(emailInput, null, msgBadEmail);
        else { showToast(msgBadEmail, 'warning'); if (emailInput) emailInput.focus(); }
        return;
    }

    var fd = new FormData();
    fd.append('id', uid);
    fd.append('name', name);
    fd.append('email', email);
    fd.append('department', dept);
    fd.append('role', document.getElementById('editUserRole').value);
    fd.append('status', document.getElementById('editUserStatus').value);
    if (wbEl) {
        fd.append('webhook_url', wb);
    }
    var passwordInput = document.getElementById('editUserPassword');
    var newPwd = passwordInput.value;
    if (newPwd) {
        if (typeof showPasswordLengthError === 'function'
            ? showPasswordLengthError(passwordInput)
            : (typeof passwordLengthError === 'function' && passwordLengthError(newPwd))) {
            if (typeof showPasswordLengthError !== 'function') {
                showToast(passwordLengthError(newPwd), 'warning');
                passwordInput.focus();
            }
            return;
        }
        fd.append('new_password', newPwd);
    }

    adminFetch('user_update', fd).then(function(res) {
        if (res.success) {
            if (wbEl) syncAdminNotificationWebhookState(uid, wb);
            closeModal('editUserModal');
            showToast((typeof t === 'function' ? t('admin.users.updated_toast', null, '成员信息已更新') : '成员信息已更新'), 'success');
            if (isAdminConsoleOpen()) {
                markAdminConsoleChanged();
            }
            loadUserList();

            // 若修改的对象是当前登录的管理员自己，实时双向同步个人设置与前台状态
            if (typeof CURRENT_USER !== 'undefined' && CURRENT_USER && parseInt(CURRENT_USER.id, 10) === uid) {
                CURRENT_USER.name = name;
                CURRENT_USER.display_name = name;
                CURRENT_USER.email = email;
                CURRENT_USER.webhook_url = wb;

                var myWbInput = document.getElementById('myWebhookUrl');
                if (myWbInput) myWbInput.value = wb;

                var myNameInput = document.getElementById('myDisplayName');
                if (myNameInput) myNameInput.value = name;

                var headerName = document.getElementById('myProfileHeaderName');
                if (headerName) headerName.textContent = name;

                var sidebarName = document.querySelector('.user-badge span');
                if (sidebarName) sidebarName.textContent = name;
            }
        } else {
            var errMsg = res.message || (typeof t === 'function' ? t('admin.users.update_failed', null, '更新用户信息失败') : '更新用户信息失败');
            if (typeof setFieldError === 'function') {
                if (/邮箱|信箱|email/i.test(errMsg) && emailInput) {
                    setFieldError(emailInput, null, errMsg);
                    return;
                }
                if (/姓名|name/i.test(errMsg) && nameInput) {
                    setFieldError(nameInput, null, errMsg);
                    return;
                }
                if (newPwd && passwordInput && /密码|密碼|字符|字元|字节|位元組|password|character|byte/i.test(errMsg)) {
                    setFieldError(passwordInput, null, errMsg);
                    return;
                }
            }
            showToast(errMsg, 'error');
        }
    });
}

function handleCreateUser(e) {
    e.preventDefault();
    var emailInput = document.getElementById('newEmail');
    var email = (typeof getResolvedEmail === 'function') ? getResolvedEmail('newEmail') : (emailInput ? emailInput.value.trim() : '');
    var nameInput = document.getElementById('newName');
    var name = nameInput ? nameInput.value.trim() : '';
    var passwordInput = document.getElementById('newPassword');
    var password = passwordInput.value;
    var role = document.getElementById('newRole').value;
    var dept = document.getElementById('newDepartment').value.trim();
    var wbEl = document.getElementById('newWebhookUrl');
    var wb = wbEl ? wbEl.value.trim() : '';

    var fixedDomain = emailInput ? (emailInput.getAttribute('data-fixed-domain') || '') : '';
    var emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
    if (!name || name.length > 20) {
        var msgNameLen = (typeof t === 'function' ? t('admin.users.invalid_name_len', null, '请输入真实姓名（1~20 个字符）') : '请输入真实姓名（1~20 个字符）');
        if (typeof setFieldError === 'function' && nameInput) setFieldError(nameInput, null, msgNameLen);
        else { showToast(msgNameLen, 'warning'); if (nameInput) nameInput.focus(); }
        return;
    }
    if (!fixedDomain && email.indexOf('@') === -1) {
        var msgFullEmail = (typeof t === 'function' ? t('auth.enter_full_email', null, '请输入完整工作邮箱，如 name@company.com') : '请输入完整工作邮箱，如 name@company.com');
        if (typeof setFieldError === 'function' && emailInput) setFieldError(emailInput, null, msgFullEmail);
        else { showToast(msgFullEmail, 'warning'); if (emailInput) emailInput.focus(); }
        return;
    }
    if (!emailRegex.test(email)) {
        var msgInvEmail = (typeof t === 'function' ? t('admin.users.invalid_email', null, '工作邮箱格式不正确，请输入有效的邮箱地址') : '工作邮箱格式不正确，请输入有效的邮箱地址');
        if (typeof setFieldError === 'function' && emailInput) setFieldError(emailInput, null, msgInvEmail);
        else { showToast(msgInvEmail, 'warning'); if (emailInput) emailInput.focus(); }
        return;
    }
    if (typeof showPasswordLengthError === 'function'
        ? showPasswordLengthError(passwordInput)
        : (typeof passwordLengthError === 'function' && passwordLengthError(password))) {
        if (typeof showPasswordLengthError !== 'function') {
            showToast(passwordLengthError(password), 'warning');
            passwordInput.focus();
        }
        return;
    }

    var fd = new FormData();
    fd.append('email', email);
    fd.append('name', name);
    fd.append('password', password);
    fd.append('role', role);
    fd.append('department', dept);
    if (wbEl) {
        fd.append('webhook_url', wb);
    }

    adminFetch('user_add', fd).then(function(res) {
        if (res.success) {
            document.getElementById('newName').value = '';
            document.getElementById('newEmail').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('newDepartment').value = '';
            if (wbEl) wbEl.value = '';
            closeModal('addUserModal');
            showToast((typeof t === 'function' ? t('admin.users.added_toast', null, '成员已添加') : '成员已添加'), 'success');
            if (isAdminConsoleOpen()) {
                markAdminConsoleChanged();
            }
            loadUserList();
        } else {
            showToast(res.message || (typeof t === 'function' ? t('admin.users.add_failed', null, '添加成员失败') : '添加成员失败'), 'error');
        }
    });
}

function openTransferOwnerModal(targetUserId) {
    var targetName = (cachedUsersMap[targetUserId] || {}).name || '';
    document.getElementById('transferTargetUserId').value = targetUserId;
    document.getElementById('transferTargetUserName').textContent = targetName;
    document.getElementById('transferConfirmPwd').value = '';
    if (typeof clearPasswordStrength === 'function') clearPasswordStrength(document.getElementById('transferOwnerModal'));
    openModal('transferOwnerModal', 'transferConfirmPwd');
}

function handleDoTransferOwner(e) {
    e.preventDefault();
    var targetId = parseInt(document.getElementById('transferTargetUserId').value, 10);
    var pwdInput = document.getElementById('transferConfirmPwd');
    var pwd = pwdInput ? pwdInput.value : '';
    var btn = document.getElementById('btnTransferSubmit');
    if (!pwd) {
        var msgEnterPwd = (typeof t === 'function' ? t('admin.transfer.enter_pwd', null, '请输入当前密码以确认移交') : '请输入当前密码以确认移交');
        if (typeof setFieldError === 'function' && pwdInput) setFieldError(pwdInput, null, msgEnterPwd);
        else { showToast(msgEnterPwd, 'warning'); if (pwdInput) pwdInput.focus(); }
        return;
    }
    btn.disabled = true;
    btn.innerText = (typeof t === 'function' ? t('admin.transfer.submitting', null, '正在移交...') : '正在移交...');

    var fd = new FormData();
    fd.append('target_user_id', targetId);
    fd.append('password', pwd);

    adminFetch('transfer_ownership', fd).then(function(res) {
        btn.disabled = false;
        btn.innerText = (typeof t === 'function' ? t('admin.transfer.submit', null, '确认移交') : '确认移交');
        if (res.success) {
            closeModal('transferOwnerModal');
            showToast(res.message || (typeof t === 'function' ? t('admin.transfer.success', null, '所有权已成功移交') : '所有权已成功移交'), 'success', 3000, true);
            setTimeout(function() {
                window.location.reload();
            }, 1200);
        } else {
            var errMsg = res.message || (typeof t === 'function' ? t('admin.transfer.failed', null, '移交失败') : '移交失败');
            if (typeof setFieldError === 'function' && pwdInput && /密码|密碼|password/i.test(errMsg)) {
                setFieldError(pwdInput, null, errMsg);
            } else {
                showToast(errMsg, 'error');
            }
        }
    }).catch(function() {
        btn.disabled = false;
        btn.innerText = (typeof t === 'function' ? t('admin.transfer.submit', null, '确认移交') : '确认移交');
        showToast((typeof t === 'function' ? t('common.network_req_error', null, '网络请求异常') : '网络请求异常'), 'error');
    });
}

// 工作交接弹窗
function openHandoverModal(fromId) {
    var fromUser = cachedUsersMap[fromId] || {};
    var fromName = fromUser.name || '';
    var count = parseInt(fromUser.item_count || 0, 10);
    if (!count || parseInt(count, 10) <= 0) {
        showToast((typeof t === 'function' ? t('admin.handover.no_items', null, '该成员暂无需要交接的项目或链接') : '该成员暂无需要交接的项目或链接'), 'info', 2500);
        return;
    }
    document.getElementById('handoverFromUserId').value = fromId;
    var descEl = document.getElementById('handoverDescText');
    if (descEl) {
        descEl.innerHTML = (typeof t === 'function' ? t('admin.handover.desc', { name: esc(fromName), count: count }, '交接 <strong>' + esc(fromName) + '</strong> 关联的 <strong>' + count + '</strong> 个项目或链接的归属及指定协作权限。') : '交接 <strong>' + esc(fromName) + '</strong> 关联的 <strong>' + count + '</strong> 个项目或链接的归属及指定协作权限。');
    }
    var $select = $('#handoverToUserId');
    $select.empty().append('<option value="">' + esc(typeof t === 'function' ? t('admin.handover.select_target', null, '-- 选择接管成员 --') : '-- 选择接管成员 --') + '</option>');

    // 过滤出除当前用户外的管理员或协作者 (且状态正常)
    for (var uid in cachedUsersMap) {
        var u = cachedUsersMap[uid];
        if (parseInt(u.id, 10) !== parseInt(fromId, 10) && (u.role === 'admin' || u.role === 'editor') && parseInt(u.status, 10) === 1) {
            var rLabel = u.role === 'admin' ? (typeof t === 'function' ? t('common.role.admin', null, '管理员') : '管理员') : (typeof t === 'function' ? t('common.role.editor', null, '协作者') : '协作者');
            var uLabel = (u.name || u.email) + ' (' + rLabel + ')';
            $select.append($('<option>').val(u.id).text(uLabel));
        }
    }

    var deactCb = document.getElementById('handoverDeactivateFrom');
    if (deactCb) deactCb.checked = false;

    openModal('userHandoverModal', 'handoverToUserId');
}

function handleUserHandover(e) {
    e.preventDefault();
    var fromId = parseInt(document.getElementById('handoverFromUserId').value, 10) || 0;
    var toId = parseInt(document.getElementById('handoverToUserId').value, 10) || 0;
    var deact = document.getElementById('handoverDeactivateFrom').checked ? 1 : 0;
    var btn = document.getElementById('btnHandoverSubmit');

    if (!toId) {
        showToast((typeof t === 'function' ? t('admin.handover.select_warn', null, '请选择接管成员') : '请选择接管成员'), 'warning');
        return;
    }
    if (btn) btn.disabled = true;

    var fd = new FormData();
    fd.append('from_user_id', fromId);
    fd.append('to_user_id', toId);
    fd.append('deactivate_from', deact);

    adminFetch('user_handover', fd).then(function(res) {
        if (btn) btn.disabled = false;
        if (res.success) {
            showToast(res.message || (typeof t === 'function' ? t('admin.handover.success', null, '工作交接成功') : '工作交接成功'), 'success');
            closeModal('userHandoverModal');
            loadUserList();

            // 深度热同步：遍历更新项目管理表格行与前台树节点
            var toUser = (typeof cachedUsersMap !== 'undefined' && cachedUsersMap[toId]) ? cachedUsersMap[toId] : null;
            var toName = toUser ? (toUser.name || toUser.email || (typeof t === 'function' ? t('admin.handover.target_label', null, '接管成员') : '接管成员')) : (typeof t === 'function' ? t('admin.handover.target_label', null, '接管成员') : '接管成员');

            // 1. 同步控制中心项目列表与外链列表 (无需刷新页面，即时全景热更新)
            $('#overviewTableProjects tbody tr[data-item-id], #overviewTableLinks tbody tr[data-item-id]').each(function() {
                var $row = $(this);
                var rowCreatedBy = parseInt($row.attr('data-created-by'), 10);
                if (isNaN(rowCreatedBy)) {
                    var $btn = $row.find('.btn-edit-item-trigger');
                    var d = $btn.data('item-data');
                    if (d && d.created_by) rowCreatedBy = parseInt(d.created_by, 10);
                }

                var rawCollab = String($row.attr('data-collaborators') || '');
                var collabArr = parseOwnerIds(rawCollab);
                if (rowCreatedBy === fromId || collabArr.indexOf(String(fromId)) !== -1) {
                    if (rowCreatedBy === fromId) {
                        $row.attr('data-created-by', toId).data('created-by', toId);
                        $row.attr('data-creator-name', toName).data('creator-name', toName);
                    }
                    if (collabArr.length > 0 && collabArr.indexOf(String(fromId)) !== -1) {
                        var seenCollab = {};
                        var replacedArr = [];
                        collabArr.forEach(function(cid) {
                            var mapped = (cid === String(fromId)) ? String(toId) : cid;
                            if (!seenCollab[mapped]) {
                                seenCollab[mapped] = true;
                                replacedArr.push(mapped);
                            }
                        });
                        rawCollab = replacedArr.join(',');
                        $row.attr('data-collaborators', rawCollab).data('collaborators', rawCollab);
                    }

                    // 在项目表格中，第 3 列为负责人 (列索引 2: 0=名称, 1=文件夹, 2=负责人)
                    // 在外链表格中，第 5 列为负责人 (列索引 4)
                    var isLinkTable = $row.closest('#overviewTableLinks').length > 0;
                    var creatorName = String($row.attr('data-creator-name') || '');
                    if (isLinkTable) $row.find('td').eq(4).text(creatorName || '-');
                    else $row.find('td').eq(2).html(renderItemOwnersCellHtml(rawCollab, creatorName));

                    // 更新编辑按钮上的数据与参数
                    var $editBtn = $row.find('.btn-edit-item-trigger');
                    if ($editBtn.length) {
                        var itemData = $editBtn.data('item-data');
                        if (!itemData) {
                            var jsonStr = $editBtn.attr('data-item-json');
                            if (jsonStr) {
                                try { itemData = JSON.parse(jsonStr); } catch(e) {}
                            }
                        }
                        if (itemData) {
                            if (rowCreatedBy === fromId) itemData.created_by = toId;
                            itemData.collaborators = rawCollab;
                            $editBtn.data('item-data', itemData).attr('data-item-json', JSON.stringify(itemData));
                        }
                        var onclickAttr = $editBtn.attr('onclick');
                        if (onclickAttr && onclickAttr.indexOf('openEditItemModal') !== -1) {
                            var json = onclickAttr.slice(onclickAttr.indexOf('(') + 1, onclickAttr.lastIndexOf(')'));
                            try {
                                var updatedItem = JSON.parse(json);
                                if (rowCreatedBy === fromId) updatedItem.created_by = toId;
                                updatedItem.collaborators = rawCollab;
                                $editBtn.removeAttr('onclick').data('item-data', updatedItem).attr('data-item-json', JSON.stringify(updatedItem));
                            } catch (e) {}
                        }
                    }
                }
            });

            // 2. 同步前台目录树节点与右侧顶部状态栏
            $('li.item-row').each(function() {
                var $node = $(this);
                var nodeCreatedBy = parseInt($node.attr('data-created-by'), 10);
                var nodeOwners = parseOwnerIds($node.attr('data-collaborators') || '');
                if (nodeOwners.indexOf(String(fromId)) !== -1) {
                    var nextOwners = nodeOwners.map(function(id) { return id === String(fromId) ? String(toId) : id; });
                    var normalizedOwners = parseOwnerIds(nextOwners.join(',')).join(',');
                    $node.attr('data-collaborators', normalizedOwners).data('collaborators', normalizedOwners);
                }
                if (nodeCreatedBy === fromId) {
                    $node.attr('data-created-by', toId).data('created-by', toId);
                    $node.attr('data-creator-name', toName).data('creator-name', toName);

                    // 仅对无版本外链同步顶部当前负责人 (普通原型项目严格保留各版本的历史发版人快照)
                    if ($node.data('type') === 'link' && typeof currentSelectedItemId !== 'undefined' && parseInt(currentSelectedItemId, 10) === parseInt($node.attr('data-item-id'), 10)) {
                        var $barTime = $('#barTime');
                        if ($barTime.length) {
                            var curHtml = $barTime.html();
                            var fromUser = (typeof cachedUsersMap !== 'undefined' && cachedUsersMap[fromId]) ? cachedUsersMap[fromId] : null;
                            var fromName = fromUser ? (fromUser.name || fromUser.email) : '';
                            if (curHtml && fromName && curHtml.indexOf('@' + esc(fromName)) !== -1) {
                                $barTime.html(curHtml.replace('@' + esc(fromName), '@' + esc(toName)));
                            } else {
                                $barTime.html('<i class="ri-user-line" style="margin-right:3px;font-size:12px;opacity:0.85;"></i>@' + esc(toName)).show();
                            }
                        }
                    }
                }
            });

            // 3. 同步更新项目负责人多选候选列表中的停用/新增状态
            if (typeof cachedUsersMap !== 'undefined' && cachedUsersMap[fromId] && deact) {
                cachedUsersMap[fromId].status = 3;
            }
            if (typeof syncAuthorSelectOptions === 'function') {
                syncAuthorSelectOptions();
            }

            if (isAdminConsoleOpen()) {
                markAdminConsoleChanged();
            } else {
                setTimeout(function() { window.location.reload(); }, 1200);
            }
        } else {
            showToast(res.message || (typeof t === 'function' ? t('admin.handover.failed', null, '工作交接失败') : '工作交接失败'), 'error');
        }
    }).catch(function() {
        if (btn) btn.disabled = false;
        showToast((typeof t === 'function' ? t('admin.handover.net_failed', null, '网络异常，交接失败') : '网络异常，交接失败'), 'error');
    });
}

function handleDeleteUser(id) {
    showConfirm({
        title: (typeof t === 'function' ? t('admin.users.delete_title', null, '删除成员') : '删除成员'),
        message: (typeof t === 'function' ? t('admin.users.delete_confirm', null, '确定删除该成员账号？') : '确定删除该成员账号？'),
        confirmText: (typeof t === 'function' ? t('admin.users.delete_btn', null, '删除成员') : '删除成员'),
        isDanger: true,
        onConfirm: function() {
            var fd = new FormData();
            fd.append('id', id);
            adminFetch('user_delete', fd).then(function(res) {
                if (res.success) {
                    showToast((typeof t === 'function' ? t('admin.users.deleted_toast', null, '成员已删除') : '成员已删除'), 'success');
                    if (isAdminConsoleOpen()) {
                        markAdminConsoleChanged();
                    }
                    loadUserList();
                } else {
                    showToast(res.message || (typeof t === 'function' ? t('admin.users.delete_failed', null, '删除成员失败') : '删除成员失败'), 'error');
                }
            });
        }
    });
}

function switchUserSubTab(tab) {
    var btnActive = document.getElementById('subtab-btn-active-users');
    var btnPending = document.getElementById('subtab-btn-pending-users');
    var boxActive = document.getElementById('userBoxActive');
    var boxPending = document.getElementById('userBoxPending');
    var activeActions = document.getElementById('activeUserActions');

    if (tab === 'pending') {
        if (btnActive) btnActive.classList.remove('active');
        if (btnPending) btnPending.classList.add('active');
        if (boxActive) boxActive.style.display = 'none';
        if (boxPending) {
            boxPending.style.display = 'block';
            if (typeof triggerTabTransition === 'function') triggerTabTransition(boxPending);
        }
        if (activeActions) activeActions.style.display = 'none';
        loadPendingUsers();
    } else {
        if (btnPending) btnPending.classList.remove('active');
        if (btnActive) btnActive.classList.add('active');
        if (boxPending) boxPending.style.display = 'none';
        if (boxActive) {
            boxActive.style.display = 'block';
            if (typeof triggerTabTransition === 'function') triggerTabTransition(boxActive);
        }
        if (activeActions) activeActions.style.display = 'block';
        loadUserList();
    }
}

var pendingUsersRequest = null;
var pendingUsersRevision = 0;
var pendingUsersLoaded = false;

function setPendingUserCount(count) {
    window.PENDING_USER_COUNT = count;
    var display = count > 0 ? 'inline-block' : 'none';
    ['pendingUserBadge', 'pendingSubTabCount'].forEach(function(id) {
        var badge = document.getElementById(id);
        if (badge) {
            badge.textContent = count;
            badge.style.display = display;
        }
    });
    var dot = document.getElementById('adminSettingsDot');
    if (dot) dot.style.display = display;
}

function renderPendingUsers(users) {
    var tbody = document.getElementById('pendingUsersTbody');
    if (!tbody) return;
    if (users.length === 0) {
        if (!pendingUsersLoaded || tbody.querySelector('[data-pending-id]')) {
            tbody.innerHTML = '<tr><td colspan="5" style="padding:32px;text-align:center;color:var(--text-3);"><i class="ri-checkbox-circle-line" style="font-size:18px;vertical-align:middle;margin-right:4px;color:var(--success);"></i> ' + esc(typeof t === 'function' ? t('admin.users.pending_empty', null, '当前没有待审批的成员申请') : '当前没有待审批的成员申请') + '</td></tr>';
        }
        return;
    }

    // 保留仍待审批的行及角色下拉，更新列表时维持管理员当前的选择。
    var ids = new Set(users.map(function(user) { return String(user.id); }));
    var existing = new Map();
    Array.prototype.slice.call(tbody.rows).forEach(function(row) {
        var id = row.getAttribute('data-pending-id');
        if (ids.has(id)) existing.set(id, row);
        else tbody.removeChild(row);
    });
    var lblUnnamedPending = (typeof t === 'function' ? t('common.unnamed', null, '未命名') : '未命名');
    var lblRoleEditor = esc(typeof t === 'function' ? t('common.role.editor', null, '协作者') : '协作者');
    var lblRoleViewer = esc(typeof t === 'function' ? t('common.role.viewer', null, '审阅人') : '审阅人');
    var lblApprove = esc(typeof t === 'function' ? t('admin.users.approve_btn', null, '批准') : '批准');
    var lblReject = esc(typeof t === 'function' ? t('admin.users.reject_btn', null, '驳回') : '驳回');
    users.forEach(function(u, i) {
        var id = parseInt(u.id, 10);
        var row = existing.get(String(id));
        if (row) {
            if (row !== tbody.rows[i]) tbody.insertBefore(row, tbody.rows[i] || null);
            return;
        }
        row = tbody.insertRow(i);
        row.setAttribute('data-pending-id', id);
        row.style.borderBottom = '1px solid var(--border)';
        var nameText = esc(u.name || u.display_name || lblUnnamedPending);
        var emailText = esc(u.email || u.username || '-');
        var deptText = esc(u.department || u.apply_remark || '-');
        var requestedRole = (u.role === 'editor') ? 'editor' : 'viewer';
        var roleBadge = (requestedRole === 'editor')
            ? '<span class="badge-tag badge-role-editor">' + lblRoleEditor + '</span>'
            : '<span class="badge-tag badge-role-viewer">' + lblRoleViewer + '</span>';
        row.innerHTML = `
                    <td style="padding:10px 12px;">
                        <div style="font-weight:600;font-size:13.5px;color:var(--text-1);">${nameText}</div>
                        <div style="font-size:11.5px;color:var(--text-3);margin-top:2px;font-family:monospace;">${emailText}</div>
                    </td>
                    <td style="padding:10px 12px;color:var(--text-2);font-size:12.5px;">${deptText}</td>
                    <td style="padding:10px 12px;">${roleBadge}</td>
                    <td style="padding:10px 12px;color:var(--text-3);font-size:12px;">${esc(u.created_at || '-')}</td>
                    <td style="padding:10px 12px;text-align:right;white-space:nowrap;">
                        <select id="pendingRole_${id}" class="m-select-sm" style="margin-right:6px;">
                            <option value="viewer"${requestedRole === 'viewer' ? ' selected' : ''}>${lblRoleViewer}</option>
                            <option value="editor"${requestedRole === 'editor' ? ' selected' : ''}>${lblRoleEditor}</option>
                        </select>
                        <button type="button" class="btn-primary btn-sm" style="margin-right:6px;" onclick="handleApproveUser(${id})"><span class="duo-icon-slot" data-duo-icon="circle-check"><i class="ri-check-line duo-rest-icon"></i></span> ${lblApprove}</button>
                        <button type="button" class="btn-cancel btn-sm btn-danger-sm" onclick="handleRejectUser(${id})"><span class="duo-icon-slot" data-duo-icon="circle-x"><i class="ri-close-line duo-rest-icon"></i></span> ${lblReject}</button>
                    </td>
        `;
    });
}

function refreshPendingUsers(includeList) {
    if (typeof CURRENT_USER === 'undefined' || !CURRENT_USER || CURRENT_USER.role !== 'admin') return;
    var revision = pendingUsersRevision;
    if (pendingUsersRequest) {
        if (pendingUsersRequest.revision !== revision || (includeList && !pendingUsersRequest.includeList)) {
            return pendingUsersRequest.promise.then(function() { return refreshPendingUsers(includeList); });
        }
        return pendingUsersRequest.promise;
    }

    var fd = new FormData();
    if (!includeList) fd.set('count_only', '1');
    var request = { revision: revision, includeList: includeList };
    pendingUsersRequest = request;
    request.promise = adminFetch('pending_user_list', fd, false).then(function(res) {
        if (revision !== pendingUsersRevision) return;
        if (!res.success) throw new Error(res.message || (typeof t === 'function' ? t('admin.users.pending_load_failed', null, '加载待审批列表失败') : '加载待审批列表失败'));
        var count = includeList ? res.data.length : res.data.count;
        setPendingUserCount(count);
        if (includeList) {
            renderPendingUsers(res.data);
            pendingUsersLoaded = true;
        }
    }).catch(function(error) {
        if (!includeList || pendingUsersLoaded || revision !== pendingUsersRevision) return;
        var tbody = document.getElementById('pendingUsersTbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--danger);">' + esc(error.message || (typeof t === 'function' ? t('admin.users.pending_load_failed', null, '加载待审批列表失败') : '加载待审批列表失败')) + '</td></tr>';
    }).then(function() {
        pendingUsersRequest = null;
    });
    return request.promise;
}

function loadPendingUsers() {
    return refreshPendingUsers(true);
}

function refreshPendingUsersWhenVisible() {
    if (document.hidden) return;
    var showingList = isAdminConsoleOpen() && !!document.querySelector('#panel-users.active #subtab-btn-pending-users.active');
    refreshPendingUsers(showingList);
}

function handleApproveUser(id) {
    var roleSelect = document.getElementById('pendingRole_' + id);
    var role = roleSelect ? roleSelect.value : 'viewer';
    var fd = new FormData();
    fd.append('id', id);
    fd.append('role', role);
    adminFetch('approve_user', fd).then(function(res) {
        if (res.success) {
            showToast(res.message || (typeof t === 'function' ? t('admin.users.approved_toast', null, '已批准入驻') : '已批准入驻'), 'success');
            if (isAdminConsoleOpen()) {
                markAdminConsoleChanged();
            }
            pendingUsersRevision++;
            loadPendingUsers();
            loadUserList();
        } else {
            showToast(res.message || (typeof t === 'function' ? t('admin.users.approve_failed', null, '批准操作失败') : '批准操作失败'), 'error');
        }
    });
}

function handleRejectUser(id) {
    showConfirm({
        title: (typeof t === 'function' ? t('admin.users.reject_title', null, '驳回申请') : '驳回申请'),
        message: (typeof t === 'function' ? t('admin.users.reject_confirm', null, '确定驳回这条入驻申请？') : '确定驳回这条入驻申请？'),
        confirmText: (typeof t === 'function' ? t('admin.users.reject_confirm_btn', null, '确认驳回') : '确认驳回'),
        isDanger: true,
        onConfirm: function() {
            var fd = new FormData();
            fd.append('id', id);
            adminFetch('reject_user', fd).then(function(res) {
                if (res.success) {
                    showToast((typeof t === 'function' ? t('admin.users.rejected_toast', null, '已驳回申请') : '已驳回申请'), 'success');
                    if (isAdminConsoleOpen()) {
                        markAdminConsoleChanged();
                    }
                    pendingUsersRevision++;
                    loadPendingUsers();
                } else {
                    showToast(res.message || (typeof t === 'function' ? t('common.op_failed', null, '操作失败') : '操作失败'), 'error');
                }
            });
        }
    });
}

function handleTestWebhook(btnEl) {
    testAnyWebhook('settingGlobalWebhook', btnEl);
}

/* ===================== 6. 品牌与系统配置 ===================== */
function triggerFileInput(inputId) {
    var el = document.getElementById(inputId);
    if (el) el.click();
}

// 文件选择器整行交互：点击文件名区域同样触发系统文件选择，最大化操作易用性
$(document).on('click', '.file-name-display', function() {
    $(this).closest('.custom-file-picker').find('.custom-file-input').trigger('click');
});

function updatePickerFileName(input, displayId) {
    if (input.files && input.files[0]) {
        var file = input.files[0];
        var el = document.getElementById(displayId);
        if (el) {
            var sz = (file.size < 1024 * 1024) 
                ? (Math.round(file.size / 1024) + ' KB')
                : ((file.size / (1024 * 1024)).toFixed(1) + ' MB');
            el.textContent = file.name + ' (' + sz + ')';
            el.classList.add('has-file');
        }
    }
}

function previewSelectedImage(input, targetImgId, nameDisplayId) {
    if (input.files && input.files[0]) {
        var file = input.files[0];
        var reader = new FileReader();
        reader.onload = function(e) {
            var img = document.getElementById(targetImgId);
            if (img) img.src = e.target.result;
        };
        reader.readAsDataURL(file);
        if (nameDisplayId) {
            var nameEl = document.getElementById(nameDisplayId);
            if (nameEl) {
                nameEl.textContent = file.name + ' (' + Math.round(file.size / 1024) + ' KB)';
                nameEl.classList.add('has-file');
            }
        }
    }
}

function resetToDefaultLogo() {
    document.getElementById('resetLogoInput').value = '1';
    document.getElementById('settingCustomLogo').value = '';
    document.getElementById('previewLogoImg').src = 'assets/images/logo.png';
}

function resetToDefaultFavicon() {
    document.getElementById('resetFaviconInput').value = '1';
    document.getElementById('settingCustomFavicon').value = '';
    document.getElementById('previewFaviconImg').src = 'assets/images/favicon.svg';
}

function resetToDefaultBg() {
    document.getElementById('resetBgInput').value = '1';
    document.getElementById('settingCustomBg').value = '';
    var el = document.getElementById('bgFileNameDisplay');
    var defBgLabel = (typeof t === 'function' ? t('admin.item.axure_grid_default', null, '默认 Axure 原型网点底纹') : '默认 Axure 原型网点底纹');
    if (el) el.innerHTML = '<span style="color:var(--text-3);">' + esc(defBgLabel) + '</span>';
    var box = document.getElementById('previewBgImgWrap');
    if (box) {
        box.innerHTML = '<div style="width:100%;height:100%;background-color:var(--canvas);background-image:url(\"data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'8\' height=\'8\'%3E%3Crect width=\'1\' height=\'1\' fill=\'%2394a3b8\' opacity=\'0.5\'/%3E%3C/svg%3E\");background-size:8px 8px;display:flex;align-items:center;justify-content:center;color:var(--primary);font-size:13px;" title="' + esc(defBgLabel) + '"><i class="ri-grid-line"></i></div>';
    }
}

function handleBgFileSelected(input) {
    if (input.files && input.files[0]) {
        var file = input.files[0];
        var el = document.getElementById('bgFileNameDisplay');
        if (el) {
            el.innerHTML = '<span style="color:var(--primary);font-weight:550;">' + esc(typeof t === 'function' ? t('admin.item.pending_save_file', { name: file.name }, '待保存：' + file.name) : '待保存：' + file.name) + '</span>';
        }
        var box = document.getElementById('previewBgImgWrap');
        if (box && typeof FileReader !== 'undefined') {
            var reader = new FileReader();
            reader.onload = function(e) {
                box.innerHTML = '<img src="' + e.target.result + '" style="width:100%;height:100%;object-fit:cover;border-radius:3px;">';
            };
            reader.readAsDataURL(file);
        }
    }
}

function togglePwdVisibility(inputId, btnEl) {
    var inp = document.getElementById(inputId);
    if (!inp) return;
    var isPwd = inp.type === 'password';
    inp.type = isPwd ? 'text' : 'password';
    var icon = btnEl.querySelector('i');
    if (icon) {
        icon.className = isPwd ? 'ri-eye-off-line' : 'ri-eye-line';
    }
}

/* ===================== 系统设置: 脏值监听与底部浮动吸底保存机制 ===================== */
// 获取系统设置表单的精确快照字符串 (用于灵敏比对表单是否被修改)
function getSettingsFormSnapshot() {
    var form = document.getElementById('settingsForm');
    if (!form) return '';
    var fd = new FormData(form);

    // Checkbox 显式归一化 (unchecked 时 FormData 默认不包含该 key)
    var regSwitch = document.getElementById('settingVisitorReg');
    if (regSwitch) fd.set('visitor_register_enabled', regSwitch.checked ? '1' : '0');
    var wmSwitch = document.getElementById('settingGlobalWatermark');
    if (wmSwitch) fd.set('global_watermark_enabled', wmSwitch.checked ? '1' : '0');
    var smtpSwitch = document.getElementById('settingSmtpEnabled');
    if (smtpSwitch) fd.set('smtp_enabled', smtpSwitch.checked ? '1' : '0');

    var entries = [];
    var it = fd.entries();
    var cur = it.next();
    while (!cur.done) {
        entries.push(encodeURIComponent(cur.value[0]) + '=' + encodeURIComponent(cur.value[1]));
        cur = it.next();
    }
    entries.sort();
    return entries.join('&');
}

/* ===================== 控制中心配置项即改即生效 (Auto Save & Linear Feedback) ===================== */

// Each action has one in-flight snapshot and at most one newer pending snapshot.
var autoSaveQueues = {};

function setAutoSaveStatus(action, text, failed) {
    var prefix = action === 'save_settings' ? 'settings' : 'roles';
    var label = document.getElementById(prefix + 'SaveStatus');
    var retry = document.getElementById(prefix + 'SaveRetry');
    if (label) {
        label.textContent = text;
        label.classList.toggle('is-error', !!failed);
    }
    if (retry) retry.hidden = !failed;
}

function autoSaveKey(fd) {
    var entries = [];
    fd.forEach(function(value, key) {
        if (key !== 'csrf_token' && key !== 'action') entries.push([key, String(value)]);
    });
    entries.sort(function(a, b) { return JSON.stringify(a).localeCompare(JSON.stringify(b)); });
    return JSON.stringify(entries);
}

function blockAutoSave(action, message) {
    var state = autoSaveQueues[action] || (autoSaveQueues[action] = {running:false, pending:null, savedKey:null});
    state.blocked = true;
    state.pending = null;
    setAutoSaveStatus(action, message, true);
    if (message) {
        showToast(message, 'warning');
    }
}

function queueAutoSave(action, fd, onSaved) {
    var state = autoSaveQueues[action] || (autoSaveQueues[action] = {running:false, pending:null, savedKey:null});
    state.blocked = false;
    var key = autoSaveKey(fd);
    var job = {fd:fd, key:key, onSaved:onSaved};
    var txtSaving = (typeof t === 'function' ? t('common.saving_ellipsis', null, '保存中…') : '保存中…');
    var txtSaved = (typeof t === 'function' ? t('common.saved', null, '已保存') : '已保存');
    var txtSaveFailed = (typeof t === 'function' ? t('admin.settings.save_failed', null, '保存失败，请重试') : '保存失败，请重试');
    var txtSaveNetFailed = (typeof t === 'function' ? t('admin.settings.save_net_failed', null, '保存失败，请检查网络后重试') : '保存失败，请检查网络后重试');
    if (state.running) {
        // Even a change back to the in-flight value supersedes an older pending edit.
        state.pending = job;
        setAutoSaveStatus(action, txtSaving, false);
        return state.promise;
    }
    if (state.savedKey === key) {
        setAutoSaveStatus(action, txtSaved, false);
        return Promise.resolve(true);
    }
    state.pending = job;
    state.running = true;
    setAutoSaveStatus(action, txtSaving, false);
    function drain() {
        var current = state.pending;
        state.pending = null;
        return adminFetch(action, current.fd, false).then(function(res) {
            if (!res.success) {
                var failure = new Error(res.message || txtSaveFailed);
                failure.userMessage = res.message || txtSaveFailed;
                throw failure;
            }
            state.savedKey = current.key;
            if (current.onSaved) current.onSaved(current.fd, res.data);
            if (state.blocked) return false;
            if (state.pending && state.pending.key === state.savedKey) state.pending = null;
            if (state.pending) return drain();
            setAutoSaveStatus(action, txtSaved, false);
            var actionLabel = action === 'save_role_permissions'
                ? (typeof t === 'function' ? t('admin.roles.saved', null, '角色权限已保存') : '角色权限已保存')
                : (typeof t === 'function' ? t('admin.settings.saved', null, '系统设置已保存') : '系统设置已保存');
            showToast(actionLabel, 'success');
            if (isAdminConsoleOpen()) {
                markAdminConsoleChanged();
            }
            return true;
        }).catch(function(error) {
            if (state.blocked) return false;
            // A newer complete snapshot may still succeed after an older failure.
            if (state.pending) return drain();
            setAutoSaveStatus(action, error.userMessage || txtSaveNetFailed, true);
            showToast(error.userMessage || txtSaveNetFailed, 'error');
            return false;
        });
    }
    state.promise = drain().then(function(result) {
        state.running = false;
        return result;
    });
    return state.promise;
}

function retryAutoSave(action) {
    return action === 'save_settings' ? executeAutoSaveSettings() : autoSaveRolePermissions();
}
window.retryAutoSave = retryAutoSave;

function autoSaveRolePermissions() {
    var form = document.getElementById('rolePermissionsForm');
    if (!form) return Promise.resolve(false);
    var fd = new FormData();
    // 数据驱动：自动收集角色权限矩阵表单内的所有具名 checkbox，杜绝硬编码 ID 维护地质层
    var checkboxes = form.querySelectorAll('input[type="checkbox"][name]');
    checkboxes.forEach(function(input) {
        fd.append(input.name, input.checked ? '1' : '0');
    });
    return queueAutoSave('save_role_permissions', fd, function(saved) {
        syncItemCollaborationSharePermission(saved.get('perm_editor_share') === '1');
    });
}
window.autoSaveRolePermissions = autoSaveRolePermissions;

// 绑定角色权限监听
function initRolePermissionsListeners() {
    var form = document.getElementById('rolePermissionsForm');
    if (!form || form._autoSaveBound) return;
    form._autoSaveBound = true;
    form.addEventListener('change', function(e) {
        if (e.target && e.target.type === 'checkbox') {
            autoSaveRolePermissions(e.target);
        }
    });
}
window.initRolePermissionsListeners = initRolePermissionsListeners;

// 兼容保留旧 handleSaveRolePermissions 供显式调用
function handleSaveRolePermissions(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    autoSaveRolePermissions();
}
window.handleSaveRolePermissions = handleSaveRolePermissions;


// 2. 系统全局设置自动保存 (开关/下拉/多选即改即存，文本输入失焦即存)
var settingsAutoSaveTimer = null;

function triggerAutoSaveSettings(delay) {
    if (settingsAutoSaveTimer) clearTimeout(settingsAutoSaveTimer);
    settingsAutoSaveTimer = setTimeout(function() {
        executeAutoSaveSettings();
    }, (typeof delay === 'number') ? delay : 50);
}
window.triggerAutoSaveSettings = triggerAutoSaveSettings;

function executeAutoSaveSettings() {
    var form = document.getElementById('settingsForm');
    if (!form) return;

    // 企业邮箱域名后缀校验
    var domainsInput = form.querySelector('input[name="allowed_email_domains"]');
    if (domainsInput && domainsInput.value.trim()) {
        var check = window.validateEmailDomains(domainsInput.value);
        if (!check.valid) {
            domainsInput.setAttribute('aria-invalid', 'true');
            domainsInput.setAttribute('aria-describedby', 'settingsSaveStatus');
            if (domainsInput.classList) domainsInput.classList.add('m-input-error');
            blockAutoSave('save_settings', (typeof t === 'function' ? t('admin.settings.err_domain', null, '邮箱域名格式有误') : '邮箱域名格式有误'));
            showToast((typeof t === 'function' ? t('admin.settings.err_domain_toast', null, '邮箱域名请填写 company.com 格式，不含 @') : '邮箱域名请填写 company.com 格式，不含 @'), 'warning');
            return Promise.resolve(false);
        }
        domainsInput.value = check.clean;
    }

    if (domainsInput) {
        domainsInput.removeAttribute('aria-invalid');
        domainsInput.removeAttribute('aria-describedby');
        if (domainsInput.classList) domainsInput.classList.remove('m-input-error');
    }

    var baseUrlInput = form.querySelector('input[name="site_base_url"]');
    if (baseUrlInput) {
        var rawBaseUrl = baseUrlInput.value.trim().replace(/\/+$/, '');
        if (rawBaseUrl) {
            var baseUrlOk = /^https?:\/\/[a-z0-9.-]+(?::\d{1,5})?(?:\/[^\s?#]*)?$/i.test(rawBaseUrl);
            if (!baseUrlOk) {
                baseUrlInput.setAttribute('aria-invalid', 'true');
                baseUrlInput.setAttribute('aria-describedby', 'settingsSaveStatus');
                if (baseUrlInput.classList) baseUrlInput.classList.add('m-input-error');
                blockAutoSave('save_settings', (typeof t === 'function' ? t('admin.settings.err_base_url', null, '站点地址格式有误') : '站点地址格式有误'));
                showToast((typeof t === 'function' ? t('admin.settings.err_base_url_toast', null, '站点访问地址格式不正确，例如 https://proto.company.com') : '站点访问地址格式不正确，例如 https://proto.company.com'), 'warning');
                return Promise.resolve(false);
            }
            if (typeof window !== 'undefined' && window.location && window.location.hostname) {
                try {
                    var parsedBase = new URL(rawBaseUrl);
                    if (parsedBase.hostname.toLowerCase() !== window.location.hostname.toLowerCase()) {
                        baseUrlInput.setAttribute('aria-invalid', 'true');
                        baseUrlInput.setAttribute('aria-describedby', 'settingsSaveStatus');
                        if (baseUrlInput.classList) baseUrlInput.classList.add('m-input-error');
                        blockAutoSave('save_settings', (typeof t === 'function' ? t('admin.settings.err_base_host', null, '站点域名与当前访问不符') : '站点域名与当前访问不符'));
                        showToast((typeof t === 'function' ? t('admin.settings.err_base_host_toast', null, '站点访问地址的域名需与当前访问域名一致') : '站点访问地址的域名需与当前访问域名一致'), 'warning');
                        return Promise.resolve(false);
                    }
                    var reqPort = window.location.port || '';
                    var targetPort = parsedBase.port || '';
                    var defaultPort = parsedBase.protocol === 'https:' ? '443' : '80';
                    var portMismatch = reqPort
                        ? ((targetPort || defaultPort) !== reqPort)
                        : (targetPort !== '' && targetPort !== defaultPort);
                    if (portMismatch) {
                        baseUrlInput.setAttribute('aria-invalid', 'true');
                        baseUrlInput.setAttribute('aria-describedby', 'settingsSaveStatus');
                        if (baseUrlInput.classList) baseUrlInput.classList.add('m-input-error');
                        blockAutoSave('save_settings', (typeof t === 'function' ? t('admin.settings.err_base_port', null, '站点端口与当前访问不符') : '站点端口与当前访问不符'));
                        showToast((typeof t === 'function' ? t('admin.settings.err_base_port_toast', null, '站点访问地址的端口需与当前访问端口一致') : '站点访问地址的端口需与当前访问端口一致'), 'warning');
                        return Promise.resolve(false);
                    }
                } catch (err) {
                    baseUrlInput.setAttribute('aria-invalid', 'true');
                    baseUrlInput.setAttribute('aria-describedby', 'settingsSaveStatus');
                    if (baseUrlInput.classList) baseUrlInput.classList.add('m-input-error');
                    blockAutoSave('save_settings', (typeof t === 'function' ? t('admin.settings.err_base_url', null, '站点地址格式有误') : '站点地址格式有误'));
                    showToast((typeof t === 'function' ? t('admin.settings.err_base_url_toast', null, '站点访问地址格式不正确，例如 https://proto.company.com') : '站点访问地址格式不正确，例如 https://proto.company.com'), 'warning');
                    return Promise.resolve(false);
                }
            }
            baseUrlInput.value = rawBaseUrl;
        }
        baseUrlInput.removeAttribute('aria-invalid');
        baseUrlInput.removeAttribute('aria-describedby');
        if (baseUrlInput.classList) baseUrlInput.classList.remove('m-input-error');
    }
    var fd = new FormData(form);

    // 显式保证 Checkbox 状态精准传递
    var regSwitch = document.getElementById('settingVisitorReg');
    if (regSwitch) fd.set('visitor_register_enabled', regSwitch.checked ? '1' : '0');
    var wmSwitch = document.getElementById('settingGlobalWatermark');
    if (wmSwitch) fd.set('global_watermark_enabled', wmSwitch.checked ? '1' : '0');
    var smtpSwitch = document.getElementById('settingSmtpEnabled');
    if (smtpSwitch) {
        fd.set('smtp_enabled', smtpSwitch.checked ? '1' : '0');
        if (smtpSwitch.checked) {
            var smtpHostEl = document.getElementById('settingSmtpHost');
            var smtpPortEl = document.getElementById('settingSmtpPort');
            var smtpUserEl = document.getElementById('settingSmtpUser');
            var smtpPassEl = document.getElementById('settingSmtpPass');
            var hasPassAttr = smtpPassEl && smtpPassEl.getAttribute('data-has-pass') === '1';
            var hasPassVal = smtpPassEl && smtpPassEl.value !== '';
            var hostVal = smtpHostEl ? smtpHostEl.value.trim() : '';
            var portVal = smtpPortEl ? parseInt(smtpPortEl.value, 10) : 0;
            var userVal = smtpUserEl ? smtpUserEl.value.trim() : '';
            if (!hostVal || isNaN(portVal) || portVal < 1 || portVal > 65535 || !userVal) {
                smtpSwitch.checked = false;
                blockAutoSave('save_settings', (typeof t === 'function' ? t('admin.settings.err_smtp_required', null, '请先填写 SMTP 服务器、端口与发信邮箱') : '请先填写 SMTP 服务器、端口与发信邮箱'));
                return Promise.resolve(false);
            }
            if (!hasPassAttr && !hasPassVal) {
                smtpSwitch.checked = false;
                blockAutoSave('save_settings', (typeof t === 'function' ? t('admin.settings.err_smtp_pass', null, '请先填写邮箱客户端授权码') : '请先填写邮箱客户端授权码'));
                if (smtpPassEl) smtpPassEl.focus();
                return Promise.resolve(false);
            }
        }
    }

    // 显式传递审批通知人清空意图 (若全部未勾选则传空字串占位，表达明确清空)
    var checkedAdmins = form.querySelectorAll('input[name="visitor_notify_admin_ids[]"]:checked');
    if (checkedAdmins.length === 0) {
        fd.append('visitor_notify_admin_ids[]', '');
    }

    return queueAutoSave('save_settings', fd, function(saved, respData) {
        // Reflect the acknowledged snapshot, not whatever is now being edited.
        var newTitle = (saved.get('site_title') || '').trim();
        var brandText = document.querySelector('.site-brand .brand-company-name') || document.querySelector('.site-brand span');
        if (brandText) {
            brandText.textContent = newTitle || (typeof t === 'function' ? t('brand.name', null, '立象原型') : '立象原型');
            brandText.className = newTitle ? 'brand-company-name' : '';
            if (newTitle) brandText.title = newTitle;
            else brandText.removeAttribute('title');
        }

        // 同步审批通知人持久化状态
        if (saved.has('visitor_register_enabled')) {
            var allNotifyVals = saved.getAll('visitor_notify_admin_ids[]');
            window.SAVED_NOTIFY_ADMIN_IDS = allNotifyVals.map(function(id) { return parseInt(id, 10); });
        }

        // 同步全局评审群 Webhook 配置状态与发版通道
        if (saved.has('global_webhook_url')) {
            var gUrl = (saved.get('global_webhook_url') || '').trim();
            window.SYS_HAS_GLOBAL_WEBHOOK = (gUrl !== '');
            if (typeof updateUploadNotifyState === 'function') {
                var upSel = document.getElementById('uploadItemSelect');
                var curItemId = upSel ? upSel.value : null;
                updateUploadNotifyState(curItemId, false);
            }
        }

        // 同步邮件授权码脱敏占位，防止明文滞留 DOM
        if (respData && typeof respData.smtp_has_pass === 'boolean') {
            syncSmtpPassUi(respData.smtp_has_pass, saved.get('smtp_pass'));
            if (smtpSwitch && !respData.smtp_has_pass && saved.get('smtp_enabled') === '1') {
                smtpSwitch.checked = false;
                showToast((typeof t === 'function' ? t('admin.settings.smtp_identity_changed', null, '发信服务器或邮箱已更换，请重新填写授权码') : '发信服务器或邮箱已更换，请重新填写授权码'), 'info');
            }
        }
        if (respData && typeof respData.mail_reset_enabled === 'boolean') {
            window.SYS_MAIL_RESET_ENABLED = respData.mail_reset_enabled;
        }
        if (respData && respData.system_language && typeof window !== 'undefined' && window.__LOCALE__ && respData.system_language !== window.__LOCALE__) {
            window.__LOCALE__ = respData.system_language;
            if (window.location && typeof window.location.reload === 'function') {
                window.location.reload();
            }
        }
    });
}

function initSettingsFormListeners() {
    var form = document.getElementById('settingsForm');
    if (!form || form._autoSaveBound) return;
    form._autoSaveBound = true;

    // 1. 开关、下拉选择、数字步进器：即改即存
    form.addEventListener('change', function(e) {
        if (!e.target || !e.target.name) return;
        var tag = e.target.tagName ? e.target.tagName.toLowerCase() : '';
        var type = (e.target.type || '').toLowerCase();
        if (type === 'checkbox' || tag === 'select' || type === 'number') {
            triggerAutoSaveSettings(50);
        }
    });

    // 2. 文本/邮箱/密码类具名输入框：获得焦点记录基准，失焦检测变动后即存
    var textInputs = form.querySelectorAll('input[name][type="text"], input[name][type="email"], input[name][type="password"]');
    textInputs.forEach(function(inp) {
        inp.addEventListener('focus', function() {
            inp._initVal = inp.type === 'password' ? inp.value : inp.value.trim();
        });
        inp.addEventListener('blur', function() {
            var curVal = inp.type === 'password' ? inp.value : inp.value.trim();
            if (inp._initVal !== undefined && curVal !== inp._initVal) {
                inp._initVal = curVal;
                triggerAutoSaveSettings(0);
            }
        });
        inp.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                inp.blur();
            }
        });
    });

    // 拦截表单默认回车刷新行为
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        triggerAutoSaveSettings(0);
    });
}
window.initSettingsFormListeners = initSettingsFormListeners;

function handleSaveSettings(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    triggerAutoSaveSettings(0);
}
window.handleSaveSettings = handleSaveSettings;

function syncSmtpPassUi(hasPass, savedPassword) {
    var passEl = document.getElementById('settingSmtpPass');
    var badge = document.getElementById('smtpPassBadge');
    var clearBtn = document.getElementById('btnClearSmtpPass');
    if (passEl) {
        if (savedPassword && passEl.value === savedPassword) {
            passEl.value = '';
            passEl._initVal = '';
        }
        passEl.setAttribute('data-has-pass', hasPass ? '1' : '0');
        passEl.placeholder = hasPass
            ? (typeof t === 'function' ? t('admin.settings.smtp_pass_set_placeholder', null, '已配置，留空保持不变') : '已配置，留空保持不变')
            : (typeof t === 'function' ? t('admin.settings.smtp_pass_unset_placeholder', null, '输入客户端授权码') : '输入客户端授权码');
    }
    if (badge) {
        badge.textContent = hasPass
            ? (typeof t === 'function' ? t('common.configured', null, '已配置') : '已配置')
            : (typeof t === 'function' ? t('admin.settings.smtp_pass_unset_badge', null, '请使用客户端授权码') : '请使用客户端授权码');
    }
    if (clearBtn) {
        clearBtn.style.display = hasPass ? '' : 'none';
    }
}

function onSmtpPresetChange(presetKey) {
    var sel = document.getElementById('settingSmtpPreset');
    if (!sel) return;
    var opt = sel.options[sel.selectedIndex];
    if (!opt) return;
    var host = opt.getAttribute('data-host') || '';
    var port = opt.getAttribute('data-port') || '465';
    var enc = opt.getAttribute('data-enc') || 'ssl';
    var hostEl = document.getElementById('settingSmtpHost');
    var portEl = document.getElementById('settingSmtpPort');
    var encEl = document.getElementById('settingSmtpEncryption');
    if (presetKey !== 'custom') {
        if (hostEl) { hostEl.value = host; hostEl._initVal = host; }
        if (portEl) { portEl.value = port; }
        if (encEl) { encEl.value = enc; }
    }
}
window.onSmtpPresetChange = onSmtpPresetChange;

function onSmtpEncryptionChange(enc) {
    var portEl = document.getElementById('settingSmtpPort');
    if (!portEl) return;
    var curPort = String(portEl.value || '').trim();
    if (curPort === '' || curPort === '465' || curPort === '587' || curPort === '25') {
        if (enc === 'ssl') portEl.value = '465';
        else if (enc === 'tls') portEl.value = '587';
        else if (enc === 'none') portEl.value = '25';
    }
    syncSmtpPresetFromManual();
}
window.onSmtpEncryptionChange = onSmtpEncryptionChange;

function syncSmtpPresetFromManual() {
    var hostEl = document.getElementById('settingSmtpHost');
    var portEl = document.getElementById('settingSmtpPort');
    var encryptionEl = document.getElementById('settingSmtpEncryption');
    var sel = document.getElementById('settingSmtpPreset');
    if (!hostEl || !portEl || !encryptionEl || !sel || sel.value === 'custom') return;
    var cur = hostEl.value.trim().toLowerCase();
    var opt = sel.options[sel.selectedIndex];
    if (opt && (opt.getAttribute('data-host').toLowerCase() !== cur
        || opt.getAttribute('data-port') !== portEl.value || opt.getAttribute('data-enc') !== encryptionEl.value)) {
        sel.value = 'custom';
    }
}
window.syncSmtpPresetFromManual = syncSmtpPresetFromManual;

function clearSavedSmtpPass() {
    var fd = new FormData();
    fd.append('smtp_pass_clear', '1');
    fd.append('smtp_enabled', '0');
    var passEl = document.getElementById('settingSmtpPass');
    var draft = passEl ? passEl.value : '';
    var smtpSwitch = document.getElementById('settingSmtpEnabled');
    adminFetch('save_settings', fd).then(function(res) {
        if (res.success) {
            if (smtpSwitch) smtpSwitch.checked = false;
            syncSmtpPassUi(false, draft);
            window.SYS_MAIL_RESET_ENABLED = false;
            setAutoSaveStatus('save_settings', (typeof t === 'function' ? t('common.saved', null, '已保存') : '已保存'), false);
            showToast((typeof t === 'function' ? t('admin.settings.smtp_pass_cleared', null, '已清除邮箱授权码') : '已清除邮箱授权码'), 'success');
        } else {
            showToast(res.message || (typeof t === 'function' ? t('common.op_failed', null, '操作失败') : '操作失败'), 'error');
        }
    }).catch(function() {
        showToast((typeof t === 'function' ? t('common.network_req_error', null, '网络请求异常') : '网络请求异常'), 'error');
    });
}
window.clearSavedSmtpPass = clearSavedSmtpPass;

function handleTestSmtp(btnEl) {
    var toEl = document.getElementById('smtpTestEmail');
    var toEmail = toEl ? toEl.value.trim() : '';
    if (!toEmail) {
        var msgEnter = (typeof t === 'function' ? t('admin.settings.smtp_test_enter_email', null, '请输入测试收件邮箱') : '请输入测试收件邮箱');
        if (typeof setFieldError === 'function' && toEl) setFieldError(toEl, null, msgEnter);
        else { showToast(msgEnter, 'warning'); if (toEl) toEl.focus(); }
        return;
    }
    var hostEl = document.getElementById('settingSmtpHost');
    var portEl = document.getElementById('settingSmtpPort');
    var encEl = document.getElementById('settingSmtpEncryption');
    var userEl = document.getElementById('settingSmtpUser');
    var passEl = document.getElementById('settingSmtpPass');
    var fromEl = document.getElementById('settingSmtpFromName');
    var fd = new FormData();
    fd.append('to_email', toEmail);
    fd.append('smtp_host', hostEl ? hostEl.value.trim() : '');
    fd.append('smtp_port', portEl ? portEl.value.trim() : '465');
    fd.append('smtp_encryption', encEl ? encEl.value : 'ssl');
    fd.append('smtp_user', userEl ? userEl.value.trim() : '');
    fd.append('smtp_pass', passEl ? passEl.value : '');
    fd.append('smtp_from_name', fromEl ? fromEl.value.trim() : '');

    var origHtml = btnEl ? btnEl.innerHTML : '';
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> ' + esc(typeof t === 'function' ? t('common.sending', null, '发送中...') : '发送中...');
    }
    var restore = function() {
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.innerHTML = origHtml;
        }
    };
    adminFetch('test_smtp', fd).then(function(res) {
        restore();
        if (res.success) {
            showToast(res.message || (typeof t === 'function' ? t('admin.settings.smtp_test_sent', null, '测试邮件已发送') : '测试邮件已发送'), 'success');
        } else {
            showToast(res.message || (typeof t === 'function' ? t('admin.settings.smtp_test_failed', null, '发送失败') : '发送失败'), 'error');
        }
    }).catch(function() {
        restore();
        showToast((typeof t === 'function' ? t('common.network_req_error', null, '网络请求异常') : '网络请求异常'), 'error');
    });
}
window.handleTestSmtp = handleTestSmtp;

// 保持向前兼容的桩函数，避免历史调用报错
function checkSettingsFormDirty() { return false; }
function isSettingsFormDirty() { return false; }
function isRolePermissionsDirty() { return false; }
function isConsoleDirty() { return false; }
function resetActiveSettingsForm() {}
function submitActiveSettingsForm() { triggerAutoSaveSettings(0); }
window.checkConsoleDirty = checkSettingsFormDirty;
window.checkSettingsFormDirty = checkSettingsFormDirty;
window.isSettingsFormDirty = isSettingsFormDirty;
window.isRolePermissionsDirty = isRolePermissionsDirty;
window.isConsoleDirty = isConsoleDirty;
window.resetSettingsForm = resetActiveSettingsForm;
window.resetActiveSettingsForm = resetActiveSettingsForm;
window.submitActiveSettingsForm = submitActiveSettingsForm;

/* ===================== 专业管理控制台 (Admin Console) ===================== */
function checkHasPendingUsers() {
    var isCurAdmin = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.role === 'admin');
    if (!isCurAdmin) return false;
    if (typeof window.PENDING_USER_COUNT !== 'undefined') {
        return window.PENDING_USER_COUNT > 0;
    }
    var dot = document.getElementById('adminSettingsDot');
    if (dot && dot.style.display !== 'none') return true;
    var badgeNav = document.getElementById('pendingUserBadge');
    if (badgeNav) {
        var count = parseInt(badgeNav.textContent, 10);
        if (!isNaN(count) && count > 0 && badgeNav.style.display !== 'none') return true;
    }
    return false;
}

function hydrateAdminRowVersions(targetItemId) {
    if (typeof $ !== 'function') return;
    var selector = targetItemId ? ('#overviewTableProjects tbody tr#admin-item-row-' + targetItemId) : '#overviewTableProjects tbody tr[data-item-id]';
    $(selector).each(function() {
        var $row = $(this);
        if ($row.data('versions') !== undefined) return;
        var itemId = $row.attr('data-item-id');
        if (!itemId) return;
        var $treeNode = $('#item-node-' + itemId);
        if ($treeNode.length) {
            var vers = $treeNode.data('versions');
            if (typeof vers === 'string') {
                try { vers = JSON.parse(vers); } catch(e) { vers = []; }
                $treeNode.data('versions', vers);
            }
            if (Array.isArray(vers)) {
                $row.data('versions', vers);
            }
        }
    });
}

function openAdminConsole(defaultTab, subTab) {
    var modal = document.getElementById('adminConsoleModal');
    if (!modal) return;
    hydrateAdminRowVersions();
    if (!defaultTab) {
        if (checkHasPendingUsers()) {
            defaultTab = 'users';
            if (!subTab) subTab = 'pending';
        } else {
            defaultTab = 'dashboard';
        }
    }
    switchAdminTab(defaultTab, subTab);
    openModal('adminConsoleModal', 'adminConsoleModal');
}

function closeAdminConsole() {
    if (typeof closeAllLinearHintPopovers === 'function') closeAllLinearHintPopovers();
    var modal = document.getElementById('adminConsoleModal');
    if (modal) closeModal('adminConsoleModal');
}

function switchAdminTab(tabKey, subTab) {
    if (tabKey === 'security') tabKey = 'brand';
    if (typeof closeAllLinearHintPopovers === 'function') closeAllLinearHintPopovers();

    // 每次切换 Tab 自动将内容视口滚动到最顶端
    var contentBody = document.querySelector('.admin-content-body');
    if (contentBody) contentBody.scrollTop = 0;

    var navItems = document.querySelectorAll('.admin-nav-item');
    for (var i = 0; i < navItems.length; i++) {
        navItems[i].classList.remove('active');
    }
    var panels = document.querySelectorAll('.admin-panel');
    for (var j = 0; j < panels.length; j++) {
        panels[j].classList.remove('active');
    }

    var targetNav = document.getElementById('nav-' + tabKey);
    if (targetNav) {
        targetNav.classList.add('active');
    }

    var targetPanel = document.getElementById('panel-' + tabKey);
    if (targetPanel) {
        targetPanel.classList.add('active');
        if (typeof triggerTabTransition === 'function') triggerTabTransition(targetPanel);
    }

    var titles = {
        'dashboard': (typeof t === 'function' ? t('admin.nav.dashboard', null, '数据概览') : '数据概览'),
        'overview': (typeof t === 'function' ? t('admin.nav.overview', null, '项目管理') : '项目管理'),
        'users': (typeof t === 'function' ? t('admin.nav.users', null, '团队成员') : '团队成员'),
        'roles': (typeof t === 'function' ? t('admin.nav.roles', null, '角色权限') : '角色权限'),
        'brand': (typeof t === 'function' ? t('admin.nav.brand', null, '系统设置') : '系统设置'),
        'logs': (typeof t === 'function' ? t('admin.nav.logs', null, '系统日志') : '系统日志')
    };

    var titleEl = document.getElementById('adminPanelTitle');
    if (titleEl) titleEl.textContent = titles[tabKey] || titles.dashboard;

    // 自动按需刷新数据与同步浮动保存条
    if (tabKey === 'dashboard') {
        setTimeout(function() {
            renderDashboardCharts();
            resizeDashboardCharts();
        }, 50);
    } else if (tabKey === 'users') {
        var isCurAdmin = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.role === 'admin');
        if (subTab) {
            switchUserSubTab(subTab);
        } else if (isCurAdmin && checkHasPendingUsers()) {
            switchUserSubTab('pending');
        } else {
            switchUserSubTab('active');
        }
    } else if (tabKey === 'roles') {
        initRolePermissionsListeners();
    } else if (tabKey === 'logs') {
        loadLogsData();
    } else if (tabKey === 'brand') {
        initSettingsFormListeners();
        setTimeout(function() {
            onAdminSelectChange(true);
        }, 20);
    }
}

/* ===================== 个人设置与自主改密 (已统一下沉至 app.js 全员共享) ===================== */

// 数据概览 ECharts 按需 + 空闲懒加载与现代图表渲染
var _echartsLoadPromise = null;
function ensureEchartsLoaded() {
    if (typeof echarts !== 'undefined') return Promise.resolve(echarts);
    if (_echartsLoadPromise) return _echartsLoadPromise;
    var url = (typeof ECHARTS_SCRIPT_URL !== 'undefined' && ECHARTS_SCRIPT_URL) ? ECHARTS_SCRIPT_URL : 'assets/js/echarts.min.js';
    _echartsLoadPromise = new Promise(function(resolve) {
        if (typeof document === 'undefined' || !document.createElement) {
            resolve(null);
            return;
        }
        var script = document.createElement('script');
        script.src = url;
        script.async = true;
        script.onload = function() {
            resolve(typeof echarts !== 'undefined' ? echarts : null);
        };
        script.onerror = function() {
            _echartsLoadPromise = null;
            resolve(null);
        };
        (document.head || document.body || document.documentElement).appendChild(script);
    });
    return _echartsLoadPromise;
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    var _echartsPrefetchBound = false;
    var prefetchEchartsOnIntent = function() {
        if (_echartsPrefetchBound) return;
        var btn = document.querySelector('button[onclick*="openAdminConsole"]');
        if (!btn) return;
        _echartsPrefetchBound = true;
        var warm = function() {
            if (typeof ECHARTS_SCRIPT_URL !== 'undefined' && typeof echarts === 'undefined') {
                ensureEchartsLoaded();
            }
        };
        btn.addEventListener('mouseenter', warm, { once: true, passive: true });
        btn.addEventListener('focus', warm, { once: true, passive: true });
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', prefetchEchartsOnIntent);
    } else {
        prefetchEchartsOnIntent();
    }
}

var chartAnnotationDonut = null;
var chartTrend = null;
var currentTrendRange = '7d';
var currentAnnoProjFilter = 0;
var currentAnnoVerFilter = 0;
function getDashboardChartPalette() {
    return {
        primary: '#0076de',
        success: '#16a34a',
        warning: '#d97706',
        border: '#e7eaf0',
        borderStrong: '#d8dde6',
        text1: '#182230',
        text2: '#4e5b6e',
        text3: '#667085',
        canvas: '#f7f8fa',
        surface: '#ffffff'
    };
}

function renderAnnotationDashboard() {
    var CHART_PALETTE = getDashboardChartPalette();
    if (typeof echarts === 'undefined') {
        ensureEchartsLoaded().then(function(ec) {
            if (ec) renderAnnotationDashboard();
        });
        return;
    }
    var donutDom = document.getElementById('chartAnnotationDonut');
    var detailDom = document.getElementById('annoDetailBox');
    if (!donutDom) return;

    if (!chartAnnotationDonut) {
        chartAnnotationDonut = echarts.init(donutDom);
    }

    var data = window.DASHBOARD_DATA || {};
    var list = data.annos || [];
    if (currentAnnoProjFilter > 0) {
        list = list.filter(function(a) { return parseInt(a.item_id, 10) === currentAnnoProjFilter; });
    }
    if (currentAnnoVerFilter > 0) {
        list = list.filter(function(a) { return parseInt(a.ver_id, 10) === currentAnnoVerFilter; });
    }

    var total = 0;
    var pending = 0;
    var resolved = 0;
    for (var i = 0; i < list.length; i++) {
        var cnt = (typeof list[i].cnt === 'number') ? list[i].cnt : (parseInt(list[i].cnt, 10) || 1);
        total += cnt;
        if (parseInt(list[i].status, 10) === 1) {
            resolved += cnt;
        } else {
            pending += cnt;
        }
    }
    var rate = (total > 0) ? Math.round((resolved / total) * 100) : 100;

    // 1. 绘制批注待办与闭环占比环形图
    var lblNoAnno = (typeof t === 'function' ? t('admin.dash.no_anno', null, '暂无批注') : '暂无批注');
    var lblPending = (typeof t === 'function' ? t('admin.dash.pending', null, '待处理') : '待处理');
    var lblClosed = (typeof t === 'function' ? t('admin.dash.closed', null, '已闭环') : '已闭环');
    var lblUnitItem = (typeof t === 'function' ? t('admin.dash.unit_item', null, '条') : '条');
    var chartData = [];
    var chartColors = [];
    if (total === 0) {
        chartData = [{ value: 1, name: lblNoAnno }];
        chartColors = [CHART_PALETTE.border];
    } else {
        if (pending > 0) {
            chartData.push({ value: pending, name: lblPending });
            chartColors.push(CHART_PALETTE.warning);
        }
        if (resolved > 0) {
            chartData.push({ value: resolved, name: lblClosed });
            chartColors.push(CHART_PALETTE.success);
        }
    }

    chartAnnotationDonut.setOption({
        tooltip: {
            trigger: 'item',
            show: total > 0,
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            borderColor: 'transparent',
            textStyle: { color: CHART_PALETTE.surface, fontSize: 12 },
            formatter: function(params) {
                var pct = total > 0 ? Math.round((params.value / total) * 100) : 0;
                var cntStr = (typeof t === 'function' ? t('admin.dash.unit_item_count', { n: params.value }, params.value + ' 条') : params.value + ' 条');
                return '<div style="font-weight:600;">' + esc(params.name) + '</div>' +
                       '<div style="font-size:12px;color:rgba(255,255,255,0.75);">' + esc(cntStr) + ' (' + pct + '%)</div>';
            }
        },
        title: {
            show: false
        },
        series: [{
            type: 'pie',
            radius: ['60%', '82%'],
            center: ['50%', '50%'],
            avoidLabelOverlap: false,
            silent: total === 0,
            label: { show: false },
            data: chartData,
            color: chartColors,
            itemStyle: {
                borderRadius: 3,
                borderColor: CHART_PALETTE.surface,
                borderWidth: total > 0 ? 1 : 0
            }
        }]
    }, true);

    // 动态同步圆环中心文字（纯 CSS 双向绝对居中，彻底消除 canvas 字体基线与百分比估算误差）
    var rateEl = document.getElementById('donutCenterRate');
    var labelEl = document.getElementById('donutCenterLabel');
    if (rateEl) rateEl.textContent = (total === 0) ? '0' : rate + '%';
    if (labelEl) labelEl.textContent = (total === 0) ? (typeof t === 'function' ? t('admin.dash.no_todo', null, '无待办') : '无待办') : (typeof t === 'function' ? t('admin.dash.close_rate', null, '闭环率') : '闭环率');

    // 2. 渲染右侧指标详情面板
    if (detailDom) {
        if (total === 0) {
            detailDom.innerHTML = `
                <div style="text-align:center;padding:12px 0;color:var(--text-3);font-size:11.5px;">
                    <i class="ri-checkbox-circle-line" style="font-size:22px;color:var(--success);display:block;margin-bottom:4px;opacity:0.85;"></i>
                    ${esc(typeof t === 'function' ? t('admin.dash.no_anno_range', null, '当前范围内暂无批注待办') : '当前范围内暂无批注待办')}
                </div>
            `;
        } else {
            var pendingColor = pending > 0 ? 'var(--warning)' : 'var(--text-1)';
            var lblTotalAnno = (typeof t === 'function' ? t('admin.dash.total_anno', null, '累计批注') : '累计批注');
            var totalCntStr = (typeof t === 'function' ? t('admin.dash.unit_item_count', { n: total }, total + ' 条') : total + ' 条');
            detailDom.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:7px;padding-right:4px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-size:11.5px;color:var(--text-2);display:inline-flex;align-items:center;gap:4px;">
                            <span class="m-status-dot dot-warning"></span>
                            <span>${esc(lblPending)}</span>
                        </span>
                        <span style="font-size:14px;font-weight:700;color:${pendingColor};">${pending} <span style="font-size:10.5px;font-weight:400;color:var(--text-3);">${esc(lblUnitItem)}</span></span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-size:11.5px;color:var(--text-2);display:inline-flex;align-items:center;gap:4px;">
                            <span class="m-status-dot dot-success"></span>
                            <span>${esc(lblClosed)}</span>
                        </span>
                        <span style="font-size:14px;font-weight:700;color:var(--success);">${resolved} <span style="font-size:10.5px;font-weight:400;color:var(--text-3);">${esc(lblUnitItem)}</span></span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;padding-top:6px;border-top:1px dashed var(--border);">
                        <span style="font-size:11px;color:var(--text-3);">${esc(lblTotalAnno)}</span>
                        <span style="font-size:11.5px;font-weight:600;color:var(--text-1);">${esc(totalCntStr)}</span>
                    </div>
                </div>
            `;
        }
    }
}
window.renderAnnotationDashboard = renderAnnotationDashboard;

function onAnnoProjectFilterChange(val) {
    currentAnnoProjFilter = parseInt(val, 10) || 0;
    currentAnnoVerFilter = 0;

    var verSelect = document.getElementById('filterAnnoVersion');
    if (verSelect) {
        verSelect.innerHTML = '<option value="0">' + esc(typeof t === 'function' ? t('admin.dash.all_versions', null, '全部版本') : '全部版本') + '</option>';
        if (currentAnnoProjFilter > 0) {
            var data = window.DASHBOARD_DATA || {};
            var projs = data.projects || [];
            var targetProj = null;
            for (var i = 0; i < projs.length; i++) {
                if (parseInt(projs[i].id, 10) === currentAnnoProjFilter) {
                    targetProj = projs[i];
                    break;
                }
            }
            if (targetProj && targetProj.versions && targetProj.versions.length > 0) {
                for (var v = 0; v < targetProj.versions.length; v++) {
                    var ver = targetProj.versions[v];
                    var opt = document.createElement('option');
                    opt.value = ver.id;
                    opt.textContent = ver.name;
                    verSelect.appendChild(opt);
                }
                verSelect.style.display = 'inline-block';
            } else {
                verSelect.style.display = 'none';
            }
        } else {
            verSelect.style.display = 'none';
        }
    }
    renderAnnotationDashboard();
}
window.onAnnoProjectFilterChange = onAnnoProjectFilterChange;

function onAnnoVersionFilterChange(val) {
    currentAnnoVerFilter = parseInt(val, 10) || 0;
    renderAnnotationDashboard();
}
window.onAnnoVersionFilterChange = onAnnoVersionFilterChange;

function renderDashboardCharts(range) {
    if (range) currentTrendRange = range;
    if (typeof echarts === 'undefined') {
        ensureEchartsLoaded().then(function(ec) {
            if (ec) {
                renderDashboardCharts();
                resizeDashboardCharts();
            }
        });
        return;
    }

    var data = window.DASHBOARD_DATA || {};

    // 1. 批注待办与闭环占比环形图 + 详情卡
    renderAnnotationDashboard();

    // 2. 查阅走势多角色堆叠面积图 (内部审阅人 / 管理与协作者 / 外发访客)
    var trendDom = document.getElementById('chartTrend');
    if (trendDom) {
        var CHART_PALETTE = getDashboardChartPalette();
        if (!chartTrend) {
            chartTrend = echarts.init(trendDom);
        }
        var trendData = (currentTrendRange === '30d') ? (data.trend30d || {}) : (data.trend7d || {});
        var labels = trendData.labels || [];
        var dates = trendData.dates || [];
        var valsViewer = trendData.values_viewer || [];
        var valsEditor = trendData.values_editor || [];
        var valsShare = trendData.values_share || [];
        var valsTotal = trendData.values_total || trendData.values || [];

        var hasPositiveVal = function(arr) {
            for (var i = 0; i < arr.length; i++) {
                if (Number(arr[i]) > 0) return true;
            }
            return false;
        };

        var nameGuest = (typeof t === 'function' ? t('admin.dash.legend_guest', null, '外发访客') : '外发访客');
        var nameViewer = (typeof t === 'function' ? t('admin.dash.legend_viewer', null, '内部审阅人') : '内部审阅人');
        var nameEditor = (typeof t === 'function' ? t('admin.dash.legend_editor', null, '管理与协作者') : '管理与协作者');

        var trendRoleDefs = [
            {
                name: nameGuest,
                data: valsShare,
                color: CHART_PALETTE.warning,
                areaTop: 'rgba(217, 119, 6, 0.46)',
                areaBottom: 'rgba(217, 119, 6, 0.20)'
            },
            {
                name: nameViewer,
                data: valsViewer,
                color: CHART_PALETTE.success,
                areaTop: 'rgba(22, 163, 74, 0.46)',
                areaBottom: 'rgba(22, 163, 74, 0.20)'
            },
            {
                name: nameEditor,
                data: valsEditor,
                color: CHART_PALETTE.primary,
                areaTop: 'rgba(0, 118, 222, 0.46)',
                areaBottom: 'rgba(0, 118, 222, 0.20)'
            }
        ];

        var trendSeries = [];
        for (var r = 0; r < trendRoleDefs.length; r++) {
            var def = trendRoleDefs[r];
            var isRoleActive = hasPositiveVal(def.data);
            trendSeries.push({
                name: def.name,
                type: 'line',
                stack: 'pv_stack',
                smooth: true,
                showSymbol: false,
                symbolSize: isRoleActive ? function(val) { return Number(val) > 0 ? 6 : 0; } : 0,
                data: def.data,
                lineStyle: { width: isRoleActive ? 1.8 : 0, opacity: isRoleActive ? 1 : 0, color: def.color },
                itemStyle: { color: def.color },
                emphasis: { disabled: !isRoleActive },
                areaStyle: isRoleActive ? {
                    opacity: 1,
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: def.areaTop },
                        { offset: 1, color: def.areaBottom }
                    ])
                } : { opacity: 0 }
            });
        }

        var tooltipOrder = {};
        tooltipOrder[nameViewer] = 0;
        tooltipOrder[nameEditor] = 1;
        tooltipOrder[nameGuest] = 2;

        chartTrend.setOption({
            tooltip: {
                trigger: 'axis',
                confine: true,
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                borderColor: 'transparent',
                textStyle: { color: CHART_PALETTE.surface, fontSize: 12 },
                formatter: function(params) {
                    if (!params || !params.length) return '';
                    var idx = params[0].dataIndex;
                    var dateStr = dates[idx] || params[0].name;
                    var total = (valsTotal && typeof valsTotal[idx] !== 'undefined') ? valsTotal[idx] : 0;
                    var ordered = params.slice().sort(function(a, b) {
                        var oa = typeof tooltipOrder[a.seriesName] === 'number' ? tooltipOrder[a.seriesName] : 99;
                        var ob = typeof tooltipOrder[b.seriesName] === 'number' ? tooltipOrder[b.seriesName] : 99;
                        return oa - ob;
                    });
                    var viewsLabel = (typeof t === 'function' ? t('admin.dash.tooltip_views', { n: total }, '累计查阅 ' + total + ' 次') : '累计查阅 ' + total + ' 次');
                    var html = '<div style="font-size:11.5px;color:rgba(255,255,255,0.65);margin-bottom:4px;">' + esc(dateStr) + '</div>';
                    html += '<div style="font-size:12.5px;font-weight:700;color:' + CHART_PALETTE.surface + ';margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.12);">' + esc(viewsLabel) + '</div>';
                    for (var p = 0; p < ordered.length; p++) {
                        var item = ordered[p];
                        var itemCntLabel = (typeof t === 'function' ? t('admin.dash.tooltip_cnt', { n: item.value }, item.value + ' 次') : item.value + ' 次');
                        html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:11.5px;color:rgba(255,255,255,0.85);margin-top:2px;">' +
                               '<span>' + item.marker + ' ' + esc(item.seriesName) + '</span>' +
                               '<span style="font-weight:600;color:' + CHART_PALETTE.surface + ';">' + esc(itemCntLabel) + '</span>' +
                               '</div>';
                    }
                    return html;
                }
            },
            grid: { top: 12, right: 15, bottom: 20, left: 35 },
            xAxis: {
                type: 'category',
                data: labels,
                boundaryGap: false,
                axisLine: { lineStyle: { color: CHART_PALETTE.border } },
                axisLabel: { color: CHART_PALETTE.text3, fontSize: 10 }
            },
            yAxis: {
                type: 'value',
                minInterval: 1,
                splitLine: { lineStyle: { color: CHART_PALETTE.border, type: 'dashed' } },
                axisLabel: { color: CHART_PALETTE.text3, fontSize: 10 }
            },
            series: trendSeries
        }, true);
    }
}
window.renderDashboardCharts = renderDashboardCharts;

function switchTrendRange(range) {
    if (range === '30d') {
        $('#tabTrend7d').removeClass('active');
        $('#tabTrend30d').addClass('active');
    } else {
        $('#tabTrend30d').removeClass('active');
        $('#tabTrend7d').addClass('active');
    }
    renderDashboardCharts(range);
}
window.switchTrendRange = switchTrendRange;

function resizeDashboardCharts() {
    if (chartAnnotationDonut) chartAnnotationDonut.resize();
    if (chartTrend) chartTrend.resize();
}
window.resizeDashboardCharts = resizeDashboardCharts;
window.addEventListener('resize', resizeDashboardCharts);

/* ===================== 系统审计日志管理 (登录日志与原型访问日志) ===================== */
var currentLogSubTab = 'login';

function switchLogSubTab(subTab) {
    currentLogSubTab = subTab;
    if (subTab === 'login') {
        $('#subtab-btn-login').addClass('active');
        $('#subtab-btn-access').removeClass('active');
        $('#logBoxLogin').show();
        $('#logBoxAccess').hide();
        if (typeof triggerTabTransition === 'function') triggerTabTransition(document.getElementById('logBoxLogin'));
    } else {
        $('#subtab-btn-access').addClass('active');
        $('#subtab-btn-login').removeClass('active');
        $('#logBoxLogin').hide();
        $('#logBoxAccess').show();
        if (typeof triggerTabTransition === 'function') triggerTabTransition(document.getElementById('logBoxAccess'));
    }
}

function loadLogsData() {
    fetch('api.php?action=log_list&type=all')
    .then(function(r) { return r.json(); })
    .then(function(res) {
        if (!res.success) {
            showToast(res.message || (typeof t === 'function' ? t('admin.logs.fetch_failed', null, '获取日志失败') : '获取日志失败'), 'warning');
            return;
        }
        var data = res.data || {};
        var lblUnknownDev = (typeof t === 'function' ? t('common.unknown_device', null, '未知设备') : '未知设备');
        
        // 渲染登录日志
        var loginLogs = data.login_logs || [];
        var loginTbody = document.getElementById('loginLogsTableBody');
        if (loginTbody) {
            if (loginLogs.length === 0) {
                loginTbody.innerHTML = '<tr><td colspan="6" style="padding:32px;text-align:center;color:var(--text-3);font-size:13px;"><i class="ri-shield-check-line" style="font-size:24px;color:var(--success);display:block;margin-bottom:6px;opacity:0.8;"></i>' + esc(typeof t === 'function' ? t('admin.logs.login_empty_detail', null, '近期风平浪静，暂无异常登录记录') : '近期风平浪静，暂无异常登录记录') + '</td></tr>';
            } else {
                var lHtml = '';
                var lblLoginOk = esc(typeof t === 'function' ? t('admin.logs.login_ok', null, '成功') : '成功');
                var lblLoginFail = esc(typeof t === 'function' ? t('admin.logs.login_fail', null, '失败') : '失败');
                loginLogs.forEach(function(l) {
                    var statusBadge = (parseInt(l.status, 10) === 1)
                        ? '<span class="badge-tag badge-success">' + lblLoginOk + '</span>'
                        : '<span class="badge-tag badge-danger">' + lblLoginFail + '</span>';
                    var userDisplay = esc(l.username || '');
                    if (userDisplay && userDisplay.indexOf('@') === -1) {
                        userDisplay = '@' + userDisplay;
                    }
                    lHtml += `
                        <tr style="border-bottom:1px solid var(--border);">
                            <td style="padding:9px 12px;color:var(--text-3);font-size:12px;">${esc(l.created_at)}</td>
                            <td style="padding:9px 12px;font-weight:600;color:var(--text-1);">${userDisplay}</td>
                            <td style="padding:9px 12px;">${statusBadge}</td>
                            <td style="padding:9px 12px;font-family:ui-monospace,monospace;font-size:12px;color:var(--text-2);">${esc(l.ip)}</td>
                            <td style="padding:9px 12px;color:var(--text-2);font-size:12.5px;" title="${esc(l.user_agent || '')}">${esc(l.device || lblUnknownDev)}</td>
                            <td style="padding:9px 12px;color:var(--text-3);font-size:12.5px;">${esc(l.message || '')}</td>
                        </tr>
                    `;
                });
                loginTbody.innerHTML = lHtml;
            }
        }

        // 渲染原型访问日志
        var accessLogs = data.access_logs || [];
        var accessTbody = document.getElementById('accessLogsTableBody');
        if (accessTbody) {
            if (accessLogs.length === 0) {
                accessTbody.innerHTML = '<tr><td colspan="6" style="padding:32px;text-align:center;color:var(--text-3);font-size:13px;"><i class="ri-radar-line" style="font-size:24px;color:var(--primary);display:block;margin-bottom:6px;opacity:0.8;"></i>' + esc(typeof t === 'function' ? t('admin.logs.access_empty_detail', null, '暂无外部访问，生成外发链接后在此洞察浏览动态') : '暂无外部访问，生成外发链接后在此洞察浏览动态') + '</td></tr>';
            } else {
                var aHtml = '';
                var lblShare = esc(typeof t === 'function' ? t('admin.logs.channel_share', null, '独立短链') : '独立短链');
                var lblWs = esc(typeof t === 'function' ? t('admin.logs.channel_workspace', null, '工作台') : '工作台');
                accessLogs.forEach(function(al) {
                    var typeBadge = (al.access_type === 'share')
                        ? '<span class="badge-tag badge-primary">' + lblShare + '</span>'
                        : '<span class="badge-tag badge-neutral">' + lblWs + '</span>';
                    aHtml += `
                        <tr style="border-bottom:1px solid var(--border);">
                            <td style="padding:9px 12px;color:var(--text-3);font-size:12px;">${esc(al.created_at)}</td>
                            <td style="padding:9px 12px;font-weight:600;color:var(--text-1);">${esc(al.item_name)}</td>
                            <td style="padding:9px 12px;color:var(--primary);font-weight:500;">${esc(al.version_name || '-')}</td>
                            <td style="padding:9px 12px;">${typeBadge}</td>
                            <td style="padding:9px 12px;font-family:ui-monospace,monospace;font-size:12px;color:var(--text-2);">${esc(al.ip)}</td>
                            <td style="padding:9px 12px;color:var(--text-2);font-size:12.5px;" title="${esc(al.user_agent || '')}">${esc(al.device || lblUnknownDev)}</td>
                        </tr>
                    `;
                });
                accessTbody.innerHTML = aHtml;
            }
        }
    }).catch(function(err) {
        showToast((typeof t === 'function' ? t('admin.logs.fetch_retry', null, '获取日志失败，请稍后重试') : '获取日志失败，请稍后重试'), 'error');
    });
}

function handleClearLogs() {
    showConfirm({
        title: (typeof t === 'function' ? t('admin.logs.clear_title', null, '清空日志') : '清空日志'),
        message: (typeof t === 'function' ? t('admin.logs.clear_confirm', null, '清空所有登录和访问日志？此操作无法撤销。') : '清空所有登录和访问日志？此操作无法撤销。'),
        confirmText: (typeof t === 'function' ? t('admin.logs.clear_btn', null, '清空日志') : '清空日志'),
        isDanger: true,
        onConfirm: function() {
            var fd = new FormData();
            fd.append('type', 'all');
            adminFetch('log_clear', fd).then(function(res) {
                if (res.success) {
                    showToast((typeof t === 'function' ? t('admin.logs.cleared', null, '日志已清空') : '日志已清空'), 'success');
                    loadLogsData();
                } else {
                    showToast(res.message || (typeof t === 'function' ? t('admin.logs.clear_failed', null, '清空失败') : '清空失败'), 'error');
                }
            }).catch(function() {
                showToast((typeof t === 'function' ? t('admin.logs.clear_net_failed', null, '网络异常，清空失败') : '网络异常，清空失败'), 'error');
            });
        }
    });
}

function openUserModal() {
    openAdminConsole('users');
}

function openSettingsModal() {
    openAdminConsole('brand');
}

function openRolesModal() {
    openAdminConsole('roles');
}

// 控制中心动效规范：遵循 Linear 标准，严禁在原生 table-row 上使用 FLIP 绝对定位补间
// 保持表格结构稳定与零重排，条目删除即时从 DOM 移除，下方行瞬时贴合
function initAdminFluidAnimations() {
    // No-op: 遵循 Linear 原则，禁用表格 FLIP 动画以杜绝变高变窄与布局抖动
}
window.initAdminFluidAnimations = initAdminFluidAnimations;

// 页面加载完成后自动绑定管理端特性
$(document).ready(function() {
    initDragAndDrop();
    initAdminFluidAnimations();
    // 检查是否有由于操作刷新需要保持打开的控制中心 Tab
    var reopenTab = sessionStorage.getItem('reopen_admin_tab');
    if (reopenTab) {
        sessionStorage.removeItem('reopen_admin_tab');
        openAdminConsole(reopenTab);
        var subTab = sessionStorage.getItem('reopen_overview_subtab');
        if (subTab) {
            sessionStorage.removeItem('reopen_overview_subtab');
            switchOverviewSubTab(subTab);
        }
        var catFilter = sessionStorage.getItem('selected_project_cat_filter');
        if (catFilter && document.getElementById('filterProjectCategory')) {
            document.getElementById('filterProjectCategory').value = catFilter;
            filterProjectsByCategory(catFilter);
        }
    }
});

/* ===================== 7. 原型版本管理与删除 (体验优先，极简克制) ===================== */
var currentVerManageItemId = 0;
var currentVerManageProjectName = '';
var currentVerManageCanEdit = false;
var currentVerManageAllVersions = [];
var currentVerManageFilteredVersions = [];
var currentVerManageSearchKeyword = '';
var currentVerManagePage = 1;
var VER_MANAGE_PAGE_SIZE = 10;

function publishFromVerManage() {
    var targetItemId = currentVerManageItemId;
    var targetItemName = currentVerManageProjectName;
    closeModal('versionManageModal');
    openUploadModal(targetItemId, targetItemName);
}
window.publishFromVerManage = publishFromVerManage;

function openCurrentVersionManage() {
    if (typeof currentSelectedItemId !== 'undefined' && currentSelectedItemId) {
        openVersionManageModal(currentSelectedItemId);
    }
}

function openVersionManageModal(itemId, keepPageState) {
    currentVerManageItemId = itemId;
    // 优先从后台控制中心表格行取数据，若无则从前台树节点取数据
    var $adminRow = $('#admin-item-row-' + itemId);
    var $treeNode = $('#item-node-' + itemId);
    var $node = $adminRow.length ? $adminRow : $treeNode;

    var projectName = $node.data('name') || ($treeNode.length ? $treeNode.data('name') : (typeof t === 'function' ? t('admin.proj.col_project', null, '项目') : '项目'));
    currentVerManageProjectName = projectName;
    var isCurrentUserAdmin = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.role === 'admin');
    var nodeCanEdit = ($node.data('can-edit') === 1 || $node.data('can-edit') === '1');
    currentVerManageCanEdit = isCurrentUserAdmin || nodeCanEdit;

    // 仅具备发版/编辑权限的成员可见顶部「发布新版本」快捷入口 (使用 hidden 属性防止被 !important 覆盖)
    var publishBtn = document.getElementById('btnVerManagePublish');
    if (publishBtn) {
        if (currentVerManageCanEdit) {
            publishBtn.removeAttribute('hidden');
        } else {
            publishBtn.setAttribute('hidden', '');
        }
    }

    $('#verManageTitle').text((typeof t === 'function' ? t('ver.manage_project_title', { name: projectName }, '版本管理 · ' + projectName) : '版本管理 · ' + projectName));

    var versions = $node.data('versions') || [];
    if (typeof versions === 'string') {
        try { versions = JSON.parse(versions); } catch(e) { versions = []; }
    }
    if ((!versions || versions.length === 0) && $treeNode.length) {
        var treeVers = $treeNode.data('versions');
        if (typeof treeVers === 'string') {
            try { treeVers = JSON.parse(treeVers); } catch(e) { treeVers = []; }
        }
        if (treeVers && treeVers.length) {
            versions = treeVers;
        }
    }

    currentVerManageAllVersions = versions || [];

    if (!keepPageState) {
        currentVerManageSearchKeyword = '';
        currentVerManagePage = 1;
        var sInput = document.getElementById('verManageSearchInput');
        if (sInput) sInput.value = '';
        var sClear = document.getElementById('verManageSearchClear');
        if (sClear) sClear.style.display = 'none';
    }

    renderVersionManageView();
    openModal('versionManageModal', 'versionManageModal');
}

function handleVerManageSearch(val) {
    currentVerManageSearchKeyword = (val || '').trim();
    currentVerManagePage = 1;
    var sClear = document.getElementById('verManageSearchClear');
    if (sClear) {
        sClear.style.display = currentVerManageSearchKeyword ? 'flex' : 'none';
    }
    renderVersionManageView();
}

function clearVerManageSearch() {
    var sInput = document.getElementById('verManageSearchInput');
    if (sInput) sInput.value = '';
    handleVerManageSearch('');
}

function gotoVerManagePage(page) {
    currentVerManagePage = page;
    renderVersionManageView();
    var wrapEl = document.getElementById('verManageTableWrap');
    if (wrapEl) wrapEl.scrollTop = 0;
}

function renderVersionManageView() {
    var totalVersions = currentVerManageAllVersions.length;
    var kw = currentVerManageSearchKeyword.toLowerCase();

    // 头部数量徽标
    var $countBadge = $('#verManageCountBadge');
    if (totalVersions > 0) {
        $countBadge.text((typeof t === 'function' ? t('ver.total_badge', { n: totalVersions }, '共 ' + totalVersions + ' 个版本') : '共 ' + totalVersions + ' 个版本')).show();
    } else {
        $countBadge.hide();
    }

    // 搜索框显示控制：有多个版本时展示搜索框
    var $searchWrap = $('#verManageSearchWrap');
    if (totalVersions > 1) {
        $searchWrap.show();
    } else {
        $searchWrap.hide();
    }

    // 搜索过滤逻辑
    if (kw) {
        currentVerManageFilteredVersions = currentVerManageAllVersions.filter(function(v) {
            var vName = (v.version_name || '').toLowerCase();
            var creator = (v.creator_name || '').toLowerCase();
            var log = (v.changelog || '').toLowerCase();
            return vName.indexOf(kw) !== -1 || creator.indexOf(kw) !== -1 || log.indexOf(kw) !== -1;
        });
    } else {
        currentVerManageFilteredVersions = currentVerManageAllVersions.slice();
    }

    var filteredCount = currentVerManageFilteredVersions.length;
    var totalPages = Math.max(1, Math.ceil(filteredCount / VER_MANAGE_PAGE_SIZE));
    if (currentVerManagePage > totalPages) currentVerManagePage = totalPages;
    if (currentVerManagePage < 1) currentVerManagePage = 1;

    var startIdx = (currentVerManagePage - 1) * VER_MANAGE_PAGE_SIZE;
    var pageVersions = currentVerManageFilteredVersions.slice(startIdx, startIdx + VER_MANAGE_PAGE_SIZE);

    var $tbody = $('#verManageTableBody');
    var $table = $('#verManageTable');
    var $empty = $('#verManageEmpty');
    $tbody.empty();

    if (totalVersions === 0) {
        $table.hide();
        var emptyBtnHtml = currentVerManageCanEdit
            ? '<button type="button" class="btn-primary btn-md" onclick="quickOpenUploadFromVersionManage()"><span class="duo-icon-slot" data-duo-icon="cloud-upload"><i class="ri-upload-cloud-line duo-rest-icon"></i></span> ' + esc(typeof t === 'function' ? t('ver.publish_first', null, '发布首个版本') : '发布首个版本') + '</button>'
            : '<span style="font-size:12px;color:var(--text-3);">' + esc(typeof t === 'function' ? t('ver.no_public_versions', null, '此项目暂未发布任何公开版本') : '此项目暂未发布任何公开版本') + '</span>';
        $empty.html(
            '<div class="m-empty-icon"><i class="ri-draft-line"></i></div>' +
            '<div style="font-size:13px;font-weight:550;color:var(--text-2);margin-bottom:3px;">' + esc(typeof t === 'function' ? t('ver.empty_title', null, '坑位已建好，静待第一份图纸') : '坑位已建好，静待第一份图纸') + '</div>' +
            '<div style="font-size:11.5px;color:var(--text-3);margin-bottom:12px;">' + esc(typeof t === 'function' ? t('ver.empty_desc', null, '研发已准备就绪，丢个原型 ZIP 上来即刻开跑') : '研发已准备就绪，丢个原型 ZIP 上来即刻开跑') + '</div>' +
            emptyBtnHtml
        ).show();
        $('#verManagePagination').hide();
        return;
    }

    if (filteredCount === 0) {
        $table.hide();
        $empty.html(
            '<div style="font-size:24px;color:var(--text-3);margin-bottom:8px;"><i class="ri-search-line"></i></div>' +
            '<div style="font-size:13px;font-weight:550;color:var(--text-2);margin-bottom:4px;">' + esc(typeof t === 'function' ? t('ver.search_empty_title', null, '未找到匹配的版本') : '未找到匹配的版本') + '</div>' +
            '<div style="font-size:11.5px;color:var(--text-3);margin-bottom:12px;">' + esc(typeof t === 'function' ? t('ver.search_empty_desc', null, '尝试更换关键词或清空搜索条件') : '尝试更换关键词或清空搜索条件') + '</div>' +
            '<button type="button" class="btn-cancel btn-sm" onclick="clearVerManageSearch()">' + esc(typeof t === 'function' ? t('ver.clear_filter', null, '清空筛选') : '清空筛选') + '</button>'
        ).show();
        $('#verManagePagination').hide();
        return;
    }

    $empty.hide();
    $table.show();

    var lblDefProtectedTip = esc(typeof t === 'function' ? t('ver.default_protected_tip', null, '默认版本受保护，请先将其他版本设为默认') : '默认版本受保护，请先将其他版本设为默认');
    var lblDelVerTip = esc(typeof t === 'function' ? t('ver.delete_btn', null, '删除此版本') : '删除此版本');
    var lblProtected = esc(typeof t === 'function' ? t('common.protected', null, '受保护') : '受保护');
    var lblHtmlPkgTip = esc(typeof t === 'function' ? t('ver.html_pkg_tip', null, 'HTML 原型包大小') : 'HTML 原型包大小');
    var lblRpUploaded = (typeof t === 'function' ? t('ver.rp_uploaded', null, '已上传') : '已上传');
    var lblRpSourceTip = esc(typeof t === 'function' ? t('ver.rp_source_tip', null, 'Axure RP 底稿源文件') : 'Axure RP 底稿源文件');
    var lblRpEmptyTip = esc(typeof t === 'function' ? t('ver.rp_empty_tip', null, '未上传底稿') : '未上传底稿');
    var lblRpEmpty = esc(typeof t === 'function' ? t('ver.rp_empty_label', null, '无 RP 底稿') : '无 RP 底稿');
    var lblVerEditTip = esc(typeof t === 'function' ? t('ver.edit_btn_tip', null, '编辑版本名称与更新日志') : '编辑版本名称与更新日志');
    var lblVerEditShort = esc(typeof t === 'function' ? t('common.edit', null, '编辑') : '编辑');
    var lblRpReplaceTip = esc(typeof t === 'function' ? t('ver.rp_replace_tip', null, '重新上传并替换 RP 底稿') : '重新上传并替换 RP 底稿');
    var lblRpReplaceShort = esc(typeof t === 'function' ? t('ver.rp_replace_short', null, '更换RP') : '更换RP');
    var lblRpRemoveTip = esc(typeof t === 'function' ? t('ver.rp_remove_tip', null, '移除此版本的 RP 底稿') : '移除此版本的 RP 底稿');
    var lblRpRemoveShort = esc(typeof t === 'function' ? t('ver.rp_remove_short', null, '移除RP') : '移除RP');
    var lblRpAddTip = esc(typeof t === 'function' ? t('ver.rp_add_tip', null, '为此版本补传 Axure RP 底稿') : '为此版本补传 Axure RP 底稿');
    var lblRpAddShort = esc(typeof t === 'function' ? t('ver.rp_add_short', null, '补传RP') : '补传RP');
    var lblSetDefTip = esc(typeof t === 'function' ? t('ver.set_default_tip', null, '设为访客默认访问版本') : '设为访客默认访问版本');
    var lblSetDefShort = esc(typeof t === 'function' ? t('ver.set_default_short', null, '设为默认') : '设为默认');
    var lblNoChangelog = esc(typeof t === 'function' ? t('ver.no_changelog', null, '此版本未填写更新说明') : '此版本未填写更新说明');
    var lblDefaultBadgeTip = esc(typeof t === 'function' ? t('ver.default_badge_tip', null, '访客默认访问版本') : '访客默认访问版本');
    var lblDefaultBadge = esc(typeof t === 'function' ? t('ver.default_badge', null, '默认') : '默认');

    // 渲染结构化版本流卡片 (Linear 极简风 · 优雅无截断)
    pageVersions.forEach(function(ver) {
        var isDef = (parseInt(ver.is_default, 10) === 1);
        var safeVerName = esc(ver.version_name || 'V1.0');
        var hasRp = !!ver.rp_file;
        var creatorName = ver.creator_name ? esc(ver.creator_name) : '';
        var timeStr = esc(ver.updated_at || ver.created_at || '');

        var verCreatedBy = parseInt(ver.created_by || 0, 10);
        var isCurrentUserAdmin = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.role === 'admin');
        var currentUserId = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) ? parseInt(CURRENT_USER.id, 10) : 0;
        var canDelThisVer = currentVerManageCanEdit && (isCurrentUserAdmin || (verCreatedBy === currentUserId));

        // 默认版本锁定保护：默认版本不允许直接删除
        var delBtnHtml = '';
        if (isDef) {
            delBtnHtml = '<button type="button" class="btn-cancel btn-sm btn-icon-only btn-ver-del" disabled title="' + lblDefProtectedTip + '"><span class="duo-icon-slot" data-duo-icon="trash"><i class="ri-delete-bin-line duo-rest-icon"></i></span></button>';
        } else if (canDelThisVer) {
            delBtnHtml = '<button type="button" class="btn-cancel btn-sm btn-icon-only btn-ver-del is-danger" onclick="handleDeleteVersion(' + ver.id + ', null, ' + currentVerManageItemId + ')" title="' + lblDelVerTip + '"><span class="duo-icon-slot" data-duo-icon="trash"><i class="ri-delete-bin-line duo-rest-icon"></i></span></button>';
        } else {
            delBtnHtml = '<span class="ver-protected-label" title="' + lblProtected + '">—</span>';
        }

        // HTML 原型包大小标签 (纯只读微徽标，高 24px)
        var htmlSizeLabel = (ver.file_size && parseInt(ver.file_size, 10) > 0) ? formatBytes(ver.file_size) : '—';
        var htmlAssetHtml = '<span class="m-badge m-badge-neutral ver-asset-pill" title="' + lblHtmlPkgTip + '"><i class="ri-file-zip-line"></i> ' + esc(typeof t === 'function' ? t('ver.html_pkg_label', { size: htmlSizeLabel }, '原型包 ' + htmlSizeLabel) : '原型包 ' + htmlSizeLabel) + '</span>';

        // Axure RP 底稿资产展示 (方案 1: 资产状态与维护操作彻底解耦，左侧为纯只读微徽标)
        var rpAssetHtml = '';
        if (hasRp) {
            var rpSizeLabel = (ver.rp_size && parseInt(ver.rp_size, 10) > 0) ? formatBytes(ver.rp_size) : lblRpUploaded;
            rpAssetHtml = '<span class="m-badge m-badge-primary ver-asset-pill ver-asset-rp" title="' + lblRpSourceTip + '"><i class="ri-draft-line"></i> ' + esc(typeof t === 'function' ? t('ver.rp_label', { size: rpSizeLabel }, 'RP 底稿 ' + rpSizeLabel) : 'RP 底稿 ' + rpSizeLabel) + '</span>';
        } else {
            rpAssetHtml = '<span class="m-badge m-badge-neutral ver-asset-pill ver-asset-empty" title="' + lblRpEmptyTip + '"><i class="ri-draft-line"></i> ' + lblRpEmpty + '</span>';
        }

        // 发版人与更新时间
        var authorHtml = creatorName
            ? ('<span class="ver-card-author"><i class="ri-user-line"></i>' + creatorName + '</span>')
            : '<span class="ver-protected-label">—</span>';

        // 统一右侧操作工具栏 (所有交互按钮规范排布，高度统一 28px)
        var actionsHtml = '';
        if (currentVerManageCanEdit) {
            actionsHtml += '<button type="button" class="btn-cancel btn-sm btn-ver-edit" onclick="openEditVersionModal(' + ver.id + ')" title="' + lblVerEditTip + '"><span class="duo-icon-slot" data-duo-icon="pencil"><i class="ri-edit-line duo-rest-icon"></i></span> ' + lblVerEditShort + '</button>';
            if (hasRp && canDelThisVer) {
                actionsHtml += '<button type="button" class="btn-cancel btn-sm" onclick="triggerRpUploadForVersion(' + ver.id + ', ' + currentVerManageItemId + ', true)" title="' + lblRpReplaceTip + '"><span class="duo-icon-slot" data-duo-icon="repeat"><i class="ri-repeat-line duo-rest-icon"></i></span> ' + lblRpReplaceShort + '</button>';
                actionsHtml += '<button type="button" class="btn-cancel btn-sm is-danger" onclick="handleRemoveRp(' + ver.id + ', ' + currentVerManageItemId + ')" title="' + lblRpRemoveTip + '"><span class="duo-icon-slot" data-duo-icon="trash"><i class="ri-delete-bin-line duo-rest-icon"></i></span> ' + lblRpRemoveShort + '</button>';
            } else if (canDelThisVer) {
                actionsHtml += '<button type="button" class="btn-cancel btn-sm btn-table-rp-add" onclick="triggerRpUploadForVersion(' + ver.id + ', ' + currentVerManageItemId + ', false)" title="' + lblRpAddTip + '"><span class="duo-icon-slot" data-duo-icon="upload"><i class="ri-upload-2-line duo-rest-icon"></i></span> ' + lblRpAddShort + '</button>';
            }
            if (!isDef) {
                actionsHtml += '<button type="button" class="btn-cancel btn-sm btn-ver-default" onclick="handleSetDefaultVersion(' + ver.id + ', ' + currentVerManageItemId + ')" title="' + lblSetDefTip + '"><span class="duo-icon-slot" data-duo-icon="circle-check"><i class="ri-checkbox-circle-line duo-rest-icon"></i></span> ' + lblSetDefShort + '</button>';
            }
            actionsHtml += delBtnHtml;
        } else {
            actionsHtml += '<span class="ver-protected-label" title="' + lblProtected + '">—</span>';
        }

        // 更新日志卡片
        var logBodyHtml = '';
        if (ver.changelog && ver.changelog.trim()) {
            logBodyHtml = '<div class="ver-card-body">' +
                '<div class="ver-card-log">' +
                    '<i class="ri-file-list-2-line ver-card-log-icon"></i>' +
                    '<div class="ver-card-log-text">' + (typeof renderMarkdownSafe === 'function' ? renderMarkdownSafe(ver.changelog) : esc(ver.changelog)) + '</div>' +
                '</div>' +
            '</div>';
        } else {
            logBodyHtml = '<div class="ver-card-body ver-card-body-empty">' +
                '<div class="ver-card-log">' +
                    '<i class="ri-information-line ver-card-log-icon"></i>' +
                    '<span class="ver-card-log-empty">' + lblNoChangelog + '</span>' +
                '</div>' +
            '</div>';
        }

        var cardHtml = '<div id="ver-row-' + ver.id + '" class="ver-card ' + (isDef ? 'is-default' : '') + '">' +
            '<div class="ver-card-header">' +
                '<div class="ver-card-title-wrap">' +
                    '<span class="ver-manage-name ver-card-name">' + safeVerName + '</span>' +
                    (isDef ? '<span class="m-badge m-badge-success ver-badge-default" title="' + lblDefaultBadgeTip + '"><i class="ri-check-line"></i> ' + lblDefaultBadge + '</span>' : '') +
                '</div>' +
                '<div class="ver-card-meta">' +
                    authorHtml +
                    '<span class="ver-card-separator">·</span>' +
                    '<span class="ver-card-time"><i class="ri-time-line"></i>' + (timeStr || '—') + '</span>' +
                '</div>' +
            '</div>' +
            logBodyHtml +
            '<div class="ver-card-footer">' +
                '<div class="ver-card-assets">' +
                    htmlAssetHtml +
                    rpAssetHtml +
                '</div>' +
                '<div class="ver-manage-actions">' +
                    actionsHtml +
                '</div>' +
            '</div>' +
        '</div>';

        $tbody.append(cardHtml);
    });

    // 渲染分页条
    var $pagination = $('#verManagePagination');
    if (filteredCount > VER_MANAGE_PAGE_SIZE) {
        $pagination.show();
        var filteredTag = kw ? (typeof t === 'function' ? t('ver.filtered_tag', null, ' (筛选)') : ' (筛选)') : '';
        var infoText = (typeof t === 'function' ? t('ver.page_info', { n: filteredCount, filtered: filteredTag, page: currentVerManagePage, total: totalPages }, '共 ' + filteredCount + ' 个版本' + filteredTag + ' · 第 ' + currentVerManagePage + '/' + totalPages + ' 页') : '共 ' + filteredCount + ' 个版本' + filteredTag + ' · 第 ' + currentVerManagePage + '/' + totalPages + ' 页');
        $('#verPaginationInfo').text(infoText);

        var tipPrevPage = esc(typeof t === 'function' ? t('share.prev_page', null, '上一页') : '上一页');
        var tipNextPage = esc(typeof t === 'function' ? t('share.next_page', null, '下一页') : '下一页');
        var navHtml = '';
        navHtml += '<button type="button" class="btn-cancel btn-sm btn-ver-page" ' + (currentVerManagePage <= 1 ? 'disabled' : '') + ' onclick="gotoVerManagePage(' + (currentVerManagePage - 1) + ')" title="' + tipPrevPage + '"><i class="ri-arrow-left-s-line"></i></button>';

        var maxButtons = 5;
        var startPage = Math.max(1, currentVerManagePage - 2);
        var endPage = Math.min(totalPages, startPage + maxButtons - 1);
        if (endPage - startPage < maxButtons - 1) {
            startPage = Math.max(1, endPage - maxButtons + 1);
        }

        if (startPage > 1) {
            navHtml += '<button type="button" class="btn-cancel btn-sm btn-ver-page" onclick="gotoVerManagePage(1)">1</button>';
            if (startPage > 2) {
                navHtml += '<span class="ver-pagination-ellipsis">…</span>';
            }
        }

        for (var p = startPage; p <= endPage; p++) {
            navHtml += '<button type="button" class="btn-cancel btn-sm btn-ver-page' + (p === currentVerManagePage ? ' active' : '') + '" onclick="gotoVerManagePage(' + p + ')">' + p + '</button>';
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                navHtml += '<span class="ver-pagination-ellipsis">…</span>';
            }
            navHtml += '<button type="button" class="btn-cancel btn-sm btn-ver-page" onclick="gotoVerManagePage(' + totalPages + ')">' + totalPages + '</button>';
        }

        navHtml += '<button type="button" class="btn-cancel btn-sm btn-ver-page" ' + (currentVerManagePage >= totalPages ? 'disabled' : '') + ' onclick="gotoVerManagePage(' + (currentVerManagePage + 1) + ')" title="' + tipNextPage + '"><i class="ri-arrow-right-s-line"></i></button>';

        $('#verPaginationBtns').html(navHtml);
    } else {
        $pagination.hide();
    }
}

function quickOpenUploadFromVersionManage() {
    closeModal('versionManageModal');
    if (currentVerManageItemId) {
        openUploadModal(currentVerManageItemId, currentVerManageProjectName);
    }
}

function openEditVersionModal(verId) {
    var targetVer = null;
    var list = currentVerManageAllVersions || [];
    for (var i = 0; i < list.length; i++) {
        if (parseInt(list[i].id, 10) === parseInt(verId, 10)) {
            targetVer = list[i];
            break;
        }
    }
    if (!targetVer) {
        showToast((typeof t === 'function' ? t('ver.not_found', null, '未找到该版本信息') : '未找到该版本信息'), 'warning');
        return;
    }

    var idInput = document.getElementById('editVerId');
    var itemInput = document.getElementById('editVerItemId');
    var nameInput = document.getElementById('editVerName');
    var logInput = document.getElementById('editVerChangelog');

    if (idInput) idInput.value = targetVer.id;
    if (itemInput) itemInput.value = currentVerManageItemId;
    if (nameInput) {
        nameInput.value = targetVer.version_name || '';
        if (nameInput.classList) nameInput.classList.remove('m-input-error');
    }
    if (logInput) logInput.value = targetVer.changelog || '';

    var saveBtn = document.getElementById('btnSaveVerEdit');
    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = esc(typeof t === 'function' ? t('common.save', null, '保存') : '保存');
    }

    openModal('versionEditModal', 'editVerName');
    if (nameInput && typeof nameInput.select === 'function') {
        nameInput.select();
    }
}

function handleVersionEditSubmit(e) {
    e.preventDefault();
    var idInput = document.getElementById('editVerId');
    var nameInput = document.getElementById('editVerName');
    var logInput = document.getElementById('editVerChangelog');
    var saveBtn = document.getElementById('btnSaveVerEdit');

    var verId = idInput ? parseInt(idInput.value, 10) : 0;
    var rawName = nameInput ? nameInput.value : '';
    var changelog = logInput ? logInput.value.trim() : '';

    var validation = validateVersionName(rawName);
    if (validation.error) {
        showToast(validation.error, 'warning');
        if (nameInput) {
            if (nameInput.classList) nameInput.classList.add('m-input-error');
            nameInput.focus();
        }
        return;
    }
    var newName = validation.name;

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> ' + esc(typeof t === 'function' ? t('common.saving', null, '保存中...') : '保存中...');
    }

    var fd = new FormData();
    fd.append('id', verId);
    fd.append('version_name', newName);
    fd.append('changelog', changelog);

    adminFetch('version_update', fd).then(function(res) {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = esc(typeof t === 'function' ? t('common.save', null, '保存') : '保存');
        }
        if (!res.success) {
            showToast(res.message || (typeof t === 'function' ? t('ver.update_failed', null, '更新失败') : '更新失败'), 'danger');
            return;
        }

        closeModal('versionEditModal');
        showToast(res.message || (typeof t === 'function' ? t('ver.updated', null, '版本信息已更新') : '版本信息已更新'), 'success');

        var itemId = currentVerManageItemId;
        // 1. 同步当前版本管理弹窗内存数组
        var isModifiedDefault = false;
        for (var i = 0; i < currentVerManageAllVersions.length; i++) {
            if (parseInt(currentVerManageAllVersions[i].id, 10) === verId) {
                currentVerManageAllVersions[i].version_name = newName;
                currentVerManageAllVersions[i].changelog = changelog;
                if (res.data && res.data.version && res.data.version.updated_at) {
                    currentVerManageAllVersions[i].updated_at = res.data.version.updated_at;
                }
                if (parseInt(currentVerManageAllVersions[i].is_default, 10) === 1) {
                    isModifiedDefault = true;
                }
                break;
            }
        }

        // 2. 重新渲染版本管理卡片列表
        renderVersionManageView();

        // 3. 同步 DOM 节点缓存 (后台控制中心表格行与左侧树节点)
        if (typeof hydrateAdminRowVersions === 'function') hydrateAdminRowVersions(itemId);
        $('#admin-item-row-' + itemId + ', #item-node-' + itemId).each(function() {
            var $node = $(this);
            var versions = $node.data('versions') || [];
            if (typeof versions === 'string') {
                try { versions = JSON.parse(versions); } catch(e) { versions = []; }
            }
            versions.forEach(function(existing) {
                if (parseInt(existing.id, 10) === verId) {
                    existing.version_name = newName;
                    existing.changelog = changelog;
                    if (res.data && res.data.version && res.data.version.updated_at) {
                        existing.updated_at = res.data.version.updated_at;
                    }
                }
            });
            $node.data('versions', versions).attr('data-versions', JSON.stringify(versions));
            if (isModifiedDefault) {
                $node.find('.badge-ver').text(newName);
            }
        });
        syncDashboardVersion(itemId, verId, newName);

        // 4. 同步右侧顶部栏展示
        if (typeof currentSelectedItemId !== 'undefined' && parseInt(currentSelectedItemId, 10) === parseInt(itemId, 10)) {
            var $barVerSelect = $('#barVerSelect');
            var isCurrentActive = false;
            if ($barVerSelect.length) {
                var $opt = $barVerSelect.find('option[data-ver-id="' + verId + '"]');
                if ($opt.length) {
                    $opt.text(newName);
                    $opt.attr('data-ver', newName).data('ver', newName);
                    $opt.data('changelog', changelog);
                    if ($opt.is(':selected')) isCurrentActive = true;
                }
            }
            var $treeNode = $('#item-node-' + itemId);
            if ($treeNode.length && parseInt($treeNode.data('ver-id'), 10) === verId) {
                $treeNode.data('ver', newName);
                $treeNode.data('changelog', changelog);
                isCurrentActive = true;
            }
            var $barVer = $('#barVer');
            if ($barVer.length && $barVer.is(':visible') && isCurrentActive) {
                $barVer.html('<i class="ri-git-branch-line"></i> ' + esc(newName));
            }
            if (isCurrentActive) {
                var $topLogTitleVer = $('#topChangelogVerName');
                var $topLogBody = $('#topChangelogBody');
                if ($topLogTitleVer.length) {
                    $topLogTitleVer.text(newName ? (' · ' + newName) : '');
                }
                if ($topLogBody.length) {
                    var safeRender = typeof renderMarkdownSafe === 'function' ? renderMarkdownSafe : renderMarkdown;
                    $topLogBody.html(changelog ? safeRender(changelog) : '<span style="color:var(--text-3);font-size:12px;">' + esc(typeof t === 'function' ? t('ver.no_changelog', null, '此版本未填写更新说明') : '此版本未填写更新说明') + '</span>');
                }
                if (changelog) {
                    $('#barChangelogBtn, #barChangelogWrap').show();
                } else {
                    $('#barChangelogBtn, #barChangelogWrap').hide();
                    $('#topChangelogPopover').hide();
                }
            }
        }
        if (typeof refreshCategoryTreeNewBadges === 'function') {
            refreshCategoryTreeNewBadges();
        }
    }).catch(function(err) {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = esc(typeof t === 'function' ? t('common.save', null, '保存') : '保存');
        }
        showToast((err && err.message) || (typeof t === 'function' ? t('common.network_error', null, '网络异常，请重试') : '网络异常，请重试'), 'danger');
    });
}

function handleSetDefaultVersion(verId, itemId) {
    var fd = new FormData();
    fd.append('id', verId);
    adminFetch('version_set_default', fd).then(function(res) {
        if (res.success) {
            showToast((typeof t === 'function' ? t('ver.set_default_ok', null, '已设为默认版本') : '已设为默认版本'), 'success');
            if (isAdminConsoleOpen()) {
                markAdminConsoleChanged();
                if (typeof hydrateAdminRowVersions === 'function') hydrateAdminRowVersions(itemId);
                var defaultVerName = '';
                $('#admin-item-row-' + itemId + ', #item-node-' + itemId).each(function() {
                    var $node = $(this);
                    var versions = $node.data('versions') || [];
                    if (typeof versions === 'string') {
                        try { versions = JSON.parse(versions); } catch(e) { versions = []; }
                    }
                    var updated = [];
                    versions.forEach(function(existing) {
                        var isDef = (parseInt(existing.id, 10) === parseInt(verId, 10));
                        if (isDef) defaultVerName = existing.version_name;
                        updated.push(Object.assign({}, existing, { is_default: isDef ? 1 : 0 }));
                    });
                    $node.data('versions', updated).attr('data-versions', JSON.stringify(updated));
                    if (defaultVerName) {
                        $node.find('.badge-ver').text(defaultVerName);
                    }
                });
                if (parseInt(currentVerManageItemId, 10) === parseInt(itemId, 10)) {
                    var curList = currentVerManageAllVersions || [];
                    curList.forEach(function(v) {
                        v.is_default = (parseInt(v.id, 10) === parseInt(verId, 10)) ? 1 : 0;
                    });
                    renderVersionManageView();
                }
                if (typeof refreshCategoryTreeNewBadges === 'function') {
                    refreshCategoryTreeNewBadges();
                }
            } else {
                window.location.hash = '#item=' + itemId;
                window.location.reload();
            }
        } else {
            showToast(res.message || (typeof t === 'function' ? t('common.op_failed', null, '操作失败') : '操作失败'), 'error');
        }
    });
}

function handleDeleteVersion(verId, verName, itemId) {
    var label = document.querySelector('#ver-row-' + parseInt(verId, 10) + ' .ver-manage-name');
    verName = label ? label.textContent : (verName || '');
    if (!verName.trim()) {
        showToast((typeof t === 'function' ? t('ver.missing_name_err', null, '无法获取版本名称，请刷新后重试') : '无法获取版本名称，请刷新后重试'), 'error');
        return;
    }
    showConfirm({
        title: (typeof t === 'function' ? t('ver.delete_title', null, '删除版本') : '删除版本'),
        message: (typeof t === 'function' ? t('ver.delete_confirm', { name: verName }, '删除版本「' + verName + '」及其原型文件和批注？此操作无法撤销。') : '删除版本「' + verName + '」及其原型文件和批注？此操作无法撤销。'),
        confirmText: (typeof t === 'function' ? t('ver.delete_btn', null, '删除版本') : '删除版本'),
        isDanger: true,
        onConfirm: function() {
            var fd = new FormData();
            fd.append('id', verId);
            adminFetch('version_delete', fd).then(function(res) {
                if (res.success) {
                    showToast((typeof t === 'function' ? t('ver.deleted', null, '版本已删除') : '版本已删除'), 'success');
                    if (isAdminConsoleOpen()) {
                        markAdminConsoleChanged();
                        if (typeof hydrateAdminRowVersions === 'function') hydrateAdminRowVersions(itemId);
                        var latest = [];
                        var newDefaultName = '-';
                        $('#admin-item-row-' + itemId + ', #item-node-' + itemId).each(function() {
                            var $node = $(this);
                            var versions = $node.data('versions') || [];
                            if (typeof versions === 'string') {
                                try { versions = JSON.parse(versions); } catch(e) { versions = []; }
                            }
                            latest = [];
                            versions.forEach(function(existing) {
                                if (parseInt(existing.id, 10) !== parseInt(verId, 10)) {
                                    latest.push(existing);
                                }
                            });
                            var defVer = latest.find(function(v) { return v.is_default; }) || latest[0];
                            newDefaultName = defVer ? defVer.version_name : '-';
                            $node.data('versions', latest).attr('data-versions', JSON.stringify(latest));
                            $node.find('.badge-ver').text(newDefaultName);
                            $node.find('.btn-table-ver').html('<span class="duo-icon-slot" data-duo-icon="history"><i class="ri-history-line duo-rest-icon"></i></span> ' + esc(typeof t === 'function' ? t('ver.count_btn', { n: latest.length }, latest.length + ' 个版本') : latest.length + ' 个版本'));
                        });
                        if (parseInt(currentVerManageItemId, 10) === parseInt(itemId, 10)) {
                            currentVerManageAllVersions = (currentVerManageAllVersions || []).filter(function(v) {
                                return parseInt(v.id, 10) !== parseInt(verId, 10);
                            });
                            renderVersionManageView();
                        }
                        syncDashboardRemoveVersion(itemId, verId);
                        if (typeof refreshCategoryTreeNewBadges === 'function') {
                            refreshCategoryTreeNewBadges();
                        }
                    } else {
                        window.location.hash = '#item=' + itemId;
                        window.location.reload();
                    }
                } else {
                    showToast(res.message || (typeof t === 'function' ? t('ver.delete_failed', null, '删除版本失败') : '删除版本失败'), 'error');
                }
            });
        }
    });
}

/* ===================== 原型分享设置弹窗 (极度克制·紧凑排版) ===================== */
/* ===================== 全局快速创建统一入口 ===================== */
function toggleQuickAddMenu(e) {
    if (e) e.stopPropagation();
    closeAllTreeMore();
    $('#quickAddWrap').toggleClass('open');
}

function closeQuickAddMenu() {
    $('#quickAddWrap').removeClass('open');
}

// 全局快速发版：优先默认选中当前项目，支持随时下拉切换其他项目
function openQuickUploadModal() {
    closeQuickAddMenu();
    resetQuickCreateFlow();
    var targetId = (typeof currentSelectedItemId !== 'undefined') ? currentSelectedItemId : null;
    var $sel = $('#uploadItemSelect');
    if (!$sel.length || !$sel.find('option').length) {
        if ($('.item-row[data-type="project"]').length > 0) {
            showToast((typeof t === 'function' ? t('workspace.no_publishable_projects', null, '暂无可发布版本的项目，请新建项目或联系创建者授权协作') : '暂无可发布版本的项目，请新建项目或联系创建者授权协作'), 'warning');
            return;
        }
        setQuickCreateFlow(createQuickCreateFlow('upload', true));
        openQuickItemModal('project');
        return;
    }
    if (!targetId || !$sel.find('option[value="' + targetId + '"]').length) {
        targetId = $sel.find('option:first').val();
    }
    var projName = $sel.find('option[value="' + targetId + '"]').text() || '';
    openUploadModal(targetId, projName);
}

// 全局快速新建项目 / 链接：自动提取当前所属分类上下文
function openQuickItemModal(type) {
    closeQuickAddMenu();
    type = type || 'project';
    var curFlow = getQuickCreateFlow();
    if (!curFlow || !curFlow.advancing) {
        resetQuickCreateFlow();
    }
    var activeCatId = '';
    if (typeof currentSelectedItemId !== 'undefined' && currentSelectedItemId) {
        var $curItem = $('#item-node-' + currentSelectedItemId);
        activeCatId = $curItem.data('cat-id') || '';
    }
    if (!activeCatId) {
        var $firstCat = $('.category-group:first');
        activeCatId = $firstCat.data('cat-id') || $('#itemCatSelect option:first').val() || '';
    }
    openItemModal(activeCatId, type);
}

// 点击空白区域自动收起快速创建菜单
$(document).on('click', function(e) {
    if (!$(e.target).closest('#quickAddWrap').length) {
        closeQuickAddMenu();
    }
});

// 管理员登录态下初始化加载待审批用户数量徽标与管理员下拉多选
$(function() {
    initProtoDropZone();
    initRpDropZone();
    if (typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.role === 'admin') {
        refreshPendingUsersWhenVisible();
        setInterval(refreshPendingUsersWhenVisible, 15000);
        document.addEventListener('visibilitychange', refreshPendingUsersWhenVisible);
        window.addEventListener('focus', refreshPendingUsersWhenVisible);
    }
    onAdminSelectChange(true);
});

/* ===================== 系统设置: 管理员下拉多选组件 ===================== */
function syncAdminNotificationWebhookState(userId, webhookUrl) {
    var uid = parseInt(userId, 10);
    if (!uid) return;
    if (typeof cachedUsersMap !== 'undefined' && cachedUsersMap[uid]) {
        cachedUsersMap[uid].webhook_url = webhookUrl || '';
    }
    var input = document.querySelector('#adminMultiSelectOptions input[value="' + uid + '"]');
    var option = input ? input.closest('label') : null;
    var status = option ? option.querySelector('[data-admin-webhook-status]') : null;
    if (!status) return;
    var tipBot2 = esc(typeof t === 'function' ? t('admin.users.bot_configured_tip', null, '已配置个人机器人 Webhook') : '已配置个人机器人 Webhook');
    var labelNoBot2 = esc(typeof t === 'function' ? t('admin.settings.no_bot', null, '未配置机器人') : '未配置机器人');
    status.innerHTML = String(webhookUrl || '').trim()
        ? '<i class="ri-robot-line" title="' + tipBot2 + '" role="img" aria-label="' + tipBot2 + '"></i>'
        : labelNoBot2;
}

function toggleAdminDropdown(e) {
    if (e) e.stopPropagation();
    var menu = document.getElementById('adminMultiSelectMenu');
    if (!menu) return;
    var isOpen = (menu.style.display !== 'none');
    menu.style.display = isOpen ? 'none' : 'block';
    var trigger = document.getElementById('adminMultiSelectTrigger');
    if (trigger) trigger.setAttribute('aria-expanded', String(!isOpen));
    if (!isOpen && trigger) {
        menu.style.top = (trigger.offsetTop + trigger.offsetHeight + 4) + 'px';
        var scrollHost = trigger.closest('.admin-content-body');
        var visibleTop = 0;
        var visibleBottom = window.innerHeight;
        if (scrollHost) {
            var hostRect = scrollHost.getBoundingClientRect();
            visibleTop = Math.max(visibleTop, hostRect.top);
            visibleBottom = Math.min(visibleBottom, hostRect.bottom);
        }
        var triggerRect = trigger.getBoundingClientRect();
        var menuRect = menu.getBoundingClientRect();
        if (menuRect.bottom > visibleBottom && triggerRect.top - menuRect.height - 4 >= visibleTop) {
            menu.style.top = (trigger.offsetTop - menu.offsetHeight - 4) + 'px';
        }
    }
}

function onAdminSelectChange(isReset) {
    var cbs = document.querySelectorAll('input[name="visitor_notify_admin_ids[]"]');
    var tagsWrap = document.getElementById('adminMultiSelectTags');
    if (!tagsWrap) return;

    var selectedNames = [];
    var selectedIds = [];
    cbs.forEach(function(cb) {
        if (cb.checked) {
            selectedIds.push(parseInt(cb.value, 10));
            var label = cb.closest('label');
            var nameEl = label ? label.querySelector('span') : null;
            selectedNames.push(nameEl ? nameEl.textContent.trim() : (typeof t === 'function' ? t('common.role.admin', null, '管理员') : '管理员'));
        }
    });

    if (!isReset) {
        window.SAVED_NOTIFY_ADMIN_IDS = selectedIds;
    }

    if (selectedNames.length === 0) {
        tagsWrap.innerHTML = '<span style="font-size:12.5px;color:var(--text-3);">' + esc(typeof t === 'function' ? t('admin.settings.select_notify_admins_placeholder', null, '请选择接收通知的管理员...') : '请选择接收通知的管理员...') + '</span>';
    } else if (selectedNames.length <= 2) {
        var html = '';
        selectedNames.forEach(function(name) {
            html += `<span class="badge-tag badge-primary">${esc(name)}</span>`;
        });
        tagsWrap.innerHTML = html;
    } else {
        tagsWrap.innerHTML = `<span class="badge-tag badge-primary">${esc(typeof t === 'function' ? t('admin.settings.selected_admins_n', { first: selectedNames[0], n: selectedNames.length }, selectedNames[0] + ' 等 ' + selectedNames.length + ' 位管理员') : selectedNames[0] + ' 等 ' + selectedNames.length + ' 位管理员')}</span>`;
    }

    if (!isReset && typeof triggerAutoSaveSettings === 'function') {
        triggerAutoSaveSettings(100);
    }
}

function selectAllAdmins(isAll) {
    var cbs = document.querySelectorAll('input[name="visitor_notify_admin_ids[]"]');
    cbs.forEach(function(cb) {
        cb.checked = !!isAll;
    });
    onAdminSelectChange();
}

// 全局点击任意空白自动收起多选浮层
document.addEventListener('click', function(e) {
    var menu = document.getElementById('adminMultiSelectMenu');
    var trigger = document.getElementById('adminMultiSelectTrigger');
    if (menu && menu.style.display !== 'none') {
        if (!menu.contains(e.target) && (!trigger || !trigger.contains(e.target))) {
            menu.style.display = 'none';
            if (trigger) trigger.setAttribute('aria-expanded', 'false');
        }
    }
    var ownersMenu = document.getElementById('itemOwnersMenu');
    var ownersTrigger = document.getElementById('itemOwnersTrigger');
    if (ownersMenu && ownersMenu.style.display !== 'none') {
        if (!ownersMenu.contains(e.target) && (!ownersTrigger || !ownersTrigger.contains(e.target))) {
            ownersMenu.style.display = 'none';
            if (ownersTrigger) ownersTrigger.setAttribute('aria-expanded', 'false');
        }
    }
});

/* ===================== RP 底稿补传、更换与移除管理 ===================== */
// 同步全局内存中指定版本的 RP 状态与界面视图
function syncVersionRpState(itemId, verId, rpFile, rpSize, updatedAt) {
    itemId = parseInt(itemId, 10);
    verId = parseInt(verId, 10);
    if (!itemId || !verId) return;

    // 1. 同步目录树节点 data-versions
    var $treeNode = $('#item-node-' + itemId);
    if (!$treeNode.length) {
        $treeNode = $('.item-row[data-item-id="' + itemId + '"]');
    }
    if ($treeNode.length) {
        var vers = $treeNode.data('versions') || [];
        if (typeof vers === 'string') {
            try { vers = JSON.parse(vers); } catch(e) { vers = []; }
        }
        for (var i = 0; i < vers.length; i++) {
            if (parseInt(vers[i].id, 10) === verId) {
                vers[i].rp_file = rpFile || '';
                vers[i].rp_size = rpSize || 0;
                if (updatedAt) {
                    vers[i].updated_at = updatedAt;
                }
                break;
            }
        }
        $treeNode.data('versions', vers);
        $treeNode.attr('data-versions', JSON.stringify(vers));
    }

    // 1.1 同步后台控制台行中的 data-versions
    if (typeof hydrateAdminRowVersions === 'function') hydrateAdminRowVersions(itemId);
    var $adminRow = $('#admin-item-row-' + itemId);
    if ($adminRow.length) {
        var adminVers = $adminRow.data('versions') || [];
        if (typeof adminVers === 'string') {
            try { adminVers = JSON.parse(adminVers); } catch(e) { adminVers = []; }
        }
        for (var j = 0; j < adminVers.length; j++) {
            if (parseInt(adminVers[j].id, 10) === verId) {
                adminVers[j].rp_file = rpFile || '';
                adminVers[j].rp_size = rpSize || 0;
                if (updatedAt) {
                    adminVers[j].updated_at = updatedAt;
                }
                break;
            }
        }
        $adminRow.data('versions', adminVers);
        $adminRow.attr('data-versions', JSON.stringify(adminVers));
    }

    // 2. 如果当前正在查看此项目，联动当前视图与顶部栏
    if (typeof currentSelectedItemId !== 'undefined' && parseInt(currentSelectedItemId, 10) === itemId) {
        var $opt = $('#barVerSelect').find('option[data-ver-id="' + verId + '"]');
        if ($opt.length) {
            $opt.data('rp', rpFile || '');
            if (updatedAt) $opt.data('time', updatedAt);
        }

        var currentActiveVerId = 0;
        var currentVerName = '';
        if ($('#barVerSelect').is(':visible') && $('#barVerSelect option:selected').length) {
            currentActiveVerId = parseInt($('#barVerSelect option:selected').data('ver-id') || 0, 10);
            currentVerName = $('#barVerSelect option:selected').data('ver') || $('#barVerSelect').val();
        } else if ($treeNode.length) {
            currentActiveVerId = parseInt($treeNode.data('ver-id') || 0, 10);
            currentVerName = $treeNode.data('ver') || '';
        }

        if (currentActiveVerId === verId || (!currentActiveVerId && $treeNode.length)) {
            if ($treeNode.length) {
                $treeNode.data('rp', rpFile || '');
                if (updatedAt) $treeNode.data('time', updatedAt);
            }
            if (typeof updateTopRpButtons === 'function') {
                updateTopRpButtons(rpFile, currentVerName, itemId, verId);
            }
        }
    }
    if (typeof refreshCategoryTreeNewBadges === 'function') {
        refreshCategoryTreeNewBadges();
    }
}

// 统一执行版本 RP 底稿切片上传与保存
function uploadRpForVersion(verId, itemId, file, callbacks) {
    callbacks = callbacks || {};
    if (!file) {
        var errNoFile = (typeof t === 'function' ? t('ver.file_not_selected', null, '未选择文件') : '未选择文件');
        if (callbacks.onError) callbacks.onError(new Error(errNoFile));
        return Promise.reject(new Error(errNoFile));
    }
    if (!file.name.toLowerCase().endsWith('.rp')) {
        var err = new Error((typeof t === 'function' ? t('ver.select_axure_rp_file', null, '请选择 .rp 格式的 Axure 源文件底稿') : '请选择 .rp 格式的 Axure 源文件底稿'));
        if (callbacks.onError) callbacks.onError(err);
        return Promise.reject(err);
    }

    if (file.size < 1) {
        var emptyErr = new Error((typeof t === 'function' ? t('ver.file_empty', null, '所选文件为空，请重新选择') : '所选文件为空，请重新选择'));
        if (callbacks.onError) callbacks.onError(emptyErr);
        return Promise.reject(emptyErr);
    }
    if (Math.ceil(file.size / UPLOAD_CHUNK_SIZE) > 1000) {
        var maxErr = new Error((typeof t === 'function' ? t('ver.rp_too_large', null, 'RP 源文件不能超过 500MB') : 'RP 源文件不能超过 500MB'));
        if (callbacks.onError) callbacks.onError(maxErr);
        return Promise.reject(maxErr);
    }

    var rpUploadId = 'rp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    var CHUNK_SIZE = UPLOAD_CHUNK_SIZE;
    var uploadedBytes = 0;
    var totalBytes = file.size;

    if (callbacks.onStart) callbacks.onStart();

    return uploadFileChunks(file, 'rp', rpUploadId, CHUNK_SIZE, function(chunkBytes) {
        uploadedBytes += chunkBytes;
        var pct = Math.min(99, Math.round((uploadedBytes / totalBytes) * 100));
        if (callbacks.onProgress) callbacks.onProgress(pct);
    }).then(function() {
        if (callbacks.onProgress) callbacks.onProgress(100);
        var fd = new FormData();
        fd.append('action', 'version_update_rp');
        fd.append('id', verId);
        fd.append('rp_upload_id', rpUploadId);
        return adminFetch('version_update_rp', fd);
    }).then(function(res) {
        if (!res.success) {
            throw new Error(res.message || (typeof t === 'function' ? t('ver.rp_save_failed', null, 'RP 底稿保存失败') : 'RP 底稿保存失败'));
        }
        var resUpdatedAt = (res && res.data) ? (res.data.updated_at || (res.data.version ? res.data.version.updated_at : '')) : '';
        syncVersionRpState(itemId, verId, 'prototype.rp', res.data ? res.data.rp_size : file.size, resUpdatedAt);
        if (callbacks.onSuccess) callbacks.onSuccess(res);
        return res;
    }).catch(function(err) {
        if (callbacks.onError) callbacks.onError(err);
        throw err;
    });
}

// 顶栏快捷补传触发
function triggerQuickRpUpload() {
    var $btn = $('#btnUploadRpQuick');
    var verId = $btn.data('ver-id');
    var itemId = $btn.data('item-id');
    if (!verId || !itemId) {
        showToast((typeof t === 'function' ? t('ver.not_detected', null, '未检测到有效版本信息') : '未检测到有效版本信息'), 'warning');
        return;
    }
    var input = document.getElementById('quickRpFileInput');
    if (input) {
        input.value = '';
        input.setAttribute('data-target-ver-id', verId);
        input.setAttribute('data-target-item-id', itemId);
        input.click();
    }
}

function handleQuickRpFileSelected(input) {
    var file = input.files && input.files[0];
    if (!file) return;
    var verId = parseInt(input.getAttribute('data-target-ver-id'), 10);
    var itemId = parseInt(input.getAttribute('data-target-item-id'), 10);
    if (!verId || !itemId) return;

    if (!file.name.toLowerCase().endsWith('.rp')) {
        showToast((typeof t === 'function' ? t('ver.select_rp_file', null, '请选择 .rp 格式的源文件底稿') : '请选择 .rp 格式的源文件底稿'), 'warning');
        input.value = '';
        return;
    }

    var $btn = $('#btnUploadRpQuick');
    var originalHtml = '<i class="ri-upload-2-line"></i> ' + esc(typeof t === 'function' ? t('workspace.upload_rp_quick', null, '补传 RP') : '补传 RP');
    $btn.prop('disabled', true).addClass('is-disabled').html('<i class="ri-loader-4-line ri-spin"></i> ' + esc(typeof t === 'function' ? t('workspace.rp_uploading_pct', { pct: 0 }, '上传中 0%') : '上传中 0%'));

    uploadRpForVersion(verId, itemId, file, {
        onProgress: function(pct) {
            $btn.html('<i class="ri-loader-4-line ri-spin"></i> ' + esc(typeof t === 'function' ? t('workspace.rp_uploading_pct', { pct: pct }, '上传中 ' + pct + '%') : '上传中 ' + pct + '%'));
        },
        onSuccess: function(res) {
            $btn.prop('disabled', false).removeClass('is-disabled').html(originalHtml);
            showToast((typeof t === 'function' ? t('workspace.rp_quick_success', null, 'RP 底稿补传成功') : 'RP 底稿补传成功'), 'success', 2000);
            var curVerName = ($('#barVerSelect').is(':visible') && $('#barVerSelect option:selected').length)
                ? ($('#barVerSelect option:selected').data('ver') || '')
                : ($('#barVer').text() || '').replace(/^.*?\s/, '');
            if (typeof updateTopRpButtons === 'function') {
                updateTopRpButtons('prototype.rp', curVerName, itemId, verId);
            }
        },
        onError: function(err) {
            $btn.prop('disabled', false).removeClass('is-disabled').html(originalHtml);
            showToast((err && err.message) ? err.message : (typeof t === 'function' ? t('workspace.rp_upload_aborted', null, '上传中断，请重试') : '上传中断，请重试'), 'error');
        }
    });
}

// 版本管理列表行内补传/更换 RP 触发
var currentVerManageTargetVerId = 0;
var currentVerManageTargetItemId = 0;

function triggerRpUploadForVersion(verId, itemId, isReplace) {
    currentVerManageTargetVerId = parseInt(verId, 10);
    currentVerManageTargetItemId = parseInt(itemId, 10);
    var input = document.getElementById('verManageRpInput');
    if (input) {
        input.value = '';
        input.click();
    }
}

function handleVerManageRpSelected(input) {
    var file = input.files && input.files[0];
    if (!file) return;
    var verId = currentVerManageTargetVerId;
    var itemId = currentVerManageTargetItemId;
    if (!verId || !itemId) return;

    if (!file.name.toLowerCase().endsWith('.rp')) {
        showToast((typeof t === 'function' ? t('ver.select_rp_file', null, '请选择 .rp 格式的源文件底稿') : '请选择 .rp 格式的源文件底稿'), 'warning');
        input.value = '';
        return;
    }

    var $row = $('#ver-row-' + verId);
    var $actions = $row.find('.ver-manage-actions');
    var oldActionsHtml = $actions.html();
    $actions.html('<span class="ver-rp-uploading"><i class="ri-loader-4-line ri-spin"></i> ' + (typeof t === 'function' ? t('ver.rp_uploading', { id: verId }, '上传中 <span id="verRpPct-' + verId + '">0%</span>') : '上传中 <span id="verRpPct-' + verId + '">0%</span>') + '</span>');

    uploadRpForVersion(verId, itemId, file, {
        onProgress: function(pct) {
            $('#verRpPct-' + verId).text(pct + '%');
        },
        onSuccess: function(res) {
            showToast((typeof t === 'function' ? t('ver.rp_saved', null, 'RP 底稿保存成功') : 'RP 底稿保存成功'), 'success', 2000);
            if (currentVerManageItemId) {
                openVersionManageModal(currentVerManageItemId, true);
            }
        },
        onError: function(err) {
            $actions.html(oldActionsHtml);
            showToast((err && err.message) ? err.message : (typeof t === 'function' ? t('ver.rp_upload_failed', null, '上传失败，请重试') : '上传失败，请重试'), 'error');
        }
    });
}

function handleRemoveRp(verId, itemId) {
    showConfirm({
        title: (typeof t === 'function' ? t('ver.rp_remove_title', null, '移除 RP 底稿') : '移除 RP 底稿'),
        message: (typeof t === 'function' ? t('ver.rp_remove_confirm', null, '确认移除此版本的 RP 源文件底稿？此操作无法撤销。') : '确认移除此版本的 RP 源文件底稿？此操作无法撤销。'),
        confirmText: (typeof t === 'function' ? t('ver.rp_remove_btn', null, '移除底稿') : '移除底稿'),
        isDanger: true,
        onConfirm: function() {
            var fd = new FormData();
            fd.append('id', verId);
            adminFetch('version_remove_rp', fd).then(function(res) {
                if (res.success) {
                    showToast((typeof t === 'function' ? t('ver.rp_removed', null, 'RP 底稿已移除') : 'RP 底稿已移除'), 'success', 2000);
                    var resUpdatedAt = (res && res.data) ? (res.data.updated_at || (res.data.version ? res.data.version.updated_at : '')) : '';
                    syncVersionRpState(itemId, verId, '', 0, resUpdatedAt);
                    if (currentVerManageItemId) {
                        openVersionManageModal(currentVerManageItemId, true);
                    }
                } else {
                    showToast(res.message || (typeof t === 'function' ? t('ver.rp_remove_failed', null, '移除失败') : '移除失败'), 'error');
                }
            }).catch(function(err) {
                showToast((err && err.message) ? err.message : (typeof t === 'function' ? t('common.network_error', null, '网络异常，请重试') : '网络异常，请重试'), 'error');
            });
        }
    });
}

window.syncVersionRpState = syncVersionRpState;
window.uploadRpForVersion = uploadRpForVersion;
window.triggerQuickRpUpload = triggerQuickRpUpload;
window.handleQuickRpFileSelected = handleQuickRpFileSelected;
window.triggerRpUploadForVersion = triggerRpUploadForVersion;
window.handleVerManageRpSelected = handleVerManageRpSelected;
window.handleRemoveRp = handleRemoveRp;
window.handleVerManageSearch = handleVerManageSearch;
window.clearVerManageSearch = clearVerManageSearch;
window.gotoVerManagePage = gotoVerManagePage;

// 控制中心事件委托（数据与行为分离，防范属性注入与实体解码损坏）
$(document).on('click', '.btn-copy-url', function(e) {
    e.preventDefault();
    var url = $(this).attr('data-url') || $(this).data('url');
    if (url) {
        copyTextToClipboard(url, function() {
            showToast((typeof t === 'function' ? t('common.link_copied', null, '链接已复制') : '链接已复制'), 'success');
        });
    }
});

$(document).on('click', '.btn-edit-item-trigger', function(e) {
    var data = $(this).data('item-data');
    if (!data) {
        var jsonStr = $(this).attr('data-item-json');
        if (jsonStr) {
            try { data = JSON.parse(jsonStr); } catch(err) {}
        }
    }
    if (data) {
        e.preventDefault();
        openEditItemModal(data);
    }
});

$(document).on('click', '.btn-edit-cat-trigger', function(e) {
    e.preventDefault();
    var catId = $(this).data('cat-id') || $(this).attr('data-cat-id');
    var catName = $(this).attr('data-cat-name') || $(this).data('cat-name');
    openCategoryModal(catId, catName);
});

$(document).on('click', '.btn-delete-cat-trigger', function(e) {
    e.preventDefault();
    var catId = $(this).data('cat-id') || $(this).attr('data-cat-id');
    var catName = $(this).attr('data-cat-name') || $(this).data('cat-name');
    var count = $(this).data('count') || $(this).attr('data-count') || 0;
    confirmDeleteCategory(catId, catName, count);
});

// Linear 风格提示气泡 (Toggletip：支持悬停、聚焦、点击与 ESC 优先收起)
var linearHintGlobalsBound = false;

function isHintPopoverOpen(pop) {
    if (!pop) return false;
    try {
        if (pop.matches && pop.matches(':popover-open')) return true;
    } catch (e) {}
    return pop.classList ? pop.classList.contains('is-open') : false;
}

function syncHintTriggerExpanded(hintId, isOpen) {
    if (!hintId || typeof document === 'undefined') return;
    var triggers = document.querySelectorAll('[interestfor]');
    for (var i = 0; i < triggers.length; i++) {
        var trig = triggers[i];
        if (trig.getAttribute('interestfor') !== hintId) continue;
        if (trig._hintOwnsExpanded) {
            trig.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        }
        if (!isOpen && trig.classList) {
            trig.classList.remove('interest-source');
        }
    }
}

function closeHintPopover(pop) {
    if (!pop) return;
    if (pop._hintHideTimer) {
        clearTimeout(pop._hintHideTimer);
        pop._hintHideTimer = null;
    }
    if (typeof pop.hidePopover === 'function') {
        try {
            if (isHintPopoverOpen(pop)) pop.hidePopover();
        } catch (e) {}
    }
    if (pop.classList) {
        pop.classList.remove('is-open');
    }
    syncHintTriggerExpanded(pop.id, false);
}

function closeAllLinearHintPopovers(exceptPop) {
    if (typeof document === 'undefined') return false;
    var pops = document.querySelectorAll('.linear-hint-popover');
    var closedAny = false;
    for (var i = 0; i < pops.length; i++) {
        var pop = pops[i];
        if (exceptPop && pop === exceptPop) continue;
        if (isHintPopoverOpen(pop)) {
            closeHintPopover(pop);
            closedAny = true;
        }
    }
    return closedAny;
}
window.closeAllLinearHintPopovers = closeAllLinearHintPopovers;

function positionHintPopover(trig, pop) {
    if (!trig || !pop || typeof window === 'undefined') return;
    var trigRect = trig.getBoundingClientRect();
    var tipRect = pop.getBoundingClientRect();
    if (!tipRect.width && !tipRect.height) return;
    var gap = 8;
    var vw = window.innerWidth || (document.documentElement && document.documentElement.clientWidth) || 1280;
    var top = trigRect.top - tipRect.height - gap;
    if (top < 8) {
        top = trigRect.bottom + gap;
    }
    var left = trigRect.left + (trigRect.width - tipRect.width) / 2;
    left = Math.max(8, Math.min(left, vw - tipRect.width - 8));
    pop.classList.add('is-js-positioned');
    pop.style.left = Math.round(left) + 'px';
    pop.style.top = Math.round(top) + 'px';
}

function openHintPopover(trig, pop, useJsPosition) {
    if (!trig || !pop) return;
    if (pop._hintHideTimer) {
        clearTimeout(pop._hintHideTimer);
        pop._hintHideTimer = null;
    }
    closeAllLinearHintPopovers(pop);
    var alreadyOpen = isHintPopoverOpen(pop);
    if (!alreadyOpen) {
        if (useJsPosition) pop.style.visibility = 'hidden';
        if (typeof pop.showPopover === 'function') {
            try {
                pop.showPopover({ source: trig });
            } catch (e) {
                try { pop.showPopover(); } catch (e2) {}
            }
        }
        pop.classList.add('is-open');
    }
    if (useJsPosition) {
        positionHintPopover(trig, pop);
        pop.style.visibility = '';
    }
    trig.classList.add('interest-source');
    if (trig._hintOwnsExpanded) {
        trig.setAttribute('aria-expanded', 'true');
    }
}

function scheduleCloseHintPopover(pop) {
    if (!pop) return;
    if (pop._hintHideTimer) clearTimeout(pop._hintHideTimer);
    pop._hintHideTimer = setTimeout(function() {
        pop._hintHideTimer = null;
        closeHintPopover(pop);
    }, 120);
}

function bindLinearHintGlobalListeners() {
    if (linearHintGlobalsBound || typeof document === 'undefined') return;
    linearHintGlobalsBound = true;

    // 浏览器不支持 popover="hint" 时，在 beforetoggle 切为 auto 以保留轻关闭能力
    var probe = document.createElement('div');
    if ('popover' in probe) {
        try {
            probe.popover = 'hint';
            if (probe.popover !== 'hint') {
                document.addEventListener('beforetoggle', function(ev) {
                    var tgt = ev.target;
                    if (!tgt || !tgt.getAttribute || !tgt.id) return;
                    var isToggletip = tgt.getAttribute('popover') === 'hint'
                        && document.querySelector('[popovertarget="' + tgt.id + '"]');
                    if (ev.newState === 'open' && isToggletip) {
                        tgt.popover = 'auto';
                    }
                }, true);
            }
        } catch (e) {}
    }

    // toggle 事件不冒泡，必须在捕获阶段统一同步 aria-expanded 与激活状态
    document.addEventListener('toggle', function(ev) {
        var tgt = ev.target;
        if (!tgt || !tgt.classList || !tgt.classList.contains('linear-hint-popover')) return;
        var openState = ev.newState ? (ev.newState === 'open') : isHintPopoverOpen(tgt);
        syncHintTriggerExpanded(tgt.id, openState);
    }, true);

    // 捕获阶段优先于 document 级 modalKeyboardBoundary 拦截 ESC，避免关气泡时误关控制中心弹窗
    var keyTarget = (typeof window !== 'undefined' && window.addEventListener) ? window : document;
    keyTarget.addEventListener('keydown', function(ev) {
        if (ev.key !== 'Escape' && ev.keyCode !== 27) return;
        if (closeAllLinearHintPopovers()) {
            ev.preventDefault();
            if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
            ev.stopPropagation();
        }
    }, true);

    document.addEventListener('scroll', function(ev) {
        var pops = document.querySelectorAll('.linear-hint-popover');
        for (var i = 0; i < pops.length; i++) {
            var pop = pops[i];
            if (!isHintPopoverOpen(pop)) continue;
            if (ev && ev.target && (ev.target === pop || (pop.contains && pop.contains(ev.target)))) {
                continue;
            }
            closeHintPopover(pop);
        }
    }, true);

    if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('resize', function() {
            closeAllLinearHintPopovers();
        });
    }

    document.addEventListener('click', function(ev) {
        var pops = document.querySelectorAll('.linear-hint-popover');
        for (var i = 0; i < pops.length; i++) {
            var pop = pops[i];
            if (!isHintPopoverOpen(pop)) continue;
            var trig = pop.id ? document.querySelector('[interestfor="' + pop.id + '"]') : null;
            if (pop.contains(ev.target) || (trig && trig.contains(ev.target))) continue;
            closeHintPopover(pop);
        }
    });
}

function initLinearHintPopovers(root) {
    if (typeof document === 'undefined') return;
    bindLinearHintGlobalListeners();

    var scope = root || document;
    var triggers = scope.querySelectorAll('[interestfor]');
    var hasNativeInterest = (typeof HTMLButtonElement !== 'undefined' && HTMLButtonElement.prototype && ('interestForElement' in HTMLButtonElement.prototype));
    var hasNativeAnchor = (typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('position-area: block-start'));
    var needFallback = !hasNativeInterest || !hasNativeAnchor;

    for (var i = 0; i < triggers.length; i++) {
        var trig = triggers[i];
        var targetId = trig.getAttribute('interestfor');
        if (!targetId) continue;
        var pop = document.getElementById(targetId);
        if (!pop || !pop.classList.contains('linear-hint-popover')) continue;

        if (!pop.hasAttribute('role')) {
            pop.setAttribute('role', 'tooltip');
        }
        var opensOnClick = trig.hasAttribute('popovertarget') || trig.hasAttribute('commandfor');
        if (opensOnClick && !trig.hasAttribute('aria-expanded')) {
            trig._hintOwnsExpanded = true;
            trig.setAttribute('aria-expanded', isHintPopoverOpen(pop) ? 'true' : 'false');
        }

        if (needFallback && !trig._linearHintBound) {
            trig._linearHintBound = true;
            (function(triggerEl, popEl) {
                triggerEl.addEventListener('mouseenter', function() {
                    openHintPopover(triggerEl, popEl, true);
                });
                triggerEl.addEventListener('focus', function() {
                    openHintPopover(triggerEl, popEl, true);
                });
                triggerEl.addEventListener('mouseleave', function() {
                    scheduleCloseHintPopover(popEl);
                });
                triggerEl.addEventListener('blur', function() {
                    scheduleCloseHintPopover(popEl);
                });
                triggerEl.addEventListener('click', function(ev) {
                    if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
                    openHintPopover(triggerEl, popEl, true);
                });
                if (!popEl._linearHintPopBound) {
                    popEl._linearHintPopBound = true;
                    popEl.addEventListener('mouseenter', function() {
                        if (popEl._hintHideTimer) {
                            clearTimeout(popEl._hintHideTimer);
                            popEl._hintHideTimer = null;
                        }
                    });
                    popEl.addEventListener('mouseleave', function() {
                        scheduleCloseHintPopover(popEl);
                    });
                }
            })(trig, pop);
        }
    }
}
window.initLinearHintPopovers = initLinearHintPopovers;

function updateOverviewSortHint(type, catId) {
    if (typeof document === 'undefined') return;
    catId = parseInt(catId || 0, 10);
    var isLink = (type === 'link');
    var btn = document.getElementById(isLink ? 'linkSortHintBtn' : 'projectSortHintBtn');
    var tip = document.getElementById(isLink ? 'linkSortHintTip' : 'projectSortHintTip');
    var sel = document.getElementById(isLink ? 'filterLinkCategory' : 'filterProjectCategory');
    var defaultKey = isLink ? 'admin.proj.filter_link_folder_tip' : 'admin.proj.filter_folder_tip';
    var defaultFallback = isLink ? '选定文件夹后，可调整链接顺序' : '选定文件夹后，可调整项目顺序';
    var activeTip = (typeof t === 'function')
        ? t('admin.proj.sort_active_tip', null, '已选定文件夹，可点击右侧箭头调整顺序')
        : '已选定文件夹，可点击右侧箭头调整顺序';
    var defaultTip = (typeof t === 'function')
        ? t(defaultKey, null, defaultFallback)
        : defaultFallback;
    var nextText = catId > 0 ? activeTip : defaultTip;

    if (btn) btn.classList.toggle('is-active', catId > 0);
    if (tip) tip.textContent = nextText;
    if (sel) sel.setAttribute('title', nextText);
}
window.updateOverviewSortHint = updateOverviewSortHint;

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initLinearHintPopovers();
        });
    } else {
        initLinearHintPopovers();
    }
}
