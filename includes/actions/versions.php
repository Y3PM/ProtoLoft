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

    case 'blob_check':
        if (!Auth::canManage()) jsonResponse(false, null, t('api.no_perm'));
        $rawList = json_decode($_POST['hashes'] ?? '[]', true);
        if (!is_array($rawList)) jsonResponse(false, null, t('api.ver.chunk_param_err'));
        $hashes = [];
        foreach ($rawList as $h) {
            if (Storage::validHash($h)) $hashes[$h] = true;
            if (count($hashes) >= 30000) break;
        }
        $existing = [];
        $hashKeys = array_keys($hashes);
        foreach (array_chunk($hashKeys, 400) as $batch) {
            $placeholders = implode(',', array_fill(0, count($batch), '?'));
            $stmt = $db->prepare('SELECT raw_hash, stored_hash FROM blobs WHERE raw_hash IN (' . $placeholders . ')');
            $stmt->execute($batch);
            while ($row = $stmt->fetch()) {
                if (Storage::hasBlob($row['stored_hash'])) {
                    $existing[] = $row['raw_hash'];
                }
            }
            $stmt->closeCursor();
        }
        jsonResponse(true, ['existing' => $existing]);
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
        $rpHash = trim($_POST['rp_hash'] ?? '');
        $manifestRaw = $_POST['blob_manifest'] ?? '';
        $manifestItems = [];
        if (is_string($manifestRaw) && trim($manifestRaw) !== '') {
            $decodedManifest = json_decode($manifestRaw, true);
            if (!is_array($decodedManifest)) jsonResponse(false, null, t('api.ver.chunk_param_err'));
            $manifestItems = $decodedManifest;
        }
        if ($itemId < 1) jsonResponse(false, null, t('api.items.select_item'));
        if ($zipId === '' && empty($manifestItems)) jsonResponse(false, null, t('api.ver.select_zip'));
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

        $revisionId = 'p' . $itemId . '/' . bin2hex(random_bytes(16));
        $stage = CHUNKS_PATH . '/stage_' . bin2hex(random_bytes(12));
        $mergedZip = null;
        $mergedRp = null;
        $committed = false;
        $cleanupChunks = false;
        try {
            $fileEntries = [];
            $newBlobs = [];
            $totalSize = 0;

            if (!empty($manifestItems)) {
                if (count($manifestItems) > 30000) throw new DomainException(t('api.zip.too_many_files'));
                $wantedHashes = [];
                foreach ($manifestItems as $mItem) {
                    if (!is_array($mItem)) throw new DomainException(t('api.ver.chunk_param_err'));
                    $mPath = str_replace('\\', '/', (string)($mItem['path'] ?? ''));
                    $mHash = (string)($mItem['hash'] ?? '');
                    if (substr($mPath, -1) === '/' || strtolower($mPath) === 'prototype.rp') continue;
                    $unsafe = ZipHandler::validateRelativePath($mPath);
                    if ($unsafe !== null) throw new DomainException($unsafe);
                    if (!Storage::validHash($mHash)) throw new DomainException(t('api.ver.chunk_param_err'));
                    $wantedHashes[$mHash] = true;
                }
                $blobMetaMap = [];
                foreach (array_chunk(array_keys($wantedHashes), 400) as $batch) {
                    $placeholders = implode(',', array_fill(0, count($batch), '?'));
                    $bStmt = $db->prepare('SELECT raw_hash, stored_hash, stored_size FROM blobs WHERE raw_hash IN (' . $placeholders . ')');
                    $bStmt->execute($batch);
                    while ($bRow = $bStmt->fetch()) {
                        $blobMetaMap[$bRow['raw_hash']] = $bRow;
                    }
                    $bStmt->closeCursor();
                }
                foreach ($manifestItems as $mItem) {
                    $mPath = ltrim(str_replace('\\', '/', (string)($mItem['path'] ?? '')), '/');
                    if ($mPath === '' || substr($mPath, -1) === '/' || strtolower($mPath) === 'prototype.rp') continue;
                    $mHash = (string)$mItem['hash'];
                    $bInfo = $blobMetaMap[$mHash] ?? null;
                    if (!$bInfo || !Storage::hasBlob($bInfo['stored_hash'])) {
                        throw new DomainException(t('api.ver.chunk_missing'));
                    }
                    $fSize = (int)$bInfo['stored_size'];
                    $totalSize += $fSize;
                    if ($totalSize > 500 * 1024 * 1024) throw new DomainException(t('api.zip.too_large'));
                    $fileEntries[$mPath] = [
                        'rel_path' => $mPath,
                        'raw_hash' => $mHash,
                        'stored_hash' => $bInfo['stored_hash'],
                        'file_size' => $fSize
                    ];
                }
            }

            if ($zipId !== '') {
                if (!mkdir($stage, 0700, true)) throw new DomainException(t('api.ver.mkdir_fail'));
                $mergedZip = Storage::mergeChunks($zipId, 'zip', $uid);
                $cleanupChunks = true;
                $zip = ZipHandler::extractZip($mergedZip, $stage, '');
                if (!$zip['success']) throw new DomainException($zip['message']);

                // 注意：extractZip 已先做了 sanitizeDirectory，若需保留 raw_hash 则对原包条目计算 raw_hash；
                // 为保证净化后的文件哈希准确，先在解压阶段分别记录 raw_hash -> stored_hash。
                $rawHashesFromZip = [];
                if (class_exists('ZipArchive')) {
                    $za = new ZipArchive();
                    if ($za->open($mergedZip) === true) {
                        for ($zi = 0; $zi < $za->numFiles; $zi++) {
                            $zName = ltrim(str_replace('\\', '/', (string)$za->getNameIndex($zi)), '/');
                            if ($zName === '' || substr($zName, -1) === '/') continue;
                            $zStream = $za->getStream($za->getNameIndex($zi));
                            if ($zStream) {
                                $ctx = hash_init('sha256');
                                $zLen = 0;
                                while (!feof($zStream)) {
                                    $buf = fread($zStream, 65536);
                                    if ($buf === false) break;
                                    $zLen += strlen($buf);
                                    hash_update($ctx, $buf);
                                }
                                fclose($zStream);
                                $rawHashesFromZip[$zName] = ['hash' => hash_final($ctx), 'size' => $zLen];
                            }
                        }
                        $za->close();
                    }
                }

                $stageLen = strlen(rtrim($stage, '/\\')) + 1;
                $iter = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($stage, FilesystemIterator::SKIP_DOTS));
                foreach ($iter as $file) {
                    if (!$file->isFile()) continue;
                    $fullPath = $file->getPathname();
                    $relPath = str_replace('\\', '/', substr($fullPath, $stageLen));
                    if ($relPath === '' || strtolower($relPath) === 'prototype.rp') continue;
                    $storedHash = hash_file('sha256', $fullPath);
                    $storedSize = (int)$file->getSize();
                    $rawInfo = $rawHashesFromZip[$relPath] ?? ['hash' => $storedHash, 'size' => $storedSize];
                    $rawHash = $rawInfo['hash'];
                    $rawSize = (int)$rawInfo['size'];
                    Storage::storeBlobFromFile($fullPath, $storedHash);
                    $newBlobs[$rawHash] = [
                        'raw_hash' => $rawHash,
                        'stored_hash' => $storedHash,
                        'raw_size' => $rawSize,
                        'stored_size' => $storedSize
                    ];
                    if (isset($fileEntries[$relPath])) {
                        $totalSize -= (int)$fileEntries[$relPath]['file_size'];
                    }
                    $totalSize += $storedSize;
                    if ($totalSize > 500 * 1024 * 1024) throw new DomainException(t('api.zip.too_large'));
                    $fileEntries[$relPath] = [
                        'rel_path' => $relPath,
                        'raw_hash' => $rawHash,
                        'stored_hash' => $storedHash,
                        'file_size' => $storedSize
                    ];
                }
            }

            if (empty($fileEntries)) throw new DomainException(t('api.zip.empty'));
            if (count($fileEntries) > 30000) throw new DomainException(t('api.zip.too_many_files'));
            $entry = ltrim(ZipHandler::detectEntryFileFromPaths(array_keys($fileEntries)), '/');
            if ($entry === '') throw new DomainException(t('api.ver.no_html_in_zip'));
            $fileSize = $totalSize;

            $rp = '';
            $rpSize = 0;
            $rpEntry = null;
            if ($rpHash !== '') {
                if (!Storage::validHash($rpHash)) throw new DomainException(t('api.ver.chunk_param_err'));
                $rpRow = DB::row('SELECT stored_hash, stored_size FROM blobs WHERE raw_hash = ? LIMIT 1', [$rpHash]);
                if (!$rpRow || !Storage::hasBlob($rpRow['stored_hash'])) throw new DomainException(t('api.ver.chunk_missing'));
                $rp = 'prototype.rp';
                $rpSize = (int)$rpRow['stored_size'];
                $rpEntry = [
                    'rel_path' => 'prototype.rp',
                    'raw_hash' => $rpHash,
                    'stored_hash' => $rpRow['stored_hash'],
                    'file_size' => $rpSize
                ];
            } elseif ($rpId !== '') {
                $mergedRp = Storage::mergeChunks($rpId, 'rp', $uid);
                $cleanupChunks = true;
                $rpRawHash = hash_file('sha256', $mergedRp);
                $rpSize = (int)filesize($mergedRp);
                Storage::storeBlobFromFile($mergedRp, $rpRawHash);
                $newBlobs[$rpRawHash] = [
                    'raw_hash' => $rpRawHash,
                    'stored_hash' => $rpRawHash,
                    'raw_size' => $rpSize,
                    'stored_size' => $rpSize
                ];
                $rp = 'prototype.rp';
                $rpEntry = [
                    'rel_path' => 'prototype.rp',
                    'raw_hash' => $rpRawHash,
                    'stored_hash' => $rpRawHash,
                    'file_size' => $rpSize
                ];
            }

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

            if ($rpEntry === null && $existing && !empty($existing['rp_file'])) {
                $oldRpRow = $db->prepare('SELECT raw_hash, stored_hash, file_size FROM version_files WHERE version_id = ? AND rel_path = ? LIMIT 1');
                $oldRpRow->execute([(int)$existing['id'], 'prototype.rp']);
                $oldRpData = $oldRpRow->fetch();
                $oldRpRow->closeCursor();
                if (!$oldRpData || !Storage::hasBlob($oldRpData['stored_hash'])) {
                    throw new DomainException(t('api.ver.rp_keep_fail'));
                }
                $rp = 'prototype.rp';
                $rpSize = (int)$oldRpData['file_size'];
                $rpEntry = [
                    'rel_path' => 'prototype.rp',
                    'raw_hash' => $oldRpData['raw_hash'],
                    'stored_hash' => $oldRpData['stored_hash'],
                    'file_size' => $rpSize
                ];
            }

            foreach ($fileEntries as $fe) {
                if (!Storage::hasBlob($fe['stored_hash'])) throw new DomainException(t('api.ver.chunk_missing'));
            }
            if ($rpEntry !== null && !Storage::hasBlob($rpEntry['stored_hash'])) {
                throw new DomainException(t('api.ver.chunk_missing'));
            }

            if (!empty($newBlobs)) {
                $insBlob = $db->prepare('INSERT OR IGNORE INTO blobs (raw_hash, stored_hash, raw_size, stored_size) VALUES (?, ?, ?, ?)');
                foreach ($newBlobs as $nb) {
                    $insBlob->execute([$nb['raw_hash'], $nb['stored_hash'], $nb['raw_size'], $nb['stored_size']]);
                }
            }

            $hasDefault = $db->prepare('SELECT 1 FROM versions WHERE item_id = ? AND is_default = 1 LIMIT 1');
            $hasDefault->execute([$itemId]);
            $hasDefaultVal = (bool)$hasDefault->fetchColumn();
            $hasDefault->closeCursor();
            $makeDefault = !empty($_POST['is_default']) || ($existing && (int)$existing['is_default'] === 1) || !$hasDefaultVal;
            if ($makeDefault) $db->prepare('UPDATE versions SET is_default = 0 WHERE item_id = ?')->execute([$itemId]);
            if ($existing) {
                $db->prepare('UPDATE versions SET entry_file = ?, rp_file = ?, storage_dir = ?, file_size = ?, rp_size = ?, changelog = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                    ->execute([$entry, $rp, $revisionId, $fileSize, $rpSize, $changelog, $makeDefault ? 1 : 0, $existing['id']]);
                $verId = (int)$existing['id'];
                Storage::queueVersionRemoval($db, $verId);
            } else {
                $author = Auth::getCurrentUser()['name'];
                $db->prepare('INSERT INTO versions (item_id, version_name, entry_file, rp_file, storage_dir, file_size, rp_size, changelog, is_default, created_by, author_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                    ->execute([$itemId, $name, $entry, $rp, $revisionId, $fileSize, $rpSize, $changelog, $makeDefault ? 1 : 0, $uid, $author]);
                $verId = (int)$db->lastInsertId();
            }

            $insFile = $db->prepare('INSERT INTO version_files (version_id, rel_path, raw_hash, stored_hash, file_size) VALUES (?, ?, ?, ?, ?)');
            $clearGc = $db->prepare('DELETE FROM asset_gc WHERE blob_hash = ?');
            $clearedHashes = [];
            foreach ($fileEntries as $fe) {
                $insFile->execute([$verId, $fe['rel_path'], $fe['raw_hash'], $fe['stored_hash'], $fe['file_size']]);
                if (!isset($clearedHashes[$fe['stored_hash']])) {
                    $clearGc->execute([$fe['stored_hash']]);
                    $clearedHashes[$fe['stored_hash']] = true;
                }
            }
            if ($rpEntry !== null) {
                $insFile->execute([$verId, $rpEntry['rel_path'], $rpEntry['raw_hash'], $rpEntry['stored_hash'], $rpEntry['file_size']]);
                if (!isset($clearedHashes[$rpEntry['stored_hash']])) {
                    $clearGc->execute([$rpEntry['stored_hash']]);
                }
            }

            $db->commit();
            $committed = true;
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            throw $e;
        } finally {
            if ($mergedZip) @unlink($mergedZip);
            if ($mergedRp) @unlink($mergedRp);
            if (is_dir($stage)) Storage::removeTree($stage, CHUNKS_PATH);
            if ($committed || $cleanupChunks) {
                if ($zipId !== '') Storage::removeTree(Storage::chunkDir($zipId, $uid), CHUNKS_PATH);
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
                Storage::queueVersionRemoval($db, $id);
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
        $mergedRp = null;
        $cleanupChunks = false;
        try {
            $mergedRp = Storage::mergeChunks($rpId, 'rp', $uid);
            $cleanupChunks = true;
            $rpHash = hash_file('sha256', $mergedRp);
            $rpSize = (int)filesize($mergedRp);
            Storage::storeBlobFromFile($mergedRp, $rpHash);

            $db->beginTransaction();
            $db->exec('UPDATE versions SET id = id WHERE 0');
            $stmtLock = $db->prepare('SELECT * FROM versions WHERE id = ?');
            $stmtLock->execute([$id]);
            $lockedVer = $stmtLock->fetch();
            $stmtLock->closeCursor();
            if (!$lockedVer) throw new DomainException(t('api.ver.removed'));
            if (!Auth::canDeleteVersion($lockedVer) || !Auth::canEditItem(Auth::getItem($lockedVer['item_id']))) throw new DomainException(t('api.ver.no_rp_mod_perm'));
            if ($lockedVer['storage_dir'] !== $version['storage_dir']) throw new DomainException(t('api.ver.updated_refresh'));

            $oldRpStmt = $db->prepare('SELECT stored_hash FROM version_files WHERE version_id = ? AND rel_path = ? LIMIT 1');
            $oldRpStmt->execute([$id, 'prototype.rp']);
            $oldRpHash = $oldRpStmt->fetchColumn();
            $oldRpStmt->closeCursor();

            if (!Storage::hasBlob($rpHash)) throw new DomainException(t('api.ver.chunk_missing'));
            $db->prepare('INSERT OR IGNORE INTO blobs (raw_hash, stored_hash, raw_size, stored_size) VALUES (?, ?, ?, ?)')
                ->execute([$rpHash, $rpHash, $rpSize, $rpSize]);
            $db->prepare('INSERT OR REPLACE INTO version_files (version_id, rel_path, raw_hash, stored_hash, file_size) VALUES (?, ?, ?, ?, ?)')
                ->execute([$id, 'prototype.rp', $rpHash, $rpHash, $rpSize]);
            if (is_string($oldRpHash) && $oldRpHash !== '' && $oldRpHash !== $rpHash) {
                Storage::queueHashRemoval($db, $oldRpHash);
            }
            $db->prepare('DELETE FROM asset_gc WHERE blob_hash = ?')->execute([$rpHash]);

            $db->prepare('UPDATE versions SET rp_file = ?, rp_size = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                ->execute(['prototype.rp', $rpSize, $id]);
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            throw $e;
        } finally {
            if ($mergedRp && file_exists($mergedRp)) @unlink($mergedRp);
            if ($cleanupChunks) Storage::removeTree(Storage::chunkDir($rpId, $uid), CHUNKS_PATH);
        }
        Storage::collectGarbage($db);
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
        $oldRpHash = '';
        try {
            $db->exec('UPDATE versions SET id = id WHERE 0');
            $stmtLock = $db->prepare('SELECT * FROM versions WHERE id = ?');
            $stmtLock->execute([$id]);
            $lockedVer = $stmtLock->fetch();
            $stmtLock->closeCursor();
            if (!$lockedVer) throw new DomainException(t('api.ver.removed'));
            if (!Auth::canDeleteVersion($lockedVer) || !Auth::canEditItem(Auth::getItem($lockedVer['item_id']))) throw new DomainException(t('api.ver.no_rp_remove_perm'));

            $oldRpStmt = $db->prepare('SELECT stored_hash FROM version_files WHERE version_id = ? AND rel_path = ? LIMIT 1');
            $oldRpStmt->execute([$id, 'prototype.rp']);
            $oldRpHash = (string)$oldRpStmt->fetchColumn();
            $oldRpStmt->closeCursor();

            $db->prepare('DELETE FROM version_files WHERE version_id = ? AND rel_path = ?')->execute([$id, 'prototype.rp']);
            if ($oldRpHash !== '') Storage::queueHashRemoval($db, $oldRpHash);

            $db->prepare('UPDATE versions SET rp_file = ?, rp_size = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                ->execute(['', $id]);
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            throw $e;
        }

        Storage::collectGarbage($db);

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
