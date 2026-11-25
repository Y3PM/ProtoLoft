<?php
/**
 * 领域服务：原型页面打点批注协同流 (Page Annotations & Collaboration)
 */
if (!defined('APP_VERSION')) exit;
require_once __DIR__ . '/../collaboration.php';

function requireAnnotationTarget($db, $itemId, $verId) {
    $item = Auth::getItem($itemId);
    if (!$item) throw new DomainException('项目不存在');

    // 外链项目：无版本代际，放行 verId = 0 并核验证权限
    if (($item['type'] ?? '') === 'link') {
        if (!Collaboration::canAccessAnnotations($item, null)) {
            throw new DomainException('无权访问此项目的批注');
        }
        return $item;
    }

    $stmt = $db->prepare('SELECT * FROM versions WHERE item_id = ? AND id = ?');
    $stmt->execute([$itemId, $verId]);
    $version = $stmt->fetch();
    if (!$version) throw new DomainException('版本不属于此项目或已删除');

    if (!Collaboration::canAccessAnnotations($item, $version)) {
        throw new DomainException('无权访问此项目的批注');
    }
    return $item;
}

switch ($action) {
    case 'annotation_target':
        jsonResponse(true, Collaboration::target((int)($_GET['id'] ?? 0)));
        break;
    case 'previous_annotations':
        $verId = (int)($_GET['ver_id'] ?? $_POST['ver_id'] ?? 0);
        if ($verId <= 0) {
            jsonResponse(true, ['version_name' => '', 'list' => []]);
            break;
        }
        $current = PrototypeContext::version($verId);
        $item = Auth::getItem((int)$current['item_id']);
        if (!Collaboration::canAccessAnnotations($item, $current)) {
            throw new DomainException('无权访问此项目的批注');
        }
        $stmt = $db->prepare('SELECT * FROM versions WHERE item_id = ? AND id < ? ORDER BY id DESC LIMIT 1');
        $stmt->execute([$current['item_id'], $current['id']]);
        $previous = $stmt->fetch();
        $stmt->closeCursor();
        $list = [];
        $hasPreviousAccess = ($previous && Collaboration::canAccessAnnotations($item, $previous));
        if ($hasPreviousAccess) {
            $guestIds = Collaboration::guestAnnotationIds();
            if ($guestIds === null) {
                $stmt = $db->prepare('SELECT * FROM annotations WHERE ver_id = ? AND status = 0 ORDER BY id LIMIT 100');
                $stmt->execute([$previous['id']]);
                foreach ($stmt->fetchAll() as $row) $list[] = Collaboration::decorate($row, $previous);
            } elseif (!empty($guestIds)) {
                $inIds = implode(',', $guestIds);
                $stmt = $db->prepare("SELECT * FROM annotations WHERE ver_id = ? AND status = 0 AND user_id = 0 AND id IN ($inIds) ORDER BY id LIMIT 100");
                $stmt->execute([$previous['id']]);
                foreach ($stmt->fetchAll() as $row) $list[] = Collaboration::decorate($row, $previous);
            }
        }
        jsonResponse(true, ['version_name' => $hasPreviousAccess ? $previous['version_name'] : '', 'list' => $list]);
        break;
    case 'review_annotation':
    case 'carry_annotation':
        if (!Auth::canAnnotate()) throw new DomainException('无权操作批注');
        $db->beginTransaction();
        try {
            $db->exec('UPDATE annotations SET id = id WHERE 0');
            $source = Collaboration::target((int)($_POST['id'] ?? 0));
            $annotation = $source['annotation'];
            if ((int)$annotation['status'] !== 0) throw new DomainException('此批注已解决');
            if ($action === 'review_annotation') {
                $item = Auth::getItem($source['item_id']);
                if (!Auth::canEditItem($item) && (int)$annotation['user_id'] !== (int)Auth::getCurrentUser()['id']) throw new DomainException('无权复核此批注');
                $version = PrototypeContext::version($source['version_id']);
                $db->prepare('UPDATE annotations SET reviewed_revision = ? WHERE id = ?')->execute([PrototypeContext::revision($version), $annotation['id']]);
                $id = (int)$annotation['id'];
            } else {
                $version = PrototypeContext::version((int)($_POST['ver_id'] ?? 0));
                if ((int)$version['item_id'] !== $source['item_id'] || (int)$version['id'] <= $source['version_id']) throw new DomainException('只能引用同项目较早版本的批注');
                $stmt = $db->prepare('SELECT id FROM annotations WHERE ver_id = ? AND source_annotation_id = ?');
                $stmt->execute([$version['id'], $annotation['id']]);
                $id = (int)$stmt->fetchColumn();
                if (!$id) {
                    $db->prepare('INSERT INTO annotations(item_id,ver_id,page_path,page_title,user_id,author_name,author_dept,content,version_revision,page_snapshot,source_annotation_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)')->execute([
                        $version['item_id'], $version['id'], $annotation['page_path'], $annotation['page_title'], Auth::getCurrentUser()['id'], Auth::getCurrentUser()['name'],
                        '', $annotation['content'], PrototypeContext::revision($version), Collaboration::snapshot($version, $annotation['page_path']), $annotation['id']]);
                    $id = (int)$db->lastInsertId();
                }
            }
            $db->commit();
        } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
        jsonResponse(true, ['id' => $id], $action === 'review_annotation' ? '已确认仍需修改' : '已引用到当前版本');
        break;

    case 'list_annotations':
        $curUser = Auth::getCurrentUser();
        $itemId = (int)($_GET['item_id'] ?? $_POST['item_id'] ?? 0);
        $verId = (int)($_GET['ver_id'] ?? $_POST['ver_id'] ?? 0);
        $pagePath = trim($_GET['page_path'] ?? $_POST['page_path'] ?? '');
        $statusFilter = trim($_GET['status'] ?? $_POST['status'] ?? 'all');

        if ($itemId <= 0) jsonResponse(false, null, '缺少项目 ID');

        $targetItem = Auth::getItem($itemId);
        $isLink = ($targetItem && ($targetItem['type'] ?? '') === 'link');

        if ($verId <= 0 && !$isLink) {
            $verStmt = $db->prepare("SELECT id FROM versions WHERE item_id = ? ORDER BY is_default DESC, id DESC LIMIT 1");
            $verStmt->execute([$itemId]);
            $verId = (int)($verStmt->fetchColumn() ?: 0);
            $verStmt->closeCursor();
        }

        requireAnnotationTarget($db, $itemId, $verId);
        $version = $isLink ? null : PrototypeContext::version($verId);
        $sql = "SELECT * FROM annotations WHERE item_id = ? AND ver_id = ?";
        $params = [$itemId, $verId];

        // 访客可见性隔离：未登录访客仅允许查看本会话自身发表的批注，杜绝内部讨论外泄
        $guestIds = Collaboration::guestAnnotationIds();
        if ($guestIds !== null) {
            if (empty($guestIds)) {
                jsonResponse(true, [
                    'list' => [],
                    'pending_count' => 0,
                    'ver_id' => $verId
                ]);
                break;
            }
            $inIds = implode(',', $guestIds);
            $sql .= " AND id IN ($inIds) AND user_id = 0";
        }

        if ($pagePath !== '') {
            $sql .= " AND page_path = ?";
            $params[] = $pagePath;
        }
        if ($statusFilter === 'pending') {
            $sql .= " AND status = 0";
        } elseif ($statusFilter === 'resolved') {
            $sql .= " AND status = 1";
        }
        $sql .= " ORDER BY status ASC, id DESC";

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $annos = $stmt->fetchAll();

        $annoIds = array_column($annos, 'id');
        $repliesMap = [];
        if (!empty($annoIds)) {
            $inQuery = implode(',', array_fill(0, count($annoIds), '?'));
            $replyStmt = $db->prepare("SELECT * FROM annotation_replies WHERE annotation_id IN ($inQuery) ORDER BY id ASC");
            $replyStmt->execute($annoIds);
            $allReplies = $replyStmt->fetchAll();
            foreach ($allReplies as $r) {
                $repliesMap[$r['annotation_id']][] = $r;
            }
        }

        foreach ($annos as &$a) {
            $a['id'] = (int)$a['id'];
            $a['item_id'] = (int)$a['item_id'];
            $a['ver_id'] = (int)$a['ver_id'];
            $a['user_id'] = (int)$a['user_id'];
            $a['status'] = (int)$a['status'];
            $a['replies'] = $repliesMap[$a['id']] ?? [];
            $a = Collaboration::decorate($a, $version);
        }
        unset($a);

        if (!$curUser) {
            $pendingTotal = (int)DB::value("SELECT COUNT(*) FROM annotations WHERE item_id = ? AND ver_id = ? AND status = 0 AND id IN ($inIds) AND user_id = 0", [$itemId, $verId]);
        } else {
            $pendingTotal = (int)DB::value("SELECT COUNT(*) FROM annotations WHERE item_id = ? AND ver_id = ? AND status = 0", [$itemId, $verId]);
        }

        jsonResponse(true, [
            'list' => $annos,
            'pending_count' => $pendingTotal,
            'ver_id' => $verId
        ]);
        break;

    case 'add_annotation':
        $curUser = Auth::getCurrentUser();

        $itemId = (int)($_POST['item_id'] ?? 0);
        $verId = (int)($_POST['ver_id'] ?? 0);
        $pagePath = trim($_POST['page_path'] ?? '');
        $pageTitle = trim($_POST['page_title'] ?? '');
        $content = trim($_POST['content'] ?? '');

        if ($itemId <= 0) jsonResponse(false, null, '缺少项目 ID');
        if (empty($content)) jsonResponse(false, null, '批注正文不能为空');

        $targetItem = Auth::getItem($itemId);
        $isLink = ($targetItem && ($targetItem['type'] ?? '') === 'link');

        if ($verId <= 0 && !$isLink) {
            $verStmt = $db->prepare("SELECT id FROM versions WHERE item_id = ? ORDER BY is_default DESC, id DESC LIMIT 1");
            $verStmt->execute([$itemId]);
            $verId = (int)($verStmt->fetchColumn() ?: 0);
            $verStmt->closeCursor();
        }

        requireAnnotationTarget($db, $itemId, $verId);
        if (mb_strlen($pageTitle, 'UTF-8') > 200) jsonResponse(false, null, '页面名称最多 200 字符');
        if (mb_strlen($pagePath, 'UTF-8') > 500) jsonResponse(false, null, '页面路径最多 500 字符');
        if (mb_strlen($content, 'UTF-8') > 1000) jsonResponse(false, null, '批注内容最多 1000 字');

        if ($curUser) {
            if (!Auth::canAnnotate()) jsonResponse(false, null, '无权发表批注');
            $authorName = !empty($curUser['name']) ? $curUser['name'] : (!empty($curUser['display_name']) ? $curUser['display_name'] : $curUser['email']);
            $authorDept = !empty($curUser['department']) ? $curUser['department'] : (!empty($curUser['apply_remark']) ? $curUser['apply_remark'] : ($curUser['role'] === 'admin' ? '管理员' : ($curUser['role'] === 'editor' ? '协作者' : '审阅人')));
            $userId = (int)$curUser['id'];
        } else {
            if (!Auth::canGuestAnnotate()) jsonResponse(false, null, '未开放访客批注');
            if (!Auth::checkThrottle('guest_anno_' . $itemId . '_' . ($_SERVER['REMOTE_ADDR'] ?? ''), 15, 60)) {
                jsonResponse(false, null, '发表太频繁，请稍后再试');
            }
            $rawGuestName = trim($_POST['guest_name'] ?? '');
            $cleaned = mb_substr(preg_replace('/[\r\n\t]/', '', $rawGuestName), 0, 16, 'UTF-8');
            if ($cleaned === '' || $cleaned === '外部访客' || $cleaned === '访客') {
                $authorName = '[外部访客]';
            } else {
                $authorName = '[外部访客] ' . $cleaned;
            }
            $authorDept = '访客';
            $userId = 0;
        }

        $version = $isLink ? null : PrototypeContext::version($verId);
        $snapshot = $isLink ? '' : Collaboration::snapshot($version, $pagePath);
        $revision = $isLink ? '' : PrototypeContext::revision($version);
        $stmt = $db->prepare("INSERT INTO annotations (item_id, ver_id, page_path, page_title, user_id, author_name, author_dept, content, status, version_revision, page_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)");
        $stmt->execute([$itemId, $verId, $pagePath, $pageTitle, $userId, $authorName, $authorDept, $content, $revision, $snapshot]);
        $annoId = (int)$db->lastInsertId();

        if (!$curUser) {
            Auth::hitThrottle('guest_anno_' . $itemId . '_' . ($_SERVER['REMOTE_ADDR'] ?? ''), 60);
            if (!isset($_SESSION['guest_anno_ids']) || !is_array($_SESSION['guest_anno_ids'])) {
                $_SESSION['guest_anno_ids'] = [];
            }
            $_SESSION['guest_anno_ids'][] = $annoId;
        }
        $createdTime = $db->query("SELECT created_at FROM annotations WHERE id = " . $annoId)->fetchColumn() ?: gmdate('Y-m-d H:i:s');

        // 定向推送到项目负责人与共管人的个人通知机器人
        try {
            $itemCreatorStmt = $db->prepare("SELECT created_by, collaborators, name FROM items WHERE id = ?");
            $itemCreatorStmt->execute([$itemId]);
            $itemRow = $itemCreatorStmt->fetch();
            $itemCreatorStmt->closeCursor();
            $targetUids = [];
            $creatorId = (int)($itemRow['created_by'] ?? 0);
            if ($creatorId > 0) $targetUids[] = $creatorId;
            if (!empty($itemRow['collaborators'])) {
                $cIds = array_filter(array_map('intval', explode(',', $itemRow['collaborators'])));
                foreach ($cIds as $cid) {
                    if ($cid > 0) $targetUids[] = $cid;
                }
            }
            $targetUids = array_unique($targetUids);
            foreach ($targetUids as $tUid) {
                if ($curUser && $tUid === (int)$curUser['id']) continue;
                $uStmt = $db->prepare("SELECT webhook_url FROM users WHERE id = ?");
                $uStmt->execute([$tUid]);
                $wbUrl = trim($uStmt->fetchColumn() ?: '');
                $uStmt->closeCursor();
                if (!empty($wbUrl)) {
                    Webhook::send($wbUrl, 'annotation_new', [
                        'item_name' => $itemRow['name'] ?? '原型项目',
                        'page_title' => $pageTitle ?: $pagePath,
                        'author' => $authorName . ($authorDept ? " ({$authorDept})" : ""),
                        'content' => $content,
                        'link' => Collaboration::link($annoId)
                    ]);
                }
            }
        } catch (Exception $e) {
            error_log('annotation webhook: ' . $e->getMessage());
        }

        jsonResponse(true, [
            'id' => $annoId,
            'item_id' => $itemId,
            'ver_id' => $verId,
            'page_path' => $pagePath,
            'page_title' => $pageTitle,
            'version_revision' => $revision,
            'reviewed_revision' => '', 'page_snapshot' => $snapshot,
            'needs_review' => false, 'origin_outdated' => false, 'detail_url' => Collaboration::link($annoId),
            'author_name' => $authorName,
            'author_dept' => $authorDept,
            'content' => $content,
            'status' => 0,
            'created_at' => $createdTime,
            'replies' => []
        ], '批注发布成功');
        break;

    case 'reply_annotation':
        $curUser = Auth::getCurrentUser();

        $annoId = (int)($_POST['annotation_id'] ?? 0);
        $content = trim($_POST['content'] ?? '');

        if ($annoId <= 0) jsonResponse(false, null, '缺少批注 ID');
        if (empty($content)) jsonResponse(false, null, '回复正文不能为空');
        if (mb_strlen($content, 'UTF-8') > 1000) jsonResponse(false, null, '回复内容最多 1000 字');

        $checkStmt = $db->prepare("SELECT a.*, i.name as item_name, v.version_name FROM annotations a LEFT JOIN items i ON a.item_id = i.id LEFT JOIN versions v ON a.ver_id = v.id WHERE a.id = ?");
        $checkStmt->execute([$annoId]);
        $anno = $checkStmt->fetch();
        $checkStmt->closeCursor();
        if (!$anno) jsonResponse(false, null, '未找到对应的批注');
        requireAnnotationTarget($db, $anno['item_id'], $anno['ver_id']);

        if ($curUser) {
            if (!Auth::canAnnotate()) jsonResponse(false, null, '无权回复批注');
            $authorName = !empty($curUser['name']) ? $curUser['name'] : (!empty($curUser['display_name']) ? $curUser['display_name'] : $curUser['email']);
            $authorDept = !empty($curUser['department']) ? $curUser['department'] : (!empty($curUser['apply_remark']) ? $curUser['apply_remark'] : ($curUser['role'] === 'admin' ? '管理员' : ($curUser['role'] === 'editor' ? '协作者' : '审阅人')));
            $userId = (int)$curUser['id'];
        } else {
            if (!Auth::canGuestAnnotate()) jsonResponse(false, null, '未开放访客批注');
            if (!Collaboration::canAccessAnnotationRecord($anno)) {
                jsonResponse(false, null, '无权回复此批注');
            }
            if (!Auth::checkThrottle('guest_reply_' . $annoId . '_' . ($_SERVER['REMOTE_ADDR'] ?? ''), 15, 60)) {
                jsonResponse(false, null, '回复太频繁，请稍后再试');
            }
            $rawGuestName = trim($_POST['guest_name'] ?? '');
            $cleaned = mb_substr(preg_replace('/[\r\n\t]/', '', $rawGuestName), 0, 16, 'UTF-8');
            if ($cleaned === '' || $cleaned === '外部访客' || $cleaned === '访客') {
                $authorName = '[外部访客]';
            } else {
                $authorName = '[外部访客] ' . $cleaned;
            }
            $authorDept = '访客';
            $userId = 0;
        }

        $stmt = $db->prepare("INSERT INTO annotation_replies (annotation_id, user_id, author_name, author_dept, content) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$annoId, $userId, $authorName, $authorDept, $content]);
        $replyId = (int)$db->lastInsertId();

        if (!$curUser) {
            Auth::hitThrottle('guest_reply_' . $annoId . '_' . ($_SERVER['REMOTE_ADDR'] ?? ''), 60);
        }
        $replyCreatedTime = $db->query("SELECT created_at FROM annotation_replies WHERE id = " . $replyId)->fetchColumn() ?: gmdate('Y-m-d H:i:s');

        // 定向推送到原批注作者
        try {
            if (!empty($anno['user_id']) && (int)$anno['user_id'] !== (int)($curUser['id'] ?? 0)) {
                $uStmt = $db->prepare("SELECT webhook_url FROM users WHERE id = ?");
                $uStmt->execute([(int)$anno['user_id']]);
                $userWb = trim($uStmt->fetchColumn() ?: '');
                if (!empty($userWb)) {
                    Webhook::send($userWb, 'annotation_reply', [
                        'item_name' => $anno['item_name'] ?? '原型项目',
                        'version_name' => $anno['version_name'] ?? '',
                        'page_title' => $anno['page_title'] ?: $anno['page_path'],
                        'author' => $authorName,
                        'content' => $content,
                        'link' => Collaboration::link($annoId)
                    ]);
                }
            }
        } catch (Exception $e) {
            error_log('annotation webhook: ' . $e->getMessage());
        }

        jsonResponse(true, [
            'id' => $replyId,
            'annotation_id' => $annoId,
            'author_name' => $authorName,
            'author_dept' => $authorDept,
            'content' => $content,
            'created_at' => $replyCreatedTime
        ], '回复成功');
        break;

    case 'toggle_annotation_status':
        if (!Auth::canAnnotate()) jsonResponse(false, null, '未登录或权限不足');
        $curUser = Auth::getCurrentUser();

        $annoId = (int)($_POST['id'] ?? 0);
        if ($annoId <= 0) jsonResponse(false, null, '缺少批注 ID');

        $stmt = $db->prepare("SELECT * FROM annotations WHERE id = ?");
        $stmt->execute([$annoId]);
        $anno = $stmt->fetch();
        $stmt->closeCursor();
        if (!$anno) jsonResponse(false, null, '未找到指定批注');
        $annoItem = requireAnnotationTarget($db, $anno['item_id'], $anno['ver_id']);

        $isAuthor = ((int)$curUser['id'] === (int)$anno['user_id']);
        $canManageProject = Auth::canEditItem($annoItem);
        if (!$isAuthor && !$canManageProject) {
            jsonResponse(false, null, '只有批注发起者或项目负责人可切换批注状态');
        }

        $newStatus = ((int)$anno['status'] === 1) ? 0 : 1;
        $resolverName = ($newStatus === 1) ? (!empty($curUser['name']) ? $curUser['name'] : ($curUser['email'] ?? '管理员')) : '';
        $resolvedAt = ($newStatus === 1) ? gmdate('Y-m-d H:i:s') : null;

        $updateStmt = $db->prepare("UPDATE annotations SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?");
        $updateStmt->execute([$newStatus, $resolverName, $resolvedAt, $annoId]);

        if ($newStatus === 1) {
            try {
                if (!empty($anno['user_id'])) {
                    $uStmt = $db->prepare("SELECT webhook_url FROM users WHERE id = ?");
                    $uStmt->execute([(int)$anno['user_id']]);
                    $userWb = trim($uStmt->fetchColumn() ?: '');
                    $uStmt->closeCursor();
                    if (!empty($userWb)) {
                        $itemInfoStmt = $db->prepare("SELECT name FROM items WHERE id = ?");
                        $itemInfoStmt->execute([(int)$anno['item_id']]);
                        $itemName = $itemInfoStmt->fetchColumn() ?: '原型项目';
                        $itemInfoStmt->closeCursor();

                        Webhook::send($userWb, 'annotation_resolve', [
                            'item_name' => $itemName,
                            'page_title' => $anno['page_title'] ?: $anno['page_path'],
                            'author' => $resolverName,
                            'content' => "原批注：“{$anno['content']}” (已解决)",
                            'link' => Collaboration::link($annoId)
                        ]);
                    }
                }
            } catch (Exception $e) {
            error_log('annotation webhook: ' . $e->getMessage());
        }
        }

        jsonResponse(true, [
            'id' => $annoId,
            'status' => $newStatus,
            'resolved_by' => $resolverName,
            'resolved_at' => $resolvedAt
        ], $newStatus === 1 ? '已标记为已解决' : '已重新开启该批注');
        break;

    case 'delete_annotation':
        if (!Auth::canAnnotate()) jsonResponse(false, null, '未登录或权限不足');
        $curUser = Auth::getCurrentUser();

        $annoId = (int)($_POST['id'] ?? 0);
        if ($annoId <= 0) jsonResponse(false, null, '缺少批注 ID');

        $stmt = $db->prepare("SELECT * FROM annotations WHERE id = ?");
        $stmt->execute([$annoId]);
        $anno = $stmt->fetch();
        $stmt->closeCursor();
        if (!$anno) jsonResponse(false, null, '未找到指定批注');
        $annoItem = requireAnnotationTarget($db, $anno['item_id'], $anno['ver_id']);

        $isAuthor = ((int)$curUser['id'] === (int)$anno['user_id']);
        if (!$isAuthor && !Auth::isAdmin()) {
            jsonResponse(false, null, '只有批注发起者或管理员可以删除批注');
        }

        $db->prepare("DELETE FROM annotation_replies WHERE annotation_id = ?")->execute([$annoId]);
        $db->prepare("DELETE FROM annotations WHERE id = ?")->execute([$annoId]);

        jsonResponse(true, ['id' => $annoId], '批注已成功删除');
        break;
}
