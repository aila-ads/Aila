/**
 * Markdown editing helpers for the Writer editor. Changes go through the
 * browser's own text editing (execCommand insertText) so Undo and Redo keep
 * working; setRangeText is the fallback where that is unavailable.
 */

export function insertText(textarea: HTMLTextAreaElement, start: number, end: number, text: string, select?: [number, number]) {
  textarea.focus();
  textarea.setSelectionRange(start, end);

  let inserted = false;

  try {
    inserted = typeof document.execCommand === 'function' && document.execCommand('insertText', false, text);
  } catch {
    inserted = false;
  }

  if (!inserted) {
    textarea.setRangeText(text, start, end, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  if (select) {
    textarea.setSelectionRange(select[0], select[1]);
  }
}

/** Wraps the selection, e.g. **bold**; with nothing selected, inserts a placeholder and selects it. */
export function wrapSelection(textarea: HTMLTextAreaElement, before: string, after: string, placeholder: string) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const selected = value.slice(start, end) || placeholder;
  insertText(textarea, start, end, `${before}${selected}${after}`, [start + before.length, start + before.length + selected.length]);
}

/** Puts a prefix at the start of every selected line, e.g. "- " or "## ". Existing heading marks are replaced. */
export function prefixLines(textarea: HTMLTextAreaElement, prefix: string | ((index: number) => string)) {
  const { selectionStart, selectionEnd, value } = textarea;
  const start = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const endBreak = value.indexOf('\n', selectionEnd);
  const end = endBreak === -1 ? value.length : endBreak;
  const lines = value.slice(start, end).split('\n');
  const replaced = lines
    .map((line, index) => {
      const mark = typeof prefix === 'function' ? prefix(index) : prefix;
      const bare = mark.startsWith('#') ? line.replace(/^#{1,6}\s+/, '') : line;
      return `${mark}${bare}`;
    })
    .join('\n');
  insertText(textarea, start, end, replaced, [start, start + replaced.length]);
}

/** A Markdown link around the selection; the address is selected for typing. */
export function insertLink(textarea: HTMLTextAreaElement) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const label = value.slice(start, end) || 'link text';
  const url = 'https://';
  const text = `[${label}](${url})`;
  const urlStart = start + label.length + 3;
  insertText(textarea, start, end, text, [urlStart, urlStart + url.length]);
}

/** Joins inserted text to what is before it with a paragraph break where needed. */
export function joinBlock(before: string, text: string): string {
  if (!before || /\n\s*$/.test(before)) return text;
  return `\n\n${text}`;
}
