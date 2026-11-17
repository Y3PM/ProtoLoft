<?php

/** 校验新账号密码，保留 bcrypt 可完整验证的输入范围。 */
function app_password_length_error($password) {
    if (!is_string($password)) {
        return '请输入有效的密码';
    }
    if (strlen($password) > 64) {
        return '密码不能超过 64 字节（汉字和表情占多个字节）';
    }
    if (strpos($password, "\0") !== false || !mb_check_encoding($password, 'UTF-8')) {
        return '请输入有效的密码';
    }
    if (mb_strlen($password, 'UTF-8') < 6) {
        return '密码至少需要 6 个字符';
    }
    return '';
}
