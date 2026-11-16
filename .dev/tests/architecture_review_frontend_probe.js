/* Read-only audit witnesses: execute production functions with controlled DOM/network.
 * Exit 1 means an architectural defect is still reproduced, not a harness failure.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '../..');
const results = [];
function record(id, observed, detail) {
    results.push({id, issue_reproduced: observed, detail});
    console.log(JSON.stringify(results[results.length - 1]));
}
function context(extra) {
    return Object.assign({FormData, Promise, String, JSON, parseInt, Date, Error,
        document: {querySelector: () => null, getElementById: () => null},
        window: {}, showToast() {}}, extra);
}
async function main() {
    const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
    const annotation = fs.readFileSync(path.join(root, 'assets/js/annotation.js'), 'utf8');
    const mcp = fs.readFileSync(path.join(root, 'assets/js/mcp.js'), 'utf8');
    let sharedRequests = 0, standaloneRequests = 0;
    const shared = context({getCsrfToken: () => '', fetch: () => {
        sharedRequests++; return new Promise(() => {});
    }});
    vm.createContext(shared);
    vm.runInContext(app.slice(app.indexOf('var _pendingRequests'), app.indexOf('function togglePasswordVisibility')), shared);
    for (let i = 0; i < 2; i++) {
        const fd = new FormData(); fd.set('id', '31');
        shared.apiFetch('toggle_annotation_status', fd, false);
    }
    const standalone = context({fetch: () => {
        standaloneRequests++; return new Promise(() => {});
    }});
    vm.createContext(standalone);
    vm.runInContext(annotation.slice(annotation.indexOf('    if (typeof window.apiFetch'),
        annotation.indexOf('    if (typeof window.showToast')), standalone);
    for (let i = 0; i < 2; i++) {
        const fd = new FormData(); fd.set('id', '31');
        standalone.window.apiFetch('toggle_annotation_status', fd);
    }
    record('share_request_layer', sharedRequests === 1 && standaloneRequests === 2,
        {workspace_requests: sharedRequests, share_requests: standaloneRequests});

    let checked = true, submitted;
    const noop = () => {};
    const nodes = {
        mcpProjectScope: {value: '11'},
        mcpProjectSelectTags: {innerHTML: ''},
        mcpPublishPermission: {checked: false},
        mcpControls: {disabled: false}
    };
    const checkbox = {value: '11', get checked() {return checked;},
        set checked(value) {checked = value;},
        closest: () => ({querySelector: () => ({textContent: 'Scoped project'})})};
    const c = context({document: {
        getElementById: id => nodes[id] || null,
        querySelectorAll: selector => selector.includes(':checked') ? (checked ? [checkbox] : []) : [checkbox]
    }, apiFetch: (action, fd) => {
        submitted = {action, project_ids: fd.getAll('project_ids[]'), project_id: fd.get('project_id')};
        return Promise.resolve({success: true});
    }});
    vm.createContext(c); vm.runInContext(mcp, c);
    c.renderMcpViews = noop;
    c.mcpSettings = {token: {project_id: 11, project_ids: [11]}};
    c.mcpScopeMode = 'custom';
    c.selectAllMcpProjects(false);
    await c.handleMcpPermissionChange();
    assert(submitted.project_id === '0' && submitted.project_ids.length === 0);
    console.log(JSON.stringify({id: 'empty_mcp_scope_defaults_to_authorized_projects',
        expected_behavior: true, submitted}));

    // An unavailable explicit target must stop rather than fall back to another project.
    const admin = fs.readFileSync(path.join(root, 'assets/js/admin.js'), 'utf8');
    let selected = '11';
    const uploadNodes = {};
    const select = {length: 1, val(value) {
        if (arguments.length) selected = ['11', '22'].includes(String(value)) ? String(value) : '';
        return selected;
    }, find(selector) {
        return selector === 'option:first' ? {val: () => '11'} : {length: 2, text: () => 'Existing project'};
    }};
    let opened = false;
    const upload = context({$: () => select, clearUploadVersionNameHint() {},
        toggleUploadNotify() {}, updateUploadNotifyState() {}, openModal() {opened=true;},
        document: {getElementById(id) {
            return uploadNodes[id] || (uploadNodes[id] = {value: '', style: {}, classList: {remove() {}}});
        }}});
    vm.createContext(upload);
    vm.runInContext(admin.slice(admin.indexOf('function openUploadModal('),
        admin.indexOf('function onUploadItemSelectChange(')), upload);
    upload.openUploadModal(33, 'Newly created project');
    assert(!opened && selected === '', 'Unavailable explicit project must stop publishing');
    record('new_project_upload_targets_old_project', (uploadNodes.uploadItemId || {}).value === '11',
        {requested_item: 33, stopped: !opened, actual_publish_item: (uploadNodes.uploadItemId || {}).value || ''});
    process.exitCode = results.some(r => r.issue_reproduced) ? 1 : 0;
}
main().catch(error => {console.error(error); process.exitCode = 2;});
