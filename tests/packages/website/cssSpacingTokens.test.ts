/**
 * The website's margins, paddings and gaps are steps of the spacing scale (`--site-space-*`, styles/site.css),
 * or `--bleed` / `--tap-reach`: one rhythm that grows with the reader's text size. A literal rem, px or em
 * length in one of those properties counts (0 does not). ALLOWED is today's debt per file: exact, and it
 * only ever goes down.
 */
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cssStatements } from '../../helpers/conventions/cssStatements';
import { walkFiles } from '../../helpers/conventions/walkFiles';

const SITE = 'packages/website/src';
const SPACING = /^(margin|padding)(-[a-z-]+)?$|^(row-|column-)?gap$/;
const LENGTH = /(?<![\w.-])-?(\d*\.?\d+)(rem|px|em)(?![\w-])/g;

const ALLOWED: Readonly<Record<string, number>> = {
  'components/docs/CiteCaption/CiteCaption.module.css': 1,
  'components/docs/DocBody/DocBody.module.css': 3,
  'components/docs/DocsMap/DocsMap.module.css': 2,
  'components/docs/DocsNav/DocsNav.module.css': 6,
  'components/docs/DocsSearch/DocsSearch.module.css': 1,
  'components/docs/Links/Links.module.css': 1,
  'components/docs/PageSections/PageSections.module.css': 1,
  'components/docs/RecordText/RecordText.module.css': 1,
  'components/docs/Row/Row.module.css': 1,
  'components/pages/about/AboutHero/AboutHero.module.css': 2,
  'components/pages/domes/ContactForm/ContactClosed.module.css': 1,
  'components/pages/domes/DomeMarks/DomeMarks.module.css': 1,
  'components/pages/domes/EarthRemark/EarthRemark.module.css': 1,
  'components/pages/domes/LicenceTable/LicenceTable.module.css': 3,
  'components/pages/features/DesktopSpread/DesktopSpread.module.css': 1,
  'components/pages/features/FeatureGallery/FeatureGallery.module.css': 3,
  'components/pages/features/FilmClock/FilmClock.module.css': 2,
  'components/pages/features/LinkSpread/LinkSpread.module.css': 3,
  'components/pages/home/Flight/Intro.module.css': 2,
  'components/pages/home/Flight/Spine.module.css': 3,
  'components/pages/home/Flight/Stops.module.css': 1,
  'components/pages/home/Places/Places.module.css': 1,
  'components/pages/home/Screens/Screens.module.css': 1,
  'components/pages/home/Sharing/Sharing.module.css': 5,
  'components/pages/home/Stories/Stories.module.css': 4,
  'components/pages/science/MarginSpine/MarginSpine.module.css': 1,
  'components/shared/media/PictureBand/PictureBand.module.css': 3,
  'components/shared/media/ShotCaption/ShotCaption.module.css': 1,
  'components/site/Footer/Footer.module.css': 3,
  'components/site/Nav/Nav.module.css': 3,
  'dev/review/ModeSwitch/ModeSwitch.module.css': 1,
  'dev/review/ReviewPage/ReviewPage.module.css': 2,
  'layouts/DocsLayout/DocsLayout.module.css': 3,
  'styles/ring.module.css': 3,
  'styles/site.css': 2,
};

const sheets = walkFiles(SITE, ['.css']).map((m) => relative(SITE, m));

describe('website margins, paddings and gaps use the spacing tokens', () => {
  expect(sheets.length).toBeGreaterThan(0);

  it.each(sheets)('%s', (rel) => {
    const found = cssStatements(readFileSync(`${SITE}/${rel}`, 'utf8')).flatMap((s) => {
      const decl = s.kind === 'declaration' && /^([\w-]+)\s*:([\s\S]*)$/.exec(s.text);
      if (!decl || !SPACING.test(decl[1]!)) return [];
      return [...decl[2]!.matchAll(LENGTH)]
        .filter((m) => Number(m[1]) !== 0)
        .map((m) => `${decl[1]}: ${m[0]}`);
    });
    const budget = ALLOWED[rel] ?? 0;
    expect(
      found.length,
      `${rel} spaces with ${found.length} literal length(s) (${found.join(', ') || 'none'}); ALLOWED says ${budget}. ` +
        'Over: use a step, `var(--site-space-m)` (3xs … 3xl, styles/site.css), `var(--bleed)` or `var(--tap-reach)`. ' +
        `Under: lower the row to ${found.length} in the same commit (delete it at 0).`,
    ).toBe(budget);
  });

  it('ALLOWED names only stylesheets that exist', () => {
    expect(Object.keys(ALLOWED).filter((rel) => !sheets.includes(rel))).toEqual([]);
  });
});
