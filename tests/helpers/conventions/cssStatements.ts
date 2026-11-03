/**
 * The website's CSS sweeps read stylesheets through this rather than a parser package: the site's CSS needs
 * only "what opens a block" (a selector or an at-rule's prelude) and "what is a declaration". Comments go
 * first; a `;` or `{` inside a string or brackets (a data: url, `content: '{'`) splits nothing.
 */
type CssStatement = {
  readonly kind: 'block' | 'declaration';
  readonly text: string;
  readonly line: number;
};

export function cssStatements(css: string): CssStatement[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
  const out: CssStatement[] = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  const push = (kind: CssStatement['kind'], end: number) => {
    const raw = source.slice(start, end);
    const text = raw.trim();
    if (text) {
      const lead = raw.length - raw.trimStart().length;
      out.push({ kind, text, line: source.slice(0, start + lead).split('\n').length });
    }
    start = end + 1;
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (depth === 0 && c === '{') push('block', i);
    else if (depth === 0 && (c === ';' || c === '}')) push('declaration', i);
  }
  return out;
}
