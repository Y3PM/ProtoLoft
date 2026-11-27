/**
 * 立象原型 · ProtoLoft 前端轻量国际化与友好时间引擎 (零构建原生 JS)
 */
(function (global) {
    'use strict';

    function interpolate(template, params) {
        var str = String(template);
        if (!params || typeof params !== 'object') {
            return str;
        }
        return str.replace(/\{([a-zA-Z0-9_]+)\}/g, function (match, key) {
            if (Object.prototype.hasOwnProperty.call(params, key) && params[key] !== undefined && params[key] !== null) {
                return String(params[key]);
            }
            return match;
        });
    }

    function t(key, params, fallback) {
        var dict = (typeof window !== 'undefined' && window.__I18N__) ? window.__I18N__ : (global.__I18N__ || {});
        var raw;
        if (dict && Object.prototype.hasOwnProperty.call(dict, key) && dict[key] !== undefined && dict[key] !== null) {
            raw = dict[key];
        } else if (fallback !== undefined && fallback !== null) {
            raw = fallback;
        } else {
            raw = key;
        }
        return interpolate(raw, params);
    }

    function getLocale() {
        if (typeof window !== 'undefined' && window.__LOCALE__) {
            return window.__LOCALE__;
        }
        return global.__LOCALE__ || 'zh-CN';
    }

    function pad2(n) {
        return n < 10 ? '0' + n : String(n);
    }

    function escHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function parseFriendlyTimestamp(raw, isUtc) {
        if (raw === null || raw === undefined || raw === '') return NaN;
        if (typeof raw === 'number') return isFinite(raw) ? raw : NaN;
        var trimmed = String(raw).trim();
        if (!trimmed) return NaN;

        if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
            var isoTs = Date.parse(trimmed);
            if (!isNaN(isoTs)) return isoTs;
        }

        var m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
        if (m) {
            var y = parseInt(m[1], 10);
            var mo = parseInt(m[2], 10) - 1;
            var d = parseInt(m[3], 10);
            var h = parseInt(m[4], 10);
            var mi = parseInt(m[5], 10);
            var s = m[6] ? parseInt(m[6], 10) : 0;
            return isUtc ? Date.UTC(y, mo, d, h, mi, s) : new Date(y, mo, d, h, mi, s).getTime();
        }

        var dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateOnly) {
            var dy = parseInt(dateOnly[1], 10);
            var dmo = parseInt(dateOnly[2], 10) - 1;
            var dd = parseInt(dateOnly[3], 10);
            return isUtc ? Date.UTC(dy, dmo, dd, 0, 0, 0) : new Date(dy, dmo, dd, 0, 0, 0).getTime();
        }

        var fallbackTs = Date.parse(trimmed.replace(/-/g, '/'));
        return isNaN(fallbackTs) ? NaN : fallbackTs;
    }

    function formatExactTime(raw, isUtc) {
        var trimmed = String(raw == null ? '' : raw).trim();
        if (!trimmed) return '';
        var ts = parseFriendlyTimestamp(trimmed, !!isUtc);
        if (isNaN(ts)) return trimmed;
        var d = new Date(ts);
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' '
            + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    }

    function formatDateOnly(raw, isUtc) {
        var trimmed = String(raw == null ? '' : raw).trim();
        if (!trimmed) return '';
        var ts = parseFriendlyTimestamp(trimmed, !!isUtc);
        if (isNaN(ts)) return trimmed.substring(0, 10);
        var d = new Date(ts);
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }

    function formatFriendlyTime(raw, opts) {
        var options = opts || {};
        var isUtc = !!options.isUtc;
        var mode = options.mode || 'plain';
        var trimmed = String(raw == null ? '' : raw).trim();
        if (!trimmed) return '';
        if (mode === 'date') return formatDateOnly(trimmed, isUtc);

        var ts = parseFriendlyTimestamp(trimmed, isUtc);
        if (isNaN(ts)) {
            return mode === 'updated' ? t('workspace.updated_at', { time: trimmed }, '更新于 ' + trimmed) : trimmed;
        }

        var nowMs = (typeof options.nowMs === 'number' && isFinite(options.nowMs)) ? options.nowMs : Date.now();
        var diffSec = Math.floor((nowMs - ts) / 1000);
        var exact = formatExactTime(trimmed, isUtc);

        if (diffSec < -120) {
            return mode === 'updated' ? t('workspace.updated_at', { time: exact }, '更新于 ' + exact) : exact;
        }
        if (diffSec < 0) diffSec = 0;

        var d = new Date(ts);
        var nowD = new Date(nowMs);
        var hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
        var todayStart = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate()).getTime();
        var yesterdayStart = todayStart - 86400000;
        var targetDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        var isSameYear = (d.getFullYear() === nowD.getFullYear());

        if (diffSec < 60) {
            return mode === 'updated'
                ? t('workspace.updated_just_now', null, '刚刚更新')
                : t('common.just_now', null, '刚刚');
        }
        if (diffSec < 3600) {
            var mins = Math.max(1, Math.floor(diffSec / 60));
            var minRel = t('common.mins_ago', { n: mins }, mins + ' 分钟前');
            return mode === 'updated'
                ? t('workspace.updated_relative', { time: minRel }, minRel + '更新')
                : minRel;
        }
        if (ts >= todayStart) {
            var hrs = Math.max(1, Math.floor(diffSec / 3600));
            var hrRel = t('common.hours_ago', { n: hrs }, hrs + ' 小时前');
            return mode === 'updated'
                ? t('workspace.updated_relative', { time: hrRel }, hrRel + '更新')
                : hrRel;
        }
        if (ts >= yesterdayStart && ts < todayStart) {
            return mode === 'updated'
                ? t('workspace.updated_yesterday', { hm: hm }, '昨天 ' + hm + ' 更新')
                : t('common.yesterday_at', { hm: hm }, '昨天 ' + hm);
        }
        if (diffSec < 7 * 86400) {
            var days = Math.max(2, Math.floor((todayStart - targetDayStart) / 86400000));
            var dayRel = t('common.days_ago', { n: days }, days + ' 天前');
            return mode === 'updated'
                ? t('workspace.updated_relative', { time: dayRel }, dayRel + '更新')
                : dayRel;
        }
        if (isSameYear) {
            var md = pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
            return mode === 'updated' ? t('workspace.updated_at', { time: md }, '更新于 ' + md) : md;
        }
        var ymd = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
        return mode === 'updated' ? t('workspace.updated_at', { time: ymd }, '更新于 ' + ymd) : ymd;
    }

    function renderFriendlyTimeHtml(raw, opts) {
        var options = opts || {};
        var trimmed = String(raw == null ? '' : raw).trim();
        if (!trimmed) {
            return options.emptyFallback !== undefined ? String(options.emptyFallback) : '';
        }
        var isUtc = !!options.isUtc;
        var mode = options.mode || 'plain';
        var exact = formatExactTime(trimmed, isUtc);
        var text = formatFriendlyTime(trimmed, options);
        var extraCls = options.className ? (' ' + String(options.className).trim()) : '';
        return '<time class="friendly-time' + escHtml(extraCls) + '"'
            + ' datetime="' + escHtml(exact || trimmed) + '"'
            + ' data-time-raw="' + escHtml(trimmed) + '"'
            + ' data-time-mode="' + escHtml(mode) + '"'
            + ' data-time-utc="' + (isUtc ? '1' : '0') + '"'
            + ' data-exact-time="' + escHtml(exact || trimmed) + '"'
            + '>' + escHtml(text) + '</time>';
    }

    function refreshFriendlyTimes(root) {
        if (typeof document === 'undefined') return;
        var scope = root || document;
        if (!scope.querySelectorAll) return;
        var nodes = scope.querySelectorAll('time.friendly-time[data-time-raw]');
        var nowMs = Date.now();
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var mode = node.getAttribute('data-time-mode') || 'plain';
            if (mode === 'date') continue;
            var raw = node.getAttribute('data-time-raw') || '';
            if (!raw) continue;
            var isUtc = node.getAttribute('data-time-utc') === '1';
            var exact = formatExactTime(raw, isUtc);
            var text = formatFriendlyTime(raw, { isUtc: isUtc, mode: mode, nowMs: nowMs });
            if (exact && node.getAttribute('data-exact-time') !== exact) {
                node.setAttribute('data-exact-time', exact);
            }
            if (text && node.textContent !== text) {
                node.textContent = text;
            }
        }
    }

    var exactTimeTipBound = false;
    var exactTimeHoverTimer = null;
    var exactTimeRefreshTimer = null;
    var activeTimeTarget = null;

    function getExactTimeTipEl() {
        if (typeof document === 'undefined' || !document.body) return null;
        var el = document.getElementById('plExactTimeTooltip');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'plExactTimeTooltip';
        el.className = 'linear-hint-popover linear-time-popover';
        el.setAttribute('popover', 'hint');
        el.setAttribute('role', 'tooltip');
        document.body.appendChild(el);
        return el;
    }

    function hideExactTimeTooltip() {
        if (exactTimeHoverTimer) {
            clearTimeout(exactTimeHoverTimer);
            exactTimeHoverTimer = null;
        }
        activeTimeTarget = null;
        if (typeof document === 'undefined') return;
        var tip = document.getElementById('plExactTimeTooltip');
        if (!tip) return;
        if (typeof tip.hidePopover === 'function') {
            try {
                if (tip.matches && tip.matches(':popover-open')) tip.hidePopover();
            } catch (e) {}
        }
        if (tip.classList) tip.classList.remove('is-open');
    }

    function showExactTimeTooltip(target) {
        if (!target || typeof document === 'undefined' || typeof window === 'undefined') return;
        var exact = target.getAttribute('data-exact-time');
        if (!exact) return;
        var tip = getExactTimeTipEl();
        if (!tip) return;

        tip.textContent = exact;
        tip.classList.add('is-js-positioned');
        tip.style.visibility = 'hidden';
        if (typeof tip.showPopover === 'function') {
            try {
                tip.showPopover({ source: target });
            } catch (e) {
                try { tip.showPopover(); } catch (e2) {}
            }
        }
        tip.classList.add('is-open');

        var tRect = target.getBoundingClientRect();
        var tipRect = tip.getBoundingClientRect();
        var vw = window.innerWidth || (document.documentElement && document.documentElement.clientWidth) || 1280;
        var gap = 6;
        var top = tRect.top - tipRect.height - gap;
        if (top < 8) {
            top = tRect.bottom + gap;
        }
        var left = tRect.left + (tRect.width - tipRect.width) / 2;
        left = Math.floor(Math.max(8, Math.min(left, vw - tipRect.width - 8)));
        tip.style.left = left + 'px';
        tip.style.top = Math.round(top) + 'px';
        tip.style.visibility = '';
    }

    function initFriendlyTimeTooltip() {
        if (exactTimeTipBound || typeof document === 'undefined') return;
        exactTimeTipBound = true;

        document.addEventListener('mouseover', function (ev) {
            var src = ev && ev.target && ev.target.closest ? ev.target.closest('[data-exact-time]') : null;
            if (!src) return;
            if (src === activeTimeTarget) return;
            activeTimeTarget = src;
            if (exactTimeHoverTimer) clearTimeout(exactTimeHoverTimer);
            exactTimeHoverTimer = setTimeout(function () {
                exactTimeHoverTimer = null;
                if (activeTimeTarget === src && src.isConnected !== false) {
                    showExactTimeTooltip(src);
                }
            }, 120);
        });

        document.addEventListener('mouseout', function (ev) {
            if (!activeTimeTarget) return;
            var src = ev && ev.target && ev.target.closest ? ev.target.closest('[data-exact-time]') : null;
            if (!src || src !== activeTimeTarget) return;
            var rel = ev.relatedTarget;
            if (rel && src.contains && src.contains(rel)) return;
            hideExactTimeTooltip();
        });

        document.addEventListener('scroll', function () {
            if (activeTimeTarget || document.getElementById('plExactTimeTooltip')) {
                hideExactTimeTooltip();
            }
        }, true);

        document.addEventListener('keydown', function (ev) {
            if (ev && (ev.key === 'Escape' || ev.keyCode === 27)) {
                hideExactTimeTooltip();
            }
        }, true);

        if (typeof window !== 'undefined' && window.addEventListener) {
            window.addEventListener('resize', hideExactTimeTooltip);
        }

        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) {
                refreshFriendlyTimes();
            }
        });

        if (!exactTimeRefreshTimer && typeof setInterval === 'function') {
            exactTimeRefreshTimer = setInterval(function () {
                if (!document.hidden) {
                    refreshFriendlyTimes();
                }
            }, 60000);
        }
    }

    function bootFriendlyTimes() {
        refreshFriendlyTimes();
        initFriendlyTimeTooltip();
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bootFriendlyTimes);
        } else {
            bootFriendlyTimes();
        }
    }

    global.t = t;
    global.getLocale = getLocale;
    global.parseFriendlyTimestamp = parseFriendlyTimestamp;
    global.formatExactTime = formatExactTime;
    global.formatDateOnly = formatDateOnly;
    global.formatFriendlyTime = formatFriendlyTime;
    global.renderFriendlyTimeHtml = renderFriendlyTimeHtml;
    global.refreshFriendlyTimes = refreshFriendlyTimes;
    global.initFriendlyTimeTooltip = initFriendlyTimeTooltip;
    if (typeof window !== 'undefined') {
        window.t = t;
        window.getLocale = getLocale;
        window.parseFriendlyTimestamp = parseFriendlyTimestamp;
        window.formatExactTime = formatExactTime;
        window.formatDateOnly = formatDateOnly;
        window.formatFriendlyTime = formatFriendlyTime;
        window.renderFriendlyTimeHtml = renderFriendlyTimeHtml;
        window.refreshFriendlyTimes = refreshFriendlyTimes;
        window.initFriendlyTimeTooltip = initFriendlyTimeTooltip;
    }
})(typeof window !== 'undefined' ? window : globalThis);
