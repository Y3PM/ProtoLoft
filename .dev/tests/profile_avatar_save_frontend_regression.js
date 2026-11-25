'use strict';
// Exercise production avatar autosave and shared apiFetch with deferred responses and controlled DOM.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '../..');
const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
const avatarCode = app.slice(app.indexOf('/* 个人中心头像：'));
assert(avatarCode.startsWith('/* 个人中心头像：'), 'avatar section exists');
let passed = 0;
function check(label, condition) { assert(condition, label); passed++; console.log('PASS ' + label); }

function fixture() {
    const nodes = {};
    for (const id of ['myProfileAvatarGraphic', 'myProfileAvatarBtn', 'profileAvatarPopover',
        'profileAvatarGrid', 'profileAvatarColors', 'profileAvatarColorGrid',
        'profileAvatarPreviewLabel']) {
        nodes[id] = {
            hidden: true, disabled: false, innerHTML: '', textContent: '', focusCount: 0,
            _outsideBound: true,
            getAttribute(key) { return key === 'data-built' ? '1' : this[key]; },
            setAttribute(key, value) { this[key] = value; },
            querySelectorAll() { return []; }, querySelector() { return null; },
            focus() { this.focusCount++; }
        };
    }
    const requests = [], notices = [];
    const choice = {tagName: 'BUTTON', disabled: false, classList: {add() {}, remove() {}}};
    const context = {
        CURRENT_USER: {id: 1, avatar: 'head-mint'}, FormData,
        document: {readyState: 'loading', activeElement: choice, getElementById: id => nodes[id], addEventListener() {}, querySelector() { return {getAttribute() { return 'synthetic-csrf'; }}; }},
        showToast: (message, type) => notices.push({message, type}),
        fetch(url, options) {
            return new Promise((resolve, reject) => requests.push({avatar: options.body.get('avatar'), action: options.body.get('action'), resolve, reject}));
        }
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/profile-avatars.js'), 'utf8'), context);
    vm.runInContext(app.slice(app.indexOf('function getCsrfToken()'), app.indexOf('function togglePasswordVisibility(')), context);
    vm.runInContext(avatarCode, context);
    context.openProfileAvatarPicker();
    const select = id => context.selectProfileAvatar(id);
    const displayed = id => nodes.myProfileAvatarGraphic.innerHTML.includes('data-avatar-pose="' + id.split('-')[0] + '"')
        && nodes.myProfileAvatarGraphic.innerHTML.includes('data-avatar-theme="' + id.split('-')[1] + '"');
    async function finish(index, response) {
        requests[index].resolve({text: () => Promise.resolve(JSON.stringify(response || {success: true, data: {avatar: requests[index].avatar}}))});
        await new Promise(resolve => setImmediate(resolve));
    }
    return {c: context, nodes, requests, notices, choice, select, displayed, finish};
}

(async () => {
    let f = fixture();
    check('opening picker does not send a request', f.requests.length === 0);
    f.select('head-mint');
    check('reselecting saved avatar does not send a request', f.requests.length === 0);
    f.select('walk-mint'); f.select('walk-mint');
    check('selection immediately previews and sends one deduplicated request', f.displayed('walk-mint') && f.requests.length === 1 && f.requests[0].avatar === 'walk-mint');
    check('shared apiFetch leaves avatar choices enabled', !f.choice.disabled);
    await f.finish(0);
    check('success persists quietly and leaves picker open', f.c.CURRENT_USER.avatar === 'walk-mint' && !f.nodes.profileAvatarPopover.hidden && f.notices.length === 0);

    f = fixture(); f.select('walk-mint'); f.select('sit-amber'); f.select('bow-coral');
    check('rapid selections preview the last choice with only one active request', f.requests.length === 1 && f.displayed('bow-coral'));
    await f.finish(0);
    check('old success cannot overwrite the latest selection', f.c.CURRENT_USER.avatar === 'walk-mint' && f.displayed('bow-coral'));
    check('queue skips intermediate choices and submits the latest after release', f.requests.length === 2 && f.requests[1].avatar === 'bow-coral');
    await f.finish(1);
    check('last choice becomes the final persisted value', f.c.CURRENT_USER.avatar === 'bow-coral' && !f.c.profileAvatarSaving && f.requests.length === 2);

    f = fixture(); f.select('walk-mint'); f.select('head-mint');
    await f.finish(0); await f.finish(1);
    check('returning to the original avatar while saving is persisted too', f.requests[1].avatar === 'head-mint' && f.c.CURRENT_USER.avatar === 'head-mint');

    f = fixture(); f.select('walk-mint'); f.c.closeProfileAvatarPicker(); f.c.openProfileAvatarPicker();
    check('closing and reopening preserves an in-flight selection', f.displayed('walk-mint') && f.requests.length === 1);
    f.c.renderMyProfileAvatar();
    check('reopening the profile header keeps the pending selection', f.displayed('walk-mint'));
    await f.finish(0);
    check('late success neither closes reopened picker nor steals focus', !f.nodes.profileAvatarPopover.hidden && f.nodes.myProfileAvatarBtn.focusCount === 0);

    f = fixture(); f.select('walk-mint'); f.select('rest-indigo'); f.c.closeProfileAvatarPicker();
    await f.finish(0); await f.finish(1);
    check('closing picker keeps the queue and final selection', f.nodes.profileAvatarPopover.hidden && f.displayed('rest-indigo') && f.c.CURRENT_USER.avatar === 'rest-indigo');

    f = fixture(); f.select('walk-mint');
    await f.finish(0, {success: false, message: 'fixture rejected'});
    check('business failure restores the confirmed avatar and reports one error', f.displayed('head-mint') && f.c.pendingProfileAvatar === 'head-mint' && !f.c.profileAvatarSaving && f.notices.length === 1 && f.notices[0].message === 'fixture rejected');
    f.select('walk-mint'); await f.finish(1);
    check('a failed choice can be clicked again to retry', f.c.CURRENT_USER.avatar === 'walk-mint');

    f = fixture(); f.select('walk-mint'); f.select('rest-violet');
    await f.finish(0, {success: false});
    check('a superseded failure preserves and submits the latest selection', f.displayed('rest-violet') && f.requests[1].avatar === 'rest-violet' && f.notices.length === 0);
    await f.finish(1);
    check('latest selection succeeds after an older choice failed', f.c.CURRENT_USER.avatar === 'rest-violet');

    f = fixture(); f.select('walk-mint'); f.select('rest-violet'); await f.finish(0);
    await f.finish(1, {success: false});
    check('latest failure restores the most recently confirmed intermediate value', f.c.CURRENT_USER.avatar === 'walk-mint' && f.displayed('walk-mint') && f.notices.length === 1);

    f = fixture(); f.select('walk-mint'); f.c.closeProfileAvatarPicker();
    f.requests[0].reject(new Error('offline')); await new Promise(resolve => setImmediate(resolve));
    check('network failure restores confirmed avatar without reopening or stealing focus', f.nodes.profileAvatarPopover.hidden && f.displayed('head-mint') && f.nodes.myProfileAvatarBtn.focusCount === 0 && !f.c.profileAvatarSaving);
    check('network failure reports one actionable error', f.notices.length === 1 && f.notices[0].type === 'error' && f.notices[0].message.includes('重试'));

    f = fixture(); f.select('walk-mint'); f.select('bow-amber');
    f.requests[0].reject(new Error('offline')); await new Promise(resolve => setImmediate(resolve));
    check('queue continues after a superseded network failure', f.requests[1].avatar === 'bow-amber' && f.displayed('bow-amber') && f.notices.length === 0);
    await f.finish(1);
    f.select('leap-sky'); await f.finish(2);
    check('standard logo still saves in its original color', f.c.CURRENT_USER.avatar === 'leap-sky');
    console.log(JSON.stringify({passed, scope: 'production autosave and apiFetch with deferred HTTP and controlled DOM'}));
})().catch(error => { console.error(error); process.exitCode = 1; });
