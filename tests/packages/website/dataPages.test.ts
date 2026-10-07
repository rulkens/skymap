/**
 * The data pages are made from ATTRIBUTIONS.md, so what can go wrong is not a
 * wrong licence typed on a page but an entry that falls on no page, a bullet
 * read short, a title a search engine cuts, a hand-written note or table row
 * left behind when the record changes, and a licence name typed into page
 * code after all. tests/tools/utils/io/attributionCoverage.test.ts holds the
 * record itself to the registry; this holds the pages to the record.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DATA_FAMILIES } from '../../../packages/website/src/data/dataFamilies';
import { DATA_ENTRIES, DATA_PAGES, DATA_USES } from '../../../packages/website/src/data/dataPages';
import { DATA_SOURCE_NOTES } from '../../../packages/website/src/data/dataSourceNotes';
import { DATA_SOURCES } from '../../../packages/website/src/data/dataSources';
import { FACTS } from '../../../packages/website/src/data/facts';
import { SITE_SHOTS } from '../../../packages/website/src/data/siteShots';
import { plainText } from '../../../packages/website/src/utils/plainText';
import { shortTitle } from '../../../packages/website/src/utils/shortTitle';
import { ATTRIBUTION_USES } from '../../../tools/utils/io/attributionUses';
import { licenceNames, unsaidLimits } from './licenceClaims';

const ROOT = resolve(import.meta.dirname, '../../..');
const SITE = resolve(ROOT, 'packages/website/src');

describe('data pages', () => {
  it('print every entry of the record on exactly one page', () => {
    const printed = DATA_PAGES.flatMap((page) => page.entries.map((entry) => entry.id));
    expect([...printed].sort()).toEqual(DATA_ENTRIES.map((entry) => entry.id).sort());
    expect(DATA_ENTRIES.length).toBeGreaterThan(90);
    for (const entry of DATA_ENTRIES) {
      const page = DATA_PAGES.filter((row) => row.entries.includes(entry));
      expect(
        page.map((row) => row.path),
        entry.id,
      ).toEqual([entry.path]);
      expect(entry.href.startsWith(entry.path), entry.id).toBe(true);
    }
  });

  it('have a title of their own that fits with the site’s name, a description that fits, and an address that is free', () => {
    const titles = DATA_PAGES.map((page) => page.title);
    expect(titles.filter((title, i) => titles.indexOf(title) !== i)).toEqual([]);
    expect(
      DATA_PAGES.filter((page) => `${page.title} | skymap docs`.length > 60).map(
        (page) => page.title,
      ),
    ).toEqual([]);
    expect(
      DATA_PAGES.filter((page) => !page.description || page.description.length > 155).map(
        (page) => page.slug,
      ),
    ).toEqual([]);
    // Nothing a page opens on is a cut text, and a page of one source opens on a sentence written for it.
    expect(
      DATA_ENTRIES.filter((entry) => /…$|\.\.\.$/.test(entry.description)).map((entry) => entry.id),
    ).toEqual([]);
    expect(
      DATA_ENTRIES.filter((entry) => !DATA_SOURCE_NOTES[entry.id]?.description).map(
        (entry) => entry.id,
      ),
    ).toEqual([]);
    const descriptions = DATA_ENTRIES.map((entry) => entry.description);
    expect(descriptions.filter((text, i) => descriptions.indexOf(text) !== i)).toEqual([]);
    expect(
      DATA_ENTRIES.filter(
        (entry) => entry.description.length > 155 || !/[.!?]$/.test(entry.description),
      ).map((entry) => entry.id),
    ).toEqual([]);
    const slugs = DATA_PAGES.map((page) => page.slug);
    expect(
      slugs.filter(
        (slug, i) => slug === 'pipeline' || !/^[a-z0-9-]+$/.test(slug) || slugs.indexOf(slug) !== i,
      ),
    ).toEqual([]);
  });
});

describe('what is written by hand for the data pages', () => {
  const ids = new Set(DATA_ENTRIES.map((entry) => entry.id));
  const sections = new Set(DATA_ENTRIES.map((entry) => entry.record.section));

  it('names only entries, sections, facts and pictures that exist', () => {
    expect(DATA_FAMILIES.flatMap((family) => family.ids).filter((id) => !ids.has(id))).toEqual([]);
    expect(
      DATA_FAMILIES.flatMap((family) => family.sections).filter((name) => !sections.has(name)),
    ).toEqual([]);
    expect(Object.keys(DATA_SOURCE_NOTES).filter((id) => !ids.has(id))).toEqual([]);
    const notes = Object.values(DATA_SOURCE_NOTES);
    const facts = new Set(FACTS.map((fact) => fact.id));
    expect(notes.flatMap((note) => note.facts ?? []).filter((id) => !facts.has(id))).toEqual([]);
    const shots = new Set(SITE_SHOTS.map((shot) => shot.id));
    expect(
      notes.flatMap((note) => (note.figure ? [note.figure] : [])).filter((id) => !shots.has(id)),
    ).toEqual([]);
  });

  // A thumbnail drawn at a column's width is a blur with no label: the Voyager page had one.
  it('shows only pictures made for a column, with a title and words for a screen reader', () => {
    const poor = Object.entries(DATA_SOURCE_NOTES).filter(([, note]) => {
      const shot = SITE_SHOTS.find((row) => row.id === note.figure);
      // A text column is 552 px wide; the thumbnails' largest file is 240.
      return shot && (Math.max(...shot.widths) < 552 || !shot.title || !shot.alt);
    });
    expect(poor.map(([id]) => id)).toEqual([]);
  });

  // A planet, moon or rover site opened with no date is lit or dark by the hour of the click.
  it('pins the date and time of every view of a body', () => {
    const unpinned = Object.entries(DATA_SOURCE_NOTES)
      .filter(
        ([, note]) => note.view?.to.startsWith('focus=body-') && !/&t=\d{4}-/.test(note.view.to),
      )
      .map(([id]) => id);
    expect(unpinned).toEqual([]);
  });

  // The licence of a source is the record's to state. A name of one in these files would be a second copy.
  it('holds no licence name', () => {
    const files = [
      'data/dataFamilies.ts',
      'data/dataSourceNotes.ts',
      'data/dataPages.ts',
      'components/DataEntryRecord.astro',
      'components/Recorded.astro',
      'components/SourceLink.astro',
      'components/CreditEntry.astro',
      'components/UseLegend.astro',
      'components/UseTerms.astro',
      'pages/docs/credits.astro',
      'pages/docs/data/index.astro',
      'pages/docs/data/[page].astro',
    ];
    const LICENCE =
      /\bCC[ -]?(BY|0)|Creative Commons|public domain|\bMIT\b|\bBSD\b|\bGPL\b|Open Font|copyright|©/i;
    for (const file of files) {
      const code = readFileSync(resolve(SITE, file), 'utf8').replace(
        /\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm,
        '',
      );
      expect(code.match(LICENCE)?.[0], file).toBeUndefined();
    }
  });

  it('gives the Science page’s table rows entries that exist, no licence their entries do not state, and no freer a reading than their Use', () => {
    for (const row of DATA_SOURCES) {
      expect(row.entries.length, row.id).toBeGreaterThan(0);
      expect(
        row.entries.filter((id) => !ids.has(id)),
        row.id,
      ).toEqual([]);
      const entries = DATA_ENTRIES.filter((entry) => row.entries.includes(entry.id));
      const stated = licenceNames(
        entries.map((entry) => plainText(entry.record.bullets.Licence ?? '')).join(' '),
      );
      expect(
        licenceNames(row.licence).filter((name) => !stated.includes(name)),
        row.id,
      ).toEqual([]);
      expect(
        unsaidLimits(
          row.licence,
          entries.flatMap((entry) => entry.record.use),
        ),
        row.id,
      ).toEqual([]);
    }
  });
});

describe('the Use terms', () => {
  it('each have the record’s own one-line meaning, for the legend', () => {
    expect(Object.keys(DATA_USES)).toEqual(Object.keys(ATTRIBUTION_USES));
    for (const meaning of Object.values(DATA_USES)) expect(meaning).toMatch(/^[a-z].{20,}\.$/);
  });
});

describe('the pipeline page', () => {
  it('links only to files the repository has', () => {
    const page = readFileSync(resolve(SITE, 'content/docs/data/pipeline.mdx'), 'utf8');
    const paths = [...page.matchAll(/<Repo path="([^"]+)"/g)].map((match) => match[1]!);
    expect(paths.length).toBeGreaterThan(5);
    expect(paths.filter((path) => !existsSync(resolve(ROOT, path)))).toEqual([]);
  });
});

describe('shortTitle', () => {
  it('keeps a heading that fits and shortens a longer one from its end', () => {
    expect(shortTitle('Gaia DR3')).toBe('Gaia DR3');
    expect(shortTitle('Stars orbiting Sagittarius A\\* (Gillessen et al. 2017)')).toBe(
      'Stars orbiting Sagittarius A*',
    );
    expect(shortTitle('GLADE v2.3, the Galaxy List for the Advanced Detector Era')).toBe(
      'GLADE v2.3',
    );
    expect(
      shortTitle('Columbia Hills and Endeavour crater: HiRISE DTMs and orthophotos (two sites)'),
    ).toBe('Columbia Hills and Endeavour crater');
    expect(
      shortTitle('One two three four five six seven eight nine ten eleven twelve').length,
    ).toBeLessThanOrEqual(46);
  });
});
