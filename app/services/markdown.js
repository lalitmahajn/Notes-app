/**
 * MarkdownService — markdown → HTML via marked.js
 */
const MarkdownService = (() => {
    let ready = false;

    function init() {
        if (typeof marked !== 'undefined' && !ready) {
            marked.setOptions({ breaks: true, gfm: true });
            ready = true;
        }
    }

    function render(md) {
        init();
        if (!ready) return escapeHTML(md);
        try { return marked.parse(md || ''); }
        catch { return escapeHTML(md); }
    }

    function escapeHTML(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    return { render, escapeHTML };
})();
