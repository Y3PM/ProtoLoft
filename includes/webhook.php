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
        if (!self::isAllowedUrl($url)) return ['success' => false, 'message' => t('webhook.err_url')];
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
            if ($failed) return ['success' => false, 'message' => t('webhook.err_connect')];
        } else {
            $context = stream_context_create([
                'http' => ['method' => 'POST', 'header' => "Content-Type: application/json; charset=utf-8\r\n",
                    'content' => $jsonBody, 'timeout' => 2, 'follow_location' => 0, 'ignore_errors' => true],
                'ssl' => ['verify_peer' => true, 'verify_peer_name' => true]
            ]);
            $response = @file_get_contents($url, false, $context);
            if (isset($http_response_header[0]) && preg_match('#^HTTP/\S+\s+(\d+)#', $http_response_header[0], $m)) $status = (int)$m[1];
        }
        if ($response === false || $status < 200 || $status >= 300) return ['success' => false, 'message' => t('webhook.err_http')];
        $result = json_decode($response, true);
        $code = is_array($result) ? ($result['errcode'] ?? ($result['code'] ?? ($result['StatusCode'] ?? null))) : null;
        if ($code === null || (int)$code !== 0) {
            $errMsg = is_array($result) ? ($result['errmsg'] ?? ($result['msg'] ?? ($result['message'] ?? ''))) : '';
            $lowerErr = strtolower($errMsg);
            // 针对钉钉/飞书安全设置未匹配的精准诊断自愈引导
            if (strpos($lowerErr, 'keyword') !== false || strpos($lowerErr, 'key word') !== false || strpos($lowerErr, 'sign') !== false || strpos($lowerErr, 'ip') !== false || (int)$code === 19024) {
                return [
                    'success' => false,
                    'message' => t('webhook.err_keyword')
                ];
            }
            return ['success' => false, 'message' => !empty($errMsg) ? t('webhook.err_rejected', ['msg' => $errMsg]) : t('webhook.err_not_accepted')];
        }
        return ['success' => true];
    }

    /**
     * 转义 Markdown 保留字符，防止外部内容注入伪造链接或破坏排版
     */
    private static function mdEscape($str, $stripNewlines = false) {
        $str = str_replace(["\r\n", "\r"], "\n", (string)$str);
        if ($stripNewlines) {
            $str = str_replace("\n", ' ', $str);
        }
        return preg_replace('/([\\\\`\[\]\(\)<>])/u', '\\\\$1', $str);
    }

    /**
     * 格式化属性行，保证含换行或块级 Markdown（列表/标题）的正文首行独立成行
     */
    private static function formatFieldLine($platform, $label, $val, $kind) {
        $isContent = ($kind === 'content');
        $hasNewline = $isContent && (strpos($val, "\n") !== false);
        $startsWithBlock = $isContent && (bool)preg_match('/^(?:#{1,6}\s|[-*+]\s|\d+\.\s)/u', $val);
        $isEn = (I18n::getLocale() === 'en');
        $colon = $isEn ? ': ' : '：';
        $blockColon = $isEn ? ':' : '：';

        if ($platform === 'wecom') {
            $body = $val;
            if ($isContent) {
                $body = preg_replace('/^[-*]\s+/um', '• ', $body);
            }
            if ($startsWithBlock || $hasNewline) {
                return "**{$label}**{$blockColon}\n{$body}\n";
            }
            return "**{$label}**{$colon}{$body}\n";
        }
        if ($platform === 'dingtalk') {
            $body = $val;
            $hasList = false;
            if ($isContent && $hasNewline) {
                $parts = explode("\n", $val);
                $body = '';
                foreach ($parts as $idx => $part) {
                    $isListLine = (bool)preg_match('/^(?:[-*+]\s|\d+\.\s)/u', $part);
                    if ($isListLine) $hasList = true;
                    if ($idx > 0) {
                        $body .= "\n";
                    }
                    $body .= $part;
                }
            } elseif ($startsWithBlock) {
                $hasList = (bool)preg_match('/^(?:[-*+]\s|\d+\.\s)/u', $val);
            }
            $suffix = $hasList ? "\n" : '';
            if ($startsWithBlock) {
                return "**{$label}**{$blockColon}\n{$body}{$suffix}";
            }
            if ($hasNewline) {
                return "**{$label}**{$blockColon}\n{$body}{$suffix}";
            }
            return "**{$label}**{$colon}{$body}";
        }
        if ($platform === 'feishu' && $isContent) {
            $val = preg_replace('/^[-*]\s+/um', '• ', $val);
        }
        if ($startsWithBlock || $hasNewline) {
            return "**{$label}**{$blockColon}\n{$val}";
        }
        return "**{$label}**{$colon}{$val}";
    }

    /**
     * 根据不同平台自适应构建数据载荷 (正文安全防爆截断，去除自嗨营销腔)
     */
    private static function buildPayload($platform, $eventType, $data) {
        $rawItem = $data['item_name'] ?? t('webhook.default_item');
        $rawVersion = $data['version_name'] ?? '';
        $rawPage = $data['page_title'] ?? ($data['page_path'] ?? '');
        $rawAuthor = $data['author'] ?? t('webhook.default_author');
        $rawContent = trim($data['content'] ?? '');
        $link = $data['link'] ?? '';
        $time = date('Y-m-d H:i');

        // 项目通知统一按事件生成文案，各平台使用相同标题、字段和入口。
        $projectEvents = [
            'version_update' => [!empty($data['is_overwrite']) ? t('webhook.ev_ver_updated') : t('webhook.ev_ver_published'), t('webhook.lbl_publisher'), t('webhook.lbl_changelog'), t('webhook.btn_view_proto')],
            'annotation_new' => [t('webhook.ev_anno_new'), t('webhook.lbl_anno_author'), t('webhook.lbl_anno_content'), t('webhook.btn_view_anno')],
            'annotation_reply' => [t('webhook.ev_anno_reply'), t('webhook.lbl_reply_author'), t('webhook.lbl_reply_content'), t('webhook.btn_view_anno')],
            'annotation_resolve' => [t('webhook.ev_anno_resolve'), t('webhook.lbl_resolver'), t('webhook.lbl_anno_content'), t('webhook.btn_view_anno')]
        ];
        $isProjectEvent = isset($projectEvents[$eventType]);
        $isUserApplyEvent = ($eventType === 'user_apply');
        $authorLabel = t('webhook.lbl_operator');
        $contentLabel = t('webhook.lbl_content');
        $linkLabel = t('webhook.btn_view_detail');
        $rawTitle = $data['title'] ?? t('webhook.ev_default_title');
        if ($isProjectEvent) {
            $presentation = $projectEvents[$eventType];
            $rawTitle = $rawItem . ' · ' . $presentation[0];
            $authorLabel = $presentation[1];
            $contentLabel = $presentation[2];
            $linkLabel = $presentation[3];
        } elseif ($isUserApplyEvent) {
            $rawTitle = $data['title'] ?? t('webhook.ev_visitor_apply');
            $authorLabel = t('webhook.lbl_applicant');
            $contentLabel = t('webhook.lbl_apply_note');
            $linkLabel = t('webhook.btn_approve');
        }

        // 面向 Markdown 渲染平台进行字符安全转义
        $title = self::mdEscape($rawTitle, true);
        $item = self::mdEscape($rawItem, true);
        $version = self::mdEscape($rawVersion, true);
        $page = self::mdEscape($rawPage, true);
        $author = self::mdEscape($rawAuthor, true);
        $content = self::mdEscape($rawContent);

        // 安全防爆截断：正文超过 400 字、页面超过 200 字自动截断，防止触发企微/钉钉/飞书单条字符上限
        if (mb_strlen($content, 'utf-8') > 400) {
            $content = mb_substr($content, 0, 400, 'utf-8') . '...';
        }
        if (mb_strlen($page, 'utf-8') > 200) {
            $page = mb_substr($page, 0, 200, 'utf-8') . '...';
        }

        // 统一组装属性行 [标签, 值, 语义类型]；存在结构化 fields 时跳过“内容”标签，逐行平铺展示
        $fieldRows = [];
        if (!$isProjectEvent && !$isUserApplyEvent) {
            $fieldRows[] = [t('webhook.field_project'), $item . ($version ? " ({$version})" : ''), 'info'];
        } elseif ($isProjectEvent && $version !== '') {
            $fieldRows[] = [t('webhook.field_version'), $version, 'plain'];
        }
        if (!empty($page)) {
            $fieldRows[] = [t('webhook.field_page'), $page, 'plain'];
        }
        $fieldRows[] = [$authorLabel, $author, 'plain'];
        if (!empty($data['fields']) && is_array($data['fields'])) {
            foreach ($data['fields'] as $fk => $fv) {
                $kText = self::mdEscape(trim((string)$fk), true);
                $vText = self::mdEscape(trim((string)$fv), true);
                if ($kText !== '' && $vText !== '') {
                    if (mb_strlen($vText, 'utf-8') > 200) {
                        $vText = mb_substr($vText, 0, 200, 'utf-8') . '...';
                    }
                    $fieldRows[] = [$kText, $vText, 'plain'];
                }
            }
        } elseif (!empty($content)) {
            $fieldRows[] = [$contentLabel, $content, 'content'];
        }
        $fieldRows[] = [t('webhook.field_time'), $time, 'plain'];

        $footerSource = t('webhook.footer_source');

        // 1. 企业微信 (WeCom)
        if ($platform === 'wecom') {
            $md = "### **{$title}**\n\n";
            foreach ($fieldRows as $row) {
                $val = $row[1];
                if ($row[2] === 'info') {
                    $val = $item !== '' ? "<font color=\"info\">{$item}</font>" . ($version ? " ({$version})" : "") : $val;
                }
                $md .= self::formatFieldLine('wecom', $row[0], $val, $row[2]);
            }
            if (!empty($link)) {
                $md .= "\n[{$linkLabel}]({$link})\n";
            }
            $md .= "\n<font color=\"comment\">{$footerSource}</font>";
            return [
                'msgtype' => 'markdown',
                'markdown' => ['content' => $md]
            ];
        }

        // 2. 钉钉 (DingTalk) - 紧致左对齐 Markdown 气泡（单行属性用 <br> 紧凑换行；列表块末尾留白闭合，杜绝时间行缩进）
        if ($platform === 'dingtalk') {
            $lines = [];
            foreach ($fieldRows as $row) {
                $lines[] = self::formatFieldLine('dingtalk', $row[0], $row[1], $row[2]);
            }

            $mdText = '';
            foreach ($lines as $idx => $line) {
                if ($idx === 0) {
                    $mdText .= $line;
                } else {
                    $prevLine = $lines[$idx - 1];
                    // 上一行若以 \n 结尾（如列表块），使用换行安全脱离列表容器并留白；否则使用 <br> 保持单行紧凑
                    if (substr($prevLine, -1) === "\n") {
                        $mdText .= "\n" . $line;
                    } else {
                        $mdText .= "<br>" . $line;
                    }
                }
            }

            $md = "### **{$title}**\n\n" . $mdText;
            $footer = [];
            if (!empty($link)) {
                $footer[] = "[{$linkLabel}]({$link})";
            }
            $footer[] = "*{$footerSource}*";
            $md .= "\n\n" . implode("<br>", $footer);

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
            $lines = [];
            foreach ($fieldRows as $row) {
                $lines[] = self::formatFieldLine('feishu', $row[0], $row[1], $row[2]);
            }
            $mdText = implode("\n", $lines) . "\n\n" . $footerSource;

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
            'source' => I18n::brandName()
        ];
    }
}
