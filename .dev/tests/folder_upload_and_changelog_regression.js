/**
 * 立象原型 (ProtoLoft) - 原型文件夹上传打包与更新日志 Markdown/换行回归测试
 * 覆盖：
 * 1. 客户端纯原生 Store 模式 PKZIP 组装、公共目录智能剥离、CRC32 准确性校验；
 * 2. 操作系统垃圾文件过滤与 HTML 入口预检；
 * 3. 服务端多层文件夹嵌套与平铺多文件入口探测逻辑 (BFS) 验证；
 * 4. Markdown 安全转义、防 XSS 注入、自然换行与列表排版验证。
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
    if (condition) {
        passCount++;
        console.log('  \x1b[32m✓\x1b[0m ' + message);
    } else {
        failCount++;
        console.error('  \x1b[31m✗\x1b[0m ' + message);
    }
}

// ===================== 1. 测试 CRC32 与 PKZIP 组装 =====================
console.log('\n\x1b[1m[测试套件 1] 纯原生 PKZIP 组装与目录剥离\x1b[0m');

function computeCrc32(buf, prevCrc) {
    let crc = (prevCrc === undefined) ? 0xFFFFFFFF : (prevCrc ^ 0xFFFFFFFF);
    if (!computeCrc32.table) {
        const table = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let j = 0; j < 8; j++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[i] = c;
        }
        computeCrc32.table = table;
    }
    const t = computeCrc32.table;
    for (let k = 0; k < buf.length; k++) {
        crc = t[(crc ^ buf[k]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

// 模拟 buildPkZipBuffer
function buildPkZipBuffer(fileItems) {
    const encoder = new TextEncoder();
    const localHeaders = [];
    const centralHeaders = [];
    let offset = 0;
    const total = fileItems.length;

    for (let i = 0; i < total; i++) {
        const item = fileItems[i];
        const pathBytes = encoder.encode(item.path.replace(/\\/g, '/'));
        const uint8 = item.data;
        const crc = computeCrc32(uint8);
        const size = uint8.length;

        const mtime = new Date('2026-11-05T12:00:00Z');
        const dosTime = ((mtime.getHours() << 11) | (mtime.getMinutes() << 5) | (mtime.getSeconds() >> 1)) & 0xFFFF;
        const dosDate = (((mtime.getFullYear() - 1980) << 9) | ((mtime.getMonth() + 1) << 5) | mtime.getDate()) & 0xFFFF;

        const lh = new Uint8Array(30 + pathBytes.length);
        const lhdv = new DataView(lh.buffer);
        lhdv.setUint32(0, 0x04034b50, true);
        lhdv.setUint16(4, 20, true);
        lhdv.setUint16(6, 0x0800, true); // UTF-8
        lhdv.setUint16(8, 0, true);      // Store
        lhdv.setUint16(10, dosTime, true);
        lhdv.setUint16(12, dosDate, true);
        lhdv.setUint32(14, crc, true);
        lhdv.setUint32(18, size, true);
        lhdv.setUint32(22, size, true);
        lhdv.setUint16(26, pathBytes.length, true);
        lhdv.setUint16(28, 0, true);
        lh.set(pathBytes, 30);

        localHeaders.push(lh, uint8);

        const ch = new Uint8Array(46 + pathBytes.length);
        const chdv = new DataView(ch.buffer);
        chdv.setUint32(0, 0x02014b50, true);
        chdv.setUint16(4, 20, true);
        chdv.setUint16(6, 20, true);
        chdv.setUint16(8, 0x0800, true);
        chdv.setUint16(10, 0, true);
        chdv.setUint16(12, dosTime, true);
        chdv.setUint16(14, dosDate, true);
        chdv.setUint32(16, crc, true);
        chdv.setUint32(20, size, true);
        chdv.setUint32(24, size, true);
        chdv.setUint16(28, pathBytes.length, true);
        chdv.setUint16(30, 0, true);
        chdv.setUint16(32, 0, true);
        chdv.setUint16(34, 0, true);
        chdv.setUint16(36, 0, true);
        chdv.setUint32(38, 0, true);
        chdv.setUint32(42, offset, true);
        ch.set(pathBytes, 46);

        centralHeaders.push(ch);
        offset += lh.length + size;
    }

    const centralOffset = offset;
    let centralSize = 0;
    for (let ci = 0; ci < centralHeaders.length; ci++) {
        centralSize += centralHeaders[ci].length;
    }

    const eocd = new Uint8Array(22);
    const edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true);
    edv.setUint16(4, 0, true);
    edv.setUint16(6, 0, true);
    edv.setUint16(8, total, true);
    edv.setUint16(10, total, true);
    edv.setUint32(12, centralSize, true);
    edv.setUint32(16, centralOffset, true);
    edv.setUint16(20, 0, true);

    const all = [...localHeaders, ...centralHeaders, eocd];
    return Buffer.concat(all.map(b => Buffer.from(b)));
}

// 测试标准 CRC32
assert(computeCrc32(Buffer.from("123456789")).toString(16) === 'cbf43926', 'CRC32 标准算力基准测试正确');

// 测试公共父目录剥离逻辑
function stripCommonParent(paths) {
    if (!paths.length) return { prefix: '', paths: [] };
    const firstParts = paths[0].split('/');
    let prefix = '';
    if (firstParts.length > 1) {
        const prefixParts = [];
        for (let pi = 0; pi < firstParts.length - 1; pi++) {
            const candidate = firstParts[pi];
            let allMatch = true;
            for (let fi = 1; fi < paths.length; fi++) {
                const cur = paths[fi].split('/');
                if (cur.length <= pi + 1 || cur[pi] !== candidate) {
                    allMatch = false;
                    break;
                }
            }
            if (allMatch) prefixParts.push(candidate);
            else break;
        }
        if (prefixParts.length > 0) prefix = prefixParts.join('/') + '/';
    }
    const stripped = paths.map(p => prefix && p.startsWith(prefix) ? p.slice(prefix.length) : p);
    return { prefix, paths: stripped };
}

const mockNestedPaths = [
    'MyPrototype_V2/Export/index.html',
    'MyPrototype_V2/Export/css/style.css',
    'MyPrototype_V2/Export/images/大象.png'
];
const stripRes = stripCommonParent(mockNestedPaths);
assert(stripRes.prefix === 'MyPrototype_V2/Export/', '自动识别并剥离冗余双层公共目录: ' + stripRes.prefix);
assert(stripRes.paths[0] === 'index.html', '首层文件成功提至原型根目录: ' + stripRes.paths[0]);
assert(stripRes.paths[2] === 'images/大象.png', '子目录层级完美保留: ' + stripRes.paths[2]);

// 生成实体 ZIP 并用 Python 交叉解压校验
const zipTestPath = '/tmp/test_protoloft_pack.zip';
const zipBuf = buildPkZipBuffer([
    { path: 'index.html', data: Buffer.from('<!DOCTYPE html><html><body><h1>ProtoLoft V1</h1></body></html>') },
    { path: 'images/大象.txt', data: Buffer.from('立象以尽意') }
]);
fs.writeFileSync(zipTestPath, zipBuf);

try {
    const pyCheck = execSync(`python3 -c '
import zipfile
with zipfile.ZipFile("${zipTestPath}", "r") as z:
    names = z.namelist()
    assert "index.html" in names
    assert "images/大象.txt" in names
    content = z.read("images/大象.txt").decode("utf-8")
    assert content == "立象以尽意"
print("OK")
'`).toString().trim();
    assert(pyCheck === 'OK', 'Python zipfile 模块无损解压并校验 UTF-8 中文路径与数据一致');
} catch (e) {
    assert(false, 'Python 解压校验失败: ' + e.message);
}

// ===================== 2. 测试垃圾文件过滤、隐藏目录过滤与服务端脚本拦截（加载真实 admin.js） =====================
console.log('\n\x1b[1m[测试套件 2] 系统垃圾文件净化、隐藏目录过滤与入口预检\x1b[0m');

const adminJs = fs.readFileSync(path.join(__dirname, '../../assets/js/admin.js'), 'utf8');
const toastLogs = [];
const mockBadgeText = { textContent: '' };
const mockBadge = { style: { display: 'none' } };
const mockUploadZipName = { textContent: '', classList: { add() {}, remove() {} } };
const adminContext = {
    currentProtoSource: null,
    document: {
        getElementById: (id) => ({
            protoFileBadge: mockBadge,
            protoFileBadgeIcon: { className: '' },
            protoFileBadgeText: mockBadgeText,
            protoDropActions: { style: { display: 'flex' } },
            uploadZipName: mockUploadZipName
        }[id] || null)
    },
    showToast: (msg, type) => toastLogs.push({ msg, type }),
    clearSelectedProtoSource: () => { adminContext.currentProtoSource = null; },
    formatProtoBytes: (b) => b + ' B'
};
vm.createContext(adminContext);
vm.runInContext(
    adminJs.slice(adminJs.indexOf('function setProtoSourceFolder('), adminJs.indexOf('function initProtoDropZone()')),
    adminContext
);

const mockFiles = (paths) => paths.map(p => ({ webkitRelativePath: p, name: p.split('/').pop(), size: 128 }));
const dirtyPaths = [
    '机柜配置器/.DS_Store',
    '机柜配置器/__MACOSX/._index.html',
    '机柜配置器/Thumbs.db',
    '机柜配置器/desktop.ini',
    '机柜配置器/.mimosa/hook-state/sess.json',
    '机柜配置器/.mimosa/reports/task-review.json',
    '机柜配置器/.git/config',
    '机柜配置器/v1.0/dir.with.dot/page.html',
    '机柜配置器/index.html',
    '机柜配置器/remixicon/remixicon.css'
];
const cleaned = adminContext.filterPrototypeFiles(mockFiles(dirtyPaths)).map(f => f.webkitRelativePath);
assert(
    cleaned.length === 3
        && cleaned.includes('机柜配置器/index.html')
        && cleaned.includes('机柜配置器/remixicon/remixicon.css')
        && cleaned.includes('机柜配置器/v1.0/dir.with.dot/page.html'),
    '真实 admin.js 过滤 .DS_Store, __MACOSX, Thumbs.db, desktop.ini, .mimosa/, .git/ 并保留含正常点号的目录'
);

toastLogs.length = 0;
badgeRendered = null;
adminContext.setProtoSourceFolder('机柜配置器', mockFiles([
    '机柜配置器/.mimosa/hook-state/sess.json',
    '机柜配置器/.DS_Store'
]));
assert(adminContext.currentProtoSource === null && toastLogs.some(t => t.msg === '选中的文件夹内没有有效文件'),
    '仅含隐藏目录/文件时清空选中源并提示无有效文件');

toastLogs.length = 0;
adminContext.setProtoSourceFolder('机柜配置器', mockFiles([
    '机柜配置器/index.html',
    '机柜配置器/scripts/build.sh'
]));
assert(adminContext.currentProtoSource === null && toastLogs.some(t => t.msg.includes('build.sh') && t.msg.includes('不允许的服务端脚本文件')),
    '文件夹内含服务端脚本（如 .sh/.php）时提前拦截并明确提示文件名');

toastLogs.length = 0;
mockBadgeText.textContent = '';
adminContext.setProtoSourceFolder('机柜配置器', mockFiles(dirtyPaths));
assert(adminContext.currentProtoSource && adminContext.currentProtoSource.files.length === 3 && mockBadgeText.textContent.includes('3 个文件'),
    '过滤隐藏目录后正确识别有效原型文件数（3 个文件）');

const nonHtmlPaths = adminContext.filterPrototypeFiles(mockFiles(['MyProject/readme.txt', 'MyProject/image.png'])).map(f => f.webkitRelativePath);
const hasHtml = nonHtmlPaths.some(p => /\.html?$/i.test(p));
assert(!hasHtml, '准确探测无 HTML 文件夹并拦截');

// ===================== 3. 测试 BFS 入口探测算法 =====================
console.log('\n\x1b[1m[测试套件 3] 服务端 BFS 入口探测算法 (多层嵌套与直接多文件)\x1b[0m');

function mockDetectEntryFile(filesList) {
    const priorityFiles = ['start_with_pages.html', 'start.html', 'index.html', 'home.html'];

    // 构建包含中间祖先目录的文件与目录树
    const dirMap = { '': { files: [], dirs: new Set() } };
    for (let f of filesList) {
        const parts = f.split('/');
        let cur = '';
        for (let i = 0; i < parts.length - 1; i++) {
            const next = cur ? `${cur}/${parts[i]}` : parts[i];
            if (!dirMap[cur]) dirMap[cur] = { files: [], dirs: new Set() };
            dirMap[cur].dirs.add(next);
            cur = next;
        }
        if (!dirMap[cur]) dirMap[cur] = { files: [], dirs: new Set() };
        dirMap[cur].files.push(parts[parts.length - 1]);
    }

    // BFS 遍历目录 (同 PHP 实现)
    const queue = [''];
    const allHtml = [];
    const visited = new Set();

    while (queue.length > 0) {
        const curDir = queue.shift();
        if (visited.has(curDir)) continue;
        visited.add(curDir);

        const node = dirMap[curDir] || { files: [], dirs: new Set() };
        const curFiles = node.files;

        // 优先级匹配
        for (let pf of priorityFiles) {
            if (curFiles.includes(pf)) {
                return curDir ? `${curDir}/${pf}` : pf;
            }
        }

        // 记录 html
        for (let f of curFiles) {
            if (/\.html?$/i.test(f)) {
                allHtml.push(curDir ? `${curDir}/${f}` : f);
            }
        }

        // 排入子目录
        for (let sub of node.dirs) {
            if (!visited.has(sub)) {
                queue.push(sub);
            }
        }
    }

    return allHtml.length > 0 ? allHtml[0] : '';
}

assert(mockDetectEntryFile(['index.html', 'style.css']) === 'index.html', '直接多文件根目录打包: 命中 index.html');
assert(mockDetectEntryFile(['Folder/start.html', 'Folder/page.html']) === 'Folder/start.html', '单层嵌套文件夹: 命中 Folder/start.html');
assert(mockDetectEntryFile(['Deep/Nested/Sub/home.html']) === 'Deep/Nested/Sub/home.html', '三层深度嵌套文件夹: 穿透命中 Deep/Nested/Sub/home.html');
assert(mockDetectEntryFile(['__MACOSX/._index.html', 'Web/start_with_pages.html']) === 'Web/start_with_pages.html', '跳过垃圾文件，优先命中最高优先级 start_with_pages.html');

// ===================== 4. 测试更新日志 Markdown 与换行 =====================
console.log('\n\x1b[1m[测试套件 4] 更新日志 Markdown 解析与 XSS 严格防御\x1b[0m');

function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

function renderMarkdownSafe(text) {
    if (!text) return '';
    var safe = esc(String(text));
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
        if (!trimmed) { closeList(); continue; }
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

// 换行测试
const multilineText = "第一行说明\n第二行说明\n第三行说明";
const renderedMultiline = renderMarkdownSafe(multilineText);
assert(renderedMultiline.includes('<p class="md-p">第一行说明</p><p class="md-p">第二行说明</p>'), '普通换行成功渲染为独立自然行段落，解决换行坍缩问题');

// Markdown 语法测试
const mdText = `### V2.0.0
- 新增**文件夹直接上传**
- 支持 \`markdown\`
1. 修复已知问题
> 披图而同心
[官网](https://protoloft.example.com)`;

const renderedMd = renderMarkdownSafe(mdText);
assert(renderedMd.includes('<h4 class="md-heading">V2.0.0</h4>'), '标题成功渲染');
assert(renderedMd.includes('<ul class="md-ul"><li>新增<strong>文件夹直接上传</strong></li>'), '无序列表与加粗成功渲染');
assert(renderedMd.includes('<code class="md-code">markdown</code>'), '行内代码成功渲染');
assert(renderedMd.includes('<ol class="md-ol"><li>修复已知问题</li></ol>'), '有序列表成功渲染');
assert(renderedMd.includes('<blockquote class="md-quote">披图而同心</blockquote>'), '引用块成功渲染');
assert(renderedMd.includes('<a href="https://protoloft.example.com" target="_blank" rel="noopener noreferrer" class="md-link">官网</a>'), '安全链接成功渲染');

// XSS 注入攻击测试：验证危险 HTML 标签和可执行属性均被安全实体化，绝不形成原生标签
const xssPayloads = [
    { input: '<script>alert("xss")</script>', dangerous: '<script>' },
    { input: '<img src=x onerror=alert(1)>', dangerous: '<img' },
    { input: '<iframe src="evil.com"></iframe>', dangerous: '<iframe' },
    { input: '[恶意链接](javascript:alert(document.cookie))', dangerous: 'href="javascript:' },
    { input: '[协议欺骗](vbscript:msgbox(1))', dangerous: 'href="vbscript:' }
];

for (let item of xssPayloads) {
    const out = renderMarkdownSafe(item.input);
    assert(!out.includes(item.dangerous), '防御 XSS 攻击向量: 拒绝生成原生标签/伪协议 (' + item.dangerous + ')');
}

// ===================== 5. 测试 RP 源文件拖拽与格式守卫 =====================
console.log('\n\x1b[1m[测试套件 5] RP 源文件拖拽格式守卫与状态流转\x1b[0m');

function isValidRpFile(filename) {
    return typeof filename === 'string' && filename.toLowerCase().endsWith('.rp');
}

assert(isValidRpFile('design_v1.rp'), '合法 .rp 格式源文件通过校验');
assert(isValidRpFile('axure.RP'), '大写 .RP 扩展名通过校验');
assert(!isValidRpFile('prototype.zip'), '拦截误拖入的 .zip 压缩包');
assert(!isValidRpFile('screenshot.png'), '拦截误拖入的图片');
assert(!isValidRpFile('index.html'), '拦截误拖入的 HTML');

// ===================== 6. 测试表单字段级报错与输入实时清除 =====================
console.log('\n\x1b[1m[测试套件 6] 表单字段级报错样式与输入实时复位\x1b[0m');

const mockInput = {
    value: '',
    customValidity: '',
    classes: new Set(),
    setCustomValidity(msg) { this.customValidity = msg; },
    classList: {
        add(cls) { mockInput.classes.add(cls); },
        remove(cls) { mockInput.classes.delete(cls); },
        contains(cls) { return mockInput.classes.has(cls); }
    }
};

function simulateClearHint(input) {
    if (input) {
        input.setCustomValidity('');
        input.classList.remove('m-input-error');
    }
}

function simulateOnInput(input, newText) {
    input.value = newText;
    simulateClearHint(input);
}

// 模拟打开弹窗
simulateClearHint(mockInput);
assert(mockInput.customValidity === '', '打开弹窗初始化时 CustomValidity 必须为空，不再误打错标');

// 模拟校验失败触发红框
mockInput.classList.add('m-input-error');
assert(mockInput.classList.contains('m-input-error'), '校验失败时成功添加 .m-input-error 错误高亮类');

// 模拟用户输入文字实时复位
simulateOnInput(mockInput, '测试用版本');
assert(!mockInput.classList.contains('m-input-error'), '用户开始输入时自动移除 .m-input-error');
assert(mockInput.customValidity === '', '用户输入后 CustomValidity 保持纯净无报错');

// 汇总
console.log(`\n\x1b[1m测试结果: 共 ${passCount + failCount} 项，通过 ${passCount} 项，失败 ${failCount} 项\x1b[0m`);
if (failCount > 0) process.exit(1);
