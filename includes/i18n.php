<?php
/**
 * 轻量零依赖多语言国际化模块 (PHP 7.0.0+ 兼容)
 * 支持语言：zh-CN（简体中文）、zh-TW（繁體中文）、en（English）
 */
if (!defined('ROOT_PATH')) {
    define('ROOT_PATH', dirname(__DIR__));
}

class I18n {
    const DEFAULT_LOCALE = 'zh-CN';
    const SUPPORTED_LOCALES = ['zh-CN', 'zh-TW', 'en'];

    private static $cachedLocale = null;
    private static $catalogCache = [];

    /**
     * 校验是否为受支持的语言代码
     */
    public static function isValidLocale($locale) {
        return is_string($locale) && in_array($locale, self::SUPPORTED_LOCALES, true);
    }

    /**
     * 规范化语言代码，不支持时回退至默认语言
     */
    public static function normalizeLocale($locale) {
        if (!is_string($locale)) {
            return self::DEFAULT_LOCALE;
        }
        $trimmed = trim($locale);
        if (in_array($trimmed, self::SUPPORTED_LOCALES, true)) {
            return $trimmed;
        }
        $lower = strtolower(str_replace('_', '-', $trimmed));
        if ($lower === 'zh-cn' || $lower === 'zh-hans' || $lower === 'zh') {
            return 'zh-CN';
        }
        if ($lower === 'zh-tw' || $lower === 'zh-hk' || $lower === 'zh-hant') {
            return 'zh-TW';
        }
        if ($lower === 'en' || strpos($lower, 'en-') === 0) {
            return 'en';
        }
        return self::DEFAULT_LOCALE;
    }

    /**
     * 获取当前系统语言（已安装从 settings.system_language 读取，安装阶段支持参数切换）
     */
    public static function getLocale($refresh = false) {
        if ($refresh) {
            self::$cachedLocale = null;
        }
        if (self::$cachedLocale !== null) {
            return self::$cachedLocale;
        }

        $locale = self::DEFAULT_LOCALE;
        if (function_exists('is_installed') && is_installed()) {
            try {
                if (!class_exists('DB', false)) {
                    require_once __DIR__ . '/db.php';
                }
                $val = DB::value("SELECT value FROM settings WHERE key = ?", ['system_language']);
                if (is_string($val) && self::isValidLocale($val)) {
                    $locale = $val;
                }
            } catch (Throwable $e) {
                $locale = self::DEFAULT_LOCALE;
            }
        } else {
            // 安装向导阶段允许通过表单、URL 参数或会话记忆切换预览语言
            $reqLang = $_POST['system_language'] ?? ($_GET['lang'] ?? ($_SESSION['install_lang'] ?? ''));
            if (is_string($reqLang) && self::isValidLocale(trim($reqLang))) {
                $locale = trim($reqLang);
            }
        }

        self::$cachedLocale = $locale;
        return self::$cachedLocale;
    }

    /**
     * 运行期内手动覆盖当前语言（例如保存设置或安装完成后即时生效）
     */
    public static function setLocale($locale) {
        self::$cachedLocale = self::normalizeLocale($locale);
    }

    /**
     * 加载指定语言的词典数组
     */
    public static function loadCatalog($locale) {
        $norm = self::normalizeLocale($locale);
        if (isset(self::$catalogCache[$norm])) {
            return self::$catalogCache[$norm];
        }
        $file = __DIR__ . '/lang/' . $norm . '.php';
        $data = file_exists($file) ? require $file : [];
        if (!is_array($data)) {
            $data = [];
        }
        self::$catalogCache[$norm] = $data;
        return $data;
    }

    /**
     * 翻译指定词条并替换 {param} 占位符
     */
    public static function t($key, $params = []) {
        $locale = self::getLocale();
        $catalog = self::loadCatalog($locale);
        $text = isset($catalog[$key]) ? $catalog[$key] : null;
        if ($text === null && $locale !== self::DEFAULT_LOCALE) {
            $fallback = self::loadCatalog(self::DEFAULT_LOCALE);
            if (isset($fallback[$key])) {
                $text = $fallback[$key];
            }
        }
        if ($text === null) {
            $text = (string)$key;
        }
        if (!empty($params) && is_array($params)) {
            $replace = [];
            foreach ($params as $k => $v) {
                $replace['{' . $k . '}'] = (string)$v;
            }
            $text = strtr($text, $replace);
        }
        return $text;
    }

    /**
     * 输出 HTML lang 属性值
     */
    public static function htmlLang() {
        return self::getLocale();
    }

    /**
     * 按前缀过滤导出供前端 window.__I18N__ 使用的词典
     */
    public static function jsCatalog($prefixes = []) {
        $locale = self::getLocale();
        $base = self::loadCatalog(self::DEFAULT_LOCALE);
        $merged = ($locale === self::DEFAULT_LOCALE)
            ? $base
            : array_merge($base, self::loadCatalog($locale));

        if (empty($prefixes)) {
            return $merged;
        }
        $out = [];
        foreach ($merged as $k => $v) {
            foreach ($prefixes as $prefix) {
                if (strpos($k, $prefix) === 0) {
                    $out[$k] = $v;
                    break;
                }
            }
        }
        return $out;
    }

    /**
     * 品牌名称、口号与版权文案（按规范适配中英文）
     */
    public static function brandName() {
        return self::t('brand.name');
    }

    public static function brandSlogan() {
        return self::t('brand.slogan');
    }

    public static function brandFooter($year = null) {
        $y = $year !== null ? (string)$year : date('Y');
        return self::t('brand.footer', ['year' => $y]);
    }
}

if (!function_exists('t')) {
    /**
     * 全局翻译助手函数
     */
    function t($key, $params = []) {
        return I18n::t($key, $params);
    }
}
