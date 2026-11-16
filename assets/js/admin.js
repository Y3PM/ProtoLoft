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
            showToast('项目显隐状态已更新', 'success');
            if (isAdminConsoleOpen()) {
                markAdminConsoleChanged();
            } else {
                window.location.reload();
            }
        } else {
            showToast(res.message || '操作失败', 'error');
        }
    });
}

// 切换项目外链分享启用/停用状态
function toggleShareStatus(itemId) {
    var fd = new FormData();
    fd.append('id', itemId);
    adminFetch('item_toggle_share', fd).then(function(res) {
        if (res.success) {
            showToast('外链分享状态已更新', 'success');
            if (isAdminConsoleOpen()) {
                markAdminConsoleChanged();
            } else {
                window.location.reload();
            }
        } else {
            showToast(res.message || '操作失败', 'error');
        }
    });
}

// 一键重置分享直链
function rotateShareToken(itemId) {
    showConfirm({
        title: '重置链接',
        message: '确定重置分享链接？旧链接将失效。',
        confirmText: '重置',
        isDanger: true,
        onConfirm: function() {
            var fd = new FormData();
            fd.append('id', itemId);
            adminFetch('item_rotate_share', fd).then(function(res) {
                if (res.success) {
                    showToast('链接已重置', 'success');
                    if (isAdminConsoleOpen()) {
                        markAdminConsoleChanged();
                    } else {
                        window.location.reload();
                    }
                } else {
                    showToast(res.message || '重置失败', 'error');
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
        logInput.placeholder = '本次版本的改动说明，支持换行与 Markdown（如 - 列表、**加粗**、# 标题）';
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
        logInput.placeholder = '本次版本的改动说明，支持换行与 Markdown（如 - 列表、**加粗**、# 标题）';
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
        itemCard.title = '通知当前项目配置的群机器人';
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
            itemStatus.textContent = '已配置';
        }
    } else {
        itemCard.classList.add('is-disabled');
        itemCard.title = '当前项目未配置 Webhook 机器人，可在编辑项目属性中配置';
        if (itemCb) {
            itemCb.disabled = true;
            itemCb.checked = false;
        }
        if (itemLabel) itemLabel.classList.add('disabled');
        if (itemStatus) {
            itemStatus.textContent = '未配置';
        }
    }

    // 2. 判断评审群 Webhook 配置 (全局通道，切换项目时不覆盖用户的取消选择)
    var hasGlobal = typeof SYS_HAS_GLOBAL_WEBHOOK !== 'undefined' && SYS_HAS_GLOBAL_WEBHOOK;
    if (hasGlobal) {
        globalCard.classList.remove('is-disabled');
        globalCard.title = '通知全站大盘配置的集中评审群';
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
            globalStatus.textContent = '已配置';
        }
    } else {
        globalCard.classList.add('is-disabled');
        globalCard.title = '系统控制中心未配置评审群 Webhook';
        if (globalCb) {
            globalCb.disabled = true;
            globalCb.checked = false;
        }
        if (globalLabel) globalLabel.classList.add('disabled');
        if (globalStatus) {
            globalStatus.textContent = '未配置';
        }
    }

    // 3. 联动日志必填状态
    handleNotifyTargetChange();
}

var versionNameCheckSequence = 0;
var UPLOAD_CHUNK_SIZE = 512 * 1024; // 512KB 原生微切片 (安全适配 Nginx 1MB client_max_body_size)
var versionUploadBusy = false;

function validateVersionName(raw) {
    if (/[\x00-\x1f\x7f-\x9f\u2028\u2029]/.test(raw)) return {error:'版本名称不能包含换行或控制字符'};
    var name = raw.replace(/^[ \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]+|[ \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]+$/g, '');
    if (!name) return {error:'请输入版本名称'};
    if (Array.from(name).length > 30) return {error:'版本名称最多 30 字'};
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
    if (validation.error || !itemId) return Promise.resolve({success:false,message:validation.error || '请选择项目'});
    input.value = validation.name;
    var fd = new FormData();
    fd.append('item_id', itemId);
    fd.append('version_name', validation.name);
    return adminFetch('version_check_name', fd, false).catch(function() {
        return {success:false,message:'版本名称检查失败，请重试'};
    }).then(function(res) {
        if (sequence === versionNameCheckSequence && hint && document.getElementById('uploadItemId').value === itemId && input.value === validation.name) {
            hint.textContent = res.success ? (res.data.exists ? '同名版本已存在，发布时将确认替换' : '') : res.message;
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
        if (typeof showToast === 'function') showToast('更新日志已达 ' + maxLen + ' 字上限', 'warning');
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
        showToast('已添加上版日志（超出 ' + maxLen + ' 字部分已截断）', 'info');
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
                showToast('项目列表已变化，请关闭控制中心后重试', 'warning');
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
    openModal('uploadModal');
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
    if (rn) { rn.textContent = '未选择文件'; rn.classList.remove('has-file'); }
}

function handleRpSelected(input) {
    var file = input.files && input.files[0];
    if (!file) {
        clearSelectedRpFile();
        return;
    }
    if (!file.name.toLowerCase().endsWith('.rp')) {
        showToast('请选择 .rp 格式的源文件底稿', 'warning');
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
            showToast('请拖入 .rp 格式的源文件底稿', 'warning');
            return;
        }

        setRpSourceFile(file);
    });
}

// 原型发布源管理：支持 ZIP 包与原型文件夹
var currentProtoSource = null;

function clearSelectedProtoSource(e) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    currentProtoSource = null;
    var zipInput = document.getElementById('uploadZipFile');
    if (zipInput) zipInput.value = '';
    var folderInput = document.getElementById('uploadFolderInput');
    if (folderInput) folderInput.value = '';
    var badge = document.getElementById('protoFileBadge');
    if (badge) badge.style.display = 'none';
    var actions = document.getElementById('protoDropActions');
    if (actions) actions.style.display = 'flex';
    var zn = document.getElementById('uploadZipName');
    if (zn) { zn.textContent = '未选择文件'; zn.classList.remove('has-file'); }
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
    var folderName = firstRel.split('/')[0] || '原型文件夹';
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
    currentProtoSource = {
        type: 'zip',
        file: file,
        name: file.name,
        size: file.size
    };
    renderProtoSourceBadge('ri-file-zip-line', file.name + ' (' + formatProtoBytes(file.size) + ')');
}

function setProtoSourceFolder(folderName, filesList) {
    var validFiles = filterPrototypeFiles(filesList);
    if (validFiles.length === 0) {
        showToast('选中的文件夹内没有有效文件', 'warning');
        clearSelectedProtoSource();
        return;
    }
    var totalBytes = 0;
    for (var i = 0; i < validFiles.length; i++) {
        totalBytes += (validFiles[i].size || 0);
    }
    currentProtoSource = {
        type: 'folder',
        name: folderName,
        files: validFiles,
        size: totalBytes
    };
    renderProtoSourceBadge('ri-folder-upload-line', '文件夹: ' + folderName + ' (' + validFiles.length + ' 个文件，' + formatProtoBytes(totalBytes) + ')');
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

function filterPrototypeFiles(files) {
    var res = [];
    for (var i = 0; i < files.length; i++) {
        var f = files[i];
        var path = (f.webkitRelativePath || f.relativePath || f.name).replace(/\\/g, '/');
        var parts = path.split('/');
        var hasJunk = false;
        for (var j = 0; j < parts.length; j++) {
            var p = parts[j];
            if (p === '__MACOSX' || p === 'Thumbs.db' || p === 'desktop.ini' || p.indexOf('._') === 0) {
                hasJunk = true;
                break;
            }
        }
        if (hasJunk) continue;
        var fileName = parts[parts.length - 1];
        if (fileName === '.DS_Store' || fileName.indexOf('.') === 0) continue;
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
                        showToast('文件夹为空或无法读取', 'warning');
                        return;
                    }
                    setProtoSourceFolder(entry.name, files);
                }).catch(function(err) {
                    showToast('文件夹读取失败: ' + (err.message || '未知错误'), 'error');
                });
                return;
            } else if (item.kind === 'file') {
                var file = item.getAsFile();
                if (file) {
                    if (file.name.toLowerCase().endsWith('.zip')) {
                        setProtoSourceZip(file);
                    } else {
                        showToast('请拖入 .zip 压缩包或原型文件夹', 'warning');
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
                showToast('请拖入 .zip 压缩包或原型文件夹', 'warning');
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

// 快速 Store 模式原生 PKZIP 组装器（含剥离公共父目录）
function createZipBlobFromFolder(files, defaultName, onProgress) {
    return new Promise(function(resolve, reject) {
        if (!files || files.length === 0) {
            return reject(new Error('文件夹中没有有效文件'));
        }

        var fileList = [];
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            var p = (f.webkitRelativePath || f.relativePath || f.name).replace(/\\/g, '/').replace(/^\/+/, '');
            fileList.push({ file: f, path: p });
        }

        // 计算公共父目录前缀并智能剥离
        var commonPrefix = '';
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
            return reject(new Error('未发现可打包的文件'));
        }
        if (!hasHtml) {
            return reject(new Error('选中的文件夹内未包含 HTML 原型页面，请确认是否为导出的原型文件夹'));
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
                reject(new Error('读取文件「' + item.path + '」失败'));
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
        showToast('发布任务进行中，请稍候', 'warning');
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
        showToast('请选择 ZIP 压缩包或原型文件夹', 'warning');
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
        showToast('开启群通知需填写更新日志', 'warning');
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
        if (!res.success) throw new Error(res.message || '版本名称检查失败');
        overwriteToken = res.data.overwrite_token || '';
        if (!res.data.exists) return true;
        return showConfirm({
            title:'替换已有版本',
            message:'版本「' + verName + '」已存在，继续将替换其原型文件和更新日志。',
            confirmText:'确认替换',
            isDanger:true
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
            throw new Error('发布内容已变更，请重新提交');
        }

        pWrap.style.display = 'block';
        pBar.style.width = '0%';
        pPercent.innerText = '0%';

        var prepareZipPromise;
        if (currentProtoSource.type === 'folder') {
            pText.innerText = '正在整理打包文件夹...';
            prepareZipPromise = createZipBlobFromFolder(currentProtoSource.files, currentProtoSource.name, function(curr, tot) {
                var p = Math.round((curr / tot) * 100);
                pText.innerText = '正在整理文件夹 (' + curr + '/' + tot + ')...';
                pBar.style.width = Math.min(95, Math.round(p * 0.2)) + '%';
            });
        } else {
            prepareZipPromise = Promise.resolve(currentProtoSource.file);
        }

        return prepareZipPromise.then(function(zipFile) {
            var zipUploadId = 'up_z_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
            var rpUploadId = rpFile ? ('up_r_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)) : '';
            var totalBytes = (zipFile ? zipFile.size : 0) + (rpFile ? rpFile.size : 0);

            pText.innerText = '正在上传...';
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
                pText.innerText = '正在解压发布...';

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
            if (isAdminConsoleOpen()) {
                closeModal('uploadModal');
                markAdminConsoleChanged();
                showToast(res.message || '版本发布成功', 'success');
                syncPublishedVersion(itemId, res.data.version);
            } else {
                pText.innerText = '发布成功！正在加载预览...';
                showToast(res.message || '版本发布成功', 'success', 2800, true);
                window.location.hash = '#item=' + itemId + '&v=' + encodeURIComponent(verName);
                setTimeout(function() {
                    window.location.reload();
                }, 300);
            }
        } else {
            showToast(res.message || '发布失败', 'error');
        }
    }).catch(function(err) {
        versionUploadBusy = false;
        btn.disabled = false;
        pText.innerText = '上传中断';
        showToast((err && err.message) ? err.message : '网络异常，请重试', 'error');
    });
}

// 通用分片上传辅助函数
function syncPublishedVersion(itemId, version) {
    if (!version) return;
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
        $node.find('.btn-table-ver').html('<i class="ri-history-line"></i> ' + latest.length + ' 个版本');
    });
    if (parseInt(currentVerManageItemId, 10) === parseInt(itemId, 10)) {
        currentVerManageAllVersions = latest;
        renderVersionManageView();
    }
    syncDashboardVersion(itemId, version.id, version.version_name);
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
            if (!res.success) throw new Error(res.message || '分片上传失败');
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
    setQuickCreateSubmitLabel('categoryModal', '保存');
    setQuickCreateSubmitLabel('itemModal', '保存');
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
        setQuickCreateSubmitLabel('categoryModal', '保存并继续');
    } else {
        resetQuickCreateFlow();
    }
    document.getElementById('catId').value = id || '0';
    document.getElementById('catName').value = name || '';
    document.getElementById('catModalTitle').innerText = id ? '编辑文件夹' : '新建文件夹';
    openModal('categoryModal');
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
        if (typeof showToast === 'function') showToast('请输入文件夹名称', 'warning');
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
                        var rowHtml = '<tr data-cat-id="' + newId + '" style="border-bottom:1px solid var(--border);">' +
                            '<td style="padding:10px 12px;font-weight:600;color:var(--text-1);"><i class="ri-folder-line" style="color:var(--primary);margin-right:6px;font-size:15px;vertical-align:-1px;"></i><span>' + safeName + '</span></td>' +
                            '<td style="padding:10px 12px;color:var(--text-2);font-size:12.5px;"><span style="font-weight:500;color:var(--text-1);">0</span> <span style="color:var(--text-3);font-size:11.5px;">个项目</span></td>' +
                            '<td style="padding:10px 12px;white-space:nowrap;">' +
                                '<button type="button" class="btn-act btn-cat-move-up" onclick="moveCategoryOrder(this, -1)" title="上移"><i class="ri-arrow-up-s-line"></i></button> ' +
                                '<button type="button" class="btn-act btn-cat-move-down" onclick="moveCategoryOrder(this, 1)" title="下移"><i class="ri-arrow-down-s-line"></i></button>' +
                            '</td>' +
                            '<td style="padding:10px 12px;text-align:right;white-space:nowrap;">' +
                                '<button type="button" class="btn-act btn-edit-cat-trigger" data-cat-id="' + newId + '" data-cat-name="' + safeName + '" title="编辑名称"><i class="ri-edit-line"></i></button> ' +
                                '<button type="button" class="btn-act btn-delete-cat-trigger" data-cat-id="' + newId + '" data-cat-name="' + safeName + '" data-count="0" title="删除文件夹"><i class="ri-delete-bin-line"></i></button>' +
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
                setQuickCreateSubmitLabel('categoryModal', '保存');
                if (typeof showToast === 'function') {
                    showToast('文件夹已创建，继续下一步', 'success');
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
                showToast(isEdit ? '文件夹已更新' : '文件夹创建成功', 'success');
            }
            if (typeof isAdminConsoleOpen === 'function' && !isAdminConsoleOpen()) {
                if (typeof window !== 'undefined' && window.location) {
                    window.location.reload();
                }
            }
        } else {
            showToast(res.message || '保存文件夹失败', 'error');
        }
    }).catch(function(err) {
        if (btn) btn.disabled = false;
        showToast((err && err.message) ? err.message : '网络异常，请重试', 'error');
    });
}

// 控制中心家族化矢量微插画辅助生成器 (对齐 Linear 浅色工作台与立象原型图纸体系)
function getConsoleFolderEmptySvg() {
    return '<svg width="120" height="96" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">' +
        '<circle cx="16" cy="18" r="1.5" fill="#cbd5e1"/>' +
        '<circle cx="104" cy="18" r="1.5" fill="#cbd5e1"/>' +
        '<circle cx="16" cy="78" r="1.5" fill="#cbd5e1"/>' +
        '<circle cx="104" cy="78" r="1.5" fill="#cbd5e1"/>' +
        '<rect x="34" y="24" width="56" height="44" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2" transform="rotate(-3 34 24)"/>' +
        '<path d="M30 28C30 25 32 23 35 23H48L53 28H81C84 28 86 30 86 33V66C86 69 84 71 81 71H35C32 71 30 69 30 66V28Z" fill="#ffffff" stroke="#94a3b8" stroke-width="1.4"/>' +
        '<line x1="36" y1="36" x2="80" y2="36" stroke="#f1f5f9" stroke-width="1"/>' +
        '<rect x="38" y="42" width="22" height="3" rx="1.5" fill="#cbd5e1"/>' +
        '<rect x="38" y="48" width="34" height="2.5" rx="1" fill="#f1f5f9"/>' +
        '<rect x="38" y="54" width="26" height="2.5" rx="1" fill="#f1f5f9"/>' +
        '<g transform="translate(68, 46)">' +
            '<circle cx="14" cy="14" r="13" fill="#e6f4fe" stroke="#bce0fc" stroke-width="1.3"/>' +
            '<path d="M14 9V19M9 14H19" stroke="#0076de" stroke-width="2" stroke-linecap="round"/>' +
        '</g>' +
    '</svg>';
}

function getConsoleProjectEmptySvg() {
    return '<svg width="120" height="96" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">' +
        '<circle cx="16" cy="18" r="1.5" fill="#cbd5e1"/>' +
        '<circle cx="104" cy="18" r="1.5" fill="#cbd5e1"/>' +
        '<circle cx="16" cy="78" r="1.5" fill="#cbd5e1"/>' +
        '<circle cx="104" cy="78" r="1.5" fill="#cbd5e1"/>' +
        '<rect x="34" y="20" width="56" height="46" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2" transform="rotate(3 62 43)"/>' +
        '<rect x="30" y="24" width="56" height="46" rx="6" fill="#ffffff" stroke="#94a3b8" stroke-width="1.4"/>' +
        '<line x1="30" y1="34" x2="86" y2="34" stroke="#f1f5f9" stroke-width="1"/>' +
        '<circle cx="36" cy="29" r="1.5" fill="#e2e8f0"/>' +
        '<circle cx="40.5" cy="29" r="1.5" fill="#e2e8f0"/>' +
        '<circle cx="45" cy="29" r="1.5" fill="#e2e8f0"/>' +
        '<rect x="37" y="40" width="18" height="4" rx="1.5" fill="#0076de" fill-opacity="0.2"/>' +
        '<rect x="37" y="48" width="18" height="12" rx="3" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>' +
        '<rect x="59" y="48" width="18" height="12" rx="3" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>' +
        '<g transform="translate(66, 44)">' +
            '<circle cx="14" cy="14" r="13" fill="#e6f4fe" stroke="#bce0fc" stroke-width="1.3"/>' +
            '<path d="M10 8L18 16L14 17L16 21L14 22L12 18L9 20Z" fill="#0076de" stroke="#ffffff" stroke-width="1" stroke-linejoin="round"/>' +
        '</g>' +
    '</svg>';
}

function getConsoleLinkEmptySvg() {
    return '<svg width="120" height="96" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">' +
        '<circle cx="16" cy="18" r="1.5" fill="#cbd5e1"/>' +
        '<circle cx="104" cy="18" r="1.5" fill="#cbd5e1"/>' +
        '<circle cx="16" cy="78" r="1.5" fill="#cbd5e1"/>' +
        '<circle cx="104" cy="78" r="1.5" fill="#cbd5e1"/>' +
        '<rect x="34" y="20" width="56" height="46" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2" transform="rotate(-3 34 20)"/>' +
        '<rect x="30" y="24" width="56" height="46" rx="6" fill="#ffffff" stroke="#94a3b8" stroke-width="1.4"/>' +
        '<line x1="30" y1="34" x2="86" y2="34" stroke="#f1f5f9" stroke-width="1"/>' +
        '<circle cx="36" cy="29" r="1.5" fill="#e2e8f0"/>' +
        '<circle cx="40.5" cy="29" r="1.5" fill="#e2e8f0"/>' +
        '<rect x="37" y="42" width="22" height="3" rx="1.5" fill="#cbd5e1"/>' +
        '<rect x="37" y="49" width="34" height="2.5" rx="1" fill="#f1f5f9"/>' +
        '<rect x="37" y="55" width="26" height="2.5" rx="1" fill="#f1f5f9"/>' +
        '<g transform="translate(66, 44)">' +
            '<circle cx="14" cy="14" r="13" fill="#e6f4fe" stroke="#bce0fc" stroke-width="1.3"/>' +
            '<path d="M11 17L17 11M17 11H12M17 11V16" stroke="#0076de" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</g>' +
    '</svg>';
}

function getConsoleMemberEmptySvg() {
    return '<svg width="120" height="96" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">' +
        '<circle cx="16" cy="18" r="1.5" fill="#cbd5e1"/>' +
        '<circle cx="104" cy="18" r="1.5" fill="#cbd5e1"/>' +
        '<circle cx="16" cy="78" r="1.5" fill="#cbd5e1"/>' +
        '<circle cx="104" cy="78" r="1.5" fill="#cbd5e1"/>' +
        '<rect x="26" y="22" width="46" height="46" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2" transform="rotate(-6 26 22)"/>' +
        '<circle cx="49" cy="36" r="4.5" fill="#e2e8f0"/>' +
        '<path d="M43 45C43 42.5 46 40.5 49 40.5C52 40.5 55 42.5 55 45" fill="#cbd5e1"/>' +
        '<rect x="36" y="24" width="48" height="46" rx="6" fill="#ffffff" stroke="#94a3b8" stroke-width="1.4"/>' +
        '<line x1="36" y1="34" x2="84" y2="34" stroke="#f1f5f9" stroke-width="1"/>' +
        '<circle cx="60" cy="29" r="1.75" fill="#e2e8f0"/>' +
        '<circle cx="60" cy="42" r="5" fill="#e6f4fe"/>' +
        '<path d="M54 51C54 48 57 46 60 46C63 46 66 48 66 51" fill="#bce0fc"/>' +
        '<line x1="48" y1="58" x2="72" y2="58" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round"/>' +
        '<g transform="translate(68, 46)">' +
            '<circle cx="14" cy="14" r="13" fill="#e6f4fe" stroke="#bce0fc" stroke-width="1.3"/>' +
            '<path d="M11 18V17C11 15.3431 12.3431 14 14 14C15.6569 14 17 15.3431 17 17V18" stroke="#0076de" stroke-width="1.4" stroke-linecap="round"/>' +
            '<circle cx="14" cy="10.5" r="2.5" stroke="#0076de" stroke-width="1.4"/>' +
        '</g>' +
    '</svg>';
}

function getConsoleVersionDraftSvg() {
    return '<svg width="120" height="96" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto 10px;">' +
        '<circle cx="16" cy="18" r="1.5" fill="#cbd5e1"/>' +
        '<circle cx="104" cy="18" r="1.5" fill="#cbd5e1"/>' +
        '<circle cx="16" cy="78" r="1.5" fill="#cbd5e1"/>' +
        '<circle cx="104" cy="78" r="1.5" fill="#cbd5e1"/>' +
        '<rect x="34" y="20" width="56" height="48" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2" transform="rotate(-3 34 20)"/>' +
        '<rect x="30" y="22" width="56" height="48" rx="6" fill="#ffffff" stroke="#94a3b8" stroke-width="1.4"/>' +
        '<line x1="30" y1="33" x2="86" y2="33" stroke="#f1f5f9" stroke-width="1"/>' +
        '<circle cx="36" cy="28" r="1.5" fill="#e2e8f0"/>' +
        '<circle cx="41" cy="28" r="1.5" fill="#e2e8f0"/>' +
        '<rect x="36" y="37" width="44" height="28" rx="4" fill="#f8fafc" stroke="#0076de" stroke-width="1.2" stroke-dasharray="3 3"/>' +
        '<g transform="translate(68, 46)">' +
            '<circle cx="14" cy="14" r="13" fill="#e6f4fe" stroke="#bce0fc" stroke-width="1.3"/>' +
            '<path d="M14 9V17M14 9L10 13M14 9L18 13" stroke="#0076de" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M9 19H19" stroke="#0076de" stroke-width="1.6" stroke-linecap="round"/>' +
        '</g>' +
    '</svg>';
}

function deleteCategory(catId) {
    confirmDeleteCategory(catId, '此文件夹', 0);
}

function confirmDeleteCategory(catId, catName, itemCount) {
    var count = parseInt(itemCount || 0, 10);
    var nameStr = catName || '此文件夹';
    var msg = (count > 0)
        ? '文件夹「' + nameStr + '」下包含 ' + count + ' 个项目。删除将同时清空该文件夹下的所有项目与历史版本，确定继续？'
        : '确定删除空文件夹「' + nameStr + '」？';
    showConfirm({
        title: '删除文件夹',
        message: msg,
        confirmText: '删除文件夹',
        isDanger: true,
        onConfirm: function() {
            var fd = new FormData();
            fd.append('id', catId);
            adminFetch('category_delete', fd).then(function(res) {
                if (res.success) {
                    showToast('文件夹已删除', 'success');
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
                                    '<div style="font-weight:600;font-size:13.5px;color:var(--text-1);margin-top:10px;">暂无文件夹分类</div>' +
                                    '<div style="font-size:12px;color:var(--text-3);margin-top:3px;margin-bottom:14px;">创建文件夹以井井有条地组织您的原型项目</div>' +
                                    '<button type="button" class="btn-primary btn-sm" onclick="openCategoryModal(0)"><i class="ri-folder-add-line"></i> 新建文件夹</button>' +
                                '</td></tr>'
                            );
                        }
                    } else {
                        window.location.reload();
                    }
                } else {
                    showToast(res.message || '删除文件夹失败', 'error');
                }
            });
        }
    });
}
window.confirmDeleteCategory = confirmDeleteCategory;

function switchOverviewSubTab(subTab) {
    subTab = (subTab === 'links' || subTab === 'folders') ? subTab : 'projects';
    sessionStorage.setItem('overview_active_subtab', subTab);
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
            showToast('文件夹排序已更新', 'success');
        } else {
            showToast(res.message || '更新排序失败', 'error');
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
            var catName = $('#filterProjectCategory option:selected').text() || '此文件夹';
            var emptyFilterHtml = '<tr class="filtered-empty-row"><td colspan="6" style="padding:40px 20px;text-align:center;">' +
                getConsoleProjectEmptySvg() +
                '<div style="font-weight:600;font-size:13.5px;color:var(--text-1);margin-top:10px;">「' + esc(catName) + '」下暂无原型项目</div>' +
                '<div style="font-size:12px;color:var(--text-3);margin-top:3px;margin-bottom:14px;">当前分类空空如也，可将已有项目归类至此或新建项目</div>' +
                '<button type="button" class="btn-primary btn-sm" onclick="openItemModal(0, ' + catId + ', \'project\')"><i class="ri-add-line"></i> 添加项目至此文件夹</button>' +
            '</td></tr>';
            $('#overviewTableProjects tbody').append(emptyFilterHtml);
        }
    }
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
            var catName = $('#filterLinkCategory option:selected').text() || '此文件夹';
            var emptyFilterHtml = '<tr class="filtered-empty-row"><td colspan="6" style="padding:40px 20px;text-align:center;">' +
                getConsoleLinkEmptySvg() +
                '<div style="font-weight:600;font-size:13.5px;color:var(--text-1);margin-top:10px;">「' + esc(catName) + '」下暂无外部链接</div>' +
                '<div style="font-size:12px;color:var(--text-3);margin-top:3px;margin-bottom:14px;">当前分类空空如也，可将外部设计稿或演示地址收纳至此</div>' +
                '<button type="button" class="btn-primary btn-sm" onclick="openItemModal(0, ' + catId + ', \'link\')"><i class="ri-add-line"></i> 添加外链至此文件夹</button>' +
            '</td></tr>';
            $('#overviewTableLinks tbody').append(emptyFilterHtml);
        }
    }
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
                showToast('外链排序已更新', 'success');
            } else {
                updateProjectOrderButtons(catId);
                showToast('项目排序已更新', 'success');
            }
        } else {
            showToast(res.message || '更新排序失败', 'error');
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
        showToast('请先创建文件夹，保存后继续', 'info');
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
        if (titleEl) titleEl.textContent = '新建链接';
        if (nameLabel) nameLabel.innerHTML = '链接名称 <span class="req-star">*</span>';
        if (nameInput) nameInput.placeholder = '输入链接名称';
    } else {
        if (titleEl) titleEl.textContent = '新建项目';
        if (nameLabel) nameLabel.innerHTML = '项目名称 <span class="req-star">*</span>';
        if (nameInput) nameInput.placeholder = '输入项目名称';
    }

    // 新建模式：作者无需指定，初始版本彻底解耦独立，表单极简纯净
    var authorGroup = document.getElementById('itemAuthorGroup');
    if (authorGroup) authorGroup.style.display = 'none';
    var ownerInput = document.getElementById('itemCreatedBy');
    if (ownerInput) ownerInput.required = false;

    if (document.getElementById('itemLinkUrl')) document.getElementById('itemLinkUrl').value = '';
    if (document.getElementById('itemLinkTarget')) document.getElementById('itemLinkTarget').value = '_blank';
    if (document.getElementById('itemWebhookUrl')) document.getElementById('itemWebhookUrl').value = '';
    var isAdvancingToUpload = (flow && flow.target === 'upload' && type !== 'link');
    setQuickCreateSubmitLabel('itemModal', isAdvancingToUpload ? '保存并继续' : '保存');
    if (isAdvancingToUpload) {
        showToast('请先创建项目，保存后继续发布', 'info');
    }

    toggleItemType(type);
    openModal('itemModal');
}

// 全局成员负责人下拉选项热重绘 (保持 #itemCreatedBy 永远与当前成员数据最新一致)
function syncAuthorSelectOptions() {
    var authorSelect = document.getElementById('itemCreatedBy');
    if (!authorSelect || typeof cachedUsersMap === 'undefined') return;

    var curVal = authorSelect.value;
    var optsHtml = '<option value="" disabled>请选择负责人</option>';
    
    // 提取所有活跃管理员与协作者
    var activeUsers = [];
    for (var uid in cachedUsersMap) {
        var u = cachedUsersMap[uid];
        if ((u.role === 'admin' || u.role === 'editor') && parseInt(u.status, 10) === 1) {
            activeUsers.push(u);
        }
    }
    // 按 ID 升序排列
    activeUsers.sort(function(a, b) { return parseInt(a.id, 10) - parseInt(b.id, 10); });

    activeUsers.forEach(function(u) {
        var uLabel = (u.name ? (u.name + ' (' + u.email + ')') : u.email) + (u.role === 'admin' ? ' (管理员)' : '');
        optsHtml += '<option value="' + u.id + '">' + esc(uLabel) + '</option>';
    });

    authorSelect.innerHTML = optsHtml;
    if (curVal) {
        authorSelect.value = curVal;
    }
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
    activeAdmins.forEach(function(au) {
        var auId = parseInt(au.id, 10);
        var isChecked = defaultAll ? true : (savedIds ? savedIds.indexOf(auId) !== -1 : false);
        var hasHook = !!String(au.webhook_url || '').trim();
        var uName = esc(au.name || au.email);
        html += '<label class="admin-select-option" style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:4px;cursor:pointer;font-size:12.5px;transition:background 0.15s;" onmouseover="this.style.background=\'var(--canvas)\'" onmouseout="this.style.background=\'transparent\'">' +
            '<input type="checkbox" name="visitor_notify_admin_ids[]" value="' + au.id + '" ' + (isChecked ? 'checked' : '') + ' onchange="onAdminSelectChange()" style="cursor:pointer;">' +
            '<span style="font-weight:600;color:var(--text-1);">' + uName + '</span>' +
            '<span class="admin-select-webhook-status" data-admin-webhook-status>' +
                (hasHook ? '<i class="ri-robot-line" title="已配置个人机器人 Webhook" role="img" aria-label="已配置个人机器人 Webhook"></i>' : '未配置机器人') +
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

    // 仅管理员在编辑已有【原型项目】时可见并可调整归属作者；外链无负责人属性
    var authorGroup = document.getElementById('itemAuthorGroup');
    if (authorGroup) {
        if (type !== 'link' && typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.role === 'admin') {
            authorGroup.style.display = 'block';
            var authorSelect = document.getElementById('itemCreatedBy');
            if (authorSelect) {
                authorSelect.required = true;
                var targetAuthorId = (data.created_by !== undefined && data.created_by !== null) ? String(data.created_by) : '0';

                // 清除之前的临时兜底选项
                var oldTempOpt = authorSelect.querySelector('.temp-fallback-author-option');
                if (oldTempOpt) {
                    oldTempOpt.remove();
                }

                var hasMatch = false;
                for (var i = 0; i < authorSelect.options.length; i++) {
                    if (authorSelect.options[i].value === targetAuthorId) {
                        hasMatch = true;
                        break;
                    }
                }

                // 若由于停用或角色变更在活跃列表中未匹配上且非 0，动态追加兜底 option，防止下拉框置空
                if (!hasMatch && targetAuthorId !== '0' && targetAuthorId !== '') {
                    var fallbackUser = (typeof cachedUsersMap !== 'undefined' && cachedUsersMap[targetAuthorId]) ? cachedUsersMap[targetAuthorId] : null;
                    var fallbackLabel = fallbackUser 
                        ? ((fallbackUser.name || fallbackUser.email) + (parseInt(fallbackUser.status, 10) === 3 ? ' (已停用)' : ''))
                        : ('成员 #' + targetAuthorId);
                    var newOpt = document.createElement('option');
                    newOpt.value = targetAuthorId;
                    newOpt.textContent = fallbackLabel;
                    newOpt.className = 'temp-fallback-author-option';
                    authorSelect.appendChild(newOpt);
                }

                authorSelect.value = targetAuthorId;
            }
        } else {
            authorGroup.style.display = 'none';
        }
    }
    var ownerInput = document.getElementById('itemCreatedBy');
    if (ownerInput) ownerInput.required = !!(authorGroup && authorGroup.style.display !== 'none');
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

    if (document.getElementById('btnItemSubmit')) document.getElementById('btnItemSubmit').innerText = '保存';

    var titleEl = document.getElementById('itemModalTitle');
    var nameLabel = document.getElementById('itemNameLabel');
    if (type === 'link') {
        if (titleEl) titleEl.textContent = '编辑链接';
        if (nameLabel) nameLabel.innerHTML = '链接名称 <span class="req-star">*</span>';
    } else {
        if (titleEl) titleEl.textContent = '编辑项目属性';
        if (nameLabel) nameLabel.innerHTML = '项目名称 <span class="req-star">*</span>';
    }
    openModal('itemModal');
}

function toggleItemType(type) {
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

    // 基本资料编辑不提交其他入口管理的协作者和全局水印配置。

    // 仅当编辑模式且作者调整组可见时才提交 created_by
    var authorGroup = document.getElementById('itemAuthorGroup');
    var authorEl = document.getElementById('itemCreatedBy');
    if (authorGroup && authorGroup.style && authorGroup.style.display !== 'none' && authorEl) {
        fd.append('created_by', authorEl.value);
    }

    adminFetch('item_save', fd).then(function(res) {
        if (btn) btn.disabled = false;
        if (res.success) {
            var itemId = (res.data && res.data.id) ? res.data.id : editId;
            var curFlow = (typeof getQuickCreateFlow === 'function') ? getQuickCreateFlow() : null;
            var isFlowActive = (!editId && capturedFlowId > 0 && curFlow && curFlow.id === capturedFlowId);
            var flow = isFlowActive ? curFlow : null;
            var shouldAdvanceUpload = (flow && flow.target === 'upload' && itemType === 'project');
            var curItemSession = (typeof itemModalSession !== 'undefined') ? itemModalSession : 0;
            var isFormSessionValid = (curItemSession === capturedModalSession && isModalOpen('itemModal'));

            if (shouldAdvanceUpload) {
                flow.createdAny = true;
                flow.advancing = true;
                if (typeof closeModal === 'function') {
                    closeModal('itemModal');
                }
                if (itemType === 'project') {
                    var advCatId = fd.get('category_id') || '0';
                    syncProjectSelectOption(itemId, fd.get('name') || '', fd.get('webhook_url') || '', advCatId, getCategoryNameById(advCatId));
                }
                if (typeof setQuickCreateSubmitLabel === 'function') {
                    setQuickCreateSubmitLabel('itemModal', '保存');
                }
                if (typeof showToast === 'function') {
                    showToast('项目已创建，继续发布版本', 'success');
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
                    syncProjectSelectOption(itemId, fd.get('name') || '', fd.get('webhook_url') || '', advCatId, getCategoryNameById(advCatId));
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
                syncProjectSelectOption(itemId, fd.get('name') || '', fd.get('webhook_url') || '', normCatId, getCategoryNameById(normCatId));
            }
            if (typeof showToast === 'function') {
                showToast(editId ? '修改保存成功' : '项目创建成功', 'success');
            }
            if (isAdminConsoleOpen()) {
                markAdminConsoleChanged();
                var itemName = fd.get('name') || '';
                var itemCatId = fd.get('category_id') || '0';
                var catText = $('#itemCatSelect option[value="' + itemCatId + '"]').text() || '未归类';
                var $row = $('#admin-item-row-' + itemId);
                if ($row.length) {
                    var prevCatId = String($row.attr('data-cat-id') || '0');
                    $row.data('cat-id', itemCatId).attr('data-cat-id', itemCatId);
                    $row.data('name', itemName).attr('data-name', itemName);
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
                        var targetText = (linkTarget === '_blank') ? '新标签页' : '内嵌预览';
                        var targetBadgeStyle = (linkTarget === '_blank') ? 'background:var(--primary-subtle);color:var(--primary);border:1px solid var(--primary-border);' : 'background:#f8fafc;color:var(--text-3);border:1px solid var(--border);';
                        if ($tds.length >= 4) {
                            $tds.eq(0).html('<i class="ri-external-link-line" style="color:var(--primary);margin-right:4px;font-size:14px;vertical-align:-1px;"></i>' + esc(itemName));
                            $tds.eq(1).text(catText);
                            $tds.eq(2).html('<span class="badge-tag" style="' + targetBadgeStyle + 'font-size:11px;">' + esc(targetText) + '</span>');
                            var urlHtml = '<div style="display:flex;align-items:center;gap:6px;">' +
                                '<a href="' + esc(linkUrl) + '" target="_blank" rel="noopener noreferrer" style="color:var(--primary);text-decoration:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;max-width:200px;" title="' + esc(linkUrl) + '">' + esc(linkUrl || '-') + '</a>' +
                                (linkUrl ? '<button type="button" class="btn-act btn-copy-url" data-url="' + esc(linkUrl) + '" title="复制链接"><i class="ri-file-copy-line"></i></button>' : '') +
                            '</div>';
                            $tds.eq(3).html(urlHtml);
                            var updatedLinkData = {
                                id: itemId,
                                type: 'link',
                                category_id: parseInt(itemCatId, 10),
                                name: itemName,
                                link_url: linkUrl,
                                link_target: linkTarget,
                                webhook_url: '',
                                created_by: (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) ? CURRENT_USER.id : 0
                            };
                            $row.find('.btn-edit-item-trigger')
                                .removeAttr('onclick')
                                .data('item-data', updatedLinkData)
                                .attr('data-item-json', JSON.stringify(updatedLinkData));
                        }
                    } else {
                        if ($tds.length >= 2) {
                            var $nameTd = $tds.eq(0);
                            var $badges = $nameTd.find('.badge-tag, .badge-link').detach();
                            $nameTd.text(' ' + itemName + ' ').append($badges);
                            $tds.eq(1).text(catText);

                            // 正确获取并维护负责人 ID 与展示名称，杜绝覆盖为当前登录者
                            var submittedAuthorId = fd.has('created_by') ? parseInt(fd.get('created_by'), 10) : 0;
                            var prevItemData = $row.find('.btn-edit-item-trigger').data('item-data') || {};
                            var finalAuthorId = submittedAuthorId > 0 ? submittedAuthorId : (parseInt(prevItemData.created_by, 10) || ((typeof CURRENT_USER !== 'undefined' && CURRENT_USER) ? CURRENT_USER.id : 0));

                            var authorName = '-';
                            if (typeof cachedUsersMap !== 'undefined' && cachedUsersMap[finalAuthorId]) {
                                authorName = cachedUsersMap[finalAuthorId].name || cachedUsersMap[finalAuthorId].email || '-';
                            } else if (document.getElementById('itemCreatedBy')) {
                                var selOpt = document.getElementById('itemCreatedBy').querySelector('option[value="' + finalAuthorId + '"]');
                                if (selOpt) {
                                    authorName = selOpt.textContent.split('(')[0].trim();
                                }
                            }
                            if ($tds.length >= 3 && authorName && authorName !== '-') {
                                $tds.eq(2).text(authorName);
                            }

                            var updatedProjData = {
                                id: itemId,
                                type: 'project',
                                category_id: parseInt(itemCatId, 10),
                                name: itemName,
                                link_url: '',
                                link_target: '_blank',
                                webhook_url: fd.get('webhook_url') || '',
                                created_by: finalAuthorId
                            };
                            $row.find('.btn-edit-item-trigger')
                                .removeAttr('onclick')
                                .data('item-data', updatedProjData)
                                .attr('data-item-json', JSON.stringify(updatedProjData));
                        }
                    }
                } else {
                    var safeItemName = esc(itemName);
                    var curUserName = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) ? CURRENT_USER.name : '-';
                    var curUserId = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) ? CURRENT_USER.id : 0;
                    if (itemType === 'link') {
                        var $lTableBody = $('#overviewTableLinks tbody');
                        if ($lTableBody.length) {
                            $lTableBody.find('tr:not([data-item-id])').remove();
                            var linkUrl = fd.get('link_url') || '';
                            var linkTarget = fd.get('link_target') || '_blank';
                            var targetText = (linkTarget === '_blank') ? '新标签页' : '内嵌预览';
                            var targetBadgeStyle = (linkTarget === '_blank') ? 'background:var(--primary-subtle);color:var(--primary);border:1px solid var(--primary-border);' : 'background:#f8fafc;color:var(--text-3);border:1px solid var(--border);';
                            var newLinkData = {
                                id: itemId,
                                type: 'link',
                                category_id: parseInt(itemCatId, 10),
                                name: itemName,
                                link_url: linkUrl,
                                link_target: linkTarget,
                                webhook_url: '',
                                created_by: curUserId
                            };
                            var newLinkRowHtml = '<tr id="admin-item-row-' + itemId + '" data-item-id="' + itemId + '" data-cat-id="' + itemCatId + '" data-name="' + safeItemName + '" data-type="link" data-can-edit="1" style="border-bottom:1px solid var(--border);">' +
                                '<td style="padding:9px 12px;font-weight:600;color:var(--text-1);"><i class="ri-external-link-line" style="color:var(--primary);margin-right:4px;font-size:14px;vertical-align:-1px;"></i>' + safeItemName + '</td>' +
                                '<td style="padding:9px 12px;color:var(--text-2);">' + esc(catText) + '</td>' +
                                '<td style="padding:9px 12px;"><span class="badge-tag" style="' + targetBadgeStyle + 'font-size:11px;">' + esc(targetText) + '</span></td>' +
                                '<td style="padding:9px 12px;max-width:260px;">' +
                                    '<div style="display:flex;align-items:center;gap:6px;">' +
                                        '<a href="' + esc(linkUrl) + '" target="_blank" rel="noopener noreferrer" style="color:var(--primary);text-decoration:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;max-width:200px;" title="' + esc(linkUrl) + '">' + esc(linkUrl || '-') + '</a>' +
                                        (linkUrl ? '<button type="button" class="btn-act btn-copy-url" data-url="' + esc(linkUrl) + '" title="复制链接"><i class="ri-file-copy-line"></i></button>' : '') +
                                    '</div>' +
                                '</td>' +
                                '<td style="padding:9px 12px;color:var(--text-2);">' + esc(curUserName) + '</td>' +
                                '<td style="padding:9px 12px;text-align:right;white-space:nowrap;">' +
                                    '<button type="button" class="btn-act link-order-btn btn-link-move-up" style="display:none;margin-right:2px;" onclick="moveItemOrder(this, -1)" title="上移"><i class="ri-arrow-up-s-line"></i></button>' +
                                    '<button type="button" class="btn-act link-order-btn btn-link-move-down" style="display:none;margin-right:6px;" onclick="moveItemOrder(this, 1)" title="下移"><i class="ri-arrow-down-s-line"></i></button>' +
                                    '<button type="button" class="btn-act btn-edit-item-trigger" data-item-json="' + esc(JSON.stringify(newLinkData)) + '" title="编辑属性"><i class="ri-edit-line"></i></button> ' +
                                    '<button type="button" class="btn-act" onclick="deleteItem(' + itemId + ')" title="删除"><i class="ri-delete-bin-line"></i></button>' +
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
                            var newProjData = {
                                id: itemId,
                                type: 'project',
                                category_id: parseInt(itemCatId, 10),
                                name: itemName,
                                link_url: '',
                                link_target: '_blank',
                                webhook_url: fd.get('webhook_url') || '',
                                created_by: curUserId
                            };
                            var newRowHtml = '<tr id="admin-item-row-' + itemId + '" data-item-id="' + itemId + '" data-cat-id="' + itemCatId + '" data-name="' + safeItemName + '" data-type="project" data-can-edit="1" style="border-bottom:1px solid var(--border);">' +
                                '<td style="padding:9px 12px;font-weight:600;color:var(--text-1);">' + safeItemName + '</td>' +
                                '<td style="padding:9px 12px;color:var(--text-2);">' + esc(catText) + '</td>' +
                                '<td style="padding:9px 12px;color:var(--text-2);">' + esc(curUserName) + '</td>' +
                                '<td style="padding:9px 12px;"><span class="badge-ver">-</span></td>' +
                                '<td style="padding:9px 12px;"><button type="button" class="btn-cancel btn-sm btn-table-ver" onclick="openVersionManageModal(' + itemId + ')"><i class="ri-history-line"></i> 0 个版本</button></td>' +
                                '<td style="padding:9px 12px;text-align:right;white-space:nowrap;">' +
                                    '<button type="button" class="btn-act project-order-btn btn-proj-move-up" style="display:none;margin-right:2px;" onclick="moveItemOrder(this, -1)" title="上移"><i class="ri-arrow-up-s-line"></i></button>' +
                                    '<button type="button" class="btn-act project-order-btn btn-proj-move-down" style="display:none;margin-right:6px;" onclick="moveItemOrder(this, 1)" title="下移"><i class="ri-arrow-down-s-line"></i></button>' +
                                    '<button type="button" class="btn-act" onclick="openUploadModal(' + itemId + ')" title="发布新版本"><i class="ri-upload-cloud-line"></i></button> ' +
                                    '<button type="button" class="btn-act btn-edit-item-trigger" data-item-json="' + esc(JSON.stringify(newProjData)) + '" title="编辑属性"><i class="ri-edit-line"></i></button> ' +
                                    '<button type="button" class="btn-act" onclick="deleteItem(' + itemId + ')" title="删除"><i class="ri-delete-bin-line"></i></button>' +
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
            showToast(res.message || '保存失败', 'error');
        }
    }).catch(function(err) {
        if (btn) btn.disabled = false;
        showToast((err && err.message) ? err.message : '网络异常，请重试', 'error');
    });
}

function deleteItem(itemId) {
    showConfirm({
        title: '删除项目',
        message: '确定删除该项目及所有版本？',
        confirmText: '删除项目',
        isDanger: true,
        onConfirm: function() {
            var fd = new FormData();
            fd.append('id', itemId);
            adminFetch('item_delete', fd).then(function(res) {
                if (res.success) {
                    showToast('已删除', 'success');
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
                                '<div style="font-weight:600;font-size:13.5px;color:var(--text-1);margin-top:10px;">暂无原型项目</div>' +
                                '<div style="font-size:12px;color:var(--text-3);margin-top:3px;margin-bottom:14px;">点击上方「新建项目」或直接将 .zip 原型压缩包拖入工作台发布</div>' +
                                '<button type="button" class="btn-primary btn-sm" onclick="openItemModal(0, 0, \'project\')"><i class="ri-add-line"></i> 新建项目</button>' +
                            '</td></tr>');
                        }
                        var $lRows = $('#overviewTableLinks tbody tr[data-item-id]');
                        if (!$lRows.length) {
                            $('#overviewTableLinks tbody').html('<tr class="empty-links-row"><td colspan="6" style="padding:44px 20px;text-align:center;">' +
                                getConsoleLinkEmptySvg() +
                                '<div style="font-weight:600;font-size:13.5px;color:var(--text-1);margin-top:10px;">暂无外部链接</div>' +
                                '<div style="font-size:12px;color:var(--text-3);margin-top:3px;margin-bottom:14px;">将 Figma、蓝湖、飞书文档或外部演示地址收纳至此，统一看板索引</div>' +
                                '<button type="button" class="btn-primary btn-sm" onclick="openItemModal(0, 0, \'link\')"><i class="ri-add-line"></i> 新建外链</button>' +
                            '</td></tr>');
                        }
                    } else {
                        window.location.reload();
                    }
                } else {
                    showToast(res.message || '删除失败', 'error');
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
            showToast(res.message || '获取成员列表失败，请重试', 'warning');
            if (tbody && tbody.children.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--danger);"><i class="ri-error-warning-line"></i> ' + esc(res.message || '获取成员列表失败') + ' <a href="javascript:void(0)" onclick="loadUserList()" style="color:var(--primary);margin-left:8px;">点击重试</a></td></tr>';
            }
            return;
        }
        cachedUsersMap = {};
        if (!res.data || res.data.length === 0) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--text-3);">暂无团队成员数据</td></tr>';
            return;
        }
        var html = '';
        var isCurAdmin = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.role === 'admin');
        var isCurOwner = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER && (CURRENT_USER.is_owner === 1 || CURRENT_USER.is_owner === '1'));
        if (isCurAdmin) {
            loadPendingUsers();
        }
        res.data.forEach(function(u) {
            cachedUsersMap[u.id] = u;
            var isTargetOwner = (u.is_owner === 1 || u.is_owner === '1');
            var roleBadge = isTargetOwner 
                ? '<span class="badge-tag badge-role-owner"><i class="ri-vip-crown-2-line"></i> 主管理员</span>'
                : ((u.role === 'admin') ? '<span class="badge-tag badge-role-admin">管理员</span>' : ((u.role === 'viewer') ? '<span class="badge-tag badge-role-viewer">审阅人</span>' : '<span class="badge-tag badge-role-editor">协作者</span>'));
            
            var statusBadge = (parseInt(u.status, 10) === 3 || parseInt(u.status, 10) === 0) ? '<span class="badge-tag badge-status-off">已停用</span>' : '';
            var nameText = esc(u.name || u.display_name || '未命名');
            var emailText = esc(u.email || u.username || '-');
            var deptText = esc(u.department || u.apply_remark || '-');
            var itemCount = parseInt(u.item_count || 0, 10);
            var webhookBadge = u.webhook_url ? '<i class="ri-robot-line" title="已配置个人机器人 Webhook" style="font-size:12px;color:var(--primary);margin-left:5px;cursor:help;"></i>' : '';

            var actionButtons = '';
            if (isCurAdmin) {
                // 如果当前登录者是 Owner，且目标也是管理员（非自己），显示移交钥匙按钮
                var transferBtn = (isCurOwner && u.role === 'admin' && parseInt(CURRENT_USER.id, 10) !== parseInt(u.id, 10))
                    ? `<button class="btn-act" onclick="openTransferOwnerModal(${parseInt(u.id, 10)})" title="移交主管理员所有权"><i class="ri-key-2-line" style="color:var(--primary);"></i></button>`
                    : '';

                // 工作交接按钮 (只要是管理员，可交接成员名下负责的项目)
                var handoverBtn = `<button class="btn-act" onclick="openHandoverModal(${parseInt(u.id, 10)})" title="工作交接"><i class="ri-arrow-left-right-line" style="color:var(--primary);"></i></button>`;

                // 若目标是 Owner，且当前用户非 Owner，隐藏删除与编辑按钮以防篡权
                if (isTargetOwner && !isCurOwner) {
                    actionButtons = `<span style="color:var(--text-3);opacity:0.6;">—</span>`;
                } else {
                    actionButtons = `
                        ${transferBtn}
                        ${handoverBtn}
                        <button class="btn-act" onclick="openEditUserModal(${parseInt(u.id, 10)})" title="编辑成员信息"><i class="ri-edit-line"></i></button>
                        ${isTargetOwner ? '' : `<button class="btn-act" onclick="handleDeleteUser(${parseInt(u.id, 10)})" title="删除用户"><i class="ri-delete-bin-line"></i></button>`}
                    `;
                }
            } else {
                actionButtons = `<span style="font-size:12px;color:var(--text-3);">${(parseInt(u.status, 10) === 3 || parseInt(u.status, 10) === 0 ? '已停用' : '已启用')}</span>`;
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
                        ${itemCount > 0 ? `<span style="font-weight:600;color:var(--text-1);">${itemCount} 个</span>` : '<span style="color:var(--text-3);">—</span>'}
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
        showToast('网络异常，获取成员列表失败', 'error');
        if (tbody && tbody.children.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--text-3);"><i class="ri-wifi-off-line"></i> 网络异常，<a href="javascript:void(0)" onclick="loadUserList()" style="color:var(--primary);">点击重试</a></td></tr>';
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
        showToast('未找到该用户信息', 'warning');
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
    var name = document.getElementById('editUserName').value.trim();
    var email = document.getElementById('editUserEmail').value.trim();
    var dept = document.getElementById('editUserDepartment').value.trim();
    var wbEl = document.getElementById('editUserWebhook');
    var wb = wbEl ? wbEl.value.trim() : '';

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
    var newPwd = document.getElementById('editUserPassword').value;
    if (newPwd) {
        fd.append('new_password', newPwd);
    }

    adminFetch('user_update', fd).then(function(res) {
        if (res.success) {
            if (wbEl) syncAdminNotificationWebhookState(uid, wb);
            closeModal('editUserModal');
            showToast('成员信息已更新', 'success');
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
            showToast(res.message || '更新用户信息失败', 'error');
        }
    });
}

function handleCreateUser(e) {
    e.preventDefault();
    var emailInput = document.getElementById('newEmail');
    var email = (typeof getResolvedEmail === 'function') ? getResolvedEmail('newEmail') : (emailInput ? emailInput.value.trim() : '');
    var name = document.getElementById('newName').value.trim();
    var password = document.getElementById('newPassword').value;
    var role = document.getElementById('newRole').value;
    var dept = document.getElementById('newDepartment').value.trim();
    var wbEl = document.getElementById('newWebhookUrl');
    var wb = wbEl ? wbEl.value.trim() : '';

    var fixedDomain = emailInput ? (emailInput.getAttribute('data-fixed-domain') || '') : '';
    var emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!fixedDomain && email.indexOf('@') === -1) {
        showToast('请输入完整工作邮箱，如 name@company.com', 'warning');
        if (emailInput) emailInput.focus();
        return;
    }
    if (!emailRegex.test(email)) {
        showToast('工作邮箱格式不正确，请输入有效的邮箱地址', 'warning');
        if (emailInput) emailInput.focus();
        return;
    }
    if (!name || name.length < 2) {
        showToast('请输入真实姓名（至少 2 个字符）', 'warning');
        document.getElementById('newName').focus();
        return;
    }
    if (!password || password.length < 6) {
        showToast('初始密码长度不能少于 6 位', 'warning');
        document.getElementById('newPassword').focus();
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
            showToast('成员已添加', 'success');
            if (isAdminConsoleOpen()) {
                markAdminConsoleChanged();
            }
            loadUserList();
        } else {
            showToast(res.message || '添加成员失败', 'error');
        }
    });
}

function openTransferOwnerModal(targetUserId) {
    var targetName = (cachedUsersMap[targetUserId] || {}).name || '';
    document.getElementById('transferTargetUserId').value = targetUserId;
    document.getElementById('transferTargetUserName').textContent = targetName;
    document.getElementById('transferConfirmPwd').value = '';
    openModal('transferOwnerModal');
    setTimeout(function() {
        document.getElementById('transferConfirmPwd').focus();
    }, 100);
}

function handleDoTransferOwner(e) {
    e.preventDefault();
    var targetId = parseInt(document.getElementById('transferTargetUserId').value, 10);
    var pwd = document.getElementById('transferConfirmPwd').value;
    var btn = document.getElementById('btnTransferSubmit');
    if (!pwd) {
        showToast('请输入当前密码以确认移交', 'warning');
        return;
    }
    btn.disabled = true;
    btn.innerText = '正在移交...';

    var fd = new FormData();
    fd.append('target_user_id', targetId);
    fd.append('password', pwd);

    adminFetch('transfer_ownership', fd).then(function(res) {
        btn.disabled = false;
        btn.innerText = '确认移交';
        if (res.success) {
            closeModal('transferOwnerModal');
            showToast(res.message || '所有权已成功移交', 'success', 3000, true);
            setTimeout(function() {
                window.location.reload();
            }, 1200);
        } else {
            showToast(res.message || '移交失败', 'error');
        }
    }).catch(function() {
        btn.disabled = false;
        btn.innerText = '确认移交';
        showToast('网络请求异常', 'error');
    });
}

// 工作交接弹窗
function openHandoverModal(fromId) {
    var fromUser = cachedUsersMap[fromId] || {};
    var fromName = fromUser.name || '';
    var count = parseInt(fromUser.item_count || 0, 10);
    if (!count || parseInt(count, 10) <= 0) {
        showToast('该成员名下暂无负责的项目，无需交接', 'info', 2500);
        return;
    }
    document.getElementById('handoverFromUserId').value = fromId;
    var descEl = document.getElementById('handoverDescText');
    if (descEl) {
        descEl.innerHTML = '将 <strong>' + esc(fromName) + '</strong> 名下的 <strong>' + count + '</strong> 个负责项目交接给接管人。';
    }
    var $select = $('#handoverToUserId');
    $select.empty().append('<option value="">-- 选择接管成员 --</option>');

    // 过滤出除当前用户外的管理员或协作者 (且状态正常)
    for (var uid in cachedUsersMap) {
        var u = cachedUsersMap[uid];
        if (parseInt(u.id, 10) !== parseInt(fromId, 10) && (u.role === 'admin' || u.role === 'editor') && parseInt(u.status, 10) === 1) {
            var uLabel = (u.name || u.email) + ' (' + (u.role === 'admin' ? '管理员' : '协作者') + ')';
            $select.append($('<option>').val(u.id).text(uLabel));
        }
    }

    var deactCb = document.getElementById('handoverDeactivateFrom');
    if (deactCb) deactCb.checked = false;

    openModal('userHandoverModal');
}

function handleUserHandover(e) {
    e.preventDefault();
    var fromId = parseInt(document.getElementById('handoverFromUserId').value, 10) || 0;
    var toId = parseInt(document.getElementById('handoverToUserId').value, 10) || 0;
    var deact = document.getElementById('handoverDeactivateFrom').checked ? 1 : 0;
    var btn = document.getElementById('btnHandoverSubmit');

    if (!toId) {
        showToast('请选择接管成员', 'warning');
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
            showToast(res.message || '工作交接成功', 'success');
            closeModal('userHandoverModal');
            loadUserList();

            // 深度热同步：遍历更新项目管理表格行与前台树节点
            var toUser = (typeof cachedUsersMap !== 'undefined' && cachedUsersMap[toId]) ? cachedUsersMap[toId] : null;
            var toName = toUser ? (toUser.name || toUser.email || '接管成员') : '接管成员';

            // 1. 同步控制中心项目列表与外链列表 (无需刷新页面，即时全景热更新)
            $('#overviewTableProjects tbody tr[data-item-id], #overviewTableLinks tbody tr[data-item-id]').each(function() {
                var $row = $(this);
                var rowCreatedBy = parseInt($row.attr('data-created-by'), 10);
                if (isNaN(rowCreatedBy)) {
                    var $btn = $row.find('.btn-edit-item-trigger');
                    var d = $btn.data('item-data');
                    if (d && d.created_by) rowCreatedBy = parseInt(d.created_by, 10);
                }

                if (rowCreatedBy === fromId) {
                    $row.attr('data-created-by', toId).data('created-by', toId);
                    $row.attr('data-creator-name', toName).data('creator-name', toName);

                    // 在项目表格中，第 3 列为负责人 (列索引 2: 0=名称, 1=文件夹, 2=负责人)
                    // 在外链表格中，第 5 列为创建者 (列索引 4)
                    var isLinkTable = $row.closest('#overviewTableLinks').length > 0;
                    if (isLinkTable) {
                        $row.find('td').eq(4).text(toName);
                    } else {
                        $row.find('td').eq(2).text(toName);
                    }

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
                            itemData.created_by = toId;
                            $editBtn.data('item-data', itemData).attr('data-item-json', JSON.stringify(itemData));
                        }
                        var onclickAttr = $editBtn.attr('onclick');
                        if (onclickAttr && onclickAttr.indexOf('openEditItemModal') !== -1) {
                            var updatedOnclick = onclickAttr.replace(new RegExp('(&quot;created_by&quot;\\s*:\\s*)' + fromId, 'g'), '$1' + toId);
                            $editBtn.attr('onclick', updatedOnclick);
                        }
                    }
                }
            });

            // 2. 同步前台目录树节点与右侧顶部状态栏
            $('li.item-row').each(function() {
                var $node = $(this);
                var nodeCreatedBy = parseInt($node.attr('data-created-by'), 10);
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

            // 3. 维护负责人下拉框中的选项状态
            var authorSelect = document.getElementById('itemCreatedBy');
            if (authorSelect) {
                // 若原成员已停用，将原选项文字打上 (已停用) 标识
                if (deact) {
                    for (var i = 0; i < authorSelect.options.length; i++) {
                        if (parseInt(authorSelect.options[i].value, 10) === fromId) {
                            authorSelect.options[i].textContent = authorSelect.options[i].textContent.replace(/\s*\(已停用\)/g, '') + ' (已停用)';
                            break;
                        }
                    }
                }
                // 确保接管人在下拉框中存在
                var hasTo = false;
                for (var j = 0; j < authorSelect.options.length; j++) {
                    if (parseInt(authorSelect.options[j].value, 10) === toId) {
                        hasTo = true;
                        break;
                    }
                }
                if (!hasTo && toUser) {
                    var opt = document.createElement('option');
                    opt.value = toId;
                    opt.textContent = (toUser.name ? (toUser.name + ' (' + toUser.email + ')') : toUser.email) + (toUser.role === 'admin' ? ' (管理员)' : '');
                    authorSelect.appendChild(opt);
                }
            }

            if (isAdminConsoleOpen()) {
                markAdminConsoleChanged();
            } else {
                setTimeout(function() { window.location.reload(); }, 1200);
            }
        } else {
            showToast(res.message || '工作交接失败', 'error');
        }
    }).catch(function() {
        if (btn) btn.disabled = false;
        showToast('网络异常，交接失败', 'error');
    });
}

function handleDeleteUser(id) {
    showConfirm({
        title: '删除成员',
        message: '确定删除该成员账号？',
        confirmText: '删除成员',
        isDanger: true,
        onConfirm: function() {
            var fd = new FormData();
            fd.append('id', id);
            adminFetch('user_delete', fd).then(function(res) {
                if (res.success) {
                    showToast('成员已删除', 'success');
                    if (isAdminConsoleOpen()) {
                        markAdminConsoleChanged();
                    }
                    loadUserList();
                } else {
                    showToast(res.message || '删除成员失败', 'error');
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
            tbody.innerHTML = '<tr><td colspan="5" style="padding:32px;text-align:center;color:var(--text-3);"><i class="ri-checkbox-circle-line" style="font-size:18px;vertical-align:middle;margin-right:4px;color:var(--success);"></i> 无待审批的加入申请</td></tr>';
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
        var nameText = esc(u.name || u.display_name || '未命名');
        var emailText = esc(u.email || u.username || '-');
        var deptText = esc(u.department || u.apply_remark || '-');
        var requestedRole = (u.role === 'editor') ? 'editor' : 'viewer';
        var roleBadge = (requestedRole === 'editor')
            ? '<span class="badge-tag badge-role-editor">协作者</span>'
            : '<span class="badge-tag badge-role-viewer">审阅人</span>';
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
                            <option value="viewer"${requestedRole === 'viewer' ? ' selected' : ''}>审阅人</option>
                            <option value="editor"${requestedRole === 'editor' ? ' selected' : ''}>协作者</option>
                        </select>
                        <button type="button" class="btn-primary btn-sm" style="margin-right:6px;" onclick="handleApproveUser(${id})"><i class="ri-check-line"></i> 批准</button>
                        <button type="button" class="btn-cancel btn-sm btn-danger-sm" onclick="handleRejectUser(${id})"><i class="ri-close-line"></i> 驳回</button>
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
        if (!res.success) throw new Error(res.message || '加载待审批列表失败');
        var count = includeList ? res.data.length : res.data.count;
        setPendingUserCount(count);
        if (includeList) {
            renderPendingUsers(res.data);
            pendingUsersLoaded = true;
        }
    }).catch(function(error) {
        if (!includeList || pendingUsersLoaded || revision !== pendingUsersRevision) return;
        var tbody = document.getElementById('pendingUsersTbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--danger);">' + esc(error.message || '加载待审批列表失败') + '</td></tr>';
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
            showToast(res.message || '已批准入驻', 'success');
            if (isAdminConsoleOpen()) {
                markAdminConsoleChanged();
            }
            pendingUsersRevision++;
            loadPendingUsers();
            loadUserList();
        } else {
            showToast(res.message || '批准操作失败', 'error');
        }
    });
}

function handleRejectUser(id) {
    showConfirm({
        title: '驳回申请',
        message: '确定驳回这条入驻申请？',
        confirmText: '确认驳回',
        isDanger: true,
        onConfirm: function() {
            var fd = new FormData();
            fd.append('id', id);
            adminFetch('reject_user', fd).then(function(res) {
                if (res.success) {
                    showToast('已驳回申请', 'success');
                    if (isAdminConsoleOpen()) {
                        markAdminConsoleChanged();
                    }
                    pendingUsersRevision++;
                    loadPendingUsers();
                } else {
                    showToast(res.message || '操作失败', 'error');
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
    if (el) el.innerHTML = '<span style="color:var(--text-3);">默认 Axure 原型网点底纹</span>';
    var box = document.getElementById('previewBgImgWrap');
    if (box) {
        box.innerHTML = '<div style="width:100%;height:100%;background-color:var(--canvas,#f8fafc);background-image:url(\"data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'8\' height=\'8\'%3E%3Crect width=\'1\' height=\'1\' fill=\'%2394a3b8\' opacity=\'0.5\'/%3E%3C/svg%3E\");background-size:8px 8px;display:flex;align-items:center;justify-content:center;color:var(--primary);font-size:13px;" title="默认 Axure 原型网点底纹"><i class="ri-grid-line"></i></div>';
    }
}

function handleBgFileSelected(input) {
    if (input.files && input.files[0]) {
        var file = input.files[0];
        var el = document.getElementById('bgFileNameDisplay');
        if (el) {
            el.innerHTML = '<span style="color:var(--primary);font-weight:550;">待保存：' + esc(file.name) + '</span>';
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
    if (state.running) {
        // Even a change back to the in-flight value supersedes an older pending edit.
        state.pending = job;
        setAutoSaveStatus(action, '保存中…', false);
        return state.promise;
    }
    if (state.savedKey === key) {
        setAutoSaveStatus(action, '已保存', false);
        return Promise.resolve(true);
    }
    state.pending = job;
    state.running = true;
    setAutoSaveStatus(action, '保存中…', false);
    function drain() {
        var current = state.pending;
        state.pending = null;
        return adminFetch(action, current.fd, false).then(function(res) {
            if (!res.success) {
                var failure = new Error(res.message || '保存失败，请重试');
                failure.userMessage = res.message || '保存失败，请重试';
                throw failure;
            }
            state.savedKey = current.key;
            if (current.onSaved) current.onSaved(current.fd, res.data);
            if (state.blocked) return false;
            if (state.pending && state.pending.key === state.savedKey) state.pending = null;
            if (state.pending) return drain();
            setAutoSaveStatus(action, '已保存', false);
            var actionLabel = action === 'save_role_permissions' ? '角色权限已保存' : '系统设置已保存';
            showToast(actionLabel, 'success');
            if (isAdminConsoleOpen()) {
                markAdminConsoleChanged();
            }
            return true;
        }).catch(function(error) {
            if (state.blocked) return false;
            // A newer complete snapshot may still succeed after an older failure.
            if (state.pending) return drain();
            setAutoSaveStatus(action, error.userMessage || '保存失败，请检查网络后重试', true);
            showToast(error.userMessage || '保存失败，请检查网络后重试', 'error');
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
    return queueAutoSave('save_role_permissions', fd);
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
            blockAutoSave('save_settings', '邮箱域名格式有误');
            showToast('邮箱域名请填写 company.com 格式，不含 @', 'warning');
            return Promise.resolve(false);
        }
        domainsInput.value = check.clean;
    }

    if (domainsInput) {
        domainsInput.removeAttribute('aria-invalid');
        domainsInput.removeAttribute('aria-describedby');
    }

    var baseUrlInput = form.querySelector('input[name="site_base_url"]');
    if (baseUrlInput) {
        var rawBaseUrl = baseUrlInput.value.trim().replace(/\/+$/, '');
        if (rawBaseUrl) {
            var baseUrlOk = /^https?:\/\/[a-z0-9.-]+(?::\d{1,5})?(?:\/[^\s?#]*)?$/i.test(rawBaseUrl);
            if (!baseUrlOk) {
                baseUrlInput.setAttribute('aria-invalid', 'true');
                baseUrlInput.setAttribute('aria-describedby', 'settingsSaveStatus');
                blockAutoSave('save_settings', '站点地址格式有误');
                showToast('站点访问地址格式不正确，例如 https://proto.company.com', 'warning');
                return Promise.resolve(false);
            }
            if (typeof window !== 'undefined' && window.location && window.location.hostname) {
                try {
                    var parsedBase = new URL(rawBaseUrl);
                    if (parsedBase.hostname.toLowerCase() !== window.location.hostname.toLowerCase()) {
                        baseUrlInput.setAttribute('aria-invalid', 'true');
                        baseUrlInput.setAttribute('aria-describedby', 'settingsSaveStatus');
                        blockAutoSave('save_settings', '站点域名与当前访问不符');
                        showToast('站点访问地址的域名需与当前访问域名一致', 'warning');
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
                        blockAutoSave('save_settings', '站点端口与当前访问不符');
                        showToast('站点访问地址的端口需与当前访问端口一致', 'warning');
                        return Promise.resolve(false);
                    }
                } catch (err) {
                    baseUrlInput.setAttribute('aria-invalid', 'true');
                    baseUrlInput.setAttribute('aria-describedby', 'settingsSaveStatus');
                    blockAutoSave('save_settings', '站点地址格式有误');
                    showToast('站点访问地址格式不正确，例如 https://proto.company.com', 'warning');
                    return Promise.resolve(false);
                }
            }
            baseUrlInput.value = rawBaseUrl;
        }
        baseUrlInput.removeAttribute('aria-invalid');
        baseUrlInput.removeAttribute('aria-describedby');
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
                blockAutoSave('save_settings', '请先填写 SMTP 服务器、端口与发信邮箱');
                return Promise.resolve(false);
            }
            if (!hasPassAttr && !hasPassVal) {
                smtpSwitch.checked = false;
                blockAutoSave('save_settings', '请先填写邮箱客户端授权码');
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
            brandText.textContent = newTitle || '立象原型';
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
                showToast('发信服务器或邮箱已更换，请重新填写授权码', 'info');
            }
        }
        if (respData && typeof respData.mail_reset_enabled === 'boolean') {
            window.SYS_MAIL_RESET_ENABLED = respData.mail_reset_enabled;
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
        passEl.placeholder = hasPass ? '已配置，留空保持不变' : '输入客户端授权码';
    }
    if (badge) {
        badge.textContent = hasPass ? '已配置' : '请使用客户端授权码';
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
            setAutoSaveStatus('save_settings', '已保存', false);
            showToast('已清除邮箱授权码', 'success');
        } else {
            showToast(res.message || '操作失败', 'error');
        }
    }).catch(function() {
        showToast('网络请求异常', 'error');
    });
}
window.clearSavedSmtpPass = clearSavedSmtpPass;

function handleTestSmtp(btnEl) {
    var toEl = document.getElementById('smtpTestEmail');
    var toEmail = toEl ? toEl.value.trim() : '';
    if (!toEmail) {
        showToast('请输入测试收件邮箱', 'warning');
        if (toEl) toEl.focus();
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
        btnEl.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> 发送中...';
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
            showToast(res.message || '测试邮件已发送', 'success');
        } else {
            showToast(res.message || '发送失败', 'error');
        }
    }).catch(function() {
        restore();
        showToast('网络请求异常', 'error');
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

function openAdminConsole(defaultTab, subTab) {
    var modal = document.getElementById('adminConsoleModal');
    if (!modal) return;
    if (!defaultTab) {
        if (checkHasPendingUsers()) {
            defaultTab = 'users';
            if (!subTab) subTab = 'pending';
        } else {
            defaultTab = 'dashboard';
        }
    }
    switchAdminTab(defaultTab, subTab);
    openModal('adminConsoleModal');
}

function closeAdminConsole() {
    var modal = document.getElementById('adminConsoleModal');
    if (modal) closeModal('adminConsoleModal');
}

function switchAdminTab(tabKey, subTab) {
    if (tabKey === 'security') tabKey = 'brand';

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
        'dashboard': '数据概览',
        'overview': '项目管理',
        'users': '团队成员',
        'roles': '角色权限',
        'brand': '系统设置',
        'logs': '系统日志'
    };

    var titleEl = document.getElementById('adminPanelTitle');
    if (titleEl) titleEl.textContent = titles[tabKey] || '数据概览';

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

// 数据概览 ECharts 现代图表渲染与自适应
var chartAnnotationDonut = null;
var chartTrend = null;
var currentTrendRange = '7d';
var currentAnnoProjFilter = 0;
var currentAnnoVerFilter = 0;

function renderAnnotationDashboard() {
    if (typeof echarts === 'undefined') return;
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

    var total = list.length;
    var pending = 0;
    var resolved = 0;
    for (var i = 0; i < list.length; i++) {
        if (parseInt(list[i].status, 10) === 1) {
            resolved++;
        } else {
            pending++;
        }
    }
    var rate = (total > 0) ? Math.round((resolved / total) * 100) : 100;

    // 1. 绘制批注待办与闭环占比环形图
    var chartData = [];
    var chartColors = [];
    if (total === 0) {
        chartData = [{ value: 1, name: '暂无批注' }];
        chartColors = ['#e2e8f0'];
    } else {
        if (pending > 0) {
            chartData.push({ value: pending, name: '待处理' });
            chartColors.push('#f59e0b');
        }
        if (resolved > 0) {
            chartData.push({ value: resolved, name: '已闭环' });
            chartColors.push('#10b981');
        }
    }

    chartAnnotationDonut.setOption({
        tooltip: {
            trigger: 'item',
            show: total > 0,
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            borderColor: 'transparent',
            textStyle: { color: '#fff', fontSize: 12 },
            formatter: function(params) {
                var pct = total > 0 ? Math.round((params.value / total) * 100) : 0;
                return '<div style="font-weight:600;">' + esc(params.name) + '</div>' +
                       '<div style="font-size:12px;color:#cbd5e1;">' + params.value + ' 条 (' + pct + '%)</div>';
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
                borderColor: '#fff',
                borderWidth: total > 0 ? 1 : 0
            }
        }]
    }, true);

    // 动态同步圆环中心文字（纯 CSS 双向绝对居中，彻底消除 canvas 字体基线与百分比估算误差）
    var rateEl = document.getElementById('donutCenterRate');
    var labelEl = document.getElementById('donutCenterLabel');
    if (rateEl) rateEl.textContent = (total === 0) ? '0' : rate + '%';
    if (labelEl) labelEl.textContent = (total === 0) ? '无待办' : '闭环率';

    // 2. 渲染右侧指标详情面板
    if (detailDom) {
        if (total === 0) {
            detailDom.innerHTML = `
                <div style="text-align:center;padding:12px 0;color:var(--text-3);font-size:11.5px;">
                    <i class="ri-checkbox-circle-line" style="font-size:22px;color:var(--success);display:block;margin-bottom:4px;opacity:0.85;"></i>
                    当前范围内暂无批注待办
                </div>
            `;
        } else {
            var pendingColor = pending > 0 ? '#f59e0b' : 'var(--text-1)';
            detailDom.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:7px;padding-right:4px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-size:11.5px;color:var(--text-2);display:inline-flex;align-items:center;gap:4px;">
                            <span style="width:6px;height:6px;border-radius:50%;background:#f59e0b;display:inline-block;"></span>
                            <span>待处理</span>
                        </span>
                        <span style="font-size:14px;font-weight:700;color:${pendingColor};">${pending} <span style="font-size:10.5px;font-weight:400;color:var(--text-3);">条</span></span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-size:11.5px;color:var(--text-2);display:inline-flex;align-items:center;gap:4px;">
                            <span style="width:6px;height:6px;border-radius:50%;background:#10b981;display:inline-block;"></span>
                            <span>已闭环</span>
                        </span>
                        <span style="font-size:14px;font-weight:700;color:var(--success);">${resolved} <span style="font-size:10.5px;font-weight:400;color:var(--text-3);">条</span></span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;padding-top:6px;border-top:1px dashed var(--border);">
                        <span style="font-size:11px;color:var(--text-3);">累计批注</span>
                        <span style="font-size:11.5px;font-weight:600;color:var(--text-1);">${total} 条</span>
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
        verSelect.innerHTML = '<option value="0">全部版本</option>';
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
    if (typeof echarts === 'undefined') return;
    if (range) currentTrendRange = range;

    var data = window.DASHBOARD_DATA || {};

    // 1. 批注待办与闭环占比环形图 + 详情卡
    renderAnnotationDashboard();

    // 2. 查阅走势多角色堆叠面积图 (内部审阅人 / 管理与协作者 / 外发访客)
    var trendDom = document.getElementById('chartTrend');
    if (trendDom) {
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

        var trendRoleDefs = [
            {
                name: '外发访客',
                data: valsShare,
                color: '#f59e0b',
                areaTop: 'rgba(245, 158, 11, 0.46)',
                areaBottom: 'rgba(245, 158, 11, 0.20)'
            },
            {
                name: '内部审阅人',
                data: valsViewer,
                color: '#10b981',
                areaTop: 'rgba(16, 185, 129, 0.46)',
                areaBottom: 'rgba(16, 185, 129, 0.20)'
            },
            {
                name: '管理与协作者',
                data: valsEditor,
                color: '#0076de',
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

        var tooltipOrder = { '内部审阅人': 0, '管理与协作者': 1, '外发访客': 2 };

        chartTrend.setOption({
            tooltip: {
                trigger: 'axis',
                confine: true,
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                borderColor: 'transparent',
                textStyle: { color: '#fff', fontSize: 12 },
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
                    var html = '<div style="font-size:11.5px;color:#94a3b8;margin-bottom:4px;">' + esc(dateStr) + '</div>';
                    html += '<div style="font-size:12.5px;font-weight:700;color:#fff;margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.12);">累计查阅: ' + total + ' 次</div>';
                    for (var p = 0; p < ordered.length; p++) {
                        var item = ordered[p];
                        html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:11.5px;color:#cbd5e1;margin-top:2px;">' +
                               '<span>' + item.marker + ' ' + esc(item.seriesName) + '</span>' +
                               '<span style="font-weight:600;color:#fff;">' + item.value + ' 次</span>' +
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
                axisLine: { lineStyle: { color: '#e2e8f0' } },
                axisLabel: { color: '#94a3b8', fontSize: 10 }
            },
            yAxis: {
                type: 'value',
                minInterval: 1,
                splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
                axisLabel: { color: '#94a3b8', fontSize: 10 }
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
            showToast(res.message || '获取日志失败', 'warning');
            return;
        }
        var data = res.data || {};
        
        // 渲染登录日志
        var loginLogs = data.login_logs || [];
        var loginTbody = document.getElementById('loginLogsTableBody');
        if (loginTbody) {
            if (loginLogs.length === 0) {
                loginTbody.innerHTML = '<tr><td colspan="6" style="padding:32px;text-align:center;color:var(--text-3);font-size:13px;"><i class="ri-shield-check-line" style="font-size:24px;color:var(--success);display:block;margin-bottom:6px;opacity:0.8;"></i>近期风平浪静，暂无异常登录记录</td></tr>';
            } else {
                var lHtml = '';
                loginLogs.forEach(function(l) {
                    var statusBadge = (parseInt(l.status, 10) === 1)
                        ? '<span class="badge-tag badge-success">成功</span>'
                        : '<span class="badge-tag badge-danger">失败</span>';
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
                            <td style="padding:9px 12px;color:var(--text-2);font-size:12.5px;" title="${esc(l.user_agent || '')}">${esc(l.device || '未知设备')}</td>
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
                accessTbody.innerHTML = '<tr><td colspan="6" style="padding:32px;text-align:center;color:var(--text-3);font-size:13px;"><i class="ri-radar-line" style="font-size:24px;color:var(--primary);display:block;margin-bottom:6px;opacity:0.8;"></i>暂无外部访问，生成外发链接后在此洞察浏览动态</td></tr>';
            } else {
                var aHtml = '';
                accessLogs.forEach(function(al) {
                    var typeBadge = (al.access_type === 'share')
                        ? '<span class="badge-tag badge-primary">独立短链</span>'
                        : '<span class="badge-tag badge-neutral">工作台</span>';
                    aHtml += `
                        <tr style="border-bottom:1px solid var(--border);">
                            <td style="padding:9px 12px;color:var(--text-3);font-size:12px;">${esc(al.created_at)}</td>
                            <td style="padding:9px 12px;font-weight:600;color:var(--text-1);">${esc(al.item_name)}</td>
                            <td style="padding:9px 12px;color:var(--primary);font-weight:500;">${esc(al.version_name || '-')}</td>
                            <td style="padding:9px 12px;">${typeBadge}</td>
                            <td style="padding:9px 12px;font-family:ui-monospace,monospace;font-size:12px;color:var(--text-2);">${esc(al.ip)}</td>
                            <td style="padding:9px 12px;color:var(--text-2);font-size:12.5px;" title="${esc(al.user_agent || '')}">${esc(al.device || '未知设备')}</td>
                        </tr>
                    `;
                });
                accessTbody.innerHTML = aHtml;
            }
        }
    }).catch(function(err) {
        showToast('获取日志失败，请稍后重试', 'error');
    });
}

function handleClearLogs() {
    showConfirm({
        title: '清空日志',
        message: '清空所有登录和访问日志？此操作无法撤销。',
        confirmText: '清空日志',
        isDanger: true,
        onConfirm: function() {
            var fd = new FormData();
            fd.append('type', 'all');
            adminFetch('log_clear', fd).then(function(res) {
                if (res.success) {
                    showToast('日志已清空', 'success');
                    loadLogsData();
                } else {
                    showToast(res.message || '清空失败', 'error');
                }
            }).catch(function() {
                showToast('网络异常，清空失败', 'error');
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

    var projectName = $node.data('name') || ($treeNode.length ? $treeNode.data('name') : '项目');
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

    $('#verManageTitle').text('版本管理 · ' + projectName);

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
    openModal('versionManageModal');
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
        $countBadge.text('共 ' + totalVersions + ' 个版本').show();
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
            ? '<button type="button" class="btn-primary btn-md" onclick="quickOpenUploadFromVersionManage()"><i class="ri-upload-cloud-line"></i> 发布首个版本</button>'
            : '<span style="font-size:12px;color:var(--text-3);">此项目暂未发布任何公开版本</span>';
        $empty.html(
            '<div class="m-empty-icon"><i class="ri-draft-line"></i></div>' +
            '<div style="font-size:13px;font-weight:550;color:var(--text-2);margin-bottom:3px;">坑位已建好，静待第一份图纸</div>' +
            '<div style="font-size:11.5px;color:var(--text-3);margin-bottom:12px;">研发已准备就绪，丢个原型 ZIP 上来即刻开跑</div>' +
            emptyBtnHtml
        ).show();
        $('#verManagePagination').hide();
        return;
    }

    if (filteredCount === 0) {
        $table.hide();
        $empty.html(
            '<div style="font-size:24px;color:var(--text-3);margin-bottom:8px;"><i class="ri-search-line"></i></div>' +
            '<div style="font-size:13px;font-weight:550;color:var(--text-2);margin-bottom:4px;">未找到匹配的版本</div>' +
            '<div style="font-size:11.5px;color:var(--text-3);margin-bottom:12px;">尝试更换关键词或清空搜索条件</div>' +
            '<button type="button" class="btn-cancel btn-sm" onclick="clearVerManageSearch()">清空筛选</button>'
        ).show();
        $('#verManagePagination').hide();
        return;
    }

    $empty.hide();
    $table.show();

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
            delBtnHtml = '<button type="button" class="btn-cancel btn-sm btn-icon-only btn-ver-del" disabled title="默认版本受保护，请先将其他版本设为默认"><i class="ri-delete-bin-line"></i></button>';
        } else if (canDelThisVer) {
            delBtnHtml = '<button type="button" class="btn-cancel btn-sm btn-icon-only btn-ver-del is-danger" onclick="handleDeleteVersion(' + ver.id + ', null, ' + currentVerManageItemId + ')" title="删除此版本"><i class="ri-delete-bin-line"></i></button>';
        } else {
            delBtnHtml = '<span class="ver-protected-label" title="受保护">—</span>';
        }

        // HTML 原型包大小标签 (纯只读微徽标，高 24px)
        var htmlSizeLabel = (ver.file_size && parseInt(ver.file_size, 10) > 0) ? formatBytes(ver.file_size) : '—';
        var htmlAssetHtml = '<span class="m-badge m-badge-neutral ver-asset-pill" title="HTML 原型包大小"><i class="ri-file-zip-line"></i> 原型包 ' + htmlSizeLabel + '</span>';

        // Axure RP 底稿资产展示 (方案 1: 资产状态与维护操作彻底解耦，左侧为纯只读微徽标)
        var rpAssetHtml = '';
        if (hasRp) {
            var rpSizeLabel = (ver.rp_size && parseInt(ver.rp_size, 10) > 0) ? formatBytes(ver.rp_size) : '已上传';
            rpAssetHtml = '<span class="m-badge m-badge-primary ver-asset-pill ver-asset-rp" title="Axure RP 底稿源文件"><i class="ri-draft-line"></i> RP 底稿 ' + rpSizeLabel + '</span>';
        } else {
            rpAssetHtml = '<span class="m-badge m-badge-neutral ver-asset-pill ver-asset-empty" title="未上传底稿"><i class="ri-draft-line"></i> 无 RP 底稿</span>';
        }

        // 发版人与更新时间
        var authorHtml = creatorName
            ? ('<span class="ver-card-author"><i class="ri-user-line"></i>' + creatorName + '</span>')
            : '<span class="ver-protected-label">—</span>';

        // 统一右侧操作工具栏 (所有交互按钮规范排布，高度统一 28px)
        var actionsHtml = '';
        if (currentVerManageCanEdit) {
            actionsHtml += '<button type="button" class="btn-cancel btn-sm btn-ver-edit" onclick="openEditVersionModal(' + ver.id + ')" title="编辑版本名称与更新日志"><i class="ri-edit-line"></i> 编辑</button>';
            if (hasRp) {
                actionsHtml += '<button type="button" class="btn-cancel btn-sm" onclick="triggerRpUploadForVersion(' + ver.id + ', ' + currentVerManageItemId + ', true)" title="重新上传并替换 RP 底稿"><i class="ri-repeat-line"></i> 更换RP</button>';
                actionsHtml += '<button type="button" class="btn-cancel btn-sm is-danger" onclick="handleRemoveRp(' + ver.id + ', ' + currentVerManageItemId + ')" title="移除此版本的 RP 底稿"><i class="ri-delete-bin-line"></i> 移除RP</button>';
            } else {
                actionsHtml += '<button type="button" class="btn-cancel btn-sm btn-table-rp-add" onclick="triggerRpUploadForVersion(' + ver.id + ', ' + currentVerManageItemId + ', false)" title="为此版本补传 Axure RP 底稿"><i class="ri-upload-2-line"></i> 补传RP</button>';
            }
            if (!isDef) {
                actionsHtml += '<button type="button" class="btn-cancel btn-sm btn-ver-default" onclick="handleSetDefaultVersion(' + ver.id + ', ' + currentVerManageItemId + ')" title="设为访客默认访问版本"><i class="ri-checkbox-circle-line"></i> 设为默认</button>';
            }
            actionsHtml += delBtnHtml;
        } else {
            actionsHtml += '<span class="ver-protected-label" title="受保护">—</span>';
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
                    '<span class="ver-card-log-empty">此版本未填写更新说明</span>' +
                '</div>' +
            '</div>';
        }

        var cardHtml = '<div id="ver-row-' + ver.id + '" class="ver-card ' + (isDef ? 'is-default' : '') + '">' +
            '<div class="ver-card-header">' +
                '<div class="ver-card-title-wrap">' +
                    '<span class="ver-manage-name ver-card-name">' + safeVerName + '</span>' +
                    (isDef ? '<span class="m-badge m-badge-success ver-badge-default" title="访客默认访问版本"><i class="ri-check-line"></i> 默认</span>' : '') +
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
        var infoText = '共 ' + filteredCount + ' 个版本' + (kw ? ' (筛选)' : '') + ' · 第 ' + currentVerManagePage + '/' + totalPages + ' 页';
        $('#verPaginationInfo').text(infoText);

        var navHtml = '';
        navHtml += '<button type="button" class="btn-cancel btn-sm btn-ver-page" ' + (currentVerManagePage <= 1 ? 'disabled' : '') + ' onclick="gotoVerManagePage(' + (currentVerManagePage - 1) + ')" title="上一页"><i class="ri-arrow-left-s-line"></i></button>';

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

        navHtml += '<button type="button" class="btn-cancel btn-sm btn-ver-page" ' + (currentVerManagePage >= totalPages ? 'disabled' : '') + ' onclick="gotoVerManagePage(' + (currentVerManagePage + 1) + ')" title="下一页"><i class="ri-arrow-right-s-line"></i></button>';

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
        showToast('未找到该版本信息', 'warning');
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
        saveBtn.innerHTML = '保存';
    }

    openModal('versionEditModal');
    setTimeout(function() {
        if (nameInput) {
            nameInput.focus();
            if (typeof nameInput.select === 'function') nameInput.select();
        }
    }, 100);
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
        saveBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> 保存中...';
    }

    var fd = new FormData();
    fd.append('id', verId);
    fd.append('version_name', newName);
    fd.append('changelog', changelog);

    adminFetch('version_update', fd).then(function(res) {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '保存';
        }
        if (!res.success) {
            showToast(res.message || '更新失败', 'danger');
            return;
        }

        closeModal('versionEditModal');
        showToast(res.message || '版本信息已更新', 'success');

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
                    $topLogBody.html(changelog ? safeRender(changelog) : '<span style="color:var(--text-3);font-size:12px;">此版本未填写更新说明</span>');
                }
                if (changelog) {
                    $('#barChangelogBtn, #barChangelogWrap').show();
                } else {
                    $('#barChangelogBtn, #barChangelogWrap').hide();
                    $('#topChangelogPopover').hide();
                }
            }
        }
    }).catch(function(err) {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '保存';
        }
        showToast((err && err.message) || '网络异常，请重试', 'danger');
    });
}

function handleSetDefaultVersion(verId, itemId) {
    var fd = new FormData();
    fd.append('id', verId);
    adminFetch('version_set_default', fd).then(function(res) {
        if (res.success) {
            showToast('已设为默认版本', 'success');
            if (isAdminConsoleOpen()) {
                markAdminConsoleChanged();
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
            } else {
                window.location.hash = '#item=' + itemId;
                window.location.reload();
            }
        } else {
            showToast(res.message || '操作失败', 'error');
        }
    });
}

function handleDeleteVersion(verId, verName, itemId) {
    var label = document.querySelector('#ver-row-' + parseInt(verId, 10) + ' .ver-manage-name');
    verName = label ? label.textContent : (verName || '');
    if (!verName.trim()) {
        showToast('无法获取版本名称，请刷新后重试', 'error');
        return;
    }
    showConfirm({
        title: '删除版本',
        message: '删除版本「' + verName + '」及其原型文件和批注？此操作无法撤销。',
        confirmText: '删除版本',
        isDanger: true,
        onConfirm: function() {
            var fd = new FormData();
            fd.append('id', verId);
            adminFetch('version_delete', fd).then(function(res) {
                if (res.success) {
                    showToast('版本已删除', 'success');
                    if (isAdminConsoleOpen()) {
                        markAdminConsoleChanged();
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
                            $node.find('.btn-table-ver').html('<i class="ri-history-line"></i> ' + latest.length + ' 个版本');
                        });
                        if (parseInt(currentVerManageItemId, 10) === parseInt(itemId, 10)) {
                            currentVerManageAllVersions = (currentVerManageAllVersions || []).filter(function(v) {
                                return parseInt(v.id, 10) !== parseInt(verId, 10);
                            });
                            renderVersionManageView();
                        }
                        syncDashboardRemoveVersion(itemId, verId);
                    } else {
                        window.location.hash = '#item=' + itemId;
                        window.location.reload();
                    }
                } else {
                    showToast(res.message || '删除版本失败', 'error');
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
    status.innerHTML = String(webhookUrl || '').trim()
        ? '<i class="ri-robot-line" title="已配置个人机器人 Webhook" role="img" aria-label="已配置个人机器人 Webhook"></i>'
        : '未配置机器人';
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
            selectedNames.push(nameEl ? nameEl.textContent.trim() : '管理员');
        }
    });

    if (!isReset) {
        window.SAVED_NOTIFY_ADMIN_IDS = selectedIds;
    }

    if (selectedNames.length === 0) {
        tagsWrap.innerHTML = '<span style="font-size:12.5px;color:var(--text-3);">请选择接收通知的管理员...</span>';
    } else if (selectedNames.length <= 2) {
        var html = '';
        selectedNames.forEach(function(name) {
            html += `<span class="badge-tag badge-primary">${esc(name)}</span>`;
        });
        tagsWrap.innerHTML = html;
    } else {
        tagsWrap.innerHTML = `<span class="badge-tag badge-primary">${esc(selectedNames[0])} 等 ${selectedNames.length} 位管理员</span>`;
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
        if (!menu.contains(e.target) && !trigger.contains(e.target)) {
            menu.style.display = 'none';
            trigger.setAttribute('aria-expanded', 'false');
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
}

// 统一执行版本 RP 底稿切片上传与保存
function uploadRpForVersion(verId, itemId, file, callbacks) {
    callbacks = callbacks || {};
    if (!file) {
        if (callbacks.onError) callbacks.onError(new Error('未选择文件'));
        return Promise.reject(new Error('未选择文件'));
    }
    if (!file.name.toLowerCase().endsWith('.rp')) {
        var err = new Error('请选择 .rp 格式的 Axure 源文件底稿');
        if (callbacks.onError) callbacks.onError(err);
        return Promise.reject(err);
    }

    if (file.size < 1) {
        var emptyErr = new Error('所选文件为空，请重新选择');
        if (callbacks.onError) callbacks.onError(emptyErr);
        return Promise.reject(emptyErr);
    }
    if (Math.ceil(file.size / UPLOAD_CHUNK_SIZE) > 1000) {
        var maxErr = new Error('RP 源文件不能超过 500MB');
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
            throw new Error(res.message || 'RP 底稿保存失败');
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
        showToast('未检测到有效版本信息', 'warning');
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
        showToast('请选择 .rp 格式的源文件底稿', 'warning');
        input.value = '';
        return;
    }

    var $btn = $('#btnUploadRpQuick');
    var originalHtml = '<i class="ri-upload-2-line"></i> 补传 RP';
    $btn.prop('disabled', true).addClass('is-disabled').html('<i class="ri-loader-4-line ri-spin"></i> 上传中 0%');

    uploadRpForVersion(verId, itemId, file, {
        onProgress: function(pct) {
            $btn.html('<i class="ri-loader-4-line ri-spin"></i> 上传中 ' + pct + '%');
        },
        onSuccess: function(res) {
            $btn.prop('disabled', false).removeClass('is-disabled').html(originalHtml);
            showToast('RP 底稿补传成功', 'success', 2000);
            var curVerName = ($('#barVerSelect').is(':visible') && $('#barVerSelect option:selected').length)
                ? ($('#barVerSelect option:selected').data('ver') || '')
                : ($('#barVer').text() || '').replace(/^.*?\s/, '');
            if (typeof updateTopRpButtons === 'function') {
                updateTopRpButtons('prototype.rp', curVerName, itemId, verId);
            }
        },
        onError: function(err) {
            $btn.prop('disabled', false).removeClass('is-disabled').html(originalHtml);
            showToast((err && err.message) ? err.message : '上传中断，请重试', 'error');
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
        showToast('请选择 .rp 格式的源文件底稿', 'warning');
        input.value = '';
        return;
    }

    var $row = $('#ver-row-' + verId);
    var $actions = $row.find('.ver-manage-actions');
    var oldActionsHtml = $actions.html();
    $actions.html('<span class="ver-rp-uploading"><i class="ri-loader-4-line ri-spin"></i> 上传中 <span id="verRpPct-' + verId + '">0%</span></span>');

    uploadRpForVersion(verId, itemId, file, {
        onProgress: function(pct) {
            $('#verRpPct-' + verId).text(pct + '%');
        },
        onSuccess: function(res) {
            showToast('RP 底稿保存成功', 'success', 2000);
            if (currentVerManageItemId) {
                openVersionManageModal(currentVerManageItemId, true);
            }
        },
        onError: function(err) {
            $actions.html(oldActionsHtml);
            showToast((err && err.message) ? err.message : '上传失败，请重试', 'error');
        }
    });
}

function handleRemoveRp(verId, itemId) {
    showConfirm({
        title: '移除 RP 底稿',
        message: '确认移除此版本的 RP 源文件底稿？此操作无法撤销。',
        confirmText: '移除底稿',
        isDanger: true,
        onConfirm: function() {
            var fd = new FormData();
            fd.append('id', verId);
            adminFetch('version_remove_rp', fd).then(function(res) {
                if (res.success) {
                    showToast('RP 底稿已移除', 'success', 2000);
                    var resUpdatedAt = (res && res.data) ? (res.data.updated_at || (res.data.version ? res.data.version.updated_at : '')) : '';
                    syncVersionRpState(itemId, verId, '', 0, resUpdatedAt);
                    if (currentVerManageItemId) {
                        openVersionManageModal(currentVerManageItemId, true);
                    }
                } else {
                    showToast(res.message || '移除失败', 'error');
                }
            }).catch(function(err) {
                showToast((err && err.message) ? err.message : '网络异常，请重试', 'error');
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
            showToast('链接已复制', 'success');
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
