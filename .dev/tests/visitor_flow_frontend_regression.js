/* Verify visitor registration flow logic and DOM contracts in static sources */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '../..');
const indexPhp = fs.readFileSync(path.join(root, 'index.php'), 'utf8');
const loginModalPhp = fs.readFileSync(path.join(root, 'includes/login_modal.php'), 'utf8');
const authPhp = fs.readFileSync(path.join(root, 'includes/actions/auth.php'), 'utf8');
const modalsPhp = fs.readFileSync(path.join(root, 'includes/modals.php'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');

let passed = 0;
const check = (name, condition) => {
    assert(condition, name);
    passed++;
    console.log('PASS ' + name);
};

// 1. 独立登录页静态契约
check('独立登录页存在顶部成功通知条 adminLoginSuccessTip', indexPhp.includes('id="adminLoginSuccessTip"'));
check('独立登录页输入框存在域名徽标 adminDomainBadge', indexPhp.includes('id="adminDomainBadge"'));
check('独立登录页访客申请表单存在域名徽标 regLockDomainBadge', indexPhp.includes('id="regLockDomainBadge"'));
check('submitVisitorReg 成功后平滑调用 toggleAuthPane("login")', indexPhp.includes("toggleAuthPane('login')"));
check('submitVisitorReg 自动回填邮箱并更新域名徽标', indexPhp.includes('loginUserInput.value = rawEmailVal') && indexPhp.includes("handleLockEmailInput(loginUserInput, 'adminDomainBadge')"));
check('submitVisitorReg 重置表单后主动恢复注册徽标', indexPhp.includes("regBadge.style.display = 'inline-block'"));
check('submitVisitorReg 移除多余的 DOM value 篡改', !/if\s*\(\s*emailInput\s*&&\s*email\s*\)\s*\{\s*emailInput\.value\s*=\s*email;\s*var\s+badge\s*=\s*document\.getElementById\('regLockDomainBadge'\);/.test(indexPhp));

// 2. 工作台通用弹窗静态契约
check('登录弹窗存在顶部成功通知条 loginSuccessNotice', loginModalPhp.includes('id="loginSuccessNotice"'));
check('登录弹窗登录表单存在域名徽标 loginDomainBadge', loginModalPhp.includes('id="loginDomainBadge"'));
check('登录弹窗访客申请表单存在域名徽标 regDomainBadge', loginModalPhp.includes('id="regDomainBadge"'));
check('handleDoRegister 成功后平滑调用 toggleLoginRegPane("login")', loginModalPhp.includes("toggleLoginRegPane('login')"));
check('handleDoRegister 自动回填邮箱并更新域名徽标', loginModalPhp.includes('loginUserInput.value = rawEmailVal') && loginModalPhp.includes("handleEmailInputWithDomain(loginUserInput, 'loginDomainBadge')"));
check('handleDoRegister 重置表单后主动恢复注册徽标', loginModalPhp.includes("regBadge.style.display = 'inline-block'"));
check('handleDoRegister 移除多余的 DOM value 篡改', !/if\s*\(\s*emailInput\s*&&\s*email\s*\)\s*\{\s*emailInput\.value\s*=\s*email;\s*var\s+badge\s*=\s*document\.getElementById\('regDomainBadge'\);/.test(loginModalPhp));

// 3. 申请角色双栏单选与后端白名单收口契约
check('独立登录页包含申请角色单选且默认审阅人，不包含 admin', indexPhp.includes('name="lock_reg_role" value="viewer" checked') && indexPhp.includes('name="lock_reg_role" value="editor"') && !indexPhp.includes('name="lock_reg_role" value="admin"') && indexPhp.includes("fd.append('role', role)"));
check('工作台登录弹窗包含申请角色单选且默认审阅人，不包含 admin', loginModalPhp.includes('name="reg_role" value="viewer" checked') && loginModalPhp.includes('name="reg_role" value="editor"') && !loginModalPhp.includes('name="reg_role" value="admin"') && loginModalPhp.includes("fd.append('role', role)"));
check('auth.php register_visitor 成功文案明确自明', authPhp.includes("jsonResponse(true, ['id' => $newId], '申请已提交，等待管理员审核后即可登录');"));
check('auth.php register_visitor 对申请角色做白名单收口并透传通知', authPhp.includes("in_array($requestedRole, ['viewer', 'editor'], true)") && authPhp.includes("'申请角色' => $requestedRoleLabel"));
check('modals.php 待审批表头包含申请角色列并同步 colspan=5', modalsPhp.includes('<th style="padding:9px 12px;">申请角色</th>') && modalsPhp.includes('id="pendingUsersTbody"') && modalsPhp.includes('<td colspan="5"'));
check('auth.php register_visitor 通知包含直达待审批路由链接', authPhp.includes("app_url('index.php#admin=users&sub=pending')"));

// 4. 前端 #admin=users&sub=pending 直达路由与角色权限守卫行为验证
const routeSlice = appJs.slice(
    appJs.indexOf('function handleAdminHashRoute('),
    appJs.indexOf('/* ===================== 全局通用弹窗与快捷交互 ===================== */')
);
function runRouteCase(role, initialHash, hasAdminFn, opts) {
    opts = opts || {};
    const opened = [];
    const selectedCalls = [];
    const replacedUrls = [];
    const listeners = {};
    const win = {
        currentActiveItemHash: opts.activeItemHash || '',
        currentActiveAnnotationHash: opts.activeAnnotationHash || '',
        location: { hash: initialHash, pathname: '/index.php', search: '' },
        history: {
            replaceState: (_s, _t, url) => {
                replacedUrls.push(url);
                const idx = String(url).indexOf('#');
                win.location.hash = idx >= 0 ? String(url).slice(idx) : '';
            }
        },
        addEventListener: (name, fn) => { listeners[name] = fn; }
    };
    const firstItem = opts.hasFirstItem ? {
        length: 1,
        0: { id: 'item-node-1' },
        data: (k) => (k === 'item-id' ? 1 : '')
    } : { length: 0 };
    const ctx = {
        window: win,
        URL,
        CURRENT_USER: role ? { id: 1, role } : null,
        currentActiveItemHash: opts.activeItemHash || '',
        openAdminConsole: hasAdminFn ? ((tab, sub) => opened.push([tab, sub])) : undefined,
        selectItem: (id, el, ver, isClick, replaceHistory) => {
            selectedCalls.push({ id, ver, isClick, replaceHistory });
            const nextHash = '#item=' + id + '&v=V1.0';
            win.currentActiveItemHash = nextHash;
            if (replaceHistory) {
                win.history.replaceState(null, '', win.location.pathname + win.location.search + nextHash);
            } else {
                win.location.hash = nextHash;
            }
        },
        $: (sel) => (sel === '.item-row:first' ? firstItem : { length: 0, each: () => {} }),
        updateTopActionsState: () => {},
        openAnnotationLink: () => {},
        openProfileModal: () => {},
        switchProfileTab: () => {}
    };
    vm.createContext(ctx);
    vm.runInContext(routeSlice, ctx);
    ctx.initHashRoute();
    return { opened, selectedCalls, replacedUrls, replacedUrl: replacedUrls[replacedUrls.length - 1] || null, listeners, win, ctx };
}

const adminCase = runRouteCase('admin', '#admin=users&sub=pending', true);
check('空工作台管理员打开 #admin=users&sub=pending 自动弹出控制中心待审批面板并清理一次性锚点',
    adminCase.opened.length === 1 && adminCase.opened[0][0] === 'users' && adminCase.opened[0][1] === 'pending' && adminCase.replacedUrl === '/index.php');

const adminWithItems = runRouteCase('admin', '#admin=users&sub=pending', true, { hasFirstItem: true });
check('有项目工作台新开审批通知时，默认项目原地 replaceState 替换历史槽位而不留审批回退记录',
    adminWithItems.opened.length === 1
        && adminWithItems.selectedCalls.length === 1
        && adminWithItems.selectedCalls[0].replaceHistory === true
        && adminWithItems.win.location.hash === '#item=1&v=V1.0');

adminWithItems.win.currentActiveItemHash = '#item=2&v=V2.0';
adminWithItems.win.currentActiveAnnotationHash = '';
adminWithItems.win.location.hash = '#admin=users&sub=pending';
adminWithItems.listeners.hashchange({
    oldURL: 'https://example.com/index.php#item=1&v=V1.0',
    newURL: 'https://example.com/index.php#admin=users&sub=pending'
});
check('地址栏指向旧项目而实际预览为项目2时，进入审批优先恢复实际预览项目与版本（不切错回旧项目）',
    adminWithItems.opened.length === 2
        && adminWithItems.opened[1][0] === 'users'
        && adminWithItems.opened[1][1] === 'pending'
        && adminWithItems.win.location.hash === '#item=2&v=V2.0'
        && adminWithItems.replacedUrls[adminWithItems.replacedUrls.length - 1] === '/index.php#item=2&v=V2.0');

adminWithItems.win.currentActiveAnnotationHash = '#annotation=42';
adminWithItems.win.location.hash = '#admin=users&sub=pending';
adminWithItems.listeners.hashchange({
    oldURL: 'https://example.com/index.php#annotation=42',
    newURL: 'https://example.com/index.php#admin=users&sub=pending'
});
check('当前预览仍对应活跃批注锚点时，进入审批保留该批注锚点',
    adminWithItems.win.location.hash === '#annotation=42'
        && adminWithItems.replacedUrls[adminWithItems.replacedUrls.length - 1] === '/index.php#annotation=42');

adminWithItems.win.currentActiveAnnotationHash = '';
adminWithItems.win.location.hash = '#admin=users&sub=pending';
adminWithItems.listeners.hashchange({
    oldURL: 'https://example.com/index.php#annotation=42',
    newURL: 'https://example.com/index.php#admin=users&sub=pending'
});
check('切换项目后旧批注锚点失效时，进入审批恢复实际项目而非过期批注',
    adminWithItems.win.location.hash === '#item=2&v=V2.0'
        && adminWithItems.replacedUrls[adminWithItems.replacedUrls.length - 1] === '/index.php#item=2&v=V2.0');

const editorCase = runRouteCase('editor', '#admin=users&sub=pending', true);
check('协作者打开 #admin=users&sub=pending 静默忽略且不越权呼出控制中心',
    editorCase.opened.length === 0 && editorCase.replacedUrl === null);

const viewerCase = runRouteCase('viewer', '#admin=users&sub=pending', false);
check('审阅人（无 admin.js）打开 #admin=users&sub=pending 静默忽略不报错',
    viewerCase.opened.length === 0 && viewerCase.replacedUrl === null);

console.log(JSON.stringify({ passed, scope: 'visitor registration flow and approval deep-link validation' }));
