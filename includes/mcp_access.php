<?php
require_once __DIR__ . '/auth.php';
class McpAccess {
    private static $current = null;

    public static function parseProjectIds($raw) {
        if (is_string($raw)) {
            $raw = trim($raw);
            if ($raw === '') return [];
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $raw = $decoded;
            } elseif (strpos($raw, ',') !== false) {
                $raw = explode(',', $raw);
            } else {
                $raw = [$raw];
            }
        }
        if (!is_array($raw)) $raw = [$raw];
        $ids = [];
        foreach ($raw as $val) {
            $id = (int)$val;
            if ($id > 0) $ids[$id] = $id;
        }
        return array_values($ids);
    }

    public static function settings() {
        $user = Auth::getCurrentUser();
        if (!$user) throw new DomainException(t('api.login_first'));
        $db = DB::getInstance();
        $stmt = $db->prepare('SELECT id,token_prefix,project_id,project_ids,can_publish,expires_at,last_used_at,created_at,auth_version FROM mcp_tokens WHERE user_id = ?');
        $stmt->execute([$user['id']]);
        $token = $stmt->fetch();
        if ($token) {
            $token['is_valid'] = (int)$token['auth_version'] === (int)$user['auth_version'] && (int)$token['expires_at'] > time();
            unset($token['auth_version']);
            $projectIds = [];
            if (!empty($token['project_ids'])) {
                $projectIds = self::parseProjectIds($token['project_ids']);
            } elseif (!empty($token['project_id'])) {
                $projectIds = [(int)$token['project_id']];
            }
            $token['project_ids'] = $projectIds;
            $token['project_id'] = count($projectIds) === 1 ? reset($projectIds) : 0;
        }
        $projects = [];
        foreach ($db->query("SELECT * FROM items WHERE type = 'project' ORDER BY id DESC")->fetchAll() as $item) {
            if (Auth::canViewItem($item)) $projects[] = ['id' => (int)$item['id'], 'name' => $item['name']];
        }
        return ['endpoint' => app_url('mcp.php'), 'guide_url' => app_url('mcp.php?guide=1'), 'token' => $token ?: null,
            'can_publish' => Auth::canManage(), 'projects' => $projects];
    }
    public static function create($projectId, $publish, $replace) {
        $user = Auth::getCurrentUser();
        if (!$user) throw new DomainException(t('api.login_first'));
        $ids = self::parseProjectIds($projectId);
        foreach ($ids as $id) {
            $project = Auth::getItem($id);
            if (!$project || $project['type'] !== 'project' || !Auth::canViewItem($project)) throw new DomainException(t('api.mcp.no_auth_project'));
            if ($publish && (!Auth::canManage() || !Auth::canEditItem($project))) throw new DomainException(t('api.mcp.no_auth_publish'));
        }
        if ($publish && empty($ids) && !Auth::canManage()) throw new DomainException(t('api.mcp.no_auth_publish'));
        $primaryId = count($ids) === 1 ? $ids[0] : 0;
        $idsJson = !empty($ids) ? json_encode($ids) : '';

        $db = DB::getInstance();
        $db->beginTransaction();
        try {
            $db->exec('UPDATE mcp_tokens SET id = id WHERE 0');
            $stmt = $db->prepare('SELECT id FROM mcp_tokens WHERE user_id = ?');$stmt->execute([$user['id']]);
            if ($stmt->fetchColumn() && !$replace) throw new DomainException(t('api.mcp.token_exists_confirm'));
            $secret = 'plmcp_' . bin2hex(random_bytes(32));
            $expires = time() + 90 * 86400;
            $db->prepare('DELETE FROM mcp_tokens WHERE user_id = ?')->execute([$user['id']]);
            $db->prepare('INSERT INTO mcp_tokens(user_id,token_hash,token_prefix,auth_version,project_id,project_ids,can_publish,expires_at) VALUES(?,?,?,?,?,?,?,?)')->execute([
                $user['id'], hash('sha256', $secret), substr($secret,0,12), $user['auth_version'], $primaryId, $idsJson, $publish ? 1 : 0, $expires]);
            $db->commit();
            return ['secret' => $secret, 'expires_at' => $expires];
        } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
    }
    public static function updatePermissions($projectId, $publish) {
        $user = Auth::getCurrentUser();
        if (!$user) throw new DomainException(t('api.login_first'));
        $ids = self::parseProjectIds($projectId);
        foreach ($ids as $id) {
            $project = Auth::getItem($id);
            if (!$project || $project['type'] !== 'project' || !Auth::canViewItem($project)) throw new DomainException(t('api.mcp.no_auth_project'));
            if ($publish && (!Auth::canManage() || !Auth::canEditItem($project))) throw new DomainException(t('api.mcp.no_auth_publish'));
        }
        if ($publish && empty($ids) && !Auth::canManage()) throw new DomainException(t('api.mcp.no_auth_publish'));
        $primaryId = count($ids) === 1 ? $ids[0] : 0;
        $idsJson = !empty($ids) ? json_encode($ids) : '';

        $db = DB::getInstance();
        $stmt = $db->prepare('UPDATE mcp_tokens SET project_id = ?, project_ids = ?, can_publish = ? WHERE user_id = ?');
        $stmt->execute([$primaryId, $idsJson, $publish ? 1 : 0, $user['id']]);
        $check = $db->prepare('SELECT id FROM mcp_tokens WHERE user_id = ?');
        $check->execute([$user['id']]);
        $hasToken = (bool)$check->fetchColumn();
        $check->closeCursor();
        if (!$hasToken) throw new DomainException(t('api.mcp.token_not_created'));
        return ['project_id' => $primaryId, 'project_ids' => $ids, 'can_publish' => $publish ? 1 : 0];
    }
    public static function authenticate() {
        $authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
        if (!preg_match('/^Bearer (plmcp_[a-f0-9]{64})$/D', $authorization, $m)) throw new DomainException(t('api.mcp.need_bearer'));
        $db = DB::getInstance();
        $stmt = $db->prepare('SELECT t.* FROM mcp_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ? AND t.expires_at > ? AND u.status = 1 AND t.auth_version = u.auth_version');
        $stmt->execute([hash('sha256', $m[1]), time()]);
        $access = $stmt->fetch();
        $stmt->closeCursor();
        if (!$access) throw new DomainException(t('api.mcp.token_invalid_recreate'));
        self::$current = $access;
        Auth::setRequestUser($access['user_id']);
        // 不借用浏览器 Cookie；签名绑定此个人凭据，跨 MCP 调用保持稳定。
        $_SESSION['csrf_token'] = hash('sha256', 'mcp:' . $access['token_hash']);
        $db->prepare('UPDATE mcp_tokens SET last_used_at = ? WHERE id = ?')->execute([time(), $access['id']]);
        return $access;
    }
    /** 在发布事务的写锁内复核，撤销凭据或降权不能被在途解压请求绕过。 */
    public static function guardWrite($itemId) {
        if (!self::$current) throw new DomainException(t('api.mcp.token_unavailable'));
        $stmt = DB::getInstance()->prepare('SELECT t.* FROM mcp_tokens t JOIN users u ON u.id=t.user_id WHERE t.id=? AND t.token_hash=? AND t.expires_at>? AND u.status=1 AND t.auth_version=u.auth_version');
        $stmt->execute([self::$current['id'], self::$current['token_hash'], time()]);
        $access = $stmt->fetch();
        $stmt->closeCursor();
        if (!$access) throw new DomainException(t('api.mcp.token_invalid_abort'));
        Auth::setRequestUser($access['user_id']);
        self::project($access, $itemId, true);
    }
    public static function project($access, $id, $write = false) {
        $item = Auth::getItem($id);
        if (!$item || $item['type'] !== 'project' || !Auth::canViewItem($item)) throw new DomainException(t('api.mcp.project_out_of_scope'));
        $allowed = [];
        if (!empty($access['project_ids'])) {
            $allowed = self::parseProjectIds($access['project_ids']);
        } elseif (!empty($access['project_id'])) {
            $allowed = [(int)$access['project_id']];
        }
        if (!empty($allowed) && !in_array((int)$id, $allowed, true)) throw new DomainException(t('api.mcp.project_out_of_scope'));
        if ($write && (!(int)$access['can_publish'] || !Auth::canEditItem($item))) throw new DomainException(t('api.mcp.project_out_of_scope'));
        return $item;
    }
}
