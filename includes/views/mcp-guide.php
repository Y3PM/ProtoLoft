<?php
$url=app_url('mcp.php');
?>
<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MCP 接入 · 立象原型</title><link rel="icon" href="assets/images/favicon.svg?v=<?php echo substr(sha1_file(ROOT_PATH . '/assets/images/favicon.svg'), 0, 12); ?>" type="image/svg+xml"><link rel="stylesheet" href="assets/css/app.css"></head>
<body class="mcp-guide-page"><main class="mcp-guide-card"><h1>MCP 接入</h1>
<p>让 AI 读取指定版本的原型和批注，整理测试用例，上传新的原型版本。</p>
<ol><li>登录平台，在「个人设置 → MCP 接入」创建个人凭据。</li><li>复制配置，添加到支持 Streamable HTTP 和 Bearer 授权头的 AI 客户端。</li><li>连接后，AI 会自动获取可用工具及参数说明。</li></ol>
<div class="m-form-group"><label class="m-label" for="guideEndpoint">服务地址</label><input class="m-input" id="guideEndpoint" readonly value="<?php echo htmlspecialchars($url,ENT_QUOTES); ?>"></div>
<h2>Codex 配置</h2><p>在 MCP 设置或 config.toml 中添加，替换个人凭据。</p><pre class="mcp-code">[mcp_servers.protoloft]
url = <?php echo htmlspecialchars(json_encode($url,JSON_UNESCAPED_SLASHES),ENT_QUOTES); ?>
http_headers = { Authorization = "Bearer YOUR_PERSONAL_TOKEN" }</pre>
<p>也可使用 bearer_token_env_var 从环境变量读取凭据。不要把凭据提交到项目仓库。</p>
<h2>可以这样提问</h2><p>“读取订单项目的客户确认稿和未解决批注，按页面编写测试用例，标出依据和待确认规则。”</p><p>“把这个 ZIP 发布为第二轮评审，并填写更新日志。”</p>
<h2>上传较大的原型包</h2><p>可下载客户端上传助手，由本地 Python 3 分片上传，文件内容不经过模型对话。服务器不需要 Python。先在本地环境变量 PROTOLOFT_MCP_TOKEN 中设置个人凭据，再运行助手。</p><a class="mcp-guide-link" href="assets/mcp-upload.py.txt" download="protoloft-mcp-upload.py">下载上传助手</a><pre class="mcp-code">python3 protoloft-mcp-upload.py --url MCP服务地址 --project-id 项目ID --name "第二轮评审" --zip prototype.zip</pre><p>AI 可通过 list_projects 获取项目ID；同名替换需要明确要求并添加 --replace。不要把凭据写进命令参数。</p>
<h2>读取范围</h2><p>原型读取包含静态页面文字、链接、图片和可读取的 Axure 交互源数据。平台不执行原型流程，不提供自动页面截图；生成用例不等于执行测试。</p><p>凭据继承当前账号权限，可限定项目、允许发布或仅供读取；有效期 90 天，可随时撤销。同名替换仍需明确确认。</p>
<p>此版本使用个人 Bearer 凭据，不提供 OAuth 登录。仅支持 OAuth 的连接器不能只粘贴地址接入；请先使用支持自定义授权头的客户端。</p>
<div class="mcp-actions"><a class="btn-primary btn-standard" href="index.php#settings=mcp">前往个人设置</a><a class="btn-cancel btn-standard" href="https://developers.openai.com/codex/mcp/" target="_blank" rel="noopener noreferrer">Codex 官方说明</a></div>
</main></body></html>
