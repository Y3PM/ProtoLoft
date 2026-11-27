<?php
/**
 * 历史原型向 Blob 去重存储引擎一次性迁移脚本（用完请从 FTP 根目录删除）
 */
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/storage.php';

require_installed();

$db = DB::getInstance();
$loginError = '';
$currentUser = Auth::getCurrentUser();

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['act'] ?? '') === 'login') {
    $email = trim((string)($_POST['email'] ?? ''));
    $pass = (string)($_POST['password'] ?? '');
    $user = DB::row('SELECT * FROM users WHERE email = ? COLLATE NOCASE LIMIT 1', [$email]);
    if ($user && (int)$user['status'] === 1 && $user['role'] === 'admin' && password_verify($pass, $user['password_hash'])) {
        if (function_exists('session_regenerate_id')) @session_regenerate_id(true);
        $_SESSION['user_id'] = (int)$user['id'];
        $_SESSION['auth_version'] = (int)$user['auth_version'];
        header('Location: migrate_blobs.php');
        exit;
    }
    $loginError = '管理员账号或密码错误';
}

$isAdmin = ($currentUser && $currentUser['role'] === 'admin');

function ensureBlobSchema($db) {
    if (!is_dir(BLOBS_PATH) && !@mkdir(BLOBS_PATH, 0700, true)) {
        throw new RuntimeException('无法创建 data/blobs 目录');
    }
    $db->exec("CREATE TABLE IF NOT EXISTS blobs (
        raw_hash TEXT PRIMARY KEY,
        stored_hash TEXT NOT NULL,
        raw_size INTEGER NOT NULL DEFAULT 0,
        stored_size INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");
    $db->exec("CREATE TABLE IF NOT EXISTS version_files (
        version_id INTEGER NOT NULL,
        rel_path TEXT NOT NULL,
        raw_hash TEXT NOT NULL,
        stored_hash TEXT NOT NULL,
        file_size INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (version_id, rel_path)
    )");
    // 若 asset_gc 仍为旧列 storage_dir，则重建为新结构
    $cols = $db->query("PRAGMA table_info(asset_gc)")->fetchAll(PDO::FETCH_ASSOC);
    $hasBlobCol = false;
    foreach ($cols as $c) {
        if (($c['name'] ?? '') === 'blob_hash') {
            $hasBlobCol = true;
            break;
        }
    }
    if (!$hasBlobCol) {
        $db->exec("DROP TABLE IF EXISTS asset_gc");
        $db->exec("CREATE TABLE IF NOT EXISTS asset_gc (blob_hash TEXT PRIMARY KEY, queued_at INTEGER NOT NULL DEFAULT 0)");
    }
    $db->exec("CREATE INDEX IF NOT EXISTS idx_blobs_stored ON blobs(stored_hash)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_vf_raw ON version_files(raw_hash)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_vf_stored ON version_files(stored_hash)");
}

function listPendingVersions($db) {
    $oldProtoRoot = DATA_PATH . '/prototypes';
    $rows = $db->query('SELECT v.id, v.item_id, v.version_name, v.storage_dir, i.name AS item_name FROM versions v LEFT JOIN items i ON i.id = v.item_id ORDER BY v.id ASC')->fetchAll(PDO::FETCH_ASSOC);
    $pending = [];
    foreach ($rows as $row) {
        $hasFiles = (int)DB::value('SELECT COUNT(*) FROM version_files WHERE version_id = ?', [(int)$row['id']]);
        if ($hasFiles > 0) continue;
        $dir = $oldProtoRoot . '/' . ltrim((string)$row['storage_dir'], '/');
        if (is_dir($dir)) {
            $pending[] = $row;
        }
    }
    return $pending;
}

if ($isAdmin && ($_SERVER['REQUEST_METHOD'] === 'POST') && ($_POST['act'] ?? '') === 'step') {
    header('Content-Type: application/json; charset=utf-8');
    @set_time_limit(300);
    try {
        ensureBlobSchema($db);
        $oldProtoRoot = DATA_PATH . '/prototypes';
        $pending = listPendingVersions($db);
        if (empty($pending)) {
            if (is_dir($oldProtoRoot)) {
                @rmdir($oldProtoRoot);
            }
            echo json_encode(['success' => true, 'done' => true, 'remaining' => 0]);
            exit;
        }
        $target = $pending[0];
        $verId = (int)$target['id'];
        $verDir = $oldProtoRoot . '/' . ltrim((string)$target['storage_dir'], '/');
        if (!is_dir($verDir)) {
            throw new RuntimeException('目录不存在: ' . $target['storage_dir']);
        }
        $prefixLen = strlen(rtrim($verDir, '/\\')) + 1;
        $entries = [];
        $iter = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($verDir, FilesystemIterator::SKIP_DOTS));
        foreach ($iter as $file) {
            if (!$file->isFile()) continue;
            $full = $file->getPathname();
            $rel = str_replace('\\', '/', substr($full, $prefixLen));
            if ($rel === '') continue;
            $hash = hash_file('sha256', $full);
            $size = (int)$file->getSize();
            Storage::storeBlobFromFile($full, $hash);
            $entries[] = ['rel' => $rel, 'hash' => $hash, 'size' => $size];
        }

        $db->beginTransaction();
        $insBlob = $db->prepare('INSERT OR IGNORE INTO blobs (raw_hash, stored_hash, raw_size, stored_size) VALUES (?, ?, ?, ?)');
        $insFile = $db->prepare('INSERT OR REPLACE INTO version_files (version_id, rel_path, raw_hash, stored_hash, file_size) VALUES (?, ?, ?, ?, ?)');
        foreach ($entries as $e) {
            $insBlob->execute([$e['hash'], $e['hash'], $e['size'], $e['size']]);
            $insFile->execute([$verId, $e['rel'], $e['hash'], $e['hash'], $e['size']]);
        }
        $db->commit();

        Storage::removeTree($verDir, $oldProtoRoot);
        $itemDir = dirname($verDir);
        if (is_dir($itemDir) && $itemDir !== $oldProtoRoot) {
            @rmdir($itemDir);
        }
        $rem = count($pending) - 1;
        if ($rem === 0 && is_dir($oldProtoRoot)) {
            @rmdir($oldProtoRoot);
        }
        echo json_encode([
            'success' => true,
            'done' => ($rem <= 0),
            'remaining' => $rem,
            'migrated' => ($target['item_name'] ?: ('#' . $target['item_id'])) . ' · ' . $target['version_name'] . ' (' . count($entries) . ' files)'
        ], JSON_UNESCAPED_UNICODE);
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        echo json_encode(['success' => false, 'message' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
    }
    exit;
}

$pendingCount = 0;
if ($isAdmin) {
    ensureBlobSchema($db);
    $pendingCount = count(listPendingVersions($db));
}
?><!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Blob 存储引擎迁移 - 立象原型</title>
<style>
body{margin:0;background:#f7f8fa;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;box-sizing:border-box}
.card{background:#fff;border:1px solid #e7eaf0;border-radius:12px;padding:28px 32px;width:100%;max-width:480px}
h1{margin:0 0 8px;font-size:18px;font-weight:600}
p{margin:0 0 18px;color:#6b7280;font-size:13px;line-height:1.6}
.input{width:100%;height:38px;padding:0 12px;border:1px solid #d8dde6;border-radius:6px;font-size:14px;box-sizing:border-box;margin-bottom:12px}
.btn{width:100%;height:38px;border:0;border-radius:6px;background:#0076de;color:#fff;font-size:14px;font-weight:600;cursor:pointer}
.btn:disabled{opacity:.6;cursor:not-allowed}
.err{color:#dc2626;font-size:13px;margin-bottom:12px}
.ok{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;padding:12px 14px;border-radius:8px;font-size:13px;line-height:1.6;margin-top:14px;display:none}
.log{margin-top:14px;padding:10px 12px;background:#f9fafb;border:1px solid #e7eaf0;border-radius:8px;font-size:12px;color:#374151;max-height:180px;overflow-y:auto;display:none}
</style>
</head>
<body>
<div class="card">
<?php if (!$isAdmin): ?>
    <h1>管理员验证</h1>
    <p>站点当前处于升级维护状态，请使用管理员账号登录后执行数据归档迁移。</p>
    <?php if ($loginError !== ''): ?><div class="err"><?php echo htmlspecialchars($loginError); ?></div><?php endif; ?>
    <form method="post">
        <input type="hidden" name="act" value="login">
        <input class="input" type="email" name="email" placeholder="管理员邮箱" required>
        <input class="input" type="password" name="password" placeholder="密码" required>
        <button class="btn" type="submit">登录并继续</button>
    </form>
<?php else: ?>
    <h1>历史原型去重归档</h1>
    <p>检测到 <strong><?php echo (int)$pendingCount; ?></strong> 个待迁移版本。迁移过程在服务器本地完成，完成后请从 FTP 根目录删除本文件（<code>migrate_blobs.php</code>）即可恢复全站访问。</p>
    <button class="btn" id="startBtn" onclick="runMigrate()" <?php echo $pendingCount === 0 ? 'disabled' : ''; ?>><?php echo $pendingCount === 0 ? '当前无需迁移' : '开始迁移'; ?></button>
    <div class="log" id="logBox"></div>
    <div class="ok" id="doneBox" <?php echo $pendingCount === 0 ? 'style="display:block"' : ''; ?>>迁移已全部完成！请立即通过 FTP 删除网站根目录下的 <code>migrate_blobs.php</code>，站点将自动恢复正常访问。</div>
    <script>
    function runMigrate() {
        var btn = document.getElementById('startBtn');
        var log = document.getElementById('logBox');
        var done = document.getElementById('doneBox');
        btn.disabled = true;
        btn.innerText = '正在迁移中...';
        log.style.display = 'block';
        function step() {
            var fd = new FormData();
            fd.append('act', 'step');
            fetch('migrate_blobs.php', { method: 'POST', body: fd })
                .then(function(r) { return r.json(); })
                .then(function(res) {
                    if (!res.success) {
                        log.innerHTML += '<div style="color:#dc2626">失败: ' + (res.message || '未知错误') + '</div>';
                        btn.disabled = false;
                        btn.innerText = '重试迁移';
                        return;
                    }
                    if (res.migrated) {
                        log.innerHTML += '<div>✓ ' + res.migrated + '</div>';
                        log.scrollTop = log.scrollHeight;
                    }
                    if (res.done) {
                        btn.innerText = '迁移完成';
                        done.style.display = 'block';
                    } else {
                        step();
                    }
                })
                .catch(function(err) {
                    log.innerHTML += '<div style="color:#dc2626">网络异常: ' + err.message + '</div>';
                    btn.disabled = false;
                    btn.innerText = '重试迁移';
                });
        }
        step();
    }
    </script>
<?php endif; ?>
</div>
</body>
</html>
