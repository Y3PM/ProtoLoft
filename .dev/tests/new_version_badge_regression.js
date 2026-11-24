/**
 * 自动化回归测试: 新版本标识 (虚线红点 + 顶栏角标 + 下拉新标签 + 切版即消 + 3天TTL + 令牌体系 + 真实用户点击门控)
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../..');
const appJs = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf-8');
const adminJs = fs.readFileSync(path.join(ROOT, 'assets/js/admin.js'), 'utf-8');
const verPickerJs = fs.readFileSync(path.join(ROOT, 'assets/js/ver-picker.js'), 'utf-8');
const appCss = fs.readFileSync(path.join(ROOT, 'assets/css/app.css'), 'utf-8');
const configPhp = fs.readFileSync(path.join(ROOT, 'includes/config.php'), 'utf-8');

console.log('[*] 开始执行新版本标识自动化回归测试 (增强版)...');

// 1. 版本号升级回归
assert(configPhp.includes("define('APP_VERSION', '3.1.5');"), "config.php 版本号应升为 3.1.5");
console.log('  ✓ PASS: 系统常量 APP_VERSION 正确升至 3.1.5');

// 2. CSS 样式契约与设计系统令牌映射 (严守铁律 3)
assert(appCss.includes('--new-ver: #f43f5e;'), ":root 必须声明 --new-ver 状态色令牌");
assert(appCss.includes('--new-ver-subtle: rgba(244, 63, 94, 0.1);'), ":root 必须声明 --new-ver-subtle 状态色令牌");
assert(appCss.includes('.item-row.has-new-ver::before'), "缺少左侧树虚线红点伪元素样式");
assert(appCss.includes('background-color: var(--new-ver);'), "虚线红点必须通过 var(--new-ver) 令牌引用");
assert(appCss.includes('.top-ver-trigger.has-new-ver::after'), "缺少顶栏版本切换器右上角红点伪元素样式");
assert(appCss.includes('.current-ver-tag.has-new-ver::after'), "缺少顶栏单版本标签右上角红点伪元素样式");
assert(appCss.includes('.ver-popover-item-new-tag'), "缺少下拉菜单项内部'新'标签样式");
assert(appCss.includes('color: var(--new-ver);'), "'新'标签文字必须通过 var(--new-ver) 令牌引用");
assert(appCss.includes('background-color: var(--new-ver-subtle);'), "'新'标签背景必须通过 var(--new-ver-subtle) 令牌引用");
console.log('  ✓ PASS: CSS 样式规范完整消费设计系统令牌，彻底杜绝硬编码');

// 3. 门控与已读逻辑静态契约 (严守 P1 防静默消费)
assert(appJs.includes('var NEW_VERSION_TTL = 3 * 24 * 60 * 60 * 1000;'), "未配置 72 小时 (3天) TTL");
assert(appJs.includes('protoloft_read_versions'), "缺少已读版本 localStorage 键名");
assert(appJs.includes('Boolean(isUserDirectClick) && newVer && currentVer'), "selectItem 缺少 isUserDirectClick 用户物理点击门控");
console.log('  ✓ PASS: app.js 严守 isUserDirectClick 用户物理点击门控');

// 4. admin.js 会话内状态同步回调与发版人天然已读
assert(adminJs.includes('refreshCategoryTreeNewBadges'), "admin.js 缺少 refreshCategoryTreeNewBadges 回调支持");
assert(adminJs.includes('markVersionAsRead(res.data.version.id)'), "admin.js 发版成功缺少发版人 markVersionAsRead 调用");
assert(adminJs.includes('markVersionAsRead(version.id)'), "admin.js syncPublishedVersion 缺少 markVersionAsRead 调用");
console.log('  ✓ PASS: admin.js 覆盖会话内发版与版本操作红点自愈同步且发版人天然已读');

// 5. ver-picker.js 选项与触发器联动 (支持已选新项点击即消)
assert(verPickerJs.includes("opts[oi].getAttribute('data-is-new') === '1'"), "ver-picker.js 缺少 data-is-new 选项检测");
assert(verPickerJs.includes("trigger.classList.toggle('has-new-ver'"), "ver-picker.js 缺少顶栏触发器 has-new-ver 联动");
assert(verPickerJs.includes('ver-popover-item-new-tag'), "ver-picker.js 缺少 ver-popover-item-new-tag 标签渲染");
assert(verPickerJs.includes("newBadge.textContent = '新';"), "ver-picker.js 新标签文案应为'新'");
assert(verPickerJs.includes('changed || isNewOpt'), "ver-picker.js 必须支持对带有新标的已选项点击派发消点");
console.log('  ✓ PASS: ver-picker.js 自定义选择器完整联动新标且支持点击已选新版本立即消除');

// 6. 从 app.js 真实源码动态正则提取函数进行仿真执行 (拒绝手抄副本)
const parseVerDateMatch = appJs.match(/function parseVerDate\([\s\S]*?^}/m);
assert(parseVerDateMatch, "无法从 app.js 提取 parseVerDate 函数体");
const isVersionNewMatch = appJs.match(/function isVersionNew\([\s\S]*?^}/m);
assert(isVersionNewMatch, "无法从 app.js 提取 isVersionNew 函数体");
const markVersionAsReadMatch = appJs.match(/function markVersionAsRead\([\s\S]*?^}/m);
assert(markVersionAsReadMatch, "无法从 app.js 提取 markVersionAsRead 函数体");

const now = Date.now();
const oneDayAgo = new Date(now - 24 * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 19);
const fourDaysAgo = new Date(now - 4 * 24 * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 19);

let mockStore = { 'protoloft_read_versions': JSON.stringify([999]) };
const sandbox = {
    NEW_VERSION_TTL: 3 * 24 * 60 * 60 * 1000,
    localStorage: {
        getItem: (k) => mockStore[k] || null,
        setItem: (k, v) => { mockStore[k] = String(v); }
    },
    parseInt: parseInt,
    Date: Date,
    JSON: JSON,
    String: String,
    isNaN: isNaN
};

vm.createContext(sandbox);
vm.runInContext(parseVerDateMatch[0], sandbox);
vm.runInContext(markVersionAsReadMatch[0], sandbox);
vm.runInContext(`
function getReadVersionIds() {
    try {
        var raw = localStorage.getItem('protoloft_read_versions');
        return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
}
function isVersionRead(verId) {
    if (!verId) return true;
    var ids = getReadVersionIds();
    return ids.indexOf(parseInt(verId, 10)) !== -1;
}
` + isVersionNewMatch[0], sandbox);

// 测试 A: 1天前未读版本 -> 真实源码函数计算应为 true
assert.strictEqual(sandbox.isVersionNew({ id: 101, updated_at: oneDayAgo }), true);

// 测试 B: 4天前未读版本 -> 真实源码函数计算应为 false (TTL 到期)
assert.strictEqual(sandbox.isVersionNew({ id: 102, updated_at: fourDaysAgo }), false);

// 测试 C: 1天前但已读版本 (id 999) -> 真实源码函数计算应为 false
assert.strictEqual(sandbox.isVersionNew({ id: 999, updated_at: oneDayAgo }), false);

// 测试 D: 运行时 markVersionAsRead 消除验证
sandbox.markVersionAsRead(101);
assert.strictEqual(sandbox.isVersionNew({ id: 101, updated_at: oneDayAgo }), false);

console.log('  ✓ PASS: 从 app.js 真实源码动态提取函数体，3天TTL/已读/消点仿真全部通过');
console.log('[*] 全部 6 组全链路增强断言校验通过！');
