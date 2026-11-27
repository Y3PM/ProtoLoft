<?php
/**
 * 就地管理所有模态弹窗组件 (含空间管理、用户管理、版本发布)
 */
// 获取当前所有正常状态成员 (基于邮箱与真实姓名二元模型)
$allUsers = $db->query("SELECT id, email, name, role FROM users WHERE status = 1 ORDER BY id ASC")->fetchAll();
$allUsersMap = [];
foreach ($db->query("SELECT id, email, name, role, status FROM users")->fetchAll() as $uRow) {
    $allUsersMap[(int)$uRow['id']] = $uRow;
}
$editorShareAllowed = Auth::getSetting('perm_editor_share', '1') !== '0';
$renderItemOwnersCell = function($item, $usersMap) use ($editorShareAllowed) {
    $actions = $editorShareAllowed ? t('admin.item.perm_ver_share') : t('admin.item.perm_ver');
    $collabIds = Auth::parseItemCollaborators($item);
    if (!empty($collabIds)) {
        $names = [];
        foreach ($collabIds as $cid) {
            $u = $usersMap[$cid] ?? null;
            if ($u) {
                $names[] = !empty($u['name']) ? $u['name'] : $u['email'];
            } else {
                $names[] = t('admin.item.member_id', ['id' => $cid]);
            }
        }
        $sep = I18n::getLocale() === 'en' ? ', ' : '、';
        $colon = I18n::getLocale() === 'en' ? ': ' : '：';
        $fullText = implode($sep, $names);
        $onlyText = t('admin.item.only_owners', ['names' => $fullText]);
        return '<span title="' . htmlspecialchars($actions . $colon . $onlyText, ENT_QUOTES, 'UTF-8') . '">' . htmlspecialchars($onlyText) . '</span>';
    }
    $colon = I18n::getLocale() === 'en' ? ': ' : '：';
    $allText = t('admin.item.all_editors');
    return '<span title="' . htmlspecialchars($actions . $colon . $allText, ENT_QUOTES, 'UTF-8') . '">' . htmlspecialchars($allText) . '</span>';
};
?>
<?php if ($canManage): ?>
<!-- 1. 发布/更新版本弹窗 (标准 M 档 540px) -->
<div id="uploadModal" class="custom-modal" style="display:none;">
    <div class="modal-dialog-box modal-md">
        <div class="modal-head">
            <h4 id="uploadModalTitle"><?php echo htmlspecialchars(t('admin.upload.title')); ?></h4>
            <button type="button" class="close-x" onclick="closeModal('uploadModal')" title="<?php echo htmlspecialchars(t('common.close')); ?>"><i class="ri-close-line"></i></button>
        </div>
        <form id="uploadVersionForm" onsubmit="handleVersionUpload(event)" novalidate>
            <input type="hidden" id="uploadItemId" name="item_id">
            
            <div class="m-form-group">
                <label class="m-label"><?php echo htmlspecialchars(t('admin.upload.project_label')); ?> <span class="req-star">*</span></label>
                <select id="uploadItemSelect" class="m-input" required onchange="onUploadItemSelectChange(this.value)">
                    <?php 
                    if (!empty($cats) && !empty($catItems)) {
                        foreach ($cats as $c) {
                            $cItems = $catItems[$c['id']] ?? [];
                            $editableProjs = [];
                            foreach ($cItems as $it) {
                                if ($it['type'] === 'project' && Auth::canEditItem($it, $currentUser)) {
                                    $editableProjs[] = $it;
                                }
                            }
                            if (!empty($editableProjs)) {
                                echo '<optgroup label="' . htmlspecialchars($c['name']) . '" data-cat-id="' . (int)$c['id'] . '">';
                                foreach ($editableProjs as $p) {
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
                    <label class="m-label" style="margin-bottom:0;"><?php echo htmlspecialchars(t('admin.upload.ver_label')); ?> <span class="req-star">*</span></label>
                    <span id="uploadLastVerHint" class="upload-last-ver-hint" style="display:none;font-size:12px;color:var(--text-3);">
                        <?php echo htmlspecialchars(t('admin.upload.last_ver_prefix')); ?><strong style="color:var(--text-1);font-weight:550;cursor:pointer;" id="uploadLastVerName" onclick="applyUploadLastVerSuggestion()" title="<?php echo htmlspecialchars(t('admin.upload.last_ver_tip')); ?>"></strong>
                    </span>
                </div>
                <input type="text" id="uploadVerName" name="version_name" class="m-input" placeholder="<?php echo htmlspecialchars(t('ver.name_placeholder')); ?>" required autocomplete="off" maxlength="30" oninput="onUploadVersionNameInput(this)">
                <span id="uploadVersionHint" class="m-form-hint" hidden style="margin-top:4px;font-size:12px;color:var(--warning);display:block;"></span>
            </div>

            <div class="m-form-group">
                <label class="m-label"><?php echo htmlspecialchars(t('admin.upload.proto_label')); ?> <span class="req-star">*</span></label>
                <div class="proto-drop-zone" id="protoDropZone">
                    <input type="file" id="uploadZipFile" name="zip_file" accept=".zip" class="custom-file-input" onchange="handleZipSelected(this)">
                    <input type="file" id="uploadFolderInput" webkitdirectory directory class="custom-file-input" onchange="handleFolderSelected(this)">
                    <div class="proto-drop-actions" id="protoDropActions">
                        <button type="button" class="btn-file-select" onclick="triggerFileInput('uploadZipFile')"><span class="duo-icon-slot" data-duo-icon="file-archive"><i class="ri-file-zip-line duo-rest-icon"></i></span> <?php echo htmlspecialchars(t('admin.upload.pick_zip')); ?></button>
                        <button type="button" class="btn-file-select" onclick="triggerFileInput('uploadFolderInput')"><span class="duo-icon-slot" data-duo-icon="folder-open"><i class="ri-folder-upload-line duo-rest-icon"></i></span> <?php echo htmlspecialchars(t('admin.upload.pick_folder')); ?></button>
                        <span class="proto-drop-hint"><?php echo htmlspecialchars(t('admin.upload.drop_proto_hint')); ?></span>
                    </div>
                    <div class="proto-file-badge" id="protoFileBadge" style="display:none;">
                        <i class="ri-file-check-line" id="protoFileBadgeIcon"></i>
                        <span class="proto-file-badge-text" id="protoFileBadgeText"></span>
                        <button type="button" id="protoFolderManageBtn" class="btn-sm btn-cancel proto-folder-manage-btn" hidden onclick="openFolderFilesModal()" title="<?php echo htmlspecialchars(t('admin.upload.filter_files_tip')); ?>"><span class="duo-icon-slot" data-duo-icon="list-checks"><i class="ri-list-check-2 duo-rest-icon"></i></span> <?php echo htmlspecialchars(t('admin.upload.filter_files')); ?></button>
                        <button type="button" class="proto-file-badge-clear" onclick="clearSelectedProtoSource(event)" title="<?php echo htmlspecialchars(t('admin.upload.clear_file_tip')); ?>"><i class="ri-close-line"></i></button>
                    </div>
                    <span class="file-name-display" id="uploadZipName" style="display:none;"></span>
                </div>
            </div>

            <div class="m-form-group">
                <label class="m-label"><?php echo htmlspecialchars(t('admin.upload.rp_label')); ?> <span class="opt-tag"><?php echo htmlspecialchars(t('common.optional')); ?></span></label>
                <div class="proto-drop-zone" id="rpDropZone">
                    <input type="file" id="uploadRpFile" name="rp_file" accept=".rp" class="custom-file-input" onchange="handleRpSelected(this)">
                    <div class="proto-drop-actions" id="rpDropActions">
                        <button type="button" class="btn-file-select" onclick="triggerFileInput('uploadRpFile')"><span class="duo-icon-slot" data-duo-icon="file-text"><i class="ri-draft-line duo-rest-icon"></i></span> <?php echo htmlspecialchars(t('admin.upload.pick_rp')); ?></button>
                        <span class="proto-drop-hint"><?php echo htmlspecialchars(t('admin.upload.drop_rp_hint')); ?></span>
                    </div>
                    <div class="proto-file-badge" id="rpFileBadge" style="display:none;">
                        <i class="ri-draft-line" id="rpFileBadgeIcon"></i>
                        <span class="proto-file-badge-text" id="rpFileBadgeText"></span>
                        <button type="button" class="proto-file-badge-clear" onclick="clearSelectedRpFile(event)" title="<?php echo htmlspecialchars(t('admin.upload.clear_file_tip')); ?>"><i class="ri-close-line"></i></button>
                    </div>
                    <span class="file-name-display" id="uploadRpName" style="display:none;"></span>
                </div>
            </div>

            <div class="m-form-group">
                <div class="upload-label-row">
                    <label class="m-label" id="uploadChangelogLabel" for="uploadChangelog">
                        <span><?php echo htmlspecialchars(t('ver.changelog_label')); ?> <span class="req-star" id="changelogReqStar" style="display:none;">*</span></span>
                        <span class="opt-tag" id="changelogOptTag"><?php echo htmlspecialchars(t('common.optional')); ?></span>
                    </label>
                    <button type="button" id="uploadLastLogBtn" class="upload-last-log-btn" hidden onclick="appendUploadLastChangelog()" title="<?php echo htmlspecialchars(t('admin.upload.append_last_log_tip')); ?>">
                        <i class="ri-add-line"></i> <?php echo htmlspecialchars(t('admin.upload.append_last_log')); ?>
                    </button>
                </div>
                <textarea id="uploadChangelog" name="changelog" class="m-input upload-changelog" placeholder="<?php echo htmlspecialchars(t('admin.upload.changelog_placeholder')); ?>" maxlength="3000" oninput="this.classList.remove('m-input-error')"></textarea>
            </div>

            <!-- 发送群通知双列独立控制 (常驻显示，避免认知波动) -->
            <div class="m-form-group">
                <label class="m-label"><?php echo htmlspecialchars(t('admin.upload.notify_label')); ?></label>
                <div class="upload-notify-grid" id="uploadNotifyGrid">
                    <!-- 左列：项目群通知 -->
                    <div class="upload-notify-card" id="uploadNotifyItemCard">
                        <div class="upload-notify-card-info">
                            <div class="upload-notify-card-title">
                                <i class="ri-team-line"></i>
                                <span><?php echo htmlspecialchars(t('admin.upload.notify_item')); ?></span>
                            </div>
                            <div class="upload-notify-card-status" id="uploadNotifyItemStatus"><?php echo htmlspecialchars(t('common.unconfigured')); ?></div>
                        </div>
                        <div class="upload-notify-card-control">
                            <label class="linear-switch" id="uploadNotifyItemSwitchLabel">
                                <input type="checkbox" id="notifyItemWebhook" name="notify_item" value="1" onchange="handleNotifyTargetChange()" aria-label="<?php echo htmlspecialchars(t('admin.upload.notify_item')); ?>">
                                <span class="linear-switch-slider"></span>
                            </label>
                        </div>
                    </div>

                    <!-- 右列：评审群通知 -->
                    <div class="upload-notify-card" id="uploadNotifyGlobalCard">
                        <div class="upload-notify-card-info">
                            <div class="upload-notify-card-title">
                                <i class="ri-broadcast-line"></i>
                                <span><?php echo htmlspecialchars(t('admin.upload.notify_global')); ?></span>
                            </div>
                            <div class="upload-notify-card-status" id="uploadNotifyGlobalStatus"><?php echo htmlspecialchars(t('common.unconfigured')); ?></div>
                        </div>
                        <div class="upload-notify-card-control">
                            <label class="linear-switch" id="uploadNotifyGlobalSwitchLabel">
                                <input type="checkbox" id="notifyGlobalWebhook" name="notify_global" value="1" onchange="handleNotifyTargetChange()" aria-label="<?php echo htmlspecialchars(t('admin.upload.notify_global')); ?>">
                                <span class="linear-switch-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <input type="hidden" name="is_default" value="1">

            <div id="uploadProgressWrap" style="display:none;margin-bottom:16px;">
                <div style="font-size:12px;color:var(--primary);display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span id="uploadProgressText"><?php echo htmlspecialchars(t('admin.upload.uploading_default')); ?></span>
                    <span id="uploadProgressPercent">0%</span>
                </div>
                <div style="height:5px;background:var(--surface-active);border-radius:3px;overflow:hidden;">
                    <div id="uploadProgressBar" style="width:0%;height:100%;background:var(--primary);transition:width 0.15s;"></div>
                </div>
            </div>

            <div class="m-modal-footer">
                <button type="button" class="btn-cancel btn-standard" onclick="closeModal('uploadModal')"><?php echo htmlspecialchars(t('common.cancel')); ?></button>
                <button type="submit" class="btn-primary btn-standard" id="btnUploadSubmit"><?php echo htmlspecialchars(t('admin.upload.submit')); ?></button>
            </div>
        </form>
    </div>
</div>

<!-- 1.0.1 文件夹上传内容筛选弹窗 (标准 L 档 640px) -->
<div id="folderFilesModal" class="custom-modal" style="display:none;">
    <div class="modal-dialog-box modal-lg folder-files-modal-box">
        <div class="modal-head folder-files-head">
            <div class="ver-modal-heading">
                <h4><?php echo htmlspecialchars(t('admin.ff.title')); ?></h4>
                <span id="folderFilesRootBadge" class="m-badge m-badge-neutral"></span>
            </div>
            <button type="button" class="close-x" onclick="closeModal('folderFilesModal')" title="<?php echo htmlspecialchars(t('common.close')); ?>"><i class="ri-close-line"></i></button>
        </div>

        <div class="folder-files-toolbar">
            <div class="m-input m-input-sm ver-manage-search-wrap folder-files-search-wrap">
                <i class="ri-search-line ver-manage-search-icon" aria-hidden="true"></i>
                <input type="text" id="folderFilesSearchInput" class="ver-manage-search-input" aria-label="<?php echo htmlspecialchars(t('admin.ff.search_placeholder')); ?>" placeholder="<?php echo htmlspecialchars(t('admin.ff.search_placeholder')); ?>" autocomplete="off" oninput="onFolderFilesSearchInput(this.value)">
                <button type="button" id="folderFilesSearchClear" class="close-x" hidden onclick="clearFolderFilesSearch()" title="<?php echo htmlspecialchars(t('workspace.clear_search')); ?>"><i class="ri-close-line"></i></button>
            </div>
            <div class="folder-files-toolbar-actions">
                <button type="button" id="folderFilesViewAllBtn" class="btn-sm btn-cancel is-active" onclick="setFolderFilesViewMode('all')"><?php echo htmlspecialchars(t('admin.ff.view_all')); ?></button>
                <button type="button" id="folderFilesViewExclBtn" class="btn-sm btn-cancel" onclick="setFolderFilesViewMode('excluded')"><?php echo htmlspecialchars(t('admin.ff.view_excluded')); ?> (<span id="folderFilesExclCount">0</span>)</button>
                <span class="folder-files-toolbar-sep" aria-hidden="true"></span>
                <button type="button" id="folderFilesCheckAllBtn" class="btn-sm btn-cancel" onclick="toggleFolderFilesVisibleSelection(true)"><?php echo htmlspecialchars(t('admin.ff.check_all')); ?></button>
                <button type="button" id="folderFilesUncheckAllBtn" class="btn-sm btn-cancel" onclick="toggleFolderFilesVisibleSelection(false)"><?php echo htmlspecialchars(t('admin.ff.uncheck_all')); ?></button>
            </div>
        </div>

        <div id="folderFilesTreeWrap" class="folder-files-tree-wrap">
            <div id="folderFilesTreeBody" class="folder-files-tree-body"></div>
            <div id="folderFilesEmptyState" class="folder-files-empty" hidden></div>
        </div>

        <div class="folder-files-footer">
            <div class="folder-files-summary" id="folderFilesSummary"></div>
            <div class="folder-files-footer-btns">
                <button type="button" class="btn-cancel btn-standard" onclick="closeModal('folderFilesModal')"><?php echo htmlspecialchars(t('common.cancel')); ?></button>
                <button type="button" id="folderFilesApplyBtn" class="btn-primary btn-standard" onclick="applyFolderFilesFilter()"><?php echo htmlspecialchars(t('common.confirm')); ?></button>
            </div>
        </div>
    </div>
</div>

<!-- 1.1 版本管理：卡片流、搜索与分页。 -->
<div id="versionManageModal" class="custom-modal" style="display:none;">
    <div class="modal-dialog-box modal-ver">
        <div class="modal-head">
            <div class="ver-modal-heading">
                <h4 id="verManageTitle"><?php echo htmlspecialchars(t('ver.manage_title')); ?></h4>
                <span id="verManageCountBadge" class="m-badge m-badge-neutral" style="display:none;"></span>
            </div>
            <div class="m-input m-input-md ver-manage-search-wrap" id="verManageSearchWrap" style="display:none;">
                <i class="ri-search-line ver-manage-search-icon" aria-hidden="true"></i>
                <input type="text" id="verManageSearchInput" class="ver-manage-search-input" aria-label="<?php echo htmlspecialchars(t('ver.search_placeholder')); ?>" placeholder="<?php echo htmlspecialchars(t('ver.search_placeholder')); ?>" oninput="handleVerManageSearch(this.value)">
                <button type="button" id="verManageSearchClear" class="close-x" onclick="clearVerManageSearch()" style="display:none;" title="<?php echo htmlspecialchars(t('workspace.clear_search')); ?>"><i class="ri-close-line"></i></button>
            </div>
            <button type="button" id="btnVerManagePublish" class="btn-primary btn-sm" hidden style="margin-left:auto;margin-right:6px;" onclick="publishFromVerManage()" title="<?php echo htmlspecialchars(t('ver.publish_new_tip')); ?>">
                <span class="duo-icon-slot" data-duo-icon="cloud-upload"><i class="ri-upload-cloud-line duo-rest-icon"></i></span> <?php echo htmlspecialchars(t('ver.publish_new')); ?>
            </button>
            <button type="button" class="close-x" onclick="closeModal('versionManageModal')" title="<?php echo htmlspecialchars(t('common.close')); ?>"><i class="ri-close-line"></i></button>
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
            <h4 id="verEditModalTitle"><?php echo htmlspecialchars(t('ver.edit_title')); ?></h4>
            <button type="button" class="close-x" onclick="closeModal('versionEditModal')" title="<?php echo htmlspecialchars(t('common.close')); ?>"><i class="ri-close-line"></i></button>
        </div>
        <form id="versionEditForm" onsubmit="handleVersionEditSubmit(event)" novalidate>
            <input type="hidden" id="editVerId" value="0">
            <input type="hidden" id="editVerItemId" value="0">
            
            <div class="m-form-group">
                <label class="m-label"><?php echo htmlspecialchars(t('ver.name_label')); ?> <span class="req-star">*</span></label>
                <input type="text" id="editVerName" class="m-input" placeholder="<?php echo htmlspecialchars(t('ver.name_placeholder')); ?>" required autocomplete="off" maxlength="30">
            </div>

            <div class="m-form-group">
                <label class="m-label"><?php echo htmlspecialchars(t('ver.changelog_label')); ?></label>
                <textarea id="editVerChangelog" class="m-input" style="height:90px;resize:vertical;line-height:1.5;padding:8px 10px;" placeholder="<?php echo htmlspecialchars(t('ver.changelog_edit_placeholder')); ?>" maxlength="3000"></textarea>
            </div>

            <div class="m-modal-footer">
                <button type="button" class="btn-cancel btn-standard" onclick="closeModal('versionEditModal')"><?php echo htmlspecialchars(t('common.cancel')); ?></button>
                <button type="submit" id="btnSaveVerEdit" class="btn-primary btn-standard"><?php echo htmlspecialchars(t('common.save')); ?></button>
            </div>
        </form>
    </div>
</div>

<!-- 2. 分类管理弹窗 (标准 S 档 440px) -->
<div id="categoryModal" class="custom-modal" style="display:none;">
    <div class="modal-dialog-box modal-sm">
        <div class="modal-head">
            <h4 id="catModalTitle"><?php echo htmlspecialchars(t('admin.cat.new_title')); ?></h4>
            <button type="button" class="close-x" onclick="closeModal('categoryModal')" title="<?php echo htmlspecialchars(t('common.close')); ?>"><i class="ri-close-line"></i></button>
        </div>
        <form onsubmit="handleCategorySave(event)" novalidate>
            <input type="hidden" id="catId" value="0">
            <div class="m-form-group">
                <label class="m-label" for="catName"><?php echo htmlspecialchars(t('admin.cat.name_label')); ?> <span class="req-star">*</span></label>
                <input type="text" id="catName" class="m-input" placeholder="<?php echo htmlspecialchars(t('admin.cat.name_placeholder')); ?>" required maxlength="20" data-error-target="catNameError" aria-errormessage="catNameError">
                <div class="field-error-tip" id="catNameError" role="alert"></div>
            </div>
            <div class="m-modal-footer">
                <button type="button" class="btn-cancel btn-standard" onclick="closeModal('categoryModal')"><?php echo htmlspecialchars(t('common.cancel')); ?></button>
                <button type="submit" class="btn-primary btn-standard"><?php echo htmlspecialchars(t('common.save')); ?></button>
            </div>
        </form>
    </div>
</div>

<!-- 3. 新建/编辑项目与外链弹窗 (标准 M 档 540px) -->
<div id="itemModal" class="custom-modal" style="display:none;">
    <div class="modal-dialog-box modal-md">
        <div class="modal-head">
            <h4 id="itemModalTitle"><?php echo htmlspecialchars(t('admin.item.new_project')); ?></h4>
            <button type="button" class="close-x" onclick="closeModal('itemModal')" title="<?php echo htmlspecialchars(t('common.close')); ?>"><i class="ri-close-line"></i></button>
        </div>
        <form onsubmit="handleItemSave(event)" novalidate>
            <input type="hidden" id="editItemId" value="0">
            <input type="hidden" id="itemType" value="project">
            
            <div class="m-form-group">
                <label class="m-label"><?php echo htmlspecialchars(t('admin.item.folder_label')); ?> <span class="req-star">*</span></label>
                <select id="itemCatSelect" class="m-input" required>
                    <?php foreach ($cats as $c): ?>
                        <option value="<?php echo $c['id']; ?>"><?php echo htmlspecialchars($c['name']); ?></option>
                    <?php endforeach; ?>
                </select>
            </div>

            <div class="m-form-group">
                <label class="m-label" id="itemNameLabel"><?php echo htmlspecialchars(t('admin.item.project_name')); ?> <span class="req-star">*</span></label>
                <input type="text" id="itemName" class="m-input" placeholder="<?php echo htmlspecialchars(t('admin.item.project_name_placeholder')); ?>" required maxlength="40">
            </div>

            <div class="m-form-group item-owners-group" id="itemOwnersGroup" data-editor-share="<?php echo $editorShareAllowed ? '1' : '0'; ?>">
                <label class="m-label" for="itemCollaborationScope"><?php echo htmlspecialchars(t('admin.item.collab_scope')); ?></label>
                <select id="itemCollaborationScope" class="m-select" onchange="onItemCollaborationScopeChange()" aria-controls="itemOwnersSelection">
                    <option value="all"><?php echo htmlspecialchars($editorShareAllowed ? t('admin.item.scope_all_ver_share') : t('admin.item.scope_all_ver')); ?></option>
                    <option value="selected"><?php echo htmlspecialchars($editorShareAllowed ? t('admin.item.scope_sel_ver_share') : t('admin.item.scope_sel_ver')); ?></option>
                </select>
                <input type="hidden" id="itemCollaborators" value="">
                <div id="itemOwnersSelection" class="item-owners-selection" hidden>
                <label class="m-label" id="itemOwnersLabel"><?php echo htmlspecialchars(t('admin.item.owners_label')); ?></label>
                <button type="button" id="itemOwnersTrigger" class="m-input m-input-trigger" aria-labelledby="itemOwnersLabel" aria-describedby="itemCollaboratorsError" data-error-target="itemCollaboratorsError" aria-expanded="false" aria-controls="itemOwnersMenu" onclick="toggleItemOwnersDropdown(event)">
                    <span id="itemOwnersTags" class="item-owners-tags"></span>
                    <i class="ri-arrow-down-s-line item-owners-arrow"></i>
                </button>
                <div id="itemOwnersMenu" class="mcp-dropdown-menu" role="group" aria-labelledby="itemOwnersLabel" style="display:none;" onclick="event.stopPropagation()">
                    <div class="mcp-dropdown-header">
                        <span><?php echo htmlspecialchars(t('admin.item.select_owners')); ?></span>
                    </div>
                    <div id="itemOwnersOptions" class="mcp-dropdown-options">
                        <?php foreach ($allUsers as $u): ?>
                            <?php if (!in_array($u['role'], ['admin', 'editor'], true)) continue; ?>
                            <?php $uDisplay = !empty($u['name']) ? $u['name'] : $u['email']; ?>
                            <label class="mcp-project-option">
                                <input type="checkbox" class="item-owner-cb" value="<?php echo (int)$u['id']; ?>" data-name="<?php echo htmlspecialchars($uDisplay, ENT_QUOTES, 'UTF-8'); ?>" onchange="onItemOwnersChange()">
                                <span><?php echo htmlspecialchars($uDisplay); ?><?php echo $u['role'] === 'admin' ? htmlspecialchars(t('admin.item.role_admin_tag')) : ''; ?></span>
                            </label>
                        <?php endforeach; ?>
                    </div>
                </div>
                <div id="itemCollaboratorsError" class="field-error-tip" role="alert"></div>
                </div>
            </div>

            <div id="linkFields" style="display:none;">
                <div class="m-form-group">
                    <label class="m-label"><?php echo htmlspecialchars(t('admin.item.link_url')); ?> <span class="req-star">*</span></label>
                    <input type="text" id="itemLinkUrl" class="m-input" placeholder="https://..." maxlength="2000">
                </div>
                <div class="m-form-group">
                    <label class="m-label"><?php echo htmlspecialchars(t('admin.item.open_mode')); ?></label>
                    <select id="itemLinkTarget" class="m-input">
                        <option value="_blank"><?php echo htmlspecialchars(t('admin.proj.open_new_tab')); ?></option>
                        <option value="myFrame"><?php echo htmlspecialchars(t('admin.proj.open_embed')); ?></option>
                    </select>
                </div>
            </div>

            <div class="m-form-group" id="itemWebhookGroup">
                <label class="m-label">
                    <span><?php echo htmlspecialchars(t('admin.upload.notify_item')); ?></span>
                    <span class="opt-tag"><?php echo htmlspecialchars(t('common.optional')); ?></span>
                </label>
                <div class="m-form-row">
                    <input type="text" id="itemWebhookUrl" class="m-input" placeholder="<?php echo htmlspecialchars(t('profile.webhook_placeholder')); ?>" style="flex:1" maxlength="1000">
                    <button type="button" class="btn-cancel btn-standard" onclick="testAnyWebhook('itemWebhookUrl', this)">
                        <span class="duo-icon-slot" data-duo-icon="send"><i class="ri-send-plane-line duo-rest-icon"></i></span> <?php echo htmlspecialchars(t('common.test')); ?>
                    </button>
                </div>
                <div style="font-size:11.5px;color:var(--text-3);margin-top:5px;line-height:1.4;"><?php echo t('admin.item.item_webhook_hint'); ?></div>
            </div>

            <div class="m-modal-footer">
                <button type="button" class="btn-cancel btn-standard" onclick="closeModal('itemModal')"><?php echo htmlspecialchars(t('common.cancel')); ?></button>
                <button type="submit" class="btn-primary btn-standard" id="btnItemSubmit"><?php echo htmlspecialchars(t('common.save')); ?></button>
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
                <h4 style="margin:0;font-size:15.5px;font-weight:600;color:var(--text-1);"><?php echo htmlspecialchars(t('share.modal_title')); ?></h4>
                <span id="shareItemName" style="font-size:12.5px;color:var(--text-2);background:var(--canvas);border:1px solid var(--border);padding:2px 8px;border-radius:4px;margin-left:8px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
            </div>
            <button type="button" class="close-x" onclick="closeModal('shareManageModal')" title="<?php echo htmlspecialchars(t('common.close')); ?>"><i class="ri-close-line"></i></button>
        </div>

        <input type="hidden" id="shareItemId" value="0">

        <!-- 弹窗可滚动主体区 -->
        <div style="flex:1; overflow-y:auto; padding-right:2px; margin-right:-2px;">
            <!-- 模块 1: 默认公共直链 (长效稳定) -->
            <div style="margin-bottom: 20px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                    <div style="font-size:13px;font-weight:600;color:var(--text-1);display:inline-flex;align-items:center;gap:6px;">
                        <i class="ri-links-line" style="color:var(--primary);"></i> <?php echo htmlspecialchars(t('share.default_link_title')); ?>
                    </div>
                    <span style="font-size:11.5px;color:var(--text-3);"><?php echo htmlspecialchars(t('share.follow_default_ver')); ?></span>
                </div>

                <!-- 默认短参直链展示与快捷复制 -->
                <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;">
                    <input type="text" id="shareUrlDisplay" class="m-input" readonly style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;flex:1;background:var(--canvas);color:var(--text-1)" onclick="this.select()">
                    <button type="button" class="btn-primary btn-standard" id="btnCopyShareModal" onclick="copyFromShareModal()">
                        <span class="duo-icon-slot" data-duo-icon="copy"><i class="ri-file-copy-line duo-rest-icon"></i></span> <?php echo htmlspecialchars(t('common.copy')); ?>
                    </button>
                    <a href="javascript:void(0)" id="btnOpenSharePreview" target="_blank" class="btn-cancel btn-standard" style="color:var(--text-2)" title="<?php echo htmlspecialchars(t('share.open_preview_tip')); ?>"><span class="duo-icon-slot" data-duo-icon="external-link"><i class="ri-external-link-line duo-rest-icon"></i></span></a>
                </div>

                <!-- 默认密码 -->
                <div data-share-manage style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
                    <label class="m-label share-form-label"><?php echo htmlspecialchars(t('share.access_pwd')); ?> <span class="opt-tag"><?php echo htmlspecialchars(t('common.optional')); ?></span></label>
                    <div class="m-form-row" style="flex:1">
                        <input type="text" id="sharePasswordInput" class="m-input" placeholder="<?php echo htmlspecialchars(t('share.pwd_placeholder')); ?>" style="flex:1" maxlength="16">
                        <button type="button" class="btn-cancel btn-standard" onclick="generateRandomSharePwd()"><?php echo htmlspecialchars(t('share.random_btn')); ?></button>
                    </div>
                </div>

                <!-- 默认外链状态开关与保存 -->
                <div data-share-manage style="display:flex;align-items:center;justify-content:space-between;padding-top:2px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <label class="m-label share-form-label"><?php echo htmlspecialchars(t('share.public_access')); ?></label>
                        <label class="switch-control" style="margin:0;">
                            <input type="checkbox" id="shareEnabledSwitch" checked onchange="onShareSwitchChange(this.checked)">
                            <span class="switch-slider"></span>
                            <span class="switch-label-text" id="shareEnabledText" style="color:var(--success);font-weight:500;"><?php echo htmlspecialchars(t('share.allow_access')); ?></span>
                        </label>
                    </div>
                    <button type="button" class="btn-cancel btn-standard" id="btnSaveDefaultShare" onclick="saveShareSettingsFromModal()">
                        <span class="duo-icon-slot" data-duo-icon="save"><i class="ri-save-line duo-rest-icon"></i></span> <?php echo htmlspecialchars(t('common.save')); ?>
                    </button>
                </div>
            </div>

            <!-- 分割线 -->
            <div style="height:1px;background:var(--border);margin-bottom:18px;"></div>

            <!-- 模块 2: 专属外发分享与生效中记录表 -->
            <div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                    <div style="font-size:13px;font-weight:600;color:var(--text-1);display:inline-flex;align-items:center;gap:6px;">
                        <i class="ri-shield-user-line" style="color:var(--primary);"></i> <?php echo htmlspecialchars(t('share.custom_links_title')); ?>
                        <span id="activeShareBadge" style="font-size:11px;font-weight:600;color:var(--primary);background:var(--primary-subtle);padding:1px 6px;border-radius:10px;"></span>
                    </div>
                    <button type="button" class="btn-act duo-hover-btn" id="btnToggleNewCustomShare" data-duo-icon="plus-square" onclick="toggleCustomSharePanel()" title="<?php echo htmlspecialchars(t('share.create_custom_tip')); ?>">
                        <i class="ri-add-line duo-rest-icon"></i>
                    </button>
                </div>

                <!-- 创建专属分享轻量展开面板 -->
                <div id="customShareCreatePanel" style="display:none;background:var(--canvas);border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin-bottom:14px;">
                    <div style="font-size:12.5px;font-weight:600;color:var(--text-1);margin-bottom:10px;"><?php echo htmlspecialchars(t('share.create_custom_title')); ?></div>
                    <div style="display:flex;flex-direction:column;gap:10px;">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <label class="m-label share-form-label"><?php echo htmlspecialchars(t('share.label_field')); ?> <span class="opt-tag"><?php echo htmlspecialchars(t('common.optional')); ?></span></label>
                            <input type="text" id="customShareLabelInput" class="m-input" placeholder="<?php echo htmlspecialchars(t('share.label_placeholder')); ?>" style="flex:1" maxlength="20">
                        </div>
                        <div style="display:flex;align-items:center;gap:10px;">
                            <label class="m-label share-form-label"><?php echo htmlspecialchars(t('share.access_pwd')); ?> <span class="opt-tag"><?php echo htmlspecialchars(t('common.optional')); ?></span></label>
                            <div class="m-form-row" style="flex:1">
                                <input type="text" id="customSharePwdInput" class="m-input" placeholder="<?php echo htmlspecialchars(t('share.pwd_placeholder')); ?>" style="flex:1" maxlength="16">
                                <button type="button" class="btn-cancel btn-standard" style="color:var(--text-2)" onclick="generateRandomCustomSharePwd()"><?php echo htmlspecialchars(t('share.random_btn')); ?></button>
                            </div>
                        </div>
                        <div style="display:flex;align-items:center;gap:10px;">
                            <label class="m-label share-form-label"><?php echo htmlspecialchars(t('share.expire_field')); ?></label>
                            <div style="flex:1;">
                                <select id="customShareExpirePreset" class="m-input" style="width:100%" onchange="onCustomShareExpirePresetChange(this.value)">
                                    <option value="7d"><?php echo htmlspecialchars(t('share.expire_7d')); ?></option>
                                    <option value="30d"><?php echo htmlspecialchars(t('share.expire_30d')); ?></option>
                                    <option value="custom"><?php echo htmlspecialchars(t('share.expire_custom')); ?></option>
                                    <option value="forever"><?php echo htmlspecialchars(t('share.expire_forever')); ?></option>
                                </select>
                                <div id="customShareDateGroup" hidden class="m-form-group share-date-group"><label class="m-label" for="customShareExpireCustomDate"><?php echo htmlspecialchars(t('share.expire_date_label')); ?> <span class="req-star">*</span></label><input type="date" id="customShareExpireCustomDate" class="m-input"></div>
                            </div>
                        </div>
                        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px;">
                            <button type="button" class="btn-cancel btn-standard" onclick="toggleCustomSharePanel(false)"><?php echo htmlspecialchars(t('common.cancel')); ?></button>
                            <button type="button" class="btn-primary btn-standard" id="btnSubmitCustomShare" onclick="submitCreateCustomShare()">
                                <span class="duo-icon-slot" data-duo-icon="circle-check"><i class="ri-check-line duo-rest-icon"></i></span> <?php echo htmlspecialchars(t('share.create_and_copy')); ?>
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
<div id="adminConsoleModal" class="admin-console-modal" aria-label="<?php echo htmlspecialchars(t('admin.console')); ?>" style="display:none;">
    <div class="admin-console-box">
        <!-- 左侧二级功能导航 -->
        <div class="admin-nav">
            <div class="admin-nav-header">
                <i class="ri-dashboard-2-line" style="font-size:18px;color:var(--primary);"></i>
                <div style="font-weight:600;font-size:14px;color:var(--text-1);"><?php echo htmlspecialchars(t('admin.console')); ?></div>
            </div>
            <div class="admin-nav-body">
                <button type="button" class="admin-nav-item" id="nav-dashboard" onclick="switchAdminTab('dashboard')">
                    <span class="duo-icon-slot" data-duo-icon="gauge"><i class="ri-dashboard-3-line duo-rest-icon"></i></span>
                    <span><?php echo htmlspecialchars(t('admin.nav.dashboard')); ?></span>
                </button>
                <button type="button" class="admin-nav-item" id="nav-overview" onclick="switchAdminTab('overview')">
                    <span class="duo-icon-slot" data-duo-icon="layout-dashboard"><i class="ri-layout-grid-line duo-rest-icon"></i></span>
                    <span><?php echo htmlspecialchars(t('admin.nav.overview')); ?></span>
                </button>
                <button type="button" class="admin-nav-item" id="nav-users" onclick="switchAdminTab('users')">
                    <span class="duo-icon-slot" data-duo-icon="users"><i class="ri-group-line duo-rest-icon"></i></span>
                    <span><?php echo htmlspecialchars(t('admin.nav.users')); ?></span>
                    <span id="pendingUserBadge" style="<?php echo ($isAdmin && $pendingUserCount > 0) ? '' : 'display:none;'; ?>margin-left:auto;background-color:var(--warning);color:var(--surface);border-radius:10px;padding:1px 6px;font-size:11px;font-weight:600;"><?php echo $pendingUserCount; ?></span>
                </button>
                <?php if ($isAdmin): ?>
                <button type="button" class="admin-nav-item" id="nav-roles" onclick="switchAdminTab('roles')">
                    <span class="duo-icon-slot" data-duo-icon="shield-user"><i class="ri-shield-user-line duo-rest-icon"></i></span>
                    <span><?php echo htmlspecialchars(t('admin.nav.roles')); ?></span>
                </button>
                <button type="button" class="admin-nav-item" id="nav-brand" onclick="switchAdminTab('brand')">
                    <span class="duo-icon-slot" data-duo-icon="settings"><i class="ri-settings-4-line duo-rest-icon"></i></span>
                    <span><?php echo htmlspecialchars(t('admin.nav.brand')); ?></span>
                </button>
                <button type="button" class="admin-nav-item" id="nav-logs" onclick="switchAdminTab('logs')">
                    <span class="duo-icon-slot" data-duo-icon="file-text"><i class="ri-file-list-3-line duo-rest-icon"></i></span>
                    <span><?php echo htmlspecialchars(t('admin.nav.logs')); ?></span>
                </button>
                <?php endif; ?>
            </div>
            <div class="admin-nav-footer">
                <span style="font-size:12px;color:var(--text-3);"><?php echo htmlspecialchars(t('admin.footer_brand', ['version' => APP_VERSION])); ?></span>
                <a href="https://github.com/Y3PM/ProtoLoft" target="_blank" rel="noopener noreferrer" class="admin-nav-github" title="<?php echo htmlspecialchars(t('admin.github_repo')); ?>" aria-label="<?php echo htmlspecialchars(t('admin.github_repo')); ?>">
                    <span class="duo-icon-slot" data-duo-icon="github"><i class="ri-github-line duo-rest-icon"></i></span>
                </a>
            </div>
        </div>

        <!-- 右侧主体面板内容区 -->
        <div class="admin-content">
            <div class="admin-content-header">
                <div style="font-weight:600;font-size:15px;color:var(--text-1);" id="adminPanelTitle"><?php echo htmlspecialchars(t('admin.nav.dashboard')); ?></div>
                <div class="form-save-state roles-save-state"><span id="rolesSaveStatus" role="status" aria-live="polite"></span><button type="button" class="btn-cancel btn-sm" id="rolesSaveRetry" hidden onclick="retryAutoSave('save_role_permissions')"><?php echo htmlspecialchars(t('common.retry')); ?></button></div>
                <div class="form-save-state settings-save-state"><span id="settingsSaveStatus" role="status" aria-live="polite"></span><button type="button" class="btn-cancel btn-sm" id="settingsSaveRetry" hidden onclick="retryAutoSave('save_settings')"><?php echo htmlspecialchars(t('common.retry')); ?></button></div>
                <button type="button" class="close-x" onclick="closeAdminConsole()" title="<?php echo htmlspecialchars(t('common.close')); ?>"><i class="ri-close-line"></i></button>
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

                $strTotalStorage = $fmtStorage($bytesTotal);
                $strHtmlStorage = $fmtStorage($bytesHtml);
                $strRpStorage = $fmtStorage($bytesRp);
                $strOtherStorage = $fmtStorage($bytesOther);

                $barWidthHtml = $calcStorageBarWidth($bytesHtml, $bytesTotal);
                $barWidthRp = $calcStorageBarWidth($bytesRp, $bytesTotal);
                $barWidthOther = $calcStorageBarWidth($bytesOther, $bytesTotal);

                $lblHtmlPct = $fmtStoragePct($bytesHtml, $bytesTotal);
                $lblRpPct = $fmtStoragePct($bytesRp, $bytesTotal);
                $lblOtherPct = $fmtStoragePct($bytesOther, $bytesTotal);

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
                        'cat_name' => $catMap[$it['category_id']] ?? t('admin.dash.folders')
                    ];
                }

                // 近 7 天查阅走势 (支持审阅人/协作者/外发访客多角色透视)
                $trendDays = [];
                $todayKey = date('Y-m-d');
                for ($i = 6; $i >= 0; $i--) {
                    $dStr = date('Y-m-d', strtotime("-$i days"));
                    $trendDays[$dStr] = [
                        'date' => $dStr,
                        'label' => ($i === 0) ? t('common.today_label') : date('m/d', strtotime("-$i days")),
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
                        'label' => ($i === 0) ? t('common.today_label') : (($i % 6 === 0) ? date('m/d', strtotime("-$i days")) : ''),
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
                                $timeFmt = t('common.today') . ' ' . date('H:i', $ts);
                            } elseif ($dStr === $yesterdayStr) {
                                $timeFmt = t('common.yesterday') . ' ' . date('H:i', $ts);
                            } elseif ($ts) {
                                $timeFmt = date('m-d', $ts);
                            } else {
                                $timeFmt = '-';
                            }

                            $recentUploads[] = [
                                'ver_id' => (int)$ur['id'],
                                'item_id' => (int)$ur['item_id'],
                                'version_name' => $ur['version_name'],
                                'item_name' => $ur['item_name'] ?? t('common.unnamed'),
                                'cat_name' => $catName,
                                'has_rp' => !empty($ur['rp_file']),
                                'author' => $author,
                                'time_str' => $timeFmt
                            ];
                        }
                    }
                } catch (\Exception $e) {}

                // 全站批注待办与评审闭环数据 (仅聚合计数与必要筛选字段，避免全表详情拖慢首屏 HTML)
                $dashboardAnnoList = [];
                $projectFilterList = [];
                try {
                    $annoRows = $db->query("
                        SELECT item_id, ver_id, status, COUNT(*) as cnt
                        FROM annotations
                        GROUP BY item_id, ver_id, status
                    ")->fetchAll();
                    if ($annoRows) {
                        foreach ($annoRows as $ar) {
                            $dashboardAnnoList[] = [
                                'item_id' => (int)$ar['item_id'],
                                'ver_id' => (int)$ar['ver_id'],
                                'status' => (int)$ar['status'],
                                'cnt' => (int)$ar['cnt']
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
                            <div class="stat-card-title"><i class="ri-apps-line"></i> <?php echo htmlspecialchars(t('admin.dash.assets')); ?></div>
                            <div class="stat-card-val" style="font-size:18px;font-weight:700;margin:5px 0 2px;color:var(--text-1);"><?php echo $totalProjCount; ?> <span style="font-size:12px;font-weight:500;color:var(--text-3);"><?php echo htmlspecialchars(t('admin.dash.unit_proj')); ?></span> · <?php echo $totalVerCount; ?> <span style="font-size:12px;font-weight:500;color:var(--text-3);"><?php echo htmlspecialchars(t('admin.dash.unit_ver')); ?></span></div>
                            <div style="font-size:11.5px;color:var(--text-3);"><?php echo htmlspecialchars(t('admin.dash.assets_sub', ['n' => $recentVerCount])); ?></div>
                        </div>
                        <div class="stat-card" style="padding:13px 15px;background:var(--surface);border:1px solid var(--border);">
                            <div class="stat-card-title"><i class="ri-eye-line"></i> <?php echo htmlspecialchars(t('admin.dash.views')); ?></div>
                            <div class="stat-card-val" style="font-size:18px;font-weight:700;margin:5px 0 2px;color:var(--text-1);"><?php echo number_format($totalAllPv); ?> <span style="font-size:12px;font-weight:500;color:var(--text-3);"><?php echo htmlspecialchars(t('admin.dash.unit_times')); ?></span></div>
                            <div style="font-size:11.5px;color:var(--text-3);"><?php echo htmlspecialchars(t('admin.dash.views_sub', ['week' => number_format($totalWeekPv), 'today' => $todayPv])); ?></div>
                        </div>
                        <div class="stat-card" style="padding:13px 15px;background:var(--surface);border:1px solid var(--border);">
                            <div class="stat-card-title"><i class="ri-group-line"></i> <?php echo htmlspecialchars(t('admin.dash.team')); ?></div>
                            <div class="stat-card-val" style="font-size:18px;font-weight:700;margin:5px 0 2px;color:var(--text-1);"><?php echo $totalUserCount; ?> <span style="font-size:12px;font-weight:500;color:var(--text-3);"><?php echo htmlspecialchars(t('admin.dash.unit_members')); ?></span></div>
                            <div style="font-size:11.5px;color:var(--text-3);"><?php echo htmlspecialchars(t('admin.dash.team_sub', ['n' => $totalCatCount])); ?></div>
                        </div>
                        <div class="stat-card" style="padding:13px 15px;background:var(--surface);border:1px solid var(--border);">
                            <div class="stat-card-title"><i class="ri-hard-drive-2-line"></i> <?php echo htmlspecialchars(t('admin.dash.storage')); ?></div>
                            <div class="stat-card-val" style="font-size:18px;font-weight:700;margin:5px 0 2px;color:var(--text-1);"><?php echo htmlspecialchars($strTotalStorage); ?></div>
                            <div style="font-size:11.5px;color:var(--text-3);"><?php echo htmlspecialchars(t('admin.dash.storage_sub', ['n' => $totalRpCount])); ?></div>
                        </div>
                    </div>

                    <!-- 第二层: 双栏业务图谱 (批注待办与闭环 vs 查阅走势多角色堆叠图 · ECharts 驱动) -->
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                        <!-- 左侧: 批注待办与评审闭环 (支持按项目/版本向下钻取) -->
                        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:13px 15px;display:flex;flex-direction:column;justify-content:space-between;">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;">
                                <span style="font-size:13px;font-weight:600;color:var(--text-1);"><?php echo htmlspecialchars(t('admin.dash.anno_card')); ?></span>
                                <div style="display:flex;align-items:center;gap:6px;">
                                    <select id="filterAnnoProject" class="m-select-sm dashboard-project-filter" onchange="onAnnoProjectFilterChange(this.value)" title="<?php echo htmlspecialchars(t('admin.dash.filter_project_tip')); ?>">
                                        <option value="0"><?php echo htmlspecialchars(t('admin.dash.all_projects')); ?></option>
                                        <?php foreach ($projectFilterList as $pf): ?>
                                            <option value="<?php echo $pf['id']; ?>" data-cat-id="<?php echo (int)$pf['category_id']; ?>"><?php echo htmlspecialchars($pf['name']); ?></option>
                                        <?php endforeach; ?>
                                    </select>
                                    <select id="filterAnnoVersion" class="m-select-sm dashboard-version-filter" onchange="onAnnoVersionFilterChange(this.value)" style="display:none;" title="<?php echo htmlspecialchars(t('admin.dash.filter_version_tip')); ?>">
                                        <option value="0"><?php echo htmlspecialchars(t('admin.dash.all_versions')); ?></option>
                                    </select>
                                </div>
                            </div>
                            <div style="display:flex;align-items:center;height:140px;gap:10px;">
                                <div style="position:relative;width:125px;height:140px;flex-shrink:0;">
                                    <div id="chartAnnotationDonut" style="width:100%;height:100%;"></div>
                                    <div id="chartDonutCenterText" style="position:absolute;top:50%;left:50%;transform:translate(-50%, -50%);text-align:center;pointer-events:none;width:100%;line-height:1.15;">
                                        <div id="donutCenterRate" style="font-size:18px;font-weight:700;color:var(--text-1);">100%</div>
                                        <div id="donutCenterLabel" style="font-size:10px;color:var(--text-3);margin-top:2px;"><?php echo htmlspecialchars(t('admin.dash.close_rate')); ?></div>
                                    </div>
                                </div>
                                <div id="annoDetailBox" style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;height:100%;overflow:hidden;"></div>
                            </div>
                        </div>

                        <!-- 右侧: 查阅走势 (支持 7天 / 30天 切换 · 审阅人/协作者/外发访客多角色堆叠) -->
                        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:13px 15px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                                <div style="display:flex;align-items:center;gap:8px;">
                                    <span style="font-size:13px;font-weight:600;color:var(--text-1);" id="trendChartTitle"><?php echo htmlspecialchars(t('admin.dash.trend_title')); ?></span>
                                    <span style="font-size:10.5px;color:var(--text-3);display:inline-flex;align-items:center;gap:6px;">
                                        <span style="display:inline-flex;align-items:center;gap:2px;"><i class="m-status-dot dot-success"></i><?php echo htmlspecialchars(t('admin.dash.legend_viewer')); ?></span>
                                        <span style="display:inline-flex;align-items:center;gap:2px;"><i class="m-status-dot dot-primary"></i><?php echo htmlspecialchars(t('admin.dash.legend_editor')); ?></span>
                                        <span style="display:inline-flex;align-items:center;gap:2px;"><i class="m-status-dot dot-warning"></i><?php echo htmlspecialchars(t('admin.dash.legend_guest')); ?></span>
                                    </span>
                                </div>
                                <div class="trend-tab-group">
                                    <button type="button" class="trend-tab-btn active" id="tabTrend7d" onclick="switchTrendRange('7d')"><?php echo htmlspecialchars(t('admin.dash.range_7d')); ?></button>
                                    <button type="button" class="trend-tab-btn" id="tabTrend30d" onclick="switchTrendRange('30d')"><?php echo htmlspecialchars(t('admin.dash.range_30d')); ?></button>
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
                                <span style="font-size:13px;font-weight:600;color:var(--text-1);"><?php echo htmlspecialchars(t('admin.dash.recent_uploads')); ?></span>
                                <span style="font-size:11.5px;color:var(--text-3);"><?php echo htmlspecialchars(t('admin.dash.latest_5')); ?></span>
                            </div>

                            <div class="recent-upload-list" style="display:flex;flex-direction:column;gap:8px;">
                                <?php if (empty($recentUploads)): ?>
                                    <div style="text-align:center;padding:28px 0;color:var(--text-3);font-size:12px;">
                                        <i class="ri-history-line" style="font-size:18px;display:block;margin-bottom:4px;opacity:0.6;"></i>
                                        <?php echo htmlspecialchars(t('admin.dash.no_uploads')); ?>
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
                                            <span class="upload-rp-badge" title="<?php echo htmlspecialchars(t('admin.dash.rp_archived_tip')); ?>">RP</span>
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
                                <span style="font-size:13px;font-weight:600;color:var(--text-1);"><?php echo htmlspecialchars(t('admin.dash.hot_rank')); ?></span>
                                <span style="font-size:11.5px;color:var(--text-3);"><?php echo htmlspecialchars(t('admin.dash.last_30d')); ?></span>
                            </div>

                            <div class="rank-list" style="display:flex;flex-direction:column;gap:8px;">
                                <?php if (empty($topRankItems)): ?>
                                    <div style="text-align:center;padding:28px 0;color:var(--text-3);font-size:12px;">
                                        <i class="ri-bar-chart-line" style="font-size:18px;display:block;margin-bottom:4px;opacity:0.6;"></i>
                                        <?php echo htmlspecialchars(t('admin.dash.no_views')); ?>
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
                                        <span class="rank-item-cnt"><?php echo $rk['pv_cnt']; ?> <span style="font-size:10.5px;font-weight:normal;color:var(--text-3);"><?php echo htmlspecialchars(t('admin.dash.unit_times')); ?></span></span>
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
                                <span style="font-size:13px;font-weight:600;color:var(--text-1);"><?php echo htmlspecialchars(t('admin.dash.folders')); ?></span>
                                <span style="font-size:11.5px;color:var(--text-3);"><?php echo htmlspecialchars(t('admin.dash.folders_sub', ['n' => $totalCatCount])); ?></span>
                            </div>

                            <div class="cat-stat-list" style="display:flex;flex-direction:column;gap:8px;">
                                <?php if (empty($categoryStats)): ?>
                                    <div style="text-align:center;padding:28px 0;color:var(--text-3);font-size:12px;">
                                        <i class="ri-folder-line" style="font-size:18px;display:block;margin-bottom:4px;opacity:0.6;"></i>
                                        <?php echo htmlspecialchars(t('admin.dash.no_folders')); ?>
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
                                        <span class="cat-stat-count"><?php echo $cs['proj_count']; ?> <span style="font-size:10.5px;font-weight:normal;color:var(--text-3);"><?php echo htmlspecialchars(t('admin.dash.unit_proj')); ?></span> · <?php echo $cs['ver_count']; ?> <span style="font-size:10.5px;font-weight:normal;color:var(--text-3);"><?php echo htmlspecialchars(t('admin.dash.unit_ver')); ?></span></span>
                                    </div>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </div>
                        </div>

                        <!-- 右侧: 存储空间深度拆解 -->
                        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:13px 15px;display:flex;flex-direction:column;justify-content:space-between;">
                            <div>
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                                    <span style="font-size:13px;font-weight:600;color:var(--text-1);"><?php echo htmlspecialchars(t('admin.dash.storage_space')); ?></span>
                                    <span style="font-size:13px;font-weight:600;color:var(--primary);"><?php echo htmlspecialchars($strTotalStorage); ?></span>
                                </div>

                                <!-- 分段彩色比例条 (5px) -->
                                <div style="height:5px;background-color:var(--border);border-radius:3px;overflow:hidden;display:flex;margin-bottom:12px;">
                                    <?php if ($barWidthHtml > 0): ?>
                                        <div style="width:<?php echo $barWidthHtml; ?>%;background-color:var(--primary);height:100%;transition:width 0.3s;" title="<?php echo htmlspecialchars(t('admin.dash.html_pkg')); ?>: <?php echo $lblHtmlPct; ?>"></div>
                                    <?php endif; ?>
                                    <?php if ($barWidthRp > 0): ?>
                                        <div style="width:<?php echo $barWidthRp; ?>%;background-color:var(--warning);height:100%;transition:width 0.3s;" title="<?php echo htmlspecialchars(t('admin.dash.rp_source')); ?>: <?php echo $lblRpPct; ?>"></div>
                                    <?php endif; ?>
                                    <?php if ($barWidthOther > 0): ?>
                                        <div style="width:<?php echo $barWidthOther; ?>%;background-color:var(--text-3);height:100%;transition:width 0.3s;" title="<?php echo htmlspecialchars(t('admin.dash.db_media')); ?>: <?php echo $lblOtherPct; ?>"></div>
                                    <?php endif; ?>
                                </div>
                            </div>

                            <!-- 空间清单 -->
                            <div style="display:flex;flex-direction:column;gap:6px;font-size:12px;">
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                    <span style="color:var(--text-2);display:inline-flex;align-items:center;gap:6px;">
                                        <span style="width:7px;height:7px;border-radius:50%;background-color:var(--primary);display:inline-block;"></span>
                                        <span><?php echo htmlspecialchars(t('admin.dash.html_pkg')); ?></span>
                                    </span>
                                    <span style="font-weight:600;color:var(--text-1);"><?php echo htmlspecialchars($strHtmlStorage); ?> <span style="font-weight:400;color:var(--text-3);font-size:11px;">(<?php echo $lblHtmlPct; ?>)</span></span>
                                </div>
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                    <span style="color:var(--text-2);display:inline-flex;align-items:center;gap:6px;">
                                        <span style="width:7px;height:7px;border-radius:50%;background-color:var(--warning);display:inline-block;"></span>
                                        <span><?php echo htmlspecialchars(t('admin.dash.rp_source')); ?></span>
                                    </span>
                                    <span style="font-weight:600;color:var(--text-1);"><?php echo htmlspecialchars($strRpStorage); ?> <span style="font-weight:400;color:var(--text-3);font-size:11px;">(<?php echo $lblRpPct; ?>)</span></span>
                                </div>
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                    <span style="color:var(--text-2);display:inline-flex;align-items:center;gap:6px;">
                                        <span style="width:7px;height:7px;border-radius:50%;background-color:var(--text-3);display:inline-block;"></span>
                                        <span><?php echo htmlspecialchars(t('admin.dash.db_media')); ?></span>
                                    </span>
                                    <span style="font-weight:600;color:var(--text-1);"><?php echo htmlspecialchars($strOtherStorage); ?> <span style="font-weight:400;color:var(--text-3);font-size:11px;">(<?php echo $lblOtherPct; ?>)</span></span>
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
                            <div class="stat-card-title"><i class="ri-folder-line"></i> <?php echo htmlspecialchars(t('admin.proj.stat_folders')); ?></div>
                            <div class="stat-card-val"><?php echo count($cats); ?></div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-card-title"><i class="ri-pages-line"></i> <?php echo htmlspecialchars(t('admin.proj.stat_protos')); ?></div>
                            <div class="stat-card-val"><?php echo count($projectItems); ?></div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-card-title"><i class="ri-external-link-line"></i> <?php echo htmlspecialchars(t('admin.proj.stat_links')); ?></div>
                            <div class="stat-card-val"><?php echo count($linkItems); ?></div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-card-title"><i class="ri-history-line"></i> <?php echo htmlspecialchars(t('admin.proj.stat_versions')); ?></div>
                            <div class="stat-card-val"><?php echo count($versionsRaw); ?></div>
                        </div>
                    </div>

                    <!-- 二级子 Tab 胶囊切换器与动态操作区 -->
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <div class="console-subtab-group user-subtab-group">
                            <button type="button" id="btnSubtabProjects" class="console-subtab-btn log-subtab-btn active" onclick="switchOverviewSubTab('projects')"><?php echo htmlspecialchars(t('admin.proj.tab_projects')); ?></button>
                            <button type="button" id="btnSubtabLinks" class="console-subtab-btn log-subtab-btn" onclick="switchOverviewSubTab('links')"><?php echo htmlspecialchars(t('admin.proj.tab_links')); ?></button>
                            <button type="button" id="btnSubtabFolders" class="console-subtab-btn log-subtab-btn" onclick="switchOverviewSubTab('folders')"><?php echo htmlspecialchars(t('admin.proj.tab_folders')); ?></button>
                        </div>
                        <div id="overviewActionsProjects" style="display:flex;gap:8px;align-items:center;">
                            <div class="overview-folder-sort-group">
                                <button type="button" id="projectSortHintBtn" class="sort-hint-trigger" interestfor="projectSortHintTip" popovertarget="projectSortHintTip" popovertargetaction="show" aria-label="<?php echo htmlspecialchars(t('admin.proj.sort_hint_aria')); ?>">
                                    <i class="ri-arrow-up-down-line" aria-hidden="true"></i>
                                </button>
                                <div id="projectSortHintTip" class="linear-hint-popover" popover="hint" role="tooltip"><?php echo htmlspecialchars(t('admin.proj.filter_folder_tip')); ?></div>
                                <select id="filterProjectCategory" class="m-select-md" onchange="filterProjectsByCategory(this.value)" style="min-width:130px;" title="<?php echo htmlspecialchars(t('admin.proj.filter_folder_tip')); ?>">
                                    <option value="0"><?php echo htmlspecialchars(t('admin.proj.all_folders')); ?></option>
                                    <?php foreach ($cats as $c): ?>
                                        <option value="<?php echo $c['id']; ?>"><?php echo htmlspecialchars($c['name']); ?></option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                            <button type="button" class="btn-primary btn-md" onclick="openItemModal(0, <?php echo !empty($cats) ? $cats[0]['id'] : 0; ?>, 'project')"><span class="duo-icon-slot" data-duo-icon="circle-plus"><i class="ri-add-line duo-rest-icon"></i></span> <?php echo htmlspecialchars(t('admin.item.new_project')); ?></button>
                        </div>
                        <div id="overviewActionsLinks" style="display:none;gap:8px;align-items:center;">
                            <div class="overview-folder-sort-group">
                                <button type="button" id="linkSortHintBtn" class="sort-hint-trigger" interestfor="linkSortHintTip" popovertarget="linkSortHintTip" popovertargetaction="show" aria-label="<?php echo htmlspecialchars(t('admin.proj.sort_hint_aria')); ?>">
                                    <i class="ri-arrow-up-down-line" aria-hidden="true"></i>
                                </button>
                                <div id="linkSortHintTip" class="linear-hint-popover" popover="hint" role="tooltip"><?php echo htmlspecialchars(t('admin.proj.filter_link_folder_tip')); ?></div>
                                <select id="filterLinkCategory" class="m-select-md" onchange="filterLinksByCategory(this.value)" style="min-width:130px;" title="<?php echo htmlspecialchars(t('admin.proj.filter_link_folder_tip')); ?>">
                                    <option value="0"><?php echo htmlspecialchars(t('admin.proj.all_folders')); ?></option>
                                    <?php foreach ($cats as $c): ?>
                                        <option value="<?php echo $c['id']; ?>"><?php echo htmlspecialchars($c['name']); ?></option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                            <button type="button" class="btn-primary btn-md" onclick="openItemModal(0, <?php echo !empty($cats) ? $cats[0]['id'] : 0; ?>, 'link')"><span class="duo-icon-slot" data-duo-icon="circle-plus"><i class="ri-add-line duo-rest-icon"></i></span> <?php echo htmlspecialchars(t('admin.item.new_link')); ?></button>
                        </div>
                        <div id="overviewActionsFolders" style="display:none;gap:8px;align-items:center;">
                            <button type="button" class="btn-primary btn-md" onclick="openCategoryModal()"><span class="duo-icon-slot" data-duo-icon="folder-plus"><i class="ri-folder-add-line duo-rest-icon"></i></span> <?php echo htmlspecialchars(t('admin.cat.new_title')); ?></button>
                        </div>
                    </div>

                    <!-- 1. 原型项目列表表格容器 -->
                    <div id="overviewTableProjects" style="border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;">
                        <table style="width:100%;border-collapse:collapse;font-size:13px;">
                            <thead>
                                <tr style="background:var(--canvas);text-align:left;color:var(--text-2);border-bottom:1px solid var(--border);">
                                    <th style="padding:9px 12px;"><?php echo htmlspecialchars(t('admin.proj.col_project')); ?></th>
                                    <th style="padding:9px 12px;"><?php echo htmlspecialchars(t('admin.proj.col_folder')); ?></th>
                                    <th style="padding:9px 12px;"><?php echo htmlspecialchars(t('admin.proj.col_collab')); ?></th>
                                    <th style="padding:9px 12px;"><?php echo htmlspecialchars(t('admin.proj.col_cur_ver')); ?></th>
                                    <th style="padding:9px 12px;"><?php echo htmlspecialchars(t('admin.proj.col_hist_ver')); ?></th>
                                    <th style="padding:9px 12px;text-align:right;"><?php echo htmlspecialchars(t('admin.proj.col_actions')); ?></th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if (empty($projectItems)): ?>
                                    <tr class="empty-projects-row"><td colspan="6" style="padding:44px 20px;text-align:center;">
                                        <svg width="120" height="96" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">
                                            <rect x="34" y="20" width="56" height="46" rx="6" fill="var(--canvas)" stroke="var(--border-strong)" stroke-width="1.2" transform="rotate(3 62 43)"/>
                                            <rect x="30" y="24" width="56" height="46" rx="6" fill="var(--surface)" stroke="var(--border-strong)" stroke-width="1.4"/>
                                            <line x1="30" y1="34" x2="86" y2="34" stroke="var(--surface-hover)" stroke-width="1"/>
                                            <circle cx="36" cy="29" r="1.5" fill="var(--border)"/>
                                            <circle cx="40.5" cy="29" r="1.5" fill="var(--border)"/>
                                            <circle cx="45" cy="29" r="1.5" fill="var(--border)"/>
                                            <rect x="37" y="40" width="18" height="4" rx="1.5" fill="var(--primary)" fill-opacity="0.2"/>
                                            <rect x="37" y="48" width="18" height="12" rx="3" fill="var(--canvas)" stroke="var(--border)" stroke-width="1"/>
                                            <rect x="59" y="48" width="18" height="12" rx="3" fill="var(--canvas)" stroke="var(--border)" stroke-width="1"/>
                                            <g transform="translate(66, 44)">
                                                <circle cx="14" cy="14" r="13" fill="var(--primary-subtle)" stroke="var(--primary-border)" stroke-width="1.3"/>
                                                <path d="M10 8L18 16L14 17L16 21L14 22L12 18L9 20Z" fill="var(--primary)" stroke="var(--surface)" stroke-width="1" stroke-linejoin="round"/>
                                            </g>
                                        </svg>
                                        <div style="font-weight:600;font-size:13.5px;color:var(--text-1);margin-top:10px;"><?php echo htmlspecialchars(t('admin.proj.empty_title')); ?></div>
                                        <div style="font-size:12px;color:var(--text-3);margin-top:3px;margin-bottom:14px;"><?php echo htmlspecialchars(t('admin.proj.empty_desc')); ?></div>
                                        <?php if ($canManage): ?>
                                            <button type="button" class="btn-primary btn-sm" onclick="openQuickItemModal('project')"><span class="duo-icon-slot" data-duo-icon="circle-plus"><i class="ri-add-line duo-rest-icon"></i></span> <?php echo htmlspecialchars(t('admin.item.new_project')); ?></button>
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
                                        $canPublishThisItem = Auth::canEditItem($it, $currentUser);
                                        $canManageThisItem = Auth::canManageItemConfig($it, $currentUser);
                                        $canDeleteThisItem = Auth::canDeleteItem($it, $currentUser);
                                        $pAnnoCount = $pendingAnnoCounts[$it['id']] ?? 0;
                                    ?>
                                    <tr id="admin-item-row-<?php echo $it['id']; ?>" data-can-edit="<?php echo $canPublishThisItem ? '1' : '0'; ?>" data-can-config="<?php echo $canManageThisItem ? '1' : '0'; ?>"
                                        data-item-id="<?php echo $it['id']; ?>"
                                        data-cat-id="<?php echo $it['category_id']; ?>"
                                        data-name="<?php echo htmlspecialchars($it['name']); ?>" 
                                        data-created-by="<?php echo (int)($it['created_by'] ?? 0); ?>"
                                        data-creator-name="<?php echo htmlspecialchars($it['creator_name'] ?? ''); ?>"
                                        data-collaborators="<?php echo htmlspecialchars($it['collaborators'] ?? ''); ?>"
                                        style="border-bottom:1px solid var(--border);">
                                        <td style="padding:9px 12px;font-weight:600;color:var(--text-1);">
                                            <?php echo htmlspecialchars($it['name']); ?>
                                            <?php if (!empty($it['webhook_url'])): ?>
                                                <span class="badge-tag" style="background:var(--success-subtle);color:var(--success);border:1px solid var(--success-border);font-size:10.5px;margin-left:4px;" title="<?php echo htmlspecialchars(t('admin.proj.bound_bot_tip')); ?>"><i class="ri-robot-line"></i> <?php echo htmlspecialchars(t('admin.proj.bot_tag')); ?></span>
                                            <?php endif; ?>
                                            <?php if ($pAnnoCount > 0): ?>
                                                <span class="badge-tag" style="background:var(--warning-subtle);color:var(--warning);border:1px solid var(--warning-border);font-size:10.5px;margin-left:4px;" title="<?php echo htmlspecialchars(t('admin.proj.pending_anno_tip', ['n' => $pAnnoCount])); ?>">● <?php echo htmlspecialchars(t('admin.proj.todo_tag', ['n' => $pAnnoCount])); ?></span>
                                            <?php endif; ?>
                                        </td>
                                        <td style="padding:9px 12px;color:var(--text-2);"><?php echo htmlspecialchars($catMap[$it['category_id']] ?? t('admin.proj.uncategorized')); ?></td>
                                        <td style="padding:9px 12px;color:var(--text-2);"><?php echo $renderItemOwnersCell($it, $allUsersMap); ?></td>
                                        <td style="padding:9px 12px;"><span class="badge-ver"><?php echo htmlspecialchars($defaultV); ?></span></td>
                                        <td style="padding:9px 12px;">
                                            <button type="button" class="btn-cancel btn-sm btn-table-ver" onclick="openVersionManageModal(<?php echo $it['id']; ?>)" title="<?php echo htmlspecialchars(t('workspace.manage_ver_title')); ?>">
                                                <span class="duo-icon-slot" data-duo-icon="history"><i class="ri-history-line duo-rest-icon"></i></span> <?php echo htmlspecialchars(t('ver.count_btn', ['n' => count($vList)])); ?>
                                            </button>
                                        </td>
                                        <td style="padding:9px 12px;text-align:right;white-space:nowrap;">
                                            <!-- 项目调序按钮组 (按文件夹筛选时动态激活) -->
                                            <button type="button" class="btn-act project-order-btn btn-proj-move-up" style="display:none;margin-right:2px;" onclick="moveItemOrder(this, -1)" title="<?php echo htmlspecialchars(t('common.move_up')); ?>"><i class="ri-arrow-up-s-line"></i></button>
                                            <button type="button" class="btn-act project-order-btn btn-proj-move-down" style="display:none;margin-right:6px;" onclick="moveItemOrder(this, 1)" title="<?php echo htmlspecialchars(t('common.move_down')); ?>"><i class="ri-arrow-down-s-line"></i></button>

                                            <?php if ($canPublishThisItem): ?>
                                                <button class="btn-act" onclick="openUploadModal(<?php echo $it['id']; ?>, '<?php echo htmlspecialchars(addslashes($it['name'])); ?>')" title="<?php echo htmlspecialchars(t('ver.publish_new')); ?>"><span class="duo-icon-slot" data-duo-icon="cloud-upload"><i class="ri-upload-cloud-line duo-rest-icon"></i></span></button>
                                            <?php endif; ?>
                                            <?php if ($canManageThisItem): ?>
                                                <?php if ($isAdmin): ?>
                                                    <button class="btn-act" onclick="rotateShareToken(<?php echo $it['id']; ?>)" title="<?php echo htmlspecialchars(t('admin.proj.rotate_share_tip')); ?>"><span class="duo-icon-slot" data-duo-icon="rotate-cw"><i class="ri-refresh-line duo-rest-icon" style="color:var(--text-3);"></i></span></button>
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
                                                ]), ENT_QUOTES, 'UTF-8'); ?>)" title="<?php echo htmlspecialchars(t('admin.proj.edit_props_tip')); ?>"><span class="duo-icon-slot" data-duo-icon="pencil"><i class="ri-edit-line duo-rest-icon"></i></span></button>
                                                <?php if ($canDeleteThisItem): ?>
                                                    <button class="btn-act" onclick="deleteItem(<?php echo $it['id']; ?>)" title="<?php echo htmlspecialchars(t('common.delete')); ?>"><span class="duo-icon-slot" data-duo-icon="trash"><i class="ri-delete-bin-line duo-rest-icon"></i></span></button>
                                                <?php endif; ?>
                                            <?php elseif (!$canPublishThisItem): ?>
                                                <span style="font-size:11px;color:var(--text-3);padding:0 4px;" title="<?php echo htmlspecialchars(t('common.protected')); ?>"><?php echo htmlspecialchars(t('common.protected')); ?></span>
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
                                    <th style="padding:9px 12px;width:24%;"><?php echo htmlspecialchars(t('admin.proj.col_link_name')); ?></th>
                                    <th style="padding:9px 12px;width:14%;"><?php echo htmlspecialchars(t('admin.proj.col_folder')); ?></th>
                                    <th style="padding:9px 12px;width:12%;"><?php echo htmlspecialchars(t('admin.proj.col_open_mode')); ?></th>
                                    <th style="padding:9px 12px;width:28%;"><?php echo htmlspecialchars(t('admin.proj.col_target_url')); ?></th>
                                    <th style="padding:9px 12px;width:10%;"><?php echo htmlspecialchars(t('admin.proj.col_creator')); ?></th>
                                    <th style="padding:9px 12px;text-align:right;width:12%;"><?php echo htmlspecialchars(t('admin.proj.col_actions')); ?></th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if (empty($linkItems)): ?>
                                    <tr class="empty-links-row"><td colspan="6" style="padding:44px 20px;text-align:center;">
                                        <svg width="120" height="96" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">
                                            <rect x="34" y="20" width="56" height="46" rx="6" fill="var(--canvas)" stroke="var(--border-strong)" stroke-width="1.2" transform="rotate(-3 34 20)"/>
                                            <rect x="30" y="24" width="56" height="46" rx="6" fill="var(--surface)" stroke="var(--border-strong)" stroke-width="1.4"/>
                                            <line x1="30" y1="34" x2="86" y2="34" stroke="var(--surface-hover)" stroke-width="1"/>
                                            <circle cx="36" cy="29" r="1.5" fill="var(--border)"/>
                                            <circle cx="40.5" cy="29" r="1.5" fill="var(--border)"/>
                                            <rect x="37" y="42" width="22" height="3" rx="1.5" fill="var(--border-strong)"/>
                                            <rect x="37" y="49" width="34" height="2.5" rx="1" fill="var(--surface-hover)"/>
                                            <rect x="37" y="55" width="26" height="2.5" rx="1" fill="var(--surface-hover)"/>
                                            <g transform="translate(66, 44)">
                                                <circle cx="14" cy="14" r="13" fill="var(--primary-subtle)" stroke="var(--primary-border)" stroke-width="1.3"/>
                                                <path d="M11 17L17 11M17 11H12M17 11V16" stroke="var(--primary)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                                            </g>
                                        </svg>
                                        <div style="font-weight:600;font-size:13.5px;color:var(--text-1);margin-top:10px;"><?php echo htmlspecialchars(t('admin.proj.empty_links_title')); ?></div>
                                        <div style="font-size:12px;color:var(--text-3);margin-top:3px;margin-bottom:14px;"><?php echo htmlspecialchars(t('admin.proj.empty_links_desc')); ?></div>
                                        <?php if ($canManage): ?>
                                            <button type="button" class="btn-primary btn-sm" onclick="openItemModal(0, <?php echo !empty($cats) ? $cats[0]['id'] : 0; ?>, 'link')"><span class="duo-icon-slot" data-duo-icon="circle-plus"><i class="ri-add-line duo-rest-icon"></i></span> <?php echo htmlspecialchars(t('admin.item.new_link')); ?></button>
                                        <?php endif; ?>
                                    </td></tr>
                                <?php else: ?>
                                    <?php foreach ($linkItems as $it): 
                                        $canManageThisItem = Auth::canManageItemConfig($it, $currentUser);
                                        $canDeleteThisItem = Auth::canDeleteItem($it, $currentUser);
                                        $targetText = ($it['link_target'] === '_blank') ? t('admin.proj.open_new_tab') : t('admin.proj.open_embed');
                                        $targetBadgeStyle = ($it['link_target'] === '_blank') ? 'background:var(--primary-subtle);color:var(--primary);border:1px solid var(--primary-border);' : 'background:var(--canvas);color:var(--text-3);border:1px solid var(--border);';
                                    ?>
                                    <tr id="admin-item-row-<?php echo $it['id']; ?>" data-can-edit="<?php echo $canManageThisItem ? '1' : '0'; ?>"
                                        data-item-id="<?php echo $it['id']; ?>"
                                        data-cat-id="<?php echo $it['category_id']; ?>"
                                        data-name="<?php echo htmlspecialchars($it['name']); ?>"
                                        data-created-by="<?php echo (int)($it['created_by'] ?? 0); ?>"
                                        data-creator-name="<?php echo htmlspecialchars($it['creator_name'] ?? ''); ?>"
                                        data-collaborators="<?php echo htmlspecialchars($it['collaborators'] ?? ''); ?>"
                                        data-type="link"
                                        style="border-bottom:1px solid var(--border);">
                                        <td style="padding:9px 12px;font-weight:600;color:var(--text-1);">
                                            <i class="ri-external-link-line" style="color:var(--primary);margin-right:4px;font-size:14px;vertical-align:-1px;"></i>
                                            <?php echo htmlspecialchars($it['name']); ?>
                                        </td>
                                        <td style="padding:9px 12px;color:var(--text-2);"><?php echo htmlspecialchars($catMap[$it['category_id']] ?? t('admin.proj.uncategorized')); ?></td>
                                        <td style="padding:9px 12px;">
                                            <span class="badge-tag" style="<?php echo $targetBadgeStyle; ?>font-size:11px;"><?php echo htmlspecialchars($targetText); ?></span>
                                        </td>
                                        <td style="padding:9px 12px;max-width:260px;">
                                            <div style="display:flex;align-items:center;gap:6px;">
                                                <a href="<?php echo htmlspecialchars($it['link_url'] ?? ''); ?>" target="_blank" rel="noopener noreferrer" style="color:var(--primary);text-decoration:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;max-width:200px;" title="<?php echo htmlspecialchars($it['link_url'] ?? ''); ?>">
                                                    <?php echo htmlspecialchars($it['link_url'] ?? '-'); ?>
                                                </a>
                                                <?php if (!empty($it['link_url'])): ?>
                                                <button type="button" class="btn-act" onclick="copyTextToClipboard('<?php echo htmlspecialchars(addslashes($it['link_url'])); ?>', function(){ showToast(t('common.link_copied', null, '链接已复制'), 'success'); })" title="<?php echo htmlspecialchars(t('admin.item.copy_link_tip')); ?>">
                                                    <span class="duo-icon-slot" data-duo-icon="copy"><i class="ri-file-copy-line duo-rest-icon"></i></span>
                                                </button>
                                                <?php endif; ?>
                                            </div>
                                        </td>
                                        <td style="padding:9px 12px;color:var(--text-2);"><?php echo !empty($it['creator_name']) ? htmlspecialchars($it['creator_name']) : '-'; ?></td>
                                        <td style="padding:9px 12px;text-align:right;white-space:nowrap;">
                                            <button type="button" class="btn-act link-order-btn btn-link-move-up" style="display:none;margin-right:2px;" onclick="moveItemOrder(this, -1)" title="<?php echo htmlspecialchars(t('common.move_up')); ?>"><i class="ri-arrow-up-s-line"></i></button>
                                            <button type="button" class="btn-act link-order-btn btn-link-move-down" style="display:none;margin-right:6px;" onclick="moveItemOrder(this, 1)" title="<?php echo htmlspecialchars(t('common.move_down')); ?>"><i class="ri-arrow-down-s-line"></i></button>
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
                                                ]), ENT_QUOTES, 'UTF-8'); ?>)" title="<?php echo htmlspecialchars(t('admin.proj.edit_props_tip')); ?>"><span class="duo-icon-slot" data-duo-icon="pencil"><i class="ri-edit-line duo-rest-icon"></i></span></button>
                                                <?php if ($canDeleteThisItem): ?>
                                                    <button class="btn-act" onclick="deleteItem(<?php echo $it['id']; ?>)" title="<?php echo htmlspecialchars(t('common.delete')); ?>"><span class="duo-icon-slot" data-duo-icon="trash"><i class="ri-delete-bin-line duo-rest-icon"></i></span></button>
                                                <?php endif; ?>
                                            <?php else: ?>
                                                <span style="font-size:11px;color:var(--text-3);padding:0 4px;" title="<?php echo htmlspecialchars(t('common.protected')); ?>"><?php echo htmlspecialchars(t('common.protected')); ?></span>
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
                                    <th style="padding:9px 12px;width:40%;"><?php echo htmlspecialchars(t('admin.proj.col_folder_name')); ?></th>
                                    <th style="padding:9px 12px;width:25%;"><?php echo htmlspecialchars(t('admin.proj.col_folder_items')); ?></th>
                                    <th style="padding:9px 12px;width:15%;"><?php echo htmlspecialchars(t('admin.proj.col_sort')); ?></th>
                                    <th style="padding:9px 12px;text-align:right;width:20%;"><?php echo htmlspecialchars(t('admin.proj.col_actions')); ?></th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if (empty($cats)): ?>
                                    <tr class="empty-folders-row"><td colspan="4" style="padding:44px 20px;text-align:center;">
                                        <svg width="120" height="96" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">
                                            <rect x="34" y="24" width="56" height="44" rx="6" fill="var(--canvas)" stroke="var(--border-strong)" stroke-width="1.2" transform="rotate(-3 34 24)"/>
                                            <path d="M30 28C30 25 32 23 35 23H48L53 28H81C84 28 86 30 86 33V66C86 69 84 71 81 71H35C32 71 30 69 30 66V28Z" fill="var(--surface)" stroke="var(--border-strong)" stroke-width="1.4"/>
                                            <line x1="36" y1="36" x2="80" y2="36" stroke="var(--surface-hover)" stroke-width="1"/>
                                            <rect x="38" y="42" width="22" height="3" rx="1.5" fill="var(--border-strong)"/>
                                            <rect x="38" y="48" width="34" height="2.5" rx="1" fill="var(--surface-hover)"/>
                                            <rect x="38" y="54" width="26" height="2.5" rx="1" fill="var(--surface-hover)"/>
                                            <g transform="translate(68, 46)">
                                                <circle cx="14" cy="14" r="13" fill="var(--primary-subtle)" stroke="var(--primary-border)" stroke-width="1.3"/>
                                                <path d="M14 9V19M9 14H19" stroke="var(--primary)" stroke-width="2" stroke-linecap="round"/>
                                            </g>
                                        </svg>
                                        <div style="font-weight:600;font-size:13.5px;color:var(--text-1);margin-top:10px;"><?php echo htmlspecialchars(t('admin.proj.empty_folders_title')); ?></div>
                                        <div style="font-size:12px;color:var(--text-3);margin-top:3px;margin-bottom:14px;"><?php echo htmlspecialchars(t('admin.proj.empty_folders_desc')); ?></div>
                                        <?php if ($canManage): ?>
                                            <button type="button" class="btn-primary btn-sm" onclick="openCategoryModal(0)"><span class="duo-icon-slot" data-duo-icon="folder-plus"><i class="ri-folder-add-line duo-rest-icon"></i></span> <?php echo htmlspecialchars(t('admin.cat.new_title')); ?></button>
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
                                            <span style="font-weight:500;color:var(--text-1);"><?php echo $cItemCount; ?></span> <span style="color:var(--text-3);font-size:11.5px;"><?php echo htmlspecialchars(t('admin.proj.item_count_unit')); ?></span>
                                        </td>
                                        <td style="padding:10px 12px;white-space:nowrap;">
                                            <button type="button" class="btn-act btn-cat-move-up" onclick="moveCategoryOrder(this, -1)" title="<?php echo htmlspecialchars(t('common.move_up')); ?>" <?php if ($isFirstCat) echo 'disabled style="opacity:0.28;cursor:not-allowed;"'; ?>><i class="ri-arrow-up-s-line"></i></button>
                                            <button type="button" class="btn-act btn-cat-move-down" onclick="moveCategoryOrder(this, 1)" title="<?php echo htmlspecialchars(t('common.move_down')); ?>" <?php if ($isLastCat) echo 'disabled style="opacity:0.28;cursor:not-allowed;"'; ?>><i class="ri-arrow-down-s-line"></i></button>
                                        </td>
                                        <td style="padding:10px 12px;text-align:right;white-space:nowrap;">
                                            <button type="button" class="btn-act" onclick="openCategoryModal(<?php echo $c['id']; ?>, '<?php echo htmlspecialchars(addslashes($c['name'])); ?>')" title="<?php echo htmlspecialchars(t('admin.proj.edit_name_tip')); ?>"><span class="duo-icon-slot" data-duo-icon="pencil"><i class="ri-edit-line duo-rest-icon"></i></span></button>
                                            <button type="button" class="btn-act" onclick="confirmDeleteCategory(<?php echo $c['id']; ?>, '<?php echo htmlspecialchars(addslashes($c['name'])); ?>', <?php echo $cItemCount; ?>)" title="<?php echo htmlspecialchars(t('admin.proj.delete_folder_tip')); ?>"><span class="duo-icon-slot" data-duo-icon="trash"><i class="ri-delete-bin-line duo-rest-icon"></i></span></button>
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
                            <button type="button" id="subtab-btn-active-users" class="console-subtab-btn log-subtab-btn active" onclick="switchUserSubTab('active')"><?php echo htmlspecialchars($isAdmin ? t('admin.users.tab_active_admin') : t('admin.users.tab_active_dir')); ?></button>
                            <?php if ($isAdmin): ?>
                            <button type="button" id="subtab-btn-pending-users" class="console-subtab-btn log-subtab-btn" onclick="switchUserSubTab('pending')">
                                <span><?php echo htmlspecialchars(t('admin.users.tab_pending')); ?></span>
                                <span id="pendingSubTabCount" style="<?php echo ($isAdmin && $pendingUserCount > 0) ? '' : 'display:none;'; ?>background-color:var(--warning);color:var(--surface);border-radius:10px;padding:1px 6px;font-size:11px;font-weight:600;line-height:1.2;"><?php echo $pendingUserCount; ?></span>
                            </button>
                            <?php endif; ?>
                        </div>
                        <?php if ($isAdmin): ?>
                        <div id="activeUserActions">
                            <button type="button" class="btn-primary btn-md" onclick="showAddUserBox()"><span class="duo-icon-slot" data-duo-icon="user-plus"><i class="ri-user-add-line duo-rest-icon"></i></span> <?php echo htmlspecialchars(t('admin.users.add_btn')); ?></button>
                        </div>
                        <?php endif; ?>
                    </div>

                    <!-- 正式成员列表容器 -->
                    <div id="userBoxActive">
                    <div style="border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;">
                        <table style="width:100%;border-collapse:collapse;font-size:13px;">
                            <thead>
                                <tr style="background:var(--canvas);text-align:left;color:var(--text-2);border-bottom:1px solid var(--border);">
                                    <th style="padding:9px 12px;"><?php echo htmlspecialchars(t('admin.users.col_name_email')); ?></th>
                                    <th style="padding:9px 12px;"><?php echo htmlspecialchars(t('admin.users.col_role')); ?></th>
                                    <th style="padding:9px 12px;white-space:nowrap;"><?php echo htmlspecialchars(t('admin.users.col_contrib')); ?></th>
                                    <th style="padding:9px 12px;"><?php echo htmlspecialchars(t('admin.users.col_dept')); ?></th>
                                    <th style="padding:9px 12px;"><?php echo htmlspecialchars(t('admin.users.col_joined')); ?></th>
                                    <th style="padding:9px 12px;text-align:right;"><?php echo htmlspecialchars($isAdmin ? t('admin.proj.col_actions') : t('admin.users.col_status')); ?></th>
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
                                    <th style="padding:9px 12px;"><?php echo htmlspecialchars(t('admin.users.col_apply_email')); ?></th>
                                    <th style="padding:9px 12px;"><?php echo htmlspecialchars(t('admin.users.col_apply_dept')); ?></th>
                                    <th style="padding:9px 12px;"><?php echo htmlspecialchars(t('admin.users.col_apply_role')); ?></th>
                                    <th style="padding:9px 12px;"><?php echo htmlspecialchars(t('admin.users.col_apply_time')); ?></th>
                                    <th style="padding:9px 12px;text-align:right;"><?php echo htmlspecialchars(t('admin.users.col_approve_act')); ?></th>
                                </tr>
                            </thead>
                            <tbody id="pendingUsersTbody">
                                <tr><td colspan="5" style="padding:24px;text-align:center;color:var(--text-3);"><?php echo htmlspecialchars(t('admin.users.loading_pending')); ?></td></tr>
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
                                            <th style="padding:10px 16px;width:28%;font-weight:600;"><?php echo htmlspecialchars(t('admin.roles.col_perm')); ?></th>
                                            <th style="padding:10px 12px;text-align:center;width:18%;font-weight:600;color:var(--text-1);"><?php echo htmlspecialchars(t('common.role.admin')); ?></th>
                                            <th style="padding:10px 12px;text-align:center;width:18%;font-weight:600;color:var(--text-1);"><?php echo htmlspecialchars(t('common.role.editor')); ?></th>
                                            <th style="padding:10px 12px;text-align:center;width:18%;font-weight:600;color:var(--text-1);"><?php echo htmlspecialchars(t('common.role.viewer')); ?></th>
                                            <th style="padding:10px 12px;text-align:center;width:18%;font-weight:600;color:var(--text-1);"><?php echo htmlspecialchars(t('common.role.guest')); ?></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <!-- 项 1: 管理后台 -->
                                        <tr style="border-bottom:1px solid var(--border);">
                                            <td style="padding:11px 16px;font-weight:500;color:var(--text-1);"><?php echo htmlspecialchars(t('admin.roles.perm_admin')); ?></td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <i class="ri-check-line" style="color:var(--success);font-size:18px;font-weight:bold;"></i>
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
                                            <td style="padding:11px 16px;font-weight:500;color:var(--text-1);"><?php echo htmlspecialchars(t('admin.roles.perm_manage')); ?></td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <i class="ri-check-line" style="color:var(--success);font-size:18px;font-weight:bold;"></i>
                                            </td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <i class="ri-check-line" style="color:var(--success);font-size:18px;font-weight:bold;"></i>
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
                                            <td style="padding:11px 16px;font-weight:500;color:var(--text-1);"><?php echo htmlspecialchars(t('admin.roles.perm_download_rp')); ?></td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <i class="ri-check-line" style="color:var(--success);font-size:18px;font-weight:bold;"></i>
                                            </td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <i class="ri-check-line" style="color:var(--success);font-size:18px;font-weight:bold;"></i>
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
                                            <td style="padding:11px 16px;font-weight:500;color:var(--text-1);"><?php echo htmlspecialchars(t('admin.roles.perm_share')); ?></td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <i class="ri-check-line" style="color:var(--success);font-size:18px;font-weight:bold;"></i>
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
                                            <td style="padding:11px 16px;font-weight:500;color:var(--text-1);"><?php echo htmlspecialchars(t('admin.roles.perm_annotate')); ?></td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <i class="ri-check-line" style="color:var(--success);font-size:18px;font-weight:bold;"></i>
                                            </td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <i class="ri-check-line" style="color:var(--success);font-size:18px;font-weight:bold;"></i>
                                            </td>
                                            <td style="padding:11px 12px;text-align:center;">
                                                <i class="ri-check-line" style="color:var(--success);font-size:18px;font-weight:bold;"></i>
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
                                <div class="settings-section-title"><i class="ri-building-line"></i> <?php echo htmlspecialchars(t('admin.settings.org_title')); ?></div>
                            </div>
                            
                            <div class="m-form-group" style="margin-bottom:0;">
                                <label class="m-label" for="settingSiteTitle"><?php echo htmlspecialchars(t('admin.settings.org_name')); ?> <span class="opt-tag"><?php echo htmlspecialchars(t('common.optional')); ?></span></label>
                                <input type="text" id="settingSiteTitle" name="site_title" class="m-input" value="<?php echo htmlspecialchars($currCompanyName); ?>" placeholder="<?php echo htmlspecialchars(t('admin.settings.org_placeholder')); ?>" maxlength="20">
                            </div>
                        </div>

                        <!-- 卡片 2: 基础设置 -->
                        <?php
                            $currentSystemLang = I18n::getLocale();
                            $currentTimezone = Auth::getSetting('system_timezone', 'Asia/Shanghai');
                            $timezoneKeys = [
                                'Pacific/Midway',
                                'Pacific/Honolulu',
                                'America/Anchorage',
                                'America/Los_Angeles',
                                'America/Denver',
                                'America/Chicago',
                                'America/New_York',
                                'America/Santiago',
                                'America/Sao_Paulo',
                                'America/Noronha',
                                'Atlantic/Azores',
                                'UTC',
                                'Europe/Paris',
                                'Europe/Athens',
                                'Europe/Moscow',
                                'Asia/Dubai',
                                'Asia/Karachi',
                                'Asia/Dhaka',
                                'Asia/Bangkok',
                                'Asia/Shanghai',
                                'Asia/Tokyo',
                                'Australia/Sydney',
                                'Pacific/Guadalcanal',
                                'Pacific/Fiji'
                            ];
                            if (empty($currentTimezone) || !in_array($currentTimezone, $timezoneKeys, true)) {
                                $currentTimezone = 'Asia/Shanghai';
                            }
                        ?>
                        <div class="settings-section-card">
                            <div class="settings-section-header">
                                <div class="settings-section-title"><i class="ri-equalizer-line"></i> <?php echo htmlspecialchars(t('admin.settings.basic_title')); ?></div>
                            </div>

                            <div class="settings-row" style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border);">
                                <div class="settings-row-info">
                                    <label class="settings-row-label" for="settingGlobalWatermark"><?php echo htmlspecialchars(t('admin.settings.watermark')); ?></label>
                                    <div style="font-size:12px;color:var(--text-3);margin-top:2px;"><?php echo htmlspecialchars(t('admin.settings.watermark_desc')); ?></div>
                                </div>
                                <div class="settings-row-control">
                                    <label class="linear-switch">
                                        <input type="checkbox" id="settingGlobalWatermark" name="global_watermark_enabled" value="1" <?php echo Auth::getSetting('global_watermark_enabled', '0') === '1' ? 'checked' : ''; ?>>
                                        <span class="linear-switch-slider"></span>
                                    </label>
                                </div>
                            </div>

                            <div class="settings-row" style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border);">
                                <div class="settings-row-info">
                                    <label class="settings-row-label" for="settingSystemLanguage"><?php echo htmlspecialchars(t('admin.settings.language')); ?></label>
                                </div>
                                <div class="settings-row-control">
                                    <select id="settingSystemLanguage" name="system_language" class="m-select-md" style="min-width:260px;">
                                        <option value="zh-CN" <?php echo $currentSystemLang === 'zh-CN' ? 'selected' : ''; ?>>简体中文</option>
                                        <option value="zh-TW" <?php echo $currentSystemLang === 'zh-TW' ? 'selected' : ''; ?>>繁體中文</option>
                                        <option value="en" <?php echo $currentSystemLang === 'en' ? 'selected' : ''; ?>>English</option>
                                    </select>
                                </div>
                            </div>

                            <div class="settings-row" style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border);">
                                <div class="settings-row-info">
                                    <label class="settings-row-label" for="settingTimezone"><?php echo htmlspecialchars(t('admin.settings.timezone')); ?></label>
                                </div>
                                <div class="settings-row-control">
                                    <select id="settingTimezone" name="system_timezone" class="m-select-md" style="min-width:260px;">
                                        <?php foreach ($timezoneKeys as $tzKey): ?>
                                            <option value="<?php echo $tzKey; ?>" <?php echo $currentTimezone === $tzKey ? 'selected' : ''; ?>>
                                                <?php echo htmlspecialchars(t('tz.' . $tzKey)); ?>
                                            </option>
                                        <?php endforeach; ?>
                                    </select>
                                </div>
                            </div>

                            <div class="settings-row">
                                <div class="settings-row-info">
                                    <label class="settings-row-label" for="settingMaxCustomShares"><?php echo htmlspecialchars(t('admin.settings.max_shares')); ?></label>
                                </div>
                                <div class="settings-row-control">
                                    <div class="linear-stepper-wrap">
                                        <button type="button" class="stepper-btn stepper-btn-dec" onclick="stepNumberInput('settingMaxCustomShares', -1, 1, 99)" title="<?php echo htmlspecialchars(t('admin.settings.dec')); ?>">
                                            <i class="ri-subtract-line"></i>
                                        </button>
                                        <div class="stepper-input-box">
                                            <input type="number" id="settingMaxCustomShares" name="max_custom_shares_per_item" min="1" max="99" value="<?php echo htmlspecialchars(Auth::getSetting('max_custom_shares_per_item', '5')); ?>" required onblur="clampStepperInput(this, 1, 99)">
                                            <span class="stepper-unit"><?php echo htmlspecialchars(t('admin.settings.unit_links')); ?></span>
                                        </div>
                                        <button type="button" class="stepper-btn stepper-btn-inc" onclick="stepNumberInput('settingMaxCustomShares', 1, 1, 99)" title="<?php echo htmlspecialchars(t('admin.settings.inc')); ?>">
                                            <i class="ri-add-line"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div class="m-form-group" style="margin-bottom:0;margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
                                <label class="m-label" for="settingSiteBaseUrl">
                                    <span><?php echo htmlspecialchars(t('admin.settings.site_base_url')); ?></span>
                                    <span class="opt-tag"><?php echo htmlspecialchars(t('admin.settings.site_base_url_tip')); ?></span>
                                </label>
                                <input type="text" id="settingSiteBaseUrl" name="site_base_url" class="m-input" value="<?php echo htmlspecialchars(Auth::getSetting('site_base_url', '')); ?>" placeholder="<?php echo htmlspecialchars(t('admin.settings.site_base_url_placeholder')); ?>" maxlength="200">
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
                                <div class="settings-section-title"><i class="ri-user-shared-line"></i> <?php echo htmlspecialchars(t('admin.settings.reg_title')); ?></div>
                            </div>

                            <div class="settings-row">
                                <div class="settings-row-info">
                                    <label class="settings-row-label" for="settingVisitorReg"><?php echo htmlspecialchars(t('admin.settings.visitor_reg')); ?></label>
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
                                    <span><?php echo htmlspecialchars(t('admin.settings.allowed_domains')); ?></span>
                                    <span class="opt-tag"><?php echo htmlspecialchars(t('admin.settings.allowed_domains_tip')); ?></span>
                                </label>
                                <input type="text" id="settingAllowedDomains" name="allowed_email_domains" class="m-input" value="<?php echo htmlspecialchars($allowedDomains); ?>" placeholder="<?php echo htmlspecialchars(t('admin.settings.allowed_domains_placeholder')); ?>" maxlength="200" onblur="if(window.cleanEmailDomains) this.value = cleanEmailDomains(this.value)">
                            </div>
                        </div>

                        <!-- 卡片 4: 通知设置 -->
                        <div class="settings-section-card">
                            <div class="settings-section-header">
                                <div class="settings-section-title"><i class="ri-notification-3-line"></i> <?php echo htmlspecialchars(t('admin.settings.notify_title')); ?></div>
                            </div>

                            <!-- 评审群通知 Webhook -->
                            <div class="m-form-group">
                                <label class="m-label" for="settingGlobalWebhook">
                                    <span><?php echo htmlspecialchars(t('admin.settings.global_webhook')); ?></span>
                                    <span class="opt-tag"><?php echo htmlspecialchars(t('common.optional')); ?></span>
                                </label>
                                <div class="m-form-row">
                                    <input type="text" id="settingGlobalWebhook" name="global_webhook_url" class="m-input" value="<?php echo htmlspecialchars($reviewWebhook); ?>" placeholder="<?php echo htmlspecialchars(t('profile.webhook_placeholder')); ?>" maxlength="1000">
                                    <button type="button" class="btn-cancel btn-standard" onclick="testAnyWebhook('settingGlobalWebhook', this)">
                                        <span class="duo-icon-slot" data-duo-icon="send"><i class="ri-send-plane-line duo-rest-icon"></i></span> <?php echo htmlspecialchars(t('common.test')); ?>
                                    </button>
                                </div>
                                <div style="font-size:11.5px;color:var(--text-3);margin-top:5px;line-height:1.4;"><?php echo t('admin.settings.global_webhook_hint'); ?></div>
                            </div>

                            <!-- 新成员审批通知人 -->
                            <div class="m-form-group" style="position:relative;margin-bottom:0;margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
                                <label class="m-label" id="adminRecipientsLabel">
                                    <span><?php echo htmlspecialchars(t('admin.settings.notify_admins')); ?></span>
                                    <span class="opt-tag"><?php echo htmlspecialchars(t('admin.settings.notify_admins_tip')); ?></span>
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
                                    <div class="mcp-dropdown-header">
                                        <span><?php echo htmlspecialchars(t('admin.settings.select_notify_admins')); ?></span>
                                        <div class="mcp-dropdown-tools">
                                            <button type="button" class="inline-action-btn is-primary" onclick="selectAllAdmins(true)"><?php echo htmlspecialchars(t('common.select_all')); ?></button>
                                            <button type="button" class="inline-action-btn" onclick="selectAllAdmins(false)"><?php echo htmlspecialchars(t('common.clear')); ?></button>
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
                                                    <i class="ri-robot-line" title="<?php echo htmlspecialchars(t('admin.users.bot_configured_tip')); ?>" role="img" aria-label="<?php echo htmlspecialchars(t('admin.users.bot_configured_tip')); ?>"></i>
                                                <?php else: ?>
                                                    <?php echo htmlspecialchars(t('admin.settings.no_bot')); ?>
                                                <?php endif; ?>
                                            </span>
                                        </label>
                                        <?php endforeach; ?>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 卡片 5: 邮件服务 (找回密码 SMTP 发信配置) -->
                        <?php
                            $smtpPresets = Mailer::presets();
                            $smtpCfg = Mailer::getPublicSettings();
                            $curAdminEmail = htmlspecialchars((string)($currentUser['email'] ?? ''));
                        ?>
                        <div class="settings-section-card">
                            <div class="settings-section-header">
                                <div class="settings-section-title"><i class="ri-mail-settings-line"></i> <?php echo htmlspecialchars(t('admin.settings.mail_title')); ?></div>
                            </div>

                            <div class="settings-row" style="margin-bottom:14px;padding-top:0;padding-bottom:14px;">
                                <div class="settings-row-info">
                                    <label class="settings-row-label" for="settingSmtpEnabled"><?php echo htmlspecialchars(t('admin.settings.mail_reset')); ?></label>
                                </div>
                                <div class="settings-row-control">
                                    <label class="linear-switch">
                                        <input type="checkbox" id="settingSmtpEnabled" name="smtp_enabled" value="1" <?php echo $smtpCfg['enabled'] ? 'checked' : ''; ?>>
                                        <span class="linear-switch-slider"></span>
                                    </label>
                                </div>
                            </div>

                            <div class="settings-grid-2">
                                <div class="m-form-group" style="margin-bottom:0;">
                                    <label class="m-label" for="settingSmtpPreset"><?php echo htmlspecialchars(t('admin.settings.smtp_preset')); ?> <span class="opt-tag"><?php echo htmlspecialchars(t('admin.settings.smtp_preset_tip')); ?></span></label>
                                    <select id="settingSmtpPreset" name="smtp_preset" class="m-select-md" style="width:100%;" onchange="onSmtpPresetChange(this.value)">
                                        <?php foreach ($smtpPresets as $pKey => $pInfo): ?>
                                            <option value="<?php echo htmlspecialchars($pKey); ?>"
                                                data-host="<?php echo htmlspecialchars($pInfo['host']); ?>"
                                                data-port="<?php echo (int)$pInfo['port']; ?>"
                                                data-enc="<?php echo htmlspecialchars($pInfo['encryption']); ?>"
                                                <?php echo $smtpCfg['preset'] === $pKey ? 'selected' : ''; ?>>
                                                <?php echo htmlspecialchars($pInfo['label']); ?>
                                            </option>
                                        <?php endforeach; ?>
                                    </select>
                                </div>
                                <div class="m-form-group" style="margin-bottom:0;">
                                    <label class="m-label" for="settingSmtpEncryption"><?php echo htmlspecialchars(t('admin.settings.smtp_encryption')); ?></label>
                                    <select id="settingSmtpEncryption" name="smtp_encryption" class="m-select-md" style="width:100%;" onchange="onSmtpEncryptionChange(this.value)">
                                        <option value="ssl" <?php echo $smtpCfg['encryption'] === 'ssl' ? 'selected' : ''; ?>>SSL / TLS</option>
                                        <option value="tls" <?php echo $smtpCfg['encryption'] === 'tls' ? 'selected' : ''; ?>>STARTTLS</option>
                                        <option value="none" <?php echo $smtpCfg['encryption'] === 'none' ? 'selected' : ''; ?>><?php echo htmlspecialchars(t('admin.settings.smtp_enc_none')); ?></option>
                                    </select>
                                </div>
                            </div>

                            <div class="settings-grid-2">
                                <div class="m-form-group" style="margin-bottom:0;">
                                    <label class="m-label" for="settingSmtpHost"><?php echo htmlspecialchars(t('admin.settings.smtp_host')); ?></label>
                                    <input type="text" id="settingSmtpHost" name="smtp_host" class="m-input" value="<?php echo htmlspecialchars($smtpCfg['host']); ?>" placeholder="<?php echo htmlspecialchars(t('admin.settings.smtp_host_placeholder')); ?>" maxlength="120" oninput="syncSmtpPresetFromManual()">
                                </div>
                                <div class="m-form-group" style="margin-bottom:0;">
                                    <label class="m-label" for="settingSmtpPort"><?php echo htmlspecialchars(t('admin.settings.smtp_port')); ?></label>
                                    <input type="number" id="settingSmtpPort" name="smtp_port" class="m-input" min="1" max="65535" value="<?php echo (int)$smtpCfg['port']; ?>" placeholder="465" oninput="syncSmtpPresetFromManual()">
                                </div>
                            </div>

                            <div class="settings-grid-2">
                                <div class="m-form-group" style="margin-bottom:0;">
                                    <label class="m-label" for="settingSmtpUser"><?php echo htmlspecialchars(t('admin.settings.smtp_user')); ?></label>
                                    <input type="email" id="settingSmtpUser" name="smtp_user" class="m-input" value="<?php echo htmlspecialchars($smtpCfg['user']); ?>" placeholder="<?php echo htmlspecialchars(t('admin.settings.smtp_user_placeholder')); ?>" maxlength="100" autocomplete="off">
                                </div>
                                <div class="m-form-group" style="margin-bottom:0;">
                                    <label class="m-label" for="settingSmtpPass" style="display:flex;align-items:center;justify-content:space-between;">
                                        <span><?php echo htmlspecialchars(t('admin.settings.smtp_pass')); ?> <span class="opt-tag" id="smtpPassBadge"><?php echo $smtpCfg['has_pass'] ? htmlspecialchars(t('common.configured')) : htmlspecialchars(t('admin.settings.smtp_pass_unset_badge')); ?></span></span>
                                        <button type="button" id="btnClearSmtpPass" class="inline-action-btn is-compact" onclick="clearSavedSmtpPass()" style="<?php echo $smtpCfg['has_pass'] ? '' : 'display:none;'; ?>"><?php echo htmlspecialchars(t('common.clear')); ?></button>
                                    </label>
                                    <div class="pwd-input-wrap">
                                        <input type="password" id="settingSmtpPass" name="smtp_pass" class="m-input" value="" data-has-pass="<?php echo $smtpCfg['has_pass'] ? '1' : '0'; ?>" placeholder="<?php echo $smtpCfg['has_pass'] ? htmlspecialchars(t('admin.settings.smtp_pass_set_placeholder')) : htmlspecialchars(t('admin.settings.smtp_pass_unset_placeholder')); ?>" maxlength="128" autocomplete="new-password">
                                        <button type="button" class="btn-eye-toggle" onclick="togglePasswordVisibility('settingSmtpPass', this)" title="<?php echo htmlspecialchars(t('admin.settings.smtp_pass_toggle_tip')); ?>">
                                            <i class="ri-eye-line"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div class="m-form-group">
                                <label class="m-label" for="settingSmtpFromName">
                                    <span><?php echo htmlspecialchars(t('admin.settings.smtp_from_name')); ?></span>
                                    <span class="opt-tag"><?php echo htmlspecialchars(t('common.optional')); ?></span>
                                </label>
                                <input type="text" id="settingSmtpFromName" name="smtp_from_name" class="m-input" value="<?php echo htmlspecialchars($smtpCfg['from_name']); ?>" placeholder="<?php echo htmlspecialchars(t('admin.settings.smtp_from_placeholder')); ?>" maxlength="40">
                            </div>

                            <div class="m-form-group" style="margin-bottom:0;margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
                                <label class="m-label" for="smtpTestEmail">
                                    <span><?php echo htmlspecialchars(t('admin.settings.smtp_test')); ?></span>
                                    <span class="opt-tag"><?php echo htmlspecialchars(t('admin.settings.smtp_test_tip')); ?></span>
                                </label>
                                <div class="m-form-row">
                                    <input type="email" id="smtpTestEmail" class="m-input" value="<?php echo $curAdminEmail; ?>" placeholder="<?php echo htmlspecialchars(t('admin.settings.smtp_test_placeholder')); ?>" maxlength="100" data-error-target="smtpTestEmailError" aria-errormessage="smtpTestEmailError">
                                    <button type="button" class="btn-cancel btn-standard" onclick="handleTestSmtp(this)">
                                        <span class="duo-icon-slot" data-duo-icon="send"><i class="ri-send-plane-line duo-rest-icon"></i></span> <?php echo htmlspecialchars(t('common.test')); ?>
                                    </button>
                                </div>
                                <div class="field-error-tip" id="smtpTestEmailError" role="alert"></div>
                            </div>
                        </div>
                    </form>
                </div>

                <!-- 面板 6: 系统审计日志 (登录日志与访问日志) -->
                <div id="panel-logs" class="admin-panel">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                        <div class="console-subtab-group log-subtab-group">
                            <button type="button" id="subtab-btn-login" class="console-subtab-btn log-subtab-btn active" onclick="switchLogSubTab('login')"><?php echo htmlspecialchars(t('admin.logs.tab_login')); ?></button>
                            <button type="button" id="subtab-btn-access" class="console-subtab-btn log-subtab-btn" onclick="switchLogSubTab('access')"><?php echo htmlspecialchars(t('admin.logs.tab_access')); ?></button>
                        </div>
                        <div style="display:flex;gap:8px;align-items:center;">
                            <button type="button" class="btn-cancel btn-md" onclick="loadLogsData()" title="<?php echo htmlspecialchars(t('admin.logs.refresh_tip')); ?>"><span class="duo-icon-slot" data-duo-icon="rotate-cw"><i class="ri-refresh-line duo-rest-icon"></i></span> <?php echo htmlspecialchars(t('common.refresh')); ?></button>
                            <button type="button" class="btn-cancel btn-md" onclick="handleClearLogs()" style="color:var(--danger)" title="<?php echo htmlspecialchars(t('admin.logs.clear_tip')); ?>"><span class="duo-icon-slot" data-duo-icon="trash"><i class="ri-delete-bin-line duo-rest-icon"></i></span> <?php echo htmlspecialchars(t('admin.logs.clear_btn')); ?></button>
                        </div>
                    </div>

                    <!-- 1. 登录日志表格容器 -->
                    <div id="logBoxLogin" style="border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;">
                        <table style="width:100%;border-collapse:collapse;font-size:13px;">
                            <thead>
                                <tr style="background:var(--canvas);text-align:left;color:var(--text-2);border-bottom:1px solid var(--border);">
                                    <th style="padding:9px 12px;width:150px;"><?php echo htmlspecialchars(t('admin.logs.col_login_time')); ?></th>
                                    <th style="padding:9px 12px;width:110px;"><?php echo htmlspecialchars(t('admin.logs.col_account')); ?></th>
                                    <th style="padding:9px 12px;width:90px;"><?php echo htmlspecialchars(t('admin.logs.col_status')); ?></th>
                                    <th style="padding:9px 12px;width:130px;"><?php echo htmlspecialchars(t('admin.logs.col_ip')); ?></th>
                                    <th style="padding:9px 12px;width:150px;"><?php echo htmlspecialchars(t('admin.logs.col_device')); ?></th>
                                    <th style="padding:9px 12px;"><?php echo htmlspecialchars(t('admin.logs.col_desc')); ?></th>
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
                                                    <span class="m-badge-tag tag-success"><?php echo htmlspecialchars(t('admin.logs.login_ok')); ?></span>
                                                <?php else: ?>
                                                    <span class="m-badge-tag tag-danger"><?php echo htmlspecialchars(t('admin.logs.login_fail')); ?></span>
                                                <?php endif; ?>
                                            </td>
                                            <td style="padding:9px 12px;font-family:ui-monospace,monospace;font-size:12px;color:var(--text-2);"><?php echo htmlspecialchars($l['ip']); ?></td>
                                            <td style="padding:9px 12px;color:var(--text-2);font-size:12.5px;" title="<?php echo htmlspecialchars($l['user_agent'] ?? ''); ?>"><?php echo htmlspecialchars($l['device'] ?: t('common.unknown_device')); ?></td>
                                            <td style="padding:9px 12px;color:var(--text-3);font-size:12.5px;"><?php echo htmlspecialchars($l['message'] ?? ''); ?></td>
                                        </tr>
                                    <?php endforeach; ?>
                                <?php else: ?>
                                    <tr><td colspan="6" style="padding:28px;text-align:center;color:var(--text-3);"><?php echo htmlspecialchars(t('admin.logs.login_empty')); ?></td></tr>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>

                    <!-- 2. 访问日志表格容器 (默认初始隐藏，点击子Tab切换) -->
                    <div id="logBoxAccess" style="display:none;border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;">
                        <table style="width:100%;border-collapse:collapse;font-size:13px;">
                            <thead>
                                <tr style="background:var(--canvas);text-align:left;color:var(--text-2);border-bottom:1px solid var(--border);">
                                    <th style="padding:9px 12px;width:150px;"><?php echo htmlspecialchars(t('admin.logs.col_access_time')); ?></th>
                                    <th style="padding:9px 12px;"><?php echo htmlspecialchars(t('admin.logs.col_proto_project')); ?></th>
                                    <th style="padding:9px 12px;width:100px;"><?php echo htmlspecialchars(t('admin.logs.col_version')); ?></th>
                                    <th style="padding:9px 12px;width:100px;"><?php echo htmlspecialchars(t('admin.logs.col_channel')); ?></th>
                                    <th style="padding:9px 12px;width:130px;"><?php echo htmlspecialchars(t('admin.logs.col_visitor_ip')); ?></th>
                                    <th style="padding:9px 12px;width:160px;"><?php echo htmlspecialchars(t('admin.logs.col_device')); ?></th>
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
                                                    <span class="badge-tag" style="color:var(--primary);background:var(--primary-subtle);border:1px solid var(--primary-border);"><?php echo htmlspecialchars(t('admin.logs.channel_share')); ?></span>
                                                <?php else: ?>
                                                    <span class="badge-tag" style="color:var(--text-2);background:var(--canvas);border:1px solid var(--border);"><?php echo htmlspecialchars(t('admin.logs.channel_workspace')); ?></span>
                                                <?php endif; ?>
                                            </td>
                                            <td style="padding:9px 12px;font-family:ui-monospace,monospace;font-size:12px;color:var(--text-2);"><?php echo htmlspecialchars($al['ip']); ?></td>
                                            <td style="padding:9px 12px;color:var(--text-2);font-size:12.5px;" title="<?php echo htmlspecialchars($al['user_agent'] ?? ''); ?>"><?php echo htmlspecialchars($al['device'] ?: t('common.unknown_device')); ?></td>
                                        </tr>
                                    <?php endforeach; ?>
                                <?php else: ?>
                                    <tr><td colspan="6" style="padding:28px;text-align:center;color:var(--text-3);"><?php echo htmlspecialchars(t('admin.logs.access_empty')); ?></td></tr>
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
                <i class="ri-key-2-line" style="color:var(--primary);"></i> <?php echo htmlspecialchars(t('admin.transfer.title')); ?>
            </div>
            <button type="button" onclick="closeModal('transferOwnerModal')" class="close-x" title="<?php echo htmlspecialchars(t('common.close')); ?>"><i class="ri-close-line"></i></button>
        </div>
        <div class="m-alert-tip is-warning">
            <i class="ri-alert-line" style="vertical-align:middle;margin-right:2px;font-size:15px;flex-shrink:0;"></i>
            <span><?php echo htmlspecialchars(t('admin.transfer.warn')); ?></span>
        </div>
        <form onsubmit="handleDoTransferOwner(event)" novalidate>
            <input type="hidden" id="transferTargetUserId" value="0">
            <div class="m-form-group">
                <label class="m-label"><?php echo htmlspecialchars(t('admin.transfer.recipient')); ?></label>
                <div id="transferTargetUserName" style="font-weight:600;font-size:13.5px;color:var(--primary);padding:8px 0;"></div>
            </div>
            <div class="m-form-group">
                <label class="m-label" for="transferConfirmPwd"><?php echo htmlspecialchars(t('profile.old_password')); ?> <span class="req-star">*</span></label>
                <div class="pwd-input-wrap">
                    <input type="password" id="transferConfirmPwd" class="m-input" placeholder="<?php echo htmlspecialchars(t('admin.transfer.pwd_placeholder')); ?>" required maxlength="64" data-error-target="transferConfirmPwdError" aria-errormessage="transferConfirmPwdError">
                    <button type="button" class="btn-eye-toggle" onclick="togglePasswordVisibility('transferConfirmPwd', this)" title="<?php echo htmlspecialchars(t('auth.toggle_password')); ?>">
                        <i class="ri-eye-line"></i>
                    </button>
                </div>
                <div class="field-error-tip" id="transferConfirmPwdError" role="alert"></div>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;">
                <button type="button" class="btn-cancel btn-standard" onclick="closeModal('transferOwnerModal')"><?php echo htmlspecialchars(t('common.cancel')); ?></button>
                <button type="submit" class="btn-danger btn-standard" id="btnTransferSubmit"><?php echo htmlspecialchars(t('admin.transfer.submit')); ?></button>
            </div>
        </form>
    </div>
</div>

<!-- 工作交接弹窗 (极简 440px) -->
<div id="userHandoverModal" class="custom-modal" style="display:none;">
    <div class="modal-dialog-box modal-sm">
        <div class="modal-head">
            <h4><?php echo htmlspecialchars(t('admin.handover.title')); ?></h4>
            <button type="button" class="close-x" onclick="closeModal('userHandoverModal')" title="<?php echo htmlspecialchars(t('common.close')); ?>"><i class="ri-close-line"></i></button>
        </div>
        <form onsubmit="handleUserHandover(event)">
            <input type="hidden" id="handoverFromUserId" value="0">
            <div style="font-size:13px;color:var(--text-2);line-height:1.5;margin-bottom:14px;" id="handoverDescText">
                <?php echo htmlspecialchars(t('admin.handover.default_desc')); ?>
            </div>
            <div class="m-form-group">
                <label class="m-label"><?php echo htmlspecialchars(t('admin.handover.target_label')); ?> <span class="req-star">*</span></label>
                <select id="handoverToUserId" class="m-input" required>
                    <option value=""><?php echo htmlspecialchars(t('admin.handover.select_target')); ?></option>
                </select>
            </div>
            <div class="m-form-group" style="margin-top:14px;">
                <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text-1);">
                    <input type="checkbox" id="handoverDeactivateFrom" style="accent-color:var(--primary);width:15px;height:15px;cursor:pointer;">
                    <span><?php echo htmlspecialchars(t('admin.handover.deactivate_src')); ?></span>
                </label>
            </div>
            <div class="m-modal-footer">
                <button type="button" class="btn-cancel btn-standard" onclick="closeModal('userHandoverModal')"><?php echo htmlspecialchars(t('common.cancel')); ?></button>
                <button type="submit" class="btn-primary btn-standard" id="btnHandoverSubmit"><?php echo htmlspecialchars(t('admin.handover.submit')); ?></button>
            </div>
        </form>
    </div>
</div>

<?php if ($isAdmin): ?>
<!-- 添加成员弹窗 (标准 L 档 640px 双列表单) -->
<div id="addUserModal" class="custom-modal" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="addUserModalTitle">
    <div class="modal-dialog-box modal-lg">
        <div class="modal-head">
            <h4 id="addUserModalTitle"><?php echo htmlspecialchars(t('admin.users.add_title')); ?></h4>
            <button type="button" class="close-x" onclick="closeModal('addUserModal')" title="<?php echo htmlspecialchars(t('common.close')); ?>"><i class="ri-close-line"></i></button>
        </div>
        <form onsubmit="handleCreateUser(event)" novalidate>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 14px;">
                <div>
                    <label class="m-label" for="newName"><?php echo htmlspecialchars(t('auth.real_name')); ?> <span class="req-star">*</span></label>
                    <input type="text" id="newName" class="m-input" placeholder="<?php echo htmlspecialchars(t('auth.real_name_example')); ?>" required autocomplete="off" maxlength="20" data-error-target="newNameError" aria-errormessage="newNameError">
                    <div class="field-error-tip" id="newNameError" role="alert"></div>
                </div>
                <div>
                    <label class="m-label" for="newEmail"><?php echo htmlspecialchars(t('auth.work_email')); ?> <span class="req-star">*</span></label>
                    <div style="position:relative;display:flex;align-items:center;">
                        <input type="text" id="newEmail" class="m-input" data-fixed-domain="<?php echo htmlspecialchars($fixedEmailDomain); ?>" placeholder="<?php echo $fixedEmailDomain ? htmlspecialchars(t('auth.email_prefix_placeholder')) : htmlspecialchars(t('auth.email_example_placeholder')); ?>" required maxlength="100" data-error-target="newEmailError" aria-errormessage="newEmailError" style="flex:1;<?php echo $fixedEmailDomain ? ('padding-right:' . (mb_strlen($fixedEmailDomain)*8 + 32) . 'px;') : ''; ?>" oninput="handleEmailInputWithDomain(this, 'newUserDomainBadge')" autocomplete="off">
                        <?php if ($fixedEmailDomain): ?>
                            <span id="newUserDomainBadge" class="m-domain-badge">@<?php echo htmlspecialchars($fixedEmailDomain); ?></span>
                        <?php endif; ?>
                    </div>
                    <div class="field-error-tip" id="newEmailError" role="alert"></div>
                </div>
                <div>
                    <div class="field-label-row">
                        <label class="m-label" for="newPassword"><?php echo htmlspecialchars(t('admin.users.init_password')); ?> <span class="req-star">*</span></label>
                        <span class="password-strength" id="newPasswordStrength" role="status"></span>
                    </div>
                    <input type="password" id="newPassword" class="m-input" placeholder="<?php echo htmlspecialchars(t('auth.password_min_placeholder')); ?>" autocomplete="new-password" required data-password-strength="newPasswordStrength" data-error-target="newPasswordError" aria-describedby="newPasswordStrength" aria-errormessage="newPasswordError">
                    <div class="field-error-tip" id="newPasswordError" role="alert"></div>
                </div>
                <div>
                    <label class="m-label" for="newRole"><?php echo htmlspecialchars(t('admin.users.role_label')); ?></label>
                    <select id="newRole" class="m-input">
                        <option value="viewer"><?php echo htmlspecialchars(t('common.role.viewer')); ?></option>
                        <option value="editor"><?php echo htmlspecialchars(t('common.role.editor')); ?></option>
                        <option value="admin"><?php echo htmlspecialchars(t('common.role.admin')); ?></option>
                    </select>
                </div>
                <div style="grid-column: span 2;">
                    <label class="m-label" for="newDepartment"><?php echo htmlspecialchars(t('auth.department')); ?> <span class="opt-tag"><?php echo htmlspecialchars(t('common.optional')); ?></span></label>
                    <input type="text" id="newDepartment" class="m-input" placeholder="<?php echo htmlspecialchars(t('auth.department_placeholder')); ?>" maxlength="30">
                </div>
                <div style="grid-column: span 2;">
                    <label class="m-label" for="newWebhookUrl">
                        <span><?php echo htmlspecialchars(t('profile.my_webhook')); ?></span>
                        <span class="opt-tag"><?php echo htmlspecialchars(t('common.optional')); ?></span>
                    </label>
                    <div class="m-form-row">
                        <input type="text" id="newWebhookUrl" class="m-input" placeholder="<?php echo htmlspecialchars(t('profile.webhook_placeholder')); ?>" style="flex:1" maxlength="1000">
                        <button type="button" class="btn-cancel btn-standard" onclick="testAnyWebhook('newWebhookUrl', this)">
                            <span class="duo-icon-slot" data-duo-icon="send"><i class="ri-send-plane-line duo-rest-icon"></i></span> <?php echo htmlspecialchars(t('common.test')); ?>
                        </button>
                    </div>
                    <div style="font-size:11px;color:var(--text-3);margin-top:4px;line-height:1.4;"><?php echo t('admin.users.personal_webhook_hint'); ?></div>
                </div>
            </div>
            <div class="m-modal-footer">
                <button type="button" class="btn-cancel btn-standard" onclick="closeModal('addUserModal')"><?php echo htmlspecialchars(t('common.cancel')); ?></button>
                <button type="submit" class="btn-primary btn-standard" id="btnUserAddSubmit"><?php echo htmlspecialchars(t('admin.users.add_btn')); ?></button>
            </div>
        </form>
    </div>
</div>

<!-- 编辑成员信息弹窗 (标准 L 档 640px 双列表单) -->
<div id="editUserModal" class="custom-modal" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="editUserModalTitle">
    <div class="modal-dialog-box modal-lg">
        <div class="modal-head">
            <div style="display:flex;align-items:center;min-width:0;">
                <h4 id="editUserModalTitle" style="margin:0;"><?php echo htmlspecialchars(t('admin.users.edit_title')); ?></h4>
                <span id="editUserTargetName" style="font-size:12px;color:var(--text-2);background:var(--canvas);border:1px solid var(--border);padding:2px 8px;border-radius:4px;margin-left:8px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
            </div>
            <button type="button" class="close-x" onclick="closeModal('editUserModal')" title="<?php echo htmlspecialchars(t('common.close')); ?>"><i class="ri-close-line"></i></button>
        </div>
        <form onsubmit="handleUpdateUser(event)" novalidate>
            <input type="hidden" id="editUserId" value="0">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 14px;">
                <div>
                    <label class="m-label" for="editUserName"><?php echo htmlspecialchars(t('auth.real_name')); ?> <span class="req-star">*</span></label>
                    <input type="text" id="editUserName" class="m-input" placeholder="<?php echo htmlspecialchars(t('auth.real_name_example')); ?>" required autocomplete="off" maxlength="20" data-error-target="editUserNameError" aria-errormessage="editUserNameError">
                    <div class="field-error-tip" id="editUserNameError" role="alert"></div>
                </div>
                <div>
                    <label class="m-label" for="editUserEmail"><?php echo htmlspecialchars(t('auth.work_email')); ?> <span class="req-star">*</span></label>
                    <input type="email" id="editUserEmail" class="m-input" placeholder="<?php echo htmlspecialchars(t('auth.email_example_placeholder')); ?>" required autocomplete="off" maxlength="100" data-error-target="editUserEmailError" aria-errormessage="editUserEmailError">
                    <div class="field-error-tip" id="editUserEmailError" role="alert"></div>
                </div>
                <div>
                    <div class="field-label-row">
                        <label class="m-label" for="editUserPassword"><?php echo htmlspecialchars(t('auth.new_password')); ?> <span class="opt-tag"><?php echo htmlspecialchars(t('common.optional')); ?></span></label>
                        <span class="password-strength" id="editUserPasswordStrength" role="status"></span>
                    </div>
                    <input type="password" id="editUserPassword" class="m-input" placeholder="<?php echo htmlspecialchars(t('admin.users.keep_pwd_placeholder')); ?>" autocomplete="new-password" data-password-strength="editUserPasswordStrength" data-error-target="editUserPasswordError" aria-describedby="editUserPasswordStrength" aria-errormessage="editUserPasswordError">
                    <div class="field-error-tip" id="editUserPasswordError" role="alert"></div>
                </div>
                <div>
                    <label class="m-label" for="editUserRole"><?php echo htmlspecialchars(t('admin.users.role_label')); ?></label>
                    <select id="editUserRole" class="m-input">
                        <option value="viewer"><?php echo htmlspecialchars(t('common.role.viewer')); ?></option>
                        <option value="editor"><?php echo htmlspecialchars(t('common.role.editor')); ?></option>
                        <option value="admin"><?php echo htmlspecialchars(t('common.role.admin')); ?></option>
                    </select>
                </div>
                <div>
                    <label class="m-label" for="editUserStatus"><?php echo htmlspecialchars(t('admin.users.status_label')); ?></label>
                    <select id="editUserStatus" class="m-input">
                        <option value="1"><?php echo htmlspecialchars(t('common.enabled')); ?></option>
                        <option value="0"><?php echo htmlspecialchars(t('common.disabled')); ?></option>
                    </select>
                </div>
                <div>
                    <label class="m-label" for="editUserDepartment"><?php echo htmlspecialchars(t('auth.department')); ?> <span class="opt-tag"><?php echo htmlspecialchars(t('common.optional')); ?></span></label>
                    <input type="text" id="editUserDepartment" class="m-input" placeholder="<?php echo htmlspecialchars(t('auth.department_placeholder')); ?>" maxlength="30">
                </div>
                <div style="grid-column: span 2;">
                    <label class="m-label" for="editUserWebhook">
                        <span><?php echo htmlspecialchars(t('profile.my_webhook')); ?></span>
                        <span class="opt-tag"><?php echo htmlspecialchars(t('common.optional')); ?></span>
                    </label>
                    <div class="m-form-row">
                        <input type="text" id="editUserWebhook" class="m-input" placeholder="<?php echo htmlspecialchars(t('profile.webhook_placeholder')); ?>" style="flex:1" maxlength="1000">
                        <button type="button" class="btn-cancel btn-standard" onclick="testAnyWebhook('editUserWebhook', this)">
                            <span class="duo-icon-slot" data-duo-icon="send"><i class="ri-send-plane-line duo-rest-icon"></i></span> <?php echo htmlspecialchars(t('common.test')); ?>
                        </button>
                    </div>
                    <div style="font-size:11px;color:var(--text-3);margin-top:4px;line-height:1.4;"><?php echo t('admin.users.personal_webhook_hint'); ?></div>
                </div>
            </div>
            <div class="m-modal-footer">
                <button type="button" class="btn-cancel btn-standard" onclick="closeModal('editUserModal')"><?php echo htmlspecialchars(t('common.cancel')); ?></button>
                <button type="submit" class="btn-primary btn-standard" id="btnUserUpdateSubmit"><?php echo htmlspecialchars(t('common.save')); ?></button>
            </div>
        </form>
    </div>
</div>
<?php endif; ?>

<?php if (!empty($currentUser)): ?>
<!-- 全员个人设置：账号摘要 + 基本资料 / 安全设置 / MCP。 -->
<div id="profileModal" class="custom-modal" style="display:none;" aria-label="<?php echo htmlspecialchars(t('profile.title')); ?>">
    <div class="modal-dialog-box modal-md">
        <div class="modal-head profile-modal-head">
            <div class="profile-account">
                <button type="button" id="myProfileAvatarBtn" class="profile-avatar profile-avatar-btn" title="<?php echo htmlspecialchars(t('avatar.title')); ?>" aria-label="<?php echo htmlspecialchars(t('avatar.title')); ?>" aria-haspopup="dialog" aria-expanded="false" aria-controls="profileAvatarPopover" onclick="toggleProfileAvatarPicker(event)">
                    <span id="myProfileAvatarGraphic" class="profile-avatar-graphic">
                        <i class="ri-user-3-line" aria-hidden="true"></i>
                    </span>
                    <span class="profile-avatar-edit-dot" aria-hidden="true">
                        <i class="ri-pencil-line"></i>
                    </span>
                </button>
                <div class="profile-account-meta">
                    <div class="profile-name" id="myProfileHeaderName"><?php echo htmlspecialchars(!empty($currentUser['name']) ? $currentUser['name'] : (!empty($currentUser['email']) ? $currentUser['email'] : t('common.user_default'))); ?></div>
                    <div class="profile-meta-row">
                        <span><?php echo htmlspecialchars($currentUser['email'] ?? ''); ?></span>
                        <span class="badge-tag <?php echo !empty($currentUser['is_owner']) ? 'badge-role-owner' : ($isAdmin ? 'badge-role-admin' : ($canManage ? 'badge-role-editor' : 'badge-role-viewer')); ?>"><?php echo htmlspecialchars(!empty($currentUser['is_owner']) ? t('common.role.owner') : ($isAdmin ? t('common.role.admin') : ($canManage ? t('common.role.editor') : t('common.role.viewer')))); ?></span>
                    </div>
                </div>
            </div>
            <button type="button" class="close-x" onclick="closeModal('profileModal')" title="<?php echo htmlspecialchars(t('common.close')); ?>"><i class="ri-close-line" aria-hidden="true"></i></button>
        </div>

        <div id="profileAvatarPopover" class="profile-avatar-popover" role="dialog" aria-label="<?php echo htmlspecialchars(t('avatar.picker_aria')); ?>" hidden>
            <div class="profile-avatar-popover-head">
                <span class="profile-avatar-popover-title"><?php echo htmlspecialchars(t('avatar.picker_title')); ?></span>
                <span id="profileAvatarPreviewLabel" class="profile-avatar-popover-tag"></span>
            </div>
            <div id="profileAvatarGrid" class="profile-avatar-grid" role="radiogroup" aria-label="<?php echo htmlspecialchars(t('avatar.pose_aria')); ?>"></div>
            <div id="profileAvatarColors" class="profile-avatar-colors" hidden>
                <span class="profile-avatar-colors-label"><?php echo htmlspecialchars(t('avatar.colors_label')); ?></span>
                <div id="profileAvatarColorGrid" class="profile-avatar-color-grid" role="radiogroup" aria-label="<?php echo htmlspecialchars(t('avatar.colors_aria')); ?>"></div>
            </div>
        </div>

        <div class="profile-tabs" role="tablist" aria-label="<?php echo htmlspecialchars(t('profile.tabs_aria')); ?>" onkeydown="handleProfileTabKey(event)">
            <button type="button" id="profileTabData" class="log-subtab-btn active" role="tab" aria-controls="profilePageData" aria-selected="true" tabindex="0" onclick="showProfilePage('data')"><?php echo htmlspecialchars(t('profile.tab.data')); ?></button>
            <button type="button" id="profileTabPassword" class="log-subtab-btn" role="tab" aria-controls="profilePagePassword" aria-selected="false" tabindex="-1" onclick="showProfilePage('password')"><?php echo htmlspecialchars(t('profile.tab.password')); ?></button>
            <button type="button" id="profileTabMcp" class="log-subtab-btn" role="tab" aria-controls="profilePageMcp" aria-selected="false" tabindex="-1" onclick="showProfilePage('mcp')"><?php echo htmlspecialchars(t('profile.tab.mcp')); ?></button>
        </div>
        <div id="profilePageData" data-profile-page="data" role="tabpanel" aria-labelledby="profileTabData">
        <form id="profileForm" onsubmit="handleSaveProfile(event)">
            <div class="m-form-group">
                <label class="m-label" for="myDisplayName"><?php echo htmlspecialchars(t('auth.real_name')); ?> <span class="req-star">*</span></label>
                <div class="m-form-row">
                <input type="text" id="myDisplayName" class="m-input" required value="<?php echo htmlspecialchars($currentUser['display_name'] ?? ''); ?>" placeholder="<?php echo htmlspecialchars(t('auth.real_name_example')); ?>" maxlength="20">
                <button type="submit" class="btn-primary btn-standard" id="btnSaveProfile" disabled><?php echo htmlspecialchars(t('common.save')); ?></button>
                </div>
            </div>
        </form>

        <div class="profile-notification">
            <label class="m-label" for="myWebhookUrl"><?php echo htmlspecialchars(t('profile.my_webhook')); ?> <span class="opt-tag"><?php echo htmlspecialchars(t('common.optional')); ?></span></label>
            <form id="profileWebhookForm" onsubmit="handleSaveProfileWebhook(event)">
                <div class="m-form-row profile-notification-row">
                <input type="text" id="myWebhookUrl" class="m-input" value="<?php echo htmlspecialchars($currentUser['webhook_url'] ?? ''); ?>" placeholder="<?php echo htmlspecialchars(t('profile.webhook_placeholder')); ?>" maxlength="1000">
                <div class="profile-inline-actions">
                    <button type="button" class="btn-cancel btn-standard" onclick="testAnyWebhook('myWebhookUrl', this)"><span class="duo-icon-slot" data-duo-icon="send"><i class="ri-send-plane-line duo-rest-icon"></i></span> <?php echo htmlspecialchars(t('common.test')); ?></button>
                    <button type="submit" class="btn-primary btn-standard" id="btnSaveProfileWebhook" disabled><?php echo htmlspecialchars(t('common.save')); ?></button>
                </div>
                </div>
                <div style="font-size:11.5px;color:var(--text-3);margin-top:6px;line-height:1.4;"><?php echo t('profile.webhook_hint'); ?></div>
            </form>
        </div>
        </div>
        <div id="profilePagePassword" data-profile-page="password" role="tabpanel" aria-labelledby="profileTabPassword" hidden>
            <form id="changePasswordForm" onsubmit="handleChangeMyPassword(event)" novalidate>
                <div class="m-form-group" style="margin-bottom:10px;">
                    <label class="m-label" for="myOldPassword"><?php echo htmlspecialchars(t('profile.old_password')); ?> <span class="req-star">*</span></label>
                    <input type="password" id="myOldPassword" class="m-input" placeholder="<?php echo htmlspecialchars(t('profile.old_password_placeholder')); ?>" autocomplete="current-password" required maxlength="64" data-error-target="myOldPasswordError" aria-describedby="myOldPasswordError">
                    <div class="field-error-tip" id="myOldPasswordError" role="alert"></div>
                </div>
                <div class="m-form-group" style="margin-bottom:10px;">
                    <div class="field-label-row">
                        <label class="m-label" for="myNewPassword"><?php echo htmlspecialchars(t('auth.new_password')); ?> <span class="req-star">*</span></label>
                        <span class="password-strength" id="myPasswordStrength" role="status"></span>
                    </div>
                    <input type="password" id="myNewPassword" class="m-input" placeholder="<?php echo htmlspecialchars(t('auth.password_min_placeholder')); ?>" autocomplete="new-password" required data-password-strength="myPasswordStrength" data-error-target="myNewPasswordError" aria-describedby="myPasswordStrength" aria-errormessage="myNewPasswordError">
                    <div class="field-error-tip" id="myNewPasswordError" role="alert"></div>
                </div>
                <div class="m-form-group" style="margin-bottom:12px;">
                    <label class="m-label" for="myConfirmPassword"><?php echo htmlspecialchars(t('auth.confirm_new_password')); ?> <span class="req-star">*</span></label>
                    <input type="password" id="myConfirmPassword" class="m-input" placeholder="<?php echo htmlspecialchars(t('auth.confirm_new_password_again')); ?>" autocomplete="new-password" required data-error-target="myConfirmPasswordError" aria-describedby="myConfirmPasswordError">
                    <div class="field-error-tip" id="myConfirmPasswordError" role="alert"></div>
                </div>
                <div class="profile-form-actions">
                    <button type="submit" class="btn-primary btn-standard"><?php echo htmlspecialchars(t('profile.update_password')); ?></button>
                </div>
            </form>
        </div>
        <div id="profilePageMcp" data-profile-page="mcp" role="tabpanel" aria-labelledby="profileTabMcp" class="mcp-panel" hidden>
            <div class="mcp-status-bar">
                <div class="mcp-status-info">
                    <span id="mcpCredentialStatus" class="mcp-auth-status" role="status"><?php echo htmlspecialchars(t('mcp.reading')); ?></span>
                    <button type="button" id="mcpLoadRetry" class="btn-cancel btn-sm" onclick="loadMcpSettings()" hidden><?php echo htmlspecialchars(t('common.reload')); ?></button>
                </div>
                <div class="mcp-status-actions">
                    <button type="button" id="mcpCreateButton" class="btn-cancel btn-sm" onclick="createMcpCredential(event)"><?php echo htmlspecialchars(t('mcp.create_token')); ?></button>
                    <button type="button" id="mcpRevokeButton" class="btn-cancel btn-sm" onclick="revokeMcpCredential()" hidden><?php echo htmlspecialchars(t('mcp.revoke_token')); ?></button>
                </div>
            </div>
            <fieldset id="mcpControls" class="profile-fieldset" disabled>
                <form id="mcpPermissionForm" onsubmit="handleMcpPermissionChange(event)">
                    <div class="m-form-group">
                        <label class="m-label" id="mcpProjectScopeLabel"><?php echo htmlspecialchars(t('mcp.project_scope')); ?></label>
                        <div class="mcp-scope-switch" role="radiogroup" aria-labelledby="mcpProjectScopeLabel">
                            <button type="button" id="mcpScopeModeAll" class="mcp-scope-btn active" role="radio" aria-checked="true" onclick="setMcpScopeMode('all')"><?php echo htmlspecialchars(t('mcp.scope_all')); ?></button>
                            <button type="button" id="mcpScopeModeCustom" class="mcp-scope-btn" role="radio" aria-checked="false" onclick="setMcpScopeMode('custom')"><?php echo htmlspecialchars(t('mcp.scope_custom')); ?></button>
                        </div>
                    </div>
                    <div id="mcpCustomProjectsWrap" class="m-form-group" style="position:relative;margin-top:-6px;" hidden>
                        <button type="button" id="mcpProjectSelectTrigger" class="m-input m-input-trigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="mcpProjectSelectMenu" onclick="toggleMcpProjectDropdown(event)">
                            <span id="mcpProjectSelectTags" style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-width:0;">
                                <span style="font-size:12.5px;color:var(--text-3);"><?php echo htmlspecialchars(t('mcp.select_projects_placeholder')); ?></span>
                            </span>
                            <i class="ri-arrow-down-s-line" style="color:var(--text-3);font-size:16px;margin-left:auto;flex-shrink:0;" aria-hidden="true"></i>
                        </button>
                        <div id="mcpProjectSelectMenu" class="mcp-dropdown-menu" role="group" aria-labelledby="mcpProjectScopeLabel" style="display:none;">
                            <div class="mcp-dropdown-header">
                                <span><?php echo htmlspecialchars(t('mcp.authorized_projects')); ?></span>
                                <div class="mcp-dropdown-tools">
                                    <button type="button" class="inline-action-btn is-primary" onclick="selectAllMcpProjects(true)"><?php echo htmlspecialchars(t('common.select_all')); ?></button>
                                    <button type="button" class="inline-action-btn" onclick="selectAllMcpProjects(false)"><?php echo htmlspecialchars(t('common.clear')); ?></button>
                                </div>
                            </div>
                            <div id="mcpProjectOptions" class="mcp-dropdown-options">
                                <!-- 由 JS 渲染选项 -->
                            </div>
                        </div>
                    </div>
                    <select id="mcpProjectScope" hidden><option value="0"><?php echo htmlspecialchars(t('mcp.scope_all')); ?></option></select>
                    <button type="submit" id="mcpSavePermissions" hidden></button>
                    <div id="mcpPublishSwitchRow" class="mcp-switch-row"<?php echo empty($canManage) ? ' hidden' : ''; ?>>
                        <label class="mcp-switch-label" for="mcpPublishPermission"><?php echo htmlspecialchars(t('mcp.allow_publish')); ?></label>
                        <label class="linear-switch">
                            <input type="checkbox" id="mcpPublishPermission" onchange="autoSaveMcpPermissions()">
                            <span class="linear-switch-slider"></span>
                        </label>
                    </div>
                    <p id="mcpReadOnlyHint" class="mcp-tip-text mcp-readonly-hint"<?php echo !empty($canManage) ? ' hidden' : ''; ?>><?php echo htmlspecialchars(t('mcp.readonly_hint')); ?></p>
                </form>
                <div id="mcpNewCredential" class="m-form-group" hidden>
                    <label class="m-label" for="mcpSecret"><?php echo htmlspecialchars(t('mcp.personal_token')); ?></label>
                    <div class="m-form-row">
                        <input type="password" id="mcpSecret" class="m-input" readonly autocomplete="off">
                        <button type="button" class="btn-cancel btn-standard" onclick="copyMcpValue('mcpSecret')"><?php echo htmlspecialchars(t('mcp.copy_token')); ?></button>
                    </div>
                    <p class="mcp-tip-text"><?php echo htmlspecialchars(t('mcp.token_once_tip')); ?></p>
                </div>
                <button type="button" id="mcpCopyAiButton" class="btn-primary btn-standard mcp-btn-main" onclick="copyMcpAiPrompt()"><?php echo htmlspecialchars(t('mcp.copy_ai_prompt')); ?></button>
                <div class="mcp-config-header">
                    <button type="button" id="mcpManualToggleBtn" class="mcp-manual-toggle" onclick="toggleMcpManualConfig()" aria-expanded="false" aria-controls="mcpManualBody">
                        <span class="mcp-manual-title"><?php echo htmlspecialchars(t('mcp.manual_config')); ?></span>
                        <span id="mcpManualToggleText" class="mcp-manual-toggle-text"><?php echo htmlspecialchars(t('common.expand')); ?></span>
                        <i id="mcpManualToggleIcon" class="ri-arrow-down-s-line" aria-hidden="true"></i>
                    </button>
                    <a class="mcp-guide-link" href="mcp.php?guide=1" target="_blank" rel="noopener"><?php echo htmlspecialchars(t('mcp.guide_link')); ?> <span class="duo-icon-slot" data-duo-icon="external-link"><i class="ri-external-link-line duo-rest-icon" aria-hidden="true"></i></span></a>
                </div>
                <div id="mcpManualBody" class="mcp-manual-body" style="display:none;">
                    <div class="m-form-group">
                        <label class="m-label" for="mcpEndpoint"><?php echo htmlspecialchars(t('mcp.endpoint')); ?></label>
                        <div class="m-form-row"><input id="mcpEndpoint" class="m-input" readonly><button type="button" class="btn-cancel btn-standard" onclick="copyMcpValue('mcpEndpoint')"><?php echo htmlspecialchars(t('mcp.copy_endpoint')); ?></button></div>
                    </div>
                    <div class="m-form-group">
                        <label class="m-label" for="mcpClientFormat"><?php echo htmlspecialchars(t('mcp.config_format')); ?></label>
                        <select id="mcpClientFormat" class="m-input" onchange="renderMcpConfig()"><option value="json"><?php echo htmlspecialchars(t('mcp.format_json')); ?></option><option value="codex"><?php echo htmlspecialchars(t('mcp.format_codex')); ?></option></select>
                    </div>
                    <div class="mcp-code-wrapper">
                        <button type="button" class="btn-cancel btn-sm mcp-code-copy-btn" onclick="copyMcpConfig()" title="<?php echo htmlspecialchars(t('mcp.copy_config')); ?>"><span class="duo-icon-slot" data-duo-icon="copy"><i class="ri-file-copy-line duo-rest-icon" aria-hidden="true"></i></span> <?php echo htmlspecialchars(t('mcp.copy_config')); ?></button>
                        <pre id="mcpConfig" class="mcp-code" tabindex="0" aria-label="<?php echo htmlspecialchars(t('mcp.config_aria')); ?>"></pre>
                    </div>
                    <p id="mcpConfigFilePath" class="mcp-tip-text"></p>
                    <p id="mcpConfigSecretHint" class="mcp-tip-text"><?php echo htmlspecialchars(t('mcp.secret_hint')); ?></p>
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
            <div style="font-weight:600;font-size:13.5px;color:var(--text-1);"><?php echo htmlspecialchars(t('auth.first_login_title')); ?></div>
            <div style="font-size:12px;color:var(--text-2);margin-top:2px;line-height:1.5;"><?php echo htmlspecialchars(t('auth.first_login_desc')); ?></div>
        </div>
        <button type="button" class="close-x" onclick="dismissFirstLoginTip()" title="<?php echo htmlspecialchars(t('auth.later')); ?>"><i class="ri-close-line"></i></button>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:2px;">
        <button type="button" class="btn-cancel btn-sm" onclick="dismissFirstLoginTip()"><?php echo htmlspecialchars(t('auth.later')); ?></button>
        <button type="button" class="btn-primary btn-sm" onclick="openProfilePasswordModal()"><?php echo htmlspecialchars(t('auth.change_now')); ?></button>
    </div>
</div>
<?php endif; ?>

