/**
 * Three kinds of link, each with one look: the bare app is OpenApp's button, a
 * view in the app is a ViewLink (the view mark), a page of the site is the
 * ring under that page's icon. Read from the source, so a new page cannot hand
 * an app address to a page's ring or grow a second launch control.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = 'packages/website/src';

// Feature hands its `href` to a ViewLink.
const VIEW_LINK_TAGS = ['ViewLink', 'Feature'];

/** View addresses that are not a control of their own: file, how many, and why. */
const OTHER_USES: Record<string, number> = {
  // The address shown as text and copied, beside a picture.
  'components/AddressStrip.astro': 2,
  // The whole card is the link, its picture included; the launch drawing follows the name.
  'components/Places.astro': 1,
  // The card's picture repeats the card's ViewLink, hidden from the keyboard and from assistive technology.
  'components/LessonLinks.astro': 1,
};

const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter((name) => name.endsWith('.astro'))
  .map((name) => ({
    name: relative(SRC, join(SRC, name)),
    text: readFileSync(join(SRC, name), 'utf8'),
  }));

/** The tag a call sits in: the nearest `<Name` before it. */
const tagAt = (text: string, index: number) =>
  /<([A-Za-z][\w.]*)[^<]*$/.exec(text.slice(0, index))?.[1];

describe('app links', () => {
  it('only OpenApp launches the app with no view', () => {
    const bare = files.filter((file) => /appLink\(\s*\)/.test(file.text)).map((file) => file.name);
    expect(bare).toEqual(['components/OpenApp.astro']);
  });

  it('an address of a view goes to a ViewLink and to nothing else', () => {
    const other: Record<string, number> = {};
    for (const file of files) {
      for (const match of file.text.matchAll(/appLink\(\s*[^\s)]/g)) {
        if (!VIEW_LINK_TAGS.includes(tagAt(file.text, match.index) ?? ''))
          other[file.name] = (other[file.name] ?? 0) + 1;
      }
    }
    expect(other).toEqual(OTHER_USES);
  });

  it('only ViewLink puts the view mark on a ring', () => {
    const marked = files.filter((file) => /icon="(view|launch)"/.test(file.text)).map((file) => file.name);
    expect(marked).toEqual(['components/ViewLink.astro']);
  });
});
