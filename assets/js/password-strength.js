(function () {
    'use strict';

    var scriptUrl = document.currentScript.src;
    var fieldSelector = 'input[data-password-strength]';
    var labels = ['很弱', '较弱', '一般', '较强', '很强'];
    var pending = new WeakMap();
    var lengthErrors = new WeakMap();
    var estimator;

    function exceedsLimit(password) {
        return password.length > 64 || (typeof TextEncoder === 'function' && new TextEncoder().encode(password).length > 64);
    }

    window.passwordLengthError = function (password) {
        if (exceedsLimit(password)) return '密码不能超过 64 字节（汉字和表情占多个字节）';
        if (Array.from(password).length < 6) return '密码至少需要 6 个字符';
        return '';
    };

    window.showPasswordLengthError = function (field, output) {
        var message = window.passwordLengthError(field.value);
        if (!message) return false;
        lengthErrors.set(field, { output: output, message: message });
        output.textContent = message;
        output.style.display = 'block';
        field.focus();
        return true;
    };

    function clearLengthError(field) {
        var error = lengthErrors.get(field);
        if (error && error.output.textContent === error.message) {
            error.output.textContent = '';
            error.output.style.display = 'none';
        }
        lengthErrors.delete(field);
    }

    function loadEstimator() {
        if (!estimator) {
            estimator = Promise.all(['core', 'language-common', 'language-en'].map(function (part) {
                return new Promise(function (resolve, reject) {
                    var script = document.createElement('script');
                    script.src = new URL('vendor/zxcvbn-ts/' + part + '.min.js', scriptUrl).href;
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
            })).then(function () {
                var bundle = window.zxcvbnts;
                var common = bundle['language-common'];
                var english = bundle['language-en'];
                bundle.core.zxcvbnOptions.setOptions({
                    translations: english.translations,
                    graphs: common.adjacencyGraphs,
                    dictionary: Object.assign({}, common.dictionary, english.dictionary, {
                        userInputs: ['protoloft', '立象原型']
                    })
                });
                return bundle.core.zxcvbn;
            }).catch(function () {
                return null;
            });
        }
        return estimator;
    }

    function clear(field) {
        clearTimeout(pending.get(field));
        pending.delete(field);
        var output = document.getElementById(field.dataset.passwordStrength);
        if (output) {
            output.textContent = '';
            output.removeAttribute('data-score');
        }
    }

    function queue(field) {
        clearTimeout(pending.get(field));
        if (!field.value || exceedsLimit(field.value)) {
            clear(field);
            return;
        }
        var ticket = setTimeout(function () {
            loadEstimator().then(function (estimate) {
                if (pending.get(field) !== ticket) return;
                if (!estimate || !field.value || !field.getClientRects().length || exceedsLimit(field.value)) {
                    clear(field);
                    return;
                }
                try {
                    var score = estimate(field.value).score;
                    var output = document.getElementById(field.dataset.passwordStrength);
                    var message = '密码强度' + labels[score] + (score < 3 ? '，可试试更长的短语' : '');
                    output.dataset.score = score;
                    if (output.textContent !== message) output.textContent = message;
                } catch (error) {
                    clear(field);
                }
            });
        }, 120);
        pending.set(field, ticket);
    }

    ['input', 'change', 'focusin', 'compositionend'].forEach(function (type) {
        document.addEventListener(type, function (event) {
            if (event.target.matches(fieldSelector) && !event.isComposing) {
                if (type !== 'focusin') clearLengthError(event.target);
                queue(event.target);
            }
        });
    });

    document.addEventListener('compositionstart', function (event) {
        if (event.target.matches(fieldSelector)) clear(event.target);
    });

    document.addEventListener('reset', function (event) {
        event.target.querySelectorAll(fieldSelector).forEach(clear);
    });

    window.clearPasswordStrength = function (container) {
        container.querySelectorAll(fieldSelector).forEach(clear);
    };
})();
