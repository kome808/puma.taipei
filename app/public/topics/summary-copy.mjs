export function buildSummaryCopy(title, summary) {
  return `${title.trim()}\n\n${summary}`;
}

export function copyTextFallback(value) {
  const previous = document.activeElement;
  const field = document.createElement('textarea');
  field.value = value;
  field.readOnly = true;
  field.style.cssText = 'position:fixed;left:-10000px;top:0';
  // A modal dialog makes the rest of the document inert, so keep its fallback inside it.
  const host = document.querySelector('dialog[open]') || document.body;
  host.append(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    return document.execCommand('copy');
  } catch { return false; }
  finally {
    field.remove();
    if (previous?.isConnected && typeof previous.focus === 'function') previous.focus({ preventScroll: true });
  }
}
