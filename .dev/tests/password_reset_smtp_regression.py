#!/usr/bin/env python3
"""End-to-end regression for login layout, SMTP settings, and email password reset."""
import argparse
import base64
import hashlib
import json
import re
import socketserver
import sqlite3
import subprocess
import threading
import time
from pathlib import Path

from guest_permissions_regression import ROOT, PASS_WORD, TestClient, sandbox_server


class MockSmtpServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def __init__(self, server_address, expected_user, expected_pass):
        self.expected_user = expected_user
        self.expected_pass = expected_pass
        self.messages = []
        self.greeting_gate = None
        self.lock = threading.Lock()
        super().__init__(server_address, MockSmtpHandler)


class MockSmtpHandler(socketserver.StreamRequestHandler):
    def handle(self):
        if self.server.greeting_gate is not None:
            self.server.greeting_gate.wait(5)
        self.wfile.write(b"220 mock.smtp.local ESMTP ready\r\n")
        self.wfile.flush()
        auth_user = None
        mail_from = None
        rcpt_to = []
        while True:
            raw_line = self.rfile.readline()
            if not raw_line:
                break
            line = raw_line.decode("utf-8", errors="replace").rstrip("\r\n")
            upper = line.upper()
            if upper.startswith("EHLO ") or upper.startswith("HELO "):
                self.wfile.write(b"250-mock.smtp.local\r\n250 AUTH LOGIN PLAIN\r\n")
                self.wfile.flush()
            elif upper == "AUTH LOGIN":
                self.wfile.write(b"334 VXNlcm5hbWU6\r\n")
                self.wfile.flush()
                u_b64 = self.rfile.readline().decode("utf-8", errors="replace").strip()
                auth_user = base64.b64decode(u_b64).decode("utf-8", errors="replace")
                self.wfile.write(b"334 UGFzc3dvcmQ6\r\n")
                self.wfile.flush()
                p_b64 = self.rfile.readline().decode("utf-8", errors="replace").strip()
                auth_pass = base64.b64decode(p_b64).decode("utf-8", errors="replace")
                if auth_user == self.server.expected_user and auth_pass == self.server.expected_pass:
                    self.wfile.write(b"235 Authentication successful\r\n")
                else:
                    self.wfile.write(b"535 Error: authentication failed\r\n")
                self.wfile.flush()
            elif upper.startswith("MAIL FROM:"):
                mail_from = line[10:].strip()
                self.wfile.write(b"250 Ok\r\n")
                self.wfile.flush()
            elif upper.startswith("RCPT TO:"):
                rcpt_to.append(line[8:].strip())
                self.wfile.write(b"250 Ok\r\n")
                self.wfile.flush()
            elif upper == "DATA":
                self.wfile.write(b"354 End data with <CR><LF>.<CR><LF>\r\n")
                self.wfile.flush()
                data_lines = []
                while True:
                    dl = self.rfile.readline()
                    if not dl:
                        break
                    text = dl.decode("utf-8", errors="replace").rstrip("\r\n")
                    if text == ".":
                        break
                    if text.startswith(".."):
                        text = text[1:]
                    data_lines.append(text)
                raw_msg = "\r\n".join(data_lines)
                with self.server.lock:
                    self.server.messages.append({
                        "auth_user": auth_user,
                        "mail_from": mail_from,
                        "rcpt_to": rcpt_to[:],
                        "raw": raw_msg,
                    })
                self.wfile.write(b"250 Ok: queued\r\n")
                self.wfile.flush()
            elif upper == "QUIT":
                self.wfile.write(b"221 Bye\r\n")
                self.wfile.flush()
                break
            else:
                self.wfile.write(b"500 Unknown command\r\n")
                self.wfile.flush()


from email import policy
from email.header import decode_header
from email.parser import BytesParser


def decode_mime_message(raw):
    msg = BytesParser(policy=policy.default).parsebytes(raw.encode("utf-8"))
    raw_subj = msg.get("Subject", "")
    parts = decode_header(raw_subj)
    subject = "".join(
        frag.decode(enc or "utf-8", errors="replace") if isinstance(frag, bytes) else frag
        for frag, enc in parts
    )
    html = ""
    cids = {}
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            if ctype == "text/html":
                html = part.get_payload(decode=True).decode("utf-8", errors="replace")
            elif ctype.startswith("image/"):
                cid = (part.get("Content-ID") or "").strip("<>")
                cids[cid] = part.get_payload(decode=True)
    else:
        html = msg.get_payload(decode=True).decode("utf-8", errors="replace")
    return subject, html, cids


def wait_for_email(server, count):
    deadline = time.monotonic() + 5
    while len(server.messages) < count and time.monotonic() < deadline:
        time.sleep(0.02)
    return len(server.messages) == count


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--php", default="php")
    args = parser.parse_args()

    checks = []

    def check(name, condition):
        assert condition, name
        checks.append(name)
        print("PASS", name, flush=True)

    # 1. PHP lint check on touched files
    php_files = [
        "includes/mailer.php",
        "includes/auth.php",
        "includes/db.php",
        "includes/actions/auth.php",
        "includes/actions/system.php",
        "includes/modals.php",
        "includes/login_modal.php",
        "index.php",
        "api.php",
    ]
    for rel in php_files:
        proc = subprocess.run([args.php, "-l", str(ROOT / rel)], capture_output=True, text=True)
        check(f"PHP syntax valid: {rel}", proc.returncode == 0)

    # 2. Start local mock SMTP server & isolated temporary ProtoLoft site
    smtp_user = "noreply@company.com"
    smtp_pass = "auth_code_163_secret_987"
    smtp_server = MockSmtpServer(("127.0.0.1", 0), smtp_user, smtp_pass)
    smtp_port = smtp_server.server_address[1]
    smtp_thread = threading.Thread(target=smtp_server.serve_forever, daemon=True)
    smtp_thread.start()

    try:
        with sandbox_server(args.php) as (base, temporary):
            site = Path(temporary)
            owner = TestClient(base).login("admin@test.com", PASS_WORD)
            guest = Client = TestClient(base)

            # 3. Verify login page layout & disabled reset behavior
            st, html, _ = guest.request("/index.php")
            html_str = html.decode("utf-8", errors="replace")
            check("standalone login page puts 申请加入协作 on left and 忘记密码？ on right",
                  st == 200
                  and 'class="auth-footer-links"' in html_str
                  and html_str.index('id="switchRegister"') < html_str.index('id="linkForgotPwd"'))

            login_modal_src = (ROOT / "includes/login_modal.php").read_text(encoding="utf-8")
            check("login modal puts 申请加入协作 on left and 忘记密码？ on right",
                  'class="auth-footer-links"' in login_modal_src
                  and login_modal_src.index('id="linkToRegister"') < login_modal_src.index('id="linkToForgot"'))

            res_disabled = guest.api("request_password_reset", {"email": "admin@test.com"})
            check("request_password_reset rejects cleanly when SMTP is disabled",
                  not res_disabled["success"] and "联系管理员" in res_disabled["message"])

            # 4. Create editor, pending, and deactivated users
            r_add = owner.api("user_add", {
                "email": "editor@example.com",
                "name": "张三",
                "password": PASS_WORD,
                "role": "editor",
            })
            check("admin creates normal editor account", r_add["success"])

            r_reg = guest.api("register_visitor", {
                "email": "pending@example.com",
                "name": "待审",
                "password": PASS_WORD,
                "role": "viewer",
            })
            check("visitor registers pending account", r_reg["success"])

            r_deact = owner.api("user_add", {
                "email": "disabled@example.com",
                "name": "停用",
                "password": PASS_WORD,
                "role": "viewer",
            })
            assert r_deact["success"]
            owner.api("user_update", {"id": r_deact["data"], "status": 3})

            # 5. RBAC check on SMTP settings & test_smtp
            editor = TestClient(base).login("editor@example.com", PASS_WORD)
            check("non-admin cannot configure SMTP settings",
                  not editor.api("save_settings", {"smtp_enabled": "1"})["success"])
            check("non-admin cannot trigger test_smtp",
                  not editor.api("test_smtp", {"to_email": "editor@example.com"})["success"])
            check("anonymous visitor cannot trigger test_smtp",
                  not guest.api("test_smtp", {"to_email": "editor@example.com"})["success"])

            # 6. Admin validation and saving SMTP settings
            bad_enable = owner.api("save_settings", {
                "smtp_enabled": "1",
                "smtp_host": "127.0.0.1",
                "smtp_port": str(smtp_port),
                "smtp_encryption": "none",
                "smtp_user": smtp_user,
                "smtp_pass": "",
            })
            check("enabling SMTP without auth code is blocked",
                  not bad_enable["success"] and "授权码" in bad_enable["message"])

            bad_test = owner.api("test_smtp", {
                "to_email": "editor@example.com",
                "smtp_host": "127.0.0.1",
                "smtp_port": str(smtp_port),
                "smtp_encryption": "none",
                "smtp_user": smtp_user,
                "smtp_pass": "wrong_code",
            })
            check("test_smtp surfaces clear auth failure diagnostic on wrong auth code",
                  not bad_test["success"] and "授权码校验失败" in bad_test["message"])

            smtp_config = {
                "site_title": "星辰科技",
                "smtp_enabled": "1",
                "smtp_preset": "custom",
                "smtp_host": "127.0.0.1",
                "smtp_port": str(smtp_port),
                "smtp_encryption": "none",
                "smtp_user": smtp_user,
                "smtp_pass": smtp_pass,
                "smtp_from_name": "星辰科技原型平台" * 4,
            }
            missing_base = owner.api("save_settings", smtp_config)
            check("recovery cannot be enabled without an explicit trusted URL",
                  not missing_base["success"] and "HTTPS" in missing_base["message"])
            save_ok = owner.api("save_settings", dict(smtp_config, site_base_url=base))
            check("admin saves complete SMTP configuration",
                  save_ok["success"]
                  and save_ok["data"]["smtp_has_pass"] is True
                  and save_ok["data"]["mail_reset_enabled"] is True)

            # Verify encrypted storage and no plaintext leakage in HTML
            conn = sqlite3.connect(str(site / "data/database.sqlite"))
            enc_val = conn.execute("SELECT value FROM settings WHERE key='smtp_pass_enc'").fetchone()[0]
            check("SMTP auth code is encrypted in database (not plaintext)",
                  enc_val.startswith("v1:") and smtp_pass not in enc_val)

            _, admin_html, _ = owner.request("/index.php")
            admin_html_str = admin_html.decode("utf-8", errors="replace")
            check("admin HTML does not leak plaintext SMTP auth code",
                  smtp_pass not in admin_html_str and 'data-has-pass="1"' in admin_html_str)

            # Updating unrelated setting without smtp_pass preserves saved secret
            company = "星辰研发" * 5
            save_other = owner.api("save_settings", {"site_title": company})
            check("saving unrelated settings without smtp_pass preserves existing encrypted password",
                  save_other["success"] and save_other["data"]["smtp_has_pass"] is True)

            # Test SMTP reusing stored encrypted password (empty smtp_pass param)
            test_ok = owner.api("test_smtp", {
                "to_email": "editor@example.com",
                "smtp_host": "127.0.0.1",
                "smtp_port": str(smtp_port),
                "smtp_encryption": "none",
                "smtp_user": smtp_user,
                "smtp_pass": "",
            })
            check("test_smtp succeeds using stored encrypted secret", test_ok["success"])
            check("mock SMTP received 1 branded test email", len(smtp_server.messages) == 1)
            wrong_sender = owner.api("test_smtp", {"to_email": "editor@example.com",
                                                    "smtp_user": "other@example.com"})
            check("saved authorization cannot be reused by a different sender",
                  not wrong_sender["success"] and "授权码" in wrong_sender["message"])

            test_subj, test_html, test_cids = decode_mime_message(smtp_server.messages[0]["raw"])
            check("test email contains brand identity, company name, and inline PNG icon",
                  company in test_subj
                  and "立象原型" in test_html
                  and "ProtoLoft" in test_html
                  and "立象以尽意 · 披图而同心" in test_html
                  and "Give ideas a shared home." in test_html
                  and 'src="cid:protoloft-brand-icon"' in test_html
                  and "protoloft-brand-icon" in test_cids
                  and test_cids["protoloft-brand-icon"].startswith(b"\x89PNG"))
            mime_headers = smtp_server.messages[0]["raw"].split("\r\n\r\n", 1)[0]
            words = re.findall(r"=\?UTF-8\?B\?[^?]+\?=", mime_headers)
            check("UTF-8 mail headers fold and round-trip within RFC 2047 limits",
                  len(words) > 2 and all(len(word) <= 75 for word in words))

            # 7. Anti-enumeration on request_password_reset
            neutral_expected = "如果该邮箱已注册且状态正常，你将收到密码重置邮件"
            r_nonexist = guest.api("request_password_reset", {"email": "nobody@example.com"})
            r_pending = guest.api("request_password_reset", {"email": "pending@example.com"})
            r_disabled = guest.api("request_password_reset", {"email": "disabled@example.com"})
            check("non-existent, pending, and disabled emails all return neutral message without sending mail",
                  r_nonexist["success"] and r_nonexist["message"] == neutral_expected
                  and r_pending["success"] and r_pending["message"] == neutral_expected
                  and r_disabled["success"] and r_disabled["message"] == neutral_expected
                  and len(smtp_server.messages) == 1)

            # 8. Real reset email + session invalidation
            old_editor = TestClient(base).login("editor@example.com", PASS_WORD)
            check("old editor session is active before reset",
                  old_editor.api("get_session")["data"]["user"] is not None)

            r_req = guest.api("request_password_reset", {"email": "editor@example.com"},
                              headers={"Host": "untrusted.example.invalid"})
            check("active user password reset request returns neutral message",
                  r_req["success"] and r_req["message"] == neutral_expected)
            check("mock SMTP delivered password reset email", wait_for_email(smtp_server, 2))

            # Rate limit check on immediate repeat request
            r_repeat = guest.api("request_password_reset", {"email": "editor@example.com"})
            check("repeat reset request within 60s is throttled", not r_repeat["success"])

            reset_subj, reset_html, reset_cids = decode_mime_message(smtp_server.messages[1]["raw"])
            m_tok = re.search(r"reset_token=([1-9][0-9]*\.[a-f0-9]{64})", reset_html)
            check("reset email contains brand identity, inline PNG icon, and a valid token URL",
                  "重置登录密码" in reset_subj
                  and "立象原型" in reset_html
                  and "星辰研发" in reset_html
                  and 'src="cid:protoloft-brand-icon"' in reset_html
                  and "protoloft-brand-icon" in reset_cids
                  and m_tok is not None)
            check("reset email uses the configured base despite spoofed Host",
                  base + "/index.php?reset_token=" in reset_html and "untrusted.example.invalid" not in reset_html)
            raw_token = m_tok.group(1)

            # DB stores only sha256 hash, not raw token
            row = conn.execute("SELECT value FROM settings WHERE key = ?",
                               ("password_reset_" + str(r_add["data"]),)).fetchone()[0]
            expected_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
            check("SQLite stores SHA-256 hash only, never raw token",
                  json.loads(row)["token_hash"] == expected_hash and raw_token not in row)

            # Visiting reset link renders set-new-password card even if old session exists
            st_reset, reset_page, reset_headers = old_editor.request(f"/index.php?reset_token={raw_token}")
            reset_page_str = reset_page.decode("utf-8", errors="replace")
            check("visiting reset_token link renders 设置新密码 panel with masked email",
                  st_reset == 200 and "设置新密码" in reset_page_str and "ed***@example.com" in reset_page_str)
            check("reset page suppresses Referer for token-bearing URL", reset_headers.get("Referrer-Policy") == "no-referrer")

            # Tampered token check
            st_bad, bad_page, _ = guest.request("/index.php?reset_token=" + ("0" * 64))
            check("invalid reset_token renders expired/invalid guidance",
                  st_bad == 200 and "重置链接无效或已过期" in bad_page.decode("utf-8", errors="replace"))

            # Validation errors during reset
            check("reset_password rejects mismatched confirmation",
                  not guest.api("reset_password", {
                      "token": raw_token,
                      "new_password": "NewPass#123",
                      "confirm_password": "OtherPass#123",
                  })["success"])
            check("reset_password rejects short password",
                  not guest.api("reset_password", {
                      "token": raw_token,
                      "new_password": "123",
                      "confirm_password": "123",
                  })["success"])

            # Valid reset
            new_pass = "NewStrong#2026"
            res_reset = guest.api("reset_password", {
                "token": raw_token,
                "new_password": new_pass,
                "confirm_password": new_pass,
            })
            check("reset_password succeeds with valid token and matching password",
                  res_reset["success"] and res_reset["data"]["email"] == "editor@example.com")

            # Token is single-use
            res_replay = guest.api("reset_password", {
                "token": raw_token,
                "new_password": "Another#2026",
                "confirm_password": "Another#2026",
            })
            check("used reset token cannot be replayed", not res_replay["success"])

            # Old session & remember cookie are invalidated immediately
            old_sess = old_editor.api("get_session")
            check("old persistent session is invalidated after password reset",
                  old_sess["data"]["user"] is None)

            # Old password rejected, new password accepted
            old_login = TestClient(base).api("login", {"email": "editor@example.com", "password": PASS_WORD})
            check("old password fails after reset", not old_login["success"])

            new_login = TestClient(base).api("login", {"email": "editor@example.com", "password": new_pass})
            check("new password succeeds after reset", new_login["success"])

            for index, change in enumerate(("email", "password", "self"), start=3):
                address = change + "@example.com"
                account = owner.api("user_add", {"email": address, "name": "待验证成员",
                                                  "password": PASS_WORD, "role": "viewer"})
                assert account["success"], account
                assert guest.api("request_password_reset", {"email": address})["success"]
                assert wait_for_email(smtp_server, index)
                _, html, _ = decode_mime_message(smtp_server.messages[-1]["raw"])
                stale = re.search(r"reset_token=([1-9][0-9]*\.[a-f0-9]{64})", html).group(1)
                if change == "self":
                    member = TestClient(base).login(address, PASS_WORD)
                    updated = member.api("change_my_password", {"old_password": PASS_WORD, "new_password": new_pass,
                                                               "confirm_password": new_pass})
                else:
                    fields = {"email": "updated@example.com"} if change == "email" else {"new_password": new_pass}
                    updated = owner.api("user_update", dict(fields, id=account["data"]))
                assert updated["success"], updated
                check("old link is invalidated after " + change + " change",
                      not guest.api("reset_password", {"token": stale, "new_password": new_pass,
                                                       "confirm_password": new_pass})["success"])

            changed_secret = owner.api("save_settings", {"smtp_pass": "wrong_code"})
            assert changed_secret["success"], changed_secret
            with conn:
                conn.execute("DELETE FROM settings WHERE key GLOB 'throttle_*'")
            smtp_server.greeting_gate = threading.Event()
            try:
                started = time.monotonic()
                failing_delivery = guest.api("request_password_reset", {"email": "editor@example.com"})
                elapsed = time.monotonic() - started
            finally:
                smtp_server.greeting_gate.set()
            unknown = guest.api("request_password_reset", {"email": "unknown@example.com"})
            check("public HTTP acknowledgement arrives without waiting for SMTP",
                  elapsed < 3 and failing_delivery == unknown and unknown["success"])
            check("SMTP failure leaves no usable token",
                  conn.execute("SELECT value FROM settings WHERE key = ?",
                               ("password_reset_" + str(r_add["data"]),)).fetchone() is None)
            changed_host = owner.api("save_settings", {"smtp_host": "smtp.example.test"})
            check("switching SMTP host clears the previous saved authorization and disables recovery",
                  changed_host["success"] and not changed_host["data"]["smtp_has_pass"]
                  and not changed_host["data"]["mail_reset_enabled"])
            conn.close()
    finally:
        smtp_server.shutdown()
        smtp_server.server_close()

    print(f"\nALL PASSED ({len(checks)} assertions)")


if __name__ == "__main__":
    main()
