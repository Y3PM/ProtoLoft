<?php
/**
 * SQLite 数据库管理与单例封装 (全新架构极致纯净版)
 */
require_once __DIR__ . '/config.php';

class DB {
    private static $instance = null;
    private $pdo;

    private function __construct() {
        if (!file_exists(DATA_PATH)) {
            @mkdir(DATA_PATH, 0755, true);
        }

        $dsn = 'sqlite:' . DB_FILE;
        $this->pdo = new PDO($dsn);
        $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        
        // 开启 WAL 模式以提升并发读写性能
        $this->pdo->exec('PRAGMA journal_mode = WAL;');
        $this->pdo->exec('PRAGMA busy_timeout = 5000;');

        // 如果全新部署尚未初始化表结构，自动完成标准初始化
        $hasInit = $this->pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='settings'")->fetchColumn();
        if (!$hasInit) {
            $this->pdo->beginTransaction();
            try {
                self::initTables($this->pdo);
                $this->pdo->commit();
            } catch (Throwable $e) {
                $this->pdo->rollBack();
                throw $e;
            }
        }
    }

    public static function getInstance() {
        if (self::$instance === null) {
            self::$instance = new DB();
        }
        return self::$instance->pdo;
    }

    /**
     * 全新版本标准 Schema 一次性定稿建表
     */
    public static function initTables($pdo = null) {
        $db = $pdo ?: self::getInstance();

        // 品牌资源保留在 uploads，原型资源仅使用私有 data 目录。
        if (!file_exists(UPLOADS_PATH))  @mkdir(UPLOADS_PATH, 0755, true);
        if (!file_exists(BRANDING_PATH)) @mkdir(BRANDING_PATH, 0755, true);

        foreach ([PROTOTYPES_PATH, CHUNKS_PATH] as $privateDir) {
            if (!is_dir($privateDir) && !mkdir($privateDir, 0700, true)) {
                throw new RuntimeException('无法创建私有资产目录');
            }
        }

        // 1. 存储空间表
        $db->exec("
            CREATE TABLE IF NOT EXISTS spaces (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slug TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                is_system INTEGER DEFAULT 0,
                sort_order INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        ");
        $stmtSpace = $db->prepare("INSERT OR IGNORE INTO spaces (slug, name, is_system, sort_order) VALUES ('ux', '交互原型 (ux)', 1, 10)");
        $stmtSpace->execute();

        // 2. 用户表 (全新极简模型: email + name + is_owner + department + webhook_url)
        $db->exec("
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'editor',
                is_owner INTEGER NOT NULL DEFAULT 0,
                status INTEGER NOT NULL DEFAULT 1,
                is_first_login INTEGER NOT NULL DEFAULT 0,
                auth_version INTEGER NOT NULL DEFAULT 0,
                department TEXT DEFAULT '',
                webhook_url TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        ");

        // 使用基础触发器保证唯一 Owner，不依赖较新 SQLite 的部分索引。
        $db->exec("CREATE TRIGGER IF NOT EXISTS users_single_owner_insert
            BEFORE INSERT ON users WHEN NEW.is_owner = 1 BEGIN
                SELECT RAISE(ABORT, 'Only one owner is allowed')
                WHERE EXISTS (SELECT 1 FROM users WHERE is_owner = 1);
            END");
        $db->exec("CREATE TRIGGER IF NOT EXISTS users_single_owner_update
            BEFORE UPDATE OF is_owner ON users WHEN NEW.is_owner = 1 BEGIN
                SELECT RAISE(ABORT, 'Only one owner is allowed')
                WHERE EXISTS (SELECT 1 FROM users WHERE is_owner = 1 AND id <> NEW.id);
            END");

        // 3. 分类表
        $db->exec("
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0,
                is_visible INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        ");

        // 4. 项目与外链表 (包含共管人 collaborators 与动态水印 watermark_enabled)
        $db->exec("
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category_id INTEGER NOT NULL,
                type TEXT NOT NULL DEFAULT 'project',
                name TEXT NOT NULL,
                target_dir TEXT DEFAULT 'ux',
                link_url TEXT,
                link_target TEXT DEFAULT '_blank',
                access_password TEXT DEFAULT '',
                share_code TEXT DEFAULT '',
                share_enabled INTEGER DEFAULT 1,
                share_expires_at DATETIME DEFAULT NULL,
                webhook_url TEXT DEFAULT '',
                sort_order INTEGER DEFAULT 0,
                is_visible INTEGER DEFAULT 1,
                created_by INTEGER DEFAULT 0,
                collaborators TEXT DEFAULT '',
                watermark_enabled INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        ");

        // 5. 版本表 (包含精准沉淀的 file_size, rp_size 与更新日志 changelog)
        $db->exec("
            CREATE TABLE IF NOT EXISTS versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER NOT NULL,
                version_name TEXT NOT NULL,
                entry_file TEXT,
                rp_file TEXT,
                changelog TEXT,
                is_default INTEGER DEFAULT 1,
                created_by INTEGER DEFAULT 0,
                author_name TEXT NOT NULL DEFAULT '',
                storage_dir TEXT NOT NULL,
                file_size INTEGER DEFAULT 0,
                rp_size INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        ");

        // 6. 系统设置表
        $db->exec("
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        ");

        // 7. 专属安全外发分享短码表
        $db->exec("
            CREATE TABLE IF NOT EXISTS share_codes (
                code TEXT PRIMARY KEY,
                item_id INTEGER NOT NULL,
                ver_id INTEGER NOT NULL DEFAULT 0,
                label TEXT DEFAULT '',
                access_password TEXT DEFAULT '',
                expires_at DATETIME DEFAULT NULL,
                view_count INTEGER DEFAULT 0,
                created_by INTEGER DEFAULT 0,
                status INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        ");

        // 8. 登录审计日志表
        $db->exec("
            CREATE TABLE IF NOT EXISTS login_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                ip TEXT NOT NULL,
                user_agent TEXT DEFAULT '',
                device TEXT DEFAULT '',
                status INTEGER NOT NULL DEFAULT 1,
                message TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        ");

        // 9. 原型访问日志表 (按实体节流防刷)
        $db->exec("
            CREATE TABLE IF NOT EXISTS access_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER DEFAULT 0,
                item_name TEXT DEFAULT '',
                version_name TEXT DEFAULT '',
                access_type TEXT DEFAULT 'share',
                role TEXT DEFAULT 'share',
                ip TEXT NOT NULL,
                user_agent TEXT DEFAULT '',
                device TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        ");

        // 10. 页面级打点批注协同表
        $db->exec("
            CREATE TABLE IF NOT EXISTS annotations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER NOT NULL,
                ver_id INTEGER NOT NULL,
                page_path TEXT NOT NULL DEFAULT '',
                page_title TEXT DEFAULT '',
                version_revision TEXT NOT NULL DEFAULT '',
                reviewed_revision TEXT NOT NULL DEFAULT '',
                page_snapshot TEXT NOT NULL DEFAULT '',
                source_annotation_id INTEGER DEFAULT NULL,
                user_id INTEGER NOT NULL DEFAULT 0,
                author_name TEXT NOT NULL,
                author_dept TEXT DEFAULT '',
                content TEXT NOT NULL,
                status INTEGER NOT NULL DEFAULT 0,
                resolved_by TEXT DEFAULT '',
                resolved_at DATETIME DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        ");

        $db->exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_annotation_carry ON annotations(ver_id, source_annotation_id)');
        $db->exec("CREATE TABLE IF NOT EXISTS mcp_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            token_hash TEXT NOT NULL UNIQUE,
            token_prefix TEXT NOT NULL,
            auth_version INTEGER NOT NULL,
            project_id INTEGER NOT NULL DEFAULT 0,
            project_ids TEXT NOT NULL DEFAULT '',
            can_publish INTEGER NOT NULL DEFAULT 0,
            expires_at INTEGER NOT NULL,
            last_used_at INTEGER DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )");

        // 11. 批注回复跟帖表
        $db->exec("
            CREATE TABLE IF NOT EXISTS annotation_replies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                annotation_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL DEFAULT 0,
                author_name TEXT NOT NULL,
                author_dept TEXT DEFAULT '',
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        ");

        $db->exec("CREATE TABLE IF NOT EXISTS asset_gc (storage_dir TEXT PRIMARY KEY, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");

        // 高性能索引集群
        $db->exec("
            CREATE INDEX IF NOT EXISTS idx_items_cat ON items(category_id, sort_order);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_versions_name ON versions(item_id, version_name);
            CREATE INDEX IF NOT EXISTS idx_versions_item ON versions(item_id, is_default);
            CREATE INDEX IF NOT EXISTS idx_spaces_slug ON spaces(slug);
            CREATE INDEX IF NOT EXISTS idx_share_codes_target ON share_codes(item_id, ver_id);
            CREATE INDEX IF NOT EXISTS idx_login_logs_time ON login_logs(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_access_logs_time ON access_logs(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_anno_target ON annotations(item_id, ver_id, status);
            CREATE INDEX IF NOT EXISTS idx_anno_page ON annotations(item_id, ver_id, page_path);
            CREATE INDEX IF NOT EXISTS idx_reply_anno ON annotation_replies(annotation_id);
        ");
    }
}
