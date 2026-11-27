<?php
/**
 * 领域服务：项目与分类管理 (Projects & Categories)
 */
if (!defined('APP_VERSION')) exit;

switch ($action) {
    case 'category_save':
        if (!Auth::canManage()) jsonResponse(false, null, t('api.no_perm'));
        $catId = (int)($_POST['id'] ?? 0);
        $name = trim($_POST['name'] ?? '');
        if (empty($name)) jsonResponse(false, null, t('api.items.cat_name_empty'));
        if (mb_strlen($name, 'UTF-8') > 20) jsonResponse(false, null, t('api.items.cat_name_len'));

        if ($catId > 0) {
            $stmt = $db->prepare("UPDATE categories SET name = ? WHERE id = ?");
            $stmt->execute([$name, $catId]);
        } else {
            $minSort = $db->query("SELECT MIN(sort_order) as m FROM categories")->fetch()['m'] ?? null;
            $nextSort = ($minSort === null) ? 10 : ((int)$minSort - 10);
            $stmt = $db->prepare("INSERT INTO categories (name, sort_order) VALUES (?, ?)");
            $stmt->execute([$name, $nextSort]);
            $catId = $db->lastInsertId();
        }
        jsonResponse(true, ['id' => $catId, 'name' => $name]);
        break;

    case 'category_delete':
        if (!Auth::canManage()) jsonResponse(false, null, t('api.no_perm'));
        $catId = (int)($_POST['id'] ?? 0);
        $db->beginTransaction();
        try {
            $db->exec('UPDATE items SET id = id WHERE 0');
            $stmt = $db->prepare('SELECT * FROM categories WHERE id = ?');
            $stmt->execute([$catId]);
            $hasCat = (bool)$stmt->fetch();
            $stmt->closeCursor();
            if (!$hasCat) throw new DomainException(t('api.items.cat_missing'));
            $stmt = $db->prepare('SELECT * FROM items WHERE category_id = ?');
            $stmt->execute([$catId]);
            $rows = $stmt->fetchAll();
            foreach ($rows as $row) {
                if (!Auth::canDeleteItem($row)) throw new DomainException(t('api.items.cat_has_others'));
            }
            foreach ($rows as $row) Storage::deleteItemRecords($db, $row['id']);
            $db->prepare('DELETE FROM categories WHERE id = ?')->execute([$catId]);
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            throw $e;
        }
        $pending = Storage::collectGarbage($db);
        jsonResponse(true, null, $pending ? t('api.items.cat_deleted_retry') : t('api.items.cat_deleted'));
        break;

    case 'category_sort':
        if (!Auth::canManage()) jsonResponse(false, null, t('api.no_perm'));
        $ids = json_decode($_POST['ids'] ?? '[]', true);
        if (!is_array($ids)) {
            jsonResponse(false, null, t('api.items.sort_fmt'));
        }
        $sort = 10;
        $stmt = $db->prepare("UPDATE categories SET sort_order = ? WHERE id = ?");
        foreach ($ids as $cid) {
            $stmt->execute([$sort, (int)$cid]);
            $sort += 10;
        }
        jsonResponse(true, null, t('api.items.cat_sorted'));
        break;

    case 'item_save':
        if (!Auth::canManage()) jsonResponse(false, null, t('api.no_perm'));
        $itemId = (int)($_POST['id'] ?? 0);
        $catId = (int)($_POST['category_id'] ?? 0);
        $type = in_array($_POST['type'] ?? '', ['project', 'link']) ? $_POST['type'] : 'project';
        $name = trim($_POST['name'] ?? '');
        $targetDir = 'ux';
        $linkUrl = trim($_POST['link_url'] ?? '');
        $linkTarget = in_array($_POST['link_target'] ?? '', ['_blank', 'myFrame']) ? $_POST['link_target'] : '_blank';
        $webhookUrl = trim($_POST['webhook_url'] ?? '');
        if ($type === 'link') {
            $webhookUrl = '';
        }
        $hasScopeParam = array_key_exists('collaboration_scope', $_POST);
        $scope = $hasScopeParam ? $_POST['collaboration_scope'] : null;
        if ($hasScopeParam && !in_array($scope, ['all', 'selected'], true)) jsonResponse(false, null, t('api.items.scope_invalid'));
        $hasCollaboratorsParam = array_key_exists('collaborators', $_POST) || $hasScopeParam;
        if (array_key_exists('collaborators', $_POST) && !is_string($_POST['collaborators'])) jsonResponse(false, null, t('api.items.owners_fmt'));
        $collaborators = trim($_POST['collaborators'] ?? '');
        if ($scope === 'all') $collaborators = '';
        if ($scope === 'selected' && $collaborators === '') jsonResponse(false, null, t('api.items.owners_required'));
        if ($collaborators !== '') {
            if (!preg_match('/^[1-9][0-9]*(\s*,\s*[1-9][0-9]*)*$/D', $collaborators)) jsonResponse(false, null, t('api.items.owners_fmt'));
            $cArr = array_values(array_unique(array_filter(array_map('intval', explode(',', $collaborators)), function($v) { return $v > 0; })));
            $collaborators = implode(',', $cArr);
        } else {
            $cArr = [];
        }
        $watermarkEnabled = !empty($_POST['watermark_enabled']) ? 1 : 0;

        if (empty($name)) jsonResponse(false, null, t('api.items.name_empty'));
        if (!mb_check_encoding($name, 'UTF-8')) jsonResponse(false, null, t('api.items.name_encoding'));
        if (mb_strlen($name, 'UTF-8') > 40) jsonResponse(false, null, t('api.items.name_len'));
        if (mb_strlen($linkUrl, 'UTF-8') > 2000) jsonResponse(false, null, t('api.items.link_len'));
        if (mb_strlen($webhookUrl, 'UTF-8') > 1000) jsonResponse(false, null, t('api.auth.webhook_len'));
        if ($webhookUrl !== '' && !Webhook::isAllowedUrl($webhookUrl)) {
            jsonResponse(false, null, t('api.sys.webhook_https_only'));
        }
        if ($catId <= 0) jsonResponse(false, null, t('api.items.folder_required'));

        if ($type === 'link' && $linkUrl === '') jsonResponse(false, null, t('api.items.link_url_required'));
        if ($type === 'link' && !preg_match('#^(https?://|/)#i', $linkUrl)) {
            jsonResponse(false, null, t('api.items.link_url_scheme'));
        }

        $category = $db->prepare('SELECT id FROM categories WHERE id = ?');
        $category->execute([$catId]);
        $hasCat = (bool)$category->fetchColumn();
        $category->closeCursor();
        if (!$hasCat) jsonResponse(false, null, t('api.items.folder_missing'));
        $currentUser = Auth::getCurrentUser();
        $db->beginTransaction();
        try {
            // 与负责人变更、工作交接串行，避免旧表单恢复已撤销的负责人范围。
            $db->exec('UPDATE items SET id = id WHERE 0');
            if ($itemId > 0) {
                $oldItemStmt = $db->prepare("SELECT * FROM items WHERE id = ?");
                $oldItemStmt->execute([$itemId]);
                $oldItem = $oldItemStmt->fetch();
                $oldItemStmt->closeCursor();
                if (!$oldItem) {
                    jsonResponse(false, null, t('api.items.not_found'));
                }
                $oldCollabArr = Auth::parseItemCollaborators($oldItem);
                $oldCollabNormalized = implode(',', $oldCollabArr);
                // 基本资料编辑不覆盖由其他入口管理的负责人范围与水印配置。
                if (!$hasCollaboratorsParam) {
                    $collaborators = $oldCollabNormalized;
                    $cArr = $oldCollabArr;
                }
                if (!array_key_exists('watermark_enabled', $_POST)) $watermarkEnabled = (int)$oldItem['watermark_enabled'];
                if (!Auth::canManageItemConfig($oldItem, $currentUser)) {
                    jsonResponse(false, null, t('api.items.no_edit_config'));
                }

                if ($hasCollaboratorsParam && $collaborators !== $oldCollabNormalized && !Auth::canEditItemOwners($oldItem, $currentUser)) {
                    jsonResponse(false, null, t('api.items.owner_change_scope_only'));
                }
                if ($hasCollaboratorsParam && !empty($cArr)) {
                    $placeholders = implode(',', array_fill(0, count($cArr), '?'));
                    $uCheck = $db->prepare("SELECT id, role, status FROM users WHERE id IN ($placeholders)");
                    $uCheck->execute($cArr);
                    $uRows = [];
                    foreach ($uCheck->fetchAll() as $ur) {
                        $uRows[(int)$ur['id']] = $ur;
                    }
                    foreach ($cArr as $cid) {
                        $uRow = $uRows[$cid] ?? null;
                        $isValidActive = $uRow && in_array($uRow['role'], ['admin', 'editor'], true) && (int)$uRow['status'] === 1;
                        $wasExistingOwner = in_array($cid, $oldCollabArr, true);
                        if (!$isValidActive && !$wasExistingOwner) {
                            jsonResponse(false, null, t('api.items.owners_active_only'));
                        }
                    }
                }

                if ($type !== $oldItem['type']) jsonResponse(false, null, t('api.items.type_immutable'));
                $finalAuthorId = (Auth::isAdmin() && isset($_POST['created_by'])) ? (int)$_POST['created_by'] : (int)($oldItem['created_by'] ?? 0);
                if (Auth::isAdmin() && isset($_POST['created_by'])) {
                    $owner = $db->prepare("SELECT id FROM users WHERE id = ? AND status = 1 AND role IN ('admin', 'editor')");
                    $owner->execute([$finalAuthorId]);
                    $hasOwner = (bool)$owner->fetchColumn();
                    $owner->closeCursor();
                    if (!$hasOwner) jsonResponse(false, null, t('api.items.creator_active_only'));
                }

                $nextSort = (int)($oldItem['sort_order'] ?? 0);
                if ($catId !== (int)($oldItem['category_id'] ?? 0)) {
                    $minSortStmt = $db->prepare("SELECT MIN(sort_order) as m FROM items WHERE category_id = ?");
                    $minSortStmt->execute([$catId]);
                    $minSort = $minSortStmt->fetch()['m'] ?? null;
                    $minSortStmt->closeCursor();
                    $nextSort = ($minSort === null) ? 10 : ((int)$minSort - 10);
                }

                if (Auth::isAdmin() && isset($_POST['created_by'])) {
                    $stmt = $db->prepare("UPDATE items SET category_id = ?, type = ?, name = ?, link_url = ?, link_target = ?, webhook_url = ?, sort_order = ?, created_by = ?, collaborators = ?, watermark_enabled = ? WHERE id = ?");
                    $stmt->execute([$catId, $type, $name, $linkUrl, $linkTarget, $webhookUrl, $nextSort, $finalAuthorId, $collaborators, $watermarkEnabled, $itemId]);
                } else {
                    $stmt = $db->prepare("UPDATE items SET category_id = ?, type = ?, name = ?, link_url = ?, link_target = ?, webhook_url = ?, sort_order = ?, collaborators = ?, watermark_enabled = ? WHERE id = ?");
                    $stmt->execute([$catId, $type, $name, $linkUrl, $linkTarget, $webhookUrl, $nextSort, $collaborators, $watermarkEnabled, $itemId]);
                }
            } else {
                $minSortStmt = $db->prepare("SELECT MIN(sort_order) as m FROM items WHERE category_id = ?");
                $minSortStmt->execute([$catId]);
                $minSort = $minSortStmt->fetch()['m'] ?? null;
                $minSortStmt->closeCursor();
                $nextSort = ($minSort === null) ? 10 : ((int)$minSort - 10);

                $initialUid = (int)($currentUser['id'] ?? 0);
                if (!empty($cArr)) {
                    $placeholders = implode(',', array_fill(0, count($cArr), '?'));
                    $uCheck = $db->prepare("SELECT id FROM users WHERE id IN ($placeholders) AND status = 1 AND role IN ('admin', 'editor')");
                    $uCheck->execute($cArr);
                    $validIds = array_map('intval', $uCheck->fetchAll(PDO::FETCH_COLUMN));
                    if (count($validIds) !== count($cArr)) {
                        jsonResponse(false, null, t('api.items.owners_active_only'));
                    }
                }

                $newShareCode = Auth::generateShortCode(8);

                $stmt = $db->prepare("INSERT INTO items (category_id, type, name, target_dir, link_url, link_target, share_code, share_enabled, webhook_url, sort_order, created_by, collaborators, watermark_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)");
                $stmt->execute([$catId, $type, $name, $targetDir, $linkUrl, $linkTarget, $newShareCode, $webhookUrl, $nextSort, $initialUid, $collaborators, $watermarkEnabled]);
                $itemId = $db->lastInsertId();

                try {
                    $db->prepare("INSERT INTO share_codes (code, item_id, ver_id) VALUES (?, ?, 0)")->execute([$newShareCode, $itemId]);
                } catch (Exception $e) {}
            }
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            throw $e;
        }
        jsonResponse(true, ['id' => $itemId, 'name' => $name]);
        break;

    case 'item_set_webhook':
        if (!Auth::canManage()) jsonResponse(false, null, t('api.no_perm'));
        $itemId = (int)($_POST['item_id'] ?? 0);
        $webhookUrl = trim($_POST['webhook_url'] ?? '');
        if ($itemId <= 0) jsonResponse(false, null, t('api.items.select_item'));

        $stmtItem = $db->prepare("SELECT * FROM items WHERE id = ?");
        $stmtItem->execute([$itemId]);
        $item = $stmtItem->fetch();
        $stmtItem->closeCursor();
        if (!$item) jsonResponse(false, null, t('api.items.not_found'));
        if (($item['type'] ?? '') === 'link') jsonResponse(false, null, t('api.items.link_no_webhook'));
        if (!Auth::canManageItemConfig($item)) jsonResponse(false, null, t('api.items.no_webhook_perm'));
        if (mb_strlen($webhookUrl, 'UTF-8') > 1000) jsonResponse(false, null, t('api.auth.webhook_len'));
        if ($webhookUrl !== '' && !Webhook::isAllowedUrl($webhookUrl)) {
            jsonResponse(false, null, t('api.sys.webhook_https_only'));
        }

        $upd = $db->prepare("UPDATE items SET webhook_url = ? WHERE id = ?");
        $upd->execute([$webhookUrl, $itemId]);
        jsonResponse(true, ['item_id' => $itemId, 'webhook_url' => $webhookUrl], t('api.items.webhook_saved'));
        break;

    case 'item_delete':
        if (!Auth::canManage()) jsonResponse(false, null, t('api.no_perm'));
        $itemId = (int)($_POST['id'] ?? 0);
        $db->beginTransaction();
        try {
            $db->exec('UPDATE items SET id = id WHERE 0');
            $item = Auth::getItem($itemId);
            if (!$item || !Auth::canDeleteItem($item)) throw new DomainException(t('api.items.no_delete_perm'));
            Storage::deleteItemRecords($db, $itemId);
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            throw $e;
        }
        $pending = Storage::collectGarbage($db);
        jsonResponse(true, null, $pending ? t('api.items.deleted_retry') : t('api.items.deleted'));
        break;

    case 'item_toggle_visibility':
        if (!Auth::canManage()) jsonResponse(false, null, t('api.no_perm'));
        $itemId = (int)($_POST['id'] ?? 0);
        $curr = $db->prepare("SELECT * FROM items WHERE id = ?");
        $curr->execute([$itemId]);
        $row = $curr->fetch();
        $curr->closeCursor();
        if ($row) {
            if (!Auth::canManageItemConfig($row)) {
                jsonResponse(false, null, t('api.items.no_vis_perm'));
            }
            $newVis = $row['is_visible'] ? 0 : 1;
            $stmt = $db->prepare("UPDATE items SET is_visible = ? WHERE id = ?");
            $stmt->execute([$newVis, $itemId]);
            jsonResponse(true, ['is_visible' => $newVis]);
        }
        jsonResponse(false, null, t('api.items.not_found'));
        break;

    case 'item_sort':
        if (!Auth::canManage()) jsonResponse(false, null, t('api.no_perm'));
        $ids = json_decode($_POST['ids'] ?? '[]', true);
        $catId = (int)($_POST['category_id'] ?? 0);
        if (!is_array($ids) || count($ids) > 1000) jsonResponse(false, null, t('api.items.sort_param_err'));
        $ids = array_values(array_unique(array_map('intval', $ids)));
        $db->beginTransaction();
        try {
            $db->exec('UPDATE items SET id = id WHERE 0');
            if ($catId > 0) {
                $cat = $db->prepare('SELECT id FROM categories WHERE id = ?');
                $cat->execute([$catId]);
                $hasCat = (bool)$cat->fetchColumn();
                $cat->closeCursor();
                if (!$hasCat) throw new DomainException(t('api.items.target_folder_missing'));
            }
            foreach ($ids as $id) {
                $row = Auth::getItem($id);
                if (!$row || !Auth::canManageItemConfig($row)) throw new DomainException(t('api.items.no_sort_perm'));
            }
            $sort = 10;
            foreach ($ids as $id) {
                if ($catId > 0) $db->prepare('UPDATE items SET sort_order = ?, category_id = ? WHERE id = ?')->execute([$sort, $catId, $id]);
                else $db->prepare('UPDATE items SET sort_order = ? WHERE id = ?')->execute([$sort, $id]);
                $sort += 10;
            }
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            throw $e;
        }
        jsonResponse(true, null, t('api.items.sorted'));
        break;

    case 'download_rp':
        $verId = (int)($_GET['ver_id'] ?? 0);
        $itemId = (int)($_GET['item_id'] ?? 0);
        if ($verId > 0) {
            $stmt = $db->prepare('SELECT * FROM versions WHERE id = ?');
            $stmt->execute([$verId]);
        } else {
            $stmt = $db->prepare("SELECT * FROM versions WHERE item_id = ? AND rp_file != '' ORDER BY is_default DESC, id DESC LIMIT 1");
            $stmt->execute([$itemId]);
        }
        $version = $stmt->fetch();
        if (!$version || ($itemId > 0 && (int)$version['item_id'] !== $itemId)) { http_response_code(404); exit; }
        $item = Auth::getItem($version['item_id']);
        if (!$item) { http_response_code(404); exit; }

        $curUser = Auth::getCurrentUser();
        $isAllowed = false;
        if ($curUser) {
            $isAllowed = Auth::canDownloadRp($curUser) && Auth::canViewItem($item);
        } else {
            $isAllowed = Auth::canGuestDownloadRp() && Auth::hasShareAccess($item, $version);
        }
        if (!$isAllowed) { http_response_code(403); exit(t('api.cannot_download')); }

        $file = Storage::filePath($version, $version['rp_file']);
        if (!$file) { http_response_code(404); exit; }
        session_write_close();

        // 依据项目名与版本名智能生成规范下载文件名: {项目名}_{版本名}.rp
        $rawItemName = trim($item['name'] ?? '');
        $rawVerName = trim($version['version_name'] ?? '');
        $safeItemName = preg_replace('/[\\/\\\\:*?"<>|\\x00-\\x1f]/u', '_', $rawItemName);
        $safeVerName = preg_replace('/[\\/\\\\:*?"<>|\\x00-\\x1f]/u', '_', $rawVerName);
        $safeItemName = trim(preg_replace('/_+/', '_', $safeItemName), '_');
        $safeVerName = trim(preg_replace('/_+/', '_', $safeVerName), '_');

        if ($safeItemName !== '' && $safeVerName !== '') {
            $downloadFilename = "{$safeItemName}_{$safeVerName}.rp";
        } elseif ($safeItemName !== '') {
            $downloadFilename = "{$safeItemName}.rp";
        } else {
            $downloadFilename = 'prototype.rp';
        }

        $encodedFilename = rawurlencode($downloadFilename);
        $asciiItem = preg_replace('/[^\x20-\x7e]/', '', $safeItemName);
        $asciiItem = trim(preg_replace('/[^a-zA-Z0-9_\-\.]/', '_', $asciiItem), '_');
        if ($asciiItem === '') {
            $asciiItem = 'prototype';
        }
        $asciiVer = preg_replace('/[^\x20-\x7e]/', '', $safeVerName);
        $asciiVer = trim(preg_replace('/[^a-zA-Z0-9_\-\.]/', '_', $asciiVer), '_');
        $fallbackAscii = $asciiItem . ($asciiVer !== '' ? ('_' . $asciiVer) : '') . '.rp';

        header('Content-Type: application/octet-stream');
        header("Content-Disposition: attachment; filename=\"{$fallbackAscii}\"; filename*=UTF-8''{$encodedFilename}");
        header('Cache-Control: private, no-store');
        header('Content-Length: ' . filesize($file));
        readfile($file);
        exit;

    case 'items_versions_sync':
        $curUser = Auth::getCurrentUser();
        if (!$curUser) {
            jsonResponse(false, null, t('api.login_expired'));
        }
        $canManage = Auth::canManage($curUser);
        $clientSig = trim((string)($_POST['sig'] ?? ($_GET['sig'] ?? '')));

        $itemSql = "SELECT id, is_visible FROM items " . ($canManage ? "" : "WHERE is_visible = 1 ") . "ORDER BY id ASC";
        $itemRows = $db->query($itemSql)->fetchAll();

        $visibleItemIds = [];
        $sigParts = [];
        foreach ($itemRows as $row) {
            $id = (int)$row['id'];
            $visibleItemIds[$id] = true;
            $sigParts[] = $id . ':' . (int)$row['is_visible'];
        }

        $verSql = "SELECT v.*, v.author_name as creator_name FROM versions v ORDER BY v.item_id ASC, v.is_default DESC, v.id DESC";
        $versionsRaw = $db->query($verSql)->fetchAll();

        $itemVersions = [];
        $verSigParts = [];
        foreach ($versionsRaw as $v) {
            $iid = (int)$v['item_id'];
            if (!isset($visibleItemIds[$iid])) {
                continue;
            }
            $verSigParts[] = $iid . ':' . (int)$v['id'] . ':' . (int)$v['is_default'] . ':' . ($v['version_name'] ?? '') . ':' . ($v['updated_at'] ?? '') . ':' . ($v['rp_file'] ?? '');
            $itemVersions[$iid][] = Auth::versionForClient($v);
        }

        $sig = md5(implode(',', $sigParts) . '|' . implode(';', $verSigParts));
        if ($clientSig !== '' && hash_equals($sig, $clientSig)) {
            jsonResponse(true, ['changed' => false, 'sig' => $sig]);
        }

        $itemsPayload = [];
        foreach ($itemRows as $row) {
            $iid = (int)$row['id'];
            $itemsPayload[] = [
                'id' => $iid,
                'versions' => $itemVersions[$iid] ?? [],
            ];
        }
        jsonResponse(true, [
            'changed' => true,
            'sig' => $sig,
            'items' => $itemsPayload,
        ]);
        break;
}
