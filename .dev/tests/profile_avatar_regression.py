#!/usr/bin/env python3
"""
立象原型 · ProtoLoft · 个人中心品牌折纸大象头像专项回归测试
验证点：
1. 8 个选定造型；01 固定原色，其余 7 个 × 6 配色，共 43 个合法纯矢量组合；
2. includes/modals.php 无硬编码 Hex，侧栏 .user-badge 保持原样（严格仅用于个人中心）；
3. 全新冷启动库创建用户、访客注册审批通过后自动绑定合法随机头像；
4. 审阅人 / 协作者 / 管理员均可调用 profile_update_avatar 切换保存并跨请求持久化；
5. 未登录、缺失 CSRF、非法头像 ID 全部被拦截，且不污染已有数据。
"""

import argparse
import json
import re
import sqlite3
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

from guest_permissions_regression import PASS_WORD, TestClient, sandbox_server

ROOT = Path(__file__).resolve().parents[2]
EXPECTED_IDS = [
    f"{pose}-{theme}"
    for pose in ("leap", "shoulder", "head", "trunk", "sit", "bow", "walk", "rest")
    for theme in ("sky", "mint", "amber", "violet", "coral", "indigo")
    if pose != "leap" or theme == "sky"
]


def check(label, condition):
    assert condition, label
    print(f"PASS {label}", flush=True)


def run_static_checks():
    avatars_js = (ROOT / "assets" / "js" / "profile-avatars.js").read_text(encoding="utf-8")
    check("头像 JS 不硬编码色值，不依赖位图或开发目录", not re.search(r'#[0-9a-fA-F]{3,8}\b|\.png|\.dev/', avatars_js))

    node_script = (
        "const vm = require('vm');"
        "const fs = require('fs');"
        "const sandbox = { window: {} };"
        "sandbox.window = sandbox;"
        f"vm.runInNewContext(fs.readFileSync({json.dumps(str(ROOT / 'assets' / 'js' / 'profile-avatars.js'))}, 'utf8'), sandbox);"
        "const pa = sandbox.ProfileAvatars;"
        "const out = { ids: pa.ALL_IDS, poses: pa.POSES, themes: pa.THEMES, svgs: pa.ALL_IDS.map(id => pa.renderSvg(id)), normEmpty: pa.normalizeId('', 2) };"
        "console.log(JSON.stringify(out));"
    )
    res = subprocess.run(["node", "-e", node_script], capture_output=True, text=True, check=True)
    data = json.loads(res.stdout)
    check("JS 模块导出全部 43 个合法头像组合，标准 Logo 仅原色", data["ids"] == EXPECTED_IDS)
    check("仅包含用户选定的 8 个造型编号", [p["number"] for p in data["poses"]] == ["01", "02", "03", "04", "07", "08", "10", "12"])
    logo = ET.parse(ROOT / 'assets/images/logo-icon.svg').getroot()
    source_polys = logo.findall('.//{http://www.w3.org/2000/svg}polygon')
    check("01 全部 17 块几何精确复用原始 Logo 路径", [p[1] for p in data['poses'][0]['polys']] == [p.attrib['points'] for p in source_polys])
    check("8 个造型的几何均不相同", len({json.dumps(p['polys']) for p in data['poses']}) == 8)
    check(
        "43 个 SVG 均为纯矢量且无 img/script/on* 危险注入",
        len(data["svgs"]) == 43 and all(
            svg.startswith('<svg class="profile-avatar-svg" viewBox="0 0 128 128"')
            and "</svg>" in svg
            and "<script" not in svg.lower()
            and "<img" not in svg.lower()
            and "onload=" not in svg.lower()
            for svg in data["svgs"]
        ),
    )
    check("空头像按 seed 确定性兜底为合法 ID", data["normEmpty"] in EXPECTED_IDS)

    modals_php = (ROOT / "includes" / "modals.php").read_text(encoding="utf-8")
    check("modals.php 已装配个人中心可点击头像与选板 DOM", 'id="myProfileAvatarBtn"' in modals_php and 'id="profileAvatarPopover"' in modals_php)
    check("modals.php 保持 0 处硬编码 Hex", len(re.findall(r"#[0-9a-fA-F]{3,8}\b", modals_php)) == 0)

    index_php = (ROOT / "index.php").read_text(encoding="utf-8")
    sidebar_badge_slice = index_php[index_php.find("class=\"user-badge\""):index_php.find("class=\"user-badge\"") + 450]
    check("侧栏左下角用户按钮保持原图标，未扩撒头像", "ri-user-smile-line" in sidebar_badge_slice and "myProfileAvatarGraphic" not in sidebar_badge_slice)

    export_py = (ROOT / ".dev" / "export_release.py").read_text(encoding="utf-8")
    check("export_release.py 白名单已纳入 assets/js/profile-avatars.js", "'assets/js/profile-avatars.js'" in export_py)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--php", default="php")
    args = parser.parse_args()

    run_static_checks()

    with sandbox_server(args.php) as (base, directory):
        owner = TestClient(base).login("admin@test.com", PASS_WORD)
        session_owner = owner.api("get_session")
        check("管理员会话返回合法默认头像", session_owner["success"] and session_owner["data"]["user"]["avatar"] in EXPECTED_IDS)

        assigned = []
        for idx in range(4):
            email = f"member{idx}@example.com"
            added = owner.api("user_add", {
                "email": email,
                "name": f"成员{idx}",
                "password": PASS_WORD,
                "role": "editor" if idx % 2 == 0 else "viewer",
            })
            check(f"管理员创建成员 {idx} 成功", added["success"])
            c = TestClient(base).login(email, PASS_WORD)
            av = c.user.get("avatar", "")
            check(f"新建成员 {idx} 绑定了 43 个合法组合之一 ({av})", av in EXPECTED_IDS)
            assigned.append(av)

        guest = TestClient(base)
        reg = guest.api("register_visitor", {
            "email": "visitor_av@example.com",
            "name": "自助审阅",
            "password": PASS_WORD,
            "role": "viewer",
        })
        check("访客自助注册提交成功", reg["success"])
        new_uid = reg["data"]["id"]
        app_res = owner.api("approve_user", {"id": new_uid, "role": "viewer"})
        check("管理员审批访客成功", app_res["success"])

        viewer = TestClient(base).login("visitor_av@example.com", PASS_WORD)
        viewer_init_av = viewer.user.get("avatar", "")
        check(f"自助注册审批用户自动拥有默认头像 ({viewer_init_av})", viewer_init_av in EXPECTED_IDS)

        # 确认 user_list 不额外暴露他人头像字段（严格限定个人中心用途）
        ulist = owner.api("user_list")
        check("user_list 通讯录保持原字段结构，不混入 avatar", ulist["success"] and all("avatar" not in row for row in ulist["data"]))

        # 切换并保存头像（覆盖不同角色）
        target_av = "rest-coral" if viewer_init_av != "rest-coral" else "sit-amber"
        upd_viewer = viewer.api("profile_update_avatar", {"avatar": target_av})
        check("审阅人切换并保存头像成功", upd_viewer["success"] and upd_viewer["data"]["avatar"] == target_av)

        viewer_relogin = TestClient(base).login("visitor_av@example.com", PASS_WORD)
        check("重新登录后审阅人新头像持久生效", viewer_relogin.user.get("avatar") == target_av)
        status, body_bytes, _ = viewer_relogin.request("/index.php")
        index_html = body_bytes.decode("utf-8", errors="replace")
        check("工作台首页 CURRENT_USER 已同步最新头像", status == 200 and (f'"avatar":"{target_av}"' in index_html or f'"avatar": "{target_av}"' in index_html))

        upd_owner = owner.api("profile_update_avatar", {"avatar": "sit-indigo"})
        check("管理员切换并保存头像成功", upd_owner["success"] and upd_owner["data"]["avatar"] == "sit-indigo")

        for role in ('admin', 'editor'):
            email = f'avatar_{role}@example.com'
            added = owner.api('user_add', {'email': email, 'name': role, 'password': PASS_WORD, 'role': role})
            check(f"创建 {role} 头像测试账号", added['success'])
            member = TestClient(base).login(email, PASS_WORD)
            for avatar in EXPECTED_IDS:
                changed = member.api('profile_update_avatar', {'avatar': avatar})
                check(f"{role} 保存组合 {avatar}", changed['success'] and changed['data']['avatar'] == avatar)
            persisted = TestClient(base).login(email, PASS_WORD)
            check(f"{role} 最后组合重新登录后持久化", persisted.user['avatar'] == EXPECTED_IDS[-1])
        check("其他成员更新头像不影响主管理员", owner.api('get_session')['data']['user']['avatar'] == 'sit-indigo')

        # 防护边界校验
        unauth_res = TestClient(base).api("profile_update_avatar", {"avatar": "leap-sky"})
        check("未登录访客禁止更新头像", not unauth_res["success"])

        # 无 CSRF Token 拦截
        raw_post = viewer_relogin.api("profile_update_avatar", {"avatar": "leap-mint"}, csrf=False)
        check("缺少 CSRF Token 的头像更新被拦截", not raw_post["success"])

        for bad_val in ("", "hacker-red", "leap-sky<script>", "sit-pink", "leap-mint", "play-sky"):
            bad_res = viewer_relogin.api("profile_update_avatar", {"avatar": bad_val})
            check(f"非法头像值 '{bad_val}' 被白名单拦截", not bad_res["success"])

        # 确认被拒后数据库未损坏
        db_conn = sqlite3.connect(str(Path(directory) / "data" / "database.sqlite"))
        stored = db_conn.execute("SELECT avatar FROM users WHERE id = ?", (new_uid,)).fetchone()[0]
        db_conn.close()
        check("拦截非法请求后原已保存头像保持完好", stored == target_av)


if __name__ == "__main__":
    main()
