<?php

/** 校验新账号密码，保留 bcrypt 可完整验证的输入范围。 */
function app_password_length_error($password) {
    if (!is_string($password)) {
        return t('pwd.required');
    }
    if (strlen($password) > 64) {
        return t('pwd.too_long');
    }
    if (strpos($password, "\0") !== false || !mb_check_encoding($password, 'UTF-8')) {
        return t('pwd.required');
    }
    if (mb_strlen($password, 'UTF-8') < 6) {
        return t('pwd.too_short');
    }
    return '';
}
