/**
 * 立象原型 · ProtoLoft 前端轻量国际化助手 (零构建原生 JS)
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

    global.t = t;
    global.getLocale = getLocale;
    if (typeof window !== 'undefined') {
        window.t = t;
        window.getLocale = getLocale;
    }
})(typeof window !== 'undefined' ? window : globalThis);
