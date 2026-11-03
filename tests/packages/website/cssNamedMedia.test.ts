/**
 * The website's width breakpoints are named once, in data/media.ts, and a stylesheet writes the name as
 * custom media, `@media (--narrow)` (tools/site/customMedia.ts writes the query in at compile time). A raw
 * `(max-width: 560px)` is a break nobody else lines up with. Height and orientation queries are a section's
 * own and stay raw. An image's `sizes` is not CSS and is not swept.
 */
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cssStatements } from '../../helpers/conventions/cssStatements';
import { walkFiles } from '../../helpers/conventions/walkFiles';

const SITE = 'packages/website/src';
const RAW_WIDTH = /\(\s*(?:(?:min-|max-)?width\s*:|width\s*[<>=]|[\d.]+[a-z]*\s*[<>]=?\s*width)/;

// In flight 2026-11-03: these take new names (`--small-phone`, `--two-up`, `--laptop`), which the running :5800
// dev server rejects until it restarts, as its PostCSS step holds the names it started with. Exact; delete at 0.
const IN_FLIGHT: Readonly<Record<string, number>> = {
  'components/docs/DocsMap/DocsMap.module.css': 1,
  'components/pages/science/MarginSpine/MarginSpine.module.css': 1,
  'components/pages/science/SectionNav/SectionNav.module.css': 1,
  'components/shared/layout/Steps/Steps.module.css': 1,
  'components/site/Footer/Footer.module.css': 3,
  'components/site/Nav/Nav.module.css': 1,
};

const sheets = walkFiles(SITE, ['.css']).map((sheet) => relative(SITE, sheet));

describe('website media queries name their width breakpoints', () => {
  expect(sheets.length).toBeGreaterThan(0);

  it.each(sheets)('%s', (rel) => {
    const raw = cssStatements(readFileSync(`${SITE}/${rel}`, 'utf8'))
      .filter((s) => s.kind === 'block' && s.text.startsWith('@media') && RAW_WIDTH.test(s.text))
      .map((s) => `line ${s.line}: ${s.text}`);
    expect(
      raw.length,
      `${rel} has ${raw.length} raw width query(ies) (${raw.join('; ') || 'none'}); IN_FLIGHT says ` +
        `${IN_FLIGHT[rel] ?? 0}. Write the breakpoint by name, \`@media (--narrow)\`, from MEDIA in ` +
        'packages/website/src/data/media.ts (narrow/wide, phone/tablet, broad, …), `not all and (--broad)` for ' +
        'below one; add a name there only when none fits.',
    ).toBe(IN_FLIGHT[rel] ?? 0);
  });
});
