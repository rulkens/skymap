import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { flagParts } from '../../../packages/website/src/utils/flagParts';

const DOCS = resolve(import.meta.dirname, '../../../packages/website/src/content/docs');

describe('flagParts', () => {
  it('cuts a sentence at a bare double hyphen and at a named flag', () => {
    expect(flagParts('After a bare -- comes --url.')).toEqual([
      { text: 'After a bare ', flag: false },
      { text: '--', flag: true },
      { text: ' comes ', flag: false },
      { text: '--url', flag: true },
      { text: '.', flag: false },
    ]);
  });

  it('leaves hyphens inside a word and a longer run of them alone', () => {
    expect(flagParts('labels--guides and --- stay')).toEqual([
      { text: 'labels--guides and --- stay', flag: false },
    ]);
  });
});

// Typed into a page's prose, a flag is not cut by anything: it has to be in code marks there.
describe('docs prose', () => {
  const pages = readdirSync(DOCS, { recursive: true, encoding: 'utf8' }).filter((name) =>
    name.endsWith('.mdx'),
  );

  it.each(pages)('%s sets every flag as code', (name) => {
    const prose = readFileSync(join(DOCS, name), 'utf8')
      .replace(/^---\n[\s\S]*?\n---/, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`\n]*`/g, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    expect(flagParts(prose).filter((part) => part.flag)).toEqual([]);
  });
});
