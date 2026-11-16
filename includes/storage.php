<?php
/** 私有资产存储。目录使用不可变标识，展示名称不参与物理路径。 */
require_once __DIR__ . '/db.php';

class Storage {
    public static function validDir($dir) {
        return is_string($dir) && preg_match('#^p[1-9][0-9]*/[a-f0-9]{32}$#D', $dir);
    }

    public static function versionRoot($version) {
        if (!self::validDir($version['storage_dir'] ?? '')) {
            throw new DomainException('版本存储标识无效');
        }
        return PROTOTYPES_PATH . '/' . $version['storage_dir'];
    }

    public static function filePath($version, $relative) {
        $relative = str_replace('\\', '/', (string)$relative);
        if ($relative === '' || $relative[0] === '/' || strpos($relative, "\0") !== false) return false;
        foreach (explode('/', $relative) as $part) {
            if ($part === '' || $part === '.' || $part === '..' || $part[0] === '.') return false;
        }
        $root = realpath(self::versionRoot($version));
        $path = realpath(self::versionRoot($version) . '/' . $relative);
        return $root && $path && strpos($path, $root . DIRECTORY_SEPARATOR) === 0 && is_file($path) ? $path : false;
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

    /** 在删除元数据的同一事务中登记清理任务，失败可重试。 */
    public static function queueRemoval($db, $version) {
        if (self::validDir($version['storage_dir'] ?? '')) {
            $db->prepare('INSERT OR IGNORE INTO asset_gc (storage_dir) VALUES (?)')->execute([$version['storage_dir']]);
        }
    }

    public static function collectGarbage($db) {
        // 元数据可能已经提交；清理失败只保留重试任务，不能逆转业务结果。
        try {
            foreach ($db->query('SELECT storage_dir FROM asset_gc LIMIT 20')->fetchAll() as $row) {
                try {
                    $check = $db->prepare('SELECT 1 FROM versions WHERE storage_dir = ? LIMIT 1');
                    $check->execute([$row['storage_dir']]);
                    if ($check->fetchColumn()) continue;
                    if (self::validDir($row['storage_dir']) && self::removeTree(PROTOTYPES_PATH . '/' . $row['storage_dir'], PROTOTYPES_PATH)) {
                        $db->prepare('DELETE FROM asset_gc WHERE storage_dir = ?')->execute([$row['storage_dir']]);
                    } else {
                        error_log('[protoloft] 私有资产清理待重试: ' . $row['storage_dir']);
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
        if (!in_array($column, ['item_id', 'ver_id'], true)) throw new InvalidArgumentException('无效关联');
        $db->prepare('DELETE FROM annotation_replies WHERE annotation_id IN (SELECT id FROM annotations WHERE ' . $column . ' = ?)')->execute([$id]);
        $db->prepare('DELETE FROM annotations WHERE ' . $column . ' = ?')->execute([$id]);
    }

    public static function deleteItemRecords($db, $id) {
        $stmt = $db->prepare('SELECT * FROM versions WHERE item_id = ?');
        $stmt->execute([$id]);
        foreach ($stmt->fetchAll() as $version) self::queueRemoval($db, $version);
        self::deleteAnnotations($db, 'item_id', $id);
        $db->prepare('DELETE FROM share_codes WHERE item_id = ?')->execute([$id]);
        $db->prepare('DELETE FROM versions WHERE item_id = ?')->execute([$id]);
        $db->prepare('DELETE FROM settings WHERE key IN (?, ?)')->execute(['item_share_disabled_' . (int)$id, 'item_share_salt_' . (int)$id]);
        $db->prepare('DELETE FROM items WHERE id = ?')->execute([$id]);
    }

    public static function chunkDir($uploadId, $userId) {
        if (!preg_match('/^[a-zA-Z0-9_-]{1,100}$/D', $uploadId)) throw new DomainException('上传标识无效');
        return CHUNKS_PATH . '/' . (int)$userId . '_' . $uploadId;
    }

    public static function storeChunk($uploadId, $fileType, $index, $total, $tmp, $uid) {
        if (!in_array($fileType, ['zip', 'rp'], true) || $total < 1 || $total > 1000 || $index < 0 || $index >= $total
            || !is_file($tmp) || filesize($tmp) < 1 || filesize($tmp) > 1024 * 1024) throw new DomainException('分片参数或大小无效');
        $dir = Storage::chunkDir($uploadId, $uid);
        // 每个成员保留至多 8 份上传；过期切片在下一次上传时清理。
        $active = 0;
        foreach (glob(CHUNKS_PATH . '/' . $uid . '_*', GLOB_ONLYDIR) as $candidate) {
            if (filemtime($candidate) < time() - 86400) Storage::removeTree($candidate, CHUNKS_PATH);
            else $active++;
        }
        if (!is_dir($dir) && $active >= 8) throw new DomainException('未完成上传过多，请稍后重试');
        if (!is_dir($dir) && !mkdir($dir, 0700, true)) throw new DomainException('无法创建上传目录');
        $lock = fopen($dir . '/lock', 'c+');
        if (!$lock || !flock($lock, LOCK_EX)) throw new DomainException('无法锁定上传');
        try {
            $meta = is_file($dir . '/meta.json') ? json_decode(file_get_contents($dir . '/meta.json'), true) : null;
            if ($meta && ($meta['file_type'] !== $fileType || (int)$meta['total'] !== $total || (int)$meta['user_id'] !== $uid)) throw new DomainException('上传参数不一致');
            if (!$meta) {
                $meta = ['user_id' => $uid, 'file_type' => $fileType, 'total' => $total, 'created_at' => time()];
                if (file_put_contents($dir . '/meta.json', json_encode($meta)) === false) throw new DomainException('保存上传凭据失败');
            }
            $bytes = filesize($tmp);
            foreach (glob($dir . '/*.part') as $part) if (basename($part) !== $index . '.part') $bytes += filesize($part);
            if ($bytes > 500 * 1024 * 1024) throw new DomainException('上传文件超过 500MB');
            if (!rename($tmp, $dir . '/' . $index . '.part')) throw new DomainException('保存分片失败');
            touch($dir);
        } finally { flock($lock, LOCK_UN); fclose($lock); }
    }

    public static function mergeChunks($uploadId, $fileType, $userId) {
        $dir = self::chunkDir($uploadId, $userId);
        $lock = @fopen($dir . '/lock', 'r+');
        if (!$lock || !flock($lock, LOCK_EX)) throw new DomainException('上传不存在或已过期');
        $merged = false;
        try {
            $meta = json_decode(@file_get_contents($dir . '/meta.json'), true);
            if (!$meta || (int)$meta['user_id'] !== (int)$userId || $meta['file_type'] !== $fileType || $meta['created_at'] < time() - 86400) {
                throw new DomainException('上传凭据不匹配或已过期');
            }
            $merged = tempnam(CHUNKS_PATH, 'merged_');
            $out = fopen($merged, 'wb');
            if (!$out) throw new DomainException('无法合并上传文件');
            $bytes = 0;
            try {
                for ($i = 0; $i < (int)$meta['total']; $i++) {
                    $part = $dir . '/' . $i . '.part';
                    if (!is_file($part) || filesize($part) === 0) throw new DomainException('上传分片缺失，请重新上传');
                    $bytes += filesize($part);
                    if ($bytes > 500 * 1024 * 1024) throw new DomainException('上传文件超过 500MB');
                    $in = fopen($part, 'rb');
                    try {
                        if (stream_copy_to_stream($in, $out) !== filesize($part)) throw new DomainException('分片合并失败');
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
