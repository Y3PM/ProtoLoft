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
     * 校验 ZIP 条目名: 拒绝绝对路径、路径穿越 (..)、隐藏文件与可执行脚本
     */
    private static function isSafeZipEntryName($name) {
        $name = str_replace('\\', '/', (string)$name);
        if ($name === '') return false;
        $isDir = substr($name, -1) === '/';
        if ($isDir) $name = rtrim($name, '/');
        if ($name === '') return false;
        if ($name[0] === '/' || preg_match('#^[a-zA-Z]:/#', $name)) return false;
        foreach (explode('/', $name) as $seg) {
            if ($seg === '' || $seg === '.' || $seg === '..') return false;
            if ($seg[0] === '.') return false;
        }
        if (!$isDir && in_array(strtolower(pathinfo($name, PATHINFO_EXTENSION)), self::$blockedExtensions, true)) {
            return false;
        }
        return true;
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

        // 幂等性检测：若已全量注入则跳过；若为旧版注入则更新
        if (strpos($content, 'protoloft-axure-sitemap-autonum') !== false) {
            return;
        }

        // 计算当前 HTML 文件相对系统根目录的相对路径，实现离线内网自给自足
        $fontUrl = app_base_path() . '/assets/fonts/remixicon.woff2';

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
    function run(){
        var treeUl = document.querySelector('#sitemapTreeContainer ul.sitemapTree') || document.querySelector('.sitemapTree');
        if(!treeUl || !treeUl.children.length) return false;
        walkUl(treeUl, '');
        return true;
    }
    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
    var attempts = 0;
    var timer = setInterval(function(){
        attempts++;
        if(run() || attempts >= 25) clearInterval(timer);
    }, 120);
    try {
        var host = document.getElementById('sitemapHost') || document.getElementById('sitemapTreeContainer') || document.body;
        if(host && window.MutationObserver && !host.__autonumObserved){
            host.__autonumObserved = true;
            var deb = null;
            var obs = new MutationObserver(function(muts){
                var hit = false;
                for(var m=0; m<muts.length; m++){
                    var t = muts[m].target;
                    if(t && t.nodeType === 1 && (t.classList.contains('sitemapTree') || t.classList.contains('sitemapNode') || t.id === 'sitemapTreeContainer')){
                        hit = true; break;
                    }
                }
                if(hit){
                    if(deb) clearTimeout(deb);
                    deb = setTimeout(run, 60);
                }
            });
            obs.observe(host, { childList: true, subtree: true });
        }
    } catch(e){}
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
            if (!self::isSafeZipEntryName($name)) {
                $zip->close();
                return ['success' => false, 'message' => '压缩包内包含不允许的文件 (路径穿越 / 隐藏文件 / 服务端脚本类型)，解压已中止'];
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
