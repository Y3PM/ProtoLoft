/**
 * 立象原型 · 控制台沉浸无刷新与外链意图守卫交互回归测试套件
 */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const root = path.join(__dirname, '../..');
const appJs = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
const adminJs = fs.readFileSync(path.join(root, 'assets/js/admin.js'), 'utf8');
const annoJs = fs.readFileSync(path.join(root, 'assets/js/annotation.js'), 'utf8');

let passed = 0;
function check(title, condition) {
    assert(condition, title);
    passed++;
    console.log('PASS ' + title);
}

// 1. 验证源码静态语法与安全约束
console.log('[*] 1. 静态特征与语法规范验证');
check('app.js 正确声明 selectItem isUserDirectClick 参数', appJs.includes('selectItem(itemId, el, targetVerName, isUserDirectClick)'));
check('app.js 包含外链意图守卫', appJs.includes('if (isUserDirectClick) {') && appJs.includes("window.open(linkHref, '_blank', 'noopener,noreferrer');"));
check('app.js 包含新标签页外链落地卡片渲染', appJs.includes('此项目配置为在新标签页中打开的外部链接资产') && appJs.includes('在新标签页打开'));
check('app.js closeModal 拦截 adminConsoleModal 脏变动集中刷新', appJs.includes("id === 'adminConsoleModal' && window.adminConsoleChanged"));
check('admin.js 声明全局 adminConsoleChanged 脏标记', adminJs.includes('window.adminConsoleChanged = false;'));
check('index.php 侧栏点击显式传入 isUserDirectClick 为 true', fs.readFileSync(path.join(root, 'index.php'), 'utf8').includes('selectItem(') && fs.readFileSync(path.join(root, 'index.php'), 'utf8').includes('null, true)'));

// 2. 运行时行为仿真测试
console.log('\n[*] 2. 外链生命周期与意图守卫运行时仿真');
{
    let openedUrl = null;
    let targetWindow = null;
    let noVersionHtml = '';
    let isFrameShown = false;

    // 模拟 jQuery 对象与工作台上下文
    const dataMap = {
        type: 'link',
        target: '_blank',
        name: '测试外部系统',
        href: 'https://example.com/system',
        versions: []
    };
    const mockEl = {
        data: (key, val) => {
            if (val !== undefined) {
                dataMap[key] = val;
                return mockEl;
            }
            return dataMap[key];
        },
        addClass: () => mockEl,
        removeClass: () => mockEl
    };

    const chainable = {
        data: () => chainable,
        addClass: () => chainable,
        removeClass: () => chainable,
        hasClass: () => false,
        prop: () => chainable,
        hide: () => chainable,
        empty: () => chainable,
        show: () => chainable,
        attr: () => chainable,
        html: (content) => { noVersionHtml = content; return chainable; },
        text: () => chainable,
        on: () => chainable
    };
    const sandbox = {
        $: (sel) => {
            if (sel === mockEl) return mockEl;
            return chainable;
        },
        window: {
            open: (url, target) => {
                openedUrl = url;
                targetWindow = target;
            },
            location: { hash: '' },
            addEventListener: () => {}
        },
        document: {},
        esc: (s) => s,
        updateTopActionsState: () => {},
        renderWorkspaceWatermark: () => {},
        updateTopRpButtons: () => {},
        renderMarkdownSafe: (s) => s,
        buildWorkspaceUpdateMetaHtml: () => '',
        getCsrfToken: () => 'token',
        currentSelectedItemId: 0
    };

    vm.createContext(sandbox);

    // 提取并运行 selectItem
    const selectItemEndIdx = appJs.indexOf('// 顶部多版本下拉切换') !== -1
        ? appJs.indexOf('// 顶部多版本下拉切换')
        : (appJs.indexOf('// 顶部栏版本切换') !== -1 ? appJs.indexOf('// 顶部栏版本切换') : appJs.indexOf('function onTopVersionChange('));
    const selectItemCode = appJs.slice(
        appJs.indexOf('function selectItem('),
        selectItemEndIdx
    );
    vm.runInContext(selectItemCode, sandbox);

    // 测试场景 A: 用户在左侧树手动显式点击外链 (isUserDirectClick = true)
    openedUrl = null;
    sandbox.selectItem(101, mockEl, null, true);
    check('工作台手动点击外链时，安全在新标签页打开并立即 return', openedUrl === 'https://example.com/system' && targetWindow === '_blank');

    // 测试场景 B: 录入保存完成 / 路由初始化 / 默认激活 (isUserDirectClick 为 false 或未传)
    openedUrl = null;
    sandbox.selectItem(101, mockEl, null, false);
    check('非手动点击（如录入完成定位）时，严禁静默打开新标签页', openedUrl === null);
    check('非手动点击时，右侧主视口安全展示外链卡片并提供新窗口打开按钮', noVersionHtml.includes('在新标签页打开') && noVersionHtml.includes('https://example.com/system'));
}

console.log('\n[*] 3. 控制面板沉浸式操作 (操作期零刷新，退出时集中同步) 仿真');
{
    let reloads = 0;
    const sandbox = {
        window: {
            adminConsoleChanged: false,
            location: {
                reload: () => { reloads++; }
            }
        },
        document: {
            getElementById: (id) => ({ id: id, style: {} })
        },
        modalStack: [],
        syncModalBackground: () => {},
        modalFocusable: () => []
    };

    vm.createContext(sandbox);

    const closeModalCode = appJs.slice(
        appJs.indexOf('function closeModal('),
        appJs.indexOf('function modalKeyboardBoundary(')
    );
    vm.runInContext(closeModalCode, sandbox);

    // 场景 A: 控制面板打开期间没有修改，关闭控制面板
    sandbox.window.adminConsoleChanged = false;
    sandbox.closeModal('adminConsoleModal');
    check('控制面板无变动关闭时，不触发整页刷新', reloads === 0);

    // 场景 B: 控制面板操作后（有变动），关闭控制面板
    sandbox.window.adminConsoleChanged = true;
    sandbox.closeModal('adminConsoleModal');
    check('控制面板有变动关闭时，精准触发集中刷新', reloads === 1);
    check('集中刷新触发后，脏标记安全复位为 false', sandbox.window.adminConsoleChanged === false);
}

console.log('\n[*] 4. 批注快捷键 C 穿透与选择文件夹防误触行为仿真');
const asyncGuard = setTimeout(() => {
    console.error('异步交互回归未完成');
    process.exitCode = 1;
}, 5000);
(async function runPart4And5() {
    check('annotation.js 正确导出与声明 isProtoViewActive 活跃原型守卫', annoJs.includes('function isProtoViewActive('));
    check('isProtoViewActive 严格排查占位画卷与未选项目状态', annoJs.includes("getElementById('placeholder')") && annoJs.includes("getElementById('noVersionPlaceholder')"));
    check('annotation.js 包含同源 iframe 与内嵌子 frame 穿透绑定 bindFrameHotkeys', annoJs.includes('function bindFrameHotkeys(') && annoJs.includes("querySelectorAll('iframe, frame')"));
    check('annotation.js 严格保护系统组合键 (Cmd+C/Ctrl+C/Alt+C 不触发批注)', annoJs.includes('if (e.metaKey || e.ctrlKey || e.altKey)'));

    // 运行时仿真：模拟 iframe 内部按键与宿主守卫
    let drawerState = false;
    let registeredIframeHandler = null;

    const mockFrame = {
        style: { display: 'none' },
        src: 'about:blank',
        getAttribute: (k) => mockFrame[k] || '',
        addEventListener: () => {},
        contentWindow: {
            location: { pathname: '', hash: '' },
            document: { title: '', querySelectorAll: () => [] },
            addEventListener: () => {}
        }
    };
    const mockPlaceholder = {
        style: { display: 'flex' },
        offsetWidth: 400
    };
    const mockDrawer = {
        style: { display: 'none' },
        classList: {
            add: () => {},
            remove: () => {}
        }
    };

    const annoSandbox = {
        URL,
        fetch: () => Promise.resolve({ json: () => Promise.resolve({ success: true, data: {} }) }),
        setInterval: (fn, ms) => 1,
        clearInterval: () => {},
        window: {
            location: { href: 'http://localhost/index.php' },
            toggleAnnotationDrawer: (force) => {
                if (typeof force === 'boolean') drawerState = force;
                else drawerState = !drawerState;
            },
            loadAnnotations: () => {}
        },
        document: {
            getElementById: (id) => {
                if (id === 'myFrame') return mockFrame;
                if (id === 'placeholder') return mockPlaceholder;
                if (id === 'annotationDrawer') return mockDrawer;
                return null;
            },
            querySelector: () => null,
            addEventListener: () => {}
        },
        setTimeout: (fn) => fn()
    };
    vm.createContext(annoSandbox);

    // 运行 annotation.js
    vm.runInContext(annoJs, annoSandbox);

    // 场景 A: 处于选择文件夹 / 初始空状态时按 C 键
    mockDrawer.style.display = 'none';
    mockFrame.style.display = 'none';
    mockFrame.src = 'about:blank';
    mockPlaceholder.style.display = 'flex';
    mockPlaceholder.offsetWidth = 400;

    annoSandbox.window.toggleAnnotationDrawer();
    check('当处于文件夹或未选项目空状态时，按 C 严格拦截，抽屉绝不弹出', mockDrawer.style.display === 'none');

    // 场景 B: 正在查看具体原型 (myFrame 显示且有真实 asset.php 地址)
    mockFrame.style.display = 'block';
    mockFrame.src = '/asset.php/v1/index.html';
    mockPlaceholder.style.display = 'none';
    mockPlaceholder.offsetWidth = 0;
    annoSandbox.window.updateAnnoContext(1, 1, 'V1.0');

    annoSandbox.window.toggleAnnotationDrawer();
    check('当正在查看具体有效原型时，按 C 快捷键顺畅呼出批注抽屉', mockDrawer.style.display === 'flex');

    // 场景 C: 抽屉打开时，按 ESC 键收起
    annoSandbox.window.toggleAnnotationDrawer(false);
    check('按 ESC 或关闭操作时，抽屉平滑收起', mockDrawer.style.display === 'none');

    // 场景 D: Axure 内嵌 mainFrame 子页面翻页与标题自适应感知仿真
    check('annotation.js 包含 getActiveFrameInfo 递归穿透函数', annoJs.includes('function getActiveFrameInfo('));
    check('annotation.js 包含 resolvePageContext 智能上下文解析', annoJs.includes('function resolvePageContext('));
    check('annotation.js 具备 Sitemap 高亮节点文本回溯提取能力', annoJs.includes('sitemapHighlight'));
    check('annotation.js 具备抽屉展开期的实时心跳探测机制', annoJs.includes('startContextWatcher('));
    check('annotation.js 包含 pageNameHeader 与 $axure 官方通道优先读取', annoJs.includes('.pageNameHeader') && annoJs.includes('$axure.page'));
    check('annotation.js 包含多层嵌套面包屑递归回溯机制', annoJs.includes('crumbs.join(\' › \')'));

    // 场景 E: 跨页批注就地平滑跳转与同页防刷仿真 (M6)
    const appCss = fs.readFileSync(path.join(root, 'assets/css/app.css'), 'utf8');
    check('annotation.js 正确声明与导出 jumpToAnnotationPage', annoJs.includes('window.jumpToAnnotationPage = function('));
    check('annotation.js 使用共享按钮类渲染可键盘操作的页面跳转入口', annoJs.includes('<button type="button" class="btn-cancel btn-sm anno-page-link"') && annoJs.includes('jumpToAnnotationPage('));
    check('app.css 包含 Linear 风格 .anno-page-link 胶囊与 hover 样式', appCss.includes('.anno-page-link') && appCss.includes('.anno-page-link:hover'));
    check('app.css 包含 .anno-card.anno-focus 聚焦微动效', appCss.includes('.anno-card.anno-focus') && appCss.includes('annoCardPulse'));

    // 仿真 1: 同页防呆测试
    let lastToast = '';
    annoSandbox.showToast = (msg) => { lastToast = msg; };
    mockFrame.src = '/asset.php/v1/detail.html';
    mockFrame.contentWindow.location.pathname = '/asset.php/v1/detail.html';
    mockFrame.contentWindow.location.href = 'http://localhost/asset.php/v1/detail.html?t=123';
    annoSandbox.fetch = () => Promise.resolve({json: () => Promise.resolve({success: true, data: {
        item_id: 1, version_id: 1, page_url: 'http://localhost/asset.php/v1/detail.html', annotation: {id: 101}
    }})});
    const mockCard = {
        getAttribute: (attr) => attr === 'data-page-path' ? 'detail.html' : null,
        scrollIntoView: () => {}
    };
    annoSandbox.document.getElementById = (id) => {
        if (id === 'myFrame') return mockFrame;
        if (id === 'placeholder') return mockPlaceholder;
        if (id === 'annotationDrawer') return mockDrawer;
        if (id === 'annoCard_101') return mockCard;
        return null;
    };

    await annoSandbox.window.jumpToAnnotationPage(101);
    check('同页点击忽略宿主缓存时间戳且不重刷 iframe', mockFrame.contentWindow.location.href === 'http://localhost/asset.php/v1/detail.html?t=123');
    check('同页点击时提示当前已在此页面', lastToast === '当前已在此页面');

    // 仿真 2: 跨页就地跳转测试
    const mockCard2 = {
        getAttribute: (attr) => attr === 'data-page-path' ? 'checkout.html#page_pay' : null,
        scrollIntoView: () => {}
    };
    annoSandbox.document.getElementById = (id) => {
        if (id === 'myFrame') return mockFrame;
        if (id === 'placeholder') return mockPlaceholder;
        if (id === 'annotationDrawer') return mockDrawer;
        if (id === 'annoCard_102') return mockCard2;
        return null;
    };
    annoSandbox.fetch = (url) => {
        if (url.includes('id=102')) {
            return Promise.resolve({
                json: () => Promise.resolve({
                    success: true,
                    data: {
                        item_id: 1,
                        version_id: 1,
                        page_url: 'http://localhost/asset.php/v1/start.html#p=收银台',
                        annotation: { id: 102 }
                    }
                })
            });
        }
        return Promise.resolve({ json: () => Promise.resolve({ success: false }) });
    };

    await annoSandbox.window.jumpToAnnotationPage(102);
    check('跨页就地跳转时 iframe 被平滑定向至目标页面', mockFrame.contentWindow.location.href === 'http://localhost/asset.php/v1/start.html#p=收银台');

    annoSandbox.fetch = () => Promise.resolve({json: () => Promise.resolve({success: true, data: {
        item_id: 1, version_id: 1, page_url: 'http://localhost/asset.php/v1/start.html#p=details', annotation: {id: 103}
    }})});
    await annoSandbox.window.jumpToAnnotationPage(103);
    check('同一 HTML 的不同 hash 会切换页面', mockFrame.contentWindow.location.hash === '#p=details');

    let releaseOld;
    mockFrame.contentWindow.location.href = 'http://localhost/asset.php/v1/index.html';
    annoSandbox.fetch = url => url.includes('id=104')
        ? new Promise(resolve => { releaseOld = resolve; })
        : Promise.resolve({json: () => Promise.resolve({success: true, data: {
            item_id: 1, version_id: 1, page_url: 'http://localhost/asset.php/v1/page2.html', annotation: {id: 105}
        }})});
    const oldJump = annoSandbox.window.jumpToAnnotationPage(104);
    await annoSandbox.window.jumpToAnnotationPage(105);
    releaseOld({json: () => Promise.resolve({success: true, data: {
        item_id: 1, version_id: 1, page_url: 'http://localhost/asset.php/v1/page1.html', annotation: {id: 104}
    }})});
    await oldJump;
    check('迟到的旧响应不会覆盖最后一次点击', mockFrame.contentWindow.location.href.endsWith('/page2.html'));

    annoSandbox.fetch = url => url.includes('action=annotation_target')
        ? new Promise(resolve => { releaseOld = resolve; })
        : Promise.resolve({json: () => Promise.resolve({success: false})});
    const previousContextJump = annoSandbox.window.jumpToAnnotationPage(106);
    annoSandbox.window.updateAnnoContext(2, 2, 'V2');
    releaseOld({json: () => Promise.resolve({success: true, data: {
        item_id: 1, version_id: 1, page_url: 'http://localhost/asset.php/v1/page1.html', annotation: {id: 106}
    }})});
    await previousContextJump;
    check('项目或版本切换后旧定位响应失效', mockFrame.contentWindow.location.href.endsWith('/page2.html'));

    console.log('\n[*] 5. 控制中心管理操作沉浸零刷新与面板结构规范断言');
    const modalsPhp = fs.readFileSync(path.join(root, 'includes/modals.php'), 'utf8');

    // 1. 结构与排版规范
    check('modals.php 中 panel-brand 正确嵌套在 admin-content-body 且内嵌 settingsForm',
        modalsPhp.includes('<div id="panel-brand" class="admin-panel">\n                    <form id="settingsForm"'));
    check('modals.php 中 panel-logs 为标准 admin-panel',
        modalsPhp.includes('<div id="panel-logs" class="admin-panel">'));

    // 2. 文件夹与项目零刷新断言
    check('admin.js 声明 isAdminConsoleOpen 守卫函数', adminJs.includes('function isAdminConsoleOpen('));
    check('admin.js handleCategorySave 针对控制中心开启沉浸零刷新与脏标记',
        adminJs.includes('isAdminConsoleOpen()') && adminJs.includes('markAdminConsoleChanged()'));
    check('admin.js moveCategoryOrder 彻底清除 sessionStorage 与 location.reload',
        !adminJs.includes("sessionStorage.setItem('reopen_overview_subtab', 'folders')"));
    check('admin.js moveItemOrder 彻底清除 sessionStorage 与 location.reload',
        !adminJs.includes("sessionStorage.setItem('reopen_overview_subtab', 'projects')"));
    check('admin.js user_handover 在控制中心内安全标记变动且不触发即时 reload',
        adminJs.includes("if (isAdminConsoleOpen()) {\n                markAdminConsoleChanged();\n            } else {\n                setTimeout(function() { window.location.reload(); }, 1200);"));
    check('admin.js 自动保存 queueAutoSave 成功时自动标记 adminConsoleChanged',
        adminJs.includes("var actionLabel = action === 'save_role_permissions'")
        && adminJs.includes("t('admin.roles.saved', null, '角色权限已保存')")
        && adminJs.includes("t('admin.settings.saved', null, '系统设置已保存')")
        && adminJs.includes("showToast(actionLabel, 'success');\n            if (isAdminConsoleOpen()) {\n                markAdminConsoleChanged();\n            }"));

    // 3. 同名文件夹分组识别与评审看板跨文件夹排序一致仿真
    check('modals.php 为发版下拉 optgroup 与评审看板 option 输出 data-cat-id',
        modalsPhp.includes('<optgroup label="<?php') || (modalsPhp.includes("data-cat-id=\"' . (int)\$c['id']") && modalsPhp.includes('data-cat-id="<?php echo (int)$pf[\'category_id\']; ?>"')));
    {
        function makeMockNode(tag, attrs = {}) {
            const node = {
                tagName: tag.toUpperCase(),
                attrs: { ...attrs },
                children: [],
                parentNode: null,
                value: attrs.value || '',
                textContent: '',
                label: attrs.label || '',
                get options() {
                    const res = [];
                    (function walk(list) {
                        for (const item of list) {
                            if (item.tagName === 'OPTION') res.push(item);
                            if (item.children && item.children.length) walk(item.children);
                        }
                    })(node.children);
                    return res;
                },
                get firstChild() { return node.children[0] || null; },
                getAttribute(k) { return Object.prototype.hasOwnProperty.call(node.attrs, k) ? node.attrs[k] : null; },
                setAttribute(k, v) { node.attrs[k] = String(v); if (k === 'label') node.label = String(v); },
                querySelectorAll(sel) {
                    if (sel === 'optgroup') return node.children.filter(c => c.tagName === 'OPTGROUP');
                    return [];
                },
                querySelector(sel) {
                    const m = /^option\[value="([^"]+)"\]$/.exec(sel);
                    if (m) return node.options.find(o => String(o.value) === m[1]) || null;
                    return null;
                },
                appendChild(child) {
                    if (child.parentNode) child.parentNode.removeChild(child);
                    child.parentNode = node;
                    node.children.push(child);
                    return child;
                },
                insertBefore(child, ref) {
                    if (child.parentNode) child.parentNode.removeChild(child);
                    child.parentNode = node;
                    const idx = ref ? node.children.indexOf(ref) : -1;
                    if (idx === -1) node.children.push(child);
                    else node.children.splice(idx, 0, child);
                    return child;
                },
                removeChild(child) {
                    const idx = node.children.indexOf(child);
                    if (idx !== -1) node.children.splice(idx, 1);
                    child.parentNode = null;
                    return child;
                }
            };
            return node;
        }

        // 模拟两个同名文件夹：文件夹 20（靠前）含项目 201，文件夹 10（靠后）含项目 101
        const itemCatSelect = makeMockNode('select');
        const cOpt20 = makeMockNode('option', { value: '20' }); cOpt20.textContent = '同名文件夹';
        const cOpt10 = makeMockNode('option', { value: '10' }); cOpt10.textContent = '同名文件夹';
        itemCatSelect.appendChild(cOpt20); itemCatSelect.appendChild(cOpt10);

        const uploadSelect = makeMockNode('select');
        const g20 = makeMockNode('optgroup', { label: '同名文件夹', 'data-cat-id': '20' });
        const u201 = makeMockNode('option', { value: '201' }); u201.textContent = 'B-旧项目';
        g20.appendChild(u201);
        const g10 = makeMockNode('optgroup', { label: '同名文件夹', 'data-cat-id': '10' });
        const u101 = makeMockNode('option', { value: '101' }); u101.textContent = 'A-旧项目';
        g10.appendChild(u101);
        uploadSelect.appendChild(g20); uploadSelect.appendChild(g10);

        const annoSelect = makeMockNode('select');
        const a0 = makeMockNode('option', { value: '0' }); a0.textContent = '全部项目';
        const a201 = makeMockNode('option', { value: '201', 'data-cat-id': '20' }); a201.textContent = 'B-旧项目';
        const a101 = makeMockNode('option', { value: '101', 'data-cat-id': '10' }); a101.textContent = 'A-旧项目';
        annoSelect.appendChild(a0); annoSelect.appendChild(a201); annoSelect.appendChild(a101);

        const sortSandbox = {
            window: {
                DASHBOARD_DATA: {
                    projects: [
                        { id: 201, category_id: 20, name: 'B-旧项目', versions: [] },
                        { id: 101, category_id: 10, name: 'A-旧项目', versions: [] }
                    ]
                }
            },
            document: {
                getElementById: (id) => {
                    if (id === 'itemCatSelect') return itemCatSelect;
                    if (id === 'uploadItemSelect') return uploadSelect;
                    if (id === 'filterAnnoProject') return annoSelect;
                    return null;
                },
                createElement: (tag) => makeMockNode(tag)
            },
            getCategoryNameById: () => '同名文件夹'
        };
        sortSandbox.global = sortSandbox;
        vm.createContext(sortSandbox);

        const helperStart = adminJs.indexOf('function getOrderedCategoryIds(');
        const helperEnd = adminJs.indexOf('if (typeof window !== \'undefined\') {\n    window.onQuickCreateModalClosed');
        const dashStart = adminJs.indexOf('function syncDashboardSaveProject(');
        const dashEnd = adminJs.indexOf('function syncDashboardRemoveProject(');
        vm.runInContext(adminJs.slice(helperStart, helperEnd) + '\n' + adminJs.slice(dashStart, dashEnd), sortSandbox);

        // 在第二个同名文件夹（id=10）中新建项目 102
        sortSandbox.syncProjectSelectOption(102, 'A-新建项目', '', 10, '同名文件夹');
        const groupOrders = uploadSelect.children.map(g => g.children.map(o => Number(o.value)));
        const annoOrders = annoSelect.options.filter(o => o.value !== '0').map(o => Number(o.value));
        const dataOrders = sortSandbox.window.DASHBOARD_DATA.projects.map(p => p.id);
        check('同名文件夹下新建项目按 data-cat-id 精确插入对应发版分组顶部',
            JSON.stringify(groupOrders) === JSON.stringify([[201], [102, 101]]));
        check('较旧文件夹新建项目在评审看板与数据缓存中均保持文件夹优先+组内置顶',
            JSON.stringify(annoOrders) === JSON.stringify([201, 102, 101]) &&
            JSON.stringify(dataOrders) === JSON.stringify([201, 102, 101]));
    }

    console.log('\n[*] 6. 弹窗合理聚焦策略护栏验证');
    {
        const appJs = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
        const shareJs = fs.readFileSync(path.join(root, 'assets/js/share.js'), 'utf8');
        let focusedEl = null;
        const selectNode = { tagName: 'SELECT', type: 'select-one', readOnly: false, disabled: false, tabIndex: 0, getClientRects: () => [1], closest: () => null, focus() { focusedEl = this; } };
        const readonlyNode = { tagName: 'INPUT', type: 'text', readOnly: true, disabled: false, tabIndex: 0, getClientRects: () => [1], closest: () => null, focus() { focusedEl = this; } };
        const textNode = { tagName: 'INPUT', type: 'text', readOnly: false, disabled: false, tabIndex: 0, getClientRects: () => [1], closest: () => null, focus() { focusedEl = this; } };
        const closeBtn = { tagName: 'BUTTON', type: 'button', readOnly: false, disabled: false, tabIndex: 0, getClientRects: () => [1], closest: () => null, focus() { focusedEl = this; } };
        const makeModal = (id, children) => ({
            id,
            style: { display: 'none' },
            tabIndex: -1,
            attrs: {},
            setAttribute(k, v) { this.attrs[k] = v; },
            hasAttribute(k) { return k in this.attrs; },
            querySelector() { return null; },
            querySelectorAll() { return children; },
            contains(el) { return el === this || children.includes(el); },
            focus() { focusedEl = this; }
        });
        const dashboardModal = makeModal('adminConsoleModal', [closeBtn, selectNode]);
        const formModal = makeModal('formModal', [selectNode, readonlyNode, textNode]);
        const modalMap = {
            adminConsoleModal: dashboardModal,
            formModal: formModal,
            textNode: textNode
        };
        const focusSandbox = {
            modalStack: [],
            modalInerted: [],
            document: {
                activeElement: null,
                body: {},
                getElementById: id => modalMap[id] || null
            },
            clearPasswordStrength() {}
        };
        vm.createContext(focusSandbox);
        const start = appJs.indexOf('function modalFocusable(');
        const end = appJs.indexOf('function closeModal(');
        vm.runInContext(appJs.slice(start, end), focusSandbox);

        focusSandbox.openModal('formModal');
        check('未传 preferredId 时跳过 select 与 readonly 输入框，聚焦首个可编辑输入', focusedEl === textNode);

        focusedEl = null;
        focusSandbox.openModal('adminConsoleModal', 'adminConsoleModal');
        check('控制中心传自身 ID 时聚焦容器本身而非筛选下拉框', focusedEl === dashboardModal);

        check('控制中心/版本管理/分享弹窗不自动抢焦点至下拉或只读输入框',
            adminJs.includes("openModal('adminConsoleModal', 'adminConsoleModal')")
            && adminJs.includes("openModal('versionManageModal', 'versionManageModal')")
            && shareJs.includes("openModal('shareManageModal', 'shareManageModal')"));
        check('发版与新建项目弹窗跳过前置预选下拉框，直接聚焦名称输入框',
            adminJs.includes("openModal('uploadModal', 'uploadVerName')")
            && adminJs.includes("openModal('itemModal', 'itemName')"));
    }

    // 7. Linear 风格顶栏版本切换器 (ver-picker.js) 交互与同步护栏
    {
        const verPickerJs = fs.readFileSync(path.join(root, 'assets/js/ver-picker.js'), 'utf8');
        const indexPhp = fs.readFileSync(path.join(root, 'index.php'), 'utf8');
        const sharePhp = fs.readFileSync(path.join(root, 'share.php'), 'utf8');
        const exportPy = fs.readFileSync(path.join(root, '.dev/export_release.py'), 'utf8');

        check('export_release.py 白名单已纳入 assets/js/ver-picker.js', exportPy.includes("'assets/js/ver-picker.js'"));
        check('index.php 与 share.php 均引入 ver-picker.js 并保留原生 select 兼容包裹',
            indexPhp.includes('ver-picker-wrap') && indexPhp.includes('assets/js/ver-picker.js')
            && sharePhp.includes('ver-picker-wrap') && sharePhp.includes('assets/js/ver-picker.js'));

        function makeDomNode(tag) {
            const attrs = {};
            const listeners = {};
            const classes = new Set();
            const node = {
                tagName: (tag || 'DIV').toUpperCase(),
                style: { display: '' },
                hidden: false,
                tabIndex: 0,
                value: '',
                textContent: '',
                title: '',
                children: [],
                options: [],
                selectedIndex: 0,
                _innerHTML: '',
                set innerHTML(v) { this._innerHTML = v; if (v === '') this.children = []; },
                get innerHTML() { return this._innerHTML; },
                set className(v) {
                    classes.clear();
                    String(v || '').split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
                },
                get className() { return Array.from(classes).join(' '); },
                classList: {
                    add: (...c) => c.forEach(x => classes.add(x)),
                    remove: (...c) => c.forEach(x => classes.delete(x)),
                    toggle: (c, f) => { const on = f !== undefined ? !!f : !classes.has(c); if (on) classes.add(c); else classes.delete(c); },
                    contains: (c) => classes.has(c)
                },
                setAttribute: (k, v) => { attrs[k] = String(v); },
                getAttribute: (k) => (k in attrs ? attrs[k] : null),
                hasAttribute: (k) => (k in attrs) || (k === 'hidden' && node.hidden === true),
                addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
                dispatchEvent: (ev) => {
                    (listeners[ev.type || ev] || []).forEach(fn => fn({
                        type: ev.type || ev,
                        target: node,
                        key: ev.key,
                        stopPropagation() {},
                        stopImmediatePropagation() { ev._stoppedImmediate = true; },
                        preventDefault() {}
                    }));
                },
                insertBefore: (newNode, refNode) => {
                    const idx = node.children.indexOf(refNode);
                    if (idx >= 0) node.children.splice(idx, 0, newNode);
                    else node.children.push(newNode);
                    newNode.parentNode = node;
                    return newNode;
                },
                appendChild: (c) => {
                    if (c.tagName === 'FRAGMENT') {
                        c.children.forEach(item => { node.children.push(item); item.parentNode = node; });
                        c.children = [];
                    } else {
                        if (c.parentNode && c.parentNode.children) {
                            const oldIdx = c.parentNode.children.indexOf(c);
                            if (oldIdx >= 0) c.parentNode.children.splice(oldIdx, 1);
                        }
                        node.children.push(c);
                        c.parentNode = node;
                    }
                    return c;
                },
                closest: (sel) => {
                    if (sel === '.ver-picker-wrap' && node.parentNode && node.parentNode.classList && node.parentNode.classList.contains('ver-picker-wrap')) {
                        return node.parentNode;
                    }
                    return null;
                },
                contains: (t) => t === node || node.children.some(c => c === t || (c.contains && c.contains(t))),
                focus: () => { lastFocused = node; },
                getBoundingClientRect: () => ({ left: 40, top: 60, right: 240, bottom: 98, width: 200, height: 38 }),
                scrollIntoView: () => {}
            };
            return node;
        }

        let lastFocused = null;
        const bodyNode = makeDomNode('body');
        const wrapNode = makeDomNode('div');
        wrapNode.className = 'ver-picker-wrap';
        wrapNode.style.display = 'none';

        const selectNode = makeDomNode('select');
        selectNode.id = 'barVerSelect';
        selectNode.className = 'top-ver-select';
        selectNode.style.display = 'none';
        wrapNode.appendChild(selectNode);
        bodyNode.appendChild(wrapNode);

        for (let i = 1; i <= 7; i++) {
            const opt = makeDomNode('option');
            opt.textContent = 'V0.' + i + '.0';
            opt.value = 'asset.php/v' + i + '/index.html';
            opt.setAttribute('data-ver', 'V0.' + i + '.0');
            opt.setAttribute('data-ver-id', String(i));
            selectNode.options.push(opt);
        }
        selectNode.selectedIndex = 6; // V0.7.0

        // 构造通用弹窗内带 optgroup 的 .m-input select、.m-select-sm 和 hidden select
        const formGroup = makeDomNode('div');
        const itemSelect = makeDomNode('select');
        itemSelect.id = 'uploadItemSelect';
        itemSelect.className = 'm-input';
        const grp = makeDomNode('optgroup');
        grp.setAttribute('label', '核心业务');
        const gOpt1 = makeDomNode('option'); gOpt1.textContent = '机柜配置器'; gOpt1.value = '10';
        const gOpt2 = makeDomNode('option'); gOpt2.textContent = '协同平台'; gOpt2.value = '11';
        grp.appendChild(gOpt1); grp.appendChild(gOpt2);
        itemSelect.appendChild(grp);
        itemSelect.options = [gOpt1, gOpt2];
        itemSelect.selectedIndex = 0;
        formGroup.appendChild(itemSelect);
        bodyNode.appendChild(formGroup);

        const smSelect = makeDomNode('select');
        smSelect.id = 'filterAnnoProject';
        smSelect.className = 'm-select-sm dashboard-project-filter';
        const smOpt = makeDomNode('option'); smOpt.textContent = '全部项目'; smOpt.value = '0';
        smSelect.appendChild(smOpt);
        smSelect.options = [smOpt];
        bodyNode.appendChild(smSelect);

        const hiddenSelect = makeDomNode('select');
        hiddenSelect.id = 'mcpProjectScope';
        hiddenSelect.className = 'm-input';
        hiddenSelect.hidden = true;
        bodyNode.appendChild(hiddenSelect);

        const docListeners = {};
        const winListeners = {};
        const pickerSandbox = {
            innerWidth: 1280,
            innerHeight: 800,
            document: {
                readyState: 'complete',
                body: bodyNode,
                documentElement: { clientWidth: 1280, clientHeight: 800 },
                createElement: (t) => makeDomNode(t),
                createDocumentFragment: () => makeDomNode('fragment'),
                getElementById: (id) => ({ barVerSelect: selectNode, uploadItemSelect: itemSelect, filterAnnoProject: smSelect }[id] || null),
                querySelectorAll: () => [selectNode, itemSelect, smSelect, hiddenSelect],
                addEventListener: (ev, fn) => { (docListeners[ev] = docListeners[ev] || []).push(fn); }
            },
            Event: function(type) { this.type = type; },
            addEventListener: (ev, fn) => { (winListeners[ev] = winListeners[ev] || []).push(fn); }
        };
        pickerSandbox.window = pickerSandbox;
        vm.createContext(pickerSandbox);
        vm.runInContext(verPickerJs, pickerSandbox);

        const triggerBtn = wrapNode.children.find(c => c.classList.contains('top-ver-trigger'));
        const menuEl = wrapNode.children.find(c => c.classList.contains('ver-popover-menu'));
        check('ver-picker 隐藏态时同步隐藏外层容器与浮层', wrapNode.style.display === 'none' && menuEl.hidden === true);

        selectNode.style.display = 'inline-block';
        pickerSandbox.syncVersionPicker('barVerSelect');
        check('ver-picker 启用后显示触发按钮并回显当前选中版本 V0.7.0',
            wrapNode.style.display === 'inline-flex'
            && wrapNode.classList.contains('is-enhanced')
            && triggerBtn.children[1].textContent === 'V0.7.0');

        let changeFired = 0;
        selectNode.addEventListener('change', () => { changeFired++; });

        // 打开浮层，校验纯净单行列表渲染
        triggerBtn.dispatchEvent({ type: 'click' });
        const listEl = menuEl.children[0];
        check('ver-picker 展开纯净单行菜单并高亮当前选中版本',
            menuEl.hidden === false
            && listEl.children.length === 7
            && listEl.children[6].classList.contains('is-selected')
            && listEl.children[0].children[0].textContent === 'V0.1.0');

        listEl.children[2].dispatchEvent({ type: 'click' });
        check('点击选项后同步更新原生 select、触发 change、收起浮层并回焦触发按钮',
            selectNode.selectedIndex === 2
            && triggerBtn.children[1].textContent === 'V0.3.0'
            && changeFired === 1
            && menuEl.hidden === true
            && lastFocused === triggerBtn);

        // 再次打开并在主窗口失焦（点入 iframe）时自动关闭
        triggerBtn.dispatchEvent({ type: 'click' });
        check('再次点击触发按钮正常展开菜单', menuEl.hidden === false);
        (winListeners.blur || []).forEach(fn => fn());
        check('窗口 blur（例如点击原型 iframe 画布）时自动收起版本菜单', menuEl.hidden === true);

        // 验证通用单选下拉 (.m-input 含 optgroup + .m-select-sm + hidden 排除 + ESC 拦截)
        const itemWrap = itemSelect.parentNode;
        const itemTrig = itemWrap.children.find(c => c.classList.contains('linear-select-trigger'));
        const itemMenu = itemWrap.children.find(c => c.classList.contains('ver-popover-menu'));
        check('通用 .m-input 自动包装 .is-block 与 38px 阶梯触发器 (.is-lg)，hidden 控件不被误增强',
            itemWrap.classList.contains('is-block')
            && itemTrig.classList.contains('is-lg')
            && itemTrig.children[0].textContent === '机柜配置器'
            && !hiddenSelect._verPickerInst);

        const smWrap = smSelect.parentNode;
        const smTrig = smWrap.children.find(c => c.classList.contains('linear-select-trigger'));
        check('.m-select-sm 自动应用 28px 阶梯 (.is-sm) 并透传宽度限制类',
            smWrap.classList.contains('dashboard-project-filter') && smTrig.classList.contains('is-sm'));

        itemTrig.dispatchEvent({ type: 'click' });
        const itemList = itemMenu.children[0];
        check('含 optgroup 的下拉展开后渲染分组标题与全部选项，并挂载 Portal 菜单',
            itemMenu.hidden === false
            && itemList.children[0].classList.contains('linear-select-group-label')
            && itemList.children[0].textContent === '核心业务'
            && itemList.children[1].children[0].textContent === '机柜配置器'
            && itemList.children[2].children[0].textContent === '协同平台');

        const escEv = { key: 'Escape', preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() { this._stoppedImmediate = true; } };
        (docListeners.keydown || []).forEach(fn => fn(escEv));
        check('展开状态下按 ESC 只关闭下拉并阻断冒泡传播（不误关所属弹窗）',
            itemMenu.hidden === true && escEv._stoppedImmediate === true);
    }

    console.log(`\n======================================================`);
    console.log(`  交互优化质量护栏测试通过: ${passed} 项断言全部合格！`);
    console.log(`======================================================\n`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(asyncGuard));
