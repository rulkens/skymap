import { formatDate } from './formatDate';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escape = (text: string): string => text.replace(/[&<>"]/g, (char) => ESCAPES[char]!);
// The record's own signs, said in the site's way: a step of a chain in words, a date as the house style writes it.
const words = (text: string): string =>
  escape(text.replace(/ → /g, ', then ').replace(/\b\d{4}-\d{2}-\d{2}\b/g, formatDate));

// Code first: nothing inside a code span is read as Markdown.
const INLINE =
  /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|<(https?:\/\/[^>\s]+)>|\*\*([^*]+)\*\*|\\([*_`\\])/g;

/**
 * One paragraph of the Markdown the licence record is written in, as the HTML
 * inside it: code, links and bold. The record's words are printed as they
 * stand, so this renders and never rewrites. A link to an address or to a
 * path of this site is kept; any other is a file of the repository, under `base`.
 */
export function recordHtml(markdown: string, base: string): string {
  const text = markdown.replace(/\s+/g, ' ').trim();
  let html = '';
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const [whole, code, label, href, bare, bold, escaped] = match;
    html += words(text.slice(last, match.index));
    if (code !== undefined) html += `<code>${escape(code)}</code>`;
    else if (label !== undefined && href !== undefined)
      html += `<a href="${escape(/^(https?:|\/)/.test(href) ? href : `${base}/${href}`)}">${recordHtml(label, base)}</a>`;
    else if (bare !== undefined) html += `<a href="${escape(bare)}">${escape(bare)}</a>`;
    else if (bold !== undefined) html += `<strong>${recordHtml(bold, base)}</strong>`;
    else html += escape(escaped ?? '');
    last = match.index + whole.length;
  }
  return html + words(text.slice(last));
}
