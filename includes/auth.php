<?php
/**
 * 用户体系、权限控制与会话管理
 */
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/password_policy.php';

class Auth {
    /**
     * 获取系统配置
     */
    public static function getSetting($key, $default = '') {
        $db = DB::getInstance();
        $stmt = $db->prepare("SELECT value FROM settings WHERE key = ?");
        $stmt->execute([$key]);
        $row = $stmt->fetch();
        $stmt->closeCursor();
        if ($row && $row['value'] !== null && $row['value'] !== '') {
            return $row['value'];
        }
        return $default;
    }

    /**
     * 根据系统设置动态初始化运行期时区 (默认 Asia/Shanghai)
     */
    public static function initTimezone() {
        if (!is_installed()) return;
        try {
            $tz = self::getSetting('system_timezone', 'Asia/Shanghai');
            if (!empty($tz) && in_array($tz, timezone_identifiers_list(), true)) {
                @date_default_timezone_set($tz);
            }
        } catch (Exception $e) {
            // 静默容错
        }
    }

    /**
     * 获取当前系统时区相对于 UTC 的偏移 (如 "+08:00")，供 SQLite datetime 函数时区转换使用
     */
    public static function getTimezoneOffset() {
        try {
            $tzName = date_default_timezone_get();
            $dtz = new DateTimeZone($tzName ?: 'Asia/Shanghai');
            $dt = new DateTime('now', $dtz);
            return $dt->format('P');
        } catch (Exception $e) {
            return '+08:00';
        }
    }

    /**
     * 将存储的 UTC 时间字符串转为当前站点时区的本地时间字符串，支持历史时刻夏令时 (DST) 准确动态换算
     */
    public static function toLocalTime($utcStr) {
        if (empty($utcStr)) return '';
        $ts = strtotime($utcStr . ' UTC');
        return $ts ? date('Y-m-d H:i:s', $ts) : $utcStr;
    }

    /** 仅供已验证个人 MCP 凭据的请求使用，不写入浏览器登录会话。 */
    public static function setRequestUser($userId) {
        if (!defined('MCP_REQUEST')) throw new LogicException(t('api.invalid_request_ctx'));
        $stmt = DB::getInstance()->prepare('SELECT id,email,name,role,is_owner,status,auth_version,department,webhook_url,created_at FROM users WHERE id = ? AND status = 1');
        $stmt->execute([(int)$userId]);
        $user = $stmt->fetch();
        if (!$user) throw new DomainException(t('api.account_unavailable'));
        $user['id'] = (int)$user['id'];
        $user['is_owner'] = (int)$user['is_owner'];
        $user['is_first_login'] = 0;
        self::$cachedUser = $user;
    }

    /**
     * 保存系统配置 (采用全版本 SQLite 通用的 INSERT OR REPLACE 标准语法，兼容低于 3.24 的老版本环境)
     */
    public static function setSetting($key, $value) {
        $db = DB::getInstance();
        $stmt = $db->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
        return $stmt->execute([$key, $value]);
    }

    /**
     * 智能清洗与规范化企业邮箱域名列表 (自动剔除 http://, https://, 前导 @, 前导 www., 结尾斜杠, 转换中文逗号)
     * @param string $rawDomains 原始输入的域名字符串
     * @return string 清洗后的纯净域名列表（英文逗号加空格分隔）
     */
    public static function sanitizeEmailDomains($rawDomains) {
        if (empty($rawDomains)) {
            return '';
        }
        $rawDomains = str_replace('，', ',', (string)$rawDomains);
        $cleanList = [];
        $domainRegex = '/^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)+$/i';
        foreach (explode(',', $rawDomains) as $item) {
            $item = trim(strtolower($item));
            if (empty($item)) continue;
            $item = preg_replace('#^https?://#i', '', $item);
            $item = trim($item, '/');
            if (strpos($item, '@') === 0) {
                $item = ltrim($item, '@');
            }
            // 只要仍包含 @ 或者不符合纯域名格式，直接剔除拒绝入库
            if (empty($item) || strpos($item, '@') !== false || !preg_match($domainRegex, $item)) {
                continue;
            }
            $cleanList[] = $item;
        }
        return implode(', ', array_unique($cleanList));
    }

    /**
     * 用户登录 (二元模型：基于邮箱 + 密码)
     * 支持输入前缀自适应补齐企业白名单域名，支持输入完整邮箱
     * @param string $identifier 邮箱或邮箱前缀
     * @param string $password 密码
     * @param bool $rememberMe 是否记住登录状态 (true: 30天持久凭证; false: 仅当前浏览器会话有效)
     */
    public static function login($identifier, $password, $rememberMe = true) {
        $rawIdentifier = trim($identifier);
        $email = strtolower($rawIdentifier);

        // 如果用户输入的未包含 @，且系统配置了单一白名单域名，自动拼接后缀
        if (strpos($email, '@') === false && !empty($email)) {
            $allowedDomains = self::getSetting('allowed_email_domains', '');
            if (!empty(trim($allowedDomains))) {
                $domains = array_filter(array_map('trim', explode(',', strtolower($allowedDomains))));
                if (count($domains) === 1) {
                    $email = $email . '@' . reset($domains);
                }
            }
        }

        $accountThrottleScope = 'login_account_' . strtolower(trim($email));
        $throttleRules = [
            ['scope' => 'login', 'max' => 10, 'window' => 900, 'by_ip' => true],
        ];
        // R3 方案 C：近期成功登录过的常用网段豁免账号维度锁（仍受单 IP 限速保护），防恶意刷错锁死正常同事
        $isTrustedNet = ($email !== '' && self::isTrustedLoginNetwork($email));
        if (!$isTrustedNet) {
            $throttleRules[] = ['scope' => $accountThrottleScope, 'max' => 10, 'window' => 900, 'by_ip' => false];
        }

        // R2：在单次写锁事务中一次性完成“检查 + 占位”，防止并发请求同时跳过阈值
        $blockedScope = self::reserveThrottleRules($throttleRules);
        if ($blockedScope === 'login') {
            self::recordLoginLog($email, 0, t('api.auth.throttle_ip_log'));
            return ['success' => false, 'message' => t('api.auth.throttle_ip_msg')];
        }
        if ($blockedScope !== null) {
            self::recordLoginLog($email, 0, t('api.auth.throttle_acct_log'));
            return ['success' => false, 'message' => t('api.auth.throttle_acct_msg')];
        }

        $db = DB::getInstance();
        $stmt = $db->prepare("SELECT * FROM users WHERE email = ?");
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        $stmt->closeCursor();

        if ($user && password_verify($password, $user['password_hash'])) {
            // 密码正确即退还本次预占的 IP 次数，但不清空之前累计（保留 P2-2 防绕过语义）
            self::releaseThrottleAttempt('login', true);
            // 待审批与停用拦截
            if ((int)$user['status'] === 0) {
                if (!$isTrustedNet) self::releaseThrottleAttempt($accountThrottleScope, false);
                self::recordLoginLog($email, 0, t('api.auth.pending_log'));
                return ['success' => false, 'message' => t('api.auth.pending_msg')];
            }
            if ((int)$user['status'] === 2) {
                if (!$isTrustedNet) self::releaseThrottleAttempt($accountThrottleScope, false);
                self::recordLoginLog($email, 0, t('api.auth.rejected_log'));
                return ['success' => false, 'message' => t('api.auth.rejected_log')];
            }
            if ((int)$user['status'] !== 1) {
                if (!$isTrustedNet) self::releaseThrottleAttempt($accountThrottleScope, false);
                self::recordLoginLog($email, 0, t('api.auth.disabled_log'));
                return ['success' => false, 'message' => t('api.auth.disabled_log')];
            }

            app_regenerate_session($rememberMe);
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
            $_SESSION['user_id'] = (int)$user['id'];
            $_SESSION['auth_version'] = (int)$user['auth_version'];
            $_SESSION['user_email'] = $user['email'];
            $_SESSION['user_name'] = $user['name'] ?? ($user['display_name'] ?? '');
            $_SESSION['user_role'] = $user['role'];
            $_SESSION['is_owner'] = !empty($user['is_owner']) ? 1 : 0;
            // 兜底兼容旧版键名
            $_SESSION['username'] = $user['email'];
            $_SESSION['display_name'] = $_SESSION['user_name'];

            if ($rememberMe) {
                // 签发 30 天持久双保险安全凭证
                self::sendAdminAuthCookie((int)$user['id']);
            } else {
                // 若用户选择不记住，清理可能残留的持久 Cookie
                if (isset($_COOKIE['ue_admin_auth'])) {
                    if (PHP_VERSION_ID >= 70300) {
                        setcookie('ue_admin_auth', '', [
                            'expires' => time() - 3600,
                            'path' => '/',
                            'httponly' => true,
                            'samesite' => 'Lax',
                            'secure' => self::isHttps(),
                        ]);
                    } else {
                        setcookie('ue_admin_auth', '', time() - 3600, '/');
                    }
                    unset($_COOKIE['ue_admin_auth']);
                }
            }

            self::clearThrottle($accountThrottleScope, false);
            self::recordTrustedLoginNetwork($email);
            self::recordLoginLog($user['email'], 1, t('api.auth.login_ok_log', ['mode' => $rememberMe ? t('api.auth.login_mode_rem') : t('api.auth.login_mode_sess')]));
            if (session_status() === PHP_SESSION_ACTIVE) {
                @session_write_close();
            }
            return ['success' => true, 'user' => [
                'id' => (int)$user['id'],
                'email' => $user['email'],
                'name' => $_SESSION['user_name'],
                'role' => $user['role'],
                'is_owner' => !empty($user['is_owner']) ? 1 : 0,
                'avatar' => self::resolveUserAvatar($user['avatar'] ?? '', (int)$user['id'])
            ]];
        }
        self::recordLoginLog($email, 0, t('api.auth.bad_creds'));
        return ['success' => false, 'message' => t('api.auth.bad_creds')];
    }

    /**
     * 退出登录
     */
    /**
     * 退出登录 (精准移除当前设备的持久凭证，不影响该用户在其它设备/浏览器上的登录态)
     */
    public static function logout() {
        $curUser = self::$cachedUser;
        if ($curUser) {
            self::recordLoginLog($curUser['email'] ?? ($curUser['name'] ?? t('common.user_default')), 1, t('api.auth.logout_log'));
        }
        self::$cachedUser = null;
        $userId = !empty($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 0;

        // 从多设备凭证池中仅移除当前设备的 Token
        if (!empty($_COOKIE['ue_admin_auth'])) {
            $parts = explode(':', (string)$_COOKIE['ue_admin_auth'], 2);
            if (count($parts) === 2) {
                $uid = (int)$parts[0];
                $token = $parts[1];
                $tokenHash = hash('sha256', $token);
                $tokens = self::getUserAuthTokens($uid);
                $remained = [];
                foreach ($tokens as $item) {
                    if (!hash_equals($item['hash'] ?? '', $tokenHash)) {
                        $remained[] = $item;
                    }
                }
                self::saveUserAuthTokens($uid, $remained);
            }
        }

        $_SESSION = [];
        if (session_status() === PHP_SESSION_ACTIVE) {
            @session_destroy();
        }
        if (isset($_COOKIE['ue_admin_auth'])) {
            if (PHP_VERSION_ID >= 70300) {
                setcookie('ue_admin_auth', '', [
                    'expires' => time() - 3600,
                    'path' => '/',
                    'httponly' => true,
                    'samesite' => 'Lax',
                    'secure' => self::isHttps(),
                ]);
            } else {
                setcookie('ue_admin_auth', '', time() - 3600, '/');
            }
            unset($_COOKIE['ue_admin_auth']);
        }
        if (isset($_COOKIE['ue_site_auth'])) {
            if (PHP_VERSION_ID >= 70300) {
                setcookie('ue_site_auth', '', [
                    'expires' => time() - 3600,
                    'path' => '/',
                    'httponly' => true,
                    'samesite' => 'Lax',
                    'secure' => self::isHttps(),
                ]);
            } else {
                setcookie('ue_site_auth', '', time() - 3600, '/');
            }
            unset($_COOKIE['ue_site_auth']);
        }
    }

    private static $cachedUser = null;

    /**
     * 读取指定用户的持久 Token 凭证池 (支持多设备并发、自动清理过期)
     */
    private static function getUserAuthTokens($userId) {
        $raw = self::getSetting('admin_token_' . (int)$userId, '[]');
        $tokens = json_decode($raw, true);
        if (!is_array($tokens)) return [];

        // 清理超过 30 天的过期凭证
        $now = time();
        $valid = [];
        foreach ($tokens as $item) {
            if (is_array($item) && !empty($item['hash'])) {
                $t = (int)($item['time'] ?? $now);
                if (($now - $t) < 30 * 86400) {
                    $valid[] = $item;
                }
            }
        }
        return $valid;
    }

    /**
     * 保存指定用户的持久 Token 凭证池
     */
    private static function saveUserAuthTokens($userId, array $tokens) {
        $db = DB::getInstance();
        if (empty($tokens)) {
            $stmt = $db->prepare("DELETE FROM settings WHERE key = ?");
            $stmt->execute(['admin_token_' . (int)$userId]);
        } else {
            self::setSetting('admin_token_' . (int)$userId, json_encode(array_values($tokens)));
        }
    }

    /**
     * 获取当前登录用户 (每次请求回查数据库, 禁用/删除/改角色即时生效)
     */
    public static function getCurrentUser() {
        if (self::$cachedUser !== null) {
            return self::$cachedUser;
        }
        self::$cachedUser = null;
        $db = DB::getInstance();

        // 1. 优先读取 Session
        $userId = !empty($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 0;
        $fromSession = $userId > 0;

        // 2. 若 Session 未读到，回退验证双保险安全凭证 Cookie (支持多设备并发 Token 池)
        $matchedTokenFromCookie = null;
        if ($userId <= 0 && !empty($_COOKIE['ue_admin_auth'])) {
            $parts = explode(':', (string)$_COOKIE['ue_admin_auth'], 2);
            if (count($parts) === 2) {
                $uid = (int)$parts[0];
                $token = $parts[1];
                $tokenHash = hash('sha256', $token);
                $tokens = self::getUserAuthTokens($uid);
                $matched = false;
                $matchedSecure = false;
                $updatedTokens = [];
                foreach ($tokens as $item) {
                    if (hash_equals($item['hash'] ?? '', $tokenHash)) {
                        $matched = true;
                        $matchedSecure = !empty($item['secure']);
                        // 命中当前设备有效凭证，更新活跃时间
                        $item['time'] = time();
                    }
                    $updatedTokens[] = $item;
                }
                if ($matched) {
                    $userId = $uid;
                    $matchedTokenFromCookie = [
                        'uid' => $uid,
                        'tokens' => $updatedTokens,
                        'secure' => $matchedSecure,
                    ];
                }
            }
        }

        if ($userId > 0) {
            $stmt = $db->prepare("SELECT id, email, name, role, is_owner, status, department, webhook_url, avatar, is_first_login, auth_version, created_at FROM users WHERE id = ?");
            $stmt->execute([$userId]);
            $row = $stmt->fetch();
            $stmt->closeCursor();
            if ($row && (int)$row['status'] === 1
                && (!$fromSession || (isset($_SESSION['auth_version']) && (int)$_SESSION['auth_version'] === (int)$row['auth_version']))) {
                if (!$fromSession && $matchedTokenFromCookie !== null) {
                    if ($matchedTokenFromCookie['secure']) {
                        $GLOBALS['app_force_https'] = true;
                    }
                    $_SESSION['user_id'] = (int)$row['id'];
                    $_SESSION['auth_version'] = (int)$row['auth_version'];
                    self::saveUserAuthTokens($matchedTokenFromCookie['uid'], $matchedTokenFromCookie['tokens']);
                    app_regenerate_session(true);
                } else {
                    $_SESSION['auth_version'] = (int)$row['auth_version'];
                }
                $uName = !empty($row['name']) ? $row['name'] : ($row['display_name'] ?? ($row['email'] ?? ''));
                self::$cachedUser = [
                    'id' => (int)$row['id'],
                    'email' => $row['email'] ?? '',
                    'name' => $uName,
                    'is_first_login' => (int)$row['is_first_login'],
                    'auth_version' => (int)$row['auth_version'],
                    'department' => $row['department'] ?? '',
                    'webhook_url' => $row['webhook_url'] ?? '',
                    'avatar' => self::resolveUserAvatar($row['avatar'] ?? '', (int)$row['id']),
                    'role' => $row['role'],
                    'is_owner' => !empty($row['is_owner']) ? 1 : 0,
                    'created_at' => $row['created_at'] ?? '',
                    // 兼容旧版属性
                    'username' => $row['email'] ?? '',
                    'display_name' => $uName
                ];
                $_SESSION['user_email'] = $row['email'] ?? '';
                $_SESSION['user_name'] = $uName;
                $_SESSION['username'] = $row['email'] ?? '';
                $_SESSION['display_name'] = $uName;
                $_SESSION['user_role'] = $row['role'];
                $_SESSION['is_owner'] = self::$cachedUser['is_owner'];
            } else {
                self::logout();
            }
        }
        return self::$cachedUser;
    }

    /**
     * 是否是主管理员 (系统创建者 / 所有者 Owner)
     */
    public static function isOwner() {
        $user = self::getCurrentUser();
        return $user && !empty($user['is_owner']);
    }

    /**
     * 签发管理员持久双保险凭证 Cookie (多设备并发支持，最多保留 10 台活跃设备)
     */
    private static function sendAdminAuthCookie($userId) {
        $token = bin2hex(random_bytes(32));
        $hash = hash('sha256', $token);

        // 读取并更新设备池
        $tokens = self::getUserAuthTokens($userId);
        // 新设备加入最前（记录签发时的安全传输状态，便于反代剥离协议头后恢复会话沿用 Secure）
        $isHttps = self::isHttps();
        array_unshift($tokens, ['hash' => $hash, 'time' => time(), 'secure' => $isHttps ? 1 : 0]);
        // 最多保留最近 10 台活跃设备，淘汰过旧设备
        if (count($tokens) > 10) {
            $tokens = array_slice($tokens, 0, 10);
        }
        self::saveUserAuthTokens($userId, $tokens);

        $val = ((int)$userId) . ':' . $token;
        $expire = time() + 30 * 86400;
        if (PHP_VERSION_ID >= 70300) {
            setcookie('ue_admin_auth', $val, [
                'expires' => $expire,
                'path' => '/',
                'httponly' => true,
                'samesite' => 'Lax',
                'secure' => $isHttps,
            ]);
        } else {
            setcookie('ue_admin_auth', $val, $expire, '/', '', $isHttps, true);
        }
    }

    /**
     * 是否是管理员
     */
    public static function isAdmin() {
        $user = self::getCurrentUser();
        return $user && $user['role'] === 'admin';
    }

    /**
     * 是否具备上传/编辑权限 (管理员或协作者)
     */
    public static function canManage() {
        $user = self::getCurrentUser();
        return $user && in_array($user['role'], ['admin', 'editor']);
    }

    /**
     * 是否是审阅访客角色
     */
    public static function isViewer() {
        $user = self::getCurrentUser();
        return $user && $user['role'] === 'viewer';
    }

    /**
     * 是否具备批注与回复权限 (仅限已登录成员，管理员特权兜底)
     */
    public static function canAnnotate($user = null) {
        if (!$user) $user = self::getCurrentUser();
        if (!$user) return false;
        return in_array($user['role'], ['admin', 'editor', 'viewer'], true);
    }

    /**
     * 当前用户是否被授权外发分享 (角色权限矩阵管控，管理员特权兜底)
     */
    public static function canShare($user = null) {
        if (!$user) $user = self::getCurrentUser();
        if (!$user) return false;
        if ($user['role'] === 'admin') return true;
        if ($user['role'] === 'editor') {
            return self::getSetting('perm_editor_share', '1') !== '0';
        }
        if ($user['role'] === 'viewer') {
            return self::getSetting('perm_viewer_share', '0') === '1';
        }
        return false;
    }

    /**
     * 是否允许访客下载 RP 源文件
     */
    public static function canGuestDownloadRp() {
        return self::getSetting('perm_guest_download_rp', '0') === '1';
    }

    /**
     * 是否允许访客进行页面批注
     */
    public static function canGuestAnnotate() {
        return self::getSetting('perm_guest_annotate', '0') === '1';
    }

    /**
     * 当前用户或合法访客是否被授权下载 RP 底稿源文件 (管理员/协作者默认，审阅人与访客可勾选开放)
     */
    public static function canDownloadRp($user = null, $item = null, $version = null) {
        if (!$user) $user = self::getCurrentUser();
        if ($user) {
            if (in_array($user['role'], ['admin', 'editor'])) return true;
            if ($user['role'] === 'viewer') {
                return self::getSetting('perm_viewer_download_rp', '0') === '1';
            }
            return false;
        }
        // 外部访客 (未登录)：需开启访客 RP 下载且持有合法分享访问凭据
        if ($item && $version && self::canGuestDownloadRp()) {
            return self::hasShareAccess($item, $version);
        }
        return false;
    }

    /**
     * 解析项目指定的负责人 ID 列表；空数组表示默认「全部协作者」开放模式
     */
    public static function parseItemCollaborators($item) {
        if (empty($item['collaborators'])) return [];
        $ids = array_filter(array_map('intval', explode(',', (string)$item['collaborators'])), function($v) {
            return $v > 0;
        });
        return array_values(array_unique($ids));
    }

    /**
     * 是否对指定项目拥有发版/日常协作权 (管理员、开放模式全部协作者，或指定负责人)
     */
    public static function canEditItem($item, $user = null) {
        if (!$item) return false;
        if (!$user) $user = self::getCurrentUser();
        if (!$user || !in_array($user['role'], ['admin', 'editor'], true)) return false;
        if ($user['role'] === 'admin') return true;
        // 外链沿用创建者/指定成员的配置权限，不参与原型项目的默认开放发版。
        if (($item['type'] ?? 'project') !== 'project') return self::canManageItemConfig($item, $user);
        $collabIds = self::parseItemCollaborators($item);
        if (empty($collabIds)) {
            return true;
        }
        return in_array((int)$user['id'], $collabIds, true);
    }

    /**
     * 是否对指定项目拥有基础配置修改权 (管理员、项目创建者，或指定负责人)
     * 说明：在「全部协作者」模式下，其他协作者可发版但不可随意改写他人项目的名称、分类或负责人设置
     */
    public static function canManageItemConfig($item, $user = null) {
        if (!$user) $user = self::getCurrentUser();
        if (!$user || !in_array($user['role'], ['admin', 'editor'], true)) return false;
        if ($user['role'] === 'admin') return true;
        $uid = (int)$user['id'];
        if ((int)($item['created_by'] ?? 0) === $uid) return true;
        $collabIds = self::parseItemCollaborators($item);
        return !empty($collabIds) && in_array($uid, $collabIds, true);
    }

    /**
     * 是否可调整项目的负责人范围 (仅管理员或项目创建者本人)
     */
    public static function canEditItemOwners($item, $user = null) {
        if (!$user) $user = self::getCurrentUser();
        if (!$user || !in_array($user['role'], ['admin', 'editor'], true)) return false;
        if ($user['role'] === 'admin') return true;
        return (int)($item['created_by'] ?? 0) === (int)$user['id'];
    }

    /**
     * 是否对指定项目拥有删除权 (仅管理员或项目创建者本人)
     */
    public static function canDeleteItem($item, $user = null) {
        if (!$user) $user = self::getCurrentUser();
        if (!$user || !in_array($user['role'], ['admin', 'editor'])) return false;
        if ($user['role'] === 'admin') return true;
        return (int)($item['created_by'] ?? 0) === (int)$user['id'];
    }

    /**
     * 是否对指定版本拥有删除权 (管理员或版本发布者本人)
     */
    public static function canDeleteVersion($ver, $user = null) {
        if (!$user) $user = self::getCurrentUser();
        if (!$user || !in_array($user['role'], ['admin', 'editor'])) return false;
        if ($user['role'] === 'admin') return true;
        return (int)($ver['created_by'] ?? 0) === (int)$user['id'];
    }

    public static function getItem($id) {
        $stmt = DB::getInstance()->prepare('SELECT * FROM items WHERE id = ?');
        $stmt->execute([(int)$id]);
        return $stmt->fetch();
    }

    public static function canViewItem($item) {
        return $item && self::getCurrentUser() && (self::canManage() || (int)$item['is_visible'] === 1);
    }

    public static function assetUrl($version) {
        if (empty($version['entry_file'])) return '';
        $parts = array_map('rawurlencode', explode('/', $version['entry_file']));
        return app_base_path() . '/asset.php/v' . (int)$version['id'] . '/' . implode('/', $parts);
    }

    /** 首次渲染与发布回执使用相同的版本展示字段，署名取历史快照，时间统一转为当前站点时区显示。 */
    public static function versionForClient($version) {
        $version['entry_file'] = self::assetUrl($version);
        $version['rp_file'] = !empty($version['rp_file']) ? 'available' : '';
        $version['creator_name'] = !empty($version['author_name']) ? $version['author_name'] : null;
        if (!empty($version['updated_at'])) {
            $ts = strtotime($version['updated_at'] . ' UTC');
            if ($ts) $version['updated_at'] = date('Y-m-d H:i:s', $ts);
        }
        if (!empty($version['created_at'])) {
            $ts = strtotime($version['created_at'] . ' UTC');
            if ($ts) $version['created_at'] = date('Y-m-d H:i:s', $ts);
        }
        return $version;
    }

    public static function grantShareAccess($item, $version, $code, $password, $token = '') {
        $key = $version ? (int)$version['id'] : ('link_' . (int)$item['id']);
        $_SESSION['share_grants'][$key] = [
            'code' => $code, 'token' => $token,
            'password_hash' => hash('sha256', $password), 'time' => time(),
            'item_id' => (int)$item['id']
        ];
    }

    public static function hasShareAccess($item, $version) {
        if ((int)$item['is_visible'] !== 1) return false;
        $key = $version ? (int)$version['id'] : ('link_' . (int)$item['id']);
        $grant = $_SESSION['share_grants'][$key] ?? null;
        if (!$grant || $grant['time'] < time() - 86400) return false;
        $info = $grant['code'] !== '' ? self::resolveShareCode($grant['code']) : null;
        if ($grant['code'] !== '' && (!$info || !empty($info['is_revoked']) || (int)$info['item_id'] !== (int)$item['id'])) return false;
        if ($version) {
            if ($info && (int)$info['ver_id'] > 0 && (int)$info['ver_id'] !== (int)$version['id']) return false;
            if (!$info) return false;
            if ((int)$info['ver_id'] === 0) {
                $stmt = DB::getInstance()->prepare('SELECT id FROM versions WHERE item_id = ? AND is_default = 1 LIMIT 1');
                $stmt->execute([(int)$item['id']]);
                if ((int)$stmt->fetchColumn() !== (int)$version['id']) return false;
            }
        } else {
            if (!$info) return false;
        }
        $custom = $info && $grant['code'] !== $item['share_code'];
        if (!$custom && !(int)$item['share_enabled']) return false;
        $expires = $custom ? ($info['expires_at'] ?? '') : ($item['share_expires_at'] ?? '');
        if ($expires !== '' && $expires !== null && strtotime($expires) < time()) return false;
        $password = $custom ? ($info['access_password'] ?? '') : ($item['access_password'] ?? '');
        return hash_equals(hash('sha256', trim($password)), $grant['password_hash']);
    }

    /**
     * 校验工作台访问权限 (进入工作台必须已登录内部账号)
     */
    public static function checkSiteAccess() {
        return !empty(self::getCurrentUser());
    }

    /**
     * 生成一个随机防碰撞 Base62 短码 (排除 0/o/O/1/l/I 易混淆字符)
     */
    public static function generateShortCode($length = 8) {
        $chars = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
        $maxLen = strlen($chars) - 1;
        $code = '';
        for ($i = 0; $i < $length; $i++) {
            $code .= $chars[random_int(0, $maxLen)];
        }
        return $code;
    }

    /**
     * 获取或生成单项目的专属极简短码 (8位字符, 例如 s/aB8kM9xQ)
     */
    public static function getItemShareCode($itemId) {
        $stmt = DB::getInstance()->prepare('SELECT share_code FROM items WHERE id = ?');
        $stmt->execute([(int)$itemId]);
        return $stmt->fetchColumn() ?: '';
    }

    /**
     * 解析 8 位分享短码，返回对应的 item_id、ver_id、独立密码、有效期与生效状态
     */
    public static function resolveShareCode($code) {
        $code = trim((string)$code);
        if ($code === '' || strlen($code) > 32) {
            return null;
        }
        try {
            $db = DB::getInstance();
            // 查 share_codes 表 (包含主短码与专属临时短码)
            $stmt = $db->prepare("SELECT * FROM share_codes WHERE code = ? LIMIT 1");
            $stmt->execute([$code]);
            $row = $stmt->fetch();
            if ($row) {
                // 如果已明确作废 (status = 0)
                if ((int)($row['status'] ?? 1) === 0) {
                    return [
                        'code' => $row['code'],
                        'item_id' => (int)$row['item_id'],
                        'ver_id' => (int)($row['ver_id'] ?? 0),
                        'status' => 0,
                        'is_revoked' => true
                    ];
                }

                $isCustom = !empty($row['label']) || !empty($row['access_password']) || !empty($row['expires_at']);
                return [
                    'code' => $row['code'],
                    'item_id' => (int)$row['item_id'],
                    'ver_id' => (int)($row['ver_id'] ?? 0),
                    'is_custom' => $isCustom,
                    'label' => $row['label'] ?? '',
                    'access_password' => $row['access_password'] ?? '',
                    'expires_at' => $row['expires_at'] ?? null,
                    'view_count' => (int)($row['view_count'] ?? 0),
                    'status' => 1,
                    'is_revoked' => false
                ];
            }

            // 兜底从 items 表主短码直查
            $itemStmt = $db->prepare("SELECT id, name, is_visible, share_enabled, access_password, share_expires_at FROM items WHERE share_code = ? LIMIT 1");
            $itemStmt->execute([$code]);
            $itemRow = $itemStmt->fetch();
            if ($itemRow) {
                return [
                    'code' => $code,
                    'item_id' => (int)$itemRow['id'],
                    'ver_id' => 0,
                    'is_custom' => false,
                    'label' => t('api.shares.default_main_label'),
                    'access_password' => $itemRow['access_password'] ?? '',
                    'expires_at' => $itemRow['share_expires_at'] ?? null,
                    'status' => 1,
                    'is_revoked' => false
                ];
            }

            return null;
        } catch (Exception $e) {
            return null;
        }
    }

    /**
     * 为项目创建一条专属安全分享短码
     */
    public static function createCustomShareCode($itemId, $verId = 0, $label = '', $password = '', $expiresAt = null, $createdBy = 0) {
        $itemId = (int)$itemId;
        $verId = (int)$verId;
        $label = trim((string)$label);
        $password = trim((string)$password);
        $expiresAt = !empty($expiresAt) ? $expiresAt : null;
        $createdBy = (int)$createdBy;

        $db = DB::getInstance();
        for ($retry = 0; $retry < 5; $retry++) {
            $code = self::generateShortCode(8);
            try {
                $stmt = $db->prepare("INSERT INTO share_codes (code, item_id, ver_id, label, access_password, expires_at, view_count, created_by, status) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1)");
                $stmt->execute([$code, $itemId, $verId, $label, $password, $expiresAt, $createdBy]);
                return $code;
            } catch (Exception $e) {}
        }
        return '';
    }

    /**
     * 获取指定项目所有生效中的专属临时分享记录 (排除默认主短链，供记录表展示)
     */
    public static function getItemActiveShareCodes($itemId) {
        $itemId = (int)$itemId;
        try {
            $db = DB::getInstance();
            // 查询项目默认主短码
            $mainCode = '';
            $itemStmt = $db->prepare("SELECT share_code FROM items WHERE id = ?");
            $itemStmt->execute([$itemId]);
            $itemRow = $itemStmt->fetch();
            if ($itemRow) {
                $mainCode = trim($itemRow['share_code'] ?? '');
            }

            // 联表获取创建者名字和版本名称 (兼容新模型 u.name，邮箱兜底)
            $sql = "SELECT s.*, COALESCE(NULLIF(u.name, ''), u.email) as creator_name, v.version_name 
                    FROM share_codes s 
                    LEFT JOIN users u ON s.created_by = u.id 
                    LEFT JOIN versions v ON s.ver_id = v.id 
                    WHERE s.item_id = ? AND s.status = 1 
                    ORDER BY s.created_at DESC";
            $stmt = $db->prepare($sql);
            $stmt->execute([$itemId]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $list = [];
            foreach ($rows as $r) {
                // 排除仅作为项目默认主短码的历史占位记录
                $isMainDefault = ($r['code'] === $mainCode && empty($r['label']) && empty($r['access_password']) && empty($r['expires_at']));
                if ($isMainDefault) {
                    continue;
                }

                $isExpired = false;
                if (!empty($r['expires_at'])) {
                    $isExpired = (strtotime($r['expires_at']) < time());
                }

                $list[] = [
                    'code' => $r['code'],
                    'item_id' => (int)$r['item_id'],
                    'ver_id' => (int)$r['ver_id'],
                    'version_name' => $r['version_name'] ?: t('api.shares.default_ver_label'),
                    'label' => $r['label'] ?: t('api.shares.custom_label'),
                    'has_password' => !empty($r['access_password']),
                    'access_password' => $r['access_password'] ?: '',
                    'expires_at' => $r['expires_at'] ?: '',
                    'is_expired' => $isExpired,
                    'view_count' => (int)($r['view_count'] ?? 0),
                    'creator_name' => $r['creator_name'] ?: t('common.role.admin'),
                    'created_at' => $r['created_at']
                ];
            }
            return $list;
        } catch (Exception $e) {
            return [];
        }
    }

    /**
     * 作废某条专属分享短码
     */
    public static function revokeShareCode($code, $itemId) {
        $code = trim((string)$code);
        $itemId = (int)$itemId;
        if ($code === '' || $itemId <= 0) return false;
        try {
            $db = DB::getInstance();
            $stmt = $db->prepare("UPDATE share_codes SET status = 0 WHERE code = ? AND item_id = ?");
            $stmt->execute([$code, $itemId]);
            return ($stmt->rowCount() > 0);
        } catch (Exception $e) {
            return false;
        }
    }

    /**
     * 专属分享短码访问次数自增计数
     */
    public static function recordShareCodeView($code) {
        $code = trim((string)$code);
        if ($code === '') return;
        try {
            $db = DB::getInstance();
            $stmt = $db->prepare("UPDATE share_codes SET view_count = view_count + 1 WHERE code = ?");
            $stmt->execute([$code]);
        } catch (Exception $e) {}
    }

    /**
     * 重置某个项目的所有短码 (一键作废之前外发的所有短链，并生成全新短码)
     */
    public static function rotateItemShareToken($itemId) {
        $itemId = (int)$itemId;
        $db = DB::getInstance();
        $db->beginTransaction();
        try {
            $db->exec('UPDATE items SET id = id WHERE 0');
            // 清理 share_codes 旧数据
            $stmt = $db->prepare("DELETE FROM share_codes WHERE item_id = ?");
            $stmt->execute([$itemId]);

            // 生成全新短码
            $newCode = self::generateShortCode(8);
            $db->prepare("UPDATE items SET share_code = ? WHERE id = ?")->execute([$newCode, $itemId]);
            $db->prepare("INSERT INTO share_codes (code, item_id, ver_id) VALUES (?, ?, 0)")->execute([$newCode, $itemId]);
            $db->commit();
            return $newCode;
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            error_log('rotateItemShareToken error: ' . $e->getMessage());
            return '';
        }
    }

    /**
     * 检查某个项目是否被停用了外链分享
     */
    public static function isItemShareDisabled($itemId) {
        $itemId = (int)$itemId;
        try {
            $db = DB::getInstance();
            $stmt = $db->prepare("SELECT share_enabled FROM items WHERE id = ?");
            $stmt->execute([$itemId]);
            $row = $stmt->fetch();
            if ($row && isset($row['share_enabled'])) {
                return (int)$row['share_enabled'] === 0;
            }
        } catch (Exception $e) {}
        return self::getSetting('item_share_disabled_' . $itemId, '0') === '1';
    }

    /**
     * 切换某个项目的分享开启/停用状态
     */
    public static function toggleItemShareStatus($itemId) {
        $itemId = (int)$itemId;
        $isDisabled = self::isItemShareDisabled($itemId);
        $newEnabled = $isDisabled ? 1 : 0;
        try {
            $db = DB::getInstance();
            $db->prepare("UPDATE items SET share_enabled = ? WHERE id = ?")->execute([$newEnabled, $itemId]);
        } catch (Exception $e) {}
        self::setSetting('item_share_disabled_' . $itemId, $newEnabled ? '0' : '1');
        return $newEnabled === 1; // 返回 true 表示当前开启了外链分享
    }

    /**
     * 获取项目完整分享配置 (用于分享设置弹窗)
     */
    public static function getItemShareSettings($itemId) {
        $itemId = (int)$itemId;
        $db = DB::getInstance();
        $stmt = $db->prepare("SELECT id, name, type, access_password, share_code, share_enabled, share_expires_at FROM items WHERE id = ?");
        $stmt->execute([$itemId]);
        $row = $stmt->fetch();
        if (!$row) return null;

        // 如果还没有 short code，自动生成一个并固化
        $code = trim($row['share_code'] ?? '');
        if ($code === '') {
            $code = self::getItemShareCode($itemId);
            $row['share_code'] = $code;
        }

        $isExpired = false;
        if (!empty($row['share_expires_at'])) {
            $isExpired = (strtotime($row['share_expires_at']) < time());
        }

        return [
            'id' => (int)$row['id'],
            'name' => $row['name'],
            'type' => $row['type'],
            'share_code' => $code,
            'share_enabled' => (int)($row['share_enabled'] ?? 1) === 1,
            'share_expires_at' => $row['share_expires_at'] ?? '',
            'is_expired' => $isExpired,
            'access_password' => $row['access_password'] ?? '',
            'has_password' => !empty($row['access_password']),
            'active_shares' => self::getItemActiveShareCodes($itemId)
        ];
    }

    private static function isHttps() {
        return app_is_https();
    }

    /**
     * 获取客户端真实物理 IP (自适应反向代理与 CDN)
     */
    public static function getClientIp() {
        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        if (strpos($ip, ',') !== false) {
            $ip = trim(explode(',', $ip)[0]);
        }
        return preg_replace('/[^0-9a-fA-F:\.]/', '', $ip) ?: '127.0.0.1';
    }

    private static function throttleKey($scope, $byIp = true) {
        return 'throttle_' . hash('sha256', $scope . '|' . ($byIp ? self::getClientIp() : ''));
    }

    /**
     * 提取客户端当前 IP 所属常用网段摘要（IPv4 按 /24，IPv6 按 /64）
     */
    private static function clientNetworkDigest() {
        $ip = self::getClientIp();
        $packed = @inet_pton($ip);
        if ($packed === false) {
            return hash('sha256', 'raw:' . $ip);
        }
        if (strlen($packed) === 4) {
            return hash('sha256', 'v4:' . substr($packed, 0, 3));
        }
        if (strlen($packed) === 16) {
            return hash('sha256', 'v6:' . substr($packed, 0, 8));
        }
        return hash('sha256', 'raw:' . $ip);
    }

    private static function trustedNetworksKey($email) {
        return 'login_trusted_nets_' . hash('sha256', strtolower(trim((string)$email)));
    }

    /** 判断指定账号近期是否曾在当前网段成功登录（30 天有效） */
    public static function isTrustedLoginNetwork($email) {
        $email = strtolower(trim((string)$email));
        if ($email === '') {
            return false;
        }
        $raw = self::getSetting(self::trustedNetworksKey($email), '');
        if ($raw === '') {
            return false;
        }
        $nets = json_decode($raw, true);
        if (!is_array($nets)) {
            return false;
        }
        $digest = self::clientNetworkDigest();
        $lastTs = isset($nets[$digest]) ? (int)$nets[$digest] : 0;
        return $lastTs > 0 && (time() - $lastTs) <= 30 * 86400;
    }

    /** 记录或刷新账号近期成功登录过的网段（最多保留 8 个 30 天内常用网段） */
    private static function recordTrustedLoginNetwork($email) {
        $email = strtolower(trim((string)$email));
        if ($email === '') {
            return;
        }
        $key = self::trustedNetworksKey($email);
        $now = time();
        $digest = self::clientNetworkDigest();
        $db = DB::getInstance();
        $ownTx = !$db->inTransaction();
        if ($ownTx) {
            $db->beginTransaction();
        }
        try {
            if ($ownTx) {
                $db->exec('UPDATE settings SET key = key WHERE 0');
            }
            $stmt = $db->prepare("SELECT value FROM settings WHERE key = ?");
            $stmt->execute([$key]);
            $row = $stmt->fetch();
            $stmt->closeCursor();

            $nets = $row ? json_decode($row['value'], true) : [];
            if (!is_array($nets)) {
                $nets = [];
            }
            foreach ($nets as $netHash => $ts) {
                if (!is_string($netHash) || ($now - (int)$ts) > 30 * 86400) {
                    unset($nets[$netHash]);
                }
            }
            $nets[$digest] = $now;
            arsort($nets, SORT_NUMERIC);
            if (count($nets) > 8) {
                $nets = array_slice($nets, 0, 8, true);
            }
            $db->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")->execute([$key, json_encode($nets)]);
            if ($ownTx) {
                $db->commit();
            }
        } catch (Throwable $e) {
            if ($ownTx && $db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }
    }

    /**
     * 简易失败限速: 按 场景+IP 独立计数, 窗口过后自动重置
     */
    public static function checkThrottle($scope, $maxAttempts, $windowSeconds, $byIp = true) {
        $db = DB::getInstance();
        $key = self::throttleKey($scope, $byIp);
        $stmt = $db->prepare("SELECT value FROM settings WHERE key = ?");
        $stmt->execute([$key]);
        $row = $stmt->fetch();
        $stmt->closeCursor();
        if (!$row) return true;
        $data = json_decode($row['value'], true);
        if (!is_array($data) || !isset($data['ts'], $data['c'])) return true;
        if (time() - (int)$data['ts'] > $windowSeconds) return true;
        return (int)$data['c'] < $maxAttempts;
    }

    /**
     * 在写锁事务中一次性校验并原子占位多条限速规则，任一超限则全部回滚
     * @param array $rules [['scope' => string, 'max' => int, 'window' => int, 'by_ip' => bool], ...]
     * @return string|null 全部通过并占位返回 null；首个超限规则返回对应 scope
     */
    private static function reserveThrottleRules(array $rules) {
        if (empty($rules)) {
            return null;
        }
        $db = DB::getInstance();
        $ownTx = !$db->inTransaction();
        if ($ownTx) {
            $db->beginTransaction();
        }
        try {
            if ($ownTx) {
                $db->exec('UPDATE settings SET key = key WHERE 0');
            }
            $now = time();
            $pendingWrites = [];
            $selectStmt = $db->prepare("SELECT value FROM settings WHERE key = ?");
            foreach ($rules as $rule) {
                $scope = (string)$rule['scope'];
                $max = (int)$rule['max'];
                $window = (int)$rule['window'];
                $byIp = !isset($rule['by_ip']) || (bool)$rule['by_ip'];
                $key = self::throttleKey($scope, $byIp);

                $selectStmt->execute([$key]);
                $row = $selectStmt->fetch();
                $selectStmt->closeCursor();

                $data = $row ? json_decode($row['value'], true) : null;
                if (!is_array($data) || !isset($data['ts'], $data['c']) || ($now - (int)$data['ts']) > $window) {
                    $newCount = 1;
                    $ts = $now;
                } else {
                    $curCount = (int)$data['c'];
                    if ($curCount >= $max) {
                        if ($ownTx) {
                            $db->rollBack();
                        }
                        return $scope;
                    }
                    $newCount = $curCount + 1;
                    $ts = (int)$data['ts'];
                }
                $pendingWrites[$key] = json_encode(['c' => $newCount, 'ts' => $ts]);
            }

            $saveStmt = $db->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
            foreach ($pendingWrites as $k => $v) {
                $saveStmt->execute([$k, $v]);
            }
            if ($ownTx) {
                $db->commit();
            }
            return null;
        } catch (Throwable $e) {
            if ($ownTx && $db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }
    }

    /** 单维度原子限速检查并占位（通过并占位返回 true，超限拦截返回 false） */
    public static function reserveThrottleAttempt($scope, $maxAttempts, $windowSeconds, $byIp = true) {
        return self::reserveThrottleRules([[
            'scope' => $scope,
            'max' => $maxAttempts,
            'window' => $windowSeconds,
            'by_ip' => $byIp,
        ]]) === null;
    }

    /** 原子退还 1 次预占限速次数（不清除历史失败累计） */
    public static function releaseThrottleAttempt($scope, $byIp = true) {
        $db = DB::getInstance();
        $key = self::throttleKey($scope, $byIp);
        $ownTx = !$db->inTransaction();
        if ($ownTx) {
            $db->beginTransaction();
        }
        try {
            if ($ownTx) {
                $db->exec('UPDATE settings SET key = key WHERE 0');
            }
            $stmt = $db->prepare("SELECT value FROM settings WHERE key = ?");
            $stmt->execute([$key]);
            $row = $stmt->fetch();
            $stmt->closeCursor();
            if ($row) {
                $data = json_decode($row['value'], true);
                if (is_array($data) && isset($data['c'], $data['ts'])) {
                    $next = max(0, (int)$data['c'] - 1);
                    if ($next <= 0) {
                        $db->prepare("DELETE FROM settings WHERE key = ?")->execute([$key]);
                    } else {
                        $data['c'] = $next;
                        $db->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")->execute([$key, json_encode($data)]);
                    }
                }
            }
            if ($ownTx) {
                $db->commit();
            }
        } catch (Throwable $e) {
            if ($ownTx && $db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }
    }

    public static function recordThrottleFailure($scope, $windowSeconds = 900, $byIp = true) {
        $db = DB::getInstance();
        $key = self::throttleKey($scope, $byIp);
        $ownTx = !$db->inTransaction();
        if ($ownTx) {
            $db->beginTransaction();
        }
        try {
            if ($ownTx) {
                $db->exec('UPDATE settings SET key = key WHERE 0');
            }
            $stmt = $db->prepare("SELECT value FROM settings WHERE key = ?");
            $stmt->execute([$key]);
            $row = $stmt->fetch();
            $stmt->closeCursor();
            $data = $row ? json_decode($row['value'], true) : null;
            $now = time();
            if (!is_array($data) || !isset($data['ts'], $data['c']) || $now - (int)$data['ts'] > $windowSeconds) {
                $data = ['c' => 1, 'ts' => $now];
            } else {
                $data['c'] = (int)$data['c'] + 1;
            }
            $db->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")->execute([$key, json_encode($data)]);
            if ($ownTx) {
                $db->commit();
            }
        } catch (Throwable $e) {
            if ($ownTx && $db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }
    }

    public static function hitThrottle($scope, $windowSeconds = 60, $byIp = true) {
        self::recordThrottleFailure($scope, $windowSeconds, $byIp);
    }

    public static function clearThrottle($scope, $byIp = true) {
        $db = DB::getInstance();
        $key = self::throttleKey($scope, $byIp);
        $db->prepare("DELETE FROM settings WHERE key = ?")->execute([$key]);
    }

    /**
     * 用户管理：获取用户列表 (邮箱 + 姓名二元架构，Owner 置顶，严格隔离未审批与已驳回申请)
     */
    public static function listUsers() {
        $db = DB::getInstance();
        $stmt = $db->query("SELECT id, email, name, role, is_owner, status, department, webhook_url, created_at, (SELECT COUNT(*) FROM items WHERE created_by = users.id OR (type = 'project' AND instr(',' || collaborators || ',', ',' || users.id || ',') > 0)) as item_count FROM users WHERE status NOT IN (0, 2) ORDER BY is_owner DESC, CASE role WHEN 'admin' THEN 0 WHEN 'editor' THEN 1 WHEN 'viewer' THEN 2 ELSE 3 END, created_at ASC, id ASC");
        $rows = $stmt->fetchAll();
        // 统计当前保留的版本；同名覆盖更新原记录，交接不改写原上传者。
        $publicationStats = [];
        $stats = $db->query("SELECT v.created_by, COUNT(*) AS version_count, COUNT(DISTINCT v.item_id) AS project_count FROM versions v INNER JOIN items i ON i.id = v.item_id WHERE i.type = 'project' GROUP BY v.created_by")->fetchAll();
        foreach ($stats as $stat) $publicationStats[(int)$stat['created_by']] = $stat;
        foreach ($rows as &$row) {
            $row['username'] = $row['email'];
            $row['display_name'] = $row['name'];
            // item_count 仅服务于交接：归属与指定关系不因账号停用或发版范围变化而消失。
            $row['item_count'] = (int)$row['item_count'];
            $stat = isset($publicationStats[(int)$row['id']]) ? $publicationStats[(int)$row['id']] : [];
            $row['published_version_count'] = isset($stat['version_count']) ? (int)$stat['version_count'] : 0;
            $row['published_project_count'] = isset($stat['project_count']) ? (int)$stat['project_count'] : 0;
        }
        return $rows;
    }

    /**
     * 个人中心品牌折纸大象延伸头像白名单与随机分配
     */
    public static function getAllAvatarIds() {
        $poses = ['leap', 'shoulder', 'head', 'trunk', 'sit', 'bow', 'walk', 'rest'];
        $themes = ['sky', 'mint', 'amber', 'violet', 'coral', 'indigo'];
        $ids = [];
        foreach ($poses as $pose) {
            foreach ($themes as $theme) {
                // 标准 Logo 固定原色；其他造型可选择任意配色。
                if ($pose === 'leap' && $theme !== 'sky') {
                    continue;
                }
                $ids[] = $pose . '-' . $theme;
            }
        }
        return $ids;
    }

    public static function isValidAvatar($avatar) {
        return is_string($avatar) && in_array($avatar, self::getAllAvatarIds(), true);
    }

    public static function pickRandomAvatar() {
        $ids = self::getAllAvatarIds();
        $index = random_int(0, count($ids) - 1);
        return $ids[$index];
    }

    public static function resolveUserAvatar($avatar, $seed = 0) {
        $avatar = trim((string)$avatar);
        if (self::isValidAvatar($avatar)) {
            return $avatar;
        }
        $ids = self::getAllAvatarIds();
        $seedInt = (int)$seed;
        if ($seedInt > 0) {
            return $ids[$seedInt % count($ids)];
        }
        return $ids[0];
    }

    /**
     * 用户管理：创建用户 (邮箱 + 真实姓名)
     */
    public static function createUser($email, $name, $password, $role = 'editor', $department = '', $webhookUrl = '', $avatar = null) {
        $db = DB::getInstance();
        
        $email = trim(strtolower($email));
        $name = trim($name);
        if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ['success' => false, 'message' => t('api.auth.invalid_email')];
        }
        if (strlen($email) > 100) {
            return ['success' => false, 'message' => t('api.auth.email_len_100')];
        }
        if (empty($name)) {
            return ['success' => false, 'message' => t('api.auth.name_empty')];
        }
        if (mb_strlen($name, 'UTF-8') > 20) {
            return ['success' => false, 'message' => t('api.auth.name_len_20')];
        }
        $passwordError = app_password_length_error($password);
        if ($passwordError !== '') {
            return ['success' => false, 'message' => $passwordError];
        }
        if (mb_strlen($department, 'UTF-8') > 30) {
            return ['success' => false, 'message' => t('api.auth.dept_len_30')];
        }
        if (mb_strlen($webhookUrl, 'UTF-8') > 1000) {
            return ['success' => false, 'message' => t('api.auth.webhook_len_1000')];
        }
        $trimmedWb = trim($webhookUrl);
        if ($trimmedWb !== '' && !Webhook::isAllowedUrl($trimmedWb)) {
            return ['success' => false, 'message' => t('webhook.err_url')];
        }

        // 检查邮箱冲突
        $check = $db->prepare("SELECT id FROM users WHERE email = ?");
        $check->execute([$email]);
        $hasUser = (bool)$check->fetch();
        $check->closeCursor();
        if ($hasUser) {
            return ['success' => false, 'message' => t('api.auth.email_taken')];
        }

        $hash = password_hash($password, PASSWORD_DEFAULT);
        $roleFinal = in_array($role, ['admin', 'editor', 'viewer']) ? $role : 'editor';
        $avatarFinal = ($avatar !== null && self::isValidAvatar((string)$avatar)) ? (string)$avatar : self::pickRandomAvatar();
        $stmt = $db->prepare("INSERT INTO users (email, name, password_hash, role, is_owner, status, is_first_login, department, webhook_url, avatar) VALUES (?, ?, ?, ?, 0, 1, 1, ?, ?, ?)");
        $stmt->execute([$email, $name, $hash, $roleFinal, trim($department), trim($webhookUrl), $avatarFinal]);
        
        return ['success' => true, 'id' => (int)$db->lastInsertId()];
    }

    /**
     * 用户管理：更新用户 (含主管理员所有者保护与平级防背刺护城河)
     */
    public static function updateUser($id, $role = null, $status = null, $newPassword = null, $name = null, $email = null, $department = null, $webhookUrl = null) {
        $db = DB::getInstance();
        $currUser = self::getCurrentUser();

        // 查出目标用户现状
        $stmtCurr = $db->prepare("SELECT id, email, name, role, is_owner, status FROM users WHERE id = ?");
        $stmtCurr->execute([(int)$id]);
        $targetUser = $stmtCurr->fetch();
        $stmtCurr->closeCursor();
        if (!$targetUser) {
            return ['success' => false, 'message' => t('api.auth.user_not_found')];
        }

        $isCurrOwner = !empty($currUser['is_owner']);
        $isTargetOwner = !empty($targetUser['is_owner']);

        // 护城河 1: 任何非 Owner 用户，严禁篡改、降级、停用或修改主管理员 (Owner)
        if ($isTargetOwner && (int)$currUser['id'] !== (int)$id) {
            return ['success' => false, 'message' => t('api.auth.owner_only_self')];
        }

        // 护城河 2: 管理员（非 Owner）禁止修改其他管理员
        if (!$isCurrOwner && $targetUser['role'] === 'admin' && (int)$currUser['id'] !== (int)$id) {
            return ['success' => false, 'message' => t('api.auth.admin_no_manage_other_admin')];
        }

        // 防锁死保护 1: 不能降级或停用当前登录的管理员自己
        if ($currUser && (int)$currUser['id'] === (int)$id) {
            if ($role !== null && $role !== 'admin' && $targetUser['role'] === 'admin') {
                return ['success' => false, 'message' => t('api.auth.cannot_demote_self')];
            }
            if ($status !== null && (int)$status !== 1) {
                return ['success' => false, 'message' => t('api.auth.cannot_disable_self')];
            }
        }

        // 防锁死保护 2: 系统唯一有效管理员不可被降级或停用
        if ($targetUser['role'] === 'admin' && (($role !== null && $role !== 'admin') || ($status !== null && (int)$status !== 1))) {
            $adminCount = (int)$db->query("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 1")->fetchColumn();
            if ($adminCount <= 1) {
                return ['success' => false, 'message' => t('api.auth.must_keep_one_admin')];
            }
        }

        $fields = [];
        $params = [];

        if ($role !== null && in_array($role, ['admin', 'editor', 'viewer'])) {
            if ($isTargetOwner && $role !== 'admin') {
                return ['success' => false, 'message' => t('api.auth.owner_no_demote')];
            }
            $fields[] = "role = ?";
            $params[] = $role;
        }
        if ($status !== null) {
            if ($isTargetOwner && (int)$status !== 1) {
                return ['success' => false, 'message' => t('api.auth.owner_no_disable')];
            }
            // 启用为 1，停用设为 3 (彻底避免与待审批申请 status=0 混淆)
            $stFinal = ((int)$status === 1) ? 1 : 3;
            $fields[] = "status = ?";
            $params[] = $stFinal;
        }
        if ($name !== null) {
            $trimmedName = trim($name);
            if ($trimmedName === '') {
                return ['success' => false, 'message' => t('api.auth.name_empty')];
            }
            if (mb_strlen($trimmedName, 'UTF-8') > 20) {
                return ['success' => false, 'message' => t('api.auth.name_len_20')];
            }
            $fields[] = "name = ?";
            $params[] = $trimmedName;
        }
        if ($email !== null) {
            $cleanEmail = trim(strtolower($email));
            if (strlen($cleanEmail) > 100) {
                return ['success' => false, 'message' => t('api.auth.email_len_100')];
            }
            if ($cleanEmail === '' || !filter_var($cleanEmail, FILTER_VALIDATE_EMAIL)) {
                return ['success' => false, 'message' => t('api.auth.invalid_email')];
            }
            $chkEmail = $db->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
            $chkEmail->execute([$cleanEmail, (int)$id]);
            $hasDupEmail = (bool)$chkEmail->fetch();
            $chkEmail->closeCursor();
            if ($hasDupEmail) {
                return ['success' => false, 'message' => t('api.auth.email_taken_other')];
            }
            $fields[] = "email = ?";
            $params[] = $cleanEmail;
        }
        if ($department !== null) {
            $trimmedDept = trim($department);
            if (mb_strlen($trimmedDept, 'UTF-8') > 30) {
                return ['success' => false, 'message' => t('api.auth.dept_len_30')];
            }
            $fields[] = "department = ?";
            $params[] = $trimmedDept;
        }
        if ($webhookUrl !== null) {
            $trimmedWb = trim($webhookUrl);
            if (mb_strlen($trimmedWb, 'UTF-8') > 1000) {
                return ['success' => false, 'message' => t('api.auth.webhook_len_1000')];
            }
            if ($trimmedWb !== '' && !Webhook::isAllowedUrl($trimmedWb)) {
                return ['success' => false, 'message' => t('webhook.err_url')];
            }
            $fields[] = "webhook_url = ?";
            $params[] = $trimmedWb;
        }
        $changingPassword = $newPassword !== null && $newPassword !== '';
        if ($changingPassword) {
            $passwordError = app_password_length_error($newPassword);
            if ($passwordError !== '') {
                return ['success' => false, 'message' => $passwordError];
            }
            $fields[] = "auth_version = auth_version + 1";
            $fields[] = "password_hash = ?";
            $params[] = password_hash($newPassword, PASSWORD_DEFAULT);
        }

        if (empty($fields)) {
            return ['success' => false, 'message' => t('api.auth.no_updates')];
        }

        $params[] = (int)$id;
        $sql = "UPDATE users SET " . implode(', ', $fields) . ", updated_at = CURRENT_TIMESTAMP WHERE id = ?";
        $db->beginTransaction();
        try {
            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            if ($changingPassword) self::saveUserAuthTokens((int)$id, []);
            if ($changingPassword || (!empty($cleanEmail) && $cleanEmail !== $targetUser['email'])
                || ($status !== null && $stFinal !== (int)$targetUser['status'])) {
                self::deletePasswordReset($db, $id);
            }
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            throw $e;
        }

        // 如果修改的对象是当前登录用户自己，即时同步当前内存缓存与 Session
        if ($currUser && (int)$currUser['id'] === (int)$id) {
            if ($changingPassword) {
                app_regenerate_session(!empty($_SESSION['remember_me']));
                $newVer = (int)$currUser['auth_version'] + 1;
                $_SESSION['auth_version'] = $newVer;
                if (self::$cachedUser) {
                    self::$cachedUser['auth_version'] = $newVer;
                }
            }
            if ($name !== null) {
                $_SESSION['user_name'] = trim($name);
                $_SESSION['display_name'] = trim($name);
                if (self::$cachedUser) {
                    self::$cachedUser['name'] = trim($name);
                    self::$cachedUser['display_name'] = trim($name);
                }
            }
            if ($email !== null && !empty($cleanEmail)) {
                $_SESSION['user_email'] = $cleanEmail;
                $_SESSION['username'] = $cleanEmail;
                if (self::$cachedUser) {
                    self::$cachedUser['email'] = $cleanEmail;
                    self::$cachedUser['username'] = $cleanEmail;
                }
            }
            if ($webhookUrl !== null && self::$cachedUser) {
                self::$cachedUser['webhook_url'] = trim($webhookUrl);
            }
        }

        return ['success' => true];
    }

    /**
     * 用户管理：删除用户 (含主管理员所有者保护与平级防背刺护城河)
     */
    public static function deleteUser($id) {
        $db = DB::getInstance();
        $currUser = self::getCurrentUser();
        $id = (int)$id;

        if ($currUser && (int)$currUser['id'] === $id) {
            return ['success' => false, 'message' => t('api.auth.cannot_delete_self')];
        }

        $stmt = $db->prepare("SELECT id, email, role, is_owner FROM users WHERE id = ?");
        $stmt->execute([$id]);
        $targetUser = $stmt->fetch();
        $stmt->closeCursor();
        if (!$targetUser) {
            return ['success' => false, 'message' => t('api.auth.user_deleted_missing')];
        }

        // 护城河 1: 任何人都绝对不可删除主管理员 (Owner)
        if (!empty($targetUser['is_owner'])) {
            return ['success' => false, 'message' => t('api.auth.owner_no_delete')];
        }

        // 护城河 2: 管理员禁止删除其他管理员
        $isCurrOwner = !empty($currUser['is_owner']);
        if (!$isCurrOwner && $targetUser['role'] === 'admin') {
            return ['success' => false, 'message' => t('api.auth.admin_no_delete_other_admin')];
        }

        // 防孤儿死锁: 确保全站至少有一位管理员
        if ($targetUser['role'] === 'admin') {
            $adminCount = (int)$db->query("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 1")->fetchColumn();
            if ($adminCount <= 1) {
                return ['success' => false, 'message' => t('api.auth.must_keep_one_admin_del')];
            }
        }

        // 防孤儿资产: 若名下仍有负责的项目，强制要求先完成工作交接
        $db->beginTransaction();
        try {
            $db->exec('UPDATE items SET id = id WHERE 0');
            $stmtItems = $db->prepare("SELECT COUNT(*) FROM items WHERE created_by = ? OR (type = 'project' AND instr(',' || collaborators || ',', ?) > 0)");
            $stmtItems->execute([$id, ',' . $id . ',']);
            $itemCount = (int)$stmtItems->fetchColumn();
            $stmtItems->closeCursor();
            if ($itemCount > 0) {
                $db->rollBack();
                return ['success' => false, 'message' => t('api.auth.delete_needs_handover', ['count' => $itemCount])];
            }

            $db->prepare("DELETE FROM settings WHERE key = ?")->execute(['admin_token_' . $id]);
            $db->prepare('DELETE FROM mcp_tokens WHERE user_id = ?')->execute([$id]);
            $stmtDel = $db->prepare("DELETE FROM users WHERE id = ?");
            $stmtDel->execute([$id]);
            self::deletePasswordReset($db, $id);
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            throw $e;
        }
        return ['success' => true];
    }

    /**
     * 成员离职/转岗资产交接：将原负责人名下的全部项目批量交接给指定成员
     */
    public static function handoverUserProjects($fromUserId, $toUserId, $deactivateFrom = false) {
        $db = DB::getInstance();
        if (!self::isAdmin()) {
            return ['success' => false, 'message' => t('api.auth.handover_admin_only')];
        }

        $fromUserId = (int)$fromUserId;
        $toUserId = (int)$toUserId;

        if ($fromUserId <= 0 || $toUserId <= 0) {
            return ['success' => false, 'message' => t('api.auth.handover_select_both')];
        }
        if ($fromUserId === $toUserId) {
            return ['success' => false, 'message' => t('api.auth.handover_same_user')];
        }

        // 验证原用户
        $stmtFrom = $db->prepare("SELECT id, email, name, role, is_owner FROM users WHERE id = ?");
        $stmtFrom->execute([$fromUserId]);
        $fromUser = $stmtFrom->fetch();
        $stmtFrom->closeCursor();
        if (!$fromUser) {
            return ['success' => false, 'message' => t('api.auth.handover_from_missing')];
        }

        $actor = self::getCurrentUser();
        if (empty($actor['is_owner']) && ($fromUser['role'] === 'admin' || !empty($fromUser['is_owner']))) {
            return ['success' => false, 'message' => t('api.auth.handover_no_other_admin')];
        }
        if ($deactivateFrom && ($fromUserId === (int)$actor['id'] || !empty($fromUser['is_owner']))) {
            return ['success' => false, 'message' => t('api.auth.handover_cannot_disable')];
        }

        // 验证接管人 (必须是正常状态的管理员或协作者)
        $stmtTo = $db->prepare("SELECT id, email, name, role, status FROM users WHERE id = ?");
        $stmtTo->execute([$toUserId]);
        $toUser = $stmtTo->fetch();
        $stmtTo->closeCursor();
        if (!$toUser || !in_array($toUser['role'], ['admin', 'editor']) || (int)$toUser['status'] !== 1) {
            return ['success' => false, 'message' => t('api.auth.handover_target_role')];
        }

        try {
            $db->beginTransaction();
            $db->exec('UPDATE items SET id = id WHERE 0');
            // 同时交接创建者归属与指定负责人资格；默认开放项目不会因此变为指定模式。
            $stmtTo->execute([$toUserId]);
            $toUser = $stmtTo->fetch();
            $stmtTo->closeCursor();
            if (!$toUser || !in_array($toUser['role'], ['admin', 'editor'], true) || (int)$toUser['status'] !== 1) throw new DomainException(t('api.auth.handover_target_changed'));
            $stmtHandoverItems = $db->prepare("SELECT id, created_by, collaborators FROM items WHERE created_by = ? OR (type = 'project' AND instr(',' || collaborators || ',', ?) > 0)");
            $stmtHandoverItems->execute([$fromUserId, ',' . $fromUserId . ',']);
            $handoverItems = $stmtHandoverItems->fetchAll();
            $stmtHandoverItems->closeCursor();
            $projectCount = count($handoverItems);

            if ($projectCount > 0) {
                $stmtUpdate = $db->prepare("UPDATE items SET created_by = ? WHERE created_by = ?");
                $stmtUpdate->execute([$toUserId, $fromUserId]);

                // 若被交接项目处于指定负责人模式且包含原负责人，将其替换为接管人（全部协作者模式保持空值）
                foreach ($handoverItems as $hi) {
                    $cList = self::parseItemCollaborators($hi);
                    if (!empty($cList) && in_array($fromUserId, $cList, true)) {
                        $replaced = array_map(function($v) use ($fromUserId, $toUserId) {
                            return $v === $fromUserId ? $toUserId : $v;
                        }, $cList);
                        $newCollabStr = implode(',', array_values(array_unique($replaced)));
                        if ($newCollabStr !== (string)$hi['collaborators']) {
                            $db->prepare("UPDATE items SET collaborators = ? WHERE id = ?")->execute([$newCollabStr, $hi['id']]);
                        }
                    }
                }
            }

            // 是否同时停用原成员账号 (Owner 禁止停用)
            if ($deactivateFrom && empty($fromUser['is_owner'])) {
                $stmtDeact = $db->prepare("UPDATE users SET status = 3 WHERE id = ?");
                $stmtDeact->execute([$fromUserId]);
            }

            $db->commit();

            $currUser = self::getCurrentUser();
            self::recordLoginLog(
                $currUser['email'] ?? 'admin',
                1,
                t('api.auth.handover_log', [
                    'from' => $fromUser['name'],
                    'count' => $projectCount,
                    'to' => $toUser['name'],
                    'deactivated' => $deactivateFrom ? t('api.auth.handover_log_deactivated') : ''
                ])
            );

            return [
                'success' => true,
                'project_count' => $projectCount,
                'message' => t('api.auth.handover_ok', ['count' => $projectCount, 'to' => $toUser['name']])
            ];
        } catch (Exception $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            error_log('handoverUserProjects: ' . $e->getMessage());
            return ['success' => false, 'message' => t('api.auth.handover_fail')];
        }
    }

    /**
     * 核心权限交接：移交主管理员 (Transfer Ownership)
     * 仅当前主管理员有权执行，需严格验证当前主管理员自身登录密码
     */
    public static function transferOwnership($targetUserId, $confirmPassword) {
        $db = DB::getInstance();
        $currUser = self::getCurrentUser();
        if (!$currUser || empty($currUser['is_owner'])) {
            return ['success' => false, 'message' => t('api.auth.transfer_owner_only')];
        }

        $targetUserId = (int)$targetUserId;
        if ($targetUserId <= 0 || (int)$currUser['id'] === $targetUserId) {
            return ['success' => false, 'message' => t('api.auth.transfer_select_target')];
        }

        // 在写锁内重新核验身份，不能使用请求早期缓存的 Owner 状态授权。
        try {
            $db->beginTransaction();
            $db->exec('UPDATE users SET id = id WHERE 0');
            $stmtOwner = $db->prepare('SELECT * FROM users WHERE id = ?');
            $stmtOwner->execute([(int)$currUser['id']]);
            $ownerRow = $stmtOwner->fetch();
            $stmtOwner->closeCursor();
            if (!$ownerRow || !(int)$ownerRow['is_owner'] || $ownerRow['role'] !== 'admin' || (int)$ownerRow['status'] !== 1) {
                throw new DomainException(t('api.auth.transfer_owner_changed'));
            }
            if (!password_verify($confirmPassword, $ownerRow['password_hash'])) {
                throw new DomainException(t('api.auth.transfer_bad_pwd'));
            }

            // 验证目标用户必须是有效管理员
            $stmtTarget = $db->prepare("SELECT id, email, name, role, status FROM users WHERE id = ?");
            $stmtTarget->execute([$targetUserId]);
            $targetUser = $stmtTarget->fetch();
            $stmtTarget->closeCursor();
            if (!$targetUser || $targetUser['role'] !== 'admin' || (int)$targetUser['status'] !== 1) {
                throw new DomainException(t('api.auth.transfer_target_invalid'));
            }

            $clear = $db->prepare('UPDATE users SET is_owner = 0 WHERE id = ? AND is_owner = 1 AND role = ? AND status = 1');
            $clear->execute([(int)$currUser['id'], 'admin']);
            $assign = $db->prepare('UPDATE users SET is_owner = 1 WHERE id = ? AND role = ? AND status = 1');
            $assign->execute([$targetUserId, 'admin']);
            if ($clear->rowCount() !== 1 || $assign->rowCount() !== 1) throw new DomainException(t('api.auth.transfer_admin_changed'));
            $db->commit();

            $_SESSION['is_owner'] = 0;
            if (self::$cachedUser) {
                self::$cachedUser['is_owner'] = 0;
            }

            self::recordLoginLog($currUser['email'], 1, t('api.auth.transfer_log', ['name' => $targetUser['name'], 'email' => $targetUser['email']]));

            return ['success' => true, 'message' => t('api.auth.transfer_ok', ['name' => $targetUser['name']])];
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            error_log('[protoloft] 所有权移交未完成: ' . $e->getMessage());
            return ['success' => false, 'message' => $e instanceof DomainException ? $e->getMessage() : t('api.auth.transfer_fail')];
        }
    }

    /**
     * 个人设置：更新个人姓名
     */
    public static function updateMyProfile($name) {
        $currUser = self::getCurrentUser();
        if (!$currUser) {
            return ['success' => false, 'message' => t('api.not_logged_in_or_expired')];
        }
        $db = DB::getInstance();
        $name = trim($name);
        if (empty($name)) {
            return ['success' => false, 'message' => t('api.auth.name_cannot_empty')];
        }
        if (mb_strlen($name, 'UTF-8') > 20) {
            return ['success' => false, 'message' => t('api.auth.name_len_20')];
        }
        $stmt = $db->prepare("UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
        $stmt->execute([$name, (int)$currUser['id']]);

        // 同步刷新 Session 与内存缓存
        $_SESSION['user_name'] = $name;
        $_SESSION['display_name'] = $name;
        if (isset($_SESSION['admin_user'])) {
            $_SESSION['admin_user']['name'] = $name;
            $_SESSION['admin_user']['display_name'] = $name;
        }
        if (self::$cachedUser) {
            self::$cachedUser['name'] = $name;
            self::$cachedUser['display_name'] = $name;
        }

        return ['success' => true, 'name' => $name, 'display_name' => $name];
    }

    /**
     * 个人设置：更新个人专属通知群机器人 Webhook
     */
    public static function updateMyWebhook($webhookUrl) {
        $currUser = self::getCurrentUser();
        if (!$currUser) {
            return ['success' => false, 'message' => t('api.not_logged_in_or_expired')];
        }
        $db = DB::getInstance();
        $webhookUrl = trim($webhookUrl);
        if (mb_strlen($webhookUrl, 'UTF-8') > 1000) return ['success' => false, 'message' => t('api.auth.webhook_len_1000')];
        if ($webhookUrl !== '' && !Webhook::isAllowedUrl($webhookUrl)) return ['success' => false, 'message' => t('webhook.err_url')];
        $stmt = $db->prepare("UPDATE users SET webhook_url = ? WHERE id = ?");
        $stmt->execute([$webhookUrl, (int)$currUser['id']]);

        if (self::$cachedUser) {
            self::$cachedUser['webhook_url'] = $webhookUrl;
        }

        return ['success' => true, 'webhook_url' => $webhookUrl];
    }

    /**
     * 个人设置：更新个人头像 (严格白名单校验，仅用于个人中心)
     */
    public static function updateMyAvatar($avatar) {
        $currUser = self::getCurrentUser();
        if (!$currUser) {
            return ['success' => false, 'message' => t('api.not_logged_in_or_expired')];
        }
        $avatar = trim((string)$avatar);
        if (!self::isValidAvatar($avatar)) {
            return ['success' => false, 'message' => t('api.auth.avatar_invalid')];
        }
        $db = DB::getInstance();
        $stmt = $db->prepare("UPDATE users SET avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
        $stmt->execute([$avatar, (int)$currUser['id']]);

        if (self::$cachedUser) {
            self::$cachedUser['avatar'] = $avatar;
        }

        return ['success' => true, 'avatar' => $avatar];
    }

    /**
     * 个人设置：自行修改登录密码 (严格校验当前密码)
     */
    public static function changeMyPassword($oldPassword, $newPassword) {
        $currUser = self::getCurrentUser();
        if (!$currUser) {
            return ['success' => false, 'message' => t('api.not_logged_in_or_expired')];
        }
        $db = DB::getInstance();
        $stmt = $db->prepare("SELECT id, email, password_hash FROM users WHERE id = ?");
        $stmt->execute([(int)$currUser['id']]);
        $userRow = $stmt->fetch();
        $stmt->closeCursor();
        if (!$userRow) {
            return ['success' => false, 'message' => t('api.auth.account_not_found')];
        }

        // 验证原密码
        if (!password_verify($oldPassword, $userRow['password_hash'])) {
            return ['success' => false, 'message' => t('api.auth.old_pwd_wrong')];
        }

        // 校验新密码长度
        $passwordError = app_password_length_error($newPassword);
        if ($passwordError !== '') {
            return ['success' => false, 'message' => $passwordError];
        }

        $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
        // 更新密码并将 is_first_login 置为 0 (完成首次改密)
        $db->beginTransaction();
        try {
            $updateStmt = $db->prepare("UPDATE users SET password_hash = ?, is_first_login = 0, auth_version = auth_version + 1 WHERE id = ? AND password_hash = ?");
            $updateStmt->execute([$newHash, (int)$currUser['id'], $userRow['password_hash']]);
            if ($updateStmt->rowCount() !== 1) {
                $db->rollBack();
                return ['success' => false, 'message' => t('api.auth.pwd_changed_relogin')];
            }
            self::deletePasswordReset($db, $currUser['id']);
            self::saveUserAuthTokens((int)$currUser['id'], []);
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            throw $e;
        }
        app_regenerate_session(!empty($_SESSION['remember_me']));
        $_SESSION['auth_version'] = (int)$currUser['auth_version'] + 1;

        if (isset($_SESSION['admin_user'])) {
            $_SESSION['admin_user']['is_first_login'] = 0;
        }
        $_SESSION['is_first_login'] = 0;
        if (self::$cachedUser) {
            self::$cachedUser['is_first_login'] = 0;
        }

        self::recordLoginLog($userRow['email'], 1, t('api.auth.pwd_change_log'));

        return ['success' => true, 'message' => t('api.auth.pwd_change_ok')];
    }

    /**
     * 获取当前配置的纯组织名称（未配置自定义组织名时返回空字符串）
     */
    public static function getCompanyDisplayName() {
        $rawTitle = trim(self::getSetting('site_title', ''));
        if ($rawTitle === '' || $rawTitle === '立象原型' || $rawTitle === '立象原型托管平台' || strcasecmp($rawTitle, 'ProtoLoft') === 0) {
            return '';
        }
        return $rawTitle;
    }

    /**
     * 邮箱掩码显示（如 li***@company.com）
     */
    private static function maskEmail($email) {
        $parts = explode('@', (string)$email, 2);
        if (count($parts) !== 2) {
            return '***';
        }
        $local = $parts[0];
        $domain = $parts[1];
        $len = strlen($local);
        if ($len <= 2) {
            $masked = substr($local, 0, 1) . '***';
        } else {
            $masked = substr($local, 0, 2) . '***';
        }
        return $masked . '@' . $domain;
    }

    /** 验证并限流，返回公开响应后才查询账号或连接 SMTP。 */
    public static function preparePasswordReset($emailInput) {
        $base = Mailer::passwordResetBaseUrl();
        if ($base === '' || !Mailer::isConfiguredAndEnabled()) {
            return ['success' => false, 'message' => t('auth.mail_reset_disabled')];
        }

        $email = trim(strtolower($emailInput));
        if ($email !== '' && strpos($email, '@') === false) {
            $domains = array_filter(array_map('trim', explode(',', strtolower(self::getSetting('allowed_email_domains', '')))));
            if (count($domains) === 1) {
                $email .= '@' . reset($domains);
            }
        }
        if (strlen($email) > 100 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ['success' => false, 'message' => t('api.auth.invalid_email')];
        }

        $db = DB::getInstance();
        $db->beginTransaction();
        try {
            // 先取得写锁，使多进程检查和计数成为同一个操作。
            $db->exec('UPDATE settings SET key = key WHERE 0');
            $emailScope = 'forgot_pwd_mail_' . hash('sha256', $email);
            if (!self::checkThrottle('forgot_pwd_ip', 8, 900)
                || !self::checkThrottle($emailScope, 1, 60, false)
                || !self::checkThrottle($emailScope . '_win', 5, 900, false)) {
                $db->rollBack();
                return ['success' => false, 'message' => t('api.auth.reset_throttle')];
            }
            self::hitThrottle('forgot_pwd_ip', 900);
            self::hitThrottle($emailScope, 60, false);
            self::hitThrottle($emailScope . '_win', 900, false);
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            throw $e;
        }

        return [
            'success' => true,
            'message' => t('auth.reset_sent_tip'),
            'send' => function () use ($email, $base) {
                self::deliverPasswordReset($email, $base);
            },
        ];
    }

    private static function deletePasswordReset($db, $userId) {
        $db->prepare('DELETE FROM settings WHERE key = ?')->execute(['password_reset_' . (int)$userId]);
    }

    private static function deliverPasswordReset($email, $base) {
        $db = DB::getInstance();
        $db->beginTransaction();
        try {
            $db->exec('UPDATE settings SET key = key WHERE 0');
            $stmt = $db->prepare("SELECT id, email, name, auth_version FROM users WHERE email = ? AND status = 1");
            $stmt->execute([$email]);
            $user = $stmt->fetch();
            $stmt->closeCursor();
            if (!$user) {
                $db->rollBack();
                return;
            }

            // 账号 ID 只用于定位，能改密的是后面的 256 位随机数。
            $token = $user['id'] . '.' . bin2hex(random_bytes(32));
            $key = 'password_reset_' . (int)$user['id'];
            $previous = self::getSetting($key, '');
            $record = json_encode([
                'token_hash' => hash('sha256', $token),
                'expires_at' => time() + 900,
                'email' => $user['email'],
                'auth_version' => (int)$user['auth_version'],
            ]);
            self::setSetting($key, $record);
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            throw $e;
        }

        try {
            $result = Mailer::sendPasswordReset(
                $user['email'],
                $user['name'],
                $base . '/index.php?reset=1#reset_token=' . $token,
                self::getCompanyDisplayName()
            );
        } finally {
            if (empty($result['success'])) {
                // 只有当前记录仍是本次请求时才恢复。避免覆盖改密、换邮箱或更新的请求。
                if ($previous === '') {
                    $db->prepare('DELETE FROM settings WHERE key = ? AND value = ?')->execute([$key, $record]);
                } else {
                    $db->prepare('UPDATE settings SET value = ? WHERE key = ? AND value = ?')->execute([$previous, $key, $record]);
                }
            }
        }
        if (empty($result['success'])) {
            error_log('[protoloft] 找回密码邮件发送失败: ' . ($result['message'] ?? 'unknown'));
        } else {
            self::recordLoginLog($user['email'], 1, t('api.auth.reset_req_log'));
        }
    }

    private static function findPasswordReset($rawToken) {
        if (!preg_match('/^([1-9][0-9]{0,18})\.[a-f0-9]{64}$/D', $rawToken, $match)) {
            return null;
        }
        $stmt = DB::getInstance()->prepare("
            SELECT u.id, u.email, u.auth_version, s.value
            FROM users u JOIN settings s ON s.key = ?
            WHERE u.id = ? AND u.status = 1
        ");
        $stmt->execute(['password_reset_' . $match[1], $match[1]]);
        $user = $stmt->fetch();
        $record = $user ? json_decode($user['value'], true) : null;
        if (!is_array($record) || (int)$record['expires_at'] <= time()
            || $record['email'] !== $user['email'] || (int)$record['auth_version'] !== (int)$user['auth_version']
            || !hash_equals($record['token_hash'], hash('sha256', $rawToken))) {
            return null;
        }
        return $user;
    }

    /** 校验链接并只向页面提供脱敏账号。 */
    public static function verifyPasswordResetToken($rawToken) {
        $user = self::findPasswordReset($rawToken);
        if (!$user) {
            return ['valid' => false, 'message' => t('auth.reset_link_invalid')];
        }
        return ['valid' => true, 'masked_email' => self::maskEmail($user['email'])];
    }

    /** 通过一次性重置令牌重设登录密码。 */
    public static function resetPasswordByToken($rawToken, $newPassword) {
        if (!self::reserveThrottleAttempt('reset_pwd_confirm', 10, 900)) {
            return ['success' => false, 'message' => t('api.auth.reset_op_throttle')];
        }
        $invalid = ['success' => false, 'message' => t('auth.reset_link_invalid')];
        if (!self::findPasswordReset($rawToken)) {
            return $invalid;
        }
        $passwordError = app_password_length_error($newPassword);
        if ($passwordError !== '') {
            self::releaseThrottleAttempt('reset_pwd_confirm', true);
            return ['success' => false, 'message' => $passwordError];
        }

        $db = DB::getInstance();
        $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
        $db->beginTransaction();
        try {
            $db->exec('UPDATE settings SET key = key WHERE 0');
            $user = self::findPasswordReset($rawToken);
            if (!$user) {
                $db->rollBack();
                return $invalid;
            }

            $stmt = $db->prepare("UPDATE users SET password_hash = ?, is_first_login = 0, auth_version = auth_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
            $stmt->execute([$newHash, (int)$user['id']]);
            self::deletePasswordReset($db, $user['id']);
            self::saveUserAuthTokens((int)$user['id'], []);
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            error_log('[protoloft] 邮箱重置密码失败: ' . $e->getMessage());
            return ['success' => false, 'message' => t('api.auth.reset_fail')];
        }

        self::clearThrottle('reset_pwd_confirm');
        self::recordLoginLog($user['email'], 1, t('api.auth.reset_done_log'));
        return ['success' => true, 'email' => $user['email'], 'message' => t('auth.reset_success')];
    }

    /**
     * 首次登录提醒：忽略/稍后再说
     */
    public static function dismissFirstLoginTip() {
        $currUser = self::getCurrentUser();
        if (!$currUser) {
            return ['success' => false, 'message' => t('api.not_logged_in')];
        }
        $db = DB::getInstance();
        $stmt = $db->prepare("UPDATE users SET is_first_login = 0 WHERE id = ?");
        $stmt->execute([(int)$currUser['id']]);

        if (isset($_SESSION['admin_user'])) {
            $_SESSION['admin_user']['is_first_login'] = 0;
        }
        $_SESSION['is_first_login'] = 0;
        if (self::$cachedUser) {
            self::$cachedUser['is_first_login'] = 0;
        }

        return ['success' => true];
    }

    // ===================== 系统审计日志引擎 =====================

    /**
     * 极轻量设备/操作系统解析
     */
    public static function parseUserAgentSimple($ua) {
        $ua = (string)$ua;
        if (empty($ua)) return t('common.unknown_device');

        $os = t('common.unknown_os');
        if (preg_match('/iPhone|iPad|iPod/i', $ua)) {
            $os = 'iOS';
        } elseif (preg_match('/Android/i', $ua)) {
            $os = 'Android';
        } elseif (preg_match('/Macintosh|Mac OS X/i', $ua)) {
            $os = 'macOS';
        } elseif (preg_match('/Windows/i', $ua)) {
            $os = 'Windows';
        } elseif (preg_match('/Linux/i', $ua)) {
            $os = 'Linux';
        }

        $browser = t('common.unknown_browser');
        if (stripos($ua, 'MicroMessenger') !== false) {
            $browser = t('common.wechat_browser');
        } elseif (stripos($ua, 'Edg') !== false) {
            $browser = 'Edge';
        } elseif (stripos($ua, 'Chrome') !== false) {
            $browser = 'Chrome';
        } elseif (stripos($ua, 'Safari') !== false) {
            $browser = 'Safari';
        } elseif (stripos($ua, 'Firefox') !== false) {
            $browser = 'Firefox';
        }

        return $browser . ' (' . $os . ')';
    }

    /**
     * 写入后台登录审计日志
     */
    public static function recordLoginLog($username, $status, $message = '') {
        try {
            $db = DB::getInstance();
            $ip = self::getClientIp();
            $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
            $device = self::parseUserAgentSimple($ua);
            
            $stmt = $db->prepare("INSERT INTO login_logs (username, ip, user_agent, device, status, message) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                mb_substr(trim((string)$username), 0, 50, 'UTF-8'),
                $ip,
                mb_substr($ua, 0, 255, 'UTF-8'),
                $device,
                (int)$status,
                mb_substr((string)$message, 0, 100, 'UTF-8')
            ]);

            // 保持最新 2000 条 (每 50 次操作抽样清理一次，兼顾极致性能与磁盘安全)
            if (mt_rand(1, 50) === 1) {
                $db->exec("DELETE FROM login_logs WHERE id NOT IN (SELECT id FROM login_logs ORDER BY id DESC LIMIT 2000)");
            }
        } catch (Exception $e) {}
    }

    /**
     * 写入原型访问日志 (基于业务单元层级防刷与精准记录)
     */
    public static function recordAccessLog($itemId, $itemName, $verName = '', $accessType = 'share') {
        try {
            $db = DB::getInstance();
            $ip = self::getClientIp();
            $cleanItemName = mb_substr(trim((string)$itemName), 0, 100, 'UTF-8');
            $cleanVerName = mb_substr(trim((string)$verName), 0, 50, 'UTF-8');
            $cleanAccessType = mb_substr(trim((string)$accessType), 0, 20, 'UTF-8');

            // 业务结构层级节流: 同一IP对同一业务单元 (项目+版本+渠道) 在30秒内仅计1次，避免物理连刷
            $checkStmt = $db->prepare("SELECT id FROM access_logs WHERE item_id = ? AND version_name = ? AND access_type = ? AND ip = ? AND created_at >= datetime('now', '-30 seconds') LIMIT 1");
            $checkStmt->execute([(int)$itemId, $cleanVerName, $cleanAccessType, $ip]);
            if ($checkStmt->fetch()) {
                return;
            }

            $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
            $device = self::parseUserAgentSimple($ua);

            $curUser = self::getCurrentUser();
            $role = 'share';
            if ($curUser) {
                $role = in_array($curUser['role'] ?? '', ['admin', 'editor', 'viewer'], true) ? $curUser['role'] : 'viewer';
            }

            $stmt = $db->prepare("INSERT INTO access_logs (item_id, item_name, version_name, access_type, role, ip, user_agent, device) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                (int)$itemId,
                $cleanItemName,
                $cleanVerName,
                $cleanAccessType,
                $role,
                $ip,
                mb_substr($ua, 0, 255, 'UTF-8'),
                $device
            ]);

            // 保持最新 2000 条记录
            if (mt_rand(1, 40) === 1) {
                $db->exec("DELETE FROM access_logs WHERE id NOT IN (SELECT id FROM access_logs ORDER BY id DESC LIMIT 2000)");
            }
        } catch (Exception $e) {}
    }

    /**
     * 获取最新登录日志
     */
    public static function getLoginLogs($limit = 100) {
        try {
            $db = DB::getInstance();
            $stmt = $db->prepare("SELECT * FROM login_logs ORDER BY id DESC LIMIT ?");
            $stmt->execute([(int)$limit]);
            $rows = $stmt->fetchAll();
            foreach ($rows as &$r) {
                if (!empty($r['created_at'])) $r['created_at'] = self::toLocalTime($r['created_at']);
            }
            unset($r);
            return $rows;
        } catch (Exception $e) {
            return [];
        }
    }

    /**
     * 获取最新原型访问日志
     */
    public static function getAccessLogs($limit = 100) {
        try {
            $db = DB::getInstance();
            $stmt = $db->prepare("SELECT * FROM access_logs ORDER BY id DESC LIMIT ?");
            $stmt->execute([(int)$limit]);
            $rows = $stmt->fetchAll();
            foreach ($rows as &$r) {
                if (!empty($r['created_at'])) $r['created_at'] = self::toLocalTime($r['created_at']);
            }
            unset($r);
            return $rows;
        } catch (Exception $e) {
            return [];
        }
    }

    /**
     * 清空系统审计日志
     */
    public static function clearLogs($type = 'all') {
        if (!in_array($type, ['login', 'access', 'all'], true)) {
            return false;
        }
        try {
            $db = DB::getInstance();
            if ($type === 'login' || $type === 'all') {
                $db->exec("DELETE FROM login_logs");
            }
            if ($type === 'access' || $type === 'all') {
                $db->exec("DELETE FROM access_logs");
            }
            return true;
        } catch (Exception $e) {
            return false;
        }
    }
}

// 自动根据系统配置加载生效时区
Auth::initTimezone();
