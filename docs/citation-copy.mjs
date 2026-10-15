/** Copy the displayed citation, with a fallback for local HTTP previews. */
export async function copyBibtex(text, clipboard = globalThis.navigator?.clipboard,
  doc = globalThis.document) {
  if (typeof clipboard?.writeText === 'function') {
    await clipboard.writeText(text);
    return;
  }
  const area = doc.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.style.cssText = 'position:fixed;left:-9999px;top:0;';
  doc.body.append(area);
  try {
    area.select();
    if (!doc.execCommand('copy')) {
      throw new Error('Clipboard copy was refused');
    }
  } finally {
    area.remove();
  }
}

const button = globalThis.document?.getElementById('copy-bibtex');
if (button) {
  const status = document.getElementById('citation-copy-status');
  button.addEventListener('click', async () => {
    button.disabled = true;
    status.hidden = true;
    try {
      await copyBibtex(document.getElementById('bibtex-code').textContent);
      status.textContent = 'BibTeX copied.';
    } catch {
      status.textContent = 'Could not copy automatically. Select the BibTeX below to copy it.';
    } finally {
      status.hidden = false;
      button.disabled = false;
      button.focus({preventScroll: true});
    }
  });
}
