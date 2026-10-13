const ESCAPES: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;' };
const escape = (text: string) => text.replace(/[<>&]/g, (char) => ESCAPES[char]!);

/**
 * An equation written in a small subset of TeX, as the children of a MathML
 * `<math>` element (components/Formula.astro). Understood: numbers, names (a
 * single letter is a variable, set in italic by the browser; a longer run
 * such as `log` is upright), `_` and `^` with one item or a `{group}`, a
 * prime after an item, round brackets, `\frac{a}{b}`, `\sqrt{a}`,
 * `\text{words}` and `\,` for the thin space after `log`. Every other character is an operator and is typed as
 * itself (`∫`, `×`, `−`). Anything else throws, so a slip fails the build.
 */
export function formulaMathml(source: string): string {
  let at = 0;
  const fail = (what: string): never => {
    throw new Error(`formula "${source}": ${what} at ${at}`);
  };
  const row = (items: string[]) =>
    items.length === 1 ? items[0]! : `<mrow>${items.join('')}</mrow>`;
  const skip = () => {
    while (source[at] === ' ') at += 1;
  };
  // `close` is the character that ends this run of items; none at the top.
  const items = (close?: string): string[] => {
    const out: string[] = [];
    for (skip(); at < source.length && source[at] !== close; skip()) {
      const item = scripted();
      // A sign that follows another operator ("= −0.249") belongs to its number: no space after it.
      const sign = /^<mo>[−+]<\/mo>$/.test(item) && out.at(-1)?.startsWith('<mo>');
      out.push(sign ? item.replace('<mo>', '<mo form="prefix">') : item);
    }
    if (close && source[at] !== close) fail(`no closing ${close}`);
    at += 1;
    return out;
  };
  const group = (): string => {
    skip();
    if (source[at] !== '{') return atom();
    at += 1;
    return row(items('}'));
  };
  const atom = (): string => {
    skip();
    const rest = source.slice(at);
    const number = /^\d+(\.\d+)?/.exec(rest);
    const name = /^\p{L}+/u.exec(rest);
    const command = /^\\([a-z]+|,)/.exec(rest);
    if (number || name) {
      const text = (number ?? name)![0];
      at += text.length;
      return number ? `<mn>${text}</mn>` : `<mi>${text}</mi>`;
    }
    if (command) {
      at += command[0].length;
      if (command[1] === ',') return '<mspace width="0.17em"/>';
      if (command[1] === 'frac') return `<mfrac>${group()}${group()}</mfrac>`;
      if (command[1] === 'sqrt') return `<msqrt>${group()}</msqrt>`;
      if (command[1] === 'text' && source[at] === '{') {
        const end = source.indexOf('}', at);
        const words = source.slice(at + 1, end);
        at = end + 1;
        return `<mtext>${escape(words)}</mtext>`;
      }
      return fail(`unknown command \\${command[1]}`);
    }
    const char = source[at] ?? fail('nothing to read');
    at += 1;
    if (char === '(') return `<mrow><mo>(</mo>${items(')').join('')}<mo>)</mo></mrow>`;
    if ('{}_^)'.includes(char)) return fail(`stray ${char}`);
    return `<mo>${escape(char === '-' ? '−' : char)}</mo>`;
  };
  const scripted = (): string => {
    let base = atom();
    let sub: string | undefined;
    let sup: string | undefined;
    for (;;) {
      if (source[at] === '_' && !sub) {
        at += 1;
        sub = group();
      } else if (source[at] === '^' && !sup) {
        at += 1;
        sup = group();
      } else if (source[at] === '′' && !sub && !sup) {
        at += 1;
        base = `<msup>${base}<mo>′</mo></msup>`;
      } else break;
    }
    if (sub && sup) return `<msubsup>${base}${sub}${sup}</msubsup>`;
    if (sub) return `<msub>${base}${sub}</msub>`;
    return sup ? `<msup>${base}${sup}</msup>` : base;
  };
  return items().join('');
}
