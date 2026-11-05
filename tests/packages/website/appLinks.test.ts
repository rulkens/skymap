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

const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter((name) => /\.(astro|tsx|mdx)$/.test(name))
  .map((name) => ({
    name: relative(SRC, join(SRC, name)),
    text: readFileSync(join(SRC, name), 'utf8'),
  }));

describe('app links', () => {
  // A copy control's text goes through appAddress (absolute); appLink is root-relative in a build.
  it('only AppLink builds a link into the app', () => {
    const builders = files.filter((file) => /appLink\(/.test(file.text)).map((file) => file.name);
    expect(builders).toEqual(['components/shared/links/AppLink/AppLink.tsx']);
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
