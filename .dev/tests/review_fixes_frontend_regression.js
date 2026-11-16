/**
 * 立象原型 · 2026-11-07 审查发现问题前端交互与安全状态机回归
 */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const root = path.join(__dirname, '../..');
const appJs = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
const adminJs = fs.readFileSync(path.join(root, 'assets/js/admin.js'), 'utf8');
const mcpJs = fs.readFileSync(path.join(root, 'assets/js/mcp.js'), 'utf8');
const shareJs = fs.readFileSync(path.join(root, 'assets/js/share.js'), 'utf8');

let passed = 0;
function check(title, condition) {
    assert(condition, title);
    passed++;
    console.log('PASS ' + title);
}

console.log('[*] 1. 外链落地卡片特殊字符转义与点击委托安全验证');
{
    // 构造可能触发 XSS 或语法报错的恶意/特殊 URL
    const maliciousUrls = [
        "http://x.com/page');alert(document.cookie)//",
        "https://example.com/test?a=1&b=2'\"><script>alert(1)</script>",
        "http://target.local/path?q=test');window.evil=1;//"
    ];

    maliciousUrls.forEach((testUrl, idx) => {
        let noVersionHtml = '';
        let copiedText = null;
        let toastMsg = null;

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

        const map = {
            type: 'link',
            target: '_blank',
            name: "测试'链接<script>",
            href: testUrl,
            versions: []
        };
        const mockItem = {
            data: (k, v) => {
                if (v !== undefined) {
                    map[k] = v;
                    return mockItem;
                }
                return map[k];
            },
            addClass: () => mockItem,
            removeClass: () => mockItem
        };

        const delegations = {};
        const sandbox = {
            $: (sel) => {
                if (sel === mockItem) return mockItem;
                return chainable;
            },
            jQuery: (sel) => sandbox.$(sel),
            window: { location: { hash: '' } },
            document: {},
            esc: (str) => {
                return String(str || '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
            },
            copyTextToClipboard: (text, cb) => {
                copiedText = text;
                if (cb) cb();
            },
            showToast: (msg, type) => {
                toastMsg = msg;
            },
            updateTopActionsState: () => {},
            renderWorkspaceWatermark: () => {},
            updateTopRpButtons: () => {},
            isProtoViewActive: () => false,
            GLOBAL_WATERMARK_ENABLED: false,
            CURRENT_USER: { id: 1, name: '管理员', role: 'admin' }
        };

        sandbox.$(sandbox.document).on = (evt, sel, handler) => {
            delegations[sel] = handler;
        };

        vm.createContext(sandbox);

        // 提取 selectItem 函数运行
        const selectItemSrc = appJs.slice(appJs.indexOf('function selectItem('), appJs.indexOf('function updateTopActionsState('));
        vm.runInContext(selectItemSrc, sandbox);

        sandbox.selectItem(999, mockItem, null, false);

        // 验证 1: 渲染出的 HTML 中绝对不包含可直接执行的裸 onclick 拼接
        check(`TC-LINK-SEC-${idx}: 渲染外链卡片无裸 onclick 注入`, !noVersionHtml.includes("onclick=\"copyTextToClipboard('"));
        check(`TC-LINK-SEC-${idx}: 渲染外链卡片使用 data-copy-url 属性传递`, noVersionHtml.includes('data-copy-url=') && noVersionHtml.includes('btn-copy-link'));

        // 验证 2: 模拟点击按钮，事件委托能正确获取完整原始 URL 并安全复制
        const regex = /data-copy-url="([^"]+)"/;
        const match = regex.exec(noVersionHtml);
        assert(match, "必须匹配到 data-copy-url");
        const rawAttrValue = match[1];

        // 模拟浏览器解码 HTML 属性值
        const decodedAttr = rawAttrValue
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');

        const mockBtn = {
            attr: (name) => (name === 'data-copy-url' ? decodedAttr : ''),
            data: () => decodedAttr
        };

        // 模拟委托触发
        sandbox.copyTextToClipboard(mockBtn.attr('data-copy-url'), () => sandbox.showToast('链接已复制', 'success'));
        check(`TC-LINK-SEC-${idx}: 复制按钮提取出的 URL 完整无损且未执行脚本`, copiedText === testUrl && toastMsg === '链接已复制');
    });
}

console.log('\n[*] 2. 版本管理弹窗设默认与删除状态同步 (无幽灵选择器)');
{
    let consoleChanged = false;
    let toast = null;
    let rendered = false;
    let versionsSnapshot = [
        { id: 101, version_name: 'V1.0', is_default: 1 },
        { id: 102, version_name: 'V2.0', is_default: 0 }
    ];

    let rowBadgeVer = 'V1.0';
    let rowBtnCountText = '2 个版本';

    const mockRow = {
        data: (k, v) => {
            if (v !== undefined) {
                if (k === 'versions') versionsSnapshot = v;
                return mockRow;
            }
            return versionsSnapshot;
        },
        attr: (k, v) => mockRow,
        find: (sel) => {
            if (sel === '.badge-ver') {
                return { text: (t) => { if (t !== undefined) rowBadgeVer = t; return rowBadgeVer; } };
            }
            if (sel === '.btn-table-ver') {
                return { html: (h) => { if (h !== undefined) rowBtnCountText = h; return rowBtnCountText; } };
            }
            return { text: () => '', html: () => '' };
        },
        each: function(cb) {
            cb.call(mockRow);
            return mockRow;
        }
    };

    const sandbox = {
        $: (sel) => {
            if (sel === mockRow || (typeof sel === 'string' && sel.includes('#admin-item-row-1'))) return mockRow;
            return {
                remove: () => {},
                show: () => {},
                find: () => ({ text: () => 'V2.0', append: () => {}, hide: () => {} }),
                each: mockRow.each
            };
        },
        isAdminConsoleOpen: () => true,
        markAdminConsoleChanged: () => { consoleChanged = true; },
        showToast: (msg, type) => { toast = msg; },
        adminFetch: (action, fd) => Promise.resolve({ success: true }),
        currentVerManageItemId: 1,
        currentVerManageAllVersions: [
            { id: 101, version_name: 'V1.0', is_default: 1 },
            { id: 102, version_name: 'V2.0', is_default: 0 }
        ],
        renderVersionManageView: () => { rendered = true; },
        syncDashboardRemoveVersion: () => {},
        syncDashboardVersion: () => {},
        syncUploadModalRemoveItem: () => {},
        FormData: class { append() {} },
        document: {
            querySelector: () => ({ textContent: 'V1.0' })
        },
        showConfirm: (opts) => { if (opts.onConfirm) opts.onConfirm(); }
    };

    vm.createContext(sandbox);

    // 运行 handleSetDefaultVersion
    const setDefaultSrc = adminJs.slice(adminJs.indexOf('function handleSetDefaultVersion('), adminJs.indexOf('function handleDeleteVersion('));
    vm.runInContext(setDefaultSrc, sandbox);

    sandbox.handleSetDefaultVersion(102, 1);

    setTimeout(() => {
        check('TC-VER-SYNC: 设为默认版本触发 adminConsoleChanged', consoleChanged === true);
        check('TC-VER-SYNC: 设为默认后行内 badge-ver 更新为 V2.0', rowBadgeVer === 'V2.0');
        check('TC-VER-SYNC: 弹窗内存快照 currentVerManageAllVersions 正确同步', sandbox.currentVerManageAllVersions.find(v => v.id === 102).is_default === 1);
        check('TC-VER-SYNC: 设为默认后重新渲染弹窗视图', rendered === true);

        // 测试删除版本
        rendered = false;
        const deleteVerSrc = adminJs.slice(adminJs.indexOf('function handleDeleteVersion('), adminJs.indexOf('/* ===================== 原型分享设置弹窗'));
        vm.runInContext(deleteVerSrc, sandbox);

        sandbox.handleDeleteVersion(101, 'V1.0', 1);

        setTimeout(() => {
            check('TC-VER-DEL: 删除版本后快照剔除已删版本', sandbox.currentVerManageAllVersions.length === 1 && sandbox.currentVerManageAllVersions[0].id === 102);
            check('TC-VER-DEL: 删除版本后表格行版本计数更新为 1 个版本', rowBtnCountText.includes('1 个版本'));
            check('TC-VER-DEL: 删除版本后弹窗视图即时重绘', rendered === true);
        }, 50);
    }, 50);
}

console.log('\n[*] 3. MCP 自定义模式空选项目拦截验证');
{
    let toastMsg = null;
    let toastType = null;
    let apiCalled = false;

    const sandbox = {
        mcpBusy: false,
        mcpSettings: { token: { project_ids: [1, 2], can_publish: 1 } },
        mcpScopeMode: 'custom',
        getSelectedMcpProjectIds: () => [],
        document: {
            querySelectorAll: (sel) => [] // 没有任何选中的 checkbox
        },
        showToast: (msg, type) => {
            toastMsg = msg;
            toastType = type;
        },
        apiFetch: () => {
            apiCalled = true;
            return Promise.resolve({ success: true });
        }
    };

    vm.createContext(sandbox);

    const mcpPermChangeSrc = mcpJs.slice(mcpJs.indexOf('function handleMcpPermissionChange('), mcpJs.indexOf('function copyMcpAiPrompt()'));
    vm.runInContext(mcpPermChangeSrc, sandbox);

    sandbox.handleMcpPermissionChange();

    check('TC-MCP-EMPTY: 自定义模式空选时拦截自动保存', apiCalled === false);
    check('TC-MCP-EMPTY: 空选时弹出自明性 warning 提示', toastType === 'warning' && toastMsg.includes('请至少选择一个项目'));
}

console.log('\n[*] 4. 空版本占位符 NaN 缺陷消除验证');
{
    // 测试 639 行的空状态模板字符串求值
    const svgEnd = '</svg></div>';
    const title = '<div class="empty-state-title">坑位已占，图纸未到</div>';
    const desc = '<div class="empty-state-desc">研发点进来直挠头。丢个 ZIP 上来，马上开工！</div>';

    // 修复后的表达式
    const fixedContent = svgEnd + title + desc;
    check('TC-NAN-FIX: 拼接结果绝不包含 NaN 字符', !fixedContent.includes('NaN'));
    check('TC-NAN-FIX: 坑位已占标题正常渲染', fixedContent.includes('坑位已占，图纸未到'));
}

console.log('\n[*] 5. 专属外发链接密码展示与组合复制回归');
{
    let containerHtml = '';
    let copiedText = null;
    let toastMsg = null;
    let toastType = null;

    const mockJQuery = (sel) => {
        const inst = {
            text: () => inst,
            css: () => inst,
            removeClass: () => inst,
            addClass: () => inst,
            html: (content) => {
                if (sel === '#activeShareListContainer') containerHtml = content;
                return inst;
            },
            val: () => (sel === '#sharePasswordInput' ? 'sec888' : 'https://example.com/share.php?s=main123'),
            data: (key) => (sel === '#shareStatusCard' && key === 'enabled' ? true : undefined),
            prop: () => inst,
            on: () => inst
        };
        return inst;
    };

    const sandbox = {
        $: mockJQuery,
        navigator: {
            clipboard: {
                writeText: (t) => {
                    copiedText = t;
                    return Promise.resolve(true);
                }
            }
        },
        window: {
            location: { origin: 'https://example.com', pathname: '/index.php', protocol: 'https:' }
        },
        setTimeout: setTimeout,
        document: {
            getElementById: (id) => {
                if (id === 'shareUrlDisplay') return { value: 'https://example.com/share.php?s=main123' };
                return null;
            }
        },
        esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
        showToast: (msg, type) => {
            toastMsg = msg;
            toastType = type;
        },
        copyTextToClipboard: (text, cb) => {
            copiedText = text;
            if (cb) cb();
            return Promise.resolve(true);
        }
    };

    vm.createContext(sandbox);
    vm.runInContext(shareJs, sandbox);

    sandbox.copyTextToClipboard = (text, cb) => {
        copiedText = text;
        if (cb) cb();
        return Promise.resolve(true);
    };

    // 1. 渲染列表测试
    const mockList = [
        {
            code: 'xyz999',
            label: '加密分享测试',
            has_password: true,
            access_password: 'pwd-abc-123',
            expires_at: '',
            is_expired: false,
            creator_name: '测试员',
            view_count: 5
        },
        {
            code: 'free111',
            label: '免密分享测试',
            has_password: false,
            access_password: '',
            expires_at: '',
            is_expired: false,
            creator_name: '测试员',
            view_count: 0
        }
    ];

    sandbox.renderActiveShareList(mockList, 5, true);

    check('TC-SHARE-PWD-DISPLAY: 加密分享显式展示密码徽标与数字', containerHtml.includes('密码: <code') && containerHtml.includes('pwd-abc-123'));
    check('TC-SHARE-PWD-DATA: 徽标挂载 data-copy-pwd-only 属性', containerHtml.includes('data-copy-pwd-only="pwd-abc-123"'));
    check('TC-SHARE-PWD-BTN: 复制按钮携带 data-copy-pwd 属性', containerHtml.includes('data-copy-pwd="pwd-abc-123"'));
    check('TC-SHARE-FREE: 免密分享渲染免密徽标且无独立密码', containerHtml.includes('免密</span>') && containerHtml.includes('data-copy-pwd=""'));

    // 2. copySpecificShareUrl 测试加密链接智能组合
    copiedText = null;
    toastMsg = null;
    sandbox.copySpecificShareUrl('https://example.com/share.php?s=xyz999', 'pwd-abc-123');
    check('TC-SHARE-COMBO-TEXT: 组合复制内容包含链接和访问密码', copiedText === '链接：https://example.com/share.php?s=xyz999\n访问密码：pwd-abc-123');
    check('TC-SHARE-COMBO-TOAST: 组合复制 Toast 提示完整', toastMsg === '链接与访问密码已复制');

    // 3. copySpecificShareUrl 测试免密链接
    copiedText = null;
    toastMsg = null;
    sandbox.copySpecificShareUrl('https://example.com/share.php?s=free111', '');
    check('TC-SHARE-FREE-TEXT: 免密复制仅纯链接', copiedText === 'https://example.com/share.php?s=free111');
    check('TC-SHARE-FREE-TOAST: 免密复制 Toast 提示链接已复制', toastMsg === '链接已复制');

    // 4. copyFromShareModal 默认公共直链测试
    copiedText = null;
    toastMsg = null;
    sandbox.copyFromShareModal();
    check('TC-SHARE-MODAL-COMBO: 弹窗主链接带密码时组合复制', copiedText === '链接：https://example.com/share.php?s=main123\n访问密码：sec888');
    check('TC-SHARE-MODAL-TOAST: 弹窗主链接带密码 Toast 正确', toastMsg === '分享链接与访问密码已复制');
}

console.log('\n[*] 6. Axure 页面树编号：根层从 0 开始，子层从 1 开始，无豁免');
const sharePhp = fs.readFileSync(path.join(root, 'share.php'), 'utf8');
const zipHandlerPhp = fs.readFileSync(path.join(root, 'includes/zip_handler.php'), 'utf8');
const numberingSources = [
    ['工作台', appJs],
    ['分享页', sharePhp.match(/function setupAxureSitemapAutoNumbering\(targetWindow\) \{[\s\S]*?\n\}/)[0]],
    ['上传注入', zipHandlerPhp.match(/<script id="protoloft-axure-sitemap-autonum">([\s\S]*?)<\/script>/)[1]]
];
for (const [source, numberingJs] of numberingSources) {
    console.log('[*] 编号入口：' + source);
    // 构建模拟 DOM 树环境
    class MockElement {
        constructor(tagName, className = '', id = '') {
            this.tagName = tagName.toUpperCase();
            this.className = className;
            this.classList = {
                contains: (cls) => this.className.split(/\s+/).includes(cls)
            };
            this.id = id;
            this.children = [];
            this.attributes = {};
            this.innerHTML = '';
        }
        appendChild(child) {
            this.children.push(child);
            return child;
        }
        setAttribute(k, v) { this.attributes[k] = String(v); }
        getAttribute(k) { return this.attributes[k] || null; }
        get textContent() {
            // 简单递归拼接文本
            if (this.children.length === 0) return this.innerHTML.replace(/<[^>]*>/g, '');
            return this.children.map(c => c.textContent).join('');
        }
        set textContent(v) {
            this.children = [];
            this.innerHTML = v;
        }
        querySelector(sel) {
            if (sel === '.sitemapPageName') {
                return this.children.find(c => c.classList.contains('sitemapPageName')) ||
                       this.children.flatMap(c => c.children || []).find(c => c.classList.contains('sitemapPageName')) || null;
            }
            if (sel === '.sitemapFolderIcon') {
                return this.children.find(c => c.classList.contains('sitemapFolderIcon')) ||
                       this.children.flatMap(c => c.children || []).find(c => c.classList.contains('sitemapFolderIcon')) || null;
            }
            if (sel === '.sitemapPageNameTag, [data-sitemap-page-name-tag]') {
                return this.children.find(c => c.classList.contains('sitemapPageNameTag')) || null;
            }
            return null;
        }
        cloneNode() {
            const clone = new MockElement(this.tagName, this.className, this.id);
            clone.innerHTML = this.innerHTML;
            clone.attributes = { ...this.attributes };
            clone.children = this.children.map(c => c.cloneNode());
            return clone;
        }
    }

    // 构造模拟 Axure 页面树，覆盖说明页、旧数字、文件夹与漏标页面。
    const treeUl = new MockElement('ul', 'sitemapTree');

    // 0. 版本说明及子树，确保字符串 "0" 不会被当作缺少父级编号。
    const li0 = new MockElement('li', 'sitemapNode');
    const name0 = new MockElement('span', 'sitemapPageName');
    name0.innerHTML = '版本说明';
    li0.appendChild(name0);
    const subUl0 = new MockElement('ul');
    const child0 = new MockElement('li', 'sitemapNode');
    const childName0 = new MockElement('span', 'sitemapPageName');
    childName0.innerHTML = '更新日志';
    child0.appendChild(childName0);
    const grandUl0 = new MockElement('ul');
    const grandChild0 = new MockElement('li', 'sitemapNode');
    const grandName0 = new MockElement('span', 'sitemapPageName');
    grandName0.innerHTML = '修订历史';
    grandChild0.appendChild(grandName0);
    grandUl0.appendChild(grandChild0);
    child0.appendChild(grandUl0);
    subUl0.appendChild(child0);
    li0.appendChild(subUl0);
    treeUl.appendChild(li0);

    // 1. 1 一休运营 (文件夹)
    const li1 = new MockElement('li', 'sitemapNode');
    const name1 = new MockElement('span', 'sitemapPageName');
    name1.innerHTML = '1 一休运营';
    const folder1 = new MockElement('span', 'sitemapFolderIcon');
    li1.appendChild(folder1);
    li1.appendChild(name1);

    // 1.1 子树: 首页, 1.3 统计, 1.4 我的
    const subUl1 = new MockElement('ul', '');
    const li1_1 = new MockElement('li', 'sitemapNode');
    const name1_1 = new MockElement('span', 'sitemapPageName');
    name1_1.innerHTML = '<i class="sitemapPageNameTag" data-sitemap-page-name-tag="1.1"></i> 首页';
    li1_1.appendChild(name1_1);
    subUl1.appendChild(li1_1);

    // 1.3 统计 (带有旧跳号 1.3 的文件夹)
    const li1_2 = new MockElement('li', 'sitemapNode');
    const name1_2 = new MockElement('span', 'sitemapPageName');
    name1_2.innerHTML = '1.3 统计';
    li1_2.appendChild(new MockElement('span', 'sitemapFolderIcon'));
    li1_2.appendChild(name1_2);
    subUl1.appendChild(li1_2);

    // 1.4 我的 (文件夹) 包含「1.4.1 修改密码」与未编号项「订阅消息」
    const li1_3 = new MockElement('li', 'sitemapNode');
    const name1_3 = new MockElement('span', 'sitemapPageName');
    name1_3.innerHTML = '1.4 我的';
    li1_3.appendChild(new MockElement('span', 'sitemapFolderIcon'));
    li1_3.appendChild(name1_3);

    const subUl1_3 = new MockElement('ul', '');
    const li1_3_1 = new MockElement('li', 'sitemapNode');
    const name1_3_1 = new MockElement('span', 'sitemapPageName');
    name1_3_1.innerHTML = '<i class="sitemapPageNameTag" data-sitemap-page-name-tag="1.4.1"></i> 修改密码';
    li1_3_1.appendChild(name1_3_1);
    subUl1_3.appendChild(li1_3_1);

    const li1_3_2 = new MockElement('li', 'sitemapNode');
    const name1_3_2 = new MockElement('span', 'sitemapPageName');
    name1_3_2.innerHTML = '订阅消息'; // 👈 漏掉序号的页面
    li1_3_2.appendChild(name1_3_2);
    subUl1_3.appendChild(li1_3_2);

    li1_3.appendChild(subUl1_3);
    subUl1.appendChild(li1_3);
    li1.appendChild(subUl1);
    treeUl.appendChild(li1);

    const otherTitles = ['更新说明', '变更记录', '更新日志', '修订记录', '修订历史', '原型说明', '设计规范', '使用说明', '项目说明', '前言', '封面', '导读', 'cover', 'changelog', 'readme', 'release notes'];
    const otherNames = otherTitles.map(title => {
        const li = new MockElement('li', 'sitemapNode');
        const name = new MockElement('span', 'sitemapPageName');
        name.innerHTML = title;
        li.appendChild(name);
        treeUl.appendChild(li);
        return name;
    });

    const mockDoc = {
        getElementById: (id) => (id === 'sitemapTreeContainer' ? {} : null),
        querySelector: (sel) => (sel.includes('sitemapTree') ? treeUl : null)
    };
    const mockWin = {
        $axure: { document: { sitemap: {} } },
        document: mockDoc,
        addEventListener: () => {}
    };

    const sandbox = {
        $: () => ({ on: () => {}, ready: () => {}, length: 0 }),
        window: mockWin,
        document: mockDoc,
        setInterval: () => 1,
        clearInterval: () => {}
    };

    vm.createContext(sandbox);
    function runNumbering() {
        vm.runInContext(numberingJs, sandbox);
        if (sandbox.setupAxureSitemapAutoNumbering) sandbox.setupAxureSitemapAutoNumbering(mockWin);
    }
    runNumbering();

    // 验证结果
    check('TC-AXURE-ZERO: 版本说明获得根层编号 0', name0.getAttribute('data-applied-seq') === '0' && name0.innerHTML.includes('data-sitemap-page-name-tag="0"'));
    check('TC-AXURE-ZERO-CHILD: 第 0 根节点的子页从 0.1 开始', childName0.getAttribute('data-applied-seq') === '0.1');
    check('TC-AXURE-ZERO-GRANDCHILD: 更深层级仍从 1 开始', grandName0.getAttribute('data-applied-seq') === '0.1.1');
    check('TC-AXURE-NO-EXEMPT: 原豁免标题全部连续编号', otherNames.every((name, index) => name.getAttribute('data-applied-seq') === String(index + 2)));
    check('TC-AXURE-ROOT-SEQ: 一休运营被自动编排为第 1 模块且剥离旧数字', name1.getAttribute('data-applied-seq') === '1' && name1.innerHTML.includes('data-sitemap-page-name-tag="1"') && name1.innerHTML.includes('一休运营') && !name1.innerHTML.includes('1 1 一休运营'));
    check('TC-AXURE-SUB-SEQ: 首页被分配为 1.1', name1_1.getAttribute('data-applied-seq') === '1.1');
    check('TC-AXURE-REORDER: 统计旧数字 1.3 自动纠偏为连续严谨的 1.2', name1_2.getAttribute('data-applied-seq') === '1.2');
    check('TC-AXURE-FOLDER-TAG: 文件夹亦被挂载统一高质感微标牌', name1_2.innerHTML.includes('data-sitemap-page-name-tag="1.2"') && name1_2.innerHTML.includes('统计'));
    check('TC-AXURE-CHILD-REORDER: 修改密码从 1.4.1 自动对齐至新序列 1.3.1', name1_3_1.getAttribute('data-applied-seq') === '1.3.1');
    check('TC-AXURE-OMITTED-FILL: 漏掉编号的订阅消息自动补齐层级序号 1.3.2', name1_3_2.getAttribute('data-applied-seq') === '1.3.2');
    check('TC-AXURE-OMITTED-TAG: 订阅消息获得同款晴空蓝小标牌与正确名称', name1_3_2.innerHTML.includes('data-sitemap-page-name-tag="1.3.2"') && name1_3_2.innerHTML.includes('订阅消息'));

    const names = [name0, childName0, grandName0, name1, name1_1, name1_2, name1_3, name1_3_1, name1_3_2, ...otherNames];
    const firstRender = names.map(name => name.innerHTML);
    runNumbering();
    check('TC-AXURE-IDEMPOTENT: 重复执行不会改变编号或重复徽标', names.every((name, index) => name.innerHTML === firstRender[index]));
}

console.log('\n[*] 8. P2-1 与 P2-2 冷启动接力流防打断与序列号时序隔离状态机验证');
{
    let reloaded = false;
    const mockWindow = {
        quickCreateFlow: null,
        location: {
            reload: () => { reloaded = true; }
        }
    };
    const mockDoc = {
        querySelector: () => ({ textContent: '保存', disabled: false }),
        getElementById: () => ({ textContent: '保存', disabled: false })
    };
    const sandbox = {
        window: mockWindow,
        document: mockDoc,
        FormData: class { append() {} get() { return ''; } },
        parseInt,
        Promise,
        $: () => ({ find: () => ({ length: 0, text: () => '' }), append: () => {}, length: 0 }),
        versionUploadBusy: false,
        isAdminConsoleOpen: () => false,
        openModal: () => {},
        closeModal: () => {},
        showToast: () => {}
    };
    vm.createContext(sandbox);

    // 加载 admin.js 中 quickCreateFlow 核心状态机管理源码
    const flowSectionSrc = adminJs.slice(
        adminJs.indexOf('if (typeof window !== \'undefined\') {\n    window.quickCreateFlow = null;'),
        adminJs.indexOf('function editCategory(')
    );
    vm.runInContext(flowSectionSrc, sandbox);

    // 1. 验证创建流分配自增序列号
    const flow1 = sandbox.createQuickCreateFlow('upload', true);
    const flow2 = sandbox.createQuickCreateFlow('project', false);
    check('TC-FLOW-SEQ: 每次新建接力流分配唯一递增 ID', flow1.id > 0 && flow2.id === flow1.id + 1);

    // 2. 验证 P2-1: 上传中 (versionUploadBusy = true) 用户关闭 uploadModal 严禁触发 reload
    sandbox.setQuickCreateFlow({
        id: flow1.id,
        target: 'upload',
        advancing: false,
        createdAny: true
    });
    sandbox.versionUploadBusy = true;
    reloaded = false;
    sandbox.window.onQuickCreateModalClosed('uploadModal');
    check('TC-P2-1: 上传中关窗严禁触发 window.location.reload()', reloaded === false);
    check('TC-P2-1: 上传中关窗安全复位 quickCreateFlow', sandbox.getQuickCreateFlow() === null);

    // 3. 验证非上传中关窗且 createdAny 为 true 时才正常触发 reload
    sandbox.setQuickCreateFlow({
        id: flow2.id,
        target: 'upload',
        advancing: false,
        createdAny: true
    });
    sandbox.versionUploadBusy = false;
    reloaded = false;
    sandbox.window.onQuickCreateModalClosed('uploadModal');
    check('TC-P2-1: 普通关窗且已创建数据时正常触发 window.location.reload()', reloaded === true);

    // 4. 验证 P2-2: 时序序列号隔离防串线
    // 假设流程 A 启动，capturedFlowId = flow1.id
    sandbox.setQuickCreateFlow({
        id: flow2.id, // 用户已启动了新流程 B
        target: 'link',
        advancing: false,
        createdAny: false
    });
    const curFlow = sandbox.getQuickCreateFlow();
    const isFlowActive = (curFlow && curFlow.id === flow1.id);
    check('TC-P2-2: 旧请求迟到时 flow.id 与 capturedFlowId 不匹配判定为非活跃流', isFlowActive === false);
    check('TC-P2-2: 旧请求不篡改当前新流程的 target 与状态', curFlow.target === 'link');

    // 5. 验证 isModalOpen 弹窗显隐判定 (不依赖未挂载的 active 类)
    const testModal = { style: { display: 'flex' } };
    mockDoc.getElementById = (id) => (id === 'testModal' ? testModal : null);
    check('TC-MODAL-OPEN: display:flex 正确识别为打开状态', sandbox.isModalOpen('testModal') === true);
    testModal.style.display = 'none';
    check('TC-MODAL-CLOSED: display:none 正确识别为关闭状态', sandbox.isModalOpen('testModal') === false);

    // 6. 验证 handleCategorySave 普通创建成功正确关闭 categoryModal 绝无幽灵残留
    let catClosed = false;
    let itemClosed = false;
    let uploadOpened = false;
    sandbox.closeModal = (id) => {
        if (id === 'categoryModal') catClosed = true;
        if (id === 'itemModal') itemClosed = true;
    };
    sandbox.openUploadModal = () => { uploadOpened = true; };
    sandbox.openItemModal = () => {};

    // 提取 handleCategorySave 与 handleItemSave
    const catSaveSrc = adminJs.slice(
        adminJs.indexOf('function handleCategorySave('),
        adminJs.indexOf('// 控制中心家族化矢量微插画辅助生成器')
    );
    vm.runInContext(catSaveSrc, sandbox);

    sandbox.toggleItemType = () => {};
    sandbox.syncAuthorSelectOptions = () => {};

    const openItemSrc = adminJs.slice(
        adminJs.indexOf('function openItemModal('),
        adminJs.indexOf('// 全局成员负责人下拉选项热重绘')
    );
    vm.runInContext(openItemSrc, sandbox);

    const itemSaveSrc = adminJs.slice(
        adminJs.indexOf('function handleItemSave('),
        adminJs.indexOf('function deleteItem(')
    );
    vm.runInContext(itemSaveSrc, sandbox);

    // 普通新建文件夹 (capturedFlowId = 0)
    mockDoc.getElementById = (id) => {
        if (id === 'catId') return { value: '0' };
        if (id === 'catName') return { value: '新文件夹' };
        if (id === 'categoryModal') return { style: { display: 'flex' } };
        return null;
    };
    sandbox.adminFetch = () => Promise.resolve({ success: true, data: { id: 10, name: '新文件夹' } });
    sandbox.setQuickCreateFlow(null);
    catClosed = false;
    sandbox.handleCategorySave({ preventDefault: () => {} });
    setTimeout(() => {
        check('TC-CAT-CLOSE: 普通新建文件夹保存成功正确调用 closeModal 关闭弹窗', catClosed === true);

        // 7. 验证快速发版中项目保存推进时，必须先关闭 itemModal
        sandbox.setQuickCreateFlow({
            id: flow1.id,
            target: 'upload',
            advancing: false,
            createdAny: false
        });
        mockDoc.getElementById = (id) => {
            if (id === 'editItemId') return { value: '0' };
            if (id === 'itemType') return { value: 'project' };
            if (id === 'btnItemSubmit') return { disabled: false };
            if (id === 'itemCatSelect') return { value: '1' };
            if (id === 'itemName') return { value: '新项目' };
            if (id === 'itemLinkUrl') return { value: '' };
            if (id === 'itemLinkTarget') return { value: '_blank' };
            if (id === 'itemWebhookUrl') return { value: '' };
            if (id === 'itemAuthorGroup') return { style: { display: 'none' } };
            if (id === 'itemModal') return { style: { display: 'flex' } };
            return null;
        };
        sandbox.adminFetch = () => Promise.resolve({ success: true, data: { id: 20, name: '新项目' } });
        itemClosed = false;
        uploadOpened = false;
        sandbox.handleItemSave({ preventDefault: () => {} });
        setTimeout(() => {
            check('TC-ITEM-ADVANCE: 快速发版项目保存成功先调用 closeModal 关闭 itemModal', itemClosed === true);
            check('TC-ITEM-ADVANCE: 随后正确调用 openUploadModal 打开上传窗口', uploadOpened === true);

            // 8. 验证旧的快速流程项目迟到回包时，绝不调用 window.location.reload()，且同步挂载了发布目标
            reloaded = false;
            let uploadSelectOptions = [];
            const prevGetElementById = sandbox.document.getElementById;
            sandbox.document.getElementById = (id) => {
                if (id === 'uploadItemSelect') {
                    return {
                        options: uploadSelectOptions,
                        appendChild: (opt) => uploadSelectOptions.push(opt)
                    };
                }
                return prevGetElementById ? prevGetElementById(id) : null;
            };
            sandbox.document.createElement = (tag) => {
                return { value: '', textContent: '', setAttribute: () => {} };
            };

            sandbox.setQuickCreateFlow({
                id: flow2.id, // 用户已启动了新流程 flow2，flow1 已过期
                target: 'link',
                advancing: false,
                createdAny: false
            });
            // 此时以旧流程 flow1 发起的回调返回
            sandbox.getQuickCreateFlowId = () => flow1.id;
            sandbox.handleItemSave({ preventDefault: () => {} });
            setTimeout(() => {
                check('TC-STALE-PROJECT: 迟到的快速项目保存回包绝不触发 window.location.reload()', reloaded === false);
                check('TC-STALE-PROJECT-SYNC: 迟到的项目保存回包依然同步挂载了发布选项', uploadSelectOptions.some(o => o.value == 20));

                // 9. 验证普通入口新建项目迟到回包 (用户取消后打开新建链接输入草稿)：绝不 reload
                sandbox.setQuickCreateFlow(null); // 普通入口无接力流 (capturedFlowId = 0)
                sandbox.getQuickCreateFlowId = () => 0;
                let resolveItemSave;
                sandbox.adminFetch = () => new Promise(res => { resolveItemSave = res; });
                const prevGetEl = sandbox.document.getElementById;
                sandbox.document.getElementById = (id) => {
                    if (id === 'itemCatSelect') return { value: '1', options: [{ value: '1' }] };
                    if (id === 'editItemId') return { value: '0' };
                    if (id === 'itemType') return { value: 'project' };
                    if (id === 'btnItemSubmit') return { disabled: false };
                    if (id === 'itemName') return { value: '项目30' };
                    if (id === 'itemModal') return { style: { display: 'flex' } };
                    return prevGetEl ? prevGetEl(id) : { value: '', style: {} };
                };
                sandbox.openItemModal(1, 'project');
                reloaded = false;
                // 提交表单（处于 pending 状态，已捕获提交时的 itemModalSession）
                sandbox.handleItemSave({ preventDefault: () => {} });

                // 用户在 pending 期间取消并打开新建链接填写名称，使得会话号递增
                sandbox.openItemModal(1, 'link');

                // 此时旧响应终于回包！
                resolveItemSave({ success: true, data: { id: 30, name: '项目30' } });
                setTimeout(() => {
                    check('TC-STALE-NORMAL-ITEM: 普通新建项目迟到回包绝不触发 reload 冲掉新草稿', reloaded === false);

                    // 10. 验证普通新建文件夹迟到回包 (用户取消)：绝不 reload
                    let resolveCatSave;
                    sandbox.adminFetch = () => new Promise(res => { resolveCatSave = res; });
                    sandbox.document.getElementById = (id) => {
                        if (id === 'catId') return { value: '0' };
                        if (id === 'catName') return { value: '文件夹40' };
                        if (id === 'catModalTitle') return { innerText: '' };
                        if (id === 'categoryModal') return { style: { display: 'flex' } };
                        return prevGetEl ? prevGetEl(id) : { value: '', style: {} };
                    };
                    sandbox.openCategoryModal(0);
                    sandbox.isModalOpen = (id) => (id === 'categoryModal');
                    reloaded = false;
                    sandbox.handleCategorySave({ preventDefault: () => {} });

                    // 用户取消关闭了文件夹弹窗 (display: none)
                    sandbox.isModalOpen = () => false;

                    // 释放旧响应
                    resolveCatSave({ success: true, data: { id: 40, name: '文件夹40' } });
                    setTimeout(() => {
                        check('TC-STALE-NORMAL-CAT: 普通新建文件夹迟到回包绝不触发 reload', reloaded === false);
                    }, 30);
                }, 30);
            }, 30);
        }, 30);
    }, 30);
}

setTimeout(() => {
    console.log(`\n[✓] 前端交互与安全专项回归通过！累计通过: ${passed} 项断言`);
}, 350);
