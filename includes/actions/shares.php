<?php
/**
 * 领域服务：原型外发短链与专属分享 (Sharing & Access Control)
 */
if (!defined('APP_VERSION')) exit;

switch ($action) {
    case 'item_get_share':
        if (!Auth::canShare()) jsonResponse(false, null, '当前角色无外发权限');
        $itemId = (int)($_GET['id'] ?? $_POST['id'] ?? 0);
        if ($itemId <= 0) jsonResponse(false, null, '无效的项目ID');
        $itemStmt = $db->prepare("SELECT * FROM items WHERE id = ?");
        $itemStmt->execute([$itemId]);
        $itemRow = $itemStmt->fetch();
        $itemStmt->closeCursor();
        if (!$itemRow) jsonResponse(false, null, '未找到指定项目');
        if (!Auth::canViewItem($itemRow)) {
            jsonResponse(false, null, '该项目已隐藏，无权查看分享设置');
        }
        $shareInfo = Auth::getItemShareSettings($itemId);
        $canManageShare = Auth::canEditItem($itemRow);
        $shareInfo['can_manage'] = $canManageShare;
        $shareInfo['can_copy'] = $canManageShare || ($shareInfo['share_enabled'] && !$shareInfo['is_expired']);
        if (!$canManageShare) {
            unset($shareInfo['access_password']);
            $shareInfo['active_shares'] = [];
            if (!$shareInfo['can_copy']) jsonResponse(false, null, '主链接当前不可分享');
        }
        if (!$shareInfo) jsonResponse(false, null, '未找到指定项目');

        $shareUrl = app_url('share.php?s=' . $shareInfo['share_code']);
        $shareInfo['wechat_url'] = $shareUrl;
        $shareInfo['direct_url'] = $shareUrl;
        if (!empty($shareInfo['active_shares']) && is_array($shareInfo['active_shares'])) {
            foreach ($shareInfo['active_shares'] as &$as) {
                $as['share_url'] = app_url('share.php?s=' . $as['code']);
            }
            unset($as);
        }
        $maxLimit = (int)Auth::getSetting('max_custom_shares_per_item', '5');
        if ($maxLimit < 1) $maxLimit = 1;
        if ($maxLimit > 99) $maxLimit = 99;
        $shareInfo['max_custom_shares'] = $maxLimit;

        jsonResponse(true, $shareInfo);
        break;

    case 'item_save_share':
        if (!Auth::canShare()) jsonResponse(false, null, '当前角色无外发权限');
        $itemId = (int)($_POST['id'] ?? 0);
        if ($itemId <= 0) jsonResponse(false, null, '无效的项目ID');
        
        $itemStmt = $db->prepare("SELECT * FROM items WHERE id = ?");
        $itemStmt->execute([$itemId]);
        $itemRow = $itemStmt->fetch();
        $itemStmt->closeCursor();
        if (!$itemRow) jsonResponse(false, null, '未找到指定项目');
        if (!Auth::canEditItem($itemRow)) {
            jsonResponse(false, null, '您不是该项目的创建者，无权修改其分享设置');
        }

        $rotateToken = (int)($_POST['rotate_token'] ?? 0);
        if ($rotateToken === 1) {
            Auth::rotateItemShareToken($itemId);
        }

        $accessPassword = trim($_POST['access_password'] ?? '');
        if (strlen($accessPassword) > 16) jsonResponse(false, null, '访问密码长度不能超过 16 位');
        $shareEnabled = isset($_POST['share_enabled']) ? (int)$_POST['share_enabled'] : 1;
        $expiresAt = trim($_POST['share_expires_at'] ?? '');
        if ($expiresAt !== '') {
            $ts = strtotime($expiresAt);
            $expiresAt = ($ts !== false && $ts > 0) ? date('Y-m-d 23:59:59', $ts) : null;
        } else {
            $expiresAt = null;
        }

        $updateStmt = $db->prepare("UPDATE items SET access_password = ?, share_enabled = ?, share_expires_at = ? WHERE id = ?");
        $updateStmt->execute([$accessPassword, $shareEnabled, $expiresAt, $itemId]);

        $shareInfo = Auth::getItemShareSettings($itemId);
        $shareUrl = app_url('share.php?s=' . $shareInfo['share_code']);
        $shareInfo['wechat_url'] = $shareUrl;
        $shareInfo['direct_url'] = $shareUrl;
        if (!empty($shareInfo['active_shares']) && is_array($shareInfo['active_shares'])) {
            foreach ($shareInfo['active_shares'] as &$as) {
                $as['share_url'] = app_url('share.php?s=' . $as['code']);
            }
            unset($as);
        }

        jsonResponse(true, $shareInfo, '分享设置已成功保存');
        break;

    case 'share_code_create':
        if (!Auth::canShare()) jsonResponse(false, null, '当前角色无外发权限');
        $itemId = (int)($_POST['item_id'] ?? 0);
        $verId = (int)($_POST['ver_id'] ?? 0);
        $label = trim($_POST['label'] ?? '');
        $pwd = trim($_POST['access_password'] ?? '');
        if (mb_strlen($label, 'UTF-8') > 20) jsonResponse(false, null, '标识名称不能超过 20 个字符');
        if (strlen($pwd) > 16) jsonResponse(false, null, '访问密码长度不能超过 16 位');
        $preset = trim($_POST['expire_preset'] ?? 'forever');
        $expiresAt = trim($_POST['expires_at'] ?? '');

        if ($itemId <= 0) jsonResponse(false, null, '无效的原型ID');
        $itemStmt = $db->prepare("SELECT * FROM items WHERE id = ?");
        $itemStmt->execute([$itemId]);
        $itemRow = $itemStmt->fetch();
        $itemStmt->closeCursor();
        if (!$itemRow) jsonResponse(false, null, '未找到指定原型');
        if (!Auth::canEditItem($itemRow)) {
            jsonResponse(false, null, '您不是该原型的创建者，无权为其生成专属分享链接');
        }

        if ($verId > 0) {
            $target = $db->prepare('SELECT 1 FROM versions WHERE id = ? AND item_id = ?');
            $target->execute([$verId, $itemId]);
            $hasVer = (bool)$target->fetchColumn();
            $target->closeCursor();
            if (!$hasVer) jsonResponse(false, null, '版本不属于此项目');
        }
        $maxSharesLimit = (int)Auth::getSetting('max_custom_shares_per_item', '5');
        if ($maxSharesLimit < 1) $maxSharesLimit = 1;
        if ($maxSharesLimit > 99) $maxSharesLimit = 99;

        $currentActiveShares = Auth::getItemActiveShareCodes($itemId);
        if (count($currentActiveShares) >= $maxSharesLimit) {
            jsonResponse(false, null, "该原型的专属外发分享已达上限（最多 {$maxSharesLimit} 条生效中），请先作废不再使用的旧链接");
        }

        if ($preset === '7d') {
            $expiresAt = date('Y-m-d 23:59:59', strtotime('+7 days'));
        } elseif ($preset === '30d') {
            $expiresAt = date('Y-m-d 23:59:59', strtotime('+30 days'));
        } elseif ($preset === 'custom' && $expiresAt !== '') {
            $ts = strtotime($expiresAt);
            $expiresAt = ($ts !== false && $ts > 0) ? date('Y-m-d 23:59:59', $ts) : null;
        } else {
            $expiresAt = null;
        }

        $currentUser = Auth::getCurrentUser();
        $createdBy = $currentUser ? (int)$currentUser['id'] : 0;

        $code = Auth::createCustomShareCode($itemId, $verId, $label, $pwd, $expiresAt, $createdBy);
        if (!$code) {
            jsonResponse(false, null, '生成专属分享链接失败，请重试');
        }

        $activeShares = Auth::getItemActiveShareCodes($itemId);
        foreach ($activeShares as &$as) {
            $as['share_url'] = app_url('share.php?s=' . $as['code']);
        }
        unset($as);

        jsonResponse(true, [
            'code' => $code,
            'share_url' => app_url('share.php?s=' . $code),
            'access_password' => $pwd,
            'has_password' => !empty($pwd),
            'active_shares' => $activeShares,
            'max_custom_shares' => $maxSharesLimit
        ], '专属分享链接已成功生成');
        break;

    case 'share_code_revoke':
        if (!Auth::canShare()) jsonResponse(false, null, '当前角色无外发权限');
        $itemId = (int)($_POST['item_id'] ?? 0);
        $code = trim($_POST['code'] ?? '');
        if ($itemId <= 0 || $code === '') jsonResponse(false, null, '参数不完整');

        $itemStmt = $db->prepare("SELECT * FROM items WHERE id = ?");
        $itemStmt->execute([$itemId]);
        $itemRow = $itemStmt->fetch();
        $itemStmt->closeCursor();
        if (!$itemRow) jsonResponse(false, null, '未找到指定原型');
        if (!Auth::canEditItem($itemRow)) {
            jsonResponse(false, null, '您不是该原型的创建者，无权修改分享设置');
        }

        $ok = Auth::revokeShareCode($code, $itemId);
        if ($ok) {
            $activeShares = Auth::getItemActiveShareCodes($itemId);
            foreach ($activeShares as &$as) {
                $as['share_url'] = app_url('share.php?s=' . $as['code']);
            }
            unset($as);

            $maxSharesLimit = (int)Auth::getSetting('max_custom_shares_per_item', '5');
            if ($maxSharesLimit < 1) $maxSharesLimit = 1;
            if ($maxSharesLimit > 99) $maxSharesLimit = 99;

            jsonResponse(true, [
                'active_shares' => $activeShares,
                'max_custom_shares' => $maxSharesLimit
            ], '该专属分享链接已作废');
        } else {
            jsonResponse(false, null, '链接不存在或已作废');
        }
        break;

    case 'item_toggle_share':
        if (!Auth::canShare()) jsonResponse(false, null, '当前角色无外发权限');
        if (!Auth::canManage()) jsonResponse(false, null, '无权操作');
        $itemId = (int)($_POST['id'] ?? $_POST['item_id'] ?? 0);
        if ($itemId <= 0) jsonResponse(false, null, '无效的项目ID');
        $item = $db->prepare("SELECT * FROM items WHERE id = ?");
        $item->execute([$itemId]);
        $row = $item->fetch();
        $item->closeCursor();
        if (!$row) jsonResponse(false, null, '未找到指定项目');
        if (!Auth::canEditItem($row)) {
            jsonResponse(false, null, '您不是该项目的创建者，无权修改其分享状态');
        }
        $isEnabled = Auth::toggleItemShareStatus($itemId);
        jsonResponse(true, ['share_enabled' => $isEnabled], $isEnabled ? '已开启外链分享' : '已停用外链分享');
        break;

    case 'item_rotate_share':
        if (!Auth::isAdmin()) jsonResponse(false, null, '仅系统管理员有权执行重置安全短链操作');
        $itemId = (int)($_POST['id'] ?? $_POST['item_id'] ?? 0);
        if ($itemId <= 0) jsonResponse(false, null, '无效的项目ID');
        $item = $db->prepare("SELECT * FROM items WHERE id = ?");
        $item->execute([$itemId]);
        $row = $item->fetch();
        $item->closeCursor();
        if (!$row) jsonResponse(false, null, '未找到指定项目');
        $newCode = Auth::rotateItemShareToken($itemId);
        if (empty($newCode)) {
            jsonResponse(false, null, '重置安全短链失败，请稍后重试');
        }
        jsonResponse(true, ['share_code' => $newCode], '已成功重置该原型的安全短链，所有历史外发链接已全部失效作废');
        break;
}
