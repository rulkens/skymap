const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escape = (text: string): string => text.replace(/[&<>"]/g, (char) => ESCAPES[char]!);

// Code first: nothing inside a code span is read as Markdown.
const INLINE =
  /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|<(https?:\/\/[^>\s]+)>|\*\*([^*]+)\*\*|\\([*_`\\])/g;

function inline(text: string, base: string): string {
  let html = '';
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const [whole, code, label, href, bare, bold, escaped] = match;
    html += escape(text.slice(last, match.index));
    if (code !== undefined) html += `<code>${escape(code)}</code>`;
    // A link written relative to the repository's root is a file of the repository.
    else if (label !== undefined && href !== undefined)
      html += `<a href="${escape(/^https?:/.test(href) ? href : `${base}/${href}`)}">${inline(label, base)}</a>`;
    else if (bare !== undefined) html += `<a href="${escape(bare)}">${escape(bare)}</a>`;
    else if (bold !== undefined) html += `<strong>${inline(bold, base)}</strong>`;
    else html += escape(escaped ?? '');
    last = match.index + whole.length;
  }
  return html + escape(text.slice(last));
}

/**
 * The Markdown the licence record is written in, as HTML: paragraphs, block
 * quotes, code, links and bold. The record's words are printed as they stand,
 * so this renders and never rewrites. `base` is where a link relative to the
 * repository's root points. With `phrase` the text is one run with no
 * paragraph around it, for a heading or a sentence.
 */
export function recordHtml(markdown: string, base: string, phrase = false): string {
  if (phrase) return inline(markdown.replace(/\s+/g, ' ').trim(), base);
  return markdown
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const quote = block.startsWith('>');
      const text = block.replace(/^>\s?/gm, '').replace(/\s+/g, ' ').trim();
      return quote
        ? `<blockquote><p>${inline(text, base)}</p></blockquote>`
        : `<p>${inline(text, base)}</p>`;
    })
    .join('');
}
