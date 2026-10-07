/**
 * The credits page prints the licence record through three small functions,
 * and the landing pages' footer restates nine of its entries in its own
 * words. A function that dropped a word of an acknowledgement, or a footer
 * row left behind when its entry's licence changed, would publish a credit
 * the holder did not ask for; neither shows up as a build error.
 */
import { describe, expect, it } from 'vitest';

import { ATTRIBUTIONS, CREDIT_GROUPS } from '../../../packages/website/src/data/attributions';
import { DATA_CREDITS, IMAGE_CREDITS } from '../../../packages/website/src/data/credits';
import { firstSentence } from '../../../packages/website/src/utils/firstSentence';
import { liftQuotes } from '../../../packages/website/src/utils/liftQuotes';
import { recordHtml } from '../../../packages/website/src/utils/recordHtml';

const entries = CREDIT_GROUPS.flatMap((group) => group.entries);
/** What stays when quotation marks, block-quote marks, stops and spacing are taken away: the words. */
const words = (text: string) => text.replace(/["\s.,;]|(?<=^|\s)>(?=\s)/gm, '');
/** The text of rendered HTML. */
const text = (html: string) => html.replace(/<[^>]+>/g, '');

/** One spelling for each licence the record or a holder writes in more than one way. */
const sameNames = (licence: string) =>
  licence
    .replace(/CC-BY/g, 'CC BY')
    .replace(/Attribution-NonCommercial-ShareAlike (\d\.\d) International/g, 'CC BY-NC-SA $1')
    .replace(/Attribution (\d\.\d) International/g, 'CC BY $1');
/** The licences a line names, and the three things it can say in place of one. */
const stated = (licence: string) => [
  ...(sameNames(licence).match(/CC BY(?:-[A-Z]{2})*(?: \d\.\d)?(?: IGO)?/g) ?? []),
  ...(/public domain/i.test(licence) ? ['public domain'] : []),
  ...(/no licence stated|Not stated|The authors: none/.test(licence) ? ['no licence'] : []),
  ...(/as NASA states|NASA's media guidelines/.test(licence) ? ['NASA’s guidelines'] : []),
];

describe('credits page', () => {
  it('prints every entry of the record once', () => {
    expect(entries.map((entry) => entry.id)).toEqual(ATTRIBUTIONS.map((entry) => entry.id));
  });

  it('reads the whole Attribution bullet of every entry', () => {
    for (const entry of entries) {
      const flat = ATTRIBUTIONS.find((row) => row.id === entry.id)!.fields.Attribution!;
      expect(words(entry.asks), entry.id).toBe(words(flat));
    }
  });

  it('sets quotations apart without touching a word', () => {
    for (const entry of entries)
      expect(words(liftQuotes(entry.asks)), entry.id).toBe(words(entry.asks));
  });

  it('leaves no Markdown unread in what it prints', () => {
    for (const entry of entries) {
      const printed = [entry.name, entry.by, firstSentence(entry.licence), liftQuotes(entry.asks)]
        .map((markdown) => text(recordHtml(markdown, 'https://example.org')))
        .join('\n');
      expect(printed.match(/`|\*\*|\]\(|\\\*|^>|&lt;http/m), entry.id).toBeNull();
    }
  });

  it('cuts a licence at a sentence end, with every quotation closed', () => {
    for (const entry of entries) {
      const short = firstSentence(entry.licence);
      expect(entry.licence.startsWith(short), entry.id).toBe(true);
      expect((short.match(/"/g) ?? []).length % 2, entry.id).toBe(0);
    }
  });
});

describe('landing-page credits', () => {
  it.each([...IMAGE_CREDITS, ...DATA_CREDITS])(
    '$name states only what its entry does',
    (credit) => {
      const entry = ATTRIBUTIONS.find((row) => row.id === credit.entry);
      expect(entry, credit.entry).toBeDefined();
      const record = stated(`${entry!.fields.Licence} ${entry!.fields.Attribution}`);
      const claims = stated(credit.licence);
      expect(claims.length).toBeGreaterThan(0);
      // "CC BY-NC" in a footer row is met by "CC BY-NC 3.0 IGO" in the record, never by "CC BY 4.0".
      for (const claim of claims)
        expect(
          record.some((term) => term === claim || term.startsWith(`${claim} `)),
          `${credit.entry}: "${claim}" is not in ${JSON.stringify(record)}`,
        ).toBe(true);
    },
  );
});
