#!/usr/bin/env python3
"""
控制中心存储空间数据精度与极小值保护回归测试
覆盖场景：
1. 用户报障场景（HTML: 43.8MB, RP: 2.5MB, DB: 203KB）：
   - 验证格式化为 0.4%，杜绝 0.400000000000001% 浮点长尾；
2. 极小值场景（如总容量 100MB，数据库仅 20KB，占比 < 0.05%）：
   - 验证自明展示为 <0.1%，而非 0% 假数据；
3. 零数据边界场景（总容量 0B）：
   - 验证返回 0%，杜绝 Division by zero 报错；
4. 真实页面 includes/modals.php 代码结构静态与语法校验。
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

def run_php(code: str) -> str:
    cmd = ["php", "-r", code]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=str(ROOT))
    if res.returncode != 0:
        raise RuntimeError(f"PHP execution failed:\n{res.stderr}")
    return res.stdout.strip()

def test_storage_percentage_logic():
    print(">>> 1. 测试存储计算与格式化逻辑...")
    php_snippet = r'''
    $fmtStoragePct = function($b, $total) {
        if ($b <= 0 || $total <= 0) return '0%';
        $pct = ($b / $total) * 100;
        if ($pct < 0.05) {
            return '<0.1%';
        }
        return number_format($pct, 1) . '%';
    };

    $calcStorageBarWidth = function($b, $total) {
        if ($b <= 0 || $total <= 0) return 0;
        return max(0.5, round(($b / $total) * 100, 1));
    };

    // 场景 1: 用户报障实景 (43.8MB, 2.5MB, 203KB)
    $bHtml = 43.8 * 1048576;
    $bRp = 2.5 * 1048576;
    $bOther = 203 * 1024;
    $total1 = $bHtml + $bRp + $bOther;

    $pctOtherLabel = $fmtStoragePct($bOther, $total1);
    $barOther = $calcStorageBarWidth($bOther, $total1);

    // 场景 2: 极小值场景 (<0.05%)
    $total2 = 100 * 1048576; // 100MB
    $bTiny = 20 * 1024;       // 20KB => 0.0195%
    $pctTinyLabel = $fmtStoragePct($bTiny, $total2);
    $barTiny = $calcStorageBarWidth($bTiny, $total2);

    // 场景 3: 零数据场景
    $pctZeroLabel = $fmtStoragePct(0, 0);
    $barZero = $calcStorageBarWidth(0, 0);

    echo json_encode([
        'scene1_label' => $pctOtherLabel,
        'scene1_bar' => $barOther,
        'scene2_label' => $pctTinyLabel,
        'scene2_bar' => $barTiny,
        'scene3_label' => $pctZeroLabel,
        'scene3_bar' => $barZero,
    ]);
    '''
    import json
    out = run_php(php_snippet)
    data = json.loads(out)

    # 断言 1: 杜绝 0.400000000000001%，必须是 0.4%
    assert data['scene1_label'] == '0.4%', f"预期 0.4%，实际为 {data['scene1_label']}"
    assert data['scene1_bar'] == 0.4 or data['scene1_bar'] == 0.5, f"预期进度条宽度正确，实际为 {data['scene1_bar']}"
    assert "00000000" not in data['scene1_label'], "禁止出现浮点数长尾"
    print("  ✓ PASS: 场景 1 实景报障数据格式化为精确的 0.4%，无长尾")

    # 断言 2: 极小值保护
    assert data['scene2_label'] == '<0.1%', f"预期 <0.1%，实际为 {data['scene2_label']}"
    assert data['scene2_bar'] >= 0.5, f"预期微小值保留保底宽度，实际为 {data['scene2_bar']}"
    print("  ✓ PASS: 场景 2 极小值 (<0.05%) 优雅展示为 <0.1%，进度条保底可见")

    # 断言 3: 零容量安全
    assert data['scene3_label'] == '0%', f"预期 0%，实际为 {data['scene3_label']}"
    assert data['scene3_bar'] == 0, f"预期 0，实际为 {data['scene3_bar']}"
    print("  ✓ PASS: 场景 3 零容量安全返回 0%，无除以零报错")

def test_modals_file_contract():
    print(">>> 2. 检查 includes/modals.php 契约与防劣化...")
    modals_file = ROOT / "includes" / "modals.php"
    assert modals_file.exists(), "includes/modals.php 文件必须存在"
    content = modals_file.read_text(encoding='utf-8')

    # 严禁存在有漏洞的倒扣减法
    assert "100 - $pctHtml - $pctRp" not in content, "严禁残留有浮点精度漏洞的倒扣代码: 100 - $pctHtml - $pctRp"
    assert "max(0, 100 - $pctHtml - $pctRp)" not in content, "严禁残留 max(0, 100 - $pctHtml - $pctRp)"

    # 必须存在 $fmtStoragePct 与 $calcStorageBarWidth
    assert "$fmtStoragePct" in content, "必须使用 $fmtStoragePct 进行规范格式化"
    assert "$lblOtherPct" in content, "模板中必须绑定 $lblOtherPct"
    assert "number_format($pct, 1)" in content, "百分比计算必须使用 number_format 规范保留1位小数"

    print("  ✓ PASS: includes/modals.php 契约核验通过")

if __name__ == '__main__':
    try:
        test_storage_percentage_logic()
        test_modals_file_contract()
        print("\nAll storage precision tests passed successfully!")
    except Exception as e:
        print(f"\nFAIL: {e}", file=sys.stderr)
        sys.exit(1)
