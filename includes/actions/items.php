<?php
/**
 * 领域服务：项目与分类管理 (Projects & Categories)
 */
if (!defined('APP_VERSION')) exit;

switch ($action) {
    case 'category_save':
        if (!Auth::canManage()) jsonResponse(false, null, '无权操作');
        $catId = (int)($_POST['id'] ?? 0);
        $name = trim($_POST['name'] ?? '');
        if (empty($name)) jsonResponse(false, null, '文件夹名称不能为空');
        if (mb_strlen($name, 'UTF-8') > 20) jsonResponse(false, null, '文件夹名称不能超过 20 个字符');

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
        if (!Auth::canManage()) jsonResponse(false, null, '无权操作');
        $catId = (int)($_POST['id'] ?? 0);
        $db->beginTransaction();
        try {
            $db->exec('UPDATE items SET id = id WHERE 0');
            $stmt = $db->prepare('SELECT * FROM categories WHERE id = ?');
            $stmt->execute([$catId]);
            $hasCat = (bool)$stmt->fetch();
            $stmt->closeCursor();
            if (!$hasCat) throw new DomainException('文件夹不存在');
            $stmt = $db->prepare('SELECT * FROM items WHERE category_id = ?');
            $stmt->execute([$catId]);
            $rows = $stmt->fetchAll();
            foreach ($rows as $row) {
                if (!Auth::canDeleteItem($row)) throw new DomainException('文件夹中有其他成员的项目，无法删除');
            }
            foreach ($rows as $row) Storage::deleteItemRecords($db, $row['id']);
            $db->prepare('DELETE FROM categories WHERE id = ?')->execute([$catId]);
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            throw $e;
        }
        $pending = Storage::collectGarbage($db);
        jsonResponse(true, null, $pending ? '文件夹已删除，文件清理待重试' : '文件夹已删除');
        break;

    case 'category_sort':
        if (!Auth::canManage()) jsonResponse(false, null, '无权操作');
        $ids = json_decode($_POST['ids'] ?? '[]', true);
        if (!is_array($ids)) {
            jsonResponse(false, null, '排序数据格式不正确');
        }
        $sort = 10;
        $stmt = $db->prepare("UPDATE categories SET sort_order = ? WHERE id = ?");
        foreach ($ids as $cid) {
            $stmt->execute([$sort, (int)$cid]);
            $sort += 10;
        }
        jsonResponse(true, null, '文件夹排序已更新');
        break;

    case 'item_save':
        if (!Auth::canManage()) jsonResponse(false, null, '无权操作');
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
        if ($hasScopeParam && !in_array($scope, ['all', 'selected'], true)) jsonResponse(false, null, '请选择有效的协作权限');
        $hasCollaboratorsParam = array_key_exists('collaborators', $_POST) || $hasScopeParam;
        if (array_key_exists('collaborators', $_POST) && !is_string($_POST['collaborators'])) jsonResponse(false, null, '协作成员格式不正确');
        $collaborators = trim($_POST['collaborators'] ?? '');
        if ($scope === 'all') $collaborators = '';
        if ($scope === 'selected' && $collaborators === '') jsonResponse(false, null, '请至少选择一位协作成员');
        if ($collaborators !== '') {
            if (!preg_match('/^[1-9][0-9]*(\s*,\s*[1-9][0-9]*)*$/D', $collaborators)) jsonResponse(false, null, '协作成员格式不正确');
            $cArr = array_values(array_unique(array_filter(array_map('intval', explode(',', $collaborators)), function($v) { return $v > 0; })));
            $collaborators = implode(',', $cArr);
        } else {
            $cArr = [];
        }
        $watermarkEnabled = !empty($_POST['watermark_enabled']) ? 1 : 0;

        if (empty($name)) jsonResponse(false, null, '项目/外链名称不能为空');
        if (!mb_check_encoding($name, 'UTF-8')) jsonResponse(false, null, '项目/外链名称编码无效');
        if (mb_strlen($name, 'UTF-8') > 40) jsonResponse(false, null, '项目/外链名称不能超过 40 个字符');
        if (mb_strlen($linkUrl, 'UTF-8') > 2000) jsonResponse(false, null, '外链地址不能超过 2000 个字符');
        if (mb_strlen($webhookUrl, 'UTF-8') > 1000) jsonResponse(false, null, 'Webhook 地址不能超过 1000 个字符');
        if ($webhookUrl !== '' && !Webhook::isAllowedUrl($webhookUrl)) {
            jsonResponse(false, null, '仅支持企业微信、飞书或钉钉的 HTTPS Webhook 地址');
        }
        if ($catId <= 0) jsonResponse(false, null, '必须选择所属文件夹');

        if ($type === 'link' && $linkUrl === '') jsonResponse(false, null, '请输入链接地址');
        if ($type === 'link' && !preg_match('#^(https?://|/)#i', $linkUrl)) {
            jsonResponse(false, null, '外链地址必须以 http(s):// 开头，或为站内路径 (以 / 开头)');
        }

        $category = $db->prepare('SELECT id FROM categories WHERE id = ?');
        $category->execute([$catId]);
        $hasCat = (bool)$category->fetchColumn();
        $category->closeCursor();
        if (!$hasCat) jsonResponse(false, null, '所属文件夹不存在');
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
                    jsonResponse(false, null, '未找到指定项目');
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
                    jsonResponse(false, null, '您不是该项目的创建者或指定协作成员，无权修改其配置');
                }

                if ($hasCollaboratorsParam && $collaborators !== $oldCollabNormalized && !Auth::canEditItemOwners($oldItem, $currentUser)) {
                    jsonResponse(false, null, '仅管理员或项目创建者可调整协作权限');
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
                            jsonResponse(false, null, '协作成员必须是正常状态的管理员或协作者');
                        }
                    }
                }

                if ($type !== $oldItem['type']) jsonResponse(false, null, '项目类型不可变更');
                $finalAuthorId = (Auth::isAdmin() && isset($_POST['created_by'])) ? (int)$_POST['created_by'] : (int)($oldItem['created_by'] ?? 0);
                if (Auth::isAdmin() && isset($_POST['created_by'])) {
                    $owner = $db->prepare("SELECT id FROM users WHERE id = ? AND status = 1 AND role IN ('admin', 'editor')");
                    $owner->execute([$finalAuthorId]);
                    $hasOwner = (bool)$owner->fetchColumn();
                    $owner->closeCursor();
                    if (!$hasOwner) jsonResponse(false, null, '负责人必须是正常成员');
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
                        jsonResponse(false, null, '协作成员必须是正常状态的管理员或协作者');
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
        if (!Auth::canManage()) jsonResponse(false, null, '无权操作');
        $itemId = (int)($_POST['item_id'] ?? 0);
        $webhookUrl = trim($_POST['webhook_url'] ?? '');
        if ($itemId <= 0) jsonResponse(false, null, '请指定项目');

        $stmtItem = $db->prepare("SELECT * FROM items WHERE id = ?");
        $stmtItem->execute([$itemId]);
        $item = $stmtItem->fetch();
        $stmtItem->closeCursor();
        if (!$item) jsonResponse(false, null, '未找到指定项目');
        if (($item['type'] ?? '') === 'link') jsonResponse(false, null, '链接类型不支持配置群通知');
        if (!Auth::canManageItemConfig($item)) jsonResponse(false, null, '您无权配置该项目的 Webhook');
        if (mb_strlen($webhookUrl, 'UTF-8') > 1000) jsonResponse(false, null, 'Webhook 地址不能超过 1000 个字符');
        if ($webhookUrl !== '' && !Webhook::isAllowedUrl($webhookUrl)) {
            jsonResponse(false, null, '仅支持企业微信、飞书或钉钉的 HTTPS Webhook 地址');
        }

        $upd = $db->prepare("UPDATE items SET webhook_url = ? WHERE id = ?");
        $upd->execute([$webhookUrl, $itemId]);
        jsonResponse(true, ['item_id' => $itemId, 'webhook_url' => $webhookUrl], '项目群机器人已保存');
        break;

    case 'item_delete':
        if (!Auth::canManage()) jsonResponse(false, null, '无权操作');
        $itemId = (int)($_POST['id'] ?? 0);
        $db->beginTransaction();
        try {
            $db->exec('UPDATE items SET id = id WHERE 0');
            $item = Auth::getItem($itemId);
            if (!$item || !Auth::canDeleteItem($item)) throw new DomainException('无权删除此项目');
            Storage::deleteItemRecords($db, $itemId);
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            throw $e;
        }
        $pending = Storage::collectGarbage($db);
        jsonResponse(true, null, $pending ? '项目已删除，文件清理待重试' : '项目已删除');
        break;

    case 'item_toggle_visibility':
        if (!Auth::canManage()) jsonResponse(false, null, '无权操作');
        $itemId = (int)($_POST['id'] ?? 0);
        $curr = $db->prepare("SELECT * FROM items WHERE id = ?");
        $curr->execute([$itemId]);
        $row = $curr->fetch();
        $curr->closeCursor();
        if ($row) {
            if (!Auth::canManageItemConfig($row)) {
                jsonResponse(false, null, '您不是该项目的创建者或指定协作成员，无权修改其可见性');
            }
            $newVis = $row['is_visible'] ? 0 : 1;
            $stmt = $db->prepare("UPDATE items SET is_visible = ? WHERE id = ?");
            $stmt->execute([$newVis, $itemId]);
            jsonResponse(true, ['is_visible' => $newVis]);
        }
        jsonResponse(false, null, '未找到指定项目');
        break;

    case 'item_sort':
        if (!Auth::canManage()) jsonResponse(false, null, '无权操作');
        $ids = json_decode($_POST['ids'] ?? '[]', true);
        $catId = (int)($_POST['category_id'] ?? 0);
        if (!is_array($ids) || count($ids) > 1000) jsonResponse(false, null, '排序参数错误');
        $ids = array_values(array_unique(array_map('intval', $ids)));
        $db->beginTransaction();
        try {
            $db->exec('UPDATE items SET id = id WHERE 0');
            if ($catId > 0) {
                $cat = $db->prepare('SELECT id FROM categories WHERE id = ?');
                $cat->execute([$catId]);
                $hasCat = (bool)$cat->fetchColumn();
                $cat->closeCursor();
                if (!$hasCat) throw new DomainException('目标文件夹不存在');
            }
            foreach ($ids as $id) {
                $row = Auth::getItem($id);
                if (!$row || !Auth::canManageItemConfig($row)) throw new DomainException('无权调整所选项目');
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
        jsonResponse(true, null, '项目排序已更新');
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
        if (!$isAllowed) { http_response_code(403); exit('无权下载'); }

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
}
