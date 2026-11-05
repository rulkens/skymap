/**
 * The credits and data pages print the licence record through a few small
 * functions, and the landing pages' footer restates nine of its entries in
 * its own words. A function that dropped a word of an acknowledgement, set
 * skymap's own string apart as a holder's, or a footer row left behind when
 * its entry's terms changed, would publish a credit the holder did not ask
 * for; none of that shows up as a build error.
 */
import { describe, expect, it } from 'vitest';

import { DATA_CREDITS, IMAGE_CREDITS } from '../../../packages/website/src/data/credits';
import { DATA_ENTRIES, dataEntry } from '../../../packages/website/src/data/dataPages';
import { liftQuotes } from '../../../packages/website/src/utils/liftQuotes';
import { linkEntryPointers } from '../../../packages/website/src/utils/linkEntryPointers';
import { recordHtml } from '../../../packages/website/src/utils/recordHtml';
import { recordParagraphs } from '../../../packages/website/src/utils/recordParagraphs';
import { licenceNames, unsaidLimits } from './licenceClaims';

/** What stays when quotation marks, block-quote and list marks, stops, spacing and capitals are taken away: the words. */
const words = (text: string) => text.replace(/["\s.,;]|(?<=^|\s)[->](?=\s)/gm, '').toLowerCase();
/** The block quotes `liftQuotes` makes of an entry's bullet. */
const lifted = (id: string, label = 'Attribution') =>
  liftQuotes(recordParagraphs(dataEntry(id).record.bullets[label]!))
    .split('\n\n')
    .filter((block) => block.startsWith('> '))
    .map((block) => block.slice(2));

describe('the record as printed', () => {
  it('sets quotations apart without touching a word of any Licence or Attribution bullet', () => {
    for (const entry of DATA_ENTRIES)
      for (const label of ['Licence', 'Attribution']) {
        const bullet = entry.record.bullets[label]!;
        expect(words(liftQuotes(recordParagraphs(bullet))), `${entry.id} ${label}`).toBe(
          words(bullet),
        );
      }
  });

  it('leaves no Markdown unread in what it prints', () => {
    for (const entry of DATA_ENTRIES) {
      const printed = Object.values(entry.record.bullets)
        .flatMap((bullet) => liftQuotes(recordParagraphs(bullet)).split('\n\n'))
        .map((block) => recordHtml(block.replace(/^>\s?/gm, ''), 'https://example.org'))
        .join('\n')
        .replace(/<code>.*?<\/code>|<[^>]+>/g, '');
      expect(printed.match(/`|\*\*|\]\(|\\\*|&lt;http/), entry.id).toBeNull();
    }
  });

  it('turns every pointer to another entry into a link to an entry that exists', () => {
    const pointers = DATA_ENTRIES.flatMap((entry) =>
      Object.values(entry.record.bullets).flatMap((bullet) => [
        ...bullet.matchAll(/see\s+entry:\s+([a-z0-9-]+)/g),
      ]),
    );
    expect(pointers.length).toBeGreaterThan(10);
    for (const [, id] of pointers) expect(() => dataEntry(id!)).not.toThrow();
    expect(
      linkEntryPointers('terms (see\n  entry: gaia).', (id) => ({
        href: `/${id}/`,
        title: 'Gaia',
      })),
    ).toBe('terms (see [Gaia](/gaia/)).');
  });
});

// Each case is an entry the rule of length (a quotation of 100 characters is a text to print) got wrong.
describe('liftQuotes', () => {
  it('sets apart a quotation that is a sentence of its own, however short', () => {
    expect(lifted('milliquas')[0]).toMatch(/^Please cite as Milliquas v8/);
    expect(lifted('2mrs')).toHaveLength(1);
    expect(lifted('eox')).toHaveLength(2);
    expect(lifted('eox')[0]).toMatch(/^EOxCloudless https:\/\/cloudless\.eox\.at by EOX/);
  });

  it('sets apart the string skymap itself prints, after “Ours:”', () => {
    expect(lifted('mola')).toEqual([
      'MOLA 463 m DEM: NASA/GSFC MGS MOLA team, USGS Astrogeology (public domain).',
    ]);
    expect(lifted('mesh-hubble')).toEqual([
      'NASA, “Hubble Space Telescope (A)” — NASA 3D Resources',
    ]);
    expect(lifted('nasa-blue-marble')).toHaveLength(3);
  });

  it('leaves in its sentence a quotation the sentence runs on from, and a condition of a licence', () => {
    expect(lifted('bailer-jones')).toEqual([]);
    expect(lifted('hoskins-hash')).toEqual([]);
    expect(lifted('npm-dependencies')).toEqual([]);
    // Two quotations joined by "and": no paragraph of one word between two blocks.
    expect(liftQuotes(dataEntry('skadi').record.bullets.Attribution!)).not.toMatch(
      /\n\n\W*and\W*\n\n/i,
    );
  });

  it('never sets apart a string in code marks: skymap’s own manifest line for Gale is not a holder’s words', () => {
    expect(lifted('hirise-gale').join(' ')).not.toMatch(/78-quad/);
    expect(lifted('hirise-gale')).toHaveLength(1);
  });
});

describe('landing-page credits', () => {
  it.each([...IMAGE_CREDITS, ...DATA_CREDITS])(
    '$name states only what its entry does, and reads no freer than its Use',
    (credit) => {
      const { record } = dataEntry(credit.entry);
      const stated = licenceNames(`${record.fields.Licence} ${record.fields.Attribution}`);
      const claims = licenceNames(credit.licence);
      expect(claims.length).toBeGreaterThan(0);
      // "CC BY-NC" in a footer row is met by "CC BY-NC 3.0 IGO" in the record, never by "CC BY 4.0".
      for (const claim of claims)
        expect(
          stated.some((term) => term === claim || term.startsWith(`${claim} `)),
          `${credit.entry}: "${claim}" is not in ${JSON.stringify(stated)}`,
        ).toBe(true);
      expect(unsaidLimits(credit.licence, record.use), credit.entry).toEqual([]);
    },
  );
});
