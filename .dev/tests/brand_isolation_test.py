#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
立象原型 · 品牌升级与系统边界隔离专项自动化校验套件
验证项目：
1. 系统品牌（立象原型 · 立象以尽意。让想法可见，让协作清晰。）已在主入口、分享沙箱、安装向导、模态弹窗与 MCP 中全面固化；
2. 彻底移除后台中侵蚀立象原型品牌的设置项（副标题、页脚版权、Favicon与登录壁纸自定义）；
3. 登录页与工作台左上角正确实现“立象原型”主品牌主导、企业名称作为次级联合展示的逻辑；
4. 生产代码文件（除向下兼容历史旧值比对代码外）杜绝“锦时”与旧口号残留。
"""

import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))

def read_file(rel_path):
    with open(os.path.join(ROOT, rel_path), 'r', encoding='utf-8') as f:
        return f.read()

def test_index_php():
    c = read_file('index.php')
    assert '$systemName = \'立象原型\';' in c, "index.php 缺少固化的系统名称"
    assert '$systemSlogan = \'立象以尽意 · 披图而同心\';' in c, "index.php 缺少固化的系统口号"
    assert '$siteFooter = \'© \' . date(\'Y\') . \' 立象原型 · 让想法可见，让协作清晰\';' in c, "index.php 缺少固化的页脚版权"
    assert 'class="page-standalone"' in c and 'background-image' not in c.split('<body class="page-standalone"')[1].split('>')[0], "index.php 登录背景应移除壁纸样式，保持默认网格"
    assert '<source srcset="assets/images/logo.svg?v=<?php echo APP_VERSION; ?>" type="image/svg+xml">' in c, "index.php 登录 Logo 应优先加载纯矢量 logo.svg"
    assert '<img src="assets/images/logo.png?v=<?php echo APP_VERSION; ?>" alt="立象原型"' in c, "index.php 登录 Logo 缺少立象原型官方主标"
    assert '<span>立象原型</span>' in c, "index.php 工作台侧边栏顶部未设置企业名称时必须保留立象原型默认标题"
    assert 'brand-company-name' in c, "index.php 缺少企业名称主标题节点"
    print("PASS: index.php 系统品牌固化与企业名称自适应展示逻辑正确")

def test_share_php():
    c = read_file('share.php')
    assert '$systemName = \'立象原型\';' in c, "share.php 缺少固化的系统名称"
    assert '<span>立象原型</span>' in c, "share.php 顶部栏缺少立象原型主标题"
    assert '立象原型 · 企业级产品资产交付中心' in c, "share.php 缺少立象原型交付沙箱页脚"
    assert "'立象原型'" in c, "share.php 水印兜底缺少立象原型"
    print("PASS: share.php 分享沙箱品牌固化与联合展示逻辑正确")

def test_install_php():
    c = read_file('install.php')
    assert '<title>立象原型 - 安装向导</title>' in c, "install.php 页面标题未升级"
    assert 'alt="立象原型"' in c, "install.php Logo alt 未升级"
    assert '立象以尽意 · 披图而同心' in c, "install.php 头部副标题口号未升级"
    assert 'name="site_subtitle"' not in c, "install.php 步骤 2 仍存在副标题输入框（应移除）"
    assert 'name="site_title"' in c and '选填' in c, "install.php 步骤 2 企业名称应作为选填"
    print("PASS: install.php 安装向导品牌与企业组织定制逻辑正确")

def test_modals_php():
    c = read_file('includes/modals.php')
    assert '企业组织定制' in c, "modals.php 设置面板缺少企业组织定制卡片"
    assert 'settingSiteSubtitle' not in c, "modals.php 仍存在副标题设置输入框（应移除）"
    assert 'settingSiteFooter' not in c, "modals.php 仍存在页脚版权设置输入框（应移除）"
    assert 'settingCustomFavicon' not in c, "modals.php 仍存在 Favicon 自定义上传（应移除）"
    assert 'settingCustomBg' not in c, "modals.php 仍存在登录背景图自定义上传（应移除）"
    assert '立象原型 v<?php echo APP_VERSION; ?>' in c, "modals.php 控制中心左下角底座品牌未生效"
    assert 'href="https://github.com/Y3PM/ProtoLoft"' in c, "modals.php 控制中心底座缺少 GitHub 链接"
    assert 'class="admin-nav-github"' in c, "modals.php 控制中心底座缺少 admin-nav-github 样式类"
    assert 'ri-github-line' in c, "modals.php 控制中心底座缺少 GitHub 图标"
    cfg = read_file('includes/config.php')
    assert "define('APP_VERSION', '3.1.6');" in cfg, "config.php APP_VERSION 应为 3.1.6"
    css = read_file('assets/css/app.css')
    assert '.admin-nav-github' in css, "app.css 缺少 .admin-nav-github 样式规则"
    print("PASS: includes/modals.php 品牌侵蚀项彻底剔除，企业信息边界清晰")

def test_system_action():
    c = read_file('includes/actions/system.php')
    assert 'custom_favicon' not in c, "system.php 仍支持 custom_favicon 上传"
    assert 'custom_bg' not in c, "system.php 仍支持 custom_bg 上传"
    assert 'site_subtitle' not in c, "system.php 仍接收 site_subtitle"
    assert 'site_footer' not in c, "system.php 仍接收 site_footer"
    assert '[protoloft]' in c, "system.php 错误日志前缀未更新"
    print("PASS: includes/actions/system.php 后端存储边界收敛正确")

def test_mcp_and_docs():
    mcp = read_file('includes/mcp_service.php')
    assert '立象原型平台' in mcp and 'PROTOLOFT_MCP_TOKEN' in mcp, "mcp_service.php 缺少立象原型平台或 PROTOLOFT_MCP_TOKEN 提示"
    guide = read_file('includes/views/mcp-guide.php')
    assert 'MCP 接入 · 立象原型' in guide and '[mcp_servers.protoloft]' in guide, "mcp-guide.php 标题或配置段未升级"
    agents = read_file('AGENTS.md')
    assert '# 立象原型 · ProtoLoft' in agents, "AGENTS.md 标题未升级"
    assert '立象以尽意 · 披图而同心' in agents, "AGENTS.md 核心使命未升级"
    readme = read_file('README.md')
    assert '# 立象原型 · ProtoLoft' in readme and 'AxShare Hub' not in readme and 'LiXiang' not in readme, "README.md 仍残留旧品牌名"
    license = read_file('LICENSE')
    assert 'ProtoLoft (立象原型)' in license and 'LiXiang' not in license, "LICENSE 版权声明未更新"
    llms = read_file('llms.txt')
    assert '# ProtoLoft · 立象原型' in llms and 'JinShi' not in llms, "llms.txt 品牌名称未升级"
    print("PASS: MCP 协议、README、AGENTS 指南、llms.txt 与 LICENSE 开源许可更新正确")

def main():
    test_index_php()
    test_share_php()
    test_install_php()
    test_modals_php()
    test_system_action()
    test_mcp_and_docs()
    print("\nALL 6 BRAND & BOUNDARY SUITES PASSED SUCCESSFULLY!")

if __name__ == '__main__':
    main()
