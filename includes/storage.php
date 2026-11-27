<?php
/** 私有资产存储。目录使用不可变标识，展示名称不参与物理路径。 */
require_once __DIR__ . '/db.php';

class Storage {
    public static function validHash($hash) {
        return is_string($hash) && preg_match('/^[a-f0-9]{64}$/D', $hash) === 1;
    }

    public static function blobPath($hash) {
        if (!self::validHash($hash)) {
            throw new DomainException(t('api.storage.invalid_dir_id'));
        }
        return BLOBS_PATH . '/' . substr($hash, 0, 2) . '/' . substr($hash, 2, 2) . '/' . $hash;
    }

    public static function hasBlob($hash) {
        return self::validHash($hash) && is_file(self::blobPath($hash));
    }

    public static function storeBlobFromFile($sourcePath, $hash) {
        $dest = self::blobPath($hash);
        if (is_file($dest)) return $dest;
        $dir = dirname($dest);
        if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new DomainException(t('api.storage.mkdir_fail'));
        }
        $tmp = $dir . '/.tmp_' . $hash . '_' . bin2hex(random_bytes(4));
        if (!@copy($sourcePath, $tmp)) {
            @unlink($tmp);
            throw new DomainException(t('api.ver.mkdir_fail'));
        }
        if (!@rename($tmp, $dest)) {
            @unlink($tmp);
            if (!is_file($dest)) throw new DomainException(t('api.ver.mkdir_fail'));
        }
        return $dest;
    }

    public static function storeBlobFromString($content, $hash) {
        $dest = self::blobPath($hash);
        if (is_file($dest)) return $dest;
        $dir = dirname($dest);
        if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new DomainException(t('api.storage.mkdir_fail'));
        }
        $tmp = $dir . '/.tmp_' . $hash . '_' . bin2hex(random_bytes(4));
        if (@file_put_contents($tmp, $content, LOCK_EX) === false) {
            @unlink($tmp);
            throw new DomainException(t('api.ver.mkdir_fail'));
        }
        if (!@rename($tmp, $dest)) {
            @unlink($tmp);
            if (!is_file($dest)) throw new DomainException(t('api.ver.mkdir_fail'));
        }
        return $dest;
    }

    public static function normalizeRelativePath($relative) {
        $relative = str_replace('\\', '/', (string)$relative);
        if ($relative === '' || $relative[0] === '/' || strpos($relative, "\0") !== false) return false;
        foreach (explode('/', $relative) as $part) {
            if ($part === '' || $part === '.' || $part === '..' || $part[0] === '.') return false;
        }
        return $relative;
    }

    public static function filePath($version, $relative) {
        $verId = (int)($version['id'] ?? 0);
        if ($verId < 1) return false;
        $rel = self::normalizeRelativePath($relative);
        if ($rel === false) return false;
        $storedHash = DB::value(
            'SELECT stored_hash FROM version_files WHERE version_id = ? AND rel_path = ? LIMIT 1',
            [$verId, $rel]
        );
        if (!self::validHash($storedHash)) return false;
        $path = self::blobPath($storedHash);
        return is_file($path) ? $path : false;
    }

    public static function removeTree($dir, $base) {
        try {
            $baseReal = realpath($base);
            if (!file_exists($dir)) return true;
            $real = realpath($dir);
            if (!$baseReal || !$real || is_link($dir) || strpos($real, $baseReal . DIRECTORY_SEPARATOR) !== 0) return false;
            $ok = true;
            foreach (new FilesystemIterator($real, FilesystemIterator::SKIP_DOTS) as $file) {
                if ($file->isLink()) $ok = @unlink($file->getPathname()) && $ok;
                elseif ($file->isDir()) $ok = self::removeTree($file->getPathname(), $baseReal) && $ok;
                else $ok = @unlink($file->getPathname()) && $ok;
            }
            return $ok && @rmdir($real);
        } catch (Throwable $e) {
            error_log('[protoloft] 资产目录清理失败: ' . $e->getMessage());
            return false;
        }
    }

    /** 在删除/替换版本文件的同一事务中登记孤立 Blob 清理任务，失败可重试。 */
    public static function queueVersionRemoval($db, $versionId) {
        $verId = (int)$versionId;
        if ($verId < 1) return;
        $now = time();
        $stmt = $db->prepare('SELECT DISTINCT stored_hash FROM version_files WHERE version_id = ?');
        $stmt->execute([$verId]);
        $hashes = $stmt->fetchAll(PDO::FETCH_COLUMN);
        $stmt->closeCursor();
        if (!empty($hashes)) {
            $gc = $db->prepare('INSERT OR IGNORE INTO asset_gc (blob_hash, queued_at) VALUES (?, ?)');
            foreach ($hashes as $hash) {
                if (self::validHash($hash)) $gc->execute([$hash, $now]);
            }
        }
        $db->prepare('DELETE FROM version_files WHERE version_id = ?')->execute([$verId]);
    }

    public static function queueHashRemoval($db, $hash) {
        if (self::validHash($hash)) {
            $db->prepare('INSERT OR IGNORE INTO asset_gc (blob_hash, queued_at) VALUES (?, ?)')->execute([$hash, time()]);
        }
    }

    public static function collectGarbage($db) {
        // 元数据可能已经提交；清理失败只保留重试任务，不能逆转业务结果。
        try {
            $rows = $db->query('SELECT blob_hash FROM asset_gc LIMIT 100')->fetchAll();
            $checkRef = $db->prepare('SELECT 1 FROM version_files WHERE stored_hash = ? LIMIT 1');
            $delBlobMeta = $db->prepare('DELETE FROM blobs WHERE stored_hash = ? AND NOT EXISTS (SELECT 1 FROM version_files WHERE raw_hash = blobs.raw_hash)');
            $delGc = $db->prepare('DELETE FROM asset_gc WHERE blob_hash = ?');
            foreach ($rows as $row) {
                $hash = $row['blob_hash'] ?? '';
                try {
                    $checkRef->execute([$hash]);
                    $inUse = (bool)$checkRef->fetchColumn();
                    $checkRef->closeCursor();
                    if ($inUse) {
                        $delGc->execute([$hash]);
                        continue;
                    }
                    if (!self::validHash($hash)) {
                        $delGc->execute([$hash]);
                        continue;
                    }
                    $path = self::blobPath($hash);
                    $removed = !is_file($path) || @unlink($path);
                    if ($removed) {
                        $delBlobMeta->execute([$hash]);
                        $delGc->execute([$hash]);
                    } else {
                        error_log('[protoloft] 私有资产清理待重试: ' . $hash);
                    }
                } catch (Throwable $e) {
                    error_log('[protoloft] 资产清理任务待重试: ' . $e->getMessage());
                }
            }
            return (int)$db->query('SELECT COUNT(*) FROM asset_gc')->fetchColumn();
        } catch (Throwable $e) {
            error_log('[protoloft] 无法读取资产清理队列: ' . $e->getMessage());
            return 1;
        }
    }

    public static function deleteAnnotations($db, $column, $id) {
        if (!in_array($column, ['item_id', 'ver_id'], true)) throw new InvalidArgumentException(t('api.storage.invalid_relation'));
        $db->prepare('DELETE FROM annotation_replies WHERE annotation_id IN (SELECT id FROM annotations WHERE ' . $column . ' = ?)')->execute([$id]);
        $db->prepare('DELETE FROM annotations WHERE ' . $column . ' = ?')->execute([$id]);
    }

    public static function deleteItemRecords($db, $id) {
        $stmt = $db->prepare('SELECT id FROM versions WHERE item_id = ?');
        $stmt->execute([$id]);
        $verIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
        $stmt->closeCursor();
        foreach ($verIds as $verId) self::queueVersionRemoval($db, $verId);
        self::deleteAnnotations($db, 'item_id', $id);
        $db->prepare('DELETE FROM share_codes WHERE item_id = ?')->execute([$id]);
        $db->prepare('DELETE FROM versions WHERE item_id = ?')->execute([$id]);
        $db->prepare('DELETE FROM settings WHERE key IN (?, ?)')->execute(['item_share_disabled_' . (int)$id, 'item_share_salt_' . (int)$id]);
        $db->prepare('DELETE FROM items WHERE id = ?')->execute([$id]);
    }

    public static function chunkDir($uploadId, $userId) {
        if (!preg_match('/^[a-zA-Z0-9_-]{1,100}$/D', $uploadId)) throw new DomainException(t('api.storage.invalid_upload_id'));
        return CHUNKS_PATH . '/' . (int)$userId . '_' . $uploadId;
    }

    public static function storeChunk($uploadId, $fileType, $index, $total, $tmp, $uid) {
        if (!in_array($fileType, ['zip', 'rp'], true) || $total < 1 || $total > 1000 || $index < 0 || $index >= $total
            || !is_file($tmp) || filesize($tmp) < 1 || filesize($tmp) > 1024 * 1024) throw new DomainException(t('api.storage.invalid_chunk'));
        $dir = Storage::chunkDir($uploadId, $uid);
        // 每个成员保留至多 8 份上传；过期切片在下一次上传时清理。
        $active = 0;
        foreach (glob(CHUNKS_PATH . '/' . $uid . '_*', GLOB_ONLYDIR) as $candidate) {
            if (filemtime($candidate) < time() - 86400) Storage::removeTree($candidate, CHUNKS_PATH);
            else $active++;
        }
        if (!is_dir($dir) && $active >= 8) throw new DomainException(t('api.storage.too_many_uploads'));
        if (!is_dir($dir) && !mkdir($dir, 0700, true)) throw new DomainException(t('api.storage.mkdir_fail'));
        $lock = fopen($dir . '/lock', 'c+');
        if (!$lock || !flock($lock, LOCK_EX)) throw new DomainException(t('api.storage.lock_fail'));
        try {
            $meta = is_file($dir . '/meta.json') ? json_decode(file_get_contents($dir . '/meta.json'), true) : null;
            if ($meta && ($meta['file_type'] !== $fileType || (int)$meta['total'] !== $total || (int)$meta['user_id'] !== $uid)) throw new DomainException(t('api.storage.param_mismatch'));
            if (!$meta) {
                $meta = ['user_id' => $uid, 'file_type' => $fileType, 'total' => $total, 'created_at' => time()];
                if (file_put_contents($dir . '/meta.json', json_encode($meta)) === false) throw new DomainException(t('api.storage.meta_save_fail'));
            }
            $bytes = filesize($tmp);
            foreach (glob($dir . '/*.part') as $part) if (basename($part) !== $index . '.part') $bytes += filesize($part);
            if ($bytes > 500 * 1024 * 1024) throw new DomainException(t('api.storage.over_500mb'));
            if (!rename($tmp, $dir . '/' . $index . '.part')) throw new DomainException(t('api.storage.chunk_save_fail'));
            touch($dir);
        } finally { flock($lock, LOCK_UN); fclose($lock); }
    }

    public static function mergeChunks($uploadId, $fileType, $userId) {
        $dir = self::chunkDir($uploadId, $userId);
        $lock = @fopen($dir . '/lock', 'r+');
        if (!$lock || !flock($lock, LOCK_EX)) throw new DomainException(t('api.storage.upload_missing_expired'));
        $merged = false;
        try {
            $meta = json_decode(@file_get_contents($dir . '/meta.json'), true);
            if (!$meta || (int)$meta['user_id'] !== (int)$userId || $meta['file_type'] !== $fileType || $meta['created_at'] < time() - 86400) {
                throw new DomainException(t('api.storage.meta_mismatch_expired'));
            }
            $merged = tempnam(CHUNKS_PATH, 'merged_');
            $out = fopen($merged, 'wb');
            if (!$out) throw new DomainException(t('api.storage.merge_open_fail'));
            $bytes = 0;
            try {
                for ($i = 0; $i < (int)$meta['total']; $i++) {
                    $part = $dir . '/' . $i . '.part';
                    if (!is_file($part) || filesize($part) === 0) throw new DomainException(t('api.storage.chunk_missing'));
                    $bytes += filesize($part);
                    if ($bytes > 500 * 1024 * 1024) throw new DomainException(t('api.storage.over_500mb'));
                    $in = fopen($part, 'rb');
                    try {
                        if (stream_copy_to_stream($in, $out) !== filesize($part)) throw new DomainException(t('api.storage.merge_fail'));
                    } finally { fclose($in); }
                }
            } finally { fclose($out); }
            return $merged;
        } catch (Throwable $e) {
            if ($merged) @unlink($merged);
            throw $e;
        } finally { flock($lock, LOCK_UN); fclose($lock); }
    }
}
