#!/usr/bin/env python3
"""立象原型 (ProtoLoft) - 全量自动化测试统一执行与报告生成器
All-in-One Comprehensive Test Runner & Quality Gate
一键调度并串联执行全站所有测试套件，生成结构化质量验收大盘。

使用方法:
    python3 -B .dev/tests/run_all_tests.py [--php /path/to/php]
"""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
TESTS_DIR = ROOT / '.dev' / 'tests'

# 终端 ANSI 样式令牌
RESET = "\033[0m"
BOLD = "\033[1m"
GREEN = "\033[32m"
RED = "\033[31m"
YELLOW = "\033[33m"
CYAN = "\033[36m"
GRAY = "\033[90m"

SUITES = [
    {
        "id": "version_modal_frontend", "name": "版本卡片、筛选分页与操作权限",
        "cmd": ["node", str(TESTS_DIR / "version_modal_frontend_regression.js")], "needs_php": False, "type": "node"
    },
    {
        "id": "profile_mcp_frontend", "name": "个人设置与 MCP 项目范围交互",
        "cmd": ["node", str(TESTS_DIR / "profile_mcp_frontend_regression.js")], "needs_php": False, "type": "node"
    },
    {
        "id": "preferences_frontend", "name": "系统设置与角色权限自动保存队列",
        "cmd": ["node", str(TESTS_DIR / "preferences_frontend_regression.js")], "needs_php": False, "type": "node"
    },
    {
        "id": "copy_consistency_frontend", "name": "条件字段、评审图表与共享交互",
        "cmd": ["node", str(TESTS_DIR / "copy_consistency_frontend.js")], "needs_php": False, "type": "node"
    },
    {
        "id": "interaction_no_reload", "name": "控制中心刷新与外链操作守卫",
        "cmd": ["node", str(TESTS_DIR / "interaction_no_reload_regression.js")], "needs_php": False, "type": "node"
    },
    {
        "id": "folder_changelog", "name": "文件夹打包算法样例与日志格式",
        "cmd": ["node", str(TESTS_DIR / "folder_upload_and_changelog_regression.js")], "needs_php": False, "type": "node"
    },
    {
        "id": "comprehensive_e2e",
        "name": "全景系统 E2E 全生命周期端到端回归",
        "cmd": ["python3", "-B", str(TESTS_DIR / "comprehensive_e2e_regression.py")],
        "needs_php": True,
        "type": "python"
    },
    {
        "id": "security_p1",
        "name": "一期核心安全、权限隔离与发版回归",
        "cmd": ["python3", "-B", str(TESTS_DIR / "security_regression.py")],
        "needs_php": True,
        "type": "python"
    },
    {
        "id": "security_p2",
        "name": "二期进阶隔离、移交所有权与会话治理",
        "cmd": ["python3", "-B", str(TESTS_DIR / "security_round2_regression.py")],
        "needs_php": True,
        "type": "python"
    },
    {
        "id": "mcp_collaboration",
        "name": "MCP 智能体协议与协同发版全链路",
        "cmd": ["python3", "-B", str(TESTS_DIR / "mcp_collaboration_regression.py")],
        "needs_php": True,
        "type": "python"
    },
    {
        "id": "dashboard",
        "name": "控制大盘指标与统计真实 HTTP 渲染",
        "cmd": ["python3", "-B", str(TESTS_DIR / "dashboard_regression.py")],
        "needs_php": True,
        "type": "python"
    },
    {
        "id": "brand_isolation",
        "name": "品牌资产固化与企业联合边界防侵蚀",
        "cmd": ["python3", "-B", str(TESTS_DIR / "brand_isolation_test.py")],
        "needs_php": True,
        "type": "python"
    },
    {
        "id": "frontend_mock",
        "name": "前端模拟 DOM/网络互斥与防双击状态机",
        "cmd": ["node", str(TESTS_DIR / "security_frontend_regression.js")],
        "needs_php": False,
        "type": "node"
    },
    {
        "id": "rp_management",
        "name": "版本 RP 源文件底稿补传、更换、流式下载与移除全链路",
        "cmd": ["python3", "-B", str(TESTS_DIR / "rp_management_regression.py")],
        "needs_php": True,
        "type": "python"
    },
    {
        "id": "guest_permissions",
        "name": "访客下载 RP 与页面批注全链路权限",
        "cmd": ["python3", "-B", str(TESTS_DIR / "guest_permissions_regression.py")],
        "needs_php": True,
        "type": "python"
    },
    {
        "id": "role_permissions",
        "name": "多角色控制 (RBAC) 与权限矩阵全链路隔离",
        "cmd": ["python3", "-B", str(TESTS_DIR / "role_permissions_regression.py")],
        "needs_php": True,
        "type": "python"
    },
    {
        "id": "link_annotation",
        "name": "外链批注协同全链路与上版未决隔离",
        "cmd": ["python3", "-B", str(TESTS_DIR / "link_annotation_regression.py")],
        "needs_php": True,
        "type": "python"
    },
    {
        "id": "review_fixes_frontend",
        "name": "审查修复前端注入与快照状态机回归",
        "cmd": ["node", str(TESTS_DIR / "review_fixes_frontend_regression.js")],
        "needs_php": False,
        "type": "node"
    },
    {
        "id": "review_fixes_backend",
        "name": "审查修复批注集中鉴权与衍生隔离全链路",
        "cmd": ["python3", "-B", str(TESTS_DIR / "review_20261107_fixes_regression.py")],
        "needs_php": True,
        "type": "python"
    },
    {
        "id": "visitor_flow_frontend",
        "name": "访客注册成功动线、域名徽标稳态与回填契约",
        "cmd": ["node", str(TESTS_DIR / "visitor_flow_frontend_regression.js")],
        "needs_php": False,
        "type": "node"
    },
    {
        "id": "webhook_keyword",
        "name": "Webhook 安全关键词与自愈诊断全平台覆盖",
        "cmd": ["python3", "-B", str(TESTS_DIR / "webhook_keyword_regression.py")],
        "needs_php": False,
        "type": "python"
    },
    {
        "id": "notification_copy",
        "name": "项目通知标题、正文、来源与多角色流程",
        "cmd": ["python3", "-B", str(TESTS_DIR / "notification_copy_regression.py")],
        "needs_php": True,
        "type": "python"
    },
    {
        "id": "webhook_split_notify",
        "name": "发版群通知左右分列独立控制与日志联动",
        "cmd": ["python3", "-B", str(TESTS_DIR / "webhook_split_notify_regression.py")],
        "needs_php": True,
        "type": "python"
    },
    {
        "id": "password_reset_smtp",
        "name": "登录布局、邮件服务配置与邮箱找回密码全链路",
        "cmd": ["python3", "-B", str(TESTS_DIR / "password_reset_smtp_regression.py")],
        "needs_php": True,
        "type": "python"
    }
]


def detect_php(custom_path=None):
    """自动嗅探可用的 PHP 运行时"""
    candidates = []
    if custom_path:
        candidates.append(Path(custom_path))
    candidates.append(Path('/tmp/jinshi-php-common/php'))
    which_php = shutil.which('php')
    if which_php:
        candidates.append(Path(which_php))

    for p in candidates:
        if p.is_file():
            try:
                out = subprocess.check_output([str(p), '-v'], stderr=subprocess.DEVNULL).decode('utf-8')
                v_line = out.splitlines()[0] if out.splitlines() else 'Unknown'
                return str(p), v_line
            except Exception:
                continue
    return None, None


def main():
    parser = argparse.ArgumentParser(description="立象原型全量自动化测试统一执行器")
    parser.add_argument("--php", default=None, help="PHP 可执行文件路径")
    parser.add_argument("--suite", default=None, help="仅运行指定 ID 的套件")
    args = parser.parse_args()

    php_path, php_ver = detect_php(args.php)

    print(f"\n{BOLD}{CYAN}======================================================================{RESET}")
    print(f"{BOLD}{CYAN}   立象原型 · ProtoLoft · 全量自动化回归质量大盘 (Test Runner)       {RESET}")
    print(f"{GRAY}   立象以尽意 · 披图而同心（让想法可见，让协作清晰。）{RESET}")
    print(f"{BOLD}{CYAN}======================================================================{RESET}")
    print(f"[*] 执行根目录: {ROOT}")
    print(f"[*] PHP 运行时: {php_path or '未找到'} {GRAY}({php_ver or 'N/A'}){RESET}")
    print(f"[*] Node.js   : {shutil.which('node') or '未找到'}")
    print(f"{CYAN}----------------------------------------------------------------------{RESET}\n")

    if not php_path:
        print(f"{RED}[x] 错误: 未能探测到可用的 PHP 7.0+ 运行时，请使用 --php 指定。{RESET}")
        sys.exit(1)

    suite_results = []
    total_passed_asserts = 0
    all_success = True
    start_total_time = time.time()

    for idx, suite in enumerate(SUITES, start=1):
        if args.suite and suite["id"] != args.suite:
            continue

        cmd = list(suite["cmd"])
        if suite["needs_php"]:
            cmd.extend(["--php", php_path])

        print(f"[{idx}/{len(SUITES)}] 正在执行: {BOLD}{suite['name']}{RESET} ({suite['id']})...")
        t0 = time.time()
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=str(ROOT))
        stdout, stderr = proc.communicate()
        elapsed = time.time() - t0

        is_ok = (proc.returncode == 0)
        assert_count = 0

        # 解析通过断言数量
        for line in stdout.splitlines():
            line_str = line.strip()
            if line_str.startswith('PASS ') or line_str.startswith('  ✓ PASS:'):
                assert_count += 1
            elif 'ALL 6 BRAND & BOUNDARY SUITES PASSED' in line_str:
                assert_count += 6
            elif line_str.startswith('{"passed":') or line_str.startswith('{"status": "success", "passed_checks":'):
                try:
                    data = json.loads(line_str)
                    c = data.get('passed') or data.get('passed_checks')
                    if c and isinstance(c, int):
                        assert_count = max(assert_count, c)
                except Exception:
                    pass

        total_passed_asserts += assert_count
        if not is_ok:
            all_success = False

        status_str = f"{GREEN}✓ PASS{RESET}" if is_ok else f"{RED}✗ FAIL (code {proc.returncode}){RESET}"
        print(f"    状态: {status_str} | 断言: {BOLD}{assert_count}{RESET} 项 | 耗时: {elapsed:.2f}s\n")

        suite_results.append({
            "id": suite["id"],
            "name": suite["name"],
            "ok": is_ok,
            "assert_count": assert_count,
            "elapsed": elapsed,
            "stderr": stderr,
            "stdout": stdout
        })

    total_elapsed = time.time() - start_total_time

    # 打印最终汇总仪表盘
    print(f"\n{BOLD}{CYAN}======================================================================{RESET}")
    print(f"{BOLD}                        全量测试报告汇总仪表盘                          {RESET}")
    print(f"{BOLD}{CYAN}======================================================================{RESET}")
    print(f"{'套件名称':<36} {'执行结果':<12} {'通过断言':<10} {'耗时':<8}")
    print(f"{GRAY}----------------------------------------------------------------------{RESET}")

    for res in suite_results:
        res_tag = f"{GREEN}PASS{RESET}" if res["ok"] else f"{RED}FAIL{RESET}"
        print(f"{res['name']:<32} {res_tag:<18} {res['assert_count']:<10} {res['elapsed']:.2f}s")

    print(f"{GRAY}----------------------------------------------------------------------{RESET}")
    total_tag = f"{BOLD}{GREEN}ALL PASSED (100%){RESET}" if all_success else f"{BOLD}{RED}SOME FAILED{RESET}"
    print(f"{BOLD}总计结果: {total_tag} | 可识别断言: {BOLD}{total_passed_asserts}{RESET} 项 | 总耗时: {total_elapsed:.2f}s")
    print(f"{BOLD}{CYAN}======================================================================{RESET}\n")

    if not all_success:
        print(f"\n{RED}[!] 失败套件错误输出截取:{RESET}")
        for res in suite_results:
            if not res["ok"]:
                print(f"\n--- {res['name']} ({res['id']}) ---")
                print(res["stderr"] or res["stdout"][-800:])
        sys.exit(1)
    else:
        print(f"{GREEN}已配置的测试套件均通过；浏览器、部署环境及用户验收另行记录。{RESET}\n")
        sys.exit(0)


if __name__ == '__main__':
    main()
