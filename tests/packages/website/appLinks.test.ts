/**
 * Every link into the app is an AppLink, so every one opens in a new tab, and each kind has one look: the bare
 * app is OpenApp's button, a view as a control is ViewLink's ring under the view mark. Read from the source, so a
 * new page cannot build an app address into a plain anchor, grow a second launch control, or mark a site page's
 * ring as a view.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '../../../packages/website/src');

/** The files that build an app address themselves, and how many times. */
const ADDRESS_BUILDERS: Record<string, number> = {
  'components/shared/links/AppLink/AppLink.tsx': 1,
  // The copy control's text: an address to paste, not a link.
  'components/shared/links/AddressStrip/AddressStrip.tsx': 1,
  'components/pages/home/Sharing/Sharing.tsx': 1,
  'components/pages/classroom/LinkAnatomy/LinkAnatomy.tsx': 1,
};

const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter((name) => /\.(astro|tsx|mdx)$/.test(name))
  .map((name) => ({
    name: relative(SRC, join(SRC, name)),
    text: readFileSync(join(SRC, name), 'utf8'),
  }));

describe('app links', () => {
  it('only AppLink and the copy controls build an app address', () => {
    const builders: Record<string, number> = {};
    for (const file of files) {
      const count = file.text.match(/appLink\(/g)?.length;
      if (count) builders[file.name] = count;
    }
    expect(builders).toEqual(ADDRESS_BUILDERS);
  });

  it('only OpenApp opens the app with no view', () => {
    const bare = files
      // An opening tag's attributes run to the first `>` that does not end an arrow.
      .filter((file) =>
        [...file.text.matchAll(/<AppLink\b((?:=>|[^>])*)>/g)].some(
          (tag) => !/\bview=/.test(tag[1]!),
        ),
      )
      .map((file) => file.name);
    expect(bare).toEqual(['components/shared/links/OpenApp/OpenApp.tsx']);
  });

  it('only ViewLink puts the view mark on a ring', () => {
    const marked = files.filter((file) => /icon="(view|launch)"/.test(file.text));
    expect(marked).toEqual([]);
    const ringed = files
      .filter((file) => /objLinkClass\(/.test(file.text))
      .map((file) => file.name);
    expect(ringed.sort()).toEqual([
      'components/shared/links/ObjLink/ObjLink.tsx',
      'components/shared/links/ViewLink/ViewLink.tsx',
    ]);
  });
});
