<?php
/** 私有上传、完整校验与原子发布。旧版直传入口已移除。 */
if (!defined('APP_VERSION')) exit;

/** 名称是展示标签，不参与物理路径；不限制格式并保留原始大小写展示，同项目内查重不区分大小写。 */
function normalizeVersionName($raw) {
    if (!is_string($raw) || !mb_check_encoding($raw, 'UTF-8')) throw new DomainException(t('api.ver.invalid_name'));
    if (preg_match('/[\x00-\x1F\x7F-\x{009F}\x{2028}\x{2029}]/u', $raw)) throw new DomainException(t('api.ver.no_ctrl_chars'));
    $name = preg_replace('/^[\x20\x{00A0}\x{1680}\x{2000}-\x{200A}\x{202F}\x{205F}\x{3000}\x{FEFF}]+|[\x20\x{00A0}\x{1680}\x{2000}-\x{200A}\x{202F}\x{205F}\x{3000}\x{FEFF}]+$/u', '', $raw);
    if ($name === '') throw new DomainException(t('api.ver.enter_name'));
    if (mb_strlen($name, 'UTF-8') > 30) throw new DomainException(t('api.ver.name_len_30'));
    return $name;
}

/** 忽略大小写查找项目内同名版本；若历史旧库存在多条仅大小写不同的记录，优先命中精确匹配。 */
function findExistingVersionByName($db, $itemId, $name, $excludeId = 0) {
    $sql = 'SELECT * FROM versions WHERE item_id = ? AND version_name = ? COLLATE NOCASE';
    $params = [(int)$itemId, $name];
    if ((int)$excludeId > 0) {
        $sql .= ' AND id != ?';
        $params[] = (int)$excludeId;
    }
    $sql .= ' ORDER BY (version_name = ?) DESC, is_default DESC, id DESC LIMIT 1';
    $params[] = $name;
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch();
    $stmt->closeCursor();
    return $row ?: null;
}

function versionOverwriteToken($version) {
    return hash_hmac('sha256', (int)$version['id'] . ':' . $version['storage_dir'], get_csrf_token());
}

switch ($action) {
    case 'version_check_name':
        if (!Auth::canManage()) jsonResponse(false, null, t('api.no_perm'));
        $itemId = (int)($_POST['item_id'] ?? 0);
        $name = normalizeVersionName($_POST['version_name'] ?? '');
        $item = Auth::getItem($itemId);
        if (!$item || $item['type'] !== 'project' || !Auth::canEditItem($item)) jsonResponse(false, null, t('api.ver.no_publish_perm'));
        $existing = findExistingVersionByName($db, $itemId, $name);
        if ($existing && !Auth::canDeleteVersion($existing)) jsonResponse(false, null, t('api.ver.no_replace_other'));
        jsonResponse(true, [
            'version_name' => $existing ? $existing['version_name'] : $name,
            'exists' => (bool)$existing,
            'overwrite_token' => $existing ? versionOverwriteToken($existing) : ''
        ]);
        break;

    case 'upload_chunk':
        if (!Auth::canManage()) jsonResponse(false, null, t('api.no_perm'));
        $uid = (int)Auth::getCurrentUser()['id'];
        $uploadId = trim($_POST['upload_id'] ?? '');
        $fileType = $_POST['file_type'] ?? '';
        $index = (int)($_POST['chunk_index'] ?? -1);
        $total = (int)($_POST['chunk_total'] ?? 0);
        if (!in_array($fileType, ['zip', 'rp'], true) || $total < 1 || $total > 1000 || $index < 0 || $index >= $total) {
            jsonResponse(false, null, t('api.ver.chunk_param_err'));
        }
        $tmp = $_FILES['chunk_data']['tmp_name'] ?? '';
        if (!$tmp || !is_uploaded_file($tmp) || filesize($tmp) < 1 || filesize($tmp) > 1024 * 1024) jsonResponse(false, null, t('api.ver.chunk_size_invalid'));
        Storage::storeChunk($uploadId, $fileType, $index, $total, $tmp, $uid);
        jsonResponse(true, ['chunk_index' => $index]);
        break;

    case 'version_publish':
        if (!Auth::canManage()) jsonResponse(false, null, t('api.no_perm'));
        @set_time_limit(300);
        $itemId = (int)($_POST['item_id'] ?? 0);
        $name = normalizeVersionName($_POST['version_name'] ?? '');
        $changelog = trim($_POST['changelog'] ?? '');
        if (mb_strlen($changelog, 'UTF-8') > 3000) jsonResponse(false, null, t('api.ver.changelog_len_3000'));
        $hasNotifyItem = isset($_POST['notify_item']);
        $hasNotifyGlobal = isset($_POST['notify_global']);
        $hasNotifyWebhook = isset($_POST['notify_webhook']);
        $hasExplicitNotify = $hasNotifyItem || $hasNotifyGlobal || $hasNotifyWebhook;

        if ($hasExplicitNotify) {
            $legacyNotify = !empty($_POST['notify_webhook']);
            $notifyItem = $hasNotifyItem ? !empty($_POST['notify_item']) : $legacyNotify;
            $notifyGlobal = $hasNotifyGlobal ? !empty($_POST['notify_global']) : $legacyNotify;
        } else {
            // 未传通知参数时，按照产品约定默认通知已配置的目标群，保持与网页端默认勾选一致
            $notifyItem = true;
            $notifyGlobal = true;
        }

        $zipId = trim($_POST['zip_upload_id'] ?? '');
        $rpId = trim($_POST['rp_upload_id'] ?? '');
        if ($itemId < 1) jsonResponse(false, null, t('api.items.select_item'));
        if ($zipId === '') jsonResponse(false, null, t('api.ver.select_zip'));
        $item = Auth::getItem($itemId);
        if (!$item || $item['type'] !== 'project' || !Auth::canEditItem($item)) jsonResponse(false, null, t('api.ver.no_publish_perm'));

        $willSendItem = $notifyItem && !empty($item['webhook_url']);
        $willSendGlobal = $notifyGlobal && !empty(trim((string)Auth::getSetting('global_webhook_url', '')));
        if (($willSendItem || $willSendGlobal) && $changelog === '') {
            jsonResponse(false, null, t('admin.upload.notify_needs_log'));
        }
        $uid = (int)Auth::getCurrentUser()['id'];
        $existing = findExistingVersionByName($db, $itemId, $name);
        if ($existing && !Auth::canDeleteVersion($existing)) jsonResponse(false, null, t('api.ver.no_overwrite_other'));
        $overwriteToken = $_POST['overwrite_token'] ?? '';
        if (!is_string($overwriteToken)) jsonResponse(false, null, t('api.ver.overwrite_token_invalid'));
        if ($existing && !hash_equals(versionOverwriteToken($existing), $overwriteToken)) {
            jsonResponse(false, ['requires_confirmation' => true], t('api.ver.overwrite_reconfirm'));
        }
        if (!$existing && $overwriteToken !== '') jsonResponse(false, null, t('api.ver.changed_refresh'));
        $effectiveName = $existing ? $existing['version_name'] : $name;

        $storageDir = 'p' . $itemId . '/' . bin2hex(random_bytes(16));
        $stage = PROTOTYPES_PATH . '/' . $storageDir;
        $mergedZip = null;
        $mergedRp = null;
        $committed = false;
        $cleanupChunks = false;
        try {
            if (!mkdir($stage, 0700, true)) throw new DomainException(t('api.ver.mkdir_fail'));
            $mergedZip = Storage::mergeChunks($zipId, 'zip', $uid);
            $cleanupChunks = true;
            $zip = ZipHandler::extractZip($mergedZip, $stage, '');
            if (!$zip['success']) throw new DomainException($zip['message']);
            $entry = ltrim($zip['entry_file'], '/');
            if ($entry === '') throw new DomainException(t('api.ver.no_html_in_zip'));
            $rp = '';
            if ($rpId !== '') {
                $mergedRp = Storage::mergeChunks($rpId, 'rp', $uid);
                if (!copy($mergedRp, $stage . '/prototype.rp')) throw new DomainException(t('api.ver.rp_save_fail'));
                $rp = 'prototype.rp';
            } elseif ($existing && !empty($existing['rp_file'])) {
                $oldRp = Storage::filePath($existing, $existing['rp_file']);
                if (!$oldRp || !copy($oldRp, $stage . '/prototype.rp')) throw new DomainException(t('api.ver.rp_keep_fail'));
                $rp = 'prototype.rp';
            }
            $rpSize = $rp !== '' ? filesize($stage . '/' . $rp) : 0;
            $fileSize = 0;
            foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($stage, FilesystemIterator::SKIP_DOTS)) as $file) {
                if ($file->isFile()) $fileSize += $file->getSize();
            }
            $fileSize -= $rpSize;
            $db->beginTransaction();
            // 获取写锁后再次验证对象与版本，防止发布期间删除/交接造成越权。
            $db->exec('UPDATE versions SET id = id WHERE 0');
            if (defined('MCP_REQUEST')) McpAccess::guardWrite($itemId);
            $freshItem = Auth::getItem($itemId);
            if (!$freshItem || !Auth::canEditItem($freshItem)) throw new DomainException(t('api.ver.item_changed_refresh'));
            $freshVersion = findExistingVersionByName($db, $itemId, $name);
            if (($existing ? (int)$existing['id'] : 0) !== ($freshVersion ? (int)$freshVersion['id'] : 0)
                || ($freshVersion && $freshVersion['storage_dir'] !== $existing['storage_dir'])) throw new DomainException(t('api.ver.updated_refresh'));
            if ($freshVersion && !Auth::canDeleteVersion($freshVersion)) throw new DomainException(t('api.ver.no_overwrite_perm'));
            $hasDefault = $db->prepare('SELECT 1 FROM versions WHERE item_id = ? AND is_default = 1 LIMIT 1');
            $hasDefault->execute([$itemId]);
            $hasDefaultVal = (bool)$hasDefault->fetchColumn();
            $hasDefault->closeCursor();
            $makeDefault = !empty($_POST['is_default']) || ($existing && (int)$existing['is_default'] === 1) || !$hasDefaultVal;
            if ($makeDefault) $db->prepare('UPDATE versions SET is_default = 0 WHERE item_id = ?')->execute([$itemId]);
            if ($existing) {
                $db->prepare('UPDATE versions SET entry_file = ?, rp_file = ?, storage_dir = ?, file_size = ?, rp_size = ?, changelog = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                    ->execute([$entry, $rp, $storageDir, $fileSize, $rpSize, $changelog, $makeDefault ? 1 : 0, $existing['id']]);
                $verId = (int)$existing['id'];
                Storage::queueRemoval($db, $existing);
            } else {
                $author = Auth::getCurrentUser()['name'];
                $db->prepare('INSERT INTO versions (item_id, version_name, entry_file, rp_file, storage_dir, file_size, rp_size, changelog, is_default, created_by, author_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                    ->execute([$itemId, $name, $entry, $rp, $storageDir, $fileSize, $rpSize, $changelog, $makeDefault ? 1 : 0, $uid, $author]);
                $verId = (int)$db->lastInsertId();
            }
            $db->commit();
            $committed = true;
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            throw $e;
        } finally {
            if ($mergedZip) @unlink($mergedZip);
            if ($mergedRp) @unlink($mergedRp);
            if (!$committed) Storage::removeTree($stage, PROTOTYPES_PATH);
            if ($committed || $cleanupChunks) {
                Storage::removeTree(Storage::chunkDir($zipId, $uid), CHUNKS_PATH);
                if ($rpId !== '') Storage::removeTree(Storage::chunkDir($rpId, $uid), CHUNKS_PATH);
            }
        }
        $pendingCleanup = Storage::collectGarbage($db);
        $uniqueHooks = [];
        if ($notifyItem && !empty($item['webhook_url'])) {
            $u = trim((string)$item['webhook_url']);
            if ($u !== '') $uniqueHooks[$u][] = 'item';
        }
        if ($notifyGlobal) {
            $gHook = trim((string)Auth::getSetting('global_webhook_url', ''));
            if ($gHook !== '') {
                $uniqueHooks[$gHook][] = 'global';
            }
        }

        $notifyResults = [];
        $failedChannels = [];
        if (!empty($uniqueHooks)) {
            $payload = ['item_name' => $item['name'], 'version_name' => $effectiveName, 'is_overwrite' => (bool)$existing,
                'author' => Auth::getCurrentUser()['name'], 'content' => $changelog, 'link' => app_url('index.php#item=' . $itemId . '&vid=' . $verId)];
            foreach ($uniqueHooks as $hookUrl => $channels) {
                $res = Webhook::send($hookUrl, 'version_update', $payload);
                $isOk = !empty($res['success']);
                $msg = $res['message'] ?? ($isOk ? 'ok' : t('api.sys.webhook_push_fail'));
                foreach ($channels as $chKey) {
                    $notifyResults[$chKey] = [
                        'success' => $isOk,
                        'message' => $msg
                    ];
                    if (!$isOk) {
                        $failedChannels[] = ($chKey === 'item') ? t('api.ver.ch_item') : t('api.ver.ch_global');
                    }
                }
            }
        }
        $publishedStmt = $db->prepare('SELECT * FROM versions WHERE id = ?');
        $publishedStmt->execute([$verId]);
        $msg = t('api.ver.published_ok');
        if (!empty($failedChannels)) {
            $sep = I18n::getLocale() === 'en' ? ', ' : '、';
            $msg = t('api.ver.published_notify_fail', ['channels' => implode($sep, $failedChannels)]);
        } elseif ($pendingCleanup) {
            $msg = t('api.ver.published_cleanup_retry');
        }
        jsonResponse(true, [
            'id' => $verId,
            'version_id' => $verId,
            'version_name' => $effectiveName,
            'version' => Auth::versionForClient($publishedStmt->fetch()),
            'notify_results' => $notifyResults
        ], $msg);
        break;

    case 'version_update':
        if (!Auth::canManage()) jsonResponse(false, null, t('api.no_perm'));
        $id = (int)($_POST['id'] ?? 0);
        if ($id < 1) jsonResponse(false, null, t('api.ver.specify_ver'));
        $name = normalizeVersionName($_POST['version_name'] ?? '');
        $changelog = trim($_POST['changelog'] ?? '');
        if (mb_strlen($changelog, 'UTF-8') > 3000) jsonResponse(false, null, t('api.ver.changelog_len_3000'));
        $db->beginTransaction();
        try {
            $db->exec('UPDATE versions SET id = id WHERE 0');
            $stmt = $db->prepare('SELECT * FROM versions WHERE id = ?');
            $stmt->execute([$id]);
            $version = $stmt->fetch();
            $stmt->closeCursor();
            if (!$version) throw new DomainException(t('api.ver.not_found'));
            $item = Auth::getItem($version['item_id']);
            if (!$item || !Auth::canEditItem($item)) throw new DomainException(t('api.ver.no_item_op_perm'));
            if (defined('MCP_REQUEST')) McpAccess::guardWrite($version['item_id']);

            $hasDup = (bool)findExistingVersionByName($db, $version['item_id'], $name, $id);
            if ($hasDup) throw new DomainException(t('api.ver.duplicate_name'));

            $db->prepare('UPDATE versions SET version_name = ?, changelog = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                ->execute([$name, $changelog, $id]);

            $stmt->execute([$id]);
            $freshVersion = $stmt->fetch();
            $stmt->closeCursor();
            $db->commit();
            jsonResponse(true, [
                'id' => $id,
                'item_id' => (int)$version['item_id'],
                'version_name' => $name,
                'changelog' => $changelog,
                'version' => Auth::versionForClient($freshVersion)
            ], t('api.ver.updated'));
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            if ($e instanceof DomainException) {
                throw $e;
            }
            error_log('version_update: ' . $e->getMessage());
            jsonResponse(false, null, t('api.ver.update_fail'));
        }
        break;

    case 'version_delete':
    case 'version_set_default':
        if (!Auth::canManage()) jsonResponse(false, null, t('api.no_perm'));
        $id = (int)($_POST['id'] ?? 0);
        $db->beginTransaction();
        try {
            $db->exec('UPDATE versions SET id = id WHERE 0');
            $stmt = $db->prepare('SELECT * FROM versions WHERE id = ?');
            $stmt->execute([$id]);
            $version = $stmt->fetch();
            $stmt->closeCursor();
            if (!$version) throw new DomainException(t('api.ver.not_found'));
            $item = Auth::getItem($version['item_id']);
            if (!$item || !Auth::canEditItem($item)) throw new DomainException(t('api.ver.no_item_op_perm'));
            if ($action === 'version_delete') {
                if (!Auth::canDeleteVersion($version)) throw new DomainException(t('api.ver.delete_perm_only'));
                Storage::queueRemoval($db, $version);
                Storage::deleteAnnotations($db, 'ver_id', $id);
                $db->prepare('DELETE FROM share_codes WHERE ver_id = ?')->execute([$id]);
                $db->prepare('DELETE FROM versions WHERE id = ?')->execute([$id]);
                if ((int)$version['is_default'] === 1) {
                    $db->prepare('UPDATE versions SET is_default = 1 WHERE id = (SELECT id FROM versions WHERE item_id = ? ORDER BY id DESC LIMIT 1)')->execute([$version['item_id']]);
                }
            } else {
                $db->prepare('UPDATE versions SET is_default = 0 WHERE item_id = ?')->execute([$version['item_id']]);
                $db->prepare('UPDATE versions SET is_default = 1 WHERE id = ?')->execute([$id]);
            }
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            throw $e;
        }
        $pending = Storage::collectGarbage($db);
        jsonResponse(true, null, $action === 'version_delete' ? ($pending ? t('api.ver.deleted_retry') : t('api.ver.deleted')) : t('api.ver.set_default'));
        break;

    case 'version_update_rp':
        if (!Auth::canManage()) jsonResponse(false, null, t('api.no_perm'));
        @set_time_limit(300);
        $id = (int)($_POST['id'] ?? 0);
        $rpId = trim($_POST['rp_upload_id'] ?? '');
        if ($id < 1) jsonResponse(false, null, t('api.ver.specify_ver'));
        if ($rpId === '') jsonResponse(false, null, t('api.ver.select_rp'));
        $stmt = $db->prepare('SELECT * FROM versions WHERE id = ?');
        $stmt->execute([$id]);
        $version = $stmt->fetch();
        $stmt->closeCursor();
        if (!$version) jsonResponse(false, null, t('api.ver.not_found'));
        if (!Auth::canDeleteVersion($version)) jsonResponse(false, null, t('api.ver.rp_edit_perm_only'));
        $item = Auth::getItem($version['item_id']);
        if (!$item || !Auth::canEditItem($item)) jsonResponse(false, null, t('api.ver.no_item_op_perm'));
        if (defined('MCP_REQUEST')) McpAccess::guardWrite($version['item_id']);

        $uid = (int)Auth::getCurrentUser()['id'];
        $stage = Storage::versionRoot($version);
        if (!is_dir($stage)) jsonResponse(false, null, t('api.ver.asset_dir_missing'));

        $mergedRp = null;
        $tempDest = null;
        $backupDest = null;
        $destReplaced = false;
        $preserveBackupOnFailure = false;
        $cleanupChunks = false;
        try {
            $mergedRp = Storage::mergeChunks($rpId, 'rp', $uid);
            $cleanupChunks = true;
            $destFile = $stage . '/prototype.rp';
            $tempDest = $stage . '/prototype.rp.tmp.' . bin2hex(random_bytes(6));
            if (!copy($mergedRp, $tempDest)) throw new DomainException(t('api.ver.rp_stage_fail'));
            $rpSize = filesize($tempDest);

            $db->beginTransaction();
            $db->exec('UPDATE versions SET id = id WHERE 0');
            $stmtLock = $db->prepare('SELECT * FROM versions WHERE id = ?');
            $stmtLock->execute([$id]);
            $lockedVer = $stmtLock->fetch();
            $stmtLock->closeCursor();
            if (!$lockedVer) throw new DomainException(t('api.ver.removed'));
            if (!Auth::canDeleteVersion($lockedVer) || !Auth::canEditItem(Auth::getItem($lockedVer['item_id']))) throw new DomainException(t('api.ver.no_rp_mod_perm'));
            if ($lockedVer['storage_dir'] !== $version['storage_dir']) throw new DomainException(t('api.ver.updated_refresh'));

            if (is_dir($destFile)) {
                throw new DomainException(t('api.ver.rp_path_err'));
            }
            if (is_file($destFile)) {
                $backupDest = $destFile . '.bak.' . bin2hex(random_bytes(6));
                if (!@rename($destFile, $backupDest)) throw new DomainException(t('api.ver.rp_backup_fail'));
            }

            if (!@rename($tempDest, $destFile)) {
                if ($backupDest && file_exists($backupDest)) {
                    if (!@rename($backupDest, $destFile)) {
                        $preserveBackupOnFailure = true;
                    } else {
                        $backupDest = null;
                    }
                }
                throw new DomainException(t('api.ver.rp_write_fail'));
            }
            $destReplaced = true;

            $db->prepare('UPDATE versions SET rp_file = ?, rp_size = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                ->execute(['prototype.rp', $rpSize, $id]);
            $db->commit();

            if ($backupDest && file_exists($backupDest)) @unlink($backupDest);
            $backupDest = null;
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            if ($destReplaced) {
                if ($backupDest && file_exists($backupDest)) {
                    if (!@rename($backupDest, $destFile)) {
                        $preserveBackupOnFailure = true;
                    } else {
                        $backupDest = null;
                    }
                } else {
                    @unlink($destFile);
                }
            }
            throw $e;
        } finally {
            if ($tempDest && file_exists($tempDest)) @unlink($tempDest);
            if ($backupDest && file_exists($backupDest) && !$preserveBackupOnFailure) @unlink($backupDest);
            if ($mergedRp && file_exists($mergedRp)) @unlink($mergedRp);
            if ($cleanupChunks) Storage::removeTree(Storage::chunkDir($rpId, $uid), CHUNKS_PATH);
        }
        $freshStmt = $db->prepare('SELECT * FROM versions WHERE id = ?');
        $freshStmt->execute([$id]);
        $freshVersion = Auth::versionForClient($freshStmt->fetch());
        jsonResponse(true, [
            'id' => $id,
            'item_id' => (int)$version['item_id'],
            'version_name' => $version['version_name'],
            'rp_file' => 'prototype.rp',
            'rp_size' => $rpSize,
            'updated_at' => $freshVersion['updated_at'] ?? '',
            'version' => $freshVersion
        ], t('api.ver.rp_saved'));
        break;

    case 'version_remove_rp':
        if (!Auth::canManage()) jsonResponse(false, null, t('api.no_perm'));
        $id = (int)($_POST['id'] ?? 0);
        if ($id < 1) jsonResponse(false, null, t('api.ver.specify_ver'));
        $stmt = $db->prepare('SELECT * FROM versions WHERE id = ?');
        $stmt->execute([$id]);
        $version = $stmt->fetch();
        $stmt->closeCursor();
        if (!$version) jsonResponse(false, null, t('api.ver.not_found'));
        if (!Auth::canDeleteVersion($version)) jsonResponse(false, null, t('api.ver.rp_remove_perm_only'));
        $item = Auth::getItem($version['item_id']);
        if (!$item || !Auth::canEditItem($item)) jsonResponse(false, null, t('api.ver.no_item_op_perm'));
        if (defined('MCP_REQUEST')) McpAccess::guardWrite($version['item_id']);

        $db->beginTransaction();
        $oldRp = '';
        try {
            $db->exec('UPDATE versions SET id = id WHERE 0');
            $stmtLock = $db->prepare('SELECT * FROM versions WHERE id = ?');
            $stmtLock->execute([$id]);
            $lockedVer = $stmtLock->fetch();
            $stmtLock->closeCursor();
            if (!$lockedVer) throw new DomainException(t('api.ver.removed'));
            if (!Auth::canDeleteVersion($lockedVer) || !Auth::canEditItem(Auth::getItem($lockedVer['item_id']))) throw new DomainException(t('api.ver.no_rp_remove_perm'));
            $version = $lockedVer;
            $oldRp = $lockedVer['rp_file'] ?? '';

            $db->prepare('UPDATE versions SET rp_file = ?, rp_size = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                ->execute(['', $id]);
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            throw $e;
        }

        // 数据库事务成功提交后，安全清理磁盘底稿
        if (!empty($oldRp)) {
            $filePath = Storage::filePath($version, $oldRp);
            if ($filePath && file_exists($filePath)) @unlink($filePath);
        }

        $freshStmt = $db->prepare('SELECT * FROM versions WHERE id = ?');
        $freshStmt->execute([$id]);
        $freshVersion = Auth::versionForClient($freshStmt->fetch());
        jsonResponse(true, [
            'id' => $id,
            'item_id' => (int)$version['item_id'],
            'version_name' => $version['version_name'],
            'rp_file' => '',
            'rp_size' => 0,
            'updated_at' => $freshVersion['updated_at'] ?? '',
            'version' => $freshVersion
        ], t('api.ver.rp_removed'));
        break;
}
