/**
 * MarkdownService -- markdown to HTML via marked.js
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

    function highlight(container) {
        if (!container || typeof hljs === 'undefined') return;
        container.querySelectorAll('pre code').forEach((block) => {
            block.removeAttribute('data-highlighted');
            hljs.highlightElement(block);
        });
    }

    function escapeHTML(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    return { render, escapeHTML, highlight };
})();