/* 全角色个人 MCP 接入；个人凭据仅创建时返回，不持久化到前端存储。 */
var mcpSettings = null;
var mcpSecretValue = '';
var mcpBusy = false;
var mcpLoadSequence = 0;
var mcpLoading = false;
var mcpAutoSaveTimer = null;
var mcpScopeMode = 'all';
var mcpDropdownOpenSnapshot = '';

function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function(s) {
        return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s];
    });
}

function setMcpBusy(busy) {
    mcpBusy = busy;
    var controls = document.getElementById('mcpControls');
    if (controls) controls.disabled = busy || mcpLoading || !mcpSettings;
}

function setMcpScopeMode(mode, skipSave) {
    mcpScopeMode = (mode === 'custom') ? 'custom' : 'all';
    var btnAll = document.getElementById('mcpScopeModeAll');
    var btnCustom = document.getElementById('mcpScopeModeCustom');
    var customWrap = document.getElementById('mcpCustomProjectsWrap');
    var isCustom = (mcpScopeMode === 'custom');

    if (btnAll) {
        btnAll.classList.toggle('active', !isCustom);
        btnAll.setAttribute('aria-checked', String(!isCustom));
    }
    if (btnCustom) {
        btnCustom.classList.toggle('active', isCustom);
        btnCustom.setAttribute('aria-checked', String(isCustom));
    }
    if (customWrap) {
        customWrap.hidden = !isCustom;
    }

    if (isCustom) {
        updateMcpProjectTags();
    }

    if (!skipSave && mcpSettings && mcpSettings.token) {
        handleMcpPermissionChange();
    }
}

function getSelectedMcpProjectIds() {
    if (mcpScopeMode === 'all') return [];
    var ids = [];
    var cbs = (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function')
        ? document.querySelectorAll('input[name="mcp_project_ids[]"]:checked') : null;
    if (cbs && typeof cbs.forEach === 'function') {
        cbs.forEach(function(cb) {
            var id = parseInt(cb.value, 10);
            if (id > 0) ids.push(id);
        });
    }
    if (ids.length === 0) {
        var scope = document.getElementById('mcpProjectScope');
        if (scope && scope.value && scope.value !== '0') {
            var parsed = parseInt(scope.value, 10);
            if (parsed > 0) ids.push(parsed);
        }
    }
    return ids;
}

function toggleMcpProjectDropdown(e) {
    if (e) {
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        if (typeof e.preventDefault === 'function') e.preventDefault();
    }
    var menu = document.getElementById('mcpProjectSelectMenu');
    var trigger = document.getElementById('mcpProjectSelectTrigger');
    if (!menu) return;
    var isOpen = (menu.style && menu.style.display !== 'none');
    if (isOpen) {
        closeMcpProjectDropdown();
    } else {
        mcpDropdownOpenSnapshot = getSelectedMcpProjectIds().sort().join(',');
        if (menu.style) menu.style.display = 'block';
        if (trigger) trigger.setAttribute('aria-expanded', 'true');
    }
}

function closeMcpProjectDropdown() {
    var menu = document.getElementById('mcpProjectSelectMenu');
    var trigger = document.getElementById('mcpProjectSelectTrigger');
    if (!menu || (menu.style && menu.style.display === 'none')) return;
    if (menu.style) menu.style.display = 'none';
    if (trigger) trigger.setAttribute('aria-expanded', 'false');

    // 仅在下拉收起 / 失焦时检测变动并自动保存
    var currentSnapshot = getSelectedMcpProjectIds().sort().join(',');
    if (currentSnapshot !== mcpDropdownOpenSnapshot) {
        mcpDropdownOpenSnapshot = currentSnapshot;
        if (mcpSettings && mcpSettings.token) {
            handleMcpPermissionChange();
        }
    }
}

function selectAllMcpProjects(isAll) {
    var cbs = (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function')
        ? document.querySelectorAll('input[name="mcp_project_ids[]"]') : null;
    if (cbs && typeof cbs.forEach === 'function') {
        cbs.forEach(function(cb) {
            cb.checked = !!isAll;
        });
    }
    updateMcpProjectTags();
    // 连续选择不立即发请求，失焦收起时统一保存
}

function onMcpProjectCheckboxChange() {
    updateMcpProjectTags();
    // 勾选操作不打断用户，失焦收起时统一保存
}

function updateMcpProjectTags() {
    var tagsWrap = document.getElementById('mcpProjectSelectTags');
    var selectScope = document.getElementById('mcpProjectScope');
    var cbs = (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function')
        ? document.querySelectorAll('input[name="mcp_project_ids[]"]:checked') : null;
    var names = [];
    if (cbs && typeof cbs.forEach === 'function') {
        cbs.forEach(function(cb) {
            var label = cb.closest ? cb.closest('label') : null;
            var nameSpan = label && label.querySelector ? label.querySelector('span') : null;
            names.push(nameSpan ? nameSpan.textContent.trim() : ('项目 #' + cb.value));
        });
    }

    if (!tagsWrap) return;

    if (names.length === 0) {
        tagsWrap.innerHTML = '<span style="font-size:12.5px;color:var(--text-3);">请选择项目…</span>';
        if (selectScope) selectScope.value = '0';
    } else if (names.length <= 2) {
        var html = '';
        names.forEach(function(name) {
            html += '<span class="badge-tag badge-primary">' + escapeHtml(name) + '</span>';
        });
        tagsWrap.innerHTML = html;
        if (selectScope && cbs && cbs[0]) selectScope.value = String(cbs[0].value);
    } else {
        tagsWrap.innerHTML = '<span class="badge-tag badge-primary">' + escapeHtml(names[0]) + ' 等 ' + names.length + ' 个项目</span>';
        if (selectScope && cbs && cbs[0]) selectScope.value = String(cbs[0].value);
    }
}

function autoSaveMcpPermissions(delay) {
    if (mcpAutoSaveTimer) clearTimeout(mcpAutoSaveTimer);
    mcpAutoSaveTimer = setTimeout(function() {
        if (!mcpSettings || !mcpSettings.token) return;
        handleMcpPermissionChange();
    }, (typeof delay === 'number') ? delay : 120);
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('click', function(e) {
        var menu = document.getElementById('mcpProjectSelectMenu');
        var trigger = document.getElementById('mcpProjectSelectTrigger');
        if (menu && menu.style.display !== 'none') {
            if (!menu.contains(e.target) && (!trigger || !trigger.contains(e.target))) {
                closeMcpProjectDropdown();
            }
        }
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeMcpProjectDropdown();
        }
    });
}

function loadMcpSettings() {
    var sequence = ++mcpLoadSequence;
    mcpLoading = true;
    var controls = document.getElementById('mcpControls');
    if (controls) controls.disabled = true;
    var retry = document.getElementById('mcpLoadRetry');
    if (retry) retry.hidden = true;
    var secret = document.getElementById('mcpSecret');
    if (secret && !mcpSecretValue) secret.value = '';
    var newCred = document.getElementById('mcpNewCredential');
    if (newCred) newCred.hidden = !mcpSecretValue;
    return fetch('api.php?action=mcp_settings', {cache:'no-store'}).then(function(r) { return r.json(); }).then(function(res) {
        if (!res.success) throw new Error(res.message || '无法读取 MCP 设置');
        if (sequence !== mcpLoadSequence) return;
        mcpLoading = false;
        mcpSettings = res.data;
        if (mcpSecretValue && (!res.data.token || mcpSecretValue.indexOf(res.data.token.token_prefix) !== 0)) mcpSecretValue = '';
        if (secret) secret.value = mcpSecretValue;
        if (newCred) newCred.hidden = !mcpSecretValue;
        var endpointInput = document.getElementById('mcpEndpoint');
        if (endpointInput) endpointInput.value = res.data.endpoint;

        var token = res.data.token;
        var hasCustomScope = false;
        var selectedIds = [];
        if (token) {
            if (token.project_ids && Array.isArray(token.project_ids) && token.project_ids.length > 0) {
                hasCustomScope = true;
                selectedIds = token.project_ids.map(function(id) { return parseInt(id, 10); });
            } else if (token.project_id && parseInt(token.project_id, 10) > 0) {
                hasCustomScope = true;
                selectedIds = [parseInt(token.project_id, 10)];
            }
        }

        var optionsContainer = document.getElementById('mcpProjectOptions');
        if (optionsContainer) {
            optionsContainer.innerHTML = '';
            res.data.projects.forEach(function(project) {
                var pid = parseInt(project.id, 10);
                var isChecked = selectedIds.indexOf(pid) !== -1;
                var label = document.createElement('label');
                label.className = 'mcp-project-option';
                label.innerHTML = '<input type="checkbox" name="mcp_project_ids[]" value="' + pid + '"' + (isChecked ? ' checked' : '') + ' onchange="onMcpProjectCheckboxChange()">' +
                    '<span>' + escapeHtml(project.name) + '</span>';
                optionsContainer.appendChild(label);
            });
        }
        setMcpScopeMode(hasCustomScope ? 'custom' : 'all', true);

        var select = document.getElementById('mcpProjectScope');
        if (select) {
            select.textContent = '';
            var all = document.createElement('option');
            all.value = '0';
            all.textContent = '全部项目';
            select.appendChild(all);
            res.data.projects.forEach(function(project) {
                var option = document.createElement('option');
                option.value = project.id;
                option.textContent = project.name;
                select.appendChild(option);
            });
            if (token) select.value = String(token.project_id || 0);
            if (!select.value && token && token.project_id) {
                var unavailable = document.createElement('option');
                unavailable.value = String(token.project_id);
                unavailable.textContent = '原授权项目（当前不可访问）';
                select.appendChild(unavailable);
                select.value = String(token.project_id);
            }
            if (!select.value) select.value = '0';
        }

        var switchRow = document.getElementById('mcpPublishSwitchRow');
        if (switchRow) switchRow.hidden = !res.data.can_publish;
        var permission = document.getElementById('mcpPublishPermission');
        if (permission) {
            permission.disabled = !res.data.can_publish;
            permission.checked = !!(res.data.can_publish && res.data.token && parseInt(res.data.token.can_publish, 10));
        }

        var readOnlyHint = document.getElementById('mcpReadOnlyHint');
        if (readOnlyHint) readOnlyHint.hidden = !!res.data.can_publish;
        var savePermissions = document.getElementById('mcpSavePermissions');
        if (savePermissions) savePermissions.hidden = true;
        var createBtn = document.getElementById('mcpCreateButton');
        if (createBtn) createBtn.textContent = token ? '重新生成' : '生成凭据';
        var revokeBtn = document.getElementById('mcpRevokeButton');
        if (revokeBtn) revokeBtn.hidden = !token;

        var statusEl = document.getElementById('mcpCredentialStatus');
        if (statusEl) {
            if (token) {
                var dateStr = new Date(token.expires_at * 1000).toLocaleDateString();
                statusEl.textContent = token.is_valid
                    ? ('已生效 · ' + token.token_prefix + '… · 到期 ' + dateStr)
                    : ('已失效 · ' + token.token_prefix + '… · 到期 ' + dateStr);
            } else {
                statusEl.textContent = '尚未生成凭据';
            }
        }

        if (controls) controls.disabled = mcpBusy;
        renderMcpViews();
        return true;
    }).catch(function(e) {
        if (sequence !== mcpLoadSequence) return;
        mcpLoading = false;
        mcpSettings = null;
        if (controls) controls.disabled = true;
        if (retry) retry.hidden = false;
        var statusEl = document.getElementById('mcpCredentialStatus');
        if (statusEl) statusEl.textContent = e.message;
        return false;
    });
}

function generateAiPromptText(tokenVal) {
    if (!mcpSettings) return '';
    var url = mcpSettings.endpoint;
    var tokenDisplay = tokenVal;
    if (!tokenDisplay) {
        if (mcpSettings && mcpSettings.token) {
            tokenDisplay = 'YOUR_PERSONAL_TOKEN（已生效凭据前缀为 ' + (mcpSettings.token.token_prefix || 'plmcp_') + '…；若客户端已配置可保持不变）';
        } else {
            tokenDisplay = '[尚未生成凭据]';
        }
    }
    return '请帮我把立象原型的 MCP 服务接入到当前 AI 客户端环境：\n\n' +
        '【服务信息】\n' +
        '- 名称：protoloft\n' +
        '- 地址：' + url + '\n' +
        '- 协议：Streamable HTTP\n' +
        '- 授权：Authorization: Bearer ' + tokenDisplay + '\n\n' +
        '【执行要求】\n' +
        '请根据当前使用的客户端（Cursor、Claude Desktop、Windsurf、Codex、Cline 等），找到对应的 MCP 配置文件并安全写入 protoloft 配置（保留已有其他服务）。配置完成后提示我刷新重载。';
}

function renderMcpViews() {
    var copyButton = document.getElementById('mcpCopyAiButton');
    if (copyButton) {
        copyButton.textContent = (mcpSettings && mcpSettings.token) ? '复制 AI 接入指令' : '生成凭据并复制 AI 指令';
    }
    var hint = document.getElementById('mcpConfigSecretHint');
    if (hint) hint.hidden = !!mcpSecretValue;
    renderMcpConfig();
}

function renderMcpConfig() {
    if (!mcpSettings) return;
    var token = mcpSecretValue || 'YOUR_PERSONAL_TOKEN';
    var url = mcpSettings.endpoint;
    var formatSelect = document.getElementById('mcpClientFormat');
    var format = formatSelect ? formatSelect.value : 'json';
    var codeEl = document.getElementById('mcpConfig');
    var hintEl = document.getElementById('mcpConfigFilePath');

    if (format === 'codex') {
        if (codeEl) {
            codeEl.textContent = '[mcp_servers.protoloft]\nurl = ' + JSON.stringify(url) + '\nhttp_headers = { Authorization = ' + JSON.stringify('Bearer ' + token) + ' }';
        }
        if (hintEl) hintEl.textContent = '配置文件路径：~/.codex/config.toml';
    } else if (format === 'claude') {
        if (codeEl) {
            codeEl.textContent = JSON.stringify({
                mcpServers: {
                    protoloft: {
                        url: url,
                        headers: { Authorization: 'Bearer ' + token }
                    }
                }
            }, null, 2);
        }
        if (hintEl) hintEl.textContent = 'macOS: ~/Library/Application Support/Claude/claude_desktop_config.json | Windows: %APPDATA%\\Claude\\claude_desktop_config.json';
    } else {
        // cursor / general json
        if (codeEl) {
            codeEl.textContent = JSON.stringify({
                mcpServers: {
                    protoloft: {
                        url: url,
                        headers: { Authorization: 'Bearer ' + token }
                    }
                }
            }, null, 2);
        }
        if (hintEl) hintEl.textContent = 'Cursor 路径：~/.cursor/mcp.json 或项目根目录 .cursor/mcp.json';
    }
}

function doCreateMcpToken(replace) {
    if (mcpBusy || !mcpSettings) return Promise.reject(new Error('请等待当前操作完成'));
    if (mcpScopeMode === 'custom') {
        var checkedCount = 0;
        var cbs = (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function')
            ? document.querySelectorAll('input[name="mcp_project_ids[]"]:checked') : null;
        if (cbs) checkedCount = cbs.length;
        if (checkedCount === 0) {
            showToast('请至少选择一个项目，或切换为「全部项目」模式', 'warning');
            return Promise.reject(new Error('请至少选择一个项目'));
        }
    }
    setMcpBusy(true);
    var button = document.getElementById('mcpCreateButton');
    var currentIds = getSelectedMcpProjectIds();
    var permission = document.getElementById('mcpPublishPermission');
    var primaryId = currentIds.length === 1 ? currentIds[0] : (currentIds.length === 0 ? 0 : currentIds[0]);
    var fd = new FormData();
    currentIds.forEach(function(pid) {
        fd.append('project_ids[]', pid);
    });
    fd.append('project_id', String(primaryId));
    fd.append('can_publish', (mcpSettings && mcpSettings.can_publish && permission && permission.checked) ? '1' : '0');
    fd.append('replace', replace ? '1' : '0');
    return apiFetch('mcp_token_create', fd, button).then(function(res) {
        if (!res.success) throw new Error(res.message || '生成凭据失败');
        mcpSecretValue = res.data.secret;
        return loadMcpSettings().then(function(loaded) {
            if (!loaded) throw new Error('凭据已生成，读取设置失败；请重新加载后复制');
            var secretInput = document.getElementById('mcpSecret');
            if (secretInput) secretInput.value = mcpSecretValue;
            var newCred = document.getElementById('mcpNewCredential');
            if (newCred) newCred.hidden = false;
            renderMcpViews();
            return res.data;
        });
    }).then(function(result) { setMcpBusy(false); return result; }, function(error) { setMcpBusy(false); throw error; });
}

function createMcpCredential(event) {
    if (event && event.preventDefault) event.preventDefault();
    var button = document.getElementById('mcpCreateButton');
    if (mcpBusy || !mcpSettings || (button && button.disabled)) return;
    var hasToken = !!(mcpSettings && mcpSettings.token);
    var proceed = hasToken
        ? showConfirm({
            title: '重新生成 MCP 凭据',
            message: '旧凭据将立即失效，已连接的 AI 客户端需更新配置。仅调整项目范围或发布权限时，无需重新生成，修改将自动保存。',
            confirmText: '确认重新生成',
            isDanger: true
        })
        : Promise.resolve(true);

    return proceed.then(function(yes) {
        if (!yes) return;
        return doCreateMcpToken(hasToken).then(function() {
            showToast('新凭据已生成', 'success');
        });
    }).catch(function(e) {
        showToast(e.message || '操作失败', 'error');
    });
}

function handleMcpPermissionChange(event) {
    if (event && event.preventDefault) event.preventDefault();
    if (mcpBusy || !mcpSettings || !mcpSettings.token) return;
    if (mcpScopeMode === 'custom') {
        var checkedCount = 0;
        var cbs = (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function')
            ? document.querySelectorAll('input[name="mcp_project_ids[]"]:checked') : null;
        if (cbs) checkedCount = cbs.length;
        if (checkedCount === 0) {
            showToast('请至少选择一个项目，或切换为「全部项目」模式', 'warning');
            return;
        }
    }
    var currentIds = getSelectedMcpProjectIds();
    var perm = document.getElementById('mcpPublishPermission');
    var publish = !!(mcpSettings && mcpSettings.can_publish && perm && perm.checked);
    var primaryId = currentIds.length === 1 ? currentIds[0] : (currentIds.length === 0 ? 0 : currentIds[0]);
    var submittedIds = currentIds.slice();
    var submittedPrimary = primaryId;
    var submittedPublish = publish;
    var fd = new FormData();
    submittedIds.forEach(function(pid) {
        fd.append('project_ids[]', pid);
    });
    fd.append('project_id', String(submittedPrimary));
    fd.append('can_publish', submittedPublish ? '1' : '0');
    setMcpBusy(true);
    return apiFetch('mcp_permission_update', fd).then(function(res) {
        if (!res.success) throw new Error(res.message || '更新权限失败');
        mcpSettings.token.project_ids = submittedIds;
        mcpSettings.token.project_id = submittedPrimary;
        mcpSettings.token.can_publish = submittedPublish ? 1 : 0;
        showToast(res.message || '权限已自动保存', 'success');
        renderMcpViews();
    }).catch(function(e) {
        showToast(e.message || '更新失败，请重试', 'error');
    }).then(function() { setMcpBusy(false); });
}

function copyMcpAiPrompt() {
    if (mcpBusy || !mcpSettings) return;
    // 1. 如果尚未生成过凭据：自动生成新凭据并复制完整指令
    if (!mcpSettings.token) {
        return doCreateMcpToken(false).then(function() {
            return copyMcpText(generateAiPromptText(mcpSecretValue));
        }).catch(function(e) {
            showToast(e.message || '生成凭据失败', 'error');
        });
    }
    // 2. 如果已有凭据：直接复用已有凭据生成指令并复制，绝不重新生成冲掉已有配置
    return copyMcpText(generateAiPromptText(mcpSecretValue));
}

function toggleMcpManualConfig() {
    var body = document.getElementById('mcpManualBody');
    var btn = document.getElementById('mcpManualToggleBtn');
    var text = document.getElementById('mcpManualToggleText');
    if (!body) return;
    var isHidden = body.style.display === 'none' || !body.style.display;
    body.style.display = isHidden ? 'block' : 'none';
    if (btn) {
        if (typeof btn.setAttribute === 'function') {
            btn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
        }
        if (btn.classList && typeof btn.classList.add === 'function') {
            if (isHidden) {
                btn.classList.add('expanded');
            } else {
                btn.classList.remove('expanded');
            }
        }
    }
    if (text) {
        text.textContent = isHidden ? '收起' : '展开';
    }
}

function revokeMcpCredential() {
    if (mcpBusy || !mcpSettings || !mcpSettings.token) return;
    return showConfirm({
        title: '撤销 MCP 凭据',
        message: '使用此凭据的 AI 客户端将无法继续访问。',
        confirmText: '撤销凭据',
        isDanger: true
    }).then(function(yes) {
        if (!yes) return;
        if (mcpBusy) return;
        setMcpBusy(true);
        return apiFetch('mcp_token_revoke', new FormData(), document.getElementById('mcpRevokeButton')).then(function(res) {
            if (!res.success) throw new Error(res.message);
            mcpSecretValue = '';
            return loadMcpSettings().then(function() {
                showToast('凭据已撤销', 'success');
            });
        });
    }).catch(function(e) {
        showToast(e.message || '撤销失败', 'error');
    }).then(function() { setMcpBusy(false); });
}

function copyMcpText(text) {
    var fallback = function() {
        var input = document.createElement('textarea');
        input.value = text;
        input.className = 'mcp-copy-fallback';
        document.body.appendChild(input);
        try { input.select(); return !!document.execCommand('copy'); }
        catch (e) { return false; }
        finally { input.remove(); }
    };
    var copying = navigator.clipboard && window.isSecureContext
        ? navigator.clipboard.writeText(text).then(function() { return true; }, fallback)
        : Promise.resolve(fallback());
    return copying.then(function(copied) {
        showToast(copied ? '已复制到剪贴板' : '复制失败，请手动选择复制', copied ? 'success' : 'error');
        return copied;
    });
}

function copyMcpValue(id) {
    var el = document.getElementById(id);
    if (el) copyMcpText(el.value);
}

function copyMcpConfig() {
    var codeEl = document.getElementById('mcpConfig');
    if (codeEl) copyMcpText(codeEl.textContent);
}

window.loadMcpSettings = loadMcpSettings;
window.copyMcpAiPrompt = copyMcpAiPrompt;
window.copyMcpConfig = copyMcpConfig;
window.copyMcpValue = copyMcpValue;
window.createMcpCredential = createMcpCredential;
window.revokeMcpCredential = revokeMcpCredential;
window.handleMcpPermissionChange = handleMcpPermissionChange;
window.autoSaveMcpPermissions = autoSaveMcpPermissions;
window.setMcpScopeMode = setMcpScopeMode;
window.toggleMcpProjectDropdown = toggleMcpProjectDropdown;
window.closeMcpProjectDropdown = closeMcpProjectDropdown;
window.selectAllMcpProjects = selectAllMcpProjects;
window.onMcpProjectCheckboxChange = onMcpProjectCheckboxChange;
window.onMcpProjectChange = onMcpProjectCheckboxChange;
window.renderMcpConfig = renderMcpConfig;
window.toggleMcpManualConfig = toggleMcpManualConfig;
