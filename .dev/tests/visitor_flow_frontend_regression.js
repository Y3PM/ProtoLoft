/* Verify visitor registration flow logic and DOM contracts in static sources */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '../..');
const indexPhp = fs.readFileSync(path.join(root, 'index.php'), 'utf8');
const loginModalPhp = fs.readFileSync(path.join(root, 'includes/login_modal.php'), 'utf8');
const authPhp = fs.readFileSync(path.join(root, 'includes/actions/auth.php'), 'utf8');

let passed = 0;
const check = (name, condition) => {
    assert(condition, name);
    passed++;
    console.log('PASS ' + name);
};

// 1. 独立登录页静态契约
check('独立登录页存在顶部成功通知条 adminLoginSuccessTip', indexPhp.includes('id="adminLoginSuccessTip"'));
check('独立登录页输入框存在域名徽标 adminDomainBadge', indexPhp.includes('id="adminDomainBadge"'));
check('独立登录页访客申请表单存在域名徽标 regLockDomainBadge', indexPhp.includes('id="regLockDomainBadge"'));
check('submitVisitorReg 成功后平滑调用 toggleAuthPane("login")', indexPhp.includes("toggleAuthPane('login')"));
check('submitVisitorReg 自动回填邮箱并更新域名徽标', indexPhp.includes('loginUserInput.value = rawEmailVal') && indexPhp.includes("handleLockEmailInput(loginUserInput, 'adminDomainBadge')"));
check('submitVisitorReg 重置表单后主动恢复注册徽标', indexPhp.includes("regBadge.style.display = 'inline-block'"));
check('submitVisitorReg 移除多余的 DOM value 篡改', !/if\s*\(\s*emailInput\s*&&\s*email\s*\)\s*\{\s*emailInput\.value\s*=\s*email;\s*var\s+badge\s*=\s*document\.getElementById\('regLockDomainBadge'\);/.test(indexPhp));

// 2. 工作台通用弹窗静态契约
check('登录弹窗存在顶部成功通知条 loginSuccessNotice', loginModalPhp.includes('id="loginSuccessNotice"'));
check('登录弹窗登录表单存在域名徽标 loginDomainBadge', loginModalPhp.includes('id="loginDomainBadge"'));
check('登录弹窗访客申请表单存在域名徽标 regDomainBadge', loginModalPhp.includes('id="regDomainBadge"'));
check('handleDoRegister 成功后平滑调用 toggleLoginRegPane("login")', loginModalPhp.includes("toggleLoginRegPane('login')"));
check('handleDoRegister 自动回填邮箱并更新域名徽标', loginModalPhp.includes('loginUserInput.value = rawEmailVal') && loginModalPhp.includes("handleEmailInputWithDomain(loginUserInput, 'loginDomainBadge')"));
check('handleDoRegister 重置表单后主动恢复注册徽标', loginModalPhp.includes("regBadge.style.display = 'inline-block'"));
check('handleDoRegister 移除多余的 DOM value 篡改', !/if\s*\(\s*emailInput\s*&&\s*email\s*\)\s*\{\s*emailInput\.value\s*=\s*email;\s*var\s+badge\s*=\s*document\.getElementById\('regDomainBadge'\);/.test(loginModalPhp));

// 3. 后端文案统一契约
check('auth.php register_visitor 成功文案明确自明', authPhp.includes("jsonResponse(true, ['id' => $newId], '申请已提交，等待管理员审核后即可登录');"));

console.log(JSON.stringify({ passed, scope: 'visitor registration flow contract validation' }));
