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
                catch (e) { throw new Error('服务响应异常 (HTTP ' + response.status + ')'); }
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
            '<span class="toast-close" title="关闭"><i class="ri-close-line"></i></span>' +
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
    var title = options.title || '确认操作';
    var message = options.message || '';
    var confirmText = options.confirmText || '确定';
    var cancelText = options.cancelText || '取消';
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

// 工作台目录树动效规范：折叠与展开由 toggleCategory 原生精确控制，不挂载外部绝对定位重排
function initWorkbenchFluidAnimations() {
    // No-op: 遵循 Linear 原则，目录树采用原生 CSS/WAAPI 驱动，避免双重过渡抖动
}
window.initWorkbenchFluidAnimations = initWorkbenchFluidAnimations;

$(document).ready(function() {
    initWorkbenchFluidAnimations();
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

    initHashRoute();

    // 全局防泄密水印初始就绪
    if (typeof GLOBAL_WATERMARK_ENABLED !== 'undefined' && GLOBAL_WATERMARK_ENABLED) {
        renderWorkspaceWatermark(true);
    }
});

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
                window.open(linkHref, '_blank');
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
        $barVer.hide();
        $barVerSelect.empty();
        for (var i = 0; i < versions.length; i++) {
            var v = versions[i];
            var $opt = $('<option>')
                .val(v.entry_file)
                .text(v.version_name)
                .attr('data-ver-id', v.id)
                .attr('data-ver', v.version_name)
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
        $barVer.html('<i class="ri-git-branch-line"></i> ' + esc(versions[0].version_name)).show();
    } else {
        $barVerSelect.hide();
        if (typeof syncVersionPicker === 'function') syncVersionPicker('barVerSelect');
        $barVer.hide();
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

    // 格式化输出: @张三三 · 更新于 2026-10-26 08:58:03
    var metaHtml = '';
    if (authorName && time) {
        metaHtml = '<i class="ri-user-line" style="margin-right:3px;font-size:12px;opacity:0.85;"></i>@' + esc(authorName) + ' · 更新于 ' + esc(time);
    } else if (authorName) {
        metaHtml = '<i class="ri-user-line" style="margin-right:3px;font-size:12px;opacity:0.85;"></i>@' + esc(authorName);
    } else if (time) {
        metaHtml = '<i class="ri-time-line" style="margin-right:3px;font-size:12px;opacity:0.85;"></i>更新于 ' + esc(time);
    }

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
        var safeName = esc(name || '外部链接');
        $('#noVersionPlaceholder').html(
            '<div class="empty-state-box" style="max-width:520px;padding:40px 24px;">' +
                '<div style="width:56px;height:56px;border-radius:14px;background:var(--primary-subtle);color:var(--primary);display:inline-flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:16px;">' +
                    '<i class="ri-external-link-line"></i>' +
                '</div>' +
                '<div class="empty-state-title" style="font-size:16px;color:var(--text-1);margin-bottom:8px;">' + safeName + '</div>' +
                '<div style="font-size:12px;color:var(--text-3);margin-bottom:14px;">此项目配置为在新标签页中打开的外部链接资产</div>' +
                '<div style="word-break:break-all;color:var(--text-2);font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;background:var(--canvas);padding:10px 14px;border-radius:6px;border:1px solid var(--border);margin-bottom:20px;text-align:left;">' +
                    safeHref +
                '</div>' +
                '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">' +
                    '<a href="' + safeHref + '" target="_blank" rel="noopener noreferrer" class="btn-primary btn-md" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;">' +
                        '<i class="ri-external-link-line"></i> 在新标签页打开' +
                    '</a>' +
                    '<button type="button" class="btn-cancel btn-md btn-copy-link" data-copy-url="' + safeHref + '">' +
                        '<i class="ri-file-copy-line"></i> 复制链接' +
                    '</button>' +
                '</div>' +
            '</div>'
        ).show();
    } else if (href) {
        $('#placeholder').hide();
        $('#noVersionPlaceholder').hide();
        $('#myFrame').show();
        var sep = href.indexOf('?') > -1 ? '&' : '?';
        $('#myFrame').attr('src', href + sep + 't=' + new Date().getTime());
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
        var actionHtml = isCanManage
            ? '<div class="empty-state-actions"><button type="button" class="empty-state-btn" onclick="openUploadModal(' + itemId + ')"><i class="ri-upload-cloud-line"></i> 发布原型</button></div>'
            : '';
        $('#noVersionPlaceholder').html(
            '<div class="empty-state-box">' +
                '<div class="empty-state-illustration">' +
                    '<svg width="156" height="120" viewBox="0 0 156 120" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                        '<line x1="12" y1="94" x2="144" y2="94" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3 3"/>' +
                        '<circle cx="18" cy="94" r="2" fill="#cbd5e1"/>' +
                        '<circle cx="138" cy="94" r="2" fill="#cbd5e1"/>' +
                        '<path d="M120 28 C 95 16, 68 28, 48 48" stroke="#ff5d47" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="2.5 4" opacity="0.65"/>' +
                        '<circle cx="78" cy="27" r="1.5" fill="#ff5d47" opacity="0.7"/>' +
                        '<g transform="translate(18, 42)">' +
                            '<rect x="0" y="8" width="52" height="44" rx="8" fill="#ffffff" stroke="#94a3b8" stroke-width="1.5"/>' +
                            '<rect x="6" y="14" width="40" height="32" rx="5" fill="#f8fafc" stroke="#0076de" stroke-width="1.2" stroke-dasharray="3 3"/>' +
                            '<g transform="translate(26, 30)">' +
                                '<circle cx="0" cy="0" r="11" fill="#0076de"/>' +
                                '<path d="M0 -5 L-5 0 H-2 V5 H2 V0 H5 Z" fill="#ffffff"/>' +
                            '</g>' +
                            '<line x1="26" y1="13" x2="26" y2="7" stroke="#0076de" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="1.5 2.5"/>' +
                        '</g>' +
                        '<g transform="translate(74, 18) scale(0.64)">' +
                            '<polygon points="16.3,51.15 16.64,59.63 9.89,65.51" fill="#68b5f8" />' +
                            '<polygon points="17.51,75.89 18.2,89.21 3.32,85.06" fill="#68b5f8" />' +
                            '<polygon points="2.97,86.97 11.97,89.21 6.61,96.48" fill="#68b5f8" />' +
                            '<polygon points="17.85,49.42 34.46,31.78 31.87,78.66 19.76,88.52" fill="#0076de" />' +
                            '<polygon points="36.71,31.43 64.22,34.72 54.36,47.35 33.77,76.93" fill="#0076de" />' +
                            '<polygon points="57.47,50.46 57.47,78.49 36.71,76.24" fill="#68b5f8" />' +
                            '<polygon points="59.2,49.94 76.85,60.67 68.02,99.94 59.2,107.55" fill="#0076de" />' +
                            '<polygon points="68.2,102.02 71.31,108.59 60.58,108.59" fill="#0076de" />' +
                            '<polygon points="77.71,67.76 88.26,79.01 81.0,84.72 74.6,80.91" fill="#68b5f8" />' +
                            '<polygon points="88.96,80.39 88.44,95.1 79.44,91.98 82.21,86.45" fill="#0076de" />' +
                            '<polygon points="72.69,28.66 80.82,60.5 57.12,46.48" fill="#68b5f8" />' +
                            '<polygon points="74.77,28.49 86.19,28.49 96.05,34.72 108.68,62.75 96.05,57.73 93.63,53.23 97.26,62.57 81.86,57.21" fill="#0076de" />' +
                            '<polygon points="105.74,52.19 120.44,56.0 110.41,62.92" fill="#68b5f8" />' +
                            '<polygon points="112.48,52.19 122.0,42.85 120.79,54.44" fill="#0076de" />' +
                            '<polygon points="113.69,35.76 121.31,41.64 117.33,45.27 116.12,45.96" fill="#68b5f8" />' +
                            '<polygon points="114.04,33.85 116.81,31.09 117.67,36.8" fill="#68b5f8" />' +
                            '<polygon points="118.02,30.74 122.52,30.74 118.71,34.72" fill="#0076de" />' +
                            '<circle cx="120.27" cy="24.17" r="10" fill="#ff5d47" fill-opacity="0.16" />' +
                            '<circle cx="120.27" cy="24.17" r="4.8" fill="#ff5d47" />' +
                        '</g>' +
                    '</svg>' +
                '</div>' +
                '<div class="empty-state-title">坑位已占，图纸未到</div>' +
                '<div class="empty-state-desc">研发点进来直挠头。丢个 ZIP 上来，马上开工！</div>' +
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

    var $item = $('#item-node-' + currentSelectedItemId);
    $item.data('href', href).data('ver', ver).data('ver-id', verId).data('rp', rp).data('time', time).data('token', token).data('share-code', shareCode);

    var metaHtml = '';
    if (author && time) {
        metaHtml = '<i class="ri-user-line" style="margin-right:3px;font-size:12px;opacity:0.85;"></i>@' + esc(author) + ' · 更新于 ' + esc(time);
    } else if (author) {
        metaHtml = '<i class="ri-user-line" style="margin-right:3px;font-size:12px;opacity:0.85;"></i>@' + esc(author);
    } else if (time) {
        metaHtml = '<i class="ri-time-line" style="margin-right:3px;font-size:12px;opacity:0.85;"></i>更新于 ' + esc(time);
    }

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
        var sep = href.indexOf('?') > -1 ? '&' : '?';
        $('#myFrame').attr('src', href + sep + 't=' + new Date().getTime());

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
        $btnAnnotation.prop('disabled', false).removeClass('is-disabled').attr('title', '页面批注与协作讨论 (快捷键 C)');
        $btnShare.prop('disabled', false).removeClass('is-disabled').attr('title', '外发分享设置');
        $('#btnUploadRpQuick').hide();

        if (hasActiveVersion) {
            // 内嵌 iframe 预览模式：刷新与全屏可用
            $btnReload.prop('disabled', false).removeClass('is-disabled').attr('title', '刷新当前网页');
            $btnFullscreen.prop('disabled', false).removeClass('is-disabled').attr('title', '全屏预览');
        } else {
            // 新标签页落地卡片模式：刷新与全屏按需禁用
            $btnReload.prop('disabled', true).addClass('is-disabled').attr('title', '外部链接资产');
            $btnFullscreen.prop('disabled', true).addClass('is-disabled').attr('title', '外部链接资产');
        }
        return;
    }

    if (hasActiveVersion) {
        $actions.prop('disabled', false).removeClass('is-disabled');
        $btnAnnotation.attr('title', '页面批注与协作讨论 (快捷键 C)');
        $btnShare.attr('title', '外发分享设置');
        $btnReload.attr('title', '刷新当前原型');
        $btnFullscreen.attr('title', '全屏预览');
    } else {
        $actions.prop('disabled', true).addClass('is-disabled');
        $('#btnUploadRpQuick').hide();
        $btnAnnotation.attr('title', '暂无原型版本，无法发起批注');
        $btnShare.attr('title', '暂无原型版本，无法外发分享');
        $btnReload.attr('title', '暂无原型页面');
        $btnFullscreen.attr('title', '暂无原型页面');

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
        showToast('请先在左侧选择一个原型项目', 'info');
        return;
    }

    if (!$('body').hasClass('can-share')) {
        showToast('外发分享功能已关闭或当前账号无权分享', 'warning');
        return;
    }

    var $item = $('#item-node-' + targetId);
    if ($item.length && !$item.data('href')) {
        showToast('当前项目尚未发布任何版本，暂无法分享', 'info');
        return;
    }

    // 未登录人员严禁获取或分享直链
    if (typeof openShareModal !== 'function' || !document.getElementById('shareManageModal')) {
        showToast('访客无权分享原型，请先登录账号', 'info');
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
    // 中断可能正在运行的动画并捕获当前实际瞬时高度，彻底清除内联样式残留
    if (items._currentAnim) {
        var rect = items.getBoundingClientRect();
        currentHeight = rect.height > 0 ? Math.round(rect.height) : 0;
        try { items._currentAnim.cancel(); } catch(err) {}
        items._currentAnim = null;
        items.style.height = '';
        items.style.overflow = '';
        items.style.display = '';
    }

    var isCollapsed = group.classList.contains('collapsed');
    var easing = 'cubic-bezier(0.16, 1, 0.3, 1)';
    var duration = 180;

    var cleanUp = function() {
        items.style.height = '';
        items.style.overflow = '';
        items.style.display = '';
        items._currentAnim = null;
    };

    if (isCollapsed) {
        // 展开流程：平滑滑出展开
        group.classList.remove('collapsed');
        items.style.display = 'block';
        items.style.overflow = 'hidden';
        var targetHeight = items.scrollHeight;
        var startH = currentHeight > 0 ? currentHeight : 0;

        var anim = items.animate([
            { height: startH + 'px', opacity: startH > 0 ? Math.min(1, startH / Math.max(1, targetHeight)) : 0 },
            { height: targetHeight + 'px', opacity: 1 }
        ], {
            duration: Math.max(80, Math.round(duration * (1 - startH / Math.max(1, targetHeight)))),
            easing: easing
        });
        items._currentAnim = anim;

        anim.onfinish = function() {
            cleanUp();
        };
        anim.oncancel = function() {
            cleanUp();
        };
    } else {
        // 收起流程：从当前实际高度平滑卷缩收拢，消除全高突变
        var startHeight = currentHeight > 0 ? currentHeight : items.scrollHeight;
        items.style.display = 'block';
        items.style.overflow = 'hidden';

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
            cleanUp();
        };
        anim.oncancel = function() {
            cleanUp();
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
    var safeText = escapeSearchHtml(text);
    if (!tokens || !tokens.length) return safeText;

    var safeTokens = tokens
        .map(function(t) { return escapeSearchRegExp(escapeSearchHtml(t)); })
        .filter(function(t) { return t.length > 0; });

    if (!safeTokens.length) return safeText;

    var regex = new RegExp('(' + safeTokens.join('|') + ')', 'gi');
    return safeText.replace(regex, '<mark class="search-highlight">$1</mark>');
}

// 清空搜索
function clearSearch() {
    var $input = $('#searchKeyword');
    $input.val('');
    $('#searchClearBtn').hide();
    $('#searchEmptyState').hide();

    $('.item-row').each(function() {
        var $row = $(this);
        $row.show();
        var origName = $row.data('name');
        if (origName !== undefined) {
            $row.find('.item-title').text(origName);
        }
    });

    $('.category-group').show();
    $input.focus();
}

// 关键词即时搜索 (支持多词空格拆分、项目名/分类名/历史所有版本号/作者全维度匹配、折叠自动展开与安全高亮)
function handleSearch(kw) {
    kw = (kw || '').trim();
    var $clearBtn = $('#searchClearBtn');
    var $emptyState = $('#searchEmptyState');

    if (!kw) {
        $clearBtn.hide();
        $emptyState.hide();
        $('.item-row').each(function() {
            var $row = $(this);
            $row.show();
            var origName = $row.data('name');
            if (origName !== undefined) {
                $row.find('.item-title').text(origName);
            }
        });
        $('.category-group').show();
        return;
    }

    $clearBtn.show();

    // 空格多词拆分 (AND 查询)
    var tokens = kw.toLowerCase().split(/\s+/).filter(Boolean);
    var totalMatches = 0;

    $('.item-row').each(function() {
        var $row = $(this);
        var name = ($row.data('name') || '').toString();
        var creator = ($row.data('creator-name') || '').toString();
        var catName = ($row.closest('.category-group').find('.cat-name-text').text() || '').trim();

        // 提取该项目历史所有版本号与版本创建者
        var versionsData = $row.data('versions');
        var versionTexts = [];
        if (versionsData) {
            if (typeof versionsData === 'string') {
                try {
                    versionsData = JSON.parse(versionsData);
                } catch(e) {
                    versionsData = [];
                }
            }
            if (Array.isArray(versionsData)) {
                for (var i = 0; i < versionsData.length; i++) {
                    var v = versionsData[i];
                    if (v && v.version_name) versionTexts.push(v.version_name);
                    if (v && v.creator_name) versionTexts.push(v.creator_name);
                }
            }
        }

        // 综合检索文本池 (全部转小写)
        var haystack = (name + ' ' + catName + ' ' + creator + ' ' + versionTexts.join(' ')).toLowerCase();

        // 所有词元必须全部包含 (AND 逻辑)
        var isMatch = tokens.length > 0 && tokens.every(function(t) {
            return haystack.indexOf(t) > -1;
        });

        if (isMatch) {
            $row.show();
            totalMatches++;
            $row.find('.item-title').html(highlightSearchMatches(name, tokens));
        } else {
            $row.hide();
            $row.find('.item-title').text(name);
        }
    });

    // 智能展开/隐藏分类组 (通过 style.display 物理检测，彻底规避父级 display:none 导致 :visible 误判的 Bug)
    $('.category-group').each(function() {
        var $cat = $(this);
        var matchCountInCat = 0;
        $cat.find('.item-row').each(function() {
            if (this.style.display !== 'none') {
                matchCountInCat++;
            }
        });

        if (matchCountInCat > 0) {
            // 命中项所在分类组：强制展开并显示
            $cat.show().removeClass('collapsed');
        } else {
            // 无匹配项分类组：整组隐藏
            $cat.hide();
        }
    });

    // 空状态提示
    if (totalMatches === 0) {
        $emptyState.show();
    } else {
        $emptyState.hide();
    }
}

// 根据 URL Hash 路由恢复项目定位
function openAnnotationLink(id) {
    var routeAtRequest = window.location.hash;
    return fetch('api.php?action=annotation_target&id=' + encodeURIComponent(id)).then(function(response) { return response.json(); }).then(function(res) {
        if (window.location.hash !== routeAtRequest) return;
        if (!res.success) throw new Error(res.message || '批注不可访问');
        var target = res.data;
        var node = document.getElementById('item-node-' + target.item_id);
        if (!node) throw new Error('项目不存在或无权访问');
        var isLink = (node.getAttribute('data-type') === 'link' || parseInt(target.version_id, 10) === 0);
        if (!isLink) {
            var versions = JSON.parse(node.getAttribute('data-versions') || '[]');
            var match = versions.filter(function(version) { return parseInt(version.id,10) === target.version_id; })[0];
            if (!match) throw new Error('版本已删除或不可访问');
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
        if (!target.page_url && !isLink) showToast('原页面已不存在，已打开版本入口；请查看批注原文', 'warning');
        else if (target.annotation && target.annotation.needs_review) showToast('原型已更新，此批注需要重新核对', 'info');
    }).catch(function(error) { showToast(error.message || '批注不可访问', 'error'); });
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
            var rawPath = decodeURIComponent(mDirect[1]);
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
                    if (!exact) { showToast('版本已删除或不可访问', 'error'); return; }
                    targetVer = exact.version_name;
                }
                var mV = hash.match(/[?&]v=([^&]+)/);
                if (!mId && mV && mV[1]) {
                    targetVer = decodeURIComponent(mV[1]);
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
        modal.setAttribute('aria-label', '对话框');
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
                title: '发版任务进行中',
                message: '原型上传发布仍在进行中，关闭窗口不会中断后台任务，完成后将自动刷新页面。确定要关闭弹窗吗？',
                onConfirm: function() {
                    closeModal(id, true);
                }
            });
            return;
        }
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
        if (top.contains(picker) && picker.style.display !== 'none') {
            picker.style.display = 'none';
            var trigger = document.getElementById('adminMultiSelectTrigger');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.focus();
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
        title: '退出登录',
        message: '确定退出当前登录账号？',
        confirmText: '退出',
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

// 动态渲染工作台内部防泄密水印 (秒级实时心跳 + 切后台智能休眠)
var workspaceWatermarkCanvas = null;
var workspaceWatermarkTimer = null;

function updateWorkspaceWatermarkImage() {
    var $overlay = $('#watermarkOverlay');
    if (!$overlay.length || $overlay.is(':hidden')) return;
    var uName = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER && (CURRENT_USER.name || CURRENT_USER.email)) ? (CURRENT_USER.name || CURRENT_USER.email) : '立象成员';
    var now = new Date();
    var pad = function(n) { return n < 10 ? '0' + n : n; };
    var timeStr = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate() + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
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
        workspaceWatermarkTimer = setInterval(function() {
            if (typeof document !== 'undefined' && document.hidden) return;
            updateWorkspaceWatermarkImage();
        }, 1000);
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
            showToast(res.message || '保存失败', 'error');
            return;
        }
        showToast('个人资料已保存', 'success');
        markProfileSaved('profileForm', displayName);
        var newName = (res.data && res.data.name) ? res.data.name : displayName;
        if (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) {
            CURRENT_USER.name = newName;
            CURRENT_USER.display_name = newName;
        }
        var headerName = document.getElementById('myProfileHeaderName');
        if (headerName) headerName.textContent = newName || '用户';
        var sidebarName = document.querySelector('.user-badge span');
        if (sidebarName) sidebarName.textContent = newName || '用户';

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

                // 2. 同步控制中心表格
                $('#overviewTableProjects tbody tr[data-item-id]').each(function() {
                    var $row = $(this);
                    if (parseInt($row.attr('data-created-by'), 10) === myUid) {
                        $row.attr('data-creator-name', newName).data('creator-name', newName);
                        $row.find('td').eq(2).text(newName);
                    }
                });

                // 3. 同步工作台右侧顶部状态栏 (仅对无版本外链同步当前负责人；普通原型版本保留历史发版人快照)
                if (typeof currentSelectedItemId !== 'undefined' && currentSelectedItemId) {
                    var $curNode = $('#item-node-' + currentSelectedItemId);
                    if ($curNode.length && $curNode.data('type') === 'link' && parseInt($curNode.attr('data-created-by'), 10) === myUid) {
                        var $barTime = $('#barTime');
                        if ($barTime.length) {
                            var curHtml = $barTime.html();
                            if (curHtml) {
                                $barTime.html(curHtml.replace(/@([^\s·<]+)/, '@' + esc(newName)));
                            } else {
                                $barTime.html('<i class="ri-user-line" style="margin-right:3px;font-size:12px;opacity:0.85;"></i>@' + esc(newName)).show();
                            }
                        }
                    }
                }
            }

            // 4. 同步负责人下拉框
            var authorSelect = document.getElementById('itemCreatedBy');
            if (authorSelect) {
                var myOpt = authorSelect.querySelector('option[value="' + myUid + '"]');
                if (myOpt) {
                    var roleSuffix = CURRENT_USER.role === 'admin' ? ' (管理员)' : '';
                    myOpt.textContent = (newName ? (newName + ' (' + (CURRENT_USER.email || '') + ')') : CURRENT_USER.email) + roleSuffix;
                }
            }
        }
    })
    .catch(function() {
        if (btn) btn.disabled = false;
        showToast('网络异常，请重试', 'error');
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
        if (typeof setFieldError === 'function') {
            setFieldError(oldPwdInput, null, '请输入当前密码');
        } else {
            showToast('请输入当前密码', 'warning');
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
    if (typeof showPasswordMismatchError === 'function'
        ? showPasswordMismatchError(passwordInput, confirmInput, null, '两次输入的新密码不一致')
        : (newPwd !== confirmPwd)) {
        if (typeof showPasswordMismatchError !== 'function') {
            showToast('两次输入的新密码不一致', 'warning');
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
            var msg = res.message || '修改密码失败';
            if (typeof setFieldError === 'function') {
                if (msg.indexOf('当前密码') !== -1 || msg.indexOf('原密码') !== -1) {
                    setFieldError(oldPwdInput, null, msg);
                    return;
                }
                if (msg.indexOf('不一致') !== -1) {
                    setFieldError(confirmInput, null, msg);
                    return;
                }
                if (msg.indexOf('新密码') !== -1 || msg.indexOf('字符') !== -1 || msg.indexOf('字节') !== -1) {
                    setFieldError(passwordInput, null, msg);
                    return;
                }
            }
            showToast(msg, 'error');
            return;
        }
        showToast('密码已成功修改', 'success');
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
        showToast('网络异常，请重试', 'error');
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
            showToast('个人通知已保存', 'success');
            markProfileSaved('profileWebhookForm', wb);
            if (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) {
                CURRENT_USER.webhook_url = wb;
                if (typeof syncAdminNotificationWebhookState === 'function') {
                    syncAdminNotificationWebhookState(CURRENT_USER.id, wb);
                }
            }
        } else {
            showToast(res.message || '保存失败', 'error');
        }
    })
    .catch(function() {
        if (btn) btn.disabled = false;
        showToast('网络异常，请重试', 'error');
    });
}
window.handleSaveProfileWebhook = handleSaveProfileWebhook;

function testAnyWebhook(inputId, btnEl) {
    var input = document.getElementById(inputId);
    var url = input ? input.value.trim() : '';
    if (!url) {
        showToast('请先输入 Webhook 地址', 'warning');
        if (input) input.focus();
        return;
    }
    var origHtml = btnEl ? btnEl.innerHTML : '';
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> 发送中...';
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
            showToast(res.message || '测试消息已送达', 'success');
        } else {
            showToast('推送失败: ' + (res.message || '网络超时或地址无效'), 'error');
        }
    }).catch(function() {
        restoreBtn();
        showToast('网络请求异常', 'error');
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
            showToast('复制失败，请手动复制链接', 'error');
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
            showToast('链接已复制', 'success');
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

    runAndFit();
    var attempts = 0;
    var timer = setInterval(function() {
        attempts++;
        if (runAndFit() || attempts >= 45) clearInterval(timer);
    }, 60);

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
