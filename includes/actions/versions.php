<?php
/** 私有上传、完整校验与原子发布。旧版直传入口已移除。 */
if (!defined('APP_VERSION')) exit;

/** 名称是展示标签，不参与物理路径；不限制版本号格式或改写大小写。 */
function normalizeVersionName($raw) {
    if (!is_string($raw) || !mb_check_encoding($raw, 'UTF-8')) throw new DomainException('请输入有效的版本名称');
    if (preg_match('/[\x00-\x1F\x7F-\x{009F}\x{2028}\x{2029}]/u', $raw)) throw new DomainException('版本名称不能包含换行或控制字符');
    $name = preg_replace('/^[\x20\x{00A0}\x{1680}\x{2000}-\x{200A}\x{202F}\x{205F}\x{3000}\x{FEFF}]+|[\x20\x{00A0}\x{1680}\x{2000}-\x{200A}\x{202F}\x{205F}\x{3000}\x{FEFF}]+$/u', '', $raw);
    if ($name === '') throw new DomainException('请输入版本名称');
    if (mb_strlen($name, 'UTF-8') > 30) throw new DomainException('版本名称最多 30 字');
    return $name;
}

function versionOverwriteToken($version) {
    return hash_hmac('sha256', (int)$version['id'] . ':' . $version['storage_dir'], get_csrf_token());
}

switch ($action) {
    case 'version_check_name':
        if (!Auth::canManage()) jsonResponse(false, null, '无权操作');
        $itemId = (int)($_POST['item_id'] ?? 0);
        $name = normalizeVersionName($_POST['version_name'] ?? '');
        $item = Auth::getItem($itemId);
        if (!$item || $item['type'] !== 'project' || !Auth::canEditItem($item)) jsonResponse(false, null, '无权为此项目发版');
        $check = $db->prepare('SELECT * FROM versions WHERE item_id = ? AND version_name = ?');
        $check->execute([$itemId, $name]);
        $existing = $check->fetch();
        if ($existing && !Auth::canDeleteVersion($existing)) jsonResponse(false, null, '该版本由他人发布，您无权替换');
        jsonResponse(true, ['version_name' => $name, 'exists' => (bool)$existing,
            'overwrite_token' => $existing ? versionOverwriteToken($existing) : '']);
        break;

    case 'upload_chunk':
        if (!Auth::canManage()) jsonResponse(false, null, '无权操作');
        $uid = (int)Auth::getCurrentUser()['id'];
        $uploadId = trim($_POST['upload_id'] ?? '');
        $fileType = $_POST['file_type'] ?? '';
        $index = (int)($_POST['chunk_index'] ?? -1);
        $total = (int)($_POST['chunk_total'] ?? 0);
        if (!in_array($fileType, ['zip', 'rp'], true) || $total < 1 || $total > 1000 || $index < 0 || $index >= $total) {
            jsonResponse(false, null, '分片参数错误');
        }
        $tmp = $_FILES['chunk_data']['tmp_name'] ?? '';
        if (!$tmp || !is_uploaded_file($tmp) || filesize($tmp) < 1 || filesize($tmp) > 1024 * 1024) jsonResponse(false, null, '分片大小无效');
        Storage::storeChunk($uploadId, $fileType, $index, $total, $tmp, $uid);
        jsonResponse(true, ['chunk_index' => $index]);
        break;

    case 'version_publish':
        if (!Auth::canManage()) jsonResponse(false, null, '无权操作');
        @set_time_limit(300);
        $itemId = (int)($_POST['item_id'] ?? 0);
        $name = normalizeVersionName($_POST['version_name'] ?? '');
        $changelog = trim($_POST['changelog'] ?? '');
        if (mb_strlen($changelog, 'UTF-8') > 3000) jsonResponse(false, null, '更新说明不能超过 3000 个字符');
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
        if ($itemId < 1) jsonResponse(false, null, '请选择项目');
        if ($zipId === '') jsonResponse(false, null, '请选择 ZIP 压缩包');
        $item = Auth::getItem($itemId);
        if (!$item || $item['type'] !== 'project' || !Auth::canEditItem($item)) jsonResponse(false, null, '无权为此项目发版');

        $willSendItem = $notifyItem && !empty($item['webhook_url']);
        $willSendGlobal = $notifyGlobal && !empty(trim((string)Auth::getSetting('global_webhook_url', '')));
        if (($willSendItem || $willSendGlobal) && $changelog === '') {
            jsonResponse(false, null, '开启群通知需填写更新日志');
        }
        $uid = (int)Auth::getCurrentUser()['id'];
        $check = $db->prepare('SELECT * FROM versions WHERE item_id = ? AND version_name = ?');
        $check->execute([$itemId, $name]);
        $existing = $check->fetch();
        $check->closeCursor();
        if ($existing && !Auth::canDeleteVersion($existing)) jsonResponse(false, null, '该版本由他人发布，您无权覆盖');
        $overwriteToken = $_POST['overwrite_token'] ?? '';
        if (!is_string($overwriteToken)) jsonResponse(false, null, '替换确认无效，请重试');
        if ($existing && !hash_equals(versionOverwriteToken($existing), $overwriteToken)) {
            jsonResponse(false, ['requires_confirmation' => true], '同名版本已存在或已更新，请重新确认替换');
        }
        if (!$existing && $overwriteToken !== '') jsonResponse(false, null, '版本已变更，请刷新后重试');

        $storageDir = 'p' . $itemId . '/' . bin2hex(random_bytes(16));
        $stage = PROTOTYPES_PATH . '/' . $storageDir;
        $mergedZip = null;
        $mergedRp = null;
        $committed = false;
        $cleanupChunks = false;
        try {
            if (!mkdir($stage, 0700, true)) throw new DomainException('无法创建版本目录');
            $mergedZip = Storage::mergeChunks($zipId, 'zip', $uid);
            $cleanupChunks = true;
            $zip = ZipHandler::extractZip($mergedZip, $stage, '');
            if (!$zip['success']) throw new DomainException($zip['message']);
            $entry = ltrim($zip['entry_file'], '/');
            if ($entry === '') throw new DomainException('压缩包中没有可预览的 HTML 页面');
            $rp = '';
            if ($rpId !== '') {
                $mergedRp = Storage::mergeChunks($rpId, 'rp', $uid);
                if (!copy($mergedRp, $stage . '/prototype.rp')) throw new DomainException('底稿保存失败');
                $rp = 'prototype.rp';
            } elseif ($existing && !empty($existing['rp_file'])) {
                $oldRp = Storage::filePath($existing, $existing['rp_file']);
                if (!$oldRp || !copy($oldRp, $stage . '/prototype.rp')) throw new DomainException('原版本底稿无法保留');
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
            if (!$freshItem || !Auth::canEditItem($freshItem)) throw new DomainException('项目已变更，请刷新后重试');
            $check->execute([$itemId, $name]);
            $freshVersion = $check->fetch();
            $check->closeCursor();
            if (($existing ? (int)$existing['id'] : 0) !== ($freshVersion ? (int)$freshVersion['id'] : 0)
                || ($freshVersion && $freshVersion['storage_dir'] !== $existing['storage_dir'])) throw new DomainException('版本已更新，请刷新后重试');
            if ($freshVersion && !Auth::canDeleteVersion($freshVersion)) throw new DomainException('无权覆盖此版本');
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
            $payload = ['item_name' => $item['name'], 'version_name' => $name, 'is_overwrite' => (bool)$existing,
                'author' => Auth::getCurrentUser()['name'], 'content' => $changelog, 'link' => app_url('index.php#item=' . $itemId . '&vid=' . $verId)];
            foreach ($uniqueHooks as $hookUrl => $channels) {
                $res = Webhook::send($hookUrl, 'version_update', $payload);
                $isOk = !empty($res['success']);
                $msg = $res['message'] ?? ($isOk ? 'ok' : '发送失败');
                foreach ($channels as $chKey) {
                    $notifyResults[$chKey] = [
                        'success' => $isOk,
                        'message' => $msg
                    ];
                    if (!$isOk) {
                        $failedChannels[] = ($chKey === 'item') ? '项目群' : '评审群';
                    }
                }
            }
        }
        $publishedStmt = $db->prepare('SELECT * FROM versions WHERE id = ?');
        $publishedStmt->execute([$verId]);
        $msg = '发布成功';
        if (!empty($failedChannels)) {
            $msg = '发布成功（' . implode('、', $failedChannels) . '通知发送失败）';
        } elseif ($pendingCleanup) {
            $msg = '发布成功，文件清理待重试';
        }
        jsonResponse(true, [
            'id' => $verId,
            'version_id' => $verId,
            'version_name' => $name,
            'version' => Auth::versionForClient($publishedStmt->fetch()),
            'notify_results' => $notifyResults
        ], $msg);
        break;

    case 'version_update':
        if (!Auth::canManage()) jsonResponse(false, null, '无权操作');
        $id = (int)($_POST['id'] ?? 0);
        if ($id < 1) jsonResponse(false, null, '请指定版本');
        $name = normalizeVersionName($_POST['version_name'] ?? '');
        $changelog = trim($_POST['changelog'] ?? '');
        if (mb_strlen($changelog, 'UTF-8') > 3000) jsonResponse(false, null, '更新说明不能超过 3000 个字符');
        $db->beginTransaction();
        try {
            $db->exec('UPDATE versions SET id = id WHERE 0');
            $stmt = $db->prepare('SELECT * FROM versions WHERE id = ?');
            $stmt->execute([$id]);
            $version = $stmt->fetch();
            $stmt->closeCursor();
            if (!$version) throw new DomainException('版本不存在');
            $item = Auth::getItem($version['item_id']);
            if (!$item || !Auth::canEditItem($item)) throw new DomainException('无权操作此项目');
            if (defined('MCP_REQUEST')) McpAccess::guardWrite($version['item_id']);

            $check = $db->prepare('SELECT id FROM versions WHERE item_id = ? AND version_name = ? AND id != ?');
            $check->execute([$version['item_id'], $name, $id]);
            $hasDup = (bool)$check->fetch();
            $check->closeCursor();
            if ($hasDup) throw new DomainException('该项目已存在同名版本');

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
            ], '版本信息已更新');
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            if ($e instanceof DomainException) {
                throw $e;
            }
            error_log('version_update: ' . $e->getMessage());
            jsonResponse(false, null, '版本信息更新失败');
        }
        break;

    case 'version_delete':
    case 'version_set_default':
        if (!Auth::canManage()) jsonResponse(false, null, '无权操作');
        $id = (int)($_POST['id'] ?? 0);
        $db->beginTransaction();
        try {
            $db->exec('UPDATE versions SET id = id WHERE 0');
            $stmt = $db->prepare('SELECT * FROM versions WHERE id = ?');
            $stmt->execute([$id]);
            $version = $stmt->fetch();
            $stmt->closeCursor();
            if (!$version) throw new DomainException('版本不存在');
            $item = Auth::getItem($version['item_id']);
            if (!$item || !Auth::canEditItem($item)) throw new DomainException('无权操作此项目');
            if ($action === 'version_delete') {
                if (!Auth::canDeleteVersion($version)) throw new DomainException('只有版本发布者或管理员可删除');
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
        jsonResponse(true, null, $action === 'version_delete' ? ($pending ? '版本已删除，文件清理待重试' : '版本已删除') : '已设为默认版本');
        break;

    case 'version_update_rp':
        if (!Auth::canManage()) jsonResponse(false, null, '无权操作');
        @set_time_limit(300);
        $id = (int)($_POST['id'] ?? 0);
        $rpId = trim($_POST['rp_upload_id'] ?? '');
        if ($id < 1) jsonResponse(false, null, '请指定版本');
        if ($rpId === '') jsonResponse(false, null, '请选择 RP 底稿文件');
        $stmt = $db->prepare('SELECT * FROM versions WHERE id = ?');
        $stmt->execute([$id]);
        $version = $stmt->fetch();
        $stmt->closeCursor();
        if (!$version) jsonResponse(false, null, '版本不存在');
        if (!Auth::canDeleteVersion($version)) jsonResponse(false, null, '只有版本发布者或管理员可修改 RP 底稿');
        $item = Auth::getItem($version['item_id']);
        if (!$item || !Auth::canEditItem($item)) jsonResponse(false, null, '无权操作此项目');
        if (defined('MCP_REQUEST')) McpAccess::guardWrite($version['item_id']);

        $uid = (int)Auth::getCurrentUser()['id'];
        $stage = Storage::versionRoot($version);
        if (!is_dir($stage)) jsonResponse(false, null, '版本资产目录不存在');

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
            if (!copy($mergedRp, $tempDest)) throw new DomainException('底稿暂存失败');
            $rpSize = filesize($tempDest);

            $db->beginTransaction();
            $db->exec('UPDATE versions SET id = id WHERE 0');
            $stmtLock = $db->prepare('SELECT * FROM versions WHERE id = ?');
            $stmtLock->execute([$id]);
            $lockedVer = $stmtLock->fetch();
            $stmtLock->closeCursor();
            if (!$lockedVer) throw new DomainException('版本已被移除');
            if (!Auth::canDeleteVersion($lockedVer) || !Auth::canEditItem(Auth::getItem($lockedVer['item_id']))) throw new DomainException('无权修改此版本底稿');
            if ($lockedVer['storage_dir'] !== $version['storage_dir']) throw new DomainException('版本已更新，请刷新后重试');

            if (is_dir($destFile)) {
                throw new DomainException('底稿目标路径异常');
            }
            if (is_file($destFile)) {
                $backupDest = $destFile . '.bak.' . bin2hex(random_bytes(6));
                if (!@rename($destFile, $backupDest)) throw new DomainException('旧底稿归档失败');
            }

            if (!@rename($tempDest, $destFile)) {
                if ($backupDest && file_exists($backupDest)) {
                    if (!@rename($backupDest, $destFile)) {
                        $preserveBackupOnFailure = true;
                    } else {
                        $backupDest = null;
                    }
                }
                throw new DomainException('底稿文件写入失败');
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
        ], 'RP 底稿已成功保存');
        break;

    case 'version_remove_rp':
        if (!Auth::canManage()) jsonResponse(false, null, '无权操作');
        $id = (int)($_POST['id'] ?? 0);
        if ($id < 1) jsonResponse(false, null, '请指定版本');
        $stmt = $db->prepare('SELECT * FROM versions WHERE id = ?');
        $stmt->execute([$id]);
        $version = $stmt->fetch();
        $stmt->closeCursor();
        if (!$version) jsonResponse(false, null, '版本不存在');
        if (!Auth::canDeleteVersion($version)) jsonResponse(false, null, '只有版本发布者或管理员可移除 RP 底稿');
        $item = Auth::getItem($version['item_id']);
        if (!$item || !Auth::canEditItem($item)) jsonResponse(false, null, '无权操作此项目');
        if (defined('MCP_REQUEST')) McpAccess::guardWrite($version['item_id']);

        $db->beginTransaction();
        $oldRp = '';
        try {
            $db->exec('UPDATE versions SET id = id WHERE 0');
            $stmtLock = $db->prepare('SELECT * FROM versions WHERE id = ?');
            $stmtLock->execute([$id]);
            $lockedVer = $stmtLock->fetch();
            $stmtLock->closeCursor();
            if (!$lockedVer) throw new DomainException('版本已被移除');
            if (!Auth::canDeleteVersion($lockedVer) || !Auth::canEditItem(Auth::getItem($lockedVer['item_id']))) throw new DomainException('无权移除此版本底稿');
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
        ], 'RP 底稿已移除');
        break;
}
