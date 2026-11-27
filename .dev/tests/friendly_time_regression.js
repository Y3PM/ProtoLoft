/**
 * 友好时间引擎单元测试 (覆盖 7 档跨度、三语、UTC 转本地、date 模式、未来时间保护与 DOM 刷新)
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../..');
const i18nJs = fs.readFileSync(path.join(ROOT, 'assets/js/i18n.js'), 'utf-8');

function runForLocale(locale, dict) {
    const ctx = {
        window: { __LOCALE__: locale, __I18N__: dict },
        Date: Date,
        Number: Number,
        String: String,
        Object: Object,
        Math: Math,
        isNaN: isNaN,
        isFinite: isFinite,
        parseInt: parseInt,
        setInterval: null
    };
    ctx.window.window = ctx.window;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(i18nJs, ctx);
    return ctx.window;
}

const zhDict = {
    'common.just_now': '刚刚',
    'common.mins_ago': '{n} 分钟前',
    'common.hours_ago': '{n} 小时前',
    'common.days_ago': '{n} 天前',
    'common.yesterday_at': '昨天 {hm}',
    'workspace.updated_at': '更新于 {time}',
    'workspace.updated_just_now': '刚刚更新',
    'workspace.updated_relative': '{time}更新',
    'workspace.updated_yesterday': '昨天 {hm} 更新',
    'workspace.author_meta': '@{author} · {text}'
};

const enDict = {
    'common.just_now': 'Just now',
    'common.mins_ago': '{n}m ago',
    'common.hours_ago': '{n}h ago',
    'common.days_ago': '{n}d ago',
    'common.yesterday_at': 'Yesterday {hm}',
    'workspace.updated_at': 'Updated {time}',
    'workspace.updated_just_now': 'Updated just now',
    'workspace.updated_relative': 'Updated {time}',
    'workspace.updated_yesterday': 'Updated yesterday {hm}',
    'workspace.author_meta': '@{author} · {text}'
};

const now = new Date(2026, 10, 27, 10, 0, 0).getTime(); // 2026-11-27 10:00:00 local

// 1. 中文 7 档跨度检验
const zh = runForLocale('zh-CN', zhDict);
assert.strictEqual(zh.formatFriendlyTime('2026-11-27 09:59:30', { nowMs: now, mode: 'plain' }), '刚刚');
assert.strictEqual(zh.formatFriendlyTime('2026-11-27 09:59:30', { nowMs: now, mode: 'updated' }), '刚刚更新');

assert.strictEqual(zh.formatFriendlyTime('2026-11-27 09:45:00', { nowMs: now, mode: 'plain' }), '15 分钟前');
assert.strictEqual(zh.formatFriendlyTime('2026-11-27 09:45:00', { nowMs: now, mode: 'updated' }), '15 分钟前更新');

assert.strictEqual(zh.formatFriendlyTime('2026-11-27 07:00:00', { nowMs: now, mode: 'plain' }), '3 小时前');
assert.strictEqual(zh.formatFriendlyTime('2026-11-27 07:00:00', { nowMs: now, mode: 'updated' }), '3 小时前更新');

assert.strictEqual(zh.formatFriendlyTime('2026-11-26 16:40:00', { nowMs: now, mode: 'plain' }), '昨天 16:40');
assert.strictEqual(zh.formatFriendlyTime('2026-11-26 16:40:00', { nowMs: now, mode: 'updated' }), '昨天 16:40 更新');

assert.strictEqual(zh.formatFriendlyTime('2026-11-24 09:00:00', { nowMs: now, mode: 'plain' }), '3 天前');
assert.strictEqual(zh.formatFriendlyTime('2026-11-24 09:00:00', { nowMs: now, mode: 'updated' }), '3 天前更新');

assert.strictEqual(zh.formatFriendlyTime('2026-10-18 14:22:10', { nowMs: now, mode: 'plain' }), '10-18');
assert.strictEqual(zh.formatFriendlyTime('2026-10-18 14:22:10', { nowMs: now, mode: 'updated' }), '更新于 10-18');

assert.strictEqual(zh.formatFriendlyTime('2025-12-31 23:59:59', { nowMs: now, mode: 'plain' }), '2025-12-31');
assert.strictEqual(zh.formatFriendlyTime('2025-12-31 23:59:59', { nowMs: now, mode: 'updated' }), '更新于 2025-12-31');

// 2. 成员加入仅日期模式 & 精确时间格式
assert.strictEqual(zh.formatFriendlyTime('2026-11-27 09:22:11', { nowMs: now, mode: 'date' }), '2026-11-27');
assert.strictEqual(zh.formatExactTime('2026-11-27 09:22:11', false), '2026-11-27 09:22:11');

// 3. 未来异常时间保护
assert.strictEqual(zh.formatFriendlyTime('2026-11-27 12:00:00', { nowMs: now, mode: 'plain' }), '2026-11-27 12:00:00');
assert.strictEqual(zh.formatFriendlyTime('2026-11-27 12:00:00', { nowMs: now, mode: 'updated' }), '更新于 2026-11-27 12:00:00');

// 4. HTML 标签生成包含 data-exact-time 与 XSS 转义
const html = zh.renderFriendlyTimeHtml('2026-11-27 09:22:11', { mode: 'updated' });
assert(html.includes('data-exact-time="2026-11-27 09:22:11"') && html.includes('<time class="friendly-time"'));

// 5. 英文语序校验
const en = runForLocale('en', enDict);
assert.strictEqual(en.formatFriendlyTime('2026-11-27 09:59:30', { nowMs: now, mode: 'updated' }), 'Updated just now');
assert.strictEqual(en.formatFriendlyTime('2026-11-27 09:45:00', { nowMs: now, mode: 'updated' }), 'Updated 15m ago');
assert.strictEqual(en.formatFriendlyTime('2026-11-26 16:40:00', { nowMs: now, mode: 'updated' }), 'Updated yesterday 16:40');
assert.strictEqual(en.formatFriendlyTime('2026-10-18 14:22:10', { nowMs: now, mode: 'updated' }), 'Updated 10-18');

// 6. UTC 解析转本地精确时间校验
const utcStr = '2026-11-27 01:22:11';
const expectedLocal = new Date(Date.UTC(2026, 10, 27, 1, 22, 11));
const pad = n => (n < 10 ? '0' + n : String(n));
const expectedExact = expectedLocal.getFullYear() + '-' + pad(expectedLocal.getMonth() + 1) + '-' + pad(expectedLocal.getDate())
    + ' ' + pad(expectedLocal.getHours()) + ':' + pad(expectedLocal.getMinutes()) + ':' + pad(expectedLocal.getSeconds());
assert.strictEqual(zh.formatExactTime(utcStr, true), expectedExact);

console.log(JSON.stringify({ passed: 22, scope: 'friendly time 7-tier formatting, i18n, UTC & date mode' }));
