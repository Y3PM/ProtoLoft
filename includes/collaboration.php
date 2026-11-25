<?php
require_once __DIR__ . '/prototype_context.php';
class Collaboration {
    public static function link($id) { return app_url('index.php#annotation=' . (int)$id); }
    public static function decorate($annotation, $version) {
        static $editable = [];
        if (!$version || empty($version['id'])) {
            $annotation['origin_outdated'] = false;
            $annotation['needs_review'] = false;
            $annotation['detail_url'] = self::link($annotation['id']);
            $annotation['version_name'] = '外部链接';
            $itemId = (int)$annotation['item_id'];
            if (!isset($editable[$itemId])) $editable[$itemId] = Auth::canEditItem(Auth::getItem($itemId));
            $annotation['can_review'] = $editable[$itemId] || (int)$annotation['user_id'] === (int)(Auth::getCurrentUser()['id'] ?? 0);
            return $annotation;
        }
        $revision = PrototypeContext::revision($version);
        $annotation['origin_outdated'] = $annotation['version_revision'] !== $revision;
        $annotation['needs_review'] = (int)$annotation['status'] === 0 && $annotation['origin_outdated'] && $annotation['reviewed_revision'] !== $revision;
        $annotation['detail_url'] = self::link($annotation['id']);
        $annotation['version_name'] = $version['version_name'];
        $itemId = (int)$version['item_id'];
        if (!isset($editable[$itemId])) $editable[$itemId] = Auth::canEditItem(Auth::getItem($itemId));
        $annotation['can_review'] = $editable[$itemId] || (int)$annotation['user_id'] === (int)(Auth::getCurrentUser()['id'] ?? 0);
        return $annotation;
    }
    public static function canAccessAnnotations($item, $version = null) {
        if (!$item) return false;
        $curUser = Auth::getCurrentUser();
        if ($curUser) {
            return Auth::canViewItem($item);
        }
        if (!Auth::canGuestAnnotate()) {
            return false;
        }
        return Auth::hasShareAccess($item, $version);
    }

    /** 获取未登录访客允许访问的批注 ID 列表；已登录成员返回 null 表示不限归属 */
    public static function guestAnnotationIds() {
        if (Auth::getCurrentUser()) {
            return null;
        }
        if (empty($_SESSION['guest_anno_ids']) || !is_array($_SESSION['guest_anno_ids'])) {
            return [];
        }
        return array_values(array_unique(array_filter(array_map('intval', $_SESSION['guest_anno_ids']), function ($id) {
            return $id > 0;
        })));
    }

    /** 判断当前请求者是否有权读取或回复指定批注记录 */
    public static function canAccessAnnotationRecord($annotation) {
        if (!$annotation) {
            return false;
        }
        $guestIds = self::guestAnnotationIds();
        if ($guestIds === null) {
            return true;
        }
        return (int)($annotation['user_id'] ?? -1) === 0
            && in_array((int)($annotation['id'] ?? 0), $guestIds, true);
    }

    public static function target($id) {
        $stmt = DB::getInstance()->prepare('SELECT * FROM annotations WHERE id = ?');
        $stmt->execute([(int)$id]);
        $annotation = $stmt->fetch();
        $stmt->closeCursor();
        if (!$annotation) throw new DomainException('批注不存在或不可访问');
        $item = Auth::getItem((int)$annotation['item_id']);
        if (!$item) throw new DomainException('批注不存在或不可访问');

        if (empty($annotation['ver_id'])) {
            if (!self::canAccessAnnotations($item, null) || !self::canAccessAnnotationRecord($annotation)) {
                throw new DomainException('批注不存在或不可访问');
            }
            $annotation = self::decorate($annotation, null);
            return ['annotation' => $annotation, 'item_id' => (int)$annotation['item_id'], 'version_id' => 0,
                'version_name' => '外部链接', 'page_url' => $item['link_url'] ?? ''];
        }

        $version = PrototypeContext::version($annotation['ver_id']);
        if (!self::canAccessAnnotations($item, $version) || !self::canAccessAnnotationRecord($annotation)) {
            throw new DomainException('批注不存在或不可访问');
        }
        $annotation = self::decorate($annotation, $version);
        return ['annotation' => $annotation, 'item_id' => (int)$annotation['item_id'], 'version_id' => (int)$version['id'],
            'version_name' => $version['version_name'], 'page_url' => PrototypeContext::pageUrl($version, $annotation['page_path'])];
    }
    public static function snapshot($version, $page) {
        try { return PrototypeContext::read($version, $page, 4000)['text']; }
        catch (DomainException $e) { return ''; }
    }
}
