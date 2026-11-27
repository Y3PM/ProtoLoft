/**
 * 立象原型 · 前台工作台核心交互 (app.js)
 * 涵盖：分类折叠、关键词搜索、项目与版本切换、Hash路由直达、iframe自适应与样式注入
 */

var currentSelectedItemId = null;
window.currentActiveItemHash = '';
window.currentActiveAnnotationHash = '';

// 文本/属性输出共用；动态行为只传标识，不把用户文本拼进事件代码。
function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + (sizes[i] || 'MB');
}
if (typeof window !== 'undefined') {
    window.formatBytes = formatBytes;
}

// 触发 Tab 面板与选项卡平滑流体进场动效
function triggerTabTransition(el) {
    if (!el) return;
    if (el.nodeType === 1) {
        el.classList.remove('tab-pane-fade');
        void el.offsetWidth;
        el.classList.add('tab-pane-fade');
    }
}
if (typeof window !== 'undefined') {
    window.triggerTabTransition = triggerTabTransition;
}

/**
 * 轻量且严密防 XSS 的 Markdown 安全解析器
 * 100% 先进行 HTML 实体转义，严防 script/iframe/onerror/javascript 伪协议；
 * 支持自然换行、# 标题、列表、加粗、斜体、代码、引用、受限协议链接。
 */
function renderMarkdownSafe(text) {
    if (!text) return '';
    var raw = String(text);
    var safe = esc(raw);
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
        if (!trimmed) {
            closeList();
            continue;
        }

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

function getCsrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
}

var _pendingRequests = {};
function apiFetch(action, formData, btnEl) {
    formData = formData || new FormData();
    if (!formData.has('action')) formData.append('action', action);
    var objectId = '';
    if (action === 'upload_chunk') {
        objectId = formData.get('upload_id') + ':' + formData.get('chunk_index');
    } else if (action === 'version_check_name') {
        objectId = (formData.get('item_id') || '') + ':' + (formData.get('version_name') || '');
    } else if (action === 'share_code_revoke') {
        objectId = (formData.get('item_id') || '') + ':' + (formData.get('code') || '');
    } else if (action === 'request_password_reset') {
        objectId = (formData.get('email') || '').trim().toLowerCase();
    } else {
        objectId = formData.get('id') || formData.get('item_id') || formData.get('annotation_id') || formData.get('ids') || formData.get('code') || '';
    }
    var key = action + ':' + objectId;
    if (_pendingRequests[key]) return _pendingRequests[key];
    if (btnEl !== false && !btnEl && typeof document !== 'undefined') {
        var active = document.activeElement;
        if (active && active.tagName === 'BUTTON' && !active.disabled) btnEl = active;
    }
    var token = getCsrfToken();
    formData.set('csrf_token', token);
    if (btnEl) { btnEl.disabled = true; btnEl.classList.add('btn-loading'); }
    var promise = fetch('api.php', { method: 'POST', headers: { 'X-CSRF-Token': token }, body: formData })
        .then(function(response) {
            return response.text().then(function(text) {
                try { return JSON.parse(text); }
                catch (e) { throw new Error((typeof t === 'function' ? t('common.http_error', {status: response.status}, '服务响应异常 (HTTP ' + response.status + ')') : ('服务响应异常 (HTTP ' + response.status + ')'))); }
            });
        }).then(function(value) {
            release();
            return value;
        }, function(error) {
            release();
            throw error;
        });
    function release() {
        if (_pendingRequests[key] === promise) delete _pendingRequests[key];
        if (btnEl) { btnEl.disabled = false; btnEl.classList.remove('btn-loading'); }
    }
    _pendingRequests[key] = promise;
    return promise;
}

function togglePasswordVisibility(inputId, btnEl) {
    var input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    var icon = btnEl ? btnEl.querySelector('i') : null;
    if (icon) icon.className = input.type === 'password' ? 'ri-eye-line' : 'ri-eye-off-line';
}


/**
 * 全局轻量非阻塞 Toast 提示系统 (Linear 浅色风格)
 * @param {string} msg 提示内容
 * @param {string} type 状态: success | error | warning | info (默认 info)
 * @param {number} duration 停留毫秒数 (默认 2800)
 * @param {boolean} persist 跨刷新持久化 (设置为 true 则记录到 sessionStorage，刷新后自动弹出)
 */
function showToast(msg, type, duration, persist) {
    if (!msg) return;
    type = type || 'info';
    duration = duration || 2800;

    if (persist) {
        try {
            sessionStorage.setItem('pending_toast', JSON.stringify({ msg: msg, type: type, duration: duration }));
        } catch(e) {}
        return;
    }

    var $container = $('#toastContainer');
    if ($container.length === 0) {
        $container = $('<div id="toastContainer" class="toast-container"></div>');
        $('body').append($container);
    }

    var iconMap = {
        success: 'ri-checkbox-circle-fill',
        error: 'ri-error-warning-fill',
        warning: 'ri-alert-fill',
        info: 'ri-information-fill'
    };
    var iconClass = iconMap[type] || iconMap.info;

    var $toast = $(
        '<div class="toast-item toast-' + esc(type) + '">' +
            '<span class="toast-icon"><i class="' + iconClass + '"></i></span>' +
            '<span class="toast-content">' + esc(msg) + '</span>' +
            '<span class="toast-close" title="' + esc(typeof t === 'function' ? t('common.close', null, '关闭') : '关闭') + '"><i class="ri-close-line"></i></span>' +
        '</div>'
    );

    $container.append($toast);

    setTimeout(function() {
        $toast.addClass('toast-show');
    }, 20);

    var timer = null;
    function startTimer() {
        timer = setTimeout(removeToast, duration);
    }
    function stopTimer() {
        if (timer) clearTimeout(timer);
    }

    function removeToast() {
        stopTimer();
        $toast.removeClass('toast-show').addClass('toast-hide');
        setTimeout(function() {
            $toast.remove();
            if ($container.children().length === 0) {
                $container.remove();
            }
        }, 220);
    }

    startTimer();
    $toast.on('mouseenter', stopTimer).on('mouseleave', startTimer);
    $toast.find('.toast-close').on('click', function(e) {
        e.stopPropagation();
        removeToast();
    });
}

window.showToast = showToast;
window.toast = {
    success: function(msg, d, p) { showToast(msg, 'success', d, p); },
    error: function(msg, d, p) { showToast(msg, 'error', d, p); },
    warning: function(msg, d, p) { showToast(msg, 'warning', d, p); },
    info: function(msg, d, p) { showToast(msg, 'info', d, p); }
};

/**
 * 全局现代 Linear 风格确认对话框 (替代浏览器原生丑陋的 window.confirm)
 * @param {string|object} options 确认提示文本 或 参数配置对象:
 *   - title: 弹窗标题 (默认 '确认操作')
 *   - message: 提示说明文本
 *   - confirmText: 确认按钮文字 (默认 '确定')
 *   - cancelText: 取消按钮文字 (默认 '取消')
 *   - isDanger: 是否为危险破坏性操作 (默认 false，为 true 时按钮为红底 .btn-danger)
 *   - onConfirm: 点击确定时的回调
 *   - onCancel: 点击取消时的回调
 * @param {function} [callback] 快捷确认回调
 * @param {boolean} [isDangerShort] 快捷危险操作标记
 * @returns {Promise<boolean>} 支持 await 或 .then(confirmed => ...)
 */
function showConfirm(options, callback, isDangerShort) {
    if (typeof options === 'string') {
        options = {
            message: options,
            onConfirm: callback,
            isDanger: !!isDangerShort
        };
    }
    options = options || {};
    var title = options.title || (typeof t === 'function' ? t('common.confirm_action', null, '确认操作') : '确认操作');
    var message = options.message || '';
    var confirmText = options.confirmText || (typeof t === 'function' ? t('common.ok', null, '确定') : '确定');
    var cancelText = options.cancelText || (typeof t === 'function' ? t('common.cancel', null, '取消') : '取消');
    var isDanger = !!options.isDanger;

    return new Promise(function(resolve) {
        var $modal = $('#customConfirmModal');
        if ($modal.length === 0) {
            var modalHtml = 
                '<div id="customConfirmModal" class="custom-modal confirm-modal" style="display:none;z-index:100000;">' +
                    '<div class="modal-dialog-box modal-sm">' +
                        '<div style="font-size:15px;font-weight:600;color:var(--text-1);margin-bottom:8px;" id="customConfirmTitle" data-dialog-title></div>' +
                        '<div style="font-size:13px;color:var(--text-2);line-height:1.5;margin-bottom:20px;word-break:break-all;" id="customConfirmMessage"></div>' +
                        '<div style="display:flex;justify-content:flex-end;gap:10px;">' +
                            '<button type="button" class="btn-cancel btn-standard" id="btnCustomConfirmCancel"></button>' +
                            '<button type="button" class="btn-primary btn-standard" id="btnCustomConfirmOk"></button>' +
                        '</div>' +
                    '</div>' +
                '</div>';
            $('body').append(modalHtml);
            $modal = $('#customConfirmModal');
        }

        $('#customConfirmTitle').text(title);
        $('#customConfirmMessage').text(message);
        $('#btnCustomConfirmCancel').text(cancelText);

        var $okBtn = $('#btnCustomConfirmOk');
        $okBtn.text(confirmText);
        if (isDanger) {
            $okBtn.removeClass('btn-primary').addClass('btn-danger');
        } else {
            $okBtn.removeClass('btn-danger').addClass('btn-primary');
        }

        function close(confirmed) {
            closeModal('customConfirmModal');
            $(document).off('keydown.customConfirm');
            $('#btnCustomConfirmOk').off('click');
            $('#btnCustomConfirmCancel').off('click');
            $modal.off('click');

            if (confirmed) {
                if (typeof options.onConfirm === 'function') {
                    try { options.onConfirm(); } catch(e) { console.error(e); }
                }
                resolve(true);
            } else {
                if (typeof options.onCancel === 'function') {
                    try { options.onCancel(); } catch(e) { console.error(e); }
                }
                resolve(false);
            }
        }

        $('#btnCustomConfirmOk').on('click', function(e) {
            e.stopPropagation();
            close(true);
        });

        $('#btnCustomConfirmCancel').on('click', function(e) {
            e.stopPropagation();
            close(false);
        });


        $(document).on('keydown.customConfirm', function(e) {
            if (e.key === 'Escape' || e.keyCode === 27) {
                e.preventDefault();
                close(false);

            }
        });

        openModal('customConfirmModal', isDanger ? 'btnCustomConfirmCancel' : 'btnCustomConfirmOk');
    });
}

window.showConfirm = showConfirm;

// ==========================================
// 新版本时效与已读管理 (3天 TTL + 虚线红点 + 顶栏下拉新标 + 切换即消)
// ==========================================
var NEW_VERSION_TTL = 3 * 24 * 60 * 60 * 1000; // 72 小时

function parseVerDate(timeStr) {
    if (!timeStr) return 0;
    var s = String(timeStr).trim().replace(/-/g, '/');
    var t = Date.parse(s);
    return isNaN(t) ? 0 : t;
}

function getReadVersionMap() {
    var map = {};
    try {
        var raw = localStorage.getItem('protoloft_read_versions');
        if (!raw) return map;
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            var now = Date.now();
            for (var i = 0; i < parsed.length; i++) {
                var idNum = parseInt(parsed[i], 10);
                if (idNum > 0) map[String(idNum)] = now;
            }
            try { localStorage.setItem('protoloft_read_versions', JSON.stringify(map)); } catch(e2) {}
            return map;
        }
        if (parsed && typeof parsed === 'object') {
            var keys = Object.keys(parsed);
            for (var j = 0; j < keys.length; j++) {
                var kNum = parseInt(keys[j], 10);
                var ts = Number(parsed[keys[j]]);
                if (kNum > 0 && isFinite(ts) && ts > 0) map[String(kNum)] = ts;
            }
        }
    } catch(e) {
        return {};
    }
    return map;
}

function isVersionRead(verId, updatedAt) {
    if (!verId) return true;
    var map = getReadVersionMap();
    var recordedTs = map[String(parseInt(verId, 10))];
    if (!recordedTs) return false;
    var verTs = updatedAt ? parseVerDate(updatedAt) : 0;
    if (verTs > 0) {
        return recordedTs >= verTs;
    }
    return true;
}

function markVersionAsRead(verId, updatedAt) {
    var idNum = parseInt(verId, 10);
    if (!idNum) return;
    var map = getReadVersionMap();
    var key = String(idNum);
    var verTs = updatedAt ? parseVerDate(updatedAt) : 0;
    var ts = verTs > 0 ? verTs : Date.now();
    if (!map[key] || ts > map[key]) {
        map[key] = ts;
        var entries = Object.keys(map);
        if (entries.length > 500) {
            entries.sort(function(a, b) { return map[a] - map[b]; });
            for (var i = 0; i < entries.length - 500; i++) {
                delete map[entries[i]];
            }
        }
        try {
            localStorage.setItem('protoloft_read_versions', JSON.stringify(map));
        } catch(e) {}
    }
}

function isVersionNew(v) {
    if (!v || !v.id) return false;
    var t = parseVerDate(v.updated_at || v.created_at);
    if (!t) return false;
    var now = Date.now();
    if (now - t > NEW_VERSION_TTL || t - now > 86400000) return false;
    return !isVersionRead(v.id, v.updated_at || v.created_at);
}

function getItemNewVersion(versions) {
    if (!Array.isArray(versions) || !versions.length) return null;
    for (var i = 0; i < versions.length; i++) {
        if (isVersionNew(versions[i])) {
            return versions[i];
        }
    }
    return null;
}

function refreshCategoryTreeNewBadges() {
    $('#categoryTree .item-row').each(function() {
        var $el = $(this);
        var rawVers = $el.data('versions');
        var vers = [];
        if (typeof rawVers === 'string') {
            try { vers = JSON.parse(rawVers); } catch(e) { vers = []; }
        } else if (Array.isArray(rawVers)) {
            vers = rawVers;
        }
        var newVer = getItemNewVersion(vers);
        if (newVer) {
            $el.addClass('has-new-ver').attr('data-new-ver-id', newVer.id);
        } else {
            $el.removeClass('has-new-ver').removeAttr('data-new-ver-id');
        }
    });
}
window.refreshCategoryTreeNewBadges = refreshCategoryTreeNewBadges;

/**
 * 静默同步顶部栏版本切换器 (仅更新选项与新版本红点，绝不打断或重载当前预览中的 iframe)
 */
function syncTopVersionSwitcherQuietly($el, versions) {
    if (!$el || !$el.length || !Array.isArray(versions)) return;
    var type = $el.data('type');
    if (type !== 'project') return;

    var $barVer = $('#barVer');
    var $barVerSelect = $('#barVerSelect');
    var activeVerId = parseInt($el.data('ver-id'), 10) || 0;

    if (versions.length > 1) {
        $barVer.hide().removeClass('has-new-ver');
        $barVerSelect.empty();
        for (var i = 0; i < versions.length; i++) {
            var v = versions[i];
            var isThisNew = typeof isVersionNew === 'function' ? isVersionNew(v) : false;
            var $opt = $('<option>')
                .val(v.entry_file)
                .text(v.version_name)
                .attr('data-ver-id', v.id)
                .attr('data-ver', v.version_name)
                .attr('data-is-new', isThisNew ? '1' : '0')
                .data('ver', v.version_name)
                .data('ver-id', v.id)
                .data('token', v.token || '')
                .data('share-code', v.share_code || '')
                .data('rp', v.rp_file || '')
                .data('time', v.updated_at || '')
                .data('changelog', v.changelog || '')
                .data('creator', v.creator_name || $el.data('creator-name') || '');
            if (activeVerId && parseInt(v.id, 10) === activeVerId) {
                $opt.prop('selected', true);
            }
            $barVerSelect.append($opt);
        }
        $barVerSelect.show();
        if (typeof syncVersionPicker === 'function') syncVersionPicker('barVerSelect');
    } else if (versions.length === 1) {
        $barVerSelect.hide();
        if (typeof syncVersionPicker === 'function') syncVersionPicker('barVerSelect');
        var v0IsNew = typeof isVersionNew === 'function' ? isVersionNew(versions[0]) : false;
        $barVer.html('<i class="ri-git-branch-line"></i> ' + esc(versions[0].version_name))
            .toggleClass('has-new-ver', v0IsNew)
            .show();
    } else {
        $barVerSelect.hide();
        if (typeof syncVersionPicker === 'function') syncVersionPicker('barVerSelect');
        $barVer.hide().removeClass('has-new-ver');
    }
}

/**
 * 工作台版本准实时同步 (切回标签页立即同步 + 可见态 45 秒静默轮询)
 */
function initRealtimeVersionSync() {
    var treeEl = document.getElementById('categoryTree');
    if (!treeEl) return;

    var POLL_INTERVAL_MS = 45000;
    var FOCUS_THROTTLE_MS = 5000;
    var lastSyncAt = 0;
    var lastSig = '';
    var treeStructurePrompted = false;
    var timerId = null;

    function applySyncItems(items) {
        if (!Array.isArray(items)) return;
        var serverMap = {};
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it && it.id) serverMap[String(it.id)] = Array.isArray(it.versions) ? it.versions : [];
        }

        var domCount = 0;
        var hasStructuralDiff = false;
        $('#categoryTree .item-row').each(function() {
            domCount++;
            var $el = $(this);
            var itemId = String($el.data('item-id') || '');
            if (!itemId) return;
            if (!Object.prototype.hasOwnProperty.call(serverMap, itemId)) {
                hasStructuralDiff = true;
                return;
            }
            var newVers = serverMap[itemId];
            var prevJson = $el.attr('data-versions') || '[]';
            var nextJson = JSON.stringify(newVers);
            if (prevJson !== nextJson) {
                $el.data('versions', newVers);
                $el.attr('data-versions', nextJson);
                if (typeof currentSelectedItemId !== 'undefined' && String(currentSelectedItemId) === itemId) {
                    syncTopVersionSwitcherQuietly($el, newVers);
                }
            }
        });

        if (!hasStructuralDiff && Object.keys(serverMap).length !== domCount) {
            hasStructuralDiff = true;
        }

        refreshCategoryTreeNewBadges();

        if (hasStructuralDiff && !treeStructurePrompted) {
            treeStructurePrompted = true;
            if (typeof showToast === 'function') {
                var tip = typeof t === 'function'
                    ? t('workspace.tree_updated_tip', null, '工作台目录有新增或变动，请刷新页面查看最新列表')
                    : '工作台目录有新增或变动，请刷新页面查看最新列表';
                showToast(tip, 'info', 4500);
            }
        }
    }

    function pullSync(force) {
        if (document.visibilityState && document.visibilityState !== 'visible') return;
        var now = Date.now();
        if (!force && now - lastSyncAt < FOCUS_THROTTLE_MS) return;
        lastSyncAt = now;

        var fd = new FormData();
        if (lastSig) fd.append('sig', lastSig);
        apiFetch('items_versions_sync', fd, false).then(function(res) {
            if (!res || !res.success || !res.data) return;
            if (res.data.sig) lastSig = String(res.data.sig);
            if (res.data.changed && Array.isArray(res.data.items)) {
                applySyncItems(res.data.items);
            }
        }).catch(function() {
            // 静默容错，避免后台轮询因偶发网络波动弹出打扰提示
        });
    }

    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') {
            pullSync(false);
        }
    });

    timerId = window.setInterval(function() {
        if (document.visibilityState === 'visible') {
            pullSync(true);
        }
    }, POLL_INTERVAL_MS);

    window.addEventListener('beforeunload', function() {
        if (timerId) window.clearInterval(timerId);
    });
}

// 工作台目录树动效规范：折叠与展开由 toggleCategory 原生精确控制，不挂载外部绝对定位重排
function initWorkbenchFluidAnimations() {
    // No-op: 遵循 Linear 原则，目录树采用原生 CSS/WAAPI 驱动，避免双重过渡抖动
}
window.initWorkbenchFluidAnimations = initWorkbenchFluidAnimations;

$(document).ready(function() {
    initWorkbenchFluidAnimations();
    refreshCategoryTreeNewBadges();
    initRealtimeVersionSync();
    // 检查是否有跨页面持久化待展示的 Toast
    try {
        var pending = sessionStorage.getItem('pending_toast');
        if (pending) {
            sessionStorage.removeItem('pending_toast');
            var pData = JSON.parse(pending);
            if (pData && pData.msg) {
                setTimeout(function() {
                    showToast(pData.msg, pData.type || 'success', pData.duration || 3000);
                }, 120);
            }
        }
    } catch(e) {}

    try {
        initHashRoute();
    } catch(e) {
        console.error('initHashRoute failed:', e);
    }

    // 全局防泄密水印初始就绪
    if (typeof GLOBAL_WATERMARK_ENABLED !== 'undefined' && GLOBAL_WATERMARK_ENABLED) {
        try {
            renderWorkspaceWatermark(true);
        } catch(e) {
            console.error('renderWorkspaceWatermark failed:', e);
        }
    }
});

function buildWorkspaceUpdateMetaHtml(authorName, time) {
    var timeHtml = '';
    if (time) {
        timeHtml = (typeof renderFriendlyTimeHtml === 'function')
            ? renderFriendlyTimeHtml(time, { mode: 'updated' })
            : esc(typeof t === 'function' ? t('workspace.updated_at', { time: time }, '更新于 ' + time) : ('更新于 ' + time));
    }
    if (authorName && timeHtml) {
        var metaText = (typeof t === 'function')
            ? t('workspace.author_meta', { author: esc(authorName), text: timeHtml }, '@' + esc(authorName) + ' · ' + timeHtml)
            : ('@' + esc(authorName) + ' · ' + timeHtml);
        return '<i class="ri-user-line" style="margin-right:3px;font-size:12px;opacity:0.85;"></i>' + metaText;
    }
    if (authorName) {
        return '<i class="ri-user-line" style="margin-right:3px;font-size:12px;opacity:0.85;"></i>@' + esc(authorName);
    }
    if (timeHtml) {
        return '<i class="ri-time-line" style="margin-right:3px;font-size:12px;opacity:0.85;"></i>' + timeHtml;
    }
    return '';
}

// 选中项目 (isUserDirectClick: 仅当用户在工作台左侧手动显式点击时为 true；可选第 5 参数 replaceHistory 为 true 时原地替换历史项)
function selectItem(itemId, el, targetVerName, isUserDirectClick) {
    var $el = $(el);
    var type = $el.data('type');
    var target = $el.data('target');
    var name = $el.data('name');

    if (type === 'link') {
        var linkHref = $el.data('href');
        if (target === '_blank') {
            // 只有是工作台用户手动点击才直接在新标签页打开并 return
            if (isUserDirectClick) {
                window.open(linkHref, '_blank', 'noopener,noreferrer');
                return;
            }
        }
    }

    currentSelectedItemId = itemId;
    $('.item-row').removeClass('active');
    $el.addClass('active');

    // 解析版本列表
    var versions = $el.data('versions');
    if (typeof versions === 'string') {
        try { versions = JSON.parse(versions); } catch(e) { versions = []; }
    }
    if (!Array.isArray(versions)) {
        versions = [];
    }

    // 确定当前展示的版本
    var currentVer = null;
    if (versions.length > 0) {
        if (targetVerName) {
            for (var i = 0; i < versions.length; i++) {
                if (versions[i].version_name === targetVerName) {
                    currentVer = versions[i];
                    break;
                }
            }
        }
        if (!currentVer) {
            var curVerName = $el.data('ver');
            if (curVerName) {
                for (var i = 0; i < versions.length; i++) {
                    if (versions[i].version_name === curVerName) {
                        currentVer = versions[i];
                        break;
                    }
                }
            }
        }
        if (!currentVer) {
            for (var i = 0; i < versions.length; i++) {
                if (versions[i].is_default) {
                    currentVer = versions[i];
                    break;
                }
            }
            if (!currentVer) currentVer = versions[0];
        }
    }

    // 检查是否有未读新版本 (仅用户手动点击到对应版本才消除，防止首屏自动选中与深链静默消点)
    var newVer = typeof getItemNewVersion === 'function' ? getItemNewVersion(versions) : null;
    if (Boolean(isUserDirectClick) && newVer && currentVer && parseInt(currentVer.id, 10) === parseInt(newVer.id, 10)) {
        if (typeof markVersionAsRead === 'function') markVersionAsRead(currentVer.id, currentVer.updated_at || currentVer.created_at);
        $el.removeClass('has-new-ver').removeAttr('data-new-ver-id');
        newVer = typeof getItemNewVersion === 'function' ? getItemNewVersion(versions) : null;
    }

    var href = (type === 'link') ? $el.data('href') : (currentVer ? currentVer.entry_file : '');
    var ver = currentVer ? currentVer.version_name : '';
    var rp = currentVer ? (currentVer.rp_file || '') : '';
    var time = currentVer ? (currentVer.updated_at || '') : '';
    var verId = currentVer ? (currentVer.id || '') : '';
    var token = currentVer ? (currentVer.token || '') : ($el.data('token') || '');
    var shareCode = currentVer ? (currentVer.share_code || '') : ($el.data('share-code') || '');

    // 更新 DOM 节点上的当前快照状态
    $el.data('href', href).data('ver', ver).data('rp', rp).data('time', time).data('ver-id', verId).data('token', token).data('share-code', shareCode);

    // 更新顶部栏项目名称
    $('#barTitle').text(name);

    // 动态渲染顶部栏版本切换器
    var $barVer = $('#barVer');
    var $barVerSelect = $('#barVerSelect');

    if (versions.length > 1) {
        $barVer.hide().removeClass('has-new-ver');
        $barVerSelect.empty();
        for (var i = 0; i < versions.length; i++) {
            var v = versions[i];
            var isThisNew = typeof isVersionNew === 'function' ? isVersionNew(v) : false;
            var $opt = $('<option>')
                .val(v.entry_file)
                .text(v.version_name)
                .attr('data-ver-id', v.id)
                .attr('data-ver', v.version_name)
                .attr('data-is-new', isThisNew ? '1' : '0')
                .data('ver', v.version_name)
                .data('ver-id', v.id)
                .data('token', v.token || '')
                .data('share-code', v.share_code || '')
                .data('rp', v.rp_file || '')
                .data('time', v.updated_at || '')
                .data('changelog', v.changelog || '')
                .data('creator', v.creator_name || $el.data('creator-name') || '');
            if (currentVer && v.id === currentVer.id) {
                $opt.prop('selected', true);
            }
            $barVerSelect.append($opt);
        }
        $barVerSelect.show();
        if (typeof syncVersionPicker === 'function') syncVersionPicker('barVerSelect');
    } else if (versions.length === 1) {
        $barVerSelect.hide();
        if (typeof syncVersionPicker === 'function') syncVersionPicker('barVerSelect');
        var v0IsNew = typeof isVersionNew === 'function' ? isVersionNew(versions[0]) : false;
        if (Boolean(isUserDirectClick) && v0IsNew && currentVer && parseInt(currentVer.id, 10) === parseInt(versions[0].id, 10)) {
            if (typeof markVersionAsRead === 'function') markVersionAsRead(versions[0].id, versions[0].updated_at || versions[0].created_at);
            $el.removeClass('has-new-ver').removeAttr('data-new-ver-id');
            v0IsNew = false;
        }
        $barVer.html('<i class="ri-git-branch-line"></i> ' + esc(versions[0].version_name))
            .toggleClass('has-new-ver', v0IsNew)
            .show();
    } else {
        $barVerSelect.hide();
        if (typeof syncVersionPicker === 'function') syncVersionPicker('barVerSelect');
        $barVer.hide().removeClass('has-new-ver');
    }

    // 顶部栏版本管理快捷入口联动 (严格判断当前项目是否有编辑权限)
    var canEditProject = ($el && ($el.data('can-edit') === 1 || $el.data('can-edit') === '1'));
    if (type === 'project' && canEditProject) {
        $('#barBtnVerManage').show();
    } else {
        $('#barBtnVerManage').hide();
    }

    // 提取作者与更新时间 (优先版本作者，兜底项目创建者)
    var authorName = currentVer ? currentVer.creator_name : null;
    if (!authorName) {
        authorName = $el.data('ver-creator') || $el.data('creator-name') || '';
    }

    var metaHtml = buildWorkspaceUpdateMetaHtml(authorName, time);

    if (metaHtml) {
        $('#barTime').html(metaHtml).show();
    } else {
        $('#barTime').hide().empty();
    }
    $('#barAuthor').hide().empty();

    // 更新日志气泡与按钮状态
    var changelogText = currentVer ? (currentVer.changelog || '') : '';
    if (changelogText) {
        $('#barChangelogBtn, #barChangelogWrap').show();
        $('#topChangelogVerName').text(ver ? (' · ' + ver) : '');
        $('#topChangelogBody').html(renderMarkdownSafe(changelogText));
    } else {
        $('#barChangelogBtn, #barChangelogWrap').hide();
        $('#topChangelogPopover').hide();
    }

    // 安全防泄密水印联动 (完全由全站统一安全水印总开关管控)
    var isWatermarkActive = (typeof GLOBAL_WATERMARK_ENABLED !== 'undefined' && Boolean(GLOBAL_WATERMARK_ENABLED));
    renderWorkspaceWatermark(isWatermarkActive);

    // 处理 RP 下载与快捷补传按钮联动
    updateTopRpButtons(rp, ver, itemId, verId);

    // 加载 iframe 或展示空引导 / 外链落地卡片
    if (type === 'link' && target === '_blank') {
        $('#placeholder').hide();
        $('#myFrame').hide().attr('src', 'about:blank');
        updateTopActionsState(false, type);
        var safeHref = esc(href || '');
        var safeName = esc(name || (typeof t === 'function' ? t('workspace.ext_link_default', null, '外部链接') : '外部链接'));
        $('#noVersionPlaceholder').html(
            '<div class="empty-state-box" style="max-width:520px;padding:40px 24px;">' +
                '<div style="width:56px;height:56px;border-radius:14px;background:var(--primary-subtle);color:var(--primary);display:inline-flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:16px;">' +
                    '<i class="ri-external-link-line"></i>' +
                '</div>' +
                '<div class="empty-state-title" style="font-size:16px;color:var(--text-1);margin-bottom:8px;">' + safeName + '</div>' +
                '<div style="font-size:12px;color:var(--text-3);margin-bottom:14px;">' + esc(typeof t === 'function' ? t('workspace.ext_link_desc', null, '此项目配置为在新标签页中打开的外部链接资产') : '此项目配置为在新标签页中打开的外部链接资产') + '</div>' +
                '<div style="word-break:break-all;color:var(--text-2);font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;background:var(--canvas);padding:10px 14px;border-radius:6px;border:1px solid var(--border);margin-bottom:20px;text-align:left;">' +
                    safeHref +
                '</div>' +
                '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">' +
                    '<a href="' + safeHref + '" target="_blank" rel="noopener noreferrer" class="btn-primary btn-md" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;">' +
                        '<span class="duo-icon-slot" data-duo-icon="external-link"><i class="ri-external-link-line duo-rest-icon"></i></span> ' + esc(typeof t === 'function' ? t('workspace.open_new_tab', null, '在新标签页打开') : '在新标签页打开') +
                    '</a>' +
                    '<button type="button" class="btn-cancel btn-md btn-copy-link" data-copy-url="' + safeHref + '">' +
                        '<span class="duo-icon-slot" data-duo-icon="copy"><i class="ri-file-copy-line duo-rest-icon"></i></span> ' + esc(typeof t === 'function' ? t('admin.item.copy_link_tip', null, '复制链接') : '复制链接') +
                    '</button>' +
                '</div>' +
            '</div>'
        ).show();
    } else if (href) {
        $('#placeholder').hide();
        $('#noVersionPlaceholder').hide();
        $('#myFrame').show();
        $('#myFrame').attr('src', href);
        updateTopActionsState(true, type);

        // 静默上报工作台原型访问审计日志
        try {
            var logFd = new FormData();
            logFd.append('csrf_token', getCsrfToken());
            logFd.append('item_id', itemId);
            logFd.append('item_name', name);
            logFd.append('ver_name', ver || '');
            if (navigator.sendBeacon) {
                navigator.sendBeacon('api.php?action=log_workspace_access', logFd);
            } else {
                fetch('api.php?action=log_workspace_access', { method: 'POST', body: logFd });
            }
        } catch(e){}
    } else {
        $('#placeholder').hide();
        $('#myFrame').hide().attr('src', 'about:blank');
        updateTopActionsState(false, type);
        var isCanManage = $('body').hasClass('can-manage');
        var canEditEmptyProject = ($el && ($el.data('can-edit') === 1 || $el.data('can-edit') === '1'));
        var canPublishEmpty = isCanManage && canEditEmptyProject;
        var actionHtml = canPublishEmpty
            ? '<div class="empty-state-actions"><button type="button" class="empty-state-btn" onclick="openUploadModal(' + itemId + ')"><span class="duo-icon-slot" data-duo-icon="cloud-upload"><i class="ri-upload-cloud-line duo-rest-icon"></i></span> ' + esc(typeof t === 'function' ? t('workspace.publish_proto', null, '发布原型') : '发布原型') + '</button></div>'
            : '';
        var emptyTitle = canPublishEmpty
            ? (typeof t === 'function' ? t('workspace.empty_ver_title_mgr', null, '把“象”装进仓库，拢共分几步？') : '把“象”装进仓库，拢共分几步？')
            : (typeof t === 'function' ? t('workspace.empty_ver_title_view', null, '冰箱已就位，大象还在路上') : '冰箱已就位，大象还在路上');
        var emptyDesc = canPublishEmpty
            ? (typeof t === 'function' ? t('workspace.empty_ver_desc_mgr', null, '1. 点下方发布 &rarr; 2. 丢进 ZIP 包 &rarr; 3. 马上开工！') : '1. 点下方发布 &rarr; 2. 丢进 ZIP 包 &rarr; 3. 马上开工！')
            : (typeof t === 'function' ? t('workspace.empty_ver_desc_view', null, '产品经理正在打包原型图纸，装进来就能直接看啦') : '产品经理正在打包原型图纸，装进来就能直接看啦');
        $('#noVersionPlaceholder').html(
            '<div class="empty-state-box">' +
                '<div class="empty-state-illustration">' +
                    '<svg width="180" height="120" viewBox="0 0 180 120" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                        '<g transform="translate(5, 12.6) scale(0.86)">' +
                            '<polygon points="15.5,51.52 16.0,59.8 9.89,65.51" fill="#68b5f8" />' +
                            '<polygon points="17.01,75.89 17.7,89.21 3.32,85.06" fill="#68b5f8" />' +
                            '<polygon points="2.97,87.47 11.47,89.71 6.61,96.48" fill="#68b5f8" />' +
                            '<polygon points="17.85,49.42 34.4,31.09 31.17,78.75 19.76,88.52" fill="#0076de" />' +
                            '<polygon points="36.71,31.43 59.62,34.17 54.77,47.51 33.87,77.38" fill="#0076de" />' +
                            '<polygon points="56.65,49.06 56.29,78.75 37.31,76.74" fill="#68b5f8" />' +
                            '<polygon points="58.79,49.86 76.85,60.67 68.02,98.94 58.79,106.54" fill="#0076de" />' +
                            '<polygon points="68.2,102.02 71.31,108.59 60.58,108.59" fill="#0076de" />' +
                            '<polygon points="77.71,67.76 88.26,79.01 81.0,84.72 74.6,80.91" fill="#68b5f8" />' +
                            '<polygon points="88.96,81.39 88.44,95.1 79.44,91.98 82.21,86.45" fill="#0076de" />' +
                            '<polygon points="72.44,26.23 80.82,60.5 57.61,46.41 65.15,24.17" fill="#68b5f8" />' +
                            '<polygon points="75.44,28.49 86.19,28.49 96.05,34.72 108.68,62.75 96.05,57.73 93.63,53.23 97.26,62.57 82.56,57.55" fill="#0076de" />' +
                            '<polygon points="106.24,52.19 120.44,56.0 110.91,62.92" fill="#68b5f8" />' +
                            '<polygon points="112.48,51.69 122.0,42.85 120.79,53.94" fill="#0076de" />' +
                            '<polygon points="113.69,35.76 121.31,40.64 116.12,45.46" fill="#68b5f8" />' +
                            '<polygon points="114.04,33.85 116.81,31.09 118.17,36.3" fill="#68b5f8" />' +
                            '<polygon points="118.17,30.52 122.88,30.76 119.21,34.72" fill="#0076de" />' +
                            '<circle cx="120.27" cy="24.17" r="10" fill="#ff5d47" fill-opacity="0.16" />' +
                            '<circle cx="120.27" cy="24.17" r="4.76" fill="#ff5d47" />' +
                        '</g>' +
                        '<path d="M93 82 H114 M109.5 78 L114 82 L109.5 86" stroke="var(--primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.72"/>' +
                        '<rect x="126" y="26" width="44" height="80" rx="7" fill="var(--surface)" stroke="var(--border-strong)" stroke-width="1.5"/>' +
                        '<line x1="126" y1="48" x2="170" y2="48" stroke="var(--border)" stroke-width="1.2"/>' +
                        '<line x1="133" y1="34" x2="133" y2="40" stroke="var(--border-strong)" stroke-width="1.6" stroke-linecap="round"/>' +
                        '<rect x="132" y="54" width="32" height="46" rx="4" fill="var(--primary-subtle)" stroke="var(--primary)" stroke-width="1.2" stroke-dasharray="3 3"/>' +
                    '</svg>' +
                '</div>' +
                '<div class="empty-state-title">' + emptyTitle + '</div>' +
                '<div class="empty-state-desc">' + emptyDesc + '</div>' +
                actionHtml +
            '</div>'
        ).show();
    }

    // 更新 Hash 路由方便直达分享 (带上版本号)
    var hashStr = 'item=' + itemId;
    if (ver) hashStr += '&v=' + encodeURIComponent(ver);
    if (typeof window !== 'undefined') {
        window.currentActiveItemHash = '#' + hashStr;
        window.currentActiveAnnotationHash = '';
        if (arguments.length > 4 && arguments[4] && window.history && window.history.replaceState) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search + '#' + hashStr);
        } else {
            window.location.hash = hashStr;
        }
    }

    // 联动更新批注上下文
    if (typeof window.updateAnnoContext === 'function') {
        window.updateAnnoContext(itemId, verId, ver, type);
    }
}

// 顶部多版本下拉切换
function onTopVersionChange(selectEl) {
    if (!currentSelectedItemId) return;
    var $opt = $(selectEl).find('option:selected');
    var href = $opt.val();
    var ver = $opt.data('ver');
    var verId = $opt.data('ver-id');
    var rp = $opt.data('rp');
    var time = $opt.data('time');
    var author = $opt.data('creator');
    var token = $opt.data('token') || '';
    var shareCode = $opt.data('share-code') || '';

    // 切换到对应新版本时的消除逻辑 (只有点击到对应版本的时候才全部消失)
    if ($opt.attr('data-is-new') === '1' || (typeof isVersionNew === 'function' && isVersionNew({ id: verId, updated_at: time }))) {
        if (typeof markVersionAsRead === 'function') markVersionAsRead(verId, time);
        $opt.attr('data-is-new', '0');
        var $curItem = $('#item-node-' + currentSelectedItemId);
        if ($curItem.length) {
            var itemVers = $curItem.data('versions');
            if (typeof itemVers === 'string') {
                try { itemVers = JSON.parse(itemVers); } catch(e) { itemVers = []; }
            }
            if (typeof getItemNewVersion !== 'function' || !getItemNewVersion(itemVers)) {
                $curItem.removeClass('has-new-ver').removeAttr('data-new-ver-id');
            }
        }
        if (typeof syncVersionPicker === 'function') syncVersionPicker(selectEl);
    }

    var $item = $('#item-node-' + currentSelectedItemId);
    $item.data('href', href).data('ver', ver).data('ver-id', verId).data('rp', rp).data('time', time).data('token', token).data('share-code', shareCode);

    var metaHtml = buildWorkspaceUpdateMetaHtml(author, time);

    if (metaHtml) {
        $('#barTime').html(metaHtml).show();
    } else {
        $('#barTime').hide().empty();
    }
    $('#barAuthor').hide().empty();

    // 更新日志气泡与按钮状态
    var changelogText = $opt.data('changelog') || '';
    if (changelogText) {
        $('#barChangelogBtn, #barChangelogWrap').show();
        $('#topChangelogVerName').text(ver ? (' · ' + ver) : '');
        $('#topChangelogBody').html(renderMarkdownSafe(changelogText));
    } else {
        $('#barChangelogBtn, #barChangelogWrap').hide();
        $('#topChangelogPopover').hide();
    }

    // 更新 RP 下载与快捷补传按钮联动
    updateTopRpButtons(rp, ver, currentSelectedItemId, verId);

    // 安全防泄密水印联动 (完全由全站统一安全水印总开关管控)
    var isWatermarkActive = (typeof GLOBAL_WATERMARK_ENABLED !== 'undefined' && Boolean(GLOBAL_WATERMARK_ENABLED));
    renderWorkspaceWatermark(isWatermarkActive);

    // 重新加载 iframe
    if (href) {
        $('#myFrame').attr('src', href);

        // 静默上报工作台原型访问审计日志
        try {
            var logFd = new FormData();
            logFd.append('csrf_token', getCsrfToken());
            logFd.append('item_id', currentSelectedItemId);
            logFd.append('item_name', $('#barTitle').text() || '');
            logFd.append('ver_name', ver || '');
            if (navigator.sendBeacon) {
                navigator.sendBeacon('api.php?action=log_workspace_access', logFd);
            } else {
                fetch('api.php?action=log_workspace_access', { method: 'POST', body: logFd });
            }
        } catch(e){}
    }

    // 更新 Hash
    var hashStr = 'item=' + currentSelectedItemId;
    if (ver) hashStr += '&v=' + encodeURIComponent(ver);
    if (typeof window !== 'undefined') {
        window.currentActiveItemHash = '#' + hashStr;
        window.currentActiveAnnotationHash = '';
        window.location.hash = hashStr;
    }

    // 联动更新批注上下文
    if (typeof window.updateAnnoContext === 'function') {
        window.updateAnnoContext(currentSelectedItemId, verId, ver);
    }
}

// 顶栏 RP 下载与快捷补传按钮动态联动
function updateTopRpButtons(rp, ver, itemId, verId) {
    var canDownloadRp = $('body').hasClass('can-download-rp');
    var $btnDownload = $('#btnDownloadRp');
    var $btnUploadQuick = $('#btnUploadRpQuick');
    var curName = $('#barTitle').text() || 'prototype';

    if (rp && canDownloadRp) {
        var safeItemName = (curName ? String(curName).replace(/[\\/:*?"<>|]/g, '_').trim() : 'prototype') || 'prototype';
        var safeVerName = ver ? ('_' + String(ver).replace(/[\\/:*?"<>|]/g, '_').trim()) : '';
        var downloadFilename = safeItemName + safeVerName + '.rp';
        var downloadUrl = 'api.php?action=download_rp&item_id=' + itemId + (verId ? '&ver_id=' + verId : '');
        $btnDownload.attr('href', downloadUrl).attr('download', downloadFilename).show();
        $btnUploadQuick.hide();
    } else {
        $btnDownload.hide();
        var $treeNode = $('#item-node-' + itemId);
        if (!$treeNode.length) {
            $treeNode = $('.item-row[data-item-id="' + itemId + '"]');
        }
        var canEditProject = $treeNode.length ? ($treeNode.data('can-edit') === 1 || $treeNode.data('can-edit') === '1') : false;
        if (!rp && verId && canEditProject) {
            $btnUploadQuick.data('item-id', itemId).data('ver-id', verId).data('ver-name', ver).show();
        } else {
            $btnUploadQuick.hide();
        }
    }
}

// 顶栏工具按钮根据当前项目是否有可用版本动态联动状态
function updateTopActionsState(hasActiveVersion, itemType) {
    var $actions = $('.top-actions .btn-tool:not(#btnDownloadRp):not(#btnUploadRpQuick)');
    var $btnAnnotation = $('#btnToggleAnnotation');
    var $btnShare = $('.top-actions button[onclick*="copyShareUrl"]');
    var $btnReload = $('.top-actions button[onclick*="reloadIframe"]');
    var $btnFullscreen = $('.top-actions button[onclick*="toggleFullscreen"]');

    if (itemType === 'link') {
        // 外链项目：批注协同与外发分享常驻可用
        $btnAnnotation.prop('disabled', false).removeClass('is-disabled').attr('title', (typeof t === 'function' ? t('workspace.anno_btn_tip', null, '页面批注与协作讨论 (快捷键 C)') : '页面批注与协作讨论 (快捷键 C)'));
        $btnShare.prop('disabled', false).removeClass('is-disabled').attr('title', (typeof t === 'function' ? t('workspace.share_btn_tip', null, '外发分享设置') : '外发分享设置'));
        $('#btnUploadRpQuick').hide();

        if (hasActiveVersion) {
            // 内嵌 iframe 预览模式：刷新与全屏可用
            $btnReload.prop('disabled', false).removeClass('is-disabled').attr('title', (typeof t === 'function' ? t('workspace.reload_web_tip', null, '刷新当前网页') : '刷新当前网页'));
            $btnFullscreen.prop('disabled', false).removeClass('is-disabled').attr('title', (typeof t === 'function' ? t('workspace.fullscreen_tip', null, '全屏预览') : '全屏预览'));
        } else {
            // 新标签页落地卡片模式：刷新与全屏按需禁用
            $btnReload.prop('disabled', true).addClass('is-disabled').attr('title', (typeof t === 'function' ? t('workspace.external_link_asset', null, '外部链接资产') : '外部链接资产'));
            $btnFullscreen.prop('disabled', true).addClass('is-disabled').attr('title', (typeof t === 'function' ? t('workspace.external_link_asset', null, '外部链接资产') : '外部链接资产'));
        }
        return;
    }

    if (hasActiveVersion) {
        $actions.prop('disabled', false).removeClass('is-disabled');
        $btnAnnotation.attr('title', (typeof t === 'function' ? t('workspace.anno_btn_tip', null, '页面批注与协作讨论 (快捷键 C)') : '页面批注与协作讨论 (快捷键 C)'));
        $btnShare.attr('title', (typeof t === 'function' ? t('workspace.share_btn_tip', null, '外发分享设置') : '外发分享设置'));
        $btnReload.attr('title', (typeof t === 'function' ? t('workspace.reload_proto_tip', null, '刷新当前原型') : '刷新当前原型'));
        $btnFullscreen.attr('title', (typeof t === 'function' ? t('workspace.fullscreen_tip', null, '全屏预览') : '全屏预览'));
    } else {
        $actions.prop('disabled', true).addClass('is-disabled');
        $('#btnUploadRpQuick').hide();
        $btnAnnotation.attr('title', (typeof t === 'function' ? t('workspace.anno_btn_disabled', null, '暂无原型版本，无法发起批注') : '暂无原型版本，无法发起批注'));
        $btnShare.attr('title', (typeof t === 'function' ? t('workspace.share_btn_disabled', null, '暂无原型版本，无法外发分享') : '暂无原型版本，无法外发分享'));
        $btnReload.attr('title', (typeof t === 'function' ? t('workspace.no_proto_page', null, '暂无原型页面') : '暂无原型页面'));
        $btnFullscreen.attr('title', (typeof t === 'function' ? t('workspace.no_proto_page', null, '暂无原型页面') : '暂无原型页面'));

        // 如果此时批注抽屉刚好处于展开状态，自动收起它
        if (typeof window.toggleAnnotationDrawer === 'function') {
            window.toggleAnnotationDrawer(false);
        }
    }
}

// 兼容旧代码调用
function changeVersion(itemId, selectEl) {
    onTopVersionChange(selectEl);
}

// 打开原型分享设置弹窗 (需具备分享权限)
function copyShareUrl(itemId) {
    var targetId = itemId || currentSelectedItemId;
    if (!targetId) {
        showToast((typeof t === 'function' ? t('workspace.select_project_first', null, '请先在左侧选择一个原型项目') : '请先在左侧选择一个原型项目'), 'info');
        return;
    }

    if (!$('body').hasClass('can-share')) {
        showToast((typeof t === 'function' ? t('workspace.no_share_perm', null, '外发分享功能已关闭或当前账号无权分享') : '外发分享功能已关闭或当前账号无权分享'), 'warning');
        return;
    }

    var $item = $('#item-node-' + targetId);
    if ($item.length && !$item.data('href')) {
        showToast((typeof t === 'function' ? t('workspace.no_version_to_share', null, '当前项目尚未发布任何版本，暂无法分享') : '当前项目尚未发布任何版本，暂无法分享'), 'info');
        return;
    }

    // 未登录人员严禁获取或分享直链
    if (typeof openShareModal !== 'function' || !document.getElementById('shareManageModal')) {
        showToast((typeof t === 'function' ? t('workspace.guest_cannot_share', null, '访客无权分享原型，请先登录账号') : '访客无权分享原型，请先登录账号'), 'info');
        if (typeof openLoginModal === 'function') {
            openLoginModal();
        }
        return;
    }

    openShareModal(targetId);
}

// 刷新当前原型 iframe
function reloadIframe() {
    var iframe = document.getElementById('myFrame');
    if (iframe && iframe.style.display !== 'none' && iframe.src && iframe.src.indexOf('about:blank') === -1) {
        try {
            if (iframe.contentWindow && iframe.contentWindow.location) {
                iframe.contentWindow.location.reload();
                return;
            }
        } catch(e) {}
        iframe.src = iframe.src;
    }
}

// 全屏切换
function toggleFullscreen() {
    var iframe = document.getElementById('myFrame');
    if (!iframe || iframe.style.display === 'none' || !iframe.src || iframe.src.indexOf('about:blank') !== -1) {
        return;
    }
    var el = document.getElementById('iframeWrap');
    if (!document.fullscreenElement) {
        if (el.requestFullscreen) {
            el.requestFullscreen().catch(function(err) {});
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

// 树项更多气泡菜单切换
function toggleTreeMore(btnEl, e) {
    if (e) e.stopPropagation();
    var $wrap = $(btnEl).closest('.tree-more-wrap');
    var isOpen = $wrap.hasClass('open');
    closeAllTreeMore();
    if (!isOpen) {
        $wrap.addClass('open');
        $wrap.closest('.admin-controls').addClass('is-active');
    }
}

function closeAllTreeMore() {
    $('.tree-more-wrap').removeClass('open');
    $('.admin-controls').removeClass('is-active');
}

$(document).on('click', function(e) {
    if (!$(e.target).closest('.tree-more-wrap').length) {
        closeAllTreeMore();
    }
});

// 折叠 / 展开分类 (Linear 物理流体手风琴展开与收拢，毫秒级与小箭头同步)
function toggleCategory(headerEl, e) {
    var group = headerEl.closest ? headerEl.closest('.category-group') : $(headerEl).closest('.category-group')[0];
    if (!group) return;
    var items = group.querySelector('.category-items');
    if (!items) {
        group.classList.toggle('collapsed');
        return;
    }

    // 若系统开启减弱动态效果，或者浏览器不支持 Web Animations API，安全降级
    var prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced || typeof items.animate !== 'function') {
        group.classList.toggle('collapsed');
        return;
    }

    var currentHeight = 0;
    var interruptedDirection = items._animDirection || null;
    // 中断可能正在运行的动画并捕获当前实际瞬时高度，彻底清除内联样式残留
    if (items._currentAnim) {
        var rect = items.getBoundingClientRect();
        currentHeight = rect.height > 0 ? Math.round(rect.height) : 0;
        try { items._currentAnim.cancel(); } catch(err) {}
        items._currentAnim = null;
        items._animDirection = null;
        items.style.height = '';
        items.style.overflow = '';
        items.style.display = '';
    }

    var isCollapsed;
    if (interruptedDirection === 'collapsing') {
        isCollapsed = true; // 上次正收起被中断，此次反向展开
    } else if (interruptedDirection === 'expanding') {
        isCollapsed = false; // 上次正展开被中断，此次反向收起
    } else {
        isCollapsed = group.classList.contains('collapsed');
    }
    var easing = 'cubic-bezier(0.16, 1, 0.3, 1)';
    var duration = 180;

    var cleanUp = function(ownerAnim) {
        if (ownerAnim && items._currentAnim !== ownerAnim) {
            return;
        }
        items.style.height = '';
        items.style.overflow = '';
        items.style.display = '';
        items._currentAnim = null;
        items._animDirection = null;
    };

    if (isCollapsed) {
        // 展开流程：平滑滑出展开
        group.classList.remove('collapsed');
        items.style.display = 'block';
        items.style.overflow = 'hidden';
        var targetHeight = items.scrollHeight;
        var startH = currentHeight > 0 ? currentHeight : 0;

        items._animDirection = 'expanding';
        var anim = items.animate([
            { height: startH + 'px', opacity: startH > 0 ? Math.min(1, startH / Math.max(1, targetHeight)) : 0 },
            { height: targetHeight + 'px', opacity: 1 }
        ], {
            duration: Math.max(80, Math.round(duration * (1 - startH / Math.max(1, targetHeight)))),
            easing: easing
        });
        items._currentAnim = anim;

        anim.onfinish = function() {
            cleanUp(anim);
        };
        anim.oncancel = function() {
            cleanUp(anim);
        };
    } else {
        // 收起流程：从当前实际高度平滑卷缩收拢，消除全高突变
        var startHeight = currentHeight > 0 ? currentHeight : items.scrollHeight;
        items.style.display = 'block';
        items.style.overflow = 'hidden';

        items._animDirection = 'collapsing';
        var anim = items.animate([
            { height: startHeight + 'px', opacity: 1 },
            { height: '0px', opacity: 0 }
        ], {
            duration: Math.max(80, Math.round(duration * (startHeight / Math.max(1, items.scrollHeight)))),
            easing: easing
        });
        items._currentAnim = anim;

        anim.onfinish = function() {
            group.classList.add('collapsed');
            cleanUp(anim);
        };
        anim.oncancel = function() {
            cleanUp(anim);
        };
    }
}

// 搜索关键字高亮与安全转义
function escapeSearchRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeSearchHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function highlightSearchMatches(text, tokens) {
    if (!text) return '';
    var rawText = String(text);
    if (!tokens || !tokens.length) return escapeSearchHtml(rawText);

    var rawTokens = tokens
        .map(function(t) { return escapeSearchRegExp(String(t)); })
        .filter(function(t) { return t.length > 0; });

    if (!rawTokens.length) return escapeSearchHtml(rawText);

    var regex = new RegExp('(' + rawTokens.join('|') + ')', 'gi');
    var result = '';
    var lastIndex = 0;
    var match;

    while ((match = regex.exec(rawText)) !== null) {
        if (match.index > lastIndex) {
            result += escapeSearchHtml(rawText.substring(lastIndex, match.index));
        }
        result += '<mark class="search-highlight">' + escapeSearchHtml(match[0]) + '</mark>';
        lastIndex = regex.lastIndex;
        if (regex.lastIndex === match.index) {
            regex.lastIndex++;
        }
    }

    if (lastIndex < rawText.length) {
        result += escapeSearchHtml(rawText.substring(lastIndex));
    }

    return result;
}

// 搜索防抖与内存索引，避免百级项目输入时反复遍历/解析 DOM
var _searchDebounceTimer = null;
var _sidebarSearchCache = null;
var _sidebarSearchCacheNodeCount = -1;
var _sidebarSearchObserverBound = false;
var _isApplyingSearchHighlight = false;

window.invalidateSidebarSearchIndex = function() {
    _sidebarSearchCache = null;
    _sidebarSearchCacheNodeCount = -1;
};

function ensureSidebarSearchObserver() {
    if (_sidebarSearchObserverBound || typeof MutationObserver === 'undefined') return;
    var treeRoot = document.getElementById('categoryTree');
    if (!treeRoot) return;
    _sidebarSearchObserverBound = true;
    var obs = new MutationObserver(function(muts) {
        if (_isApplyingSearchHighlight || !_sidebarSearchCache) return;
        for (var i = 0; i < muts.length; i++) {
            var m = muts[i];
            if (m.type === 'attributes') {
                window.invalidateSidebarSearchIndex();
                return;
            }
            var target = m.target;
            if (m.type === 'characterData') {
                var parentEl = target && target.parentElement;
                if (parentEl && parentEl.closest && (parentEl.closest('.cat-name-text') || parentEl.closest('.item-title'))) {
                    window.invalidateSidebarSearchIndex();
                    return;
                }
                continue;
            }
            if (m.type === 'childList') {
                if (!target || !target.classList || !target.classList.contains('item-title')) {
                    window.invalidateSidebarSearchIndex();
                    return;
                }
            }
        }
    });
    obs.observe(treeRoot, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['data-name', 'data-creator-name', 'data-versions', 'data-created-by']
    });
}

function getSidebarSearchIndex() {
    ensureSidebarSearchObserver();
    var rows = document.querySelectorAll('.item-row');
    if (_sidebarSearchCache && _sidebarSearchCacheNodeCount === rows.length) {
        return _sidebarSearchCache;
    }
    var list = [];
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var $row = $(row);
        var attrName = row.getAttribute('data-name');
        var name = (attrName !== null ? attrName : ($row.data('name') || '')).toString();
        var attrCreator = row.getAttribute('data-creator-name');
        var creator = (attrCreator !== null ? attrCreator : ($row.data('creator-name') || '')).toString();
        var catGroup = row.closest ? row.closest('.category-group') : $row.closest('.category-group')[0];
        var catNameEl = catGroup ? catGroup.querySelector('.cat-name-text') : null;
        var catName = catNameEl ? (catNameEl.textContent || '').trim() : '';
        var attrVersions = row.getAttribute('data-versions');
        var versionsData = attrVersions !== null ? attrVersions : $row.data('versions');
        var versionTexts = [];
        if (versionsData) {
            if (typeof versionsData === 'string') {
                try { versionsData = JSON.parse(versionsData); } catch(e) { versionsData = []; }
            }
            if (Array.isArray(versionsData)) {
                for (var vi = 0; vi < versionsData.length; vi++) {
                    var v = versionsData[vi];
                    if (v && v.version_name) versionTexts.push(v.version_name);
                    if (v && v.creator_name) versionTexts.push(v.creator_name);
                }
            }
        }
        list.push({
            row: row,
            $row: $row,
            name: name,
            titleEl: row.querySelector('.item-title'),
            haystack: (name + ' ' + catName + ' ' + creator + ' ' + versionTexts.join(' ')).toLowerCase()
        });
    }
    _sidebarSearchCache = list;
    _sidebarSearchCacheNodeCount = rows.length;
    return list;
}

// 清空搜索
function clearSearch() {
    if (_searchDebounceTimer) {
        clearTimeout(_searchDebounceTimer);
        _searchDebounceTimer = null;
    }
    var $input = $('#searchKeyword');
    $input.val('');
    executeSearch('');
    $input.focus();
}

// 关键词即时搜索入口（带 120ms 防抖，清空立即响应）
function handleSearch(kw) {
    kw = (kw || '').trim();
    if (_searchDebounceTimer) {
        clearTimeout(_searchDebounceTimer);
        _searchDebounceTimer = null;
    }
    if (!kw) {
        executeSearch('');
        return;
    }
    $('#searchClearBtn').show();
    _searchDebounceTimer = setTimeout(function() {
        _searchDebounceTimer = null;
        executeSearch(kw);
    }, 120);
}

// 执行搜索匹配与高亮
function executeSearch(kw) {
    kw = (kw || '').trim();
    var $clearBtn = $('#searchClearBtn');
    var $emptyState = $('#searchEmptyState');
    var indexList = getSidebarSearchIndex();

    _isApplyingSearchHighlight = true;
    try {
        if (!kw) {
            $clearBtn.hide();
            $emptyState.hide();
            for (var i = 0; i < indexList.length; i++) {
                var entry = indexList[i];
                entry.row.style.display = '';
                if (entry.titleEl && entry.name !== undefined) {
                    entry.titleEl.textContent = entry.name;
                }
            }
            $('.category-group').show();
            return;
        }

        $clearBtn.show();

        // 空格多词拆分 (AND 查询)
        var tokens = kw.toLowerCase().split(/\s+/).filter(Boolean);
        var totalMatches = 0;

        for (var j = 0; j < indexList.length; j++) {
            var item = indexList[j];
            var isMatch = tokens.length > 0 && tokens.every(function(t) {
                return item.haystack.indexOf(t) > -1;
            });

            if (isMatch) {
                item.row.style.display = '';
                totalMatches++;
                if (item.titleEl) {
                    item.titleEl.innerHTML = highlightSearchMatches(item.name, tokens);
                }
            } else {
                item.row.style.display = 'none';
                if (item.titleEl) {
                    item.titleEl.textContent = item.name;
                }
            }
        }

        // 智能展开/隐藏分类组
        $('.category-group').each(function() {
            var $cat = $(this);
            var rows = this.querySelectorAll('.item-row');
            var matchCountInCat = 0;
            for (var k = 0; k < rows.length; k++) {
                if (rows[k].style.display !== 'none') {
                    matchCountInCat++;
                    break;
                }
            }
            if (matchCountInCat > 0) {
                $cat.show().removeClass('collapsed');
            } else {
                $cat.hide();
            }
        });

        if (totalMatches === 0) {
            $emptyState.show();
        } else {
            $emptyState.hide();
        }
    } finally {
        _isApplyingSearchHighlight = false;
    }
}

// 根据 URL Hash 路由恢复项目定位
function openAnnotationLink(id) {
    var routeAtRequest = window.location.hash;
    return fetch('api.php?action=annotation_target&id=' + encodeURIComponent(id)).then(function(response) { return response.json(); }).then(function(res) {
        if (window.location.hash !== routeAtRequest) return;
        if (!res.success) throw new Error(res.message || (typeof t === 'function' ? t('anno.inaccessible', null, '批注不可访问') : '批注不可访问'));
        var target = res.data;
        var node = document.getElementById('item-node-' + target.item_id);
        if (!node) throw new Error(typeof t === 'function' ? t('workspace.item_inaccessible', null, '项目不存在或无权访问') : '项目不存在或无权访问');
        var isLink = (node.getAttribute('data-type') === 'link' || parseInt(target.version_id, 10) === 0);
        if (!isLink) {
            var versions = JSON.parse(node.getAttribute('data-versions') || '[]');
            var match = versions.filter(function(version) { return parseInt(version.id,10) === target.version_id; })[0];
            if (!match) throw new Error(typeof t === 'function' ? t('workspace.ver_deleted_inaccessible', null, '版本已删除或不可访问') : '版本已删除或不可访问');
        }
        $(node).closest('.category-group').removeClass('collapsed');
        selectItem(target.item_id, node, isLink ? '' : target.version_name, false, true);
        if (target.page_url && !isLink) document.getElementById('myFrame').src = target.page_url;
        if (typeof window.setActiveAnnotationHash === 'function') {
            window.setActiveAnnotationHash(id);
        } else {
            var annoHash = '#annotation=' + parseInt(id, 10);
            window.currentActiveAnnotationHash = annoHash;
            window.history.replaceState(null, '', annoHash);
        }
        if (typeof window.focusAnnotation === 'function') window.focusAnnotation(parseInt(id,10));
        if (!target.page_url && !isLink) showToast(typeof t === 'function' ? t('anno.page_missing_open_entry', null, '原页面已不存在，已打开版本入口；请查看批注原文') : '原页面已不存在，已打开版本入口；请查看批注原文', 'warning');
        else if (target.annotation && target.annotation.needs_review) showToast(typeof t === 'function' ? t('anno.needs_review_toast', null, '原型已更新，此批注需要重新核对') : '原型已更新，此批注需要重新核对', 'info');
    }).catch(function(error) { showToast(error.message || (typeof t === 'function' ? t('anno.inaccessible', null, '批注不可访问') : '批注不可访问'), 'error'); });
}
window.openAnnotationLink = openAnnotationLink;
function setActiveAnnotationHash(id) {
    var parsed = parseInt(id, 10);
    if (!parsed || parsed <= 0) return '';
    var annoHash = '#annotation=' + parsed;
    if (typeof window !== 'undefined') {
        window.currentActiveAnnotationHash = annoHash;
        if (window.history && window.history.replaceState) {
            window.history.replaceState(null, '', annoHash);
        }
    }
    return annoHash;
}
window.setActiveAnnotationHash = setActiveAnnotationHash;
function handleAdminHashRoute(hash, fallbackHash) {
    if (!hash || !/(?:^#|&)admin=users(?:&|$)/.test(hash)) return false;
    if (typeof CURRENT_USER === 'undefined' || !CURRENT_USER || CURRENT_USER.role !== 'admin') return false;
    if (typeof openAdminConsole !== 'function') return false;
    var subMatch = hash.match(/(?:^#|&)sub=(pending|active)(?:&|$)/);
    openAdminConsole('users', subMatch ? subMatch[1] : undefined);
    if (window.location.hash === hash && window.history && window.history.replaceState) {
        var restoreHash = '';
        if (typeof window.currentActiveAnnotationHash === 'string'
            && /^#annotation=[1-9][0-9]*$/.test(window.currentActiveAnnotationHash)
            && fallbackHash === window.currentActiveAnnotationHash) {
            restoreHash = window.currentActiveAnnotationHash;
        } else if (typeof window.currentActiveItemHash === 'string' && /^#item=\d+(?:&|$)/.test(window.currentActiveItemHash)) {
            restoreHash = window.currentActiveItemHash;
        }
        window.history.replaceState(null, '', window.location.pathname + window.location.search + restoreHash);
    }
    return true;
}

window.addEventListener('hashchange', function(event) {
    var incoming = new URL(event.newURL).hash;
    // selectItem 会写入自己的 Hash；忽略已被后续路由替换的排队事件。
    if (incoming !== window.location.hash) return;
    var previous = '';
    if (event.oldURL) {
        try { previous = new URL(event.oldURL).hash; } catch (e) {}
    }
    var match = incoming.match(/(?:^#|&)annotation=([1-9][0-9]*)/);
    if (match) openAnnotationLink(match[1]);
    else if (incoming === '#settings=mcp') { openProfileModal(); switchProfileTab('mcp'); }
    else if (handleAdminHashRoute(incoming, previous)) return;
    else if (/[?&]vid=[1-9][0-9]*/.test(incoming)) initHashRoute();
});

function safeDecodeURIComponent(str) {
    if (!str) return '';
    try {
        return decodeURIComponent(str);
    } catch(e) {
        return String(str);
    }
}

function initHashRoute() {
    var hash = window.location.hash;
    var annotationMatch = hash.match(/(?:^#|&)annotation=([1-9][0-9]*)/);
    if (annotationMatch) { openAnnotationLink(annotationMatch[1]); return; }
    if (hash.indexOf('settings=mcp') !== -1) { openProfileModal(); switchProfileTab('mcp'); }
    var isAdminDeepLink = /(?:^#|&)admin=users(?:&|$)/.test(hash);
    if (hash) {
        // 1. 尝试自愈直链回弹 (来自安全守卫的直达还原)
        var mDirect = hash.match(/direct=([^&]+)/);
        if (mDirect && mDirect[1]) {
            var rawPath = safeDecodeURIComponent(mDirect[1]);
            var matchedEl = null;
            $('.item-row').each(function() {
                var href = $(this).data('href') || '';
                if (href && (rawPath.indexOf(href) > -1 || href.indexOf(rawPath) > -1)) {
                    matchedEl = this;
                    return false;
                }
            });
            if (matchedEl) {
                $(matchedEl).closest('.category-group').removeClass('collapsed');
                selectItem($(matchedEl).data('item-id'), matchedEl, null, false, true);
                return;
            }
        }

        // 2. 尝试标准 item=ID 定位 (含版本联动)
        var m = hash.match(/item=(\d+)/);
        if (m && m[1]) {
            var $target = $('#item-node-' + m[1]);
            if ($target.length) {
                var targetVer = null;
                var mId = hash.match(/[?&]vid=([1-9][0-9]*)/);
                if (mId) {
                    var versions = JSON.parse($target.attr('data-versions') || '[]');
                    var exact = versions.filter(function(v) { return parseInt(v.id,10) === parseInt(mId[1],10); })[0];
                    if (!exact) { showToast((typeof t === 'function' ? t('workspace.ver_deleted_inaccessible', null, '版本已删除或不可访问') : '版本已删除或不可访问'), 'error'); return; }
                    targetVer = exact.version_name;
                }
                var mV = hash.match(/[?&]v=([^&]+)/);
                if (!mId && mV && mV[1]) {
                    targetVer = safeDecodeURIComponent(mV[1]);
                }
                $target.closest('.category-group').removeClass('collapsed');
                selectItem(parseInt(m[1]), $target[0], targetVer, false, true);
                return;
            }
        }
    }
    // 默认激活首个项目（原地替换历史项，避免在审批直达等入口残留会重开弹窗的历史记录）
    var $first = $('.item-row:first');
    if ($first.length) {
        selectItem($first.data('item-id'), $first[0], null, false, true);
    } else {
        updateTopActionsState(false);
    }
    if (isAdminDeepLink) {
        handleAdminHashRoute(hash);
    }
}

/* ===================== 全局通用弹窗与快捷交互 ===================== */
// All overlays share one focus boundary, including nested confirmation dialogs.
var modalStack = [];
var modalInerted = [];
function modalFocusable(modal) {
    return Array.prototype.filter.call(modal.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex]'), function(el) {
        return !el.disabled && el.tabIndex >= 0 && el.getClientRects().length && !el.closest('[inert]');
    });
}
function syncModalBackground() {
    modalInerted.forEach(function(entry) { entry.node.inert = entry.previous; });
    modalInerted = [];
    if (!modalStack.length) return;
    var branch = modalStack[modalStack.length - 1].node;
    while (branch && branch.parentElement) {
        var parent = branch.parentElement;
        Array.prototype.forEach.call(parent.children, function(sibling) {
            if (sibling !== branch && !/^(SCRIPT|STYLE|LINK)$/.test(sibling.tagName)) {
                modalInerted.push({node:sibling, previous:!!sibling.inert});
                sibling.inert = true;
            }
        });
        if (parent === document.body) break;
        branch = parent;
    }
}
function openModal(id, preferredId) {
    var modal = document.getElementById(id);
    if (!modal) return;
    var old = modalStack.find(function(entry) { return entry.node === modal; });
    if (!old) modalStack.push({node:modal, opener:document.activeElement});
    modal.style.display = 'flex';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    var heading = modal.querySelector('h4, h3, [data-dialog-title]');
    if (heading && !modal.hasAttribute('aria-label')) {
        if (!heading.id) heading.id = id + 'Heading';
        modal.setAttribute('aria-labelledby', heading.id);
    } else if (!modal.hasAttribute('aria-label')) {
        modal.setAttribute('aria-label', (typeof t === 'function' ? t('auth.dialog_label', null, '对话框') : '对话框'));
    }
    syncModalBackground();
    var fields = modalFocusable(modal);
    var preferred = preferredId ? document.getElementById(preferredId) : null;
    var firstInput = fields.find(function(el) {
        return el.tagName === 'TEXTAREA'
            || (el.tagName === 'INPUT' && !el.readOnly && !/^(checkbox|radio|file|hidden|submit|button)$/i.test(el.type));
    });
    var target = preferred || firstInput || modal;
    if (target === modal) modal.tabIndex = -1;
    target.focus();
}
function closeModal(id, force) {
    if (!force && id === 'uploadModal' && typeof versionUploadBusy !== 'undefined' && versionUploadBusy) {
        if (typeof showConfirm === 'function') {
            showConfirm({
                title: (typeof t === 'function' ? t('admin.upload.in_progress_close_title', null, '发版任务进行中') : '发版任务进行中'),
                message: (typeof t === 'function' ? t('admin.upload.in_progress_close_msg', null, '原型上传发布仍在进行中，关闭窗口不会中断后台任务，完成后将自动刷新页面。确定要关闭弹窗吗？') : '原型上传发布仍在进行中，关闭窗口不会中断后台任务，完成后将自动刷新页面。确定要关闭弹窗吗？'),
                onConfirm: function() {
                    closeModal(id, true);
                }
            });
            return;
        }
    }
    if (id === 'profileModal' && typeof closeProfileAvatarPicker === 'function') {
        closeProfileAvatarPicker();
    }
    var modal = document.getElementById(id);
    if (!modal) return;
    var index = modalStack.findIndex(function(entry) { return entry.node === modal; });
    var entry = index >= 0 ? modalStack.splice(index, 1)[0] : null;
    modal.style.display = 'none';
    if (typeof clearPasswordStrength === 'function') clearPasswordStrength(modal);
    syncModalBackground();
    var top = modalStack.length ? modalStack[modalStack.length - 1].node : null;
    var opener = entry && entry.opener;
    if (opener && opener.isConnected && !opener.closest('[inert]') && (!top || top.contains(opener))) opener.focus();
    else if (top && !top.contains(document.activeElement)) {
        var fields = modalFocusable(top);
        (fields[0] || top).focus();
    }
    if (id === 'adminConsoleModal' && window.adminConsoleChanged) {
        window.adminConsoleChanged = false;
        window.location.reload();
    }
    if (typeof window !== 'undefined' && typeof window.onQuickCreateModalClosed === 'function') {
        window.onQuickCreateModalClosed(id);
    }
}
function modalKeyboardBoundary(e) {
    if (!modalStack.length) return;
    var top = modalStack[modalStack.length - 1].node;
    if (e.key === 'Escape') {
        // Confirmation dialogs own their cancel callback.
        if (top.id === 'customConfirmModal') return;
        var picker = document.getElementById('adminMultiSelectMenu');
        var avatarPopover = document.getElementById('profileAvatarPopover');
        if (top.id === 'profileModal' && avatarPopover && !avatarPopover.hidden) {
            if (typeof closeProfileAvatarPicker === 'function') {
                closeProfileAvatarPicker();
            }
            var avatarBtn = document.getElementById('myProfileAvatarBtn');
            if (avatarBtn) avatarBtn.focus();
        } else if (top.contains(picker) && picker.style.display !== 'none') {
            picker.style.display = 'none';
            var trigger = document.getElementById('adminMultiSelectTrigger');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.focus();
        } else if (typeof window.closeAllVersionPickers === 'function' && window.closeAllVersionPickers()) {
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
        } else closeModal(top.id);
        e.preventDefault();
        e.stopImmediatePropagation();
    } else if (e.key === 'Tab') {
        var fields = modalFocusable(top);
        var active = document.activeElement;
        var index = fields.indexOf(active);
        if (!fields.length) { e.preventDefault(); top.focus(); }
        else if (index < 0 || (!e.shiftKey && index === fields.length - 1) || (e.shiftKey && index === 0)) {
            e.preventDefault();
            fields[e.shiftKey ? fields.length - 1 : 0].focus();
        }
    }
}
if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('keydown', modalKeyboardBoundary, true);

function openLoginModal(pane) {
    var el = document.getElementById('loginModal');
    if (el) {
        openModal('loginModal');
        if (typeof toggleLoginRegPane === 'function') {
            var success = document.getElementById('loginSuccessNotice');
            if (success) success.style.display = 'none';
            toggleLoginRegPane(pane || 'login');
            return;
        }
        var userInput = document.getElementById('loginEmail');
        if (userInput) userInput.focus();
    }
}

function closeLoginModal() {
    closeModal('loginModal');
}

// 全员通用退出登录 (适用于管理员、协作者、审阅人)
function doLogout() {
    showConfirm({
        title: (typeof t === 'function' ? t('auth.logout_title', null, '退出登录') : '退出登录'),
        message: (typeof t === 'function' ? t('auth.logout_confirm', null, '确定退出当前登录账号？') : '确定退出当前登录账号？'),
        confirmText: (typeof t === 'function' ? t('auth.logout_btn', null, '退出') : '退出'),
        onConfirm: function() {
            var fd = new FormData();
            fd.append('action', 'logout');
            apiFetch('logout', fd).then(function() {
                window.location.reload();
            }).catch(function() {
                window.location.reload();
            });
        }
    });
}

// 模态弹窗稳妥规范：禁止点击遮罩背景误触关闭（仅允许右上角关闭按钮、底部取消按钮或按 ESC 键主动关闭）
// 彻底杜绝发版上传、配置属性、移交所有权等表单因手滑误触遮罩导致数据丢失

// 按 ESC 键关闭当前所有激活的弹窗，按 / 键快速聚焦搜索框
$(document).on('keydown', function(e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
        if (!modalStack.length) return;
    } else if (e.key === '/' || e.keyCode === 191) {
        // 当焦点不在输入框/文本域且没有弹窗打开时，触发快捷搜索
        var activeTag = (document.activeElement && document.activeElement.tagName) ? document.activeElement.tagName.toUpperCase() : '';
        var isModalOpen = $('.custom-modal:visible').length > 0 || $('#adminConsoleModal:visible').length > 0;
        if (!isModalOpen && activeTag !== 'INPUT' && activeTag !== 'TEXTAREA' && activeTag !== 'SELECT') {
            e.preventDefault();
            var $searchInput = $('#searchKeyword');
            if ($searchInput.length) {
                $searchInput.focus().select();
            }
        }
    }
});

// 动态钳位更新日志气泡，防止中等宽度窗口右侧及关闭按钮被裁切
function clampChangelogPopover(pop) {
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

// 切换顶部更新日志气泡
function toggleTopChangelog(force) {
    var $pop = $('#topChangelogPopover');
    if (force === false) {
        $pop.hide();
        return;
    }
    var show = (force === true) || !$pop.is(':visible');
    if (show) {
        $pop.show();
        clampChangelogPopover($pop[0]);
    } else {
        $pop.hide();
    }
}
window.toggleTopChangelog = toggleTopChangelog;

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', function() {
        var pop = document.getElementById('topChangelogPopover');
        if (pop && pop.style.display !== 'none') {
            clampChangelogPopover(pop);
        }
    });
}

$(document).on('click', function(e) {
    if (!$(e.target).closest('#barChangelogBtn, #topChangelogPopover').length) {
        $('#topChangelogPopover').hide();
    }
});

$(document).on('keydown', function(e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
        var $pop = $('#topChangelogPopover');
        if ($pop.length && $pop.is(':visible')) {
            $pop.hide();
        }
    }
});

// 动态渲染工作台内部防泄密水印 (分钟级更新 + 同分钟零重绘 + 切后台智能休眠)
var workspaceWatermarkCanvas = null;
var workspaceWatermarkTimer = null;

function updateWorkspaceWatermarkImage(customDate) {
    var $overlay = $('#watermarkOverlay');
    if (!$overlay.length || $overlay.is(':hidden')) return;
    var uName = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER && (CURRENT_USER.name || CURRENT_USER.email)) ? (CURRENT_USER.name || CURRENT_USER.email) : (typeof t === 'function' ? t('common.member_default', null, '立象成员') : '立象成员');
    var now = customDate instanceof Date ? customDate : new Date();
    var pad = function(n) { return n < 10 ? '0' + n : n; };
    var timeStr = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate() + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());
    var text = uName + '@' + timeStr;

    if (!workspaceWatermarkCanvas) {
        workspaceWatermarkCanvas = document.createElement('canvas');
    }
    ProtoLoftWatermark.draw(workspaceWatermarkCanvas, $overlay[0], text);
}

function renderWorkspaceWatermark(enabled) {
    var $overlay = $('#watermarkOverlay');
    if (!$overlay.length) return;
    if (!enabled) {
        $overlay.hide();
        if (workspaceWatermarkTimer) {
            clearInterval(workspaceWatermarkTimer);
            workspaceWatermarkTimer = null;
        }
        return;
    }
    $overlay.show();
    updateWorkspaceWatermarkImage();
    if (!workspaceWatermarkTimer) {
        // 每 15 秒轻量核对一次分钟字符串；同一分钟内由 watermark.js 缓存直接跳过，跨分钟才重绘一次
        workspaceWatermarkTimer = setInterval(function() {
            if (typeof document !== 'undefined' && document.hidden) return;
            updateWorkspaceWatermarkImage();
        }, 15000);
    }
}
window.renderWorkspaceWatermark = renderWorkspaceWatermark;

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden && workspaceWatermarkTimer) {
            updateWorkspaceWatermarkImage();
        }
    });
}

/* ===================== 全员个人设置弹窗 (全角色通用) ===================== */
var currentProfilePage = 'data';
var profileMcpLoaded = false;
function showProfilePage(page, focus) {
    var pages = ['data', 'password', 'mcp'];
    if (pages.indexOf(page) === -1) page = 'data';
    currentProfilePage = page;
    pages.forEach(function(name) {
        var suffix = name.charAt(0).toUpperCase() + name.slice(1);
        var pane = document.getElementById('profilePage' + suffix);
        var tab = document.getElementById('profileTab' + suffix);
        if (pane) {
            var wasHidden = pane.hidden;
            pane.hidden = name !== page;
            if (name === page && wasHidden) {
                if (typeof triggerTabTransition === 'function') {
                    triggerTabTransition(pane);
                } else if (typeof window !== 'undefined' && typeof window.triggerTabTransition === 'function') {
                    window.triggerTabTransition(pane);
                }
            }
        }
        if (tab) {
            tab.setAttribute('aria-selected', name === page ? 'true' : 'false');
            tab.tabIndex = name === page ? 0 : -1;
            tab.classList.toggle('active', name === page);
            if (name === page && focus !== false) tab.focus();
        }
    });
    var modal = document.getElementById('profileModal');
    if (modal) modal.querySelector('.modal-dialog-box').scrollTop = 0;
    if (typeof closeProfileAvatarPicker === 'function') {
        closeProfileAvatarPicker();
    }
    if (page !== 'password' && typeof clearPasswordStrength === 'function') {
        clearPasswordStrength(document.getElementById('profilePagePassword'));
    }
    if (page === 'mcp' && !profileMcpLoaded && typeof loadMcpSettings === 'function') {
        profileMcpLoaded = true;
        loadMcpSettings();
    }
}
function handleProfileTabKey(event) {
    var pages = ['data', 'password', 'mcp'];
    var index = pages.indexOf(currentProfilePage);
    if (event.key === 'ArrowRight') index = (index + 1) % pages.length;
    else if (event.key === 'ArrowLeft') index = (index + pages.length - 1) % pages.length;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = pages.length - 1;
    else return;
    event.preventDefault();
    showProfilePage(pages[index]);
}
window.showProfilePage = showProfilePage;
window.handleProfileTabKey = handleProfileTabKey;
// Existing MCP deep links use this entry point.
function switchProfileTab(tab) {
    showProfilePage(tab === 'basic' ? 'data' : (tab === 'security' ? 'password' : tab));
}
window.switchProfileTab = switchProfileTab;

function initProfileForms() {
    ['profileForm', 'profileWebhookForm'].forEach(function(id) {
        var form = document.getElementById(id);
        if (!form || form._dirtyBound) return;
        form._dirtyBound = true;
        var input = form.querySelector('input');
        form._savedValue = input.value.trim();
        form.addEventListener('input', function() {
            var button = form.querySelector('button[type="submit"]');
            button.disabled = input.value.trim() === form._savedValue;
        });
    });
}
function markProfileSaved(id, value) {
    var form = document.getElementById(id);
    if (!form) return;
    form._savedValue = value;
    var input = form.querySelector('input');
    var button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = input.value.trim() === value;
}

function openProfileModal() {
    initProfileForms();
    if (typeof closeProfileAvatarPicker === 'function') {
        closeProfileAvatarPicker();
    }
    if (typeof renderMyProfileAvatar === 'function') {
        renderMyProfileAvatar();
    }
    var modal = document.getElementById('profileModal');
    if (modal) {
        profileMcpLoaded = false;
        showProfilePage('data', false);
        openModal('profileModal', 'profileTabData');
    }
}
window.openProfileModal = openProfileModal;

function openProfilePasswordModal() {
    var tip = document.getElementById('firstLoginTipBanner');
    if (tip) tip.remove();
    openProfileModal();
    showProfilePage('password');
    document.getElementById('myOldPassword').focus();
}
window.openProfilePasswordModal = openProfilePasswordModal;

function dismissFirstLoginTip() {
    var tip = document.getElementById('firstLoginTipBanner');
    if (tip) {
        tip.style.transition = 'opacity 0.2s, transform 0.2s';
        tip.style.opacity = '0';
        tip.style.transform = 'translateY(10px)';
        setTimeout(function() { tip.remove(); }, 200);
    }
    apiFetch('dismiss_first_login').catch(function(){});
}
window.dismissFirstLoginTip = dismissFirstLoginTip;

function handleSaveProfile(e) {
    if (e) e.preventDefault();
    var displayName = document.getElementById('myDisplayName').value.trim();
    var btn = document.getElementById('btnSaveProfile');
    if (btn) btn.disabled = true;

    var formData = new FormData();
    formData.append('name', displayName);

    apiFetch('profile_update', formData)
    .then(function(res) {
        if (btn) btn.disabled = false;
        if (!res.success) {
            showToast(res.message || (typeof t === 'function' ? t('common.save_failed', null, '保存失败') : '保存失败'), 'error');
            return;
        }
        showToast((typeof t === 'function' ? t('profile.saved', null, '个人资料已保存') : '个人资料已保存'), 'success');
        markProfileSaved('profileForm', displayName);
        var newName = (res.data && res.data.name) ? res.data.name : displayName;
        if (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) {
            CURRENT_USER.name = newName;
            CURRENT_USER.display_name = newName;
        }
        var headerName = document.getElementById('myProfileHeaderName');
        if (headerName) headerName.textContent = newName || (typeof t === 'function' ? t('common.user_default', null, '用户') : '用户');
        var sidebarName = document.querySelector('.user-badge span');
        if (sidebarName) sidebarName.textContent = newName || (typeof t === 'function' ? t('common.user_default', null, '用户') : '用户');

        // 全景热同步：更新当前用户负责的所有项目的展示与 DOM 属性
        if (typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.id) {
            var myUid = parseInt(CURRENT_USER.id, 10);
            if (typeof $ === 'function') {
                // 1. 同步前台目录树节点
                $('li.item-row').each(function() {
                    var $node = $(this);
                    if (parseInt($node.attr('data-created-by'), 10) === myUid) {
                        $node.attr('data-creator-name', newName).data('creator-name', newName);
                    }
                });
                if (typeof invalidateSidebarSearchIndex === 'function') {
                    invalidateSidebarSearchIndex();
                }

                // 2. 同步控制中心表格
                $('#overviewTableProjects tbody tr[data-item-id], #overviewTableLinks tbody tr[data-item-id]').each(function() {
                    var $row = $(this);
                    var collabStr = String($row.attr('data-collaborators') || '');
                    var isCreatorRow = parseInt($row.attr('data-created-by'), 10) === myUid;
                    if (isCreatorRow) {
                        $row.attr('data-creator-name', newName).data('creator-name', newName);
                    }
                    var isLinkRow = $row.closest('#overviewTableLinks').length > 0;
                    var colIdx = isLinkRow ? 4 : 2;
                    if (isLinkRow) {
                        if (isCreatorRow) $row.find('td').eq(colIdx).text(newName);
                        return;
                    }
                    if (typeof renderItemOwnersCellHtml === 'function') {
                        var cName = isCreatorRow ? newName : String($row.attr('data-creator-name') || '');
                        if (isCreatorRow || (collabStr && collabStr.split(',').indexOf(String(myUid)) !== -1)) {
                            $row.find('td').eq(colIdx).html(renderItemOwnersCellHtml(collabStr, cName));
                        }
                    } else if (isCreatorRow && !collabStr) {
                        $row.find('td').eq(colIdx).text(typeof t === 'function' ? t('admin.item.all_editors', null, '所有协作者') : '所有协作者');
                    }
                });

                // 3. 同步工作台右侧顶部状态栏 (仅对无版本外链同步当前负责人；普通原型版本保留历史发版人快照)
                if (typeof currentSelectedItemId !== 'undefined' && currentSelectedItemId) {
                    var $curNode = $('#item-node-' + currentSelectedItemId);
                    if ($curNode.length && $curNode.data('type') === 'link' && parseInt($curNode.attr('data-created-by'), 10) === myUid) {
                        $curNode.attr('data-creator-name', newName);
                        $curNode.data('creator-name', newName);
                        var $barTime = $('#barTime');
                        if ($barTime.length) {
                            var itemTime = $curNode.data('time') || '';
                            var metaHtml = buildWorkspaceUpdateMetaHtml(newName, itemTime);
                            if (metaHtml) {
                                $barTime.html(metaHtml).show();
                            } else {
                                $barTime.hide().empty();
                            }
                        }
                    }
                }
            }

            // 4. 同步负责人多选列表
            var ownersOptions = document.getElementById('itemOwnersOptions');
            if (ownersOptions) {
                var myCb = ownersOptions.querySelector('input.item-owner-cb[value="' + myUid + '"]');
                if (myCb) {
                    myCb.setAttribute('data-name', newName);
                    var labelEl = myCb.closest('label');
                    var spanEl = labelEl ? labelEl.querySelector('span') : null;
                    if (spanEl) {
                        var adminTag = (typeof t === 'function' ? t('admin.item.role_admin_tag', null, ' (管理员)') : ' (管理员)');
                        spanEl.textContent = newName + (CURRENT_USER.role === 'admin' ? adminTag : '');
                    }
                    if (typeof onItemOwnersChange === 'function') onItemOwnersChange();
                }
            }
        }
    })
    .catch(function() {
        if (btn) btn.disabled = false;
        showToast((typeof t === 'function' ? t('common.network_error', null, '网络异常，请重试') : '网络异常，请重试'), 'error');
    });
}
window.handleSaveProfile = handleSaveProfile;

function handleChangeMyPassword(e) {
    if (e) e.preventDefault();
    var oldPwdInput = document.getElementById('myOldPassword');
    var oldPwd = oldPwdInput.value;
    var passwordInput = document.getElementById('myNewPassword');
    var newPwd = passwordInput.value;
    var confirmInput = document.getElementById('myConfirmPassword');
    var confirmPwd = confirmInput.value;

    if (!oldPwd) {
        var oldReqMsg = typeof t === 'function' ? t('profile.enter_old_password', null, '请输入当前密码') : '请输入当前密码';
        if (typeof setFieldError === 'function') {
            setFieldError(oldPwdInput, null, oldReqMsg);
        } else {
            showToast(oldReqMsg, 'warning');
            oldPwdInput.focus();
        }
        return;
    }
    if (typeof showPasswordLengthError === 'function'
        ? showPasswordLengthError(passwordInput)
        : (typeof passwordLengthError === 'function' && passwordLengthError(newPwd))) {
        if (typeof showPasswordLengthError !== 'function') {
            showToast(passwordLengthError(newPwd), 'warning');
            passwordInput.focus();
        }
        return;
    }
    var mismatchMsg = typeof t === 'function' ? t('auth.password_mismatch', null, '两次输入的新密码不一致') : '两次输入的新密码不一致';
    if (typeof showPasswordMismatchError === 'function'
        ? showPasswordMismatchError(passwordInput, confirmInput, null, mismatchMsg)
        : (newPwd !== confirmPwd)) {
        if (typeof showPasswordMismatchError !== 'function') {
            showToast(mismatchMsg, 'warning');
            confirmInput.focus();
        }
        return;
    }

    var formData = new FormData();
    formData.append('old_password', oldPwd);
    formData.append('new_password', newPwd);
    formData.append('confirm_password', confirmPwd);

    apiFetch('change_my_password', formData)
    .then(function(res) {
        if (!res.success) {
            var msg = res.message || (typeof t === 'function' ? t('profile.pwd_failed', null, '修改密码失败') : '修改密码失败');
            if (typeof setFieldError === 'function') {
                if (/当前密码|原密码|目前密碼|current password/i.test(msg)) {
                    setFieldError(oldPwdInput, null, msg);
                    return;
                }
                if (/不一致|目前與|match/i.test(msg)) {
                    setFieldError(confirmInput, null, msg);
                    return;
                }
                if (/新密码|新密碼|字符|字元|字节|位元組|password|character|byte/i.test(msg)) {
                    setFieldError(passwordInput, null, msg);
                    return;
                }
            }
            showToast(msg, 'error');
            return;
        }
        showToast((typeof t === 'function' ? t('profile.pwd_updated', null, '密码已成功修改') : '密码已成功修改'), 'success');
        oldPwdInput.value = '';
        passwordInput.value = '';
        confirmInput.value = '';
        if (typeof clearPasswordStrength === 'function') {
            clearPasswordStrength(document.getElementById('changePasswordForm'));
        }
        if (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) {
            CURRENT_USER.is_first_login = 0;
        }
        var tip = document.getElementById('firstLoginTipBanner');
        if (tip) tip.remove();
        closeModal('profileModal');
    })
    .catch(function() {
        showToast((typeof t === 'function' ? t('common.network_error', null, '网络异常，请重试') : '网络异常，请重试'), 'error');
    });
}
window.handleChangeMyPassword = handleChangeMyPassword;

function handleSaveProfileWebhook(e) {
    if (e) e.preventDefault();
    var wb = document.getElementById('myWebhookUrl').value.trim();
    var btn = document.getElementById('btnSaveProfileWebhook');
    if (btn) btn.disabled = true;

    var fd = new FormData();
    fd.append('webhook_url', wb);

    apiFetch('profile_update_webhook', fd)
    .then(function(res) {
        if (btn) btn.disabled = false;
        if (res.success) {
            showToast((typeof t === 'function' ? t('profile.webhook_saved', null, '个人通知已保存') : '个人通知已保存'), 'success');
            markProfileSaved('profileWebhookForm', wb);
            if (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) {
                CURRENT_USER.webhook_url = wb;
                if (typeof syncAdminNotificationWebhookState === 'function') {
                    syncAdminNotificationWebhookState(CURRENT_USER.id, wb);
                }
            }
        } else {
            showToast(res.message || (typeof t === 'function' ? t('common.save_failed', null, '保存失败') : '保存失败'), 'error');
        }
    })
    .catch(function() {
        if (btn) btn.disabled = false;
        showToast((typeof t === 'function' ? t('common.network_error', null, '网络异常，请重试') : '网络异常，请重试'), 'error');
    });
}
window.handleSaveProfileWebhook = handleSaveProfileWebhook;

function testAnyWebhook(inputId, btnEl) {
    var input = document.getElementById(inputId);
    var url = input ? input.value.trim() : '';
    if (!url) {
        showToast((typeof t === 'function' ? t('profile.enter_webhook', null, '请先输入 Webhook 地址') : '请先输入 Webhook 地址'), 'warning');
        if (input) input.focus();
        return;
    }
    var origHtml = btnEl ? btnEl.innerHTML : '';
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> ' + esc(typeof t === 'function' ? t('common.sending', null, '发送中...') : '发送中...');
    }
    var restoreBtn = function() {
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.innerHTML = origHtml;
        }
    };
    var fd = new FormData();
    fd.append('url', url);
    apiFetch('test_webhook', fd).then(function(res) {
        restoreBtn();
        if (res.success) {
            showToast(res.message || (typeof t === 'function' ? t('profile.webhook_test_ok', null, '测试消息已送达') : '测试消息已送达'), 'success');
        } else {
            var reason = res.message || (typeof t === 'function' ? t('profile.webhook_timeout', null, '网络超时或地址无效') : '网络超时或地址无效');
            showToast((typeof t === 'function' ? t('profile.webhook_test_fail', {msg: reason}, '推送失败: ' + reason) : ('推送失败: ' + reason)), 'error');
        }
    }).catch(function() {
        restoreBtn();
        showToast((typeof t === 'function' ? t('common.network_req_error', null, '网络请求异常') : '网络请求异常'), 'error');
    });
}

// 全局 Linear 步进胶囊控制器辅助函数
window.stepNumberInput = function(id, delta, min, max) {
    var el = document.getElementById(id);
    if (!el) return;
    var cur = parseInt(el.value, 10);
    if (isNaN(cur)) cur = min || 1;
    var next = cur + delta;
    if (min !== undefined && next < min) next = min;
    if (max !== undefined && next > max) next = max;
    el.value = next;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
};

window.clampStepperInput = function(el, min, max) {
    if (!el) return;
    var cur = parseInt(el.value, 10);
    if (isNaN(cur) || cur < min) cur = min;
    if (max !== undefined && cur > max) cur = max;
    el.value = cur;
};

// 通用剪贴板复制工具 (全角色通用，保证 Viewer 等角色亦可正常复制外链)
function copyTextToClipboard(text, onSuccess) {
    if (!text) return Promise.resolve(false);
    function report(copied) {
        if (copied) {
            if (typeof onSuccess === 'function') onSuccess();
        } else {
            showToast((typeof t === 'function' ? t('workspace.copy_link_failed', null, '复制失败，请手动复制链接') : '复制失败，请手动复制链接'), 'error');
        }
        return copied;
    }
    function fallbackCopy() {
        var textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.className = 'clipboard-copy-source';
        document.body.appendChild(textarea);
        var copied = false;
        try {
            textarea.select();
            copied = document.execCommand('copy') === true;
        } catch(e) {
            copied = false;
        } finally {
            document.body.removeChild(textarea);
        }
        return report(copied);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(function() {
            return report(true);
        }, fallbackCopy);
    }
    return Promise.resolve(fallbackCopy());
}
window.copyTextToClipboard = copyTextToClipboard;

// 复制链接通用事件委托（数据与行为分离，防范属性拼接注入）
$(document).on('click', '.btn-copy-link', function(e) {
    e.preventDefault();
    var text = $(this).attr('data-copy-url') || $(this).data('copy-url');
    if (text) {
        copyTextToClipboard(text, function() {
            showToast((typeof t === 'function' ? t('common.link_copied', null, '链接已复制') : '链接已复制'), 'success');
        });
    }
});

// Axure 原型页面树全托管自适应层级编号 (方案 B，仅针对 Axure 原型生效)
function setupAxureSitemapAutoNumbering(targetWindow) {
    if (!targetWindow) return;
    var doc;
    try {
        doc = targetWindow.document;
        if (!doc) return;
    } catch(e) {
        return;
    }

    function isAxureEnvironment() {
        try {
            if (targetWindow.$axure || targetWindow['$axure']) return true;
            if (doc.getElementById('sitemapHost') || doc.getElementById('sitemapTreeContainer')) return true;
            if (doc.getElementById('leftPanel') || doc.getElementById('lsplitbar')) return true;
            if (doc.querySelector && doc.querySelector('.sitemapTree, .sitemapNode, .leftPanel, #lsplitbar, script[src*="axure"], script[src*="player"], link[href*="axure"]')) return true;
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
                    '.sitemapPageNameTag::before { content: attr(data-sitemap-page-name-tag); }' +
                    '.leftPanel.protoloft-panel-anim { transition: width 180ms cubic-bezier(0.2, 0, 0, 1) !important; }' +
                    '#lsplitbar.protoloft-panel-anim, #clippingBounds.protoloft-panel-anim { transition: left 180ms cubic-bezier(0.2, 0, 0, 1), width 180ms cubic-bezier(0.2, 0, 0, 1) !important; }';
                head.appendChild(styleEl);
            }
        } catch(e) {}
    }

    function setAnimClass(el, on) {
        if (!el) return;
        if (el.classList && typeof el.classList.add === 'function' && typeof el.classList.remove === 'function') {
            if (on) el.classList.add('protoloft-panel-anim');
            else el.classList.remove('protoloft-panel-anim');
        } else if (typeof el.className === 'string') {
            var cleaned = el.className.replace(/\bprotoloft-panel-anim\b/g, '').replace(/\s+/g, ' ').trim();
            el.className = on ? (cleaned ? cleaned + ' protoloft-panel-anim' : 'protoloft-panel-anim') : cleaned;
        }
    }

    function clearAnimState(leftPanel) {
        var clearTimer = (typeof targetWindow.clearTimeout === 'function') ? targetWindow.clearTimeout : (typeof clearTimeout === 'function' ? clearTimeout : null);
        if (leftPanel && leftPanel.__protoloftAnimTimer && clearTimer) {
            clearTimer(leftPanel.__protoloftAnimTimer);
            leftPanel.__protoloftAnimTimer = null;
        }
        setAnimClass(leftPanel, false);
        setAnimClass(doc.getElementById('lsplitbar'), false);
        setAnimClass(doc.getElementById('clippingBounds'), false);
    }

    function bindSplitbarWatch(leftPanel) {
        var splitbar = doc.getElementById('lsplitbar');
        if (!splitbar || splitbar.__protoloftWatched || typeof splitbar.addEventListener !== 'function') return;
        splitbar.__protoloftWatched = true;
        var markUser = function() {
            leftPanel.__protoloftUserResized = true;
            clearAnimState(leftPanel);
            var jq = targetWindow.jQuery || targetWindow.$;
            if (jq && typeof jq === 'function') {
                try { jq('.leftPanel, #lsplitbar, #clippingBounds').stop(true, false); } catch(e) {}
            }
        };
        splitbar.addEventListener('mousedown', markUser);
        splitbar.addEventListener('pointerdown', markUser);
    }

    function getPanelMaxWidth(vw) {
        return vw > 0 ? Math.max(220, Math.min(340, Math.floor(vw * 0.28))) : 340;
    }

    function computeDesiredLeftWidth(leftPanel, vw) {
        var treeUl = doc.querySelector('#sitemapTreeContainer ul.sitemapTree') || doc.querySelector('.sitemapTree');
        var treeContainer = doc.getElementById('sitemapTreeContainer') || (treeUl ? treeUl.parentElement : null);
        if (!treeUl || !treeContainer) return 0;

        var curW = leftPanel.offsetWidth || 0;
        var wasHidden = curW < 180;
        var saved = null;
        if (wasHidden && leftPanel.style) {
            saved = {
                display: leftPanel.style.display || '',
                visibility: leftPanel.style.visibility || '',
                position: leftPanel.style.position || '',
                left: leftPanel.style.left || '',
                top: leftPanel.style.top || '',
                width: leftPanel.style.width || ''
            };
            leftPanel.style.position = 'fixed';
            leftPanel.style.left = '-9999px';
            leftPanel.style.top = '0px';
            leftPanel.style.visibility = 'hidden';
            leftPanel.style.display = 'block';
            leftPanel.style.width = '220px';
        }
        try {
            var baseW = wasHidden ? 220 : curW;
            var contentW = Math.max(treeContainer.scrollWidth || 0, treeUl.scrollWidth || 0);
            var clientW = treeContainer.clientWidth || baseW;
            if (contentW <= clientW) return baseW;
            var scrollbarW = Math.max(0, (treeContainer.offsetWidth || 0) - clientW);
            var desiredW = Math.ceil(contentW + scrollbarW + 10);
            var minW = Math.max(220, leftPanel.__protoloftAppliedWidth || baseW);
            return Math.max(minW, Math.min(desiredW, getPanelMaxWidth(vw)));
        } finally {
            if (saved) {
                leftPanel.style.display = saved.display;
                leftPanel.style.visibility = saved.visibility;
                leftPanel.style.position = saved.position;
                leftPanel.style.left = saved.left;
                leftPanel.style.top = saved.top;
                leftPanel.style.width = saved.width;
            }
        }
    }

    function applyWidthSync(leftPanel, targetW, axObj) {
        clearAnimState(leftPanel);
        leftPanel.style.width = targetW + 'px';
        leftPanel.__protoloftAppliedWidth = targetW;
        leftPanel.__protoloftHasFitted = true;
        var splitbar = doc.getElementById('lsplitbar');
        if (splitbar) splitbar.style.left = (targetW - 4) + 'px';
        if (axObj && axObj.player && typeof axObj.player.resizeContent === 'function') {
            axObj.player.resizeContent();
        }
    }

    function applyWidthSmooth(leftPanel, targetW, vw, axObj) {
        var setTimer = (typeof targetWindow.setTimeout === 'function') ? targetWindow.setTimeout : (typeof setTimeout === 'function' ? setTimeout : null);
        if (!setTimer) {
            applyWidthSync(leftPanel, targetW, axObj);
            return;
        }
        clearAnimState(leftPanel);
        var splitbar = doc.getElementById('lsplitbar');
        var clipBounds = doc.getElementById('clippingBounds');
        setAnimClass(leftPanel, true);
        setAnimClass(splitbar, true);
        setAnimClass(clipBounds, true);
        void leftPanel.offsetWidth;

        leftPanel.style.width = targetW + 'px';
        leftPanel.__protoloftAppliedWidth = targetW;
        leftPanel.__protoloftHasFitted = true;
        if (splitbar && splitbar.style) splitbar.style.left = (targetW - 4) + 'px';
        if (clipBounds && clipBounds.style && vw > 0) {
            var rightEl = doc.querySelector ? doc.querySelector('.rightPanel') : null;
            var rightW = (rightEl && rightEl.offsetWidth) ? rightEl.offsetWidth : 0;
            clipBounds.style.left = targetW + 'px';
            clipBounds.style.width = Math.max(0, vw - targetW - rightW) + 'px';
        }
        leftPanel.__protoloftAnimTimer = setTimer(function() {
            clearAnimState(leftPanel);
            if (!leftPanel.__protoloftUserResized && axObj && axObj.player && typeof axObj.player.resizeContent === 'function') {
                axObj.player.resizeContent();
            }
        }, 210);
    }

    function preSyncExpandWidth(leftPanel, vw, axObj) {
        var targetW = computeDesiredLeftWidth(leftPanel, vw);
        if (!(targetW > 220)) return targetW;
        if (axObj && axObj.player && typeof axObj.player.resizeContent === 'function' && leftPanel.style) {
            var saved = {
                display: leftPanel.style.display || '',
                visibility: leftPanel.style.visibility || '',
                position: leftPanel.style.position || '',
                left: leftPanel.style.left || '',
                top: leftPanel.style.top || '',
                width: leftPanel.style.width || ''
            };
            try {
                leftPanel.style.position = 'fixed';
                leftPanel.style.left = '-9999px';
                leftPanel.style.top = '0px';
                leftPanel.style.visibility = 'hidden';
                leftPanel.style.display = 'block';
                leftPanel.style.width = targetW + 'px';
                axObj.player.resizeContent(true);
            } finally {
                leftPanel.style.display = saved.display;
                leftPanel.style.visibility = saved.visibility;
                leftPanel.style.position = saved.position;
                leftPanel.style.left = saved.left;
                leftPanel.style.top = saved.top;
                leftPanel.style.width = saved.width;
            }
        }
        leftPanel.__protoloftAppliedWidth = targetW;
        leftPanel.__protoloftHasFitted = true;
        return targetW;
    }

    function hookExpandFromBar() {
        var axObj = targetWindow.$axure;
        if (!axObj || !axObj.player || typeof axObj.player.expandFromBar !== 'function') return;
        if (axObj.player.expandFromBar.__protoloftWrapped) return;
        var origExpand = axObj.player.expandFromBar;
        var wrappedExpand = function(hostId, context) {
            try {
                if (context === 'project') {
                    var leftPanel = (doc.querySelector && doc.querySelector('.leftPanel')) || doc.getElementById('leftPanel');
                    if (leftPanel) bindSplitbarWatch(leftPanel);
                    var mobile = doc.body && doc.body.classList && doc.body.classList.contains('mobileMode');
                    var vw = targetWindow.innerWidth || (doc.documentElement && doc.documentElement.clientWidth) || 0;
                    var splitbar = doc.getElementById('lsplitbar');
                    var barHidden = !splitbar || !(splitbar.offsetWidth > 0 || splitbar.offsetHeight > 0);
                    if (leftPanel && !leftPanel.__protoloftUserResized && !mobile && !(vw > 0 && vw < 720) && !(leftPanel.classList && leftPanel.classList.contains('popup')) && barHidden) {
                        run();
                        preSyncExpandWidth(leftPanel, vw, axObj);
                    }
                }
            } catch(e) {}
            return origExpand.apply(this, arguments);
        };
        wrappedExpand.__protoloftWrapped = true;
        axObj.player.expandFromBar = wrappedExpand;
    }

    function fitLeftPanelWidth() {
        try {
            hookExpandFromBar();
            if (!doc.body || (doc.body.classList && doc.body.classList.contains('mobileMode'))) return false;
            var leftPanel = (doc.querySelector && doc.querySelector('.leftPanel')) || doc.getElementById('leftPanel');
            if (!leftPanel) return false;
            bindSplitbarWatch(leftPanel);
            if (leftPanel.__protoloftUserResized) return true;
            if (leftPanel.classList && leftPanel.classList.contains('popup')) return false;
            var vw = targetWindow.innerWidth || (doc.documentElement && doc.documentElement.clientWidth) || 0;
            if (vw > 0 && vw < 720) return false;
            var axObj = targetWindow.$axure;
            var curW = leftPanel.offsetWidth || 0;
            if (curW < 180) {
                preSyncExpandWidth(leftPanel, vw, axObj);
                return false;
            }
            var targetW = computeDesiredLeftWidth(leftPanel, vw);
            if (!targetW) return false;
            if (targetW <= curW + 2) {
                if (!leftPanel.__protoloftAppliedWidth) leftPanel.__protoloftAppliedWidth = curW;
                leftPanel.__protoloftHasFitted = true;
                return true;
            }
            var jq = targetWindow.jQuery || targetWindow.$;
            var marginL = leftPanel.style && leftPanel.style.marginLeft ? parseFloat(leftPanel.style.marginLeft) : 0;
            var isSlidingIn = (marginL < -1) || !!(jq && typeof jq === 'function' && jq(leftPanel).is && jq(leftPanel).is(':animated'));
            if (isSlidingIn && jq && typeof jq === 'function') {
                try {
                    jq('#clippingBoundsScrollContainer').stop(false, true);
                    jq(leftPanel).stop(true, false);
                    jq('#lsplitbar').stop(true, false);
                    jq('#clippingBounds').stop(true, false);
                    leftPanel.style.width = targetW + 'px';
                    leftPanel.__protoloftAppliedWidth = targetW;
                    leftPanel.__protoloftHasFitted = true;
                    var rightEl = doc.querySelector ? doc.querySelector('.rightPanel') : null;
                    var rightW = (rightEl && rightEl.offsetWidth) ? rightEl.offsetWidth : 0;
                    var clipW = vw > 0 ? Math.max(0, vw - targetW - rightW) : 0;
                    jq(leftPanel).animate({ 'margin-left': '0px' }, { duration: 140, complete: function() { leftPanel.style.marginLeft = ''; } });
                    jq('#lsplitbar').animate({ left: (targetW - 4) + 'px' }, { duration: 140 });
                    var clipTarget = vw > 0 ? { left: targetW + 'px', width: clipW + 'px' } : { left: targetW + 'px' };
                    jq('#clippingBounds').animate(clipTarget, { duration: 140, complete: function() {
                        if (!leftPanel.__protoloftUserResized && axObj && axObj.player && typeof axObj.player.resizeContent === 'function') {
                            axObj.player.resizeContent();
                        }
                    }});
                    return true;
                } catch(e) {}
            }
            applyWidthSmooth(leftPanel, targetW, vw, axObj);
            return true;
        } catch(e) { return false; }
    }

    function run() {
        if (!isAxureEnvironment()) return false;
        injectCompactStyles();
        var treeUl = doc.querySelector('#sitemapTreeContainer ul.sitemapTree') || doc.querySelector('.sitemapTree');
        if (!treeUl || !treeUl.children.length) return false;
        walkUl(treeUl, '');
        return true;
    }

    function runAndFit() {
        hookExpandFromBar();
        var seqOk = run();
        var fitOk = seqOk ? fitLeftPanelWidth() : false;
        return seqOk && fitOk;
    }

    var doneInitial = runAndFit();
    if (!doneInitial) {
        var attempts = 0;
        var timer = setInterval(function() {
            attempts++;
            if (runAndFit() || attempts >= 45) {
                clearInterval(timer);
            }
        }, 60);
    }

    try {
        var host = doc.getElementById('sitemapHost') || doc.getElementById('sitemapTreeContainer') || doc.body;
        if (host && targetWindow.MutationObserver && !host.__autonumObserved) {
            host.__autonumObserved = true;
            var deb = null;
            var obs = new targetWindow.MutationObserver(function(muts) {
                var hit = false;
                var needFitOnly = false;
                for (var m = 0; m < muts.length; m++) {
                    var t = muts[m].target;
                    if (!t || t.nodeType !== 1) continue;
                    if (muts[m].type === 'attributes') {
                        if (t.tagName === 'UL' || t.classList.contains('sitemapTree')) { needFitOnly = true; }
                    } else if (t.classList.contains('sitemapTree') || t.classList.contains('sitemapNode') || t.id === 'sitemapTreeContainer') {
                        hit = true; break;
                    }
                }
                if (hit || needFitOnly) {
                    if (deb) clearTimeout(deb);
                    deb = setTimeout(function() {
                        if (hit) run();
                        fitLeftPanelWidth();
                    }, 120);
                }
            });
            obs.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
        }
    } catch(e) {}
}

if (typeof window !== 'undefined') {
    window.setupAxureSitemapAutoNumbering = setupAxureSitemapAutoNumbering;
    if (typeof document !== 'undefined') {
        var bindAxureAutoNum = function() {
            var iframe = document.getElementById('myFrame');
            if (iframe) {
                iframe.addEventListener('load', function() {
                    try {
                        if (this.contentWindow) {
                            setupAxureSitemapAutoNumbering(this.contentWindow);
                        }
                    } catch(e) {}
                });
            }
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bindAxureAutoNum);
        } else {
            bindAxureAutoNum();
        }
    }
}

/* 个人中心头像：8 个造型与独立配色，选择即保存（仅限 #profileModal 内）。 */
var pendingProfileAvatar = '';
var profileAvatarSaving = false;
var profileAvatarTheme = 'sky';

function getSavedProfileAvatar() {
    var raw = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) ? CURRENT_USER.avatar : '';
    var seed = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) ? CURRENT_USER.id : 0;
    if (typeof window !== 'undefined' && window.ProfileAvatars) {
        return window.ProfileAvatars.normalizeId(raw, seed);
    }
    return raw || 'leap-sky';
}

function renderMyProfileAvatar(avatarId) {
    var box = document.getElementById('myProfileAvatarGraphic');
    if (!box || typeof window === 'undefined' || !window.ProfileAvatars) return;
    var seed = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) ? CURRENT_USER.id : 0;
    var resolved = window.ProfileAvatars.normalizeId(avatarId || pendingProfileAvatar || getSavedProfileAvatar(), seed);
    box.innerHTML = window.ProfileAvatars.renderSvg(resolved, seed);
    var btn = document.getElementById('myProfileAvatarBtn');
    if (btn) {
        var meta = window.ProfileAvatars.getMeta(resolved, seed);
        btn.title = (typeof t === 'function' ? t('avatar.title_current', { label: meta.label }, '更换头像（当前：' + meta.label + '）') : '更换头像（当前：' + meta.label + '）');
    }
}

function updateProfileAvatarPickerState(selectedId) {
    var meta = window.ProfileAvatars.getMeta(selectedId);
    selectedId = meta.id;
    pendingProfileAvatar = selectedId;
    if (meta.poseId !== 'leap') profileAvatarTheme = meta.themeId;
    var grid = document.getElementById('profileAvatarGrid');
    if (grid) {
        var options = grid.querySelectorAll('.profile-avatar-option');
        for (var i = 0; i < options.length; i++) {
            var opt = options[i];
            var poseId = opt.getAttribute('data-avatar-pose');
            var isSelected = poseId === meta.poseId;
            opt.classList.toggle('is-selected', isSelected);
            opt.setAttribute('aria-checked', isSelected ? 'true' : 'false');
            opt.tabIndex = isSelected ? 0 : -1;
            opt.querySelector('.profile-avatar-thumb').innerHTML = window.ProfileAvatars.renderSvg(poseId + '-' + (poseId === 'leap' ? 'sky' : profileAvatarTheme));
        }
    }
    var colors = document.getElementById('profileAvatarColors');
    if (colors) colors.hidden = meta.poseId === 'leap';
    var colorGrid = document.getElementById('profileAvatarColorGrid');
    if (colorGrid) {
        var swatches = colorGrid.querySelectorAll('.profile-avatar-color');
        for (var c = 0; c < swatches.length; c++) {
            var active = swatches[c].getAttribute('data-avatar-theme') === profileAvatarTheme;
            swatches[c].classList.toggle('is-selected', active);
            swatches[c].setAttribute('aria-checked', active ? 'true' : 'false');
            swatches[c].tabIndex = active ? 0 : -1;
        }
    }
    var tag = document.getElementById('profileAvatarPreviewLabel');
    if (tag && window.ProfileAvatars) {
        tag.textContent = meta.label;
    }
    renderMyProfileAvatar(selectedId);
}

function selectProfileAvatar(selectedId) {
    updateProfileAvatarPickerState(selectedId);
    saveProfileAvatar();
}

function ensureProfileAvatarGrid() {
    var grid = document.getElementById('profileAvatarGrid');
    if (!grid || typeof window === 'undefined' || !window.ProfileAvatars) return;
    if (!grid.getAttribute('data-built')) {
        var poses = window.ProfileAvatars.POSES;
        var html = [];
        for (var i = 0; i < poses.length; i++) {
            var pose = poses[i];
            html.push(
                '<button type="button" class="profile-avatar-option" role="radio" aria-checked="false" ' +
                'data-avatar-pose="' + pose.id + '" title="' + pose.name + '" aria-label="' + pose.name + '" tabindex="-1">' +
                '<span class="profile-avatar-thumb"></span><span class="profile-avatar-option-name">' + pose.name + '</span>' +
                '</button>'
            );
        }
        grid.innerHTML = html.join('');
        grid.setAttribute('data-built', '1');
        grid.addEventListener('click', function(ev) {
            var target = ev.target && ev.target.closest ? ev.target.closest('.profile-avatar-option') : null;
            if (!target) return;
            // 重绘缩略图会替换点击的 SVG 节点，阻止其被外部点击守卫误判。
            ev.stopPropagation();
            var poseId = target.getAttribute('data-avatar-pose');
            if (poseId) selectProfileAvatar(poseId + '-' + (poseId === 'leap' ? 'sky' : profileAvatarTheme));
        });
        grid.addEventListener('keydown', function(ev) {
            var poses = window.ProfileAvatars.POSES;
            var meta = window.ProfileAvatars.getMeta(pendingProfileAvatar || getSavedProfileAvatar());
            var curIdx = -1;
            for (var i = 0; i < poses.length; i++) if (poses[i].id === meta.poseId) curIdx = i;
            if (curIdx < 0) curIdx = 0;
            var nextIdx = curIdx;
            if (ev.key === 'ArrowRight') nextIdx = (curIdx + 1) % poses.length;
            else if (ev.key === 'ArrowLeft') nextIdx = (curIdx - 1 + poses.length) % poses.length;
            else if (ev.key === 'ArrowDown') nextIdx = (curIdx + 4) % poses.length;
            else if (ev.key === 'ArrowUp') nextIdx = (curIdx - 4 + poses.length) % poses.length;
            else if (ev.key === 'Home') nextIdx = 0;
            else if (ev.key === 'End') nextIdx = poses.length - 1;
            else return;
            ev.preventDefault();
            var poseId = poses[nextIdx].id;
            selectProfileAvatar(poseId + '-' + (poseId === 'leap' ? 'sky' : profileAvatarTheme));
            var nextBtn = grid.querySelector('[data-avatar-pose="' + poseId + '"]');
            if (nextBtn) nextBtn.focus();
        });
    }
    var colorGrid = document.getElementById('profileAvatarColorGrid');
    if (colorGrid && !colorGrid.getAttribute('data-built')) {
        var themes = window.ProfileAvatars.THEMES;
        var colorsHtml = [];
        for (var c = 0; c < themes.length; c++) {
            colorsHtml.push('<button type="button" class="profile-avatar-color" role="radio" aria-checked="false" data-avatar-theme="' + themes[c].id + '" aria-label="' + themes[c].name + '" title="' + themes[c].name + '" tabindex="-1"></button>');
        }
        colorGrid.innerHTML = colorsHtml.join('');
        colorGrid.setAttribute('data-built', '1');
        colorGrid.addEventListener('click', function(ev) {
            var target = ev.target && ev.target.closest ? ev.target.closest('.profile-avatar-color') : null;
            if (!target) return;
            ev.stopPropagation();
            var meta = window.ProfileAvatars.getMeta(pendingProfileAvatar || getSavedProfileAvatar());
            if (meta.poseId === 'leap') return;
            selectProfileAvatar(meta.poseId + '-' + target.getAttribute('data-avatar-theme'));
        });
        colorGrid.addEventListener('keydown', function(ev) {
            var themes = window.ProfileAvatars.THEMES;
            var idx = 0;
            for (var i = 0; i < themes.length; i++) if (themes[i].id === profileAvatarTheme) idx = i;
            if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') idx = (idx + 1) % themes.length;
            else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') idx = (idx - 1 + themes.length) % themes.length;
            else if (ev.key === 'Home') idx = 0;
            else if (ev.key === 'End') idx = themes.length - 1;
            else return;
            ev.preventDefault();
            var button = colorGrid.querySelector('[data-avatar-theme="' + themes[idx].id + '"]');
            if (button) { button.click(); button.focus(); }
        });
    }
    if (!grid._outsideBound) {
        grid._outsideBound = true;
        document.addEventListener('click', function(ev) {
            var pop = document.getElementById('profileAvatarPopover');
            if (!pop || pop.hidden) return;
            var btn = document.getElementById('myProfileAvatarBtn');
            if (pop.contains(ev.target) || (btn && btn.contains(ev.target))) return;
            closeProfileAvatarPicker();
        });
    }
}

function openProfileAvatarPicker() {
    var pop = document.getElementById('profileAvatarPopover');
    var btn = document.getElementById('myProfileAvatarBtn');
    if (!pop || typeof window === 'undefined' || !window.ProfileAvatars) return;
    ensureProfileAvatarGrid();
    updateProfileAvatarPickerState(profileAvatarSaving && pendingProfileAvatar ? pendingProfileAvatar : getSavedProfileAvatar());
    pop.hidden = false;
    if (btn) btn.setAttribute('aria-expanded', 'true');
    var activeOpt = pop.querySelector('.profile-avatar-option.is-selected');
    if (activeOpt) activeOpt.focus();
}

function closeProfileAvatarPicker() {
    var pop = document.getElementById('profileAvatarPopover');
    var btn = document.getElementById('myProfileAvatarBtn');
    if (pop) pop.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function toggleProfileAvatarPicker(event) {
    if (event) event.stopPropagation();
    var pop = document.getElementById('profileAvatarPopover');
    if (!pop) return;
    if (pop.hidden) openProfileAvatarPicker();
    else closeProfileAvatarPicker();
}

function profileAvatarSaveFailed(targetId, message) {
    if (pendingProfileAvatar === targetId) {
        updateProfileAvatarPickerState(getSavedProfileAvatar());
        showToast(message, 'error');
    } else {
        // 旧选择失败时继续保存用户的最后选择。
        saveProfileAvatar();
    }
}

function syncProfileAvatarSavingState() {
    var btn = document.getElementById('myProfileAvatarBtn');
    if (btn) btn.setAttribute('aria-busy', profileAvatarSaving ? 'true' : 'false');
}

function saveProfileAvatar() {
    if (profileAvatarSaving) return;
    var targetId = pendingProfileAvatar;
    var saved = getSavedProfileAvatar();
    if (!targetId || targetId === saved) return;
    profileAvatarSaving = true;
    syncProfileAvatarSavingState();

    var fd = new FormData();
    fd.append('avatar', targetId);
    // 选项始终可操作；一次只保存一个请求，中间选择合并为最后一项。
    apiFetch('profile_update_avatar', fd, false)
    .then(function(res) {
        profileAvatarSaving = false;
        if (!res || !res.success) {
            profileAvatarSaveFailed(targetId, (res && res.message) ? res.message : (typeof t === 'function' ? t('avatar.save_failed', null, '头像保存失败，请重试') : '头像保存失败，请重试'));
            syncProfileAvatarSavingState();
            return;
        }
        var confirmed = (res.data && res.data.avatar) ? res.data.avatar : targetId;
        if (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) {
            CURRENT_USER.avatar = confirmed;
        }
        if (pendingProfileAvatar === targetId) updateProfileAvatarPickerState(confirmed);
        saveProfileAvatar();
        syncProfileAvatarSavingState();
    }, function() {
        profileAvatarSaving = false;
        profileAvatarSaveFailed(targetId, (typeof t === 'function' ? t('avatar.network_failed', null, '网络异常，头像未保存，请重试') : '网络异常，头像未保存，请重试'));
        syncProfileAvatarSavingState();
    });
}

if (typeof window !== 'undefined') {
    window.renderMyProfileAvatar = renderMyProfileAvatar;
    window.toggleProfileAvatarPicker = toggleProfileAvatarPicker;
    window.openProfileAvatarPicker = openProfileAvatarPicker;
    window.closeProfileAvatarPicker = closeProfileAvatarPicker;
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() { renderMyProfileAvatar(); });
        } else {
            renderMyProfileAvatar();
        }
    }
}
