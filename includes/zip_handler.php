<?php
/**
 * 原型 ZIP 解压、Google 字体源头净化与入口智能探测
 */
require_once __DIR__ . '/config.php';

class ZipHandler {
    /**
     * 禁止随 ZIP 落盘的服务端脚本类扩展名 (仅拦截, 不影响 Axure 原型正常资源)
     */
    private static $blockedExtensions = [
        'php', 'phtml', 'php3', 'php4', 'php5', 'php7', 'php8', 'pht', 'phar',
        'cgi', 'pl', 'py', 'sh', 'asp', 'aspx', 'jsp', 'jspx', 'shtml',
        'htaccess', 'htpasswd', 'ini'
    ];

    /**
     * 格式化 ZIP 条目名用于安全提示（去除控制字符并限制长度）
     */
    private static function formatZipEntryLabel($name) {
        $norm = str_replace('\\', '/', (string)$name);
        $clean = @preg_replace('/[\x00-\x1F\x7F]+/u', '', $norm);
        if ($clean === null) {
            $clean = preg_replace('/[\x00-\x1F\x7F]+/', '', $norm);
        }
        $clean = trim((string)$clean);
        if ($clean === '') return '(空路径)';
        if (function_exists('mb_strimwidth')) {
            return mb_strimwidth($clean, 0, 80, '...', 'UTF-8');
        }
        return strlen($clean) > 80 ? substr($clean, 0, 77) . '...' : $clean;
    }

    /**
     * 校验 ZIP 条目名: 拒绝绝对路径、路径穿越 (..)、隐藏文件/目录与可执行脚本
     * 合法返回 null，否则返回明确的安全拦截提示文案
     */
    private static function inspectZipEntryName($name) {
        $raw = (string)$name;
        $norm = str_replace('\\', '/', $raw);
        $label = self::formatZipEntryLabel($raw);
        if ($norm === '') {
            return '压缩包内包含非法空路径条目，解压已中止';
        }
        $isDir = substr($norm, -1) === '/';
        if ($isDir) $norm = rtrim($norm, '/');
        if ($norm === '') {
            return '压缩包内包含非法空路径条目，解压已中止';
        }
        if ($norm[0] === '/' || preg_match('#^[a-zA-Z]:/#', $norm)) {
            return '压缩包内包含绝对路径「' . $label . '」，解压已中止';
        }
        foreach (explode('/', $norm) as $seg) {
            if ($seg === '' || $seg === '.' || $seg === '..') {
                return '压缩包内包含非法路径或路径穿越风险「' . $label . '」，解压已中止';
            }
            if ($seg[0] === '.') {
                return '压缩包内包含隐藏文件或目录「' . $label . '」（请移除 .git / .DS_Store / .mimosa 等隐藏内容后重试），解压已中止';
            }
        }
        if (!$isDir && in_array(strtolower(pathinfo($norm, PATHINFO_EXTENSION)), self::$blockedExtensions, true)) {
            return '压缩包内包含不允许的服务端脚本文件「' . $label . '」，解压已中止';
        }
        return null;
    }

    /**
     * 校验 ZIP 条目名是否安全
     */
    private static function isSafeZipEntryName($name) {
        return self::inspectZipEntryName($name) === null;
    }

    /**
     * 清洗文件内容中的 Google 字体外链 (支持 HTML 和 CSS)
     */
    public static function sanitizeGoogleFonts($filePath) {
        if (!file_exists($filePath)) return;
        
        $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
        if (!in_array($ext, ['html', 'htm', 'css', 'js'])) {
            return;
        }

        $content = file_get_contents($filePath);
        $changed = false;

        // 1. 清除 HTML 中的 link 标签 (googleapis, gstatic)
        if (in_array($ext, ['html', 'htm'])) {
            $newContent = preg_replace(
                '/<link[^>]+href=[\'"][^\'"]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^\'"]*[\'"][^>]*>/i',
                '<!-- [Google Fonts Removed for High Performance] -->',
                $content
            );
            if ($newContent !== $content) {
                $content = $newContent;
                $changed = true;
            }

            // 清除 preconnect / dns-prefetch 到 googleapis 的 link
            $newContent = preg_replace(
                '/<link[^>]+(?:rel=[\'"](?:preconnect|dns-prefetch)[\'"][^>]+href=[\'"][^\'"]*googleapis[^\'"]*[\'"]|href=[\'"][^\'"]*googleapis[^\'"]*[\'"][^>]+rel=[\'"](?:preconnect|dns-prefetch)[\'"])[^>]*>/i',
                '',
                $content
            );
            if ($newContent !== $content) {
                $content = $newContent;
                $changed = true;
            }
        }

        // 2. 清除 CSS 中的 @import 规则
        if (in_array($ext, ['html', 'htm', 'css'])) {
            $newContent = preg_replace(
                '/@import\s+url\([\'"]?[^\'"]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^\'"]*[\'"]?\)\s*;?/i',
                '/* [Google Fonts Import Removed] */',
                $content
            );
            if ($newContent !== $content) {
                $content = $newContent;
                $changed = true;
            }
        }

        if ($changed) {
            file_put_contents($filePath, $content);
        }
    }

    /**
     * 为原型 HTML 注入内置沉浸式增强样式与 Remix Icon 现代字体支持
     * (源头固化首帧直出，彻底消灭 iframe.on('load') 视觉闪烁与外部 CSS 文件依赖)
     */
    public static function injectPrototypeEnhancement($filePath) {
        if (!file_exists($filePath)) return;
        $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
        if (!in_array($ext, ['html', 'htm'], true)) return;

        $content = file_get_contents($filePath);
        if ($content === false) return;

        // 幂等性检测：若已全量注入则跳过
        if (strpos($content, 'protoloft-axure-sitemap-autonum') !== false || strpos($content, 'protoloft-remixicon-only') !== false) {
            return;
        }

        // 计算当前 HTML 文件相对系统根目录的相对路径，实现离线内网自给自足
        $fontUrl = app_base_path() . '/assets/fonts/remixicon.woff2';

        // 仅对潜在入口页或明确包含 Axure 播放器/目录树特征的 HTML 注入完整 Sitemap 增强，
        // 避免向几十上百个普通业务子页面重复灌入 ~20KB 播放器脚本与样式。
        $baseName = strtolower(basename($filePath));
        $isEntryCandidate = in_array($baseName, ['start.html', 'start_with_pages.html', 'index.html', 'home.html', 'default.html'], true);
        $hasAxurePlayerMarker = (
            stripos($content, 'sitemapHost') !== false ||
            stripos($content, 'sitemapTree') !== false ||
            stripos($content, 'axplayer') !== false ||
            stripos($content, 'axure/player') !== false ||
            stripos($content, 'start_c_') !== false
        );

        if (!$isEntryCandidate && !$hasAxurePlayerMarker) {
            if (preg_match('/class=[\'"][^\'"]*\bri-/', $content)) {
                $iconOnly = <<<EOD
<!-- [ProtoLoft RemixIcon Support] -->
<style id="protoloft-remixicon-only">
@font-face { font-family: "remixicon"; src: url("{$fontUrl}") format("woff2"); font-display: swap; }
[class^="ri-"], [class*=" ri-"] { font-family: 'remixicon' !important; font-style: normal; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
</style>
EOD;
                if (stripos($content, '</head>') !== false) {
                    $content = preg_replace('/<\/head>/i', $iconOnly . "\n</head>", $content, 1);
                } else {
                    $content = $iconOnly . "\n" . $content;
                }
                file_put_contents($filePath, $content);
            }
            return;
        }

        $enhancement = <<<EOD
<!-- [ProtoLoft Prototype Enhancement] -->
<style id="protoloft-prototype-enhancement">
/* 1. 消除 Axure 原生顶部烦人翻页白框、分割线与冗余提示 */
#separatorContainer.hasLeft, .pageSwapInstructions, .pluginHint { display: none !important; }
/* 2. 隐藏官方商业宣传横幅 */
#overflowMadeWith { display: none !important; }
/* 3. 左侧 Sitemap 目录树晴空蓝现代扁平化主题 (遵循 Linear 规范与 WCAG 高对比度) */
.sitemapNode { line-height: 23px !important; }
.sitemapPageName { font-size: 13px !important; }
.sitemapPageLinkContainer {
    border-radius: 4px !important;
    transition: background-color 0.15s ease, color 0.15s ease !important;
}

/* 序号小标牌（如 1.1, 1.1.1） */
.sitemapPageName i, .sitemapPageNameTag {
    display: inline-block !important;
    font-style: normal !important;
    height: 15px !important;
    line-height: 15px !important;
    border-radius: 2.5px !important;
    margin-right: 4px !important;
    color: #0076de !important;
    background: #e6f4fe !important;
    padding: 0 3.5px !important;
    font-size: 10px !important;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
    font-weight: 600 !important;
    vertical-align: 1px !important;
    letter-spacing: -0.2px !important;
    min-width: 0 !important;
    text-align: center !important;
}
.sitemapPageNameTag::before {
    content: attr(data-sitemap-page-name-tag);
}

/* 激活高亮态 (当前选中的页面)：晴空蓝软底 + 深晴空蓝高对比文字 */
.sitemapHighlight,
#sitemapTreeContainer .sitemapHighlight,
.sitemapNode.sitemapHighlight,
.sitemapHighlight > .sitemapPageLinkContainer,
.sitemapPageLinkContainer.sitemapHighlight {
    background-color: #e6f4fe !important;
    background: #e6f4fe !important;
    border-radius: 4px !important;
}

.sitemapHighlight .sitemapPageName,
.sitemapHighlight .sitemapPageLink,
.sitemapHighlight a,
.sitemapHighlight span,
#sitemapTreeContainer .sitemapHighlight .sitemapPageName,
#sitemapTreeContainer .sitemapHighlight .sitemapPageLink {
    color: #005bb5 !important;
    font-weight: 600 !important;
}

.sitemapHighlight .sitemapPageName i,
.sitemapHighlight .sitemapPageNameTag,
#sitemapTreeContainer .sitemapHighlight .sitemapPageName i,
#sitemapTreeContainer .sitemapHighlight .sitemapPageNameTag {
    color: #0076de !important;
    background: #bce0fc !important;
    font-weight: 700 !important;
}

.sitemapHighlight .sitemapPageIcon {
    filter: none !important;
    opacity: 0.9 !important;
}

/* 普通悬停态：浅灰底，深色字（排除已选中的高亮节点） */
.sitemapNode.sitemapLeafNode:hover:not(.sitemapHighlight),
.sitemapHover:hover:not(.sitemapHighlight),
.sitemapPageLinkContainer:hover:not(.sitemapHighlight) {
    background-color: #f1f5f9 !important;
    border-radius: 4px !important;
}

.sitemapNode.sitemapLeafNode:hover:not(.sitemapHighlight) .sitemapPageName,
.sitemapHover:hover:not(.sitemapHighlight) .sitemapPageName,
.sitemapPageLinkContainer:hover:not(.sitemapHighlight) .sitemapPageName {
    color: #0f172a !important;
}
.legacyPulsateBorder {
    box-shadow: 0 0 10px 3px rgba(0, 118, 222, 0.35) !important;
}
/* 4. Axure 11 兼容适配 */
.selected .btn_check { fill: #0076de !important; }
.sitemapHeader { padding: 8px 0 0 7px !important; }
.leftPanel.protoloft-panel-anim {
    transition: width 180ms cubic-bezier(0.2, 0, 0, 1) !important;
}
#lsplitbar.protoloft-panel-anim,
#clippingBounds.protoloft-panel-anim {
    transition: left 180ms cubic-bezier(0.2, 0, 0, 1), width 180ms cubic-bezier(0.2, 0, 0, 1) !important;
}

/* 5. 内置 Remix Icon 现代字体定义 (支持在原型中直接书写 ri-* 图标) */
@font-face {
    font-family: "remixicon";
    src: url("{$fontUrl}") format("woff2");
    font-display: swap;
}
[class^="ri-"], [class*=" ri-"] {
    font-family: 'remixicon' !important;
    font-style: normal;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}
</style>
<script id="protoloft-axure-sitemap-autonum">
(function(){
    function stripOldPrefix(s){
        if(!s) return '';
        var str = String(s).trim();
        var m = str.match(/^(\d+(?:[.\-_]\d+)*)[.、\s\-—]+(.+)$/);
        return (m && m[2] && m[2].trim()) ? m[2].trim() : str;
    }
    function escapeHtml(s){
        return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }
    function walkUl(ulEl, parentSeq){
        if(!ulEl) return;
        var lis = [];
        for(var i=0; i<ulEl.children.length; i++){
            var c = ulEl.children[i];
            if(c.tagName === 'LI' && c.classList.contains('sitemapNode')) lis.push(c);
        }
        var seq = parentSeq === '' ? 0 : 1;
        for(var j=0; j<lis.length; j++){
            var li = lis[j];
            var nameEl = li.querySelector('.sitemapPageName');
            if(!nameEl) continue;
            var existingTag = nameEl.querySelector('.sitemapPageNameTag, [data-sitemap-page-name-tag]');
            var rawText = '';
            if(existingTag){
                var clone = nameEl.cloneNode(true);
                var cTag = clone.querySelector('.sitemapPageNameTag, [data-sitemap-page-name-tag]');
                if(cTag) cTag.remove();
                rawText = clone.textContent || '';
            } else {
                rawText = nameEl.textContent || '';
            }
            var cleanTitle = stripOldPrefix(rawText);
            var currentSeq = parentSeq === '' ? String(seq) : (parentSeq + '.' + seq);
            seq++;
            var newHtml = '<i class="sitemapPageNameTag" data-sitemap-page-name-tag="' + escapeHtml(currentSeq) + '"></i>' + escapeHtml(cleanTitle);
            if(nameEl.getAttribute('data-applied-seq') !== currentSeq || nameEl.getAttribute('data-applied-title') !== cleanTitle){
                nameEl.innerHTML = newHtml;
                nameEl.setAttribute('data-applied-seq', currentSeq);
                nameEl.setAttribute('data-applied-title', cleanTitle);
            }
            li.setAttribute('data-autonum-applied', '1');
            var subUl = null;
            for(var k=0; k<li.children.length; k++){
                if(li.children[k].tagName === 'UL'){ subUl = li.children[k]; break; }
            }
            if(subUl) walkUl(subUl, currentSeq);
        }
    }
    function setAnimClass(el, on){
        if(!el) return;
        if(el.classList && typeof el.classList.add === 'function' && typeof el.classList.remove === 'function'){
            if(on) el.classList.add('protoloft-panel-anim');
            else el.classList.remove('protoloft-panel-anim');
        } else if(typeof el.className === 'string'){
            var cleaned = el.className.replace(/\bprotoloft-panel-anim\b/g, '').replace(/\s+/g, ' ').trim();
            el.className = on ? (cleaned ? cleaned + ' protoloft-panel-anim' : 'protoloft-panel-anim') : cleaned;
        }
    }
    function clearAnimState(leftPanel){
        if(leftPanel && leftPanel.__protoloftAnimTimer && typeof clearTimeout === 'function'){
            clearTimeout(leftPanel.__protoloftAnimTimer);
            leftPanel.__protoloftAnimTimer = null;
        }
        setAnimClass(leftPanel, false);
        setAnimClass(document.getElementById('lsplitbar'), false);
        setAnimClass(document.getElementById('clippingBounds'), false);
    }
    function bindSplitbarWatch(leftPanel){
        var splitbar = document.getElementById('lsplitbar');
        if(!splitbar || splitbar.__protoloftWatched || typeof splitbar.addEventListener !== 'function') return;
        splitbar.__protoloftWatched = true;
        var markUser = function(){
            leftPanel.__protoloftUserResized = true;
            clearAnimState(leftPanel);
            var jq = window.jQuery || window['$'];
            if(jq && typeof jq === 'function'){
                try { jq('.leftPanel, #lsplitbar, #clippingBounds').stop(true, false); } catch(e){}
            }
        };
        splitbar.addEventListener('mousedown', markUser);
        splitbar.addEventListener('pointerdown', markUser);
    }
    function getPanelMaxWidth(vw){
        return vw > 0 ? Math.max(220, Math.min(340, Math.floor(vw * 0.28))) : 340;
    }
    function computeDesiredLeftWidth(leftPanel, vw){
        var treeUl = document.querySelector('#sitemapTreeContainer ul.sitemapTree') || document.querySelector('.sitemapTree');
        var treeContainer = document.getElementById('sitemapTreeContainer') || (treeUl ? treeUl.parentElement : null);
        if(!treeUl || !treeContainer) return 0;

        var curW = leftPanel.offsetWidth || 0;
        var wasHidden = curW < 180;
        var saved = null;
        if(wasHidden && leftPanel.style){
            saved = {
                display: leftPanel.style.display || '',
                visibility: leftPanel.style.visibility || '',
                position: leftPanel.style.position || '',
                left: leftPanel.style.left || '',
                top: leftPanel.style.top || '',
                width: leftPanel.style.width || ''
            };
            leftPanel.style.position = 'fixed';
            leftPanel.style.left = '-9999px';
            leftPanel.style.top = '0px';
            leftPanel.style.visibility = 'hidden';
            leftPanel.style.display = 'block';
            leftPanel.style.width = '220px';
        }
        try {
            var baseW = wasHidden ? 220 : curW;
            var contentW = Math.max(treeContainer.scrollWidth || 0, treeUl.scrollWidth || 0);
            var clientW = treeContainer.clientWidth || baseW;
            if(contentW <= clientW) return baseW;
            var scrollbarW = Math.max(0, (treeContainer.offsetWidth || 0) - clientW);
            var desiredW = Math.ceil(contentW + scrollbarW + 10);
            var minW = Math.max(220, leftPanel.__protoloftAppliedWidth || baseW);
            return Math.max(minW, Math.min(desiredW, getPanelMaxWidth(vw)));
        } finally {
            if(saved){
                leftPanel.style.display = saved.display;
                leftPanel.style.visibility = saved.visibility;
                leftPanel.style.position = saved.position;
                leftPanel.style.left = saved.left;
                leftPanel.style.top = saved.top;
                leftPanel.style.width = saved.width;
            }
        }
    }
    function applyWidthSync(leftPanel, targetW, axObj){
        clearAnimState(leftPanel);
        leftPanel.style.width = targetW + 'px';
        leftPanel.__protoloftAppliedWidth = targetW;
        leftPanel.__protoloftHasFitted = true;
        var splitbar = document.getElementById('lsplitbar');
        if(splitbar) splitbar.style.left = (targetW - 4) + 'px';
        if(axObj && axObj.player && typeof axObj.player.resizeContent === 'function'){
            axObj.player.resizeContent();
        }
    }
    function applyWidthSmooth(leftPanel, targetW, vw, axObj){
        if(typeof setTimeout !== 'function'){
            applyWidthSync(leftPanel, targetW, axObj);
            return;
        }
        clearAnimState(leftPanel);
        var splitbar = document.getElementById('lsplitbar');
        var clipBounds = document.getElementById('clippingBounds');
        setAnimClass(leftPanel, true);
        setAnimClass(splitbar, true);
        setAnimClass(clipBounds, true);
        void leftPanel.offsetWidth;

        leftPanel.style.width = targetW + 'px';
        leftPanel.__protoloftAppliedWidth = targetW;
        leftPanel.__protoloftHasFitted = true;
        if(splitbar && splitbar.style) splitbar.style.left = (targetW - 4) + 'px';
        if(clipBounds && clipBounds.style && vw > 0){
            var rightEl = document.querySelector ? document.querySelector('.rightPanel') : null;
            var rightW = (rightEl && rightEl.offsetWidth) ? rightEl.offsetWidth : 0;
            clipBounds.style.left = targetW + 'px';
            clipBounds.style.width = Math.max(0, vw - targetW - rightW) + 'px';
        }
        leftPanel.__protoloftAnimTimer = setTimeout(function(){
            clearAnimState(leftPanel);
            if(!leftPanel.__protoloftUserResized && axObj && axObj.player && typeof axObj.player.resizeContent === 'function'){
                axObj.player.resizeContent();
            }
        }, 210);
    }
    function preSyncExpandWidth(leftPanel, vw, axObj){
        var targetW = computeDesiredLeftWidth(leftPanel, vw);
        if(!(targetW > 220)) return targetW;
        if(axObj && axObj.player && typeof axObj.player.resizeContent === 'function' && leftPanel.style){
            var saved = {
                display: leftPanel.style.display || '',
                visibility: leftPanel.style.visibility || '',
                position: leftPanel.style.position || '',
                left: leftPanel.style.left || '',
                top: leftPanel.style.top || '',
                width: leftPanel.style.width || ''
            };
            try {
                leftPanel.style.position = 'fixed';
                leftPanel.style.left = '-9999px';
                leftPanel.style.top = '0px';
                leftPanel.style.visibility = 'hidden';
                leftPanel.style.display = 'block';
                leftPanel.style.width = targetW + 'px';
                axObj.player.resizeContent(true);
            } finally {
                leftPanel.style.display = saved.display;
                leftPanel.style.visibility = saved.visibility;
                leftPanel.style.position = saved.position;
                leftPanel.style.left = saved.left;
                leftPanel.style.top = saved.top;
                leftPanel.style.width = saved.width;
            }
        }
        leftPanel.__protoloftAppliedWidth = targetW;
        leftPanel.__protoloftHasFitted = true;
        return targetW;
    }
    function hookExpandFromBar(){
        var axObj = window['$' + 'axure'];
        if(!axObj || !axObj.player || typeof axObj.player.expandFromBar !== 'function') return;
        if(axObj.player.expandFromBar.__protoloftWrapped) return;
        var origExpand = axObj.player.expandFromBar;
        var wrappedExpand = function(hostId, context){
            try {
                if(context === 'project'){
                    var leftPanel = (document.querySelector && document.querySelector('.leftPanel')) || document.getElementById('leftPanel');
                    if(leftPanel) bindSplitbarWatch(leftPanel);
                    var mobile = document.body && document.body.classList && document.body.classList.contains('mobileMode');
                    var vw = window.innerWidth || (document.documentElement && document.documentElement.clientWidth) || 0;
                    var splitbar = document.getElementById('lsplitbar');
                    var barHidden = !splitbar || !(splitbar.offsetWidth > 0 || splitbar.offsetHeight > 0);
                    if(leftPanel && !leftPanel.__protoloftUserResized && !mobile && !(vw > 0 && vw < 720) && !(leftPanel.classList && leftPanel.classList.contains('popup')) && barHidden){
                        run();
                        preSyncExpandWidth(leftPanel, vw, axObj);
                    }
                }
            } catch(e){}
            return origExpand.apply(this, arguments);
        };
        wrappedExpand.__protoloftWrapped = true;
        axObj.player.expandFromBar = wrappedExpand;
    }
    function fitLeftPanelWidth(){
        try {
            hookExpandFromBar();
            if(!document.body || (document.body.classList && document.body.classList.contains('mobileMode'))) return false;
            var leftPanel = (document.querySelector && document.querySelector('.leftPanel')) || document.getElementById('leftPanel');
            if(!leftPanel) return false;
            bindSplitbarWatch(leftPanel);
            if(leftPanel.__protoloftUserResized) return true;
            if(leftPanel.classList && leftPanel.classList.contains('popup')) return false;
            var vw = window.innerWidth || (document.documentElement && document.documentElement.clientWidth) || 0;
            if(vw > 0 && vw < 720) return false;
            var axObj = window['$' + 'axure'];
            var curW = leftPanel.offsetWidth || 0;
            if(curW < 180){
                preSyncExpandWidth(leftPanel, vw, axObj);
                return false;
            }
            var targetW = computeDesiredLeftWidth(leftPanel, vw);
            if(!targetW) return false;
            if(targetW <= curW + 2){
                if(!leftPanel.__protoloftAppliedWidth) leftPanel.__protoloftAppliedWidth = curW;
                leftPanel.__protoloftHasFitted = true;
                return true;
            }
            var jq = window.jQuery || window['$'];
            var marginL = leftPanel.style && leftPanel.style.marginLeft ? parseFloat(leftPanel.style.marginLeft) : 0;
            var isSlidingIn = (marginL < -1) || !!(jq && typeof jq === 'function' && jq(leftPanel).is && jq(leftPanel).is(':animated'));
            if(isSlidingIn && jq && typeof jq === 'function'){
                try {
                    jq('#clippingBoundsScrollContainer').stop(false, true);
                    jq(leftPanel).stop(true, false);
                    jq('#lsplitbar').stop(true, false);
                    jq('#clippingBounds').stop(true, false);
                    leftPanel.style.width = targetW + 'px';
                    leftPanel.__protoloftAppliedWidth = targetW;
                    leftPanel.__protoloftHasFitted = true;
                    var rightEl = document.querySelector ? document.querySelector('.rightPanel') : null;
                    var rightW = (rightEl && rightEl.offsetWidth) ? rightEl.offsetWidth : 0;
                    var clipW = vw > 0 ? Math.max(0, vw - targetW - rightW) : 0;
                    jq(leftPanel).animate({ 'margin-left': '0px' }, { duration: 140, complete: function(){ leftPanel.style.marginLeft = ''; } });
                    jq('#lsplitbar').animate({ left: (targetW - 4) + 'px' }, { duration: 140 });
                    var clipTarget = vw > 0 ? { left: targetW + 'px', width: clipW + 'px' } : { left: targetW + 'px' };
                    jq('#clippingBounds').animate(clipTarget, { duration: 140, complete: function(){
                        if(!leftPanel.__protoloftUserResized && axObj && axObj.player && typeof axObj.player.resizeContent === 'function'){
                            axObj.player.resizeContent();
                        }
                    }});
                    return true;
                } catch(e){}
            }
            applyWidthSmooth(leftPanel, targetW, vw, axObj);
            return true;
        } catch(e){ return false; }
    }
    function isAxureEnvironment(){
        try {
            if(window['$' + 'axure']) return true;
            if(document.getElementById('sitemapHost') || document.getElementById('sitemapTreeContainer')) return true;
            if(document.querySelector && document.querySelector('.sitemapTree, .sitemapNode')) return true;
        } catch(e){}
        return false;
    }
    function run(){
        var treeUl = document.querySelector('#sitemapTreeContainer ul.sitemapTree') || document.querySelector('.sitemapTree');
        if(!treeUl || !treeUl.children.length) return false;
        walkUl(treeUl, '');
        return true;
    }
    function runAndFit(){
        hookExpandFromBar();
        var seqOk = run();
        var fitOk = seqOk ? fitLeftPanelWidth() : false;
        return seqOk && fitOk;
    }
    function startWatchers(){
        var done = runAndFit();
        if(!done && !(document.readyState === 'complete' && !isAxureEnvironment())){
            var attempts = 0;
            var timer = setInterval(function(){
                attempts++;
                if(runAndFit() || attempts >= 45 || (document.readyState === 'complete' && !isAxureEnvironment())){
                    clearInterval(timer);
                }
            }, 60);
        }
        try {
            var host = document.getElementById('sitemapHost') || document.getElementById('sitemapTreeContainer');
            if(host && window.MutationObserver && !host.__autonumObserved){
                host.__autonumObserved = true;
                var deb = null;
                var obs = new MutationObserver(function(muts){
                    var hit = false;
                    var needFitOnly = false;
                    for(var m=0; m<muts.length; m++){
                        var t = muts[m].target;
                        if(!t || t.nodeType !== 1) continue;
                        if(muts[m].type === 'attributes'){
                            if(t.tagName === 'UL' || t.classList.contains('sitemapTree')){ needFitOnly = true; }
                        } else if(t.classList.contains('sitemapTree') || t.classList.contains('sitemapNode') || t.id === 'sitemapTreeContainer'){
                            hit = true; break;
                        }
                    }
                    if(hit || needFitOnly){
                        if(deb) clearTimeout(deb);
                        deb = setTimeout(function(){
                            if(hit) run();
                            fitLeftPanelWidth();
                        }, 120);
                    }
                });
                obs.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
            }
        } catch(e){}
    }
    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', startWatchers);
    } else {
        startWatchers();
    }
})();
</script>
EOD;

        // 若已有旧版本注入标记，先行清除再注入最新版本
        if (strpos($content, '<!-- [ProtoLoft Prototype Enhancement] -->') !== false) {
            $content = preg_replace('/<!-- \[ProtoLoft Prototype Enhancement\] -->.*?<\/style>(\s*<script id="protoloft-axure-sitemap-autonum">.*?<\/script>)?/is', '', $content);
        }

        // 注入到 </head> 之前，若无 </head> 则追加到文件顶部
        if (stripos($content, '</head>') !== false) {
            $content = preg_replace('/<\/head>/i', $enhancement . "\n</head>", $content, 1);
        } else {
            $content = $enhancement . "\n" . $content;
        }

        file_put_contents($filePath, $content);
    }

    /**
     * 递归遍历目录并净化所有 HTML / CSS
     */
    public static function sanitizeDirectory($dir) {
        if (!is_dir($dir)) return;
        
        $items = scandir($dir);
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') continue;
            $fullPath = $dir . DIRECTORY_SEPARATOR . $item;
            if (is_dir($fullPath)) {
                self::sanitizeDirectory($fullPath);
            } else {
                self::sanitizeGoogleFonts($fullPath);
                self::injectPrototypeEnhancement($fullPath);
            }
        }
    }

    /**
     * 智能探测入口文件 (支持直接多文件、单层或多层文件夹嵌套)
     */
    public static function detectEntryFile($targetDir, $baseRelPath) {
        $priorityFiles = [
            'start_with_pages.html',
            'start.html',
            'index.html',
            'home.html'
        ];

        // 广度优先搜索 (BFS)，按目录深度逐层优先命中标准入口文件
        $queue = [['dir' => $targetDir, 'rel' => $baseRelPath]];
        $allHtmlFiles = [];

        while (!empty($queue)) {
            $current = array_shift($queue);
            $curDir = $current['dir'];
            $curRel = $current['rel'];

            if (!is_dir($curDir)) continue;

            $items = @scandir($curDir);
            if ($items === false) continue;

            $subDirs = [];
            $curFiles = [];

            foreach ($items as $item) {
                if ($item === '.' || $item === '..' || $item === '__MACOSX' || $item[0] === '.') continue;
                $full = $curDir . DIRECTORY_SEPARATOR . $item;
                if (is_dir($full)) {
                    $subDirs[] = $item;
                } else {
                    $curFiles[] = $item;
                }
            }

            // 在当前层级检查优先级文件
            foreach ($priorityFiles as $pf) {
                if (in_array($pf, $curFiles, true)) {
                    $resRel = ($curRel !== '' ? $curRel . '/' : '') . $pf;
                    return ltrim($resRel, '/');
                }
            }

            // 记录当前层级的 html 文件作为兜底候选
            foreach ($curFiles as $f) {
                if (strtolower(pathinfo($f, PATHINFO_EXTENSION)) === 'html') {
                    $resRel = ($curRel !== '' ? $curRel . '/' : '') . $f;
                    $allHtmlFiles[] = ltrim($resRel, '/');
                }
            }

            // 将子目录按顺序排入队列（限制搜索深度不超过 6 层）
            $depth = substr_count(ltrim((string)$curRel, '/'), '/');
            if ($depth < 6) {
                foreach ($subDirs as $sd) {
                    $queue[] = [
                        'dir' => $curDir . DIRECTORY_SEPARATOR . $sd,
                        'rel' => ($curRel !== '' ? $curRel . '/' : '') . $sd
                    ];
                }
            }
        }

        // 兜底扫描：若无标准入口名，选用最浅层级的第一枚 HTML
        if (!empty($allHtmlFiles)) {
            return $allHtmlFiles[0];
        }

        return '';
    }

    /**
     * 解压 ZIP 原型包并自动净化
     */
    public static function extractZip($zipTmpPath, $targetDir, $baseRelPath) {
        if (!class_exists('ZipArchive')) {
            return ['success' => false, 'message' => '服务器 PHP 未开启 ZipArchive 扩展'];
        }

        // 严格硬核防御: 解压目标路径必须位于 PROTOTYPES_PATH 私有路径之下
        if (!file_exists($targetDir)) {
            @mkdir($targetDir, 0755, true);
        }
        $realUploads = realpath(PROTOTYPES_PATH);
        $realTarget = realpath($targetDir);
        
        $normUploads = $realUploads ? rtrim(str_replace('\\', '/', $realUploads), '/') . '/' : '';
        $normTarget = $realTarget ? rtrim(str_replace('\\', '/', $realTarget), '/') . '/' : '';

        if (!$normTarget || !$normUploads || strpos($normTarget, $normUploads) !== 0) {
            return ['success' => false, 'message' => '解压目标路径超出限制 (Target: ' . ($normTarget ?: 'false') . ', Uploads: ' . ($normUploads ?: 'false') . ')'];
        }

        $zip = new ZipArchive();
        $res = $zip->open($zipTmpPath);
        if ($res !== true) {
            return ['success' => false, 'message' => '无法打开 ZIP 压缩包 (错误码: ' . $res . ')'];
        }

        // 防 Zip 炸弹限制: 单包文件数与展开总体积上限 (Axure 原型正常上线一般在几十至数百MB)
        if ($zip->numFiles > 30000) {
            $zip->close();
            return ['success' => false, 'message' => '压缩包内文件数量超过安全限制 (30,000个)，已中止解压'];
        }

        $maxUncompressedSize = 500 * 1024 * 1024; // 500MB
        $totalUncompressedSize = 0;

        // 逐条校验条目: 杜绝 Zip-Slip 目录穿越、Webshell 与符号链接落盘
        $safeNames = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = $zip->getNameIndex($i);
            $unsafeMsg = self::inspectZipEntryName($name);
            if ($unsafeMsg !== null) {
                $zip->close();
                return ['success' => false, 'message' => $unsafeMsg];
            }

            $stat = $zip->statIndex($i);
            if ($stat && isset($stat['size'])) {
                $totalUncompressedSize += (int)$stat['size'];
                if ($totalUncompressedSize > $maxUncompressedSize) {
                    $zip->close();
                    return ['success' => false, 'message' => '压缩包展开后总体积超过 500MB 安全限制，已中止解压'];
                }
            }

            if (method_exists($zip, 'getExternalAttributesIndex')) {
                $opsys = 0;
                $attr = 0;
                if ($zip->getExternalAttributesIndex($i, $opsys, $attr) && $opsys === 3) {
                    if ((($attr >> 16) & 0170000) === 0120000) {
                        $zip->close();
                        return ['success' => false, 'message' => '压缩包内包含符号链接文件，解压已中止'];
                    }
                }
            }
            $safeNames[] = $name;
        }

        if (empty($safeNames)) {
            $zip->close();
            return ['success' => false, 'message' => '压缩包内没有可解压的文件'];
        }

        // 仅解压通过校验的条目
        if (!$zip->extractTo($targetDir, $safeNames)) {
            $zip->close();
            return ['success' => false, 'message' => '解压失败，请确认压缩包未损坏后重试'];
        }
        $zip->close();

        // 自动净化 Google Fonts
        self::sanitizeDirectory($targetDir);

        // 探测入口文件
        $entryFile = self::detectEntryFile($targetDir, $baseRelPath);

        return [
            'success' => true,
            'entry_file' => $entryFile,
            'file_size' => (int)$totalUncompressedSize
        ];
    }
}
