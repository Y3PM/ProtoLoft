/**
 * 立象原型 · 页面级轻量批注抽屉协同组件
 * 纯原生 JavaScript ES6，零外部依赖，毫秒级响应
 */
(function() {
    'use strict';

    // 运行环境垫片 (支持 share.php 等无 app.js 依赖的独立沙箱)
    if (typeof window.apiFetch !== 'function') {
        window.apiFetch = function(action, formData) {
            var url = 'api.php?action=' + encodeURIComponent(action);
            var token = window.CSRF_TOKEN || (document.querySelector('meta[name="csrf-token"]') ? document.querySelector('meta[name="csrf-token"]').getAttribute('content') : '');
            if (formData && typeof formData.append === 'function' && token && !formData.has('csrf_token')) {
                formData.append('csrf_token', token);
            }
            var headers = { 'X-Requested-With': 'XMLHttpRequest' };
            if (token) headers['X-CSRF-Token'] = token;
            return fetch(url, {
                method: 'POST',
                body: formData,
                headers: headers
            }).then(function(r) { return r.json(); });
        };
    }
    if (typeof window.showToast !== 'function') {
        window.showToast = function(msg, type) {
            var t = document.getElementById('shareMiniToast');
            if (!t) {
                t = document.createElement('div');
                t.id = 'shareMiniToast';
                t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:8px 16px;background:var(--text-1,#1e293b);color:#fff;font-size:13px;border-radius:6px;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:opacity 0.2s;pointer-events:none;';
                document.body.appendChild(t);
            }
            t.textContent = msg;
            t.style.opacity = '1';
            t.style.display = 'block';
            clearTimeout(t._timer);
            t._timer = setTimeout(function() {
                t.style.opacity = '0';
                setTimeout(function() { t.style.display = 'none'; }, 200);
            }, 2500);
        };
    }

    function readSavedGuestName() {
        var name = '';
        try {
            name = (localStorage.getItem('protoloft_guest_name') || '').trim();
        } catch(e) {}
        if (name.length > 20) name = name.substring(0, 20);
        return name;
    }

    function saveGuestName(name, persist) {
        var trimmed = (name || '').trim();
        var clean = trimmed || '外部访客';
        if (clean.length > 20) clean = clean.substring(0, 20);
        if (persist && trimmed) {
            try {
                localStorage.setItem('protoloft_guest_name', clean);
            } catch(e) {}
        }
        return clean;
    }

    function getDialogFocusable(modal) {
        if (!modal || typeof modal.querySelectorAll !== 'function') return [];
        return Array.prototype.filter.call(
            modal.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex]'),
            function(el) {
                return !el.disabled && el.tabIndex >= 0 && (!el.getClientRects || el.getClientRects().length > 0);
            }
        );
    }

    function resolveGuestName(onConfirm) {
        var saved = readSavedGuestName();
        if (saved) {
            onConfirm(saved);
            return;
        }
        if (typeof document === 'undefined' || typeof document.createElement !== 'function' || !document.body) {
            onConfirm('外部访客');
            return;
        }

        var modal = document.getElementById('annoGuestNameModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'annoGuestNameModal';
            modal.className = 'custom-modal';
            modal.style.display = 'none';
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.setAttribute('aria-labelledby', 'annoGuestNameTitle');

            var box = document.createElement('div');
            box.className = 'modal-dialog-box modal-sm';

            var head = document.createElement('div');
            head.className = 'modal-head';
            var title = document.createElement('h4');
            title.id = 'annoGuestNameTitle';
            title.textContent = '请留下您的称呼';
            var closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'close-x';
            closeBtn.title = '关闭';
            closeBtn.innerHTML = '<i class="ri-close-line"></i>';
            head.appendChild(title);
            head.appendChild(closeBtn);

            var form = document.createElement('form');
            form.setAttribute('novalidate', 'novalidate');
            var group = document.createElement('div');
            group.className = 'm-form-group';
            var label = document.createElement('label');
            label.className = 'm-label';
            label.setAttribute('for', 'annoGuestNameInput');
            label.textContent = '团队辨识称呼 ';
            var opt = document.createElement('span');
            opt.className = 'opt-tag';
            opt.textContent = '选填';
            label.appendChild(opt);

            var input = document.createElement('input');
            input.type = 'text';
            input.id = 'annoGuestNameInput';
            input.className = 'm-input';
            input.maxLength = 20;
            input.placeholder = '例如：客户李总、前端小王';
            input.autocomplete = 'nickname';
            group.appendChild(label);
            group.appendChild(input);

            var footer = document.createElement('div');
            footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:18px;';
            var skipBtn = document.createElement('button');
            skipBtn.type = 'button';
            skipBtn.id = 'annoGuestNameSkip';
            skipBtn.className = 'btn-cancel btn-standard';
            skipBtn.textContent = '匿名发布';
            var submitBtn = document.createElement('button');
            submitBtn.type = 'submit';
            submitBtn.className = 'btn-primary btn-standard';
            submitBtn.textContent = '确定并发布';
            footer.appendChild(skipBtn);
            footer.appendChild(submitBtn);

            form.appendChild(group);
            form.appendChild(footer);
            box.appendChild(head);
            box.appendChild(form);
            modal.appendChild(box);
            document.body.appendChild(modal);
        }

        var nameInput = document.getElementById('annoGuestNameInput');
        var skipAction = document.getElementById('annoGuestNameSkip');
        var closeAction = modal.querySelector('.close-x');
        var guestForm = modal.querySelector('form');
        var opener = (document.activeElement && document.activeElement !== document.body && !modal.contains(document.activeElement))
            ? document.activeElement
            : null;
        var inertRecords = [];
        var settled = false;

        function lockBackground() {
            if (!document.body || !document.body.children) return;
            Array.prototype.forEach.call(document.body.children, function(sibling) {
                if (sibling !== modal && !/^(SCRIPT|STYLE|LINK)$/.test(sibling.tagName)) {
                    inertRecords.push({ node: sibling, previous: !!sibling.inert });
                    sibling.inert = true;
                }
            });
        }
        function unlockBackground() {
            inertRecords.forEach(function(entry) {
                entry.node.inert = entry.previous;
            });
            inertRecords = [];
        }
        function closeDialog(restoreFocus) {
            modal.style.display = 'none';
            document.removeEventListener('keydown', onKeyDown, true);
            unlockBackground();
            if (restoreFocus && opener && opener.isConnected && !opener.closest('[inert]') && typeof opener.focus === 'function') {
                opener.focus();
            }
        }
        function finishWith(rawName, shouldPersist) {
            if (settled) return;
            settled = true;
            closeDialog(true);
            onConfirm(saveGuestName(rawName, shouldPersist));
        }
        function cancelDialog() {
            if (settled) return;
            settled = true;
            closeDialog(true);
        }
        function onKeyDown(ev) {
            if (ev.key === 'Escape') {
                ev.preventDefault();
                ev.stopImmediatePropagation();
                cancelDialog();
                return;
            }
            if (ev.key === 'Tab') {
                var fields = getDialogFocusable(modal);
                if (!fields.length) {
                    ev.preventDefault();
                    return;
                }
                var active = document.activeElement;
                var idx = fields.indexOf(active);
                if (idx < 0 || (!ev.shiftKey && idx === fields.length - 1) || (ev.shiftKey && idx === 0)) {
                    ev.preventDefault();
                    ev.stopImmediatePropagation();
                    fields[ev.shiftKey ? fields.length - 1 : 0].focus();
                }
            }
        }

        if (closeAction) closeAction.onclick = cancelDialog;
        if (skipAction) skipAction.onclick = function() { finishWith('', false); };
        if (guestForm) {
            guestForm.onsubmit = function(ev) {
                ev.preventDefault();
                var typed = nameInput ? nameInput.value : '';
                finishWith(typed, Boolean(typed && typed.trim()));
            };
        }
        if (nameInput) nameInput.value = '';
        modal.style.display = 'flex';
        lockBackground();
        document.addEventListener('keydown', onKeyDown, true);
        if (nameInput) nameInput.focus();
    }

    var requestSequence = 0;
    var previousRequestSequence = 0;
    var contextSequence = 0;
    var jumpRequestSequence = 0;
    var pendingFocusId = 0;
    var focusedAnnotationId = 0;
    var updateActiveContext = null;
    var AnnoState = {
        isOpen: false,
        itemId: 0,
        verId: 0,
        itemType: 'project',
        pagePath: '',
        pageTitle: '',
        ready: false,
        submitting: false,
        filterMode: 'page', // 'page': 仅当前页面, 'all': 本版本全部
        statusFilter: 'all', // 'all', 'pending', 'resolved'
        list: [],
        pendingCount: 0
    };

    function syncComposer() {
        var input = document.getElementById('annoNewInput');
        var button = document.getElementById('btnSendAnno');
        if (input) input.disabled = !AnnoState.ready;
        if (button) button.disabled = !AnnoState.ready || AnnoState.submitting;
    }

    function esc(s) {
        if (!s) return '';
        var d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function annotationTimestamp(dateStr) {
        if (!dateStr) return NaN;
        var t = NaN;
        // 针对数据库中纯 UTC 字符串 (如 2026-11-09 07:15:00) 统一解析为 UTC 时间戳，消除时区差值
        if (typeof dateStr === 'string') {
            var trimmed = dateStr.trim();
            if (trimmed.indexOf('Z') !== -1 || trimmed.indexOf('+') !== -1 || trimmed.indexOf('T') !== -1) {
                t = new Date(trimmed).getTime();
            } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
                t = new Date(trimmed.replace(' ', 'T') + 'Z').getTime();
            }
        }
        if (isNaN(t)) {
            t = new Date(String(dateStr).replace(/-/g, '/')).getTime();
        }
        return t;
    }

    function timeAgo(dateStr) {
        if (!dateStr) return '';
        var t = annotationTimestamp(dateStr);
        if (isNaN(t)) return dateStr;
        var now = Date.now();
        var diff = Math.floor((now - t) / 1000);
        if (diff < 60) return '刚刚';
        if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
        if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
        if (diff < 2592000) return Math.floor(diff / 86400) + ' 天前';
        return dateStr.substring(0, 10);
    }

    // 严格检查当前是否真正处于有效原型/外链查看视图
    function isProtoViewActive() {
        if (!AnnoState.itemId) return false;

        var ph = document.getElementById('placeholder');
        if (ph && ph.style.display !== 'none' && (!ph.style.display || ph.offsetWidth > 0)) {
            // 视口被未选项目的空状态占位
            return false;
        }

        // 外链项目：只要已选定该资产且未处于未选占位符，即允许发起批注与协作讨论
        var isLinkItem = (AnnoState.itemType === 'link') || (typeof currentItemType !== 'undefined' && currentItemType === 'link');
        if (isLinkItem) {
            return true;
        }

        if (!AnnoState.verId) return false;

        var noVer = document.getElementById('noVersionPlaceholder');
        if (noVer && noVer.style.display !== 'none' && (!noVer.style.display || noVer.offsetWidth > 0)) {
            return false;
        }
        var linkCard = document.getElementById('linkInfoCard');
        if (linkCard && linkCard.style.display !== 'none' && (!linkCard.style.display || linkCard.offsetWidth > 0)) {
            return false;
        }

        var frame = document.getElementById('myFrame') || document.getElementById('shareFrame');
        if (!frame || frame.style.display === 'none') return false;
        var src = frame.getAttribute('src') || frame.src || '';
        if (!src || src === 'about:blank' || src.indexOf('about:blank') !== -1) {
            return false;
        }
        return true;
    }
    window.isProtoViewActive = isProtoViewActive;

    var contextWatcherTimer = null;
    function startContextWatcher() {
        if (contextWatcherTimer) return;
        if (typeof setInterval !== 'function') return;
        contextWatcherTimer = setInterval(function() {
            if (AnnoState.isOpen) {
                if (typeof updateActiveContext === 'function') {
                    updateActiveContext(false);
                }
            } else {
                stopContextWatcher();
            }
        }, 500);
    }

    function stopContextWatcher() {
        if (contextWatcherTimer) {
            if (typeof clearInterval === 'function') {
                clearInterval(contextWatcherTimer);
            }
            contextWatcherTimer = null;
        }
    }

    // 暴露到全局供按钮与快捷键调用
    window.toggleAnnotationDrawer = function(forceState) {
        var drawer = document.getElementById('annotationDrawer');
        if (!drawer) return;

        var targetOpen = (typeof forceState === 'boolean') ? forceState : !AnnoState.isOpen;
        if (targetOpen) {
            // 防御拦截：当前无有效原型页面时严禁打开批注抽屉 (如选择了文件夹或处于空状态)
            if (!isProtoViewActive()) {
                return;
            }
        }

        AnnoState.isOpen = targetOpen;

        if (AnnoState.isOpen) {
            drawer.style.display = 'flex';
            setTimeout(function() { drawer.classList.remove('drawer-collapsed'); }, 10);
            if (typeof updateActiveContext === 'function') {
                updateActiveContext(true);
            }
            startContextWatcher();
            window.loadAnnotations();
            if (AnnoState.statusFilter === 'previous') loadPreviousAnnotations();
            var input = document.getElementById('annoNewInput');
            if (input && typeof CURRENT_USER !== 'undefined' && CURRENT_USER) {
                var focusContext = contextSequence;
                setTimeout(function() {
                    if (AnnoState.isOpen && focusContext === contextSequence && AnnoState.statusFilter !== 'previous' && !input.disabled) input.focus();
                }, 180);
            }
        } else {
            previousRequestSequence++;
            stopContextWatcher();
            drawer.classList.add('drawer-collapsed');
            setTimeout(function() { if (!AnnoState.isOpen) drawer.style.display = 'none'; }, 220);
        }
    };

    window.switchAnnoFilterMode = function(mode) {
        AnnoState.filterMode = mode;
        var btnPage = document.getElementById('annoFilterCurPage');
        var btnAll = document.getElementById('annoFilterAllPages');
        if (btnPage && btnAll) {
            btnPage.classList.toggle('active', mode === 'page');
            btnAll.classList.toggle('active', mode === 'all');
        }
        renderAnnotationList();
    };

    window.switchAnnoStatusFilter = function(status) {
        var btnAll = document.getElementById('annoStatusAll');
        var btnPending = document.getElementById('annoStatusPending');
        var btnResolved = document.getElementById('annoStatusResolved');
        var historyBtn = document.getElementById('annoHistoryToolbar');
        var previousPanel = document.getElementById('annoPreviousPanel');
        if (status === 'previous' && (!previousPanel || !historyBtn || historyBtn.hidden || !AnnoState.verId || AnnoState.itemType === 'link')) {
            status = 'all';
        }
        previousRequestSequence++;
        AnnoState.statusFilter = status;

        // 四个 Tab 严格互斥高亮
        if (btnAll) btnAll.classList.toggle('active', status === 'all');
        if (btnPending) btnPending.classList.toggle('active', status === 'pending');
        if (btnResolved) btnResolved.classList.toggle('active', status === 'resolved');
        if (historyBtn) historyBtn.classList.toggle('active', status === 'previous');

        // 视图区域互斥：非 previous 状态时隐藏上一版面板
        if (status !== 'previous' && previousPanel) {
            previousPanel.hidden = true;
            previousPanel.innerHTML = '';
        }

        // 底部输入区防呆：在【上版未决】只读审阅模式下隐藏输入框，避免认知混淆并释放视窗空间
        var footer = document.getElementById('annoFooter') || (typeof document.querySelector === 'function' ? document.querySelector('.anno-footer') : null);
        if (footer) {
            footer.style.display = (status === 'previous') ? 'none' : 'block';
        }
        var pageScope = document.getElementById('annoFilterCurPage');
        var allScope = document.getElementById('annoFilterAllPages');
        if (pageScope) pageScope.disabled = status === 'previous';
        if (allScope) allScope.disabled = status === 'previous';

        renderAnnotationList();
        if (status === 'previous') return loadPreviousAnnotations();
    };

    // 响应工作台项目或版本切换，确保批注抽屉与当前原型严格联动
    window.updateAnnoContext = function(itemId, verId, verName, itemType) {
        var newItemId = itemId ? parseInt(itemId, 10) : 0;
        var node = newItemId ? document.getElementById('item-node-' + newItemId) : null;
        var resolvedType = itemType || (typeof currentItemType !== 'undefined' ? currentItemType : (node ? (node.getAttribute('data-type') || 'project') : (AnnoState.itemType || 'project')));
        var isLink = (resolvedType === 'link');
        var newVerId = isLink ? 0 : (verId ? parseInt(verId, 10) : 0);
        var itemChanged = (AnnoState.itemId !== newItemId || AnnoState.itemType !== resolvedType);
        var isChanged = (AnnoState.itemId !== newItemId || AnnoState.verId !== newVerId || AnnoState.itemType !== resolvedType);

        AnnoState.itemId = newItemId;
        AnnoState.verId = newVerId;
        AnnoState.itemType = resolvedType;

        contextSequence++;
        requestSequence++;
        previousRequestSequence++;
        pendingFocusId = 0; focusedAnnotationId = 0;
        var historyToolbar = document.getElementById('annoHistoryToolbar');
        var historyDivider = document.getElementById('annoHistoryDivider');
        var previousPanel = document.getElementById('annoPreviousPanel');
        var hasHistory = false;

        // 【核心铁律】链接无版本，严格隐藏/禁用「上版未决」；仅原型项目具备历史版本时才显现
        if (isLink) {
            if (historyToolbar) {
                historyToolbar.hidden = true;
                historyToolbar.classList.remove('active');
            }
            if (historyDivider) historyDivider.hidden = true;
            if (previousPanel) { previousPanel.hidden = true; previousPanel.textContent = ''; }
            if (AnnoState.statusFilter === 'previous') {
                window.switchAnnoStatusFilter('all');
            }
        } else {
            if (historyToolbar) {
                var versions = [];
                try { versions = JSON.parse(node ? node.getAttribute('data-versions') || '[]' : '[]'); } catch (e) {}
                hasHistory = versions.some(function(version) { return parseInt(version.id, 10) < newVerId; });
                historyToolbar.hidden = !hasHistory;
                if (historyDivider) historyDivider.hidden = !hasHistory;
                historyToolbar.classList.remove('active');
            }
            if (previousPanel) { previousPanel.hidden = true; previousPanel.textContent = ''; }
        }

        var pageLabel = (typeof document.querySelector === 'function') ? document.querySelector('.anno-cur-page-label') : null;
        if (isLink) {
            // 外链模式：自适应标题与页面路径
            if (pageLabel) pageLabel.textContent = '链接：';
            var itemName = (node ? node.getAttribute('data-name') : '') || (document.getElementById('barTitle') ? document.getElementById('barTitle').textContent.trim() : '') || (document.querySelector('.share-title') ? document.querySelector('.share-title').textContent.trim() : '') || '外部链接';
            AnnoState.ready = true;
            AnnoState.submitting = false;
            AnnoState.pagePath = 'link';
            AnnoState.pageTitle = itemName;
            var title = document.getElementById('annoCurPageTitle');
            if (title) {
                title.textContent = itemName;
                title.setAttribute('title', itemName);
            }
            syncComposer();
        } else {
            if (pageLabel) pageLabel.textContent = '当前页：';
            AnnoState.ready = false;
            AnnoState.submitting = false;
            AnnoState.pagePath = '';
            AnnoState.pageTitle = '';
            var title = document.getElementById('annoCurPageTitle');
            if (title) title.textContent = '当前页面';
            syncComposer();
        }

        if (isChanged) {
            AnnoState.list = [];
            AnnoState.pendingCount = 0;
            var input = document.getElementById('annoNewInput');
            if (input) input.value = '';
            var body = document.getElementById('annoListBody');
            if (body) body.textContent = '';
            updateHeaderBadge();
        }

        // 项目边界重置视图；同项目切版可保留筛选，但历史必须属于新版本。
        var status = AnnoState.statusFilter;
        if (itemChanged || !newItemId || (status === 'previous' && !hasHistory)) status = 'all';
        window.switchAnnoStatusFilter(status);

        if (AnnoState.itemId) {
            window.loadAnnotations();
        } else {
            renderAnnotationList();
        }
    };

    window.loadAnnotations = function() {
        if (!AnnoState.itemId || (AnnoState.itemType !== 'link' && !AnnoState.verId)) {
            AnnoState.list = [];
            AnnoState.pendingCount = 0;
            updateHeaderBadge();
            renderAnnotationList();
            return;
        }

        var url = 'api.php?action=list_annotations&item_id=' + AnnoState.itemId;
        if (AnnoState.verId) url += '&ver_id=' + AnnoState.verId;

        var sequence = ++requestSequence;
        var itemSnapshot = AnnoState.itemId;
        var versionSnapshot = AnnoState.verId;
        var contextSnapshot = contextSequence;
        fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(res) {
            if (sequence !== requestSequence || contextSnapshot !== contextSequence || itemSnapshot !== AnnoState.itemId || versionSnapshot !== AnnoState.verId) return;
            if (res.success && res.data) {
                AnnoState.list = res.data.list || [];
                AnnoState.pendingCount = parseInt(res.data.pending_count, 10) || 0;
                AnnoState.verId = res.data.ver_id || AnnoState.verId;
                updateHeaderBadge();
                renderAnnotationList();
            }
        })
        .catch(function(err) {
            console.error('[Anno] 加载批注失败:', err);
        });
    };

    function updateHeaderBadge() {
        var badge = document.getElementById('annoHeaderBadge');
        if (!badge) return;
        if (AnnoState.pendingCount > 0) {
            badge.textContent = AnnoState.pendingCount;
            badge.style.display = 'inline-flex';
            badge.classList.remove('badge-resolved');
        } else if (AnnoState.list.length > 0) {
            badge.textContent = AnnoState.list.length;
            badge.style.display = 'inline-flex';
            badge.classList.add('badge-resolved');
        } else {
            badge.style.display = 'none';
        }
    }

    /**
     * 生成与系统主画布空状态图纸同构同源的家族化矢量微插画
     */
    function getAnnoEmptySvg(type) {
        var baseCoords = '<circle cx="16" cy="18" r="1.5" fill="#cbd5e1"/>' +
                         '<circle cx="104" cy="18" r="1.5" fill="#cbd5e1"/>' +
                         '<circle cx="16" cy="78" r="1.5" fill="#cbd5e1"/>' +
                         '<circle cx="104" cy="78" r="1.5" fill="#cbd5e1"/>';

        if (type === 'pending') {
            // 待处理空状态：待办清单画卷 + 晴空蓝时钟徽章 (严格呼应系统待处理 ri-time-line 语义)
            return '<svg width="120" height="96" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                baseCoords +
                '<rect x="32" y="20" width="56" height="50" rx="6" fill="#ffffff" stroke="#94a3b8" stroke-width="1.4"/>' +
                '<line x1="32" y1="32" x2="88" y2="32" stroke="#f1f5f9" stroke-width="1"/>' +
                '<rect x="38" y="25" width="20" height="3" rx="1.5" fill="#cbd5e1"/>' +
                '<circle cx="41" cy="40" r="2.5" fill="#e6f4fe" stroke="#0076de" stroke-width="1"/>' +
                '<line x1="47" y1="40" x2="74" y2="40" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round"/>' +
                '<circle cx="41" cy="49" r="2.5" fill="#e6f4fe" stroke="#0076de" stroke-width="1"/>' +
                '<line x1="47" y1="49" x2="68" y2="49" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round"/>' +
                '<circle cx="41" cy="58" r="2.5" fill="#e6f4fe" stroke="#0076de" stroke-width="1"/>' +
                '<line x1="47" y1="58" x2="62" y2="58" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round"/>' +
                '<!-- 晴空蓝待办时钟微徽章 -->' +
                '<g transform="translate(68, 46)">' +
                    '<circle cx="14" cy="14" r="13" fill="#e6f4fe" stroke="#bce0fc" stroke-width="1.3"/>' +
                    '<circle cx="14" cy="14" r="8" stroke="#0076de" stroke-width="1.3" fill="none"/>' +
                    '<path d="M14 10V14.5L17 16" stroke="#0076de" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>' +
                '</g>' +
            '</svg>';
        }

        if (type === 'resolved') {
            // 已解决空状态：归档图纸画卷 + 翠绿对勾徽章 (严格呼应系统已解决 ri-check-line 语义)
            return '<svg width="120" height="96" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                baseCoords +
                '<rect x="32" y="22" width="56" height="48" rx="6" fill="#ffffff" stroke="#94a3b8" stroke-width="1.4"/>' +
                '<line x1="32" y1="34" x2="88" y2="34" stroke="#f1f5f9" stroke-width="1"/>' +
                '<rect x="38" y="27" width="22" height="3" rx="1.5" fill="#cbd5e1"/>' +
                '<rect x="38" y="42" width="36" height="2.5" rx="1" fill="#f1f5f9"/>' +
                '<rect x="38" y="49" width="28" height="2.5" rx="1" fill="#f1f5f9"/>' +
                '<rect x="38" y="56" width="32" height="2.5" rx="1" fill="#f1f5f9"/>' +
                '<!-- 翠绿完成对勾微徽章 -->' +
                '<g transform="translate(68, 46)">' +
                    '<circle cx="14" cy="14" r="13" fill="#f0fdf4" stroke="#86efac" stroke-width="1.3"/>' +
                    '<path d="M9.5 14L12.5 17L18.5 11" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                '</g>' +
            '</svg>';
        }

        if (type === 'previous') {
            // 上版未决空状态：前后双层图纸画卷 + 时光虚线弧 + 清空对勾徽章
            return '<svg width="120" height="96" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                baseCoords +
                '<rect x="26" y="20" width="56" height="46" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2" transform="rotate(-6 26 20)"/>' +
                '<line x1="28" y1="32" x2="68" y2="28" stroke="#cbd5e1" stroke-width="1.3" stroke-linecap="round"/>' +
                '<line x1="29" y1="40" x2="58" y2="37" stroke="#e2e8f0" stroke-width="1.3" stroke-linecap="round"/>' +
                '<rect x="28" y="24" width="56" height="46" rx="6" fill="#ffffff" stroke="#94a3b8" stroke-width="1.4"/>' +
                '<line x1="28" y1="35" x2="84" y2="35" stroke="#f1f5f9" stroke-width="1"/>' +
                '<rect x="34" y="28.5" width="22" height="3" rx="1.5" fill="#cbd5e1"/>' +
                '<rect x="34" y="42" width="38" height="2.5" rx="1" fill="#f1f5f9"/>' +
                '<rect x="34" y="48" width="28" height="2.5" rx="1" fill="#f1f5f9"/>' +
                '<rect x="34" y="54" width="20" height="2.5" rx="1" fill="#f1f5f9"/>' +
                '<path d="M86 20C94 26 96 36 90 44" stroke="#0076de" stroke-width="1.3" stroke-linecap="round" stroke-dasharray="2 3" opacity="0.65"/>' +
                '<g transform="translate(70, 48)">' +
                    '<circle cx="14" cy="14" r="13" fill="#f0fdf4" stroke="#86efac" stroke-width="1.3"/>' +
                    '<path d="M9.5 14L12.5 17L18.5 11" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                '</g>' +
            '</svg>';
        }

        // 默认（全部）：双层原型画卷 + 晴空蓝悬浮批注气泡
        return '<svg width="120" height="96" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            baseCoords +
            '<rect x="34" y="20" width="56" height="46" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2" transform="rotate(-4 34 20)"/>' +
            '<rect x="30" y="24" width="56" height="46" rx="6" fill="#ffffff" stroke="#94a3b8" stroke-width="1.4"/>' +
            '<line x1="30" y1="34" x2="86" y2="34" stroke="#f1f5f9" stroke-width="1"/>' +
            '<circle cx="36" cy="29" r="1.5" fill="#e2e8f0"/>' +
            '<circle cx="41" cy="29" r="1.5" fill="#e2e8f0"/>' +
            '<rect x="37" y="40" width="28" height="4" rx="1.5" fill="#0076de" fill-opacity="0.18"/>' +
            '<rect x="37" y="48" width="42" height="2.5" rx="1" fill="#f1f5f9"/>' +
            '<rect x="37" y="54" width="32" height="2.5" rx="1" fill="#f1f5f9"/>' +
            '<g transform="translate(64, 46)">' +
                '<path d="M0 6C0 2.68629 2.68629 0 6 0H26C29.3137 0 32 2.68629 32 6V18C32 21.3137 29.3137 24 26 24H12L5 29V24H6C2.68629 24 0 21.3137 0 18V6Z" fill="#e6f4fe" stroke="#0076de" stroke-width="1.3"/>' +
                '<circle cx="10" cy="12" r="1.8" fill="#0076de"/>' +
                '<circle cx="16" cy="12" r="1.8" fill="#0076de"/>' +
                '<circle cx="22" cy="12" r="1.8" fill="#0076de"/>' +
            '</g>' +
        '</svg>';
    }

    function renderAnnotationList() {
        var body = document.getElementById('annoListBody');
        var previousPanel = document.getElementById('annoPreviousPanel');
        if (!body) return;
        body.hidden = AnnoState.statusFilter === 'previous';

        // 视窗内容区完全互斥：处于上一版未决模式时，完全隐藏当前版本列表，专享展示历史批注
        if (AnnoState.statusFilter === 'previous') {
            body.style.display = 'none';
            if (previousPanel) previousPanel.hidden = false;
            return;
        }

        // 恢复 flex 弹性列式容器，确保卡片间 gap 间隔生效
        body.style.display = 'flex';
        if (previousPanel) previousPanel.hidden = true;

        // 过滤
        var filtered = AnnoState.list.filter(function(item) {
            if (AnnoState.filterMode === 'page' && AnnoState.pagePath) {
                if (item.page_path && item.page_path !== AnnoState.pagePath) {
                    return false;
                }
            }
            if (AnnoState.statusFilter === 'pending' && item.status !== 0) return false;
            if (AnnoState.statusFilter === 'resolved' && item.status !== 1) return false;
            return true;
        });

        if (filtered.length === 0) {
            var emptyTitle = '页面一片祥和，暂无挑刺与吐槽';
            var emptyDesc = '按快捷键 C，在页面任意位置留下你的第一条高见';
            var emptyType = 'all';

            if (AnnoState.itemType !== 'link' && !AnnoState.verId) {
                emptyTitle = '该项目还没有版本';
                emptyDesc = '';
            } else if (AnnoState.statusFilter === 'pending') {
                emptyTitle = '暂无待处理批注';
                emptyDesc = '所有待办批注已妥善解决';
                emptyType = 'pending';
            } else if (AnnoState.statusFilter === 'resolved') {
                emptyTitle = '暂无已解决批注';
                emptyDesc = '处理完毕的批注将归档至此处';
                emptyType = 'resolved';
            }

            body.innerHTML = `
                <div style="padding:60px 20px 48px;text-align:center;color:var(--text-3);">
                    <div style="margin-bottom:14px;display:flex;justify-content:center;">
                        ${getAnnoEmptySvg(emptyType)}
                    </div>
                    <div style="font-size:13.5px;font-weight:600;color:var(--text-2);margin-bottom:4px;letter-spacing:0.01em;">${emptyTitle}</div>
                    ${emptyDesc ? `<div style="font-size:12px;color:var(--text-3);line-height:1.5;">${emptyDesc}</div>` : ''}
                </div>
            `;
            return;
        }

        var isLogin = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.id);
        var curUserId = isLogin ? parseInt(CURRENT_USER.id, 10) : 0;
        var isCurAdmin = isLogin && (CURRENT_USER.role === 'admin');
        var currentItemNode = AnnoState.itemId ? document.getElementById('item-node-' + AnnoState.itemId) : null;
        var canManageCurrentItem = isCurAdmin || (currentItemNode && (currentItemNode.getAttribute('data-can-edit') === '1' || currentItemNode.getAttribute('data-can-edit') === 1));

        var html = '';
        filtered.forEach(function(a) {
            var isResolved = (a.status === 1);
            var isAuthor = (curUserId > 0 && curUserId === parseInt(a.user_id, 10));
            var canToggle = isAuthor || canManageCurrentItem;
            var canDelete = isAuthor || (isLogin && CURRENT_USER.role === 'admin');

            var statusPill = isResolved ? 
                '<span class="anno-status-pill anno-status-resolved"><i class="ri-check-line"></i> 已解决</span>' :
                '<span class="anno-status-pill anno-status-pending"><i class="ri-time-line"></i> 待处理</span>';

            var toggleBtnHtml = canToggle ? `
                <button type="button" class="anno-act-btn" onclick="toggleAnnoStatus(${a.id})">
                    <i class="${isResolved ? 'ri-restart-line' : 'ri-check-line'}"></i> ${isResolved ? '重新开启' : '标为已解决'}
                </button>
            ` : '';

            var deleteBtnHtml = canDelete ? `
                <button type="button" class="anno-act-btn act-danger" onclick="deleteAnno(${a.id})" title="删除此批注">
                    <i class="ri-delete-bin-line"></i>
                </button>
            ` : '';

            var repliesHtml = '';
            if (a.replies && a.replies.length > 0) {
                repliesHtml += '<div class="anno-replies-wrap">';
                a.replies.forEach(function(r) {
                    repliesHtml += `
                        <div class="anno-reply-item">
                            <div class="anno-reply-head">
                                <span class="anno-reply-author">${esc(r.author_name)}</span>
                                <span class="anno-reply-time">${timeAgo(r.created_at)}</span>
                            </div>
                            <div class="anno-reply-content">${esc(r.content)}</div>
                        </div>
                    `;
                });
                repliesHtml += '</div>';
            }

            // 回复输入框（默认折叠）
            var replyBoxHtml = `
                <div id="replyBox_${a.id}" style="display:none;margin-top:8px;">
                    <div class="m-form-row">
                        <input type="text" id="replyInput_${a.id}" class="m-input m-input-sm" placeholder="写回复..." maxlength="1000" onkeydown="if((event.key==='Enter'||event.keyCode===13)&&!event.isComposing){event.preventDefault();event.stopPropagation();submitReply(${a.id});}">
                        <button type="button" class="btn-primary btn-sm" onclick="submitReply(${a.id})">回复</button>
                    </div>
                </div>
            `;

            var pageBadge = '';
            var pTitle = a.page_title || (a.page_path && a.page_path !== 'link' ? a.page_path : '');
            if (AnnoState.filterMode === 'all' && pTitle) {
                pageBadge = `<button type="button" class="btn-cancel btn-sm anno-page-link" onclick="event.stopPropagation();jumpToAnnotationPage(${a.id})" title="跳转至此页面"><i class="ri-file-text-line" aria-hidden="true"></i><span class="anno-page-title-text">${esc(pTitle)}</span><i class="ri-arrow-right-s-line anno-page-jump-icon" aria-hidden="true"></i></button>`;
            }

            var reviewNote = a.origin_outdated ? `<div class="anno-review-note">${a.needs_review ? '原型已更新，待复核' : '此批注创建后，原型内容曾更新'}
                ${a.needs_review && a.can_review ? `<button type="button" class="btn-cancel btn-sm" onclick="reviewAnno(${a.id})">仍需修改</button>` : ''}
                ${a.page_snapshot ? `<details><summary>创建时页面文字</summary><div class="anno-snapshot">${esc(a.page_snapshot)}</div></details>` : ''}</div>` : '';
            var sourceNote = a.source_annotation_id ? `<div class="anno-source-note"><span>引用自旧版</span><a class="anno-link-btn" href="index.php#annotation=${parseInt(a.source_annotation_id,10)}" target="_blank" rel="noopener">查看原批注</a></div>` : '';
            html += `
                <div class="anno-card ${isResolved ? 'anno-resolved' : ''} ${focusedAnnotationId === parseInt(a.id,10) ? 'anno-focus' : ''}" id="annoCard_${a.id}">
                    ${pageBadge}
                    ${reviewNote}
                    <div class="anno-card-meta">
                        <span class="anno-card-author">${esc(a.author_name)}</span>
                        ${a.author_dept ? `<span class="anno-card-dept">${esc(a.author_dept)}</span>` : ''}
                        <span class="anno-card-time">${timeAgo(a.created_at)}</span>
                    </div>
                    ${sourceNote}
                    <div class="anno-card-content">${esc(a.content)}</div>
                    <div>${statusPill}</div>
                    ${repliesHtml}
                    ${replyBoxHtml}
                    <div class="anno-card-actions">
                        <button type="button" class="anno-act-btn" data-anno-reply-toggle="${a.id}" onclick="toggleReplyInput(${a.id})">
                            <i class="ri-chat-1-line"></i> 回复 ${a.replies ? '(' + a.replies.length + ')' : ''}
                        </button>
                        <button type="button" class="anno-act-btn" onclick="copyAnnotationLink(${a.id})">复制链接</button>
                        ${toggleBtnHtml}
                        <span style="margin-left:auto;">${deleteBtnHtml}</span>
                    </div>
                </div>
            `;
        });

        body.innerHTML = html;
        if (pendingFocusId) {
            var card = document.getElementById('annoCard_' + pendingFocusId);
            if (card) { card.scrollIntoView({block:'nearest'}); pendingFocusId = 0; }
        }
    }

    window.toggleReplyInput = function(annoId) {
        var box = document.getElementById('replyBox_' + annoId);
        if (!box) return;
        var isShow = (box.style.display !== 'none');
        box.style.display = isShow ? 'none' : 'block';
        if (!isShow) {
            var inp = document.getElementById('replyInput_' + annoId);
            if (inp) inp.focus();
        }
    };

    window.submitNewAnnotation = function() {
        var isLogin = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.id);
        var isGuestAllowed = (!isLogin && Boolean(window.GUEST_ANNOTATION_ENABLED));
        if (!isLogin && !isGuestAllowed) {
            if (typeof openLoginModal === 'function') {
                openLoginModal();
            } else if (typeof showToast === 'function') {
                showToast('请先登录后再发表批注', 'warning');
            }
            return;
        }

        if (!AnnoState.ready || !AnnoState.itemId || (!AnnoState.verId && AnnoState.itemType !== 'link') || AnnoState.submitting) return;

        var input = document.getElementById('annoNewInput');
        var content = input ? input.value.trim() : '';
        if (!content) return;

        var snapshot = {
            itemId: AnnoState.itemId,
            verId: AnnoState.verId || 0,
            itemType: AnnoState.itemType,
            pagePath: AnnoState.pagePath || 'link',
            pageTitle: AnnoState.pageTitle || '外部链接',
            contextSequence: contextSequence,
            content: content
        };

        var dispatchNewAnnotation = function(guestName) {
            if (!AnnoState.ready || !AnnoState.itemId || (!AnnoState.verId && AnnoState.itemType !== 'link') || AnnoState.submitting) return;
            var currentPath = AnnoState.pagePath || 'link';
            var currentVerId = AnnoState.verId || 0;
            if (snapshot.contextSequence !== contextSequence
                || snapshot.itemId !== AnnoState.itemId
                || snapshot.verId !== currentVerId
                || snapshot.pagePath !== currentPath) {
                if (typeof showToast === 'function') {
                    showToast('页面已切换，请返回原页面「' + snapshot.pageTitle + '」或重新发送确认', 'warning');
                }
                if (input && typeof input.focus === 'function') input.focus();
                return;
            }
            var focusTargetAfterSubmit = (typeof document !== 'undefined' && document.activeElement && document.activeElement !== document.body)
                ? document.activeElement
                : null;
            var restoreDrawerFocus = function() {
                if (!AnnoState.isOpen || typeof document === 'undefined') return;
                if (document.activeElement && document.activeElement !== document.body) return;
                if (focusTargetAfterSubmit && focusTargetAfterSubmit.isConnected && !focusTargetAfterSubmit.disabled && typeof focusTargetAfterSubmit.focus === 'function') {
                    focusTargetAfterSubmit.focus();
                } else if (input && input.isConnected && !input.disabled && typeof input.focus === 'function') {
                    input.focus();
                }
            };
            AnnoState.submitting = true;
            syncComposer();

            var fd = new FormData();
            fd.append('action', 'add_annotation');
            fd.append('item_id', snapshot.itemId);
            fd.append('ver_id', snapshot.verId);
            fd.append('page_path', snapshot.pagePath);
            fd.append('page_title', snapshot.pageTitle);
            fd.append('content', snapshot.content);
            if (guestName) {
                fd.append('guest_name', guestName);
            }

            apiFetch(fd.get('action'), fd)
            .then(function(res) {
                if (snapshot.contextSequence !== contextSequence) return;
                AnnoState.submitting = false;
                syncComposer();
                if (res.success && res.data) {
                    if (snapshot.pagePath === (AnnoState.pagePath || 'link') && input) input.value = '';
                    AnnoState.list.unshift(res.data);
                    AnnoState.pendingCount++;
                    updateHeaderBadge();
                    renderAnnotationList();
                    if (typeof showToast === 'function') {
                        showToast('批注已发布', 'success');
                    }
                } else {
                    if (typeof showToast === 'function') {
                        showToast(res.message || '发布失败', 'error');
                    }
                }
                restoreDrawerFocus();
            })
            .catch(function() {
                if (snapshot.contextSequence !== contextSequence) return;
                AnnoState.submitting = false;
                syncComposer();
                if (typeof showToast === 'function') {
                    showToast('网络异常，请重试', 'error');
                }
                restoreDrawerFocus();
            });
        };

        if (!isLogin) {
            resolveGuestName(dispatchNewAnnotation);
        } else {
            dispatchNewAnnotation('');
        }
    };

    var replySubmitting = {};
    window.submitReply = function(annoId) {
        var isLogin = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.id);
        var isGuestAllowed = (!isLogin && Boolean(window.GUEST_ANNOTATION_ENABLED));
        if (!isLogin && !isGuestAllowed) {
            if (typeof openLoginModal === 'function') openLoginModal();
            return;
        }

        if (replySubmitting[annoId]) return;

        var input = document.getElementById('replyInput_' + annoId);
        var content = input ? input.value.trim() : '';
        if (!content) return;

        var replySnapshot = {
            annoId: annoId,
            contextSequence: contextSequence,
            content: content
        };

        var dispatchReply = function(guestName) {
            if (replySubmitting[annoId]) return;
            if (replySnapshot.contextSequence !== contextSequence) {
                if (typeof showToast === 'function') {
                    showToast('上下文已切换，请重新点击回复确认', 'warning');
                }
                if (input && typeof input.focus === 'function') input.focus();
                return;
            }
            replySubmitting[annoId] = true;
            var btn = document.querySelector('#replyBox_' + annoId + ' button');
            var replyFocusTarget = (typeof document !== 'undefined' && document.activeElement && document.activeElement !== document.body)
                ? document.activeElement
                : null;
            if (btn) btn.disabled = true;

            var fd = new FormData();
            fd.append('action', 'reply_annotation');
            fd.append('annotation_id', replySnapshot.annoId);
            fd.append('content', replySnapshot.content);
            if (guestName) {
                fd.append('guest_name', guestName);
            }

            apiFetch(fd.get('action'), fd)
            .then(function(res) {
                delete replySubmitting[annoId];
                if (btn) btn.disabled = false;
                if (res.success && res.data) {
                    if (input) input.value = '';
                    AnnoState.list.forEach(function(item) {
                        if (item.id === annoId) {
                            if (!item.replies) item.replies = [];
                            item.replies.push(res.data);
                        }
                    });
                    renderAnnotationList();
                } else {
                    if (typeof showToast === 'function') {
                        showToast(res.message || '回复失败', 'error');
                    }
                }
                if (AnnoState.isOpen && typeof document !== 'undefined' && (!document.activeElement || document.activeElement === document.body)) {
                    var toggleReplyBtn = document.querySelector('#annoCard_' + annoId + ' [data-anno-reply-toggle="' + annoId + '"]');
                    if (res.success && res.data && toggleReplyBtn && toggleReplyBtn.isConnected && (!toggleReplyBtn.getClientRects || toggleReplyBtn.getClientRects().length > 0)) {
                        toggleReplyBtn.focus();
                    } else if (replyFocusTarget && replyFocusTarget.isConnected && !replyFocusTarget.disabled && (!replyFocusTarget.getClientRects || replyFocusTarget.getClientRects().length > 0) && typeof replyFocusTarget.focus === 'function') {
                        replyFocusTarget.focus();
                    } else if (toggleReplyBtn && typeof toggleReplyBtn.focus === 'function') {
                        toggleReplyBtn.focus();
                    }
                }
            })
            .catch(function() {
                delete replySubmitting[annoId];
                if (btn) btn.disabled = false;
                if (typeof showToast === 'function') {
                    showToast('网络异常，请重试', 'error');
                }
                if (AnnoState.isOpen && typeof document !== 'undefined' && (!document.activeElement || document.activeElement === document.body)) {
                    if (replyFocusTarget && replyFocusTarget.isConnected && !replyFocusTarget.disabled && typeof replyFocusTarget.focus === 'function') {
                        replyFocusTarget.focus();
                    }
                }
            });
        };

        if (!isLogin) {
            resolveGuestName(dispatchReply);
        } else {
            dispatchReply('');
        }
    };

    window.toggleAnnoStatus = function(annoId) {
        var fd = new FormData();
        fd.append('action', 'toggle_annotation_status');
        fd.append('id', annoId);

        apiFetch(fd.get('action'), fd)
        .then(function(res) {
            if (res.success && res.data) {
                AnnoState.list.forEach(function(item) {
                    if (item.id === annoId) {
                        item.status = res.data.status;
                        item.resolved_by = res.data.resolved_by;
                        item.resolved_at = res.data.resolved_at;
                    }
                });
                AnnoState.pendingCount = AnnoState.list.filter(function(i) { return i.status === 0; }).length;
                updateHeaderBadge();
                renderAnnotationList();
                if (typeof showToast === 'function') {
                    showToast(res.message, 'success');
                }
            } else {
                if (typeof showToast === 'function') {
                    showToast(res.message || '操作失败', 'error');
                }
            }
        });
    };

    window.deleteAnno = function(annoId) {
        var doDelete = function() {
            var fd = new FormData();
            fd.append('action', 'delete_annotation');
            fd.append('id', annoId);

            apiFetch(fd.get('action'), fd)
            .then(function(res) {
                if (res.success) {
                    AnnoState.list = AnnoState.list.filter(function(i) { return i.id !== annoId; });
                    AnnoState.pendingCount = AnnoState.list.filter(function(i) { return i.status === 0; }).length;
                    updateHeaderBadge();
                    renderAnnotationList();
                    if (typeof showToast === 'function') showToast('批注已删除', 'info');
                } else {
                    if (typeof showToast === 'function') showToast(res.message || '删除失败', 'error');
                }
            });
        };

        if (typeof showConfirm === 'function') {
            showConfirm({
                title: '删除批注',
                message: '确定删除此批注及其全部回复？',
                confirmText: '删除',
                isDanger: true,
                onConfirm: doDelete
            });
        } else if (typeof showToast === 'function') {
            showToast('确认组件未就绪，请刷新页面后重试', 'warning');
        }
    };

    window.focusAnnotation = function(id) {
        pendingFocusId = id; focusedAnnotationId = id;
        window.switchAnnoFilterMode('all'); window.switchAnnoStatusFilter('all');
        window.toggleAnnotationDrawer(true);
    };

    function annotationFrameHref(frame) {
        try {
            return frame.contentWindow.location.href || frame.src;
        } catch (e) {
            return frame.src;
        }
    }

    // 以服务端规范地址定位；只允许当前上下文的最后一次点击生效。
    window.jumpToAnnotationPage = function(annoId) {
        var id = parseInt(annoId, 10);
        if (!id || id <= 0) return;
        var sequence = ++jumpRequestSequence;
        var context = contextSequence;
        var itemId = AnnoState.itemId;
        var verId = AnnoState.verId;
        var frame = document.getElementById('myFrame') || document.getElementById('shareFrame');
        if (!frame) return Promise.resolve();
        var startingHref = annotationFrameHref(frame);
        function isCurrent() {
            return sequence === jumpRequestSequence && context === contextSequence
                && itemId === AnnoState.itemId && verId === AnnoState.verId
                && startingHref === annotationFrameHref(frame);
        }
        var requestUrl = 'api.php?action=annotation_target&id=' + encodeURIComponent(id);
        return fetch(requestUrl).then(function(r) { return r.json(); }).then(function(res) {
            if (!isCurrent()) return;
            if (!res || !res.success) throw new Error((res && res.message) || '批注不可访问');
            var target = res.data;
            if (!target) throw new Error('批注目标无效');
            if (parseInt(target.item_id, 10) !== itemId || parseInt(target.version_id, 10) !== verId) {
                throw new Error('批注不属于当前项目或版本');
            }

            if (target.page_url) {
                var currentUrl = new URL(startingHref, window.location.href);
                var targetUrl = new URL(target.page_url, window.location.href);
                // 宿主预览附加的缓存时间戳不属于页面身份；其他参数与 hash 保留。
                currentUrl.searchParams.delete('t');
                targetUrl.searchParams.delete('t');
                var sameDocument = currentUrl.origin === targetUrl.origin
                    && currentUrl.pathname === targetUrl.pathname && currentUrl.search === targetUrl.search;
                if (sameDocument && currentUrl.hash === targetUrl.hash) {
                    if (typeof showToast === 'function') showToast('当前已在此页面', 'info', 1800);
                } else {
                    try {
                        if (sameDocument) frame.contentWindow.location.hash = targetUrl.hash;
                        else frame.contentWindow.location.href = target.page_url;
                    } catch (e) {
                        frame.src = target.page_url;
                    }
                }
            } else if (typeof showToast === 'function') {
                showToast('原页面已不存在，请查看批注原文', 'warning');
            }

            if (window.history && window.history.replaceState) {
                window.history.replaceState(null, '', '#annotation=' + id);
            }
            window.focusAnnotation(id);
            if (target.annotation && target.annotation.needs_review && typeof showToast === 'function') {
                showToast('原型已更新，此批注需要重新核对', 'info');
            }
        }).catch(function(err) {
            if (!isCurrent()) return;
            if (typeof showToast === 'function') showToast(err.message || '跳转失败', 'error');
        });
    };
    function copyTextDirectly(text) {
        var fallback = function() {
            var input = document.createElement('textarea');
            input.value = text;
            input.style.position = 'fixed';
            input.style.opacity = '0';
            document.body.appendChild(input);
            try { input.select(); return !!document.execCommand('copy'); }
            catch (e) { return false; }
            finally { input.remove(); }
        };
        var copying = (navigator.clipboard && window.isSecureContext)
            ? navigator.clipboard.writeText(text).then(function() { return true; }, fallback)
            : Promise.resolve(fallback());
        return copying.then(function(copied) {
            if (typeof showToast === 'function') {
                showToast(copied ? '链接已复制到剪贴板' : '复制失败，请手动选择复制', copied ? 'success' : 'error');
            }
            return copied;
        });
    }

    window.copyAnnotationLink = function(id) {
        var link;
        var loc = window.location;
        if (loc.pathname.indexOf('share.php') !== -1 || loc.search.indexOf('s=') !== -1 || loc.search.indexOf('code=') !== -1) {
            var u = new URL(loc.href);
            u.hash = 'annotation=' + parseInt(id, 10);
            link = u.href;
        } else {
            link = new URL('index.php#annotation=' + parseInt(id, 10), loc.href).href;
        }
        if (typeof copyMcpText === 'function') {
            copyMcpText(link);
        } else {
            copyTextDirectly(link);
        }
    };
    window.reviewAnno = function(id) {
        var fd = new FormData();fd.append('id',id);
        apiFetch('review_annotation',fd).then(function(res) {
            if (!res.success) throw new Error(res.message || '复核失败');
            window.loadAnnotations();
        }).catch(function(e) {showToast(e.message || '复核失败','error');});
    };
    window.togglePreviousAnnotations = function() {
        // 【核心铁律】链接无版本，严格拦截「上版未决」读取
        if (AnnoState.itemType === 'link' || !AnnoState.verId) return;

        // 若当前已在上一版未决视图，再次点击则切回全部 (自然 Toggle 回弹)
        if (AnnoState.statusFilter === 'previous') {
            window.switchAnnoStatusFilter('all');
            return;
        }

        return window.switchAnnoStatusFilter('previous');
    };

    function historyCard(annotation, versionName) {
        var id = parseInt(annotation.id, 10);
        var timestamp = annotationTimestamp(annotation.created_at);
        var days = isNaN(timestamp) ? 0 : Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
        var ageClass = days > 30 ? 'aged' : (days > 7 ? 'settled' : 'recent');
        var time = isNaN(timestamp) ? '' : '<time class="anno-history-age" datetime="' + esc(new Date(timestamp).toISOString()) +
            '" title="' + esc(new Date(timestamp).toLocaleString()) + '">' + (days ? days + ' 天前' : '今天') + '</time>';
        return '<article class="anno-history-card anno-history-card--' + ageClass + '" data-annotation-id="' + id + '">' +
            '<div class="anno-history-meta"><span>' + esc(versionName) + '</span>' + time + '</div>' +
            '<strong class="anno-history-page">' + esc(annotation.page_title || annotation.page_path) + '</strong>' +
            '<p>' + esc(annotation.content) + '</p><div class="anno-history-actions">' +
            '<a class="anno-link-btn" href="index.php#annotation=' + id + '" target="_blank" rel="noopener">查看原批注</a>' +
            '<button type="button" class="btn-cancel btn-sm" onclick="carryAnnotation(' + id + ')">引用到本版</button></div></article>';
    }

    function loadPreviousAnnotations() {
        var panel = document.getElementById('annoPreviousPanel');
        if (!panel || AnnoState.statusFilter !== 'previous' || !AnnoState.verId || AnnoState.itemType === 'link') return;

        var sequence = ++previousRequestSequence;
        var context = contextSequence;
        var item = AnnoState.itemId;
        var version = AnnoState.verId;
        function isCurrent() {
            return sequence === previousRequestSequence && context === contextSequence && item === AnnoState.itemId &&
                version === AnnoState.verId && AnnoState.statusFilter === 'previous';
        }
        panel.innerHTML = '<div class="anno-history-message" role="status">正在读取上一版未解决批注…</div>';

        return fetch('api.php?action=previous_annotations&ver_id=' + version).then(function(r) { return r.json(); }).then(function(res) {
            if (!isCurrent()) return;
            if (!res.success) throw new Error(res.message || '读取失败');
            var list = res.data.list || [];
            if (!list.length) {
                panel.innerHTML = '<div class="anno-history-message">' + getAnnoEmptySvg('previous') + '<p>上一版没有未解决批注</p></div>';
                return;
            }
            panel.innerHTML = list.map(function(a) {
                return historyCard(a, res.data.version_name);
            }).join('');
        }).catch(function(e) {
            if (isCurrent()) {
                panel.innerHTML = '<div class="anno-history-message anno-history-error" role="alert">' + esc(e.message || '读取失败') + '</div>';
            }
        });
    }
    window.carryAnnotation = function(id) {
        if (AnnoState.itemType === 'link' || !AnnoState.verId) return;
        var sequence = contextSequence;
        var fd = new FormData();fd.append('id',id);fd.append('ver_id',AnnoState.verId);
        apiFetch('carry_annotation',fd).then(function(res) {
            if (sequence !== contextSequence) return;
            if (!res.success) throw new Error(res.message || '引用失败');
            window.focusAnnotation(parseInt(res.data.id,10));window.loadAnnotations();showToast('已引用到当前版本','success');
        }).catch(function(e) {if (sequence === contextSequence) showToast(e.message || '引用失败','error');});
    };

    // 统一处理批注快捷键 C 与 ESC
    function handleAnnotationHotkey(e) {
        if (!e) return;

        // 1. 修饰键绝对安全守卫：避免干扰系统复制、全选等 (Cmd+C, Ctrl+C, Alt+C)
        if (e.metaKey || e.ctrlKey || e.altKey) {
            return;
        }

        // 2. 输入域保护：如果焦点在输入框、文本域或富文本可编辑元素中打字，放行正常输入
        var target = e.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
            return;
        }

        // 3. 模态弹窗打开时放行（如控制台、发版等打开时不误触）
        if (document.querySelector('.custom-modal[style*="display: block"], .custom-modal[style*="display:block"], .custom-modal[style*="display: flex"]')) {
            return;
        }

        // 4. 按键判断
        var key = e.key;
        if (key === 'c' || key === 'C') {
            // 只有处于活跃原型查看时才响应 (选文件夹/空状态时坚决不响应)
            if (!isProtoViewActive()) {
                return;
            }
            e.preventDefault();
            if (typeof e.stopPropagation === 'function') e.stopPropagation();
            window.toggleAnnotationDrawer();
            return;
        }

        if (key === 'Escape' || e.keyCode === 27) {
            if (AnnoState.isOpen) {
                e.preventDefault();
                if (typeof e.stopPropagation === 'function') e.stopPropagation();
                window.toggleAnnotationDrawer(false);
            }
        }
    }

    // 递归穿透绑定同源 iframe 及其内部嵌套子 iframe (支持 Axure #mainFrame 场景)
    function bindFrameHotkeys(win) {
        if (!win) return;
        try {
            if (!win.__annoHotkeyAttached) {
                win.__annoHotkeyAttached = true;
                win.addEventListener('keydown', handleAnnotationHotkey, true);
                if (win.document) {
                    win.document.addEventListener('keydown', handleAnnotationHotkey, true);
                }
            }

            // 递归扫描并绑定子 iframe
            var doc = win.document;
            if (doc) {
                var subFrames = doc.querySelectorAll('iframe, frame');
                for (var i = 0; i < subFrames.length; i++) {
                    var sf = subFrames[i];
                    try {
                        if (sf.contentWindow) {
                            bindFrameHotkeys(sf.contentWindow);
                        }
                        if (!sf.__annoLoadAttached) {
                            sf.__annoLoadAttached = true;
                            sf.addEventListener('load', function() {
                                try {
                                    if (this.contentWindow) {
                                        bindFrameHotkeys(this.contentWindow);
                                    }
                                } catch(err) {}
                            });
                        }
                    } catch(err) {}
                }
            }
        } catch(e) {}
    }

    // 递归穿透探测当前真正承载原型的活跃视口 (深度兼容 Axure #mainFrame、嵌套沙箱与普通多页面)
    var cachedOuterFrame = null;
    function getActiveFrameInfo() {
        var frame = document.getElementById('myFrame') || document.getElementById('shareFrame') || cachedOuterFrame;
        if (!frame) return null;
        cachedOuterFrame = frame;

        var outerWin = null;
        var outerDoc = null;
        try {
            outerWin = frame.contentWindow;
            outerDoc = frame.contentDocument || (outerWin ? outerWin.document : null);
        } catch(e) {
            return null;
        }
        if (!outerDoc || !outerWin) return null;

        // 探测 Axure 播放器框架内承载具体页面的子 iframe (#mainFrame)
        var subFrame = null;
        try {
            subFrame = outerDoc.getElementById('mainFrame') || outerDoc.querySelector('iframe[name="mainFrame"]');
            if (!subFrame) {
                var allIframes = outerDoc.querySelectorAll('iframe, frame');
                if (allIframes.length === 1) {
                    subFrame = allIframes[0];
                }
            }
        } catch(e) {}

        var activeWin = outerWin;
        var activeDoc = outerDoc;
        var isSubFrame = false;

        if (subFrame && subFrame.contentWindow) {
            try {
                var sWin = subFrame.contentWindow;
                var sDoc = subFrame.contentDocument || sWin.document;
                var sPath = (sWin.location && sWin.location.pathname) ? sWin.location.pathname : '';
                // 排除未就绪或空白状态
                if (sDoc && sPath && sPath !== 'about:blank' && sPath.indexOf('about:blank') === -1) {
                    activeWin = sWin;
                    activeDoc = sDoc;
                    isSubFrame = true;
                }
            } catch(e) {}
        }

        return {
            frame: frame,
            outerWin: outerWin,
            outerDoc: outerDoc,
            subFrame: subFrame,
            activeWin: activeWin,
            activeDoc: activeDoc,
            isSubFrame: isSubFrame
        };
    }

    // 解析当前视口的真实相对路径与页面标题 (多源智能提取：Axure官方API + Sitemap嵌套面包屑 + 子DOM Title + Hash回溯)
    function resolvePageContext(info) {
        if (!info || !info.outerWin) return null;

        // 1. 尝试从子 iframe 或外层 iframe 获取相对路径与版本号
        var activeLoc = (info.activeWin && info.activeWin.location) ? info.activeWin.location : info.outerWin.location;
        var outerLoc = info.outerWin.location;

        var activePath = (activeLoc && activeLoc.pathname) ? activeLoc.pathname : '';
        var outerPath = (outerLoc && outerLoc.pathname) ? outerLoc.pathname : '';

        var match = activePath.match(/\/asset\.php\/v([1-9][0-9]*)\/(.+)$/) ||
                    outerPath.match(/\/asset\.php\/v([1-9][0-9]*)\/(.+)$/);

        var versionIdFromUrl = match ? parseInt(match[1], 10) : 0;
        if (!AnnoState.itemId || !AnnoState.verId || versionIdFromUrl !== AnnoState.verId) {
            return null;
        }

        var fullRelPath = match ? decodeURIComponent(match[2]) : '';

        // 提取外层父目录前缀 (例如 '一休运营1023/')
        var dirPrefix = '';
        if (fullRelPath) {
            var lastSlash = fullRelPath.lastIndexOf('/');
            if (lastSlash !== -1) {
                dirPrefix = fullRelPath.substring(0, lastSlash + 1);
            }
        }

        // 2. 检查 Axure 播放器官方 API (最权威的实时状态)
        var axurePageName = '';
        var axurePageLoc = '';
        try {
            if (info.outerWin.$axure && info.outerWin.$axure.page) {
                axurePageName = (info.outerWin.$axure.page.pageName || '').trim();
                axurePageLoc = (info.outerWin.$axure.page.location || '').trim();
            }
        } catch(e) {}

        // 3. 从 Axure 原生顶栏标题容器获取页面名称 (.pageNameHeader / #interfacePageNameButton)
        var domHeaderPageName = '';
        if (info.outerDoc) {
            try {
                var headerEl = info.outerDoc.querySelector('.pageNameHeader, #interfacePageNameButton');
                if (headerEl) {
                    var hText = (headerEl.textContent || '').trim();
                    // 净化剔除末尾类似 "(3 / 10)" 的翻页计数后缀
                    hText = hText.replace(/\s*\(\s*\d+\s*\/\s*\d+\s*\)\s*$/, '').trim();
                    domHeaderPageName = hText;
                }
            } catch(e) {}
        }

        // 4. 从 Axure 官方文档模型或 Sitemap 树构建嵌套层级面包屑 (深度支持多层嵌套树)
        var sitemapPageName = '';
        var breadcrumbPath = '';

        // 优先方案 A: 通过 Axure 官方 $axure.document.sitemap.rootNodes 递归检索权威层级树
        try {
            var sitemapData = null;
            if (info.outerWin && info.outerWin.$axure && info.outerWin.$axure.document && info.outerWin.$axure.document.sitemap) {
                sitemapData = info.outerWin.$axure.document.sitemap.rootNodes;
            }
            if (sitemapData && sitemapData.length) {
                var targetFile = '';
                if (activePath) {
                    var sIdx = activePath.lastIndexOf('/');
                    targetFile = sIdx !== -1 ? decodeURIComponent(activePath.substring(sIdx + 1)) : decodeURIComponent(activePath);
                }
                var targetName = axurePageName || domHeaderPageName;

                function findTreePath(nodes) {
                    if (!nodes || !nodes.length) return null;
                    for (var i = 0; i < nodes.length; i++) {
                        var n = nodes[i];
                        var nUrl = (n.url || '').trim();
                        var nName = (n.pageName || '').trim();
                        var isMatch = false;

                        if (targetFile && nUrl) {
                            var cleanFile = targetFile.replace(/\.html.*$/i, '');
                            var cleanUrl = nUrl.replace(/\.html.*$/i, '');
                            if (cleanFile === cleanUrl || targetFile === nUrl) {
                                isMatch = true;
                            }
                        }
                        if (!isMatch && targetName && nName && (targetName === nName || targetName.indexOf(nName) !== -1)) {
                            isMatch = true;
                        }

                        if (isMatch) {
                            return [nName];
                        }
                        if (n.children && n.children.length) {
                            var sub = findTreePath(n.children);
                            if (sub && sub.length) {
                                return [nName].concat(sub);
                            }
                        }
                    }
                    return null;
                }

                var matchedCrumbs = findTreePath(sitemapData);
                if (matchedCrumbs && matchedCrumbs.length) {
                    breadcrumbPath = matchedCrumbs.join(' › ');
                    sitemapPageName = matchedCrumbs[matchedCrumbs.length - 1];
                }
            }
        } catch(e) {}

        // 方案 B 兜底: 从 DOM Sitemap 树回溯当前激活节点与嵌套面包屑
        if (!breadcrumbPath && info.outerDoc) {
            try {
                var highlightEl = info.outerDoc.querySelector(
                    '#sitemapTreeContainer .sitemapHighlight, ' +
                    '#sitemapTreeContainer .selected, ' +
                    '.sitemapHighlight'
                );
                if (highlightEl) {
                    function extractNodeText(container) {
                        if (!container) return '';
                        var tagEl = container.querySelector('.sitemapPageNameTag, [data-sitemap-page-name-tag]');
                        var tagVal = tagEl ? (tagEl.getAttribute('data-sitemap-page-name-tag') || tagEl.textContent || '').trim() : '';
                        var nameEl = container.querySelector('.sitemapPageName, .sitemapPageLink');
                        var textVal = nameEl ? (nameEl.textContent || '').trim() : '';
                        if (tagVal && textVal.indexOf(tagVal) === -1) {
                            return (tagVal + ' ' + textVal).trim();
                        }
                        return textVal || tagVal;
                    }

                    sitemapPageName = extractNodeText(highlightEl);

                    // 向上遍历父级节点构建嵌套面包屑
                    var crumbs = [];
                    if (sitemapPageName) crumbs.unshift(sitemapPageName);

                    var curLi = highlightEl.closest ? highlightEl.closest('li.sitemapNode') : null;
                    while (curLi) {
                        var parentLi = (curLi.parentElement && curLi.parentElement.closest) ? curLi.parentElement.closest('li.sitemapNode') : null;
                        if (parentLi) {
                            var pName = extractNodeText(parentLi);
                            if (pName && crumbs.indexOf(pName) === -1) {
                                crumbs.unshift(pName);
                            }
                            curLi = parentLi;
                        } else {
                            break;
                        }
                    }

                    if (crumbs.length > 1) {
                        breadcrumbPath = crumbs.join(' › ');
                    }
                }
            } catch(e) {}
        }

        // 5. 从 Hash 中提取 p= 变量
        var hash = (activeLoc && activeLoc.hash) || (outerLoc && outerLoc.hash) || '';
        var hashPageParam = '';
        if (hash && hash.indexOf('p=') !== -1) {
            var pMatch = hash.match(/p=([^&]+)/);
            if (pMatch) {
                hashPageParam = decodeURIComponent(pMatch[1]).trim();
            }
        }

        // 6. 确定真实页面相对路径 (pagePath)
        var finalRelPath = fullRelPath;
        if (info.isSubFrame && activePath) {
            var subMatch = activePath.match(/\/asset\.php\/v([1-9][0-9]*)\/(.+)$/);
            if (subMatch) {
                finalRelPath = decodeURIComponent(subMatch[2]);
            }
        } else if (axurePageLoc) {
            finalRelPath = dirPrefix + axurePageLoc;
        }

        if (hashPageParam) {
            if (finalRelPath.indexOf('#page_') === -1) {
                finalRelPath += '#page_' + hashPageParam;
            }
        }

        // 7. 智能确定最终展示的页面标题 (pageTitle)
        var resolvedTitle = '';
        if (breadcrumbPath) {
            resolvedTitle = breadcrumbPath;
        } else if (axurePageName) {
            resolvedTitle = axurePageName;
        } else if (domHeaderPageName) {
            resolvedTitle = domHeaderPageName;
        } else if (sitemapPageName) {
            resolvedTitle = sitemapPageName;
        } else if (info.activeDoc && info.activeDoc.title) {
            var rawDocTitle = (info.activeDoc.title || '').trim();
            var isPlaceholder = !rawDocTitle || rawDocTitle === '未命名文档' ||
                                rawDocTitle.toLowerCase() === 'untitled' ||
                                rawDocTitle.toLowerCase() === 'start';
            if (!isPlaceholder) {
                resolvedTitle = rawDocTitle;
            }
        }

        if (!resolvedTitle && hashPageParam) {
            resolvedTitle = hashPageParam.replace(/_/g, ' ');
        }

        if (!resolvedTitle && finalRelPath) {
            var slashIdx = finalRelPath.lastIndexOf('/');
            var fileName = slashIdx !== -1 ? finalRelPath.substring(slashIdx + 1) : finalRelPath;
            var cleanFileName = fileName.replace(/\.html(\?.*)?(#.*)?$/i, '').replace(/_/g, ' ');
            if (cleanFileName.toLowerCase() !== 'start' && cleanFileName !== 'start_with_pages' && cleanFileName !== 'index') {
                resolvedTitle = cleanFileName;
            }
        }

        if (!resolvedTitle) {
            if (axurePageName || domHeaderPageName) {
                resolvedTitle = axurePageName || domHeaderPageName;
            } else if (sitemapPageName) {
                resolvedTitle = sitemapPageName;
            }
        }

        return {
            pagePath: finalRelPath,
            pageTitle: resolvedTitle
        };
    }

    // 核心上下文同步逻辑
    function updateContext(force) {
        if (AnnoState.itemType === 'link') {
            // 外链模式：若为同源简单网页则尝试自适应读取网页标题，若跨域或无 iframe 静默安全兜底
            var info = getActiveFrameInfo();
            if (info && info.doc) {
                try {
                    var docTitle = (info.doc.title || '').trim();
                    if (docTitle && docTitle !== AnnoState.pageTitle) {
                        AnnoState.pageTitle = docTitle;
                        var titleEl = document.getElementById('annoCurPageTitle');
                        if (titleEl) {
                            titleEl.textContent = docTitle;
                            titleEl.setAttribute('title', docTitle);
                        }
                    }
                } catch (e) {}
            }
            AnnoState.ready = true;
            syncComposer();
            return;
        }

        var info = getActiveFrameInfo();
        if (!info) {
            AnnoState.ready = false;
            syncComposer();
            return;
        }

        var resolved = resolvePageContext(info);
        if (!resolved) {
            AnnoState.ready = false;
            syncComposer();
            return;
        }

        var wasReady = AnnoState.ready;
        var isPathChanged = (AnnoState.pagePath !== resolved.pagePath);
        var isTitleChanged = (AnnoState.pageTitle !== resolved.pageTitle);

        AnnoState.ready = true;
        syncComposer();

        if (force || !wasReady || isPathChanged || isTitleChanged) {
            AnnoState.pagePath = resolved.pagePath;
            AnnoState.pageTitle = resolved.pageTitle;

            var titleEl = document.getElementById('annoCurPageTitle');
            if (titleEl) {
                var displayTitle = resolved.pageTitle || resolved.pagePath || '原型页面';
                titleEl.textContent = displayTitle;
                titleEl.setAttribute('title', displayTitle);
            }

            // 若页面切换且当前处于“本页批注”模式，即时刷新过滤列表
            if (isPathChanged) {
                if (AnnoState.filterMode === 'page') {
                    renderAnnotationList();
                }
                window.loadAnnotations();
            }
        }

        // 为子 iframe 绑定翻页监听与按键代理
        if (info.subFrame && !info.subFrame.__annoContextBound) {
            info.subFrame.__annoContextBound = true;
            info.subFrame.addEventListener('load', function() {
                setTimeout(function() {
                    updateContext(true);
                    try {
                        if (info.subFrame.contentWindow) {
                            bindFrameHotkeys(info.subFrame.contentWindow);
                        }
                    } catch(e) {}
                }, 60);
            });
        }
    }
    updateActiveContext = updateContext;

    // 监听同源 iframe 内部翻页与上下文捕获 (含 Axure mainFrame 穿透、Hash 切换与按键穿透代理)
    function attachIframeListener() {
        var frame = document.getElementById('myFrame') || document.getElementById('shareFrame');
        if (!frame) return;
        cachedOuterFrame = frame;

        function onIframeLoadOrChange() {
            updateContext(true);
            try {
                if (frame.contentWindow) {
                    bindFrameHotkeys(frame.contentWindow);
                }
            } catch(e) {}
        }

        frame.addEventListener('load', function() {
            onIframeLoadOrChange();
            try {
                if (frame.contentWindow) {
                    frame.contentWindow.addEventListener('hashchange', function() {
                        updateContext(false);
                    });
                    frame.contentWindow.addEventListener('click', function() {
                        setTimeout(function() { updateContext(false); }, 50);
                        setTimeout(function() { updateContext(false); }, 150);
                        setTimeout(function() { updateContext(false); }, 350);
                        setTimeout(function() { updateContext(false); }, 700);
                    }, true);
                    frame.contentWindow.addEventListener('mousedown', function() {
                        bindFrameHotkeys(frame.contentWindow);
                        setTimeout(function() { updateContext(false); }, 50);
                        setTimeout(function() { updateContext(false); }, 150);
                        setTimeout(function() { updateContext(false); }, 350);
                        setTimeout(function() { updateContext(false); }, 700);
                    }, true);
                }
            } catch(e) {}
        });
    }

    // 宿主全局按键监听 (支持快捷键 C 与输入框内 Cmd/Ctrl+Enter 提交)
    document.addEventListener('keydown', function(e) {
        if (e.target && e.target.id === 'annoNewInput' && (e.metaKey || e.ctrlKey) && (e.key === 'Enter' || e.keyCode === 13)) {
            e.preventDefault();
            window.submitNewAnnotation();
            return;
        }
        handleAnnotationHotkey(e);
    });

    // 初始化运行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            attachIframeListener();
            syncComposer();
            updateHeaderBadge();
        });
    } else {
        attachIframeListener();
        syncComposer();
        updateHeaderBadge();
    }
})();
