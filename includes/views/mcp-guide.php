<?php
$url=app_url('mcp.php');
?>
<!doctype html><html lang="<?php echo htmlspecialchars(I18n::htmlLang()); ?>"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title><?php echo htmlspecialchars(t('mcp.guide_title')); ?></title><link rel="icon" href="assets/images/favicon.svg?v=<?php echo substr(sha1_file(ROOT_PATH . '/assets/images/favicon.svg'), 0, 12); ?>" type="image/svg+xml"><link rel="stylesheet" href="assets/css/app.css"></head>
<body class="mcp-guide-page"><main class="mcp-guide-card"><h1><?php echo htmlspecialchars(t('mcp.guide_h1')); ?></h1>
<p><?php echo htmlspecialchars(t('mcp.guide_lead')); ?></p>
<ol><li><?php echo htmlspecialchars(t('mcp.guide_step_1')); ?></li><li><?php echo htmlspecialchars(t('mcp.guide_step_2')); ?></li><li><?php echo htmlspecialchars(t('mcp.guide_step_3')); ?></li></ol>
<div class="m-form-group"><label class="m-label" for="guideEndpoint"><?php echo htmlspecialchars(t('mcp.endpoint')); ?></label><input class="m-input" id="guideEndpoint" readonly value="<?php echo htmlspecialchars($url,ENT_QUOTES); ?>"></div>
<h2><?php echo htmlspecialchars(t('mcp.guide_codex_h2')); ?></h2><p><?php echo htmlspecialchars(t('mcp.guide_codex_desc')); ?></p><pre class="mcp-code">[mcp_servers.protoloft]
url = <?php echo htmlspecialchars(json_encode($url,JSON_UNESCAPED_SLASHES),ENT_QUOTES); ?>
http_headers = { Authorization = "Bearer YOUR_PERSONAL_TOKEN" }</pre>
<p><?php echo htmlspecialchars(t('mcp.guide_codex_env')); ?></p>
<h2><?php echo htmlspecialchars(t('mcp.guide_prompts_h2')); ?></h2><p><?php echo htmlspecialchars(t('mcp.guide_prompt_1')); ?></p><p><?php echo htmlspecialchars(t('mcp.guide_prompt_2')); ?></p>
<h2><?php echo htmlspecialchars(t('mcp.guide_large_h2')); ?></h2><p><?php echo htmlspecialchars(t('mcp.guide_large_desc')); ?></p><a class="mcp-guide-link" href="assets/mcp-upload.py.txt" download="protoloft-mcp-upload.py"><?php echo htmlspecialchars(t('mcp.guide_download_helper')); ?></a><pre class="mcp-code">python3 protoloft-mcp-upload.py --url MCP_URL --project-id PROJECT_ID --name "v2" --zip prototype.zip</pre>
<h2><?php echo htmlspecialchars(t('mcp.guide_scope_h2')); ?></h2><p><?php echo htmlspecialchars(t('mcp.guide_scope_p1')); ?></p><p><?php echo htmlspecialchars(t('mcp.guide_scope_p2')); ?></p>
<p><?php echo htmlspecialchars(t('mcp.guide_oauth_note')); ?></p>
<div class="mcp-actions"><a class="btn-primary btn-standard" href="index.php#settings=mcp"><?php echo htmlspecialchars(t('mcp.guide_go_profile')); ?></a><a class="btn-cancel btn-standard" href="https://developers.openai.com/codex/mcp/" target="_blank" rel="noopener noreferrer"><?php echo htmlspecialchars(t('mcp.guide_codex_doc')); ?></a></div>
</main></body></html>
