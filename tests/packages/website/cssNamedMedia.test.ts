/**
 * The website's width breakpoints are named once, in data/media.ts, and a stylesheet writes the name as
 * custom media, `@media (--narrow)` (tools/site/customMedia.ts writes the query in at compile time). A raw
 * `(max-width: 560px)` is a break nobody else lines up with. Height and orientation queries are a section's
 * own and stay raw. An image's `sizes` is not CSS and is not swept.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cssStatements } from '../../helpers/conventions/cssStatements';
import { walkFiles } from '../../helpers/conventions/walkFiles';

const SITE = 'packages/website/src';
const RAW_WIDTH = /\(\s*(?:(?:min-|max-)?width\s*:|width\s*[<>=]|[\d.]+[a-z]*\s*[<>]=?\s*width)/;

const sheets = walkFiles(SITE, ['.css']);

describe('website media queries name their width breakpoints', () => {
  expect(sheets.length).toBeGreaterThan(0);

  it.each(sheets)('%s', (sheet) => {
    const raw = cssStatements(readFileSync(sheet, 'utf8'))
      .filter((s) => s.kind === 'block' && s.text.startsWith('@media') && RAW_WIDTH.test(s.text))
      .map((s) => `line ${s.line}: ${s.text}`);
    expect(
      raw,
      'Write the breakpoint by name, `@media (--narrow)`, from MEDIA in packages/website/src/data/media.ts ' +
        '(narrow/wide, phone/tablet, broad, …), `not all and (--broad)` for below one; add a name there ' +
        'only when none fits.',
    ).toEqual([]);
  });
});
