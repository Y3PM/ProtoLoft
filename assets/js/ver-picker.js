/**
 * 立象原型 · Linear 风格统一下拉选择器 (ver-picker.js)
 * 渐进增强全站单选 select（顶栏版本切换 + 弹窗/控制中心/工具栏下拉），
 * 保持原生 DOM/value/change 事件及自动化测试 100% 兼容。
 */
(function(global) {
    'use strict';

    var SELECT_SELECTOR = 'select.top-ver-select, select.m-input, select.m-select, select.m-select-sm, select.m-select-md';
    var instances = [];
    var globalListenersBound = false;
    var protoHooked = false;

    function getOptionLabel(opt) {
        return String(opt.getAttribute('data-ver') || opt.textContent || '').trim();
    }

    function getSelectVariant(selectEl) {
        var cls = selectEl.classList;
        if (cls.contains('top-ver-select')) return 'ver';
        if (cls.contains('m-select-sm')) return 'sm';
        if (cls.contains('m-select-md')) return 'md';
        return 'lg';
    }

    function shouldEnhanceSelect(selectEl) {
        if (!selectEl || selectEl.tagName !== 'SELECT') return false;
        if (selectEl.multiple || selectEl.hasAttribute('hidden') || selectEl.hasAttribute('data-native-select')) return false;
        var cls = selectEl.classList;
        if (!cls) return false;
        return cls.contains('top-ver-select') || cls.contains('m-input') || cls.contains('m-select')
            || cls.contains('m-select-sm') || cls.contains('m-select-md');
    }

    function closeOtherMenus(exceptInst) {
        for (var i = 0; i < instances.length; i++) {
            if (instances[i] !== exceptInst) {
                instances[i].close(false);
            }
        }
        var logPops = ['topChangelogPopover', 'shareChangelogPopover', 'adminMultiSelectMenu'];
        for (var j = 0; j < logPops.length; j++) {
            var pop = document.getElementById(logPops[j]);
            if (pop && pop.style.display !== 'none') {
                pop.style.display = 'none';
            }
        }
        var multiTrig = document.getElementById('adminMultiSelectTrigger');
        if (multiTrig) multiTrig.setAttribute('aria-expanded', 'false');
    }

    function hookNativeSelectSetters() {
        if (protoHooked) return;
        protoHooked = true;
        if (typeof HTMLSelectElement !== 'undefined' && HTMLSelectElement.prototype) {
            ['value', 'selectedIndex'].forEach(function(prop) {
                var desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, prop);
                if (!desc || !desc.set || !desc.get || desc.configurable === false) return;
                Object.defineProperty(HTMLSelectElement.prototype, prop, {
                    configurable: true,
                    enumerable: desc.enumerable,
                    get: function() { return desc.get.call(this); },
                    set: function(v) {
                        desc.set.call(this, v);
                        if (this._verPickerInst) this._verPickerInst.syncFromSelect();
                    }
                });
            });
        }
        if (typeof HTMLOptionElement !== 'undefined' && HTMLOptionElement.prototype) {
            var optDesc = Object.getOwnPropertyDescriptor(HTMLOptionElement.prototype, 'selected');
            if (optDesc && optDesc.set && optDesc.get && optDesc.configurable !== false) {
                Object.defineProperty(HTMLOptionElement.prototype, 'selected', {
                    configurable: true,
                    enumerable: optDesc.enumerable,
                    get: function() { return optDesc.get.call(this); },
                    set: function(v) {
                        optDesc.set.call(this, v);
                        var parent = this.parentElement;
                        while (parent && parent.tagName !== 'SELECT') parent = parent.parentElement;
                        if (parent && parent._verPickerInst) parent._verPickerInst.syncFromSelect();
                    }
                });
            }
        }
    }

    function bindGlobalListeners() {
        if (globalListenersBound) return;
        globalListenersBound = true;

        document.addEventListener('click', function(e) {
            for (var i = 0; i < instances.length; i++) {
                var inst = instances[i];
                if (inst.isOpen && !inst.wrap.contains(e.target) && !inst.menu.contains(e.target)) {
                    inst.close(false);
                }
            }
        });

        // 捕获阶段优先拦截 ESC，避免关闭下拉时连带关掉所在弹窗
        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Escape') return;
            if (global.closeAllVersionPickers && global.closeAllVersionPickers()) {
                e.preventDefault();
                if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
                else e.stopPropagation();
            }
        }, true);

        document.addEventListener('scroll', function(e) {
            for (var i = 0; i < instances.length; i++) {
                var inst = instances[i];
                if (!inst.isOpen) continue;
                if (e && e.target && (e.target === inst.menu || (inst.menu.contains && inst.menu.contains(e.target)))) {
                    continue;
                }
                inst.close(false);
            }
        }, true);

        global.addEventListener('resize', function() {
            closeOtherMenus(null);
        });

        // 工作台右侧为 iframe 画布，点击画布会触发主窗口 blur，顺带收起菜单
        global.addEventListener('blur', function() {
            closeOtherMenus(null);
        });

        document.addEventListener('reset', function() {
            setTimeout(function() {
                for (var i = 0; i < instances.length; i++) {
                    instances[i].syncFromSelect();
                }
            }, 0);
        });
    }

    function copyLayoutConstraints(selectEl, wrap, variant) {
        if (variant === 'lg') {
            wrap.classList.add('is-block');
        }
        var copyClasses = ['dashboard-project-filter', 'dashboard-version-filter'];
        for (var i = 0; i < copyClasses.length; i++) {
            if (selectEl.classList.contains(copyClasses[i])) {
                wrap.classList.add(copyClasses[i]);
            }
        }
        if (selectEl.style) {
            if (selectEl.style.width) wrap.style.width = selectEl.style.width;
            if (selectEl.style.minWidth) wrap.style.minWidth = selectEl.style.minWidth;
            if (selectEl.style.maxWidth) wrap.style.maxWidth = selectEl.style.maxWidth;
            if (selectEl.style.flex) wrap.style.flex = selectEl.style.flex;
            if (selectEl.style.marginRight) wrap.style.marginRight = selectEl.style.marginRight;
        }
    }

    function createPickerInstance(selectEl) {
        if (!shouldEnhanceSelect(selectEl)) return null;
        if (selectEl._verPickerInst) return selectEl._verPickerInst;

        hookNativeSelectSetters();

        var variant = getSelectVariant(selectEl);
        var wrap = selectEl.closest ? selectEl.closest('.ver-picker-wrap') : null;
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.className = 'ver-picker-wrap';
            selectEl.parentNode.insertBefore(wrap, selectEl);
            wrap.appendChild(selectEl);
        }

        copyLayoutConstraints(selectEl, wrap, variant);
        selectEl.tabIndex = -1;
        selectEl.setAttribute('aria-hidden', 'true');
        wrap.classList.add('is-enhanced');

        var trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');

        if (variant === 'ver') {
            trigger.className = 'top-ver-trigger';
            var branchIcon = document.createElement('i');
            branchIcon.className = 'ri-git-branch-line top-ver-trigger-branch';
            branchIcon.setAttribute('aria-hidden', 'true');
            trigger.appendChild(branchIcon);
        } else {
            trigger.className = 'linear-select-trigger is-' + variant;
        }

        var triggerText = document.createElement('span');
        triggerText.className = (variant === 'ver') ? 'top-ver-trigger-text' : 'linear-select-trigger-text';

        var triggerArrow = document.createElement('i');
        triggerArrow.className = 'ri-arrow-down-s-line ' + (variant === 'ver' ? 'top-ver-trigger-arrow' : 'linear-select-trigger-arrow');
        triggerArrow.setAttribute('aria-hidden', 'true');

        trigger.appendChild(triggerText);
        trigger.appendChild(triggerArrow);
        wrap.appendChild(trigger);

        var menu = document.createElement('div');
        menu.className = 'ver-popover-menu' + (variant === 'ver' ? '' : ' is-compact');
        menu.setAttribute('role', 'listbox');
        menu.hidden = true;

        var listEl = document.createElement('div');
        listEl.className = 'ver-popover-list';
        menu.appendChild(listEl);
        wrap.appendChild(menu);

        var inst = {
            select: selectEl,
            wrap: wrap,
            trigger: trigger,
            menu: menu,
            variant: variant,
            isOpen: false,
            activeIndex: -1,
            visibleItems: [],

            syncFromSelect: function() {
                var hidden = (selectEl.style.display === 'none' || selectEl.hidden);
                if (hidden) {
                    wrap.style.display = 'none';
                    inst.close(false);
                    return;
                }
                wrap.style.display = (variant === 'lg' || wrap.style.width === '100%') ? 'flex' : 'inline-flex';
                trigger.disabled = !!selectEl.disabled;
                trigger.classList.toggle('m-input-error', selectEl.classList.contains('m-input-error'));

                var opts = selectEl.options;
                var selIdx = selectEl.selectedIndex;
                var currentOpt = (selIdx >= 0 && selIdx < opts.length) ? opts[selIdx] : opts[0];
                var label = currentOpt ? getOptionLabel(currentOpt) : '';
                triggerText.textContent = label || '请选择';
                trigger.title = label || selectEl.getAttribute('title') || '';

                var hasNewOpt = false;
                for (var oi = 0; oi < opts.length; oi++) {
                    if (opts[oi].getAttribute('data-is-new') === '1') {
                        hasNewOpt = true;
                        break;
                    }
                }
                trigger.classList.toggle('has-new-ver', hasNewOpt);

                if (inst.isOpen) {
                    inst.renderList();
                }
            },

            appendOptionBtn: function(opt, optIdx, container) {
                var label = getOptionLabel(opt);
                var isSelected = (optIdx === selectEl.selectedIndex);
                var isDisabled = !!opt.disabled;

                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'ver-popover-item' + (isSelected ? ' is-selected' : '') + (isDisabled ? ' is-disabled' : '');
                btn.setAttribute('role', 'option');
                btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
                btn.setAttribute('data-opt-index', String(optIdx));
                btn.disabled = isDisabled;
                btn.title = label;

                var nameSpan = document.createElement('span');
                nameSpan.className = 'ver-popover-item-name';
                nameSpan.textContent = label;

                var checkIcon = document.createElement('i');
                checkIcon.className = 'ri-check-line ver-popover-check';
                checkIcon.setAttribute('aria-hidden', 'true');

                btn.appendChild(nameSpan);

                var isNew = (opt.getAttribute('data-is-new') === '1');
                if (isNew) {
                    btn.classList.add('has-new-tag');
                    var newBadge = document.createElement('span');
                    newBadge.className = 'ver-popover-item-new-tag';
                    newBadge.textContent = '新';
                    btn.appendChild(newBadge);
                }

                btn.appendChild(checkIcon);

                if (!isDisabled) {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        inst.selectOptionIndex(optIdx);
                    });
                }

                if (isSelected && inst.activeIndex === -1) {
                    inst.activeIndex = inst.visibleItems.length;
                }
                if (!isDisabled) {
                    inst.visibleItems.push(btn);
                }
                container.appendChild(btn);
            },

            renderList: function() {
                listEl.innerHTML = '';
                inst.visibleItems = [];
                inst.activeIndex = -1;

                var frag = document.createDocumentFragment();
                var optIdx = 0;
                var children = selectEl.children || [];
                if (children.length > 0) {
                    for (var i = 0; i < children.length; i++) {
                        var child = children[i];
                        if (child.tagName === 'OPTGROUP') {
                            var groupOpts = child.children || [];
                            if (!groupOpts.length) continue;
                            var groupLabel = document.createElement('div');
                            groupLabel.className = 'linear-select-group-label';
                            groupLabel.textContent = child.getAttribute('label') || '';
                            frag.appendChild(groupLabel);
                            for (var j = 0; j < groupOpts.length; j++) {
                                if (groupOpts[j].tagName === 'OPTION') {
                                    inst.appendOptionBtn(groupOpts[j], optIdx++, frag);
                                }
                            }
                        } else if (child.tagName === 'OPTION') {
                            inst.appendOptionBtn(child, optIdx++, frag);
                        }
                    }
                } else {
                    for (var k = 0; k < selectEl.options.length; k++) {
                        inst.appendOptionBtn(selectEl.options[k], k, frag);
                    }
                }

                listEl.appendChild(frag);
                if (inst.activeIndex >= 0) {
                    inst.highlightIndex(inst.activeIndex, false);
                }
            },

            highlightIndex: function(idx, scrollIntoView, moveFocus) {
                for (var i = 0; i < inst.visibleItems.length; i++) {
                    inst.visibleItems[i].classList.toggle('is-active', i === idx);
                }
                inst.activeIndex = idx;
                var activeBtn = (idx >= 0 && inst.visibleItems[idx]) ? inst.visibleItems[idx] : null;
                if (activeBtn && scrollIntoView && typeof activeBtn.scrollIntoView === 'function') {
                    activeBtn.scrollIntoView({ block: 'nearest' });
                }
                if (activeBtn && moveFocus && typeof activeBtn.focus === 'function') {
                    try {
                        activeBtn.focus({ preventScroll: !!scrollIntoView });
                    } catch (err) {
                        activeBtn.focus();
                    }
                }
            },

            selectOptionIndex: function(optIdx) {
                var isNewOpt = false;
                if (selectEl.options && selectEl.options[optIdx]) {
                    isNewOpt = (selectEl.options[optIdx].getAttribute('data-is-new') === '1');
                }
                var changed = (selectEl.selectedIndex !== optIdx);
                selectEl.selectedIndex = optIdx;
                selectEl.classList.remove('m-input-error');
                inst.close(true);
                inst.syncFromSelect();
                if (changed || isNewOpt) {
                    var ev;
                    try {
                        ev = new Event('change', { bubbles: true });
                    } catch (err) {
                        ev = document.createEvent('Event');
                        ev.initEvent('change', true, true);
                    }
                    selectEl.dispatchEvent(ev);
                }
            },

            positionMenu: function() {
                if (variant === 'ver') {
                    menu.classList.remove('align-right');
                    var vRect = menu.getBoundingClientRect();
                    var vwVer = window.innerWidth || document.documentElement.clientWidth || 1280;
                    if (vRect.right > vwVer - 12) {
                        menu.classList.add('align-right');
                    }
                    return;
                }

                // 弹窗/滚动区域内的下拉挂载到当前弹窗根节点或 body，使用 fixed 彻底避免 overflow 裁剪
                var host = wrap.closest ? wrap.closest('.custom-modal, .admin-console-modal') : null;
                if (!host) host = document.body;
                if (host && menu.parentNode !== host) {
                    host.appendChild(menu);
                }

                var rect = trigger.getBoundingClientRect() || {};
                var rectWidth = rect.width || 160;
                var rectLeft = rect.left || 0;
                var rectTop = rect.top || 0;
                var rectBottom = rect.bottom || 0;
                var rectRight = rect.right || (rectLeft + rectWidth);
                var vw = window.innerWidth || document.documentElement.clientWidth || 1280;
                var vh = window.innerHeight || document.documentElement.clientHeight || 800;

                menu.style.position = 'fixed';
                menu.style.minWidth = Math.max(rectWidth, 136) + 'px';
                menu.style.maxWidth = Math.max(rectWidth, Math.min(380, vw - 24)) + 'px';
                menu.style.width = (variant === 'lg' || wrap.style.width === '100%') ? (rectWidth + 'px') : 'auto';
                menu.style.left = '0px';
                menu.style.top = '0px';

                var spaceBelow = vh - rectBottom - 10;
                var spaceAbove = rectTop - 10;
                var openUp = (spaceBelow < 180 && spaceAbove > spaceBelow);
                var availHeight = Math.max(110, Math.min(280, openUp ? spaceAbove : spaceBelow));
                listEl.style.maxHeight = availHeight + 'px';

                var mRect = menu.getBoundingClientRect() || {};
                var mWidth = mRect.width || rectWidth;
                var mHeight = mRect.height || 180;
                var left = rectLeft;
                if (left + mWidth > vw - 12) {
                    left = Math.max(12, rectRight - mWidth);
                }
                var top = openUp ? Math.max(10, rectTop - mHeight - 4) : (rectBottom + 4);
                menu.style.left = Math.round(left) + 'px';
                menu.style.top = Math.round(top) + 'px';
            },

            open: function() {
                if (inst.isOpen || selectEl.disabled || selectEl.options.length === 0) return;
                closeOtherMenus(inst);
                inst.isOpen = true;
                menu.hidden = false;
                trigger.setAttribute('aria-expanded', 'true');
                trigger.classList.add('is-open');
                inst.renderList();
                inst.positionMenu();

                if (inst.activeIndex >= 0 && inst.visibleItems[inst.activeIndex]) {
                    inst.visibleItems[inst.activeIndex].focus();
                } else {
                    menu.tabIndex = -1;
                    menu.focus();
                }
            },

            close: function(restoreFocus) {
                if (!inst.isOpen) return;
                inst.isOpen = false;
                menu.hidden = true;
                if (menu.parentNode !== wrap && wrap.isConnected !== false) {
                    wrap.appendChild(menu);
                }
                trigger.setAttribute('aria-expanded', 'false');
                trigger.classList.remove('is-open');
                if (restoreFocus && trigger.isConnected !== false) {
                    trigger.focus();
                }
            },

            toggle: function() {
                if (inst.isOpen) inst.close(true);
                else inst.open();
            }
        };

        trigger.addEventListener('click', function(e) {
            e.stopPropagation();
            inst.toggle();
        });

        trigger.addEventListener('keydown', function(e) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                inst.open();
            }
        });

        menu.addEventListener('keydown', function(e) {
            if (!inst.visibleItems.length) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                var next = (inst.activeIndex + 1) % inst.visibleItems.length;
                inst.highlightIndex(next, true, true);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                var prev = (inst.activeIndex <= 0 ? inst.visibleItems.length - 1 : inst.activeIndex - 1);
                inst.highlightIndex(prev, true, true);
            } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                if (inst.activeIndex >= 0 && inst.visibleItems[inst.activeIndex]) {
                    e.preventDefault();
                    e.stopPropagation();
                    var optIdx = parseInt(inst.visibleItems[inst.activeIndex].getAttribute('data-opt-index'), 10);
                    if (!isNaN(optIdx)) inst.selectOptionIndex(optIdx);
                }
            }
        });

        selectEl.addEventListener('change', function() {
            inst.syncFromSelect();
        });

        if (typeof MutationObserver !== 'undefined') {
            var observer = new MutationObserver(function() {
                inst.syncFromSelect();
            });
            observer.observe(selectEl, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'hidden', 'disabled', 'class', 'data-ver']
            });
        }

        selectEl._verPickerInst = inst;
        instances.push(inst);
        bindGlobalListeners();
        inst.syncFromSelect();
        return inst;
    }

    function initAllVersionPickers(root) {
        var scope = (root && root.querySelectorAll) ? root : document;
        var selects = scope.querySelectorAll(SELECT_SELECTOR);
        for (var i = 0; i < selects.length; i++) {
            createPickerInstance(selects[i]);
        }
    }

    function observeDynamicSelects() {
        if (typeof MutationObserver === 'undefined' || !document.body) return;
        var bodyObserver = new MutationObserver(function(mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var added = mutations[i].addedNodes;
                if (!added) continue;
                for (var j = 0; j < added.length; j++) {
                    var node = added[j];
                    if (node.nodeType !== 1) continue;
                    if (node.tagName === 'SELECT') {
                        createPickerInstance(node);
                    } else if (node.querySelectorAll) {
                        initAllVersionPickers(node);
                    }
                }
            }
        });
        bodyObserver.observe(document.body, { childList: true, subtree: true });
    }

    global.closeAllVersionPickers = function() {
        var closedAny = false;
        for (var i = 0; i < instances.length; i++) {
            if (instances[i].isOpen) {
                instances[i].close(true);
                closedAny = true;
            }
        }
        return closedAny;
    };

    global.syncVersionPicker = function(target) {
        if (!target) {
            for (var i = 0; i < instances.length; i++) {
                instances[i].syncFromSelect();
            }
            return;
        }
        var el = typeof target === 'string' ? document.getElementById(target) : target;
        if (!el) return;
        var inst = el._verPickerInst || createPickerInstance(el);
        if (inst) inst.syncFromSelect();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initAllVersionPickers();
            observeDynamicSelects();
        });
    } else {
        initAllVersionPickers();
        observeDynamicSelects();
    }
})(window);
