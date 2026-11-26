#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
立象原型 · ProtoLoft · 本地演示数据一键灌入脚本 (v3.2.0)
用途：为本地开发/演示环境生成贴近真实产研团队协作场景的多角色、多项目、多版本、
批注协同、外发分享与近 14 天趋势图审计数据（默认保留工作区 zh-CN 语言）。

⚠️ 仅限本地开发测试使用；严禁上传至生产服务器（已被 .dev/ 与 release 打包规则隔离）。
"""
import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / 'data'
DB_PATH = DATA_DIR / 'database.sqlite'
PROTO_DIR = DATA_DIR / 'prototypes'
DEFAULT_PASSWORD = 'Demo@123456'


def make_php_hash(php_bin: str, password: str) -> str:
    code = "echo password_hash($argv[1], PASSWORD_DEFAULT);"
    return subprocess.check_output([php_bin, '-r', code, '--', password]).decode('utf-8').strip()


def write_proto_html(dest_dir: Path, title: str, subtitle: str, badge: str, active_nav: str, cards: list) -> int:
    """生成带多页导航与真实交互外观的轻量原型 HTML 目录，返回目录总字节数。"""
    dest_dir.mkdir(parents=True, exist_ok=True)
    pages_dir = dest_dir / 'pages'
    pages_dir.mkdir(exist_ok=True)

    nav_items = [
        ('index.html', '概览工作台', 'ri-dashboard-line'),
        ('pages/flow.html', '核心流程页', 'ri-flow-chart'),
        ('pages/detail.html', '审批与明细', 'ri-file-list-3-line'),
    ]

    def render_page(filename: str, page_heading: str, section_desc: str, card_list: list) -> str:
        rel_prefix = '../' if filename.startswith('pages/') else ''
        nav_html = ''.join(
            f'<a class="nav-link {"active" if fn == filename else ""}" href="{rel_prefix}{fn}">{label}</a>'
            for fn, label, _ in nav_items
        )
        cards_html = ''.join(
            f'''<div class="kpi-card">
                <div class="kpi-label">{c[0]}</div>
                <div class="kpi-val">{c[1]}</div>
                <div class="kpi-sub">{c[2]}</div>
            </div>'''
            for c in card_list
        )
        return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{page_heading} - {title}</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f7f8fa; color: #171a1d; }}
  .shell {{ display: flex; min-height: 100vh; }}
  .aside {{ width: 220px; background: #fff; border-right: 1px solid #e7eaf0; padding: 20px 14px; display: flex; flex-direction: column; gap: 6px; }}
  .brand {{ font-size: 14px; font-weight: 700; color: #0076de; padding: 6px 10px 14px; border-bottom: 1px solid #eef0f4; margin-bottom: 8px; }}
  .nav-link {{ display: block; padding: 9px 12px; border-radius: 7px; color: #4e5969; text-decoration: none; font-size: 13px; font-weight: 500; }}
  .nav-link:hover {{ background: #f2f4f7; color: #171a1d; }}
  .nav-link.active {{ background: #e8f3ff; color: #0076de; font-weight: 600; }}
  .main {{ flex: 1; padding: 28px 34px; max-width: 1120px; }}
  .top {{ display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }}
  .title {{ font-size: 20px; font-weight: 700; margin: 0; }}
  .sub {{ color: #6b7280; font-size: 13px; margin-top: 4px; }}
  .badge {{ background: #eef6ff; color: #0076de; border: 1px solid #cce3ff; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }}
  .grid {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-bottom: 22px; }}
  .kpi-card {{ background: #fff; border: 1px solid #e7eaf0; border-radius: 10px; padding: 18px 20px; }}
  .kpi-label {{ font-size: 12px; color: #6b7280; margin-bottom: 8px; }}
  .kpi-val {{ font-size: 24px; font-weight: 700; color: #171a1d; margin-bottom: 4px; }}
  .kpi-sub {{ font-size: 12px; color: #10b981; }}
  .panel {{ background: #fff; border: 1px solid #e7eaf0; border-radius: 10px; padding: 20px; }}
  .panel h3 {{ margin: 0 0 12px; font-size: 15px; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
  th, td {{ text-align: left; padding: 10px 8px; border-bottom: 1px solid #f0f2f5; }}
  th {{ color: #6b7280; font-weight: 500; }}
  .btn {{ display: inline-block; background: #0076de; color: #fff; padding: 7px 14px; border-radius: 6px; font-size: 13px; text-decoration: none; border: none; cursor: pointer; }}
  .btn:hover {{ background: #005bb5; }}
</style>
</head>
<body>
  <div class="shell">
    <aside class="aside">
      <div class="brand">{title}</div>
      {nav_html}
    </aside>
    <main class="main">
      <div class="top">
        <div>
          <h1 class="title">{page_heading}</h1>
          <div class="sub">{section_desc} · {subtitle}</div>
        </div>
        <span class="badge">{badge}</span>
      </div>
      <div class="grid">{cards_html}</div>
      <div class="panel">
        <h3>近期迭代节点与交互状态</h3>
        <table>
          <thead><tr><th>模块节点</th><th>交互状态</th><th>负责人</th><th>验收结论</th></tr></thead>
          <tbody>
            <tr><td>主工作流程编排</td><td>已完成交互稿走查</td><td>周若曦</td><td>待研发确认边界异常</td></tr>
            <tr><td>表单校验与空状态</td><td>已对齐 Linear 设计规范</td><td>陈星河</td><td>已通过评审</td></tr>
            <tr><td>权限隔离与二次确认</td><td>含误删防呆提示框</td><td>林清远</td><td>评审中</td></tr>
          </tbody>
        </table>
        <div style="margin-top:16px;"><button class="btn" onclick="alert('原型交互模拟：当前模块状态正常（演示环境）')">触发模拟交互检查</button></div>
      </div>
    </main>
  </div>
</body>
</html>'''

    (dest_dir / 'index.html').write_text(render_page('index.html', active_nav, '产品原型主视图与关键指标总览', cards), encoding='utf-8')
    (pages_dir / 'flow.html').write_text(render_page('pages/flow.html', '核心流程页 - ' + title, '端到端任务分支与异常兜底流向', cards), encoding='utf-8')
    (pages_dir / 'detail.html').write_text(render_page('pages/detail.html', '审批与明细 - ' + title, '字段规格、状态机定义与多角色视图', cards), encoding='utf-8')

    total_bytes = 0
    for f in dest_dir.rglob('*'):
        if f.is_file():
            total_bytes += f.stat().st_size
    return total_bytes


def write_fake_rp(dest_dir: Path, filename: str = 'source.rp', size_kb: int = 48) -> int:
    """生成受控大小、符合 RP 文件后缀的演示占位二进制底稿文件。"""
    p = dest_dir / filename
    header = b'PK\x03\x04ProtoLoft-Demo-RP-Asset\x00'
    payload = header + (b'AXURE_RP_DEMO_BLOCK_' * ((size_kb * 1024) // 20))
    p.write_bytes(payload[:size_kb * 1024])
    return p.stat().st_size


def init_fresh_schema(php_bin: str):
    """调用系统 DB::getInstance() 初始化干净的 Schema 与表结构。"""
    code = "require 'includes/config.php'; require 'includes/db.php'; DB::getInstance(); echo 'SCHEMA_OK';"
    out = subprocess.check_output([php_bin, '-r', code], cwd=str(ROOT)).decode('utf-8')
    if 'SCHEMA_OK' not in out:
        raise RuntimeError(f'Schema initialization failed: {out}')


def seed(php_bin: str):
    # 1. 重建干净 data 核心内容，保留安全占位与 .htaccess
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for db_file in ('database.sqlite', 'database.sqlite-wal', 'database.sqlite-shm'):
        target = DATA_DIR / db_file
        if target.exists():
            target.unlink()
    if PROTO_DIR.exists():
        shutil.rmtree(PROTO_DIR)
    PROTO_DIR.mkdir(parents=True, exist_ok=True)

    # 通过官方 PHP DB 类生成完全符合 v3.2.0 规范的表与触发器
    init_fresh_schema(php_bin)
    (DATA_DIR / 'install.lock').write_text(f'Installed at {datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")} (Demo v3.2.0)\n', encoding='utf-8')

    pwd_hash = make_php_hash(php_bin, DEFAULT_PASSWORD)
    conn = sqlite3.connect(str(DB_PATH))
    cur = conn.cursor()

    now = datetime.utcnow()
    fmt = lambda dt: dt.strftime('%Y-%m-%d %H:%M:%S')

    # 2. 系统设置
    settings = {
        'system_language': 'zh-CN',
        'system_timezone': 'Asia/Shanghai',
        'site_title': '',
        'global_webhook_url': '',
        'visitor_register_enabled': '1',
        'allowed_email_domains': 'protoloft.demo',
        'visitor_notify_admin_ids': '[1,2]',
        'max_custom_shares_per_item': '5',
        'site_base_url': '',
        'global_watermark_enabled': '1',
        'perm_editor_share': '1',
        'perm_viewer_download_rp': '1',
        'perm_viewer_share': '1',
        'perm_guest_download_rp': '0',
        'perm_guest_annotate': '1',
        'smtp_enabled': '0',
        'smtp_preset': 'custom',
        'smtp_host': '',
        'smtp_port': '465',
        'smtp_encryption': 'ssl',
        'smtp_user': '',
        'smtp_from_name': 'ProtoLoft',
    }
    for k, v in settings.items():
        cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, v))

    # 3. 成员账号 (覆盖主管理员、管理员、协作者、审阅人、待审批申请)
    users_data = [
        ('owner@protoloft.demo', '林清远', pwd_hash, 'admin', 1, 1, 0, '产品体验中心 · 总监', 'leap-sky', fmt(now - timedelta(days=30))),
        ('admin@protoloft.demo', '苏明哲', pwd_hash, 'admin', 0, 1, 0, '研发效能组 · 架构师', 'shoulder-mint', fmt(now - timedelta(days=28))),
        ('editor1@protoloft.demo', '周若曦', pwd_hash, 'editor', 0, 1, 0, '核心交易设计组', 'trunk-violet', fmt(now - timedelta(days=25))),
        ('editor2@protoloft.demo', '陈星河', pwd_hash, 'editor', 0, 1, 0, '商业化产品部', 'sit-coral', fmt(now - timedelta(days=20))),
        ('viewer@protoloft.demo', '陆知行', pwd_hash, 'viewer', 0, 1, 0, '前端基础研发组', 'head-amber', fmt(now - timedelta(days=18))),
        ('pending@protoloft.demo', '许嘉宁', pwd_hash, 'viewer', 0, 0, 0, '质量保障部 · 申请加入版本评审', 'bow-indigo', fmt(now - timedelta(hours=4))),
    ]
    cur.executemany(
        """INSERT INTO users (email, name, password_hash, role, is_owner, status, is_first_login, department, avatar, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        users_data,
    )

    # 4. 文件夹分类
    cats = [
        ('核心交易平台', 10, 1, fmt(now - timedelta(days=26))),
        ('移动端与客户门户', 20, 1, fmt(now - timedelta(days=22))),
        ('AI 智能体与内部工具', 30, 1, fmt(now - timedelta(days=15))),
    ]
    cur.executemany("INSERT INTO categories (name, sort_order, is_visible, created_at) VALUES (?, ?, ?, ?)", cats)

    # 5. 项目与外链
    items = [
        # id=1
        (1, 'project', '立象云工作台 3.0 改版', 'ux', None, '_blank', '', 'plwork01', 1, None, '', 10, 1, 1, '', 1, fmt(now - timedelta(days=24))),
        # id=2
        (1, 'project', '多端统一收银台 v4.2', 'ux', None, '_blank', '', 'plpay02', 1, None, '', 20, 1, 3, '1,3', 1, fmt(now - timedelta(days=20))),
        # id=3
        (2, 'project', '企业服务 App · 首页与审批流', 'ux', None, '_blank', '', 'plapp03', 1, None, '', 10, 1, 4, '', 0, fmt(now - timedelta(days=16))),
        # id=4
        (2, 'link', '2026 设计令牌规范 (Figma)', 'ux', 'https://www.figma.com', '_blank', '', '', 1, None, '', 20, 1, 3, '', 0, fmt(now - timedelta(days=12))),
        # id=5
        (3, 'project', 'AI 原型需求评审助手 · MCP 面板', 'ux', None, '_blank', '', 'plmcp05', 1, None, '', 10, 1, 2, '1,2,3', 1, fmt(now - timedelta(days=8))),
    ]
    cur.executemany(
        """INSERT INTO items (category_id, type, name, target_dir, link_url, link_target, access_password,
           share_code, share_enabled, share_expires_at, webhook_url, sort_order, is_visible, created_by, collaborators, watermark_enabled, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        items,
    )

    # 6. 多版本发布 + 真实原型 HTML 资源与 RP 底稿
    version_specs = [
        # item 1: 3 个版本，最新定稿在 10 小时前（显示虚线红点/新标签）
        (1, 'V2.8 需求基线', '- 初始化新版信息架构\n- 建立顶部双栏筛选条与项目导航', 0, 3, '周若曦', now - timedelta(days=18), False, [('覆盖业务模块', '12 个', '核心工作台全覆盖'), ('交互页面数', '34 页', '含全部异常态'), ('走查通过率', '94%', '研发一次对齐')]),
        (1, 'V2.9 交互评审版', '- 补全多语言切换与全局设置表单\n- 优化控制中心版本管理卡片信息密度', 0, 3, '周若曦', now - timedelta(days=7), True, [('评审已解决', '18 项', '交互细节精修'), ('新增表单态', '9 组', '含报错与禁用态'), ('响应适配', '1280px+', '无横向溢出')]),
        (1, 'V3.0 正式定稿版', '- 支持简体中文 / 繁體中文 / English 全局无缝切换\n- 优化全角色权限矩阵勾选与成员交接防呆提醒\n- 同步规范化页面批注角标与历史版本署名冻结', 1, 1, '林清远', now - timedelta(hours=10), True, [('版本就绪度', '100%', '可进入研发排期'), ('三语覆盖率', '1,595 词条', '全站点闭环生效'), ('待跟进批注', '2 条', '见页面右上角打点')]),
        # item 2: 2 个版本
        (2, 'V4.1 线上基线', '- 微信/支付宝/银联标准收银流程\n- 异常超时降级与手动补单弹窗', 0, 3, '周若曦', now - timedelta(days=14), False, [('日均模拟单', '8.4k', '主流端全通'), ('通道数', '6 路', '含企业网银'), ('支付耗时', '1.8s', '平均首屏渲染')]),
        (2, 'V4.2 分期支付流程', '- 新增企业对公转账与多期分期测算面板\n- 细化风控拦截二次验证弹窗与错误引导', 1, 3, '周若曦', now - timedelta(hours=18), True, [('新增步骤页', '7 页', '支持分期试算'), ('错误兜底态', '5 类', '无死胡同流程'), ('RP 底稿包', '已随版托管', '协作者与审阅可下')]),
        # item 3: 2 个版本
        (3, 'Beta 1.0', '- 移动端待办工作台与消息通知中心初稿', 0, 4, '陈星河', now - timedelta(days=10), False, [('端内模块', '5 块', '审批/日程/消息'), ('移动端断点', '375px', '单手触达友好'), ('卡片状态', '4 种', '待办/驳回/抄送')]),
        (3, 'RC 1.2 交互精修', '- 增加外发审阅免登录打点批注体验\n- 优化审批详情页附件预览抽屉', 1, 4, '陈星河', now - timedelta(days=2, hours=6), True, [('关键路径', '3 步直达', '大幅减少跳转'), ('批注协同', '已开启', '支持版本追溯'), ('用户满意度', '98%', '内测组评分')]),
        # item 5: 1 个版本
        (5, 'V1.0 MCP 协同版', '- AI 智能体读取项目/版本/页面批注规范\n- 支持分片流式上传 ZIP 与同名覆盖安全确认', 1, 2, '苏明哲', now - timedelta(days=5), True, [('MCP 工具数', '9 个', '读写与分片发版'), ('单分片上限', '1 MB', '自动完整性校验'), ('权限隔离', 'Scoped', '绑定账号范围')]),
    ]

    for item_id, vname, changelog, is_def, creator_id, author_name, dt, has_rp, cards in version_specs:
        sdir = f'p{item_id}/{uuid.uuid4().hex}'
        target = PROTO_DIR / sdir
        fsize = write_proto_html(target, vname, f'Author: {author_name}', 'Verified Demo', f'{vname} · 主视图', cards)
        rp_name = ''
        rp_size = 0
        if has_rp:
            rp_name = 'source.rp'
            rp_size = write_fake_rp(target, rp_name, 64)
        ts = fmt(dt)
        cur.execute(
            """INSERT INTO versions (item_id, version_name, entry_file, rp_file, changelog, is_default,
               created_by, author_name, storage_dir, file_size, rp_size, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (item_id, vname, 'index.html', rp_name, changelog, is_def, creator_id, author_name, sdir, fsize, rp_size, ts, ts),
        )

    # 查询插入后的版本 ID 映射
    ver_rows = {
        (row[1], row[2]): row[0]
        for row in cur.execute("SELECT id, item_id, version_name FROM versions").fetchall()
    }

    # 7. 页面级批注与协同回复 (待处理 + 已解决)
    v_work_30 = ver_rows[(1, 'V3.0 正式定稿版')]
    v_pay_42 = ver_rows[(2, 'V4.2 分期支付流程')]
    v_app_12 = ver_rows[(3, 'RC 1.2 交互精修')]

    annos = [
        (1, v_work_30, 'index.html', '概览工作台', '', '', '核心工作台 KPI 与状态列表，语言切换验证通过。', None, 5, '陆知行', '前端基础研发组', '英文模式下顶栏按钮紧凑度很好，建议确认下 1280px 宽度下“版本切换下拉”和“管理后台”按钮间距是否一致。', 0, '', None, fmt(now - timedelta(hours=5))),
        (1, v_work_30, 'pages/flow.html', '核心流程页', '', '', '成员离职工作交接与主管理员移交弹窗流程。', None, 2, '苏明哲', '研发效能组 · 架构师', '工作交接二次确认建议突出被交接项目数量，已核对目前提示文案清晰，先挂起等待视觉终审。', 0, '', None, fmt(now - timedelta(hours=3))),
        (1, v_work_30, 'pages/detail.html', '审批与明细', '', '', '控制中心系统设置页签：基础设置 / 成员注册 / 邮件找回。', None, 1, '林清远', '产品体验中心 · 总监', '已补充「系统语言」下拉配置并支持简体/繁体/英文实时持久化生效。', 1, '周若曦', fmt(now - timedelta(hours=2)), fmt(now - timedelta(hours=6))),
        (2, v_pay_42, 'pages/flow.html', '分期测算与提交', '', '', '分期手续费对比表格与对公转账账户复制。', None, 4, '陈星河', '商业化产品部', '当对公户名超过 24 个字符时表格出现换行，建议调整该列最小宽度并加单行省略号提示。', 0, '', None, fmt(now - timedelta(hours=12))),
        (2, v_pay_42, 'index.html', '收银台首页', '', '', '多通道支付选择与超时兜底提示条。', None, 5, '陆知行', '前端基础研发组', '已与后端确认超时轮询为 3 秒一次，状态映射已完成对齐。', 1, '周若曦', fmt(now - timedelta(hours=8)), fmt(now - timedelta(days=1))),
        (3, v_app_12, 'index.html', 'App 首页工作台', '', '', '待我审批卡片与快速通过滑块。', None, 1, '林清远', '产品体验中心 · 总监', '“快捷审批”手势与右上角批注入口图标位置太近，外链访客预览时可能误触，建议增加 12px 间距。', 0, '', None, fmt(now - timedelta(days=1, hours=2))),
    ]
    cur.executemany(
        """INSERT INTO annotations (item_id, ver_id, page_path, page_title, version_revision, reviewed_revision,
           page_snapshot, source_annotation_id, user_id, author_name, author_dept, content, status, resolved_by, resolved_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        annos,
    )

    replies = [
        (1, 3, '周若曦', '核心交易设计组', '收到！刚已在 1280×800 与 1440×900 两个视口下走查了英文字段宽度，稍后附上复核结论。', fmt(now - timedelta(hours=4))),
        (1, 1, '林清远', '产品体验中心 · 总监', '确认保持 btn-sm 28px 离散尺寸规范即可，无需额外改样式。', fmt(now - timedelta(hours=2))),
        (3, 3, '周若曦', '核心交易设计组', '已完成三语语言包对接，切换立即生效。', fmt(now - timedelta(hours=2))),
        (4, 3, '周若曦', '核心交易设计组', '收到反馈，下一小版把对公户名加 tooltip 与 text-overflow: ellipsis。', fmt(now - timedelta(hours=9))),
    ]
    cur.executemany(
        """INSERT INTO annotation_replies (annotation_id, user_id, author_name, author_dept, content, created_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        replies,
    )

    # 8. 专属外发分享短链
    share_codes = [
        ('work3rev', 1, v_work_30, 'V3.0 研发内测评审专链', '', fmt(now + timedelta(days=30)), 42, 1, 1, fmt(now - timedelta(hours=9))),
        ('custvip8', 1, v_work_30, '外部客户高层演示 (带口令)', '8866', fmt(now + timedelta(days=7)), 15, 1, 1, fmt(now - timedelta(days=2))),
        ('paydemo4', 2, v_pay_42, '收银台分期流程专链', '', None, 28, 3, 1, fmt(now - timedelta(days=4))),
    ]
    cur.executemany(
        """INSERT INTO share_codes (code, item_id, ver_id, label, access_password, expires_at, view_count, created_by, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        share_codes,
    )

    # 9. 登录审计日志与访问趋势数据 (近 14 天多角色自然曲线，让大盘图表饱满直观)
    login_rows = [
        ('owner@protoloft.demo', '192.168.10.21', 'Mozilla/5.0 (Macintosh)', 'Chrome (macOS)', 1, '登录成功 (记住30天)', fmt(now - timedelta(hours=1))),
        ('editor1@protoloft.demo', '192.168.10.34', 'Mozilla/5.0 (Macintosh)', 'Chrome (macOS)', 1, '登录成功 (记住30天)', fmt(now - timedelta(hours=3))),
        ('viewer@protoloft.demo', '192.168.10.58', 'Mozilla/5.0 (Windows NT 10.0)', 'Edge (Windows)', 1, '登录成功 (单次会话)', fmt(now - timedelta(hours=5))),
        ('admin@protoloft.demo', '192.168.10.19', 'Mozilla/5.0 (Macintosh)', 'Safari (macOS)', 1, '登录成功 (记住30天)', fmt(now - timedelta(days=1, hours=2))),
        ('pending@protoloft.demo', '192.168.10.99', 'Mozilla/5.0 (Windows NT 10.0)', 'Chrome (Windows)', 0, '账号审核中', fmt(now - timedelta(hours=4))),
    ]
    cur.executemany(
        "INSERT INTO login_logs (username, ip, user_agent, device, status, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        login_rows,
    )

    access_rows = []
    demo_projects = [
        (1, '立象云工作台 3.0 改版', 'V3.0 正式定稿版', 5),
        (2, '多端统一收银台 v4.2', 'V4.2 分期支付流程', 3),
        (3, '企业服务 App · 首页与审批流', 'RC 1.2 交互精修', 2),
        (5, 'AI 原型需求评审助手 · MCP 面板', 'V1.0 MCP 协同版', 2),
    ]
    for day_offset in range(13, -1, -1):
        day_base = now - timedelta(days=day_offset)
        # 每日按角色写入适度访问量形成可观的堆叠曲线
        role_weights = [
            ('admin', 'workspace', 2 + (day_offset % 3)),
            ('editor', 'workspace', 4 + ((13 - day_offset) % 4)),
            ('viewer', 'workspace', 3 + (day_offset % 4)),
            ('share', 'share', 5 + ((day_offset * 3) % 6)),
        ]
        for role, atype, count in role_weights:
            for k in range(count):
                proj_id, proj_name, ver_name, _ = demo_projects[(day_offset + k) % len(demo_projects)]
                ts = fmt(day_base.replace(hour=(9 + (k * 2) % 10), minute=(k * 13) % 60, second=0))
                access_rows.append((
                    proj_id, proj_name, ver_name, atype, role,
                    f'192.168.10.{20 + k}', 'Mozilla/5.0 (Macintosh)', 'Chrome (macOS)', ts
                ))
    cur.executemany(
        """INSERT INTO access_logs (item_id, item_name, version_name, access_type, role, ip, user_agent, device, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        access_rows,
    )

    conn.commit()
    conn.close()

    # 使用官方 PrototypeContext/Collaboration 计算批注原生 version_revision 与 page_snapshot
    sync_code = """
    require 'includes/config.php';
    require 'includes/db.php';
    require 'includes/prototype_context.php';
    require 'includes/collaboration.php';
    $db = DB::getInstance();
    $rows = $db->query('SELECT id, ver_id, page_path FROM annotations')->fetchAll();
    foreach ($rows as $r) {
        $vStmt = $db->prepare('SELECT * FROM versions WHERE id = ?');
        $vStmt->execute([(int)$r['ver_id']]);
        $ver = $vStmt->fetch();
        $vStmt->closeCursor();
        if ($ver) {
            $rev = PrototypeContext::revision($ver);
            $snap = Collaboration::snapshot($ver, $r['page_path']);
            $db->prepare('UPDATE annotations SET version_revision = ?, reviewed_revision = ?, page_snapshot = ? WHERE id = ?')
               ->execute([$rev, $rev, $snap, (int)$r['id']]);
        }
    }
    echo 'REV_SYNC_OK';
    """
    subprocess.check_call([php_bin, '-r', sync_code], cwd=str(ROOT))

    print(json.dumps({
        'status': 'ok',
        'db_path': str(DB_PATH),
        'default_password': DEFAULT_PASSWORD,
        'accounts': [
            'owner@protoloft.demo (主管理员 / Owner)',
            'admin@protoloft.demo (管理员 / Admin)',
            'editor1@protoloft.demo (协作者 / Editor)',
            'editor2@protoloft.demo (协作者 / Editor)',
            'viewer@protoloft.demo (审阅人 / Viewer)',
            'pending@protoloft.demo (待审批 / Pending)',
        ],
        'counts': {
            'users': len(users_data),
            'categories': len(cats),
            'items': len(items),
            'versions': len(version_specs),
            'annotations': len(annos),
            'share_codes': len(share_codes),
            'access_logs': len(access_rows),
        }
    }, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description='灌入立象原型 v3.2.0 本地演示数据')
    parser.add_argument('--php', default=shutil.which('php') or '/Users/yyy/.local/bin/php')
    args = parser.parse_args()
    if not Path(args.php).is_file():
        print(f'ERROR: PHP binary not found: {args.php}', file=sys.stderr)
        sys.exit(1)
    seed(args.php)


if __name__ == '__main__':
    main()
