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
import { DATA_ENTRIES, DATA_PAGES, DATA_TERMS } from '../../../packages/website/src/data/dataPages';
import { DATA_SOURCE_NOTES } from '../../../packages/website/src/data/dataSourceNotes';
import { DATA_SOURCES } from '../../../packages/website/src/data/dataSources';
import { DOCS_TREE } from '../../../packages/website/src/data/docsTree';
import { FACTS } from '../../../packages/website/src/data/facts';
import { SITE_SHOTS } from '../../../packages/website/src/data/siteShots';
import { fitText } from '../../../packages/website/src/utils/fitText';
import { licenceLead } from '../../../packages/website/src/utils/licenceLead';
import { plainText } from '../../../packages/website/src/utils/plainText';
import { recordParagraphs } from '../../../packages/website/src/utils/recordParagraphs';
import { shortTitle } from '../../../packages/website/src/utils/shortTitle';
import { parseAttributions } from '../../../tools/utils/io/parseAttributions';

const ROOT = resolve(import.meta.dirname, '../../..');
const SITE = resolve(ROOT, 'packages/website/src');
const PARSED = parseAttributions(readFileSync(resolve(ROOT, 'ATTRIBUTIONS.md'), 'utf8'));
/** A text's words, with spacing and the signs of a list or a quotation taken away. */
const words = (text: string) => text.replace(/(^|\s)[->](?=\s)/g, ' ').replace(/\s+/g, '');
/** One spelling for each licence the record or a holder writes in more than one way. */
const sameNames = (licence: string) =>
  licence
    .replace(/CC-BY/g, 'CC BY')
    .replace(/Attribution-NonCommercial-ShareAlike (\d\.\d) International/g, 'CC BY-NC-SA $1')
    .replace(/Attribution (\d\.\d) International/g, 'CC BY $1');
const named = (licence: string) => [
  ...(sameNames(licence).match(/CC BY(?:-[A-Z]{2})*(?: \d\.\d)?(?: IGO)?|CC0/g) ?? []),
  ...(/public domain/i.test(licence) ? ['public domain'] : []),
];

describe('data pages', () => {
  it('print every entry of the record on exactly one page', () => {
    const printed = DATA_PAGES.flatMap((page) => page.entries.map((entry) => entry.id));
    expect([...printed].sort()).toEqual(PARSED.map((entry) => entry.id).sort());
    for (const entry of DATA_ENTRIES) {
      const page = DATA_PAGES.filter((row) => row.entries.includes(entry));
      expect(
        page.map((row) => row.path),
        entry.id,
      ).toEqual([entry.path]);
      expect(entry.href.startsWith(entry.path), entry.id).toBe(true);
    }
  });

  it('read each bullet of the record whole', () => {
    for (const entry of DATA_ENTRIES) {
      const flat = PARSED.find((row) => row.id === entry.id)!.fields;
      expect(Object.keys(entry.record.bullets), entry.id).toEqual(Object.keys(flat));
      for (const [label, text] of Object.entries(flat)) {
        expect(words(entry.record.bullets[label]!), `${entry.id} ${label}`).toBe(words(text));
        expect(words(recordParagraphs(entry.record.bullets[label]!)), `${entry.id} ${label}`).toBe(
          words(text),
        );
      }
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
    const slugs = DATA_PAGES.map((page) => page.slug);
    expect(
      slugs.filter(
        (slug, i) => slug === 'pipeline' || !/^[a-z0-9-]+$/.test(slug) || slugs.indexOf(slug) !== i,
      ),
    ).toEqual([]);
  });

  it('are the rows of the docs tree that have a family, and no others', () => {
    const rows = DOCS_TREE.flatMap((group) => group.pages).filter((page) => page.family);
    expect(rows.map((row) => `${row.path} ${row.title} ${row.status}`)).toEqual(
      DATA_PAGES.map((page) => `${page.path} ${page.title} live`),
    );
  });

  it('print the text an entry points at by name', () => {
    expect(DATA_TERMS.map((term) => term.term)).toEqual(
      expect.arrayContaining(['the CDS terms', "NASA's media guidelines"]),
    );
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

  // The licence of a source is the record's to state. A name of one in these files would be a second copy.
  it('holds no licence name', () => {
    const files = [
      'data/dataFamilies.ts',
      'data/dataSourceNotes.ts',
      'data/dataPages.ts',
      'components/DataEntryRecord.astro',
      'components/Recorded.astro',
      'components/SourceLink.astro',
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

  it('gives the Science page’s table rows entries that exist, and no licence their entries do not state', () => {
    for (const row of DATA_SOURCES) {
      expect(row.entries.length, row.id).toBeGreaterThan(0);
      expect(
        row.entries.filter((id) => !ids.has(id)),
        row.id,
      ).toEqual([]);
      const entries = row.entries.map((id) => DATA_ENTRIES.find((entry) => entry.id === id)!);
      // An entry may state its terms by pointing at another's ("quoted under Gaia DR3").
      const stated = [
        ...entries,
        ...entries.flatMap((entry) =>
          entry.names.map((id) => DATA_ENTRIES.find((e) => e.id === id)!),
        ),
      ]
        .map((entry) => plainText(entry.record.bullets.Licence ?? ''))
        .join(' ');
      expect(
        named(row.licence).filter((name) => !named(stated).includes(name)),
        row.id,
      ).toEqual([]);
      if (/^No licence stated/.test(row.licence))
        expect(stated, row.id).toMatch(
          /Not stated|state none|states no|None stated|No separate licence|no copyright section|authors: none/i,
        );
    }
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

describe('fitText and licenceLead', () => {
  it('end at a sentence where one ends in time, and say so where they cut', () => {
    expect(fitText('One. Two is longer.', 12)).toBe('One.');
    expect(fitText('A clause, then a second clause that runs on', 30)).toBe(
      'A clause, then a second …',
    );
    expect(fitText('He said "a long thing that will not fit here at all" and left', 30)).toBe(
      'He said "a long thing that …"',
    );
  });

  it('give the opening of a licence line and never an open quotation', () => {
    expect(licenceLead('Not stated. The page carries "© Somebody" and no licence.')).toBe(
      'Not stated.',
    );
    expect(licenceLead('CC BY 4.0 ("License: CC Attribution", linking the deed). More.')).toBe(
      'CC BY 4.0 ("License: CC Attribution", linking the deed).',
    );
    expect(
      licenceLead('"Data are under licence X. For details see the terms." Those terms: more.'),
    ).toBe('"Data are under licence X …"');
    for (const entry of DATA_ENTRIES) {
      const lead = licenceLead(entry.record.bullets.Licence!);
      expect(lead.length, entry.id).toBeLessThanOrEqual(120);
      expect((lead.match(/"/g)?.length ?? 0) % 2, entry.id).toBe(0);
      // Every word of the lead is the record's, in the record's order.
      const source = plainText(entry.record.bullets.Licence!);
      expect(
        source.startsWith(lead.replace(/ …"?$|\.$/, '').replace(/\.$/, '')),
        `${entry.id}: ${lead}`,
      ).toBe(true);
    }
  });
});
