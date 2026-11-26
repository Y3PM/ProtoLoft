<?php
/**
 * 领域服务：原型外发短链与专属分享 (Sharing & Access Control)
 */
if (!defined('APP_VERSION')) exit;

switch ($action) {
    case 'item_get_share':
        if (!Auth::canShare()) jsonResponse(false, null, t('api.shares.no_perm'));
        $itemId = (int)($_GET['id'] ?? $_POST['id'] ?? 0);
        if ($itemId <= 0) jsonResponse(false, null, t('api.shares.invalid_item_id'));
        $itemStmt = $db->prepare("SELECT * FROM items WHERE id = ?");
        $itemStmt->execute([$itemId]);
        $itemRow = $itemStmt->fetch();
        $itemStmt->closeCursor();
        if (!$itemRow) jsonResponse(false, null, t('api.items.not_found'));
        if (!Auth::canViewItem($itemRow)) {
            jsonResponse(false, null, t('api.shares.item_hidden'));
        }
        $shareInfo = Auth::getItemShareSettings($itemId);
        $canManageShare = Auth::canEditItem($itemRow);
        $shareInfo['can_manage'] = $canManageShare;
        $shareInfo['can_copy'] = $canManageShare || ($shareInfo['share_enabled'] && !$shareInfo['is_expired']);
        if (!$canManageShare) {
            unset($shareInfo['access_password']);
            $shareInfo['active_shares'] = [];
            if (!$shareInfo['can_copy']) jsonResponse(false, null, t('api.shares.main_disabled'));
        }
        if (!$shareInfo) jsonResponse(false, null, t('api.items.not_found'));

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
        if (!Auth::canShare()) jsonResponse(false, null, t('api.shares.no_perm'));
        $itemId = (int)($_POST['id'] ?? 0);
        if ($itemId <= 0) jsonResponse(false, null, t('api.shares.invalid_item_id'));
        
        $itemStmt = $db->prepare("SELECT * FROM items WHERE id = ?");
        $itemStmt->execute([$itemId]);
        $itemRow = $itemStmt->fetch();
        $itemStmt->closeCursor();
        if (!$itemRow) jsonResponse(false, null, t('api.items.not_found'));
        if (!Auth::canEditItem($itemRow)) {
            jsonResponse(false, null, t('api.shares.not_creator_cfg'));
        }

        $rotateToken = (int)($_POST['rotate_token'] ?? 0);
        if ($rotateToken === 1) {
            Auth::rotateItemShareToken($itemId);
        }

        $accessPassword = trim($_POST['access_password'] ?? '');
        if (strlen($accessPassword) > 16) jsonResponse(false, null, t('api.shares.pwd_len_16'));
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

        jsonResponse(true, $shareInfo, t('api.shares.saved'));
        break;

    case 'share_code_create':
        if (!Auth::canShare()) jsonResponse(false, null, t('api.shares.no_perm'));
        $itemId = (int)($_POST['item_id'] ?? 0);
        $verId = (int)($_POST['ver_id'] ?? 0);
        $label = trim($_POST['label'] ?? '');
        $pwd = trim($_POST['access_password'] ?? '');
        if (mb_strlen($label, 'UTF-8') > 20) jsonResponse(false, null, t('api.shares.label_len_20'));
        if (strlen($pwd) > 16) jsonResponse(false, null, t('api.shares.pwd_len_16'));
        $preset = trim($_POST['expire_preset'] ?? 'forever');
        $expiresAt = trim($_POST['expires_at'] ?? '');

        if ($itemId <= 0) jsonResponse(false, null, t('api.shares.invalid_proto_id'));
        $itemStmt = $db->prepare("SELECT * FROM items WHERE id = ?");
        $itemStmt->execute([$itemId]);
        $itemRow = $itemStmt->fetch();
        $itemStmt->closeCursor();
        if (!$itemRow) jsonResponse(false, null, t('api.shares.proto_not_found'));
        if (!Auth::canEditItem($itemRow)) {
            jsonResponse(false, null, t('api.shares.not_creator_create'));
        }

        if ($verId > 0) {
            $target = $db->prepare('SELECT 1 FROM versions WHERE id = ? AND item_id = ?');
            $target->execute([$verId, $itemId]);
            $hasVer = (bool)$target->fetchColumn();
            $target->closeCursor();
            if (!$hasVer) jsonResponse(false, null, t('api.shares.ver_not_in_item'));
        }
        $maxSharesLimit = (int)Auth::getSetting('max_custom_shares_per_item', '5');
        if ($maxSharesLimit < 1) $maxSharesLimit = 1;
        if ($maxSharesLimit > 99) $maxSharesLimit = 99;

        $currentActiveShares = Auth::getItemActiveShareCodes($itemId);
        if (count($currentActiveShares) >= $maxSharesLimit) {
            jsonResponse(false, null, t('api.shares.limit_exceeded', ['max' => $maxSharesLimit]));
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
            jsonResponse(false, null, t('api.shares.create_fail'));
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
        ], t('api.shares.created'));
        break;

    case 'share_code_revoke':
        if (!Auth::canShare()) jsonResponse(false, null, t('api.shares.no_perm'));
        $itemId = (int)($_POST['item_id'] ?? 0);
        $code = trim($_POST['code'] ?? '');
        if ($itemId <= 0 || $code === '') jsonResponse(false, null, t('api.shares.incomplete_params'));

        $itemStmt = $db->prepare("SELECT * FROM items WHERE id = ?");
        $itemStmt->execute([$itemId]);
        $itemRow = $itemStmt->fetch();
        $itemStmt->closeCursor();
        if (!$itemRow) jsonResponse(false, null, t('api.shares.proto_not_found'));
        if (!Auth::canEditItem($itemRow)) {
            jsonResponse(false, null, t('api.shares.not_creator_mod'));
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
            ], t('api.shares.revoked'));
        } else {
            jsonResponse(false, null, t('api.shares.missing_or_revoked'));
        }
        break;

    case 'item_toggle_share':
        if (!Auth::canShare()) jsonResponse(false, null, t('api.shares.no_perm'));
        if (!Auth::canManage()) jsonResponse(false, null, t('api.no_perm'));
        $itemId = (int)($_POST['id'] ?? $_POST['item_id'] ?? 0);
        if ($itemId <= 0) jsonResponse(false, null, t('api.shares.invalid_item_id'));
        $item = $db->prepare("SELECT * FROM items WHERE id = ?");
        $item->execute([$itemId]);
        $row = $item->fetch();
        $item->closeCursor();
        if (!$row) jsonResponse(false, null, t('api.items.not_found'));
        if (!Auth::canEditItem($row)) {
            jsonResponse(false, null, t('api.shares.not_creator_toggle'));
        }
        $isEnabled = Auth::toggleItemShareStatus($itemId);
        jsonResponse(true, ['share_enabled' => $isEnabled], $isEnabled ? t('api.shares.enabled_msg') : t('api.shares.disabled_msg'));
        break;

    case 'item_rotate_share':
        if (!Auth::isAdmin()) jsonResponse(false, null, t('api.shares.rotate_admin_only'));
        $itemId = (int)($_POST['id'] ?? $_POST['item_id'] ?? 0);
        if ($itemId <= 0) jsonResponse(false, null, t('api.shares.invalid_item_id'));
        $item = $db->prepare("SELECT * FROM items WHERE id = ?");
        $item->execute([$itemId]);
        $row = $item->fetch();
        $item->closeCursor();
        if (!$row) jsonResponse(false, null, t('api.items.not_found'));
        $newCode = Auth::rotateItemShareToken($itemId);
        if (empty($newCode)) {
            jsonResponse(false, null, t('api.shares.rotate_fail'));
        }
        jsonResponse(true, ['share_code' => $newCode], t('api.shares.rotated_msg'));
        break;
}
