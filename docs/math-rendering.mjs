/** Typeset explicit equations without making the app depend on the CDN. */
export function renderMath(root = document) {
  if (!globalThis.katex) return;
  for (const node of root.querySelectorAll('[data-tex]')) {
    if (node.querySelector('.katex')) continue;
    globalThis.katex.render(node.dataset.tex, node, {trust: false});
  }
}

if (globalThis.document) {
  if (globalThis.katex) renderMath();
  else document.querySelector('script[data-math-renderer]')
    ?.addEventListener('load', () => renderMath(), {once: true});
}
