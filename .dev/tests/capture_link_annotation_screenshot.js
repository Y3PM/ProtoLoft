const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const tmpDir = '/tmp/chrome-link-anno-profile';
if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });

const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--user-data-dir=' + tmpDir,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,900'
]);

function send(ws, id, method, params = {}) {
    return new Promise((resolve, reject) => {
        const handler = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.id === id) {
                ws.removeEventListener('message', handler);
                if (msg.error) reject(msg.error);
                else resolve(msg.result);
            }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

(async () => {
    await new Promise(r => setTimeout(r, 1200));
    http.get('http://127.0.0.1:9222/json', async (res) => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', async () => {
            const targets = JSON.parse(raw);
            const pageTarget = targets.find(t => t.type === 'page');
            const wsUrl = pageTarget.webSocketDebuggerUrl;
            console.log('Connecting to Chrome CDP:', wsUrl);
            const ws = new WebSocket(wsUrl);

            ws.addEventListener('open', async () => {
                let msgId = 1;
                await send(ws, msgId++, 'Page.enable');
                await send(ws, msgId++, 'Runtime.enable');
                await send(ws, msgId++, 'DOM.enable');

                // 1. 访问首页登录界面
                console.log('Navigating to login page...');
                await send(ws, msgId++, 'Page.navigate', { url: 'http://127.0.0.1:8765/index.php' });
                await new Promise(r => setTimeout(r, 1000));

                // 2. 模拟表单输入并登录超管
                console.log('Submitting login credentials...');
                await send(ws, msgId++, 'Runtime.evaluate', {
                    expression: `
                    (function() {
                        var u = document.getElementById('adminLoginUser');
                        var p = document.getElementById('adminLoginPwd');
                        if (u && p) {
                            u.value = 'admin';
                            p.value = 'admin123456';
                            var btn = document.getElementById('btnAdminLogin');
                            if (btn) btn.click();
                        }
                    })()
                    `
                });
                await new Promise(r => setTimeout(r, 1500));

                // 3. 此时已登录进入工作台，选中外链项目 3
                console.log('Selecting link item 3 and opening annotation drawer...');
                await send(ws, msgId++, 'Runtime.evaluate', {
                    expression: `
                    (function() {
                        var node = document.getElementById('item-node-3');
                        if (node && typeof selectItem === 'function') {
                            selectItem(3, node, null, false);
                        }
                        setTimeout(function() {
                            if (typeof toggleAnnotationDrawer === 'function') {
                                toggleAnnotationDrawer(true);
                            }
                            var input = document.getElementById('annoNewInput');
                            if (input) {
                                input.value = '外链项目批注测试：验证「上版未决」已被物理隐藏！';
                            }
                        }, 400);
                    })()
                    `
                });

                // 等待批注抽屉展开动画
                await new Promise(r => setTimeout(r, 1000));

                // 检查 DOM 状态
                const checkRes = await send(ws, msgId++, 'Runtime.evaluate', {
                    expression: `
                    JSON.stringify({
                        barTitle: document.getElementById('barTitle') ? document.getElementById('barTitle').textContent : '',
                        btnAnnotationDisabled: document.getElementById('btnToggleAnnotation') ? document.getElementById('btnToggleAnnotation').disabled : null,
                        annoCurPageTitle: document.getElementById('annoCurPageTitle') ? document.getElementById('annoCurPageTitle').textContent : '',
                        pageLabelText: document.querySelector('.anno-cur-page-label') ? document.querySelector('.anno-cur-page-label').textContent : '',
                        historyToolbarHidden: document.getElementById('annoHistoryToolbar') ? document.getElementById('annoHistoryToolbar').hidden : null,
                        historyDividerHidden: document.getElementById('annoHistoryDivider') ? document.getElementById('annoHistoryDivider').hidden : null,
                        previousPanelHidden: document.getElementById('annoPreviousPanel') ? document.getElementById('annoPreviousPanel').hidden : null,
                        inputDisabled: document.getElementById('annoNewInput') ? document.getElementById('annoNewInput').disabled : null,
                        sendBtnDisabled: document.getElementById('btnSendAnno') ? document.getElementById('btnSendAnno').disabled : null
                    })
                    `
                });
                console.log('UI Evaluation State:', checkRes.result.value);

                // 全屏截图
                const shot = await send(ws, msgId++, 'Page.captureScreenshot', { format: 'png' });
                const buf = Buffer.from(shot.data, 'base64');
                const outDir = process.env.ARTIFACT_DIR || path.join(__dirname, '../tmp');
                if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
                const outPath1 = path.join(outDir, 'link_annotation_drawer_live.png');
                fs.writeFileSync(outPath1, buf);
                console.log('Saved screenshot to:', outPath1);

                // 截取批注抽屉局部特写
                const clipRes = await send(ws, msgId++, 'Runtime.evaluate', {
                    expression: `
                    (function() {
                        var drawer = document.getElementById('annotationDrawer');
                        if (!drawer) return null;
                        var r = drawer.getBoundingClientRect();
                        return { x: r.left, y: r.top, width: r.width, height: r.height, scale: 1 };
                    })()
                    `,
                    returnByValue: true
                });

                if (clipRes.result.value) {
                    const clipShot = await send(ws, msgId++, 'Page.captureScreenshot', {
                        format: 'png',
                        clip: clipRes.result.value
                    });
                    const clipBuf = Buffer.from(clipShot.data, 'base64');
                    const outPath2 = path.join(outDir, 'link_annotation_drawer_closeup.png');
                    fs.writeFileSync(outPath2, clipBuf);
                    console.log('Saved closeup screenshot to:', outPath2);
                }

                chrome.kill();
                process.exit(0);
            });
        });
    });
})();
