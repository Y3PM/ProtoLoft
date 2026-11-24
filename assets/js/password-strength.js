(function () {
    'use strict';

    var scriptUrl = document.currentScript.src;
    var fieldSelector = 'input[data-password-strength]';
    var labels = ['很弱', '较弱', '一般', '较强', '很强'];
    var pending = new WeakMap();
    var fieldErrors = new WeakMap();
    var confirmPairs = new WeakMap();
    var estimator;

    function resolveErrorOutput(field, output) {
        if (output) return output;
        if (field && field.dataset && field.dataset.errorTarget) {
            return document.getElementById(field.dataset.errorTarget);
        }
        return null;
    }

    function exceedsLimit(password) {
        return password.length > 64 || (typeof TextEncoder === 'function' && new TextEncoder().encode(password).length > 64);
    }

    window.passwordLengthError = function (password) {
        if (exceedsLimit(password)) return '密码不能超过 64 字节（汉字和表情占多个字节）';
        if (Array.from(password).length < 6) return '密码至少需要 6 个字符';
        return '';
    };

    window.setFieldError = function (field, output, message, shouldFocus) {
        if (!field || !message) return false;
        var errorEl = resolveErrorOutput(field, output);
        if (field.classList) field.classList.add('m-input-error');
        field.setAttribute('aria-invalid', 'true');
        if (errorEl) {
            fieldErrors.set(field, { output: errorEl, message: message });
            errorEl.textContent = message;
            if (errorEl.classList && errorEl.classList.contains('error-tip')) {
                errorEl.style.display = 'block';
            }
        }
        if (shouldFocus !== false && typeof field.focus === 'function') {
            field.focus();
        }
        return true;
    };

    window.clearFieldError = function (field) {
        if (!field) return;
        if (field.classList) field.classList.remove('m-input-error');
        field.removeAttribute('aria-invalid');
        var record = fieldErrors.get(field);
        var errorEl = record ? record.output : resolveErrorOutput(field, null);
        if (errorEl) {
            if (!record || errorEl.textContent === record.message) {
                errorEl.textContent = '';
                if (errorEl.classList && errorEl.classList.contains('error-tip')) {
                    errorEl.style.display = 'none';
                }
            }
        }
        fieldErrors.delete(field);

        var confirmField = confirmPairs.get(field);
        if (confirmField && field.value === confirmField.value) {
            window.clearFieldError(confirmField);
        }
    };

    window.showPasswordLengthError = function (field, output) {
        var message = window.passwordLengthError(field.value);
        if (!message) {
            window.clearFieldError(field);
            return false;
        }
        return window.setFieldError(field, output, message, true);
    };

    window.showPasswordMismatchError = function (newField, confirmField, confirmOutput, message) {
        if (!newField || !confirmField) return false;
        confirmPairs.set(newField, confirmField);
        if (newField.value !== confirmField.value) {
            return window.setFieldError(
                confirmField,
                confirmOutput,
                message || '两次输入的新密码不一致',
                true
            );
        }
        window.clearFieldError(confirmField);
        return false;
    };

    function loadEstimator() {
        if (!estimator) {
            var vQuery = '';
            try {
                vQuery = new URL(scriptUrl).search;
            } catch (e) {}
            if (!vQuery) vQuery = '?v=3.1.5';

            estimator = Promise.all(['core', 'language-common', 'language-en'].map(function (part) {
                return new Promise(function (resolve, reject) {
                    var script = document.createElement('script');
                    script.src = new URL('vendor/zxcvbn-ts/' + part + '.min.js' + vQuery, scriptUrl).href;
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
                estimator = null;
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
            output.removeAttribute('title');
        }
    }

    function clearContainerErrors(container) {
        if (!container) return;
        container.querySelectorAll('.m-input-error, [data-error-target]').forEach(function (el) {
            window.clearFieldError(el);
        });
        container.querySelectorAll('.field-error-tip').forEach(function (tip) {
            tip.textContent = '';
        });
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
                    var message = labels[score];
                    output.dataset.score = score;
                    if (score < 3) {
                        output.title = '建议 12 位以上或使用随机短语';
                    } else {
                        output.removeAttribute('title');
                    }
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
            var target = event.target;
            if (!target) return;
            if (type !== 'focusin' && (fieldErrors.has(target) || (target.dataset && target.dataset.errorTarget) || (target.classList && target.classList.contains('m-input-error')))) {
                window.clearFieldError(target);
            }
            if (target.matches && target.matches(fieldSelector) && !event.isComposing) {
                queue(target);
            }
        });
    });

    document.addEventListener('compositionstart', function (event) {
        if (event.target && event.target.matches && event.target.matches(fieldSelector)) clear(event.target);
    });

    document.addEventListener('reset', function (event) {
        if (!event.target) return;
        event.target.querySelectorAll(fieldSelector).forEach(clear);
        clearContainerErrors(event.target);
    });

    window.clearPasswordStrength = function (container) {
        if (!container) return;
        container.querySelectorAll(fieldSelector).forEach(clear);
        clearContainerErrors(container);
    };
})();
