<?php
/** 只读原型上下文。源文件是参考资料，不执行脚本，不猜测交互或业务规则。 */
require_once __DIR__ . '/storage.php';
require_once __DIR__ . '/auth.php';
class PrototypeContext {
    public static function utf8($text) {
        return mb_check_encoding($text, 'UTF-8') ? $text : mb_convert_encoding($text, 'UTF-8', 'UTF-8');
    }
    public static function version($id) {
        $stmt = DB::getInstance()->prepare('SELECT * FROM versions WHERE id = ?');
        $stmt->execute([(int)$id]);
        $version = $stmt->fetch();
        if (!$version) throw new DomainException(t('api.proto.ver_missing'));
        $item = Auth::getItem($version['item_id']);
        if (!$item) throw new DomainException(t('api.proto.item_missing'));
        $curUser = Auth::getCurrentUser();
        $isAllowed = $curUser ? Auth::canViewItem($item) : Auth::hasShareAccess($item, $version);
        if (!$isAllowed) throw new DomainException(t('api.proto.ver_forbidden'));
        return $version;
    }
    public static function revision($version) { return hash('sha256', $version['storage_dir']); }
    public static function pageParts($page, $version) {
        if ($page === '') $page = $version['entry_file'];
        $parts = explode('#', (string)$page, 2);
        $fragment = $parts[1] ?? '';
        if (strpos($fragment, 'page_') === 0) $fragment = 'p=' . rawurlencode(substr($fragment, 5));
        return [$parts[0], $fragment];
    }
    public static function pageUrl($version, $page) {
        list($path, $hash) = self::pageParts($page, $version);
        if (!Storage::filePath($version, $path) || !preg_match('/\.html?$/iD', $path)) return '';
        return app_url('asset.php/v' . (int)$version['id'] . '/' . implode('/', array_map('rawurlencode', explode('/', $path))))
            . ($hash !== '' ? '#' . str_replace(["\r", "\n"], '', $hash) : '');
    }
    public static function text($html, $limit = 30000) {
        $html = self::utf8($html);
        $html = preg_replace('#<(script|style|noscript|template)\b[^>]*>.*?</\1\s*>#is', ' ', $html);
        $text = html_entity_decode(strip_tags(preg_replace('#</(?:p|div|li|h[1-6]|tr|section)>|<br\s*/?>#i', "\n", $html)), ENT_QUOTES, 'UTF-8');
        $text = preg_replace('/[\t\x20]+/u', ' ', $text);
        $text = preg_replace('/\n\s*\n+/u', "\n", $text);
        return mb_substr(trim($text), 0, $limit, 'UTF-8');
    }
    public static function read($version, $page, $limit = 30000) {
        list($relative, $hash) = self::pageParts($page, $version);
        $path = Storage::filePath($version, $relative);
        if (!$path || !preg_match('/\.html?$/iD', $relative)) throw new DomainException(t('api.proto.page_missing'));
        $html = file_get_contents($path, false, null, 0, 1024 * 1024);
        $encodingWarning = !mb_check_encoding($html, 'UTF-8');
        $html = self::utf8($html);
        preg_match('#<title\b[^>]*>(.*?)</title>#is', $html, $title);
        preg_match_all('#<(?:a|area)\b[^>]*\bhref\s*=\s*["\']([^"\']+)["\']#i', $html, $links);
        $localLinks = [];
        foreach (array_unique($links[1]) as $link) {
            if (preg_match('#^(?:[a-z][a-z0-9+.-]*:|//)#i', $link)) continue;
            $localLinks[] = html_entity_decode($link, ENT_QUOTES, 'UTF-8');
            if (count($localLinks) >= 100) break;
        }
        return ['version_id' => (int)$version['id'], 'version_name' => $version['version_name'],
            'revision' => self::revision($version), 'page_path' => $relative . ($hash ? '#' . $hash : ''),
            'title' => self::text($title[1] ?? '', 200), 'text' => self::text($html, $limit),
            'links' => $localLinks, 'preview_url' => self::pageUrl($version, $page),
            'coverage' => t('api.proto.coverage_note'),
            'encoding_note' => $encodingWarning ? t('api.proto.encoding_note') : '',
            'truncated' => filesize($path) > 1024 * 1024 || mb_strlen(self::text($html, $limit + 1), 'UTF-8') > $limit];
    }
    public static function pages($version, $offset = 0, $limit = 100) {
        $stmt = DB::getInstance()->prepare('SELECT rel_path FROM version_files WHERE version_id = ?');
        $stmt->execute([(int)$version['id']]);
        $allPaths = $stmt->fetchAll(PDO::FETCH_COLUMN);
        $stmt->closeCursor();
        $pages = [];
        foreach ($allPaths as $relative) {
            if (!preg_match('/\.html?$/iD', $relative)) continue;
            if (preg_match('#(^|/)(?:resources|plugins|images|\.\w+)(/|$)#i', $relative)) continue;
            $pages[] = $relative;
        }
        sort($pages, SORT_STRING);
        $list = [];
        foreach (array_slice($pages, $offset, $limit) as $page) {
            $path = Storage::filePath($version, $page);
            if (!$path) continue;
            $html = file_get_contents($path, false, null, 0, 65536);
            preg_match('#<title\b[^>]*>(.*?)</title>#is', $html, $title);
            $list[] = ['path' => $page, 'title' => self::text($title[1] ?? '', 200)];
        }
        return ['pages' => $list, 'total' => count($pages), 'next_offset' => $offset + count($list) < count($pages) ? $offset + count($list) : null];
    }
}
