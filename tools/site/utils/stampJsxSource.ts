import ts from 'typescript';

/**
 * Writes `data-astro-source-file` and `data-astro-source-loc` on every host
 * element (lower-case tag) of a TSX module, the pair Astro's own dev server
 * writes on `.astro` elements, so a feedback note names the `.tsx` that drew
 * its text. `loc` copies Astro's value: 1-based `line:column` of the position
 * just after the opening tag's `>` (a one-line `<p>` at column 3 reads `n:6`).
 * Text is inserted after the tag name, so the lines keep their numbers.
 */
export function stampJsxSource(code: string, file: string): string {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const inserts: { at: number; text: string }[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName;
      if (ts.isIdentifier(tag) && /^[a-z]/.test(tag.text)) {
        const { line, character } = source.getLineAndCharacterOfPosition(node.end);
        const loc = `${line + 1}:${character + 1}`;
        const text = ` data-astro-source-file="${file}" data-astro-source-loc="${loc}"`;
        inserts.push({ at: tag.end, text });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  // From the end backwards, so an insert never moves the position of one still to do.
  return inserts
    .sort((a, b) => b.at - a.at)
    .reduce((out, { at, text }) => out.slice(0, at) + text + out.slice(at), code);
}
