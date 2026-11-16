<?php
/**
 * 轻量通用群机器人 Webhook 协同引擎
 * 支持企业微信 (WeCom)、飞书 (Feishu)、钉钉 (DingTalk) 零配置自适应
 * 原生实现，零第三方依赖，1.5 秒极短超时非阻塞保护
 */
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';

class Webhook {
    /**
     * 识别 Webhook 目标平台
     */
    public static function detectPlatform($url) {
        if (strpos($url, 'open.feishu.cn') !== false) {
            return 'feishu';
        }
        if (strpos($url, 'qyapi.weixin.qq.com') !== false) {
            return 'wecom';
        }
        if (strpos($url, 'oapi.dingtalk.com') !== false) {
            return 'dingtalk';
        }
        return 'generic';
    }

    /**
     * 发送 Webhook 消息 (含协议安全白名单与非阻塞短超时)
     */
    public static function isAllowedUrl($url) {
        $parts = parse_url(trim((string)$url));
        if (!$parts || ($parts['scheme'] ?? '') !== 'https' || isset($parts['user']) || isset($parts['pass'])
            || isset($parts['fragment']) || (isset($parts['port']) && (int)$parts['port'] !== 443)) return false;
        $host = strtolower($parts['host'] ?? '');
        $path = $parts['path'] ?? '';
        $paths = [
            'qyapi.weixin.qq.com' => '#^/cgi-bin/webhook/send$#D',
            'oapi.dingtalk.com' => '#^/robot/send$#D',
            'open.feishu.cn' => '#^/open-apis/bot/v2/hook/[a-zA-Z0-9-]+$#D'
        ];
        return isset($paths[$host]) && preg_match($paths[$host], $path);
    }

    public static function send($url, $eventType, $data) {
        $url = trim($url);
        if (!self::isAllowedUrl($url)) return ['success' => false, 'message' => '请使用企微、飞书或钉钉的 HTTPS 机器人地址'];
        $platform = self::detectPlatform($url);
        $jsonBody = json_encode(self::buildPayload($platform, $eventType, $data), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $status = 0;
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_POST => true, CURLOPT_POSTFIELDS => $jsonBody,
                CURLOPT_HTTPHEADER => ['Content-Type: application/json; charset=utf-8'],
                CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT_MS => 1500, CURLOPT_TIMEOUT_MS => 2000,
                CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
                CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS
            ]);
            $response = curl_exec($ch);
            $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $failed = curl_errno($ch) !== 0;
            curl_close($ch);
            if ($failed) return ['success' => false, 'message' => '连接机器人失败'];
        } else {
            $context = stream_context_create([
                'http' => ['method' => 'POST', 'header' => "Content-Type: application/json; charset=utf-8\r\n",
                    'content' => $jsonBody, 'timeout' => 2, 'follow_location' => 0, 'ignore_errors' => true],
                'ssl' => ['verify_peer' => true, 'verify_peer_name' => true]
            ]);
            $response = @file_get_contents($url, false, $context);
            if (isset($http_response_header[0]) && preg_match('#^HTTP/\S+\s+(\d+)#', $http_response_header[0], $m)) $status = (int)$m[1];
        }
        if ($response === false || $status < 200 || $status >= 300) return ['success' => false, 'message' => '机器人返回异常'];
        $result = json_decode($response, true);
        $code = is_array($result) ? ($result['errcode'] ?? ($result['code'] ?? ($result['StatusCode'] ?? null))) : null;
        if ($code === null || (int)$code !== 0) {
            $errMsg = is_array($result) ? ($result['errmsg'] ?? ($result['msg'] ?? ($result['message'] ?? ''))) : '';
            $lowerErr = strtolower($errMsg);
            // 针对钉钉/飞书安全设置未匹配的精准诊断自愈引导
            if (strpos($lowerErr, 'keyword') !== false || strpos($lowerErr, 'key word') !== false || strpos($lowerErr, 'sign') !== false || strpos($lowerErr, 'ip') !== false || (int)$code === 19024) {
                return [
                    'success' => false,
                    'message' => '机器人安全校验拦截：请在钉钉/飞书机器人安全设置中勾选「自定义关键词」，填入：立象原型'
                ];
            }
            return ['success' => false, 'message' => !empty($errMsg) ? '机器人拒绝接收：' . $errMsg : '机器人未接受通知，请检查配置'];
        }
        return ['success' => true];
    }

    /**
     * 转义 Markdown 保留字符，防止外部内容注入伪造链接或破坏排版
     */
    private static function mdEscape($str, $stripNewlines = false) {
        $str = (string)$str;
        if ($stripNewlines) {
            $str = str_replace(["\r", "\n"], ' ', $str);
        }
        return preg_replace('/([\\\\`\[\]\(\)<>])/u', '\\\\$1', $str);
    }

    /**
     * 根据不同平台自适应构建数据载荷 (正文安全防爆截断，去除自嗨营销腔)
     */
    private static function buildPayload($platform, $eventType, $data) {
        $rawItem = $data['item_name'] ?? '未命名项目';
        $rawVersion = $data['version_name'] ?? '';
        $rawPage = $data['page_title'] ?? ($data['page_path'] ?? '');
        $rawAuthor = $data['author'] ?? '用户';
        $rawContent = trim($data['content'] ?? '');
        $link = $data['link'] ?? '';
        $time = date('Y-m-d H:i');

        // 项目通知统一按事件生成文案，各平台使用相同标题、字段和入口。
        $projectEvents = [
            'version_update' => [!empty($data['is_overwrite']) ? '版本内容已更新' : '新版本已发布', '发布人', '更新说明', '查看原型'],
            'annotation_new' => ['收到新批注', '批注人', '批注内容', '查看批注'],
            'annotation_reply' => ['批注有新回复', '回复人', '回复内容', '查看批注'],
            'annotation_resolve' => ['批注已解决', '处理人', '批注内容', '查看批注']
        ];
        $isProjectEvent = isset($projectEvents[$eventType]);
        $authorLabel = '操作人';
        $contentLabel = '内容';
        $linkLabel = '查看详情';
        $rawTitle = $data['title'] ?? '协作通知';
        if ($isProjectEvent) {
            $presentation = $projectEvents[$eventType];
            $rawTitle = $rawItem . ' · ' . $presentation[0];
            $authorLabel = $presentation[1];
            $contentLabel = $presentation[2];
            $linkLabel = $presentation[3];
        }

        // 面向 Markdown 渲染平台进行字符安全转义
        $title = self::mdEscape($rawTitle, true);
        $item = self::mdEscape($rawItem, true);
        $version = self::mdEscape($rawVersion, true);
        $page = self::mdEscape($rawPage, true);
        $author = self::mdEscape($rawAuthor, true);
        $content = self::mdEscape($rawContent);

        // 安全防爆截断：正文超过 400 字自动截断，防止触发企微/钉钉/飞书单条字符上限
        if (mb_strlen($content, 'utf-8') > 400) {
            $content = mb_substr($content, 0, 400, 'utf-8') . '...';
        }

        // 1. 企业微信 (WeCom)
        if ($platform === 'wecom') {
            $md = "### {$title}\n";
            if (!$isProjectEvent) {
                $md .= "> **项目**：<font color=\"info\">{$item}</font>" . ($version ? " (`{$version}`)" : "") . "\n";
            } elseif ($version !== '') {
                $md .= "> **版本**：`{$version}`\n";
            }
            if (!empty($page)) {
                $md .= "> **页面**：{$page}\n";
            }
            $md .= "> **{$authorLabel}**：{$author}\n";
            if (!empty($content)) {
                $md .= "> **{$contentLabel}**：{$content}\n";
            }
            $md .= "> **时间**：{$time}\n";
            $md .= "\n来自 · 立象原型\n";
            if (!empty($link)) {
                $md .= "\n[{$linkLabel}]({$link})";
            }
            return [
                'msgtype' => 'markdown',
                'markdown' => ['content' => $md]
            ];
        }

        // 2. 钉钉 (DingTalk) - 纯粹原汁原味的 Markdown 聊天气泡
        if ($platform === 'dingtalk') {
            $md = "### {$title}\n\n";
            if (!$isProjectEvent) {
                $md .= "- **项目**：{$item}" . ($version ? " (`{$version}`)" : "") . "\n";
            } elseif ($version !== '') {
                $md .= "- **版本**：`{$version}`\n";
            }
            if (!empty($page)) {
                $md .= "- **页面**：{$page}\n";
            }
            $md .= "- **{$authorLabel}**：{$author}\n";
            if (!empty($content)) {
                $md .= "- **{$contentLabel}**：{$content}\n";
            }
            $md .= "- **时间**：{$time}\n";
            $md .= "\n\n> *来自 · 立象原型*";
            if (!empty($link)) {
                $md .= "\n\n[{$linkLabel}]({$link})";
            }
            return [
                'msgtype' => 'markdown',
                'markdown' => [
                    'title' => $title,
                    'text' => $md
                ]
            ];
        }

        // 3. 飞书 (Feishu) - 简单直观的纯净卡片
        if ($platform === 'feishu') {
            $elements = [];
            $mdText = '';
            if (!$isProjectEvent) {
                $mdText .= "**项目**：{$item}" . ($version ? " (`{$version}`)" : "") . "\n";
            } elseif ($version !== '') {
                $mdText .= "**版本**：`{$version}`\n";
            }
            if (!empty($page)) {
                $mdText .= "**页面**：{$page}\n";
            }
            $mdText .= "**{$authorLabel}**：{$author}\n";
            if (!empty($content)) {
                $mdText .= "**{$contentLabel}**：{$content}\n";
            }
            $mdText .= "**时间**：{$time}\n\n";
            $mdText .= "来自 · 立象原型";

            $elements[] = [
                'tag' => 'div',
                'text' => [
                    'tag' => 'lark_md',
                    'content' => $mdText
                ]
            ];

            if (!empty($link)) {
                $elements[] = [
                    'tag' => 'action',
                    'actions' => [
                        [
                            'tag' => 'button',
                            'text' => ['tag' => 'plain_text', 'content' => $linkLabel],
                            'type' => 'primary',
                            'url' => $link
                        ]
                    ]
                ];
            }

            return [
                'msg_type' => 'interactive',
                'card' => [
                    'header' => [
                        'title' => ['tag' => 'plain_text', 'content' => $title],
                        'template' => 'blue'
                    ],
                    'elements' => $elements
                ]
            ];
        }

        // 4. 通用 (Generic) - 保留纯净原始数据供业务系统机器消费
        return [
            'event' => $eventType,
            'title' => $rawTitle,
            'item_name' => $rawItem,
            'version_name' => $rawVersion,
            'page' => $rawPage,
            'author' => $rawAuthor,
            'content' => $rawContent,
            'link' => $link,
            'time' => $time,
            'source' => '立象原型'
        ];
    }
}
