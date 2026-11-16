<?php
/**
 * 就地管理所有模态弹窗组件 (含空间管理、用户管理、版本发布)
 */
// 获取当前所有正常状态成员 (基于邮箱与真实姓名二元模型)
$allUsers = $db->query("SELECT id, email, name, role FROM users WHERE status = 1 ORDER BY id ASC")->fetchAll();
?>
<?php if ($canManage): ?>
<!-- 1. 发布/更新版本弹窗 (标准 M 档 540px) -->
<div id="uploadModal" class="custom-modal" style="display:none;">
    <div class="modal-dialog-box modal-md">
        <div class="modal-head">
            <h4 id="uploadModalTitle">发布版本</h4>
            <button type="button" class="close-x" onclick="closeModal('uploadModal')" title="关闭"><i class="ri-close-line"></i></button>
        </div>
        <form id="uploadVersionForm" onsubmit="handleVersionUpload(event)" novalidate>
            <input type="hidden" id="uploadItemId" name="item_id">
            
            <div class="m-form-group">
                <label class="m-label">所属项目 <span class="req-star">*</span></label>
                <select id="uploadItemSelect" class="m-input" required onchange="onUploadItemSelectChange(this.value)">
                    <?php 
                    if (!empty($cats) && !empty($catItems)) {
                        foreach ($cats as $c) {
                            $cItems = $catItems[$c['id']] ?? [];
                            $projList = [];
                            foreach ($cItems as $it) {
                                if ($it['type'] === 'project') { $projList[] = $it; }
                            }
                            if (!empty($projList)) {
                                echo '<optgroup label="' . htmlspecialchars($c['name']) . '" data-cat-id="' . (int)$c['id'] . '">';
                                foreach ($projList as $p) {
                                    $isCollab = false;
                                    if (!empty($p['collaborators']) && $currentUser) {
                                        $cList = array_map('intval', explode(',', $p['collaborators']));
                                        if (in_array((int)$currentUser['id'], $cList, true)) $isCollab = true;
                                    }
                                    $canEditThisProject = $isAdmin || ($currentUser && ((int)($p['created_by'] ?? 0) === (int)$currentUser['id'])) || $isCollab;
                                    if (!$canEditThisProject) continue;
                                    $hasWb = !empty($p['webhook_url']) ? '1' : '0';
                                    $wbUrl = htmlspecialchars($p['webhook_url'] ?? '', ENT_QUOTES);
                                    echo '<option value="' . (int)$p['id'] . '" data-has-webhook="' . $hasWb . '" data-webhook-url="' . $wbUrl . '">' . htmlspecialchars($p['name']) . '</option>';
                                }
                                echo '</optgroup>';
                            }
                        }
                    }
                    ?>
                </select>
            </div>

            <div class="m-form-group">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <label class="m-label" style="margin-bottom:0;">版本名称 <span class="req-star">*</span></label>
                    <span id="uploadLastVerHint" class="upload-last-ver-hint" style="display:none;font-size:12px;color:var(--text-3);">
                        上一版本：<strong style="color:var(--text-1);font-weight:550;cursor:pointer;" id="uploadLastVerName" onclick="applyUploadLastVerSuggestion()" title="点击填入此版本号"></strong>
                    </span>
                </div>
                <input type="text" id="uploadVerName" name="version_name" class="m-input" placeholder="如 V1.1.1、评审稿" required autocomplete="off" maxlength="30" oninput="onUploadVersionNameInput(this)">
                <span id="uploadVersionHint" class="m-form-hint" hidden style="margin-top:4px;font-size:12px;color:var(--warning,#f59e0b);display:block;"></span>
            </div>

            <div class="m-form-group">
                <label class="m-label">原型内容 (ZIP 包或原型文件夹) <span class="req-star">*</span></label>
                <div class="proto-drop-zone" id="protoDropZone">
                    <input type="file" id="uploadZipFile" name="zip_file" accept=".zip" class="custom-file-input" onchange="handleZipSelected(this)">
                    <input type="file" id="uploadFolderInput" webkitdirectory directory class="custom-file-input" onchange="handleFolderSelected(this)">
                    <div class="proto-drop-actions" id="protoDropActions">
                        <button type="button" class="btn-file-select" onclick="triggerFileInput('uploadZipFile')"><i class="ri-file-zip-line"></i> 选择 ZIP 包</button>
                        <button type="button" class="btn-file-select" onclick="triggerFileInput('uploadFolderInput')"><i class="ri-folder-upload-line"></i> 选择文件夹</button>
                        <span class="proto-drop-hint">或将 ZIP 包 / 文件夹直接拖放至此处</span>
                    </div>
                    <div class="proto-file-badge" id="protoFileBadge" style="display:none;">
                        <i class="ri-file-check-line" id="protoFileBadgeIcon"></i>
                        <span class="proto-file-badge-text" id="protoFileBadgeText">未选择文件</span>
                        <button type="button" class="proto-file-badge-clear" onclick="clearSelectedProtoSource(event)" title="移除并重新选择"><i class="ri-close-line"></i></button>
                    </div>
                    <span class="file-name-display" id="uploadZipName" style="display:none;">未选择文件</span>
                </div>
            </div>

            <div class="m-form-group">
                <label class="m-label">RP 源文件 (.rp) <span class="opt-tag">选填</span></label>
                <div class="proto-drop-zone" id="rpDropZone">
                    <input type="file" id="uploadRpFile" name="rp_file" accept=".rp" class="custom-file-input" onchange="handleRpSelected(this)">
                    <div class="proto-drop-actions" id="rpDropActions">
                        <button type="button" class="btn-file-select" onclick="triggerFileInput('uploadRpFile')"><i class="ri-draft-line"></i> 选择 RP 底稿</button>
                        <span class="proto-drop-hint">或将 .rp 底稿文件直接拖放至此处</span>
                    </div>
                    <div class="proto-file-badge" id="rpFileBadge" style="display:none;">
                        <i class="ri-draft-line" id="rpFileBadgeIcon"></i>
                        <span class="proto-file-badge-text" id="rpFileBadgeText">未选择文件</span>
                        <button type="button" class="proto-file-badge-clear" onclick="clearSelectedRpFile(event)" title="移除并重新选择"><i class="ri-close-line"></i></button>
                    </div>
                    <span class="file-name-display" id="uploadRpName" style="display:none;">未选择文件</span>
                </div>
            </div>

            <div class="m-form-group">
                <label class="m-label" id="uploadChangelogLabel">
                    <span>更新日志 <span class="req-star" id="changelogReqStar" style="display:none;">*</span></span>
                    <span class="opt-tag" id="changelogOptTag">选填</span>
                </label>
                <textarea id="uploadChangelog" name="changelog" class="m-input upload-changelog" placeholder="本次版本的改动说明，支持换行与 Markdown（如 - 列表、**加粗**、# 标题）" maxlength="3000" oninput="this.classList.remove('m-input-error')"></textarea>
            </div>

            <!-- 发送群通知双列独立控制 (常驻显示，避免认知波动) -->
            <div class="m-form-group">
                <label class="m-label">通知设置</label>
                <div class="upload-notify-grid" id="uploadNotifyGrid">
                    <!-- 左列：项目群通知 -->
                    <div class="upload-notify-card" id="uploadNotifyItemCard">
                        <div class="upload-notify-card-info">
                            <div class="upload-notify-card-title">
                                <i class="ri-team-line"></i>
                                <span>项目群通知</span>
                            </div>
                            <div class="upload-notify-card-status" id="uploadNotifyItemStatus">未配置</div>
                        </div>
                        <div class="upload-notify-card-control">
                            <label class="linear-switch" id="uploadNotifyItemSwitchLabel">
                                <input type="checkbox" id="notifyItemWebhook" name="notify_item" value="1" onchange="handleNotifyTargetChange()" aria-label="项目群通知">
                                <span class="linear-switch-slider"></span>
                            </label>
                        </div>
                    </div>

                    <!-- 右列：评审群通知 -->
                    <div class="upload-notify-card" id="uploadNotifyGlobalCard">
                        <div class="upload-notify-card-info">
                            <div class="upload-notify-card-title">
                                <i class="ri-broadcast-line"></i>
                                <span>评审群通知</span>
                            </div>
                            <div class="upload-notify-card-status" id="uploadNotifyGlobalStatus">未配置</div>
                        </div>
                        <div class="upload-notify-card-control">
                            <label class="linear-switch" id="uploadNotifyGlobalSwitchLabel">
                                <input type="checkbox" id="notifyGlobalWebhook" name="notify_global" value="1" onchange="handleNotifyTargetChange()" aria-label="评审群通知">
                                <span class="linear-switch-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <input type="hidden" name="is_default" value="1">

            <div id="uploadProgressWrap" style="display:none;margin-bottom:16px;">
                <div style="font-size:12px;color:var(--primary);display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span id="uploadProgressText">正在传输...</span>
                    <span id="uploadProgressPercent">0%</span>
                </div>
                <div style="height:5px;background:var(--surface-active);border-radius:3px;overflow:hidden;">
                    <div id="uploadProgressBar" style="width:0%;height:100%;background:var(--primary);transition:width 0.15s;"></div>
                </div>
            </div>

            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
                <button type="button" class="btn-cancel btn-standard" onclick="closeModal('uploadModal')">取消</button>
                <button type="submit" class="btn-primary btn-standard" id="btnUploadSubmit">发布</button>
            </div>
        </form>
    </div>
</div>

<!-- 1.1 版本管理：卡片流、搜索与分页。 -->
<div id="versionManageModal" class="custom-modal" style="display:none;">
    <div class="modal-dialog-box modal-ver">
        <div class="modal-head">
            <div class="ver-modal-heading">
                <h4 id="verManageTitle">版本管理</h4>
                <span id="verManageCountBadge" class="m-badge m-badge-neutral" style="display:none;"></span>
            </div>
            <div class="m-input m-input-md ver-manage-search-wrap" id="verManageSearchWrap" style="display:none;">
                <i class="ri-search-line ver-manage-search-icon" aria-hidden="true"></i>
                <input type="text" id="verManageSearchInput" class="ver-manage-search-input" aria-label="搜索版本、日志或发版人" placeholder="搜索版本、日志或发版人..." oninput="handleVerManageSearch(this.value)">
                <button type="button" id="verManageSearchClear" class="close-x" onclick="clearVerManageSearch()" style="display:none;" title="清空搜索"><i class="ri-close-line"></i></button>
            </div>
            <button type="button" id="btnVerManagePublish" class="btn-primary btn-sm" hidden style="margin-left:auto;margin-right:6px;" onclick="publishFromVerManage()" title="为此项目发布新版本">
                <i class="ri-upload-cloud-line"></i> 发布新版本
            </button>
            <button type="button" class="close-x" onclick="closeModal('versionManageModal')" title="关闭"><i class="ri-close-line"></i></button>
        </div>
        <div id="verManageTableWrap" class="ver-manage-table-wrap">
            <div id="verManageTable" class="ver-manage-table ver-manage-flow-wrap" style="display:none;">
                <div id="verManageTableBody" class="ver-card-list"></div>
            </div>
            <div id="verManageEmpty" class="m-empty" style="display:none;padding:48px 20px;text-align:center;"></div>
        </div>
        <input type="file" id="verManageRpInput" class="custom-file-input" accept=".rp" tabindex="-1" aria-hidden="true" onchange="handleVerManageRpSelected(this)">
        <div id="verManagePagination" class="ver-manage-pagination" style="display:none;">
            <div id="verPaginationInfo" style="font-size:12px;color:var(--text-3);"></div>
            <div id="verPaginationBtns" class="ver-pagination-nav"></div>
        </div>
    </div>
</div>

<!-- 1.2 编辑版本弹窗 (标准 S 档 440px) -->
<div id="versionEditModal" class="custom-modal" style="display:none;">
    <div class="modal-dialog-box modal-sm">
        <div class="modal-head">
            <h4 id="verEditModalTitle">编辑版本信息</h4>
            <button type="button" class="close-x" onclick="closeModal('versionEditModal')" title="关闭"><i class="ri-close-line"></i></button>
        </div>
        <form id="versionEditForm" onsubmit="handleVersionEditSubmit(event)" novalidate>
            <input type="hidden" id="editVerId" value="0">
            <input type="hidden" id="editVerItemId" value="0">
            
            <div class="m-form-group">
                <label class="m-label">版本名称 <span class="req-star">*</span></label>
                <input type="text" id="editVerName" class="m-input" placeholder="如 V1.1.1、评审稿" required autocomplete="off" maxlength="30">
            </div>

            <div class="m-form-group">
                <label class="m-label">更新日志</label>
                <textarea id="editVerChangelog" class="m-input" style="height:90px;resize:vertical;line-height:1.5;padding:8px 10px;" placeholder="选填，简述本次版本的核心变动..." maxlength="3000"></textarea>
            </div>

            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
                <button type="button" class="btn-cancel btn-standard" onclick="closeModal('versionEditModal')">取消</button>
                <button type="submit" id="btnSaveVerEdit" class="btn-primary btn-standard">保存</button>
            </div>
        </form>
    </div>
</div>

<!-- 2. 分类管理弹窗 (标准 S 档 440px) -->
<div id="categoryModal" class="custom-modal" style="display:none;">
    <div class="modal-dialog-box modal-sm">
        <div class="modal-head">
            <h4 id="catModalTitle">新建文件夹</h4>
            <button type="button" class="close-x" onclick="closeModal('categoryModal')" title="关闭"><i class="ri-close-line"></i></button>
        </div>
        <form onsubmit="handleCategorySave(event)" novalidate>
            <input type="hidden" id="catId" value="0">
            <div class="m-form-group">
                <label class="m-label">文件夹名称 <span class="req-star">*</span></label>
                <input type="text" id="catName" class="m-input" placeholder="输入文件夹名称" required maxlength="20">
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
                <button type="button" class="btn-cancel btn-standard" onclick="closeModal('categoryModal')">取消</button>
                <button type="submit" class="btn-primary btn-standard">保存</button>
            </div>
        </form>
    </div>
</div>

<!-- 3. 新建/编辑项目与外链弹窗 (标准 M 档 540px) -->
<div id="itemModal" class="custom-modal" style="display:none;">
    <div class="modal-dialog-box modal-md">
        <div class="modal-head">
            <h4 id="itemModalTitle">新建项目</h4>
            <button type="button" class="close-x" onclick="closeModal('itemModal')" title="关闭"><i class="ri-close-line"></i></button>
        </div>
        <form onsubmit="handleItemSave(event)" novalidate>
            <input type="hidden" id="editItemId" value="0">
            <input type="hidden" id="itemType" value="project">
            
            <div class="m-form-group">
                <label class="m-label">所属文件夹 <span class="req-star">*</span></label>
                <select id="itemCatSelect" class="m-input" required>
                    <?php foreach ($cats as $c): ?>
                        <option value="<?php echo $c['id']; ?>"><?php echo htmlspecialchars($c['name']); ?></option>
                    <?php endforeach; ?>
                </select>
            </div>

            <div class="m-form-group">
                <label class="m-label" id="itemNameLabel">项目名称 <span class="req-star">*</span></label>
                <input type="text" id="itemName" class="m-input" placeholder="输入项目名称" required maxlength="40">
            </div>

            <?php if ($isAdmin): ?>
            <div class="m-form-group" id="itemAuthorGroup" style="display:none;">
                <label class="m-label">项目负责人 <span class="req-star">*</span></label>
                <select id="itemCreatedBy" class="m-input">
                    <option value="" disabled>请选择负责人</option>
                    <?php foreach ($allUsers as $u): ?>
                        <?php if (!in_array($u['role'], ['admin', 'editor'])) continue; ?>
                        <option value="<?php echo $u['id']; ?>"><?php echo htmlspecialchars(!empty($u['name']) ? $u['name'] . ' (' . $u['email'] . ')' : $u['email']); ?><?php echo $u['role'] === 'admin' ? ' (管理员)' : ''; ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <?php endif; ?>

            <div id="linkFields" style="display:none;">
                <div class="m-form-group">
                    <label class="m-label">链接地址 <span class="req-star">*</span></label>
                    <input type="text" id="itemLinkUrl" class="m-input" placeholder="https://..." maxlength="2000">
                </div>
                <div class="m-form-group">
                    <label class="m-label">打开方式</label>
                    <select id="itemLinkTarget" class="m-input">
                        <option value="_blank">新标签页打开</option>
                        <option value="myFrame">在工作区内嵌入</option>
                    </select>
                </div>
            </div>

            <div class="m-form-group" id="itemWebhookGroup">
                <label class="m-label">
                    <span>项目群通知</span>
                    <span class="opt-tag">选填</span>
                </label>
                <div class="m-form-row">
                    <input type="text" id="itemWebhookUrl" class="m-input" placeholder="企微 / 飞书 / 钉钉群机器人 Webhook 地址" style="flex:1" maxlength="1000">
                    <button type="button" class="btn-cancel btn-standard" onclick="testAnyWebhook('itemWebhookUrl', this)">
                        <i class="ri-send-plane-line"></i> 测试
                    </button>
                </div>
                <div style="font-size:11.5px;color:var(--text-3);margin-top:5px;line-height:1.4;">接收该项目发版与新批注通知；钉钉/飞书安全设置勾选「自定义关键词」，填入：<strong>立象原型</strong></div>
            </div>

            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
                <button type="button" class="btn-cancel btn-standard" onclick="closeModal('itemModal')">取消</button>
                <button type="submit" class="btn-primary btn-standard" id="btnItemSubmit">保存</button>
            </div>
        </form>
    </div>
</div>
<?php endif; ?>

<!-- 3.1 原型分享设置弹窗 (标准 M 档 540px) -->
<div id="shareManageModal" class="custom-modal" style="display:none;">
    <div class="modal-dialog-box modal-md" style="max-height:88vh; display:flex; flex-direction:column; padding: 22px 24px;">
        <div class="modal-head" style="margin-bottom: 16px; padding-bottom: 12px; flex-shrink:0;">
            <div style="display:flex;align-items:center;min-width:0;">
                <h4 style="margin:0;font-size:15.5px;font-weight:600;color:var(--text-1);">分享设置</h4>
                <span id="shareItemName" style="font-size:12.5px;color:var(--text-2);background:var(--canvas);border:1px solid var(--border);padding:2px 8px;border-radius:4px;margin-left:8px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
            </div>
            <button type="button" class="close-x" onclick="closeModal('shareManageModal')" title="关闭"><i class="ri-close-line"></i></button>
        </div>

        <input type="hidden" id="shareItemId" value="0">

        <!-- 弹窗可滚动主体区 -->
        <div style="flex:1; overflow-y:auto; padding-right:2px; margin-right:-2px;">
            <!-- 模块 1: 默认公共直链 (长效稳定) -->
            <div style="margin-bottom: 20px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                    <div style="font-size:13px;font-weight:600;color:var(--text-1);display:inline-flex;align-items:center;gap:6px;">
                        <i class="ri-links-line" style="color:var(--primary);"></i> 默认公共链接
                    </div>
                    <span style="font-size:11.5px;color:var(--text-3);">跟随项目默认版本</span>
                </div>

                <!-- 默认短参直链展示与快捷复制 -->
                <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;">
                    <input type="text" id="shareUrlDisplay" class="m-input" readonly style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;flex:1;background:var(--canvas);color:var(--text-1)" onclick="this.select()">
                    <button type="button" class="btn-primary btn-standard" id="btnCopyShareModal" onclick="copyFromShareModal()">
                        <i class="ri-file-copy-line"></i> 复制
                    </button>
                    <a href="javascript:void(0)" id="btnOpenSharePreview" target="_blank" class="btn-cancel btn-standard" style="color:var(--text-2)" title="新标签页打开"><i class="ri-external-link-line"></i></a>
                </div>

                <!-- 默认密码 -->
                <div data-share-manage style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
                    <label class="m-label share-form-label">访问密码 <span class="opt-tag">选填</span></label>
                    <div class="m-form-row" style="flex:1">
                        <input type="text" id="sharePasswordInput" class="m-input" placeholder="留空免密" style="flex:1" maxlength="16">
                        <button type="button" class="btn-cancel btn-standard" onclick="generateRandomSharePwd()">随机</button>
                    </div>
                </div>

                <!-- 默认外链状态开关与保存 -->
                <div data-share-manage style="display:flex;align-items:center;justify-content:space-between;padding-top:2px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <label class="m-label share-form-label">公共链接访问</label>
                        <label class="switch-control" style="margin:0;">
                            <input type="checkbox" id="shareEnabledSwitch" checked onchange="onShareSwitchChange(this.checked)">
                            <span class="switch-slider"></span>
                            <span class="switch-label-text" id="shareEnabledText" style="color:var(--success);font-weight:500;">允许访问</span>
                        </label>
                    </div>
                    <button type="button" class="btn-cancel btn-standard" id="btnSaveDefaultShare" onclick="saveShareSettingsFromModal()">
                        <i class="ri-save-line"></i> 保存
                    </button>
                </div>
            </div>

            <!-- 分割线 -->
            <div style="height:1px;background:var(--border);margin-bottom:18px;"></div>

            <!-- 模块 2: 专属外发分享与生效中记录表 -->
            <div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                    <div style="font-size:13px;font-weight:600;color:var(--text-1);display:inline-flex;align-items:center;gap:6px;">
                        <i class="ri-shield-user-line" style="color:var(--primary);"></i> 专属外发链接
                        <span id="activeShareBadge" style="font-size:11px;font-weight:600;color:var(--primary);background:var(--primary-subtle);padding:1px 6px;border-radius:10px;">0 条生效中</span>
                    </div>
                    <button type="button" class="btn-act" id="btnToggleNewCustomShare" onclick="toggleCustomSharePanel()" title="创建专属外发链接">
                        <i class="ri-add-line"></i>
                    </button>
                </div>

                <!-- 创建专属分享轻量展开面板 -->
                <div id="customShareCreatePanel" style="display:none;background:var(--canvas);border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin-bottom:14px;">
                    <div style="font-size:12.5px;font-weight:600;color:var(--text-1);margin-bottom:10px;">创建专属链接</div>
                    <div style="display:flex;flex-direction:column;gap:10px;">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <label class="m-label share-form-label">分享备注 <span class="opt-tag">选填</span></label>
                            <input type="text" id="customShareLabelInput" class="m-input" placeholder="如：客户评审" style="flex:1" maxlength="20">
                        </div>
                        <div style="display:flex;align-items:center;gap:10px;">
                            <label class="m-label share-form-label">访问密码 <span class="opt-tag">选填</span></label>
                            <div class="m-form-row" style="flex:1">
                                <input type="text" id="customSharePwdInput" class="m-input" placeholder="留空免密" style="flex:1" maxlength="16">
                                <button type="button" class="btn-cancel btn-standard" style="color:var(--text-2)" onclick="generateRandomCustomSharePwd()">随机</button>
                            </div>
                        </div>
                        <div style="display:flex;align-items:center;gap:10px;">
                            <label class="m-label share-form-label">有效期限</label>
                            <div style="flex:1;">
                                <select id="customShareExpirePreset" class="m-input" style="width:100%" onchange="onCustomShareExpirePresetChange(this.value)">
                                    <option value="7d">7 天</option>
                                    <option value="30d">30 天</option>
                                    <option value="custom">指定截止日期...</option>
                                    <option value="forever">永久有效</option>
                                </select>
                                <div id="customShareDateGroup" hidden class="m-form-group share-date-group"><label class="m-label" for="customShareExpireCustomDate">截止日期 <span class="req-star">*</span></label><input type="date" id="customShareExpireCustomDate" class="m-input"></div>
                            </div>
                        </div>
                        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px;">
                            <button type="button" class="btn-cancel btn-standard" onclick="toggleCustomSharePanel(false)">取消</button>
                            <button type="button" class="btn-primary btn-standard" id="btnSubmitCustomShare" onclick="submitCreateCustomShare()">
                                <i class="ri-check-line"></i> 创建并复制
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 生效中专属链接记录表容器 -->
                <div id="activeShareListContainer" style="display:flex;flex-direction:column;gap:8px;padding-bottom:12px;">
                    <!-- 由 JS 渲染生效中记录或空状态 -->
                </div>
            </div>
        </div>
    </div>
</div>

<?php if ($canManage): ?>
<!-- ===================== 4. 专业管理控制中心 (左侧导航 + 右侧主设置面板) ===================== -->
<div id="adminConsoleModal" class="admin-console-modal" aria-label="控制中心" style="display:none;">
    <div class="admin-console-box">
        <!-- 左侧二级功能导航 -->
        <div class="admin-nav">
            <div class="admin-nav-header">
                <i class="ri-dashboard-2-line" style="font-size:18px;color:var(--primary);"></i>
                <div style="font-weight:600;font-size:14px;color:var(--text-1);">控制中心</div>
            </div>
            <div class="admin-nav-body">
                <button type="button" class="admin-nav-item" id="nav-dashboard" onclick="switchAdminTab('dashboard')">
                    <i class="ri-dashboard-3-line"></i>
                    <span>数据概览</span>
                </button>
                <button type="button" class="admin-nav-item" id="nav-overview" onclick="switchAdminTab('overview')">
                    <i class="ri-layout-grid-line"></i>
                    <span>项目管理</span>
                </button>
                <button type="button" class="admin-nav-item" id="nav-users" onclick="switchAdminTab('users')">
                    <i class="ri-group-line"></i>
                    <span>团队成员</span>
                    <span id="pendingUserBadge" style="<?php echo ($isAdmin && $pendingUserCount > 0) ? '' : 'display:none;'; ?>margin-left:auto;background:var(--warning);color:#fff;border-radius:10px;padding:1px 6px;font-size:11px;font-weight:600;"><?php echo $pendingUserCount; ?></span>
                </button>
                <?php if ($isAdmin): ?>
                <button type="button" class="admin-nav-item" id="nav-roles" onclick="switchAdminTab('roles')">
                    <i class="ri-shield-user-line"></i>
                    <span>角色权限</span>
                </button>
                <button type="button" class="admin-nav-item" id="nav-brand" onclick="switchAdminTab('brand')">
                    <i class="ri-settings-4-line"></i>
                    <span>系统设置</span>
                </button>
                <button type="button" class="admin-nav-item" id="nav-logs" onclick="switchAdminTab('logs')">
                    <i class="ri-file-list-3-line"></i>
                    <span>系统日志</span>
                </button>
                <?php endif; ?>
            </div>
            <div class="admin-nav-footer">
                <span style="font-size:12px;color:var(--text-3);">立象原型 v<?php echo APP_VERSION; ?></span>
            </div>
        </div>

        <!-- 右侧主体面板内容区 -->
        <div class="admin-content">
            <div class="admin-content-header">
                <div style="font-weight:600;font-size:15px;color:var(--text-1);" id="adminPanelTitle">数据概览</div>
                <div class="form-save-state roles-save-state"><span id="rolesSaveStatus" role="status" aria-live="polite"></span><button type="button" class="btn-cancel btn-sm" id="rolesSaveRetry" hidden onclick="retryAutoSave('save_role_permissions')">重试</button></div>
                <div class="form-save-state settings-save-state"><span id="settingsSaveStatus" role="status" aria-live="polite"></span><button type="button" class="btn-cancel btn-sm" id="settingsSaveRetry" hidden onclick="retryAutoSave('save_settings')">重试</button></div>
                <button type="button" class="close-x" onclick="closeAdminConsole()" title="关闭"><i class="ri-close-line"></i></button>
            </div>
            
            <div class="admin-content-body">
                <?php
                // ===================== 数据概览深度统计 (零依赖·纯原生) =====================
                $totalProjCount = count($itemsRaw);
                $totalVerCount = count($versionsRaw);
                $totalRpCount = 0;
                foreach ($versionsRaw as $v) {
                    if (!empty($v['rp_file'])) $totalRpCount++;
                }
                $totalUserCount = count($allUsers);
                $totalCatCount = count($cats);

                // 基于业务版本实体精准聚合存储 (0毫秒·免递归扫盘)
                $storageRow = $db->query("SELECT SUM(file_size) as total_html, SUM(rp_size) as total_rp FROM versions")->fetch();
                $bytesHtml = (int)($storageRow['total_html'] ?? 0);
                $bytesRp = (int)($storageRow['total_rp'] ?? 0);
                $bytesOther = (file_exists(DB_FILE) ? (int)filesize(DB_FILE) : 0);
                $bytesTotal = $bytesHtml + $bytesRp + $bytesOther;

                $fmtStorage = function($b) {
                    if ($b <= 0) return '0 B';
                    if ($b < 1024) return $b . ' B';
                    if ($b < 1048576) {
                        $kb = $b / 1024;
                        return ($kb >= 10 ? round($kb) : number_format($kb, 1)) . ' KB';
                    }
                    if ($b < 1073741824) {
                        return number_format($b / 1048576, 1) . ' MB';
                    }
                    return number_format($b / 1073741824, 2) . ' GB';
                };

                $strTotalStorage = $fmtStorage($bytesTotal);
                $strHtmlStorage = $fmtStorage($bytesHtml);
                $strRpStorage = $fmtStorage($bytesRp);
                $strOtherStorage = $fmtStorage($bytesOther);

                $pctHtml = 0;
                $pctRp = 0;
                $pctOther = 0;
                if ($bytesTotal > 0) {
                    $pctHtml = $bytesHtml > 0 ? round(($bytesHtml / $bytesTotal) * 100, 1) : 0;
                    $pctRp = $bytesRp > 0 ? round(($bytesRp / $bytesTotal) * 100, 1) : 0;
                    if ($bytesOther > 0) {
                        $pctOther = max(0, 100 - $pctHtml - $pctRp);
                    }
                }

                // 近 30 天迭代发版数
                $recentVerCount = 0;
                try {
                    $since30dUtc = gmdate('Y-m-d H:i:s', strtotime('-30 days'));
                    $rVcStmt = $db->prepare("SELECT COUNT(*) as c FROM versions WHERE created_at >= ?");
                    $rVcStmt->execute([$since30dUtc]);
                    $rVc = $rVcStmt->fetch();
                    $recentVerCount = $rVc ? (int)$rVc['c'] : 0;
                } catch (\Exception $e) {}

                // 建立分类映射与项目字典
                $catMap = [];
                foreach ($cats as $c) { $catMap[$c['id']] = $c['name']; }
                $itemInfoMap = [];
                foreach ($itemsRaw as $it) {
                    $itemInfoMap[$it['id']] = [
                        'name' => $it['name'],
                        'cat_name' => $catMap[$it['category_id']] ?? '文件夹'
                    ];
                }

                // 近 7 天查阅走势 (支持审阅人/协作者/外发访客多角色透视)
                $trendDays = [];
                $todayKey = date('Y-m-d');
                for ($i = 6; $i >= 0; $i--) {
                    $dStr = date('Y-m-d', strtotime("-$i days"));
                    $trendDays[$dStr] = [
                        'date' => $dStr,
                        'label' => ($i === 0) ? '今日' : date('m/d', strtotime("-$i days")),
                        'pv' => 0,
                        'pv_viewer' => 0,
                        'pv_editor' => 0,
                        'pv_share' => 0
                    ];
                }

                // 近 30 天查阅走势 (多角色透视)
                $trendMonthDays = [];
                for ($i = 29; $i >= 0; $i--) {
                    $dStr = date('Y-m-d', strtotime("-$i days"));
                    $trendMonthDays[$dStr] = [
                        'date' => $dStr,
                        'label' => ($i === 0) ? '今日' : (($i % 6 === 0) ? date('m/d', strtotime("-$i days")) : ''),
                        'pv' => 0,
                        'pv_viewer' => 0,
                        'pv_editor' => 0,
                        'pv_share' => 0
                    ];
                }

                // 24 小时查阅时段分布 (00:00 ~ 23:00)
                $hoursDist = [];
                for ($h = 0; $h < 24; $h++) {
                    $hStr = sprintf('%02d', $h);
                    $hoursDist[$hStr] = [
                        'hour' => $h,
                        'label' => $hStr,
                        'pv' => 0
                    ];
                }

                $sinceLogsUtc = gmdate('Y-m-d H:i:s', strtotime('-31 days'));
                try {
                    $stmtLogs = $db->prepare("SELECT created_at, role FROM access_logs WHERE created_at >= ?");
                    $stmtLogs->execute([$sinceLogsUtc]);
                    while ($r = $stmtLogs->fetch()) {
                        $ts = !empty($r['created_at']) ? strtotime($r['created_at'] . ' UTC') : 0;
                        if (!$ts) continue;
                        $d = date('Y-m-d', $ts);
                        $rRole = strtolower((string)($r['role'] ?? ''));
                        if (isset($trendMonthDays[$d])) {
                            $trendMonthDays[$d]['pv']++;
                            if ($rRole === 'viewer') {
                                $trendMonthDays[$d]['pv_viewer']++;
                            } elseif ($rRole === 'admin' || $rRole === 'editor') {
                                $trendMonthDays[$d]['pv_editor']++;
                            } else {
                                $trendMonthDays[$d]['pv_share']++;
                            }
                        }
                        if (isset($trendDays[$d])) {
                            $trendDays[$d]['pv']++;
                            if ($rRole === 'viewer') {
                                $trendDays[$d]['pv_viewer']++;
                            } elseif ($rRole === 'admin' || $rRole === 'editor') {
                                $trendDays[$d]['pv_editor']++;
                            } else {
                                $trendDays[$d]['pv_share']++;
                            }
                        }
                        $hStr = date('H', $ts);
                        if (isset($hoursDist[$hStr])) {
                            $hoursDist[$hStr]['pv']++;
                        }
                    }
                } catch (\Exception $e) {}

                $totalWeekPv = 0;
                $maxPv = 1;
                foreach ($trendDays as $td) {
                    $totalWeekPv += $td['pv'];
                    if ($td['pv'] > $maxPv) $maxPv = $td['pv'];
                }
                $todayPv = $trendDays[$todayKey]['pv'] ?? 0;

                $totalMonthPv = 0;
                $maxMonthPv = 1;
                foreach ($trendMonthDays as $md) {
                    $totalMonthPv += $md['pv'];
                    if ($md['pv'] > $maxMonthPv) $maxMonthPv = $md['pv'];
                }

                // 近 30 天原型热度排行榜 Top 5 (统计起点与 30 天走势图首日零点严格对齐)
                $topRankItems = [];
                $monthDayKeys = array_keys($trendMonthDays);
                $rankStartUtc = !empty($monthDayKeys) ? gmdate('Y-m-d H:i:s', strtotime($monthDayKeys[0] . ' 00:00:00')) : $sinceLogsUtc;
                try {
                    $rankStmt = $db->prepare("
                        SELECT item_id, item_name, COUNT(*) as pv_cnt, MAX(created_at) as last_seen
                        FROM access_logs
                        WHERE created_at >= ? AND item_id > 0
                        GROUP BY item_id
                        ORDER BY pv_cnt DESC
                        LIMIT 5
                    ");
                    $rankStmt->execute([$rankStartUtc]);
                    $rankRows = $rankStmt->fetchAll();
                    if ($rankRows) {
                        foreach ($rankRows as $rk) {
                            $itemId = (int)$rk['item_id'];
                            $name = !empty($itemInfoMap[$itemId]['name']) ? $itemInfoMap[$itemId]['name'] : $rk['item_name'];
                            $catName = !empty($itemInfoMap[$itemId]['cat_name']) ? $itemInfoMap[$itemId]['cat_name'] : '';
                            $topRankItems[] = [
                                'item_id' => $itemId,
                                'name' => $name,
                                'cat_name' => $catName,
                                'pv_cnt' => (int)$rk['pv_cnt'],
                                'last_seen' => !empty($rk['last_seen']) ? Auth::toLocalTime($rk['last_seen']) : ''
                            ];
                        }
                    }
                } catch (\Exception $e) {}
                $maxRankPv = (!empty($topRankItems) && $topRankItems[0]['pv_cnt'] > 0) ? (int)$topRankItems[0]['pv_cnt'] : 1;


                $maxHourPv = 1;
                $peakHourStr = '';
                $peakHourPv = 0;
                foreach ($hoursDist as $hd) {
                    if ($hd['pv'] > $maxHourPv) $maxHourPv = $hd['pv'];
                    if ($hd['pv'] > $peakHourPv) {
                        $peakHourPv = $hd['pv'];
                        $peakHourStr = sprintf('%02d:00 - %02d:00', $hd['hour'], ($hd['hour'] + 1) % 24);
                    }
                }

                // 全站累计查阅总数
                $totalAllPv = 0;
                try {
                    $allPvRow = $db->query("SELECT COUNT(*) as c FROM access_logs")->fetch();
                    $totalAllPv = $allPvRow ? (int)$allPvRow['c'] : 0;
                } catch (\Exception $e) {}

                // 最近上传 / 迭代动态 (Top 5)
                $recentUploads = [];
                try {
                    $upRows = $db->query("
                        SELECT v.id, v.item_id, v.version_name, v.rp_file, v.created_at,
                               i.name as item_name, i.category_id,
                               u.name as author_name, u.email as author_email
                        FROM versions v
                        LEFT JOIN items i ON v.item_id = i.id
                        LEFT JOIN users u ON v.created_by = u.id
                        ORDER BY v.created_at DESC, v.id DESC
                        LIMIT 5
                    ")->fetchAll();
                    if ($upRows) {
                        $todayStr = date('Y-m-d');
                        $yesterdayStr = date('Y-m-d', strtotime('-1 day'));
                        foreach ($upRows as $ur) {
                            $author = !empty($ur['author_name']) ? $ur['author_name'] : (!empty($ur['author_email']) ? $ur['author_email'] : '-');
                            $catName = $catMap[$ur['category_id']] ?? '';
                            $ts = !empty($ur['created_at']) ? strtotime($ur['created_at'] . ' UTC') : 0;
                            $dStr = $ts ? date('Y-m-d', $ts) : '';
                            if ($dStr === $todayStr) {
                                $timeFmt = '今天 ' . date('H:i', $ts);
                            } elseif ($dStr === $yesterdayStr) {
                                $timeFmt = '昨天 ' . date('H:i', $ts);
                            } elseif ($ts) {
                                $timeFmt = date('m-d', $ts);
                            } else {
                                $timeFmt = '-';
                            }

                            $recentUploads[] = [
                                'ver_id' => (int)$ur['id'],
                                'item_id' => (int)$ur['item_id'],
                                'version_name' => $ur['version_name'],
                                'item_name' => $ur['item_name'] ?? '未命名项目',
                                'cat_name' => $catName,
                                'has_rp' => !empty($ur['rp_file']),
                                'author' => $author,
                                'time_str' => $timeFmt
                            ];
                        }
                    }
                } catch (\Exception $e) {}

                // 全站批注待办与评审闭环数据
                $dashboardAnnoList = [];
                $projectFilterList = [];
                try {
                    $annoRows = $db->query("
                        SELECT a.id, a.item_id, a.ver_id, a.page_title, a.status, a.created_at,
                               i.name as item_name, v.version_name
                        FROM annotations a
                        LEFT JOIN items i ON a.item_id = i.id
                        LEFT JOIN versions v ON a.ver_id = v.id
                        ORDER BY a.created_at DESC
                    ")->fetchAll();
                    if ($annoRows) {
                        foreach ($annoRows as $ar) {
                            $dashboardAnnoList[] = [
                                'id' => (int)$ar['id'],
                                'item_id' => (int)$ar['item_id'],
                                'item_name' => $ar['item_name'] ?? '未命名项目',
                                'ver_id' => (int)$ar['ver_id'],
                                'ver_name' => $ar['version_name'] ?? '默认版本',
                                'page_title' => !empty($ar['page_title']) ? $ar['page_title'] : '未命名子页面',
                                'status' => (int)$ar['status']
                            ];
                        }
                    }

                    // 提取所有有版本的原型项目与其版本列表
                    foreach ($itemsRaw as $it) {
                        if ($it['type'] === 'project') {
                            $vList = $itemVersions[$it['id']] ?? [];
                            $vers = [];
                            foreach ($vList as $v) {
                                $vers[] = ['id' => (int)$v['id'], 'name' => $v['version_name']];
                            }
                            $projectFilterList[] = [
                                'id' => (int)$it['id'],
                                'category_id' => (int)$it['category_id'],
                                'name' => $it['name'],
                                'versions' => $vers
                            ];
                        }
                    }
                } catch (\Exception $e) {}

                // 获取各分类下的项目数、版本数与查阅总数 (第四层分类明细与基础数据概览)
                $categoryStats = [];
                try {
                    $catRows = $db->query("
                        SELECT c.id, c.name, 
                               COUNT(DISTINCT i.id) as proj_count, 
                               COUNT(DISTINCT v.id) as ver_count,
                               COUNT(DISTINCT al.id) as pv_count
                        FROM categories c
                        LEFT JOIN items i ON c.id = i.category_id
                        LEFT JOIN versions v ON i.id = v.item_id
                        LEFT JOIN access_logs al ON (al.item_id = i.id AND al.item_id > 0)
                        GROUP BY c.id
                        ORDER BY c.sort_order ASC, c.id ASC
                    ")->fetchAll();
                    if ($catRows) {
                        foreach ($catRows as $cr) {
                            $categoryStats[] = [
                                'id' => (int)$cr['id'],
                                'name' => $cr['name'],
                                'proj_count' => (int)$cr['proj_count'],
                                'ver_count' => (int)$cr['ver_count'],
                                'pv_count' => (int)$cr['pv_count']
                            ];
                        }
                    }
                } catch (\Exception $e) {}
                $maxCatProj = 0;
                foreach ($categoryStats as $cs) {
                    if ($cs['proj_count'] > $maxCatProj) $maxCatProj = $cs['proj_count'];
                }
                ?>

                <!-- 面板 0: 数据概览 (置顶独立大盘 · 对称美学与业务对撞流) -->
                <div id="panel-dashboard" class="admin-panel active">
                    <!-- 上层: 4 核心指标卡 (资产规模 -> 受众热度 -> 团队协作 -> 存储底座) -->
                    <div class="stat-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom:12px; gap:10px;">
                        <div class="stat-card" style="padding:13px 15px;background:var(--surface);border:1px solid var(--border);">
                            <div class="stat-card-title"><i class="ri-apps-line"></i> 托管资产</div>
                            <div class="stat-card-val" style="font-size:18px;font-weight:700;margin:5px 0 2px;color:var(--text-1);"><?php echo $totalProjCount; ?> <span style="font-size:12px;font-weight:500;color:var(--text-3);">项目</span> · <?php echo $totalVerCount; ?> <span style="font-size:12px;font-weight:500;color:var(--text-3);">版本</span></div>
                            <div style="font-size:11.5px;color:var(--text-3);">近30天发布 <?php echo $recentVerCount; ?> 个版本</div>
                        </div>
                        <div class="stat-card" style="padding:13px 15px;background:var(--surface);border:1px solid var(--border);">
                            <div class="stat-card-title"><i class="ri-eye-line"></i> 累计查阅</div>
                            <div class="stat-card-val" style="font-size:18px;font-weight:700;margin:5px 0 2px;color:var(--text-1);"><?php echo number_format($totalAllPv); ?> <span style="font-size:12px;font-weight:500;color:var(--text-3);">次</span></div>
                            <div style="font-size:11.5px;color:var(--text-3);">近7天 +<?php echo number_format($totalWeekPv); ?> · 今日 +<?php echo $todayPv; ?></div>
                        </div>
                        <div class="stat-card" style="padding:13px 15px;background:var(--surface);border:1px solid var(--border);">
                            <div class="stat-card-title"><i class="ri-group-line"></i> 协作团队</div>
                            <div class="stat-card-val" style="font-size:18px;font-weight:700;margin:5px 0 2px;color:var(--text-1);"><?php echo $totalUserCount; ?> <span style="font-size:12px;font-weight:500;color:var(--text-3);">位成员</span></div>
                            <div style="font-size:11.5px;color:var(--text-3);"><?php echo $totalCatCount; ?> 个工作文件夹</div>
                        </div>
                        <div class="stat-card" style="padding:13px 15px;background:var(--surface);border:1px solid var(--border);">
                            <div class="stat-card-title"><i class="ri-hard-drive-2-line"></i> 存储占用</div>
                            <div class="stat-card-val" style="font-size:18px;font-weight:700;margin:5px 0 2px;color:var(--text-1);"><?php echo htmlspecialchars($strTotalStorage); ?></div>
                            <div style="font-size:11.5px;color:var(--text-3);">归档 <?php echo $totalRpCount; ?> 份 RP 源文件</div>
                        </div>
                    </div>

                    <!-- 第二层: 双栏业务图谱 (批注待办与闭环 vs 查阅走势多角色堆叠图 · ECharts 驱动) -->
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                        <!-- 左侧: 批注待办与评审闭环 (支持按项目/版本向下钻取) -->
                        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:13px 15px;display:flex;flex-direction:column;justify-content:space-between;">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;">
                                <span style="font-size:13px;font-weight:600;color:var(--text-1);">批注待办与闭环</span>
                                <div style="display:flex;align-items:center;gap:6px;">
                                    <select id="filterAnnoProject" class="m-select-sm dashboard-project-filter" onchange="onAnnoProjectFilterChange(this.value)" title="按项目筛选">
                                        <option value="0">全部项目</option>
                                        <?php foreach ($projectFilterList as $pf): ?>
                                            <option value="<?php echo $pf['id']; ?>" data-cat-id="<?php echo (int)$pf['category_id']; ?>"><?php echo htmlspecialchars($pf['name']); ?></option>
                                        <?php endforeach; ?>
                                    </select>
                                    <select id="filterAnnoVersion" class="m-select-sm dashboard-version-filter" onchange="onAnnoVersionFilterChange(this.value)" style="display:none;" title="按版本筛选">
                                        <option value="0">全部版本</option>
                                    </select>
                                </div>
                            </div>
                            <div style="display:flex;align-items:center;height:140px;gap:10px;">
                                <div style="position:relative;width:125px;height:140px;flex-shrink:0;">
                                    <div id="chartAnnotationDonut" style="width:100%;height:100%;"></div>
                                    <div id="chartDonutCenterText" style="position:absolute;top:50%;left:50%;transform:translate(-50%, -50%);text-align:center;pointer-events:none;width:100%;line-height:1.15;">
                                        <div id="donutCenterRate" style="font-size:18px;font-weight:700;color:var(--text-1);">100%</div>
                                        <div id="donutCenterLabel" style="font-size:10px;color:var(--text-3);margin-top:2px;">闭环率</div>
                                    </div>
                                </div>
                                <div id="annoDetailBox" style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;height:100%;overflow:hidden;"></div>
                            </div>
                        </div>

                        <!-- 右侧: 查阅走势 (支持 7天 / 30天 切换 · 审阅人/协作者/外发访客多角色堆叠) -->
                        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:13px 15px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                                <div style="display:flex;align-items:center;gap:8px;">
                                    <span style="font-size:13px;font-weight:600;color:var(--text-1);" id="trendChartTitle">查阅走势</span>
                                    <span style="font-size:10.5px;color:var(--text-3);display:inline-flex;align-items:center;gap:6px;">
                                        <span style="display:inline-flex;align-items:center;gap:2px;"><i style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--success);"></i>内部审阅人</span>
                                        <span style="display:inline-flex;align-items:center;gap:2px;"><i style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--primary);"></i>管理与协作者</span>
                                        <span style="display:inline-flex;align-items:center;gap:2px;"><i style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--warning);"></i>外发访客</span>
                                    </span>
                                </div>
                                <div class="trend-tab-group">
                                    <button type="button" class="trend-tab-btn active" id="tabTrend7d" onclick="switchTrendRange('7d')">7天</button>
                                    <button type="button" class="trend-tab-btn" id="tabTrend30d" onclick="switchTrendRange('30d')">30天</button>
                                </div>
                            </div>
                            <div id="chartTrend" style="width:100%;height:140px;"></div>
                        </div>
                    </div>

                    <!-- 第三层: 核心业务脉搏 (1:1 严格对称双栏 · 最新发版 vs 最热查阅) -->
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
                        <!-- 左侧: 最近上传 (最新发版 Top 5) -->
                        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:13px 15px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                                <span style="font-size:13px;font-weight:600;color:var(--text-1);">最近上传</span>
                                <span style="font-size:11.5px;color:var(--text-3);">最新 5 项</span>
                            </div>

                            <div class="recent-upload-list" style="display:flex;flex-direction:column;gap:8px;">
                                <?php if (empty($recentUploads)): ?>
                                    <div style="text-align:center;padding:28px 0;color:var(--text-3);font-size:12px;">
                                        <i class="ri-history-line" style="font-size:18px;display:block;margin-bottom:4px;opacity:0.6;"></i>
                                        暂无版本上传记录
                                    </div>
                                <?php else: ?>
                                    <?php foreach ($recentUploads as $ur): ?>
                                    <div class="recent-upload-row">
                                        <span class="upload-ver-badge"><?php echo htmlspecialchars($ur['version_name']); ?></span>
                                        <span class="upload-item-title" title="<?php echo htmlspecialchars($ur['item_name']); ?>"><?php echo htmlspecialchars($ur['item_name']); ?></span>
                                        <?php if (!empty($ur['cat_name'])): ?>
                                            <span class="upload-item-cat"><?php echo htmlspecialchars($ur['cat_name']); ?></span>
                                        <?php endif; ?>
                                        <?php if ($ur['has_rp']): ?>
                                            <span class="upload-rp-badge" title="已归档 RP 原型底稿">RP</span>
                                        <?php endif; ?>
                                        <span class="upload-time"><?php echo htmlspecialchars($ur['time_str']); ?></span>
                                    </div>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </div>
                        </div>

                        <!-- 右侧: 原型热度排行 (近 30 天 Top 5) -->
                        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:13px 15px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                                <span style="font-size:13px;font-weight:600;color:var(--text-1);">热度排行</span>
                                <span style="font-size:11.5px;color:var(--text-3);">近 30 天</span>
                            </div>

                            <div class="rank-list" style="display:flex;flex-direction:column;gap:8px;">
                                <?php if (empty($topRankItems)): ?>
                                    <div style="text-align:center;padding:28px 0;color:var(--text-3);font-size:12px;">
                                        <i class="ri-bar-chart-line" style="font-size:18px;display:block;margin-bottom:4px;opacity:0.6;"></i>
                                        暂无项目查阅记录
                                    </div>
                                <?php else: ?>
                                    <?php
                                    $rkIdx = 1;
                                    foreach ($topRankItems as $rk): 
                                        $pct = $maxRankPv > 0 ? round(($rk['pv_cnt'] / $maxRankPv) * 100) : 0;
                                        $isTop3 = ($rkIdx <= 3);
                                        $badgeClass = $isTop3 ? 'rank-badge top' : 'rank-badge';
                                    ?>
                                    <div class="rank-item-row">
                                        <span class="<?php echo $badgeClass; ?>"><?php echo $rkIdx; ?></span>
                                        <span class="rank-item-title" title="<?php echo htmlspecialchars($rk['name']); ?>"><?php echo htmlspecialchars($rk['name']); ?></span>
                                        <?php if (!empty($rk['cat_name'])): ?>
                                            <span class="rank-item-cat"><?php echo htmlspecialchars($rk['cat_name']); ?></span>
                                        <?php endif; ?>
                                        <div class="rank-bar-bg">
                                            <div class="rank-bar-fill" style="width:<?php echo max(6, $pct); ?>%;"></div>
                                        </div>
                                        <span class="rank-item-cnt"><?php echo $rk['pv_cnt']; ?> <span style="font-size:10.5px;font-weight:normal;color:var(--text-3);">次</span></span>
                                    </div>
                                    <?php
                                        $rkIdx++;
                                    endforeach; 
                                    ?>
                                <?php endif; ?>
                            </div>
                        </div>
                    </div>

                    <!-- 第四层: 业务沉淀与资产底座 (1:1 严格对称双栏 · 业务分类 vs 物理存储) -->
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
                        <!-- 左侧: 文件夹 (分类项目分布) -->
                        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:13px 15px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                                <span style="font-size:13px;font-weight:600;color:var(--text-1);">文件夹</span>
                                <span style="font-size:11.5px;color:var(--text-3);"><?php echo $totalCatCount; ?> 个文件夹</span>
                            </div>

                            <div class="cat-stat-list" style="display:flex;flex-direction:column;gap:8px;">
                                <?php if (empty($categoryStats)): ?>
                                    <div style="text-align:center;padding:28px 0;color:var(--text-3);font-size:12px;">
                                        <i class="ri-folder-line" style="font-size:18px;display:block;margin-bottom:4px;opacity:0.6;"></i>
                                        暂无文件夹分类
                                    </div>
                                <?php else: ?>
                                    <?php foreach ($categoryStats as $cs): 
                                        $cBarPct = $maxCatProj > 0 ? round(($cs['proj_count'] / $maxCatProj) * 100) : 0;
                                    ?>
                                    <div class="cat-stat-row">
                                        <span class="cat-stat-name" title="<?php echo htmlspecialchars($cs['name']); ?>"><?php echo htmlspecialchars($cs['name']); ?></span>
                                        <div class="cat-stat-bar-bg">
                                            <div class="cat-stat-bar-fill" style="width:<?php echo max(8, $cBarPct); ?>%;"></div>
                                        </div>
                                        <span class="cat-stat-count"><?php echo $cs['proj_count']; ?> <span style="font-size:10.5px;font-weight:normal;color:var(--text-3);">项目</span> · <?php echo $cs['ver_count']; ?> <span style="font-size:10.5px;font-weight:normal;color:var(--text-3);">版本</span></span>
                                    </div>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </div>
                        </div>

                        <!-- 右侧: 存储空间深度拆解 -->
                        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:13px 15px;display:flex;flex-direction:column;justify-content:space-between;">
                            <div>
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                                    <span style="font-size:13px;font-weight:600;color:var(--text-1);">存储空间</span>
                                    <span style="font-size:13px;font-weight:600;color:var(--primary);"><?php echo htmlspecialchars($strTotalStorage); ?></span>
                                </div>

                                <!-- 分段彩色比例条 (5px) -->
                                <div style="height:5px;background:#e2e8f0;border-radius:3px;overflow:hidden;display:flex;margin-bottom:12px;">
                                    <?php if ($pctHtml > 0): ?>
                                        <div style="width:<?php echo $pctHtml; ?>%;background:var(--primary);height:100%;transition:width 0.3s;" title="HTML 预览包: <?php echo $pctHtml; ?>%"></div>
                                    <?php endif; ?>
                                    <?php if ($pctRp > 0): ?>
                                        <div style="width:<?php echo $pctRp; ?>%;background:#f59e0b;height:100%;transition:width 0.3s;" title="RP 源文件: <?php echo $pctRp; ?>%"></div>
                                    <?php endif; ?>
                                    <?php if ($pctOther > 0): ?>
                                        <div style="width:<?php echo $pctOther; ?>%;background:#94a3b8;height:100%;transition:width 0.3s;" title="数据库与媒体: <?php echo $pctOther; ?>%"></div>
                                    <?php endif; ?>
                                </div>
                            </div>

                            <!-- 空间清单 -->
                            <div style="display:flex;flex-direction:column;gap:6px;font-size:12px;">
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                    <span style="color:var(--text-2);display:inline-flex;align-items:center;gap:6px;">
                                        <span style="width:7px;height:7px;border-radius:50%;background:var(--primary);display:inline-block;"></span>
                                        <span>HTML 预览包</span>
                                    </span>
                                    <span style="font-weight:600;color:var(--text-1);"><?php echo htmlspecialchars($strHtmlStorage); ?> <span style="font-weight:400;color:var(--text-3);font-size:11px;">(<?php echo $pctHtml; ?>%)</span></span>
                                </div>
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                    <span style="color:var(--text-2);display:inline-flex;align-items:center;gap:6px;">
                                        <span style="width:7px;height:7px;border-radius:50%;background:var(--warning);display:inline-block;"></span>
                                        <span>RP 源文件</span>
                                    </span>
                                    <span style="font-weight:600;color:var(--text-1);"><?php echo htmlspecialchars($strRpStorage); ?> <span style="font-weight:400;color:var(--text-3);font-size:11px;">(<?php echo $pctRp; ?>%)</span></span>
                                </div>
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                    <span style="color:var(--text-2);display:inline-flex;align-items:center;gap:6px;">
                                        <span style="width:7px;height:7px;border-radius:50%;background:#94a3b8;display:inline-block;"></span>
                                        <span>数据库与媒体</span>
                                    </span>
                                    <span style="font-weight:600;color:var(--text-1);"><?php echo htmlspecialchars($strOtherStorage); ?> <span style="font-weight:400;color:var(--text-3);font-size:11px;">(<?php echo $pctOther; ?>%)</span></span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="chartCategoryDist" style="display:none;" aria-hidden="true"></div>
                    <script>
                    window.DASHBOARD_DATA = {
                        cats: <?php echo json_encode(array_values($categoryStats), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>,
                        annos: <?php echo json_encode($dashboardAnnoList, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>,
                        projects: <?php echo json_encode($projectFilterList, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>,
                        trend7d: {
                            labels: <?php echo json_encode(array_values(array_map(function($d){ return $d['label']; }, $trendDays))); ?>,
                            dates: <?php echo json_encode(array_keys($trendDays)); ?>,
                            values_total: <?php echo json_encode(array_values(array_map(function($d){ return $d['pv']; }, $trendDays))); ?>,
                            values_viewer: <?php echo json_encode(array_values(array_map(function($d){ return $d['pv_viewer']; }, $trendDays))); ?>,
                            values_editor: <?php echo json_encode(array_values(array_map(function($d){ return $d['pv_editor']; }, $trendDays))); ?>,
                            values_share: <?php echo json_encode(array_values(array_map(function($d){ return $d['pv_share']; }, $trendDays))); ?>
                        },
                        trend30d: {
                            labels: <?php echo json_encode(array_values(array_map(function($d){ return $d['label']; }, $trendMonthDays))); ?>,
                            dates: <?php echo json_encode(array_keys($trendMonthDays)); ?>,
                            values_total: <?php echo json_encode(array_values(array_map(function($d){ return $d['pv']; }, $trendMonthDays))); ?>,
                            values_viewer: <?php echo json_encode(array_values(array_map(function($d){ return $d['pv_viewer']; }, $trendMonthDays))); ?>,
                            values_editor: <?php echo json_encode(array_values(array_map(function($d){ return $d['pv_editor']; }, $trendMonthDays))); ?>,
                            values_share: <?php echo json_encode(array_values(array_map(function($d){ return $d['pv_share']; }, $trendMonthDays))); ?>
                        }
                    };
                    </script>
                </div>

                <!-- 面板 1: 项目管理 -->
                <div id="panel-overview" class="admin-panel">
                    <?php
                        $projectItems = array_values(array_filter($itemsRaw, function($it) { return $it['type'] === 'project'; }));
                        $linkItems = array_values(array_filter($itemsRaw, function($it) { return $it['type'] === 'link'; }));
                    ?>
                    <div class="stat-grid" style="grid-template-columns: repeat(4, 1fr);">
                        <div class="stat-card">
                            <div class="stat-card-title"><i class="ri-folder-line"></i> 文件夹</div>
                            <div class="stat-card-val"><?php echo count($cats); ?></div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-card-title"><i class="ri-pages-line"></i> 原型</div>
                            <div class="stat-card-val"><?php echo count($projectItems); ?></div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-card-title"><i class="ri-external-link-line"></i> 外链</div>
                            <div class="stat-card-val"><?php echo count($linkItems); ?></div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-card-title"><i class="ri-history-line"></i> 版本</div>
                            <div class="stat-card-val"><?php echo count($versionsRaw); ?></div>
                        </div>
                    </div>

                    <!-- 二级子 Tab 胶囊切换器与动态操作区 -->
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <div class="console-subtab-group user-subtab-group">
                            <button type="button" id="btnSubtabProjects" class="console-subtab-btn log-subtab-btn active" onclick="switchOverviewSubTab('projects')">原型项目</button>
                            <button type="button" id="btnSubtabLinks" class="console-subtab-btn log-subtab-btn" onclick="switchOverviewSubTab('links')">外部链接</button>
                            <button type="button" id="btnSubtabFolders" class="console-subtab-btn log-subtab-btn" onclick="switchOverviewSubTab('folders')">文件夹管理</button>
                        </div>
                        <div id="overviewActionsProjects" style="display:flex;gap:8px;align-items:center;">
                            <select id="filterProjectCategory" class="m-select-md" onchange="filterProjectsByCategory(this.value)" style="min-width:130px;" title="筛选文件夹以聚焦调序">
                                <option value="0">全部文件夹</option>
                                <?php foreach ($cats as $c): ?>
                                    <option value="<?php echo $c['id']; ?>"><?php echo htmlspecialchars($c['name']); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <button type="button" class="btn-primary btn-md" onclick="openItemModal(0, <?php echo !empty($cats) ? $cats[0]['id'] : 0; ?>, 'project')"><i class="ri-add-line"></i> 新建项目</button>
                        </div>
                        <div id="overviewActionsLinks" style="display:none;gap:8px;align-items:center;">
                            <select id="filterLinkCategory" class="m-select-md" onchange="filterLinksByCategory(this.value)" style="min-width:130px;" title="筛选文件夹以聚焦调序">
                                <option value="0">全部文件夹</option>
                                <?php foreach ($cats as $c): ?>
                                    <option value="<?php echo $c['id']; ?>"><?php echo htmlspecialchars($c['name']); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <button type="button" class="btn-primary btn-md" onclick="openItemModal(0, <?php echo !empty($cats) ? $cats[0]['id'] : 0; ?>, 'link')"><i class="ri-add-line"></i> 新建外链</button>
                        </div>
                        <div id="overviewActionsFolders" style="display:none;gap:8px;align-items:center;">
                            <button type="button" class="btn-primary btn-md" onclick="openCategoryModal()"><i class="ri-folder-add-line"></i> 新建文件夹</button>
                        </div>
                    </div>

                    <!-- 1. 原型项目列表表格容器 -->
                    <div id="overviewTableProjects" style="border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;">
                        <table style="width:100%;border-collapse:collapse;font-size:13px;">
                            <thead>
                                <tr style="background:var(--canvas);text-align:left;color:var(--text-2);border-bottom:1px solid var(--border);">
                                    <th style="padding:9px 12px;">项目</th>
                                    <th style="padding:9px 12px;">所属文件夹</th>
                                    <th style="padding:9px 12px;">负责人</th>
                                    <th style="padding:9px 12px;">当前版本</th>
                                    <th style="padding:9px 12px;">历史版本</th>
                                    <th style="padding:9px 12px;text-align:right;">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if (empty($projectItems)): ?>
                                    <tr class="empty-projects-row"><td colspan="6" style="padding:44px 20px;text-align:center;">
                                        <svg width="120" height="96" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">
                                            <circle cx="16" cy="18" r="1.5" fill="#cbd5e1"/>
                                            <circle cx="104" cy="18" r="1.5" fill="#cbd5e1"/>
                                            <circle cx="16" cy="78" r="1.5" fill="#cbd5e1"/>
                                            <circle cx="104" cy="78" r="1.5" fill="#cbd5e1"/>
                                            <rect x="34" y="20" width="56" height="46" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2" transform="rotate(3 62 43)"/>
                                            <rect x="30" y="24" width="56" height="46" rx="6" fill="#ffffff" stroke="#94a3b8" stroke-width="1.4"/>
                                            <line x1="30" y1="34" x2="86" y2="34" stroke="#f1f5f9" stroke-width="1"/>
                                            <circle cx="36" cy="29" r="1.5" fill="#e2e8f0"/>
                                            <circle cx="40.5" cy="29" r="1.5" fill="#e2e8f0"/>
                                            <circle cx="45" cy="29" r="1.5" fill="#e2e8f0"/>
                                            <rect x="37" y="40" width="18" height="4" rx="1.5" fill="#0076de" fill-opacity="0.2"/>
                                            <rect x="37" y="48" width="18" height="12" rx="3" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
                                            <rect x="59" y="48" width="18" height="12" rx="3" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
                                            <g transform="translate(66, 44)">
                                                <circle cx="14" cy="14" r="13" fill="#e6f4fe" stroke="#bce0fc" stroke-width="1.3"/>
                                                <path d="M10 8L18 16L14 17L16 21L14 22L12 18L9 20Z" fill="#0076de" stroke="#ffffff" stroke-width="1" stroke-linejoin="round"/>
                                            </g>
                                        </svg>
                                        <div style="font-weight:600;font-size:13.5px;color:var(--text-1);margin-top:10px;">暂无原型项目</div>
                                        <div style="font-size:12px;color:var(--text-3);margin-top:3px;margin-bottom:14px;">万事俱备，点击下方创建团队的第一份图纸</div>
                                        <?php if ($canManage): ?>
                                            <button type="button" class="btn-primary btn-sm" onclick="openQuickItemModal('project')"><i class="ri-add-line"></i> 新建项目</button>
                                        <?php endif; ?>
                                    </td></tr>
                                <?php else: ?>
                                    <?php
                                        $catMap = [];
                                        foreach ($cats as $c) $catMap[$c['id']] = $c['name'];
                                        $pendingAnnoCounts = [];
                                        try {
                                            $annoRows = $db->query("SELECT item_id, COUNT(*) as c FROM annotations WHERE status = 0 GROUP BY item_id")->fetchAll();
                                            foreach ($annoRows as $ar) {
                                                $pendingAnnoCounts[$ar['item_id']] = (int)$ar['c'];
                                            }
                                        } catch(Exception $e){}
                                    ?>
                                    <?php foreach ($projectItems as $it): 
                                        $vList = $itemVersions[$it['id']] ?? [];
                                        $defaultV = !empty($vList) ? $vList[0]['version_name'] : '-';
                                        $isCollab = false;
                                        if (!empty($it['collaborators']) && $currentUser) {
                                            $cList = array_map('intval', explode(',', $it['collaborators']));
                                            if (in_array((int)$currentUser['id'], $cList, true)) $isCollab = true;
                                        }
                                        $canManageThisItem = ($isAdmin || (int)$it['created_by'] === (int)($currentUser['id'] ?? 0) || $isCollab);
                                        $canDeleteThisItem = ($isAdmin || (int)$it['created_by'] === (int)($currentUser['id'] ?? 0));
                                        $pAnnoCount = $pendingAnnoCounts[$it['id']] ?? 0;
                                    ?>
                                    <tr id="admin-item-row-<?php echo $it['id']; ?>" data-can-edit="<?php echo $canManageThisItem ? '1' : '0'; ?>"
                                        data-item-id="<?php echo $it['id']; ?>"
                                        data-cat-id="<?php echo $it['category_id']; ?>"
                                        data-name="<?php echo htmlspecialchars($it['name']); ?>" 
                                        data-created-by="<?php echo (int)($it['created_by'] ?? 0); ?>"
                                        data-creator-name="<?php echo htmlspecialchars($it['creator_name'] ?? ''); ?>"
                                        data-versions="<?php echo htmlspecialchars(json_encode($vList), ENT_QUOTES, 'UTF-8'); ?>"
                                        style="border-bottom:1px solid var(--border);">
                                        <td style="padding:9px 12px;font-weight:600;color:var(--text-1);">
                                            <?php echo htmlspecialchars($it['name']); ?>
                                            <?php if (!empty($it['webhook_url'])): ?>
                                                <span class="badge-tag" style="background:var(--success-subtle);color:var(--success);border:1px solid var(--success-border);font-size:10.5px;margin-left:4px;" title="已绑定专属群机器人"><i class="ri-robot-line"></i> 机器人</span>
                                            <?php endif; ?>
                                            <?php if ($pAnnoCount > 0): ?>
                                                <span class="badge-tag" style="background:var(--warning-subtle);color:var(--warning);border:1px solid var(--warning-border);font-size:10.5px;margin-left:4px;" title="有 <?php echo $pAnnoCount; ?> 条待处理批注">● <?php echo $pAnnoCount; ?> 待办</span>
                                            <?php endif; ?>
                                        </td>
                                        <td style="padding:9px 12px;color:var(--text-2);"><?php echo htmlspecialchars($catMap[$it['category_id']] ?? '未归类'); ?></td>
                                        <td style="padding:9px 12px;color:var(--text-2);"><?php echo !empty($it['creator_name']) ? htmlspecialchars($it['creator_name']) : '-'; ?></td>
                                        <td style="padding:9px 12px;"><span class="badge-ver"><?php echo htmlspecialchars($defaultV); ?></span></td>
                                        <td style="padding:9px 12px;">
                                            <button type="button" class="btn-cancel btn-sm btn-table-ver" onclick="openVersionManageModal(<?php echo $it['id']; ?>)" title="管理此项目的历史版本与底稿">
                                                <i class="ri-history-line"></i> <?php echo count($vList); ?> 个版本
                                            </button>
                                        </td>
                                        <td style="padding:9px 12px;text-align:right;white-space:nowrap;">
                                            <!-- 项目调序按钮组 (按文件夹筛选时动态激活) -->
                                            <button type="button" class="btn-act project-order-btn btn-proj-move-up" style="display:none;margin-right:2px;" onclick="moveItemOrder(this, -1)" title="上移"><i class="ri-arrow-up-s-line"></i></button>
                                            <button type="button" class="btn-act project-order-btn btn-proj-move-down" style="display:none;margin-right:6px;" onclick="moveItemOrder(this, 1)" title="下移"><i class="ri-arrow-down-s-line"></i></button>

                                            <button class="btn-act" onclick="openUploadModal(<?php echo $it['id']; ?>, '<?php echo htmlspecialchars(addslashes($it['name'])); ?>')" title="发布新版本"><i class="ri-upload-cloud-line"></i></button>
                                            <?php if ($canManageThisItem): ?>
                                                <?php if ($isAdmin): ?>
                                                    <button class="btn-act" onclick="rotateShareToken(<?php echo $it['id']; ?>)" title="重置安全短链"><i class="ri-refresh-line" style="color:var(--text-3);"></i></button>
                                                <?php endif; ?>
                                                <button class="btn-act btn-edit-item-trigger" onclick="openEditItemModal(<?php echo htmlspecialchars(json_encode([
                                                    'id' => $it['id'],
                                                    'type' => $it['type'],
                                                    'category_id' => $it['category_id'],
                                                    'name' => $it['name'],
                                                    'link_url' => $it['link_url'],
                                                    'link_target' => $it['link_target'],
                                                    'webhook_url' => $it['webhook_url'] ?? '',
                                                    'created_by' => (int)($it['created_by'] ?? 0),
                                                    'collaborators' => $it['collaborators'] ?? '',
                                                    'watermark_enabled' => (int)($it['watermark_enabled'] ?? 0),
                                                    'has_versions' => !empty($it['versions'])
                                                ]), ENT_QUOTES, 'UTF-8'); ?>)" title="编辑属性"><i class="ri-edit-line"></i></button>
                                                <?php if ($canDeleteThisItem): ?>
                                                    <button class="btn-act" onclick="deleteItem(<?php echo $it['id']; ?>)" title="删除"><i class="ri-delete-bin-line"></i></button>
                                                <?php endif; ?>
                                            <?php else: ?>
                                                <span style="font-size:11px;color:var(--text-3);padding:0 4px;" title="受保护">受保护</span>
                                            <?php endif; ?>
                                        </td>
                                    </tr>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>

                    <!-- 2. 外部链接专属表格容器 -->
                    <div id="overviewTableLinks" style="display:none;border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;">
                        <table style="width:100%;border-collapse:collapse;font-size:13px;">
                            <thead>
                                <tr style="background:var(--canvas);text-align:left;color:var(--text-2);border-bottom:1px solid var(--border);">
                                    <th style="padding:9px 12px;width:24%;">链接名称</th>
                                    <th style="padding:9px 12px;width:14%;">所属文件夹</th>
                                    <th style="padding:9px 12px;width:12%;">打开方式</th>
                                    <th style="padding:9px 12px;width:28%;">目标地址</th>
                                    <th style="padding:9px 12px;width:10%;">负责人</th>
                                    <th style="padding:9px 12px;text-align:right;width:12%;">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if (empty($linkItems)): ?>
                                    <tr class="empty-links-row"><td colspan="6" style="padding:44px 20px;text-align:center;">
                                        <svg width="120" height="96" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">
                                            <circle cx="16" cy="18" r="1.5" fill="#cbd5e1"/>
                                            <circle cx="104" cy="18" r="1.5" fill="#cbd5e1"/>
                                            <circle cx="16" cy="78" r="1.5" fill="#cbd5e1"/>
                                            <circle cx="104" cy="78" r="1.5" fill="#cbd5e1"/>
                                            <rect x="34" y="20" width="56" height="46" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2" transform="rotate(-3 34 20)"/>
                                            <rect x="30" y="24" width="56" height="46" rx="6" fill="#ffffff" stroke="#94a3b8" stroke-width="1.4"/>
                                            <line x1="30" y1="34" x2="86" y2="34" stroke="#f1f5f9" stroke-width="1"/>
                                            <circle cx="36" cy="29" r="1.5" fill="#e2e8f0"/>
                                            <circle cx="40.5" cy="29" r="1.5" fill="#e2e8f0"/>
                                            <rect x="37" y="42" width="22" height="3" rx="1.5" fill="#cbd5e1"/>
                                            <rect x="37" y="49" width="34" height="2.5" rx="1" fill="#f1f5f9"/>
                                            <rect x="37" y="55" width="26" height="2.5" rx="1" fill="#f1f5f9"/>
                                            <g transform="translate(66, 44)">
                                                <circle cx="14" cy="14" r="13" fill="#e6f4fe" stroke="#bce0fc" stroke-width="1.3"/>
                                                <path d="M11 17L17 11M17 11H12M17 11V16" stroke="#0076de" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                                            </g>
                                        </svg>
                                        <div style="font-weight:600;font-size:13.5px;color:var(--text-1);margin-top:10px;">暂无外部链接</div>
                                        <div style="font-size:12px;color:var(--text-3);margin-top:3px;margin-bottom:14px;">将 Figma、蓝湖、飞书文档或外部演示地址收纳至此，统一看板索引</div>
                                        <?php if ($canManage): ?>
                                            <button type="button" class="btn-primary btn-sm" onclick="openItemModal(0, <?php echo !empty($cats) ? $cats[0]['id'] : 0; ?>, 'link')"><i class="ri-add-line"></i> 新建外链</button>
                                        <?php endif; ?>
                                    </td></tr>
                                <?php else: ?>
                                    <?php foreach ($linkItems as $it): 
                                        $isCollab = false;
                                        if (!empty($it['collaborators']) && $currentUser) {
                                            $cList = array_map('intval', explode(',', $it['collaborators']));
                                            if (in_array((int)$currentUser['id'], $cList, true)) $isCollab = true;
                                        }
                                        $canManageThisItem = ($isAdmin || (int)$it['created_by'] === (int)($currentUser['id'] ?? 0) || $isCollab);
                                        $canDeleteThisItem = ($isAdmin || (int)$it['created_by'] === (int)($currentUser['id'] ?? 0));
                                        $targetText = ($it['link_target'] === '_blank') ? '新标签页' : '内嵌预览';
                                        $targetBadgeStyle = ($it['link_target'] === '_blank') ? 'background:var(--primary-subtle);color:var(--primary);border:1px solid var(--primary-border);' : 'background:#f8fafc;color:var(--text-3);border:1px solid var(--border);';
                                    ?>
                                    <tr id="admin-item-row-<?php echo $it['id']; ?>" data-can-edit="<?php echo $canManageThisItem ? '1' : '0'; ?>"
                                        data-item-id="<?php echo $it['id']; ?>"
                                        data-cat-id="<?php echo $it['category_id']; ?>"
                                        data-name="<?php echo htmlspecialchars($it['name']); ?>"
                                        data-created-by="<?php echo (int)($it['created_by'] ?? 0); ?>"
                                        data-creator-name="<?php echo htmlspecialchars($it['creator_name'] ?? ''); ?>"
                                        data-type="link"
                                        style="border-bottom:1px solid var(--border);">
                                        <td style="padding:9px 12px;font-weight:600;color:var(--text-1);">
                                            <i class="ri-external-link-line" style="color:var(--primary);margin-right:4px;font-size:14px;vertical-align:-1px;"></i>
                                            <?php echo htmlspecialchars($it['name']); ?>
                                        </td>
                                        <td style="padding:9px 12px;color:var(--text-2);"><?php echo htmlspecialchars($catMap[$it['category_id']] ?? '未归类'); ?></td>
                                        <td style="padding:9px 12px;">
                                            <span class="badge-tag" style="<?php echo $targetBadgeStyle; ?>font-size:11px;"><?php echo $targetText; ?></span>
                                        </td>
                                        <td style="padding:9px 12px;max-width:260px;">
                                            <div style="display:flex;align-items:center;gap:6px;">
                                                <a href="<?php echo htmlspecialchars($it['link_url'] ?? ''); ?>" target="_blank" rel="noopener noreferrer" style="color:var(--primary);text-decoration:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;max-width:200px;" title="<?php echo htmlspecialchars($it['link_url'] ?? ''); ?>">
                                                    <?php echo htmlspecialchars($it['link_url'] ?? '-'); ?>
                                                </a>
                                                <?php if (!empty($it['link_url'])): ?>
                                                <button type="button" class="btn-act" onclick="copyTextToClipboard('<?php echo htmlspecialchars(addslashes($it['link_url'])); ?>', function(){ showToast('链接已复制', 'success'); })" title="复制链接">
                                                    <i class="ri-file-copy-line"></i>
                                                </button>
                                                <?php endif; ?>
                                            </div>
                                        </td>
                                        <td style="padding:9px 12px;color:var(--text-2);"><?php echo !empty($it['creator_name']) ? htmlspecialchars($it['creator_name']) : '-'; ?></td>
                                        <td style="padding:9px 12px;text-align:right;white-space:nowrap;">
                                            <button type="button" class="btn-act link-order-btn btn-link-move-up" style="display:none;margin-right:2px;" onclick="moveItemOrder(this, -1)" title="上移"><i class="ri-arrow-up-s-line"></i></button>
                                            <button type="button" class="btn-act link-order-btn btn-link-move-down" style="display:none;margin-right:6px;" onclick="moveItemOrder(this, 1)" title="下移"><i class="ri-arrow-down-s-line"></i></button>
                                            <?php if ($canManageThisItem): ?>
                                                <button class="btn-act btn-edit-item-trigger" onclick="openEditItemModal(<?php echo htmlspecialchars(json_encode([
                                                    'id' => $it['id'],
                                                    'type' => $it['type'],
                                                    'category_id' => $it['category_id'],
                                                    'name' => $it['name'],
                                                    'link_url' => $it['link_url'],
                                                    'link_target' => $it['link_target'],
                                                    'webhook_url' => $it['webhook_url'] ?? '',
                                                    'created_by' => (int)($it['created_by'] ?? 0),
                                                    'collaborators' => $it['collaborators'] ?? '',
                                                    'watermark_enabled' => (int)($it['watermark_enabled'] ?? 0),
                                                    'has_versions' => false
                                                ]), ENT_QUOTES, 'UTF-8'); ?>)" title="编辑属性"><i class="ri-edit-line"></i></button>
                                                <?php if ($canDeleteThisItem): ?>
                                                    <button class="btn-act" onclick="deleteItem(<?php echo $it['id']; ?>)" title="删除"><i class="ri-delete-bin-line"></i></button>
                                                <?php endif; ?>
                                            <?php else: ?>
                                                <span style="font-size:11px;color:var(--text-3);padding:0 4px;" title="受保护">受保护</span>
                                            <?php endif; ?>
                                        </td>
                                    </tr>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>

                    <!-- 2. 文件夹管理表格容器 (支持调序、编辑与安全删除) -->
                    <div id="overviewTableFolders" style="display:none;border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;">
                        <table style="width:100%;border-collapse:collapse;font-size:13px;">
                            <thead>
                                <tr style="background:var(--canvas);text-align:left;color:var(--text-2);border-bottom:1px solid var(--border);">
                                    <th style="padding:9px 12px;width:40%;">文件夹名称</th>
                                    <th style="padding:9px 12px;width:25%;">包含项目</th>
                                    <th style="padding:9px 12px;width:15%;">排序调整</th>
                                    <th style="padding:9px 12px;text-align:right;width:20%;">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if (empty($cats)): ?>
                                    <tr class="empty-folders-row"><td colspan="4" style="padding:44px 20px;text-align:center;">
                                        <svg width="120" height="96" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">
                                            <circle cx="16" cy="18" r="1.5" fill="#cbd5e1"/>
                                            <circle cx="104" cy="18" r="1.5" fill="#cbd5e1"/>
                                            <circle cx="16" cy="78" r="1.5" fill="#cbd5e1"/>
                                            <circle cx="104" cy="78" r="1.5" fill="#cbd5e1"/>
                                            <rect x="34" y="24" width="56" height="44" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2" transform="rotate(-3 34 24)"/>
                                            <path d="M30 28C30 25 32 23 35 23H48L53 28H81C84 28 86 30 86 33V66C86 69 84 71 81 71H35C32 71 30 69 30 66V28Z" fill="#ffffff" stroke="#94a3b8" stroke-width="1.4"/>
                                            <line x1="36" y1="36" x2="80" y2="36" stroke="#f1f5f9" stroke-width="1"/>
                                            <rect x="38" y="42" width="22" height="3" rx="1.5" fill="#cbd5e1"/>
                                            <rect x="38" y="48" width="34" height="2.5" rx="1" fill="#f1f5f9"/>
                                            <rect x="38" y="54" width="26" height="2.5" rx="1" fill="#f1f5f9"/>
                                            <g transform="translate(68, 46)">
                                                <circle cx="14" cy="14" r="13" fill="#e6f4fe" stroke="#bce0fc" stroke-width="1.3"/>
                                                <path d="M14 9V19M9 14H19" stroke="#0076de" stroke-width="2" stroke-linecap="round"/>
                                            </g>
                                        </svg>
                                        <div style="font-weight:600;font-size:13.5px;color:var(--text-1);margin-top:10px;">暂无文件夹分类</div>
                                        <div style="font-size:12px;color:var(--text-3);margin-top:3px;margin-bottom:14px;">创建文件夹以井井有条地组织您的原型项目</div>
                                        <?php if ($canManage): ?>
                                            <button type="button" class="btn-primary btn-sm" onclick="openCategoryModal(0)"><i class="ri-folder-add-line"></i> 新建文件夹</button>
                                        <?php endif; ?>
                                    </td></tr>
                                <?php else: ?>
                                    <?php
                                        $catTotal = count($cats);
                                        foreach ($cats as $cIdx => $c):
                                            $cItemCount = count($catItems[$c['id']] ?? []);
                                            $isFirstCat = ($cIdx === 0);
                                            $isLastCat = ($cIdx === $catTotal - 1);
                                    ?>
                                    <tr data-cat-id="<?php echo $c['id']; ?>" style="border-bottom:1px solid var(--border);">
                                        <td style="padding:10px 12px;font-weight:600;color:var(--text-1);">
                                            <i class="ri-folder-line" style="color:var(--primary);margin-right:6px;font-size:15px;vertical-align:-1px;"></i>
                                            <span><?php echo htmlspecialchars($c['name']); ?></span>
                                        </td>
                                        <td style="padding:10px 12px;color:var(--text-2);font-size:12.5px;">
                                            <span style="font-weight:500;color:var(--text-1);"><?php echo $cItemCount; ?></span> <span style="color:var(--text-3);font-size:11.5px;">个项目</span>
                                        </td>
                                        <td style="padding:10px 12px;white-space:nowrap;">
                                            <button type="button" class="btn-act btn-cat-move-up" onclick="moveCategoryOrder(this, -1)" title="上移" <?php if ($isFirstCat) echo 'disabled style="opacity:0.28;cursor:not-allowed;"'; ?>><i class="ri-arrow-up-s-line"></i></button>
                                            <button type="button" class="btn-act btn-cat-move-down" onclick="moveCategoryOrder(this, 1)" title="下移" <?php if ($isLastCat) echo 'disabled style="opacity:0.28;cursor:not-allowed;"'; ?>><i class="ri-arrow-down-s-line"></i></button>
                                        </td>
                                        <td style="padding:10px 12px;text-align:right;white-space:nowrap;">
                                            <button type="button" class="btn-act" onclick="openCategoryModal(<?php echo $c['id']; ?>, '<?php echo htmlspecialchars(addslashes($c['name'])); ?>')" title="编辑名称"><i class="ri-edit-line"></i></button>
                                            <button type="button" class="btn-act" onclick="confirmDeleteCategory(<?php echo $c['id']; ?>, '<?php echo htmlspecialchars(addslashes($c['name'])); ?>', <?php echo $cItemCount; ?>)" title="删除文件夹"><i class="ri-delete-bin-line"></i></button>
                                        </td>
                                    </tr>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- 面板 2: 团队成员 (管理员支持增删改·协作者只读通讯录) -->
                <div id="panel-users" class="admin-panel">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                        <div class="console-subtab-group user-subtab-group">
                            <button type="button" id="subtab-btn-active-users" class="console-subtab-btn log-subtab-btn active" onclick="switchUserSubTab('active')"><?php echo $isAdmin ? '正式成员' : '团队通讯录'; ?></button>
                            <?php if ($isAdmin): ?>
                            <button type="button" id="subtab-btn-pending-users" class="console-subtab-btn log-subtab-btn" onclick="switchUserSubTab('pending')">
                                <span>入驻申请</span>
                                <span id="pendingSubTabCount" style="<?php echo ($isAdmin && $pendingUserCount > 0) ? '' : 'display:none;'; ?>background:var(--warning);color:#fff;border-radius:10px;padding:1px 6px;font-size:11px;font-weight:600;line-height:1.2;"><?php echo $pendingUserCount; ?></span>
                            </button>
                            <?php endif; ?>
                        </div>
                        <?php if ($isAdmin): ?>
                        <div id="activeUserActions">
                            <button type="button" class="btn-primary btn-md" onclick="showAddUserBox()"><i class="ri-user-add-line"></i> 添加成员</button>
                        </div>
                        <?php endif; ?>
                    </div>

                    <!-- 正式成员列表容器 -->
                    <div id="userBoxActive">
                    <div style="border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;">
                        <table style="width:100%;border-collapse:collapse;font-size:13px;">
                            <thead>
                                <tr style="background:var(--canvas);text-align:left;color:var(--text-2);border-bottom:1px solid var(--border);">
                                    <th style="padding:9px 12px;">姓名 / 工作邮箱</th>
                                    <th style="padding:9px 12px;">角色权限</th>
                                    <th style="padding:9px 12px;">负责项目</th>
                                    <th style="padding:9px 12px;">部门 / 说明</th>
                                    <th style="padding:9px 12px;">加入时间</th>
                                    <th style="padding:9px 12px;text-align:right;"><?php echo $isAdmin ? '操作' : '状态'; ?></th>
                                </tr>
                            </thead>
                            <tbody id="userTableBody">
                            </tbody>
                        </table>
                    </div>
                    </div>

                    <?php if ($isAdmin): ?>
                    <!-- 待审批入驻申请列表容器 -->
                    <div id="userBoxPending" style="display:none;border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;">
                        <table style="width:100%;border-collapse:collapse;font-size:13px;">
                            <thead>
                                <tr style="background:var(--canvas);text-align:left;color:var(--text-2);border-bottom:1px solid var(--border);">
                                    <th style="padding:9px 12px;">姓名 / 申请邮箱</th>
                                    <th style="padding:9px 12px;">所属部门 / 说明</th>
                                    <th style="padding:9px 12px;">申请时间</th>
                                    <th style="padding:9px 12px;text-align:right;">审批操作</th>
                                </tr>
                            </thead>
                            <tbody id="pendingUsersTbody">
                                <tr><td colspan="4" style="padding:24px;text-align:center;color:var(--text-3);">正在加载待审批申请...</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <?php endif; ?>
                </div>

                <?php if ($isAdmin): ?>

                <!-- 面板: 角色权限 -->
                <?php
                    $editorShare = (Auth::getSetting('perm_editor_share', '1') !== '0');
                    $viewerDownloadRp = (Auth::getSetting('perm_viewer_download_rp', '0') === '1');
                    $viewerShare = (Auth::getSetting('perm_viewer_share', '0') === '1');
                ?>
                <div id="panel-roles" class="admin-panel">
                    <form id="rolePermissionsForm" onsubmit="handleSaveRolePermissions(event)">
                        <div style="border:1px solid var(--border);border-radius:var(--radius-md);overflow-x:auto;-webkit-overflow-scrolling:touch;background:var(--surface);">
                            <table style="width:100%;min-width:560px;border-collapse:collapse;font-size:13px;">
                                    <thead>
                                        <tr style="background:var(--canvas);text-align:left;color:var(--text-2);border-bottom:1px solid var(--border);">
                                            <th style="padding:10px 16px;width:28%;font-weight:600;">权限项</th>
                                            <th style="padding:10px 12px;text-align:center;width:18%;font-weight:600;color:var(--text-1);">超级管理员</th>
                                            <th style="padding:10px 12px;text-align:center;width:18%;font-weight:600;color:var(--text-1);">协作者</th>
                                            <th style="padding:10px 12px;text-align:center;width:18%;font-weight:600;color:var(--text-1);">审阅人</th>
                                            <th style="padding:10px 12px;text-align:center;width:18%;font-weight:600;color:var(--text-1);">访客</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <!-- 项 1: 管理后台 -->
                                        <tr style="border-bottom:1px solid var(--border);">
                                            <td style="padding:11px 16px;font-weight:500;color:var(--text-1);">管理后台</td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <i class="ri-check-line" style="color:var(--success,#16a34a);font-size:18px;font-weight:bold;"></i>
                                            </td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <span style="color:var(--text-3);opacity:0.35;font-size:16px;">—</span>
                                            </td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <span style="color:var(--text-3);opacity:0.35;font-size:16px;">—</span>
                                            </td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <span style="color:var(--text-3);opacity:0.35;font-size:16px;">—</span>
                                            </td>
                                        </tr>

                                        <!-- 项 2: 管理项目与版本 -->
                                        <tr style="border-bottom:1px solid var(--border);">
                                            <td style="padding:11px 16px;font-weight:500;color:var(--text-1);">管理项目与版本</td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <i class="ri-check-line" style="color:var(--success,#16a34a);font-size:18px;font-weight:bold;"></i>
                                            </td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <i class="ri-check-line" style="color:var(--success,#16a34a);font-size:18px;font-weight:bold;"></i>
                                            </td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <span style="color:var(--text-3);opacity:0.35;font-size:16px;">—</span>
                                            </td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <span style="color:var(--text-3);opacity:0.35;font-size:16px;">—</span>
                                            </td>
                                        </tr>

                                        <!-- 项 3: 下载 RP 源文件 -->
                                        <tr style="border-bottom:1px solid var(--border);">
                                            <td style="padding:11px 16px;font-weight:500;color:var(--text-1);">下载 RP 源文件</td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <i class="ri-check-line" style="color:var(--success,#16a34a);font-size:18px;font-weight:bold;"></i>
                                            </td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <i class="ri-check-line" style="color:var(--success,#16a34a);font-size:18px;font-weight:bold;"></i>
                                            </td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <input type="checkbox" id="permViewerDownloadRp" name="perm_viewer_download_rp" value="1" <?php echo $viewerDownloadRp ? 'checked' : ''; ?> style="width:16px;height:16px;accent-color:var(--primary);cursor:pointer;vertical-align:middle;">
                                            </td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <input type="checkbox" id="permGuestDownloadRp" name="perm_guest_download_rp" value="1" <?php echo (Auth::getSetting('perm_guest_download_rp', '0') === '1') ? 'checked' : ''; ?> style="width:16px;height:16px;accent-color:var(--primary);cursor:pointer;vertical-align:middle;">
                                            </td>
                                        </tr>

                                        <!-- 项 4: 外发分享 -->
                                        <tr style="border-bottom:1px solid var(--border);">
                                            <td style="padding:11px 16px;font-weight:500;color:var(--text-1);">外发分享</td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <i class="ri-check-line" style="color:var(--success,#16a34a);font-size:18px;font-weight:bold;"></i>
                                            </td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <input type="checkbox" id="permEditorShare" name="perm_editor_share" value="1" <?php echo $editorShare ? 'checked' : ''; ?> style="width:16px;height:16px;accent-color:var(--primary);cursor:pointer;vertical-align:middle;">
                                            </td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <input type="checkbox" id="permViewerShare" name="perm_viewer_share" value="1" <?php echo $viewerShare ? 'checked' : ''; ?> style="width:16px;height:16px;accent-color:var(--primary);cursor:pointer;vertical-align:middle;">
                                            </td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <span style="color:var(--text-3);opacity:0.35;font-size:16px;">—</span>
                                            </td>
                                        </tr>

                                        <!-- 项 5: 页面批注 -->
                                        <tr>
                                            <td style="padding:11px 16px;font-weight:500;color:var(--text-1);">页面批注</td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <i class="ri-check-line" style="color:var(--success,#16a34a);font-size:18px;font-weight:bold;"></i>
                                            </td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <i class="ri-check-line" style="color:var(--success,#16a34a);font-size:18px;font-weight:bold;"></i>
                                            </td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <i class="ri-check-line" style="color:var(--success,#16a34a);font-size:18px;font-weight:bold;"></i>
                                            </td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <input type="checkbox" id="permGuestAnnotate" name="perm_guest_annotate" value="1" <?php echo (Auth::getSetting('perm_guest_annotate', '0') === '1') ? 'checked' : ''; ?> style="width:16px;height:16px;accent-color:var(--primary);cursor:pointer;vertical-align:middle;">
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                    </form>
                </div>

                <!-- 面板: 系统设置 (企业组织定制、基础系统参数与准入审批) -->
                <div id="panel-brand" class="admin-panel">
                    <form id="settingsForm" onsubmit="handleSaveSettings(event)">
                        <!-- 卡片 1: 企业组织定制 -->
                        <?php
                            $rawTitle = trim(Auth::getSetting('site_title', ''));
                            $currCompanyName = '';
                            if (!empty($rawTitle) && $rawTitle !== '立象原型' && $rawTitle !== '立象原型托管平台' && strcasecmp($rawTitle, 'ProtoLoft') !== 0) {
                                $currCompanyName = $rawTitle;
                            }
                        ?>
                        <div class="settings-section-card">
                            <div class="settings-section-header">
                                <div class="settings-section-title"><i class="ri-building-line"></i> 组织</div>
                            </div>
                            
                            <div class="m-form-group" style="margin-bottom:0;">
                                <label class="m-label" for="settingSiteTitle">组织名称 <span class="opt-tag">选填</span></label>
                                <input type="text" id="settingSiteTitle" name="site_title" class="m-input" value="<?php echo htmlspecialchars($currCompanyName); ?>" placeholder="例如：某某科技" maxlength="20">
                            </div>
                        </div>

                        <!-- 卡片 2: 基础设置 -->
                        <?php
                            $currentTimezone = Auth::getSetting('system_timezone', 'Asia/Shanghai');
                            $timezones = [
                                'Pacific/Midway' => 'UTC-11 (中途岛 / 萨摩亚)',
                                'Pacific/Honolulu' => 'UTC-10 (夏威夷时间)',
                                'America/Anchorage' => 'UTC-9 (阿拉斯加时间)',
                                'America/Los_Angeles' => 'UTC-8 (太平洋时间 / 洛杉矶)',
                                'America/Denver' => 'UTC-7 (山地时间 / 丹佛)',
                                'America/Chicago' => 'UTC-6 (中部时间 / 芝加哥)',
                                'America/New_York' => 'UTC-5 (东部时间 / 纽约)',
                                'America/Santiago' => 'UTC-4 (大西洋时间 / 圣地亚哥)',
                                'America/Sao_Paulo' => 'UTC-3 (巴西利亚 / 圣保罗)',
                                'America/Noronha' => 'UTC-2 (费尔南多·迪诺罗尼亚)',
                                'Atlantic/Azores' => 'UTC-1 (亚速尔群岛 / 佛得角)',
                                'UTC' => 'UTC+0 (世界协调时间 / 伦敦)',
                                'Europe/Paris' => 'UTC+1 (中欧时间 / 巴黎 / 柏林)',
                                'Europe/Athens' => 'UTC+2 (东欧时间 / 雅典 / 开罗)',
                                'Europe/Moscow' => 'UTC+3 (莫斯科时间 / 伊斯坦布尔)',
                                'Asia/Dubai' => 'UTC+4 (海湾时间 / 迪拜)',
                                'Asia/Karachi' => 'UTC+5 (巴基斯坦时间 / 卡拉奇)',
                                'Asia/Dhaka' => 'UTC+6 (孟加拉时间 / 达卡)',
                                'Asia/Bangkok' => 'UTC+7 (中南半岛时间 / 曼谷 / 雅加达)',
                                'Asia/Shanghai' => 'UTC+8 (北京时间 / 中国标准时间)',
                                'Asia/Tokyo' => 'UTC+9 (日本标准时间 / 东京 / 首尔)',
                                'Australia/Sydney' => 'UTC+10 (澳大利亚东部时间 / 悉尼)',
                                'Pacific/Guadalcanal' => 'UTC+11 (所罗门群岛 / 努美阿)',
                                'Pacific/Fiji' => 'UTC+12 (斐济 / 马绍尔群岛 / 堪察加)'
                            ];
                            if (empty($currentTimezone) || !isset($timezones[$currentTimezone])) {
                                $currentTimezone = 'Asia/Shanghai';
                            }
                        ?>
                        <div class="settings-section-card">
                            <div class="settings-section-header">
                                <div class="settings-section-title"><i class="ri-equalizer-line"></i> 基础设置</div>
                            </div>

                            <div class="settings-row" style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border-light, #f1f5f9);">
                                <div class="settings-row-info">
                                    <label class="settings-row-label" for="settingGlobalWatermark">全站身份水印</label>
                                    <div style="font-size:12px;color:var(--text-3);margin-top:2px;">在原型预览中显示访问者信息与时间</div>
                                </div>
                                <div class="settings-row-control">
                                    <label class="linear-switch">
                                        <input type="checkbox" id="settingGlobalWatermark" name="global_watermark_enabled" value="1" <?php echo Auth::getSetting('global_watermark_enabled', '0') === '1' ? 'checked' : ''; ?>>
                                        <span class="linear-switch-slider"></span>
                                    </label>
                                </div>
                            </div>

                            <div class="settings-row" style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border-light, #f1f5f9);">
                                <div class="settings-row-info">
                                    <label class="settings-row-label" for="settingTimezone">系统时区</label>
                                </div>
                                <div class="settings-row-control">
                                    <select id="settingTimezone" name="system_timezone" class="m-select-md" style="min-width:260px;">
                                        <?php foreach ($timezones as $tzKey => $tzLabel): ?>
                                            <option value="<?php echo $tzKey; ?>" <?php echo $currentTimezone === $tzKey ? 'selected' : ''; ?>>
                                                <?php echo htmlspecialchars($tzLabel); ?>
                                            </option>
                                        <?php endforeach; ?>
                                    </select>
                                </div>
                            </div>

                            <div class="settings-row">
                                <div class="settings-row-info">
                                    <label class="settings-row-label" for="settingMaxCustomShares">单项目专属分享上限</label>
                                </div>
                                <div class="settings-row-control">
                                    <div class="linear-stepper-wrap">
                                        <button type="button" class="stepper-btn stepper-btn-dec" onclick="stepNumberInput('settingMaxCustomShares', -1, 1, 99)" title="减少">
                                            <i class="ri-subtract-line"></i>
                                        </button>
                                        <div class="stepper-input-box">
                                            <input type="number" id="settingMaxCustomShares" name="max_custom_shares_per_item" min="1" max="99" value="<?php echo htmlspecialchars(Auth::getSetting('max_custom_shares_per_item', '5')); ?>" required onblur="clampStepperInput(this, 1, 99)">
                                            <span class="stepper-unit">条</span>
                                        </div>
                                        <button type="button" class="stepper-btn stepper-btn-inc" onclick="stepNumberInput('settingMaxCustomShares', 1, 1, 99)" title="增加">
                                            <i class="ri-add-line"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div class="m-form-group" style="margin-bottom:0;margin-top:14px;padding-top:14px;border-top:1px solid var(--border-light, #f1f5f9);">
                                <label class="m-label" for="settingSiteBaseUrl">
                                    <span>站点访问地址</span>
                                    <span class="opt-tag">选填 · 反代环境校准分享与 MCP 链接，留空自动识别</span>
                                </label>
                                <input type="text" id="settingSiteBaseUrl" name="site_base_url" class="m-input" value="<?php echo htmlspecialchars(Auth::getSetting('site_base_url', '')); ?>" placeholder="例如：https://proto.company.com" maxlength="200">
                            </div>
                        </div>

                        <!-- 卡片 3: 成员注册 -->
                        <?php 
                            $visitorRegEnabled = (Auth::getSetting('visitor_register_enabled', '1') !== '0');
                            $allowedDomains = Auth::getSetting('allowed_email_domains', '');
                            $reviewWebhook = Auth::getSetting('global_webhook_url', '');
                            $adminUsers = $db->query("SELECT id, email, name, webhook_url FROM users WHERE role = 'admin' AND status = 1 ORDER BY id ASC")->fetchAll();
                            $savedNotifyAdminJson = Auth::getSetting('visitor_notify_admin_ids', '');
                            $selectedNotifyAdminIds = !empty($savedNotifyAdminJson) ? json_decode($savedNotifyAdminJson, true) : null;
                            $defaultAllAdmins = ($selectedNotifyAdminIds === null);
                        ?>
                        <div class="settings-section-card">
                            <div class="settings-section-header">
                                <div class="settings-section-title"><i class="ri-user-shared-line"></i> 成员注册</div>
                            </div>

                            <div class="settings-row">
                                <div class="settings-row-info">
                                    <label class="settings-row-label" for="settingVisitorReg">开放自主注册</label>
                                </div>
                                <div class="settings-row-control">
                                    <label class="linear-switch">
                                        <input type="checkbox" id="settingVisitorReg" name="visitor_register_enabled" value="1" <?php echo $visitorRegEnabled ? 'checked' : ''; ?>>
                                        <span class="linear-switch-slider"></span>
                                    </label>
                                </div>
                            </div>

                            <div class="m-form-group" style="margin-bottom:0;margin-top:14px;">
                                <label class="m-label" for="settingAllowedDomains">
                                    <span>允许注册的邮箱域名</span>
                                    <span class="opt-tag">选填。多个域名用逗号分隔；留空不限制</span>
                                </label>
                                <input type="text" id="settingAllowedDomains" name="allowed_email_domains" class="m-input" value="<?php echo htmlspecialchars($allowedDomains); ?>" placeholder="例如：company.com, group.cn" maxlength="200" onblur="if(window.cleanEmailDomains) this.value = cleanEmailDomains(this.value)">
                            </div>
                        </div>

                        <!-- 卡片 4: 通知设置 -->
                        <div class="settings-section-card">
                            <div class="settings-section-header">
                                <div class="settings-section-title"><i class="ri-notification-3-line"></i> 通知设置</div>
                            </div>

                            <!-- 评审群通知 Webhook -->
                            <div class="m-form-group">
                                <label class="m-label" for="settingGlobalWebhook">
                                    <span>评审群通知</span>
                                    <span class="opt-tag">选填</span>
                                </label>
                                <div class="m-form-row">
                                    <input type="text" id="settingGlobalWebhook" name="global_webhook_url" class="m-input" value="<?php echo htmlspecialchars($reviewWebhook); ?>" placeholder="企微 / 飞书 / 钉钉群机器人 Webhook 地址" maxlength="1000">
                                    <button type="button" class="btn-cancel btn-standard" onclick="testAnyWebhook('settingGlobalWebhook', this)">
                                        <i class="ri-send-plane-line"></i> 测试
                                    </button>
                                </div>
                                <div style="font-size:11.5px;color:var(--text-3);margin-top:5px;line-height:1.4;">全站任意项目发布新版本时统一推送到此群，组织团队集中评审；钉钉/飞书安全设置勾选「自定义关键词」，填入：<strong>立象原型</strong></div>
                            </div>

                            <!-- 新成员审批通知人 -->
                            <div class="m-form-group" style="position:relative;margin-bottom:0;margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
                                <label class="m-label" id="adminRecipientsLabel">
                                    <span>新成员审批通知人</span>
                                    <span class="opt-tag">选填。留空不通知</span>
                                </label>
                                
                                <!-- 下拉触发选择框 -->
                                <button type="button" aria-labelledby="adminRecipientsLabel" aria-expanded="false" aria-controls="adminMultiSelectMenu" aria-describedby="adminMultiSelectTags" id="adminMultiSelectTrigger" class="m-input m-input-trigger" onclick="toggleAdminDropdown(event)">
                                    <span id="adminMultiSelectTags" style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">
                                        <!-- 由 JS 渲染已选胶囊 -->
                                    </span>
                                    <i class="ri-arrow-down-s-line" style="color:var(--text-3);font-size:16px;margin-left:6px;flex-shrink:0;"></i>
                                </button>

                                <!-- 浮层下拉列表卡片 -->
                                <div id="adminMultiSelectMenu" role="group" aria-labelledby="adminRecipientsLabel" style="display:none;position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:120;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);box-shadow:0 6px 20px rgba(16,24,40,0.1);max-height:220px;overflow-y:auto;padding:6px;">
                                    <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px 8px;border-bottom:1px solid var(--border);font-size:11.5px;color:var(--text-3);">
                                        <span>选择审批通知管理员</span>
                                        <div style="display:flex;gap:10px;">
                                             <a href="javascript:void(0)" onclick="selectAllAdmins(true)" style="color:var(--primary);text-decoration:none;">全选</a>
                                            <a href="javascript:void(0)" onclick="selectAllAdmins(false)" style="color:var(--text-3);text-decoration:none;">清空</a>
                                        </div>
                                    </div>
                                    <div id="adminMultiSelectOptions" style="display:flex;flex-direction:column;gap:2px;padding-top:4px;">
                                        <?php foreach ($adminUsers as $au): 
                                            $hasHook = !empty($au['webhook_url']);
                                            $isChecked = $defaultAllAdmins ? true : (is_array($selectedNotifyAdminIds) && in_array((int)$au['id'], $selectedNotifyAdminIds));
                                            $uName = htmlspecialchars(!empty($au['name']) ? $au['name'] : $au['email']);
                                        ?>
                                        <label class="admin-select-option" style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:4px;cursor:pointer;font-size:12.5px;transition:background 0.15s;" onmouseover="this.style.background='var(--canvas)'" onmouseout="this.style.background='transparent'">
                                            <input type="checkbox" name="visitor_notify_admin_ids[]" value="<?php echo (int)$au['id']; ?>" <?php echo $isChecked ? 'checked' : ''; ?> onchange="onAdminSelectChange()" style="cursor:pointer;">
                                            <span style="font-weight:600;color:var(--text-1);"><?php echo $uName; ?></span>
                                            <span class="admin-select-webhook-status" data-admin-webhook-status>
                                                <?php if ($hasHook): ?>
                                                    <i class="ri-robot-line" title="已配置个人机器人 Webhook" role="img" aria-label="已配置个人机器人 Webhook"></i>
                                                <?php else: ?>
                                                    未配置机器人
                                                <?php endif; ?>
                                            </span>
                                        </label>
                                        <?php endforeach; ?>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>

                <!-- 面板 6: 系统审计日志 (登录日志与访问日志) -->
                <div id="panel-logs" class="admin-panel">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                        <div class="console-subtab-group log-subtab-group">
                            <button type="button" id="subtab-btn-login" class="console-subtab-btn log-subtab-btn active" onclick="switchLogSubTab('login')">登录日志</button>
                            <button type="button" id="subtab-btn-access" class="console-subtab-btn log-subtab-btn" onclick="switchLogSubTab('access')">访问日志</button>
                        </div>
                        <div style="display:flex;gap:8px;align-items:center;">
                            <button type="button" class="btn-cancel btn-md" onclick="loadLogsData()" title="刷新日志数据"><i class="ri-refresh-line"></i> 刷新</button>
                            <button type="button" class="btn-cancel btn-md" onclick="handleClearLogs()" style="color:var(--danger)" title="清空全部系统日志"><i class="ri-delete-bin-line"></i> 清空日志</button>
                        </div>
                    </div>

                    <!-- 1. 登录日志表格容器 -->
                    <div id="logBoxLogin" style="border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;">
                        <table style="width:100%;border-collapse:collapse;font-size:13px;">
                            <thead>
                                <tr style="background:var(--canvas);text-align:left;color:var(--text-2);border-bottom:1px solid var(--border);">
                                    <th style="padding:9px 12px;width:150px;">登录时间</th>
                                    <th style="padding:9px 12px;width:110px;">操作账号</th>
                                    <th style="padding:9px 12px;width:90px;">状态</th>
                                    <th style="padding:9px 12px;width:130px;">客户端 IP</th>
                                    <th style="padding:9px 12px;width:150px;">设备 / 浏览器</th>
                                    <th style="padding:9px 12px;">说明</th>
                                </tr>
                            </thead>
                            <tbody id="loginLogsTableBody">
                                <?php
                                $ssrLoginLogs = Auth::getLoginLogs(80);
                                ?>
                                <?php if (!empty($ssrLoginLogs)): ?>
                                    <?php foreach ($ssrLoginLogs as $l): ?>
                                        <tr style="border-bottom:1px solid var(--border);">
                                            <td style="padding:9px 12px;color:var(--text-3);font-size:12px;"><?php echo htmlspecialchars($l['created_at']); ?></td>
                                            <td style="padding:9px 12px;font-weight:600;color:var(--text-1);"><?php 
                                                $uDisp = (string)$l['username'];
                                                echo htmlspecialchars((strpos($uDisp, '@') === false) ? ('@' . $uDisp) : $uDisp); 
                                            ?></td>
                                            <td style="padding:9px 12px;">
                                                <?php if ((int)$l['status'] === 1): ?>
                                                    <span class="badge-tag" style="color:var(--success);background:#f0fdf4;border:1px solid #bbf7d0;">成功</span>
                                                <?php else: ?>
                                                    <span class="badge-tag" style="color:var(--danger);background:#fef2f2;border:1px solid #fecaca;">失败</span>
                                                <?php endif; ?>
                                            </td>
                                            <td style="padding:9px 12px;font-family:ui-monospace,monospace;font-size:12px;color:var(--text-2);"><?php echo htmlspecialchars($l['ip']); ?></td>
                                            <td style="padding:9px 12px;color:var(--text-2);font-size:12.5px;" title="<?php echo htmlspecialchars($l['user_agent'] ?? ''); ?>"><?php echo htmlspecialchars($l['device'] ?: '未知设备'); ?></td>
                                            <td style="padding:9px 12px;color:var(--text-3);font-size:12.5px;"><?php echo htmlspecialchars($l['message'] ?? ''); ?></td>
                                        </tr>
                                    <?php endforeach; ?>
                                <?php else: ?>
                                    <tr><td colspan="6" style="padding:28px;text-align:center;color:var(--text-3);">暂无登录日志记录</td></tr>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>

                    <!-- 2. 访问日志表格容器 (默认初始隐藏，点击子Tab切换) -->
                    <div id="logBoxAccess" style="display:none;border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;">
                        <table style="width:100%;border-collapse:collapse;font-size:13px;">
                            <thead>
                                <tr style="background:var(--canvas);text-align:left;color:var(--text-2);border-bottom:1px solid var(--border);">
                                    <th style="padding:9px 12px;width:150px;">访问时间</th>
                                    <th style="padding:9px 12px;">原型项目</th>
                                    <th style="padding:9px 12px;width:100px;">版本</th>
                                    <th style="padding:9px 12px;width:100px;">渠道</th>
                                    <th style="padding:9px 12px;width:130px;">访客 IP</th>
                                    <th style="padding:9px 12px;width:160px;">设备 / 浏览器</th>
                                </tr>
                            </thead>
                            <tbody id="accessLogsTableBody">
                                <?php
                                $ssrAccessLogs = Auth::getAccessLogs(80);
                                ?>
                                <?php if (!empty($ssrAccessLogs)): ?>
                                    <?php foreach ($ssrAccessLogs as $al): ?>
                                        <tr style="border-bottom:1px solid var(--border);">
                                            <td style="padding:9px 12px;color:var(--text-3);font-size:12px;"><?php echo htmlspecialchars($al['created_at']); ?></td>
                                            <td style="padding:9px 12px;font-weight:600;color:var(--text-1);"><?php echo htmlspecialchars($al['item_name']); ?></td>
                                            <td style="padding:9px 12px;color:var(--primary);font-weight:500;"><?php echo htmlspecialchars($al['version_name'] ?: '-'); ?></td>
                                            <td style="padding:9px 12px;">
                                                <?php if ($al['access_type'] === 'share'): ?>
                                                    <span class="badge-tag" style="color:var(--primary);background:var(--primary-subtle);border:1px solid var(--primary-border);">独立短链</span>
                                                <?php else: ?>
                                                    <span class="badge-tag" style="color:var(--text-2);background:var(--canvas);border:1px solid var(--border);">工作台</span>
                                                <?php endif; ?>
                                            </td>
                                            <td style="padding:9px 12px;font-family:ui-monospace,monospace;font-size:12px;color:var(--text-2);"><?php echo htmlspecialchars($al['ip']); ?></td>
                                            <td style="padding:9px 12px;color:var(--text-2);font-size:12.5px;" title="<?php echo htmlspecialchars($al['user_agent'] ?? ''); ?>"><?php echo htmlspecialchars($al['device'] ?: '未知设备'); ?></td>
                                        </tr>
                                    <?php endforeach; ?>
                                <?php else: ?>
                                    <tr><td colspan="6" style="padding:28px;text-align:center;color:var(--text-3);">暂无访问日志记录</td></tr>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>
<?php endif; ?>

<!-- 引入通用登录弹窗 -->
<?php include __DIR__ . '/login_modal.php'; ?>

<!-- 移交主管理员权限弹窗 (标准 S 档 440px) -->
<div id="transferOwnerModal" class="custom-modal" style="display:none;">
    <div class="modal-dialog-box modal-sm" style="padding:22px 24px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <div style="font-size:15px;font-weight:600;color:var(--text-1);display:flex;align-items:center;gap:6px;">
                <i class="ri-key-2-line" style="color:var(--primary);"></i> 移交主管理员权限
            </div>
            <button type="button" onclick="closeModal('transferOwnerModal')" class="close-x" title="关闭"><i class="ri-close-line"></i></button>
        </div>
        <div style="font-size:12.5px;color:var(--text-2);line-height:1.6;background:#fef3c7;color:#92400e;padding:10px 12px;border-radius:6px;border:1px solid #fde68a;margin-bottom:14px;">
            <i class="ri-alert-line" style="vertical-align:middle;margin-right:2px;"></i> 移交后，接收人将成为主管理员，您将转为管理员。
        </div>
        <form onsubmit="handleDoTransferOwner(event)">
            <input type="hidden" id="transferTargetUserId" value="0">
            <div class="m-form-group">
                <label class="m-label">接收人</label>
                <div id="transferTargetUserName" style="font-weight:600;font-size:13.5px;color:var(--primary);padding:8px 0;"></div>
            </div>
            <div class="m-form-group">
                <label class="m-label" for="transferConfirmPwd">当前密码 <span class="req-star">*</span></label>
                <div style="position:relative;display:flex;align-items:center;">
                    <input type="password" id="transferConfirmPwd" class="m-input" placeholder="输入您当前的登录密码以确认移交" required maxlength="64" style="flex:1;padding-right:36px">
                    <button type="button" onclick="togglePasswordVisibility('transferConfirmPwd', this)" style="position:absolute;right:8px;background:none;border:none;color:var(--text-3);cursor:pointer;padding:4px 6px;font-size:15px;display:flex;align-items:center;" title="显示/隐藏密码">
                        <i class="ri-eye-line"></i>
                    </button>
                </div>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;">
                <button type="button" class="btn-cancel btn-standard" onclick="closeModal('transferOwnerModal')">取消</button>
                <button type="submit" class="btn-primary btn-standard" id="btnTransferSubmit" style="background:#dc2626;border-color:#dc2626">确认移交</button>
            </div>
        </form>
    </div>
</div>

<!-- 工作交接弹窗 (极简 440px) -->
<div id="userHandoverModal" class="custom-modal" style="display:none;">
    <div class="modal-dialog-box modal-sm">
        <div class="modal-head">
            <h4>工作交接</h4>
            <button type="button" class="close-x" onclick="closeModal('userHandoverModal')" title="关闭"><i class="ri-close-line"></i></button>
        </div>
        <form onsubmit="handleUserHandover(event)">
            <input type="hidden" id="handoverFromUserId" value="0">
            <div style="font-size:13px;color:var(--text-2);line-height:1.5;margin-bottom:14px;" id="handoverDescText">
                将负责的项目交接给接管人。
            </div>
            <div class="m-form-group">
                <label class="m-label">接管成员 <span class="req-star">*</span></label>
                <select id="handoverToUserId" class="m-input" required>
                    <option value="">-- 选择接管成员 --</option>
                </select>
            </div>
            <div class="m-form-group" style="margin-top:14px;">
                <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text-1);">
                    <input type="checkbox" id="handoverDeactivateFrom" style="accent-color:var(--primary);width:15px;height:15px;cursor:pointer;">
                    <span>同时停用原成员账号</span>
                </label>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
                <button type="button" class="btn-cancel btn-standard" onclick="closeModal('userHandoverModal')">取消</button>
                <button type="submit" class="btn-primary btn-standard" id="btnHandoverSubmit">确认交接</button>
            </div>
        </form>
    </div>
</div>

<?php if ($isAdmin): ?>
<!-- 添加成员弹窗 (标准 M 档 540px) -->
<div id="addUserModal" class="custom-modal" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="addUserModalTitle">
    <div class="modal-dialog-box modal-md">
        <div class="modal-head">
            <h4 id="addUserModalTitle">添加成员</h4>
            <button type="button" class="close-x" onclick="closeModal('addUserModal')" title="关闭"><i class="ri-close-line"></i></button>
        </div>
        <form onsubmit="handleCreateUser(event)" novalidate>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 14px;">
                <div>
                    <label class="m-label" for="newName">真实姓名 <span class="req-star">*</span></label>
                    <input type="text" id="newName" class="m-input" placeholder="例如：李明" required autocomplete="off" maxlength="20">
                </div>
                <div>
                    <label class="m-label" for="newEmail">工作邮箱 <span class="req-star">*</span></label>
                    <div style="position:relative;display:flex;align-items:center;">
                        <input type="text" id="newEmail" class="m-input" data-fixed-domain="<?php echo htmlspecialchars($fixedEmailDomain); ?>" placeholder="<?php echo $fixedEmailDomain ? '邮箱名' : '如：name@company.com'; ?>" required maxlength="100" style="flex:1;<?php echo $fixedEmailDomain ? ('padding-right:' . (mb_strlen($fixedEmailDomain)*8 + 32) . 'px;') : ''; ?>" oninput="handleEmailInputWithDomain(this, 'newUserDomainBadge')" autocomplete="off">
                        <?php if ($fixedEmailDomain): ?>
                            <span id="newUserDomainBadge" style="position:absolute;right:8px;font-size:12px;color:var(--text-3);background:var(--bg-tag,#f1f5f9);border:1px solid var(--border-light,#e2e8f0);padding:2px 7px;border-radius:4px;pointer-events:none;user-select:none;">@<?php echo htmlspecialchars($fixedEmailDomain); ?></span>
                        <?php endif; ?>
                    </div>
                </div>
                <div>
                    <label class="m-label" for="newPassword">初始密码 <span class="req-star">*</span></label>
                    <input type="password" id="newPassword" class="m-input" placeholder="至少 6 位密码" autocomplete="new-password" data-lpignore="true" required maxlength="64">
                </div>
                <div>
                    <label class="m-label" for="newRole">角色</label>
                    <select id="newRole" class="m-input">
                        <option value="editor">协作者</option>
                        <option value="admin">管理员</option>
                        <option value="viewer">审阅人</option>
                    </select>
                </div>
                <div style="grid-column: span 2;">
                    <label class="m-label" for="newDepartment">部门或职务 <span class="opt-tag">选填</span></label>
                    <input type="text" id="newDepartment" class="m-input" placeholder="如：研发部 · 前端工程师" maxlength="30">
                </div>
                <div style="grid-column: span 2;">
                    <label class="m-label" for="newWebhookUrl">
                        <span>个人通知</span>
                        <span class="opt-tag">选填</span>
                    </label>
                    <div class="m-form-row">
                        <input type="text" id="newWebhookUrl" class="m-input" placeholder="企微 / 飞书 / 钉钉群机器人 Webhook 地址" style="flex:1" maxlength="1000">
                        <button type="button" class="btn-cancel btn-standard" onclick="testAnyWebhook('newWebhookUrl', this)">
                            <i class="ri-send-plane-line"></i> 测试
                        </button>
                    </div>
                    <div style="font-size:11px;color:var(--text-3);margin-top:4px;line-height:1.4;">接收与该成员相关的批注回复与解决通知；钉钉/飞书安全设置勾选「自定义关键词」，填入：<strong>立象原型</strong></div>
                </div>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
                <button type="button" class="btn-cancel btn-standard" onclick="closeModal('addUserModal')">取消</button>
                <button type="submit" class="btn-primary btn-standard" id="btnUserAddSubmit">添加成员</button>
            </div>
        </form>
    </div>
</div>

<!-- 编辑成员信息弹窗 (标准 M 档 540px) -->
<div id="editUserModal" class="custom-modal" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="editUserModalTitle">
    <div class="modal-dialog-box modal-md">
        <div class="modal-head">
            <div style="display:flex;align-items:center;min-width:0;">
                <h4 id="editUserModalTitle" style="margin:0;">编辑成员</h4>
                <span id="editUserTargetName" style="font-size:12px;color:var(--text-2);background:var(--canvas);border:1px solid var(--border);padding:2px 8px;border-radius:4px;margin-left:8px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
            </div>
            <button type="button" class="close-x" onclick="closeModal('editUserModal')" title="关闭"><i class="ri-close-line"></i></button>
        </div>
        <form onsubmit="handleUpdateUser(event)" novalidate>
            <input type="hidden" id="editUserId" value="0">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 14px;">
                <div>
                    <label class="m-label" for="editUserName">真实姓名 <span class="req-star">*</span></label>
                    <input type="text" id="editUserName" class="m-input" placeholder="输入真实姓名" required autocomplete="off" maxlength="20">
                </div>
                <div>
                    <label class="m-label" for="editUserEmail">工作邮箱 <span class="req-star">*</span></label>
                    <input type="email" id="editUserEmail" class="m-input" placeholder="输入工作邮箱" required autocomplete="off" maxlength="100">
                </div>
                <div>
                    <label class="m-label" for="editUserPassword">新密码 <span class="opt-tag">选填</span></label>
                    <input type="password" id="editUserPassword" class="m-input" placeholder="留空则不修改密码" autocomplete="new-password" data-lpignore="true" maxlength="64">
                </div>
                <div>
                    <label class="m-label" for="editUserRole">角色</label>
                    <select id="editUserRole" class="m-input">
                        <option value="editor">协作者</option>
                        <option value="admin">管理员</option>
                        <option value="viewer">审阅人</option>
                    </select>
                </div>
                <div>
                    <label class="m-label" for="editUserStatus">账号状态</label>
                    <select id="editUserStatus" class="m-input">
                        <option value="1">已启用</option>
                        <option value="0">已停用</option>
                    </select>
                </div>
                <div>
                    <label class="m-label" for="editUserDepartment">部门或职务 <span class="opt-tag">选填</span></label>
                    <input type="text" id="editUserDepartment" class="m-input" placeholder="如：研发部 · 前端工程师" maxlength="30">
                </div>
                <div style="grid-column: span 2;">
                    <label class="m-label" for="editUserWebhook">
                        <span>个人通知</span>
                        <span class="opt-tag">选填</span>
                    </label>
                    <div class="m-form-row">
                        <input type="text" id="editUserWebhook" class="m-input" placeholder="企微 / 飞书 / 钉钉群机器人 Webhook 地址" style="flex:1" maxlength="1000">
                        <button type="button" class="btn-cancel btn-standard" onclick="testAnyWebhook('editUserWebhook', this)">
                            <i class="ri-send-plane-line"></i> 测试
                        </button>
                    </div>
                    <div style="font-size:11px;color:var(--text-3);margin-top:4px;line-height:1.4;">接收与该成员相关的批注回复与解决通知；钉钉/飞书安全设置勾选「自定义关键词」，填入：<strong>立象原型</strong></div>
                </div>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
                <button type="button" class="btn-cancel btn-standard" onclick="closeModal('editUserModal')">取消</button>
                <button type="submit" class="btn-primary btn-standard" id="btnUserUpdateSubmit">保存</button>
            </div>
        </form>
    </div>
</div>
<?php endif; ?>

<?php if (!empty($currentUser)): ?>
<!-- 全员个人设置：账号摘要 + 基本资料 / 安全设置 / MCP。 -->
<div id="profileModal" class="custom-modal" style="display:none;" aria-label="个人信息">
    <div class="modal-dialog-box modal-md">
        <div class="modal-head profile-modal-head">
            <div class="profile-account">
                <div class="profile-avatar">
                    <i class="ri-user-3-line" aria-hidden="true"></i>
                </div>
                <div class="profile-account-meta">
                    <div class="profile-name" id="myProfileHeaderName"><?php echo htmlspecialchars(!empty($currentUser['name']) ? $currentUser['name'] : (!empty($currentUser['email']) ? $currentUser['email'] : '用户')); ?></div>
                    <div class="profile-meta-row">
                        <span><?php echo htmlspecialchars($currentUser['email'] ?? ''); ?></span>
                        <span class="badge-tag <?php echo !empty($currentUser['is_owner']) ? 'badge-role-owner' : ($isAdmin ? 'badge-role-admin' : ($canManage ? 'badge-role-editor' : 'badge-role-viewer')); ?>"><?php echo !empty($currentUser['is_owner']) ? '主管理员' : ($isAdmin ? '管理员' : ($canManage ? '协作者' : '审阅人')); ?></span>
                    </div>
                </div>
            </div>
            <button type="button" class="close-x" onclick="closeModal('profileModal')" title="关闭"><i class="ri-close-line" aria-hidden="true"></i></button>
        </div>

        <div class="profile-tabs" role="tablist" aria-label="个人设置" onkeydown="handleProfileTabKey(event)">
            <button type="button" id="profileTabData" class="log-subtab-btn active" role="tab" aria-controls="profilePageData" aria-selected="true" tabindex="0" onclick="showProfilePage('data')">基本资料</button>
            <button type="button" id="profileTabPassword" class="log-subtab-btn" role="tab" aria-controls="profilePagePassword" aria-selected="false" tabindex="-1" onclick="showProfilePage('password')">安全设置</button>
            <button type="button" id="profileTabMcp" class="log-subtab-btn" role="tab" aria-controls="profilePageMcp" aria-selected="false" tabindex="-1" onclick="showProfilePage('mcp')">MCP 接入</button>
        </div>
        <div id="profilePageData" data-profile-page="data" role="tabpanel" aria-labelledby="profileTabData">
        <form id="profileForm" onsubmit="handleSaveProfile(event)">
            <div class="m-form-group">
                <label class="m-label" for="myDisplayName">真实姓名 <span class="req-star">*</span></label>
                <div class="m-form-row">
                <input type="text" id="myDisplayName" class="m-input" required value="<?php echo htmlspecialchars($currentUser['display_name'] ?? ''); ?>" placeholder="例如：李明" maxlength="20">
                <button type="submit" class="btn-primary btn-standard" id="btnSaveProfile" disabled>保存</button>
                </div>
            </div>
        </form>

        <div class="profile-notification">
            <label class="m-label" for="myWebhookUrl">个人通知 <span class="opt-tag">选填</span></label>
            <form id="profileWebhookForm" onsubmit="handleSaveProfileWebhook(event)">
                <div class="m-form-row profile-notification-row">
                <input type="text" id="myWebhookUrl" class="m-input" value="<?php echo htmlspecialchars($currentUser['webhook_url'] ?? ''); ?>" placeholder="企微 / 飞书 / 钉钉群机器人 Webhook 地址" maxlength="1000">
                <div class="profile-inline-actions">
                    <button type="button" class="btn-cancel btn-standard" onclick="testAnyWebhook('myWebhookUrl', this)">测试</button>
                    <button type="submit" class="btn-primary btn-standard" id="btnSaveProfileWebhook" disabled>保存</button>
                </div>
                </div>
                <div style="font-size:11.5px;color:var(--text-3);margin-top:6px;line-height:1.4;">接收与本人相关的批注回复与解决通知；钉钉/飞书安全设置勾选「自定义关键词」，填入：<strong>立象原型</strong></div>
            </form>
        </div>
        </div>
        <div id="profilePagePassword" data-profile-page="password" role="tabpanel" aria-labelledby="profileTabPassword" hidden>
            <form id="changePasswordForm" onsubmit="handleChangeMyPassword(event)">
                <div class="m-form-group" style="margin-bottom:10px;">
                    <label class="m-label" for="myOldPassword">当前密码 <span class="req-star">*</span></label>
                    <input type="password" id="myOldPassword" class="m-input" placeholder="输入当前密码" autocomplete="current-password" data-lpignore="true" required maxlength="64">
                </div>
                <div class="m-form-group" style="margin-bottom:10px;">
                    <label class="m-label" for="myNewPassword">新密码 <span class="req-star">*</span></label>
                    <input type="password" id="myNewPassword" class="m-input" placeholder="输入新密码 (至少 6 位)" autocomplete="new-password" data-lpignore="true" required maxlength="64">
                </div>
                <div class="m-form-group" style="margin-bottom:12px;">
                    <label class="m-label" for="myConfirmPassword">确认新密码 <span class="req-star">*</span></label>
                    <input type="password" id="myConfirmPassword" class="m-input" placeholder="再次确认新密码" autocomplete="new-password" data-lpignore="true" required maxlength="64">
                </div>
                <div class="profile-form-actions">
                    <button type="submit" class="btn-primary btn-standard">更新密码</button>
                </div>
            </form>
        </div>
        <div id="profilePageMcp" data-profile-page="mcp" role="tabpanel" aria-labelledby="profileTabMcp" class="mcp-panel" hidden>
            <div class="mcp-status-bar">
                <div class="mcp-status-info">
                    <span id="mcpCredentialStatus" class="mcp-auth-status" role="status">正在读取…</span>
                    <button type="button" id="mcpLoadRetry" class="btn-cancel btn-sm" onclick="loadMcpSettings()" hidden>重新加载</button>
                </div>
                <div class="mcp-status-actions">
                    <button type="button" id="mcpCreateButton" class="btn-cancel btn-sm" onclick="createMcpCredential(event)">生成凭据</button>
                    <button type="button" id="mcpRevokeButton" class="btn-cancel btn-sm" onclick="revokeMcpCredential()" hidden>撤销凭据</button>
                </div>
            </div>
            <fieldset id="mcpControls" class="profile-fieldset" disabled>
                <form id="mcpPermissionForm" onsubmit="handleMcpPermissionChange(event)">
                    <div class="m-form-group">
                        <label class="m-label" id="mcpProjectScopeLabel">项目范围</label>
                        <div class="mcp-scope-switch" role="radiogroup" aria-labelledby="mcpProjectScopeLabel">
                            <button type="button" id="mcpScopeModeAll" class="mcp-scope-btn active" role="radio" aria-checked="true" onclick="setMcpScopeMode('all')">全部项目</button>
                            <button type="button" id="mcpScopeModeCustom" class="mcp-scope-btn" role="radio" aria-checked="false" onclick="setMcpScopeMode('custom')">指定项目</button>
                        </div>
                    </div>
                    <div id="mcpCustomProjectsWrap" class="m-form-group" style="position:relative;margin-top:-6px;" hidden>
                        <button type="button" id="mcpProjectSelectTrigger" class="m-input m-input-trigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="mcpProjectSelectMenu" onclick="toggleMcpProjectDropdown(event)">
                            <span id="mcpProjectSelectTags" style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-width:0;">
                                <span style="font-size:12.5px;color:var(--text-3);">请选择项目…</span>
                            </span>
                            <i class="ri-arrow-down-s-line" style="color:var(--text-3);font-size:16px;margin-left:auto;flex-shrink:0;" aria-hidden="true"></i>
                        </button>
                        <div id="mcpProjectSelectMenu" class="mcp-dropdown-menu" role="group" aria-labelledby="mcpProjectScopeLabel" style="display:none;">
                            <div class="mcp-dropdown-header">
                                <span>授权项目</span>
                                <div class="mcp-dropdown-tools">
                                    <a href="javascript:void(0)" onclick="selectAllMcpProjects(true)">全选</a>
                                    <a href="javascript:void(0)" onclick="selectAllMcpProjects(false)">清空</a>
                                </div>
                            </div>
                            <div id="mcpProjectOptions" class="mcp-dropdown-options">
                                <!-- 由 JS 渲染选项 -->
                            </div>
                        </div>
                    </div>
                    <select id="mcpProjectScope" hidden><option value="0">全部项目</option></select>
                    <button type="submit" id="mcpSavePermissions" hidden></button>
                    <div class="mcp-switch-row">
                        <label class="mcp-switch-label" for="mcpPublishPermission">允许发布和替换版本</label>
                        <label class="linear-switch">
                            <input type="checkbox" id="mcpPublishPermission" onchange="autoSaveMcpPermissions()">
                            <span class="linear-switch-slider"></span>
                        </label>
                    </div>
                    <p id="mcpReadOnlyHint" class="mcp-tip-text" hidden>审阅人仅可读取项目与批注。</p>
                </form>
                <div id="mcpNewCredential" class="m-form-group" hidden>
                    <label class="m-label" for="mcpSecret">个人凭据</label>
                    <div class="m-form-row">
                        <input type="password" id="mcpSecret" class="m-input" readonly autocomplete="off">
                        <button type="button" class="btn-cancel btn-standard" onclick="copyMcpValue('mcpSecret')">复制凭据</button>
                    </div>
                    <p class="mcp-tip-text">完整凭据仅本次提供，请妥善保存。</p>
                </div>
                <button type="button" id="mcpCopyAiButton" class="btn-primary btn-standard mcp-btn-main" onclick="copyMcpAiPrompt()">复制 AI 接入指令</button>
                <div class="mcp-config-header">
                    <button type="button" id="mcpManualToggleBtn" class="mcp-manual-toggle" onclick="toggleMcpManualConfig()" aria-expanded="false" aria-controls="mcpManualBody">
                        <span class="mcp-manual-title">手动配置</span>
                        <span id="mcpManualToggleText" class="mcp-manual-toggle-text">展开</span>
                        <i id="mcpManualToggleIcon" class="ri-arrow-down-s-line" aria-hidden="true"></i>
                    </button>
                    <a class="mcp-guide-link" href="mcp.php?guide=1" target="_blank" rel="noopener">接入说明 <i class="ri-external-link-line" aria-hidden="true"></i></a>
                </div>
                <div id="mcpManualBody" class="mcp-manual-body" style="display:none;">
                    <div class="m-form-group">
                        <label class="m-label" for="mcpEndpoint">服务地址</label>
                        <div class="m-form-row"><input id="mcpEndpoint" class="m-input" readonly><button type="button" class="btn-cancel btn-standard" onclick="copyMcpValue('mcpEndpoint')">复制地址</button></div>
                    </div>
                    <div class="m-form-group">
                        <label class="m-label" for="mcpClientFormat">配置格式</label>
                        <select id="mcpClientFormat" class="m-input" onchange="renderMcpConfig()"><option value="json">JSON（Cursor 等）</option><option value="codex">TOML（Codex）</option></select>
                    </div>
                    <div class="mcp-code-wrapper">
                        <button type="button" class="btn-cancel btn-sm mcp-code-copy-btn" onclick="copyMcpConfig()" title="复制配置"><i class="ri-file-copy-line" aria-hidden="true"></i> 复制配置</button>
                        <pre id="mcpConfig" class="mcp-code" tabindex="0" aria-label="MCP 配置"></pre>
                    </div>
                    <p id="mcpConfigFilePath" class="mcp-tip-text"></p>
                    <p id="mcpConfigSecretHint" class="mcp-tip-text">配置中的 YOUR_PERSONAL_TOKEN 需替换为已保存的凭据；重新生成后可复制完整配置。</p>
                </div>
            </fieldset>
        </div>
    </div>
</div>
<?php endif; ?>

<?php if (!empty($currentUser) && (int)($currentUser['is_first_login'] ?? 0) === 1): ?>
<!-- 首次登录温和安全建议卡片 (软引导·不强打断) -->
<div id="firstLoginTipBanner" style="position:fixed;bottom:24px;right:24px;z-index:900;background:var(--surface);border:1px solid var(--border);box-shadow:0 8px 30px rgba(15,23,42,0.12);border-radius:var(--radius-lg);padding:14px 16px;max-width:380px;display:flex;flex-direction:column;gap:10px;">
    <div style="display:flex;align-items:flex-start;gap:10px;">
        <div style="width:32px;height:32px;border-radius:50%;background:var(--primary-subtle);color:var(--primary);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">
            <i class="ri-shield-keyhole-line"></i>
        </div>
        <div style="flex:1;">
            <div style="font-weight:600;font-size:13.5px;color:var(--text-1);">首次登录安全提醒</div>
            <div style="font-size:12px;color:var(--text-2);margin-top:2px;line-height:1.5;">当前账号使用的是初始密码，建议修改为您熟悉的私密密码。</div>
        </div>
        <button type="button" onclick="dismissFirstLoginTip()" style="border:none;background:transparent;color:var(--text-3);cursor:pointer;font-size:16px;padding:0;line-height:1;" title="稍后再说"><i class="ri-close-line"></i></button>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:2px;">
        <button type="button" class="btn-cancel btn-sm" onclick="dismissFirstLoginTip()">稍后再说</button>
        <button type="button" class="btn-primary btn-sm" onclick="openProfilePasswordModal()">立即修改</button>
    </div>
</div>
<?php endif; ?>

